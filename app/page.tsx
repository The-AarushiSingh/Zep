import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserWithRole } from "@/modules/auth/actions";
import { ChatApp } from "@/modules/chat/components/chat-app";
import { ensureDemoOrders } from "@/modules/orders/ensure-demo-orders";

export default function HomePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading support...</p>}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await getCurrentUserWithRole();
  if (!user) {
    redirect("/sign-in");
  }

  await ensureDemoOrders(user.id);

  return <ChatApp isAdmin={user.role === "ADMIN"} userName={user.name} />;
}
