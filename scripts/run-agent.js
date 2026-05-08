import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimizeShoppingList } from "../src/optimizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const defaultScrapedPath = path.join(rootDir, "data", "scraped_deals.json");
const defaultOutputPath = path.join(rootDir, "data", "optimized_list.json");

export async function runShoppingAgent({
  scrapedData,
  wantedItems = ["chicken breast", "milk", "eggs", "bananas", "rice", "yogurt"],
  mode = "cheapest",
  outputPath = defaultOutputPath
} = {}) {
  const deals = scrapedData || JSON.parse(await fs.readFile(defaultScrapedPath, "utf8"));
  const optimized = process.env.ANTHROPIC_API_KEY
    ? await optimizeWithClaudeTools(deals, wantedItems).catch((error) => {
      console.warn(`Claude optimization failed, using local optimizer: ${error.message}`);
      return optimizeShoppingList(deals, wantedItems, { mode });
    })
    : optimizeShoppingList(deals, wantedItems, { mode });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(optimized, null, 2));
  return optimized;
}

async function optimizeWithClaudeTools(scrapedData, userWantedItems) {
  const tool = {
    name: "optimizeShoppingList",
    description: "Find the cheapest grocery path by normalizing deal prices to comparable units, grouping winning items by store, and estimating savings versus market averages.",
    input_schema: {
      type: "object",
      properties: {
        scrapedData: { type: "array", items: { type: "object" } },
        userWantedItems: { type: "array", items: { type: "string" } }
      },
      required: ["scrapedData", "userWantedItems"]
    }
  };

  const first = await anthropicMessages({
    model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest",
    max_tokens: 1200,
    tools: [tool],
    tool_choice: { type: "tool", name: "optimizeShoppingList" },
    messages: [
      {
        role: "user",
        content: `Optimize this Oakville grocery list. Use the tool exactly once.\nWanted items: ${JSON.stringify(userWantedItems)}\nScraped flyer data: ${JSON.stringify(scrapedData)}`
      }
    ]
  });

  const toolUse = first.content?.find((block) => block.type === "tool_use");
  if (!toolUse) return optimizeShoppingList(scrapedData, userWantedItems);

  const toolResult = optimizeShoppingList(toolUse.input.scrapedData, toolUse.input.userWantedItems);
  const second = await anthropicMessages({
    model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest",
    max_tokens: 1600,
    tools: [tool],
    messages: [
      {
        role: "user",
        content: `Optimize this Oakville grocery list. Return only strict JSON.\nWanted items: ${JSON.stringify(userWantedItems)}`
      },
      {
        role: "assistant",
        content: first.content
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(toolResult)
          }
        ]
      }
    ]
  });

  const text = second.content?.filter((block) => block.type === "text").map((block) => block.text).join("\n") || "";
  return extractJson(text) || toolResult;
}

async function anthropicMessages(body) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runShoppingAgent().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
