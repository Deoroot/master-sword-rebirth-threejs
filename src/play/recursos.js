// Los recursos del juego no pertenecen al mapa que se está jugando.
export const BASE_COMUN = "build/msr";

/** Ruta relativa a la raíz web, igual para todos los mapas. */
export function rutaComun(...partes) {
  const trozos = partes.flat().map(String);
  for (const p of trozos) {
    if (!p || p.includes("..") || p.startsWith("/") || /[\\:?#]/.test(p)) {
      throw new Error(`Ruta de recurso común inválida: ${p}`);
    }
  }
  return [BASE_COMUN, ...trozos].join("/");
}
