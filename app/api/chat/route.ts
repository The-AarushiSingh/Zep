import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { decideEscalation, handoffMessage, type PriorMessage } from "@/modules/ai/escalation";
import { MissingOpenAIKeyError, runSupportModel } from "@/modules/ai/run-chat";
import { createHandoff, getActiveTicket } from "@/modules/tickets/actions";

export const maxDuration = 60;

function encode(event: Record<string, unknown>) {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

async function saveMessage(input: {
  conversationId: string;
  content: string;
  role: "USER" | "ASSISTANT" | "AGENT";
  authorName?: string | null;
}) {
  await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      content: input.content,
      role: input.role,
      authorName: input.authorName ?? null,
    },
  });
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: new Date() },
  });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const conversationId =
    body && typeof body === "object" && "conversationId" in body ? body.conversationId : null;
  const content = body && typeof body === "object" && "content" in body ? body.content : null;

  if (typeof conversationId !== "string" || typeof content !== "string" || !content.trim()) {
    return Response.json(
      { error: "conversationId and content are required." },
      { status: 400 },
    );
  }

  const trimmed = content.trim().slice(0, 4000);
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const previousMessages: PriorMessage[] = conversation.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  await saveMessage({
    conversationId,
    content: trimmed,
    role: "USER",
  });

  if (conversation.title === "New conversation") {
    await prisma.conversation.updateMany({
      where: { id: conversation.id, userId: session.user.id, title: "New conversation" },
      data: { title: trimmed.slice(0, 48) },
    });
  }

  const activeTicket = await getActiveTicket(conversation.id, session.user.id);
  const decision = decideEscalation({ latestUserText: trimmed, previousMessages });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encode(event));

      try {
        if (activeTicket) {
          send({
            type: "status",
            ticketId: activeTicket.id,
            ticketStatus: activeTicket.status,
          });
          send({ type: "done" });
          return;
        }

        if (decision.escalate) {
          const result = await createHandoff({
            userId: session.user.id,
            conversationId: conversation.id,
            title: decision.title,
            description: trimmed,
            reason: decision.reason,
            priority: decision.priority,
          });
          const text = handoffMessage({
            ticketId: result.ticket.id,
            created: result.created,
            reason: decision.reason,
          });
          await saveMessage({
            conversationId: conversation.id,
            content: text,
            role: "ASSISTANT",
            authorName: "Zep",
          });
          send({ type: "text", delta: text });
          send({
            type: "status",
            ticketId: result.ticket.id,
            ticketStatus: result.ticket.status,
          });
          send({ type: "done" });
          return;
        }

        let streamed = "";
        const modelResult = await runSupportModel({
          userId: session.user.id,
          history: [...previousMessages, { role: "USER", content: trimmed }],
          onText: (delta) => {
            streamed += delta;
            send({ type: "text", delta });
          },
          onReplace: (content) => {
            streamed = content;
            send({ type: "replace", content });
          },
        });

        if (modelResult.exhausted) {
          const result = await createHandoff({
            userId: session.user.id,
            conversationId: conversation.id,
            title: "Assistant could not finish the request",
            description: trimmed,
            reason: "tool_limit",
            priority: "MEDIUM",
          });
          const text = handoffMessage({
            ticketId: result.ticket.id,
            created: result.created,
            reason: "repeated_failure",
          });
          await saveMessage({
            conversationId: conversation.id,
            content: text,
            role: "ASSISTANT",
            authorName: "Zep",
          });
          send({ type: "text", delta: text });
          send({
            type: "status",
            ticketId: result.ticket.id,
            ticketStatus: result.ticket.status,
          });
          send({ type: "done" });
          return;
        }

        const text = modelResult.text || streamed;
        await saveMessage({
          conversationId: conversation.id,
          content: text,
          role: "ASSISTANT",
          authorName: "Zep",
        });
        send({ type: "done" });
      } catch (error) {
        const message =
          error instanceof MissingOpenAIKeyError
            ? "The assistant is not configured. Add OPENAI_API_KEY and try again."
            : error instanceof Error && error.name === "APIConnectionTimeoutError"
              ? "The assistant timed out. Your message was saved. Try again."
              : "The assistant failed before a reply was saved.";
        send({ type: "error", message });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
