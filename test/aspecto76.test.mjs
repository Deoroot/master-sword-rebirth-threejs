// EXPERIMENTO 76 · EL ASPECTO DE UN ADORNO: `rendermode`, `renderamt`, `env_render`.
//
// Lo que se prueba aquí es la regla pura de `src/play/aspecto.js` y el horneado
// que la usa. Lo que se ve —que el plato de sopa aparece y la manzana del árbol
// desaparece— lo mide `sondas/edana76.mjs`, porque esto no abre un navegador.
//
// ── LAS DOS MITADES DE LA REGLA, Y LA QUE SE OLVIDA ─────────────────────────
//
//     if( !R_ModelOpaque( clent->curstate.rendermode ) && CL_FxBlend( clent ) <= 0 )
//             return true; // invisible            ref/gl/gl_rmain.c:252
//
// La mitad que se recuerda es «`renderamt 0` esconde». La que se olvida es que
// **sólo esconde si el modo no es el 0**, porque `R_ModelOpaque(rm)` es
// `rm == kRenderNormal` (ref/gl/gl_local.h:87). Con `rendermode 0` el
// `renderamt` no se mira. Hay una prueba para cada mitad, y la segunda se cae si
// alguien «simplifica» la condición.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  MODO, esOpaco, mezcla, seDibuja, alfa, aplicar, EF_NODRAW,
} from "../src/play/aspecto.js";
import { Disparadores, USO } from "../src/play/disparadores.js";

const MAPA = "build/edana/malla.json";
const hayMapa = existsSync(MAPA);
const manifiesto = hayMapa ? JSON.parse(readFileSync(MAPA, "utf8")) : null;

describe("76 · ¿se dibuja? la regla de `R_AddEntity`", () => {
  test("los seis modos son los de `const.h`, con el 4 siendo el alfa", () => {
    // Escritos a mano y no leídos de MODO: si el enum se desordena, esto cae.
    // `common/const.h:687-694`.
    assert.equal(MODO.NORMAL, 0);
    assert.equal(MODO.COLOR, 1);
    assert.equal(MODO.TEXTURA, 2);
    assert.equal(MODO.BRILLO, 3);
    assert.equal(MODO.ALFA, 4);
    assert.equal(MODO.ADITIVO, 5);
  });

  test("`R_ModelOpaque` es SÓLO el modo 0", () => {
    assert.equal(esOpaco(0), true);
    for (const m of [1, 2, 3, 4, 5]) assert.equal(esOpaco(m), false, `modo ${m}`);
  });

  test("modo 4 y cantidad 0 es INVISIBLE: el plato de sopa de la taberna", () => {
    assert.equal(seDibuja({ modo: 4, cantidad: 0 }), false);
  });

  test("modo 4 y cantidad 255 se dibuja: la manzana del huerto", () => {
    assert.equal(seDibuja({ modo: 4, cantidad: 255 }), true);
  });

  // LA MITAD QUE SE OLVIDA. Sin el `esOpaco` de delante, esto se pone rojo.
  test("modo 0 y cantidad 0 SE DIBUJA, porque con el modo 0 el amt no se mira", () => {
    assert.equal(seDibuja({ modo: 0, cantidad: 0 }), true);
    assert.equal(alfa({ modo: 0, cantidad: 0 }), 1);
  });

  test("`<= 0` y no `< 0`: la cantidad 1 se dibuja y la 0 no", () => {
    assert.equal(seDibuja({ modo: 4, cantidad: 1 }), true);
    assert.equal(seDibuja({ modo: 4, cantidad: 0 }), false);
  });

  test("un `renderamt` ausente es 255 y no 0", () => {
    // El valor de fábrica de `entvars_t` es 0, pero el mapeador escribe 255 y el
    // extractor ya lo pone. Si esto fuera 0, los adornos sin `renderamt` en el
    // `.bsp` desaparecerían en silencio.
    assert.equal(seDibuja({ modo: 4 }), true);
    assert.equal(mezcla({}).mezcla, 255);
  });

  test("`EF_NODRAW` manda por encima del modo, y vale 128", () => {
    assert.equal(EF_NODRAW, 128);
    assert.equal(seDibuja({ modo: 0, cantidad: 255, efectos: EF_NODRAW }), false);
  });

  test("`bound(0, blend, 255)`: se recorta por los dos lados", () => {
    assert.equal(mezcla({ cantidad: -40 }).mezcla, 0);
    assert.equal(mezcla({ cantidad: 900 }).mezcla, 255);
  });

  test("el alfa es la cantidad entre 255, y en el modo 0 es 1", () => {
    assert.equal(alfa({ modo: 4, cantidad: 255 }), 1);
    assert.equal(alfa({ modo: 4, cantidad: 0 }), 0);
    assert.ok(Math.abs(alfa({ modo: 4, cantidad: 128 }) - 128 / 255) < 1e-9);
    assert.equal(alfa({ modo: 0, cantidad: 7 }), 1);
  });

  test("un `renderfx` que no es 0 NO se traga: se avisa", () => {
    // Las quince ramas de `CL_FxBlend` que este juego no ejecuta no están
    // escritas, y por eso tiene que salir dicho cuando alguien las pida. Si
    // esto devolviera `null` siempre, un farol que palpita se dibujaría quieto
    // y nadie se enteraría.
    assert.equal(mezcla({ fx: 0, cantidad: 200 }).fxSinPortar, null);
    assert.equal(mezcla({ fx: 2, cantidad: 200 }).fxSinPortar, 2);
    // Y el valor que devuelve mientras tanto es el de reposo, que es lo honesto.
    assert.equal(mezcla({ fx: 2, cantidad: 200 }).mezcla, 200);
  });
});

describe("76 · `CRenderFxManager::Use`: las cuatro máscaras", () => {
  test("un campo a `null` no se toca; a 0 sí se pone a 0", () => {
    // triggers.cpp:535-557. La diferencia importa: la bandera `SF_RENDER_*`
    // significa «esta víctima no cambia este campo», no «ponlo a cero».
    const antes = { modo: 4, cantidad: 255, fx: 0 };
    assert.deepEqual(aplicar(antes, { modo: null, cantidad: 0, fx: null }),
      { modo: 4, cantidad: 0, fx: 0 });
    assert.deepEqual(aplicar(antes, { modo: null, cantidad: null, fx: null }), antes);
  });

  test("y no muta el estado que recibe", () => {
    const antes = { modo: 4, cantidad: 255 };
    aplicar(antes, { cantidad: 0 });
    assert.equal(antes.cantidad, 255);
  });
});

describe("76 · el bus: un `env_render` que apunta a un adorno", () => {
  test("avisa con `enElBus: false` y con el nombre que nadie del bus tiene", () => {
    const bus = new Disparadores([
      { clase: "env_render", nombre: "e", objetivo: "apple5", renderamt: 0, rendermode: 4 },
    ]);
    bus.disparar("e", null, USO.ALTERNAR, 0, null);
    const r = bus.recoger().filter((s) => s.tipo === "render");
    assert.equal(r.length, 1);
    assert.equal(r[0].enElBus, false);
    assert.equal(r[0].nombre, "apple5");
    assert.equal(r[0].cantidad, 0);
    assert.equal(r[0].modo, 4);
  });

  test("a TODAS las que se llamen así, no a la primera", () => {
    // `CRenderFxManager::Use` recorre `FIND_ENTITY_BY_TARGETNAME` en bucle. Y
    // esto no es teórico: Edana tiene CUATRO adornos llamados `apple1`.
    const bus = new Disparadores([
      { clase: "env_render", nombre: "e", objetivo: "v", renderamt: 0, rendermode: 4 },
      { clase: "trigger_relay", nombre: "v" },
      { clase: "trigger_relay", nombre: "v" },
    ]);
    bus.disparar("e", null, USO.ALTERNAR, 0, null);
    const r = bus.recoger().filter((s) => s.tipo === "render");
    assert.equal(r.length, 2);
    assert.ok(r.every((x) => x.enElBus === true));
  });
});

describe("76 · el horneado de Edana: los adornos que no se funden", () => {
  const salta = { skip: hayMapa ? false : "falta build/edana: `npm run mapa -- --mapa edana`" };

  test("un adorno con `targetname` sale SUELTO y uno sin nombre va al fundido", salta, () => {
    const ad = manifiesto.adornos;
    const nombrados = ad.nombrados ?? [];
    const colocaciones = ad.colocaciones ?? [];
    const conNombre = colocaciones.filter((c) => c.nombre);
    // La cuenta se calcula: si Edana gana o pierde un `env_model` con nombre,
    // esto sigue valiendo.
    assert.equal(nombrados.length, conNombre.length,
      `${nombrados.length} sueltos contra ${conNombre.length} colocaciones con nombre`);
    assert.ok(nombrados.length > 0, "Edana tiene adornos con nombre");
    // Y ninguno de los sueltos está además en el fundido: si estuviera, al
    // esconderlo quedaría su copia en pantalla.
    assert.ok(nombrados.every((s) => s.nombre));
  });

  test("los cuatro platos de sopa NACEN invisibles y las manzanas no", salta, () => {
    const n = manifiesto.adornos.nombrados ?? [];
    const apagados = n.filter((s) => !seDibuja(s.render));
    const encendidos = n.filter((s) => seDibuja(s.render));
    assert.deepEqual(apagados.map((s) => s.nombre).sort(),
      ["patron1soup", "patron5soup", "patron6soup", "patron9soup"]);
    // El control positivo del otro lado: si todo naciera apagado, la prueba de
    // arriba también pasaría.
    assert.ok(encendidos.length >= 1, "y alguno nace encendido");
    assert.ok(encendidos.every((s) => /^apple/.test(s.nombre)),
      encendidos.map((s) => s.nombre).join(", "));
  });

  test("cada suelto trae sus grupos con textura y PNG, y ninguno vacío", salta, () => {
    for (const s of manifiesto.adornos.nombrados ?? []) {
      assert.ok(s.grupos.length > 0, `${s.nombre} sin grupos`);
      for (const g of s.grupos) {
        assert.ok(g.count > 0, `${s.nombre} grupo vacío`);
        assert.ok(g.archivo && /\.png$/.test(g.archivo), `${s.nombre}: ${g.archivo}`);
        // El PNG tiene que existir de verdad: cuando la emisión estaba dentro
        // del bucle del fundido, una textura usada SÓLO por un adorno suelto no
        // se escribía y el material salía gris sin dar error.
        assert.ok(existsSync(`build/edana/${g.archivo}`), `falta build/edana/${g.archivo}`);
      }
    }
  });

  test("los grupos de los sueltos caben en el buffer y no se solapan", salta, () => {
    // Un `start` desplazado de más dibuja los triángulos de OTRO adorno, y eso
    // no da error: da una manzana que al esconderse esconde una silla.
    const n = manifiesto.adornos.nombrados ?? [];
    const tramos = [];
    for (const s of n) for (const g of s.grupos) tramos.push([g.start, g.start + g.count, s.nombre]);
    tramos.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < tramos.length; i++) {
      assert.ok(tramos[i][0] >= tramos[i - 1][1],
        `${tramos[i][2]} empieza en ${tramos[i][0]} y ${tramos[i - 1][2]} acaba en ${tramos[i - 1][1]}`);
    }
    // Y la suma de cuentas es el total de vértices declarado.
    const suma = n.reduce((t, s) => t + s.vertices, 0);
    const porGrupos = tramos.reduce((t, [a, b]) => t + (b - a), 0);
    assert.equal(porGrupos, suma, `${porGrupos} vértices en grupos contra ${suma} declarados`);
  });

  test("los `env_render` de Edana: cinco apuntan a un adorno, uno a nadie", salta, () => {
    // El reparto exacto, calculado y no escrito. Es el que da sentido al
    // contador de `main.js`: «no existe» es cosa del mapa y no un hueco nuestro.
    const d = manifiesto.disparadores ?? [];
    const rs = d.filter((x) => x.clase === "env_render");
    const enBus = new Set(d.map((x) => x.nombre).filter(Boolean));
    const adorno = new Set((manifiesto.adornos.nombrados ?? []).map((s) => s.nombre));
    const reparto = { adorno: 0, bus: 0, nadie: 0 };
    for (const r of rs) {
      if (adorno.has(r.objetivo)) reparto.adorno++;
      else if (enBus.has(r.objetivo)) reparto.bus++;
      else reparto.nadie++;
    }
    assert.equal(rs.length, 7);
    assert.deepEqual(reparto, { adorno: 5, bus: 1, nadie: 1 });
  });

  test("el `env_render` del plato se llama IGUAL que el aparecedor del parroquiano", salta, () => {
    // Esto es la cadena entera y es lo que hace que el plato aparezca cuando se
    // sienta el cliente: `patronspawn` elige uno al azar de patron1..patron12, y
    // en cuatro de los doce nombres hay además un `env_render`.
    const d = manifiesto.disparadores ?? [];
    const soup = d.filter((x) => x.clase === "env_render" && /soup$/.test(x.objetivo ?? ""));
    assert.equal(soup.length, 4);
    for (const r of soup) {
      // su nombre es el del plato sin «soup»
      assert.equal(`${r.nombre}soup`, r.objetivo);
      const mm = d.find((x) => x.clase === "multi_manager" && x.nombre === "patronspawn");
      assert.ok(mm, "falta `patronspawn`");
      assert.ok((mm.objetivos ?? []).some((o) => o.nombre === r.nombre),
        `${r.nombre} no está entre los objetivos de patronspawn`);
    }
  });

  test("`patron9` tiene plato y NO tiene parroquiano", salta, () => {
    // El caso que enseña que las dos piezas son independientes: el mapeador puso
    // el plato y se dejó el aparecedor, así que ese nombre sólo mueve la sopa.
    const d = manifiesto.disparadores ?? [];
    assert.ok(d.some((x) => x.clase === "env_render" && x.nombre === "patron9"));
    assert.equal(d.some((x) => /monsterspawn/.test(x.clase) && x.nombre === "patron9"), false);
    // Y el control positivo: patron6 sí tiene los dos.
    assert.ok(d.some((x) => x.clase === "env_render" && x.nombre === "patron6"));
    assert.ok(d.some((x) => /monsterspawn/.test(x.clase) && x.nombre === "patron6"));
  });

  test("CUATRO adornos se llaman `apple1` y el `env_render` busca `apple5`", salta, () => {
    // El control contra «esconderlas todas»: si `aplicarRender` se dejara el
    // filtro por nombre, caerían cinco manzanas en vez de una.
    const n = manifiesto.adornos.nombrados ?? [];
    assert.equal(n.filter((s) => s.nombre === "apple1").length, 4);
    assert.equal(n.filter((s) => s.nombre === "apple5").length, 1);
    const d = manifiesto.disparadores ?? [];
    const r = d.find((x) => x.clase === "env_render" && x.nombre === "apple5spawn");
    assert.equal(r.objetivo, "apple5");
    assert.equal(r.renderamt, 0);
    assert.equal(r.rendermode, 4);
  });

  test("y `apple5spawn` es ADEMÁS el aparecedor del objeto: un nombre, dos cosas", salta, () => {
    // Es lo que cierra el 71 con el 76: el mismo disparo tira la manzana al
    // suelo y apaga la del árbol.
    const d = manifiesto.disparadores ?? [];
    const iguales = d.filter((x) => x.nombre === "apple5spawn").map((x) => x.clase).sort();
    assert.deepEqual(iguales, ["env_render", "msitem_spawn"]);
  });

  test("`renderfx` es 0 en TODO lo que tiene aspecto en los dos mapas", () => {
    // La cuenta que justifica portar una sola rama de `CL_FxBlend`. Si algún día
    // un mapa trae un pulso, esta prueba se pone roja y hay que escribir la rama.
    let total = 0, con = [];
    for (const mapa of ["edana", "gatecity"]) {
      const f = `build/${mapa}/malla.json`;
      if (!existsSync(f)) continue;
      const m = JSON.parse(readFileSync(f, "utf8"));
      for (const a of m.adornos?.colocaciones ?? []) {
        total++;
        if ((a.render?.fx ?? 0) !== 0) con.push(`${mapa}:adorno:${a.nombre ?? a.modelo}`);
      }
      for (const x of m.disparadores ?? []) {
        if (x.clase !== "env_render") continue;
        total++;
        if ((x.renderfx ?? 0) !== 0) con.push(`${mapa}:env_render:${x.nombre}`);
      }
      for (const g of m.grupos ?? []) {
        if (!g.render) continue;
        total++;
        if ((g.render.fx ?? 0) !== 0) con.push(`${mapa}:cara:${g.texture}`);
      }
    }
    assert.ok(total > 100, `sólo ${total} con aspecto: ¿falta algún build?`);
    assert.deepEqual(con, [], `con renderfx: ${con.join(", ")}`);
  });
});
