"use client";

/// Wat er misging bij een knop. Verschijnt alleen als er iets misging.
///
/// Bestaat omdat "er gebeurt niets" er precies hetzelfde uitziet als "het is
/// gelukt maar je ziet het niet". Zonder deze regel kun je niet testen of een
/// knop werkt — je kunt alleen hopen.
export function ActieFout({ fout }: { fout: string | null }) {
  if (!fout) return null;

  return (
    <p className="mt-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
      {fout}
    </p>
  );
}
