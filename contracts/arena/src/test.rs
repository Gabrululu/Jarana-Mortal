#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{symbol_short, testutils::Address as _, testutils::Events as _, Env};

/// Declara un luchador de prueba en una línea.
macro_rules! fighter {
    ($ty:ident, $label:expr, $team:expr, $hp:expr, $atk:expr, $def:expr, |$me:ident, $enemy:ident, $round:ident| $body:expr) => {
        #[contract]
        pub struct $ty;

        #[contractimpl]
        impl $ty {
            pub fn get_profile(env: Env) -> FighterProfile {
                FighterProfile {
                    name: String::from_str(&env, $label),
                    team: $team,
                    hp: $hp,
                    attack: $atk,
                    defense: $def,
                }
            }

            pub fn decide_move(_env: Env, $me: FighterState, $enemy: FighterState, $round: u32) -> u32 {
                $body
            }
        }
    };
}

fighter!(Rompehuesos, "Rompehuesos", JARANA, 30, 60, 10, |_m, _e, _r| NORMAL);
fighter!(Momia, "La Momia", TERROR, 50, 20, 30, |_m, _e, _r| NORMAL);
fighter!(Tortuga, "Tortuga", TERROR, 40, 5, 55, |_m, _e, _r| GUARDIA);
fighter!(Berserker, "Berserker", JARANA, 30, 60, 10, |_m, _e, _r| FUERTE);
fighter!(Tramposo, "Tramposo", JARANA, 80, 80, 80, |_m, _e, _r| NORMAL);
fighter!(Desbordado, "Desbordado", JARANA, u32::MAX, 5, 5, |_m, _e, _r| NORMAL);
fighter!(Pirata, "Pirata", symbol_short!("PIRATA"), 30, 30, 30, |_m, _e, _r| NORMAL);
fighter!(Flaco, "Flaco", TERROR, 90, 3, 7, |_m, _e, _r| NORMAL);
fighter!(SinNombre, "", TERROR, 30, 30, 30, |_m, _e, _r| NORMAL);
fighter!(Panico, "Pánico", JARANA, 34, 33, 33, |_m, _e, _r| panic!("se me rompió la cuerda"));
fighter!(Loco, "Loco", JARANA, 34, 33, 33, |_m, _e, _r| 7);
fighter!(MomiaGemela, "  LA MOMIA ", JARANA, 34, 33, 33, |_m, _e, _r| NORMAL);
fighter!(Espacios, "   ", TERROR, 34, 33, 33, |_m, _e, _r| NORMAL);

/// Un contrato cualquiera que no es un luchador.
#[contract]
pub struct Contador;

#[contractimpl]
impl Contador {
    pub fn increment(_env: Env) -> u32 {
        1
    }
}

struct Setup<'a> {
    env: Env,
    admin: Address,
    owner: Address,
    arena: BattleArenaClient<'a>,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let id = env.register(BattleArena, (&admin,));
    let arena = BattleArenaClient::new(&env, &id);
    Setup { env, admin, owner, arena }
}

// ─── Inscripción ────────────────────────────────────────────────────────────

#[test]
fn registra_luchador_valido() {
    let s = setup();
    let f = s.env.register(Momia, ());

    let profile = s.arena.register(&s.owner, &f);
    assert_eq!(profile.hp, 50);
    assert_eq!(profile.team, TERROR);

    let rec = s.arena.fighter(&f).unwrap();
    assert_eq!(rec.owner, s.owner);
    assert_eq!((rec.wins, rec.losses), (0, 0));
    assert_eq!(s.arena.fighters().len(), 1);
}

#[test]
fn rechaza_trampas_y_fichas_invalidas() {
    let s = setup();
    let cases = [
        (s.env.register(Tramposo, ()), ArenaError::TooManyPoints),
        (s.env.register(Desbordado, ()), ArenaError::TooManyPoints),
        (s.env.register(Pirata, ()), ArenaError::InvalidTeam),
        (s.env.register(Flaco, ()), ArenaError::StatTooLow),
        (s.env.register(SinNombre, ()), ArenaError::InvalidName),
        (s.env.register(Contador, ()), ArenaError::NotAFighter),
        (Address::generate(&s.env), ArenaError::NotAFighter),
    ];
    for (f, expected) in cases {
        assert_eq!(s.arena.try_register(&s.owner, &f), Err(Ok(expected)));
    }
    assert_eq!(s.arena.fighters().len(), 0);
}

#[test]
fn no_permite_doble_inscripcion() {
    let s = setup();
    let f = s.env.register(Momia, ());
    s.arena.register(&s.owner, &f);
    assert_eq!(s.arena.try_register(&s.owner, &f), Err(Ok(ArenaError::AlreadyRegistered)));
}

#[test]
fn no_permite_nombres_repetidos() {
    let s = setup();
    let momia = s.env.register(Momia, ());
    let gemela = s.env.register(MomiaGemela, ());
    s.arena.register(&s.owner, &momia);

    // "  LA MOMIA " es el mismo nombre que "La Momia", aunque sea de otro bando
    assert_eq!(s.arena.try_register(&s.owner, &gemela), Err(Ok(ArenaError::NameTaken)));

    // Si el organizador expulsa a la original, el nombre queda libre
    s.arena.remove_fighter(&momia);
    s.arena.register(&s.owner, &gemela);
    assert_eq!(s.arena.try_register(&s.owner, &momia), Err(Ok(ArenaError::NameTaken)));
}

#[test]
fn nombre_de_solo_espacios_no_vale() {
    let s = setup();
    let f = s.env.register(Espacios, ());
    assert_eq!(s.arena.try_register(&s.owner, &f), Err(Ok(ArenaError::InvalidName)));
}

#[test]
fn inscribir_exige_firma_del_dueno() {
    let s = setup();
    let f = s.env.register(Momia, ());
    s.arena.register(&s.owner, &f);
    assert_eq!(s.env.auths()[0].0, s.owner);
}

// ─── Combate ────────────────────────────────────────────────────────────────

#[test]
fn pelea_oficial_con_ganador_eventos_y_marcador() {
    let s = setup();
    let rompe = s.env.register(Rompehuesos, ());
    let momia = s.env.register(Momia, ());
    s.arena.register(&s.owner, &rompe);
    s.arena.register(&s.owner, &momia);

    // Rompehuesos: 90 HP, pega 60 − 30/2 = 45  →  la Momia (150 HP) cae en la ronda 4
    // Momia:      150 HP, pega 20 − 10/2 = 15  →  Rompehuesos termina con 90 − 60 = 30
    let result = s.arena.fight(&rompe, &momia);
    let events = s.env.events().all();

    assert_eq!(result.fight_id, 1);
    assert_eq!(result.winner, rompe);
    assert_eq!(result.winner_team, JARANA);
    assert_eq!(result.rounds, 4);
    assert!(result.knockout);

    // 4 rondas + 1 fin de pelea
    assert_eq!(events.events().len(), 5);

    // Solo el organizador puede iniciar peleas
    assert_eq!(s.env.auths()[0].0, s.admin);

    assert_eq!(s.arena.scoreboard(), Scoreboard { jarana: 1, terror: 0, fights: 1 });
    assert_eq!(s.arena.fighter(&rompe).unwrap().wins, 1);
    assert_eq!(s.arena.fighter(&momia).unwrap().losses, 1);
}

#[test]
fn simulacion_detalla_cada_ronda() {
    let s = setup();
    let rompe = s.env.register(Rompehuesos, ());
    let momia = s.env.register(Momia, ());

    let r = s.arena.simulate(&rompe, &momia);
    let hp_b: std::vec::Vec<u32> = r.log.iter().map(|l| l.hp_b).collect();
    assert_eq!(hp_b, [105, 60, 15, 0]);
    assert_eq!(r.log.get(3).unwrap().hp_a, 30);
    assert_eq!((r.max_hp_a, r.max_hp_b), (90, 150));
}

#[test]
fn simulacion_no_guarda_nada() {
    let s = setup();
    let rompe = s.env.register(Rompehuesos, ());
    let momia = s.env.register(Momia, ());

    s.arena.simulate(&rompe, &momia);
    assert_eq!(s.arena.scoreboard().fights, 0);
    assert_eq!(s.arena.fighters().len(), 0);
}

#[test]
fn guardia_reduce_dano_y_cura() {
    let s = setup();
    let rompe = s.env.register(Rompehuesos, ());
    let tortuga = s.env.register(Tortuga, ());

    // Rompehuesos pega 60 − 55/2 = 33; con guardia: 33 × 2/5 = 13
    // Tortuga: 120 − 13 + 6 (5% de 120) = 113
    let first = s.arena.simulate(&rompe, &tortuga).log.get(0).unwrap();
    assert_eq!(first.damage_to_b, 13);
    assert_eq!(first.hp_b, 113);
    assert_eq!(first.damage_to_a, 0);
}

#[test]
fn fuerte_contra_guardia_recibe_contraataque() {
    let s = setup();
    let berserker = s.env.register(Berserker, ());
    let tortuga = s.env.register(Tortuga, ());

    let report = s.arena.simulate(&berserker, &tortuga);
    for l in report.log.iter() {
        assert!(l.countered_b);
        // Tortuga pega max(5 − 10/2, 3) = 3; contraataque = 3 / 2 = 1
        assert_eq!(l.damage_to_a, 1);
    }
}

#[test]
fn luchador_que_falla_se_tropieza_pero_la_pelea_sigue() {
    let s = setup();
    for f in [s.env.register(Panico, ()), s.env.register(Loco, ())] {
        let momia = s.env.register(Momia, ());
        let report = s.arena.simulate(&f, &momia);
        assert!(report.log.iter().all(|l| l.move_a == TROPIEZO));
        assert_eq!(report.winner, momia);
    }
}

#[test]
fn limite_de_rondas_decide_por_porcentaje() {
    let s = setup();
    let t1 = s.env.register(Tortuga, ());
    let t2 = s.env.register(Tortuga, ());

    let report = s.arena.simulate(&t1, &t2);
    assert_eq!(report.rounds, MAX_ROUNDS);
    assert!(!report.knockout);
}

#[test]
fn pelea_del_mismo_bando_no_suma_punto() {
    let s = setup();
    let rompe = s.env.register(Rompehuesos, ());
    let berserker = s.env.register(Berserker, ());
    s.arena.register(&s.owner, &rompe);
    s.arena.register(&s.owner, &berserker);

    s.arena.fight(&rompe, &berserker);
    assert_eq!(s.arena.scoreboard(), Scoreboard { jarana: 0, terror: 0, fights: 1 });
}

#[test]
fn errores_de_pelea() {
    let s = setup();
    let momia = s.env.register(Momia, ());
    let rompe = s.env.register(Rompehuesos, ());
    s.arena.register(&s.owner, &momia);

    assert_eq!(s.arena.try_fight(&momia, &momia), Err(Ok(ArenaError::SameFighter)));
    assert_eq!(s.arena.try_fight(&momia, &rompe), Err(Ok(ArenaError::NotRegistered)));
}

#[test]
fn organizador_puede_expulsar() {
    let s = setup();
    let momia = s.env.register(Momia, ());
    s.arena.register(&s.owner, &momia);

    s.arena.remove_fighter(&momia);
    assert_eq!(s.env.auths()[0].0, s.admin);
    assert!(s.arena.fighter(&momia).is_none());
    assert_eq!(s.arena.fighters().len(), 0);
    assert_eq!(s.arena.try_remove_fighter(&momia), Err(Ok(ArenaError::NotRegistered)));
}

#[test]
fn luchador_de_la_casa_pelea_pero_no_suma() {
    let s = setup();
    let saco = s.env.register(Rompehuesos, ());
    let momia = s.env.register(Momia, ());
    s.arena.register_house(&saco);
    // Solo el organizador inscribe luchadores de la casa, y queda como dueño
    assert_eq!(s.env.auths()[0].0, s.admin);
    s.arena.register(&s.owner, &momia);

    let rec = s.arena.fighter(&saco).unwrap();
    assert!(rec.house);
    assert_eq!(rec.owner, s.admin);
    assert!(!s.arena.fighter(&momia).unwrap().house);

    // Rompehuesos (JARANA) le gana a la Momia (TERROR), pero el marcador de bandos no se mueve
    let result = s.arena.fight(&saco, &momia);
    assert_eq!(result.winner, saco);
    assert_eq!(s.arena.scoreboard(), Scoreboard { jarana: 0, terror: 0, fights: 1 });
    assert_eq!(s.arena.fighter(&saco).unwrap().wins, 1);
    assert_eq!(s.arena.fighter(&momia).unwrap().losses, 1);
}
