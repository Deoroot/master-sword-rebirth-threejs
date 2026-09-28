// Que tiene puesto el visor de verdad: materiales, texturas y atributos.
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { esNuestro } from "./mismo.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 5201;
const server = await new Promise((res, rej) => {
  const p = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const t = setTimeout(() => rej(new Error("vite")), 30000);
  p.stdout.on("data", (d) => { if (d.toString().includes("ready in")) { clearTimeout(t); res(p); } });
});
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on("pageerror", (e) => console.log("ERROR:", String(e?.message ?? e)));
await page.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(page, PORT);
await page.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
const out = await page.evaluate(() => {
  const p = window.probe;
  const esc = p.camera.parent; // la escena cuelga de aqui? mejor buscarla
  let mundo = null, velo = null;
  const raiz = p.camera;
  let s = raiz; while (s.parent) s = s.parent;
  s.traverse((o) => { if (o.name === "gatecity") mundo = o; if (o.name === "gatecity-translucido") velo = o; });
  const info = (m) => ({
    tipo: m.type, nombre: m.name,
    map: m.map ? { w: m.map.image?.width, h: m.map.image?.height, min: m.map.minFilter, mag: m.map.magFilter, mips: m.map.mipmaps?.length ?? 0, cs: m.map.colorSpace, ch: m.map.channel } : null,
    lightMap: m.lightMap ? { w: m.lightMap.image?.width, h: m.lightMap.image?.height, min: m.lightMap.minFilter, mag: m.lightMap.magFilter, mips: m.lightMap.mipmaps?.length ?? 0, cs: m.lightMap.colorSpace, ch: m.lightMap.channel, flipY: m.lightMap.flipY, aniso: m.lightMap.anisotropy } : null,
    lmi: m.lightMapIntensity, color: m.color?.getHexString(), side: m.side, transparent: m.transparent, opacity: m.opacity,
  });
  const g = mundo.geometry;
  const atr = Object.keys(g.attributes);
  const uv1 = g.attributes.uv1;
  return {
    atributos: atr,
    uv1: uv1 ? { count: uv1.count, itemSize: uv1.itemSize, primeros: Array.from(uv1.array.slice(0, 8)) } : null,
    uv: g.attributes.uv ? { count: g.attributes.uv.count, primeros: Array.from(g.attributes.uv.array.slice(0, 4)) } : null,
    grupos: g.groups.length,
    nMateriales: mundo.material.length,
    materialesConLightmap: mundo.material.filter((m) => m.lightMap).length,
    ejemploWood: (() => {
      const i = mundo.material.findIndex((m, k) => p.level.mesh ? false : false);
      return null;
    })(),
    muestra: mundo.material.slice(0, 3).map(info),
    // El material del grupo de `wood_047`, buscado por el orden que declara el visor.
    wood: (() => {
      const idx = p.level.manifiesto.grupos.findIndex((x) => x.texture === "wood_047" && !x.render);
      return idx >= 0 ? { idx } : null;
    })(),
    renderer: { outputColorSpace: p.renderer.outputColorSpace, toneMapping: p.renderer.toneMapping, capMaxAniso: p.renderer.capabilities.getMaxAnisotropy() },
    luces: (() => { const l = []; s.traverse((o) => { if (o.isLight) l.push({ t: o.type, i: o.intensity, v: o.visible }); }); return l; })(),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
server.kill();
