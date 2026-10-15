import assert from "node:assert/strict";
import test from "node:test";
import {
  decideEscalation,
  handoffMessage,
  stripFalseHandoffClaims,
} from "./escalation";

test("explicit human request escalates before repeated-failure rules", () => {
  const decision = decideEscalation({
    latestUserText: "I want to speak to a human",
    previousMessages: [],
  });

  assert.equal(decision.escalate, true);
  if (decision.escalate) {
    assert.equal(decision.reason, "explicit_human_request");
    assert.equal(decision.priority, "HIGH");
  }
});

test("refund eligibility questions do not escalate", () => {
  const decision = decideEscalation({
    latestUserText: "Can I get a refund on ZP-1042?",
    previousMessages: [],
  });

  assert.equal(decision.escalate, false);
});

test("asking the app to process a refund escalates", () => {
  const decision = decideEscalation({
    latestUserText: "Please process my refund now",
    previousMessages: [],
  });

  assert.equal(decision.escalate, true);
  if (decision.escalate) {
    assert.equal(decision.reason, "action_requires_a_person");
  }
});

test("repeated failure needs two earlier assistant replies", () => {
  const tooSoon = decideEscalation({
    latestUserText: "That didn't help",
    previousMessages: [
      { role: "USER", content: "Where is my order?" },
      { role: "ASSISTANT", content: "I checked one order." },
    ],
  });
  assert.equal(tooSoon.escalate, false);

  const decision = decideEscalation({
    latestUserText: "That still didn't help",
    previousMessages: [
      { role: "USER", content: "Where is ZP-1048?" },
      { role: "ASSISTANT", content: "It is out for delivery." },
      { role: "USER", content: "The pin is wrong" },
      { role: "ASSISTANT", content: "I can only see the demo note." },
    ],
  });
  assert.equal(decision.escalate, true);
  if (decision.escalate) {
    assert.equal(decision.reason, "repeated_failure");
    assert.equal(decision.priority, "MEDIUM");
  }
});

test("handoff copy says a person has not joined", () => {
  const message = handoffMessage({
    ticketId: "ticket_1",
    created: true,
    reason: "explicit_human_request",
  });

  assert.match(message, /has not joined/i);
  assert.match(message, /ticket_1/);
});

test("assistant text cannot claim a human was contacted when no ticket was created", () => {
  const cleaned = stripFalseHandoffClaims(
    "I've contacted a human agent for you. Your milk is delivered.",
    false,
  );

  assert.doesNotMatch(cleaned, /contacted a human/i);
  assert.match(cleaned, /have not contacted a person/i);
});
