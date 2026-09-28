// EL SOCKET: el apretón de manos y la conexión, sobre `marco.js`.
//
// Un servidor de WebSocket y un cliente de WebSocket para Node, en un archivo.
// El cliente existe por una razón concreta y no por simetría: **Node 20 no trae
// `WebSocket` global** —hace falta `--experimental-websocket`— y sin cliente no
// hay forma de comprobar la partida entera en `npm test`, sin navegador. Con
// los dos lados escritos aquí, la sonda con Chrome pasa a ser el ORÁCULO y no
// el único camino: si nuestro marco estuviera mal de una forma simétrica, los
// dos lados nuestros se entenderían y el navegador no. Por eso hay sonda.
//
// Lo que este archivo NO hace, y es a propósito:
//
//   - no negocia extensiones (`permessage-deflate`). Los mensajes de esta
//     partida son cientos de bytes; comprimirlos cuesta más que mandarlos;
//   - no habla `wss://`. Va detrás de un proxy el día que haya despliegue, que
//     es como se hace y además es el único sitio donde vive el certificado;
//   - no reparte por subprotocolo. Hay uno.

import { createServer } from "node:http";
import { connect } from "node:net";
import { randomBytes } from "node:crypto";
import {
  Desenmarcador, OPCODE, aceptacion, enmarcar, cuerpoDeCierre, leerCierre, MAX_MENSAJE,
} from "./marco.js";

/**
 * Una conexión ya establecida, de cualquiera de los dos lados.
 *
 * `enmascarar` es lo único que distingue a un lado del otro en el tráfico: el
 * cliente enmascara todo y el servidor no enmascara nada (RFC 6455 §5.1).
 */
export class Conexion {
  constructor(socket, { enmascarar = false, maximo = MAX_MENSAJE } = {}) {
    this.socket = socket;
    this.enmascarar = enmascarar;
    this.abierta = true;
    /** Lo pone quien la acepte: el hueco que ocupa en la partida. */
    this.id = null;
    this._oyentes = new Map();
    this._lector = new Desenmarcador({ maximo, exigirMascara: !enmascarar });

    socket.on("data", (bytes) => this._entra(bytes));
    socket.on("error", (e) => { this._avisar("error", e); this._fin(1006, String(e?.message ?? e)); });
    socket.on("close", () => this._fin(1006, "el socket se cerró"));
  }

  al(evento, fn) {
    if (!this._oyentes.has(evento)) this._oyentes.set(evento, new Set());
    this._oyentes.get(evento).add(fn);
    return () => this._oyentes.get(evento)?.delete(fn);
  }

  _avisar(evento, ...args) {
    for (const fn of this._oyentes.get(evento) ?? []) {
      // Un oyente que revienta no puede tumbar la conexión, por lo mismo que en
      // la sesión: un fallo pintando a otro jugador no puede desconectarte.
      try { fn(...args); } catch (e) { console.error(`oyente de '${evento}':`, e); }
    }
  }

  _entra(bytes) {
    const mensajes = this._lector.empujar(bytes);
    if (this._lector.roto) {
      const { codigo, porque } = this._lector.roto;
      this.cerrar(codigo, porque);
      return;
    }
    for (const m of mensajes) {
      if (m.opcode === OPCODE.ping) { this._marco(m.datos, OPCODE.pong); continue; }
      if (m.opcode === OPCODE.pong) { this._avisar("pong", m.datos); continue; }
      if (m.opcode === OPCODE.cierre) {
        const { codigo, motivo } = leerCierre(m.datos);
        // El cierre se devuelve antes de colgar: el otro lado está esperando su
        // eco para saber que no se ha perdido nada por el camino (§5.5.1).
        this._marco(cuerpoDeCierre(codigo === 1005 ? 1000 : codigo, ""), OPCODE.cierre);
        this._fin(codigo, motivo);
        // Y se cuelga el teléfono. Sin esto el socket TCP se queda abierto para
        // siempre después de un cierre limpio: el juego no se entera —la
        // conexión ya está marcada como cerrada— pero el proceso no termina
        // nunca, y eso apareció como una prueba que pasaba y no salía.
        setTimeout(() => { try { this.socket.end(); this.socket.destroy(); } catch {} }, 20).unref?.();
        continue;
      }
      this._avisar("mensaje", m.opcode === OPCODE.texto ? m.datos.toString("utf8") : m.datos, m.opcode);
    }
  }

  _marco(carga, opcode) {
    if (!this.abierta) return false;
    const mascara = this.enmascarar ? randomBytes(4) : null;
    try { this.socket.write(enmarcar(carga, { opcode, mascara })); } catch { return false; }
    return true;
  }

  /** Manda un mensaje. Texto si es cadena, binario si es `Buffer`. */
  enviar(datos) {
    return this._marco(
      Buffer.isBuffer(datos) ? datos : Buffer.from(String(datos), "utf8"),
      Buffer.isBuffer(datos) ? OPCODE.binario : OPCODE.texto
    );
  }

  ping(carga = Buffer.alloc(0)) { return this._marco(carga, OPCODE.ping); }

  cerrar(codigo = 1000, motivo = "") {
    if (!this.abierta) return;
    this._marco(cuerpoDeCierre(codigo, motivo), OPCODE.cierre);
    this._fin(codigo, motivo);
    // Un `end()` inmediato se come el marco de cierre que acabamos de escribir
    // en más de una pila. Se le da un respiro y luego se cuelga de verdad.
    setTimeout(() => { try { this.socket.end(); } catch {} }, 20).unref?.();
  }

  _fin(codigo, motivo) {
    if (!this.abierta) return;
    this.abierta = false;
    this._avisar("cierre", { codigo, motivo });
  }
}

/**
 * El servidor.
 *
 * Se monta sobre un `http.Server` en vez de traer uno propio porque el mismo
 * puerto tiene que servir la lista de partidas por HTTP: un navegador que no
 * sabe a qué partida entrar no puede preguntarlo por un socket que todavía no
 * ha abierto.
 */
export class ServidorWebSocket {
  constructor(servidorHttp, { ruta = "/", maximo = MAX_MENSAJE } = {}) {
    this.http = servidorHttp;
    this.ruta = ruta;
    this.maximo = maximo;
    this.conexiones = new Set();
    this._oyentes = new Map();
    servidorHttp.on("upgrade", (pet, socket) => this._subir(pet, socket));
  }

  al(evento, fn) {
    if (!this._oyentes.has(evento)) this._oyentes.set(evento, new Set());
    this._oyentes.get(evento).add(fn);
    return () => this._oyentes.get(evento)?.delete(fn);
  }

  _subir(pet, socket) {
    const clave = pet.headers["sec-websocket-key"];
    const version = pet.headers["sec-websocket-version"];
    const arriba = String(pet.headers.upgrade ?? "").toLowerCase();
    // Las tres condiciones del §4.2.1, y la de la versión no es decorativa: un
    // cliente que pida la 8 (la de los borradores) espera otro apretón.
    if (arriba !== "websocket" || !clave || String(version) !== "13") {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const url = new URL(pet.url, "http://local");
    if (this.ruta !== "*" && url.pathname !== this.ruta) {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    socket.setNoDelay(true);   // sin Nagle: son mensajes pequeños y frecuentes
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${aceptacion(clave)}\r\n\r\n`
    );
    const c = new Conexion(socket, { enmascarar: false, maximo: this.maximo });
    this.conexiones.add(c);
    c.al("cierre", () => this.conexiones.delete(c));
    for (const fn of this._oyentes.get("conexion") ?? []) {
      try { fn(c, { url, cabeceras: pet.headers }); } catch (e) { console.error("oyente de 'conexion':", e); }
    }
  }
}

/** Levanta un servidor HTTP con su WebSocket encima. */
export function servir({ puerto = 0, ruta = "/", http: manejador = null } = {}) {
  const servidorHttp = createServer(manejador ?? ((_p, r) => { r.statusCode = 404; r.end(); }));
  const ws = new ServidorWebSocket(servidorHttp, { ruta });
  return new Promise((ok) => {
    servidorHttp.listen(puerto, "127.0.0.1", () => ok({ http: servidorHttp, ws, puerto: servidorHttp.address().port }));
  });
}

/**
 * El cliente de Node.
 *
 * Devuelve una promesa que se cumple cuando el apretón está hecho y comprobado:
 * **la aceptación se verifica**. No verificarla es lo que deja pasar un
 * servidor que no ha entendido nada y responde 101 por costumbre, y entonces el
 * fallo aparece cuatro capas más arriba, como un mensaje que nunca llega.
 */
export function conectar(url, { maximo = MAX_MENSAJE, espera = 5000 } = {}) {
  const u = new URL(url);
  const clave = randomBytes(16).toString("base64");
  return new Promise((ok, mal) => {
    const socket = connect({ host: u.hostname, port: Number(u.port || 80) }, () => {
      socket.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
        `Host: ${u.host}\r\n` +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Key: ${clave}\r\n` +
        "Sec-WebSocket-Version: 13\r\n\r\n"
      );
    });
    socket.setNoDelay(true);
    const reloj = setTimeout(() => { socket.destroy(); mal(new Error(`el apretón con ${url} no contestó en ${espera} ms`)); }, espera);
    let cabecera = Buffer.alloc(0);
    const leerCabecera = (bytes) => {
      cabecera = Buffer.concat([cabecera, bytes]);
      const corte = cabecera.indexOf("\r\n\r\n");
      if (corte < 0) {
        // Una cabecera que no acaba nunca es otra forma de agotar la memoria.
        if (cabecera.length > 8192) { clearTimeout(reloj); socket.destroy(); mal(new Error("cabecera de respuesta sin fin")); }
        return;
      }
      clearTimeout(reloj);
      socket.off("data", leerCabecera);
      const texto = cabecera.subarray(0, corte).toString("latin1");
      const resto = cabecera.subarray(corte + 4);
      if (!/^HTTP\/1\.1 101/.test(texto)) {
        socket.destroy();
        mal(new Error(`el servidor no cambió de protocolo: ${texto.split("\r\n")[0]}`));
        return;
      }
      const dada = /sec-websocket-accept:\s*(\S+)/i.exec(texto)?.[1];
      if (dada !== aceptacion(clave)) {
        socket.destroy();
        mal(new Error("la aceptación no cuadra con la clave enviada"));
        return;
      }
      const c = new Conexion(socket, { enmascarar: true, maximo });
      // Lo que venga pegado a la cabecera ya son marcos, y perderlo es perder
      // el primer mensaje del servidor — que es justo el que dice quién eres.
      if (resto.length) c._entra(resto);
      ok(c);
    };
    socket.on("data", leerCabecera);
    socket.on("error", (e) => { clearTimeout(reloj); mal(e); });
  });
}
