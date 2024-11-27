import { ZodSchema } from "zod";

export type RuntimeDefaultProperties = {
  agentId: string;
  companyId: string;
  clientId: string;
  messageId: string;
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
