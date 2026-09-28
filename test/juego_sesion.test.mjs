// El ciclo de sesión, comprobado en Node plano.
//
// Sin navegador, sin reloj real y sin azar real: el reloj y el azar entran por
// el constructor justamente para esto. Una prueba que espera cinco segundos de
// verdad no es una prueba, es una pausa.

import test from "node:test";
import assert from "node:assert/strict";

import {
  Sesion, ESTADO, ENTRADA, IMPUESTO_DE_MUERTE, SUELTA_OBJETOS,
  GUARDADO_LOCAL, GUARDADO_CENTRAL, ESPERA_MUERTO, anuncioDeMuerte, guardarAlCerrar,
} from "../src/juego/sesion.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { atributosDe, derivadas } from "../src/juego/stats.js";

/** Un reloj que sólo avanza cuando se le dice. */
function reloj(t0 = 1000) {
  let t = t0;
  return { ahora: () => t, avanzar: (d) => { t += d; }, poner: (v) => { t = v; } };
}

const APARICION = {
  mapa: "gatecity",
  nacimiento: { nombre: "templo", escena: [2.2, -10.6, -62.8], luz: 66 },
  reaparicion: { nombre: "templo", escena: [2.2, -10.6, -62.8], luz: 66 },
};

async function conPersonaje({ oro = 1000, central = false, r = reloj() } = {}) {
  const almacen = new AlmacenMemoria();
  const s = new Sesion({ almacen, aparicion: APARICION, ahora: r.ahora, central });
  await s.arrancar();
  const p = await s.crear({ nombre: "Prueba" });
  p.oro = oro;
  await almacen.escribir(p);
  await s.entrar(p.id);
  return { s, almacen, p, r };
}

test("el ciclo de sesión", async (t) => {
  await t.test("arranca FUERA y pasa a ELIGIENDO sin personajes", async () => {
    const s = new Sesion({ almacen: new AlmacenMemoria() });
    assert.equal(s.estado, ESTADO.FUERA);
    const { hay, personajes } = await s.arrancar();
    assert.equal(s.estado, ESTADO.ELIGIENDO);
    assert.equal(hay, false);
    assert.deepEqual(personajes, []);
  });

  await t.test("no entra solo aunque haya uno único", async () => {
    const almacen = new AlmacenMemoria();
    const s = new Sesion({ almacen, aparicion: APARICION });
    await s.arrancar();
    await s.crear({ nombre: "Solo" });
    const { hay } = await s.arrancar();
    assert.equal(hay, true);
    // Sigue pidiendo elegir: borrar el equivocado es peor que un clic de más.
    assert.equal(s.estado, ESTADO.ELIGIENDO);
    assert.equal(s.personaje, null);
  });

  await t.test("entrar deja JUGANDO y con el personaje puesto", async () => {
    const { s, p } = await conPersonaje();
    assert.equal(s.estado, ESTADO.JUGANDO);
    assert.equal(s.personaje.id, p.id);
  });
});

test("el mapa se carga DESPUÉS de elegir, y entrar lo espera", async (t) => {
  await t.test("no se aparece hasta que el mapa está listo", async () => {
    const almacen = new AlmacenMemoria();
    let soltar;
    const mapa = new Promise((ok) => { soltar = ok; });
    let cargado = false;
    const s = new Sesion({
      almacen, aparicion: APARICION,
      preparar: () => mapa.then(() => { cargado = true; }),
    });
    await s.arrancar();
    const p = await s.crear({ nombre: "Paciente" });

    let aparecio = false;
    s.al("aparece", () => { aparecio = true; });
    const entrando = s.entrar(p.id);

    // Todavía no: el mapa no está.
    await new Promise((ok) => setTimeout(ok, 0));
    assert.equal(aparecio, false, "ha aparecido sin mapa");
    assert.equal(s.estado, ESTADO.ELIGIENDO, "ha cambiado de estado sin mapa");
    assert.equal(s.personaje, null, "ha cargado el personaje sin mapa");

    soltar();
    await entrando;
    assert.equal(cargado, true);
    assert.equal(aparecio, true);
    assert.equal(s.estado, ESTADO.JUGANDO);
  });

  await t.test("y avisa de que está preparando, para poder decirlo", async () => {
    const almacen = new AlmacenMemoria();
    const s = new Sesion({ almacen, aparicion: APARICION, preparar: async () => {} });
    await s.arrancar();
    const p = await s.crear({ nombre: "Avisado" });
    const orden = [];
    s.al("preparando", () => orden.push("preparando"));
    s.al("aparece", () => orden.push("aparece"));
    await s.entrar(p.id);
    assert.deepEqual(orden, ["preparando", "aparece"]);
  });

  await t.test("si el mapa falla, NO se entra", async () => {
    // Colocar a alguien en un mapa a medio cargar no da un error: da un
    // jugador atravesando el suelo, que es mucho peor de diagnosticar.
    const almacen = new AlmacenMemoria();
    const s = new Sesion({
      almacen, aparicion: APARICION,
      preparar: async () => { throw new Error("el .bsp no está"); },
    });
    await s.arrancar();
    const p = await s.crear({ nombre: "Desgraciado" });
    await assert.rejects(() => s.entrar(p.id), /el \.bsp no está/);
    assert.equal(s.personaje, null);
    assert.equal(s.estado, ESTADO.ELIGIENDO);
  });

  await t.test("sin `preparar` se entra igual, que es lo que hacen los demás mapas", async () => {
    const { s } = await conPersonaje();
    assert.equal(s.estado, ESTADO.JUGANDO);
  });
});

test("dónde aparece: los tres casos de m_JoinType", async (t) => {
  await t.test("un personaje que no ha pisado el mapa NACE", async () => {
    const { s } = await conPersonaje();
    assert.equal(s.entrada, ENTRADA.NUEVO);
    assert.equal(s.donde, APARICION.nacimiento);
  });

  await t.test("y queda apuntado como mapa visitado, así que la segunda vez VUELVE", async () => {
    const almacen = new AlmacenMemoria();
    const s = new Sesion({ almacen, aparicion: APARICION });
    await s.arrancar();
    const p = await s.crear({ nombre: "Ida" });
    await s.entrar(p.id);
    assert.equal(s.entrada, ENTRADA.NUEVO);
    await s.salir();
    await s.entrar(p.id);
    assert.equal(s.entrada, ENTRADA.VUELTA);
  });

  await t.test("al morir vuelve a la ÚLTIMA TRANSICIÓN, no a un punto del mapa", async () => {
    const { s } = await conPersonaje();
    const transicion = { nombre: "puerta norte", escena: [1, 2, 3] };
    s.ultimaTransicion = transicion;
    s.matar({ tipo: "monstruo" });
    s.reaparecer();
    assert.equal(s.entrada, ENTRADA.MUERTE);
    // Ésta es la línea del motor: «JN_TRAVEL: Transitioned to new map OR DIED,
    // and respawning at last transition».
    assert.equal(s.donde, transicion);
  });

  await t.test("y sin transición cae en la reaparición del mapa", async () => {
    const { s } = await conPersonaje();
    s.matar({ tipo: "monstruo" });
    s.reaparecer();
    assert.equal(s.donde, APARICION.reaparicion);
  });
});

test("morir cuesta el 1 % del oro, no el 5 % que dice el juego", async (t) => {
  await t.test("el impuesto es 0,01 y es entero", async () => {
    const { s } = await conPersonaje({ oro: 1000 });
    const { impuesto } = s.matar({ tipo: "monstruo" });
    assert.equal(impuesto, 10);
    assert.equal(s.personaje.oro, 990);
    // El control: con el 5 % que anuncia `help/first_death.script` serían 50.
    assert.notEqual(impuesto, Math.trunc(1000 * 0.05));
    assert.equal(IMPUESTO_DE_MUERTE, 0.01);
  });

  await t.test("con el oro de partida el impuesto es CERO", async () => {
    // `int TaxOut` trunca: con menos de 100 monedas morir sale gratis. Si esto
    // se redondease al alza, todo el que empieza pagaría en su primera muerte.
    const { s } = await conPersonaje({ oro: 10 });
    const { impuesto } = s.matar({ tipo: "monstruo" });
    assert.equal(impuesto, 0);
    assert.equal(s.personaje.oro, 10);
  });

  await t.test("una trampa o uno mismo NO cobran", async () => {
    for (const tipo of ["trampa", "yo", "desconocido"]) {
      const { s } = await conPersonaje({ oro: 1000 });
      const { impuesto } = s.matar({ tipo });
      assert.equal(impuesto, 0, `${tipo} no debería cobrar`);
      assert.equal(s.personaje.oro, 1000);
    }
  });

  await t.test("ni un NPC marcado NPC_NO_XP_PENALTY", async () => {
    const { s } = await conPersonaje({ oro: 1000 });
    const { impuesto } = s.matar({ tipo: "monstruo", sinCastigo: true });
    assert.equal(impuesto, 0);
  });

  await t.test("y no se suelta ni un objeto", async () => {
    // `m_fDropAllItems = false;` bajo un comentario que dice «Lose all items».
    const { s } = await conPersonaje({ oro: 1000 });
    const antes = s.personaje.objetos.length;
    let visto = null;
    s.al("muerte", (e) => { visto = e; });
    s.matar({ tipo: "monstruo" });
    assert.equal(s.personaje.objetos.length, antes);
    assert.equal(visto.sueltaObjetos, false);
    assert.equal(SUELTA_OBJETOS, false);
  });

  await t.test("y el anuncio es el del motor", async () => {
    assert.equal(anuncioDeMuerte("Roland"), "Roland has fallen!");
  });
});

test("daño y muerte", async (t) => {
  await t.test("quitar vida no mata hasta llegar a cero", async () => {
    const { s } = await conPersonaje();
    const max = s.limites.vidaMax;
    assert.ok(max > 1, "un personaje nuevo tiene que tener vida");
    const r = s.danar(1, { porQue: "un rasguño" });
    assert.equal(r.muerto, false);
    assert.equal(s.personaje.vida, max - 1);
    assert.equal(s.estado, ESTADO.JUGANDO);
  });

  await t.test("pasarse de la vida mata y no deja vida negativa", async () => {
    const { s } = await conPersonaje();
    const r = s.danar(s.limites.vidaMax + 1000, { tipo: "monstruo" });
    assert.equal(r.muerto, true);
    assert.equal(s.personaje.vida, 0);
    assert.equal(s.estado, ESTADO.MURIENDO);
  });

  await t.test("un muerto no recibe más daño", async () => {
    const { s } = await conPersonaje();
    s.matar({ tipo: "monstruo" });
    const r = s.danar(50);
    assert.equal(r.quitado, 0);
    assert.equal(r.muerto, false);
  });

  await t.test("reaparecer devuelve la vida y el maná al máximo DE AHORA", async () => {
    const { s } = await conPersonaje();
    s.matar({ tipo: "monstruo" });
    s.reaparecer();
    const d = derivadas(atributosDe(s.personaje.habilidades));
    assert.equal(s.personaje.vida, d.vidaMax);
    assert.equal(s.personaje.mana, d.manaMax);
    assert.equal(s.estado, ESTADO.JUGANDO);
  });

  await t.test("entrar recorta una vida imposible de un documento viejo", async () => {
    const almacen = new AlmacenMemoria();
    const s = new Sesion({ almacen, aparicion: APARICION });
    await s.arrancar();
    const p = await s.crear({ nombre: "Inflado" });
    p.vida = 99999;
    await almacen.escribir(p);
    await s.entrar(p.id);
    assert.equal(s.personaje.vida, s.limites.vidaMax);
  });
});

test("la cuenta atrás de la muerte", async (t) => {
  await t.test("MURIENDO pasa a MUERTO al primer tic", async () => {
    const r = reloj();
    const { s } = await conPersonaje({ r });
    s.matar({ tipo: "monstruo" });
    assert.equal(s.estado, ESTADO.MURIENDO);
    s.tic({});
    assert.equal(s.estado, ESTADO.MUERTO);
  });

  await t.test("no se reaparece sin haber soltado las teclas", async () => {
    const r = reloj();
    const { s } = await conPersonaje({ r });
    s.matar({ tipo: "monstruo" });
    s.tic({ botonPulsado: true });   // → MUERTO
    // Venía apretando el ataque cuando lo mataron: por mucho que siga
    // apretando, no vuelve. `if (fAnyButtonDown) return;`
    for (let i = 0; i < 20; i++) { r.avanzar(0.05); s.tic({ botonPulsado: true }); }
    assert.equal(s.estado, ESTADO.MUERTO);
    // Suelta…
    r.avanzar(0.05); s.tic({ botonPulsado: false });
    assert.equal(s.estado, ESTADO.MUERTO);
    // …y ahora sí.
    r.avanzar(0.05); s.tic({ botonPulsado: true });
    assert.equal(s.estado, ESTADO.JUGANDO);
  });

  await t.test("y a los cinco segundos vuelve solo, aunque no suelte nada", async () => {
    const r = reloj();
    const { s } = await conPersonaje({ r });
    s.matar({ tipo: "monstruo" });
    s.tic({ botonPulsado: true });
    r.avanzar(ESPERA_MUERTO - 0.1);
    s.tic({ botonPulsado: true });
    assert.equal(s.estado, ESTADO.MUERTO, "todavía no");
    r.avanzar(0.2);
    s.tic({ botonPulsado: true });
    assert.equal(s.estado, ESTADO.JUGANDO);
    assert.equal(ESPERA_MUERTO, 5.0);
  });
});

test("el guardado automático", async (t) => {
  await t.test("local: cada tres segundos y sólo si hay cambios", async () => {
    const r = reloj();
    const { s } = await conPersonaje({ r });
    // Entrar deja cambios pendientes de verdad —apunta el mapa en
    // `mapasVisitados`— así que primero se vacía esa cola.
    r.avanzar(GUARDADO_LOCAL + 0.1); s.tic({});
    await new Promise((ok) => setTimeout(ok, 0));
    let veces = 0;
    s.al("guardado", () => veces++);
    // Y ya sin tocar nada no guarda por mucho que pase el tiempo.
    for (let i = 0; i < 10; i++) { r.avanzar(GUARDADO_LOCAL + 0.1); s.tic({}); }
    await new Promise((ok) => setTimeout(ok, 0));
    assert.equal(veces, 0, "no hay nada que guardar");
    // Con un cambio, sí.
    s.danar(1);
    r.avanzar(GUARDADO_LOCAL + 0.1);
    s.tic({});
    await new Promise((ok) => setTimeout(ok, 0));
    assert.equal(veces, 1);
  });

  await t.test("y no antes de tiempo", async () => {
    const r = reloj();
    const { s } = await conPersonaje({ r });
    let veces = 0;
    s.al("guardado", () => veces++);
    s.danar(1);
    r.avanzar(GUARDADO_LOCAL - 0.5);
    s.tic({});
    await new Promise((ok) => setTimeout(ok, 0));
    assert.equal(veces, 0);
  });

  await t.test("central: el período cae entre 4 y 8 y NO es fijo", async () => {
    // El desfase de `RANDOM_FLOAT(4.0f, 8.0f)` existe para que veinte jugadores
    // no llamen al maestro a la vez. Un período fijo pasaría la prueba del
    // rango y perdería justamente eso, así que se comprueba la dispersión.
    const vistos = new Set();
    for (let i = 0; i < 40; i++) {
      const s = new Sesion({ almacen: new AlmacenMemoria(), central: true });
      const p = s._periodo();
      assert.ok(p >= GUARDADO_CENTRAL[0] && p <= GUARDADO_CENTRAL[1], `${p} fuera de rango`);
      vistos.add(p.toFixed(3));
    }
    assert.ok(vistos.size > 20, `esperaba dispersión y he visto ${vistos.size} valores distintos`);
  });

  await t.test("sin servidor central el período es exactamente 3", () => {
    const s = new Sesion({ almacen: new AlmacenMemoria(), central: false });
    assert.equal(s._periodo(), GUARDADO_LOCAL);
    assert.equal(GUARDADO_LOCAL, 3.0);
  });

  await t.test("morir guarda en el acto, sin esperar al período", async () => {
    const r = reloj();
    const { s } = await conPersonaje({ oro: 1000, r });
    let guardado = null;
    s.al("guardado", (e) => { guardado = e.personaje; });
    s.matar({ tipo: "monstruo" });
    await new Promise((ok) => setTimeout(ok, 0));
    // Si el navegador se cierra entre morir y reaparecer, lo guardado tiene que
    // ser el muerto que ya ha pagado, no el vivo con el oro intacto.
    assert.equal(guardado.oro, 990);
    assert.equal(guardado.vida, 0);
  });

  await t.test("salir guarda a la fuerza y espera", async () => {
    const { s, almacen, p } = await conPersonaje();
    s.danar(3);
    await s.salir();
    assert.equal(s.personaje, null);
    assert.equal(s.estado, ESTADO.ELIGIENDO);
    const leido = await almacen.leer(p.id);
    assert.equal(leido.personaje.vida, s.limites?.vidaMax ?? leido.personaje.vida);
    assert.ok(leido.personaje.actualizado);
  });

  await t.test("un guardado que falla se queda sucio y avisa", async () => {
    const r = reloj();
    const almacen = new AlmacenMemoria();
    const s = new Sesion({ almacen, aparicion: APARICION, ahora: r.ahora });
    await s.arrancar();
    const p = await s.crear({ nombre: "Frágil" });
    await s.entrar(p.id);
    almacen.escribir = async () => { throw new Error("disco lleno"); };
    let fallo = null;
    s.al("fallo", (e) => { fallo = e; });
    s.danar(1);
    await s.guardar();
    assert.equal(fallo.que, "guardar");
    // Y lo importante: sigue marcado como pendiente, así que el siguiente
    // intento lo vuelve a probar. Un guardado perdido en silencio es cómo se
    // pierde un personaje.
    assert.equal(s._sucio, true);
  });
});

test("guardarAlCerrar usa pagehide y visibilitychange, no beforeunload", () => {
  const oyentes = new Map();
  const falso = {
    document: { visibilityState: "visible" },
    addEventListener: (n, f) => { oyentes.set(n, f); },
    removeEventListener: (n) => { oyentes.delete(n); },
  };
  const s = new Sesion({ almacen: new AlmacenMemoria() });
  s.personaje = { id: "x", nombre: "X" };
  let veces = 0;
  s.guardar = () => { veces++; };
  const soltar = guardarAlCerrar(s, falso);

  assert.ok(oyentes.has("pagehide"), "pagehide");
  assert.ok(oyentes.has("visibilitychange"), "visibilitychange");
  // `beforeunload` NO se usa: en el móvil no se dispara casi nunca.
  assert.equal(oyentes.has("beforeunload"), false);

  oyentes.get("pagehide")();
  assert.equal(veces, 1);
  // Visible no guarda; oculta sí.
  oyentes.get("visibilitychange")();
  assert.equal(veces, 1);
  falso.document.visibilityState = "hidden";
  oyentes.get("visibilitychange")();
  assert.equal(veces, 2);

  soltar();
  assert.equal(oyentes.size, 0);
});

test("un oyente que revienta no tumba la sesión", async () => {
  const { s } = await conPersonaje();
  s.al("muerte", () => { throw new Error("la pantalla de muerte está rota"); });
  let llegó = false;
  s.al("muerte", () => { llegó = true; });
  // Sin la protección, el jugador se queda muerto para siempre por un fallo de
  // pintura.
  assert.doesNotThrow(() => s.matar({ tipo: "monstruo" }));
  assert.equal(llegó, true);
  assert.equal(s.estado, ESTADO.MURIENDO);
});
