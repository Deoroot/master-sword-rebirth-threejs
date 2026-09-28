// ¿Dónde debería empezar un personaje nuevo?
//
// En Gate City el mapa lo decide: `ms_player_begin` deja al jugador en una
// cueva a oscuras, y lo que hay entre él y el pueblo son goblins. Eso en el
// juego original tenía sentido porque LLEGABAS de otro mapa con un personaje
// hecho; para un personaje recién creado es otra cosa.
//
// Esto no opina: mide cada candidato por tres cosas que sí se pueden contar.
import { readFileSync } from "node:fs";
import { leerBsp, leerModelos, leerTexinfo, leerCaras, UNIDADES_POR_METRO as U } from "../src/bsp/lector.js";
import { luzEnSuelo, caraBajo } from "../src/bsp/luz.js";
import { leerEntidades, origen } from "../src/bsp/lector.js";

const man = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
const bichos = JSON.parse(readFileSync("build/gatecity/bichos.json", "utf8"));
const bsp = leerBsp("../MSC/assets/msr/maps/gatecity.bsp");
const modelos = leerModelos(bsp);
const texinfos = leerTexinfo(bsp);
const carasMundo = leerCaras(bsp, modelos[0], texinfos);
const entidades = leerEntidades(bsp);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / U;
const luzDe = (u) => {
  const l = luzEnSuelo(carasMundo, bsp.lumps.luz.datos, u);
  return l ? Math.max(l[0], l[1], l[2]) : 0;
};

// Los candidatos: la entrada oficial, las once reapariciones y los ocho pueblos.
const candidatos = [{ nombre: "ms_player_begin (el del mapa)", unidades: man.entrada.unidades }];
let i = 0;
for (const e of entidades) {
  if (e.classname !== "ms_player_spawn") continue;
  candidatos.push({ nombre: `ms_player_spawn #${++i}`, unidades: origen(e) });
}
man.pueblos.forEach((p, k) => candidatos.push({ nombre: `pueblo ${k} (centro)`, unidades: p.pies }));

const pueblos = man.pueblos.map((p) => p.pies);
console.log("\n  candidato                        al pueblo   luz   bichos a 15 m   el más cercano");
const filas = [];
for (const c of candidatos) {
  const alPueblo = Math.min(...pueblos.map((p) => dist(c.unidades, p)));
  const luz = luzDe(c.unidades);
  const cerca = bichos.colocados
    .map((b) => ({ ...b, d: dist(c.unidades, b.pies) }))
    .sort((a, b) => a.d - b.d);
  const en15 = cerca.filter((b) => b.d <= 15).length;
  filas.push({ ...c, alPueblo, luz, en15, mas: cerca[0] });
  console.log(
    `  ${c.nombre.padEnd(32)}${alPueblo.toFixed(0).padStart(6)} m ${String(Math.round(luz)).padStart(6)}` +
    `${String(en15).padStart(10)}      ${cerca[0] ? `${cerca[0].nombre ?? cerca[0].clase} a ${cerca[0].d.toFixed(0)} m` : "—"}`
  );
}

const ini = filas[0];
console.log(`\n  EL DEL MAPA: ${ini.alPueblo.toFixed(0)} m hasta el pueblo, luz ${Math.round(ini.luz)}/255, ` +
  `${ini.en15} bichos a 15 m, el primero a ${ini.mas.d.toFixed(0)} m.`);
const buenos = filas.filter((f) => f.en15 === 0 && f.luz >= ini.luz && f.alPueblo < ini.alPueblo);
console.log(`  candidatos mejores en las TRES cosas a la vez: ${buenos.length}`);
for (const b of buenos.slice(0, 6)) console.log(`      ${b.nombre.padEnd(30)} ${b.alPueblo.toFixed(0)} m, luz ${Math.round(b.luz)}, 0 bichos cerca`);
