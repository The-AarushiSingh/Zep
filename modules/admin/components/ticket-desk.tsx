"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { claimTicket, resolveTicket, sendAgentReply } from "@/modules/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";

type TicketStatus = "REQUESTED" | "IN_PROGRESS" | "RESOLVED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type AdminTicketRow = {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  conversationTitle: string;
  assigneeName: string | null;
};

export type AdminTicketDetail = {
  id: string;
  title: string;
  description: string;
  reason: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerName: string;
  customerEmail: string;
  assigneeName: string | null;
  messages: {
    id: string;
    role: "USER" | "ASSISTANT" | "AGENT";
    authorName: string | null;
    content: string;
    createdAt: string;
  }[];
};

const statusLabel: Record<TicketStatus, string> = {
  REQUESTED: "Requested",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
};

export function TicketDesk({
  tickets,
  selected,
  status,
  priority,
}: {
  tickets: AdminTicketRow[];
  selected: AdminTicketDetail | null;
  status?: string;
  priority?: string;
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setReply("");
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "That action failed.");
      }
    });
  }

  function hrefFor(next: { status?: string; priority?: string; ticket?: string }) {
    const params = new URLSearchParams();
    const chosenStatus = next.status === undefined ? status : next.status;
    const chosenPriority = next.priority === undefined ? priority : next.priority;
    if (chosenStatus) params.set("status", chosenStatus);
    if (chosenPriority) params.set("priority", chosenPriority);
    if (next.ticket) params.set("ticket", next.ticket);
    const query = params.toString();
    return query ? `/admin/tickets?${query}` : "/admin/tickets";
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">Zep desk</p>
          <h1 className="font-heading text-lg font-medium">Tickets</h1>
        </div>
        <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <ArrowLeft />
          Back to chat
        </Link>
      </header>

      <div className="grid min-h-[calc(100dvh-61px)] lg:grid-cols-[320px_1fr]">
        <aside className="border-r p-4">
          <form className="mb-4 grid grid-cols-2 gap-2" action="/admin/tickets">
            <select
              name="status"
              defaultValue={status ?? ""}
              className="h-9 rounded-3xl bg-input/50 px-3 text-sm"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="REQUESTED">Requested</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="RESOLVED">Resolved</option>
            </select>
            <select
              name="priority"
              defaultValue={priority ?? ""}
              className="h-9 rounded-3xl bg-input/50 px-3 text-sm"
              aria-label="Filter by priority"
            >
              <option value="">All priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
            <Button type="submit" size="sm" className="col-span-2">
              Apply filters
            </Button>
          </form>

          <div className="space-y-2">
            {tickets.length === 0 && (
              <p className="rounded-3xl bg-muted/60 p-4 text-sm text-muted-foreground">
                No tickets match these filters.
              </p>
            )}
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={hrefFor({ ticket: ticket.id })}
                className={`block rounded-2xl px-3 py-2 text-sm ${
                  selected?.id === ticket.id ? "bg-accent" : "hover:bg-muted"
                }`}
              >
                <span className="block truncate font-medium">{ticket.title}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <Badge variant={ticket.status === "REQUESTED" ? "warning" : ticket.status === "RESOLVED" ? "success" : "default"}>
                    {statusLabel[ticket.status]}
                  </Badge>
                  <Badge variant="muted">{ticket.priority}</Badge>
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {ticket.customerName} · {ticket.assigneeName ?? "Unassigned"}
                </span>
              </Link>
            ))}
          </div>
        </aside>

        <section className="flex flex-col p-4">
          {!selected && (
            <p className="m-auto text-sm text-muted-foreground">Select a ticket to read the conversation.</p>
          )}
          {selected && (
            <>
              <div className="mb-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-xl font-medium">{selected.title}</h2>
                  <Badge variant={selected.status === "REQUESTED" ? "warning" : selected.status === "RESOLVED" ? "success" : "default"}>
                    {statusLabel[selected.status]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selected.customerName} · {selected.customerEmail}
                </p>
                <p className="mt-2 text-sm">{selected.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reason: {selected.reason}. Assignee: {selected.assigneeName ?? "nobody yet"}.
                  {selected.status === "REQUESTED" && " A person has not joined."}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || selected.status === "RESOLVED"}
                    onClick={() => run(() => claimTicket(selected.id))}
                  >
                    Take ticket
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending || selected.status === "RESOLVED"}
                    onClick={() => run(() => resolveTicket(selected.id))}
                  >
                    Resolve
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto rounded-3xl bg-muted/40 p-4">
                {selected.messages.map((message) => (
                  <article key={message.id} className="rounded-2xl bg-card px-3 py-2 text-sm">
                    <p className="mb-1 text-[11px] font-medium tracking-wide uppercase text-muted-foreground">
                      {message.role === "USER"
                        ? "Customer"
                        : message.role === "AGENT"
                          ? message.authorName ?? "Agent"
                          : "Zep assistant"}
                    </p>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </article>
                ))}
              </div>

              <form
                className="mt-4 flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(() => sendAgentReply(selected.id, reply));
                }}
              >
                <Textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Reply as yourself. This is saved in the customer's conversation."
                  disabled={pending || selected.status === "RESOLVED"}
                />
                <Button type="submit" disabled={pending || !reply.trim() || selected.status === "RESOLVED"}>
                  Send human reply
                </Button>
              </form>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
