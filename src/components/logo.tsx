import Image from "next/image";

/// Het echte logo van beerthuizenmanagement.nl, meegeleverd in het project zodat
/// het dashboard niet afhangt van de website.
export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const width = size === "lg" ? 200 : 132;

  return (
    <Image
      src="/logo.png"
      alt="Beerthuizen Management"
      width={width}
      height={Math.round((width / 1937) * 1097)}
      priority
      className="h-auto"
    />
  );
}

/// Compacte variant voor krappe plekken: het bm-monogram in oranjerood.
export function LogoMark() {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-extrabold tracking-tight text-white"
      style={{ background: "var(--accent)" }}
      aria-hidden
    >
      bm
    </span>
  );
}
