// EL MENÚ DEL PROPIO JUGADOR — experimento 85.
//
// Lo que se prueba aquí es la REGLA: qué hacen las seis opciones. Lo que no se
// puede probar sin navegador —que el panel llegue a llamarlas, que la vista baje
// de verdad, que el muñeco se siente— lo mide `npm run sonda:menujugador85`.
//
// Los números NO se calculan de la fórmula que se está probando: van escritos a
// mano con su línea del `.script`, que es lo que manda el 75 cuando el número ES
// la regla. Si algún día el mod los cambia, estas pruebas se ponen rojas, que es
// justo lo que tienen que hacer.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EFECTOS, DESCANSO, CANDADOS, MENSAJES, NO_PUEDES,
  vueltaDeVida, vueltaDeMana, cicloDeDescanso, vistaDeDescanso,
  descripcionDeObjeto, perdonar, Emociones,
} from "../src/play/menujugador.js";
import { opcionesDelJugador } from "../src/play/opciones.js";
import { InteraccionesNpc } from "../src/juego/interacciones.js";

/** Los números del `.script`, escritos a mano. `player/emote_sit&stand.script`. */
const CICLO = 5;             // repeatdelay 5                            :81
const VIDA_PARTE = 0.05;     // setvard REGEN_RATE 0.05                   :94
const VIDA_MIN = 2;          // if ( REGEN_INT < 2 ) setvard REGEN_INT 2  :97
const MANA_PARTE = 0.20;     // setvard MANA_RATE 0.20                    :114
const MANA_MIN = 4;          // if ( MANA_INT < 4 ) setvard MANA_INT 4    :117
const GOLPE = 5;             // setvard STRUCK_TIME 5                     :141
const VISTA = -28;           // const VIEW_LOWERHEIGHT -28                :171
const VISTA_SEG = 1;         // const VIEW_LOWERTIME 1                    :26

test("los números de descansar son los del guion del mod, no los que salgan", () => {
  assert.equal(DESCANSO.CICLO, CICLO);
  assert.equal(DESCANSO.VIDA_PROPORCION, VIDA_PARTE);
  assert.equal(DESCANSO.VIDA_MINIMO, VIDA_MIN);
  assert.equal(DESCANSO.MANA_PROPORCION, MANA_PARTE);
  assert.equal(DESCANSO.MANA_MINIMO, MANA_MIN);
  assert.equal(DESCANSO.GOLPE, GOLPE);
  assert.equal(DESCANSO.VISTA, VISTA);
  assert.equal(DESCANSO.VISTA_SEGUNDOS, VISTA_SEG);
});

// ── EL ACUMULADOR, que es lo que hace que descansar acelere ────────────────

test("una vuelta da la parte de la vida máxima, truncada", () => {
  // 0,05 × 240 = 12. `$int` trunca.
  assert.equal(vueltaDeVida(0, 240).da, 12);
  // 0,05 × 249 = 12,45 -> 12, y no 13.
  assert.equal(vueltaDeVida(0, 249).da, 12);
});

test("y nunca menos de 2 de vida ni de 4 de maná, por pequeño que sea el máximo", () => {
  assert.equal(vueltaDeVida(0, 10).da, VIDA_MIN);      // 0,05 × 10 = 0,5 -> 2
  assert.equal(vueltaDeMana(0, 10).da, MANA_MIN);      // 0,20 × 10 = 2   -> 4
});

test("EL ACUMULADOR SE SUMA: cuatro vueltas sentado dan 6, 11, 16 y 21, no 5 cada una", () => {
  // `add regen.hp.amt REGEN_INT` / `givehp ent_me regen.hp.amt` (:98-99).
  // Con 100 de vida máxima el paso es 5, y el acumulador arranca en 1 porque es
  // lo que deja estar de pie (`else setvard regen.hp.amt 1`, :109).
  let a = 1;
  const dados = [];
  for (let i = 0; i < 4; i++) { const r = vueltaDeVida(a, 100); a = r.acumulado; dados.push(r.da); }
  assert.deepEqual(dados, [6, 11, 16, 21]);
});

test("la primera vuelta da 3 de vida y 5 de maná con un personaje pequeño, que es lo que dice la cabecera del mod", () => {
  // «Raising sit mana regen to 5, and sit health regen to 3 (total)»: son los
  // totales de la PRIMERA vuelta, con el 1 que deja estar de pie incluido.
  assert.equal(vueltaDeVida(1, 10).da, 1 + VIDA_MIN);
  assert.equal(vueltaDeMana(1, 10).da, 1 + MANA_MIN);
});

// ── EL CONTADOR DE GOLPES ──────────────────────────────────────────────────

test("sin haber recibido un golpe, cada vuelta regenera", () => {
  assert.equal(cicloDeDescanso(0).regenera, true);
});

test("tras un golpe se pierden TRES vueltas y la cuarta ya cura — y el mod dice cinco", () => {
  // `subtract` va antes del `<= 1` (:83-87), así que: 5->4, 4->3, 3->2 sin
  // curar, y 2->1 cura. El comentario del mod dice «5 cycles» y la aritmética
  // da tres: 15 segundos de castigo y la cura vuelve a los 20, no a los 25.
  let g = GOLPE;
  const quienes = [];
  for (let i = 0; i < 5; i++) { const c = cicloDeDescanso(g); g = c.golpe; quienes.push(c.regenera); }
  assert.deepEqual(quienes, [false, false, false, true, true]);
});

test("CONTROL: con el castigo a 1 la vuelta siguiente ya cura, que es el borde", () => {
  assert.equal(cicloDeDescanso(1).regenera, true);
  assert.equal(cicloDeDescanso(2).regenera, true);   // 2 -> 1, y 1 <= 1
  assert.equal(cicloDeDescanso(3).regenera, false);  // 3 -> 2, y 2 > 1
});

// ── LA VISTA ───────────────────────────────────────────────────────────────

test("la vista baja 28 unidades en un segundo, lineal", () => {
  assert.equal(vistaDeDescanso(0, true), 0);
  assert.equal(vistaDeDescanso(0.5, true), VISTA / 2);
  assert.equal(vistaDeDescanso(1, true), VISTA);
});

test("y al levantarse es la MISMA rampa del revés, no un corte", () => {
  // `setvard L_HEIGHTOFS 1 ; decvar L_HEIGHTOFS L_RATIO_OLD` (:190-192).
  assert.equal(vistaDeDescanso(0, false), VISTA);
  assert.equal(vistaDeDescanso(0.5, false), VISTA / 2);
  assert.equal(vistaDeDescanso(1, false), 0);
});

test("CONTROL: pasado el segundo no sigue bajando — `capvar L_RATIO 0 1`", () => {
  assert.equal(vistaDeDescanso(10, true), VISTA);
  assert.equal(vistaDeDescanso(10, false), 0);
});

// ── LAS CUATRO OPCIONES DE CALLBACK ────────────────────────────────────────

test("los cuatro efectos son los cuatro `data` del guion del menú", () => {
  // player_sv_menu.script:29, :37, :43, :50.
  assert.deepEqual(Object.keys(EFECTOS).sort(),
    ["player_nodno", "player_nodyes", "player_sitstand", "player_standidle"]);
});

test("sentarse pone `sitdown` en modo `hold` y asentir `nod_yes` en modo `once`", () => {
  assert.deepEqual(
    [EFECTOS.player_sitstand.anim, EFECTOS.player_sitstand.modo], ["sitdown", "hold"]);
  assert.deepEqual(
    [EFECTOS.player_nodyes.anim, EFECTOS.player_nodyes.modo], ["nod_yes", "once"]);
});

// ── EL MENÚ ENCOGE AL SENTARSE ─────────────────────────────────────────────

test("de pie el menú tiene seis opciones y sentado tres", () => {
  assert.equal(opcionesDelJugador(null, { sentado: false }).length, 6);
  assert.equal(opcionesDelJugador(null, { sentado: true }).length, 3);
});

test("y la primera cambia de nombre: «Sit Down (Rest)» / «Stand Up»", () => {
  assert.equal(opcionesDelJugador(null, { sentado: false })[0].titulo, "Sit Down (Rest)");
  assert.equal(opcionesDelJugador(null, { sentado: true })[0].titulo, "Stand Up");
});

test("CONTROL DEL 62: sin `estado` el menú sale de pie, que es el valor de reposo", () => {
  // Esto es lo que pasaba en TODAS las partidas hasta el 85: nadie pasaba el
  // estado, así que la rama de sentado no se ejecutaba nunca. La prueba fija que
  // el valor de reposo existe y es ése, para que se vea que el control de arriba
  // mide algo distinto de él.
  assert.equal(opcionesDelJugador(null)[0].titulo, "Sit Down (Rest)");
  assert.equal(opcionesDelJugador(null).length, 6);
});

// ── EL ESTADO ──────────────────────────────────────────────────────────────

/** Un jugador de prueba con sus máximos, y la cuenta de lo que le llega. */
function unJugador({ vidaMax = 100, manaMax = 50, puedeAtacar = true, mostrarVida = false } = {}) {
  const p = { vida: 10, mana: 5 };
  const dado = { vida: 0, mana: 0, aguante: 0 };
  const dicho = [];
  const e = new Emociones({
    vitales: () => ({ vida: p.vida, vidaMax, mana: p.mana, manaMax }),
    dar: (que, cuanto) => {
      dado[que] += cuanto;
      if (que === "vida") p.vida = Math.min(vidaMax, p.vida + cuanto);
      else p.mana = Math.min(manaMax, p.mana + cuanto);
    },
    aguante: (cuanto) => { dado.aguante += cuanto; },
    suceso: (tipo, texto) => dicho.push({ tipo, texto }),
    puedeAtacar: () => puedeAtacar,
    mostrarVida: () => mostrarVida,
  });
  return { e, p, dado, dicho };
}

test("sentarse y levantarse alternan con la misma opción", () => {
  const { e } = unJugador();
  assert.equal(e.sentado, false);
  assert.equal(e.activar("player_sitstand").sentado, true);
  assert.equal(e.sentado, true);
  assert.equal(e.activar("player_sitstand").sentado, false);
  assert.equal(e.sentado, false);
});

test("sentarse pide la animación `sitdown`, y la orden se consume al leerla", () => {
  const { e } = unJugador();
  e.activar("player_sitstand");
  assert.deepEqual(e.animacion(), { nombre: "sitdown", modo: "hold" });
  // `playanim` es una orden, no un estado: leerla dos veces no la repite.
  assert.equal(e.animacion(), null);
});

test("no se puede sentar si no se puede atacar, y lo dice con la frase del mod", () => {
  const { e, dicho } = unJugador({ puedeAtacar: false });
  const r = e.activar("player_sitstand");
  assert.equal(r.hecho, false);
  assert.equal(e.sentado, false);
  assert.deepEqual(dicho, [{ tipo: "nopuedes", texto: NO_PUEDES }]);
});

test("CONTROL: esa guarda es SÓLO de sentarse — los emotes no la tienen", () => {
  // La comprobación de `canattack` está en el `game_player_activate` de
  // `emote_sit&stand` (:47) y en ninguno de los otros tres.
  const { e } = unJugador({ puedeAtacar: false });
  assert.equal(e.activar("player_nodyes").hecho, true);
  assert.equal(e.emocion, "player_nodyes");
});

test("sentado, los cinco candados cierran; de pie, ninguno", () => {
  const { e } = unJugador();
  for (const c of CANDADOS) assert.equal(e.puede(c), true, `de pie debería poder ${c}`);
  e.activar("player_sitstand");
  for (const c of CANDADOS) assert.equal(e.puede(c), false, `sentado NO debería poder ${c}`);
  // Y lo que no es un candado sigue abierto, que es lo que separa «me han
  // quitado cinco cosas» de «me han quitado todo».
  assert.equal(e.puede("hablar"), true);
});

test("sentarse cancela el emote que hubiera — `callexternal ent_me emote_stop`", () => {
  const { e } = unJugador();
  e.activar("player_standidle");
  assert.equal(e.emocion, "player_standidle");
  e.activar("player_sitstand");
  assert.equal(e.emocion, null);
});

test("EL FALLO DEL MOD: «Stand At Attention» alterna y «Nod Yes» NO", () => {
  // Los tres emotes tienen el mismo `if ( !local.idling ) … else idle_stop`, y
  // sólo `emote_idle` pone `local.idling 1`. Los otros dos ponen `local.noding`,
  // que nadie lee, así que su rama `else` está muerta: volver a pulsar repite.
  const { e } = unJugador();
  e.activar("player_standidle");
  assert.equal(e.activar("player_standidle").emocion, null, "attention sí alterna");

  e.activar("player_nodyes");
  assert.equal(e.activar("player_nodyes").emocion, "player_nodyes", "nod_yes NO alterna");
  assert.deepEqual(e.animacion(), { nombre: "nod_yes", modo: "once" }, "la repite");
});

test("un emote se cancela al moverse, y sentarse no", () => {
  // `game_animate` + `if game.player.speed` (emote_yes.script:37-43). El guion
  // de sentarse no tiene `game_animate`.
  const { e } = unJugador();
  e.activar("player_nodyes");
  assert.equal(e.seMueve(120), true);
  assert.equal(e.emocion, null);

  e.activar("player_sitstand");
  assert.equal(e.seMueve(120), false, "sentarse no se cancela por moverse");
  assert.equal(e.sentado, true);
});

test("sentado y asintiendo cuentas como `IsActing()`, y de pie quieto no", () => {
  // `const EFFECT_FLAGS player_action` en los cuatro efectos, y la bandera sirve
  // para que el aguante NO se regenere solo (fatigue.cpp:77-79). Sin esta regla
  // el `drainstamina -1000` del guion no se puede medir: el aguante volvería
  // igual con el comando y sin él — el 66, «cuando dos cosas mueven el mismo
  // número, «se movió» no dice cuál».
  const { e } = unJugador();
  assert.equal(e.actuando(), false);
  e.activar("player_nodyes");
  assert.equal(e.actuando(), true, "un emote también es una acción");
  e.seMueve(100);
  assert.equal(e.actuando(), false);
  e.activar("player_sitstand");
  assert.equal(e.actuando(), true);
});

test("la postura se sostiene si es `hold` y no si es `once`", () => {
  // Sin esto el bucle de dibujo pisa la pose cada fotograma y sentarse dura uno.
  const { e } = unJugador();
  assert.equal(e.postura(), null);
  e.activar("player_sitstand");
  assert.equal(e.postura(), "sitdown");
  e.activar("player_sitstand");
  assert.equal(e.postura(), null);
  e.activar("player_standidle");
  assert.equal(e.postura(), "attention", "`hold` se sostiene");
  e.activar("player_nodyes");
  assert.equal(e.postura(), null, "`once` vuelve al reposo sola");
  assert.equal(e.emocion, "player_nodyes", "pero el efecto sigue puesto");
});

test("CONTROL: quieto no se cancela nada", () => {
  const { e } = unJugador();
  e.activar("player_nodyes");
  assert.equal(e.seMueve(0), false);
  assert.equal(e.emocion, "player_nodyes");
});

// ── EL CICLO DE VERDAD, con el reloj ──────────────────────────────────────

test("el ciclo tarda cinco segundos en dar la primera vuelta, no cero", () => {
  const { e } = unJugador();
  assert.equal(e.paso(4.9), 0);
  assert.equal(e.paso(0.2), 1);
});

test("sentado, cada vuelta da vida, maná y aguante", () => {
  const { e, dado } = unJugador({ vidaMax: 100, manaMax: 50 });
  e.activar("player_sitstand");
  e.paso(CICLO);
  // vida: acumulador 1 + 5 = 6. maná: 1 + 10 = 11. aguante: 1000.
  assert.equal(dado.vida, 6);
  assert.equal(dado.mana, 11);
  assert.equal(dado.aguante, DESCANSO.AGUANTE);
});

test("CONTROL POSITIVO: de pie el mismo ciclo no da NADA", () => {
  // Sin esto, «sentado cura» podría ser «el ciclo cura siempre».
  const { e, dado } = unJugador();
  e.paso(CICLO * 4);
  assert.deepEqual(dado, { vida: 0, mana: 0, aguante: 0 });
});

test("y de pie el acumulador se queda en 1, así que sentarse empieza por 6", () => {
  const { e, dado } = unJugador({ vidaMax: 100 });
  e.paso(CICLO * 10);             // diez vueltas de pie
  e.activar("player_sitstand");
  e.paso(CICLO);
  assert.equal(dado.vida, 6, "no 51: estar de pie no acumula");
});

test("un golpe mientras descansas corta tres vueltas y reinicia la rampa de la vida", () => {
  const { e, dado } = unJugador({ vidaMax: 100, manaMax: 50 });
  e.activar("player_sitstand");
  e.paso(CICLO);                   // vida 6, maná 11
  assert.equal(dado.vida, 6);
  e.golpeado();
  e.paso(CICLO * 3);               // las tres vueltas del castigo
  assert.equal(dado.vida, 6, "nada durante el castigo");
  e.paso(CICLO);                   // la cuarta ya cura
  // La vida reinició su acumulador a 0, así que da 0+5 = 5.
  assert.equal(dado.vida, 6 + 5);
  // Y el maná NO lo reinició: sigue en 11 y da 11+10 = 21. Asimetría del mod.
  assert.equal(dado.mana, 11 + 21);
});

test("un paso enorme da todas las vueltas que tocan, no una", () => {
  // Una pestaña en segundo plano no debe regalar ni comerse tiempo de descanso.
  const { e } = unJugador();
  e.activar("player_sitstand");
  assert.equal(e.paso(CICLO * 4), 4);
});

test("morir te levanta y devuelve la vista — `game_death`", () => {
  const { e } = unJugador();
  e.activar("player_sitstand");
  e.paso(VISTA_SEG);
  assert.equal(e.vistaZ(), VISTA);
  e.muere();
  assert.equal(e.sentado, false);
  assert.equal(e.vistaZ(), 0, "la vista vuelve de golpe, no por la rampa");
});

// ── LOS MENSAJES, y el `if` viejo que se los lleva ────────────────────────

test("por omisión descansar NO escribe nada: `SHOW_HEALTH` está apagado", () => {
  const { e, dicho } = unJugador({ mostrarVida: false });
  e.activar("player_sitstand");
  e.paso(CICLO * 3);
  assert.deepEqual(dicho, [], "el `if SHOWIT_ON` sin paréntesis corta su bloque");
});

test("CONTROL: con `showhealth` encendido sí escribe, y eso demuestra que cura igual", () => {
  // Éste es el control que separa «no cura» de «cura y no lo dice». Sin él,
  // «no sale ningún mensaje» sería compatible con que el ciclo no corra.
  const { e, dicho, dado } = unJugador({ mostrarVida: true, vidaMax: 100, manaMax: 50 });
  e.activar("player_sitstand");
  e.paso(CICLO);
  assert.equal(dado.vida > 0, true);
  assert.equal(dicho.length, 1);
  assert.match(dicho[0].texto, /^Resting\.\.\. HP: \( \d+ \/ 100 \) MANA: \( \d+ \/ 50 \)$/);
});

test("al tope dice «You are fully rested.» y pone MAX en vez del número", () => {
  assert.equal(MENSAJES.descansando(100, 100, 50, 50),
    "Resting... HP: ( MAX / 100 ) MANA: ( MAX / 50 )");
  const { e, dicho } = unJugador({ mostrarVida: true, vidaMax: 12, manaMax: 8 });
  e.activar("player_sitstand");
  // Dos vueltas: la primera llena (y aún dice «Resting», porque `FULL_ALERT` se
  // evalúa con los valores de después pero empieza a contar en esa vuelta), la
  // segunda ya anuncia el lleno.
  e.paso(CICLO * 2);
  assert.equal(dicho.at(-1).texto, MENSAJES.LLENO);
});

// ── `itemdesc` ────────────────────────────────────────────────────────────

test("la descripción es la del objeto en la mano", () => {
  assert.equal(descripcionDeObjeto({ descripcion: "A rusty sword." }), "A rusty sword.");
});

test("sin nada en la mano no sale NADA, y eso es `null` y no un texto", () => {
  // `if (!pItem) return;` — clplayer.cpp:709-710.
  assert.equal(descripcionDeObjeto(null), null);
});

test("un objeto sin descripción dice «No Description», que es del motor", () => {
  assert.equal(descripcionDeObjeto({ descripcion: "" }), "No Description");
});

test("y un apilable con más de uno lleva la cantidad entre paréntesis", () => {
  assert.equal(descripcionDeObjeto({ descripcion: "Arrow.", apilable: true, cantidad: 12 }), "Arrow. (12)");
  // `iQuantity > 1`: con uno solo, no.
  assert.equal(descripcionDeObjeto({ descripcion: "Arrow.", apilable: true, cantidad: 1 }), "Arrow.");
  // Y si no es apilable, tampoco, por muchos que haya.
  assert.equal(descripcionDeObjeto({ descripcion: "Sword.", apilable: false, cantidad: 12 }), "Sword.");
});

// ── `forgive` ─────────────────────────────────────────────────────────────

test("perdonar sin nadie que te haya matado contesta la línea del original", () => {
  const r = perdonar(null);
  assert.equal(r.hecho, false);
  assert.match(r.texto, /^Forgive: Use this command to remove your accidental death/);
});

test("y con un asesino se declara pendiente en vez de inventarse la rama", () => {
  const r = perdonar({ nombre: "Otro" });
  assert.equal(r.hecho, false);
  assert.equal(typeof r.pendiente, "string");
});

// ── LA COSTURA, que es por donde entra el juego ───────────────────────────
//
// Estas pruebas entran por `InteraccionesNpc`, que es por donde entra el panel.
// Construir el objeto de la opción a mano aquí sería el 59: lo que falló es
// precisamente el reparto, así que el reparto tiene que correr.

/** Lo mínimo para que `InteraccionesNpc` arranque, sin mundo ni bichos. */
function unasInteracciones({ emociones = null, enLaMano = null } = {}) {
  const dicho = [];
  const i = new InteraccionesNpc({
    sesion: { personaje: { nombre: "Sonda", vida: 10, mana: 5, inventario: [], manos: {} } },
    npcPorId: () => null,
    suceso: (tipo, texto) => dicho.push({ tipo, texto }),
    emociones, enLaMano,
  });
  return { i, dicho };
}

test("pedir sin nadie delante devuelve TU menú, con tu nombre", async () => {
  const { i } = unasInteracciones();
  const r = await i.pedir(null);
  assert.equal(r.nombre, "You");
  assert.equal(r.opciones.length, 6);
});

test("EL FALLO DEL 85: elegir en tu propio menú ya NO dice «not implemented»", async () => {
  const { e } = unJugador();
  const { i, dicho } = unasInteracciones({ emociones: e });
  await i.pedir(null);
  const r = i.elegidoDelJugador(0);
  assert.equal(r.hecho, true);
  assert.equal(e.sentado, true, "la opción 0 de pie es «Sit Down (Rest)»");
  assert.equal(dicho.length, 0, "y no se queja de nada");
});

test("y entra por `elegido(null, 0)`, que es por donde entra el panel", async () => {
  // El control anterior llama al método nuevo; éste entra por el reparto, que es
  // el que tenía el fallo. Si alguien quita la rama de `id === null` de
  // `elegido`, este control se pone rojo y el de arriba no.
  const { e } = unJugador();
  const { i, dicho } = unasInteracciones({ emociones: e });
  await i.pedir(null);
  i.elegido(null, 0);
  assert.equal(e.sentado, true);
  assert.deepEqual(dicho, []);
});

test("el menú que vuelve es el que se mandó: sentado, la opción 0 te LEVANTA", async () => {
  const { e } = unJugador();
  const { i } = unasInteracciones({ emociones: e });
  await i.pedir(null);
  i.elegido(null, 0);                 // se sienta
  assert.equal(e.sentado, true);
  await i.pedir(null);                // el menú vuelve a abrirse: ahora son 3
  assert.equal(i.menuDelJugador.length, 3);
  i.elegido(null, 0);                 // y la 0 es «Stand Up»
  assert.equal(e.sentado, false);
});

test("sentado, el índice 3 ya no existe y se dice distinto de «no implementado»", async () => {
  const { e } = unJugador();
  const { i, dicho } = unasInteracciones({ emociones: e });
  await i.pedir(null);
  i.elegido(null, 0);
  await i.pedir(null);
  const r = i.elegido(null, 3);
  assert.equal(r.hecho, false);
  assert.match(dicho.at(-1).texto, /no longer available/);
});

test("«Item Desc» escribe la descripción de lo que lleva en la mano", async () => {
  const { i, dicho } = unasInteracciones({
    emociones: new Emociones({}),
    enLaMano: () => ({ descripcion: "A rusty short sword." }),
  });
  await i.pedir(null);
  const idx = i.menuDelJugador.findIndex((o) => o.tipo === "itemdesc");
  const r = i.elegido(null, idx);
  assert.equal(r.hecho, true);
  assert.equal(dicho.at(-1).texto, "A rusty short sword.");
});

test("«Forgive Last PK» contesta lo que contesta el original con un solo jugador", async () => {
  const { i, dicho } = unasInteracciones({ emociones: new Emociones({}) });
  await i.pedir(null);
  const idx = i.menuDelJugador.findIndex((o) => o.tipo === "forgive");
  i.elegido(null, idx);
  assert.match(dicho.at(-1).texto, /^Forgive: Use this command/);
});

test("SIN el estado de emociones NO se finge: se dice que no está cableado", async () => {
  // Un `?.()` callado aquí sería el `=> {}` del 66 en el sitio del fallo.
  const { i, dicho } = unasInteracciones({ emociones: null });
  await i.pedir(null);
  const r = i.elegido(null, 0);
  assert.equal(r.hecho, false);
  assert.match(dicho.at(-1).texto, /no emote state is wired/);
});

test("CONTROL: un NPC sin guion sigue diciendo lo suyo, que es otro caso", () => {
  // El mensaje «este NPC no tiene guion portado» era correcto; lo que estaba mal
  // es que también salía para el menú propio. Esta prueba fija que sigue ahí.
  const { i, dicho } = unasInteracciones({ emociones: new Emociones({}) });
  i.npcPorId = () => ({ ficha: { nombre: "Alguien", script: "no/existe" } });
  i.elegido(7, 0);
  assert.match(dicho.at(-1).texto, /this NPC has no ported script/);
});
