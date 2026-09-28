// EL MAPA QUE SE COMPORTA, mirado en el mapa y no sólo en Node.
//
// Hasta ahora Gate City era geometría: todo lo que no fuera pared no era nada.
// Esto comprueba las cuatro cosas que le acabamos de dar, y ninguna se puede
// comprobar de otra forma —entre el horneado y el jugador están la conversión
// de unidades, los planos y Rapier, que es donde han estado todos los fallos de
// este experimento:
//
//   1. el AGUA moja, se nada y frena la caída
//   2. las ESCALERAS se suben
//   3. el `trigger_hurt` mata
//   4. las PUERTAS giran, esperan y se cierran solas — y no atrapan al jugador

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const PORT = 5197;
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
mkdirSync("build/gatecity/vistas", { recursive: true });
const foto = async (n) => { await pag.waitForTimeout(300); await pag.screenshot({ path: `build/gatecity/vistas/mapa-${n}.png` }); };

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
// Un personaje, que hace falta para que la sesión mande y para que el daño cobre.
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
await pag.waitForTimeout(400);

const sitios = await pag.evaluate(() => window.probe.mundo.sitios());
console.log(`  ${sitios.agua.length} volúmenes de agua · ${sitios.escaleras.length} escaleras · ` +
  `${sitios.dano.length} de daño · ${sitios.puertas.length} puertas`);
control("el mapa trae las nueve puertas", sitios.puertas.length === 9, `${sitios.puertas.length}`);
control("y los tres volúmenes de agua", sitios.agua.length === 3);
control("y las dos escaleras", sitios.escaleras.length === 2);

const centro = (c) => [0, 1, 2].map((k) => (c.min[k] + c.max[k]) / 2);

// ── 1. EL AGUA ─────────────────────────────────────────────────────────────
//
// Se busca el estanque grande, que es el que NO es una caja: el que justificó
// hacer esto con planos en vez de con la envolvente.
const estanque = sitios.agua.reduce((a, b) =>
  (a.max[0] - a.min[0]) * (a.max[2] - a.min[2]) > (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) ? a : b);
const dentroAgua = centro(estanque);
const medio = await pag.evaluate((p) => {
  window.probe.mundo.poner(p[0], p[1], p[2]);
  return window.probe.mundo.medio();
}, [dentroAgua[0], estanque.min[1] + 0.3, dentroAgua[2]]);
console.log(`  en el estanque: nivel de agua ${medio.agua}`);
control("dentro del estanque hay agua", medio.agua >= 1, `nivel ${medio.agua}`);

// Y FUERA NO, que es el control que faltaba en la primera versión de esto: una
// caja envolvente habría dicho «agua» también en la esquina.
const esquina = [estanque.min[0] + 0.15, estanque.min[1] + 0.3, estanque.min[2] + 0.15];
const fuera = await pag.evaluate((p) => {
  window.probe.mundo.poner(p[0], p[1], p[2]);
  return window.probe.mundo.medio();
}, esquina);
console.log(`  en la esquina de su caja: nivel ${fuera.agua}`);
control("y en la esquina de su caja NO", fuera.agua === 0,
  fuera.agua ? `da ${fuera.agua}: se está usando la envolvente` : "seco, como debe");

// Se nada: dentro del agua, pulsar adelante mueve y no se hunde como una piedra.
await pag.evaluate((p) => window.probe.mundo.poner(p[0], p[1], p[2]),
  [dentroAgua[0], dentroAgua[1], dentroAgua[2]]);
await pag.waitForTimeout(200);
const antes = await pag.evaluate(() => window.probe.player.feet);
await pag.keyboard.down("KeyW");
await pag.waitForTimeout(1200);
await pag.keyboard.up("KeyW");
const despues = await pag.evaluate(() => window.probe.player.feet);
const nadado = Math.hypot(despues[0] - antes[0], despues[2] - antes[2]);
console.log(`  nadando: ${nadado.toFixed(2)} m en 1,2 s`);
control("se nada", nadado > 0.4, `${nadado.toFixed(2)} m`);

// Y sin tocar nada se HUNDE, que es `wishvel[2] -= 60` y es lo que hace que
// salir del agua valga algo.
await pag.evaluate((p) => window.probe.mundo.poner(p[0], p[1], p[2]),
  [dentroAgua[0], estanque.max[1] - 0.2, dentroAgua[2]]);
const alto0 = (await pag.evaluate(() => window.probe.player.feet))[1];
await pag.waitForTimeout(1000);
const alto1 = (await pag.evaluate(() => window.probe.player.feet))[1];
console.log(`  sin tocar nada baja ${(alto0 - alto1).toFixed(2)} m en 1 s`);
control("y sin tocar nada se hunde", alto0 - alto1 > 0.1, `${(alto0 - alto1).toFixed(2)} m`);
await foto("1-agua");

// ── 2. LA CAÍDA AL AGUA NO MATA ────────────────────────────────────────────
//
// `PM_CheckFalling` no cobra la caída si hay `waterlevel`. Es la diferencia
// entre una charca y una trampa.
const caida = await pag.evaluate(async (p) => {
  const v0 = window.probe.sesion.vitales().vida;
  // Justo debajo de la superficie, y se le mete velocidad de caída MORTAL.
  //
  // La primera versión lo soltaba desde diez metros y pasaba por el motivo
  // equivocado: el estanque grande está BAJO TECHO —se aterriza en el suelo de
  // arriba, cinco metros por encima del agua, sin llegar a mojarse— así que
  // medía la geometría y no la regla. `CAIDA.mortal` son 1 024 u/s.
  window.probe.mundo.poner(p[0], p[1], p[2]);
  await new Promise((r) => setTimeout(r, 100));
  const nivel = window.probe.mundo.medio().agua;
  window.probe.mundo.caer(1400);
  await new Promise((r) => setTimeout(r, 900));
  return { antes: v0, despues: window.probe.sesion.vitales().vida, nivel };
}, dentroAgua);
console.log(`  1 400 u/s de caída DENTRO del agua (nivel ${caida.nivel}): vida ${caida.antes} → ${caida.despues}`);
control("y se está en el agua al hacerlo", caida.nivel >= 2, `nivel ${caida.nivel}`);
control("una caída mortal dentro del agua no hace daño", caida.despues === caida.antes,
  `${caida.antes} → ${caida.despues}`);

// El control: la MISMA velocidad en seco mata. Sin esto, «el agua protege» lo
// pasaría también un mundo en el que la caída no hace daño nunca.
const enSeco = await pag.evaluate(async () => {
  const s = window.probe.sesion.aparicion().nacimiento.escena;
  window.probe.sesion.reaparecer();
  await new Promise((r) => setTimeout(r, 300));
  const v0 = window.probe.sesion.vitales().vida;
  window.probe.mundo.poner(s[0], s[1] + 0.5, s[2]);
  await new Promise((r) => setTimeout(r, 100));
  window.probe.mundo.caer(1400);
  await new Promise((r) => setTimeout(r, 900));
  return { antes: v0, despues: window.probe.sesion.vitales().vida, agua: window.probe.mundo.medio().agua };
});
console.log(`  la misma velocidad en seco (nivel ${enSeco.agua}): vida ${enSeco.antes} → ${enSeco.despues}`);
control("y en seco SÍ mata", enSeco.despues < enSeco.antes, `${enSeco.antes} → ${enSeco.despues}`);

// ── 3. LAS ESCALERAS ───────────────────────────────────────────────────────
const escalera = sitios.escaleras[0];
const cEsc = centro(escalera);
const trepa = await pag.evaluate(async (e) => {
  // Al pie de la escalera, pegado a ella.
  window.probe.mundo.poner(e.c[0], e.min1 + 0.2, e.c[2]);
  await new Promise((r) => setTimeout(r, 200));
  return { medio: window.probe.mundo.medio(), y: window.probe.player.feet[1] };
}, { c: cEsc, min1: escalera.min[1] });
console.log(`  al pie de la escalera: ${trepa.medio.escalera ? `normal ${trepa.medio.escalera}` : "NO la detecta"}`);
control("la escalera se detecta", Array.isArray(trepa.medio.escalera),
  JSON.stringify(trepa.medio.escalera));

if (Array.isArray(trepa.medio.escalera)) {
  // Mirando hacia la escalera y andando hacia delante, se sube.
  const n = trepa.medio.escalera;
  await pag.evaluate((nn) => {
    // El yaw que mira CONTRA la normal: la escalera está delante.
    window.probe.player.yaw = Math.atan2(-(-nn[0]), -(-nn[2]));
    window.probe.player.pitch = 0;
  }, n);
  const y0 = await pag.evaluate(() => window.probe.player.feet[1]);
  await pag.keyboard.down("KeyW");
  await pag.waitForTimeout(1200);
  await pag.keyboard.up("KeyW");
  const y1 = await pag.evaluate(() => window.probe.player.feet[1]);
  console.log(`  trepando: ${(y1 - y0).toFixed(2)} m en 1,2 s`);
  control("y se sube por ella", y1 - y0 > 0.5, `${(y1 - y0).toFixed(2)} m`);
  await foto("2-escalera");
}

// ── 4. EL `trigger_hurt` MATA ──────────────────────────────────────────────
const cDano = centro(sitios.dano[0]);
const mata = await pag.evaluate(async (p) => {
  window.probe.sesion.reaparecer();
  await new Promise((r) => setTimeout(r, 300));
  const v0 = window.probe.sesion.vitales().vida;
  window.probe.mundo.poner(p[0], p[1], p[2]);
  await new Promise((r) => setTimeout(r, 600));
  return { antes: v0, despues: window.probe.sesion.vitales().vida, estado: window.probe.sesion.estado() };
}, cDano);
console.log(`  en el trigger_hurt: vida ${mata.antes} → ${mata.despues}, estado ${mata.estado}`);
control("el trigger_hurt mata", mata.despues <= 0 || mata.estado !== "jugando",
  `${mata.antes} → ${mata.despues} (${mata.estado})`);

// ── 5. LAS PUERTAS ─────────────────────────────────────────────────────────
await pag.evaluate(async () => {
  window.probe.sesion.reaparecer();
  await new Promise((r) => setTimeout(r, 300));
});
const p0 = sitios.puertas[0];
const estado0 = await pag.evaluate(() => window.probe.mundo.puertas());
console.log(`  puertas al empezar: ${[...new Set(estado0.map((p) => p.estado))].join(", ")}`);
control("empiezan todas cerradas", estado0.every((p) => p.estado === "cerrada"));

// Y ESTAN DONDE ESTABAN, que es lo que de verdad podia salir mal.
//
// La malla de cada puerta se emite en coordenadas de su BISAGRA y el nodo se
// coloca en la bisagra. Si ese par estuviera mal, las nueve saldrian
// desplazadas — y nueve piezas de trescientas dieciseis siguen pareciendo un
// mapa correcto, que es exactamente como sobrevive un fallo en este proyecto.
const sitio = await pag.evaluate(() => window.probe.mundo.cajasDePuerta());
const desvios = sitio.map((d) => Math.max(
  ...[0, 1, 2].map((k) => Math.max(
    Math.abs(d.medida.min[k] - d.horneada.min[k]),
    Math.abs(d.medida.max[k] - d.horneada.max[k])))));
const peor = Math.max(...desvios);
console.log(`  las nueve puertas, cerradas: el peor vértice a ${(peor * 100).toFixed(1)} cm de donde las horneamos`);
control("cada puerta está donde la dejó el compilador", peor < 0.02, `${(peor * 100).toFixed(1)} cm`);

// Lejos de todas, el reloj no las abre. Es el control de que abrir significa algo.
const lejos = await pag.evaluate(() => {
  const s = window.probe.sesion.aparicion().nacimiento.escena;
  window.probe.mundo.poner(s[0], s[1], s[2]);
  return window.probe.mundo.ticPuertas(1 / 60, 120);
});
control("y lejos siguen cerradas", lejos.every((p) => p.estado === "cerrada"),
  [...new Set(lejos.map((p) => p.estado))].join(", "));

// Al lado de una, se abre — y en el tiempo que dice el `.bsp`: 90° a 100°/s
// son 0,9 segundos.
// DE QUÉ LADO SE PONE UNO, sacado de la caja y no supuesto.
//
// Lo tenía escrito dando por hecho que la hoja se extiende en X, y la primera
// puerta del mapa mide 0,10 × 2,84 × 1,63: es fina en X y ancha en Z. Con el
// eje supuesto, «ponerse delante» ponía al jugador DENTRO de la puerta, y las
// pruebas nuevas medían cualquier cosa.
const ejeFino = (c) => ((c.max[0] - c.min[0]) < (c.max[2] - c.min[2]) ? 0 : 2);
/** Un sitio delante de la cara ancha, a `d` metros, y la mirada hacia ella. */
function delanteDe(c, d) {
  const f = ejeFino(c);
  const p = [0, 1, 2].map((k) => (c.min[k] + c.max[k]) / 2);
  p[1] = c.min[1] + 0.1;
  p[f] += d;
  const mirando = [0, 0, 0];
  mirando[f] = -Math.sign(d);
  return { donde: p, mirando };
}

const abre = await pag.evaluate(async ([d, sitio]) => {
  window.probe.mundo.poner(...sitio.donde);
  const antes = window.probe.mundo.puertas();
  // 60 pasos de 1/60 = un segundo, que basta para 90° a 100°/s.
  const tras = window.probe.mundo.ticPuertas(1 / 60, 60, sitio.mirando);
  return { antes, tras };
}, [p0, delanteDe(p0.caja, 0.5)]);
const suya = (lista) => lista.find((p) => p.modelo === (sitios.puertas[0].modelo ?? lista[0].modelo)) ?? lista[0];
const abierta = abre.tras.filter((p) => p.angulo > 0);
console.log(`  tras un segundo al lado: ${abierta.length} puerta(s) con ángulo, la mayor a ${Math.max(0, ...abre.tras.map((p) => p.angulo)).toFixed(0)}°`);
control("acercarse a una puerta la abre", abierta.length >= 1, `${abierta.length}`);
control("y abre los 90 grados que dice el .bsp",
  Math.max(0, ...abre.tras.map((p) => p.angulo)) >= 89.9,
  `${Math.max(0, ...abre.tras.map((p) => p.angulo)).toFixed(1)}°`);

// Y se cierra sola a los 4 segundos de dejarla — pero NO mientras sigues ahí.
const sigueAbierta = await pag.evaluate(() => window.probe.mundo.ticPuertas(1 / 60, 60 * 6));
control("no se cierra con el jugador delante",
  sigueAbierta.some((p) => p.angulo > 0), `la mayor a ${Math.max(0, ...sigueAbierta.map((p) => p.angulo)).toFixed(0)}°`);

const cerrada = await pag.evaluate(async () => {
  const s = window.probe.sesion.aparicion().nacimiento.escena;
  window.probe.mundo.poner(s[0], s[1], s[2]);
  // Cuatro de espera más uno de giro, con margen.
  return window.probe.mundo.ticPuertas(1 / 60, 60 * 7);
});
console.log(`  tras irse: ${[...new Set(cerrada.map((p) => p.estado))].join(", ")}`);
control("y al irse se cierra sola", cerrada.every((p) => p.angulo === 0),
  `la mayor a ${Math.max(0, ...cerrada.map((p) => p.angulo)).toFixed(1)}°`);
// Y UNA FOTO MIRANDO A LA PUERTA, que antes no la enseñaba: la cámara se
// quedaba con el rumbo que tuviera y salía el pasillo. Hace falta para ver la
// LUZ de la hoja — las caras de la puerta se emitían fuera del atlas y salían
// negras, y eso el horneado ya lo mide, pero verlo también vale.
//
// `forward` es (0,0,−1) girado por el yaw, o sea (−sin y, 0, −cos y). Así que
// el yaw que mira a un vector plano es `atan2(−mx, −mz)`.
{
  const sitio = delanteDe(p0.caja, 1.2);
  await pag.evaluate(([s]) => {
    window.probe.mundo.cerrarPuertas();
    window.probe.mundo.poner(...s.donde);
    window.probe.player.yaw = Math.atan2(-s.mirando[0], -s.mirando[2]);
    window.probe.player.pitch = 0;
  }, [sitio]);
  await foto("3-puerta-cerrada");
  await pag.evaluate(([s]) => window.probe.mundo.ticPuertas(1 / 60, 60, s.mirando), [sitio]);
  await foto("3-puerta-abierta");
}
await foto("3-puerta");

// ── 5b. Y HACIA QUÉ LADO SE ABRE ───────────────────────────────────────────
//
// `CBaseDoor::DoorGoUp` decide el lado mirando a quién la abre, y no es un
// detalle: una puerta que gira hacia ti te empuja, y con un cuerpo cinemático
// te empotra. Lo que se mide es la ASIMETRÍA —la misma puerta, el mismo
// empujón, desde los dos lados— porque un signo fijo pasa cualquier prueba que
// mire un lado solo, y era exactamente lo que había.
//
// El desplazamiento en X aleja al jugador del EJE de la bisagra: justo encima
// el cruce vale cero y el motor da el mismo signo por los dos lados.
const lados = [];
for (const lado of [0.6, -0.6]) {
  const sitio = delanteDe(p0.caja, lado);
  const r = await pag.evaluate(([d, s]) => {
    window.probe.mundo.cerrarPuertas();
    window.probe.mundo.poner(...s.donde);
    const p = window.probe.mundo.ticPuertas(1 / 60, 30, s.mirando);
    return p.find((q) => q.modelo === d.modelo) ?? null;
  }, [p0, sitio]);
  lados.push(r);
}
console.log(`  la misma puerta desde los dos lados: signo ${lados[0]?.signo} y ${lados[1]?.signo}`);
control("la puerta se abre al revés según de qué lado la empujes",
  lados[0] && lados[1] && lados[0].signo === -lados[1].signo,
  `${lados[0]?.signo} vs ${lados[1]?.signo}`);

// Y LO QUE ESTO ARREGLA: que abrirla no te mueva de donde estás.
//
// Es el control que le falta a «se abre»: la hoja giraba hacia el jugador y lo
// empujaba, y eso no da error — da un juego en el que las puertas te apartan.
const empujon = await pag.evaluate(async ([d, s]) => {
  window.probe.mundo.cerrarPuertas();
  const antes = window.probe.mundo.poner(...s.donde);
  const tras = window.probe.mundo.ticPuertas(1 / 60, 90, s.mirando);
  return { antes, despues: window.probe.player.feet, angulo: tras.find((q) => q.modelo === d.modelo)?.angulo ?? 0 };
}, [p0, delanteDe(p0.caja, 0.6)]);
const movido = Math.hypot(
  empujon.despues[0] - empujon.antes[0], empujon.despues[2] - empujon.antes[2]);
console.log(`  la puerta llega a ${empujon.angulo.toFixed(0)}° y el jugador se mueve ${(movido * 100).toFixed(1)} cm`);
// DOS condiciones, y la primera faltaba: «no me ha empujado» lo cumple también
// una puerta que no se ha abierto, que es la lección del barril otra vez.
control("la puerta llega a abrirse del todo", empujon.angulo >= 89.9, `${empujon.angulo.toFixed(1)}°`);
control("y abrirla NO empuja al jugador", movido < 0.25, `${(movido * 100).toFixed(1)} cm`);

// Y SI TE PONES EN MEDIO, la hoja retrocede: `CBaseDoor::Blocked` invierte el
// sentido en vez de aplastarte. Sin esto, una hoja cinemática que barre donde
// estás te mete en la pared y de ahí no se sale — que es lo de «el jugador se
// queda atascado a la puerta».
//
// Se busca el sitio: el arco que barre la hoja, a medio camino de su apertura.
// El punto del arco se CALCULA con el signo real de esta apertura, que es el
// que acabamos de medir: a ojo, media vez de cada dos cae del lado vacío y el
// control diría que no retrocede sin que nada esté mal.
const signoReal = lados[0]?.signo ?? 1;
const anchoEje = ejeFino(p0.caja) === 0 ? 2 : 0;
const largo = p0.caja.max[anchoEje] - p0.caja.min[anchoEje];
const haciaLaPunta = Math.sign(
  (p0.caja.min[anchoEje] + p0.caja.max[anchoEje]) / 2 - p0.bisagra[anchoEje]) || 1;
const medioArco = (() => {
  // La mitad de la hoja, girada 45° sobre la bisagra con el signo real.
  const a = (45 * Math.PI) / 180 * signoReal;
  const l = [0, 0, 0];
  l[anchoEje] = (largo / 2) * haciaLaPunta;
  const x = l[0] * Math.cos(a) + l[2] * Math.sin(a);
  const z = -l[0] * Math.sin(a) + l[2] * Math.cos(a);
  return [p0.bisagra[0] + x, p0.caja.min[1] + 0.1, p0.bisagra[2] + z];
})();

const trabar = await pag.evaluate(async ([d, punto, mirando]) => {
  window.probe.mundo.cerrarPuertas();
  window.probe.mundo.poner(...punto);
  const antes = window.probe.player.feet;
  const angulos = [];
  for (let i = 0; i < 120; i++) {
    const s = window.probe.mundo.ticPuertas(1 / 60, 1, mirando);
    angulos.push(s.find((q) => q.modelo === d.modelo)?.angulo ?? 0);
  }
  return { antes, despues: window.probe.player.feet, angulos };
}, [p0, medioArco, delanteDe(p0.caja, 0.6).mirando]);
const desplazado = Math.hypot(
  trabar.despues[0] - trabar.antes[0], trabar.despues[2] - trabar.antes[2]);
// ¿Ha retrocedido alguna vez? Un ángulo que baja después de subir es la
// inversión. Si sólo subiera, la hoja habría pasado por encima del jugador.
const retrocede = trabar.angulos.some((a, i) => i > 0 && a < trabar.angulos[i - 1] - 1e-9);
const maximo = Math.max(...trabar.angulos);
console.log(`  en medio del arco: la hoja llega a ${maximo.toFixed(0)}°, ` +
  `${retrocede ? "retrocede" : "NO retrocede"}, y el jugador se mueve ${(desplazado * 100).toFixed(1)} cm`);
control("estar en el arco de la hoja la hace retroceder", retrocede, `máximo ${maximo.toFixed(0)}°`);
control("y no te saca de tu sitio", desplazado < 0.5, `${(desplazado * 100).toFixed(1)} cm`);

// ── 6. LO QUE CHOCA Y NO ES EL MAPA ────────────────────────────────────────
const sol = await pag.evaluate(() => window.probe.mundo.solidos());
console.log(`  chocan ${sol.adornos} adornos de ${sol.adornosTotal} (${sol.atravesables} se atraviesan) y ` +
  `${sol.bichos} bichos de ${sol.bichosTotal}`);
control("los adornos sólidos tienen colisión", sol.adornos > 50, `${sol.adornos}`);
control("y los bichos también", sol.bichos > 50, `${sol.bichos} de ${sol.bichosTotal}`);
// Y NO todos, que es lo que dice el mod: sin este control habríamos «arreglado»
// los helechos y el jugador se quedaría enganchado en uno.
control("y los que el juego deja pasar NO la tienen", sol.atravesables > 0,
  `${sol.atravesables} atravesables`);

// Que la colisión EXISTE se comprueba andando contra una: se pone al jugador
// al lado de un barril, se anda hacia él y no se le atraviesa.
// EL LADO DESPEJADO SE ELIGE CON LOS DATOS, no probando hasta que salga verde.
//
// La primera versión se acercaba siempre por −X y daba cero: los barriles de
// Gate City están en RACIMO, y por ese lado había otro barril a un metro. Así
// que se busca un obstáculo con dos metros libres por delante, mirando la lista
// de cajas sólidas.
const conHueco = (() => {
  for (const c of sol.cajas) {
    const caja = c.caja;
    const cx = (caja.min[0] + caja.max[0]) / 2, cz = (caja.min[2] + caja.max[2]) / 2;
    for (const [nombre, dx] of [["−X", -1], ["+X", 1]]) {
      const a = cx + dx * 2.2, b = cx + dx * 0.6;
      const libre = sol.cajas.every((o) => o === c ||
        o.caja.max[0] < Math.min(a, b) || o.caja.min[0] > Math.max(a, b) ||
        o.caja.max[2] < cz - 0.5 || o.caja.min[2] > cz + 0.5 ||
        o.caja.max[1] < caja.min[1] || o.caja.min[1] > caja.max[1]);
      if (libre) return { c, caja, cx, cz, dx, nombre };
    }
  }
  return null;
})();

if (conHueco) {
  const { caja, cx, cz, dx, nombre, c } = conHueco;
  console.log(`  se prueba contra ${c.modelo.split("/").pop()} por ${nombre}`);
  const inicio = await pag.evaluate(async (o) => {
    window.probe.mundo.poner(o.cx + o.dx * 2, o.min1 + 0.05, o.cz);
    // El yaw que mira hacia el obstáculo: con yaw 0 se mira a −Z y
    // `dx = −sin(yaw)`, así que para ir hacia −X hace falta +π/2.
    window.probe.player.yaw = o.dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    window.probe.player.pitch = 0;
    await new Promise((r) => setTimeout(r, 400));
    return window.probe.player.feet[0];
  }, { cx, cz, dx, min1: caja.min[1] });
  await pag.keyboard.down("KeyW");
  await pag.waitForTimeout(1500);
  await pag.keyboard.up("KeyW");
  const x = (await pag.evaluate(() => window.probe.player.feet))[0];
  const avanzado = Math.abs(x - inicio);
  const alCentro = Math.abs(cx - x);
  console.log(`  avanza ${avanzado.toFixed(2)} m y se para a ${alCentro.toFixed(2)} m del centro`);
  // DOS condiciones, y la primera faltaba: la primera versión sólo pedía «no
  // ha pasado del centro», que lo cumple también un jugador que no se mueve —
  // y era exactamente lo que estaba pasando.
  control("andar hacia un adorno sólido MUEVE al jugador", avanzado > 0.5, `${avanzado.toFixed(2)} m`);
  control("y el adorno lo para antes de atravesarlo", alCentro > 0.2 && alCentro < 1.5,
    `se queda a ${alCentro.toFixed(2)} m del centro`);
} else {
  control("hay algún adorno sólido con hueco delante para probarlo", false);
}

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(48)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
