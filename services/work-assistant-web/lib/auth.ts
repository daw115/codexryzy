import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "wa_dashboard_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

type SessionPayload = {
  sub: string;
  exp: number;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sessionSecret(): string {
  return requireEnv("DASHBOARD_SESSION_SECRET");
}

function passwordHash(): string {
  return requireEnv("DASHBOARD_PASSWORD_HASH");
}

function derivePassword(password: string, salt: string): Buffer {
  return scryptSync(password, salt, 64);
}

export function createPasswordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = derivePassword(password, salt).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string): boolean {
  const stored = passwordHash().split("$");
  if (stored.length !== 3 || stored[0] !== "scrypt") {
    throw new Error("DASHBOARD_PASSWORD_HASH must use the format scrypt$salt$hash");
  }

  const [, salt, expected] = stored;
  const derived = derivePassword(password, salt);
  const expectedBuffer = Buffer.from(expected, "hex");

  if (derived.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derived, expectedBuffer);
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
}

function createSessionToken(): string {
  const payload: SessionPayload = {
    sub: "owner",
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function isRequestAuthenticated(request: NextRequest): boolean {
  return Boolean(verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value));
}

export function isAuthenticated(): boolean {
  return Boolean(verifySessionToken(cookies().get(SESSION_COOKIE)?.value));
}

export function requireAuthenticatedUser(): void {
  if (!isAuthenticated()) {
    redirect("/login");
  }
}

export function requireGuest(): void {
  if (isAuthenticated()) {
    redirect("/overview");
  }
}

export function createSession(): void {
  const token = createSessionToken();
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSession(): void {
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}
