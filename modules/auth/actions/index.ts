"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signInSchema, signUpSchema } from "../schemas";

export async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}

/** Returns the current user plus their database role (USER / ADMIN). */
export async function getCurrentUserWithRole() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  return {
    ...session.user,
    role: dbUser?.role ?? "USER",
  };
}

export async function requireAuth() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return session;
}

export async function requireUnauth() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/");
  }
}

export async function signInAction(data: unknown) {
  const { email, password } = signInSchema.parse(data);

  await auth.api.signInEmail({
    body: { email, password },
    headers: await headers(),
  });

  redirect("/");
}

export async function signUpAction(data: unknown) {
  const { name, email, password } = signUpSchema.parse(data);

  await auth.api.signUpEmail({
    body: { name, email, password },
    headers: await headers(),
  });

  redirect("/");
}

export async function signOutAction() {
  await auth.api.signOut({
    headers: await headers(),
  });

  redirect("/sign-in");
}
