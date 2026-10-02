// LAS SEIS CADENAS DE LA CONSOLA DE SUCESOS, contra el mod y letra por letra.
//
// El usuario reportó que el HUD de eventos tenía texto inventado y lo tenía: ver
// la tabla de la cabecera de `src/play/mensajesdecombate.js`.
//
// POR QUÉ LOS TEXTOS VAN ESCRITOS A MANO AQUÍ. Es la regla del 75: cuando el
// valor ES la regla, se escribe con su cita al lado y no se compara contra la
// constante que lo produce. Allí, `o.pos[2]` contra `-ADELANTE` seguía verde con
// `ADELANTE = 0`, porque los dos lados se rompían juntos. Aquí sería peor: una
// prueba que armara el esperado con `textoDeDano` pasaría con cualquier formato,
// que es exactamente el fallo que se viene a cerrar.
//
// Así que cada `assert.equal` de abajo lleva una cadena transcrita del mod. Si
// alguien cambia el formato, estas pruebas se ponen rojas — y eso es lo que se
// quiere, porque el formato no es una decisión nuestra.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ELEMENTOS, SIN_ELEMENTO, ENGRISH, elementoDe, textoDeDano,
  corcheteDeResistencia, golpeAsestado, falloAsestado, paradaDelObjetivo,
  golpeRecibido, falloRecibido, parryDelJugador,
} from "../src/play/mensajesdecombate.js";

test("los mensajes de combate son los del mod, no los nuestros", async (t) => {
  await t.test("`szDamage` es «%.1f%s damage.»: un decimal, elemento y PUNTO", () => {
    // giattack.cpp:1898
    //   UTIL_VarArgs("%.1f%s damage.", Damage.flDamage, element_code)
    assert.equal(textoDeDano(3.44, "slash"), "3.4 slash damage.");
    assert.equal(textoDeDano(10, "fire"), "10.0 fire damage.");
    // Un decimal, no dos: `%.1f`.
    assert.equal(textoDeDano(0.449, "cold"), "0.4 cold damage.");
  });

  await t.test("en un FALLO `szDamage` es la cadena vacía, no «0 damage»", () => {
    // El ternario de giattack.cpp:1898 pone `""` cuando `!Damage.AttackHit`.
    assert.equal(textoDeDano(7, "slash", false), "");
  });

  await t.test("el espacio del elemento va DENTRO del elemento", () => {
    // `strncpy(element_code, " fire", …)` — giattack.cpp:1872. Por eso un tipo
    // que no casa no deja un hueco de más.
    assert.equal(elementoDe("fire"), " fire");
    assert.equal(elementoDe(""), "");
    assert.equal(textoDeDano(3, null), "3.0 damage.");
    assert.ok(!textoDeDano(3, null).includes("  "), "un hueco de más sin elemento");
  });

  await t.test("empareja por PREFIJO, como el `starts_with` del motor", () => {
    // giattack.cpp:1871 y siguientes son `dtype_code.starts_with("fire")`.
    assert.equal(elementoDe("holy_fire"), " holy");   // gana el prefijo, no «fire»
    assert.equal(elementoDe("SLASH"), " slash");      // `.toLowerCase()`
  });

  await t.test("los trece elementos que el mod sabe nombrar, y en su orden", () => {
    // giattack.cpp:1871-1896, trece `else if` encadenados.
    assert.deepEqual([...ELEMENTOS], [
      "fire", "cold", "lightning", "poison", "acid", "slash", "blunt", "pierce",
      "magic", "holy", "dark", "apostle", "earth",
    ]);
  });

  await t.test("y los tipos que los guiones usan y el mod NO sabe nombrar", () => {
    // `stun` lo declaran 56 `takedmg` y no tiene rama de `element_code`, así que
    // sale sin elemento. No es un hueco nuestro: es del mod.
    for (const t of SIN_ELEMENTO) {
      assert.equal(elementoDe(t), "", `${t} no debería tener elemento`);
      assert.ok(!ELEMENTOS.includes(t));
    }
    assert.equal(textoDeDano(3, "stun"), "3.0 damage.");
  });

  await t.test("`tdm_engrish` sin resistencia es UN ESPACIO, no vacío", () => {
    // `msstring tdm_engrish = " "` — giattack.cpp:1922. De ahí los dos espacios
    // del final del mensaje, que son del mod y se portan.
    assert.equal(ENGRISH, " ");
    assert.equal(corcheteDeResistencia(1), " ");
    assert.equal(corcheteDeResistencia(undefined), " ");
    assert.equal(corcheteDeResistencia(NaN), " ");
  });

  await t.test("el corchete TRUNCA hacia cero, como el `int()` de C", () => {
    // giattack.cpp:1925-1932. (1 − 0,81) · 100 = 18,999…, y `int(...)` da 18.
    // Redondear daría 19, que es el número que un puerto escribe sin pensar.
    assert.equal(corcheteDeResistencia(0.81), "[18% resistant]");
    assert.equal(corcheteDeResistencia(0.5), "[50% resistant]");
    assert.equal(corcheteDeResistencia(1.5), "[50% vulnerable]");
    assert.equal(corcheteDeResistencia(2), "[100% vulnerable]");
  });

  await t.test("le pegas a algo: «Hit %s: %s %s»", () => {
    // giattack.cpp:1954. Los dos espacios del final son `tdm_engrish`.
    assert.equal(
      golpeAsestado({ nombre: "Giant Rat", dano: 3.4, tipo: "slash" }),
      "Hit Giant Rat: 3.4 slash damage.  ",
    );
  });

  await t.test("y el crítico va DETRÁS, no delante: «CRIT! (%i/%i)»", () => {
    // giattack.cpp:1952, con `iAccuracyRoll` y `(int)Damage.flCritThreshold`.
    // Nosotros poníamos «CRITICAL! » como prefijo, que no existe.
    assert.equal(
      golpeAsestado({ nombre: "Boar", dano: 12, tipo: "blunt", critico: true, tirada: 97, umbral: 95 }),
      "Hit Boar: 12.0 blunt damage.   CRIT! (97/95)",
    );
  });

  await t.test("fallas: «Missed %s.», sin cifras y con punto", () => {
    // giattack.cpp:1965. El mod ESCONDE las tiradas a propósito, con su
    // comentario: «hiding to obfuscate otherwise weird high-roll misses».
    // «You missed: too far» era nuestra, y además decía el motivo.
    assert.equal(falloAsestado("Giant Rat"), "Missed Giant Rat.");
    assert.ok(!falloAsestado("Giant Rat").includes(":"));
  });

  await t.test("te lo paran: el sujeto es EL OBJETIVO, no tú", () => {
    // giattack.cpp:1970 — `"%s parries the attack!"`.
    assert.equal(paradaDelObjetivo("Spider"), "Spider parries the attack!");
  });

  await t.test("te pegan: «%s hits you: %s %s», con el elemento dentro", () => {
    // giattack.cpp:1994. Antes poníamos «Giant Rat hits you: 3.4 damage», sin
    // elemento, sin punto y sin el hueco del corchete.
    assert.equal(
      golpeRecibido({ nombre: "Giant Rat", dano: 3.4, tipo: "pierce" }),
      "Giant Rat hits you: 3.4 pierce damage.  ",
    );
  });

  await t.test("te fallan: «%s misses you.»", () => {
    // giattack.cpp:2000.
    assert.equal(falloRecibido("Giant Rat"), "Giant Rat misses you.");
  });

  await t.test("lo paras tú: la frase del GUION, con las dos tiradas", () => {
    // `playermessage ent_me You parry the attack! ( PARRY_ROLL vs. ACCU_ROLL )`
    // — player/player_main.script:324. El camino normal es el guion horneado
    // (prueba del 65); esto es el respaldo, que antes decía «You parried the
    // blow!» — la frase que el 65 descubrió que era NUESTRA y que sobrevivió
    // veinte experimentos a su propia corrección.
    assert.equal(parryDelJugador(31, 12), "You parry the attack! ( 31 vs. 12 )");
    assert.ok(!parryDelJugador(31, 12).includes("blow"));
  });

  await t.test("y el corchete entra en el mensaje cuando hay resistencia", () => {
    // El día que se lea `takedmg`, este es el sitio por donde sale. Con
    // modificador 1 —lo de hoy— sale el espacio, que es el caso del mod sin
    // resistencia y no un valor de reposo: está dicho en el archivo.
    assert.equal(
      golpeRecibido({ nombre: "Boar Boss", dano: 8, tipo: "slash", modificador: 0.81 }),
      "Boar Boss hits you: 8.0 slash damage. [18% resistant]",
    );
  });

  await t.test("ninguna de las seis cadenas inventadas sobrevive", () => {
    // El control que mira al pasado: si alguien vuelve a meter una de éstas,
    // esta prueba lo dice. Son las que el usuario vio en pantalla.
    const todas = [
      golpeAsestado({ nombre: "X", dano: 1, tipo: "slash" }),
      golpeAsestado({ nombre: "X", dano: 1, tipo: "slash", critico: true, tirada: 99, umbral: 95 }),
      falloAsestado("X"), paradaDelObjetivo("X"),
      golpeRecibido({ nombre: "X", dano: 1, tipo: "slash" }), falloRecibido("X"),
      parryDelJugador(1, 2),
    ].join(" | ");
    for (const inventada of [
      "damage to", "CRITICAL!", "left", "flees", "You killed", "experience",
      "You missed", "parried the blow", "You are out of", "it flinches",
    ]) {
      assert.ok(!todas.includes(inventada), `volvió lo inventado: ${inventada}`);
    }
  });
});
