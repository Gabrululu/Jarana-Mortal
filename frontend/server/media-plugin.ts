// Mini-servidor de medios del taller: cada asistente sube sus gritos (y avatar) para su CONTRACT_ID.
// Corre dentro de `vite dev` / `vite preview` en la laptop del organizador; los asistentes
// entran por la red local (vite --host). Los archivos quedan en frontend/media/ (fuera de git).
//
//   PUT    /api/media/:contractId/:kind     sube attack | defeat | avatar (cuerpo = bytes del archivo)
//   GET    /api/media/:contractId           { attack?: url, defeat?: url, avatar?: url }
//   DELETE /api/media/:contractId/:kind     solo con header x-organizer-token
//   GET    /media/:contractId/:file         sirve el archivo
//
// Cada archivo se puede subir UNA vez (para que nadie pise el grito ajeno). Para reemplazarlo,
// el organizador usa el token que se imprime al arrancar el servidor.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";

const CONTRACT_ID = /^C[A-Z2-7]{55}$/;
const KINDS = { attack: "audio", defeat: "audio", avatar: "image" } as const;
type Kind = keyof typeof KINDS;
const MAX_BYTES = { audio: 3 * 1024 * 1024, image: 1024 * 1024 };

/** Detecta el formato real por sus primeros bytes (no confiamos en la extensión). */
function sniff(buf: Buffer): { ext: string; mime: string; family: "audio" | "image" } | null {
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString("latin1");
  if (ascii(0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg", family: "audio" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { ext: "wav", mime: "audio/wav", family: "audio" };
  if (ascii(0, 4) === "OggS") return { ext: "ogg", mime: "audio/ogg", family: "audio" };
  if (buf.readUInt32BE(0) === 0x1a45dfa3) return { ext: "webm", mime: "audio/webm", family: "audio" };
  if (ascii(4, 8) === "ftyp") return { ext: "m4a", mime: "audio/mp4", family: "audio" };
  if (buf.readUInt32BE(0) === 0x89504e47) return { ext: "png", mime: "image/png", family: "image" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg", family: "image" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp", family: "image" };
  return null;
}

const MIME: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", webm: "audio/webm", m4a: "audio/mp4",
  png: "image/png", jpg: "image/jpeg", webp: "image/webp",
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        ok(null);
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

export function mediaPlugin(): Plugin {
  const root = fileURLToPath(new URL("../media", import.meta.url));
  const token = process.env.CVM_ORGANIZER_TOKEN ?? randomBytes(4).toString("hex");

  const filesOf = (id: string) => {
    const dir = join(root, id);
    return existsSync(dir) ? readdirSync(dir) : [];
  };
  const findFile = (id: string, kind: Kind) => filesOf(id).find((f) => f.startsWith(`${kind}.`));

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://x");
    const parts = url.pathname.split("/").filter(Boolean);

    // GET /media/:id/:file
    if (parts[0] === "media" && req.method === "GET") {
      const [, id, file] = parts;
      if (!id || !CONTRACT_ID.test(id) || !file || !/^(attack|defeat|avatar)\.\w+$/.test(file)) return next();
      const path = join(root, id, file);
      if (!existsSync(path)) return json(res, 404, { error: "No existe" });
      res.setHeader("content-type", MIME[file.split(".")[1]] ?? "application/octet-stream");
      res.setHeader("cache-control", "no-cache");
      return res.end(readFileSync(path));
    }

    if (parts[0] !== "api" || parts[1] !== "media") return next();
    const [, , id, kind] = parts as [string, string, string, Kind | undefined];
    if (!id || !CONTRACT_ID.test(id)) return json(res, 400, { error: "CONTRACT_ID inválido" });

    if (req.method === "GET" && !kind) {
      const media: Partial<Record<Kind, string>> = {};
      for (const f of filesOf(id)) media[f.split(".")[0] as Kind] = `/media/${id}/${f}`;
      return json(res, 200, media);
    }

    if (!kind || !(kind in KINDS)) return json(res, 400, { error: "Tipo inválido: usa attack, defeat o avatar" });
    const isOrganizer = req.headers["x-organizer-token"] === token;

    if (req.method === "DELETE") {
      if (!isOrganizer) return json(res, 403, { error: "Solo el organizador puede borrar" });
      const existing = findFile(id, kind);
      if (existing) rmSync(join(root, id, existing));
      return json(res, 200, { ok: true });
    }

    if (req.method === "PUT") {
      const existing = findFile(id, kind);
      if (existing && !isOrganizer) {
        return json(res, 409, { error: "Ya subiste este archivo. Pídele al organizador que lo reemplace." });
      }
      const family = KINDS[kind];
      const body = await readBody(req, MAX_BYTES[family]);
      if (!body) return json(res, 413, { error: `Archivo muy grande (máx. ${MAX_BYTES[family] / 1024 / 1024} MB)` });
      const format = body.length >= 12 ? sniff(body) : null;
      if (!format || format.family !== family) {
        return json(res, 415, { error: family === "audio" ? "Sube un audio (mp3, wav, ogg, m4a)" : "Sube una imagen (png, jpg, webp)" });
      }
      mkdirSync(join(root, id), { recursive: true });
      if (existing) rmSync(join(root, id, existing));
      writeFileSync(join(root, id, `${kind}.${format.ext}`), body);
      return json(res, 200, { url: `/media/${id}/${kind}.${format.ext}` });
    }

    return json(res, 405, { error: "Método no permitido" });
  };

  return {
    name: "cvm-media",
    configureServer(server) {
      server.middlewares.use(handler);
      server.httpServer?.once("listening", () => {
        server.config.logger.info(`\n  🎙️  Token del organizador para reemplazar audios: ${token}\n`);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
      server.httpServer?.once("listening", () => {
        server.config.logger.info(`\n  🎙️  Token del organizador para reemplazar audios: ${token}\n`);
      });
    },
  };
}
