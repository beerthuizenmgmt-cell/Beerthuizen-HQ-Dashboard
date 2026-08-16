"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Vul je e-mailadres en wachtwoord in." };

  const user = await db.user.findUnique({ where: { email } });
  // Zelfde melding bij onbekend account en verkeerd wachtwoord, zodat je hier
  // niet kunt aflezen welke e-mailadressen bestaan.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "E-mailadres of wachtwoord klopt niet." };
  }

  await createSession(user.id);
  redirect("/hq");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
