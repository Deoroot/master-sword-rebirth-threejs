// ¿QUÉ SECUENCIA SE VE AL SOLTAR UN ATAQUE CARGADO?
//
//   npm run sonda:animvista
//
// El usuario, que conoce el juego: «los ataques cargados de Blood Drinker (el
// que se hace al cargar la primera y la segunda barra) no usan la animación
// correcta», y antes, «el quarterstaff tiene varias animaciones que no son
// suyas». Era lo mismo: el puerto sorteaba entre `ANIM_ATTACK1..5` del arma
// para TODOS sus ataques, y en Master Sword la secuencia de un ataque la pone el
// `playviewanim` de su evento `<retorno>_start` (giattack.cpp:345,
// genericitem.cpp:2015-2033). Ver tools/animvista.mjs y `Brazo.vistaDe`.
//
// Aquí se aprieta por `pasoDelBrazo` —lo que llama el bucle— como un jugador:
// clic, segundo clic durante el mandoble aguantando, soltar. Y lo que se mide
// se LEE DEL MODELO que hay en la mano (`armaEnMano.actual`), no de lo que el
// brazo dice haber elegido.
//
// Los números esperados van escritos A MANO con su cita (CLAUDE.md §4, el 75):
//
//   Blood Drinker   normal 2 `attack1`   primera barra 3   segunda barra: SIN MODELO
//                   swords_blood_drinker.script:16, :20 (`ANIM_LUNGE 3`), :187, :146-150
//   Quarterstaff    normal 4 `attack1`   primera barra 5 `attack2`   reposo 0 `idle`
//                   polearms_base.script:32, :36-37, :480, :486, :531
//   Mace            normal 2             segunda barra: NADA al soltar y la 2 a los 0,9 s
//                   blunt_base_onehanded.script:8-12, :83-91; base_melee.script:137
//
// Tres armas y no una (CLAUDE.md §4, el 50): con una sola, «la 3» podría ser el
// valor de reposo de algo. Y el control que distingue el arreglo del sorteo de
// antes es la MAZA: tiene tres `ANIM_ATTACK` (2, 3, 4) y su guion pone siempre
// la 2, así que en veinte mandobles el sorteo de antes enseña la 3 o la 4 con
// probabilidad 1 − (1/3)^20.
//
// Se entra por el menú (§3), con un personaje nuevo al que se le suben las
// habilidades (el golpe cargado de la Blood Drinker pide espadas 32 y el
// lanzamiento 34) y el maná (el lanzamiento cuesta 40).

import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5731;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT, { tope: 180_000 });
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

// El marcador NO puede bajar (el 65): se declara cuántos hay.
const DECLARADOS = 15;
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); return bien; };
const errores = [];

const nav = await chromium.launch();
try {
  const pag = await nav.newPage({ viewport: { width: 1000, height: 700 } });
  pag.on("pageerror", (e) => errores.push(String(e.stack ?? e).slice(0, 400)));
  pag.on("console", (m) => { if (/el arma no se ha podido montar/.test(m.text())) errores.push(m.text().slice(0, 400)); });
  await entrarPorElMenu(pag, PORT);
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
  // El personaje EXISTE: se pregunta por un campo que no está cuando no lo hay
  // (CLAUDE.md §4, el 81: un objeto vacío también es `true`).
  const nombre = await pag.evaluate(() => window.probe.sesion.personaje?.nombre ?? null);
  control("hay personaje (por su nombre, no por un objeto vacío)", nombre === "Sonda", String(nombre));
  await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 }).catch(() => {});
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
  await pag.evaluate(() => {
    const h = window.probe.sesion.personaje.habilidades;
    for (const n of ["swordsmanship", "polearms", "bluntarms"]) {
      h[n] ??= {};
      for (const k of ["proficiency", "balance", "power"]) { h[n][k] ??= {}; h[n][k].valor = 60; }
    }
    window.probe.sesion.personaje.mana = 100000;
  });

  /** Empuña y espera a que el MODELO de esa arma esté en la mano. */
  const empunar = async (id) => {
    await pag.evaluate((id) => window.probe.golpe.empunar(id), id);
    await pag.waitForFunction((id) => {
      const e = window.probe.golpe.estado;
      return e.arma === id && e.triangulos > 0;
    }, id, { timeout: 60000 });
    return pag.evaluate(() => window.probe.golpe.estado);
  };
  const ataque = (opciones) => pag.evaluate((o) => window.probe.golpe.vistaDelAtaque(o), opciones);
  const dice = (r) => (r?.empezo
    ? `${r.ataque.retorno} (carga ${r.ataque.carga}): al empezar ${r.alEmpezar.indice} «${r.alEmpezar.nombre}»` +
      `${r.cambios.length ? `, luego ${r.cambios.map((c) => `${c.indice}@${c.t}`).join(", ")}` : ""}${r.escondido ? ", SIN MODELO" : ""}`
    : `no empezó (${JSON.stringify(r)})`);

  // ── LA BLOOD DRINKER ───────────────────────────────────────────────────
  await empunar("swords_blood_drinker");
  const bdN = await ataque({ cargar: 0 });
  const bd1 = await ataque({ cargar: 1.2 });
  const bd2 = await ataque({ cargar: 2.6 });
  console.log(`\n  Blood Drinker\n    normal        ${dice(bdN)}\n    primera barra ${dice(bd1)}\n    segunda barra ${dice(bd2)}`);
  control("Blood Drinker, golpe normal: la 2 (ANIM_ATTACK1, swords_blood_drinker.script:16)",
    bdN?.empezo && bdN.ataque.retorno === "melee" && bdN.alEmpezar.indice === 2, dice(bdN));
  control("Blood Drinker, PRIMERA BARRA: la 3 (ANIM_LUNGE, :20 y :187), y no la del golpe normal",
    bd1?.empezo && bd1.ataque.retorno === "special_01" && bd1.alEmpezar.indice === 3, dice(bd1));
  control("Blood Drinker, SEGUNDA BARRA: el ataque es el lanzamiento y el modelo de vista se QUITA (`setviewmodel none`, :147)",
    bd2?.empezo && bd2.ataque.retorno === "throwsword" && bd2.escondido === true, dice(bd2));
  control("y al acabar el arma vuelve a verse, en reposo (la 1, ANIM_IDLE1, :14)",
    bd2?.acabo === true && bd2.alAcabar.visible === true && bd2.alAcabar.indice === 1, JSON.stringify(bd2?.alAcabar));

  // ── EL BASTÓN ──────────────────────────────────────────────────────────
  const qs = await empunar("polearms_qs");
  const reposoQs = await pag.evaluate(() => window.probe.golpe.vistaDelAtaque({ cargar: 0 })?.reposo);
  await ataque({ cargar: 0, despues: 3 });
  const qsN = await ataque({ cargar: 0 });
  const qs1 = await ataque({ cargar: 1.2 });
  console.log(`\n  Quarterstaff (${qs.modelo})\n    reposo        ${JSON.stringify(reposoQs)}\n    normal        ${dice(qsN)}\n    primera barra ${dice(qs1)}`);
  control("Quarterstaff, en reposo: la 0 «idle» (VANIM_IDLE1, polearms_base.script:32), no la 1",
    reposoQs?.indice === 0, JSON.stringify(reposoQs));
  control("Quarterstaff, golpe normal: la 4 (VANIM_POKE1, :36 y :480) — antes no ponía NINGUNA",
    qsN?.empezo && qsN.ataque.retorno === "attack_poke1" && qsN.alEmpezar.indice === 4, dice(qsN));
  control("Quarterstaff, PRIMERA BARRA: la 5 (VANIM_POKE2, :37 y :486)",
    qs1?.empezo && qs1.ataque.retorno === "attack_poke2" && qs1.alEmpezar.indice === 5, dice(qs1));
  control("las dos armas dan números DISTINTOS para la primera barra (3 y 5): no es un valor de reposo",
    bd1?.alEmpezar?.indice === 3 && qs1?.alEmpezar?.indice === 5, `${bd1?.alEmpezar?.indice} y ${qs1?.alEmpezar?.indice}`);

  // ── LA MAZA: la que separa el arreglo del sorteo de antes ──────────────
  await empunar("blunt_mace");
  const vistos = await pag.evaluate(() => {
    const n = {};
    for (let k = 0; k < 20; k++) {
      const r = window.probe.golpe.vistaDelAtaque({ cargar: 0, despues: 3 });
      const i = r?.empezo ? String(r.alEmpezar.indice) : "nada";
      n[i] = (n[i] ?? 0) + 1;
    }
    return n;
  });
  const mz2 = await ataque({ cargar: 2.6, despues: 4 });
  console.log(`\n  Mace\n    20 mandobles  ${JSON.stringify(vistos)}\n    segunda barra ${dice(mz2)}`);
  control("Mace: 20 mandobles, los 20 con la 2 (`playviewanim MELEE_VIEWANIM_ATK`, base_melee.script:137) — el sorteo de antes enseñaría la 3 o la 4",
    vistos["2"] === 20, JSON.stringify(vistos));
  control("Mace, SEGUNDA BARRA: el ataque es `special_02` (el mazazo que aturde)",
    mz2?.empezo && mz2.ataque.retorno === "special_02" && mz2.ataque.carga === 2.5, dice(mz2));
  // Al soltar NO se pone ninguna: se queda la de reposo, y a los 0,9 s el guion
  // levanta el arma (`callevent 0.9 bash`, blunt_base_onehanded.script:83-91).
  control("Mace, segunda barra: al SOLTAR no cambia la secuencia (sigue la de reposo, la 1)",
    mz2?.empezo && mz2.alEmpezar.indice === 1 && mz2.alEmpezar.indice === mz2.reposo.indice, dice(mz2));
  const tarde = mz2?.cambios?.find((c) => c.indice === 2);
  control("Mace, segunda barra: la 2 llega a los 0,9 s (blunt_base_onehanded.script:85), ni antes ni al final",
    Boolean(tarde) && tarde.t >= 0.85 && tarde.t <= 1.0, tarde ? `${tarde.t} s` : "no llegó");

  // ── EL HORNEADO, contado ───────────────────────────────────────────────
  const cat = (() => {
    const v = JSON.parse(readFileSync("build/msr/armas.json", "utf8")).resumen?.vistas ?? null;
    return v ? { ataques: v.ataques, conSecuencia: v.conSecuencia, sinResolver: v.sinResolver.length } : null;
  })();
  control("el catálogo trae la vista de sus ataques contada, y ninguna sin resolver",
    cat && cat.ataques > 400 && cat.conSecuencia > 300 && cat.sinResolver === 0, JSON.stringify(cat));

  control("sin errores de página ni «el arma no se ha podido montar»", errores.length === 0, errores.join(" | ").slice(0, 300) || "ninguno");
} catch (e) {
  control("la sonda llega al final sin caerse", false, String(e?.message ?? e).split("\n")[0].slice(0, 200));
} finally {
  await nav.close().catch(() => {});
  matar(dev);
}

const bien = controles.filter((c) => c.bien).length;
console.log(`\n  ── ${bien} de ${DECLARADOS} controles ──`);
if (controles.length !== DECLARADOS) console.log(`  corrieron ${controles.length} de ${DECLARADOS} declarados`);
for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
process.exit(bien === DECLARADOS && controles.length === DECLARADOS ? 0 : 1);
