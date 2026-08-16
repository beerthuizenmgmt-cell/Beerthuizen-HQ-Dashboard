// Waar de databaseverbinding vandaan komt.
//
// Lokaal zetten we DATABASE_URL zelf; Vercel Postgres injecteert een reeks
// POSTGRES_*-variabelen en geen DATABASE_URL. Door beide te accepteren werkt
// dezelfde code op je Mac en online, zonder dat je ergens iets moet dupliceren.

/// Een adres dat alleen op deze machine bestaat.
function isLocalhost(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
}

/// Voor de applicatie: liefst de gepoolde verbinding, want serverless opent
/// veel korte verbindingen.
///
/// Op de server negeren we een DATABASE_URL die naar localhost wijst. Zo'n
/// adres kan alleen uit een meegereisd .env-bestand komen en verwijst naar een
/// database die vanaf internet onbereikbaar is; doorgaan zou een onbegrijpelijke
/// "kan database niet bereiken" opleveren in plaats van gewoon de juiste
/// verbinding te pakken.
export function resolveDatabaseUrl(): string | undefined {
  const own = process.env.DATABASE_URL;
  const hosted = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;

  if (own && !(process.env.VERCEL && isLocalhost(own))) return own;
  return hosted || undefined;
}

/// Verbindingsinstellingen voor de driver.
///
/// Gehoste aanbieders als Supabase en Neon zetten een certificaat voor dat Node
/// niet in zijn eigen lijst heeft staan; de verbinding wordt dan geweigerd,
/// ook al staat er `sslmode=require` in. We versleutelen wél, maar controleren
/// de keten niet — het verkeer loopt binnen het netwerk van de aanbieder.
/// Lokaal (localhost) is er geen TLS en hoeft dit niet.
export function poolConfig(connectionString: string): { connectionString: string } {
  if (isLocalhost(connectionString)) return { connectionString };

  // De driver leest sslmode uit de URL en negeert een los ssl-object; `require`
  // laat hem de keten alsnog controleren, waarop hij afhaakt. `no-verify`
  // versleutelt wel maar controleert de keten niet.
  const normalised = /sslmode=/.test(connectionString)
    ? connectionString.replace(/sslmode=[^&]*/, "sslmode=no-verify")
    : `${connectionString}${connectionString.includes("?") ? "&" : "?"}sslmode=no-verify`;

  return { connectionString: normalised };
}

/// Voor migraties: juist de directe verbinding. Een migratie door een pooler
/// heen loopt vast op advisory locks.
export function resolveDirectUrl(): string | undefined {
  const own = process.env.DIRECT_DATABASE_URL;
  if (own && !(process.env.VERCEL && isLocalhost(own))) return own;
  return process.env.POSTGRES_URL_NON_POOLING || resolveDatabaseUrl();
}
