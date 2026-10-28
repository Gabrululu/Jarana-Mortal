#![no_std]
//! 🥊 TU LUCHADOR — Jarana Mortal: Midnight Arena
//!
//! Este archivo es tuyo. Solo tienes que tocar dos cosas:
//!   1. La FICHA (nombre, bando y atributos) — justo abajo.
//!   2. La ESTRATEGIA en `decide_move` — al final del archivo.
//!
//! Prueba antes de desplegar:  cargo test -p fighter -- --nocapture

use cvm_common::{FighterProfile, FighterState, FUERTE, GUARDIA, MAX_POINTS, MIN_STAT, NORMAL};
use soroban_sdk::{contract, contractimpl, symbol_short, Env, String, Symbol};

// ═══════════════════════════════════════════════════════════════════════════
//  ✏️  1. TU FICHA
// ═══════════════════════════════════════════════════════════════════════════

/// Nombre que se verá en la pantalla gigante (máximo 24 caracteres).
const NAME: &str = "El Cajonero";

/// Tu bando: symbol_short!("JARANA") o symbol_short!("TERROR").
const TEAM: Symbol = symbol_short!("JARANA");

/// Reparte máximo 100 puntos. Cada atributo necesita al menos 5.
/// HP      → tu vida real será HP × 3
/// ATTACK  → cuánto pegas
/// DEFENSE → resta la mitad de su valor al ataque del rival
const HP: u32 = 40;
const ATTACK: u32 = 35;
const DEFENSE: u32 = 25;

// Si te pasas de 100 puntos, el contrato ni siquiera compila.
// (Y aunque borres esta línea, la Arena lo vuelve a revisar: no confíes, verifica.)
const _: () = assert!(
    HP + ATTACK + DEFENSE <= MAX_POINTS,
    "Trampa criolla: los puntos totales no pueden superar 100"
);
const _: () = assert!(
    HP >= MIN_STAT && ATTACK >= MIN_STAT && DEFENSE >= MIN_STAT,
    "Cada atributo necesita al menos 5 puntos"
);

#[contract]
pub struct FighterContract;

#[contractimpl]
impl FighterContract {
    /// La Arena llama esto una vez, cuando te inscribes.
    pub fn get_profile(env: Env) -> FighterProfile {
        FighterProfile {
            name: String::from_str(&env, NAME),
            team: TEAM,
            hp: HP,
            attack: ATTACK,
            defense: DEFENSE,
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ✏️  2. TU ESTRATEGIA
    // ═══════════════════════════════════════════════════════════════════════
    //
    // La Arena llama esta función en CADA ronda, para ti y para tu rival.
    // Recibes:
    //   me     → tu estado    (hp, max_hp, attack, defense, last_move)
    //   enemy  → el del rival (lo mismo)
    //   round  → número de ronda (1, 2, 3 … hasta 20)
    //
    // Devuelves uno de:
    //   NORMAL  (1) → golpe seguro
    //   FUERTE  (2) → ×1.6, pero falla 30% y si el rival está en GUARDIA te contraataca
    //   GUARDIA (3) → recibes 60% menos daño y te curas 5%
    //
    // ⚠️ Si devuelves otro número o tu código falla, ese turno "te tropiezas".
    pub fn decide_move(_env: Env, me: FighterState, enemy: FighterState, round: u32) -> u32 {
        let my_hp_percent = me.hp * 100 / me.max_hp;

        if my_hp_percent < 20 {
            GUARDIA // Poca vida: a cubrirse
        } else if enemy.last_move == GUARDIA {
            NORMAL // Si se cubrió, un FUERTE me costaría un contraataque
        } else if enemy.hp < 25 {
            FUERTE // Está grogui: a rematar
        } else if round % 3 == 0 {
            FUERTE // Cada 3 rondas, saca chispas
        } else {
            NORMAL
        }
    }
}

#[cfg(test)]
mod test;
