// EL TIRO CON ARCO: de dónde sale la flecha, contra qué choca y quién se come
// el daño.
//
// Extraído de `src/main.js` (experimento 55), donde eran 267 líneas dentro de
// una función de cuatro mil. La regla del proyectil ya vivía aparte en
// `src/play/proyectil.js`; lo que estaba pegado al archivo grande era el
// pedazo que toca el mundo, y por eso nadie podía probarlo sin arrancar el
// juego entero.
//
// ── POR QUÉ ESTE TROZO Y NO OTRO: se midió ───────────────────────────────
//
// `arrancarJuego` tiene 4 069 líneas antes de la sonda, y no todos sus tramos
// cuestan lo mismo de sacar. Medido con `rollup/parseAst`, que resuelve
// ámbitos —a ojo la lista sale corta y falsa, ver abajo—:
//
//   tramo                    líneas   salen al juego   se reasignan cruzando
//   el golpe (2345-2930)        586        ~25                 varios
//   el mundo  (816-1170)        355         32                    —
//   EL ARCO   (2931-3250)       320          2                    3
//
// Dos nombres cruzan al juego (`flechasPuestas` y el paso de las flechas) y
// seis más los lee sólo la sonda. Ésa es la costura limpia, y por eso es la
// primera. El golpe cuerpo a cuerpo no lo es todavía, y el motivo está en
// `doc/ARCO_55.md`.
//
// ── LO QUE APRENDIÓ LA MEDIDA, y vale para el próximo que reparta ────────
//
// La primera versión del analizador sólo miraba las declaraciones ANTERIORES
// al tramo y dio una lista de dependencias **corta y falsa**:
//
//   `U` se declara en la línea 3512 y este bloque la usa en la 3007. Funciona
//   porque las flechas vuelan más tarde, no porque esté declarada antes; un
//   `const` en zona muerta que nadie pisa.
//
//   `municionElegida` vive en el módulo y se REASIGNA a los dos lados de la
//   frontera, que es el caso caro: mover ese trozo sin darse cuenta habría
//   dejado dos variables distintas con el mismo nombre y ningún error.
//
// ── LAS DEPENDENCIAS SON CAPTADORES, NO COPIAS ───────────────────────────
//
// Es la lección del 28, y aquí muerde igual: `brazo`, `armaEnMano`, `bichos`,
// `sesion` y `reloj` se reasignan mientras el juego corre. Pasarlos por valor
// daría un módulo que apunta para siempre al arco que llevabas al entrar y a
// un reloj parado, **sin un solo error**. Se piden como funciones.

import * as THREE from "three";
import { Flecha, anguloDelTiro, danoDeFlecha, dadoDeFlecha } from "../play/proyectil.js";
import { habilidadDeArma, propiedadesDe, valorDeHabilidad } from "./stats.js";
// EL 97: el daño que pone el GUION del proyectil (lanzas, Fénix, saetas).
import {
  PROYECTILES_DE_GUION, danoDeLanza, explosionDelFenix, danoEnArea,
  esInstantanea, danoDeSaeta, multiplicadorDeSaeta, RAYO_DE_SAETA,
  // EL 98: los tres que faltaban.
  centroDeLaRafaga, rafagaOscura, danoDeSombra, espiralDelArco, golpesDeVuelo,
} from "../play/proyectilguion.js";
import { relacionEnTexto } from "../play/efectos.js";
// EL 100: la bola de maná del Orion Bow.
import { BOLA_DE_MANA, ORION, radioDeLaBola } from "../play/orion.js";
import { ESTALLIDOS, estallidoDelFenix } from "../play/fenix.js";
// EL 86: el informe del golpe lo escribe el mod y no este archivo.
import { golpeAsestado } from "../play/mensajesdecombate.js";

/**
 * Monta el arco sobre el mundo que se le pasa.
 *
 * Todo lo que puede cambiar durante la partida entra como función. Lo que no
 * cambia nunca —`RAPIER`, `U`— entra por valor, y `U` se pide como función
 * igualmente porque el nivel se carga después del menú desde el 53.
 *
 * @returns el arco: su estado, sus pasos y lo que la sonda mira.
 */
export function montarArco({
  // El mundo
  RAPIER, world, player, U,
  // Lo que cambia
  sesion = () => null, red = () => null, audio = () => null,
  bichos = () => null, bichosSolidos = () => null,
  brazo = () => null, armaEnMano = () => null,
  catalogoDeFlechas = () => null, reloj = () => 0,
  // EL 100: las bolas de `armas.json` (`bolas`): la de maná del Orion Bow.
  catalogoDeBolas = () => null,
  // Lo que el arco no sabe hacer y pide prestado
  suceso = () => {}, potenciaDe = () => 0, destrezaDe = () => 0,
  repartirExperiencia = () => {}, alMatar = () => {},
  // EL 97: lo que piden el área del Fénix y la distancia de las lanzas. Los
  // vivos con su CENTRO en unidades (`candidatosVivos` de main.js) y la traza
  // del `DoDamage` de área, que ignora a los monstruos (`trazaLibre`).
  candidatosVivos = () => [], trazaDelMundo = () => true,
  JUGADOR = "jugador",
} = {}) {
  /**
   * LOS CONJUNTOS DE NODOS, uno por MODELO (la `clave` de la carpeta horneada).
   *
   * Hasta el 99 había uno solo, el de `proj_arrow_generic`, y todo lo que volaba
   * se dibujaba con la flecha de madera: la sombra del Unholy Blade
   * (`weapons_projectiles_b36`), la lanza de la Shadow Lance (`b73`), la esfera
   * de Torkalath (`b1`)... El motor pone a cada proyectil su modelo y su
   * submodelo al nacer (`NewGenericItem(sProjectile)`, giattack.cpp:1066, con el
   * `setmodel`/`setmodelbody` de su guion). EL 100: un conjunto por clave, que
   * se montan al empuñar (`ponerConjunto`, desde main.js) con todas las claves
   * que el arma puede tirar (`clavesQueTira`).
   */
  const conjuntos = new Map();
  /**
   * EL 101: LOS ESTALLIDOS, uno por PROYECTIL (`src/render/estallido.js`): lo
   * que se ve al reventar. Se montan al empuñar, igual que los conjuntos de
   * arriba y desde el mismo sitio de main.js (`estallidosQueTira`,
   * `ponerEstallido`).
   */
  const estallidos = new Map();
  const flechasEnVuelo = [];    // `{ flecha, pieza, conjunto }`
  const cuentas = {
    tiros: 0, flechazos: 0, perdidas: 0,
    // EL 97: lo que hizo el guion de cada proyectil, para medir. `golpes` son
    // los daños de guion aplicados (con su porqué), `saetas` los rayos de las
    // ballestas, `explosiones` las del Fénix y `sinPortar` los que tienen un
    // daño de guion que este puerto no corre todavía (se cuentan, no se callan).
    golpesDeGuion: [], saetas: [], explosiones: [], sinPortar: {}, sinMunicion: 0,
    // EL 98: las áreas que corre un guion de proyectil —la ráfaga de la Shadow
    // Lance, la esfera de Torkalath y la sombra del Unholy Blade—, una fila por
    // `xdodamage`, y los tiros que el arco cancela en su `ranged_start`.
    areas: [], cancelados: 0,
    // EL 100: lo que sale sin conjunto montado para su modelo (vuela, no se ve),
    // y las bolas de maná del Orion Bow, una fila por bola.
    sinPieza: 0, bolas: [],
    // EL 101: lo que se PIDE que suene al tirar y al reventar, una fila por
    // sonido con su porqué — y si el audio estaba dormido, también, que eso es
    // lo que separa «no se pidió» de «no se dejó sonar». Lo que de verdad ha
    // sonado lo dice `Audio.ultimas`, no esto. Y las explosiones que no han
    // tenido con qué dibujarse: un estallido sin conjunto montado hace daño y
    // no se ve, que es justo como estaba antes del 101.
    sonidos: [], sinEstallido: 0,
  };
  /**
   * La última que se ha soltado, y no es un adorno de la sonda: es la única
   * forma de seguir UNA flecha. El primer intento la buscaba por la longitud
   * de `flechasEnVuelo` antes y después, y eso falla en silencio —la lista
   * también PIERDE flechas, las que cumplen sus cinco segundos clavadas—, así
   * que a partir del duodécimo tiro la longitud no crecía y la sonda decía «no
   * ha salido ninguna flecha» mientras el goblin perdía vida.
   */
  let ultimaFlecha = null;
  /**
   * LA MUNICIÓN ELEGIDA CON EL CICLADOR. Vivía suelta en el módulo de
   * `main.js` y se reasignaba desde dos sitios; aquí es del arco, que es de
   * quien era, y el ciclador la pone por `elegirMunicion`.
   */
  let municionElegida = null;

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
   * objetos cuyo nombre acaba en `_generic`. O sea que llevar flechas no es
   * tener con qué disparar: es disparar MEJOR —30-60 de daño contra 60-90— y
   * por eso un personaje nuevo, que no lleva ninguna, puede usar el arco desde
   * el minuto cero. Comprobado en el catálogo: `reg.newchar` regala cuatro
   * objetos y ninguno es una flecha.
   */
  function municion(ataque) {
    const tipo = String(ataque?.proyectil ?? "arrow");
    const p = sesion()?.personaje;
    const catalogo = catalogoDeFlechas();
    // EL 97: `reg.attack.ammodrain 0` — el ataque NO lleva munición: «Attack
    // spawns ammo - Player doesn't carry it», y el proyectil sale del catálogo
    // por su NOMBRE (`GetGlobalGenericItemByName(sProjectileType)`,
    // giattack.cpp:910-911 y :1046-1052). Las lanzas de asta, la esfera élfica y
    // la sombra del Unholy Blade. Hasta el 97 se buscaban en la mochila, no
    // estaban, y salía volando la flecha gratis.
    if (ataque?.gastaMunicion === 0) {
      return { ficha: catalogo?.get(tipo) ?? null, gasta: null, porNombre: true };
    }
    // Lo que el jugador haya ELEGIDO con el ciclador manda sobre la búsqueda,
    // que es justo para lo que sirve `selectarrow`: llevando tres clases de
    // flecha, sin esto siempre tiraría la primera que encuentre.
    if (municionElegida) {
      const puesta = (p?.objetos ?? []).find((o) => o?.id === municionElegida && o.n > 0);
      if (puesta && catalogo?.has(puesta.id)) {
        return { ficha: catalogo.get(puesta.id), gasta: puesta };
      }
      // Se acabaron las elegidas: se olvida la elección y se sigue como siempre.
      municionElegida = null;
    }
    const enLaMochila = (p?.objetos ?? []).find((o) => {
      if (!o?.id || !(o.n > 0)) return false;
      if (!catalogo?.has(o.id)) return false;
      // `msstring(sProjectileType).contains("arrow")` contra el nombre del
      // objeto: es una comparación por TEXTO y no por tipo, así que una saeta
      // no entra en un arco ni una flecha en una ballesta.
      return o.id.includes(tipo) && !o.id.endsWith("_generic");
    });
    if (enLaMochila) return { ficha: catalogo.get(enLaMochila.id), gasta: enLaMochila };
    // Sin munición, la gratis es POR TIPO (giattack.cpp:1005-1037): `arrow` da
    // la flecha roma y `bolt` la SAETA tosca —hasta el 97 una ballesta sin
    // saetas tiraba la flecha de arco—. Cualquier otro tipo no tiene gratis: «You
    // don't have any <tipo>» y no hay tiro.
    if (tipo === "arrow") return { ficha: catalogo?.get("proj_arrow_generic") ?? null, gasta: null };
    if (tipo === "bolt") return { ficha: catalogo?.get("proj_bolt_generic") ?? null, gasta: null };
    return { ficha: null, gasta: null, falta: tipo };
  }

  /**
   * LA TRAZA DE UNA FLECHA, y es la que NO ignora a los monstruos: al
   * contrario que la del mandoble, aquí lo que hay en medio es justo lo que
   * importa.
   *
   * Devuelve `{ punto, contra }`, donde `contra` es la instancia del bicho si
   * le ha dado a uno y `null` si ha dado al mundo — que es la diferencia entre
   * `game_projectile_hitnpc` y `game_projectile_hitwall`.
   */
  function trazaDeFlecha(desdeU, hastaU) {
    return trazar(desdeU, hastaU, false);
  }

  /**
   * La misma traza, pudiendo ignorar a los bichos — ninguna flecha de este
   * juego lo hace al volar (las que «atraviesan NPC» se paran al tocarlos, ver
   * `Flecha.miraAdelante`), pero la usa `alturaDelSuelo`.
   */
  function trazar(desdeU, hastaU, sinBichos) {
    const u = U();
    const o = { x: desdeU[0] / u, y: desdeU[1] / u, z: desdeU[2] / u };
    const d = { x: hastaU[0] / u - o.x, y: hastaU[1] / u - o.y, z: hastaU[2] / u - o.z };
    const L = Math.hypot(d.x, d.y, d.z);
    if (!(L > 0)) return null;
    d.x /= L; d.y /= L; d.z /= L;
    const deBicho = sinBichos
      ? new Set((bichosSolidos()?.puestos ?? []).map((q) => q.colisionador.handle)) : null;
    const g = world().castRay(new RAPIER.Ray(o, d), L, true,
      undefined, undefined, undefined, player().body,
      deBicho ? (c) => !deBicho.has(c.handle) : undefined);
    if (!g) return null;
    const t = g.timeOfImpact;
    const punto = [
      (o.x + d.x * t) * u, (o.y + d.y * t) * u, (o.z + d.z * t) * u,
    ];
    const cual = (bichosSolidos()?.puestos ?? [])
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
    const { ficha: flecha, gasta, falta } = municion(ataque);
    if (!flecha) {
      // `SendEventMsg(HUDEVENT_UNABLE, "You don't have any " + sProjectileType)`
      // (giattack.cpp:1032-1033) y el botón se bloquea: no hay tiro.
      if (falta) { cuentas.sinMunicion++; suceso("nopuedes", `You don't have any ${falta}`); }
      return null;
    }
    // EL 98: la esfera de los arcos de Torkalath. El arco pone su daño y su
    // `ranged_start` puede cancelar el tiro (ver `espiralDelArco`).
    let espiral = null;
    if (flecha.id === "proj_arrow_spiral") {
      espiral = espiralDelArco(brazo()?.arma?.id ?? null, {
        escuela: (e) => propiedad("spellcasting", e), arqueria: habilidad("archery"),
      });
      for (const m of espiral.mensajes) suceso("nopuedes", m);
      if (espiral.cancela) { cuentas.cancelados++; return null; }
    }
    const u = U();
    const elBrazo = brazo();
    const elAudio = audio();
    cuentas.tiros++;
    // La munición se gasta AL SOLTAR y no al empezar a tensar. En el motor se
    // gasta en `StartAttack` —o sea al empezar—, y eso es un regalo
    // envenenado: si te mueres tensando, la flecha se ha ido. Aquí no hay
    // forma de morir tensando que no sea morir, así que da el mismo resultado
    // y se hace donde se entiende. Queda dicho porque es una diferencia, no un
    // descubrimiento.
    if (gasta) {
      gasta.n -= 1;
      const s = sesion();
      if (gasta.n <= 0 && s?.personaje) {
        s.personaje.objetos = s.personaje.objetos.filter((o) => o !== gasta);
        // `HUDEVENT_UNABLE` es el gris de «no puedes hacer eso», y quedarte sin
        // flechas es exactamente eso.
        //
        // EL 86: y el texto es el del mod, no el nuestro. «You are out of X» no
        // existe en ninguna parte de `../MSC/`; lo que el juego dice en ESTE
        // mismo punto es
        //
        //     SendEventMsg(HUDEVENT_UNABLE, msstring("This is your last ") + pArrow->m_DisplayName)
        //                                                     giattack.cpp:961
        //
        // y su condición es `pArrow->iQuantity <= 0` (`:950`), o sea la misma
        // que esta de aquí: el momento ya era el correcto. Que la frase diga
        // «ésta es tu última» cuando ya no queda ninguna es del mod, y se porta
        // como está.
        suceso("nopuedes", `This is your last ${flecha.nombre ?? "ammo"}`);
      }
    }

    const r = anguloDelTiro({
      // Se le pasan CEROS y lo que devuelve se usa como incremento: la vista de
      // este proyecto está en radianes y en los ejes de Three, y mezclar los
      // dos sistemas dentro de la regla sería meter la cámara en un módulo que
      // se prueba sin navegador.
      cabeceo: 0, guino: 0, ataque, sostenido,
      habilidad: destrezaDe(ataque),
    });
    // Del sistema del motor al de la escena: su cabeceo positivo mira ABAJO y
    // el de Three mira arriba, y los dos guiños positivos giran a la izquierda.
    const rad = Math.PI / 180;
    const p = player();
    const euler = new THREE.Euler(
      p.pitch - r.cabeceo * rad, p.yaw + r.guino * rad, 0, "YXZ");
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler);

    // El punto de salida: el ojo más `ofs.startpos`, con sus ejes de siempre
    // (derecha, DELANTE, arriba). Los arcos no lo declaran y salen del ojo.
    const ojo = p.eye;
    const derecha = new THREE.Vector3(1, 0, 0).applyEuler(euler);
    const arriba = new THREE.Vector3(0, 1, 0).applyEuler(euler);
    const ofs = ataque.desde ?? [0, 0, 0];
    const desde = [0, 1, 2].map((k) => ojo[k] * u
      + derecha.getComponent(k) * ofs[0] + dir.getComponent(k) * ofs[1]
      + arriba.getComponent(k) * ofs[2]);

    const f = new Flecha({
      desde, hacia: [dir.x, dir.y, dir.z], velocidad: r.velocidad,
      gravedad: flecha.gravedad ?? 1,
      dano: dadoDeFlecha(flecha.dano, Math.random),
      tipoDano: flecha.tipoDano ?? "pierce",
      expira: flecha.duraEnElSuelo ?? 10,
      ficha: flecha,
      // EL 97: `reg.proj.ignorenpc` apaga el rayo de 36 u (giprojectile.cpp:283-284).
      miraAdelante: !flecha.ignoraNpc,
    });
    // EL 98: el área que se repite mientras vuela, con su daño fijado al nacer
    // (`game_tossprojectile`, proj_arrow_spiral.script:65-93, proj_ub.script:63-85).
    const vuelo = PROYECTILES_DE_GUION[flecha.id];
    if (vuelo?.cuando === "enVuelo" && vuelo.portado) {
      const a = flecha.id === "proj_ub"
        ? danoDeSombra({ afliccion: propiedad("spellcasting", "affliction") })
        : { dano: espiral?.dano ?? 0, tipo: espiral?.tipo ?? null, cubo: "archery", radio: vuelo.vuelo.radio, caida: vuelo.vuelo.caida };
      f.areaDeVuelo = { ...a, proximo: vuelo.vuelo.primero };
    }
    // EL 100: la pieza del conjunto de SU modelo, no la de la flecha de madera.
    const { pieza, conjunto } = cogerPieza(flecha);
    if (pieza) conjunto.apuntar(pieza, [ojo[0], ojo[1], ojo[2]], [dir.x, dir.y, dir.z]);
    flechasEnVuelo.push({ flecha: f, pieza, conjunto });
    ultimaFlecha = f;

    // El sonido del arco, que lo pone su propio `ranged_toss`.
    //
    // EL 99: y sólo de un ARCO. El tiro cargado de un arma cuerpo a cuerpo
    // también pasa por aquí, y su `blandir` es el silbido del mandoble; lo que
    // suena en el juego es lo de su guion —el grito y `SOUND_THROW` de
    // `pole_powerthrow_start` (polearms_base.script:374-384), nada en la Unholy
    // Blade (`dark_shard_toss` no existe)—, que no está portado. Mejor callado que
    // el silbido de otra cosa, o la cuerda de un arco que no hay.
    //
    // EL 101: y es `SOUND_SHOOT`, no `SOUND_SWIPE` — `playsound game.sound.weapon
    // game.sound.maxvol SOUND_SHOOT` (bows_base.script:56-58). Hasta hoy se leía
    // `blandir`, que en los quince arcos es `null`, y caía SIEMPRE en la cuerda
    // escrita aquí a mano: las ballestas sonaban a arco (`weapons/bow/crossbow.wav`,
    // bows_crossbow_light.script:14) — o habrían sonado, porque `weapons/bow/` no
    // se horneaba (ver `tools/sonido.mjs`) y no sonaba ninguno.
    const s = elBrazo?.esDeTiro === false ? null
      : (elBrazo?.arma?.sonidos?.disparo ?? elBrazo?.arma?.sonidos?.blandir ?? "weapons/bow/bow.wav");
    if (s) sonar("disparo", s, { volumen: 1 });
    // Y LO QUE TOCA EL PROYECTIL AL NACER: `game_tossprojectile` corre dentro de
    // `TossProjectile` (giprojectile.cpp:114-116), y la flecha del Fénix grita
    // ahí — `svplaysound 0 5 SOUND_PHOENIX`, `monsters/birds/hawkcaw.wav`
    // (proj_arrow_phx.script:33, :54-57). Lo emite LA FLECHA y no el arco, así
    // que suena también si la tira otra arma, y en el sitio de donde sale.
    // «Sound on launch - follows arrow»: en el motor el sonido va pegado a la
    // entidad; aquí se queda donde nació, que para un grito de un segundo y una
    // flecha que se aleja de quien escucha es la diferencia que no se porta.
    for (const g of flecha.sonidos?.alSalir ?? []) {
      sonar("alSalir", g.archivo, { volumen: g.volumen, donde: [desde[0] / u, desde[1] / u, desde[2] / u] });
    }
    const enMano = armaEnMano();
    if (enMano && elBrazo?.arma?.animaciones?.disparar !== null) {
      enMano.pon(elBrazo.arma.animaciones.disparar, { unaVez: true });
    }

    // EL 97: LA SAETA INSTANTÁNEA. `game_tossprojectile` corre dentro de
    // `TossProjectile`, ANTES del `Think()` del fotograma cero
    // (giprojectile.cpp:114-116), y es ahí donde `proj_base` tira su rayo.
    if (esInstantanea(flecha, elBrazo?.arma?.nombre)) {
      saeta(f, flecha, desde, [dir.x, dir.y, dir.z]);
      return f;
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
   * `ProjectileTouch` (giprojectile.cpp:118) con lo que de verdad se aplica a
   * una flecha de arco:
   *
   *   - el daño es el de la flecha por `potencia / 100`, **sin crítico y sin
   *     tirada de acierto** — ver `danoDeFlecha`;
   *   - si le da a un bicho, `game_projectile_hitnpc`; si no,
   *     `game_projectile_hitwall`, que es el que trae el sonido;
   *   - un bicho MUERTO no la para: «Hit a dead monster, keep going» (:144).
   *     Eso aquí no se puede hacer todavía —el colisionador del cadáver se
   *     quita al morir— y queda anotado.
   */
  function aterrizar(f, choque) {
    const i = choque?.contra ?? null;
    const elAudio = audio();
    const deGuion = PROYECTILES_DE_GUION[f.ficha?.id] ?? null;
    // EL 97: lo que el motor no hace y el guion sí. Un daño de guion sin portar
    // se CUENTA aquí, en el sitio donde habría pasado.
    if (deGuion && !deGuion.portado) cuentas.sinPortar[f.ficha.id] = (cuentas.sinPortar[f.ficha.id] ?? 0) + 1;
    // La flecha del Fénix explota al tocar lo que sea —mundo o bicho— porque
    // con `ignorenpc` el motor cae siempre en la rama de la pared.
    if (deGuion?.cuando === "alChocar" && deGuion.portado && choque?.punto) {
      explotarFenix(f, choque.punto);
    }
    // EL 98: la Shadow Lance revienta al aterrizar, toque bicho o pared:
    // `game_projectile_landed` va antes que los dos (giprojectile.cpp:189).
    if (deGuion?.cuando === "alAterrizar" && deGuion.portado && choque?.punto) {
      rafagaDeLaLanza(f, choque.punto);
    }
    // EL 98: la esfera y la sombra atraviesan NPC (`PROJ_IGNORENPC 1`): sin
    // `DoDamage` del motor, y al tocar lo que sea `remove_me` (proj_ub.script:55-61).
    if (!i || i.muerto || deGuion?.cuando === "alChocar" || deGuion?.cuando === "enVuelo") {
      const s = f.ficha?.sonidos?.contraPared ?? [];
      if (s.length && elAudio?.despierto) {
        elAudio.unaVez(`snd/${s[Math.floor(Math.random() * s.length)]}`);
      }
      return null;
    }
    cuentas.flechazos++;
    const elBrazo = brazo();
    const dano = danoDeFlecha({
      dado: f.dano,
      multiplicadorDelArco: elBrazo?.ataques?.[0]?.multiplicadorDeDano ?? 1,
      potencia: potenciaDe(elBrazo?.ataques?.[0] ?? null),
    });
    // El cubo de experiencia va a ARQUERÍA, que es lo que declara el arco, y
    // con la propiedad sorteada igual que en el mandoble.
    const h = habilidadDeArma(elBrazo?.ataques?.[0]?.habilidad ?? "archery");
    const props = h ? propiedadesDe(h.habilidad) : [];
    const prop = h?.propiedad ?? props[Math.floor(Math.random() * props.length)] ?? "power";
    // EL 97: una lanza de asta hace DOS daños, y por este orden: el del motor
    // (`DoDamage` en `ProjectileTouch`, con su base de 0 o 1) y el de su guion
    // (`game_projectile_hitnpc`, giprojectile.cpp:203-206). Con base 0 el
    // primero no existe; con 1 es una centésima. Van como dos golpes.
    if (deGuion?.cuando === "alPegar" && deGuion.portado) {
      const motor = dano > 0 ? herirCon(f, i, dano, { cubo: `${h?.habilidad ?? "archery"}.${prop}` }) : null;
      const g = golpeDeLanza(f, i);
      return g ?? motor;
    }
    // EL 98: un proyectil de guion con el daño de motor de relleno a 0 no
    // apunta un «Hit X: 0» (la Shadow Lance ya hizo lo suyo al aterrizar).
    if (deGuion && !(dano > 0)) return null;
    return herirCon(f, i, dano, { cubo: `${h?.habilidad ?? "archery"}.${prop}` });
  }

  /**
   * UN DAÑO QUE ENTRA, por el camino de siempre: con servidor se pide, sin él
   * `herir` (con su parry), y el informe del motor. Lo usan la flecha, la lanza,
   * la saeta y el área del Fénix: un solo camino, la lección del 63.
   */
  function herirCon(f, i, dano, { cubo = "archery", tipo = null } = {}) {
    const tipoDano = tipo ?? f.tipoDano ?? "pierce";
    // La flecha va por el mismo camino que la espada: con servidor, se pide.
    const laRed = red();
    if (laRed) {
      laRed.pegar({ id: i.id, dano, alcance: 0, cubo, tipo: tipoDano });
      return { objetivo: i, dano, pedido: true };
    }
    const golpe = bichos().herir(i, dano, {
      cubo, tipo: tipoDano, ahora: reloj(), dados: { quien: JUGADOR },
    });
    // Un escudo puede parar una flecha, y eso ya está portado en `herir`.
    if (golpe.parado) {
      // EL 86: «Your arrow was …» era nuestra. La frase del juego la dice el
      // guion del bicho y no distingue con qué le pegaste:
      // `playermessage $get(PARAM1,id) Your attack was PARRY_TYPE`
      // (`monsters/base_monster_shared.script:474`). El `PARRY_TYPE` sí es suyo
      // y es el que pone «dodged!» en las arañas (`spider_base.script:4`).
      // EL 97: sólo si no lo ha dicho ya su guion (ver `golpearA` en main.js).
      if (!golpe.hablaElGuion) suceso("ataque", `Your attack was ${golpe.mensaje ?? "parried!"}`);
      return null;
    }
    if (golpe.muerto) {
      // `alMatar` es del juego y no del arco: sube la cuenta de muertes, que
      // es compartida con el mandoble, y quita el cilindro. Se pide en vez de
      // hacerse aquí porque ese contador lo lee la sonda desde `main.js`.
      alMatar(i);
      repartirExperiencia(i);
    }
    // La misma forma que el golpe de cuerpo a cuerpo, y a propósito: el motor
    // no tiene dos formatos —los dos salen del mismo `fReportHit` de
    // `giattack.cpp`— y «Flecha: 0.5 a Commoner» era un apunte de trabajo.
    //
    // EL 86: el razonamiento era correcto y el formato era el nuestro. El del
    // motor es `"Hit %s: %s %s"` (giattack.cpp:1954), y ni dice la vida que
    // queda ni pone « · dead!». El tipo de una flecha es `pierce` salvo que su
    // guion diga otro, igual que en el resto de este archivo.
    suceso("ataque", golpeAsestado({ nombre: i.ficha.nombre, dano, tipo: tipoDano }));
    return golpe;
  }

  /** El valor de una habilidad del tirador: `$get(ent_expowner,skill.<h>)`. */
  function habilidad(nombre) {
    const props = sesion()?.personaje?.habilidades?.[nombre];
    return props ? valorDeHabilidad(props) : 0;
  }

  /** Una propiedad: `$get(ent_expowner,skill.<h>.<p>)` (scriptcmds.cpp:1651-1676). */
  function propiedad(nombre, prop) {
    return sesion()?.personaje?.habilidades?.[nombre]?.[prop]?.valor ?? 0;
  }

  /** El `origin` del jugador, que en GoldSrc es el CENTRO de su caja, en unidades. */
  function origenDelTirador() {
    const p = player(), u = U();
    const alto = p?.perfil?.height ?? 1.83;
    return [p.feet[0] * u, (p.feet[1] + alto / 2) * u, p.feet[2] * u];
  }

  /** `game_projectile_hitnpc` de una lanza de asta — ver `danoDeLanza`. */
  function golpeDeLanza(f, i) {
    const id = f.ficha.id;
    const yo = origenDelTirador();
    const n = i.nodo?.position;
    const u = U();
    // El `origin` de un monstruo son sus PIES (msmonsterserver.cpp:244).
    const suyo = n ? [n.x * u, n.y * u, n.z * u] : null;
    const distancia = suyo ? Math.hypot(suyo[0] - yo[0], suyo[1] - yo[1], suyo[2] - yo[2]) : Infinity;
    const r = danoDeLanza(id, {
      habilidad: habilidad("polearms"), cargaLanza: null, distancia,
      relacion: relacionEnTexto(i.ficha?.relacion), vivo: !i.muerto && (i.vida ?? 0) > 0,
    });
    cuentas.golpesDeGuion.push({ id, contra: i.ficha?.nombre ?? null, distancia, ...r });
    if (!(r.dano > 0)) return null;
    // `xdodamage ... polearms <tipo>`: la propiedad, sorteada (`GetStatIndices`
    // con una habilidad sin propiedad da -1, scriptcmds.cpp:7438-7447).
    const props = propiedadesDe("polearms");
    const prop = props[Math.floor(Math.random() * props.length)] ?? "power";
    return herirCon(f, i, r.dano, { cubo: `polearms.${prop}`, tipo: r.tipo });
  }

  /** `$get_ground_height(<origen>)`: el suelo de debajo, sin bichos. */
  function alturaDelSuelo(punto) {
    const g = trazar([punto[0], punto[1] + 1, punto[2]], [punto[0], punto[1] - 8192, punto[2]], true);
    return g?.punto?.[1] ?? null;
  }

  /**
   * EL 101: pide un sonido y lo APUNTA. `porQue` es de dónde sale la orden
   * (`disparo`, `alSalir`, `estallido`), y `despierto` si el navegador dejaba
   * sonar: sin gesto del usuario el `AudioContext` está suspendido y no suena
   * nada, que no es lo mismo que no haberlo pedido.
   */
  function sonar(porQue, archivo, { volumen = 1, donde = null } = {}) {
    const elAudio = audio();
    const despierto = Boolean(elAudio?.despierto);
    cuentas.sonidos.push({ porQue, archivo, volumen, donde, despierto });
    if (cuentas.sonidos.length > 64) cuentas.sonidos.shift();
    if (despierto) elAudio.unaVez(`snd/${archivo}`, { volumen, donde });
  }

  /** `game_projectile_hitwall` de la flecha del Fénix — ver `explosionDelFenix`. */
  function explotarFenix(f, punto) {
    const yo = origenDelTirador();
    // `vectorset MY_ORG z $get_ground_height(MY_ORG)` (proj_arrow_phx.script:63).
    const suelo = alturaDelSuelo(punto);
    const centro = [punto[0], suelo ?? punto[1], punto[2]];
    const distancia = Math.hypot(centro[0] - yo[0], centro[1] - yo[1], centro[2] - yo[2]);
    const e = explosionDelFenix({
      distancia, potencia: propiedad("archery", "power"), arqueria: habilidad("archery"),
    });
    // EL 101: LO QUE SE VE Y SE OYE, que va ANTES del daño y no depende de que
    // haya alguien dentro: `clientevent new all items/proj_arrow_phx_cl MY_ORG
    // MY_RADIUS` (proj_arrow_phx.script:99), cinco líneas por encima del
    // `xdodamage` (:104). La llamarada, la luz y el vapor — `src/play/fenix.js`.
    const efecto = lanzarEstallido(f.ficha?.id, centro, e.radio);
    const golpeados = repartirArea(f, centro, { dano: e.dano, radio: e.radio, caida: 0, tipo: e.tipo, cubo: "archery" });
    cuentas.explosiones.push({ centro, distancia, ...e, golpeados, efecto });
    return golpeados;
  }

  /**
   * EL 101: el efecto de cliente de una explosión. Devuelve lo que se pidió y
   * si había con qué dibujarlo. El sonido va aunque no haya dibujo, y al revés:
   * son dos órdenes del guion (`cleffect tempent` y `sound.play3d`,
   * proj_arrow_phx_cl.script:36 y :49) y ninguna espera a la otra.
   */
  function lanzarEstallido(id, centro, radio) {
    if (!ESTALLIDOS[id]) return null;
    const u = U();
    const fx = estallidoDelFenix({ centro, radio });
    const c = estallidos.get(id) ?? null;
    if (c) c.lanzar(fx); else cuentas.sinEstallido++;
    sonar("estallido", fx.sonido.archivo, {
      volumen: fx.sonido.volumen,
      donde: [fx.sonido.donde[0] / u, fx.sonido.donde[1] / u, fx.sonido.donde[2] / u],
    });
    return { ...fx, dibujado: Boolean(c) };
  }

  /** EL 101: el paso de lo que se está viendo reventar. Cada fotograma. */
  function pasoDeEfectos(dt) {
    for (const c of estallidos.values()) if (c.hayVivos) c.paso(dt);
  }

  /**
   * EL 101: qué estallidos puede necesitar este brazo — los de los proyectiles
   * que tira por nombre o por tipo, igual que `clavesQueTira`.
   */
  function estallidosQueTira(elBrazo) {
    const ids = new Set();
    const catalogo = catalogoDeFlechas();
    for (const a of elBrazo?.ataques ?? []) {
      if (a?.tipo !== "charge-throw-projectile") continue;
      const tipo = String(a.proyectil ?? "arrow");
      if (catalogo?.get(tipo)) { if (ESTALLIDOS[tipo]) ids.add(tipo); continue; }
      for (const f of catalogo?.values() ?? []) if (f.id.includes(tipo) && ESTALLIDOS[f.id]) ids.add(f.id);
    }
    return [...ids];
  }

  /**
   * UN `xdodamage <origen> <radio> <daño> <caída>` entre los bichos vivos —
   * el `DoDamage` de área (giattack.cpp:1546-1592): a todo lo que tenga el
   * CENTRO a menos del radio y la línea libre de mundo, `daño · (1 − d/R)^caída`.
   * `cubo` sin punto es una habilidad entera, y la propiedad se sortea
   * (`GetStatIndices` da -1, scriptcmds.cpp:7438-7447).
   */
  function repartirArea(f, centro, { dano, radio, caida = 0, tipo = null, cubo = "archery" }) {
    const golpeados = [];
    if (!(dano > 0) || !(radio > 0)) return golpeados;
    const [hab, fija] = String(cubo).split(".");
    const props = propiedadesDe(hab);
    for (const c of candidatosVivos()) {
      const d = Math.hypot(c.centro[0] - centro[0], c.centro[1] - centro[1], c.centro[2] - centro[2]);
      if (d >= radio) continue;
      // La traza del área ignora a los monstruos (giattack.cpp:1563): sólo
      // el mundo tapa.
      if (!trazaDelMundo(centro, c.centro)) continue;
      const parte = danoEnArea(dano, d, radio, caida);
      if (!(parte > 0)) continue;
      const prop = fija ?? props[Math.floor(Math.random() * props.length)] ?? "power";
      const g = herirCon(f, c.id, parte, { cubo: `${hab}.${prop}`, tipo });
      golpeados.push({ nombre: c.id?.ficha?.nombre ?? null, distancia: d, dano: parte, parado: Boolean(g?.parado) });
    }
    return golpeados;
  }

  /** EL 98: `game_projectile_landed` de la Shadow Lance — ver `rafagaOscura`. */
  function rafagaDeLaLanza(f, punto) {
    const centro = centroDeLaRafaga(punto, alturaDelSuelo(punto));
    const r = rafagaOscura({ afliccion: propiedad("spellcasting", "affliction") });
    const golpeados = repartirArea(f, centro, r);
    cuentas.areas.push({ id: f.ficha.id, t: f.vida, centro, ...r, golpeados });
    return golpeados;
  }

  /** EL 98: un `damage_area` de la esfera o la sombra, en vuelo. */
  function areaEnVuelo(f, t) {
    const a = f.areaDeVuelo;
    const centro = [...f.pos];
    const golpeados = repartirArea(f, centro, a);
    cuentas.areas.push({ id: f.ficha.id, t, centro, dano: a.dano, radio: a.radio, caida: a.caida, tipo: a.tipo, golpeados });
    return golpeados;
  }

  /**
   * `hitscan_bolt` — proj_base.script:180-249. El rayo sale del ORIGEN de la
   * saeta (el ojo más `ofs.startpos`) en su rumbo de vuelo —con el cono y el
   * `aimang` ya puestos— y llega a 8 000 unidades.
   *
   * Dos cosas que se hacen distinto, dichas: (1) el rayo del guion NO se salta
   * al tirador (`$get_traceline(..., npc)` sin `ignore_ent`, script.cpp:2690-2710)
   * y, si se da a sí mismo, lo reintenta a los 0,01 s desde donde la saeta haya
   * llegado (:210-214); aquí el rayo se salta al jugador de entrada, que es a lo
   * que converge ese reintento. (2) Al acertar, el guion TELETRANSPORTA la saeta
   * al bicho y la deja volar (:232-233; `BP_HIT_TARGET` evita el segundo daño,
   * :253-254); aquí se queda clavada en el punto del rayo.
   */
  function saeta(f, flecha, desde, dir) {
    const hasta = [0, 1, 2].map((k) => desde[k] + dir[k] * RAYO_DE_SAETA);
    const g = trazaDeFlecha(desde, hasta);
    const i = g?.contra ?? null;
    // `else local reg.proj.dmg 0` (proj_base.script:56): la saeta no lleva daño
    // de motor. El de verdad va en `danoDeGuion`.
    f.dano = 0;
    f._chocar(g ?? { punto: hasta, contra: null });
    const id = brazo()?.arma?.id ?? null;
    const arqueria = habilidad("archery");
    const multiplicador = multiplicadorDeSaeta(id, arqueria);
    const base = flecha.dano?.max ?? 0;
    const dano = danoDeSaeta({ arqueria, base, multiplicador });
    f.danoDeGuion = dano;
    cuentas.saetas.push({
      ballesta: id, saeta: flecha.id, arqueria, base, multiplicador, dano,
      contra: i && !i.muerto ? (i.ficha?.nombre ?? "bicho") : (g ? "mundo" : null),
      distancia: g?.punto ? Math.hypot(g.punto[0] - desde[0], g.punto[1] - desde[1], g.punto[2] - desde[2]) : null,
    });
    if (!i || i.muerto) {
      // `xdodamage START_TRACE MY_DEST ...` a lo largo de la línea (:226-227):
      // si lo primero es el mundo, no hiere a nadie. Suena la pared.
      const s = flecha.sonidos?.contraPared ?? [];
      const elAudio = audio();
      if (s.length && elAudio?.despierto) elAudio.unaVez(`snd/${s[Math.floor(Math.random() * s.length)]}`);
      return null;
    }
    cuentas.flechazos++;
    const props = propiedadesDe("archery");
    const prop = props[Math.floor(Math.random() * props.length)] ?? "power";
    return herirCon(f, i, dano, { cubo: `archery.${prop}`, tipo: flecha.tipoDano ?? "pierce" });
  }

  /** Un paso de todas las flechas, con el mismo reloj fijo que la física. */
  function pasoDeFlechas(dt) {
    const u = U();
    for (let n = flechasEnVuelo.length - 1; n >= 0; n--) {
      const { flecha: f, pieza, conjunto } = flechasEnVuelo[n];
      const antes = f.volando;
      // EL 100: la bola de maná es `solid 0` (proj_mana2.script:46): atraviesa a
      // los bichos y sólo la para el mundo. Ver `pasoDeBola`.
      if (f.bolaDeMana) {
        if (pasoDeBola(f, dt, pieza, conjunto)) flechasEnVuelo.splice(n, 1);
        continue;
      }
      const choque = f.paso(dt, { traza: trazaDeFlecha });
      if (choque && antes) aterrizar(f, choque);
      // EL 98: el área de la esfera y la sombra, sólo mientras SIGUE volando
      // (`if IS_ACTIVE`; al chocar, `remove_me` lo apaga). Y a los 10 s, o al
      // chocar, `deleteent ent_me`: se va en el acto, sin quedarse clavada.
      if (f.areaDeVuelo) {
        if (f.volando) {
          const g = golpesDeVuelo(f.ficha.id, f.areaDeVuelo.proximo, f.vida);
          f.areaDeVuelo.proximo = g.proximo;
          for (const t of g.instantes) areaEnVuelo(f, t);
        }
        const vida = PROYECTILES_DE_GUION[f.ficha.id]?.vuelo?.vida ?? Infinity;
        if (!f.volando || f.vida >= vida) {
          if (f.volando) cuentas.perdidas++;
          conjunto?.soltar(pieza);
          flechasEnVuelo.splice(n, 1);
          continue;
        }
      }
      // Se la mueve y se la reorienta sólo mientras vuela: una flecha clavada
      // se queda con el ángulo con el que entró, que es lo que hace el motor
      // al pasar a `MOVETYPE_NONE`.
      if (pieza && f.volando) {
        conjunto.apuntar(pieza, [f.pos[0] / u, f.pos[1] / u, f.pos[2] / u], f.vel);
      } else if (pieza && choque) {
        conjunto.apuntar(pieza, [f.pos[0] / u, f.pos[1] / u, f.pos[2] / u], null);
      }
      if (f.caducada) {
        if (f.volando) cuentas.perdidas++;
        conjunto?.soltar(pieza);
        flechasEnVuelo.splice(n, 1);
      }
    }
  }

  /**
   * EL 100: la pieza del conjunto del MODELO de lo que se tira. Sin conjunto
   * montado para esa clave, vuela sin dibujo y se cuenta (`sinPieza`): no se
   * le presta el de la flecha de madera.
   */
  function cogerPieza(ficha) {
    const conjunto = conjuntos.get(ficha?.clave) ?? null;
    if (!conjunto) { cuentas.sinPieza++; return { pieza: null, conjunto: null }; }
    const pieza = conjunto.coger();
    pieza.clave = ficha.clave;
    return { pieza, conjunto };
  }

  /**
   * EL 100: LAS CLAVES DE MODELO que un brazo puede tirar, para montar sus
   * conjuntos al empuñar. Un tiro con nombre (`proj_ub`, `proj_pole_sl`...) o con
   * `ammodrain 0` sale del catálogo por su nombre (giattack.cpp:1046-1048); uno
   * por TIPO (`arrow`, `bolt`) puede tirar cualquier munición del catálogo que
   * case por texto, más la gratis (giattack.cpp:1005-1037, ver `municion`). Y el
   * Orion Bow, su bola.
   */
  function clavesQueTira(elBrazo) {
    const claves = new Set();
    const catalogo = catalogoDeFlechas();
    for (const a of elBrazo?.ataques ?? []) {
      if (a?.tipo !== "charge-throw-projectile") continue;
      const tipo = String(a.proyectil ?? "arrow");
      const propio = catalogo?.get(tipo);
      if (propio) { if (propio.clave) claves.add(propio.clave); continue; }
      for (const f of catalogo?.values() ?? []) if (f.id.includes(tipo) && f.clave) claves.add(f.clave);
    }
    if (elBrazo?.guionDeTiro) {
      const b = catalogoDeBolas()?.get(BOLA_DE_MANA.id);
      if (b?.clave) claves.add(b.clave);
    }
    return [...claves];
  }

  /**
   * EL 100: SOLTAR LA BOLA DE MANÁ del Orion Bow — el `game_-attack1` de
   * bows_orion1.script:174-193:
   *
   *     local L_VEL $relvel($get(ent_owner,viewangles),(0,200,0))
   *     createnpc items/proj_mana2 $get(ent_owner,eyepos) $get(ent_owner,id) L_VEL BALL_SIZE BALL_DMG archery
   *
   * Sale del OJO, a 200 u/s por donde mira la cruceta, sin cono, sin guiño y sin
   * gravedad (`gravity 0`, proj_mana2.script:16). Nada de `anguloDelTiro`: no es
   * un `TossProjectile`, es un NPC con una velocidad.
   */
  function tirarBola({ tamano = 0, dano = 0 } = {}) {
    const ficha = catalogoDeBolas()?.get(BOLA_DE_MANA.id) ?? { id: BOLA_DE_MANA.id, clave: null };
    const u = U();
    const p = player();
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(p.pitch, p.yaw, 0, "YXZ"));
    const desde = [p.eye[0] * u, p.eye[1] * u, p.eye[2] * u];
    const f = new Flecha({
      desde, hacia: [dir.x, dir.y, dir.z], velocidad: BOLA_DE_MANA.velocidad,
      gravedad: BOLA_DE_MANA.gravedad, dano: 0, tipoDano: BOLA_DE_MANA.tipo,
      expira: 0, ficha, miraAdelante: false,
    });
    f.bolaDeMana = { tamano, dano, proximo: BOLA_DE_MANA.primero, golpes: [] };
    cuentas.tiros++;
    cuentas.bolas.push(f.bolaDeMana);
    const { pieza, conjunto } = cogerPieza(ficha);
    if (pieza) {
      conjunto.apuntar(pieza, [p.eye[0], p.eye[1], p.eye[2]], [dir.x, dir.y, dir.z]);
      conjunto.escalar?.(pieza, tamano * BOLA_DE_MANA.escalaPorTamano);
    }
    flechasEnVuelo.push({ flecha: f, pieza, conjunto });
    ultimaFlecha = f;
    return f;
  }

  /**
   * EL 100: un paso de la bola (proj_mana2.script:61-97). Devuelve `true` si se va.
   *
   *   - vuela recto; la para el MUNDO y no los bichos (`solid 0`, :46). Al tocar
   *     pared el efecto de cliente muere en el acto (`collide world;die`,
   *     proj_mana2_cl.script:56) y el NPC en su siguiente `scan_cycle`, sin hacer
   *     daño (`FX_VEL equals L_VEL` deja de cumplirse, :65-74): aquí se va al tocar;
   *   - cada 0,3 s, un área de radio `radioDeLaBola(tamaño)` con el daño entero
   *     (caída 0) en arquería y `magic` (:68);
   *   - cada bicho al que ese área le quita vida le resta UN tamaño a la bola
   *     (`ball_dodamage`, :77-90, que el motor llama una vez por blanco con el
   *     daño en `PARAM6`, giattack.cpp:2037-2058); a cero, se va;
   *   - a los 10 s, se va (:23).
   */
  function pasoDeBola(f, dt, pieza, conjunto) {
    const u = U();
    const b = f.bolaDeMana;
    const choque = f.paso(dt, { traza: (a, c) => trazar(a, c, true) });
    let fuera = Boolean(choque) || f.vida >= BOLA_DE_MANA.vida;
    while (!fuera && b.proximo <= f.vida + 1e-9) {
      const t = b.proximo;
      b.proximo += BOLA_DE_MANA.periodo;
      const radio = radioDeLaBola(b.tamano);
      const golpeados = repartirArea(f, [...f.pos], {
        dano: b.dano, radio, caida: BOLA_DE_MANA.caida, tipo: BOLA_DE_MANA.tipo, cubo: ORION.habilidad,
      });
      const restan = golpeados.filter((g) => g.dano > 0 && !g.parado).length;
      b.golpes.push({ t, radio, dano: b.dano, tamano: b.tamano, golpeados });
      cuentas.areas.push({ id: BOLA_DE_MANA.id, t, centro: [...f.pos], dano: b.dano, radio, caida: 0, tipo: BOLA_DE_MANA.tipo, golpeados });
      b.tamano -= restan;
      if (restan && b.tamano <= 0) fuera = true;
    }
    if (fuera) {
      if (f.volando) cuentas.perdidas++;
      conjunto?.soltar(pieza);
      return true;
    }
    if (pieza) {
      conjunto.apuntar(pieza, [f.pos[0] / u, f.pos[1] / u, f.pos[2] / u], f.vel);
      // `reduce_size` y `update_arrow`: la escala sigue al tamaño (proj_mana2_cl.script:28-35).
      conjunto.escalar?.(pieza, b.tamano * BOLA_DE_MANA.escalaPorTamano);
    }
    return false;
  }

  return {
    municion, trazaDeFlecha, tirar, aterrizar, pasoDeFlechas,
    /** El ciclador elige con qué flecha se tira. `null` vuelve a la búsqueda. */
    elegirMunicion(id) { municionElegida = id ?? null; },
    get municionElegida() { return municionElegida; },
    /**
     * EL 100: los conjuntos, uno por clave de modelo. `empunar` (main.js) pide
     * `clavesQueTira` y monta con `ponerConjunto` las que falten.
     */
    clavesQueTira,
    tirarBola,
    tieneConjunto(clave) { return conjuntos.has(clave); },
    ponerConjunto(clave, c) { if (clave && c) conjuntos.set(clave, c); },
    /** EL 101: los estallidos, uno por proyectil (ver `estallidos`). */
    estallidosQueTira, pasoDeEfectos,
    tieneEstallido(id) { return estallidos.has(id); },
    ponerEstallido(id, c) { if (id && c) estallidos.set(id, c); },
    get estallidos() { return estallidos; },
    /**
     * Lo que antes era EL conjunto, sumado sobre todos: `cuantas` nodos y
     * `puestas` ocupados (lo leen las sondas), y las claves montadas.
     */
    get flechasPuestas() {
      if (!conjuntos.size) return null;
      let cuantas = 0, puestas = 0;
      for (const c of conjuntos.values()) { cuantas += c.cuantas ?? 0; puestas += c.puestas ?? 0; }
      return { cuantas, puestas, claves: [...conjuntos.keys()] };
    },
    get flechasEnVuelo() { return flechasEnVuelo; },
    get ultimaFlecha() { return ultimaFlecha; },
    get tiros() { return cuentas.tiros; },
    get flechazos() { return cuentas.flechazos; },
    get flechasPerdidas() { return cuentas.perdidas; },
    /** EL 97: lo que hicieron los guiones de los proyectiles (ver `cuentas`). */
    get deGuion() {
      return {
        golpes: cuentas.golpesDeGuion, saetas: cuentas.saetas, explosiones: cuentas.explosiones,
        sinPortar: { ...cuentas.sinPortar }, sinMunicion: cuentas.sinMunicion,
        areas: cuentas.areas, cancelados: cuentas.cancelados,
        sinPieza: cuentas.sinPieza, bolas: cuentas.bolas,
        sonidos: cuentas.sonidos, sinEstallido: cuentas.sinEstallido,
      };
    },
  };
}
