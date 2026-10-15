"use server";

import prisma from "@/lib/db";
import { requireAuth } from "@/modules/auth/actions";

export async function getConversationThread(conversationId: string) {
  const session = await requireAuth();

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      tickets: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!conversation) {
    return null;
  }

  const ticket = conversation.tickets[0] ?? null;

  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      content: message.content,
      role: message.role,
      authorName: message.authorName,
      createdAt: message.createdAt.toISOString(),
    })),
    ticket: ticket
      ? {
          id: ticket.id,
          status: ticket.status,
          priority: ticket.priority,
          title: ticket.title,
          reason: ticket.reason,
        }
      : null,
  };
}
