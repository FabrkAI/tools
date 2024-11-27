import { Request, Response } from "express";
import { RuntimeDefaultProperties } from "../../openAi/openAi.types";
import { basicWebCrawler } from "../../tools/webScraping";

export const testTool = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const runtimeTestData: RuntimeDefaultProperties = {
      messageId: "testMessageId",
      clientId: "testClientId",
      companyId: "testCompanyId",
      agentId: "testAgentId",
    };

    const testUrl = "https://www.nature.com/articles/d41586-024-03841-0";

    const toolOutput = await basicWebCrawler?.function?.function({
      params: { url: testUrl },
      metadata: runtimeTestData,
    });

    return res.status(200).json({
      data: toolOutput,
    });
  } catch (error: any) {
    console.log(error);
    return res.status(422).json({ message: error.message });
  }
};
