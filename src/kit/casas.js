// El catalogo de casas de Corinth.
//
// Una casa es una descripcion, no una lista de coordenadas: cuantas celdas, que
// muro, que tejado, donde la puerta. Las coordenadas las calcula planHouse.
//
// El catalogo vive aparte del plano y aparte del visor porque lo leen los tres:
// el visor del navegador, el sacador de capturas y las pruebas de Node. Si cada
// uno tuviera su copia, la casa que se mira y la casa que se comprueba dejarian
// de ser la misma casa sin que nadie se entere.
//
// Sobre el estilo, que es lo que hay que decidir mirando: en Corinth la gente
// vive de lo que se saca del agujero, asi que el pueblo no es prospero ni es
// ruina. Las casas son de paja y entramado; la teja roja es de las pocas que
// tienen dinero, y la piedra es de la guarnicion. Eso se elige aqui, en una
// linea por casa, y se puede cambiar sin tocar geometria.

import { planHouse } from "./house.js";

export const CASAS = {
  // La primera. Una celda, una planta, lo mas simple que sigue siendo una casa:
  // si esto tiene juntas, todo lo demas las tendra.
  "casa-simple": {
    titulo: "Casa simple — 1 celda, paja",
    nota: "Una celda. La casa del que baja al agujero y no vuelve rico.",
    spec: {
      ancho: 1,
      fondo: 1,
      plantas: 1,
      muro: "plaster_wall",
      tejado: "roof_straw",
      remate: "roof_straw_end",
      puerta: { pieza: "door_wood", cara: "sur", u: 0.5 },
      ventanas: [
        { cara: "este", u: 0.5, altura: 1.35 },
        { cara: "oeste", u: 0.5, altura: 1.35 },
      ],
    },
  },

  // Dos celdas de ancho: la cumbrera va en X, asi que ensanchar es justo lo que
  // este kit hace bien. Es la casa corriente del pueblo.
  "casa-larga": {
    titulo: "Casa larga — 2 celdas, paja",
    nota: "Zócalo de piedra contra la humedad del río. La casa corriente.",
    spec: {
      ancho: 2,
      fondo: 1,
      plantas: 1,
      muro: "plaster_wall_stone_base",
      tejado: "roof_straw",
      remate: "roof_straw_end",
      puerta: { pieza: "door_wood", cara: "sur", u: 0.3 },
      ventanas: [
        { cara: "sur", u: 0.7, altura: 1.35 },
        { cara: "norte", u: 0.5, altura: 1.35 },
        { cara: "este", u: 0.5, altura: 1.35 },
      ],
    },
  },

  // Dos plantas. La silueta medieval de verdad, y la que dira si apilar cascaras
  // deja junta a los 3 m.
  "casa-alta": {
    titulo: "Casa alta — 2 celdas, 2 plantas, teja",
    nota: "Teja en vez de paja: aquí vive quien compra lo que otros sacan.",
    spec: {
      ancho: 2,
      fondo: 1,
      plantas: 2,
      muro: "plaster_wall_alt",
      tejado: "roof_red",
      remate: "roof_red_end",
      puerta: { pieza: "door_wood_rounded", cara: "sur", u: 0.25 },
      ventanas: [
        { cara: "sur", u: 0.6, altura: 1.35 },
        { cara: "sur", u: 0.25, altura: 4.35 },
        { cara: "sur", u: 0.6, altura: 4.35 },
        { cara: "norte", u: 0.5, altura: 1.35 },
        { cara: "este", u: 0.5, altura: 4.35 },
      ],
    },
  },

  // ── lo de la orilla este: piedra, y por construccion ────────────────────────
  //
  // Estas tres estaban marcadas con trazo discontinuo en el plano -«el kit no
  // puede dar esto»- y resulta que si puede, sin modelar nada. Lo que faltaba no
  // era geometria: era darse cuenta de que `stone_square` es un muro como
  // cualquier otro y que por tanto la guarnicion cabe en el MISMO planHouse que
  // las casas. Entrar por el catalogo y no por codigo aparte es lo que hace que
  // saquen ficha de capturas y que el colocador no tenga un segundo camino.
  //
  // Sigue faltando lo que de verdad no esta en el pack -el yunque, la manivela
  // del torno, una empalizada-, y eso se declara en `falta` y no se disimula.

  // La torre del puesto de guardia. Una celda y dos plantas: lo que hace torre a
  // una torre es la proporcion, no el tamano, y con el kit eso es apilar dos
  // cascaras sobre cuatro metros de lado. Tejado a cuatro aguas porque un faldon
  // a dos aguas sobre una planta cuadrada deja los dos costados al aire.
  "torre-guardia": {
    titulo: "Torre de guardia — 1 celda, 2 plantas, piedra",
    nota: "Piedra y reja. Desde aquí se ve quién cruza el puente.",
    spec: {
      ancho: 1,
      fondo: 1,
      plantas: 2,
      muro: "stone_square",
      tejado: "roof_red_square",
      remate: null,
      puerta: { pieza: "door_wood_metal_grate", cara: "sur", u: 0.5 },
      ventanas: [
        { cara: "sur", u: 0.5, altura: 4.35 },
        { cara: "este", u: 0.5, altura: 4.35 },
        { cara: "oeste", u: 0.5, altura: 4.35 },
        { cara: "norte", u: 0.5, altura: 4.35 },
      ],
    },
  },

  // El cuartel. Dos celdas, una planta, y la unica puerta con herraje: es el
  // edificio del que sale el permiso para bajar.
  "cuartel": {
    titulo: "Cuartel — 2 celdas, piedra",
    nota: "Donde se firma el permiso. Sin él no se baja.",
    spec: {
      ancho: 2,
      fondo: 1,
      plantas: 1,
      muro: "stone_square",
      tejado: "roof_red",
      remate: "roof_red_end",
      puerta: { pieza: "door_wood_metal_grate", cara: "sur", u: 0.3 },
      ventanas: [
        { cara: "sur", u: 0.7, altura: 1.35 },
        { cara: "este", u: 0.5, altura: 1.35 },
        { cara: "oeste", u: 0.5, altura: 1.35 },
      ],
    },
  },

  // La herreria. El cuerpo es de piedra como el resto de la orilla este, y lo
  // que la hace herreria y no almacen es la chimenea gorda: ocho metros contra
  // una pared de tres. Es la pieza que cuenta la historia desde el otro lado del
  // rio, que es desde donde se va a ver.
  "herreria": {
    titulo: "Herrería — 2 celdas, piedra y fragua",
    nota: "La chimenea de 8 m es la fragua. Le compran los que bajan.",
    spec: {
      ancho: 2,
      fondo: 1,
      plantas: 1,
      muro: "stone_square",
      tejado: "roof_straw",
      remate: "roof_straw_end",
      puerta: { pieza: "door_wood", cara: "sur", u: 0.25 },
      ventanas: [{ cara: "sur", u: 0.6, altura: 1.35 }],
      extras: [
        // Pegada al costado este, no a la fachada: una chimenea delante de la
        // puerta tapa la puerta.
        { pieza: "chimney_large", cara: "este", u: 0.5, altura: 0 },
        { pieza: "barrel", cara: "sur", u: 0.85, altura: 0 },
      ],
    },
  },
};

export function casa(nombre) {
  const entrada = CASAS[nombre];
  if (!entrada) throw new Error(`casa desconocida: ${nombre}`);
  return { ...entrada, ...planHouse(entrada.spec), nombre };
}
