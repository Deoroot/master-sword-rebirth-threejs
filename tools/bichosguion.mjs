// EL CENSO DE LOS GUIONES DE MONSTRUO — el experimento 91.
//
//     npm run bichos:guion
//
// Para planear mazmorras hace falta saber qué pide el guion de un monstruo al
// motor, y hoy la IA de los monstruos está portada a mano en JS: su guion no
// corre en combate. Esto mide el terreno ANTES de cablear nada, sobre los
// guiones de `monsters/` (con sus `#include` resueltos en su sitio, el 66) y,
// aparte, sobre los que de verdad aparecen en los mapas horneados
// (`build/*/bichos.json`). Lo que se mide, con las citas:
//
//   1. Los eventos que el MOTOR dispara a un monstruo. Se leen del C++ —sin
//      comentarios, que tres de ellos están comentados— y se cuentan los
//      guiones que los manejan.
//   2. Los eventos de ANIMACIÓN: el `.mdl` lleva en cada secuencia una lista
//      de eventos, y el 500 y el 600 llaman a un evento del guion por su
//      nombre (`CMSMonster::HandleAnimEvent`, msmonsterserver.cpp:1463-1497).
//      Se leen del modelo de cada bicho.
//   3. Los comandos y `$getters` que NO están en `COMANDOS`/`GETTERS` de
//      `src/play/guion.js` —leídos al ejecutarse, que otro agente los amplía—,
//      y cuántos eventos correrían enteros hoy.
//   4. Los efectos (`applyeffect`).
//   5. Los bucles que se reprograman solos (`callevent <retraso> <sí mismo>`,
//      `repeatdelay`, y ciclos de más de un evento).
//   6. Un corte por vida (`hp`), para ver qué tienen los fuertes.
//
// La regla del 02: los `.script` y los `.mdl` se quedan en `../MSC/`, lo
// extraído va a `build/msr/`, y no se mueve un byte a `public/`.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { partirGuion, COMANDOS, GETTERS, PROPIEDADES, PROPIEDADES_VACIAS, repeticionDe } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";
import { leerFichaNpc, modeloYAnimaciones } from "../src/bsp/script.js";
import { leerScript, RAIZ_POR_OMISION } from "./scriptsmsr.mjs";
import { comandosDelMod } from "./insignias.mjs";

const AQUI = join(dirname(fileURLToPath(import.meta.url)), "..");
export const RAIZ_MOD = join(AQUI, "..", "MSC", "MasterSwordRebirth-Xash3D", "src", "game");
export const RAIZ_GUIONES = join(AQUI, RAIZ_POR_OMISION);
export const RAIZ_MODELOS = join(AQUI, "..", "MSC", "assets", "msr", "models");

// ── 1. LOS EVENTOS QUE EL MOTOR DISPARA ─────────────────────────────────────

/**
 * Quita los comentarios de C++ **conservando los saltos de línea**, para que
 * el número de línea de lo que quede siga siendo el del archivo.
 *
 * Es un recorrido carácter a carácter y no dos expresiones regulares, y no por
 * gusto: la primera versión quitaba antes los `/* … *\/` y luego los `//`, y
 * `npcscript.cpp` tiene cabeceras como `//****** TAKEDMG ******`. Ahí el `/*`
 * que hay dentro del `//` abría un bloque que se comía el código hasta el
 * siguiente `*\/`, y el `game_set_takedmg` de la línea 1101 desaparecía. Lo
 * cazó `comprobarCitas`. En C++ manda el que empieza antes: un `/*` dentro de
 * un `//` no abre nada, y uno dentro de una cadena tampoco.
 */
export function sinComentariosConLineas(cpp) {
  let s = "";
  let i = 0;
  const n = cpp.length;
  while (i < n) {
    const c = cpp[i], d = cpp[i + 1];
    if (c === "/" && d === "/") { while (i < n && cpp[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(cpp[i] === "*" && cpp[i + 1] === "/")) { if (cpp[i] === "\n") s += "\n"; i++; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      s += c; i++;
      while (i < n && cpp[i] !== q && cpp[i] !== "\n") { if (cpp[i] === "\\") { s += cpp[i]; i++; } s += cpp[i] ?? ""; i++; }
      if (i < n) { s += cpp[i]; i++; }
      continue;
    }
    s += c; i++;
  }
  return s;
}

/**
 * Todas las llamadas con nombre LITERAL a un evento de guion en el C++ del mod:
 * `CallScriptEvent("x")`, `CallScriptEventTimed("x")`, `RunScriptEventByName("x")`.
 * Las de nombre calculado (`CallScriptEvent(pEvent->options)`) no tienen
 * literal y van aparte, en `EVENTOS_DE_MONSTRUO` con su cita.
 */
export function llamadasDelMotor(raiz = RAIZ_MOD) {
  if (!existsSync(raiz)) return null;
  const fuera = [];
  const andar = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) andar(p);
      else if (/\.(cpp|h)$/i.test(n)) {
        const lineas = sinComentariosConLineas(readFileSync(p, "latin1")).split("\n");
        lineas.forEach((l, i) => {
          for (const m of l.matchAll(/(?:CallScriptEvent|CallScriptEventTimed|RunScriptEventByName)\s*\(\s*"([^"]+)"/g)) {
            fuera.push({ nombre: m[1], archivo: relative(raiz, p).replace(/\\/g, "/"), linea: i + 1 });
          }
        });
      }
    }
  };
  andar(raiz);
  return fuera;
}

/**
 * Los eventos que llegan al guion de un MONSTRUO (`CMSMonster`), con su cita.
 *
 * Esta lista es a mano —hay que leer a QUIÉN se le llama, y eso no lo dice un
 * `grep`—, pero cada cita se comprueba contra `llamadasDelMotor()` al
 * ejecutarse y contra la prueba: si una línea se mueve o se comenta, se dice.
 * `dinamico` son los de nombre calculado: no hay literal que comprobar.
 */
export const EVENTOS_DE_MONSTRUO = [
  // Nacer. `CMSMonster::Spawn` llama a `CScriptedEnt::Spawn` (msmonsterserver.cpp:238).
  { nombre: "spawn", cita: "shared/ms/global.cpp:436", params: [], nota: "el viejo; justo antes de game_spawn" },
  { nombre: "game_spawn", cita: "shared/ms/global.cpp:437", params: [] },
  { nombre: "game_postspawn", cita: "server/monsters/msmonsterserver.cpp:291", params: ["título", "dmgmulti", "hpmulti", "addparams"] },
  // Sentidos y movimiento.
  { nombre: "game_touch", cita: "server/monsters/msmonsterserver.cpp:888", params: ["otro"], nota: "sólo con m_HandleTouch (setcallback touch, scriptcmds.cpp:5879)" },
  { nombre: "game_heardsound", cita: "server/monsters/msmonsterserver.cpp:936", params: ["tipo", "origen", "radio"] },
  { nombre: "game_heardtext", cita: "server/monsters/msmonsterserver.cpp:1739", params: ["texto", "hablante"] },
  { nombre: "game_reached_dest", cita: "server/monsters/msmonsterserver.cpp:1027", params: [] },
  { nombre: "game_movingto_dest", cita: "server/monsters/msmonsterserver.cpp:1051", params: ["ángulos"] },
  { nombre: "game_wander", cita: "server/monsters/msmonsterserver.cpp:1153", params: [] },
  { nombre: "game_stopmoving", cita: "server/monsters/msmonsterserver.cpp:1413", params: [] },
  // Uso y menú.
  { nombre: "game_playerused", cita: "server/monsters/msmonsterserver.cpp:1828", params: ["jugador"] },
  { nombre: "game_used", cita: "shared/ms/global.cpp:503", params: ["activador", "llamador", "tipo", "valor"], nota: "CScriptedEnt::Use, tras CMSMonster::Used (SetUse, msmonsterserver.cpp:208)" },
  { nombre: "game_menu_getoptions", cita: "server/monsters/msmonsterserver.cpp:2890", params: ["jugador"] },
  { nombre: "game_menu_cancel", cita: "server/monsters/msmonsterserver.cpp:2925", params: ["jugador"] },
  // COMBATE: recibir.
  { nombre: "game_parry", cita: "server/monsters/msmonsterserver.cpp:2245", params: ["atacante", "daño", "tipo", "tirada de parada", "tirada de acierto", "valor de parada"] },
  { nombre: "game_damaged", cita: "server/monsters/msmonsterserver.cpp:2311", params: ["atacante", "daño", "tipo", "tirada", "infligidor", "habilidad"], nota: "returndata multiplica el daño (:2313-2320)" },
  { nombre: "game_damaged_end", cita: "server/monsters/msmonsterserver.cpp:2325", params: ["atacante", "daño final"] },
  { nombre: "game_struck", cita: "server/monsters/msmonsterserver.cpp:2385", params: ["daño"] },
  { nombre: "game_set_takedmg", cita: "server/monsters/npcscript.cpp:1101", params: ["tipo", "modificador", "(adjust)"], nota: "lo dispara el comando takedmg del propio guion" },
  { nombre: "game_applyeffect", cita: "shared/ms/scriptcmds.cpp:1898", params: ["comando", "quien lo aplica", "…"], nota: "al objetivo de un applyeffect; returndata puede rechazarlo" },
  { nombre: "game_drain_death", cita: "shared/ms/scriptcmds.cpp:2976", params: ["quien drena"], nota: "drainhp que deja la vida a 0" },
  // COMBATE: dar.
  { nombre: "game_damaged_other", cita: "shared/weapons/giattack.cpp:1762", params: ["objetivo", "daño", "tipo", "dodamage_event"] },
  { nombre: "game_dodamage", cita: "shared/weapons/giattack.cpp:2045", params: ["acertó", "objetivo", "origen", "fin", "tipo", "« N damage.»"] },
  // Morir.
  { nombre: "game_predeath", cita: "server/monsters/msmonsterserver.cpp:2580", params: [] },
  { nombre: "game_death", cita: "server/monsters/msmonsterserver.cpp:2605", params: [] },
  { nombre: "game_fake_death", cita: "shared/ms/scriptcmds.cpp:5675", params: [], nota: "setalive 1 sobre sí mismo" },
  { nombre: "game_deleted", cita: "shared/ms/scriptcmds.cpp:2882", params: [], nota: "deleteme; también :2911 y hl/subs.cpp:125" },
  // Varios.
  { nombre: "game_dynamically_created", cita: "shared/ms/scriptcmds.cpp:2808", params: ["params 3.. de createnpc"] },
  { nombre: "game_scriptflag_update", cita: "shared/ms/scriptcmds.cpp:5444", params: ["…"] },
  { nombre: "game_scriptflag_expired", cita: "shared/ms/scriptcmds.cpp:5395", params: ["…"] },
  { nombre: "game_companion_added", cita: "shared/ms/scriptcmds.cpp:2661", params: [] },
  { nombre: "game_companion_removed", cita: "shared/ms/scriptcmds.cpp:2676", params: [] },
  // Los de nombre calculado.
  { nombre: "(evento de animación 500/600)", cita: "server/monsters/msmonsterserver.cpp:1485-1493", dinamico: true, params: [], nota: "pEvent->options del .mdl; ver §2" },
  { nombre: "<dodamage_event>_dodamage", cita: "shared/weapons/giattack.cpp:2058", dinamico: true, params: ["los de game_dodamage"] },
  { nombre: "(frase de catchspeech)", cita: "server/monsters/msmonsterserver.cpp:1799", dinamico: true, params: [] },
  { nombre: "<callback de menú>", cita: "server/monsters/msmonsterserver.cpp:3034", dinamico: true, params: ["jugador", "…"] },
];

/**
 * Los que PARECEN llegar a un monstruo y no llegan. Son el valor de reposo de
 * esta lista: un guion que los declare tiene un manejador que no corre nunca.
 */
export const EVENTOS_QUE_NO_LLEGAN = [
  { nombre: "game_think", cita: "server/monsters/msmonsterserver.cpp:503-545", porque: "CMSMonster::Think no llama a CScriptedEnt::Think (global.cpp:458): corre RunScriptEvents y nada más" },
  { nombre: "game_attacked", cita: "server/monsters/msmonsterserver.cpp:2145-2153", porque: "comentado: «not used by any script, save the call»" },
  { nombre: "game_stuck", cita: "server/monsters/msmonsterserver.cpp:1219-1227", porque: "comentado" },
  { nombre: "game_anim_new", cita: "server/monsters/msmonsterserver.cpp:2025-2042", porque: "comentado («Undoing - not helping»)" },
];

/** Comprueba cada cita literal de `EVENTOS_DE_MONSTRUO` contra el C++. */
export function comprobarCitas(llamadas) {
  const mal = [];
  for (const e of EVENTOS_DE_MONSTRUO) {
    if (e.dinamico) continue;
    const [archivo, linea] = e.cita.split(":");
    if (!llamadas.some((l) => l.nombre === e.nombre && l.archivo === archivo && l.linea === Number(linea))) mal.push(e);
  }
  for (const e of EVENTOS_QUE_NO_LLEGAN) {
    // Lo contrario: que NO haya una llamada viva en el rango citado.
    const [archivo, rango] = e.cita.split(":");
    const [a, b] = rango.split("-").map(Number);
    if (llamadas.some((l) => l.nombre === e.nombre && l.archivo === archivo && l.linea >= a && l.linea <= (b ?? a))) mal.push(e);
  }
  return mal;
}

// ── 2. LOS EVENTOS DE ANIMACIÓN ─────────────────────────────────────────────

/**
 * Los eventos de un `.mdl`, secuencia a secuencia.
 *
 * `mstudioseqdesc_t` lleva `numevents` y `eventindex` en los bytes 48 y 52
 * (studio.h:172-173) y cada `mstudioevent_t` son `frame`, `event`, `type` y
 * `options[64]`: 76 bytes (studio_event.h:23-26). Los de 5000 en adelante son
 * del cliente y el servidor los salta (`EVENT_CLIENT`, monsterevent.h:27;
 * animation.cpp:322).
 */
export function eventosDeModelo(buf) {
  if (buf.length < 180 || buf.toString("latin1", 0, 4) !== "IDST") return null;
  const nSec = buf.readInt32LE(164), offSec = buf.readInt32LE(168);
  const fuera = [];
  for (let i = 0; i < nSec; i++) {
    const o = offSec + i * 176;
    if (o + 176 > buf.length) break;
    const secuencia = buf.toString("latin1", o, o + 32).replace(/\0.*$/s, "");
    const n = buf.readInt32LE(o + 48), off = buf.readInt32LE(o + 52);
    for (let k = 0; k < n; k++) {
      const e = off + k * 76;
      if (e + 76 > buf.length) break;
      fuera.push({
        secuencia,
        frame: buf.readInt32LE(e),
        evento: buf.readInt32LE(e + 4),
        opciones: buf.toString("latin1", e + 12, e + 76).replace(/\0.*$/s, ""),
      });
    }
  }
  return fuera;
}

/** `CMSMonster::HandleAnimEvent`: los dos códigos que llaman al guion. */
export const EVENTOS_ANIM_QUE_LLAMAN = new Set([500, 600]);

// ── 3-5. UN GUION ───────────────────────────────────────────────────────────

const GETTER_RE = /\$[A-Za-z_][\w.]*(?=\()/g;
const PROP_RE = /\$g?get\(\s*[^,()]*,\s*([A-Za-z_][\w.]*)\s*\)/g;

/** Recorre una lista de comandos y sus hijos y ramas. */
function cadaComando(cmds, fn) {
  for (const c of cmds ?? []) {
    fn(c);
    cadaComando(c.hijos, fn);
    for (const r of c.sino ?? []) cadaComando(r, fn);
  }
}

/**
 * A qué evento llama un `callevent`/`calleventtimed`/`calleventloop`, y si
 * con retraso. Es `ScriptCmd_CallEvent` (scriptcmds.cpp:2250-2275): con más de
 * un parámetro, si el primero EMPIEZA POR DÍGITO es el retraso. En el guion el
 * retraso puede ser una variable (`callevent FREQ npcatk_hunt`); el motor la
 * resuelve antes de mirar el dígito, así que aquí: si el primero no es un
 * evento y el segundo sí, se toma como retraso por variable.
 */
export function destinoDeLlamada(c, nombres) {
  let p = c.params ?? [];
  if (c.nombre === "calleventloop") p = p.slice(1);
  if (!p.length) return null;
  if (p.length === 1) return { evento: p[0], retraso: false };
  if (/^\d/.test(p[0])) return { evento: p[1], retraso: true };
  if (nombres.has(p[0])) return { evento: p[0], retraso: false };
  if (nombres.has(p[1])) return { evento: p[1], retraso: true, porVariable: true };
  return { evento: p[0], retraso: false };
}

/**
 * Analiza un guion YA resuelto (`resolverGuion`). Devuelve lo que pide y lo
 * que de eso no está portado. `portado` lleva los conjuntos contra los que se
 * mide; por omisión, los de `src/play/guion.js` de hoy.
 */
export function analizar(g, portado = { comandos: COMANDOS, getters: GETTERS, propiedades: new Set([...PROPIEDADES, ...PROPIEDADES_VACIAS]) }, propios = null) {
  const eventos = g.eventos ?? [];
  const nombres = new Set(eventos.map((e) => e.nombre).filter(Boolean));
  const porNombre = new Map();
  for (const e of eventos) {
    const k = e.nombre || "(sin nombre)";
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(e);
  }

  // Lo que pide cada evento por sí solo.
  const propio = new Map(); // nombre -> {cmds:Set, getters:Set, props:Set, llamadas:[]}
  for (const [k, bloques] of porNombre) {
    const r = { cmds: new Set(), getters: new Set(), props: new Set(), llamadas: [] };
    for (const b of bloques) cadaComando(b.cmds, (c) => {
      r.cmds.add(c.nombre);
      for (const p of c.params ?? []) {
        for (const m of String(p).matchAll(GETTER_RE)) r.getters.add(m[0].toLowerCase());
        for (const m of String(p).matchAll(PROP_RE)) r.props.add(m[1]);
      }
      if (c.nombre === "callevent" || c.nombre === "calleventtimed" || c.nombre === "calleventloop") {
        const d = destinoDeLlamada(c, nombres);
        if (d) r.llamadas.push(d);
      }
    });
    propio.set(k, r);
  }
  const faltaDe = (r) => ({
    cmds: [...r.cmds].filter((c) => !portado.comandos.has(c)),
    getters: [...r.getters].filter((x) => !portado.getters.has(x)),
    props: [...r.props].filter((x) => !portado.propiedades.has(x)),
  });
  const vacio = (f) => !f.cmds.length && !f.getters.length && !f.props.length;

  // Entero «con su cadena»: el evento y todo lo que llama dentro del guion.
  const cadena = (k) => {
    const vistos = new Set([k]);
    const cola = [k];
    const acc = { cmds: new Set(), getters: new Set(), props: new Set() };
    while (cola.length) {
      const r = propio.get(cola.shift());
      if (!r) continue;
      r.cmds.forEach((x) => acc.cmds.add(x)); r.getters.forEach((x) => acc.getters.add(x)); r.props.forEach((x) => acc.props.add(x));
      for (const l of r.llamadas) if (!vistos.has(l.evento) && propio.has(l.evento)) { vistos.add(l.evento); cola.push(l.evento); }
    }
    return acc;
  };

  const porEvento = {};
  for (const k of porNombre.keys()) {
    const f = faltaDe(propio.get(k));
    const fc = faltaDe(cadena(k));
    porEvento[k] = {
      entero: vacio(f), enteroConCadena: vacio(fc),
      faltan: [...f.cmds, ...f.getters, ...f.props.map((p) => `$get(,${p})`)],
      faltanConCadena: [...fc.cmds, ...fc.getters, ...fc.props.map((p) => `$get(,${p})`)],
    };
  }

  // Todo lo que falta en el guion entero.
  const todo = { cmds: new Set(), getters: new Set(), props: new Set() };
  for (const r of propio.values()) { r.cmds.forEach((x) => todo.cmds.add(x)); r.getters.forEach((x) => todo.getters.add(x)); r.props.forEach((x) => todo.props.add(x)); }
  const falta = faltaDe(todo);

  // Efectos.
  const valores = new Map(); // variable -> Set de valores asignados
  for (const pre of g.preload ?? []) if (pre.nombre) (valores.get(pre.nombre) ?? valores.set(pre.nombre, new Set()).get(pre.nombre)).add(pre.valor);
  for (const e of eventos) cadaComando(e.cmds, (c) => {
    if (["const", "setvar", "setvard", "local", "setvarg"].includes(c.nombre) && c.params?.[0]) {
      (valores.get(c.params[0]) ?? valores.set(c.params[0], new Set()).get(c.params[0])).add(c.params.slice(1).join(" "));
    }
  });
  const efectosDe = (lista) => {
    const efectos = { literal: new Set(), porVariable: new Set(), sinResolver: new Set() };
    for (const e of lista) cadaComando(e.cmds, (c) => {
      if (c.nombre !== "applyeffect") return;
      const que = String(c.params?.[1] ?? "").replace(/^["']|["']$/g, "");
      if (!que) return;
      if (que.includes("/")) { efectos.literal.add(que); return; }
      // La variable se busca en TODO el guion resuelto: el valor suele estar
      // en la cabecera del bicho y el `applyeffect` en la plantilla.
      const vs = [...(valores.get(que) ?? [])].map((v) => v.replace(/^["']|["']$/g, "")).filter((v) => v.includes("/"));
      if (vs.length) vs.forEach((v) => efectos.porVariable.add(v));
      else efectos.sinResolver.add(que);
    });
    return { literal: [...efectos.literal], porVariable: [...efectos.porVariable], sinResolver: [...efectos.sinResolver] };
  };
  const efectos = efectosDe(eventos);

  // Bucles.
  const bucles = { propios: new Set(), repeatdelay: new Set(), ciclos: new Set() };
  for (const [k, r] of propio) {
    if (r.llamadas.some((l) => l.retraso && l.evento === k)) bucles.propios.add(k);
  }
  for (const e of eventos) {
    let tiene = repeticionDe(e) !== null;
    if (!tiene) cadaComando(e.cmds, (c) => { if (c.nombre === "repeatdelay") tiene = true; });
    if (tiene) bucles.repeatdelay.add(e.nombre || "(sin nombre)");
  }
  // Ciclos de más de un evento con algún tramo diferido.
  for (const k of propio.keys()) {
    if (bucles.propios.has(k)) continue;
    const vistos = new Set();
    const pila = [[k, false]];
    let ciclo = false;
    while (pila.length && !ciclo) {
      const [n, diferido] = pila.pop();
      for (const l of propio.get(n)?.llamadas ?? []) {
        const d = diferido || l.retraso;
        if (l.evento === k) { if (d) ciclo = true; continue; }
        const clave = `${l.evento}|${d}`;
        if (!vistos.has(clave) && propio.has(l.evento)) { vistos.add(clave); pila.push([l.evento, d]); }
      }
    }
    if (ciclo) bucles.ciclos.add(k);
  }

  return {
    nombres,
    porEvento,
    falta: { cmds: falta.cmds, getters: falta.getters, props: falta.props },
    usados: { cmds: [...todo.cmds], getters: [...todo.getters] },
    efectos,
    bucles: { propios: [...bucles.propios], repeatdelay: [...bucles.repeatdelay], ciclos: [...bucles.ciclos] },
    // LO DEL PROPIO ARCHIVO, sin plantillas. Hace falta para comparar bichos:
    // 604 de los 675 incluyen la misma `base_monster`, y todo lo que ella trae
    // —sus `ext_*` con `applyeffect effects/dot_poison` que sólo corren si
    // alguien los llama desde fuera— sale «en todos» y no distingue a nadie.
    propio: propios ? (() => {
      const mios = eventos.filter((e) => propios.has(e));
      const cmds = new Set();
      for (const e of mios) cadaComando(e.cmds, (c) => cmds.add(c.nombre));
      const nombresMios = new Set(mios.map((e) => e.nombre || "(sin nombre)"));
      return {
        eventos: [...nombresMios],
        cmds: [...cmds],
        efectos: efectosDe(mios),
        bucles: [...bucles.propios, ...bucles.repeatdelay, ...bucles.ciclos].filter((k) => nombresMios.has(k)),
      };
    })() : null,
  };
}

/** Un lector con caché, para no volver a analizar `base_monster` 800 veces. */
export function lectorConCache(raiz = RAIZ_GUIONES) {
  const cache = new Map();
  return (ruta) => {
    if (!cache.has(ruta)) {
      const t = leerScript(ruta, raiz);
      cache.set(ruta, t === null ? null : partirGuion(t));
    }
    return cache.get(ruta);
  };
}

/** Un guion de monstruo, entero: resuelto, analizado, con su ficha y su modelo. */
export function censarGuion(ruta, { leer = lectorConCache(), raiz = RAIZ_GUIONES, modelos = RAIZ_MODELOS, portado } = {}) {
  const g = resolverGuion(ruta, leer, new Set());
  if (!g.eventos.length && g.faltan.includes(ruta)) return null;
  // Los bloques de su propio archivo, por identidad: `resolverGuion` mete los
  // mismos objetos que devuelve el lector, así que no hace falta compararlos.
  const propios = new Set(leer(ruta)?.eventos ?? []);
  const a = analizar(g, portado ?? undefined, propios);
  let ficha = null;
  try { ficha = modeloYAnimaciones(leerFichaNpc(raiz, ruta)); } catch { ficha = null; }
  const modelo = ficha?.modelo ?? null;

  // Eventos de animación que llaman al guion.
  let anim = null;
  if (modelo) {
    const f = join(modelos, modelo.endsWith(".mdl") ? modelo : `${modelo}.mdl`);
    if (!existsSync(f)) anim = { falta: true };
    else {
      const ev = eventosDeModelo(readFileSync(f)) ?? [];
      const llaman = [...new Set(ev.filter((e) => EVENTOS_ANIM_QUE_LLAMAN.has(e.evento) && e.opciones).map((e) => e.opciones))];
      const minus = new Map([...a.nombres].map((n) => [n.toLowerCase(), n]));
      anim = {
        llaman,
        manejados: llaman.filter((n) => a.nombres.has(n)),
        // El motor compara con `strcmp` (stackstring.cpp:54): una diferencia de
        // mayúsculas es un evento que no corre.
        soloPorMayusculas: llaman.filter((n) => !a.nombres.has(n) && minus.has(n.toLowerCase())),
        sinManejar: llaman.filter((n) => !a.nombres.has(n) && !minus.has(n.toLowerCase())),
      };
    }
  }
  return {
    ruta,
    archivos: g.archivos.length,
    plantillas: g.archivos.filter((a) => a !== ruta),
    sinResolver: g.faltan,
    hp: ficha?.hp ?? null,
    nombre: ficha?.nombre ?? null,
    modelo,
    eventos: Object.keys(a.porEvento).length,
    eventosEnteros: Object.values(a.porEvento).filter((e) => e.entero).length,
    eventosEnterosConCadena: Object.values(a.porEvento).filter((e) => e.enteroConCadena).length,
    delMotor: EVENTOS_DE_MONSTRUO.filter((e) => !e.dinamico && a.nombres.has(e.nombre)).map((e) => e.nombre),
    queNoLlegan: EVENTOS_QUE_NO_LLEGAN.filter((e) => a.nombres.has(e.nombre)).map((e) => e.nombre),
    porEvento: a.porEvento,
    falta: a.falta,
    usados: a.usados,
    efectos: a.efectos,
    bucles: a.bucles,
    propio: { ...a.propio, delMotor: EVENTOS_DE_MONSTRUO.filter((e) => !e.dinamico && a.propio.eventos.includes(e.nombre)).map((e) => e.nombre) },
    anim,
  };
}

/** Todos los `.script` bajo una carpeta, como rutas del motor. */
export function scriptsBajo(raiz, sub) {
  const fuera = [];
  const paseo = (d) => {
    for (const n of readdirSync(d)) {
      const f = join(d, n);
      if (statSync(f).isDirectory()) paseo(f);
      else if (n.toLowerCase().endsWith(".script")) fuera.push(relative(raiz, f).replace(/\\/g, "/").replace(/\.script$/i, ""));
    }
  };
  paseo(join(raiz, sub));
  return fuera.sort();
}

// ── EL CENSO ────────────────────────────────────────────────────────────────

const cuenta = (lista, clave) => {
  const m = new Map();
  for (const x of lista) for (const k of clave(x)) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

/** Los tramos de vida. Un jugador de 500 de vida es el que pide el usuario. */
export const TRAMOS = [
  { nombre: "<50", de: 0, a: 50 },
  { nombre: "50-199", de: 50, a: 200 },
  { nombre: "200-499", de: 200, a: 500 },
  { nombre: "500-1999", de: 500, a: 2000 },
  { nombre: ">=2000", de: 2000, a: Infinity },
];

function main() {
  const t0 = Date.now();
  const leer = lectorConCache();
  const universoCmd = comandosDelMod(RAIZ_MOD) ?? new Set();
  // Las directivas del analizador no están en las tablas de comandos (script.cpp:5370-5460).
  if (existsSync(join(RAIZ_MOD, "shared/ms/script.cpp"))) {
    const s = sinComentariosConLineas(readFileSync(join(RAIZ_MOD, "shared/ms/script.cpp"), "latin1"));
    for (const m of s.matchAll(/_stricmp\(TestCommand, "([^"]+)"\)/g)) universoCmd.add(m[1].toLowerCase());
  }
  const universoGet = new Set();
  for (const f of ["shared/ms/script.cpp", "server/monsters/npcscript.cpp"]) {
    const p = join(RAIZ_MOD, f);
    if (!existsSync(p)) continue;
    const s = sinComentariosConLineas(readFileSync(p, "latin1"));
    for (const m of s.matchAll(/m_GlobalGetterHash\["(\$[^"]+)"\]/g)) universoGet.add(m[1].toLowerCase());
    for (const m of s.matchAll(/ParserName\s*==\s*"(\$[^"]+)"/g)) universoGet.add(m[1].toLowerCase());
  }

  // Lo que el puerto NO corre en el intérprete pero SÍ lee al hornear la
  // ficha: `CAMPOS` de `src/bsp/script.js`. Se lee del fuente al ejecutarse,
  // como `COMANDOS`, para no tener una copia que envejezca.
  const fuenteFicha = readFileSync(join(AQUI, "src", "bsp", "script.js"), "utf8");
  const deFicha = new Set((/const CAMPOS = \/\^\(([^)]+)\)/.exec(fuenteFicha)?.[1] ?? "").split("|").filter(Boolean));
  const marca = (k) => (deFicha.has(k) ? " (ficha)" : universoCmd.has(k) ? "" : "?");

  // 1. El motor.
  const llamadas = llamadasDelMotor() ?? [];
  const citasMal = comprobarCitas(llamadas);

  // Los guiones.
  const rutas = scriptsBajo(RAIZ_GUIONES, "monsters");
  const censo = [];
  for (const r of rutas) { const c = censarGuion(r, { leer }); if (c) censo.push(c); }
  const reales = censo.filter((c) => c.modelo);

  // Los de los mapas.
  const mapas = {};
  for (const d of readdirSync(join(AQUI, "build"))) {
    const f = join(AQUI, "build", d, "bichos.json");
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, "utf8"));
    const s = [...new Set((j.colocados ?? []).map((b) => b.script).filter(Boolean))].sort();
    mapas[d] = { colocados: (j.colocados ?? []).length, guiones: s };
  }
  const enMapas = [...new Set(Object.values(mapas).flatMap((m) => m.guiones))].sort();
  const censoMapas = enMapas.map((r) => censo.find((c) => c.ruta === r) ?? censarGuion(r, { leer })).filter(Boolean);

  // ── informe ──
  const L = (s = "") => console.log(s);
  L(`\n  GUIONES DE MONSTRUO   ${censo.length} en monsters/ (${reales.length} con modelo: bichos de verdad; ${censo.length - reales.length} plantillas o sin setmodel)`);
  L(`  en los mapas horneados ${enMapas.length} guiones distintos (${Object.keys(mapas).join(", ")})`);
  L(`  portado hoy           ${COMANDOS.size} comandos, ${GETTERS.size} getters`);

  L(`\n  1. EVENTOS DEL MOTOR A UN MONSTRUO (guiones con modelo que los manejan, de ${reales.length})`);
  for (const e of EVENTOS_DE_MONSTRUO.filter((x) => !x.dinamico)) {
    const n = reales.filter((c) => c.delMotor.includes(e.nombre)).length;
    L(`    ${String(n).padStart(4)}  ${e.nombre.padEnd(26)} ${e.cita}`);
  }
  for (const e of EVENTOS_QUE_NO_LLEGAN) {
    const n = reales.filter((c) => c.queNoLlegan.includes(e.nombre)).length;
    L(`    ${String(n).padStart(4)}  ${e.nombre.padEnd(26)} NO LLEGA — ${e.porque}`);
  }
  if (citasMal.length) L(`  !! CITAS QUE YA NO CASAN CON EL C++: ${citasMal.map((e) => `${e.nombre} ${e.cita}`).join("; ")}`);

  const conAnim = reales.filter((c) => c.anim && !c.anim.falta);
  const llamanAnim = conAnim.filter((c) => c.anim.llaman.length);
  L(`\n  2. EVENTOS DE ANIMACIÓN (500/600 → guion)`);
  L(`    modelos leídos ${conAnim.length}, sin .mdl en assets/msr ${reales.filter((c) => c.anim?.falta).length}`);
  L(`    guiones cuyo modelo llama al guion  ${llamanAnim.length}; manejan alguno ${llamanAnim.filter((c) => c.anim.manejados.length).length}`);
  L(`    nombres más llamados: ${cuenta(llamanAnim, (c) => c.anim.manejados).slice(0, 12).map(([k, v]) => `${k} x${v}`).join(", ")}`);
  const mayus = llamanAnim.filter((c) => c.anim.soloPorMayusculas.length);
  L(`    que el modelo pide y el guion no tiene: ${llamanAnim.filter((c) => c.anim.sinManejar.length).length} guiones; sólo por mayúsculas ${mayus.length}`);

  const rankCmd = cuenta(reales, (c) => c.falta.cmds);
  const rankGet = cuenta(reales, (c) => c.falta.getters);
  const rankProp = cuenta(reales, (c) => c.falta.props);
  L(`\n  3. LO QUE NO ESTÁ PORTADO (guiones con modelo que lo usan)`);
  L(`    comandos (${rankCmd.length}): ${rankCmd.slice(0, 40).map(([k, v]) => `${k}${marca(k)} ${v}`).join(", ")}`);
  L(`    getters (${rankGet.length}): ${rankGet.slice(0, 20).map(([k, v]) => `${k}${universoGet.has(k) ? "" : "?"} ${v}`).join(", ")}`);
  L(`    $get(,prop) (${rankProp.length}): ${rankProp.slice(0, 12).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  L(`    («?» es un nombre que el mod NO registra: el motor avisa y sigue; «(ficha)» lo lee el horneado, no el intérprete)`);
  const rankPropioCmd = cuenta(reales, (c) => c.propio.cmds.filter((x) => !COMANDOS.has(x)));
  L(`    sólo en el ARCHIVO PROPIO del bicho (sin plantillas): ${rankPropioCmd.slice(0, 30).map(([k, v]) => `${k}${marca(k)} ${v}`).join(", ")}`);
  const tEv = reales.reduce((a, c) => a + c.eventos, 0);
  const tEn = reales.reduce((a, c) => a + c.eventosEnteros, 0);
  const tEc = reales.reduce((a, c) => a + c.eventosEnterosConCadena, 0);
  L(`    eventos: ${tEv} en los ${reales.length}; enteros por sí solos ${tEn} (${(tEn / tEv * 100).toFixed(1)} %), con lo que llaman ${tEc} (${(tEc / tEv * 100).toFixed(1)} %)`);
  L(`    guiones con TODO portado: ${reales.filter((c) => !c.falta.cmds.length && !c.falta.getters.length && !c.falta.props.length).length}`);
  const COMBATE = ["game_spawn", "game_postspawn", "game_struck", "game_damaged", "game_parry", "game_dodamage", "game_damaged_other", "game_death"];
  for (const nombre of COMBATE) {
    const con = reales.filter((c) => c.porEvento[nombre]);
    L(`    ${nombre.padEnd(18)} lo tienen ${String(con.length).padStart(3)}; entero ${con.filter((c) => c.porEvento[nombre].entero).length}, con su cadena ${con.filter((c) => c.porEvento[nombre].enteroConCadena).length}`);
    const r = cuenta(con, (c) => c.porEvento[nombre].faltan).slice(0, 10);
    if (r.length) L(`        le falta (su cuerpo): ${r.map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  const rankCombate = cuenta(reales, (c) => [...new Set(COMBATE.flatMap((n) => c.porEvento[n]?.faltanConCadena ?? []))]);
  L(`    lo que falta en la CADENA de esos ocho (guiones): ${rankCombate.slice(0, 40).map(([k, v]) => `${k}${k.startsWith("$") ? "" : marca(k)} ${v}`).join(", ")}`);

  const rankEfe = cuenta(reales, (c) => [...new Set([...c.efectos.literal, ...c.efectos.porVariable])]);
  L(`\n  4. EFECTOS (guiones con modelo que los aplican)`);
  L(`    ${rankEfe.slice(0, 20).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const rankEfePropio = cuenta(reales, (c) => [...new Set([...c.propio.efectos.literal, ...c.propio.efectos.porVariable])]);
  L(`    en el ARCHIVO PROPIO: ${rankEfePropio.slice(0, 20).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  L(`    sin resolver por variable: ${cuenta(reales, (c) => c.efectos.sinResolver).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(", ")}`);

  L(`\n  5. BUCLES QUE SE REPROGRAMAN SOLOS`);
  L(`    guiones con alguno: ${reales.filter((c) => c.bucles.propios.length + c.bucles.repeatdelay.length + c.bucles.ciclos.length).length} de ${reales.length}`);
  L(`    callevent <retraso> a sí mismo: ${cuenta(reales, (c) => c.bucles.propios).slice(0, 15).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  L(`    repeatdelay: ${cuenta(reales, (c) => c.bucles.repeatdelay).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  L(`    en el ARCHIVO PROPIO: ${cuenta(reales, (c) => c.propio.bucles).slice(0, 15).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  L(`    ciclos de varios eventos: ${cuenta(reales, (c) => c.bucles.ciclos).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(", ")}`);

  // 6. Por vida.
  const tramos = TRAMOS.map((t) => ({ ...t, guiones: reales.filter((c) => c.hp > 0 && c.hp >= t.de && c.hp < t.a) }));
  L(`\n  6. POR VIDA (hp de la ficha, sin multiplicadores del mapa)   sin hp legible o con hp 0 (la pone el postspawn): ${reales.filter((c) => !(c.hp > 0)).length}`);
  for (const t of tramos) {
    const g = t.guiones;
    if (!g.length) { L(`    ${t.nombre.padEnd(9)}    0`); continue; }
    const med = (f) => (g.reduce((a, c) => a + f(c), 0) / g.length).toFixed(1);
    L(`    ${t.nombre.padEnd(9)} ${String(g.length).padStart(4)}  propios: eventos ${med((c) => c.propio.eventos.length)}  cmds ${med((c) => c.propio.cmds.length)} (sin portar ${med((c) => c.propio.cmds.filter((x) => !COMANDOS.has(x)).length)})  efectos ${med((c) => c.propio.efectos.literal.length + c.propio.efectos.porVariable.length)}  bucles ${med((c) => c.propio.bucles.length)}  anim->guion ${med((c) => c.anim?.manejados?.length ?? 0)}`);
  }
  const debiles = tramos.filter((t) => t.a <= 200).flatMap((t) => t.guiones);
  const fuertes = tramos.filter((t) => t.de >= 500).flatMap((t) => t.guiones);
  // Rasgos del ARCHIVO PROPIO y de qué plantillas tira: lo heredado de
  // `base_monster` lo tienen todos y no separa a nadie.
  const rasgos = (c) => [
    ...c.propio.cmds.map((x) => `cmd ${x}${COMANDOS.has(x) ? "" : " *"}`),
    ...[...new Set([...c.propio.efectos.literal, ...c.propio.efectos.porVariable])].map((x) => `efecto ${x}`),
    ...c.propio.delMotor.map((x) => `evento ${x}`),
    ...c.plantillas.map((x) => `incluye ${x}`),
  ];
  const parte = (lista) => { const m = new Map(cuenta(lista, rasgos)); return (k) => (m.get(k) ?? 0) / Math.max(1, lista.length); };
  const pf = parte(fuertes), pd = parte(debiles);
  const todosRasgos = new Set([...fuertes, ...debiles].flatMap(rasgos));
  const diferencia = [...todosRasgos].map((k) => ({ k, fuertes: pf(k), debiles: pd(k), dif: pf(k) - pd(k) })).sort((a, b) => b.dif - a.dif);
  L(`    LO QUE TIENEN LOS FUERTES (>=500, ${fuertes.length}) Y NO LOS DÉBILES (<200, ${debiles.length}), en % de guiones:`);
  L(`      («*» = comando sin portar)`);
  for (const d of diferencia.slice(0, 30)) L(`      ${d.k.padEnd(34)} ${(d.fuertes * 100).toFixed(0).padStart(3)} % contra ${(d.debiles * 100).toFixed(0).padStart(3)} %`);

  // Los de los mapas.
  L(`\n  LOS DE LOS MAPAS`);
  for (const [m, d] of Object.entries(mapas)) {
    const cs = d.guiones.map((r) => censoMapas.find((c) => c.ruta === r)).filter(Boolean);
    const mon = cs.filter((c) => c.ruta.startsWith("monsters/"));
    L(`    ${m.padEnd(20)} ${String(d.guiones.length).padStart(3)} guiones (${mon.length} de monsters/); con todo portado ${cs.filter((c) => !c.falta.cmds.length && !c.falta.getters.length && !c.falta.props.length).length}`);
  }
  const rankMapa = cuenta(censoMapas.filter((c) => c.ruta.startsWith("monsters/")), (c) => [...c.falta.cmds, ...c.falta.getters]);
  L(`    lo que falta a los monstruos colocados: ${rankMapa.slice(0, 20).map(([k, v]) => `${k} ${v}`).join(", ")}`);

  // ── el horneado ──
  const SALIDA_DIR = join(AQUI, "build", "msr");
  mkdirSync(SALIDA_DIR, { recursive: true });
  const resumen = (c) => ({
    ruta: c.ruta, nombre: c.nombre, hp: c.hp, modelo: c.modelo, archivos: c.archivos, sinResolver: c.sinResolver,
    eventos: c.eventos, eventosEnteros: c.eventosEnteros, eventosEnterosConCadena: c.eventosEnterosConCadena,
    delMotor: c.delMotor, queNoLlegan: c.queNoLlegan, plantillas: c.plantillas, propio: c.propio,
    falta: c.falta, efectos: c.efectos, bucles: c.bucles, anim: c.anim,
    eventosQueFaltan: Object.fromEntries(Object.entries(c.porEvento).filter(([, e]) => !e.entero).map(([k, e]) => [k, e.faltan])),
  });
  const json = {
    procedencia: "Leído de ../MSC/MSCScripts/scripts/monsters/**.script (con sus #include), de ../MSC/assets/msr/models/*.mdl y del C++ de ../MSC/MasterSwordRebirth-Xash3D. Medidas, no contenido. No redistribuible.",
    experimento: 91,
    portado: { comandos: [...COMANDOS], getters: [...GETTERS] },
    motor: {
      eventos: EVENTOS_DE_MONSTRUO.map((e) => ({ ...e, guiones: e.dinamico ? null : reales.filter((c) => c.delMotor.includes(e.nombre)).length })),
      queNoLlegan: EVENTOS_QUE_NO_LLEGAN.map((e) => ({ ...e, guiones: reales.filter((c) => c.queNoLlegan.includes(e.nombre)).length })),
      citasQueNoCasan: citasMal.map((e) => e.nombre),
      llamadasLiterales: llamadas.length,
    },
    totales: {
      guiones: censo.length, conModelo: reales.length, eventos: tEv, eventosEnteros: tEn, eventosEnterosConCadena: tEc,
      faltanComandos: rankCmd.map(([k, v]) => ({ comando: k, guiones: v, enElMod: universoCmd.has(k), deFicha: deFicha.has(k) })),
      faltanComandosPropios: rankPropioCmd.map(([k, v]) => ({ comando: k, guiones: v })),
      faltanEnCombate: { eventos: COMBATE, faltan: rankCombate.map(([k, v]) => ({ nombre: k, guiones: v })) },
      efectosPropios: rankEfePropio.map(([k, v]) => ({ efecto: k, guiones: v })),
      faltanGetters: rankGet.map(([k, v]) => ({ getter: k, guiones: v, enElMod: universoGet.has(k) })),
      faltanPropiedades: rankProp.map(([k, v]) => ({ propiedad: k, guiones: v })),
      efectos: rankEfe.map(([k, v]) => ({ efecto: k, guiones: v })),
      bucles: {
        propios: cuenta(reales, (c) => c.bucles.propios).map(([k, v]) => ({ evento: k, guiones: v })),
        repeatdelay: cuenta(reales, (c) => c.bucles.repeatdelay).map(([k, v]) => ({ evento: k, guiones: v })),
        ciclos: cuenta(reales, (c) => c.bucles.ciclos).map(([k, v]) => ({ evento: k, guiones: v })),
      },
      animacion: cuenta(llamanAnim, (c) => c.anim.llaman).map(([k, v]) => ({ evento: k, guiones: v })),
      tramos: tramos.map((t) => ({ tramo: t.nombre, guiones: t.guiones.length })),
      fuertesContraDebiles: diferencia.slice(0, 60),
    },
    mapas: Object.fromEntries(Object.entries(mapas).map(([m, d]) => [m, { colocados: d.colocados, guiones: d.guiones }])),
    guiones: Object.fromEntries([...censo, ...censoMapas.filter((c) => !c.ruta.startsWith("monsters/"))].map((c) => [c.ruta, resumen(c)])),
  };
  const texto = JSON.stringify(json, null, 1);
  writeFileSync(join(SALIDA_DIR, "bichosguion.json"), texto);
  L(`\n  escrito build/msr/bichosguion.json  (${(texto.length / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
