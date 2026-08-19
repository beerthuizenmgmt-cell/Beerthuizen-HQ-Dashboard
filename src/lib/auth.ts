import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";

const COOKIE = "bhmgmt_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dagen

function secret(): Uint8Array {
  const value = process.env.APP_SECRET;
  if (!value) throw new Error("APP_SECRET ontbreekt in .env");
  return new TextEncoder().encode(value);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member";
};

/// Wie er is ingelogd.
///
/// Met cache() eromheen: binnen één verzoek vraagt zowel de layout als de
/// pagina zelf naar de gebruiker, en zonder dit zijn dat twee losse queries.
/// Op een database in dezelfde regio valt dat weg in de ruis; staat hij een
/// oceaan verderop, dan kost elke overbodige query zo'n negentig milliseconden.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = payload.sub;
    if (typeof userId !== "string") return null;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    return user ?? null;
  } catch {
    // Verlopen of geknoeide cookie — behandelen als uitgelogd.
    return null;
  }
});

/// Voor server components en route handlers die inloggen vereisen.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
