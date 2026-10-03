// LA SALA DEL 88: el tubo antes que la mazmorra.
//
// Lo más pequeño que prueba el camino entero de un mapa NUESTRO: escrito desde
// código (`tools/mapagen.mjs`), compilado con VHLT (`npm run contenido`),
// cargado en Xash3D con `map sala88` y aquí con `?map=sala88`.
//
// Dos salas de 384 x 384 x 192 unidades unidas por un pasillo de 768 x 128 x
// 128. Se nace en la del oeste y la rata está en la del este.
//
// ── POR QUÉ DOS SALAS Y NO UNA (lo primero que se aprendió) ─────────────────
//
// La primera versión era UNA sala de 512, con la rata en la esquina opuesta.
// `npm run mapa:aparicion` se negó a hornearla: el `ms_player_begin` tenía «1
// hostil a menos de 15 m» y el mapa no trae sacerdote de templo con el que
// buscar otro sitio (tools/aparicion.mjs, `reglasDuras`). El control tenía
// razón y el mapa no: en 512 unidades —13 m— no cabe la distancia. La rata va
// a la otra sala, a 29 m, y de paso hlvis tiene algo que calcular, porque una
// sala sola es una hoja y no hay visibilidad que medir.
//
// Las texturas son de `ms_generic.wad`, de MSR: esto sólo las NOMBRA; el `.bsp`
// compilado las lleva dentro y por eso vive en `build/`.
//
// Las claves de las entidades están copiadas de las de Edana, que se compiló con
// la misma familia de compilador («ZHLT v3.4 VL34»):
//   - `ms_player_begin` es donde nace un personaje nuevo, y `ms_player_spawn`
//     donde reaparece (ver `src/juego/sesion.js`);
//   - la rata es un `msmonster_giantrat` con `defscriptfile monsters/giantrat`,
//     SIN `spawnarea`: en Edana las tres llevan `templerats`, que las deja
//     esperando a un `msarea_monsterspawn`, y aquí no hay ninguno.

import { interior } from "../tools/mapagen.mjs";

export const nombre = "sala88";

/** Los `.wad` que nombra el mapa. hlcsg mete sus texturas en el `.bsp` (`-wadinclude`). */
export const wads = ["ms_generic"];

const OESTE = { min: [-768, -192, 0], max: [-384, 192, 192] };
const PASILLO = { min: [-384, -64, 0], max: [384, 64, 128] };
const ESTE = { min: [384, -192, 0], max: [768, 192, 192] };

export const brushes = interior([OESTE, PASILLO, ESTE], 16, {
  suelo: "ms_floor01",
  techo: "ms_wood01",
  pared: "ms_stnwall01",
});

// Lo que el jugador LEE va en inglés, como toda la interfaz (CLAUDE.md, arriba
// del todo). La primera compilación lo llevaba en español y lo enseñó Xash al
// entrar: `maptitle` y `mapdesc` salen en pantalla cuando el mapa no trae un
// `G_MAP_NAME` en su `map_startup.script` (ver build/<mapa>/mapa.json, `fuentes`).
export const mundo = {
  maptitle: "Test Hall 88",
  mapdesc: "Two rooms, a corridor and a rat.",
};

const luz = (x, y, z, fuerza) => ({ classname: "light", origin: `${x} ${y} ${z}`, _light: `255 230 180 ${fuerza}` });

export const entidades = [
  luz(-576, -96, 160, 200), luz(-576, 96, 160, 200),
  luz(0, 0, 100, 120),
  luz(576, -96, 160, 200), luz(576, 96, 160, 200),
  // El origen de un jugador es el centro de su caja de 72 de alto: 36 sobre el suelo.
  { classname: "ms_player_begin", origin: "-672 0 36", angles: "0 0 0" },
  { classname: "ms_player_spawn", origin: "-672 96 36", angles: "0 0 0" },
  // El de un monstruo son sus pies (msmonsterserver.cpp:244); un poco por encima, y cae.
  { classname: "msmonster_giantrat", origin: "640 0 8", angles: "0 180 0",
    defscriptfile: "monsters/giantrat", spawnchance: "100" },
];
