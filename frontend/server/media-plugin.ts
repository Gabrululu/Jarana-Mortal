// Mini-servidor de medios para desarrollo: cada asistente sube sus gritos (y avatar) para su CONTRACT_ID.
// Corre dentro de `vite dev` / `vite preview`; los archivos quedan en frontend/media/ (fuera de git).
// La web pública hace lo mismo con Cloudflare R2 (worker.ts). Ambos siguen media-rules.ts.
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
import type { Connect, Plugin, ViteDevServer } from "vite";
import { CONTRACT_ID, ERRORS, isKind, isMediaFile, isRegistered, KINDS, MAX_BYTES, MIME, sniff, type Kind } from "./media-rules";

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

  // En `vite dev` cargamos @cvm/game con el cargador de Vite (es TypeScript). En `vite preview` no hay
  // cargador, así que ahí no se revisa la inscripción.
  let dev: ViteDevServer | undefined;
  const registered = async (id: string) => {
    if (!dev) return true;
    const game = (await dev.ssrLoadModule("@cvm/game")) as typeof import("@cvm/game");
    return isRegistered(game.read, id);
  };

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://x");
    const parts = url.pathname.split("/").filter(Boolean);

    // GET /media/:id/:file
    if (parts[0] === "media" && req.method === "GET") {
      const [, id, file] = parts;
      if (!id || !CONTRACT_ID.test(id) || !isMediaFile(file)) return next();
      const path = join(root, id, file!);
      if (!existsSync(path)) return json(res, 404, { error: "No existe" });
      res.setHeader("content-type", MIME[file!.split(".")[1]] ?? "application/octet-stream");
      res.setHeader("cache-control", "no-cache");
      return res.end(readFileSync(path));
    }

    if (parts[0] !== "api" || parts[1] !== "media") return next();
    const [, , id, kind] = parts;
    if (!id || !CONTRACT_ID.test(id)) return json(res, 400, { error: ERRORS.badId });

    if (req.method === "GET" && !kind) {
      const media: Partial<Record<Kind, string>> = {};
      for (const f of filesOf(id)) media[f.split(".")[0] as Kind] = `/media/${id}/${f}`;
      return json(res, 200, media);
    }

    if (!isKind(kind)) return json(res, 400, { error: ERRORS.badKind });
    const isOrganizer = req.headers["x-organizer-token"] === token;

    if (req.method === "DELETE") {
      if (!isOrganizer) return json(res, 403, { error: ERRORS.forbidden });
      const existing = findFile(id, kind);
      if (existing) rmSync(join(root, id, existing));
      return json(res, 200, { ok: true });
    }

    if (req.method === "PUT") {
      const existing = findFile(id, kind);
      if (existing && !isOrganizer) return json(res, 409, { error: ERRORS.duplicate });
      const family = KINDS[kind];
      const body = await readBody(req, MAX_BYTES[family]);
      if (!body) return json(res, 413, { error: ERRORS.tooBig(family) });
      const format = sniff(body);
      if (!format || format.family !== family) return json(res, 415, { error: ERRORS.badFormat(family) });
      if (!isOrganizer && !(await registered(id))) return json(res, 403, { error: ERRORS.notRegistered });
      mkdirSync(join(root, id), { recursive: true });
      if (existing) rmSync(join(root, id, existing));
      writeFileSync(join(root, id, `${kind}.${format.ext}`), body);
      return json(res, 200, { url: `/media/${id}/${kind}.${format.ext}` });
    }

    return json(res, 405, { error: "Método no permitido" });
  };

  const announce = (server: { config: { logger: { info(msg: string): void } } }) =>
    server.config.logger.info(`\n  🎙️  Token del organizador para reemplazar audios: ${token}\n`);

  return {
    name: "cvm-media",
    configureServer(server) {
      dev = server;
      server.middlewares.use(handler);
      server.httpServer?.once("listening", () => announce(server));
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
      server.httpServer?.once("listening", () => announce(server));
    },
  };
}
