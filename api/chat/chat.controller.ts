import { Request, Response } from "express";
import { respondToMessage } from "../../openAi/openAi.service";
import { basicWebCrawler } from "../../tools/webScraping";

export const testChat = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const url = "https://www.nature.com/articles/d41586-024-03841-0";
    const url2 = "https://www.oranlooney.com/post/genji-ko/";
    const message = `Find this article and summarize it for me: ${url2} `;

    const instructions =
      "You are a web scraping agent. You can get the html and content of a web page. Help the user get details about web pages.";

    const response = await respondToMessage({
      name: "test web scraping agent",
      instructions,
      tools: [basicWebCrawler],
      message: {
        content: message,
        role: "user",
      },
    });

    return res.status(200).json({
      data: response,
    });
  } catch (error: any) {
    console.log(error);
    return res.status(422).json({ message: error.message });
  }
};
