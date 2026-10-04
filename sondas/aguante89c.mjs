// EL 89c: AL ENTRAR, EL GUION DEL JUGADOR TE LLENA EL AGUANTE.
//
//   node sondas/aguante89c.mjs
//
// De los comandos del 89c, `drainstamina` es el ÚNICO que corre jugando:
//
//     game_player_putinworld → callevent 1.0 activate_stuff     player_main.script:1043
//     activate_stuff         → drainstamina ent_me -1000         player_main.script:147
//
// Los demás —el oro de las bolsas, los saltos, `setstat parry`— cuelgan de
// eventos que este puerto no dispara (`SIN_QUIEN_LOS_LLAME`), y ésos no tienen
// sonda porque no hay nada que ver: se declaran, no se miden.
//
// LA TRAMPA DEL VALOR DE REPOSO, que es la del apartado 4: al aparecer el
// aguante YA está lleno (`Stamina = MaxStamina()` en el `Spawn`), y lo que
// llena `activate_stuff` es lo mismo. Un control que leyera «está lleno» un
// segundo después saldría verde con el comando roto. Así que la sonda lo
// VACÍA en cuanto el guion está montado y antes de que pase el segundo, y
// mira que se llene DE GOLPE justo cuando `activate_stuff` dispara su
// `player_joined`. Y al lado, el otro mecanismo que mueve el mismo número —la
// regeneración del aguante—, medido en la misma ventana: si él solo también
// lo llenara, «se llenó» no diría quién (el 66).

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5393;

const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1000, height: 700 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };

try {
  await entrarPorElMenu(pag, PORT);

  // TODO EN LA PÁGINA, de una vez: crear el personaje, esperar a que el guion
  // del jugador esté montado, vaciar el aguante y muestrear cada fotograma.
  // Hacerlo desde Node pondría la latencia de cada `evaluate` entre el montaje
  // y el segundo del `callevent`, y podría llegar tarde sin saberlo.
  const r = await pag.evaluate(async () => {
    const S = window.probe;
    const fotograma = () => new Promise((ok) => requestAnimationFrame(() => ok()));
    const unido = () => S.jugador.disparados().includes("player_joined");
    const nuevo = S.sesion.nuevo("Sonda", "swords_rsword");
    let espera = 0;
    while (!S.jugador.hay() && espera < 60000) { await new Promise((ok) => setTimeout(ok, 5)); espera += 5; }
    const montado = performance.now();
    const tarde = unido();
    S.fisica.ponerAguante(0);
    const max = S.fisica.vitales().aguanteMax;
    const muestras = [];
    let tras = 0;
    while (performance.now() - montado < 8000) {
      await fotograma();
      const u = unido();
      muestras.push({ ms: performance.now() - montado, a: S.fisica.aguante(), u });
      if (u && ++tras > 3) break;
    }
    // EL OTRO MECANISMO, en la misma ventana: vaciar otra vez y esperar lo
    // mismo que tardó `activate_stuff`. Sólo regenera el aguante.
    const primera = muestras.find((m) => m.u);
    const ventana = primera ? primera.ms : 1000;
    S.fisica.ponerAguante(0);
    const t0 = performance.now();
    while (performance.now() - t0 < ventana) await fotograma();
    const soloRegenera = S.fisica.aguante();
    await nuevo;
    return { tarde, max, muestras, ventana, soloRegenera, estado: S.sesion.estado(),
      huecos: S.jugador.noSoportados().filter((x) => /drainstamina|noxploss/.test(x)) };
  });

  const { max, muestras } = r;
  const i = muestras.findIndex((m) => m.u);
  const antes = i > 0 ? muestras[i - 1] : null;
  const justo = i >= 0 ? muestras[i] : null;

  control("CONTROL: se llega ANTES de `activate_stuff` (si no, lo de abajo no mide nada)",
    !r.tarde, r.tarde ? "player_joined ya estaba: la sonda llegó tarde" : "vaciado antes del segundo");
  control("`activate_stuff` corre al entrar (dispara `player_joined`)", i >= 0,
    i >= 0 ? `a los ${justo.ms.toFixed(0)} ms del montaje` : `no en 8 s (${muestras.length} fotogramas)`);
  control("y lo hace al SEGUNDO del `callevent 1.0`, no antes",
    // Más de medio segundo y no «casi 1 000»: el cero de este reloj es cuando la
    // página VIO el guion montado, que es algo después de montarse.
    i >= 0 && justo.ms > 500, i >= 0 ? `${justo.ms.toFixed(0)} ms` : "—");
  control("hasta entonces el aguante NO estaba lleno (lo vació la sonda)",
    Boolean(antes) && antes.a < max * 0.5, antes ? `${antes.a.toFixed(2)} de ${max.toFixed(2)} a los ${antes.ms.toFixed(0)} ms` : "sin muestra previa");
  control("en el fotograma en que corre, el aguante se LLENA de golpe (`drainstamina ent_me -1000`)",
    Boolean(justo) && Math.abs(justo.a - max) < 1e-6, justo ? `${justo.a.toFixed(2)} de ${max.toFixed(2)}` : "—");
  control("CONTROL NEGATIVO: la regeneración sola, en la misma ventana, no lo llena",
    r.soloRegenera < max * 0.5, `${r.soloRegenera.toFixed(2)} de ${max.toFixed(2)} en ${r.ventana.toFixed(0)} ms`);
  control("ni `drainstamina` ni `noxploss` quedan como hueco del guion del jugador",
    r.huecos.length === 0, r.huecos.join(", ") || "ninguno");

  const bien = controles.filter((c) => c.bien).length;
  console.log(`\n  CONTROLES`);
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(84)} ${c.detalle}`);
  console.log(`\n  ${bien} de ${controles.length} en verde`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);
  await nav.close();
  matar(dev);
  process.exit(bien === controles.length && errores.length === 0 ? 0 : 1);
} catch (e) {
  // UNA CAÍDA ES UNA ROJA, NO UNA NOTA AL PIE — la lección del 65.
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e.message}`);
  console.log(`  llevaba ${controles.filter((c) => c.bien).length} de ${controles.length} controles corridos`);
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(84)} ${c.detalle}`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
  try { await nav.close(); } catch {}
  matar(dev);
  process.exit(1);
}
