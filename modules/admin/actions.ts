"use server";

import prisma from "@/lib/db";
import { getCurrentUserWithRole } from "@/modules/auth/actions";

const statuses = ["REQUESTED", "IN_PROGRESS", "RESOLVED"] as const;
const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

type TicketStatusName = (typeof statuses)[number];
type TicketPriorityName = (typeof priorities)[number];

async function assertAdmin() {
  const user = await getCurrentUserWithRole();
  if (!user) {
    throw new Error("Sign in required.");
  }
  if (user.role !== "ADMIN") {
    throw new Error("Admin access required.");
  }
  return user;
}

function isStatus(value: string | undefined): value is TicketStatusName {
  return statuses.some((status) => status === value);
}

function isPriority(value: string | undefined): value is TicketPriorityName {
  return priorities.some((priority) => priority === value);
}

export async function getAdminTickets(filters: { status?: string; priority?: string }) {
  await assertAdmin();

  return prisma.ticket.findMany({
    where: {
      status: isStatus(filters.status) ? filters.status : undefined,
      priority: isPriority(filters.priority) ? filters.priority : undefined,
    },
    include: {
      user: { select: { name: true, email: true } },
      assignee: { select: { name: true, email: true } },
      conversation: { select: { title: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

export async function getAdminTicket(ticketId: string) {
  await assertAdmin();

  return prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: { name: true, email: true } },
      assignee: { select: { id: true, name: true } },
      conversation: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
}

export async function claimTicket(ticketId: string) {
  const admin = await assertAdmin();
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new Error("Ticket not found.");
  }
  if (ticket.status === "RESOLVED") {
    throw new Error("Resolved tickets cannot be claimed.");
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assigneeId: admin.id,
      status: "IN_PROGRESS",
    },
  });
}

export async function sendAgentReply(ticketId: string, content: string) {
  const admin = await assertAdmin();
  const reply = content.trim();
  if (!reply) {
    throw new Error("Reply cannot be empty.");
  }
  if (reply.length > 4000) {
    throw new Error("Reply is too long.");
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new Error("Ticket not found.");
  }
  if (ticket.status === "RESOLVED") {
    throw new Error("Resolve is already recorded. Reopen is not available.");
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: ticket.conversationId,
        content: reply,
        role: "AGENT",
        authorName: admin.name,
      },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assigneeId: ticket.assigneeId ?? admin.id,
        status: "IN_PROGRESS",
      },
    }),
    prisma.conversation.update({
      where: { id: ticket.conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

export async function resolveTicket(ticketId: string) {
  await assertAdmin();
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: "RESOLVED" },
  });
}
