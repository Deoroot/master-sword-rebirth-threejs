// LA INTERFAZ EN INGLÉS, Y ESTO ES LO QUE LO MANTIENE.
//
// La regla del proyecto tiene dos mitades y sólo una se puede comprobar
// leyendo:
//
//   **la documentación y los comentarios van en español** — son el cuaderno de
//   trabajo, y el motivo por el que existen es que alguien los lea en el idioma
//   en que se pensaron.
//   **lo que el jugador lee va en inglés** — porque Master Sword está en inglés,
//   porque sus propias cadenas lo están (`parried!`, `You have been slain`) y
//   porque una demo web no va a tener un público en español.
//
// La primera mitad no hace falta defenderla: nadie va a traducir 30 000 líneas
// de comentarios por accidente. La segunda sí, y por lo de siempre: **una
// cadena en español en la interfaz no da ningún error**. Se cuela en un
// mensaje nuevo, nadie la ve hasta que alguien juega, y para entonces hay
// cuatro.
//
// Así que esto recorre los módulos que pintan, saca sus cadenas con un
// analizador de verdad y busca marcas de español. Lo que NO mira, a propósito:
//
//   - los comentarios (el analizador no los devuelve: están fuera del árbol);
//   - los `throw` que son para quien programa —«una sesión necesita un
//     almacén»— y que el jugador no puede provocar;
//   - los `console.*`, que son la consola del navegador y no la pantalla;
//   - la hoja de estilos, que es CSS con palabras que se parecen al español.
//
// Si un día hay que enseñar un texto en español a propósito, se añade a
// `PERMITIDAS` con su motivo al lado. Eso es una decisión; lo que esta prueba
// impide es el descuido.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAst } from "rollup/parseAst";

/** Los módulos que pintan algo que el jugador lee. */
const PANTALLA = [
  "src/juego/interfaz.js",
  "src/juego/menums.js",
  "src/juego/hudms.js",
  "src/juego/teclas.js",
  "src/juego/personaje.js",
  "src/juego/almacen.js",
  "src/play/menu.js",
  "src/play/hud.js",
  "src/main.js",
  // Los paneles de VGUI, desde el experimento 29. Enseñan «Interact», «Cancel»
  // y el motivo por el que una opción está apagada.
  "src/vgui/interactuar.js",
  "src/vgui/menubase.js",
  "src/play/opciones.js",
];

/**
 * Las marcas de español: las cinco vocales acentuadas, la eñe, la apertura de
 * interrogación y exclamación, y una lista corta de palabras que en inglés no
 * existen o no significan lo mismo.
 *
 * Las palabras hacen falta porque media interfaz no lleva tildes: «con qué
 * empiezas» sí, pero «crear» y «volver» no. Y se eligen las que **no** son
 * también inglesas ni nombres del código: nada de `de`, `no`, `un`, `a`, `sin`
 * —que es un nombre de función trigonométrica— ni `es`.
 */
const LETRAS = /[áéíóúüñ¿¡]/i;
const PALABRAS = new RegExp(
  // `(?<![\w-])` y no `\b`: sin excluir el guion, la clase de CSS `mx-oro`
  // cuenta como la palabra «oro» y la prueba acusa a una hoja de estilos.
  "(?<![\\w-])(" + [
    "hola", "adiós", "gracias",
    "crear", "cerrar", "volver", "borrar", "guardar", "cargando", "jugar",
    "elegir", "empiezas", "nombre", "personaje", "personajes", "inventario",
    "habilidades", "atributos", "teclas", "opciones", "muerte", "muerto",
    "vida", "oro", "peso", "arma", "armas", "escudo", "hechizo", "daño",
    "ranura", "ranuras", "aguante", "carga",
    "tuyo", "suyo", "todavía", "ninguno", "ninguna", "cada", "entre",
    "porque", "aunque", "mientras", "siempre", "nunca", "también",
  ].join("|") + ")(?![\\w-])",
  "i"
);

const hijos = (n) => {
  const f = [];
  for (const k of Object.keys(n)) {
    if (["start", "end", "loc", "range", "type"].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === "string") f.push(x); }
    else if (v && typeof v.type === "string") f.push(v);
  }
  return f;
};

/**
 * Las cadenas que de verdad llegan a la pantalla.
 *
 * Y AQUÍ ESTÁ LA DECISIÓN DE LA PRUEBA, que costó la primera vuelta: mirar
 * TODAS las cadenas de un archivo no sirve. `"inventario"` es a la vez una
 * etiqueta de botón y el nombre de una acción del teclado; `"mx-armas"` es una
 * clase de CSS; `"hechizo"` es un tipo de objeto del catálogo. Lo que las
 * distingue no es su texto: es **dónde se usan**.
 *
 * Así que se buscan por el sitio, no por la pinta:
 *
 *   - el valor de `texto:`, `title:`, `html:`, `placeholder:`, `alt:`,
 *     `nombre:` y `porque:` — que es como esta interfaz se escribe (ver el
 *     ayudante `el()` de `interfaz.js`);
 *   - lo que se asigna a `.textContent`, `.innerHTML`, `.title`, `.alt` o
 *     `.placeholder`;
 *   - lo que se le pasa a `alert()`, a `say()` —la línea de carga— y el segundo
 *     argumento de `suceso()`, que son los mensajes del HUD;
 *   - los nombres legibles de las teclas, que son el valor de una tabla cuyas
 *     claves son códigos del navegador (`ShiftLeft`, `Mouse0`).
 *
 * Y se podan de raíz `throw` y `console.*`: un `throw` en español no aparece
 * aquí **porque es un `throw`**, no porque su texto se parezca a otra cosa.
 */
const CLAVES = new Set(["texto", "title", "html", "placeholder", "alt", "nombre", "porque", "porQue", "etiqueta"]);
const PROPS = new Set(["textContent", "innerHTML", "innerText", "title", "alt", "placeholder"]);
const LLAMADAS = new Set(["alert", "say"]);
const CODIGO_DE_TECLA = /^(Key|Digit|Numpad|Arrow|F\d|Shift|Control|Alt|Mouse|Meta|Space|Tab|Enter|Escape|Backspace)/;

function cadenasDePantalla(ruta) {
  const src = readFileSync(ruta, "utf8");
  const ast = parseAst(src);
  const fuera = [];
  const linea = (n) => src.slice(0, n.start).split("\n").length;
  const apuntar = (n) => {
    if (!n) return;
    if (n.type === "Literal" && typeof n.value === "string") fuera.push({ texto: n.value, linea: linea(n) });
    else if (n.type === "TemplateLiteral") for (const q of n.quasis) fuera.push({ texto: q.value.cooked ?? "", linea: linea(q) });
    // `a ? "x" : "y"` y `"x" + "y"`, que es como está escrita media interfaz.
    else if (n.type === "ConditionalExpression") { apuntar(n.consequent); apuntar(n.alternate); }
    else if (n.type === "BinaryExpression" && n.operator === "+") { apuntar(n.left); apuntar(n.right); }
    else if (n.type === "LogicalExpression") { apuntar(n.left); apuntar(n.right); }
  };
  (function w(n) {
    if (n.type === "ThrowStatement") return;
    if (n.type === "CallExpression" && n.callee?.type === "MemberExpression"
      && n.callee.object?.name === "console") return;
    if (n.type === "Property" && !n.computed) {
      const k = n.key?.name ?? n.key?.value;
      if (CLAVES.has(k)) apuntar(n.value);
      if (typeof k === "string" && CODIGO_DE_TECLA.test(k)) apuntar(n.value);
    }
    if (n.type === "AssignmentExpression" && n.left?.type === "MemberExpression"
      && !n.left.computed && PROPS.has(n.left.property?.name)) apuntar(n.right);
    if (n.type === "CallExpression" && n.callee?.type === "Identifier") {
      if (LLAMADAS.has(n.callee.name)) apuntar(n.arguments[0]);
      if (n.callee.name === "suceso") apuntar(n.arguments[1]);
    }
    for (const h of hijos(n)) w(h);
  })(ast);
  return fuera;
}

/**
 * Lo que se deja pasar, con su motivo. Una lista corta a propósito: cada línea
 * de aquí es una excepción que alguien tiene que poder discutir.
 */
const PERMITIDAS = [
  // Nombres de archivo y rutas del propio proyecto.
  /^snd\//, /^build\//, /^src\//, /\.(json|wav|mdl|bsp|png|js|mjs)$/,
  // Órdenes que se escriben en la terminal y se enseñan tal cual.
  /npm run/,
  // Los nombres de las cosas del motor, que son suyos y no se traducen.
  /^(swords_|weapon_|armor_|shields_|arrows_|monsters\/|items\/|npc_)/,
  // El crédito del artista de la portada. Es un nombre propio y lleva tilde:
  // «Anders Finér». Traducirlo sería escribirle mal el nombre a alguien.
  /Anders Fin/,
];
const permitida = (t) => PERMITIDAS.some((r) => r.test(t));

test("la interfaz habla inglés (los comentarios y la documentación, español)", async (t) => {
  for (const ruta of PANTALLA) {
    await t.test(ruta, () => {
      const malas = cadenasDePantalla(ruta)
        .filter(({ texto }) => texto.trim().length > 2)
        .filter(({ texto }) => !permitida(texto))
        .filter(({ texto }) => LETRAS.test(texto) || PALABRAS.test(texto));
      assert.deepEqual(
        malas.map((m) => `${ruta}:${m.linea}  ${JSON.stringify(m.texto.slice(0, 70))}`),
        [],
        "cadenas en español que el jugador puede leer"
      );
    });
  }

  await t.test("y la prueba distingue de verdad: un texto en español se caza", () => {
    // El control positivo. Sin él, esta prueba pasaría igual de bien con la
    // expresión regular rota, y entonces lo único que diría es que se ejecuta.
    assert.ok(LETRAS.test("Hoja de personaje") || PALABRAS.test("Hoja de personaje"));
    assert.ok(PALABRAS.test("nuevo personaje"));
    assert.ok(LETRAS.test("Maná"));
    // Y no se pasa de lista con el inglés de verdad que hay en la interfaz.
    for (const bueno of [
      "Character Sheet", "You have fallen", "press a key…", "Quickslot 3",
      "no servers yet", "Weight", "Stamina", "export all", "parried!",
      "Move Forward", "Secondary Attack", "damage to",
    ]) {
      assert.ok(!LETRAS.test(bueno) && !PALABRAS.test(bueno), `falso positivo: ${bueno}`);
    }
  });
});
