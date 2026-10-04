// LOS OTROS JUGADORES, en el mundo.
//
// El modelo es el mismo que el juego usa para un personaje —
// `models/human/reference.mdl`, lo que `CRenderChar::Init` carga— y el mismo que
// ya está horneado en `build/msr/cuerpos/` para la hoja de personaje del
// experimento 14. O sea que **esto no trae contenido nuevo**: trae al mismo
// modelo al mundo, a tamaño y con su animación.
//
// ── Por qué no lo monta `montarBichos` ────────────────────────────────────
//
// Porque los bichos salen de un manifiesto de colocaciones —69 entidades que el
// `.bsp` declara y no cambian— y estos salen de la red: aparecen, se van, y su
// sitio lo dice una foto veinte veces por segundo. Lo que sí se comparte es lo
// que de verdad es común: `cargarModelo()` de `src/render/bichos.js`, que lee un
// `.mdl` horneado con su malla, sus texturas y sus pistas. Duplicar eso sí
// habría sido un error.
//
// ── Las dos animaciones, y son las del mod ────────────────────────────────
//
// `build/msr/cuerpos.json` las nombra, y salen de `global.script`, o sea
// del mod y no de mirar capturas:
//
//     sinArma: "attention"      quieto
//     subiendo: "run"           andando
//
// Se elige por la RAPIDEZ que trae la foto, no por si la posición ha cambiado:
// a 20 fotos por segundo y con interpolación, comparar posiciones daría un
// jugador que se queda quieto cada vez que se pierde un paquete.

import * as THREE from "three";
import { cargarModelo } from "./bichos.js";
import { cascaraDe } from "../play/brillo.js";

import { BASE_COMUN } from "../play/recursos.js";
const BASE_POR_DEFECTO = BASE_COMUN;
/** El umbral de «se está moviendo», en unidades por segundo. */
export const ANDANDO = 10;

/**
 * Los cuerpos de los demás. Devuelve un grupo para colgar de la escena y cuatro
 * operaciones: `poner`, `quitar`, `paso` y `estado`.
 *
 * @param {{base?: string, U?: number, carpeta?: string}} opciones
 */
/**
 * UNA FIGURA DE JUGADOR: esqueleto propio, materiales propios, malla compartida.
 *
 * Sale de dentro de `cargarOtros` en el 41 y se exporta porque hace falta en dos
 * sitios: los demás jugadores y **tu propio cadáver**, que es la misma figura con
 * otra vida. Duplicar veinte líneas de atar un esqueleto es exactamente la clase
 * de copia que luego se arregla en un sitio y no en el otro.
 *
 * No la cuelga de ninguna parte por su cuenta: `padre` dice dónde va, y quien la
 * pide es quien la quita.
 */
export function figuraDeJugador(M, { id = 0, nombre = null, U = 39.37, padre = null } = {}) {
    // Un esqueleto por figura. Dos jugadores en fotogramas distintos no pueden
    // compartirlo, igual que dos zombis.
    const huesos = M.ficha.huesos.map((h, i) => {
      const b = new THREE.Bone();
      b.name = `h${i}`;
      b.position.set(h.pos[0], h.pos[1], h.pos[2]);
      b.quaternion.set(h.quat[0], h.quat[1], h.quat[2], h.quat[3]);
      return b;
    });
    const raices = [];
    M.ficha.huesos.forEach((h, i) => {
      if (h.padre < 0) raices.push(huesos[i]);
      else huesos[h.padre].add(huesos[i]);
    });

    // El cambio de ejes y la escala: el `.mdl` está en unidades del motor y con
    // la Z hacia arriba.
    const ejes = new THREE.Group();
    ejes.rotation.x = -Math.PI / 2;
    ejes.scale.setScalar(1 / U);
    for (const r of raices) ejes.add(r);

    const materiales = M.ficha.grupos.map((g) => {
      const iTex = M.ficha.pieles?.[0]?.[g.skinref];
      const info = (iTex !== undefined && M.ficha.texturasPorIndice?.[iTex]) || g;
      const map = M.texturas.get(info.archivo) ?? M.texturas.get(g.archivo) ?? null;
      // A PLENA LUZ, y es una deuda declarada: un modelo de GoldSrc se ilumina
      // con `R_LightPoint`, un luxel leído del suelo que tiene debajo. Los
      // adornos lo hacen (su luxel viene horneado) y los bichos también, pero
      // un jugador se mueve: haría falta preguntarle al mapa de luz en cada
      // foto. Hasta entonces, blanco — que es más claro de lo que debería y se
      // ve como que el otro jugador brilla un poco en las cuevas.
      return new THREE.MeshBasicMaterial({ map, color: 0xffffff });
    });

    const malla = new THREE.SkinnedMesh(M.geo, materiales);
    malla.frustumCulled = false;
    ejes.add(malla);

    const nodo = new THREE.Group();
    nodo.name = `jugador ${id}${nombre ? ` (${nombre})` : ""}`;
    nodo.add(ejes);
    if (padre) padre.add(nodo);
    // El esqueleto se ata DESPUÉS de colgarlo y de actualizar las matrices, por
    // lo mismo que en `bichos.js`: `new Skeleton()` saca las inversas de enlace
    // de `bone.matrixWorld`, y sin actualizar las saca de la identidad — que no
    // da error, da una figura aplastada en el origen.
    nodo.updateMatrixWorld(true);
    malla.bind(new THREE.Skeleton(huesos), malla.matrixWorld);

    // ── EL 95: LA CÁSCARA DEL BRILLO ─────────────────────────────────────
    //
    // `kRenderFxGlowShell` dibuja el modelo OTRA VEZ, aditivo y empujado por
    // la normal (`R_StudioRenderModel`, xash3d-fwgs ref/gl/gl_studio.c:
    // 3147-3168; la regla y sus citas en `src/play/brillo.js`). Aquí es una
    // segunda malla con la MISMA geometría y el MISMO esqueleto —así anima con
    // la figura sin un mezclador propio— y un material que suma su color.
    //
    // Lo que NO es del motor, dicho: la textura. La pasada del motor lleva
    // `sprites/shellchrome.spr` (`cl_sprite_shell`, engine/client/cl_tent.c:57)
    // con coordenadas de cromo que giran con `r_glowshellfreq`, y ese sprite
    // NO está en `../MSC/assets/msr` (se buscó). Sin él la cáscara es el color
    // liso, que suma MÁS luz que un cromo moteado. Pendiente en doc/BRILLO_95.md.
    // Y las normales son las del `.mdl`, no las «compartidas» que el motor
    // regenera para la cáscara (`R_StudioGenerateNormals`, :2294-2295).
    let cascara = null;
    const uSeparacion = { value: 0 };
    const hacerCascara = () => {
      const m = new THREE.MeshBasicMaterial({
        color: 0xffffff, blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false,       // `pglDepthMask(GL_FALSE)`, :3009
      });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uSeparacion = uSeparacion;
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nuniform float uSeparacion;")
          // DESPUÉS del esqueleto, como el motor: `VectorMA(av, scale, lv,
          // vert)` sobre el vértice ya transformado (:1990). Con piel,
          // `objectNormal` ya es la normal deformada (`skinnormal_vertex`).
          .replace("#include <skinning_vertex>", "#include <skinning_vertex>\ntransformed += normalize(objectNormal) * uSeparacion;");
      };
      m.name = "cascara del brillo";
      const c = new THREE.SkinnedMesh(M.geo, m);
      c.name = "cascara";
      c.frustumCulled = false;
      c.renderOrder = 1;                            // la segunda pasada
      ejes.add(c);
      c.bind(malla.skeleton, malla.bindMatrix);
      return c;
    };
    /** Pone, cambia o quita la cáscara según el `brillo` de la foto. */
    const brillar = (estado) => {
      const k = cascaraDe(estado);
      if (!k) { if (cascara) cascara.visible = false; return null; }
      cascara ??= hacerCascara();
      cascara.visible = true;
      // El color TAL CUAL, sin pasar por espacios: el juego dibuja con la
      // salida en lineal para que los bytes salgan como los del motor
      // (`espacioDelMotor`, src/render/scene.js; `ESPACIO`, bsp_escena.js).
      cascara.material.color.setRGB(k.color[0], k.color[1], k.color[2], THREE.LinearSRGBColorSpace);
      uSeparacion.value = k.separacion;             // en unidades: `ejes` escala a metros
      return k;
    };

    const mezclador = new THREE.AnimationMixer(nodo);
    let puesta = null;
    const pon = (nombreSec) => {
      const e = M.clips.get(String(nombreSec).toLowerCase()) ?? [...M.clips.values()][0];
      if (!e || e === puesta) return puesta;
      puesta = e;
      mezclador.stopAllAction();
      mezclador.clipAction(e.clip).reset().play();
      return e;
    };
    return {
      id, nodo, mezclador, pon, materiales, brillar,
      // EL 96: lo que hace falta para colgarle un arma (`ponerArmaEnFigura`).
      ejes, huesos, nombresDeHuesos: M.ficha.huesos.map((h) => h.nombre),
      get secuencia() { return puesta?.seq?.nombre ?? null; },
      /** EL 95: lo que la cáscara tiene AHORA, leído de la malla y no de la foto. */
      get cascara() {
        if (!cascara) return null;
        const c = cascara.material.color;
        return {
          visible: cascara.visible, enEscena: Boolean(cascara.parent),
          color: [c.r, c.g, c.b].map((x) => Number(x.toFixed(4))),
          separacion: uSeparacion.value, aditiva: cascara.material.blending === THREE.AdditiveBlending,
          mismoEsqueleto: cascara.skeleton === malla.skeleton,
        };
      },
      nombre,
    };
}

/**
 * EL ARMA EN LA MANO DE OTRO JUGADOR — el 96.
 *
 * En el motor el arma de tercera persona es OTRA entidad (`MODEL_HANDS`, el
 * `p_weapons*.mdl` con su `body`) pegada al jugador con `AttachTo`
 * (`CRenderPlayer::RenderGearItem`, clrenderent.cpp:321-365), y el dibujante de
 * modelos le hace `StudioMergeBones`: **cada hueso del arma que se llame igual
 * que uno del jugador copia la matriz del jugador**, y los que no, se calculan
 * con su propia secuencia sobre su padre (studiomodelrenderer.cpp:1162-1215).
 * El `p_weapons2.mdl` trae 44 huesos y 42 son los del `reference.mdl`.
 *
 * Aquí eso es un `Skeleton` MIXTO: para los huesos con nombre del jugador, el
 * MISMO `Bone` de la figura —así se mueve con su animación sin copiar nada en
 * cada fotograma—, y para los otros un `Bone` propio colgado del que haga de
 * padre. Las inversas de enlace salen de la postura de reposo DEL ARMA, que es
 * en la que están sus vértices horneados: `v' = hueso_jugador · reposo⁻¹ · v`,
 * que es lo que hace la mezcla del motor con los vértices en espacio de hueso.
 *
 * Lo que NO hace, dicho: los huesos propios (`smdimport`, `joint1`) van en la
 * postura de reposo y no en el fotograma 0 de la secuencia que tuviera la
 * entidad; el motor les pone `framerate 0, frame 0` (clrenderent.cpp:330-331)
 * de su secuencia, y cuál es esa secuencia en el arma de otro no está medido.
 *
 * `A` es lo que devuelve `cargarModelo` para la carpeta del arma.
 * Devuelve la malla, ya colgada de la figura.
 */
export function ponerArmaEnFigura(fig, A) {
  const porNombre = new Map(fig.nombresDeHuesos.map((n, i) => [String(n).toLowerCase(), fig.huesos[i]]));
  const materiales = A.ficha.grupos.map((g) => {
    const iTex = A.ficha.pieles?.[0]?.[g.skinref];
    const info = (iTex !== undefined && A.ficha.texturasPorIndice?.[iTex]) || g;
    const map = A.texturas.get(info.archivo) ?? A.texturas.get(g.archivo) ?? null;
    const m = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
    if (g.recortado) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
    if (g.aditivo) { m.blending = THREE.AdditiveBlending; m.depthWrite = false; m.transparent = true; }
    return m;
  });
  const malla = new THREE.SkinnedMesh(A.geo, materiales);
  malla.name = "arma en la mano";
  malla.frustumCulled = false;
  fig.ejes.add(malla);
  fig.nodo.updateMatrixWorld(true);

  // La postura de reposo del arma, en un esqueleto de usar y tirar colocado
  // donde está la malla: de ahí salen las inversas.
  const reposo = A.ficha.huesos.map((h) => {
    const b = new THREE.Bone();
    b.position.set(h.pos[0], h.pos[1], h.pos[2]);
    b.quaternion.set(h.quat[0], h.quat[1], h.quat[2], h.quat[3]);
    return b;
  });
  const marco = new THREE.Group();
  marco.matrixAutoUpdate = false;
  marco.matrix.copy(malla.matrixWorld);
  A.ficha.huesos.forEach((h, i) => (h.padre < 0 ? marco.add(reposo[i]) : reposo[h.padre].add(reposo[i])));
  marco.updateMatrixWorld(true);
  const inversas = reposo.map((b) => b.matrixWorld.clone().invert());

  // Y los de verdad: los del jugador cuando se llaman igual, propios si no.
  let fusionados = 0;
  const reales = [];
  A.ficha.huesos.forEach((h, i) => {
    const suyo = porNombre.get(String(h.nombre).toLowerCase());
    if (suyo) { reales[i] = suyo; fusionados++; return; }
    const b = new THREE.Bone();
    b.name = `arma_${h.nombre}`;
    b.position.set(h.pos[0], h.pos[1], h.pos[2]);
    b.quaternion.set(h.quat[0], h.quat[1], h.quat[2], h.quat[3]);
    // Un hueso raíz sin pareja va sobre la propia entidad (los ejes del
    // modelo del jugador), que es la matriz de partida del motor.
    (h.padre < 0 ? fig.ejes : reales[h.padre]).add(b);
    reales[i] = b;
  });
  malla.bind(new THREE.Skeleton(reales, inversas), malla.matrixWorld);
  malla.userData.fusionados = fusionados;
  malla.userData.propios = reales.length - fusionados;
  return malla;
}

export async function cargarOtros({
  base = BASE_POR_DEFECTO, U = 39.37, carpeta = "cuerpos/human_reference_b40",
  // EL 96: de un id de arma a su ficha del catálogo (`build/msr/armas.json`).
  // Una función y no el catálogo, porque en `main.js` el catálogo se lee
  // DESPUÉS de montar a los otros.
  armaDe = () => null,
} = {}) {
  const modelo = await cargarModelo(carpeta, { base });
  if (!modelo) return null;

  const grupo = new THREE.Group();
  grupo.name = "otros jugadores";
  /** @type {Map<number, object>} */
  const figuras = new Map();

  // Los modelos de arma, uno por carpeta: el mismo `p_weapons2_b104` lo pueden
  // llevar tres jugadores, y la geometría se comparte (cada uno su esqueleto).
  const armas = new Map();
  /**
   * Cuelga (o quita) el arma `id` de la figura. Asíncrono por dentro: si la
   * carga acaba cuando ya lleva OTRA, no se cuelga (el turno del `empunar`
   * del jugador, el mismo problema).
   */
  function cambiarArma(f, id) {
    f.arma = id;
    if (f.mallaArma) { f.mallaArma.parent?.remove(f.mallaArma); f.mallaArma = null; }
    const ficha = id ? armaDe(id) : null;
    const clave = ficha?.enElMundo?.clave ?? null;
    if (!clave) return;
    if (!armas.has(clave)) armas.set(clave, cargarModelo(clave, { base: `${base}/armas` }).catch(() => null));
    armas.get(clave).then((A) => {
      if (!A || f.arma !== id || f.mallaArma) return;
      f.mallaArma = ponerArmaEnFigura(f, A);
      f.mallaArma.userData.clave = clave;
    });
  }

  /** Una figura nueva, colgada ya del grupo de los otros. */
  function crear(id, nombre) {
    const f = figuraDeJugador(modelo, { id, nombre, U, padre: grupo });
    f.pon("attention");
    return f;
  }

  return {
    grupo,
    figuras,
    modelo,

    /** Pone o mueve a un jugador. `estado` es lo que trae la foto, interpolado. */
    poner(id, estado) {
      let f = figuras.get(id);
      if (!f) { f = crear(id, estado.nombre); figuras.set(id, f); }
      // EL 96: el arma de su mano, si ha cambiado.
      if ((estado.arma ?? null) !== (f.arma ?? null)) cambiarArma(f, estado.arma ?? null);
      const [x, y, z] = estado.pies;
      f.nodo.position.set(x, y, z);
      // El `yaw` del jugador mira a −Z con cero, y el modelo mira a +X con cero
      // —es la convención de GoldSrc—, así que hay un cuarto de vuelta entre los
      // dos. Sin él los demás andan de lado, que es de esas cosas que se ven en
      // el acto y no se deducen de ningún número.
      f.nodo.rotation.y = estado.yaw - Math.PI / 2;
      f.pon((estado.rapidez ?? 0) > ANDANDO ? "run" : "attention");
      // EL 95: el `renderfx` de la foto (doc/BRILLO_95.md).
      f.brillar(estado.brillo ?? null);
      f.visto = estado;
      return f;
    },

    quitar(id) {
      const f = figuras.get(id);
      if (!f) return false;
      cambiarArma(f, null);
      grupo.remove(f.nodo);
      f.mezclador.stopAllAction();
      figuras.delete(id);
      return true;
    },

    /** Deja sólo a los que vengan en el mapa, y coloca a todos. */
    refrescar(interpolados) {
      for (const [id, estado] of interpolados) this.poner(id, estado);
      for (const id of [...figuras.keys()]) if (!interpolados.has(id)) this.quitar(id);
      return figuras.size;
    },

    paso(dt) { for (const f of figuras.values()) f.mezclador.update(dt); },

    /**
     * EL 97: la malla del arma que cuelga de la figura de `id` (o de la primera
     * que lleve una), para que la sonda la mida en PÍXELES: el estado de arriba
     * dice que cuelga, no que se vea.
     */
    mallaDeArma(id = null) {
      for (const f of figuras.values()) {
        if (id !== null && f.id !== id) continue;
        if (f.mallaArma) return f.mallaArma;
      }
      return null;
    },

    estado() {
      return [...figuras.values()].map((f) => ({
        id: f.id,
        nombre: f.nombre ?? null,
        pies: [f.nodo.position.x, f.nodo.position.y, f.nodo.position.z],
        yaw: f.nodo.rotation.y,
        secuencia: f.secuencia,
        interpolado: Boolean(f.visto?.interpolado),
        // EL 95: lo que trajo la foto y lo que la malla dibuja, por separado.
        brilloDeLaFoto: f.visto?.brillo ?? null,
        cascara: f.cascara,
        // EL 96: el arma que dice la foto y la que cuelga de verdad de la figura.
        arma: f.arma ?? null,
        armaColgada: f.mallaArma ? {
          clave: f.mallaArma.userData.clave, enLaFigura: Boolean(f.mallaArma.parent),
          fusionados: f.mallaArma.userData.fusionados, propios: f.mallaArma.userData.propios,
        } : null,
      }));
    },
  };
}
