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

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail && session.user.email.toLowerCase() === adminEmail) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { role: "ADMIN" },
    });
  } else if (!adminEmail) {
    const firstUser = await prisma.user.findFirst({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (firstUser?.id === session.user.id) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { role: "ADMIN" },
      });
    }
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
