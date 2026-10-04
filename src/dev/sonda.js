// LA SONDA: la puerta por la que se mide el juego desde fuera.
//
// Dos mil líneas que no son el juego. Estaban dentro de `mainGateCity` en
// `src/main.js`, y eran el 45 % de esa función: quien abría el archivo para
// tocar la física se encontraba primero con el aparato de medirla.
//
// Aquí no hay ninguna regla nueva y no debería haberla nunca. Esto lee el
// estado del juego y lo devuelve en números para que `build/sondas/*.mjs` pueda
// preguntarle a un Chrome de verdad qué está pasando. La regla del 21 y del 22
// sigue mandando: **la sonda tiene que llamar a lo que llama el juego**, no a
// una copia. Dos experimentos seguidos dieron controles en verde sobre código
// que el bucle no ejecutaba, las dos veces por saltarse eso.
//
// ── Cómo llega aquí el estado del juego ────────────────────────────────────
//
// Por `S`, que es un objeto de **captadores vivos** que arma `main.js`. No es
// una copia: `S.bichos` lee la variable `bichos` en el momento de leerla, y
// `S.running = false` la cambia de verdad. Hacía falta así porque medio juego
// vive en variables que se reasignan —el arma en la mano, el escudo, la sesión,
// las cuentas de golpes—, y una copia las habría congelado en el arranque: la
// sonda diría `0 golpes` para siempre y ningún control se quejaría.
//
// Se sacó con un analizador de verdad (`rollup/parseAst`) y no a golpe de
// expresión regular, resolviendo los ámbitos uno por uno para no tocar ni un
// nombre local. Lo comprueban las trece sondas: unos cuatrocientos controles.

import * as THREE from "three";
// RAPIER se importa AQUÍ y no se pide por `S` (el 80): `montarSonda` no lo
// recibe, y añadirle un getter sería editar la lista alfabética de `main.js`,
// que es de todos. El módulo es el mismo —ESM da una sola instancia— y para
// cuando la sonda existe, `initPhysics()` ya ha corrido.
import RAPIER from "@dimforge/rapier3d-compat";
import { AJUSTES, COMO_EL_MOTOR } from "../play/proyectil.js";
import { FASE, elegirObjetivo } from "../play/golpe.js";
import { GLOW } from "../render/bsp_escena.js";
import { PARTIDA, jugadoresActivos, nivelDeAjuste, vidaTotal } from "../juego/servidor.js";
import { Pasos } from "../play/sonido.js";
import { ajustarVelocidad, danoDeCaida as danoDeCaidaU, velocidadAndando, velocidadCorriendo } from "../play/movimiento.js";
import { animacionDeParado } from "../play/actividad.js";
import { atlasDe } from "../render/studio.js";
import { defensaDelJugador, dentroDelCono2D } from "../play/escudo.js";
import { listarPartidas } from "../red/navegador.js";
import { ACCIONES, nombreDeTecla } from "../juego/teclas.js";
import { CINTURA } from "../play/manada.js";
import { choques, enPantallaCompleta, hayAtrapaTeclado, tecladoAtrapado }
  from "../juego/navegador.js";
import { relacionDeRazas } from "../bsp/razas.js";
import { aplicadorDeBicho } from "../play/efectos.js";

/**
 * Arma `window.probe`.
 *
 * `S` trae el estado vivo del juego. Los nombres son los mismos que dentro de
 * `mainGateCity`, a propósito: así una línea de aquí se puede comparar con la
 * de allí sin traducir nada.
 */
/**
 * UN PASO DE LOS BICHOS, para la sonda, con las APARICIONES dentro.
 *
 * Desde el 39, 38 de los 69 bichos de Gate City son la ficha de un area y no estan
 * en el mundo al entrar: aparecen a los 3 s. `bichos.cazar` no los saca —lo hace
 * `bichos.aparecer`, que en el juego llama el bucle de `main.js`— asi que una sonda
 * que llame solo a `cazar` mide un pueblo sin monstruos y no se entera.
 *
 * Paso: `sonda:ia` se puso en 11 de 15 con cuatro «null» seguidos, y el bicho al
 * que teletransportaba al jugador no existia todavia. **El paso de la sonda tiene
 * que ser el paso del jugador**, y por eso hay UNA funcion y no siete llamadas.
 */
function pasoDeBichos(S, dt, arnes = null, { cazar = true } = {}) {
  if (!S.bichos) return;
  const a = arnes ?? S.arnesDePaseo;
  for (const id of S.bichos.aparecer?.(dt) ?? []) {
    const i = S.bichos.manada.de(id);
    if (!i) continue;
    // Ver el comentario en fauna.js: el invariante es **cilindro si y solo si esta
    // en el mundo**, y escribirlo al reves deja 69 bichos y 31 cilindros.
    const debeTenerlo = !i.dormido;
    if (i.conCilindro === debeTenerlo) continue;
    if (debeTenerlo) i.conCilindro = Boolean(S.bichosSolidos?.poner(i));
    else { S.bichosSolidos?.quitar(i); i.conCilindro = false; }
  }
  if (cazar) S.bichos.cazar(dt, a);
  else S.bichos.pasear(dt, a);
}

export function montarSonda(S) {
  /**
   * LA CÁMARA, con las dos ramas que tiene el bucle desde el 41.
   *
   * Muerto la vista pasa a otra entidad (`CinematicCamera`, player.cpp:1068) y
   * el ojo ya no manda. Está aquí y no repetida en cada sitio para que no pueda
   * quedarse una rama sin la otra — que es como la sonda acabaría midiendo una
   * cámara que el jugador no ve.
   */
  const aplicarCamara = () => {
    if (S.camaraMuerte) {
      const c = S.camaraMuerte;
      S.camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
      S.camera.rotation.set(c.pitch, c.yaw, 0);
      return;
    }
    // EL 65: LA RAMA DEL OJO YA NO SE COPIA AQUÍ. Era una copia de tres líneas
    // del bucle, y el aviso de arriba se cumplió en cuanto el guion del jugador
    // empezó a mover la vista: el juego le sumaba el hundimiento del
    // aterrizaje y **esta copia lo borraba al medirlo**. La sonda habría dicho
    // «la cámara no se mueve» con la cámara moviéndose. Ahora se llama a la
    // del juego; el respaldo es para las pruebas que montan la sonda sin él.
    if (S.colocarCamaraDelOjo) { S.colocarCamaraDelOjo(); return; }
    const eye = S.player.eye;
    S.camera.position.set(eye[0], eye[1], eye[2]);
    S.camera.rotation.set(S.player.pitch, S.player.yaw, 0);
  };
  return {
    level: S.level, player: S.player, camera: S.camera, renderer: S.renderer, keys: S.keys, ready: true, kit: null,
    medidas: S.level.medidas,
    /**
     * LA RED, por donde se mira lo que sólo existe con dos navegadores.
     *
     * Ninguna de las 49 pruebas de `test/red_27.test.mjs` dice que un jugador
     * vea al otro: dicen que el protocolo cumple sus reglas. Esto es lo que
     * permite preguntárselo a dos Chrome de verdad, con el servidor de verdad
     * en medio.
     */
    red: {
      get hay() { return Boolean(S.red); },
      estado: () => (S.red ? {
        yo: S.red.yo,
        partida: S.red.partida,
        mapa: S.red.mapa,
        dentro: S.red.dentro,
        // Lo que la red cuesta y lo que hace, en números: las correcciones son
        // la medida de si la predicción sirve, y el error máximo es la de si
        // las dos físicas son la misma.
        fotos: S.red.fotosRecibidas,
        paquetes: S.red.paquetes,
        ordenes: S.red.ordenesEnviadas,
        pendientes: S.red.pendientes.length,
        correcciones: S.red.correcciones,
        errorMaximo: S.red.errorMaximo,
        errorUltimo: S.red.errorUltimo,
        latencia: S.red.latencia,
        interp: S.red.interp,
        updaterate: S.red.updaterate,
        cmdrate: S.red.cmdrate,
        cmdbackup: S.red.cmdbackup,
        ajenos: S.red.ajenos.size,
        pies: S.player.feet,
        personaje: S.red.personaje?.nombre ?? null,
      } : null),
      /** Dónde se está DIBUJANDO a cada uno de los demás, ahora mismo. */
      otros: () => (S.otros ? S.otros.estado() : []),
      /**
       * EL 97: el RECTÁNGULO de la pantalla donde cae el arma del jugador de
       * otro, vértice a vértice ya deformado por SU esqueleto (el de la figura,
       * con los huesos fundidos). Lo mismo que `vista.rectangulo`, pero sobre la
       * malla que cuelga de la figura. `null` si no hay arma o no cae en el cuadro.
       */
      rectanguloArmaAjena: (id = null) => {
        const m = S.otros?.mallaDeArma?.(id);
        if (!m) return null;
        m.parent?.updateMatrixWorld(true);
        m.skeleton?.update();
        S.camera.updateMatrixWorld(true);
        const lienzo = S.renderer?.domElement ?? document.querySelector("canvas");
        const r = lienzo.getBoundingClientRect();
        const v = new THREE.Vector3();
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
        for (let i = 0; i < m.geometry.attributes.position.count; i++) {
          m.getVertexPosition(i, v);
          v.applyMatrix4(m.matrixWorld).applyMatrix4(S.camera.matrixWorldInverse);
          if (v.z > -(S.camera.near ?? 0.01)) continue;
          v.applyMatrix4(S.camera.projectionMatrix);
          if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
          const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          n++;
        }
        if (!n) return null;
        return { x0, y0, x1, y1, vertices: n, ancho: r.width, alto: r.height, visible: m.visible };
      },
      /**
       * EL 97: congelar (o soltar) la animación de las figuras de los demás —su
       * `idle` mueve cabeza y brazos entre dos fotos, y eso salía como «fuera»
       * en el contraste con/sin del arma ajena—. Sólo el mezclador: la posición
       * sigue llegando por la red.
       */
      congelarOtros: (si = true) => {
        const o = S.otros;
        if (!o) return null;
        if (si && !o.__pasoDeVerdad) { o.__pasoDeVerdad = o.paso; o.paso = () => {}; }
        if (!si && o.__pasoDeVerdad) { o.paso = o.__pasoDeVerdad; delete o.__pasoDeVerdad; }
        return Boolean(o.__pasoDeVerdad);
      },
      /** EL 97: esconder/enseñar SÓLO la malla del arma ajena (`visible`), para la foto sin ella. */
      esconderArmaAjena: (si = true, id = null) => {
        const m = S.otros?.mallaDeArma?.(id);
        if (!m) return null;
        m.visible = !si;
        return m.visible;
      },
      /** Y dónde dice la última foto que están, sin interpolar: la diferencia
       * entre esto y lo de arriba ES `ex_interp`, y es lo que hay que poder ver. */
      crudos: () => (S.red ? [...S.red.ajenos].map(([id, cola]) => {
        const u = cola[cola.length - 1];
        return { id, nombre: u.nombre, pies: u.pies, rapidez: u.rapidez, t: u.t, muestras: cola.length };
      }) : []),
      /** Lo que `interpolados()` dice AHORA, antes de pasar por las figuras: es
       * lo que separa un fallo de la interpolación de uno del dibujo. */
      interp: () => (S.red ? [...S.red.interpolados()].map(([id, e]) => ({
        id, rapidez: e.rapidez, interpolado: e.interpolado, muestras: S.red.ajenos.get(id)?.length ?? 0,
      })) : []),
      /** La lista de partidas, que es el navegador de servidores en pequeño. */
      partidas: () => listarPartidas(S.enlaceDeRed?.url),
      /** Teletransportar el cuerpo LOCAL sin decírselo al servidor: es la
       * mentira con la que se comprueba que la reconciliación existe. */
      mentir: (dx = 1) => {
        const p = S.player.feet;
        S.player.colocar([p[0] + dx, p[1], p[2]]);
        return S.player.feet;
      },
      /** Manda ya lo pendiente, para no esperar al reloj de `cl_cmdrate`. */
      mandar: () => (S.red ? S.red.enviar() : 0),
      /**
       * LOS BICHOS TAL Y COMO LOS VE ESTE NAVEGADOR. Del 28.
       *
       * Es el control que decide el experimento: dos pestañas leen esto y tienen
       * que dar lo mismo. Antes daban dos pueblos distintos y nada lo decía.
       */
      bichos: () => (S.bichos ? S.bichos.instancias.map((i) => ({
        id: i.id, nombre: i.ficha.nombre ?? i.ficha.clase,
        donde: [...i.donde], yaw: i.yaw,
        vida: i.vida, muerto: i.muerto, animacion: i.nombreActual,
        hostil: Boolean(i.ficha.hostil),
      })) : []),
      /** Cuántas muestras hay de cada bicho, para saber si el delta funciona. */
      muestras: () => (S.red ? [...S.red.fauna].map(([id, cola]) => ({ id, n: cola.length })) : []),
      /**
       * Pegarle a un bicho por su número, sin espada y sin apuntar.
       *
       * Existe para poder medir dos cosas que un golpe de verdad mezcla: el
       * recorte del daño —se manda 9 999 y el servidor deja lo que la espada
       * pueda— y que la muerte llega a LOS DOS navegadores.
       */
      pegarA: (id, dano = 9999, alcance = 100000) => {
        if (!S.red) return null;
        S.red.pegar({ id, dano, alcance, cubo: "swordsmanship.power", tipo: "" });
        return { id, dano };
      },
      /**
       * Lo que el servidor contestó al último golpe: si entró, si lo pararon, si
       * no llegaba, cuánta vida le queda y **a cuánto recortó el daño**.
       */
      ultimoGolpe: () => S.ultimoGolpe,
      /** El hostil vivo más cercano, que es a quien tiene sentido pegarle. */
      masCerca: () => {
        if (!S.bichos) return null;
        const p = S.player.feet;
        let mejor = null;
        for (const i of S.bichos.instancias) {
          if (i.muerto || !i.ficha.hostil) continue;
          const d = Math.hypot(i.donde[0] - p[0], i.donde[2] - p[2]);
          if (!mejor || d < mejor.distancia) mejor = { id: i.id, nombre: i.ficha.nombre, distancia: d, vida: i.vida };
        }
        return mejor;
      },
    },
    /** El rumbo de llegada calculado. Lo lee el sacador de capturas. */
    rumbo: S.rumbo,
    pause() { S.running = false; },
    resume() { S.running = true; },
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
      for (const m of [...S.materiales, ...S.adornos.materiales]) {
        if (!m.userData.conLuz) continue;
        m.lightMap = on ? atlasDe(m) : S.blanco;
        m.needsUpdate = true;
      }
    },
    /** Apaga o enciende las texturas, dejando el mapa de luz. La otra mitad. */
    setTexturas(on) {
      // Recorre `grupos`, que es el orden REAL de los materiales: primero los
      // opacos y luego los translúcidos. Con el orden del manifiesto, apagar las
      // texturas se las quitaba a los grupos equivocados.
      for (let i = 0; i < S.materiales.length; i++) {
        S.materiales[i].map = on ? S.texturas.get(S.grupos[i].texture) ?? null : null;
        S.materiales[i].needsUpdate = true;
      }
      for (const m of S.adornos.materiales) {
        if (!m.userData.map) m.userData.map = m.map;
        m.map = on ? m.userData.map : null;
        m.needsUpdate = true;
      }
    },
    setMapa(on) {
      S.mundo.visible = on;
      if (S.velo) S.velo.visible = on;
      // Y el detalle y el cielo, que TAMBIEN son el mapa. Sin ellos, el control
      // «con el mundo apagado la pantalla tiene que ser niebla» dejaba dentro una
      // caja de cielo que ocupa la pantalla entera.
      if (S.mallaDetalle) S.mallaDetalle.visible = on;
      if (S.mallaCielo) S.mallaCielo.visible = on;
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
      for (const m of [...S.materiales, ...S.adornos.materiales]) {
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
    setGlow(on) { S.glow.visible = on; },
    /**
     * La intensidad del glow, para poder barrerla.
     *
     * Hace falta porque el glow estaba calibrado contra unas texturas que llegaban
     * al material SIN rampa de gamma. Subidas por `RAMPA_TEXTURA`, todo lo que las
     * multiplica sube con ellas — y una luz puntual a dos metros quema la roca de
     * cerca. Un ajuste no se toca sin poder volver a medirlo.
     */
    setGlowCandela(x) { S.glow.intensity = x; },
    /** Apaga o enciende las antorchas, para medir cuanto aportan. */
    setCarteles(on) { S.carteles.grupo.visible = on; },
    /**
     * Apaga o enciende la SEGUNDA PASADA de texturas de detalle.
     *
     * Es la perilla que convierte «el detalle mejora el contraste» en un numero.
     * Y hace falta su control: el detalle multiplica por dos, asi que apagarlo
     * tiene que bajar el contraste local SIN mover la mediana. Si mueve la
     * mediana, la mezcla no es `2·src·dst` y esta puesta mal.
     */
    setDetalle(on) { if (S.mallaDetalle) S.mallaDetalle.visible = on; },
    /** Apaga o enciende los BICHOS, y dice cuantos hay. */
    setBichos(on) { if (S.bichos) S.bichos.grupo.visible = on; },
    /**
     * Adelanta el reloj de las animaciones, con el bucle PARADO.
     *
     * Es lo que convierte «se mueve» en una medida: dos fotogramas del mismo
     * sitio a dos tiempos distintos tienen que diferir DONDE ESTA EL BICHO y ser
     * identicos en todo lo demas. Sin el segundo control, un bicho que no se
     * mueve y una pantalla que cambia por otra cosa dan el mismo numero.
     */
    avanzarBichos(dt) { if (S.bichos) S.bichos.animar(dt); },
    /** Lo mismo para los 10 adornos que se mueven, que van por el mismo camino. */
    avanzarAdornos(dt) { if (S.adornosVivos) S.adornosVivos.animar(dt); },
    /** La interfaz del personaje, para poder mirarla sin raton. */
    personaje: {
      elegir: () => S.interfaz?.elegir(),
      crear: () => S.interfaz?.crear(),
      hoja: () => S.interfaz?.hoja(),
      inventario: () => S.interfaz?.inventario(),
      opciones: () => S.interfaz?.opciones(),
      cerrar: () => S.interfaz?.cerrar(),
      hay: () => Boolean(S.interfaz),
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
      get abierta() { return Boolean(S.interfaz?.abierta); },
      get retratos() { return S.interfaz?.retratos ?? 0; },
      paso: (dt) => S.interfaz?.animarCuerpos(dt ?? 1 / 60),
      /**
       * Abre y cierra la hoja, que hace falta para una cosa concreta: con un
       * panel delante el HUD del juego **se esconde** (`ShowHUD()` mira
       * `MSCLGlobals::CharPanelActive`), y eso hay que poder medirlo.
       */
      hoja: () => { S.interfaz?.hoja(); return Boolean(S.interfaz?.abierta); },
      cerrar: () => { S.interfaz?.cerrar(); return Boolean(S.interfaz?.abierta); },
    },
    sesion: {
      hay: () => Boolean(S.sesion),
      estado: () => S.sesion?.estado ?? null,
      /** Donde dice la sesion que hay que aparecer, y donde estan los pies. */
      donde: () => ({
        dice: S.sesion?.donde ?? null,
        pies: S.player.feet,
        entrada: S.sesion?.entrada ?? null,
        // La distancia entre las dos cosas es el control: si la sesion dice
        // «el templo» y los pies siguen en la cueva, esto lo canta.
        desvio: S.sesion?.donde?.escena
          ? Math.hypot(
              S.player.feet[0] - S.sesion.donde.escena[0],
              S.player.feet[1] - S.sesion.donde.escena[1],
              S.player.feet[2] - S.sesion.donde.escena[2])
          : null,
      }),
      /** El sitio medido, tal como lo escribio `tools/aparicion.mjs`. */
      aparicion: () => S.aparicion,
      /** El personaje en juego, para poder mirarle el nombre y las manos. */
      get personaje() { return S.sesion?.personaje ?? null; },
      /** Los personajes guardados. Es `almacen.listar()`. */
      listar: () => S.sesion?.almacen?.listar?.() ?? [],
      /** Y borrar uno, para que una sonda pueda empezar de cero. */
      borrar: (id) => S.sesion?.almacen?.borrar?.(id),
      /**
       * Crea uno y entra, que es el camino del jugador nuevo de un tiron.
       *
       * El arma NO tiene valor por defecto en `crearPersonaje`, y es a
       * proposito: elegirla es la unica decision que MSR le pide a quien crea
       * un personaje, y dejar que se cuele un `undefined` seria convertir esa
       * decision en un descuido. Aqui, que es una sonda, se coge la primera.
       */
      async nuevo(nombre = "Sonda", arma = null) {
        const armas = S.sesion.catalogo?.nuevoPersonaje?.armas ?? [];
        const p = await S.sesion.crear({ nombre, arma: arma ?? armas[0] });
        await S.sesion.entrar(p.id);
        return S.sesion.personaje;
      },
      async entrar(id) { await S.sesion.entrar(id); return S.sesion.personaje; },
      async listar() { return S.sesion.almacen.listar(); },
      danar: (n, o) => S.sesion?.danar(n, o),
      matar: (o) => S.sesion?.matar({ tipo: "monstruo", ...o }),
      reaparecer: () => S.sesion?.reaparecer(),
      tic: (o) => S.sesion?.tic(o ?? {}),
      salir: () => S.sesion?.salir(),
      vitales: () => S.sesion?.personaje
        ? { vida: S.sesion.personaje.vida, mana: S.sesion.personaje.mana, oro: S.sesion.personaje.oro, ...S.sesion.limites }
        : null,
    },
    /**
     * LO QUE SE VE AL MORIR Y AL SUBIR (experimento 41).
     *
     * Se mide lo que está en pantalla y no lo que la regla diría: el velo con
     * su color y su alfa, el centrado con su texto, los carteles con el color
     * de cada letra, dónde ha quedado la cámara y cuántas chispas hay vivas.
     * Las reglas ya se comprueban en Node; esto es el camino del jugador.
     */
    muerte: {
      /** El estado de la capa entera. */
      pantalla: () => S.mensajes?.estado() ?? null,
      /**
       * Dónde está la cámara y hacia dónde mira, AHORA.
       *
       * `delCuerpo` es lo que hace falta para saber si de verdad se está
       * mirando el sitio donde te caíste: el ángulo entre hacia dónde apunta la
       * cámara y la dirección al cuerpo. Cero grados es «lo mira de frente». Sin
       * esto una sonda sólo sabría que la cámara se ha movido.
       */
      camara: () => {
        aplicarCamara();
        const c = S.camera;
        const cm = S.camaraMuerte;
        const m = new THREE.Vector3(0, 0, -1).applyEuler(c.rotation);
        const cuerpo = S.player.eye;
        const d = new THREE.Vector3(cuerpo[0] - c.position.x, cuerpo[1] - c.position.y, cuerpo[2] - c.position.z);
        const dist = d.length();
        const grados = dist > 0 ? (Math.acos(Math.max(-1, Math.min(1, m.dot(d.normalize())))) * 180) / Math.PI : null;
        return {
          activa: Boolean(cm),
          pos: [c.position.x, c.position.y, c.position.z],
          yaw: c.rotation.y, pitch: c.rotation.x,
          chocada: cm?.chocada ?? null,
          // En unidades del motor, que es como están las 70 y las 25 del código.
          distancia: dist * (S.level.unitsPerMetre ?? 39.37),
          delCuerpo: grados,
        };
      },
      /**
       * LA CAJA DE CIELO Y LA CÁMARA, en la MISMA lectura.
       *
       * El cielo de GoldSrc no se traslada nunca respecto al que mira: sus
       * vértices se construyen sumando el origen de vista.
       *
       *     v[j] = (k < 0) ? -b[-k-1] : b[k-1];
       *     v[j] += RI.cullorigin[j];
       *                                     gl_warp.c:239-243
       *     VectorCopy( RI.vieworg, RI.cullorigin );
       *                                     gl_rmain.c:359
       *
       * O sea que lo que hay que medir no es dónde está el cielo, que es un número
       * grande y sin interés, sino que **la diferencia entre el cielo y la cámara no
       * cambie**. Un cielo que se mueve respecto a la vista tiene paralaje, y el
       * paralaje lo convierte en una caja pintada.
       *
       * Y van en UNA llamada a propósito. Leerlos con dos `evaluate` deja que el
       * bucle avance entre medias, así que la resta saldría entre dos fotogramas
       * distintos: el aviso del 75 —«un `evaluate` no mide décimas»—, y aquí sería
       * mortal porque lo que se mide ES la resta. Saltando, el ojo recorre nueve
       * centímetros por fotograma, o sea más que el fallo que se busca.
       *
       * Y AQUÍ NO SE LLAMA A `aplicarCamara()`, que es lo contrario de lo que hace
       * `camara()` doce líneas arriba. Cuesta explicarlo y es el centro del
       * control, así que va escrito:
       *
       * `aplicarCamara()` RECALCULA la cámara desde el estado del jugador en el
       * instante de la lectura. El nodo del cielo, en cambio, lo dejó el bucle en
       * el último fotograma dibujado. Entre los dos hay el tiempo que la física ha
       * avanzado desde entonces, así que recalcular la cámara aquí no compara el
       * cielo con la cámara: compara **la cámara de ahora con el cielo de antes**,
       * y la resta sale distinta de cero con el juego perfecto. Medido: con el
       * anclaje ya arreglado, llamarlo daba 11,6 unidades de deriva andando y
       * 12,3 saltando — o sea los mismos números que el fallo que se buscaba, y
       * por los dos lados.
       *
       * Es el 65 otra vez y en el archivo que lo documenta: «cuando una sonda
       * RECALCULA algo en vez de leerlo, deja de ser un testigo». Allí la copia
       * borraba el movimiento al medirlo; aquí la llamada lo INVENTA. Las dos
       * veces, el remedio es leer lo que el bucle dejó puesto y no rehacerlo.
       */
      cielo: () => {
        const n = S.escena?.getObjectByName?.("cielo") ?? null;
        const c = S.camera;
        return {
          hay: Boolean(n),
          visible: Boolean(n?.visible),
          cielo: n ? [n.position.x, n.position.y, n.position.z] : null,
          camara: [c.position.x, c.position.y, c.position.z],
          // La resta, ya hecha, para que ninguna sonda la rehaga mal.
          diferencia: n
            ? [n.position.x - c.position.x, n.position.y - c.position.y, n.position.z - c.position.z]
            : null,
          // En unidades del motor, que es en las que están las citas.
          unidadesPorMetro: S.level?.unitsPerMetre ?? 39.37,
          pies: [...S.player.feet],
          // `grounded`, que es como se llama en este puerto. Con `onGround` —que no
          // existe— esto diría «en el aire» SIEMPRE y en silencio, porque `!undefined`
          // es `true`: un campo mal escrito no da error, da un booleano constante.
          enElAire: !S.player.grounded,
        };
      },
      /** Mata y devuelve lo que ha quedado en pantalla en el mismo instante. */
      matar(o) { return S.sesion?.matar({ tipo: "monstruo", ...o }); },
      /**
       * EL 94. Un golpe por la puerta de TODO el daño del jugador, `danar`, que
       * es la que avisa al oyente del tinte: no se llama al tinte a mano (el 59).
       * Devuelve lo que hay en pantalla y el empujón de la vista en ese instante.
       */
      golpear(dano, o = {}) {
        const r = S.sesion?.danar(dano, { porQue: "la sonda", ...o }) ?? null;
        const e = S.mensajes?.estado() ?? null;
        return { r, fundido: e?.fundido ?? null, velo: e?.velo ?? null, golpe: S.golpeDeVista ?? null,
          vida: S.sesion?.personaje?.vida ?? null, vidaMax: S.sesion?.limites?.vidaMax ?? null };
      },
      /** El empujón de la vista ahora (lo suelta el bucle, `pasoDelHud`). */
      golpe: () => S.golpeDeVista ?? null,
      /** El cadáver: si está puesto, dónde y con qué animación. */
      cadaver: () => S.cadaver?.estado() ?? null,
      /**
       * Un paso del reloj de los mensajes, sin depender del de dibujo.
       *
       * Dibuja también, y no es un adorno: con el bucle parado la cámara no se
       * mueve sola, y sin esto una sonda que pausa mediría la cámara de antes
       * de morir mientras la regla ya dice otra cosa.
       */
      paso(dt = 1 / 60) {
        S.mensajes?.paso(dt);
        S.pasoDelGolpe?.(dt);
        if (S.cadaver?.puesto) S.cadaver.paso(dt);
        aplicarCamara();
        return S.mensajes?.estado() ?? null;
      },
    },
    nivel: {
      /** Dispara las cinco cosas de una subida. `donde` es «swordsmanship.power». */
      subir(donde = "swordsmanship.power") { S.celebrarSubida?.(donde); return S.mensajes?.estado() ?? null; },
      /** Apaga la luz dinámica del efecto, para poder mirar sólo las chispas. */
      luz(on) { const l = S.chispas?.grupo?.children?.find((c) => c.isPointLight); if (l) l.visible = Boolean(on); },
      /** Lo que hay en la lluvia: cuántas vivas, sus colores y cuánto han subido. */
      chispas: () => S.chispas?.estado() ?? null,
      /** Un paso de la lluvia, con el cuerpo donde esté. */
      paso(dt = 1 / 60) {
        if (S.chispas?.corriendo) { S.chispas.seguir(S.player.eye); S.chispas.paso(dt); }
        S.mensajes?.paso(dt);
        return { chispas: S.chispas?.estado() ?? null, pantalla: S.mensajes?.estado() ?? null };
      },
    },
    /**
     * LAS DOS VENTANAS DE ARRIBA (experimento 60).
     *
     * Lo que hay que poder medir aquí es **en qué esquina sale cada cosa**, que
     * es lo que estaba mal: `SendHUDMsg` acababa en la consola de sucesos, en
     * la esquina de abajo a la derecha. Por eso `esquinas()` devuelve las tres
     * a la vez y leídas del DOM: comparar una contra otra es la medida, y una
     * sola no dice nada.
     */
    aviso: {
      /** `SendHUDMsg`. Devuelve el estado justo después de ponerla. */
      poner(titulo = "Gate City", texto = "A city of dwarves.") {
        S.mensajes?.aviso(titulo, texto);
        return S.mensajes?.estado()?.ventanas ?? null;
      },
      /** `SendHelpMsg`, la de la derecha. */
      ayuda(titulo = "Tip", texto = "Press E to talk.") {
        S.mensajes?.ayuda(titulo, texto);
        return S.mensajes?.estado()?.ventanas ?? null;
      },
      /** Las ventanas vivas, con su rectángulo real. */
      ventanas: () => S.mensajes?.estado()?.ventanas ?? null,
      /** Un tic sólo de esto, para ver el desvanecido sin esperar de verdad. */
      paso(dt = 1 / 60) { S.mensajes?.paso(dt); return S.mensajes?.estado()?.ventanas ?? null; },
      /**
       * Las TRES esquinas, en píxeles de pantalla, leídas del DOM.
       *
       * La de la consola sale de su caja y no de la regla: si se leyera de la
       * regla, esto seguiría diciendo que están separadas aunque el navegador
       * las pintara encima la una de la otra.
       */
      esquinas() {
        const caja = document.querySelector(".ms-consola");
        const c = caja?.getBoundingClientRect?.();
        const de = (v) => (v ? { x: v.x, y: v.y, ancho: v.ancho, alto: v.alto } : null);
        const vs = S.mensajes?.estado()?.ventanas ?? [];
        return {
          pantalla: [window.innerWidth, window.innerHeight],
          consola: c ? { x: Math.round(c.left), y: Math.round(c.top), ancho: Math.round(c.width), alto: Math.round(c.height) } : null,
          aviso: de(vs.find((v) => v.clase === "aviso")),
          ayuda: de(vs.find((v) => v.clase === "ayuda")),
        };
      },
    },
    /**
     * LA FISICA, para poder cronometrarla contra las cifras del motor.
     *
     * Que las 50 comprobaciones de `movimiento.js` pasen en Node no dice que
     * el jugador ande a esa velocidad EN EL MAPA: entre las dos cosas estan la
     * conversion de unidades —donde estaba el fallo del 23 %— y Rapier.
     */
    fisica: {
      perfil: () => S.perfil,
      aguante: () => S.aguante,
      /**
       * El 89c. Al entrar el aguante ya está lleno, y lo que llena
       * `activate_stuff` un segundo después es lo mismo: sin vaciarlo antes,
       * el control leería el valor de reposo (CLAUDE.md §4).
       */
      ponerAguante: (v) => { S.aguante = Number(v); return S.aguante; },
      corriendo: () => S.corriendo,
      /** Lo que el modelo dice que deberia andar este personaje, en unidades. */
      vitales() {
        const v = S.vitalesDelPersonaje();
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
          contexto: S.audio.ctx?.state ?? "sin crear",
          despierto: S.audio.despierto,
          arrancadas: S.audio.arrancadas,
          sinArchivo: S.audio.sinArchivo ?? 0,
          fallos: S.audio.fallos.slice(),
          pedidosDePuerta: S.pedidosDePuerta,
          ambienteSinArchivo: S.ambienteSinArchivo,
          catalogo: S.catalogoSonido ? {
            pasos: Object.fromEntries(Object.entries(S.catalogoSonido.pasos ?? {})
              .map(([k, v]) => [k, v.length])),
            // Cuáles de esos pasos son NUESTROS. Juntarlos con los leídos es la
            // forma de que un día nadie sepa qué parte del juego suena.
            generados: Object.fromEntries(Object.entries(S.catalogoSonido.pasos ?? {})
              .map(([k, v]) => [k, v.filter((s) => s.generado).length])),
            jugador: Object.keys(S.catalogoSonido.jugador ?? {}),
            musica: Object.keys(S.catalogoSonido.musica ?? {}),
            faltan: S.catalogoSonido.faltan?.length ?? 0,
            mudos: S.catalogoSonido.mudos?.length ?? 0,
          } : null,
          /** Los últimos ocho aterrizajes, con lo que decidió cada uno. */
          aterrizajes: S.aterrizajes.slice(),
          sonidosDeCarga: S.sonidosDeCarga,
          // LA VELOCIDAD EN LAS DOS UNIDADES, que es la pregunta que hay que
          // poder contestar mirando: `player.vel` y lo que sale al pasarla por
          // el factor del mapa. Los pasos y la caída comparan contra números
          // del motor (220, 350, 580), así que equivocarse de unidad no da
          // error: da un juego mudo o uno que suena siempre.
          velocidad: [...S.player.vel],
          /** La misma, en metros por segundo, que es como se anda por el mapa. */
          enMetros: S.player.vel.map((v) => v / S.U),
          /** Y la que recibe de verdad la regla de los pasos. */
          paraLosPasos: S.velocidadParaLosPasos(),
          caidaEnCurso: S.player.caida,
        };
      },
      /** Despierta el contexto como lo haría un clic. */
      despertar: () => S.despertarAudio(),
      /** Qué material pisa el jugador ahora mismo. */
      suelo: () => S.materialBajoLosPies(S.player.feet),
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
        const cuales = S.grupos.map((x, i) => (x.texture === textura ? i : -1)).filter((i) => i >= 0);
        const pos = S.mundo.geometry.attributes.position;
        const idx = S.mundo.geometry.index;
        for (const g of cuales) {
        const gr = S.mundo.geometry.groups[g];
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
        const z = S.volumenes.zonasEn(S.player.feet).find((x) => x.clase === "msarea_music");
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
        const pasos = Math.max(1, Math.round(s / S.DT));
        const v = S.vitalesDelPersonaje();
        // La misma cuenta que el bucle: andar sale de la agilidad y del peso, y
        // correr multiplica por el aguante que quede.
        let max = velocidadAndando(v);
        if (correr) max = velocidadCorriendo(max, { aguante: S.aguante, aguanteMax: v.aguanteMax });
        max = ajustarVelocidad(max, {});
        for (let k = 0; k < pasos; k++) {
          S.player.step(S.DT, { forward: 1, strafe: 0, jump: false, agachar: false, maxima: max, agua: 0, escalera: null });
        }
        const vel = [...S.player.vel];
        const horizontal = Math.hypot(vel[0], vel[2]);
        return {
          maxima: max, aguanteMax: v.aguanteMax,
          velocidad: vel,
          horizontal,
          // Lo que el bucle le pasa hoy a la regla de los pasos.
          comoLaLeeElBucle: (() => { const v = S.velocidadParaLosPasos(); return Math.hypot(v[0], v[2]); })(),
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
      hay: () => Boolean(S.hudMs),
      /** Un suceso, por el mismo sitio por el que los manda el juego. */
      suceso: (tipo, texto) => { S.suceso(tipo, texto); return S.hudMs?.estado().consola ?? null; },
      /** `n` segundos de reloj, en pasos de un fotograma. */
      avanzar(segundos, paso = 1 / 60) {
        const n = Math.max(1, Math.round(segundos / paso));
        for (let k = 0; k < n; k++) S.pasoDelHud(paso);
        return S.hudMs?.estado() ?? null;
      },
      estado: () => S.hudMs?.estado() ?? null,
      desplazar: (abajo) => { S.hudMs?.desplazar(Boolean(abajo)); return S.hudMs?.estado().consola ?? null; },
      /** Los cvars de la consola, para poder medir el decaimiento sin esperar. */
      cvars(cambios = {}) {
        if (!S.hudMs) return null;
        for (const [k, v] of Object.entries(cambios)) {
          if (k === "tamano") S.hudMs.consola.tamano = v;
          if (k === "historial") S.hudMs.consola.historial = v;
          if (k === "decaimiento") S.hudMs.consola.decaimiento = v;
        }
        const c = S.hudMs.consola;
        return { tamano: c.tamano, historial: c.historial, decaimiento: c.decaimiento, maxLineas: c.maxLineas };
      },
      /** La línea de estado de la carga, que ya no es la consola. */
      estatus: () => ({ escondida: S.status.hidden, texto: S.status.textContent }),
    },
    /**
     * EL CHAT — experimento 61. SÓLO LEE Y AVANZA EL RELOJ.
     *
     * No hay aquí ningún `abrir()` ni ningún `decir()`: la ventana se abre
     * pulsando la Y de verdad y la frase se escribe letra a letra con el
     * teclado del navegador, porque lo que hay que comprobar es justamente
     * que la tecla llega, que el juego deja de oír las suyas mientras
     * escribes, y que el Enter manda. Una puerta que abriera el cajetín
     * desde aquí pondría todo en verde con las tres teclas desconectadas —
     * que es el fallo del 35 con otro nombre.
     */
    chat: {
      hay: () => Boolean(S.chatMs),
      estado: () => S.chatMs?.estado() ?? null,
      /** `n` segundos del reloj del chat, por el mismo sitio que el bucle. */
      avanzar(segundos, paso = 1 / 60) {
        const n = Math.max(1, Math.round(segundos / paso));
        for (let k = 0; k < n; k++) S.chatMs?.paso(paso);
        return S.chatMs?.estado() ?? null;
      },
      /** Los cvars de la consola del chat, para no esperar nueve segundos. */
      cvars(cambios = {}) {
        if (!S.chatMs) return null;
        for (const [k, v] of Object.entries(cambios)) {
          if (k === "tamano") S.chatMs.consola.tamano = v;
          if (k === "historial") S.chatMs.consola.historial = v;
          if (k === "decaimiento") S.chatMs.consola.decaimiento = v;
        }
        const c = S.chatMs.consola;
        return { tamano: c.tamano, historial: c.historial, decaimiento: c.decaimiento };
      },
      desplazar: (abajo) => { S.chatMs?.desplazar(Boolean(abajo)); return S.chatMs?.estado() ?? null; },
    },
    /**
     * LOS PANELES DE VGUI. Esto SÓLO LEE, y es a propósito.
     *
     * No hay aquí ningún `abrir()`: el panel se abre pulsando la F de verdad con
     * el teclado del navegador, que es la única forma de comprobar lo que este
     * experimento vino a arreglar —que la tecla entra por la tabla del juego—.
     * Una puerta `probe.vgui.abrir("interact")` daría todos los controles en
     * verde con la tecla desconectada, que es exactamente el fallo que se está
     * quitando.
     */
    /**
     * LAS VENTANAS DE VALVE (VGUI2, experimento 34): «Options» y «Servers».
     *
     * Bloque aparte del de arriba a propósito: son otro sistema de interfaz, con
     * otra letra, otros colores y el alfa al revés. Juntarlos aquí invitaría a
     * medir uno creyendo que se mide el otro, que es el error que el informe
     * explica en su §1.
     *
     * NO hay `abrir()`: la ventana se abre con la G, que es la acción `opciones`
     * del `config.cfg`, y una sonda que la abriera desde aquí dejaría de probar
     * que el jugador puede llegar. Lo que sí hay es leer, y encadenar una
     * segunda ventana cuando la primera ya está abierta por la tecla.
     */
    vgui2: {
      hay: () => Boolean(S.vgui2?.()),
      estado: () => S.vgui2?.()?.estado() ?? null,
      /** Cuántas ventanas hay encima, y cuál está delante. */
      abiertas: () => S.vgui2?.()?.abiertas.length ?? 0,
      /** De quién es el ratón AHORA, según el navegador y no según nosotros. */
      puntero: () => document.pointerLockElement?.tagName ?? null,
      /** Abre la de servidores. Para encadenar, no para probar la tecla. */
      servidores: () => { S.vgui2?.()?.abrirServidores(); },
      /** Los ajustes que hacen algo, y los que no. Lo calcula `cuenta()`. */
      cuenta: () => S.cuentaDeAjustes ?? null,
      /**
       * CON QUÉ MAPA SE ENTRÓ, resuelto por `mapaElegido()` al pulsar «Start».
       * Es lo APLICADO, no lo que la fila «Map» enseñaba: son dos cosas
       * distintas y hasta ahora sólo existía la segunda, porque el valor de la
       * fila se tiraba sin usarlo.
       */
      mapaDeLaPartida: () => S.mapaDeLaPartida ?? null,
    },

    /**
     * LA FRONTERA CON EL SITIO DONDE SE JUEGA (experimento 35, medido en el 38).
     *
     * `src/juego/navegador.js` es lo único nuestro que no porta nada: existe
     * porque un juego de escritorio no tiene este problema. Y hasta ahora lo
     * único que lo comprobaba eran las pruebas de Node, que llegan al
     * diagnóstico —qué teclas choca el `config.cfg`— y no a lo que hace el
     * navegador cuando se le piden.
     *
     * ESTO SÓLO LEE, por lo mismo que `vgui`: pedir el teclado desde aquí no
     * valdría de nada. Las dos APIs exigen un gesto del usuario, así que la
     * sonda tiene que pulsar la tecla de verdad —la `b`— y esto sirve para ver
     * qué pasó. Un `probe.navegador.atrapar()` daría el verde sin gesto y
     * mediría el `try` en vez de la concesión.
     */
    navegador: {
      /** ¿Este navegador trae Keyboard Lock? Es el positivo de todo lo demás. */
      hayKeyboardLock: () => hayAtrapaTeclado(),
      /** ¿Lo tenemos atrapado AHORA, según nosotros? */
      atrapado: () => tecladoAtrapado(),
      /** Y según el navegador, que es quien manda. */
      pantallaCompleta: () => enPantallaCompleta(),
      /** De quién es el ratón, para el menú principal en pantalla completa. */
      puntero: () => document.pointerLockElement?.tagName ?? null,
      /**
       * Los choques que `navegador.js` encuentra con las teclas PUESTAS, no con
       * las de fábrica: es lo que el jugador tiene delante.
       */
      choques: () => choques(S.teclas.mapa, ACCIONES),
    },

    /**
     * LO QUE LOS AJUSTES HACEN DE VERDAD (experimento 37).
     *
     * Separado de `vgui2` a propósito, y es la distinción entera del
     * experimento: `vgui2.estado().opciones.valores` es **lo que dice la
     * ventana**, y esto es **lo que hace el juego**. Mientras los ocho ajustes
     * vivos no estuvieran enganchados, los dos podían decir cosas distintas y
     * ningún control se habría enterado.
     *
     * Por eso aquí no se devuelve ningún valor de la ventana: se devuelven los
     * grados con los que gira el ratón, la ganancia de los dos canales de
     * sonido y cuántas texturas de atlas se han rehecho.
     */
    ajustes: {
      /** Lo aplicado, que no es lo mismo que lo puesto en la ventana. */
      aplicados: () => S.ajustesAplicados ?? null,
      /**
       * Cuánto gira el ratón, en GRADOS, por una cuenta. Se pregunta moviendo
       * el ratón de mentira cien cuentas y dividiendo: así lo que se mide es la
       * fórmula entera —filtro incluido— y no un campo que alguien copió bien.
       *
       * Se hace dos veces porque el filtro del motor promedia con la muestra
       * anterior: la primera vale la mitad y la segunda ya es el régimen.
       */
      gradosPorCuenta: () => {
        const r = S.raton;
        if (!r) return null;
        const antesX = r.viejoX, antesY = r.viejoY;
        r.mover(100, 100);
        const g = r.mover(100, 100);
        r.viejoX = antesX; r.viejoY = antesY;
        return {
          yaw: (g.yaw * 180) / Math.PI / 100,
          pitch: (g.pitch * 180) / Math.PI / 100,
          sensibilidad: r.sensibilidad, filtro: r.filtro, invertido: r.invertido,
        };
      },
      /** La ganancia de los dos canales, leída de los nodos de Web Audio. */
      volumen: () => {
        const a = S.audio;
        if (!a) return null;
        return {
          efectos: a.maestro?.gain?.value ?? a.volumenEfectos,
          musica: a.canalMusica?.gain?.value ?? a.volumenMusica,
          despierto: Boolean(a.despierto),
        };
      },
      /** El mapa de luz rehecho: cuántos atlas y si la tabla era la identidad. */
      luz: () => {
        const l = S.luzRehecha;
        return l ? { texturas: l.texturas, identidad: l.identidad } : null;
      },
      /** Con qué gamma se horneó el atlas, según el manifiesto. */
      horneada: () => S.gammaDelAtlas ?? null,
      /**
       * El PÍXEL MEDIO del atlas que está puesto ahora mismo, de 0 a 255.
       *
       * Es el control que no se puede falsear: si mover el brillo no cambia
       * este número, no ha cambiado nada por mucho que la ventana diga otra
       * cosa. Se mide sobre la textura que el material tiene puesta, no sobre
       * la imagen descargada.
       */
      brilloDelAtlas: () => {
        const img = S.atlasDeLuz?.()?.image;
        if (!img?.width) return null;
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let suma = 0;
        for (let i = 0; i < d.length; i += 4) suma += (d[i] + d[i + 1] + d[i + 2]) / 3;
        return suma / (d.length / 4);
      },
    },

    vgui: {
      hay: () => Boolean(S.vgui),
      /** Qué panel está abierto, o null. Es `m_pCurrentMenu`. */
      abierto: () => S.vgui?.abierto?.nombre ?? null,
      /**
       * Cierra el panel que esté abierto y devuelve el que quede.
       *
       * El 63. Dos sondas llamaban a `probe.vgui.cerrar?.()`, que **no
       * existía**: el `?.` se lo tragaba y el panel seguía delante. Cerrar con
       * la Escape no vale de sustituto, porque con un panel del juego delante
       * la Escape abre el menú —«Esc menu»— y el menú se come las teclas:
       * el jugador de la sonda se quedaba clavado en el sitio y el control de
       * al lado leía un cero que no medía nada.
       */
      cerrar: () => { S.vgui?.cerrar?.(); return S.vgui?.abierto?.nombre ?? null; },
      /** ¿El juego deja de moverse? `m_NoMouse` es la excepción. */
      atrapaElRaton: () => Boolean(S.vgui?.atrapaElRaton),
      /**
       * ¿Y el puntero está atrapado DE VERDAD, o sólo lo cree el registro?
       *
       * Las dos cosas por separado a propósito: `atrapaElRaton` es lo que el
       * registro decide y `puntero` es lo que el navegador ha hecho. Mientras
       * nadie conectó lo uno con lo otro, el inventario abría con el registro
       * diciendo «el ratón es del panel» y el puntero seguía en el `canvas` —así
       * que los clics no llegaban—, y un solo dato no habría podido enseñarlo.
       */
      puntero: () => Boolean(document.pointerLockElement),
      /** El archivo de esquema que se ha elegido para este ancho de pantalla. */
      esquema: () => ({
        resolucion: S.vgui?.esquema?.resolucion ?? null,
        sml: S.vgui?.esquema?.fuenteCss("Briefing Text") ?? null,
        titulo: S.vgui?.esquema?.fuenteCss("Title Font") ?? null,
      }),
      /**
       * El panel abierto, medido en la pantalla de verdad: lo que dice el DOM,
       * no lo que cree el objeto. Si un panel está «abierto» y su nodo sigue
       * escondido, esto lo dice.
       */
      panel() {
        const p = S.vgui?.abierto;
        if (!p) return null;
        const caja = p.ventana?.nodo?.getBoundingClientRect?.() ?? null;
        const estilo = p.ventana ? getComputedStyle(p.ventana.nodo) : null;
        return {
          nombre: p.nombre,
          titulo: p.titulo?.texto ?? null,
          fuenteDelTitulo: p.titulo ? getComputedStyle(p.titulo.nodo).fontSize : null,
          visible: Boolean(p.raiz?.nodo && !p.raiz.nodo.hidden),
          ventana: caja ? { x: Math.round(caja.x), y: Math.round(caja.y), w: Math.round(caja.width), h: Math.round(caja.height) } : null,
          fondo: estilo?.backgroundColor ?? null,
          borde: estilo?.borderTopColor ?? null,
          grosorDelBorde: estilo?.borderTopWidth ?? null,
        };
      },
      /** Los botones que se ven, con su texto, su color y si sirven. */
      botones() {
        const p = S.vgui?.abierto;
        if (!p?.botones) return [];
        return p.botones
          .map((b, i) => ({
            i, texto: b.texto, sirve: b.sirve,
            visible: !b.nodo.hidden,
            color: getComputedStyle(b.nodo).color,
            arriba: Math.round(b.nodo.getBoundingClientRect().y),
            centro: Math.round(b.nodo.getBoundingClientRect().x + b.nodo.getBoundingClientRect().width / 2),
          }))
          .filter((b) => b.visible);
      },
      /** Las opciones que el «servidor» ha mandado, y por qué están como están. */
      opciones: () => (S.vgui?.abierto?.opciones ?? []).map((o) => ({
        titulo: o.titulo, tipo: o.tipo, porque: o.porque ?? "",
      })),
      /** A quién ve delante el panel, con la misma regla con la que se pega. */
      delante: () => S.vgui?.buscar?.("interact")?.aQuien?.() ?? null,
      /**
       * LA TIENDA (60): lo que enseña la lista y lo que hace un clic.
       *
       * Las filas se leen del DOM y no del modelo. El modelo ya lo comprueba
       * `npm test`; lo que aquí hay que saber es si el jugador las VE, y
       * sobre todo si al pulsar una pasa lo que tiene que pasar.
       */
      tienda: {
        /** Las filas de la lista, con su id y si están apagadas. */
        filas() {
          const p = S.vgui?.abierto;
          if (!p?.listaObjetos) return [];
          return [...p.listaObjetos.children].map((f) => ({
            id: f.dataset.id ?? null,
            texto: f.textContent,
            apagada: f.dataset.apagada === "si",
            marcada: f.dataset.marcada === "si",
          }));
        },
        /** Un clic en la fila `i` de la lista, con el ratón del navegador. */
        pulsar(i) {
          const p = S.vgui?.abierto;
          const f = p?.listaObjetos?.children?.[i];
          if (!f) return false;
          f.click();
          return true;
        },
        /**
         * Señalar una fila SIN pulsarla, que en la lista de compra no es lo
         * mismo: un clic compra. Es el `SlotInput` del panel.
         */
        senalar(i) { return Boolean(S.vgui?.abierto?.ranura?.(i)); },
        /** El precio que enseña el panel de información del señalado. */
        precio: () => S.vgui?.abierto?.precioTexto?.texto ?? null,
        /** La etiqueta de «Selling N items for G gold». */
        venta: () => S.vgui?.abierto?.etiquetaVenta?.texto ?? null,
        /** Lo que el vendedor tiene, del modelo: para comparar con las filas. */
        existencias() {
          const p = S.vgui?.buscar?.("storebuy");
          return (p?.lineas?.() ?? []).map((l) => ({
            id: l.id, nombre: l.nombre, cantidad: l.cantidad, precio: l.precio,
          }));
        },
      },
      /**
       * Los NPC vivos con su script y su sitio, para poder ponerse delante de
       * uno. Va aquí y no en la sonda de fuera porque `S.bichos.instancias` es
       * estado del juego y la sonda de fuera no tiene que saber su forma.
       */
      npcs: () => (S.bichos?.instancias ?? [])
        .filter((i) => !i.muerto)
        .map((i) => ({
          id: i.id, nombre: i.ficha?.nombre ?? null, script: i.ficha?.script ?? null,
          hostil: i.ficha?.hostil ?? null, donde: [...i.donde],
        })),
      /** En qué etapa está el panel de crear personaje. `stage_e`. */
      etapa: () => S.vgui?.abierto?.etapa ?? null,
      /** Cuántos retratos 3D siguen animándose. Cero fuera de esa pantalla. */
      retratosVivos: () => (S.retratosDelPanel?.cuantos ?? 0) + (S.interfaz?.retratos ?? 0),
      /** Lo que se le ha dicho al jugador al elegir una opción. */
      ultimoSuceso: () => S.hudMs?.estado().consola?.at?.(-1) ?? null,
    },
    /**
     * TU PROPIO MENÚ: sentarse y los tres emotes, del experimento 85.
     *
     * **Sólo lee, y no hay `sentar()`.** Es la regla del 29 y del 33: la sonda
     * tiene que pulsar la F y hacer clic en «Sit Down (Rest)» como lo hace una
     * persona. Con un `probe.emociones.sentar()` los controles saldrían verdes
     * con la costura que este experimento vino a cerrar todavía abierta, que es
     * literalmente el fallo medido — `pedir` contestaba y `elegido` no tenía
     * rama, así que el estado se puede poner a mano y el juego seguir roto.
     *
     * `vueltas` son las del `repeatdelay 5` que han dado algo, y se lee la LISTA
     * y no un contador de intentos: el 82 se dejó medio experimento leyendo un
     * estado que persiste en vez de un suceso que ocurre.
     */
    emociones: {
      hay: () => Boolean(S.emociones),
      estado: () => {
        const e = S.emociones;
        if (!e) return null;
        return {
          sentado: e.sentado,
          emocion: e.emocion,
          postura: e.postura(),
          /** El hundimiento de la vista, en unidades del motor. Negativo. */
          vistaZ: e.vistaZ(),
          /** `regen.hp.amt` y `regen.mp.amt`, que son acumuladores. */
          vidaAcumulada: e.vidaAcumulada,
          manaAcumulada: e.manaAcumulada,
          /** `STRUCK_TIME`: vueltas que quedan de castigo. */
          golpe: e.golpe,
          vueltas: e.vueltas.length,
          /** Lo último que cada vuelta ha regalado, para poder sumarlo. */
          dado: e.vueltas.slice(-8),
        };
      },
      /** Lo que de verdad tiene el personaje ahora, para comparar antes/después. */
      vitales: () => {
        const p = S.sesion?.personaje;
        if (!p) return null;
        // El MÁXIMO va aquí al lado y no se supone: el aguante máximo se deriva
        // de las habilidades y el del perfil —3— es sólo el respaldo de cuando no
        // hay personaje. La primera pasada de la sonda del 85 comparó contra ese
        // 3 y leyó «quedan 5,55 de 3», que es el 75: el umbral medía mi supuesto.
        return {
          vida: p.vida ?? 0, mana: p.mana ?? 0,
          aguante: S.aguante ?? 0,
          aguanteMax: S.vitalesDelPersonaje?.().aguanteMax ?? null,
        };
      },
      /**
       * QUÉ ANIMACIÓN TIENE PUESTA EL MUÑECO DEL HUD (`ms_lildude`).
       *
       * Es la pieza que convierte «el estado dice sentado» en «se ve sentado», y
       * va aparte de `estado()` a propósito: son las dos mitades de la costura, y
       * leerlas juntas invitaría a creer que una demuestra la otra.
       */
      muneco: () => S.muneco?.animacion ?? null,
      /**
       * Si el muñeco tiene una animación de UN PASE todavía sonando.
       *
       * Es la pieza que impide que el bucle de dibujo pise un asentimiento en el
       * fotograma siguiente, y se lee aparte para que «se ve nod_no» y «nod_no
       * no se ha acabado» sean dos medidas y no una.
       */
      deUnPase: () => Boolean(S.muneco?.deUnPase),
    },

    /**
     * LAS MISIONES, del experimento 33.
     *
     * Esto sólo LEE y PREPARA. Elegir una opción **no está aquí a propósito**:
     * la sonda tiene que pulsar la F y el número como los pulsa una persona, y
     * si hubiera un `probe.misiones.elegir(2)` la sonda se lo comería y el
     * camino de `menuselect` se quedaría sin medir. Es la misma regla del 29.
     */
    misiones: {
      /** Qué lleva puesto el personaje. `m_Quests`. */
      puestas: () => (S.sesion?.personaje?.misiones ?? []).map((q) => `${q.n}=${q.d}`),
      /** El oro y los objetos, que es lo que un pago tiene que mover. */
      bolsa: () => ({
        oro: S.sesion?.personaje?.oro ?? null,
        objetos: (S.sesion?.personaje?.objetos ?? []).map((o) => `${o.id}×${o.n ?? 1}`),
        manos: { ...(S.sesion?.personaje?.manos ?? {}) },
      }),
      /**
       * Meterle un objeto a la mochila. Es lo que en el juego hace matar al
       * jefe goblin, y matarlo no cabe en una sonda: hay que ir a las cuevas.
       * Se pone el objeto y se dice que se ha puesto, que es honesto; lo que
       * NO se toca es el camino de después, que es lo que se está midiendo.
       */
      dar(id, n = 1) {
        const p = S.sesion?.personaje; if (!p) return null;
        (p.objetos ??= []).push({ id, n });
        return this.bolsa();
      },
      /**
       * El oro, puesto a un número. Para la tienda (60): el control negativo
       * de «sin dinero no se compra» necesita poder dejar la bolsa a cero, y
       * el positivo, poder llenarla. Se dice que lo pone la sonda.
       */
      oro(n) {
        const p = S.sesion?.personaje; if (!p) return null;
        p.oro = Number(n) || 0;
        return this.bolsa();
      },
      /** Quitarlo, para el control positivo de «perdí la cabeza por el camino». */
      quitar(id) {
        const p = S.sesion?.personaje; if (!p) return null;
        p.objetos = (p.objetos ?? []).filter((o) => o.id !== id);
        return this.bolsa();
      },
      /**
       * TODO lo que se ha dicho, no sólo lo que se ve.
       *
       * `hud.estado().consola.lineas` son las VISIBLES, y la consola se
       * desvanece: `m_VisibleLines--` cada cinco segundos
       * (`vgui_eventconsole.h:294-311`, ver `paso()` en `src/play/hud.js`). Una
       * conversación del alcalde dura doce segundos entre `calleventtimed`, o
       * sea que para cuando termina **lo primero que dijo ya no se ve**, y una
       * sonda que mirara ahí diría que no lo dijo. Esto lee el anillo entero.
       */
      dicho() {
        const c = S.hudMs?.consola;
        if (!c) return [];
        const out = [];
        for (let i = 0; i < c.total; i++) {
          const l = c.enLinea?.(i);
          if (l) out.push(`${l.tipo}: ${l.texto}`);
        }
        return out;
      },
      /** ¿Hay guiones horneados? Sin esto la sonda mediría el respaldo del 29. */
      hay: () => Boolean(S.fichaDeGuiones),
      /** El censo que `npm run guiones` dejó escrito: el resultado del 33. */
      censo: () => S.fichaDeGuiones?.censo
        ? {
          conMenu: S.fichaDeGuiones.censo.conMenu,
          menuCabe: S.fichaDeGuiones.censo.menuCabe,
          algunaOpcion: S.fichaDeGuiones.censo.algunaOpcion,
          caben: S.fichaDeGuiones.censo.caben,
        }
        : null,
      /** Cuántos `calleventtimed` quedan por vencer. */
      pendientes: () => S.relojDeGuiones?.pendientes ?? 0,
      /** Lo que el guion de este NPC se ha encontrado y no sabe hacer. */
      noSoportados(id) {
        const g = S.guionesVivos?.get?.(id) ?? null;
        return g ? g.noSoportados.map((x) => `${x.tipo} ${x.nombre}`) : null;
      },
      /**
       * Las opciones que el guion registró la última vez, con su tipo y su
       * retrollamada. El panel sólo enseña el título; esto dice qué hay detrás.
       */
      opcionesDe(id) {
        const g = S.guionesVivos?.get?.(id) ?? null;
        return g ? g.opciones.map((o) => ({ titulo: o.titulo, tipo: o.tipo, datos: o.datos, respuesta: o.respuesta })) : null;
      },
    },
    /**
     * EL CICLADOR Y LAS DOCE RANURAS, por la misma puerta que el bucle.
     *
     * `avanzar()` es `probe.hud.avanzar`: el mismo `pasoDelHud` que corre el
     * fotograma mueve los dos relojes, el de la espera y el del aguante.
     */
    ranuras: {
      /** Una pulsación de ciclar: `weapon`, `spell` o `arrow`. */
      ciclar(clave) { S.ciclar(clave); return this.estado(); },
      /** El botón de atacar. Devuelve si se ha COMIDO el golpe. */
      confirmar: () => S.confirmarCiclador(),
      /** Una tecla de ranura abajo y otra arriba, por separado. */
      pulsar(n) { S.ranuras.pulsar(n); return this.estado(); },
      soltar(n) { const o = S.ranuras.soltar(n); S.cumplir(o); return { orden: o, ...this.estado() }; },
      desplazar(cuanto) { S.ranuras.desplazar(cuanto); return this.estado(); },
      /** Las siete armas de partida a la mochila: lo que hace la tecla N. */
      armarse() {
        const p = S.sesion?.personaje;
        if (!p) return null;
        for (const id of (S.sesion.catalogo?.nuevoPersonaje?.armas ?? [])) {
          if (id === p.manos?.derecha) continue;
          if ((p.objetos ?? []).some((o) => o.id === id)) continue;
          if (!S.catalogoDeArmas?.has(id)) continue;
          (p.objetos ??= []).push({ id, n: 1 });
        }
        return this.estado();
      },
      /** Empuñar a pelo, para el censo de las siete armas. */
      async empunar(id) {
        if (S.sesion?.personaje) S.sesion.personaje.manos.derecha = id;
        await S.empunar(id);
        return {
          arma: S.brazo?.arma?.id ?? null,
          nombre: S.brazo?.arma?.nombre ?? null,
          ataques: (S.brazo?.ataques ?? []).length,
          esDeTiro: Boolean(S.brazo?.esDeTiro),
          conModelo: Boolean(S.armaEnMano),
        };
      },
      /** Las siete de `reg.newchar.weaponlist`. */
      armasDePartida: () => S.sesion?.catalogo?.nuevoPersonaje?.armas ?? [],
      estado: () => ({
        etiqueta: S.ciclador.etiqueta,
        activo: S.ciclador.activo,
        tipo: S.ciclador.tipo,
        reloj: S.ciclador.reloj,
        enMano: S.sesion?.personaje?.manos?.derecha ?? null,
        municion: S.municionElegida,
        desplazamiento: S.ranuras.desplazamiento,
        guardadas: S.ranuras.aTexto(),
        enPantalla: S.hudMs?.estado().ranura ?? null,
        /** Lo que hay en el DOCUMENTO, que es distinto de lo que hay en memoria. */
        enElPersonaje: (S.sesion?.personaje?.ranuras ?? []).map((r) => (r ? `${r.tipo}:${r.id}` : null)),
      }),
      /**
       * Guardar y volver a entrar, sin tocar el disco de verdad: es lo que hace
       * el motor al aparecer, y es la única forma de comprobar que una ranura
       * sobrevive. Si `tirar` trae un identificador, ese objeto se pierde antes
       * de recobrar — que es el caso de «vendiste la espada».
       */
      recobrar(tirar = null) {
        const p = S.sesion?.personaje;
        if (!p) return null;
        if (tirar) {
          p.objetos = (p.objetos ?? []).filter((o) => o.id !== tirar);
          if (p.manos?.derecha === tirar) p.manos.derecha = null;
        }
        S.recobrarRanuras();
        return this.estado();
      },
    },
    /** EL MENÚ PRINCIPAL. */
    menu: {
      hay: () => Boolean(S.menuMs),
      abrir: (enJuego) => { S.menuMs?.abrir(Boolean(enJuego)); return S.menuMs?.estado() ?? null; },
      cerrar: () => { S.menuMs?.cerrar(); return S.menuMs?.estado() ?? null; },
      mover: (paso) => { S.menuMs?.mover(paso); return S.menuMs?.estado() ?? null; },
      elegir: () => S.menuMs?.elegir() ?? null,
      estado: () => S.menuMs?.estado() ?? null,
      /**
       * EL VOLUMEN DE LOS SONIDOS DEL MENÚ — el 85.
       *
       * Se lee del `volume` de los propios elementos `Audio` y NO de la variable
       * que lo guarda, que es la diferencia entre «el ajuste se apuntó» y «el
       * ajuste llegó». El fallo que esto vigila era exactamente ése: el
       * deslizador guardaba su número y nadie lo repartía, porque quien reparte
       * (`aplicarAjustes`) no existe hasta que carga un mapa — y el menú es el
       * sitio donde todavía no hay mapa.
       *
       * `null` si el menú no está montado o si no se horneó ningún sonido; eso lo
       * distingue de un 0, que es un volumen legítimo y es lo que se ve al bajar
       * el deslizador del todo.
       */
      volumen: () => S.menuMs?.volumen ?? null,
    },
    mundo: {
      /** La escala del mundo, para poder escribir un umbral en unidades. */
      unidadesPorMetro: () => S.level?.unitsPerMetre ?? null,
      /**
       * HABLAR EN VOZ LOCAL SIN PASAR POR EL CAJETÍN — experimento 79.
       *
       * ── CUIDADO, Y HAY QUE DECIRLO ──────────────────────────────────────
       *
       * Esto **se salta el camino del jugador**, y la regla de la casa es que
       * «si su camino no pasa por `menuselect`, no cuenta». Por eso la sonda
       * del 79 mide lo que importa —que la opción del menú hace hablar y que
       * el NPC contesta— **pulsando el botón con el ratón** y **escribiendo en
       * el chat con el teclado**, y usa esta puerta sólo para lo que por ahí
       * no se puede medir sin falsearlo: **el alcance**. Para comprobar que a
       * 500 unidades no te oyen hay que hablar desde 500 unidades, y desde
       * allí no hay menú que abrir porque no tienes a nadie delante.
       *
       * Devuelve lo que pasó —cuántos oyeron y quién contestó qué— que es lo
       * que distingue «no me oyó» de «me oyó y no tenía nada que decir».
       */
      hablaElJugador: (texto) => S.interacciones?.hablaElJugador?.(texto) ?? null,

      // ── EL 81: TRES LECTORES PARA LA MISIÓN DE LA SIDRA ─────────────────
      //
      // Tres NPC se pasan el estado de una misión entre ellos con
      // `callexternal`, y **el jugador no lleva nada encima**: lo único que
      // cambia está dentro de los guiones. Así que lo que hay que poder leer
      // es eso, y no hay pantalla donde mire.
      //
      // Son LECTORES, no puertas: ninguno ejecuta nada del juego. Lo que la
      // sonda del 81 hace, lo hace escribiendo en el chat con el teclado, que
      // es por donde empieza una misión de Edana (`catchspeech`). Esto sólo
      // sirve para VER si llegó, que es lo que una captura de pantalla no
      // puede contar.

      /** El registro de nombres: lo que resuelve `$get_by_name`. */
      nombreDeEntidad(nombre) {
        S.interacciones?.ponerNombresDeNpc?.();
        return S.interacciones?.entidades?.porNombre?.(String(nombre)) ?? null;
      },

      /** Variables del guion de un NPC, por su id de instancia. */
      variablesDeNpc(id, claves = []) {
        const i = S.interacciones;
        const inst = (i?.losNpc?.() ?? []).find((x) => x?.id === id);
        const g = inst ? i.guionDe(inst) : null;
        if (!g) return null;
        const una = (k) => g.guion?.variables?.get?.(k) ?? g.guion?.vars?.get?.(k) ?? null;
        return Object.fromEntries(claves.map((k) => [k, una(k)]));
      },

      /**
       * `$cansee(player,<rango>)` tal como lo ve ESE NPC, ahora mismo.
       *
       * Hace falta porque el getter decide si un bloque entero se ejecuta —con
       * el `if` VIEJO, un «no» abandona el bloque— y desde fuera eso se ve
       * como «el NPC no contesta», que es lo mismo que se vería si el fallo
       * estuviera en otro sitio. Preguntarle al getter separa las dos cosas.
       */
      ve(id, rango = "128") {
        const i = S.interacciones;
        const inst = (i?.losNpc?.() ?? []).find((x) => x?.id === id);
        // Un `id` que no está en la manada NO es «no te ve»: es que la sonda
        // está preguntando por otro. Se distingue, porque si no el instrumento
        // devuelve el valor de reposo del getter y parece una medida.
        if (!inst) return "sin ese npc";
        const g = i.guionDe(inst);
        if (!g) return "sin guion";
        const personaje = S.sesion?.personaje ?? null;
        if (!personaje) return "sin personaje";
        /**
         * **SE ATA AL JUGADOR, QUE ES LO QUE HACE `pedirOpciones`.**
         *
         * `$cansee` pregunta por el jugador que tiene delante, y ese atado lo
         * pone el menú al abrirse (`npcguion.js:966`). Preguntarle al getter
         * sin atar nada devolvía «0» —correctamente, porque para él no había
         * nadie— y la sonda lo leía como «no te ve»: el apartado 4 metido en
         * el instrumento. Se ata, se pregunta y **se deja como estaba**, que
         * una sonda que recalcula en vez de leer deja de ser testigo (el 65).
         */
        const antes = g.jugador;
        g.jugador = {
          personaje,
          ref: personaje.id ?? "player",
          origen: (S.player?.feet ?? []).join(" ") || null,
        };
        try { return g.entorno?.ve?.("player", String(rango)) ?? null; }
        finally { g.jugador = antes; }
      },
      /** Deja los pies donde se le diga. Sin esto no se puede llegar al agua. */
      poner(x, y, z) {
        S.player.body.setTranslation({ x, y: y + S.player.perfil.height / 2, z }, true);
        S.player.body.setNextKinematicTranslation({ x, y: y + S.player.perfil.height / 2, z });
        S.player.vel = [0, 0, 0];
        S.player.caida = 0;
        S.world.world.step();
        return S.player.feet;
      },
      /**
       * Apunta la vista a un punto de la escena.
       *
       * Hace falta para el golpe y no es un adorno: el cono de ataque es de
       * ±45° de RUMBO, así que sin girar la cámara «no le doy a nada» mide hacia
       * dónde mira la cámara al arrancar y no el alcance del arma.
       */
      mirar(x, y, z) {
        const p = S.player.eye;
        const dx = x - p[0], dy = y - p[1], dz = z - p[2];
        S.player.yaw = Math.atan2(-dx, -dz);
        S.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        S.camera.rotation.set(S.player.pitch, S.player.yaw, 0);
        return { yaw: S.player.yaw, pitch: S.player.pitch };
      },
      /**
       * Dónde está el ojo y dónde los pies, en la escena.
       *
       * Hace falta para el arco: para medir la caída de una flecha hay que
       * apuntar al HORIZONTE, y el horizonte es «a la altura del ojo», que nadie
       * de fuera sabe dónde está.
       */
      donde: () => ({ ojo: [...S.player.eye], pies: [...S.player.feet] }),
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
        S.player.vel[1] = -unidadesPorSegundo;
        S.player.caida = unidadesPorSegundo;
        return S.player.vel[1];
      },
      /** Que choca ademas del mapa, y que NO — que es la mitad del dato. */
      solidos: () => ({
        adornos: S.solidos?.n ?? 0,
        adornosTotal: S.solidos?.deCuantos ?? 0,
        atravesables: S.solidos?.atravesables ?? 0,
        bichos: S.bichosSolidos?.n ?? 0,
        bichosTotal: S.bichosSolidos?.deCuantos ?? 0,
        // LOS DORMIDOS, que es lo que explica por que `bichos` no es
        // `bichosTotal`: `solidosDeBichos` se salta a los que nacen dormidos
        // (src/play/solidos.js:111), porque el aparecedor los sacara mas
        // tarde. Sin esta cuenta, quien mira la de arriba no puede saber si
        // 31 de 69 esta bien o es un fallo, y acaba escribiendo un umbral.
        bichosDormidos: (S.bichos?.instancias ?? []).filter((i) => i.dormido).length,
        // Donde esta cada caja solida, para poder ir a chocar con una.
        cajas: (S.solidos?.puestos ?? []).map((p) => ({ modelo: p.modelo, caja: p.caja })),
        // Y los que NO chocan, para el control de que no se les ha puesto.
        pasan: (S.level.manifiesto.adornos?.colocaciones ?? [])
          .filter((c) => !c.solido).map((c) => ({ modelo: c.modelo, escena: c.escena })),
      }),
      /** En que medio esta, preguntado igual que en el bucle. */
      medio(pies = S.player.feet) {
        return {
          pies,
          agua: S.volumenes.nivelDeAguaEn(pies),
          escalera: S.volumenes.escaleraEn(pies),
          dano: S.volumenes.danoEn(pies),
          zonas: S.volumenes.zonasEn(pies).map((z) => z.clase),
        };
      },
      /**
       * EL CABLEADO (49), para la sonda: `target` y `targetname`.
       *
       * Lo que una sonda necesita saber no es el estado interno sino QUE SE
       * HA DISPARADO y QUE PASO AL LLEGAR, porque en Gate City la cadena
       * entera acaba en un area que la ignora y eso, en pantalla, se ve
       * exactamente igual que un bus que no funciona.
       */
      disparadores: () => {
        const d = S.disparadores;
        if (!d) return null;
        return {
          n: d.n,
          reloj: Number((S.relojDisparadores ?? 0).toFixed(2)),
          // Cuantas veces se ha disparado cada nombre, desde que empezo.
          cuenta: Object.fromEntries(d.cuenta),
          total: [...d.cuenta.values()].reduce((a, v) => a + v, 0),
          // Los que quedan vivos: un `trigger_once` se borra al dispararse.
          vivos: d.entidades.filter((e) => e.vivo).length,
          tocables: d.entidades.filter((e) => e.piezas && e.vivo).length,
          pendientes: d.pendientes.length,
          // Lo que el bus pidio y el mundo no sabe hacer todavia, contado.
          sinPortar: Object.fromEntries(S.disparosSinPortar ?? []),
        };
      },
      /**
       * EL 67: lo que los `ms_npcscript` han lanzado, con si el NPC contesto.
       *
       * Son las misiones de Edana. Se lee APARTE de `disparadores().cuenta`
       * porque son dos preguntas: que la escena se disparo, y que el NPC de
       * verdad tenia ese evento. Un `contesto: false` es un guion que no lo
       * trae, y eso no es lo mismo que un cable roto.
       */
      escenasDeNpc: () => [...(S.escenasDeNpc ?? [])],
      /**
       * Dispara un nombre a mano, para no tener que andar hasta el volumen.
       *
       * ── CUIDADO, Y ES DEL 76 ─────────────────────────────────────────────
       *
       * Esto llama al BUS y no al juego: mete las salidas en la cola y **no las
       * reparte**, porque `aplicarDisparos` vive en `main.js`. Sirve para
       * mirar el modelo y no sirve para medir un efecto en pantalla: con esto,
       * `disparar("apple5spawn")` sube el contador del bus y no mueve ni la
       * manzana del arbol ni la del suelo. Para eso esta `disparaDelMapa`.
       */
      disparar: (nombre) => (S.disparadores ? S.disparadores.disparar(nombre, null) : null),
      /**
       * EL 76: dispara un nombre POR DONDE LO DISPARA EL JUEGO.
       *
       * Devuelve a cuantas entidades del bus llego, que no es lo mismo que el
       * efecto: un `env_render` que apunta a un ADORNO llega a cero del bus y
       * aun asi apaga el adorno. Las dos cosas se leen por separado a proposito.
       */
      disparaDelMapa: (nombre) => S.dispara?.(nombre) ?? null,
      /**
       * EL 76: los adornos CON NOMBRE y su estado de dibujo.
       *
       * Un `env_model` con `targetname` no va fundido en la malla de los 46:
       * tiene su propia malla para que un `env_render` pueda esconderlo. Esto
       * trae `visible`, el `alfa` y cuantas veces le han cambiado el aspecto.
       */
      adornos: () => S.censoDeAdornos?.() ?? [],
      // ── EL 77: LOS NPC QUE ANDAN PORQUE EL MAPA SE LO MANDA ──────────────
      /**
       * UN NPC POR SU `targetname` DEL MAPA.
       *
       * Hace falta porque los dos accesos que ya habia —`probe.ia.estado` y
       * `probe.ia.irA`— van **por indice de la lista de hostiles**, y Edrin es
       * un vecino: no esta en esa lista. Un indice sobre otra lista no da un
       * error, da a otro bicho, y entonces «no se ha movido» seria cierto y de
       * alguien a quien nadie habia mandado a ningun sitio.
       *
       * Y el nombre que se pide es el del MAPA (`edrin`), no el que se lee en
       * pantalla («Edrin, Captain of the Guard»): son dos campos distintos y el
       * bus usa el primero. El 67 ya tuvo que anadir `objetivo` al censo por
       * esto mismo.
       */
      npc(nombre) {
        const i = S.bichos?.manada?.porObjetivo?.(nombre);
        if (!i) return null;
        const g = (r) => (((r * 180) / Math.PI) % 360 + 360) % 360;
        return {
          nombre: i.ficha.nombre, objetivo: i.ficha.objetivo ?? null,
          // EL NODO DE THREE, que no es la cuenta. El 71 ya enseño que «el bus
          // dice que se ha movido» y «el dibujo se ha movido» son dos cosas, y
          // que compararlas es lo unico que distingue un numero de una imagen.
          nodo: i.nodo ? [i.nodo.position.x, i.nodo.position.y, i.nodo.position.z] : null,
          donde: [...i.donde],
          yaw: g(i.yaw),
          animacion: i.nombreActual ?? null,
          // La PEDIDA, que no es la puesta: `moveanim run` con un `.mdl` sin
          // `run` deja la anterior y sin esto no se podria ver cual se pidio.
          animPedida: i.animPedida ?? null,
          mandado: i.mandado
            ? { origen: [...i.mandado.origen], proximidad: i.mandado.proximidad } : null,
          ultimoDestino: i.ultimoDestino
            ? { origen: [...i.ultimoDestino.origen], proximidad: i.ultimoDestino.proximidad } : null,
          enEscena: Boolean(i.enEscena), sinIa: Boolean(i.sinIa),
          llegadas: i.llegadas ?? 0, frenado: i.frenado ?? null,
          pasea: Boolean(i.vagabundo?.pasea), muerto: Boolean(i.muerto), dormido: Boolean(i.dormido),
        };
      },
      /** EL 77: que escenas de `ms_npcscript` corren y que ha pasado. */
      escenas: () => ({
        corriendo: S.directorDeEscenas?.censo?.() ?? [],
        diario: (S.directorDeEscenas?.diario ?? []).slice(-40),
      }),
      /** EL 76: el estado de un adorno por su nombre; varios si se repite. */
      adornosLlamados: (nombre) => (S.censoDeAdornos?.() ?? []).filter((a) => a.nombre === nombre),
      /**
       * EL 76: donde cae un punto del mundo EN LA PANTALLA, en pixeles.
       *
       * Hace falta para poder contar pixeles en la ventana donde esta la cosa en
       * vez de en la pantalla entera: la taberna tiene antorchas y parroquianos
       * que se mueven, asi que un recuento global mide el ruido y no el plato.
       *
       * `delante` es el signo de la Z en coordenadas de camara: un punto a la
       * espalda tambien proyecta a un pixel de la pantalla, y creerselo es mirar
       * donde no se esta mirando.
       */
      puntoEnPantalla(p) {
        const c = S.camera;
        const lienzo = S.renderer?.domElement;
        if (!c || !lienzo || !p) return null;
        // LA MATRIZ, AL DIA. `mirar` cambia `camera.rotation` y la matriz no se
        // recalcula hasta que el render la toca: preguntar en el mismo
        // `evaluate` devuelve la camara ANTERIOR, y eso sale como un punto a la
        // espalda estando delante. Lo primero que midio esta sonda fue eso.
        c.updateMatrixWorld(true);
        const v = new THREE.Vector3(p[0], p[1], p[2]);
        const enCamara = v.clone().applyMatrix4(c.matrixWorldInverse);
        v.project(c);
        // `clientWidth` y no `width`: el lienzo lleva el `devicePixelRatio`
        // dentro, y una captura de Playwright esta en pixeles de CSS.
        const w = lienzo.clientWidth, h = lienzo.clientHeight;
        return {
          x: Math.round((v.x * 0.5 + 0.5) * w),
          y: Math.round((-v.y * 0.5 + 0.5) * h),
          ancho: w, alto: h,
          delante: enCamara.z < 0,
          dentro: v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1 && enCamara.z < 0,
          distancia: Number(c.position.distanceTo(new THREE.Vector3(p[0], p[1], p[2])).toFixed(3)),
        };
      },
      /**
       * EL 76: pone el aspecto de un adorno A MANO. **Es un instrumento.**
       *
       * No es el camino del juego y no se mide con esto: sirve para DEJAR una
       * cosa en el estado del que se quiere partir. Hizo falta porque los platos
       * de sopa se encienden solos —`player_joined` llena la taberna— y entonces
       * «disparo y aparece» se mide con el plato ya puesto, o sea no se mide
       * nada. Con esto se apaga uno, y el encendido que se mide lo sigue
       * haciendo el bus.
       */
      aspectoDeAdorno: (nombre, como) => S.adornos?.aplicarRender?.(nombre, como) ?? 0,
      /**
       * EL 76: QUE HAY ENTRE EL OJO Y UN PUNTO, en orden.
       *
       * Hace falta porque la primera medida de esta pieza plantaba a la sonda a
       * 1,3 m del plato de sopa, leia «esta en el centro de la pantalla» y
       * contaba cero pixeles de cambio: **la camara estaba dentro de una mesa**.
       * El punto proyectado no dice si se ve; lo dice un rayo.
       *
       * Es el aviso del 69 —«comprueba que el que mide esta de pie y a la
       * distancia que cree»— convertido en instrumento.
       */
      loQueSeVe(p, { cuantos = 3 } = {}) {
        const c = S.camera;
        if (!c || !p) return null;
        c.updateMatrixWorld(true);
        const dir = new THREE.Vector3(p[0], p[1], p[2]).sub(c.position);
        const largo = dir.length();
        if (!(largo > 0)) return null;
        dir.normalize();
        const rc = new THREE.Raycaster(c.position.clone(), dir, 0.05, largo + 0.5);
        const objetivos = [S.mundo, S.adornos?.grupo, S.mallaDetalle].filter(Boolean);
        return rc.intersectObjects(objetivos, true).slice(0, cuantos).map((h) => ({
          que: h.object.name || h.object.type,
          d: Number(h.distance.toFixed(3)),
        }));
      },
      /**
       * EL 76: plantarse donde SE VEA una cosa, probando sitios.
       *
       * Devuelve el primero desde el que un rayo llega al adorno sin que se
       * interponga nada, o `null` si no hay ninguno — y `null` es un resultado:
       * significa que esa cosa no se ve desde ningun sitio razonable, no que
       * «no cambia nada».
       */
      plantarseAnte(nombre, { radios = [1.2, 1.8, 2.5, 3.2], rumbos = 12 } = {}) {
        const a = (S.censoDeAdornos?.() ?? []).find((x) => x.nombre === nombre);
        if (!a) return null;
        // EL CENTRO DE SUS VERTICES y no `escena`, que es el `origin` de la
        // entidad: el plato de sopa esta 0,8 m por encima del suyo, asi que
        // apuntar a `escena` es apuntar a la mesa que tiene debajo.
        const p = a.centro ?? a.escena;
        for (const r of radios) {
          for (let k = 0; k < rumbos; k++) {
            const t = (k / rumbos) * Math.PI * 2;
            const x = p[0] + Math.cos(t) * r, z = p[2] + Math.sin(t) * r;
            S.player.body.setTranslation({ x, y: p[1] + 0.2 + S.player.perfil.height / 2, z }, true);
            S.player.body.setNextKinematicTranslation({ x, y: p[1] + 0.2 + S.player.perfil.height / 2, z });
            S.player.vel = [0, 0, 0];
            S.player.caida = 0;
            S.world.world.step();
            const ojo = S.player.eye;
            S.camera.position.set(ojo[0], ojo[1], ojo[2]);
            const dx = p[0] - ojo[0], dy = p[1] - ojo[1], dz = p[2] - ojo[2];
            S.player.yaw = Math.atan2(-dx, -dz);
            S.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
            S.camera.rotation.set(S.player.pitch, S.player.yaw, 0);
            const ve = this.loQueSeVe(p, { cuantos: 1 });
            if (ve && ve[0] && ve[0].que === `adorno:${nombre}`) {
              return { radio: r, rumbo: Math.round((t * 180) / Math.PI), pies: S.player.feet, primero: ve[0] };
            }
          }
        }
        return null;
      },
      /** EL 76: lo que la tarjeta dice que ha dibujado en el ultimo fotograma. */
      /**
       * EL 82: LOS HACES montados, y su lado tal como está AHORA.
       *
       * Se leen los vértices de la geometría y no la ficha del manifiesto,
       * porque lo que hay que poder medir es que el lado **gira con la
       * cámara**: es lo único que distingue un haz de un plano pegado, y la
       * ficha diría lo mismo con el plano quieto.
       *
       * Lee, no recalcula. La lección del 65: una sonda que se construye ella
       * el valor que iba a medir deja de ser un testigo.
       */
      haces: () => {
        const g = S.escena?.getObjectByName?.("haces");
        if (!g) return null;
        return g.children.map((m) => {
          const p = m.geometry.getAttribute("position");
          const centro = [
            (p.getX(0) + p.getX(3)) / 2, (p.getY(0) + p.getY(3)) / 2, (p.getZ(0) + p.getZ(3)) / 2,
          ];
          return {
            nombre: m.name,
            vertices: p.count,
            conTextura: Boolean(m.material.map),
            aditivo: m.material.blending === THREE.AdditiveBlending,
            visible: m.visible,
            // El vector que va de un lado al otro del extremo de inicio. Su
            // LARGO es la anchura y su DIRECCIÓN es lo que gira.
            lado: [p.getX(1) - p.getX(0), p.getY(1) - p.getY(0), p.getZ(1) - p.getZ(0)],
            centro,
            // El brillo por vértice: `BEAM_FSHADEIN` arranca en 0 en el inicio.
            brilloInicio: m.geometry.getAttribute("color")?.getX(0) ?? null,
            brilloFin: m.geometry.getAttribute("color")?.getX(3) ?? null,
          };
        });
      },
      /**
       * EL 82: la SALA que el jugador tiene puesta, y quién se la puso.
       *
       * Son dos cosas y hacen falta las dos: `tipo` es lo que suena y `dueño`
       * es cuál de los once `env_sound` ganó. Sin el segundo, «la sala es la
       * 13» no distingue el reparto de un valor que se quedó pegado.
       */
      sala: () => ({
        // LO QUE DICE LA REGLA, que es del reparto y corre siempre.
        tipo: S.salaDelJugador?.tipo ?? null,
        dueño: S.salaDelJugador?.dueño ?? null,
        rango: S.salaDelJugador?.rango ?? null,
        cambios: S.salaDelJugador?.cambios ?? null,
        fuentes: S.fuentesDeSala?.length ?? 0,
        // Y LO QUE EL AUDIO TIENE PUESTO, que es otra cosa y puede ir detrás:
        // el audio nace dormido hasta el primer gesto del usuario. Separarlos
        // es la lección del 60 —una regla dice *qué* y otra decide *dónde*, y
        // la segunda no la ve ninguna prueba de la primera—; juntos, «la sala
        // es null» no distinguía «el reparto no corre» de «nadie ha tocado una
        // tecla todavía».
        enElAudio: S.audio?.salaActual ?? null,
        audioDespierto: Boolean(S.audio?.despierto),
        // EL POR QUÉ NO, fuente por fuente. `unTic` ya lo devuelve; sacarlo es
        // lo que convierte «no gana nadie» en un diagnóstico. Un cero sin
        // motivo es el sitio donde vive una regla muerta (el 69).
        vistos: (S.salaDelJugador?.vistos ?? []).map((v) => ({
          clave: v.clave,
          alcanza: v.alcanza,
          distancia: v.distancia === null ? null : Math.round(v.distancia),
          porQueNo: v.porQueNo,
          radio: S.fuentesDeSala?.[v.clave]?.radio ?? null,
          tipo: S.fuentesDeSala?.[v.clave]?.tipo ?? null,
        })),
      }),
      dibujado: () => {
        const i = S.renderer?.info;
        if (!i) return null;
        // `renderer.info.render` se reinicia en cada `render()`, y el bucle hace
        // DOS —el mundo y, con `autoClear` en falso, el arma en primera persona
        // (main.js:5092 y 5110)—, asi que leerlo a secas devuelve el del ARMA: 8
        // llamadas y 2 904 triangulos, iguales con el pueblo delante o detras.
        // Encender un adorno no movia ese numero y el control salia rojo
        // midiendo la pasada equivocada. Con `autoReset` en falso el contador
        // suma las dos, y se lee entre dos fotogramas para que sea UNO y no los
        // que quepan en la espera.
        return new Promise((listo) => {
          i.autoReset = false;
          requestAnimationFrame(() => {
            i.reset();
            requestAnimationFrame(() => {
              const r = { llamadas: i.render.calls, triangulos: i.render.triangles };
              i.autoReset = true;
              listo(r);
            });
          });
        });
      },
      /**
       * EL 68: el estado de una FICHA del aparecedor, por su `targetname`.
       *
       * Se lee por NOMBRE y no por indice porque es asi como la llama el mapa, y
       * porque el indice de un bicho no dice nada en un informe. Trae `despertada`
       * y `apariciones` juntos a proposito: «no esta puesto» no distingue un jefe
       * que no ha salido nunca de uno que salio y se murio.
       */
      fichaLlamada: (nombre) => S.fichaLlamada?.(nombre) ?? null,
      /** EL 68: los nombres de ficha que un `MSQuery` ha despertado. */
      despertadas: () => [...(S.despertadas ?? [])],

      // ── EL 69: lo que se rompe, se pulsa y se suelta ─────────────────────
      /**
       * Los `func_breakable` del mapa, con su vida, su nombre y su centro.
       *
       * El centro va en METROS DE ESCENA porque es lo que come `mundo.poner`, y
       * la caja del manifiesto ya esta en eso. La lista del bus la da en unidades
       * de GoldSrc, que es otra cosa: mezclarlas pone al jugador a 39 veces la
       * distancia y la sonda diria «no le llego» midiendo la conversion.
       */
      rompibles: () => {
        const r = S.rompibles;
        if (!r) return [];
        return r.rompibles.map((x, k) => {
          const e = S.estadoRompible?.(x.ficha.entidad) ?? {};
          const c = x.ficha.caja;
          return {
            k, entidad: x.ficha.entidad,
            nombre: e.nombre ?? null, objetivo: e.objetivo ?? null,
            vidaInicial: e.vidaInicial ?? null, vida: e.vida ?? null,
            roto: Boolean(e.roto), enPie: !x.roto, visible: x.nodo.visible,
            choca: Boolean(x.colisionador),
            material: e.material ?? null,
            centro: [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2],
            alto: c.max[1] - c.min[1],
          };
        });
      },
      /** Cuantos siguen en pie. Se calcula, no se escribe. */
      rompiblesEnPie: () => S.rompibles?.enPie ?? null,
      /** Lo que se ha roto, lo que se ha pulsado y lo que ha salido. */
      rotos: () => [...(S.rotos ?? [])],
      botonesPulsados: () => [...(S.botonesPulsados ?? [])],
      objetosSueltos: () => [...(S.objetosSueltos ?? [])],
      golpesARompibles: () => S.golpesARompibles ?? 0,
      /** Todos los rompibles, botones y aparecedores de objetos del mapa. */
      censoRompibles: () => S.censoRompibles?.() ?? [],
      /**
       * Pone al jugador delante del rompible `k`, a `d` metros, y le hace mirarlo.
       *
       * A la ALTURA del rompible y no a la suya: un almiar esta en el suelo y el
       * cono del golpe se mide en tres dimensiones, asi que mirarlo desde los ojos
       * sin bajar la cabeza deja el centro fuera del cono y el golpe no entra.
       */
      irAlRompible(k = 0, parteDelAlcance = 0.5) {
        const x = S.rompibles?.rompibles?.[k];
        if (!x) return null;
        const c = x.ficha.caja;
        const cen = [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2];
        const U = S.level.unitsPerMetre;
        // EL ALCANCE SE LEE DEL ARMA, no se pone a ojo. Y hay que descontar la
        // ALTURA: un almiar esta en el suelo y el ojo a metro y medio, asi que a un
        // metro en horizontal la distancia de verdad es 1,56 m. Esto me costo una
        // pasada: a un metro la espada no llegaba y parecia que el cono estaba mal.
        const alcance = (S.brazo?.ataques?.[0]?.alcance ?? 40) / U;
        const pies = c.min[1] + 0.2;
        const alto = (S.player.perfil?.height ?? 1.6) * 0.9;
        const dy = pies + alto - cen[1];
        const quiero = alcance * parteDelAlcance;
        const horizontal = Math.sqrt(Math.max(0.05, quiero * quiero - dy * dy));
        window.probe.mundo.poner(cen[0] + horizontal, pies, cen[2]);
        window.probe.mundo.mirar(cen[0], cen[1], cen[2]);
        return {
          centro: cen, desde: [...S.player.feet],
          alcance, horizontal, dy,
          distanciaAlOjo: Math.hypot(S.player.eye[0] - cen[0], S.player.eye[1] - cen[1],
            S.player.eye[2] - cen[2]),
        };
      },
      /**
       * Lo mismo con el `func_button`, que no tiene malla propia.
       *
       * Se usa su CAJA y no su `escena`: un `func_button` es un brush y no trae
       * `origin`, asi que su `escena` es el cero del mapa. Poner ahi al jugador
       * seria medir un boton que nadie encuentra.
       */
      irAlBoton(d = 1.2) {
        const e = (S.disparadores?.entidades ?? []).find((x) => x.clase === "func_button");
        const c = e?.caja;
        if (!c) return null;
        const cen = [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2];
        window.probe.mundo.poner(cen[0] + d, c.min[1], cen[2]);
        window.probe.mundo.mirar(cen[0], cen[1], cen[2]);
        return { centro: cen, desde: [...S.player.feet] };
      },
      /**
       * ANDAR CONTRA UN PUNTO con el `player.step` del bucle, y decir hasta donde
       * se ha llegado. Es el control del CHOQUE, y hace falta que sea andando.
       *
       * «El almiar ha desaparecido» se veria igual apagando solo el dibujo. La
       * unica pregunta que distingue las dos cosas es si se puede PASAR, y para
       * responderla hay que andar: teletransportar al jugador dentro de la caja no
       * mide nada, porque `poner` no resuelve colisiones.
       */
      andarHacia(punto, segundos = 1.5) {
        window.probe.mundo.mirar(punto[0], punto[1], punto[2]);
        // PRIMERO SE DEJA CAER HASTA QUE APOYA, y no es un detalle: el control en
        // el aire de GoldSrc es casi cero (`airaccelerate`), asi que andar desde
        // 20 cm por encima del suelo avanza 27 cm en dos segundos y medio. Lo medi
        // creyendo que el almiar le paraba, y le paraba estar cayendose: andando
        // hacia el lado LIBRE avanzaba lo mismo. El control que lo caz0 fue andar
        // al reves, no mirar mejor.
        for (let k = 0; k < 120 && !S.player.grounded; k++) S.player.step(S.DT, {});
        const apoyado = S.player.grounded;
        const antes = [...S.player.feet];
        const v = S.vitalesDelPersonaje();
        const max = velocidadAndando(v);
        const pasos = Math.max(1, Math.round(segundos / S.DT));
        for (let k = 0; k < pasos; k++) {
          S.player.step(S.DT, { forward: 1, strafe: 0, jump: false, agachar: false,
            maxima: max, agua: 0, escalera: null });
        }
        const luego = [...S.player.feet];
        return {
          antes, luego, apoyado, enSuelo: S.player.grounded,
          avanzado: Math.hypot(luego[0] - antes[0], luego[2] - antes[2]),
          // Lo que importa: cuanto queda para el punto al que iba.
          queda: Math.hypot(punto[0] - luego[0], punto[2] - luego[2]),
        };
      },
      /**
       * ¿HAY ALGO SÓLIDO EN ESE PUNTO? Se lo pregunta a Rapier, no a nuestra
       * contabilidad.
       *
       * Es el control del choque del 69, y llegué a el despues de dos medidas
       * falsas. Andar contra el monton no servia: los cuatro almiares caben en dos
       * metros, asi que romper uno lo tapa el de al lado, y romper los cuatro deja
       * la PARED de la casa detras — 3,33 m antes y 3,33 m despues, con el trabajo
       * bien hecho. Un rayo corto centrado en la caja del almiar solo puede tocar
       * al almiar, asi que responde la pregunta y nada mas.
       *
       * Y le pregunta a la fisica y no a `choca`, que es nuestro apunte: si el
       * colisionador se quitara de la lista y no del mundo, `choca` diria false y
       * el jugador seguiria chocando.
       */
      solidoEn(punto, largo = 0.5) {
        if (!S.trazaLibre) return null;
        // `trazaLibre` es la MISMA traza que usa el golpe y habla en UNIDADES de
        // GoldSrc, no en metros de escena. Se reaprovecha en vez de montar otro
        // rayo al lado: dos trazas distintas serian dos mundos, que es el fallo del
        // 63 con otra ropa.
        //
        // Y EL RAYO TIENE QUE ENTRAR DESDE FUERA. Lo escribi centrado en la caja y
        // daba `false` con el almiar puesto: los colisionadores son TRIMESH, y un
        // trimesh no tiene interior — un rayo que empieza y acaba dentro no cruza
        // ni un triangulo. Asi que se tira de arriba abajo, cruzando la tapa.
        const U = S.level.unitsPerMetre;
        const u = (p) => [p[0] * U, p[1] * U, p[2] * U];
        const a = u([punto[0], punto[1] + largo, punto[2]]);
        const b = u([punto[0], punto[1] - largo, punto[2]]);
        return !S.trazaLibre(a, b);
      },
      /**
       * A QUE ALTURA esta lo primero solido bajo ese punto, en metros de escena.
       *
       * Es la medida del choque que no se puede confundir con otra cosa: encima de
       * un almiar entero el rayo se para en su tapa, y roto se para en el suelo.
       * Andar contra el no servia —los cuatro caben en dos metros y detras hay una
       * pared— y un rayo horizontal corto tampoco, por lo del trimesh.
       */
      alturaSolidaBajo(punto, desde = 4) {
        if (!S.trazaLibre) return null;
        const U = S.level.unitsPerMetre;
        const arriba = punto[1] + desde;
        // Busqueda binaria sobre `trazaLibre`, que solo dice si o no. Veinte
        // vueltas dan menos de un centimetro en cuatro metros.
        let alto = arriba, bajo = punto[1] - desde;
        const libreHasta = (y) => S.trazaLibre(
          [punto[0] * U, arriba * U, punto[2] * U], [punto[0] * U, y * U, punto[2] * U]);
        if (libreHasta(bajo)) return null;      // no hay nada debajo en ese tramo
        for (let i = 0; i < 20; i++) {
          const m = (alto + bajo) / 2;
          if (libreHasta(m)) alto = m; else bajo = m;
        }
        return Math.round(((alto + bajo) / 2) * 1000) / 1000;
      },
      /** Golpea el boton como lo golpea la espada, por `danar` del bus. */
      golpearBoton(dano = 1) {
        const e = (S.disparadores?.entidades ?? []).find((x) => x.clase === "func_button");
        if (!e) return null;
        const hizo = S.disparadores.danar(e, dano, { tipo: "club", deJugador: true });
        S.aplicarDisparos(S.disparadores.recoger());
        return { hizo, pulsado: e.est.pulsado, vida: e.est.vida };
      },
      /**
       * Golpea el rompible `k` como lo golpea la espada, y devuelve su estado.
       *
       * Entra por `danar` del bus, que es por donde entra `pegar`, y con
       * `tipo: "club"` porque una espada es `DMG_CLUB`. NO es un atajo: es la
       * misma llamada. Lo que este atajo se salta es el CONO, y por eso la sonda
       * mide el cono aparte, con `atacar()` de verdad.
       */
      golpearRompible(k = 0, dano = 3) {
        const x = S.rompibles?.rompibles?.[k];
        if (!x) return null;
        const e = S.disparadores?.entidades.find((y) => y.entidad === x.ficha.entidad);
        if (!e) return null;
        S.disparadores.danar(e, dano, { tipo: "club", deJugador: true });
        S.aplicarDisparos(S.disparadores.recoger());
        return window.probe.mundo.rompibles()[k];
      },
      // ── EL 70: las puertas que se corren ───────────────────────────────────
      /** Donde esta cada deslizante AHORA, leido del nodo y no de nuestra cuenta. */
      correderas: () => S.censoCorrederas?.() ?? [],
      /** El estado que lleva el BUS de cada puerta, por indice del lump. */
      estadoPuerta: (entidadDelBsp) => S.estadoPuerta?.(entidadDelBsp) ?? null,
      censoDePuertas: () => S.censoDePuertas?.() ?? null,
      /** Las rotatorias con su angulo, para ver que NO se abren al tocarlas. */
      rotatorias: () => S.censoRotatorias?.() ?? [],
      puertasMovidas: () => S.puertasMovidas ?? [],
      puertasAbiertas: () => S.puertasAbiertas ?? [],
      /**
       * EL CENTRO de una deslizante por su nombre, en metros de escena.
       *
       * Sale de la CAJA del manifiesto y no de `escena`: una `func_door` es un
       * brush sin `origin`, asi que su `escena` es el cero del mapa. Es el mismo
       * tropiezo que el boton del 69 y se resuelve igual.
       */
      centroDeCorredera(nombre) {
        const f = (S.level.manifiesto.interactivas?.correderas ?? []).find((p) => p.nombre === nombre);
        if (!f) return null;
        return [0, 1, 2].map((k) => (f.caja.min[k] + f.caja.max[k]) / 2);
      },
      /**
       * Rompe el almiar que abre la cloaca —el de 8 de vida— por donde lo rompe
       * la espada, y devuelve lo que ha pasado.
       *
       * No busca por indice: busca por VIDA, que es lo que lo distingue de los
       * otros tres. Un indice escrito a mano se queda viejo con el primer
       * rehorneado y no da error: da otro almiar.
       */
      romperElDeLaCloaca(dano = 20) {
        const e = (S.disparadores?.entidades ?? [])
          .find((x) => x.clase === "func_breakable" && Number(x.vida) === 8);
        if (!e) return null;
        S.disparadores.danar(e, dano, { tipo: "club", deJugador: true });
        S.aplicarDisparos(S.disparadores.recoger());
        return { roto: e.est.roto, entidad: e.entidad };
      },
      // ── EL 71: los objetos en el suelo ────────────────────────────────────
      /** El censo del BUS: qué hay tirado, dónde y cuánto le queda. */
      suelo: () => S.censoDelSuelo?.() ?? [],
      /**
       * Y el de los NODOS de Three, que es OTRA fuente a propósito.
       *
       * El 69 lo enseñó con los almiares: leer nuestra propia contabilidad y
       * llamarlo medida es el verde vacío del apartado 4. Si el bus dice que la
       * manzana está en el suelo y el nodo sigue en el árbol, esto lo enseña.
       */
      nodosDelSuelo: () => S.censoDeNodosDelSuelo?.() ?? [],
      /** EL 96: cuántos modelos del suelo esperan a caer, y esperar a uno. */
      perezosasDelSuelo: () => S.perezosasDelSuelo ?? null,
      esperarModeloDelSuelo: (guion) => S.esperarModeloDelSuelo?.(guion) ?? Promise.resolve(false),
      cuentasDelSuelo: () => S.cuentasDelSuelo ?? null,
      /** Cada aterrizaje con el sonido que pidió y su tono. */
      caidasDelSuelo: () => S.caidasDelSuelo ?? [],
      catalogoDelSuelo: () => S.catalogoDelSuelo?.() ?? [],
      /** Qué se cogería AHORA, sin cogerlo. Para medir el alcance y el cono. */
      aManoAhora: () => S.loQueHayAMano?.() ?? [],
      /** Y por qué NO: la respuesta de `aMano` con su motivo. */
      porQueNoSeCoge: (i) => S.porQueNoSeCoge?.(i) ?? null,
      /** La tecla `x`, por la misma puerta por la que entra el teclado. */
      coger: () => S.coger?.() ?? null,
      /**
       * Dispara un `msitem_spawn` por su guion, por donde lo dispara el cable.
       *
       * No por índice: un índice escrito a mano se queda viejo con el primer
       * rehorneado y no da error, da otro aparecedor (la lección del 69 con el
       * almiar). Los tres `item_log` de Edana **no los puede disparar nadie**
       * —no tienen nombre y traen `spawnstart`—, así que ésta es la única
       * manera de tener un SEGUNDO objeto en el suelo, y por eso existe.
       */
      soltarPorGuion(guion) {
        const es = (S.disparadores?.entidades ?? [])
          .filter((x) => x.clase === "msitem_spawn" && x.guion === guion);
        if (!es.length) return null;
        // TODOS los que haya, y eso importa: Edana tiene DOS `item_log` en el
        // MISMO punto (480, −200, −136). Dispararlos es la manera honrada de
        // tener dos cosas a los pies para medir el `ItemCount = 1`, sin mover
        // nada a mano.
        for (const e of es) {
          // `USE_TOGGLE` (3), que es con lo que llega un `multi_manager`.
          S.disparadores.usar(e, null, 3, 0, null);
        }
        S.aplicarDisparos(S.disparadores.recoger());
        return { cuantos: es.length, entidades: es.map((e) => e.entidad) };
      },
      /**
       * Planta al jugador a `d` metros de un objeto tirado, mirándolo.
       *
       * Sin meterlo dentro: el 70 enseñó que teletransportarse al centro de una
       * cosa mide el rebote y no la regla.
       */
      irAlObjeto(i, d = 1) {
        const o = (S.censoDelSuelo?.() ?? []).find((x) => x.i === i);
        if (!o) return null;
        const U = S.level.unitsPerMetre;
        const m = [o.donde[0] / U, o.donde[1] / U, o.donde[2] / U];
        window.probe.mundo.poner(m[0] + d, m[1] + 0.2, m[2]);
        window.probe.mundo.mirar(m[0], m[1], m[2]);
        return { objeto: m, desde: [...S.player.feet] };
      },
      // ── EL 75: soltar del inventario ──────────────────────────────────────
      /** La tecla `c`, por la misma puerta por la que entra el teclado. */
      soltar: () => S.soltar?.() ?? null,
      /** Que lleva la mano derecha: es lo que `drop` sin argumento suelta. */
      loQueLlevaLaMano: () => S.loQueLlevaLaMano ?? null,
      /**
       * Los que se quedaron QUIETOS encima de una entidad de brush.
       *
       * Lo que define este caso es lo que NO pasa —no suena, no se tumba, no
       * reinicia el reloj—, y una ausencia no se mide sola: esto es el apunte
       * positivo que permite medirla.
       */
      posados: () => S.posadosDelSuelo ?? [],
      /**
       * El `pev->angles` y el `v_forward` con los que se tiraria AHORA.
       *
       * Para medir el TERCIO sin soltar nada: el cabeceo que sale no es el de
       * la vista, es un tercio y del reves (sv_user.cpp:993).
       */
      rumboDeSoltarAhora: () => S.rumboDeSoltarAhora?.() ?? null,
      /**
       * Pone en la mano derecha lo que sea, por la lista del personaje.
       *
       * Es lo que hace `cumplir` al empuñar algo del ciclador; la sonda necesita
       * poder elegir el arma porque el personaje de partida trae la que eligio
       * el menu y lo que se mide aqui es soltar un arma concreta.
       */
      empunarPorId(id) {
        const p = S.sesion?.personaje;
        if (!p) return null;
        p.objetos = (p.objetos ?? []).filter((o) => o.id !== id);
        p.manos.derecha = id;
        return p.manos.derecha;
      },
      /**
       * Planta al jugador ENCIMA de una deslizante, mirando hacia abajo.
       *
       * Para la tapa de la cloaca de Edana, que es el caso del 75: un objeto que
       * se queda sobre una `func_door` no toca suelo para el motor. Se coloca a
       * `alto` metros por encima de la tapa y no dentro, que es el tropiezo del
       * 70.
       */
      irSobreCorredera(nombre, { alto = 0.1, margen = 0.3 } = {}) {
        const f = (S.level.manifiesto.interactivas?.correderas ?? []).find((p) => p.nombre === nombre);
        if (!f) return null;
        const cen = [0, 1, 2].map((k) => (f.caja.min[k] + f.caja.max[k]) / 2);
        const arriba = f.caja.max[1];
        // AL BORDE DE ACA Y MIRANDO AL DE ALLA, y pegado a la tapa.
        //
        // No en el centro y a un metro de alto, que es lo que habia aqui y no
        // servia: un objeto soltado SALE DISPARADO —175 de empuje y como poco
        // 30 grados de subida— y desde el centro vuela 2,8 m, o sea que se pasa
        // la tapa de largo y cae al suelo de verdad. Lo que se mide entonces es
        // que mi tiro no llega, no que una `func_door` no es suelo.
        const largo = f.caja.max[2] - f.caja.min[2] > f.caja.max[0] - f.caja.min[0] ? 2 : 0;
        const aca = [...cen], alla = [...cen];
        aca[largo] = f.caja.max[largo] - margen;
        alla[largo] = f.caja.min[largo] + margen;
        window.probe.mundo.poner(aca[0], arriba + alto, aca[2]);
        window.probe.mundo.mirar(alla[0], arriba - 10, alla[2]);
        return {
          centro: cen, arriba, tamano: [0, 1, 2].map((k) => f.caja.max[k] - f.caja.min[k]),
          pies: [...S.player.feet], mirandoA: alla,
        };
      },
      /**
       * SOLTAR A MEDIA ESTOCADA, que es el unico candado de `CanDrop` que esta
       * conectado (`if (CurrentAttack) return false;`, genericitem.cpp:1293).
       *
       * `atacar()` corre el ataque entero dentro de la llamada y acaba con el
       * brazo quieto, asi que no sirve: hay que pulsar la `c` MIENTRAS. Esto
       * adelanta el brazo unos tics, comprueba que esta atacando de verdad —si
       * no lo estuviera, el control medira el reposo y pasaria— y suelta.
       */
      soltarAtacando(tics = 6) {
        if (!S.brazo) return null;
        for (let k = 0; k < tics; k++) {
          S.brazo.tic(S.DT, { pulsado: true, destreza: S.destrezaDe(S.brazo.ataques[0]) });
        }
        const atacando = Boolean(S.brazo.atacando);
        const r = S.soltar?.() ?? null;
        return { atacando, soltado: r, fase: S.brazo.fase };
      },
      /** Donde estan las cosas, para que la sonda no las escriba a mano. */
      sitios: () => ({
        agua: (S.level.manifiesto.interactivas?.agua ?? []).map((a) => a.caja),
        escaleras: (S.level.manifiesto.interactivas?.escaleras ?? []).map((a) => a.caja),
        dano: (S.level.manifiesto.interactivas?.dano ?? []).map((a) => a.caja),
        puertas: (S.level.manifiesto.interactivas?.puertas ?? []).map((p) => ({
          modelo: p.modelo,
          caja: p.caja, bisagra: p.bisagra, grados: p.grados, velocidad: p.velocidad, espera: p.espera,
        })),
      }),
      puertas: () => (S.puertas?.puertas ?? []).map((p) => ({
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
        return (S.puertas?.puertas ?? []).map((p) => {
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
          const v = new THREE.Vector3(0, 0, -1).applyEuler(S.camera.rotation);
          v.y = 0; if (v.lengthSq() > 1e-6) v.normalize();
          return [v.x, 0, v.z];
        })();
        for (let i = 0; i < pasos; i++) {
          const cerca = new Set(S.puertas?.cercaDe(S.player.feet, S.U) ?? []);
          S.puertas?.tic(dt, {
            cerca: (p) => cerca.has(p), desde: S.player.feet, mirando: m,
            radioDelQueAbre: S.player.perfil.radius,
          });
        }
        return this.puertas();
      },
      /** Deja las nueve cerradas, para poder repetir una prueba de apertura. */
      cerrarPuertas() {
        // "cerrando" con angulo 0 y NO "cerrada": es lo que hace que el tic
        // vuelva a colocar el nodo y el colisionador. Poniendolas "cerradas" a
        // secas deja la hoja girada en pantalla con el estado diciendo que no.
        for (const p of S.puertas?.puertas ?? []) { p.estado = "cerrando"; p.angulo = 0; p.espera = 0; }
        S.puertas?.tic(1 / 60, {});
        return this.puertas();
      },
    },
    /** Las asignaciones de teclas, para poder tocarlas sin raton. */
    /**
     * EL GUION DEL JUGADOR — el 64. Sólo de LECTURA a propósito.
     *
     * Lo que hace falta para medir es saber qué consejos se han enseñado y qué
     * relojes están armados; disparar los eventos desde aquí mediría que el
     * intérprete sabe ejecutarlos, no que el juego los llame — que es el fallo
     * del apartado 4. La sonda mata al jugador con la K, como un jugador.
     */
    jugador: {
      hay: () => Boolean(S.guionJugador),
      /** `m_ViewedHelpTips`: los consejos que este personaje ya ha visto. */
      vistos: () => [...(S.guionJugador?.vistos ?? [])],
      /** Los enseñados en ESTA partida, en orden. */
      ensenados: () => [...(S.guionJugador?.enseñado ?? [])],
      /** Los eventos con `repeatdelay` y cuándo les toca. */
      repeticiones: () => (S.guionJugador?.guion?.repeticiones ?? []).map((r) => ({
        evento: r.evento.nombre, cada: r.cada, cuando: Number(r.cuando.toFixed(2)),
      })),
      /** Lo que el guion pidió y no se supo hacer. */
      noSoportados: () => (S.guionJugador?.noSoportados ?? []).map((x) => `${x.tipo} ${x.nombre}`),
      /**
       * EL 65: lo que el guion le está haciendo a la vista, en unidades de
       * GoldSrc. Es la variable `game.cleffect.view_ofs.*`, leída como la lee
       * el cliente del mod. Se da APARTE de la cámara a propósito: comparar
       * las dos —lo que el guion pide y dónde acaba la cámara— es la medida.
       */
      vista: (cual = "view") => S.guionJugador?.vista(cual) ?? null,
      /**
       * EL 67: los nombres que el guion ha disparado con `usetrigger`.
       *
       * Se lee APARTE de `probe.disparadores().cuenta`, y ahi esta la medida:
       * uno dice lo que el guion PIDIO y el otro lo que el bus RECIBIO. Con los
       * dos se distingue «el evento no corrio» de «corrio y el cable esta roto»,
       * que en pantalla se ven igual —la taberna vacia— y tienen arreglos
       * distintos.
       */
      disparados: () => [...(S.guionJugador?.disparados ?? [])],
      /**
       * EL 67: una variable del guion del jugador, por nombre.
       *
       * Hace falta para distinguir «el evento no corrio» de «corrio y su guarda
       * era falsa», que son dos arreglos distintos y el mismo sintoma. La
       * cadena de la taberna vive detras de un `if ( !PLR_LIGHTS_SYNCED )`, y
       * sin poder leer esa variable la unica forma de saberlo es adivinar.
       */
      variable: (nombre) => S.guionJugador?.guion?.buscarVar?.(String(nombre))?.valor ?? null,
      /**
       * EL 67: llama un evento del guion a mano y dice si alguien contesto.
       *
       * Es para el CONTROL POSITIVO de un cero: si `usetrigger` no llega, hay
       * que poder ver si el evento existe y contesta antes de acusar al cable.
       * No sustituye al camino del jugador —eso lo mide llamar al evento desde
       * donde el juego lo llama— y por eso esta aqui y no en la sonda.
       */
      llamar: (nombre, params = []) => Boolean(S.guionJugador?.llamar(String(nombre), params)),
    },
    /**
     * EL 66: LOS GUIONES DE LOS OBJETOS, que es lo que le afecta al jugador.
     *
     * Casi todo lo que le pasa se lo hace un objeto que lleva encima, y la
     * interfaz es `callexternal ent_owner <evento>` — que era un no-op en todo
     * el proyecto. `pedidos` es lo que cada objeto le ha pedido de verdad al
     * guion del jugador, con si lo contestó: leerlo aparte del efecto es lo que
     * separa «el objeto no llama» de «el jugador no sabe contestar».
     */
    objetos: {
      /** Si la tabla horneada está cargada. Sin esto, todo lo demás son ceros. */
      hay: () => Boolean(S.guionesDeObjeto),
      /** Cuántos guiones de objeto hay horneados. */
      horneados: () => (S.guionesDeObjeto?.ids ?? []).length,
      /** Los objetos del personaje que están CORRIENDO su guion. */
      vivos: () => [...(S.objetosVivos ?? new Map()).entries()].map(([clave, o]) => ({
        clave, id: o.id, hay: o.hay,
        bucles: (o.guion?.repeticiones ?? []).map((r) => r.evento.nombre),
        pedidos: o.pedidos.length,
      })),
      /** Lo que un objeto le ha pedido al jugador, en orden. */
      pedidos: (id) => {
        for (const o of (S.objetosVivos ?? new Map()).values()) {
          if (o.id === id) return o.pedidos.map((x) => ({ ...x }));
        }
        return null;
      },
      /** Lo que los guiones de objeto piden y no sabemos hacer. */
      noSoportados: () => {
        const fuera = [];
        for (const o of (S.objetosVivos ?? new Map()).values()) {
          for (const x of o.noSoportados) fuera.push(`${o.id}: ${x.tipo} ${x.nombre}`);
        }
        return fuera;
      },
      /** Volver a mirar la mochila, que es la costura entre comprar y correr. */
      sincronizar: () => S.sincronizarObjetosVivos?.() ?? 0,
    },
    /**
     * EL 91: EL VENENO. Ponerle un efecto al jugador con UN BICHO DE VERDAD de
     * la manada como atacante, por la misma puerta que usa el juego
     * (`guionJugador.efectos.aplicar`, la que reciben las interacciones como
     * `aplicarEfecto`). El bicho se ve por `aplicadorDeBicho`, que es lo que
     * usará el guion de un bicho el día que corra (otra sesión). La sonda NO
     * resta vida ni llama al daño: eso lo hace el efecto por `golpear`.
     */
    veneno: {
      /** El índice en la manada del primer bicho VIVO con ese guion. */
      bicho: (script) => (S.bichos?.instancias ?? []).findIndex((i) => i.ficha?.script === script && !i.muerto && !i.dormido),
      aplicar(ruta, { duracion = "5", dano = "3", indice = 0 } = {}) {
        const i = S.bichos?.instancias?.[indice];
        if (!i || !S.guionJugador) return null;
        const ap = aplicadorDeBicho(i, { indice, razas: S.tablaDeRazas ?? null });
        const ef = S.guionJugador.efectos.aplicar(String(ruta), [String(duracion), ap.id, String(dano), "none"], { aplicador: ap });
        return { puesto: Boolean(ef), id: ef?.id ?? null, atacante: ap.nombre, asa: ap.id, t: S.guionJugador._ahora() };
      },
      activos: () => S.guionJugador?.efectos?.activos ?? [],
      /** Lo que ha llegado por la puerta del daño, ya resistido. */
      heridas: () => (S.guionJugador?.heridas ?? []).map((h) => ({ ...h })),
      banderas: () => (S.guionJugador?.banderas?.lista ?? []).map((b) => ({ ...b })),
      noSoportados: () => (S.guionJugador?.efectos?.lista ?? []).flatMap((e) =>
        [...e.guion.noSoportados, ...e.noSoportados].map((x) => `${e.ruta}: ${x.tipo} ${x.nombre}`)),
    },
    /**
     * EL 95: el fundido tras `Effects_GetFade` y el temblor de `effect
     * screenshake`. `aplicar` y `llamar` entran por las puertas del juego (la
     * de `applyeffect` y la de `callexternal`); `muestrear` LEE lo que el bucle
     * dejó en la cámara y en el `div` del velo, fotograma a fotograma, sin
     * recalcular nada (el 65).
     */
    pantalla95: {
      aplicar: (ruta, params = []) => {
        const ef = S.guionJugador?.efectos?.aplicar(String(ruta), params.map(String)) ?? null;
        return { puesto: Boolean(ef), t: S.guionJugador?._ahora?.() ?? null };
      },
      llamar: (evento, params = []) => Boolean(S.guionJugador?.llamar(String(evento), params.map(String))),
      /** Espera fotogramas hasta que `cond()` se cumpla, con tope en segundos de pared. */
      esperarA: (cond, tope = 20) => new Promise((listo) => {
        const t0 = performance.now();
        const uno = () => (cond() ? listo(true) : performance.now() - t0 > tope * 1000 ? listo(false) : requestAnimationFrame(uno));
        requestAnimationFrame(uno);
      }),
      reloj: () => S.reloj,
      temblores: () => (S.guionJugador?.temblores ?? []).map((x) => ({ ...x })),
      temblor: () => S.temblor ?? null,
      noSoportados: () => [
        ...(S.guionJugador?.guion?.noSoportados ?? []).map((x) => `player: ${x.tipo} ${x.nombre}`),
        ...(S.guionJugador?.efectos?.lista ?? []).flatMap((e) => e.guion.noSoportados.map((x) => `${e.ruta}: ${x.tipo} ${x.nombre}`)),
      ],
      /**
       * `segundos` DEL RELOJ DEL JUEGO de fotogramas: la cámara respecto al ojo,
       * su alabeo y el alfa del velo. En el reloj del juego y no en el de la
       * pared: el bucle topa el paso a 0,1 s, y con la máquina cargada un
       * segundo de pared son tres décimas de juego (medido: 3 fotogramas por
       * segundo). `t` es eso; `ms`, la pared, sólo para el informe.
       */
      muestrear: (segundos = 1) => new Promise((listo) => {
        const muestras = [];
        const velo = document.querySelector(".ms-velo");
        const t0 = performance.now(), r0 = S.reloj;
        const uno = () => {
          const c = S.camera, ojo = S.player.eye;
          const fondo = velo?.style?.background ?? "";
          // `rgba(…, a)` y TAMBIÉN `rgb(…)`: con alfa 1 el navegador normaliza
          // el `style` a `rgb(255, 0, 0)`, y un patrón que sólo casara `rgba`
          // leería «alfa 0» justo cuando el velo es opaco (pasó, con la rotura).
          const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(fondo);
          muestras.push({
            t: S.reloj - r0,
            ms: performance.now() - t0,
            d: [c.position.x - ojo[0], c.position.y - ojo[1], c.position.z - ojo[2]],
            alabeo: (c.rotation.z * 180) / Math.PI,
            rgb: m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null,
            alfa: m ? Math.round(Number(m[4] ?? 1) * 255) : 0,
            mezcla: velo?.style?.mixBlendMode || "normal",
            enSuelo: Boolean(S.player.grounded),
          });
          if (S.reloj - r0 < segundos && performance.now() - t0 < 60000) requestAnimationFrame(uno);
          else listo(muestras);
        };
        requestAnimationFrame(uno);
      }),
    },
    teclas: {
      mapa: () => ({ ...S.teclas.mapa }),
      nombre: (c) => nombreDeTecla(c),
      asignar: (a, c) => S.teclas.asignar(a, c),
      porDefecto: () => S.teclas.porDefecto(),
      pulsada: (a) => S.teclas.pulsada(a),
      hayBotonDeJuego: () => S.teclas.hayBotonDeJuego(),
    },
    /**
     * Cuantos adornos vivos hay, donde estan y DONDE TIENEN LOS HUESOS.
     *
     * Lo ultimo separa dos cosas que en una captura son la misma: «no se
     * mueve» y «no esta en pantalla». La suma de las posiciones de los huesos
     * es un numero que cambia si y solo si la animacion corre.
     */
    dondeAdornos() {
      return (S.adornosVivos?.instancias ?? []).map((i) => {
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
      S.relojLuz = t;
      return S.animarLuz(t);
    },
    /** En que variante esta cada cubo ahora mismo, para poder comprobarlo. */
    dondeLuz(t = S.relojLuz) {
      return (S.level.manifiesto.luz.cubos ?? []).map((c) => ({
        cubo: c.clave, estilos: c.estilos, de: c.variantes.length,
        variante: S.atlas.indiceEnT(c.clave, t),
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
      if (S.bichos) pasoDeBichos(S, dt, S.arnesDePaseo, { cazar: false });
      return S.bichos ? S.bichos.instancias.map((i) => [i.nodo.position.x, i.nodo.position.y, i.nodo.position.z]) : [];
    },
    /** Donde esta cada bicho ahora mismo, sin tocarlos. */
    dondeBichos() {
      return S.bichos ? S.bichos.instancias.map((i) => ({
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
      const i = n === null ? null : (S.bichos?.instancias ?? [])[n] ?? null;
      // La CINTURA la suma quien anda (ver `CINTURA` en manada.js), así que aquí
      // también: sin ella esto mediría a ras de suelo y diría «no hay hueco»
      // delante de cada adoquín, que no es lo que decide si un bicho avanza.
      return {
        suelo: S.arnesDePaseo.suelo(x, y, z, i),
        libre: S.arnesDePaseo.libre(x, y + CINTURA, z, 1, 0, 0.35, i),
      };
    },
    /** Le pone a UN bicho otra animacion, por indice. Para mirarlas. */
    ponAnimacion(i, nombre) {
      const b = S.bichos?.instancias?.[i];
      return b ? Boolean(b.pon(nombre)) : false;
    },
    bichos: S.bichos ? { n: S.bichos.n, modelos: S.bichos.modelos.size, triangulos: S.bichos.triangulos } : null,
    /**
     * LA CAZA, medida y no mirada.
     *
     * Lo que puede estar mal sin dar error: que nadie sea hostil, que el
     * hostil no te vea, que te vea y no se mueva, que llegue y no pegue, o que
     * te pegue el pueblo entero. Las cinco se ven igual de bien en una captura.
     */
    // ── EL 91: LA COSTURA ENTRE LA IA Y EL GUION DE CADA BICHO ──────────────
    //
    // Sólo lectura. Lo que se lee es lo que el GUION ha recibido y cerrado
    // (`GuionDeNpc.costuraCuenta`), no lo que la IA cree que ha mandado: un
    // contador del lado que envía no mide que haya llegado (el 67).
    costura: {
      /**
       * EL 94. Un sitio a `metros` del bicho `id` desde el que ÉL te ve: el
       * rayo desde ese punto, a la altura del ojo, hasta su ojo no choca con
       * nada antes de llegar a él, y hay suelo debajo a menos de 3 m. Prueba 16
       * rumbos y devuelve los pies `[x, y, z]` o `null`.
       *
       * Existe porque `salto93` te plantaba siempre 3 m hacia −X, y en la cueva
       * de las arañas eso es pared adentro: la araña te perdía de vista, la IA
       * no la volvía a fijar sin verte (ia.js:259-263) y pasaba 150 s paseando.
       * El rayo va DESDE el punto hacia el bicho y no al revés: empezar dentro
       * de su propio cilindro daría un choque en cero (el 69).
       */
      sitioALaVista(id, metros = 1.5) {
        const i = (S.bichos?.instancias ?? [])[id];
        if (!i || !S.world) return null;
        const u = S.level?.unitsPerMetre ?? 39.37;
        const ojoBicho = { x: i.donde[0], y: i.donde[1] + (i.ficha?.ia?.alto ?? 32) / u, z: i.donde[2] };
        const altoOjo = 64 / u;
        // El suelo es el MUNDO, no un bicho: sin este filtro el rayo tocaba el
        // techo del cilindro de la cría (20 u, 0,5 m) y la sonda te dejaba DE
        // PIE ENCIMA de ella — que corría 25 s sin morderte, y la grande no
        // saltaba. Se leyó como un posible fallo del juego antes de verlo.
        const deBicho = new Set((S.bichosSolidos?.puestos ?? []).map((q) => q.colisionador.handle));
        const soloMundo = (col) => !deBicho.has(col.handle);
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const x = i.donde[0] + Math.cos(a) * metros, z = i.donde[2] + Math.sin(a) * metros;
          const suelo = S.world.world.castRay(new RAPIER.Ray({ x, y: i.donde[1] + 1, z }, { x: 0, y: -1, z: 0 }),
            3, true, undefined, undefined, undefined, S.player?.body, soloMundo);
          if (!suelo) continue;
          const pies = [x, i.donde[1] + 1 - suelo.timeOfImpact, z];
          // El mismo piso, ±0,2 m: la sonda mide el salto, no los escalones.
          if (Math.abs(pies[1] - i.donde[1]) > 0.2) continue;
          const o = { x, y: pies[1] + altoOjo, z };
          const d = { x: ojoBicho.x - o.x, y: ojoBicho.y - o.y, z: ojoBicho.z - o.z };
          const L = Math.hypot(d.x, d.y, d.z);
          const g = S.world.world.castRay(new RAPIER.Ray(o, { x: d.x / L, y: d.y / L, z: d.z / L }),
            L, true, undefined, undefined, undefined, S.player?.body);
          // Libre si no choca o si lo que toca está ya pegado al bicho (su cilindro).
          if (!g || g.timeOfImpact > L - 0.7) return pies;
        }
        return null;
      },
      /** La de un bicho por su guion (`monsters/giantrat`) y orden, o `null`. */
      de(guion, n = 0) {
        const l = (S.bichos?.instancias ?? []).filter((i) => i.ficha?.script === guion);
        const i = l[n] ?? null;
        if (!i) return null;
        const g = S.guionesVivos?.get?.(i.id) ?? null;
        return {
          id: i.id, guion, vivo: !i.muerto, dormido: Boolean(i.dormido), nacimientos: i.nacimientos ?? 0,
          conGuion: Boolean(g), conCierre: Boolean(g?.cierre), retirado: Boolean(g?.retirado),
          recibidos: { ...(g?.costuraCuenta?.recibidos ?? {}) },
          cerrados: { ...(g?.costuraCuenta?.cerrados ?? {}) },
          absorbidos: { ...(g?.costuraCuenta?.absorbidos ?? {}) },
          // Lo que el guion del mod hace con lo que recibe: la variable que su
          // anti-atasco mueve en `game_dodamage` (base_anti_stuck.script:386-400).
          fallosSeguidos: g?.guion?.buscarVar?.("AS_MISS_COUNT")?.valor ?? null,
          // Los `game_dodamage` del rastro, con sus parámetros, los últimos.
          dodamage: (g?.guion?.rastro ?? []).filter((r) => r.evento === "game_dodamage").slice(-6).map((r) => [...r.params]),
          // EL 92: los `dodamage` que pidió su guion y los que llegaron sin
          // evento de animación que los recogiera.
          dano: g?.danoCuenta ? { pedidos: g.danoCuenta.pedidos, sinGancho: g.danoCuenta.sinGancho } : null,
          // EL 93: el cuerpo que lleva el guion (`Manada.cuerpoDe`), sus
          // `repeatdelay` y cuántas veces ha corrido cada evento del salto de
          // la araña (spider.script:93-192), leído del RASTRO del guion: esos
          // eventos corren por el reloj, no por la costura.
          fisica: i.fisica ? { ...i.fisica, vel: i.fisica.vel ? [...i.fisica.vel] : null, sigue: i.fisica.sigue ? { ...i.fisica.sigue } : null } : null,
          donde: i.donde ? [...i.donde] : null, anim: i.anim?.nombre ?? null,
          // EL 94: la generación (sube al rebobinar), si hay una de una sola
          // vez echando el candado, y si lleva destino puesto.
          gen: i.anim?.gen ?? null, candado: i.unaVezHasta != null, conDestino: Boolean(i.destino),
          repeticiones: g?.repeticiones ? JSON.parse(JSON.stringify(g.repeticiones)) : null,
          vars: Object.fromEntries(["IS_HUNTING", "CAN_HUNT", "CAN_ATTACK", "SPIDER_LATCHING", "SPIDER_LATCHED",
            "IS_ATTACKING", "HUNT_LASTTARGET", "SPIDER_LATCHATTACK",
            // EL 98: el salto del zombi enano y la embestida del jabalí.
            "ANIM_ATTACK", "ATTACK2_CHANCE", "BOAR_IS_CHARGING", "PUSH_VEL"]
            .map((v) => [v, g?.guion?.vars?.get?.(v) ?? null])),
          rastro: (g?.guion?.rastro ?? []).reduce((a, r) => {
            if (/^(frame_jump|frame_falloffend|spider_latch_\w+)$/.test(r.evento)) a[r.evento] = (a[r.evento] ?? 0) + 1;
            return a;
          }, {}),
          // EL 97: cuántas COPIAS de cada evento han corrido, para los que el
          // `[override]` deja en una (doc/OVERRIDE_97.md). Va aparte de `rastro`
          // a propósito: `salto93` pide `rastro` VACÍO a la cría que no salta,
          // y meter aquí `bite1` lo puso rojo con el juego bien.
          corridos: (g?.guion?.rastro ?? []).reduce((a, r) => {
            if (/^(game_parry|bite1|frame_bite1|attack_1)$/.test(r.evento)) a[r.evento] = (a[r.evento] ?? 0) + 1;
            return a;
          }, {}),
        };
      },
      /**
       * EL 94: CUÁNTO AVANZA EL RELOJ DEL DIBUJO de un bicho (y de uno de
       * referencia a ritmo 1) durante `ms` de reloj de pared, leído de la
       * acción del mezclador de Three fotograma a fotograma —el clip que se
       * está viendo—, no del `timeScale`. Una vuelta de un clip de bucle se
       * suma; un cambio de acción (otra animación) no se cuenta.
       */
      async relojDeDibujo(id, ms = 1500) {
        const l = S.bichos?.instancias ?? [];
        const i = l.find((x) => x.id === id);
        const ref = l.find((x) => x !== i && !x.dormido && !x.muerto && x.mezclador && x.actual?.seq?.bucle && (x.fisica?.ritmoAnim ?? 1) === 1);
        if (!i?.mezclador || !ref) return null;
        const leer = (x) => { const a = x.actual?.clip ? x.mezclador.existingAction(x.actual.clip) : null; return a ? { a, t: a.time, d: x.actual.clip.duration } : null; };
        const cuenta = (x) => ({ x, ant: leer(x), suma: 0, contado: 0, cambios: 0 });
        const c = [cuenta(i), cuenta(ref)];
        const t0 = performance.now();
        let antes = t0;
        while (performance.now() - t0 < ms) {
          await new Promise((r) => requestAnimationFrame(r));
          const ya = performance.now(), dReal = (ya - antes) / 1000;
          antes = ya;
          for (const k of c) {
            const ahora = leer(k.x);
            if (ahora && k.ant && ahora.a === k.ant.a) { let d = ahora.t - k.ant.t; if (d < 0) d += ahora.d; k.suma += d; k.contado += dReal; } else k.cambios++;
            k.ant = ahora;
          }
        }
        const real = (performance.now() - t0) / 1000;
        return {
          real, ritmo: i.fisica?.ritmoAnim ?? 1, anim: i.anim?.nombre, avance: c[0].suma, contado: c[0].contado, cambios: c[0].cambios,
          ref: { guion: ref.ficha?.script, anim: ref.anim?.nombre, avance: c[1].suma, contado: c[1].contado, cambios: c[1].cambios },
        };
      },
      /**
       * EL 93: la vida del personaje a tope. El veneno del salto son 5 por
       * segundo durante 4 (spider.script:75-76) y un personaje recién hecho
       * tiene menos de 20: sin esto muere agarrado, `spider_latch_think` ve
       * al objetivo muerto y la araña se suelta antes de tiempo (:161). Lo
       * que se mide del veneno se lee de las HERIDAS, no de la vida.
       */
      curar() {
        if (!S.sesion?.personaje) return null;
        S.sesion.personaje.vida = S.sesion.limites?.vidaMax ?? S.sesion.personaje.vida;
        return S.sesion.personaje.vida;
      },
      /** Lo de toda la partida: nacidos, renacidos y lo que no llegó. */
      partida() {
        const m = S.bichos?.manada ?? null;
        return {
          ...(S.costuraDeBichos ?? {}),
          enchufada: Boolean(m?.oyente),
          sinOyente: m?.costuraSinOyente ?? null,
          fallos: m?.costuraFallos ?? null,
          // EL 92: los golpes que pone el guion desde el evento de animación
          // (`Manada.golpesDelGuion`): cuántos ataques le dejó la IA y qué
          // hizo cada `dodamage`.
          golpesDelGuion: m?.golpesDelGuion ? { ...m.golpesDelGuion } : null,
        };
      },
    },
    ia: {
      /**
       * QUIEN ESTA EN EL MUNDO Y QUIEN NO, de solo lectura.
       *
       * 38 de los 69 bichos de Gate City son la ficha de un `msarea_monsterspawn`
       * y no estan al entrar (src/play/aparecer.js). Hace falta poder verlo desde
       * fuera: un bicho dormido tiene la posicion de su ficha, asi que en una
       * captura y en `censo()` se ve igual que uno vivo — y se atraviesa.
       */
      apariciones() {
        const l = S.bichos?.instancias ?? [];
        return {
          de: l.length,
          enElMundo: l.filter((i) => !i.dormido).length,
          dormidos: l.filter((i) => i.dormido).length,
          plantillas: l.filter((i) => i.plantilla).length,
          conCilindro: S.bichosSolidos?.n ?? 0,
        };
      },
      /** La ficha de aparicion de uno, por indice de bicho. */
      fichaDeAparicion(n) { return S.bichos?.aparecedor?.fichaDe(n) ?? null; },

      // ── EL BLOQUE DEL 80: UN BICHO CONCRETO, SU CUERPO Y SU ANIMACION ─────
      //
      // Las tres sondas de combate del proyecto miden todas contra goblins y
      // zombis, y los dos fallos del 80 viven en lo pequeno: una rata de 32
      // unidades de alto. Esto es lo que hace falta para ponerle un control
      // delante a UNA rata y no al primer hostil que salga en la lista.

      /**
       * UNO POR SU GUION, que es lo unico que no cambia.
       *
       * Por indice no vale: el censo se reordena con las apariciones. Por
       * nombre tampoco —«Giant Rat» hay varias— y ademas el 79 acaba de
       * ensenar que un nombre puede resolver a quien no existia.
       */
      _buscar(guion, n = 0) {
        const l = (S.bichos?.instancias ?? [])
          .filter((i) => String(i.ficha?.script ?? "").includes(guion));
        return l[n] ?? null;
      },

      /**
       * LA FICHA COMPLETA DE UNO: donde esta, que animacion lleva y si choca.
       *
       * `choca` NO se lee de nuestra contabilidad: se le pregunta a un rayo. Es
       * la leccion del 69 —`choca === false` se quedo verde con la fisica
       * parando al jugador— y ademas es lo unico que distingue «tiene cilindro
       * apuntado» de «hay algo solido ahi».
       */
      bicho(guion, n = 0) {
        const i = this._buscar(guion, n);
        if (!i) return null;
        const u = S.level?.unitsPerMetre ?? 39.37;
        const puesto = (S.bichosSolidos?.puestos ?? []).find((q) => q.instancia === i);
        return {
          guion: i.ficha.script, nombre: i.ficha.nombre, clave: i.ficha.clave,
          donde: [...i.donde],
          // El sitio y el tamano en UNIDADES, que es como los escribe el mod.
          unidades: i.donde.map((v) => v * u),
          dormido: Boolean(i.dormido), muerto: Boolean(i.muerto),
          vida: i.vida, vidaMaxima: i.vidaMaxima,
          // Los dos tamanos que el 80 encontro que NO coinciden: el del guion
          // (`setsize`, que es el casco del motor) y el de la caja medida de la
          // malla, que es de donde sale el colisionador.
          delGuion: { ancho: i.ficha.ia?.ancho ?? i.ficha.ancho ?? null, alto: i.ficha.ia?.alto ?? i.ficha.alto ?? null },
          cajaMedida: i.caja ?? null,
          cilindro: puesto ? { alto: puesto.alto * u, radio: puesto.radio * u } : null,
          conCilindro: Boolean(i.conCilindro),
          anim: { nombre: i.anim?.nombre ?? null, gen: i.anim?.gen ?? 0, unaVez: Boolean(i.anim?.unaVez) },
          sigue: { ...(i.sigue ?? {}) },
          intencion: i.intencion?.accion ?? null,
          rango: i.intencion?.rango ?? null,
          alcanceDeGolpe: i.ficha.ia?.alcanceDeGolpe ?? null,
          // EL 95: las DOS huidas por separado. La de la IA (`npcatk_flee`,
          // `Cazador.fuga`) y el destino que pone el GUION (`setmovedest …
          // flee`, `i.mandado`): un aldeano sin `HAS_AI` sólo tiene la segunda.
          id: i.id,
          tieneIA: i.ficha.ia?.tieneIA ?? null,
          huyendoPorIA: Boolean(i.cazador?.huyendo),
          mandado: i.mandado ? { proximidad: i.mandado.proximidad, dueño: i.mandado.dueño ?? null } : null,
          objetivo: i.cazador?.objetivo ?? null,
          encogidas: i.reaccion?.encogidas ?? 0,
        };
      },

      /**
       * EL 94: LLEVAR A UNO A UN SITIO (metros de escena, sus pies), para
       * montar una escena que el mapa no trae de salida: en Gate City el
       * aldeano más cercano al guardia está a 1 179 unidades, y el guardia sólo
       * oye a quien pega a menos de 1 024 (gatecity/guard.script:15, :110).
       * Mueve el SITIO y nada más: lo que se mide después corre por el juego.
       */
      llevar(guion, donde, n = 0) {
        const i = this._buscar(guion, n);
        if (!i || !Array.isArray(donde)) return null;
        i.donde = [donde[0], donde[1], donde[2]];
        i.destino = null;
        i.nodo?.position?.set?.(donde[0], donde[1], donde[2]);
        S.bichosSolidos?.seguir?.();
        return [...i.donde];
      },

      /**
       * ¿HAY ALGO SOLIDO DONDE ESTA ESE BICHO? Se lo contesta un rayo.
       *
       * Y el rayo va HORIZONTAL y de lado a lado, empezando FUERA: un
       * colisionador de Rapier se cruza, no se habita — en el 69, un rayo que
       * empezaba dentro de un trimesh no cortaba ni un triangulo y daba cero
       * con la caja puesta. Aqui es un cilindro y si tiene interior, pero la
       * regla se respeta igual para que el instrumento sirva para los dos.
       *
       * `aQue` es la altura sobre sus pies, en unidades: hace falta poder
       * apuntar a la mitad de una rata de 32 y no al aire que tiene encima.
       */
      hayCuerpoEn(guion, { n = 0, aQue = 16, desdeCuanto = 100 } = {}) {
        const i = this._buscar(guion, n);
        if (!i || !S.world) return null;
        const u = S.level?.unitsPerMetre ?? 39.37;
        const y = i.donde[1] + aQue / u;
        const d = desdeCuanto / u;
        const o = { x: i.donde[0] - d, y, z: i.donde[2] };
        const g = S.world.world.castRay(
          new RAPIER.Ray(o, { x: 1, y: 0, z: 0 }), d * 2, true,
          undefined, undefined, undefined, S.player?.body);
        if (!g) return { toca: false, aQue, deQuien: null };
        const mano = g.collider?.handle;
        const suyo = (S.bichosSolidos?.puestos ?? []).find((q) => q.colisionador.handle === mano);
        return {
          toca: true,
          aQue,
          // A CUANTAS UNIDADES de su eje esta lo que se ha tocado: con esto se
          // ve si el rayo choco con el bicho o con la pared de detras.
          aQueDistancia: (g.timeOfImpact - d) * u,
          // Y DE QUIEN es: «toca algo» no es «toca al bicho». Sin esto, una
          // pared al lado da un verde que no mide el cilindro de nadie.
          deQuien: suyo ? (suyo.instancia === i ? "el mismo" : "otro bicho") : "el mundo",
        };
      },

      /**
       * ¿HAY MUNDO DE VERDAD A TIRO, Y HACIA DONDE? — el 80.
       *
       * Existe porque el control negativo del `hitwall` nacio rojo con el
       * trabajo bien hecho, DOS VECES, y las dos por el instrumento:
       *
       *   1. girando sobre el sitio en dieciseis rumbos HORIZONTALES no habia
       *      pared a 60 unidades en ninguno. Eso medía el tamaño de la sala.
       *   2. mirando al suelo tampoco llega: el ojo esta a 64 unidades y la
       *      espada alcanza 60, asi que **en vertical la hoja no toca el piso**.
       *      No es un fallo, es la geometria del motor.
       *
       * Asi que se busca: se tiran rayos en muchas direcciones y se devuelve la
       * primera que toca MUNDO —ni un bicho ni un rompible— dentro del alcance.
       * Quien quiera el control, apunta ahi y dice a que distancia estaba.
       */
      mundoATiro(alcanceU = 60, { cuantos = 24 } = {}) {
        if (!S.world || !S.player) return null;
        const u = S.level?.unitsPerMetre ?? 39.37;
        const L = alcanceU / u;
        const o0 = S.player.eye;
        const o = { x: o0[0], y: o0[1], z: o0[2] };
        const manos = new Set((S.bichosSolidos?.puestos ?? []).map((q) => q.colisionador.handle));
        const probados = [];
        // Se barre en rumbo Y en inclinacion: la pared puede estar arriba (un
        // techo bajo) o abajo, y con un solo plano ya se fallo una vez.
        for (let k = 0; k < cuantos; k++) {
          const a = (k / cuantos) * Math.PI * 2;
          for (const inc of [0, -0.4, 0.4, -0.8]) {
            const d = {
              x: Math.cos(a) * Math.cos(inc), y: Math.sin(inc), z: Math.sin(a) * Math.cos(inc),
            };
            const g = S.world.world.castRay(new RAPIER.Ray(o, d), L, true,
              undefined, undefined, undefined, S.player.body);
            if (!g) continue;
            if (manos.has(g.collider?.handle)) continue;   // un bicho no es la pared
            probados.push({ a, inc, aQue: g.timeOfImpact * u });
            return {
              hacia: [o.x + d.x * L, o.y + d.y * L, o.z + d.z * L],
              aQue: g.timeOfImpact * u, rumbos: k + 1,
            };
          }
        }
        return null;
      },

      /**
       * GRABAR LA ANIMACION DE UNO, fotograma a fotograma y DENTRO de la pagina.
       *
       * Desde fuera no se puede: un `evaluate` no mide decimas (el 75), y aqui
       * lo que hay que medir son tramos de 120 ms contra tramos de 1000. Se
       * muestrea en `requestAnimationFrame`, que es el mismo reloj con el que el
       * juego mueve la animacion.
       *
       * Devuelve TRAMOS y no muestras: «la animacion de ataque estuvo puesta
       * alguna vez» es cierto con el fallo y sin el. Lo que los separa es
       * cuanto duro cada vez.
       */
      grabarAnimacion(guion, { n = 0, segundos = 8 } = {}) {
        const i = this._buscar(guion, n);
        if (!i) return false;
        const cinta = [];
        const t0 = performance.now();
        S._cinta80 = { guion, n, cinta, hasta: t0 + segundos * 1000 };
        const paso = () => {
          const c = S._cinta80;
          if (!c || c.cinta !== cinta) return;          // otra grabacion la releva
          const ahora = performance.now();
          const a = i.anim ?? {};
          const ultimo = cinta[cinta.length - 1];
          if (ultimo && ultimo.nombre === a.nombre && ultimo.gen === a.gen) ultimo.hasta = ahora;
          else cinta.push({ nombre: a.nombre ?? null, gen: a.gen ?? 0, desde: ahora, hasta: ahora });
          if (ahora < c.hasta) requestAnimationFrame(paso);
          else c.acabada = true;
        };
        requestAnimationFrame(paso);
        return true;
      },

      /**
       * LA CINTA, en tramos con su duracion en segundos.
       *
       * El ULTIMO tramo se marca `alBorde`: la ventana de grabacion lo corta por
       * la mitad y medirlo es medir mi reloj, no el juego. Esto ya salio en la
       * prueba de Node del 80 con un 0,83 que no era un ataque cortado.
       */
      cinta() {
        const c = S._cinta80;
        if (!c) return null;
        return {
          guion: c.guion, acabada: Boolean(c.acabada),
          tramos: c.cinta.map((t, k) => ({
            nombre: t.nombre, gen: t.gen,
            dura: (t.hasta - t.desde) / 1000,
            alBorde: k === c.cinta.length - 1,
          })),
        };
      },
      /** El censo: quien es hostil segun la tabla de razas. */
      censo() {
        const l = (S.bichos?.instancias ?? []).map((i) => ({
          nombre: i.ficha.nombre, raza: i.ficha.ia?.raza ?? null,
          hostil: Boolean(i.ficha.hostil), relacion: i.ficha.relacion,
          // Un bicho DORMIDO no caza: está fuera del área activa. Quien mida
          // «¿reacciona solo?» tiene que poder descartarlo, o mide el sueño.
          dormido: Boolean(i.dormido),
          escena: [i.nodo.position.x, i.nodo.position.y, i.nodo.position.z],
          alcanceDeGolpe: i.ficha.ia?.alcanceDeGolpe ?? null,
        }));
        return { total: l.length, hostiles: l.filter((x) => x.hostil).length, lista: l };
      },
      /** El estado de uno: a quien persigue, que quiere hacer y a que distancia. */
      estado(n = 0) {
        const hostiles = (S.bichos?.instancias ?? []).filter((i) => i.ficha.hostil);
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
        return (S.bichos?.instancias ?? [])
          .filter((i) => i.cazador?.objetivo === "jugador")
          .map((i) => i.ficha.nombre);
      },
      /** Cuantos golpes ha encajado el jugador. */
      get golpes() { return S.golpesRecibidos; },
      /** Lleva al jugador al lado del hostil `n`, a `d` metros y en rumbo `a`. */
      irA(n = 0, d = 2, a = 0) {
        const hostiles = (S.bichos?.instancias ?? []).filter((i) => i.ficha.hostil);
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
        const i = (S.bichos?.instancias ?? []).filter((x) => x.ficha.hostil)[n];
        return i ? S.arnesDePaseo.veA(i, "jugador") : null;
      },
      /** Un solo paso, contando lo que pasa dentro. Para depurar. */
      paso(n = 0) {
        const i = (S.bichos?.instancias ?? []).filter((x) => x.ficha.hostil)[n];
        if (!i) return null;
        const a = [i.nodo.position.x, i.nodo.position.z];
        pasoDeBichos(S, 1 / 60, S.arnesDePaseo);
        return {
          movido: Math.hypot(i.nodo.position.x - a[0], i.nodo.position.z - a[1]),
          frenado: i.frenado ?? null, destino: i.destino ?? null, cerca: i.cerca ?? null,
          intencion: i.intencion?.accion ?? null,
        };
      },
      /** Corre la caza `s` segundos sin depender del fotograma. */
      correr(s = 3) {
        // EL 92: y con los RELOJES de la manada, como `avanzar` aquí abajo y
        // como el bucle de `main.js` (`bichos.animar` -> `manada.relojes`).
        // Sin ellos el reloj de la manada se paraba durante `correr`: la
        // animación de atacar no llegaba nunca al fotograma del mordisco, y
        // desde el 92 el daño sale de ahí. Lo destapó `sondas/mordisco82.mjs`
        // («0 golpes en 12 s» con la rata pegada) — el paso de la sonda no era
        // el paso del jugador, que es justo lo que pide `pasoDeBichos`.
        for (let t = 0; t < s; t += 1 / 60) { S.bichos?.animar(1 / 60); pasoDeBichos(S, 1 / 60, S.arnesDePaseo); }
        S.bichosSolidos?.seguir();
        return this.estado(0);
      },
      /**
       * SI LA IA ESTÁ ENCENDIDA. Lo que faltaba del 17 al 20, y la razón por
       * la que hacía falta una sonda que lo mirara: un interruptor en `false`
       * se ve exactamente igual que una IA que no funciona.
       */
      get encendida() { return S.paseando; },
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
        await S.empunar(id);
        const a = S.brazo?.ataques?.[0] ?? null;
        return {
          id: S.brazo?.arma?.id ?? null,
          esDeTiro: Boolean(S.brazo?.esDeTiro),
          ataques: S.brazo?.ataques?.length ?? 0,
          sostener: a?.sostener ?? null,
          cono: a?.cono ?? null,
          apunta: a?.apunta ?? null,
          fuerza: a?.alcance ?? null,
          proyectil: a?.proyectil ?? null,
          secuencias: [...(S.armaEnMano?.clips?.keys() ?? [])],
          conjunto: S.flechasPuestas?.cuantas ?? 0,
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
        for (let t = 0; t < 4 && S.brazo && S.brazo.fase !== "quieto"; t += DT) S.pasoDelBrazo(DT, false);
        const habia = S.ultimaFlecha;
        const enCarne = S.flechazos;
        const mirando = new THREE.Vector3(0, 0, -1).applyEuler(S.camera.rotation);
        let cuando = null;
        for (let t = 0; t < segundos; t += DT) {
          const e = S.pasoDelBrazo(DT, true);
          if (e?.tira) cuando = t;
        }
        for (let t = 0; t < espera && cuando === null; t += DT) {
          const e = S.pasoDelBrazo(DT, false);
          if (e?.tira) cuando = segundos + t;
        }
        // Por IDENTIDAD y no por la longitud de la lista: ver `ultimaFlecha`.
        const f = S.ultimaFlecha !== habia ? S.ultimaFlecha : null;
        // Y se la deja volar por el mismo sitio que el bucle.
        let vuelo = 0;
        for (let t = 0; t < espera && f && f.volando; t += DT) { S.pasoDeFlechas(DT); vuelo += DT; }
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
        const der = new THREE.Vector3(1, 0, 0).applyEuler(S.camera.rotation);
        const arr = new THREE.Vector3(0, 1, 0).applyEuler(S.camera.rotation);
        const enGrados = (x) => (Math.asin(Math.min(1, Math.max(-1, x))) * 180) / Math.PI;
        return {
          disparo: cuando,
          // La del DISPARO, no la del fotograma siguiente: la gravedad entra
          // antes de mover y se come diez unidades por segundo.
          velocidad: f?.velocidadInicial ?? null,
          acerto: S.flechazos > enCarne,
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
          caida: f ? f.pos[1] - (S.player.eye[1] * S.U) : null,
          // La caída DESDE LA MANO, que es la única que se puede comparar con
          // la física: `caida` la mide desde el ojo y la flecha no sale del
          // ojo, así que se lleva puesto el desnivel de la mano —unas 17
          // unidades— y eso no es gravedad. Con el desnivel dentro, la caída
          // medida salía el triple de la libre y ningún control podía
          // comprobarla sin un umbral atado a una pared (59).
          caidaDesdeLaMano: f ? f.pos[1] - f.salida[1] : null,
          dano: f?.dano ?? null,
          enVuelo: S.flechasEnVuelo.length,
          puestas: S.flechasPuestas?.puestas ?? 0,
          tiros: S.tiros,
          flechazos: S.flechazos,
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
        for (let t = 0; t < 4 && S.brazo && S.brazo.fase !== "quieto"; t += DT) S.pasoDelBrazo(DT, false);
        const antes = S.flechasEnVuelo.length;
        for (let t = 0; t < segundos; t += DT) S.pasoDelBrazo(DT, true);
        return {
          fase: S.brazo?.fase ?? null,
          tensando: S.brazo?.fase === FASE.TENSANDO,
          tensado: S.brazo?.tensado ?? 0,
          atacando: Boolean(S.brazo?.atacando),
          salieron: S.flechasEnVuelo.length - antes,
          secuencia: S.armaEnMano?.actual?.nombre ?? null,
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
      /** EL 97: lo que hicieron los guiones de los proyectiles: saetas, lanzas, Fénix. */
      deGuion() {
        const d = S.deGuionDelArco;
        return d ? JSON.parse(JSON.stringify(d)) : null;
      },
      // ── EL 98: ¿SE VE LA FLECHA EN VUELO? ────────────────────────────────
      //
      // El 97 encontró que ninguna flecha se dibujaba volando desde antes del 39
      // (el `scene.add` de `empunar`), y que ninguna sonda lo miraba: `puestas`
      // cuenta nodos OCUPADOS del conjunto, y un nodo ocupado fuera de la escena
      // es el `<canvas>` de 300x150 del 38 —existe y no se dibuja—. Estas tres
      // dejan a la sonda parar una flecha en el aire y fotografiarla.
      /**
       * Tensa y suelta (por `pasoDelBrazo`, como `tirar`), deja volar la flecha
       * por `pasoDeFlechas` hasta que lleve `unidades` recorridas, y la DETIENE
       * en el aire: gravedad 0 y una velocidad de una milésima en su rumbo, para
       * que el bucle la siga moviendo y orientando —es él quien coloca el nodo—
       * sin que se vaya. Sigue `volando`.
       */
      soltarYDetener(segundos = 1.3, unidades = 120) {
        const DT = 1 / 60;
        for (let t = 0; t < 4 && S.brazo && S.brazo.fase !== "quieto"; t += DT) S.pasoDelBrazo(DT, false);
        const habia = S.ultimaFlecha;
        for (let t = 0; t < segundos; t += DT) S.pasoDelBrazo(DT, true);
        for (let t = 0; t < 4 && S.ultimaFlecha === habia; t += DT) S.pasoDelBrazo(DT, false);
        const f = S.ultimaFlecha !== habia ? S.ultimaFlecha : null;
        if (!f) return null;
        for (let t = 0; t < 4 && f.volando && f.recorrido < unidades; t += DT) S.pasoDeFlechas(DT);
        if (f.volando) {
          const r = f.rapidez || 1;
          f.gravedad = 0;
          f.vel = f.vel.map((v) => (v / r) * 1e-3);
        }
        const e = S.flechasEnVuelo.find((x) => x.flecha === f) ?? null;
        S.__flechaDetenida = e;
        const U = S.U ?? S.level?.unitsPerMetre ?? 39.37;
        return {
          id: f.ficha?.id ?? null, volando: f.volando, recorrido: f.recorrido,
          pos: f.pos.map((x) => x / U), conPieza: Boolean(e?.pieza),
        };
      },
      /**
       * El rectángulo de la pantalla de la flecha detenida, vértice a vértice
       * (como `red.rectanguloArmaAjena`), y si su nodo cuelga de la escena que
       * dibuja el bucle (`renderer.render(escena, camera)`). `null` si no hay.
       */
      rectanguloFlecha() {
        const p = S.__flechaDetenida?.pieza;
        if (!p) return null;
        let m = null;
        p.nodo.traverse((o) => { if (!m && o.isSkinnedMesh) m = o; });
        if (!m) return null;
        let raiz = p.nodo;
        while (raiz.parent) raiz = raiz.parent;
        p.nodo.updateMatrixWorld(true);
        m.skeleton?.update();
        S.camera.updateMatrixWorld(true);
        const lienzo = S.renderer?.domElement ?? document.querySelector("canvas");
        const r = lienzo.getBoundingClientRect();
        const v = new THREE.Vector3();
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
        for (let i = 0; i < m.geometry.attributes.position.count; i++) {
          m.getVertexPosition(i, v);
          v.applyMatrix4(m.matrixWorld).applyMatrix4(S.camera.matrixWorldInverse);
          if (v.z > -(S.camera.near ?? 0.01)) continue;
          v.applyMatrix4(S.camera.projectionMatrix);
          if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
          const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          n++;
        }
        return {
          x0, y0, x1, y1, vertices: n, ancho: r.width, alto: r.height,
          visible: p.nodo.visible, enLaEscena: raiz === S.escena,
        };
      },
      /** Esconder/enseñar SÓLO el nodo de la flecha detenida, para la foto sin ella. */
      esconderFlecha(si = true) {
        const p = S.__flechaDetenida?.pieza;
        if (!p) return null;
        p.nodo.visible = !si;
        return p.nodo.visible;
      },
      /**
       * EL GRAFO QUE SE DIBUJA DE VERDAD: cuántas veces llama Three a
       * `onBeforeRender` de la malla de la flecha detenida en `cuadros`
       * fotogramas del bucle. Three sólo lo llama para lo que mete en la lista de
       * dibujo —colgado de la escena que se pinta y visible—, o sea que una malla
       * fuera de la escena da 0 por bien que esté colocada. (La malla lleva
       * `frustumCulled = false`, src/render/flechas.js:72: esto no dice si cae en
       * el cuadro; eso lo dicen los píxeles.)
       */
      dibujosDeFlecha(cuadros = 3) {
        const p = S.__flechaDetenida?.pieza;
        if (!p) return Promise.resolve(null);
        let m = null;
        p.nodo.traverse((o) => { if (!m && o.isSkinnedMesh) m = o; });
        if (!m) return Promise.resolve(null);
        let n = 0;
        const antes = m.onBeforeRender;
        m.onBeforeRender = (...a) => { n++; return antes.apply(m, a); };
        return new Promise((listo) => {
          let k = 0;
          const otro = () => { if (++k > cuadros) { m.onBeforeRender = antes; listo(n); } else requestAnimationFrame(otro); };
          requestAnimationFrame(otro);
        });
      },
      /**
       * EL 97: ¿tapa el MUNDO entre dos puntos en metros de escena? La traza de
       * `DoDamage` (`trazaLibre`, ignora a los bichos), para que la sonda no mida
       * una pared cuando busca un bicho a tiro (el 80).
       */
      libre(a, b) {
        if (!S.trazaLibre) return null;
        const U = S.level.unitsPerMetre;
        return S.trazaLibre([a[0] * U, a[1] * U, a[2] * U], [b[0] * U, b[1] * U, b[2] * U]);
      },
      /** Y los deja como el motor. */
      restaurar() {
        Object.assign(AJUSTES, COMO_EL_MOTOR);
        return { ...AJUSTES };
      },
      /** El estado del brazo, para ver que tensar es un estado y no un instante. */
      estado() {
        return {
          fase: S.brazo?.fase ?? null,
          tensando: S.brazo?.fase === FASE.TENSANDO,
          tensado: S.brazo?.tensado ?? 0,
          atacando: Boolean(S.brazo?.atacando),
          sueltaPendiente: Boolean(S.brazo?.sueltaPendiente),
          enVuelo: S.flechasEnVuelo.length,
          secuencia: S.armaEnMano?.actual?.nombre ?? null,
        };
      },
      /** La munición que el motor le daría ahora mismo, y si la gasta. */
      municion() {
        const a = S.brazo?.ataques?.[0] ?? null;
        const m = S.municion(a ?? { proyectil: "arrow" });
        return {
          id: m.ficha?.id ?? null,
          nombre: m.ficha?.nombre ?? null,
          dano: m.ficha?.dano ?? null,
          gravedad: m.ficha?.gravedad ?? null,
          gasta: Boolean(m.gasta),
          enLaMochila: (S.sesion?.personaje?.objetos ?? [])
            .filter((o) => S.catalogoDeFlechas?.has(o.id)).map((o) => `${o.id}×${o.n}`),
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
        const l = (S.bichos?.instancias ?? []).map((i) => ({
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
        for (const i of S.bichos?.instancias ?? []) {
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
        for (const i of S.bichos?.instancias ?? []) {
          if (vistos.has(i.ficha.clave)) continue;
          vistos.set(i.ficha.clave, {
            nombre: i.ficha.nombre,
            dice: i.ficha.ia?.experiencia ?? 0,
            vale: S.loQueVale(i),
            seAjusta: Boolean(i.ficha.ia?.seAjusta),
            esJefe: Boolean(i.ficha.ia?.esJefe),
          });
        }
        const l = [...vistos.values()];
        return {
          central: PARTIDA.central,
          jugadores: jugadoresActivos(S.partida(), PARTIDA),
          vidaTotal: vidaTotal(S.partida(), PARTIDA),
          nivelDeAjuste: nivelDeAjuste(vidaTotal(S.partida(), PARTIDA)),
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
        const antes = (S.bichos?.instancias ?? []).map((i) => [i.nodo.position.x, i.nodo.position.z]);
        const rein0 = (S.bichos?.instancias ?? []).map((i) => i.sigue?.reinicios ?? 0);
        const rep0 = (S.bichos?.instancias ?? []).map((i) => i.sigue?.veces ?? 0);
        const act0 = (S.bichos?.instancias ?? []).map((i) => i.sigue?.cambiosDeActividad ?? 0);
        const DT = 1 / 60;
        let t0 = S.reloj;
        for (let t = 0; t < s; t += DT) {
          t0 += DT;
          pasoDeBichos(S, DT, { ...S.arnesDePaseo, ahora: t0 });
          S.bichos?.animar(DT);
        }
        S.bichosSolidos?.seguir();
        const l = (S.bichos?.instancias ?? []).map((i, n) => ({
          nombre: i.ficha.nombre,
          pasea: Boolean(i.vagabundo?.pasea),
          movido: Math.hypot(i.nodo.position.x - antes[n][0], i.nodo.position.z - antes[n][1]),
          reinicios: (i.sigue?.reinicios ?? 0) - rein0[n],
          repeticiones: (i.sigue?.veces ?? 0) - rep0[n],
          cambiosDeActividad: (i.sigue?.cambiosDeActividad ?? 0) - act0[n],
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
          // Se cuentan los saltos andar↔parado y NO todos los rebobinados: desde
          // que la pose de reposo vuelve a sortearse de verdad (59), un bicho
          // quieto acumula `reinicios` legítimos y esta cuenta lo marcaba como
          // temblón. El temblor es cambiar de ACTIVIDAD sin moverse.
          temblando: l.filter((x) => x.pasea && x.movido < 0.05 && x.cambiosDeActividad > 4).length,
          // El positivo de la cuenta de arriba: cuántos cambian de actividad
          // en absoluto. Sin esto, «0 temblando» estaría verde también con el
          // contador roto y sin incrementarse nunca.
          conCambioDeActividad: l.filter((x) => x.cambiosDeActividad > 0).length,
          lista: l,
        };
      },
      /** Corre SÓLO el paseo `s` segundos y dice cuánto se ha movido cada uno. */
      pasear(s = 10) {
        const antes = (S.bichos?.instancias ?? []).map((i) => [i.nodo.position.x, i.nodo.position.z]);
        const DT = 1 / 60;
        // Se mira CADA fotograma y no sólo al final. El plazo del vagabundo es
        // de 7 s y la espera de 2, y los 69 arrancan con el mismo reloj: en el
        // segundo 10 exacto están todos en el hueco de los 2 s, o sea todos
        // quietos. Una foto ahí dice «ninguno anda con la animación de andar»
        // y es verdad en ese instante y mentira en el resto.
        const vioAndar = (S.bichos?.instancias ?? []).map(() => false);
        // EL 92 (pieza D): con qué ESTADO y qué secuencia se movió cada uno en
        // cada fotograma, para poder decir quiénes son los «andandoMal» y no
        // sólo cuántos.
        const comoSeMovio = (S.bichos?.instancias ?? []).map(() => new Map());
        for (let t = 0; t < s; t += DT) {
          const pre = (S.bichos?.instancias ?? []).map((i) => [i.nodo.position.x, i.nodo.position.z]);
          pasoDeBichos(S, DT, S.arnesDePaseo, { cazar: false });
          (S.bichos?.instancias ?? []).forEach((i, n) => {
            if (i.andando === "pasea" && i.ficha.andando &&
                i.nombreActual === String(i.ficha.andando).toLowerCase()) vioAndar[n] = true;
            if (Math.hypot(i.nodo.position.x - pre[n][0], i.nodo.position.z - pre[n][1]) > 1e-4) {
              const k = `${i.andando ?? "-"}:${i.nombreActual ?? "-"}`;
              comoSeMovio[n].set(k, (comoSeMovio[n].get(k) ?? 0) + 1);
            }
          });
        }
        S.bichosSolidos?.seguir();
        const l = (S.bichos?.instancias ?? []).map((i, n) => ({
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
          declara: i.ficha.andando ?? null,
          guion: i.ficha.script ?? null,
          // «estado:secuencia» -> fotogramas en que se movió así.
          comoSeMovio: Object.fromEntries(comoSeMovio[n]),
          // Y si al acabar seguía el candado de `CAnimOnce` puesto (el 80):
          // es lo que rechaza la de andar mientras dura una de una vez.
          candado: i.unaVezHasta !== null && i.unaVezHasta !== undefined,
          deBucle: i.actual?.seq?.bucle ?? null,
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
      /**
       * LAS POSES QUE PASA **CADA BICHO**, una por una.
       *
       * Agrupaba por `ficha.nombre`, que es la ESPECIE, y eso convertía «dos
       * enanos distintos, cada uno en su pose» en «un enano cambió de pose».
       * Las dos cosas daban una lista de dos, y el control de `sonda:mundo`
       * que pregunta si el sorteo se repite no podía distinguirlas: con 69
       * bichos y tres poses posibles, salía verde aunque ninguno cambiara
       * nunca. Es el apartado 4 con la clave de un `Map` (59).
       *
       * Ahora la clave es la INSTANCIA, y cada fila dice además si ese bicho
       * pasea: quien anda no puede volver a sortear su pose de reposo, y
       * mezclarlo con los quietos es lo que hacía falta poder separar.
       *
       * Y SE LLAMA A `relojes`, que es donde vive el sorteo.
       *
       * Esto era lo gordo: el bucle sólo llamaba a `animar(DT)`, que mueve los
       * mezcladores, y el nuevo dado se echa en `manada.relojes(DT)`
       * (`src/play/manada.js:499`, el `SetActivity(ACT_IDLE)` de
       * `msmonsterserver.cpp:596-600`). O sea que **el mecanismo bajo prueba
       * no llegaba a dispararse nunca**: lo único que hacía verde al control
       * era que dos bichos distintos de la misma especie cayeran en poses
       * distintas al nacer. El apartado 4 entero en una función de quince
       * líneas (59).
       */
      poses(s = 30) {
        const vistas = new Map();
        const DT = 1 / 60;
        const instancias = (S.bichos?.instancias ?? []);
        for (let t = 0; t < s; t += DT) {
          S.bichos?.animar(DT);
          S.bichos?.relojes?.(DT);
          instancias.forEach((i, idx) => {
            if (i.muerto || i.ficha.parado) return;
            const n = i.nombreActual ?? i.actual?.seq?.nombre ?? null;
            if (!n) return;
            if (!vistas.has(idx)) {
              vistas.set(idx, { nombre: i.ficha.nombre, pasea: Boolean(i.vagabundo?.pasea), poses: new Set() });
            }
            vistas.get(idx).poses.add(n);
          });
        }
        return [...vistas].map(([idx, v]) => ({ idx, nombre: v.nombre, pasea: v.pasea, poses: [...v.poses] }))
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
        const i = S.bichos?.instancias?.[n];
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
        const i = S.bichos?.instancias?.[n];
        if (!i?.vagabundo) return null;
        const v = i.vagabundo;
        return {
          nombre: i.ficha.nombre, pasea: v.pasea, ancho: v.ancho,
          t: v.t, proximoNodo: v.proximoNodo, plazo: v.plazo,
          tieneDestino: v.tieneDestino, vencido: v.vencido,
          // La distancia al destino, que es la que tiene que salir grande.
          lejos: v.destino
            ? Math.hypot(v.destino[0] - i.nodo.position.x * S.U, v.destino[2] - i.nodo.position.z * S.U)
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
        const o = cual === "muneco" ? S.muneco : cual === "escudo" ? S.escudoEnMano : S.armaEnMano;
        if (!o) return null;
        o.seguir(S.camera);
        o.nodo.updateMatrixWorld(true);
        const caja = new THREE.Box3().setFromObject(o.nodo);
        if (caja.isEmpty()) return null;
        const inv = S.camera.matrixWorldInverse.clone();
        S.camera.updateMatrixWorld(true);
        inv.copy(S.camera.matrixWorld).invert();
        // Las ocho esquinas pasadas a ejes de cámara, porque la caja del mundo
        // no dice nada si la cámara está girada.
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        const v = new THREE.Vector3();
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? caja.max.x : caja.min.x, i & 2 ? caja.max.y : caja.min.y,
            i & 4 ? caja.max.z : caja.min.z).applyMatrix4(inv);
          const p = [v.x * S.U, v.y * S.U, -v.z * S.U]; // derecha, arriba, delante
          for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
        }
        return {
          derecha: [min[0], max[0]], arriba: [min[1], max[1]], delante: [min[2], max[2]],
          visible: o.nodo.visible,
        };
      },
      /**
       * EL 99: ¿SE VE LA CARA DE FUERA DE LA MALLA, O LA DE DENTRO?
       *
       * Un modelo espejado con el sentido de giro mal puesto no desaparece: se
       * dibuja DEL REVÉS —las caras de atrás en vez de las de delante— y sigue
       * teniendo forma de escudo. Ni `caja()` ni contar píxeles lo ven.
       *
       * Se dibuja dos veces a un lienzo aparte, pintando la PROFUNDIDAD de cada
       * píxel: una COMO LO DIBUJA EL JUEGO (el `side` de cada material, tal
       * cual) y otra a dos caras, donde gana la superficie más cercana al ojo,
       * que es la que se vería de un objeto macizo. En una malla cerrada bien
       * dibujada las dos imágenes son la misma; del revés, no.
       *
       * La primera versión pintaba un color liso por grupo y salió VERDE CON EL
       * FALLO PUESTO (98,2 %): la cara de fuera y la de dentro del disco son el
       * mismo grupo, así que verlo por dentro daba el mismo color. Lo cazó
       * pasar la sonda ANTES de arreglar nada.
       *
       * No recalcula la regla del espejo: usa el nodo, los materiales y la
       * cámara del juego, y sólo les cambia el color.
       */
      caras(cual = "escudo", lado = 96) {
        const o = cual === "escudo" ? S.escudoEnMano : S.armaEnMano;
        const r = S.renderer;
        if (!o?.malla || !r) return null;
        o.seguir(S.camera);
        o.nodo.updateMatrixWorld(true);
        S.camera.updateMatrixWorld(true);
        const reales = o.malla.material;
        const lienzo = new THREE.WebGLRenderTarget(lado, lado);
        const antes = { rt: r.getRenderTarget(), color: r.getClearColor(new THREE.Color()), alfa: r.getClearAlpha(), auto: r.autoClear };
        const pintar = (dosCaras) => {
          o.malla.material = reales.map((m) => new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking, side: dosCaras ? THREE.DoubleSide : m.side, visible: m.visible,
          }));
          r.setRenderTarget(lienzo); r.autoClear = true; r.setClearColor(0x000000, 0);
          r.render(o.nodo, S.camera);
          const px = new Uint8Array(lado * lado * 4);
          r.readRenderTargetPixels(lienzo, 0, 0, lado, lado, px);
          for (const m of o.malla.material) m.dispose();
          return px;
        };
        let juego, macizo;
        try { juego = pintar(false); macizo = pintar(true); }
        finally {
          o.malla.material = reales;
          r.setRenderTarget(antes.rt); r.setClearColor(antes.color, antes.alfa); r.autoClear = antes.auto;
          lienzo.dispose();
        }
        let pixeles = 0, iguales = 0;
        for (let i = 0; i < juego.length; i += 4) {
          const hay = macizo[i] | macizo[i + 1] | macizo[i + 2] | macizo[i + 3];
          if (!hay) continue;                                 // donde el objeto macizo no pinta, no hay nada que comparar
          pixeles++;
          // la misma superficie da el mismo fragmento, byte a byte: es el mismo triángulo
          if (juego[i] === macizo[i] && juego[i + 1] === macizo[i + 1] && juego[i + 2] === macizo[i + 2] && juego[i + 3] === macizo[i + 3]) iguales++;
        }
        return { pixeles, iguales, fraccion: pixeles ? iguales / pixeles : null, espejado: Boolean(o.espejado) };
      },
      /**
       * EL 96: el RECTÁNGULO DE LA PANTALLA donde cae el arma, en píxeles CSS.
       *
       * Es la ventana para contar píxeles alrededor del arma (la lección del 78:
       * en pantalla entera el ruido del mundo se come la señal). Se proyecta
       * VÉRTICE A VÉRTICE, ya deformado por el esqueleto en el fotograma de
       * ahora (`SkinnedMesh.getVertexPosition`): la primera versión proyectaba
       * las ocho esquinas de la caja de la postura de enlace, y con el modelo de
       * vista pegado al ojo dos esquinas quedaban DETRÁS de la cámara y la
       * «ventana» salía de 6 000 × 9 000 px, o sea la pantalla entera. Los
       * vértices detrás del plano cercano se descartan.
       */
      rectangulo(cual = "arma") {
        const o = cual === "muneco" ? S.muneco : cual === "escudo" ? S.escudoEnMano : S.armaEnMano;
        if (!o) return null;
        o.seguir(S.camera);
        o.nodo.updateMatrixWorld(true);
        S.camera.updateMatrixWorld(true);
        const lienzo = S.renderer?.domElement ?? document.querySelector("canvas");
        const r = lienzo.getBoundingClientRect();
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0, detras = 0, fuera = 0;
        const v = new THREE.Vector3();
        const cerca = S.camera.near ?? 0.01;
        o.nodo.traverse((m) => {
          if (!m.isMesh || !m.visible || !m.geometry?.attributes?.position) return;
          if (m.isSkinnedMesh) m.skeleton?.update();
          const cuantos = m.geometry.attributes.position.count;
          for (let i = 0; i < cuantos; i++) {
            if (m.isSkinnedMesh) m.getVertexPosition(i, v); else v.fromBufferAttribute(m.geometry.attributes.position, i);
            v.applyMatrix4(m.matrixWorld).applyMatrix4(S.camera.matrixWorldInverse);
            // Detrás del plano cercano, en espacio de CÁMARA: proyectar un punto
            // que está detrás del ojo da coordenadas que parecen buenas y no lo son.
            if (v.z > -cerca) { detras++; continue; }
            v.applyMatrix4(S.camera.projectionMatrix);
            // Y lo que cae fuera del cuadro no se ve: no ensancha la ventana.
            if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { fuera++; continue; }
            const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height;
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
            n++;
          }
        });
        if (!n) return null;
        return { x0, y0, x1, y1, vertices: n, detras, fuera, ancho: r.width, alto: r.height, visible: o.nodo.visible };
      },
      /**
       * EL 97: congelar (o soltar) la animación del modelo de vista, para medir
       * su tamaño en píxeles con dos campos de visión SIN que respire entre las
       * dos fotos (la Novablade mueve un tercio de su ventana en 0,2 s, el 96).
       * Primero se probó medir en ÁNGULO (tangentes desde el ojo) y no sirve: el
       * modelo tiene vértices junto al plano cercano —el brazo sale por detrás
       * del ojo— y sus tangentes se van a infinito; el borde lo pone la pantalla.
       */
      congelar(cual = "arma", si = true) {
        const o = cual === "muneco" ? S.muneco : cual === "escudo" ? S.escudoEnMano : S.armaEnMano;
        if (!o) return null;
        if (si && !o.__animarDeVerdad) { o.__animarDeVerdad = o.animar; o.animar = () => {}; }
        if (!si && o.__animarDeVerdad) { o.animar = o.__animarDeVerdad; delete o.__animarDeVerdad; }
        return Boolean(o.__animarDeVerdad);
      },
      /** EL 97: el campo de visión VERTICAL de la cámara, en grados; `null` lo deja. */
      campoDeVision(grados = null) {
        if (grados !== null) { S.camera.fov = grados; S.camera.updateProjectionMatrix(); }
        return S.camera.fov;
      },
      /**
       * EL 96: esconder y volver a enseñar el modelo de la mano, para el control
       * NEGATIVO de los píxeles: la misma pantalla, el mismo instante, con y sin
       * el arma. Toca sólo `visible` del nodo —lo mismo que hace `empunar` con
       * el arma que se guarda— y devuelve cómo estaba para dejarlo igual.
       */
      esconder(cual = "arma", si = true) {
        const o = cual === "muneco" ? S.muneco : cual === "escudo" ? S.escudoEnMano : S.armaEnMano;
        if (!o) return null;
        const antes = o.nodo.visible;
        o.nodo.visible = !si;
        return antes;
      },
      /** Cambia el género del muñeco, que es otro modelo y otras pistas. */
      async genero(g = "female") { await S.ponerMuneco(g); return this.muneco; },
      get muneco() {
        if (!S.muneco) return null;
        S.muneco.seguir(S.camera);
        return {
          hay: true, visible: S.muneco.nodo.visible, animacion: S.muneco.animacion,
          triangulos: S.muneco.ficha.triangulos,
          // A qué distancia del ojo lo pone, en unidades: el motor dice 4,7
          // delante y 3,1 abajo, o sea 5,63 de separación.
          delOjo: S.muneco.nodo.position.distanceTo(S.camera.position) * S.U,
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
          arma: S.brazo?.arma?.id ?? null,
          nombre: S.brazo?.arma?.nombre ?? null,
          ataques: S.brazo?.ataques?.length ?? 0,
          fase: S.brazo?.fase ?? null,
          atacando: Boolean(S.brazo?.atacando),
          carga: S.brazo?.carga ?? 0,
          animacion: S.armaEnMano?.actual?.nombre ?? null,
          modelo: S.armaEnMano ? S.armaEnMano.ficha.nombre : null,
          triangulos: S.armaEnMano?.ficha?.triangulos ?? 0,
          potencia: S.potenciaDe(S.brazo?.ataques?.[0]),
          // Las tripas del brazo. Están aquí porque «no blande» tiene cuatro
          // causas que se ven igual: que no haya arma, que esté a medio
          // mandoble, que crea que estás cargando, o que el botón no llegue.
          t: S.brazo?.t ?? null, cargando: S.brazo?.cargando ?? 0,
          cargaHecha: S.brazo?.cargaHecha ?? 0, pulsadoAntes: S.brazo?.pulsadoAntes ?? null,
          golpesDados: S.golpesDados, impactos: S.impactos, muertes: S.muertes, aguante: S.aguante,
          // EL 96: las veces que `empunar` recibió un id fuera del catálogo y
          // cayó a los puños. Antes del 96 era CUALQUIER arma no de partida.
          armasSinFicha: S.armasSinFicha ?? 0,
          // El 80: por dónde entró. «Impactos» no distingue la esfera de la
          // línea, y el arreglo del 80 es justo la segunda: sin estos dos, tener
          // el segundo intento o no tenerlo se lee igual desde fuera.
          porLaLinea: S.porLaLinea ?? 0, contraPared: S.contraPared ?? 0,
        };
      },
      /** Empuña otra arma del catálogo, para probar varias. */
      empunar: (id) => S.empunar(id),
      /** El catálogo que se ha leído. */
      catalogo: () => [...(S.catalogoDeArmas?.keys() ?? [])],
      /**
       * Aguanta el botón `s` segundos con el paso fijo, y cuenta lo que pasa.
       *
       * No mueve el ratón ni depende del fotograma: es el mismo `tic` que corre
       * en el bucle, para que lo que mida la sonda sea lo que juega el jugador.
       */
      atacar(s = 1.5, { pulsado = true } = {}) {
        if (!S.brazo) return null;
        const antes = {
          golpesDados: S.golpesDados, impactos: S.impactos, muertes: S.muertes,
          porLaLinea: S.porLaLinea ?? 0, contraPared: S.contraPared ?? 0,
        };
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
          if (S.brazo.fase === "quieto" && !S.brazo.cargando && !S.brazo.cargaHecha) break;
          S.brazo.tic(S.DT, { pulsado: false, destreza: S.destrezaDe(S.brazo.ataques[0]) });
        }
        for (let t = 0; t < s; t += S.DT) {
          // La misma puerta que el bucle: cubriéndose no hay ataque. Sin esto la
          // sonda mediría mandobles que el jugador no puede dar.
          const e = S.brazo.tic(S.DT, {
            pulsado: pulsado && !S.cubriendose(), destreza: S.destrezaDe(S.brazo.ataques[0]),
          });
          if (e.empieza) empiezos++;
          if (e.acaba) finales++;
          if (e.golpe) S.pegar(e.golpe);
        }
        return {
          empiezos, finales,
          golpes: S.golpesDados - antes.golpesDados,
          impactos: S.impactos - antes.impactos,
          muertes: S.muertes - antes.muertes,
          // Los dos del 80, ya restados: lo que el control necesita es el
          // incremento de ESTA tanda, no el total de la partida.
          porLaLinea: (S.porLaLinea ?? 0) - antes.porLaLinea,
          contraPared: (S.contraPared ?? 0) - antes.contraPared,
          fase: S.brazo.fase,
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
        if (!S.brazo) return null;
        for (let k = 0; k < 120; k++) {
          if (S.brazo.fase === "quieto" && !S.brazo.cargando && !S.brazo.cargaHecha) break;
          S.pasoDelBrazo(S.DT, false);
        }
        // Y AHORA LA PARTE QUE NO ES OBVIA, y que la primera versión de esta
        // puerta se saltó: **el primer clic no carga nunca**. La carga arranca
        // al pulsar ESTANDO YA blandiendo (`ActivateButtonDown`), así que hay
        // que dar un mandoble, soltar en medio y volver a pulsar. Apretar el
        // botón desde quieto y no soltarlo —que es lo que hacía— no carga, y
        // la sonda decía «la barra no se ve» sobre un HUD que estaba bien.
        for (let k = 0; k < 120 && !S.brazo.atacando; k++) S.pasoDelBrazo(S.DT, true);
        S.pasoDelBrazo(S.DT, false);
        const antes = S.sonidosDeCarga;
        const vistas = [];
        for (let t = 0; t < s; t += S.DT) {
          S.pasoDelBrazo(S.DT, true);
          S.pasoDelHud(S.DT);
          const b = S.hudMs?.estado().carga ?? [];
          const suya = b.find((x) => x.visible);
          if (suya) vistas.push({ t: Number(t.toFixed(2)), ...suya });
        }
        return {
          carga: S.brazo.carga, cargando: S.brazo.cargando, fase: S.brazo.fase,
          // El TOPE del arma y la destreza con la que se mide, que es lo que
          // decide si hay carga siquiera: `GetHighestAttackCharge()` se salta
          // los ataques para los que no tienes destreza, y `Attack_Charge()`
          // corta ahí (giattack.cpp:600-628 y 1110).
          tope: S.brazo.cargaTope(S.destrezaDe(S.brazo.ataques[0])),
          destreza: S.destrezaDe(S.brazo.ataques[0]),
          sonidos: S.sonidosDeCarga - antes,
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
        for (let t = 0; t < s; t += S.DT) { S.pasoDelBrazo(S.DT, false); S.pasoDelHud(S.DT); }
        return { fase: S.brazo?.fase ?? null, carga: S.brazo?.carga ?? 0 };
      },
      /** A quién le daría un mandoble AHORA, sin darlo. */
      objetivo() {
        if (!S.brazo?.ataques?.length) return null;
        const a = S.brazo.ataques[0];
        const ojo = S.player.eye;
        const m = new THREE.Vector3(0, 0, -1).applyEuler(S.camera.rotation);
        const pies = S.player.feet;
        const r = elegirObjetivo({
          desde: [ojo[0] * S.U, ojo[1] * S.U, ojo[2] * S.U],
          centro: [pies[0] * S.U, (pies[1] + S.player.perfil.height / 2) * S.U, pies[2] * S.U],
          mirando: [m.x, m.y, m.z],
          alcance: a.alcance ?? 0,
          candidatos: S.candidatosDeGolpe(),
          libre: S.trazaLibre,
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
        const i = (S.bichos?.instancias ?? []).filter((x) => x.ficha.hostil)[n];
        if (!i || !S.brazo?.ataques?.length) return null;
        const a = S.brazo.ataques[0];
        const c = S.candidatosDeGolpe().find((x) => x.id === i);
        if (!c) return { razon: "no está en el censo", vivo: !i.muerto, vida: i.vida };
        const ojo = S.player.eye;
        const pies = S.player.feet;
        const desde = [ojo[0] * S.U, ojo[1] * S.U, ojo[2] * S.U];
        const centro = [pies[0] * S.U, (pies[1] + S.player.perfil.height / 2) * S.U, pies[2] * S.U];
        const m = new THREE.Vector3(0, 0, -1).applyEuler(S.camera.rotation);
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
        const libre = S.trazaLibre(desde, c.centro);
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
        const i = (S.bichos?.instancias ?? []).filter((x) => x.ficha.hostil)[n];
        if (!i) return null;
        return {
          nombre: i.ficha.nombre, vida: i.vida, vidaMaxima: i.vidaMaxima,
          muerto: i.muerto, animacion: i.nombreActual ?? null,
          muerteQueDice: i.ficha.ia?.muerte ?? null,
          experiencia: i.ficha.ia?.experiencia ?? null,
          recibido: { ...i.recibido },
          solido: Boolean((S.bichosSolidos?.puestos ?? []).find((p) => p.instancia === i)),
          visible: i.nodo.visible,
        };
      },
      /** Mata al hostil `n` de un golpe, para mirar la muerte sin esperar. */
      matar(n = 0) {
        const i = (S.bichos?.instancias ?? []).filter((x) => x.ficha.hostil)[n];
        if (!i || !S.bichos) return null;
        i.recibido = { "swordsmanship.power": i.vidaMaxima };
        // `parry: 0` fija la tirada del bicho en cero para que la araña —que
        // tiene 50 de parry desde el 19— no pare el golpe con el que la sonda
        // quiere mirar la muerte.
        S.bichos.herir(i, i.vida + 1, { cubo: "swordsmanship.power", dados: { parry: 0, quien: S.JUGADOR } });
        S.bichosSolidos?.quitar(i);
        S.repartirExperiencia(i);
        return this.victima(n);
      },
      /** La hoja del personaje, que es donde acaba la experiencia. */
      hoja() {
        const p = S.sesion?.personaje;
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
      get estado() { return { parados: S.parados, encogidas: S.encogidas, huidas: S.huidas, avisos: S.avisos, reloj: S.reloj, razas: S.tablaDeRazas.size }; },
      /** Si el juego cree que dos bichos son aliados, y por qué. */
      aliados(a, b) {
        const x = (S.bichos?.instancias ?? [])[a], y = (S.bichos?.instancias ?? [])[b];
        if (!x || !y) return null;
        return {
          razaA: x.ficha.ia?.raza ?? null, razaB: y.ficha.ia?.raza ?? null,
          relacion: relacionDeRazas(S.tablaDeRazas, x.ficha.ia?.raza, y.ficha.ia?.raza),
          aliados: S.sonAliados({ o: x }, { o: y }),
          distancia: Math.hypot((x.nodo.position.x - y.nodo.position.x) * S.U, (x.nodo.position.z - y.nodo.position.z) * S.U),
        };
      },
      /** La ficha de reacción de cada bicho, y si su modelo trae la animación. */
      censo() {
        return (S.bichos?.instancias ?? []).map((i, n) => {
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
            // EL 95: `HAS_AI`. Sin él, `huir` y `encogerseIA` son constantes que
            // no lee nadie en el mod (ver `reaccionAlGolpe`).
            tieneIA: ia.tieneIA ?? null,
            corriendo: ia.corriendo ?? null,
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
      tipoDelAtaque() { return S.brazo?.ataques?.[0]?.tipoDano ?? null; },
      /** Le pone la vida que se le diga, para medir muchos golpes sin matarlo. */
      vida(n, v) {
        const i = (S.bichos?.instancias ?? [])[n];
        if (!i) return null;
        i.vida = v; i.vidaMaxima = Math.max(i.vidaMaxima ?? 0, v);
        return i.vida;
      },
      /** El estado vivo del bicho `n`: animación, huida, si está quieto. */
      quien(n = 0) {
        const i = (S.bichos?.instancias ?? [])[n];
        if (!i) return null;
        const p = S.player.feet;
        const d = Math.hypot(i.nodo.position.x - p[0], i.nodo.position.z - p[2]);
        return {
          nombre: i.ficha.nombre, vida: i.vida, muerto: i.muerto,
          animacion: i.nombreActual ?? null,
          huyendo: Boolean(i.cazador?.huyendo),
          quedaDeHuida: i.cazador?.fuga?.queda ?? null,
          objetivo: i.cazador?.objetivo ?? null,
          quieto: S.reloj < (i.reaccion?.quietoHasta ?? -Infinity),
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
        const i = (S.bichos?.instancias ?? [])[n];
        if (!i || !S.bichos) return null;
        const dados = { quien: S.JUGADOR };
        if (parry !== null) dados.parry = parry;
        if (acc !== null) dados.acc = acc;
        if (huir !== null) dados.huir = huir;
        const r = S.bichos.herir(i, dano, { cubo: "swordsmanship.power", tipo, ahora: S.reloj, dados });
        if (r.muerto) { S.bichosSolidos?.quitar(i); S.repartirExperiencia(i); }
        return { ...r, avisados: r.avisados?.length ?? 0 };
      },
      /** Mata al bicho `n` y devuelve a cuántos aliados ha avisado al morir. */
      matarYAvisar(n = 0) {
        const i = (S.bichos?.instancias ?? [])[n];
        if (!i || !S.bichos) return null;
        const r = S.bichos.matar(i, { quien: S.JUGADOR, esAliado: S.sonAliados });
        S.bichosSolidos?.quitar(i);
        return {
          muerto: r.muerto, avisados: r.avisados.length,
          // A quién ha avisado y si le ha puesto el objetivo, que es el efecto.
          quienes: r.avisados.map((k) => ({
            nombre: S.bichos.instancias[k].ficha.nombre,
            objetivo: S.bichos.instancias[k].cazador?.objetivo ?? null,
            distancia: Math.hypot(
              (S.bichos.instancias[k].nodo.position.x - i.nodo.position.x) * S.U,
              (S.bichos.instancias[k].nodo.position.z - i.nodo.position.z) * S.U),
          })),
        };
      },
      /** Adelanta el reloj del mundo `s` segundos con el paso fijo, cazando. */
      avanzar(s = 1) {
        const pasos = Math.max(1, Math.round(s / S.DT));
        for (let k = 0; k < pasos; k++) {
          S.reloj += S.DT;
          S.bichos?.animar(S.DT);
          pasoDeBichos(S, S.DT, { ...S.arnesDePaseo, ahora: S.reloj });
        }
        S.bichosSolidos?.seguir();
        return { reloj: S.reloj, pasos };
      },
      /**
       * LA TASA MEDIDA de parada: N golpes con los dados de verdad. Es el
       * control contra la cuenta cerrada de `probabilidadDeParry`.
       */
      tasaDeParada(n = 0, golpes = 4000) {
        const i = (S.bichos?.instancias ?? [])[n];
        if (!i || !S.bichos) return null;
        const vida = i.vida, recibido = { ...i.recibido };
        let parados = 0;
        for (let k = 0; k < golpes; k++) {
          // Daño 0,001 para que 4 000 golpes no lo maten: lo que se mide es la
          // tirada, no el daño.
          const r = S.bichos.herir(i, 0.001, { tipo: "slash", ahora: S.reloj, dados: { quien: S.JUGADOR } });
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
    /**
     * EL 96: LA ARMADURA. `vestir` entra por la MISMA función que usaría el
     * juego (`vestirObjeto` de main.js -> `vestir` de src/play/armadura.js);
     * `ultima` es lo que la armadura le hizo al último golpe de un bicho,
     * leído del camino de `golpear` y no recalculado aquí (el 65).
     */
    armadura: {
      vestir: (id) => S.vestirObjeto(id),
      get ultima() { return S.ultimaArmadura; },
      get puestos() {
        return [...(S.objetosVivos?.values?.() ?? [])].filter((o) => o.puesto)
          .map((o) => ({ id: o.id, armadura: o.armadura, golpeEnCurso: Boolean(o.golpeEnCurso) }));
      },
    },
    /**
     * EL 97 (G): LAS TRABAS. Lo que el bucle de `main.js` leyó de los efectos
     * en el último fotograma (`ultimasTrabas`, src/play/trabas.js) — leído, no
     * recalculado (el 65). `aplicar` entra por la puerta de `applyeffect` del
     * jugador, la misma que reciben los guiones de los bichos (`aplicarEfecto`).
     */
    trabas: {
      get ultimas() {
        const t = S.ultimasTrabas;
        return t ? { ...t, quien: t.quien.map((x) => ({ ...x })) } : null;
      },
      aplicar: (ruta, params = []) => {
        const ef = S.guionJugador?.efectos?.aplicar(String(ruta), params.map(String)) ?? null;
        return { puesto: Boolean(ef), resultado: S.guionJugador?.efectos?.historial?.at(-1)?.resultado ?? null };
      },
      activos: () => S.guionJugador?.efectos?.activos ?? [],
      /** `removeeffect ent_me <id>` (scriptcmds.cpp:5068-5106): ANDAMIO para tirar el dado otra vez sin esperar. */
      quitar: (id) => S.guionJugador?.efectos?.quitarPorId(String(id)) ?? 0,
      nopush: () => Boolean(S.guionJugador?.nopush),
      resistencia: (tipo) => S.guionJugador?.resistencias?.leer?.(String(tipo)) ?? null,
    },
    // EL 97: SÓLO LECTURA. Las órdenes del equipo las da el jugador —clics en el
    // panel y la `q`—; aquí se lee qué hicieron y en qué orden.
    inventario97: {
      get ultimo() { return S.ultimoMovimiento ?? null; },
      get manoActiva() { return S.manoActiva ?? null; },
      get manos() { return { ...(S.sesion?.personaje?.manos ?? {}) }; },
      get puestos() { return (S.sesion?.personaje?.objetos ?? []).filter((o) => o.puesto).map((o) => o.id); },
    },
    // EL 98: SÓLO LECTURA. Qué hay en cada contenedor (el campo `en` de la
    // entrada, src/play/contenedores.js), lo que no tiene sitio y lo último que
    // soltó «Drop Selected». No coloca nada: eso lo hace el juego al abrir el
    // panel o al dar una orden.
    inventario98: {
      get enCada() {
        const out = {};
        for (const o of S.sesion?.personaje?.objetos ?? []) {
          if (o.puesto || o.en === undefined) continue;
          (out[o.en] ??= []).push(o.id);
        }
        return out;
      },
      get entradas() { return (S.sesion?.personaje?.objetos ?? []).map((o) => ({ id: o.id, n: o.n ?? 1, en: o.en ?? null, puesto: Boolean(o.puesto) })); },
      get ultimoSoltado() { return S.ultimoSoltado98 ?? null; },
    },
    escudo: {
      get estado() {
        return {
          catalogo: S.catalogoDeEscudos?.size ?? 0,
          id: S.brazal?.objeto?.id ?? null,
          nombre: S.brazal?.objeto?.nombre ?? null,
          desplegado: Boolean(S.brazal?.desplegado),
          arriba: Boolean(S.brazal?.atacando),
          postura: S.brazal?.postura ?? null,
          montado: Boolean(S.escudoEnMano),
          animacion: S.escudoEnMano?.actual?.nombre ?? null,
          ficha: S.brazal?.ficha ?? null,
          bloqueos: S.bloqueos, desvios: S.desvios, fueraDelCono: S.fueraDelCono, parados: S.parados, golpesRecibidos: S.golpesRecibidos,
          parry: S.parryDelPersonaje(),
        };
      },
      /** Pone un escudo del catálogo, o `null` para quitarlo. */
      async embrazar(id = null) {
        await S.embrazar(id);
        if (S.sesion?.personaje) S.sesion.personaje.manos.izquierda = id ?? null;
        return window.probe.escudo.estado;
      },
      /** Lo levanta o lo baja sin tocar el ratón, para poder medir. */
      cubrir(si = true, pasos = 20) {
        if (!S.brazal) return null;
        for (let k = 0; k < pasos; k++) S.pasoDelEscudo(S.DT, Boolean(si));
        return { arriba: S.brazal.arriba, postura: S.brazal.postura, t: S.brazal.t };
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
        if (!S.brazal || !S.sesion?.personaje) return null;
        const antes = { recibidos: S.golpesRecibidos, bloqueos: S.bloqueos, desvios: S.desvios, fueraDelCono: S.fueraDelCono, parados: S.parados };
        // `sesion.limites` y no `vitalesDelPersonaje()`: ésa devuelve lo que
        // necesita el modelo de velocidad —agilidad, fuerza, peso, carga y
        // aguante— y **no trae `vidaMax`**. Aquí ponía `undefined` en la vida
        // del personaje en cada paso, y no se veía porque el recorte de la
        // sesión lo arreglaba en el tic siguiente.
        const max = S.sesion.limites.vidaMax;
        const pasos = Math.max(1, Math.round(s / S.DT));
        for (let k = 0; k < pasos; k++) {
          // La vida a tope en cada paso: no se mide cuánto aguantas, se mide
          // cuántos golpes bloquea el escudo.
          S.sesion.personaje.vida = max;
          // El botón aguantado, el paso del escudo y el de los bichos, en el
          // mismo orden y con el mismo `DT` que el bucle de dibujo.
          S.pasoDelEscudo(S.DT, true);
          S.reloj += S.DT;
          S.bichos?.animar(S.DT);
          pasoDeBichos(S, S.DT, { ...S.arnesDePaseo, ahora: S.reloj });
        }
        S.sesion.personaje.vida = max;
        S.bichosSolidos?.seguir();
        return {
          segundos: s, arriba: S.brazal.arriba,
          recibidos: S.golpesRecibidos - antes.recibidos,
          bloqueos: S.bloqueos - antes.bloqueos,
          desvios: S.desvios - antes.desvios,
          fueraDelCono: S.fueraDelCono - antes.fueraDelCono,
          parados: S.parados - antes.parados,
        };
      },
      /** ¿Puede el arma salir ahora mismo? Es `IsShielding()`. */
      puedeAtacar() { return !S.cubriendose(); },
      /**
       * EL CONO, medido donde de verdad se aplica. Dice a partir de cuántos
       * grados deja de bloquear, girando al atacante alrededor del jugador.
       */
      cono(paso = 1) {
        const yo = S.player.feet;
        const mirando = [-Math.sin(S.player.yaw), 0, -Math.cos(S.player.yaw)];
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
        if (!S.brazal?.ficha) return null;
        let total = 0, bloqueados = 0, anulados = 0;
        for (let k = 0; k < n; k++) {
          const d = defensaDelJugador({
            dano, tipo, escudo: S.brazal.ficha, postura, desplegado: true, deFrente,
            parry: S.parryDelPersonaje(),
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
    setCielo(on) { if (S.mallaCielo) S.mallaCielo.visible = on; },
    detalle: { grupos: S.gruposDetalle?.length ?? 0, hay: Boolean(S.mallaDetalle) },
    /**
     * Apaga o enciende los ADORNOS, y es la sonda que dice cuanto aportan.
     *
     * Vale lo mismo que `setKit()` en Corinth: lo que mide un adorno no es la
     * cobertura —que en un interior ya esta saturada— sino cuantos pixeles
     * CAMBIAN al quitarlo.
     */
    setAdornos(on) { S.adornos.grupo.visible = on; },
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
      const lados = [S.THREE_FRONT, S.THREE_BACK, THREE.DoubleSide];
      for (const m of S.adornos.materiales) {
        m.side = lados[cual] ?? S.THREE_FRONT;
        m.needsUpdate = true;
      }
    },
    adornos: { n: S.adornos.n, ficheros: S.adornos.ficheros, triangulos: S.adornos.triangulos },
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
      if (!S.rosa) {
        const img = S.atlas.quieta.image;
        const lienzo = document.createElement("canvas");
        lienzo.width = img.width;
        lienzo.height = img.height;
        const cx = lienzo.getContext("2d");
        cx.drawImage(img, 0, 0);
        // El luxel negro reservado, con el margen que lo rodea: se pinta un
        // cuadro de 4x4 porque el filtro lineal muestrea vecinos y un solo pixel
        // rosa saldria mezclado con el negro de al lado.
        // `negro` viaja en UV, no en pixeles: es lo que necesita la malla.
        const nx = Math.round(S.level.manifiesto.luz.negro[0] * img.width - 0.5);
        const ny = Math.round(S.level.manifiesto.luz.negro[1] * img.height - 0.5);
        cx.fillStyle = "#ff00c8";
        cx.fillRect(nx - 1, ny - 1, 3, 3);
        S.rosa = new THREE.CanvasTexture(lienzo);
        S.rosa.magFilter = THREE.LinearFilter;
        S.rosa.minFilter = THREE.LinearFilter;
        S.rosa.generateMipmaps = false;
        S.rosa.wrapS = S.rosa.wrapT = THREE.ClampToEdgeWrapping;
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
        S.rosa.colorSpace = S.atlas.quieta.colorSpace;
        S.rosa.channel = 1;
        S.rosa.flipY = false;
      }
      for (const m of [...S.materiales, ...S.adornos.materiales]) {
        if (!m.userData.conLuz) continue;
        m.lightMap = on ? S.rosa : atlasDe(m);
        m.needsUpdate = true;
      }
    },
    /** El factor de overbright, para poder barrerlo y MIRARLO. */
    setOverbright(x) {
      for (const m of S.materiales) m.lightMapIntensity = Math.PI * x;
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
      for (const m of S.materiales) {
        m.side = atras ? S.THREE_BACK : S.THREE_FRONT;
        m.needsUpdate = true;
      }
    },
    place(feetUnits, yaw = 0, pitch = 0, settle = 90) {
      const f = [feetUnits[0] / S.U, feetUnits[2] / S.U, -feetUnits[1] / S.U];
      S.player.body.setTranslation({ x: f[0], y: f[1] + S.player.centreOffset, z: f[2] }, true);
      S.player.velocityY = 0;
      S.player.yaw = yaw;
      S.player.pitch = pitch;
      for (let i = 0; i < settle; i++) {
        S.player.step(S.DT, {});
        if (S.player.grounded) break;
      }
      return { feet: S.player.feet, grounded: S.player.grounded };
    },
    /** Vuelve a la llegada. Los pies ya vienen calculados del árbol BSP. */
    restart(yaw = S.rumbo, pitch = 0) {
      S.player.body.setTranslation(
        { x: S.level.start[0], y: S.level.start[1] + S.player.centreOffset + 0.2, z: S.level.start[2] },
        true
      );
      S.player.velocityY = 0;
      S.player.yaw = yaw;
      S.player.pitch = pitch;
      for (let i = 0; i < 90; i++) { S.player.step(S.DT, {}); if (S.player.grounded) break; }
      return { feet: S.player.feet, grounded: S.player.grounded };
    },
    /** Coloca al jugador en uno de los pueblos, para ver los interiores. */
    alPueblo(i = 0, yaw = 0) {
      const p = S.level.pueblos[i];
      if (!p) return null;
      S.player.body.setTranslation(
        { x: p.escena[0], y: p.escena[1] + S.player.centreOffset + 0.5, z: p.escena[2] },
        true
      );
      S.player.velocityY = 0;
      S.player.yaw = yaw;
      for (let k = 0; k < 90; k++) { S.player.step(S.DT, {}); if (S.player.grounded) break; }
      return { feet: S.player.feet, grounded: S.player.grounded, pueblo: p };
    },
    fly(eyeUnits, yaw = 0, pitch = 0) {
      S.camera.position.set(eyeUnits[0] / S.U, eyeUnits[2] / S.U, -eyeUnits[1] / S.U);
      S.camera.rotation.set(pitch, yaw, 0);
      // El cielo sigue al ojo TAMBIEN aqui. La primera version solo lo movia en
      // el bucle de juego, asi que todas las capturas salian con la caja de
      // cielo plantada en el origen del mapa — con paralaje y del reves.
      if (S.mallaCielo) S.mallaCielo.position.copy(S.camera.position);
      // La dlight del glow sobre los bichos TAMBIEN aqui. Sin esto, las capturas
      // salian con los bichos a la luz de su suelo y el visor los ensena
      // iluminados al acercarse: dos imagenes distintas del mismo sitio, que es
      // lo que ya paso con la caja de cielo.
      if (S.bichos) S.bichos.alumbrar(S.camera.position, S.glow.visible ? { radio: GLOW.alcance * GLOW.radio, color: [1, 1, 0.5] } : { radio: 0 });
      S.renderer.render(S.escena, S.camera);
      return { eye: S.camera.position.toArray() };
    },
    draw() {
      const eye = S.player.eye;
      // Las DOS ramas, no una: ver `aplicarCamara`. Esto ponía la cámara en el
      // ojo a pelo, y desde el 41 un muerto no mira por su ojo.
      aplicarCamara();
      if (S.mallaCielo) S.mallaCielo.position.set(eye[0], eye[1], eye[2]);
      S.renderer.render(S.escena, S.camera);
      return { eye, width: S.canvas.width, height: S.canvas.height };
    },
  };
}
