// EL MIRADOR: los mapas que NO son Gate City.
//
// `?map=pueblo`, `?map=corinth`, `?map=colina` y `?map=jharro` son el banco de
// pruebas de los experimentos 01 a 09: el lector de `.map`, el terreno
// generado, el kit CC0 de Kenney y el jharro. Tienen su propio bucle, su propia
// escena y su propio `window.probe`, y no comparten con el juego más que nueve
// constantes del arranque.
//
// Vivían debajo de las 2 600 líneas de `mainGateCity` en `src/main.js`, en el
// mismo archivo y sin relación con ellas. Sacarlos no es limpieza: es que el
// archivo por el que se entra al proyecto tenía DOS programas dentro, y quien
// lo abría para tocar el juego se encontraba primero con el otro.
//
// Se carga bajo demanda desde `main.js`, así que con `?map=gatecity` ni se
// descarga: el kit, el `GLTFLoader` y el generador de terreno son suyos y el
// juego no los usa.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ALCANCE } from "./kit/luz.js";
import { Player, World, initPhysics } from "./play/player.js";
import { UNITS_PER_M, meshBounds } from "./map/geometry.js";
import { atlasDe, buildFromPlan, fundirMallas, mallaDeGrupo, mallaGenerada } from "./kit/studio.js";
import { buildBillboards, buildTerrain, scatterTrees } from "./render/backdrop.js";
import { buildScene, buildView, loadTextures } from "./render/scene.js";
import { jharroLevel } from "./kit/nivel.js";
import { loadLevel } from "./map/level.js";
import { montarCorinth } from "./kit/pueblo.js";
import { terrainLevel } from "./map/terrain.js";

/**
 * Monta uno de los mapas del banco de pruebas.
 *
 * Lo que recibe es lo que `main.js` tiene y esto no: el nombre del mapa, el
 * paso fijo, la sensibilidad del ratón, el lienzo, el HUD y la línea de estado.
 */
export async function mirarMapa({ MAP, DT, MOUSE, canvas, hud, say, MESH_LEVEL, KIT_LEVEL, JHARRO_LEVEL }) {
  let level;
  if (JHARRO_LEVEL) {
    say("digging the jharro…");
    level = jharroLevel();
  } else if (MESH_LEVEL) {
    say("computing terrain…");
    level = terrainLevel({ name: MAP });
  } else {
    say("loading map…");
    const response = await fetch(`maps/${MAP}.map`);
    if (!response.ok) throw new Error(`no se pudo leer maps/${MAP}.map`);
    level = loadLevel(await response.text(), { name: MAP });
  }

  if (level.mesh.triangleCount === 0) {
    throw new Error(`${MAP} se cargo vacio: ${level.brushes.length} brushes, 0 triangulos`);
  }
  if (!level.start) throw new Error(`${MAP} no tiene info_player_start`);

  // --- el kit, antes de la fisica -------------------------------------------
  //
  // Tiene que ir antes porque el mundo de Rapier se construye de una pieza: la
  // malla de colision es el `.map` MAS las casas MAS la roca, y no hay forma de
  // anadirle triangulos despues. Si el kit llegara tarde, el jugador atravesaria
  // las paredes de las casas y se caeria por el socavon, y las dos cosas se
  // leerian como un fallo de fisica en vez de como un orden de carga.
  let kit = null;
  if (JHARRO_LEVEL) {
    say("setting up the jharro…");
    // Las fachadas del kit, y después la roca y los faroles generados. El orden
    // es el mismo que en Corinth y por lo mismo: la malla de colisión de Rapier
    // se construye de una pieza y no se le pueden añadir triángulos después.
    const grupo = await buildFromPlan(new GLTFLoader(), level.ciudad.piezas);
    const piezas = mallaDeGrupo(grupo);
    const generada = mallaGenerada(level.generada, atlasDe(grupo));
    generada.userData.papel = "generada";
    grupo.add(generada);
    kit = {
      grupo,
      monta: {
        piezas: level.ciudad.piezas,
        parcelas: level.ciudad.fachadas,
        avisos: [],
        medidas: { ...level.ciudad.medidas, ...level.juego.medidas, luz: level.luz.medidas },
      },
      // La roca choca; los faroles no. Ver el comentario de `nivel.js`: un farol
      // es una caja a la altura de la cabeza y hay 58 en sitios de paso.
      colision: [piezas, { pos: level.solida.pos, idx: level.solida.idx }],
    };
  } else if (KIT_LEVEL) {
    say("setting up Corinth…");
    const monta = montarCorinth();
    const grupo = await buildFromPlan(new GLTFLoader(), monta.piezas);
    // La colision se saca ANTES de meterle la roca de dibujo, porque esa lleva
    // el torno y la cuerda del torno cruza el eje de la escalera: veinte
    // centimetros de cuerda son un muro de seis metros y medio en un trimesh, y
    // el jugador se queda clavado delante sin que nada avise. Para chocar va
    // `rocaSolida`, que es la misma roca sin el torno.
    const piezas = mallaDeGrupo(grupo);
    // `generada` lleva roca, brocal, torno y vallas: es lo que se DIBUJA, y va
    // todo en una malla porque comparte el atlas del kit. `generadaSolida` es lo
    // mismo sin la cuerda del torno: es lo que CHOCA.
    if (monta.generada) {
      const generada = mallaGenerada(monta.generada, atlasDe(grupo));
      generada.userData.papel = "generada";
      grupo.add(generada);
    }
    kit = {
      grupo,
      monta,
      colision: [piezas, { pos: monta.generadaSolida.pos, idx: monta.generadaSolida.idx }],
    };
  }

  say("starting physics…");
  await initPhysics();
  const colision = kit
    ? fundirMallas([{ pos: level.mesh.positions, idx: level.mesh.indices }, ...kit.colision])
    : level.mesh;
  const world = new World(colision);
  const player = new Player(world, level.start);
  // Un nivel puede decir hacia dónde se mira al llegar. El jharro lo dice porque
  // su entrada está pegada al margen de roca y el rumbo por defecto deja al
  // jugador de cara a una pared.
  if (typeof level.startYaw === "number") player.yaw = level.startYaw;

  say("loading textures…");
  const BUSH_VARIANTS = 8;
  const wanted = [
    ...new Set([
      ...level.mesh.groups.map((g) => g.texture),
      "tree01",
      ...Array.from({ length: BUSH_VARIANTS }, (_, i) => `veg/bush0${i + 1}`),
    ]),
  ];
  const { textures: images, missing } = await loadTextures(wanted);
  if (missing.length) console.warn("texturas que faltan:", missing.join(", "));

  const { scene, textures } = buildScene(level, images, {
    bajoTierra: JHARRO_LEVEL,
    alcance: ALCANCE,
  });

  // --- el agua se mueve ------------------------------------------------------
  //
  // Una lámina de agua quieta no se lee como agua: se lee como suelo pintado de
  // azul, que es literalmente lo que es. Basta con correr la textura, y sale
  // gratis porque la del río es una tesela que se repite: se desplaza el `offset`
  // del mapa y no hay que tocar ni un vértice ni escribir un shader.
  //
  // Se busca por el NOMBRE de la textura y no por el índice del material,
  // porque el orden de los grupos lo decide el emisor y cambia en cuanto alguien
  // añade una textura al mapa.
  const agua = textures.indexOf("water01");
  const materialAgua = agua >= 0 ? scene.getObjectByName("worldspawn")?.material?.[agua] : null;
  if (materialAgua?.map) {
    // Clonar el mapa: la misma textura la comparten otros materiales, y correrle
    // el offset a la compartida movería también lo que no es agua.
    materialAgua.map = materialAgua.map.clone();
    materialAgua.map.needsUpdate = true;
  }
  const { renderer, camera, resize } = buildView(canvas, {
    far: MESH_LEVEL ? 1400 : 400,
  });
  addEventListener("resize", resize);

  if (kit) scene.add(kit.grupo);

  // --- paisaje de fondo, solo render ---------------------------------------
  //
  // Va centrado en el pueblo y empieza justo fuera de la muralla. Nada de esto
  // colisiona ni esta en el .map, asi que qbsp sigue juzgando exactamente el
  // mismo mundo sellado que antes.
  const bounds = meshBounds(level.mesh);
  const centre = [
    (bounds.min[0] + bounds.max[0]) / 2,
    0,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  // Medio ancho y medio fondo, no un radio: el pueblo es rectangular y un
  // agujero cuadrado en el terreno deja vacio por los lados cortos.
  const inner = [
    (bounds.max[0] - bounds.min[0]) / 2,
    (bounds.max[2] - bounds.min[2]) / 2,
  ];
  // Tres veces el pueblo, no seis. La niebla se calibra por el tamano del
  // mapa, asi que un paisaje seis veces mayor cae entero detras de ella y se
  // ve como un muro liso: hay once mil triangulos de colinas que no se
  // distinguen de un color plano.
  const outer = Math.max(...inner) * 3;

  // El valle de malla no lleva fondo: el terreno que se anda ES el paisaje, y
  // eso es medio argumento de la opcion. Poner ademas colinas de decorado
  // detras seria tapar con render lo que se trata de mirar.
  const backdrop = new THREE.Group();
  // A ras del suelo jugable, no del fondo de la malla. La losa de suelo del
  // pueblo baja dos metros por debajo de donde se anda, y colgar ahi el
  // terreno deja el pueblo subido en un pedestal que se ve desde fuera.
  backdrop.position.set(centre[0], 0, centre[2]);
  // Bajo tierra no hay fondo que poner: no hay horizonte, hay roca. Colgar
  // colinas de decorado detrás de un jharro sería dibujarlas dentro de la piedra.
  if (!MESH_LEVEL && !JHARRO_LEVEL) scene.add(backdrop);

  // El agujero va un metro MENOS que el pueblo, para que el terreno se meta
  // por debajo del borde. Un metro de mas dejaba un anillo de vacio y el
  // pueblo parecia subido en un pedestal.
  const terrain = MESH_LEVEL || JHARRO_LEVEL
    ? { triangles: 0 }
    : buildTerrain({ inner: [inner[0] - 1, inner[1] - 1], outer });
  if (terrain.mesh) backdrop.add(terrain.mesh);

  // Los carteles van en coordenadas de MUNDO y colgados de la escena, no del
  // grupo del terreno: el shader los orienta mezclando el pie del arbol con
  // cameraPosition, que es de mundo. Ver billboardRight() en backdrop.js.
  const toWorld = (t) => ({
    ...t,
    position: [t.position[0] + centre[0], t.position[1], t.position[2] + centre[2]],
  });

  const forest = MESH_LEVEL || JHARRO_LEVEL
    ? []
    : scatterTrees({ inner: [inner[0] + 2, inner[1] + 2], outer: outer * 0.85 }).map(toWorld);
  const billboards = forest.length && images.get("tree01")
    ? buildBillboards(forest, images.get("tree01"), { fog: scene.fog })
    : null;
  if (billboards) scene.add(billboards.mesh);

  // Los arboles y las matas de dentro del pueblo vienen del .map, donde los
  // arboles ademas tienen su tronco macizo. Aqui solo se les pone el follaje.
  //
  // La altura de cada uno viaja en la propia entidad, no se inventa aqui: si
  // se inventara, cambiar el emisor dejaria de tener efecto y no habria forma
  // de saber por que.
  const plants = (classname, ancho) =>
    level.entities
      .filter((e) => e.classname === classname && e.origin())
      .map((e, i) => {
        const u = e.origin();
        return {
          position: [u[0] / UNITS_PER_M, u[2] / UNITS_PER_M, -u[1] / UNITS_PER_M],
          height: Number(e.props.height ?? 320) / UNITS_PER_M,
          width: ancho,
          seed: (i * 0.37) % 1,
          variant: Number(e.props.variant ?? 0),
        };
      });

  const townTrees = plants("misc_tree", 0.75);
  const townBushes = plants("misc_bush", 1.15);

  const townBillboards = images.get("tree01")
    ? buildBillboards(townTrees, images.get("tree01"), { fog: scene.fog })
    : null;
  if (townBillboards) scene.add(townBillboards.mesh);

  // Una malla por silueta. Son ocho dibujadas, que a cien matas no se nota, y
  // evita tener que montar un atlas y llevar el desplazamiento de UV por
  // instancia. Las matas se reparten por la variante que trae cada entidad.
  const bushBillboards = [];
  for (let v = 0; v < BUSH_VARIANTS; v++) {
    const tex = images.get(`veg/bush0${v + 1}`);
    const lote = townBushes.filter((b) => b.variant === v);
    if (!tex || !lote.length) continue;
    const b = buildBillboards(lote, tex, { fog: scene.fog, sway: 0.02, shade: 0.82 });
    bushBillboards.push(b);
    scene.add(b.mesh);
  }

  document.getElementById("intro").hidden = true;
  hud.hidden = false;

  const keys = new Set();
  addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (e.code === "KeyR") {
      player.body.setTranslation(
        { x: level.start[0], y: level.start[1] + player.centreOffset, z: level.start[2] },
        true
      );
      player.velocityY = 0;
    }
    if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) e.preventDefault();
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  canvas.addEventListener("click", () => canvas.requestPointerLock());
  addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    player.yaw -= e.movementX * MOUSE;
    player.pitch = Math.max(
      -Math.PI / 2 + 0.01,
      Math.min(Math.PI / 2 - 0.01, player.pitch - e.movementY * MOUSE)
    );
  });

  const counters = {
    dist: document.getElementById("h-dist"),
    pos: document.getElementById("h-pos"),
    ground: document.getElementById("h-ground"),
  };
  let travelled = 0;
  let last = performance.now();
  let accumulator = 0;
  let running = true;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!running) {
      last = now;
      return;
    }
    accumulator += Math.min((now - last) / 1000, 0.25);
    last = now;

    const before = player.feet;
    // Paso fijo: la fisica tiene que dar lo mismo aqui que en las pruebas de
    // Node, y con dt variable no lo daria.
    while (accumulator >= DT) {
      player.step(DT, {
        forward: (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0),
        strafe: (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0),
        jump: keys.has("Space"),
      });
      accumulator -= DT;
    }
    const after = player.feet;
    travelled += Math.hypot(after[0] - before[0], after[2] - before[2]);

    const eye = player.eye;
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.rotation.set(player.pitch, player.yaw, 0);
    for (const b of [billboards, townBillboards, ...bushBillboards]) {
      if (b) b.material.uniforms.uTime.value = now / 1000;
    }
    if (materialAgua?.map) {
      // Río abajo y un poco de deriva: dos velocidades distintas hacen que no se
      // lea como una cinta transportadora.
      materialAgua.map.offset.set((now / 26000) % 1, (now / 9000) % 1);
    }
    renderer.render(scene, camera);

    counters.dist.textContent = travelled.toFixed(1);
    counters.pos.textContent = after
      .map((v) => Math.round(v * UNITS_PER_M))
      .join(" ");
    counters.ground.textContent = player.grounded ? "ground" : "air";
  }

  // Puerta para el sacador de capturas: dejar mirar y colocar la camara desde
  // fuera es lo que permite que un PNG sea una comprobacion y no una foto de
  // recuerdo. tools/shot.mjs es el unico que la usa.
  window.probe = {
    level,
    player,
    camera,
    renderer,
    keys,
    ready: true,
    /** Lo que el kit aporta, para poder medirlo apagándolo. */
    kit: kit
      ? {
          piezas: kit.monta.piezas.length,
          parcelas: kit.monta.parcelas.length,
          avisos: kit.monta.avisos,
          medidas: kit.monta.medidas,
          triangulos: colision.triangleCount,
        }
      : null,
    /**
     * Apaga o enciende las mallas del kit.
     *
     * Es la sonda del «descampado»: la fracción de pantalla que cambia al
     * apagarlo ES la fracción que ocupan las casas. Restar coberturas no vale,
     * porque en un pueblo amurallado casi todo píxel es ya geometría.
     */
    setKit(on) {
      if (kit) kit.grupo.visible = on;
    },
    /**
     * Apaga o enciende SOLO la malla generada —la roca y los faroles—, dejando
     * las piezas del kit puestas.
     *
     * Hace falta en el jharro y no hacía falta en Corinth: allí el mundo salía
     * de un `.map` y el kit se medía apagándolo contra ese suelo. Aquí no hay
     * `.map`, así que apagar el kit entero deja la pantalla en niebla y el
     * número no dice qué aportan las fachadas: dice que sin mundo no hay mundo.
     */
    setGenerada(on) {
      if (!kit) return;
      for (const hijo of kit.grupo.children) {
        if (hijo.userData?.papel === "generada") hijo.visible = on;
      }
    },
    /** Apaga o enciende el suelo y la muralla, que salen del .map. */
    setMapa(on) {
      const mundo = scene.getObjectByName("worldspawn");
      if (mundo) mundo.visible = on;
    },
    /** Apaga o enciende el paisaje de fondo y los carteles de vegetación. */
    setFondo(on) {
      backdrop.visible = on;
      for (const b of [billboards, townBillboards, ...bushBillboards]) {
        if (b) b.mesh.visible = on;
      }
    },
    /**
     * Para el bucle de render.
     *
     * Sin esto, una vista de camara suelta dura un fotograma: el siguiente
     * requestAnimationFrame vuelve a dibujar desde los ojos del jugador y la
     * captura sale del sitio equivocado. Y sale plausible, que es lo peor.
     */
    pause() {
      running = false;
    },
    resume() {
      running = true;
    },
    /**
     * Coloca al jugador y lo deja asentarse, para capturas repetibles.
     *
     * Se simula hasta que toque suelo en vez de dejarlo congelado en el aire:
     * asi una posicion metida dentro de un muro o sobre un agujero se nota en
     * la propia captura, en vez de salir un fotograma bonito de un sitio donde
     * no se puede estar.
     */
    place(feetUnits, yaw = 0, pitch = 0, settle = 90) {
      const f = [feetUnits[0] / UNITS_PER_M, feetUnits[2] / UNITS_PER_M, -feetUnits[1] / UNITS_PER_M];
      player.body.setTranslation(
        { x: f[0], y: f[1] + player.centreOffset, z: f[2] },
        true
      );
      player.velocityY = 0;
      player.yaw = yaw;
      player.pitch = pitch;
      for (let i = 0; i < settle; i++) {
        player.step(DT, {});
        if (player.grounded) break;
      }
      return { feet: player.feet, grounded: player.grounded };
    },
    /** Vuelve al info_player_start del mapa y se deja caer al suelo. */
    restart(yaw = 0, pitch = 0) {
      return this.place(
        [
          level.startUnits[0],
          level.startUnits[1],
          level.startUnits[2] - 24,
        ],
        yaw,
        pitch
      );
    },
    /**
     * Pone la camara donde sea, sin fisica y sin jugador.
     *
     * Para vistas que no son de alguien andando: sobre todo la aerea, que es
     * la forma barata de ver si una casa esta donde dice el plano. Un error de
     * colocacion no se ve desde dentro -se ve una pared, y una pared es lo que
     * se esperaba-, pero desde arriba salta a la vista.
     */
    fly(eyeUnits, yaw = 0, pitch = 0) {
      camera.position.set(
        eyeUnits[0] / UNITS_PER_M,
        eyeUnits[2] / UNITS_PER_M,
        -eyeUnits[1] / UNITS_PER_M
      );
      camera.rotation.set(pitch, yaw, 0);
      renderer.render(scene, camera);
      return { eye: camera.position.toArray() };
    },
    /** Un render inmediato, sin esperar al siguiente fotograma. */
    draw() {
      const eye = player.eye;
      camera.position.set(eye[0], eye[1], eye[2]);
      camera.rotation.set(player.pitch, player.yaw, 0);
      renderer.render(scene, camera);
      return { eye, width: canvas.width, height: canvas.height };
    },
  };

  if (JHARRO_LEVEL) {
    const alc = level.alcanceLuz();
    say(
      `jharro: ${level.mesh.triangleCount} triángulos de roca, sin .map y sin cielo · ` +
        `${level.plan.medidas.celdas} celdas en ${level.plan.plantas.length} plantas · ` +
        `${level.ciudad.fachadas.length} fachadas (${level.ciudad.medidas.piezas} piezas) · ` +
        `${level.luz.luces.length} faroles, uno cada ${level.luz.medidas.suelosPorLuzPueblo.toFixed(0)} m² ` +
        `en el pueblo y ${level.luz.medidas.suelosPorLuzCueva.toFixed(0)} en la cueva · ` +
        `del suelo a su farol: p90 ${alc.p90.toFixed(1)} m · ` +
        `${colision.triangleCount} triángulos de colisión`
    );
    requestAnimationFrame(frame);
    return;
  }

  say(
    (MESH_LEVEL
      ? `${MAP}: malla de altura, sin .map y sin qbsp · ${level.mesh.triangleCount} triangulos, `
      : `${MAP}: ${level.brushes.length} brushes, ${level.mesh.triangleCount} triangulos, `) +
      `${textures.length} texturas${missing.length ? ` (${missing.length} sin cargar)` : ""}, ` +
      `${level.lights.length} luces · ` +
      (kit
        ? `kit: ${kit.monta.piezas.length} piezas en ${kit.monta.parcelas.length} parcelas, ` +
          `${colision.triangleCount} triangulos de colision en total · `
        : "") +
      (MESH_LEVEL
        ? `${townTrees.length} arboles y ${townBushes.length} matas sembrados sobre la curva ` +
          `(${bushBillboards.length} siluetas)`
        : `fondo: ${terrain.triangles} triangulos, ${forest.length} arboles + ` +
          `${townTrees.length} y ${townBushes.length} matas (${bushBillboards.length} siluetas) en el pueblo`)
  );
  requestAnimationFrame(frame);
}
