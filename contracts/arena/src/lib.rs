#![no_std]
//! 🏟️ ARENA CENTRAL — la despliega el organizador antes del taller.
//!
//! - `register`: inscribe un Luchador. Lee su ficha, la VALIDA y guarda una copia.
//! - `register_house`: el organizador inscribe un luchador de la casa (Saco de Box): pelea, pero no suma al marcador.
//! - `fight`:    pelea completa en UNA transacción. Cada ronda queda como evento on-chain.
//! - `simulate`: igual que `fight` pero sin guardar nada. Para practicar (lectura).

use cvm_common::{
    FighterClient, FighterProfile, FighterState, FUERTE, GUARDIA, JARANA, MAX_POINTS, MIN_STAT,
    NORMAL, TERROR, TROPIEZO,
};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, Env, String,
    Symbol, Vec,
};

// ─── Reglas del combate ─────────────────────────────────────────────────────

pub const MAX_ROUNDS: u32 = 20;
pub const MAX_FIGHTERS: u32 = 64;
pub const MAX_NAME_LEN: u32 = 24;
pub const HP_MULTIPLIER: u32 = 3;
pub const MIN_DAMAGE: u32 = 3;
/// Probabilidad (0–100) de fallar un ataque FUERTE.
pub const MISS_CHANCE: u64 = 30;

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;
const BUMP_TO: u32 = 30 * DAY_IN_LEDGERS;

// ─── Errores ────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ArenaError {
    AlreadyRegistered = 1,
    NotRegistered = 2,
    /// El contrato no respondió `get_profile` como un Luchador.
    NotAFighter = 3,
    TooManyPoints = 4,
    StatTooLow = 5,
    InvalidTeam = 6,
    InvalidName = 7,
    SameFighter = 8,
    ArenaFull = 9,
    /// Ya hay un luchador inscrito con ese nombre (sin importar mayúsculas).
    NameTaken = 10,
}

// ─── Almacenamiento ─────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    FighterList,
    Fighter(Address),
    /// Nombre normalizado → luchador que lo usa. Así no hay dos "El Cajonero" en la pantalla.
    Name(Bytes),
    Score,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FighterRecord {
    pub fighter: Address,
    pub owner: Address,
    pub profile: FighterProfile,
    pub wins: u32,
    pub losses: u32,
    /// Luchador de la casa (Saco de Box): sus peleas no suman al marcador de bandos.
    pub house: bool,
}

/// Marcador global. Solo los duelos Jarana vs. Terror entre asistentes suman punto de bando.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Scoreboard {
    pub jarana: u32,
    pub terror: u32,
    pub fights: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoundLog {
    pub round: u32,
    pub move_a: u32,
    pub move_b: u32,
    pub damage_to_a: u32,
    pub damage_to_b: u32,
    pub hp_a: u32,
    pub hp_b: u32,
    pub missed_a: bool,
    pub missed_b: bool,
    pub countered_a: bool,
    pub countered_b: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BattleReport {
    pub winner: Address,
    pub loser: Address,
    pub rounds: u32,
    pub knockout: bool,
    pub max_hp_a: u32,
    pub max_hp_b: u32,
    pub log: Vec<RoundLog>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FightResult {
    pub fight_id: u32,
    pub winner: Address,
    pub loser: Address,
    pub winner_team: Symbol,
    pub rounds: u32,
    pub knockout: bool,
}

// ─── Eventos (lo que el frontend lee para "repetir" la pelea) ───────────────

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FighterRegistered {
    #[topic]
    pub fighter: Address,
    pub owner: Address,
    pub name: String,
    pub team: Symbol,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FighterRemoved {
    #[topic]
    pub fighter: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoundPlayed {
    #[topic]
    pub fight_id: u32,
    pub round: u32,
    pub move_a: u32,
    pub move_b: u32,
    pub damage_to_a: u32,
    pub damage_to_b: u32,
    pub hp_a: u32,
    pub hp_b: u32,
    pub missed_a: bool,
    pub missed_b: bool,
    pub countered_a: bool,
    pub countered_b: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FightEnded {
    #[topic]
    pub fight_id: u32,
    pub fighter_a: Address,
    pub fighter_b: Address,
    pub winner: Address,
    pub winner_team: Symbol,
    pub rounds: u32,
    pub knockout: bool,
}

// ─── Contrato ───────────────────────────────────────────────────────────────

#[contract]
pub struct BattleArena;

#[contractimpl]
impl BattleArena {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FighterList, &Vec::<Address>::new(&env));
        env.storage().instance().set(&DataKey::Score, &Scoreboard::default());
    }

    /// Inscribe un Luchador. `owner` firma la transacción (es quien lo inscribe).
    pub fn register(env: Env, owner: Address, fighter: Address) -> Result<FighterProfile, ArenaError> {
        owner.require_auth();
        enroll(&env, owner, fighter, false)
    }

    /// Inscribe un luchador de la casa (el Saco de Box). Pelea como cualquiera, pero no suma al marcador:
    /// si no, cada paliza que recibe le daría un punto al bando contrario.
    pub fn register_house(env: Env, fighter: Address) -> Result<FighterProfile, ArenaError> {
        let admin = admin(&env);
        admin.require_auth();
        enroll(&env, admin, fighter, true)
    }

    /// Ejecuta un duelo oficial. Solo el organizador puede iniciarlo.
    pub fn fight(env: Env, fighter_a: Address, fighter_b: Address) -> Result<FightResult, ArenaError> {
        admin(&env).require_auth();
        bump_instance(&env);

        if fighter_a == fighter_b {
            return Err(ArenaError::SameFighter);
        }
        let mut rec_a = load_record(&env, &fighter_a)?;
        let mut rec_b = load_record(&env, &fighter_b)?;

        let report = run_battle(&env, &fighter_a, &rec_a.profile, &fighter_b, &rec_b.profile);

        let mut score = scoreboard(&env);
        score.fights += 1;
        let fight_id = score.fights;

        for r in report.log.iter() {
            RoundPlayed {
                fight_id,
                round: r.round,
                move_a: r.move_a,
                move_b: r.move_b,
                damage_to_a: r.damage_to_a,
                damage_to_b: r.damage_to_b,
                hp_a: r.hp_a,
                hp_b: r.hp_b,
                missed_a: r.missed_a,
                missed_b: r.missed_b,
                countered_a: r.countered_a,
                countered_b: r.countered_b,
            }
            .publish(&env);
        }

        let a_won = report.winner == fighter_a;
        let (winner_team, loser_team) = if a_won {
            rec_a.wins += 1;
            rec_b.losses += 1;
            (rec_a.profile.team.clone(), rec_b.profile.team.clone())
        } else {
            rec_b.wins += 1;
            rec_a.losses += 1;
            (rec_b.profile.team.clone(), rec_a.profile.team.clone())
        };
        if winner_team != loser_team && !rec_a.house && !rec_b.house {
            if winner_team == JARANA {
                score.jarana += 1;
            } else {
                score.terror += 1;
            }
        }
        save_record(&env, &rec_a);
        save_record(&env, &rec_b);
        env.storage().instance().set(&DataKey::Score, &score);

        FightEnded {
            fight_id,
            fighter_a,
            fighter_b,
            winner: report.winner.clone(),
            winner_team: winner_team.clone(),
            rounds: report.rounds,
            knockout: report.knockout,
        }
        .publish(&env);

        Ok(FightResult {
            fight_id,
            winner: report.winner,
            loser: report.loser,
            winner_team,
            rounds: report.rounds,
            knockout: report.knockout,
        })
    }

    /// Pelea de práctica: no exige inscripción, no guarda nada, no emite eventos.
    /// Úsala con simulación (`stellar contract invoke --send=no ...`).
    pub fn simulate(env: Env, fighter_a: Address, fighter_b: Address) -> Result<BattleReport, ArenaError> {
        if fighter_a == fighter_b {
            return Err(ArenaError::SameFighter);
        }
        let pa = load_profile(&env, &fighter_a)?;
        let pb = load_profile(&env, &fighter_b)?;
        Ok(run_battle(&env, &fighter_a, &pa, &fighter_b, &pb))
    }

    /// El organizador puede expulsar a un Luchador (p. ej. si agota el presupuesto a propósito).
    pub fn remove_fighter(env: Env, fighter: Address) -> Result<(), ArenaError> {
        admin(&env).require_auth();
        bump_instance(&env);

        let record = load_record(&env, &fighter)?;
        env.storage().persistent().remove(&DataKey::Fighter(fighter.clone()));
        // Libera el nombre para que pueda volver a inscribirse (p. ej. con la ficha corregida)
        env.storage().persistent().remove(&DataKey::Name(name_key(&env, &record.profile.name)?));
        let mut list = fighter_list(&env);
        if let Some(i) = list.first_index_of(&fighter) {
            list.remove(i);
        }
        env.storage().instance().set(&DataKey::FighterList, &list);
        FighterRemoved { fighter }.publish(&env);
        Ok(())
    }

    pub fn fighters(env: Env) -> Vec<FighterRecord> {
        let mut out = Vec::new(&env);
        for f in fighter_list(&env).iter() {
            if let Ok(r) = load_record(&env, &f) {
                out.push_back(r);
            }
        }
        out
    }

    pub fn fighter(env: Env, fighter: Address) -> Option<FighterRecord> {
        load_record(&env, &fighter).ok()
    }

    pub fn scoreboard(env: Env) -> Scoreboard {
        scoreboard(&env)
    }

    pub fn admin(env: Env) -> Address {
        admin(&env)
    }
}

// ─── Lógica interna ─────────────────────────────────────────────────────────

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn fighter_list(env: &Env) -> Vec<Address> {
    env.storage().instance().get(&DataKey::FighterList).unwrap_or(Vec::new(env))
}

fn scoreboard(env: &Env) -> Scoreboard {
    env.storage().instance().get(&DataKey::Score).unwrap_or_default()
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
}

fn enroll(env: &Env, owner: Address, fighter: Address, house: bool) -> Result<FighterProfile, ArenaError> {
    bump_instance(env);

    if env.storage().persistent().has(&DataKey::Fighter(fighter.clone())) {
        return Err(ArenaError::AlreadyRegistered);
    }
    let mut list = fighter_list(env);
    if list.len() >= MAX_FIGHTERS {
        return Err(ArenaError::ArenaFull);
    }

    let profile = load_profile(env, &fighter)?;
    let name = DataKey::Name(name_key(env, &profile.name)?);
    if env.storage().persistent().has(&name) {
        return Err(ArenaError::NameTaken);
    }

    let record = FighterRecord {
        fighter: fighter.clone(),
        owner: owner.clone(),
        profile: profile.clone(),
        wins: 0,
        losses: 0,
        house,
    };
    save_record(env, &record);
    env.storage().persistent().set(&name, &fighter);
    env.storage().persistent().extend_ttl(&name, BUMP_THRESHOLD, BUMP_TO);
    list.push_back(fighter.clone());
    env.storage().instance().set(&DataKey::FighterList, &list);

    FighterRegistered { fighter, owner, name: profile.name.clone(), team: profile.team.clone() }.publish(env);
    Ok(profile)
}

/// Nombre normalizado para comparar: sin espacios en los extremos y con las letras ASCII en minúscula
/// ("  EL Cajonero" y "el cajonero" son el mismo luchador). Las tildes se comparan tal cual.
fn name_key(env: &Env, name: &String) -> Result<Bytes, ArenaError> {
    let len = name.len() as usize;
    if len == 0 || len > MAX_NAME_LEN as usize {
        return Err(ArenaError::InvalidName);
    }
    let mut buf = [0u8; MAX_NAME_LEN as usize];
    name.copy_into_slice(&mut buf[..len]);
    let bytes = &mut buf[..len];
    bytes.make_ascii_lowercase();
    let start = bytes.iter().position(|b| !b.is_ascii_whitespace()).ok_or(ArenaError::InvalidName)?;
    let end = bytes.iter().rposition(|b| !b.is_ascii_whitespace()).unwrap() + 1;
    Ok(Bytes::from_slice(env, &bytes[start..end]))
}

fn save_record(env: &Env, record: &FighterRecord) {
    let key = DataKey::Fighter(record.fighter.clone());
    env.storage().persistent().set(&key, record);
    env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
}

fn load_record(env: &Env, fighter: &Address) -> Result<FighterRecord, ArenaError> {
    let key = DataKey::Fighter(fighter.clone());
    let record = env.storage().persistent().get(&key).ok_or(ArenaError::NotRegistered)?;
    env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
    Ok(record)
}

/// Lee la ficha y la valida. La regla de los 100 puntos se revisa AQUÍ,
/// no en el contrato del luchador: no confíes, verifica.
fn load_profile(env: &Env, fighter: &Address) -> Result<FighterProfile, ArenaError> {
    let profile = match FighterClient::new(env, fighter).try_get_profile() {
        Ok(Ok(p)) => p,
        _ => return Err(ArenaError::NotAFighter),
    };
    if profile.name.len() == 0 || profile.name.len() > MAX_NAME_LEN {
        return Err(ArenaError::InvalidName);
    }
    if profile.team != JARANA && profile.team != TERROR {
        return Err(ArenaError::InvalidTeam);
    }
    if profile.hp < MIN_STAT || profile.attack < MIN_STAT || profile.defense < MIN_STAT {
        return Err(ArenaError::StatTooLow);
    }
    // checked_add: sin esto, valores enormes podrían "dar la vuelta" y pasar el control
    let total = profile
        .hp
        .checked_add(profile.attack)
        .and_then(|t| t.checked_add(profile.defense))
        .ok_or(ArenaError::TooManyPoints)?;
    if total > MAX_POINTS {
        return Err(ArenaError::TooManyPoints);
    }
    Ok(profile)
}

fn initial_state(p: &FighterProfile) -> FighterState {
    let max_hp = p.hp * HP_MULTIPLIER;
    FighterState { hp: max_hp, max_hp, attack: p.attack, defense: p.defense, last_move: TROPIEZO }
}

/// Pregunta al contrato del luchador su movimiento. Si falla o responde
/// algo inválido, se tropieza — pero la pelea sigue.
fn ask_move(client: &FighterClient, me: &FighterState, enemy: &FighterState, round: u32) -> u32 {
    match client.try_decide_move(me, enemy, &round) {
        Ok(Ok(m)) if (NORMAL..=GUARDIA).contains(&m) => m,
        _ => TROPIEZO,
    }
}

fn base_damage(attack: u32, defense: u32) -> u32 {
    attack.saturating_sub(defense / 2).max(MIN_DAMAGE)
}

/// Daño que `atk` le hace a `def` este turno. Devuelve (daño, falló).
fn attack_damage(env: &Env, atk: &FighterState, atk_move: u32, def: &FighterState, def_move: u32) -> (u32, bool) {
    let base = base_damage(atk.attack, def.defense);
    let (mut dmg, missed) = match atk_move {
        NORMAL => (base, false),
        FUERTE => {
            if env.prng().gen_range::<u64>(0..100) < MISS_CHANCE {
                (0, true)
            } else {
                (base * 8 / 5, false)
            }
        }
        _ => (0, false), // GUARDIA y TROPIEZO no atacan
    };
    if def_move == GUARDIA {
        dmg = dmg * 2 / 5;
    }
    (dmg, missed)
}

/// Contraataque: quien está en GUARDIA castiga un FUERTE con medio golpe.
fn counter_damage(guard: &FighterState, guard_move: u32, other: &FighterState, other_move: u32) -> (u32, bool) {
    if guard_move == GUARDIA && other_move == FUERTE {
        (base_damage(guard.attack, other.defense) / 2, true)
    } else {
        (0, false)
    }
}

fn apply_round(s: &mut FighterState, damage: u32, my_move: u32) {
    s.hp = s.hp.saturating_sub(damage);
    if s.hp > 0 && my_move == GUARDIA {
        s.hp = (s.hp + s.max_hp / 20).min(s.max_hp);
    }
    s.last_move = my_move;
}

fn run_battle(env: &Env, a: &Address, pa: &FighterProfile, b: &Address, pb: &FighterProfile) -> BattleReport {
    let client_a = FighterClient::new(env, a);
    let client_b = FighterClient::new(env, b);
    let mut sa = initial_state(pa);
    let mut sb = initial_state(pb);
    let mut log = Vec::new(env);
    let mut round = 0;

    while round < MAX_ROUNDS && sa.hp > 0 && sb.hp > 0 {
        round += 1;
        // Ambos deciden sin saber qué hará el otro en este turno
        let move_a = ask_move(&client_a, &sa, &sb, round);
        let move_b = ask_move(&client_b, &sb, &sa, round);

        let (hit_to_b, missed_a) = attack_damage(env, &sa, move_a, &sb, move_b);
        let (hit_to_a, missed_b) = attack_damage(env, &sb, move_b, &sa, move_a);
        let (counter_to_b, countered_a) = counter_damage(&sa, move_a, &sb, move_b);
        let (counter_to_a, countered_b) = counter_damage(&sb, move_b, &sa, move_a);

        let damage_to_a = hit_to_a + counter_to_a;
        let damage_to_b = hit_to_b + counter_to_b;
        apply_round(&mut sa, damage_to_a, move_a);
        apply_round(&mut sb, damage_to_b, move_b);

        log.push_back(RoundLog {
            round,
            move_a,
            move_b,
            damage_to_a,
            damage_to_b,
            hp_a: sa.hp,
            hp_b: sb.hp,
            missed_a,
            missed_b,
            countered_a,
            countered_b,
        });
    }

    let knockout = sa.hp == 0 || sb.hp == 0;
    let a_wins = if sa.hp == 0 && sb.hp == 0 {
        coin_flip(env)
    } else if sb.hp == 0 {
        true
    } else if sa.hp == 0 {
        false
    } else {
        // Se acabaron las rondas: gana quien conserve más % de vida
        let pct_a = sa.hp * 1000 / sa.max_hp;
        let pct_b = sb.hp * 1000 / sb.max_hp;
        if pct_a == pct_b {
            coin_flip(env)
        } else {
            pct_a > pct_b
        }
    };

    let (winner, loser) = if a_wins { (a.clone(), b.clone()) } else { (b.clone(), a.clone()) };
    BattleReport { winner, loser, rounds: round, knockout, max_hp_a: sa.max_hp, max_hp_b: sb.max_hp, log }
}

fn coin_flip(env: &Env) -> bool {
    env.prng().gen_range::<u64>(0..2) == 0
}

#[cfg(test)]
mod test;
