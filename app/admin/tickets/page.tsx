import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserWithRole } from "@/modules/auth/actions";
import { getAdminTicket, getAdminTickets } from "@/modules/admin/actions";
import { TicketDesk } from "@/modules/admin/components/ticket-desk";

export default function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; ticket?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading desk...</p>}>
      <AdminTicketsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminTicketsContent({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; ticket?: string }>;
}) {
  const user = await getCurrentUserWithRole();
  if (!user) {
    redirect("/sign-in");
  }
  if (user.role !== "ADMIN") {
    redirect("/");
  }

  const params = await searchParams;
  const tickets = await getAdminTickets({
    status: params.status,
    priority: params.priority,
  });
  const selected = params.ticket ? await getAdminTicket(params.ticket) : null;

  return (
    <TicketDesk
      status={params.status}
      priority={params.priority}
      tickets={tickets.map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt.toISOString(),
        customerName: ticket.user.name,
        customerEmail: ticket.user.email,
        conversationTitle: ticket.conversation.title,
        assigneeName: ticket.assignee?.name ?? null,
      }))}
      selected={
        selected
          ? {
              id: selected.id,
              title: selected.title,
              description: selected.description,
              reason: selected.reason,
              status: selected.status,
              priority: selected.priority,
              customerName: selected.user.name,
              customerEmail: selected.user.email,
              assigneeName: selected.assignee?.name ?? null,
              messages: selected.conversation.messages.map((message) => ({
                id: message.id,
                role: message.role,
                authorName: message.authorName,
                content: message.content,
                createdAt: message.createdAt.toISOString(),
              })),
            }
          : null
      }
    />
  );
}
