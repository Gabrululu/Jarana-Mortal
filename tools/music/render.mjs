// Compone y renderiza las dos pistas de pelea de la Arena a mp3: WebAudio offline (node-web-audio-api) + lamejs.
// Herramienta del organizador, fuera del workspace para que los asistentes no instalen librerías de audio:
//   pnpm music                         escribe frontend/public/music/*.mp3 (tarda unos minutos)
//   node tools/music/render.mjs <dir>  en otra carpeta
// Cada canción es una lista de compases (form) y una función play() que agenda las notas de cada instrumento.
import { OfflineAudioContext } from "node-web-audio-api";
import lamejs from "@breezystack/lamejs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SR = 44100;
const OUT = process.argv[2] ?? fileURLToPath(new URL("../../frontend/public/music", import.meta.url));
const TAIL = 3; // s de cola de reverb que se pliega al inicio para que el loop no corte

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const hz = (semi, base) => base * 2 ** (semi / 12);

function render(song) {
  const len = song.bars * song.barDur;
  const c = new OfflineAudioContext(2, Math.ceil((len + TAIL) * SR), SR);

  // ── Master: bus seco + reverb + compresor ──
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.01;
  comp.release.value = 0.18;
  comp.connect(c.destination);
  const dry = c.createGain();
  dry.connect(comp);
  const verb = c.createConvolver();
  const ir = c.createBuffer(2, SR * 2.6, SR);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.exp((-3.2 * i) / d.length) * (i < 200 ? i / 200 : 1);
  }
  verb.buffer = ir;
  const wet = c.createGain();
  wet.gain.value = 0.32;
  verb.connect(wet).connect(comp);

  const noiseBuf = c.createBuffer(1, SR * 2, SR);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;

  /** Canal con volumen, paneo y envío a reverb. */
  function channel(vol, pan = 0, send = 0.2) {
    const g = c.createGain();
    g.gain.value = vol;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(dry);
    if (send) {
      const s = c.createGain();
      s.gain.value = send;
      p.connect(s).connect(verb);
    }
    return g;
  }

  function env(g, t, a, peak, d, sustain = 0.0001, hold = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    if (hold) g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + hold + d);
  }

  function noise(dest, t, dur, type, freq, q, peak, a = 0.001) {
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    env(g, t, a, peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, rnd() * 1.5, dur + 0.05);
  }

  function osc(dest, t, dur, type, freq, peak, { a = 0.005, glideFrom, detune = 0, release } = {}) {
    const o = c.createOscillator();
    o.type = type;
    o.detune.value = detune;
    if (glideFrom) {
      o.frequency.setValueAtTime(glideFrom, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.7);
    } else o.frequency.value = freq;
    const g = c.createGain();
    env(g, t, a, peak, release ?? dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + (release ?? dur) + 0.05);
    return o;
  }

  const drive = (amount) => {
    const ws = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    ws.curve = curve;
    ws.oversample = "2x";
    return ws;
  };

  // ── Instrumentos ──
  const ch = song.mix(channel);

  const inst = {
    kick(t, v = 1) {
      osc(ch.drums, t, 0.32, "sine", 42, 1.1 * v, { a: 0.002, glideFrom: 160 });
      noise(ch.drums, t, 0.02, "highpass", 3000, 0.7, 0.35 * v);
    },
    snare(t, v = 1) {
      osc(ch.drums, t, 0.12, "triangle", 185, 0.5 * v, { a: 0.001, glideFrom: 240 });
      noise(ch.drums, t, 0.2, "highpass", 1400, 0.6, 0.75 * v);
      noise(ch.drumsVerb, t, 0.25, "bandpass", 3500, 0.8, 0.3 * v);
    },
    tom(t, f, v = 1) {
      osc(ch.drums, t, 0.3, "sine", f, 0.8 * v, { a: 0.002, glideFrom: f * 1.6 });
    },
    hat(t, v = 1, open = false) {
      noise(ch.hats, t, open ? 0.22 : 0.045, "highpass", 8000, 0.8, 0.35 * v);
    },
    crash(t, v = 1) {
      noise(ch.hats, t, 1.6, "highpass", 5000, 0.4, 0.4 * v);
    },
    cajonLow(t, v = 1) {
      osc(ch.cajon, t, 0.22, "sine", 62, 0.9 * v, { a: 0.002, glideFrom: 120 });
      noise(ch.cajon, t, 0.09, "lowpass", 900, 0.8, 0.35 * v);
    },
    cajonSlap(t, v = 1) {
      noise(ch.cajon, t, 0.1, "bandpass", 2300, 1.1, 0.9 * v);
      osc(ch.cajon, t, 0.05, "triangle", 420, 0.25 * v, { a: 0.001 });
    },
    quijada(t, v = 1) {
      for (let k = 0; k < 7; k++) noise(ch.perc, t + k * 0.022, 0.03, "bandpass", 4200 + k * 150, 6, 0.5 * v * (1 - k / 8));
    },
    /** Guitarra eléctrica distorsionada: quinta + octava, palm mute opcional. */
    power(t, root, dur, mute = false, v = 1) {
      const pre = c.createGain();
      pre.gain.value = 0.5;
      const sh = drive(mute ? 6 : 9);
      const cab = c.createBiquadFilter();
      cab.type = "lowpass";
      cab.frequency.value = mute ? 1100 : 3400;
      const mid = c.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 800;
      mid.gain.value = -5;
      const g = c.createGain();
      const d = mute ? Math.min(dur, 0.13) : dur;
      env(g, t, 0.004, 0.32 * v, d, mute ? 0.0001 : 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08);
      pre.connect(sh).connect(cab).connect(mid).connect(g).connect(ch.guitar);
      const dl = c.createDelay(0.05);
      dl.delayTime.value = 0.014;
      g.connect(dl).connect(ch.guitarR);
      for (const [s, det] of [[0, -6], [0, 7], [7, 5], [12, -4]]) {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(root + s, 110);
        o.detune.value = det;
        o.connect(pre);
        o.start(t);
        o.stop(t + d + 0.12);
      }
    },
    bass(t, semi, dur, v = 1) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.Q.value = 4;
      f.frequency.setValueAtTime(1400, t);
      f.frequency.exponentialRampToValueAtTime(260, t + 0.18);
      const sh = drive(2.5);
      const g = c.createGain();
      env(g, t, 0.004, 0.5 * v, dur * 0.95, 0.0001);
      f.connect(sh).connect(g).connect(ch.bass);
      osc(f, t, dur, "sawtooth", hz(semi, 55), 0.7, { a: 0.003 });
      osc(f, t, dur, "square", hz(semi - 12, 55), 0.5, { a: 0.003 });
    },
    /** Metales: sierras desafinadas con filtro que abre al atacar y vibrato tardío. */
    brass(t, semis, dur, base, v = 1, dest = ch.brass) {
      for (const semi of semis) {
        const f = c.createBiquadFilter();
        f.type = "lowpass";
        f.Q.value = 1.5;
        f.frequency.setValueAtTime(500, t);
        f.frequency.exponentialRampToValueAtTime(3200, t + 0.045);
        f.frequency.exponentialRampToValueAtTime(1900, t + 0.2);
        const g = c.createGain();
        const sus = dur > 0.3;
        env(g, t, 0.025, 0.16 * v, sus ? 0.08 : dur, sus ? 0.11 * v : 0.0001, 0);
        if (sus) {
          g.gain.setValueAtTime(0.11 * v, t + dur);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
        }
        f.connect(g).connect(dest);
        const lfo = c.createOscillator();
        lfo.frequency.value = 5.6;
        const depth = c.createGain();
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(sus ? 14 : 0, t + Math.min(0.35, dur));
        lfo.connect(depth);
        for (const det of [-9, 0, 9]) {
          const o = c.createOscillator();
          o.type = "sawtooth";
          const fr = hz(semi, base);
          o.frequency.setValueAtTime(fr * 0.97, t);
          o.frequency.exponentialRampToValueAtTime(fr, t + 0.04);
          o.detune.value = det;
          depth.connect(o.detune);
          o.connect(f);
          o.start(t);
          o.stop(t + dur + 0.2);
        }
        lfo.start(t);
        lfo.stop(t + dur + 0.2);
      }
    },
    /** Guitarra criolla punteada. */
    pluck(t, semi, base, v = 1, pan = 0) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(5000, t);
      f.frequency.exponentialRampToValueAtTime(700, t + 0.35);
      const p = c.createStereoPanner();
      p.pan.value = pan;
      f.connect(p).connect(ch.pluck);
      osc(f, t, 0.6, "triangle", hz(semi, base), 0.4 * v, { a: 0.002 });
      osc(f, t, 0.25, "sawtooth", hz(semi, base), 0.16 * v, { a: 0.001, detune: 4 });
    },
    /** Coro "aah": sierras por formantes. */
    choir(t, semis, dur, base, v = 1) {
      const sum = c.createGain();
      const g = c.createGain();
      env(g, t, 0.5, 0.5 * v, 0.1, 0.45 * v, Math.max(0, dur - 0.6));
      g.gain.setValueAtTime(0.45 * v, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
      for (const [fr, q, gain] of [[750, 8, 1], [1150, 9, 0.6], [2800, 10, 0.25]]) {
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = fr;
        bp.Q.value = q;
        const fg = c.createGain();
        fg.gain.value = gain * 3;
        sum.connect(bp).connect(fg).connect(g);
      }
      g.connect(ch.choir);
      for (const semi of semis)
        for (const det of [-14, -5, 6, 15]) {
          const o = c.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = hz(semi, base);
          o.detune.value = det;
          const vib = c.createOscillator();
          vib.frequency.value = 4.5 + rnd();
          const vd = c.createGain();
          vd.gain.value = 8;
          vib.connect(vd).connect(o.detune);
          o.connect(sum);
          o.start(t);
          vib.start(t);
          o.stop(t + dur + 0.9);
          vib.stop(t + dur + 0.9);
        }
    },
    /** Arpegio de synth cuadrado (contracanto). */
    arp(t, semi, base, v = 1) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 2600;
      f.connect(ch.arp);
      osc(f, t, 0.12, "square", hz(semi, base), 0.12 * v, { a: 0.002 });
    },
    bell(t, v = 1) {
      for (const [r, p] of [[1, 0.3], [2, 0.16], [2.4, 0.12], [3, 0.08], [4.2, 0.05]]) osc(ch.perc, t, 3.5, "sine", 98 * r, p * v, { a: 0.003 });
    },
  };

  song.play(inst);
  return c.startRendering().then((buf) => {
    const n = Math.round(len * SR);
    const chans = [0, 1].map((k) => {
      const d = buf.getChannelData(k);
      const out = new Float32Array(n);
      out.set(d.subarray(0, n));
      for (let i = n; i < d.length; i++) out[i - n] += d[i]; // cola de reverb al principio: loop sin corte
      return out;
    });
    let sum = 0;
    for (const d of chans) for (const x of d) sum += x * x;
    const rms = Math.sqrt(sum / (2 * n));
    const pre = 10 ** (-13 / 20) / rms; // RMS objetivo -13 dB, los picos los redondea el tanh
    const sat = chans.map((d) => d.map((x) => Math.tanh(x * pre * 1.1) / 1.1));
    let peak = 0;
    for (const d of sat) for (const x of d) peak = Math.max(peak, Math.abs(x));
    return sat.map((d) => d.map((x) => (x * 0.89) / peak));
  });
}

function mp3(chans, file) {
  const enc = new lamejs.Mp3Encoder(2, SR, 160);
  const toI16 = (d) => Int16Array.from(d, (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767))));
  const [l, r] = chans.map(toI16);
  const parts = [];
  for (let i = 0; i < l.length; i += 1152) parts.push(enc.encodeBuffer(l.subarray(i, i + 1152), r.subarray(i, i + 1152)));
  parts.push(enc.flush());
  const bytes = Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
  writeFileSync(file, bytes);
  console.log(file.split(/[\\/]/).pop(), `${(chans[0].length / SR).toFixed(1)} s`, `${(bytes.length / 1024).toFixed(0)} KB`);
}

// ═══ Pista 1: Festejo de ultratumba ═══════════════════════════════════════
// 150 BPM, La menor. Cajón y quijada con acentos de festejo + guitarras distorsionadas, bajo y metales.
const FESTEJO = (() => {
  const bpm = 150;
  const barDur = (4 * 60) / bpm;
  const s16 = barDur / 16;
  // Raíz (semitonos desde La 2) y tríada de metales (desde La 3) por acorde
  const C = {
    Am: { r: 0, tri: [12, 15, 19], tones: [0, 3, 7] },
    F: { r: -4, tri: [8, 12, 15], tones: [-4, 0, 3] },
    G: { r: -2, tri: [10, 14, 17], tones: [-2, 2, 5] },
    E: { r: -5, tri: [7, 11, 14], tones: [-5, -1, 2] },
    Dm: { r: -7, tri: [5, 8, 12], tones: [-7, -4, 0] },
  };
  const A = ["Am", "Am", "F", "G", "Am", "Am", "F", "E"];
  const B = ["Dm", "Am", "E", "Am", "Dm", "Am", "F", "E"];
  const form = [
    ...["Am", "Am", "Am", "E"].map((c) => ["intro", c]),
    ...A.map((c) => ["A", c]),
    ...B.map((c) => ["B", c]),
    ...["Dm", "Dm", "E", "E"].map((c) => ["break", c]),
    ...A.map((c) => ["A2", c]),
    ...B.map((c) => ["B2", c]),
  ];
  // Melodía de trompeta en B: [paso, semitono desde La 4, duración en pasos]
  const MEL = [
    [[0, -7, 4], [4, -4, 2], [6, 0, 4], [10, -2, 2], [12, -4, 4]],
    [[0, -5, 6], [6, -9, 2], [8, -5, 2], [10, 0, 6]],
    [[0, -1, 4], [4, 2, 2], [6, 5, 4], [10, 3, 2], [12, 2, 4]],
    [[0, 0, 10], [12, -5, 2], [14, -1, 2]],
    [[0, -4, 4], [4, 0, 2], [6, 5, 4], [10, 3, 2], [12, 0, 4]],
    [[0, 3, 6], [6, 2, 2], [8, 0, 2], [10, -5, 6]],
    [[0, -4, 4], [4, 0, 2], [6, 3, 4], [10, 0, 2], [12, -4, 4]],
    [[0, -5, 2], [2, -4, 2], [4, -1, 2], [6, 2, 2], [8, 5, 4], [12, 7, 4]],
  ];
  // Riff de guitarra (16avos): x = acento abierto, m = palm mute
  const RIFF = "x..m.mx..m.mx.mm";
  const FEST = [0, 3, 6, 10, 12]; // acentos 3+3+4+2+4
  return {
    bars: form.length,
    barDur,
    mix: (chn) => ({
      drums: chn(0.55, 0, 0.08),
      drumsVerb: chn(0.4, 0, 0.5),
      hats: chn(0.45, 0.3, 0.1),
      cajon: chn(0.8, -0.25, 0.18),
      perc: chn(0.6, 0.4, 0.3),
      guitar: chn(0.75, -0.6, 0.1),
      guitarR: chn(0.75, 0.6, 0.1),
      bass: chn(0.5, 0, 0),
      brass: chn(1.05, 0.1, 0.35),
      pluck: chn(0.6, 0, 0.3),
      choir: chn(0.4, 0, 0.6),
      arp: chn(0.5, -0.35, 0.35),
    }),
    play(I) {
      form.forEach(([sec, name], bar) => {
        const t0 = bar * barDur;
        const ch = C[name];
        const at = (s) => t0 + s * s16;
        const inSec = form.slice(0, bar).filter(([s]) => s === sec).length; // compás dentro de la sección
        const lastOfSec = form[bar + 1]?.[0] !== sec;
        const full = sec !== "intro" && sec !== "break";

        // Cajón y quijada (siempre)
        for (const s of FEST) (s === 0 || s === 6 ? I.cajonLow : I.cajonSlap)(at(s), s === 0 ? 1 : 0.8);
        for (const s of [2, 8, 14]) I.cajonSlap(at(s), 0.35);
        if (bar % 2 === 1) I.quijada(at(14), 0.8);

        if (full) {
          for (const s of [0, 6, 10]) I.kick(at(s));
          if (sec.startsWith("B")) I.kick(at(3), 0.7);
          for (const s of [4, 12]) I.snare(at(s));
          for (let s = 0; s < 16; s += 2) I.hat(at(s), s % 4 === 2 ? 1 : 0.6, s === 14 && bar % 4 === 3);
          if (inSec === 0) I.crash(at(0));
          if (lastOfSec) {
            for (const s of [12, 13, 14, 15]) I.snare(at(s), 0.5 + (s - 12) * 0.15);
            I.tom(at(8), 140);
            I.tom(at(10), 100);
          }
        }

        // Guitarras
        if ((sec === "intro" && inSec >= 2) || sec.startsWith("A")) {
          [...RIFF].forEach((k, s) => {
            if (k === "x") I.power(at(s), ch.r, s16 * 2.5);
            if (k === "m") I.power(at(s), ch.r, s16, true);
          });
        } else if (sec.startsWith("B")) {
          for (const s of [0, 6, 10]) I.power(at(s), ch.r, s16 * (s === 10 ? 6 : 6), false, 0.85);
        } else if (sec === "break" && inSec >= 2) {
          for (let s = 0; s < 16; s++) I.power(at(s), ch.r, s16, true, 0.4 + s * 0.035);
        }

        // Bajo: tumbao con quinta
        if (sec !== "intro" || inSec >= 2) {
          for (const s of FEST) I.bass(at(s), ch.r + (s === 6 ? 7 : s === 12 ? 12 : 0), s16 * 2);
        }

        // Metales: golpes sincopados en A, melodía en B, crescendo en el break
        if (sec.startsWith("A")) {
          if (bar % 2 === 1) {
            I.brass(at(10), ch.tri, s16 * 1.4, 220);
            I.brass(at(14), ch.tri, s16 * 1.8, 220);
          } else I.brass(at(0), ch.tri, s16 * 2, 220, 0.8);
        }
        if (sec.startsWith("B")) {
          const up = sec === "B2" ? 12 : 0;
          for (const [s, semi, d] of MEL[inSec]) {
            I.brass(at(s), [semi + up], s16 * d * 0.95, 440, 1.25, undefined);
            I.brass(at(s), [semi + up - 12], s16 * d * 0.95, 440, 0.5);
          }
        }
        if (sec === "break") {
          I.brass(at(0), ch.tri, barDur * 0.9, 220, 0.5 + inSec * 0.2);
          I.choir(at(0), ch.tri.map((x) => x - 12), barDur, 220, 0.6);
          if (inSec === 3) for (let s = 0; s < 16; s++) I.snare(at(s), 0.25 + s * 0.04);
        }

        // Contracanto de arpegios en A2 y B2
        if (sec === "A2" || sec === "B2") {
          const tones = [...ch.tones, ch.tones[0] + 12, ch.tones[1] + 12, ch.tones[2] + 12];
          for (let s = 0; s < 16; s++) I.arp(at(s), tones[[0, 2, 4, 5, 3, 1][s % 6]] + 12, 220, s % 4 === 0 ? 1 : 0.7);
        }
        if (sec === "intro" && inSec === 0) I.bell(at(0), 0.8);
      });
    },
  };
})();

// ═══ Pista 2: Vals del más allá ═══════════════════════════════════════════
// 140 BPM en 12/8 (balanceo de vals), Re menor armónica. Batería de rock, trompetas de mariachi a terceras,
// punteos de guitarra criolla y coro.
const VALS = (() => {
  const bpm = 140;
  const barDur = (4 * 60) / bpm;
  const s12 = barDur / 12;
  // Re menor armónica: D E F G A Bb C#
  const SCALE = [0, 2, 3, 5, 7, 8, 11];
  const C = {
    Dm: { r: -7, tones: [2, 5, 9] }, // desde La 3: D4 F4 A4 → semitonos desde 220
    Bb: { r: -11, tones: [1, 5, 8] },
    A: { r: 0, tones: [0, 4, 7] },
    Gm: { r: -2, tones: [-2, 1, 5] },
  };
  const A = ["Dm", "Dm", "Bb", "A", "Dm", "Gm", "A", "A"];
  const form = [
    ...["Dm", "Dm", "Bb", "A"].map((c) => ["intro", c]),
    ...A.map((c) => ["A", c]),
    ...A.map((c) => ["B", c]),
    ...["Gm", "Dm", "Bb", "A", "Gm", "Dm", "A", "A"].map((c) => ["C", c]),
    ...A.map((c) => ["B2", c]),
    ...["Dm", "Bb", "A", "A"].map((c) => ["outro", c]),
  ];
  // Melodía (semitonos desde Re 4) por compás de B: [paso, semitono, duración]
  const MEL = [
    [[0, 7, 3], [3, 12, 3], [6, 15, 2], [8, 14, 1], [9, 12, 3]],
    [[0, 7, 6], [6, 11, 3], [9, 12, 3]],
    [[0, 15, 3], [3, 12, 3], [6, 8, 3], [9, 12, 3]],
    [[0, 14, 6], [6, 11, 3], [9, 7, 3]],
    [[0, 12, 3], [3, 15, 3], [6, 19, 4], [10, 17, 2]],
    [[0, 17, 3], [3, 15, 2], [5, 14, 1], [6, 12, 3], [9, 8, 3]],
    [[0, 7, 2], [2, 11, 1], [3, 14, 3], [6, 17, 3], [9, 15, 2], [11, 14, 1]],
    [[0, 11, 9]],
  ];
  /** Tercera diatónica por debajo (segunda trompeta). */
  const third = (semi) => {
    const oct = Math.floor(semi / 12);
    const pc = ((semi % 12) + 12) % 12;
    let idx = SCALE.indexOf(pc);
    if (idx < 0) idx = SCALE.findIndex((x) => x > pc) - 1;
    const j = idx - 2;
    return (oct + Math.floor(j / 7)) * 12 + SCALE[(j + 7) % 7];
  };
  return {
    bars: form.length,
    barDur,
    mix: (chn) => ({
      drums: chn(0.65, 0, 0.1),
      drumsVerb: chn(0.4, 0, 0.6),
      hats: chn(0.4, 0.3, 0.12),
      cajon: chn(0.5, -0.2, 0.2),
      perc: chn(0.55, -0.3, 0.45),
      guitar: chn(0.6, -0.6, 0.12),
      guitarR: chn(0.6, 0.6, 0.12),
      bass: chn(0.6, 0, 0),
      brass: chn(0.95, 0.12, 0.38),
      pluck: chn(0.85, 0, 0.3),
      choir: chn(0.28, 0, 0.7),
      arp: chn(0.3, 0.3, 0.4),
    }),
    play(I) {
      form.forEach(([sec, name], bar) => {
        const t0 = bar * barDur;
        const ch = C[name];
        const at = (s) => t0 + s * s12;
        const inSec = form.slice(0, bar).filter(([s]) => s === sec).length;
        const lastOfSec = form[bar + 1]?.[0] !== sec;
        const rock = sec !== "intro" && !(sec === "outro" && inSec === 3);

        // Coro: pad en intro, C, B2 y outro
        if (sec === "intro" || sec === "C" || sec === "B2" || sec === "outro")
          I.choir(at(0), ch.tones, barDur * 0.98, 220, sec === "intro" ? 0.7 : 0.6);
        if (sec === "intro" && inSec % 2 === 0) I.bell(at(0), 0.9);

        if (rock) {
          // Batería: bombo en 1 y 3 con galope, caja en 2 y 4, platillo en balanceo de tresillo
          for (const s of [0, 6, 8]) I.kick(at(s));
          if (sec === "B2" || sec === "C") I.kick(at(11), 0.6);
          for (const s of [3, 9]) I.snare(at(s));
          for (const s of [0, 2, 3, 5, 6, 8, 9, 11]) I.hat(at(s), s % 3 === 0 ? 0.9 : 0.5);
          if (inSec === 0) I.crash(at(0));
          if (lastOfSec) {
            I.tom(at(6), 150);
            I.tom(at(7), 120);
            I.tom(at(8), 95);
            for (const s of [9, 10, 11]) I.snare(at(s), 0.8);
          }
          // Galope de guitarra
          if (sec !== "C") {
            for (const s of [0, 2, 3, 5, 6, 8, 9, 11]) I.power(at(s), ch.r, s12, s % 3 !== 0, s % 3 === 0 ? 0.9 : 0.75);
          } else {
            I.power(at(0), ch.r, barDur * 0.5, false, 0.6);
            I.power(at(6), ch.r, barDur * 0.45, false, 0.55);
          }
          // Bajo pesado siguiendo el galope
          for (const s of [0, 3, 6, 9]) I.bass(at(s), ch.r + (s === 9 ? 7 : 0), s12 * 2.6);
        } else if (sec === "intro" && inSec >= 2) {
          I.power(at(0), ch.r, barDur * 0.9, false, 0.7);
          I.tom(at(0), 70);
          I.tom(at(6), 70, 0.7);
        } else if (sec === "outro") {
          I.power(at(0), C.Dm.r, barDur * 0.95, false, 0.8);
          I.bass(at(0), C.Dm.r, barDur * 0.9);
          I.kick(at(0));
          I.crash(at(0), 1.2);
        }

        // Trompetas de mariachi a terceras en B y B2 (B2 una octava arriba)
        if (sec === "A" && bar % 2 === 1) {
          I.brass(at(6), ch.tones.map((x) => x + 12), s12 * 2, 220, 0.8);
          I.brass(at(9), ch.tones.map((x) => x + 12), s12 * 2.5, 220, 0.9);
        }
        if (sec === "B" || sec === "B2") {
          const up = sec === "B2" ? 12 : 0;
          for (const [s, semi, d] of MEL[inSec]) {
            I.brass(at(s), [semi + up], s12 * d * 0.92, 293.66, 1.25);
            I.brass(at(s), [third(semi) + up], s12 * d * 0.92, 293.66, 0.9);
          }
        }

        // Punteos de guitarra criolla en C (tresillos que suben y bajan)
        if (sec === "C" || sec === "A") {
          const tones = [ch.tones[0], ch.tones[1], ch.tones[2], ch.tones[0] + 12, ch.tones[1] + 12, ch.tones[2] + 12];
          const run = sec === "C" ? [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3] : null;
          if (run) run.forEach((k, s) => I.pluck(at(s), tones[k] + 12, 220, s % 3 === 0 ? 1 : 0.75, Math.sin(s) * 0.4));
          else if (inSec >= 4) for (const s of [1, 2, 4, 5, 7, 8, 10, 11]) I.pluck(at(s), tones[(s + bar) % 6], 220, 0.55, -0.35);
        }
        if (sec === "outro" && inSec === 3) I.bell(at(0), 1);
      });
    },
  };
})();

for (const [song, file] of [[FESTEJO, "festejo-de-ultratumba.mp3"], [VALS, "vals-del-mas-alla.mp3"]]) {
  const chans = await render(song);
  mp3(chans, `${OUT}/${file}`);
}
