// LO QUE EL JUEGO ESCRIBE EN LA CONSOLA DE SUCESOS AL PEGAR Y AL RECIBIR.
//
// Seis cadenas, y las seis son del mod con su línea. Están aquí y no en
// `src/main.js` porque son REGLA —qué texto sale de qué números— y así las mide
// una prueba de Node sin navegador; el dibujo es de `src/juego/hudms.js`.
//
// ── POR QUÉ EXISTE ESTE ARCHIVO: el texto era NUESTRO ───────────────────────
//
// Lo reportó el usuario: «el event hud me parece todavía tiene texto
// inventado». Y lo era. Lo que este archivo sustituye, medido buscando cada
// cadena en `../MSC/` y no encontrándola:
//
//   lo que decíamos                        lo que dice el juego
//   «3.4 damage to Giant Rat — 17 of 20 left»   «Hit Giant Rat: 3.4 slash damage.  »
//   «CRITICAL! » delante                   «CRIT! (tirada/umbral)» DETRÁS
//   «You missed: too far»                  «Missed Giant Rat.»
//   «Giant Rat hits you: 3.4 damage»       «Giant Rat hits you: 3.4 slash damage.  »
//   «You killed Giant Rat — 25 experience» NADA: ver abajo
//   «Giant Rat flees»                      NADA: el mod no lo anuncia
//
// Es el fallo del 65 otra vez, y el 65 ya lo dijo de esta misma esquina: «un
// mensaje plausible en el sitio correcto es más difícil de ver que uno
// ausente». Entonces fue «You parried the blow!»; estas seis sobrevivieron
// veinte experimentos al lado de aquella corrección.
//
// ── LA EXPERIENCIA AL MATAR NO SE ANUNCIA AQUÍ, Y ESO ES DEL MOD ────────────
//
// `playerstats.cpp:208` lleva la línea comentada por su autor:
//
//     //SendInfoMsg( "You gain %d XP", EnemySkillLevel ); //thothie - XP report - no workie
//
// Así que el juego NO te dice la experiencia en la consola de sucesos. Quien lo
// dice es el guion del jugador, en verde y por otra puerta: `game_xpgain` →
// «XP Awarded» (`gplayermessage`), portado en el 65 y con su prueba en
// `test/juego_efectos65.test.mjs`. Nuestra línea de «You killed X — N
// experience» era un tercer mensaje que no existe en ninguna parte.
//
// ── UNA TRAMPA QUE CASI ME COME: EL FORMATO MUERTO ─────────────────────────
//
// `giattack.cpp:1433` tiene `"You attack %s. %s %s%s"`, que es código de verdad
// —ni `#if 0` ni una línea con `//` delante— y es el que estuve a punto de
// portar. Está DENTRO DE UN COMENTARIO de bloque que cierra en `:1529` con un
// `}*/` pegado al margen, 96 líneas más abajo de donde se lee el formato. El
// vivo es el de `CBaseEntity *DoDamage(damage_t &, CBaseEntity *)` (`:1657`),
// con el comentario de Thothie «SEP2019_22 - changing report syntax to be
// shorter» encima.
//
// Es el `NPC_NO_DROPS` del 82 —un valor de un bloque muerto con la misma cara
// que uno vivo— pero en C++ y sin horneado de por medio. *Antes de citar una
// línea del motor, comprueba que no está dentro de un comentario que empezó
// cien líneas antes.*

/**
 * El elemento que el mensaje sabe nombrar, con su ESPACIO DELANTE.
 *
 * `char element_code[11] = ""` y trece `starts_with` en este orden
 * (giattack.cpp:1870-1896). El espacio va dentro del elemento y no en el
 * formato, que es por lo que un tipo que no casa da «3.0 damage.» sin hueco
 * de más.
 *
 * El orden importa y se conserva: son `else if` encadenados, así que el primero
 * que case gana. Hoy ninguno es prefijo de otro y el orden no cambia nada; el
 * día que el mod añada uno que sí lo sea, esta lista ya decide igual que él.
 */
export const ELEMENTOS = Object.freeze([
  "fire", "cold", "lightning", "poison", "acid", "slash", "blunt", "pierce",
  "magic", "holy", "dark", "apostle", "earth",
]);

/**
 * Lo que el mod NO sabe nombrar aunque los guiones lo declaren.
 *
 * Son dos listas que no coinciden, y la diferencia se ve en pantalla: `stun` lo
 * declaran 56 `takedmg` y no tiene rama, así que una resistencia al
 * aturdimiento sale con su corchete y sin elemento. Al revés, `apostle` y
 * `earth` tienen rama y cero `takedmg` en los 2 884 guiones.
 *
 * No es una lista de la que dependa nada: está aquí para que la próxima sesión
 * no «arregle» un elemento que falta y que el mod tampoco pone.
 */
export const SIN_ELEMENTO = Object.freeze(["stun", "siege", "generic"]);

/**
 * `tdm_engrish` cuando no hay resistencia: UN ESPACIO, no la cadena vacía
 * (giattack.cpp:1922). De ahí los dos espacios del final de «3.4 damage.  ».
 */
export const ENGRISH = " ";

/** El elemento de un tipo de daño, con su espacio, o `""`. */
export function elementoDe(tipo) {
  const t = String(tipo ?? "").toLowerCase();
  const hallado = ELEMENTOS.find((e) => t.startsWith(e));
  return hallado ? ` ${hallado}` : "";
}

/**
 * `szDamage`: `"%.1f%s damage."` si el golpe entró, y la cadena VACÍA si no
 * (giattack.cpp:1898). El punto final es del mod.
 */
export function textoDeDano(dano, tipo, acerto = true) {
  if (!acerto) return "";
  return `${Number(dano ?? 0).toFixed(1)}${elementoDe(tipo)} damage.`;
}

/**
 * El corchete de resistencia, `tdm_engrish` (giattack.cpp:1925-1932).
 *
 * `int(...)` en C trunca hacia cero, así que un modificador de 0,81 da
 * `[18% resistant]` y no 19: (1 − 0,81) · 100 = 18,999…
 *
 * TRES COSAS DEL MOD que este puerto no puede ejercitar todavía, porque no lee
 * el comando `takedmg` (npcscript.cpp:1057-1104), y que van dichas aquí para
 * que no se porten como si fueran nuestras:
 *
 *   1. `takedmg all` NO sale nunca en el mensaje. Se aplica
 *      (msmonsterserver.cpp:2269) pero el informe sólo recorre
 *      `TakeDamageModifiers` (giattack.cpp:1909), donde `all` no entra. Y es el
 *      tipo más declarado: 275 de 1 655 llamadas. El jefe jabalí de Edana hace
 *      `takedmg all .81` (`edana/boarboss.script:18`), así que recibe un 19 %
 *      menos y el HUD no dice una palabra. La ausencia es fiel.
 *   2. El informe empareja con `contains` (`:1913`) y la aplicación con
 *      `starts_with` (msmonsterserver.cpp:2276). Un daño `holy_fire` contra un
 *      `takedmg fire 0.5` se ANUNCIA resistente y no se aplica: en el mod, el
 *      mensaje puede mentir.
 *   3. El informe para en la primera coincidencia (`break`, `:1917`) y la
 *      aplicación recorre la lista entera. Con dos entradas que casen, se
 *      enseña la primera y el daño llevó las dos.
 *
 * Medido por la sesión `-e0`, con sus líneas. Mientras no haya `takedmg`, aquí
 * entra siempre `1` y sale el espacio, que es lo que el mod manda cuando no hay
 * resistencia — o sea el caso correcto y completo, no un valor de reposo.
 */
export function corcheteDeResistencia(modificador) {
  const m = Number(modificador);
  if (!Number.isFinite(m) || m === 1) return ENGRISH;
  if (m < 1) return `[${Math.trunc((1 - m) * 100)}% resistant]`;
  return `[${Math.trunc((m - 1) * 100)}% vulnerable]`;
}

/**
 * Le pegas a algo: `"Hit %s: %s %s"`, y con crítico
 * `"Hit %s: %s %s CRIT! (%i/%i)"` (giattack.cpp:1954 y :1952).
 *
 * El nombre es `pTarget->DisplayName()`. Los dos números del crítico son
 * `iAccuracyRoll` y `(int)Damage.flCritThreshold`, en ese orden.
 */
export function golpeAsestado({ nombre, dano, tipo, critico = false, tirada, umbral, modificador = 1 }) {
  const quien = nombre ?? "it";
  const cabeza = `Hit ${quien}: ${textoDeDano(dano, tipo)} ${corcheteDeResistencia(modificador)}`;
  if (!critico) return cabeza;
  return `${cabeza} CRIT! (${Math.trunc(Number(tirada) || 0)}/${Math.trunc(Number(umbral) || 0)})`;
}

/** Fallas: `"Missed %s."` (giattack.cpp:1965). Sin cifras: las esconde el mod. */
export function falloAsestado(nombre) {
  return `Missed ${nombre ?? "it"}.`;
}

/**
 * NO LA LLAMA NADIE TODAVÍA, Y SE DICE AQUÍ.
 *
 * `"%s parries the attack!"` (giattack.cpp:1970) es lo que dice EL MOTOR cuando
 * te paran. Este puerto saca por ahí la otra frase del juego, la del guion del
 * bicho —`Your attack was PARRY_TYPE`,
 * `monsters/base_monster_shared.script:474`—, que es la que lleva el «dodged!»
 * de las arañas y la que ya estaba portada. En el juego salen las dos; aquí
 * sale una, y ésta queda escrita con su cita para cuando se porte el camino del
 * motor.
 *
 * Va declarado porque una función que nadie llama es el mismo sitio que un
 * `=> {}` de relleno: un hueco donde una regla puede vivir sin correr (el 66 y
 * el 81). Está declarada y no contada entre lo que funciona.
 */
export function paradaDelObjetivo(nombre) {
  return `${nombre ?? "It"} parries the attack!`;
}

/**
 * Te pegan: `"%s hits you: %s %s"` (giattack.cpp:1994). El nombre es
 * `SPEECH::NPCName(pMonster, true)`.
 */
export function golpeRecibido({ nombre, dano, tipo, modificador = 1 }) {
  return `${nombre ?? "It"} hits you: ${textoDeDano(dano, tipo)} ${corcheteDeResistencia(modificador)}`;
}

/**
 * Te fallan: `"%s misses you."` (giattack.cpp:2000).
 *
 * TAMPOCO LA LLAMA NADIE TODAVÍA, y el motivo no es el texto: **el suceso no
 * llega**. `Manada` emite un `falla` cuando un bicho te tira y no acierta
 * (`src/play/manada.js:1265`), y de ahí no sale: `src/red/partida.js` no lo
 * reenvía y `src/main.js` no tiene un `case "falla"`. Así que portar esta frase
 * es la mitad fácil; la otra es un suceso que viaje, con su sonda delante.
 *
 * Declarada y no contada, por lo mismo que `paradaDelObjetivo`.
 */
export function falloRecibido(nombre) {
  return `${nombre ?? "It"} misses you.`;
}

/**
 * Lo paras tú: `You parry the attack! ( PARRY_ROLL vs. ACCU_ROLL )`
 * (`player/player_main.script:324`).
 *
 * Esto lo dice el GUION DEL JUGADOR y lo porta el 65, así que el camino normal
 * es `guionJugador.llamar("game_parry", …)` y no esta función. Está aquí para
 * el caso en que no haya guion horneado, que antes se quedaba con «You parried
 * the blow!» —la frase que el 65 descubrió que era nuestra— por no quedarse
 * mudo. Mismo texto y mismas dos tiradas: lo que cambia es quién lo arma.
 */
export function parryDelJugador(parry, acc) {
  return `You parry the attack! ( ${Math.round(Number(parry) || 0)} vs. ${Math.round(Number(acc) || 0)} )`;
}
