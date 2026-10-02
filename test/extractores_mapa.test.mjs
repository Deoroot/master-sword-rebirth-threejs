// Los extractores deben separar los mapas también al ejecutarlos como procesos.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { mapaDeArgv, posicionalesDe, salidaDe } from "../tools/mapa.mjs";

test("--mapa incompleto o inválido falla antes de elegir una salida", () => {
  for (const args of [["--mapa"], ["--mapa", "--otro"], ["--mapa", "../edana"]]) {
    assert.throws(() => mapaDeArgv(args));
  }
  assert.throws(() => salidaDe("../edana"));
  assert.deepEqual(posicionalesDe(["--mapa", "edana", "mis-scripts"]), ["mis-scripts"]);
  assert.deepEqual(posicionalesDe(["mis-scripts", "--mapa", "edana"]), ["mis-scripts"]);
});

test("menús: dos mapas producen claves y archivos propios sin pisar Gate City", () => {
  const raiz = mkdtempSync(join(tmpdir(), "msr-extractores-"));
  const herramienta = resolve("tools/menus.mjs");
  try {
    mkdirSync(join(raiz, "build/gatecity"), { recursive: true });
    writeFileSync(join(raiz, "build/gatecity/menus.json"), "testigo");
    for (const mapa of ["edana", "otro_mapa"]) {
      const scripts = join(raiz, "scripts");
      mkdirSync(join(scripts, mapa), { recursive: true });
      writeFileSync(join(scripts, mapa, "npc.script"), `
{ game_menu_getoptions
 local reg.mitem.title ${mapa}
 local reg.mitem.type callback
 local reg.mitem.callback saludo
 menuitem.register
}
`);
      const r = spawnSync(process.execPath, [herramienta, scripts, "--mapa", mapa], {
        cwd: raiz, encoding: "utf8", timeout: 15000,
      });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      const ficha = JSON.parse(readFileSync(join(raiz, "build", mapa, "menus.json"), "utf8"));
      assert.deepEqual(Object.keys(ficha.opciones), [`${mapa}/npc`]);
      assert.equal(ficha.opciones[`${mapa}/npc`][0].titulo, mapa);
    }
    assert.ok(existsSync(join(raiz, "build/edana/menus.json")));
    assert.equal(readFileSync(join(raiz, "build/gatecity/menus.json"), "utf8"), "testigo");
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
