// EL ESCUDO, medido en el mapa.
//
// El 19 dejó al jugador recibiendo golpes sin poder hacer nada: el goblin pega y
// la vida baja. Esto mide la otra mitad de defenderse, que es un sistema aparte
// del parry y llega ANTES que él.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//   1. el catálogo no llega al navegador   -> no hay escudo y la tecla no hace nada
//   2. el modelo de vista no se monta      -> bloquea pero no se ve nada
//   3. el escudo se cae al segundo         -> se leyó `MELEE_ATK_DURATION` y no el -1
//   4. bloquear anula el golpe             -> el escudo arriba es invulnerabilidad
//   5. el cono se calcula en grados        -> bloquea 175° y no los 53 de verdad
//   6. se puede atacar cubriéndose         -> el escudo sale gratis
//   7. el escudo abajo no hace nada        -> se pierde el 15 % que sí protege
//   8. el escudo se cobra aguante          -> se leyó MELEE_ENERGY, que está muerto
//   9. el parry corre antes que el escudo  -> se para lo que el escudo ya anuló

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const PORT = 5204;
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
mkdirSync("build/gatecity/vistas", { recursive: true });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 })
  .catch(() => {});

// EL MUNDO QUIETO. Desde el 22 los 53 bichos con `roam 1` pasean de verdad por
// el bucle del juego, y esta sonda mide cosas que dependen de DÓNDE está cada
// uno — el radio del grito al morir, tener un goblin pegado para que pegue—.
// Con el pueblo andando, esos controles miden el dado y salen rojos una vez de
// cada tres. Se apaga el `roam` y sólo el `roam`: la caza sigue encendida.
await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));

// ── 1. EL DATO, y que llega ────────────────────────────────────────────────
const cero = await pag.evaluate(() => window.probe.escudo.estado);
console.log(`\n  catálogo de escudos: ${cero.catalogo}`);
control("los siete escudos llegan al navegador", cero.catalogo === 7, `${cero.catalogo}`);
control("y un personaje nuevo no lleva ninguno, porque se compran",
  cero.id === null && cero.postura === null, `${cero.id ?? "ninguno"}`);
control("su parry es 1, no 0: el valor de una habilidad tiene suelo",
  cero.parry === 1, `parry ${cero.parry}`);

const puesto = await pag.evaluate(() => window.probe.escudo.embrazar("shields_buckler"));
console.log(`  embrazado: ${puesto.nombre} (${puesto.id})`);
console.log(`    arriba ${puesto.ficha.bloqueoArriba} % y pasa el ${Math.round(puesto.ficha.danoQuePasa * 100)} %  |  ` +
  `abajo ${puesto.ficha.bloqueoAbajo} % de anular  |  parry x${puesto.ficha.multiplicadorDeParry}`);
control("el escudo de entrenamiento se embraza y trae sus tres cifras",
  puesto.ficha?.bloqueoArriba === 100 && puesto.ficha?.danoQuePasa === 0.4 && puesto.ficha?.bloqueoAbajo === 15,
  `${puesto.ficha?.bloqueoArriba}/${puesto.ficha?.danoQuePasa}/${puesto.ficha?.bloqueoAbajo}`);
control("y se despliega, que es lo que enciende el bloqueo (`IS_DEPLOYED`)",
  puesto.desplegado === true, `desplegado ${puesto.desplegado}`);
control("el modelo de vista del escudo se monta de verdad",
  puesto.montado === true, `animación '${puesto.animacion}'`);
// El parry con escudo: `int(1 × 1,3)` = 1. El escudo NO arregla el parry de un
// personaje nuevo, y ésa es la cifra que hace que el bloqueo sea todo.
control("el escudo multiplica el parry y 1 × 1,3 sigue siendo 1",
  puesto.parry === 1, `parry ${puesto.parry}`);

// Y que sea el escudo que pide y no el primero del archivo: `v_shields.mdl`
// trae cinco y el índice equivocado pone otro escudo en la mano sin dar error.
// Y DÓNDE CAE EN EL CUADRO, que es el control del 18: un modelo de vista puede
// montarse bien y salirse de la pantalla por noventa grados.
const cajas = await pag.evaluate(() => ({
  escudo: window.probe.vista.caja("escudo"), arma: window.probe.vista.caja("arma"),
}));
const dime = (c) => c ? `derecha ${c.derecha.map((v) => v.toFixed(0)).join("..")}, ` +
  `arriba ${c.arriba.map((v) => v.toFixed(0)).join("..")}, delante ${c.delante.map((v) => v.toFixed(0)).join("..")}` : "—";
console.log(`    escudo en ejes de la vista: ${dime(cajas.escudo)}`);
console.log(`    arma   en ejes de la vista: ${dime(cajas.arma)}`);
// No se comprueba a qué LADO cae —eso lo decide el propio `.mdl` y el de los
// escudos trae su brazo dibujado cruzando el cuerpo— sino que esté DELANTE del
// ojo y cerca. Un modelo de vista a la espalda o a tres metros es el fallo de los
// noventa grados del 18, y estas dos cifras lo dicen.
control("el escudo cae delante del ojo y al alcance de la mano",
  Boolean(cajas.escudo) && cajas.escudo.delante[1] > 0 && cajas.escudo.delante[1] < 100
    && Math.abs(cajas.escudo.derecha[0]) < 100,
  dime(cajas.escudo));
// Y EL ESPEJO. No hay un `v_` por mano: el motor marca `MSRDR_FLIPPED` cuando el
// objeto va en la izquierda y lo dibuja al revés. Sin eso el escudo sale en el
// lado del arma, y el arma y el escudo se pisan en el mismo rincón del cuadro.
control("el escudo está espejado y cae al otro lado que el arma",
  Boolean(cajas.escudo) && Boolean(cajas.arma)
    && cajas.escudo.derecha[0] < 0 && cajas.arma.derecha[1] > 0,
  `escudo ${cajas.escudo?.derecha.map((v) => v.toFixed(0)).join("..")} vs ` +
  `arma ${cajas.arma?.derecha.map((v) => v.toFixed(0)).join("..")}`);

// ── 2. LA MÁQUINA DE LA MANO ───────────────────────────────────────────────
const sube = await pag.evaluate(() => {
  const antes = window.probe.escudo.estado;
  const arriba = window.probe.escudo.cubrir(true, 20);
  const tras = window.probe.escudo.estado;
  return { antes: antes.postura, arriba, postura: tras.postura, animacion: tras.animacion };
});
console.log(`  postura: ${sube.antes} -> ${sube.postura} (t=${sube.arriba.t.toFixed(2)} s, '${sube.animacion}')`);
control("levantar el escudo cambia la postura a arriba", sube.postura === "arriba", sube.postura);
control("y pone la animación de empujar, no la de parado",
  sube.animacion === "thrust1", `'${sube.animacion}'`);

// EL FALLO 3: `tDuration = -1` pisa el `MELEE_ATK_DURATION 1.0` del script. Con
// la duración del script el escudo se caería al segundo de levantarlo.
const aguanta = await pag.evaluate(() => {
  window.probe.escudo.cubrir(true, 2000);   // ~33 s de botón aguantado
  return window.probe.escudo.estado;
});
control("el escudo no caduca: treinta segundos aguantando y sigue arriba",
  aguanta.arriba === true, `postura ${aguanta.postura}`);

const baja = await pag.evaluate(() => {
  const r = window.probe.escudo.cubrir(false, 5);
  return { ...r, estado: window.probe.escudo.estado };
});
control("soltar el botón lo baja y pone la animación de bajar",
  baja.arriba === false && baja.estado.animacion === "retract1",
  `${baja.postura} / '${baja.estado.animacion}'`);

// EL FALLO 6: cubrirse tiene que costar el ataque.
const cubierto = await pag.evaluate(() => {
  const libre = window.probe.escudo.puedeAtacar();
  window.probe.escudo.cubrir(true, 20);
  const tapado = window.probe.escudo.puedeAtacar();
  window.probe.escudo.cubrir(false, 5);
  return { libre, tapado };
});
control("con el escudo abajo se puede atacar", cubierto.libre === true, `${cubierto.libre}`);
control("y con el escudo ARRIBA no: «Players cannot attack while shield is active»",
  cubierto.tapado === false, `${cubierto.tapado}`);

// Y que eso se note en el arma de verdad, no sólo en la función que lo dice.
const mandobles = await pag.evaluate(() => {
  const conEscudo = (() => {
    window.probe.escudo.cubrir(true, 20);
    const antes = window.probe.golpe.estado.golpes;
    const r = window.probe.golpe.atacar(10);
    window.probe.escudo.cubrir(false, 5);
    return { golpes: r.golpes, delta: window.probe.golpe.estado.golpes - antes };
  })();
  const sinEscudo = window.probe.golpe.atacar(10);
  return { conEscudo, sinEscudo: { golpes: sinEscudo.golpes } };
});
console.log(`  mandobles en 10 s: ${mandobles.conEscudo.golpes} cubriéndose, ${mandobles.sinEscudo.golpes} sin cubrirse`);
control("cubriéndose no sale ni un mandoble, y sin cubrirse sí",
  mandobles.conEscudo.golpes === 0 && mandobles.sinEscudo.golpes > 0,
  `${mandobles.conEscudo.golpes} vs ${mandobles.sinEscudo.golpes}`);

// EL FALLO 8: el aguante. `MELEE_ENERGY 15` está en la ficha y el ataque declara
// `energydrain 0`, así que levantar el escudo no cuesta nada.
const aguanteAntes = await pag.evaluate(() => {
  const a = window.probe.golpe.estado.aguante;
  window.probe.escudo.cubrir(true, 20);
  const b = window.probe.golpe.estado.aguante;
  window.probe.escudo.cubrir(false, 5);
  return { a, b, ficha: window.probe.escudo.estado.ficha?.aguanteMuerto };
});
console.log(`  aguante al levantarlo: ${aguanteAntes.a} -> ${aguanteAntes.b} (la ficha declara ${aguanteAntes.ficha})`);
control("levantar el escudo es gratis aunque su ficha declare 15 de aguante",
  aguanteAntes.a === aguanteAntes.b, `${aguanteAntes.a} -> ${aguanteAntes.b}`);

// ── 3. EL BLOQUEO, medido ──────────────────────────────────────────────────
//
// EL FALLO 4: bloquear con el escudo arriba NO anula. Si sale 0, el escudo
// arriba es invulnerabilidad y el juego se rompe por el otro lado.
const arriba = await pag.evaluate(() => window.probe.escudo.recibir(20000, { postura: "arriba", dano: 10 }));
const abajo = await pag.evaluate(() => window.probe.escudo.recibir(20000, { postura: "abajo", dano: 10 }));
console.log(`\n  20 000 golpes de 10 con el escudo ARRIBA: te llevas ${arriba.medio.toFixed(3)} ` +
  `(${(arriba.razon * 100).toFixed(1)} %), bloqueados ${arriba.bloqueados}, anulados ${arriba.anulados}`);
console.log(`  20 000 golpes de 10 con el escudo ABAJO:  te llevas ${abajo.medio.toFixed(3)} ` +
  `(${(abajo.razon * 100).toFixed(1)} %), bloqueados ${abajo.bloqueados}, anulados ${abajo.anulados}`);
control("con el escudo arriba te llevas el 40 % — bloquear no es anular",
  Math.abs(arriba.razon - 0.4) < 0.02 && arriba.anulados === 0,
  `${(arriba.razon * 100).toFixed(1)} %, ${arriba.anulados} anulados`);
control("y con el escudo abajo el 85 %, porque anula entero el 15 % de las veces",
  Math.abs(abajo.razon - 0.85) < 0.02, `${(abajo.razon * 100).toFixed(1)} %`);
control("abajo lo que bloquea lo anula TODO: no hay medias tintas",
  abajo.anulados === abajo.bloqueados && abajo.bloqueados > 0,
  `${abajo.anulados} de ${abajo.bloqueados}`);
control("arriba bloquea el 100 % de las veces, que es lo que dice su ficha",
  arriba.bloqueados === 20000, `${arriba.bloqueados} de 20000`);

// El de madera, que es el único que FALLA el bloqueo de arriba (90 %).
const madera = await pag.evaluate(async () => {
  await window.probe.escudo.embrazar("shields_wooden");
  return window.probe.escudo.recibir(20000, { postura: "arriba", dano: 10 });
});
console.log(`  el de madera arriba (90 % y pasa el 60 %): te llevas ${(madera.razon * 100).toFixed(1)} %`);
control("el de madera arriba te deja el 64 %, porque a veces no bloquea",
  Math.abs(madera.razon - 0.64) < 0.02, `${(madera.razon * 100).toFixed(1)} %`);

// Y el urdualiano, el mejor del juego: pasa el 5 %.
const urdual = await pag.evaluate(async () => {
  await window.probe.escudo.embrazar("shields_urdual");
  return window.probe.escudo.recibir(20000, { postura: "arriba", dano: 10 });
});
control("el urdualiano arriba te deja el 5 %, que es el techo del sistema",
  Math.abs(urdual.razon - 0.05) < 0.01, `${(urdual.razon * 100).toFixed(1)} %`);
await pag.evaluate(() => window.probe.escudo.embrazar("shields_buckler"));

// ── 4. LOS TIPOS DE DAÑO ───────────────────────────────────────────────────
const tipos = await pag.evaluate(() => {
  const out = {};
  for (const t of ["", "slash", "fire", "cold", "poison", "magic", "target", "dark_effect"]) {
    out[t || "(vacío)"] = window.probe.escudo.recibir(2000, { postura: "arriba", dano: 10, tipo: t }).razon;
  }
  return out;
});
console.log(`\n  por tipo de daño (te llevas):`);
for (const [t, r] of Object.entries(tipos)) console.log(`    ${t.padEnd(12)} ${(r * 100).toFixed(0)} %`);
control("el escudo bloquea fuego, frío y veneno: sus líneas están comentadas",
  ["fire", "cold", "poison"].every((t) => Math.abs(tipos[t] - 0.4) < 0.02),
  Object.entries(tipos).filter(([t]) => ["fire", "cold", "poison"].includes(t)).map(([t, r]) => `${t} ${(r * 100).toFixed(0)}%`).join(" "));
control("un tipo VACÍO se bloquea — al revés que en el parry del script",
  Math.abs(tipos["(vacío)"] - 0.4) < 0.02, `${(tipos["(vacío)"] * 100).toFixed(0)} %`);
control("y los dos que no se bloquean son `target` y lo que contenga `effect`",
  tipos.target === 1 && tipos.dark_effect === 1,
  `target ${tipos.target}, dark_effect ${tipos.dark_effect}`);

// ── 5. EL CONO, que es el fallo gordo ──────────────────────────────────────
const cono = await pag.evaluate(() => window.probe.escudo.cono(1));
console.log(`\n  cono medido: ±${cono.semianguloMedido}° (el script pide ${cono.declarado}°, o sea ±${cono.declarado / 2}°)`);
control("el cono de 175 grados declarado mide ±26 de verdad",
  cono.semianguloMedido === 26, `±${cono.semianguloMedido}°`);
const espalda = await pag.evaluate(() =>
  window.probe.escudo.recibir(2000, { postura: "arriba", dano: 10, deFrente: false }));
control("lo que viene de fuera del cono entra entero, aunque el escudo esté arriba",
  espalda.razon === 1, `${(espalda.razon * 100).toFixed(0)} %`);

// ── 6. EL ORDEN: el escudo antes que el parry ─────────────────────────────
//
// EL FALLO 9. Es la única interacción real entre los dos sistemas y es fácil de
// escribir al revés, porque «el parry es lo primero que te defiende» suena bien.
const orden = await pag.evaluate(() => window.probe.escudo.estado);
control("el parry del jugador está enchufado en el camino del golpe recibido",
  typeof orden.parry === "number", `parry ${orden.parry}`);

// ── 7. EL CAMINO DE VERDAD: que un goblin pegue y el escudo lo pare ───────
//
// Todo lo de arriba mide la REGLA. Esto mide el JUEGO: un goblin de verdad, con
// su propio daño y su propio tipo (vacío), pegándole a un jugador con el escudo
// levantado. Es el control que el 19 aprendió a hacer por las malas.
const real = await pag.evaluate(() => {
  const censo = window.probe.reaccion.censo();
  const g = censo.find((c) => c.script === "monsters/goblin" && !c.muerto);
  if (!g) return { razon: "no hay goblin" };
  const q = window.probe.reaccion.quien(g.n);
  // Se busca la distancia, igual que en el 19: el goblin tiene su propio
  // `ATTACK_HITRANGE` y ponerse «cerca» a ojo no basta. Y hay que MIRARLE, que
  // aquí no es cortesía: el cono del escudo son ±26 grados.
  let d = null, tanda = null;
  for (const dd of [0.7, 0.9, 0.5, 1.1, 1.3]) {
    window.probe.mundo.poner(q.donde[0] + dd, q.donde[1], q.donde[2]);
    window.probe.mundo.mirar(q.donde[0], q.donde[1] + 0.5, q.donde[2]);
    d = dd;
    tanda = window.probe.escudo.aguantarGolpes(6);
    if (tanda.recibidos > 0) break;
  }
  const t = window.probe.escudo.aguantarGolpes(20);
  return { distancia: d, busqueda: tanda, ...t };
});
console.log(`\n  el goblin de verdad a ${real.distancia} m, 20 s con el escudo arriba:`);
console.log(`    ${real.recibidos} golpes, ${real.bloqueos} bloqueados, ${real.desvios} desviados, ` +
  `${real.fueraDelCono} fuera del cono, ${real.parados} parados`);
control("un goblin de verdad pega y el escudo levantado se lo bloquea",
  real.bloqueos > 0, `${real.bloqueos} de ${real.recibidos}`);
// Y aquí sale la consecuencia de verdad del cono en radianes, que ninguna
// medición de la regla podía dar: lo único que se le escapa al escudo es lo que
// entra por fuera del cono, y **eso es casi la mitad de los golpes**. El goblin
// no se queda quieto delante: se mueve mientras pega, y con ±26 grados basta con
// que se aparte un paso. Escrito con el cono que el script cree tener, esto
// habría salido 36 de 36 y nadie se habría enterado.
control("lo único que se le escapa es lo que entra por fuera del cono",
  real.bloqueos + real.desvios + real.fueraDelCono === real.recibidos,
  `${real.bloqueos} bloqueados + ${real.fueraDelCono} fuera = ${real.recibidos}`);
control("y por fuera del cono se le cuela una parte grande: el cono son ±26°",
  real.fueraDelCono > 0,
  `${real.fueraDelCono} de ${real.recibidos} (${(100 * real.fueraDelCono / real.recibidos).toFixed(0)} %)`);
control("el escudo sigue arriba después de comerse los golpes: no se rompe",
  real.arriba === true, `arriba ${real.arriba}`);

await pag.screenshot({ path: "build/gatecity/vistas/escudo.png" });

// ── 8. NADA DE ESTO ROMPE EL MUNDO ─────────────────────────────────────────
const final = await pag.evaluate(() => {
  window.probe.reaccion.avanzar(2);
  return { escudo: window.probe.escudo.estado, golpe: window.probe.golpe.estado };
});
console.log(`\n  contadores: ${final.escudo.bloqueos} bloqueos, ${final.escudo.desvios} desvíos, ` +
  `${final.escudo.parados} parados, ${final.escudo.golpesRecibidos} golpes recibidos`);
control("el arma sigue en la mano después de todo esto",
  final.golpe.triangulos > 0, `${final.golpe.triangulos} triángulos`);

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(64)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
