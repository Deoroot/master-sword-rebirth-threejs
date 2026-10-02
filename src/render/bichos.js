// LOS BICHOS de Gate City: 69 NPC y monstruos, con su esqueleto y su animación.
//
// ── Desde el 28 este archivo NO SIMULA: dibuja ─────────────────────────────
//
// La decisión ya estaba fuera (`src/play/ia.js`, `src/play/paseo.js`) pero el
// ESTADO vivía aquí: la posición era `i.nodo.position` y el rumbo
// `i.nodo.rotation.y`. Con la posición dentro de un objeto de Three, la única
// máquina capaz de simular un goblin era un navegador con pantalla — y con dos
// jugadores eso son dos pueblos distintos, uno por pestaña.
//
// Ahora el estado está en `src/play/manada.js`, sin DOM, y esto es la vista:
// copia `donde`, `yaw`, la animación pedida y lo que se ve del cadáver a los
// nodos y a los mezcladores. Los métodos de siempre —`cazar`, `pasear`,
// `herir`, `matar`— siguen aquí y delegan, porque en una partida de un solo
// jugador el que simula sigue siendo el navegador; lo que cambia es que ya no
// es el único que puede.
//
// ── Por qué esto es un `SkinnedMesh` de fábrica y no un shader ─────────────
//
// Porque GoldSrc asigna **UN hueso por vértice y ningún peso**. Eso es
// exactamente lo que un `SkinnedMesh` de Three.js sabe hacer con `skinIndex` y
// un `skinWeight` de (1, 0, 0, 0): el esqueleto se compone en la tarjeta y el
// material sigue siendo de fábrica. Ni un `onBeforeCompile`.
//
// Y las claves de animación son las del propio archivo, no un remuestreo: el
// motor guarda un valor por fotograma e interpola lineal en posición y `slerp`
// en rotación entre dos consecutivos (`R_StudioCalcBones`), que es palabra por
// palabra lo que hace un `AnimationClip` con `VectorKeyframeTrack` y
// `QuaternionKeyframeTrack`.
//
// ── Los tres cambios de sitio, que es donde se equivoca uno ────────────────
//
//   los EJES    el `.mdl` viene en ejes de GoldSrc y en unidades. El cambio de
//               este proyecto —(x, y, z) de Three es (gx, gz, −gy)— es
//               exactamente un giro de −90° sobre X, así que va en un NODO y no
//               en los vértices: el esqueleto tiene que sufrir el mismo cambio
//               que la malla o el desollado sale torcido.
//   el RUMBO    el `angles[1]` de la entidad gira sobre +Z de GoldSrc, que tras
//               el cambio de ejes es +Y de Three, y con el mismo signo porque un
//               giro conserva la mano.
//   los NOMBRES de hueso pasan a `h0`, `h1`… y no son los del archivo. Una pista
//               de Three.js se parte por PUNTOS, así que un hueso llamado
//               `Bip01.L` rompe el enlace **sin dar error**: la pista no
//               encuentra a quién mover y el bicho se queda tieso.

import * as THREE from "three";
import { ESPACIO } from "./bsp_escena.js";
import { Manada, ESPERA_ENTRE_GOLPES, ESCALON, CADAVER } from "../play/manada.js";
import { Aparecedor, delCenso } from "../play/aparecer.js";

import { MAPA_POR_DEFECTO, baseDe } from "../play/mapa.js";
import { traerJson } from "../play/json.js";
const BASE_POR_DEFECTO = baseDe(MAPA_POR_DEFECTO);
// Se reexportan porque eran de aquí hasta el 28 y las miran las pruebas y las
// sondas. La definición está en `src/play/manada.js`, con su cita del motor.
export { ESPERA_ENTRE_GOLPES, ESCALON, CADAVER };

/**
 * Carga el censo de bichos y devuelve el grupo listo para la escena.
 *
 * `manifiesto` es `build/gatecity/bichos.json`, que escribe
 * `tools/bichos.mjs` — el que junta las tres fuentes: el `.bsp` dice dónde, el
 * `.script` dice qué modelo, y el `.mdl` dice cómo se ve y cómo se mueve.
 */
/**
 * UN modelo extraído: su malla, sus texturas y sus pistas de animación.
 *
 * Está fuera del bucle de los bichos porque el arma en la mano es el MISMO
 * formato —un `.mdl` con esqueleto y secuencias, extraído por el mismo
 * `tools/bicho.mjs`— y duplicar noventa líneas para cargarlo sería garantizar
 * que las dos copias se separen. Lo que cambia entre un goblin y una espada es
 * dónde se pone, no cómo se lee.
 */
export async function cargarModelo(carpeta, {
  base = BASE_POR_DEFECTO, cargador = null, pistasDesde = null,
} = {}) {
  const tex = cargador ?? new THREE.TextureLoader();
  const ficha = await traerJson(`${base}/${carpeta}/bicho.json`);
  if (!ficha) return null;
  // LAS PISTAS PUEDEN SER DE OTRO MODELO, y hay que hacerle caso.
  //
  // Dos `body` del mismo archivo comparten esqueleto y animación palabra por
  // palabra, así que `tools/bicho.mjs` las emite una vez y el segundo declara
  // `pistasDe`. En el cuerpo del personaje eso son 970 de los 1 020 KB de cada
  // género. Ignorarlo no da un modelo sin animar: **da una excepción** al
  // buscar un tramo que no está, y la excepción salta dentro de un `await` de
  // un manejador, o sea que aparece en la consola sin decir de quién es. Así
  // salió: la muñeca de la jugadora tiraba la página y las pruebas seguían en
  // verde porque el muñeco del jugador sí carga.
  let fuente = null;
  if (ficha.pistasDe) {
    const dir = pistasDesde ?? `${carpeta.split("/").slice(0, -1).join("/")}/${ficha.pistasDe}`;
    const otra = await traerJson(`${base}/${dir}/bicho.json`);
    if (!otra) throw new Error(`${carpeta}: sus pistas son de '${ficha.pistasDe}' y no está en ${dir}`);
    fuente = {
      bin: await fetch(`${base}/${dir}/${otra.bin.archivo}`).then((r) => r.arrayBuffer()),
      tramos: otra.bin.tramos,
    };
  }
  const { geo, texturas, clips } = await armarModelo(ficha, `${base}/${carpeta}`, tex, fuente);
  return { ficha, geo, texturas, clips };
}

export async function cargarBichos(manifiesto, { base = BASE_POR_DEFECTO } = {}) {
  if (!manifiesto?.colocados?.length) return null;
  const cargador = new THREE.TextureLoader();

  // --- 1. los modelos, una vez cada uno ------------------------------------
  const modelos = new Map();
  for (const m of manifiesto.modelos) {
    const ficha = await traerJson(`${base}/${m.carpeta}/bicho.json`);
    if (!ficha) throw new Error(`falta ${base}/${m.carpeta}/bicho.json: ese mapa no tiene bichos extraídos`);
    const { geo, texturas, clips } = await armarModelo(ficha, `${base}/${m.carpeta}`, cargador);
    modelos.set(m.clave, { ficha, geo, texturas, clips });
  }
  return montarBichos(manifiesto, modelos);
}

/**
 * La malla, las texturas y las pistas de un `bicho.json` ya leído.
 *
 * `fuenteDePistas` es el binario de OTRO modelo, para los que declaran
 * `pistasDe` — dos géneros del mismo archivo comparten la animación entera.
 */
async function armarModelo(ficha, dir, cargador, fuenteDePistas = null) {
  const bin = await fetch(`${dir}/${ficha.bin.archivo}`).then((r) => r.arrayBuffer());
  const T = ficha.bin.tramos;
  const arr = (k, Tipo) => new Tipo(bin, T[k].off, T[k].n);
  // Las pistas, del binario que toque: el suyo o el del modelo que las trae.
  const arrDe = (k, Tipo) => {
    const f = fuenteDePistas ?? { bin, tramos: T };
    const t = f.tramos[k];
    if (!t) throw new Error(`${ficha.nombre}: falta el tramo '${k}' en malla.bin`);
    return new Tipo(f.bin, t.off, t.n);
  };

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arr("positions", Float32Array), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(arr("normals", Float32Array), 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(arr("uvs", Float32Array), 2));
  // `skinIndex` va en cuatro huecos porque es lo que pide el formato de
  // Three.js; GoldSrc sólo llena el primero y los pesos son (1, 0, 0, 0).
  const skin = arr("skin", Uint16Array);
  const idx4 = new Uint16Array(skin.length * 4);
  const w4 = new Float32Array(skin.length * 4);
  for (let i = 0; i < skin.length; i++) { idx4[i * 4] = skin[i]; w4[i * 4] = 1; }
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(idx4, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(w4, 4));
  ficha.grupos.forEach((g, i) => geo.addGroup(g.start, g.count, i));
  geo.computeBoundingSphere();

  const texturas = new Map();
  const todasLasTexturas = new Set([
    ...ficha.grupos.map((g) => g.archivo),
    ...Object.values(ficha.texturasPorIndice ?? {}).map((t) => t.archivo),
  ].filter(Boolean));
  await Promise.all([...todasLasTexturas].map((a) =>
    new Promise((listo) => cargador.load(`${dir}/${a}`, (t) => {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.colorSpace = ESPACIO;
      // `flipY` A FALSO, y no es un gusto: es la fórmula del formato.
      //
      // Un `.mdl` guarda la UV de cada vértice en PÍXELES —`s` y `t` son
      // índices de columna y fila— y el motor los usa tal cual:
      //
      //     gl_studio.c  R_StudioDrawPoints()
      //       s = 1.0f / ptexture->width;  t = 1.0f / ptexture->height;
      //       ... pglTexCoord2f( ptricmds[2] * s, ptricmds[3] * t );
      //
      // sobre una textura subida con la fila 0 primero. O sea: `t = 0` ES la
      // fila 0 del archivo. Three.js con `flipY` a verdadero —su valor de
      // fábrica— voltea la imagen al subirla, así que `v = 0` pasa a ser la
      // ÚLTIMA fila y el modelo entero sale del revés en vertical.
      //
      // Medido en la geometría, sin mirar ni un píxel: en los vértices de la
      // cara que miran al frente, la correlación entre altura y `uv.v` es
      // **−1,000** en `npc_human1` y en `npc_human2_b2`; la frente cae en
      // `v ≈ 0,1` y el mentón en `v ≈ 0,9`. Con la frente en la fila de
      // arriba del dibujo —que es como está pintada—, `flipY` a verdadero le
      // ponía la boca arriba y los ojos abajo. Se vio jugando.
      //
      // El mundo NO lleva esto: `malla.js` emite `(s, −t)` y repite, así que
      // allí el volteo ya va en el dato. Aquí las UV son del archivo y se
      // recorta en vez de repetir, con lo que un `−v` se comería contra el
      // borde. La textura es el sitio donde se arregla.
      t.flipY = false;
      texturas.set(a, t);
      listo();
    }, undefined, () => listo()))
  ));

  // Las pistas se comparten entre instancias del mismo modelo: es lo que
  // permite poner diecinueve zombis sin diecinueve copias de su animación.
  const clips = new Map();
  for (const s of ficha.secuencias) {
    const p = arrDe(`sec${s.indice}_pos`, Float32Array);
    const r = arrDe(`sec${s.indice}_rot`, Float32Array);
    const n = s.fotogramas;
    const tiempos = new Float32Array(n);
    for (let f = 0; f < n; f++) tiempos[f] = f / (s.fps || 30);
    const pistas = [];
    for (let h = 0; h < ficha.huesos.length; h++) {
      pistas.push(new THREE.VectorKeyframeTrack(
        `h${h}.position`, tiempos, p.slice(h * n * 3, (h + 1) * n * 3)));
      pistas.push(new THREE.QuaternionKeyframeTrack(
        `h${h}.quaternion`, tiempos, r.slice(h * n * 4, (h + 1) * n * 4)));
    }
    // La duración es `n / fps` y no `(n − 1) / fps`: el último fotograma de un
    // ciclo no repite al primero, y cortando ahí la animación se queda quieta
    // un fotograma por vuelta — que se ve como una cojera.
    const clip = new THREE.AnimationClip(s.nombre, n / (s.fps || 30), pistas);
    // Y TAMBIEN POR INDICE, porque un arma nombra sus secuencias por
    // numero: `const ANIM_ATTACK1 2`. Sin esto, pedir la 2 no encuentra nada
    // y el arma se queda quieta al blandirla.
    clips.set(s.nombre.toLowerCase(), { clip, seq: s });
    clips.set(String(s.indice), { clip, seq: s });
  }
  return { geo, texturas, clips };
}

/**
 * Coloca las instancias del censo con los modelos ya cargados.
 *
 * Las instancias **son las de la manada**: este montaje no crea objetos nuevos,
 * le cuelga a cada bicho su nodo, su malla y su mezclador. Que sea el MISMO
 * objeto y no una copia es lo que permite que `bichosSolidos` siga
 * identificándolos con `q.instancia === i` y que el arnés de física los reciba
 * tal cual.
 */
function montarBichos(manifiesto, modelos) {
  const grupo = new THREE.Group();
  grupo.name = "bichos";
  const U = manifiesto.unidadesPorMetro ?? 39.37;
  // Las 16 áreas del mapa. Ver `aparecer(dt)` más abajo: sólo cuenta sin servidor.
  const aparecedor = new Aparecedor(delCenso(manifiesto));

  // La simulación primero: es la dueña del estado, y el dibujo se cuelga de
  // ella. Al contrario —crear nodos y luego preguntarles dónde están— es lo que
  // hacía este archivo hasta el 28.
  const manada = new Manada(manifiesto, {
    secuenciasPorClave: new Map([...modelos].map(([k, m]) => [k, m.ficha.secuencias])),
    // La MEDIDA primero: la caja de la cabecera del `.mdl` viene vacía en casi
    // todos estos modelos, y una de lado cero da un colisionador que no choca
    // con nada y no da ningún error.
    cajasPorClave: new Map([...modelos].map(([k, m]) => [k, m.ficha.cajaMedida ?? m.ficha.caja ?? null])),
  });

  for (const i of manada.instancias) {
    const c = i.ficha;
    const M = modelos.get(c.clave);
    if (!M) continue;

    // Un esqueleto por instancia: dos zombis en fotogramas distintos no pueden
    // compartirlo.
    const huesos = M.ficha.huesos.map((h, k) => {
      const b = new THREE.Bone();
      b.name = `h${k}`;
      b.userData.nombre = h.nombre;
      b.position.set(h.pos[0], h.pos[1], h.pos[2]);
      b.quaternion.set(h.quat[0], h.quat[1], h.quat[2], h.quat[3]);
      return b;
    });
    const raices = [];
    M.ficha.huesos.forEach((h, k) => {
      if (h.padre < 0) raices.push(huesos[k]);
      else huesos[h.padre].add(huesos[k]);
    });

    // El cambio de ejes y la escala, en un nodo: la malla y el esqueleto son
    // hermanos debajo, así que los dos sufren lo mismo.
    const ejes = new THREE.Group();
    ejes.rotation.x = -Math.PI / 2;
    ejes.scale.setScalar(1 / U);
    for (const r of raices) ejes.add(r);

    // La FAMILIA DE PIEL de esta instancia. `pieles[familia][skinref]` da el
    // índice de textura; si la familia no existe se cae a la 0, que es lo que
    // hace el motor.
    const familia = M.ficha.pieles?.[c.piel ?? 0] ? (c.piel ?? 0) : 0;
    const materiales = M.ficha.grupos.map((g) => {
      const iTex = M.ficha.pieles?.[familia]?.[g.skinref];
      const info = (iTex !== undefined && M.ficha.texturasPorIndice?.[iTex]) || g;
      const map = M.texturas.get(info.archivo) ?? M.texturas.get(g.archivo) ?? null;
      // `MeshBasicMaterial` con un COLOR, y no es un atajo: es lo que hace el
      // motor. `R_StudioSetupLighting` calcula UNA intensidad escalar y un color
      // normalizado, y multiplica el modelo entero — `lightvalues[k] =
      // lightcolor × lv`, `gl_studio.c` línea 2328. Un color de material es eso.
      const m = new THREE.MeshBasicMaterial({
        map,
        color: info.plenaLuz ? 0xffffff : new THREE.Color(
          (c.luz?.[0] ?? 0) / 255, (c.luz?.[1] ?? 0) / 255, (c.luz?.[2] ?? 0) / 255
        ),
      });
      if (info.aditivo) { m.blending = THREE.AdditiveBlending; m.depthWrite = false; m.transparent = true; }
      if (info.recortado) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
      m.userData.plenaLuz = Boolean(info.plenaLuz);
      return m;
    });

    const malla = new THREE.SkinnedMesh(M.geo, materiales);
    malla.frustumCulled = false;
    ejes.add(malla);

    const nodo = new THREE.Group();
    nodo.name = c.nombre ?? c.clase;
    nodo.position.set(i.donde[0], i.donde[1], i.donde[2]);
    nodo.rotation.y = i.yaw;
    // `scale` de la entidad. Los NPC no la traen nunca; dos de los adornos que
    // se mueven sí, y sin esto salen del tamaño equivocado — que en un farol de
    // pared pasa por «ese modelo es así».
    if (c.escala && c.escala !== 1) nodo.scale.setScalar(c.escala);
    nodo.add(ejes);
    grupo.add(nodo);

    // El esqueleto se ata DESPUÉS de colgar el nodo del árbol y de actualizar
    // las matrices: `new Skeleton()` calcula las inversas de enlace a partir de
    // `bone.matrixWorld`, y con las matrices sin actualizar las calcula de la
    // identidad — que no da error, da un bicho aplastado en el origen.
    nodo.updateMatrixWorld(true);
    malla.bind(new THREE.Skeleton(huesos), malla.matrixWorld);

    i.nodo = nodo;
    i.malla = malla;
    i.materiales = materiales;
    i.clips = M.clips;
    i.mezclador = new THREE.AnimationMixer(nodo);
    /** La generación de animación que YA está puesta en el mezclador. */
    i.puesta = -1;
    // `i.pon` se queda porque lo llaman de fuera (una sonda mide la animación
    // de un bicho a mano). Pide a la manada y aplica en el acto.
    i.pon = (nombre) => { const s = manada.pon(i, nombre); aplicarAnimacion(i); return s ? i.actual : null; };
  }

  /**
   * LA ANIMACIÓN PEDIDA, puesta en el mezclador.
   *
   * Se compara la GENERACIÓN y no el nombre, y hace falta: dos golpes seguidos
   * con la misma secuencia son dos golpes, y comparando nombres el segundo no
   * rebobinaría. La manada sube `gen` exactamente cuando el motor rebobinaría
   * (`pev->frame = 0`), o sea cuando la secuencia cambia o cuando no es de
   * bucle.
   */
  function aplicarAnimacion(i) {
    if (!i.mezclador || i.puesta === i.anim.gen) return false;
    i.puesta = i.anim.gen;
    const e = i.clips.get(String(i.anim.nombre ?? "").toLowerCase()) ?? [...i.clips.values()][0];
    if (!e) return false;
    if (i.actual) i.actual.clip = e.clip;
    i.mezclador.stopAllAction();
    const a = i.mezclador.clipAction(e.clip);
    const unaVez = i.anim.unaVez;
    a.setLoop(unaVez ? THREE.LoopOnce : THREE.LoopRepeat, unaVez ? 1 : Infinity);
    a.clampWhenFinished = unaVez;
    a.reset().play();
    // ── EL PARPADEO DEL 82: UN FOTOGRAMA EN LA POSE DE REPOSO ──────────────
    //
    // Lo reportó el usuario comparando con el original: «un extraño parpadeo
    // entre animaciones, parece que se resetean a su posición por defecto antes
    // de seguir a la siguiente». Y era literal.
    //
    // `stopAllAction()` deja el mezclador sin ninguna acción, y Three entonces
    // **devuelve el esqueleto a su pose de enlace**. Medido en el navegador
    // sobre el herrero de Edana: la firma de sus doce primeros huesos salta
    // 0,466 al pararlas, cuando el movimiento normal entre dos fotogramas es
    // 0,021 — veintidós veces.
    //
    // Y el orden lo pone en pantalla. `animar(dt)` hace:
    //
    //     manada.relojes(dt)
    //     mezclador.update(dt)      <- evalúa la animación VIEJA
    //     refrescar()               <- y aquí dentro se cambia de animación
    //
    // así que en el fotograma del cambio nadie vuelve a evaluar nada antes de
    // dibujar: se dibuja la pose de enlace. Al siguiente ya va bien, y por eso
    // dura menos de un parpadeo y es difícil de pillar.
    //
    // `update(0)` evalúa la nueva ANTES de volver, sin avanzar su reloj. Y es
    // lo que hace el motor: `SetAnimation` pone `pev->frame = 0` y el fotograma
    // 0 de la secuencia nueva es lo que se ve, no la pose del modelo sin
    // animar. GoldSrc tampoco mezcla entre secuencias — el salto seco sí es
    // fiel; el salto a la pose de enlace no lo era.
    i.mezclador.update(0);
    return true;
  }

  /**
   * COPIAR EL ESTADO A LOS NODOS. Es todo lo que hace la vista.
   *
   * Se llama después de simular (partida de uno) o después de aplicar una foto
   * (partida con servidor), y en los dos casos hace lo mismo — que es la prueba
   * de que la mudanza está bien hecha: al dibujo le da igual quién decidió.
   */
  function refrescar() {
    for (const i of manada.instancias) {
      if (!i.nodo) continue;
      // FUERA DEL MUNDO: 38 de los 69 bichos de Gate City son la ficha de un área
      // y no están al arrancar (`EF_NODRAW` y `SUB_Remove`,
      // msmonsterserver.cpp:228-232 y :129). El motor no los dibuja porque no
      // existen; aquí existen —el protocolo los manda por índice— así que se
      // esconden. Ver src/play/aparecer.js.
      if (i.dormido) { i.nodo.visible = false; continue; }
      if (!i.nodo.visible && !i.muerto) {
        // Y al volver hay que DESHACER el desvanecido del cadáver anterior, no
        // sólo encender el nodo: sin esto el bicho vuelve invisible con la vida
        // llena, y desde fuera se ve exactamente igual que no haber vuelto.
        i.nodo.visible = true;
        for (const m of i.materiales) { m.transparent = false; m.opacity = 1; }
      }
      i.nodo.position.set(i.donde[0], i.donde[1], i.donde[2]);
      i.nodo.rotation.y = i.yaw;
      aplicarAnimacion(i);
      // El cadáver que se desvanece: la manada lleva la cuenta y aquí sólo se
      // pinta. `renderamt` de 7 en 7 cada 0,1 s (combat.cpp:651).
      if (i.muerto && i.opacidad < 1) {
        for (const m of i.materiales) { m.transparent = true; m.opacity = i.opacidad; }
        if (i.opacidad <= 0) i.nodo.visible = false;
      }
    }
  }

  return {
    grupo, manada, modelos,
    instancias: manada.instancias,
    vivos: () => manada.vivos(),
    n: manada.n,
    triangulos: [...modelos.values()].reduce((a, m) => a + m.ficha.triangulos, 0),
    refrescar,
    /**
     * Avanza todos los relojes: los de la simulación y los mezcladores.
     *
     * Los mezcladores son de aquí y los otros no, y por eso la partida con
     * servidor usa `dibujar` en vez de esto: allí quien lleva los relojes de la
     * manada es el servidor, y correrlos otra vez en el navegador sería volver a
     * tener dos verdades.
     */
    animar(dt) {
      manada.relojes(dt);
      for (const i of manada.instancias) i.mezclador?.update(dt);
      refrescar();
    },
    /** Sólo dibujar: los mezcladores y los nodos. El estado lo pone otro. */
    dibujar(dt) {
      for (const i of manada.instancias) i.mezclador?.update(dt);
      refrescar();
    },
    /**
     * LAS ÁREAS DE APARICIÓN, para la partida SIN servidor.
     *
     * Con servidor esto no se llama: allí quien saca los bichos es la `Fauna` y
     * aquí sólo se pinta lo que llega por el cable (`d: 1` en la foto). Jugando
     * en local hace falta o el pueblo sale con los 38 monstruos de pie al entrar,
     * que es lo que hacía hasta el 39.
     *
     * Devuelve los ids que han cambiado de estado, porque los cilindros los lleva
     * `main.js` y tiene que cuadrarlos.
     */
    aparecer(dt, { disparar = null } = {}) {
      const cambian = [];
      for (const s of aparecedor.tic(dt)) {
        if (s.que !== "aparece") {
          // `FireTargets` (el 68): a las áreas **y** al mapa. Hasta el 68 esto
          // sólo llamaba a `aparecedor.disparar`, y bastaba en Gate City porque
          // el único `fireallperish` del mapa apunta a otra área; el corral de
          // Edana apunta a un `mstrig_multi` y a dos `trigger_relay`, que son del
          // `.bsp`, así que la cadena de las tres oleadas moría en la primera.
          // Ver el mismo arreglo en `src/red/fauna.js`, `_fireTargets`.
          if (s.dispara) { aparecedor.disparar(s.dispara); disparar?.(s.dispara); }
          continue;
        }
        const i = manada.de(s.id);
        if (!i) continue;
        manada.revivir(i);
        i.dormido = false;
        i.avisadoAlArea = false;
        cambian.push(s.id);
      }
      // Las muertes, por estado y no por sucesos: ver el comentario en fauna.js,
      // donde leerlas de `sucesos` costó un monstruo que volvía atravesable.
      for (const i of manada.instancias) {
        if (!i.muerto || i.avisadoAlArea) continue;
        i.avisadoAlArea = true;
        aparecedor.muerto(i.id);
        // El `killtarget` DEL MONSTRUO (el 68): no mata, dispara
        // (msmonsterserver.cpp:2568-2569). Va aquí, en el camino de la muerte, y
        // por eso se dispara en cada muerte y no sólo al agotar las vidas — que es
        // lo que hace el `perishtarget`, y son cosas distintas. En Edana es el
        // jefe jabalí avisando al viejo del huerto de que ya está hecho.
        if (i.ficha?.alMorir) disparar?.(i.ficha.alMorir);
      }
      for (const i of manada.instancias) if (i.dormido && !cambian.includes(i.id)) cambian.push(i.id);
      return cambian;
    },
    aparecedor,
    /** Colocar los bichos donde diga el servidor. */
    aplicar(lista) { manada.aplicar(lista); },
    herir(i, dano, opciones) { return manada.herir(i, dano, opciones); },
    deUnaVez(i, nombre) { const r = manada.deUnaVez(i, nombre); aplicarAnimacion(i); return r; },
    avisar(i, quien, opciones) { return manada.avisar(i, quien, opciones); },
    matar(i, opciones) { const r = manada.matar(i, opciones); aplicarAnimacion(i); return r; },
    pasear(dt, arnes, filtro) { manada.pasear(dt, arnes, filtro); refrescar(); },
    cazar(dt, arnes) { manada.cazar(dt, arnes); refrescar(); },
    avanzarHacia(i, dt, arnes) { const r = manada.avanzarHacia(i, dt, arnes); refrescar(); return r; },
    /**
     * La LUZ DINÁMICA sobre los bichos, que es `R_StudioSetupLighting` otra vez.
     *
     * El motor no ilumina un modelo sólo con el luxel del suelo: recorre las
     * `dlight` y les suma `dl->color × (radio − distancia) / 256`
     * (`gl_studio.c`, líneas 1442-1468). Nuestro glow ES una dlight, así que
     * esto no es un efecto añadido: es la parte del camino que faltaba, y es lo
     * que hace que un zombi en un rincón negro se vea al acercarse.
     */
    alumbrar(posicion, { radio = 0, color = [1, 1, 1] } = {}) {
      // EN UNIDADES DE GOLDSRC, no en metros. El `add / 256` del motor está
      // calibrado para radios de doscientas a seiscientas unidades; hecho en
      // metros, un glow de 6 m a 2,5 m de distancia aporta 3,5/256 = 0,014, o
      // sea el uno por ciento de lo que debe. Se veía como «la luz dinámica no
      // hace nada», que es un fallo silencioso con pinta de ajuste flojo.
      const radioU = radio * U;
      for (const i of manada.instancias) {
        if (!i.nodo) continue;
        const add = Math.max(0, radioU - i.nodo.position.distanceTo(posicion) * U);
        const l = i.ficha.luz ?? [0, 0, 0];
        for (const m of i.materiales) {
          if (m.userData.plenaLuz) continue;
          m.color.setRGB(
            Math.min(1, l[0] / 255 + (color[0] * add) / 256),
            Math.min(1, l[1] / 255 + (color[1] * add) / 256),
            Math.min(1, l[2] / 255 + (color[2] * add) / 256)
          );
        }
      }
    },
  };
}
