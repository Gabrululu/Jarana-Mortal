// El callejón limeño a medianoche y la coreografía de cada ronda.
// La escena NO calcula nada: solo dramatiza lo que la Arena ya resolvió on-chain.
import Phaser from "phaser";
import { drawJarana, drawSaco, drawTerror, fistColor, lookFor, SPRITES, spriteKey, spriteTint, type Team } from "./looks";

export const W = 1280;
export const H = 720;
const GROUND = 610;
const X_A = 440;
const X_B = 840;

const NORMAL = 1;
const FUERTE = 2;
const GUARDIA = 3;

const MOVE_LABEL: Record<number, string> = { 0: "¡TROPIEZO!", 1: "NORMAL", 2: "FUERTE", 3: "GUARDIA" };
const TEAM_COLOR: Record<Team, number> = { JARANA: 0xf08a3c, TERROR: 0xa98bff };
// Alto en pantalla de las ilustraciones de luchadores (las imágenes miden 520px)
const SPRITE_HEIGHT = 330;
const FONT = '"Anton", Impact, sans-serif';

export type Side = "a" | "b";

export interface FighterView {
  id: string;
  name: string;
  team: Team;
  maxHp: number;
  /** Luchador de la casa (el Saco de Box): se dibuja como un saco de verdad. */
  house?: boolean;
}

export interface RoundView {
  round: number;
  move_a: number;
  move_b: number;
  damage_to_a: number;
  damage_to_b: number;
  hp_a: number;
  hp_b: number;
  missed_a: boolean;
  missed_b: boolean;
  countered_a: boolean;
  countered_b: boolean;
}

/** Señales para el audio (lo maneja React con Howler). */
export type Cue =
  | { type: "intro" }
  | { type: "round"; round: number }
  | { type: "hit"; side: Side; heavy: boolean; blocked: boolean }
  | { type: "miss"; side: Side }
  | { type: "counter"; side: Side }
  | { type: "guard"; side: Side }
  | { type: "stumble"; side: Side }
  | { type: "finish"; winner: Side; knockout: boolean };

const other = (s: Side): Side => (s === "a" ? "b" : "a");

/** Personajes que no caminan: flotan sobre el piso. */
const FLOATERS = new Set(["terror-1", "terror-5"]);
/** Altura de la cintura en la ilustración (0 = cabeza, 1 = pies): ahí se dobla el torso. */
const WAIST = 0.54;
const SEAM = 0.03;

type Rig = "standing" | "floating" | "hanging" | "drawn";

class Fighter extends Phaser.GameObjects.Container {
  readonly dir: 1 | -1;
  private figure: Phaser.GameObjects.Container;
  /** Torso que se inclina en golpes y daño; dentro, `chest` respira y se mece sin chocar con esas animaciones. */
  private torso: Phaser.GameObjects.Container;
  private chest: Phaser.GameObjects.Container;
  private parts: Phaser.GameObjects.Image[] = [];
  private tint: number;
  private rig: Rig;
  private fist: Phaser.GameObjects.Arc;
  private shield: Phaser.GameObjects.Arc;
  private shadow: Phaser.GameObjects.Ellipse;
  private idle: Phaser.Tweens.Tween[] = [];

  constructor(scene: BattleScene, readonly view: FighterView, side: Side) {
    super(scene, side === "a" ? X_A : X_B, GROUND);
    this.dir = side === "a" ? 1 : -1;
    const look = lookFor(view.id, view.team);
    this.tint = spriteTint(look);

    this.shadow = scene.add.ellipse(0, 0, 160, 26, 0x000000, 0.55);
    // Charco de luz de farol bajo los pies
    const pool = scene.add.ellipse(0, 2, 240, 40, 0xd9b47b, 0.07);
    const key = spriteKey(view.team, look, view.house);
    const hasSprite = scene.textures.exists(key);
    this.rig = !hasSprite ? "drawn" : view.house ? "hanging" : FLOATERS.has(key) ? "floating" : "standing";

    // El torso gira sobre la cintura; el saco, sobre su cadena; los que flotan, sobre los pies
    const baseY = view.house ? -24 : 4;
    const pivotFrac = this.rig === "standing" ? WAIST : this.rig === "hanging" ? 0 : 1;
    const pivotY = baseY - (1 - pivotFrac) * SPRITE_HEIGHT;
    this.torso = scene.add.container(0, pivotY);
    this.chest = scene.add.container(0, 0);
    this.torso.add(this.chest);
    const pieces: Phaser.GameObjects.GameObject[] = [this.torso];

    if (hasSprite) {
      const scale = SPRITE_HEIGHT / 520;
      const make = (y: number) => {
        const img = scene.add.image(0, y, key).setOrigin(0.5, 1).setScale(scale).setTint(this.tint);
        this.parts.push(img);
        return img;
      };
      const upper = make(baseY - pivotY);
      this.chest.add(upper);
      if (this.rig === "standing") {
        // Dos copias recortadas de la misma ilustración: las piernas quedan plantadas y tapan la costura
        const { width: fw, height: fh } = upper.frame;
        upper.setCrop(0, 0, fw, fh * (WAIST + SEAM));
        pieces.push(make(baseY).setCrop(0, fh * (WAIST - SEAM), fw, fh * (1 - WAIST + SEAM)));
      }
    } else {
      const g = scene.add.graphics();
      if (view.house) drawSaco(g, look);
      else if (view.team === "JARANA") drawJarana(g, look);
      else drawTerror(g, look);
      g.setY(-pivotY);
      this.chest.add(g);
    }

    // El puño solo se ve en los dibujos de respaldo; con ilustración el golpe lo da el torso
    this.fist = scene.add.circle(34, -150, 13, fistColor(view.team, look, view.house));
    this.fist.setStrokeStyle(3, 0x0a0f0e).setVisible(!hasSprite);
    pieces.push(this.fist);
    this.figure = scene.add.container(0, 0, pieces);
    this.figure.setScale(this.dir, 1);

    this.shield = scene.add.circle(0, -160, 170, TEAM_COLOR[view.team], 0.12);
    this.shield.setStrokeStyle(5, TEAM_COLOR[view.team], 0.9).setAlpha(0).setScale(0.6);

    this.add([pool, this.shadow, this.figure, this.shield]);
    scene.add.existing(this);
    this.startIdle();
  }

  /** La escena, o undefined si ya se destruyó (p. ej. al salir de la Arena a mitad de pelea). */
  private get s(): BattleScene | undefined {
    return this.scene as BattleScene | undefined;
  }

  private stopIdle() {
    for (const t of this.idle) t.stop();
    this.idle = [];
  }

  /** Respira, se mece y cambia el peso de pie; cada luchador con su propio ritmo. */
  startIdle() {
    this.stopIdle();
    const tw = this.scene.tweens;
    const loop = { yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: Phaser.Math.Between(0, 900) };
    this.figure.setY(0).setAngle(0).setScale(this.dir, 1);
    this.chest.setAngle(0).setScale(1);

    if (this.rig === "hanging") {
      // Péndulo lento colgado de la cadena
      this.chest.setAngle(-2.5);
      this.idle.push(tw.add({ targets: this.chest, angle: 2.5, duration: 1700, ...loop }));
      return;
    }
    if (this.rig === "floating") {
      this.idle.push(tw.add({ targets: this.figure, y: -14, duration: 1300, ...loop }));
      this.idle.push(tw.add({ targets: this.chest, angle: 2.5, duration: 2100, ...loop }));
      this.idle.push(tw.add({ targets: this.shadow, scaleX: 0.8, alpha: 0.35, duration: 1300, ...loop }));
      return;
    }
    // De pie: el pecho sube al respirar y el torso se mece en guardia
    this.idle.push(tw.add({ targets: this.chest, scaleY: 1.025, scaleX: 1.01, duration: 900, ...loop }));
    this.chest.setAngle(-1.5);
    this.idle.push(tw.add({ targets: this.chest, angle: 2, duration: 1400, ...loop }));
    this.idle.push(tw.add({ targets: this.figure, y: 3, duration: 700, ...loop }));
  }

  /** Destello al recibir un golpe: blanco y luego rojo si fue fuerte. */
  private flash(heavy: boolean) {
    const s = this.s;
    if (!s || !this.parts.length) return;
    const set = (color: number | null) => {
      for (const p of this.parts) {
        if (color === null) p.setTint(this.tint).setTintMode(Phaser.TintModes.MULTIPLY);
        else p.setTint(color).setTintMode(Phaser.TintModes.FILL);
      }
    };
    set(0xffffff);
    s.time.delayedCall(s.d(60), () => set(heavy ? 0xe5484d : null));
    if (heavy) s.time.delayedCall(s.d(150), () => set(null));
  }

  /** Polvo del adoquín al plantar el pie. */
  private dust() {
    const s = this.s;
    if (!s) return;
    for (let i = 0; i < 4; i++) {
      const puff = s.add.ellipse(this.x - this.dir * (20 + i * 14), GROUND - 4, 26, 12, 0xb9cbb7, 0.35).setDepth(this.depth);
      s.tweens.add({
        targets: puff,
        x: puff.x - this.dir * Phaser.Math.Between(20, 50),
        y: GROUND - Phaser.Math.Between(10, 30),
        scale: 2.4,
        alpha: 0,
        duration: s.d(420 + i * 60),
        ease: "Quad.easeOut",
        onComplete: () => puff.destroy(),
      });
    }
  }

  /** Anticipación (retrocede y carga el torso) → golpe (se estira hacia el rival) → regreso. */
  async lunge(heavy: boolean) {
    const s = this.s;
    if (!s) return;
    const back = heavy ? 46 : 20;
    const reach = heavy ? 230 : 170;
    s.tween({ targets: this.torso, angle: heavy ? -14 : -8, scaleY: 0.97, duration: heavy ? 260 : 140, ease: "Quad.easeOut" });
    await s.tween({ targets: this, x: this.x - back * this.dir, duration: heavy ? 260 : 140, ease: "Quad.easeOut" });
    this.dust();
    s.tween({ targets: this.fist, x: 92, duration: 120, ease: "Quad.easeIn" });
    s.tween({ targets: this.torso, angle: heavy ? 18 : 11, scaleY: 1.03, duration: 120, ease: "Back.easeOut" });
    s.tween({ targets: this.figure, scaleX: this.dir * (heavy ? 1.08 : 1.04), duration: 120, ease: "Quad.easeOut" });
    await s.tween({ targets: this, x: this.homeX + reach * this.dir, duration: heavy ? 150 : 130, ease: "Quad.easeIn" });
  }

  async retreat() {
    const s = this.s;
    if (!s) return;
    s.tween({ targets: this.fist, x: 34, duration: 220, ease: "Quad.easeOut" });
    s.tween({ targets: this.torso, angle: 0, scaleY: 1, duration: 260, ease: "Quad.easeOut" });
    s.tween({ targets: this.figure, scaleX: this.dir, duration: 260, ease: "Quad.easeOut" });
    await s.tween({ targets: this, x: this.homeX, duration: 300, ease: "Quad.easeOut" });
  }

  get homeX() {
    return this.dir === 1 ? X_A : X_B;
  }

  hurt(heavy: boolean) {
    const s = this.s;
    if (!s) return;
    this.flash(heavy);
    s.tween({ targets: this, x: this.homeX - (heavy ? 60 : 30) * this.dir, duration: 120, yoyo: true, ease: "Quad.easeOut" });
    // El torso se va hacia atrás con el impacto y vuelve con rebote
    const hanging = this.rig === "hanging";
    const snap = hanging ? (heavy ? -26 : -16) : heavy ? -22 : -13;
    s.tween({ targets: this.torso, angle: snap, duration: 90, ease: "Quad.easeOut" }).then(() =>
      s.tween({ targets: this.torso, angle: 0, duration: hanging ? 900 : 420, ease: "Elastic.easeOut" }),
    );
    if (this.rig === "drawn") s.tween({ targets: this.figure, alpha: 0.35, duration: 60, yoyo: true, repeat: heavy ? 2 : 1 });
  }

  async dodge() {
    const s = this.s;
    if (!s) return;
    s.tween({ targets: this.torso, angle: -24, scaleY: 0.94, duration: 140, yoyo: true, ease: "Quad.easeOut" });
    await s.tween({ targets: this, x: this.homeX - 70 * this.dir, y: GROUND - 18, duration: 140, yoyo: true, ease: "Quad.easeOut" });
  }

  raiseGuard() {
    const s = this.s;
    if (!s) return;
    s.tween({ targets: this.shield, alpha: 1, scale: 1, duration: 200, ease: "Back.easeOut" });
    // Se encoge detrás de la guardia
    s.tween({ targets: this.torso, angle: -6, scaleY: 0.95, duration: 200, ease: "Quad.easeOut" });
  }

  lowerGuard() {
    const s = this.s;
    if (!s) return;
    s.tween({ targets: this.shield, alpha: 0, scale: 0.6, duration: 200, ease: "Quad.easeIn" });
    s.tween({ targets: this.torso, angle: 0, scaleY: 1, duration: 200, ease: "Quad.easeOut" });
  }

  crackShield() {
    this.s?.tween({ targets: this.shield, scale: 0.9, duration: 70, yoyo: true });
  }

  async stumble() {
    const s = this.s;
    if (!s) return;
    s.tween({ targets: this.torso, angle: 16, duration: 200, yoyo: true, hold: 260, ease: "Quad.easeOut" });
    await s.tween({ targets: this.figure, angle: 22 * this.dir, y: 10, duration: 200, ease: "Quad.easeOut" });
    await s.wait(260);
    await s.tween({ targets: this.figure, angle: 0, y: 0, duration: 260, ease: "Back.easeOut" });
  }

  async fall() {
    this.stopIdle();
    const s = this.s;
    if (!s) return;
    this.flash(true);
    if (this.rig === "hanging") {
      // El saco no se cae: queda girando en su cadena
      await s.tween({ targets: this.torso, angle: -40, duration: 260, ease: "Quad.easeOut" });
      s.tween({ targets: this.torso, angle: 0, duration: 2400, ease: "Elastic.easeOut" });
      return;
    }
    s.tween({ targets: this.torso, angle: -18, duration: 300, ease: "Quad.easeOut" });
    s.tween({ targets: this.shadow, scaleX: 1.6, duration: 520 });
    await s.tween({ targets: this.figure, angle: -84 * this.dir, y: 18, duration: 520, ease: "Bounce.easeOut" });
    s.tween({ targets: this.figure, alpha: 0.6, duration: 400 });
  }

  celebrate() {
    this.stopIdle();
    const s = this.s;
    if (!s) return;
    s.tween({ targets: this.figure, y: -60, duration: 280, yoyo: true, repeat: 3, ease: "Quad.easeOut" });
    s.tween({ targets: this.shadow, scaleX: 0.6, alpha: 0.3, duration: 280, yoyo: true, repeat: 3, ease: "Quad.easeOut" });
    this.torso.setAngle(-8);
    s.tween({ targets: this.torso, angle: 8, duration: 280, yoyo: true, repeat: 3, ease: "Sine.easeInOut" }).then(() => this.torso.setAngle(0));
  }
}

class HpBar {
  private bar: Phaser.GameObjects.Graphics;
  private value = 1;
  private shown = 1;
  private name: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  readonly moveText: Phaser.GameObjects.Text;
  private max = 1;
  private color = 0xffffff;

  constructor(private scene: BattleScene, private side: Side) {
    const left = side === "a";
    const x = left ? 60 : W - 60;
    this.bar = scene.add.graphics().setDepth(20);
    this.name = scene.add
      .text(x, 26, "", { fontFamily: FONT, fontSize: "30px", color: "#e7e9d8" })
      .setOrigin(left ? 0 : 1, 0)
      .setDepth(20)
      .setShadow(0, 3, "#000", 6, true, true);
    this.hpText = scene.add
      .text(left ? x + 500 : x - 500, 100, "", { fontFamily: FONT, fontSize: "20px", color: "#a7b3a7" })
      .setOrigin(left ? 1 : 0, 0)
      .setDepth(20);
    this.moveText = scene.add
      .text(x, 100, "", { fontFamily: FONT, fontSize: "24px", color: "#d9b47b" })
      .setOrigin(left ? 0 : 1, 0)
      .setDepth(20)
      .setAlpha(0);
  }

  set(view: FighterView) {
    this.max = view.maxHp;
    this.color = TEAM_COLOR[view.team];
    this.name.setText(`${view.team === "JARANA" ? "🎸" : "🎃"} ${view.name}`);
    this.value = this.shown = view.maxHp;
    this.draw();
  }

  clear() {
    this.bar.clear();
    this.name.setText("");
    this.hpText.setText("");
    this.moveText.setAlpha(0);
  }

  to(hp: number) {
    if (hp === this.value) return;
    const from = this.shown;
    this.value = hp;
    this.scene.tweens.addCounter({
      from,
      to: hp,
      duration: this.scene.d(420),
      ease: "Quad.easeOut",
      onUpdate: (t) => {
        this.shown = t.getValue() ?? hp;
        this.draw();
      },
    });
  }

  private draw() {
    const left = this.side === "a";
    const w = 500;
    const x = left ? 60 : W - 60 - w;
    const pct = Math.max(0, this.shown / this.max);
    const g = this.bar.clear();
    g.fillStyle(0x090f0e, 0.85).fillRect(x - 4, 66, w + 8, 30);
    const fill = pct > 0.5 ? this.color : pct > 0.2 ? 0xd9b47b : 0xe5484d;
    const fw = Math.max(0, w * pct);
    if (fw > 1) {
      g.fillStyle(fill).fillRect(left ? x : x + w - fw, 70, fw, 22);
      g.fillStyle(0xffffff, 0.18).fillRect(left ? x : x + w - fw, 70, fw, 5);
    }
    // Marcas cada 10% como en las fichas de la web
    g.fillStyle(0x090f0e, 0.55);
    for (let i = 1; i < 10; i++) g.fillRect(x + (w * i) / 10 - 1, 70, 2, 22);
    g.lineStyle(2, 0xb9cbb7, 0.3).strokeRect(x - 4, 66, w + 8, 30);
    this.hpText.setText(`${Math.round(this.shown)} / ${this.max}`);
  }
}

export class BattleScene extends Phaser.Scene {
  speed = 1;
  private fighters: Partial<Record<Side, Fighter>> = {};
  private bars!: Record<Side, HpBar>;
  private roundText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private bell!: Phaser.GameObjects.Container;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private cueListener?: (cue: Cue) => void;

  constructor() {
    super("battle");
  }

  onCue(fn: (cue: Cue) => void) {
    this.cueListener = fn;
  }

  private cue(c: Cue) {
    this.cueListener?.(c);
  }

  /** Duración ajustada a la velocidad de repetición. */
  d(ms: number) {
    return ms / this.speed;
  }

  wait(ms: number) {
    return new Promise<void>((ok) => this.time.delayedCall(this.d(ms), ok));
  }

  tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig & { duration: number }) {
    return new Promise<void>((ok) => this.tweens.add({ ...cfg, duration: this.d(cfg.duration), onComplete: () => ok() }));
  }

  preload() {
    this.load.image("stage", "/art/stage.jpg");
    for (const key of SPRITES) this.load.image(key, `/fighters/${key}.webp`);
  }

  create() {
    this.drawAlley();

    const dot = this.add.graphics().fillStyle(0xffffff).fillCircle(4, 4, 4);
    dot.generateTexture("dot", 8, 8);
    dot.destroy();
    this.sparks = this.add.particles(0, 0, "dot", {
      speed: { min: 180, max: 520 },
      lifespan: 420,
      scale: { start: 1.3, end: 0 },
      tint: [0xffe7a3, 0xd9b47b, 0xffffff],
      blendMode: "ADD",
      emitting: false,
    }).setDepth(15);
    this.confetti = this.add.particles(0, 0, "dot", {
      x: { min: 0, max: W },
      y: -10,
      speedY: { min: 160, max: 360 },
      speedX: { min: -60, max: 60 },
      lifespan: 3200,
      scale: { min: 0.8, max: 1.8 },
      rotate: { min: 0, max: 360 },
      emitting: false,
    }).setDepth(30);

    this.bars = { a: new HpBar(this, "a"), b: new HpBar(this, "b") };
    this.roundText = this.add
      .text(W / 2, 40, "", { fontFamily: FONT, fontSize: "34px", color: "#e7e9d8" })
      .setOrigin(0.5, 0)
      .setDepth(20)
      .setShadow(0, 3, "#000", 6, true, true);
    this.banner = this.add
      .text(W / 2, H / 2 - 60, "", { fontFamily: FONT, fontSize: "96px", color: "#d9b47b", align: "center" })
      .setOrigin(0.5)
      .setDepth(40)
      .setStroke("#090f0e", 12)
      .setAlpha(0);
    this.sub = this.add
      .text(W / 2, H / 2 + 90, "", { fontFamily: FONT, fontSize: "30px", color: "#e7e9d8", align: "center" })
      .setOrigin(0.5)
      .setDepth(40)
      .setStroke("#090f0e", 8)
      .setAlpha(0);

    this.showIdleTitle();
    this.game.events.emit("battle-ready", this);
  }

  // ─── Escenario ────────────────────────────────────────────────────────────

  private drawAlley() {
    // Ilustración del callejón (public/art/stage.jpg); los luchadores siguen siendo procedurales
    this.add.image(W / 2, H / 2, "stage").setDisplaySize(W, H);
    this.add.rectangle(W / 2, H / 2, W, H, 0x090f0e, 0.25);

    // Luz parpadeante de los faroles, en halos suaves
    for (const [x, y, r] of [[62, 280, 60], [1222, 298, 60], [256, 372, 34], [878, 380, 34]] as const) {
      const glow = this.add.container(x, y, [1, 0.65, 0.35].map((k) => this.add.circle(0, 0, r * k, 0xd9b47b, 0.06).setBlendMode(Phaser.BlendModes.ADD)));
      this.tweens.add({ targets: glow, alpha: 0.3, duration: 90, yoyo: true, repeat: -1, repeatDelay: Phaser.Math.Between(1800, 4200), ease: "Stepped" });
    }

    // Campana del ring, colgada bajo el marcador de rondas
    this.add.graphics().lineStyle(2, 0x090f0e, 0.9).lineBetween(W / 2, 84, W / 2, 104);
    const bellG = this.add.graphics().fillStyle(0xd9b47b).fillTriangle(-14, 22, 14, 22, 0, -2).fillCircle(0, 4, 11);
    this.bell = this.add.container(W / 2, 110, [bellG]);

    // Neblina que cruza la calle
    for (let i = 0; i < 5; i++) {
      const fog = this.add.ellipse(i * 320, GROUND - 40 + (i % 2) * 30, 620, 130, 0xb9cbb7, 0.07);
      this.tweens.add({ targets: fog, x: fog.x + 180, duration: 9000 + i * 1500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  private showIdleTitle() {
    this.tweens.killTweensOf([this.banner, this.sub]);
    this.roundText.setText("");
    this.banner.setText("JARANA MORTAL\nMIDNIGHT ARENA").setColor("#d9b47b").setFontSize(84).setAlpha(1).setScale(1);
    this.sub.setText("Esperando la próxima pelea on-chain…").setAlpha(0.8);
    this.tweens.add({ targets: this.sub, alpha: 0.35, duration: 1400, yoyo: true, repeat: -1 });
  }

  // ─── Coreografía ──────────────────────────────────────────────────────────

  private ring(times = 3) {
    this.tweens.add({ targets: this.bell, angle: { from: -24, to: 24 }, duration: 180, yoyo: true, repeat: times, ease: "Sine.easeInOut", onComplete: () => this.bell.setAngle(0) });
  }

  private async flashBanner(text: string, color: string, sub = "", hold = 900) {
    this.tweens.killTweensOf([this.banner, this.sub]);
    this.banner.setText(text).setColor(color).setFontSize(96).setScale(0.4).setAlpha(0);
    this.sub.setText(sub).setAlpha(0);
    this.tween({ targets: this.sub, alpha: sub ? 1 : 0, duration: 200, ease: "Quad.easeOut" });
    await this.tween({ targets: this.banner, alpha: 1, scale: 1, duration: 260, ease: "Back.easeOut" });
    await this.wait(hold);
    this.tween({ targets: [this.banner, this.sub], alpha: 0, duration: 200, ease: "Quad.easeIn" });
  }

  private floatText(side: Side, text: string, color: string, size = 54) {
    const f = this.fighters[side];
    if (!f) return;
    const t = this.add
      .text(f.x, GROUND - 300, text, { fontFamily: FONT, fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(25)
      .setStroke("#090f0e", 8);
    this.tweens.add({ targets: t, y: t.y - 90, alpha: 0, duration: this.d(1100), ease: "Quad.easeOut", onComplete: () => t.destroy() });
  }

  private showMove(side: Side, move: number) {
    const t = this.bars[side].moveText;
    t.setText(MOVE_LABEL[move] ?? "?").setColor(move === 0 ? "#e5484d" : move === FUERTE ? "#d9b47b" : move === GUARDIA ? "#7fd8a4" : "#e7e9d8");
    t.setAlpha(0).setScale(0.6);
    this.tween({ targets: t, alpha: 1, scale: 1, duration: 200, ease: "Back.easeOut" });
  }

  async showMatchup(a: FighterView, b: FighterView) {
    this.tweens.killTweensOf([this.banner, this.sub]);
    this.fighters.a?.destroy();
    this.fighters.b?.destroy();
    this.fighters = { a: new Fighter(this, a, "a").setDepth(10), b: new Fighter(this, b, "b").setDepth(10) };
    this.bars.a.set(a);
    this.bars.b.set(b);
    this.bars.a.moveText.setAlpha(0);
    this.bars.b.moveText.setAlpha(0);
    this.roundText.setText("");

    const fa = this.fighters.a!;
    const fb = this.fighters.b!;
    fa.x = -200;
    fb.x = W + 200;
    this.cue({ type: "intro" });
    this.ring(5);
    this.tween({ targets: fa, x: X_A, duration: 600, ease: "Quad.easeOut" });
    await this.tween({ targets: fb, x: X_B, duration: 600, ease: "Quad.easeOut" });
    await this.flashBanner("VS", "#e7e9d8", `${a.name}  ·  ${b.name}`, 1100);
  }

  async playRound(r: RoundView) {
    const { a, b } = this.fighters;
    if (!a || !b) return;
    this.roundText.setText(`RONDA ${r.round}`);
    this.cue({ type: "round", round: r.round });
    if (r.round === 1) this.ring(2);
    this.showMove("a", r.move_a);
    this.showMove("b", r.move_b);
    await this.wait(380);

    for (const side of ["a", "b"] as const) {
      const move = side === "a" ? r.move_a : r.move_b;
      if (move === GUARDIA) {
        this.fighters[side]!.raiseGuard();
        this.cue({ type: "guard", side });
      }
      if (move === 0) {
        this.cue({ type: "stumble", side });
        this.floatText(side, "🍌 ¡TROPIEZO!", "#e5484d", 40);
        await this.fighters[side]!.stumble();
      }
    }

    await this.act("a", r);
    await this.act("b", r);

    this.bars.a.to(r.hp_a);
    this.bars.b.to(r.hp_b);
    a.lowerGuard();
    b.lowerGuard();
    await this.wait(420);
  }

  private async act(side: Side, r: RoundView) {
    const me = this.fighters[side]!;
    const foeSide = other(side);
    const foe = this.fighters[foeSide]!;
    const move = side === "a" ? r.move_a : r.move_b;
    const foeMove = side === "a" ? r.move_b : r.move_a;
    const missed = side === "a" ? r.missed_a : r.missed_b;
    const countered = side === "a" ? r.countered_a : r.countered_b;
    const damage = side === "a" ? r.damage_to_b : r.damage_to_a;
    const foeHp = side === "a" ? r.hp_b : r.hp_a;
    const myHp = side === "a" ? r.hp_a : r.hp_b;

    if (move === NORMAL || move === FUERTE) {
      const heavy = move === FUERTE;
      await me.lunge(heavy);
      if (missed) {
        this.cue({ type: "miss", side });
        foe.dodge();
        this.floatText(foeSide, "¡FALLÓ!", "#a7b3a7", 46);
      } else {
        const blocked = foeMove === GUARDIA;
        this.cue({ type: "hit", side, heavy, blocked });
        foe.hurt(heavy);
        if (blocked) foe.crackShield();
        this.sparks.explode(heavy ? 46 : 22, foe.x - 40 * foe.dir, GROUND - 150);
        this.cameras.main.shake(this.d(heavy ? 260 : 120), heavy ? 0.012 : 0.005);
        if (heavy) this.cameras.main.flash(this.d(70), 120, 80, 40);
        this.floatText(foeSide, `-${damage}`, heavy ? "#d9b47b" : "#e5484d", heavy ? 72 : 56);
        this.bars[foeSide].to(foeHp);
      }
      await me.retreat();
    } else if (move === GUARDIA && countered) {
      this.cue({ type: "counter", side });
      this.floatText(side, "¡CONTRA!", "#a066ff", 44);
      await me.lunge(false);
      foe.hurt(false);
      this.sparks.explode(18, foe.x - 40 * foe.dir, GROUND - 150);
      this.floatText(foeSide, `-${damage}`, "#a066ff");
      this.bars[foeSide].to(foeHp);
      await me.retreat();
    } else if (move === GUARDIA && myHp > 0) {
      const heal = Math.floor((this.fighters[side]!.view.maxHp) / 20);
      if (heal > 0) this.floatText(side, `+${heal}`, "#7fd8a4", 40);
      await this.wait(200);
    }
  }

  async playFinish(winner: Side, knockout: boolean) {
    const w = this.fighters[winner];
    const l = this.fighters[other(winner)];
    if (!w || !l) return;
    this.cue({ type: "finish", winner, knockout });
    this.ring(7);
    if (knockout) await l.fall();
    w.celebrate();
    this.confetti.setParticleTint(TEAM_COLOR[w.view.team]);
    this.confetti.explode(160);
    await this.flashBanner(
      knockout ? "¡K.O.!" : "¡POR PUNTOS!",
      `#${TEAM_COLOR[w.view.team].toString(16).padStart(6, "0")}`,
      `Gana ${w.view.name}`,
      2600,
    );
  }

  reset() {
    this.fighters.a?.destroy();
    this.fighters.b?.destroy();
    this.fighters = {};
    this.bars.a.clear();
    this.bars.b.clear();
    this.showIdleTitle();
  }
}

export function createBattleGame(parent: HTMLElement): { game: Phaser.Game; ready: Promise<BattleScene> } {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: W,
    height: H,
    backgroundColor: "#090f0e",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true },
    scene: [BattleScene],
    banner: false,
  });
  const ready = new Promise<BattleScene>((ok) => game.events.once("battle-ready", ok));
  return { game, ready };
}
