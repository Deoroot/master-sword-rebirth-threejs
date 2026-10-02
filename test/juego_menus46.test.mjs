// EL 46: EL ANDAMIAJE DE MENÚ — `calleventloop`, las listas, `menu.open`,
// `menuitem.remove`, los mensajes de colores y las propiedades que faltaban.
//
// Y lo más importante de este archivo está al final, en «LOS MENÚS DE VERDAD»:
// el censo de `npm run guiones` mide **que no se encuentra ningún comando
// desconocido**, que NO es lo mismo que «el menú sale bien». Es la forma
// exacta del fallo del apartado 4 de CLAUDE.md, así que aquí se mira el
// contenido del menú, no que el guion llegara al final.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  Guion, partirGuion, GLOBALES, olvidarGlobales,
  PROPIEDADES, PROPIEDADES_VACIAS, VUELTAS_MAXIMAS,
} from "../src/play/guion.js";
import {
  Listas, buscarEnLista, olvidarListasGlobales, SIN_LISTA, FALTAN_PARAMS,
} from "../src/play/listas.js";
import { entornoDe, GuionDeNpc } from "../src/play/npcguion.js";

/** Corre un cuerpo de evento con un entorno que se puede mirar por dentro. */
function corre(cuerpo, extra = {}) {
  const visto = { sonidos: [], mensajes: [], frases: [], quitadas: [], menus: 0 };
  const entorno = {
    ...entornoDe({}),
    sonar: (a, o) => visto.sonidos.push({ a, ...o }),
    mensajeAlJugador: (q, t, cual) => visto.mensajes.push({ q, t, cual }),
    escuchar: (e, p) => visto.frases.push({ e, p }),
    quitarOpcion: (id) => visto.quitadas.push(id),
    abrirMenu: () => { visto.menus++; },
    azar: () => 0,
    ...extra,
  };
  const g = new Guion({ eventos: partirGuion(cuerpo.includes("{ ") ? cuerpo : `{ e\n${cuerpo}\n}`).eventos, entorno });
  g.llamar("e", []);
  return { guion: g, ...visto, v: (n) => g.vars.get(n) };
}

test.beforeEach(() => { olvidarGlobales(); olvidarListasGlobales(); });

// ══ CALLEVENTLOOP ══════════════════════════════════════════════════════════

describe("`calleventloop <n> <evento>`", () => {
  const BUCLE = `{ e
calleventloop 4 paso
}
{ paso
stradd SALIDA game.script.iteration
}`;

  test("da las vueltas que le pides, y la cuenta EMPIEZA EN CERO", () => {
    // `m.m_Iteration = i` con `i` de 0 a Loops-1 (scriptcmds.cpp:2301-2303), y
    // se lee `game.script.iteration` (script.cpp:4673). Un port que empezara
    // en 1 rompería todo índice de lista sacado del bucle.
    assert.equal(corre(BUCLE).v("SALIDA"), "0123");
  });

  test("cero vueltas no llama a nada", () => {
    assert.equal(corre(BUCLE.replace("calleventloop 4", "calleventloop 0")).v("SALIDA"), undefined);
  });

  test("y deja la cuenta como estaba al salir", () => {
    // `m.m_Iteration = SaveIteration` — :2320. Sin eso, un bucle dentro de
    // otro dejaría al de fuera leyendo la vuelta del de dentro.
    const r = corre(`{ e
calleventloop 2 fuera
}
{ fuera
stradd SALIDA game.script.iteration
calleventloop 2 dentro
stradd SALIDA game.script.iteration
}
{ dentro
stradd SALIDA d
}`);
    assert.equal(r.v("SALIDA"), "0dd0" + "1dd1");
  });

  test("`MSC_BREAK_LOOP` a 1 sale, y el motor lo vuelve a poner a 0", () => {
    // Thothie DEC2017_19. Es un `break` de una sola bala: si no se rearmara,
    // el siguiente bucle del mismo guion saldría en la primera vuelta.
    const r = corre(`{ e
calleventloop 9 paso
calleventloop 2 otro
}
{ paso
stradd SALIDA game.script.iteration
if game.script.iteration >= 2
setvard MSC_BREAK_LOOP 1
}
{ otro
stradd SALIDA x
}`);
    assert.equal(r.v("SALIDA"), "012xx", "sale en la 2 y el SEGUNDO bucle da sus dos vueltas");
    assert.equal(r.v("MSC_BREAK_LOOP"), "0");
  });

  test("`MSC_RESET_LOOP` reencauza el contador, y **se salta una vuelta**", () => {
    // Thothie SEP2019_08. −5 es su «apagado», y el motor lo deja puesto antes
    // de empezar (:2300).
    //
    // Y el detalle que se come una vuelta: el reencauzamiento es
    // `i = reset_to_iteration` **dentro del cuerpo del `for`**, así que el
    // `i++` de la cabecera se ejecuta detrás (:2316). Reencauzar a 0 NO vuelve
    // a la vuelta 0: vuelve a la **1**. Escribí la prueba esperando
    // «0120123» y salió «012123», que es lo que hace el motor.
    const r = corre(`{ e
calleventloop 4 paso
}
{ paso
stradd SALIDA game.script.iteration
if game.script.iteration equals 2
if !YA
setvard YA 1
setvard MSC_RESET_LOOP 0
}`);
    // 0,1,2 -> reencauza a 0, pero el `i++` lo sube a 1 -> 1,2,3
    assert.equal(r.v("SALIDA"), "012" + "123");
    assert.equal(r.v("MSC_RESET_LOOP"), "-5");
  });

  test("un bucle que no termina se CORTA y se apunta: el motor no tiene tope", () => {
    // Esto NO está en el motor y va dicho: en GoldSrc un bucle infinito cuelga
    // un servidor que alguien reinicia; en una pestaña es la pestaña muerta.
    const r = corre(`{ e
calleventloop 3 paso
}
{ paso
setvard MSC_RESET_LOOP 0
}`);
    assert.ok(r.guion.noSoportados.some((x) => x.tipo === "bucle"), "queda apuntado, no callado");
    assert.ok(VUELTAS_MAXIMAS > 0);
  });

  test("los parámetros de detrás llegan como PARAM1", () => {
    const r = corre(`{ e
calleventloop 2 paso hola
}
{ paso
stradd SALIDA PARAM1
}`);
    assert.equal(r.v("SALIDA"), "holahola");
  });
});

// ══ LAS MATEMÁTICAS QUE FALTABAN ═══════════════════════════════════════════

describe("`multiply`, `divide`, `mod` y `dec`", () => {
  test("los cuatro, con sus dos decimales", () => {
    // `ScriptCmd_MathSet` — scriptcmds.cpp:4200-4227. Con dos parámetros el
    // motor escribe «%.2f», que es por lo que los guiones pasan por `$int`.
    const r = corre([
      "setvard A 7", "multiply A 3",
      "setvard B 7", "divide B 2",
      "setvard C 7", "mod C 4",
      "setvard D 7", "dec D 2",
    ].join("\n"));
    assert.equal(r.v("A"), "21.00");
    assert.equal(r.v("B"), "3.50");
    assert.equal(r.v("C"), "3.00");
    assert.equal(r.v("D"), "5.00");
  });

  test("DIVIDIR ENTRE CERO no da cero ni error: deja el valor como estaba", () => {
    // `else if (Operation == 3 && Amount) flValue /= Amount;` — :4217. Sin
    // `Amount` no entra en ninguna rama, y `flValue` (que es `Params[0]`) se
    // escribe igual. Un port con un `/0` daría `Infinity` y el guion seguiría.
    assert.equal(corre("setvard A 7\ndivide A 0").v("A"), "7.00");
    assert.equal(corre("setvard A 7\nmod A 0").v("A"), "7.00");
  });

  test("`mod` corta a entero LOS DOS lados", () => {
    // `(int)flValue % (int)Amount` — :4219.
    assert.equal(corre("setvard A 7.9\nmod A 2.9").v("A"), "1.00");
  });

  test("con un tercer parámetro se escribe con toda la precisión", () => {
    // `full`, :4223-4225. Y da igual qué diga el tercero: sólo cuenta que esté.
    assert.equal(corre("setvard A 1\ndivide A 3 full").v("A"), String(1 / 3));
    assert.equal(corre("setvard A 1\ndivide A 3 loquesea").v("A"), String(1 / 3));
  });

  test("`capvar` NO escribe cuando el valor ya está dentro", () => {
    // Son dos `if` sueltos, no un `clamp` — scriptcmds.cpp:2336-2338. Una
    // variable que no existe y cae «dentro» se queda sin existir.
    assert.equal(corre("setvard A 5\ncapvar A 0 10").v("A"), "5", "sin tocar: sigue «5», no «5.00»");
    assert.equal(corre("setvard A 50\ncapvar A 0 10").v("A"), "10");
    assert.equal(corre("capvar NO_EXISTE 0 10").v("NO_EXISTE"), undefined);
  });
});

// ══ LAS LISTAS ═════════════════════════════════════════════════════════════

describe("`array.*`, la estructura de datos que le faltaba al lenguaje", () => {
  test("`array.create` sobre una que ya existe NO la vacía", () => {
    // «does nothing if a same-name array already exists» — scriptcmds.cpp:1953.
    // Al revés que `npcstore.create`, que sí la reutiliza pero se documenta.
    const r = corre("array.create L\narray.add L a\narray.create L\narray.add L b\nsetvard N $get_array_amt(L)");
    assert.equal(r.v("N"), "2");
  });

  test("`array.add` sobre una que no existe se queja y no la crea", () => {
    // «Attempting %s on non-existant array» — :1961.
    const r = corre("array.add L a\nsetvard N $get_array_amt(L)");
    assert.equal(r.v("N"), "-1");
    assert.ok(r.guion.noSoportados.some((x) => x.tipo === "lista"));
  });

  test("`add_unique` no repite", () => {
    const r = corre("array.create L\narray.add_unique L a\narray.add_unique L a\nsetvard N $get_array_amt(L)");
    assert.equal(r.v("N"), "1");
  });

  test("`set` y `del` FUERA DE RANGO no hacen nada, ni siquiera fallar", () => {
    // :2036-2068: el motor imprime un error y sigue. Un port con un `splice`
    // suelto borraría el último en vez de ninguno.
    const r = corre([
      "array.create L", "array.add L a", "array.add L b",
      "array.set L 9 x", "array.del L -1",
      "setvard N $get_array_amt(L)", "setvard P $get_array(L,1)",
    ].join("\n"));
    assert.equal(r.v("N"), "2");
    assert.equal(r.v("P"), "b");
  });

  test("`erase` se lleva la lista; `clear` la deja vacía pero EXISTIENDO", () => {
    // Son dos cosas y se confunden: después de `clear` un `array.add` funciona
    // y después de `erase` se queja. :2072-2079.
    assert.equal(corre("array.create L\narray.add L a\narray.clear L\nsetvard N $get_array_amt(L)").v("N"), "0");
    assert.equal(corre("array.create L\narray.add L a\narray.erase L\nsetvard N $get_array_amt(L)").v("N"), "-1");
  });

  test("`copy` AÑADE al destino, no lo reemplaza", () => {
    // `for(...) pLocalArray->add((*pArray)[i])` — :2003-2006.
    const r = corre([
      "array.create A", "array.add A 1",
      "array.create B", "array.add B 9",
      "array.copy A B", "setvard N $get_array_amt(B)", "setvard P $get_array(B,0)",
    ].join("\n"));
    assert.equal(r.v("N"), "2");
    assert.equal(r.v("P"), "9", "lo de antes sigue primero");
  });

  test("las `g_array.*` son de TODOS los guiones, como `setvarg`", () => {
    corre("g_array.create G\ng_array.add G hola");
    const otro = corre("setvard X $get_g_array_amt(G)");
    // Ojo: el nombre del getter global es `$g_get_array_amt`, no
    // `$get_g_array_amt` — el prefijo va delante del todo (script.cpp:129).
    // Y un getter que no existe **devuelve su propio texto**, que es lo que
    // hace que una condición rota dé cierto en vez de fallar (script.cpp:4741).
    assert.equal(otro.v("X"), "$get_g_array_amt(G)", "escrito al revés no es un getter");
    assert.equal(corre("setvard X $g_get_array_amt(G)").v("X"), "1");
  });
});

describe("los getters de listas, que NO contestan lo mismo cuando falta la lista", () => {
  test("cada uno su valor: −1, 0, y la cadena de error", () => {
    // script.cpp:1248-1268. Los guiones comparan contra estos textos.
    const r = corre([
      "setvard A $get_array_amt(NADA)",
      "setvard B $get_array_exists(NADA)",
      "setvard C $get_arrayfind(NADA,x)",
    ].join("\n"));
    assert.equal(r.v("A"), "-1");
    assert.equal(r.v("B"), "0");
    assert.equal(r.v("C"), SIN_LISTA);
    assert.equal(SIN_LISTA, "[ERROR_NO_ARRAY]");
  });

  test("y con la lista puesta, `find` que no encuentra es −1, no la cadena", () => {
    const r = corre("array.create L\narray.add L a\nsetvard C $get_arrayfind(L,zzz)");
    assert.equal(r.v("C"), "-1");
  });

  test("`$get_array` FUERA DE RANGO devuelve su propio texto", () => {
    // El caso que más sorprende. El motor cae hasta `return FullName` y
    // Thothie lo dejó documentado como «screwy, but servicable»
    // (script.cpp:1276). Devolver «-1» o vacío sería otro juego.
    const r = corre("array.create L\narray.add L a\nsetvard X $get_array(L,9)");
    assert.equal(r.v("X"), "$get_array(L,9)");
  });

  test("el tercer parámetro de `find` es el TIPO o, si no lo reconoce, el ÍNDICE", () => {
    // `else { vSrchType = 3; --vParam; }  // Reset to get start index`
    //                                      script.cpp:1303
    const base = "array.create L\narray.add L aa\narray.add L bb\narray.add L aa\n";
    assert.equal(corre(`${base}setvard X $get_arrayfind(L,aa)`).v("X"), "0");
    // «3» no es un tipo: se lee como «desde el 3», y desde ahí no hay nada.
    assert.equal(corre(`${base}setvard X $get_arrayfind(L,aa,2)`).v("X"), "2");
    assert.equal(corre(`${base}setvard X $get_arrayfind(L,a,startswith)`).v("X"), "0");
    assert.equal(corre(`${base}setvard X $get_arrayfind(L,b,contains,1)`).v("X"), "1");
  });

  test("`buscarEnLista` sin lista devuelve −1 y no lanza", () => {
    assert.equal(buscarEnLista(null, { que: "x" }), -1);
  });

  test("sin parámetros, la cadena de parámetros que faltan", () => {
    assert.equal(FALTAN_PARAMS, "[ERROR_MISSING_PARAMS]");
    assert.equal(new Listas().buscar("x"), null);
  });
});

// ══ EL MENÚ, LA CHARLA Y LOS MENSAJES ══════════════════════════════════════

describe("`menuitem.remove`, que quita por ID y quita TODAS", () => {
  test("todas las que compartan id, no sólo la primera", () => {
    // «Erase _all_ with this name. Makes erasing big menus easy» —
    // npcscript.cpp:1010, con su `Menuoptions.erase(i--)`.
    const g = new GuionDeNpc({ ficha: { eventos: [] }, npc: { nombre: "n" } });
    g.anotar({ id: "a", titulo: "1", prioridad: 0 });
    g.anotar({ id: "b", titulo: "2", prioridad: 0 });
    g.anotar({ id: "a", titulo: "3", prioridad: 0 });
    assert.equal(g.quitar("a"), 2);
    assert.deepEqual(g.opciones.map((o) => o.titulo), ["2"]);
  });

  test("quitar un id que no está no rompe nada", () => {
    const g = new GuionDeNpc({ ficha: { eventos: [] }, npc: { nombre: "n" } });
    assert.equal(g.quitar("no"), 0);
  });
});

describe("`menu.open`, y su silencio", () => {
  const abre = (objetos) => {
    let abierto = false;
    const e = entornoDe({ jugador: { ref: "p", personaje: { objetos }, origen: "0" } });
    e.abrirMenu("p");
    abierto = e.menuPedido === true;
    return abierto;
  };

  test("con sitio en la mochila, abre", () => {
    assert.equal(abre([]), true);
  });

  test("con la mochila LLENA no abre Y NO DICE POR QUÉ", () => {
    // El aviso que lo explicaría **está comentado en el motor**
    // (npcscript.cpp:1028-1032), así que el NPC se queda callado. Es un
    // silencio del juego, no nuestro, y por eso se porta.
    assert.equal(abre(new Array(50).fill({ id: "x" })), false);
  });

  test("a alguien que no es el jugador, nada", () => {
    const e = entornoDe({});
    e.abrirMenu("otro");
    assert.notEqual(e.menuPedido, true);
  });
});

describe("`catchspeech` y los mensajes de colores", () => {
  test("`catchspeech` guarda el evento y todas sus palabras", () => {
    const r = corre("catchspeech say_hi hi hello hail");
    assert.deepEqual(r.frases, [{ e: "say_hi", p: ["hi", "hello", "hail"] }]);
  });

  test("con una sola palabra no registra: la rama pide dos", () => {
    // `if (Params.size() >= 2)` — npcscript.cpp:695.
    assert.deepEqual(corre("catchspeech say_hi").frases, []);
  });

  test("los mensajes juntan las palabras con UN espacio", () => {
    // `if (i) sTemp += " "; sTemp += Params[i + 1];` — scriptcmds.cpp:4256.
    const r = corre("gplayermessage ent_player hola que tal");
    assert.equal(r.mensajes[0].t, "hola que tal");
    assert.equal(r.mensajes[0].cual, "gplayermessage");
  });

  test("y se cortan a 140 con un asterisco, porque el límite es 192", () => {
    // Thothie MAR2008a — :4262-4267.
    const largo = "x".repeat(200);
    const r = corre(`gplayermessage ent_player ${largo}`);
    assert.equal(r.mensajes[0].t, `${"x".repeat(140)}*\n`);
  });

  test("el color se decide por el NOMBRE del comando, que es lo único que cambia", () => {
    // Los seis son `ScriptCmd_Message` — scriptcmds.cpp:4243.
    const e = entornoDe({ jugador: { ref: "p", personaje: {}, origen: "0" }, suceso: (t, x) => vistos.push([t, x]) });
    const vistos = [];
    e.mensajeAlJugador("p", "a", "gplayermessage");
    e.mensajeAlJugador("p", "b", "rplayermessage");
    e.mensajeAlJugador("p", "c", "playermessage");
    assert.deepEqual(vistos.map((v) => v[0]), ["bueno", "nopuedes", "normal"]);
  });
});

// ══ EL `playsound` QUE ESTABA MAL DESDE EL 43 ══════════════════════════════

describe("`playsound`: CORRECCIÓN del 43, no había entidad delante", () => {
  test("la forma nueva: canal, volumen de 0 a 10, archivo", () => {
    // `playsound 0 10 ambience/x.wav`. El volumen se DIVIDE ENTRE 10
    // (scriptcmds.cpp:4706) y el port del 43 lo leía como si el primer
    // parámetro fuera una entidad.
    const r = corre("playsound 0 10 ambience/alien_humongo.wav");
    assert.equal(r.sonidos[0].a, "ambience/alien_humongo.wav");
    assert.equal(r.sonidos[0].canal, 0);
    assert.equal(r.sonidos[0].volumen, 1);
  });

  test("la forma VIEJA sigue valiendo: canal y archivo, sin volumen", () => {
    // `isdigit(Params[1].c_str()[0])` — :4704. Las dos formas están en los
    // guiones de hoy, así que las dos tienen que funcionar.
    const r = corre("playsound 0 sonidos/idle1.wav");
    assert.equal(r.sonidos[0].a, "sonidos/idle1.wav");
    assert.equal(r.sonidos[0].volumen, null);
  });

  test("el volumen está topado a 1, por un fallo viejo que lo dejaba por encima", () => {
    // «Thothie - AUG2007a - Weirdness causing volume to be > 10 sometimes».
    assert.equal(corre("playsound 0 90 x.wav").sonidos[0].volumen, 1);
  });

  test("VOLUMEN 0 NO ES SILENCIO: es «corta ese canal»", () => {
    // :4775. Es como se paran los sonidos en bucle, y leerlo como silencio
    // dejaría un bucle sonando para siempre.
    const r = corre("playsound 3 0 x.wav");
    assert.equal(r.sonidos[0].corta, true);
  });

  test("un sonido llamado `none` se salta entero", () => {
    // `if (!FStrEq(pszSound, "none"))` — :4751.
    assert.deepEqual(corre("playsound 0 10 none").sonidos, []);
  });

  test("con un solo parámetro no hace nada: la rama pide dos", () => {
    assert.deepEqual(corre("playsound 0").sonidos, []);
  });

  test("`playrandomsound` elige de la parte de la lista que son archivos", () => {
    // `Params[NextParm + RANDOM_LONG(0, Params.size() - (Volume > -1 ? 3 : 2))]`
    //                                      scriptcmds.cpp:4731
    // Con el dado a cero sale el primero; con el dado al tope, el último.
    const linea = "playrandomsound 0 10 a.wav b.wav c.wav";
    assert.equal(corre(linea, { azar: () => 0 }).sonidos[0].a, "a.wav");
    assert.equal(corre(linea, { azar: (_lo, hi) => hi }).sonidos[0].a, "c.wav");
  });

  test("y sin volumen también: el hueco se corre solo", () => {
    const linea = "playrandomsound 0 a.wav b.wav";
    assert.equal(corre(linea, { azar: () => 0 }).sonidos[0].a, "a.wav");
    assert.equal(corre(linea, { azar: (_lo, hi) => hi }).sonidos[0].a, "b.wav");
  });
});

// ══ LAS PROPIEDADES ════════════════════════════════════════════════════════

describe("las propiedades de `$get`, y las dos que el motor deja en cero", () => {
  const conJugador = (personaje, npc) => entornoDe({
    npc, jugador: { ref: "p", personaje, origen: personaje?.origen ?? "0" },
  });

  test("`maxhp` DE UN JUGADOR es «0», y por eso el guardarropa es gratis", () => {
    // La rama vive dentro de `else if (pMonster)` (scriptcmds.cpp:1388-1391),
    // así que con un jugador delante no casa nada y sale «0» por :1688.
    //
    // `NPCs/base_storage.script:150` hace `setvard USE_FEE $get(PARAM1,maxhp)`
    // con PARAM1 = el jugador. La tarifa del guardarropa de Gate City es cero
    // en el juego de verdad. Devolver aquí la vida máxima sería cobrar un
    // dinero que el original no cobra.
    assert.equal(conJugador({ vida: 80, vidaMax: 120 }).propiedad("p", "maxhp"), "0");
  });

  test("pero `hp` sí contesta, que es otra rama", () => {
    assert.equal(conJugador({ vida: 80 }).propiedad("p", "hp"), "80");
  });

  test("`strength` NO EXISTE en todo el motor, y por eso vale siempre cero", () => {
    // Y `base_npc_vendor_confirm.script:87` hace
    // `if ( $get(PARAM1,strength) < 10 )`, que por tanto es SIEMPRE cierto.
    // Va en `PROPIEDADES_VACIAS` y no en `PROPIEDADES` porque no es que no la
    // sepamos contestar: es que contestar «0» ES portarla.
    assert.ok(PROPIEDADES_VACIAS.has("strength"));
    assert.ok(!PROPIEDADES.has("strength"));
    const r = corre("setvard X $get(ent_player,strength)");
    assert.equal(r.v("X"), "0");
    assert.equal(r.guion.noSoportados.length, 0, "y NO se apunta como hueco");
  });

  test("una propiedad que de verdad no tenemos SÍ se apunta", () => {
    // El control positivo de la de arriba: sin él, «no se apuntó» no
    // significaría nada.
    const r = corre("setvard X $get(ent_player,lasthitgroup)");
    assert.ok(r.guion.noSoportados.some((x) => x.tipo === "propiedad"));
  });

  test("`dist` mide en unidades del motor, y `dist2D` se olvida de la altura", () => {
    const e = conJugador({ origen: "0 0 100" }, { origen: "0 30 60" });
    assert.equal(Math.round(Number(e.propiedad("p", "dist"))), 50);
    assert.equal(Math.round(Number(e.propiedad("p", "dist2D"))), 30);
  });

  test("`range` y `dist` son el MISMO número", () => {
    // :1151 — las dos entran por la misma rama.
    const e = conJugador({ origen: "0 0 100" }, { origen: "0 30 60" });
    assert.equal(e.propiedad("p", "range"), e.propiedad("p", "dist"));
  });

  test("sin origen, cero, y no NaN", () => {
    assert.equal(conJugador({}, {}).propiedad("p", "dist"), "0");
  });
});

// ══ LOS MENÚS DE VERDAD ════════════════════════════════════════════════════
//
// El censo de `npm run guiones` dice «cabe entero», que significa «no se
// encontró ningún comando desconocido». **No significa que el menú salga
// bien**, y confundir esas dos cosas es exactamente el fallo del apartado 4 de
// CLAUDE.md. Estas comprobaciones miran el CONTENIDO.

describe("los cinco NPC de Gate City, con su menú de verdad", () => {
  const ficheros = (() => {
    try { return JSON.parse(readFileSync("build/gatecity/guiones.json", "utf8")).guiones; }
    catch { return null; }
  })();
  const hay = Boolean(ficheros);

  /** Abre el menú de un NPC como lo abre el juego. */
  function menuDe(script, personaje = { nombre: "Sonda", vida: 100, oro: 50, objetos: [], manos: {} }) {
    const g = new GuionDeNpc({ ficha: ficheros[script], npc: { nombre: script, script } });
    return { opciones: g.pedirOpciones({ personaje, ref: "jugador1" }), guion: g };
  }

  test("hay guiones horneados: si no, esto no mide nada", { skip: !hay }, () => {
    // El control positivo del archivo entero. Sin `npm run guiones` corrido,
    // todo lo de abajo se salta y un salto silencioso es un cero sin control.
    assert.ok(ficheros["gatecity/mayor"], "falta `npm run guiones`");
  });

  test("el alcalde ofrece las tres de `base_chat` y ninguna más sin la cabeza",
    { skip: !hay }, () => {
      assert.deepEqual(menuDe("gatecity/mayor").opciones.map((o) => o.titulo),
        ["Hail", "Ask about Jobs", "Ask about Rumors"]);
    });

  test("el armero NO ofrece «Ask about Rumors», porque tiene `const NO_RUMOR 1`",
    { skip: !hay }, () => {
      const t = menuDe("gatecity/armorer").opciones.map((o) => o.titulo);
      assert.deepEqual(t, ["Hail", "Ask about Jobs", "Shop"]);
      assert.ok(!t.includes("Ask about Rumors"));
    });

  test("el vendedor NO ofrece nada de charla, porque tiene `const NO_CHAT 1`",
    { skip: !hay }, () => {
      const t = menuDe("gatecity/vendor").opciones.map((o) => o.titulo);
      assert.ok(!t.includes("Hail"));
    });

  test("y ofrece «Shop» CUATRO VECES, que es lo que hace el juego", { skip: !hay }, () => {
    // No es un fallo del puerto: es del CONTENIDO. `gatecity/vendor.script`
    // copia tal cual el `game_menu_getoptions` y el `vendor_addstoremenu` de
    // `monsters/base_npc_vendor`, que ya viene por el `#include` de su línea
    // 22. Con dos eventos de cada nombre y `RunScriptEventByName` ejecutando
    // TODOS los que se llamen igual (script.cpp:5836), salen 2 × 2 = 4.
    // `menuitem.register` no mira el id y no deduplica (npcscript.cpp:940-999).
    const t = menuDe("gatecity/vendor").opciones.map((o) => o.titulo);
    assert.deepEqual(t, ["Shop", "Shop", "Shop", "Shop"]);
  });

  test("el guardarropa ofrece su chatarrería y su pergamino", { skip: !hay }, () => {
    const t = menuDe("gatecity/storage").opciones.map((o) => o.titulo);
    assert.ok(t.includes("Hail"));
    assert.ok(t.some((x) => x.includes("Wondrous Scroll")));
  });

  test("y los cinco llegan al final SIN encontrar un comando desconocido",
    { skip: !hay }, () => {
      // Esto es lo que mide el censo, y va DEBAJO de las de arriba a
      // propósito: es la condición débil. Se comprueba sobre el menú, no sobre
      // el `game_spawn`, que sí usa comandos de modelo que no están portados.
      for (const s of ["mayor", "kendra", "storage", "vendor", "armorer"]) {
        const g = new GuionDeNpc({ ficha: ficheros[`gatecity/${s}`], npc: { nombre: s, script: s } });
        // `game_spawn` ya ha corrido y SÍ usa cosas que no están —`setmodel`,
        // `$get_takedmg`—; lo que se mide aquí es sólo el menú, así que se
        // parte de lo que había apuntado justo antes de pedirlo.
        const antes = g.noSoportados.length;
        g.pedirOpciones({ personaje: { nombre: "Sonda", vida: 100, oro: 50, objetos: [], manos: {} }, ref: "jugador1" });
        // Los de tipo «evento» NO cuentan, y no es una excusa: `base_chat`
        // llama a `bchat_before_menus` y `bchat_after_menus` **a propósito**,
        // para que el guion que lo incluya los defina si quiere. En el motor,
        // llamar a un evento que no existe no hace nada y no avisa (sólo la
        // forma con retardo se queja, scriptcmds.cpp:2288). Son ganchos
        // vacíos, no huecos, y el censo tampoco los cuenta.
        const huecos = g.noSoportados.slice(antes).filter((x) => x.tipo !== "evento");
        assert.deepEqual(huecos, [], `${s} pide algo que no tenemos EN EL MENÚ`);
      }
    });
});

test("limpieza", () => {
  olvidarGlobales();
  olvidarListasGlobales();
  assert.equal(GLOBALES.size, 0);
});
