// Entrada del navegador. Une las tres piezas y no hace nada mas: el cargador
// y la fisica son los mismos modulos que corren en Node sin ojos.

import * as THREE from "three";
import { initPhysics, World, Player, PLAYER, perfilMsr } from "./play/player.js";
import {
  velocidadAndando,
  velocidadCorriendo,
  ajustarVelocidad,
  puedeCorrer,
  AGUANTE_CORRIENDO,
  regeneracionDeAguante,
  aguanteDeSalto,
} from "./play/movimiento.js";
import { Teclas, RANURAS } from "./juego/teclas.js";
import {
  atributosDe, derivadas, habilidadDeArma, propiedadesDe, valorDeHabilidad,
} from "./juego/stats.js";
import { entrenar } from "./juego/personaje.js";
import { carga as cargaDe } from "./juego/inventario.js";
import { buildView } from "./render/scene.js";
import { atlasDe } from "./kit/studio.js";
import { gatecityLevel } from "./bsp/nivel.js";
import {
  escenaGateCity,
  cargarTexturas as cargarTexturasBsp,
  cargarMapaDeLuz,
  cargarCarteles,
  cargarAdornos,
  cargarDetalle,
  cargarCielo,
  GLOW,
} from "./render/bsp_escena.js";
import { cargarBichos } from "./render/bichos.js";
import { cargarArma } from "./render/arma.js";
import { cargarMuneco } from "./render/muneco.js";
import { cargarFlechas } from "./render/flechas.js";
import { Brazo, elegirObjetivo, expDeLaMuerte, FASE, VozDeLaCarga } from "./play/golpe.js";
import { Flecha, anguloDelTiro, danoDeFlecha, dadoDeFlecha } from "./play/proyectil.js";
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
  PARTIDA,
  vidaTotal,
  jugadoresActivos,
  autoajustar,
  experienciaDelBicho,
} from "./juego/servidor.js";
import { ClienteDeRed, AlmacenRemoto } from "./red/cliente.js";
import { enlaceDeNavegador, urlPorDefecto } from "./red/navegador.js";
import { BOTON } from "./red/protocolo.js";
import { cargarOtros } from "./render/otros.js";
// La sonda: dos mil líneas que no son el juego y que hasta el 28 vivían aquí.
import { montarSonda } from "./dev/sonda.js";

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
      say(`connecting to the game at ${url}…`);
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

  say("reading what was extracted from gatecity.bsp…");
  const level = await gatecityLevel();
  if (!level.mesh.triangleCount) throw new Error("gatecity se cargo vacio");

  say("starting physics…");
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

  say(`loading ${level.manifiesto.texturas.length} textures and the lightmap…`);
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
  say("setting up the torches…");
  const carteles = await cargarCarteles(level.manifiesto);
  escena.add(carteles.grupo);

  // Los adornos: los 101 `env_model` de 17 ficheros `.mdl`, leídos de
  // `../MSC/assets/msr/models/` y extraídos a `build/`. Ver `cargarAdornos`.
  // LOS BICHOS: los 69 NPC y monstruos que el mapa coloca, con el modelo que
  // dice su `.script` y la animación que ese script nombra. Ver
  // `tools/bichos.mjs` y `src/render/bichos.js`.
  say("setting up the monsters…");
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
      suceso("normal", `${sesion.personaje.nombre} arrives at ${donde?.nombre ?? "the map start"}` +
        ` — light ${donde?.luz ?? "?"}/255, ${donde?.hostiles15 ?? "?"} hostiles within 15 m`);
      suceso("nopuedes", "1 weapon · 4 ammo · F1-F12 quickslots · Esc menu · " +
        "P sheet · I inventory · N more weapons · B shield · K die");
    });
    // Soltar el raton al morir: la pantalla de muerte tiene un boton y con el
    // puntero capturado no se puede pulsar.
    sesion.al("muerte", () => { document.exitPointerLock?.(); });
  }

  say("setting up the props…");
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
      suceso("normal", `${perdidas.length} quickslot${perdidas.length > 1 ? "s" : ""} ` +
        `pointed at something you no longer carry`);
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
      suceso("normal", `You wield ${orden.nombre}`);
    } else if (orden.que === "elegirMunicion") {
      municionElegida = orden.infinita ? null : orden.id;
      suceso("normal", `Ammo: ${orden.nombre}`);
    } else if (orden.que === "preparar") {
      suceso("nopuedes", `You know no spells yet`);
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
    say(`town ${visita + 1} of ${level.pueblos.length}: ${p.suelo.toFixed(0)} m2 of floor across ` +
      `${p.suelos} faces · T for the next one, R to go back to the start`);
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
        ? `monsters THINKING: 'npcatk_hunt' for the 33 hostiles and 'SetWanderDest' ` +
          `for the 53 that declare 'roam 1'. They walk at the speed their own ` +
          `.mdl declares (the goblin, 0.92 m/s).`
        : `monsters FROZEN, each with its own idle animation. ` +
          `This is how the game opened until experiment 21, and it was not on purpose.`);
    }
    if (e.code === "KeyL") {
      glow.visible = !glow.visible;
      say(glow.visible
        ? `glow on: ${GLOW.alcance} m of reach, the colour of the map's own 'pi_lantern'`
        : `glow OFF: the map as the compiler baked it. 63 % of its surface ` +
          `is below 32/255, and that is how it played without the spell`);
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
      if (!lista.length) { say("no shields have been baked: `npm run escudos`"); return; }
      const i = brazal?.objeto?.id ? lista.indexOf(brazal.objeto.id) : -1;
      // Se recorren en circulo y el ultimo paso es SIN escudo, que tambien es un
      // estado del juego y el que trae de serie un personaje nuevo.
      const siguiente = i + 1 >= lista.length ? null : lista[i + 1];
      embrazar(siguiente).then(() => {
        if (sesion?.personaje) sesion.personaje.manos.izquierda = siguiente;
        const f = brazal?.ficha;
        say(siguiente && f
          ? `${brazal.objeto.nombre}: raised it blocks ${f.bloqueoArriba} % and lets through ` +
            `${Math.round((f.danoQuePasa ?? 1) * 100)} % (you take ` +
            `${Math.round((f.bloqueoArriba / 100) * f.danoQuePasa * 100 + (1 - f.bloqueoArriba / 100) * 100)} %); ` +
            `lowered it negates the whole blow ${f.bloqueoAbajo} % of the time. ` +
            `RIGHT mouse button to raise it, and while you hold it you cannot attack.`
          : "no shield, which is what a real character starts with");
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
      suceso("ataque", `Your attack was ${golpe.mensaje ?? "parried!"}`);
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
        suceso("normal", `${i.ficha.nombre ?? "The monster"} alerted ${avisados.length} all${avisados.length > 1 ? "ies" : "y"} as it died`);
      }
    } else {
      if (golpe.encoge) encogidas++;
      if (golpe.huye) { huidas++; suceso("normal", `${i.ficha.nombre ?? "The monster"} flees`); }
      suceso("ataque", `${critico ? "CRITICAL! " : ""}${dano.toFixed(1)} damage to ` +
        `${i.ficha.nombre ?? "a monster"} — ` +
        `${Math.max(0, i.vida).toFixed(0)} of ${i.vidaMaxima} left` +
        `${golpe.encoge ? " · it flinches" : ""}`);
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
      suceso("bueno", `You killed ${i.ficha.nombre ?? "a monster"} — ${total} experience` +
        (entregado < total ? ` (${entregado} recorded: the rest is lost)` : "") +
        (subidas ? `, ${subidas} skill point${subidas > 1 ? "s" : ""}!` : ""));
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
        suceso("nopuedes", `You are out of ${flecha.nombre ?? "ammo"}`);
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
      suceso("ataque", `Your arrow was ${golpe.mensaje ?? "parried!"}`);
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
    suceso("ataque", `${dano.toFixed(1)} damage to ${i.ficha.nombre ?? "a monster"}` +
      ` — ${Math.max(0, i.vida).toFixed(0)} of ${i.vidaMaxima} left` +
      `${golpe.muerto ? " · dead!" : ""}`);
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
      if (d.parado) { parados++; suceso("atacado", "You parried the blow!"); return; }
      if (!(d.dano > 0)) return;
      // Y QUE TE PEGAN SE DICE, que hasta ahora no se decía en ningún sitio.
      // Es el `HUDEVENT_ATTACKED` del motor —rojo, (240,0,0)— y es el único
      // aviso que tiene el jugador de que la vida que baja tiene un culpable:
      // `%s hits you: %s` (giattack.cpp:1993).
      suceso("atacado", `${i.ficha.nombre ?? "A monster"} hits you: ${d.dano.toFixed(1)} damage`);
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
          if (s.huye) { huidas++; suceso("normal", `${i?.ficha.nombre ?? "The monster"} flees`); }
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
            suceso("normal", `${i?.ficha.nombre ?? "The monster"} alerted ${s.avisados} all${s.avisados > 1 ? "ies" : "y"} as it died`);
          }
          break;
        case "para":
          parados++;
          suceso("ataque", `Your attack was ${i?.ficha.ia?.mensajeDeParry ?? "parried!"}`);
          break;
        case "tupegas":
          // Se guarda tal cual para la sonda: sin esto, «el techo recorta» sólo
          // se puede comprobar matando algo, y entonces el recorte se esconde
          // detrás de la vida del bicho — un control que pasa sin medir nada.
          ultimoGolpe = s;
          if (s.lejos) { suceso("malo", `You missed: ${s.porque}`); break; }
          if (s.parado || !s.vale) break;          // el `para` ya lo ha dicho
          // Con el golpe que mata NO se dice la vida que queda: la de abajo es
          // la línea de «Has matado a», que es la que el motor da. Decir las dos
          // deja un «0 de daño — le quedan 0 de 80» delante del anuncio.
          if (!s.muerto) {
            suceso("ataque", `${s.dano ?? 0} damage to ${i?.ficha.nombre ?? "a monster"}` +
              ` — ${Math.max(0, Math.round(s.vida ?? 0))} of ${i?.vidaMaxima ?? "?"} left`);
          }
          if (s.muerto && s.experiencia?.total > 0) {
            const x = s.experiencia;
            suceso("bueno", `You killed ${i?.ficha.nombre ?? "a monster"} — ${x.total} experience` +
              (x.entregado < x.total ? ` (${x.entregado} recorded: the rest is lost)` : "") +
              (x.subidas ? ` · ${x.subidas} skill point${x.subidas > 1 ? "s" : ""}!` : ""));
          }
          break;
        case "pega":
          // Un bicho ha acertado. Si el que lo recibe soy yo, se dice: es el
          // `HUDEVENT_ATTACKED` del motor —`%s hits you: %s`, giattack.cpp:1993—
          // y es el único aviso de que la vida que baja tiene un culpable.
          if (s.a === `j${red.yo}`) {
            golpesRecibidos++;
            suceso("atacado", `${i?.ficha.nombre ?? "A monster"} hits you: ${s.dano} damage`);
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
    counters.ground.textContent = player.grounded ? "ground" : "air";
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
        ? `Quickslot ${grabado.ranura + 1}: ${grabado.grabado.nombre}`
        : `Quickslot ${grabado.ranura + 1} cleared`);
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

  // ── LA SONDA, que vive en `src/dev/sonda.js` desde el 28 ───────────────────
  //
  // Eran dos mil líneas aquí dentro —el 45 % de esta función— y no son el
  // juego: son el aparato de medirlo. Lo que baja por `S` son CAPTADORES, no
  // copias: `get bichos()` lee la variable en el momento en que la sonda la
  // mira, y los `set` de las que se reasignan la cambian de verdad. Con una
  // copia, las cuentas (golpes, muertes, correcciones) se habrían quedado
  // congeladas en su valor de arranque y ningún control lo habría dicho.
  window.probe = montarSonda({
    get DT() { return DT; },
    get JUGADOR() { return JUGADOR; },
    get THREE_BACK() { return THREE_BACK; },
    get THREE_FRONT() { return THREE_FRONT; },
    get U() { return U; },
    get adornos() { return adornos; },
    get adornosVivos() { return adornosVivos; },
    get aguante() { return aguante; },
    get ambienteSinArchivo() { return ambienteSinArchivo; },
    get animarLuz() { return animarLuz; },
    get aparicion() { return aparicion; },
    get armaEnMano() { return armaEnMano; },
    get arnesDePaseo() { return arnesDePaseo; },
    get aterrizajes() { return aterrizajes; },
    get atlas() { return atlas; },
    get audio() { return audio; },
    get avisos() { return avisos; },
    get bichos() { return bichos; },
    get bichosSolidos() { return bichosSolidos; },
    get blanco() { return blanco; },
    get bloqueos() { return bloqueos; },
    get brazal() { return brazal; },
    get brazo() { return brazo; },
    get camera() { return camera; },
    get candidatosDeGolpe() { return candidatosDeGolpe; },
    get canvas() { return canvas; },
    get carteles() { return carteles; },
    get catalogoDeArmas() { return catalogoDeArmas; },
    get catalogoDeEscudos() { return catalogoDeEscudos; },
    get catalogoDeFlechas() { return catalogoDeFlechas; },
    get catalogoSonido() { return catalogoSonido; },
    get ciclador() { return ciclador; },
    get ciclar() { return ciclar; },
    get confirmarCiclador() { return confirmarCiclador; },
    get corriendo() { return corriendo; },
    get cubriendose() { return cubriendose; },
    get cumplir() { return cumplir; },
    get despertarAudio() { return despertarAudio; },
    get destrezaDe() { return destrezaDe; },
    get desvios() { return desvios; },
    get embrazar() { return embrazar; },
    get empunar() { return empunar; },
    get encogidas() { return encogidas; },
    get enlaceDeRed() { return enlaceDeRed; },
    get escena() { return escena; },
    get escudoEnMano() { return escudoEnMano; },
    get flechasEnVuelo() { return flechasEnVuelo; },
    get flechasPuestas() { return flechasPuestas; },
    get flechazos() { return flechazos; },
    get fueraDelCono() { return fueraDelCono; },
    get glow() { return glow; },
    get golpesDados() { return golpesDados; },
    get golpesRecibidos() { return golpesRecibidos; },
    get grupos() { return grupos; },
    get gruposDetalle() { return gruposDetalle; },
    get hudMs() { return hudMs; },
    get huidas() { return huidas; },
    get impactos() { return impactos; },
    get interfaz() { return interfaz; },
    get keys() { return keys; },
    get level() { return level; },
    get loQueVale() { return loQueVale; },
    get mallaCielo() { return mallaCielo; },
    get mallaDetalle() { return mallaDetalle; },
    get materialBajoLosPies() { return materialBajoLosPies; },
    get materiales() { return materiales; },
    get menuMs() { return menuMs; },
    get muertes() { return muertes; },
    get mundo() { return mundo; },
    get muneco() { return muneco; },
    get municion() { return municion; },
    get municionElegida() { return municionElegida; },
    get otros() { return otros; },
    get parados() { return parados; },
    get parryDelPersonaje() { return parryDelPersonaje; },
    get partida() { return partida; },
    get paseando() { return paseando; },
    get pasoDeFlechas() { return pasoDeFlechas; },
    get pasoDelBrazo() { return pasoDelBrazo; },
    get pasoDelEscudo() { return pasoDelEscudo; },
    get pasoDelHud() { return pasoDelHud; },
    get pedidosDePuerta() { return pedidosDePuerta; },
    get pegar() { return pegar; },
    get perfil() { return perfil; },
    get player() { return player; },
    get ponerMuneco() { return ponerMuneco; },
    get potenciaDe() { return potenciaDe; },
    get puertas() { return puertas; },
    get ranuras() { return ranuras; },
    get recobrarRanuras() { return recobrarRanuras; },
    get red() { return red; },
    get reloj() { return reloj; },
    set reloj(v) { reloj = v; },
    get relojLuz() { return relojLuz; },
    set relojLuz(v) { relojLuz = v; },
    get renderer() { return renderer; },
    get repartirExperiencia() { return repartirExperiencia; },
    get rosa() { return rosa; },
    set rosa(v) { rosa = v; },
    get rumbo() { return rumbo; },
    get running() { return running; },
    set running(v) { running = v; },
    get sesion() { return sesion; },
    get solidos() { return solidos; },
    get sonAliados() { return sonAliados; },
    get sonidosDeCarga() { return sonidosDeCarga; },
    get status() { return status; },
    get suceso() { return suceso; },
    get tablaDeRazas() { return tablaDeRazas; },
    get teclas() { return teclas; },
    get texturas() { return texturas; },
    get tiros() { return tiros; },
    get trazaLibre() { return trazaLibre; },
    get ultimaFlecha() { return ultimaFlecha; },
    get ultimoGolpe() { return ultimoGolpe; },
    get velo() { return velo; },
    get velocidadParaLosPasos() { return velocidadParaLosPasos; },
    get vitalesDelPersonaje() { return vitalesDelPersonaje; },
    get volumenes() { return volumenes; },
    get world() { return world; },
  });

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
  // EL MIRADOR, que es el OTRO programa de este archivo y ya no está aquí.
  //
  // `?map=pueblo`, `corinth`, `colina` y `jharro` no son Gate City: son el banco
  // de pruebas de los experimentos 01 a 09 —el terreno, el kit CC0, el jharro— y
  // tienen su propio bucle, su propia escena y su propio `window.probe`. Eran
  // 470 líneas debajo de las 2 600 del juego, en el mismo archivo y sin nada en
  // común salvo estas nueve constantes.
  //
  // Y se carga BAJO DEMANDA: con `?map=gatecity` este módulo no se descarga
  // siquiera, que son el kit, el GLTFLoader y el generador de terreno que el
  // juego no usa.
  const { mirarMapa } = await import("./mirador.js");
  return mirarMapa({ MAP, DT, MOUSE, canvas, hud, say, MESH_LEVEL, KIT_LEVEL, JHARRO_LEVEL });
}

main().catch((error) => {
  console.error(error);
  document.getElementById("intro").hidden = false;
  say(`FAILED: ${error.message}`);
});
