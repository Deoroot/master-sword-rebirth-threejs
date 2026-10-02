// Composición del menú (57). Interpretación propia de la referencia de Finér.
// La escala se establece con el terreno, el acceso y la fábrica de piedra.
// El intento anterior y sus mediciones siguen en doc/TORRE_54.md.
export const ALTO_TORRE = 260;
export const ANCHO_BASE = 110;
export const UN_HOMBRE = 1.75;
export const TORRE_EN = Object.freeze({ x: 26, z: -120 });
// Dirección desde la escena HACIA la abertura del cielo, compartida por todos
// los materiales. El observador ve las caras opuestas a esta luz de contraluz.
export const LUZ_DEL_MENU = Object.freeze({
  direccion: Object.freeze([-.24, .68, -.69]),
  directa: Object.freeze([1, .96, .80]),
  ambiente: Object.freeze([.060, .075, .090]),
});
// Presupuesto propio de la escena del menú; no hereda el de Gate City/Edana.
// Las muestras se limitan además a los formatos que admite la GPU.
export const CALIDAD_MENU = Object.freeze({
  muestras: 4,
  mapaSombras: 2048,
  pasosNubes: 64,
});
export const TRAMOS = Object.freeze([
  { y: 0, lado: 52 }, { y: 6, lado: 50 },
  { y: 105, lado: 48 }, { y: 106, lado: 49.4 },
  { y: 108, lado: 49.4 }, { y: 109, lado: 48 },
  { y: 142, lado: 47.5 }, { y: 144, lado: 48.5 },
].map(t=>Object.freeze({y:t.y*ALTO_TORRE/150,lado:t.lado*ANCHO_BASE/52})));
export const ALMENA = Object.freeze({ desde: ALTO_TORRE*144/150, alto: ALTO_TORRE*6/150,
  paso: ANCHO_BASE*6/52, hueco: ANCHO_BASE*2.5/52, grueso: 4 });
// Las aspilleras dan escala sin convertir la fachada en una retícula luminosa.
export const ASPILLERAS = Object.freeze([
  { x: -19, y: 45 }, { x: 17, y: 124 }, { x: -12, y: 215 },
]);
export const CAMARA_TORRE = Object.freeze({ fov: 48.5, cerca: 0.5, lejos: 6000 });
// En ventanas estrechas se conserva el campo horizontal mínimo del encuadre.
export function fovDeLaTorre(aspecto) {
  return 2 * Math.atan(Math.tan(CAMARA_TORRE.fov * Math.PI / 360)
    * Math.max(1, 1.25 / Math.max(.35, aspecto))) * 180 / Math.PI;
}
export const MIRADOR_DE_LA_TORRE = Object.freeze({
  nombre: "the watch over the valley",
  puntos: [
    [-105,68,326],[-102,68.5,325],[-99,69,324],[-96,69.5,323],[-93,70,322],
  ],
  mirar: [-22,99,-120],
  segundos: 160,
});
