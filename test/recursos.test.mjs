import test from "node:test";
import assert from "node:assert/strict";
import { BASE_COMUN, rutaComun } from "../src/play/recursos.js";
import { baseDe } from "../src/play/mapa.js";
import { Audio } from "../src/play/audio.js";

test("las rutas comunes no dependen del mapa ni salen de su carpeta", () => {
  assert.equal(rutaComun("cuerpos", "jugador/bicho.json"), `${BASE_COMUN}/cuerpos/jugador/bicho.json`);
  assert.notEqual(BASE_COMUN, baseDe("edana"));
  assert.notEqual(BASE_COMUN, baseDe("gatecity"));
  for (const ruta of ["../otro", "/otro", "C:\\otro", "x?y", "x#y"]) {
    assert.throws(() => rutaComun(ruta));
  }
});

test("el audio lee un catálogo por mapa y decodifica la misma muestra compartida", async (t) => {
  const peticiones = [];
  const muestra = new Uint8Array([12, 34]).buffer;
  t.mock.method(globalThis, "fetch", async (ruta) => {
    peticiones.push(ruta);
    if (ruta.endsWith("/sonido.json")) return new Response(JSON.stringify({ mapa: ruta.split("/")[1] }), {
      headers: { "content-type": "application/json" },
    });
    assert.equal(ruta, rutaComun("snd/player/paso.wav"));
    return new Response(muestra, { headers: { "content-type": "audio/wav" } });
  });
  let decodificados = 0;
  for (const mapa of ["gatecity", "edana"]) {
    const audio = new Audio({ base: baseDe(mapa) });
    audio.ctx = { async decodeAudioData(datos) {
      assert.deepEqual(new Uint8Array(datos), new Uint8Array(muestra));
      decodificados++;
      return { duration: 0.2 };
    } };
    assert.equal((await audio.cargar()).mapa, mapa);
    assert.equal((await audio.pedir("snd/player/paso.wav")).duration, 0.2);
    await audio.pedir("snd/player/paso.wav"); // La caché no vuelve a descargar.
  }
  assert.equal(decodificados, 2);
  assert.deepEqual(peticiones, [
    "build/gatecity/sonido.json", rutaComun("snd/player/paso.wav"),
    "build/edana/sonido.json", rutaComun("snd/player/paso.wav"),
  ]);
});
