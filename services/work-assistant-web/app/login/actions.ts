"use server";

import { redirect } from "next/navigation";

import { createSession, verifyPassword } from "@/lib/auth";

export type LoginActionState = {
  error?: string;
};

export async function loginAction(_: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const password = String(formData.get("password") ?? "").trim();
  if (!password) {
    return { error: "Wpisz hasło do dashboardu." };
  }

  try {
    if (!verifyPassword(password)) {
      return { error: "Hasło jest nieprawidłowe." };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Dashboard nie jest jeszcze skonfigurowany.",
    };
  }

  createSession();
  redirect("/overview");
}
