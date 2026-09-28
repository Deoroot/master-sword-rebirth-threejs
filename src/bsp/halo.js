// El halo de las lámparas: un sustituto GENERADO, no extraído. Código y
// contenido nuestros.
//
// ── Por qué existe ──────────────────────────────────────────────────────────
//
// Porque quien jugó el mapa dijo esto, y es la mitad de un diagnóstico correcto:
// «me parece que es porque las lámparas no están emitiendo luz, las antorchas
// parece que sí».
//
// La luz de las lámparas SÍ está horneada. El mapa declara
// `info_texlights: pi_lantern 255 255 128 100`, o sea que el compilador sabía que
// esa textura era una luz, y el brillo del lump cae con la distancia igual que
// debe: **50 sobre 255 a un metro de la lámpara contra 24 de fondo**. Así que no
// falta luz.
//
// Lo que faltaba es lo que se VE. El mapa pone **23 `env_glow`** —`rendermode 5`,
// aditivo, `rendercolor 255 255 128`— clavados en las lámparas, y un `env_glow`
// es precisamente el halo: la mancha suave que hace que una lámpara parezca estar
// emitiendo en vez de estar pintada de amarillo. Las antorchas se salvaron por lo
// mismo al revés: su `Fire1.spr` sí está en la carpeta, así que su fuente se ve y
// la de las lámparas no.
//
// ── Y por qué GENERADO y no leído ───────────────────────────────────────────
//
// Porque `sprites/glow01.spr` **no está en `../MSC/`**. Se buscó: la carpeta
// tiene 118 sprites y ése no es uno de ellos, porque es un fichero del Half-Life
// base y el mod lo hereda de la instalación. O sea que no hay nada que leer.
//
// Y la regla de la sesión es «ningún asset entra sin licencia al lado». Un
// degradado radial no es de nadie: son doce líneas de aritmética y sale de aquí,
// no de un archivo de Valve. Así que esto NO es una copia con otro nombre — es el
// mismo trato que ya tiene el cielo `nature1`, cuyos seis `.tga` tampoco se
// pueden redistribuir y se sustituyen por los nuestros.
//
// Lo que se pierde al sustituirlo hay que decirlo: el halo de Valve tiene un
// dibujo concreto y éste no lo reproduce. Reproduce su PAPEL.

/** El tamaño del halo, en píxeles. 64 es el del sprite original de GoldSrc. */
export const LADO = 64;

/**
 * El NÚCLEO lleno, en fracción del radio, y el exponente de la caída.
 *
 * Los dos salen de MEDIR el halo de una lámpara en una captura del juego, no de
 * elegirlos. El perfil radial de la captura, quitado el fondo y normalizado:
 *
 *     r      0    0,08  0,17  0,25  0,33  0,42  0,50  0,58  0,67  0,75  0,83
 *     juego  1,00 0,65  0,77  0,58  0,40  0,36  0,32  0,21  0,10  0,13  0,07
 *     (1−r)^1,5  1,00 0,88  0,76  0,65  0,55  0,44  0,35  0,27  0,19  0,13  0,07
 *
 * O sea: **exponente 1,5, no 2.** Y un núcleo lleno, que es la otra mitad: con
 * `(1−r)²` el valor 255 sólo se toca en el píxel exacto del centro, y promediado
 * por el mipmap sobre los seis píxeles que ocupa una lámpara a diez metros el
 * halo aportaba 55 en vez de los 100 que permite su `renderamt`.
 *
 * Esa era la diferencia entera detrás de «todavía parece que no funciona la luz
 * de las lámparas», dicho tres veces: el punto más claro del juego en esa calle
 * llega a **186 sobre 255** y el nuestro no pasaba de **72**.
 */
export const NUCLEO = 0.22;
export const CAIDA = 1.5;

/**
 * Un halo radial aditivo, en RGBA.
 *
 * Blanco, con el perfil en los tres canales: el tinte lo pone `rendercolor` de la
 * entidad, que en las 23 de este mapa es `255 255 128` — el mismo blanco de vela
 * que tiene el resto del mapa. Horneando el color aquí, cambiar la entidad no
 * cambiaría nada.
 */
export function halo(lado = LADO) {
  const rgba = new Uint8Array(lado * lado * 4);
  const c = (lado - 1) / 2;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const r = Math.hypot(x - c, y - c) / c;
      const t = r <= NUCLEO ? 1 : Math.max(0, (1 - r) / (1 - NUCLEO));
      const v = r >= 1 ? 0 : Math.round(255 * Math.pow(t, CAIDA));
      const i = (y * lado + x) * 4;
      // En aditivo lo que aporta es el COLOR, no el alfa: el material suma
      // `color × alfa`, así que el perfil va en los tres canales y el alfa se
      // queda a 255. Con el perfil sólo en el alfa, un halo aditivo sale como un
      // cuadrado blanco — el mismo fallo que tenían los carteles de fuego antes
      // de leer su cabecera.
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return { rgba, ancho: lado, alto: lado, cuadros: 1, anchoCuadro: lado, altoCuadro: lado };
}

/**
 * Los sustitutos que sabemos generar, por nombre de fichero `.spr`.
 *
 * Es una lista corta a propósito. Un `.spr` que falte y no esté aquí se sigue
 * contando como que falta, porque inventar un sustituto para cualquier cosa que
 * falte convierte «faltan 58 carteles» en «no falta nada» sin haber hecho nada.
 */
export const SUSTITUTOS = {
  "glow01.spr": {
    generar: halo,
    // El tamaño en unidades de GoldSrc del sprite original, para que el halo
    // ocupe lo que ocupaba. `scale 1` en la entidad y 64 px de lado con la escala
    // de 1 px = 1 unidad que usa GoldSrc en los sprites `paralelo`.
    ancho: 64,
    alto: 64,
    mezcla: "aditivo",
    orientacion: "paralelo",
    porque: "no está en ../MSC/ (es del Half-Life base); degradado radial nuestro",
  },
};
