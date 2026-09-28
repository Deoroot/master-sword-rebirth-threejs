// EL CUERPO DEL PERSONAJE EN PANTALLA: la tarjeta, la creación y el inventario.
//
// Contesta a lo que se pidió en la revisión de los mockups: «en el juego real no
// hay gráficos autogenerados, todo se hace con texto o con el modelo del
// personaje actual». Esto es el modelo del personaje actual.
//
// ── Lo que es de Master Sword, y sale de su código, no de mirar capturas ────
//
//   el MODELO      `models/human/reference.mdl` (`MODEL_HUMAN_REF`), que es el
//                  que carga `CRenderChar::Init`. No `male1.mdl`: le faltan dos
//                  de las seis animaciones que esta pantalla pide por nombre.
//   el GÉNERO      un submodelo, no un archivo. `SetBody(0..3, 1)` para el
//                  hombre y `2` para la mujer. `tools/cuerpo.mjs` lo cuenta
//                  entero.
//   las SEIS       `attention` sin arma, `idle` con arma, `stretch` de vez en
//   ANIMACIONES    cuando, `jump` al señalar, `sitdown` si la ranura está
//                  vacía, `run` al subir. Salen de `global.script`, no del
//                  cliente: son datos del mod.
//   el GIRO        `m_Ent.angles.y = ViewMgr.Angles.y + 180`, o sea de frente.
//   el TIEMPO      `RANDOM_FLOAT(TIME_MINIDLE, TIME_MAXIDLE)` con 6 y 60
//                  segundos, y `stretch` vuelve a `attention` al acabar.
//
// ── Y lo que es nuestro, dicho aquí para que no se confunda ────────────────
//
//   EL ENCUADRE. En el original la figura ocupa el **24 % del alto** de la
//   pantalla: 72 unidades a escala 0,025 son 1,8 a 5 de distancia, y con
//   `default_fov 90` en 4:3 la vista mide 7,5 de alto. Eso es lo correcto
//   cuando tres personajes comparten la pantalla entera con el texto; en una
//   tarjeta de 132 px daría una figura de 43 px. Así que **se conserva la lente
//   y se cambia el recorte**: el ángulo que la figura subtiende en el original
//   —20,41°— se usa como campo VERTICAL de nuestra cámara, y la distancia se
//   calcula para que el marco llene la caja. La perspectiva es la misma; lo que
//   cambia es cuánto se ve alrededor.
//
//   Y el marco NO es la caja del archivo. Las de `reference.mdl` no describen
//   su propia malla —está medido en `tools/cuerpo.mjs`— así que `cuerpos.json`
//   trae uno calculado animando los vértices de las seis secuencias. Con el del
//   archivo, `jump` se saldría del cuadro sin dar ningún error.
//
//   UN SOLO `WebGLRenderer` PARA TODAS LAS RANURAS. Un navegador corta por unos
//   dieciséis contextos de WebGL y ya hay uno gastado en el mapa; cinco
//   retratos con el suyo es quedarse sin ninguno en la primera pestaña que se
//   abra al lado. Se dibuja en uno y se copia a un `canvas` de dos dimensiones
//   por ranura, que es lo que aguanta abrir el inventario con tres tarjetas ya
//   puestas.

import * as THREE from "three";
import { ESPACIO } from "./bsp_escena.js";

/** El ángulo vertical que la figura subtiende en el original, en grados. */
//
// 2·atan((72 × 0,025 / 2) / 5) = 20,41°. Se calcula y no se escribe para que
// cambiar el `encuadre` del manifiesto cambie esto con él.
export function campoDeVision({ escala, distancia }, altoDelModelo = 72) {
  return (2 * Math.atan((altoDelModelo * escala) / 2 / distancia) * 180) / Math.PI;
}

/** Los dos tiempos de `CRenderChar`, en segundos. */
export const ESPERA_TIC = [6, 60];

/**
 * Carga los dos cuerpos y devuelve con qué montar ranuras.
 *
 * `manifiesto` es `build/gatecity/cuerpos.json`, que escribe
 * `npm run cuerpo`.
 */
export async function cargarCuerpos(manifiesto, { base = "build/gatecity" } = {}) {
  const cargador = new THREE.TextureLoader();
  const generos = new Map();
  // Las pistas se comparten: el manifiesto dice cuál las trae, y la otra ficha
  // declara `pistasDe`. Emitirlas dos veces costaba 970 KB de los 1 020 de cada
  // género, en la pantalla que queremos que salga antes que el mapa.
  const binarios = new Map();
  const fichas = new Map();

  for (const [genero, g] of Object.entries(manifiesto.generos)) {
    const ficha = await fetch(`${base}/${g.carpeta}/bicho.json`).then((r) => r.json());
    const bin = await fetch(`${base}/${g.carpeta}/${ficha.bin.archivo}`).then((r) => r.arrayBuffer());
    fichas.set(genero, { ...g, ficha });
    binarios.set(g.clave, { bin, tramos: ficha.bin.tramos });
  }

  for (const [genero, { clave, ficha }] of fichas) {
    const mio = binarios.get(clave);
    const arr = (k, Tipo, fuente = mio) => {
      const t = fuente.tramos[k];
      if (!t) throw new Error(`${clave}: falta el tramo '${k}' en malla.bin`);
      return new Tipo(fuente.bin, t.off, t.n);
    };

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr("positions", Float32Array), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(arr("normals", Float32Array), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(arr("uvs", Float32Array), 2));
    const skin = arr("skin", Uint16Array);
    const idx4 = new Uint16Array(skin.length * 4);
    const w4 = new Float32Array(skin.length * 4);
    for (let i = 0; i < skin.length; i++) { idx4[i * 4] = skin[i]; w4[i * 4] = 1; }
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(idx4, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(w4, 4));
    ficha.grupos.forEach((g, i) => geo.addGroup(g.start, g.count, i));
    geo.computeBoundingSphere();

    // Las texturas, con el mismo `flipY` a falso que los bichos y por el mismo
    // motivo: un `.mdl` guarda la UV en píxeles con la fila 0 arriba.
    const texturas = new Map();
    const quiere = new Set([
      ...ficha.grupos.map((g) => g.archivo),
      ...Object.values(ficha.texturasPorIndice ?? {}).map((t) => t.archivo),
    ].filter(Boolean));
    await Promise.all([...quiere].map((a) => new Promise((listo) => {
      cargador.load(`${base}/${fichas.get(genero).carpeta}/${a}`, (t) => {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.colorSpace = ESPACIO;
        t.flipY = false;
        texturas.set(a, t);
        listo();
      }, undefined, () => listo());
    })));

    // Las pistas: las mías, o las del que el manifiesto diga.
    const fuente = ficha.pistasDe ? binarios.get(ficha.pistasDe) : mio;
    if (!fuente) throw new Error(`${clave}: sus pistas son de '${ficha.pistasDe}' y ese modelo no está cargado`);
    const clips = new Map();
    for (const s of ficha.secuencias) {
      const p = arr(`sec${s.indice}_pos`, Float32Array, fuente);
      const r = arr(`sec${s.indice}_rot`, Float32Array, fuente);
      const n = s.fotogramas;
      const tiempos = new Float32Array(n);
      for (let f = 0; f < n; f++) tiempos[f] = f / (s.fps || 30);
      const pistas = [];
      for (let h = 0; h < ficha.huesos.length; h++) {
        pistas.push(new THREE.VectorKeyframeTrack(`h${h}.position`, tiempos, p.slice(h * n * 3, (h + 1) * n * 3)));
        pistas.push(new THREE.QuaternionKeyframeTrack(`h${h}.quaternion`, tiempos, r.slice(h * n * 4, (h + 1) * n * 4)));
      }
      clips.set(s.nombre.toLowerCase(), {
        clip: new THREE.AnimationClip(s.nombre, n / (s.fps || 30), pistas),
        seq: s,
      });
    }
    generos.set(genero, { ficha, geo, texturas, clips, marco: fichas.get(genero).marco });
  }

  return {
    generos,
    animaciones: manifiesto.animaciones,
    encuadre: manifiesto.encuadre,
    triangulos: [...generos.values()].reduce((a, g) => a + g.ficha.triangulos, 0),
    /** Monta el visor. Uno por página, no uno por retrato. */
    visor(opciones) { return new Visor(this, opciones); },
  };
}

/**
 * EL VISOR: un `WebGLRenderer` y tantas ranuras como haga falta.
 *
 * Cada ranura es un `canvas` normal de la página; el visor dibuja en el suyo y
 * copia. `animar(dt)` mueve los relojes y repinta las visibles.
 */
class Visor {
  constructor(cuerpos, { pixelRatio = null } = {}) {
    this.cuerpos = cuerpos;
    this.ranuras = new Set();
    // `alpha` para que el retrato se recorte sobre el panel en vez de traerse un
    // fondo propio: el panel ya tiene el negro de Master Sword y meterle otro
    // rectángulo encima es justo lo que se quitó de los mockups.
    this.render = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.render.setClearColor(0x000000, 0);
    // LINEAL en la SALIDA, y `ESPACIO` sólo en las texturas. No son lo mismo y
    // confundirlos no da un color raro: no dibuja nada.
    //
    // `ESPACIO` es `NoColorSpace`, que es un valor válido para
    // `texture.colorSpace` —«este dato ya está como lo quiero»— y NO lo es para
    // `renderer.outputColorSpace`: `ColorManagement._getDrawingBufferColorSpace`
    // busca `this.spaces[""]` y explota con
    // «Cannot read properties of undefined (reading 'outputColorSpaceConfig')».
    // Lo escribí copiando de `bichos.js`, donde `ESPACIO` va a las texturas y
    // está bien. El retrato salía transparente, la excepción iba a la consola una
    // vez por fotograma y la página seguía funcionando. Lo cazó la sonda con
    // `getImageData`, que es la única comprobación que mira píxeles.
    this.render.outputColorSpace = THREE.LinearSRGBColorSpace;
    // Se topa a 2 porque esto son retratos de 132 px: a 3 se dibuja nueve veces
    // más por ranura para un cuadro que nadie va a acercar.
    this.pixelRatio = pixelRatio ?? Math.min(2, globalThis.devicePixelRatio || 1);
    this.render.setPixelRatio(this.pixelRatio);
    this.escena = new THREE.Scene();
    // La lente del original, CALCULADA de su encuadre y no escrita: 20,41°.
    this.camara = new THREE.PerspectiveCamera(campoDeVision(cuerpos.encuadre), 1, 1, 8000);
    this.ancho = 0;
    this.alto = 0;
  }

  /**
   * Una ranura. `lienzo` es el `<canvas>` de la página donde se copia.
   *
   * `animacion` acepta la clave del manifiesto (`sinArma`, `inactivo`…) o el
   * nombre crudo de la secuencia.
   */
  ranura(lienzo, { genero = "male", animacion = "sinArma", tic = true } = {}) {
    const r = new Ranura(this, lienzo, { genero, animacion, tic });
    this.ranuras.add(r);
    return r;
  }

  /** Repinta todas las ranuras vivas. `dt` en segundos. */
  animar(dt) {
    for (const r of this.ranuras) r._tic(dt);
    // El tamaño del lienzo compartido es el de la ranura más grande que haya, y
    // se ajusta una vez y no por ranura: cambiar el tamaño de un `WebGLRenderer`
    // reasigna sus búferes, y hacerlo cinco veces por fotograma se nota.
    let w = 0, h = 0;
    for (const r of this.ranuras) {
      if (!r.visible) continue;
      w = Math.max(w, r.lienzo.width);
      h = Math.max(h, r.lienzo.height);
    }
    if (!w || !h) return;
    if (w !== this.ancho || h !== this.alto) {
      this.ancho = w; this.alto = h;
      // `false` porque el lienzo del renderizador no está en la página: no hay
      // estilo que actualizar, y dejarlo a verdadero le mete un `width` en CSS.
      this.render.setSize(w / this.pixelRatio, h / this.pixelRatio, false);
    }
    for (const r of this.ranuras) r._pintar();
  }

  destruir() {
    for (const r of [...this.ranuras]) r.quitar();
    this.render.dispose();
  }
}

class Ranura {
  constructor(visor, lienzo, { genero, animacion, tic }) {
    this.visor = visor;
    this.lienzo = lienzo;
    this.ctx = lienzo.getContext("2d");
    this.conTic = tic;
    this.esperaTic = 0;
    this.volver = null;
    this.visible = true;
    this.nodo = new THREE.Group();
    this._montar(genero);
    this.animar(animacion);
    this._marco();
  }

  /** Construye la malla y el esqueleto de un género. */
  _montar(genero) {
    const G = this.visor.cuerpos.generos.get(genero);
    if (!G) throw new Error(`no hay cuerpo para el género '${genero}'`);
    this.genero = genero;
    this.G = G;
    this.nodo.clear();

    const huesos = G.ficha.huesos.map((h, i) => {
      const b = new THREE.Bone();
      // `h0`, `h1`… y no el nombre del archivo: una pista de Three.js se parte
      // por puntos, y estos huesos se llaman `Bip01 L Arm2`. Con el nombre
      // crudo la pista no encuentra a quién mover y la figura se queda tiesa,
      // sin error.
      b.name = `h${i}`;
      b.position.set(h.pos[0], h.pos[1], h.pos[2]);
      b.quaternion.set(h.quat[0], h.quat[1], h.quat[2], h.quat[3]);
      return b;
    });
    const raices = [];
    G.ficha.huesos.forEach((h, i) => {
      if (h.padre < 0) raices.push(huesos[i]);
      else huesos[h.padre].add(huesos[i]);
    });

    // El cambio de ejes, igual que en los bichos: GoldSrc es Z arriba. Aquí NO
    // se escala a metros — este visor trabaja en unidades del modelo, porque no
    // comparte escena con el mapa y convertir sería inventarse un metro para
    // una caja de 132 píxeles.
    const ejes = new THREE.Group();
    ejes.rotation.x = -Math.PI / 2;
    for (const b of raices) ejes.add(b);

    const materiales = G.ficha.grupos.map((g) => {
      const iTex = G.ficha.pieles?.[0]?.[g.skinref];
      const info = (iTex !== undefined && G.ficha.texturasPorIndice?.[iTex]) || g;
      const map = G.texturas.get(info.archivo) ?? G.texturas.get(g.archivo) ?? null;
      // `MeshBasicMaterial` blanco, que es lo que hace el motor a plena luz: un
      // `.mdl` de GoldSrc lleva la iluminación PINTADA en la textura. Un panel
      // no tiene mapa de luz del que sacar una intensidad, así que aquí no se
      // inventa ninguna.
      const m = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
      if (info.recortado) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
      return m;
    });

    const malla = new THREE.SkinnedMesh(G.geo, materiales);
    malla.frustumCulled = false;
    ejes.add(malla);
    this.nodo.add(ejes);

    // El esqueleto se ata DESPUÉS de actualizar las matrices: `new Skeleton()`
    // saca las inversas de enlace de `bone.matrixWorld`, y sin actualizar las
    // saca de la identidad — que no da error, da una figura aplastada.
    this.nodo.updateMatrixWorld(true);
    malla.bind(new THREE.Skeleton(huesos), malla.matrixWorld);

    this.malla = malla;
    this.mezclador = new THREE.AnimationMixer(this.nodo);
  }

  /** La cámara para esta ranura: misma lente que el original, otro recorte. */
  _marco() {
    const { marco } = this.G;
    const alto = marco.max[2] - marco.min[2];
    const ancho = marco.max[1] - marco.min[1];
    // Centro del marco en ejes de Three: (gx, gz, −gy).
    this.centro = new THREE.Vector3(
      (marco.min[0] + marco.max[0]) / 2,
      (marco.min[2] + marco.max[2]) / 2,
      -(marco.min[1] + marco.max[1]) / 2
    );
    this.marcoAlto = alto;
    this.marcoAncho = ancho;
  }

  /** Cambia de género sin perder la animación que estuviera puesta. */
  cambiarGenero(genero) {
    if (genero === this.genero) return;
    const puesta = this.puesta;
    this._montar(genero);
    this._marco();
    this.animar(puesta);
  }

  /**
   * Pone una animación. Acepta la clave del manifiesto o el nombre crudo.
   *
   * Una que el modelo no tenga cae en la secuencia 0, que es lo que hace el
   * motor — pero aquí además se queja, porque en esta pantalla las seis están
   * comprobadas en la extracción y una que falte es un fallo nuestro.
   */
  animar(nombre) {
    const { animaciones } = this.visor.cuerpos;
    const crudo = animaciones[nombre] ?? nombre;
    const e = this.G.clips.get(String(crudo).toLowerCase());
    if (!e) {
      console.warn(`cuerpo: no hay animación '${crudo}'; se queda con la que tenga`);
      return this;
    }
    this.puesta = nombre;
    this.mezclador.stopAllAction();
    const a = this.mezclador.clipAction(e.clip);
    a.setLoop(e.seq.bucle ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !e.seq.bucle;
    a.reset().play();
    this.accion = a;
    this.enBucle = Boolean(e.seq.bucle);
    return this;
  }

  /** Lo que hace `CRenderChar` al pasar el ratón por encima: saltar. */
  senalar(si = true) {
    if (si) this.animar("senalado");
    else this.animar(this.base ?? "sinArma");
    return this;
  }

  /** La animación a la que se vuelve cuando se acaba un `stretch` o un `jump`. */
  reposo(clave) {
    this.base = clave;
    return this.animar(clave);
  }

  mostrar(si = true) { this.visible = si; return this; }

  quitar() {
    this.visor.ranuras.delete(this);
    this.mezclador.stopAllAction();
    this.nodo.clear();
  }

  _tic(dt) {
    if (!this.visible) return;
    this.mezclador.update(dt);
    // Una animación que no hace bucle —`stretch`, `jump`— vuelve al reposo al
    // acabar, que es el `m_ReturnToAttention` del original.
    //
    // PERO NO SI EL REPOSO ES ELLA MISMA, y esa condición faltaba. Aquí las
    // posturas de reposo también son de un solo pase: `attention` y `sitdown` no
    // hacen bucle. Sin la condición, la animación se relanzaba al acabar — y
    // `sitdown` no es «estar sentado», es **la acción de sentarse**, que empieza
    // de pie. La ranura libre se sentaba, se levantaba de golpe y se volvía a
    // sentar cada 2,4 segundos, sin dar ningún error. Con la condición, se
    // sienta una vez y se queda ahí, que es lo que hace `clampWhenFinished` y lo
    // que hace el motor.
    const base = this.base ?? "sinArma";
    if (!this.enBucle && this.puesta !== base && this.accion &&
        this.accion.time >= this.accion.getClip().duration - 1e-3) {
      this.animar(base);
    }
    if (!this.conTic) return;
    this.esperaTic -= dt;
    if (this.esperaTic <= 0) {
      // `RANDOM_FLOAT(TIME_MINIDLE, TIME_MAXIDLE)`, 6 y 60 segundos.
      this.esperaTic = ESPERA_TIC[0] + Math.random() * (ESPERA_TIC[1] - ESPERA_TIC[0]);
      // SÓLO DESDE EL REPOSO, y la condición era `enBucle`, que estaba mal.
      //
      // Las dos posturas de reposo de este modelo son `attention` (sin arma) y
      // `idle` (con arma), y **sólo la segunda hace bucle**. Con `enBucle`, un
      // personaje sin arma —o sea el caso por defecto de la pantalla— no se
      // estiraba nunca. Y eso importa más de lo que parece, porque medido sobre
      // los vértices animados las dos posturas están prácticamente QUIETAS:
      //
      //     idle       0,00 u de recorrido — una pose fija de 156 fotogramas
      //     attention  0,92 u — respirar, 2 cm
      //     stretch   41,55 u   jump 58,33   run 47,26   sitdown 51,28
      //
      // O sea que el `stretch` no es un adorno: es **lo único que se mueve** en
      // una tarjeta en reposo, y por eso el mod le puso un temporizador. Sin
      // esta corrección la pantalla eran tres estatuas.
      if (this.puesta === (this.base ?? "sinArma")) this.animar("tic");
    }
  }

  _pintar() {
    if (!this.visible || !this.lienzo.width || !this.lienzo.height) return;
    const v = this.visor;
    const c = v.camara;
    const aspecto = this.lienzo.width / this.lienzo.height;

    // La distancia sale del marco y del ángulo, no de un número a ojo: se
    // encaja el alto, y si la caja es más estrecha que la figura se aparta lo
    // que haga falta para que quepa también de ancho.
    const mitad = (c.fov * Math.PI) / 360;
    let d = (this.marcoAlto / 2) / Math.tan(mitad);
    const porAncho = (this.marcoAncho / 2) / (Math.tan(mitad) * aspecto);
    if (porAncho > d) d = porAncho;

    c.aspect = aspecto;
    // El modelo mira a +X de GoldSrc, que tras el cambio de ejes es +X de
    // Three. Así que la cámara se pone delante, en +X. El original consigue lo
    // mismo girando la entidad 180° respecto de la vista; el resultado es el
    // mismo y esto es un giro menos donde equivocarse de signo.
    c.position.set(this.centro.x + d, this.centro.y, this.centro.z);
    c.lookAt(this.centro);
    c.updateProjectionMatrix();

    const w = this.lienzo.width / v.pixelRatio;
    const h = this.lienzo.height / v.pixelRatio;
    // ARRIBA a la izquierda, y esto es un cambio de convenio que no da error.
    //
    // El `viewport` de WebGL cuenta la Y desde ABAJO y el `drawImage` de un
    // `canvas` 2D desde ARRIBA. Con el viewport en (0, 0) —que es el suelo del
    // lienzo compartido— y la copia desde (0, 0) —que es el techo—, una ranura
    // más pequeña que la mayor copia un trozo vacío. Se ve como «el retrato
    // pequeño no sale», y el grande funciona porque ahí las dos esquinas
    // coinciden. Así que el viewport se sube.
    const alturaCompartida = v.alto / v.pixelRatio;
    v.escena.add(this.nodo);
    v.render.setViewport(0, alturaCompartida - h, w, h);
    v.render.clear();
    v.render.render(v.escena, c);
    v.escena.remove(this.nodo);

    this.ctx.clearRect(0, 0, this.lienzo.width, this.lienzo.height);
    this.ctx.drawImage(
      v.render.domElement,
      0, 0, this.lienzo.width, this.lienzo.height,
      0, 0, this.lienzo.width, this.lienzo.height
    );
  }
}
