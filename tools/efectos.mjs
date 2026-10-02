import { salidaComun, prepararComunes } from "./recursos.mjs";
// LOS SPRITES DE LOS EFECTOS: los que no cuelgan de una entidad del mapa.
//
// `npm run gatecity` ya hornea los `.spr` que el `.bsp` nombra —las 55 antorchas
// y los 23 halos de las lámparas—, porque los encuentra recorriendo las
// entidades. Los efectos de guion no están en el `.bsp`: están escritos dentro
// de un `.script` que corre en el cliente, así que nadie los ve al leer el mapa
// y hasta ahora no se horneaba ninguno.
//
// De momento hace falta uno, el de subir de nivel:
//
//     cleffect tempent sprite xflare1.spr START_POS setup_levelup_sprite
//                                     player/player_conartist.script:107-119
//
// ── Y no está en `../MSC/`, igual que un tercio de los sonidos ──────────────
//
// Los 118 sprites de `assets/msr/sprites/` se listaron y `xflare1.spr` no es uno
// de ellos: **es del Half-Life base**. O sea exactamente el caso de `pl_step*` y
// de `glow01.spr`, y se trata igual, que es la única forma de no volver a
// tropezar con lo mismo:
//
//   1. si está en el mod, manda el mod;
//   2. si no, se busca en `valve/` de una instalación de Half-Life, y lo que
//      salga de ahí **es de Valve**, se dice aparte y no se puede redistribuir;
//   3. y si tampoco, se genera el sustituto de `src/bsp/halo.js`, que es nuestro,
//      tiene UN cuadro en vez de veinte y sale marcado `generado: true`.
//
// El camino 3 es el de la build de Xash3D, y se puede forzar con `HALFLIFE=none`
// aunque haya Half-Life instalado — por lo mismo que en `tools/sonido.mjs`: un
// camino que no se puede ejercitar se pudre sin que nadie se entere.
//
// Lo medido con la instalación al lado, y vale la pena porque confirma el guion:
// `xflare1.spr` tiene **20 cuadros** y mezcla **aditiva**, que es justo lo que le
// pide `setup_levelup_sprite` con su `frames 20` y su `rendermode add`. El guion
// no se inventaba los números.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { leerSpr, tiraDeSpr } from "../src/bsp/sprite.js";
import { SUSTITUTOS } from "../src/bsp/halo.js";
import { escribirPng } from "./png.mjs";

const MSC = "../MSC/assets/msr";
const SALIDA = salidaComun();
prepararComunes();

/** Los que hacen falta, con quién los pide. La lista corta crece con los efectos. */
const PEDIDOS = [
  { archivo: "xflare1.spr", quien: "la lluvia de subir de nivel (player_conartist.script:107)" },
];

// La misma búsqueda de `tools/sonido.mjs`, con las mismas reglas: si se pide una
// ruta manda ella sola y si es mala se para, en vez de caer calladamente en la
// instalación de Steam y hornear otra cosa.
const PEDIDA = process.env.HALFLIFE;
const CANDIDATOS = PEDIDA === "none" ? []
  : PEDIDA ? [PEDIDA]
  : [
    "C:/Juegos/Steam/steamapps/common/Half-Life",
    "C:/Program Files (x86)/Steam/steamapps/common/Half-Life",
  ];
const RAIZ_HL = CANDIDATOS.find((d) => existsSync(`${d}/valve/sprites`)) ?? null;
const VALVE = RAIZ_HL ? `${RAIZ_HL}/valve` : null;
if (PEDIDA && PEDIDA !== "none" && !RAIZ_HL) {
  console.error(`  FALLO: HALFLIFE=${PEDIDA} y ahí no hay 'valve/sprites'.`);
  process.exit(1);
}

console.log("EFECTOS compartidos de Master Sword\n");
mkdirSync(`${SALIDA}/spr`, { recursive: true });

const catalogo = { version: 1, sprites: {} };
const deHalfLife = [];
const generados = [];

for (const p of PEDIDOS) {
  const base = p.archivo.toLowerCase();
  const enMsc = `${MSC}/sprites/${p.archivo}`;
  const enValve = VALVE ? `${VALVE}/sprites/${p.archivo}` : null;
  const ruta = existsSync(enMsc) ? enMsc : (enValve && existsSync(enValve) ? enValve : null);
  const salida = `spr/${base.replace(/\.spr$/i, "")}.png`;

  if (ruta) {
    const spr = leerSpr(ruta);
    if (!spr.cuadra) {
      console.error(`  FALLO: ${p.archivo} no cuadra: acaba en ${spr.fin} de ${spr.bytes} bytes`);
      process.exit(1);
    }
    const tira = tiraDeSpr(spr);
    escribirPng(`${SALIDA}/${salida}`, tira.rgba, tira.ancho, tira.alto);
    if (ruta === enValve) deHalfLife.push(p.archivo);
    catalogo.sprites[base] = {
      archivo: salida,
      cuadros: tira.cuadros,
      anchoCuadro: tira.anchoCuadro, altoCuadro: tira.altoCuadro,
      mezcla: spr.mezcla, orientacion: spr.orientacion,
      generado: false,
      de: ruta === enValve ? "valve" : "msr",
    };
    console.log(`  ${p.archivo.padEnd(16)}${tira.cuadros} cuadros de ${tira.anchoCuadro}×${tira.altoCuadro}, ` +
      `mezcla ${spr.mezcla}, de ${ruta === enValve ? "valve/ (VALVE)" : "el mod"}`);
    continue;
  }

  const sus = SUSTITUTOS[base];
  if (!sus) {
    // No se inventa nada para lo que no tiene sustituto declarado: se dice que
    // falta. Un sustituto para cualquier cosa convierte «falta» en «no falta».
    console.log(`  ${p.archivo.padEnd(16)}FALTA y no hay sustituto declarado — ${p.quien} se quedará sin dibujo`);
    continue;
  }
  const tira = sus.generar();
  escribirPng(`${SALIDA}/${salida}`, tira.rgba, tira.ancho, tira.alto);
  generados.push(p.archivo);
  catalogo.sprites[base] = {
    archivo: salida,
    cuadros: tira.cuadros, anchoCuadro: tira.anchoCuadro, altoCuadro: tira.altoCuadro,
    mezcla: sus.mezcla, orientacion: sus.orientacion,
    generado: true, porque: sus.porque, de: "nuestro",
  };
  console.log(`  ${p.archivo.padEnd(16)}GENERADO: ${sus.porque}`);
}

writeFileSync(`${SALIDA}/efectos.json`, JSON.stringify(catalogo, null, 2));

if (deHalfLife.length) {
  console.log(`\n  DE HALF-LIFE    ${deHalfLife.join(", ")}`);
  console.log(`                  de ${VALVE}`);
  console.log(`                  el mod los hereda de 'valve/' al correr con hl.exe. Son de VALVE:`);
  console.log(`                  el equipo de MSR no puede dar permiso sobre ellos.`);
}
if (generados.length) {
  console.log(`\n  GENERADOS       ${generados.join(", ")}: nuestros, no del juego`);
}
console.log(`\n  catálogo        ${SALIDA}/efectos.json`);
