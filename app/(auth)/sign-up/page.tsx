import { Suspense } from "react";
import { requireUnauth } from "@/modules/auth/actions";
import { SignUpForm } from "@/modules/auth/components/sign-up-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignUpPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
      <SignUpContent />
    </Suspense>
  );
}

async function SignUpContent() {
  await requireUnauth();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Get started with Zep</CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
      </CardContent>
    </Card>
  );
}
