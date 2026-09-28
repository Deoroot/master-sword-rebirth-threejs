// EL MARCO DE UN WEBSOCKET, escrito aquí. RFC 6455 §5.
//
// ── Por qué esto no es una dependencia ─────────────────────────────────────
//
// Es la misma regla con la que se leyó el `.bsp`, el `.mdl` y el `.spr`: **se
// escribe el lector**. Un marco de WebSocket son dos bytes de cabecera, un
// largo de tres tamaños y un XOR de cuatro bytes; el trabajo entero cabe en
// este archivo y a cambio se puede comprobar byte a byte.
//
// Y hay una razón mejor: **el RFC trae sus propios vectores de prueba** (§5.7).
// Un «Hello» sin máscara es `81 05 48 65 6c 6c 6f` y con máscara es
// `81 85 37 fa 21 3d 7f 9f 4d 51 58`, escritos por quien definió el formato.
// Eso es un oráculo ajeno, que es lo que este proyecto lleva pidiendo desde el
// 02 — y el segundo oráculo es todavía mejor: **el navegador**. Si nuestro
// marco está mal, Chrome cierra la conexión y la sonda se entera.
//
// ── Las dos reglas que no son opcionales ───────────────────────────────────
//
// El RFC no las deja a gusto de nadie y las dos cambian el código:
//
//   §5.1  «The server MUST NOT mask any frames that it sends to the client.»
//   §5.1  «A client MUST mask all frames that it sends to the server», y un
//         servidor que recibe uno sin máscara **tiene que cerrar**.
//
// O sea que la máscara no es cifrado ni sirve de nada contra nadie: está para
// que un proxy antiguo no pueda leer un marco como si fuera una petición HTTP.
// Se copia porque si no se copia, el navegador no habla.

import { createHash } from "node:crypto";

/**
 * El GUID del apretón de manos. RFC 6455 §1.3, y es literal:
 *
 *     Sec-WebSocket-Accept = base64(sha1(clave + GUID))
 *
 * No hay nada que elegir: es esa cadena, en mayúsculas, con esos guiones.
 */
export const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Los códigos de operación del §5.2. Los que no están aquí están reservados. */
export const OPCODE = Object.freeze({
  continuacion: 0x0,
  texto: 0x1,
  binario: 0x2,
  cierre: 0x8,
  ping: 0x9,
  pong: 0xa,
});

/** Un opcode de control es del 8 al 15, y no se puede fragmentar (§5.5). */
export const esControl = (opcode) => opcode >= 0x8;

/**
 * El tope de un mensaje, que es NUESTRO y no del RFC.
 *
 * El formato deja un largo de 63 bits, o sea que sin tope un cliente
 * malintencionado anuncia ocho exabytes y el servidor reserva memoria hasta
 * caerse. Un mensaje de esta partida son unos cientos de bytes; un mega es tres
 * órdenes de magnitud de margen y sigue siendo un tope.
 */
export const MAX_MENSAJE = 1 << 20;

/** `Sec-WebSocket-Accept` a partir de `Sec-WebSocket-Key`. */
export function aceptacion(clave) {
  return createHash("sha1").update(String(clave) + GUID).digest("base64");
}

/**
 * Empaqueta una carga en un marco.
 *
 * `mascara` es un `Buffer` de cuatro bytes o `null`. El servidor pasa `null`
 * SIEMPRE —lo dice el §5.1— y el cliente pasa cuatro bytes al azar.
 */
export function enmarcar(carga, { opcode = OPCODE.texto, mascara = null, fin = true } = {}) {
  const datos = Buffer.isBuffer(carga) ? carga : Buffer.from(String(carga), "utf8");
  const n = datos.length;
  // El largo va en uno, tres o nueve bytes: hasta 125 cabe en el propio byte;
  // hasta 65 535 se marca con 126 y van dos más; por encima, 127 y ocho más.
  // Y hay una trampa: el 126 y el 127 no son largos, son banderas. Un mensaje
  // de 126 bytes NO se puede escribir con el byte corto.
  const corto = n < 126 ? n : n < 0x10000 ? 126 : 127;
  const extra = corto === 126 ? 2 : corto === 127 ? 8 : 0;
  const cabeza = Buffer.alloc(2 + extra + (mascara ? 4 : 0));
  cabeza[0] = (fin ? 0x80 : 0) | (opcode & 0x0f);
  cabeza[1] = (mascara ? 0x80 : 0) | corto;
  if (corto === 126) cabeza.writeUInt16BE(n, 2);
  // Ocho bytes con el bit más alto a cero: `writeBigUInt64BE` y no dos enteros
  // de 32, porque un mensaje de más de 4 GiB no existe pero el campo sí.
  else if (corto === 127) cabeza.writeBigUInt64BE(BigInt(n), 2);
  if (!mascara) return Buffer.concat([cabeza, datos]);
  mascara.copy(cabeza, 2 + extra);
  return Buffer.concat([cabeza, aplicarMascara(datos, mascara)]);
}

/**
 * El XOR de la máscara, que es su propia inversa: enmascarar y desenmascarar
 * son la misma función. §5.3.
 *
 *     j = i MOD 4
 *     transformed[i] = original[i] XOR masking-key[j]
 */
export function aplicarMascara(datos, mascara) {
  const salida = Buffer.allocUnsafe(datos.length);
  for (let i = 0; i < datos.length; i++) salida[i] = datos[i] ^ mascara[i & 3];
  return salida;
}

/**
 * El lector incremental.
 *
 * Incremental porque un socket TCP no entrega mensajes: entrega bytes cuando le
 * parece. Un marco puede llegar partido en cinco trozos y dos marcos pueden
 * llegar en el mismo trozo — **y eso no es un caso raro, es el caso normal en
 * cuanto hay tráfico**. Un lector que suponga «un `data` es un marco» funciona
 * en la máquina del que lo escribe y se rompe en la red de otro.
 *
 * `empujar()` devuelve los mensajes ya completos. Los de control salen enteros
 * y sin juntar; los de datos se juntan hasta el marco con FIN.
 */
export class Desenmarcador {
  /**
   * @param {{maximo?: number, exigirMascara?: boolean}} opciones
   *   `exigirMascara` lo pone el servidor: un marco de cliente sin máscara es
   *   un error de protocolo y hay que cerrar con 1002, no seguir hablando.
   */
  constructor({ maximo = MAX_MENSAJE, exigirMascara = false } = {}) {
    this.maximo = maximo;
    this.exigirMascara = exigirMascara;
    this.resto = Buffer.alloc(0);
    /** Los trozos del mensaje de datos a medio llegar. */
    this.trozos = [];
    this.largoJuntado = 0;
    this.opcodeJuntado = null;
    /** Si algo se rompió: `{ codigo, porque }`. Quien lo use tiene que cerrar. */
    this.roto = null;
  }

  _romper(codigo, porque) {
    this.roto = { codigo, porque };
    return [];
  }

  /**
   * Mete bytes y saca los mensajes que hayan quedado completos.
   *
   * @returns {Array<{opcode: number, datos: Buffer}>}
   */
  empujar(bytes) {
    if (this.roto) return [];
    this.resto = this.resto.length ? Buffer.concat([this.resto, bytes]) : Buffer.from(bytes);
    const salida = [];
    for (;;) {
      const b = this.resto;
      if (b.length < 2) break;
      const fin = (b[0] & 0x80) !== 0;
      const reservados = b[0] & 0x70;
      const opcode = b[0] & 0x0f;
      const enmascarado = (b[1] & 0x80) !== 0;
      let largo = b[1] & 0x7f;
      let off = 2;

      // Los tres bits reservados van a cero mientras no se negocie una
      // extensión, y aquí no se negocia ninguna: `permessage-deflate` no se
      // pide en el apretón, así que si vienen a uno es que alguien habla otro
      // idioma y es mejor cerrar que interpretar.
      if (reservados) return this._romper(1002, "bits reservados a uno sin extensión");
      if (this.exigirMascara && !enmascarado) return this._romper(1002, "marco de cliente sin máscara");

      if (largo === 126) {
        if (b.length < off + 2) break;
        largo = b.readUInt16BE(off);
        off += 2;
      } else if (largo === 127) {
        if (b.length < off + 8) break;
        const grande = b.readBigUInt64BE(off);
        if (grande > BigInt(this.maximo)) return this._romper(1009, `marco de ${grande} bytes`);
        largo = Number(grande);
        off += 8;
      }
      if (largo > this.maximo) return this._romper(1009, `marco de ${largo} bytes`);

      let mascara = null;
      if (enmascarado) {
        if (b.length < off + 4) break;
        mascara = b.subarray(off, off + 4);
        off += 4;
      }
      // Todavía no ha llegado entero: se deja el resto tal cual y se espera.
      if (b.length < off + largo) break;

      let carga = b.subarray(off, off + largo);
      if (mascara) carga = aplicarMascara(carga, mascara);
      else carga = Buffer.from(carga);
      this.resto = b.subarray(off + largo);

      if (esControl(opcode)) {
        // §5.5: «All control frames MUST have a payload length of 125 bytes or
        // less and MUST NOT be fragmented.» Las dos cosas, y las dos se
        // comprueban: un ping fragmentado es un error, no un ping a medias.
        if (largo > 125) return this._romper(1002, "marco de control de más de 125 bytes");
        if (!fin) return this._romper(1002, "marco de control fragmentado");
        salida.push({ opcode, datos: carga });
        continue;
      }

      // Y el orden de la fragmentación, que es lo que más se hace mal: el
      // primer marco lleva el opcode y los siguientes llevan CERO. Un segundo
      // marco con opcode de texto no continúa nada: es otro mensaje empezado
      // encima del anterior, y eso es un error de protocolo.
      if (opcode === OPCODE.continuacion) {
        if (this.opcodeJuntado === null) return this._romper(1002, "continuación sin nada que continuar");
      } else {
        if (this.opcodeJuntado !== null) return this._romper(1002, "mensaje nuevo sobre uno a medias");
        this.opcodeJuntado = opcode;
      }
      this.largoJuntado += carga.length;
      if (this.largoJuntado > this.maximo) return this._romper(1009, `mensaje de ${this.largoJuntado} bytes`);
      this.trozos.push(carga);
      if (!fin) continue;
      salida.push({
        opcode: this.opcodeJuntado,
        datos: this.trozos.length === 1 ? this.trozos[0] : Buffer.concat(this.trozos),
      });
      this.trozos = [];
      this.largoJuntado = 0;
      this.opcodeJuntado = null;
    }
    return salida;
  }
}

/**
 * El cuerpo de un marco de cierre: dos bytes de código y un motivo en UTF-8.
 *
 * El motivo cabe en 123 bytes, no en 125: los dos primeros son el código. Se
 * recorta aquí porque un cierre que no se puede enviar por pasarse de largo
 * deja la conexión colgada, que es exactamente lo que el cierre venía a evitar.
 */
export function cuerpoDeCierre(codigo = 1000, motivo = "") {
  const texto = Buffer.from(String(motivo), "utf8").subarray(0, 123);
  const b = Buffer.alloc(2 + texto.length);
  b.writeUInt16BE(codigo, 0);
  texto.copy(b, 2);
  return b;
}

/** Lo contrario: leer el código y el motivo de un marco de cierre. */
export function leerCierre(datos) {
  if (!datos || datos.length < 2) return { codigo: 1005, motivo: "" };
  return { codigo: datos.readUInt16BE(0), motivo: datos.subarray(2).toString("utf8") };
}
