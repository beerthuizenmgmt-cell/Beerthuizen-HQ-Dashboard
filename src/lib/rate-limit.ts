import "server-only";

// Eenvoudige rem op de endpoints die van buiten bereikbaar zijn. Het geheugen
// is per serverinstantie, dus op Vercel telt elke lambda apart — dit stopt
// geen gerichte aanval, maar wel het brute-forcen van tokens en een reader die
// op hol slaat. Wil je een harde grens, dan hoort daar een gedeelde store bij
// (Redis of een tabel).

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Simpele opruiming: bij te veel sleutels gooien we de verlopen buckets weg.
    if (buckets.size > MAX_KEYS) {
      for (const [existing, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(existing);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/// Beste benadering van "wie klopt er aan" achter een proxy.
export function clientKey(request: Request, prefix: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip");
  return `${prefix}:${forwarded || real || "onbekend"}`;
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "rate_limited", message: `Te veel verzoeken. Probeer het over ${retryAfterSeconds}s opnieuw.` },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}
