import { explorer, RULES, TEAMS, type FighterProfile, type Team } from "@cvm/game";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

export function short(id: string, n = 4) {
  return `${id.slice(0, n)}…${id.slice(-n)}`;
}

export function ContractLink({ id, kind = "contract" }: { id: string; kind?: "contract" | "tx" | "account" }) {
  const [copied, setCopied] = useState(false);
  const href = kind === "tx" ? explorer.tx(id) : kind === "account" ? explorer.account(id) : explorer.contract(id);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-bone-dim">
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-lamp">
        {short(id, kind === "tx" ? 6 : 4)} <ExternalLink size={12} />
      </a>
      <button
        type="button"
        aria-label="Copiar"
        className="rounded p-0.5 hover:text-lamp"
        onClick={() => {
          navigator.clipboard?.writeText(id);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  );
}

export function TeamBadge({ team }: { team: string }) {
  const t = TEAMS[team as Team];
  if (!t) return <span className="text-blood">{team}</span>;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest"
      style={{ background: `${t.color}22`, color: t.color }}
    >
      {t.emoji} {t.label}
    </span>
  );
}

const STATS = [
  { key: "hp", label: "HP", color: "var(--color-mint)" },
  { key: "attack", label: "ATK", color: "var(--color-blood)" },
  { key: "defense", label: "DEF", color: "var(--color-terror)" },
] as const;

export function StatBars({ profile }: { profile: FighterProfile }) {
  return (
    <div className="space-y-1.5">
      {STATS.map((s) => (
        <div key={s.key} className="flex items-center gap-2 text-xs">
          <span className="w-8 font-mono font-bold text-bone-dim">{s.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden bg-night-800">
            <div className="h-full" style={{ width: `${Math.min(100, profile[s.key])}%`, background: s.color }} />
          </div>
          <span className="w-7 text-right font-mono">{profile[s.key]}</span>
        </div>
      ))}
    </div>
  );
}

/** La misma validación que hace la Arena on-chain, mostrada para aprender. */
export function RulesCheck({ profile }: { profile: FighterProfile }) {
  const total = profile.hp + profile.attack + profile.defense;
  const nameBytes = new TextEncoder().encode(profile.name).length;
  const checks = [
    { ok: total <= RULES.maxPoints, label: `Suma ${total} / ${RULES.maxPoints} puntos` },
    { ok: [profile.hp, profile.attack, profile.defense].every((v) => v >= RULES.minStat), label: `Cada atributo ≥ ${RULES.minStat}` },
    { ok: profile.team === "JARANA" || profile.team === "TERROR", label: "Bando JARANA o TERROR" },
    // El contrato mide bytes UTF-8, no letras: "ñ" cuenta 2
    { ok: nameBytes > 0 && nameBytes <= 24, label: "Nombre de 1 a 24 bytes (tildes y ñ cuentan doble)" },
  ];
  return (
    <ul className="space-y-1 text-sm">
      {checks.map((c) => (
        <li key={c.label} className={c.ok ? "text-mint" : "text-blood"}>
          {c.ok ? "✓" : "✗"} {c.label}
        </li>
      ))}
    </ul>
  );
}

export function Avatar({ src, team, name, size = 48 }: { src?: string; team: string; name: string; size?: number }) {
  const t = TEAMS[team as Team];
  return src ? (
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-sm object-cover" style={{ width: size, height: size }} />
  ) : (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-sm font-display"
      style={{ width: size, height: size, background: `${t?.color ?? "#888"}22`, color: t?.color, fontSize: size * 0.45 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
