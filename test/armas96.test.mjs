// LAS ARMAS QUE NO SON DE PARTIDA — experimento 96.
//
// Hasta el 96 `tools/armas.mjs` horneaba ocho armas y `empunar` (src/main.js)
// convertía cualquier otra en los puños sin decir nada. Esto comprueba lo que
// el horneado tiene que dejar para que las 209 empuñables se puedan empuñar,
// ver y tirar, LEYENDO LOS ARCHIVOS DE DISCO y no el resumen que el horneado
// escribe de sí mismo: el control viejo de las secuencias aprobaba lo que
// `extraerBicho` DEVOLVÍA, y la carpeta de los puños la pisaba después el
// hechizo de relámpago (doc/ARMAS_96.md).
//
// Necesita `build/msr/armas.json` y `build/msr/suelo.json` (`npm run armas` y
// `npm run suelo`); sin ellos se salta, y lo dice.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { Brazo, danoDelGolpe } from "../src/play/golpe.js";
import { Suelo } from "../src/play/suelo.js";
import { MENSAJE } from "../src/red/protocolo.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { ponerArmaEnFigura } from "../src/render/otros.js";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ARMAS = join(RAIZ, "build/msr/armas.json");
const SUELO = join(RAIZ, "build/msr/suelo.json");
const CARPETA = join(RAIZ, "build/msr/armas");
const hay = existsSync(ARMAS);
const haySuelo = existsSync(SUELO);
const sin = (que) => `sin ${que}: npm run armas / npm run suelo`;

const leer = (r) => JSON.parse(readFileSync(r, "utf8"));
const cat = hay ? leer(ARMAS) : null;
const porId = cat ? new Map(cat.armas.map((a) => [a.id, a])) : new Map();

/**
 * Las que se quedan SIN modelo en la mano, cada una con su razón. Si la lista
 * del horneado cambia —crece o encoge— esta prueba se pone roja: un arma nueva
 * sin modelo no puede colarse en silencio, y una que lo gane tiene que salir de
 * aquí.
 */
const SIN_MODELO_EN_MANO = {
  base_weapon_new: "plantilla del mod (la incluyen blunt_staff_a, smallarms_cre...): no declara MODEL_VIEW",
  crossbow_heavy: "weapons/bows/v_crossbow.mdl no existe en assets/msr y ningún guion lo nombra",
  swords_dynamic: "herramienta de desarrollador («does no damage»): su MODEL_VIEW va en un setvar y weapons/1hbigsword_rview.mdl no existe",
  swords_testskin: "objeto de pruebas: weapons/swords/smallswords_skins_rview.mdl no existe",
  swords_testsub: "objeto de pruebas: weapons/swords/smallswords_rview.mdl no existe",
};

test("el catálogo trae todas las empuñables, no las ocho de partida", { skip: !hay && sin("armas.json") }, () => {
  assert.ok(cat.armas.length >= 200, `${cat.armas.length} armas`);
  assert.equal(cat.resumen.armas, cat.armas.length, "el resumen se calcula del mismo catálogo");
  assert.equal(cat.armas.filter((a) => a.dePartida).length, 8, "las ocho de partida siguen marcadas");
  for (const id of ["swords_novablade12", "swords_blood_drinker", "axes_dragon", "bows_firebird", "smallarms_k_fire"]) {
    assert.ok(porId.has(id), `${id} en el catálogo`);
    assert.ok(porId.get(id).enMano?.clave, `${id} con modelo de vista`);
  }
});

test("las que se quedan sin modelo en la mano son las de la lista, ni una más", { skip: !hay && sin("armas.json") }, () => {
  const sinModelo = cat.armas.filter((a) => !a.enMano?.clave).map((a) => a.id).sort();
  assert.deepEqual(sinModelo, Object.keys(SIN_MODELO_EN_MANO).sort());
  assert.deepEqual([...cat.resumen.sinModeloEnMano].sort(), sinModelo, "y el resumen dice lo mismo");
});

test("CADA SECUENCIA PEDIDA ESTÁ EN EL ARCHIVO DE DISCO de su carpeta", { skip: !hay && sin("armas.json") }, () => {
  // Esto es lo que el control viejo no miraba. Varias armas comparten carpeta
  // —los puños y los 31 hechizos van a `viewmodels_v_martialarts`— y extraer
  // arma por arma deja en disco las secuencias de LA ÚLTIMA. Con el horneado
  // del 23 al 95, la carpeta de los puños acababa con `idle1, lift,
  // prepare_idle`: las del relámpago, y ningún puñetazo.
  const malas = [];
  // Las que piden una secuencia que el ARCHIVO no tiene: el motor pone la 0
  // (`if (sequence >= numseq) sequence = 0`, studiomodelrenderer.cpp:968). Es
  // del mod y se cuenta aparte, no se aprueba: son las espadas a dos manos con
  // su `ANIM_SHEATH 7` en un `v_2hswords.mdl` de siete (0 a 6).
  const inexistentes = [];
  for (const a of cat.armas) {
    const c = a.enMano?.clave;
    if (!c) continue;
    const ruta = join(CARPETA, c, "bicho.json");
    assert.ok(existsSync(ruta), `${a.id}: falta ${c}/bicho.json`);
    assert.ok(existsSync(join(CARPETA, c, "malla.bin")), `${a.id}: falta ${c}/malla.bin`);
    const hay = new Set(leer(ruta).secuencias.flatMap((s) => [String(s.indice), String(s.nombre).toLowerCase()]));
    for (const p of a.enMano.pedidas ?? []) {
      if (hay.has(String(p).toLowerCase())) continue;
      const n = a.enMano.secuenciasEnElArchivo;
      if (Number.isInteger(Number(p)) && Number.isInteger(n) && Number(p) >= n) inexistentes.push(`${a.id}:${p}/${n}`);
      else malas.push(`${a.id} pide ${p} y ${c} no la trae`);
    }
  }
  assert.deepEqual(malas, []);
  // Y las inexistentes son las que son: si un día salen más, se miran.
  assert.ok(inexistentes.every((x) => /^swords_|^axes_|^blunt_/.test(x)), inexistentes.join(" "));
  assert.ok(inexistentes.length <= 20, `${inexistentes.length}: ${inexistentes.join(" ")}`);
});

test("y el caso que lo destapó: los puños traen su puñetazo", { skip: !hay && sin("armas.json") }, () => {
  const puños = porId.get("fist_bare");
  const b = leer(join(CARPETA, puños.enMano.clave, "bicho.json"));
  const nombres = b.secuencias.map((s) => s.nombre);
  assert.ok(nombres.includes("r_fists_punch"), nombres.join(", "));
  // Y la carpeta es COMPARTIDA de verdad con los hechizos: si no lo fuera, este
  // caso no probaría nada sobre la unión de secuencias.
  const conElla = cat.armas.filter((a) => a.enMano?.clave === puños.enMano.clave).length;
  assert.ok(conElla > 1, `${conElla} armas en ${puños.enMano.clave}`);
  assert.ok(nombres.includes("prepare_idle"), "y la del hechizo sigue estando");
});

test("el modelo del MUNDO de cada arma que lo declara está en disco", { skip: !hay && sin("armas.json") }, () => {
  const faltan = cat.armas.filter((a) => a.enElMundo?.clave)
    .filter((a) => !existsSync(join(CARPETA, a.enElMundo.clave, "bicho.json")))
    .map((a) => a.id);
  assert.deepEqual(faltan, []);
  assert.ok(cat.resumen.conModeloEnElMundo >= 170, `${cat.resumen.conModeloEnElMundo}`);
});

test("las dos exenciones del oráculo de la caja traen sus números y separan por tres órdenes", { skip: !hay && sin("armas.json") }, () => {
  const ex = cat.resumen.eximidosDeLaCaja;
  assert.deepEqual([...new Set(ex.map((e) => e.rel))].sort(),
    ["viewmodels/v_1hswordssb.mdl", "viewmodels/v_2hblunts.mdl"]);
  for (const e of ex) {
    const m = e.numeros.match(/a ([\d.]+) u, sin la escala \d+\/\d+ a (\d+) u/);
    assert.ok(m, e.numeros);
    assert.ok(Number(m[1]) <= 64 && Number(m[2]) >= 100 * Number(m[1]), `${e.rel}#${e.cuerpo}: ${e.numeros}`);
  }
});

test("una Novablade en la mano es un brazo de Novablade, con su daño", { skip: !hay && sin("armas.json") }, () => {
  const nova = porId.get("swords_novablade12");
  const b = new Brazo(nova);
  assert.equal(b.arma.id, "swords_novablade12");
  assert.equal(b.ataques.length, 4);
  assert.equal(b.esDeTiro, false);
  // `danoDelGolpe` con el dado en los dos extremos y sin crítico: 200 y 340
  // por la potencia de un personaje nuevo (1 → 0,01).
  const a = b.ataques[0];
  const bajo = danoDelGolpe(a, { potencia: 1, azar: () => 0 });
  const alto = danoDelGolpe(a, { potencia: 1, azar: () => 0.94 });
  assert.equal(bajo.dano, 2);
  assert.ok(alto.dano > 3.2 && alto.dano <= 3.4, `${alto.dano}`);
  // Y no es el de los puños, que es lo que pegaba antes del 96.
  const puños = new Brazo(porId.get("fist_bare")).ataques[0];
  assert.equal(danoDelGolpe(puños, { potencia: 1, azar: () => 0 }).dano, 0.6);
});

test("cada arma con modelo del mundo se puede SOLTAR: el suelo la conoce", { skip: !(hay && haySuelo) && sin("suelo.json") }, () => {
  // Antes del 96 `Suelo.tirar` devolvía `null` para todo lo que no fuera de
  // partida, y `soltarDelInventario` se callaba: el arma se quedaba en la mano.
  const suelo = leer(SUELO);
  const catalogo = new Map(suelo.objetos.map((o) => [o.guion, o]));
  const s = new Suelo({ catalogo, azar: () => 0.5 });
  const nulos = [];
  for (const a of cat.armas) {
    if (!a.enElMundo?.clave) continue;
    const o = s.tirar({ guion: a.id, ojo: [0, 0, 64], mirando: [1, 0, 0] });
    if (!o) nulos.push(a.id);
  }
  assert.deepEqual(nulos, []);
  // El control de que el instrumento podía ver un `null`: un guion inventado.
  assert.equal(s.tirar({ guion: "swords_que_no_existe", ojo: [0, 0, 64] }), null);
});

test("y su modelo del suelo NO se carga al entrar: va marcado como perezoso", { skip: !(hay && haySuelo) && sin("suelo.json") }, () => {
  const suelo = leer(SUELO);
  const perezosas = suelo.objetos.filter((o) => o.clave && o.mapas?.length === 1 && o.mapas[0] === "empuñable");
  const alEntrar = suelo.objetos.filter((o) => o.clave && !perezosas.includes(o));
  assert.ok(perezosas.length >= 150, `${perezosas.length} perezosas`);
  // Lo que se carga al entrar era 1,1 MB en el 75. Que no se nos vaya a 20.
  const bytes = alEntrar.reduce((s, o) => s + (o.bytes ?? 0), 0);
  assert.ok(bytes < 5 * 1024 * 1024, `${(bytes / 1024 / 1024).toFixed(1)} MB al entrar`);
  // Y la Novablade es de las perezosas, con su `_floor`.
  const nova = suelo.objetos.find((o) => o.guion === "swords_novablade12");
  assert.ok(perezosas.includes(nova));
  assert.equal(nova.submodelo?.nombre, "novablade_floor");
});

// ── EN PARTIDA: el servidor se entera del cambio de arma ──────────────────
//
// Hasta el 96 el servidor sabía el arma del personaje SÓLO por la creación:
// cambiarla en el navegador no se le decía a nadie, así que `_techoDeDano`
// recortaba la Novablade con el techo de la espada oxidada, y los demás no
// podían ver qué llevabas. `MENSAJE.EMPUNAR` es el `inv transfer <id> 0`.

const APARICION = {
  mapa: "liso",
  nacimiento: { nombre: "el centro", escena: [0, 0.2, 0] },
  reaparicion: { nombre: "el centro", escena: [0, 0.2, 0] },
};
function buzon() {
  const dentro = [];
  return {
    dentro, enviar: (t) => dentro.push(JSON.parse(t)),
    ultimo: (tipo) => [...dentro].reverse().find((m) => m.t === tipo) ?? null, al: () => () => {},
  };
}
async function dentro(catalogo = null) {
  const partida = new Partida({ mundo: await mundoLiso(), almacen: new AlmacenMemoria(), aparicion: APARICION, catalogo });
  const b = buzon();
  const c = partida.conectar(b, { nombre: "Uno" });
  // Con catálogo, el arma de partida tiene que ser una de las siete.
  const arma = catalogo?.nuevoPersonaje?.armas?.[0];
  await partida.recibir(c.id, { t: MENSAJE.CREAR, personaje: { nombre: "Uno", ...(arma ? { arma } : {}) } });
  await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: b.ultimo(MENSAJE.LISTA).personajes[0].id });
  return { partida, b, c };
}

test("EMPUNAR: lo que lleva en la mochila pasa a la mano, y la foto lo dice", async () => {
  const { partida, b, c } = await dentro();
  const p = c.sesion.personaje;
  p.objetos.push({ id: "swords_novablade12", n: 1 });
  const antes = p.manos.derecha;
  await partida.recibir(c.id, { t: MENSAJE.EMPUNAR, id: "swords_novablade12" });
  assert.equal(p.manos.derecha, "swords_novablade12");
  assert.ok(!p.objetos.some((o) => o.id === "swords_novablade12"), "sale de la mochila");
  if (antes) assert.ok(p.objetos.some((o) => o.id === antes), "y lo de antes vuelve a ella");
  assert.equal(partida._estado(c).arma, "swords_novablade12");
  // Y algo que NO lleva no se empuña: ni cambia la mano ni calla.
  await partida.recibir(c.id, { t: MENSAJE.EMPUNAR, id: "axes_dragon" });
  assert.equal(p.manos.derecha, "swords_novablade12");
  assert.match(b.ultimo(MENSAJE.FALLO)?.porque ?? "", /not carrying axes_dragon/);
});

test("EMPUNAR y el techo del daño: el servidor recorta con el arma NUEVA", { skip: !existsSync(join(RAIZ, "build/msr/objetos.json")) && "sin objetos.json" }, async () => {
  const catalogo = leer(join(RAIZ, "build/msr/objetos.json"));
  const { partida, c } = await dentro(catalogo);
  const p = c.sesion.personaje;
  p.objetos.push({ id: "swords_novablade12", n: 1 });
  const techoAntes = partida._techoDeDano(c);
  await partida.recibir(c.id, { t: MENSAJE.EMPUNAR, id: "swords_novablade12" });
  const techoDespues = partida._techoDeDano(c);
  assert.ok(techoDespues > techoAntes, `${techoAntes} -> ${techoDespues}`);
  // Un id que el catálogo no conoce no entra ni aunque esté en la mochila.
  p.objetos.push({ id: "swords_que_no_existe", n: 1 });
  await partida.recibir(c.id, { t: MENSAJE.EMPUNAR, id: "swords_que_no_existe" });
  assert.equal(p.manos.derecha, "swords_novablade12");
});

// ── EL ARMA DE OTRO: `StudioMergeBones` ────────────────────────────────────
//
// Un arma de mentira con tres huesos —dos con nombre del jugador y uno
// propio— y un vértice en la mano. Se gira la mano de la FIGURA y el vértice
// del arma tiene que ir con ella, como un punto clavado a la mano.
test("el arma de otro jugador se mueve con SU mano (los huesos se funden por nombre)", () => {
  const hueso = (pos, q = [0, 0, 0, 1]) => { const b = new THREE.Bone(); b.position.set(...pos); b.quaternion.set(...q); return b; };
  // La figura: raíz y mano, dentro de unos «ejes» como los de `figuraDeJugador`.
  const nodo = new THREE.Group();
  const ejes = new THREE.Group();
  ejes.rotation.x = -Math.PI / 2; ejes.scale.setScalar(1 / 39.37);
  nodo.add(ejes);
  nodo.position.set(3, 0, -2);
  const raiz = hueso([0, 0, 36]);
  const mano = hueso([10, -5, 20]);
  raiz.add(mano); ejes.add(raiz);
  const fig = { nodo, ejes, huesos: [raiz, mano], nombresDeHuesos: ["Bip01", "Bip01 R Hand"] };
  // El arma: los mismos dos huesos en la MISMA postura de reposo, más uno suyo.
  const ficha = {
    huesos: [
      { nombre: "Bip01", padre: -1, pos: [0, 0, 36], quat: [0, 0, 0, 1] },
      { nombre: "Bip01 R Hand", padre: 0, pos: [10, -5, 20], quat: [0, 0, 0, 1] },
      { nombre: "smdimport", padre: 1, pos: [2, 0, 0], quat: [0, 0, 0, 1] },
    ],
    grupos: [{ skinref: 0, archivo: null }], pieles: [[0]], texturasPorIndice: {},
  };
  // Un vértice en el hueso 2 (el propio), a 30 u por delante: la punta del filo.
  const geo = new THREE.BufferGeometry();
  const punta = new THREE.Vector3(10 + 2 + 30, -5, 36 + 20);
  geo.setAttribute("position", new THREE.Float32BufferAttribute([punta.x, punta.y, punta.z], 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([2, 0, 0, 0], 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  geo.addGroup(0, 1, 0);
  const malla = ponerArmaEnFigura(fig, { ficha, geo, texturas: new Map() });
  assert.equal(malla.userData.fusionados, 2);
  assert.equal(malla.userData.propios, 1);
  assert.equal(malla.skeleton.bones[1], mano, "la mano del arma ES la mano de la figura");

  const dondeEsta = () => {
    nodo.updateMatrixWorld(true);
    malla.skeleton.update();
    const v = new THREE.Vector3();
    malla.getVertexPosition(0, v);
    return v.applyMatrix4(malla.matrixWorld);
  };
  // En reposo, la punta está donde la dejó el horneado.
  const enReposo = dondeEsta();
  const esperadoReposo = punta.clone().applyMatrix4(ejes.matrixWorld);
  assert.ok(enReposo.distanceTo(esperadoReposo) < 1e-4, `${enReposo.toArray()} / ${esperadoReposo.toArray()}`);
  // Se gira la MANO DE LA FIGURA 90° y se mueve la figura entera.
  const manoAntes = mano.matrixWorld.clone();
  mano.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  nodo.position.set(-7, 1, 4);
  const girada = dondeEsta();
  // Lo esperado: el punto fijo a la mano —su posición en el espacio de la
  // mano de antes— llevado con la mano de ahora.
  const enLaMano = esperadoReposo.clone().applyMatrix4(manoAntes.clone().invert());
  const esperado = enLaMano.applyMatrix4(mano.matrixWorld);
  assert.ok(girada.distanceTo(esperado) < 1e-4, `${girada.toArray()} / ${esperado.toArray()}`);
  assert.ok(girada.distanceTo(enReposo) > 0.5, "y se ha movido de verdad");
});
