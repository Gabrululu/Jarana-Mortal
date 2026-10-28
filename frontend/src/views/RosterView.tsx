import { TEAMS, type FighterProfile, type FighterRecord, type Team } from "@cvm/game";
import { useEffect, useState } from "react";
import { fetchMedia } from "../audio/sound";
import { lookFor, spriteKey } from "../battle/looks";
import { Spark } from "../components/Hero";
import { ContractLink } from "../components/ui";
import { useArena } from "../lib/store";

const TEAM_ART: Record<Team, { img: string; tagline: string }> = {
  JARANA: { img: "/art/card-jarana.jpg", tagline: "Cajón, guitarra y pañuelo al aire" },
  TERROR: { img: "/art/card-terror.jpg", tagline: "Lo que sale cuando se apaga el farol" },
};

export function RosterView() {
  const { roster, loaded, error } = useArena();
  const teams: Team[] = ["JARANA", "TERROR"];

  return (
    <div className="space-y-8">
      <p className="eyebrow flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-lamp">{loaded ? `${roster.length} inscritos` : "Leyendo la Arena…"}</span>
        <Spark className="h-2.5 w-2.5" />
        <span>
          Leído directamente del contrato con <code className="normal-case text-bone">fighters()</code>
        </span>
      </p>
      {error && <p role="alert" className="text-blood">{error}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-2">
        {teams.map((team, i) => {
          // Los de la casa al final: no compiten por el marcador
          const members = roster
            .filter((r) => r.profile.team === team)
            .sort((a, b) => Number(a.house) - Number(b.house) || b.wins - a.wins);
          return (
            <section key={team} className="min-w-0 space-y-4">
              <TeamBanner team={team} index={i + 1} members={members} />
              {loaded && members.length === 0 && (
                <p className="card px-4 py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
                  Nadie se ha atrevido todavía
                </p>
              )}
              <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                {members.map((r, n) => (
                  <FighterCard key={r.fighter} record={r} number={n + 1} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TeamBanner({ team, index, members }: { team: Team; index: number; members: FighterRecord[] }) {
  const t = TEAMS[team];
  const wins = members.reduce((s, r) => s + (r.house ? 0 : r.wins), 0);
  return (
    <header className="relative isolate flex min-h-44 items-end overflow-hidden border border-sage/12 sm:h-52">
      <img src={TEAM_ART[team].img} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_35%] opacity-80" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-night-950 via-night-950/60 to-night-950/10" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-night-950/80 to-transparent" />
      <div className="flex w-full flex-wrap items-end justify-between gap-x-4 gap-y-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="eyebrow mb-1">
            <span className="text-lamp">Bando 0{index}</span> / {TEAM_ART[team].tagline}
          </p>
          <h2 className="font-display text-4xl leading-none tracking-wide uppercase sm:text-6xl" style={{ color: t.color }}>
            {t.label.replace("Team ", "")}
          </h2>
        </div>
        <dl className="flex gap-5 sm:text-right">
          <div>
            <dt className="eyebrow">Luchadores</dt>
            <dd className="font-display text-3xl leading-none">{members.length}</dd>
          </div>
          <div>
            <dt className="eyebrow">Victorias</dt>
            <dd className="font-display text-3xl leading-none" style={{ color: t.color }}>
              {wins}
            </dd>
          </div>
        </dl>
      </div>
    </header>
  );
}

function FighterCard({ record, number }: { record: FighterRecord; number: number }) {
  const [avatar, setAvatar] = useState<string>();
  useEffect(() => {
    fetchMedia(record.fighter).then((m) => setAvatar(m.avatar));
  }, [record.fighter]);
  const p = record.profile;
  const team = p.team as Team;
  const t = TEAMS[team];

  return (
    <li className="card relative flex flex-col overflow-hidden transition-colors duration-300 hover:border-lamp/40">
      {/* Filo del color del bando */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5" style={{ background: t?.color }} />
      <div className="flex gap-4 p-4">
        <Portrait src={avatar} team={team} sprite={`/fighters/${spriteKey(team, lookFor(record.fighter, team), record.house)}.webp`} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="eyebrow">
            <span className="text-lamp">N° {String(number).padStart(2, "0")}</span>
            {record.house && (
              <span
                title="Sus peleas no suman al marcador"
                className="ml-2 inline-block -rotate-3 border border-dashed border-lamp/70 px-1.5 py-0.5 text-[10px] font-bold text-lamp"
              >
                De la casa
              </span>
            )}
          </p>
          <h3 className="mt-1 font-display text-2xl leading-tight tracking-wide text-balance uppercase">
            {p.name}
          </h3>
          <div className="mt-auto flex items-baseline gap-4 pt-2 font-display leading-none">
            <span>
              <span className="text-3xl text-mint">{record.wins}</span>{" "}
              <span className="ml-1 font-mono text-[10px] tracking-widest text-bone-dim uppercase">victorias</span>
            </span>
            <span>
              <span className="text-3xl text-blood">{record.losses}</span>{" "}
              <span className="ml-1 font-mono text-[10px] tracking-widest text-bone-dim uppercase">derrotas</span>
            </span>
          </div>
        </div>
      </div>
      <TickStats profile={p} />
      <footer className="flex items-center justify-between gap-2 border-t border-sage/10 px-4 py-2">
        <span className="font-mono text-[10px] tracking-widest text-bone-dim uppercase">
          {record.house ? "Sus peleas no suman" : "Contrato"}
        </span>
        <ContractLink id={record.fighter} />
      </footer>
    </li>
  );
}

/** Retrato enmarcado: el avatar subido, o la ilustración de su personaje sobre el arte del bando. */
function Portrait({ src, team, sprite }: { src?: string; team: Team; sprite: string }) {
  return (
    <div className="relative isolate h-28 w-22 shrink-0 overflow-hidden border border-sage/20 bg-night-950">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          <img src={TEAM_ART[team]?.img} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35 grayscale" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-night-950 to-transparent" />
          <img src={sprite} alt="" className="absolute inset-x-0 top-1 mx-auto h-[190%] max-w-none object-contain object-top" />
        </>
      )}
    </div>
  );
}

const STATS = [
  { key: "hp", label: "HP", color: "var(--color-mint)" },
  { key: "attack", label: "ATK", color: "var(--color-blood)" },
  { key: "defense", label: "DEF", color: "var(--color-terror)" },
] as const;

/** Atributos como marcas de 5 puntos: el máximo posible de un atributo es 90. */
function TickStats({ profile }: { profile: FighterProfile }) {
  return (
    <div className="grid grid-cols-3 gap-4 border-t border-sage/10 px-4 py-3">
      {STATS.map((s) => {
        const ticks = Math.round(Math.min(90, profile[s.key]) / 5);
        return (
          <div key={s.key}>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] tracking-widest text-bone-dim">{s.label}</span>
              <span className="font-display text-xl leading-none">{profile[s.key]}</span>
            </div>
            <div className="mt-1.5 flex gap-px" aria-hidden>
              {Array.from({ length: 18 }, (_, i) => (
                <span key={i} className="h-2.5 flex-1" style={{ background: i < ticks ? s.color : "var(--color-night-700)" }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
