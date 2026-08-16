"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Vul je e-mailadres en wachtwoord in." };

  // Het inlogscherm staat straks open op internet; tien pogingen per vijf
  // minuten is ruim voor een vergeten wachtwoord en te weinig om te raden.
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  const attempt = rateLimit(`login:${forwarded ?? "lokaal"}`, { limit: 10, windowMs: 5 * 60_000 });
  if (!attempt.ok) {
    return { error: `Te veel inlogpogingen. Probeer het over ${attempt.retryAfterSeconds}s opnieuw.` };
  }

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
