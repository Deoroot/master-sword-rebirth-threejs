// CUÁNTO CORRE ESTE PERSONAJE, en un solo sitio.
//
// Existe por un fallo que las pruebas cazaron en cuanto el servidor empezó a
// sacar la velocidad del personaje: el cliente seguía usando la del perfil —160
// unidades, la de alguien sin nada— y el servidor la de verdad. La diferencia
// era de un 3 %, o sea **seis centímetros de error a los dos segundos**, y no se
// veía como un fallo de velocidad: se veía como una reconciliación que corrige
// siempre un poco, que es exactamente lo que no debe pasar.
//
// Así que la regla vive aquí y la usan los dos lados. Es la misma idea que ya
// vale para la física: no hay una velocidad del cliente y otra del servidor,
// hay UNA, y si alguien quiere cambiarla tiene que cambiarla para los dos.
//
// (`src/main.js` hace esta misma cuenta en su bucle porque además cobra aguante
// al saltar y pinta la barra. Lo que manda es que las dos den lo mismo, y eso
// lo fija una prueba.)

import { atributosDe, derivadas } from "../juego/stats.js";
import { carga as cargaDe } from "../juego/inventario.js";
import { loQueLleva } from "../juego/personaje.js";
import {
  velocidadAndando, velocidadCorriendo, ajustarVelocidad, puedeCorrer,
  AGUANTE_CORRIENDO, regeneracionDeAguante,
} from "../play/movimiento.js";
import { BOTON } from "./protocolo.js";
import { velocidadConTrabas, trabarIntencion } from "../play/trabas.js";

/** Lo que un personaje puede: agilidad, fuerza, lo que carga y su aguante. */
export function vitalesDe(personaje, porId = null) {
  if (!personaje) return { agilidad: 0, fuerza: 0, peso: 0, carga: 25, aguanteMax: 3 };
  const atr = atributosDe(personaje.habilidades);
  const d = derivadas(atr);
  let peso = 0;
  // El peso hace falta de verdad: `velocidadAndando` lo mira. Sin el catálogo
  // de objetos, el servidor creería que todo el mundo va ligero.
  if (porId) {
    // EL 97: con lo de las manos, igual que `vitalesDelPersonaje` del navegador:
    // desde la versión 2 del registro lo empuñado no está en `objetos`, y si los
    // dos lados no pesan lo mismo andan a velocidades distintas.
    const fichas = loQueLleva(personaje).map((o) => ({ ...o, ficha: porId.get(o.id) ?? null }));
    peso = cargaDe(fichas, d.carga).peso;
  }
  return { agilidad: atr.agility ?? 0, fuerza: atr.strength ?? 0, peso, carga: d.carga, aguanteMax: d.aguanteMax };
}

/**
 * La velocidad máxima de ESTE paso, y el aguante que queda.
 *
 * `estado` se modifica: lleva `corriendo`, `aguante` y `rapidezAnterior`, que
 * son memoria de un paso al siguiente. Devuelve las unidades por segundo.
 */
export function velocidadDelPaso(estado, { orden, dt, vitales, rapidez = 0 }) {
  const v = vitales;
  if (!(estado.aguante > 0)) estado.aguante = v.aguanteMax;
  estado.corriendo = puedeCorrer({
    corriendoYa: estado.corriendo,
    pulsaCorrer: (orden.botones & BOTON.CORRER) !== 0,
    adelante: orden.adelante,
    aguante: estado.aguante,
    agachado: (orden.botones & BOTON.AGACHAR) !== 0,
    atacando: (orden.botones & BOTON.ATACAR) !== 0,
    rapidez,
    rapidezAnterior: estado.rapidezAnterior ?? 0,
  });
  estado.rapidezAnterior = rapidez;
  let maxima = velocidadAndando(v);
  if (estado.corriendo) {
    maxima = velocidadCorriendo(maxima, { aguante: estado.aguante, aguanteMax: v.aguanteMax });
    estado.aguante = Math.max(0, estado.aguante - AGUANTE_CORRIENDO * dt);
  } else {
    estado.aguante = Math.min(v.aguanteMax, estado.aguante + regeneracionDeAguante(v.fuerza) * dt);
  }
  return ajustarVelocidad(maxima, {});
}

/**
 * EL 99: UNA ORDEN, CON LO QUE LE QUITAN LAS TRABAS Y LA VELOCIDAD CON QUE SE
 * CORRE. Es el cuerpo de `Partida._simular` (el 98) sacado a una función, y
 * la usa el cliente de Node al predecir. El servidor TODAVÍA lleva su copia en
 * línea: en el 99 otra sesión estaba editando `_simular` (el atasco) y no se
 * tocó; lo que obliga a que las dos den lo mismo es `test/red99.test.mjs`, que
 * corre el cliente contra una `Partida` de verdad con trabas. Pasar
 * `_simular` a esto es un pendiente.
 *
 * `t` son las trabas (`src/play/trabas.js`) o `null`. Devuelve la intención
 * trabada `q` —lo que obedece `step`—, la orden con los botones trabados
 * (`orden`) y `{maxima, tope}`: la velocidad de
 * `velocidadDelPaso` pasada por `pev->maxspeed` (clplayer.cpp:306-307 como
 * porcentaje, pm_shared.cpp:3050-3053 como tope).
 *
 * `estado` se modifica como en `velocidadDelPaso` (aguante y trote): una orden
 * se cobra UNA vez. Rehacerla tras una corrección no pasa por aquí (ver
 * `ClienteDeRed._correr`).
 */
export function correrOrden(estado, o, { dt, vitales, rapidez = 0, trabas = null }) {
  const b = o.botones ?? 0;
  const q = trabarIntencion({
    adelante: o.adelante, lado: o.lado,
    correr: (b & BOTON.CORRER) !== 0, saltar: (b & BOTON.SALTAR) !== 0,
    agachar: (b & BOTON.AGACHAR) !== 0, atacar: (b & BOTON.ATACAR) !== 0,
    cubrir: (b & BOTON.ATACAR2) !== 0,
  }, trabas);
  // La orden trabada, para la cuenta del aguante (`velocidadDelPaso` mira el
  // botón de correr y el de atacar): una orden de trotar con NORUN no trota.
  const ot = {
    ...o, adelante: q.adelante, lado: q.lado,
    botones: (b & ~(BOTON.CORRER | BOTON.SALTAR | BOTON.AGACHAR | BOTON.ATACAR | BOTON.ATACAR2))
      | (q.correr ? BOTON.CORRER : 0) | (q.saltar ? BOTON.SALTAR : 0)
      | (q.agachar ? BOTON.AGACHAR : 0) | (q.atacar ? BOTON.ATACAR : 0)
      | (q.cubrir ? BOTON.ATACAR2 : 0),
  };
  const v = velocidadConTrabas(velocidadDelPaso(estado, { orden: ot, dt, vitales, rapidez }), trabas?.porcentaje ?? 0);
  return { q, orden: ot, maxima: v.maxima, tope: v.tope };
}
