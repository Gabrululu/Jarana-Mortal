#![no_std]
//! 🥊 Saco de Box — rival de práctica. Balanceado y predecible:
//! ataca normal y se cubre cuando le queda menos del 30% de vida.

use cvm_common::{FighterProfile, FighterState, GUARDIA, NORMAL, TERROR};
use soroban_sdk::{contract, contractimpl, Env, String};

#[contract]
pub struct SparringContract;

#[contractimpl]
impl SparringContract {
    pub fn get_profile(env: Env) -> FighterProfile {
        FighterProfile {
            name: String::from_str(&env, "Saco de Box"),
            team: TERROR,
            hp: 34,
            attack: 33,
            defense: 33,
        }
    }

    pub fn decide_move(_env: Env, me: FighterState, _enemy: FighterState, _round: u32) -> u32 {
        if me.hp * 100 / me.max_hp < 30 {
            GUARDIA
        } else {
            NORMAL
        }
    }
}
