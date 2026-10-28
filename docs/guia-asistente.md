# 🥊 Guía del asistente: Jarana Mortal — Midnight Arena

En 75 minutos vas a escribir un **contrato inteligente** en Rust, desplegarlo en la blockchain de **Stellar** y verlo
pelear en la pantalla gigante contra el bando rival. No necesitas saber Rust ni blockchain: solo vas a editar un archivo.

```
Tu código (Rust) ──compila──▶ WebAssembly ──despliega──▶ Stellar Testnet ──se inscribe──▶ Arena ──▶ 📺
```

## El plan de hoy

| Min | Qué haces | Comando |
|---|---|---|
| 0–10 | Eliges bando y entiendes la Arena | — |
| 10–20 | Preparas tu entorno y tu cuenta | `pnpm check` · `pnpm setup:account` |
| 20–40 | Creas tu luchador y lo pruebas | `pnpm fighter:test` |
| 40–50 | Lo despliegas, entrenas y te inscribes | `pnpm fighter:deploy` · `pnpm fighter:spar` · `pnpm fighter:register` |
| 50–60 | Le pones voz y cara | Web de la Arena → **Mi luchador** |
| 60–75 | 🏆 Torneo en vivo | Mira la pantalla |

Si vas atrasado, `pnpm fighter:ship` hace test → deploy → register de una sola vez.

---

## 0 · Elige tu bando (min 0–10)

| | 🎸 **Team Jarana** (`JARANA`) | 🎃 **Team Halloween** (`TERROR`) |
|---|---|---|
| Quiénes | Criollos de peña: cajón, guitarra, sabor | Monstruos del callejón: vampiros, pishtacos, sombras |
| Voz | Alegre, rápida, fiestera | Profunda, susurrante, monstruosa |

Solo las peleas **entre bandos** suman al marcador (las del *Saco de Box*, el rival de práctica, no cuentan). Tu bando gana si sus luchadores ganan más peleas cruzadas.

### Cómo pelean

Cada ronda, la Arena le pregunta a **tu contrato** qué movimiento hacer. Tu código decide; nadie lo controla en vivo.

| Movimiento | Qué hace |
|---|---|
| 👊 `NORMAL` | Daño = tu ATK − DEF del rival ÷ 2 (mínimo 3) |
| 💥 `FUERTE` | ×1.6 de daño, pero falla el 30% de las veces. Si el rival está en `GUARDIA`, **te contraataca** |
| 🛡️ `GUARDIA` | Recibes 60% menos daño y te curas 5% de tu vida |
| 🍌 Tropiezo | Si tu contrato falla o devuelve otro número, pierdes el turno |

Máximo 20 rondas. Si nadie cae, gana quien tenga más % de vida.

---

## 1 · Prepara tu entorno (min 10–20)

Elige **una** de las dos opciones. Todos los comandos de esta guía se ejecutan en una terminal, **desde la carpeta del
proyecto** (la que tiene `package.json` y `Cargo.toml`). Copia solo el contenido de los bloques y cambia los textos
en MAYÚSCULAS como `URL_DEL_REPO` por tus datos.

### Opción A · GitHub Codespaces (recomendada)

1. Entra con tu cuenta de GitHub a la URL del repo que te da el organizador.
2. Botón verde **Code → Codespaces → Create codespace on main**.
3. Espera: la primera vez descarga Rust, el Stellar CLI y las dependencias, e imprime el resultado de `pnpm check`.
   Puede tardar unos minutos.
4. Abre una terminal (**Terminal → New Terminal**) y sigue con [Revisa que todo esté listo](#revisa-que-todo-esté-listo).

Las llaves que crees en un Codespace viven dentro de él: úsalo solo con cuentas nuevas de este taller.

### Opción B · Tu laptop

Necesitas estas herramientas:

| Herramienta | Para qué sirve | Instalación oficial |
|---|---|---|
| Git | Descargar (clonar) el repo | [git-scm.com](https://git-scm.com/downloads) |
| Node.js 22 y pnpm | Ejecutar los comandos `pnpm …` y la web de la Arena | [Node.js](https://nodejs.org/en/download) · [pnpm](https://pnpm.io/installation) |
| Rust + `wasm32v1-none` | Compilar tu contrato a WebAssembly | [rustup](https://rustup.rs/) |
| Stellar CLI 28 o superior | Crear tu cuenta y desplegar en Testnet | [Instalar CLI](https://developers.stellar.org/docs/tools/cli/install-cli) |
| Freighter *(opcional)* | Firmar desde la web en vez de la terminal | [freighter.app](https://www.freighter.app/) |

Sirve Node 20 o superior; en el taller usamos 22. No uses Node 18.

#### Windows

Los comandos del taller funcionan tal cual en **PowerShell**. Abre PowerShell y ejecuta, uno por uno:

```powershell
winget install --id Git.Git
winget install --id OpenJS.NodeJS.LTS
winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install --id Rustlang.Rustup
winget install --id Stellar.StellarCLI
```

Rust necesita las *Build Tools de C++* de Visual Studio (la tercera línea); sin ellas falla la compilación con un error
de `link.exe`. **Cierra y vuelve a abrir PowerShell** para que reconozca los programas nuevos y luego:

```powershell
npm install --global pnpm@10.6.3
rustup target add wasm32v1-none
```

Si PowerShell dice que *la ejecución de scripts está deshabilitada* al usar `pnpm`, ejecuta una sola vez
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` y responde `S`.

#### macOS

Instala [Homebrew](https://brew.sh/) si aún no lo tienes, y después:

```bash
brew install git node@22 stellar-cli
```

Sigue la indicación que imprime Homebrew para añadir Node 22 al `PATH`. Luego:

```bash
npm install --global pnpm@10.6.3
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add wasm32v1-none
```

#### Linux (Ubuntu o Debian)

```bash
sudo apt update
sudo apt install -y git build-essential curl ca-certificates libdbus-1-3 libudev1
```

Instala Node con [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) siguiendo su instalador oficial, abre
una terminal nueva y ejecuta:

```bash
nvm install 22
npm install --global pnpm@10.6.3
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add wasm32v1-none
curl -fsSL https://github.com/stellar/stellar-cli/releases/download/v28.0.0/stellar-cli-28.0.0-x86_64-unknown-linux-gnu.tar.gz | sudo tar -xz -C /usr/local/bin stellar
```

La última línea es para PC normales (x86_64); en un equipo ARM cambia `x86_64` por `aarch64`.

#### Verifica las herramientas

```bash
git --version
node --version
pnpm --version
rustc --version
stellar --version
```

Cada uno debe imprimir una versión. Si alguno dice *"no se reconoce"* o *"command not found"*, cierra la terminal,
abre otra y vuelve a probar.

#### Descarga el proyecto

```bash
git clone URL_DEL_REPO jarana-mortal
cd jarana-mortal
pnpm install
```

`pnpm install` descarga las librerías de JavaScript y prepara los clientes de los contratos. La primera vez tarda un
poco.

### Revisa que todo esté listo

```bash
pnpm check
```

`pnpm check` revisa Node, Rust, el target `wasm32v1-none`, el Stellar CLI, tu cuenta y la Arena. Lo que falte aparece
con ✖ y debajo te dice cómo arreglarlo. Es normal que *Cuenta de testnet* salga en ✖: la creas ahora:

```bash
pnpm setup:account
```

> **¿Qué acaba de pasar?** Se creó un par de llaves: una **pública** (tu dirección, empieza con `G…`, la puede ver
> cualquiera) y una **secreta** (firma tus transacciones, se queda en tu computadora). *Friendbot* te regaló XLM de
> prueba para pagar las comisiones. Es Testnet: el dinero no es real.

---

## 2 · Crea tu luchador (min 20–40)

Abre **`contracts/fighter/src/lib.rs`**. Solo tocas dos partes, marcadas con ✏️.

### ✏️ 1. Tu ficha

```rust
const NAME: &str = "El Cajonero";            // ¡cámbialo! máx. 24 bytes (á, ñ… cuentan doble)
const TEAM: Symbol = symbol_short!("JARANA"); // o "TERROR"
const HP: u32 = 40;       // tu vida será HP × 3
const ATTACK: u32 = 35;   // cuánto pegas
const DEFENSE: u32 = 25;  // resta la mitad al ataque del rival
```

**Ponle un nombre propio**: la Arena no admite dos luchadores con el mismo nombre (sin importar mayúsculas), así que
si dejas el de la plantilla, lo más probable es que alguien te lo haya ganado. Reglas de la ficha: **máximo 100 puntos** en total y **mínimo 5** en cada atributo. Si te pasas, ni compila. Y si haces trampa
borrando el chequeo, la Arena lo vuelve a revisar al inscribirte: **no confíes, verifica**.

### ✏️ 2. Tu estrategia

`decide_move` recibe tu estado (`me`), el del rival (`enemy`) y la ronda (`round`), y devuelve `NORMAL`, `FUERTE` o
`GUARDIA`. Cada estado tiene `hp`, `max_hp`, `attack`, `defense` y `last_move` (lo que hizo en la ronda anterior).

```rust
pub fn decide_move(_env: Env, me: FighterState, enemy: FighterState, round: u32) -> u32 {
    let my_hp_percent = me.hp * 100 / me.max_hp;

    if my_hp_percent < 20 {
        GUARDIA                       // poca vida: a cubrirse
    } else if enemy.last_move == GUARDIA {
        NORMAL                        // si se cubre, un FUERTE me cuesta un contraataque
    } else if round % 3 == 0 {
        FUERTE                        // cada 3 rondas, saca chispas
    } else {
        NORMAL
    }
}
```

**Ideas para ganar**

- Tanque: mucha `DEFENSE` + `GUARDIA` cuando el rival venga de un `FUERTE`.
- Cañón de vidrio: `ATTACK` al máximo y rematar con `FUERTE` cuando `enemy.hp` esté bajo.
- Lector: si el rival hizo `GUARDIA` dos veces, ¿lo hará otra vez?
- Caos: usa el azar de la blockchain. Cambia `_env` por `env` y escribe `env.prng().gen_range::<u64>(0..100) < 40`.

### Pruébalo

```bash
pnpm fighter:test
```

Corre las pruebas y una **pelea de práctica local** contra el *Saco de Box*, ronda por ronda. Itera aquí todo lo que
quieras: es gratis e instantáneo.

---

## 3 · A la blockchain (min 40–50)

```bash
pnpm fighter:deploy
```

Compila tu código a **WebAssembly** y lo sube a Stellar Testnet. Firma y paga la comisión tu cuenta de
`pnpm setup:account` (con XLM de prueba); no te pide nada en Freighter.

**Cómo reconocer que salió bien:**

1. La terminal termina con algo así:

   ```text
   ✔ Tu luchador vive en la blockchain

     Nombre:      El Cajonero (JARANA)
     CONTRACT_ID: CCYWMA7L6TRHCYCJ32XGFZMJ4WMNBGFVQWYRZNE2Q3CB7S5ALWPD3GDU
     Explorer:    https://stellar.expert/explorer/testnet/contract/CCYW…
   ```

   El **Nombre** lo leyó de la red llamando a tu contrato: si aparece tu nombre, tu contrato ya está vivo y responde.
   Si sale `?`, el despliegue se hizo pero la lectura falló; vuelve a intentar en un minuto con
   `pnpm fighter:status`.
2. Copia tu **`CONTRACT_ID`** (`C…`): lo vas a pegar en la web. No es secreto; es la dirección pública de tu contrato.
   Igual se guarda solo en tu carpeta (`.cvm/local.json`) para los siguientes comandos.
3. Abre el enlace del **Explorer** (Stellar Expert). Puede tardar unos segundos en mostrarlo. Ahí ves tu contrato,
   la transacción que lo creó y, más adelante, cada vez que la Arena lo llame.

Si falla con *"No se pudo desplegar"*, casi siempre es que tu cuenta no tiene XLM: corre `pnpm setup:account` y
vuelve a intentar. Desplegar otra vez **crea un contrato nuevo** con otro `CONTRACT_ID`; el anterior sigue existiendo,
pero los comandos usan siempre el último.

```bash
pnpm fighter:spar               # contra el Saco de Box
pnpm fighter:spar CABC…         # contra el CONTRACT_ID de alguien
```

El sparring **simula** la pelea en la red real, con los contratos reales, pero no envía la transacción: no cuesta nada
y no cuenta para el marcador. Úsalo para retar a tu vecino del bando rival.

¿Contento? Inscríbete:

```bash
pnpm fighter:register
```

> **¿Qué acaba de pasar?** Firmaste una transacción. La Arena llamó a tu contrato (`get_profile`), **verificó** tu
> ficha y guardó una copia. Desde ahora tu ficha no cambia. Tu estrategia sí se ejecuta en vivo en cada pelea: si la
> cambias, eso es otro contrato con otro `CONTRACT_ID` (y tienes que volver a desplegarlo e inscribirlo).

```bash
pnpm fighter:status   # tu récord y el marcador global
```

---

## 4 · Ponle voz y cara (min 50–60)

1. En **ElevenLabs** genera dos audios cortos (1–3 s) con la voz de tu bando:
   - **Ataque** — p. ej. *"¡Sabor a cajón, saca chispas!"* o *"¡Te vas al inframundo!"*
   - **Derrota** — p. ej. *"¡Se me rompió la cuerda!"* o *"¡Maldita luz solar!"*
2. Abre la web de la Arena (el organizador te da la dirección) → **Mi luchador** → pega tu `CONTRACT_ID`.
3. Sube tus dos audios (mp3, wav, ogg, webm o m4a; máx. 3 MB) y, si quieres, un avatar (png, jpg o webp; máx. 1 MB).

Cada archivo se sube **una sola vez**: elige bien. Si no subes nada, suena la voz por defecto de tu bando.

En esa misma página ves tu ficha tal como la lee la Arena, si ya estás inscrito, y puedes hacer sparring desde el
navegador. También puedes inscribirte desde ahí con la wallet **Freighter** (en Testnet), si prefieres no usar la terminal.

---

## 5 · 🏆 Torneo (min 60–75)

El organizador lanza las peleas oficiales. La pantalla gigante **escucha los eventos** de la Arena en la blockchain y
repite cada pelea apenas sucede, con tus gritos y la música. Tú no haces nada más… salvo gritar.

---

## ¿Practicas sin organizador?

Puedes montar **tu propia Arena** en Testnet y ser tú quien lanza las peleas. Hazlo después del paso 1 (entorno y
cuenta lista):

1. Despliega tu Arena y su Saco de Box:

   ```bash
   pnpm arena:deploy
   ```

   Como el repo ya trae la Arena oficial, te pregunta si quieres reemplazarla: responde `s`. Al terminar, tu cuenta es
   la **admin** de esa Arena y `config/arena.json` apunta a ella. Ese archivo es el que leen todos los demás comandos.
2. Sigue los pasos 2 y 3 de esta guía tal cual: `fighter:test`, `fighter:deploy`, `fighter:spar` y
   `fighter:register`.
3. Lanza una pelea oficial contra el Saco de Box. Su ID está en `config/arena.json`, en `sparringId`:

   ```bash
   pnpm arena:fight TU_CONTRACT_ID ID_DEL_SACO
   ```

   Para una pelea entre bandos crea otra cuenta (`pnpm setup:account otra-cuenta`), cambia `NAME` y `TEAM`, despliega
   e inscribe ese segundo luchador, y vuelve a tu cuenta con `pnpm setup:account TU_CUENTA` antes de usar `arena:*`
   (solo la admin puede lanzar peleas).
4. Mírala en la web:

   ```bash
   pnpm --filter @cvm/frontend dev
   ```

   Abre `http://localhost:5173`, pulsa 🔈 y **Repetir** en la pelea del historial.

Tu `config/arena.json` ahora es distinto al del repo. Si después vas a un taller, devuélvelo a la Arena oficial con
`git checkout config/arena.json` (o `git pull`) y no lo subas.

---

## Lo que aprendiste sin darte cuenta

| En el juego | En blockchain |
|---|---|
| `pnpm setup:account` | Cuentas = par de llaves; la secreta firma, la pública identifica |
| XLM de Friendbot | Cada transacción paga una comisión pequeña |
| `pnpm fighter:deploy` | Un contrato es código WebAssembly con dirección propia (`C…`) |
| `fighter:spar` vs `fighter:register` | Simular (leer, gratis) vs. enviar una transacción (escribir, firmada) |
| La Arena revisa tu ficha | Nunca confíes en otro contrato: verifica lo que te devuelve |
| La Arena llama a tu `decide_move` | Composabilidad: contratos que llaman a otros contratos |
| 🍌 Tropiezo | Si un contrato falla, quien lo llama decide qué hacer |
| La ficha no cambia | Lo que se escribe en la cadena queda registrado; un cambio es un despliegue nuevo |
| La pantalla repite la pelea | Los contratos emiten **eventos** que cualquier app puede escuchar |
| `env.prng()` | Azar generado por la red, igual para todos los que validan |

---

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| `Trampa criolla: los puntos totales no pueden superar 100` | Baja HP + ATTACK + DEFENSE a 100 o menos |
| `Cada atributo necesita al menos 5 puntos` | Sube el atributo que está en menos de 5 |
| `El bando debe ser "JARANA" o "TERROR"` | Revisa `TEAM`: exactamente `symbol_short!("JARANA")` o `symbol_short!("TERROR")` |
| `El nombre debe tener entre 1 y 24 bytes` | Acorta `NAME` (las tildes y la ñ cuentan doble) |
| `Todavía no desplegaste tu luchador` | Corre `pnpm fighter:deploy` |
| `Ya hay un luchador con ese nombre` | Cambia `NAME`, corre `pnpm fighter:deploy` y luego `pnpm fighter:register` |
| `Ese luchador ya está inscrito` | ¡Ya estás! Revisa con `pnpm fighter:status` |
| `Ese contrato no responde como un Luchador` | Ese `CONTRACT_ID` no es un luchador (¿copiaste bien?) |
| `La Arena está llena` | Avísale al organizador |
| Error de Friendbot o “cuenta no encontrada” | Vuelve a correr `pnpm setup:account` (reusa tu cuenta) |
| Errores de compilación de Rust | Lee la primera línea en rojo: casi siempre es un `;` o una llave `}` que falta |
| Otra cosa rara | Repite el comando con `CVM_DEBUG=1 pnpm …` (en PowerShell: `$env:CVM_DEBUG=1; pnpm …`) y muéstraselo al organizador |
