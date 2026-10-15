import prisma from "@/lib/db";
import type { TicketPriorityName } from "@/modules/ai/escalation";

const activeStatuses = ["REQUESTED", "IN_PROGRESS"] as const;

export async function getActiveTicket(conversationId: string, userId: string) {
  return prisma.ticket.findFirst({
    where: {
      conversationId,
      userId,
      status: { in: [...activeStatuses] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createHandoff(input: {
  userId: string;
  conversationId: string;
  title: string;
  description: string;
  reason: string;
  priority: TicketPriorityName;
}) {
  const existing = await getActiveTicket(input.conversationId, input.userId);
  if (existing) {
    return { ticket: existing, created: false as const };
  }

  try {
    const ticket = await prisma.ticket.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        title: input.title,
        description: input.description,
        reason: input.reason,
        priority: input.priority,
        status: "REQUESTED",
      },
    });
    return { ticket, created: true as const };
  } catch (error) {
    const uniqueConflict =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";

    if (uniqueConflict) {
      const again = await getActiveTicket(input.conversationId, input.userId);
      if (again) {
        return { ticket: again, created: false as const };
      }
    }

    throw error;
  }
}
