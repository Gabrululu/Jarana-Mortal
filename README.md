# Jarana Mortal: Midnight Arena

Taller por turnos sobre Stellar/Soroban: programas tu luchador como contrato inteligente, lo despliegas en Testnet y pelea en la Arena Central.

👉 Empieza por la [Guía del asistente](docs/guia-asistente.md): los 75 minutos paso a paso.

## ¿Nuevo en Stellar?

| Palabra | Qué significa aquí |
|---|---|
| **Stellar** | Una blockchain: un registro público que comparten muchas computadoras y que nadie puede editar a escondidas |
| **Testnet** | La red de práctica de Stellar. Funciona igual que la real, pero el dinero (XLM) es de juguete y gratis |
| **Cuenta** | Un par de llaves. La **pública** (`G…`) es tu dirección; la **secreta** firma tus acciones y nunca se comparte |
| **XLM / Friendbot** | XLM es la moneda de Stellar; cada transacción paga una comisión mínima. Friendbot te regala XLM de Testnet |
| **Soroban** | Los contratos inteligentes de Stellar: programas en Rust que viven en la red |
| **`CONTRACT_ID`** | La dirección de un contrato desplegado (`C…`). Tu luchador tiene una; la Arena, otra |
| **Simular vs. enviar** | Simular pregunta "¿qué pasaría?" sin costo ni cambios; enviar firma una transacción y queda guardada |
| **Eventos** | Avisos que emite un contrato. La web los escucha para repetir cada pelea |
| **Freighter** | Extensión del navegador para firmar con tu cuenta desde la web |

## Requisitos

Node 20+, pnpm, Rust con `wasm32v1-none` y Stellar CLI. O abre el repo en **GitHub Codespaces / Dev Container** y ya está todo instalado.
Instalación paso a paso para Windows, macOS y Linux: [Guía del asistente § 1](docs/guia-asistente.md#1--prepara-tu-entorno-min-1020).

```bash
pnpm check
```

## Asistente

| Comando | Qué hace |
|---|---|
| `pnpm setup:account` | Crea tu cuenta de Testnet y la llena de XLM de prueba |
| `pnpm fighter:test` | Prueba tu luchador y muestra una pelea de práctica local |
| `pnpm fighter:deploy` | Compila y despliega tu contrato → te da tu `CONTRACT_ID` |
| `pnpm fighter:spar [RIVAL_ID]` | Pelea simulada en Testnet (gratis, no escribe nada) |
| `pnpm fighter:register` | Inscribe tu luchador en la Arena |
| `pnpm fighter:ship` | test → deploy → register de una sola vez |
| `pnpm fighter:status` | Tu récord y el marcador global |

Lo único que editas: [`contracts/fighter/src/lib.rs`](contracts/fighter/src/lib.rs).

Los comandos `arena:*` son del organizador: solo funcionan con la cuenta que desplegó la Arena (el contrato rechaza
cualquier otra firma), así que no hace falta esconderlos.

## La web de la Arena

```bash
pnpm --filter @cvm/frontend dev
```

Abre `http://localhost:5173`. Con `--host` (ya incluido) los asistentes entran desde su celular o laptop por la red
local con la IP que imprime Vite.

| Sección | Para quién | Qué hace |
|---|---|---|
| **Arena** | Pantalla gigante | Escucha los eventos de la Arena y repite cada pelea nueva en Phaser, con voces y música. El organizador conecta Freighter (admin) para lanzar peleas; también las detecta si se lanzan con `pnpm arena:fight`. Botón **Proyector** = pantalla completa |
| **Mi luchador** | Asistentes | Pegan su `CONTRACT_ID`: ven su ficha y las reglas que valida la Arena, se inscriben con Freighter, suben sus gritos de ElevenLabs y avatar, y hacen sparring simulado |
| **Luchadores** | Todos | Inscritos por bando con stats y récord |

Los audios y avatares se guardan en `frontend/media/` (fuera de git) en la laptop que corre el servidor. Cada archivo se
sube una sola vez.

### Audio

| Qué | Dónde | Si falta |
|---|---|---|
| Gritos de cada luchador | Los sube cada asistente en **Mi luchador** | Suena la voz por defecto de su bando |
| Voces por defecto | `frontend/public/sounds/{jarana,terror}-{attack,defeat}.mp3` | — (ya vienen incluidas) |
| Música | `frontend/public/music/` (fuera de git, la pone el organizador) | Versión sintetizada de cada pista |

La Arena iguala el volumen de todos los gritos al reproducirlos, así que no hace falta normalizar los archivos.

## Desarrollo

| Comando | Qué hace |
|---|---|
| `pnpm test` | Pruebas de todos los contratos |
| `pnpm bindings` | Regenera `packages/arena-client` y `packages/fighter-client` desde el wasm (tras cambiar un contrato) |
| `pnpm smoke [cuenta-admin]` | Prueba `@cvm/game` contra la Arena real; con cuenta admin también firma una pelea y la repite desde los eventos |

`CVM_DEBUG=1` muestra el error original detrás de cada mensaje en español.

## Estructura

```
contracts/
  common/    tipos, movimientos y reglas compartidas
  fighter/   plantilla del asistente
  arena/     contrato central (valida, combate, eventos, marcador)
  sparring/  Saco de Box, rival oficial de práctica
packages/
  arena-client/    bindings TS generados (no editar a mano: pnpm bindings)
  fighter-client/  ídem para la interfaz de luchador
  game/            @cvm/game: config, reglas en español, lecturas/escrituras y eventos
scripts/     comandos de pnpm (Node, multiplataforma)
config/      arena.json — la Arena oficial (lo publica el organizador)
docs/        guía del asistente
```
