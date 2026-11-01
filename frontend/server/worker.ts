// Web pública en Cloudflare: sirve la web compilada (frontend/dist) y los gritos y avatares de cada luchador,
// guardados en R2. Mismas rutas y reglas que media-plugin.ts (el servidor de `vite dev`):
//
//   PUT    /api/media/:contractId/:kind     sube attack | defeat | avatar (cuerpo = bytes del archivo)
//   GET    /api/media/:contractId           { attack?: url, defeat?: url, avatar?: url }
//   DELETE /api/media/:contractId/:kind     solo con header x-organizer-token
//   GET    /media/:contractId/:file         sirve el archivo
//
// El token del organizador es un secreto de Cloudflare: `npx wrangler secret put ORGANIZER_TOKEN`.
import { read } from "@cvm/game";
import { CONTRACT_ID, ERRORS, isKind, isMediaFile, isRegistered, KINDS, MAX_BYTES, sniff, type Kind } from "./media-rules";

interface Env {
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
  ORGANIZER_TOKEN?: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

async function findKey(bucket: R2Bucket, id: string, kind: Kind) {
  const list = await bucket.list({ prefix: `${id}/${kind}.` });
  return list.objects[0]?.key;
}

/** Lee el cuerpo sin pasarse del límite (no confiamos en content-length). */
async function readBody(req: Request, limit: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function media(req: Request, env: Env, parts: string[]): Promise<Response> {
  // GET /media/:id/:file
  if (parts[0] === "media") {
    const [, id, file] = parts;
    if (req.method !== "GET" || !id || !CONTRACT_ID.test(id) || !isMediaFile(file)) return json(404, { error: "No existe" });
    const obj = await env.MEDIA.get(`${id}/${file}`);
    if (!obj) return json(404, { error: "No existe" });
    return new Response(obj.body, {
      headers: { "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream", "cache-control": "no-cache" },
    });
  }

  const [, , id, kind] = parts;
  if (!id || !CONTRACT_ID.test(id)) return json(400, { error: ERRORS.badId });

  if (req.method === "GET" && !kind) {
    const list = await env.MEDIA.list({ prefix: `${id}/` });
    const out: Partial<Record<Kind, string>> = {};
    for (const o of list.objects) {
      const file = o.key.slice(id.length + 1);
      out[file.split(".")[0] as Kind] = `/media/${id}/${file}`;
    }
    return json(200, out);
  }

  if (!isKind(kind)) return json(400, { error: ERRORS.badKind });
  const token = req.headers.get("x-organizer-token");
  const isOrganizer = !!env.ORGANIZER_TOKEN && token === env.ORGANIZER_TOKEN;

  if (req.method === "DELETE") {
    if (!isOrganizer) return json(403, { error: ERRORS.forbidden });
    const existing = await findKey(env.MEDIA, id, kind);
    if (existing) await env.MEDIA.delete(existing);
    return json(200, { ok: true });
  }

  if (req.method === "PUT") {
    const existing = await findKey(env.MEDIA, id, kind);
    if (existing && !isOrganizer) return json(409, { error: ERRORS.duplicate });
    const family = KINDS[kind];
    const body = await readBody(req, MAX_BYTES[family]);
    if (!body) return json(413, { error: ERRORS.tooBig(family) });
    const format = sniff(body);
    if (!format || format.family !== family) return json(415, { error: ERRORS.badFormat(family) });
    if (!isOrganizer && !(await isRegistered(read, id))) return json(403, { error: ERRORS.notRegistered });
    if (existing) await env.MEDIA.delete(existing);
    const key = `${id}/${kind}.${format.ext}`;
    await env.MEDIA.put(key, body, { httpMetadata: { contentType: format.mime } });
    return json(200, { url: `/media/${key}` });
  }

  return json(405, { error: "Método no permitido" });
}

export default {
  async fetch(req, env) {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    if (parts[0] === "media" || (parts[0] === "api" && parts[1] === "media")) return media(req, env, parts);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
