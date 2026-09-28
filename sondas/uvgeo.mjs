import fs from "node:fs";
for (const d of fs.readdirSync("build/gatecity/bichos")) {
  const dir = `build/gatecity/bichos/${d}`;
  if (!fs.existsSync(`${dir}/bicho.json`)) continue;
  const j = JSON.parse(fs.readFileSync(`${dir}/bicho.json`));
  const g = j.grupos.find((g) => /face|head|cara/i.test(g.archivo));
  if (!g) continue;
  const buf = fs.readFileSync(`${dir}/${j.bin.archivo}`);
  const T = j.bin.tramos;
  const pos = new Float32Array(buf.buffer, buf.byteOffset + T.positions.off, T.positions.n);
  const nor = new Float32Array(buf.buffer, buf.byteOffset + T.normals.off, T.normals.n);
  const uv = new Float32Array(buf.buffer, buf.byteOffset + T.uvs.off, T.uvs.n);
  const pts = [];
  for (let i = g.start; i < g.start + g.count; i++)
    if (nor[i * 3] > 0.5) pts.push({ z: pos[i * 3 + 2], v: uv[i * 2 + 1] });
  if (pts.length < 10) { console.log(d.padEnd(22), "pocos"); continue; }
  const N = pts.length, mz = pts.reduce((s, p) => s + p.z, 0) / N, mv = pts.reduce((s, p) => s + p.v, 0) / N;
  let nu = 0, dz = 0, dv = 0;
  for (const p of pts) { nu += (p.z - mz) * (p.v - mv); dz += (p.z - mz) ** 2; dv += (p.v - mv) ** 2; }
  const vFrente = pts.slice().sort((a,b)=>b.z-a.z).slice(0,8).reduce((s,p)=>s+p.v,0)/8;
  const vMenton = pts.slice().sort((a,b)=>a.z-b.z).slice(0,8).reduce((s,p)=>s+p.v,0)/8;
  console.log(d.padEnd(22), g.archivo.replace("tex/","").padEnd(16),
    "corr", (nu / Math.sqrt(dz * dv)).toFixed(3).padStart(7),
    " v(frente)", vFrente.toFixed(2), " v(menton)", vMenton.toFixed(2));
}
