import OpenAI from "openai";
import {
  ImageFileContentBlock,
  MessageContent,
  TextContentBlock,
} from "openai/resources/beta/threads/messages";
import { ZodSchema } from "zod";

export type RuntimeDefaultProperties = {
  agentId: string;
  companyId: string;
  clientId: string;
  messageId: string;
};

export type AgentDefaultProperties = {
  agentId?: string;
  companyId?: string;
  clientId?: string;
  messageId?: string;
};

export enum ToolType {
  function = "function",
  file_search = "file_search",
  code_interpreter = "code_interpreter",
  api_call = "api_call",
}

export type AdaptedFunctionTool = {
  type: ToolType;
  function?: {
    name: string;
    function: ({
      params,
      metadata,
      defaults,
    }: {
      params: any;
      metadata: RuntimeDefaultProperties;
      defaults?: any;
    }) => any;
    description: string;
    parse?: (input: string) => any;
    parameters?: any;
  };
};

export function zodParseJSON<T>(schema: ZodSchema<T>) {
  return (input: string): T => schema.parse(JSON.parse(input));
}

export enum EngineName {
  GPT4o = "gpt-4o",
  GPT4 = "gpt-4-0613",
  Turbo = "gpt-3.5-turbo",
  Vision = "gpt-4-vision-preview",
  GPT4Nov = "gpt-4-1106-preview",
  Embedding = "text-embedding-ada-002",
  Whisper1 = "whisper-1",
  DallE3 = "dall-e-3",
}

export function isMessages(
  messages:
    | OpenAI.Beta.Threads.Runs.Run
    | OpenAI.Beta.Threads.Messages.Message[]
): messages is OpenAI.Beta.Threads.Messages.Message[] {
  return (
    (messages as OpenAI.Beta.Threads.Messages.Message[]).length !== undefined
  );
}

export function isTextContent(
  content: MessageContent | ImageFileContentBlock
): content is TextContentBlock {
  return (content as TextContentBlock).text !== undefined;
}
