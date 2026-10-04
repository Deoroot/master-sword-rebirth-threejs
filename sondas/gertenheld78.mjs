// EL AVENTURERO SALUDA Y EL FANTASMA SE DESVANECE — experimento 78.
//
//   npm run sonda:gertenheld78
//
// El 77 dejó escritas las dos ramas que faltaban de `ms_npcscript` —el tipo 1
// (`SCRIPT_PLAYANIM`) y el tipo 3 (`MOVE_PLAYANIM`)— y las declaró PENDIENTES
// en vez de contarlas verdes, porque **no hay ni una sola en Gate City ni en
// Edana**. Son 25 en el juego, repartidas por diez mapas que este puerto no
// tenía. Un control que no se puede recorrer no se cuenta: eso es el apartado 4
// de CLAUDE.md, la variante del 50.
//
// Esta sonda existe porque ya hay dónde recorrerlas.
//
// ── POR QUÉ ESTE MAPA Y NO OTRO ───────────────────────────────────────────
//
// De los diez, `gertenheld_forest2` es el único donde **los dos tipos cuelgan
// de un `trigger_once` SIN NOMBRE**, o sea del pie del jugador, sin pasar por
// una misión que haya que completar antes. Los demás los enciende un
// `multi_manager` que a su vez espera a un diálogo o a una muerte. Si su camino
// no pasa por `menuselect`, no cuenta — y tampoco cuenta si para llegar al
// control hay que hacer trampa a mitad.
//
// ── LA CADENA ─────────────────────────────────────────────────────────────
//
//   al entrar: ms_monsterspawn CriticalNPCsSpawn y HomesteadGhost no esperan a
//        nadie (`porDisparo` falso) y sacan a Jerdid y a Gurukk en 1-2 s
//
//   el jugador entra en un trigger_once (*120, sin nombre)
//        └──► ms_npcscript JerdidIntroduction  type 1  actionanim wave
//                 └──► Jerdid saluda, quieto, y se suelta al acabar
//
//   el jugador entra en el trigger_once ScareJerdid (*153)
//        └──► multi_manager ScareMM  (Scareboi va con 0,5 s de RETRASO)
//                 └──► ms_npcscript Scareboi  type 1  actionanim fear2
//                          └──► Jerdid se gira 151° y se asusta
//
//   el jugador entra en un trigger_once (*152, sin nombre)
//        └──► trigger_relay HearPlayers
//                 └──► ms_npcscript Ghostturn  type 3  moveanim walk
//                          actionanim anim_seal  angles 0 259 0  firedelay .2
//                          └──► anda, se gira 169°, sella
//                          └──► 0,2 s después: SkeletonVanish
//                                    └──► killtarget Gurukk: el fantasma se va
//
// ── LO QUE NO ES COMO PARECE ──────────────────────────────────────────────
//
// 1. **EL SITIO DONDE NACE GURUKK ESTÁ A 2 UNIDADES DE SU ESCENA**, y su
//    proximidad es 35,2. O sea que un control anclado en su punto de nacer
//    —«ha llegado a `Ghostturn`»— sería verde antes de que pasara nada: es el
//    valor de reposo del 77 con `edrinspot`, otra vez.
//
//    Y aquí hay una vuelta de tuerca que se vio midiendo y no leyendo: **el
//    fantasma PASEA**, así que cuando la escena arranca puede estar a 2
//    unidades o a 140. La primera pasada lo pilló a 138. El mapa dice que no
//    debería: su entidad trae `params "set_no_roam;..."` y **este puerto no lee
//    los `params` de un `ms_npc`** — ni una línea en `src/` los mira. Queda
//    contado abajo, no arreglado.
//
//    Consecuencia para la medida: **lo andado no se supone, se mide y se
//    imprime**. Lo que este caso recorre y el 77 no podía es la transición
//    `case SCRIPT_MOVE_PLAYANIM: PlayAnim()` (npcact.cpp:255), que ocurre haya
//    andado mucho o poco.
//
// 2. **`JerdidIntroduction` LO GIRA TRES GRADOS.** `PlayAnim` hace
//    `pMonster->pev->angles = pev->angles` (:193), y Jerdid nace mirando a 325
//    mientras esa escena pide 322. Un control «se ha puesto a mirar al rumbo
//    del mapa» sería verde antes de que pasara nada. El que lo prueba es
//    `Scareboi`, que pide 174: eso son 151 grados.
//
// 3. **ANTES DE ESTE EXPERIMENTO LA ANIMACIÓN NO ESTABA HORNEADA.** La lista
//    blanca de `tools/bichos.mjs` salía de la ficha del NPC, y `actionanim` no
//    está en ninguna ficha: es del `.bsp`. Así que el modelo de Jerdid llegaba
//    con 11 de sus 129 secuencias y sin `wave` ni `fear2`. No daba error: el
//    visor cae a la secuencia 0 y el NPC «hace» la escena quieto en su pose de
//    reposo. Por eso aquí se mide `animacion` —la que SE PUSO, leída del
//    mezclador— y no sólo `animPedida`.
//
// 4. **LOS 74 BICHOS NACEN DORMIDOS Y SE DESPIERTAN SOLOS.** Este mapa no
//    tiene un solo `ms_npc` suelto: todos salen de un `ms_monsterspawn`. La
//    primera versión de esta sonda afirmaba «al entrar no hay nadie» y se iba a
//    pisar las dos áreas para sacarlos — y salió roja, con razón: las dos
//    tienen `porDisparo` falso, o sea `this.activa = true` de nacimiento
//    (`src/play/aparecer.js:136`), y sueltan a los suyos en 1-2 s sin que nadie
//    las toque. El `trigger_once` que las nombra es un segundo camino que el
//    mapa trae y que aquí no hace falta.
//
// 5. **LAS FOTOS NO SE HACEN DESDE DENTRO DEL DISPARADOR.** La primera versión
//    pisaba el volumen y fotografiaba desde ahí, y las tres capturas salieron
//    IDÉNTICAS byte a byte: el centro de un `trigger_once` puede caer dentro de
//    un tronco o bajo tierra, y entonces la cámara dibuja siempre lo mismo
//    mirara a donde mirara. Los píxeles decían 0 con la animación corriendo.
//    Ahora hay un MIRADOR fijo al lado del NPC: se fotografía desde ahí, se va
//    a pisar el volumen y se vuelve al mirador a fotografiar. Las animaciones
//    duran 1,86 s (`wave`), 2,28 s (`fear2`) y 3,47 s (`anim_seal`), así que el
//    viaje de ida y vuelta —medio segundo— cabe de sobra. Es el primo del 76:
//    antes de contar píxeles, que algo distinto de tu aritmética diga que la
//    cosa se ve.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
//   lo que se vería                  lo que estaría pasando
//   ──────────────────────────────── ────────────────────────────────────────
//   «Jerdid mira al rumbo del mapa»  no se ha movido: 325 contra 322. El giro
//                                    se mide con `Scareboi`, que pide 174
//   «el tipo 1 no mueve al NPC»      puede que la escena ni haya arrancado. Al
//                                    lado va la pantalla, que SÍ cambia: está
//                                    animando sin moverse del sitio
//   `animPedida` dice `fear2`        eso es lo que se pidió. Lo que se puso lo
//                                    dice `animacion`, y es lo que se rompía
//                                    cuando la secuencia no estaba horneada
//   «Gurukk ha llegado»              siempre lo estuvo: 2 u contra 35,2. Lo
//                                    que se mide es la transición a animar
//   el fantasma desaparece           podría haberlo matado otra cosa. Se lee
//                                    el diario y el `killtarget` de la relé
//   los píxeles cambian              es un bosque con 74 bichos. Se mide el
//                                    suelo de ruido antes de disparar nada
//
// ── LO QUE ESTA SONDA NO MIDE ─────────────────────────────────────────────
//
//   El `reqhp 750` de Gurukk: el `.bsp` pide 750 de vida sumada entre los
//   jugadores para sacarlo y el horneado no se lo lleva, así que aquí sale con
//   uno. Queda contado, no portado.
//   Los `params` de un `ms_npc` —`set_no_roam`, `set_race`— que nadie lee.
//   El reajuste al hueso 0 de `AnimateThink` (:277-287).
//   Cuánto anda el tipo 3: se imprime, no se afirma (aviso 1).

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { leerPng } from "../tools/png.mjs";
import { readFileSync, existsSync, mkdirSync } from "node:fs";

const PORT = 5278;
const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

const MAPA = "gertenheld_forest2";
const VISTAS = `build/${MAPA}/vistas`;
mkdirSync(VISTAS, { recursive: true });
const U = 39.37;

/**
 * Cuántos píxeles cambian entre dos capturas, **dentro de una ventana**.
 *
 * LA VENTANA NO ES UN ADORNO: este mapa hornea **90 atlas de parpadeo**, o sea
 * que la luz del bosque entero cambia entre fotograma y fotograma. Contando la
 * pantalla completa, dos capturas seguidas sin tocar nada daban **467 456 px
 * de 960 000** —la mitad— y contra ese suelo no hay señal que sobresalga: el
 * saludo daba 624 638, o sea 1,3 veces el ruido. Es la lección del 76 con otra
 * ropa: *un recuento global mide el ruido y no el plato*.
 *
 * `caja` es `{x, y, r}` en píxeles de pantalla, de `puntoEnPantalla`.
 */
// Y EL UMBRAL ES 60 Y NO 8. Con el de siempre, en este bosque oscuro el ruido
// se come la señal: medido sobre las mismas capturas, a umbral 8 la señal era
// 1,16 veces el ruido y a 330 seguía en 1,43 — nunca el triple.
//
// ── LO QUE PROBÉ Y NO HACÍA FALTA, que también va escrito ──────────────────
//
// Antes de la ventana escribí una normalización de brillo: dividir por la
// media antes de restar, con el razonamiento de que el parpadeo escala el
// brillo de todo por igual y una animación cambia la forma. Sonaba bien y
// **no hace nada**: con la ventana puesta, el ruido pasa de 1 946 a 1 998 y la
// señal de 9 889 a 10 962, o sea de 5,08 a 5,49 veces. Y romperla a propósito
// dejó la sonda en 49 de 49 **tres pasadas seguidas**.
//
// Lo que sí hace el trabajo es LA VENTANA: en la misma pasada, la pantalla
// entera da 56 918 de ruido contra 107 467 de señal —1,89 veces, que no pasa—
// y la ventana da 1 946 contra 9 889, que son 5,08. Es la lección del 76 tal
// cual: *un recuento global mide el ruido y no el plato*.
//
// La pasada que me hizo escribir la normalización tenía 26 586 de ruido EN LA
// VENTANA, y eso no era el parpadeo: era algo cruzando el cuadro —este mapa
// tiene dos jabalíes corriendo escenas del tipo 0 todo el rato— y contra eso
// la normalización tampoco habría servido. Diagnostiqué el mecanismo por lo
// que parecía y no por lo que medí.
const UMBRAL = 60;
function cambian(a, b, caja = null) {
  if (!a || !b) return { n: -1, de: 0, sinFoto: true };
  const A = leerPng(a), B = leerPng(b);
  if (A.rgba.length !== B.rgba.length) return { n: -1, de: 0 };
  const ancho = A.ancho;
  const fuera = (p) => {
    if (!caja) return false;
    const x = p % ancho, y = Math.floor(p / ancho);
    return Math.abs(x - caja.x) > caja.r || Math.abs(y - caja.y) > caja.r;
  };
  let n = 0, de = 0;
  for (let i = 0; i < A.rgba.length; i += 4) {
    if (fuera(i / 4)) continue;
    de++;
    const d = Math.abs(A.rgba[i] - B.rgba[i]) + Math.abs(A.rgba[i + 1] - B.rgba[i + 1]) +
      Math.abs(A.rgba[i + 2] - B.rgba[i + 2]);
    if (d > UMBRAL) n++;
  }
  return { n, de };
}

/** La ventana de pantalla donde cae un NPC, al que se le ve de cuerpo entero. */
const ventanaDe = async (nodo, r = 110) => {
  const p = await pag.evaluate((q) => window.probe.mundo.puntoEnPantalla(q), [nodo[0], nodo[1] + 0.9, nodo[2]]);
  return p && p.dentro ? { x: p.x, y: p.y, r } : null;
};

const foto = async (nombre) => {
  const ruta = `${VISTAS}/gertenheld78-${nombre}.png`;
  await pag.screenshot({ path: ruta });
  return ruta;
};

/** La distancia horizontal entre dos puntos de escena, en METROS. */
const plano = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/**
 * EL CENTRO de la caja de un `trigger_*`, en los tres ejes.
 *
 * La primera versión usaba `min[1] + 0.3`, el suelo de la caja, copiando la
 * idea de «ponerse de pie dentro». En una caja alta eso es el sótano: el
 * jugador aparecía dentro del terreno. Lo que hace falta es tocar el volumen,
 * y para eso el centro vale y no supone nada sobre dónde está su suelo.
 */
const dentroDe = (t) => [
  (t.caja.min[0] + t.caja.max[0]) / 2,
  (t.caja.min[1] + t.caja.max[1]) / 2,
  (t.caja.min[2] + t.caja.max[2]) / 2,
];

try {

// ── 0. EL HORNEADO, antes de abrir el navegador ────────────────────────────
const malla = JSON.parse(readFileSync(`build/${MAPA}/malla.json`, "utf8"));
const censo = JSON.parse(readFileSync(`build/${MAPA}/bichos.json`, "utf8"));
const disp = malla.disparadores ?? [];
const scripts = disp.filter((d) => d.clase === "ms_npcscript" || d.clase === "mstrig_act");
const porNombre = (n) => scripts.find((d) => d.nombre === n);
const quienDispara = (n) => disp.find((d) => d.objetivo === n && d.caja);

const intro = porNombre("JerdidIntroduction");
const susto = porNombre("Scareboi");
const fantasma = porNombre("Ghostturn");

console.log(`\n  EL HORNEADO: LOS \`ms_npcscript\` DE ${MAPA}
    en total          ${scripts.length}
    por tipo          ${[0, 1, 2, 3, 4].map((t) => `${t}:${scripts.filter((d) => (d.tipo ?? 0) === t).length}`).join("  ")}
    ${[intro, susto, fantasma].map((d) => `${String(d.nombre).padEnd(20)} tipo ${d.tipo}  -> ${d.npc}` +
      `  actionanim ${String(d.animDeAccion ?? "-").padEnd(10)} angles ${(d.angulos ?? []).join(" ")}` +
      `${d.alAcabar ? `  firewhendone ${d.alAcabar} (+${d.retrasoAlAcabar}s)` : ""}`).join("\n    ")}`);

control("el mapa trae DOS escenas del tipo 1 y UNA del tipo 3",
  scripts.filter((d) => d.tipo === 1).length === 2 && scripts.filter((d) => d.tipo === 3).length === 1,
  `1:${scripts.filter((d) => d.tipo === 1).length}  3:${scripts.filter((d) => d.tipo === 3).length}`);
control("y los dos tipos los enciende un volumen que se pisa, no un atajo",
  Boolean(quienDispara("JerdidIntroduction")) && Boolean(quienDispara("HearPlayers")),
  "trigger_once con caja");

// Los dos mapas de siempre, que es por donde esto no se veía.
for (const m of ["gatecity", "edana"]) {
  if (!existsSync(`build/${m}/malla.json`)) continue;
  const o = JSON.parse(readFileSync(`build/${m}/malla.json`, "utf8")).disparadores ?? [];
  const n = o.filter((d) => (d.clase === "ms_npcscript" || d.clase === "mstrig_act") &&
    [1, 3].includes(d.tipo ?? 0)).length;
  control(`${m} tiene CERO escenas del tipo 1 o 3: por eso esto esperaba al tercer mapa`,
    n === 0, `${n}`);
}

// ── LOS DOS VALORES DE REPOSO, MEDIDOS ANTES DE ABRIR NADA ────────────────
const gurukkNace = censo.colocados.find((c) => c.objetivo === "Gurukk");
const jerdidNace = censo.colocados.find((c) => c.objetivo === "Jerdid");
const dFantasma = plano(gurukkNace.escena, fantasma.escena) * U;
control("AVISO: `Ghostturn` cae DENTRO de la proximidad de donde nace Gurukk",
  dFantasma < gurukkNace.ia.cercaniaDeDestino,
  `${dFantasma.toFixed(0)} u contra una proximidad de ${gurukkNace.ia.cercaniaDeDestino}`);
control("AVISO: `JerdidIntroduction` sólo lo giraría TRES grados: no distingue nada",
  Math.abs(jerdidNace.yaw - intro.angulos[1]) < 5,
  `nace a ${jerdidNace.yaw}°, la escena pide ${intro.angulos[1]}°`);
control("por eso el giro se mide con `Scareboi`, que pide 151 grados más allá",
  Math.abs(jerdidNace.yaw - susto.angulos[1]) > 90,
  `${jerdidNace.yaw}° -> ${susto.angulos[1]}°`);

// ── EL HORNEADO DE LAS ANIMACIONES, que es lo que faltaba ─────────────────
const modeloDe = (obj) => {
  const c = censo.colocados.find((x) => x.objetivo === obj);
  return censo.modelos.find((x) => x.clave === c.clave);
};
const mJerdid = modeloDe("Jerdid"), mGurukk = modeloDe("Gurukk");
console.log(`\n  LAS SECUENCIAS HORNEADAS
    Jerdid (${mJerdid.modelo})  ${mJerdid.secuencias.join(" ")}
    Gurukk (${mGurukk.modelo})  ${mGurukk.secuencias.join(" ")}`);

control("`wave` y `fear2` están horneadas: las pide el MAPA, no la ficha",
  ["wave", "fear2"].every((a) => mJerdid.secuencias.some((s) => s.toLowerCase() === a)),
  mJerdid.secuencias.length + " secuencias");
control("y `anim_seal` para el fantasma, por lo mismo",
  mGurukk.secuencias.some((s) => s.toLowerCase() === "anim_seal"),
  mGurukk.secuencias.join(" "));
control("POSITIVO: y sigue siendo una lista blanca, no el modelo entero",
  mJerdid.secuencias.length < 30 && !mJerdid.secuencias.some((s) => s.toLowerCase() === "tieshoe"),
  `${mJerdid.secuencias.length} de las 129 del .mdl, y sin 'tieshoe'`);

// ── 1. SE ENTRA POR EL MENÚ ────────────────────────────────────────────────
//
// Y esto es además el control del 50 con TRES mapas en la fila: hasta hoy la
// lista tenía dos y «elige el tercero» no se podía ni escribir.
//
// SE ENTRA DOS VECES, y no por comodidad: **las dos escenas del tipo 1 se
// borran la una a la otra**. Ver el apartado 4.
//
// LOS 74 NACEN DORMIDOS Y SUS ÁREAS NO ESPERAN A NADIE. Esto lo escribí al
// revés —«al entrar no hay nadie, hay que ir a pisar las áreas»— y salió rojo:
// `porDisparo` es falso en las dos, así que están activas de nacimiento
// (`aparecer.js:136`) y sueltan a los suyos en 1-2 s. Se espera a que salgan,
// que es lo que hace el jugador sin enterarse.
const entrar = async () => {
  await entrarPorElMenu(pag, PORT, { mapa: MAPA });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForTimeout(2500);
  await pag.waitForFunction(() => window.probe.mundo.npc("Jerdid") && window.probe.mundo.npc("Gurukk"),
    null, { timeout: 30000 }).catch(() => {});
  return pag.evaluate(() => ({
    mapa: window.probe.vgui2.mapaDeLaPartida(),
    jerdid: window.probe.mundo.npc("Jerdid"),
    gurukk: window.probe.mundo.npc("Gurukk"),
  }));
};

const nacidos = await entrar();
const mapa = nacidos.mapa;
control("se ha entrado al TERCER mapa por la fila «Map» del menú",
  mapa === MAPA, `${mapa}`);
console.log(`\n  HAN SALIDO DE SUS ÁREAS
    Jerdid            ${nacidos.jerdid?.nombre}  nodo ${nacidos.jerdid?.nodo.map((v) => v.toFixed(1)).join(", ")}  rumbo ${nacidos.jerdid?.yaw.toFixed(1)}°
    Gurukk            ${nacidos.gurukk?.nombre}  nodo ${nacidos.gurukk?.nodo.map((v) => v.toFixed(1)).join(", ")}  rumbo ${nacidos.gurukk?.yaw.toFixed(1)}°`);

control("sus áreas los sacan solas, sin que nadie las dispare",
  Boolean(nacidos.jerdid) && Boolean(nacidos.gurukk),
  `${nacidos.jerdid?.nombre ?? "falta"} / ${nacidos.gurukk?.nombre ?? "falta"}`);
// Y el hueco que esto destapó, contado y no arreglado: el mapa le dice al
// fantasma que no pasee y nadie lo lee.
control("CONTADO: `set_no_roam` de sus `params` no lo lee nadie, y el fantasma pasea",
  nacidos.gurukk.pasea === true, `pasea ${nacidos.gurukk.pasea}, params del mapa: set_no_roam`);
control("y Jerdid nace mirando a 325°, que es lo que dice el mapa",
  Math.abs((nacidos.jerdid?.yaw ?? 0) - 325) < 2, `${nacidos.jerdid?.yaw.toFixed(1)}°`);
control("NEGATIVO: ninguno está en escena ni tiene destino todavía",
  !nacidos.jerdid.enEscena && !nacidos.jerdid.mandado && !nacidos.gurukk.enEscena,
  `jerdid ${nacidos.jerdid.enEscena}, gurukk ${nacidos.gurukk.enEscena}`);

// ── 2. EL MIRADOR Y EL SUELO DE RUIDO ──────────────────────────────────────
//
// Un sitio fijo al lado del NPC desde el que se hacen TODAS sus fotos. Pisar el
// volumen y fotografiar desde dentro fue la primera versión y daba cero
// píxeles con la animación corriendo: ver el aviso 5 de la cabecera.
// A RAS DE SUELO Y A LA ALTURA DEL PECHO: ponerse metro y medio por encima de
// los pies del NPC hacía que el jugador CAYERA entre las dos capturas, y
// entonces el suelo de ruido salía 326 000 px de 960 000 — un tercio de la
// pantalla moviéndose sin que nada pasara. El ruido no era del bosque: era mío.
const mirador = async (nodo) => {
  await pag.evaluate((p) => {
    window.probe.mundo.poner(p[0] + 2.5, p[1], p[2] + 2.5);
    // TRES NÚMEROS, no un array: ver la corrección del 78 en `edana77.mjs`.
    window.probe.mundo.mirar(p[0], p[1] + 0.9, p[2]);
  }, nodo);
  await asentar();
};

/**
 * ESPERAR A QUE EL JUGADOR DEJE DE CAER.
 *
 * Con `waitForTimeout` fijo el suelo de ruido salía 530 000 px de 960 000: el
 * bosque tiene pendiente, así que dejarse caer al lado de un NPC es caer un
 * metro largo, y la vista se movía ENTRE las dos capturas del ruido. El umbral
 * de todo lo de abajo se compara contra ese ruido, así que un ruido inflado
 * tapa la señal. Se espera a que los pies no se muevan, que es la pregunta de
 * verdad, y no a que pase un número de milisegundos que me invente yo.
 */
async function asentar(tope = 4000) {
  let antes = null;
  for (let t = 0; t < tope; t += 120) {
    await pag.waitForTimeout(120);
    const p = await pag.evaluate(() => window.probe.mundo.donde().pies);
    if (antes && Math.hypot(p[0] - antes[0], p[1] - antes[1], p[2] - antes[2]) < 0.01) return true;
    antes = p;
  }
  return false;
}
/** Pisar un volumen del mapa y volver al mirador. */
const pisarYVolver = async (objetivo, nodo, espera = 300) => {
  await pag.evaluate((c) => window.probe.mundo.poner(c[0], c[1], c[2]), dentroDe(quienDispara(objetivo)));
  await pag.waitForTimeout(espera);
  await mirador(nodo);
};

await mirador(nacidos.jerdid.nodo);
const ventanaJerdid = await ventanaDe(nacidos.jerdid.nodo);
control("se ve a Jerdid de cuerpo entero en la pantalla, no a su espalda",
  Boolean(ventanaJerdid), ventanaJerdid ? `en ${ventanaJerdid.x},${ventanaJerdid.y}` : "fuera de cuadro");
const ruidoA = await foto("ruido-a");
await pag.waitForTimeout(700);
const ruidoB = await foto("ruido-b");
const ruido = cambian(ruidoA, ruidoB, ventanaJerdid);
const ruidoTodo = cambian(ruidoA, ruidoB);
console.log(`\n  SUELO DE RUIDO    ${ruido.n} px de ${ruido.de} en la ventana de Jerdid` +
  `  (en la pantalla entera serían ${ruidoTodo.n} de ${ruidoTodo.de}: el bosque entero)`);

// ── 3. TIPO 1 · JERDID SALUDA ──────────────────────────────────────────────
//
// Se pisa el `trigger_once` de verdad, no se llama a `probe.dispara`.
const antesIntro = await pag.evaluate(() => window.probe.mundo.npc("Jerdid"));
const fotoAntes = await foto("antes-del-saludo");

await pisarYVolver("JerdidIntroduction", antesIntro.nodo);

const saludando = await pag.evaluate(() => ({
  jerdid: window.probe.mundo.npc("Jerdid"),
  escenas: window.probe.mundo.escenas(),
}));
console.log(`\n  TIPO 1 · EL SALUDO
    en escena         ${saludando.jerdid.enEscena}
    anim pedida       ${saludando.jerdid.animPedida}
    anim PUESTA       ${saludando.jerdid.animacion}
    destino           ${saludando.jerdid.mandado ? "sí" : "ninguno"}
    escenas vivas     ${saludando.escenas.corriendo.map((s) => `${s.nombre} tipo ${s.tipo} ${s.fase}`).join(" | ") || "ninguna"}`);

control("pisar el `trigger_once` arranca la escena del tipo 1",
  saludando.escenas.corriendo.some((s) => s.nombre === "JerdidIntroduction"),
  saludando.escenas.corriendo.map((s) => s.nombre).join(",") || "ninguna");
control("y lo CONGELA: el tipo 1 sí pasa por `MONSTERSTATE_SCRIPT` (:181)",
  saludando.jerdid.enEscena === true, `${saludando.jerdid.enEscena}`);
control("pide `wave`, que es el `actionanim` del mapa",
  saludando.jerdid.animPedida === "wave", `${saludando.jerdid.animPedida}`);
control("y la animación PUESTA es `wave`: estaba horneada (el arreglo del 78)",
  saludando.jerdid.animacion === "wave", `${saludando.jerdid.animacion}`);
control("la fase es `animando`, no `andando`: el tipo 1 no entra en mover",
  saludando.escenas.corriendo.find((s) => s.nombre === "JerdidIntroduction")?.fase === "animando",
  saludando.escenas.corriendo.find((s) => s.nombre === "JerdidIntroduction")?.fase ?? "-");
control("NEGATIVO: no le pone destino ninguno, aunque el mapa traiga `moveanim`",
  saludando.jerdid.mandado === null, saludando.jerdid.mandado ? "tiene" : "ninguno");

// EL PAR QUE HACE QUE «NO SE MUEVE» SIGNIFIQUE ALGO.
//
// Un cero sin control positivo no es un resultado (apartado 3). Aquí el cero es
// «el nodo no se ha movido», y al lado va la prueba de que el instrumento veía
// algo: la PANTALLA sí cambia, porque está animando sin moverse del sitio.
// `wave` dura 1,86 s, así que a los 300 ms de volver al mirador sigue viva.
await pag.waitForTimeout(300);
const enMedio = await pag.evaluate(() => window.probe.mundo.npc("Jerdid"));
const fotoSaludo = await foto("saludando");
const movido = plano(enMedio.nodo, antesIntro.nodo) * U;
const pixSaludo = cambian(fotoAntes, fotoSaludo, ventanaJerdid);
console.log(`    se ha movido      ${movido.toFixed(2)} u
    píxeles           ${pixSaludo.n} de ${pixSaludo.de} en su ventana, contra ${ruido.n} de ruido`);

control("el NODO DE THREE no se mueve: el tipo 1 no anda",
  movido < 2, `${movido.toFixed(2)} u`);
control("POSITIVO: y aun así la pantalla cambia, porque está animando",
  pixSaludo.n > Math.max(ruido.n * 3, 500), `${pixSaludo.n} px de ${pixSaludo.de} contra ${ruido.n} de ruido`);

// Y se suelta al acabar la secuencia (`m_fSequenceFinished`, :276).
await pag.waitForFunction(() => !window.probe.mundo.npc("Jerdid").enEscena, null, { timeout: 20000 })
  .catch(() => {});
const trasSaludo = await pag.evaluate(() => ({
  jerdid: window.probe.mundo.npc("Jerdid"),
  escenas: window.probe.mundo.escenas(),
}));
control("al acabar la secuencia lo suelta: `FireTarget` (:309)",
  trasSaludo.jerdid.enEscena === false, `${trasSaludo.jerdid.enEscena}`);
const caminoIntro = trasSaludo.escenas.diario.filter((d) => d.nombre === "JerdidIntroduction").map((d) => d.que);
control("el camino del tipo 1 es `anima -> acaba`, sin pasar por andar",
  caminoIntro.join(" ") === "anima acaba", caminoIntro.join(" -> ") || "nada");
control("NEGATIVO: y acaba BIEN, no cortada",
  trasSaludo.escenas.diario.some((d) => d.nombre === "JerdidIntroduction" && d.que === "acaba" && d.cortada === false),
  "sin corte");

// ── 4. TIPO 1 · Y EL SUSTO, QUE ES EL QUE GIRA — EN OTRA PARTIDA ──────────
//
// **LAS DOS ESCENAS DEL TIPO 1 SE BORRAN LA UNA A LA OTRA.** Esto costó cuatro
// rojos y tres diagnósticos equivocados antes de mirar el mapa:
//
//   el saludo  -> ... -> multi_manager PigEncounter -> trigger_relay killscare
//                                      killtarget ScareJerdid
//   el susto   -> multi_manager ScareMM -> trigger_relay killencounter ×2
//                                      killtarget PigEncounter
//                                      killtarget JerdidIntroduction
//
// O sea que en una partida sólo puede pasar UNA de las dos: gana la que el
// jugador pise primero, y el mapa borra la otra. No es un fallo del puerto —el
// `killtarget` funciona y por eso pasa— es cómo está escrito el mapa.
//
// Antes de verlo, el diagnóstico iba por el camino de siempre: que si el
// volumen no se tocaba, que si el plazo era corto. Lo que lo destapó fue
// contar: `disparadores().cuenta` traía un `killscare: 1` que yo no había
// pedido, y `tocables` había bajado de 15 a 12. *Antes de escribir «está roto
// aquí», lee si el propio mapa ya dice dónde* (el 68).
//
// Así que el susto se mide en una SEGUNDA PARTIDA, entrando otra vez por el
// menú. Y de paso eso prueba el otro lado: aquí `JerdidIntroduction` sigue
// vivo, y después del susto ya no.
const trasIntro = await pag.evaluate(() => window.probe.mundo.disparadores().cuenta);
control("el mapa BORRA el otro tipo 1 al disparar éste: `killscare` ha corrido",
  (trasIntro.killscare ?? 0) === 1, `killscare ${trasIntro.killscare ?? 0}`);

const segunda = await entrar();
control("se vuelve a entrar por el menú, partida limpia",
  segunda.mapa === MAPA && Boolean(segunda.jerdid), `${segunda.mapa}`);

// EL PLAZO NO SE INVENTA: el `multi_manager` que lo enciende lleva a `Scareboi`
// con **0,5 s de retraso** entre sus seis objetivos, y la primera versión
// esperaba 350 ms. El número sale del horneado, no de mi paciencia.
const retrasoScare = (disp.find((d) => d.nombre === "ScareMM")?.objetivos ?? [])
  .find((o) => o.nombre === "Scareboi")?.retraso ?? 0;
const antesSusto = await pag.evaluate(() => window.probe.mundo.npc("Jerdid"));
await mirador(antesSusto.nodo);
await pisarYVolver("ScareMM", antesSusto.nodo, 400);
await pag.waitForTimeout(retrasoScare * 1000 + 600);

const asustado = await pag.evaluate(() => ({
  jerdid: window.probe.mundo.npc("Jerdid"),
  escenas: window.probe.mundo.escenas(),
}));
console.log(`\n  TIPO 1 · EL SUSTO
    rumbo             ${antesSusto.yaw.toFixed(1)}° -> ${asustado.jerdid.yaw.toFixed(1)}°
    anim pedida       ${asustado.jerdid.animPedida}
    anim PUESTA       ${asustado.jerdid.animacion}`);

control("el retraso sale del `multi_manager` horneado, no de un número a ojo",
  retrasoScare === 0.5, `${retrasoScare} s`);
control("la segunda escena del tipo 1 también arranca, con OTRA animación",
  asustado.jerdid.animPedida === "fear2", `${asustado.jerdid.animPedida}`);
control("y la PUESTA es `fear2`: las dos estaban horneadas, no una",
  asustado.jerdid.animacion === "fear2", `${asustado.jerdid.animacion}`);
control("EL GIRO: `pev->angles` del mapa le pone 174° (npcact.cpp:193)",
  Math.abs(asustado.jerdid.yaw - 174) < 2, `${asustado.jerdid.yaw.toFixed(1)}°`);
control("y eso son 151 grados de verdad, no los tres de la escena anterior",
  Math.abs(asustado.jerdid.yaw - antesSusto.yaw) > 90,
  `${Math.abs(asustado.jerdid.yaw - antesSusto.yaw).toFixed(0)}°`);
// EL OTRO LADO DEL BORRADO MUTUO, que es lo que hace que la frase de arriba sea
// una medida y no una anécdota: en esta partida el susto ha matado al saludo.
const trasSusto = await pag.evaluate(() => window.probe.mundo.disparadores().cuenta);
control("y ahora el susto borra al saludo: `killencounter` ha corrido",
  (trasSusto.killencounter ?? 0) >= 1 && (trasSusto.killscare ?? 0) === 0,
  `killencounter ${trasSusto.killencounter ?? 0}, killscare ${trasSusto.killscare ?? 0}`);

// ── 5. TIPO 3 · EL FANTASMA SELLA Y SE VA ─────────────────────────────────
//
// AQUÍ NO HAY CONTROL DE PÍXELES, Y LA RAZÓN ES DEL MOTOR, NO PEREZA.
//
// Para contar píxeles hay que ponerse al lado del sujeto, y el sujeto es un
// mago esqueleto con 1 024 unidades de alcance: en cuanto se le ve de cerca te
// toma por enemigo, y entonces **el motor rechaza la escena**:
//
//     if (!m_fStopAI && pMonster->m_hEnemy != NULL) return;   npcact.cpp:131
//
// `Ghostturn` trae `stopai 0`, así que esa guarda se le aplica. Acercarse a
// fotografiar lo hacía imposible de medir: dos pasadas salieron con el diario
// vacío y la animación en `anim_projectile`, que es su ataque — y el código
// estaba bien las dos veces. Así que al fantasma no se le acerca nadie: se pisa
// su volumen desde los 25 m que hay, y lo que se mide es el diario, el
// mezclador y el mundo. Lo que se ve lo prueba el tipo 1, que no muerde.
//
// Y COMO ESO DEPENDE DE SI TE HA OÍDO, SE REINTENTA Y SE DICE EN CUÁNTAS. Es
// lo que hizo el 76 con el sorteo de `patronspawn`: un control que falla sin
// que nada esté roto es ruido con forma de rojo. El `trigger_once` se gasta en
// cada partida, así que cada intento es una entrada nueva por el menú.
//
// Y se reintenta por DOS motivos, los dos del paseo que nadie apaga:
//
//   - que te haya oído antes de tiempo, y el motor rechace la escena;
//   - que haya paseado hasta un rincón desde el que **la línea recta al punto
//     está tapada**. Este puerto anda recto y, si se choca, se para: el grafo
//     de nodos del motor (`msmonsterserver.cpp:1081`) no está, y lo dice ya
//     `Manada.avanzarHacia`. Una pasada lo pilló a 41 u y se quedó clavado
//     andando contra algo, con el diario en `anda` y sin llegar nunca.
//
// Los dos desaparecerían leyendo el `set_no_roam` de sus `params`, que es lo
// que el mapa pide. No se porta aquí: `params` son eventos de guion
// (`monsters/externals.script:1284`, que hace `roam 0`) y levantarlos es otro
// experimento. Queda contado arriba.
let sellando = null, idos = null, antesFantasma = null, dPartida = 0, intentos = 0;
for (intentos = 1; intentos <= 4; intentos++) {
  if (intentos > 1) await entrar();
  antesFantasma = await pag.evaluate(() => window.probe.mundo.npc("Gurukk"));
  if (!antesFantasma) continue;
  // LO ANDADO SE MIDE, NO SE SUPONE: el fantasma pasea (aviso 1), así que la
  // distancia al punto de la escena depende de dónde lo pille.
  dPartida = plano(antesFantasma.nodo, fantasma.escena) * U;
  await pag.evaluate((c) => window.probe.mundo.poner(c[0], c[1], c[2]), dentroDe(quienDispara("HearPlayers")));
  // Se espera a que la rama de andar acabe: la de animar es la que viene
  // después, y preguntarle antes era el rojo de la primera pasada. La hora se
  // le pregunta a la ESCENA, no a mi espera (la lección del 77).
  await pag.waitForFunction(() => window.probe.mundo.escenas().corriendo
    .some((s) => s.nombre === "Ghostturn" && s.fase === "animando"), null, { timeout: 20000 })
    .catch(() => {});
  // Y SE LEE SIN MOVERSE DE AQUÍ.
  sellando = await pag.evaluate(() => ({
    gurukk: window.probe.mundo.npc("Gurukk"),
    escenas: window.probe.mundo.escenas(),
  }));
  // LA CONDICIÓN ES «HA LLEGADO A ANIMAR», no «la escena existe»: con
  // `arrancó` a secas, la pasada en que se quedó atascado andando contaba como
  // buena y los seis controles de abajo salían rojos con el puerto haciendo lo
  // que sabe hacer.
  if (sellando.escenas.diario.some((d) => d.nombre === "Ghostturn" && d.que === "anima")) break;
}

const caminoFantasma = () => sellando.escenas.diario.filter((d) => d.nombre === "Ghostturn").map((d) => d.que);
const andado = plano(sellando.gurukk?.nodo ?? antesFantasma.nodo, antesFantasma.nodo) * U;
console.log(`\n  TIPO 3 · EL SELLO
    entradas          ${intentos} (si el fantasma te ha oído antes, el motor rechaza la escena)
    partía a          ${dPartida.toFixed(0)} u del punto (nace a 2: el fantasma pasea)
    ha andado         ${andado.toFixed(0)} u
    rumbo             ${antesFantasma.yaw.toFixed(1)}° -> ${sellando.gurukk?.yaw.toFixed(1)}°
    anim pedida       ${sellando.gurukk?.animPedida}
    anim PUESTA       ${sellando.gurukk?.animacion}
    diario            ${caminoFantasma().join(" -> ") || "nada"}`);

control("la escena del tipo 3 llega a animar en 4 entradas o menos",
  caminoFantasma().includes("anima"), `${intentos} entrada(s)`);
control("el tipo 3 empieza por la rama de ANDAR: el diario lo dice",
  caminoFantasma()[0] === "anda", caminoFantasma().join(" -> ") || "nada");
control("y pasa solo a animar: `case SCRIPT_MOVE_PLAYANIM: PlayAnim()` (:255)",
  caminoFantasma().includes("anima"), caminoFantasma().join(" -> ") || "nada");
control("acaba dentro de la proximidad del punto de la entidad",
  plano(sellando.gurukk.nodo, fantasma.escena) * U <= 35.2 + 2,
  `${(plano(sellando.gurukk.nodo, fantasma.escena) * U).toFixed(0)} u del punto`);
control("con la animación del mapa puesta de verdad: `anim_seal`",
  sellando.gurukk?.animacion === "anim_seal", `${sellando.gurukk?.animacion}`);
control("y mirando a 259°, el `angles` de la entidad",
  Math.abs((sellando.gurukk?.yaw ?? 0) - 259) < 2, `${sellando.gurukk?.yaw.toFixed(1)}°`);
control("y ha girado de verdad: el rumbo final no es el que traía",
  Math.abs((sellando.gurukk?.yaw ?? 0) - antesFantasma.yaw) > 5,
  `${antesFantasma.yaw.toFixed(0)}° -> ${sellando.gurukk?.yaw.toFixed(0)}°, ` +
  `${Math.abs((sellando.gurukk?.yaw ?? 0) - antesFantasma.yaw).toFixed(0)}° de giro`);

// Y el `firedelay` de 0,2 s con su `firewhendone`, que aquí MATA al fantasma.
await pag.waitForFunction(() => !window.probe.mundo.npc("Gurukk"), null, { timeout: 20000 })
  .catch(() => {});
await pag.waitForTimeout(400);
idos = await pag.evaluate(() => ({
  gurukk: window.probe.mundo.npc("Gurukk"),
  escenas: window.probe.mundo.escenas(),
}));
const caminoFinal = idos.escenas.diario.filter((d) => d.nombre === "Ghostturn").map((d) => d.que);
console.log(`    camino entero     ${caminoFinal.join(" -> ")}
    Gurukk            ${idos.gurukk ? "sigue" : "se ha ido"}`);

control("el camino del tipo 3 es `anda -> anima -> espera -> acaba`",
  caminoFinal.join(" ") === "anda anima espera acaba", caminoFinal.join(" -> ") || "nada");
control("espera su `firedelay` de 0,2 s: la fase `espera` existe",
  idos.escenas.diario.some((d) => d.nombre === "Ghostturn" && d.que === "espera" && d.retraso === 0.2),
  `${idos.escenas.diario.find((d) => d.nombre === "Ghostturn" && d.que === "espera")?.retraso}`);
control("NEGATIVO: acaba BIEN y dispara su `firewhendone`, no su `fireonbreak`",
  idos.escenas.diario.some((d) => d.nombre === "Ghostturn" && d.que === "acaba" &&
    d.cortada === false && d.dispara === "SkeletonVanish"),
  "SkeletonVanish");
control("y el fantasma SE VA DEL MUNDO: el `killtarget` de la relé se lo lleva",
  idos.gurukk === null, idos.gurukk ? "sigue ahí" : "se ha ido");
// «NINGUNA ESCENA CORRIENDO» ERA FALSO Y EL CÓDIGO ESTABA BIEN: este mapa tiene
// dieciocho `ms_npcscript` y los dos jabalíes de `BoarRun` andan por su cuenta
// todo el rato. Lo que hay que afirmar es que LA MÍA ha terminado, no que el
// bosque esté quieto.
control("la escena del tipo 3 ya no corre (las de los jabalíes sí, y está bien)",
  !idos.escenas.corriendo.some((s) => s.nombre === "Ghostturn"),
  `${idos.escenas.corriendo.map((s) => s.nombre).join(", ") || "ninguna"} siguen`);
// ── 6. LOS CONTADORES ─────────────────────────────────────────────────────
const cuentas = await pag.evaluate(() => window.probe.mundo.disparadores().sinPortar);
console.log(`\n  LO QUE SIGUE SIN PORTARSE
    ${Object.entries(cuentas).map(([k, v]) => `${k.padEnd(42)} ${v}`).join("\n    ") || "nada"}`);
control("ningún `ms_npcscript` se cuenta ya como «usar» sin portar",
  !Object.keys(cuentas).some((k) => /ms_npcscript/.test(k)),
  Object.keys(cuentas).filter((k) => /ms_npcscript/.test(k)).join(", ") || "ninguno");
control("y el reajuste al hueso 0 sigue contado, que es lo honrado",
  Object.keys(cuentas).some((k) => /hueso/.test(k)),
  Object.keys(cuentas).filter((k) => /hueso/.test(k)).join(", ") || "no se cuenta");

// ── RESUMEN ───────────────────────────────────────────────────────────────
const bien = controles.filter((c) => c.bien).length;
console.log(`\n  CONTROLES`);
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(74)} ${c.detalle}`);
console.log(`\n  ${bien} de ${controles.length} en verde`);
console.log(`  PENDIENTE: un tipo 3 que ande de verdad (aquí son 2 u). Los hay en deralia y cleicert.`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  capturas:       ${VISTAS}/gertenheld78-*.png\n`);

await nav.close();
matar(dev);
process.exit(bien === controles.length && errores.length === 0 ? 0 : 1);

} catch (e) {
  // UNA CAÍDA ES UNA ROJA, NO UNA NOTA AL PIE — la lección del 65.
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e.message}`);
  console.log(`  llevaba ${controles.filter((c) => c.bien).length} de ${controles.length} controles corridos`);
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(74)} ${c.detalle}`);
  try { await nav.close(); } catch {}
  matar(dev);
  process.exit(1);
}
