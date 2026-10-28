import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { disableSound, enableSound } from "./audio/sound";
import { ArenaHero, FogLoader, PageBand, Spark } from "./components/Hero";
import { ArenaProvider } from "./lib/store";
import { ArenaView } from "./views/ArenaView";
import { MyFighterView } from "./views/MyFighterView";
import { RosterView } from "./views/RosterView";

const ROUTES = {
  arena: { index: "01", label: "Arena", view: ArenaView },
  luchador: { index: "02", label: "Mi luchador", view: MyFighterView },
  luchadores: { index: "03", label: "Luchadores", view: RosterView },
} as const;
type Route = keyof typeof ROUTES;

function currentRoute(): Route {
  const h = location.hash.slice(1);
  return h in ROUTES ? (h as Route) : "arena";
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  const [sound, setSound] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => {
      // "#escenario" es un ancla dentro de la Arena, no una ruta
      if (location.hash === "#escenario") return;
      setRoute(currentRoute());
      scrollTo({ top: 0 });
    };
    const scroll = () => setScrolled(scrollY > 40);
    addEventListener("hashchange", on);
    addEventListener("scroll", scroll, { passive: true });
    return () => {
      removeEventListener("hashchange", on);
      removeEventListener("scroll", scroll);
    };
  }, []);

  const { view: View, index, label } = ROUTES[route];

  return (
    <ArenaProvider>
      <FogLoader />
      <header
        className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${
          scrolled ? "border-b border-sage/10 bg-night-950/90 backdrop-blur" : "bg-gradient-to-b from-night-950/80 to-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-8">
          <a href="#arena" className="mr-2 flex items-center gap-2 leading-none" aria-label="Jarana Mortal: Midnight Arena">
            <span className="-rotate-2 whitespace-nowrap font-brush text-lg text-bone sm:text-2xl">Jarana Mortal</span>
            <Spark className="hidden h-3 w-3 lg:block" />
            <span className="hidden whitespace-nowrap font-display text-sm tracking-[0.2em] text-sage uppercase lg:block">Midnight Arena</span>
          </a>
          <nav className="ml-auto flex min-w-0 gap-0 sm:gap-1" aria-label="Secciones">
            {(Object.keys(ROUTES) as Route[]).map((r) => {
              const active = r === route;
              return (
                <a
                  key={r}
                  href={`#${r}`}
                  aria-current={active ? "page" : undefined}
                  aria-label={ROUTES[r].label}
                  className={`group flex items-baseline gap-1.5 px-1.5 py-2 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors sm:px-3 ${
                    active ? "text-lamp" : "text-bone-dim hover:text-bone"
                  }`}
                >
                  <span className={active ? "text-lamp" : "text-night-500 group-hover:text-lamp"}>{ROUTES[r].index}</span>
                  <span className={`hidden whitespace-nowrap border-b md:inline ${active ? "border-lamp" : "border-transparent"}`}>
                    {ROUTES[r].label}
                  </span>
                </a>
              );
            })}
          </nav>
          <button
            type="button"
            className={`btn-ghost px-3 py-2 ${sound ? "border-lamp/60 text-lamp" : ""}`}
            aria-pressed={sound}
            aria-label={sound ? "Silenciar" : "Activar sonido"}
            onClick={async () => {
              if (sound) disableSound();
              else await enableSound();
              setSound(!sound);
            }}
          >
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span className="hidden md:inline">{sound ? "Sonido" : "Activar sonido"}</span>
          </button>
        </div>
      </header>
      {route === "arena" ? <ArenaHero /> : <PageBand index={index} title={label} />}
      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-8">
        <View />
      </main>
      <footer className="border-t border-sage/10">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 sm:px-8">
          <span className="font-brush text-lg">Jarana Mortal</span>
          <span className="eyebrow">Midnight Arena · Soroban Testnet</span>
          <span className="eyebrow ml-auto text-night-500">Todo lo que ves sale de eventos on-chain</span>
        </div>
      </footer>
    </ArenaProvider>
  );
}
