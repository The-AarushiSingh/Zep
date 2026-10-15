import prisma from "@/lib/db";

const demoOrders = [
  {
    number: "ZP-1042",
    status: "DELIVERED" as const,
    totalRupees: 186,
    hoursAgo: 26,
    etaLabel: "Delivered yesterday evening",
    deliveryNote: "Demo drop-off at the door. This is not a live delivery.",
    refundEligible: true,
    refundHoursLeft: 22,
    items: [
      { name: "Toned milk 1L", quantity: 2 },
      { name: "Whole wheat bread", quantity: 1 },
    ],
  },
  {
    number: "ZP-1048",
    status: "OUT_FOR_DELIVERY" as const,
    totalRupees: 242,
    hoursAgo: 1,
    etaLabel: "Demo rider is about 18 minutes away",
    deliveryNote: "Demo status only. No courier is actually on the way.",
    refundEligible: false,
    refundHoursLeft: null,
    items: [
      { name: "Greek yogurt", quantity: 1 },
      { name: "Banana bunch", quantity: 1 },
    ],
  },
  {
    number: "ZP-1055",
    status: "PLACED" as const,
    totalRupees: 99,
    hoursAgo: 0.2,
    etaLabel: "Demo store has not packed this yet",
    deliveryNote: "Still placed, so a person could review a cancellation. The assistant cannot cancel it.",
    refundEligible: false,
    refundHoursLeft: null,
    items: [{ name: "Sparkling water 750ml", quantity: 3 }],
  },
];

export async function ensureDemoOrders(userId: string) {
  const existing = await prisma.order.count({ where: { userId } });
  if (existing > 0) {
    return;
  }

  const now = Date.now();

  try {
    await prisma.$transaction(
      demoOrders.map((order) =>
        prisma.order.create({
          data: {
            userId,
            number: order.number,
            status: order.status,
            totalRupees: order.totalRupees,
            placedAt: new Date(now - order.hoursAgo * 60 * 60 * 1000),
            etaLabel: order.etaLabel,
            deliveryNote: order.deliveryNote,
            refundEligible: order.refundEligible,
            refundWindowEnds:
              order.refundHoursLeft == null
                ? null
                : new Date(now + order.refundHoursLeft * 60 * 60 * 1000),
            isDemo: true,
            items: { create: order.items },
          },
        }),
      ),
    );
  } catch (error) {
    const uniqueConflict =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";
    if (!uniqueConflict) {
      throw error;
    }
  }
}
