// Entrada del navegador. Une las tres piezas y no hace nada mas: el cargador
// y la fisica son los mismos modulos que corren en Node sin ojos.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { loadLevel } from "./map/level.js";
import { terrainLevel } from "./map/terrain.js";
import { UNITS_PER_M, meshBounds } from "./map/geometry.js";
import { initPhysics, World, Player, PLAYER, perfilMsr } from "./play/player.js";
import { velocidadAndando, velocidadCorriendo, ajustarVelocidad, puedeCorrer,
  AGUANTE_CORRIENDO, regeneracionDeAguante, aguanteDeSalto,
  danoDeCaida as danoDeCaidaU } from "./play/movimiento.js";
import { Teclas, nombreDeTecla, RANURAS } from "./juego/teclas.js";
import {
  atributosDe, derivadas, habilidadDeArma, propiedadesDe, valorDeHabilidad,
} from "./juego/stats.js";
import { entrenar } from "./juego/personaje.js";
import { carga as cargaDe } from "./juego/inventario.js";
import { buildScene, buildView, loadTextures } from "./render/scene.js";
import { buildTerrain, buildBillboards, scatterTrees } from "./render/backdrop.js";
import {
  buildFromPlan, mallaGenerada, atlasDe, mallaDeGrupo, fundirMallas,
} from "./kit/studio.js";
import { montarCorinth } from "./kit/pueblo.js";
import { jharroLevel } from "./kit/nivel.js";
import { ALCANCE } from "./kit/luz.js";
import { gatecityLevel } from "./bsp/nivel.js";
import {
  escenaGateCity, cargarTexturas as cargarTexturasBsp, cargarMapaDeLuz, cargarCarteles,
  cargarAdornos, cargarDetalle, cargarCielo,
  OVERBRIGHT, GLOW,
} from "./render/bsp_escena.js";
import { cargarBichos } from "./render/bichos.js";
import { cargarArma } from "./render/arma.js";
import { cargarMuneco } from "./render/muneco.js";
import { cargarFlechas } from "./render/flechas.js";
import { Brazo, elegirObjetivo, expDeLaMuerte, FASE, VozDeLaCarga } from "./play/golpe.js";
import {
  Flecha, anguloDelTiro, danoDeFlecha, dadoDeFlecha, AJUSTES, COMO_EL_MOTOR,
} from "./play/proyectil.js";
import { animacionDeParado } from "./play/actividad.js";
import {
  Brazal, POSTURA, defensaDelJugador, dentroDelCono2D, puedeAtacar,
} from "./play/escudo.js";
import { valorDeParryDelJugador } from "./play/parry.js";
import { cargarCuerpos } from "./render/cuerpo.js";
import { montarPuertas } from "./play/puertas.js";
import { Volumenes } from "./play/volumenes.js";
import { solidosDeAdornos, solidosDeBichos } from "./play/solidos.js";
import { Pasos, materialDe, sonidoDeCaida } from "./play/sonido.js";
import { Audio } from "./play/audio.js";
import { montarInterfaz } from "./juego/interfaz.js";
import { montarHud, cargaDelTiro } from "./juego/hudms.js";
import { montarMenu } from "./juego/menums.js";
import { Ciclador, Ranuras, cargarRanuras } from "./play/ranuras.js";
import { AlmacenLocal, AlmacenMemoria } from "./juego/almacen.js";
import { Sesion, ESTADO, guardarAlCerrar } from "./juego/sesion.js";
import { relacionDeRazas, RELACION } from "./bsp/razas.js";
import {
  PARTIDA, vidaTotal, jugadoresActivos, nivelDeAjuste, autoajustar,
  experienciaDelBicho,
} from "./juego/servidor.js";
import { ClienteDeRed, AlmacenRemoto } from "./red/cliente.js";
import { enlaceDeNavegador, urlPorDefecto, listarPartidas } from "./red/navegador.js";
import { BOTON } from "./red/protocolo.js";
import { cargarOtros } from "./render/otros.js";

const MAP = new URLSearchParams(location.search).get("map") ?? "pueblo";
const DT = 1 / 60;
const MOUSE = 0.0022;

// Los BOTONES DE JUEGO —los que cuentan como `pev->button`— y sus teclas por
// defecto viven ahora en `src/juego/teclas.js`, sacados del `config.cfg` de la
// instalacion del juego.

const canvas = document.getElementById("view");
const hud = document.getElementById("hud");
const status = document.getElementById("status");

function say(text) {
  status.textContent = text;
  // Vacía se ESCONDE. Con el HUD del juego puesto, un rectángulo negro vacío
  // cruzando la pantalla de lado a lado es un adorno que no dice nada.
  status.hidden = !text;
}

// LA CONSOLA DE SUCESOS, que es otra cosa que la línea de estado.
//
// `say()` es el andamio del arranque: una línea que dice por dónde va la carga
// y que se borra cuando el mapa está puesto. Lo que pasa DENTRO del juego no
// cabe ahí, y hasta el 23 se metía igual — cada golpe pisaba al anterior y el
// aviso de que un goblin había llamado a tres amigos duraba lo que tardabas en
// pegar otra vez.
//
// En Master Sword eso va a la consola de sucesos, que apila cinco líneas y las
// suelta de una en una. `tipo` es una de las seis claves de `COLORES_DE_SUCESO`
// y no un color: el motor tiene seis y sólo seis, y elegir entre ellas es
// decir QUÉ clase de suceso es.
let hudMs = null;
let menuMs = null;
/**
 * La munición que el jugador ha elegido a mano con el ciclador, o `null` para
 * la que el motor da de balde. Vive aquí y no en el personaje porque en el
 * juego tampoco se guarda: `player.m_ChosenArrow` es del cliente y se pierde al
 * salir (vgui_quickslot.h:320).
 */
let municionElegida = null;
function suceso(tipo, texto) {
  // Antes de que el HUD exista —durante la carga— no se pierde nada: va a la
  // línea de estado, que es donde iba todo hasta ahora.
  if (!hudMs) { say(texto); return; }
  hudMs.suceso(tipo, texto);
}

// 'colina' no es un .map: el suelo es una malla de altura calculada en el
// momento. Es la tercera forma de relieve, la del artefacto de referencia, y
// la unica en la que qbsp no tiene nada que juzgar. Ver src/map/terrain.js.
const MESH_LEVEL = MAP === "colina";

// 'corinth' es la cuarta forma, y la primera en que el mundo NO sale de un solo
// sitio: el suelo y la muralla son un `.map` que juzga qbsp, y encima van las
// mallas glTF del kit y la roca generada del socavon, que juzga el arnes de
// tools/andar.mjs. Aqui se juntan las dos para dibujar y para chocar.
const KIT_LEVEL = MAP === "corinth";

// 'jharro' es la quinta, y la primera que NO tiene `.map` ni cielo: una ciudad
// excavada en la roca, de ocho plantas, donde todo —suelo, bóveda, paredes,
// túneles— es malla generada. `qbsp` no juzga nada aquí, igual que en el valle
// de malla; lo que hay son 329 comprobaciones en Node y el arnés que se escriba.
//
// Y una diferencia que se ve nada más entrar: bajo tierra no hay sol. Lo que
// está iluminado es lo que existe, y los 58 faroles se repartieron con las dos
// densidades que se midieron de Gate City.
const JHARRO_LEVEL = MAP === "jharro";

// 'gatecity' es la sexta, y la unica que no es nuestra: es `gatecity.bsp` de
// DrKill leido con el lector de `src/bsp/`. No esta aqui para jugarlo, esta para
// contestar una pregunta -puede esta pila poner en pantalla lo que ese archivo
// pone?- y para eso hace falta tenerlo AL LADO de lo nuestro.
//
// El `.bsp` no se copia: se queda en ../MSC/ y lo extraido vive en build/, que no
// se publica. Ver `tools/gatecity.mjs` y build/gatecity/PROCEDENCIA.md.
//
// Y su camino es aparte de principio a fin, porque su iluminacion esta HORNEADA:
// `buildScene()` montaria sol, hemisferico y 118 luces puntuales encima del mapa
// de luz, o sea sumaria dos veces la misma luz y lavaria justo el contraste que se
// viene a buscar.
const GATECITY_LEVEL = MAP === "gatecity";

/**
 * Gate City, de principio a fin y por su cuenta.
 *
 * Camino aparte y no una rama dentro de `main()` por dos razones, y la segunda es
 * la que manda:
 *
 *   su escena es otra   nada de sol, hemisferico ni luces puntuales: la luz esta
 *                       horneada en un atlas de 2 MB y sumarle luz dinamica
 *                       lavaria el contraste que es todo el punto.
 *   el jharro no se toca  es la referencia contra la que se mide lo que se aprenda,
 *                       y meter ramas en el camino que lo dibuja es la forma mas
 *                       facil de romperlo sin que lo diga ninguna comprobacion.
 */
/**
 * Hacia donde mira quien acaba de aparecer en Gate City.
 *
 * Al sitio mas despejado, medido con rayos contra la malla de colision. No es
 * presentacion: el punto de llegada de un `.bsp` no declara angulo —se comprobo,
 * los doce `ms_player_spawn` no traen `angle`— asi que con el rumbo por defecto el
 * jugador aparece mirando a donde toque.
 *
 * Es la misma leccion del jharro: la prueba de humo dijo «el jugador esta
 * atascado» y no lo estaba, estaba empujando la pared correcta de un mundo
 * correcto. Aqui daba 1,6 m andados en doce segundos, que es exactamente lo que
 * parece un mundo roto.
 *
 * Dos avisos, y el segundo es nuevo y costo una tanda de capturas:
 *
 *   el primer `step()`  `castRay` no toca NADA hasta que el mundo ha dado uno.
 *                       Sin el devuelve «no hay nada» en todas las direcciones.
 *   ANTES del jugador   esto tiene que llamarse antes de crear la capsula. Si el
 *                       jugador ya existe, el rayo sale de DENTRO de su propio
 *                       colisionador y con `solid=true` devuelve impacto a
 *                       distancia CERO en las veinticuatro direcciones, asi que
 *                       se queda con la primera y devuelve yaw 0 — que es
 *                       exactamente el valor que esto venia a no usar. No da
 *                       error, da el valor por defecto con pinta de calculado.
 */
function rumboDeLlegada(RAPIER, world, pies) {
  world.world.step();
  const ojo = { x: pies[0], y: pies[1] + 1.2, z: pies[2] };
  let mejor = { yaw: 0, libre: -1 };
  const N = 24;
  for (let i = 0; i < N; i++) {
    const yaw = (i / N) * Math.PI * 2;
    // Con yaw 0 se mira hacia -Z y se avanza a (-sen, -cos): la misma formula
    // que `player.js`, invertida en un solo sitio.
    const dir = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
    const golpe = world.world.castRay(new RAPIER.Ray(ojo, dir), 40, true);
    const libre = golpe ? golpe.timeOfImpact : 40;
    if (libre > mejor.libre) mejor = { yaw, libre };
  }
  return mejor.yaw;
}

async function mainGateCity() {
  // LAS TECLAS, lo primero: hacen falta antes que nada porque la pantalla de
  // elegir personaje ya las usa. Los valores por defecto salen del
  // `config.cfg` de la instalacion del juego.
  const teclas = new Teclas();

  // ── EL MAPA SE CARGA DESPUES DE ELEGIR PERSONAJE ────────────────────────
  //
  // Es lo que hace el juego, y hasta ahora lo haciamos al reves: cargabamos
  // Gate City entero —41 650 triangulos, 25 atlas de luz, 69 bichos— y DESPUES
  // preguntabamos quien eres. Eso tenia dos problemas: el jugador esperaba sin
  // poder tocar nada, y la pantalla de escribir el nombre estaba encima de un
  // mapa vivo, que es de donde salio el fallo de que teclear «Kendra» te
  // matara.
  //
  // Lo que hacemos es un poco mejor que el original: la pantalla sale **ya**, y
  // el mapa se carga EN PARALELO mientras se elige. Si se tarda en escribir un
  // nombre, ya esta cargado; y si no, el boton espera y lo dice.
  let mapaListo;
  const elMapa = new Promise((ok) => { mapaListo = ok; });

  let interfaz = null;
  let sesion = null;
  let aparicion = null;
  let catalogoDeObjetos = null;

  // ── LA RED, si se pide: `?red=1` o `?red=ws://otra-maquina:5210/juego` ────
  //
  // Va ANTES de montar la sesión porque en una partida con servidor la lista de
  // personajes no está en este navegador: está allí. El almacén cambia de
  // `AlmacenLocal` a `AlmacenRemoto` y **la pantalla de elegir personaje no se
  // entera** — que era la promesa del §5 de PROYECTO_10.md y resulta ser cierta.
  //
  // Si no hay servidor al otro lado, se sigue en local y se dice. Un juego que
  // no arranca porque la partida está apagada sería peor que uno de un jugador.
  const pedida = new URLSearchParams(location.search).get("red");
  let red = null;
  let enlaceDeRed = null;
  let aparicionDelServidor = null;
  if (pedida) {
    const url = pedida === "1" || pedida === "" ? urlPorDefecto() : pedida;
    try {
      say(`conectando con la partida en ${url}…`);
      enlaceDeRed = await enlaceDeNavegador(url);
      red = new ClienteDeRed({ enlace: enlaceDeRed });
      await new Promise((ok, mal) => {
        const reloj = setTimeout(() => mal(new Error("la partida no se presentó")), 8000);
        red.al("bienvenida", () => { clearTimeout(reloj); ok(); });
        red.hola({ nombre: `jugador${Math.floor(Math.random() * 1000)}` });
      });
      red.al("apareces", (m) => { aparicionDelServidor = m; });
      console.log(`red: partida «${red.partida}», eres el jugador ${red.yo} de ${red.mapa}`);
    } catch (e) {
      console.warn(`sin red (${e?.message ?? e}): se juega en local`);
      try { enlaceDeRed?.cerrar(1000, "sin partida"); } catch {}
      red = null;
      enlaceDeRed = null;
    }
  }
  try {
    const catalogo = await fetch("build/msr/objetos.json").then((r) => (r.ok ? r.json() : null));
    if (catalogo) catalogoDeObjetos = { porId: new Map(catalogo.objetos.map((o) => [o.id, o])) };
    aparicion = await fetch("build/gatecity/aparicion.json").then((r) => (r.ok ? r.json() : null));
    if (!aparicion) {
      console.warn("sin build/gatecity/aparicion.json: se usa el punto del mapa, que es " +
        "una cueva a oscuras con goblins. Corre `npm run gatecity:aparicion`.");
    }
    // Si IndexedDB no esta —una ventana privada, un navegador raro— vale mas un
    // personaje que se pierde al cerrar que una pantalla de error.
    // Las MISMAS cuatro operaciones, al otro lado del cable si hay partida.
    const almacen = red
      ? new AlmacenRemoto(red)
      : (globalThis.indexedDB ? new AlmacenLocal() : new AlmacenMemoria());
    sesion = new Sesion({ almacen, aparicion, catalogo, preparar: () => elMapa });
    // EL CUERPO DEL PERSONAJE, sin esperarlo. `cargarCuerpos` se lleva un mega
    // entre malla, esqueleto y las seis animaciones; con un `await` aqui la
    // pantalla de personajes volveria al segundo y medio, que es precisamente lo
    // que se quito al cargar el mapa despues de elegir. Va como PROMESA y la
    // interfaz abre el hueco vacio y mete la figura cuando llegue.
    const losCuerpos = fetch("build/gatecity/cuerpos.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => (m ? cargarCuerpos(m) : null))
      .catch((e) => { console.warn("sin el modelo del personaje:", e); return null; });
    interfaz = montarInterfaz({ sesion, catalogo, teclas, cuerpos: losCuerpos });
    guardarAlCerrar(sesion);
    // La pantalla de personajes, YA. El mapa viene detras.
    document.getElementById("intro").hidden = true;
    await sesion.arrancar();
  } catch (e) {
    console.warn("el ciclo de sesion no se ha podido montar:", e);
  }

  say("leyendo lo extraido de gatecity.bsp…");
  const level = await gatecityLevel();
  if (!level.mesh.triangleCount) throw new Error("gatecity se cargo vacio");

  say("arrancando fisica…");
  const RAPIER = await initPhysics();
  // La colision es OTRA malla, no la que se dibuja: lleva el cielo -que sella- y
  // no lleva los 859 m2 de `func_illusionary` ni los 451 de agua, que en GoldSrc
  // se atraviesan. Meterlos dejaria al jugador clavado delante de una cortina.
  // EL PERFIL DE MASTER SWORD, y no el de Quake que usan los demas mapas.
  //
  // Los otros tres mundos son nuestros y estan hechos a 32 unidades por metro;
  // Gate City es de GoldSrc y son **39,37**. Con el perfil de Quake el jugador
  // sale un 23 % mas grande y un 23 % mas rapido de lo que el mapa espera, y
  // con el alto, la altura de ojo y el escalon equivocados. Eso no se ve como
  // un fallo: se ve como un mapa un poco pequeno.
  const perfil = perfilMsr(level.unitsPerMetre);
  const world = new World(level.colision, { perfil });
  // El rumbo ANTES del jugador: ver el comentario de `rumboDeLlegada`.
  const rumbo = rumboDeLlegada(RAPIER, world, level.start);
  const player = new Player(world, level.start, { perfil });
  player.yaw = rumbo;

  // El render se crea ANTES de cargar las texturas, y no por gusto: la
  // anisotropia se le pregunta a la TARJETA con `getMaxAnisotropy()`, y sin
  // render no hay a quien preguntarle. Devuelve 1 donde no hay, y entonces esto
  // no hace nada y tampoco rompe nada.
  // `anchoInterno: null` = se dibuja al tamano real del canvas, sin estirar.
  //
  // Los otros mapas dibujan a 320 px y los estiran, que es el aspecto elegido en
  // Corinth. Aqui eso es un error de fidelidad: Master Sword Rebirth corre a
  // 1920x1080 y reproducir su mapa a 320 es reproducirlo a un sexto. Fue lo
  // primero que noto quien lo juega — «tal vez sea la resolucion»— y tenia razon.
  const { renderer, camera, resize } = buildView(canvas, {
    far: 600, anchoInterno: null, espacioDelMotor: true,
  });
  addEventListener("resize", resize);

  say(`cargando ${level.manifiesto.texturas.length} texturas y el mapa de luz…`);
  const { texturas, faltan } = await cargarTexturasBsp(level.manifiesto, {
    // 8, que es `gl_anisotropy` en la configuracion del juego, y no el maximo
    // de la tarjeta: se trata de parecerse a el, no de verse mejor que el.
    anisotropia: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  if (faltan.length) console.warn("texturas que faltan:", faltan.join(", "));
  const atlas = await cargarMapaDeLuz(level.manifiesto);
  // EL RELOJ DEL PARPADEO. `CL_RunLightStyles()` avanza diez veces por segundo;
  // `relojLuz` es el `cl.time` del motor y lo único que se le pasa a `animarLuz`.
  let relojLuz = 0;
  // La textura de atlas que le toca AHORA a un material. Las perillas que
  // apagan o tiñen el mapa de luz tienen que volver a ÉSTA y no a una fija, o al
  // encenderlas otra vez se quedaría el mapa congelado en la variante 0.
  const atlasDe = (m) => atlas.texturaEnT(m.userData.cubo ?? "quieta", relojLuz);
  // Las texturas de DETALLE: 58 de las 80 del mundo llevan una, y el juego las
  // dibuja (`opengl.cfg`, `r_detailtextures "1"`). Ver `escenaGateCity`.
  const detalle = await cargarDetalle(level.manifiesto, {
    anisotropia: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });

  // El CIELO: las seis caras de `nature1` que GoldSrc carga de `gfx/env/`. Si
  // faltan, `cargarCielo` devuelve null y el mapa vuelve al color plano de
  // `light_environment`, que es lo que habia.
  const cajaDeCielo = await cargarCielo(level.manifiesto);

  const { escena, mundo, velo, materiales, grupos, aguas, detalle: mallaDetalle, gruposDetalle,
          cielo: mallaCielo, animarLuz, material: materialDelMapa } =
    escenaGateCity(level, texturas, atlas, { detalle, cielo: cajaDeCielo });

  // LAS PUERTAS, que hasta ahora eran pared.
  //
  // Nueve `func_door_rotating` estaban horneadas dentro del trimesh del mundo:
  // existian como dibujo y como obstaculo, y no como puerta. Ahora cada una
  // tiene su malla, su bisagra y su colisionador cinematico, y gira 90 grados a
  // 100 por segundo — que son los numeros que trae cada entidad del `.bsp`.
  const puertas = montarPuertas(level.manifiesto, level.bin, {
    materialDe: materialDelMapa, mundo: world.world, RAPIER,
  });
  if (puertas) escena.add(puertas.grupo);

  // Y LOS VOLUMENES: el agua, las dos escaleras y el plano de la muerte.
  //
  // Se pregunta con los PLANOS de cada brush y no con su caja envolvente, y no
  // es celo: el estanque grande es un contorno irregular que llena el 64 % de
  // su caja, asi que con la envolvente un tercio de la orilla habria sido agua.
  const volumenes = new Volumenes(level.manifiesto.interactivas ?? {}, {
    unidadesPorMetro: level.unitsPerMetre,
  });

  // EL SONIDO. La regla en `play/sonido.js`, la reproduccion en `play/audio.js`
  // y los archivos en `build/gatecity/snd/`, que los trae `npm run sonido` de
  // la instalacion de al lado. Nada de esto va a `public/`.
  //
  // Y el contexto NACE SUSPENDIDO: ningun navegador deja sonar sin un gesto, y
  // `resume()` solo funciona dentro del manejador del gesto. Por eso se despierta
  // en el primer clic o tecla y no al cargar. Sin esto «no suena» y no hay error.
  const audio = new Audio({ base: "build/gatecity", unidadesPorMetro: level.unitsPerMetre });
  const catalogoSonido = await audio.cargar();
  const pasos = new Pasos({ multijugador: true });
  let ambienteMontado = false;
  // Cuantas veces una puerta ha PEDIDO su sonido. Se cuenta aparte de si suena
  // porque `doors/doormove9.wav` no esta en el juego: sin este contador, «la
  // puerta no hace ruido» no distingue entre no pedirlo y no tenerlo.
  let pedidosDePuerta = 0;
  let ambienteSinArchivo = 0;
  const despertarAudio = async () => {
    if (!(await audio.despertar())) return;
    if (ambienteMontado) return;
    ambienteMontado = true;
    // Los `ambient_generic`: cinco puntos, en bucle y atenuados por su radio.
    // `SF_AMBIENT_SOUND_START_SILENT` (2) es una decision de la entidad, no un
    // fallo: dos de las antorchas empiezan calladas y esperan a que las usen.
    for (const a of level.manifiesto.interactivas?.ambiente ?? []) {
      if (a.empiezaCallado) continue;
      // No se pide lo que el catalogo dice que no esta. `ambience/drips.wav`
      // es de Half-Life y Rebirth no lo trae, y pedirlo igual no da 404: el
      // servidor de desarrollo devuelve `index.html` con estado 200 y el fallo
      // aparece dos pasos mas tarde, como «no se puede decodificar el audio».
      if (!catalogoSonido?.ambiente?.[a.sonido]) { ambienteSinArchivo++; continue; }
      audio.bucle(`snd/${a.sonido}`, {
        volumen: a.volumen, donde: a.donde, tono: a.tono,
        radio: a.sinAtenuar ? 1e6 : a.radio,
      });
    }
  };
  addEventListener("pointerdown", despertarAudio, { once: false });
  addEventListener("keydown", despertarAudio, { once: false });

  // QUE SE PISA. `PM_CatagorizeTextureType` traza 64 unidades hacia abajo y se
  // queda con la textura de lo que toca; aqui es el mismo trazo contra la malla
  // del mundo. El indice de material de la cara da el grupo, y el grupo su
  // textura — por eso hace falta la lista de grupos EN EL ORDEN de la malla y
  // no la del manifiesto.
  const rayoAlSuelo = new THREE.Raycaster();
  rayoAlSuelo.far = 64 / level.unitsPerMetre;
  const ABAJO = new THREE.Vector3(0, -1, 0);
  const tablaMateriales = catalogoSonido?.materiales ?? null;
  function materialBajoLosPies(pies) {
    if (!tablaMateriales) return "piedra";
    rayoAlSuelo.set(new THREE.Vector3(pies[0], pies[1] + 0.1, pies[2]), ABAJO);
    const golpe = rayoAlSuelo.intersectObject(mundo, false)[0];
    const g = golpe && grupos[golpe.face?.materialIndex ?? -1];
    return materialDe(g?.texture ?? "", tablaMateriales);
  }

  // Las antorchas. Es lo que contesta a «el mapa original emitia luces desde
  // antorchas»: la LUZ ya estaba horneada —`pi_lantern` a 181 sobre 255 contra la
  // roca a 17— y lo que faltaba era la llama, que es `Fire1.spr` puesto 55 veces.
  say("montando las antorchas...");
  const carteles = await cargarCarteles(level.manifiesto);
  escena.add(carteles.grupo);

  // Los adornos: los 101 `env_model` de 17 ficheros `.mdl`, leídos de
  // `../MSC/assets/msr/models/` y extraídos a `build/`. Ver `cargarAdornos`.
  // LOS BICHOS: los 69 NPC y monstruos que el mapa coloca, con el modelo que
  // dice su `.script` y la animación que ese script nombra. Ver
  // `tools/bichos.mjs` y `src/render/bichos.js`.
  say("montando los bichos...");
  let bichos = null;
  // El manifiesto se guarda, no sólo se consume: desde el 19 trae la tabla de
  // razas entera, que es lo que hace falta para saber a quién avisa un bicho al
  // morir — «aliado» es una relación entre DOS bichos, no con el jugador.
  let censoDeBichos = null;
  try {
    const censo = await fetch("build/gatecity/bichos.json").then((r) => (r.ok ? r.json() : null));
    censoDeBichos = censo;
    bichos = censo ? await cargarBichos(censo) : null;
    if (bichos) escena.add(bichos.grupo);
  } catch (e) {
    console.warn("los bichos no se han podido montar:", e);
  }

  // Los ADORNOS QUE SE MUEVEN van por el mismo camino que los bichos, porque
  // son lo mismo: una malla con esqueleto y una animacion en bucle. Son 10 de
  // 101 —el arbol, el farol y las velas—; las otras 91 no mueven ni un vertice
  // y siguen fundidas en una sola malla. Ver `recorridoDeModelo()`.
  let adornosVivos = null;
  try {
    const censo = await fetch("build/gatecity/adornosvivos.json").then((r) => (r.ok ? r.json() : null));
    adornosVivos = censo ? await cargarBichos(censo) : null;
    if (adornosVivos) escena.add(adornosVivos.grupo);
  } catch (e) {
    console.warn("los adornos vivos no se han podido montar:", e);
  }

  // ── LOS OTROS JUGADORES, y la red atada al cuerpo ───────────────────────
  //
  // Se carga el modelo del personaje —el mismo `reference.mdl` de la hoja— y se
  // le dice a la red dos cosas: cuál es el cuerpo que predice, y CÓMO se corre
  // una orden. Lo segundo importa más de lo que parece: el bucle de aquí abajo
  // pregunta el agua y la escalera en cada paso y saca la velocidad del
  // personaje, así que si la red rehiciera las órdenes con su propio paso
  // reducido, cada corrección metería un error en vez de quitarlo.
  let otros = null;
  if (red) {
    try {
      otros = await cargarOtros({ U: level.unitsPerMetre });
      if (otros) escena.add(otros.grupo);
    } catch (e) {
      console.warn("los otros jugadores no se han podido montar:", e);
    }
    red.cuerpo = player;
    red.simular = (cuerpo, o) => {
      const pies = cuerpo.feet;
      cuerpo.yaw = o.yaw;
      cuerpo.pitch = o.cabeceo;
      cuerpo.step(o.msec / 1000, {
        forward: o.adelante, strafe: o.lado,
        jump: (o.botones & BOTON.SALTAR) !== 0,
        agachar: (o.botones & BOTON.AGACHAR) !== 0,
        maxima: o.maxima ?? undefined,
        agua: volumenes.nivelDeAguaEn(pies, { agachado: (o.botones & BOTON.AGACHAR) !== 0 }),
        escalera: volumenes.escaleraEn(pies),
      });
    };
  }

  // LO QUE CHOCA Y NO ES EL MAPA.
  //
  // Hasta ahora solo chocaba el `.bsp`: se andaba a traves del barril, de la
  // silla y del goblin. Y NO todos chocan, que es lo primero que dice el mod:
  // un `env_model` solo es solido si trae `dmg` (`msmapents.cpp:311`), y en
  // Gate City eso son 76 de 91. Los helechos, el carro y la carreta se
  // atraviesan en el juego original tambien.
  const solidos = solidosDeAdornos(level.manifiesto, world.world, RAPIER);
  const bichosSolidos = solidosDeBichos(bichos, world.world, RAPIER, {
    unidadesPorMetro: level.unitsPerMetre,
  });
  if (solidos || bichosSolidos) {
    console.info(
      `colision: ${solidos?.n ?? 0} adornos de ${solidos?.deCuantos ?? 0} ` +
      `(${solidos?.atravesables ?? 0} se atraviesan, como en el juego) y ` +
      `${bichosSolidos?.n ?? 0} bichos de ${bichosSolidos?.deCuantos ?? 0}`
    );
  }

  // EL CICLO DE SESION: quien eres, donde apareces y que pasa cuando mueres.
  //
  // El mapa sigue sin saber que existe un personaje —toda la logica vive en
  // `src/juego/sesion.js`, sin DOM y sin Three, para que el dia que haya
  // servidor corra igual alli— y lo unico que este archivo hace es escuchar
  // dos sucesos: `aparece`, que teletransporta la capsula, y `estado`, que
  // decide si el jugador puede moverse.
  //
  // DONDE apareces no es una constante: sale de `build/gatecity/aparicion.json`,
  // que lo mide `npm run gatecity:aparicion`. Es el templo, y el templo no lo
  // elegimos nosotros — de los 2884 scripts del mod, los CUATRO que incluyen
  // `help/first_npc` («este es el primer NPC que ves») son los sacerdotes de
  // los templos de Gate City y Edana.
  // Y ahora que hay jugador y mundo, la sesion puede colocarlo. Estos dos
  // enganches van AQUI y no arriba porque necesitan la capsula, que no existe
  // hasta que el mapa esta leido.
  if (sesion) {
    // Aparecer: la sesion dice DONDE y esto mueve la capsula. Los pies vienen en
    // ejes de escena y ya proyectados al suelo por el arbol BSP, asi que no hay
    // que restarle ninguna constante de altura.
    sesion.al("aparece", ({ donde }) => {
      // Con servidor, el sitio lo dice ÉL: puede haberte apartado del punto de
      // aparición porque ya había alguien de pie encima.
      const pies = (red && aparicionDelServidor?.pies) || donde?.escena || level.start;
      player.body.setTranslation(
        { x: pies[0], y: pies[1] + player.centreOffset + 0.1, z: pies[2] },
        true
      );
      player.velocityY = 0;
      // Mirando a lo despejado. El rumbo VIENE MEDIDO del fichero y no se
      // calcula aqui: `rumboDeLlegada()` lanza rayos desde dentro de la propia
      // capsula, y al reaparecer la capsula ya existe, asi que devolveria cero
      // en las veinticuatro direcciones — el fallo que esta documentado veinte
      // lineas mas arriba en este mismo archivo, y en el que cai igual. Lo mide
      // `tools/aparicion.mjs` con el arbol BSP, donde no hay capsula.
      if (Number.isFinite(donde?.yaw)) player.yaw = donde.yaw;
      player.pitch = 0;
      visita = -1;
      // `Stamina = MaxStamina()` al aparecer, como `CBasePlayer::Spawn()`. Y
      // la velocidad a cero: heredar la de antes de morir es reaparecer
      // corriendo.
      player.vel = [0, 0, 0];
      player.caida = 0;
      corriendo = false;
      aguante = vitalesDelPersonaje().aguanteMax;
      // EL ARMA EN LA MANO. Va aquí y no al crear el personaje porque también
      // hay que volver a empuñarla al reaparecer, y porque hasta que la sesión
      // no dice quién eres no se sabe qué arma elegiste.
      empunar(sesion.personaje?.manos?.derecha);
      // Y EL ESCUDO en la otra, si lleva uno. `CreateChar` no da ninguno —se
      // compran— pero el personaje guarda la mano izquierda, así que al
      // reaparecer vuelve el que llevaba.
      embrazar(sesion.personaje?.manos?.izquierda);
      // Y el muñeco del género del personaje: es un submodelo distinto, y con
      // el de siempre una personaja se ve a sí misma con el cuerpo del otro.
      ponerMuneco(sesion.personaje?.genero ?? "male");
      // Y LAS RANURAS, por la misma razón que el arma: el motor las manda al
      // cliente en el mensaje 21, «Retrieve all quickslots (Sent at spawn)»
      // (clplayer.cpp:1503). Al aparecer, no al conectar.
      recobrarRanuras();
      // AL APARECER SE HABLA POR LA CONSOLA, no por la línea de carga.
      //
      // Son dos cosas distintas y por eso van en dos líneas: dónde has caído es
      // un suceso del juego, y las teclas son una nota de trabajo. Las dos se
      // van solas a los pocos segundos, que es lo que hace la consola — la
      // línea de estado se quedaba ahí para siempre.
      suceso("normal", `${sesion.personaje.nombre} aparece en ${donde?.nombre ?? "la llegada del mapa"}` +
        ` — luz ${donde?.luz ?? "?"}/255, ${donde?.hostiles15 ?? "?"} hostiles a 15 m`);
      suceso("nopuedes", "1 arma · 4 munición · F1-F12 ranuras · Esc el menú · " +
        "P la hoja · I el inventario · N más armas · B el escudo · K morir");
    });
    // Soltar el raton al morir: la pantalla de muerte tiene un boton y con el
    // puntero capturado no se puede pulsar.
    sesion.al("muerte", () => { document.exitPointerLock?.(); });
  }

  say("montando los adornos...");
  const adornos = await cargarAdornos(level, atlas, {
    anisotropia: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  escena.add(adornos.grupo);
  const THREE_FRONT = THREE.FrontSide;
  const THREE_BACK = THREE.BackSide;

  // --- el GLOW: la luz que lleva el jugador ---------------------------------
  //
  // No esta en el `.bsp` y no es una capacidad que falte: es MECANICA DE JUEGO.
  // Quien jugo Gate City lo dijo exacto — el mapa era muy oscuro, sobre todo en
  // las cavernas, y los jugadores solo podian guiarse con el hechizo `glow`. Y la
  // medida le da la razon: el 62,7 % de la superficie iluminada del mapa tiene el
  // mapa de luz por debajo de 32 sobre 255.
  //
  // Va colgada de la CAMARA y no del jugador, porque lo que ilumina es lo que se
  // mira. Y se apaga con la L, que es lo que permite ver el mapa como lo hornea el
  // compilador — las dos cosas se miden en `tools/gatecity_shot.mjs`.
  const glow = new THREE.PointLight(
    GLOW.color,
    GLOW.candela,
    GLOW.alcance * GLOW.radio,
    GLOW.decaimiento
  );
  glow.name = "glow";
  camera.add(glow);
  escena.add(camera);

  document.getElementById("intro").hidden = true;

  // EL HUD DEL EXPERIMENTO 03 SE VA.
  //
  // Los contadores de la esquina —«ANDADO 0.0 m · POS 88 −415 · PIES suelo»— y
  // el recuadro de «WASD andar · Raton mirar» son de la sonda minima del
  // experimento 03, y llevan diez experimentos en pantalla. En un juego no
  // pintan nada: no los tiene Master Sword y no los tiene ningun juego.
  //
  // No se BORRAN, se esconden: las sondas los leen, y son la unica forma de
  // ver a ojo si la fisica va bien mientras se trabaja. **F3** los enseña, que
  // es donde los pone todo el mundo.
  hud.hidden = true;
  // Y LA LÍNEA DE ABAJO TAMBIÉN, en cuanto el mapa está puesto.
  //
  // Hasta el 23 se quedaba haciendo de consola de sucesos «porque el juego
  // tiene una y lleva `setBgColor(0,0,20,128)`». Tener el color de la consola
  // no la convierte en la consola: la del juego apila cinco líneas, las suelta
  // de una en una y las colorea por tipo de suceso. Una sola línea que se
  // sobreescribe es lo contrario de eso.
  //
  // Ahora la consola de verdad está en `src/juego/hudms.js` y la línea vuelve a
  // ser lo que era: el andamio de la carga. Se vacía aquí, y `say()` la esconde
  // sola mientras esté vacía — las teclas de trabajo (T, L, la rueda de
  // escudos) la siguen usando y la vuelven a enseñar cuando dicen algo.
  say("");

  // ── EL HUD DE MASTER SWORD ────────────────────────────────────────────────
  //
  // Las cuatro barras salen de `sprites/hud/*.spr`, que hornea `npm run hud`.
  // Si no está horneado, se monta igual: la consola de sucesos no necesita
  // ningún asset, y quedarse sin los mensajes por un `.png` que falta sería
  // perder justo lo que hace falta cuando algo va mal.
  let fichaDelHud = null;
  try {
    const m = await fetch("build/gatecity/hud.json").then((r) => (r.ok ? r.json() : null));
    if (m) fichaDelHud = { ...m, base: "build/gatecity/" };
  } catch (e) {
    console.warn("el HUD no está horneado (`npm run hud`):", e);
  }
  hudMs = montarHud({ ficha: fichaDelHud });

  // ── EL MENÚ PRINCIPAL ─────────────────────────────────────────────────────
  //
  // `gamemenu.res` con el fondo de la torre, que hornea `npm run menu`. Igual
  // que el HUD: si no está horneado se monta sin fondo y sin sonidos, porque lo
  // que hay detrás —cambiar las teclas— hace falta justo cuando algo falla.
  let fichaDelMenu = null;
  try {
    const m = await fetch("build/gatecity/menu.json").then((r) => (r.ok ? r.json() : null));
    if (m) fichaDelMenu = { ...m, base: "build/gatecity/" };
  } catch (e) {
    console.warn("el menú no está horneado (`npm run menu`):", e);
  }
  menuMs = montarMenu({
    ficha: fichaDelMenu,
    hacer({ que }) {
      if (que === "cerrar") { menuMs.cerrar(); return true; }
      if (que === "opciones" || que === "nombrar") {
        // «Name Character» y «Options» comparten comando en el archivo del
        // juego; aquí van a sitios distintos porque es lo que dicen.
        menuMs.cerrar();
        if (que === "nombrar") interfaz?.elegir?.();
        else interfaz?.opciones?.();
        return true;
      }
      if (que === "desconectar") {
        menuMs.cerrar();
        sesion?.guardar({ forzar: true });
        interfaz?.elegir?.();
        return true;
      }
      return false;
    },
  });

  // ── EL CICLADOR Y LAS DOCE RANURAS ────────────────────────────────────────
  //
  // La regla está en `src/play/ranuras.js`. Aquí sólo se le dice qué hay: qué
  // armas lleva encima, qué hechizos sabe (ninguno todavía) y qué munición.
  const ciclador = new Ciclador();
  let ranuras = new Ranuras();
  // La voz de la barra de carga, que tiene memoria y por eso no es una función:
  // sólo suena al superar el nivel más alto alcanzado, y ese nivel no se
  // reinicia al soltar. Ver `VozDeLaCarga` en `src/play/golpe.js`.
  const vozDeLaCarga = new VozDeLaCarga();

  /**
   * Las ranuras del personaje al entrar, y las del personaje al grabar.
   *
   * Aquí está lo que el motor hace en `player.cpp:6514`: las ranuras vienen del
   * documento y las de OBJETO se comprueban contra lo que llevas encima; las
   * que apuntan a algo que ya no tienes se apagan sin decir nada.
   */
  function recobrarRanuras() {
    const p = sesion?.personaje ?? null;
    if (!p) { ranuras = new Ranuras(); return; }
    const nombres = {};
    for (const [id, a] of catalogoDeArmas ?? []) nombres[id] = a.nombre ?? id;
    for (const [id, f] of catalogoDeFlechas ?? []) nombres[id] = f.nombre ?? id;
    const { ranuras: puestas, perdidas } = cargarRanuras(p.ranuras, {
      // La mano cuenta: una ranura con el arma que llevas puesta sigue valiendo.
      objetos: [...(p.objetos ?? []), p.manos?.derecha, p.manos?.izquierda].filter(Boolean),
      nombres,
    });
    ranuras = new Ranuras({ guardadas: puestas });
    if (perdidas.length) {
      suceso("normal", `${perdidas.length} ranura${perdidas.length > 1 ? "s" : ""} ` +
        `apuntaba${perdidas.length > 1 ? "n" : ""} a algo que ya no llevas`);
    }
  }

  /** Y al revés: al documento, que es quien las guarda. */
  function apuntarRanuras() {
    if (!sesion?.personaje) return;
    sesion.personaje.ranuras = ranuras.aGuardar();
    sesion.tocado?.();
  }

  /** Lo que el ciclador necesita saber del personaje AHORA. */
  function mundoDelCiclador() {
    const p = sesion?.personaje ?? null;
    const enMano = p?.manos?.derecha ?? null;
    const objetos = (p?.objetos ?? [])
      .filter((o) => o?.id && catalogoDeArmas?.has(o.id))
      .map((o) => ({
        id: o.id,
        nombre: catalogoDeArmas.get(o.id)?.nombre ?? o.id,
        // «Arma» en el motor es «tiene ataques», no una categoría.
        arma: Boolean(catalogoDeArmas.get(o.id)?.ataques?.length),
        enMano: o.id === enMano,
      }));
    const flechas = (p?.objetos ?? [])
      .filter((o) => o?.id && catalogoDeFlechas?.has(o.id) && !o.id.endsWith("_generic"))
      .map((o) => ({ id: o.id, nombre: catalogoDeFlechas.get(o.id)?.nombre ?? o.id }));
    return {
      objetos, flechas,
      // `player.m_SpellList` está VACÍA: en Master Sword los hechizos se
      // aprenden de los libros y no hay ninguno puesto todavía. El ciclador lo
      // nota solo y no enseña nada, que es lo que hace el juego.
      hechizos: [],
      armaEnMano: brazo?.arma ?? null,
    };
  }

  /** Suena uno de los tres wavs de la interfaz. */
  function sonarInterfaz(archivo) {
    if (!archivo || !fichaDelMenu) return;
    try {
      const a = new Audio(`build/gatecity/snd/${archivo.split("/").slice(-2).join("/")}`);
      const p = a.play();
      if (p?.catch) p.catch(() => {});
    } catch { /* el navegador manda */ }
  }

  /** Pinta lo que el ciclador tenga puesto. Se llama después de cada cambio. */
  const pintarCiclador = () => hudMs?.ranura(ciclador.etiqueta);

  /** Una pulsación de ciclar. `clave` es `weapon`, `spell` o `arrow`. */
  function ciclar(clave) {
    sonarInterfaz(ciclador.elegir(clave, mundoDelCiclador()));
    pintarCiclador();
  }

  /**
   * Aceptar lo que esté en la etiqueta. Devuelve `true` si había algo, y el que
   * llama tiene que COMERSE el botón: `if (QuickSlotConfirm())
   * player.BlockButton(IN_ATTACK);` (clplayer.cpp:558-562).
   */
  function confirmarCiclador() {
    const orden = ciclador.confirmar();
    pintarCiclador();
    if (!orden) return false;
    cumplir(orden);
    return true;
  }

  /** Hacer lo que dice una orden del ciclador o de una ranura. */
  function cumplir(orden) {
    if (!orden) return;
    sonarInterfaz(orden.sonido);
    if (orden.que === "empunar" && sesion?.personaje) {
      // Lo que llevabas vuelve a la mochila y lo nuevo sale de ella: el motor
      // lo dice con `inv transfer <id> 0`, donde el 0 es la mano.
      const antes = sesion.personaje.manos.derecha;
      sesion.personaje.objetos = (sesion.personaje.objetos ?? []).filter((o) => o.id !== orden.id);
      if (antes) sesion.personaje.objetos.push({ id: antes, n: 1 });
      sesion.personaje.manos.derecha = orden.id;
      sesion.tocado?.();
      empunar(orden.id);
      suceso("normal", `Empuñas ${orden.nombre}`);
    } else if (orden.que === "elegirMunicion") {
      municionElegida = orden.infinita ? null : orden.id;
      suceso("normal", `Munición: ${orden.nombre}`);
    } else if (orden.que === "preparar") {
      suceso("nopuedes", `No sabes ningún hechizo todavía`);
    }
  }

  const keys = new Set();
  // T recorre los ocho pueblos.
  //
  // No es una comodidad: Gate City deja **47 m de cueva entre la llegada y la
  // primera casa**, a proposito, y esa es una de las cifras que el jharro copio.
  // Quien lo anduvo dijo «el lugar de inicio esta fuera de los interiores» y
  // tenia razon — pero el mapa esta bien y lo que faltaba era poder IR a mirarlos.
  // Los ocho sitios salen del archivo: la cara de suelo mayor de cada `msarea_town`
  // que ademas tiene hueco encima. Ver `tools/gatecity.mjs`.
  let visita = -1;
  function vaAlPueblo() {
    if (!level.pueblos.length) return;
    visita = (visita + 1) % level.pueblos.length;
    const p = level.pueblos[visita];
    player.body.setTranslation(
      { x: p.escena[0], y: p.escena[1] + player.centreOffset + 0.5, z: p.escena[2] },
      true
    );
    player.velocityY = 0;
    say(`pueblo ${visita + 1} de ${level.pueblos.length}: ${p.suelo.toFixed(0)} m2 de suelo en ` +
      `${p.suelos} caras · T para el siguiente, R para volver a la llegada`);
  }
  /**
   * ¿Esta el jugador ESCRIBIENDO?
   *
   * Hay que preguntarlo antes de tocar nada, y no es una comodidad: es un
   * fallo que se ve poco y hace mucho dano. Escribiendo el nombre de un
   * personaje, cada letra llegaba tambien a las perillas del visor, asi que
   * teclear «Kendra» te MATABA (la K), «Theobold» te teletransportaba (la T) y
   * la R te devolvia a la cueva del principio. El personaje no se llegaba a
   * crear y el mapa se movia solo debajo.
   *
   * La comprobacion cubre tres cosas y no una: `input`, `textarea` y
   * `contenteditable`. Con solo `HTMLInputElement` —que era lo que habia— un
   * area de texto se cuela.
   */
  const escribiendo = (e) => {
    const n = e.target;
    return n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement ||
      (n instanceof HTMLElement && n.isContentEditable);
  };

  addEventListener("keydown", (e) => {
    // Escribiendo no pasa NADA al juego: ni acciones ni perillas. Y la Escape
    // si pasa, porque es la que cierra el panel donde se esta escribiendo.
    if (escribiendo(e) && e.code !== "Escape") return;
    // Y con una pantalla delante tampoco corren las perillas del visor: con el
    // inventario abierto, la I no deberia teletransportar a nadie.
    const conPanel = Boolean(interfaz?.abierta);
    keys.add(e.code);
    // Dos juegos de teclas, y la separacion es a proposito: `teclas` son las
    // ACCIONES DE JUEGO, que el jugador reasigna y que cuentan como
    // `pev->button`; `keys` son las perillas del VISOR (T, R, O, L, K), que
    // son andamio y no se reasignan porque no forman parte del juego.
    teclas.abajo(e.code);
    // F3 enseña o esconde los contadores del experimento 03. Va ANTES de la
    // regla de «con un panel delante no corren las perillas» porque no es una
    // perilla del juego: no mueve nada ni cambia el estado, solo enseña
    // numeros. Y con la hoja de personaje abierta es justo cuando uno quiere
    // mirarlos.
    if (e.code === "F3") { hud.hidden = !hud.hidden; e.preventDefault(); return; }
    // RePÁG Y AVPÁG recorren la consola de sucesos, igual que en el juego:
    // `HUD_StepInput(HUDSCROLL_UP/DOWN)` → `VGUI_EventConsole::StepInput`. Van
    // antes del `conPanel` por lo mismo que la F3 — mirar lo que pasó no es
    // jugar, y con una ventana delante es justo cuando se quiere releer.
    if (e.code === "PageUp" || e.code === "PageDown") {
      hudMs?.desplazar(e.code === "PageDown");
      e.preventDefault();
      return;
    }
    // EL MENÚ PRINCIPAL. Va antes que todo lo demás porque es la salida: con
    // el menú puesto no corre nada del juego, y con un panel del juego delante
    // la Escape la atiende el panel —cierra lo que está abierto— que es el
    // orden en que uno espera que funcione una tecla que sirve para salir.
    if (e.code === "Escape" && !interfaz?.abierta) {
      menuMs?.alternar(Boolean(sesion?.personaje));
      e.preventDefault();
      return;
    }
    if (menuMs?.abierto) return;
    if (conPanel) return;

    // ── CICLAR Y LAS DOCE RANURAS ─────────────────────────────────────────
    //
    // Por ACCIÓN y no por tecla: el `1` es un `bind` del juego, no una
    // constante suya, y aquí es un valor por defecto que se cambia en las
    // opciones como cualquier otro.
    const accion = teclas.accionDe(e.code);
    if (accion === "ciclarArma" || accion === "ciclarHechizo" || accion === "ciclarMunicion") {
      ciclar({ ciclarArma: "weapon", ciclarHechizo: "spell", ciclarMunicion: "arrow" }[accion]);
      e.preventDefault();
      return;
    }
    if (accion === "correrRanuras12") { ranuras.desplazar(12); e.preventDefault(); return; }
    if (accion === "correrRanuras24") { ranuras.desplazar(24); e.preventDefault(); return; }
    const cual = RANURAS.indexOf(accion);
    if (cual >= 0) {
      // `e.repeat` es la clave: aguantar una tecla en un navegador dispara
      // `keydown` cada 30 ms, y sin esto el cronómetro de los dos segundos se
      // reiniciaría en cada repetición y no se grabaría NUNCA.
      if (!e.repeat) ranuras.pulsar(cual + 1);
      e.preventDefault();
      return;
    }
    if (e.code === "KeyR") {
      player.body.setTranslation(
        { x: level.start[0], y: level.start[1] + player.centreOffset, z: level.start[2] },
        true
      );
      player.velocityY = 0;
      player.yaw = rumbo;
      visita = -1;
    }
    if (e.code === "KeyT") vaAlPueblo();
    // La O y no la P: la P es la hoja de personaje en el `config.cfg` del
    // juego (`bind "p" "playerinfo"`), y el paseo de los bichos es una sonda.
    if (e.code === "KeyO") {
      paseando = !paseando;
      say(paseando
        ? `los bichos PIENSAN: 'npcatk_hunt' para los 33 hostiles y 'SetWanderDest' ` +
          `para los 53 que declaran 'roam 1'. Andan a la velocidad que dice su propio ` +
          `.mdl (el goblin, 0,92 m/s).`
        : `los bichos CONGELADOS, cada uno con su animacion de estar parado. ` +
          `Asi se abria el juego hasta el 21, y no era a proposito.`);
    }
    if (e.code === "KeyL") {
      glow.visible = !glow.visible;
      say(glow.visible
        ? `glow encendido: ${GLOW.alcance} m de alcance, el color de 'pi_lantern' del propio mapa`
        : `glow APAGADO: el mapa tal como lo horneo el compilador. El 63 % de su superficie ` +
          `esta por debajo de 32/255, y asi se jugaba sin el hechizo`);
    }
    // K: morirse.
    //
    // Es un andamio y se dice: todavia no hay nada en el mapa que te haga dano
    // —eso es el paso 3— y sin una forma de morir, la mitad del ciclo de sesion
    // no se puede ni ver ni comprobar en pantalla. El dia que un goblin pegue,
    // esta tecla sobra y se quita.
    if (e.code === "KeyK" && sesion?.estado === ESTADO.JUGANDO) {
      sesion.danar(99999, { porQue: "la tecla K", deQuien: "nadie", tipo: "monstruo" });
    }
    // B: el escudo, y es otro andamio declarado como la K.
    //
    // En Master Sword un escudo SE COMPRA: `CreateChar` no da ninguno, los seis
    // `item_tk_shields_*` del catalogo son vales de tienda y Gate City no tiene
    // ni uno en el suelo. O sea que sin tiendas no hay forma de conseguirlo
    // jugando, y sin escudo no se puede ver ni comprobar la mitad de la defensa.
    // El dia que haya tiendas, esta tecla sobra.
    if (e.code === "KeyB") {
      const lista = [...(catalogoDeEscudos?.keys() ?? [])];
      if (!lista.length) { say("no hay escudos horneados: `npm run escudos`"); return; }
      const i = brazal?.objeto?.id ? lista.indexOf(brazal.objeto.id) : -1;
      // Se recorren en circulo y el ultimo paso es SIN escudo, que tambien es un
      // estado del juego y el que trae de serie un personaje nuevo.
      const siguiente = i + 1 >= lista.length ? null : lista[i + 1];
      embrazar(siguiente).then(() => {
        if (sesion?.personaje) sesion.personaje.manos.izquierda = siguiente;
        const f = brazal?.ficha;
        say(siguiente && f
          ? `${brazal.objeto.nombre}: arriba bloquea el ${f.bloqueoArriba} % y deja pasar ` +
            `el ${Math.round((f.danoQuePasa ?? 1) * 100)} % (te llevas el ` +
            `${Math.round((f.bloqueoArriba / 100) * f.danoQuePasa * 100 + (1 - f.bloqueoArriba / 100) * 100)} %); ` +
            `abajo anula el golpe entero el ${f.bloqueoAbajo} % de las veces. ` +
            `Boton DERECHO para levantarlo, y mientras lo aguantas no puedes atacar.`
          : "sin escudo, que es con lo que empieza un personaje de verdad");
      });
    }
    // N: las otras seis armas de partida en la mochila. Andamio declarado,
    // como la K y la B.
    //
    // `reg.newchar.weaponlist` ofrece SIETE armas y te quedas con una: las
    // otras seis se compran o se encuentran, y en Gate City no hay ni tiendas ni
    // ninguna en el suelo. O sea que hoy no hay forma de tener dos armas, y sin
    // dos armas el ciclador es una tecla que no hace nada — se ve vacío y no se
    // puede distinguir de estar roto. El día que haya tiendas, esta tecla sobra.
    if (e.code === "KeyN" && sesion?.personaje) {
      const p = sesion.personaje;
      const puestas = [];
      // La lista sale del catálogo del JUEGO (`reg.newchar.weaponlist`), no de
      // una constante aquí: son las mismas siete entre las que elige quien crea
      // un personaje.
      for (const id of (sesion.catalogo?.nuevoPersonaje?.armas ?? [])) {
        if (id === p.manos?.derecha) continue;
        if ((p.objetos ?? []).some((o) => o.id === id)) continue;
        if (!catalogoDeArmas?.has(id)) continue;
        (p.objetos ??= []).push({ id, n: 1 });
        puestas.push(catalogoDeArmas.get(id)?.nombre ?? id);
      }
      sesion.tocado?.();
      suceso(puestas.length ? "bueno" : "nopuedes", puestas.length
        ? `A la mochila: ${puestas.join(", ")} — andamio, en el juego se compran`
        : "ya las llevas todas");
    }
    if (["Space", "KeyW", "KeyA", "KeyS", "KeyD", "Tab"].includes(e.code)) e.preventDefault();
  });
  addEventListener("keyup", (e) => {
    keys.delete(e.code);
    const accion = teclas.accionDe(e.code);
    if (accion === "correrRanuras12" || accion === "correrRanuras24") ranuras.desplazar(0);
    const cual = RANURAS.indexOf(accion);
    // Soltar antes de los dos segundos USA la ranura; soltar después no hace
    // nada, porque grabar ya pasó al cumplirse el tiempo.
    if (cual >= 0) cumplir(ranuras.soltar(cual + 1));
    teclas.arriba(e.code);
  });
  addEventListener("blur", () => { keys.clear(); teclas.soltarTodo(); });
  // El raton tambien da botones de juego: MOUSE1 es `+attack` y MOUSE2
  // `+attack2` en el `config.cfg`. Se registran con los mismos nombres que
  // usan las asignaciones.
  addEventListener("mousedown", (e) => {
    if (document.pointerLockElement !== canvas) return;
    // EL BOTÓN DE ATACAR ACEPTA LO QUE HAYA EN EL CICLADOR, Y SE LO COME.
    //
    //     if (FBitSet(player.pbs.ButtonsDown, IN_ATTACK))
    //       if (QuickSlotConfirm()) player.BlockButton(IN_ATTACK);
    //                                          clplayer.cpp:558-562
    //
    // O sea que el clic con el que eliges el arma NO da además un espadazo, y
    // hay que soltar y volver a pulsar. Sin esto, cambiar de arma ataca.
    if (e.button === 0 && confirmarCiclador()) return;
    teclas.abajo(`Mouse${e.button}`);
  });
  addEventListener("mouseup", (e) => teclas.arriba(`Mouse${e.button}`));
  canvas.addEventListener("click", () => {
    // Con una pantalla obligatoria delante —elegir personaje, o la muerte— no
    // se captura el raton: si se captura, los botones de esa pantalla dejan de
    // poder pulsarse y el jugador se queda encerrado.
    if (interfaz?.abierta) return;
    canvas.requestPointerLock();
  });
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
  // ── LOS BICHOS PIENSAN, Y AHORA DE ENTRADA ────────────────────────────────
  //
  // Esto estaba en `false` desde el 17, cuando era una sonda de paseo detrás de
  // la tecla O. En el 17 `cazar` sustituyó a `pasear` y **nadie le dio la
  // vuelta al interruptor**: el juego se abría con 69 bichos congelados y un
  // goblin que no reaccionaba al acercarte. Al pegarle sí reaccionaba, porque
  // ése es otro camino, y eso es justo lo que lo hacía difícil de ver — parecía
  // una IA rota y era una IA apagada.
  let paseando = true;
  // El AGUANTE vive aqui y no en el personaje, igual que en el juego: el
  // cliente lo lleva fotograma a fotograma (`CHudFatigue::DoThink`) y el
  // servidor solo lo sincroniza. Guardarlo en el documento seria guardar algo
  // que cambia sesenta veces por segundo.
  let aguante = 0;
  let corriendo = false;
  let rapidezAnterior = 0;

  /**
   * Lo que el modelo de velocidad necesita saber del personaje.
   *
   * Todo derivado, nada guardado: los atributos salen de las habilidades y el
   * peso del inventario con el catalogo al lado. Es la misma regla de siempre
   * — dos verdades y una envejece.
   */
  function vitalesDelPersonaje() {
    const p = sesion?.personaje;
    if (!p) return { agilidad: 0, fuerza: 0, peso: 0, carga: 25, aguanteMax: 3 };
    const atr = atributosDe(p.habilidades);
    const d = derivadas(atr);
    const fichas = (p.objetos ?? []).map((o) => ({ ...o, ficha: fichaDeObjeto(o.id) }));
    return {
      agilidad: atr.agility ?? 0,
      fuerza: atr.strength ?? 0,
      peso: cargaDe(fichas, d.carga).peso,
      carga: d.carga,
      aguanteMax: d.aguanteMax,
    };
  }
  const fichaDeObjeto = (id) => catalogoDeObjetos?.porId?.get(id) ?? { id, peso: 0 };

  // ── EL GOLPE DEL JUGADOR ──────────────────────────────────────────────────
  //
  // La regla está en `src/play/golpe.js` y no conoce ni Three ni Rapier. Aquí
  // va lo que sólo se puede hacer con el mundo delante: el modelo en la mano,
  // el censo de a quién se puede pegar y la traza que dice si hay pared en
  // medio.
  let catalogoDeArmas = null;
  // Y la munición, que se lee del mismo fichero. Declarada aquí arriba porque se
  // rellena en este mismo `try` y el tiro está mucho más abajo.
  let catalogoDeFlechas = null;
  try {
    const m = await fetch("build/gatecity/armas.json").then((r) => (r.ok ? r.json() : null));
    if (m) catalogoDeArmas = new Map(m.armas.map((a) => [a.id, a]));
    // Las flechas van en el mismo fichero y en una lista aparte, porque no son
    // armas: son munición. El arco de árbol no tiene daño propio.
    if (m?.flechas) catalogoDeFlechas = new Map(m.flechas.map((f) => [f.id, f]));
  } catch (e) {
    console.warn("el catalogo de armas no se ha podido leer:", e);
  }
  // Y EL CATÁLOGO DE ESCUDOS, que va aparte del de armas aunque comparta
  // carpeta: un escudo no es un arma con poco daño, es otro sistema. Ver
  // `src/play/escudo.js`.
  let catalogoDeEscudos = null;
  try {
    const m = await fetch("build/gatecity/escudos.json").then((r) => (r.ok ? r.json() : null));
    if (m) catalogoDeEscudos = new Map(m.escudos.map((e) => [e.id, e]));
  } catch (e) {
    console.warn("el catalogo de escudos no se ha podido leer:", e);
  }
  let brazo = null;              // la máquina de estados del arma
  let armaEnMano = null;         // el modelo de primera persona
  const modelosDeArma = new Map(); // uno por carpeta, que pesan un mega
  let brazal = null;             // la máquina del escudo, si lleva uno
  let escudoEnMano = null;       // su modelo de vista, el de la otra mano
  const modelosDeEscudo = new Map();
  // Los contadores del escudo: bloqueos con él arriba, desvíos con él abajo y
  // golpes que se comieron el cono.
  let bloqueos = 0, desvios = 0, fueraDelCono = 0;
  // Los contadores del 26. Se cuentan las DECISIONES, no los sonidos: el
  // navegador no deja sonar nada hasta que el jugador toque algo, y lo que hay
  // que medir es la regla.
  let sonidosDeCarga = 0;
  const aterrizajes = [];
  let golpesDados = 0, impactos = 0, muertes = 0;
  // Las consecuencias del golpe, contadas: paradas, encogidas, huidas y avisos.
  let parados = 0, encogidas = 0, huidas = 0, avisos = 0;
  /** El id con el que los bichos conocen al jugador en `objetivos()`. */
  const JUGADOR = "jugador";
  /**
   * SI DOS BICHOS SON ALIADOS, que es lo que decide a quién se avisa al morir.
   * La tabla de razas viaja entera en el manifiesto desde el 19, porque con la
   * relación de cada uno con el JUGADOR no se puede contestar esto.
   */
  const tablaDeRazas = new Map(censoDeBichos?.razas ?? []);
  const sonAliados = (a, b) => {
    const ra = a?.o?.ficha?.ia?.raza ?? a?.ficha?.ia?.raza;
    const rb = b?.o?.ficha?.ia?.raza ?? b?.ficha?.ia?.raza;
    if (!ra || !rb) return false;
    return relacionDeRazas(tablaDeRazas, ra, rb) === RELACION.ALIADO;
  };
  /** Un reloj monótono en segundos para las esperas de la reacción. */
  let reloj = 0;

  // LA PASADA DE LA VISTA: el arma y el muñeco, encima del mundo y con la
  // profundidad limpia. Los dos juntos en una escena para que se tapen bien
  // entre ellos —la mano del arma cae justo encima del muñeco— y separados del
  // mundo para que ninguna pared los recorte.
  const laVista = new THREE.Scene();
  let muneco = null;

  // EL MUÑECO (`ms_lildude`): tu propio personaje en miniatura abajo. Es una
  // copia del modelo a escala 0,026 puesta 4,7 unidades delante del ojo, no un
  // cuerpo de verdad. Ver `src/render/muneco.js`.
  let manifiestoDeCuerpos = null;
  const munecos = new Map();
  /**
   * Monta el muñeco del género que sea. El género es un SUBMODELO del mismo
   * archivo, pero cada uno se hornea en su carpeta, así que son dos modelos que
   * cargar — y se guardan los dos, que cambiar de personaje no vuelva a pedirlo.
   */
  async function ponerMuneco(genero = "male") {
    if (!manifiestoDeCuerpos) return null;
    if (!munecos.has(genero)) {
      munecos.set(genero, await cargarMuneco(manifiestoDeCuerpos, {
        genero, U: level.unitsPerMetre,
      }));
    }
    const nuevo = munecos.get(genero) ?? null;
    if (nuevo === muneco) return muneco;
    if (muneco) muneco.visible = false;
    muneco = nuevo;
    if (muneco && muneco.nodo.parent !== laVista) laVista.add(muneco.nodo);
    if (muneco) muneco.visible = true;
    return muneco;
  }
  try {
    manifiestoDeCuerpos = await fetch("build/gatecity/cuerpos.json")
      .then((r) => (r.ok ? r.json() : null));
    await ponerMuneco("male");
  } catch (e) {
    console.warn("el muñeco no se ha podido montar:", e);
  }

  /**
   * EMPUÑAR. El arma sale del personaje —`manos.derecha`—, que la eligió al
   * crearse entre las siete de `reg.newchar.weaponlist`.
   *
   * Y si no hay ninguna, los PUÑOS: `fist_bare` es `undroppable` y todo el
   * mundo los lleva. Dejarlo sin nada sería inventarse un estado que el juego
   * no tiene.
   */
  async function empunar(id) {
    const ficha = catalogoDeArmas?.get(id) ?? catalogoDeArmas?.get("fist_bare") ?? null;
    if (!ficha) return null;
    brazo = new Brazo(ficha);
    if (armaEnMano) armaEnMano.visible = false;
    armaEnMano = null;
    const clave = ficha.enMano?.clave;
    if (!clave) return brazo;
    try {
      if (!modelosDeArma.has(clave)) {
        modelosDeArma.set(clave, await cargarArma(clave, { U: level.unitsPerMetre }));
      }
      armaEnMano = modelosDeArma.get(clave) ?? null;
      if (armaEnMano) {
        if (armaEnMano.nodo.parent !== laVista) laVista.add(armaEnMano.nodo);
        armaEnMano.visible = true;
        armaEnMano.pon(ficha.animaciones?.parado ?? 1);
      }
      // ── Y SI ES UN ARCO, EL CONJUNTO DE FLECHAS ───────────────────────────
      //
      // Va aquí y no en la carga del mapa porque es un modelo más que pedir, y
      // sólo hace falta cuando hay un arco en la mano. Las flechas van en la
      // escena del MUNDO —no en la de la vista— porque son entidades de verdad:
      // se quedan clavadas donde caen y se tapan con las paredes.
      if (brazo?.esDeTiro && !flechasPuestas) {
        const cual = catalogoDeFlechas?.get("proj_arrow_generic")?.clave;
        if (cual) {
          flechasPuestas = await cargarFlechas(cual, { U: level.unitsPerMetre });
          if (flechasPuestas) scene.add(flechasPuestas.grupo);
        }
      }
    } catch (e) {
      console.warn("el arma no se ha podido montar:", e);
    }
    return brazo;
  }

  /**
   * EMBRAZAR — el escudo, que va en la OTRA mano.
   *
   * `manos.izquierda` del personaje, que `CreateChar` deja vacía: en Master
   * Sword un escudo **se compra**, y los seis `item_tk_shields_*` del catálogo
   * son vales de tienda, no escudos. Gate City no tiene ninguno en el suelo, así
   * que sin tienda no hay forma de conseguirlo jugando; la tecla del visor —`ñ`—
   * es un andamio declarado, como la K de morirse, y sobra el día que haya
   * tiendas.
   *
   * El modelo de vista es el segundo que cuelga de la cámara. No hay que
   * colocarlo: `v_shields.mdl` trae su propio brazo y está dibujado para verse
   * desde el ojo, igual que el del arma.
   */
  async function embrazar(id) {
    const ficha = id ? catalogoDeEscudos?.get(id) ?? null : null;
    if (escudoEnMano) escudoEnMano.visible = false;
    escudoEnMano = null;
    brazal = ficha ? new Brazal({ ...ficha, ataques: ficha.ataque ? [ficha.ataque] : [] }) : null;
    if (!ficha) return null;
    // `weapon_deploy`: sacarlo de la espalda es lo que pone `IS_DEPLOYED`, y sin
    // eso el escudo no bloquea nada aunque lo lleves encima.
    brazal.desplegar(true);
    const clave = ficha.enMano?.clave;
    if (!clave) return brazal;
    try {
      if (!modelosDeEscudo.has(clave)) {
        modelosDeEscudo.set(clave, await cargarArma(clave, { U: level.unitsPerMetre }));
      }
      escudoEnMano = modelosDeEscudo.get(clave) ?? null;
      if (escudoEnMano) {
        if (escudoEnMano.nodo.parent !== laVista) laVista.add(escudoEnMano.nodo);
        escudoEnMano.visible = true;
        // ESPEJADO, porque va en la izquierda. No hay un `v_` por mano: el motor
        // marca `MSRDR_FLIPPED` cuando `hand == LEFT_HAND` y lo dibuja al revés.
        // Sin esto el escudo sale en el lado del arma.
        escudoEnMano.espejar((ficha.manoNumero ?? 0) === 0);
        escudoEnMano.pon(ficha.animaciones?.levantar ?? 0);
      }
    } catch (e) {
      console.warn("el escudo no se ha podido montar:", e);
    }
    return brazal;
  }

  /**
   * UN PASO DEL ESCUDO, con lo que se ve y lo que se oye. En una función porque
   * lo llaman el bucle Y la sonda: si la sonda mueve el escudo por su cuenta,
   * mide un escudo que no se dibuja.
   */
  function pasoDelEscudo(dt, pulsado) {
    if (!brazal) return null;
    const s = brazal.tic(dt, { pulsado });
    if (s.sube) {
      // `melee_start` de `base_melee` acaba en `bm_attack_start`, que pone
      // `MELEE_VIEWANIM_ATK` —o sea `ANIM_THRUST1`— y suena `SOUND_SWIPE`.
      escudoEnMano?.pon(brazal.objeto?.animaciones?.empujar ?? 1, { unaVez: true });
      const w = brazal.objeto?.sonidos?.blandir;
      if (w && audio.despierto) audio.unaVez(`snd/${w}`);
      // Y el aguante, que sale a cero: el ataque del escudo declara
      // `energydrain 0`, así que los 15 puntos de su ficha no se cobran.
      aguante = Math.max(0, aguante - (s.aguante ?? 0));
    }
    // `melee_end`: `playviewanim ANIM_RETRACT1`, y luego vuelve al parado.
    if (s.baja) escudoEnMano?.pon(brazal.objeto?.animaciones?.bajar ?? 2, { unaVez: true });
    return s;
  }

  /**
   * ¿ESTOY CUBRIÉNDOME? `IsShielding()`, y está en una función porque lo
   * pregunta el bucle Y la sonda: si la sonda se salta la puerta, mide un arma
   * que el jugador no tiene.
   */
  function cubriendose() {
    return !puedeAtacar({
      objetos: [{ id: brazal?.objeto?.id, cubriendose: Boolean(brazal?.atacando) }],
    });
  }

  /**
   * EL PARRY DEL JUGADOR, que el escudo MULTIPLICA. `update_parry` corre al
   * cambiar de arma, no en cada golpe, y por eso está aquí y no en el golpe.
   *
   * Y lo que el escudo multiplica es **el valor de la habilidad a secas**, no
   * una de sus tres propiedades: `$get(ent_me,skill.swordsmanship)`. Eso importa
   * porque el valor a secas tiene un SUELO que las propiedades no tienen:
   *
   *     int iVal = (Total + (iSubStats / 2)) / iSubStats;
   *     // if value is 0 then return 1, we don't want skills to be less than 1.
   *     return (iVal == 0) ? 1 : iVal;        CStat::Value(), stats.cpp:169-172
   *
   * Así que un personaje nuevo —que tiene un solo punto y en la POTENCIA— no
   * tiene parry 0: tiene parry **1**, y con escudo `int(1 × 1,3)` sigue siendo 1.
   * Y 1 para exactamente el 0,000 % de los golpes, porque la tirada del parry es
   * `rand(0,1)` y la del atacante nunca baja de 1. O sea que la conclusión del 19
   * se sostiene —un personaje nuevo no para nada— pero por un pelo distinto del
   * que dije: el número no es cero, es uno, y uno no llega.
   */
  function parryDelPersonaje() {
    const p = sesion?.personaje;
    if (!p) return 0;
    const compDe = (hab) => (hab && p.habilidades?.[hab]
      ? valorDeHabilidad(p.habilidades[hab]) : 0);
    const arma = brazo?.arma ?? null;
    const manos = [];
    if (arma) {
      manos.push({
        habilidad: arma.habilidad,
        competencia: compDe(arma.habilidad),
        punoDesnudo: arma.id === "fist_bare",
        dosManos: arma.manoNumero === 4,
        marciales: compDe("martialarts"),
      });
    }
    if (brazal?.ficha) {
      manos.push({ escudo: true, multiplicadorDeParry: brazal.ficha.multiplicadorDeParry ?? 0 });
    }
    return valorDeParryDelJugador({ manos });
  }

  /** La potencia con la que pega: la propiedad `power` de la habilidad del arma. */
  function potenciaDe(ataque) {
    const p = sesion?.personaje;
    const h = habilidadDeArma(ataque?.habilidad);
    if (!p || !h) return 1;
    const props = p.habilidades?.[h.habilidad];
    // `power` y no el valor de la habilidad: el motor multiplica el daño por
    // `GetSkillStat(StatPower, PropPower)`, que es la propiedad, no la media.
    return props?.[h.propiedad ?? "power"]?.valor ?? props?.power?.valor ?? 1;
  }

  /** Y la destreza, que es la que abre el ataque cargado (`reqskill`). */
  function destrezaDe(ataque) {
    const p = sesion?.personaje;
    const h = habilidadDeArma(ataque?.habilidad);
    if (!p || !h) return 0;
    return p.habilidades?.[h.habilidad]?.proficiency?.valor ?? 0;
  }

  /**
   * A QUIÉN SE LE PUEDE PEGAR, en unidades y con el centro de su caja.
   *
   * El centro y no los pies: `DoDamage` traza hasta `pTarget->Center()`, que es
   * la mitad de la caja que le puso `SetSize` con el `height` de su script. Con
   * los pies, un rayo a ras de suelo choca con el primer escalón y el bicho se
   * vuelve intocable sin que nada falle.
   */
  function candidatosDeGolpe() {
    if (!bichos) return [];
    return bichos.vivos().map((i) => {
      const n = i.nodo.position;
      const alto = (i.ficha.ia?.alto ?? i.ficha.alto ?? 0) / level.unitsPerMetre
        || (i.caja ? (i.caja.max[2] - i.caja.min[2]) / level.unitsPerMetre : 1);
      return {
        id: i,
        centro: [n.x * U, (n.y + alto / 2) * U, n.z * U],
        vivo: true,
      };
    });
  }

  /**
   * La traza de `DoDamage`, que **ignora a los monstruos**: sólo dice si hay
   * mundo en medio. Sin ignorarlos, el goblin de delante tapa al de detrás y el
   * que está pegado a ti se tapa a sí mismo.
   */
  function trazaLibre(desdeU, hastaU) {
    const o = { x: desdeU[0] / U, y: desdeU[1] / U, z: desdeU[2] / U };
    const d = {
      x: hastaU[0] / U - o.x, y: hastaU[1] / U - o.y, z: hastaU[2] / U - o.z,
    };
    const L = Math.hypot(d.x, d.y, d.z);
    if (!(L > 0)) return true;
    d.x /= L; d.y /= L; d.z /= L;
    const deBicho = new Set((bichosSolidos?.puestos ?? []).map((p) => p.colisionador.handle));
    const g = world.world.castRay(new RAPIER.Ray(o, d), L, true,
      undefined, undefined, undefined, player.body,
      (c) => !deBicho.has(c.handle));
    return !g;
  }

  /**
   * EL GOLPE, cuando el reloj del arma dice que toca (`delay.strike`).
   *
   * El orden es el del motor: la esfera busca UN objetivo; si no hay ninguno se
   * traza la línea para dar contra el mundo, y eso es el `hitwall`.
   */
  function pegar(ataque) {
    golpesDados++;
    const ojo = player.eye;
    const mirada = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    // El punto de salida: el ojo más `ofs.startpos`, y los ejes de ese vector
    // son (derecha, DELANTE, arriba) — no (x, y, z) del mundo. Ver `vectorDe`.
    const derecha = new THREE.Vector3(1, 0, 0).applyEuler(camera.rotation);
    const arriba = new THREE.Vector3(0, 1, 0).applyEuler(camera.rotation);
    const ofs = ataque.desde ?? [0, 0, 0];
    const desde = [0, 1, 2].map((k) => ojo[k] * U
      + derecha.getComponent(k) * ofs[0] + mirada.getComponent(k) * ofs[1] + arriba.getComponent(k) * ofs[2]);
    // El cono se mide desde el CENTRO del jugador (`pev->origin`), no del ojo.
    const pies = player.feet;
    const centro = [pies[0] * U, (pies[1] + player.perfil.height / 2) * U, pies[2] * U];

    const r = elegirObjetivo({
      desde, centro, mirando: [mirada.x, mirada.y, mirada.z],
      alcance: ataque.alcance ?? 0,
      candidatos: candidatosDeGolpe(),
      libre: trazaLibre,
    });

    const sonidos = brazo?.arma?.sonidos ?? {};
    if (!r) {
      // Nada vivo delante: la línea contra el mundo. El sonido de dar en piedra
      // sólo suena si de verdad hay piedra, que es lo que distingue «he fallado»
      // de «he dado a la pared».
      const alcance = (ataque.alcance ?? 0) / U;
      const dir = { x: mirada.x, y: mirada.y, z: mirada.z };
      const g = world.world.castRay(
        new RAPIER.Ray({ x: ojo[0], y: ojo[1], z: ojo[2] }, dir), alcance, true,
        undefined, undefined, undefined, player.body);
      if (g && sonidos.contraPared?.length && audio.despierto) {
        const cual = sonidos.contraPared[Math.floor(Math.random() * sonidos.contraPared.length)];
        audio.unaVez(`snd/${cual}`);
      }
      return null;
    }

    const i = r.objetivo.id;
    const { dano, critico } = brazo.dano(ataque, {
      potencia: potenciaDe(ataque),
      sinNivel: destrezaDe(ataque) < (ataque.pideHabilidad ?? 0),
    });
    impactos++;
    // EL CUBO DE EXPERIENCIA, y la propiedad SE SORTEA: el motor hace
    // `RANDOM_LONG(0, subStats-1)` en cada golpe (msmonstershared.cpp:620) y
    // luego reparte al morir. Darla siempre a `power` haría un personaje que
    // sólo sube daño y nunca velocidad ni puntería.
    const h = habilidadDeArma(ataque.habilidad);
    const props = h ? propiedadesDe(h.habilidad) : [];
    const prop = h?.propiedad ?? props[Math.floor(Math.random() * props.length)] ?? "power";
    // ── CON SERVIDOR, EL GOLPE SE PIDE ────────────────────────────────────
    //
    // Y no se resuelve aquí, aunque tengamos delante todo lo que hace falta.
    // Quien resta la vida es el servidor, con su manada: si la vida de un
    // monstruo vive en el navegador, matarlo es editar un número — y con dos
    // jugadores, uno lo mata y el otro sigue viéndolo vivo.
    //
    // Lo que se manda es a quién y con qué; el servidor recorta el daño contra el
    // techo del arma que ÉL ve en las manos de este personaje, y comprueba la
    // distancia contra **dónde estaba el bicho cuando este jugador lo vio**. La
    // esquiva, la muerte y el grito llegan por la foto, y por eso aquí no se
    // pinta nada todavía: adelantarse a pintar una muerte que el servidor puede
    // no dar es peor que esperar un viaje de red.
    if (red) {
      red.pegar({
        id: i.id, dano,
        alcance: ataque.alcance ?? 0,
        cubo: `${h?.habilidad ?? "?"}.${prop}`,
        tipo: ataque.tipoDano ?? "",
      });
      return { objetivo: i, dano, critico, pedido: true };
    }
    const golpe = bichos.herir(i, dano, {
      cubo: `${h?.habilidad ?? "?"}.${prop}`,
      // EL TIPO DE DAÑO, que hasta ahora no viajaba y decide si se puede parar.
      // La espada oxidada hace `slash`, y `slash` sí se para. El nombre del
      // campo es `tipoDano` y lo escribí `tipoDeDano`: eso no da error, da un
      // tipo VACÍO, y un tipo vacío cumple `'target;magic' contains ''`, o sea
      // que la araña no habría esquivado nunca en el juego de verdad. La sonda
      // no lo veía porque le pasa el tipo a mano.
      tipo: ataque.tipoDano ?? "",
      ahora: reloj,
      // De quién huir y a quién señalar al avisar: el jugador.
      dados: { quien: JUGADOR },
    });
    // EL PARRY: el golpe no ha entrado. No quita vida, no da experiencia y no le
    // hace reaccionar — pero se ve, porque el bicho hace su animación de
    // esquivar, y se lee, porque el motor te lo dice con el texto de su script.
    if (golpe.parado) {
      parados++;
      suceso("ataque", `Tu ataque ha sido ${golpe.mensaje ?? "parried!"}`);
      return { objetivo: i, dano: 0, parado: true };
    }
    const muerto = golpe.muerto;
    // ── EL SONIDO DE RECIBIR, que hasta el 21 era el que no era ────────────
    //
    // Tocábamos `SOUND_PAINYELL` en cada golpe. Pero el grito de dolor es otro
    // sistema y en el goblin está APAGADO (`NPC_USE_PAIN 0`): lo que suena al
    // pegarle sale de su propio evento `npc_struck`, que sortea entre cinco.
    //
    //     { eventname npc_struck
    //       playrandomsound 2 SOUND_HIT SOUND_HIT2 SOUND_STRUCK1 SOUND_STRUCK2 SOUND_STRUCK3 }
    //                                            monsters/goblin.script:76-81
    //
    // Y dos de esas cinco son `c_gargoyle_hit1/2.wav`, o sea el golpe metálico:
    // el goblin suena a chapa el 40 % de las veces **en el juego original**,
    // porque reutilizaron la muestra de la gárgola. No hay nada que arreglar
    // ahí; lo que había que arreglar era que nosotros no lo tocábamos.
    //
    // Los dos sistemas son independientes y se disparan desde sitios
    // distintos —`base_struck` desde `game_damaged`, `npc_struck` desde
    // `npcatk_struck` (base_npc_attack_new.script:1093)—, así que cuando un
    // bicho tiene los dos suenan los dos. En Gate City eso pasa en uno.
    const suyos = i.ficha.ia?.sonidos ?? {};
    const st = i.ficha.ia?.struck ?? {};
    const donde = [i.nodo.position.x, i.nodo.position.y + 0.8, i.nodo.position.z];
    const suena = (lista) => {
      if (!lista?.length || !audio.despierto) return;
      // Sin quitar repetidos: repetir un nombre es como el mod le da peso a un
      // sonido. La rata pone `SOUND_PAIN` dos veces de cinco y el zombi pone
      // `SOUND_STRUCK SOUND_STRUCK SOUND_PAIN1` con «most common» al lado.
      audio.unaVez(`snd/${lista[Math.floor(Math.random() * lista.length)]}`, { donde });
    };
    if (muerto) suena(suyos.muerte);
    else {
      // La cadena de `base_struck`, que es excluyente: encogerse, si no dolor,
      // si no el de recibir del material (base_struck.script:166-262).
      if (golpe.encoge && st.sonidosDeEncogerse?.length) suena(st.sonidosDeEncogerse);
      else if (golpe.suena === "dolor" && st.sonidosDeDolor?.length) suena(st.sonidosDeDolor);
      else if (st.usaEncogerse || st.usaDolor) suena(st.sonidosDeGolpe);
      // Y el del propio bicho, que va aparte. Los 16 aldeanos no declaran
      // ninguno: en el juego **no suenan** al recibir un golpe, y aquí tampoco.
      suena(suyos.recibir);
    }
    if (muerto) {
      muertes++;
      bichosSolidos?.quitar(i);
      repartirExperiencia(i);
      // AL MORIR GRITA, y los aliados a tiro de su grito vienen a por ti. El
      // radio sale de su vida máxima: 294 unidades para un goblin de 50.
      const avisados = bichos.avisar(i, JUGADOR, { esAliado: sonAliados });
      if (avisados.length) {
        avisos += avisados.length;
        suceso("normal", `${i.ficha.nombre ?? "El monstruo"} ha avisado a ${avisados.length} aliado${avisados.length > 1 ? "s" : ""} al morir`);
      }
    } else {
      if (golpe.encoge) encogidas++;
      if (golpe.huye) { huidas++; suceso("normal", `${i.ficha.nombre ?? "El monstruo"} huye`); }
      suceso("ataque", `${critico ? "¡CRÍTICO! " : ""}${dano.toFixed(1)} de daño a ` +
        `${i.ficha.nombre ?? "un monstruo"} — le quedan ` +
        `${Math.max(0, i.vida).toFixed(0)} de ${i.vidaMaxima}` +
        `${golpe.encoge ? " · se encoge" : ""}`);
    }
    return { objetivo: i, dano, critico, muerto, encoge: golpe.encoge, huye: golpe.huye };
  }

  /**
   * LA EXPERIENCIA, al morir y no al golpear, que es como la da el motor.
   *
   * `expDeLaMuerte` hace la cuenta —con el castigo por pasarse y el redondeo por
   * cubo— y `entrenar` la mete en la hoja del personaje con la curva de
   * `GetExpNeeded`. Las dos piezas ya existían por separado; esto es lo que las
   * junta.
   */
  /**
   * LO QUE VALE UN BICHO, que no es lo que dice su script.
   *
   * `npcatk_set_skill` corre en el `npc_post_spawn` de todos, y con la errata
   * del `expadj 1` deja al goblin de Gate City en **26** y no en 25. El motor
   * lo fija al nacer; aquí se recalcula al morir porque la partida es de un
   * jugador y no cambia — el día que haya dos habrá que fijarlo al aparecer,
   * como él.
   */
  function loQueVale(i) {
    const { exp } = experienciaDelBicho({
      base: i.ficha.ia?.experiencia ?? 0,
      // Gate City no pide `set_self_adj` en ningún script ni en ninguna
      // entidad del `.bsp`, así que los tramos de vida total no se disparan y
      // los multiplicadores se quedan en 1. El sistema está portado entero de
      // todas formas: lo que no se mide no se sabe que está apagado.
      ...autoajustar({
        vidaTotalDelGrupo: vidaTotal(partida(), PARTIDA),
        seAjusta: Boolean(i.ficha.ia?.seAjusta),
      }),
      reduccion: i.ficha.ia?.reduccionDeExp ?? null,
      esJefe: Boolean(i.ficha.ia?.esJefe),
      jugadores: jugadoresActivos(partida(), PARTIDA),
      srv: PARTIDA,
    });
    return exp;
  }
  /** La partida tal como la ve `UTIL_TotalHP`: por ahora, uno. */
  const partida = () => {
    const p = sesion?.personaje;
    if (!p) return [];
    // `pPlayer->MaxHP()`, que es la derivada de los atributos y no la vida que
    // le queda: un jugador a un punto de vida cuenta entero para el escalado.
    return [{ activo: true, vidaMaxima: derivadas(atributosDe(p.habilidades)).vidaMax }];
  };

  function repartirExperiencia(i) {
    const p = sesion?.personaje;
    if (!p) return;
    const xp = expDeLaMuerte({
      nivel: loQueVale(i),
      vidaMaxima: i.vidaMaxima ?? 0,
      porCubo: i.recibido,
    });
    let total = 0, entregado = 0, subidas = 0;
    for (const [cubo, cantidad] of Object.entries(xp)) {
      if (!(cantidad > 0)) continue;
      total += cantidad;
      const r = entrenar(p, cubo, cantidad);
      entregado += r.entregado ?? 0;
      subidas += r.subidas;
    }
    if (total > 0) {
      // Se dicen LOS DOS números, y no es redundante: el motor recorta el
      // reparto a lo que falta para el siguiente punto y **tira el resto**
      // (ver `aprender`), así que «25 de experiencia» y «12 apuntados» son
      // distintos y la diferencia es la regla. Sin los dos, un jugador que
      // mata algo enorme y no ve subir nada sólo puede pensar que está roto.
      suceso("bueno", `Has matado a ${i.ficha.nombre ?? "un monstruo"} — ${total} de experiencia` +
        (entregado < total ? ` (${entregado} apuntados: el resto se pierde)` : "") +
        (subidas ? `, ¡${subidas} punto${subidas > 1 ? "s" : ""} de habilidad!` : ""));
    }
  }
  // ── EL TIRO CON ARCO ──────────────────────────────────────────────────────
  //
  // La regla está en `src/play/proyectil.js`. Aquí va lo del mundo: de dónde
  // sale la flecha, contra qué choca y quién se come el daño.
  //
  // Y una cosa que no es evidente: **la flecha no es un golpe a distancia**. No
  // pasa por `pegar()` ni por `elegirObjetivo`, porque el motor no busca en una
  // esfera ni mira el cono de la vista: traza por delante de la flecha y le da a
  // lo primero que haya. O sea que a un goblin que tengas al hombro le pegas con
  // la espada y **no** con el arco, y a uno a cincuenta metros al revés.
  let flechasPuestas = null;    // el conjunto de nodos, montado al empuñar
  const flechasEnVuelo = [];    // `{ flecha, pieza }`
  let tiros = 0, flechazos = 0, flechasPerdidas = 0;
  /**
   * La última que se ha soltado, y no es un adorno de la sonda: es la única forma
   * de seguir UNA flecha. El primer intento la buscaba por la longitud de
   * `flechasEnVuelo` antes y después, y eso falla en silencio —la lista también
   * PIERDE flechas, las que cumplen sus cinco segundos clavadas—, así que a
   * partir del duodécimo tiro la longitud no crecía y la sonda decía «no ha
   * salido ninguna flecha» mientras el goblin perdía vida.
   */
  let ultimaFlecha = null;

  /**
   * DE QUÉ FLECHA TIRA, y la respuesta por omisión es «de una gratis».
   *
   *     //Player not carrying any of the required ammo
   *     if (!_stricmp(CurrentAttack->sProjectileType, "arrow")) {
   *       //New! Give free 'blunt' arrows
   *       … GetGlobalGenericItemByName("proj_arrow_generic");
   *     }                                              giattack.cpp:1005-1017
   *
   * Un arco **nunca se queda sin munición**. Y la gratis no se gasta nunca: el
   * motor sólo resta cantidad `if (!GENERIC)` (:947), que es la marca de los
   * objetos cuyo nombre acaba en `_generic`. O sea que llevar flechas no es tener
   * con qué disparar: es disparar MEJOR —30-60 de daño contra 60-90— y por eso
   * un personaje nuevo, que no lleva ninguna, puede usar el arco desde el minuto
   * cero. Comprobado en el catálogo: `reg.newchar` regala cuatro objetos y
   * ninguno es una flecha.
   */
  function municion(ataque) {
    const tipo = String(ataque?.proyectil ?? "arrow");
    const p = sesion?.personaje;
    // Lo que el jugador haya ELEGIDO con el ciclador manda sobre la búsqueda,
    // que es justo para lo que sirve `selectarrow`: llevando tres clases de
    // flecha, sin esto siempre tiraría la primera que encuentre.
    if (municionElegida) {
      const puesta = (p?.objetos ?? []).find((o) => o?.id === municionElegida && o.n > 0);
      if (puesta && catalogoDeFlechas?.has(puesta.id)) {
        return { ficha: catalogoDeFlechas.get(puesta.id), gasta: puesta };
      }
      // Se acabaron las elegidas: se olvida la elección y se sigue como siempre.
      municionElegida = null;
    }
    const enLaMochila = (p?.objetos ?? []).find((o) => {
      if (!o?.id || !(o.n > 0)) return false;
      if (!catalogoDeFlechas?.has(o.id)) return false;
      // `msstring(sProjectileType).contains("arrow")` contra el nombre del
      // objeto: es una comparación por TEXTO y no por tipo, así que una saeta no
      // entra en un arco ni una flecha en una ballesta.
      return o.id.includes(tipo) && !o.id.endsWith("_generic");
    });
    if (enLaMochila) return { ficha: catalogoDeFlechas.get(enLaMochila.id), gasta: enLaMochila };
    return { ficha: catalogoDeFlechas?.get("proj_arrow_generic") ?? null, gasta: null };
  }

  /**
   * LA TRAZA DE UNA FLECHA, y es la que NO ignora a los monstruos: al contrario
   * que la del mandoble, aquí lo que hay en medio es justo lo que importa.
   *
   * Devuelve `{ punto, contra }`, donde `contra` es la instancia del bicho si le
   * ha dado a uno y `null` si ha dado al mundo — que es la diferencia entre
   * `game_projectile_hitnpc` y `game_projectile_hitwall`.
   */
  function trazaDeFlecha(desdeU, hastaU) {
    const o = { x: desdeU[0] / U, y: desdeU[1] / U, z: desdeU[2] / U };
    const d = { x: hastaU[0] / U - o.x, y: hastaU[1] / U - o.y, z: hastaU[2] / U - o.z };
    const L = Math.hypot(d.x, d.y, d.z);
    if (!(L > 0)) return null;
    d.x /= L; d.y /= L; d.z /= L;
    const g = world.world.castRay(new RAPIER.Ray(o, d), L, true,
      undefined, undefined, undefined, player.body);
    if (!g) return null;
    const t = g.timeOfImpact;
    const punto = [
      (o.x + d.x * t) * U, (o.y + d.y * t) * U, (o.z + d.z * t) * U,
    ];
    const cual = (bichosSolidos?.puestos ?? [])
      .find((q) => q.colisionador.handle === g.collider?.handle);
    return { punto, contra: cual?.instancia ?? null };
  }

  /**
   * SOLTAR LA CUERDA. Devuelve la flecha, que es lo que la sonda mira.
   *
   * El orden es el del motor: el ángulo con sus tres sumas, la velocidad de la
   * fracción tensada, la flecha en el ojo, y una comprobación **antes de
   * moverse** (`Think()` al final de `TossProjectile`).
   */
  function tirar(ataque, sostenido) {
    const { ficha: flecha, gasta } = municion(ataque);
    if (!flecha) return null;
    tiros++;
    // La munición se gasta AL SOLTAR y no al empezar a tensar. En el motor se
    // gasta en `StartAttack` —o sea al empezar—, y eso es un regalo envenenado:
    // si te mueres tensando, la flecha se ha ido. Aquí no hay forma de morir
    // tensando que no sea morir, así que da el mismo resultado y se hace donde
    // se entiende. Queda dicho porque es una diferencia, no un descubrimiento.
    if (gasta) {
      gasta.n -= 1;
      if (gasta.n <= 0 && sesion?.personaje) {
        sesion.personaje.objetos = sesion.personaje.objetos.filter((o) => o !== gasta);
        // `HUDEVENT_UNABLE` es el gris de «no puedes hacer eso», y quedarte sin
        // flechas es exactamente eso.
        suceso("nopuedes", `Se te ha acabado ${flecha.nombre ?? "la munición"}`);
      }
    }

    const r = anguloDelTiro({
      // Se le pasan CEROS y lo que devuelve se usa como incremento: la vista de
      // este proyecto está en radianes y en los ejes de Three, y mezclar los dos
      // sistemas dentro de la regla sería meter la cámara en un módulo que se
      // prueba sin navegador.
      cabeceo: 0, guino: 0, ataque, sostenido,
      habilidad: destrezaDe(ataque),
    });
    // Del sistema del motor al de la escena: su cabeceo positivo mira ABAJO y el
    // de Three mira arriba, y los dos guiños positivos giran a la izquierda.
    const rad = Math.PI / 180;
    const euler = new THREE.Euler(
      player.pitch - r.cabeceo * rad, player.yaw + r.guino * rad, 0, "YXZ");
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler);

    // El punto de salida: el ojo más `ofs.startpos`, con sus ejes de siempre
    // (derecha, DELANTE, arriba). Los arcos no lo declaran y salen del ojo.
    const ojo = player.eye;
    const derecha = new THREE.Vector3(1, 0, 0).applyEuler(euler);
    const arriba = new THREE.Vector3(0, 1, 0).applyEuler(euler);
    const ofs = ataque.desde ?? [0, 0, 0];
    const desde = [0, 1, 2].map((k) => ojo[k] * U
      + derecha.getComponent(k) * ofs[0] + dir.getComponent(k) * ofs[1]
      + arriba.getComponent(k) * ofs[2]);

    const f = new Flecha({
      desde, hacia: [dir.x, dir.y, dir.z], velocidad: r.velocidad,
      gravedad: flecha.gravedad ?? 1,
      dano: dadoDeFlecha(flecha.dano, Math.random),
      tipoDano: flecha.tipoDano ?? "pierce",
      expira: flecha.duraEnElSuelo ?? 10,
      ficha: flecha,
    });
    const pieza = flechasPuestas?.coger() ?? null;
    if (pieza) flechasPuestas.apuntar(pieza, [ojo[0], ojo[1], ojo[2]], [dir.x, dir.y, dir.z]);
    flechasEnVuelo.push({ flecha: f, pieza });
    ultimaFlecha = f;

    // El sonido del arco, que lo pone su propio `ranged_toss`.
    const s = brazo?.arma?.sonidos?.blandir ?? "weapons/bow/bow.wav";
    if (s && audio.despierto) audio.unaVez(`snd/${s}`);
    if (armaEnMano && brazo?.arma?.animaciones?.disparar !== null) {
      armaEnMano.pon(brazo.arma.animaciones.disparar, { unaVez: true });
    }

    // Y la comprobación del fotograma cero, que es la que hace que disparar
    // contra una pared pegada no suelte una flecha que atraviesa la piedra.
    const choque = f.nacer(trazaDeFlecha);
    if (choque) aterrizar(f, choque);
    return f;
  }

  /**
   * LO QUE PASA CUANDO UNA FLECHA LLEGA A ALGO.
   *
   * `ProjectileTouch` (giprojectile.cpp:118) con lo que de verdad se aplica a una
   * flecha de arco:
   *
   *   - el daño es el de la flecha por `potencia / 100`, **sin crítico y sin
   *     tirada de acierto** — ver `danoDeFlecha`;
   *   - si le da a un bicho, `game_projectile_hitnpc`; si no,
   *     `game_projectile_hitwall`, que es el que trae el sonido;
   *   - un bicho MUERTO no la para: «Hit a dead monster, keep going» (:144). Eso
   *     aquí no se puede hacer todavía —el colisionador del cadáver se quita al
   *     morir— y queda anotado.
   */
  function aterrizar(f, choque) {
    const i = choque?.contra ?? null;
    if (!i || i.muerto) {
      const s = f.ficha?.sonidos?.contraPared ?? [];
      if (s.length && audio.despierto) {
        audio.unaVez(`snd/${s[Math.floor(Math.random() * s.length)]}`);
      }
      return null;
    }
    flechazos++;
    const dano = danoDeFlecha({
      dado: f.dano,
      multiplicadorDelArco: brazo?.ataques?.[0]?.multiplicadorDeDano ?? 1,
      potencia: potenciaDe(brazo?.ataques?.[0] ?? null),
    });
    // El cubo de experiencia va a ARQUERÍA, que es lo que declara el arco, y con
    // la propiedad sorteada igual que en el mandoble.
    const h = habilidadDeArma(brazo?.ataques?.[0]?.habilidad ?? "archery");
    const props = h ? propiedadesDe(h.habilidad) : [];
    const prop = h?.propiedad ?? props[Math.floor(Math.random() * props.length)] ?? "power";
    // La flecha va por el mismo camino que la espada: con servidor, se pide.
    if (red) {
      red.pegar({
        id: i.id, dano, alcance: 0,
        cubo: `${h?.habilidad ?? "archery"}.${prop}`,
        tipo: f.tipoDano ?? "pierce",
      });
      return { objetivo: i, dano, pedido: true };
    }
    const golpe = bichos.herir(i, dano, {
      cubo: `${h?.habilidad ?? "archery"}.${prop}`,
      tipo: f.tipoDano ?? "pierce",
      ahora: reloj,
      dados: { quien: JUGADOR },
    });
    // Un escudo puede parar una flecha, y eso ya está portado en `herir`.
    if (golpe.parado) {
      suceso("ataque", `Tu flecha ha sido ${golpe.mensaje ?? "parried!"}`);
      return null;
    }
    if (golpe.muerto) {
      muertes++;
      repartirExperiencia(i);
      bichosSolidos?.quitar(i);
    }
    // La misma forma que el golpe de cuerpo a cuerpo, y a propósito: el motor
    // no tiene dos formatos —los dos salen del mismo `fReportHit` de
    // `giattack.cpp`— y «Flecha: 0.5 a Commoner» era un apunte de trabajo.
    suceso("ataque", `${dano.toFixed(1)} de daño a ${i.ficha.nombre ?? "un monstruo"}` +
      ` — le quedan ${Math.max(0, i.vida).toFixed(0)} de ${i.vidaMaxima}` +
      `${golpe.muerto ? " · ¡muerto!" : ""}`);
    return golpe;
  }

  /** Un paso de todas las flechas, con el mismo reloj fijo que la física. */
  function pasoDeFlechas(dt) {
    for (let n = flechasEnVuelo.length - 1; n >= 0; n--) {
      const { flecha: f, pieza } = flechasEnVuelo[n];
      const antes = f.volando;
      const choque = f.paso(dt, { traza: trazaDeFlecha });
      if (choque && antes) aterrizar(f, choque);
      // Se la mueve y se la reorienta sólo mientras vuela: una flecha clavada se
      // queda con el ángulo con el que entró, que es lo que hace el motor al
      // pasar a `MOVETYPE_NONE`.
      if (pieza && f.volando) {
        flechasPuestas.apuntar(pieza, [f.pos[0] / U, f.pos[1] / U, f.pos[2] / U], f.vel);
      } else if (pieza && choque) {
        flechasPuestas.apuntar(pieza, [f.pos[0] / U, f.pos[1] / U, f.pos[2] / U], null);
      }
      if (f.caducada) {
        if (f.volando) flechasPerdidas++;
        flechasPuestas?.soltar(pieza);
        flechasEnVuelo.splice(n, 1);
      }
    }
  }

  /**
   * UN PASO DEL BRAZO, y está en una función por la lección del 21 y del 22:
   * **la sonda tiene que llamar a lo que llama el juego.** Dos experimentos
   * seguidos dieron controles en verde sobre código que el bucle no ejecutaba,
   * las dos veces porque la sonda llamaba al módulo por su cuenta. Así que el
   * bucle de fotogramas y `probe.arco` entran por la misma puerta.
   */
  function pasoDelBrazo(dt, pulsado = false) {
    if (!brazo) return null;
    const e = brazo.tic(dt, {
      pulsado: Boolean(pulsado),
      destreza: destrezaDe(brazo.ataques[0]),
    });
    if (e.empieza) {
      // La animación la elige el arma entre sus tres (`ATTACK_ANIMS`), y
      // se pone UNA VEZ: `playviewanim` no repite.
      //
      // Y un arco no tiene ataques: tiene TENSAR. Su `ranged_start` hace
      // `playviewanim ANIM_STRETCH` y a los `RANGED_PULLTIME` cambia a la
      // pose de aguantar; aquí basta con la de tensar clavada en el último
      // fotograma, que es lo que se ve.
      const cual = brazo.esDeTiro ? brazo.arma?.animaciones?.tensar : e.animacion;
      if (armaEnMano && cual !== null && cual !== undefined) {
        armaEnMano.pon(cual, { unaVez: true });
      }
      // El silbido va con el mismo retardo que el golpe
      // (`MELEE_SOUND_DELAY MELEE_DMG_DELAY`), así que no suena aquí.
      aguante = Math.max(0, aguante - brazo.aguanteDe(e.empieza));
    }
    if (e.golpe) {
      const s = brazo.arma?.sonidos?.blandir;
      if (s && audio.despierto) audio.unaVez(`snd/${s}`);
      pegar(e.golpe);
    }
    // Y LA CUERDA: el tiro sale al soltar, con lo que se haya tensado.
    if (e.tira) tirar(e.tira, e.sostenido ?? 0);
    if (e.acaba && armaEnMano) {
      armaEnMano.pon(brazo.arma?.animaciones?.parado ?? 1);
    }
    // LAS FLECHAS EN EL AIRE, con el paso fijo: a 750 u/s, medir el vuelo con el
    // `dt` de dibujo cambia el punto de impacto según los fotogramas.
    if (flechasEnVuelo.length) pasoDeFlechas(dt);
    return e;
  }

  // El arnés de física del paseo. Vive aquí y no en `bichos.js` porque es quien
  // tiene el mundo de Rapier: el módulo de los bichos no conoce la física y no
  // tiene por qué. Las dos preguntas son las que hace `UTIL_MoveToOrigin` del
  // motor — ¿hay hueco delante? ¿dónde está el suelo? — y ninguna más.
  const arnesDePaseo = {
    libre(x, y, z, dx, dz, dist, i = null) {
      // Desde la CINTURA, no desde los pies: un rayo a ras de suelo choca con
      // cada adoquín y el bicho se pasa la vida girando.
      const o = { x, y: y + 0.9, z };
      // Y SIN CONTAR SU PROPIO CILINDRO, que es lo que faltaba.
      //
      // En el paso anterior les dimos colisionador a los 69 bichos, y este
      // rayo arranca en el centro del bicho a 0,9 m — o sea DENTRO de su
      // propio cilindro. Con `solid: true` un rayo que nace dentro de una
      // forma choca a distancia cero, así que «¿hay hueco delante?» contestaba
      // que no SIEMPRE. El goblin veía al jugador, se giraba, ponía la
      // animación de correr y se quedaba en el sitio: 0,00 m en tres segundos.
      // No daba ningún error, y en una captura se ve igual que un monstruo
      // esperándote.
      const mio = i ? bichosSolidos?.puestos.find((q) => q.instancia === i)?.cuerpo : undefined;
      const g = world.world.castRay(new RAPIER.Ray(o, { x: dx, y: 0, z: dz }), dist, true,
        undefined, undefined, undefined, mio);
      return !g;
    },
    suelo(x, y, z, i = null) {
      // TAMPOCO cuenta su propio cilindro, y aqui el sintoma era precioso: el
      // rayo sale de un metro por encima de los pies, o sea DENTRO del
      // colisionador del bicho, y con `solid: true` choca a distancia cero.
      // El suelo salia exactamente un metro por encima de donde estaba, o sea
      // **39 unidades**, que es justo lo que el escalon de 18 no deja subir.
      // Asi que el bicho daba el paso y lo deshacia, cada fotograma.
      const mio = i ? bichosSolidos?.puestos.find((q) => q.instancia === i)?.cuerpo : undefined;
      const g = world.world.castRay(new RAPIER.Ray({ x, y: y + 1.0, z }, { x: 0, y: -1, z: 0 }), 3, true,
        undefined, undefined, undefined, mio);
      return g ? y + 1.0 - g.timeOfImpact : null;
    },
    /**
     * A QUIEN PUEDE ATACAR UN BICHO. Hoy, uno: el jugador.
     *
     * Y su raza no sale de ningun script — el motor la devuelve a fuego como
     * `human` (script.cpp:1546). De ahi sale que 33 de los 69 sean hostiles y
     * los otros 36 no: 27 humanos y 3 `beloved` son ALIADOS suyos, y 4 ratas
     * y 1 guardia RECELAN, que en el motor significa «solo si me atacas».
     */
    objetivos(i) {
      const p = player.feet;
      return [{
        id: "jugador",
        donde: [p[0] * U, (p[1] + player.perfil.height / 2) * U, p[2] * U],
        esJugador: true,
        // LA RELACION ES DE CADA BICHO, no una sola para todos: la horneó
        // `tools/bichos.mjs` con la tabla de razas contra `human`. Un solo
        // valor para los 69 haría que o te atacara el pueblo entero o no te
        // atacara nadie.
        relacion: i?.ficha?.relacion ?? 0,
      }];
    },
    /**
     * LINEA DE VISION, que es `$cansee` y sin ella la IA es un radar.
     *
     * De los OJOS a los OJOS: un rayo entre los pies pasa por debajo de una
     * mesa y por encima de un escalon, y las dos cosas se ven como «me ve a
     * traves de la pared». El alto lo dice el script del bicho.
     */
    veA(i, id) {
      if (id !== "jugador") return false;
      const n = i.nodo.position;
      const alto = ((i.ficha.ia?.alto ?? i.ficha.alto ?? 60) * 0.9) / U;
      const o = { x: n.x, y: n.y + alto, z: n.z };
      const p = player.eye;
      const d = { x: p[0] - o.x, y: p[1] - o.y, z: p[2] - o.z };
      const L = Math.hypot(d.x, d.y, d.z);
      if (!(L > 0)) return true;
      d.x /= L; d.y /= L; d.z /= L;
      const g = world.world.castRayAndGetNormal(new RAPIER.Ray(o, d), L, true,
        undefined, undefined, undefined,
        bichosSolidos?.puestos.find((q) => q.instancia === i)?.cuerpo);
      // SIN GOLPE, O CON EL GOLPE EN EL PROPIO JUGADOR.
      //
      // Lo escribi como «el golpe tiene que llegar hasta el final del rayo» y
      // NUNCA veia a nadie: el rayo termina en el OJO, y por el camino se topa
      // con la CAPSULA del jugador medio metro antes. O sea que la condicion
      // se cumplia sólo si el jugador era transparente. Medido: el goblin a
      // tres metros no se enteraba de nada, y no daba ningun error — daba un
      // monstruo plantado.
      //
      // Lo que hay que preguntar no es a que distancia choca: es CONTRA QUE.
      if (!g) return true;
      return g.collider === player.collider;
    },
    /**
     * Cuando un bicho acierta. El dano y el acierto los decide `ia.js`; lo que
     * pasa DESPUES lo decide la defensa del jugador, y el orden no es libre:
     *
     *     1. el ESCUDO (`Gear[i]->OwnerTakeDamage`, player.cpp:405)
     *     2. el dano negativo se pisa a cero
     *     3. el PARRY del motor (`CMSMonster::TraceAttack`)
     *
     * Y el escudo pide dos cosas que solo se pueden contestar aqui, porque son
     * del mundo y no de la regla: DE DONDE viene el golpe —el cono de 53 grados
     * de verdad, ver `escudo.js`— y que el escudo este desplegado.
     */
    golpear(i, id, dano) {
      if (id !== "jugador" || !(dano > 0)) return;
      golpesRecibidos++;
      if (sesion?.estado !== ESTADO.JUGANDO) return;
      const n = i.nodo?.position ?? null;
      const desde = n ? [n.x, n.y, n.z] : null;
      const yo = player.feet;
      // El «adelante» del jugador en el plano, que es lo unico que el cono usa.
      const mirando = [-Math.sin(player.yaw), 0, -Math.cos(player.yaw)];
      const deFrente = desde
        ? dentroDelCono2D(desde, [yo[0], yo[1], yo[2]], mirando)
        : true;
      const d = defensaDelJugador({
        dano,
        // El goblin pega sin declarar `dmg.type`, y un tipo vacio SI se bloquea
        // —al contrario que en el parry del script—. No se inventa un tipo.
        tipo: i.ficha?.ia?.tipoDano ?? "",
        escudo: brazal?.ficha ?? null,
        postura: brazal?.postura ?? POSTURA.GUARDADO,
        desplegado: Boolean(brazal?.desplegado),
        deFrente,
        parry: parryDelPersonaje(),
      });
      if (d.bloqueo.bloquea) {
        if (d.bloqueo.arriba) bloqueos++; else desvios++;
        const s = brazal?.objeto?.sonidos?.bloqueo;
        if (s && audio.despierto) audio.unaVez(`snd/${s}`);
        // `shield_deflect` baja la animacion solo si NO estabas aguantando.
        if (d.bloqueo.baja && escudoEnMano) {
          escudoEnMano.pon(brazal?.objeto?.animaciones?.bajar ?? 2, { unaVez: true });
        }
        if (d.mensaje) suceso("atacado", d.mensaje);
      } else if (brazal?.atacando && !deFrente) {
        fueraDelCono++;
      }
      if (d.parado) { parados++; suceso("atacado", "¡Has parado el golpe!"); return; }
      if (!(d.dano > 0)) return;
      // Y QUE TE PEGAN SE DICE, que hasta ahora no se decía en ningún sitio.
      // Es el `HUDEVENT_ATTACKED` del motor —rojo, (240,0,0)— y es el único
      // aviso que tiene el jugador de que la vida que baja tiene un culpable:
      // `%s hits you: %s` (giattack.cpp:1993).
      suceso("atacado", `${i.ficha.nombre ?? "Un monstruo"} te da: ${d.dano.toFixed(1)} de daño`);
      sesion.danar(d.dano, { porQue: `${i.ficha.nombre ?? "un monstruo"}`, tipo: "golpe" });
    },
  };
  let golpesRecibidos = 0;
  /** Lo último que el servidor contestó a un golpe nuestro. Lo mira la sonda. */
  let ultimoGolpe = null;

  // ── LO QUE EL SERVIDOR CUENTA, del 28 ─────────────────────────────────────
  //
  // Con la manada al otro lado del cable, el navegador se queda sin saber cosas
  // que no se pueden deducir de una posición: si el golpe entró o lo pararon, si
  // el bicho se encoge, si ha muerto. Y no se pueden deducir a propósito —el
  // dado lo tira el servidor—, así que viajan como sucesos pegados a la foto.
  //
  // Esto es lo que hace `svc_temp_entity` y los mensajes de usuario del motor:
  // los hechos que no son estado. El estado va en la foto y se interpola; un
  // golpe no se interpola, ocurre.
  if (red) {
    red.al("suceso", (s) => {
      const i = Number.isInteger(s.id) ? bichos?.instancias?.[s.id] ?? null : null;
      const suyos = i?.ficha.ia?.sonidos ?? {};
      const st = i?.ficha.ia?.struck ?? {};
      const donde = i ? [i.donde[0], i.donde[1] + 0.8, i.donde[2]] : null;
      const suena = (lista) => {
        if (!lista?.length || !audio.despierto) return;
        // Sin quitar repetidos: repetir un nombre es como el mod le da peso a un
        // sonido. La rata pone `SOUND_PAIN` dos veces de cinco.
        audio.unaVez(`snd/${lista[Math.floor(Math.random() * lista.length)]}`, { donde });
      };
      switch (s.que) {
        case "herido":
          // La cadena de `base_struck`, excluyente, con lo que decidió el
          // servidor: encogerse, si no dolor, si no el del material.
          if (s.encoge && st.sonidosDeEncogerse?.length) suena(st.sonidosDeEncogerse);
          else if (s.suena === "dolor" && st.sonidosDeDolor?.length) suena(st.sonidosDeDolor);
          else if (st.usaEncogerse || st.usaDolor) suena(st.sonidosDeGolpe);
          suena(suyos.recibir);
          if (s.encoge) encogidas++;
          if (s.huye) { huidas++; suceso("normal", `${i?.ficha.nombre ?? "El monstruo"} huye`); }
          break;
        case "muere":
          suena(suyos.muerte);
          muertes++;
          // Y se le quita el cilindro AQUÍ también: el servidor se lo quita en su
          // mundo, pero el jugador choca con el de su navegador. Sin esto el
          // cadáver sigue siendo un muro invisible en la calle.
          if (i) bichosSolidos?.quitar(i);
          if (s.avisados > 0) {
            avisos += s.avisados;
            suceso("normal", `${i?.ficha.nombre ?? "El monstruo"} ha avisado a ${s.avisados} aliado${s.avisados > 1 ? "s" : ""} al morir`);
          }
          break;
        case "para":
          parados++;
          suceso("ataque", `Tu ataque ha sido ${i?.ficha.ia?.mensajeDeParry ?? "parried!"}`);
          break;
        case "tupegas":
          // Se guarda tal cual para la sonda: sin esto, «el techo recorta» sólo
          // se puede comprobar matando algo, y entonces el recorte se esconde
          // detrás de la vida del bicho — un control que pasa sin medir nada.
          ultimoGolpe = s;
          if (s.lejos) { suceso("malo", `Has fallado: ${s.porque}`); break; }
          if (s.parado || !s.vale) break;          // el `para` ya lo ha dicho
          // Con el golpe que mata NO se dice la vida que queda: la de abajo es
          // la línea de «Has matado a», que es la que el motor da. Decir las dos
          // deja un «0 de daño — le quedan 0 de 80» delante del anuncio.
          if (!s.muerto) {
            suceso("ataque", `${s.dano ?? 0} de daño a ${i?.ficha.nombre ?? "un monstruo"}` +
              ` — le quedan ${Math.max(0, Math.round(s.vida ?? 0))} de ${i?.vidaMaxima ?? "?"}`);
          }
          if (s.muerto && s.experiencia?.total > 0) {
            const x = s.experiencia;
            suceso("bueno", `Has matado a ${i?.ficha.nombre ?? "un monstruo"} — ${x.total} de experiencia` +
              (x.entregado < x.total ? ` (${x.entregado} apuntados: el resto se pierde)` : "") +
              (x.subidas ? ` · ¡${x.subidas} subida${x.subidas > 1 ? "s" : ""}!` : ""));
          }
          break;
        case "pega":
          // Un bicho ha acertado. Si el que lo recibe soy yo, se dice: es el
          // `HUDEVENT_ATTACKED` del motor —`%s hits you: %s`, giattack.cpp:1993—
          // y es el único aviso de que la vida que baja tiene un culpable.
          if (s.a === `j${red.yo}`) {
            golpesRecibidos++;
            suceso("atacado", `${i?.ficha.nombre ?? "Un monstruo"} te da: ${s.dano} de daño`);
          }
          break;
        default: break;
      }
    });
    // Y LA VIDA, que ahora la lleva el servidor porque el que pega es suyo.
    //
    // No se resta aquí: se copia. El personaje que se guarda es el de allí, y
    // restar el mismo golpe en los dos lados daría un jugador que muere el doble
    // de rápido que el que el servidor tiene en el disco — sin un solo error.
    red.al("vitales", ({ vida, estado }) => {
      const p = sesion?.personaje;
      if (p && Number.isFinite(vida)) p.vida = vida;
      if (estado === ESTADO.MUERTO && sesion && sesion.estado !== ESTADO.MUERTO) {
        sesion.matar({ porQue: "un monstruo", tipo: "monstruo", sinCastigo: true });
      }
    });
  }

  let ultimoBicho = performance.now();
  let last = performance.now();
  let accumulator = 0;
  let running = true;
  const U = level.unitsPerMetre;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!running) { last = now; return; }
    // El `dt` del FOTOGRAMA, que no es el paso de la física: lo usa lo que
    // dibuja —la animación de los otros jugadores— y no lo que simula.
    const dtFotograma = Math.min((now - last) / 1000, 0.25);
    accumulator += dtFotograma;
    last = now;
    // EL RELOJ DE LA SESION: guarda cada tanto y lleva la cuenta de la muerte.
    // `botonPulsado` es el `pev->button` del motor, y hace falta para su regla
    // de «suelta todas las teclas antes de reaparecer».
    //
    // Y son los BOTONES DE JUEGO, no todas las teclas. El motor lo dice
    // explicito —`pev->button & ~IN_SCORE`: la del marcador no cuenta— y
    // pasarle `keys.size > 0` costo tres controles en rojo de una vez: pulsar
    // Escape para cerrar la pantalla de muerte contaba como «quiero volver», y
    // el jugador reaparecia por intentar cerrar una ventana.
    sesion?.tic({ botonPulsado: teclas.hayBotonDeJuego() });
    // Quien no esta JUGANDO no se mueve: ni eligiendo personaje ni muerto. Se
    // le sigue dando fisica con las teclas a cero para que no flote —la
    // gravedad y el suelo siguen corriendo— pero no acepta intencion.
    const manda = (!sesion || sesion.estado === ESTADO.JUGANDO) && !interfaz?.abierta;
    const q = teclas.intencion();
    const before = player.feet;
    while (accumulator >= DT) {
      // LA VELOCIDAD SALE DEL PERSONAJE, y eso es lo propio de Master Sword:
      // `WalkSpeed()` la saca de la agilidad y de cuanto cargas, `RunSpeed()`
      // la multiplica por el aguante que te quede, y `ParseSpeed()` la parte
      // por la mitad si estas atacando. Sin personaje, la del perfil.
      let maxima = perfil.walkSpeed * U;
      if (manda && sesion?.personaje) {
        const v = vitalesDelPersonaje();
        corriendo = puedeCorrer({
          corriendoYa: corriendo,
          pulsaCorrer: q.correr,
          adelante: q.adelante,
          aguante,
          agachado: q.agachar,
          // ATACAR CORTA EL TROTE, y no es un detalle: el cliente del motor
          // borra `PLAYER_MOVE_RUNNING` en cuanto se ataca y no deja arrancar a
          // correr mientras blandes (clplayer.cpp:213 y 365). O sea que no se
          // puede cargar contra alguien dando mandobles.
          atacando: Boolean(brazo?.atacando),
          rapidez: player.rapidez,
          rapidezAnterior: rapidezAnterior,
        });
        maxima = velocidadAndando(v);
        if (corriendo) {
          maxima = velocidadCorriendo(maxima, { aguante, aguanteMax: v.aguanteMax });
          aguante = Math.max(0, aguante - AGUANTE_CORRIENDO * DT);
        } else {
          aguante = Math.min(v.aguanteMax, aguante + regeneracionDeAguante(v.fuerza) * DT);
        }
        maxima = ajustarVelocidad(maxima, {});
      }
      rapidezAnterior = player.rapidez;
      // EN QUE MEDIO ESTA, preguntado cada paso y no cada fotograma: si se
      // preguntara fuera del bucle, a 20 fotogramas por segundo se entraria al
      // agua tres pasos tarde y se veria como «el agua responde con retraso».
      const pies = player.feet;
      const enAgua = volumenes.nivelDeAguaEn(pies, { agachado: q.agachar });
      const escalera = volumenes.escaleraEn(pies);
      const saltando = manda && q.saltar && player.grounded && !escalera && enAgua < 2;
      const r = player.step(DT, manda ? {
        forward: q.adelante, strafe: q.lado, jump: q.saltar, agachar: q.agachar,
        maxima, agua: enAgua, escalera,
      } : { agua: enAgua, escalera });
      // ── LO QUE SE LE MANDA AL SERVIDOR ─────────────────────────────────
      //
      // Va DENTRO del bucle de paso fijo y no una vez por fotograma, porque una
      // orden es un paso de simulación: si se mandara por fotograma, con la
      // pestaña a 30 fps el servidor recibiría la mitad del tiempo jugado y el
      // jugador andaría a la mitad. Y lo que se manda son TECLAS —intención
      // recortada, ángulos y botones—, nunca la posición: eso es lo que hace
      // que el servidor sea la autoridad y no un notario.
      if (red?.dentro) {
        const ms = red.msecDe(DT);
        if (ms > 0) {
          red.apuntar({
            msec: ms,
            yaw: player.yaw, cabeceo: player.pitch,
            adelante: manda ? q.adelante : 0,
            lado: manda ? q.lado : 0,
            botones: (manda && q.saltar ? BOTON.SALTAR : 0)
              | (manda && q.agachar ? BOTON.AGACHAR : 0)
              | (manda && q.correr ? BOTON.CORRER : 0)
              | (manda && brazo?.atacando ? BOTON.ATACAR : 0),
          });
        }
      }
      // EL `trigger_hurt`, que trae `dmg 999999`: muerte instantanea. Es una
      // losa de 72 x 18 m en la parte baja del mapa, y hasta ahora no existia.
      // (No es el fondo del mundo, que esta 424 unidades mas abajo: eso lo
      // escribi mal la primera vez y lo corrigio mirar la caja del mapa.)
      if (sesion?.estado === ESTADO.JUGANDO) {
        const d = volumenes.danoEn(pies);
        if (d > 0) sesion.danar(d * DT, { porQue: "una trampa del mapa", tipo: "trampa" });
      }
      // Saltar cuesta aguante: `int JumpEnergy = min(Weight/Volume,1) * 4`, y
      // trunca, asi que con la mochila a menos de un cuarto es gratis.
      if (saltando && sesion?.personaje) {
        const v = vitalesDelPersonaje();
        aguante = Math.max(0, aguante - aguanteDeSalto(v));
      }
      // LOS PASOS, con el mismo paso fijo que la fisica y no con el fotograma:
      // el ritmo es de 300 ms, y a 20 fps medido con `dt` de dibujo se oiria
      // irregular sin que nada falle.
      //
      // La rodilla y los pies se preguntan por separado porque el motor tiene
      // DOS sonidos de agua segun por donde entre (`PM_UpdateStepSound`), y eso
      // no es el `waterlevel` del movimiento: es otra medida, a 0,3 y 0,5 del
      // alto de la caja.
      if (audio.despierto) {
        const alto = PLAYER.height ?? 1.8;
        const nivel = enAgua;
        const golpe = pasos.tic(DT, {
          velocidad: velocidadParaLosPasos(),
          enSuelo: player.grounded,
          agachado: q.agachar,
          enEscalera: Array.isArray(escalera),
          // Nivel 2 es el centro del jugador bajo el agua, o sea la rodilla de
          // sobra; nivel 1 son solo los pies.
          rodillaEnAgua: nivel >= 2,
          piesEnAgua: nivel === 1,
          material: materialBajoLosPies(pies),
        });
        if (golpe) audio.paso(golpe);
      }
      // EL ATERRIZAJE, y va FUERA del `if` del audio a propósito: la regla es
      // regla aunque el navegador todavía no deje sonar nada, y así la sonda
      // mide lo que se decide en vez de medir el permiso del navegador. El
      // motor pone el reloj de los pasos a cero para dar el paso en el acto y
      // decide su volumen por la velocidad de caída; los dos trozos son del
      // mismo sitio (`PM_CheckFalling`), así que van juntos.
      if (r?.caida > 0) {
        pasos.alAterrizar();
        const material = materialBajoLosPies(pies);
        const cae = sonidoDeCaida(r.caida, {
          enAgua: enAgua > 0,
          conDano: (r.danoDeCaida ?? 0) > 0,
        });
        // `PM_PlayStepSound` se llama a pelo, sin pasar por el corte de los
        // 220 u/s: de ahí que aterrizar suene aunque llegues quieto.
        const muestra = pasos.tic(0, { velocidad: [0, 0, 0], enSuelo: true, material })?.muestra
          ?? (Math.random() < 0.5 ? 0 : 1);
        aterrizajes.push({ caida: Math.round(r.caida), material, ...cae });
        if (aterrizajes.length > 8) aterrizajes.shift();
        if (audio.despierto) {
          if (cae.volumen > 0) audio.paso({ material, muestra, volumen: cae.volumen });
          if (cae.voz) audio.unaVez(`snd/${cae.voz}`);
          if (cae.golpe) audio.unaVez(`snd/${cae.golpe}`);
        }
      }
      // EL BRAZO: los dos relojes del arma, con el paso fijo y no con el
      // fotograma. El daño cae a los 0,6 s de un mandoble de 1,1 y medido con
      // el `dt` de dibujo se adelantaría o se atrasaría según los fotogramas.
      // EL ESCUDO, y va ANTES del brazo a propósito: `IsShielding()` se consulta
      // dentro de `StartAttack` del arma, así que el estado del escudo de este
      // paso es el que decide si la espada puede salir.
      if (brazal) {
        const cubre = manda && q.cubrir && sesion?.estado === ESTADO.JUGANDO;
        pasoDelEscudo(DT, Boolean(cubre));
      }
      // «Players cannot attack while shield is active» — y no es que la mano
      // esté ocupada: `IsShielding()` recorre TODO lo que llevas encima.
      pasoDelBrazo(DT,
        manda && q.atacar && !cubriendose() && sesion?.estado === ESTADO.JUGANDO);
      // Y LA CAIDA. El motor la cobra al tocar suelo, no mientras caes.
      if (r?.caida > 0 && sesion?.estado === ESTADO.JUGANDO) {
        const d = r.danoDeCaida;
        if (d > 0) sesion.danar(d, { porQue: `una caida de ${Math.round(r.caida)} u/s`, tipo: "trampa" });
      }
      accumulator -= DT;
    }
    // ── LOS OTROS, dibujados en el pasado ──────────────────────────────────
    //
    // Va FUERA del bucle de paso fijo y con el `dt` del fotograma, al contrario
    // que todo lo de arriba, y es al revés a propósito: esto no simula nada,
    // dibuja. `interpolados()` devuelve dónde estaba cada uno hace `ex_interp`
    // —100 ms— entre las dos fotos que ya tenemos, así que se puede preguntar
    // tantas veces por segundo como se dibuje.
    if (red && otros) {
      otros.refrescar(red.interpolados());
      otros.paso(dtFotograma);
    }
    const after = player.feet;
    travelled += Math.hypot(after[0] - before[0], after[2] - before[2]);
    const eye = player.eye;
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.rotation.set(player.pitch, player.yaw, 0);
    // EL OYENTE, donde esta el ojo y mirando donde mira. Sin esto todo suena
    // centrado y las antorchas no se localizan — que se lee como «el sonido
    // posicional no funciona» cuando lo que falta es decirle donde estas.
    if (audio.despierto) {
      const m = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      audio.oyente([eye[0], eye[1], eye[2]], [m.x, m.y, m.z]);
      // LA MUSICA por zonas. `CAreaMusic::MusicTouch` **para todo lo demas** al
      // entrar (`AllMusic.clear()`), asi que es un canal unico y no una mezcla.
      // Y una zona sin cancion es SILENCIO, no una cancion que falte: cuatro de
      // las once de Gate City no traen ninguna, y el mapa se jugaba asi.
      const zona = volumenes.zonasEn(player.feet).find((z) => z.clase === "msarea_music");
      if (zona) audio.musica(zona.musica ?? null);
    }
    // La caja de cielo se queda siempre centrada en el ojo, que es lo que hace
    // `MakeSkyVec` sumandole `RI.cullorigin`: un cielo que no sigue a la camara
    // tiene paralaje, y el paralaje lo convierte en una caja pintada.
    if (mallaCielo) mallaCielo.position.set(eye[0], eye[1], eye[2]);
    // El agua se mueve. Quieta se lee como suelo pintado de azul, que es la
    // leccion del rio de Corinth y vale igual aqui.
    for (const m of aguas) if (m.map) m.map.offset.set((now / 26000) % 1, (now / 9000) % 1);
    carteles.animar(now / 1000);
    // EL PARPADEO de los estilos 1 y 6. Es un cambio de textura, no una mezcla:
    // los 25 atlas estan horneados y `animarLuz` elige. Ver `src/bsp/luz.js`.
    relojLuz = now / 1000;
    animarLuz(relojLuz);
    // Un reloj en segundos, acotado: una pestaña que vuelve de estar en
    // segundo plano trae un `dt` de varios segundos y la animación salta.
    const dtB = Math.min(0.1, (now - ultimoBicho) / 1000);
    ultimoBicho = now;
    // LAS PUERTAS, con el mismo reloj. Se abren al acercarse porque ninguna de
    // las nueve trae `SF_DOOR_USE_ONLY`, que es lo que `CBaseDoor` decide.
    if (puertas) {
      const cerca = new Set(puertas.cercaDe(player.feet, U));
      // HACIA DONDE MIRA el que abre, que es lo que decide el lado al que gira
      // la hoja (`CBaseDoor::DoorGoUp`). Sin esto la puerta se abre siempre
      // hacia el mismo sitio y la mitad de las veces te empuja.
      const miradaPlana = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      miradaPlana.y = 0;
      if (miradaPlana.lengthSq() > 1e-6) miradaPlana.normalize();
      puertas.tic(dtB, {
        desde: player.feet,
        mirando: [miradaPlana.x, 0, miradaPlana.z],
        radioDelQueAbre: player.perfil.radius,
        cerca: (p) => cerca.has(p),
        alMoverse: (p) => {
          pedidosDePuerta++;
          const s = p.ficha.sonido;
          if (s && audio.despierto) {
            const c = [0, 1, 2].map((k) => (p.ficha.caja.max[k] + p.ficha.caja.min[k]) / 2);
            audio.unaVez(`snd/${s}`, { donde: c });
          }
        },
      });
    }
    // El arbol se mece y la vela tiembla, con el mismo reloj que los bichos.
    if (adornosVivos) adornosVivos.animar(dtB);
    // Y el arma en la mano y el muñeco, que tienen su propio esqueleto.
    if (armaEnMano) armaEnMano.animar(dtB);
    if (escudoEnMano) escudoEnMano.animar(dtB);
    if (muneco) {
      // Corriendo, la animación de correr. Es lo que hace el motor, que le
      // copia la secuencia al jugador (`MSRDR_COPYPLAYER`), y los nombres los
      // dice `global.script`, no nosotros.
      muneco.pon(corriendo ? "run" : (brazo ? "idle" : "attention"));
      muneco.animar(dtB);
      muneco.visible = !interfaz?.abierta && (!sesion || sesion.estado === ESTADO.JUGANDO);
    }
    if (bichos) {
      // El reloj de las consecuencias, que es el mismo que el de las
      // animaciones: las esperas del motor son de 1,5 a 30 segundos y sin un
      // reloj propio no se pueden medir.
      reloj += dtB;
      if (red) {
        // ── CON SERVIDOR, AQUÍ NO SE DECIDE NADA ─────────────────────────────
        //
        // Los bichos se colocan donde dice el servidor, interpolados `ex_interp`
        // en el pasado — exactamente igual que los otros jugadores y con la
        // misma cola. Ni `relojes` ni `cazar`: correrlos aquí sería volver a
        // tener dos verdades, y con dos verdades y un dado propio cada pestaña
        // vuelve a ver su propio pueblo, que es el fallo que el 28 viene a
        // arreglar.
        bichos.aplicar(red.bichosInterpolados());
        bichos.dibujar(dtB);
        // Los cilindros SÍ los sigue el cliente, y hace falta: son con lo que
        // choca el jugador aquí, y su predicción tiene que contar con ellos o se
        // andaría a través de un goblin hasta que llegara la corrección.
        bichosSolidos?.seguir();
      } else {
        bichos.animar(dtB);
        // LA CAZA. Antes era `pasear`, que andaba y giraba al chocar y su propio
        // comentario decia que no era la IA de Master Sword. Ahora `cazar` corre
        // `npcatk_hunt` por cada bicho con ficha de combate y deja paseando a los
        // que no la tienen.
        if (paseando) { bichos.cazar(dtB, { ...arnesDePaseo, ahora: reloj }); bichosSolidos?.seguir(); }
      }
      // Y la dlight del glow sobre ellos, que es el mismo camino del motor.
      if (glow.visible) bichos.alumbrar(camera.position, { radio: GLOW.alcance * GLOW.radio, color: [1, 1, 0.5] });
      else bichos.alumbrar(camera.position, { radio: 0 });
    }
    renderer.render(escena, camera);
    // LA VISTA: el arma y el muñeco, encima del mundo. Dentro de la pasada del
    // mundo la punta de la espada se hunde en cada pared, y el muñeco —que está
    // a 12 centímetros del ojo— se mete dentro de todo lo que te acerques.
    if (armaEnMano || escudoEnMano || muneco) {
      armaEnMano?.seguir(camera);
      // El escudo cuelga del ojo igual que el arma y no hay que colocarlo:
      // `v_shields.mdl` trae su propio brazo y esta dibujado para verse desde
      // ahi. Van los dos en la MISMA pasada para que se tapen bien entre ellos.
      escudoEnMano?.seguir(camera);
      muneco?.seguir(camera);
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(laVista, camera);
      renderer.autoClear = true;
    }
    // EL HUD DEL JUEGO, con el reloj de verdad y no con el paso fijo.
    //
    // Va con `dtB` —el reloj acotado de las animaciones— y no con `DT`: las
    // barras persiguen al valor a tantos puntos por SEGUNDO
    // (`gpGlobals->frametime * AccelFlasks`, vgui_health.h:89), así que con un
    // paso fijo llenarían más despacio o más deprisa según los fotogramas que
    // dé la máquina. Y va fuera del bucle de física a propósito: es una vista,
    // no una simulación, y no puede correr dos veces en un fotograma lento.
    pasoDelHud(dtB);
    counters.dist.textContent = travelled.toFixed(1);
    counters.pos.textContent = after.map((v) => Math.round(v * U)).join(" ");
    counters.ground.textContent = player.grounded ? "suelo" : "aire";
  }

  /**
   * Un paso del HUD, y por una puerta sola.
   *
   * La lección del 21, del 22 y del 23, que salió tres veces seguidas: lo que
   * mide la sonda tiene que ser lo que corre el bucle. Si la sonda llama a otra
   * cosa, la batería se pone verde sobre código que el juego no ejecuta.
   */
  /**
   * LA VELOCIDAD QUE LEE LA REGLA DE LOS PASOS, en unidades por segundo.
   *
   * `player.vel` YA VA EN UNIDADES POR SEGUNDO: el modelo de Master Sword
   * (`pasoMsr`) lleva la velocidad en unidades del motor y sólo convierte a
   * metros para empujar contra Rapier. Aquí se multiplicaba por `U`, o sea por
   * 39,37, y la regla recibía **6 241 andando**: pasaba el corte de los 220
   * siempre, así que andar sonaba a correr, al volumen de correr y cada
   * 300 ms en vez de cada 400.
   *
   * No daba ningún error y el juego sonaba de más, que es lo difícil de notar.
   * Lo cazó la sonda del 26 midiendo la velocidad en las dos unidades a la vez,
   * y por eso esto es una función y no una expresión dentro del bucle: para que
   * la sonda pueda preguntar exactamente lo que el bucle usa.
   */
  const velocidadParaLosPasos = () => [...player.vel];

  function pasoDelHud(dt) {
    if (!hudMs) return;
    const p = sesion?.personaje ?? null;
    const lim = sesion?.limites ?? null;
    const v = vitalesDelPersonaje();
    // El tensado del arco para la barra de carga. `cargaMaxima` es el
    // `GetHighestAttackCharge()` del motor, que en un arco vale cero — y eso es
    // justo lo que apaga la barra. Ver `cargaVisible()` en `src/play/hud.js`.
    const at = brazo?.ataque ?? null;
    hudMs.paso(dt, {
      panelAbierto: Boolean(interfaz?.abierta),
      vivo: !sesion || sesion.estado === ESTADO.JUGANDO,
      cargado: Boolean(p),
      vida: p?.vida ?? 0, vidaMax: lim?.vidaMax ?? 1,
      mana: p?.mana ?? 0, manaMax: lim?.manaMax ?? 1,
      peso: v.peso, carga: v.carga,
      aguante, aguanteMax: v.aguanteMax,
      tensando: brazo?.fase === FASE.TENSANDO,
      carga01: brazo?.fase === FASE.TENSANDO ? cargaDelTiro(brazo.t, at?.sostener) : 0,
      // `GetHighestAttackCharge()` recorre TODOS los ataques del arma
      // (giattack.cpp:617-625), no el que estés dando. Mientras aquí se miró
      // `brazo.ataque` —el actual— la barra no salía nunca cargando: entre un
      // mandoble y el siguiente no hay ataque en curso, que es justo cuando se
      // carga. La sonda lo cazó: sonaba el nivel y no se pintaba nada.
      cargaMaxima: Math.max(0, ...(brazo?.ataques ?? []).map((a) => a.carga ?? 0)),
      // Y la carga de cuerpo a cuerpo, que es la que el motor pinta de verdad:
      // `Attack_IsCharging() && (vCurChargeAmt = Item->Attack_Charge()) > 0`
      // (vgui_health.h:239). No es un tanto por uno, son unidades de carga.
      cargaBruta: brazo?.carga ?? 0,
      mano: "derecha",
    });

    // El sonido de subir de nivel. Va aquí y no dentro del HUD porque en el
    // motor también sale del panel que pinta la barra —`PlayHUDSound` desde
    // `Update()`— pero el que reproduce es de fuera.
    const sube = vozDeLaCarga.paso(brazo?.carga ?? 0);
    if (sube) {
      // Se cuenta SIEMPRE y se reproduce sólo si el audio está despierto: en un
      // navegador sin un clic previo no suena nada, y una sonda que midiera el
      // sonido estaría midiendo el permiso del navegador en vez de la regla.
      sonidosDeCarga++;
      if (audio.despierto) audio.unaVez(`snd/${sube}`);
    }

    // EL CICLADOR Y LAS RANURAS, por la misma puerta y por la misma razón.
    //
    // Los dos relojes son de aquí: el de la espera de 2,5 s que TIRA lo que
    // haya puesto, y el de los 2 s aguantando una tecla que GRABA. Los dos se
    // ven en pantalla, así que los dos tienen que correr donde corre el HUD.
    const antes = ciclador.activo;
    ciclador.paso(dt);
    if (antes && !ciclador.activo) pintarCiclador();

    const enMano = sesion?.personaje?.manos?.derecha ?? null;
    const grabado = ranuras.paso(dt, enMano
      ? { que: "empunar", id: enMano, nombre: catalogoDeArmas?.get(enMano)?.nombre ?? enMano }
      : null);
    if (grabado) {
      sonarInterfaz(grabado.sonido);
      // Y al documento en el acto. Grabar doce ranuras y perderlas al salir era
      // la deuda que el 25 dejó escrita.
      apuntarRanuras();
      // `#QUICKSLOT_CREATE` es el aviso del motor (clplayer.cpp:1487), y va por
      // el canal de los mensajes de pantalla, no por el de los sucesos.
      suceso("bueno", grabado.grabado
        ? `Ranura ${grabado.ranura + 1}: ${grabado.grabado.nombre}`
        : `Ranura ${grabado.ranura + 1} vaciada`);
    }
  }

  // El atlas con el luxel negro teñido de rosa. Se construye la primera vez que
  // se pide, porque dibujar un lienzo de 1024x1024 en el arranque es tiempo de
  // carga para una sonda que casi nunca se usa.
  let rosa = null;

  // --- las dos cosas que hacen falta para que las PERILLAS no mientan --------
  //
  // 1. Quien lleva mapa de luz y quien no. Una perilla que se lo PONE al cielo o
  //    a un rayo aditivo cambia cosas que nadie le pidió cambiar, y la diferencia
  //    entre las dos tomas deja de significar lo que dice.
  for (const m of [...materiales, ...adornos.materiales]) m.userData.conLuz = Boolean(m.lightMap);
  // 2. Un atlas BLANCO de un pixel, para poder apagar el mapa de luz sin apagar
  //    la luz. Con `channel = 1` como el de verdad, porque el material lo lee por
  //    `uv1` — que es el fallo que se comió el mapa de luz entero.
  const blanco = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blanco.needsUpdate = true;
  blanco.channel = 1;
  blanco.colorSpace = atlas.quieta.colorSpace;

  window.probe = {
    level, player, camera, renderer, keys, ready: true, kit: null,
    medidas: level.medidas,
    /**
     * LA RED, por donde se mira lo que sólo existe con dos navegadores.
     *
     * Ninguna de las 49 pruebas de `test/red_27.test.mjs` dice que un jugador
     * vea al otro: dicen que el protocolo cumple sus reglas. Esto es lo que
     * permite preguntárselo a dos Chrome de verdad, con el servidor de verdad
     * en medio.
     */
    red: {
      get hay() { return Boolean(red); },
      estado: () => (red ? {
        yo: red.yo,
        partida: red.partida,
        mapa: red.mapa,
        dentro: red.dentro,
        // Lo que la red cuesta y lo que hace, en números: las correcciones son
        // la medida de si la predicción sirve, y el error máximo es la de si
        // las dos físicas son la misma.
        fotos: red.fotosRecibidas,
        paquetes: red.paquetes,
        ordenes: red.ordenesEnviadas,
        pendientes: red.pendientes.length,
        correcciones: red.correcciones,
        errorMaximo: red.errorMaximo,
        errorUltimo: red.errorUltimo,
        latencia: red.latencia,
        interp: red.interp,
        updaterate: red.updaterate,
        cmdrate: red.cmdrate,
        cmdbackup: red.cmdbackup,
        ajenos: red.ajenos.size,
        pies: player.feet,
        personaje: red.personaje?.nombre ?? null,
      } : null),
      /** Dónde se está DIBUJANDO a cada uno de los demás, ahora mismo. */
      otros: () => (otros ? otros.estado() : []),
      /** Y dónde dice la última foto que están, sin interpolar: la diferencia
       * entre esto y lo de arriba ES `ex_interp`, y es lo que hay que poder ver. */
      crudos: () => (red ? [...red.ajenos].map(([id, cola]) => {
        const u = cola[cola.length - 1];
        return { id, nombre: u.nombre, pies: u.pies, rapidez: u.rapidez, t: u.t, muestras: cola.length };
      }) : []),
      /** Lo que `interpolados()` dice AHORA, antes de pasar por las figuras: es
       * lo que separa un fallo de la interpolación de uno del dibujo. */
      interp: () => (red ? [...red.interpolados()].map(([id, e]) => ({
        id, rapidez: e.rapidez, interpolado: e.interpolado, muestras: red.ajenos.get(id)?.length ?? 0,
      })) : []),
      /** La lista de partidas, que es el navegador de servidores en pequeño. */
      partidas: () => listarPartidas(enlaceDeRed?.url),
      /** Teletransportar el cuerpo LOCAL sin decírselo al servidor: es la
       * mentira con la que se comprueba que la reconciliación existe. */
      mentir: (dx = 1) => {
        const p = player.feet;
        player.colocar([p[0] + dx, p[1], p[2]]);
        return player.feet;
      },
      /** Manda ya lo pendiente, para no esperar al reloj de `cl_cmdrate`. */
      mandar: () => (red ? red.enviar() : 0),
      /**
       * LOS BICHOS TAL Y COMO LOS VE ESTE NAVEGADOR. Del 28.
       *
       * Es el control que decide el experimento: dos pestañas leen esto y tienen
       * que dar lo mismo. Antes daban dos pueblos distintos y nada lo decía.
       */
      bichos: () => (bichos ? bichos.instancias.map((i) => ({
        id: i.id, nombre: i.ficha.nombre ?? i.ficha.clase,
        donde: [...i.donde], yaw: i.yaw,
        vida: i.vida, muerto: i.muerto, animacion: i.nombreActual,
        hostil: Boolean(i.ficha.hostil),
      })) : []),
      /** Cuántas muestras hay de cada bicho, para saber si el delta funciona. */
      muestras: () => (red ? [...red.fauna].map(([id, cola]) => ({ id, n: cola.length })) : []),
      /**
       * Pegarle a un bicho por su número, sin espada y sin apuntar.
       *
       * Existe para poder medir dos cosas que un golpe de verdad mezcla: el
       * recorte del daño —se manda 9 999 y el servidor deja lo que la espada
       * pueda— y que la muerte llega a LOS DOS navegadores.
       */
      pegarA: (id, dano = 9999, alcance = 100000) => {
        if (!red) return null;
        red.pegar({ id, dano, alcance, cubo: "swordsmanship.power", tipo: "" });
        return { id, dano };
      },
      /**
       * Lo que el servidor contestó al último golpe: si entró, si lo pararon, si
       * no llegaba, cuánta vida le queda y **a cuánto recortó el daño**.
       */
      ultimoGolpe: () => ultimoGolpe,
      /** El hostil vivo más cercano, que es a quien tiene sentido pegarle. */
      masCerca: () => {
        if (!bichos) return null;
        const p = player.feet;
        let mejor = null;
        for (const i of bichos.instancias) {
          if (i.muerto || !i.ficha.hostil) continue;
          const d = Math.hypot(i.donde[0] - p[0], i.donde[2] - p[2]);
          if (!mejor || d < mejor.distancia) mejor = { id: i.id, nombre: i.ficha.nombre, distancia: d, vida: i.vida };
        }
        return mejor;
      },
    },
    /** El rumbo de llegada calculado. Lo lee el sacador de capturas. */
    rumbo,
    pause() { running = false; },
    resume() { running = true; },
    /**
     * Apaga o enciende el MAPA DE LUZ, dejando las texturas puestas.
     *
     * Es la medida que dice cuanto aporta la luz horneada, y es la misma idea que
     * `setKit()` en Corinth: lo que vale no es la cobertura -que se satura- sino
     * cuantos pixeles CAMBIAN al apagarlo.
     */
    setLuz(on) {
      // APAGARLO ES CAMBIAR EL ATLAS POR UNO BLANCO, no quitarlo.
      //
      // Quitarlo —`lightMap = null`— no deja el mundo a plena luz: lo deja NEGRO,
      // porque `MeshLambertMaterial` sin lightMap y sin una sola luz de escena no
      // emite nada. Con el glow apagado, que es como se mide, la pantalla salia al
      // 97,7 % de negro puro.
      //
      // Y eso convertia la cifra de cabecera de la sesion pasada —«apagar el mapa
      // de luz cambia el 78,7 % de la pantalla»— en otra cosa: en cuanta pantalla
      // ES geometria del mundo. Un numero alto, plausible, y que no medía lo que
      // decia medir. Con el atlas blanco lo apagado es de verdad `r_fullbright`.
      // Solo los que YA llevan mapa de luz: el cielo, los aditivos y el modo 1 no
      // lo llevan nunca, y ponerselo aqui los cambiaria en la toma «apagada» sin
      // que nadie lo hubiera pedido.
      for (const m of [...materiales, ...adornos.materiales]) {
        if (!m.userData.conLuz) continue;
        m.lightMap = on ? atlasDe(m) : blanco;
        m.needsUpdate = true;
      }
    },
    /** Apaga o enciende las texturas, dejando el mapa de luz. La otra mitad. */
    setTexturas(on) {
      // Recorre `grupos`, que es el orden REAL de los materiales: primero los
      // opacos y luego los translúcidos. Con el orden del manifiesto, apagar las
      // texturas se las quitaba a los grupos equivocados.
      for (let i = 0; i < materiales.length; i++) {
        materiales[i].map = on ? texturas.get(grupos[i].texture) ?? null : null;
        materiales[i].needsUpdate = true;
      }
      for (const m of adornos.materiales) {
        if (!m.userData.map) m.userData.map = m.map;
        m.map = on ? m.userData.map : null;
        m.needsUpdate = true;
      }
    },
    setMapa(on) {
      mundo.visible = on;
      if (velo) velo.visible = on;
      // Y el detalle y el cielo, que TAMBIEN son el mapa. Sin ellos, el control
      // «con el mundo apagado la pantalla tiene que ser niebla» dejaba dentro una
      // caja de cielo que ocupa la pantalla entera.
      if (mallaDetalle) mallaDetalle.visible = on;
      if (mallaCielo) mallaCielo.visible = on;
    },
    /**
     * PLENA LUZ: la textura sin nada de iluminacion, que es `r_fullbright 1`.
     *
     * Es el control que separa las dos unicas cosas que pueden pintar un pixel de
     * negro: que no haya luz, o que no haya GEOMETRIA. Con esto encendido, todo lo
     * que siga negro es un agujero.
     *
     * Hace falta porque el intento anterior —mandar las UV de luz al luxel blanco
     * tocando el atributo— no llegaba al render y devolvia el fotograma IDENTICO,
     * o sea un «no cambia nada» que no significaba nada. Cambiar `emissive` y
     * `emissiveMap` con `needsUpdate` si recompila el material y no se puede
     * quedar a medias.
     */
    setPlenaLuz(on) {
      for (const m of [...materiales, ...adornos.materiales]) {
        if (!m.userData.mapOriginal) m.userData.mapOriginal = m.map;
        if (m.emissive) {
          m.emissive.setHex(on ? 0xffffff : 0x000000);
          m.emissiveMap = on ? m.userData.mapOriginal : null;
        } else {
          // Los `MeshBasicMaterial` ya van a plena luz por definicion.
          m.color.setHex(0xffffff);
        }
        m.needsUpdate = true;
      }
    },
    /** Apaga o enciende el glow del jugador. Es lo que mide cuanto aporta. */
    setGlow(on) { glow.visible = on; },
    /**
     * La intensidad del glow, para poder barrerla.
     *
     * Hace falta porque el glow estaba calibrado contra unas texturas que llegaban
     * al material SIN rampa de gamma. Subidas por `RAMPA_TEXTURA`, todo lo que las
     * multiplica sube con ellas — y una luz puntual a dos metros quema la roca de
     * cerca. Un ajuste no se toca sin poder volver a medirlo.
     */
    setGlowCandela(x) { glow.intensity = x; },
    /** Apaga o enciende las antorchas, para medir cuanto aportan. */
    setCarteles(on) { carteles.grupo.visible = on; },
    /**
     * Apaga o enciende la SEGUNDA PASADA de texturas de detalle.
     *
     * Es la perilla que convierte «el detalle mejora el contraste» en un numero.
     * Y hace falta su control: el detalle multiplica por dos, asi que apagarlo
     * tiene que bajar el contraste local SIN mover la mediana. Si mueve la
     * mediana, la mezcla no es `2·src·dst` y esta puesta mal.
     */
    setDetalle(on) { if (mallaDetalle) mallaDetalle.visible = on; },
    /** Apaga o enciende los BICHOS, y dice cuantos hay. */
    setBichos(on) { if (bichos) bichos.grupo.visible = on; },
    /**
     * Adelanta el reloj de las animaciones, con el bucle PARADO.
     *
     * Es lo que convierte «se mueve» en una medida: dos fotogramas del mismo
     * sitio a dos tiempos distintos tienen que diferir DONDE ESTA EL BICHO y ser
     * identicos en todo lo demas. Sin el segundo control, un bicho que no se
     * mueve y una pantalla que cambia por otra cosa dan el mismo numero.
     */
    avanzarBichos(dt) { if (bichos) bichos.animar(dt); },
    /** Lo mismo para los 10 adornos que se mueven, que van por el mismo camino. */
    avanzarAdornos(dt) { if (adornosVivos) adornosVivos.animar(dt); },
    /** La interfaz del personaje, para poder mirarla sin raton. */
    personaje: {
      elegir: () => interfaz?.elegir(),
      crear: () => interfaz?.crear(),
      hoja: () => interfaz?.hoja(),
      inventario: () => interfaz?.inventario(),
      opciones: () => interfaz?.opciones(),
      cerrar: () => interfaz?.cerrar(),
      hay: () => Boolean(interfaz),
    },
    /**
     * EL CICLO DE SESION, para poder recorrerlo entero sin raton.
     *
     * Existe por la leccion del 06: un dato bien calculado que nadie lee no da
     * error. Que `sesion.js` pase sus 36 comprobaciones en Node no dice que la
     * capsula se mueva al templo — eso hay que mirarlo en la pantalla, y esto
     * es por donde se mira.
     */
    /**
     * La INTERFAZ, para lo que sólo se puede mirar en la pantalla.
     *
     * `retratos` es cuantas ranuras de modelo hay vivas, y sirve para la unica
     * comprobacion que no se puede hacer de otra forma: que al cambiar de
     * pantalla las viejas se suelten. Una ranura huerfana no da error — da un
     * esqueleto animandose para un `canvas` que ya no esta en la pagina, y eso
     * solo se nota como lentitud a la decima vuelta.
     */
    interfaz: {
      get abierta() { return Boolean(interfaz?.abierta); },
      get retratos() { return interfaz?.retratos ?? 0; },
      paso: (dt) => interfaz?.animarCuerpos(dt ?? 1 / 60),
      /**
       * Abre y cierra la hoja, que hace falta para una cosa concreta: con un
       * panel delante el HUD del juego **se esconde** (`ShowHUD()` mira
       * `MSCLGlobals::CharPanelActive`), y eso hay que poder medirlo.
       */
      hoja: () => { interfaz?.hoja(); return Boolean(interfaz?.abierta); },
      cerrar: () => { interfaz?.cerrar(); return Boolean(interfaz?.abierta); },
    },
    sesion: {
      hay: () => Boolean(sesion),
      estado: () => sesion?.estado ?? null,
      /** Donde dice la sesion que hay que aparecer, y donde estan los pies. */
      donde: () => ({
        dice: sesion?.donde ?? null,
        pies: player.feet,
        entrada: sesion?.entrada ?? null,
        // La distancia entre las dos cosas es el control: si la sesion dice
        // «el templo» y los pies siguen en la cueva, esto lo canta.
        desvio: sesion?.donde?.escena
          ? Math.hypot(
              player.feet[0] - sesion.donde.escena[0],
              player.feet[1] - sesion.donde.escena[1],
              player.feet[2] - sesion.donde.escena[2])
          : null,
      }),
      /** El sitio medido, tal como lo escribio `tools/aparicion.mjs`. */
      aparicion: () => aparicion,
      /**
       * Crea uno y entra, que es el camino del jugador nuevo de un tiron.
       *
       * El arma NO tiene valor por defecto en `crearPersonaje`, y es a
       * proposito: elegirla es la unica decision que MSR le pide a quien crea
       * un personaje, y dejar que se cuele un `undefined` seria convertir esa
       * decision en un descuido. Aqui, que es una sonda, se coge la primera.
       */
      async nuevo(nombre = "Sonda", arma = null) {
        const armas = sesion.catalogo?.nuevoPersonaje?.armas ?? [];
        const p = await sesion.crear({ nombre, arma: arma ?? armas[0] });
        await sesion.entrar(p.id);
        return sesion.personaje;
      },
      async entrar(id) { await sesion.entrar(id); return sesion.personaje; },
      async listar() { return sesion.almacen.listar(); },
      danar: (n, o) => sesion?.danar(n, o),
      matar: (o) => sesion?.matar({ tipo: "monstruo", ...o }),
      reaparecer: () => sesion?.reaparecer(),
      tic: (o) => sesion?.tic(o ?? {}),
      salir: () => sesion?.salir(),
      vitales: () => sesion?.personaje
        ? { vida: sesion.personaje.vida, mana: sesion.personaje.mana, oro: sesion.personaje.oro, ...sesion.limites }
        : null,
    },
    /**
     * LA FISICA, para poder cronometrarla contra las cifras del motor.
     *
     * Que las 50 comprobaciones de `movimiento.js` pasen en Node no dice que
     * el jugador ande a esa velocidad EN EL MAPA: entre las dos cosas estan la
     * conversion de unidades —donde estaba el fallo del 23 %— y Rapier.
     */
    fisica: {
      perfil: () => perfil,
      aguante: () => aguante,
      corriendo: () => corriendo,
      /** Lo que el modelo dice que deberia andar este personaje, en unidades. */
      vitales() {
        const v = vitalesDelPersonaje();
        return { ...v, andando: velocidadAndando(v) };
      },
      danoDeCaida: (v) => danoDeCaidaU(v),
    },
    /**
     * EL MAPA QUE SE COMPORTA: el agua, las escaleras, el daño y las puertas.
     *
     * Que los volumenes esten bien horneados no dice que el jugador nade. Entre
     * las dos cosas estan la conversion de unidades, los planos y Rapier, que
     * es donde han estado todos los fallos de este experimento.
     */
    /**
     * EL SONIDO, medido y no escuchado.
     *
     * Una sonda no oye. Lo que sí puede mirar es si el contexto está vivo,
     * cuántas fuentes se han arrancado, qué material dice el suelo bajo los
     * pies y qué canción pide la zona — que son las cuatro cosas que pueden
     * estar mal sin dar un solo error en la consola.
     */
    sonido: {
      get estado() {
        return {
          contexto: audio.ctx?.state ?? "sin crear",
          despierto: audio.despierto,
          arrancadas: audio.arrancadas,
          sinArchivo: audio.sinArchivo ?? 0,
          fallos: audio.fallos.slice(),
          pedidosDePuerta,
          ambienteSinArchivo,
          catalogo: catalogoSonido ? {
            pasos: Object.fromEntries(Object.entries(catalogoSonido.pasos ?? {})
              .map(([k, v]) => [k, v.length])),
            // Cuáles de esos pasos son NUESTROS. Juntarlos con los leídos es la
            // forma de que un día nadie sepa qué parte del juego suena.
            generados: Object.fromEntries(Object.entries(catalogoSonido.pasos ?? {})
              .map(([k, v]) => [k, v.filter((s) => s.generado).length])),
            jugador: Object.keys(catalogoSonido.jugador ?? {}),
            musica: Object.keys(catalogoSonido.musica ?? {}),
            faltan: catalogoSonido.faltan?.length ?? 0,
            mudos: catalogoSonido.mudos?.length ?? 0,
          } : null,
          /** Los últimos ocho aterrizajes, con lo que decidió cada uno. */
          aterrizajes: aterrizajes.slice(),
          sonidosDeCarga,
          // LA VELOCIDAD EN LAS DOS UNIDADES, que es la pregunta que hay que
          // poder contestar mirando: `player.vel` y lo que sale al pasarla por
          // el factor del mapa. Los pasos y la caída comparan contra números
          // del motor (220, 350, 580), así que equivocarse de unidad no da
          // error: da un juego mudo o uno que suena siempre.
          velocidad: [...player.vel],
          /** La misma, en metros por segundo, que es como se anda por el mapa. */
          enMetros: player.vel.map((v) => v / U),
          /** Y la que recibe de verdad la regla de los pasos. */
          paraLosPasos: velocidadParaLosPasos(),
          caidaEnCurso: player.caida,
        };
      },
      /** Despierta el contexto como lo haría un clic. */
      despertar: () => despertarAudio(),
      /** Qué material pisa el jugador ahora mismo. */
      suelo: () => materialBajoLosPies(player.feet),
      /**
       * Un punto justo encima de una cara HORIZONTAL de la textura que se pida.
       *
       * Existe porque la primera version de la sonda dejaba caer al jugador en
       * una rejilla sobre la caja del mapa y preguntaba: daba 'piedra' las
       * cuarenta veces, y no porque el mapa sea de piedra, sino porque lo
       * soltaba a la altura del TECHO y el trazo del motor son 64 unidades. Es
       * decir, medía el `default:` del `switch` y se veía igual de bien que
       * funcionando.
       *
       * Con esto se pregunta encima de una cara que SE SABE de qué es.
       */
      puntoSobre(textura) {
        // TODOS los grupos de esa textura, no el primero: el mapa la reparte
        // en un grupo por cubo de mapa de luz, y el primero puede ser entero
        // de pared. Buscar sólo en él decía «no hay cara horizontal» de una
        // textura que se pisa en media plaza.
        const cuales = grupos.map((x, i) => (x.texture === textura ? i : -1)).filter((i) => i >= 0);
        const pos = mundo.geometry.attributes.position;
        const idx = mundo.geometry.index;
        for (const g of cuales) {
        const gr = mundo.geometry.groups[g];
        if (!gr) continue;
        for (let i = gr.start; i + 2 < gr.start + gr.count; i += 3) {
          const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
          const va = new THREE.Vector3().fromBufferAttribute(pos, a);
          const vb = new THREE.Vector3().fromBufferAttribute(pos, b);
          const vc = new THREE.Vector3().fromBufferAttribute(pos, c);
          const n = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).normalize();
          // Sólo caras que miran hacia arriba: una pared de la misma textura
          // no se pisa, y preguntar encima de ella daría el `default:` otra vez.
          if (n.y < 0.7) continue;
          const c3 = va.add(vb).add(vc).multiplyScalar(1 / 3);
          return [c3.x, c3.y + 0.05, c3.z];
        }
        }
        return null;
      },
      /** Qué canción pide la zona en la que está, `null` si ninguna. */
      zona: () => {
        const z = volumenes.zonasEn(player.feet).find((x) => x.clase === "msarea_music");
        return z ? (z.musica ?? "(silencio)") : null;
      },
      /**
       * ANDAR DE VERDAD, con el mismo `player.step` del bucle, y devolver la
       * velocidad en las dos unidades junto con lo que el filtro de los pasos
       * decide con ella.
       *
       * Existe porque `simular()` corre la regla con la velocidad que se le
       * dé, y eso no dice nada de si la que le llega en el juego es la buena.
       * Un factor de 39 entre metros y unidades no da error: da un juego que
       * suena a carrera andando.
       */
      andando(s = 1, { correr = true } = {}) {
        const pasos = Math.max(1, Math.round(s / DT));
        const v = vitalesDelPersonaje();
        // La misma cuenta que el bucle: andar sale de la agilidad y del peso, y
        // correr multiplica por el aguante que quede.
        let max = velocidadAndando(v);
        if (correr) max = velocidadCorriendo(max, { aguante, aguanteMax: v.aguanteMax });
        max = ajustarVelocidad(max, {});
        for (let k = 0; k < pasos; k++) {
          player.step(DT, { forward: 1, strafe: 0, jump: false, agachar: false, maxima: max, agua: 0, escalera: null });
        }
        const vel = [...player.vel];
        const horizontal = Math.hypot(vel[0], vel[2]);
        return {
          maxima: max, aguanteMax: v.aguanteMax,
          velocidad: vel,
          horizontal,
          // Lo que el bucle le pasa hoy a la regla de los pasos.
          comoLaLeeElBucle: (() => { const v = velocidadParaLosPasos(); return Math.hypot(v[0], v[2]); })(),
        };
      },
      /** Corre la REGLA sin tocar el audio, y devuelve los pasos que daría. */
      simular(u, segundos, extra = {}) {
        const p = new Pasos({ multijugador: true, azar: () => 0 });
        const dados = [];
        for (let t = 0; t < segundos; t += 1 / 60) {
          const r = p.tic(1 / 60, { velocidad: [u, 0, 0], enSuelo: true, ...extra });
          if (r) dados.push(r);
        }
        return dados;
      },
    },
    /**
     * EL HUD, y por la MISMA puerta que el bucle.
     *
     * `avanzar()` llama a `pasoDelHud`, que es literalmente la función que
     * corre en el fotograma. No hay un segundo camino: eso es lo que dejó al
     * arco del 23 sin disparar durante cinco experimentos con todo en verde.
     */
    hud: {
      hay: () => Boolean(hudMs),
      /** Un suceso, por el mismo sitio por el que los manda el juego. */
      suceso: (tipo, texto) => { suceso(tipo, texto); return hudMs?.estado().consola ?? null; },
      /** `n` segundos de reloj, en pasos de un fotograma. */
      avanzar(segundos, paso = 1 / 60) {
        const n = Math.max(1, Math.round(segundos / paso));
        for (let k = 0; k < n; k++) pasoDelHud(paso);
        return hudMs?.estado() ?? null;
      },
      estado: () => hudMs?.estado() ?? null,
      desplazar: (abajo) => { hudMs?.desplazar(Boolean(abajo)); return hudMs?.estado().consola ?? null; },
      /** Los cvars de la consola, para poder medir el decaimiento sin esperar. */
      cvars(cambios = {}) {
        if (!hudMs) return null;
        for (const [k, v] of Object.entries(cambios)) {
          if (k === "tamano") hudMs.consola.tamano = v;
          if (k === "historial") hudMs.consola.historial = v;
          if (k === "decaimiento") hudMs.consola.decaimiento = v;
        }
        const c = hudMs.consola;
        return { tamano: c.tamano, historial: c.historial, decaimiento: c.decaimiento, maxLineas: c.maxLineas };
      },
      /** La línea de estado de la carga, que ya no es la consola. */
      estatus: () => ({ escondida: status.hidden, texto: status.textContent }),
    },
    /**
     * EL CICLADOR Y LAS DOCE RANURAS, por la misma puerta que el bucle.
     *
     * `avanzar()` es `probe.hud.avanzar`: el mismo `pasoDelHud` que corre el
     * fotograma mueve los dos relojes, el de la espera y el del aguante.
     */
    ranuras: {
      /** Una pulsación de ciclar: `weapon`, `spell` o `arrow`. */
      ciclar(clave) { ciclar(clave); return this.estado(); },
      /** El botón de atacar. Devuelve si se ha COMIDO el golpe. */
      confirmar: () => confirmarCiclador(),
      /** Una tecla de ranura abajo y otra arriba, por separado. */
      pulsar(n) { ranuras.pulsar(n); return this.estado(); },
      soltar(n) { const o = ranuras.soltar(n); cumplir(o); return { orden: o, ...this.estado() }; },
      desplazar(cuanto) { ranuras.desplazar(cuanto); return this.estado(); },
      /** Las siete armas de partida a la mochila: lo que hace la tecla N. */
      armarse() {
        const p = sesion?.personaje;
        if (!p) return null;
        for (const id of (sesion.catalogo?.nuevoPersonaje?.armas ?? [])) {
          if (id === p.manos?.derecha) continue;
          if ((p.objetos ?? []).some((o) => o.id === id)) continue;
          if (!catalogoDeArmas?.has(id)) continue;
          (p.objetos ??= []).push({ id, n: 1 });
        }
        return this.estado();
      },
      /** Empuñar a pelo, para el censo de las siete armas. */
      async empunar(id) {
        if (sesion?.personaje) sesion.personaje.manos.derecha = id;
        await empunar(id);
        return {
          arma: brazo?.arma?.id ?? null,
          nombre: brazo?.arma?.nombre ?? null,
          ataques: (brazo?.ataques ?? []).length,
          esDeTiro: Boolean(brazo?.esDeTiro),
          conModelo: Boolean(armaEnMano),
        };
      },
      /** Las siete de `reg.newchar.weaponlist`. */
      armasDePartida: () => sesion?.catalogo?.nuevoPersonaje?.armas ?? [],
      estado: () => ({
        etiqueta: ciclador.etiqueta,
        activo: ciclador.activo,
        tipo: ciclador.tipo,
        reloj: ciclador.reloj,
        enMano: sesion?.personaje?.manos?.derecha ?? null,
        municion: municionElegida,
        desplazamiento: ranuras.desplazamiento,
        guardadas: ranuras.aTexto(),
        enPantalla: hudMs?.estado().ranura ?? null,
        /** Lo que hay en el DOCUMENTO, que es distinto de lo que hay en memoria. */
        enElPersonaje: (sesion?.personaje?.ranuras ?? []).map((r) => (r ? `${r.tipo}:${r.id}` : null)),
      }),
      /**
       * Guardar y volver a entrar, sin tocar el disco de verdad: es lo que hace
       * el motor al aparecer, y es la única forma de comprobar que una ranura
       * sobrevive. Si `tirar` trae un identificador, ese objeto se pierde antes
       * de recobrar — que es el caso de «vendiste la espada».
       */
      recobrar(tirar = null) {
        const p = sesion?.personaje;
        if (!p) return null;
        if (tirar) {
          p.objetos = (p.objetos ?? []).filter((o) => o.id !== tirar);
          if (p.manos?.derecha === tirar) p.manos.derecha = null;
        }
        recobrarRanuras();
        return this.estado();
      },
    },
    /** EL MENÚ PRINCIPAL. */
    menu: {
      hay: () => Boolean(menuMs),
      abrir: (enJuego) => { menuMs?.abrir(Boolean(enJuego)); return menuMs?.estado() ?? null; },
      cerrar: () => { menuMs?.cerrar(); return menuMs?.estado() ?? null; },
      mover: (paso) => { menuMs?.mover(paso); return menuMs?.estado() ?? null; },
      elegir: () => menuMs?.elegir() ?? null,
      estado: () => menuMs?.estado() ?? null,
    },
    mundo: {
      /** Deja los pies donde se le diga. Sin esto no se puede llegar al agua. */
      poner(x, y, z) {
        player.body.setTranslation({ x, y: y + player.perfil.height / 2, z }, true);
        player.body.setNextKinematicTranslation({ x, y: y + player.perfil.height / 2, z });
        player.vel = [0, 0, 0];
        player.caida = 0;
        world.world.step();
        return player.feet;
      },
      /**
       * Apunta la vista a un punto de la escena.
       *
       * Hace falta para el golpe y no es un adorno: el cono de ataque es de
       * ±45° de RUMBO, así que sin girar la cámara «no le doy a nada» mide hacia
       * dónde mira la cámara al arrancar y no el alcance del arma.
       */
      mirar(x, y, z) {
        const p = player.eye;
        const dx = x - p[0], dy = y - p[1], dz = z - p[2];
        player.yaw = Math.atan2(-dx, -dz);
        player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        camera.rotation.set(player.pitch, player.yaw, 0);
        return { yaw: player.yaw, pitch: player.pitch };
      },
      /**
       * Dónde está el ojo y dónde los pies, en la escena.
       *
       * Hace falta para el arco: para medir la caída de una flecha hay que
       * apuntar al HORIZONTE, y el horizonte es «a la altura del ojo», que nadie
       * de fuera sabe dónde está.
       */
      donde: () => ({ ojo: [...player.eye], pies: [...player.feet] }),
      /**
       * Le mete velocidad de caida directamente, en unidades por segundo.
       *
       * Existe porque soltar al jugador desde una altura mide la GEOMETRIA y
       * no la regla: el estanque grande esta bajo techo, y desde diez metros
       * se aterriza en el suelo de arriba sin llegar a mojarse. Con esto se
       * puede comprobar lo que se quiere comprobar —que el agua cancela el
       * dano de la caida— sin depender de que haya sitio para caer.
       */
      caer(unidadesPorSegundo = 1200) {
        player.vel[1] = -unidadesPorSegundo;
        player.caida = unidadesPorSegundo;
        return player.vel[1];
      },
      /** Que choca ademas del mapa, y que NO — que es la mitad del dato. */
      solidos: () => ({
        adornos: solidos?.n ?? 0,
        adornosTotal: solidos?.deCuantos ?? 0,
        atravesables: solidos?.atravesables ?? 0,
        bichos: bichosSolidos?.n ?? 0,
        bichosTotal: bichosSolidos?.deCuantos ?? 0,
        // Donde esta cada caja solida, para poder ir a chocar con una.
        cajas: (solidos?.puestos ?? []).map((p) => ({ modelo: p.modelo, caja: p.caja })),
        // Y los que NO chocan, para el control de que no se les ha puesto.
        pasan: (level.manifiesto.adornos?.colocaciones ?? [])
          .filter((c) => !c.solido).map((c) => ({ modelo: c.modelo, escena: c.escena })),
      }),
      /** En que medio esta, preguntado igual que en el bucle. */
      medio(pies = player.feet) {
        return {
          pies,
          agua: volumenes.nivelDeAguaEn(pies),
          escalera: volumenes.escaleraEn(pies),
          dano: volumenes.danoEn(pies),
          zonas: volumenes.zonasEn(pies).map((z) => z.clase),
        };
      },
      /** Donde estan las cosas, para que la sonda no las escriba a mano. */
      sitios: () => ({
        agua: (level.manifiesto.interactivas?.agua ?? []).map((a) => a.caja),
        escaleras: (level.manifiesto.interactivas?.escaleras ?? []).map((a) => a.caja),
        dano: (level.manifiesto.interactivas?.dano ?? []).map((a) => a.caja),
        puertas: (level.manifiesto.interactivas?.puertas ?? []).map((p) => ({
          modelo: p.modelo,
          caja: p.caja, bisagra: p.bisagra, grados: p.grados, velocidad: p.velocidad, espera: p.espera,
        })),
      }),
      puertas: () => (puertas?.puertas ?? []).map((p) => ({
        modelo: p.ficha.modelo, estado: p.estado, angulo: p.angulo,
        // El signo es lo que dice hacia QUE LADO se ha abierto esta vez, y es
        // lo unico que distingue «se abre» de «se abre bien».
        signo: p.signo, bisagra: p.ficha.bisagra,
      })),
      /**
       * DONDE ESTA CADA PUERTA de verdad, medido sobre su malla ya colocada.
       *
       * Es la comprobacion que mas falta hacia y la que no se ve en una
       * captura: la malla se emite en coordenadas de la BISAGRA y el nodo se
       * pone en la bisagra, asi que si ese par estuviera mal las nueve puertas
       * saldrian desplazadas — y nueve de trescientas dieciseis piezas siguen
       * pareciendo un mapa correcto. Cerradas, su caja tiene que ser la que
       * escribio el horneado.
       */
      cajasDePuerta() {
        return (puertas?.puertas ?? []).map((p) => {
          p.nodo.updateMatrixWorld(true);
          const c = new THREE.Box3().setFromObject(p.malla);
          return {
            modelo: p.ficha.modelo,
            angulo: p.angulo,
            medida: { min: c.min.toArray(), max: c.max.toArray() },
            horneada: p.ficha.caja,
          };
        });
      },
      /** Un paso del reloj de las puertas a mano, para no esperar en tiempo real. */
      /**
       * `mirando` es un vector plano [x, 0, z]; si no se da, se usa el de la
       * camara. Hace falta porque el lado al que gira la hoja depende de el.
       */
      ticPuertas(dt = 1 / 60, pasos = 1, mirando = null) {
        const m = mirando ?? (() => {
          const v = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
          v.y = 0; if (v.lengthSq() > 1e-6) v.normalize();
          return [v.x, 0, v.z];
        })();
        for (let i = 0; i < pasos; i++) {
          const cerca = new Set(puertas?.cercaDe(player.feet, U) ?? []);
          puertas?.tic(dt, {
            cerca: (p) => cerca.has(p), desde: player.feet, mirando: m,
            radioDelQueAbre: player.perfil.radius,
          });
        }
        return this.puertas();
      },
      /** Deja las nueve cerradas, para poder repetir una prueba de apertura. */
      cerrarPuertas() {
        // "cerrando" con angulo 0 y NO "cerrada": es lo que hace que el tic
        // vuelva a colocar el nodo y el colisionador. Poniendolas "cerradas" a
        // secas deja la hoja girada en pantalla con el estado diciendo que no.
        for (const p of puertas?.puertas ?? []) { p.estado = "cerrando"; p.angulo = 0; p.espera = 0; }
        puertas?.tic(1 / 60, {});
        return this.puertas();
      },
    },
    /** Las asignaciones de teclas, para poder tocarlas sin raton. */
    teclas: {
      mapa: () => ({ ...teclas.mapa }),
      nombre: (c) => nombreDeTecla(c),
      asignar: (a, c) => teclas.asignar(a, c),
      porDefecto: () => teclas.porDefecto(),
      pulsada: (a) => teclas.pulsada(a),
      hayBotonDeJuego: () => teclas.hayBotonDeJuego(),
    },
    /**
     * Cuantos adornos vivos hay, donde estan y DONDE TIENEN LOS HUESOS.
     *
     * Lo ultimo separa dos cosas que en una captura son la misma: «no se
     * mueve» y «no esta en pantalla». La suma de las posiciones de los huesos
     * es un numero que cambia si y solo si la animacion corre.
     */
    dondeAdornos() {
      return (adornosVivos?.instancias ?? []).map((i) => {
        let h = 0;
        for (const b of i.malla.skeleton?.bones ?? []) h += b.position.x + b.position.y * 3 + b.position.z * 7
          + b.quaternion.x * 11 + b.quaternion.y * 13 + b.quaternion.z * 17 + b.quaternion.w * 19;
        return {
          clave: i.ficha.clave, recorrido: i.ficha.recorrido,
          animacion: i.actual?.seq?.nombre ?? null,
          fotogramas: i.actual?.seq?.fotogramas ?? 0,
          huesos: Number(h.toFixed(6)),
          pos: i.nodo.position.toArray().map((v) => Number(v.toFixed(3))),
        };
      });
    },
    /**
     * Pone el reloj de los ESTILOS DE LUZ en el segundo `t`, con el bucle
     * parado, y devuelve cuantos materiales han cambiado de atlas.
     *
     * Es lo que permite medir el parpadeo sin grabar video: dos capturas del
     * mismo sitio en dos instantes tienen que diferir SOLO en las caras que
     * llevan un estilo animado. Sin esto, «parpadea» es una opinion sobre un
     * GIF.
     */
    setReloj(t) {
      relojLuz = t;
      return animarLuz(t);
    },
    /** En que variante esta cada cubo ahora mismo, para poder comprobarlo. */
    dondeLuz(t = relojLuz) {
      return (level.manifiesto.luz.cubos ?? []).map((c) => ({
        cubo: c.clave, estilos: c.estilos, de: c.variantes.length,
        variante: atlas.indiceEnT(c.clave, t),
      }));
    },
    /**
     * Da un paso de PASEO con el bucle parado, y devuelve donde esta cada bicho.
     *
     * Es lo que permite medir el paseo sin grabar video: se dan N pasos y se
     * comprueba que andaron, que siguen sobre el suelo y que no se metieron en
     * la roca. Las tres cosas fallan de formas distintas y ninguna da error.
     */
    pasoBichos(dt = 1 / 60) {
      if (bichos) bichos.pasear(dt, arnesDePaseo);
      return bichos ? bichos.instancias.map((i) => [i.nodo.position.x, i.nodo.position.y, i.nodo.position.z]) : [];
    },
    /** Donde esta cada bicho ahora mismo, sin tocarlos. */
    dondeBichos() {
      return bichos ? bichos.instancias.map((i) => ({
        nombre: i.ficha.nombre, clave: i.ficha.clave,
        p: [i.nodo.position.x, i.nodo.position.y, i.nodo.position.z],
        v: i.velocidad, anda: Boolean(i.vagabundo?.tieneDestino),
      })) : [];
    },
    /** Hay hueco / donde esta el suelo, para que la sonda use el mismo arnes. */
    sondaFisica(x, y, z, n = null) {
      // `n` es el INDICE del bicho al que no hay que contarle su propio
      // cilindro. Sin él la muestra se toma con el bicho puesto, el rayo choca
      // con su propia cápsula y el suelo sale a la altura de su cabeza — que es
      // justo el fallo del 17, aquí en el instrumento de medir.
      const i = n === null ? null : (bichos?.instancias ?? [])[n] ?? null;
      return { suelo: arnesDePaseo.suelo(x, y, z, i), libre: arnesDePaseo.libre(x, y, z, 1, 0, 0.35, i) };
    },
    /** Le pone a UN bicho otra animacion, por indice. Para mirarlas. */
    ponAnimacion(i, nombre) {
      const b = bichos?.instancias?.[i];
      return b ? Boolean(b.pon(nombre)) : false;
    },
    bichos: bichos ? { n: bichos.n, modelos: bichos.modelos.size, triangulos: bichos.triangulos } : null,
    /**
     * LA CAZA, medida y no mirada.
     *
     * Lo que puede estar mal sin dar error: que nadie sea hostil, que el
     * hostil no te vea, que te vea y no se mueva, que llegue y no pegue, o que
     * te pegue el pueblo entero. Las cinco se ven igual de bien en una captura.
     */
    ia: {
      /** El censo: quien es hostil segun la tabla de razas. */
      censo() {
        const l = (bichos?.instancias ?? []).map((i) => ({
          nombre: i.ficha.nombre, raza: i.ficha.ia?.raza ?? null,
          hostil: Boolean(i.ficha.hostil), relacion: i.ficha.relacion,
          escena: [i.nodo.position.x, i.nodo.position.y, i.nodo.position.z],
          alcanceDeGolpe: i.ficha.ia?.alcanceDeGolpe ?? null,
        }));
        return { total: l.length, hostiles: l.filter((x) => x.hostil).length, lista: l };
      },
      /** El estado de uno: a quien persigue, que quiere hacer y a que distancia. */
      estado(n = 0) {
        const hostiles = (bichos?.instancias ?? []).filter((i) => i.ficha.hostil);
        const i = hostiles[n];
        if (!i) return null;
        return {
          nombre: i.ficha.nombre,
          escena: [i.nodo.position.x, i.nodo.position.y, i.nodo.position.z],
          objetivo: i.cazador?.objetivo ?? null,
          intencion: i.intencion?.accion ?? null,
          rango: i.intencion?.rango ?? null,
          animacion: i.nombreActual ?? null,
          frenado: i.frenado ?? null,
          destino: i.intencion?.destino ?? null,
          velocidad: i.velocidad, velocidadCorriendo: i.velocidadCorriendo,
          // La vida, que hace falta para medir un daño a distancia: con el
          // mandoble se mira `probe.golpe`, pero una flecha le pega sola y el
          // único testigo es la vida del bicho.
          vida: i.vida ?? null, vidaMaxima: i.vidaMaxima ?? null, muerto: Boolean(i.muerto),
        };
      },
      /** Cuantos bichos te tienen fichado ahora mismo. */
      atacantes() {
        return (bichos?.instancias ?? [])
          .filter((i) => i.cazador?.objetivo === "jugador")
          .map((i) => i.ficha.nombre);
      },
      /** Cuantos golpes ha encajado el jugador. */
      get golpes() { return golpesRecibidos; },
      /** Lleva al jugador al lado del hostil `n`, a `d` metros y en rumbo `a`. */
      irA(n = 0, d = 2, a = 0) {
        const hostiles = (bichos?.instancias ?? []).filter((i) => i.ficha.hostil);
        const i = hostiles[n];
        if (!i) return null;
        const p = i.nodo.position;
        window.probe.mundo.poner(p.x + Math.cos(a) * d, p.y + 0.2, p.z + Math.sin(a) * d);
        return [p.x, p.y, p.z];
      },
      /**
       * ¿Ve el hostil `n` al jugador AHORA MISMO?
       *
       * Hace falta para elegir dónde ponerse a probar la persecución: a siete
       * metros de un goblin metido en una cueva, casi cualquier rumbo da una
       * pared, y entonces «no me persigue» mide la geometría y no la IA.
       */
      ve(n = 0) {
        const i = (bichos?.instancias ?? []).filter((x) => x.ficha.hostil)[n];
        return i ? arnesDePaseo.veA(i, "jugador") : null;
      },
      /** Un solo paso, contando lo que pasa dentro. Para depurar. */
      paso(n = 0) {
        const i = (bichos?.instancias ?? []).filter((x) => x.ficha.hostil)[n];
        if (!i) return null;
        const a = [i.nodo.position.x, i.nodo.position.z];
        bichos.cazar(1 / 60, arnesDePaseo);
        return {
          movido: Math.hypot(i.nodo.position.x - a[0], i.nodo.position.z - a[1]),
          frenado: i.frenado ?? null, destino: i.destino ?? null, cerca: i.cerca ?? null,
          intencion: i.intencion?.accion ?? null,
        };
      },
      /** Corre la caza `s` segundos sin depender del fotograma. */
      correr(s = 3) {
        for (let t = 0; t < s; t += 1 / 60) bichos?.cazar(1 / 60, arnesDePaseo);
        bichosSolidos?.seguir();
        return this.estado(0);
      },
      /**
       * SI LA IA ESTÁ ENCENDIDA. Lo que faltaba del 17 al 20, y la razón por
       * la que hacía falta una sonda que lo mirara: un interruptor en `false`
       * se ve exactamente igual que una IA que no funciona.
       */
      get encendida() { return paseando; },
    },
    /**
     * EL MUNDO VIVO: el paseo y la animación de estar parado.
     *
     * Va aparte de `probe.ia` porque es otro sistema: `npcatk_hunt` es del
     * script y `SetWanderDest` es de C++, y lo que se mide aquí —quién se
     * mueve sin que le provoques y con qué pose se queda— no tiene nada que
     * ver con perseguir.
     */
    /**
     * EL ARCO. Y todo pasa por `pasoDelBrazo`, que es lo que llama el bucle: la
     * sonda aprieta el botón y suelta, y no llama a `tirar` por su cuenta.
     */
    arco: {
      /** Pone el arco de partida en la mano y devuelve lo que se sabe de él. */
      async empunar(id = "bows_treebow") {
        await empunar(id);
        const a = brazo?.ataques?.[0] ?? null;
        return {
          id: brazo?.arma?.id ?? null,
          esDeTiro: Boolean(brazo?.esDeTiro),
          ataques: brazo?.ataques?.length ?? 0,
          sostener: a?.sostener ?? null,
          cono: a?.cono ?? null,
          apunta: a?.apunta ?? null,
          fuerza: a?.alcance ?? null,
          proyectil: a?.proyectil ?? null,
          secuencias: [...(armaEnMano?.clips?.keys() ?? [])],
          conjunto: flechasPuestas?.cuantas ?? 0,
        };
      },
      /**
       * TENSAR `segundos` Y SOLTAR, y luego dejar volar hasta que la flecha
       * llegue a algo o pasen `espera` segundos.
       *
       * Devuelve lo que se puede medir de un tiro: cuándo salió, con qué
       * velocidad, cuánto se desvió de la cruceta y dónde acabó.
       */
      tirar(segundos = 1.5, { espera = 4 } = {}) {
        const DT = 1 / 60;
        // ── PRIMERO, SOLTAR LO QUE HUBIERA ────────────────────────────────────
        //
        // Y esto no es limpieza: es lo que hizo falta para que la sonda midiera
        // algo. El bucle de fotogramas sigue corriendo entre dos llamadas del
        // navegador y llama a `pasoDelBrazo(DT, false)` en cada uno, o sea que
        // **suelta el botón**. Un arco a medio tensar al salir de una llamada
        // dispara solo antes de entrar en la siguiente, y entonces lo que mide
        // el control siguiente es una flecha de otro tiro. Se notó en que el
        // «tensando 1,5 s» decía 0 u/s: la flecha que encontraba ya había caído.
        //
        // Así que cada tiro empieza con el arco quieto, y el aguantar y el
        // soltar pasan dentro de UNA sola llamada.
        for (let t = 0; t < 4 && brazo && brazo.fase !== "quieto"; t += DT) pasoDelBrazo(DT, false);
        const habia = ultimaFlecha;
        const enCarne = flechazos;
        const mirando = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
        let cuando = null;
        for (let t = 0; t < segundos; t += DT) {
          const e = pasoDelBrazo(DT, true);
          if (e?.tira) cuando = t;
        }
        for (let t = 0; t < espera && cuando === null; t += DT) {
          const e = pasoDelBrazo(DT, false);
          if (e?.tira) cuando = segundos + t;
        }
        // Por IDENTIDAD y no por la longitud de la lista: ver `ultimaFlecha`.
        const f = ultimaFlecha !== habia ? ultimaFlecha : null;
        // Y se la deja volar por el mismo sitio que el bucle.
        let vuelo = 0;
        for (let t = 0; t < espera && f && f.volando; t += DT) { pasoDeFlechas(DT); vuelo += DT; }
        const d = f?.direccionInicial ?? null;
        const grados = d
          ? (Math.acos(Math.min(1, Math.max(-1,
            d[0] * mirando.x + d[1] * mirando.y + d[2] * mirando.z))) * 180) / Math.PI
          : null;
        // ── Y EL DESVÍO PARTIDO EN DOS, que es lo que hace falta saber ────────
        //
        // El ángulo a secas no distingue las dos cosas: nueve grados de lado y
        // nueve grados hacia arriba dan el mismo número, y son lo contrario. El
        // arreglo del apuntado **no reduce el desvío**: lo pasa del guiño al
        // cabeceo, o sea que la flecha sigue saliendo a nueve grados de la
        // cruceta y ahora esos nueve grados compensan la caída en vez de tirar la
        // flecha a un lado. Medido con un ángulo solo, el arreglo parecía no
        // servir de nada mientras pasaba de 0 a 12 aciertos.
        const der = new THREE.Vector3(1, 0, 0).applyEuler(camera.rotation);
        const arr = new THREE.Vector3(0, 1, 0).applyEuler(camera.rotation);
        const enGrados = (x) => (Math.asin(Math.min(1, Math.max(-1, x))) * 180) / Math.PI;
        return {
          disparo: cuando,
          // La del DISPARO, no la del fotograma siguiente: la gravedad entra
          // antes de mover y se come diez unidades por segundo.
          velocidad: f?.velocidadInicial ?? null,
          acerto: flechazos > enCarne,
          // Cuánto se ha desviado de donde apuntaba la cruceta, en grados. Con
          // el arco de árbol y el motor tal cual, esto **no puede ser cero**:
          // los nueve grados del guiño y el cono de borde están siempre.
          desvio: grados,
          /** Positivo = a la derecha de la cruceta. */
          desvioLateral: d ? enGrados(d[0] * der.x + d[1] * der.y + d[2] * der.z) : null,
          /** Positivo = por encima de la cruceta, que es lo que compensa la caída. */
          desvioVertical: d ? enGrados(d[0] * arr.x + d[1] * arr.y + d[2] * arr.z) : null,
          vuelo,
          choco: f ? !f.volando : null,
          contra: f?.choque?.contra ? (f.choque.contra.ficha?.nombre ?? "bicho") : (f?.choque ? "mundo" : null),
          recorrido: f?.recorrido ?? null,
          caida: f ? f.pos[1] - (player.eye[1] * U) : null,
          dano: f?.dano ?? null,
          enVuelo: flechasEnVuelo.length,
          puestas: flechasPuestas?.puestas ?? 0,
          tiros,
          flechazos,
        };
      },
      /**
       * TENSAR `segundos` SIN SOLTAR, todo dentro de una llamada.
       *
       * Existe por lo mismo que el soltado de arriba: si la sonda aguanta el
       * botón repartiendo la espera en treinta llamadas, el bucle del juego mete
       * entre ellas sus propios pasos con el botón arriba y el arco dispara solo.
       */
      tensar(segundos = 0.5) {
        const DT = 1 / 60;
        for (let t = 0; t < 4 && brazo && brazo.fase !== "quieto"; t += DT) pasoDelBrazo(DT, false);
        const antes = flechasEnVuelo.length;
        for (let t = 0; t < segundos; t += DT) pasoDelBrazo(DT, true);
        return {
          fase: brazo?.fase ?? null,
          tensando: brazo?.fase === FASE.TENSANDO,
          tensado: brazo?.tensado ?? 0,
          atacando: Boolean(brazo?.atacando),
          salieron: flechasEnVuelo.length - antes,
          secuencia: armaEnMano?.actual?.nombre ?? null,
        };
      },
      /**
       * Cambia los interruptores de las erratas EN CALIENTE, para poder medir el
       * juego de verdad y el juego arreglado en la misma sesión. Es lo único de
       * este proyecto que toca una constante del motor a propósito, y por eso
       * devuelve lo que queda puesto.
       */
      ajustar(cambios = {}) {
        for (const [k, v] of Object.entries(cambios)) {
          if (k in AJUSTES) AJUSTES[k] = Boolean(v);
        }
        return { ...AJUSTES };
      },
      /** Y los deja como el motor. */
      restaurar() {
        Object.assign(AJUSTES, COMO_EL_MOTOR);
        return { ...AJUSTES };
      },
      /** El estado del brazo, para ver que tensar es un estado y no un instante. */
      estado() {
        return {
          fase: brazo?.fase ?? null,
          tensando: brazo?.fase === FASE.TENSANDO,
          tensado: brazo?.tensado ?? 0,
          atacando: Boolean(brazo?.atacando),
          sueltaPendiente: Boolean(brazo?.sueltaPendiente),
          enVuelo: flechasEnVuelo.length,
          secuencia: armaEnMano?.actual?.nombre ?? null,
        };
      },
      /** La munición que el motor le daría ahora mismo, y si la gasta. */
      municion() {
        const a = brazo?.ataques?.[0] ?? null;
        const m = municion(a ?? { proyectil: "arrow" });
        return {
          id: m.ficha?.id ?? null,
          nombre: m.ficha?.nombre ?? null,
          dano: m.ficha?.dano ?? null,
          gravedad: m.ficha?.gravedad ?? null,
          gasta: Boolean(m.gasta),
          enLaMochila: (sesion?.personaje?.objetos ?? [])
            .filter((o) => catalogoDeFlechas?.has(o.id)).map((o) => `${o.id}×${o.n}`),
        };
      },
      /** Los interruptores de las tres erratas, y si están como el motor. */
      ajustes() {
        return {
          ahora: { ...AJUSTES },
          comoElMotor: { ...COMO_EL_MOTOR },
          fiel: Object.keys(COMO_EL_MOTOR).every((k) => AJUSTES[k] === COMO_EL_MOTOR[k]),
        };
      },
    },
    vivo: {
      /** Quién declara `roam 1` y quién está clavado a propósito. */
      censo() {
        const l = (bichos?.instancias ?? []).map((i) => ({
          nombre: i.ficha.nombre, script: i.ficha.script,
          pasea: Boolean(i.vagabundo?.pasea),
          parado: i.ficha.parado ?? null,
          animacion: i.nombreActual ?? i.actual?.seq?.nombre ?? null,
          // La ACTIVIDAD de la que está puesta, que es lo que de verdad dice
          // si está en pose de andar: los nombres no son fiables porque hay
          // scripts que usan la misma secuencia para las dos cosas.
          actividad: i.actual?.seq?.actividad ?? null,
          andando: i.ficha.andando ?? null,
          // De dónde sale su animación de estar quieto: del script, de la
          // actividad o de la secuencia 0.
          porque: animacionDeParado({ nombrado: i.ficha.parado, secuencias: i.secuencias ?? [] }).porque,
        }));
        return {
          total: l.length,
          pasean: l.filter((x) => x.pasea).length,
          nombran: l.filter((x) => x.porque.includes("script")).length,
          porActividad: l.filter((x) => x.porque.includes("ACT_IDLE")).length,
          alaCero: l.filter((x) => x.porque.includes("secuencia 0")).length,
          // EL CONTROL QUE IMPORTA: nadie que esté quieto puede estar en una
          // secuencia de ANDAR. Era el fallo entero del 21.
          //
          // Y se mide por ACTIVIDAD y no por nombre, que fue el segundo
          // intento fallido: comparar `animacion === andando` marca en rojo a
          // dos que están bien. `gatecity/storage` hace `setidleanim idle` Y
          // `setmoveanim idle` —para él las dos SON la misma secuencia— y
          // `gatecity/mayor` hace `setmoveanim idle` a secas, o sea que el
          // alcalde anda con la animación de estar quieto. Las dos cosas las
          // pide el script y contarlas como fallo es contar mal.
          enPoseDeAndar: l.filter((x) => !x.pasea && (x.actividad === 3 || x.actividad === 4)).length,
          mismaParaLasDos: l.filter((x) => x.parado && x.parado === x.andando).length,
          andanConLaDeQuieto: l.filter((x) => x.andando && x.andando === x.parado).length,
          lista: l,
        };
      },
      /**
       * PARAR EL PASEO, para las sondas que miden otra cosa.
       *
       * Desde el 22 el mundo se mueve de verdad, y eso le quita el suelo a
       * cualquier medición que dé por hecho dónde está alguien: el grito al
       * morir mide quién queda a 294 unidades, y el escudo necesita un goblin
       * pegado. Con los bichos paseando, esas dos sondas miden el dado.
       *
       * No se apaga la IA —los bichos tienen que seguir cazando— sino sólo el
       * `roam`, que es la condición que el motor consulta y por tanto el sitio
       * donde esto se apaga sin inventar nada.
       */
      congelarPaseo(si = true) {
        let n = 0;
        for (const i of bichos?.instancias ?? []) {
          if (si) {
            if (i.vagabundo?.pasea) { i.paseabaAntes = true; i.vagabundo.pasea = false; n++; }
            i.vagabundo?.llegado();
            i.destino = null;
          } else if (i.paseabaAntes && i.vagabundo) { i.vagabundo.pasea = true; n++; }
        }
        return { congelados: n };
      },
      /**
       * LO QUE VALE CADA BICHO, con la cadena de ajustes aplicada, y el estado
       * del servidor con el que se ha calculado.
       */
      experiencia() {
        const vistos = new Map();
        for (const i of bichos?.instancias ?? []) {
          if (vistos.has(i.ficha.clave)) continue;
          vistos.set(i.ficha.clave, {
            nombre: i.ficha.nombre,
            dice: i.ficha.ia?.experiencia ?? 0,
            vale: loQueVale(i),
            seAjusta: Boolean(i.ficha.ia?.seAjusta),
            esJefe: Boolean(i.ficha.ia?.esJefe),
          });
        }
        const l = [...vistos.values()];
        return {
          central: PARTIDA.central,
          jugadores: jugadoresActivos(partida(), PARTIDA),
          vidaTotal: vidaTotal(partida(), PARTIDA),
          nivelDeAjuste: nivelDeAjuste(vidaTotal(partida(), PARTIDA)),
          seAjustan: l.filter((x) => x.seAjusta).length,
          jefes: l.filter((x) => x.esJefe).length,
          // El +1 de la errata del `expadj 1`: todos los que dan experiencia
          // dan uno más de lo que dice su script, y los que no dan siguen sin
          // dar (el `if NPC_GIVE_EXP > 0` corta antes).
          conExp: l.filter((x) => x.dice > 0).length,
          todosMasUno: l.filter((x) => x.dice > 0).every((x) => x.vale === x.dice + 1),
          cerosQueSiguenACero: l.filter((x) => x.dice === 0).every((x) => x.vale === 0),
          lista: l,
        };
      },
      /**
       * VIVIR `s` segundos POR DONDE VIVE EL JUGADOR.
       *
       * Esto no llama a `bichos.pasear`. Llama a lo mismo que el bucle de
       * fotogramas y en el mismo orden (`main.js`, el `if (paseando)`), que es
       * la única forma de contestar «¿lo hace el juego?» en vez de «¿funciona
       * la función?».
       *
       * Hace falta porque el 21 se dejó el paseo muerto y su sonda dijo que
       * estaba verde: `pasear(10)` llamaba al módulo a mano, y el juego pasa
       * por `cazar`, que hasta hoy plantaba a los 69. Un control que llama a
       * lo que quiere medir no mide nada.
       */
      vivir(s = 10) {
        const antes = (bichos?.instancias ?? []).map((i) => [i.nodo.position.x, i.nodo.position.z]);
        const rein0 = (bichos?.instancias ?? []).map((i) => i.sigue?.reinicios ?? 0);
        const rep0 = (bichos?.instancias ?? []).map((i) => i.sigue?.veces ?? 0);
        const DT = 1 / 60;
        let t0 = reloj;
        for (let t = 0; t < s; t += DT) {
          t0 += DT;
          bichos?.cazar(DT, { ...arnesDePaseo, ahora: t0 });
          bichos?.animar(DT);
        }
        bichosSolidos?.seguir();
        const l = (bichos?.instancias ?? []).map((i, n) => ({
          nombre: i.ficha.nombre,
          pasea: Boolean(i.vagabundo?.pasea),
          movido: Math.hypot(i.nodo.position.x - antes[n][0], i.nodo.position.z - antes[n][1]),
          reinicios: (i.sigue?.reinicios ?? 0) - rein0[n],
          repeticiones: (i.sigue?.veces ?? 0) - rep0[n],
          animacion: i.nombreActual ?? null,
        }));
        return {
          segundos: s,
          conRoam: l.filter((x) => x.pasea).length,
          seMovieron: l.filter((x) => x.movido > 0.2).length,
          quietosConRoam: l.filter((x) => x.pasea && x.movido <= 0.2).length,
          clavadosQueSeMovieron: l.filter((x) => !x.pasea && x.movido > 0.05).length,
          masLejos: Math.max(0, ...l.map((x) => x.movido)),
          // EL PARPADEO, contado: cuántas veces se ha rebobinado una animación
          // en `s` segundos. Con la guarda puesta, un bicho quieto rebobina
          // cero veces por mucho que le vuelva a tocar la misma en el sorteo.
          reinicios: l.reduce((a, x) => a + x.reinicios, 0),
          peorParpadeo: Math.max(0, ...l.map((x) => x.reinicios)),
          // Y las veces que la guarda ha impedido un rebobinado, que es la
          // medida de si la guarda hace algo o es decorativa.
          repeticiones: l.reduce((a, x) => a + x.repeticiones, 0),
          peorRepeticion: Math.max(0, ...l.map((x) => x.repeticiones)),
          // EL TEMBLOR DEL ENCAJADO: uno que declara `roam`, no se mueve ni un
          // centímetro y aun así cambia de animación una y otra vez. Es el
          // ciclo andar→chocar→quieto→esperar→andar, y en el motor no existe
          // porque chocar no suelta el destino. Antes eran las cuatro ratas
          // hundidas; tiene que ser cero.
          temblando: l.filter((x) => x.pasea && x.movido < 0.05 && x.reinicios > 4).length,
          lista: l,
        };
      },
      /** Corre SÓLO el paseo `s` segundos y dice cuánto se ha movido cada uno. */
      pasear(s = 10) {
        const antes = (bichos?.instancias ?? []).map((i) => [i.nodo.position.x, i.nodo.position.z]);
        const DT = 1 / 60;
        // Se mira CADA fotograma y no sólo al final. El plazo del vagabundo es
        // de 7 s y la espera de 2, y los 69 arrancan con el mismo reloj: en el
        // segundo 10 exacto están todos en el hueco de los 2 s, o sea todos
        // quietos. Una foto ahí dice «ninguno anda con la animación de andar»
        // y es verdad en ese instante y mentira en el resto.
        const vioAndar = (bichos?.instancias ?? []).map(() => false);
        for (let t = 0; t < s; t += DT) {
          bichos?.pasear(DT, arnesDePaseo);
          (bichos?.instancias ?? []).forEach((i, n) => {
            if (i.andando === "pasea" && i.ficha.andando &&
                i.nombreActual === String(i.ficha.andando).toLowerCase()) vioAndar[n] = true;
          });
        }
        bichosSolidos?.seguir();
        const l = (bichos?.instancias ?? []).map((i, n) => ({
          nombre: i.ficha.nombre,
          pasea: Boolean(i.vagabundo?.pasea),
          movido: Math.hypot(i.nodo.position.x - antes[n][0], i.nodo.position.z - antes[n][1]),
          animacion: i.nombreActual ?? null,
          // Si su script declara animación de andar y la tiene puesta. Hay
          // que preguntarlo así y no comparar con la cadena «walk»: 33 de los
          // 69 no declaran ninguna y andan con la de estar quietos, que es lo
          // que hace el motor y no un fallo que haya que marcar en rojo.
          declaraAndar: Boolean(i.ficha.andando),
          conLaDeAndar: vioAndar[n],
        }));
        return {
          segundos: s,
          seMovieron: l.filter((x) => x.movido > 0.2).length,
          andandoBien: l.filter((x) => x.movido > 0.2 && x.conLaDeAndar).length,
          andandoMal: l.filter((x) => x.movido > 0.2 && x.declaraAndar && !x.conLaDeAndar).length,
          quietosConRoam: l.filter((x) => x.pasea && x.movido <= 0.2).length,
          // Y el control al revés: los 16 clavados NO se pueden haber movido.
          clavadosQueSeMovieron: l.filter((x) => !x.pasea && x.movido > 0.05).length,
          masLejos: Math.max(0, ...l.map((x) => x.movido)),
          lista: l,
        };
      },
      /**
       * EL SORTEO REPETIDO: qué poses de reposo se ven en `s` segundos.
       *
       * Sólo anima (no pasea ni caza), que es lo que hace falta para ver el
       * dado del `SetActivity` sin que nadie se mueva de sitio.
       */
      poses(s = 30) {
        const vistas = new Map();
        const DT = 1 / 60;
        for (let t = 0; t < s; t += DT) {
          bichos?.animar(DT);
          for (const i of bichos?.instancias ?? []) {
            if (i.muerto || i.ficha.parado) continue;
            const n = i.nombreActual ?? i.actual?.seq?.nombre ?? null;
            if (!n) continue;
            if (!vistas.has(i.ficha.nombre)) vistas.set(i.ficha.nombre, new Set());
            vistas.get(i.ficha.nombre).add(n);
          }
        }
        return [...vistas].map(([nombre, s2]) => ({ nombre, poses: [...s2] }))
          .sort((a, b) => b.poses.length - a.poses.length);
      },
      /**
       * LOS SONIDOS DE UN BICHO, tal como le llegan al navegador.
       *
       * `recibir` sale del cuerpo de su `npc_struck` y no de una constante, y
       * es lo único de este proyecto que se lee del CUERPO de un evento. Si el
       * lector se rompiera, la lista saldría vacía y el bicho se quedaría mudo
       * sin dar ningún error — de ahí que haya un control que la cuente.
       */
      sonidos(n = 0) {
        const i = bichos?.instancias?.[n];
        if (!i) return null;
        const s = i.ficha.ia?.sonidos ?? {};
        const st = i.ficha.ia?.struck ?? {};
        return {
          nombre: i.ficha.nombre,
          recibir: s.recibir ?? [],
          dolor: s.dolor ?? [],
          muerte: s.muerte ?? [],
          usaDolor: Boolean(st.usaDolor),
          usaEncogerse: Boolean(st.usaEncogerse),
        };
      },
      /** El estado del vagabundo de uno, para ver los dos relojes por dentro. */
      vagabundo(n = 0) {
        const i = bichos?.instancias?.[n];
        if (!i?.vagabundo) return null;
        const v = i.vagabundo;
        return {
          nombre: i.ficha.nombre, pasea: v.pasea, ancho: v.ancho,
          t: v.t, proximoNodo: v.proximoNodo, plazo: v.plazo,
          tieneDestino: v.tieneDestino, vencido: v.vencido,
          // La distancia al destino, que es la que tiene que salir grande.
          lejos: v.destino
            ? Math.hypot(v.destino[0] - i.nodo.position.x * U, v.destino[2] - i.nodo.position.z * U)
            : null,
        };
      },
    },
    /**
     * LA PASADA DE LA VISTA: el arma y el muñeco, medidos donde acaban.
     *
     * No se comprueban las constantes —eso lo haría cualquier `assert` contra
     * el número que acabo de escribir—: se mide **dónde cae la malla** en los
     * ejes de la vista, en unidades, que es lo que se ve. Un arma que apunta a
     * la derecha de la pantalla y un muñeco de perfil son el mismo fallo de
     * noventa grados, y los dos números lo dicen.
     */
    vista: {
      /** La caja de una malla en ejes de la VISTA: derecha, arriba, delante. */
      caja(cual = "arma") {
        const o = cual === "muneco" ? muneco : cual === "escudo" ? escudoEnMano : armaEnMano;
        if (!o) return null;
        o.seguir(camera);
        o.nodo.updateMatrixWorld(true);
        const caja = new THREE.Box3().setFromObject(o.nodo);
        if (caja.isEmpty()) return null;
        const inv = camera.matrixWorldInverse.clone();
        camera.updateMatrixWorld(true);
        inv.copy(camera.matrixWorld).invert();
        // Las ocho esquinas pasadas a ejes de cámara, porque la caja del mundo
        // no dice nada si la cámara está girada.
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        const v = new THREE.Vector3();
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? caja.max.x : caja.min.x, i & 2 ? caja.max.y : caja.min.y,
            i & 4 ? caja.max.z : caja.min.z).applyMatrix4(inv);
          const p = [v.x * U, v.y * U, -v.z * U]; // derecha, arriba, delante
          for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
        }
        return {
          derecha: [min[0], max[0]], arriba: [min[1], max[1]], delante: [min[2], max[2]],
          visible: o.nodo.visible,
        };
      },
      /** Cambia el género del muñeco, que es otro modelo y otras pistas. */
      async genero(g = "female") { await ponerMuneco(g); return this.muneco; },
      get muneco() {
        if (!muneco) return null;
        muneco.seguir(camera);
        return {
          hay: true, visible: muneco.nodo.visible, animacion: muneco.animacion,
          triangulos: muneco.ficha.triangulos,
          // A qué distancia del ojo lo pone, en unidades: el motor dice 4,7
          // delante y 3,1 abajo, o sea 5,63 de separación.
          delOjo: muneco.nodo.position.distanceTo(camera.position) * U,
        };
      },
    },
    /**
     * EL GOLPE DEL JUGADOR, medido.
     *
     * Las cinco formas de que esto parezca funcionar y esté mal se ven igual en
     * una captura: que el arma no esté en la mano, que el daño caiga en el
     * fotograma del clic, que no le dé a nada, que le dé a todo, o que el bicho
     * pierda vida y no se muera nunca. Así que hay que medirlas.
     */
    golpe: {
      get estado() {
        return {
          arma: brazo?.arma?.id ?? null,
          nombre: brazo?.arma?.nombre ?? null,
          ataques: brazo?.ataques?.length ?? 0,
          fase: brazo?.fase ?? null,
          atacando: Boolean(brazo?.atacando),
          carga: brazo?.carga ?? 0,
          animacion: armaEnMano?.actual?.nombre ?? null,
          modelo: armaEnMano ? armaEnMano.ficha.nombre : null,
          triangulos: armaEnMano?.ficha?.triangulos ?? 0,
          potencia: potenciaDe(brazo?.ataques?.[0]),
          // Las tripas del brazo. Están aquí porque «no blande» tiene cuatro
          // causas que se ven igual: que no haya arma, que esté a medio
          // mandoble, que crea que estás cargando, o que el botón no llegue.
          t: brazo?.t ?? null, cargando: brazo?.cargando ?? 0,
          cargaHecha: brazo?.cargaHecha ?? 0, pulsadoAntes: brazo?.pulsadoAntes ?? null,
          golpesDados, impactos, muertes, aguante,
        };
      },
      /** Empuña otra arma del catálogo, para probar varias. */
      empunar: (id) => empunar(id),
      /** El catálogo que se ha leído. */
      catalogo: () => [...(catalogoDeArmas?.keys() ?? [])],
      /**
       * Aguanta el botón `s` segundos con el paso fijo, y cuenta lo que pasa.
       *
       * No mueve el ratón ni depende del fotograma: es el mismo `tic` que corre
       * en el bucle, para que lo que mida la sonda sea lo que juega el jugador.
       */
      atacar(s = 1.5, { pulsado = true } = {}) {
        if (!brazo) return null;
        const antes = { golpesDados, impactos, muertes };
        let empiezos = 0, finales = 0;
        // EL BOTÓN ARRIBA HASTA QUE EL BRAZO ESTÉ EN REPOSO, y entonces se
        // pulsa. Es «un clic desde quieto», que es lo que quiere medir esto.
        //
        // No es un adorno: sin soltar primero, la sonda heredaba el mandoble a
        // medias de la medición anterior, y entonces **pulsar significa otra
        // cosa** — un clic durante un mandoble arranca la carga, y cargando no
        // se blande. La sonda medía cero mandobles en dos minutos, sin un solo
        // error, midiendo una regla del motor que sí funcionaba.
        for (let k = 0; k < 120; k++) {
          if (brazo.fase === "quieto" && !brazo.cargando && !brazo.cargaHecha) break;
          brazo.tic(DT, { pulsado: false, destreza: destrezaDe(brazo.ataques[0]) });
        }
        for (let t = 0; t < s; t += DT) {
          // La misma puerta que el bucle: cubriéndose no hay ataque. Sin esto la
          // sonda mediría mandobles que el jugador no puede dar.
          const e = brazo.tic(DT, {
            pulsado: pulsado && !cubriendose(), destreza: destrezaDe(brazo.ataques[0]),
          });
          if (e.empieza) empiezos++;
          if (e.acaba) finales++;
          if (e.golpe) pegar(e.golpe);
        }
        return {
          empiezos, finales,
          golpes: golpesDados - antes.golpesDados,
          impactos: impactos - antes.impactos,
          muertes: muertes - antes.muertes,
          fase: brazo.fase,
        };
      },
      /**
       * CARGAR, que no es lo mismo que atacar y por eso es otra puerta.
       *
       * Corre las dos cosas que corre el fotograma —`pasoDelBrazo` y
       * `pasoDelHud`— para que la barra se pinte de verdad. `atacar()` sólo
       * mueve el brazo, así que con ella la barra no se pintaría nunca y la
       * sonda diría que no funciona.
       *
       * Y la carga de MSR no arranca con el primer clic: hay que estar ya
       * blandiendo. Así que esto da un mandoble, y sin soltar sigue pulsando.
       */
      cargar(s = 2.2) {
        if (!brazo) return null;
        for (let k = 0; k < 120; k++) {
          if (brazo.fase === "quieto" && !brazo.cargando && !brazo.cargaHecha) break;
          pasoDelBrazo(DT, false);
        }
        // Y AHORA LA PARTE QUE NO ES OBVIA, y que la primera versión de esta
        // puerta se saltó: **el primer clic no carga nunca**. La carga arranca
        // al pulsar ESTANDO YA blandiendo (`ActivateButtonDown`), así que hay
        // que dar un mandoble, soltar en medio y volver a pulsar. Apretar el
        // botón desde quieto y no soltarlo —que es lo que hacía— no carga, y
        // la sonda decía «la barra no se ve» sobre un HUD que estaba bien.
        for (let k = 0; k < 120 && !brazo.atacando; k++) pasoDelBrazo(DT, true);
        pasoDelBrazo(DT, false);
        const antes = sonidosDeCarga;
        const vistas = [];
        for (let t = 0; t < s; t += DT) {
          pasoDelBrazo(DT, true);
          pasoDelHud(DT);
          const b = hudMs?.estado().carga ?? [];
          const suya = b.find((x) => x.visible);
          if (suya) vistas.push({ t: Number(t.toFixed(2)), ...suya });
        }
        return {
          carga: brazo.carga, cargando: brazo.cargando, fase: brazo.fase,
          sonidos: sonidosDeCarga - antes,
          // El primero y el último fotograma en que la barra se vio, que es lo
          // que hace falta para saber si cambia de color y de número.
          primera: vistas[0] ?? null, ultima: vistas[vistas.length - 1] ?? null,
          fotogramasVisible: vistas.length,
          colores: [...new Set(vistas.map((v) => v.color))],
          niveles: [...new Set(vistas.map((v) => v.nivel))],
        };
      },
      /** Suelta el botón y deja que el brazo acabe, como el bucle. */
      soltar(s = 1.5) {
        for (let t = 0; t < s; t += DT) { pasoDelBrazo(DT, false); pasoDelHud(DT); }
        return { fase: brazo?.fase ?? null, carga: brazo?.carga ?? 0 };
      },
      /** A quién le daría un mandoble AHORA, sin darlo. */
      objetivo() {
        if (!brazo?.ataques?.length) return null;
        const a = brazo.ataques[0];
        const ojo = player.eye;
        const m = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
        const pies = player.feet;
        const r = elegirObjetivo({
          desde: [ojo[0] * U, ojo[1] * U, ojo[2] * U],
          centro: [pies[0] * U, (pies[1] + player.perfil.height / 2) * U, pies[2] * U],
          mirando: [m.x, m.y, m.z],
          alcance: a.alcance ?? 0,
          candidatos: candidatosDeGolpe(),
          libre: trazaLibre,
        });
        return r ? {
          nombre: r.objetivo.id.ficha.nombre, distancia: r.distancia,
          vida: r.objetivo.id.vida, vidaMaxima: r.objetivo.id.vidaMaxima,
        } : null;
      },
      /**
       * POR QUÉ NO LE DA, con las tres pruebas por separado.
       *
       * Existe por la lección del `i.frenado` de la IA: «no le da» tiene tres
       * causas —lejos, fuera del cono, pared en medio— que se ven exactamente
       * igual desde fuera, y un `null` no distingue entre ellas ni de «esto no
       * se ha llamado». Con esto, el que mide sabe qué mover.
       */
      porque(n = 0) {
        const i = (bichos?.instancias ?? []).filter((x) => x.ficha.hostil)[n];
        if (!i || !brazo?.ataques?.length) return null;
        const a = brazo.ataques[0];
        const c = candidatosDeGolpe().find((x) => x.id === i);
        if (!c) return { razon: "no está en el censo", vivo: !i.muerto, vida: i.vida };
        const ojo = player.eye;
        const pies = player.feet;
        const desde = [ojo[0] * U, ojo[1] * U, ojo[2] * U];
        const centro = [pies[0] * U, (pies[1] + player.perfil.height / 2) * U, pies[2] * U];
        const m = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
        const dist = Math.hypot(c.centro[0] - desde[0], c.centro[1] - desde[1], c.centro[2] - desde[2]);
        const dx = c.centro[0] - centro[0], dz = c.centro[2] - centro[2];
        const plano = Math.hypot(dx, dz);
        // LOS DOS vectores normalizados EN EL PLANO, y ojo con el segundo: la
        // mirada es un vector de tres componentes, y mirando 60° hacia abajo su
        // parte horizontal mide 0,5. Dividiendo sólo por la distancia al bicho
        // —que es lo que escribí primero— el coseno sale 0,5 y el diagnóstico
        // dice «fuera del cono» de algo que está justo delante. Es el mismo
        // error de forma que el del rayo hasta el ojo, otra vez, y esta vez en
        // el instrumento de medir en lugar de en el código medido.
        const largoDeMirada = Math.hypot(m.x, m.z);
        const coseno = plano > 0 && largoDeMirada > 0
          ? (dx * m.x + dz * m.z) / (plano * largoDeMirada) : 1;
        const libre = trazaLibre(desde, c.centro);
        return {
          nombre: i.ficha.nombre,
          alcance: a.alcance, distancia: dist, lejos: dist > a.alcance,
          coseno, gradosFuera: (Math.acos(Math.max(-1, Math.min(1, coseno))) * 180) / Math.PI,
          fueraDelCono: coseno <= 0.7,
          pared: !libre,
          razon: dist > a.alcance ? "lejos" : coseno <= 0.7 ? "fuera del cono"
            : !libre ? "pared en medio" : "le da",
          // Lo que hace falta para mover al que mide: la horizontal máxima a la
          // que se puede estar, dada la diferencia de alturas.
          horizontalMaxima: Math.sqrt(Math.max(0,
            a.alcance ** 2 - (c.centro[1] - desde[1]) ** 2)),
          horizontal: Math.hypot(c.centro[0] - desde[0], c.centro[2] - desde[2]),
        };
      },
      /** El estado de vida del hostil `n`, para ver cómo baja y cómo muere. */
      victima(n = 0) {
        const i = (bichos?.instancias ?? []).filter((x) => x.ficha.hostil)[n];
        if (!i) return null;
        return {
          nombre: i.ficha.nombre, vida: i.vida, vidaMaxima: i.vidaMaxima,
          muerto: i.muerto, animacion: i.nombreActual ?? null,
          muerteQueDice: i.ficha.ia?.muerte ?? null,
          experiencia: i.ficha.ia?.experiencia ?? null,
          recibido: { ...i.recibido },
          solido: Boolean((bichosSolidos?.puestos ?? []).find((p) => p.instancia === i)),
          visible: i.nodo.visible,
        };
      },
      /** Mata al hostil `n` de un golpe, para mirar la muerte sin esperar. */
      matar(n = 0) {
        const i = (bichos?.instancias ?? []).filter((x) => x.ficha.hostil)[n];
        if (!i || !bichos) return null;
        i.recibido = { "swordsmanship.power": i.vidaMaxima };
        // `parry: 0` fija la tirada del bicho en cero para que la araña —que
        // tiene 50 de parry desde el 19— no pare el golpe con el que la sonda
        // quiere mirar la muerte.
        bichos.herir(i, i.vida + 1, { cubo: "swordsmanship.power", dados: { parry: 0, quien: JUGADOR } });
        bichosSolidos?.quitar(i);
        repartirExperiencia(i);
        return this.victima(n);
      },
      /** La hoja del personaje, que es donde acaba la experiencia. */
      hoja() {
        const p = sesion?.personaje;
        if (!p) return null;
        return {
          arma: p.manos?.derecha ?? null,
          habilidades: Object.fromEntries(Object.entries(p.habilidades ?? {})
            .map(([k, v]) => [k, Object.fromEntries(Object.entries(v)
              .map(([pk, pv]) => [pk, { valor: pv.valor, exp: Math.round(pv.exp * 100) / 100 }]))])),
        };
      },
    },
    /**
     * LAS CONSECUENCIAS DEL GOLPE (19): parar, encogerse, huir y avisar.
     *
     * Casi todo esto es medible sin andar hasta el bicho, y a propósito: lo que
     * se quiere comprobar es la REGLA enchufada, y caminar mete de por medio el
     * alcance y el cono, que ya los mide la sonda del golpe.
     */
    reaccion: {
      get estado() { return { parados, encogidas, huidas, avisos, reloj, razas: tablaDeRazas.size }; },
      /** Si el juego cree que dos bichos son aliados, y por qué. */
      aliados(a, b) {
        const x = (bichos?.instancias ?? [])[a], y = (bichos?.instancias ?? [])[b];
        if (!x || !y) return null;
        return {
          razaA: x.ficha.ia?.raza ?? null, razaB: y.ficha.ia?.raza ?? null,
          relacion: relacionDeRazas(tablaDeRazas, x.ficha.ia?.raza, y.ficha.ia?.raza),
          aliados: sonAliados({ o: x }, { o: y }),
          distancia: Math.hypot((x.nodo.position.x - y.nodo.position.x) * U, (x.nodo.position.z - y.nodo.position.z) * U),
        };
      },
      /** La ficha de reacción de cada bicho, y si su modelo trae la animación. */
      censo() {
        return (bichos?.instancias ?? []).map((i, n) => {
          const ia = i.ficha.ia ?? {};
          const hay = (a) => Boolean(a) && Boolean(i.clips?.get(String(a).toLowerCase()));
          return {
            n, nombre: i.ficha.nombre, script: i.ficha.script, raza: ia.raza ?? null,
            hostil: Boolean(i.ficha.hostil), vida: i.vida, vidaMaxima: i.vidaMaxima,
            parry: ia.parry ?? 0, esquiva: ia.esquiva ?? null, hayEsquiva: hay(ia.esquiva),
            mensaje: ia.mensajeDeParry ?? null,
            muerte: ia.muerte ?? null, hayMuerte: hay(ia.muerte),
            muerteDeclarada: ia.muerteDeclarada ?? null,
            golpe: ia.golpe ?? null, hayGolpe: hay(ia.golpe),
            huir: ia.huir ?? null,
            encogerseIA: ia.encogerse?.puede ?? false,
            struck: ia.struck?.usaEncogerse ?? false,
            animacionDeEncogerse: ia.struck?.animacion ?? ia.encogerse?.animacion ?? null,
            hayEncogerse: hay(ia.struck?.animacion ?? ia.encogerse?.animacion),
          };
        });
      },
      /**
       * EL TIPO DE DAÑO que el camino de verdad le pasa al parry, que es lo que
       * decide si se puede parar. Existe por un fallo: el campo de la ficha se
       * llama `tipoDano` y lo escribí `tipoDeDano`, y eso no da error — da un
       * tipo vacío, que es imparable por accidente. Sin esto, el único síntoma
       * era que la araña no esquivaba nunca jugando.
       */
      tipoDelAtaque() { return brazo?.ataques?.[0]?.tipoDano ?? null; },
      /** Le pone la vida que se le diga, para medir muchos golpes sin matarlo. */
      vida(n, v) {
        const i = (bichos?.instancias ?? [])[n];
        if (!i) return null;
        i.vida = v; i.vidaMaxima = Math.max(i.vidaMaxima ?? 0, v);
        return i.vida;
      },
      /** El estado vivo del bicho `n`: animación, huida, si está quieto. */
      quien(n = 0) {
        const i = (bichos?.instancias ?? [])[n];
        if (!i) return null;
        const p = player.feet;
        const d = Math.hypot(i.nodo.position.x - p[0], i.nodo.position.z - p[2]);
        return {
          nombre: i.ficha.nombre, vida: i.vida, muerto: i.muerto,
          animacion: i.nombreActual ?? null,
          huyendo: Boolean(i.cazador?.huyendo),
          quedaDeHuida: i.cazador?.fuga?.queda ?? null,
          objetivo: i.cazador?.objetivo ?? null,
          quieto: reloj < (i.reaccion?.quietoHasta ?? -Infinity),
          frenado: i.frenado ?? null,
          parados: i.reaccion?.parados ?? 0, encogidas: i.reaccion?.encogidas ?? 0,
          recibido: { ...i.recibido },
          distanciaAlJugador: d,
          donde: [i.nodo.position.x, i.nodo.position.y, i.nodo.position.z],
          destino: i.destino ?? null,
          velocidad: i.velocidadCorriendo ?? i.velocidad ?? 0,
        };
      },
      /**
       * UN GOLPE DIRECTO al bicho `n`, con el daño y los dados que se le digan.
       * `parry` fija la tirada del bicho: 0 no para nunca, 90 para siempre.
       */
      pegarA(n, dano = 1.1, { tipo = "slash", parry = null, acc = null, huir = null } = {}) {
        const i = (bichos?.instancias ?? [])[n];
        if (!i || !bichos) return null;
        const dados = { quien: JUGADOR };
        if (parry !== null) dados.parry = parry;
        if (acc !== null) dados.acc = acc;
        if (huir !== null) dados.huir = huir;
        const r = bichos.herir(i, dano, { cubo: "swordsmanship.power", tipo, ahora: reloj, dados });
        if (r.muerto) { bichosSolidos?.quitar(i); repartirExperiencia(i); }
        return { ...r, avisados: r.avisados?.length ?? 0 };
      },
      /** Mata al bicho `n` y devuelve a cuántos aliados ha avisado al morir. */
      matarYAvisar(n = 0) {
        const i = (bichos?.instancias ?? [])[n];
        if (!i || !bichos) return null;
        const r = bichos.matar(i, { quien: JUGADOR, esAliado: sonAliados });
        bichosSolidos?.quitar(i);
        return {
          muerto: r.muerto, avisados: r.avisados.length,
          // A quién ha avisado y si le ha puesto el objetivo, que es el efecto.
          quienes: r.avisados.map((k) => ({
            nombre: bichos.instancias[k].ficha.nombre,
            objetivo: bichos.instancias[k].cazador?.objetivo ?? null,
            distancia: Math.hypot(
              (bichos.instancias[k].nodo.position.x - i.nodo.position.x) * U,
              (bichos.instancias[k].nodo.position.z - i.nodo.position.z) * U),
          })),
        };
      },
      /** Adelanta el reloj del mundo `s` segundos con el paso fijo, cazando. */
      avanzar(s = 1) {
        const pasos = Math.max(1, Math.round(s / DT));
        for (let k = 0; k < pasos; k++) {
          reloj += DT;
          bichos?.animar(DT);
          bichos?.cazar(DT, { ...arnesDePaseo, ahora: reloj });
        }
        bichosSolidos?.seguir();
        return { reloj, pasos };
      },
      /**
       * LA TASA MEDIDA de parada: N golpes con los dados de verdad. Es el
       * control contra la cuenta cerrada de `probabilidadDeParry`.
       */
      tasaDeParada(n = 0, golpes = 4000) {
        const i = (bichos?.instancias ?? [])[n];
        if (!i || !bichos) return null;
        const vida = i.vida, recibido = { ...i.recibido };
        let parados = 0;
        for (let k = 0; k < golpes; k++) {
          // Daño 0,001 para que 4 000 golpes no lo maten: lo que se mide es la
          // tirada, no el daño.
          const r = bichos.herir(i, 0.001, { tipo: "slash", ahora: reloj, dados: { quien: JUGADOR } });
          if (r.parado) parados++;
        }
        i.vida = vida; i.recibido = recibido;   // se deja como estaba
        return { golpes, parados, tasa: parados / golpes };
      },
    },
    /**
     * EL ESCUDO. Lo que se mide aquí no es que el modelo se monte —eso lo dice
     * `caja()`— sino las tres cifras de la regla: cuánto daño te llevas con cada
     * postura, que el cono sea el de 53 grados y no el de 175, y que cubrirse
     * impida atacar.
     */
    escudo: {
      get estado() {
        return {
          catalogo: catalogoDeEscudos?.size ?? 0,
          id: brazal?.objeto?.id ?? null,
          nombre: brazal?.objeto?.nombre ?? null,
          desplegado: Boolean(brazal?.desplegado),
          arriba: Boolean(brazal?.atacando),
          postura: brazal?.postura ?? null,
          montado: Boolean(escudoEnMano),
          animacion: escudoEnMano?.actual?.nombre ?? null,
          ficha: brazal?.ficha ?? null,
          bloqueos, desvios, fueraDelCono, parados, golpesRecibidos,
          parry: parryDelPersonaje(),
        };
      },
      /** Pone un escudo del catálogo, o `null` para quitarlo. */
      async embrazar(id = null) {
        await embrazar(id);
        if (sesion?.personaje) sesion.personaje.manos.izquierda = id ?? null;
        return window.probe.escudo.estado;
      },
      /** Lo levanta o lo baja sin tocar el ratón, para poder medir. */
      cubrir(si = true, pasos = 20) {
        if (!brazal) return null;
        for (let k = 0; k < pasos; k++) pasoDelEscudo(DT, Boolean(si));
        return { arriba: brazal.arriba, postura: brazal.postura, t: brazal.t };
      },
      /**
       * AGUANTAR N SEGUNDOS DE PALIZA con el escudo levantado, y contar.
       *
       * La vida se rellena entre tandas, y eso es un andamio declarado: un
       * personaje nuevo tiene veintitantos puntos de vida y un goblin hace 6-9,
       * así que a los cuatro golpes está muerto — y un jugador muerto no recibe
       * daño, con lo que la medición sale con cero bloqueos y ningún error. Es
       * exactamente el fallo que esta línea evita.
       */
      aguantarGolpes(s = 20) {
        if (!brazal || !sesion?.personaje) return null;
        const antes = { recibidos: golpesRecibidos, bloqueos, desvios, fueraDelCono, parados };
        // `sesion.limites` y no `vitalesDelPersonaje()`: ésa devuelve lo que
        // necesita el modelo de velocidad —agilidad, fuerza, peso, carga y
        // aguante— y **no trae `vidaMax`**. Aquí ponía `undefined` en la vida
        // del personaje en cada paso, y no se veía porque el recorte de la
        // sesión lo arreglaba en el tic siguiente.
        const max = sesion.limites.vidaMax;
        const pasos = Math.max(1, Math.round(s / DT));
        for (let k = 0; k < pasos; k++) {
          // La vida a tope en cada paso: no se mide cuánto aguantas, se mide
          // cuántos golpes bloquea el escudo.
          sesion.personaje.vida = max;
          // El botón aguantado, el paso del escudo y el de los bichos, en el
          // mismo orden y con el mismo `DT` que el bucle de dibujo.
          pasoDelEscudo(DT, true);
          reloj += DT;
          bichos?.animar(DT);
          bichos?.cazar(DT, { ...arnesDePaseo, ahora: reloj });
        }
        sesion.personaje.vida = max;
        bichosSolidos?.seguir();
        return {
          segundos: s, arriba: brazal.arriba,
          recibidos: golpesRecibidos - antes.recibidos,
          bloqueos: bloqueos - antes.bloqueos,
          desvios: desvios - antes.desvios,
          fueraDelCono: fueraDelCono - antes.fueraDelCono,
          parados: parados - antes.parados,
        };
      },
      /** ¿Puede el arma salir ahora mismo? Es `IsShielding()`. */
      puedeAtacar() { return !cubriendose(); },
      /**
       * EL CONO, medido donde de verdad se aplica. Dice a partir de cuántos
       * grados deja de bloquear, girando al atacante alrededor del jugador.
       */
      cono(paso = 1) {
        const yo = player.feet;
        const mirando = [-Math.sin(player.yaw), 0, -Math.cos(player.yaw)];
        let ultimo = null;
        for (let g = 0; g <= 180; g += paso) {
          const r = (g * Math.PI) / 180;
          // Se gira el atacante en el plano alrededor de «adelante».
          const p = [
            yo[0] + (mirando[0] * Math.cos(r) - mirando[2] * Math.sin(r)) * 3,
            yo[1],
            yo[2] + (mirando[2] * Math.cos(r) + mirando[0] * Math.sin(r)) * 3,
          ];
          if (!dentroDelCono2D(p, [yo[0], yo[1], yo[2]], mirando)) break;
          ultimo = g;
        }
        return { semianguloMedido: ultimo, declarado: 175 };
      },
      /**
       * N golpes contra el jugador con la postura que sea, y cuánto daño se
       * lleva de media. Es el control de verdad: la cuenta cerrada está en
       * `danoEsperado` y esto la mide con los dados sueltos.
       */
      recibir(n = 2000, { postura = "arriba", dano = 10, tipo = "", deFrente = true } = {}) {
        if (!brazal?.ficha) return null;
        let total = 0, bloqueados = 0, anulados = 0;
        for (let k = 0; k < n; k++) {
          const d = defensaDelJugador({
            dano, tipo, escudo: brazal.ficha, postura, desplegado: true, deFrente,
            parry: parryDelPersonaje(),
          });
          total += d.dano;
          if (d.bloqueo.bloquea) { bloqueados++; if (d.dano === 0) anulados++; }
        }
        return {
          golpes: n, bloqueados, anulados,
          medio: total / n, razon: total / (n * dano),
        };
      },
    },
    /** Apaga o enciende la caja de cielo. */
    setCielo(on) { if (mallaCielo) mallaCielo.visible = on; },
    detalle: { grupos: gruposDetalle?.length ?? 0, hay: Boolean(mallaDetalle) },
    /**
     * Apaga o enciende los ADORNOS, y es la sonda que dice cuanto aportan.
     *
     * Vale lo mismo que `setKit()` en Corinth: lo que mide un adorno no es la
     * cobertura —que en un interior ya esta saturada— sino cuantos pixeles
     * CAMBIAN al quitarlo.
     */
    setAdornos(on) { adornos.grupo.visible = on; },
    /**
     * El lado por el que se dibujan los ADORNOS. Es el control del bobinado, y
     * hace falta por lo mismo que el del mundo: un bobinado invertido no se ve
     * como geometria al reves, se ve como agujeros.
     *
     * GoldSrc dibuja los modelos con `glCullFace(GL_FRONT)`, o sea al reves que
     * el mundo, asi que la pregunta no es retorica. Los tres lados: 0 frontal,
     * 1 trasero, 2 los dos.
     */
    setAdornoLado(cual) {
      const lados = [THREE_FRONT, THREE_BACK, THREE.DoubleSide];
      for (const m of adornos.materiales) {
        m.side = lados[cual] ?? THREE_FRONT;
        m.needsUpdate = true;
      }
    },
    adornos: { n: adornos.n, ficheros: adornos.ficheros, triangulos: adornos.triangulos },
    /**
     * Pinta de ROSA las caras que no tienen mapa de luz.
     *
     * Es la sonda que faltaba para contestar a «se ven texturas completamente
     * negras», y sale gratis por como esta montado el atlas: las 1 133 caras sin
     * mapa de luz NO tienen parche propio, todas apuntan al mismo luxel negro
     * reservado que puso `reservarLuxeles()`. Asi que basta con pintar de rosa ESE
     * luxel y se delatan todas solas, sin tocar una sola UV ni un solo material.
     *
     * Y hace falta porque «negro» y «oscuro» son dos reproches distintos con dos
     * causas distintas, y una captura no los distingue: un rincon a 12 sobre 255 y
     * una cara sin mapa de luz se ven igual. Si al darle a esto no se pone rosa
     * nada de lo que se ve negro, el negro es luz horneada y el archivo lo quiso
     * asi; si se pone rosa, es esto.
     */
    setSinLuzEnRosa(on) {
      if (!rosa) {
        const img = atlas.quieta.image;
        const lienzo = document.createElement("canvas");
        lienzo.width = img.width;
        lienzo.height = img.height;
        const cx = lienzo.getContext("2d");
        cx.drawImage(img, 0, 0);
        // El luxel negro reservado, con el margen que lo rodea: se pinta un
        // cuadro de 4x4 porque el filtro lineal muestrea vecinos y un solo pixel
        // rosa saldria mezclado con el negro de al lado.
        // `negro` viaja en UV, no en pixeles: es lo que necesita la malla.
        const nx = Math.round(level.manifiesto.luz.negro[0] * img.width - 0.5);
        const ny = Math.round(level.manifiesto.luz.negro[1] * img.height - 0.5);
        cx.fillStyle = "#ff00c8";
        cx.fillRect(nx - 1, ny - 1, 3, 3);
        rosa = new THREE.CanvasTexture(lienzo);
        rosa.magFilter = THREE.LinearFilter;
        rosa.minFilter = THREE.LinearFilter;
        rosa.generateMipmaps = false;
        rosa.wrapS = rosa.wrapT = THREE.ClampToEdgeWrapping;
        // LO MISMO QUE EL ATLAS, las dos cosas, y las dos eran distintas:
        //
        //   colorSpace  estaba a `SRGBColorSpace` mientras el atlas va sin espacio
        //               de color. Three.js convertia el atlas entero a lineal, o
        //               sea que al darle a la perilla la pantalla se OSCURECIA de
        //               mediana 42 a 20 y no se tenia de rosa nada. Una sonda que
        //               cambia lo que no busca y no cambia lo que busca.
        //   channel     sin el `1`, el atlas se muestrea con las UV de la textura,
        //               que es exactamente el fallo que esta sonda tenia que
        //               delatar. Se delataba a si misma y no lo decia.
        rosa.colorSpace = atlas.quieta.colorSpace;
        rosa.channel = 1;
        rosa.flipY = false;
      }
      for (const m of [...materiales, ...adornos.materiales]) {
        if (!m.userData.conLuz) continue;
        m.lightMap = on ? rosa : atlasDe(m);
        m.needsUpdate = true;
      }
    },
    /** El factor de overbright, para poder barrerlo y MIRARLO. */
    setOverbright(x) {
      for (const m of materiales) m.lightMapIntensity = Math.PI * x;
    },
    /**
     * Dibuja con las caras traseras en vez de las frontales.
     *
     * Es el control del BOBINADO, y hace falta porque el bobinado invertido no se
     * ve como geometria al reves: se ve como oscuridad. Las 12 680 caras del mundo
     * salieron al reves a la primera —GoldSrc las guarda en sentido horario visto
     * desde delante y Three.js llama frontal al antihorario— y el sintoma fue una
     * vista de la llegada con el 0,3 % de pantalla y cuatro manchas flotando.
     *
     * Desde DENTRO de una sala, con el bobinado bien, la cara frontal tapa mucho
     * mas que la trasera. Si las dos tapan lo mismo, o la trasera mas, van al
     * reves. Ese par de numeros es lo que convierte la sonda en un juez.
     *
     * Y no vale mirar desde FUERA del mapa: un mapa sellado de una cara visto
     * desde arriba deja ver el interior de los suelos del fondo, que si miran a la
     * camara. Esa sonda se escribio antes, acuso al codigo bueno y se tiro.
     */
    setLado(atras) {
      for (const m of materiales) {
        m.side = atras ? THREE_BACK : THREE_FRONT;
        m.needsUpdate = true;
      }
    },
    place(feetUnits, yaw = 0, pitch = 0, settle = 90) {
      const f = [feetUnits[0] / U, feetUnits[2] / U, -feetUnits[1] / U];
      player.body.setTranslation({ x: f[0], y: f[1] + player.centreOffset, z: f[2] }, true);
      player.velocityY = 0;
      player.yaw = yaw;
      player.pitch = pitch;
      for (let i = 0; i < settle; i++) {
        player.step(DT, {});
        if (player.grounded) break;
      }
      return { feet: player.feet, grounded: player.grounded };
    },
    /** Vuelve a la llegada. Los pies ya vienen calculados del árbol BSP. */
    restart(yaw = rumbo, pitch = 0) {
      player.body.setTranslation(
        { x: level.start[0], y: level.start[1] + player.centreOffset + 0.2, z: level.start[2] },
        true
      );
      player.velocityY = 0;
      player.yaw = yaw;
      player.pitch = pitch;
      for (let i = 0; i < 90; i++) { player.step(DT, {}); if (player.grounded) break; }
      return { feet: player.feet, grounded: player.grounded };
    },
    /** Coloca al jugador en uno de los pueblos, para ver los interiores. */
    alPueblo(i = 0, yaw = 0) {
      const p = level.pueblos[i];
      if (!p) return null;
      player.body.setTranslation(
        { x: p.escena[0], y: p.escena[1] + player.centreOffset + 0.5, z: p.escena[2] },
        true
      );
      player.velocityY = 0;
      player.yaw = yaw;
      for (let k = 0; k < 90; k++) { player.step(DT, {}); if (player.grounded) break; }
      return { feet: player.feet, grounded: player.grounded, pueblo: p };
    },
    fly(eyeUnits, yaw = 0, pitch = 0) {
      camera.position.set(eyeUnits[0] / U, eyeUnits[2] / U, -eyeUnits[1] / U);
      camera.rotation.set(pitch, yaw, 0);
      // El cielo sigue al ojo TAMBIEN aqui. La primera version solo lo movia en
      // el bucle de juego, asi que todas las capturas salian con la caja de
      // cielo plantada en el origen del mapa — con paralaje y del reves.
      if (mallaCielo) mallaCielo.position.copy(camera.position);
      // La dlight del glow sobre los bichos TAMBIEN aqui. Sin esto, las capturas
      // salian con los bichos a la luz de su suelo y el visor los ensena
      // iluminados al acercarse: dos imagenes distintas del mismo sitio, que es
      // lo que ya paso con la caja de cielo.
      if (bichos) bichos.alumbrar(camera.position, glow.visible ? { radio: GLOW.alcance * GLOW.radio, color: [1, 1, 0.5] } : { radio: 0 });
      renderer.render(escena, camera);
      return { eye: camera.position.toArray() };
    },
    draw() {
      const eye = player.eye;
      camera.position.set(eye[0], eye[1], eye[2]);
      camera.rotation.set(player.pitch, player.yaw, 0);
      if (mallaCielo) mallaCielo.position.set(eye[0], eye[1], eye[2]);
      renderer.render(escena, camera);
      return { eye, width: canvas.width, height: canvas.height };
    },
  };

  const m = level.medidas;
  const alPuebloM = level.pueblos.length
    ? Math.min(...level.pueblos.map((p) =>
        Math.hypot(p.escena[0] - level.start[0], p.escena[2] - level.start[2])))
    : 0;
  // EL VOLCADO TECNICO VA A LA CONSOLA, no a la pantalla.
  //
  // Esta linea lleva diez experimentos siendo el resumen de lo que se ha
  // conseguido leer del `.bsp`, y es util — pero es para quien lo desarrolla,
  // no para quien lo juega. En pantalla ocupaba tres renglones debajo del
  // panel de personajes diciendo cuantos triangulos tiene el mapa.
  //
  // `console.info` y no `console.log`: asi no se pierde entre los avisos.
  console.info(
    `gatecity.bsp (DrKill, leido no copiado) · ${level.mesh.triangleCount} triangulos, ` +
      `${level.mesh.groups.length} materiales · ${m.variedadDelMundo.texturas} texturas en el mundo, ` +
      `${m.variedadDelMundo.c80} cubren el 80 % · mapa de luz ${(m.luzBytes / 1048576).toFixed(2)} MB ` +
      // Ya no es UN atlas: son uno por cubo de estilos y una variante por estado
      // del parpadeo. Poner aqui el tamano del quieto es decir una cifra que fue
      // verdad y ya no lo es, que es como empiezan los numeros que nadie revisa.
      `repartido en ${(level.manifiesto.luz.cubos ?? []).reduce((s, c) => s + c.variantes.length, 0) || 1} atlas ` +
      `de ${(level.manifiesto.luz.cubos ?? []).length || 1} cubos de estilo (los estados del parpadeo, ` +
      `${(level.manifiesto.luz.cubos ?? []).filter((c) => c.estilos.length).reduce((s, c) => s + c.caras, 0)} caras titilan) · ` +
      `gamma ${level.manifiesto.luz.gamma} y brillo ${level.manifiesto.luz.brillo} ` +
      `con el overbright ${level.manifiesto.luz.overbright ? "encendido" : "apagado"}, ` +
      `como el config.cfg del juego · a resolucion nativa · ` +
      `cara mediana ${m.variedadDelMundo.mediana.toFixed(2)} m2 · ` +
      `${adornos.n} adornos de ${adornos.ficheros} .mdl (${adornos.triangulos} triangulos), ` +
      `cada uno con la luz del suelo que tiene debajo` +
      ` · ${carteles.n} carteles: 57 antorchas de Fire1/Fire2.spr y 23 halos de lampara` +
      ` (glow01.spr no esta en MSC: el halo es un degradado nuestro)` +
      ` · llegas por ${level.manifiesto.entrada.clase}, a ${alPuebloM.toFixed(0)} m del pueblo mas cercano` +
      ` (el mapa lo pone asi) · T = ir a uno de los ${level.pueblos.length} pueblos · ` +
      `L = apagar el glow y ver el mapa como lo horneo el compilador`
  );
  // Y en pantalla, nada hasta que aparezca alguien. La linea de abajo es la
  // consola de sucesos del juego y su primer suceso es que llegas.
  say("");
  requestAnimationFrame(frame);
  // Y AHORA se puede entrar. `Sesion.entrar()` espera a esta promesa antes de
  // colocar a nadie: si alguien le dio a «jugar» mientras cargaba, es en esta
  // linea donde se desbloquea. Va lo ultimo a proposito — soltarla antes
  // dejaria aparecer en un mapa a medio montar, que no se cae con un error
  // sino con un jugador atravesando el suelo.
  mapaListo();
}

async function main() {
  if (GATECITY_LEVEL) return mainGateCity();
  let level;
  if (JHARRO_LEVEL) {
    say("excavando el jharro…");
    level = jharroLevel();
  } else if (MESH_LEVEL) {
    say("calculando terreno…");
    level = terrainLevel({ name: MAP });
  } else {
    say("cargando mapa…");
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
    say("montando el jharro…");
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
    say("montando Corinth…");
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

  say("arrancando fisica…");
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

  say("cargando texturas…");
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
    counters.ground.textContent = player.grounded ? "suelo" : "aire";
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

main().catch((error) => {
  console.error(error);
  document.getElementById("intro").hidden = false;
  say(`FALLO: ${error.message}`);
});
