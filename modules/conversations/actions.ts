"use server";

import prisma from "@/lib/db";
import { requireAuth } from "@/modules/auth/actions";
import { ensureDemoOrders } from "@/modules/orders/ensure-demo-orders";

export async function getConversations() {
  const session = await requireAuth();
  await ensureDemoOrders(session.user.id);

  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      tickets: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });

  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
    ticket: conversation.tickets[0]
      ? { id: conversation.tickets[0].id, status: conversation.tickets[0].status }
      : null,
  }));
}

export async function createConversation() {
  const session = await requireAuth();

  const conversation = await prisma.conversation.create({
    data: {
      title: "New conversation",
      userId: session.user.id,
    },
  });

  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
    ticket: null,
  };
}

export async function renameConversation(id: string, title: string) {
  const session = await requireAuth();
  const nextTitle = title.trim().slice(0, 80);
  if (!nextTitle) {
    throw new Error("Title cannot be empty.");
  }

  const result = await prisma.conversation.updateMany({
    where: { id, userId: session.user.id },
    data: { title: nextTitle },
  });

  if (result.count === 0) {
    throw new Error("Conversation not found.");
  }
}

export async function deleteConversation(id: string) {
  const session = await requireAuth();
  const result = await prisma.conversation.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (result.count === 0) {
    throw new Error("Conversation not found.");
  }
}
