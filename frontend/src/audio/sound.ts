// Audio del duelo: música (Suno) con Howler; voces (ElevenLabs) normalizadas con WebAudio; efectos y música de
// respaldo sintetizados para que el juego suene aunque todavía no haya archivos.
import { Howl, Howler } from "howler";
import type { Cue, Side } from "../battle/BattleScene";
import type { Playback } from "../battle/playback";

const TRACKS = ["/music/festejo-de-ultratumba.mp3", "/music/vals-del-mas-alla.mp3"];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
let musicVolume = 0.35;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  }
  return { ctx, out: master! };
}

/** Los navegadores exigen un clic antes de sonar: llámalo desde un botón. */
export async function enableSound() {
  enabled = true;
  await audio().ctx.resume();
  Howler.mute(false);
  startMusic();
}

export function disableSound() {
  enabled = false;
  Howler.mute(true);
  ctx?.suspend();
}

export const isSoundOn = () => enabled;

// ─── Síntesis ───────────────────────────────────────────────────────────────

function envelope(gain: GainNode, t: number, peak: number, decay: number) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(freq: number, decay: number, peak: number, type: OscillatorType = "sine", slideTo?: number, when = 0) {
  if (!enabled) return;
  const { ctx: c, out } = audio();
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + decay);
  envelope(g, t, peak, decay);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + decay + 0.05);
}

function noise(decay: number, peak: number, filter: BiquadFilterType, from: number, to = from) {
  if (!enabled) return;
  const { ctx: c, out } = audio();
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, decay + 0.05);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + decay);
  const g = c.createGain();
  envelope(g, t, peak, decay);
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

export const sfx = {
  punch(heavy: boolean) {
    noise(heavy ? 0.28 : 0.14, heavy ? 0.9 : 0.6, "lowpass", heavy ? 1800 : 1200, 200);
    tone(heavy ? 110 : 150, heavy ? 0.35 : 0.18, heavy ? 0.9 : 0.6, "sine", 45);
  },
  whoosh: () => noise(0.3, 0.35, "bandpass", 500, 2400),
  shield: () => {
    tone(880, 0.25, 0.25, "triangle");
    tone(1320, 0.3, 0.15, "sine", undefined, 0.04);
  },
  stumble: () => tone(900, 0.5, 0.3, "triangle", 260),
  counter: () => {
    tone(320, 0.12, 0.35, "square", 180);
    noise(0.12, 0.5, "lowpass", 1400, 300);
  },
  /** Campana de iglesia: parciales inarmónicos que se apagan lento. */
  bell(times = 1) {
    for (let i = 0; i < times; i++) {
      for (const [ratio, peak] of [[1, 0.35], [2, 0.18], [2.4, 0.14], [3, 0.1], [4.2, 0.06]] as const) {
        tone(196 * ratio, 2.6, peak, "sine", undefined, i * 0.9);
      }
    }
  },
};

// ─── Música ─────────────────────────────────────────────────────────────────

let music: Howl | null = null;
let trackIndex = 0;

function startMusic() {
  if (music) {
    if (!music.playing()) music.play();
    return;
  }
  const next = () => {
    const src = TRACKS[trackIndex++ % TRACKS.length];
    music = new Howl({
      src: [src],
      html5: true,
      volume: musicVolume,
      onend: () => {
        music?.unload();
        music = null;
        if (enabled) next();
      },
      // Todavía no hay pista de Suno en public/music: suena la versión sintetizada
      onloaderror: () => {
        music = null;
        if (enabled) startSynthMusic((trackIndex - 1) % TRACKS.length);
      },
    });
    music.play();
  };
  if (synth) synth.resume();
  else next();
}

export function setMusicVolume(v: number) {
  musicVolume = v;
  music?.volume(v);
  synth?.volume(v);
}

/** Baja la música mientras habla un luchador. */
function duck(ms: number) {
  synth?.duck(ms);
  if (!music) return;
  music.fade(musicVolume, musicVolume * 0.3, 150);
  setTimeout(() => music?.fade(musicVolume * 0.3, musicVolume, 400), ms);
}

// ─── Música de respaldo ─────────────────────────────────────────────────────
// Dos loops con secuenciador WebAudio para ensayar sin archivos. Cuando el organizador deja sus mp3 en
// public/music/ con los nombres de TRACKS, se usan esos.

interface Song {
  bpm: number;
  /** Pasos por compás (12 = festejo en 12/8, 6 = vals en 3/4 a corcheas). */
  steps: number;
  /** Acordes en semitonos desde La 2 (110 Hz), uno por compás. */
  chords: number[][];
  step(t: number, i: number, chord: number[], dur: number): void;
}

const hz = (semi: number, base = 110) => base * 2 ** (semi / 12);

let musicBus: GainNode | null = null;

function bus() {
  const { ctx: c, out } = audio();
  if (!musicBus) {
    musicBus = c.createGain();
    musicBus.gain.value = musicVolume;
    musicBus.connect(out);
  }
  return { c, bus: musicBus };
}

function note(t: number, freq: number, dur: number, peak: number, type: OscillatorType, cutoff = 4000, detune = 0) {
  const { c, bus: out } = bus();
  const osc = c.createOscillator();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  f.type = "lowpass";
  f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(f).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function hitAt(t: number, decay: number, peak: number, filter: BiquadFilterType, freq: number, body = 0) {
  const { c, bus: out } = bus();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, decay + 0.05);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  if (body) {
    const osc = c.createOscillator();
    const bg = c.createGain();
    osc.frequency.setValueAtTime(body, t);
    osc.frequency.exponentialRampToValueAtTime(body / 2, t + decay);
    bg.gain.setValueAtTime(peak * 1.4, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(bg).connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }
}

/** Festejo de ultratumba: cajón en 12/8 + órgano de iglesia en menor. */
const FESTEJO: Song = {
  bpm: 132,
  steps: 12,
  chords: [[0, 3, 7], [5, 8, 12], [-2, 2, 5], [-5, -1, 2]], // Am · Dm · G · E
  step(t, i, chord, dur) {
    // Cajón: grave en 1 y 7, agudos sincopados del festejo
    if (i === 0 || i === 7) hitAt(t, 0.18, 0.5, "lowpass", 300, 90);
    if ([3, 5, 9, 11].includes(i)) hitAt(t, 0.08, 0.32, "highpass", 2200);
    if ([2, 6, 10].includes(i)) hitAt(t, 0.03, 0.12, "highpass", 6000); // quijada
    // Órgano: acorde sostenido cada compás, con quinta grave
    if (i === 0) {
      for (const s of chord) note(t, hz(s, 220), dur * 12, 0.05, "square", 1800, 4);
      note(t, hz(chord[0], 55), dur * 12, 0.12, "sawtooth", 500);
    }
    // Bajo festejo: tumbao en 1, 4 y 8
    if ([0, 3, 8].includes(i)) note(t, hz(chord[0] + (i === 3 ? 7 : 0), 55), dur * 2, 0.22, "triangle", 900);
  },
};

/** Vals del más allá: guitarras punteadas en 3/4 + pad de synthwave desafinado. */
const VALS: Song = {
  bpm: 168,
  steps: 6,
  chords: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-5, -1, 2], [5, 8, 12], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]],
  step(t, i, chord, dur) {
    // Bajo en el 1, rasgueo en el 2 y el 3
    if (i === 0) note(t, hz(chord[0], 55), dur * 2, 0.25, "triangle", 700);
    if (i === 2 || i === 4) chord.forEach((s, k) => note(t + k * 0.012, hz(s, 220), dur * 1.5, 0.07, "sawtooth", 2200));
    // Punteo de guitarra: arpegio en corcheas
    if (i % 2 === 1) note(t, hz(chord[(i >> 1) % 3] + 12, 220), dur * 1.2, 0.06, "triangle", 3000);
    // Pad espectral por compás: dos osciladores desafinados
    if (i === 0) {
      for (const d of [-12, 12]) note(t, hz(chord[1], 220), dur * 6, 0.025, "sawtooth", 1200, d);
    }
  },
};

const SONGS = [FESTEJO, VALS];
/** Compases por canción antes de pasar a la otra. */
const BARS_PER_SONG = 32;

interface Synth {
  resume(): void;
  volume(v: number): void;
  duck(ms: number): void;
}

let synth: Synth | null = null;

function startSynthMusic(first: number) {
  const { c, bus: out } = bus();
  let song = first;
  let bar = 0;
  let stepIdx = 0;
  let nextAt = c.currentTime + 0.1;
  let timer: ReturnType<typeof setInterval>;

  const schedule = () => {
    if (!enabled) return;
    // Programamos 200 ms hacia adelante para que los setInterval irregulares no se noten
    while (nextAt < c.currentTime + 0.2) {
      const s = SONGS[song];
      const dur = 60 / s.bpm / (s.steps === 12 ? 3 : 2);
      s.step(nextAt, stepIdx, s.chords[bar % s.chords.length], dur);
      nextAt += dur;
      if (++stepIdx === s.steps) {
        stepIdx = 0;
        if (++bar === BARS_PER_SONG) {
          bar = 0;
          song = (song + 1) % SONGS.length;
          nextAt += 1; // respiro entre canciones
        }
      }
    }
  };
  timer = setInterval(schedule, 50);

  synth = {
    resume() {
      clearInterval(timer);
      nextAt = Math.max(nextAt, c.currentTime + 0.1);
      timer = setInterval(schedule, 50);
    },
    volume: (v) => out.gain.setTargetAtTime(v, c.currentTime, 0.1),
    duck(ms) {
      out.gain.setTargetAtTime(musicVolume * 0.3, c.currentTime, 0.05);
      setTimeout(() => out.gain.setTargetAtTime(musicVolume, c.currentTime, 0.15), ms);
    },
  };
}

// ─── Voces ──────────────────────────────────────────────────────────────────

export interface Media {
  attack?: string;
  defeat?: string;
  avatar?: string;
}

interface Voice {
  buffer: AudioBuffer;
  gain: number;
}

const voices = new Map<string, Promise<Voice | null>>();
/** Volumen RMS al que llevamos cada grito, para que ElevenLabs a todo volumen y un audio bajito suenen parejo. */
const VOICE_RMS = 0.14;

function loadVoice(url: string) {
  let v = voices.get(url);
  if (!v) {
    v = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((data) => audio().ctx.decodeAudioData(data))
      .then((buffer) => {
        const d = buffer.getChannelData(0);
        let peak = 0;
        let sum = 0;
        for (let i = 0; i < d.length; i++) {
          peak = Math.max(peak, Math.abs(d[i]));
          sum += d[i] * d[i];
        }
        const rms = Math.sqrt(sum / d.length) || 1;
        // El compresor de salida aguanta picos de hasta ~2× sin reventar
        return { buffer, gain: Math.min(VOICE_RMS / rms, 2 / (peak || 1)) };
      })
      .catch(() => null);
    voices.set(url, v);
  }
  return v;
}

let voiceOut: AudioNode | null = null;

function voiceBus() {
  const { ctx: c, out } = audio();
  if (!voiceOut) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    comp.connect(out);
    voiceOut = comp;
  }
  return voiceOut;
}

/** Hasta cuándo (ctx.currentTime) está hablando alguien: dos gritos a la vez no se entienden. */
let talkingUntil = 0;
/** Si el otro está gritando, esperamos turno hasta este máximo (un grito dura 1–4 s); más ya no va con el golpe. */
const MAX_VOICE_WAIT = 4.5;

async function voice(url: string | undefined, { interrupt = false } = {}) {
  if (!enabled || !url) return;
  const v = await loadVoice(url);
  if (!v || !enabled) return;
  const c = audio().ctx;
  const wait = interrupt ? 0 : Math.max(0, talkingUntil + 0.15 - c.currentTime);
  if (wait > MAX_VOICE_WAIT) return;
  talkingUntil = c.currentTime + wait + v.buffer.duration;
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = v.buffer;
  g.gain.value = v.gain;
  src.connect(g).connect(voiceBus());
  src.start(c.currentTime + wait);
  setTimeout(() => duck(v.buffer.duration * 1000), wait * 1000);
}

export async function fetchMedia(id: string): Promise<Media> {
  try {
    const res = await fetch(`/api/media/${id}`);
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

const DEFAULT_VOICE = (team: string, kind: "attack" | "defeat") => `/sounds/${team.toLowerCase()}-${kind}.mp3`;

/** Arma el reproductor de señales para una pelea: qué suena en cada golpe. */
export async function cuePlayer(p: Playback): Promise<(cue: Cue) => void> {
  const [ma, mb] = await Promise.all([fetchMedia(p.a.id), fetchMedia(p.b.id)]);
  const media: Record<Side, Media> = {
    a: { attack: ma.attack ?? DEFAULT_VOICE(p.a.team, "attack"), defeat: ma.defeat ?? DEFAULT_VOICE(p.a.team, "defeat") },
    b: { attack: mb.attack ?? DEFAULT_VOICE(p.b.team, "attack"), defeat: mb.defeat ?? DEFAULT_VOICE(p.b.team, "defeat") },
  };
  // Precargamos para que el primer grito no llegue tarde
  for (const m of Object.values(media)) for (const url of [m.attack, m.defeat]) if (url) loadVoice(url);
  const lastShout: Record<Side, number> = { a: -10, b: -10 };
  let round = 0;

  return (cue: Cue) => {
    switch (cue.type) {
      case "intro":
        sfx.bell(1);
        break;
      case "round":
        round = cue.round;
        break;
      case "hit":
        sfx.punch(cue.heavy);
        if (cue.blocked) sfx.shield();
        // El grito suena en los golpes fuertes y como mucho cada 3 rondas
        if ((cue.heavy || round === 1) && round - lastShout[cue.side] >= 3) {
          lastShout[cue.side] = round;
          voice(media[cue.side].attack);
        }
        break;
      case "miss":
        sfx.whoosh();
        break;
      case "counter":
        sfx.counter();
        break;
      case "guard":
        sfx.shield();
        break;
      case "stumble":
        sfx.stumble();
        break;
      case "finish":
        voice(media[cue.winner === "a" ? "b" : "a"].defeat, { interrupt: true });
        setTimeout(() => sfx.bell(3), 900);
        break;
    }
  };
}
