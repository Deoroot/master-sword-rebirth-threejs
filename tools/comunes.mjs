// Una única preparación para todos los mapas. No necesita ningún BSP horneado.
import { spawnSync } from "node:child_process";
import { NO_SON_DE_UN_MAPA } from "./mapa.mjs";
for (const herramienta of ["objetos.mjs", ...NO_SON_DE_UN_MAPA]) {
  const r = spawnSync(process.execPath, [`tools/${herramienta}`], { stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}
