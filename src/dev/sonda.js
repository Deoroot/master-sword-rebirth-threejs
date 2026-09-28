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
import { nombreDeTecla } from "../juego/teclas.js";
import { relacionDeRazas } from "../bsp/razas.js";

/**
 * Arma `window.probe`.
 *
 * `S` trae el estado vivo del juego. Los nombres son los mismos que dentro de
 * `mainGateCity`, a propósito: así una línea de aquí se puede comparar con la
 * de allí sin traducir nada.
 */
export function montarSonda(S) {
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
     * LA FISICA, para poder cronometrarla contra las cifras del motor.
     *
     * Que las 50 comprobaciones de `movimiento.js` pasen en Node no dice que
     * el jugador ande a esa velocidad EN EL MAPA: entre las dos cosas estan la
     * conversion de unidades —donde estaba el fallo del 23 %— y Rapier.
     */
    fisica: {
      perfil: () => S.perfil,
      aguante: () => S.aguante,
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
     * LOS PANELES DE VGUI. Esto SÓLO LEE, y es a propósito.
     *
     * No hay aquí ningún `abrir()`: el panel se abre pulsando la F de verdad con
     * el teclado del navegador, que es la única forma de comprobar lo que este
     * experimento vino a arreglar —que la tecla entra por la tabla del juego—.
     * Una puerta `probe.vgui.abrir("interact")` daría todos los controles en
     * verde con la tecla desconectada, que es exactamente el fallo que se está
     * quitando.
     */
    vgui: {
      hay: () => Boolean(S.vgui),
      /** Qué panel está abierto, o null. Es `m_pCurrentMenu`. */
      abierto: () => S.vgui?.abierto?.nombre ?? null,
      /** ¿El juego deja de moverse? `m_NoMouse` es la excepción. */
      atrapaElRaton: () => Boolean(S.vgui?.atrapaElRaton),
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
      /** Lo que se le ha dicho al jugador al elegir una opción. */
      ultimoSuceso: () => S.hudMs?.estado().consola?.at?.(-1) ?? null,
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
    },
    mundo: {
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
      if (S.bichos) S.bichos.pasear(dt, S.arnesDePaseo);
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
      return { suelo: S.arnesDePaseo.suelo(x, y, z, i), libre: S.arnesDePaseo.libre(x, y, z, 1, 0, 0.35, i) };
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
    ia: {
      /** El censo: quien es hostil segun la tabla de razas. */
      censo() {
        const l = (S.bichos?.instancias ?? []).map((i) => ({
          nombre: i.ficha.nombre, raza: i.ficha.ia?.raza ?? null,
          hostil: Boolean(i.ficha.hostil), relacion: i.ficha.relacion,
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
        S.bichos.cazar(1 / 60, S.arnesDePaseo);
        return {
          movido: Math.hypot(i.nodo.position.x - a[0], i.nodo.position.z - a[1]),
          frenado: i.frenado ?? null, destino: i.destino ?? null, cerca: i.cerca ?? null,
          intencion: i.intencion?.accion ?? null,
        };
      },
      /** Corre la caza `s` segundos sin depender del fotograma. */
      correr(s = 3) {
        for (let t = 0; t < s; t += 1 / 60) S.bichos?.cazar(1 / 60, S.arnesDePaseo);
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
        const DT = 1 / 60;
        let t0 = S.reloj;
        for (let t = 0; t < s; t += DT) {
          t0 += DT;
          S.bichos?.cazar(DT, { ...S.arnesDePaseo, ahora: t0 });
          S.bichos?.animar(DT);
        }
        S.bichosSolidos?.seguir();
        const l = (S.bichos?.instancias ?? []).map((i, n) => ({
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
        const antes = (S.bichos?.instancias ?? []).map((i) => [i.nodo.position.x, i.nodo.position.z]);
        const DT = 1 / 60;
        // Se mira CADA fotograma y no sólo al final. El plazo del vagabundo es
        // de 7 s y la espera de 2, y los 69 arrancan con el mismo reloj: en el
        // segundo 10 exacto están todos en el hueco de los 2 s, o sea todos
        // quietos. Una foto ahí dice «ninguno anda con la animación de andar»
        // y es verdad en ese instante y mentira en el resto.
        const vioAndar = (S.bichos?.instancias ?? []).map(() => false);
        for (let t = 0; t < s; t += DT) {
          S.bichos?.pasear(DT, S.arnesDePaseo);
          (S.bichos?.instancias ?? []).forEach((i, n) => {
            if (i.andando === "pasea" && i.ficha.andando &&
                i.nombreActual === String(i.ficha.andando).toLowerCase()) vioAndar[n] = true;
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
          S.bichos?.animar(DT);
          for (const i of S.bichos?.instancias ?? []) {
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
        const antes = { golpesDados: S.golpesDados, impactos: S.impactos, muertes: S.muertes };
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
          S.bichos?.cazar(S.DT, { ...S.arnesDePaseo, ahora: S.reloj });
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
          S.bichos?.cazar(S.DT, { ...S.arnesDePaseo, ahora: S.reloj });
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
      S.camera.position.set(eye[0], eye[1], eye[2]);
      S.camera.rotation.set(S.player.pitch, S.player.yaw, 0);
      if (S.mallaCielo) S.mallaCielo.position.set(eye[0], eye[1], eye[2]);
      S.renderer.render(S.escena, S.camera);
      return { eye, width: S.canvas.width, height: S.canvas.height };
    },
  };
}
