// El mapa de celdas de Corinth, comprobado.
//
// Estas son las comprobaciones que ningun juez anterior puede hacer. qbsp dice
// si el mundo sella; el emisor dice si los brushes son validos; las fichas dicen
// si una casa se ve bien. Ninguno de los tres sabe si se puede LLEGAR a la boca
// de la mazmorra, que es lo unico que hay que hacer en este pueblo.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANCHO, FONDO, PARCELAS, RIO, PUENTE, LLEGADA, PORTON,
  rect, esRio, esPuente, parcelaEn, transitable, alcanzables, celdasDe, pendientes,
} from "../src/kit/corinth.js";
import { CASAS } from "../src/kit/casas.js";
import { planHouse } from "../src/kit/house.js";

test("se puede llegar desde la llegada hasta la boca de la mazmorra", () => {
  // LA comprobacion. El experimento 02 la dejo escrita como pendiente porque
  // ni qbsp ni el emisor pueden hacerla.
  const vistas = alcanzables();
  const boca = celdasDe("boca-mazmorra");
  const tocadas = boca.filter(([x, z]) => vistas.has(`${x},${z}`));
  assert.ok(
    tocadas.length > 0,
    `ninguna de las ${boca.length} celdas de la boca se alcanza desde ${LLEGADA}`
  );
});

test("el unico camino a la boca pasa por el puente", () => {
  // Es la premisa del pueblo: la guarnicion controla quien baja porque solo se
  // cruza por un sitio. Si hubiera otro paso, el control es decorado.
  //
  // Se comprueba quitando el puente y viendo que la boca deja de alcanzarse.
  const sinPuente = (x, z) => {
    if (x < 0 || z < 0 || x >= ANCHO || z >= FONDO) return false;
    if (esRio(x, z)) return false; // el puente ya no vale
    const p = parcelaEn(x, z);
    return !p || ["mercado", "patio", "boca"].includes(p.papel);
  };
  const vistas = new Set([LLEGADA.join(",")]);
  const cola = [LLEGADA];
  while (cola.length) {
    const [x, z] = cola.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const clave = `${nx},${nz}`;
      if (vistas.has(clave) || !sinPuente(nx, nz)) continue;
      vistas.add(clave);
      cola.push([nx, nz]);
    }
  }
  const boca = celdasDe("boca-mazmorra");
  assert.ok(
    boca.every(([x, z]) => !vistas.has(`${x},${z}`)),
    "sin el puente todavia se llega a la boca: hay otro paso y el control no controla nada"
  );
});

test("se llega a toda parcela que el jugador tiene que usar", () => {
  // Una parcela a la que no se llega es una parcela que no existe. Se comprueba
  // que al menos una celda pegada a ella se alcanza.
  const vistas = alcanzables();
  const debenAlcanzarse = ["mercado", "posada", "herreria", "puesto-guardia", "cuartel", "patio-control"];
  for (const nombre of debenAlcanzarse) {
    const celdas = celdasDe(nombre);
    const vecinas = new Set();
    for (const [x, z] of celdas) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) vecinas.add(`${x + dx},${z + dz}`);
    }
    const tocada = [...celdas.map(([x, z]) => `${x},${z}`), ...vecinas].some((c) => vistas.has(c));
    assert.ok(tocada, `no se llega a '${nombre}'`);
  }
});

test("el punto de llegada es pisable y esta dentro del pueblo", () => {
  assert.ok(transitable(LLEGADA[0], LLEGADA[1]), "el jugador aparece dentro de un bloque");
  assert.ok(LLEGADA[0] >= 0 && LLEGADA[0] < ANCHO);
  assert.ok(LLEGADA[1] >= 0 && LLEGADA[1] < FONDO);
  assert.ok(!esRio(LLEGADA[0], LLEGADA[1]), "el jugador aparece dentro del rio");
});

test("ninguna parcela se solapa con otra", () => {
  // Dos casas en la misma celda no dan error: dan una pared dentro de otra, que
  // desde fuera parece una pared.
  const ocupadas = new Map();
  for (const p of PARCELAS) {
    const r = rect(p);
    for (let x = r.x; x < r.x + r.ancho; x++) {
      for (let z = r.z; z < r.z + r.fondo; z++) {
        const clave = `${x},${z}`;
        assert.ok(
          !ocupadas.has(clave),
          `'${p.nombre}' pisa la celda ${clave}, que ya es de '${ocupadas.get(clave)}'`
        );
        ocupadas.set(clave, p.nombre);
      }
    }
  }
});

test("ninguna parcela cae dentro del rio", () => {
  for (const p of PARCELAS) {
    const r = rect(p);
    for (let x = r.x; x < r.x + r.ancho; x++) {
      for (let z = r.z; z < r.z + r.fondo; z++) {
        assert.ok(!esRio(x, z), `'${p.nombre}' tiene la celda ${x},${z} dentro del rio`);
      }
    }
  }
});

test("toda parcela queda dentro de la muralla, con una celda de margen", () => {
  // El margen no es estetico: sin el, una casa queda pegada a la muralla y no se
  // puede rodear, que es como se descubre que el pueblo tiene menos calle de la
  // que parecia en el plano.
  for (const p of PARCELAS) {
    const r = rect(p);
    assert.ok(r.x >= 1, `'${p.nombre}' toca la muralla oeste`);
    assert.ok(r.z >= 1, `'${p.nombre}' toca la muralla norte`);
    assert.ok(r.x + r.ancho <= ANCHO - 1, `'${p.nombre}' se sale por el este`);
    assert.ok(r.z + r.fondo <= FONDO - 1, `'${p.nombre}' se sale por el sur`);
  }
});

test("la casa que pide cada parcela cabe en las celdas que tiene", () => {
  // Es el fallo silencioso: la parcela dice 2x2 celdas, la casa mide 2x1, y
  // queda una fila de celdas reservada y vacia que nadie vuelve a mirar.
  for (const p of PARCELAS) {
    if (!p.casa) continue;
    assert.ok(CASAS[p.casa], `'${p.nombre}' pide la casa '${p.casa}', que no existe`);
    const plan = planHouse(CASAS[p.casa].spec);
    const r = rect(p);
    assert.ok(
      plan.ancho <= r.ancho && plan.fondo <= r.fondo,
      `'${p.nombre}' reserva ${r.ancho}x${r.fondo} celdas y '${p.casa}' mide ${plan.ancho}x${plan.fondo}`
    );
  }
});

test("el rio cruza el pueblo de lado a lado, sin saltos", () => {
  // Un rio con un hueco en una fila deja un vado que nadie puso a proposito, y
  // entonces el puente no es el unico paso.
  assert.equal(RIO.length, FONDO, "el rio no cubre todas las filas");
  for (let z = 0; z < FONDO; z++) {
    const fila = RIO.find((f) => f[0] === z);
    assert.ok(fila, `al rio le falta la fila ${z}`);
    assert.ok(fila[2] >= 1, `el rio mide ${fila[2]} celdas en la fila ${z}`);
  }
  // Y no da saltos laterales de mas de una celda entre filas seguidas: un salto
  // mayor deja dos trozos de rio que no se tocan.
  for (let z = 1; z < FONDO; z++) {
    const a = RIO.find((f) => f[0] === z - 1);
    const b = RIO.find((f) => f[0] === z);
    assert.ok(Math.abs(b[1] - a[1]) <= 1, `el rio salta de x=${a[1]} a x=${b[1]} entre z=${z - 1} y z=${z}`);
  }
});

test("el puente esta sobre el rio y lo cruza entero", () => {
  const fila = RIO.find((f) => f[0] === PUENTE.z);
  assert.ok(fila, "el puente esta en una fila sin rio");
  assert.equal(PUENTE.x, fila[1], "el puente no empieza donde empieza el rio");
  assert.equal(PUENTE.ancho, fila[2], "el puente no cubre todo el ancho del rio: queda agua sin cruzar");
  for (let x = PUENTE.x; x < PUENTE.x + PUENTE.ancho; x++) {
    assert.ok(esPuente(x, PUENTE.z));
    assert.ok(transitable(x, PUENTE.z), `no se pisa el puente en ${x},${PUENTE.z}`);
  }
});

test("el porton esta en la muralla y da a una celda pisable", () => {
  assert.equal(PORTON.celda[0], 0, "el porton no esta en el borde oeste");
  const dentro = PORTON.celda[0] + 1;
  assert.ok(
    transitable(dentro, PORTON.celda[1]),
    "al otro lado del porton hay un bloque, no una calle"
  );
});

test("las dos orillas tienen papeles distintos, como dice el lore", () => {
  // La guarnicion, la boca y la herreria en la orilla este; las casas y el
  // mercado en la oeste. Si esto se mezcla, el pueblo deja de contar lo que
  // pasa en el.
  // El limite de las orillas se saca del rio, no se escribe a mano: con un
  // numero fijo aqui, mover el cauce una celda hace fallar una comprobacion que
  // no tiene nada que ver con lo que se movio.
  const rioMax = Math.max(...RIO.map(([, x, ancho]) => x + ancho));
  const este = (p) => rect(p).x >= rioMax;
  for (const p of PARCELAS) {
    if (["boca", "guarnicion", "herreria", "patio"].includes(p.papel)) {
      assert.ok(este(p), `'${p.nombre}' es de la orilla este y esta en la oeste`);
    }
    if (["casa", "posada", "mercado"].includes(p.papel)) {
      assert.ok(!este(p), `'${p.nombre}' es del pueblo y esta al otro lado del rio`);
    }
  }
});

test("lo que falta por resolver esta declarado, no descubierto al construir", () => {
  const faltan = pendientes();
  assert.ok(faltan.length > 0, "si no falta nada, alguien borro los avisos en vez de resolverlos");
  for (const f of faltan) {
    assert.ok(f.falta.length > 10, `el aviso de '${f.parcela}' no dice que falta`);
  }
  // Toda parcela sin casa del catalogo tiene que decir por que, salvo las que
  // son suelo libre a proposito.
  for (const p of PARCELAS) {
    if (p.casa || ["mercado", "patio"].includes(p.papel)) continue;
    assert.ok(p.falta, `'${p.nombre}' no tiene casa ni dice que le falta`);
  }
});

test("una parcela que no existe es un error", () => {
  assert.throws(() => celdasDe("taberna-imaginaria"), /parcela desconocida/);
});

test("inundar desde un bloque no alcanza nada", () => {
  // La sonda de control del inundador. Sin esto, un fallo que haga transitable()
  // devolver siempre true daria «se llega a todo» y las comprobaciones de arriba
  // pasarian sin medir nada.
  const casa = PARCELAS.find((p) => p.papel === "casa");
  const r = rect(casa);
  assert.equal(alcanzables([r.x, r.z]).size, 0);
  // Y desde fuera del mapa, tampoco.
  assert.equal(alcanzables([-1, 5]).size, 0);
});
