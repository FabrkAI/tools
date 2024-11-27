import OpenAI from "openai";
import { AssistantStream } from "openai/lib/AssistantStream";
import {
  RunnableFunctionWithoutParse,
  RunnableFunctionWithParse,
} from "openai/lib/RunnableFunction";
import { ChatCompletionMessageParam } from "openai/resources";
import { MessageCreateParams } from "openai/resources/beta/threads/messages";
import { OPENAI_KEY } from "../envVars";
import {
  AdaptedFunctionTool,
  AgentDefaultProperties,
  EngineName,
  isMessages,
  isTextContent,
  RuntimeDefaultProperties,
} from "./openAi.types";

const configuration = {
  apiKey: OPENAI_KEY,
};

const openAiClient = new OpenAI(configuration);

function hasParse<T extends object>(
  tool: RunnableFunctionWithoutParse | RunnableFunctionWithParse<T>
): tool is RunnableFunctionWithParse<T> {
  return (tool as RunnableFunctionWithParse<T>).parse !== undefined;
}

function handleToolNotFound(
  toolCall: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall
) {
  console.log("Tool not found:", toolCall.function.name);
  return {
    tool_call_id: toolCall.id,
    output: `Tool not found: ${toolCall.function.name}`,
  };
}

function findTool(
  toolFunction: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall["function"],
  assistantTools: AdaptedFunctionTool[]
): AdaptedFunctionTool | null {
  const tool = assistantTools.find(
    (t) => t.function?.name === toolFunction.name
  );
  if (!tool) {
    console.log("Tool not found:", toolFunction.name);
    return null;
  }
  return tool;
}

function parseToolArguments(tool: AdaptedFunctionTool, toolArguments: any) {
  if (hasParse(tool?.function as any) && tool?.function?.parse) {
    return tool.function.parse(toolArguments);
  }
  return toolArguments;
}

async function executeTool(tool: AdaptedFunctionTool, args: any) {
  const rawOutput = await tool.function?.function(args);

  if (!rawOutput) {
    return `No output from tool: ${tool.function?.name}`;
  }
  return rawOutput;
}

function handleToolOutput(
  toolCallId: string,
  toolName: string | undefined,
  rawOutput: any
) {
  try {
    if (!rawOutput) {
      return {
        tool_call_id: toolCallId,
        output: `No output from tool: ${toolName}`,
      };
    }

    const output =
      typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);

    return {
      tool_call_id: toolCallId,
      output,
    };
  } catch (error: any) {
    return {
      tool_call_id: toolCallId,
      output: `Error processing tool output: ${error.message}`,
    };
  }
}

async function submitToolOutputs(
  openAiClient: OpenAI,
  threadId: string,
  runId: string,
  toolOutputs: {
    tool_call_id: string;
    output: string;
  }[],
  eventHandler?: any
): Promise<OpenAI.Beta.Threads.Runs.Run | AssistantStream> {
  try {
    const toolOutputData = { tool_outputs: await Promise.all(toolOutputs) };

    if (eventHandler) {
      const stream = openAiClient.beta.threads.runs.submitToolOutputsStream(
        threadId,
        runId,
        toolOutputData
      );

      for await (const event of stream) {
        eventHandler.emit("event", event);
      }

      return stream; // Return the last event or run object from the stream.
    } else {
      return await openAiClient.beta.threads.runs.submitToolOutputsAndPoll(
        threadId,
        runId,
        toolOutputData
      );
    }
  } catch (error: any) {
    console.log("Error submitting tool outputs:", error);
    throw new Error(`Error submitting tool outputs: ${error.message}`);
  }
}

async function handleToolCall(
  toolCall: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall,
  assistantTools: AdaptedFunctionTool[]
) {
  const tool = findTool(toolCall.function, assistantTools);

  if (!tool) {
    return handleToolNotFound(toolCall);
  }

  console.log("Found tool:", toolCall.function.name, tool?.function?.name);

  const args = parseToolArguments(tool, toolCall.function.arguments);
  const rawOutput = await executeTool(tool, args);

  return handleToolOutput(toolCall.id, tool.function?.name, rawOutput);
}

function handleError(error: any) {
  console.log("Error processing tool calls in error handler:", error);
  throw new Error(`Error processing tool calls: ${error.message}`);
}

async function processToolCalls(
  toolCalls: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall[],
  assistantTools: AdaptedFunctionTool[]
) {
  try {
    const results = await Promise.all(
      toolCalls.map(async (toolCall) => {
        return await handleToolCall(toolCall, assistantTools);
      })
    );
    return results;
  } catch (error: any) {
    console.log("Error processing tool calls:", error);
    handleError(error);
  }
}

async function submitNoToolsResponse(
  openAiClient: OpenAI,
  threadId: string,
  runId: string,
  toolCallId: string,
  eventHandler?: any
): Promise<OpenAI.Beta.Threads.Runs.Run | AssistantStream> {
  if (eventHandler) {
    const stream = openAiClient.beta.threads.runs.submitToolOutputsStream(
      threadId,
      runId,
      {
        tool_outputs: [
          {
            tool_call_id: toolCallId,
            output: "No tools found for assistant.",
          },
        ],
      }
    );

    if (eventHandler) {
      for await (const event of stream) {
        eventHandler.emit("event", event);
      }
    }

    return stream;
  } else {
    return await openAiClient.beta.threads.runs.submitToolOutputsAndPoll(
      threadId,
      runId,
      {
        tool_outputs: [
          {
            tool_call_id: toolCallId,
            output: "No tools found for assistant.",
          },
        ],
      }
    );
  }
}

async function handleRequiresAction(
  run: OpenAI.Beta.Threads.Runs.Run,
  threadId: string,
  assistantId: string,
  tools: AdaptedFunctionTool[],
  metadata?: RuntimeDefaultProperties
): Promise<
  OpenAI.Beta.Threads.Messages.Message[] | OpenAI.Beta.Threads.Runs.Run
> {
  try {
    let updatedRun: OpenAI.Beta.Threads.Runs.Run | AssistantStream = run;

    // Check if there are tools that require outputs
    if (
      run.required_action &&
      run.required_action.submit_tool_outputs &&
      run.required_action.submit_tool_outputs.tool_calls
    ) {
      if (!tools) {
        updatedRun = await submitNoToolsResponse(
          openAiClient,
          threadId,
          run.id,
          run.required_action.submit_tool_outputs.tool_calls[0].id
        );
      } else {
        const toolOutputs = await processToolCalls(
          run.required_action.submit_tool_outputs.tool_calls,
          tools
        );

        // Submit all tool outputs at once after collecting them in a list
        if (toolOutputs && toolOutputs?.length > 0) {
          updatedRun = await submitToolOutputs(
            openAiClient,
            threadId,
            run.id,
            toolOutputs
          );
        } else {
          updatedRun = await submitNoToolsResponse(
            openAiClient,
            threadId,
            run.id,
            run.required_action.submit_tool_outputs.tool_calls[0].id
          );
        }
      }
    }
    // Post-process the run status without streaming
    return handleRunStatusWithoutStream(
      updatedRun as OpenAI.Beta.Threads.Runs.Run,
      threadId,
      assistantId,
      tools,
      metadata
    );
  } catch (error: any) {
    console.log("Error handling requires action:", error.message);
    throw Error(error.message);
  }
}

async function handleRunStatusWithoutStream(
  run: OpenAI.Beta.Threads.Runs.Run,
  threadId: string,
  assistantId: string,
  tools: AdaptedFunctionTool[],
  metadata?: RuntimeDefaultProperties
): Promise<
  OpenAI.Beta.Threads.Messages.Message[] | OpenAI.Beta.Threads.Runs.Run
> {
  try {
    // Check if the run is completed
    if (run.status === "completed") {
      let messages = await openAiClient.beta.threads.messages.list(threadId);

      return messages.data;
    } else if (run.status === "requires_action") {
      return await handleRequiresAction(
        run,
        threadId,
        assistantId,
        tools,
        metadata
      );
    } else if (run.status === "failed") {
      return run;
    } else {
      return handleRunStatusWithoutStream(
        run,
        threadId,
        assistantId,
        tools,
        metadata
      );
    }
  } catch (error: any) {
    console.log("Error handling run without stream:", error);
    throw Error(error.message);
  }
}

async function runThread({
  threadId,
  assistantId,
  metadata,
  additional_instructions,
}: {
  threadId: string;
  assistantId: string;
  metadata?: RuntimeDefaultProperties;
  additional_instructions?: string;
}) {
  let run = await openAiClient.beta.threads.runs.createAndPoll(threadId, {
    assistant_id: assistantId,
    ...(metadata && { metadata }),
    ...(additional_instructions && { additional_instructions }),
  });

  return run;
}

async function createAssistant({
  name,
  instructions,
  tools,
  tool_resources,
  metadata,
}: {
  name: string;
  instructions: string;
  metadata?: AgentDefaultProperties;
  tools?: AdaptedFunctionTool[];
  tool_resources?: OpenAI.Beta.Assistants.AssistantCreateParams.ToolResources;
}) {
  const assistant = openAiClient.beta.assistants.create({
    name,
    instructions,
    ...(tools && {
      tools: [
        ...(tool_resources && tool_resources.file_search
          ? [{ type: "file_search" }]
          : []),
        ...(tool_resources && tool_resources.code_interpreter
          ? [{ type: "code_interpreter" }]
          : []),
        ...((tools || []) as any),
      ],
    }),
    ...(tool_resources && { tool_resources }),
    model: EngineName.GPT4o,
    ...(metadata && { metadata }),
  });

  return assistant;
}

// You can only update the metadata and tool resources of a thread.  https://platform.openai.com/docs/api-reference/threads/modifyThread
async function updateThread(
  threadId: string,
  metadata?: RuntimeDefaultProperties,
  tool_resources?: object
) {
  const thread = await openAiClient.beta.threads.update(threadId, {
    ...(metadata && { metadata }),
    ...(tool_resources && { tool_resources }),
  });
  return thread;
}

async function createThreadWithMessages({
  message,
  messages,
  threadId,
  metadata,
}: {
  message: MessageCreateParams | ChatCompletionMessageParam;
  messages?: OpenAI.Beta.Threads.Messages.MessageCreateParams[];
  threadId?: string;
  metadata?: RuntimeDefaultProperties;
}): Promise<string> {
  let messageWithAttachment = {
    ...message,
  } as OpenAI.Beta.Threads.Messages.MessageCreateParams;

  const messageList = messages
    ? [...messages, messageWithAttachment]
    : [messageWithAttachment];

  let generatedThreadId = threadId || "";

  if (threadId) {
    if (messages) {
      for (const message of messageList) {
        await openAiClient.beta.threads.messages.create(threadId, message);
      }
    } else {
      await openAiClient.beta.threads.messages.create(
        threadId,
        messageWithAttachment
      );
    }
  } else {
    const t = await openAiClient.beta.threads.create({
      messages: messageList,
    });
    generatedThreadId = t.id;
  }

  if (metadata) {
    await updateThread(generatedThreadId, metadata);
  }

  return generatedThreadId;
}

async function gptRespondToMessageWithFunctions({
  threadId,
  assistantId,
  metadata,
  tools,
  additionalInstructions,
}: {
  threadId: string;
  assistantId: string;
  tools: AdaptedFunctionTool[];
  additionalInstructions?: string;
  metadata?: RuntimeDefaultProperties;
}): Promise<{
  content: string | null;
  run: OpenAI.Beta.Threads.Runs.Run | AssistantStream;
} | null> {
  try {
    const run = await runThread({
      threadId,
      assistantId: assistantId,
      ...(metadata && { metadata }),
      ...(additionalInstructions && {
        additional_instructions: additionalInstructions,
      }),
    });

    const response = await handleRunStatusWithoutStream(
      run,
      threadId,
      assistantId,
      tools,
      metadata
    );

    const content = isMessages(response) ? response[0].content[0] : null;

    const finalContent =
      content && isTextContent(content) ? content.text.value : null;

    return {
      content: finalContent,
      run,
    };
  } catch (error) {
    console.log("Error processing message in gpt respond:", error);
    return null;
  }
}

export async function respondToMessage({
  name,
  instructions,
  tools,
  message,
  metadata,
}: {
  name: string;
  instructions: string;
  tools: AdaptedFunctionTool[];
  message: MessageCreateParams;
  metadata?: RuntimeDefaultProperties;
}) {
  const assistantId = await createAssistant({
    name,
    instructions,
    tools,
  });

  const thread = await createThreadWithMessages({
    message,
  });

  const response = await gptRespondToMessageWithFunctions({
    threadId: thread,
    assistantId: assistantId.id,
    tools,
    ...(metadata && { metadata }),
  });
  return response;
}
