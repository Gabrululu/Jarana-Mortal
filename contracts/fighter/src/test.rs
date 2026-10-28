//! Pruebas de tu luchador. Corre:  cargo test -p fighter -- --nocapture
#![cfg(test)]
extern crate std;

use super::{FighterContract, FighterContractClient};
use arena::{BattleArena, BattleArenaClient};
use cvm_common::{FighterState, FUERTE, GUARDIA, JARANA, MAX_POINTS, MIN_STAT, NORMAL, TERROR, TROPIEZO};
use soroban_sdk::{testutils::Address as _, Address, Env};
use sparring::SparringContract;
use std::println;

fn move_name(m: u32) -> &'static str {
    match m {
        NORMAL => "Normal",
        FUERTE => "Fuerte",
        GUARDIA => "Guardia",
        _ => "¡Tropiezo!",
    }
}

#[test]
fn mi_ficha_respeta_las_reglas() {
    let env = Env::default();
    let id = env.register(FighterContract, ());
    let p = FighterContractClient::new(&env, &id).get_profile();

    assert!(p.hp + p.attack + p.defense <= MAX_POINTS, "Te pasaste de 100 puntos");
    assert!(p.hp >= MIN_STAT && p.attack >= MIN_STAT && p.defense >= MIN_STAT);
    assert!(p.team == JARANA || p.team == TERROR, "El bando debe ser JARANA o TERROR");
    assert!(p.name.len() > 0 && p.name.len() <= 24, "Nombre entre 1 y 24 caracteres");
}

#[test]
fn siempre_devuelvo_un_movimiento_valido() {
    let env = Env::default();
    let id = env.register(FighterContract, ());
    let client = FighterContractClient::new(&env, &id);

    // Probamos muchas situaciones distintas: nunca deberías tropezarte.
    for my_hp in [1u32, 10, 30, 60, 120] {
        for enemy_hp in [1u32, 10, 30, 60, 120] {
            for last in [TROPIEZO, NORMAL, FUERTE, GUARDIA] {
                for round in 1..=20u32 {
                    let me = FighterState { hp: my_hp, max_hp: 120, attack: 35, defense: 25, last_move: last };
                    let enemy = FighterState { hp: enemy_hp, max_hp: 120, attack: 35, defense: 25, last_move: last };
                    let m = client.decide_move(&me, &enemy, &round);
                    assert!((NORMAL..=GUARDIA).contains(&m), "Movimiento inválido: {m}");
                }
            }
        }
    }
}

#[test]
fn pelea_de_practica() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let arena_id = env.register(BattleArena, (&admin,));
    let arena = BattleArenaClient::new(&env, &arena_id);

    let me = env.register(FighterContract, ());
    let saco = env.register(SparringContract, ());

    let report = arena.simulate(&me, &saco);

    println!("\n🥊 Pelea de práctica contra el Saco de Box");
    for r in report.log.iter() {
        println!(
            "  Ronda {:>2} │ tú: {:<10} rival: {:<10} │ le quitas {:>3}  te quita {:>3} │ HP {:>3} vs {:>3}",
            r.round, move_name(r.move_a), move_name(r.move_b), r.damage_to_b, r.damage_to_a, r.hp_a, r.hp_b
        );
    }
    let gane = report.winner == me;
    println!(
        "  {} en {} rondas{}\n",
        if gane { "🏆 ¡GANASTE!" } else { "💀 Perdiste" },
        report.rounds,
        if report.knockout { " por KO" } else { " por puntos" }
    );

    for r in report.log.iter() {
        assert_ne!(r.move_a, TROPIEZO, "Te tropezaste en la ronda {}", r.round);
    }
}
