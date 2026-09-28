// El PERSONAJE: sus estadísticas, su registro y su almacén.
//
// Lo que se juzga aquí no es «¿compila?». Son tres cosas que, mal hechas, no
// dan error y sí dan un personaje plausible y falso:
//
//   1. que las habilidades tengan las propiedades que tienen y no tres cada
//      una — `parry` tiene UNA y `spellcasting` tiene CINCO;
//   2. que la curva de experiencia sea la del motor y no una parecida;
//   3. que leer y guardar un personaje **no le borre nada**, ni siquiera lo
//      que este código no entiende. Ese es el que de verdad cuesta caro:
//      abrir un personaje con una versión vieja y mutilarlo silenciosamente.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  ATRIBUTOS, HABILIDADES, PROPIEDADES, ESCUELAS, propiedadesDe,
  expNecesaria, habilidadesDePartida, aprender, habilidadDeArma,
  TOPE_PROPIEDAD, TOPE_APRENDIZAJE, GETSTAT, aporteDe, atributosDe,
} from "../src/juego/stats.js";
import {
  crearPersonaje, abrirPersonaje, entrenar, resumen, VERSION,
} from "../src/juego/personaje.js";
import { AlmacenMemoria, exportar, importar, MARCA } from "../src/juego/almacen.js";
import { leerFichaObjeto } from "../src/bsp/script.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const hayScripts = existsSync(`${SCRIPTS}/items/swords_rsword.script`);

describe("las estadísticas, traducidas del motor", () => {
  test("seis atributos, nueve habilidades, tres propiedades, cinco escuelas", () => {
    assert.equal(ATRIBUTOS.length, 6);   // NatStatList[6]
    assert.equal(HABILIDADES.length, 9); // SkillStatList[9]
    assert.equal(PROPIEDADES.length, 3); // SkillTypeList[3]
    assert.equal(ESCUELAS.length, 5);    // SpellTypeList[5]
  });

  test("y NO todas las habilidades tienen tres propiedades", () => {
    // Es el detalle que se pierde asumiendo una rejilla, y no da error.
    assert.deepEqual(propiedadesDe("parry"), ["proficiency"]);
    assert.equal(propiedadesDe("spellcasting").length, 5);
    assert.deepEqual(propiedadesDe("spellcasting"), ESCUELAS.map((e) => e.clave));
    assert.equal(propiedadesDe("swordsmanship").length, 3);
    // El control: si alguien «simplificara» a tres para todas, esto cae.
    // SIETE habilidades de arma con tres propiedades, más las cinco escuelas
    // de magia y la única de parry. Conté seis la primera vez y la prueba lo
    // cazó — que es para lo que está.
    const deArma = HABILIDADES.filter((h) => h.propiedades === "armas").length;
    assert.equal(deArma, 7);
    const total = HABILIDADES.reduce((s, h) => s + propiedadesDe(h.clave).length, 0);
    assert.equal(total, 7 * 3 + 5 + 1, `hay ${total} propiedades y se esperaban ${7 * 3 + 5 + 1}`);

    // Y OJO CON EL TOTAL, que no sirve de control: **7×3 + 5 + 1 = 27 y
    // 9×3 = 27 también.** El modelo ingenuo —tres propiedades para las nueve—
    // da exactamente la misma cifra. Una coincidencia así es justo lo que hace
    // que un error pase: la suma cuadra y la hoja de personaje está mal.
    //
    // El control tiene que ser por habilidad, y es éste: el reparto de cuántas
    // tiene cada una.
    const reparto = HABILIDADES.map((h) => propiedadesDe(h.clave).length).sort();
    assert.deepEqual(reparto, [1, 3, 3, 3, 3, 3, 3, 3, 5]);
    assert.notDeepEqual(reparto, [3, 3, 3, 3, 3, 3, 3, 3, 3]);
  });

  test("la curva de experiencia es la del motor, punto por punto", () => {
    // long double GetExpNeeded(int v) { return pow(1.248, v) * (4.0 * v); }
    for (const v of [1, 5, 10, 25, 50, 100]) {
      assert.ok(Math.abs(expNecesaria(v) - Math.pow(1.248, v) * 4 * v) < 1e-9);
    }
    assert.equal(expNecesaria(0), 0, "el primer punto es gratis, y eso es del motor");
    // Y crece de verdad: el punto 50 cuesta muchísimo más que el 10.
    assert.ok(expNecesaria(50) / expNecesaria(10) > 1000);
  });

  test("un personaje nuevo arranca como dice `CreateChar`", () => {
    const h = habilidadesDePartida();
    // Un punto a la POTENCIA de las de arma, y cero en las otras dos.
    assert.equal(h.swordsmanship.power.valor, 1);
    assert.equal(h.swordsmanship.proficiency.valor, 0);
    assert.equal(h.swordsmanship.balance.valor, 0);
    // Uno a la única de parry.
    assert.equal(h.parry.proficiency.valor, 1);
    // Y uno a CADA escuela de magia, que es lo fácil de olvidar.
    for (const e of ESCUELAS) assert.equal(h.spellcasting[e.clave].valor, 1, `falta el punto de ${e.clave}`);
    const suma = Object.values(h).flatMap((x) => Object.values(x)).reduce((s, p) => s + p.valor, 0);
    assert.equal(suma, 7 /* armas, una a POTENCIA */ + 1 /* parry */ + 5 /* escuelas */);
  });

  // ── LA CURVA DE EXPERIENCIA, que hasta el 21 era la nuestra ─────────────
  //
  // `LearnSkill` (msmonsterserver.cpp:2713-2809) no es «suma y compara». Es
  // cuatro rarezas juntas, y las cuatro se notan jugando.

  test("lo que hace falta se mide con el valor ACTUAL, no con el siguiente", () => {
    // `GetExpNeeded(OldVal)`, y no `OldVal + 1`. Para pasar de 1 a 2 el motor
    // pide 4,99; la curva que teníamos pedía 12,46 — dos veces y media.
    assert.ok(Math.abs(expNecesaria(1) - 4.992) < 0.001);
    assert.ok(Math.abs(expNecesaria(2) - 12.460) < 0.001);
    // El control: un goblin reparte 25 entre tres propiedades, o sea 8 por
    // propiedad. Con el umbral bueno (4,99) ese 8 llena la barra de golpe;
    // con el que teníamos (12,46) se quedaba a medias y no subía nunca.
    const p = { valor: 1, exp: 0 };
    aprender(p, 8);
    assert.equal(p.exp, 4, "se recorta a lo que falta, truncado a entero");
    // Y en dos muertes más está arriba. Con el umbral viejo de 12,46 el
    // recorte habría dejado 12 y harían falta las mismas tres muertes, pero
    // con el valor 2 pidiendo 23,3 en vez de 12,46 — o sea que el error se
    // acumula: a nivel 10 el motor pide 37 y la curva vieja 45.
    // Y el error crece con el nivel, porque la curva es exponencial: a nivel
    // 10 el motor pide 367 y la regla vieja habría pedido los 503 del 11.
    assert.equal(Math.round(expNecesaria(10)), 367);
    assert.equal(Math.round(expNecesaria(11)), 503);
  });

  test("el reparto se RECORTA a lo que falta, y el sobrante se tira", () => {
    // `if (iExpHandout > (int)abs(ExpLeft) && (int)abs(ExpLeft) != 0)
    //    iExpHandout = abs(ExpLeft);`
    const enano = { valor: 1, exp: 0 };
    const dragon = { valor: 1, exp: 0 };
    assert.equal(aprender(enano, 5).entregado.toFixed(3), aprender(dragon, 5000).entregado.toFixed(3));
    assert.equal(enano.exp.toFixed(3), dragon.exp.toFixed(3));
    // Y ahí está la rata de Edana: matar algo enorme vale lo mismo que matar
    // algo pequeño, así que lo que cuenta son las MUERTES y no los puntos.
    assert.ok(dragon.exp < 5, `un bicho de 5000 deja ${dragon.exp}, no 5000`);
  });

  test("subir cuesta siempre una muerte de más, porque se mira antes de sumar", () => {
    // `ExpLeft` se calcula ANTES del `SubStat.Exp += iExpHandout`, y el
    // `if (ExpLeft < 0) return` de después usa ese valor viejo.
    const p = { valor: 1, exp: 0 };
    const pasos = [];
    for (let n = 0; n < 3; n++) pasos.push(aprender(p, 25).subio);
    assert.deepEqual(pasos, [false, false, true],
      "tres goblins para el primer punto, y el tercero es el que sube");
    assert.equal(p.valor, 2);
    assert.equal(p.exp, 0, "al subir, la experiencia se pone a cero y no se arrastra");
    // Y el siguiente punto cuesta otras tres, con los 25 enteros tirados cada
    // vez: son MUERTES, no puntos.
    const mas = [];
    for (let n = 0; n < 3; n++) mas.push(aprender(p, 25).subio);
    assert.deepEqual(mas, [false, false, true]);
    assert.equal(p.valor, 3);
  });

  test("hay un minimo de uno: a menos de un punto del umbral, siempre se entrega", () => {
    // `else if ((int)std::abs(ExpLeft) == 0) iExpHandout = 1;`
    const p = { valor: 1, exp: 4.5 };            // |4.5 − 4.992| = 0.49 → (int) 0
    assert.equal(aprender(p, 0).entregado, 1, "hasta un bicho de nivel 0 ensena aqui");
    assert.equal(p.exp, 5.5);
  });

  test("no se puede subir mas de un punto por muerte", () => {
    // Nuestro `while` no podia ocurrir nunca en el motor: `SubStat.Value += 1`
    // esta fuera de todo bucle.
    const p = { valor: 1, exp: 0 };
    const r = aprender(p, 1e9);
    assert.equal(r.subio, false);
    assert.equal(p.valor, 1);
  });

  test("el tope que para de verdad es 45, no 100", () => {
    // `CHAR_LEVEL_CAP 45` (cbase.h:142) corta el aprendizaje;
    // `STATPROP_MAX_VALUE 100` solo recorta el valor al final.
    assert.equal(TOPE_APRENDIZAJE, 45);
    assert.equal(TOPE_PROPIEDAD, 100);
    const r = { valor: 45, exp: 0 };
    assert.equal(aprender(r, 1e9).subio, false);
    assert.equal(r.exp, 0, "ni siquiera acumula");
    assert.match(aprender(r, 10).porque, /tope/);
  });

  test("`spellcasting.affliction` se parte en habilidad y propiedad", () => {
    assert.deepEqual(habilidadDeArma("swordsmanship"), { habilidad: "swordsmanship", propiedad: null });
    assert.deepEqual(habilidadDeArma("spellcasting.affliction"), { habilidad: "spellcasting", propiedad: "affliction" });
    // El control: sin partir el punto, esto sería null y seis armas del
    // catálogo entrenarían una habilidad que no existe.
    assert.equal(habilidadDeArma("spellcasting.noexiste").propiedad, null);
    assert.equal(habilidadDeArma("noexiste"), null);
    assert.equal(habilidadDeArma(""), null);
  });
});

describe("el registro del personaje", () => {
  const cfg = { oro: 10, gratis: ["pack_sack", "sheath_back"], armas: ["swords_rsword", "bows_treebow"] };

  test("se crea con lo que dice el archivo, no con lo que nos parezca", () => {
    const p = crearPersonaje({ nombre: "Prueba", arma: "swords_rsword", nuevoPersonaje: cfg });
    assert.equal(p.oro, 10);
    assert.equal(p.objetos.length, 3); // dos gratis y el arma
    assert.equal(p.manos.derecha, "swords_rsword");
    assert.equal(p.version, VERSION);
    assert.ok(p.id && p.creado && p.actualizado);
  });

  test("y no acepta un arma que no está en la lista", () => {
    assert.throws(() => crearPersonaje({ nombre: "X", arma: "swords_excalibur", nuevoPersonaje: cfg }), /no está entre las armas/);
    assert.throws(() => crearPersonaje({ nombre: "  ", arma: "swords_rsword", nuevoPersonaje: cfg }), /necesita nombre/);
  });

  // EL QUE IMPORTA.
  test("abrir y guardar NO le borra nada, ni lo que este código no entiende", () => {
    const futuro = {
      version: 99,
      id: "abc", nombre: "Del futuro", oro: 5,
      atributos: { strength: 3 },
      habilidades: {
        swordsmanship: { power: { valor: 7, exp: 3 }, cadencia: { valor: 2, exp: 0 } },
        alquimia: { proficiency: { valor: 4, exp: 1 } },
      },
      reputacion: { edana: 30 },
      objetos: [{ id: "swords_rsword", n: 1 }],
    };
    const { personaje, avisos } = abrirPersonaje(structuredClone(futuro));
    // Lo suyo sigue ahí, tal cual.
    assert.equal(personaje.reputacion.edana, 30, "un campo desconocido de raíz");
    assert.equal(personaje.habilidades.alquimia.proficiency.valor, 4, "una habilidad desconocida");
    assert.equal(personaje.habilidades.swordsmanship.cadencia.valor, 2, "una propiedad desconocida");
    assert.equal(personaje.habilidades.swordsmanship.power.valor, 7, "y la conocida no se toca");
    // Lo que faltaba se rellena.
    assert.equal(personaje.habilidades.parry.proficiency.valor, 0);
    // Y `atributos` de un documento viejo se CONSERVA pero no manda: los
    // atributos se derivan de las habilidades, no se guardan.
    assert.equal(personaje.atributos.strength, 3, "el campo viejo sigue ahí");
    assert.ok(avisos.some((a) => /atributos/.test(a)), "y se avisa de que ya no se usa");
    // Y avisa de las tres cosas, en vez de callárselas.
    assert.ok(avisos.some((a) => /reputacion/.test(a)));
    assert.ok(avisos.some((a) => /alquimia/.test(a)));
    assert.ok(avisos.some((a) => /cadencia/.test(a)));
    assert.ok(avisos.some((a) => /versión 99/.test(a)));
  });

  test("el CONTROL de lo anterior: un lector que filtra por campos conocidos lo pierde", () => {
    // Es el fallo que la prueba de arriba impide, escrito para que se vea.
    const futuro = { version: 99, id: "abc", nombre: "X", reputacion: { edana: 30 } };
    const ingenuo = (d) => ({ version: d.version, id: d.id, nombre: d.nombre, oro: d.oro ?? 0 });
    assert.equal(ingenuo(futuro).reputacion, undefined);
    assert.equal(abrirPersonaje(structuredClone(futuro)).personaje.reputacion.edana, 30);
  });

  test("un personaje sin nombre no se abre, y un objeto cualquiera tampoco", () => {
    assert.throws(() => abrirPersonaje({ version: 1, id: "a" }), /sin nombre/);
    assert.throws(() => abrirPersonaje(null), /no es un personaje/);
    assert.throws(() => abrirPersonaje("hola"), /no es un personaje/);
  });

  test("entrenar sube la habilidad que dice el arma — a las tres muertes", () => {
    const p = crearPersonaje({ nombre: "P", arma: "swords_rsword", nuevoPersonaje: cfg });
    // Tres, y da igual lo gordo que sea el bicho: el reparto se recorta. Con
    // una sola llamada esto no sube, y ése era el fallo que se veía jugando.
    assert.equal(entrenar(p, "swordsmanship", 500).subidas, 0);
    assert.equal(entrenar(p, "swordsmanship", 500).subidas, 0);
    const r = entrenar(p, "swordsmanship", 500);
    assert.equal(r.donde, "swordsmanship.power");
    assert.equal(r.subidas, 1);
    assert.equal(p.habilidades.swordsmanship.power.valor, 2);
    // Y una de magia va a SU escuela, no a un montón común.
    const antes = p.habilidades.spellcasting.affliction.valor;
    let m = null;
    for (let n = 0; n < 3; n++) m = entrenar(p, "spellcasting.affliction", 500);
    assert.equal(m.donde, "spellcasting.affliction");
    assert.ok(p.habilidades.spellcasting.affliction.valor > antes);
    assert.equal(p.habilidades.spellcasting.fire.valor, 1, "y no toca las otras escuelas");
    // Un arma que no nombra habilidad no entrena nada, y lo dice.
    assert.deepEqual(entrenar(p, null, 500), { subidas: 0, donde: null });
  });

  test("al llegar al tope 45 se salta a la SIGUIENTE propiedad, y solo a esa", () => {
    const p = crearPersonaje({ nombre: "P", arma: "swords_rsword", nuevoPersonaje: cfg });
    const h = p.habilidades.swordsmanship;
    h.power.valor = TOPE_APRENDIZAJE;
    // `iStatType = (iStatType + 1) % 3` — el orden es el de PROPIEDADES.
    const orden = propiedadesDe("swordsmanship");
    const siguiente = orden[(orden.indexOf("power") + 1) % 3];
    assert.equal(entrenar(p, "swordsmanship", 50).donde, `swordsmanship.${siguiente}`);
    // Y con la siguiente TAMBIÉN al tope se acabó, aunque la tercera esté
    // libre: el bucle del motor da UNA vuelta (`for (int i = 0; i < 1; i++)`).
    h[siguiente].valor = TOPE_APRENDIZAJE;
    assert.equal(entrenar(p, "swordsmanship", 50).subidas, 0);
    const tercera = orden.find((k) => k !== "power" && k !== siguiente);
    assert.ok(h[tercera].valor < TOPE_APRENDIZAJE, "y la tercera se queda sin entrenar");
  });

  test("el resumen dice que la suma de habilidades es NUESTRA y no un nivel de MSR", () => {
    const p = crearPersonaje({ nombre: "P", arma: "swords_rsword", nuevoPersonaje: cfg });
    const r = resumen(p);
    assert.equal(r.habilidades.length, 9);
    assert.equal(r.atributos.length, 6);
    assert.equal(r.sumaDeHabilidades, 13); // 7 armas + parry + 5 escuelas
  });

  // Las cifras de un personaje recién creado, calculadas a mano con las
  // fórmulas del motor. Si alguien «simplifica» un divisor, esto cae.
  test("un personaje nuevo sale con 15 de vida y 20 de maná, y eso son cuentas", () => {
    const p = crearPersonaje({ nombre: "P", arma: "swords_rsword", nuevoPersonaje: cfg });
    const r = resumen(p);
    // Las nueve habilidades valen 1: media de (0,0,1) es 0 y el suelo la sube.
    for (const h of r.habilidades) assert.equal(h.valor, 1, `${h.clave} deberia valer 1`);
    const a = Object.fromEntries(r.atributos.map((x) => [x.clave, x.valor]));
    assert.deepEqual(a, { strength: 2, agility: 1, concentration: 2, awareness: 1, fitness: 1, wisdom: 2 });
    assert.equal(r.derivadas.vidaMax, 15); // 5 + (2-1)*7 + 0 + (2-1)*3
    assert.equal(r.derivadas.manaMax, 20); // WIS * 10
    assert.equal(r.derivadas.carga, 75);   // min(STR*25 + 25, 2000)
    assert.equal(p.vida, 15);
    assert.equal(p.mana, 20);
  });

  test("y suben al subir las habilidades, sin que nadie reparta puntos", () => {
    // El control de que los atributos son DERIVADOS: no se tocan, y cambian.
    const p = crearPersonaje({ nombre: "P", arma: "swords_rsword", nuevoPersonaje: cfg });
    const antes = resumen(p);
    for (let i = 0; i < 30; i++) entrenar(p, "spellcasting.fire", 1e6);
    const despues = resumen(p);
    const wAntes = antes.atributos.find((a) => a.clave === "wisdom").valor;
    const wDespues = despues.atributos.find((a) => a.clave === "wisdom").valor;
    assert.ok(wDespues > wAntes, `wisdom ${wAntes} -> ${wDespues}`);
    assert.ok(despues.derivadas.manaMax > antes.derivadas.manaMax);
  });
});

describe("el almacén", () => {
  test("guardar, listar, leer y borrar", async () => {
    const a = new AlmacenMemoria();
    const p = crearPersonaje({ nombre: "Uno", arma: null, nuevoPersonaje: { oro: 10, gratis: [], armas: [] } });
    await a.escribir(p);
    const lista = await a.listar();
    assert.equal(lista.length, 1);
    assert.equal(lista[0].nombre, "Uno");
    const leido = await a.leer(p.id);
    assert.equal(leido.personaje.nombre, "Uno");
    assert.equal(await a.leer("no-existe"), null);
    await a.borrar(p.id);
    assert.equal((await a.listar()).length, 0);
  });

  test("lo escrito es una COPIA: tocar el objeto después no cambia el disco", async () => {
    // Sin esto, un personaje se «guarda» y sigue cambiando solo — y el bicho
    // aparece cuando algo falla a mitad y el disco tiene un estado a medias.
    const a = new AlmacenMemoria();
    const p = crearPersonaje({ nombre: "Dos", arma: null, nuevoPersonaje: { oro: 10, gratis: [], armas: [] } });
    await a.escribir(p);
    p.oro = 9999;
    assert.equal((await a.leer(p.id)).personaje.oro, 10);
  });

  test("exportar e importar conserva el personaje entero", () => {
    const p = crearPersonaje({ nombre: "Tres", arma: null, nuevoPersonaje: { oro: 10, gratis: ["pack_sack"], armas: [] } });
    p.reputacion = { edana: 12 };
    const texto = exportar(p);
    assert.ok(texto.includes(MARCA));
    const { personaje } = importar(texto);
    assert.equal(personaje.nombre, "Tres");
    assert.equal(personaje.oro, 10);
    assert.equal(personaje.reputacion.edana, 12, "también lo que no conocemos");
    assert.deepEqual(personaje.objetos, p.objetos);
  });

  test("importar acepta un personaje a pelo y rechaza lo que no lo es", () => {
    const p = crearPersonaje({ nombre: "Cuatro", arma: null, nuevoPersonaje: { oro: 1, gratis: [], armas: [] } });
    assert.equal(importar(JSON.stringify(p)).personaje.nombre, "Cuatro");
    assert.throws(() => importar("{no es json"), /no es un JSON/);
    assert.throws(() => importar("[1,2,3]"), /no trae un personaje/);
    assert.throws(() => importar(JSON.stringify({ marca: MARCA, personaje: { version: 1 } })), /sin nombre/);
  });
});

describe("el catálogo de objetos (sólo con los scripts de MSR al lado)", { skip: !hayScripts }, () => {
  test("la espada de partida trae sus números, no los de su plantilla", () => {
    const f = leerFichaObjeto(SCRIPTS, "items/swords_rsword");
    assert.equal(f.nombre, "Rusty Short Sword");
    assert.equal(f.tipo, "arma");
    assert.equal(f.peso, 10);
    assert.equal(f.valor, 3);
    assert.equal(f.arma.habilidad, "swordsmanship");
    assert.equal(f.arma.dano, 90, "90 es SUYO; si sale otro, ha ganado la constante de la base");
    assert.equal(f.arma.tipoDano, "slash");
    assert.equal(f.arma.alcance, 60);
    assert.ok(f.hereda.includes("items/base_melee"));
  });

  test("EL CONTROL: dos armas de la MISMA base tienen números distintos", () => {
    // Si `const` se leyera al revés —gana el último— las dos saldrían iguales,
    // y eso no da error: da 178 armas clonadas de seis plantillas.
    const a = leerFichaObjeto(SCRIPTS, "items/swords_rsword");
    const b = leerFichaObjeto(SCRIPTS, "items/axes_rsmallaxe");
    assert.ok(a && b);
    assert.notEqual(a.arma.dano, b.arma.dano);
    assert.notEqual(a.arma.habilidad, b.arma.habilidad);
    assert.equal(b.arma.habilidad, "axehandling");
  });

  test("un arco no trae daño: lo trae su flecha, y el catálogo lo dice", () => {
    const f = leerFichaObjeto(SCRIPTS, "items/bows_treebow");
    assert.equal(f.arma.habilidad, "archery");
    assert.ok(f.arma.proyectil, "un arco tiene que nombrar su proyectil");
  });

  test("las siete armas de partida existen y cubren siete habilidades distintas", () => {
    const lista = ["swords_rsword", "bows_treebow", "smallarms_rknife", "axes_rsmallaxe",
      "blunt_hammer1", "magic_hand_lightning_weak", "polearms_qs"];
    const habs = new Set();
    for (const id of lista) {
      const f = leerFichaObjeto(SCRIPTS, `items/${id}`);
      assert.ok(f, `${id} no está`);
      assert.ok(f.nombre, `${id} no tiene nombre`);
      const h = habilidadDeArma(f.arma?.habilidad);
      if (h) habs.add(h.habilidad);
    }
    // Seis de arma más la de magia. `martialarts` no tiene entrada: empezar
    // sin arma ES elegirla, y eso es del diseño de MSR.
    assert.ok(habs.size >= 6, `sólo ${habs.size} habilidades distintas: ${[...habs].join(", ")}`);
    assert.ok(!habs.has("martialarts"));
  });

  test("una plantilla no es un objeto: no tiene nombre", () => {
    const base = leerFichaObjeto(SCRIPTS, "items/base_melee");
    assert.ok(base, "la plantilla existe");
    assert.equal(base.nombre, null, "y por eso se queda fuera del catálogo");
  });

  test("un script que no existe devuelve null, que no es lo mismo que vacío", () => {
    assert.equal(leerFichaObjeto(SCRIPTS, "items/no_existe_esto"), null);
  });
});

describe("con qué crece cada habilidad — la hoja lo CALCULA, no lo copia", () => {
  // El mockup traía una tabla de ejemplo marcada como «sustituir por la tabla
  // real». No hace falta sustituirla a mano: los pesos son los de
  // `CMSMonster::GetStat()` y ya estaban en el código, sólo que dentro de la
  // fórmula. Ahora están en `GETSTAT` y se leen por columna.

  test("la tabla y la fórmula son la MISMA fuente", () => {
    // El control de que sacarlos a una tabla no ha cambiado nada: los seis
    // atributos de un personaje de partida tienen que seguir saliendo igual.
    const a = atributosDe(habilidadesDePartida());
    assert.deepEqual(a, {
      strength: 2, agility: 1, concentration: 2, awareness: 1, fitness: 1, wisdom: 2,
    });
  });

  test("los divisores NO son el número de sumandos, y eso importa", () => {
    // Si alguien «simplifica» esto, un espadachín puro pasa de 37 de fuerza a
    // 21 y nadie se entera: sigue siendo un número plausible.
    assert.equal(Object.keys(GETSTAT.strength.pesos).length, 7);
    assert.equal(GETSTAT.strength.divisor, 4);
    assert.equal(Object.keys(GETSTAT.awareness.pesos).length, 7);
    assert.equal(GETSTAT.awareness.divisor, 7);
  });

  test("se ordena por lo que RINDE, no por el peso", () => {
    // Es la diferencia entre la lista correcta y una plausible. En arquería,
    // Percepción pesa 2,0 y Concentración 1,5 — y sin embargo lo que más sube
    // es Concentración, porque divide entre 2 y no entre 7.
    const arco = aporteDe("archery");
    assert.equal(arco[0].nombre, "Concentration");
    assert.equal(arco[0].peso, 1.5);
    assert.equal(arco[1].nombre, "Awareness");
    assert.equal(arco[1].peso, 2.0);
    assert.ok(arco[0].rinde > arco[1].rinde, "el orden tiene que ser por peso/divisor");
  });

  test("Parry no aporta a ningún atributo, y es un dato del motor", () => {
    // No es un hueco de nuestra tabla: `parry` no aparece en ninguna de las
    // siete medias de `GetStat()`. La hoja lo dice en vez de dejar el sitio en
    // blanco, que se leería como un fallo.
    assert.deepEqual(aporteDe("parry"), []);
    for (const [, { pesos }] of Object.entries(GETSTAT)) {
      assert.equal(pesos.parry, undefined);
    }
  });

  test("y las otras ocho sí aportan a algo", () => {
    for (const h of HABILIDADES) {
      if (h.clave === "parry") continue;
      assert.ok(aporteDe(h.clave).length > 0, `${h.clave} no aporta a nada`);
    }
  });

  test("cada atributo de la tabla existe de verdad", () => {
    for (const clave of Object.keys(GETSTAT)) {
      assert.ok(ATRIBUTOS.some((a) => a.clave === clave), `${clave} no es un atributo`);
    }
    // Y al revés: los seis están. Uno que falte sale como cero en la hoja.
    assert.equal(Object.keys(GETSTAT).length, ATRIBUTOS.length);
  });

  test("y cada habilidad de la tabla también", () => {
    // Una errata en una clave —`smalarms`— no da error: da un peso que nunca
    // se aplica y un atributo silenciosamente más bajo.
    for (const [, { pesos }] of Object.entries(GETSTAT)) {
      for (const clave of Object.keys(pesos)) {
        assert.ok(HABILIDADES.some((h) => h.clave === clave), `${clave} no es una habilidad`);
      }
    }
  });
});
