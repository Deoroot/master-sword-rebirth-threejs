// UN OBJETO ES UNA ENTIDAD CON GUION, Y ES LO QUE LE AFECTA AL JUGADOR — el 66.
//
// El 64 montó el guion del jugador; el 65 vio que lo que faltaba era llamar.
// Esto es la otra mitad: **casi todo lo que le pasa al jugador se lo hace un
// objeto que lleva encima**, y la interfaz es una sola línea:
//
//     { game_deploy   callexternal ent_owner bloodstone_toggle 1 }
//                                    items/item_ring_percept.script:33-36
//
// `llamarExterno` era un **no-op en todo el proyecto** —en el entorno de los NPC
// y en el del jugador—, así que ningún objeto había encendido nunca nada. El
// guion del jugador tiene 63 eventos que sólo puede llamar un objeto y 23
// corren enteros; se llamaba a cero.
//
// Y el caso con nombre lo trajo el usuario de memoria: el hechizo de rejuvenecer
// curaba deprisa por llevarlo encima. Está escrito y arranca solo.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  GuionesDeObjeto, GuionDeObjeto, EVENTOS_DEL_OBJETO, QUIEN_VISTE,
} from "../src/play/guionobjeto.js";
import { habilidadDeGuion, TOPE_HABILIDAD, TOPE_PROPIEDAD } from "../src/play/habilidad.js";
import { GuionDelJugador, EVENTOS_DEL_JUGADOR } from "../src/play/guionjugador.js";

const leer = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const fichaObjetos = leer("build/msr/objetosguion.json");
const fichaJugador = leer("build/msr/jugador.json");
const hay = Boolean(fichaObjetos && fichaJugador);

// ── 1. LA TABLA, QUE SE GUARDA COMPARTIDA ───────────────────────────────────

describe("los guiones de objeto horneados (66)", () => {
  test("hay horneada: si no, todo lo de abajo se salta", { skip: !hay }, () => {
    assert.ok(Object.keys(fichaObjetos.objetos).length > 100);
    assert.ok(Object.keys(fichaObjetos.archivos).length > 100);
  });

  test("se guardan los ARCHIVOS una vez, no el guion de cada objeto", { skip: !hay }, () => {
    // Resuelto son 7,5 MB y compartido 0,7: los objetos comparten sus
    // plantillas casi enteras. Y es lo que hace el motor, que cachea los
    // scripts y los recorre por entidad.
    const archivos = Object.keys(fichaObjetos.archivos).length;
    const objetos = Object.keys(fichaObjetos.objetos).length;
    let sumaDeArchivos = 0;
    for (const o of Object.values(fichaObjetos.objetos)) sumaDeArchivos += o.archivos.length;
    assert.ok(sumaDeArchivos > archivos * 2,
      `si no se comparten, guardarlos por objeto no ahorra nada (${sumaDeArchivos} vs ${archivos})`);
    assert.ok(archivos < objetos * 2);
  });

  test("y se dice qué se descartó, que un filtro callado esconde un pueblo", { skip: !hay }, () => {
    // La lección del 63 con la familia `msnpc_`. Un `addstoreitem` puede llevar
    // una variable en vez de un nombre y eso no se puede resolver sin tienda.
    assert.ok(Array.isArray(fichaObjetos.descartados.variables));
    assert.ok(Array.isArray(fichaObjetos.descartados.sinFicha));
    assert.ok(fichaObjetos.criterio.length > 20, "sin criterio escrito el conjunto parece arbitrario");
  });

  test("los `#include` se resuelven en su sitio también en el navegador", { skip: !hay }, () => {
    // Es el mismo `resolverGuion` que usa el extractor, con la tabla en vez del
    // disco. Si fueran dos copias, una podría arreglarse y la otra no — que es
    // lo que el 65 aprendió con la cámara.
    const g = new GuionesDeObjeto(fichaObjetos);
    const r = g.resolver("swords_rsword");
    assert.ok(r && r.eventos.length > 40);
    // Su daño es el SUYO, no el de `swords_base_onehanded`.
    let dano = null;
    for (const e of r.eventos) {
      if (e.nombre) continue;
      for (const c of e.cmds) if (dano === null && c.nombre === "const" && c.params[0] === "MELEE_DMG") dano = c.params[1];
    }
    assert.equal(dano, "90");
  });

  test("un objeto que no está horneado da `null` y no revienta", { skip: !hay }, () => {
    const g = new GuionesDeObjeto(fichaObjetos);
    assert.equal(g.resolver("no_existe_este_objeto"), null);
    assert.equal(g.tiene("no_existe_este_objeto"), false);
  });
});

// ── 2. EL OBJETO HABLÁNDOLE AL JUGADOR ──────────────────────────────────────

function montar({ divinacion = 60, vida = 50, vidaMax = 100 } = {}) {
  const dicho = [];
  // Las habilidades con la forma del juego: `habilidades[escuela][propiedad]`
  // es `{valor, exp}` (`habilidadesDePartida`, src/juego/stats.js:136). Con una
  // forma inventada la prueba mediría su propio mapa y no el del personaje —la
  // variante del 59.
  const personaje = {
    nombre: "Ana", vida, vidaMax, mana: 20, manaMax: 20,
    habilidades: {
      spellcasting: {
        fire: { valor: 1, exp: 0 }, ice: { valor: 1, exp: 0 },
        lightning: { valor: 1, exp: 0 }, divination: { valor: divinacion, exp: 0 },
        affliction: { valor: 1, exp: 0 },
      },
    },
  };
  let t = 10;   // el reloj no empieza en cero: ver la prueba del 65
  const jugador = new GuionDelJugador({
    ficha: fichaJugador, personaje,
    suceso: (tipo, texto) => dicho.push({ tipo, texto }),
    consejo: () => {},
    dar: (que, cuanto) => {
      if (que === "vida") personaje.vida = Math.min(personaje.vidaMax, personaje.vida + cuanto);
      if (que === "mana") personaje.mana = Math.min(personaje.manaMax, personaje.mana + cuanto);
    },
    ahora: () => t,
  });
  const guiones = new GuionesDeObjeto(fichaObjetos);
  const nuevo = (id) => new GuionDeObjeto({ guiones, id, jugador, ahora: () => t, suceso: (tipo, texto) => dicho.push({ tipo, texto }) });
  return { personaje, jugador, dicho, nuevo, avanzar: (s) => { t += s; return s; }, get t() { return t; } };
}

describe("el objeto le habla al jugador (66)", () => {
  test("`callexternal ent_owner` LLEGA al guion del jugador", { skip: !hay }, () => {
    // ESTO es lo que era un no-op en todo el proyecto. El hechizo sirve de caso
    // porque su bucle le pide cosas al dueño sin que nadie lo toque; un arma no
    // vale, porque sus `callexternal` van detrás de una guarda de manos que
    // aquí no existe todavía.
    const m = montar();
    const o = m.nuevo("magic_hand_div_rejuvenate");
    assert.ok(o.hay, "el objeto no tiene guion");
    o.arrancar({ quien: QUIEN_VISTE.JUGANDO });
    for (let i = 0; i < 80; i++) { m.avanzar(0.05); o.paso(0.05); }
    assert.ok(o.pedidos.length > 0, "el objeto no le pidió NADA al jugador");
  });

  test("y el jugador CONTESTA: el hechizo le pide pintar la vida y le llega", { skip: !hay }, () => {
    // `callexternal $get(ent_owner,id) display_health` — el guion se refiere a
    // su dueño por su asa, no por el literal `ent_owner`, así que resolver
    // `$get(ent_owner,id)` es parte del camino.
    const m = montar();
    const o = m.nuevo("magic_hand_div_rejuvenate");
    o.arrancar({ quien: QUIEN_VISTE.JUGANDO });
    for (let i = 0; i < 80; i++) { m.avanzar(0.05); o.paso(0.05); }
    assert.ok(o.pedidos.some((x) => x.evento === "display_health" && x.contestado),
      `nadie contestó: ${JSON.stringify(o.pedidos.slice(0, 4))}`);
  });

  test("lo que NO va al dueño se apunta y no se inventa", { skip: !hay }, () => {
    // Un objeto le habla también al maestro de juego, a sus proyectiles y a
    // otros jugadores, y nada de eso existe aquí. Se comprueba sobre el
    // enrutado y no buscando un objeto que lo haga, porque cuál lo hace depende
    // de qué guardas se cumplan — y entonces el control mediría el objeto, no
    // la regla.
    const m = montar();
    const o = m.nuevo("magic_hand_div_rejuvenate");
    const env = o.guion.entorno;
    env.llamarExterno("game_master", "gm_find_strongest_reset", []);
    assert.ok(o.noSoportados.some((x) => x.tipo === "callexternal" && /game_master/.test(x.nombre)));
    // Y el del dueño SÍ pasa, que es el control positivo al lado.
    const antes = o.pedidos.length;
    env.llamarExterno("ent_owner", "display_health", []);
    assert.equal(o.pedidos.length, antes + 1);
  });

  test("`$get(ent_owner, skill.…)` lee la habilidad del jugador", { skip: !hay }, () => {
    const m = montar({ divinacion: 80 });
    assert.equal(habilidadDeGuion(m.personaje, "skill.spellcasting.divination"), "80");
    // Una habilidad que no existe da 0, y no un error: el motor sólo avisa por
    // consola («Player skill %s doesn't exist!»).
    assert.equal(habilidadDeGuion(m.personaje, "skill.no_existe.power"), "0");
    assert.equal(habilidadDeGuion(null, "skill.spellcasting.divination"), "0");
  });
});

// ── 3. EL CASO DEL USUARIO, DE PUNTA A PUNTA ────────────────────────────────

describe("el hechizo de rejuvenecer cura por llevarlo encima (66)", () => {
  const ID = "magic_hand_div_rejuvenate";

  test("trae DOS bucles que arrancan solos", { skip: !hay }, () => {
    // `repeatdelay` lo resuelve el cargador (script.cpp:5377-5382): el evento
    // se arma por existir y no hay quien lo llame. Son `passive_regen` (0,5 s)
    // y `enable_passive_regen_check` (1,0 s), que es el que abre la puerta.
    const f = fichaObjetos.objetos[ID];
    assert.ok(f, `${ID} no está horneado — ¿sigue la cadena pergamino → hechizo?`);
    assert.deepEqual([...f.bucles].sort(), ["enable_passive_regen_check", "passive_regen"]);
  });

  test("la vida sube sola, sin lanzarlo y sin que nadie llame a nada", { skip: !hay }, () => {
    const m = montar({ divinacion: 60, vida: 50, vidaMax: 100 });
    const o = m.nuevo(ID);
    assert.ok(o.hay);
    o.arrancar({ quien: QUIEN_VISTE.JUGANDO });
    const antes = m.personaje.vida;
    // Cuatro segundos. La puerta (`FAN_LOOP`) la abre el otro bucle en cuanto
    // pasa el tiempo de preparación, así que hay que darle margen.
    for (let i = 0; i < 80; i++) { m.avanzar(0.05); o.paso(0.05); }
    assert.ok(m.personaje.vida > antes,
      `la vida no subió: ${antes} -> ${m.personaje.vida}. El bucle no está corriendo.`);
  });

  test("y cura MÁS deprisa con más divinación: `divination × 0,1 + 4`", { skip: !hay }, () => {
    // Es la cuenta del guion (items/magic_hand_div_rejuvenate.script:172-175).
    // El control comparativo hace falta: «la vida sube» pasaría igual con una
    // cantidad fija, y entonces la habilidad no estaría llegando al objeto.
    const correr = (divinacion) => {
      const m = montar({ divinacion, vida: 10, vidaMax: 500 });
      const o = m.nuevo(ID);
      o.arrancar({ quien: QUIEN_VISTE.JUGANDO });
      for (let i = 0; i < 80; i++) { m.avanzar(0.05); o.paso(0.05); }
      return m.personaje.vida - 10;
    };
    const poca = correr(0);
    const mucha = correr(100);
    assert.ok(poca > 0, "con 0 de divinación tampoco cura: son 4 de base");
    assert.ok(mucha > poca * 2,
      `la habilidad no gradúa la curación: 0 -> ${poca}, 100 -> ${mucha}`);
  });

  test("no cura por encima del máximo", { skip: !hay }, () => {
    // `if ( MY_CUR_HEALTH < MY_MAX_HEALTH ) givehp MY_PASSIVE_RATE` — la guarda
    // es del guion, no nuestra.
    const m = montar({ divinacion: 100, vida: 100, vidaMax: 100 });
    const o = m.nuevo(ID);
    o.arrancar({ quien: QUIEN_VISTE.JUGANDO });
    for (let i = 0; i < 80; i++) { m.avanzar(0.05); o.paso(0.05); }
    assert.equal(m.personaje.vida, 100);
  });

  test("y es OTRO ORDEN DE MAGNITUD que la regeneración del jugador", { skip: !hay }, () => {
    // El jugador solo se cura 1 de vida cada ~12 s (`player_regen_hp`, el 64).
    // El hechizo, 4 o más cada medio segundo. La memoria del usuario era
    // exacta, y esta prueba es la que lo deja escrito como número.
    const m = montar({ divinacion: 60, vida: 10, vidaMax: 500 });
    const o = m.nuevo(ID);
    o.arrancar({ quien: QUIEN_VISTE.JUGANDO });
    // Doce segundos: lo que el jugador tarda en curarse UNO.
    for (let i = 0; i < 240; i++) { m.avanzar(0.05); o.paso(0.05); }
    const conHechizo = m.personaje.vida - 10;
    assert.ok(conHechizo > 20,
      `en doce segundos el hechizo curó ${conHechizo}; el jugador solo se cura 1`);
  });
});

// ── 4. EL CICLO DE VIDA, CON LOS PARÁMETROS DEL MOTOR ───────────────────────

describe("el ciclo de vida de un objeto (66)", () => {
  test("los nombres son los del motor y no los nuestros", () => {
    assert.equal(EVENTOS_DEL_OBJETO.NACE, "game_spawn");
    assert.equal(EVENTOS_DEL_OBJETO.EMPUNA, "game_deploy");
    assert.equal(EVENTOS_DEL_OBJETO.VISTE, "game_wear");
    assert.equal(EVENTOS_DEL_OBJETO.GUARDA, "game_putinpack");
    assert.equal(EVENTOS_DEL_OBJETO.SACA, "game_removefrompack");
  });

  test("`game_wear` lleva QUIÉN lo llamó, y son dos valores distintos", () => {
    // El guion lo mira para saber si se lo están poniendo desde el menú de
    // personaje o en mitad de la partida. Los dos nombres son literales del
    // mod: `playershared.cpp:1543` y `genericitem.cpp:1134`.
    assert.equal(QUIEN_VISTE.CARGA, "char_menu");
    assert.equal(QUIEN_VISTE.JUGANDO, "CGenericItem::WearItem");
    assert.notEqual(QUIEN_VISTE.CARGA, QUIEN_VISTE.JUGANDO);
  });

  test("`game_equipped` se le manda al JUGADOR, no al objeto", { skip: !hay }, () => {
    // `m_pOwner->CallScriptEvent("game_equipped", …)` antes del `game_deploy`
    // del objeto (genericitem.cpp:679-683). Es del jugador, y corre entero.
    assert.equal(EVENTOS_DEL_JUGADOR.EMPUNA, "game_equipped");
    const m = montar();
    assert.ok(m.jugador.llamar(EVENTOS_DEL_JUGADOR.EMPUNA, ["swords_rsword"]),
      "el guion del jugador no contestó a `game_equipped`");
  });

  test("arrancar un objeto sin guion no revienta y lo dice", { skip: !hay }, () => {
    const m = montar();
    const o = m.nuevo("no_existe");
    assert.equal(o.hay, false);
    assert.equal(o.arrancar(), 0);
    assert.equal(o.paso(1), 0);
  });
});
