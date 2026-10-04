// EL GOLPE DEL JUGADOR, medido en el mapa.
//
// Las pruebas de `node --test` dicen que la REGLA es la del motor. Esto dice
// que la regla está enchufada, que es otra cosa: entre las dos está el arma en
// la mano, el censo de a quién se puede pegar, la traza de Rapier y la hoja del
// personaje, y ahí es donde han estado todos los fallos de este experimento.
//
// Las seis formas de que esto parezca funcionar y esté mal:
//
//   1. el arma no está en la mano        -> pegas con aire y no se ve nada
//   2. el daño cae al pulsar             -> se juega como una pistola
//   3. no le da a nada                   -> «el alcance no funciona»
//   4. le da a todo lo del mapa          -> matas al tabernero desde la plaza
//   5. el bicho pierde vida y no muere   -> una barra que baja y nada más
//   6. muere y sigue siendo un muro      -> te chocas con un cadáver invisible

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5201;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
// SE ENTRA POR EL MENÚ, como el jugador (57). Antes era `?map=gatecity`,
// que se salta el menú: carga el nivel y arranca la sesión de una pasada,
// que es un montaje que el jugador no ve nunca. Ver `sondas/entrar.mjs`.
await entrarPorElMenu(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });
const foto = async (n) => { await pag.waitForTimeout(300); await pag.screenshot({ path: `build/gatecity/vistas/golpe-${n}.png` }); };

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

// Un personaje con la ESPADA OXIDADA, que es la primera de las siete de
// `reg.newchar.weaponlist`.
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
// Y SE ESPERA AL MODELO, no medio segundo: empuñar carga un `.mdl` de un mega
// y en un arranque en frío de Vite no llega a tiempo. Con la espera fija, la
// sonda decía «el arma no está montada» una vez de cada tres — que es peor que
// fallar siempre, porque parece un fallo del juego.
await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 })
  .catch(() => {});

// ── 1. EL ARMA EN LA MANO ──────────────────────────────────────────────────
const arma = await pag.evaluate(() => window.probe.golpe.estado);
console.log(`  arma: ${arma.nombre} (${arma.arma}), ${arma.ataques} ataques, modelo ${arma.modelo}`);
console.log(`  ${arma.triangulos} triángulos, animación '${arma.animacion}', potencia ${arma.potencia}`);
control("el arma del personaje está empuñada", arma.arma === "swords_rsword", `${arma.arma}`);
control("y trae sus DOS ataques registrados", arma.ataques === 2, `${arma.ataques}`);
control("y su modelo de primera persona está montado", arma.triangulos > 0,
  `${arma.modelo} — ${arma.triangulos} triángulos`);
control("y empieza con la animación de estar quieto", arma.animacion === "idle1", `${arma.animacion}`);
// La POTENCIA es 1 en un personaje nuevo, y eso no es un fallo: es
// `CreateChar`, que da un punto a la potencia de cada habilidad. Con ella, la
// espada de 90 a 140 hace 0,9 a 1,4. Si algún día saliera 0, el daño sería
// 0,001 del arma y no se notaría la diferencia mirando.
control("la potencia del personaje nuevo es 1", arma.potencia === 1, `${arma.potencia}`);
// ── 1b. DÓNDE CAE, que es lo que se ve ─────────────────────────────────────
//
// El arma se colgó de la cámara y salía **a la derecha de la pantalla**: el
// modelo mira a la +x de GoldSrc y la cámara a la −z de Three, noventa grados
// de diferencia. No se veía como «está girado», se veía como «está mal puesto»
// — y ningún control de los de arriba lo notaba, porque el arma estaba
// montada, animada y haciendo daño.
const donde = await pag.evaluate(() => ({
  arma: window.probe.vista.caja("arma"),
  muneco: window.probe.vista.caja("muneco"),
  ficha: window.probe.vista.muneco,
}));
const cuadro = (c) => c ? `derecha ${c.derecha.map((v) => v.toFixed(0)).join("..")}  ` +
  `arriba ${c.arriba.map((v) => v.toFixed(0)).join("..")}  ` +
  `delante ${c.delante.map((v) => v.toFixed(0)).join("..")} u` : "—";
console.log(`  arma en la vista:   ${cuadro(donde.arma)}`);
console.log(`  muñeco en la vista: ${cuadro(donde.muneco)}`);
// El arma tiene que estar DELANTE y repartida a los dos lados del eje de la
// vista, no toda a un lado. Con los 90° de más, `derecha` iba de 5 a 26 y
// `delante` de −18 a 11: el arma estaba al lado, no delante.
control("el arma está delante de la vista, no al lado",
  Boolean(donde.arma) && donde.arma.delante[1] > 10 && donde.arma.derecha[0] < 20,
  cuadro(donde.arma));
// Y el MUÑECO: `ms_lildude`, la copia en miniatura del personaje. Los números
// son de `V_CalcRefdef`: 4,7 unidades delante del ojo y 3,1 por debajo.
console.log(`  muñeco: ${donde.ficha?.animacion}, ${donde.ficha?.triangulos} triángulos, ` +
  `a ${donde.ficha?.delOjo?.toFixed(2)} u del ojo`);
control("el muñeco está montado", Boolean(donde.ficha?.hay) && donde.ficha.triangulos > 0,
  `${donde.ficha?.triangulos ?? 0} triángulos`);
control("y a la distancia del ojo que dice el motor",
  Math.abs((donde.ficha?.delOjo ?? 0) - Math.hypot(4.7, 3.1)) < 0.05,
  `${donde.ficha?.delOjo?.toFixed(2)} de 5,63 u`);
control("y POR DEBAJO de la vista, que es donde va",
  Boolean(donde.muneco) && donde.muneco.arriba[1] < 0,
  cuadro(donde.muneco));
control("y de espaldas, no de perfil: reparte a los dos lados",
  Boolean(donde.muneco) && donde.muneco.derecha[0] < 0 && donde.muneco.derecha[1] > 0,
  `${donde.muneco?.derecha.map((v) => v.toFixed(1)).join("..")}`);
// EL DE LA PERSONAJA, que es otro modelo Y OTRAS PISTAS: el femenino declara
// `pistasDe` y su animación vive en el binario del masculino. Sin hacerle caso
// no sale un muñeco sin animar — salta una excepción dentro de un `await` de
// un manejador, la página se cae y las pruebas siguen en verde, porque el
// muñeco del jugador sí carga. Pasó, y lo cazó el contador de errores de otra
// sonda.
const ella = await pag.evaluate(async () => {
  const f = await window.probe.vista.genero("female");
  await window.probe.vista.genero("male");
  return f;
});
control("y el de la personaja también, con las pistas del otro modelo",
  Boolean(ella?.hay) && ella.triangulos > 0, `${ella?.triangulos ?? 0} triángulos`);
await foto("1-en-la-mano");

// ── 2. LOS DOS RELOJES ─────────────────────────────────────────────────────
//
// `atacar(s)` corre el mismo `tic` que el bucle, con el paso fijo, así que 12 s
// de juego caben en un instante. La espada dura 1,1 s: doce segundos son once
// mandobles, y si el daño cayera al pulsar saldrían cientos.
const mirandoAlAire = await pag.evaluate(() => {
  const s = window.probe.sesion.aparicion().nacimiento.escena;
  window.probe.mundo.poner(s[0], s[1], s[2]);
  return window.probe.golpe.atacar(12);
});
console.log(`  12 s aguantando: ${mirandoAlAire.empiezos} mandobles, ${mirandoAlAire.golpes} golpes, ` +
  `${mirandoAlAire.impactos} impactos`);
control("doce segundos dan once mandobles, no cien",
  mirandoAlAire.empiezos >= 10 && mirandoAlAire.empiezos <= 12, `${mirandoAlAire.empiezos}`);
control("y cada mandoble hace daño UNA vez",
  mirandoAlAire.golpes === mirandoAlAire.empiezos ||
  mirandoAlAire.golpes === mirandoAlAire.empiezos - 1,
  `${mirandoAlAire.golpes} golpes de ${mirandoAlAire.empiezos} mandobles`);
control("y en el punto de aparición no le da a nadie", mirandoAlAire.impactos === 0,
  `${mirandoAlAire.impactos} impactos`);

// ── 3. DE CERCA SÍ LE DA ───────────────────────────────────────────────────
//
// A 1,2 m del primer hostil y MIRÁNDOLO: el cono es de ±45° de rumbo, así que
// sin apuntar esto mediría hacia dónde miraba la cámara al nacer.
const cerca = await pag.evaluate(() => {
  const c = window.probe.ia.censo();
  const h = c.lista.filter((b) => b.hostil);
  // El primero al que se pueda llegar y ver. Se elige MIDIENDO y no probando
  // hasta que salga verde: ocho rumbos por tres distancias, y se queda con el
  // primero desde el que el arma tiene objetivo. Si ninguno valiera, lo dice.
  //
  // Y las distancias empiezan en 0,8 m por algo que midió esta misma sonda: el
  // alcance de la espada son 60 unidades **desde el ojo hasta el pecho del
  // bicho**, y 34 de esas 60 se las come la diferencia de alturas. O sea que el
  // alcance HORIZONTAL real es de 43 unidades, 1,09 m. A 1,2 m no se llega, y
  // eso no es un fallo: el cuerpo a cuerpo de Master Sword es un abrazo.
  const razones = [];
  for (let n = 0; n < h.length; n++) {
    for (const d of [0.8, 1.0, 0.6]) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const p = window.probe.ia.irA(n, d, a);
        if (!p) continue;
        window.probe.mundo.mirar(p[0], p[1] + 0.8, p[2]);
        const o = window.probe.golpe.objetivo();
        if (o) return { n, d, rumbo: Math.round((a * 180) / Math.PI), objetivo: o, razones };
        if (razones.length < 3) razones.push(window.probe.golpe.porque(n)?.razon);
      }
    }
  }
  return { razones };
});
if (!cerca?.objetivo) {
  control("hay algún hostil al que llegar y ver", false,
    `ninguno de los 33: ${(cerca?.razones ?? []).join(", ")}`);
} else {
  console.log(`  a ${cerca.d} m de ${cerca.objetivo.nombre} (hostil ${cerca.n}, rumbo ${cerca.rumbo}°): ` +
    `objetivo a ${cerca.objetivo.distancia.toFixed(1)} u, vida ${cerca.objetivo.vida}/${cerca.objetivo.vidaMaxima}`);
  control("hay algún hostil al que llegar y ver", true, cerca.objetivo.nombre);
  // El alcance de la espada son 60 unidades. Si el objetivo saliera a 200, la
  // esfera estaría mal medida y le daríamos a media plaza.
  control("y está dentro del alcance del arma", cerca.objetivo.distancia <= 60,
    `${cerca.objetivo.distancia.toFixed(1)} de 60 u`);

  const unGolpe = await pag.evaluate(() => {
    const antes = window.probe.golpe.victima(0);
    const r = window.probe.golpe.atacar(1.5);
    return { antes, despues: window.probe.golpe.victima(0), r };
  });
  const quitado = unGolpe.antes.vida - unGolpe.despues.vida;
  console.log(`  un mandoble (${unGolpe.r.empiezos} empezado, ${unGolpe.r.golpes} golpe): ` +
    `${unGolpe.antes.vida} -> ${unGolpe.despues.vida.toFixed(2)} de vida ` +
    `(${quitado.toFixed(2)} de daño), ${unGolpe.r.impactos} impactos`);
  control("un mandoble le quita vida", quitado > 0, `${quitado.toFixed(2)}`);
  // Y EL ORDEN DE MAGNITUD, que es el control que de verdad distingue haber
  // portado la fórmula de haberla inventado: con potencia 1 la espada hace el
  // 1 % de su daño, o sea entre 0,9 y 1,4 (y hasta 2,1 si sale crítico).
  control("y le quita el 1 % de su daño, que es lo que dice la potencia",
    quitado >= 0.9 && quitado <= 2.2, `${quitado.toFixed(2)} de 90-140`);
  control("y el bicho apunta quién se lo hizo, para la experiencia",
    Object.keys(unGolpe.despues.recibido).length === 1,
    Object.keys(unGolpe.despues.recibido).join(", "));
  await foto("2-pegando");

  // ── 4. CUÁNTOS MANDOBLES CUESTA ──────────────────────────────────────────
  //
  // Ésta es la cifra que cuenta el juego entero: con la espada de partida y un
  // punto de potencia, un goblin de 50 de vida se muere a los cuarenta y tantos
  // mandobles. No es un fallo nuestro — es la curva de progresión de Master
  // Sword, y la razón de que en el mapa haya ratas de 4 de vida.
  //
  // Y SE PEGA A TRAMOS, VOLVIENDO A ACERCARSE ENTRE UNO Y OTRO. La primera
  // versión daba los 120 s de un tirón y salía en rojo una vez de cada tres,
  // con 107 mandobles y cero daño: el goblin **se iba andando**. No era el
  // daño, era la puntería — pegábamos 107 veces al aire y el control decía
  // «el bicho no muere», que es una acusación contra el código equivocado.
  const matar = await pag.evaluate((donde) => {
    const antes = window.probe.golpe.victima(0);
    const hoja = JSON.stringify(window.probe.golpe.hoja().habilidades.swordsmanship);
    let golpes = 0, muertes = 0, impactos = 0;
    for (let tramo = 0; tramo < 12; tramo++) {
      const p = window.probe.ia.irA(donde.n, donde.d, (donde.rumbo * Math.PI) / 180);
      if (p) window.probe.mundo.mirar(p[0], p[1] + 0.8, p[2]);
      const r = window.probe.golpe.atacar(10);
      golpes += r.golpes; muertes += r.muertes; impactos += r.impactos;
      if (window.probe.golpe.victima(0).muerto) break;
    }
    return { antes, despues: window.probe.golpe.victima(0),
      r: { golpes, muertes, impactos }, hojaAntes: hoja,
      hojaDespues: JSON.stringify(window.probe.golpe.hoja().habilidades.swordsmanship) };
  }, { n: cerca.n, d: cerca.d, rumbo: cerca.rumbo });
  console.log(`  ${matar.r.golpes} mandobles más: ${matar.antes.nombre} ${matar.antes.vida.toFixed(0)} -> ` +
    `${matar.despues.vida.toFixed(0)} de vida, muerto=${matar.despues.muerto}`);
  control("a base de mandobles, el bicho MUERE", matar.despues.muerto === true,
    `${matar.r.muertes} muertes en ${matar.r.golpes} mandobles`);
  // Y LA CUENTA LO DICE, que no es lo mismo. Esto estaba sólo en el TEXTO del
  // control de arriba —«1 muertes en 4 mandobles»— y un número que vive en el
  // mensaje no lo comprueba nadie: se quitó a propósito el `cuentas.muertes++`
  // del mandoble y `sonda:golpe` siguió dando 25 de 25, porque el bicho seguía
  // muriéndose igual. El único control que la miraba era un TECHO
  // (`muertosTotales <= 1`), y cero también cumple un techo.
  control("y la cuenta de muertes se entera, no sólo el bicho",
    matar.r.muertes >= 1, `${matar.r.muertes} contada(s) para ${matar.despues.muerto ? "1" : "0"} muerto(s)`);
  control("y pone su animación de muerte",
    Boolean(matar.despues.animacion) && matar.despues.animacion === String(matar.despues.muerteQueDice ?? "").toLowerCase(),
    `'${matar.despues.animacion}' y su script dice '${matar.despues.muerteQueDice}'`);
  // Y DEJA DE SER UN MURO. `pev->solid = SOLID_NOT` en `SUB_StartFadeOut`. Sin
  // esto el cadáver es un obstáculo invisible, que no se ve: se choca.
  control("y deja de tener colisionador", matar.despues.solido === false,
    matar.despues.solido ? "sigue siendo un muro" : "ya no choca");
  // Y LA EXPERIENCIA, que es lo que le da sentido a `NPC_GIVE_EXP`.
  console.log(`  espada: ${matar.hojaAntes}`);
  console.log(`       -> ${matar.hojaDespues}`);
  control("y la experiencia llega a la hoja del personaje",
    matar.hojaAntes !== matar.hojaDespues,
    `${matar.despues.experiencia} de experiencia repartidos`);
  await foto("3-muerto");
}

// ── 5. LOS PACÍFICOS NO SE MUEREN DE PASADA ────────────────────────────────
//
// El control de que la esfera no sea un radar: pegando al lado de un aldeano
// no le tiene que pasar nada… pero si le apuntas SÍ, porque el motor no protege
// a nadie de un mandoble. Así que lo que se comprueba es lo que de verdad podría
// estar mal: que un mandoble mate a los 69 a la vez.
const todos = await pag.evaluate(() => {
  const c = window.probe.ia.censo();
  return { total: c.total, vivos: window.probe.golpe.estado };
});
const muertosTotales = await pag.evaluate(() => window.probe.golpe.estado.muertes);
console.log(`  muertes en toda la sonda: ${muertosTotales} de ${todos.total} bichos`);
control("un mandoble no mata a todo el mapa", muertosTotales <= 1,
  `${muertosTotales} muertes`);

// ── 6. ATACAR CORTA EL TROTE ───────────────────────────────────────────────
const trote = await pag.evaluate(() => {
  const antes = window.probe.golpe.estado.atacando;
  window.probe.golpe.atacar(0.1);
  return { antes, durante: window.probe.golpe.estado.atacando };
});
control("mientras blandes, el jugador está 'atacando'", trote.durante === true,
  `${trote.antes} -> ${trote.durante}`);

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(58)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
