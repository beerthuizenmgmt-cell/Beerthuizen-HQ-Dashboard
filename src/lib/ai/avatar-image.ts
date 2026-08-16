import "server-only";

import sharp from "sharp";

// Een gegenereerd portret komt terug op volle resolutie — al snel anderhalve
// megabyte. Dat gaat bij elk paginabezoek mee naar de browser en staat ook nog
// eens in de database. Hier wordt het teruggebracht tot wat je werkelijk ziet:
// een klein vierkant van hooguit een paar tientallen kilobytes.

const SIZE = 256;
const QUALITY = 82;

export async function shrinkToAvatar(input: Buffer): Promise<{ dataUrl: string; bytes: number }> {
  const output = await sharp(input)
    .resize(SIZE, SIZE, { fit: "cover", position: "attention" })
    .webp({ quality: QUALITY })
    .toBuffer();

  return {
    dataUrl: `data:image/webp;base64,${output.toString("base64")}`,
    bytes: output.byteLength,
  };
}

/// Zelfde bewerking, maar vanaf een data-URI zoals de beeldmodellen die geven.
export async function shrinkDataUrl(dataUrl: string): Promise<{ dataUrl: string; bytes: number } | null> {
  const match = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;

  try {
    return await shrinkToAvatar(Buffer.from(match[1], "base64"));
  } catch {
    return null;
  }
}
