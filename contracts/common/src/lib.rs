#![no_std]
//! Reglas y tipos que comparten la Arena y todos los Luchadores.
//!
//! La Arena y tu Luchador son contratos distintos, desplegados por personas
//! distintas. Para que puedan hablar entre sí necesitan ponerse de acuerdo en
//! una "interfaz": qué funciones existen y qué datos intercambian. Eso vive aquí.

use soroban_sdk::{contractclient, contracttype, symbol_short, Env, String, Symbol};

// ─── Movimientos ────────────────────────────────────────────────────────────

/// Lo asigna la Arena cuando tu contrato falla o devuelve un número inválido:
/// ese turno no atacas ni te defiendes.
pub const TROPIEZO: u32 = 0;
/// Ataque normal: daño = ATK − DEF/2 (mínimo 3).
pub const NORMAL: u32 = 1;
/// Ataque fuerte: ×1.6 de daño, pero falla 30% de las veces.
/// Si el rival estaba en GUARDIA, te contraataca.
pub const FUERTE: u32 = 2;
/// Guardia: recibes 60% menos daño y recuperas 5% de tu vida máxima.
pub const GUARDIA: u32 = 3;

// ─── Bandos ─────────────────────────────────────────────────────────────────

pub const JARANA: Symbol = symbol_short!("JARANA");
pub const TERROR: Symbol = symbol_short!("TERROR");

// ─── Reglas de balance ──────────────────────────────────────────────────────

/// Suma máxima de HP + ATK + DEF.
pub const MAX_POINTS: u32 = 100;
/// Ningún atributo puede ser menor a esto.
pub const MIN_STAT: u32 = 5;

// ─── Datos ──────────────────────────────────────────────────────────────────

/// Ficha del luchador. La Arena la lee una sola vez, al inscribirte,
/// y guarda una copia: cambiarla después no sirve de nada.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FighterProfile {
    pub name: String,
    pub team: Symbol,
    pub hp: u32,
    pub attack: u32,
    pub defense: u32,
}

/// Cómo está un luchador en medio de la pelea. La Arena te pasa el tuyo
/// y el de tu rival en cada turno para que decidas tu movimiento.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FighterState {
    pub hp: u32,
    pub max_hp: u32,
    pub attack: u32,
    pub defense: u32,
    /// Movimiento del turno anterior (0 en la primera ronda).
    pub last_move: u32,
}

/// Interfaz que todo Luchador debe implementar. La macro genera
/// `FighterClient`, que la Arena usa para llamar a tu contrato.
#[contractclient(name = "FighterClient")]
pub trait FighterInterface {
    fn get_profile(env: Env) -> FighterProfile;
    fn decide_move(env: Env, me: FighterState, enemy: FighterState, round: u32) -> u32;
}
