/// Het merkteken: het bm-monogram van de site, in oranjerood. Vierkant met een
/// kleine radius, zoals de knoppen op beerthuizenmanagement.nl.
export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12 text-lg" : "h-8 w-8 text-xs";

  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded font-extrabold tracking-tight text-white`}
      style={{ background: "var(--accent)" }}
      aria-hidden
    >
      bm
    </span>
  );
}

/// Naam plus onderregel, zoals in de kop van de site.
export function Wordmark() {
  return (
    <span className="leading-none">
      <span className="block text-sm font-extrabold tracking-tight">BEERTHUIZEN</span>
      <span className="eyebrow block">Management</span>
    </span>
  );
}
