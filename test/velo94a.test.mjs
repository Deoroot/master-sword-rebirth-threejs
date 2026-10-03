// EL 94. El velo rojo: la muerte, el reaparecer y el tinte de cada golpe, los
// tres por el mismo `clgame.fade`. `src/play/muerte.js`, doc/VELO_94.md.
//
// La curva sale de `V_FadeAlpha` (cl_game.c:472-505) y la porta el 93 en
// `efectospantalla.js`; lo que se prueba aquí es que la muerte la USE con los
// números del cable, y el orden en que el motor manda los dos velos al morir.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  DESVANECIDO, AL_REAPARECER, mensajeDeFundido, alfaDelDesvanecido,
  efectoDelGolpe, soltarGolpe, FFADE,
} from "../src/play/muerte.js";
import { fundidoAlLlegar, alfaDelFundido } from "../src/play/efectospantalla.js";
import { Sesion } from "../src/juego/sesion.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";

describe("el mensaje de la muerte, como lo empaqueta `UTIL_ScreenFadeBuild`", () => {
  test("0,2 y 15 segundos en 4.12 fijo, rojo y 128 (hl/util.cpp:1137-1144)", () => {
    const m = mensajeDeFundido(DESVANECIDO);
    assert.deepEqual(m, { que: "fundido", duracion: 819, aguante: 61440, banderas: 0, r: 255, g: 0, b: 0, a: 128 });
  });

  test("en el cliente: `fadeReset` a los 15 s y `fadeEnd` a los 15,2 (cl_parse.c:2101-2110)", () => {
    const sf = fundidoAlLlegar(mensajeDeFundido(DESVANECIDO), 100);
    assert.equal(sf.fadeReset, 115);
    assert.ok(Math.abs(sf.fadeEnd - 115.19995) < 1e-4, `${sf.fadeEnd}`);
    // El control positivo de la curva: a los 15,1 está a medias, no entera.
    const a = alfaDelFundido(sf, 115.1);
    assert.ok(a > 0 && a < 128, `${a}`);
  });

  test("`alfaDelDesvanecido` es esa misma curva, no una propia", () => {
    for (const t of [0, 0.1, 3, 14.99, 15.05, 15.1, 15.15, 15.3]) {
      const sf = fundidoAlLlegar(mensajeDeFundido(DESVANECIDO), 0);
      assert.equal(alfaDelDesvanecido(t), alfaDelFundido(sf, t), `t = ${t}`);
    }
  });
});

describe("al reaparecer, el fundido de alfa 0 de `Spawn` (player.cpp:2784)", () => {
  test("son sus seis números", () => {
    assert.deepEqual(AL_REAPARECER, { color: [0, 0, 0], duracion: 1, aguante: 0, alfa: 0, banderas: FFADE.IN });
  });

  test("y PISA el rojo: después de él el alfa es 0 aunque el aguante de la muerte siga", () => {
    // Mueres en t=0 y vuelves a los 5: el velo de la muerte seguiría entero
    // diez segundos más, pero hay UN `clgame.fade` y lo sustituye el de alfa 0.
    let sf = fundidoAlLlegar(mensajeDeFundido(DESVANECIDO), 0);
    assert.equal(alfaDelFundido(sf, 5), 128, "control: sin reaparecer seguiría rojo");
    sf = fundidoAlLlegar(mensajeDeFundido(AL_REAPARECER), 5);
    assert.equal(alfaDelFundido(sf, 5), 0);
    assert.equal(alfaDelFundido(sf, 5.5), 0);
  });
});

describe("el tinte de un golpe, `TakeDamageEffect` (player.cpp:537-550)", () => {
  test("proporcional a la parte de la vida: 5 de 50 son 25, la mitad son 127", () => {
    assert.equal(efectoDelGolpe(5, 50).alfa, 25);
    assert.equal(efectoDelGolpe(25, 50).alfa, 127);
    assert.equal(efectoDelGolpe(50, 50).alfa, 255);
  });

  test("un segundo de bajada y medio de aguante: entero hasta 0,5 s, cero a los 1,5", () => {
    const e = efectoDelGolpe(10, 40);
    assert.deepEqual(e.fundido, { color: [255, 0, 0], duracion: 1, aguante: 0.5, alfa: 63, banderas: FFADE.IN });
    const sf = fundidoAlLlegar(e.mensaje, 0);
    assert.equal(alfaDelFundido(sf, 0.4), 63);
    const medio = alfaDelFundido(sf, 1.0);
    assert.ok(medio > 25 && medio < 40, `a mitad de la bajada, ~31: ${medio}`);
    assert.equal(alfaDelFundido(sf, 1.6), 0);
  });

  test("con 0,5 o menos no se manda el fundido, pero el empujón sí", () => {
    const e = efectoDelGolpe(0.5, 1);
    assert.equal(e.fundido, null);
    assert.equal(e.mensaje, null);
    assert.equal(e.alfa, 127);
    assert.ok(e.golpe.some((v) => v !== 0));
  });

  test("muerto o sin daño, nada", () => {
    assert.equal(efectoDelGolpe(0, 50), null);
    assert.equal(efectoDelGolpe(10, 50, { vivo: false }), null);
  });

  test("el alfa pasa por `WRITE_BYTE`: más de la vida entera da la vuelta", () => {
    // 60/50·255 = 306 → 306 & 0xff = 50. No se ve nunca: ese golpe te mata.
    assert.equal(efectoDelGolpe(60, 50).mensaje.a, 50);
  });

  test("el empujón: ±α/4 por ½, ⅒ y ⅕ en cabeceo, giro y alabeo", () => {
    const e = efectoDelGolpe(20, 51, { azar: () => 1 });   // alfa 100, flPunch 25
    assert.deepEqual(e.golpe, [12.5, 2.5, 5]);
  });
});

describe("el empujón se suelta, `PM_DropPunchAngle` (pm_shared.cpp:3023-3031)", () => {
  test("diez grados por segundo más la mitad de lo que quede", () => {
    // 4° en una décima: 4 − (10 + 2)·0,1 = 2,8.
    const g = soltarGolpe([4, 0, 0], 0.1);
    assert.ok(Math.abs(g[0] - 2.8) < 1e-9, `${g[0]}`);
    // Y conserva la dirección.
    const h = soltarGolpe([3, 0, 4], 0.1);  // largo 5 → 5 − 12,5·0,1 = 3,75
    assert.ok(Math.abs(h[0] - 2.25) < 1e-9 && Math.abs(h[2] - 3) < 1e-9, `${h}`);
  });

  test("y no se pasa de cero", () => {
    assert.deepEqual(soltarGolpe([1, 0, 0], 1), [0, 0, 0]);
  });
});

describe("por donde entra el juego: la `Sesion`", () => {
  async function conPersonaje() {
    const almacen = new AlmacenMemoria();
    const s = new Sesion({ almacen, aparicion: {
      mapa: "gatecity",
      nacimiento: { nombre: "templo", escena: [0, 0, 0], luz: 0 },
      reaparicion: { nombre: "templo", escena: [0, 0, 0], luz: 0 },
    } });
    await s.arrancar();
    const p = await s.crear({ nombre: "Prueba" });
    await s.entrar(p.id);
    return s;
  }

  test("el golpe mortal avisa `dano` ANTES de `muerte`, con el daño pedido entero", async () => {
    // Ése es el orden del motor: `TakeDamageEffect` (msmonsterserver.cpp:2369)
    // antes que `GiveHP` (:2394) y `Killed`. El tinte sale y la muerte lo pisa.
    const s = await conPersonaje();
    const orden = [];
    s.al("dano", (e) => orden.push(["dano", e.pedido, e.cantidad]));
    s.al("muerte", () => orden.push(["muerte"]));
    const vida = s.personaje.vida;
    s.danar(vida + 100, { porQue: "prueba" });
    assert.deepEqual(orden, [["dano", vida + 100, vida], ["muerte"]]);
  });
});
