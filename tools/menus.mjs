// LAS OPCIONES DEL MENÚ DE INTERACCIÓN, sacadas de los scripts de Gate City.
//
//   npm run menus
//
// Cuando pulsas la F delante de un NPC, el cliente no sabe qué poner en el menú:
// se lo pregunta al servidor, el servidor llama a un evento del script del NPC y
// el script registra las opciones una a una.
//
//     CallScriptEvent("game_menu_getoptions", &Params);
//     for (i...) { WRITE_BYTE(26); WRITE_BYTE(Access);
//                  WRITE_STRING(Title); WRITE_BYTE(Type); WRITE_STRING(Data); }
//                                     msmonsterserver.cpp:2890-2911
//
// Y el script lo hace así (gatecity/kendra.script:76-89):
//
//     { game_menu_getoptions
//       if ( QUEST_GOBLINPRISONER == 0 )
//       {
//         if( $item_exists(PARAM1,item_letter_almund) )
//         {
//           local reg.mitem.title 	"Give Almund's Letter"
//           local reg.mitem.type 	payment
//           local reg.mitem.data 	item_letter_almund
//           local reg.mitem.callback say_ending
//           menuitem.register
//         }
//       }
//     }
//
// Esto lee esos bloques y escribe `build/gatecity/menus.json`. **No es un
// intérprete de scripts** y no pretende serlo: es un lector de un bloque con una
// forma muy concreta, y todo lo que no entiende lo dice en vez de suponerlo.
//
// ── Qué condiciones se pueden decidir y cuáles no ──────────────────────────
//
// En los 25 scripts de Gate City hay 18 condiciones y cuatro formas:
//
//   `$item_exists(PARAM1, item_x)`   SE PUEDE: tenemos inventario. 5 de las 18.
//   `VAR` y `!VAR`                   SE PUEDE, con una salvedad: son variables
//                                    de misión y **aquí no hay misiones**, así
//                                    que están todas sin poner. `!VAR` es cierto
//                                    y `VAR` es falso, que es lo que valdría en
//                                    una partida recién empezada.
//   `VAR == 0`                       igual, y da cierto.
//   `A < B`, `A equals B`, `$get(..)` NO SE PUEDE. La opción se manda igual, con
//                                    `disabled`, y el porqué al lado.
//
// Que se manden apagadas en vez de esconderlas es una DIFERENCIA con el
// original, y es a propósito: en el juego la condición decide si la opción se
// registra, o sea que una opción que no toca no aparece. Aquí aparece gris y
// dice por qué. Es la misma decisión que ya se tomó en el menú principal, donde
// «Visit a Kingdom» se ve apagada en vez de esconderse, y por el mismo motivo:
// un menú vacío no enseña que el menú funciona.
//
// ── HAY DOS `if`, Y AQUÍ SE LEÍAN COMO UNO ─────────────────────────────────
//
// **Corrección de lo que este archivo decía antes.** La cabecera afirmaba que
// en `gatecity/armorer.script` sale «Ask about broken axe» **dos veces**, con
// su cita y con un campo `guardaSoloElTitulo` en el fichero de salida para
// llevarlo. Era falso, y no era un fallo del juego: era el modelo de este
// lector. El mismo error que el de los iconos del experimento 30 — una
// deducción correcta sobre una premisa que no se comprobó.
//
// La premisa que faltaba: **el motor tiene DOS condicionales distintos**, y se
// distinguen por el paréntesis.
//
//     else if (!_stricmp(msstring(TestCommand).substr(0, 2), "if"))
//     {
//         if (!strstr(TestCommand, "(") && *CmdLineTmp != '(')
//             KeepCmd = true;                 // <- el VIEJO, sin paréntesis
//         else
//         {   ...ScriptCmd.m_NewConditional = true;   // <- el NUEVO
//                                     script.cpp:5310-5317
//
// Y al fallar no hacen lo mismo:
//
//     else if (Cmd.m_Conditional)
//     {
//         if (!Cmd.m_NewConditional)
//             break; //Old if command.  Breaks event execution on failure
//                                     script.cpp:5754-5758
//
// O sea: `if ( X )` que falla **se salta sus hijos y sigue**; `if X` que falla
// **abandona el evento entero**. Lo segundo es lo que no estaba portado.
//
// Con eso, el armero (gatecity/armorer.script:229-241) no duplica nada:
//
//     if ( $item_exists(PARAM1,item_gaxe_handle) )   <- nuevo
//     {
//         ..."Ask about broken axe"...  menuitem.register
//         if $item_exists(PARAM1,item_ore_lorel)     <- VIEJO
//         ..."Show Loreldian Ore"...    menuitem.register
//     }
//
// Sin el mineral, el `if` viejo falla y **corta el evento**: «Show Loreldian
// Ore» no se registra, y tampoco se registraría nada que viniera detrás. El
// título no se reutiliza porque nunca se llega a la línea que lo reutilizaría.
//
// Lo que sigue siendo cierto de lo de antes: `if` sin llaves gobierna sólo la
// línea siguiente, y `menuitem.register` **no limpia** `reg.mitem.*`
// (npcscript.cpp:940-1000). Las dos cosas son verdad; lo que estaba mal era la
// consecuencia.
//
// Así que un `if` viejo no es una condición de SU opción: es una condición de
// **todas las que vengan detrás en el bloque**. Aquí se llaman «cortes» y se
// añaden a cada opción registrada desde ese punto.

import { writeFileSync, existsSync, readFileSync, readdirSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";

const SCRIPTS = process.argv[2] ?? "../MSC/MSCScripts/scripts";
const SALIDA = resolve("build/gatecity/menus.json");

/** Los ocho tipos, con el nombre que les da el script. `npcscript.cpp:953-973`. */
export const TIPOS = {
  callback: "callback", say: "say", payment: "payment",
  payment_silent: "payment", disabled: "disabled", itemdesc: "itemdesc",
  forgive: "forgive", green: "green",
};
/** Lo que no está en la tabla es `MOT_CALLBACK`. `npcscript.cpp:972-973`. */
export const tipoDe = (s) => TIPOS[String(s ?? "").toLowerCase()] ?? "callback";

/** El bloque `{ evento ... }` de un script, con las llaves emparejadas. */
export function bloqueDe(texto, evento) {
  const i = texto.search(new RegExp(`^\\{\\s*(\\[[^\\]]*\\]\\s*)?${evento}\\b`, "m"));
  if (i < 0) return null;
  let n = 0;
  for (let j = i; j < texto.length; j++) {
    if (texto[j] === "{") n++;
    else if (texto[j] === "}") { n--; if (!n) return texto.slice(i, j + 1); }
  }
  return texto.slice(i);
}

const quitaComillas = (s) => String(s ?? "").trim().replace(/^['"]|['"]$/g, "");

/** Quita un par de paréntesis SÓLO si envuelven toda la expresión. */
export function envoltorio(s) {
  let t = s.trim();
  while (t.startsWith("(") && t.endsWith(")")) {
    let n = 0, envuelve = true;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "(") n++;
      else if (t[i] === ")") { n--; if (!n && i < t.length - 1) { envuelve = false; break; } }
    }
    if (!envuelve || n !== 0) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

/**
 * Las opciones de un bloque `game_menu_getoptions`.
 *
 * Recorre línea a línea llevando la cuenta de las llaves y de qué condición
 * gobierna cada nivel. Lo que se acumula es `reg.mitem.*`, y **no se limpia al
 * registrar**, igual que el motor.
 */
export function opcionesDe(bloque) {
  const fuera = [];
  const reg = {};                              // reg.mitem.*, que persiste
  const pila = [];                             // condiciones por nivel de llave
  let pendiente = null;                        // un `if ( )` sin llaves, sin dueño
  // Los `if` VIEJOS —sin paréntesis— que ya se han pasado. Cada uno gobierna
  // todo lo que venga detrás, porque al fallar abandona el evento
  // (`break`, script.cpp:5758). No se sacan nunca de la lista.
  const cortes = [];

  const lineas = bloque.split("\n").slice(1);  // la primera es `{ evento`
  for (const cruda of lineas) {
    const l = cruda.trim();
    if (!l || l.startsWith("//")) continue;

    if (l === "{") { pila.push({ cond: pendiente, llaves: true }); pendiente = null; continue; }
    if (l === "}") { pila.pop(); continue; }

    const si = /^if\s*(.*)$/i.exec(l);
    if (si) {
      // Se quitan los paréntesis SÓLO si envuelven la condición entera. Quitar
      // el de delante y el de detrás a ciegas parte
      // `$item_exists(PARAM1,item_x)` por la mitad, que es lo que hacía la
      // primera versión: dejaba la condición sin cerrar y `juzgar()` la daba por
      // indescifrable. La condición se leía en la salida y parecía bien.
      const crudo = si[1].trim();
      const cond = envoltorio(crudo);
      // EL PARÉNTESIS ES LO QUE LOS DISTINGUE (script.cpp:5310-5317). Uno que
      // empieza por `(` es el nuevo y gobierna sólo lo suyo; cualquier otro es
      // el viejo y, si falla, se lleva por delante el resto del evento.
      if (crudo.startsWith("(")) {
        pendiente = cond;
      } else {
        cortes.push(cond);
      }
      continue;
    }

    const asigna = /^(local|setvar|setvard|stradd)\s+reg\.mitem\.([a-z_]+)\s+(.*)$/i.exec(l);
    if (asigna) {
      const [, como, campo, valor] = asigna;
      const v = quitaComillas(valor);
      const k = campo.toLowerCase();
      if (como.toLowerCase() === "stradd") reg[k] = (reg[k] ?? "") + v;
      else reg[k] = v;
      // Si venía un `if ( )` sin llaves, gobierna ESTA línea y se agota aquí.
      // Como sólo pone una variable y no registra nada, no hace falta llevarlo:
      // la opción se registrará más abajo con el valor puesto o sin poner, y en
      // el original pasa lo mismo porque `reg.mitem.*` no se limpia.
      pendiente = null;
      continue;
    }

    if (/^menuitem\.register\b/i.test(l)) {
      // Los cortes van los PRIMEROS: si uno de ellos falla, esta opción no
      // existe porque el evento se abandonó antes de llegar aquí.
      const condiciones = [...cortes, ...pila.map((p) => p.cond).filter(Boolean)];
      // El `if ( )` sin llaves que quedó suelto justo antes del registro
      // gobierna sólo la línea siguiente, que es el propio `menuitem.register`.
      if (pendiente !== null) { condiciones.push(pendiente); pendiente = null; }
      fuera.push({
        titulo: reg.title ?? "",
        tipo: tipoDe(reg.type),
        datos: reg.data ?? "",
        respuesta: reg.callback ?? "",
        siFalla: reg.cb_failed ?? "",
        prioridad: Number(reg.priority ?? 0) || 0,
        condiciones: [...condiciones],
        // Cuántas de ellas vienen de un `if` viejo, o sea cuántas pueden
        // llevarse por delante también a las de detrás.
        cortes: cortes.length,
      });
      continue;
    }

    // Cualquier otra orden agota un `if` sin llaves que estuviera esperando.
    if (pendiente !== null) pendiente = null;
  }
  return fuera;
}

/**
 * ¿Se puede decidir esta condición sin un intérprete de scripts?
 *
 * Devuelve `{ decidible, vale, porque }`. `vale` sólo significa algo si
 * `decidible`; `necesita` dice qué hace falta comprobar en el momento (el
 * inventario del jugador).
 */
export function juzgar(cond) {
  const c = cond.trim();

  const item = /^\$item_exists\s*\(\s*PARAM1\s*,\s*([A-Za-z0-9_]+)\s*\)$/i.exec(c);
  if (item) return { decidible: true, necesita: { objeto: item[1] }, porque: "" };

  const noItem = /^!\s*\$item_exists\s*\(\s*PARAM1\s*,\s*([A-Za-z0-9_]+)\s*\)$/i.exec(c);
  if (noItem) return { decidible: true, necesita: { sinObjeto: noItem[1] }, porque: "" };

  // Una variable de misión sola. Aquí no hay misiones, así que está sin poner.
  if (/^![A-Za-z_][A-Za-z0-9_.]*$/.test(c)) return { decidible: true, vale: true, porque: "" };
  if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(c)) return { decidible: true, vale: false, porque: "no quest state" };

  const cero = /^([A-Za-z_][A-Za-z0-9_.]*)\s*==\s*0$/.exec(c);
  if (cero) return { decidible: true, vale: true, porque: "" };

  return { decidible: false, porque: c };
}

// ── LO QUE SE EJECUTA ───────────────────────────────────────────────────────
if (process.argv[1]?.endsWith("menus.mjs")) {
  const dir = join(SCRIPTS, "gatecity");
  if (!existsSync(dir)) {
    console.error(`No encuentro ${dir}. Pásame la carpeta de scripts del juego.`);
    process.exit(1);
  }

  const controles = [];
  const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

  const porScript = {};
  let total = 0, decidibles = 0, conFallo = 0;
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".script"))) {
    const texto = readFileSync(join(dir, f), "utf8");
    const bloque = bloqueDe(texto, "game_menu_getoptions");
    if (!bloque) continue;
    const ops = opcionesDe(bloque).map((o) => ({
      ...o,
      juicio: o.condiciones.map(juzgar),
    }));
    if (!ops.length) continue;
    const clave = `gatecity/${f.replace(/\.script$/, "")}`;
    porScript[clave] = ops;
    total += ops.length;
    decidibles += ops.filter((o) => o.juicio.every((j) => j.decidible)).length;
    conFallo += ops.filter((o) => o.cortes > 0).length;
  }

  console.log(`\n  OPCIONES DE MENÚ DE GATE CITY  (${dir})\n`);
  for (const [k, ops] of Object.entries(porScript)) {
    console.log(`    ${k.padEnd(22)} ${ops.length}`);
    for (const o of ops) {
      const malas = o.juicio.filter((j) => !j.decidible).map((j) => j.porque);
      console.log(`      ${o.tipo.padEnd(9)} ${JSON.stringify(o.titulo).padEnd(30)}` +
        `${malas.length ? ` sin decidir: ${malas.join(" && ")}` : ""}` +
        `${o.cortes ? `  [detrás de ${o.cortes} if viejo(s): si fallan, ésta no existe]` : ""}`);
    }
  }

  control("hay opciones de verdad en Gate City", total >= 8, `${total} en ${Object.keys(porScript).length} NPC`);
  control("y más de la mitad se pueden decidir sin intérprete", decidibles * 2 >= total,
    `${decidibles} de ${total}`);
  // Este control decía «EL FALLO DEL SCRIPT: el `if` del mineral sólo guarda
  // el título» y estaba en verde sobre un hallazgo falso. Ahora mide lo que de
  // verdad hay: opciones que van DETRÁS de un `if` viejo y que por eso
  // desaparecen si él falla, porque abandona el evento (script.cpp:5758).
  control("hay opciones detrás de un `if` viejo, que al fallar se las lleva",
    conFallo >= 1, `${conFallo} de ${total}`);
  // Y su contrario, que es el que impide que lo de arriba sea un sello: tiene
  // que haber también opciones SIN ningún corte delante. Si todas tuvieran uno,
  // «detrás de un if viejo» no distinguiría nada.
  control("y otras que no llevan ninguno delante",
    Object.values(porScript).flat().some((o) => !o.cortes),
    `${Object.values(porScript).flat().filter((o) => !o.cortes).length} de ${total} sin cortes`);
  control("el tipo desconocido cae en `callback`, como el motor",
    tipoDe("lo-que-sea") === "callback" && tipoDe("payment_silent") === "payment");
  control("una variable de misión sin poner: `!VAR` es cierto y `VAR` es falso",
    juzgar("!OFFER_SET").vale === true && juzgar("OFFER_SET").vale === false);
  control("y lo que no se entiende se dice, no se supone",
    juzgar("ZOMBIE_COUNT < REQ_ZOMBIES").decidible === false);

  console.log("");
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(62)} ${c.detalle}`);
  console.log(`\n  ${controles.filter((c) => c.bien).length} de ${controles.length} controles`);

  writeFileSync(SALIDA, JSON.stringify({
    procedencia: {
      scripts: SCRIPTS,
      cuando: new Date().toISOString().slice(0, 10),
      nota: "Leído de los scripts de Master Sword Rebirth. No se distribuye.",
      citas: [
        "msmonsterserver.cpp:2860-2912  OpenMenu: el servidor pregunta al script y manda las opciones",
        "npcscript.cpp:940-1000  menuitem.register: los ocho tipos, y que NO limpia reg.mitem.*",
        "msmonsterserver.cpp:2914-2960  UseMenuOption: -1 es cancelar, y cómo se cobra un pago",
        "vgui_menu_interact.h  el panel",
      ],
      noEsUnInterprete: "Se leen los bloques `game_menu_getoptions` y se juzgan cuatro formas de condición. Lo que no se entiende va con `disabled` y el porqué al lado.",
    },
    opciones: porScript,
  }, null, 1));
  console.log(`  escrito ${SALIDA}`);

  const PROC = resolve("build/gatecity/PROCEDENCIA.md");
  const MARCA = "## Las opciones del menú de interacción";
  if (existsSync(PROC) && !readFileSync(PROC, "utf8").includes(MARCA)) {
    appendFileSync(PROC, `
${MARCA}

\`menus.json\` lo escribe \`node tools/menus.mjs\` leyendo los bloques
\`game_menu_getoptions\` de los 25 scripts de \`scripts/gatecity/\`. Son títulos,
tipos y condiciones: texto, nada de imágenes.

No es un intérprete de scripts. Se juzgan cuatro formas de condición y lo que no
se entiende viaja con \`disabled\` y su motivo, que se ve en el menú.

Vale lo de siempre: **está en \`build/\`, que está en \`.gitignore\`, y no se mueve
un byte a \`public/\`.**
`);
  }

  process.exit(controles.every((c) => c.bien) ? 0 : 1);
}
