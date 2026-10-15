import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { stripFalseHandoffClaims, type PriorMessage } from "./escalation";
import { executeSupportTool, supportTools } from "./tools";

const MAX_TOOL_ROUNDS = 3;

const instructions = `You are Zep's support assistant for one signed-in customer.
Zep is an independent demo. It is not Zepto and it is not connected to Zepto's systems.
Use the tools for order, delivery, and refund facts. Never invent an order, status, price, or refund.
Never say a refund, cancellation, or address change succeeded. Those tools only explain options.
Never say you contacted, transferred, or connected the customer to a human. You cannot create a handoff.
If a tool says the order was not found, say that. Keep replies short and concrete.`;

export class MissingOpenAIKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not set.");
    this.name = "MissingOpenAIKeyError";
  }
}

function toModelMessages(messages: PriorMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "USER") {
      return { role: "user", content: message.content };
    }
    const speaker = message.role === "AGENT" ? "Human agent" : "Assistant";
    return { role: "assistant", content: `${speaker}: ${message.content}` };
  });
}

export async function runSupportModel(input: {
  userId: string;
  history: PriorMessage[];
  onText: (delta: string) => void;
  onReplace: (content: string) => void;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new MissingOpenAIKeyError();
  }

  const client = new OpenAI({
    apiKey,
    timeout: 25_000,
    maxRetries: 1,
  });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: instructions },
    ...toModelMessages(input.history),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await client.chat.completions.create({
      model,
      messages,
      tools: supportTools,
      stream: true,
    });

    let content = "";
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        input.onText(delta.content);
      }

      for (const toolCall of delta.tool_calls ?? []) {
        const current = toolCalls.get(toolCall.index) ?? { id: "", name: "", arguments: "" };
        if (toolCall.id) current.id = toolCall.id;
        if (toolCall.function?.name) current.name += toolCall.function.name;
        if (toolCall.function?.arguments) current.arguments += toolCall.function.arguments;
        toolCalls.set(toolCall.index, current);
      }
    }

    const calls = [...toolCalls.values()].filter((call) => call.id && call.name);
    if (calls.length === 0) {
      const text =
        stripFalseHandoffClaims(content.trim(), false) ||
        "I couldn't produce a reply from the available demo data.";
      if (text !== content) {
        input.onReplace(text);
      }
      return { text, exhausted: false };
    }

    if (content) {
      input.onReplace("");
    }

    if (round === MAX_TOOL_ROUNDS - 1) {
      return { text: "", exhausted: true };
    }

    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments || "{}" },
      })),
    });

    for (const call of calls) {
      const output = await executeSupportTool(call.name, call.arguments || "{}", input.userId);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(output),
      });
    }
  }

  return { text: "", exhausted: true };
}
