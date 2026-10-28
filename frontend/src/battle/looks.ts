// Cómo se ve cada luchador: el CONTRACT_ID decide el personaje (uno de 6 por bando) y sus colores, así dos
// luchadores del mismo bando casi nunca se ven idénticos. En pelea se usan las ilustraciones de
// public/fighters/ (spriteKey); los dibujos con código de abajo quedan de respaldo.
import type Phaser from "phaser";

export type Team = "JARANA" | "TERROR";

export interface Look {
  variant: number;
  skin: number;
  accent: number;
  detail: number;
  /** Detalle opcional de cada personaje (barba, aretes, cadenas, murciélago…). */
  flair: boolean;
  /** Estampado del pañuelo / del forro. */
  dotted: boolean;
}

const SKINS = [0xb98260, 0x9a6648, 0xd2a983, 0x7f563c, 0xc4946b];
const JARANA_ACCENTS = [0xb8323a, 0xd9b47b, 0xf08a3c, 0x3f8f86, 0x6b4f9a, 0xe7e9d8];
const TERROR_ACCENTS = [0xa98bff, 0x7fd8a4, 0xf08a3c, 0xc23b5a, 0x8fc7d9, 0xd9b47b];

const INK = 0x0a0f0e;
const RIM = 0xd9b47b;
const GLOW = 0xffd27a;
const BONE = 0xdcd7c6;
const HAIR = 0x1c1410;

export const JARANA_VARIANTS = ["Cajonero", "Guitarrista", "Marinero", "Cantora", "Abuelo de peña", "Anticuchera"];
export const TERROR_VARIANTS = ["Calabaza", "Fantasma", "Vampiro", "Bruja", "Calaca", "Llorona"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function lookFor(id: string, team: Team): Look {
  const h = hash(id);
  const accents = team === "JARANA" ? JARANA_ACCENTS : TERROR_ACCENTS;
  const accent = accents[(h >>> 7) % accents.length];
  let detail = accents[(h >>> 11) % accents.length];
  if (detail === accent) detail = accents[((h >>> 11) + 1) % accents.length];
  return {
    variant: h % 6,
    skin: SKINS[(h >>> 3) % SKINS.length],
    accent,
    detail,
    flair: ((h >>> 17) & 1) === 1,
    dotted: ((h >>> 19) & 1) === 1,
  };
}

/** Color del puño (el único trozo que la escena anima aparte). */
export function fistColor(team: Team, look: Look, house = false) {
  if (house) return 0xa3312f; // guante de box
  if (team === "JARANA") return look.skin;
  return [0x262033, 0xcfd8cc, 0xc8cfc6, 0x8fae7a, 0xe6e1d0, 0xc9d1cf][look.variant];
}

// ─── Pinceles ───────────────────────────────────────────────────────────────

function mix(a: number, b: number, k: number) {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k) << s;
  return m(16) | m(8) | m(0);
}
const shade = (c: number, k = 0.38) => mix(c, INK, k);
const light = (c: number, k = 0.25) => mix(c, 0xffffff, k);

type G = Phaser.GameObjects.Graphics;
// Phaser solo lee x e y de cada punto, aunque el tipo pida Vector2
type P = Phaser.Math.Vector2;
const pts = (...xy: number[]) => Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[i * 2], y: xy[i * 2 + 1] }) as P);

/** Rectángulo redondeado con la espalda (izquierda) en sombra y contorno de tinta. */
function block(g: G, x: number, y: number, w: number, h: number, r: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha).fillRoundedRect(x, y, w, h, r);
  const sw = w * 0.36;
  const sr = Math.min(r, sw / 2, h / 2);
  g.fillStyle(shade(color), alpha).fillRoundedRect(x, y, sw, h, { tl: sr, bl: sr, tr: 0, br: 0 });
  g.lineStyle(3, INK, 0.95).strokeRoundedRect(x, y, w, h, r);
}

/** Óvalo con media luna de sombra a la izquierda. */
function orb(g: G, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
  g.fillStyle(shade(color), alpha).fillEllipse(x, y, w, h);
  g.fillStyle(color, alpha).fillEllipse(x + w * 0.09, y - h * 0.03, w * 0.86, h * 0.92);
  g.lineStyle(3, INK, 0.95).strokeEllipse(x, y, w, h);
}

function poly(g: G, color: number, points: P[], alpha = 1, outline = true) {
  g.fillStyle(color, alpha).fillPoints(points, true);
  if (outline) g.lineStyle(3, INK, 0.95).strokePoints(points, true);
}

/** Luz del farol rozando el borde derecho/superior. */
function rim(g: G, x: number, y: number, r: number, from = -1.3, to = 0.2) {
  g.lineStyle(2.5, RIM, 0.75).beginPath().arc(x, y, r - 3, from, to).strokePath();
}

function feet(g: G, color = 0x15110f) {
  for (const x of [-15, 19]) {
    g.fillStyle(color).fillEllipse(x, -4, 38, 13);
    g.lineStyle(2, light(color, 0.35), 0.6).lineBetween(x - 2, -8, x + 12, -8);
  }
}

/** Ruedo en zigzag de derecha a izquierda, de x0 a x1. */
function zigzag(x0: number, x1: number, y: number, teeth: number, depth: number) {
  const out: number[] = [];
  const step = (x0 - x1) / teeth;
  for (let i = 0; i <= teeth; i++) out.push(x0 - i * step, i % 2 ? y - depth : y);
  return out;
}

function eye(g: G, x: number, y: number, lash = false) {
  g.fillStyle(INK).fillEllipse(x, y, 7, 9);
  g.fillStyle(0xffffff, 0.9).fillCircle(x + 1.5, y - 2, 1.6);
  if (lash) g.lineStyle(2.5, INK).lineBetween(x - 2, y - 5, x + 7, y - 8);
}

function flower(g: G, x: number, y: number, color: number, r = 7) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.fillStyle(color).fillCircle(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.6);
  }
  g.fillStyle(GLOW).fillCircle(x, y, r * 0.35);
  g.lineStyle(1.5, INK, 0.7).strokeCircle(x, y, r * 1.1);
}

// ─── Team Jarana ────────────────────────────────────────────────────────────
// Todas las figuras miran a la derecha, con los pies en (0, 0) y ~260px de alto.

const HEAD = { x: 4, y: -208, r: 28 };

function head(g: G, skin: number) {
  orb(g, -16, -206, 12, 16, skin); // oreja
  orb(g, HEAD.x, HEAD.y, HEAD.r * 2, HEAD.r * 2, skin);
  rim(g, HEAD.x, HEAD.y, HEAD.r);
  g.fillStyle(0xd06a5a, 0.22).fillCircle(22, -198, 6);
}

function moustache(g: G, color = HAIR) {
  poly(g, color, pts(6, -194, 28, -196, 30, -188, 18, -190, 8, -186), 1, false);
}

function smile(g: G) {
  g.lineStyle(2.5, INK, 0.8).beginPath().arc(20, -186, 6, 0.4, 1.6).strokePath();
}

function neckerchief(g: G, look: Look) {
  const c = look.detail === 0xe7e9d8 ? 0xb8323a : look.detail;
  poly(g, c, pts(-18, -180, 20, -180, 2, -144));
  if (look.dotted) {
    g.fillStyle(0xe7e9d8, 0.8);
    for (const [x, y] of [[-8, -174], [6, -174], [0, -162], [12, -170]]) g.fillCircle(x, y, 2);
  } else {
    g.fillStyle(light(c, 0.35), 0.8).fillTriangle(-10, -178, 2, -178, -2, -160);
  }
  orb(g, 2, -176, 14, 10, shade(c, 0.1));
}

function shirt(g: G, color = BONE) {
  block(g, -41, -184, 82, 100, 22, color);
  g.fillStyle(INK, 0.8);
  for (const y of [-160, -142, -124]) g.fillCircle(6, y, 2.4);
}

function sash(g: G, color: number) {
  block(g, -41, -110, 82, 15, 3, color);
  poly(g, color, pts(-30, -98, -18, -98, -24, -66));
  poly(g, shade(color, 0.2), pts(-40, -98, -28, -98, -38, -72));
}

function legs(g: G, color: number) {
  block(g, -29, -98, 23, 94, 7, color);
  block(g, 6, -98, 23, 94, 7, color);
  feet(g);
}

/** Falda larga con vuelo y ruedo festoneado. */
function skirt(g: G, color: number, hemY = -6, ruffle = true) {
  poly(g, color, pts(-40, -112, 40, -112, 62, hemY, -62, hemY));
  g.fillStyle(shade(color), 1).fillPoints(pts(-40, -112, -14, -112, -26, hemY, -62, hemY), true);
  g.lineStyle(3, INK, 0.95).strokePoints(pts(-40, -112, 40, -112, 62, hemY, -62, hemY), true);
  g.lineStyle(2, light(color, 0.2), 0.6).lineBetween(0, -108, 6, hemY - 4).lineBetween(26, -108, 40, hemY - 4);
  if (ruffle) for (let x = -56; x <= 56; x += 16) orb(g, x, hemY, 18, 10, light(color, 0.12));
  feet(g);
}

function strawHat(g: G, straw: number, brim: number, band: number, withFlower: boolean) {
  orb(g, 4, -228, brim, 19, straw);
  block(g, -20, -262, 48, 36, 12, straw);
  g.lineStyle(1.5, shade(straw, 0.25), 0.7);
  for (let y = -254; y < -232; y += 6) g.lineBetween(-14, y, 24, y);
  g.fillStyle(band).fillRect(-20, -236, 48, 7);
  g.lineStyle(2, INK).strokeRect(-20, -236, 48, 7);
  if (withFlower) flower(g, 22, -234, 0xb8323a, 6);
  rim(g, 4, -244, 26, -1.6, -0.2);
}

export function drawJarana(g: G, look: Look) {
  const v = look.variant;

  if (v === 0) {
    // Cajonero: cajón a la espalda, mangas remangadas y sombrero de paja
    block(g, -82, -128, 46, 64, 4, 0x8a5a2e);
    g.fillStyle(0x1a0f08).fillCircle(-56, -100, 9);
    g.lineStyle(2, light(0x8a5a2e), 0.6).strokeRect(-76, -122, 34, 52);
    legs(g, 0x2a2f33);
    shirt(g);
    g.lineStyle(2.5, shade(BONE, 0.25)).lineBetween(24, -150, 40, -150).lineBetween(24, -144, 40, -144);
    sash(g, look.accent);
    neckerchief(g, look);
    head(g, look.skin);
    eye(g, 17, -211);
    g.lineStyle(3, INK).lineBetween(10, -222, 23, -219);
    moustache(g);
    smile(g);
    if (look.flair) g.fillStyle(HAIR, 0.35).fillEllipse(14, -186, 30, 14); // barba de tres días
    strawHat(g, 0xcfae6e, 104, look.accent, look.flair);
    return;
  }

  if (v === 1) {
    // Guitarrista: guitarra con correa y fedora de fieltro
    block(g, -56, -214, 9, 92, 2, 0x4a2c14);
    block(g, -60, -226, 17, 16, 3, 0x2a1a0e);
    for (const y of [-222, -216]) g.fillStyle(RIM).fillCircle(-62, y, 2).fillCircle(-41, y, 2);
    orb(g, -52, -104, 52, 46, 0xa8692e);
    orb(g, -52, -138, 40, 36, 0xa8692e);
    g.fillStyle(0x1a0f08).fillCircle(-50, -124, 7);
    g.lineStyle(1, 0xe7e9d8, 0.45).lineBetween(-53, -214, -53, -92).lineBetween(-49, -214, -49, -92);
    legs(g, 0x23272b);
    shirt(g, 0xcfd3c4);
    g.lineStyle(5, shade(look.detail, 0.2)).lineBetween(-36, -178, 30, -102); // correa
    sash(g, look.accent);
    neckerchief(g, look);
    head(g, look.skin);
    eye(g, 17, -211);
    g.lineStyle(3, INK).lineBetween(10, -220, 23, -222);
    moustache(g);
    smile(g);
    // Patillas
    g.fillStyle(HAIR).fillRect(-8, -218, 6, 20);
    orb(g, 6, -230, 92, 16, 0x2a2420);
    block(g, -18, -266, 48, 38, 14, 0x2a2420);
    g.fillStyle(look.accent).fillRect(-18, -240, 48, 7);
    g.lineStyle(2, INK).strokeRect(-18, -240, 48, 7);
    if (look.flair) g.lineStyle(3, RIM).lineBetween(-8, -240, -2, -258); // pluma
    rim(g, 6, -246, 26, -1.6, -0.2);
    return;
  }

  if (v === 2) {
    // Marinero: pantalón blanco, chaleco y pañuelo en la mano
    legs(g, 0xcfcab9);
    shirt(g);
    poly(g, shade(look.accent, 0.15), pts(-41, -170, -12, -170, 0, -120, -6, -96, -41, -96));
    poly(g, look.accent, pts(41, -170, 16, -170, 10, -120, 16, -96, 41, -96));
    g.fillStyle(RIM).fillCircle(30, -140, 2.5).fillCircle(30, -124, 2.5);
    sash(g, shade(look.accent, 0.3));
    neckerchief(g, look);
    head(g, look.skin);
    eye(g, 17, -211);
    g.lineStyle(3, INK).lineBetween(10, -222, 23, -219);
    if (look.flair) moustache(g);
    smile(g);
    strawHat(g, 0xe2cf9c, 76, INK, false);
    // Pañuelo al aire, atado al cinturón
    poly(g, 0xe7e9d8, pts(38, -104, 62, -90, 54, -70, 44, -84));
    g.fillStyle(0xb8323a).fillTriangle(46, -96, 58, -88, 52, -78);
    return;
  }

  if (v === 3) {
    // Cantora: moño, flor en el pelo, mantón con flecos y falda de vuelo
    orb(g, -22, -222, 30, 30, HAIR); // moño
    skirt(g, look.accent);
    block(g, -36, -182, 72, 76, 22, BONE);
    // Mantón cruzado con flecos
    poly(g, look.detail, pts(-44, -178, 44, -178, 20, -126, -8, -112, -40, -130));
    g.lineStyle(1.5, light(look.detail, 0.3), 0.8);
    for (let x = -36; x <= 14; x += 6) g.lineBetween(x, -124 + (x + 36) * 0.18, x - 2, -110 + (x + 36) * 0.18);
    if (look.dotted) {
      g.fillStyle(light(look.detail, 0.45), 0.9);
      for (const [x, y] of [[-24, -164], [-4, -156], [18, -164], [6, -140]]) flower(g, x, y, light(look.detail, 0.4), 4);
    }
    orb(g, HEAD.x, HEAD.y, HEAD.r * 2, HEAD.r * 2, look.skin);
    rim(g, HEAD.x, HEAD.y, HEAD.r);
    // Pelo recogido con raya
    poly(g, HAIR, pts(-24, -206, -20, -230, 0, -240, 26, -234, 32, -222, 14, -226, -2, -222, -10, -206));
    eye(g, 18, -210, true);
    g.fillStyle(0xa3312f).fillEllipse(22, -188, 10, 5); // labios
    g.fillStyle(0xd06a5a, 0.3).fillCircle(22, -198, 6);
    flower(g, -16, -230, 0xb8323a, 8);
    if (look.flair) flower(g, -4, -240, light(look.accent, 0.2), 5);
    g.fillStyle(RIM).fillCircle(-12, -190, 3.5); // arete
    return;
  }

  if (v === 4) {
    // Abuelo de peña: boina, lentes, chompa, corbatín y bastón
    g.lineStyle(6, 0x4a2c14).lineBetween(-46, -6, -40, -138);
    g.lineStyle(6, 0x4a2c14).beginPath().arc(-30, -138, 10, Math.PI, Math.PI * 2).strokePath();
    legs(g, 0x3a3631);
    shirt(g, 0xd6d0bd);
    const cardigan = shade(look.accent, 0.25);
    poly(g, cardigan, pts(-42, -178, -4, -178, 6, -92, -42, -92));
    poly(g, cardigan, pts(42, -178, 16, -178, 14, -92, 42, -92));
    g.fillStyle(INK, 0.7).fillCircle(20, -150, 2.5).fillCircle(20, -126, 2.5).fillCircle(20, -104, 2.5);
    // Corbatín
    poly(g, look.detail, pts(-8, -180, 2, -174, -8, -168));
    poly(g, look.detail, pts(12, -180, 2, -174, 12, -168));
    head(g, look.skin);
    // Pelo blanco a los lados y bigote canoso
    orb(g, -10, -200, 12, 18, 0xe6e1d0);
    moustache(g, 0xe6e1d0);
    smile(g);
    eye(g, 17, -210);
    g.lineStyle(2.5, RIM).strokeCircle(17, -210, 8).lineBetween(9, -212, -10, -214); // lentes
    g.lineStyle(3, 0xe6e1d0).lineBetween(10, -224, 24, -222);
    if (look.flair) {
      // Pipa
      g.lineStyle(3, 0x4a2c14).lineBetween(26, -188, 40, -184);
      block(g, 36, -196, 10, 14, 3, 0x4a2c14);
    }
    // Boina
    orb(g, 2, -234, 70, 26, 0x2f2b28);
    g.fillStyle(0x2f2b28).fillRect(-6, -250, 6, 8);
    g.lineStyle(3, INK).lineBetween(-30, -226, 38, -224);
    g.lineStyle(2.5, RIM, 0.75).lineBetween(8, -246, 30, -240);
    return;
  }

  // Anticuchera: pañuelo en la cabeza, mandil y anticuchos a la espalda
  g.lineStyle(4, 0x6b4a2c).lineBetween(-62, -40, -40, -200).lineBetween(-50, -40, -26, -196);
  for (let i = 0; i < 4; i++) {
    orb(g, -58 + i * 3.4, -180 + i * 24, 16, 14, 0x7a3a22);
    orb(g, -44 + i * 3.6, -176 + i * 24, 16, 14, 0x7a3a22);
  }
  skirt(g, 0x2e3330, -40, false);
  block(g, -14, -46, 13, 42, 5, look.skin);
  block(g, 6, -46, 13, 42, 5, look.skin);
  feet(g, 0x2b1d14);
  block(g, -38, -182, 76, 76, 20, 0xc9c3b2);
  // Mandil con bolsillo
  block(g, -26, -150, 56, 108, 6, 0xe7e9d8);
  block(g, -12, -104, 28, 20, 3, 0xdcd7c6);
  g.lineStyle(3, shade(look.accent, 0.1)).lineBetween(-36, -150, 36, -150);
  head(g, look.skin);
  eye(g, 18, -210, true);
  g.fillStyle(0xa3312f).fillEllipse(22, -188, 9, 4);
  // Pañuelo de cabeza con nudo atrás
  poly(g, look.accent, pts(-26, -214, -18, -236, 4, -242, 30, -232, 32, -220, 2, -226, -16, -212));
  if (look.dotted) {
    g.fillStyle(0xe7e9d8, 0.85);
    for (const [x, y] of [[-10, -228], [6, -234], [20, -228]]) g.fillCircle(x, y, 2.2);
  }
  poly(g, shade(look.accent, 0.2), pts(-26, -222, -46, -230, -40, -210));
  poly(g, shade(look.accent, 0.2), pts(-26, -218, -44, -202, -32, -198));
  if (look.flair) g.fillStyle(RIM).fillCircle(-12, -190, 3.5);
}

// ─── Team Halloween ─────────────────────────────────────────────────────────

/** Capa angosta en los hombros, abierta al frente y con el ruedo deshilachado. */
function cape(g: G, color: number, lining: number) {
  poly(g, color, pts(-34, -192, 30, -192, 42, -150, ...zigzag(64, -78, -2, 8, 22), -78, -40));
  poly(g, lining, pts(14, -186, 34, -186, 60, -8, 26, -8));
  g.lineStyle(2, light(color, 0.18), 0.55).lineBetween(-20, -176, -46, -30).lineBetween(-2, -180, -14, -26);
  orb(g, -14, -184, 50, 26, color); // hombros
}

function glowEyes(g: G, color: number, y = -210) {
  for (const x of [12, 30]) {
    g.fillStyle(color, 0.25).fillCircle(x, y, 9);
    g.fillStyle(color).fillEllipse(x, y, 7, 5);
  }
}

function bat(g: G, x: number, y: number) {
  poly(g, 0x15111f, pts(x - 22, y - 4, x - 10, y - 10, x - 4, y - 2, x, y - 8, x + 4, y - 2, x + 10, y - 10, x + 22, y - 4, x + 12, y + 2, x + 6, y + 8, x, y + 2, x - 6, y + 8, x - 12, y + 2));
  g.fillStyle(0xe5484d).fillCircle(x - 2, y - 2, 1.4).fillCircle(x + 2, y - 2, 1.4);
}

export function drawTerror(g: G, look: Look) {
  const v = look.variant;

  if (v === 1) {
    // Fantasma: sábana con pliegues y ruedo ondulado
    const sheet = 0xcfd8cc;
    for (const r of [120, 90, 62]) g.fillStyle(look.accent, 0.05).fillCircle(4, -150, r);
    poly(g, sheet, pts(-54, -150, -40, -232, 0, -258, 42, -232, 56, -150, ...zigzag(54, -54, -52, 6, -18)), 0.93);
    g.fillStyle(shade(sheet, 0.3), 0.6).fillPoints(pts(-54, -150, -40, -232, -14, -250, -24, -150, -30, -46, -54, -50), true);
    g.lineStyle(2, shade(sheet, 0.35), 0.6).lineBetween(10, -170, 2, -60).lineBetween(32, -160, 30, -70);
    g.fillStyle(INK).fillEllipse(10, -206, 15, 24).fillEllipse(36, -206, 15, 24);
    g.fillStyle(look.accent, 0.9).fillCircle(12, -204, 2.6).fillCircle(38, -204, 2.6);
    g.fillStyle(INK, 0.9).fillEllipse(26, -170, 16, 20);
    if (look.flair) {
      // Cadena con grillete
      g.lineStyle(3, 0x6f7a76);
      for (let i = 0; i < 6; i++) g.strokeEllipse(-40 - i * 4, -90 + i * 12, 10, 14);
      orb(g, -66, -6, 26, 24, 0x3a403e);
    }
    return;
  }

  if (v === 3) {
    // Bruja: escoba, vestido con picos, piel verde y sombrero puntiagudo
    g.lineStyle(6, 0x6b4a2c).lineBetween(-60, -230, -40, -30);
    poly(g, 0xa88a4a, pts(-46, -60, -32, -60, -18, 0, -64, 0));
    g.lineStyle(1.5, shade(0xa88a4a, 0.3)).lineBetween(-40, -56, -50, -2).lineBetween(-34, -56, -30, -2);
    const dress = 0x1f2a24;
    poly(g, dress, pts(-30, -186, 30, -186, 50, -60, ...zigzag(58, -60, -4, 8, 20), -50, -60));
    g.fillStyle(shade(dress), 1).fillPoints(pts(-30, -186, -6, -186, -20, -4, -60, -4), true);
    block(g, -41, -110, 82, 12, 3, look.accent);
    g.fillStyle(RIM).fillRect(-4, -110, 12, 12);
    const green = 0x8fae7a;
    orb(g, HEAD.x, HEAD.y, 54, 56, green);
    rim(g, HEAD.x, HEAD.y, 27);
    poly(g, green, pts(26, -212, 48, -196, 26, -196)); // nariz
    g.fillStyle(shade(green, 0.3)).fillCircle(38, -200, 3); // verruga
    glowEyes(g, look.accent);
    g.lineStyle(2.5, INK, 0.85).beginPath().arc(20, -184, 7, 0.2, 2.2).strokePath();
    // Pelo en mechas
    g.lineStyle(4, 0x3a2a48);
    for (const [x0, x1] of [[-20, -34], [-12, -30], [-4, -22]]) g.lineBetween(x0, -226, x1, -170);
    // Sombrero puntiagudo con la punta doblada
    orb(g, 4, -232, 112, 20, 0x15111f);
    poly(g, 0x15111f, pts(-26, -236, 32, -236, 14, -290, 44, -306, 4, -296));
    g.fillStyle(look.accent).fillRect(-22, -246, 50, 8);
    g.lineStyle(2, INK).strokeRect(-22, -246, 50, 8);
    if (look.flair) bat(g, 52, -268);
    return;
  }

  if (v === 4) {
    // Calaca: traje negro con huesos pintados, cráneo y sombrero de copa con cempasúchil
    const suit = 0x15131c;
    for (const x of [-18, 16]) {
      block(g, x - 11, -98, 23, 94, 7, suit);
      g.lineStyle(4, BONE).lineBetween(x, -92, x, -54).lineBetween(x, -48, x, -10);
      g.fillStyle(BONE).fillCircle(x, -51, 5);
    }
    feet(g, 0x0f0c12);
    block(g, -40, -184, 80, 94, 18, suit);
    g.lineStyle(3.5, BONE);
    g.lineBetween(2, -176, 2, -100);
    for (let i = 0; i < 4; i++) {
      const y = -166 + i * 15;
      g.beginPath().arc(2, y + 14, 26 - i * 2, -2.6, -0.5).strokePath();
    }
    orb(g, 2, -96, 34, 14, BONE); // pelvis
    // Cráneo
    orb(g, HEAD.x, HEAD.y - 2, 56, 54, 0xe6e1d0);
    block(g, -6, -190, 32, 16, 6, 0xe6e1d0);
    g.fillStyle(INK).fillEllipse(12, -212, 15, 17).fillEllipse(32, -212, 13, 16);
    g.fillStyle(look.accent).fillCircle(13, -211, 2.6).fillCircle(32, -211, 2.4);
    g.fillStyle(INK).fillTriangle(20, -200, 26, -200, 23, -193);
    g.lineStyle(2, INK);
    for (let x = -2; x <= 22; x += 6) g.lineBetween(x, -188, x, -176);
    g.lineBetween(-4, -182, 24, -182);
    rim(g, HEAD.x, HEAD.y - 2, 28);
    // Sombrero de copa
    orb(g, 4, -234, 80, 14, 0x15131c);
    block(g, -20, -284, 48, 52, 4, 0x15131c);
    g.fillStyle(look.accent).fillRect(-20, -246, 48, 8);
    flower(g, 22, -244, 0xf08a3c, 9);
    if (look.flair) flower(g, 8, -248, 0xf08a3c, 6);
    return;
  }

  if (v === 5) {
    // Llorona: vestido largo deshilachado, velo oscuro y pelo largo
    const dress = 0xc9d1cf;
    for (const r of [110, 80]) g.fillStyle(look.accent, 0.04).fillCircle(4, -140, r);
    poly(g, dress, pts(-30, -184, 32, -184, 52, -80, ...zigzag(62, -64, -6, 10, 24), -54, -80), 0.92);
    g.fillStyle(shade(dress, 0.3), 0.7).fillPoints(pts(-30, -184, -8, -184, -24, -10, -64, -6, -54, -80), true);
    g.lineStyle(2, shade(dress, 0.35), 0.6).lineBetween(10, -160, 18, -30).lineBetween(30, -150, 44, -40);
    // Pelo largo por la espalda
    poly(g, HAIR, pts(-30, -226, -10, -238, 0, -200, -16, -120, -38, -140));
    const pale = 0xc8cfc6;
    orb(g, HEAD.x, HEAD.y, 52, 56, pale);
    g.fillStyle(INK).fillEllipse(12, -210, 10, 14).fillEllipse(30, -210, 10, 14);
    g.fillStyle(look.accent, 0.9).fillCircle(13, -208, 2.2).fillCircle(31, -208, 2.2);
    // Lágrimas que brillan
    g.lineStyle(2, look.accent, 0.8).lineBetween(12, -202, 10, -186).lineBetween(30, -202, 30, -188);
    g.fillStyle(INK, 0.85).fillEllipse(22, -186, 10, 8);
    // Velo translúcido
    poly(g, 0x15111f, pts(-30, -228, -8, -246, 24, -242, 38, -224, 14, -230, -10, -222, -44, -110, -56, -140), 0.82);
    g.lineStyle(1.5, look.accent, 0.4).lineBetween(-8, -240, -46, -124);
    if (look.flair) flower(g, -2, -238, 0xe7e9d8, 7); // rosa blanca
    return;
  }

  // Calabaza y Vampiro comparten capa
  feet(g, 0x0f0c12);
  block(g, 6, -176, 30, 150, 10, 0x262033);
  cape(g, 0x1b1726, v === 2 ? 0x7a1d2b : shade(look.accent, 0.45));

  if (v === 0) {
    // Calabaza tallada que brilla por dentro
    const pumpkin = 0xd9792e;
    orb(g, -16, -214, 46, 62, shade(pumpkin, 0.15));
    orb(g, 26, -214, 46, 62, pumpkin);
    orb(g, 6, -214, 50, 66, pumpkin);
    rim(g, 6, -214, 34, -1.4, 0);
    poly(g, 0x4c6b3a, pts(2, -244, 10, -244, 14, -262, 22, -266, 18, -258, 12, -244));
    g.fillStyle(GLOW, 0.18).fillCircle(22, -208, 30);
    g.fillStyle(GLOW);
    g.fillTriangle(8, -224, 22, -224, 15, -210).fillTriangle(28, -224, 42, -224, 35, -210);
    poly(g, GLOW, pts(2, -198, 44, -198, 40, -186, 34, -192, 28, -184, 22, -192, 16, -184, 10, -192, 6, -186), 1, false);
    if (look.flair) {
      // Enredadera por la capa
      g.lineStyle(3, 0x4c6b3a).beginPath().arc(-30, -120, 30, -1.2, 1.6).strokePath();
      orb(g, -6, -104, 14, 9, 0x5f8a45);
      orb(g, -44, -96, 14, 9, 0x5f8a45);
    }
    return;
  }

  // Vampiro: cuello alto, peinado en pico y colmillos
  poly(g, look.accent === 0x7fd8a4 ? 0x7a1d2b : shade(look.accent, 0.2), pts(-48, -184, -4, -176, -44, -244));
  poly(g, 0x1b1726, pts(-48, -184, -26, -180, -46, -232), 1, false);
  const pale = 0xc8cfc6;
  orb(g, 6, -208, 54, 58, pale);
  rim(g, 6, -208, 29);
  poly(g, 0x0f0c12, pts(-22, -214, -18, -236, 4, -242, 32, -234, 30, -226, 16, -228, 10, -218, 2, -228, -12, -222));
  g.fillStyle(look.accent, 0.3).fillCircle(20, -210, 10);
  g.fillStyle(look.accent).fillEllipse(20, -210, 8, 6);
  g.lineStyle(3, INK).lineBetween(12, -220, 28, -216);
  g.lineStyle(2.5, INK, 0.8).lineBetween(12, -190, 30, -192);
  g.fillStyle(0xffffff).fillTriangle(16, -191, 21, -191, 18.5, -182).fillTriangle(23, -192, 28, -192, 25.5, -183);
  orb(g, 4, -150, 16, 16, RIM); // medallón
  if (look.flair) bat(g, -30, -200);
}

// ─── De la casa ─────────────────────────────────────────────────────────────

/** El Saco de Box: un saco de cuero colgado de su cadena, con cara de cinta adhesiva. */
export function drawSaco(g: G, look: Look) {
  g.lineStyle(4, 0x6f7a76);
  // Cadena que sube hasta fuera de cuadro
  for (let i = 0; i < 22; i++) g.strokeEllipse(4, -560 + i * 14, 10, 16);
  block(g, -8, -252, 24, 10, 3, 0x4a4f4d);
  const leather = 0xa3312f;
  block(g, -42, -244, 92, 214, 30, leather);
  g.fillStyle(light(leather, 0.2), 0.5).fillRoundedRect(22, -226, 10, 160, 5);
  // Costuras y franjas
  g.lineStyle(2, shade(leather, 0.4), 0.9);
  for (const y of [-200, -80]) g.lineBetween(-42, y, 50, y);
  g.fillStyle(look.accent).fillRect(-42, -150, 92, 12);
  g.lineStyle(2, INK).strokeRect(-42, -150, 92, 12);
  // Cinta adhesiva en cruz y cara pintada con plumón
  g.lineStyle(12, 0xd6d0bd, 0.92).lineBetween(-34, -120, 2, -150).lineBetween(-30, -136, -2, -108);
  g.lineStyle(3, INK);
  g.lineBetween(14, -224, 24, -214).lineBetween(24, -224, 14, -214); // ojo en X
  g.strokeCircle(36, -218, 5);
  g.beginPath().arc(26, -170, 10, 3.6, 5.8).strokePath(); // boca de enojo
  g.lineBetween(30, -232, 42, -228);
  // Parches
  block(g, -28, -110, 22, 18, 3, shade(leather, 0.15));
  g.lineStyle(1.5, INK, 0.7).lineBetween(-24, -106, -10, -96).lineBetween(-10, -106, -24, -96);
  orb(g, 4, -30, 92, 16, shade(leather, 0.2));
}

// ─── Ilustraciones ──────────────────────────────────────────────────────────
// Cada personaje tiene una ilustración semirrealista en public/fighters (mirando a la derecha,
// con fondo transparente). Los dibujos de arriba quedan de respaldo si la imagen no carga.

export const SPRITES = [
  ...JARANA_VARIANTS.map((_, i) => `jarana-${i}`),
  ...TERROR_VARIANTS.map((_, i) => `terror-${i}`),
  "saco",
];

export function spriteKey(team: Team, look: Look, house = false) {
  if (house) return "saco";
  return `${team === "JARANA" ? "jarana" : "terror"}-${look.variant}`;
}

/** Luz de medianoche teñida apenas con el color del luchador, para distinguir a dos del mismo personaje. */
export function spriteTint(look: Look) {
  return mix(0xd6d2c6, look.accent, 0.14);
}
