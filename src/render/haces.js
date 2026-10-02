// LOS HACES: `env_beam`, y en Edana son las dos columnas de humo.
//
// 83 en 20 mapas, 2 en Edana, **0 en Gate City** — o sea la trampa del 50, y
// por eso esto no se podía escribir hasta que hubo un segundo mapa.
//
// ── QUÉ ES UN HAZ, Y NO ES UN MODELO ──────────────────────────────────────
//
// Es un `.spr` **estirado entre dos puntos**, y los dos puntos los nombra la
// entidad por `LightningStart` y `LightningEnd`. En Edana son cuatro
// `info_target` (`smoke1a`/`smoke1b`, `smoke2a`/`smoke2b`) y el horneado los
// resuelve a coordenadas; aquí llegan ya resueltos.
//
// ── CÓMO SE DIBUJA, QUE ES LO QUE DECIDE EL CÓDIGO DE ABAJO ───────────────
//
// `R_DrawSegs` (gl_beams.c:191-340) va de la fuente al destino poniendo pares
// de vértices a los lados, y el lado **no es un eje del mundo**: es
// perpendicular al haz Y a la vista.
//
//     static void R_BeamComputePerpendicular( const vec3_t vecBeamDelta, vec3_t pPerp )
//     {
//       VectorNormalize2( vecBeamDelta, vecBeamCenter );
//       CrossProduct( RI.vforward, vecBeamCenter, pPerp );
//       VectorNormalize( pPerp );
//     }                                           gl_beams.c:83-91
//
// O sea un producto vectorial de la dirección de la cámara por la del haz. Eso
// es un cartel con eje: gira alrededor de su propia línea para estar siempre de
// cara, y por eso **hay que recalcularlo cada fotograma** y no vale con montar
// un plano y dejarlo. Un plano fijo desaparece al mirarlo de canto.
//
// El ancho de cada lado sale de dos líneas que se cancelan a medias:
//
//     nextSeg.width = width * 2.0f;                        gl_beams.c:284
//     VectorMA( curSeg.pos, ( curSeg.width * 0.5f ), vAveNormal, vPoint1 );
//     VectorMA( curSeg.pos, (-curSeg.width * 0.5f ), vAveNormal, vPoint2 );
//                                                  gl_beams.c:309-310
//
// `width * 2` y luego `* 0.5` a cada lado, o sea **medio ancho = `width`**.
//
// Y `width` **no es el `BoltWidth` del mapa**: es su décima parte, y la décima
// no está en ningún `.cpp` sino en `assets/msr/delta.lst:231`, en el bloque
// `custom_entity_state_t` — `DEFINE_DELTA_POST( scale, DT_FLOAT, 8, 1.0, 0.1 )`.
// Está contado entero en `tools/gatecity.mjs`, donde se hornea. Aquí sólo se
// aplica, con su nombre: `DECIMA`.
//
// ── EL FUNDIDO, que es lo que convierte un palo en humo ──────────────────
//
//     if( FBitSet( flags, FBEAM_SHADEIN )) brightness = 0;
//     ...
//     else if( FBitSet( flags, FBEAM_SHADEIN )) brightness = fraction;
//                                            gl_beams.c:242-243 y 332-334
//
// `BEAM_FSHADEIN` arranca el brillo en 0 y lo sube con la fracción recorrida:
// el haz **nace invisible y se va viendo**. Las dos de Edana traen
// `spawnflags 129` = `SF_BEAM_STARTON | SF_BEAM_SHADEIN`, y sin esto la columna
// de humo sale cortada en seco por abajo como un tubo de PVC.
//
// Se hace con color por vértice y no con un degradado en la textura, porque es
// lo que hace el motor (`TriBrightness( brightness )` por vértice).
//
// ── LA TEXTURA CORRE, el haz no se mueve ────────────────────────────────
//
//     vLast = fmod( freq * speed, 1 );   con freq = speed * cl.time
//                                            gl_beams.c:221, :591
//
// O sea que la coordenada V avanza con el tiempo: **lo que sube es el dibujo,
// no la geometría**. `TextureScroll 5` en las dos de Edana.
//
// ── LO QUE NO SE PORTA, DICHO AQUÍ Y CONTADO ────────────────────────────
//
// 1. **El RUIDO** (`NoiseAmplitude`, y con él los segmentos intermedios y la
//    tabla `rgNoise`). Lo traen **59 de los 83** del juego, y **0 de los 2 de
//    Edana**: sin ruido el haz es un solo cuadrilátero recto, que es
//    exactamente lo que el motor dibuja cuando la amplitud es cero
//    (`if( scale != 0 )`, gl_beams.c:264). O sea que para Edana esto no es una
//    simplificación: es el caso. Para los otros 59 falta, y se dice.
// 2. **El haz que GOLPEA** (`StrikeThink`, el rayo con su `m_restrike`) y
//    `SF_BEAM_RANDOM`/`SF_BEAM_RING`. Las dos de Edana son `ServerSide()` —
//    permanentes— porque no traen `life`. De los 83, **63 traen `life`**, o sea
//    que la mayoría del juego son del otro tipo.
// 3. **El daño** (`DamageThink`, `pev->dmg`). Lo traen 20 de los 83 y 0 de los
//    de Edana.
// 4. **`SF_BEAM_SHADEOUT`**, que es el de arriba al revés. Se deja escrito
//    porque sale de la misma línea y no cuesta nada, pero no hay ninguno en los
//    mapas portados, así que **no está medido**.

import * as THREE from "three";

/**
 * La décima del `scale` en el delta de una entidad personalizada.
 * `assets/msr/delta.lst:231`. Ver la cabecera.
 */
export const DECIMA = 0.1;

/** `BEAM_FSHADEIN`/`FSHADEOUT` ya vienen resueltos del horneado como booleanos. */

/**
 * Monta los haces de un mapa.
 *
 * `fichas` es `malla.json` → `interactivas.haces`. Devuelve `null` si el mapa no
 * tiene ninguno, que es el caso de Gate City — y eso **se dice** en vez de
 * devolver un grupo vacío que recorrer: un bucle sobre cero elementos es el
 * mejor sitio para que viva una regla muerta (el 69).
 *
 * `texturaDe(archivo)` trae la tira de cuadros ya cargada; se inyecta para que
 * este módulo no sepa de dónde salen los PNG.
 */
export function montarHaces(fichas, { texturaDe, unidadesPorMetro = 39.37 } = {}) {
  const lista = (fichas ?? []).filter((h) => h.inicio && h.fin && h.textura);
  const sinPuntas = (fichas ?? []).length - lista.length;
  if (!lista.length) return { grupo: null, haces: [], n: 0, sinPuntas, animar: () => {} };

  const grupo = new THREE.Group();
  grupo.name = "haces";
  const haces = [];

  for (const h of lista) {
    const tex = texturaDe(h.textura.archivo);
    if (!tex) continue;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    // La V se repite: la textura CORRE a lo largo del haz y tiene que dar la
    // vuelta. Con `ClampToEdge` en la V, el desplazamiento estira el último
    // píxel y la columna se queda quieta con una banda.
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / h.textura.cuadros, 1);

    // Un cuadrilátero de dos triángulos. Las posiciones se reescriben cada
    // fotograma —el lado depende de la cámara— así que aquí sólo se reserva.
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(4 * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([
      // u: 0 y 1 a los lados, que es `pglTexCoord2f(0|1, texcoord)`.
      // v: 0 abajo y 1 arriba; el desplazamiento lo mueve el `offset`.
      0, 0, 1, 0, 0, 1, 1, 1,
    ]), 2));
    // El brillo por vértice, que es el `TriBrightness` del motor. Se escribe
    // aquí y no se toca más: el fundido no cambia con el tiempo.
    const col = new Float32Array(4 * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);

    // El tinte y el brillo del mapa. `renderamt` es 0..255 y `rendercolor` el
    // color; aquí el color va al material y el brillo a la opacidad, igual que
    // en los carteles. `CL_FxBlend(ent) / 255.0f` es el `blend` del motor
    // (gl_beams.c:1187).
    const [r, g, b] = h.color.map((v) => Math.max(0, Math.min(255, v)) / 255);
    const material = new THREE.MeshBasicMaterial({
      map: tex,
      // ADITIVO, y no es una elección nuestra: lo declara la cabecera del
      // propio `.spr`. `smoke.spr` dice `aditivo`, y el horneado lo trae en
      // `textura.mezcla`. En aditivo el negro no aporta nada, así que el humo
      // no necesita canal alfa y no hay que ordenar por profundidad.
      blending: h.textura.mezcla === "aditivo" ? THREE.AdditiveBlending : THREE.NormalBlending,
      // Un haz aditivo que escribe profundidad recorta lo que tiene detrás y
      // deja un rectángulo de vacío alrededor, igual que los carteles.
      depthWrite: false,
      transparent: true,
      opacity: Math.min(1, (h.brillo || 255) / 255),
      color: new THREE.Color(r || 1, g || 1, b || 1),
      vertexColors: true,
      side: THREE.DoubleSide,
      fog: true,
    });

    const malla = new THREE.Mesh(geo, material);
    malla.name = h.objetivo ?? "haz";
    // La caja de recorte no se puede calcular de una geometría que se reescribe
    // sola: sin esto, Three la recorta por la caja de cuando valía cero y el
    // haz desaparece según dónde esté la cámara.
    malla.frustumCulled = false;
    grupo.add(malla);

    // El fundido, escrito una vez. Los vértices 0 y 1 son el INICIO y el 2 y 3
    // el FIN, así que `BEAM_FSHADEIN` es «oscuro en el inicio».
    const brilloInicio = h.fundeEntrando ? 0 : 1;
    const brilloFin = h.fundeSaliendo ? 0 : 1;
    for (let i = 0; i < 2; i++) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = brilloInicio; }
    for (let i = 2; i < 4; i++) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = brilloFin; }
    geo.getAttribute("color").needsUpdate = true;

    haces.push({
      ficha: h, malla, geo, tex,
      inicio: new THREE.Vector3(...h.inicio.donde),
      fin: new THREE.Vector3(...h.fin.donde),
      // El medio ancho, en METROS de escena: `BoltWidth` por la décima del
      // delta, y partido por las unidades por metro. Ver la cabecera.
      medioAncho: (h.ancho * DECIMA) / unidadesPorMetro,
      cuadros: h.textura.cuadros,
      // `pev->framerate` y `TextureScroll`.
      porSegundo: h.fotogramas || 0,
      desplazamiento: h.desplazamiento || 0,
      // `arrancaEncendido`: sin `SF_BEAM_STARTON` y con nombre, el haz nace
      // apagado y lo enciende su `Use` (effects.cpp:474-483). Las dos de Edana
      // lo traen, así que nacen encendidas.
      visible: h.arrancaEncendido || !h.objetivo,
    });
    malla.visible = haces[haces.length - 1].visible;
  }

  const eje = new THREE.Vector3();
  const alaCamara = new THREE.Vector3();
  const lado = new THREE.Vector3();

  /**
   * Un fotograma: recolocar los cuatro vértices de cara a la cámara y correr la
   * textura. `t` en segundos.
   */
  function animar(t, camara) {
    for (const h of haces) {
      if (!h.visible) continue;
      // El lado, como `R_BeamComputePerpendicular`: la dirección de la VISTA
      // por la del haz. El motor usa `RI.vforward`, que es hacia dónde mira la
      // cámara, no la línea que la une con el haz.
      eje.subVectors(h.fin, h.inicio).normalize();
      camara.getWorldDirection(alaCamara);
      lado.crossVectors(alaCamara, eje);
      // Si el haz y la vista son paralelos el producto es cero y no hay lado:
      // el motor normaliza igual y saca un vector basura. Aquí se deja el del
      // fotograma anterior, que es lo que no parpadea.
      if (lado.lengthSq() > 1e-8) lado.normalize().multiplyScalar(h.medioAncho);
      const p = h.geo.getAttribute("position");
      p.setXYZ(0, h.inicio.x - lado.x, h.inicio.y - lado.y, h.inicio.z - lado.z);
      p.setXYZ(1, h.inicio.x + lado.x, h.inicio.y + lado.y, h.inicio.z + lado.z);
      p.setXYZ(2, h.fin.x - lado.x, h.fin.y - lado.y, h.fin.z - lado.z);
      p.setXYZ(3, h.fin.x + lado.x, h.fin.y + lado.y, h.fin.z + lado.z);
      p.needsUpdate = true;
      // La textura corre: `vLast = fmod( freq * speed, 1 )` con
      // `freq = speed * cl.time`, o sea el cuadrado de la velocidad por el
      // tiempo. Se copia la fórmula del motor y no «velocidad por tiempo».
      if (h.desplazamiento) {
        h.tex.offset.y = -((h.desplazamiento * h.desplazamiento * t) % 1);
      }
      // Y el cuadro, que es otra cosa: `SetFrame`/`framerate`.
      if (h.porSegundo && h.cuadros > 1) {
        h.tex.offset.x = Math.floor((t * h.porSegundo) % h.cuadros) / h.cuadros;
      }
    }
  }

  return { grupo, haces, n: haces.length, sinPuntas, animar };
}
