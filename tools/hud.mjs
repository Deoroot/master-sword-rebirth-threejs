import { salidaComun, prepararComunes } from "./recursos.mjs";
// EL HUD DE MASTER SWORD: las cuatro barras y el emblema.
//
//   npm run hud
//
// ── Qué se hornea y por qué así ─────────────────────────────────────────────
//
// Las barras de vida, maná, aguante y peso NO son rectángulos de color: son
// `.spr` de **43 cuadros** de 320×40, y el motor elige el cuadro según lo lleno
// que estés.
//
//     float frame = (m_CurrentAmt / MaxAmt) * LastFrame;   vgui_health.h:102
//     m_Image.SetFrame(frame);
//
// O sea que el «relleno» está dibujado a mano, cuadro a cuadro, con su vidrio,
// su brillo y su marco de metal. Pintarlo con un `div` de color y un `width`
// en porcentaje daría una barra que funciona y no se parece a nada.
//
// Los cuatro archivos miden **lo mismo** —552 070 bytes cada uno— pero no son el
// mismo archivo: son cuatro paletas distintas sobre la misma geometría. Uno de
// los controles de abajo comprueba justo eso, porque copiar cuatro veces el
// mismo `.spr` daría cuatro barras rojas y nadie miraría el tamaño.
//
// El emblema del centro no es un `.spr` sino un `.tga`, y eso lo dice el propio
// motor en la llamada:
//
//     m_HUDImage.LoadImg("hud_main", true, false);          vgui_health.h:177
//                                    ^^^^ TGAorSprite
//
// que `CImageDelayed::LoadImg` resuelve con `MSBitmap::GetTGA` — `gfx/vgui/`.
//
// ── La tira va en VERTICAL ──────────────────────────────────────────────────
//
// `tiraDeSpr` de `src/bsp/sprite.js` emite una tira horizontal, que es lo que le
// conviene a una antorcha en una textura de Three. Aquí el consumidor es un
// `background-position` de CSS sobre un `div` de 320×40, y una tira horizontal
// de 13 760 px de ancho obliga a mover la X — que es exactamente igual de fácil,
// pero deja una imagen de proporción 344:1 que ningún visor de imágenes abre para
// mirarla. En vertical son 320×1720 y se revisa a ojo en dos segundos.
//
// Misma regla de siempre: **el lector es nuestro, el contenido no se copia.** Lo
// extraído vive en `build/msr/hud/`, que está en `.gitignore`, y **no se
// mueve un byte a `public/`**.

import { writeFileSync, mkdirSync, existsSync, appendFileSync, readFileSync } from "node:fs";

import { leerSpr } from "../src/bsp/sprite.js";
import { decodificarTga } from "../src/bsp/tga.js";
import { escribirPng } from "./png.mjs";
import { COLORES_DE_SUCESO, CVARS, LIENZO } from "../src/play/hud.js";

const ASSETS = process.argv[2] ?? "../MSC/assets/msr";
const SALIDA = salidaComun("hud");
prepararComunes();

if (!existsSync(`${ASSETS}/sprites/hud`)) {
  console.error(`No encuentro ${ASSETS}/sprites/hud. Pásame la carpeta del juego.`);
  process.exit(1);
}

/**
 * Las cuatro barras, con el nombre que les da el motor y el que les damos.
 *
 * El orden es el del `switch (Type)` de `VGUI_Bar` (vgui_health.h:34-47), no el
 * de la pantalla: en la pantalla el peso va debajo de la vida y el aguante
 * debajo del maná, que es otra cosa y está en `disposicionDelHud()`.
 */
const BARRAS = [
  { tipo: 0, clave: "vida", spr: "healthbar", que: "player.m_HP / player.MaxHP()" },
  { tipo: 1, clave: "mana", spr: "manabar", que: "player.m_MP / player.MaxMP()" },
  { tipo: 2, clave: "peso", spr: "weightbar", que: "player.Weight() / player.Volume()" },
  { tipo: 3, clave: "aguante", spr: "stambar", que: "player.Stamina / player.MaxStamina()" },
];

/** Los cuadros de un `.spr` apilados en vertical, en RGBA. */
function tiraVertical(spr) {
  const { ancho, alto } = spr.cuadros[0];
  for (const c of spr.cuadros) {
    if (c.ancho !== ancho || c.alto !== alto) {
      throw new Error(`${spr.ruta}: los cuadros no miden todos lo mismo`);
    }
  }
  const n = spr.cuadros.length;
  const rgba = new Uint8Array(ancho * alto * n * 4);
  const recortado = spr.mezcla === "alfa_recortado";
  for (let f = 0; f < n; f++) {
    const c = spr.cuadros[f];
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const i = c.indices[y * ancho + x];
        const dst = ((f * alto + y) * ancho + x) * 4;
        // El índice 255 es el transparente de un `.spr` recortado por alfa. Es
        // la diferencia entre un marco de metal sobre la cueva y un rectángulo
        // negro de 320×40 tapando media pantalla.
        if (recortado && i === 255) continue;
        const p = Math.min(i, spr.nColores - 1) * 3;
        rgba[dst] = spr.paleta[p];
        rgba[dst + 1] = spr.paleta[p + 1];
        rgba[dst + 2] = spr.paleta[p + 2];
        rgba[dst + 3] = 255;
      }
    }
  }
  return { rgba, ancho, alto: alto * n, cuadros: n, anchoCuadro: ancho, altoCuadro: alto };
}

/** Cuántos píxeles opacos tiene un cuadro, y de qué color medio. Para los controles. */
function medirCuadro(tira, f) {
  const { anchoCuadro: w, altoCuadro: h, rgba } = tira;
  let n = 0, r = 0, g = 0, b = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((f * h + y) * w + x) * 4;
      if (!rgba[i + 3]) continue;
      n++; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2];
    }
  }
  return { opacos: n, r: n ? r / n : 0, g: n ? g / n : 0, b: n ? b / n : 0 };
}

mkdirSync(SALIDA, { recursive: true });

const barras = {};
const tiras = {};
let bytes = 0;

for (const b of BARRAS) {
  const spr = leerSpr(`${ASSETS}/sprites/hud/${b.spr}.spr`);
  const tira = tiraVertical(spr);
  tiras[b.clave] = { spr, tira };
  const n = escribirPng(`${SALIDA}/${b.clave}.png`, tira.rgba, tira.ancho, tira.alto);
  bytes += n;
  barras[b.clave] = {
    tipo: b.tipo,
    archivo: `hud/${b.clave}.png`,
    de: `sprites/hud/${b.spr}.spr`,
    que: b.que,
    cuadros: tira.cuadros,
    ancho: tira.anchoCuadro,
    alto: tira.altoCuadro,
    // El alto de la tira entera, que es lo que hace falta para el
    // `background-size` de CSS y lo que más fácil se calcula mal.
    altoDeLaTira: tira.alto,
    mezcla: spr.mezcla,
    bytes: n,
  };
}

// EL EMBLEMA. `LoadImg("hud_main", true, ...)` con `true` = TGA, y `MSBitmap`
// los busca en `gfx/vgui/`. Hay un `hud_main2.tga` de 1024×768 al lado que el
// código NO carga —y un `hud_main3` que sólo aparece comentado en el HUD retro
// (vgui_healthretro.h:165)—, así que se hornea el que se usa y se dice que los
// otros están.
const tgaEmblema = decodificarTga(readFileSync(`${ASSETS}/gfx/vgui/hud_main.tga`), "hud_main");
const bytesEmblema = escribirPng(`${SALIDA}/emblema.png`, tgaEmblema.rgba, tgaEmblema.ancho, tgaEmblema.alto);
bytes += bytesEmblema;
const emblema = {
  archivo: "hud/emblema.png",
  de: "gfx/vgui/hud_main.tga",
  ancho: tgaEmblema.ancho,
  alto: tgaEmblema.alto,
  conAlfa: tgaEmblema.conAlfa,
  bytes: bytesEmblema,
};

// ── CONTROLES ───────────────────────────────────────────────────────────────
const malos = [];
const control = (que, bien, detalle = "") => {
  if (!bien) malos.push(`${que} — ${detalle}`);
  console.log(`  ${bien ? "ok  " : "MAL "} ${que.padEnd(58)} ${detalle}`);
};
console.log("\n  CONTROLES");

// 1. EL ORÁCULO DEL RECORRIDO. Un `.spr` mal recorrido no da error: da cuadros
//    leídos desde el sitio equivocado, que es ruido con forma de imagen. El
//    control es que el recorrido acabe en el último byte del archivo.
for (const b of BARRAS) {
  const { spr } = tiras[b.clave];
  control(`${b.spr}.spr se recorre entero`, spr.cuadra,
    `${spr.fin} de ${spr.bytes} bytes, ${spr.cuadros.length} cuadros de ${spr.cuadros[0].ancho}×${spr.cuadros[0].alto}`);
}

// 2. Las cuatro son la misma geometría. Si una trae otro número de cuadros, el
//    `LastFrame` del motor cambia y la barra se llena a otro ritmo.
const cuadros = new Set(BARRAS.map((b) => barras[b.clave].cuadros));
control("las cuatro barras tienen los mismos 43 cuadros",
  cuadros.size === 1 && cuadros.has(43),
  [...cuadros].join(", "));

// 3. Y NO SON EL MISMO ARCHIVO CUATRO VECES. Los cuatro `.spr` pesan
//    exactamente 552 070 bytes, así que el tamaño no distingue nada: lo que
//    distingue es el color. La vida tira a rojo y el maná a azul.
const lleno = Object.fromEntries(BARRAS.map((b) => [b.clave, medirCuadro(tiras[b.clave].tira, barras[b.clave].cuadros - 1)]));
control("la barra de vida es más roja que azul", lleno.vida.r > lleno.vida.b,
  `rgb(${lleno.vida.r.toFixed(0)}, ${lleno.vida.g.toFixed(0)}, ${lleno.vida.b.toFixed(0)})`);
control("la de maná es más azul que roja", lleno.mana.b > lleno.mana.r,
  `rgb(${lleno.mana.r.toFixed(0)}, ${lleno.mana.g.toFixed(0)}, ${lleno.mana.b.toFixed(0)})`);
control("las cuatro llenas son cuatro colores distintos",
  new Set(BARRAS.map((b) => `${lleno[b.clave].r.toFixed(0)},${lleno[b.clave].g.toFixed(0)},${lleno[b.clave].b.toFixed(0)}`)).size === 4,
  BARRAS.map((b) => b.clave).join(" / "));

// 4. EL RELLENO CRECE — Y NO SE LLENA COMO YO CREÍA.
//
//    El primer control que escribí contaba píxeles opacos, dando por hecho que
//    el vaso se llena apareciendo. Suspendió las cuatro barras con el mismo
//    número clavado: **9 864 en los 43 cuadros**. El dibujo no crece, CAMBIA DE
//    COLOR — el marco de cuero y el vidrio están en todos los cuadros y lo que
//    se pinta es el líquido de dentro.
//
//    Así que el oráculo bueno es el brillo medio del canal que le toca a cada
//    barra: 23,6 en el cuadro 0 y 84,5 en el 42 para la vida. Con la zancada mal
//    calculada los cuadros salen mezclados y esto deja de crecer enseguida.
const CANAL = { vida: "r", mana: "b", peso: "r", aguante: "g" };
for (const b of BARRAS) {
  const t = tiras[b.clave].tira;
  const n = barras[b.clave].cuadros;
  const k = CANAL[b.clave];
  const a = medirCuadro(t, 0)[k], m = medirCuadro(t, n >> 1)[k], z = medirCuadro(t, n - 1)[k];
  control(`${b.clave}: el líquido sube del cuadro 0 al ${n - 1}`, a < m && m < z,
    `${k} medio ${a.toFixed(1)} < ${m.toFixed(1)} < ${z.toFixed(1)}`);
}

// 5. El emblema, que es lo único que no es un `.spr`.
control("el emblema es un TGA de 128×128 de 32 bits",
  emblema.ancho === 128 && emblema.alto === 128 && tgaEmblema.bpp === 32,
  `${emblema.ancho}×${emblema.alto}, ${tgaEmblema.bpp} bits`);
{
  // Y NO TIENE TRANSPARENCIA, aunque tenga canal alfa: los 16 384 píxeles
  // valen 255. Es un escudo heráldico sobre una placa de piedra CUADRADA, y por
  // eso la disposición lo mete justo en la juntura de las cuatro barras — no
  // recorta nada, tapa. Dicho aquí porque el que vea «32 bits» va a suponer
  // que hay alfa y va a dibujarlo esperando un contorno.
  const opacos = [...tgaEmblema.rgba.filter((_, i) => i % 4 === 3)].filter((a) => a === 255).length;
  control("y es OPACO entero: el alfa está a 255 en los 16 384 píxeles",
    opacos === 128 * 128, `${opacos} de ${128 * 128}`);
}

// 6. LA DISPOSICIÓN, que es la rareza gorda de este HUD y conviene verla escrita.
//
//    BAR_SCALE = 1 - ((730 - ancho*0.40) / alto)            vgui_health.h:9
//
//    No es «escala = alto/480». Es una resta contra 730 dividida por el alto, y
//    eso hace que las barras CREZCAN en pantallas anchas y DESAPAREZCAN en las
//    estrechas. A 640×480 la escala sale 0,0125: barras de cuatro píxeles.
for (const [w, h, espera] of [[640, 480, "diminutas"], [1024, 768, "normales"], [1920, 1080, "grandes"]]) {
  const d = LIENZO(w, h);
  console.log(`       ${String(w).padStart(4)}×${h}  escala ${d.escala.toFixed(3)}  barra ${d.anchoBarra.toFixed(0)}×${d.altoBarra.toFixed(0)}  (${espera})`);
}
control("a 640×480 las barras del motor miden menos de diez píxeles de ancho",
  LIENZO(640, 480).anchoBarra < 10,
  `${LIENZO(640, 480).anchoBarra.toFixed(1)} px — es del motor, no nuestro`);
control("a 1920×1080 miden más que el sprite original",
  LIENZO(1920, 1080).anchoBarra > 320,
  `${LIENZO(1920, 1080).anchoBarra.toFixed(1)} px de 320`);

// ── EL FICHERO ──────────────────────────────────────────────────────────────
writeFileSync(`${SALIDA}/../hud.json`, JSON.stringify({
  procedencia: {
    assets: ASSETS,
    cuando: new Date().toISOString().slice(0, 10),
    nota: "Extraído de una instalación de Master Sword Rebirth. No se distribuye.",
  },
  barras,
  emblema,
  // Los seis colores de suceso y los cvars van también aquí, para que el
  // fichero se pueda leer solo y se vea de dónde sale cada número.
  colores: COLORES_DE_SUCESO,
  cvars: CVARS,
}, null, 1));

// ── LA PROCEDENCIA ─────────────────────────────────────────────────────────
const PROC = salidaComun("PROCEDENCIA.md");
const MARCA = "## El HUD";
if (existsSync(PROC) && !readFileSync(PROC, "utf8").includes(MARCA)) {
  appendFileSync(PROC, `
${MARCA}

\`hud.json\` y \`hud/*.png\` los escribe \`node tools/hud.mjs\`. Son cinco imágenes:
las cuatro barras de \`sprites/hud/*.spr\` —43 cuadros de 320×40 cada una, apilados
en vertical— y el emblema de \`gfx/vgui/hud_main.tga\`, 128×128 con alfa.

Las barras no son rectángulos de color: el relleno está DIBUJADO cuadro a cuadro,
y el motor elige el cuadro con \`(actual/máximo) × 42\`. Por eso se hornean enteras
y no se reinventan.

Vale lo de siempre: **está en \`build/\`, que está en \`.gitignore\`, y no se mueve
un byte a \`public/\`.**
`);
}

console.log(`\n  4 barras de ${barras.vida.cuadros} cuadros y 1 emblema, ${(bytes / 1024).toFixed(0)} KB`);
console.log(`\n  escrito en      build/msr/hud.json\n`);
if (malos.length) {
  console.error(`  ${malos.length} controles en rojo:\n${malos.map((m) => `    ${m}`).join("\n")}`);
  process.exit(1);
}
