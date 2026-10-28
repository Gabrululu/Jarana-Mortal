import { useEffect, useRef } from "react";
import { createBattleGame, type BattleScene } from "../battle/BattleScene";

/** Monta el juego de Phaser y entrega la escena cuando está lista. */
export function BattleCanvas({ onReady, className = "" }: { onReady: (scene: BattleScene) => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    let destroyed = false;
    // Phaser dibuja texto en canvas: esperamos a que cargue la tipografía
    const fonts = document.fonts.load('40px "Anton"').catch(() => undefined);
    let game: ReturnType<typeof createBattleGame>["game"] | undefined;
    fonts.then(() => {
      if (destroyed || !host.current) return;
      const created = createBattleGame(host.current);
      game = created.game;
      created.ready.then((scene) => !destroyed && readyRef.current(scene));
    });
    return () => {
      destroyed = true;
      game?.destroy(true);
    };
  }, []);

  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-sm border border-sage/10 bg-night-950 ${className}`}>
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_40px_rgba(0,0,0,0.65)]" />
    </div>
  );
}
