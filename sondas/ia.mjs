// LA CAZA, medida en el mapa.
//
// Hasta ahora los 69 bichos paseaban: treinta líneas que andan y giran al
// chocar. Esto comprueba que ahora corren `npcatk_hunt`, y lo comprueba
// midiendo, porque las cinco formas de que esto esté mal se ven igual de bien
// en una captura:
//
//   1. que nadie sea hostil          -> el pueblo es un decorado
//   2. que el hostil no te vea       -> se queda plantado
//   3. que te vea y no se mueva      -> igual, pero con animación de correr
//   4. que llegue y no pegue         -> te empuja y ya
//   5. que te ataque TODO el mundo   -> el tabernero te mata

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const PORT = 5200;
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
mkdirSync("build/gatecity/vistas", { recursive: true });
const foto = async (n) => { await pag.waitForTimeout(300); await pag.screenshot({ path: `build/gatecity/vistas/ia-${n}.png` }); };

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
await pag.waitForTimeout(400);

// ── 1. EL CENSO: quién es hostil, y que no sean ni todos ni ninguno ────────
const censo = await pag.evaluate(() => window.probe.ia.censo());
const porRaza = {};
for (const b of censo.lista) {
  const k = `${b.raza ?? "(sin raza)"}${b.hostil ? " HOSTIL" : ""}`;
  porRaza[k] = (porRaza[k] ?? 0) + 1;
}
console.log(`  ${censo.total} bichos, ${censo.hostiles} hostiles`);
console.log(`  ${JSON.stringify(porRaza)}`);
control("hay bichos hostiles", censo.hostiles > 0, `${censo.hostiles}`);
// Las dos mitades, y la segunda es la que falta casi siempre: si TODOS fueran
// hostiles la tabla de razas no estaría haciendo nada y el pueblo te mataría.
control("y NO lo son todos", censo.hostiles < censo.total,
  `${censo.total - censo.hostiles} pacíficos`);
control("los goblins y los zombis sí", censo.lista.filter((b) =>
  ["goblin", "undead", "spider"].includes(b.raza)).every((b) => b.hostil));
control("y los humanos del pueblo no", censo.lista.filter((b) =>
  ["human", "beloved"].includes(b.raza)).every((b) => !b.hostil),
  `${censo.lista.filter((b) => b.raza === "human").length} humanos`);
// Y el caso raro que sólo sale de leer la tabla: RECELO vale −2, o sea
// negativo, así que un «relación < 0» lo habría hecho hostil.
const recelosos = censo.lista.filter((b) => b.relacion === -2);
console.log(`  recelosos (sólo atacan si les atacas): ${recelosos.length} — ${[...new Set(recelosos.map((b) => b.raza))].join(", ")}`);
control("los recelosos NO son hostiles pese a tener relación negativa",
  recelosos.length > 0 && recelosos.every((b) => !b.hostil),
  `${recelosos.length} con relación −2`);

// ── 2. LAS DOS VELOCIDADES ─────────────────────────────────────────────────
const antes = await pag.evaluate(() => window.probe.ia.estado(0));
console.log(`  ${antes.nombre}: andar ${antes.velocidad?.toFixed(2)} m/s, correr ${antes.velocidadCorriendo?.toFixed(2)} m/s`);
control("el hostil tiene velocidad de correr", antes.velocidadCorriendo > 0,
  `${antes.velocidadCorriendo?.toFixed(2)} m/s`);
control("y NO es la misma que la de andar", antes.velocidadCorriendo !== antes.velocidad,
  `${antes.velocidad?.toFixed(2)} vs ${antes.velocidadCorriendo?.toFixed(2)}`);

// ── 3. LEJOS NO PASA NADA ──────────────────────────────────────────────────
//
// El control de que ver signifique algo: en el punto de aparición, ningún
// hostil debería estar persiguiendo a nadie.
const lejos = await pag.evaluate(() => {
  const s = window.probe.sesion.aparicion().nacimiento.escena;
  window.probe.mundo.poner(s[0], s[1], s[2]);
  return window.probe.ia.correr(3);
});
console.log(`  desde el punto de aparición: ${lejos.intencion}, objetivo ${lejos.objetivo}`);
control("lejos, el hostil no persigue a nadie", lejos.objetivo === null, `${lejos.intencion}`);

// ── 4. DELANTE: TE VE, TE PERSIGUE Y TE PEGA ───────────────────────────────
// A 7 metros, que son 276 unidades: **fuera del alcance de golpe** del goblin,
// que es 130. La primera versión lo puso a 3 m —118 unidades— y el goblin
// atacaba sin moverse un centímetro, así que «se acerca» daba 0,00 m y parecía
// que la persecución no funcionaba. Estaba midiendo dentro del alcance.
const puesto = await pag.evaluate(() => {
  // Ocho rumbos alrededor del bicho. Se queda con el primero desde el que el
  // bicho SÍ ve al jugador, y eso no es «probar hasta que salga verde»: es
  // elegir un sitio válido midiendo, igual que con el barril. Si ninguno
  // valiera, lo dice y el control falla.
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const p = window.probe.ia.irA(0, 7, a);
    if (!p) return null;
    if (window.probe.ia.ve(0)) return { bicho: p, rumbo: Math.round((a * 180) / Math.PI) };
  }
  return { bicho: window.probe.ia.irA(0, 7, 0), rumbo: null };
});
const sitio = puesto.bicho;
console.log(`  jugador a 7 m del primer hostil (rumbo ${puesto.rumbo ?? "ninguno vale"}), ` +
  `bicho en ${sitio.map((v) => v.toFixed(1)).join(", ")}`);
control("hay algún sitio a 7 m desde el que el bicho ve al jugador", puesto.rumbo !== null,
  puesto.rumbo === null ? "los ocho rumbos dan pared" : `${puesto.rumbo}°`);
const trasVer = await pag.evaluate(() => window.probe.ia.correr(3));
console.log(`  tras 3 s: ${trasVer.intencion}, objetivo ${trasVer.objetivo}, rango ${trasVer.rango?.toFixed(0)} u, ` +
  `anim '${trasVer.animacion}', frenado por: ${trasVer.frenado ?? "nada"}`);
control("de cerca, el hostil te toma como objetivo", trasVer.objetivo === "jugador", `${trasVer.objetivo}`);
control("y cambia de animación", Boolean(trasVer.animacion) && trasVer.animacion !== antes.animacion,
  `${antes.animacion} -> ${trasVer.animacion}`);

const movido = Math.hypot(trasVer.escena[0] - sitio[0], trasVer.escena[2] - sitio[2]);
console.log(`  se ha movido ${movido.toFixed(2)} m desde donde estaba`);
// DOS condiciones: «me persigue» lo cumple también uno que no se mueve.
control("y se ACERCA de verdad", movido > 0.5, `${movido.toFixed(2)} m`);

const golpes = await pag.evaluate(async () => {
  const antes = window.probe.ia.golpes;
  window.probe.ia.correr(12);
  return {
    antes, despues: window.probe.ia.golpes,
    atacantes: window.probe.ia.atacantes(),
  };
});
const recibidos = golpes.despues - golpes.antes;
console.log(`  golpes encajados: ${golpes.antes} -> ${golpes.despues}, de ${golpes.atacantes.length} atacantes ` +
  `(${[...new Set(golpes.atacantes)].join(", ")})`);
control("y acaba pegando al jugador", recibidos > 0, `${recibidos} golpes en 12 s`);
// Y EL TECHO: con `HACK_ATTACK_DELAY 1.0` nadie puede pegar mas de una vez por
// segundo. 23 golpes en 12 s solo cuadra si pegan varios — y si cuadrara con
// uno, la espera entre golpes no estaria haciendo nada y no daria error.
const techo = Math.max(1, golpes.atacantes.length) * 12;
control("y ninguno pega mas de una vez por segundo", recibidos <= techo,
  `${recibidos} <= ${golpes.atacantes.length} atacantes x 12 s`);
await foto("1-perseguido");

// ── 5. Y UN PACÍFICO NO HACE NADA ──────────────────────────────────────────
//
// El control negativo del anterior: lo mismo, al lado de un aldeano.
const conPacifico = await pag.evaluate(() => {
  const c = window.probe.ia.censo();
  const p = c.lista.find((b) => !b.hostil && b.raza === "human");
  if (!p) return null;
  window.probe.mundo.poner(p.escena[0] + 1.5, p.escena[1] + 0.2, p.escena[2]);
  const antes = window.probe.ia.golpes;
  window.probe.ia.correr(8);
  return { antes, despues: window.probe.ia.golpes, quien: p.nombre };
});
if (conPacifico) {
  console.log(`  8 s al lado de ${conPacifico.quien}: ${conPacifico.despues - conPacifico.antes} golpes`);
  control("un aldeano NO te pega aunque te pongas encima",
    conPacifico.despues === conPacifico.antes, `${conPacifico.quien}`);
} else {
  control("hay algún aldeano pacífico con el que probarlo", false);
}

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(56)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
