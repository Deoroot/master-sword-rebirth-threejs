// EL ARCO, medido en el mapa.
//
//   npm run sonda:arco
//
// El arco de árbol está horneado desde el 18 y hasta el 23 no disparaba: el
// `Brazo` tiraba a la basura todo ataque que no fuera `strike-land`. O sea que
// una de las siete armas de partida era decoración, y **ninguna prueba lo
// decía**, porque todas medían el mandoble.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//    1. el arco no dispara nunca             -> `charge-throw-projectile` filtrado
//    2. dispara al pulsar                    -> se ignora el mínimo de tensado
//    3. dispara aguantando el botón          -> la suelta la manda el cliente, no el reloj
//    4. la flecha sale recta                 -> se perdió el `(0,9,0)` del guiño
//    5. la flecha no cae                     -> se leyó la gravedad del mundo, no la de la flecha
//    6. la flecha cae un tercio más          -> se leyó `gravity 1.0` de `game_deploy`
//    7. sale a 750 siempre                   -> no se aplicó la fracción tensada
//    8. sale a 0 y cae a los pies             -> `tMaxHold` sin leer, y el motor hace `? : 0`
//    9. atraviesa a los bichos               -> falta el rayo de 36 unidades
//   10. la flecha no hace daño                -> se buscó el daño en el arco y no en la flecha
//   11. el arco se queda sin munición         -> falta la flecha gratis del motor
//   12. la flecha gratis se gasta             -> falta el `if (!GENERIC)`
//   13. el arco se queda quieto al disparar   -> sólo se horneó `idle1` de `v_bows.mdl`
//   14. y la de siempre: la sonda llama a `tirar` a mano y el juego no lo llama.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5206;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
// El personaje nuevo elige ARCO, que es una de las siete de `reg.newchar`.
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "bows_treebow"));
await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 })
  .catch(() => {});
// El mundo quieto, por lo mismo que en las otras dos: aquí se mide dónde acaba
// una flecha, y con el pueblo andando eso es un dado. Sólo el `roam`.
await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));

// ── 1. EL ARCO EN LA MANO ──────────────────────────────────────────────────
const arco = await pag.evaluate(() => window.probe.arco.empunar("bows_treebow"));
console.log(`\n  ${arco.id}: fuerza ${arco.fuerza} u/s, tensa ${arco.sostener?.join("-")} s, ` +
  `cono ${arco.cono?.join("-")}°, apunta ${JSON.stringify(arco.apunta)}, munición '${arco.proyectil}'`);
console.log(`    secuencias del modelo de vista: ${arco.secuencias.join(", ")}`);
control("el arco de partida es un arma de TIRO y no un palo",
  arco.esDeTiro === true, `esDeTiro ${arco.esDeTiro}`);
control("y registra sus dos ataques clonados, como en el juego",
  arco.ataques === 2, `${arco.ataques} ataques`);
control("trae los dos tiempos de tensar", arco.sostener?.[1] === 1.3, `${arco.sostener?.join(";")}`);
control("trae los dos conos, y el de sin tensar es el peor",
  arco.cono?.[0] === 10 && arco.cono?.[1] === 4, `${arco.cono?.join(";")}`);
// La de tensar y la de soltar. Hasta el 23 sólo se horneaba `idle1`: el arco se
// quedaba quieto mientras disparaba y eso no da ningún error.
control("el modelo de vista trae tensar y disparar, no sólo estar quieto",
  arco.secuencias.includes("stretch") && arco.secuencias.includes("fire"),
  arco.secuencias.join(", "));
control("y hay un conjunto de flechas montado", arco.conjunto > 0, `${arco.conjunto} nodos`);

// ── 2. LA MUNICIÓN, que es gratis ──────────────────────────────────────────
const mun = await pag.evaluate(() => window.probe.arco.municion());
console.log(`\n  munición: ${mun.nombre} (${mun.id}) ${mun.dano?.min}-${mun.dano?.max} de daño, ` +
  `gravedad ${mun.gravedad}, ${mun.gasta ? "se gasta" : "NO se gasta"}; ` +
  `en la mochila: ${mun.enLaMochila.length ? mun.enLaMochila.join(", ") : "ninguna"}`);
control("un personaje nuevo no lleva ni una flecha", mun.enLaMochila.length === 0, "");
control("y aun así tiene con qué disparar: el motor le da flechas gratis",
  mun.id === "proj_arrow_generic", `${mun.id}`);
control("la flecha gratis no se gasta nunca (`if (!GENERIC)`)", mun.gasta === false, "");
control("la flecha gratis trae su dado de daño, que no está en el arco",
  mun.dano?.min === 30 && mun.dano?.max === 60, `${mun.dano?.min}-${mun.dano?.max}`);
// La de la mano es 1.0 y la que vuela 0,75. Leer la que no es hace caer la flecha
// un 33 % más, y eso no se ve como un error: se ve como «el arco es malo».
control("y la gravedad de la que VUELA, no la de la que se lleva en la mano",
  mun.gravedad === 0.75, `gravity ${mun.gravedad}`);

// ── 3. LAS TRES ERRATAS, tal como están en el motor ────────────────────────
const aj = await pag.evaluate(() => window.probe.arco.ajustes());
console.log(`\n  ajustes: ${JSON.stringify(aj.ahora)}`);
control("el juego se juega con las erratas del motor puestas", aj.fiel === true,
  `desvío en el guiño ${aj.ahora.desvioEnElGuino}, medio círculo ${aj.ahora.veerDeMedioCirculo}, ` +
  `puntería por habilidad ${aj.ahora.punteriaPorHabilidad}`);

// ── 4. APRETAR NO ES DISPARAR ──────────────────────────────────────────────
//
// Éste es el control que separa «el arco funciona» de «el arco es un arco».
// Se apunta al CIELO, y recto: `mirar(0,1000,0)` apunta al punto (0,1000,0) del
// mapa, que desde media ciudad es una diagonal contra un tejado. Lo que hace
// falta es «hacia arriba desde donde estoy».
const alCielo0 = async () => pag.evaluate(() => {
  const d = window.probe.mundo.donde();
  window.probe.mundo.mirar(d.ojo[0], d.ojo[1] + 1000, d.ojo[2]);
});
await alCielo0();
const medio = await pag.evaluate(() => window.probe.arco.tensar(0.5));
console.log(`
  medio segundo con el botón abajo: fase '${medio.fase}', ` +
  `tensado ${(medio.tensado * 100).toFixed(0)} %, flechas salidas ${medio.salieron}`);
control("aguantando el botón medio segundo NO ha salido ninguna flecha",
  medio.salieron === 0, `${medio.salieron} flechas`);
control("y el arco está TENSANDO, que es un estado y no un instante",
  medio.tensando === true, `fase ${medio.fase}`);
control("tensar cuenta como atacar, o sea que corta el trote",
  medio.atacando === true, "");
control("y mientras tensa tiene puesta la secuencia de tensar",
  medio.secuencia === "stretch", `'${medio.secuencia}'`);

// ── 5. UN TIRO ENTERO, y por dónde sale ────────────────────────────────────
//
// Apuntando al HORIZONTE, que es la segunda cosa que costó: los nueve grados del
// arco van en el GUIÑO, y girar el guiño de un tiro casi vertical no cambia la
// dirección. Medido hacia arriba, el desvío salía 4° —sólo el del cono— y parecía
// que el `(0,9,0)` no llegaba. Llega; lo que no llegaba era la medición.
const alHorizonte = async () => pag.evaluate(() => {
  const d = window.probe.mundo.donde();
  window.probe.mundo.mirar(d.ojo[0] + 4000, d.ojo[1], d.ojo[2]);
});
await alHorizonte();
const tiro = await pag.evaluate(() => window.probe.arco.tirar(1.5, { espera: 1.2 }));
console.log(`
  tiro tensando 1,5 s al horizonte: sale a los ${tiro.disparo?.toFixed(2)} s a ` +
  `${tiro.velocidad?.toFixed(0)} u/s`);
console.log(`    desvío ${tiro.desvio?.toFixed(1)}° de la cruceta: ` +
  `${tiro.desvioLateral?.toFixed(1)}° de lado, ${tiro.desvioVertical?.toFixed(1)}° de alto`);
console.log(`    vuelo: ${tiro.recorrido?.toFixed(0)} u en ${tiro.vuelo?.toFixed(2)} s, ` +
  `${tiro.caida?.toFixed(0)} u por debajo del ojo, choca contra ${tiro.contra ?? "nada"}`);
control("tensando de sobra, la flecha sale al soltar", tiro.disparo !== null,
  `a los ${tiro.disparo?.toFixed(2)} s`);
control("y sale a la fuerza máxima del arco: 750 u/s",
  Math.abs((tiro.velocidad ?? 0) - 750) < 1, `${tiro.velocidad?.toFixed(1)} u/s`);
// Y AQUÍ ESTÁ LA ERRATA, medida: el desvío del arco es LATERAL. Nueve grados a un
// lado, más el borde del cono, y siempre al mismo lado porque el veer es medio
// círculo. A ocho metros son más de cuarenta unidades: un goblin mide 32.
control("la flecha NO sale por donde apunta la cruceta",
  (tiro.desvio ?? 0) > 8, `${tiro.desvio?.toFixed(2)}°`);
control("y el desvío es DE LADO, no de alto: el `(0,9,0)` va en el guiño",
  Math.abs(tiro.desvioLateral ?? 0) > 7 && Math.abs(tiro.desvioVertical ?? 99) < 6,
  `${tiro.desvioLateral?.toFixed(1)}° de lado contra ${tiro.desvioVertical?.toFixed(1)}° de alto`);
control("la flecha vuela de verdad: cientos de unidades",
  (tiro.recorrido ?? 0) > 150, `${tiro.recorrido?.toFixed(0)} u`);
control("y baja mientras vuela: la gravedad es la suya, no la del mundo",
  (tiro.caida ?? 0) < -15, `${tiro.caida?.toFixed(0)} u`);
// Y que se VEA: la regla puede estar perfecta y no haber nada en la escena. Un
// nodo del conjunto ocupado es una flecha dibujada de verdad, clavada donde cayó.
control("y hay una flecha dibujada en el mundo, no sólo una cuenta",
  (tiro.puestas ?? 0) > 0, `${tiro.puestas} nodos ocupados`);
await pag.screenshot({ path: "build/gatecity/vistas/arco_clavada.png" });

// Y el mismo tiro con el desvío arreglado: los nueve grados al cabeceo.
const arregladoUno = await pag.evaluate(() => {
  const d = window.probe.mundo.donde();
  window.probe.mundo.mirar(d.ojo[0] + 4000, d.ojo[1], d.ojo[2]);
  window.probe.arco.ajustar({ desvioEnElGuino: false, veerDeMedioCirculo: false });
  const r = window.probe.arco.tirar(1.5, { espera: 1.2 });
  window.probe.arco.restaurar();
  return r;
});
console.log(`  arreglado: ${arregladoUno.desvioLateral?.toFixed(1)}° de lado, ` +
  `${arregladoUno.desvioVertical?.toFixed(1)}° de alto`);
// El arreglo NO quita el desvío: lo pone donde hace falta. Nueve grados arriba
// son 124 unidades a ocho metros, que es justo lo que baja la flecha.
control("arreglado, los nueve grados van HACIA ARRIBA y compensan la caída",
  (arregladoUno.desvioVertical ?? 0) > 5 && Math.abs(arregladoUno.desvioLateral ?? 99) < 6,
  `${arregladoUno.desvioLateral?.toFixed(1)}° de lado, ${arregladoUno.desvioVertical?.toFixed(1)}° de alto`);

// ── 6. UN CLIC SECO, que dispara SOLO ──────────────────────────────────────
await alCielo0();
const clic = await pag.evaluate(() => window.probe.arco.tirar(1 / 30, { espera: 3 }));
console.log(`
  clic de 0,03 s: sale a los ${clic.disparo?.toFixed(2)} s a ${clic.velocidad?.toFixed(0)} u/s`);
control("un clic seco dispara SOLO, al llegar al mínimo de tensado",
  clic.disparo !== null && clic.disparo > 1.05 && clic.disparo < 1.2,
  `a los ${clic.disparo?.toFixed(3)} s`);
// 1,1/1,3 = 84,6 % de 750. Todo el sistema de carga del arco es ese 15 %.
control("y sale al 85 % de la fuerza, no al 0 %: el mínimo es un suelo",
  Math.abs((clic.velocidad ?? 0) - 635) < 6, `${clic.velocidad?.toFixed(0)} de 750 u/s`);

// ── 8. Y LO QUE IMPORTA: UN GOBLIN SE COME UNA FLECHA ──────────────────────
//
// Con el mismo método que el 19 y el 20: se busca un hostil con línea de visión,
// se pone el jugador a distancia de arco y se le dispara. No vale medirlo con un
// bicho inventado: el daño pasa por `bichos.herir`, por el parry y por la
// reacción, y eso sólo existe en el mapa.
const blanco = await pag.evaluate(() => {
  const h = window.probe.ia.censo().lista.filter((x) => x.hostil).length;
  // Se prueban TODOS los hostiles y los ocho rumbos, como en la sonda del mundo:
  // a un goblin metido en un rincón no se le puede disparar y entonces esto
  // mediría la geometría del mapa y no el arco.
  for (let n = 0; n < h; n++) {
    for (let k = 0; k < 8; k++) {
      window.probe.ia.irA(n, 8, (k * Math.PI) / 4);
      if (window.probe.ia.ve(n)) {
        const e = window.probe.ia.estado(n);
        return { n, nombre: e.nombre, vida: e.vida, escena: e.escena, rumbo: k };
      }
    }
  }
  return null;
});
console.log(`
  blanco: ${blanco ? `${blanco.nombre} con ${blanco.vida} de vida a 8 m` : "ninguno con línea de visión"}`);
control("hay un hostil al que dispararle con línea de visión", Boolean(blanco),
  blanco ? `${blanco.nombre}` : "ninguno");

if (blanco) {
  // Doce flechas desde el mismo sitio y apuntando al pecho, DOS veces: una con el
  // motor tal cual y otra con el desvío arreglado. Es la medida que contesta
  // «¿lo replicamos al cien por cien?», y no hay forma de contestarlo sin ella.
  const dosTandas = await pag.evaluate(({ n, rumbo }) => {
    const tanda = () => {
      const out = [];
      for (let k = 0; k < 12; k++) {
        // Se vuelve a colocar y a apuntar en cada tiro: la caza sigue encendida a
        // propósito —es lo que hace el juego— y el goblin se mueve.
        window.probe.ia.irA(n, 8, (rumbo * Math.PI) / 4);
        const e = window.probe.ia.estado(n);
        if (!e || e.muerto) break;
        window.probe.mundo.mirar(e.escena[0], e.escena[1] + 0.9, e.escena[2]);
        out.push(window.probe.arco.tirar(1.4, { espera: 2 }));
      }
      const e = window.probe.ia.estado(n);
      return {
        tiros: out.length,
        enCarne: out.filter((t) => t.contra && t.contra !== "mundo").length,
        enElMundo: out.filter((t) => t.contra === "mundo").length,
        sinLlegar: out.filter((t) => !t.contra).length,
        desvio: out.length ? out.reduce((a, t) => a + (t.desvio ?? 0), 0) / out.length : null,
        vida: e?.vida ?? null, muerto: Boolean(e?.muerto),
      };
    };
    window.probe.arco.restaurar();
    const antes = window.probe.ia.estado(n)?.vida ?? null;
    const fiel = tanda();
    // Y ahora con las dos erratas del apuntado arregladas. La puntería por
    // habilidad se deja como está: con un punto de arquería no cambiaría nada.
    window.probe.arco.ajustar({ desvioEnElGuino: false, veerDeMedioCirculo: false });
    const arreglado = tanda();
    window.probe.arco.restaurar();
    return { antes, fiel, arreglado };
  }, blanco);

  const { fiel, arreglado } = dosTandas;
  const pinta = (t) => `${t.enCarne} en carne, ${t.enElMundo} en el mundo, ` +
    `${t.sinLlegar} sin llegar; desvío medio ${t.desvio?.toFixed(1)}°`;
  console.log(`    con el motor tal cual:  ${pinta(fiel)}`);
  console.log(`    con el desvío arreglado: ${pinta(arreglado)}`);
  console.log(`    ${blanco.nombre}: ${dosTandas.antes} -> ${fiel.vida} -> ${arreglado.vida} de vida`);

  control("una flecha de verdad choca contra algo del mapa",
    fiel.enCarne + fiel.enElMundo > 0, `${fiel.enCarne + fiel.enElMundo} de ${fiel.tiros}`);
  // ÉSTE es el control que vale el experimento. A ocho metros, con las dos
  // erratas del motor puestas, el arco de partida **no puede acertar**: los 9°
  // del guiño son 124 unidades de desvío a esa distancia y un goblin mide 32 de
  // ancho. No es que falle a veces: es que no apunta donde mira.
  control("con el motor tal cual, a 8 m el arco NO acierta casi nunca",
    fiel.enCarne <= 2, `${fiel.enCarne} de ${fiel.tiros} flechas`);
  control("y con el desvío puesto en el cabeceo, acierta",
    arreglado.enCarne > fiel.enCarne,
    `${arreglado.enCarne} contra ${fiel.enCarne} de ${arreglado.tiros}`);
  // El desvío medio NO baja con el arreglo —sigue siendo de nueve grados— y por
  // eso el control mira los aciertos y no el ángulo: lo que cambia es la
  // dirección, de lado a arriba. Los dos números se imprimen arriba.
  control("el desvío sigue existiendo en los dos casos: no es puntería, es dirección",
    (fiel.desvio ?? 0) > 8 && (arreglado.desvio ?? 0) > 5,
    `${fiel.desvio?.toFixed(1)}° y ${arreglado.desvio?.toFixed(1)}°`);
  // El daño de una flecha con un punto de potencia: 0,3 a 0,6. Doce flechas son
  // menos de siete puntos de vida. Eso no es un fallo del port: es el modelo de
  // progresión de Master Sword, el mismo `potencia / 100` del mandoble, y es la
  // razón de que el arco de partida parezca roto.
  const quitado = (dosTandas.antes ?? 0) - (arreglado.vida ?? 0);
  control("acertando le quita vida al goblin",
    arreglado.muerto || quitado > 0, `${quitado.toFixed(1)} de vida`);
  control("y le quita MUY poca: la potencia de un novato es 1 de 100",
    !arreglado.muerto && quitado < 20, `${quitado.toFixed(1)} con ${arreglado.enCarne} flechazos`);
}

await pag.screenshot({ path: "build/gatecity/vistas/arco.png" });

// ── 9. NADA DE ESTO ROMPE EL MUNDO ─────────────────────────────────────────
const final = await pag.evaluate(() => {
  window.probe.reaccion.avanzar(2);
  return { golpe: window.probe.golpe.estado, arco: window.probe.arco.estado() };
});
console.log(`\n  al final: ${final.arco.enVuelo} flechas en vuelo, ` +
  `arco en fase '${final.arco.fase}', ${final.golpe.triangulos} triángulos en la mano`);
control("el arco sigue en la mano después de todo esto",
  final.golpe.triangulos > 0, `${final.golpe.triangulos} triángulos`);
control("y no se queda ninguna flecha colgada en el aire para siempre",
  final.arco.enVuelo < 12, `${final.arco.enVuelo} en vuelo`);

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(64)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
