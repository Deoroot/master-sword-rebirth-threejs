import { leerBsp, leerEntidades } from "../src/bsp/lector.js";
import { leerMdl, pielesDe, texturasDe } from "../src/bsp/mdl.js";
const bsp = leerBsp("../MSC/assets/msr/maps/gatecity.bsp");
const ents = leerEntidades(bsp).filter(e => e.classname === "env_model");
const claves = new Set(); for (const e of ents) for (const k of Object.keys(e)) claves.add(k);
console.log("claves de env_model:", [...claves].join(", "));
const conSkin = ents.filter(e => e.skin !== undefined && e.skin !== "0");
console.log("con skin distinto de 0:", conSkin.length, conSkin.slice(0,5).map(e=>e.model+" skin "+e.skin).join(" | "));
const conBody = ents.filter(e => e.body !== undefined && e.body !== "0");
console.log("con body distinto de 0:", conBody.length);
// cuantas familias tiene cada modelo usado
const modelos = [...new Set(ents.map(e=>e.model))];
for (const m of modelos) {
  try {
    const M = leerMdl("../MSC/assets/msr/" + m);
    if (M.nFamiliasPiel > 1) console.log("  ", m, "->", M.nFamiliasPiel, "familias de piel,", M.nTexturas, "texturas");
  } catch {}
}
