import { config, read, write, type FighterProfile, type FighterRecord } from "@cvm/game";
import { Mic, Image as ImageIcon, Search, Swords, Upload, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BattleScene } from "../battle/BattleScene";
import { fromReport, play } from "../battle/playback";
import { cuePlayer, fetchMedia, type Media } from "../audio/sound";
import { BattleCanvas } from "../components/BattleCanvas";
import { Avatar, ContractLink, RulesCheck, StatBars, TeamBadge } from "../components/ui";
import { useArena } from "../lib/store";
import { connectFreighter } from "../lib/wallet";

const KEY = "cvm.myFighter";
const CONTRACT_ID = /^C[A-Z2-7]{55}$/;

function stored() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function MyFighterView() {
  const [input, setInput] = useState(stored);
  const [id, setId] = useState(() => (CONTRACT_ID.test(stored()) ? stored() : ""));
  const [profile, setProfile] = useState<FighterProfile | null>(null);
  const [record, setRecord] = useState<FighterRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(target: string) {
    setLoading(true);
    setError(null);
    const [p, r] = await Promise.all([read.profile(target), read.fighter(target)]);
    setLoading(false);
    if (!p.ok) {
      setProfile(null);
      return setError(p.error);
    }
    setProfile(p.value);
    setRecord(r.ok ? r.value : null);
  }

  useEffect(() => {
    if (id) load(id);
  }, [id]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = input.trim();
    if (!CONTRACT_ID.test(v)) return setError("Un CONTRACT_ID empieza con C y tiene 56 caracteres.");
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* modo privado */
    }
    setId(v);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="text-bone-dim">
          Pega el <b className="text-bone">CONTRACT_ID</b> que te dio <code>pnpm fighter:deploy</code>.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="cid">CONTRACT_ID</label>
        <input
          id="cid"
          className="field"
          placeholder="CABC…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={loading}>
          <Search size={16} /> {loading ? "Leyendo la blockchain…" : "Buscar"}
        </button>
      </form>
      {error && <p role="alert" className="text-blood">{error}</p>}

      {profile && id && (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <ProfileCard id={id} profile={profile} />
            <RegistrationCard id={id} record={record} onRegistered={() => load(id)} />
          </div>
          <MediaCard id={id} team={profile.team} name={profile.name} />
          <SparringCard id={id} profile={profile} />
        </>
      )}
    </div>
  );
}

function ProfileCard({ id, profile }: { id: string; profile: FighterProfile }) {
  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">{profile.name}</h2>
          <ContractLink id={id} />
        </div>
        <TeamBadge team={profile.team} />
      </div>
      <StatBars profile={profile} />
      <div>
        <p className="mb-1.5 text-xs text-bone-dim">
          Lo que revisa la Arena antes de inscribirte (on-chain, no en tu contrato):
        </p>
        <RulesCheck profile={profile} />
      </div>
    </section>
  );
}

function RegistrationCard({ id, record, onRegistered }: { id: string; record: FighterRecord | null; onRegistered: () => void }) {
  const { signer, setSigner, refresh } = useArena();
  const [status, setStatus] = useState<{ kind: "busy" | "ok" | "error"; text: string; tx?: string } | null>(null);

  async function register() {
    try {
      const s = signer ?? (await connectFreighter());
      setSigner(s);
      setStatus({ kind: "busy", text: "Simulando y esperando tu firma en Freighter…" });
      const res = await write.register(s, id);
      if (!res.ok) return setStatus({ kind: "error", text: res.error });
      setStatus({ kind: "ok", text: "¡Inscrito! La Arena guardó una copia de tu ficha.", tx: res.value.txHash });
      refresh();
      onRegistered();
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message });
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-display text-2xl tracking-wide uppercase">Inscripción en la Arena</h2>
      {record ? (
        <>
          <p className="text-mint">✓ Inscrito. La Arena guardó tu ficha: cambiar tu contrato ya no cambia tus stats.</p>
          <div className="flex gap-6 font-display text-3xl">
            <span className="text-mint">{record.wins}<span className="ml-1 text-sm text-bone-dim">victorias</span></span>
            <span className="text-blood">{record.losses}<span className="ml-1 text-sm text-bone-dim">derrotas</span></span>
          </div>
          <p className="text-xs text-bone-dim">
            Dueño: <ContractLink id={record.owner} kind="account" />
          </p>
        </>
      ) : (
        <>
          <p className="text-bone-dim">
            Aún no estás inscrito. Desde la terminal: <code className="text-bone">pnpm fighter:register</code>, o fírmalo aquí
            con Freighter (tu cuenta queda como dueña).
          </p>
          <button type="button" className="btn-primary w-full" onClick={register} disabled={status?.kind === "busy"}>
            <Wallet size={16} /> Inscribirme con Freighter
          </button>
        </>
      )}
      {status && (
        <p role="status" className={`text-sm ${status.kind === "error" ? "text-blood" : status.kind === "ok" ? "text-mint" : "text-lamp"}`}>
          {status.text} {status.tx && <ContractLink id={status.tx} kind="tx" />}
        </p>
      )}
    </section>
  );
}

const SLOTS = [
  { kind: "attack", label: "Grito de ataque", hint: "¡Sabor a cajón, saca chispas!", icon: Mic, accept: "audio/*" },
  { kind: "defeat", label: "Grito de derrota", hint: "¡Se me rompió la cuerda!", icon: Mic, accept: "audio/*" },
  { kind: "avatar", label: "Avatar", hint: "png, jpg o webp · máx. 1 MB", icon: ImageIcon, accept: "image/*" },
] as const;

function MediaCard({ id, team, name }: { id: string; team: string; name: string }) {
  const [media, setMedia] = useState<Media>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  // El servidor de medios solo existe con `vite dev` en la laptop del organizador; la web pública es estática
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/media/${id}`)
      .then((r) => r.ok && !!r.headers.get("content-type")?.includes("json"))
      .catch(() => false)
      .then(setOnline);
    fetchMedia(id).then(setMedia);
  }, [id]);

  if (online === false) {
    return (
      <section className="card p-5">
        <h2 className="font-display text-2xl tracking-wide uppercase">Tu voz (ElevenLabs) y avatar</h2>
        <p className="text-sm text-bone-dim">
          Los audios y avatares se suben en la web del taller, la que corre en la laptop del organizador (te da la
          dirección en el evento). Aquí tus peleas suenan con la voz por defecto de tu bando.
        </p>
      </section>
    );
  }

  async function upload(kind: string, file: File) {
    setMsg((m) => ({ ...m, [kind]: "Subiendo…" }));
    const res = await fetch(`/api/media/${id}/${kind}`, { method: "PUT", body: file });
    const body = await res.json().catch(() => ({}));
    setMsg((m) => ({ ...m, [kind]: res.ok ? "✓ Listo" : body.error ?? "No se pudo subir" }));
    if (res.ok) setMedia(await fetchMedia(id));
  }

  return (
    <section className="card p-5">
      <h2 className="font-display text-2xl tracking-wide uppercase">Tu voz (ElevenLabs) y avatar</h2>
      <p className="mb-4 text-sm text-bone-dim">
        Suenan en la pantalla gigante durante tus peleas. Cada archivo se sube una sola vez; para cambiarlo, habla con el
        organizador.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {SLOTS.map((s) => {
          const url = media[s.kind];
          return (
            <div key={s.kind} className="rounded-sm border border-sage/12 bg-night-950/50 p-3">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <s.icon size={16} className="text-lamp" /> {s.label}
              </div>
              {url ? (
                s.kind === "avatar" ? (
                  <Avatar src={url} team={team} name={name} size={72} />
                ) : (
                  <audio controls src={url} className="h-9 w-full" />
                )
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-night-500 px-3 py-4 text-center text-xs text-bone-dim hover:border-lamp hover:text-bone">
                  <Upload size={18} />
                  <span>Elegir archivo</span>
                  <span className="italic">{s.hint}</span>
                  <input
                    type="file"
                    accept={s.accept}
                    className="sr-only"
                    onChange={(e) => e.target.files?.[0] && upload(s.kind, e.target.files[0])}
                  />
                </label>
              )}
              {msg[s.kind] && <p className="mt-2 text-xs text-bone-dim" role="status">{msg[s.kind]}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SparringCard({ id, profile }: { id: string; profile: FighterProfile }) {
  const { roster } = useArena();
  const [rival, setRival] = useState(config.sparringId);
  const [scene, setScene] = useState<BattleScene | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  async function spar() {
    setBusy(true);
    setResult(null);
    const [rep, rp] = await Promise.all([read.spar(id, rival), read.profile(rival)]);
    setBusy(false);
    if (!rep.ok) return setResult(rep.error);
    if (!rp.ok) return setResult(rp.error);
    const won = rep.value.winner === id;
    setResult(
      `${won ? "🏆 Ganas" : "💀 Pierdes"} en ${rep.value.rounds} rondas ${rep.value.knockout ? "por KO" : "por puntos"}. ` +
        "Simulado: no se envió ninguna transacción y los ataques fuertes son aleatorios, así que puede variar.",
    );
    if (!scene) return;
    canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const playback = fromReport(rep.value, { id, ...profile }, { id: rival, ...rp.value });
    scene.speed = 1.5;
    scene.onCue(await cuePlayer(playback));
    await play(scene, playback);
  }

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <h2 className="font-display text-2xl tracking-wide uppercase">Pelea de práctica</h2>
          <p className="text-sm text-bone-dim">
            Se corre en <b className="text-bone">simulación</b>: el nodo ejecuta la pelea real, pero no se guarda nada ni se
            paga nada.
          </p>
        </div>
        <label className="text-xs text-bone-dim sm:w-64">
          Rival
          <select className="field mt-1 font-sans" value={rival} onChange={(e) => setRival(e.target.value)}>
            <option value={config.sparringId}>🥊 Saco de Box (práctica)</option>
            {roster
              .filter((r) => r.fighter !== id && r.fighter !== config.sparringId)
              .map((r) => (
                <option key={r.fighter} value={r.fighter}>
                  {r.profile.name}
                </option>
              ))}
          </select>
        </label>
        <button type="button" className="btn-primary" onClick={spar} disabled={busy}>
          <Swords size={16} /> {busy ? "Simulando…" : "¡A practicar!"}
        </button>
      </div>
      {result && <p role="status" className="text-sm">{result}</p>}
      <div ref={canvasRef}>
        <BattleCanvas onReady={setScene} />
      </div>
    </section>
  );
}
