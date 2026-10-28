import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Asterisco dorado de la referencia, como separador. */
export function Spark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`h-4 w-4 fill-lamp ${className}`}>
      <path d="M12 0l1.6 8.1L20.5 3.5 15.9 10.4 24 12l-8.1 1.6 4.6 6.9-6.9-4.6L12 24l-1.6-8.1-6.9 4.6 4.6-6.9L0 12l8.1-1.6L3.5 3.5l6.9 4.6z" />
    </svg>
  );
}

/** Mueve la linterna del hero con el puntero (variables CSS, sin re-render). */
function useSearchlight() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, []);
  return ref;
}

function Fog() {
  return (
    <>
      <div className="fog-layer animate-fog" />
      <div className="fog-layer animate-fog-slow opacity-70 [top:30%]" />
    </>
  );
}

/** Portada de la Arena: foto a sangre, logo de brocha y llamada a la acción. */
export function ArenaHero() {
  const ref = useSearchlight();
  return (
    <section ref={ref} className="relative isolate overflow-hidden border-b border-sage/10">
      <img
        src="/art/hero.jpg"
        alt=""
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[60%_center]"
        fetchPriority="high"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-night-950 via-night-950/70 to-night-950/10" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-night-950 via-transparent to-night-950/40" />
      <Fog />
      <div className="searchlight" />

      <div className="relative mx-auto flex min-h-[min(78dvh,720px)] max-w-[1600px] flex-col justify-end px-4 pt-28 pb-12 sm:px-8 sm:pb-16">
        <p className="eyebrow mb-6 flex items-center gap-3">
          <span className="text-lamp">01</span> / Taller Stellar · Soroban Testnet
        </p>
        <h1 className="leading-[0.85]">
          <span className="block -rotate-2 font-brush text-[clamp(3.5rem,12vw,10rem)] text-bone drop-shadow-[0_6px_30px_rgb(0_0_0/0.6)]">
            Jarana Mortal
          </span>
          <span className="mt-2 flex items-center gap-4 font-display text-[clamp(2rem,6.5vw,5.5rem)] tracking-wide text-sage uppercase">
            Midnight <Spark className="h-[0.5em] w-[0.5em]" /> <span className="text-lamp">Arena</span>
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-bone/85 sm:text-lg">
          Team Jarana contra Team Halloween. Cada luchador es un contrato que tú programas; cada pelea, una sola
          transacción en la blockchain de Stellar. A medianoche, en el callejón, todo queda en el ledger.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#escenario" className="btn-primary px-5 py-3">
            Ver la pelea <ArrowDown size={16} />
          </a>
          <a href="#luchador" className="btn-ghost px-5 py-3">
            Mi luchador <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}

/** Franja de título para las demás secciones. */
export function PageBand({ index, title, children }: { index: string; title: string; children?: ReactNode }) {
  const ref = useSearchlight();
  return (
    <section ref={ref} className="relative isolate overflow-hidden border-b border-sage/10">
      <img src="/art/stage.jpg" alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-top opacity-60" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-night-950 via-night-950/75 to-night-950/30" />
      <Fog />
      <div className="searchlight" />
      <div className="relative mx-auto max-w-[1600px] px-4 pt-24 pb-10 sm:px-8">
        <p className="eyebrow mb-3">
          <span className="text-lamp">{index}</span> / Jarana Mortal
        </p>
        <h1 className="font-display text-5xl tracking-wide uppercase sm:text-7xl">{title}</h1>
        {children && <div className="mt-3 max-w-2xl text-bone-dim">{children}</div>}
      </div>
    </section>
  );
}

/** Telón de neblina al cargar la página. */
export function FogLoader() {
  const [state, setState] = useState<"on" | "leaving" | "off">(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? "off" : "on",
  );
  useEffect(() => {
    if (state !== "on") return;
    const t1 = setTimeout(() => setState("leaving"), 900);
    const t2 = setTimeout(() => setState("off"), 1700);
    return () => (clearTimeout(t1), clearTimeout(t2));
  }, []);
  if (state === "off") return null;
  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-50 grid place-items-center bg-night-950 transition-opacity duration-700 ${
        state === "leaving" ? "pointer-events-none opacity-0" : ""
      }`}
    >
      <div className="fog-layer animate-fog h-full" />
      <div className="text-center">
        <div className="animate-flicker font-brush text-5xl text-bone sm:text-7xl">Jarana Mortal</div>
        <div className="eyebrow mt-3">Despertando la Arena…</div>
      </div>
    </div>
  );
}
