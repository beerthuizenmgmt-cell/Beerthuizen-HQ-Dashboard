"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/// Houdt het scherm actueel zonder dat je F5 hoeft te drukken — bedoeld voor
/// een dashboard dat de hele dag open staat. Ververst alleen als het tabblad
/// zichtbaar is, anders draait het onnodig door op de achtergrond.
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setUpdatedAt(
        new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }),
      );
    };

    const timer = setInterval(tick, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);

  return (
    <span className="text-xs text-text-faint">
      {updatedAt ? `bijgewerkt om ${updatedAt}` : "werkt zichzelf bij"}
    </span>
  );
}
