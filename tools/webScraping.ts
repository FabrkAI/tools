import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import { ENV } from "../envVars";
import {
  AdaptedFunctionTool,
  RuntimeDefaultProperties,
  ToolType,
  zodParseJSON,
} from "../openAi/openAi.types";
import zodToJsonSchema from "zod-to-json-schema";
import { z } from "zod";
import { JSONSchema } from "openai/lib/jsonschema";

const scrapeUrl = z.object({
  params: z.object({
    url: z.string(),
  }),
});

function cleanAndDeduplicateText(textArray?: string[]): string {
  if (!textArray) {
    return "";
  }
  // Concatenate all text elements
  const concatenatedText = textArray.join(" ");

  // Remove new lines and extra whitespace
  const cleanedText = concatenatedText.replace(/\s+/g, " ").trim();

  // Split text into words/phrases and deduplicate
  const uniqueText = Array.from(new Set(cleanedText.split(" ")));

  // Join the deduplicated text back into a single string
  return uniqueText.join(" ");
}

async function parseHtmlContent(htmlContent: string): Promise<string> {
  const $ = cheerio.load(htmlContent);

  // Collect all visible text elements
  const textElements: string[] = [];

  $("body *").each((_, element) => {
    const $element = $(element);
    // Check if the element is visible
    const isVisible =
      $element.css("display") !== "none" &&
      $element.css("visibility") !== "hidden";
    if (isVisible) {
      const text = $element.text().trim();
      if (text) {
        textElements.push(text);
      }
    }
  });

  const cleanedText = cleanAndDeduplicateText(textElements);

  return cleanedText.substring(0, 5000);
}

async function createBrowser() {
  return await puppeteer.launch({
    headless: true,
    // Add the executable path for the heroku environment
    ...(ENV === "production" && {
      executablePath: "/app/.chrome-for-testing/chrome-linux64/chrome",
    }),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
    ],
  });
}

async function crawlUrl({
  params,
  metadata,
}: {
  params: {
    url: string;
  };
  metadata: RuntimeDefaultProperties;
}) {
  const browser = await createBrowser();

  const page = await browser.newPage();

  try {
    await page.goto(params.url, {
      waitUntil: "networkidle2",
    });

    const content = await page.content();

    const parsed = await parseHtmlContent(content);

    await browser.close();

    return parsed;
  } catch (error) {
    console.error("Error getting auth ID:", error);
    await browser.close();
    throw error;
  }
}

export const basicWebCrawler: AdaptedFunctionTool = {
  type: ToolType.function,
  function: {
    function: crawlUrl,
    parse: zodParseJSON(scrapeUrl),
    parameters: zodToJsonSchema(scrapeUrl) as JSONSchema,
    description:
      "Crawl a webpage and return the HTML content and the visible text content.",
    name: "crawlUrl",
  },
};
