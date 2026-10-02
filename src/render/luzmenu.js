// Una iluminación para piedra, valle y cielo. Se comparten los objetos uniform,
// no sólo sus valores iniciales, para que un cambio llegue a todos a la vez.
import * as THREE from "three";
import { LUZ_DEL_MENU } from "../play/torre.js";

export function uniformesDeLuz(config = LUZ_DEL_MENU) {
  return {
    direccionLuz: { value: new THREE.Vector3(...config.direccion).normalize() },
    luzDirecta: { value: new THREE.Color(...config.directa) },
    luzAmbiente: { value: new THREE.Color(...config.ambiente) },
  };
}
