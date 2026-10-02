// EL ANFITRIÓN: el proceso que sostiene una partida.
//
// Aquí se juntan las tres piezas que hasta ahora no se conocían: el transporte
// (`socket.js`), la autoridad (`partida.js`) y el mundo de verdad (la malla de
// colisión de Gate City, la misma que anda el navegador).
//
// ── El bucle, y por qué no es `setInterval(..., 10)` ─────────────────────
//
// `sys_ticrate` son 100 pasos por segundo, o sea 10 ms. Un `setInterval` de
// 10 ms en Node no da 100 vueltas por segundo: da las que le deja el
// planificador, y cada vuelta llega tarde un poco distinto. Por eso el paso
// **no sale del temporizador**: el temporizador sólo dice «ha pasado algo de
// tiempo» y `Partida.avanzar()` decide cuántos pasos fijos caben. Es la misma
// separación que el motor hace entre `host_frametime` y el tiempo del mundo, y
// es lo que permite que un servidor con hipo siga simulando el mismo juego.

import { Partida } from "./partida.js";
import { abrir, MENSAJE, RED } from "./protocolo.js";
import { World, Player, perfilMsr, initPhysics } from "../play/player.js";

import { MAPA_POR_DEFECTO, baseDe } from "../play/mapa.js";
const BASE_POR_DEFECTO = baseDe(MAPA_POR_DEFECTO);
/**
 * El mundo del servidor: la malla de colisión y una fábrica de cuerpos.
 *
 * El cuerpo que se crea aquí es **un `Player` de `src/play/player.js`**, el
 * mismo que corre el navegador. Ésa es la frase entera del experimento: no hay
 * una «física de servidor».
 */
export function mundoDeNivel(level, { perfil = null } = {}) {
  const p = perfil ?? perfilMsr(level.unitsPerMetre ?? 39.37);
  const world = new World(level.colision, { perfil: p });
  return {
    world,
    perfil: p,
    triangulos: level.colision.triangleCount,
    // La valla de los bichos, tal cual viene del nivel: la `Fauna` la envuelve.
    // No entra en `world` — el jugador la atraviesa (`world.cpp:1196`).
    monsterclip: level.monsterclip ?? [],
    crearCuerpo(pies) { return new Player(world, pies, { perfil: p }); },
    soltarCuerpo(cuerpo) {
      // Sin esto, cada jugador que entra y sale deja su cápsula en el mundo
      // para siempre: no se ve —nadie la dibuja— pero choca, y al cabo de un
      // rato la puerta del templo está tapiada por los que se fueron.
      try { world.world.removeRigidBody(cuerpo.body); } catch { /* ya no estaba */ }
    },
  };
}

/** Carga el nivel en Node, leyendo `build/` del disco. */
export async function nivelDeDisco(cargar, { base = BASE_POR_DEFECTO } = {}) {
  const { readFile } = await import("node:fs/promises");
  const fetchDeDisco = async (ruta) => {
    const b = await readFile(ruta);
    return {
      ok: true,
      arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      json: async () => JSON.parse(b.toString("utf8")),
      text: async () => b.toString("utf8"),
    };
  };
  await initPhysics();
  return cargar({ base, fetch: fetchDeDisco });
}

export class Anfitrion {
  /**
   * @param {{ partida: Partida, ws?: object, red?: object, reloj?: Function }} opciones
   */
  constructor({ partida, ws = null, red = RED, ahora = () => Date.now() / 1000 } = {}) {
    this.partida = partida;
    this.red = red;
    this._ahora = ahora;
    this._ultimo = ahora();
    this._reloj = null;
    this.pasos = 0;
    this.vueltas = 0;
    /** Lo que cuesta una vuelta, para poder decir si el servidor llega. */
    this.msPorVuelta = 0;
    this.msMaximo = 0;
    if (ws) ws.al("conexion", (c) => this.atender(c));
  }

  /** Engancha una conexión ya abierta a la partida. */
  atender(conexion) {
    const cliente = this.partida.conectar(conexion);
    if (!cliente) {
      // Lleno. Se dice y se cierra, que es mejor que dejar a alguien mirando
      // una pantalla de carga que no va a terminar.
      conexion.enviar?.(JSON.stringify({ v: 1, t: MENSAJE.FUERA, porque: "la partida está llena" }));
      conexion.cerrar?.(1013, "llena");
      return null;
    }
    conexion.id = cliente.id;
    conexion.al("mensaje", (texto) => {
      const m = abrir(texto);
      if (!m) return;
      // Las promesas del almacén se sueltan sin esperar: el bucle del servidor
      // no puede pararse a que el disco conteste, y el orden entre mensajes de
      // un mismo cliente lo garantiza el propio TCP.
      Promise.resolve(this.partida.recibir(cliente.id, m)).catch((e) => {
        console.error(`mensaje '${m.t}' del jugador ${cliente.id}:`, e);
      });
    });
    conexion.al("cierre", () => {
      this.partida.desconectar(cliente.id, { porque: "se cerró la conexión" })
        .catch((e) => console.error("al desconectar:", e));
    });
    return cliente;
  }

  /** Arranca el bucle. `cada` es cada cuánto MIRA el reloj, no el paso. */
  arrancar({ cada = 5 } = {}) {
    if (this._reloj) return this;
    this._ultimo = this._ahora();
    this._reloj = setInterval(() => this.vuelta(), cada);
    this._reloj.unref?.();
    return this;
  }

  parar() {
    if (this._reloj) clearInterval(this._reloj);
    this._reloj = null;
    return this;
  }

  /** Una vuelta: avanzar lo que haya pasado y repartir las fotos que toquen. */
  vuelta() {
    const t0 = this._ahora();
    const dt = Math.max(0, t0 - this._ultimo);
    this._ultimo = t0;
    this.pasos += this.partida.avanzar(dt);
    this.partida.repartir();
    this.vueltas++;
    const ms = (this._ahora() - t0) * 1000;
    // Media móvil corta: lo que importa no es la media de la partida entera
    // sino si AHORA llega. Y el máximo aparte, porque un pico de 40 ms es un
    // tirón que ninguna media enseña.
    this.msPorVuelta = this.msPorVuelta * 0.9 + ms * 0.1;
    this.msMaximo = Math.max(this.msMaximo, ms);
    return this.pasos;
  }

  /** Lo que la lista de partidas enseña. */
  get resumen() {
    return {
      ...this.partida.resumen,
      pasos: this.pasos,
      msPorVuelta: Math.round(this.msPorVuelta * 100) / 100,
      msMaximo: Math.round(this.msMaximo * 100) / 100,
    };
  }
}
