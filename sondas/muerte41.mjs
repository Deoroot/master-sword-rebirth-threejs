// MORIR Y SUBIR DE NIVEL, medidos en el mapa.
//
// Las reglas —el alfa del velo, la cuenta del cartel, dónde nace cada chispa—
// ya las comprueban 38 pruebas de Node. Esto mide lo que ninguna de ellas puede:
// **que en la pantalla del jugador aparezca**.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//   1. el velo se pinta a alfa 1                 -> la pantalla se pone roja opaca
//   2. el velo no se quita al reaparecer         -> vuelves a la vida en rojo
//   3. la cámara se mueve pero no mira al cuerpo -> «se fue la cámara»
//   4. la cámara se queda dentro de una pared    -> negro, y parece que se cuelga
//   5. el centrado sale con el texto de otro     -> «You died» en vez de «has fallen»
//   6. el cartel sale entero de golpe            -> se perdió el efecto 2
//   7. el cartel sale UNA vez                    -> se «arregló» el fallo del motor
//   8. las chispas salen todas blancas           -> el `rendercolor` no llega
//   9. las chispas caen en vez de subir          -> se leyó la gravedad sin el signo
//  10. el sprite es el nuestro y nadie lo dice   -> una medida que no sabe qué mide
//  11. morir abre un panel                       -> vuelve el invento que se retiró

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5213;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
// SE ENTRA POR EL MENÚ, como el jugador (57). Antes era `?map=gatecity`,
// que se salta el menú: carga el nivel y arranca la sesión de una pasada,
// que es un montaje que el jugador no ve nunca. Ver `sondas/entrar.mjs`.
await entrarPorElMenu(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });

/** Las 32 unidades del anillo, para poder medir contra ellas. */
const EFECTO_ANILLO = 32;

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));

// EL BUCLE, PARADO. Todo lo que se mide aquí son relojes —el velo dura dos
// décimas, el cartel escribe una letra cada 0,02 s, la lluvia da cuarenta
// vueltas en cuatro segundos— y con el bucle corriendo el tiempo lo pone el
// navegador: entre dos `evaluate` pasan décimas que no se controlan, y el
// primer intento midió «5 letras ya escritas» en el instante cero. Parado, cada
// paso es exactamente el `dt` que se pide. El dibujo sigue disponible con
// `probe.draw()`, que desde el 41 respeta la cámara de la muerte.
await pag.evaluate(() => window.probe.pause());

// ── 1. SUBIR DE NIVEL ──────────────────────────────────────────────────────
//
// Va primero porque se puede hacer vivo y no ensucia nada. Se dispara a mano
// —`celebrarSubida`, que es la misma función que llama el reparto de
// experiencia— en vez de matar bichos hasta que suba algo: eso tardaría minutos
// y mediría el dado del reparto, que ya tiene sus pruebas.
console.log("\n  SUBIR DE NIVEL");
const sub = await pag.evaluate(() => window.probe.nivel.subir("swordsmanship.proficiency"));
console.log(`    carteles        ${sub.carteles.length}: ${sub.carteles.map((c) => `"${c.texto}"`).join(", ")}`);
control("salen DOS carteles, que es lo que manda el motor",
  sub.carteles.length === 2, `${sub.carteles.length}`);
control("y los dos dicen «Swordsmanship Proficiency +1»",
  sub.carteles.every((c) => c.texto === "Swordsmanship Proficiency +1"),
  sub.carteles.map((c) => c.texto).join(" | "));
control("al 2 % del ancho y al 60 % del alto: 24 y 480 de 1200×800",
  sub.carteles[0]?.x === 24 && sub.carteles[0]?.y === 480,
  `x=${sub.carteles[0]?.x} y=${sub.carteles[0]?.y}`);
// En el instante cero no ha salido NINGUNA letra: la primera sale en 0,02.
control("en el primer fotograma no se lee nada todavía",
  sub.carteles[0]?.salidas === 0, `${sub.carteles[0]?.salidas} letras`);

// Y ahora se deja correr letra a letra. Medio segundo son 25 letras de 28.
const escribiendo = [];
let mitad = null;
for (let i = 0; i < 30; i++) {
  const e = await pag.evaluate(() => window.probe.nivel.paso(0.02));
  escribiendo.push(e.pantalla.carteles[0]?.salidas ?? 0);
  if (i === 9) mitad = e.pantalla.carteles[0];
}
console.log(`    letras          ${escribiendo[0]} → ${escribiendo[9]} → ${escribiendo[19]} → ${escribiendo[29]} de 28`);
control("las letras van saliendo de una en una, no de golpe",
  escribiendo[0] < escribiendo[9] && escribiendo[9] < escribiendo[19],
  escribiendo.slice(0, 12).join(","));
// El positivo de lo de arriba: si saliera todo de golpe, el primer paso ya
// tendría las 28. Y el negativo: a los 0,6 s no puede haber más de 30.
control("y no sale el texto entero en el primer paso",
  escribiendo[0] <= 2, `${escribiendo[0]}`);

// Los colores se miran A MEDIO ESCRIBIR y no al final: acabado, el efecto 2
// deja todas las letras del mismo verde, así que medir ahí daría «un color» y
// no diría nada. Se guarda la foto del paso 10, con la mitad fuera.
const distintos = new Set(mitad?.colores ?? []);
console.log(`    colores         ${distintos.size} distintos en la misma línea`);
// El efecto 2 le da a cada letra un color según cuándo salió: una línea de un
// solo color significa que el efecto no está.
control("las letras de una misma línea NO son todas del mismo color",
  distintos.size > 1, `${[...distintos].slice(0, 3).join(" | ")}`);

const ch0 = await pag.evaluate(() => window.probe.nivel.chispas());
console.log(`    bengala         ${ch0.bengala.cuadros} cuadros, de ${ch0.bengala.de}` +
  `${ch0.bengala.generado ? " (GENERADA por nosotros, no del juego)" : ""}`);
console.log(`    lluvia          ${ch0.total} sitios, ${ch0.vivas} vivas, vuelta ${ch0.vueltas}`);
control("hay 160 sitios de chispa: 40 vueltas por 4",
  ch0.total === 160, `${ch0.total}`);
control("y ya hay chispas vivas alrededor del cuerpo",
  ch0.vivas > 0, `${ch0.vivas}`);
// Que el dibujo sea el de Valve y no el nuestro se DICE, no se da por hecho: si
// falta `npm run efectos` esto sale en rojo y la medida sigue siendo honesta.
control("el dibujo es `xflare1.spr` de verdad, con sus 20 cuadros",
  ch0.bengala.cuadros === 20 && ch0.bengala.generado === false,
  `${ch0.bengala.cuadros} cuadros, ${ch0.bengala.de}`);

// LA LUZ VERDE NO SE VE NUNCA, y lo cazó esta sonda.
//
// El guion enciende `cleffect light new <origin> 200 (0,255,0) 3.0` y acto
// seguido llama a `sprite_spoog` SIN retardo, y lo primero que hace
// `levelup_createsprite` es repintar ESA MISMA luz —`cleffect light LVL_LIGHT`,
// el id que acaba de guardar— con un color al azar. O sea que el verde de tres
// segundos dura cero tics y lo que se ve son diez colores por segundo.
// Está portado con el fallo; se comprueba que el verde se pone y que la primera
// vuelta se lo lleva, que es lo único que se puede afirmar de él.
const antesDeLaVuelta = await pag.evaluate(() => {
  window.probe.nivel.subir("smallarms.balance");
  return window.probe.nivel.chispas();
});
const luzInicial = antesDeLaVuelta.luz?.color ?? [0, 0, 0];
control("la luz arranca VERDE, como dice el guion",
  luzInicial[1] > 200 && luzInicial[0] < 50 && luzInicial[2] < 50, `rgb(${luzInicial.join(",")})`);
const trasUnaVuelta = await pag.evaluate(() => window.probe.nivel.paso(0.001).chispas);
control("y la primera vuelta se la lleva: el verde no llega a verse (fallo portado)",
  (trasUnaVuelta.luz?.color ?? []).join(",") !== "0,255,0", `rgb(${(trasUnaVuelta.luz?.color ?? []).join(",")})`);

// Un segundo de lluvia, y se mira si suben o caen.
let pico = null;
for (let i = 0; i < 50; i++) pico = await pag.evaluate(() => window.probe.nivel.paso(0.02));
const lluvia = pico.chispas;
// El anillo nace 32 unidades POR DEBAJO del origen —0,81 m—, así que «por
// encima del cuerpo» es la vara de medir equivocada: la mitad de las vivas
// acaban de nacer y están abajo, y con esa cuenta el control salía rojo con
// todo bien. Lo que dice si suben es la altura sobre SU anillo.
const RING = -EFECTO_ANILLO / 39.37;
const alturas = lluvia.alturas ?? [];
const subidas = alturas.filter((a) => a > RING + 1).length;
const masAlta = Math.max(RING, ...alturas) - RING;
console.log(`    al segundo      ${lluvia.vivas} vivas, ${subidas} a más de un metro del anillo, ` +
  `la más alta a ${masAlta.toFixed(2)} m sobre él`);
control("las chispas SUBEN: la gravedad del guion es negativa",
  subidas > 0 && masAlta > 2, `${subidas} de ${lluvia.vivas}, hasta ${masAlta.toFixed(2)} m`);
// El positivo: con +400 u/s² durante el segundo que viven, la más vieja tiene
// que estar cerca de los 200 u = 5,08 m y NUNCA por encima.
control("y suben lo que dicen las cuentas: 400 u/s² durante un segundo, ni más",
  masAlta < 200 / 39.37 + 0.1, `${masAlta.toFixed(2)} m contra el techo de 5,08`);
const coloresVivos = new Set((lluvia.colores ?? []).map((c) => c.join(",")));
console.log(`    y de            ${coloresVivos.size} colores distintos a la vez`);
control("y cada una lleva su color: no es una lluvia blanca",
  coloresVivos.size > 3, `${coloresVivos.size} colores`);

// Con el bucle parado hay que pedir el dibujo: si no, la foto es la del último
// fotograma de antes de pausar y la lluvia no sale en ella.
//
// Y se mira HACIA ABAJO para la foto, con su razón: el anillo nace 32 unidades
// por debajo del origen y las chispas miden 16, o sea que en primera persona y
// mirando al frente **caen fuera del cono de visión** hasta que han subido casi
// un metro. Eso no es un fallo del puerto —en el juego pasa lo mismo, la
// geometría es la suya— pero una foto de frente diría «no hay efecto» cuando lo
// que hay es una cámara mirando por encima de él.
await pag.evaluate(() => { window.probe.player.pitch = -0.45; window.probe.draw(); });
await pag.screenshot({ path: "build/gatecity/vistas/nivel41.png" });

// Y se deja acabar: a los cuatro segundos el guion se borra.
for (let i = 0; i < 260; i++) await pag.evaluate(() => window.probe.nivel.paso(0.02));
const fin = await pag.evaluate(() => window.probe.nivel.chispas());
console.log(`    al final        ${fin.vivas} vivas, corriendo ${fin.corriendo}`);
control("a los cinco segundos no queda nada: el efecto se apaga solo",
  fin.corriendo === false && fin.vivas === 0, `${fin.vivas} vivas`);
control("y ha dado las 40 vueltas, ni una más",
  fin.vueltas === 40, `${fin.vueltas}`);

// ── 2. MORIR ───────────────────────────────────────────────────────────────
console.log("\n  MORIR");
const antes = await pag.evaluate(() => ({
  ojo: window.probe.player.eye, oro: window.probe.sesion.vitales().oro,
}));
const muerto = await pag.evaluate(() => {
  const r = window.probe.muerte.matar({ porQue: "la sonda" });
  return { r, pantalla: window.probe.muerte.pantalla(), camara: window.probe.muerte.camara() };
});
console.log(`    centrado        "${muerto.pantalla.centrado.texto}"`);
control("el centrado dice «<nombre> has fallen!» y NO «You died»",
  muerto.pantalla.centrado.visible && /has fallen!$/.test(muerto.pantalla.centrado.texto) &&
  !/you died/i.test(muerto.pantalla.centrado.texto),
  muerto.pantalla.centrado.texto);

console.log(`    velo            ${muerto.pantalla.velo.fondo} (alfa ${muerto.pantalla.velo.alfa} de 255)`);
control("el velo es ROJO y a medias, no opaco",
  /rgba\(255, 0, 0,/.test(muerto.pantalla.velo.fondo) && muerto.pantalla.velo.alfa === 128,
  `${muerto.pantalla.velo.alfa}`);

const c = muerto.camara;
console.log(`    cámara          a ${c.distancia.toFixed(0)} unidades del cuerpo, ` +
  `desviada ${c.delCuerpo === null ? "?" : c.delCuerpo.toFixed(1)}°` +
  `${c.chocada ? " (apoyada en algo)" : ""}`);
control("la cámara deja de estar en el ojo: la vista pasa a otra entidad",
  c.activa === true && c.distancia > 10, `${c.distancia.toFixed(0)} u`);
// 70 de lado y 25 de alto dan 74,3 unidades. Si choca, menos.
control("y se queda a las 74 unidades de libro, o donde la pare la traza",
  c.chocada ? c.distancia < 74.4 : Math.abs(c.distancia - 74.33) < 1.5,
  `${c.distancia.toFixed(1)} u, chocada ${c.chocada}`);
control("MIRA AL CUERPO, que es lo que hace el `+= 180` del motor",
  c.delCuerpo !== null && c.delCuerpo < 2, `${c.delCuerpo?.toFixed(2)}°`);
control("y mira hacia abajo, porque está 25 unidades por encima",
  c.pitch < 0, `cabeceo ${c.pitch.toFixed(3)}`);

// El panel inventado: retirado.
// EL CADÁVER, que es lo que la cámara está mirando. Sin él la cámara del motor
// se aparta y enfoca el aire, y morir se lee como «se ha ido la cámara».
const cuerpo = await pag.evaluate(() => window.probe.muerte.cadaver());
console.log(`    cadáver         ${cuerpo?.puesto ? `de pie con '${cuerpo.secuencia}'` : "NO HAY"}`);
control("hay un cadáver donde te caíste, y es lo que la cámara enfoca",
  cuerpo?.puesto === true, `${cuerpo?.puesto}`);
// Y no está tumbado: `CreateCorpse` copia la secuencia del muerto y la de morir
// está comentada en `Killed`. El cadáver de Master Sword se queda de pie.
control("y NO está tumbado: lleva la animación que llevabas (fallo portado)",
  cuerpo?.secuencia === "attention" || cuerpo?.secuencia === "run", `${cuerpo?.secuencia}`);
const lejos = cuerpo ? Math.hypot(
  cuerpo.pies[0] - antes.ojo[0], cuerpo.pies[2] - antes.ojo[2]) : null;
control("y está donde estabas tú, no en el origen del mapa",
  lejos !== null && lejos < 0.5, `${lejos?.toFixed(2)} m de donde caíste`);

const panel = await pag.evaluate(() => window.probe.interfaz.abierta);
control("morir NO abre ningún panel: el invento se retiró en el 41",
  panel === false, `abierta ${panel}`);

await pag.evaluate(() => window.probe.draw());
await pag.screenshot({ path: "build/gatecity/vistas/muerte41.png" });

// El velo se va en dos décimas. Se avanza y se mira.
const tras = [];
for (let i = 0; i < 12; i++) tras.push(await pag.evaluate(() => window.probe.muerte.paso(0.02)));
console.log(`    el velo         ${tras[0].velo.alfa} → ${tras[4].velo.alfa} → ${tras[11].velo.alfa}`);
control("el velo se va en dos décimas, no se queda quince segundos",
  tras[11].velo.alfa === 0 && tras[4].velo.alfa < 128 && tras[4].velo.alfa > 0,
  `${tras.map((t) => t.velo.alfa).join(",")}`);

const oro = await pag.evaluate(() => window.probe.sesion.vitales().oro);
console.log(`    oro             ${antes.oro} → ${oro} (el impuesto es el 1 %, entero)`);
control("el impuesto se cobra entero, así que con menos de 100 monedas es cero",
  antes.oro < 100 ? oro === antes.oro : oro < antes.oro, `${antes.oro} → ${oro}`);

// ── 3. VOLVER ──────────────────────────────────────────────────────────────
console.log("\n  VOLVER");
const vuelto = await pag.evaluate(async () => {
  window.probe.sesion.tic({ botonPulsado: false });
  window.probe.sesion.tic({ botonPulsado: false });
  window.probe.sesion.tic({ botonPulsado: true });
  await new Promise((r) => setTimeout(r, 300));
  return {
    estado: window.probe.sesion.estado(),
    pantalla: window.probe.muerte.pantalla(),
    camara: window.probe.muerte.camara(),
  };
});
console.log(`    estado          ${vuelto.estado}`);
control("soltar y volver a pulsar te levanta, que es la regla del motor",
  vuelto.estado === "jugando", vuelto.estado);
const traCuerpo = await pag.evaluate(() => window.probe.muerte.cadaver());
control("y el cadáver se va contigo: no quedan dos de ti en la calle",
  traCuerpo?.puesto === false, `${traCuerpo?.puesto}`);
control("y la cámara vuelve al ojo",
  vuelto.camara.activa === false && vuelto.camara.distancia < 1,
  `${vuelto.camara.distancia.toFixed(2)} u`);
control("no te quedas viendo el mundo en rojo",
  vuelto.pantalla.velo.activo === false && vuelto.pantalla.velo.alfa === 0,
  `${vuelto.pantalla.velo.fondo}`);
control("ni con el centrado pegado en la pantalla",
  vuelto.pantalla.centrado.visible === false, `"${vuelto.pantalla.centrado.texto}"`);

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(64)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
