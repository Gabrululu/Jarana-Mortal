// Espejo de las reglas de contracts/common y contracts/arena, para mostrarlas en pantalla.
// La verdad vive en los contratos: esto solo es presentación.

export const RULES = {
  maxRounds: 20,
  maxPoints: 100,
  minStat: 5,
  hpMultiplier: 3,
  minDamage: 3,
  missChance: 30,
} as const;

export const MOVE = { TROPIEZO: 0, NORMAL: 1, FUERTE: 2, GUARDIA: 3 } as const;
export type Move = (typeof MOVE)[keyof typeof MOVE];

export const MOVES: Record<Move, { label: string; emoji: string; description: string }> = {
  0: { label: "¡Tropiezo!", emoji: "🍌", description: "El contrato falló o devolvió un movimiento inválido" },
  1: { label: "Normal", emoji: "👊", description: "Daño = ATK − DEF/2 (mínimo 3)" },
  2: { label: "Fuerte", emoji: "💥", description: "×1.6 de daño, 30% de fallar; contra GUARDIA te contraatacan" },
  3: { label: "Guardia", emoji: "🛡️", description: "Recibes 60% menos daño y te curas 5%" },
};

export type Team = "JARANA" | "TERROR";

export const TEAMS: Record<Team, { label: string; emoji: string; color: string }> = {
  JARANA: { label: "Team Jarana", emoji: "🎸", color: "#f08a3c" },
  TERROR: { label: "Team Halloween", emoji: "🎃", color: "#a98bff" },
};

// Códigos y nombres de `ArenaError` (contracts/arena/src/lib.rs)
const ERRORS: Record<string, string> = {
  AlreadyRegistered: "Ese luchador ya está inscrito.",
  NotRegistered: "Ese luchador no está inscrito en la Arena.",
  NotAFighter: "Ese contrato no responde como un Luchador (¿es el CONTRACT_ID correcto?).",
  TooManyPoints: "Trampa criolla: la ficha suma más de 100 puntos.",
  StatTooLow: "Cada atributo necesita al menos 5 puntos.",
  InvalidTeam: 'El bando debe ser "JARANA" o "TERROR".',
  InvalidName: "El nombre debe tener entre 1 y 24 bytes (las tildes y la ñ cuentan doble).",
  SameFighter: "Un luchador no puede pelear contra sí mismo.",
  ArenaFull: "La Arena está llena.",
  NameTaken: "Ya hay un luchador con ese nombre: cambia NAME, vuelve a desplegar e inscríbete.",
};
const ERROR_CODES = Object.keys(ERRORS);

/** Convierte cualquier error (del contrato, de la red o de la wallet) en un mensaje en español. */
export function explainError(err: unknown): string {
  const raw =
    typeof err === "string" ? err : err instanceof Error ? err.message : (err as { message?: string })?.message ?? "";
  if (ERRORS[raw]) return ERRORS[raw];
  const code = raw.match(/Error\(Contract, #(\d+)\)/)?.[1];
  if (code) return ERRORS[ERROR_CODES[Number(code) - 1]] ?? raw;
  if (/User declined|rejected/i.test(raw)) return "Cancelaste la firma en tu wallet.";
  if (/InsufficientRefundableFee|ResourceLimitExceeded/.test(raw)) {
    return "La pelea real duró más de lo que estimó la simulación y no le alcanzaron los recursos. Vuelve a lanzarla.";
  }
  if (/Budget|ExceededLimit/i.test(raw)) return "La pelea gastó más cómputo del permitido por transacción.";
  return raw || "Error desconocido";
}
