// Reglas de los gritos y avatares, compartidas por el servidor local (media-plugin.ts, `vite dev`)
// y por el de Cloudflare (worker.ts, la web pública).
export const CONTRACT_ID = /^C[A-Z2-7]{55}$/;
export const KINDS = { attack: "audio", defeat: "audio", avatar: "image" } as const;
export type Kind = keyof typeof KINDS;
export const MAX_BYTES = { audio: 3 * 1024 * 1024, image: 1024 * 1024 };

export const MIME: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", webm: "audio/webm", m4a: "audio/mp4",
  png: "image/png", jpg: "image/jpeg", webp: "image/webp",
};

export const isKind = (k: string | undefined): k is Kind => !!k && k in KINDS;
export const isMediaFile = (f: string | undefined) => !!f && /^(attack|defeat|avatar)\.\w+$/.test(f);

/** Detecta el formato real por sus primeros bytes (no confiamos en la extensión). */
export function sniff(buf: Uint8Array): { ext: string; mime: string; family: "audio" | "image" } | null {
  if (buf.length < 12) return null;
  const ascii = (start: number, end: number) => String.fromCharCode(...buf.subarray(start, end));
  const u32 = (i: number) => ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0;
  if (ascii(0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg", family: "audio" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { ext: "wav", mime: "audio/wav", family: "audio" };
  if (ascii(0, 4) === "OggS") return { ext: "ogg", mime: "audio/ogg", family: "audio" };
  if (u32(0) === 0x1a45dfa3) return { ext: "webm", mime: "audio/webm", family: "audio" };
  if (ascii(4, 8) === "ftyp") return { ext: "m4a", mime: "audio/mp4", family: "audio" };
  if (u32(0) === 0x89504e47) return { ext: "png", mime: "image/png", family: "image" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg", family: "image" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp", family: "image" };
  return null;
}

export const ERRORS = {
  badId: "CONTRACT_ID inválido",
  badKind: "Tipo inválido: usa attack, defeat o avatar",
  notRegistered: "Ese luchador no está inscrito en la Arena. Inscríbete primero y vuelve a subir.",
  duplicate: "Ya subiste este archivo. Pídele al organizador que lo reemplace.",
  forbidden: "Solo el organizador puede borrar",
  tooBig: (family: "audio" | "image") => `Archivo muy grande (máx. ${MAX_BYTES[family] / 1024 / 1024} MB)`,
  badFormat: (family: "audio" | "image") =>
    family === "audio" ? "Sube un audio (mp3, wav, ogg, m4a)" : "Sube una imagen (png, jpg, webp)",
};

/**
 * Solo se aceptan archivos de luchadores inscritos en la Arena. Así nadie llena el almacenamiento con
 * CONTRACT_ID inventados. Se consulta con una simulación de `fighter()`: gratis y sin firmar.
 */
export async function isRegistered(read: { fighter(id: string): Promise<{ ok: boolean; value?: unknown }> }, id: string) {
  const res = await read.fighter(id);
  return res.ok && !!res.value;
}
