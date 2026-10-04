// Un MONSTRUO de Master Sword Rebirth, extraído con sus secuencias.
//
//   node tools/bicho.mjs goblin_new
//   node tools/bicho.mjs goblin_new giant_rat spider skeleton
//
// Escribe en `build/gatecity/bichos/<nombre>/` la malla, el esqueleto, las
// secuencias y las texturas. Misma regla del 02 que todo lo demás: se escribe el
// lector, lo extraído va a `build/`, y ni un byte pasa a `public/`.
//
// ── El oráculo, y aquí es de los buenos ────────────────────────────────────
//
// Cada `mstudioseqdesc_t` guarda la caja envolvente de SU secuencia, escrita por
// el compilador con los vértices ya animados. Así que esto no se fía de que la
// descompresión «parezca razonable»: anima los vértices fotograma a fotograma y
// comprueba que caben.
//
// Y tiene control, porque un juez que sólo sabe decir que sí ya ha costado seis
// sondas en este experimento. Con la escala de compresión quitada, el goblin da
// 0 de 36 secuencias y 6 511 unidades de desbordamiento; con los desplazamientos
// de canal tomados como absolutos, 2 de 36. El bueno da 36 de 36 y **cero**.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";

import {
  leerMdl, texturasDe, mallaDe, pielesDe, TAM, porMatriz, cuaternionDeEuler,
} from "../src/bsp/mdl.js";
import {
  leerSecuencias, leerHuesos, clavesDeSecuencia, cabeEnLaCaja, matricesEnFotograma,
} from "../src/bsp/mdlanim.js";
import { tablasDeGamma, AJUSTES } from "../src/bsp/gamma.js";
import { partirScript } from "../src/bsp/script.js";
import { escribirPng } from "./png.mjs";

const MODELOS = "../MSC/assets/msr/models/monsters";
import { mapaDeArgv, posicionalesDe, enSalida, MAPA_POR_DEFECTO } from "./mapa.mjs";
const SALIDA = enSalida(MAPA_POR_DEFECTO, "bichos");
const RAMPA = tablasDeGamma(AJUSTES).tex;

export const nombreArchivo = (s) => s.replace(/[^A-Za-z0-9_.-]/g, "_");

/**
 * LOS EVENTOS DE UNA SECUENCIA, para el servidor — el 92.
 *
 * `mstudioseqdesc_t` lleva `numevents` y `eventindex` en los bytes 48 y 52
 * (studio.h:172-173) y cada `mstudioevent_t` son `frame`, `event`, `type` y
 * `options[64]`: 76 bytes (studio_event.h:23-26). Los de 5000 en adelante
 * son del CLIENTE y el servidor los salta (`EVENT_CLIENT`, monsterevent.h:27;
 * animation.cpp:322), así que no se hornean.
 *
 * Es la misma lectura que `eventosDeModelo` (tools/bichosguion.mjs:205), pero
 * por ÍNDICE de secuencia y no por nombre: el horneado emite secuencias por
 * índice y dos con el mismo nombre se confundirían. Que las dos lecturas den
 * lo mismo lo comprueba `test/mordisco92a.test.mjs`.
 *
 * Lo pide `Manada.eventosDeAnimacion`: el 500 y el 600 llaman al guion por
 * su nombre (msmonsterserver.cpp:1484-1493), y en Master Sword el golpe de un
 * monstruo ES uno de ésos (`bite1` en giantrat.script:63-67).
 */
export function eventosDeSecuencia(m, indice) {
  const { buf, offSecuencias } = m;
  const o = offSecuencias + indice * 176;
  if (o + 176 > buf.length) return [];
  const n = buf.readInt32LE(o + 48), off = buf.readInt32LE(o + 52);
  const fuera = [];
  for (let k = 0; k < n; k++) {
    const e = off + k * 76;
    if (e + 76 > buf.length) break;
    const evento = buf.readInt32LE(e + 4);
    if (evento >= 5000) continue;
    fuera.push({
      frame: buf.readInt32LE(e),
      evento,
      opciones: buf.toString("latin1", e + 12, e + 76).replace(/\0.*$/s, ""),
    });
  }
  return fuera;
}

/** Los vértices en el espacio de SU hueso, que es como los guarda el archivo. */
export function verticesCrudos(m, cuerpo = 0) {
  const { buf } = m;
  const out = [];
  for (let bp = 0; bp < m.nBodyparts; bp++) {
    const ob = m.offBodyparts + bp * TAM.bodypart;
    const nModelos = buf.readInt32LE(ob + 64);
    const base = buf.readInt32LE(ob + 68);
    const offModelos = buf.readInt32LE(ob + 72);
    if (nModelos < 1) continue;
    const iSub = nModelos > 1 && base > 0 ? Math.floor(cuerpo / base) % nModelos : 0;
    const om = offModelos + iSub * TAM.modelo;
    const nVerts = buf.readInt32LE(om + 80);
    const offInfoVert = buf.readInt32LE(om + 84);
    const offVerts = buf.readInt32LE(om + 88);
    for (let i = 0; i < nVerts; i++) {
      out.push({
        hueso: buf[offInfoVert + i],
        v: [
          buf.readFloatLE(offVerts + i * 12),
          buf.readFloatLE(offVerts + i * 12 + 4),
          buf.readFloatLE(offVerts + i * 12 + 8),
        ],
      });
    }
  }
  return out;
}

/**
 * Extrae un modelo con sus secuencias. `relativo` es la ruta que declara el
 * script —`monsters/goblin_new.mdl`, `dwarf/male1.mdl`— y `cuerpo` el número de
 * `bodypart` compuesto, que es lo que elige el hacha del enano.
 *
 * Devuelve la ficha para el manifiesto, o `null` si el `.mdl` no está.
 */
export function extraerBicho(relativo, {
  cuerpo = 0, base = "../MSC/assets/msr/models", salida = SALIDA, callar = false,
  raizSalida = enSalida(MAPA_POR_DEFECTO),
  // Qué secuencias se EMITEN. El oráculo se comprueba sobre TODAS de todas
  // formas —es gratis y es el juez—, pero al navegador sólo van las que alguien
  // va a pedir: `npc/human1.mdl` tiene 129 secuencias y 6 882 fotogramas, o sea
  // 4,1 MB de los que un vendedor parado usa dos.
  quiero = null,
  // Y QUÉ ACTIVIDADES, que es distinto de qué nombres.
  //
  // Un bicho que no hace `setidleanim` no nombra su animación de estar parado:
  // el motor la busca por el número de actividad que el compilador escribió en
  // la cabecera de la secuencia (`SetActivity(ACT_IDLE)`, ver
  // `src/play/actividad.js`). O sea que hay secuencias que NADIE pide por
  // nombre y que hacen falta igual — y si no se hornean, el bicho cae en la 0,
  // que es justo el fallo que esto viene a arreglar.
  actividades = [],
  // LA SALIDA DEL ORÁCULO DE LA CAJA, y cuesta una frase a propósito.
  //
  // Hay archivos cuya caja de secuencia no describe su propia malla:
  // `human/reference.mdl` se sale 27,7 unidades con los vértices que él mismo
  // trae, y se comprobó que no es nuestra lectura (ver `rigidezDeModelo` en
  // `src/bsp/mdlanim.js`). Para ésos el juez tiene que ser otro.
  //
  // Se pide la RAZÓN y no un booleano porque un `oraculo: false` suelto por ahí
  // es exactamente cómo se pierde un juez: alguien lo pone para salir del paso
  // y nadie vuelve a saber por qué. Sin razón, esto no se salta.
  sinOraculoDeCaja = null,
  // NO EMITIR LAS PISTAS, porque ya están en otro sitio.
  //
  // Dos `body` del mismo archivo comparten esqueleto y animación palabra por
  // palabra: el `body` elige submodelos de malla y no toca ni un hueso. En
  // `human/reference.mdl` eso son **970 de los 1 020 KB** de cada género, o sea
  // que emitir los dos completos es pagar dos veces por el mismo megabyte en la
  // pantalla que precisamente queremos que salga antes que el mapa.
  //
  // El valor es la `clave` del modelo que sí las trae, y se comprueba que el
  // esqueleto sea el mismo antes de fiarse.
  pistasDe = null,
  // EL 101: EL CONTROL DEL BOBINADO, CON SALIDA Y CON RAZÓN, como el de la caja.
  //
  // Tres submodelos de `armor/p_helmets.mdl` (`ref1e`, `ref2e`, `ref3e`: los
  // yelmos de placas, mongol y de caballero) traen el 100 % de sus NORMALES al
  // revés de como giran sus triángulos, y los otros 29 del mismo archivo no. El
  // motor no mira la normal para decidir qué cara se ve: recorta por el giro
  // (`glCullFace`), y la normal sólo ilumina. Así que aquí se dejan girar como
  // el resto del archivo, y quien lo pide dice por qué. Sin razón, el control
  // sigue parando el horneado.
  bobinadoContraNormal = null,
} = {}) {
  const nombre = relativo.replace(/\.mdl$/i, "").replace(/\\/g, "/");
  const clave = `${nombreArchivo(nombre)}${cuerpo ? `_b${cuerpo}` : ""}`;
  const ruta = `${base}/${nombre}.mdl`;
  if (!existsSync(ruta)) return null;
  const m = leerMdl(ruta);
  if (!m.cuadra) {
    console.error(`  FALLO: ${nombre}.mdl dice medir ${m.largo} y mide ${m.bytes}`);
    process.exit(1);
  }
  const dir = `${salida}/${clave}`;
  mkdirSync(dir, { recursive: true });

  const huesos = leerHuesos(m);
  const secuencias = leerSecuencias(m);
  const texturas = texturasDe(m);
  const malla = mallaDe(m, texturas, { cuerpo });

  // Los dos controles del lector de malla, que ya existían y siguen valiendo.
  if (!malla.cuadra) {
    console.error(`  FALLO: ${nombre}: ${malla.leidos} triángulos leídos de ${malla.esperados}`);
    process.exit(1);
  }
  if (!malla.bobinadoBien && bobinadoContraNormal) {
    // Se devuelve en la ficha (`bobinadoEximido`) para que se pueda contar.
  } else if (!malla.bobinadoBien) {
    console.error(`  FALLO: ${nombre}: el ${(malla.contraNormalFrac * 100).toFixed(0)} % de los triángulos gira contra su normal`);
    process.exit(1);
  }

  // --- las secuencias, con el oráculo de la caja --------------------------
  const verts = verticesCrudos(m, cuerpo);
  const pistas = [];
  let caben = 0, peorGlobal = 0, fotogramas = 0;
  const malas = [];
  for (const s of secuencias) {
    const p = clavesDeSecuencia(m, s, huesos);
    const r = cabeEnLaCaja(s, p, huesos, verts);
    if (r.cabe) caben++; else malas.push(`${s.nombre}: ${r.fuera}/${r.total} fuera, el peor a ${r.peor.toFixed(1)} u`);
    peorGlobal = Math.max(peorGlobal, r.peor);
    fotogramas += Math.max(1, s.nFotogramas);
    pistas.push(p);
  }

  // --- las texturas -------------------------------------------------------
  //
  // La rampa de `texgamma`, y su excepción: `Image_LoadMDL` manda las texturas
  // con `STUDIO_NF_MASKED` por `LUMP_MASKED`, que no pasa por `texgammatable`.
  //
  // Y se escriben TODAS las que alguna familia de piel pueda pedir, no sólo las
  // de la familia 0: `dwarf/male1.mdl` tiene siete familias y
  // `NPCs/default_dwarf.script` elige una al azar con
  // `setprop ent_me skin $rand(1,6)`. Con sólo la 0 salen todos los enanos del
  // pueblo con la piel base sin teñir — que no da error, da un pueblo de enanos
  // blancos donde el juego tiene barbas rojas y negras.
  const porIndice = new Map();
  const pieles = pielesDe(m);
  const usados = [...new Set(malla.grupos.map((g) => g.skinref))];
  const quiereTex = new Set();
  for (const fila of pieles) for (const sr of usados) quiereTex.add(fila[sr] ?? sr);
  const archivosTex = new Map();
  for (const iTex of quiereTex) {
    const t = texturas[iTex];
    if (!t) continue;
    const archivo = `tex/${nombreArchivo(t.nombre.replace(/\.[a-z]+$/i, ""))}.png`;
    if (archivosTex.has(t.nombre)) continue;
    mkdirSync(`${dir}/tex`, { recursive: true });
    const rgba = Uint8Array.from(t.rgba);
    if (!t.recortado) {
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = RAMPA[rgba[i]];
        rgba[i + 1] = RAMPA[rgba[i + 1]];
        rgba[i + 2] = RAMPA[rgba[i + 2]];
      }
    }
    escribirPng(`${dir}/${archivo}`, rgba, t.ancho, t.alto);
    archivosTex.set(t.nombre, archivo);
    porIndice.set(iTex, { archivo, recortado: t.recortado, aditivo: t.aditivo, plenaLuz: t.plenaLuz });
  }

  // --- a disco ------------------------------------------------------------
  const pos = [], nor = [], uv = [], skin = [];
  const grupos = [];
  for (const g of malla.grupos) {
    const inicio = pos.length / 3;
    pos.push(...g.pos); nor.push(...g.nor); uv.push(...g.uv); skin.push(...g.hueso);
    grupos.push({
      start: inicio, count: g.pos.length / 3,
      // El `skinref` y no la textura: con él y la tabla de familias, el
      // navegador elige la piel sin volver a tocar la malla.
      skinref: g.skinref,
      textura: g.textura.nombre, archivo: archivosTex.get(g.textura.nombre),
      recortado: g.textura.recortado, aditivo: g.textura.aditivo, plenaLuz: g.textura.plenaLuz,
    });
  }

  const partes = [
    ["positions", Float32Array.from(pos)],
    ["normals", Float32Array.from(nor)],
    ["uvs", Float32Array.from(uv)],
    // Un `uint16` por vértice: GoldSrc da UN hueso por vértice y ninguno pasa de
    // 128. El `skinWeight` no se emite porque es siempre (1, 0, 0, 0) y lo pone
    // el navegador.
    ["skin", Uint16Array.from(skin)],
  ];
  // Las pistas, una detrás de otra: por secuencia, por hueso, la posición y la
  // rotación de cada fotograma.
  const pedidas = quiero
    ? new Set([...quiero].filter(Boolean).map((x) => String(x).toLowerCase()))
    : null;
  const secOut = [];
  for (let i = 0; i < secuencias.length; i++) {
    const s = secuencias[i];
    // La 0 va siempre: es la que el motor usa cuando le piden una que no existe.
    //
    // Se pide por NOMBRE o por ÍNDICE, y hacen falta los dos: un bicho nombra
    // sus secuencias (`setmoveanim walk`) y un arma las nombra por número
    // (`const ANIM_ATTACK1 2`), porque quien la escribió miraba la lista del
    // compilador. Sin el índice, un arma sale con una sola secuencia y no se
    // mueve — y con la 0 puesta, parece que sí.
    if (pedidas && i !== 0 &&
        !pedidas.has(s.nombre.toLowerCase()) && !pedidas.has(String(i)) &&
        !actividades.includes(s.actividad)) continue;
    const n = Math.max(1, s.nFotogramas);
    const p = new Float32Array(huesos.length * n * 3);
    const r = new Float32Array(huesos.length * n * 4);
    for (let h = 0; h < huesos.length; h++) {
      p.set(pistas[i][h].pos, h * n * 3);
      r.set(pistas[i][h].rot, h * n * 4);
    }
    if (!pistasDe) partes.push([`sec${i}_pos`, p], [`sec${i}_rot`, r]);
    secOut.push({
      indice: i, nombre: s.nombre, fps: s.fps, fotogramas: n, bucle: s.bucle,
      actividad: s.actividad,
      // El peso del sorteo por actividad. Sin él, un modelo con tres «idle»
      // se lleva siempre la misma y no se sabe por qué.
      pesoActividad: s.pesoActividad,
      motiontype: s.motiontype, motionbone: s.motionbone,
      // El avance que el `motiontype` le quitó a la animación. Es lo que la
      // entidad tiene que andar para que el bicho no patine.
      avance: s.avance,
      bbmin: s.bbmin, bbmax: s.bbmax,
      // EL 92: los eventos del servidor de esta secuencia (`eventosDeSecuencia`).
      eventos: eventosDeSecuencia(m, i),
    });
  }

  // Cada tramo empieza en múltiplo de CUATRO, y no es cosmético.
  //
  // `skin` es de 16 bits, así que con un número impar de vértices deja el
  // siguiente tramo en un desplazamiento impar — y `new Float32Array(buffer,
  // off, n)` con `off` no múltiplo de 4 **lanza una excepción**. Aquí lo lanzó;
  // en otro sitio habría dado una copia silenciosa o basura.
  const tramos = {};
  let off = 0;
  for (const [k, a] of partes) {
    off = (off + 3) & ~3;
    tramos[k] = { off, bytes: a.byteLength, n: a.length };
    off += a.byteLength;
  }
  off = (off + 3) & ~3;
  const bin = Buffer.alloc(off);
  for (const [k, a] of partes) Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(bin, tramos[k].off);
  writeFileSync(`${dir}/malla.bin`, bin);

  writeFileSync(`${dir}/bicho.json`, JSON.stringify({
    nombre,
    // La ruta REAL, no `models/monsters/` a fuego.
    //
    // Estaba escrita fija, y `nombre` ya trae la carpeta: para un monstruo daba
    // `models/monsters/monsters/goblin_new.mdl` y para el cuerpo del jugador
    // `models/monsters/human/reference.mdl`, que no existe. En un campo que
    // existe precisamente para decir de dónde sale cada byte, una ruta
    // inventada es el peor sitio donde dejar una mentira.
    procedencia: `derivado local de models/${nombre}.mdl. No redistribuible.`,
    bin: { archivo: "malla.bin", tramos },
    // El esqueleto, en el espacio LOCAL de cada hueso: es lo que pide un
    // `Skeleton` de Three.js, y con los vértices ya en la postura de reposo el
    // `calculateInverses()` de fábrica sale correcto sin tocar nada.
    // El cuaternión va YA CALCULADO y no los tres ángulos. No es comodidad: el
    // orden de Euler del motor es `Rz·Ry·Rx` con los ángulos en radianes, y
    // dejarlo para el navegador es poner un segundo sitio donde equivocarse de
    // orden — que da un esqueleto retorcido y ningún error.
    huesos: huesos.map((h) => ({
      nombre: h.nombre, padre: h.padre,
      pos: h.valor.slice(0, 3),
      quat: cuaternionDeEuler(h.valor[3], h.valor[4], h.valor[5]),
    })),
    grupos,
    // La tabla de familias de piel: `pieles[familia][skinref]` da el índice de
    // textura, y `texturasPorIndice` dice qué PNG es.
    pieles,
    texturasPorIndice: Object.fromEntries(porIndice),
    secuencias: secOut,
    // De quién son las pistas. `null` quiere decir «mías, en mi propio
    // `malla.bin`»; con una clave, las de ese otro modelo. Va en la ficha y no
    // sólo en el manifiesto porque quien lee esto tiene que poder saber, sin
    // salir del archivo, que sus `tramos` no traen ningún `sec*`.
    pistasDe,
    triangulos: malla.triangulos,
    vertices: pos.length / 3,
    caja: { min: m.min, max: m.max },
    // LA CAJA MEDIDA, porque la de la cabecera suele venir VACÍA.
    //
    // `m.min`/`m.max` son los del `studiohdr_t`, y en casi todos los modelos de
    // Master Sword son (0,0,0)-(0,0,0): el compilador no los escribió. Eso no
    // se nota mientras sólo se dibuja —la malla trae sus vértices— y se nota en
    // cuanto alguien le pide un tamaño: pedirle un colisionador a esa caja da
    // un cilindro de radio cero, que Rapier acepta y con el que no choca nada.
    // Pasó: de 69 bichos, 54 se quedaron sin colisión y sin un solo error.
    //
    // Ésta se mide sobre la malla en reposo, que es la postura con la que el
    // bicho está de pie.
    cajaMedida: (() => {
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          if (pos[i + k] < mn[k]) mn[k] = pos[i + k];
          if (pos[i + k] > mx[k]) mx[k] = pos[i + k];
        }
      }
      return pos.length ? { min: mn, max: mx } : null;
    })(),
  }, null, 1));

  if (!callar) {
    console.log(
      `  ${nombre.padEnd(26)} ${String(malla.triangulos).padStart(5)} tri, ${String(huesos.length).padStart(3)} huesos, ` +
      `${String(secuencias.length).padStart(3)} sec (${fotogramas} fotogramas), ${archivosTex.size} tex, ` +
      `${(bin.length / 1024 / 1024).toFixed(2)} MB · oráculo ${caben}/${secuencias.length}, el peor a ${peorGlobal.toFixed(1)} u` +
      (sinOraculoDeCaja ? ` (NO manda: ${sinOraculoDeCaja})` : "")
    );
    for (const x of malas.slice(0, 3)) console.log(`      ${x}`);
  }
  // Los dos umbrales, y los dos con su control medido: con la escala de
  // compresión quitada el goblin da 0 de 36 y 6 511 unidades; con los
  // desplazamientos de canal tomados como absolutos, 2 de 36 y 354; sin animar,
  // 28 de 36 y 21. El bueno da 36 de 36 y cero. Entre un caso y otro no hay
  // nada, así que estos umbrales separan sin afinarlos.
  // ── UN MODELO SIN SECUENCIAS NO SE PUEDE JUZGAR, Y NO ES UN ERROR ────────
  //
  // El 89, al hornear `edanasewers`. El oráculo pregunta «¿cabe alguna
  // secuencia en su caja?», y con CERO secuencias la respuesta es «0 de 0»: no
  // hay nada que descomprimir y por tanto nada que pueda estar mal
  // descomprimido. Pero el `!caben` lo leía como el fallo de descompresión y
  // paraba el horneado entero.
  //
  // El caso es `models/null.mdl`: 1 672 bytes, **0 huesos, 0 secuencias y 0
  // bodyparts**, caja nula. Es un modelo vacío A PROPÓSITO —lo usan 32 guiones
  // del juego para entidades con lógica y sin cuerpo: trampas, monitores,
  // efectos—, y en las cloacas lo trae `other/lure` (`setmodel null.mdl`,
  // lure.script:10), dos veces. Gate City y Edana no tienen ninguno, así que el
  // juez se escribió sin verlo nunca: *un control hereda el supuesto de la
  // clase para la que se escribió* (el 69), y aquí el supuesto era «un bicho
  // tiene al menos una animación».
  //
  // La condición es EXACTA, no un umbral: con una sola secuencia el oráculo
  // vuelve a mandar entero, así que esto no afloja nada para un modelo de
  // verdad.
  if (!sinOraculoDeCaja && secuencias.length > 0) {
    if (!caben) {
      throw new Error(`${nombre}: ni una secuencia cabe en su caja. La descompresión está mal.`);
    }
    if (peorGlobal > 16) {
      throw new Error(`${nombre}: el peor vértice se sale ${peorGlobal.toFixed(1)} unidades de su caja.`);
    }
  } else if (sinOraculoDeCaja && caben === secuencias.length && peorGlobal === 0) {
    // (El `sinOraculoDeCaja &&` es del 89: sin él, el modelo vacío de arriba
    // caía AQUÍ —0 de 0 «pasa limpio»— y se le reñía por pedir una exención
    // que nadie había pedido. Esta rama es sólo para quien la pide.)
    // Y el control de la salida: si el modelo por el que se ha pedido saltarse
    // el juez lo pasa limpiamente, la razón es falsa y hay que quitarla.
    throw new Error(
      `${nombre}: se pide saltarse el oráculo de la caja («${sinOraculoDeCaja}») y el modelo lo pasa ` +
      `${caben}/${secuencias.length} con cero desbordamiento. Quita el \`sinOraculoDeCaja\`.`
    );
  }
  return {
    bobinadoEximido: (!malla.bobinadoBien && bobinadoContraNormal) ? bobinadoContraNormal : null,
    clave, modelo: nombre, cuerpo,
    // `carpeta` se DERIVA de donde se ha escrito, y no se escribe a mano.
    //
    // Estaba fijo a `bichos/${clave}`, que es correcto cuando `salida` es la
    // carpeta de los bichos y una mentira en cuanto no lo es. Al reusar esto
    // para los adornos que se mueven se le pasó `build/gatecity`: los ficheros
    // fueron a `build/gatecity/props_tree2` y la ficha siguió diciendo
    // `bichos/props_tree2`. **No dio error** — dio cuatro modelos que el visor
    // no encontraba y un aviso en la consola que es fácil no leer.
    carpeta: relative(raizSalida, dir).replaceAll("\\", "/"),
    triangulos: malla.triangulos, huesos: huesos.length,
    secuencias: secOut.map((s) => s.nombre),
    // Y las cabeceras enteras, que hacen falta para resolver la animación de
    // estar parado por actividad sin volver a abrir el `.mdl`.
    detalleSecuencias: secOut.map((s) => ({
      indice: s.indice, nombre: s.nombre, actividad: s.actividad, pesoActividad: s.pesoActividad,
    })),
    bytes: bin.length,
    oraculo: { caben, de: secuencias.length, peor: peorGlobal },
  };
}

// --- LAS ANIMACIONES QUE PIDE EL GUION (el 93) -------------------------------
//
// La regla y su porqué están en tools/bichos.mjs, apartado 2c: aquí vive sólo
// para que se pueda probar sin hornear (test/horneado93e.test.mjs).
const ASIGNA = /^(?:const|setvar|setvard|setvarg|local)\s+(\S+)\s+(\S+)/i;
const ANIMA = [
  /^setidleanim\s+(\S+)/i,
  /^setmoveanim\s+(\S+)/i,
  /^playanim\s+\S+\s+(\S+)/i,
];
/**
 * EL 98: la ORDEN de una línea sin su condición de cabeza. Una línea de
 * guion puede llevar delante un `if ( … )` —el `if` nuevo, con paréntesis, que
 * guarda una sola orden (script.cpp:5310-5322)— o un `else`/`else if ( … )`, y
 * así es como los guiones cambian `ANIM_ATTACK` entre golpes:
 *
 *     if ( $rand(1,100) < ATTACK2_CHANCE ) setvard ANIM_ATTACK ANIM_LEAP
 *                                         dwarf_zombie_random.script:303
 *     else if( NEXT_ATTACK == 1 ) setvard ANIM_ATTACK ANIM_LEFT
 *                                         boar_base.script:107
 *
 * `ASIGNA` y `ANIMA` van anclados al principio de la línea y no veían ninguna
 * de las dos: el salto del zombi enano (`attack2`) y las cornadas de lado del
 * jabalí no se horneaban, y el visor habría caído a la secuencia 0. El 78 otra
 * vez —*una lista blanca sólo mira donde sabe mirar*—, y esta vez el nombre
 * estaba en la misma línea, a la derecha de un paréntesis.
 */
function sinCondicion(l) {
  let s = l.trim();
  for (let vueltas = 0; vueltas < 4; vueltas++) {
    const e = s.match(/^else\b\s*/i);
    if (e) { s = s.slice(e[0].length); continue; }
    const m = s.match(/^if\s*\(/i);
    if (!m) break;
    // El paréntesis de cierre que casa con el de apertura.
    let hondo = 0, k = m[0].length - 1;
    for (; k < s.length; k++) {
      if (s[k] === "(") hondo++;
      else if (s[k] === ")" && --hondo === 0) break;
    }
    if (hondo !== 0) break;
    s = s.slice(k + 1).trim();
  }
  return s;
}
function lineasDelGuion(raiz, rutaScript, vistos = new Set(), hondo = 0, lineas = []) {
  // Mismo tope de profundidad que `recoger` (src/bsp/script.js:315).
  if (hondo > 8) return lineas;
  const ruta = `${raiz}/${rutaScript.replace(/\\/g, "/")}.script`;
  if (vistos.has(ruta) || !existsSync(ruta)) return lineas;
  vistos.add(ruta);
  const { bloques, incluye } = partirScript(readFileSync(ruta, "latin1"));
  for (const b of bloques) lineas.push(...b);
  for (const inc of incluye) lineasDelGuion(raiz, inc, vistos, hondo + 1, lineas);
  return lineas;
}
/**
 * Los nombres de secuencia que un guion de monstruo puede pedir por comando
 * (`setidleanim`, `setmoveanim`, `playanim <tipo> <anim>`), con sus variables
 * resueltas contra TODAS sus asignaciones. Ver la nota larga en
 * tools/bichos.mjs, apartado 2c, y doc/HORNEADO_93.md.
 *
 * @returns {{nombres: Set<string>, sinResolver: Set<string>}}
 */
export function animacionesDelGuion(raiz, rutaScript) {
  const lineas = lineasDelGuion(raiz, rutaScript);
  const sinResolver = new Set();
  const valores = new Map();        // variable -> Set de valores asignados
  const pedidas = new Set();
  for (const crudo of lineas) {
    const l = sinCondicion(crudo);
    const a = l.match(ASIGNA);
    if (a) {
      if (!valores.has(a[1])) valores.set(a[1], new Set());
      valores.get(a[1]).add(a[2]);
    }
    for (const re of ANIMA) { const m = l.match(re); if (m) pedidas.add(m[1]); }
  }
  const nombres = new Set();
  const resolver = (t, n = 0) => {
    if (n < 8 && valores.has(t)) { for (const v of valores.get(t)) resolver(v, n + 1); return; }
    // Un `$...` es una expresión, un número no es un nombre de secuencia para un
    // monstruo (`SetAnimation` busca por nombre), y `none` es «quitar» (:1462).
    if (/^[$\d'"]/.test(t) || /^none$/i.test(t) || valores.has(t)) {
      sinResolver.add(t);
      return;
    }
    nombres.add(t.toLowerCase());
  };
  for (const p of pedidas) resolver(p);
  return { nombres, sinResolver };
}

// --- y la línea de órdenes, para mirar un modelo suelto ---------------------
if (process.argv[1]?.endsWith("bicho.mjs")) {
  const mapa = mapaDeArgv();
  const pedidos = posicionalesDe().filter((a) => !a.startsWith("--"));
  if (!pedidos.length) {
    console.error("uso: node tools/bicho.mjs <ruta-del-modelo> [...]   p.ej. monsters/goblin_new");
    process.exit(2);
  }
  for (const p of pedidos) {
    try {
      const r = extraerBicho(p.endsWith(".mdl") ? p : `${p}.mdl`, {
        salida: enSalida(mapa, "bichos"), raizSalida: enSalida(mapa),
      });
      if (!r) console.error(`  FALTA ${p}`);
    } catch (e) {
      console.error(`  FALLO: ${e.message}`);
      process.exit(1);
    }
  }
}
