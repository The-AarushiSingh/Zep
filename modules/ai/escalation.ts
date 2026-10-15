export type ChatRole = "USER" | "ASSISTANT" | "AGENT";

export type PriorMessage = {
  role: ChatRole;
  content: string;
};

export type TicketPriorityName = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type EscalationDecision =
  | { escalate: false }
  | {
      escalate: true;
      reason: string;
      priority: TicketPriorityName;
      title: string;
    };

const HUMAN_REQUEST =
  /\b(speak|talk|chat|connect|transfer|escalate)\b.{0,40}\b(human|person|agent|representative|someone|real)\b|\b(real|live|human)\b.{0,20}\b(person|agent|support|representative)\b|\bcustomer service\b/i;

const UNSAFE_ACTION =
  /\b(process|issue|approve|grant|give me)\b.{0,30}\brefund\b|\bcancel\b.{0,24}\b(order|delivery)\b|\b(change|update)\b.{0,24}\baddress\b|\b(charged twice|double charged|wrong charge|unauthorized charge)\b/i;

const FRUSTRATION =
  /didn'?t help|not helpful|still (?:not|doesn'?t|won'?t|broken|wrong)|try again|same (?:issue|problem)|useless|wrong answer|that(?:'s| is) not what|this isn'?t working|you(?:'re| are) not helping/i;

export function wantsHuman(text: string) {
  return HUMAN_REQUEST.test(text);
}

export function requiresHumanAction(text: string) {
  return UNSAFE_ACTION.test(text);
}

export function repeatedFailure(latestUserText: string, previousMessages: PriorMessage[]) {
  const assistantReplies = previousMessages.filter((message) => message.role === "ASSISTANT").length;
  const userTurns = previousMessages.filter((message) => message.role === "USER").length;
  if (assistantReplies < 2 || userTurns < 2) {
    return false;
  }
  return FRUSTRATION.test(latestUserText);
}

export function decideEscalation(input: {
  latestUserText: string;
  previousMessages: PriorMessage[];
}): EscalationDecision {
  const text = input.latestUserText.trim();

  if (wantsHuman(text)) {
    return {
      escalate: true,
      reason: "explicit_human_request",
      priority: "HIGH",
      title: "Customer asked for a person",
    };
  }

  if (requiresHumanAction(text)) {
    return {
      escalate: true,
      reason: "action_requires_a_person",
      priority: "HIGH",
      title: "Request needs a person to complete",
    };
  }

  if (repeatedFailure(text, input.previousMessages)) {
    return {
      escalate: true,
      reason: "repeated_failure",
      priority: "MEDIUM",
      title: "Issue stayed unresolved",
    };
  }

  return { escalate: false };
}

const FALSE_HANDOFF_CLAIM =
  /\b(i(?:'ve| have)|we(?:'ve| have))\b[^.?!]*(?:contacted|escalated you to|transferred you to|connected you with)\b[^.?!]*(?:human|person|agent|representative|support)/i;

export function stripFalseHandoffClaims(text: string, handoffCreated: boolean) {
  if (handoffCreated || !FALSE_HANDOFF_CLAIM.test(text)) {
    return text;
  }

  return text.replace(
    FALSE_HANDOFF_CLAIM,
    "I have not contacted a person. Ask to speak with a human if you want me to record a handoff request",
  );
}

export function handoffMessage(input: {
  ticketId: string;
  created: boolean;
  reason: string;
}) {
  const recorded = input.created
    ? `A handoff request is now recorded. Ticket ${input.ticketId}.`
    : `A handoff request was already open. Ticket ${input.ticketId}.`;

  const why =
    input.reason === "action_requires_a_person"
      ? "I can't change payments, addresses, or cancellations from this chat."
      : input.reason === "repeated_failure"
        ? "I wasn't able to resolve this after more than one try."
        : "You asked to speak with a person.";

  return `${why} ${recorded} A person has not joined this conversation yet. Their reply will show up here when they do. This queue uses demo orders, not a live Zepto system.`;
}
