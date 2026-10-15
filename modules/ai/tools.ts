import { z } from "zod";
import prisma from "@/lib/db";
import { searchSupportArticles } from "./knowledge";

const orderNumberSchema = z.object({
  orderNumber: z.string().trim().min(1).max(40),
});

const searchSchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export const supportTools = [
  {
    type: "function" as const,
    function: {
      name: "list_orders",
      description:
        "List the signed-in customer's demo orders. Use this before answering questions about their orders.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_order",
      description:
        "Get one demo order, including delivery status, only if it belongs to the signed-in customer.",
      parameters: {
        type: "object",
        properties: {
          orderNumber: { type: "string", description: "Order number such as ZP-1048" },
        },
        required: ["orderNumber"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_refund_options",
      description:
        "Explain whether a demo order is inside its refund window. This does not issue a refund.",
      parameters: {
        type: "object",
        properties: {
          orderNumber: { type: "string" },
        },
        required: ["orderNumber"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_support_articles",
      description: "Search the short demo support guide. It is not a live Zepto knowledge base.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

function serializeOrder(order: {
  number: string;
  status: string;
  totalRupees: number;
  placedAt: Date;
  etaLabel: string | null;
  deliveryNote: string | null;
  refundEligible: boolean;
  refundWindowEnds: Date | null;
  isDemo: boolean;
  items: { name: string; quantity: number }[];
}) {
  return {
    demo: order.isDemo,
    orderNumber: order.number,
    status: order.status,
    totalRupees: order.totalRupees,
    placedAt: order.placedAt.toISOString(),
    etaLabel: order.etaLabel,
    deliveryNote: order.deliveryNote,
    refundEligible: order.refundEligible,
    refundWindowEnds: order.refundWindowEnds?.toISOString() ?? null,
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity })),
  };
}

async function findOwnOrder(userId: string, orderNumber: string) {
  return prisma.order.findFirst({
    where: {
      userId,
      number: { equals: orderNumber, mode: "insensitive" },
    },
    include: { items: true },
  });
}

export async function executeSupportTool(name: string, rawArguments: string, userId: string) {
  let parsed: unknown;
  try {
    parsed = rawArguments ? JSON.parse(rawArguments) : {};
  } catch {
    return { ok: false, error: "Tool arguments were not valid JSON." };
  }

  if (name === "list_orders") {
    const orders = await prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { placedAt: "desc" },
    });
    return {
      ok: true,
      demo: true,
      note: "These are demo orders stored for this Zep account. They are not Zepto orders.",
      orders: orders.map(serializeOrder),
    };
  }

  if (name === "get_order" || name === "get_refund_options") {
    const argumentsResult = orderNumberSchema.safeParse(parsed);
    if (!argumentsResult.success) {
      return { ok: false, error: "orderNumber is required." };
    }

    const order = await findOwnOrder(userId, argumentsResult.data.orderNumber);
    if (!order) {
      return {
        ok: true,
        found: false,
        demo: true,
        note: "No order with that number belongs to the signed-in customer.",
      };
    }

    if (name === "get_order") {
      return { ok: true, found: true, order: serializeOrder(order) };
    }

    const windowOpen =
      order.refundEligible &&
      order.refundWindowEnds != null &&
      order.refundWindowEnds.getTime() > Date.now();

    return {
      ok: true,
      found: true,
      demo: true,
      refundIssued: false,
      orderNumber: order.number,
      status: order.status,
      eligibleNow: windowOpen,
      refundWindowEnds: order.refundWindowEnds?.toISOString() ?? null,
      note: windowOpen
        ? "The demo refund window is still open. No refund has been issued."
        : "This demo order is not eligible for a refund right now. No refund has been issued.",
    };
  }

  if (name === "search_support_articles") {
    const argumentsResult = searchSchema.safeParse(parsed);
    if (!argumentsResult.success) {
      return { ok: false, error: "query is required." };
    }

    return {
      ok: true,
      demo: true,
      articles: searchSupportArticles(argumentsResult.data.query),
    };
  }

  return { ok: false, error: "Unknown tool." };
}
