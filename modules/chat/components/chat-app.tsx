"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChatCircle,
  Headset,
  List,
  PaperPlaneTilt,
  Plus,
  SignOut,
  Trash,
} from "@phosphor-icons/react";
import { signOutAction } from "@/modules/auth/actions";
import {
  createConversation,
  deleteConversation,
  getConversations,
} from "@/modules/conversations/actions";
import { getConversationThread } from "@/modules/messages/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { cn } from "cn";

type TicketStatus = "REQUESTED" | "IN_PROGRESS" | "RESOLVED";

const statusLabel: Record<TicketStatus, string> = {
  REQUESTED: "Handoff requested",
  IN_PROGRESS: "Agent in conversation",
  RESOLVED: "Resolved",
};

function statusVariant(status: TicketStatus) {
  if (status === "REQUESTED") return "warning" as const;
  if (status === "IN_PROGRESS") return "default" as const;
  return "success" as const;
}

export function ChatApp({ isAdmin, userName }: { isAdmin: boolean; userName: string }) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => getConversations(),
  });

  const thread = useQuery({
    queryKey: ["thread", activeId],
    queryFn: () => (activeId ? getConversationThread(activeId) : null),
    enabled: Boolean(activeId),
  });

  const createChat = useMutation({
    mutationFn: () => createConversation(),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveId(conversation.id);
      setSidebarOpen(false);
    },
  });

  const removeChat = useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: async () => {
      setActiveId(null);
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [thread.data, streaming]);

  async function sendMessage() {
    if (!activeId || !draft.trim() || pending) return;
    const content = draft.trim();
    setDraft("");
    setPending(true);
    setStreaming("");
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, content }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "The message could not be sent.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            delta?: string;
            content?: string;
            message?: string;
          };
          if (event.type === "text" && event.delta) {
            setStreaming((current) => current + event.delta);
          }
          if (event.type === "replace" && event.content) {
            setStreaming(event.content);
          }
          if (event.type === "error" && event.message) {
            setError(event.message);
          }
        }
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The message could not be sent.");
    } finally {
      setPending(false);
      setStreaming("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["thread", activeId] }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
    }
  }

  const ticket = thread.data?.ticket ?? null;
  const locked = ticket?.status === "REQUESTED" || ticket?.status === "IN_PROGRESS";

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside
        className={`${sidebarOpen ? "flex" : "hidden"} absolute inset-y-0 z-20 w-80 flex-col border-r border-sidebar-border bg-sidebar p-4 md:static md:flex`}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Zep
            </p>
            <h1 className="font-heading text-lg font-medium">Support</h1>
          </div>
          <Button size="icon" variant="outline" onClick={() => createChat.mutate()} disabled={createChat.isPending}>
            <Plus />
            <span className="sr-only">New conversation</span>
          </Button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto">
          {conversations.isPending && (
            <p className="px-2 text-sm text-muted-foreground">Loading conversations...</p>
          )}
          {conversations.isError && (
            <p className="px-2 text-sm text-destructive">Conversations could not be loaded.</p>
          )}
          {conversations.data?.length === 0 && (
            <div className="rounded-3xl bg-muted/60 p-4 text-sm text-muted-foreground">
              No conversations yet. Start one to ask about a demo order.
            </div>
          )}
          {conversations.data?.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => {
                setActiveId(conversation.id);
                setSidebarOpen(false);
              }}
              className={`flex w-full flex-col gap-1 rounded-2xl px-3 py-2 text-left text-sm ${
                conversation.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              }`}
            >
              <span className="truncate font-medium">{conversation.title}</span>
              {conversation.ticket && (
                <Badge variant={statusVariant(conversation.ticket.status)}>
                  {statusLabel[conversation.ticket.status]}
                </Badge>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-sidebar-border pt-4">
          <p className="truncate text-sm">{userName}</p>
          <form action={signOutAction}>
            <Button type="submit" size="icon" variant="ghost">
              <SignOut />
              <span className="sr-only">Sign out</span>
            </Button>
          </form>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Button className="md:hidden" size="icon" variant="ghost" onClick={() => setSidebarOpen((open) => !open)}>
              <List />
              <span className="sr-only">Toggle conversations</span>
            </Button>
            <div>
              <p className="font-medium">{thread.data?.title ?? "Choose a conversation"}</p>
              <p className="text-xs text-muted-foreground">Demo grocery support. Not connected to Zepto.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link href="/admin/tickets" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                <Headset />
                Desk
              </Link>
            )}
            <ModeToggle />
            {activeId && (
              <Button size="icon" variant="ghost" onClick={() => removeChat.mutate(activeId)}>
                <Trash />
                <span className="sr-only">Delete conversation</span>
              </Button>
            )}
          </div>
        </header>

        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
          {!activeId && (
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 pt-24 text-center">
              <ChatCircle size={36} className="text-primary" />
              <h2 className="font-heading text-2xl font-medium">How can we help?</h2>
              <p className="text-sm text-muted-foreground">
                Ask about demo orders ZP-1042, ZP-1048, or ZP-1055. If you ask for a person, Zep records a real ticket.
              </p>
              <Button onClick={() => createChat.mutate()}>
                <Plus />
                New conversation
              </Button>
            </div>
          )}

          {ticket && (
            <div className="mx-auto max-w-3xl rounded-3xl border bg-card px-4 py-3 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant={statusVariant(ticket.status)}>{statusLabel[ticket.status]}</Badge>
                <span className="text-muted-foreground">{ticket.id}</span>
              </div>
              <p>
                {ticket.status === "REQUESTED" &&
                  "A handoff is recorded. A person has not joined this conversation yet."}
                {ticket.status === "IN_PROGRESS" &&
                  "An agent has taken this ticket. New notes are saved, and the assistant stays quiet."}
                {ticket.status === "RESOLVED" &&
                  "This ticket is resolved. You can ask the assistant about your demo orders again."}
              </p>
            </div>
          )}

          {thread.data?.messages.map((message) => (
            <article
              key={message.id}
              className={`mx-auto flex max-w-3xl ${message.role === "USER" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-6 ${
                  message.role === "USER"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card shadow-sm ring-1 ring-foreground/10"
                }`}
              >
                {message.role !== "USER" && (
                  <p className="mb-1 text-[11px] font-medium tracking-wide uppercase opacity-70">
                    {message.role === "AGENT" ? message.authorName ?? "Agent" : "Zep"}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </article>
          ))}

          {streaming && (
            <article className="mx-auto flex max-w-3xl justify-start">
              <div className="max-w-[85%] rounded-3xl bg-card px-4 py-3 text-sm leading-6 shadow-sm ring-1 ring-foreground/10">
                <p className="mb-1 text-[11px] font-medium tracking-wide uppercase opacity-70">Zep</p>
                <p className="whitespace-pre-wrap">{streaming}</p>
              </div>
            </article>
          )}

          {error && <p className="mx-auto max-w-3xl text-sm text-destructive">{error}</p>}
        </div>

        <form
          className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 pb-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <Textarea
            value={draft}
            disabled={!activeId || pending}
            placeholder={
              locked ? "Add a note for the agent" : activeId ? "Ask about a demo order" : "Start a conversation first"
            }
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <Button type="submit" size="icon" disabled={!activeId || pending || !draft.trim()}>
            <PaperPlaneTilt />
            <span className="sr-only">{pending ? "Sending" : "Send"}</span>
          </Button>
        </form>
      </section>
    </div>
  );
}
