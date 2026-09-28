// qbsp sigue siendo el juez del sellado.
//
// El truco del experimento 02 se lleva puesto tal cual: se compila con
// -leaktest y se tira el .bsp. No interesa el resultado, interesa el
// veredicto. Que el runtime sea Three.js no cambia nada aqui, y eso es
// exactamente lo que este archivo demuestra.
//
//   node tools/verdict.mjs               plaza, mas las dos sondas de control
//   node tools/verdict.mjs ruta/al.map   un mapa concreto

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLevel } from "../src/map/level.js";
import { leakyRoom, stepRoom, PLAZA } from "../test/fixtures.mjs";

const QBSP = "C:\\Desarrollo\\ericw-tools\\qbsp.exe";

/** Compila un .map y devuelve el veredicto, sin quedarse con el .bsp. */
export function judge(name, text) {
  const dir = mkdtempSync(join(tmpdir(), "mydra-verdict-"));
  const path = join(dir, `${name}.map`);
  writeFileSync(path, text, "ascii");
  const proc = spawnSync(QBSP, ["-leaktest", path], {
    encoding: "utf8",
    cwd: dir,
  });
  const log = (proc.stdout ?? "") + (proc.stderr ?? "");
  let planes = 0;
  let faces = 0;
  for (const line of log.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === "planes") planes = Number(parts[0]);
    else if (parts.length >= 2 && parts[1] === "faces") faces = Number(parts[0]);
  }
  const pointfile = existsSync(join(dir, `${name}.pts`));
  rmSync(dir, { recursive: true, force: true });
  return { code: proc.status, planes, faces, pointfile, log };
}

function line(label, v, extra = "") {
  const code = v.code === 0 ? "sella" : `FUGA (${v.code})`;
  console.log(
    `  ${label.padEnd(22)} ${code.padEnd(12)} planos ${String(v.planes).padStart(5)}` +
      `  caras ${String(v.faces).padStart(5)}  ${extra}`
  );
}

// En Windows las rutas llevan espacios y letra de unidad, asi que comparar
// import.meta.url con argv[1] a pelo no funciona: hay que normalizar las dos.
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  if (!existsSync(QBSP)) {
    console.error(`no se encuentra ${QBSP}`);
    process.exit(2);
  }

  const target = process.argv[2] ?? PLAZA;
  const name = basename(target, ".map");
  const text = await readFile(target, "utf8");
  const level = loadLevel(text, { name });

  console.log(`\nJuez: qbsp -leaktest   Runtime: cargador de JS\n`);

  const real = judge(name, text);
  line(name, real, `triangulos JS ${level.mesh.triangleCount}`);

  // Las dos sondas de control. Sin ellas, un qbsp que dijera que si a todo
  // pasaria por juez y no se notaria: 'exit 0 no significa correcto'.
  const sealed = judge("control_sellada", stepRoom(16));
  line("control sellada", sealed);
  const leaky = judge("control_fuga", leakyRoom());
  line("control con fuga", leaky, leaky.pointfile ? "con pointfile" : "SIN pointfile");

  const problems = [];
  if (real.code !== 0) problems.push(`${name} no sella`);
  if (real.planes === 0 || real.faces === 0) {
    problems.push(`${name} compila vacio: bobinado de caras invertido`);
  }
  if (level.mesh.triangleCount === 0) {
    problems.push("el cargador de JS no saco ni un triangulo");
  }
  if (sealed.code !== 0 || sealed.planes === 0) {
    problems.push("la sala de control sellada no compila con geometria");
  }
  if (leaky.code === 0) problems.push("la fuga de control no da error: el juez no juzga");
  if (!leaky.pointfile) problems.push("la fuga no dejo pointfile con las coordenadas");

  console.log();
  if (problems.length) {
    for (const p of problems) console.log("FALLO:", p);
    process.exit(1);
  }
  console.log(
    `El veredicto sobrevive: ${name} sella con ${real.faces} caras, ` +
      `el cargador de JS saca ${level.mesh.triangleCount} triangulos, ` +
      `y una fuga sigue dando error con coordenadas.\n`
  );
}
