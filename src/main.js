import { BASE_COMUN, rutaComun } from "./play/recursos.js";
// El 64: el jugador también es una entidad con guion.
import { GuionDelJugador, EVENTOS_DEL_JUGADOR } from "./play/guionjugador.js";
import { GuionesDeObjeto, GuionDeObjeto, QUIEN_VISTE } from "./play/guionobjeto.js";
import { vestir, fichasPuestas, seVisteAlCargar, correEnElServidor } from "./play/armadura.js";
import {
  equipoDelMuneco, equipoEnLaEleccion, piezasConCuerpo, firmaDe, aLaVistaSinGuion,
  cuerpoGuardado, piezaDelCuerpo,
} from "./play/equipovisto.js";
import { Equipo3D } from "./render/equipo3d.js";
import { Equipo } from "./play/equipar.js";
import { colocar as colocarEnContenedores, dentroDe as dentroDelContenedor } from "./play/contenedores.js";
import { TablaDeEfectos } from "./play/efectos.js";
import { HABILIDADES, PROPIEDADES } from "./juego/stats.js";
// Entrada del navegador. Une las tres piezas y no hace nada mas: el cargador
// y la fisica son los mismos modulos que corren en Node sin ojos.

import * as THREE from "three";
import { initPhysics, World, Player, PLAYER, perfilMsr } from "./play/player.js";
import { PasoLocal } from "./play/atasco.js";
import {
  velocidadAndando,
  velocidadCorriendo,
  ajustarVelocidad,
  puedeCorrer,
  avisoDeCarrera,
  AGUANTE_CORRIENDO,
  regeneracionDeAguante,
  aguanteDeSalto,
} from "./play/movimiento.js";
// El 85: las seis opciones de tu propio menú — sentarse, los tres emotes, la
// descripción de lo que llevas y el perdón. Ver `src/play/menujugador.js`.
import { Emociones, SHOW_HEALTH } from "./play/menujugador.js";
import { Teclas, RANURAS, ACCIONES, nombreDeTecla } from "./juego/teclas.js";
import { atraparTeclado, avisoDeReservadas, tecladoAtrapado, soltarTeclado, enPantallaCompleta }
  from "./juego/navegador.js";
import {
  atributosDe, derivadas, habilidadDeArma, propiedadesDe, valorDeHabilidad,
} from "./juego/stats.js";
import { entrenar, resumen, loQueLleva } from "./juego/personaje.js";
import { carga as cargaDe } from "./juego/inventario.js";
import { buildView } from "./render/scene.js";
import { atlasDe } from "./render/studio.js";
import { cargarNivel } from "./bsp/nivel.js";
import { mapaPedido as leerMapaPedido, baseDe, rutaDe, esNombreDeMapa, MAPAS_PORTADOS } from "./play/mapa.js";
import { Transiciones, elegirLlegada, inicioDe, faltaElEnlace } from "./play/transicion.js";
import {
  escenaDelMapa,
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
import { cargarEstallido } from "./render/estallido.js";
import { ESTALLIDOS } from "./play/fenix.js";
import { montarArco } from "./juego/arco.js";
import { Brazo, elegirObjetivo, resolverGolpe, expDeLaMuerte, FASE, VozDeLaCarga, CRITICO } from "./play/golpe.js";
import { Flecha, anguloDelTiro, danoDeFlecha, dadoDeFlecha } from "./play/proyectil.js";
import {
  Brazal, POSTURA, defensaDelJugador, dentroDelCono2D, puedeAtacar,
} from "./play/escudo.js";
import { valorDeParryDelJugador, manosDelParry } from "./play/parry.js";
// EL 86: las seis cadenas de la consola de sucesos, que eran NUESTRAS. El
// usuario lo reportó («el event hud me parece todavía tiene texto inventado») y
// lo era: ver la cabecera de ese archivo, que lleva la tabla de lo que decíamos
// contra lo que dice el juego, con la línea de cada una.
import {
  golpeAsestado, falloAsestado, golpeRecibido, parryDelJugador,
} from "./play/mensajesdecombate.js";
import { cargarCuerpos } from "./render/cuerpo.js";
import { montarPuertas } from "./play/puertas.js";
import { montarRompibles } from "./render/rompibles.js";
import { montarCorrederas } from "./render/correderas.js";
import { Suelo, aMano, angulosDeSoltar, rumboDeSoltar } from "./play/suelo.js";
import { cargarSuelo } from "./render/suelo.js";
import { Volumenes, dentro } from "./play/volumenes.js";
import { Disparadores, USO } from "./play/disparadores.js";
// EL 77: `NPCScript`, el director de escenas de los NPC. Los cuatro tipos que
// el 67 dejó contados — los tres que mueven y el que pone una animación.
import { Escenas } from "./play/escena.js";
import { solidosDeAdornos, solidosDeBichos } from "./play/solidos.js";
// El 81: `setmovedest`. `ojoDe` vive en la manada porque el ojo de un bicho es
// su casco, no una decisión de quien dibuja; ver su comentario.
import { ojoDe } from "./play/manada.js";
import { ganchoDeMovedest } from "./play/movedest.js";
import { Monsterclip } from "./play/monsterclip.js";
import { Pasos, materialDe, sonidoDeCaida } from "./play/sonido.js";
import { Audio } from "./play/audio.js";
// El 82: las tres clases que Edana contaba y nadie leía.
import { montarHaces } from "./render/haces.js";
import { unTic as unTicDeSala, tipoQueSeOye } from "./play/reverberacion.js";
// LO QUE HACE CADA AJUSTE (experimento 37): la fórmula del ratón del mod, la
// ganancia del volumen y la tabla que lleva el atlas de una gamma a otra.
import { Raton, ganancia, PITCH_MAX } from "./play/aplicar.js";
// El mapa que elige «Create Server». La tabla es la regla; aquí sólo se aplica.
import { mapaElegido } from "./play/crearpartida.js";
// Qué se dibuja detrás del menú, decidido en una tabla con su razón al lado y
// no en un `if` aquí dentro. Ver el 72.
import { conEscenaDelMenu } from "./play/fondomenu.js";
import { porDefecto as ajustesPorDefecto } from "./play/ajustes.js";
import { rehacerMapaDeLuz } from "./render/regamma.js";
import { AJUSTES as GAMMA_HORNEADA, validar as validarGamma } from "./bsp/gamma.js";
import { montarInterfaz } from "./juego/interfaz.js";
// LAS VENTANAS DE VALVE (VGUI2, experimento 34): «Options» y «Servers».
//
// Son OTRO sistema de interfaz, no los paneles del mod: otra letra, otros
// colores y el alfa al revés. Por eso viven en `src/vgui2/` y no en `src/vgui/`.
// Ver `doc/VGUI2_34.md` §1.
import { montarVgui2 } from "./vgui2/montar.js";
import { montarHud, cargaDelTiro } from "./juego/hudms.js";
import { montarChat } from "./juego/chat.js";
import { avisoDeCanal, hablar, HABLA, panelDeRecado } from "./play/chat.js";
// LO QUE PASA AL MORIR Y AL SUBIR (experimento 41): el velo rojo, el centrado,
// el cartel que se escribe letra a letra y la lluvia de colores.
import { montarMensajes } from "./juego/mensajes.js";
import { camaraDeMuerte, sonidoDeMuerte, DESVANECIDO, AL_REAPARECER, efectoDelGolpe, soltarGolpe } from "./play/muerte.js";
import { nuevoTemblor, temblorAlLlegar, pasoDelTemblor, temblorEnEscena } from "./play/temblor.js";
// EL 97: lo que los efectos le hacen al cuerpo (aturdir, frenar).
import { trabasDelJugador, velocidadConTrabas, trabarIntencion, juntarTrabas, trabasDelCable } from "./play/trabas.js";
import { subida } from "./play/nivel.js";
import { presentacion } from "./play/intro.js";
import { montarChispas, cargarBengala } from "./render/chispas.js";
import { cargarCadaver } from "./render/cadaver.js";
import { montarMenu } from "./juego/menums.js";
import { miradorDe, paseoDeMenu, MIRADORES } from "./play/miradores.js";
import { escenaDeLaTorre } from "./render/torre.js";
import { crearPasadaMenu } from "./render/pasadamenu.js";
import { MIRADOR_DE_LA_TORRE, CAMARA_TORRE, fovDeLaTorre } from "./play/torre.js";
import { cargarEsquema } from "./vgui/esquema.js";
import { CSS as CSS_VGUI } from "./vgui/widgets.js";
import { Registro, RUEDA } from "./vgui/registro.js";
import { MenuInteractuar, ALCANCE as ALCANCE_INTERACTUAR } from "./vgui/interactuar.js";
import { PanelDePersonaje, CSS as CSS_PERSONAJE } from "./vgui/personaje.js";
import { PanelDeInventario, CSS as CSS_INVENTARIO } from "./vgui/contenedor.js";
// El 60: la tienda. Tres paneles —el selector y sus dos listas— y la regla
// del comercio, que vive con el resto del modelo en `src/play/tienda.js`.
import {
  MenuDeTienda, PanelDeTienda,
  NOMBRE_SELECTOR, NOMBRE_COMPRAR, NOMBRE_VENDER,
  CSS as CSS_TIENDA,
} from "./vgui/tienda.js";
import {
  comprar as comprarEnTienda, vender as venderEnTienda,
  MAX_OBJETOS as MAX_OBJETOS_TIENDA, INVENTARIO as INVENTARIO_TIENDA,
} from "./play/tienda.js";
import { PanelDeHoja } from "./vgui/estadisticas.js";
import { Retratos } from "./render/retratos.js";
import { InteraccionesNpc } from "./juego/interacciones.js";
// `createnpc`: lo que un guion crea en mitad de la partida. Ver el archivo.
import { MundoDeCreados, esSolido, ARMAS_QUE_INVOCAN, aMotor as escenaAMotor } from "./play/creados.js";
import { nombreVisibleDe } from "./play/usaropcion.js";
import { Ciclador, Ranuras, cargarRanuras } from "./play/ranuras.js";
import { AlmacenLocal, AlmacenMemoria } from "./juego/almacen.js";
import { Sesion, ESTADO, ENTRADA, guardarAlCerrar } from "./juego/sesion.js";
import { relacionDeRazas, RELACION } from "./bsp/razas.js";
import {
  PARTIDA,
  vidaTotal,
  jugadoresActivos,
  autoajustar,
  experienciaDelBicho,
} from "./juego/servidor.js";
import { ClienteDeRed, AlmacenRemoto } from "./red/cliente.js";
import { enlaceDeNavegador, urlPorDefecto, listarPartidas, urlDeConexion } from "./red/navegador.js";
import { BOTON } from "./red/protocolo.js";
import { cargarOtros } from "./render/otros.js";
// La sonda: dos mil líneas que no son el juego y que hasta el 28 vivían aquí.
import { montarSonda } from "./dev/sonda.js";
import { importarPersonajeDePruebas } from "./dev/personajepruebas.js";

const DT = 1 / 60;
// EL RATÓN. Aquí había `const MOUSE = 0.0022` —radianes por cuenta, elegidos a
// ojo—, y era lo que hacía imposible que el deslizador de sensibilidad sirviera
// para nada. Ahora es la fórmula del mod con sus tres cvars; ver
// `src/play/aplicar.js`. Con los valores del `config.cfg` gira 0,22 grados por
// cuenta, que es casi el doble de lo que giraba.
const raton = new Raton();

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
/** La ventana de chat: la caja de la izquierda y el cajetín. El 61. */
let chatMs = null;
let menuMs = null;
// Experimento 41: los mensajes que se escriben encima y la lluvia de colores.
let mensajes = null;
let chispas = null;
// Donde se queda la camara mientras estas muerto, o  si estas vivo.
let camaraMuerte = null;
// EL 94. El `pev->punchangle` del jugador, en GRADOS del motor (cabeceo, giro,
// alabeo): lo empuja cada golpe y lo suelta `PM_DropPunchAngle`. `muerte.js`.
let golpeDeVista = [0, 0, 0];
// EL 95. El `clgame.shake` del cliente: lo llena `effect screenshake` y lo
// mueve `pasoDelTemblor` cada fotograma. Uno solo, como en el motor.
// `src/play/temblor.js`.
let temblor = nuevoTemblor();
// Experimento 52: el recorrido de la camara mientras el menu principal esta
// abierto. `null` mientras el fondo vivo este apagado, que es hoy siempre salvo
// para la sonda que elige miradores. Ver `src/play/miradores.js` y el bloque
// «EL FONDO VIVO DEL MENU (52), Y POR QUE ESTA APAGADO» mas abajo.
let paseoMenu = null;
// Lo que habria que llamar para encenderlo. Se define al montar el menu.
let prepararFondoDelMenu = () => false;
// La escena de la torre y su camara. Es OTRA escena, no el mapa: mientras el
// menu esta abierto se dibuja esta en lugar de `escena`. Ver `src/render/torre.js`.
let menuDeLaTorre = null;
let camaraDeLaTorre = null;
let pasadaDelMenu = null;
// Tu cuerpo, que es lo que esa camara esta mirando.
let cadaver = null;
/**
 * Con qué mapa se entró, resuelto por `mapaElegido()` desde la fila «Map» de
 * «Create Server». `null` mientras no se haya entrado por ahí —con `?map=` no
 * pasa por esta ventana, que es lo que mide el control positivo del 36—. Está
 * aquí para que la sonda lea LO QUE SE APLICÓ y no lo que la ventana enseñaba.
 */
let mapaDeLaPartida = null;
/**
 * Abre la tienda de un NPC. La pone `arrancarJuego` al montar los paneles, y
 * la llama `npcstore.offer` a través de `InteraccionesNpc`: el guion no puede
 * conocer el registro de paneles, así que pasa el recado. El 60.
 */
let abrirLaTienda = null;
/** El registro de paneles de VGUI. `src/vgui/registro.js`. */
/**
 * Un reloj monótono en segundos, para las esperas de la reacción y para el
 * desvanecido de los paneles.
 *
 * Se declara AQUÍ arriba y no donde se usa, que es donde estaba, porque los
 * paneles de VGUI se montan antes de cargar el mapa y `Registro` lo lee para el
 * desvanecido: con la declaración a mitad de `arrancarJuego`, abrir la pantalla
 * de personajes daba «Cannot access 'reloj' before initialization» y la página
 * se quedaba en blanco. La zona muerta de un `let` no perdona.
 */
let reloj = 0;
/**
 * EL GUION DEL JUGADOR (64) y su ficha horneada.
 *
 * Van al nivel del módulo y no dentro de `arrancarJuego` porque quien los usa
 * está repartido: la ficha se carga al arrancar, el guion se monta cuando la
 * sesión mete al personaje en el mundo —que pasa en otra función— y el reloj
 * lo pisa el bucle de dibujo. Con la ficha local, el montaje se quedaba en
 * silencio: la sonda decía «cargado false» y no había ni un error.
 */
let fichaDelJugador = null;
// ── LOS GUIONES DE LOS OBJETOS (66) ────────────────────────────────────────
//
// `guionesDeObjeto` es la tabla horneada, compartida; `objetosVivos` son las
// entidades, una por objeto que el personaje lleva encima. Van a nivel de
// módulo por el mismo motivo que `fichaDelJugador`: se cargan al arrancar y se
// montan al aparecer, que son dos funciones distintas — tenerlas locales fue el
// fallo del 65 («cargado false» sin un solo error en la página).
let guionesDeObjeto = null;
/** Los guiones de EFECTO horneados (`npm run efectos:guion`). Ver `src/play/efectos.js`. */
let tablaDeEfectos = null;
/** @type {Map<string, GuionDeObjeto>} por `uid` del objeto, o por su id. */
const objetosVivos = new Map();
// Y EL ASA A LA COSTURA, a nivel de módulo por la misma razón que el resto: la
// función que monta vive dentro del armado del mundo y `window.probe` se
// construye en otra, así que un `get` directo da `ReferenceError`. Es el mismo
// tropiezo que el 65 tuvo con `fichaDelJugador`, y lo cazó la sonda.
let sincronizarObjetos = () => 0;
// EL 96: ponerse una pieza y lo último que hizo la armadura con un golpe. Por
// el mismo motivo que el asa de arriba: los usa `window.probe`.
let vestirObjeto = () => ({ puesto: false, mensaje: null, porque: "no-world" });
let ultimaArmadura = null;
// EL 97: la última orden del equipo (`remove`, `inv transfer`, `use`) con el
// orden de eventos que corrió. La lee `window.probe.inventario97`.
let ultimoMovimiento = null;
// EL 98: lo último que soltó «Drop Selected» (src/main.js, `soltarDeUnContenedor`).
let ultimoSoltado98 = null;
// EL 97: las trabas de los efectos que leyó el último fotograma (src/play/trabas.js).
let ultimasTrabas = null;
/**
 * `usetrigger` del guion del jugador -> el bus del mapa (el 67). Misma razon
 * que el asa de arriba: el bus se construye dentro del armado del mundo y el
 * guion del jugador se monta en otra funcion. Empieza contando, no tragando.
 */
let dispararDelMapa = null;
let guionJugador = null;
let vgui = null;
/** Los retratos 3D de la pantalla de personajes. `src/render/retratos.js`. */
let retratosDelPanel = null;
/**
 * EL 101: lo que hace falta para VER el equipo puesto — `build/msr/equipo.json`
 * (`npm run equipo`) y los modelos ya traídos. `null` si no está horneado: el
 * muñeco y la pantalla de elección salen sin equipo, y se dice en la consola.
 */
let equipoALaVista = null;
/** El esquema de fuentes de VGUI. Lo usan los paneles, que se montan en dos sitios. */
let esquemaVgui = null;
/** Las opciones de menú de los NPC, de `build/<mapa>/menus.json`. */
let fichaDeMenus = null;
/**
 * Los GUIONES de los NPC, de `build/<mapa>/guiones.json` (`npm run guiones`).
 *
 * Desde el 33 las opciones no se leen de una ficha: se sacan de EJECUTAR el
 * `game_menu_getoptions` del NPC, que es lo que hace el servidor
 * (msmonsterserver.cpp:2890). `fichaDeMenus` se queda de respaldo para el NPC
 * cuyo guion no esté horneado.
 */
let fichaDeGuiones = null;
/**
 * La munición que el jugador ha elegido a mano con el ciclador, o `null` para
 * la que el motor da de balde. Vive aquí y no en el personaje porque en el
 * juego tampoco se guarda: `player.m_ChosenArrow` es del cliente y se pierde al
 * salir (vgui_quickslot.h:320).
 *
 * EL 55: y ya no vive aquí, vive DENTRO del arco (`src/juego/arco.js`), que es
 * de quien era. Estaba suelta en el módulo y se reasignaba desde dos sitios a
 * los dos lados de lo que iba a ser la frontera — el caso caro que el
 * analizador de dependencias marcó, y el que habría dejado dos variables con
 * el mismo nombre y ningún error. El ciclador la pone por `arco.elegirMunicion`.
 */
function suceso(tipo, texto, o = null) {
  // EL 100: LO QUE SE DICE VA A LA OTRA CONSOLA. El `saytext` de un NPC y la
  // opción `say` de un menú son `Speak`, y `Speak` acaba en `PrintSayText` —la
  // caja de la izquierda— y no en `PrintEvent` (vgui_hud.cpp:304-313, :469-485).
  // Quién es qué lo decide `panelDeRecado`, que es la regla y está probada en
  // Node; aquí sólo se reparte. Sin la caja montada cae a la de sucesos: una
  // frase en el sitio equivocado es mejor que una frase perdida.
  const destino = panelDeRecado(o);
  if (destino.panel === "chat" && chatMs) { chatMs.recibir(destino.tipo, texto); return; }
  // Antes de que el HUD exista —durante la carga— no se pierde nada: va a la
  // línea de estado, que es donde iba todo hasta ahora.
  if (!hudMs) { say(texto); return; }
  hudMs.suceso(tipo, texto);
}

// GATE CITY, y ya no hay otro mundo aqui.
//
// Hasta la mudanza este archivo servia seis mundos: cinco del laboratorio web
// -la plaza, el pueblo, la colina de malla, Corinth y el jharro- y este. Los
// cinco primeros se quedaron en «Mydra Web Lab» con su mirador, su kit CC0 y
// su generador de terreno, que son el banco de pruebas de los experimentos 01
// a 09 y no el juego. Ver ESTRUCTURA.md.
//
// El `.bsp` no se copia: se queda en ../MSC/ y lo extraido vive en build/, que
// no se publica. Ver `tools/gatecity.mjs` y build/gatecity/PROCEDENCIA.md.
//
// Y su camino es aparte de principio a fin porque su iluminacion esta HORNEADA:
// `buildScene()` montaria sol, hemisferico y 118 luces puntuales encima del
// mapa de luz, o sea sumaria dos veces la misma luz y lavaria justo el
// contraste que se viene a buscar.

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

async function arrancarJuego() {
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
  let vgui2 = null;                  // las ventanas de Valve: Options y Servers

  /**
   * EL PUNTERO, PARA LAS TRES CAPAS DE INTERFAZ QUE HAY.
   *
   * `atrapa = true` significa «esta capa quiere el ratón», y entonces se suelta
   * el `canvas`; `false` es «ya no lo quiere», y el juego se lo queda otra vez.
   * Es `UpdateCursorState` (`vgui_teamfortressviewport.cpp:1741-1750`), donde
   * sin menú el motor llama a `IN_ResetMouse()` y baja `g_iVisibleMouse` en el
   * mismo fotograma.
   *
   * ESTABA ESCRITO TRES VECES Y CABLEADO UNA. El experimento 35 se lo dio a los
   * paneles de VGUI1 —el inventario y el menú de la F, que abrían y no se podían
   * pulsar— y el menú principal se quedó sin él. No se notó porque el menú se
   * abre con la Escape, y **la Escape suelta el puntero ella sola**: eso ya
   * estaba escrito en `src/juego/navegador.js:76`, en la tabla de teclas que el
   * navegador se reserva. O sea que durante seis experimentos el ratón del menú
   * principal lo soltó el navegador por nosotros.
   *
   * Y en pantalla completa con Keyboard Lock **la Escape ya no es del
   * navegador**: la pedimos nosotros, que es justo el punto del experimento 35.
   * Así que el favor desaparece, el puntero se queda en el `canvas` y el menú
   * principal se abre sin ratón. Un arreglo se llevó por delante lo que le
   * tapaba el fallo al de al lado.
   */
  const cursorDelRaton = (atrapa) => {
    if (atrapa) { document.exitPointerLock?.(); return; }
    // Aquí hay una diferencia del navegador que conviene dejar escrita:
    // `requestPointerLock` exige un gesto del usuario. Cerrar un panel siempre
    // es uno —la Escape, un número, un clic en un botón—, así que dentro de ese
    // manejador se concede. Si algún día se cierra solo (un temporizador, el
    // servidor), no se concederá y **no pasa nada**: el clic en el `canvas` lo
    // recupera. Por eso esto no comprueba el resultado ni avisa de nada.
    if (interfaz?.abierta) return;    // eligiendo personaje o muerto: no
    // Chrome devuelve una promesa desde la 111 y las versiones viejas no
    // devuelven nada. Sin este `if` una negativa sale por la consola como un
    // error sin atrapar, que es ruido justo donde se mira si hay fallos.
    const pedido = canvas.requestPointerLock?.();
    if (pedido?.catch) pedido.catch(() => {});
  };
  // Lo que la ventana de Options deja puesto al pulsar «Apply», y lo que hace.
  //
  // `ajustesDelJugador` es lo aplicado; `aplicarAjustes` es quien lo reparte, y
  // se rellena más abajo, cuando existen el atlas de luz y el audio. Hasta
  // entonces «Apply» guarda y no rompe: es la misma idea que `mapaListo`.
  // Ver `doc/AJUSTES_37.md`.
  let ajustesDelJugador = ajustesPorDefecto();
  let aplicarAjustes = null;
  // Si se entra por el menú, el juego espera ahí en vez de ir a elegir personaje.
  let entrarPorElMenu = false;
  let sesion = null;
  let aparicion = null;
  /** `build/<mapa>/mapa.json`: con qué te recibe el mapa. `npm run mapainfo`. */
  let fichaDelMapa = null;
  /**
   * `GAVE_MAP_INTRO` de `player_main.script:1025`. Una vez por mapa, **no por
   * vida**: `game_respawn` no lo borra, así que al morir y volver no se repite.
   */
  let yaSePresento = false;
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
  // `?map=` es la línea de comandos del juego (`hl.exe +map <mapa>`): entra sin
  // pasar por el menú. Sin ella se entra por el menú, que es lo que hace Master
  // Sword. Ver el bloque «POR DÓNDE SE ENTRA», más abajo.
  // EL 47. El mapa ya no está escrito a mano: sale de `?map=` con su nombre
  // validado (`src/play/mapa.js`), y de él salen TODAS las rutas de `build/`
  // que este archivo pedía a Gate City por su nombre. Un nombre que no vale no
  // cae al de por defecto en silencio: se dice, porque una errata escondida
  // detrás de un mapa que sí carga cuesta media hora.
  const elegido = leerMapaPedido(location.search);
  if (elegido.porQueNo) console.warn(`${elegido.porQueNo} Se entra en «${elegido.mapa}».`);
  /** El mapa de esta partida. De aquí salen todas las rutas de `build/`. */
  const MAPA = elegido.mapa;
  /** `build/<mapa>`, sin barra final: es lo que esperan los `base` de `render/`. */
  const BASE = baseDe(MAPA);
  /** `ruta("bichos.json")` -> «build/<mapa>/bichos.json». */
  const ruta = (...p) => rutaDe(MAPA, ...p);
  /**
   * Un JSON de `build/` que puede no estar, o `null`.
   *
   * No basta con mirar `r.ok`, y esto lo destapó el propio 47: **el servidor de
   * desarrollo contesta el `index.html` a lo que no encuentra**, así que un
   * `build/edana/mapa.json` que no existe llega con un 200 y un `<!doctype`
   * dentro, y el `r.json()` revienta con «Unexpected token '<'». Antes no se
   * veía porque la carpeta siempre estaba; con `?map=` ya no.
   *
   * Un mensaje que diga qué archivo falta vale más que un `SyntaxError`.
   */
  // La pantalla de carga lleva el nombre del mapa: EL DEL ARCHIVO, que es lo
  // que enseña la consola del juego.
  //
  // Aquí había un caso especial —`MAPA === "gatecity" ? "Gate City" : MAPA`—
  // que se cayó en el 59. Master Sword tiene 93 mapas en `assets/msr/maps/` y
  // **no trae ninguna tabla de títulos**: los únicos `.txt` que hay al lado de
  // los `.bsp` son los `*_detail.txt` de las texturas de detalle. Así que el
  // nombre bonito era nuestro y sólo para uno, y los otros 92 ya enseñaban el
  // del archivo. Ponerlos a todos iguales quita el nombre de mapa escrito a
  // mano y hace lo que el comentario de esta línea ya decía.
  {
    const h = document.getElementById("titulo-mapa");
    if (h) h.textContent = MAPA;
  }
  const traerJson = async (r) => {
    let res;
    try { res = await fetch(r); } catch { return null; }
    if (!res.ok) return null;
    const tipo = res.headers.get("content-type") ?? "";
    if (!tipo.includes("json")) { console.warn(`falta ${r} (el servidor devolvió ${tipo || "otra cosa"})`); return null; }
    try { return await res.json(); } catch { console.warn(`${r} no es JSON válido`); return null; }
  };
  const mapaPedido = elegido.pedido;
  // EL 50. Cambiar de mapa desde «Create Server» recarga la página con
  // `?map=<mapa>&menu=1` —el equivalente de `CL_Disconnect()` + `Host_Map()`,
  // rehlds/engine/host_cmd.cpp:970—, así que el «se entró por la ventana» tiene
  // que cruzar esa recarga. Sin esto, la vida entera de `mapaDeLaPartida` era
  // la de la página anterior y el accesor de la sonda devolvía `null` justo en
  // el caso que había que medir.
  //
  // Y sigue siendo `null` con un `?map=` escrito a mano, que es lo que separa
  // «lo resolvió la fila» de «coincide»: el control positivo de `arranque36`.
  if (new URLSearchParams(location.search).has("menu")) mapaDeLaPartida = MAPA;
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

      // ── EL MAPA LO DICE EL SERVIDOR — experimento 61 ──────────────────
      //
      // El servidor manda su mapa en la bienvenida desde el 47 y el cliente
      // sólo lo escribía en la consola. Si no coincidía con el tuyo, te
      // quedabas andando OTRO MUNDO: tu Edana contra su Gate City, con las
      // figuras de los demás puestas en coordenadas de un mapa que no es el
      // tuyo. Sin un error, porque cada mitad estaba bien.
      //
      // Lo que hace el motor es lo que hay que hacer aquí, y es lo que un
      // jugador de Master Sword reconoce: al cambiar de nivel el cliente **se
      // desconecta y se vuelve a conectar** al mismo servidor, que ya está en
      // el mapa nuevo (`CL_Disconnect()` + reconexión, host_cmd.cpp:970).
      // Aquí una recarga es exactamente eso: se tira la conexión y la página
      // vuelve con el mapa del servidor y el mismo `red=`.
      //
      // No puede dar vueltas: después de recargar los dos nombres coinciden y
      // esta rama no se ejecuta.
      //
      // Y SÓLO CUANDO EL JUGADOR YA HA ELEGIDO MAPA (`mapaPedido`). Sentado en
      // el menú principal, el mapa que hay cargado es **el fondo** —el paseo
      // de la cámara, que el 53 dejó de ser una partida—, y arrastrarlo al
      // mapa del servidor ahí sería sacarle del menú sin que haya pulsado
      // nada. Con el menú delante manda el menú; se recarga después de
      // «Start», que es cuando el mapa pasa a ser una partida.
      if (mapaPedido && red.mapa && esNombreDeMapa(red.mapa) && red.mapa !== MAPA) {
        console.warn(`la partida está en «${red.mapa}» y tú en «${MAPA}»: se recarga con el del servidor.`);
        say(`the game is on ${red.mapa} — reconnecting…`);
        try { enlaceDeRed?.cerrar(1000, "cambio de mapa"); } catch {}
        const q = new URLSearchParams(location.search);
        q.set("map", red.mapa);
        q.set("menu", "1");
        location.search = `?${q}`;
        return;
      }
    } catch (e) {
      console.warn(`sin red (${e?.message ?? e}): se juega en local`);
      try { enlaceDeRed?.cerrar(1000, "sin partida"); } catch {}
      red = null;
      enlaceDeRed = null;
    }
  }
  try {
    const catalogo = await traerJson(rutaComun("objetos.json"));
    // ── EL GUION DEL JUGADOR — el 64 ──────────────────────────────────────
    //
    // En Master Sword el jugador es una entidad con guion, igual que un NPC.
    // Este puerto corría los de los NPC desde el 33 y ninguno del jugador, así
    // que faltaban cosas que no son de ningún NPC: los avisos de la primera
    // vez y la regeneración, para empezar.
    //
    // Se carga aquí y no con el mapa porque **no es del mapa**: es el mismo en
    // Gate City y en Edana. Si no está horneado (`npm run jugador`) se juega
    // igual y se dice, como con `guiones.json`.
    fichaDelJugador = await traerJson(rutaComun("jugador.json"));
    if (!fichaDelJugador) console.warn("sin build/msr/jugador.json: el jugador va sin guion. Corre `npm run jugador`.");
    // Y los guiones de los OBJETOS, que es lo que le hace casi todo al jugador
    // (el 66). Se hornean aparte y también son del juego y no del mapa.
    const fichaObjetos = await traerJson(rutaComun("objetosguion.json"));
    if (!fichaObjetos) console.warn("sin build/msr/objetosguion.json: los objetos van sin guion. Corre `npm run objetos:guion`.");
    guionesDeObjeto = fichaObjetos ? new GuionesDeObjeto(fichaObjetos) : null;
    // EL 101: los modelos del equipo que se ve puesto (muñeco y elección).
    {
      const manifiestoDeEquipo = await traerJson(rutaComun("equipo.json"));
      if (!manifiestoDeEquipo) console.warn("sin build/msr/equipo.json: el muñeco y la pantalla de personajes van sin equipo. Corre `npm run equipo`.");
      equipoALaVista = manifiestoDeEquipo
        ? { manifiesto: manifiestoDeEquipo, equipo3d: new Equipo3D({ base: BASE_COMUN }) }
        : null;
    }
    // Y los de EFECTO: la cura del sacerdote, el sentarse, los venenos. Un
    // efecto es otro guion que se pega a una entidad (scriptedeffects.cpp:27).
    const fichaEfectos = await traerJson(rutaComun("efectosguion.json"));
    if (!fichaEfectos) console.warn("sin build/msr/efectosguion.json: `applyeffect` se apunta y no hace nada. Corre `npm run efectos:guion`.");
    tablaDeEfectos = fichaEfectos ? new TablaDeEfectos(fichaEfectos) : null;
    if (catalogo) catalogoDeObjetos = { porId: new Map(catalogo.objetos.map((o) => [o.id, o])) };
    // CÓMO SE PRESENTA EL MAPA: su nombre, su descripción y la banda de nivel
    // para la que está hecho. `npm run mapainfo`. Sin esto el juego no dice que
    // Gate City se declara a sí mismo un mapa de 10-25, que es justo lo que un
    // personaje recién hecho necesita saber antes de cruzar la puerta.
    fichaDelMapa = await traerJson(ruta("mapa.json"));
    if (!fichaDelMapa) {
      console.warn(`sin ${ruta("mapa.json")}: el mapa no se presenta al entrar. ` +
        "Corre `npm run mapainfo`.");
    }
    aparicion = await traerJson(ruta("aparicion.json"));
    if (!aparicion) {
      console.warn(`sin ${ruta("aparicion.json")}: se usa el punto del mapa, que es ` +
        `una cueva a oscuras con goblins. Corre \`npm run ${MAPA}:aparicion\`.`);
    }
    // Si IndexedDB no esta —una ventana privada, un navegador raro— vale mas un
    // personaje que se pierde al cerrar que una pantalla de error.
    // Las MISMAS cuatro operaciones, al otro lado del cable si hay partida.
    const almacen = red
      ? new AlmacenRemoto(red)
      : (globalThis.indexedDB ? new AlmacenLocal() : new AlmacenMemoria());
    sesion = new Sesion({ almacen, aparicion, catalogo, preparar: () => elMapa });
    // EL 96: `?personaje=<nombre>` mete en el almacén el personaje de pruebas
    // de `npm run personaje`. SÓLO en desarrollo y sólo en solitario (con red
    // el personaje es del servidor y la herramienta lo deja en su carpeta).
    // Antes de `refrescarCenso()`, para que salga ya en la primera lista.
    if (!red && import.meta.env?.DEV) await importarPersonajeDePruebas({ almacen, buscar: location.search });
    // EL CUERPO DEL PERSONAJE, sin esperarlo. `cargarCuerpos` se lleva un mega
    // entre malla, esqueleto y las seis animaciones; con un `await` aqui la
    // pantalla de personajes volveria al segundo y medio, que es precisamente lo
    // que se quito al cargar el mapa despues de elegir. Va como PROMESA y la
    // interfaz abre el hueco vacio y mete la figura cuando llegue.
    const losCuerpos = traerJson(rutaComun("cuerpos.json"))
      .then((m) => (m ? cargarCuerpos(m, { base: BASE_COMUN }) : null))
      .catch((e) => { console.warn("sin el modelo del personaje:", e); return null; });
    // `panelDePersonajes` es una funcion y no el panel: el registro de VGUI se
    // monta mas tarde —necesita el mapa cargado para el esquema y los bichos— y
    // esta pantalla sale a los 231 ms. Asi que se le pasa la llamada, que se
    // resuelve cuando toque; mientras no exista, `interfaz` usa su pantalla
    // suplente y el jugador puede elegir personaje igual.
    interfaz = montarInterfaz({
      sesion, catalogo, teclas, cuerpos: losCuerpos,
      panelDePersonajes: () => (vgui?.buscar("newchar") ? (vgui.abrir("newchar"), true) : false),
      panelDeInventario: () => (vgui?.buscar("inventory") ? (vgui.abrir("inventory"), true) : false),
      panelDeHoja: () => (vgui?.buscar("stats") ? (vgui.abrir("stats"), true) : false),
      panelDeOpciones: () => (vgui2 ? (vgui2.abrirOpciones(), true) : false),
    });

    // ── LAS VENTANAS DE VALVE ──────────────────────────────────────────────
    //
    // No esperan al mapa: su esquema es un `.json` aparte y sin él se dibujan
    // igual con lo que `src/vgui2/esquema.js` trae escrito. Así la G funciona
    // desde el primer momento.
    //
    // `puedeCapturar` es el reparto del ratón entre las DOS capas de interfaz,
    // y son dos condiciones, no una:
    //
    //   `vgui?.atrapaElRaton`  hay un panel de VGUI1 abierto que se queda el
    //                          ratón. `stats` NO cuenta, y es correcto: tiene
    //                          `m_NoMouse`, así que con la hoja delante el
    //                          puntero es del juego y devolvérselo no se lo
    //                          quita a nadie.
    //   `interfaz?.abierta`    eligiendo personaje o muerto. Sin esto, cerrar
    //                          una ventana durante la pantalla de muerte le
    //                          quita el ratón a quien necesita pulsar un botón.
    //   `menuMs?.abierto`      el menú principal, que desde ahora SIGUE ABIERTO
    //                          detrás de Options. Cerrar la ventana le devolvía
    //                          el puntero al lienzo y dejaba el menú sin ratón.
    //                          Hoy no llega a pasar —el menú ya lo había
    //                          soltado al abrirse, así que no hay nada que
    //                          devolver— pero la regla es «con el menú puesto
    //                          el ratón es libre» y vale más escrita que
    //                          dependiendo de en qué orden se abrieron las
    //                          cosas. Es la mina del 38, que era exactamente
    //                          un favor que se cumplía solo hasta que dejó de
    //                          cumplirse.
    montarVgui2({
      teclas, acciones: ACCIONES,
      puedeCapturar: () => !vgui?.atrapaElRaton && !interfaz?.abierta && !menuMs?.abierto,
      alAplicar: (valores) => {
        ajustesDelJugador = valores;
        // EL 84: EL MENÚ, QUE NO ESPERA A QUE HAYA MAPA.
        //
        // `aplicarAjustes` nace `null` y lo escribe el armado del mundo, así que
        // antes de cargar un mapa el `?.` de abajo no llama a nadie: mover el
        // volumen en el menú principal no hacía NADA —lo reportó el usuario, «de
        // hecho parece que no funciona para nada»— y los tres sonidos del menú
        // seguían a volumen 1, ocho veces el `config.cfg`.
        //
        // Esta línea va DELANTE y sin `aplicarAjustes`, porque el menú es
        // exactamente el sitio donde el otro todavía no existe.
        menuMs?.ponVolumen?.(valores.volumen);
        aplicarAjustes?.(valores);
      },
      // LA LISTA, y sólo la pestaña **Lan** devuelve algo.
      //
      // No hay maestro de Steam y no lo va a haber: esto es una pestaña de
      // navegador. Lo que sí hay es el servidor del experimento 27
      // —`npm run servidor`, que publica su resumen en `/partidas`—, y eso es
      // exactamente lo que en Master Sword es un servidor de LAN: uno que está
      // en tu máquina y que el maestro no conoce. Así que va en «Lan» y no en
      // «Internet», que sería mentir de otra forma.
      //
      // `resumen` ya trae `nombre`, `mapa`, `jugadores` y `max`, que son cuatro
      // de las cinco columnas del navegador. La latencia se deja en blanco en
      // vez de inventarse un número: medirla de verdad es abrir el socket.
      buscarServidores: async (pestana) => {
        if (pestana !== "Lan") return [];
        const partidas = await listarPartidas().catch(() => []);
        return partidas.map((p) => ({
          candado: "", favorito: "",
          nombre: p.nombre ?? "Master Sword: Rebirth",
          juego: "MS:R", mapa: p.mapa ?? MAPA,
          jugadores: `${p.jugadores ?? 0} / ${p.max ?? 0}`,
          ping: "", url: p.url,
        }));
      },
      // CONECTAR ES ENTRAR. En el motor, `connect` te mete en el mapa del servidor
      // (`CL_Connect_f` -> `Host_Map` del lado del cliente, y de ahí a elegir
      // personaje). Aquí sólo se ponía `?red=`: la página volvía con el MENÚ
      // PRINCIPAL delante y la conexión hecha por detrás, sin nada en pantalla que
      // lo dijera, y quien se unía desde la pestaña Lan veía que «se desconecta al
      // instante». Lo vio el usuario con `npm run servidor` y la aplicación de
      // escritorio. Ahora se entra con el mapa de la fila y `menu=1`, que es lo que
      // pone «Start»: la partida arranca en el mapa del servidor y sale la elección
      // de personaje. Si la fila no trae mapa, la bienvenida lo corrige (el 61).
      alConectar: (fila) => { const q = urlDeConexion(fila); if (q) location.search = q; },
      porQueVacio: "No Steam master server here. Run `npm run servidor` and look in the Lan tab.",
    }).then((v) => { vgui2 = v; }).catch((e) => console.warn("sin las ventanas de VGUI2:", e));
    retratosDelPanel = new Retratos(losCuerpos);
    // ── LOS PANELES DE VGUI ───────────────────────────────────────────────
    //
    // Se montan AQUÍ, antes de cargar el mapa, y eso importa: la pantalla de
    // personajes es la primera que se ve —a los 231 ms— y el mapa tarda 1,7 s.
    // Montado después, `sesion.arrancar()` pedía esa pantalla, el registro no
    // existía todavía y no salía ninguna. El esquema y los retratos no
    // necesitan el mapa; el menú de la F sí, y por eso ése se monta más abajo.
    //
    // El kit está en `src/vgui/`: es `vgui_mscontrols.h` y `vgui_menubase.cpp`
    // portados, con el registro de paneles que reparte las teclas. Ver
    // `ESTRUCTURA.md` y `doc/VGUI_29.md`.
    //
    // Lo que cambia respecto a los paneles que había: **las teclas entran por la
    // tabla del juego**. `interfaz.js` escuchaba `keydown` en la ventana por su
    // cuenta, así que sus pantallas no eran del juego, eran páginas encima del
    // juego. Éste se abre con la acción `interactuar`, que vale `f` porque lo dice
    // `config.cfg:19`, y se reasigna en las opciones como cualquier otra.
    try {
      const m = await traerJson(ruta("menus.json"));
      if (m) fichaDeMenus = m;
    } catch (e) {
      console.warn("las opciones de los NPC no están extraídas (`npm run menus`):", e);
    }
    try {
      const g = await traerJson(ruta("guiones.json"));
      if (g) fichaDeGuiones = g;
    } catch (e) {
      console.warn("los guiones de los NPC no están extraídos (`npm run guiones`): " +
        "el menú se queda con la ficha del 29 y elegir una opción no hará nada.", e);
    }
    esquemaVgui = await cargarEsquema(`${BASE_COMUN}/`, innerWidth);
    if (!document.getElementById("vg-css")) {
      const s = document.createElement("style");
      s.id = "vg-css"; s.textContent = CSS_VGUI + CSS_PERSONAJE + CSS_INVENTARIO + CSS_TIENDA;
      document.body.appendChild(s);
    }
    const capaVgui = document.createElement("div");
    capaVgui.style.cssText = "position:absolute; inset:0; z-index:30; pointer-events:none;";
    document.body.appendChild(capaVgui);

    vgui = new Registro({
      esquema: esquemaVgui,
      raiz: capaVgui,
      reloj: () => reloj,
      sonar: (cual) => menuMs?.sonar?.(cual),
      // EL PUNTERO. Ver `cursorCambio` en `src/vgui/registro.js` para las citas:
      // esto es la mitad del motor que toca el DOM, y por eso vive aquí.
      //
      // Faltaba, y el fallo era de los que no se ven leyendo el panel: el
      // inventario y el menú de la F abrían perfectos —con sus botones, sus
      // textos y su ratón encima— y no se podía pulsar **ni uno**, porque el
      // puntero seguía atrapado en el `canvas` y los clics no llegaban al DOM.
      // `atrapaElRaton` estaba escrito desde el 29 y nadie lo conectaba.
      cursor: cursorDelRaton,
    });
    vgui.medir(innerWidth, innerHeight);

    // ── CREAR PERSONAJE ───────────────────────────────────────────────────────
    //
    // `CNewCharacterPanel`, con sus tres etapas. Ver `doc/PERSONAJE_30.md`.
    let iconosDeArma = null;
    try {
      iconosDeArma = await traerJson(rutaComun("iconos.json"));
    } catch (e) {
      console.warn("sin los iconos de las armas (`npm run iconos`):", e);
    }
    // Las siete de `reg.newchar.weaponlist`, con su icono si su script lo declara
    // con `trade` — que son dos de siete, y eso es del juego. Ver `tools/iconos.mjs`.
    const armasDePartida = (sesion?.catalogo?.nuevoPersonaje?.armas ?? []).map((id) => {
      const f = catalogoDeObjetos?.porId?.get(id) ?? null;
      const ic = iconosDeArma?.armas?.[id] ?? null;
      return {
        id, nombre: f?.nombre ?? id,
        habilidad: f?.arma?.habilidad ?? (f?.tipo === "hechizo" ? "spellcasting" : null),
        icono: ic ? `${iconosDeArma.base}${ic.archivo}` : null,
      };
    });

    let censoDePersonajes = [];
    const refrescarCenso = async () => {
      try { censoDePersonajes = await sesion.almacen.listar(); } catch { censoDePersonajes = []; }
      // EL 101: CÓMO SE VE CADA UNO. El género, si empuña algo y sus piezas,
      // como el `charinfo_t` que el servidor del mod manda con la lista
      // (playershared.cpp:1522-1558). `vista` la pone el almacén
      // (`aLaVistaDe`); aquí se resuelve con los guiones de objeto.
      censoDePersonajes = censoDePersonajes.map((d) => {
        if (!d?.vista) return d;
        const fichaDe = (id) => catalogoDeObjetos?.porId?.get(id) ?? null;
        // EL 101b: y el CUERPO con lo que la armadura esconde — el `body`
        // que el mod guarda para esta pantalla (mscharacter.h:86). Sin esto el
        // pantalón asomaba por debajo de la coraza. Ver `cuerpoGuardado`.
        const cuerpo = piezaDelCuerpo({
          cuerpos: cuerpoGuardado({ personaje: d.vista, guiones: guionesDeObjeto, fichaDelJugador }),
          genero: d.vista.genero, manifiesto: equipoALaVista?.manifiesto ?? null,
        });
        const piezas = piezasConCuerpo(
          [...(cuerpo ? [cuerpo] : []), ...equipoEnLaEleccion({ personaje: d.vista, guiones: guionesDeObjeto, fichaDe })],
          equipoALaVista?.manifiesto ?? null);
        // `m_ItemInHand`: algo que no va puesto (vgui_choosecharacter.cpp:
        // 1352-1360). Los puños no son un objeto guardado (`HAND_PLAYERHANDS`).
        const conArma = ["derecha", "izquierda"].some((m) => {
          const id = d.vista.manos?.[m];
          return Boolean(id) && fichaDe(id)?.mano !== "undroppable";
        });
        return { ...d, aspecto: { genero: d.vista.genero, conArma, piezas, firma: firmaDe(piezas) } };
      });
      vgui?.buscar("newchar")?.refrescar();
    };

    vgui.poner(new PanelDePersonaje({
      esquema: esquemaVgui,
      retratos: retratosDelPanel,
      equipo3d: equipoALaVista?.equipo3d ?? null,
      armas: armasDePartida,
      // El cvar `name`, que es de dónde saca el mod el nombre que propone.
      nombrePropuesto: ajustesDelJugador?.nombre ?? "",
      // `listar()` es sincrono porque el panel se redibuja en cada fotograma del
      // desvanecido; la lista se refresca aparte y se queda cacheada.
      listar: () => censoDePersonajes,
      async jugar(id) {
        vgui.cerrar();
        await sesion.entrar(id);
      },
      async crear({ nombre, genero, arma }) {
        const p = await sesion.crear({ nombre, genero, arma });
        vgui.cerrar();
        await sesion.entrar(p.id);
      },
      async borrar(id) {
        await sesion.almacen.borrar(id);
        await refrescarCenso();
      },
    }));
    await refrescarCenso();

    // ── EL INVENTARIO ───────────────────────────────────────────────────
    //
    // `VGUI_ContainerPanel`. Retira la rejilla inventada de
    // `src/juego/inventario.js`. Ver `doc/INVENTARIO_31.md`.
    //
    // ── LA COLUMNA DEL EQUIPO, QUE ESTABA INVENTADA ─────────────────────
    //
    // Aquí había UNA entrada, «Pack», y todo lo que llevas dentro. La columna
    // de Master Sword son **las manos y luego tus contenedores**, y un
    // personaje nuevo nace con cuatro:
    //
    //     local reg.newchar.freeitems
    //         sheath_belt_holster;sheath_back;sheath_dagger;pack_sack
    //                                     global.script:29
    //
    // O sea Heavy Weapon Holster, Back Sword Sheath, Dagger Sheath y Small
    // Sack, que son exactamente los cuatro de una captura del juego. No hacía
    // falta nada nuevo: `crearPersonaje()` ya se los daba y el catálogo ya los
    // lee con `tipo: "contenedor"`. Lo que faltaba era enseñarlos.
    //
    // `m_Selected == 0` son **las manos** (`vgui_containerlist.cpp:275-282`),
    // así que van las primeras y no son un contenedor más.
    const fichaDeObjeto = (id) => catalogoDeObjetos?.porId?.get(id) ?? null;
    const iconoDe = (id) => {
      const ic = iconosDeArma?.objetos?.[id] ?? null;
      return ic ? `${iconosDeArma.base}${ic.archivo}` : null;
    };
    const MANOS = "hands";
    /** El id del contenedor por defecto: el primero que el personaje lleve. */
    const contenedoresDe = (p) => (p?.objetos ?? [])
      .filter((o) => fichaDeObjeto(o.id)?.tipo === "contenedor");
    const enMano = (p) => [p?.manos?.derecha, p?.manos?.izquierda]
      .filter(Boolean)
      .map((m) => (typeof m === "string" ? m : (m.clave ?? m.id)));
    const verObjeto = (o) => {
      const f = fichaDeObjeto(o.id);
      return {
        id: o.uid ?? o.id, nombre: f?.nombre ?? o.id,
        peso: f?.peso ?? 0, cantidad: o.n ?? 1, calidad: o.calidad ?? null,
        icono: iconoDe(o.id),
        // Para el botón «Descriptions», que es una de las tres vistas del
        // original (`vgui_container.cpp:531`).
        descripcion: f?.descripcion ?? null,
      };
    };
    vgui.poner(new PanelDeInventario({
      esquema: esquemaVgui,
      equipo: () => {
        const p = sesion?.personaje ?? null;
        return [
          { id: MANOS, nombre: "Player Hands", esContenedor: true },
          ...contenedoresDe(p).map((o) => ({
            id: o.uid ?? o.id,
            nombre: fichaDeObjeto(o.id)?.nombre ?? o.id,
            esContenedor: true,
          })),
          // EL 97: y DESPUÉS, lo que llevas puesto y no es un contenedor —la
          // armadura, el yelmo—, en gris. `AddInventoryItems` mete primero los
          // contenedores y luego los demás de `Gear` que no estén en la mano
          // (vgui_container.cpp:430-451); el gris es `Color_GearNonContainer`.
          ...(p?.objetos ?? []).filter((o) => o.puesto && fichaDeObjeto(o.id)?.tipo !== "contenedor").map((o) => ({
            id: o.uid ?? o.id,
            nombre: fichaDeObjeto(o.id)?.nombre ?? o.id,
            esContenedor: false,
          })),
        ];
      },
      // ── Y QUÉ HAY DENTRO DE CADA UNO ──────────────────────────────────
      //
      // En las manos, lo que llevas en ellas. En los contenedores, nada —
      // **que es lo que ve un personaje recién creado en el juego**: sus cuatro
      // fundas vacías y «No items».
      //
      // La excepción es NUESTRA y se dice: lo que recoges del suelo no tiene
      // todavía un contenedor al que ir, porque el reparto de verdad
      // (`ITEM_CONTAINER`, capacidad por volumen, mover de uno a otro) sigue en
      // el pendiente. Va al PRIMER contenedor que lleves, que en un personaje
      // nuevo es el Heavy Weapon Holster. Es visible y se puede sacar; lo que
      // no es todavía es correcto.
      dentro: (cual) => {
        const p = sesion?.personaje ?? null;
        if (!p) return [];
        // EL 97: las manos se leen de `manos` —en la versión 2 del registro lo
        // empuñado ya no está en `objetos`— y las dos, izquierda primero
        // (`for (i < MAX_PLAYER_HANDS) player.Hand(i)`, vgui_container.cpp:421-428).
        if (cual === MANOS) return enMano(p).map((id) => verObjeto({ id, n: 1 }));
        // EL 98: CADA CONTENEDOR CON LO SUYO (src/play/contenedores.js). Lo que
        // llegó sin sitio se coloca aquí con la regla de `PutInAnyPack`
        // (playershared.cpp:706-733), y lo que no cabe en NINGUNO —que en el
        // juego no puede existir: se habría quedado en la mano o en el suelo—
        // se sigue viendo en el primero, como hasta el 97, para que se pueda
        // sacar. `probe.inventario98.sinSitio` lo cuenta.
        const fdo = (id) => fichaDeObjeto(id);
        const sinSitio = colocarEnContenedores(p, fdo);
        const cajas = contenedoresDe(p).map((o) => o.uid ?? o.id);
        const suyos = dentroDelContenedor(p, cual);
        return (cual === cajas[0] ? [...suyos, ...sinSitio] : suyos).map(verObjeto);
      },
      oro: () => sesion?.personaje?.oro ?? 0,
      carga: () => {
        const p = sesion?.personaje;
        if (!p) return null;
        const r = resumen(p);
        const c = cargaDe(loQueLleva(p).map((o) => ({ ...o, ficha: fichaDeObjeto(o.id) })), r.derivadas.carga);
        return { lleva: c.peso, puede: c.capacidad };
      },
      // El botón de acción. En el original «Remove» se quita el contenedor
      // (`ServerCmd("remove <id>")`, vgui_containerlist.cpp:169-174) y para eso
      // hace falta poder llevar cosas de un contenedor a otro, que es lo que no
      // está. Dice lo que pasa en vez de no hacer nada, igual que las entradas
      // apagadas del menú principal.
      // EL 98: «DROP SELECTED» — `DropAllSelected` (vgui_containerlist.cpp:177-
      // 186): un `drop <id>` por cada objeto elegido y `HideTopMenu`. En el
      // servidor es `DropItem(pItem, false, true)` (client.cpp:932-947), que
      // suelta de DONDE ESTÉ —«Items could be anywhere on the player»,
      // playershared.cpp:942— con el mismo tiro que la `c`. Este panel elige
      // de uno en uno (el original deja elegir varios), así que es UN `drop`.
      actuar: (idEquipo, idObjeto) => {
        if (idEquipo === MANOS || idObjeto === null) return null;
        soltarDeUnContenedor(idObjeto);
        return null;
      },
      // ── EL 97: LAS TRES ÓRDENES DEL PANEL (src/play/equipar.js) ─────────
      //
      // «Remove» y el doble clic en una pieza puesta: `remove <id>`
      // (vgui_containerlist.cpp:170-175, :329-341). Un contenedor también se
      // puede quitar en el juego; aquí no, porque lo de dentro no se reparte.
      quitar: (idEquipo) => {
        const p = sesion?.personaje;
        const pieza = (p?.objetos ?? []).find((o) => (o.uid ?? o.id) === idEquipo && o.puesto) ?? null;
        if (!pieza) return "Removing a container is not in this port yet.";
        moverEquipo((eq) => eq.aLaMano(idEquipo, "remove"));
        return null;
      },
      // Doble clic en un objeto de un contenedor: `inv transfer <id> 0`
      // (:199-221). Con las manos elegidas no hace nada (`if (m_Selected == 0) return`).
      sacar: (idEquipo, idObjeto) => {
        if (idEquipo === MANOS) return null;
        moverEquipo((eq) => eq.aLaMano(idObjeto, "transfer"));
        return null;
      },
      // Un objeto elegido y un clic en una entrada de la columna: `inv transfer
      // <id> <contenedor>` (:288-327). A «Player Hands» es a la mano; a un
      // contenedor, guardarlo; a una pieza puesta, nada (`GetContainer` no la
      // encuentra y el clic la elige).
      llevarA: (idEquipo, idObjeto, enLasManos) => {
        const p = sesion?.personaje;
        if (!p) return false;
        if (idEquipo === MANOS) {
          if (enLasManos) return true;
          moverEquipo((eq) => eq.aLaMano(idObjeto, "transfer"));
          return true;
        }
        if (!contenedoresDe(p).some((o) => (o.uid ?? o.id) === idEquipo)) return false;
        // EL 98: de un contenedor a otro, `inv transfer <id> <c>` -> `PutInPack`
        // con su regla de lo que cabe (src/play/equipar.js, `moverA`).
        if (!enLasManos) { moverEquipo((eq) => eq.moverA(idObjeto, idEquipo)); return true; }
        const mano = ["izquierda", "derecha"].find((h) => p.manos?.[h] === idObjeto) ?? null;
        if (mano) moverEquipo((eq) => eq.guardarEn(mano, idEquipo));
        return true;
      },

    }));

    // ── LA TIENDA (60): el selector y sus dos listas ────────────────────
    //
    // `npcstore.offer` abre TRES paneles en cadena —el selector «1. Buy / 2.
    // Sell / 3. Cancel» y luego una de las dos listas—, y las dos listas son
    // el panel del inventario con otro contenido. Ver `src/vgui/tienda.js`.
    //
    // Lo que está abierto ahora mismo: de quién es la tienda, cuál es y con
    // qué flags. Vive aquí porque los tres paneles lo comparten y ninguno de
    // los tres es su dueño — igual que `OpenStore` en el motor, que es del
    // NPC y no del panel.
    let laTienda = null;
    const lineasDeLaTienda = () => (laTienda?.tienda?.objetos ?? []).map((l) => {
      const f = fichaDeObjeto(l.id);
      return {
        ...l, nombre: f?.nombre ?? l.id, peso: f?.peso ?? 0,
        icono: iconoDe(l.id), descripcion: f?.descripcion ?? null,
      };
    });
    vgui.poner(new MenuDeTienda({
      esquema: esquemaVgui,
      alElegir: (cual) => {
        if (!cual || !laTienda) return;
        vgui.abrir(cual === "comprar" ? NOMBRE_COMPRAR : NOMBRE_VENDER);
      },
    }));
    for (const modo of ["comprar", "vender"]) {
      vgui.poner(new PanelDeTienda({
        esquema: esquemaVgui, modo,
        lineas: lineasDeLaTienda,
        mios: () => {
          const p = sesion?.personaje ?? null;
          if (!p) return [];
          // Lo que se puede vender es lo que llevas, contenedores incluidos.
          // El motor comprueba el DUEÑO del objeto y nada más (:1906), y aquí
          // todo lo de `p.objetos` es tuyo por construcción.
          return (p.objetos ?? []).map(verObjeto);
        },
        oro: () => sesion?.personaje?.oro ?? 0,
        vendedor: () => laTienda?.vendedor ?? "",
        flags: () => laTienda?.flags ?? 0,
        comprar: (id) => comprarDeLaTienda(id),
        venderTodo: (ids) => { for (const id of ids) venderALaTienda(id); },
      }));
    }

    /**
     * COMPRAR. `trade buy <nombre>` → `CBasePlayer::TradeItem`.
     *
     * La regla —el orden de los cuatro noes, el precio, cuánto baja el
     * estante— está en `src/play/tienda.js`. Aquí sólo se APLICA lo que
     * decide, que es la frontera de siempre: `src/play/` no toca al personaje.
     */
    function comprarDeLaTienda(id) {
      const p = sesion?.personaje ?? null;
      if (!p || !laTienda?.tienda) return false;
      // CON RED NO SE COMPRA AQUÍ: SE PIDE. `ServerCmd("trade ...")`,
      // client.cpp:739. El precio, las existencias y el oro los tiene el
      // servidor, y el estante vuelve entero en el mensaje siguiente.
      if (red?.dentro && laTienda.remoto) {
        red.trade("buy", {
          ...laTienda.remoto, id, flags: laTienda.flags, vendedor: laTienda.vendedor,
        });
        return true;
      }
      const f = fichaDeObjeto(id);
      const r = comprarEnTienda(laTienda.tienda, id, {
        oro: p.oro ?? 0,
        // `NewItemHand` y `CanPutInAnyPack`. El tope de 50 es el único que
        // este puerto sabe comprobar hoy; el volumen de la mochila no, y por
        // eso se dice aquí en vez de fingir que sí.
        cabe: (p.objetos?.length ?? 0) < MAX_OBJETOS_TIENDA,
        nombre: f?.nombre ?? id,
      });
      if (r.aviso) suceso(r.que === "compra" ? "normal" : "nopuedes", r.aviso);
      if (r.que !== "compra") return false;
      p.oro = (p.oro ?? 0) - r.precio;
      // `n` es `V_max(iBundleAmt, 1)`, no 1 a secas: una línea de tienda con
      // lote 3 entrega UN objeto de cantidad 3 (:1895). Con lote 0 —que es lo
      // normal— sale 1 y esto no cambia nada; con lote, sí.
      p.objetos = [...(p.objetos ?? []), { id, n: Math.max(r.entregadas ?? 0, 1) }];
      // `Quantity -= V_max(pItem->iQuantity, 1)`, y el estante es el de la
      // tienda de verdad, no una copia: el vendedor se queda sin existencias.
      const linea = laTienda.tienda.linea(id);
      if (linea) linea.cantidad -= r.descuenta;
      sesion.tocado?.();
      // Un objeto que entra en la mochila es una entidad NUEVA y corre su
      // `game_spawn` (el 66). Sin esto, comprar el hechizo de rejuvenecer te
      // daría un icono y ningún efecto hasta reaparecer.
      //
      // Va por el asa de módulo y no por el nombre de la función: ésta vive en
      // el armado del mundo y esto no, así que llamarla por su nombre da
      // `ReferenceError` — y `?.()` NO salva de eso. Lo cazó `sonda:tienda60`
      // al comprar, que es la regla de pasar las sondas vecinas.
      sincronizarObjetos();
      return true;
    }

    /** VENDER. `trade sell <id>`. */
    function venderALaTienda(id) {
      const p = sesion?.personaje ?? null;
      if (!p || !laTienda?.tienda) return false;
      if (red?.dentro && laTienda.remoto) {
        red.trade("sell", {
          ...laTienda.remoto, id, flags: laTienda.flags, vendedor: laTienda.vendedor,
        });
        return true;
      }
      const f = fichaDeObjeto(id);
      // El id que enseña el panel es el `uid` si lo hay, y la tienda razona
      // por clave de objeto: se busca la pieza y se vende POR SU CLAVE.
      const pieza = (p.objetos ?? []).find((o) => (o.uid ?? o.id) === id) ?? null;
      const clave = pieza?.id ?? id;
      const r = venderEnTienda(laTienda.tienda, clave, {
        nombre: fichaDeObjeto(clave)?.nombre ?? f?.nombre ?? clave,
      });
      if (r.aviso) suceso("normal", r.aviso);
      if (r.que !== "vende" || !pieza) return false;
      p.oro = (p.oro ?? 0) + r.precio;
      p.objetos = (p.objetos ?? []).filter((o) => o !== pieza);
      const linea = laTienda.tienda.linea(clave);
      if (linea) linea.cantidad += r.suma;
      sesion.tocado?.();
      return true;
    }

    /**
     * Lo que `npcstore.offer` llama. Devuelve `true` si ha abierto algo, que
     * es lo que `src/play/npcguion.js` usa para saber si tiene que decirlo por
     * la consola en su lugar.
     */
    abrirLaTienda = ({ tienda, flags, vendedor, remoto = null }) => {
      if (!tienda) return false;
      laTienda = { tienda, flags, vendedor, remoto };
      // ── SE ABRE EN EL TIC SIGUIENTE, y no es un apaño ─────────────────
      //
      // Quien llega aquí es el guion del NPC, disparado por pulsar «Shop» en
      // el menú de interacción. Y ese menú hace las dos cosas EN ESTE ORDEN:
      //
      //     if (SendCmd) ServerCmd("menuoption " + ent + " " + Data);
      //     VGUI::HideMenu(this);        vgui_menu_interact.h:195-205
      //
      // primero manda la opción y después se cierra. En el juego da igual
      // porque la opción va al servidor y la tienda vuelve en otro mensaje,
      // varios fotogramas después; aquí el guion corre en la misma pila, así
      // que abrir ahora mismo significa que el `cerrar()` de la línea
      // siguiente cierra **la tienda** en vez del menú. Lo primero que hizo
      // esta sonda fue enseñar eso: la F abría el menú, «Shop» lo cerraba y
      // no salía nada.
      //
      // El `setTimeout(0)` es la ida y vuelta al servidor, que es lo que de
      // verdad separa las dos cosas en el original.
      setTimeout(() => {
        // Con `STORE_INV` —un cofre, un saco— el motor no enseña el selector:
        // no hay nada que elegir, se abre la lista directamente.
        if (flags & INVENTARIO_TIENDA) { vgui.abrir(NOMBRE_COMPRAR); return; }
        vgui.buscar(NOMBRE_SELECTOR)?.poner(vendedor, flags);
        vgui.abrir(NOMBRE_SELECTOR);
      }, 0);
      return true;
    };

    // ── EL ESTANTE QUE LLEGA DEL SERVIDOR — experimento 62 ────────────────
    //
    // `CStore::Offer` no manda «abre la tienda»: manda **el estante**, fila a
    // fila, y sólo al cliente que está comerciando (`MSG_ONE`, store.cpp:82).
    // Así que aquí no se calcula nada; se envuelve lo que llega con la forma
    // que el panel ya sabe leer —`objetos` y `linea(id)`— y se abre.
    //
    // Y llega DOS veces: al abrir y **después de cada compra**, porque el mod
    // vuelve a mandar el estante entero en vez de parchear una fila. Por eso
    // si el panel ya está abierto esto refresca en vez de reabrir: reabrir
    // cerraría la lista en la que acabas de pulsar.
    red?.al("tienda", (m) => {
      const lineas = (m.lineas ?? []).map((l) => ({ ...l }));
      const estante = {
        nombre: m.tienda,
        objetos: lineas,
        linea: (id) => lineas.find((l) => l.id === id) ?? null,
      };
      const abierto = vgui?.abierto?.nombre ?? null;
      laTienda = {
        tienda: estante, flags: m.flags, vendedor: m.vendedor,
        // `remoto` es lo que hace que comprar se MANDE en vez de aplicarse.
        remoto: { quien: m.quien, tienda: m.tienda },
      };
      if (abierto === NOMBRE_COMPRAR || abierto === NOMBRE_VENDER) {
        vgui.buscar(abierto)?.refrescar?.();
        return;
      }
      abrirLaTienda({ tienda: estante, flags: m.flags, vendedor: m.vendedor, remoto: laTienda.remoto });
    });

    // Los recados de los guiones del servidor: un `suceso` a su consola y un
    // `infomsg` a su ventana. Son los mismos dos sitios que cuando el guion
    // corre aquí; lo que cambia es de dónde viene el texto.
    red?.al("suceso", (m) => suceso(m.suceso ?? "normal", m.texto));
    red?.al("aviso", (m) => mensajes?.aviso(m.titulo ?? "", m.texto ?? ""));
    // EL 93: el fundido y los iconos de un efecto que corre en el servidor.
    red?.al("pantalla", (m) => mensajes?.pantalla(m));

    // ── LO QUE CAMBIA DE TU PERSONAJE, cuando lo cambia el servidor ────────
    //
    // El 63. `MENSAJE.FICHA` es el `NETMSG_SETSTAT` del oro y el `NETMSG_ITEM`
    // de la mochila (ver el protocolo, con sus citas). Se funde en el personaje
    // de la sesión —que es el que leen el HUD, la hoja y el inventario— y se
    // refresca lo que esté abierto: comprar y que la pantalla no se entere es
    // exactamente igual de inútil que no comprar.
    red?.al("ficha", (m) => {
      const p = sesion?.personaje;
      if (!p) return;
      if (m.oro !== undefined) p.oro = m.oro;
      if (m.objetos !== undefined) p.objetos = m.objetos;
      // Con servidor la mochila llega por el cable, así que es aquí donde se
      // sabe que hay un objeto nuevo al que arrancarle el guion (el 66).
      sincronizarObjetos();
      const abierto = vgui?.abierto?.nombre ?? null;
      if (abierto) vgui.buscar(abierto)?.refrescar?.();
    });

    // ── CHARACTER INFO ──────────────────────────────────────────────────
    //
    // `CStatPanel`, el de la **P**. Y el único de los cuatro con
    // `m_NoMouse = true`: se lee SIN soltar el puntero, así que puedes mirarte
    // las habilidades mientras sigues girando la cámara. Ver
    // `doc/HOJA_32.md`.
    vgui.poner(new PanelDeHoja({
      esquema: esquemaVgui,
      hoja: () => (sesion?.personaje ? resumen(sesion.personaje) : null),
    }));

    // EL PANEL SIGUE AL ESTADO DE LA SESIÓN, y no al revés.
    //
    // Se abre cuando la sesión dice ELIGIENDO —por `interfaz`, que es quien
    // escucha— y **se cierra cuando deja de decirlo**, venga la entrada de donde
    // venga. Sin esta segunda mitad, entrar al juego por cualquier camino que no
    // sea pulsar en el panel —una sonda, un enlace, volver de la muerte— dejaba
    // la pantalla de personajes puesta encima del mapa, con el jugador andando
    // detrás. Lo cazó `sonda:vgui29`, que entra por `sesion.nuevo`.
    sesion.al("estado", ({ ahora }) => {
      if (ahora !== ESTADO.ELIGIENDO && vgui?.abierto?.nombre === "newchar") vgui.cerrar();
    });


    guardarAlCerrar(sesion);
    document.getElementById("intro").hidden = true;

    // ── POR DÓNDE SE ENTRA ────────────────────────────────────────────────
    //
    // En Master Sword no se entra a jugar: se entra al MENÚ, y desde ahí o
    // montas una partida local («Establish a Kingdom») o te conectas a una
    // ajena («Visit a Kingdom»). Hasta el experimento 36 este port arrancaba
    // directo en la pantalla de personajes, o sea que hacía «Establish a
    // Kingdom» **sola, en silencio y sin que nadie la pidiera**.
    //
    // Y saltarse el menú también es del juego: `hl.exe -game msc +map <mapa>`
    // entra sin pasar por él. Aquí eso es `?map=`, que es lo que llevan puesto
    // las veinte sondas desde siempre —y por eso ninguna se entera de este
    // cambio—. El parámetro existía y no hacía nada; ahora es la línea de
    // comandos.
    // El menú se monta más abajo —necesita su ficha horneada—, así que aquí
    // sólo se apunta por dónde hay que entrar y se abre cuando exista. Llamarlo
    // ahora abriría un menú que todavía es `null`.
    // ── EL 89: SE LLEGA DE UN VIAJE ─────────────────────────────────────────
    //
    // Tras cruzar una transición el motor reconecta CON EL MISMO PERSONAJE y no
    // enseña la lista, así que aquí tampoco. `viaje` es el personaje y `llegada`
    // el `m_SpawnTransition` que puso `settrans` (ver `aplicarTransicion`).
    //
    // NO se espera al mapa con `await`: `elMapa` se resuelve más abajo en esta
    // misma función (`mapaListo()`), y esperarlo aquí sería que `arrancarJuego`
    // se esperase a sí misma para siempre. Se encadena y se sigue.
    const deViaje = new URLSearchParams(location.search);
    const personajeDeViaje = deViaje.get("viaje");
    if (mapaPedido && personajeDeViaje) {
      elMapa.then(async () => {
        const nombre = deViaje.get("llegada");
        const m = level.manifiesto;
        const inicio = inicioDe(m);
        // Llegada con nombre; si no la hay y el mapa deja crear personaje
        // (`JN_STARTMAP`), el inicio; y si tampoco, nada — el motor expulsa.
        const punto = elegirLlegada(m.llegadas ?? [], nombre, { inicio });
        try {
          if (!punto) {
            // `JN_TRAVEL` sin respaldo (player.cpp:2525-2547). El motor desconecta;
            // aquí se dice lo mismo y se vuelve a la lista de personajes. Ninguna
            // de las 193 transiciones del juego llega a esto: es la regla y nada más.
            suceso("nopuedes", faltaElEnlace(nombre ?? "<unknown>"));
            await sesion.arrancar();
            return;
          }
          // El inicio va con el `nacimiento` horneado, que es ese mismo
          // `ms_player_begin` CON su rumbo medido; una llegada con nombre, con el
          // suyo del `.bsp`. GoldSrc mira a (cos θ, sin θ) y este jugador, con yaw
          // 0, a +Y del `.bsp` (−Z de la escena), así que yaw = (θ − 90°).
          sesion.ultimaTransicion = punto === inicio
            ? (sesion.aparicion?.nacimiento ?? null)
            : { nombre, escena: punto.pies, yaw: ((punto.yaw - 90) * Math.PI) / 180 };
          await sesion.entrar(personajeDeViaje, { entrada: ENTRADA.VUELTA });
        } catch (err) {
          console.warn("no se ha podido llegar del viaje:", err);
          await sesion.arrancar();
        }
      });
    } else if (mapaPedido) await sesion.arrancar();
    else entrarPorElMenu = true;
  } catch (e) {
    console.warn("el ciclo de sesion no se ha podido montar:", e);
  }

  say(`reading what was extracted from ${MAPA}.bsp…`);
  const level = await cargarNivel({ mapa: MAPA });
  if (!level.mesh.triangleCount) throw new Error(`${MAPA} se cargo vacio`);

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
  // EL 100: el paso del jugador con `PM_CheckStuck` delante y los bichos que
  // ya están dentro apartados, lo mismo que el servidor desde el 99
  // (src/play/atasco.js `PasoLocal`). Todo `step` del jugador pasa por aquí.
  const pasoLocal = new PasoLocal(player);

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
  addEventListener("resize", () => {
    resize();
    // Los paneles se recolocan: sus medidas son las de 640x480 y `XRES`/`YRES`
    // las convierten al tamaño de ahora. Ver `src/vgui/widgets.js`.
    vgui?.medir(innerWidth, innerHeight);
  });

  say(`loading ${level.manifiesto.texturas.length} textures and the lightmap…`);
  const { texturas, faltan } = await cargarTexturasBsp(level.manifiesto, {
    base: BASE,
    // 8, que es `gl_anisotropy` en la configuracion del juego, y no el maximo
    // de la tarjeta: se trata de parecerse a el, no de verse mejor que el.
    anisotropia: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  if (faltan.length) console.warn("texturas que faltan:", faltan.join(", "));
  const atlas = await cargarMapaDeLuz(level.manifiesto, { base: BASE });
  // EL RELOJ DEL PARPADEO. `CL_RunLightStyles()` avanza diez veces por segundo;
  // `relojLuz` es el `cl.time` del motor y lo único que se le pasa a `animarLuz`.
  let relojLuz = 0;
  // La textura de atlas que le toca AHORA a un material. Las perillas que
  // apagan o tiñen el mapa de luz tienen que volver a ÉSTA y no a una fija, o al
  // encenderlas otra vez se quedaría el mapa congelado en la variante 0.
  const atlasDe = (m) => atlas.texturaEnT(m.userData.cubo ?? "quieta", relojLuz);
  // Las texturas de DETALLE: 58 de las 80 del mundo llevan una, y el juego las
  // dibuja (`opengl.cfg`, `r_detailtextures "1"`). Ver `escenaDelMapa`.
  const detalle = await cargarDetalle(level.manifiesto, {
    base: BASE,
    anisotropia: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });

  // El CIELO: las seis caras de `nature1` que GoldSrc carga de `gfx/env/`. Si
  // faltan, `cargarCielo` devuelve null y el mapa vuelve al color plano de
  // `light_environment`, que es lo que habia.
  const cajaDeCielo = await cargarCielo(level.manifiesto, { base: BASE });

  const { escena, mundo, velo, materiales, grupos, aguas, detalle: mallaDetalle, gruposDetalle,
          cielo: mallaCielo, animarLuz, material: materialDelMapa } =
    escenaDelMapa(level, texturas, atlas, { detalle, cielo: cajaDeCielo });

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

  // Y LO QUE SE ROMPE (69): los `func_breakable`, que eran pared por la misma
  // razón que las puertas — horneados dentro del trimesh del mundo. Cuatro
  // almiares en Edana y dieciseis cajas en Gate City, cada uno con su malla y su
  // colisionador, que es lo que permite quitarlos.
  const rompibles = montarRompibles(level.manifiesto, level.bin, {
    materialDe: materialDelMapa, mundo: world.world, RAPIER,
  });
  if (rompibles) escena.add(rompibles.grupo);

  // Y LAS QUE SE CORREN (70): los `func_door`, que no eran ni pared. Tres en
  // Edana —la tapa de la cloaca entre ellas—, cero en Gate City. Ver
  // `src/render/correderas.js`: hasta aquí estaban sólo dibujadas, sin
  // colisionador, así que la tapa era una lámina por la que se pasaba andando.
  const correderas = montarCorrederas(level.manifiesto, level.bin, {
    materialDe: materialDelMapa, mundo: world.world, RAPIER,
  });
  if (correderas) escena.add(correderas.grupo);

  // Y LOS VOLUMENES: el agua, las dos escaleras y el plano de la muerte.
  //
  // Se pregunta con los PLANOS de cada brush y no con su caja envolvente, y no
  // es celo: el estanque grande es un contorno irregular que llena el 64 % de
  // su caja, asi que con la envolvente un tercio de la orilla habria sido agua.
  const volumenes = new Volumenes(level.manifiesto.interactivas ?? {}, {
    unidadesPorMetro: level.unitsPerMetre,
  });

  // EL CABLEADO (49): `target` y `targetname`, o sea la otra mitad de como se
  // programa un mapa de GoldSrc. La regla esta en `play/disparadores.js` y es
  // pura; el reloj se le inyecta para que dos navegadores vean lo mismo.
  //
  // `relojDisparadores` es el tiempo de juego acumulado en pasos FIJOS, no
  // `performance.now()`: el bus mide enfriamientos y retrasos de segundos, y
  // con el reloj de pared un navegador lento los vencería antes.
  let relojDisparadores = 0;
  const disparadores = new Disparadores(level.manifiesto.disparadores ?? [], {
    reloj: () => relojDisparadores,
    azar: Math.random,
  });
  // El puente entre los dos indices que se usan para nombrar una entidad: el de
  // la LISTA del cableado y el del lump del `.bsp`. El bus habla del primero y
  // las mallas del segundo, y la traduccion estaba escrita tres veces con un
  // `find` cada una. Aqui una vez.
  const busPorEntidadBsp = new Map(disparadores.entidades.map((e) => [e.entidad, e]));
  /**
   * LO QUE EL BUS PIDE Y EL MUNDO HACE.
   *
   * El módulo de reglas no puede mover a nadie ni tocar a Rapier, así que
   * devuelve una lista de efectos y esto los aplica. Los que todavía no
   * sabemos hacer **se cuentan**, no se tragan: `sinPortar` es la medida de
   * cuánto del cableado de un mapa nos falta, y sale por consola una vez.
   */
  // Y EL ASA, que es por donde el guion del jugador llega aqui (67).
  //
  // `usetrigger` dispara con `USE_TOGGLE` y con la entidad del guion como
  // activador y como llamador (`scriptcmds.cpp:7058`). El jugador es quien
  // corre ese guion, asi que el activador es el jugador.
  //
  // EL 77: `activador` se puede pasar. `NPCScript::FireTarget` dispara con **el
  // NPC** como activador y no con quien empezó la escena
  // (`FireTargets(FireEvent, pMonster, this, USE_TOGGLE, 0)`, npcact.cpp:320),
  // y eso llega a los filtros del bus (`reqhp`, `reqelsetarget`). Por omisión
  // sigue siendo el jugador, que es quien corre `usetrigger`.
  dispararDelMapa = (nombre, activador = null) => {
    const n = disparadores.disparar(String(nombre),
      { nombre: activador ?? sesion?.personaje?.nombre ?? "jugador" },
      USO.ALTERNAR, 0, null);
    aplicarDisparos(disparadores.recoger());
    // A cuántas entidades del bus ha llegado. Se devuelve desde el 76 para que
    // una sonda pueda distinguir «no llegó a nadie» de «llegó y no hizo nada»,
    // que son los dos huecos que el 69 contaba juntos.
    return n;
  };
  const sinPortar = new Map();
  /** Subir uno en `sinPortar`, que se escribía a mano en veintitantos sitios. */
  const cuenta = (mapa, clave) => mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
  /** Lo que los `ms_npcscript` han lanzado, para que una sonda lo lea (el 67). */
  const escenasDeNpc = [];
  // ── EL 77: EL DIRECTOR DE ESCENAS ─────────────────────────────────────────
  //
  // Los tipos del `ms_npcscript` que MUEVEN al NPC (0, 3 y 4) y el que le pone
  // una animación (1). El 67 portó el 2 y los otros cuatro salían contados como
  // «usar»; el 0 es el más común de los cinco en todo el juego (98 de 172).
  //
  // Las reglas y los relojes están en `src/play/escena.js`, que es puro. Aquí
  // sólo se le dan las cuatro cosas que no puede saber: qué hora es, quién es
  // cada NPC, cómo se dispara un nombre del mapa y dónde se cuenta lo que no
  // llega.
  const directorDeEscenas = new Escenas({
    reloj: () => relojDisparadores,
    // `UTIL_FindEntityByTargetname` + `FL_MONSTER` (npcact.cpp:76-79). El
    // `targetname` del mapa, que no es el nombre que se lee en pantalla: el
    // 67 tuvo que añadirlo al censo de bichos por esto mismo.
    npcPorNombre: (nombre) => {
      const m = bichos?.manada;
      const i = m?.porObjetivo?.(nombre);
      if (!i) return null;
      // El asa la construye la MANADA, no este archivo: así una prueba de Node
      // mueve a un NPC por el mismo sitio por el que lo mueve el juego. Es la
      // lección del 59 y del 63 — un asa escrita por quien prueba se prueba a
      // sí misma.
      return m.asaDeEscena(i, {
        // `CallScriptEvent(<nombre>)`, sin parámetros salvo los que el motor
        // mete (`game_movingto_dest` lleva el ángulo).
        evento: (evento, params = []) => {
          const g = interacciones.guionDe(i);
          if (!g) { cuenta(sinPortar, "escena: el NPC no tiene guion portado"); return false; }
          const contesto = Boolean(g.llamar(evento, params));
          escenasDeNpc.push({ npc: nombre, evento, contesto, de: "escena" });
          return contesto;
        },
      });
    },
    disparar: (nombre, npc) => dispararDelMapa?.(nombre, npc),
    apuntar: (motivo) => cuenta(sinPortar, motivo),
  });
  /** Las fichas que ha despertado un `MSQuery` (el 68), para poder medirlo. */
  const despertadas = [];
  /** El 69: lo que se ha roto, lo que se ha pulsado y lo que ha salido. */
  const rotos = [];
  const botonesPulsados = [];
  const objetosSueltos = [];
  let golpesARompibles = 0;
  // ── EL 71: LOS OBJETOS EN EL SUELO ──────────────────────────────────────
  //
  // La lista y su reloj son de `src/play/suelo.js`, que es puro. Aquí sólo se
  // le da el catálogo y la traza.
  //
  // El catálogo se le pasa como una VISTA y no como el `Map`, porque se carga
  // cien líneas más abajo: `catalogos.suelo` todavía es `null` en este punto y
  // pasarlo por valor dejaría el bus con un catálogo vacío para siempre. Es la
  // variante del 63 —una pieza correcta conectada tarde— y se evita diciendo
  // dónde mirar en vez de qué hay.
  const sueloDelMundo = new Suelo({
    catalogo: { get: (g) => catalogos.suelo?.get(g) ?? null },
  });
  /** Los nodos de Three, montados cuando el catálogo esté. */
  let objetosEnElSuelo = null;
  /**
   * EL 72: los que se han quedado QUIETOS SOBRE UNA ENTIDAD sin tocar suelo.
   *
   * Se apunta porque lo que define este caso es lo que NO pasa —no suena, no se
   * tumba, no vuelve a poner el reloj— y una ausencia no se mide sola.
   */
  const posadosDelSuelo = [];
  /**
   * Cada aterrizaje, con el sonido que pidió y su tono.
   *
   * Se apunta aquí y no se mide por el audio porque el audio tiene una puerta
   * delante —`despierto`, que en un navegador sin un clic del usuario es
   * falso—, y entonces «no ha sonado» no distingue «no lo pide» de «no hay
   * contexto». Es la variante del 66: cuando dos cosas apagan lo mismo, hay
   * que mirar la de antes.
   */
  const caidasDelSuelo = [];
  /** El 70: cada tramo de puerta que ha arrancado, y cada una que ha llegado arriba. */
  const puertasMovidas = [];
  const puertasAbiertas = [];
  function aplicarDisparos(salidas) {
    for (const s of salidas) {
      switch (s.tipo) {
        case "teletransportar": {
          // `tmp.z -= pOther->pev->mins.z; tmp.z++` (triggers.cpp:2461-2466):
          // el destino está a los PIES y el `origin` del jugador en el centro.
          const e = aEscenaDesdeUnidades(s.unidades);
          const alto = (s.sumaPies ? 36 : 0) + (s.sumaUno ? 1 : 0);
          player.body.setTranslation(
            { x: e[0], y: e[1] + alto / level.unitsPerMetre + player.centreOffset, z: e[2] }, true
          );
          player.vel = [0, 0, 0];
          player.caida = 0;
          // `pevToucher->angles = pentTarget->v.angles` y `fixangle`: el
          // teletransporte TE GIRA. Sin esto sales mirando a donde entraste.
          if (s.angulos) player.yaw = -((s.angulos[1] ?? 0) * Math.PI) / 180;
          break;
        }
        case "empujar": {
          // `basevelocity` si es un campo, y una suma a la velocidad si es de
          // los de una vez. Aquí las dos van a la velocidad: no tenemos
          // `basevelocity` y decirlo es mejor que fingir que sí.
          const v = s.velocidad;
          const Uu = level.unitsPerMetre;
          player.vel = [
            (player.vel?.[0] ?? 0) + v[0] / Uu,
            (player.vel?.[1] ?? 0) + v[2] / Uu,
            (player.vel?.[2] ?? 0) - v[1] / Uu,
          ];
          break;
        }
        case "mensaje":
          if (s.texto) mensajes?.cartel?.(s.texto);
          break;
        // EL 69: un `env_render` cuyo objetivo no está en el bus es un ADORNO, y
        // se cuenta aparte porque son dos huecos distintos. Cinco de los siete de
        // Edana son de éstos —los cuatro platos de sopa de la taberna y la
        // manzana del huerto—, que no son entidades del cableado.
        //
        // ── EL 73: YA SE APLICAN ────────────────────────────────────────────
        //
        // El 69 dejó escrito aquí que no se podía porque los 46 adornos van
        // fundidos en una sola malla. Eso se arregló por donde tocaba: **un
        // adorno con nombre ya no se funde** (`tools/gatecity.mjs`), así que
        // esconder uno es apagar su nodo. Lo que sigue contándose es el `render`
        // que no alcanza a NADIE, que es cosa del mapa: Edana cita
        // `renderfountainBEANS` y no existe ni como entidad ni como adorno.
        case "render":
          if (s.enElBus === false) {
            const n = adornos?.aplicarRender?.(s.nombre, s) ?? 0;
            if (n === 0) {
              sinPortar.set("render: el objetivo no existe",
                (sinPortar.get("render: el objetivo no existe") ?? 0) + 1);
            }
          } else {
            // Y éste sigue sin portar: cambiarle el aspecto a una entidad del
            // cableado —una `func_water`, en Edana— es otra pieza.
            sinPortar.set("render", (sinPortar.get("render") ?? 0) + 1);
          }
          break;
        // LOS TRES QUE SE CUENTAN Y NADA MÁS — y hasta el 69 se CAÍAN al `case`
        // de abajo.
        //
        // Estaban aquí las cuatro etiquetas sin cuerpo, pegadas a
        // `case "eventoDeNpc"`, y en JavaScript eso no es «no hagas nada»: es
        // **entrar en el cuerpo del siguiente**. Así que cada `borrar`, cada
        // `usar`, cada `render` y cada `area_ignora` corría el lanzador de escenas
        // de NPC con `s.npc` sin definir, no encontraba a nadie y se apuntaba como
        // `eventoDeNpc: sin NPC`. No daba error: daba un contador con la culpa de
        // otro. El 67 leyó ese contador y le achacó un `merc3` que no existe — y
        // ese `merc3` es de verdad, pero no estaba solo ahí.
        //
        // Lo encontró la sonda del 69 pidiendo `usar=1` y leyendo 0.
        // ── EL 78: un `killtarget` que nombra a un BICHO ──────────────────
        //
        // El motor borra todo lo que se llame asi (`UTIL_Remove`, subs.cpp:220).
        // El bus solo conoce el cableado del mapa, asi que la manada la mira
        // aqui, que es quien la tiene. No es morir: no hay cadaver ni botin ni
        // se le descuenta una vida a su area. Ver `Manada.sacarDelMundo`.
        case "borrar": {
          const bicho = s.nombre ? bichos?.manada?.porObjetivo?.(s.nombre) : null;
          if (bicho && bichos.manada.sacarDelMundo(bicho)) break;
          sinPortar.set(s.tipo, (sinPortar.get(s.tipo) ?? 0) + 1);
          break;
        }
        case "usar": case "area_ignora":
          sinPortar.set(s.tipo, (sinPortar.get(s.tipo) ?? 0) + 1);
          break;
        // ── EL 67: `ms_npcscript` tipo 2, el director de escenas ──────────
        //
        // Coge al NPC que el mapa nombra por su `targetname` y le lanza un
        // evento de su guion. Son las misiones de Edana: el libro, la sidra, las
        // pruebas del alcalde y el jabali del viejo.
        //
        // Las guardas del motor se aplican AQUI y no en el bus, porque el bus no
        // sabe quien esta vivo ni quien esta peleando (`npcact.cpp:82-131`).
        case "eventoDeNpc": {
          const quien = (bichos?.instancias ?? []).find(
            (i) => i.ficha?.objetivo === s.npc && !i.muerto);
          if (!quien) { sinPortar.set("eventoDeNpc: sin NPC", (sinPortar.get("eventoDeNpc: sin NPC") ?? 0) + 1); break; }
          // `if (!m_fStopAI && pMonster->m_hEnemy != NULL) return;` — un NPC
          // peleando no atiende una escena si el mapa no pone `stopai`.
          if (!s.paraLaIa && quien.cazador?.objetivo) {
            sinPortar.set("eventoDeNpc: peleando", (sinPortar.get("eventoDeNpc: peleando") ?? 0) + 1);
            break;
          }
          const g = interacciones.guionDe(quien);
          if (!g) { sinPortar.set("eventoDeNpc: sin guion", (sinPortar.get("eventoDeNpc: sin guion") ?? 0) + 1); break; }
          escenasDeNpc.push({ npc: s.npc, evento: s.evento, contesto: Boolean(g.llamar(s.evento)) });
          break;
        }
        // ── EL 77: LOS CUATRO TIPOS QUE NO SON EL 2 ──────────────────────
        //
        // El pedido entero viene del bus y la máquina de estados es
        // `src/play/escena.js`. Aquí sólo se traduce lo único que el bus no
        // puede traducir: el destino, que el manifiesto da en METROS de escena
        // y la manada quiere en UNIDADES. La escala se le pide A LA MANADA y no
        // a una constante importada: hay tres copias del 39,37 en este
        // proyecto (`src/bsp/lector.js:49`, `src/play/manada.js:83`,
        // `src/play/miradores.js:81`) y la que vale aquí es la que usa quien va
        // a mover al NPC. Dos escalas distintas sobre el mismo punto no dan un
        // error: dan un NPC que anda a un sitio un 19 % más lejos.
        //
        // `empezar` devuelve `null` si la escena ha arrancado o el motivo por
        // el que no, y los motivos son los `return` del motor uno a uno. Se
        // cuentan todos: un NPC muerto, uno peleando y uno que no existe son
        // tres cosas distintas y hasta el 76 eran el mismo «usar».
        case "escenaDeNpc": {
          const esc = s.escena;
          const U = bichos?.manada?.U;
          if (!U) { cuenta(sinPortar, "escena: sin manada"); break; }
          directorDeEscenas.empezar({
            i: s.entidad, nombre: s.nombre, tipo: s.escenaTipo, npc: s.npc,
            eventoDelNpc: s.eventoDelNpc,
            animDeAndar: s.animDeAndar, animDeAccion: s.animDeAccion,
            alAcabar: s.alAcabar, alCortarse: s.alCortarse,
            retrasoAlAcabar: s.retrasoAlAcabar, paraLaIa: s.paraLaIa,
            origen: Array.isArray(esc) ? esc.map((v) => v * U) : null,
            angulos: s.angulos,
          }, s.activador?.nombre ?? null);
          break;
        }
        // `MSQuery` (el 68): un nombre que el `.bsp` no conoce puede ser el de una
        // FICHA de un área, que es una entidad que el motor borra al registrarla
        // (`CMSMonster::Activate`, msmonsterserver.cpp:129) y que por eso no está
        // en el cableado. En Edana son `boar2`, `boar3` y `boarboss`: el
        // `mstrig_multi wave2` les habla por su `targetname` y nadie contestaba.
        //
        // Va en la rama de `sin_destinatario` y no antes a propósito: si el nombre
        // SÍ existe en el mapa, manda el mapa, que es lo que hace `FireTargets`.
        case "sin_destinatario": {
          if (bichos?.aparecedor?.disparar(s.nombre)) {
            despertadas.push(s.nombre);
            break;
          }
          sinPortar.set(s.tipo, (sinPortar.get(s.tipo) ?? 0) + 1);
          break;
        }
        // ── EL 69: lo que se rompe, se pulsa y se suelta ───────────────────
        //
        // `CBreakable::Die` deja de estorbar y se va (func_break.cpp:823-827). La
        // fila del bus la nombra por su indice de LISTA y `montarRompibles` por su
        // indice en el lump del `.bsp`: la traduccion es una sola linea y
        // saltarsela da otro almiar, no un error.
        case "romper": {
          const e = disparadores.entidades[s.entidad];
          const roto = e && rompibles?.romper(e.entidad);
          if (roto) rotos.push({ nombre: s.nombre, material: s.material, por: s.por });
          else sinPortar.set("romper: sin malla", (sinPortar.get("romper: sin malla") ?? 0) + 1);
          break;
        }
        case "rompible_danado":
          // Se golpea y no cae: es el estado normal de un almiar de 11 de vida al
          // primer mandoble. Se cuenta para poder medirlo.
          golpesARompibles++;
          break;
        case "boton":
          botonesPulsados.push(s.nombre ?? null);
          break;
        // `CBaseGISpawn::SpawnItem` (gispawn.cpp:35-58). El objeto que sale es un
        // `CGenericItem` del guion que diga `scriptfile`, y **hereda el
        // `targetname` del aparecedor**, no el del guion.
        //
        // ── EL 71: Y AHORA LA MANZANA CAE ─────────────────────────────────
        //
        // Hasta aquí llegaba la cadena, y aquí se paraba: el 69 y el 70 dejaron
        // los dos en este `case` la misma nota —«este port no tiene objetos en
        // el suelo»— y un contador. Ya los tiene (`src/play/suelo.js`), así que
        // el aparecedor suelta de verdad.
        //
        // Lo que NO está es el `container` (gispawn.cpp:64-83): meter el objeto
        // en la mochila de otro en vez de en el suelo. Afecta a **0 de los 4**
        // aparecedores de Edana y a 0 de 0 de Gate City, así que se cuenta.
        case "objeto_aparece": {
          objetosSueltos.push({ nombre: s.nombre, guion: s.guion, vez: s.vez });
          if (s.contenedor) {
            sinPortar.set("objeto_aparece: `container`, en una mochila",
              (sinPortar.get("objeto_aparece: `container`, en una mochila") ?? 0) + 1);
            break;
          }
          const o = sueloDelMundo.soltar({
            guion: s.guion, nombre: s.nombre,
            donde: aUnidadesDeEscena(s.unidades ?? [0, 0, 0]),
            angulos: s.angulos ?? [0, 0, 0],
          });
          if (!o) {
            // `NewGenericItem` con un `scriptfile` que no existe devuelve NULL
            // y el aparecedor no pone nada (gispawn.cpp:38-39). Es el caso de
            // `log` en Edana, y es del mapa: se cuenta, no se arregla.
            sinPortar.set(`objeto_aparece: sin guion '${s.guion}'`,
              (sinPortar.get(`objeto_aparece: sin guion '${s.guion}'`) ?? 0) + 1);
          }
          break;
        }
        // LAS PUERTAS (70). El bus decide y lleva el reloj; aqui solo se
        // cuenta y se pide el ruido. Colocarlas no es de aqui: `correderas.tic`
        // les pregunta la fraccion cada fotograma, que es una sola fuente.
        case "puerta":
          puertasMovidas.push({ nombre: s.nombre, hacia: s.hacia, clase: s.clase });
          pedidosDePuerta++;
          if (s.sonido && audio.despierto) {
            const c = correderas?.de(disparadores.entidades[s.entidad]?.entidad);
            if (c) audio.unaVez(`snd/${s.sonido}`, { donde: [c.nodo.position.x, c.nodo.position.y, c.nodo.position.z] });
          }
          break;
        case "puerta_llega":
          if (s.arriba) puertasAbiertas.push(s.nombre ?? null);
          break;
        // Una ROTATORIA disparada por el cableado. El ciclo es de
        // `src/play/puertas.js` desde el 48 —con su `Blocked`— asi que esto lo
        // unico que hace es empujarla a abrirse, que es lo que hacia el tacto.
        // Sin `desde` ni `mirando`: no la abre una persona, asi que el lado lo
        // decide la entidad (`CBaseDoor::DoorGoUp` con `m_hActivator` nulo).
        case "puerta_gira": {
          const e = disparadores.entidades[s.entidad];
          const hojas = (puertas?.puertas ?? []).filter((p) => p.ficha.nombre &&
            p.ficha.nombre === (e?.nombre ?? null));
          if (hojas.length) {
            for (const p of hojas) if (puertas.abrir(p)) puertasMovidas.push({ nombre: s.nombre, hacia: "subiendo", clase: "func_door_rotating" });
          } else {
            sinPortar.set("puerta_gira: sin hoja", (sinPortar.get("puerta_gira: sin hoja") ?? 0) + 1);
          }
          break;
        }
        case "area_reinicia": case "cambio_objetivo": case "evento":
        case "evento_gm": case "aviso":
          sinPortar.set(s.tipo, (sinPortar.get(s.tipo) ?? 0) + 1);
          break;
        default:
          sinPortar.set(s.tipo, (sinPortar.get(s.tipo) ?? 0) + 1);
          break;
      }
    }
  }
  const aEscenaDesdeUnidades = (u) => {
    const k = level.unitsPerMetre;
    return [u[0] / k, u[2] / k, -u[1] / k];
  };
  /**
   * El mismo cambio de ejes pero SIN pasar a metros — el 71.
   *
   * `src/play/suelo.js` habla en unidades del motor, como `proyectil.js`: su
   * esfera de recogida son 64 unidades y su caja 24, y esos números salen del
   * código del mod. Lo que cambia respecto al `.bsp` es el orden de los ejes,
   * no la escala.
   */
  const aUnidadesDeEscena = (u) => [u[0], u[2], -u[1]];

  /** Los disparadores que contienen el `origin` del jugador AHORA. */
  const tocandoDisparadores = (pies, agachado) => {
    // El punto es el `origin` del jugador —el centro de su caja— porque es lo
    // que prueba `SV_TouchLinks` contra el casco (world.cpp:372). A los pies
    // no: eso seria medio jugador mas abajo.
    const alto = agachado ? 18 : 36;
    const p = [pies[0], pies[1] + alto / level.unitsPerMetre, pies[2]];
    const fuera = [];
    for (const e of disparadores.entidades) {
      if (!e.vivo || !e.piezas) continue;
      const cajas = agachado && e.piezasAgachado ? e.piezasAgachado : e.piezas;
      if (!dentro(e.caja, p)) continue;
      if (cajas.some((ps) => ps.every((q) => q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] - q.d <= 0))) {
        fuera.push(e);
      }
    }
    return fuera;
  };

  // EL SONIDO. La regla en `play/sonido.js`, la reproduccion en `play/audio.js`
  // y los archivos en `build/<mapa>/snd/`, que los trae `npm run sonido` de
  // la instalacion de al lado. Nada de esto va a `public/`.
  //
  // Y el contexto NACE SUSPENDIDO: ningun navegador deja sonar sin un gesto, y
  // `resume()` solo funciona dentro del manejador del gesto. Por eso se despierta
  // en el primer clic o tecla y no al cargar. Sin esto «no suena» y no hay error.
  const audio = new Audio({ base: BASE, unidadesPorMetro: level.unitsPerMetre });
  const catalogoSonido = await audio.cargar();

  // ── LO QUE HACE «APPLY» ─────────────────────────────────────────────────
  //
  // Los nueve ajustes sin `porQueNo` de `src/play/ajustes.js`, repartidos desde
  // un solo sitio. Aquí y no en la ventana: `src/vgui2/` no sabe que hay un
  // juego debajo, igual que un `Frame` no sabe qué hay detrás.
  //
  // La gamma con la que se horneó el atlas la dice el MANIFIESTO, no una
  // constante: `npm run gatecity` la escribe al hornear, y si algún día se
  // hornea con otra, el remapeo tiene que salir de la que hay en el archivo.
  const gammaDelAtlas = {
    ...GAMMA_HORNEADA,
    gamma: level.manifiesto.luz?.gamma ?? GAMMA_HORNEADA.gamma,
    brightness: level.manifiesto.luz?.brillo ?? GAMMA_HORNEADA.brightness,
    texgamma: level.manifiesto.luz?.gammaTextura ?? GAMMA_HORNEADA.texgamma,
    overbright: level.manifiesto.luz?.overbright ?? GAMMA_HORNEADA.overbright,
  };
  let ultimaLuz = null;
  aplicarAjustes = (v = ajustesDelJugador) => {
    raton.poner({ sensibilidad: v.sensibilidad, invertido: v.ratonInvertido, filtro: v.filtro });
    audio.volumenes({ efectos: v.volumen, musica: v.volumenMp3 });
    // El cvar `name`: lo que propone la pantalla de crear personaje.
    vgui?.buscar("newchar")?.proponerNombre(v.nombre ?? "");
    // Y el mapa de luz, que es lo único que rehace el motor al mover la gamma.
    ultimaLuz = rehacerMapaDeLuz(
      atlas, gammaDelAtlas, validarGamma({ gamma: v.gamma, brillo: v.brillo }, gammaDelAtlas)
    );
    return ultimaLuz;
  };
  // Y se aplican YA, sin esperar a que nadie pulse «Apply»: los valores por
  // defecto son los del `config.cfg`, o sea los que tenía puestos quien jugaba.
  aplicarAjustes();

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

  // ── EL 89: LAS TRANSICIONES ENTRE MAPAS ─────────────────────────────────
  //
  // La regla —pisar, salir, aceptar y lo que hace el `game_master`— está en
  // `src/play/transicion.js`, con sus citas, y devuelve efectos. Esto es la
  // COSTURA: a quién le toca cada efecto. Va de una pieza y con nombre por lo
  // mismo que la reverberación de abajo: en una costura se perdieron tres cosas
  // seguidas en el 63.
  //
  // `mapaExiste` es el `$map_exists` del guion: un mapa existe «en este
  // servidor» si este puerto sabe abrirlo, o sea si está en `MAPAS_PORTADOS`.
  const transiciones = new Transiciones({ mapaExiste: (m) => MAPAS_PORTADOS.includes(m) });
  // `EnableControl(FALSE)` (msmapents.cpp:1842-1843): entre el «Traveling to» y
  // el cambio de nivel no se anda ni se ataca. Se aplica abajo, sobre la
  // intención del jugador, junto a las banderas de sentarse.
  let controlesQuitados = false;
  let viajeProgramado = null;
  const aplicarTransicion = (efectos) => {
    for (const ef of efectos) {
      if (ef.tipo === "evento") guionJugador?.llamar(ef.nombre, ef.params);
      else if (ef.tipo === "guardar") sesion?.guardar?.({ forzar: true });
      // `infomsg all`: a la ventana de arriba a la izquierda, no a la consola.
      else if (ef.tipo === "aviso") mensajes?.aviso(ef.titulo, ef.texto);
      // `UTIL_ClientPrintAll(HUD_PRINTCENTER, ...)`.
      else if (ef.tipo === "centro") mensajes?.centrar(ef.texto);
      // `messageall green` es `HUDEVENT_GREEN`, que aquí es la clave `bueno`.
      else if (ef.tipo === "mensaje") suceso(ef.color === "green" ? "bueno" : "normal", ef.texto);
      else if (ef.tipo === "bloquear") controlesQuitados = true;
      // La votación de varios jugadores NO está portada (ver transicion.js), y
      // callarla sería dejar al que pulsa esperando algo que no llega.
      else if (ef.tipo === "votacion") suceso("nopuedes", `${ef.titulo} — voting between players is not in this port yet`);
      else if (ef.tipo === "viajar" && !viajeProgramado) {
        // `callevent 5.0 delay_changelevel`: cinco segundos y se cambia de
        // nivel. En el navegador, cambiar de nivel es navegar — lo mismo que
        // hace «Start» con otro mapa, y conservando lo demás de la URL por la
        // razón del 61 (si no, te saca del servidor en silencio).
        //
        // Y se lleva al personaje: el motor reconecta CON EL MISMO, sin pasar
        // por la lista (`viaje`), y le dice dónde aparecer (`llegada`, que es
        // `m_SpawnTransition` puesto por `settrans`, scriptcmds.cpp).
        viajeProgramado = setTimeout(() => {
          const q = new URLSearchParams(location.search);
          q.set("map", ef.mapa);
          q.set("menu", "1");
          if (sesion?.personaje?.id) q.set("viaje", sesion.personaje.id);
          if (ef.llegada) q.set("llegada", ef.llegada); else q.delete("llegada");
          location.search = `?${q}`;
        }, ef.en * 1000);
      }
    }
  };

  // ── EL 82: LA REVERBERACIÓN. Los once `env_sound` de Edana ──────────────
  //
  // `env_sound` no suena: le pone al jugador su `room_type`, que es el preset
  // del DSP. El reparto —quién gana cuando dos le alcanzan— está en
  // `src/play/reverberacion.js`, citado línea a línea; el sonido, en
  // `src/play/audio.js`. Esto es la COSTURA, y la costura es donde se perdieron
  // tres cosas seguidas en el 63, así que va escrita de una pieza y con nombre.
  //
  // Gate City tiene **cero**, así que en Gate City esta lista está vacía y el
  // bucle del fotograma no entra. Es el caso del 50 y se dice.
  const fuentesDeSala = (level.manifiesto.interactivas?.reverberacion ?? []).map((r, i) => ({
    clave: i, unidades: r.unidades, radio: r.radio, tipo: r.tipo,
  }));
  let salaDelJugador = null;
  // La traza de `FEnvSoundInRange`, que es `ignore_monsters`: una pared corta la
  // reverberación y un vecino no. Se usa la malla del mundo, que es lo que el
  // `ignore_monsters` del motor deja en el rayo.
  const rayoDeSala = new THREE.Raycaster();
  const desdeSala = new THREE.Vector3();
  const haciaSala = new THREE.Vector3();
  const trazaDeSala = (origenUnidades, ojoUnidades) => {
    // De unidades de GoldSrc a metros de escena. El `.bsp` es (x, y, z) con z
    // arriba; la escena es (x, z, −y) — el mismo cambio que `aEscena`.
    desdeSala.set(origenUnidades[0] / level.unitsPerMetre, origenUnidades[2] / level.unitsPerMetre, -origenUnidades[1] / level.unitsPerMetre);
    haciaSala.set(ojoUnidades[0] / level.unitsPerMetre, ojoUnidades[2] / level.unitsPerMetre, -ojoUnidades[1] / level.unitsPerMetre);
    const d = haciaSala.clone().sub(desdeSala);
    const largo = d.length();
    if (largo < 1e-6) return { fraccion: 1, cruzaAgua: false };
    rayoDeSala.set(desdeSala, d.normalize());
    rayoDeSala.far = largo;
    const golpe = rayoDeSala.intersectObject(mundo, false)[0];
    return {
      fraccion: golpe ? golpe.distance / largo : 1,
      // `(tr.fInOpen && tr.fInWater)`: la traza cruza la superficie del agua.
      // **NO está portado** y se declara: haría falta trazar contra los
      // volúmenes de agua y no sólo contra el mundo. En Edana el `env_sound`
      // más cercano al estanque está a 452 unidades del siguiente, así que no
      // hay ningún caso medido en los mapas portados; en los 29 mapas con
      // `env_sound` no se ha contado cuántos lo tendrían.
      cruzaAgua: false,
    };
  };

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
  const carteles = await cargarCarteles(level.manifiesto, { base: BASE });
  escena.add(carteles.grupo);

  // ── EL 82: LAS COLUMNAS DE HUMO, los dos `env_beam` de Edana ────────────
  //
  // Un haz es un `.spr` estirado entre dos `info_target`, y la regla de cómo se
  // dibuja —el lado perpendicular a la vista, el fundido, la textura que corre—
  // está en `src/render/haces.js` con sus líneas del motor. Aquí sólo se monta.
  //
  // **Gate City tiene cero**, y por eso `montarHaces` devuelve `grupo: null` en
  // vez de un grupo vacío: así el cero se puede contar y decir, en vez de
  // quedarse en un bucle que recorre nada (el 69).
  const cargadorDeHaces = new THREE.TextureLoader();
  const texturasDeHaz = new Map();
  for (const h of level.manifiesto.interactivas?.haces ?? []) {
    if (!h.textura || texturasDeHaz.has(h.textura.archivo)) continue;
    try {
      const t = await cargadorDeHaces.loadAsync(`${BASE}/${h.textura.archivo}`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      texturasDeHaz.set(h.textura.archivo, t);
    } catch {
      // El `.spr` de un haz puede ser de `valve/` —`smoke.spr` lo es— y no
      // estar en esta copia. Se cuenta y no se finge.
      texturasDeHaz.set(h.textura.archivo, null);
    }
  }
  const haces = montarHaces(level.manifiesto.interactivas?.haces, {
    texturaDe: (a) => texturasDeHaz.get(a) ?? null,
    unidadesPorMetro: level.unitsPerMetre,
  });
  if (haces.grupo) escena.add(haces.grupo);

  // Los adornos: los 101 `env_model` de 17 ficheros `.mdl`, leídos de
  // `../MSC/assets/msr/models/` y extraídos a `build/`. Ver `cargarAdornos`.
  // LOS BICHOS: los 69 NPC y monstruos que el mapa coloca, con el modelo que
  // dice su `.script` y la animación que ese script nombra. Ver
  // `tools/bichos.mjs` y `src/render/bichos.js`.
  // ── EL 53: DETRÁS DEL MENÚ NO SE MONTAN ─────────────────────────────────
  //
  // Medido antes de tocar nada, con el menú delante y sin pulsar nada: **69
  // NPC montados, 33 hostiles, y 45 de los 69 moviéndose en 4 s**, hasta 3,74
  // m. O sea que arrancar el juego era ponerse a simular un pueblo entero
  // para enseñar una pantalla de menú.
  //
  // Un mapa de fondo del motor no hace eso del todo: Xash3D deja las
  // entidades vivas, pero al jugador le pone `FL_GODMODE|FL_NOTARGET`
  // —«don't attack player in background mode», server/sv_client.c:1422-1423—
  // y lo congela (`sv_background_freeze`, server/sv_main.c:111). Aquí no hay
  // jugador a quien proteger mientras el menú está delante, así que en vez de
  // marcarlo intocable **no se monta a nadie**: sale más barato y no deja 33
  // hostiles buscando camino contra un cuerpo que no se puede mover.
  //
  // La diferencia con el motor está declarada en `src/play/fondomenu.js`,
  // `LO_QUE_NO_SE_MONTA`, con la línea de cada cosa.
  //
  // **Esto es una función y no un bloque** porque «Start» tiene que poder
  // llamarla después. El caso que se olvida no es cambiar de mapa —ése recarga
  // desde el 50 y vuelve a pasar por aquí— sino elegir EL MISMO mapa que el
  // del fondo: hoy eso funciona por accidente, porque ya está todo montado.
  say("setting up the monsters…");
  let bichos = null;
  // El manifiesto se guarda, no sólo se consume: desde el 19 trae la tabla de
  // razas entera, que es lo que hace falta para saber a quién avisa un bicho al
  // morir — «aliado» es una relación entre DOS bichos, no con el jugador.
  let censoDeBichos = null;
  // LA TABLA DE RAZAS se crea AQUÍ, vacía, y la llena `montarLosBichos` (92).
  // Antes se construía 2 000 líneas más abajo leyendo `censoDeBichos` en ese
  // instante, y entrando por el menú (el 53) los bichos se montan después, desde
  // «Start»: la tabla nacía vacía para siempre, `sonAliados` decía «no» a todo y
  // un goblin no avisaba a nadie al morir. `sonAliados` la lee por referencia.
  const tablaDeRazas = new Map();
  let bichosSolidos = null;
  /** Monta los bichos si no lo están ya. Llamarla dos veces no los duplica. */
  async function montarLosBichos() {
    if (bichos) return false;
    try {
      const censo = await traerJson(ruta("bichos.json"));
      censoDeBichos = censo;
      for (const [clave, r] of censo?.razas ?? []) tablaDeRazas.set(clave, r);
      bichos = censo ? await cargarBichos(censo, { base: BASE }) : null;
      if (bichos) escena.add(bichos.grupo);
    } catch (e) {
      console.warn("los bichos no se han podido montar:", e);
      return false;
    }
    if (!bichos) return false;
    // Los cilindros de colisión van con ellos: montarlos sin cuerpo deja
    // monstruos que se atraviesan, que es peor que no tenerlos.
    bichosSolidos = solidosDeBichos(bichos, world.world, RAPIER, {
      unidadesPorMetro: level.unitsPerMetre,
    });
    for (const i of bichos.manada?.instancias ?? []) i.conCilindro = !i.dormido;
    // Y SE DICE DE DÓNDE SALIÓ EL TAMAÑO (80): del `setsize` de su guion, que es
    // lo que usa `UTIL_SetSize`. Los dos casos raros se cuentan en voz alta —
    // `gertenheld_forest2` tiene cinco bichos sin `setsize` y Gate City y Edana
    // ninguno, así que es otro hueco que sólo enseña el tercer mapa.
    const deLaMalla = bichosSolidos?.medidosDeLaMalla ?? [];
    const sinNada = bichosSolidos?.sinTamano ?? [];
    console.info(
      `colision: ${bichosSolidos?.n ?? 0} bichos de ${bichosSolidos?.deCuantos ?? 0}` +
      ` (tamaño del guion; ${deLaMalla.length} medidos de la malla por no traer \`setsize\`` +
      `${sinNada.length ? `, ${sinNada.length} SIN colisionador: ${[...new Set(sinNada)].join(", ")}` : ""})`
    );
    return true;
  }
  // Con `?map=` se entra directo al juego —es `hl.exe +map <mapa>`— así que la
  // partida se monta ya. Por el menú no: eso lo hace «Start».
  if (!entrarPorElMenu) await montarLosBichos();
  else say("main menu: the map is a backdrop, not a game");

  // Los ADORNOS QUE SE MUEVEN van por el mismo camino que los bichos, porque
  // son lo mismo: una malla con esqueleto y una animacion en bucle. Son 10 de
  // 101 —el arbol, el farol y las velas—; las otras 91 no mueven ni un vertice
  // y siguen fundidas en una sola malla. Ver `recorridoDeModelo()`.
  let adornosVivos = null;
  try {
    const censo = await traerJson(ruta("adornosvivos.json"));
    adornosVivos = censo ? await cargarBichos(censo, { base: BASE }) : null;
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
      // EL 96: `armaDe` lee el catálogo de armas, que se carga más abajo; por
      // eso va como función y no como valor (se llama ya en el bucle).
      otros = await cargarOtros({ U: level.unitsPerMetre, armaDe: (id) => catalogos.armas?.get(id) ?? null });
      if (otros) escena.add(otros.grupo);
    } catch (e) {
      console.warn("los otros jugadores no se han podido montar:", e);
    }
    red.cuerpo = player;
    // EL 99: `v` es `{maxima, tope}`, la velocidad con que el bucle corrió esta
    // orden la primera vez (la apunta `red.apuntar`, más abajo). Hasta el 99
    // esto leía `o.maxima`, que ninguna orden trae, y rehacía con el 160 del
    // perfil: con servidor, cada corrección frenaba a quien anda más y la
    // siguiente foto volvía a corregir. Ver `ClienteDeRed._correr`.
    red.simular = (cuerpo, o, v = null) => {
      const pies = cuerpo.feet;
      cuerpo.yaw = o.yaw;
      cuerpo.pitch = o.cabeceo;
      // EL 100: la orden rehecha también pasa por `PM_CheckStuck`, como en el
      // motor, donde el cliente corre `PM_Move` entero en cada orden que predice.
      (cuerpo === player ? pasoLocal : cuerpo).step(o.msec / 1000, {
        forward: o.adelante, strafe: o.lado,
        jump: (o.botones & BOTON.SALTAR) !== 0,
        agachar: (o.botones & BOTON.AGACHAR) !== 0,
        maxima: v?.maxima ?? undefined,
        // EL 98: el tope de las trabas (`pmove->maxspeed`). EL 99: el que tenía
        // la orden; sin apuntar, el último sabido.
        tope: v?.tope ?? velocidadConTrabas(0, ultimasTrabas?.porcentaje ?? 0).tope,
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
  // EL 53: los cilindros de los bichos se montan CON los bichos, en
  // `montarLosBichos()`, porque desde aquí ya no se sabe si los hay — entrando
  // por el menú no los hay todavía. Los adornos sí son del escenario y van
  // siempre: un helecho no es una partida.
  //
  // `solidosDeBichos` ya se salta a los que nacen dormidos; se apunta para poder
  // cuadrarlo luego sin recorrer la lista de colisionadores en cada fotograma.
  // `bichos` es null en un mapa sin `bichos.json` —Edana lo fue hasta el 50— y
  // ahora también mientras el menú está delante. Sin esa guarda, un mapa nuevo
  // arranca del todo y muere aquí con «Cannot read properties of null».
  if (solidos) {
    console.info(
      `colision: ${solidos.n ?? 0} adornos de ${solidos.deCuantos ?? 0} ` +
      `(${solidos.atravesables ?? 0} se atraviesan, como en el juego)`
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
  // DONDE apareces no es una constante: sale de `build/<mapa>/aparicion.json`,
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
    // ── EL GUION DEL JUGADOR SE MONTA AL APARECER ────────────────────────
    //
    // Antes no hay personaje, y el guion lo necesita: los consejos ya vistos
    // viven en él —`m_ViewedHelpTips`, que se guarda con el personaje— y sin
    // ellos «la primera vez que mueres» sería la primera de esta partida y no
    // la de este personaje. Se monta una vez; reaparecer no lo rehace, porque
    // en el motor tampoco se recarga el script al respawnear.
    sesion.al("aparece", () => {
      if (guionJugador || !fichaDelJugador || !sesion?.personaje) return;
      guionJugador = new GuionDelJugador({
        ficha: fichaDelJugador,
        personaje: sesion.personaje,
        ahora: () => reloj,
        // EL 83: `game.map.name`, o sea `MSGlobals::MapName` (script.cpp:4612).
        // Esta línea es la que hace que el gancho no viva a `null` en todas
        // las partidas, que es el 63. Sin ella el guion del jugador compara el
        // mapa contra la cadena «game.map.name» y la guarda que impide que
        // Edana regale el bono de los 10 000 del gauntlet no se cumple.
        mapa: () => MAPA,
        // `game.players` (el 89): uno, más los demás si hay servidor.
        jugadores: () => (red ? 1 + (red.ajenos?.size ?? 0) : 1),
        // `infomsg` del guion del jugador (el 89): a la misma ventana que el de
        // los NPC. Antes no llegaba a ningún sitio.
        aviso: (titulo, texto) => mensajes?.aviso(titulo, texto),
        // ── EL 89c: lo que el guion le cambia al jugador ──────────────────
        // `drainstamina`: el aguante vive en `fatiga`, no en el personaje. La
        // regla (restar, tope en [0, máximo]) está en el entorno del jugador;
        // aquí sólo se le da dónde leer y escribir.
        aguante: {
          leer: () => fatiga.aguante,
          poner: (v) => { fatiga.aguante = v; },
          maximo: () => vitalesDelPersonaje().aguanteMax,
        },
        // `setvelocity`/`addvelocity`/`setorigin` sobre el jugador. Llegan en
        // UNIDADES y ejes del motor. `player.vel` ya va en unidades por segundo
        // (ver `velocidadParaLosPasos`): sólo se cambian los ejes, no la escala.
        // Y el `origin` del motor es el CENTRO de la caja (36 sobre los pies de
        // pie, `tocandoDisparadores`), y `colocar` quiere los pies en metros.
        fisica: {
          empujar: (v, sumar) => {
            const e = [v[0], v[2], -v[1]];
            player.vel = sumar ? player.vel.map((x, i) => x + e[i]) : e;
          },
          colocar: (v) => {
            const e = aEscenaDesdeUnidades(v);
            player.colocar([e[0], e[1] - 36 / level.unitsPerMetre, e[2]]);
          },
          // EL 95: lo que piden `effect screenshake` (`FL_ONGROUND` y el
          // radio, util.cpp:1079-1093), `$relpos` y `$get(ent_me,origin)`.
          // El `origin` es el centro de la caja, 36 sobre los pies (agachado
          // serían 18 y no se distingue, como en `npcguion.js`). Los ángulos,
          // `pev->angles` de un jugador: un tercio del cabeceo con el signo
          // cambiado (sv_pmove.c:655) — y aquí el cabeceo de Three ya va al
          // revés que el del motor, así que queda en positivo.
          origen: () => {
            const k = level.unitsPerMetre, f = player.feet;
            return [f[0] * k + 0, -f[2] * k + 0, f[1] * k + 36];
          },
          enSuelo: () => Boolean(player.grounded),
          angulos: () => [(player.pitch * 180) / Math.PI / 3, (-player.yaw * 180) / Math.PI, 0],
        },
        // Oro, objetos o habilidades tocados desde el guion: se guarda, y si
        // cambió la mochila se remontan los guiones de objeto (el 66).
        cambio: (que) => {
          sesion?.tocado?.();
          if (que === "objetos") sincronizarObjetos();
        },
        // Los máximos van inyectados: no se guardan, se derivan (el 66).
        maximos: () => maximosDelPersonaje(),
        // Los guiones de efecto: el jugador es su anfitrión (`src/play/efectos.js`).
        efectos: tablaDeEfectos,
        // EL 91: EL DAÑO DE UN EFECTO —el veneno de `effects/base_dot`— entra
        // por el MISMO `golpear` que el mordisco de un bicho: escudo, parry,
        // «X hits you: …», `game_damaged` y restar la vida. El bicho es el
        // atacante del efecto (`aplicadorDeBicho`, efectos.js); si el efecto
        // lo puso otra cosa, sólo se sabe su nombre. Va por el asa de módulo:
        // `arnesDePaseo` se define más abajo, y esto se llama jugando.
        herir: (g) => arnesDePaseo.golpear(
          g.atacante?.instancia ?? { ficha: { nombre: g.atacante?.nombre ?? "none", ia: {} } },
          "jugador", g.dano, g.tipo ?? ""),
        // EL 93: `effect screenfade`, `hud.addstatusicon`… de sus efectos (el
        // veneno) y de su guion. Al mismo sitio que lo que llega del servidor
        // por `MENSAJE.PANTALLA`, con la misma forma (`src/play/efectospantalla.js`).
        // EL 95: y el temblor, que no es del velo sino de la CÁMARA: va al
        // `clgame.shake` (`CL_ParseScreenShake`), con el reloj de todo lo demás.
        pantalla: (p) => (p.tipo === "temblor" ? temblorAlLlegar(temblor, p.mensaje, reloj)
          : mensajes?.pantalla(p.tipo === "brillo" ? { que: "brillo", ...p.brillo } : { que: p.tipo, ...p.mensaje })),
        suceso: (tipo, texto) => suceso(tipo, texto),
        // `usetrigger` (67): la unica puerta del jugador hacia el `.bsp`. Va por
        // el asa de modulo, no por la variable local del armado del mundo: un
        // `?.()` NO protege de un `ReferenceError`, y eso costo dos sondas en
        // el 66.
        usarDisparador: (nombre) => dispararDelMapa?.(nombre),
        // Y AQUÍ SE ABRE LA VENTANA QUE LLEVABA DESDE EL 60 SIN QUE NADIE LA
        // ABRIERA. La pila de ayuda —arriba a la derecha, título verde— estaba
        // portada y su único usuario era `window.probe`.
        consejo: ({ titulo, lineas }) => mensajes?.ayuda(titulo, lineas.join("\n")),
        // `givehp`/`givemp`: la regeneración. El tope es el del personaje, que
        // es quien sabe cuánto cabe.
        //
        // Y OJO CON EL TOPE, que no es un `max` (comprobado en el 66):
        //
        //     float AddAmount = V_min(Max - *Current, Amt);   //Max amount that can be added
        //     AddAmount = V_max(-*Current, AddAmount);        //Max health that can be taken
        //     *Current += AddAmount;
        //                                            msmonsterserver.cpp:1971-1999
        //
        // `V_min(Max - Current, Amt)` sale NEGATIVO cuando ya estás por encima
        // del máximo, así que en Master Sword curar a alguien pasado de vida
        // **se la baja al tope**. `Math.min` hace lo mismo, y por eso se queda:
        // lo cazó la sonda del 66, que herían por encima del máximo y veía la
        // vida bajar. El juego estaba bien y la sonda mal.
        dar: (que, cuanto) => {
          const p = sesion?.personaje;
          if (!p || !(cuanto > 0)) return;
          const d = derivadas(atributosDe(p.habilidades));
          if (que === "vida") p.vida = Math.min(d.vidaMax, (p.vida ?? 0) + cuanto);
          else p.mana = Math.min(d.manaMax, (p.mana ?? 0) + cuanto);
          sesion.tocado?.();
        },
      });
      // ── Y LOS GUIONES DE SUS OBJETOS (66) ────────────────────────────────
      //
      // Es lo que el motor hace al cargar un personaje: por CADA objeto que
      // lleva, `game_spawn`, `game_deploy` y `game_wear`
      // (playershared.cpp:1524-1544). Va detrás del guion del jugador a
      // propósito: un objeto le habla a su dueño en cuanto arranca
      // —`callexternal ent_owner …`— y sin dueño montado esa llamada se perdería.
      sincronizarObjetosVivos();
      // ── Y AHORA EL MAPA SE ENCIENDE (67) ─────────────────────────────────
      //
      //     CallScriptEvent("game_player_putinworld");   player.cpp:2771
      //
      // Va DESPUES de los objetos porque el guion encadena
      // `callevent 1.0 activate_stuff` -> `callexternal all ext_activate_items`,
      // y eso le habla a objetos que tienen que estar montados.
      //
      // Lo que esto suelta de verdad: `activate_stuff` hace `usetrigger
      // player_joined`, y en Edana eso llena la taberna (11 parroquianos
      // sentados detras de `patron1..patron12`). Un segundo de retraso, que es
      // el del `callevent 1.0` y lo mueve `guionJugador.paso()`.
      guionJugador.llamar(EVENTOS_DEL_JUGADOR.ENTRA, []);
    });

    /**
     * Monta y desmonta los guiones de los objetos que el personaje lleva (66).
     *
     * Se llama al aparecer y cada vez que la mochila cambia —comprar, vender—
     * porque en el motor un objeto que entra en el inventario **es una entidad
     * nueva** y corre su `game_spawn`. La clave es el `uid` cuando lo hay: dos
     * pociones iguales son dos entidades con su propio estado.
     */
    /**
     * Los máximos de vida y maná del personaje, DERIVADOS (66).
     *
     * En Master Sword no se guardan: salen de las nueve habilidades cada vez
     * (`GetStat`, msmonstershared.cpp:514). Está en una función y no repetido en
     * los dos sitios que lo piden —el guion del jugador y los de sus objetos—
     * porque con dos copias una podría quedarse con `personaje.vidaMax`, que el
     * juego no pone, y entonces toda guarda «estoy herido» sería falsa sin dar
     * un error. Es exactamente lo que pasaba antes de medirlo.
     */
    const maximosDelPersonaje = () => {
      const p = sesion?.personaje;
      if (!p) return { vida: 0, mana: 0 };
      const d = derivadas(atributosDe(p.habilidades));
      return { vida: d.vidaMax, mana: d.manaMax };
    };

    sincronizarObjetos = sincronizarObjetosVivos;
    function sincronizarObjetosVivos() {
      if (!guionesDeObjeto || !guionJugador) return 0;
      const p = sesion?.personaje;
      if (!p) return 0;
      const vistos = new Set();
      let nuevos = 0;
      // EL 97: `loQueLleva` y no `objetos`: desde la versión 2 del registro lo
      // de las manos no está en la lista, y en el motor también tiene guion
      // (todo el `Gear`, playershared.cpp:1524-1544). La clave es la misma en
      // la mano y en la mochila, así que moverlo NO lo vuelve a nacer.
      for (const o of loQueLleva(p)) {
        const clave = String(o.uid ?? o.id);
        vistos.add(clave);
        if (objetosVivos.has(clave)) continue;
        if (!guionesDeObjeto.tiene(o.id)) continue;   // no horneado: se juega igual
        const ent = new GuionDeObjeto({
          guiones: guionesDeObjeto,
          id: o.id,
          jugador: guionJugador,
          ahora: () => reloj,
          suceso: (tipo, texto) => suceso(tipo, texto),
          maximos: () => maximosDelPersonaje(),
          // `createnpc` y compañía: lo que el objeto le pide al mundo.
          mundo: mundoDeObjetos,
        });
        // `char_menu` cuando ya estaba en la mochila al aparecer y
        // `CGenericItem::WearItem` cuando llega jugando: el guion mira ese
        // tercer parámetro, así que no es adorno.
        ent.arrancar({
          genero: p.genero === "female" ? "female" : "male",
          quien: objetosVivos.size === 0 && !sesion?.jugando ? QUIEN_VISTE.CARGA : QUIEN_VISTE.JUGANDO,
          // EL 96: una armadura en la mochila no se viste al cargar, y la que
          // está puesta llega puesta (`src/play/armadura.js`).
          viste: seVisteAlCargar(fichaDeObjeto(o.id), o),
          puesto: Boolean(o.puesto),
        });
        objetosVivos.set(clave, ent);
        nuevos++;
      }
      // Lo que ya no lleva se va. En el motor el objeto se destruye, así que sus
      // bucles paran; dejarlo aquí sería un hechizo curando desde el limbo.
      for (const clave of [...objetosVivos.keys()]) {
        if (!vistos.has(clave)) objetosVivos.delete(clave);
      }
      return nuevos;
    }

    /**
     * EL 96: PONERSE UNA PIEZA. `CGenericItem::WearItem` (genericitem.cpp:
     * 1123-1145) con `CanWearItem` delante; la regla entera está en
     * `src/play/armadura.js`. El mensaje de «no cabe» es un `SendInfoMsg`, que
     * va a la consola de sucesos (src/play/aviso.js).
     *
     * Hoy NO lo llama ningún botón: en Master Sword te la pones usándola
     * desde la mano (`UseItem`, genericitem.cpp:972-994) y el panel del
     * inventario de este puerto todavía no mueve objetos. Lo llama la sonda
     * por `probe.armadura.vestir` — está dicho en doc/ARMADURA_96.md.
     */
    vestirObjeto = (id) => {
      const p = sesion?.personaje;
      if (!p) return { puesto: false, mensaje: null, porque: "no-character" };
      const entrada = (p.objetos ?? []).find((o) => (o.uid ?? o.id) === id || o.id === id) ?? null;
      if (!entrada) return { puesto: false, mensaje: null, porque: "not-carried" };
      sincronizarObjetosVivos();
      const r = vestir({
        entrada,
        ficha: fichaDeObjeto(entrada.id),
        objeto: objetosVivos.get(String(entrada.uid ?? entrada.id)) ?? null,
        puestas: fichasPuestas(p.objetos, fichaDeObjeto),
        raza: "human",
        genero: p.genero,
      });
      if (r.mensaje) suceso("normal", r.mensaje.trimEnd());
      if (r.puesto) sesion.tocado?.();
      return r;
    };

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
      fatiga.corriendo = false;
      fatiga.aguante = vitalesDelPersonaje().aguanteMax;
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
      // ── Y LA PRESENTACIÓN DEL MAPA, que llega más tarde ─────────────────
      //
      // `game_player_putinworld` → `give_map_intro` (10 s) → `give_map_diff`
      // (3 s más). La regla entera, con sus líneas, en `src/play/intro.js`.
      //
      // Los diez segundos no son un adorno: el juego te deja andar y te lo
      // dice cuando ya estás dentro. Ponerlo al entrar sería otro juego.
      if (fichaDelMapa && !yaSePresento) {
        yaSePresento = true;
        const vidaMaxima = derivadas(atributosDe(sesion.personaje.habilidades)).vidaMax;
        for (const aviso of presentacion(fichaDelMapa, vidaMaxima)) {
          // ── Y VAN A LA VENTANA, no a la consola (60) ──────────────────
          //
          // Hasta el 60 los tres se juntaban con un guion y se imprimían abajo
          // a la derecha, entre los golpes. `infomsg` no es eso: su propio
          // comentario dice «Creates a pop-up with red title text on the
          // player's HUD» (scriptcmds.cpp:4055-4057) y acaba en `SendHUDMsg`,
          // que la cabecera del jugador remata con «HUD message - top left»
          // (player.h:554). Son título y texto porque van en un recuadro.
          //
          // Y con eso desaparece lo único que este puerto decidía aquí: el
          // «WARNING» ya no necesita un tipo de suceso que lo pinte de rojo,
          // porque en la ventana **el título es rojo siempre**.
          //
          // Nadie cancela estos relojes, y es correcto: la única salida de la
          // partida es el menú, que en este puerto deja el juego corriendo
          // detrás (experimento 38). El día que se pueda cambiar de mapa habrá
          // que pararlos, y entonces `yaSePresento` también tendrá que volver
          // a false.
          setTimeout(() => mensajes?.aviso(aviso.titulo, aviso.texto),
            aviso.cuando * 1000);
        }
      }
    });
    // ── MORIR, lo que se ve ──────────────────────────────────────────────
    //
    // Las cuatro cosas de `CBasePlayer::Killed`, en su orden (player.cpp:578,
    // 741, 755 y 799) más la quinta del guion. El puntero NO se suelta: en el
    // juego sigues mirando por una cámara y no hay nada que pulsar. Lo soltaba
    // el panel inventado, que se ha retirado — ver `src/juego/interfaz.js`.
    sesion.al("muerte", ({ anuncio, impuesto = 0, tipo = "monstruo" }) => {
      // 1. `UTIL_ClientPrintAll(HUD_PRINTCENTER, "%s has fallen!")`, y el «All»
      //    del nombre no es decorativo: lo ven todos. Aquí sólo hay uno.
      mensajes?.centrar(anuncio);
      // 2. El velo rojo a medias.
      mensajes?.desvanecer(DESVANECIDO);
      // 3. El grito, que sale del guion y depende del género.
      const grito = sonidoDeMuerte(sesion.personaje?.genero ?? "male");
      if (audio.despierto) audio.unaVez(`snd/${grito}`);
      // 4. El cadáver, ANTES que la cámara: el motor también lo crea primero
      //    (`CreateCorpse`, player.cpp:797) y luego apunta. Va con la animación
      //    que llevabas puesta, que es lo que `CreateCorpse` copia — o sea que
      //    se queda DE PIE. Ver `src/render/cadaver.js`.
      cadaver?.poner(player.feet, player.yaw, player.rapidez > 10 ? "run" : "attention");
      // 6. Y EL GUION DEL JUGADOR, que es la quinta cosa del original y no se
      //    parece a las otras cuatro: `help/first_death.script` enseña el
      //    consejo de la muerte —una sola vez por personaje— y avisa si lo que
      //    te mató tenía diez veces tu vida.
      guionJugador?.llamar("game_death", []);
      // EL 85: y morir sentado te devuelve la vista a la altura de pie, que es lo
      // que hace el `game_death` del efecto (`:160-164`). Sin esto la cámara de
      // la muerte heredaría los 28 de hundimiento, y como se calcula UNA vez
      // —la línea de abajo— se quedaría así hasta reaparecer.
      emociones.muere();
      // 5. La cámara, calculada UNA vez y con la traza del mundo: el motor
      //    tampoco la mueve después, es una entidad quieta.
      camaraMuerte = camaraDeMuerte({
        origen: player.eye, yaw: player.yaw, U: level.unitsPerMetre,
        trazar: (desde, hasta) => {
          const d = [hasta[0] - desde[0], hasta[1] - desde[1], hasta[2] - desde[2]];
          const largo = Math.hypot(d[0], d[1], d[2]);
          if (!(largo > 0)) return { fraccion: 1 };
          const h = world.world.castRay(
            new RAPIER.Ray({ x: desde[0], y: desde[1], z: desde[2] },
              { x: d[0] / largo, y: d[1] / largo, z: d[2] / largo }),
            largo, true, undefined, undefined, undefined, player.body,
          );
          if (!h) return { fraccion: 1 };
          const f = h.timeOfImpact / largo;
          return { fraccion: f, punto: [desde[0] + d[0] * f, desde[1] + d[1] * f, desde[2] + d[2] * f] };
        },
      });
      // Y el impuesto, por donde lo dice el motor: la consola de sucesos en
      // rojo. `SendEventMsg(HUDEVENT_UNABLE, "Death Penalty: Lost %i gp \n")`,
      // player.cpp:678. Con menos de 100 monedas el `int` lo deja en cero y el
      // motor manda el mensaje igual, diciendo que has perdido 0.
      if (tipo === "monstruo") suceso("nopuedes", `Death Penalty: Lost ${impuesto} gp`);
    });
    // Y al volver se limpia todo de golpe, que es lo que hace `respawn()`.
    // EL 94: y el rojo se va por donde se va en el motor, con el fundido de
    // alfa 0 que manda `Spawn` (player.cpp:2784) y que pisa el `clgame.fade`.
    sesion.al("aparece", () => {
      camaraMuerte = null; mensajes?.limpiar(); cadaver?.quitar();
      mensajes?.desvanecer(AL_REAPARECER);
      golpeDeVista = [0, 0, 0];
    });
    // EL 94. Cada golpe que te entra tiñe la pantalla y te mueve la vista:
    // `CBasePlayer::TakeDamageEffect`, player.cpp:537-550. El suceso `dano` sale
    // ANTES de `matar` (sesion.js), que es el orden del motor: `TakeDamageEffect`
    // es la primera línea de `CMSMonster::TakeDamage` (msmonsterserver.cpp:2369)
    // y `Killed` viene después, así que el golpe mortal tiñe y la muerte lo pisa.
    // `pedido` es `flDamage`, el daño entero, no el que cabía en tu vida.
    sesion.al("dano", ({ cantidad, pedido = cantidad }) => {
      const e = efectoDelGolpe(pedido, sesion.limites?.vidaMax);
      if (!e) return;
      if (e.fundido) mensajes?.desvanecer(e.fundido);
      golpeDeVista = golpeDeVista.map((v, k) => v + e.golpe[k]);
    });
  }

  say("setting up the props…");
  const adornos = await cargarAdornos(level, atlas, {
    base: BASE,
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
    const m = await traerJson(rutaComun("hud.json"));
    if (m) fichaDelHud = { ...m, base: `${BASE_COMUN}/` };
  } catch (e) {
    console.warn("el HUD no está horneado (`npm run hud`):", e);
  }
  hudMs = montarHud({ ficha: fichaDelHud });

  // ── LA VENTANA DE CHAT ────────────────────────────────────────────────────
  //
  // Va aquí al lado porque en el mod son el mismo panel: las dos consolas son
  // `VGUI_EventConsole` y las dos cuelgan de `CHUDPanel` (vgui_hud.cpp:188-197).
  // Aquí son dos módulos porque la del chat necesita la red y la de sucesos no.
  //
  // `alDecir` es la única línea que las une: lo escrito se MANDA, no se pinta.
  // Quién lo oye y con qué nombre sale lo decide el servidor, y en una partida
  // de uno el servidor somos nosotros — por eso el caso sin red no pinta la
  // frase a mano, sino que pasa por la misma `hablar()` que corre allí.
  chatMs = montarChat({
    alDecir: (tipo, texto) => {
      if (red?.dentro) { red.decir(tipo, texto); return; }
      const dicho = hablar({
        nombre: sesion?.personaje?.nombre ?? "You",
        texto, tipo,
        oyentes: [{ id: "yo", pies: [0, 0, 0] }], quienHabla: "yo", pies: [0, 0, 0],
      });
      if (dicho) chatMs.recibir(dicho.tipo, dicho.texto);
      // ── Y LOS NPC OYEN — experimento 79 ──────────────────────────────
      //
      // El mismo bucle del motor: `CMSMonster::Speak` recorre jugadores Y
      // monstruos, y hasta aquí este puerto sólo había portado la mitad de
      // jugadores. Sin esta línea, `catchspeech` sigue mudo en la partida de
      // uno aunque esté puesto en el servidor — y la partida de uno es por
      // donde entra la sonda.
      //
      // Sólo el canal LOCAL, que es la guarda del mod y no «estar en rango»:
      // un grito global no lo contesta un NPC.
      if (tipo === HABLA.LOCAL) interacciones?.hablaElJugador?.(texto, { yaDicho: true });
    },
  });
  // Lo que llega de los demás. Sin filtrar: si ha llegado, es que lo oyes.
  red?.al("texto", (m) => chatMs?.recibir(m.tipo, m.texto));

  // ── LO QUE SE ESCRIBE ENCIMA ──────────────────────────────────────────────
  //
  // El velo de morir, el centrado y los carteles de subir de nivel. No necesita
  // ningún horneado, así que se monta siempre.
  // `base`: los iconos de estado del 93 son PNG horneados (`npm run hud`).
  mensajes = montarMensajes({ base: `${BASE_COMUN}/` });

  // Y LA LLUVIA DE COLORES. La bengala sí necesita horneado —`npm run
  // efectos`—, y si no está se monta con la nuestra, que tiene un cuadro.
  chispas = montarChispas({ U: level.unitsPerMetre, bengala: await cargarBengala({ base: BASE_COMUN }) });
  escena.add(chispas.grupo);

  // Y TU CADÁVER. Si `npm run cuerpo` no se ha corrido no hay modelo y esto
  // devuelve `null`: la cámara se aparta igual y mira un sitio vacío, que es
  // peor que con cuerpo pero mejor que no poder morirse.
  try {
    cadaver = await cargarCadaver({ U: level.unitsPerMetre });
    if (cadaver) escena.add(cadaver.grupo);
  } catch (e) {
    console.warn("el cadáver no se ha podido montar:", e);
  }

  // ── EL MENÚ PRINCIPAL ─────────────────────────────────────────────────────
  //
  // `gamemenu.res` con el fondo de la torre, que hornea `npm run menu`. Igual
  // que el HUD: si no está horneado se monta sin fondo y sin sonidos, porque lo
  // que hay detrás —cambiar las teclas— hace falta justo cuando algo falla.
  let fichaDelMenu = null;
  try {
    const m = await traerJson(rutaComun("menu.json"));
    if (m) fichaDelMenu = { ...m, base: `${BASE_COMUN}/` };
  } catch (e) {
    console.warn("el menú no está horneado (`npm run menu`):", e);
  }
  // ── EL FONDO VIVO DEL MENÚ (52) ───────────────────────────────────────────
  //
  // El mapa dibujándose detrás de una capa transparente, con la cámara dando una
  // vuelta lenta por el pueblo. La maquinaria está en `src/play/miradores.js`,
  // con 20 pruebas de Node, y los dos miradores de Gate City se eligieron
  // MIRANDO, con `npm run sonda:miradores52`.
  //
  // Sale casi gratis, por una casualidad que conviene decir en voz alta en vez
  // de presumir de ella: el menú se monta AQUÍ, después de `cargarNivel`, y el
  // bucle de fotograma lleva dibujando `escena` con `camera` desde antes. Hasta
  // el 51 Gate City se dibujaba entera **detrás de una pintura opaca**. Esto no
  // añade una carga: quita una tapa.
  //
  // ── LO QUE FALTA, Y QUE NO ES DE ESTE ARCHIVO TODAVÍA ─────────────────────
  //
  // Mientras el 52 se construía, la sesión del 50 midió qué hay de verdad detrás
  // del menú principal, y no es un fondo:
  //
  //     mapa       gatecity, 41 494 triangulos, 299 texturas
  //     dibujado   145 070 triangulos por fotograma en 636 llamadas
  //     NPC        69 montados, 33 hostiles; 45 se movieron en 4 s
  //     jugador    existe, con posición
  //
  // O sea que arrancar el juego **es entrar a Gate City con su simulación en
  // marcha**, con 33 monstruos cazando detrás de la pantalla del menú, antes de
  // que nadie pulse nada. Y eso no es GoldSrc: `Host_Init` sólo hace
  // `exec valve.rc` (rehlds/engine/host.cpp:1206), el único camino a `Host_Map`
  // es el comando `map` (host_cmd.cpp:3238), y el menú del original son doce
  // losetas TGA colocadas por `resource/BackgroundLayout.txt`. No es un mapa.
  //
  // Puesto así, el usuario eligió: **un fondo de menú es una ESCENA, no una
  // SESIÓN**. Geometría, luz y esta cámara sí; los 69 NPC, la física del
  // jugador y la sesión no — ésos empiezan cuando se pulsa «Start».
  //
  // ESA MITAD TODAVÍA NO ESTÁ HECHA. El fondo vivo que se enciende aquí abajo
  // funciona, pero de momento se dibuja sobre la partida fantasma que el 50
  // midió: la cámara pasea por un pueblo con 33 hostiles cazando. Enseñarlo no
  // lo empeora —ya estaba pasando, sólo que tapado por la pintura—, pero **no
  // se puede contar como hecho**, y por eso queda escrito aquí y en
  // `doc/MENU_52.md` en vez de darse por bueno.
  //
  // Lo que queda, en orden: que esto cargue la escena sin arrancar la
  // simulación, que el mapa del fondo salga de la constante declarada de
  // `src/play/fondomenu.js` y no de `MAPA_POR_DEFECTO`, y que «Start» monte los
  // bichos, el jugador y la sesión — incluido el caso que hoy se resuelve solo
  // porque ya está todo montado: elegir el MISMO mapa que el del fondo.
  //
  // ── Y EL FONDO YA NO ES EL MAPA: ES LA TORRE ──────────────────────────────
  //
  // Lo de arriba era el fondo de Gate City, y se quedó por el camino por dos
  // motivos que se midieron, no que se opinaran:
  //
  //   - **el encuadre.** Gate City no tiene horizonte —137 caras de cielo y
  //     todas son techo— así que no hay contraluz posible; y los dos miradores
  //     se eligieron de una foto en `s = 0`, de modo que por el camino la cámara
  //     pasaba por sitios malos. Se vio jugando.
  //   - **la partida fantasma.** Usar el mapa obligaba a cargarlo al arrancar, y
  //     con él venían los 69 NPC. El 53 lo separó; la torre lo remata, porque
  //     una escena propia no necesita mapa ninguno.
  //
  // La escena está en `src/render/torre.js` y sus parámetros en
  // `src/play/torre.js`. Es **nuestra y procedural**: ni un binario, ni una
  // textura de archivo. Ver `doc/TORRE_54.md`.
  //
  // El paseo se construye con `U: 1` porque esa escena está en METROS, no en
  // unidades de GoldSrc. Con el 39,37 la cámara saldría a 39 veces menos
  // distancia, o sea dentro de la torre.
  prepararFondoDelMenu = () => {
    if (!menuDeLaTorre) {
      try {
        menuDeLaTorre = escenaDeLaTorre();
        pasadaDelMenu = crearPasadaMenu(renderer);
        camaraDeLaTorre = new THREE.PerspectiveCamera(fovDeLaTorre(innerWidth / innerHeight), innerWidth / innerHeight, CAMARA_TORRE.cerca, CAMARA_TORRE.lejos);
        camaraDeLaTorre.rotation.order = "YXZ";
      } catch (e) {
        // Sin escena el menú vuelve a la pintura de la torre de Finér, que es
        // el respaldo de siempre. Un menú es por donde se cambian las teclas:
        // tiene que salir cuando algo falla.
        console.warn("la escena del menú no se pudo montar:", e);
        return false;
      }
    }
    const p = paseoDeMenu({ mirador: MIRADOR_DE_LA_TORRE, U: 1 });
    if (!p.valido) return false;
    paseoMenu = p;
    menuMs?.ponerFondo(true);
    return true;
  };
  menuMs = montarMenu({
    ficha: fichaDelMenu,
    // Se pregunta AL ABRIR y no se decide al montar: así encender el fondo vivo
    // no obliga a reconstruir el menú, y la sonda puede probar miradores que
    // todavía no están en la tabla.
    fondoVivo: () => Boolean(paseoMenu?.valido),
    cursor: cursorDelRaton,
    // Lo único que el menú necesita saber de la cáscara, y enciende «Quit».
    enEscritorio: Boolean(window.escritorio?.salir),
    // El volumen de efectos CON EL QUE NACE, que es lo guardado del jugador y no
    // el 1 de un `Audio` recién creado. Lo de después lo reparte `alAplicar`.
    volumen: ajustesDelJugador?.volumen,
    // (el fondo se enciende justo después de montar: ver `prepararFondoDelMenu`)
    // Con una ventana de VGUI2 delante el menú se ve pero no se toca. Hace
    // falta desde que «Options» se queda detrás en vez de cerrarse, pero el
    // agujero es más viejo: lo tenían ya el navegador de servidores (34) y
    // «Establish a Kingdom» (36), que llevan desde entonces dejándolo abierto.
    tapado: () => Boolean(vgui2?.hayAlgoAbierto()),
    hacer({ que }) {
      if (que === "cerrar") { menuMs.cerrar(); return true; }
      if (que === "opciones" || que === "nombrar") {
        // «Name Character» y «Options» comparten comando en el archivo del
        // juego; aquí van a sitios distintos porque es lo que dicen.
        //
        // Y NO CIERRAN EL MENÚ IGUAL, que es el fallo que se veía jugando: la
        // ventana de Options salía flotando sobre el mapa y sobre el HUD, con
        // el menú desaparecido. En el juego una ventana se abre SOBRE LA VISTA
        // DONDE ESTABAS, y desde el menú esa vista es el menú.
        //
        //   - «Options» es de VGUI2, que vive en `z-index: 60` contra el `40`
        //     del menú: dibuja encima sola. El menú se queda detrás y tapa el
        //     mapa —`inset: 0` y fondo opaco—, que es lo que se quiere, y es lo
        //     que ya hacían «Visit a Kingdom» y «Establish a Kingdom» aquí al
        //     lado. Options era la única de las tres que se salía del molde.
        //   - «Name Character» es de VGUI1 y NO tiene `z-index`, así que con el
        //     menú abierto quedaría enterrada debajo. Ésa sí lo cierra.
        //
        // Por eso la rama se parte en vez de vaciarse: la línea que sobraba
        // sobraba para una de las dos, no para las dos.
        if (que === "nombrar") { menuMs.cerrar(); interfaz?.elegir?.(); }
        else interfaz?.opciones?.();
        return true;
      }
      if (que === "servidores") {
        // El navegador de servidores del 34. El menú se queda detrás, como en
        // el juego: en la captura del menú principal se ven las dos cosas.
        vgui2?.abrirServidores();
        return true;
      }
      if (que === "salir") {
        // «QUIT», que llevaba apagado todo el port. En un navegador no puede
        // hacer nada —`window.close()` no cierra una pestaña que no abrió el
        // guion— y en la cáscara sí, así que la entrada se enciende sola allí
        // (`quehace` con `enEscritorio`) y aquí sólo se obedece.
        //
        // Y SE PREGUNTA, porque salir no se deshace. La pregunta es del juego y
        // no un cuadro del sistema: ver `src/vgui2/pregunta.js`.
        if (!window.escritorio?.salir) return false;
        vgui2?.abrirPregunta({
          titulo: "Quit Master Sword",
          texto: "Leave Gate City and close the game?",
          detalle: "Your character is saved where your store keeps it. " +
            "Anything since your last save stays behind.",
          aceptar: "Quit",
          alAceptar: () => window.escritorio.salir(),
        });
        return true;
      }
      if (que === "crearPartida") {
        // «Establish a Kingdom», y es por donde se entra a jugar desde el 36.
        // El menú se queda detrás igual que con el navegador de servidores.
        vgui2?.abrirCrearServidor({
          alEmpezar: ({ valores }) => {
            // LA PANTALLA COMPLETA VA PRIMERA Y SIN `await` DELANTE. Pedir el
            // teclado sólo vale dentro del gesto del usuario que lo disparó, y
            // este manejador sigue dentro del clic en «Start». Un `await` antes
            // —cargar el mapa, arrancar la sesión— pierde el gesto y el
            // navegador la rechaza sin decir por qué.
            // Y EN ESCRITORIO NO SE PIDE, aunque el valor siga a `true` en la
            // tabla: la casilla ni siquiera sale allí (`soloEnNavegador` en
            // `src/play/crearpartida.js`), así que pedirla sería cumplir una
            // orden que el jugador no ha dado. Las teclas ya son nuestras
            // desde el 72, que es lo que dejó esta fila sin problema que
            // resolver.
            if (valores.pantallaCompleta && !window.escritorio) {
              // Se cuenta con el mismo `suceso()` que la tecla de pantalla
              // completa, para que el jugador lea lo mismo venga por donde
              // venga.
              atraparTeclado(document.documentElement).then((r) => {
                if (r.teclado) suceso("bueno", "Fullscreen: the game now gets every key, Ctrl+W included.");
                else if (r.pantallaCompleta) suceso("nopuedes", `Fullscreen, but the browser keeps its shortcuts (${r.porque}).`);
                else suceso("nopuedes", `Could not go fullscreen (${r.porque}).`);
              });
            }
            // EL MAPA ELEGIDO, que hasta ahora se tiraba a la basura. La fila
            // estaba en la ventana, el jugador la movía y `alEmpezar` ni la
            // miraba: contada como viva y sin llegar a ningún sitio.
            //
            // `mapaElegido()` resuelve `< Random Map >` —al azar entre los que
            // existen de verdad, que hoy es uno— y descarta un nombre que no
            // esté portado. Con un solo mapa las dos entradas caen en
            // `gatecity`, así que esto no cambia a dónde se va: cambia que la
            // elección se LEE. El día que entre un segundo mapa ya está hecho.
            //
            // Y si no resuelve nada no se entra: «Start» prometiendo una
            // partida que no puede abrir es peor que «Start» que no hace nada.
            // Es la misma regla que la prueba «sin ningún mapa de verdad,
            // "Start" no promete nada».
            const mapa = mapaElegido(valores.mapa);
            mapaDeLaPartida = mapa;
            if (!mapa) {
              suceso("nopuedes", "No map to start: nothing is ported yet.");
              return;
            }
            // ── EL 50: Y ADEMÁS SE ABRE ─────────────────────────────────
            //
            // Lo de arriba apuntaba la elección y **no la aplicaba**. Con un
            // solo mapa portado eso no se veía: `mapaDeLaPartida` decía
            // «gatecity» y el mundo cargado era gatecity, así que el control
            // del 36 estaba verde midiendo la coincidencia de dos cadenas.
            // Entró Edana y el discriminante lo dijo en una línea: la fila
            // decía «edana» y el nivel traía los 69 NPC de Gate City.
            //
            // Es el apartado 4 de CLAUDE.md por sexta vez, y esta vez el
            // comentario que había aquí **prometía** que el día del segundo
            // mapa ya estaba hecho. No lo estaba.
            //
            // `MAPA` es una `const` resuelta al cargar la página, y para
            // cuando este menú se ve ya se han pedido la malla, los bichos,
            // los guiones y las texturas de `build/<MAPA>`. Cambiar de mapa
            // aquí no es asignar una variable: es tirar la partida y cargar
            // un nivel.
            //
            // Que es exactamente lo que hace el motor. `Host_Map_f` llama a
            // `CL_Disconnect()` y después a `Host_Map()`
            // (rehlds/engine/host_cmd.cpp:970, :1021); en el navegador eso es
            // una navegación, y `?map=` ya es la línea de órdenes.
            //
            // Sólo se recarga si el mapa es OTRO. El motor recarga siempre,
            // pero aquí recargar cuesta el gesto del usuario —y con él la
            // pantalla completa, que se pide justo arriba y sólo vale dentro
            // del clic—. Se dice en vez de disimularlo.
            if (mapa !== MAPA) {
              if (valores.pantallaCompleta && !window.escritorio) {
                // Ni se intenta prometer: la navegación se lleva por delante
                // la pantalla completa que se acaba de pedir. (En escritorio no
                // se pidió, así que tampoco hay nada que avisar.)
                console.warn(`cambio de mapa a «${mapa}»: la pantalla completa se pierde al recargar.`);
              }
              // `menu=1` sobrevive a la recarga y es lo que distingue «entré
              // por la ventana» de «escribí `?map=` a mano», que es lo que
              // mide el control positivo del 36.
              //
              // ── EL 61: SE CONSERVA LO DEMÁS, Y ESTO ERA UN FALLO ───────
              //
              // Esto era `location.search = "?map=X&menu=1"`, que **tira
              // todos los demás parámetros**. El único que hay hoy es el que
              // importa: `red=ws://…`, o sea a qué servidor estás unido. Así
              // que elegir un mapa distinto del de por omisión te sacaba de
              // la partida, en silencio y sin un error — te quedabas en un
              // juego de un solo jugador creyendo que estabas dentro.
              //
              // No se vio en tres experimentos porque **`sonda:red` sólo
              // medía Gate City**, que es el mapa de por omisión, y con el
              // mapa de por omisión esta rama ni se ejecuta. Es el caso único
              // del 50 otra vez: el valor correcto y el de reposo eran el
              // mismo hasta que hubo un segundo mapa que elegir.
              const q = new URLSearchParams(location.search);
              q.set("map", mapa);
              q.set("menu", "1");
              location.search = `?${q}`;
              return;
            }
            // ── EL 53: EL CASO QUE FUNCIONABA POR ACCIDENTE ───────────
            //
            // Elegir EL MISMO mapa que el del fondo no recarga, así que hay
            // que montar aquí lo que el arranque ya no monta. Hasta el 53
            // esto «funcionaba» porque los 69 bichos llevaban puestos desde
            // antes de que el menú se viera; en cuanto dejaron de montarse,
            // «Start» al mapa del fondo entraba a un pueblo vacío.
            //
            // Va ANTES de cerrar el menú a propósito: cerrarlo suelta la
            // cámara del paseo y devuelve la vista al jugador (`paseando`
            // mira `menuMs.abierto`), y soltarla sobre un mapa donde todavía
            // no hay nadie enseña el pueblo vacío durante los fotogramas que
            // tarde `cargarBichos`. Primero se puebla, luego se abre.
            //
            // Y ESO CUESTA 5 610 ms MEDIDOS, con 18 modelos que leer. Cinco
            // segundos y medio de menú congelado sin decir nada es peor que
            // el problema que arregla, así que se dice — que es lo que hace
            // el motor en este mismo punto:
            //
            //   VGuiWrap2_LoadingStarted("level", name);
            //   StartLoadingProgressBar("Server", 24);
            //   SetLoadingProgressBarStatusText("#GameUI_StartingServer");
            //   -- rehlds/engine/host_cmd.cpp:998-1000, :1015-1017
            //
            // Aquí la pantalla de carga es `say()`, el mismo andamio del
            // arranque. El texto va en inglés porque es interfaz.
            say("starting server…");
            Promise.resolve(montarLosBichos()).then(() => {
              say("");
              menuMs.cerrar();
              entrarPorElMenu = false;
              sesion?.arrancar();
            });
          },
        });
        return true;
      }
      if (que === "desconectar") {
        // «DISCONNECT» DEVUELVE AL MENÚ PRINCIPAL, no a la pantalla de
        // personajes. En GoldSrc `disconnect` tira la partida y lo que queda
        // delante es el menú con su fondo; quien elige personaje es quien está
        // entrando, no quien acaba de salir.
        //
        // Lo que había aquí era `guardar()` + `interfaz.elegir()`, y eso dejaba
        // dos cosas mal a la vez: se veía la pantalla de personajes en vez del
        // menú, y **el mapa se quedaba detrás** porque el personaje seguía
        // vivo en la sesión. `sesion.salir()` existe desde siempre y hace lo
        // que toca —guarda a la fuerza, suelta el personaje y pasa a ELIGIENDO
        // (`src/juego/sesion.js:450`)—; no se estaba llamando.
        //
        // El menú se reabre con `hayPartida = false`, que es lo que quita
        // «Resume game» y «Disconnect» de la lista: ya no hay partida a la que
        // volver, y dejarlas puestas sería ofrecer una puerta a ningún sitio.
        //
        // LO QUE ESTO NO HACE, y va dicho: no descarga el mapa. El motor sí lo
        // hace, y aquí costaría los segundos de volver a leer el `.bsp` con sus
        // 25 atlas de luz. El fondo del menú es opaco, así que no se ve; pero
        // los 69 bichos siguen en memoria y ésa es una diferencia nuestra.
        // Y se espera a que salga antes de reabrir el menú, porque soltar el
        // personaje pasa la sesión a ELIGIENDO y la interfaz reacciona
        // levantando la pantalla de personajes. Sin cerrarla queda DETRÁS del
        // menú, y la Escape siguiente descubre una pantalla de elegir personaje
        // donde debería estar el mapa que ya no hay. El menú es la única cosa
        // delante después de desconectar.
        Promise.resolve(sesion?.salir?.()).then(() => {
          vgui?.cerrar();
          menuMs.abrir(false);
        });
        return true;
      }
      return false;
    },
  });

  // Y si se entra por el menú —o sea, sin `?map=`—, ahora que existe, se abre.
  // El mapa se sigue cargando por detrás mientras tanto, igual que antes se
  // cargaba mientras se elegía personaje: el menú no es una pausa.
  // EL FONDO VIVO SE PREPARA ANTES DE ABRIR, no después: `abrir()` pregunta por
  // `fondoVivo` para decidir si la capa es transparente o lleva la pintura, así
  // que encenderlo después dejaría la primera pantalla con la pintura puesta
  // sobre el mapa que ya está paseando. Se vería una vez, al arrancar, que es
  // justo cuando se mira.
  // ── EL 72: DE VUELTA A LA PINTURA DE FINÉR ────────────────────────────────
  //
  // La escena de la torre ya no se monta al arrancar. Quién lo decide y por qué
  // está en `ESCENA_DEL_MENU` (`src/play/fondomenu.js`), con la razón escrita
  // al lado, que es la regla de las tablas de ajustes: una cosa apagada tiene
  // que decir por qué.
  //
  // Esto NO borra la torre. `prepararFondoDelMenu` sigue entero y
  // `window.probe.miradores` lo llama bajo demanda, así que las cinco sondas de
  // la escena —torre57, torre58, menu52, miradores52, materialesmenu— siguen
  // midiendo lo mismo que medían. Lo único que cambia es con qué arranca el
  // juego.
  if (conEscenaDelMenu()) prepararFondoDelMenu();
  if (entrarPorElMenu) menuMs.abrir();

  // ── LAS SEIS OPCIONES DE TU PROPIO MENÚ (85) ──────────────────────────────
  //
  // El estado de sentarse y de los emotes. La regla entera está en
  // `src/play/menujugador.js`, sin DOM y sin Three; aquí sólo se le dan las
  // cuatro cosas que viven en el mundo: los máximos del personaje, por dónde se
  // le da vida, por dónde se le devuelve aguante y si puede atacar.
  //
  // `vitales` NO llama a `maximosDelPersonaje`, que es local al armado de la
  // sesión: los máximos de Master Sword se derivan de las nueve habilidades cada
  // vez (msmonstershared.cpp:514) y aquí se derivan por el mismo camino que el
  // `dar` del guion del jugador, que es el del 66.
  const emociones = new Emociones({
    vitales: () => {
      const p = sesion?.personaje;
      if (!p) return { vida: 0, vidaMax: 0, mana: 0, manaMax: 0 };
      const d = derivadas(atributosDe(p.habilidades));
      return { vida: p.vida ?? 0, vidaMax: d.vidaMax, mana: p.mana ?? 0, manaMax: d.manaMax };
    },
    // La misma puerta que la regeneración del guion, y por el mismo motivo que
    // el 66: dos caminos para curar al jugador se desincronizan sin avisar. El
    // tope es un `min` y no un `max` — ver el comentario largo del `dar` de
    // `GuionDelJugador`, que esto imita a propósito.
    dar: (que, cuanto) => {
      const p = sesion?.personaje;
      if (!p || !(cuanto > 0)) return;
      const d = derivadas(atributosDe(p.habilidades));
      if (que === "vida") p.vida = Math.min(d.vidaMax, (p.vida ?? 0) + cuanto);
      else p.mana = Math.min(d.manaMax, (p.mana ?? 0) + cuanto);
      sesion?.tocado?.();
    },
    // `drainstamina ent_me -1000`, o sea en positivo. Son mil sobre un máximo de
    // tres, así que en la práctica es «lleno», y ESO es lo fiel: mientras estás
    // sentado el aguante no se regenera solo, porque `CHudFatigue::DoThink` se
    // salta la regeneración con `player.IsActing()` (fatigue.cpp:77-79) y
    // sentarse es una acción. El guion lo compensa rellenándolo cada vuelta.
    aguante: (cuanto) => {
      fatiga.aguante = Math.min(vitalesDelPersonaje().aguanteMax, fatiga.aguante + cuanto);
    },
    suceso: (tipo, texto) => suceso(tipo, texto),
    // `$get(ent_me,canattack)`: la guarda de sentarse. Lo que hoy lo impide en
    // este puerto es estar ya sentado o no tener personaje; el día que haya más
    // efectos que quiten el ataque, entran por aquí.
    // EL 97: ese día es hoy. `canattack` es `PLAYER_MOVE_NOATTACK`
    // (script.cpp:4718), y un aturdido lo lleva puesto: no se puede sentar.
    puedeAtacar: () => Boolean(sesion?.personaje) && !ultimasTrabas?.noAtacar,
    // `SHOW_HEALTH`, que **nadie enciende al arrancar**: sólo lo mueve el comando
    // `showhealth` (player_main.script:392-396). Con él apagado los dos mensajes
    // de descansar no salen, y eso es el original — ver `MENSAJES`. Se lee del
    // guion del jugador para que el día que el comando exista no haya que tocar
    // nada aquí.
    mostrarVida: () => {
      const v = guionJugador?.guion?.vars?.get?.(SHOW_HEALTH);
      return Boolean(v) && v !== "0" && v !== SHOW_HEALTH;
    },
  });

  const interacciones = new InteraccionesNpc({
    sesion, guiones: fichaDeGuiones, menus: fichaDeMenus,
    // `applyeffect` de un NPC sobre el jugador: la cura del sumo sacerdote de
    // Edana (edana/highpriest.script:94). Va por el asa de módulo: el guion
    // del jugador se monta al aparecer, después de esto.
    aplicarEfecto: (ruta, params, o) => guionJugador?.efectos?.aplicar(ruta, params, o) ?? null,
    catalogo: catalogoDeObjetos?.porId ?? null,
    // ── EL 85: EL OTRO LADO DEL MENÚ DEL JUGADOR ─────────────────────────
    //
    // `pedir` sabía contestar las seis opciones desde el 60 y `elegido` no tenía
    // su rama: las seis decían «este NPC no tiene guion portado». Estos dos
    // ganchos son lo que faltaba.
    emociones,
    /**
     * Lo que empuña, para `itemdesc` (`MOT_DESC`). Es `player.ActiveItem()`, o
     * sea **la mano derecha**, y de ella salen las tres cosas que el texto
     * necesita: la descripción del catálogo, si es apilable y cuántos lleva.
     *
     * La cantidad es `o.n`, que es la del inventario y no la del catálogo: el
     * texto del motor dice «(12)» por los doce que tienes, no por el objeto.
     */
    enLaMano: () => {
      const p = sesion?.personaje;
      const id = p?.manos?.derecha ?? null;
      if (!id) return null;
      const f = catalogoDeObjetos?.porId?.get(id) ?? null;
      if (!f) return null;
      const linea = (p.objetos ?? []).find((o) => o.id === id) ?? null;
      return { descripcion: f.descripcion ?? "", apilable: Boolean(f.apilable), cantidad: linea?.n ?? 1 };
    },
    areas: censoDeBichos?.areas ?? [],
    npcPorId: id => bichos?.manada?.de?.(id),
    suceso,
    // El `infomsg` de los guiones. Va a la ventana y no a la consola desde el
    // 60: son dos esquinas distintas de la pantalla y el mod las separa.
    ventanaDeAviso: (titulo, texto) => mensajes?.aviso(titulo, texto),
    // El 60: `npcstore.offer` abre el selector de la tienda.
    abrirTienda: (o) => abrirLaTienda?.(o) ?? false,
    // EL 94: con el modo del `playanim` (`once`/`critical`), ver `Manada.playanim`.
    animar: (instancia, nombre, modo) => bichos?.playanim?.(instancia, nombre, modo),
    borrarDelMundo: nombre => bichos?.aparecedor?.borrar(nombre),
    // ── EL 79: PARA QUE LOS NPC TE OIGAN ────────────────────────────────
    //
    // `UTIL_EntitiesInBox(..., FL_MONSTER | FL_CLIENT | FL_SPECTATOR)` —
    // msmonsterserver.cpp:1654. Aquí la caja es la manada entera y el filtro
    // de quién oye está en `InteraccionesNpc.hablaElJugador`.
    //
    // Las tres cosas van juntas a propósito: la lista, el sitio del que habla
    // y la escala. Con una sola de ellas a `null` el alcance no se puede
    // medir, y entonces no se reparte — se cuenta. Un alcance infinito
    // «porque no sé medir» es justo el verde vacío del apartado 4.
    losNpc: () => bichos?.manada?.instancias ?? [],
    dondeEstaElJugador: () => (player ? [...player.feet] : null),
    unidadesPorMetro: level.unitsPerMetre,
    // ── EL 81: `setmovedest` LLEGA A ALGUIEN ─────────────────────────────
    //
    // El gancho `irA` de `entornoDe` era un `=> {}` **desde el 43**, o sea el
    // sitio del apartado 4 donde una regla vive sin correr. Esto es lo que lo
    // cierra: la resolución del destino está en `src/play/movedest.js` (pura, y
    // por eso medible en Node) y aquí sólo se le dan las dos cosas del mundo.
    //
    // `avisar` son los tres eventos del motor —`game_movingto_dest`,
    // `game_stopmoving`, `game_reached_dest`— de vuelta al guion del NPC, y el
    // orden contraintuitivo lo pone `pasoMandado`, no esto.
    mandarADestino: (instancia, avisar, apuntar) => ganchoDeMovedest({
      manada: bichos?.manada ?? null,
      instancia,
      buscar: (n) => entidadParaDestino(n, instancia),
      // La traza de la huida lleva `dont_ignore_monsters`: ver
      // `trazaLibreConBichos`, que NO es `trazaLibre`.
      libre: (a, b) => trazaLibreConBichos(a, b, instancia),
      avisar, apuntar,
    }),
    // El 81: el rayo de `$cansee`, y SÓLO el rayo. Las cuatro reglas del rango
    // viven en la capa del guion con su cita; ver `lineaDeVision`.
    lineaDeVision: (ref, instancia) => lineaDeVision(ref, instancia),
  });

  // ── `createnpc`: LO QUE UN GUION CREA EN MITAD DE LA PARTIDA ─────────────
  //
  // La regla está en `src/play/creados.js`, que no sabe de Three ni de Rapier;
  // aquí se le da el mundo: de dónde sale la ficha horneada, cómo se monta la
  // instancia (por `bichos.crear`, el mismo camino que los bichos del mapa),
  // dónde está el jugador, la traza y el daño.
  //
  // CON SERVIDOR NO SE CREA NADA, y es a propósito: la manada es del servidor,
  // viaja por índice y su lado no sabe crear (`src/red/`). `crearInstancia`
  // devuelve `null`, `createnpc` lo cuenta en `sinManada` y el arma que lo
  // pidió no corre su guion (ver `guionVivoDelArma`): se queda como antes.

  /** La ficha horneada de un guion creable: la de `creables` o la de un colocado con ese guion. */
  function fichaCreable(script) {
    if (!fichaDeGuiones?.guiones?.[script]) return null;       // sin guion horneado no hay entidad
    const f = censoDeBichos?.creables?.[script]
      ?? (censoDeBichos?.colocados ?? []).find((c) => c.script === script) ?? null;
    return f ? { ...f, aparecedor: null } : null;
  }
  /**
   * La luz de lo creado: el luxel del bicho colocado MÁS CERCANO al punto. El
   * motor muestrea el suelo de debajo (`R_LightVec`); aquí el árbol BSP no está
   * en el navegador (lo dice `tools/bichos.mjs`), así que se toma prestado el
   * de quien esté más cerca. Es una aproximación y va dicha.
   */
  function luzCercana(donde) {
    let mejor = null, d2 = Infinity;
    for (const c of censoDeBichos?.colocados ?? []) {
      if (!c.luz || !c.escena) continue;
      const d = (c.escena[0] - donde[0]) ** 2 + (c.escena[1] - donde[1]) ** 2 + (c.escena[2] - donde[2]) ** 2;
      if (d < d2) { d2 = d; mejor = c.luz; }
    }
    return mejor ?? [128, 128, 128];
  }
  /** El rumbo de la vista del jugador en grados del motor (`pev->angles.y`). */
  function rumboDelJugador() {
    const m = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const g = (Math.atan2(-m.z, m.x) * 180) / Math.PI;
    return g < 0 ? g + 360 : g;
  }
  /**
   * `$get(<jugador>,target)`: `ENT_TARGET`, lo primero que toca la vista a 2 048
   * unidades con `dont_ignore_monsters` (player.cpp:4596-4617). El motor lo
   * refresca una vez por segundo (`TimeUpdateIDInfo`); aquí se traza al
   * preguntar, que es hasta un segundo más fresco. «0» si no hay nadie.
   */
  function objetivoDelJugador() {
    if (!player || !bichosSolidos) return "0";
    const m = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const ojo = player.eye;
    const g = world.world.castRay(
      new RAPIER.Ray({ x: ojo[0], y: ojo[1], z: ojo[2] }, { x: m.x, y: m.y, z: m.z }),
      2048 / level.unitsPerMetre, true, undefined, undefined, undefined, player.body);
    if (!g) return "0";
    const p = bichosSolidos.puestos.find((q) => q.colisionador.handle === g.collider.handle);
    return p && !p.instancia.muerto ? creados.asaDe(p.instancia) : "0";
  }
  /**
   * `$get_traceline(a,b,worldonly)`: dónde acaba la traza contra el MUNDO, sin
   * monstruos (script.cpp:2695-2700). Entra y sale en unidades y ejes del
   * motor; `null` si no choca con nada.
   */
  function trazaDelMundoEnMotor(desde, hasta) {
    const Um = level.unitsPerMetre;
    const o = { x: desde[0] / Um, y: desde[2] / Um, z: -desde[1] / Um };
    const d = { x: hasta[0] / Um - o.x, y: hasta[2] / Um - o.y, z: -hasta[1] / Um - o.z };
    const L = Math.hypot(d.x, d.y, d.z);
    if (!(L > 0)) return null;
    d.x /= L; d.y /= L; d.z /= L;
    const deBicho = new Set((bichosSolidos?.puestos ?? []).map((q) => q.colisionador.handle));
    const g = world.world.castRay(new RAPIER.Ray(o, d), L, true,
      undefined, undefined, undefined, player.body, (c) => !deBicho.has(c.handle));
    if (!g) return null;
    const t = g.timeOfImpact ?? g.toi ?? 0;
    return escenaAMotor([o.x + d.x * t, o.y + d.y * t, o.z + d.z * t], Um);
  }
  /**
   * EL DAÑO DE UNA INVOCACIÓN, que es del jugador: `xdodamage <bicho> direct
   * <daño> 100% <jugador> ent_me <habilidad> <tipo>`. Va por `bichos.herir`,
   * como la espada y la flecha, con el cubo de experiencia de la habilidad que
   * dice el guion. Con servidor no se llega aquí (no hay invocación).
   */
  function herirPorInvocacion(i, dano, { habilidad = "", tipo = "" } = {}) {
    if (!bichos || red) return null;
    const h = habilidadDeArma(habilidad);
    const props = h ? propiedadesDe(h.habilidad) : [];
    const prop = h?.propiedad ?? props[Math.floor(Math.random() * props.length)] ?? "power";
    const golpe = bichos.herir(i, dano, {
      cubo: `${h?.habilidad ?? "?"}.${prop}`, tipo, ahora: reloj, dados: { quien: JUGADOR },
    });
    if (golpe.parado) {
      if (!golpe.hablaElGuion) suceso("ataque", `Your attack was ${golpe.mensaje ?? "parried!"}`);
      return golpe;
    }
    suceso("ataque", golpeAsestado({ nombre: i.ficha.nombre, dano, tipo }));
    if (golpe.muerto) {
      cuentas.muertes++;
      bichosSolidos?.quitar(i);
      repartirExperiencia(i);
      soltarElBotin(i, golpe.suelta);
    }
    return golpe;
  }
  const creados = new MundoDeCreados({
    unidadesPorMetro: level.unitsPerMetre,
    ahora: () => reloj,
    entidades: interacciones.registroDeEntidades,
    instancias: () => bichos?.manada?.instancias ?? [],
    razas: () => (tablaDeRazas.size ? tablaDeRazas : null),
    fichaDe: (script) => fichaCreable(script),
    crearInstancia: (ficha, donde) => {
      if (red || !bichos) return null;
      // La costura tiene que estar puesta ANTES de que nazca su guion: el
      // cuerpo de lo creado lo da la manada enchufada (`guionDe`).
      interacciones.enchufarA(bichos.manada);
      const i = bichos.crear({ ...ficha, luz: luzCercana(donde) }, donde);
      if (!i) return null;
      // Cilindro sólo si su guion no dice `setsolid none|trigger`: una
      // invocación no choca con nadie, un monstruo creado por guion sí.
      i.conCilindro = esSolido(fichaDeGuiones?.guiones?.[ficha.script]) ? Boolean(bichosSolidos?.poner(i)) : false;
      return i;
    },
    guionDe: (i) => interacciones.guionDe(i),
    guionSiHay: (i) => interacciones.guionesVivos.get(i.id) ?? null,
    retirarGuion: (i) => interacciones.guionesVivos.get(i.id)?.retirar?.(),
    jugador: () => {
      const p = sesion?.personaje ?? null;
      if (!p || !player) return null;
      return {
        ref: interacciones.contextoDelJugador().ref, personaje: p,
        pies: [...player.feet], yaw: rumboDelJugador(), vivo: (p.vida ?? 0) > 0,
      };
    },
    herir: (i, dano, o) => herirPorInvocacion(i, dano, o),
    curar: (que, cantidad) => guionJugador?.recibir?.(que, cantidad),
    trazar: (a, b) => trazaDelMundoEnMotor(a, b),
    alBorrar: (i) => { bichosSolidos?.quitar(i); i.conCilindro = false; },
  });
  // Y los guiones de los NPC pueden crear también (un jefe que saca crías).
  interacciones.creados = creados;
  /** Lo que un OBJETO con guion le pide al mundo (ver `GuionDeObjeto`, `mundo`). */
  const mundoDeObjetos = {
    crearNpc: (script, origen, params, o) => creados.crear(script, origen, params, o),
    asaDeObjeto: (objeto) => creados.asaDeObjeto(objeto),
    asaDelDueño: () => interacciones.contextoDelJugador().ref,
    origenDelDueño: () => {
      if (!player) return null;
      const m = escenaAMotor(player.feet, level.unitsPerMetre);
      m[2] += 36;                              // el `origin` del jugador es su centro
      return m;
    },
    objetivoDelDueño: () => objetivoDelJugador(),
    /** `callexternal <asa> <evento>` a algo creado: su guion, si sigue vivo. */
    llamarA: (asa, evento, params) => {
      const e = interacciones.registroDeEntidades.recuperar(asa);
      const g = e?.que?.ficha ? interacciones.guionesVivos.get(e.que.id) ?? null : null;
      if (!g?.guion) return false;
      g.guion.llamar(evento, params);
      return true;
    },
  };
  /**
   * EL GUION VIVO DEL ARMA DE LA MANO, si es de las que atacan por su guion
   * (`ARMAS_QUE_INVOCAN`). `null` en todas las demás, con servidor, y si el
   * arma no está en el personaje —`probe.arco.empunar` sólo monta el brazo—:
   * entonces el ataque es el horneado de siempre.
   */
  const avisadoSinInvocacion = new Set();
  function guionVivoDelArma() {
    const id = equipo.brazo?.arma?.id ?? null;
    if (!id || red || !ARMAS_QUE_INVOCAN.has(id)) return null;
    // Y SÓLO SI LO QUE INVOCA ESTÁ HORNEADO EN ESTE MAPA Y YA HA LLEGADO. Si no,
    // su `_start` quitaría la espada de la mano y su `_strike` no podría crear
    // a quien se la devuelve: una espada perdida para siempre. Sin ello el
    // ataque se queda en el andamio de antes, y se dice una vez.
    const suyos = Object.entries(censoDeBichos?.creables ?? {}).filter(([, f]) => f.por?.includes(`items/${id}`)).map(([s]) => s);
    if (!suyos.length || !suyos.every((s) => fichaCreable(s))) {
      if (!suyos.length && !avisadoSinInvocacion.has(id)) {
        avisadoSinInvocacion.add(id);
        console.warn(`${id}: su invocación no está horneada en este mapa (\`npm run mapa:bichos\` y \`npm run guiones\` con --mapa): el lanzamiento se queda en el andamio.`);
      }
      return null;
    }
    const p = sesion?.personaje ?? null;
    if (!p) return null;
    const o = loQueLleva(p).find((x) => x.id === id) ?? null;
    return o ? objetosVivos.get(String(o.uid ?? o.id)) ?? null : null;
  }
  /**
   * EL `precache` DE UN ARMA QUE INVOCA (scriptcmds.cpp:2765): al empuñarla se
   * traen el modelo y el guion de lo que puede crear, que están horneados A
   * PETICIÓN (`aPeticion` en bichos.json, `guiones_creables.json`). Si no llega
   * a tiempo no se rompe nada: lo creado nace sin dibujo y lo recibe al llegar
   * (`bichos.crear`); sin su guion, el `createnpc` se cuenta en `sinFicha`.
   */
  let guionesCreablesPedidos = null;
  async function precargarInvocaciones(id) {
    if (!id || red || !ARMAS_QUE_INVOCAN.has(id)) return 0;
    guionesCreablesPedidos ??= traerJson(ruta("guiones_creables.json")).catch(() => null);
    const g = await guionesCreablesPedidos;
    if (g?.guiones && fichaDeGuiones?.guiones) {
      for (const [k, v] of Object.entries(g.guiones)) fichaDeGuiones.guiones[k] ??= v;
    }
    if (!bichos) return 0;
    return bichos.precargar(bichos.clavesCreablesPor(`items/${id}`));
  }

  // ── EL MENÚ DE INTERACCIÓN, que necesita a los bichos y al jugador ────────
  vgui.poner(new MenuInteractuar({
    esquema: esquemaVgui,
    // A quién tengo delante: `GetEntInFrontOfMe(72)`, o sea 72 unidades del
    // motor. Se reutiliza `elegirObjetivo`, que es el mismo cono con el que se
    // pega — y eso es a propósito: si el menú mirara con otra regla, habría NPC
    // a los que se les puede pegar y no hablar.
    aQuien: () => {
      // `candidatosDeGolpe()` Y `elegirObjetivo` — los MISMOS que usa la espada,
      // no una copia. Es la regla del 21 y del 22: si el menu mirara con otra
      // regla habria NPC a los que se les puede pegar y no hablar, y al reves.
      //
      // Todo va en unidades del motor, no en metros: `centro` de cada candidato
      // ya viene multiplicado por U y `ALCANCE` son las 72 unidades de
      // `GetEntInFrontOfMe(72)` tal cual. Multiplicar aqui por U otra vez daba
      // un alcance de 2 835 unidades y hablar con un NPC a setenta metros.
      const mirada = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      const pies = player.feet;
      const centro = [pies[0] * U, (pies[1] + player.perfil.height / 2) * U, pies[2] * U];
      const r = elegirObjetivo({
        desde: centro, centro, mirando: [mirada.x, mirada.y, mirada.z],
        alcance: ALCANCE_INTERACTUAR,
        candidatos: candidatosDeGolpe(),
        libre: trazaLibre,
      });
      const i = r?.objetivo?.id ?? null;
      return i ? { id: i.id, nombre: i.ficha?.nombre ?? "Someone", script: i.ficha?.script ?? null } : null;
    },
    // ── CON RED, EL GUION ES DEL SERVIDOR — experimento 62 ────────────────
    //
    // Estas dos líneas son toda la frontera, y es la del mod: el menú lo
    // construye quien tiene el guion y el cliente sólo lo dibuja
    // (`menuselect`, menu.cpp:143 → multiplay_gamerules.cpp:1576). Jugando
    // solo el guion sigue corriendo aquí, que es lo que hace `hl.exe` con un
    // `listenserver`: el servidor está dentro del proceso.
    //
    // Lo que esto arregla no se ve con un jugador: hasta el 62 cada navegador
    // tenía SU copia del vendedor, con su estante, y los dos podían comprar la
    // última daga.
    pedir: id => (red?.dentro ? red.pedirMenu(id) : interacciones.pedir(id)),
    elegido: (id, indice) => (red?.dentro
      ? red.elegirMenu(id, indice)
      : interacciones.elegido(id, indice)),
  }));

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
    for (const [id, a] of catalogos.armas ?? []) nombres[id] = a.nombre ?? id;
    for (const [id, f] of catalogos.flechas ?? []) nombres[id] = f.nombre ?? id;
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
      .filter((o) => o?.id && catalogos.armas?.has(o.id))
      .map((o) => ({
        id: o.id,
        nombre: catalogos.armas.get(o.id)?.nombre ?? o.id,
        // «Arma» en el motor es «tiene ataques», no una categoría.
        arma: Boolean(catalogos.armas.get(o.id)?.ataques?.length),
        enMano: o.id === enMano,
      }));
    const flechas = (p?.objetos ?? [])
      .filter((o) => o?.id && catalogos.flechas?.has(o.id) && !o.id.endsWith("_generic"))
      .map((o) => ({ id: o.id, nombre: catalogos.flechas.get(o.id)?.nombre ?? o.id }));
    return {
      objetos, flechas,
      // `player.m_SpellList` está VACÍA: en Master Sword los hechizos se
      // aprenden de los libros y no hay ninguno puesto todavía. El ciclador lo
      // nota solo y no enseña nada, que es lo que hace el juego.
      hechizos: [],
      armaEnMano: equipo.brazo?.arma ?? null,
    };
  }

  /** Suena uno de los tres wavs de la interfaz. */
  function sonarInterfaz(archivo) {
    if (!archivo || !fichaDelMenu) return;
    try {
      const a = new Audio(rutaComun("snd", archivo.split("/").slice(-2).join("/")));
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
      // EL 97: sale UNA, no todas las que se llamen igual. El `filter` de antes
      // borraba de la lista las dos espadas si llevabas dos: `inv transfer`
      // mueve una entidad (client.cpp:1303-1324), como `Partida._empunar`.
      const lista = sesion.personaje.objetos ?? [];
      const i = lista.findIndex((o) => o.id === orden.id);
      if (i >= 0) {
        if ((lista[i].n ?? 1) > 1) lista[i] = { ...lista[i], n: lista[i].n - 1 };
        else lista.splice(i, 1);
      }
      sesion.personaje.objetos = lista;
      if (antes) sesion.personaje.objetos.push({ id: antes, n: 1 });
      sesion.personaje.manos.derecha = orden.id;
      sesion.tocado?.();
      empunar(orden.id);
      // EL 96: y en partida, el `inv transfer` va al SERVIDOR, que es quien
      // guarda el personaje, recorta el daño con el arma que ve en tu mano y se
      // la enseña a los demás (`MENSAJE.EMPUNAR`).
      red?.empunar?.(orden.id);
      suceso("normal", `You wield ${orden.nombre}`);
    } else if (orden.que === "elegirMunicion") {
      arco.elegirMunicion(orden.infinita ? null : orden.id);
      suceso("normal", `Ammo: ${orden.nombre}`);
    } else if (orden.que === "preparar") {
      suceso("nopuedes", `You know no spells yet`);
    }
  }

  // ── EL 97: PONERSE, QUITARSE Y GUARDAR ──────────────────────────────────
  //
  // Las tres órdenes del panel y de la `q` (`remove`, `inv transfer`, `use`).
  // La regla y su orden están en src/play/equipar.js; aquí se le dan los
  // guiones vivos, la consola y lo que hay que rehacer cuando cambia una mano.
  //
  // `manoActiva` es `m_CurrentHand`: la mano a la que se le hace `use`. El
  // motor la cambia al meter algo en una mano (`SwitchHands`,
  // msmonstershared.cpp:357-360) y al vaciarla (`SwitchToBestHand`).
  let manoActiva = "derecha";
  function equipoDelJugador() {
    const p = sesion?.personaje ?? null;
    if (!p) return null;
    // Las entidades tienen que existir ANTES de mover nada: lo que se mueve
    // corre sus eventos en la misma llamada.
    sincronizarObjetos();
    return new Equipo({
      personaje: p,
      fichaDe: (id) => catalogoDeObjetos?.porId?.get(id) ?? null,
      objetoDe: (id) => objetosVivos.get(String(id)) ?? null,
      decir: (tipo, texto) => suceso(tipo, texto),
      activa: manoActiva,
      atacando: () => Boolean(equipo.brazo?.atacando),
      genero: p.genero,
    });
  }
  /** Lo que cambia fuera del documento cuando se mueve algo: el arma, el escudo, la red. */
  function trasMover(eq, antes) {
    if (!eq) return;
    manoActiva = eq.activa;
    const p = sesion.personaje;
    if (p.manos.derecha !== antes.derecha) {
      const id = p.manos.derecha;
      // Sólo se EMPUÑA lo que tiene ficha de arma; una armadura en la mano no
      // tiene modelo de vista (`MODEL_VIEW none`, armor_base.script:17).
      const arma = id && catalogos.armas?.has(id) ? id : null;
      empunar(arma);
      // Al servidor sólo viaja un ARMA (o la mano vacía): una armadura de paso
      // por la mano no la sacaría de SU mochila, y `VESTIR` la encontraría
      // fuera (`Partida._vestir`).
      if (!id || arma) red?.empunar?.(id ?? null);
    }
    if (p.manos.izquierda !== antes.izquierda) {
      const izq = p.manos.izquierda ?? null;
      embrazar(izq);
      // Lo mismo con la izquierda, que el servidor sólo acepta con un ESCUDO.
      if (!izq || catalogos.escudos?.has(izq)) red?.embrazar?.(izq);
    }
    for (const id of antes.puestos) if (!p.objetos.some((o) => o.puesto && o.id === id)) red?.vestir?.(id, false);
    for (const o of p.objetos) if (o.puesto && !antes.puestos.includes(o.id)) red?.vestir?.(o.id, true);
    sincronizarObjetos();
    sesion.tocado?.();
  }
  /** Corre una orden del equipo y aplica lo que haya cambiado. */
  function moverEquipo(hacer) {
    const eq = equipoDelJugador();
    if (!eq) return null;
    const p = sesion.personaje;
    const antes = {
      derecha: p.manos?.derecha ?? null, izquierda: p.manos?.izquierda ?? null,
      puestos: (p.objetos ?? []).filter((o) => o.puesto).map((o) => o.id),
    };
    const r = hacer(eq);
    trasMover(eq, antes);
    ultimoMovimiento = { ...r, diario: eq.diario.slice() };
    return r;
  }
  /** La `q`: `use` sin mano, o sea la activa (client.cpp:979-997). */
  const usarLaMano = () => moverEquipo((eq) => eq.usar(eq.activa));

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

  // Una sola vez por partida: el aviso de que el navegador se queda con Ctrl+W.
  // Repetirlo en cada agachada sería peor que no decirlo.
  let avisado = false;
  addEventListener("keydown", (e) => {
    // Escribiendo no pasa NADA al juego: ni acciones ni perillas. Y la Escape
    // si pasa, porque es la que cierra el panel donde se esta escribiendo.
    if (escribiendo(e) && e.code !== "Escape") return;

    // ── EL CHAT, ANTES QUE TODO LO DEMÁS — el 61 ──────────────────────────
    //
    // Con el cajetín abierto **el juego no ve una sola tecla**, ni siquiera
    // las de andar: en el mod el foco se lo lleva el `VGUI_SendTextPanel` y
    // `KeyInput` no devuelve nada al juego (vgui_startsaytext.h:50-73). Si
    // esto fuera más abajo, escribir «walk» te haría andar y agacharte.
    if (chatMs?.escribiendo) { chatMs.tecla(e); e.preventDefault(); return; }
    // Y las tres teclas que lo abren: Y global, U local, J party, tal cual
    // las trae `config.cfg`. No se abre con un panel delante ni con el menú
    // puesto, que es donde el motor tampoco acepta `say_text`.
    {
      const canal = chatMs?.teclaQueAbre(e.code) ?? null;
      if (canal !== null && !interfaz?.abierta && !menuMs?.abierto && !vgui?.abierto) {
        chatMs.abrir(canal);
        // El aviso del canal va a la consola de SUCESOS, no a la del chat:
        // `player.SendEventMsg(HUDEVENT_NORMAL, SayString)` — hudmisc.cpp:178.
        suceso("normal", avisoDeCanal(canal));
        e.preventDefault();
        return;
      }
    }
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
    // ── LAS TECLAS QUE SON DEL NAVEGADOR ──────────────────────────────────
    //
    // Va aquí arriba, antes de todo, porque no es una acción del juego: es la
    // frontera con el sitio donde se juega. Ver `src/juego/navegador.js`, que
    // es nuestro entero y explica por qué esto no se arregla con
    // `preventDefault()` — los atajos de la ventana no son cancelables.
    if (teclas.accionDe(e.code) === "pantallaCompleta") {
      // Dentro del manejador de la tecla, que es el gesto que las dos APIs
      // exigen. Si el navegador no trae Keyboard Lock se queda en pantalla
      // completa y se dice: media solución es mejor que un botón mudo.
      atraparTeclado(document.documentElement).then((r) => {
        // EN LA CÁSCARA LAS TECLAS YA SON NUESTRAS, así que el mensaje no habla
        // de ganarlas: la pantalla completa aquí es sólo pantalla completa. El
        // texto de abajo —«ahora el juego recibe todas las teclas»— sería falso
        // por redundante, y el de en medio, falso a secas: no hay navegador que
        // se quede nada.
        if (window.escritorio) {
          if (r.pantallaCompleta) suceso("bueno", "Fullscreen.");
          else suceso("nopuedes", `Could not go fullscreen (${r.porque}).`);
          return;
        }
        if (r.teclado) suceso("bueno", "Fullscreen: the game now gets every key, Ctrl+W included.");
        else if (r.pantallaCompleta) suceso("nopuedes", `Fullscreen, but the browser keeps its shortcuts (${r.porque}).`);
        else suceso("nopuedes", `Could not go fullscreen (${r.porque}).`);
      });
      e.preventDefault();
      return;
    }
    // EL AVISO, al pulsar el modificador y no al completar el atajo: con Ctrl+W
    // no hay segunda oportunidad, el `keydown` llega y la pestaña se cierra. Así
    // que se avisa cuando el Ctrl baja, que es antes.
    if (!avisado && !tecladoAtrapado() && /^(Control|Alt)(Left|Right)$/.test(e.code)) {
      const aviso = avisoDeReservadas({ mapa: teclas.mapa, acciones: ACCIONES, yaAvisado: avisado });
      if (aviso) {
        avisado = true;
        suceso("nopuedes", `${aviso} Press ${nombreDeTecla(teclas.mapa.pantallaCompleta)}.`);
      }
    }
    // RePÁG Y AVPÁG recorren la consola de sucesos, igual que en el juego:
    // `HUD_StepInput(HUDSCROLL_UP/DOWN)` → `VGUI_EventConsole::StepInput`. Van
    // antes del `conPanel` por lo mismo que la F3 — mirar lo que pasó no es
    // jugar, y con una ventana delante es justo cuando se quiere releer.
    if (e.code === "PageUp" || e.code === "PageDown") {
      // CON UN PANEL DELANTE, RePÁG Y AVPÁG SON DEL PANEL.
      //
      // Es `MENUFLAG_TRAPSTEPINPUT`, y el motor lo reparte así:
      //
      //     if (m_pCurrentMenu && ...GetScrollForStepInput()) { ...la barra... }
      //     else if (m_pCurrentMenu && m_Flags & MENUFLAG_TRAPSTEPINPUT) StepInput(...)
      //     else if (!m_pCurrentMenu) HUD_StepInput(ScrollCmd);
      //                             vgui_teamfortressviewport.cpp:2215-2236
      //
      // O sea que la consola de sucesos es **la última** de las tres, y sólo si
      // no hay panel. Aquí estaba la primera, y por eso Character Info no
      // cambiaba de habilidad: la tecla no le llegaba nunca.
      if (vgui?.rueda(e.code === "PageUp" ? RUEDA.ARRIBA : RUEDA.ABAJO)) {
        e.preventDefault();
        return;
      }
      hudMs?.desplazar(e.code === "PageDown");
      e.preventDefault();
      return;
    }
    // EL MENÚ PRINCIPAL. Va antes que todo lo demás porque es la salida: con
    // el menú puesto no corre nada del juego, y con un panel del juego delante
    // la Escape la atiende el panel —cierra lo que está abierto— que es el
    // orden en que uno espera que funcione una tecla que sirve para salir.
    // Y `!vgui?.abierto` es lo que faltaba: con un panel de VGUI delante, el
    // Escape es del panel. Sin esa condición abría el menú principal ENCIMA del
    // panel y a partir de ahí el `if (menuMs?.abierto) return;` de dos líneas más
    // abajo se comía todas las teclas: la F no cerraba, el 1 no elegía, nada.
    // Cuatro controles de `sonda:vgui29` en rojo de una vez, todos por esto.
    // Y `!e.repeat`, que es el fallo que se ve jugando y no leyendo. AGUANTAR
    // LA ESCAPE ES LO QUE PIDE CHROMIUM PARA SALIR DE PANTALLA COMPLETA cuando
    // el teclado está atrapado —un toque no basta, a propósito: es la única
    // salida que le queda al usuario—. Así que en pantalla completa el jugador
    // TIENE que aguantarla, y cada repetición del `keydown` alternaba el menú:
    // abre, cierra, abre, cierra, sesenta veces por segundo, con su sonido cada
    // vez. `src/main.js:1599` ya sabía esto para las ranuras —«aguantar una
    // tecla en un navegador dispara `keydown` en bucle»— y a la tecla que sirve
    // para salir no se le aplicó.
    //
    // No es una concesión al navegador: en el motor el menú también se alterna
    // al PULSAR y no mientras se aguanta. `IN_KeyEvent` reparte cambios de
    // estado, y un `keydown` repetido no es un cambio de estado.
    if (e.code === "Escape" && !interfaz?.abierta && !vgui?.abierto) {
      // El `if` va DENTRO y no en la condición de arriba: así la repetición se
      // come la tecla igual que el primer toque —no cae al reparto de los
      // paneles de VGUI— y sólo deja de alternar. Es la forma de
      // `src/main.js:1599`, y por la misma razón.
      if (!e.repeat) menuMs?.alternar(Boolean(sesion?.personaje));
      e.preventDefault();
      return;
    }
    if (menuMs?.abierto) return;

    // ── LOS PANELES DE VGUI ───────────────────────────────────────────────
    //
    // Aquí y no en el panel: el reparto de teclas está en UN sitio, que es lo
    // que hace el motor (`vgui_teamfortressviewport.cpp:1875-1911`) y lo que no
    // hacían los paneles que había. El registro contesta si se la ha quedado —un
    // número que elige una opción, el Escape que cierra— y entonces el juego no
    // la ve.
    if (vgui?.tecla(e.code, true)) { e.preventDefault(); return; }
    // LA HOJA, con la `p` de `config.cfg:24` — `bind "p" "playerinfo"`.
    if (teclas.accionDe(e.code) === "hoja" && !conPanel) {
      vgui?.alternar("stats");
      e.preventDefault();
      return;
    }
    // EL INVENTARIO, con la `i` de `config.cfg:22`. Va antes que el menú de la
    // F por nada en particular: los dos son `alternar`, y el registro se
    // encarga de que sólo haya uno abierto.
    if (teclas.accionDe(e.code) === "inventario" && !conPanel) {
      vgui?.alternar("inventory");
      e.preventDefault();
      return;
    }
    // Y la acción que lo abre, que es `menu interact` del `config.cfg`.
    if (teclas.accionDe(e.code) === "interactuar" && !conPanel) {
      const abierto = vgui?.alternar("interact");
      // `QueryNPC()` va DESPUÉS de abrir, como en el original: el panel se
      // enseña con «Interact» y el nombre del NPC llega cuando contesta el
      // servidor. En una red lenta eso se ve, y se ve en el juego también.
      abierto?.preguntar?.();
      e.preventDefault();
      return;
    }
    if (vgui?.abierto) return;
    if (conPanel) return;

    // ── EL 89: ACEPTAR (Enter), que en una transición es pedir el viaje ─────
    //
    // `accept` → `MSQuery` (multiplay_gamerules.cpp:1725-1732). Va DESPUÉS de los
    // paneles y del chat a propósito: el chat se queda el Enter mientras escribes
    // y un panel abierto se queda las teclas, como en el motor. Sin repetición,
    // por lo mismo que el Escape de arriba: aguantar no es pulsar otra vez.
    if (teclas.accionDe(e.code) === "aceptar") {
      if (!e.repeat) {
        // Con servidor, los demás son `red.ajenos`. Más de uno abre la votación,
        // que no está portada (lo dice la propia regla).
        const jugadores = red ? 1 + (red.ajenos?.size ?? 0) : 1;
        aplicarTransicion(transiciones.aceptar({
          jugadores, todosDentro: jugadores <= 1, quien: sesion?.personaje?.nombre ?? "",
        }));
      }
      e.preventDefault();
      return;
    }

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
    // COGER DEL SUELO — el 71. `bind "x" "get"` (config.cfg:31), que en el
    // motor es `pPlayer->GetAnyItems()` (client.cpp:661-662).
    //
    // La tecla estaba en la tabla desde el 24 y no la leía nadie: pulsarla no
    // hacía nada y nada lo decía. Va por ACCIÓN y no por `KeyX`, como las
    // demás, porque es un `bind` y el jugador lo puede cambiar.
    //
    // Sin `e.repeat`: aguantarla no recoge el pueblo entero. El motor tampoco,
    // porque `get` es un comando y no un `+get`.
    if (accion === "coger") {
      if (!e.repeat) cogerDelSuelo();
      e.preventDefault();
      return;
    }
    // Y la `c` — `bind "c" "drop"`, config.cfg:16. Sin `e.repeat` por lo mismo:
    // `drop` es un comando y no un `+drop`.
    if (accion === "soltar") {
      if (!e.repeat) soltarDelInventario();
      e.preventDefault();
      return;
    }
    // EL 97: la `q` — `bind "q" "use"` (config.cfg:25), «Sheath/store/wear
    // weapon/item» (kb_act.lst:40). `UseItem` de la mano activa: si se puede
    // vestir se viste, si no se guarda (src/play/equipar.js). Estaba en la tabla
    // de teclas desde el 24 y no la leía nadie, como la `x` hasta el 71.
    if (accion === "usarYa") {
      if (!e.repeat) usarLaMano();
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
      const lista = [...(catalogos.escudos?.keys() ?? [])];
      if (!lista.length) { say("no shields have been baked: `npm run escudos`"); return; }
      const i = equipo.brazal?.objeto?.id ? lista.indexOf(equipo.brazal.objeto.id) : -1;
      // Se recorren en circulo y el ultimo paso es SIN escudo, que tambien es un
      // estado del juego y el que trae de serie un personaje nuevo.
      const siguiente = i + 1 >= lista.length ? null : lista[i + 1];
      embrazar(siguiente).then(() => {
        if (sesion?.personaje) sesion.personaje.manos.izquierda = siguiente;
        // EL 97: con servidor se le dice, que es quien defiende (doc/DEFENSARED_97.md).
        // Si no lo llevas en la mochila del SERVIDOR lo rechaza con un FALLO.
        red?.embrazar?.(siguiente);
        const f = equipo.brazal?.ficha;
        say(siguiente && f
          ? `${equipo.brazal.objeto.nombre}: raised it blocks ${f.bloqueoArriba} % and lets through ` +
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
        if (!catalogos.armas?.has(id)) continue;
        (p.objetos ??= []).push({ id, n: 1 });
        puestas.push(catalogos.armas.get(id)?.nombre ?? id);
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
  // Salir de pantalla completa suelta el teclado SOLO, sin avisarnos: sin esto
  // `tecladoAtrapado()` se quedaría diciendo que sí y el aviso de Ctrl+W no
  // volvería a salir nunca, que es justo cuando hace falta otra vez.
  addEventListener("fullscreenchange", () => {
    if (!enPantallaCompleta()) { soltarTeclado(); avisado = false; }
  });
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
    if (interfaz?.abierta || vgui?.atrapaElRaton) return;
    canvas.requestPointerLock();
  });
  // LA RUEDA. En el juego es `mwheelup`/`mwheeldn` -> `hud_scroll` ->
  // `HUD_StepInput`, y el reparto tiene un orden que importa: con un panel
  // abierto la rueda es del panel, y **al HUD sólo llega si no hay ninguno**
  // (`else if (!m_pCurrentMenu)`, vgui_teamfortressviewport.cpp:2233). O sea que
  // con el inventario delante la rueda no cambia de arma, y eso es del motor.
  addEventListener("wheel", (e) => {
    const arriba = e.deltaY < 0;
    if (vgui?.rueda(arriba ? RUEDA.ARRIBA : RUEDA.ABAJO)) { e.preventDefault(); return; }
    hudMs?.desplazar(!arriba);
  }, { passive: false });
  addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    const g = raton.mover(e.movementX, e.movementY);
    player.yaw += g.yaw;
    // `cl_pitchup`/`cl_pitchdown`, 89 grados, en vez del ±(90 − 0,57) de antes.
    player.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, player.pitch + g.pitch));
  });
  // Al soltar el puntero se olvida la muestra vieja del filtro: si no, el primer
  // movimiento después de volver al juego se promedia con uno de hace un minuto.
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement !== canvas) raton.olvidar();
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
  const fatiga = {
    /**
     * EL AGUANTE. Seis escrituras repartidas por 2 143 líneas: era el nombre
     * sin dueño más grave del archivo, y el último que cruzaba la frontera
     * del golpe cuerpo a cuerpo.
     */
    aguante: 0,
    /** Si va trotando. Lo apaga atacar, y lo decide `puedeCorrer`. */
    corriendo: false,
    /** La rapidez del fotograma anterior, que es lo que `puedeCorrer` compara. */
    rapidezAnterior: 0,
  };

  /**
   * Lo que el modelo de velocidad necesita saber del personaje.
   *
   * Todo derivado, nada guardado: los atributos salen de las habilidades y el
   * peso del inventario con el catalogo al lado. Es la misma regla de siempre
   * — dos verdades y una envejece.
   */
  /**
   * LA CÁMARA EN EL OJO, con lo que el guion le esté haciendo — el 65.
   *
   * Está en una función y no suelta en el bucle porque **el `probe` tenía su
   * propia copia** de estas tres líneas, con este comentario al lado: «está
   * aquí para que no pueda quedarse una rama sin la otra — que es como la
   * sonda acabaría midiendo una cámara que el jugador no ve». Y eso es
   * exactamente lo que habría pasado al añadir el desplazamiento del guion:
   * el juego lo aplicaría y la sonda lo borraría al medirlo. Una sola copia.
   *
   * `Effects_GetView` corre cada fotograma, después de colocar la vista y
   * antes de dibujar (hudscript.cpp:208-221): suma lo que el guion haya dejado
   * escrito en `game.cleffect.view_ofs.*`. No es un comando, es una variable
   * que alguien lee.
   *
   * Las unidades: el guion razona en unidades de GoldSrc y la escena está en
   * metros, así que se divide. Sin eso, un hundimiento de 12 unidades metería
   * la cámara doce METROS bajo el suelo — la misma frontera que el rango del
   * chat en el 61.
   */
  function colocarCamaraDelOjo() {
    const eye = player.eye;
    const v = guionJugador?.vista("view");
    const uPorM = level?.unitsPerMetre || 1;
    // EL 85: y lo que baja la vista al sentarse. Es la MISMA interfaz —el efecto
    // escribe `game.cleffect.view_ofs.z` y nadie avisa a nadie— así que se suma
    // en el mismo sitio y con la misma división a metros. Son 28 unidades en un
    // segundo, y en primera persona es lo único de sentarse que se ve.
    // Sin `?.`: `emociones` es un `const` de más arriba y un `?.` no protege de
    // un `ReferenceError` de todas formas — eso costó dos sondas en el 66.
    const zSentado = emociones.vistaZ();
    camera.position.set(
      eye[0] + (v ? v.pos.x / uPorM : 0),
      eye[1] + (v ? v.pos.z / uPorM : 0) + zSentado / uPorM,   // la z de GoldSrc es la y de aquí
      eye[2] + (v ? v.pos.y / uPorM : 0),
    );
    // EL 94: más el empujón de los golpes, que el motor suma a la vista en
    // `V_CalcNormalRefdef` (view.cpp:744-745). Va en grados del motor: cabeceo
    // positivo es mirar ABAJO (en Three, arriba: signo cambiado), y el giro y
    // el alabeo van como en Three. Sólo se ve, no mueve al jugador.
    const g = golpeDeVista, rad = Math.PI / 180;
    // EL 95: y el temblor, `V_ApplyShake(vieworg, viewangles, 1.0)` (view.cpp:
    // 579): el desplazamiento al ORIGEN de la vista y el ángulo al ALABEO
    // (cl_game.c:2299-2306), con el mismo convenio de alabeo que el empujón.
    const s = temblorEnEscena(temblor, uPorM, 1);
    camera.position.x += s.desplazamiento[0];
    camera.position.y += s.desplazamiento[1];
    camera.position.z += s.desplazamiento[2];
    camera.rotation.set(player.pitch - g[0] * rad, player.yaw + g[1] * rad, (g[2] + s.alabeo) * rad);
  }

  function vitalesDelPersonaje() {
    const p = sesion?.personaje;
    if (!p) return { agilidad: 0, fuerza: 0, peso: 0, carga: 25, aguanteMax: 3 };
    const atr = atributosDe(p.habilidades);
    const d = derivadas(atr);
    // EL 97: con las manos (`Gear.FilledVolume()`, msmonstershared.cpp:430-433).
    const fichas = loQueLleva(p).map((o) => ({ ...o, ficha: fichaDeObjeto(o.id) }));
    return {
      agilidad: atr.agility ?? 0,
      fuerza: atr.strength ?? 0,
      peso: cargaDe(fichas, d.carga).peso,
      carga: d.carga,
      aguanteMax: d.aguanteMax,
    };
  }
  const fichaDeObjeto = (id) => catalogoDeObjetos?.porId?.get(id) ?? { id, peso: 0 };

  // ── LAS CUENTAS, EN UN SITIO (55) ──────────────────────────────────────
  //
  // Eran doce `let` sueltos repartidos por la función, escritos desde sitios
  // que no se ven entre sí y leídos **sólo por la sonda**. Medido con
  // `rollup/parseAst`: cada uno se escribe desde dos o tres puntos distintos
  // y ninguno tiene dueño.
  //
  // Es el primer trozo del «objeto de estado explícito» que el 28 dejó
  // nombrado y sin hacer, y es el trozo fácil a propósito: son cuentas, no
  // lógica. Nadie decide nada mirándolas — si mañana desaparecieran, el juego
  // se jugaría igual y sólo dejaríamos de poder medirlo.
  //
  // Y agruparlas no es cosmética: mientras estén sueltas, sacar el golpe
  // cuerpo a cuerpo a su módulo arrastra seis de ellas por la frontera, que es
  // justo lo que hace que ese tramo no tenga costura (ver doc/ARCO_55.md).
  const cuentas = {
    // El escudo: bloqueos con él arriba, desvíos con él abajo, y los golpes
    // que entran fuera del cono y no lo tocan.
    bloqueos: 0, desvios: 0, fueraDelCono: 0,
    // El del 26. Se cuentan las DECISIONES, no los sonidos: el navegador no
    // deja sonar nada hasta que el jugador toque algo, y lo que hay que medir
    // es la regla.
    sonidosDeCarga: 0,
    golpesDados: 0, impactos: 0, muertes: 0,
    // ── POR DÓNDE ENTRÓ EL GOLPE (80) ───────────────────────────────────────
    //
    // `porLaLinea` son los que la esfera no vio y cogió la traza
    // (`dont_ignore_monsters`, giattack.cpp:1636), y `contraPared` los que de
    // verdad dieron en el mundo. Hacen falta los dos y por separado: hasta el 80
    // los dos casos acababan en el mismo sitio —el clang y ningún daño— y
    // «impactos» no podía distinguirlos. Un `porLaLinea` en cero con una rata
    // delante significa que el segundo intento no se está ejecutando.
    porLaLinea: 0, contraPared: 0,
    // Las consecuencias del golpe: paradas, encogidas, huidas y avisos.
    parados: 0, encogidas: 0, huidas: 0, avisos: 0,
    // Y los que encaja el jugador.
    golpesRecibidos: 0,
  };
  // Vive AQUÍ, fuera del bloque del golpe, y no es un detalle: el arco
  // (`src/juego/arco.js`) y el bucle de fotogramas también escriben en ella.
  // Dejarla dentro del golpe la convertiría en propiedad de ese tramo, y el
  // día que el golpe salga a su módulo se la llevaría puesta.

  // ── LOS TRES CATÁLOGOS, FUERA DEL GOLPE (56) ──────────────────────────
  //
  // Estaban declarados DENTRO del bloque del golpe, y no son del golpe: son
  // las tablas de objetos. El inventario las lee en la 1842 y la 1868, el
  // escudo en la 2195 y el tiro mucho más abajo — diez usos por ENCIMA de la
  // línea donde estaba el `let`. Un nombre que se usa quinientas líneas antes
  // de declararse no vive donde parece que vive.
  //
  // Las tres se rellenan de dos ficheros y ninguna se vuelve a escribir: son
  // datos leídos una vez, no estado.
  const catalogos = { armas: null, flechas: null, escudos: null, suelo: null };
  try {
    const m = await traerJson(rutaComun("armas.json"));
    if (m) catalogos.armas = new Map(m.armas.map((a) => [a.id, a]));
    // Las flechas van en el mismo fichero y en una lista aparte, porque no son
    // armas: son munición. El arco de árbol no tiene daño propio.
    if (m?.flechas) catalogos.flechas = new Map(m.flechas.map((f) => [f.id, f]));
    // EL 100: y la bola de maná del Orion Bow, que no es munición (src/play/orion.js).
    if (m?.bolas) catalogos.bolas = new Map(m.bolas.map((b) => [b.id, b]));
    // EL 101: lo que se ve al reventar un proyectil (`estallidos` de armas.json).
    if (m?.estallidos) catalogos.estallidos = new Map(m.estallidos.map((e) => [e.id, e]));
  } catch (e) {
    console.warn("el catalogo de armas no se ha podido leer:", e);
  }
  // Y EL CATÁLOGO DE ESCUDOS, que va aparte del de armas aunque comparta
  // carpeta: un escudo no es un arma con poco daño, es otro sistema. Ver
  // `src/play/escudo.js`.
  try {
    const m = await traerJson(rutaComun("escudos.json"));
    if (m) catalogos.escudos = new Map(m.escudos.map((e) => [e.id, e]));
  } catch (e) {
    console.warn("el catalogo de escudos no se ha podido leer:", e);
  }
  // EL 71: el catalogo de lo que puede acabar en el SUELO. Va aparte del de
  // armas porque lo que lleva es otro submodelo del mismo archivo —el `_floor`,
  // que hasta hoy no se horneaba— y porque lo escribe otra herramienta
  // (`tools/suelo.mjs`), que decide su lista leyendo los `msitem_spawn` de los
  // mapas horneados.
  let manifiestoDeSuelo = null;
  try {
    manifiestoDeSuelo = await traerJson(rutaComun("suelo.json"));
    if (manifiestoDeSuelo?.objetos) {
      catalogos.suelo = new Map(manifiestoDeSuelo.objetos.map((o) => [o.guion, o]));
    }
  } catch (e) {
    console.warn("el catalogo de objetos del suelo no se ha podido leer:", e);
  }
  // Y sus modelos. Se cargan aquí —dos archivos, 114 KB— y no en el fotograma
  // en que la manzana cae, por lo mismo que las flechas del 55: montar un
  // esqueleto cuesta y el tirón saldría justo cuando el jugador está mirando.
  try {
    objetosEnElSuelo = await cargarSuelo(manifiestoDeSuelo, { U: level.unitsPerMetre });
    if (objetosEnElSuelo) escena.add(objetosEnElSuelo.grupo);
  } catch (e) {
    console.warn("los modelos de los objetos del suelo no se han podido montar:", e);
  }

  // ── LA PASADA DE LA VISTA Y EL MUÑECO, FUERA DEL GOLPE (56) ───────────
  //
  // Estaba dentro del bloque del golpe y no es del golpe. `laVista` es la
  // escena de primera persona: la usan `empunar` y `embrazar` para colgar sus
  // modelos, sí, pero también la dibuja el bucle de fotogramas en la 3753, y
  // el muñeco que vive en ella no tiene nada que ver con pegar.
  //
  // Se mueve entero y sin tocar una línea de su lógica: declaraciones, la
  // función que monta el muñeco y el `await` que lo carga.

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
    manifiestoDeCuerpos = await traerJson(rutaComun("cuerpos.json"));
    await ponerMuneco("male");
  } catch (e) {
    console.warn("el muñeco no se ha podido montar:", e);
  }

  // ── EL GOLPE DEL JUGADOR ──────────────────────────────────────────────────
  //
  // La regla está en `src/play/golpe.js` y no conoce ni Three ni Rapier. Aquí
  // va lo que sólo se puede hacer con el mundo delante: el modelo en la mano,
  // el censo de a quién se puede pegar y la traza que dice si hay pared en
  // medio.
  // ── EL EQUIPO EN LAS MANOS (56) ───────────────────────────────────────
  //
  // Cuatro nombres que son una sola cosa: lo que el jugador lleva puesto. La
  // máquina de estados y el modelo del arma, y los mismos dos del escudo. Se
  // escriben sólo desde `empunar` y `embrazar` —dos sitios, medido— y se leen
  // desde cuarenta y dos del bucle de fotogramas y de la sonda.
  //
  // Los dos cachés de modelos NO entran: `modelosDeArma` es un almacén de
  // mallas por carpeta, no algo que el jugador lleve encima.
  const equipo = {
    brazo: null,          // la máquina de estados del arma
    armaEnMano: null,     // el modelo de primera persona
    brazal: null,         // la máquina del escudo, si lleva uno
    escudoEnMano: null,   // su modelo de vista, el de la otra mano
  };
  const modelosDeArma = new Map(); // uno por carpeta, que pesan un mega
  let turnoDeEmpunar = 0;          // el 96: el último `empunar` gana (ver allí)
  const modelosDeEscudo = new Map();
  // golpes que se comieron el cono.
  const aterrizajes = [];
  /** El id con el que los bichos conocen al jugador en `objetivos()`. */
  const JUGADOR = "jugador";
  /**
   * SI DOS BICHOS SON ALIADOS, que es lo que decide a quién se avisa al morir.
   * La tabla de razas viaja entera en el manifiesto desde el 19, porque con la
   * relación de cada uno con el JUGADOR no se puede contestar esto.
   */
  const sonAliados = (a, b) => {
    const ra = a?.o?.ficha?.ia?.raza ?? a?.ficha?.ia?.raza;
    const rb = b?.o?.ficha?.ia?.raza ?? b?.ficha?.ia?.raza;
    if (!ra || !rb) return false;
    return relacionDeRazas(tablaDeRazas, ra, rb) === RELACION.ALIADO;
  };


  /**
   * EMPUÑAR. El arma sale del personaje —`manos.derecha`—, que la eligió al
   * crearse entre las siete de `reg.newchar.weaponlist`.
   *
   * Y si no hay ninguna, los PUÑOS: `fist_bare` es `undroppable` y todo el
   * mundo los lleva. Dejarlo sin nada sería inventarse un estado que el juego
   * no tiene.
   */
  async function empunar(id) {
    // EL 96: hasta hoy el catálogo traía las ocho armas de partida y esta línea
    // convertía CUALQUIER otra en los puños sin decir nada: una Novablade en
    // `manos.derecha` pegaba, se veía y sonaba como `fist_bare`. Ahora el
    // catálogo trae las 209 empuñables (`tools/armas.mjs`), y si aun así llega
    // un id que no conoce, se cuenta y se avisa en vez de callarse.
    const conocida = id ? catalogos.armas?.get(id) ?? null : null;
    if (id && !conocida && catalogos.armas) {
      cuentas.armasSinFicha = (cuentas.armasSinFicha ?? 0) + 1;
      console.warn(`empuñar: ${id} no está en build/msr/armas.json; se empuñan los puños (npm run armas)`);
    }
    const ficha = conocida ?? catalogos.armas?.get("fist_bare") ?? null;
    if (!ficha) return null;
    equipo.brazo = new Brazo(ficha);
    if (equipo.armaEnMano) equipo.armaEnMano.visible = false;
    equipo.armaEnMano = null;
    // EL TURNO, también del 96: la malla se pide la primera vez que se empuña y
    // eso es un `await`. Con ocho armas casi nunca se cambiaba dos veces seguidas;
    // con doscientas sí, y la carga de la PRIMERA podía acabar después de la
    // segunda y colgar su modelo en la mano de la otra.
    const turno = ++turnoDeEmpunar;
    const clave = ficha.enMano?.clave;
    if (!clave) return equipo.brazo;
    try {
      if (!modelosDeArma.has(clave)) {
        modelosDeArma.set(clave, await cargarArma(clave, { U: level.unitsPerMetre }));
      }
      if (turno !== turnoDeEmpunar) return equipo.brazo;
      equipo.armaEnMano = modelosDeArma.get(clave) ?? null;
      if (equipo.armaEnMano) {
        if (equipo.armaEnMano.nodo.parent !== laVista) laVista.add(equipo.armaEnMano.nodo);
        equipo.armaEnMano.visible = true;
        equipo.armaEnMano.pon(ficha.animaciones?.parado ?? 1);
      }
      // ── Y SI ES UN ARCO, EL CONJUNTO DE FLECHAS ───────────────────────────
      //
      // Va aquí y no en la carga del mapa porque es un modelo más que pedir, y
      // sólo hace falta cuando hay un arco en la mano. Las flechas van en la
      // escena del MUNDO —no en la de la vista— porque son entidades de verdad:
      // se quedan clavadas donde caen y se tapan con las paredes.
      // EL 99: `tiraProyectiles` y no `esDeTiro`: la Unholy Blade y las astas
      // que lanzan también sueltan algo que vuela, y sin el conjunto volaba sin dibujo.
      // EL 100: un conjunto POR MODELO, el de cada cosa que este brazo puede
      // tirar (`clavesQueTira`), y no el de la flecha de madera para todo.
      if (equipo.brazo?.tiraProyectiles) {
        for (const cual of arco.clavesQueTira(equipo.brazo)) {
          if (arco.tieneConjunto(cual)) continue;
          const c = await cargarFlechas(cual, { U: level.unitsPerMetre });
          // EL 97: era `scene.add`, y `scene` no existe en este archivo (la
          // escena del mundo es `escena`): un `ReferenceError` que el `catch`
          // de abajo convertía en «el arma no se ha podido montar» con el
          // conjunto ya asignado y FUERA de la escena — ninguna flecha se ha
          // dibujado volando desde que se la llevó el refactor 720b246. Visto en la sonda del 97.
          if (c && !arco.tieneConjunto(cual)) { arco.ponerConjunto(cual, c); escena.add(c.grupo); }
        }
        // EL 101: y lo que se ve cuando lo que tira REVIENTA — la llamarada de la
        // flecha del Fénix (`src/render/estallido.js`). Mismo sitio y mismo
        // motivo: es un modelo más, y sólo hace falta con ese arco en la mano.
        for (const id of arco.estallidosQueTira(equipo.brazo)) {
          if (arco.tieneEstallido(id)) continue;
          const c = await cargarEstallido(catalogos.estallidos?.get(id) ?? null, ESTALLIDOS[id], { U: level.unitsPerMetre });
          if (c && !arco.tieneEstallido(id)) { arco.ponerEstallido(id, c); escena.add(c.grupo); }
        }
      }
      // Y si es un arma que INVOCA, lo que puede crear: su `precache`.
      await precargarInvocaciones(ficha.id);
    } catch (e) {
      console.warn("el arma no se ha podido montar:", e);
    }
    return equipo.brazo;
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
   * colocarlo: `v_shields.mdl` trae su propio equipo.brazo y está dibujado para verse
   * desde el ojo, igual que el del arma.
   */
  async function embrazar(id) {
    const ficha = id ? catalogos.escudos?.get(id) ?? null : null;
    if (equipo.escudoEnMano) equipo.escudoEnMano.visible = false;
    equipo.escudoEnMano = null;
    equipo.brazal = ficha ? new Brazal({ ...ficha, ataques: ficha.ataque ? [ficha.ataque] : [] }) : null;
    if (!ficha) return null;
    // `weapon_deploy`: sacarlo de la espalda es lo que pone `IS_DEPLOYED`, y sin
    // eso el escudo no bloquea nada aunque lo lleves encima.
    equipo.brazal.desplegar(true);
    const clave = ficha.enMano?.clave;
    if (!clave) return equipo.brazal;
    try {
      if (!modelosDeEscudo.has(clave)) {
        modelosDeEscudo.set(clave, await cargarArma(clave, { U: level.unitsPerMetre }));
      }
      equipo.escudoEnMano = modelosDeEscudo.get(clave) ?? null;
      if (equipo.escudoEnMano) {
        if (equipo.escudoEnMano.nodo.parent !== laVista) laVista.add(equipo.escudoEnMano.nodo);
        equipo.escudoEnMano.visible = true;
        // ESPEJADO, porque va en la izquierda. No hay un `v_` por mano: el motor
        // marca `MSRDR_FLIPPED` cuando `hand == LEFT_HAND` y lo dibuja al revés.
        // Sin esto el escudo sale en el lado del arma.
        equipo.escudoEnMano.espejar((ficha.manoNumero ?? 0) === 0);
        equipo.escudoEnMano.pon(ficha.animaciones?.levantar ?? 0);
      }
    } catch (e) {
      console.warn("el escudo no se ha podido montar:", e);
    }
    return equipo.brazal;
  }

  /**
   * UN PASO DEL ESCUDO, con lo que se ve y lo que se oye. En una función porque
   * lo llaman el bucle Y la sonda: si la sonda mueve el escudo por su cuenta,
   * mide un escudo que no se dibuja.
   */
  function pasoDelEscudo(dt, pulsado) {
    if (!equipo.brazal) return null;
    const s = equipo.brazal.tic(dt, { pulsado });
    if (s.sube) {
      // `melee_start` de `base_melee` acaba en `bm_attack_start`, que pone
      // `MELEE_VIEWANIM_ATK` —o sea `ANIM_THRUST1`— y suena `SOUND_SWIPE`.
      equipo.escudoEnMano?.pon(equipo.brazal.objeto?.animaciones?.empujar ?? 1, { unaVez: true });
      const w = equipo.brazal.objeto?.sonidos?.blandir;
      if (w && audio.despierto) audio.unaVez(`snd/${w}`);
      // Y el aguante, que sale a cero: el ataque del escudo declara
      // `energydrain 0`, así que los 15 puntos de su ficha no se cobran.
      fatiga.aguante = Math.max(0, fatiga.aguante - (s.aguante ?? 0));
    }
    // `melee_end`: `playviewanim ANIM_RETRACT1`, y luego vuelve al parado.
    if (s.baja) equipo.escudoEnMano?.pon(equipo.brazal.objeto?.animaciones?.bajar ?? 2, { unaVez: true });
    // EL 97: «ya no te empujan», que estaba escrito en src/play/escudo.js y no
    // lo ejecutaba nadie. `melee_start`/`melee_end` del escudo llaman al guion
    // del jugador (items/shields_base.script:107-111 y :124-129, con la guarda
    // `PLR_IN_WORLD`); su `ext_shield_up` pone la bandera `nopush`
    // (player/externals.script:3400-3411) y `game_scriptflag_update` el
    // `m_nopush` que hace INMUNE al aturdimiento (effects/debuff_stun.script:66).
    if ((s.sube || s.baja) && guionJugador) {
      const enMundo = Number.parseFloat(String(guionJugador.guion?.resolver?.("PLR_IN_WORLD") ?? "")) || 0;
      if (enMundo) guionJugador.llamar("ext_shield_up", [s.sube ? "1" : "0"]);
    }
    return s;
  }

  /**
   * ¿ESTOY CUBRIÉNDOME? `IsShielding()`, y está en una función porque lo
   * pregunta el bucle Y la sonda: si la sonda se salta la puerta, mide un arma
   * que el jugador no tiene.
   */
  function cubriendose() {
    return !puedeAtacar({
      objetos: [{ id: equipo.brazal?.objeto?.id, cubriendose: Boolean(equipo.brazal?.atacando) }],
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
    // EL 97: las manos las arma `manosDelParry` (src/play/parry.js), que es
    // la MISMA que usa el servidor en `Partida._bichoPega`.
    return valorDeParryDelJugador({
      manos: manosDelParry({
        habilidades: p.habilidades, arma: equipo.brazo?.arma ?? null, escudo: equipo.brazal?.ficha ?? null,
      }),
    });
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
  /**
   * LO QUE SE PUEDE GOLPEAR QUE NO ESTÁ VIVO (69): los rompibles en pie.
   *
   * Van por el MISMO cono y el mismo alcance que los bichos, y no por un segundo
   * camino al lado. Dos conos serían dos alcances, y la sonda mediría el que no
   * usa la espada.
   *
   * Quién gana no lo decide este orden: `elegirObjetivo` se queda con **el más
   * cercano**, y la comparación es estricta (`dist < mejor.distancia`), así que
   * lo único que decide el orden es un empate exacto de distancia — y ahí gana el
   * que está vivo, que es el que va delante. Un goblin pegado a un almiar se
   * lleva el golpe porque está más cerca, no porque esté antes en la lista.
   */
  function candidatosDeGolpe() {
    return [...candidatosVivos(), ...(rompibles?.candidatos({ unidadesPorMetro: level.unitsPerMetre }) ?? [])];
  }

  function candidatosVivos() {
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
  /**
   * `suyo` es el candidato al que se traza, y está aquí por el 69.
   *
   * El motor traza con `ignore_monsters`, así que un monstruo nunca se tapa a sí
   * mismo. Un `func_breakable` **sí**, porque es geometría de colisión de verdad:
   * el rayo del ojo a su centro choca contra su propia cara, `flFraction < 1` y
   * el almiar salía descartado por «pared en medio». Estaba en el cono, estaba a
   * tiro y no se podía golpear nunca — dos piezas correctas y el fallo en la
   * costura, que es como se equivoca esto.
   */
  function trazaLibre(desdeU, hastaU, suyo = null) {
    const o = { x: desdeU[0] / U, y: desdeU[1] / U, z: desdeU[2] / U };
    const d = {
      x: hastaU[0] / U - o.x, y: hastaU[1] / U - o.y, z: hastaU[2] / U - o.z,
    };
    const L = Math.hypot(d.x, d.y, d.z);
    if (!(L > 0)) return true;
    d.x /= L; d.y /= L; d.z /= L;
    const deBicho = new Set((bichosSolidos?.puestos ?? []).map((p) => p.colisionador.handle));
    const propio = suyo?.rompible?.colisionador?.handle;
    if (propio !== undefined) deBicho.add(propio);
    const g = world.world.castRay(new RAPIER.Ray(o, d), L, true,
      undefined, undefined, undefined, player.body,
      (c) => !deBicho.has(c.handle));
    return !g;
  }

  // ── EL 81: LO QUE `setmovedest` NECESITA DEL MUNDO ───────────────────────
  //
  // Las reglas están en `src/play/movedest.js` y no saben de Rapier. Aquí se le
  // dan las dos cosas del mundo que pide —a quién se refiere un nombre y si un
  // rumbo está despejado— y nada más.

  /**
   * `UTIL_TraceLine(..., dont_ignore_monsters, edict(), &tr)` con
   * `tr.flFraction == 1.0`, que es lo que pide la huida (npcscript.cpp:1677).
   *
   * **No es `trazaLibre`, y la diferencia es el nombre de la bandera.** Aquél
   * saca los colisionadores de los bichos de la traza, porque es el que usa el
   * golpe y el motor allí traza con `ignore_monsters` (un monstruo no se tapa a
   * sí mismo — el fallo del almiar, el 69). Aquí **otro bicho en medio SÍ tapa
   * el rumbo**: un jabalí acorralado por sus hermanos no encuentra por dónde
   * huir, y eso es lo que el mod hace. Dos trazas con dos banderas, cada una
   * donde el motor la pone; fundirlas sería elegir una de las dos al azar.
   */
  function trazaLibreConBichos(desdeU, hastaU, suya = null) {
    const o = { x: desdeU[0] / U, y: desdeU[1] / U, z: desdeU[2] / U };
    const d = { x: hastaU[0] / U - o.x, y: hastaU[1] / U - o.y, z: hastaU[2] / U - o.z };
    const L = Math.hypot(d.x, d.y, d.z);
    if (!(L > 0)) return true;
    d.x /= L; d.y /= L; d.z /= L;
    // `edict()` es el que traza: a sí mismo no se choca. Sin esto un bicho
    // nunca encuentra rumbo, porque su propio cilindro está en el origen del
    // rayo — es el primo del trimesh del 69.
    const mio = (bichosSolidos?.puestos ?? []).find((p) => p.instancia === suya)?.cuerpo;
    const g = world.world.castRay(new RAPIER.Ray(o, d), L, true,
      undefined, undefined, undefined, mio);
    return !g;
  }

  /**
   * `RetrieveEntity(Params[0])` para un destino, en UNIDADES.
   *
   * Resuelve lo que de verdad nombran los guiones de Edana: el jugador —que es
   * **65 de sus 130 `setmovedest`**, casi siempre como `PARAM1`— y otro bicho
   * por su `targetname`. Un `info_target` del mapa todavía NO, y eso devuelve
   * `null` para que el gancho lo apunte: un cero callado aquí es un NPC quieto
   * sin motivo, que es el filtro del 63.
   *
   * ── EL JUGADOR CUENTA COMO MONSTRUO, Y SU ANCHO ES CERO ───────────────────
   *
   * `class CBasePlayer : public CMSMonster` (player.h:396), así que
   * `IsMSMonster()` es `true` y el destino sale por la rama del punto de
   * superficie. Pero `m_Width` **sólo se asigna en `npcscript.cpp:201`** —el
   * `setsize` de un guion de NPC— y un jugador no corre ninguno: vale 0. Con
   * `Size = 0` el punto de superficie **es exactamente el ojo**, o sea que las
   * dos ramas coinciden para el jugador. Va con `esBicho: true` y `ancho: 0`
   * porque eso es lo que el motor tiene, no porque dé el mismo número.
   */
  function entidadParaDestino(nombre, suya = null) {
    const r = String(nombre ?? "");
    if (!r) return null;
    // `ent_me` es el propio NPC, y un bicho mandado a sí mismo ya está llegado:
    // es el idioma con el que un guion se para en seco. Se resuelve antes que
    // nada para que no caiga en la rama del jugador.
    const q0 = r === "ent_me" ? suya : null;
    // EL 95: Y LO QUE EL GUION DE ESE NPC SABE QUE ES EL JUGADOR —
    // `ent_laststruck`, `ent_laststruckbyme`, `ent_lastseen`—, que es el paso 2
    // de `RetrieveEntity` (global.cpp:382-398: lo guardado con `StoreEntity` en
    // la `m_EntityList` de ESA entidad). El servidor ya se lo pregunta al guion
    // (`Partida._cuerpoDeRef`, src/red/partida.js); aquí no, y por eso
    // `setmovedest ent_laststruck 1024 flee` (NPCs/default_human.script:68) se
    // apuntaba «no hay ninguna entidad que se llame ent_laststruck» y el
    // aldeano no huía por su guion EN NINGUNA partida de un jugador: la única
    // huida que se veía era la de la IA, que en el mod no tiene (doc/ALDEANOS_95.md).
    const aliasDeSuGuion = !q0 && suya
      && Boolean(interacciones?.guionesVivos?.get?.(suya.id)?.entorno?.esElJugador?.(r));
    const esJugador = !q0 && (r === "player" || r === "ent_lastspoke"
      || r === (sesion?.personaje?.id ?? "player") || aliasDeSuGuion);
    if (esJugador && player) {
      const o = player.eye, p = player.feet;
      return {
        ojo: [o[0] * U, o[1] * U, o[2] * U],
        centro: [p[0] * U, (p[1] + player.perfil.height / 2) * U, p[2] * U],
        ancho: 0, alto: player.perfil.height * U, vuela: false, esBicho: true,
        // Para `lineaDeVision`: chocar contra el propio objetivo cuenta como
        // verlo (`if (tr.pHit == pEntity->edict()) return TRUE`, combat.cpp:1240),
        // y para eso hay que saber cuál es su colisionador.
        colisionador: player.collider ?? null, cuerpo: player.body ?? null,
      };
    }
    const q = q0 ?? bichos?.manada?.porObjetivo?.(r) ?? null;
    if (!q) return null;
    const n = q.donde;
    const alto = ojoDe(q);
    const suyo = (bichosSolidos?.puestos ?? []).find((p) => p.instancia === q);
    return {
      ojo: [n[0] * U, n[1] * U + alto, n[2] * U],
      centro: [n[0] * U, n[1] * U + alto / 2, n[2] * U],
      ancho: q.ficha?.ia?.ancho ?? q.ficha?.ancho ?? 0,
      alto, vuela: Boolean(q.ficha?.vuela), esBicho: true,
      colisionador: suyo?.colisionador ?? null, cuerpo: suyo?.cuerpo ?? null,
    };
  }

  /**
   * `FMVisible(pSighted)` — combat.cpp:1216-1250. EL RAYO DE `$cansee`, Y NADA MÁS.
   *
   *     vecLookerOrigin = pev->origin + pev->view_ofs;   // «the caller's eyes»
   *     vecTargetOrigin = pEntity->EyePosition();
   *     UTIL_TraceLine(..., dont_ignore_monsters, dont_ignore_glass, ENT(pev), &tr);
   *     if (tr.flFraction != 1.0)
   *         return tr.pHit == pEntity->edict();   // chocar con ÉL es verle
   *     return TRUE;
   *
   * Tres cosas que no se adivinan y que las dos copias de este rayo ya hacían:
   * va de OJO A OJO —y el ojo de un bicho es su alto entero, ver `ojoDe`—; lleva
   * `dont_ignore_monsters`, o sea que otro bicho en medio TAPA; y **chocar contra
   * el propio objetivo cuenta como verlo**, que es lo que evita el fallo del 69
   * (el rayo termina en el ojo y por el camino se topa con la cápsula del propio
   * jugador medio metro antes).
   *
   * ── LO QUE ESTO *NO* HACE, Y ESTÁ DECIDIDO ASÍ ────────────────────────────
   *
   * `$cansee(<objetivo>,<rango>)` (npcscript.cpp:1753-1850) es este rayo MÁS
   * cuatro reglas, y las cuatro se quedan en la capa del guion, pegadas a su
   * cita: el `atof` del rango —con `-1` significando «sin límite», :1761 y
   * :1841—, que la distancia es de CENTRO a centro y en 3D («This is always
   * going to use Length(), not Length2D()», :1831), que al objetivo se le RESTA
   * su tamaño si es un monstruo (:1835-1837) y que `$cansee` **escribe**
   * `ENT_LASTSEEN` (:1843).
   *
   * El corte es a propósito: así hay **una sola copia del rayo, que es ésta, y
   * una sola copia de la aritmética, que es la del guion**. Meter el rango aquí
   * obligaría a traer el `atof` y el `-1` a este archivo, que es el sitio
   * equivocado para ellos, y el `-1` cruzando la frontera parece un error.
   */
  function lineaDeVision(ref, instancia) {
    if (!instancia) return false;
    const q = entidadParaDestino(ref, instancia);
    if (!q) return false;
    const n = instancia.donde;
    const o = { x: n[0], y: n[1] + ojoDe(instancia) / U, z: n[2] };
    const d = { x: q.ojo[0] / U - o.x, y: q.ojo[1] / U - o.y, z: q.ojo[2] / U - o.z };
    const L = Math.hypot(d.x, d.y, d.z);
    if (!(L > 0)) return true;
    d.x /= L; d.y /= L; d.z /= L;
    const mio = (bichosSolidos?.puestos ?? []).find((p) => p.instancia === instancia)?.cuerpo;
    const g = world.world.castRay(new RAPIER.Ray(o, d), L, true,
      undefined, undefined, undefined, mio);
    if (!g) return true;                                  // `flFraction == 1.0`
    // ── SE COMPARA EL `handle`, NO EL OBJETO — y esto costó 0 de 14 ──────────
    //
    // `tr.pHit == pEntity->edict()` es una comparación de punteros en C, y aquí
    // la tentación es `g.collider === q.colisionador`. El `veA` de al lado lo
    // hace así y funciona, pero usa `castRayAndGetNormal`; con `castRay` el
    // envoltorio JS que devuelve Rapier **no es el mismo objeto** que el que
    // guardó quien creó el colisionador, así que la igualdad estricta era
    // `false` siempre y el rayo decía que no se ve a nadie: la otra sesión lo
    // midió como **0 de 14 NPC, tres ratas y un jabalí al aire libre incluidos**.
    //
    // Y no daba ningún error: daba un `$cansee` que contesta «no» a todo, que es
    // lo mismo que se ve si el getter no estuviera portado. El `handle` es un
    // entero y cruza el WASM sin envoltorio — es lo que ya hacían `trazaLibre` y
    // la traza del 80 (`g.collider?.handle`), y la línea que las imitaba era
    // justo ésta.
    const suyo = q.colisionador?.handle;
    return suyo !== undefined && g.collider?.handle === suyo;
  }

  // ── LOS OBJETOS EN EL SUELO (71): la traza, el paso y la tecla ──────────
  //
  // La regla está en `src/play/suelo.js` y no sabe de Rapier. Aquí se le dan
  // las dos cosas del mundo que necesita —por dónde se cae y qué se ve— y se
  // reparte lo que devuelve.

  /**
   * Por dónde cae. Devuelve `{ punto }` en unidades, o `null` si no choca.
   *
   * Un rayo y no un barrido de caja, y eso **es** la regla: `FallInit` pone el
   * objeto de tamaño cero —«pointsize until it lands on the ground»,
   * weapons.cpp:368— precisamente para que el motor lo deje caer por cualquier
   * rendija. Un barrido con la caja de 48×48 lo dejaría flotando encima de
   * medio pueblo.
   */
  function trazaDeCaida(desdeU, hastaU) {
    const u = level.unitsPerMetre;
    const o = { x: desdeU[0] / u, y: desdeU[1] / u, z: desdeU[2] / u };
    const d = { x: hastaU[0] / u - o.x, y: hastaU[1] / u - o.y, z: hastaU[2] / u - o.z };
    const L = Math.hypot(d.x, d.y, d.z);
    if (!(L > 0)) return null;
    d.x /= L; d.y /= L; d.z /= L;
    const g = world.world.castRayAndGetNormal(new RAPIER.Ray(o, d), L, true,
      undefined, undefined, undefined, player.body);
    if (!g) return null;
    const t = g.timeOfImpact;
    // SE QUEDA `DIST_EPSILON` POR FUERA DE LA CARA, no a ras.
    //
    // No es un apaño: es lo que hace el motor. `SV_PushEntity` copia
    // `trace.endpos` al origen (sv_phys.cpp:453-457) y el trazador de BSP
    // **pone el cruce al lado de acá a propósito** —«put the crosspoint
    // DIST_EPSILON pixels on the near side», world.cpp:785-792, con
    // `DIST_EPSILON = 0.03125` en :727—. Un objeto del motor descansa a 1/32 de
    // unidad de la cara en la que se paró.
    //
    // Y esto lo encontró la sonda del 75, no una prueba: dejándolo a ras, la
    // espada caída no se podía COGER. `FVisible` traza del ojo al origen del
    // objeto, y un origen que está exactamente sobre el plano hace que el rayo
    // choque contra la cara en la que descansa — «tapado» — y la recogida
    // decía que había una pared en medio. Es el fallo del almiar del 69 otra
    // vez: la geometría tapándose a sí misma, y otra vez en la costura.
    const n = g.normal ?? { x: 0, y: 0, z: 0 };
    const EPS = 0.03125;
    return {
      punto: [
        (o.x + d.x * t) * u + n.x * EPS,
        (o.y + d.y * t) * u + n.y * EPS,
        (o.z + d.z * t) * u + n.z * EPS,
      ],
      normal: [n.x, n.y, n.z],
      deEntidad: esDeBrushEntity(g.collider?.handle),
    };
  }

  /**
   * ¿ESTE COLISIONADOR ES UNA ENTIDAD DE BRUSH Y NO EL MUNDO? — el 75.
   *
   * Es la pregunta que decide si un objeto que cae toca «suelo». El motor la
   * contesta por otro camino —`SV_PointContents` mira el **hull 0 del modelo del
   * mundo** y de las entidades sólo las `SOLID_NOT` (world.cpp:695-709 y
   * :625-626)— pero el resultado es el mismo: una `func_door`, una
   * `func_door_rotating` y un `func_breakable` son `SOLID_BSP` y por tanto NO
   * cuentan como suelo.
   *
   * Y AQUÍ HAY UN HUECO, que se dice en vez de dejarlo callado: `func_wall`
   * tampoco cuenta como suelo en el motor —es un brush entity igual— y en este
   * puerto está **horneada dentro del trimesh del mundo** desde el 48, así que
   * no se puede distinguir sin rehacer el horneado. Son 18 en Edana y 57 en Gate
   * City, y ninguna de las 75 es una superficie sobre la que se pueda dejar algo
   * (son paredes, vallas y marcos); el caso que se puede pisar y en el que esto
   * se nota —la tapa de la cloaca— es una `func_door` y sí se distingue.
   */
  function esDeBrushEntity(asa) {
    if (asa === undefined || asa === null) return false;
    // Se rehace la lista en cada pregunta a propósito, y no se guarda: al romper
    // un almiar su colisionador se quita y Rapier puede REUSAR el asa para otro.
    // Una lista guardada diría que la tapa de la cloaca es un almiar roto. Son
    // 16 entradas en Edana y esto sólo corre mientras algo está cayendo.
    const asas = [
      ...(puertas?.asas?.() ?? []),
      ...(correderas?.asas?.() ?? []),
      ...(rompibles?.asas?.() ?? []),
    ];
    return asas.includes(asa);
  }

  /** Lo que mira `GetAnyItems`: el ojo, el origen y el rumbo, en unidades. */
  function miradaDeRecogida() {
    const u = level.unitsPerMetre;
    const ojo = player.eye;
    const pies = player.feet;
    const mirada = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    return {
      ojo: [ojo[0] * u, ojo[1] * u, ojo[2] * u],
      // El cono se mide desde el `pev->origin` —el centro de la caja— y no
      // desde el ojo. Es la misma distinción que el golpe del 21.
      origen: [pies[0] * u, (pies[1] + player.perfil.height / 2) * u, pies[2] * u],
      mirando: [mirada.x, mirada.y, mirada.z],
      // `FVisible` traza IGNORANDO a los monstruos (combat.cpp:1294): un
      // goblin delante no tapa una manzana. `trazaLibre` ya hace eso.
      libre: (a, b) => trazaLibre(a, b),
    };
  }

  /** Lo que el suelo pide y el mundo hace: ruido, aviso y quitar el nodo. */
  function aplicarSuelo(salidas) {
    for (const s of salidas) {
      if (s.tipo === "objeto_aterriza") {
        caidasDelSuelo.push({ i: s.i, guion: s.guion, sonido: s.sonido, tono: s.tono });
        // `EMIT_SOUND_DYN(..., "items/weapondrop1.wav", 1, ATTN_NORM, 0, pitch)`
        // con el tono del dado. El tono se le pasa porque es del motor.
        if (audio.despierto) {
          const u = level.unitsPerMetre;
          audio.unaVez(`snd/${s.sonido}`, {
            donde: [s.donde[0] / u, s.donde[1] / u, s.donde[2] / u],
            tono: s.tono / 100,
          });
        }
      } else if (s.tipo === "objeto_cogido") {
        suceso("bueno", s.mensaje);
      } else if (s.tipo === "objeto_soltado") {
        // `SendEventMsg(HUDEVENT_NORMAL, "You drop " + ...)`, playershared.cpp:962.
        suceso("normal", s.mensaje);
      } else if (s.tipo === "objeto_no_se_suelta") {
        // `HUDEVENT_UNABLE`, playershared.cpp:976-977.
        suceso("nopuedes", s.mensaje);
      } else if (s.tipo === "objeto_posa") {
        // Sin sonido: es la rama del `else` de `FallThink`. Se apunta para poder
        // medirlo, porque lo que la define es justo lo que NO pasa.
        posadosDelSuelo.push({ i: s.i, guion: s.guion, angulos: s.angulos });
      }
    }
  }

  function pasoDelSuelo(dt) {
    if (!sueloDelMundo.objetos.length) return;
    sueloDelMundo.paso(dt, { traza: trazaDeCaida });
    aplicarSuelo(sueloDelMundo.recoger());
    objetosEnElSuelo?.tic(sueloDelMundo.objetos);
  }

  /**
   * LA TECLA `x` — `bind "x" "get"` (config.cfg:31), que llega a
   * `pPlayer->GetAnyItems()` (client.cpp:661-662).
   *
   * Devuelve lo que se ha cogido, para que la sonda pueda leerlo. Y mete el
   * objeto en la mochila por la misma puerta que una compra: la lista
   * `personaje.objetos`.
   */
  function cogerDelSuelo() {
    if (!sueloDelMundo.objetos.length) return null;
    const r = sueloDelMundo.coger(miradaDeRecogida());
    aplicarSuelo(sueloDelMundo.recoger());
    if (!r) return null;
    objetosEnElSuelo?.quitar(r.objeto.i);
    const p = sesion?.personaje;
    if (p) {
      p.objetos ??= [];
      // `NUM_MAX_ITEMS`: el tope duro del inventario, el mismo que `offer`.
      if (p.objetos.length >= 50) {
        suceso("nopuedes", "Cannot recieve items while inventory is full.");
      } else {
        const ya = p.objetos.find((o) => o.id === r.objeto.guion);
        if (ya) ya.n = (ya.n ?? 1) + 1;
        else p.objetos.push({ id: r.objeto.guion, n: 1 });
        sesion.tocado?.();
      }
    }
    return r;
  }

  /**
   * LA TECLA `c` — `bind "c" "drop"` (config.cfg:16), que llega a la rama
   * `"drop"` de `ClientCommand2` (client.cpp:931-957) y de ahí a
   * `CBasePlayer::DropItem` -> `CGenericItem::Drop`.
   *
   * Sin argumento el comando suelta `ActiveItem()`, que aquí es lo que lleva la
   * mano derecha. La regla —el tercio del cabeceo, el empuje, los candados de
   * `CanDrop` y la tautología que deja muerto el «pulsa otra vez»— está en
   * `src/play/suelo.js`; esto le da el ojo y el rumbo y vacía la mano.
   */
  function soltarDelInventario() {
    const p = sesion?.personaje;
    const guion = p?.manos?.derecha ?? null;
    if (!guion) {
      // `drop` sin `ActiveItem()` ni siquiera llega a `DropItem`: el motor
      // escribe un error de consola (client.cpp:945-946) y el jugador no lee
      // nada. Aquí tampoco se le dice nada, que es lo que pasa en el juego.
      return null;
    }
    const u = level.unitsPerMetre;
    const ojo = player.eye;
    const mirada = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const v = player.body?.linvel?.() ?? { x: 0, y: 0, z: 0 };
    const o = sueloDelMundo.tirar({
      guion,
      ojo: [ojo[0] * u, ojo[1] * u, ojo[2] * u],
      mirando: [mirada.x, mirada.y, mirada.z],
      // `pev->velocity = pev->velocity + ...`: la del jugador, en unidades.
      velocidad: [v.x * u, v.y * u, v.z * u],
      // `if (CurrentAttack) return false;` — el único candado de `CanDrop` que
      // está conectado. Aquí el ataque en curso lo sabe el reloj del golpe.
      atacando: Boolean(equipo.brazo?.atacando),
    });
    aplicarSuelo(sueloDelMundo.recoger());
    if (!o) return null;
    // `m_pOwner->RemoveItem(this)` (genericitem.cpp:1355-1356): sale de la mano
    // y NO vuelve a la mochila. Soltar es soltar. Lo empuñado ya no está en
    // `personaje.objetos` —`cumplir` lo saca al empuñarlo—, así que vaciar la
    // mano es todo lo que hay que hacer.
    p.manos.derecha = null;
    sesion.tocado?.();
    empunar(null);
    // EL 97: y con servidor, se le dice (`MENSAJE.SOLTAR`): hasta hoy el
    // servidor seguía creyendo que la llevabas.
    red?.soltarArma?.(guion);
    return o;
  }

  /**
   * «DROP SELECTED» — el 98. `drop <id>` con el objeto DENTRO de un contenedor
   * (client.cpp:932-947 -> `CBasePlayer::DropItem(pItem, false, true)`,
   * playershared.cpp:943-990 -> `CGenericItem::Drop`, genericitem.cpp:
   * 1319-1383). El mismo tiro que la `c` (`sueloDelMundo.tirar`); lo que cambia
   * es de dónde sale: de la lista, una unidad. El «You drop …» lo pone
   * `Suelo.tirar`, como con la `c` — y es un pendiente de los dos: en
   * `DropItem` ese aviso está detrás de `bDropAttempted` (playershared.cpp:
   * 960), que al llegar vale falso (lo baja `Drop` al acabar, genericitem.cpp:
   * 1369, y lo que lo subía entre dos pulsaciones está comentado, :1512-1525).
   * Ver doc/INVENTARIO_98.md §6.
   */
  function soltarDeUnContenedor(clave) {
    const p = sesion?.personaje;
    const entrada = (p?.objetos ?? []).find((o) => (o.uid ?? o.id) === clave && !o.puesto) ?? null;
    if (!entrada) return null;
    const u = level.unitsPerMetre;
    const ojo = player.eye;
    const mirada = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const v = player.body?.linvel?.() ?? { x: 0, y: 0, z: 0 };
    const o = sueloDelMundo.tirar({
      guion: entrada.id,
      ojo: [ojo[0] * u, ojo[1] * u, ojo[2] * u],
      mirando: [mirada.x, mirada.y, mirada.z],
      velocidad: [v.x * u, v.y * u, v.z * u],
      // `CanDrop`: `CurrentAttack` es del OBJETO, y uno guardado no ataca.
      atacando: false,
    });
    aplicarSuelo(sueloDelMundo.recoger());
    if (!o) return null;
    // `m_pOwner->RemoveItem(this)` (genericitem.cpp:1355-1356): una unidad.
    if ((entrada.n ?? 1) > 1) entrada.n -= 1;
    else p.objetos.splice(p.objetos.indexOf(entrada), 1);
    sesion.tocado?.();
    sincronizarObjetos();
    ultimoSoltado98 = { id: entrada.id, de: entrada.en ?? null, i: o.i ?? null };
    // Con servidor, el mismo `SOLTAR` de la `c` diciendo de dónde (el 98).
    red?.soltarArma?.(entrada.id, "mochila");
    return o;
  }

  /**
   * LA SEGUNDA TRAZA DEL GOLPE, la que SÍ ve a los monstruos — el 80.
   *
   * Es la hermana de `trazaLibre` y hace lo contrario a propósito: aquélla es
   * el `ignore_monsters` del primer intento —«¿hay mundo en medio?»— y ésta es
   * el `dont_ignore_monsters` del segundo —«¿qué hay en la cruceta?»—.
   *
   *     MSTraceLine(vecSrc, vecEnd, dont_ignore_monsters, ...)   giattack.cpp:1636
   *
   * Que fueran dos rayos en la misma función y sólo uno filtrara es justo el
   * fallo: el de aquí tocaba el cilindro de la rata y el golpe se contaba como
   * «he dado a la pared», con su clang y sin daño.
   *
   * Devuelve lo que pide `resolverGolpe`: `{ tipo, objetivo }`, con `tipo` en
   * `"bicho"` / `"rompible"` / `"mundo"`, o `null` si no toca nada.
   */
  function trazaDeLaLinea(desdeU, mirandoU, alcanceU, candidatos = []) {
    const L = (alcanceU ?? 0) / U;
    const m = Math.hypot(mirandoU[0], mirandoU[1], mirandoU[2]);
    if (!(L > 0) || !(m > 0)) return null;
    const o = { x: desdeU[0] / U, y: desdeU[1] / U, z: desdeU[2] / U };
    const d = { x: mirandoU[0] / m, y: mirandoU[1] / m, z: mirandoU[2] / m };
    const g = world.world.castRay(new RAPIER.Ray(o, d), L, true,
      undefined, undefined, undefined, player.body);
    if (!g) return null;
    const mano = g.collider?.handle;
    // ── Y SE DEVUELVE EL CANDIDATO, NO EL COLISIONADOR ────────────────────
    //
    // Porque el daño de más abajo trabaja con candidatos —tienen el `centro`,
    // el `rompible` y la instancia— y buscar la instancia aquí y el candidato
    // allí sería tener dos listas que se pueden separar. Es el fallo del 63.
    const suyo = (bichosSolidos?.puestos ?? []).find((q) => q.colisionador.handle === mano);
    if (suyo) {
      const c = candidatos.find((x) => x.id === suyo.instancia);
      // Un bicho con cilindro que no está en la lista de candidatos es un
      // cadáver o un dormido: ahí el motor tampoco hiere a nadie
      // (`!pTarget->IsAlive()`), y «mundo» sería mentir sobre lo que se tocó.
      return c ? { tipo: "bicho", objetivo: c } : null;
    }
    const roto = candidatos.find((x) => x.rompible?.colisionador?.handle === mano);
    if (roto) return { tipo: "rompible", objetivo: roto };
    return { tipo: "mundo" };
  }

  /**
   * EL GOLPE, cuando el reloj del arma dice que toca (`delay.strike`).
   *
   * El orden es el del motor y son DOS INTENTOS, no uno: la esfera busca un
   * objetivo en el cono, y si no hay ninguno se traza la línea **con los
   * monstruos puestos** y se le hace el daño a lo que toque; sólo si eso es el
   * mundo suena el `hitwall`. La regla y su cita están en `resolverGolpe`
   * (`src/play/golpe.js`), que es donde la puede probar Node.
   */
  function pegar(ataque) {
    cuentas.golpesDados++;
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

    const candidatos = candidatosDeGolpe();
    const r = resolverGolpe({
      desde, centro, mirando: [mirada.x, mirada.y, mirada.z],
      alcance: ataque.alcance ?? 0,
      candidatos,
      libre: trazaLibre,
      // La línea sale del PUNTO DE SALIDA y no del ojo, igual que la esfera:
      // `vecEnd = vecSrc + vForward * flRange` (giattack.cpp:752). Trazarla
      // desde el ojo era otro alcance, el del arma menos el `startpos`.
      linea: (d, m, a) => trazaDeLaLinea(d, m, a, candidatos),
    });
    // POR DÓNDE ENTRÓ EL GOLPE, que es lo que la sonda necesita para distinguir
    // «le pegué» de «le pegué por donde creía». Sin esto, arreglar el segundo
    // intento y que siguiera entrando todo por la esfera se vería igual.
    if (r?.por) cuentas.porLaLinea += r.por === "linea" ? 1 : 0;

    const sonidos = equipo.brazo?.arma?.sonidos ?? {};
    // NADA DELANTE: ni un sonido. El motor manda `"none"` como primer parámetro
    // del `_strike` (giattack.cpp:877) y el guion del arma no toca nada.
    if (!r) return null;
    // Y LA PARED ES LA PARED: aquí el `hitwall` es correcto y suena. Un bicho no
    // llega hasta aquí nunca — `CMSMonster::CounterEffect` manda `CE_HITMONSTER`
    // (msmonsterserver.cpp:2438-2445) y `hitwall` sólo sale de `CE_HITWORLD`
    // (entity.cpp:20-26). Eso era lo que el jugador oía al fallarle a una rata.
    if (r.mundo) {
      cuentas.contraPared++;
      if (sonidos.contraPared?.length && audio.despierto) {
        const cual = sonidos.contraPared[Math.floor(Math.random() * sonidos.contraPared.length)];
        audio.unaVez(`snd/${cual}`);
      }
      return null;
    }

    // `tirada` es el `iAccuracyRoll` que el mod enseña dentro del «CRIT!».
    const { dano, critico, tirada } = equipo.brazo.dano(ataque, {
      potencia: potenciaDe(ataque),
      sinNivel: destrezaDe(ataque) < (ataque.pideHabilidad ?? 0),
    });
    cuentas.impactos++;

    // UN ROMPIBLE (69) y no un bicho: no tiene experiencia, ni sangre, ni cubo
    // de habilidad. Sale por aquí antes de todo eso.
    //
    // `tipo: "club"` porque una espada es `DMG_CLUB`, y eso DUPLICA el daño
    // contra un rompible (func_break.cpp:565-567). El almiar de 10 de vida cae
    // con 5 de daño de espada.
    if (r.objetivo.rompible) {
      // `entidad` del rompible es el índice en el LUMP del `.bsp`; `e.i` es la
      // fila del bus. Son dos numeraciones distintas —el bus no lleva todas las
      // entidades del mapa— y confundirlas da otro almiar, no un error.
      const e = disparadores.entidades.find((x) => x.entidad === r.objetivo.entidad);
      if (e) {
        disparadores.danar(e, dano, { tipo: "club", deJugador: true });
        aplicarDisparos(disparadores.recoger());
      }
      const golpeo = sonidos.contraPared ?? [];
      if (golpeo.length && audio.despierto) {
        audio.unaVez(`snd/${golpeo[Math.floor(Math.random() * golpeo.length)]}`);
      }
      return null;
    }

    const i = r.objetivo.id;
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
      cuentas.parados++;
      // EL 97: si el guion del bicho recibió su `game_parry`, la frase ya la
      // ha dicho él —o no la dice, si su `[override]` la quitó—; esto era el
      // relevo de cuando no había guion (el 86) y desde el 91 la repetía.
      if (!golpe.hablaElGuion) suceso("ataque", `Your attack was ${golpe.mensaje ?? "parried!"}`);
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
    // EL 86: EL INFORME DEL GOLPE, con el formato del juego y no con el nuestro.
    //
    // `"Hit %s: %s %s"`, y con crítico `"Hit %s: %s %s CRIT! (%i/%i)"`
    // (giattack.cpp:1954 y :1952). El texto lo arma
    // `src/play/mensajesdecombate.js`, que es donde están las citas y la tabla
    // de lo que decíamos antes.
    //
    // Y va ANTES de la rama de la muerte, no dentro del `else`: el informe del
    // mod sale de `DoDamage`, que corre con el golpe que mata igual que con los
    // demás, así que el último espadazo también se anuncia. Hasta hoy el que
    // mataba no decía el daño — decía «You killed X — N experience», y eso no
    // existe en el mod: su línea de experiencia está COMENTADA por su autor
    // (playerstats.cpp:208, «no workie»).
    suceso("ataque", golpeAsestado({
      nombre: i.ficha.nombre, dano, tipo: ataque.tipoDano,
      critico, tirada, umbral: CRITICO.umbral,
    }));
    if (muerto) {
      cuentas.muertes++;
      bichosSolidos?.quitar(i);
      repartirExperiencia(i);
      soltarElBotin(i, golpe.suelta);
      // AL MORIR GRITA, y los aliados a tiro de su grito vienen a por ti. El
      // radio sale de su vida máxima: 294 unidades para un goblin de 50.
      const avisados = bichos.avisar(i, JUGADOR, { esAliado: sonAliados });
      // EL 83: ESTE AVISO NO LO DA EL JUEGO, Y LA FRASE ERA NUESTRA.
      //
      // El usuario, comparando con el original: «en el juego original veo que
      // no hay nada de eso de alerta a los enemigos». Y no lo hay. La cadena
      // del mod es `npcatk_alert_all_allies` → `npcatk_alert_in_range` →
      // `npcatk_ally_alert` (monsters/base_monster_shared.script:1071-1095), y
      // de punta a punta **no imprime nada al jugador**: lo único que sale por
      // ahí es un `dbg`, que va a la consola de depuración del servidor y está
      // además medio comentado (:1081).
      //
      // O sea que el mecanismo es real y está bien portado, y lo inventado era
      // decirlo. Es el 65 otra vez —«You parried the blow!», una frase
      // plausible en el sitio correcto—, y por eso se quita el texto y se deja
      // el aviso y su contador: `cuentas.avisos` es lo que mide
      // `sondas/consecuencias.mjs:400`, y un mensaje de HUD no es el sitio
      // donde se comprueba que los aliados vienen.
      if (avisados.length) cuentas.avisos += avisados.length;
    } else {
      if (golpe.encoge) cuentas.encogidas++;
      // HUIR NO SE ANUNCIA, y el contador se queda. La cadena de huir del mod
      // —`npcatk_run "flee"` y lo que la rodea,
      // `monsters/base_npc_attack_new.script:787-869`— no tiene un solo
      // `playermessage`: el jugador ve que el bicho se va, no se lo leen.
      // «The monster flees» era nuestra, igual que el aviso a los aliados que el
      // 83 quitó por lo mismo. Y «it flinches» y el «N of M left» del informe de
      // arriba también: el mod no te dice la vida que le queda a nada.
      if (golpe.huye) cuentas.huidas++;
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

  /**
   * SUBIR UNA PROPIEDAD: las cinco cosas que pasan a la vez.
   *
   * La lista y sus citas están en `src/play/nivel.js`. Aquí sólo se reparten:
   * dos carteles al centro-izquierda, UNA línea de consola —la tuya—, UNA
   * ventana arriba a la izquierda —la que en el juego ven todos—, el sonido y
   * los cuatro segundos de colores. Las dos últimas eran la misma línea de
   * consola hasta el 60; ver `src/play/aviso.js`.
   */
  function celebrarSubida(donde) {
    if (!donde) return;
    const s = subida(donde, sesion?.personaje?.nombre ?? "Someone");
    // (1) El cartel, DOS veces. El motor lo manda dos y aquí se mandan dos: el
    // fallo está portado en `subida()`, que devuelve la lista ya repetida.
    for (const texto of s.carteles) mensajes?.cartel(texto);
    // (2) `SendInfoMsg`, a tu consola.
    suceso("normal", s.adepto);
    // (3) `infomsg all`, que en un servidor lo verían todos. Y va a la VENTANA
    // de arriba a la izquierda, no a la consola: `infomsg` es `SendHUDMsg` y
    // `all` sólo cambia a cuántos se lo manda —`SendHUDMsgAll` recorre los
    // jugadores y le llama a cada uno (svglobals.cpp:346-351)—, no dónde sale.
    // Hasta el 60 se juntaba con un guion y se imprimía abajo con los golpes,
    // que es justo lo que el recuadro existe para no hacer.
    mensajes?.aviso(s.anuncio.titulo, s.anuncio.cuerpo);
    // (4) El sonido.
    if (audio.despierto) audio.unaVez(`snd/${s.sonido}`);
    // (5) Y los colores, alrededor del cuerpo.
    chispas?.arrancar(player.eye);
  }

  /**
   * `game_learnskill` con los nombres del motor.
   *
   * `entrenar` devuelve `donde` como «bluntarms.proficiency» —clave interna— y
   * el guion espera «Blunt Arms» y «Proficiency», que son
   * `SkillStatList[].Name` y `SkillTypeList[]` (stats.cpp:20-41). Traducir
   * aquí y no en `entrenar` mantiene la frontera: las claves son nuestras, los
   * nombres son del juego.
   */
  function avisarDeHabilidad(p, donde) {
    if (!guionJugador || !donde) return;
    const [hab, prop] = String(donde).split(".");
    const nombreHab = HABILIDADES.find((h) => h.clave === hab)?.nombre ?? hab;
    const nombreProp = PROPIEDADES.find((x) => x.clave === prop)?.nombre ?? prop;
    const valor = p?.habilidades?.[hab]?.[prop]?.valor ?? 0;
    guionJugador.llamar("game_learnskill", [nombreHab, nombreProp, String(valor)]);
  }

  /**
   * LO QUE LLEVABA ENCIMA, AL SUELO — el 82.
   *
   * Es `DropAllItems()`, que el motor llama en las tres salidas de la muerte de
   * un monstruo (msmonsterserver.cpp:2614, :2628 y :2638). Lo que cae ya estaba
   * decidido: el sorteo es de `npc_post_spawn`, o sea de cuando el bicho NACIÓ
   * (base_monster_shared.script:228-250). Aqui solo se deja caer.
   *
   * SALE DE SU CENTRO Y NO DE SUS PIES, porque un objeto nace con la caja de
   * `FallInit` y soltarlo dentro del suelo lo deja medio hundido hasta que cae
   * — el 71 ya pago esa. El alto del bicho lo dice su guion.
   */
  function soltarElBotin(i, suelta) {
    if (!sueloDelMundo || !Array.isArray(suelta) || !suelta.length) return;
    const n = i.nodo?.position ?? null;
    const alto = (i.ficha.ia?.alto ?? i.ficha.alto ?? 32) / U;
    const donde = n ? [n.x, n.y + alto / 2, n.z] : [...i.donde];
    for (const guion of suelta) {
      // Sin angulos: `FallInit` le pone el suyo al tocar el suelo —tumbado, con
      // el yaw conservado—, y darle uno aqui seria inventarse una pose que el
      // motor sobreescribe en cuanto aterriza.
      const o = sueloDelMundo.soltar({ guion, donde });
      // Un guion de objeto que el catalogo no tiene NO se calla: `soltar`
      // apunta `objeto_sin_guion` en sus salidas, y la sonda lo lee. Sin esto,
      // «el jabali no suelta nada» volveria a ser indistinguible de «el jabali
      // no llevaba nada», que es justo el fallo del que viene este experimento.
      if (o) cuentas.botinSoltado = (cuentas.botinSoltado ?? 0) + 1;
    }
  }

  function repartirExperiencia(i) {
    const p = sesion?.personaje;
    if (!p) return;
    const xp = expDeLaMuerte({
      nivel: loQueVale(i),
      vidaMaxima: i.vidaMaxima ?? 0,
      porCubo: i.recibido,
    });
    // Sólo `total`: los acumuladores de «cuánto se apuntó» y «cuántos puntos
    // subieron» eran para la línea que el 86 quitó, y un acumulador que nadie
    // lee es un sitio donde cabe una regla sin correr (el 62). Lo que se apunta
    // y lo que se pierde se mide donde vive, en las pruebas de `entrenar`.
    let total = 0;
    for (const [cubo, cantidad] of Object.entries(xp)) {
      // `while (iRemainingExp > 0)`, playerstats.cpp:83: un cubo negativo —el
      // aldeano de `skilllevel -10`— no entra al bucle y no resta ni enseña.
      // Sin esta línea `aprender` le daría el mínimo de 1 (el 94).
      if (!(cantidad > 0)) continue;
      total += cantidad;
      const r = entrenar(p, cubo, cantidad);
      if (r.subidas > 0) celebrarSubida(r.donde);
      // `CallScriptEvent("game_learnskill", {stat, substat, valor})` —
      // playerstats.cpp:180-188. Y los nombres van COMO LOS MANDA EL MOTOR,
      // con mayúscula: el script compara `if PARAM2 equals 'Proficiency'`, que
      // es una comparación de CADENA (`FStrEq`). Con «proficiency» en
      // minúscula el consejo no saldría nunca y no habría error.
      if (r.subidas > 0) avisarDeHabilidad(p, r.donde);
    }
    if (total > 0) {
      // LA EXPERIENCIA LA DICE EL GUION, y SÓLO el guion.
      //
      // `game_xpgain` — 1: cuánta. Contesta con el mensaje del juego, en verde:
      // «* 25 XP Awarded» (`gplayermessage`, player_main.script), portado en el
      // 65 y con su prueba en `test/juego_efectos65.test.mjs`.
      //
      // EL 86: aquí había además una línea nuestra —«You killed X — N
      // experience (12 recorded: the rest is lost), 1 skill point!»— y era
      // invención entera. En el mod la consola de sucesos NO anuncia la
      // experiencia: su línea está comentada por su autor,
      //
      //     //SendInfoMsg( "You gain %d XP", EnemySkillLevel ); //thothie - XP report - no workie
      //                                                   playerstats.cpp:208
      //
      // o sea que el único anuncio del juego es el verde del guion, y el nuestro
      // era un tercero que lo contradecía con otro número al lado.
      //
      // El recorte al techo del punto siguiente es REGLA de verdad y sigue
      // corriendo —`aprender`, del 41, tira lo que sobra—; lo que se quita es
      // decirlo con cara de mensaje del juego. Es exactamente lo que el 83 hizo
      // con el aviso a los aliados: el mecanismo está bien portado y lo
      // inventado era contarlo. Quien quiera los dos números los tiene en
      // `probe.reaccion` y en las pruebas de `entrenar`, que es donde se miden.
      guionJugador?.llamar("game_xpgain", [String(total)]);
    }
  }
  // ── EL TIRO CON ARCO ──────────────────────────────────────────────────────
  //
  // EL 55: esto eran 260 líneas aquí dentro. Ahora vive en
  // `src/juego/arco.js` y lo que queda es el enganche.
  //
  // Y una cosa que no es evidente, que se queda dicha donde estaba: **la
  // flecha no es un golpe a distancia**. No pasa por `pegar()` ni por
  // `elegirObjetivo`, porque el motor no busca en una esfera ni mira el cono
  // de la vista: traza por delante de la flecha y le da a lo primero que
  // haya. O sea que a un goblin que tengas al hombro le pegas con la espada
  // y **no** con el arco, y a uno a cincuenta metros al revés.
  //
  // LAS DEPENDENCIAS VAN COMO FUNCIONES y no por valor. `equipo.brazo`,
  // `equipo.armaEnMano`, `bichos`, `sesion` y `reloj` se reasignan mientras el
  // juego corre; pasarlos por valor daría un arco que apunta para siempre al
  // que llevabas al entrar y a un reloj parado, **sin un solo error**. Es la
  // lección del 28 —el saco de captadores de la sonda— y muerde igual aquí.
  const arco = montarArco({
    RAPIER,
    world: () => world.world,
    player: () => player,
    U: () => level.unitsPerMetre,
    sesion: () => sesion,
    red: () => red,
    audio: () => audio,
    bichos: () => bichos,
    bichosSolidos: () => bichosSolidos,
    brazo: () => equipo.brazo,
    armaEnMano: () => equipo.armaEnMano,
    catalogoDeFlechas: () => catalogos.flechas,
    catalogoDeBolas: () => catalogos.bolas ?? null,
    reloj: () => reloj,
    suceso,
    potenciaDe,
    destrezaDe,
    repartirExperiencia,
    // La cuenta de muertes la comparten el mandoble y la flecha, y la lee la
    // sonda desde aquí, así que el arco la pide en vez de llevarse una copia.
    alMatar: (i) => { cuentas.muertes++; bichosSolidos?.quitar(i); },
    // EL 97: el área de la flecha del Fénix reparte entre los vivos y la tapa
    // sólo el mundo (la traza de `DoDamage`, que ignora monstruos).
    candidatosVivos: () => candidatosVivos(),
    trazaDelMundo: (a, b) => trazaLibre(a, b),
    JUGADOR,
  });
  const pasoDeFlechas = (dt) => arco.pasoDeFlechas(dt);
  const tirar = (ataque, sostenido) => arco.tirar(ataque, sostenido);

  /**
   * UN PASO DEL BRAZO, y está en una función por la lección del 21 y del 22:
   * **la sonda tiene que llamar a lo que llama el juego.** Dos experimentos
   * seguidos dieron controles en verde sobre código que el bucle no ejecutaba,
   * las dos veces porque la sonda llamaba al módulo por su cuenta. Así que el
   * bucle de fotogramas y `probe.arco` entran por la misma puerta.
   */
  function pasoDelBrazo(dt, pulsado = false) {
    if (!equipo.brazo) return null;
    const e = equipo.brazo.tic(dt, {
      pulsado: Boolean(pulsado),
      // EL 100: `ataqueDeReferencia` es `ataques[0]`, salvo en el Orion Bow,
      // que no tiene ninguno y mira la arquería (bows_orion1.script:167).
      destreza: destrezaDe(equipo.brazo.ataqueDeReferencia),
      // EL 100: el maná de AHORA, que es lo que mira `UseAmmo` (giattack.cpp:898).
      mana: sesion?.personaje?.mana ?? 0,
    });
    // EL 100: EL MANÁ. Se cobra al empezar (`Give(GIVE_MP, -flMPDrain)`,
    // giattack.cpp:1052-1053, con el recorte a cero de `Give`,
    // msmonsterserver.cpp:1971-1999); sin bastante, el ataque se cancela, el
    // aguante se va igual (:357 va antes que :392) y sale el gris del motor.
    if (e.gastaMana > 0 && sesion?.personaje) {
      sesion.personaje.mana = Math.max(0, (sesion.personaje.mana ?? 0) - e.gastaMana);
      sesion.tocado?.();
    }
    // ── EL ARMA QUE ATACA POR SU GUION (la Blood Drinker) ──────────────────
    //
    // En el motor todo ataque llama a `<retorno>_start` al empezar y a
    // `<retorno>_strike` al caer (giattack.cpp:345 y :877). Aquí sólo para las
    // armas de `ARMAS_QUE_INVOCAN` y sin servidor (`guionVivoDelArma`): en
    // ellas el `_strike` es quien hace el `createnpc`. Lo que su guion deje
    // puesto con `setviewmodel` es lo que se ve en la mano (abajo).
    const vivo = guionVivoDelArma();
    if (e.sinMana) {
      // `_start` va ANTES de `UseAmmo` (:345 y :392): sin maná el guion corre
      // igual y dice lo suyo antes que el motor («Blood Drinker: Insufficient
      // mana for Blood Dance», swords_blood_drinker.script:156-162).
      vivo?.llamar(`${e.sinMana.retorno}_start`, []);
      fatiga.aguante = Math.max(0, fatiga.aguante - equipo.brazo.aguanteDe(e.sinMana));
      suceso("nopuedes", "You don't have enough MP");
    }
    // Y el Orion Bow: sus mensajes y su bola (src/play/orion.js).
    for (const m of e.mensajes ?? []) suceso(m.tipo, m.texto);
    if (e.bola) arco.tirarBola(e.bola);
    if (e.empieza) {
      // La animación la elige el arma entre sus tres (`ATTACK_ANIMS`), y
      // se pone UNA VEZ: `playviewanim` no repite.
      //
      // Y un arco no tiene ataques: tiene TENSAR. Su `ranged_start` hace
      // `playviewanim ANIM_STRETCH` y a los `RANGED_PULLTIME` cambia a la
      // pose de aguantar; aquí basta con la de tensar clavada en el último
      // fotograma, que es lo que se ve.
      const cual = equipo.brazo.esDeTiro ? equipo.brazo.arma?.animaciones?.tensar : e.animacion;
      if (equipo.armaEnMano && cual !== null && cual !== undefined) {
        equipo.armaEnMano.pon(cual, { unaVez: true });
      }
      // `setviewmodel none` en el `_start` del ataque: la Blood Drinker al
      // lanzarse (swords_blood_drinker.script:146-150) y el cuchillo de fuego.
      // En el juego el arma vuelve cuando su invocación llama a `sword_return`
      // (:209-218), que NO está portada: aquí vuelve al acabar el ataque. Es
      // un andamio declarado, y está en `Brazo.vistaDe`.
      //
      // CORRECCIÓN: ya está portada para las armas de `ARMAS_QUE_INVOCAN`: ahí
      // corre el `_start` de verdad y la vista la decide su guion. El andamio
      // se queda para lo demás —el cuchillo de fuego, y cualquier arma con
      // servidor o sin su guion horneado—, donde sigue volviendo al acabar.
      if (vivo) {
        vivo.llamar(`${e.empieza.retorno}_start`, []);
        // Por si se empuñó antes de que hubiera bichos montados (entrando por
        // el menú): el `precache` otra vez, que no hace nada si ya está.
        precargarInvocaciones(equipo.brazo.arma?.id).catch(() => {});
      } else if (e.sinModelo && equipo.armaEnMano) equipo.armaEnMano.visible = false;
      // El silbido va con el mismo retardo que el golpe
      // (`MELEE_SOUND_DELAY MELEE_DMG_DELAY`), así que no suena aquí.
      fatiga.aguante = Math.max(0, fatiga.aguante - equipo.brazo.aguanteDe(e.empieza));
    }
    if (e.golpe) {
      const s = equipo.brazo.arma?.sonidos?.blandir;
      if (s && audio.despierto) audio.unaVez(`snd/${s}`);
      const r = pegar(e.golpe);
      // `<retorno>_strike` con los cuatro parámetros del motor (giattack.cpp:
      // 871-877): qué tocó, dónde acabó la traza, a quién, y si entró. El
      // segundo —el final de la traza— este puerto no lo tiene: va el centro
      // del jugador, que es lo que vale cuando el alcance es 0, como en el
      // lanzamiento. Un guion que lo lea para apuntar todavía no puede (ver
      // `ARMAS_QUE_INVOCAN`).
      if (vivo) {
        const o = mundoDeObjetos.origenDelDueño();
        vivo.llamar(`${e.golpe.retorno}_strike`, [
          r?.objetivo ? "npc" : "none",
          o ? `(${o.map((x) => x.toFixed(2)).join(",")})` : "(0,0,0)",
          r?.objetivo?.ficha ? creados.asaDe(r.objetivo) : "¯NONE¯",
          r?.objetivo && !r.parado ? "1" : "0",
        ]);
      }
    }
    // Y LA CUERDA: el tiro sale al soltar, con lo que se haya tensado.
    if (e.tira) tirar(e.tira, e.sostenido ?? 0);
    // La secuencia que el guion del ataque pone DESPUÉS de empezar: el mazazo
    // del segundo nivel levanta el arma a los 0,9 s (`callevent 0.9 bash`,
    // blunt_base_onehanded.script:83-91). Va antes que `acaba` para que, si
    // caen en el mismo paso, quede el reposo.
    if (e.animacionTardia !== null && e.animacionTardia !== undefined && equipo.armaEnMano) {
      equipo.armaEnMano.pon(e.animacionTardia, { unaVez: true });
    }
    if (e.acaba && equipo.armaEnMano) {
      // Con su guion vivo, que la espada vuelva no lo decide el fin del ataque
      // (0,2 s): lo decide `sword_return`, cuando la invocación lo llama.
      if (!vivo) equipo.armaEnMano.visible = true;
      equipo.armaEnMano.pon(equipo.brazo.arma?.animaciones?.parado ?? 1);
    }
    // LO QUE SE VE EN LA MANO ES `m_ViewModel` (genericitem.cpp:1934-1948):
    // `setviewmodel none` la vacía y `setviewmodel <ruta>` la devuelve. Se lee
    // en cada paso porque quien la devuelve no es el brazo sino la invocación,
    // desde su propio reloj. `undefined` es «el guion no lo ha tocado».
    if (vivo && equipo.armaEnMano && vivo.vista !== undefined) {
      const seVe = vivo.vista !== null;
      // Al VOLVER, el modelo en reposo: `sword_return` -> `setviewmodel MODEL_VIEW`.
      if (seVe && !equipo.armaEnMano.visible && !equipo.brazo.atacando) {
        equipo.armaEnMano.pon(equipo.brazo.arma?.animaciones?.parado ?? 1);
      }
      equipo.armaEnMano.visible = seVe;
    }
    // LAS FLECHAS EN EL AIRE, con el paso fijo: a 750 u/s, medir el vuelo con el
    // `dt` de dibujo cambia el punto de impacto según los fotogramas.
    if (arco.flechasEnVuelo.length) pasoDeFlechas(dt);
    // EL 101: lo que está reventando sigue su reloj aunque ya no vuele nada.
    arco.pasoDeEfectos(dt);
    return e;
  }

  // El arnés de física del paseo. Vive aquí y no en `bichos.js` porque es quien
  // tiene el mundo de Rapier: el módulo de los bichos no conoce la física y no
  // tiene por qué. Las dos preguntas son las que hace `UTIL_MoveToOrigin` del
  // motor — ¿hay hueco delante? ¿dónde está el suelo? — y ninguna más.
  // LA VALLA DE LOS MONSTRUOS: los 101 `func_monsterclip`. La mira `avanzar` y
  // NO `libre`, porque en el motor el andar la ve (`sv_move.cpp:44`) y el rumbo
  // del paseo y la vista no (`UTIL_TraceLine` pasa `FALSE` a fuego,
  // `pr_cmds.cpp:335`). Fuera de Rapier a propósito: el jugador la atraviesa.
  //
  // Va en una CONSTANTE y no en `this` del arnés: `avanzar` llama a `suelo(...)`
  // desprendido del objeto, así que ahí dentro `this` es `undefined`. En el
  // servidor no pasa porque el arnés de `fauna.js` son funciones flecha. Lo cazó
  // `sonda:ia` en el primer intento, y no era un fallo que ninguna captura
  // enseñara: era una excepción en mitad del paseo.
  const valla = new Monsterclip(level.monsterclip ?? []);
  const arnesDePaseo = {
    valla,
    libre(x, y, z, dx, dz, dist, i = null) {
      // **Desde la `y` que se da, tal cual.** La cintura la suma `avanzar`
      // (`CINTURA`, manada.js) porque es su decisión, no del mundo: sumándola
      // aquí, el paseo —que traza desde el OJO, msmonsterserver.cpp:1084— se
      // llevaba una segunda cintura y miraba a 2,27 m del suelo.
      const o = { x, y, z };
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
      const delMundo = g ? y + 1.0 - g.timeOfImpact : null;
      // Y EL MONSTERCLIP TAMBIEN ES SUELO para un bicho: `DROP_TO_FLOOR` y
      // `SV_movestep` sacan los dos su `monsterClip` de las banderas de la
      // entidad (pr_cmds.cpp:1696, sv_move.cpp:44). Gana el mas alto.
      const deLaValla = valla?.techo(x, z, y + 1.0, 3) ?? null;
      if (deLaValla === null) return delMundo;
      if (delMundo === null) return deLaValla;
      return Math.max(delMundo, deLaValla);
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
        // CERO A PROPOSITO, y no es que falte (el 82). `range` resta la mitad de
        // las dos anchuras (scriptcmds.cpp:1154), y `m_Width` solo se asigna en
        // el `width` de un guion de NPC (npcscript.cpp:201): el del jugador no
        // lo trae, aunque el jugador sea un `CMSMonster` y entre por la misma
        // rama. Poner aqui los 32 de su caja le regalaria a cada bicho 16
        // unidades de alcance que el motor no da.
        ancho: 0,
        // LA RELACION ES DE CADA BICHO, no una sola para todos: la horneó
        // `tools/bichos.mjs` con la tabla de razas contra `human`. Un solo
        // valor para los 69 haría que o te atacara el pueblo entero o no te
        // atacara nadie.
        relacion: i?.ficha?.relacion ?? 0,
        // EL 93: `FL_ONGROUND` del jugador, que la araña mira antes de saltarle
        // encima (`$get(HUNT_LASTTARGET,onground)`, spider.script:104).
        enSuelo: Boolean(player.grounded),
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
      // El ojo es el alto ENTERO (`pev->view_ofs = Vector(0, 0, m_Height)`,
      // msmonsterserver.cpp:250) y no el 0,9 que había aquí, que era la
      // proporción del JUGADOR. Ver `ojoDe` en `src/play/manada.js`: el 81.
      const o = { x: n.x, y: n.y + ojoDe(i) / U, z: n.z };
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
    // EL 91: devuelve `{parado, dano}` —lo que la defensa hizo con el golpe—
    // porque de eso sale el PARAM1 de `game_dodamage` del bicho: un parry
    // deja `AttackHit = false` (giattack.cpp:1832-1838). `null` es «no lo sé»
    // y la manada lo toma como entrado. Ver `Manada.cazar`.
    //
    // EL 91 (veneno): `tipo` es opcional y por omisión el del bicho. Lo pasa
    // el daño de un EFECTO —el `xdodamage` de `effects/base_dot`—, cuyo tipo
    // es el del veneno («poison_effect») y no el del mordisco: es el que
    // decide que ni el escudo ni el parry lo paren (escudo.js, parry.js) y el
    // elemento del mensaje. Ver `herir` en el `new GuionDelJugador`.
    golpear(i, id, dano, tipo = i?.ficha?.ia?.tipoDano ?? "") {
      if (id !== "jugador" || !(dano > 0)) return null;
      cuentas.golpesRecibidos++;
      if (sesion?.estado !== ESTADO.JUGANDO) return null;
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
        tipo,
        escudo: equipo.brazal?.ficha ?? null,
        postura: equipo.brazal?.postura ?? POSTURA.GUARDADO,
        desplegado: Boolean(equipo.brazal?.desplegado),
        deFrente,
        parry: parryDelPersonaje(),
        // EL 96: lo que lleva, en el orden en que lo cogió (el `Gear`), y
        // quién pega —el `PARAM1` de `game_takedamage`—. Ver armadura.js.
        equipo: [...objetosVivos.values()],
        atacante: i?.ficha?.nombre ?? "none",
      });
      if (d.armadura?.piezas?.length) {
        cuentas.armadura = (cuentas.armadura ?? 0) + 1;
        ultimaArmadura = { antes: dano, despues: d.armadura.dano, piezas: d.armadura.piezas };
      }
      if (d.bloqueo.bloquea) {
        if (d.bloqueo.arriba) cuentas.bloqueos++; else cuentas.desvios++;
        const s = equipo.brazal?.objeto?.sonidos?.bloqueo;
        if (s && audio.despierto) audio.unaVez(`snd/${s}`);
        // `shield_deflect` baja la animacion solo si NO estabas aguantando.
        if (d.bloqueo.baja && equipo.escudoEnMano) {
          equipo.escudoEnMano.pon(equipo.brazal?.objeto?.animaciones?.bajar ?? 2, { unaVez: true });
        }
        if (d.mensaje) suceso("atacado", d.mensaje);
      } else if (equipo.brazal?.atacando && !deFrente) {
        cuentas.fueraDelCono++;
      }
      if (d.parado) {
        cuentas.parados++;
        // LA FRASE LA DICE EL GUION, no este archivo. «You parried the blow!»
        // era **nuestra**: el juego dice otra cosa y con las tiradas dentro —
        //
        //     playermessage ent_me You parry the attack! ( PARRY_ROLL vs. ACCU_ROLL )
        //                                     player/player_main.script, `game_parry`
        //
        // y los seis parámetros son los del motor (msmonsterserver.cpp:2237-2245):
        // atacante, daño, tipo, tirada de parry, |tirada de acierto| y valor.
        // Sin guion se dice lo de antes, para no quedarse mudo.
        const dicho = guionJugador?.llamar("game_parry", [
          i.ficha?.nombre ?? "none", String(dano), tipo,
          String(Math.round(d.parry.tirada)), String(Math.abs(Math.round(d.parry.acc))),
          String(Math.round(d.parry.valor)),
        ]);
        // EL 86: y el respaldo ya no es la frase nuestra. El 65 descubrió que
        // «You parried the blow!» era invención y arregló el camino del guion,
        // pero dejó aquí la vieja para no quedarse mudo sin guion horneado —
        // así que la frase inventada siguió veinte experimentos al lado de su
        // propia corrección. Ahora el respaldo arma EL MISMO texto del guion,
        // con las mismas dos tiradas: lo que cambia es quién lo escribe.
        if (!dicho) {
          suceso("atacado", parryDelJugador(d.parry.tirada, Math.abs(d.parry.acc)));
        }
        return { parado: true, dano: 0 };
      }
      if (!(d.dano > 0)) return { parado: false, dano: 0 };
      // Y QUE TE PEGAN SE DICE, que hasta ahora no se decía en ningún sitio.
      // Es el `HUDEVENT_ATTACKED` del motor —rojo, (240,0,0)— y es el único
      // aviso que tiene el jugador de que la vida que baja tiene un culpable:
      // `"%s hits you: %s %s"`, giattack.cpp:1994.
      //
      // EL 86: la cita estaba bien y el texto no. Poníamos «3.4 damage» y el mod
      // pone `szDamage`, que es `"%.1f%s damage."` con el elemento y el punto
      // (`:1898`), más un tercer hueco que es el corchete de resistencia. Lo
      // arma `src/play/mensajesdecombate.js`, con el detalle de los dos
      // espacios y de por qué el corchete todavía no puede salir.
      suceso("atacado", golpeRecibido({
        nombre: i.ficha.nombre, dano: d.dano, tipo,
      }));
      // `game_damaged` — 1: atacante 2: daño. El guion se apunta que te han
      // atacado (`PL_BEEN_ATTACKED`) y de quién, que es lo que leen después el
      // hechizo de rejuvenecer y la barra de vida.
      // EL 98: por `danado`, la misma que usa la rama `golpeado` con servidor,
      // y con el tipo, que es el PARAM3 del motor (msmonsterserver.cpp:2287).
      guionJugador?.danado({ atacante: i.ficha?.nombre ?? "none", dano: d.dano, tipo });
      // EL 85: `game_struck` del efecto de sentarse — te pegan y dejas de curar.
      // Son `STRUCK_TIME 5` y tres vueltas sin cura, no cinco: ver
      // `cicloDeDescanso`. Va aquí y no dentro del guion del jugador porque el
      // contador vive en el efecto, que es otra entidad.
      emociones.golpeado();
      sesion.danar(d.dano, { porQue: `${i.ficha.nombre ?? "un monstruo"}`, tipo: "golpe" });
      return { parado: false, dano: d.dano };
    },
  };
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
          if (s.encoge) cuentas.encogidas++;
          if (s.huye) { cuentas.huidas++; suceso("normal", `${i?.ficha.nombre ?? "The monster"} flees`); }
          break;
        case "muere":
          suena(suyos.muerte);
          cuentas.muertes++;
          // Y se le quita el cilindro AQUÍ también: el servidor se lo quita en su
          // mundo, pero el jugador choca con el de su navegador. Sin esto el
          // cadáver sigue siendo un muro invisible en la calle.
          if (i) bichosSolidos?.quitar(i);
          // El 83, igual que en el camino de un solo jugador: el aviso a los
          // aliados es real y el TEXTO era nuestro. Ver el comentario largo en
          // el `if (muerto)` de `golpearA`.
          if (s.avisados > 0) cuentas.avisos += s.avisados;
          // Y EL BOTIN, que lo decidio el servidor (el 82). Viaja en el suceso
          // y no se vuelve a sortear aqui: el dado lo tira quien lleva la
          // manada, igual que el daño y el parry. Tirarlo en los dos lados
          // daria dos pellejos distintos para la misma muerte.
          if (i) soltarElBotin(i, s.suelta);
          break;
        case "para":
          // EL 98: aquí sólo se cuenta. La frase es `playermessage
          // $get(PARAM1,id)` —al que pegó y a nadie más,
          // base_monster_shared.script:472-475— y este suceso llega a TODOS
          // los clientes: con servidor se la decía a cada jugador conectado,
          // y al que pegó dos veces (el relevo y el guion del bicho, que corre
          // en el servidor). Ahora el relevo va en `tupegas`, que es sólo suyo.
          cuentas.parados++;
          break;
        case "golpeado":
          // EL 98: el servidor dice que un golpe me ha ENTRADO, ya pasado por
          // la defensa (`Partida._defender`, MSG_ONE). `game_damaged` del guion
          // del jugador —que corre aquí— por la misma `danado` que `golpear`,
          // y `game_struck` del descanso. Los efectos del anfitrión de allí ya
          // lo han recibido allí.
          guionJugador?.danado({ atacante: s.atacante ?? "none", dano: s.dano, tipo: s.tipo ?? "" });
          emociones.golpeado();
          cuentas.golpeados = (cuentas.golpeados ?? 0) + 1;
          break;
        case "tupegas":
          // Se guarda tal cual para la sonda: sin esto, «el techo recorta» sólo
          // se puede comprobar matando algo, y entonces el recorte se esconde
          // detrás de la vida del bicho — un control que pasa sin medir nada.
          ultimoGolpe = s;
          // EL 86: «You missed: too far» era nuestra. El mod dice `"Missed %s."`
          // y no dice por qué (giattack.cpp:1965); el motivo sigue viajando y se
          // lee en `ultimoGolpe`, que es donde lo mira la sonda.
          if (s.lejos) { suceso("malo", falloAsestado(i?.ficha.nombre)); break; }
          // EL 98: EL RELEVO DEL PARRY, como en solitario (`golpearA`): sólo
          // si el guion del bicho no habló (`hablaElGuion`, el 97). Si habló,
          // su `playermessage` ya llegó por el servidor a este cliente.
          if (s.parado) {
            if (!s.hablaElGuion) suceso("ataque", `Your attack was ${s.mensaje ?? i?.ficha.ia?.mensajeDeParry ?? "parried!"}`);
            break;
          }
          if (!s.vale) break;
          // EL INFORME, ahora con el formato del juego y TAMBIÉN en el golpe que
          // mata: el `DoDamage` del mod informa antes de morirse nadie, así que
          // el último espadazo se anuncia igual. Antes aquí se callaba a propósito
          // para dejar sitio a la línea de «You killed», que era nuestra.
          //
          // LO QUE NO VIAJA, declarado y no inventado: el crítico. El dado lo
          // tira el cliente y el servidor sólo devuelve el daño recortado, así
          // que por esta rama no hay `iAccuracyRoll` ni umbral que enseñar y el
          // «CRIT! (n/m)» no sale. Mandarlo es trabajo de red, no de texto; con
          // un número inventado el mensaje mentiría exactamente como mentía antes.
          suceso("ataque", golpeAsestado({
            nombre: i?.ficha.nombre, dano: s.dano ?? 0, tipo: s.tipo,
          }));
          if (s.muerto && s.experiencia?.total > 0) {
            const x = s.experiencia;
            // EL 86, Y ESTE NO ES UN CAMBIO DE TEXTO: con servidor, la
            // experiencia NO SE ANUNCIABA. Quien lo dice en el juego es el guion
            // del jugador —`game_xpgain` → «* 25 XP Awarded», en verde— y esta
            // rama nunca lo llamaba: el único aviso era la línea nuestra de «You
            // killed X — N experience», que es la que el 86 quita por no existir
            // en el mod. Quitarla sin esta llamada dejaba el multijugador mudo,
            // así que el hueco lo enseñó el arreglo. El 81 otra vez: *un arreglo
            // puede dejar al descubierto lo que tapaba*.
            guionJugador?.llamar("game_xpgain", [String(x.total)]);
            // Y con servidor la celebración también: el cartel, el sonido y los
            // colores. Quién ha subido lo dice él, que es quien lleva la hoja.
            for (const donde of x.dondes ?? []) celebrarSubida(donde);
          }
          break;
        case "pega":
          // Un bicho ha acertado. Si el que lo recibe soy yo, se dice: es el
          // `HUDEVENT_ATTACKED` del motor —`"%s hits you: %s %s"`,
          // giattack.cpp:1994— y es el único aviso de que la vida que baja tiene
          // un culpable. EL 86: mismo arreglo que en la rama de un solo jugador,
          // y el tipo del bicho sale de su ficha, que el cliente ya tiene.
          //
          // EL 97: la frase YA NO SE DICE AQUÍ. `s.dano` es el daño de la IA
          // ANTES de la defensa —armadura, escudo, parry—, que desde el 97 corre
          // en el servidor (`Partida._bichoPega`); decirlo aquí era anunciar 7
          // con la coraza dejando 3,15, o un golpe que el parry había parado.
          // La frase con el daño de verdad la manda el servidor a ESTE cliente
          // (`MENSAJE.TEXTO`), como en solitario la dice `golpear` después de
          // la defensa. Ver doc/DEFENSARED_97.md.
          if (s.a === `j${red.yo}`) cuentas.golpesRecibidos++;
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
    // El desvanecido de los paneles de VGUI: medio segundo, con el reloj del
    // juego. `UpdateFade()` va en el `Think()` del panel (vgui_menubase.cpp:64)
    // y aquí también, porque es lo que hace que el menú ENTRE en vez de aparecer.
    vgui?.pensar();
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
    const manda = (!sesion || sesion.estado === ESTADO.JUGANDO)
      && !interfaz?.abierta && !vgui?.atrapaElRaton;
    const q = teclas.intencion();
    // ── LOS CINCO CANDADOS DE SENTARSE (85) ───────────────────────────────
    //
    //     setvard game.effect.canmove 0 / canattack 0 / canrun 0
    //     setvard game.effect.canjump 0 / canduck 0
    //                                 player/emote_sit&stand.script:58-62
    //
    // Van los cinco AQUÍ, sobre la intención, y no repartidos por los sitios que
    // los obedecen: es un solo lugar donde leer qué te quita sentarse, y es
    // además donde el motor los mira —son banderas del efecto que el movimiento
    // consulta, no cinco reglas distintas. Lo que NO se toca es mirar: el guion
    // no quita la vista, y de hecho bajarla 28 unidades es lo único que hace con
    // ella.
    //
    // Y se sueltan un segundo DESPUÉS de pulsar «Stand Up», porque el guion
    // encadena `callevent VIEW_RAISETIME player_sit_freedom` (`:75`): te
    // levantas, la vista sube, y hasta que acaba sigues clavado.
    if (!emociones.puede("mover")) { q.adelante = 0; q.lado = 0; }
    if (!emociones.puede("correr")) q.correr = false;
    if (!emociones.puede("saltar")) q.saltar = false;
    if (!emociones.puede("agacharse")) q.agachar = false;
    if (!emociones.puede("atacar")) { q.atacar = false; q.cubrir = false; }
    // ── EL 97: LAS TRABAS DE LOS EFECTOS ────────────────────────────────
    // Las mismas cinco banderas, pero puestas por un EFECTO (`debuff_stun`,
    // `effect_slow`…) y leídas como las lee `PreThink` (player.cpp:4033-4054).
    // Donde las obedece el motor: NOMOVE pone a cero los ejes (input.cpp:821),
    // NOJUMP y NODUCK no dejan pasar el botón (:911-919), NOATTACK no deja
    // EMPEZAR un ataque (giattack.cpp:253) —y levantar el escudo es uno—.
    //
    // EL 98: con servidor, las del anfitrión de efectos de allí llegan en la
    // foto (`red.trabas`, su `clientdata`) y se juntan con las de aquí como si
    // fueran una sola lista de guiones (`juntarTrabas`). Y lo que quitan lo
    // quita `trabarIntencion`, la misma función que usa `Partida._simular`.
    const trabas = red?.trabas
      ? juntarTrabas(trabasDelJugador(guionJugador), trabasDelCable(red.trabas))
      : trabasDelJugador(guionJugador);
    ultimasTrabas = trabas;
    trabarIntencion(q, trabas);
    // EL 89: el viaje en marcha quita el control (`EnableControl(FALSE)`,
    // msmapents.cpp:1842-1843). La vista no se toca: no se ha medido si el
    // motor la quita también, y se dice.
    if (controlesQuitados) {
      q.adelante = 0; q.lado = 0; q.saltar = false; q.agachar = false;
      q.correr = false; q.atacar = false; q.cubrir = false;
    }
    // Y LAS TRANSICIONES, cada fotograma: en cuáles estás. Con los PIES, como
    // la música (`zonasEn`), que es como este puerto decide «estar dentro» de
    // cualquier `msarea_*`. Sólo con alguien jugando: un personaje que no ha
    // entrado no pisa nada. (Y es `estado`, no `jugando`: `Sesion` no tiene ese
    // campo, y escrito así la condición valdría `undefined` siempre — la línea
    // del `QUIEN_VISTE` más arriba lo usa y nunca es cierto.)
    if (sesion?.estado === ESTADO.JUGANDO) {
      aplicarTransicion(transiciones.tic(
        volumenes.zonasEn(player.feet).filter((z) => z.clase === "msarea_transition")));
    }
    const before = player.feet;
    while (accumulator >= DT) {
      // LA VELOCIDAD SALE DEL PERSONAJE, y eso es lo propio de Master Sword:
      // `WalkSpeed()` la saca de la agilidad y de cuanto cargas, `RunSpeed()`
      // la multiplica por el aguante que te quede, y `ParseSpeed()` la parte
      // por la mitad si estas atacando. Sin personaje, la del perfil.
      let maxima = perfil.walkSpeed * U;
      if (manda && sesion?.personaje) {
        const v = vitalesDelPersonaje();
        const trotabaAntes = fatiga.corriendo;
        fatiga.corriendo = puedeCorrer({
          corriendoYa: fatiga.corriendo,
          pulsaCorrer: q.correr,
          adelante: q.adelante,
          aguante: fatiga.aguante,
          agachado: q.agachar,
          // ATACAR CORTA EL TROTE, y no es un detalle: el cliente del motor
          // borra `PLAYER_MOVE_RUNNING` en cuanto se ataca y no deja arrancar a
          // correr mientras blandes (clplayer.cpp:213 y 365). O sea que no se
          // puede cargar contra alguien dando mandobles.
          atacando: Boolean(equipo.brazo?.atacando),
          rapidez: player.rapidez,
          rapidezAnterior: fatiga.rapidezAnterior,
        });
        // Y LO DICE. `DoSprint` no sólo decide si trotas: manda su
        // `SendEventMsg` a la consola de sucesos, y sin eso el HUD se queda
        // callado en la única cosa que el jugador hace todo el rato. La regla
        // y sus cinco citas están en `src/play/movimiento.js`.
        const aviso = avisoDeCarrera({
          corriendoAntes: trotabaAntes, corriendoAhora: fatiga.corriendo,
          pulsaCorrer: q.correr, adelante: q.adelante, aguante: fatiga.aguante,
          agachado: q.agachar, atacando: Boolean(equipo.brazo?.atacando),
          rapidez: player.rapidez, rapidezAnterior: fatiga.rapidezAnterior,
        });
        if (aviso) suceso(aviso.tipo, aviso.texto);
        maxima = velocidadAndando(v);
        if (fatiga.corriendo) {
          maxima = velocidadCorriendo(maxima, { aguante: fatiga.aguante, aguanteMax: v.aguanteMax });
          fatiga.aguante = Math.max(0, fatiga.aguante - AGUANTE_CORRIENDO * DT);
        } else if (!emociones.actuando()) {
          // ── Y EL `IsActing()` QUE FALTABA (85) ───────────────────────────
          //
          //     else if (player.Stamina < player.MaxStamina() &&
          //              !FBitSet(player.m_StatusFlags, PLAYER_MOVE_RUNNING) &&
          //              !(player.IsActing()))
          //                                            fatigue.cpp:77-79
          //
          // Tres condiciones, y este puerto tenía dos. La tercera estaba
          // **escrita en el comentario de `regeneracionDeAguante`** desde que se
          // portó —«sólo si no corres ni *actúas*»— y no la aplicaba nadie: el
          // 64 con otra ropa, una regla documentada sin quien la cumpla.
          //
          // Lo que cambia: una emoción es una acción (`EFFECT_FLAGS
          // player_action`), así que sentado el aguante **no sube solo**. Y eso
          // explica por qué el guion de sentarse hace `drainstamina ent_me -1000`
          // cada vuelta: si subiera solo, ese comando no haría falta. Las dos
          // piezas encajan, y sin la tercera condición la de sentarse no se
          // podía ni medir — el aguante volvía igual estando o no el comando.
          fatiga.aguante = Math.min(v.aguanteMax, fatiga.aguante + regeneracionDeAguante(v.fuerza) * DT);
        }
        maxima = ajustarVelocidad(maxima, {});
      }
      // EL 97: `pev->maxspeed` de los efectos, que el cliente lee como
      // porcentaje (clplayer.cpp:306-307) y `pmove` como TOPE en unidades
      // (pm_shared.cpp:3050-3053). Ver src/play/trabas.js.
      const conTrabas = velocidadConTrabas(maxima, trabas.porcentaje);
      maxima = conTrabas.maxima;
      fatiga.rapidezAnterior = player.rapidez;
      // EN QUE MEDIO ESTA, preguntado cada paso y no cada fotograma: si se
      // preguntara fuera del bucle, a 20 fotogramas por segundo se entraria al
      // agua tres pasos tarde y se veria como «el agua responde con retraso».
      const pies = player.feet;
      const enAgua = volumenes.nivelDeAguaEn(pies, { agachado: q.agachar });
      const escalera = volumenes.escaleraEn(pies);
      const saltando = manda && q.saltar && player.grounded && !escalera && enAgua < 2;
      // EL 99: con servidor el cuerpo anda los milisegundos ENTEROS de la orden
      // y no el `DT`: la orden lleva `msec` en un byte (16 o 17 a 60 Hz) y eso
      // es lo que corre el servidor y lo que rehace `red.simular`. Con `DT` el
      // navegador iba hasta 0,67 ms por delante o por detrás en cada orden
      // —3 mm a 184 u/s, más que el umbral de 1 mm— y corregía sin que nada
      // estuviera mal. En el motor cada orden se mueve con su propio `msec`, en
      // los dos lados: `pmove->frametime = pmove->cmd.msec * 0.001`
      // (pm_shared.cpp:3166). El resto se guarda para la siguiente (`msecDe`).
      const msOrden = red?.dentro ? red.msecDe(DT) : null;
      const dtCuerpo = msOrden > 0 ? msOrden / 1000 : DT;
      const r = pasoLocal.step(dtCuerpo, manda ? {
        forward: q.adelante, strafe: q.lado, jump: q.saltar, agachar: q.agachar,
        maxima, tope: conTrabas.tope, agua: enAgua, escalera,
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
        const ms = msOrden;
        if (ms > 0) {
          red.apuntar({
            msec: ms,
            yaw: player.yaw, cabeceo: player.pitch,
            adelante: manda ? q.adelante : 0,
            lado: manda ? q.lado : 0,
            botones: (manda && q.saltar ? BOTON.SALTAR : 0)
              | (manda && q.agachar ? BOTON.AGACHAR : 0)
              | (manda && q.correr ? BOTON.CORRER : 0)
              | (manda && equipo.brazo?.atacando ? BOTON.ATACAR : 0)
              // EL 97: el escudo levantado (`IN_ATTACK2`, giattack.cpp:118). El
              // servidor lleva su propio `Brazal` con este botón: es su postura
              // la que decide el bloqueo (`Partida._pasoDelEscudo`).
              | (manda && equipo.brazal?.atacando ? BOTON.ATACAR2 : 0),
          // EL 99: con qué velocidad se ha corrido, para rehacerla igual
          // (`red.simular`). En el motor va dentro del `usercmd` (input.cpp:795).
          }, { velocidad: manda ? { maxima, tope: conTrabas.tope } : null });
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
      // EL CABLEADO (49): tocar y luego pensar, en ese orden y con el paso
      // FIJO, que es lo que hace que los diez segundos del relé del barril
      // sean diez segundos y no «diez fotogramas lentos».
      if (sesion?.estado === ESTADO.JUGANDO) {
        relojDisparadores += DT;
        for (const e of tocandoDisparadores(pies, q.agachar)) {
          disparadores.tocar(e, { nombre: sesion?.personaje?.nombre ?? "jugador" },
            { esJugador: true });
        }
        disparadores.paso();
        aplicarDisparos(disparadores.recoger());
        // EL 77: y los `ms_npcscript` que están corriendo. Va DENTRO del paso
        // fijo y después del bus por la misma razón que el bus: sus relojes son
        // los del motor —`nextthink` cada 0,1 s y el `firedelay` de 4 s de
        // `edrinstrict1`— y con el paso del fotograma serían «cuatro fotogramas
        // lentos». Y después, no antes, porque una escena puede arrancar en
        // este mismo paso y su primer `MoveThink` toca dentro de 0,1 s.
        // Lo que una escena dispare al acabar sale por `dispararDelMapa`, que
        // ya recoge y aplica: no hace falta un segundo `recoger` aquí, y
        // ponerlo «por si acaso» es lo que esconde un pedido sin aplicar.
        directorDeEscenas.paso();
        // Y LAS DESLIZANTES (70) se colocan DENTRO del paso fijo, no en el
        // bucle de dibujo. Son cuerpos cinemáticos: moverlos entre dos pasos de
        // física es moverlos sin que Rapier lo vea, y una tapa que se corre
        // media hoja en un solo paso atraviesa al jugador en vez de empujarlo.
        // Y la fracción se le pide al BUS, que es quien la sabe: tenerla aquí
        // también sería la costura del 63.
        if (correderas) {
          correderas.tic((ent) => {
            const e = busPorEntidadBsp.get(ent);
            return e ? disparadores.fraccionDePuerta(e) : NaN;
          });
        }
        // Y LOS OBJETOS EN EL SUELO (71), también dentro del paso fijo: lo que
        // cae lo mueve la gravedad del motor y no el reloj de pared. La traza
        // es la misma que la de la flecha —un objeto cayendo es un PUNTO, lo
        // dice `UTIL_SetSize(pev, 0, 0)` en `FallInit`— y los nodos se colocan
        // después, leyendo del bus y no de una copia.
        pasoDelSuelo(DT);
      }
      // Saltar cuesta aguante: `int JumpEnergy = min(Weight/Volume,1) * 4`, y
      // trunca, asi que con la mochila a menos de un cuarto es gratis.
      if (saltando && sesion?.personaje) {
        const v = vitalesDelPersonaje();
        fatiga.aguante = Math.max(0, fatiga.aguante - aguanteDeSalto(v));
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
        // `game_hitground`, y el parámetro es **`flFallVelocity` tal cual**:
        //
        //     Parameters.add(UTIL_VarArgs("%f", pmove->flFallVelocity));
        //     PMScript->CallScriptEvent("game_hitground", &Parameters);
        //                                       pm_shared.cpp:2938-2944
        //
        // O sea la velocidad de bajada en unidades por segundo, que es
        // exactamente lo que `r.caida` guarda —este puerto lleva su propio
        // `flFallVelocity` desde el 37—. `player_hitgroundhard` la multiplica
        // por 0,05 y exige 12, o sea **240 u/s**: por debajo de eso la vista no
        // se mueve, y el daño no empieza hasta 580. De ahí que un salto normal
        // no haga nada y una caída de verdad hunda la cámara.
        //
        // El guion escribe `game.cleffect.view_ofs.z` y el bucle lo lee: no
        // hay un comando «mueve la cámara». Ver `src/play/efectosdeguion.js`.
        guionJugador?.llamar("game_hitground", [String(Math.round(r.caida))]);
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
      // EL ESCUDO, y va ANTES del equipo.brazo a propósito: `IsShielding()` se consulta
      // dentro de `StartAttack` del arma, así que el estado del escudo de este
      // paso es el que decide si la espada puede salir.
      if (equipo.brazal) {
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
    // LA CÁMARA, y muerto no es la del ojo.
    //
    // `CinematicCamera(TRUE, vOrigin, vAngles)` mete al jugador en
    // `PFLAG_OBSERVER` y hace `SET_VIEW(edict(), CamEntity->edict())`
    // (player.cpp:1068-1085): la vista pasa a una entidad quieta que ya no eres
    // tú. Aquí es lo mismo con dos líneas: mientras `camaraMuerte` valga algo,
    // la cámara no mira por los ojos.
    //
    // EL 52: Y EL MENÚ USA EL MISMO CAMINO. Mientras el menú principal está
    // abierto con fondo vivo, la cámara la lleva `paseoDeMenu` y no el jugador,
    // que sigue quieto donde estaba. Va ANTES que la de la muerte porque el
    // menú se abre también estando muerto —«Disconnect» se pulsa desde ahí— y
    // ahí manda el menú: es la pantalla que tienes delante.
    const paseando = Boolean(menuMs?.abierto && paseoMenu?.valido && menuDeLaTorre);
    if (paseando) {
      // LA CAMARA DEL MENU YA NO ES LA DEL JUGADOR. Cuando el fondo era el mapa
      // habia que conducir `camera`, como hace `camaraMuerte`; con una escena
      // aparte, la torre tiene su propia camara y al jugador no se le toca
      // nada. Es mas simple y no hay que devolver nada al entrar.
      menuDeLaTorre.paso(dtFotograma);
      const a = paseoMenu.avanzar(dtFotograma, { raton: menuMs.raton });
      if (a && camaraDeLaTorre) {
        camaraDeLaTorre.position.set(a.pos[0], a.pos[1], a.pos[2]);
        camaraDeLaTorre.rotation.set(a.pitch, a.yaw, 0);
      }
    }
    if (!paseando && camaraMuerte) {
      camera.position.set(camaraMuerte.pos[0], camaraMuerte.pos[1], camaraMuerte.pos[2]);
      camera.rotation.set(camaraMuerte.pitch, camaraMuerte.yaw, 0);
    } else {
      colocarCamaraDelOjo();
    }
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
    // La caja de cielo se queda siempre centrada EN LA CAMARA, que es lo que hace
    // `MakeSkyVec` sumandole `RI.cullorigin`: un cielo que no sigue a la camara
    // tiene paralaje, y el paralaje lo convierte en una caja pintada.
    //
    //     v[j] += RI.cullorigin[j];              gl_warp.c:243
    //     VectorCopy( RI.vieworg, RI.cullorigin );   gl_rmain.c:359
    //
    // EL 84: ERA `eye` Y TIENE QUE SER LA CAMARA, y la diferencia no es de estilo.
    // `cullorigin` es `vieworg`, o sea el origen de VISTA, y en este puerto la
    // vista es `eye` MAS el desplazamiento del guion del jugador — eso es
    // exactamente lo que hace `colocarCamaraDelOjo` doce lineas mas arriba. Con
    // `eye` a secas, el cielo se quedaba sin ese desplazamiento.
    //
    // Andando no se veia, y por eso vivio hasta el 85: andar no mueve la vista
    // respecto al ojo. **El aterrizaje de un salto si**, porque hunde la camara,
    // y medido daba 11,8 unidades de paralaje —unos treinta centimetros— contra
    // 0,000 andando 251 unidades. Lo reporto un jugador, no una prueba: «cuando
    // salto fuera del templo el skybox se mueve».
    //
    // Va DESPUES de `colocarCamaraDelOjo()`, y el orden es parte del arreglo: leer
    // `camera.position` antes de colocarla daria el fotograma anterior, que es un
    // fallo de un fotograma de retraso — invisible andando y visible saltando,
    // o sea el mismo sintoma otra vez y mas dificil de encontrar.
    if (mallaCielo) mallaCielo.position.copy(camera.position);
    // El agua se mueve. Quieta se lee como suelo pintado de azul, que es la
    // leccion del rio de Corinth y vale igual aqui.
    for (const m of aguas) if (m.map) m.map.offset.set((now / 26000) % 1, (now / 9000) % 1);
    carteles.animar(now / 1000);
    // EL 82: los haces. Hay que recalcularlos cada fotograma y no es una
    // optimización que falte: el lado de un haz es perpendicular a la VISTA
    // (`CrossProduct( RI.vforward, vecBeamCenter, pPerp )`, gl_beams.c:83-91),
    // así que un cuadrilátero fijo desaparece al mirarlo de canto.
    if (haces.grupo) haces.animar(now / 1000, camera);
    // Y la REVERBERACIÓN: quién gana de los once `env_sound` de Edana. La regla
    // está en `src/play/reverberacion.js` y el sonido en `src/play/audio.js`;
    // esta línea es la costura, que es justo donde se perdieron tres cosas en
    // el 63. Se le pasa el OJO y no los pies: el motor suma `view_ofs` a los
    // dos orígenes, y medir desde los pies cambia el radio en metro y medio.
    // EL REPARTO CORRE AUNQUE EL AUDIO ESTÉ DORMIDO, y no es un detalle de
    // sonda: en el motor el que lleva la cuenta es el SERVIDOR —`m_pentSndLast`
    // y `m_flSndRoomtype` viven en el jugador, sound.cpp:1003-1005— y lo único
    // que necesita al cliente es el `SVC_ROOMTYPE` de aplicarlo. Colgando las
    // dos cosas de `audio.despierto` se perdía la primera, y con ella la única
    // forma de medir el reparto antes de que alguien toque una tecla.
    if (fuentesDeSala.length) {
      salaDelJugador = unTicDeSala({
        fuentes: fuentesDeSala,
        // De metros de escena a unidades del `.bsp`, y **con el signo**: la
        // escena es (x, z, −y) del `.bsp`, así que al volver la `y` lleva menos.
        // Sin el menos el jugador sale reflejado y no entra en el radio de
        // ninguno: el reparto corre, no gana nadie y el `room_type` se queda en
        // 0 sin un solo error. Lo cazó la sonda leyendo «dueño null» con los
        // once montados.
        ojoDelJugador: [
          eye[0] * level.unitsPerMetre,
          -eye[2] * level.unitsPerMetre,
          eye[1] * level.unitsPerMetre,
        ],
        libre: trazaDeSala,
        estado: salaDelJugador,
      });
      if (audio.despierto) audio.reverberacion(tipoQueSeOye({
        tipo: salaDelJugador.tipo,
        // `waterlevel > 2` son los OJOS dentro del agua, no los pies. Se
        // vuelve a preguntar aquí porque el `enAgua` del paso vive dentro del
        // bucle de física y no sale; es la misma llamada, no una cuenta nueva.
        nivelDeAgua: volumenes.nivelDeAguaEn(player.feet, { agachado: false }),
      }));
    }
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
    if (equipo.armaEnMano) equipo.armaEnMano.animar(dtB);
    if (equipo.escudoEnMano) equipo.escudoEnMano.animar(dtB);
    if (muneco) {
      // ── EL 85: UNA EMOCIÓN MANDA SOBRE LA POSTURA ────────────────────────
      //
      // `playanim` es una ORDEN y no un estado, así que se consume: se pide una
      // vez al pulsar la opción y a partir de ahí la postura se sostiene.
      // `emocionEnCurso` es la que decide que la línea de abajo no la pise cada
      // fotograma — y sin ella no habría error, habría una emoción que dura un
      // fotograma, que es exactamente el fallo que el 80 encontró en el ataque.
      const orden = emociones.animacion();
      const postura = emociones.postura();
      if (orden && orden.modo !== "break") {
        muneco.pon(orden.nombre, orden.modo);
      } else if (!postura && !muneco.deUnPase) {
        // Corriendo, la animación de correr. Es lo que hace el motor, que le
        // copia la secuencia al jugador (`MSRDR_COPYPLAYER`), y los nombres los
        // dice `global.script`, no nosotros.
        //
        // Y esta línea corre CADA FOTOGRAMA, que es por lo que hace falta
        // `postura()`: sin ella la pose de sentarse viviría un fotograma.
        // `playanim break` entra por aquí a propósito — romper una animación no
        // es poner otra, es devolverle la postura al cuerpo.
        muneco.pon(fatiga.corriendo ? "run" : (equipo.brazo ? "idle" : "attention"));
      }
      // ── EL 101: EL MUÑECO LLEVA LO QUE LLEVAS ───────────────────────────
      //
      // `RenderGearItem` por cada objeto del `Gear` (clrenderent.cpp:310-312,
      // 458-486). Se mira CADA FOTOGRAMA y no en los sitios donde cambia el
      // equipo, porque esos sitios son muchos —el inventario, el ciclador, la
      // red, una misión que te da algo— y el que se olvide deja un muñeco con
      // la armadura de antes sin un solo error. Preguntar es barato: la regla
      // guarda el aspecto de cada objeto y aquí sólo se compara una firma.
      if (equipoALaVista && sesion?.personaje) {
        const piezas = piezasConCuerpo(
          equipoDelMuneco({ personaje: sesion.personaje, guiones: guionesDeObjeto, fichaDe: fichaDeObjeto }),
          equipoALaVista.manifiesto);
        const firma = firmaDe(piezas);
        if (muneco.firmaDeEquipo !== firma) {
          muneco.firmaDeEquipo = firma;
          muneco.vestir(equipoALaVista.equipo3d, piezas);
        }
        // Y lo que lleva a la vista y NO se puede dibujar, dicho una vez.
        const sinGuion = aLaVistaSinGuion({ personaje: sesion.personaje, guiones: guionesDeObjeto, fichaDe: fichaDeObjeto });
        if (sinGuion.join("|") !== equipoALaVista.sinGuion?.join("|")) {
          equipoALaVista.sinGuion = sinGuion;
          if (sinGuion.length) console.warn(`el muñeco no enseña ${sinGuion.join(", ")}: su guion no está horneado (\`npm run objetos:guion\`).`);
        }
      }
      muneco.animar(dtB);
      muneco.visible = !interfaz?.abierta && (!sesion || sesion.estado === ESTADO.JUGANDO);
    }
    if (bichos) {
      // El reloj de las consecuencias, que es el mismo que el de las
      // animaciones: las esperas del motor son de 1,5 a 30 segundos y sin un
      // reloj propio no se pueden medir.
      reloj += dtB;
      // EL RELOJ DEL GUION DEL JUGADOR (64). Aquí viven los eventos que se
      // repiten solos —la regeneración, 1 hp cada 12 s— y corren **con red y
      // sin ella**: `repeatdelay` es del guion, no del servidor, y el guion
      // del jugador está en el cliente igual que `player_cl_main`. El día que
      // el jugador tenga eventos de servidor habrá que partirlo, y se dirá.
      guionJugador?.paso(dtB);
      // EL 85: el ciclo de descansar, que es un `repeatdelay 5` del efecto de
      // sentarse. Va al lado del reloj del guion y no dentro porque el efecto es
      // otra entidad con su propio guion, y ése no está cargado: son los cuatro
      // `emote_*.script`, que cuelgan del sistema de efectos. Ver
      // `src/play/menujugador.js`.
      emociones.paso(dtB);
      // `game_animate` + `if game.player.speed`: un emote se cancela en cuanto
      // el jugador se mueve. Sentarse no, y además no puede moverse.
      emociones.seMueve(fatiga.rapidezAnterior);
      // Y EL DE LOS OBJETOS (66). Aquí vive la curación pasiva del hechizo de
      // rejuvenecer, que es un `repeatdelay 0.5` dentro del propio objeto: nadie
      // lo llama, arranca por existir. Sin esta línea el objeto está montado y
      // quieto, que es la forma de tener el mecanismo escrito y sin correr.
      //
      // EL 98: con servidor, las piezas que corren allí (`correEnElServidor`:
      // lo puesto y las armaduras, `//#scope server`) NO mueven su reloj
      // aquí. Las dos copias tendrían su `failed_str_req_loop` y el jugador
      // recibiría dos lentitudes y dos avisos cada diez segundos.
      for (const ent of objetosVivos.values()) {
        if (red && correEnElServidor(fichaDeObjeto(ent.id), ent.puesto)) continue;
        ent.paso(dtB);
      }
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
        //
        // ── LA NEGACIÓN QUE FALTABA ──────────────────────────────────────
        //
        // Esto entró en el 52 como `if (paseando)`, sin el `!`, y con eso la
        // IA pensaba **sólo mientras el menú principal estaba abierto** y se
        // paraba en cuanto empezabas a jugar. El síntoma, medido por
        // `sonda:mundo`: seis segundos plantado al lado de un goblin que te
        // VE —el control de línea de visión salía verde— con «0 atacantes» y
        // el bicho paseando.
        //
        // No lo cazó ningún control del 53 y tiene su lógica: desde el 53
        // detrás del menú no hay un solo bicho montado, así que el lado
        // equivocado de este `if` no tiene a quién hacer pensar y no se nota.
        // Dos cambios correctos por separado y un agujero entre los dos.
        //
        // La intención era la buena: con el menú delante el mundo se para.
        if (!paseando) {
          // LAS APARICIONES antes de pensar: 38 de los 69 bichos de Gate City son
          // la ficha de un area y no estan al entrar. A los 3 s salen, y al
          // matarlos vuelven. Ver src/play/aparecer.js.
          //
          // Los cilindros se cuadran aqui porque son de aqui, y se cuadran contra
          // `dormido` y no contra la lista de sucesos: leyendo sucesos, un servidor
          // sin nadie conectado nunca los vacia y el bicho vuelve atravesable.
          // `disparar` es el cable del 68: `perishtarget` y `fireallperish` son
          // `FireTargets` a secas, así que pueden nombrar cualquier entidad del
          // mapa. Sin esto las tres oleadas del corral de Edana no se encadenan.
          for (const id of bichos.aparecer(dtB, { disparar: dispararDelMapa })) {
            const i = bichos.manada.de(id);
            if (!i) continue;
            // Ver el comentario en fauna.js: el invariante es **cilindro si y solo
            // si esta en el mundo**, y al reves deja 69 bichos y 31 cilindros.
            const debeTenerlo = !i.dormido;
            if (i.conCilindro === debeTenerlo) continue;
            if (debeTenerlo) i.conCilindro = Boolean(bichosSolidos?.poner(i));
            else { bichosSolidos?.quitar(i); i.conCilindro = false; }
          }
          // EL 91: la costura. Los golpes de esta manada llegan al guion de
          // cada bicho y los de combate nacen con el suyo; ver
          // `InteraccionesNpc.enchufarA`. Una vez por manada: no hace nada si
          // ya está puesta.
          interacciones.enchufarA(bichos.manada);
          bichos.cazar(dtB, { ...arnesDePaseo, ahora: reloj });
          // LO CREADO CON `createnpc`: su vuelo, su `Think` y su `game_touch`.
          // Después de la caza —los bichos ya están donde van a estar este
          // fotograma— y antes de cuadrar los cilindros. Ver `creados.js`.
          if (creados.paso(dtB)) bichos.refrescar();
          bichosSolidos?.seguir();
        }
      }
      // Y la dlight del glow sobre ellos, que es el mismo camino del motor.
      if (glow.visible) bichos.alumbrar(camera.position, { radio: GLOW.alcance * GLOW.radio, color: [1, 1, 0.5] });
      else bichos.alumbrar(camera.position, { radio: 0 });
    }
    // EL MENU DIBUJA SU PROPIA ESCENA, no el mapa. Y sustituye del todo: el
    // mapa puede no estar cargado siquiera, que es lo que el 53 hizo posible.
    if (paseando) {
      if (camaraDeLaTorre.aspect !== camera.aspect) {
        camaraDeLaTorre.aspect = camera.aspect;
        camaraDeLaTorre.fov = fovDeLaTorre(camera.aspect);
        camaraDeLaTorre.updateProjectionMatrix();
      }
      // El menú tiene suavizado, sombras y salida sRGB propios. La pasada
      // restaura el estado que necesita GoldSrc al terminar.
      pasadaDelMenu.render(menuDeLaTorre.escena, camaraDeLaTorre);
    } else {
      renderer.render(escena, camera);
    }
    // LA VISTA: el arma y el muñeco, encima del mundo. Dentro de la pasada del
    // mundo la punta de la espada se hunde en cada pared, y el muñeco —que está
    // a 12 centímetros del ojo— se mete dentro de todo lo que te acerques.
    // EL 52: NI ARMA NI ESCUDO NI MUÑECO CON EL MENÚ DELANTE. La vista es lo
    // que cuelga del ojo del jugador, y en el menú la cámara no es su ojo: está
    // dando una vuelta por el pueblo. Sin esto la espada viaja con ella,
    // clavada en el centro de la pantalla, delante del menú.
    if (!paseando && (equipo.armaEnMano || equipo.escudoEnMano || muneco)) {
      equipo.armaEnMano?.seguir(camera);
      // El escudo cuelga del ojo igual que el arma y no hay que colocarlo:
      // `v_shields.mdl` trae su propio equipo.brazo y esta dibujado para verse desde
      // ahi. Van los dos en la MISMA pasada para que se tapen bien entre ellos.
      equipo.escudoEnMano?.seguir(camera);
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

  /**
   * EL 94: el empujón de un golpe se suelta solo (`PM_DropPunchAngle`). Es una
   * función y no una línea del bucle para que la sonda, con el bucle parado,
   * llame a ESTA y no a una copia (el 65).
   */
  function pasoDelGolpe(dt) { golpeDeVista = soltarGolpe(golpeDeVista, dt); }

  /**
   * EL 95: `V_CalcShake` (view.cpp:578 → cl_game.c:2243-2290), una vez por
   * fotograma, con el reloj del juego. Sólo CALCULA; lo suma a la cámara
   * `colocarCamaraDelOjo`, que es `V_ApplyShake`. Separadas como en el motor,
   * y por el 65: la sonda llama a ESTA con el bucle parado, no a una copia.
   * `azar` es `COM_RandomFloat(bajo, alto)`: dos números (el 59).
   */
  function pasoDelTemblorDeVista(dt, azar) { pasoDelTemblor(temblor, reloj, dt, azar); }

  function pasoDelHud(dt) {
    // Los `calleventtimed` de los guiones, con el MISMO reloj que todo lo
    // demás. Va antes del `if (!hudMs)` a propósito: una conversación no se
    // puede quedar parada porque el HUD no esté montado.
    interacciones.paso(dt);
    // El velo, el centrado, los carteles y la lluvia. Van ANTES del `return` de
    // abajo a propósito: si el HUD no está montado el jugador se sigue muriendo,
    // y quedarse sin el aviso de la muerte porque falta `hud.json` es
    // exactamente el fallo que ya está documentado un poco más arriba.
    mensajes?.paso(dt);
    pasoDelGolpe(dt);
    pasoDelTemblorDeVista(dt);
    if (chispas?.corriendo) { chispas.seguir(player.eye); chispas.paso(dt); }
    // El cadáver sigue respirando, que es lo que hace el del motor: `CreateCorpse`
    // llama a `ResetSequenceInfo()` y la secuencia se queda andando.
    if (cadaver?.puesto) cadaver.paso(dt);
    // El chat decae con su propio reloj —`ms_txthud_decaytime` son 9 segundos,
    // casi el doble que los sucesos— y va ANTES del `return` de abajo por lo
    // mismo que los mensajes: sin `hud.json` el jugador se sigue pudiendo
    // hablar con los demás.
    chatMs?.paso(dt);
    if (!hudMs) return;
    const p = sesion?.personaje ?? null;
    const lim = sesion?.limites ?? null;
    const v = vitalesDelPersonaje();
    // El tensado del arco para la barra de carga. `cargaMaxima` es el
    // `GetHighestAttackCharge()` del motor, que en un arco vale cero — y eso es
    // justo lo que apaga la barra. Ver `cargaVisible()` en `src/play/hud.js`.
    const at = equipo.brazo?.ataque ?? null;
    hudMs.paso(dt, {
      // Y AQUI **NO** VAN LOS PANELES DE VGUI, que fue un error de una tarde.
      //
      // `panelAbierto` esconde el HUD entero, y eso vale para las pantallas de
      // `interfaz` —elegir personaje, la muerte— que ocupan la pantalla. Un panel
      // de VGUI no: es una ventanita en una esquina y el HUD sigue debajo. En
      // Master Sword las dos cosas son paneles de VGUI hermanos y ninguno esconde
      // al otro; esconder el HUD al hablar con un NPC lo cazo `sonda:vgui29`.
      // EL 52: y el menú principal SÍ va aquí, al contrario que los paneles de
      // VGUI. Es exactamente el caso que esta clave tiene: una pantalla que
      // ocupa la pantalla entera. Hasta el 51 no hacía falta porque el menú era
      // una capa opaca y tapaba el HUD por delante; con el fondo vivo la capa es
      // transparente y las barras de vida se verían flotando sobre el pueblo.
      panelAbierto: Boolean(interfaz?.abierta) || Boolean(menuMs?.abierto),
      vivo: !sesion || sesion.estado === ESTADO.JUGANDO,
      cargado: Boolean(p),
      vida: p?.vida ?? 0, vidaMax: lim?.vidaMax ?? 1,
      mana: p?.mana ?? 0, manaMax: lim?.manaMax ?? 1,
      peso: v.peso, carga: v.carga,
      aguante: fatiga.aguante, aguanteMax: v.aguanteMax,
      tensando: equipo.brazo?.fase === FASE.TENSANDO,
      carga01: equipo.brazo?.fase === FASE.TENSANDO ? cargaDelTiro(equipo.brazo.t, at?.sostener) : 0,
      // `GetHighestAttackCharge()` recorre TODOS los ataques del arma
      // (giattack.cpp:617-625), no el que estés dando. Mientras aquí se miró
      // `equipo.brazo.ataque` —el actual— la barra no salía nunca cargando: entre un
      // mandoble y el siguiente no hay ataque en curso, que es justo cuando se
      // carga. La sonda lo cazó: sonaba el nivel y no se pintaba nada.
      cargaMaxima: Math.max(0, ...(equipo.brazo?.ataques ?? []).map((a) => a.carga ?? 0)),
      // Y la carga de cuerpo a cuerpo, que es la que el motor pinta de verdad:
      // `Attack_IsCharging() && (vCurChargeAmt = Item->Attack_Charge()) > 0`
      // (vgui_health.h:239). No es un tanto por uno, son unidades de carga.
      cargaBruta: equipo.brazo?.carga ?? 0,
      mano: "derecha",
    });

    // El sonido de subir de nivel. Va aquí y no dentro del HUD porque en el
    // motor también sale del panel que pinta la barra —`PlayHUDSound` desde
    // `Update()`— pero el que reproduce es de fuera.
    const sube = vozDeLaCarga.paso(equipo.brazo?.carga ?? 0);
    if (sube) {
      // Se cuenta SIEMPRE y se reproduce sólo si el audio está despierto: en un
      // navegador sin un clic previo no suena nada, y una sonda que midiera el
      // sonido estaría midiendo el permiso del navegador en vez de la regla.
      cuentas.sonidosDeCarga++;
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
      ? { que: "empunar", id: enMano, nombre: catalogos.armas?.get(enMano)?.nombre ?? enMano }
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
  //    Y desde el 76 los adornos con nombre tienen material PROPIO —no van
  //    fundidos—, así que si no entran aquí la perilla del mapa de luz deja
  //    fuera nueve adornos de Edana sin decirlo.
  for (const m of [...materiales, ...adornos.materiales,
                   ...(adornos.nombrados ?? []).flatMap((p) => p.materiales)]) {
    m.userData.conLuz = Boolean(m.lightMap);
  }
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
    get aguante() { return fatiga.aguante; },
    // El 89c: la sonda lo VACÍA para que el relleno de `activate_stuff` se vea
    // (al entrar ya está lleno, que es el valor de reposo).
    set aguante(v) { fatiga.aguante = v; },
    get ambienteSinArchivo() { return ambienteSinArchivo; },
    get animarLuz() { return animarLuz; },
    get aparicion() { return aparicion; },
    get armaEnMano() { return equipo.armaEnMano; },
    // EL 96: ponerse una pieza y lo que hizo la armadura con el último golpe.
    get vestirObjeto() { return vestirObjeto; },
    // EL 101: lo que el muñeco debería enseñar y no puede (sin guion horneado).
    get equipoSinGuion() { return equipoALaVista?.sinGuion ?? []; },
    get ultimaArmadura() { return ultimaArmadura; },
    // EL 97: lo que leen las sondas del equipo (src/play/equipar.js).
    get ultimoMovimiento() { return ultimoMovimiento; },
    get ultimoSoltado98() { return ultimoSoltado98; },
    get manoActiva() { return manoActiva; },
    // EL 97: lo que el bucle leyó de los efectos en el último fotograma.
    get ultimasTrabas() { return ultimasTrabas; },
    get arnesDePaseo() { return arnesDePaseo; },
    get aterrizajes() { return aterrizajes; },
    get atlas() { return atlas; },
    get audio() { return audio; },
    get avisos() { return cuentas.avisos; },
    get bichos() { return bichos; },
    get bichosSolidos() { return bichosSolidos; },
    get blanco() { return blanco; },
    get bloqueos() { return cuentas.bloqueos; },
    get brazal() { return equipo.brazal; },
    get brazo() { return equipo.brazo; },
    get camera() { return camera; },
    // Experimento 41: la muerte y la subida de nivel, para la sonda.
    get mensajes() { return mensajes; },
    get chatMs() { return chatMs; },
    /** El 79: para medir el ALCANCE de la voz, que por el menú no se puede. */
    get interacciones() { return interacciones; },
    /** El 64: el guion del jugador, para la sonda. */
    get guionJugador() { return guionJugador; },
    /** El 85: sentarse y los emotes. SÓLO para leer — ver `probe.emociones`. */
    get emociones() { return emociones; },
    /** El 66: los guiones de los objetos que lleva encima, para la sonda. */
    get objetosVivos() { return objetosVivos; },
    get guionesDeObjeto() { return guionesDeObjeto; },
    /** Y la costura, para que la sonda pueda pedir un montaje tras comprar. */
    get sincronizarObjetosVivos() { return sincronizarObjetos; },
    /** La colocación de la cámara del ojo, para que la sonda no la duplique. */
    get colocarCamaraDelOjo() { return colocarCamaraDelOjo; },
    get chispas() { return chispas; },
    get camaraMuerte() { return camaraMuerte; },
    /** EL 94: el `punchangle` de los golpes, en grados del motor. */
    get golpeDeVista() { return [...golpeDeVista]; },
    get pasoDelGolpe() { return pasoDelGolpe; },
    /** EL 95: el `clgame.shake` (copia) y su paso, para la sonda. */
    get temblor() { return JSON.parse(JSON.stringify(temblor)); },
    get pasoDelTemblor() { return pasoDelTemblorDeVista; },
    get cadaver() { return cadaver; },
    get celebrarSubida() { return celebrarSubida; },
    get candidatosDeGolpe() { return candidatosDeGolpe; },
    get canvas() { return canvas; },
    get carteles() { return carteles; },
    get catalogoDeArmas() { return catalogos.armas; },
    get catalogoDeEscudos() { return catalogos.escudos; },
    get catalogoDeFlechas() { return catalogos.flechas; },
    get catalogoSonido() { return catalogoSonido; },
    get ciclador() { return ciclador; },
    get ciclar() { return ciclar; },
    get confirmarCiclador() { return confirmarCiclador; },
    get corriendo() { return fatiga.corriendo; },
    get cubriendose() { return cubriendose; },
    get cumplir() { return cumplir; },
    get despertarAudio() { return despertarAudio; },
    get destrezaDe() { return destrezaDe; },
    get desvios() { return cuentas.desvios; },
    get embrazar() { return embrazar; },
    get empunar() { return empunar; },
    get encogidas() { return cuentas.encogidas; },
    get enlaceDeRed() { return enlaceDeRed; },
    get escena() { return escena; },
    // El 82: el estado del reparto de `env_sound`. Las dos cosas, porque «la
    // sala es la 13» no distingue el reparto de un valor pegado sin saber quién
    // la puso. Ver `probe.mundo.sala()`.
    get salaDelJugador() { return salaDelJugador; },
    get fuentesDeSala() { return fuentesDeSala; },
    get escudoEnMano() { return equipo.escudoEnMano; },
    get flechasEnVuelo() { return arco.flechasEnVuelo; },
    get flechasPuestas() { return arco.flechasPuestas; },
    get flechazos() { return arco.flechazos; },
    get fueraDelCono() { return cuentas.fueraDelCono; },
    get glow() { return glow; },
    get golpesDados() { return cuentas.golpesDados; },
    get golpesRecibidos() { return cuentas.golpesRecibidos; },
    get grupos() { return grupos; },
    // Lo del 33. `guionDe` va entero porque la sonda necesita el MISMO objeto
    // que usa el menú: si mirara otro, mediría otro alcalde.
    get guionDe() { return instancia => interacciones.guionDe(instancia); },
    get guionesVivos() { return interacciones.guionesVivos; },
    get relojDeGuiones() { return interacciones.reloj; },
    get creados() { return creados; },
    get guionVivoDelArma() { return guionVivoDelArma; },
    get precargarInvocaciones() { return precargarInvocaciones; },
    // EL 91: lo que la costura ha hecho y lo que se ha quedado por el camino.
    get costuraDeBichos() { return interacciones.costura; },
    get fichaDeGuiones() { return fichaDeGuiones; },
    get gruposDetalle() { return gruposDetalle; },
    get vgui() { return vgui; },
    get retratosDelPanel() { return retratosDelPanel; },
    get hudMs() { return hudMs; },
    get huidas() { return cuentas.huidas; },
    get impactos() { return cuentas.impactos; },
    // El 80: por dónde entró el golpe. Ver el comentario en `cuentas`.
    get porLaLinea() { return cuentas.porLaLinea; },
    get contraPared() { return cuentas.contraPared; },
    get interfaz() { return interfaz; },
    // Las ventanas de Valve. Se devuelve el mando entero y no un resumen porque
    // la sonda necesita `estado()`, pero OJO: la sonda no tiene que abrir con
    // esto la primera vez —para eso está la G—, sólo leer y encadenar.
    vgui2: () => vgui2,
    // LOS AJUSTES APLICADOS (experimento 37). Lo que se expone es el EFECTO y
    // no lo que dice la ventana: el ratón devuelve los grados con los que gira
    // de verdad y el audio la ganancia de sus dos canales, porque «la ventana
    // dice 5» y «el juego gira a 5» son dos afirmaciones distintas y la que
    // importa es la segunda.
    get ajustesAplicados() { return { ...ajustesDelJugador }; },
    get raton() { return raton; },
    get luzRehecha() { return ultimaLuz; },
    // El atlas QUIETO, que es el que mira `ajustes.brilloDelAtlas()`.
    atlasDeLuz: () => atlas?.quieta ?? null,
    get gammaDelAtlas() { return gammaDelAtlas; },
    get keys() { return keys; },
    get level() { return level; },
    get loQueVale() { return loQueVale; },
    get mallaCielo() { return mallaCielo; },
    get mallaDetalle() { return mallaDetalle; },
    get materialBajoLosPies() { return materialBajoLosPies; },
    get materiales() { return materiales; },
    get mapaDeLaPartida() { return mapaDeLaPartida; },
    get menuMs() { return menuMs; },
    get muertes() { return cuentas.muertes; },
    get mundo() { return mundo; },
    get muneco() { return muneco; },
    get municion() { return arco.municion; },
    get municionElegida() { return arco.municionElegida; },
    get otros() { return otros; },
    get parados() { return cuentas.parados; },
    get parryDelPersonaje() { return parryDelPersonaje; },
    get partida() { return partida; },
    get paseando() { return paseando; },
    get pasoDeFlechas() { return pasoDeFlechas; },
    get pasoDelBrazo() { return pasoDelBrazo; },
    get pasoDelEscudo() { return pasoDelEscudo; },
    get pasoDelHud() { return pasoDelHud; },
    get pedidosDePuerta() { return pedidosDePuerta; },
    /** EL 77: el director de escenas — qué corre y qué ha pasado. */
    get directorDeEscenas() { return directorDeEscenas; },
    get pegar() { return pegar; },
    get perfil() { return perfil; },
    get player() { return player; },
    // EL 100: el paso del jugador con `PM_CheckStuck` (src/play/atasco.js).
    get pasoLocal() { return pasoLocal; },
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
    get sonidosDeCarga() { return cuentas.sonidosDeCarga; },
    get status() { return status; },
    get suceso() { return suceso; },
    get tablaDeRazas() { return tablaDeRazas; },
    get teclas() { return teclas; },
    get texturas() { return texturas; },
    get tiros() { return arco.tiros; },
    get trazaLibre() { return trazaLibre; },
    get ultimaFlecha() { return arco.ultimaFlecha; },
    /** EL 97: lo que hicieron los guiones de los proyectiles (src/juego/arco.js). */
    get deGuionDelArco() { return arco.deGuion; },
    /** EL 101: los estallidos montados (`src/render/estallido.js`), para la sonda. */
    get estallidosDelArco() { return arco.estallidos; },
    get ultimoGolpe() { return ultimoGolpe; },
    get velo() { return velo; },
    get velocidadParaLosPasos() { return velocidadParaLosPasos; },
    get vitalesDelPersonaje() { return vitalesDelPersonaje; },
    get volumenes() { return volumenes; },
    // Experimento 49: el cableado, para la sonda.
    get disparadores() { return disparadores; },
    get relojDisparadores() { return relojDisparadores; },
    get disparosSinPortar() { return sinPortar; },
    /**
     * EL 73: disparar un nombre del mapa POR DONDE LO DISPARA EL JUEGO, o sea
     * por `dispararDelMapa`, que es quien llama a `aplicarDisparos`.
     *
     * No vale `probe.disparadores.disparar(...)`: eso mete las salidas en la
     * cola y no las reparte, así que la sonda vería el bus moverse y la pantalla
     * quieta — un verde que mide el modelo y no el juego, que es el apartado 4
     * de CLAUDE.md por octava vez.
     */
    dispara(nombre) { return dispararDelMapa?.(nombre) ?? null; },
    /** El censo de los adornos CON NOMBRE y su estado de dibujo (el 76). */
    censoDeAdornos() { return adornos?.censo?.() ?? []; },
    get escenasDeNpc() { return escenasDeNpc; },
    /** Las fichas despertadas por nombre (el 68): `boar2`, `boar3`, `boarboss`. */
    get despertadas() { return despertadas; },
    /** El estado de una ficha del aparecedor, por su `targetname` (el 68). */
    fichaLlamada(nombre) {
      const ap = bichos?.aparecedor;
      if (!ap) return null;
      for (const [id, v] of ap.porId) if (v.ficha.nombre === nombre) return { id, ...ap.fichaDe(id) };
      return null;
    },
    // ── EL 69: lo que se rompe, se pulsa y se suelta ─────────────────────────
    get rompibles() { return rompibles; },
    /** Para que la sonda pueda entrar por el MISMO sitio por donde entra el golpe. */
    aplicarDisparos: (salidas) => aplicarDisparos(salidas),
    get rotos() { return rotos; },
    get botonesPulsados() { return botonesPulsados; },
    get objetosSueltos() { return objetosSueltos; },
    get golpesARompibles() { return golpesARompibles; },
    // ── EL 71: lo que hay tirado por el suelo ───────────────────────────────
    /** El censo del BUS: dónde está cada cosa, en qué estado y cuánto le queda. */
    censoDelSuelo() { return sueloDelMundo.censo(); },
    /** Y el de los NODOS, leído de Three. Dos fuentes a propósito: si no
     *  coinciden, alguien se mueve y el otro no — el fallo del 69. */
    censoDeNodosDelSuelo() { return objetosEnElSuelo?.censo() ?? []; },
    /** EL 96: los modelos del suelo que se cargan sólo al caer, y esperar uno. */
    get perezosasDelSuelo() {
      return { perezosas: objetosEnElSuelo?.perezosas ?? 0, pedidas: objetosEnElSuelo?.pedidas ?? 0, cargados: objetosEnElSuelo?.n ?? 0 };
    },
    esperarModeloDelSuelo: (guion) => objetosEnElSuelo?.esperar?.(guion) ?? Promise.resolve(false),
    /** EL 96: cuántas veces `empunar` recibió un id que el catálogo no conoce. */
    get armasSinFicha() { return cuentas.armasSinFicha ?? 0; },
    get cuentasDelSuelo() { return { ...sueloDelMundo.cuentas }; },
    /** Cada aterrizaje con el sonido que pidió y su tono. Ver `caidasDelSuelo`. */
    get caidasDelSuelo() { return caidasDelSuelo; },
    /** Qué se cogería AHORA con la tecla, sin cogerlo. Para medir el cono. */
    loQueHayAMano() {
      return sueloDelMundo.candidatos(miradaDeRecogida())
        .map((c) => ({ i: c.objeto.i, guion: c.objeto.guion, punto: c.punto, distancia: c.distancia }));
    },
    /** Por qué NO se coge un objeto: la respuesta de `aMano`, con el motivo. */
    porQueNoSeCoge(i) {
      const o = sueloDelMundo.objetos.find((x) => x.i === i);
      return o ? aMano(o, miradaDeRecogida()) : null;
    },
    /** La tecla `x`, por la misma puerta por la que entra el teclado. */
    coger() {
      const r = cogerDelSuelo();
      return r ? { guion: r.objeto.guion, dejados: r.dejados } : null;
    },
    /** El catálogo del suelo tal como lo lee el juego. */
    catalogoDelSuelo() { return [...(catalogos.suelo ?? new Map()).values()]; },
    // ── EL 72: soltar ───────────────────────────────────────────────────────
    /** La tecla `c`, por la misma puerta por la que entra el teclado. */
    soltar() {
      const o = soltarDelInventario();
      // EL 97: lo que se borra al caer (`deleteme`) no tiene posición: es una marca.
      if (o?.borrado) return { i: null, guion: o.guion, borrado: true };
      return o ? { i: o.i, guion: o.guion, donde: [...o.pos], velocidad: [...o.vel], angulos: [...o.angulos] } : null;
    },
    /** Qué lleva la mano derecha. Es lo que `drop` sin argumento suelta. */
    get loQueLlevaLaMano() { return sesion?.personaje?.manos?.derecha ?? null; },
    /** Los que se quedaron sobre una entidad de brush sin llegar a tocar suelo. */
    get posadosDelSuelo() { return posadosDelSuelo; },
    /**
     * El `pev->angles` y el `v_forward` con los que se tiraría AHORA.
     *
     * Para poder medir el tercio sin soltar nada: el cabeceo que sale no es el
     * de la vista, y eso es la regla (sv_user.cpp:993).
     */
    rumboDeSoltarAhora() {
      const m = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      return {
        mirando: [m.x, m.y, m.z],
        angulos: angulosDeSoltar([m.x, m.y, m.z]),
        forward: rumboDeSoltar([m.x, m.y, m.z]),
      };
    },
    /**
     * El estado de un `func_breakable` o un `func_button`, por su índice en el
     * lump del `.bsp`: la vida que le queda, si está roto y a quién dispara.
     */
    estadoRompible(entidadDelBsp) {
      const e = disparadores?.entidades.find((x) => x.entidad === entidadDelBsp);
      if (!e) return null;
      return {
        clase: e.clase, nombre: e.nombre ?? null, objetivo: e.est.objetivo ?? null,
        vidaInicial: Number(e.vida ?? 0), vida: e.est.vida, roto: e.est.roto,
        pulsado: e.est.pulsado, material: Number(e.material) || 0,
        banderas: Number(e.banderas) || 0,
        enPie: rompibles?.de(entidadDelBsp) ? !rompibles.de(entidadDelBsp).roto : null,
      };
    },
    /** Todos los rompibles y botones del mapa, para no tener que adivinar índices. */
    censoRompibles() {
      return (disparadores?.entidades ?? [])
        .filter((e) => e.clase === "func_breakable" || e.clase === "func_button" ||
                       e.clase === "msitem_spawn")
        .map((e) => ({
          entidad: e.entidad, clase: e.clase,
          nombre: e.nombre ?? e.est.seLlamaba ?? null, seLlamaba: e.est.seLlamaba ?? null,
          objetivo: e.est.objetivo ?? null, vida: e.est.vida, roto: e.est.roto,
          pulsado: e.est.pulsado, soltados: e.est.soltados,
          material: Number(e.material) || 0, guion: e.guion ?? null,
          porDisparo: e.porDisparo ?? null, duracionIgnorada: e.duracionIgnorada ?? null,
        }));
    },
    // ── EL 70: las puertas que se corren ────────────────────────────────────
    get correderas() { return correderas; },
    get puertasMovidas() { return puertasMovidas; },
    get puertasAbiertas() { return puertasAbiertas; },
    /** Dónde está cada deslizante AHORA, leído del nodo y no de nuestra cuenta. */
    censoCorrederas() { return correderas?.censo() ?? []; },
    /** El estado que lleva el BUS de cada puerta, deslizante o rotatoria. */
    censoDePuertas() { return disparadores?.censoDePuertas() ?? null; },
    estadoPuerta(entidadDelBsp) {
      const e = busPorEntidadBsp.get(entidadDelBsp);
      if (!e) return null;
      return {
        clase: e.clase, nombre: e.nombre ?? null, objetivo: e.est.objetivo ?? null,
        estado: e.est.puerta, fraccion: disparadores.fraccionDePuerta(e),
        espera: Number(e.espera ?? 0), duracion: Number(e.duracion ?? 0),
        vueltas: e.est.puertaVueltas ?? 0, volvera: (e.est.puertaPiensa ?? -1) >= 0,
      };
    },
    /** Las rotatorias, con su ángulo real. Para poder ver que NO se abren al tocarlas. */
    censoRotatorias() {
      return (puertas?.puertas ?? []).map((p) => ({
        entidad: p.ficha.entidad ?? null, nombre: p.ficha.nombre ?? null,
        estado: p.estado, angulo: p.angulo, soloUsar: Boolean(p.ficha.soloUsar),
      }));
    },
    get world() { return world; },
  });

  // ── EL 52: PROBAR UN MIRADOR SIN HABERLO ESCRITO TODAVÍA ──────────────────
  //
  // Los miradores de `src/play/miradores.js` se eligen MIRANDO, y para mirarlos
  // hay que poder ponerlos antes de que estén en la tabla. Esto es el huevo y la
  // gallina de este experimento, y se rompe por aquí.
  //
  // Y lo importante: conduce **el mismo `paseoMenu`** que usa el juego, no una
  // cámara paralela. Una sonda que volara por su cuenta mediría otro recorrido
  // que el que verá el jugador, que es el aviso de CLAUDE.md sobre las sondas
  // que entran por un atajo.
  window.probe.miradores = {
    /**
     * Monta la escena de la torre si no está montada.
     *
     * DESDE EL 72 EL JUEGO ARRANCA CON LA PINTURA (`ESCENA_DEL_MENU`), así que
     * `prepararFondoDelMenu` ya no corre solo. Las cinco sondas de la escena no
     * han cambiado ni tienen por qué: miden la torre, y la torre sigue estando.
     * Se monta aquí, cuando alguien la pide, en vez de obligarlas a llamar a un
     * método nuevo — que habría sido tocar cinco sondas para no medir nada
     * distinto.
     *
     * Devuelve `true` si hay escena, montada ahora o de antes.
     */
    encender() {
      if (menuDeLaTorre && paseoMenu?.valido) return true;
      return prepararFondoDelMenu();
    },
    /**
     * Salta a un punto del recorrido, de 0 a 1, sin esperar los dos minutos.
     *
     * ES LO QUE PERMITE MEDIR EL TRAYECTO Y NO SOLO EL FINAL, que es el defecto
     * que tuvieron los miradores de Gate City: se eligieron de una foto en
     * `s = 0` y por el camino la camara pasaba por encuadres malos. La leccion
     * la repitio el 53 con otra ropa —una rotura a proposito que no puso nada
     * rojo porque el control miraba el estado final— asi que aqui el recorrido
     * se puede recorrer a peticion.
     */
    en(s) {
      // Desde el 72 la escena puede no estar montada: se monta al pedirla.
      if (!paseoMenu?.valido) prepararFondoDelMenu();
      if (!paseoMenu?.valido) return null;
      // `faseDelRecorrido` es un coseno, asi que el segundo que da la fase `s`
      // de la IDA es `periodo/(2pi) · acos(1 − 2s)`. Se calcula en vez de
      // avanzar a saltos para que la captura salga exactamente donde se pide.
      const per = paseoMenu.periodo ?? 120;
      const t = (per / (2 * Math.PI)) * Math.acos(Math.max(-1, Math.min(1, 1 - 2 * s)));
      const nuevo = paseoDeMenu({ mirador: paseoMenu.mirador, U: 1, desde: t });
      paseoMenu = nuevo;
      const a = nuevo.avanzar(0, { raton: null });
      if (a && camaraDeLaTorre) {
        camaraDeLaTorre.position.set(a.pos[0], a.pos[1], a.pos[2]);
        camaraDeLaTorre.rotation.set(a.pitch, a.yaw, 0);
      }
      return a;
    },
    /** Adelanta la animación del fondo: cielo, agua y bandera. */
    nubes(segundos = 30) {
      if (!menuDeLaTorre) prepararFondoDelMenu();   // el 72: bajo demanda
      menuDeLaTorre?.paso(segundos);
      return segundos;
    },
    /** Enciende o apaga la capa transparente, para medir el par con la pintura. */
    fondo(si) {
      // Pedir el fondo vivo con la escena sin montar dejaría una capa
      // transparente sobre nada: negro. Desde el 72 hay que montarla antes.
      if (si && !menuDeLaTorre) prepararFondoDelMenu();
      menuMs?.ponerFondo(Boolean(si));
      return menuMs?.estado() ?? null;
    },
    /** Pone un mirador a mano, para iterar recorridos sin recompilar la tabla. */
    poner(mirador) {
      // El 72: la escena ya no se monta sola al arrancar, y sin ella la cámara
      // de la torre no existe y el mirador no se vería.
      if (!menuDeLaTorre) prepararFondoDelMenu();
      const p = paseoDeMenu({ mirador, U: 1 });
      if (!p.valido) return false;
      paseoMenu = p;
      menuMs?.ponerFondo(true);
      if (!menuMs?.abierto) menuMs?.abrir();
      return true;
    },
    /** Que escena hay detras del menu, y con que recorrido. */
    tabla() {
      return {
        escena: menuDeLaTorre ? "torre" : null,
        mirador: paseoMenu?.mirador?.nombre ?? null,
        puntos: paseoMenu?.mirador?.puntos?.length ?? 0,
        segundos: paseoMenu?.periodo ?? null,
      };
    },
    /** Donde esta la camara DEL MENU. En metros: esta escena es nuestra. */
    donde() {
      const c = camaraDeLaTorre;
      return {
        pos: c ? [c.position.x, c.position.y, c.position.z] : null,
        yaw: c ? c.rotation.y : null,
        pitch: c ? c.rotation.x : null,
        paseando: Boolean(menuMs?.abierto && paseoMenu?.valido && menuDeLaTorre),
      };
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
    `${MAPA}.bsp (leido no copiado) · ${level.mesh.triangleCount} triangulos, ` +
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

arrancarJuego().catch((error) => {
  console.error(error);
  document.getElementById("intro").hidden = false;
  say(`FAILED: ${error.message}`);
});
