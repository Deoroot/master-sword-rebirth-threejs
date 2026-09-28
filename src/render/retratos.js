// LOS RETRATOS: personajes de verdad, en tres dimensiones, dentro de un panel.
//
// En Master Sword la pantalla de elegir personaje no enseña tres dibujos: enseña
// **tres modelos** puestos en el mundo, con su animación y su caja de aparición.
//
//     class CRenderChar : public CRenderPlayer
//     enum rendercharstate_e { RCS_IDLE, RCS_FIDGET, RCS_HIGHLIGHT, RCS_INACTIVE }
//     class CRenderSpawnbox : public CRenderEntity
//                                     vgui_choosecharacter.h:29-75
//
// Esto estaba escrito y funcionaba desde el experimento 14, pero vivía **dentro
// del cierre de `src/juego/interfaz.js`**: una función `retrato()` que sólo
// existía mientras existiera esa pantalla. Los paneles de VGUI la necesitan y no
// pueden importarla de allí, así que sale aquí, que es donde le tocaba —
// `src/render/`, junto a `cuerpo.js`, que es de quien depende.
//
// No hay ninguna regla nueva. Es el mismo código, con el estado que estaba
// suelto en el cierre —el visor, las ranuras vivas, el latido— dentro de un
// objeto.
//
// ── El latido, que es lo único con truco ──────────────────────────────────
//
// Un `requestAnimationFrame` que sólo corre **mientras haya un retrato en
// pantalla**. Sin esa condición la pestaña gasta batería dibujando nada en
// cuanto alguien abre una vez la pantalla de personajes; con ella, al cerrar la
// pantalla el bucle se para solo.

/**
 * Los retratos de una página. Uno por página, no uno por retrato: el visor de
 * `cuerpo.js` comparte la escena y las mallas entre todas las ranuras.
 */
export class Retratos {
  /**
   * @param cuerpos  lo que devuelve `cargarCuerpos()`, o una promesa suya, o
   *                 `null` — que es lo que pasa si los modelos no están
   *                 horneados, y entonces esto no enseña nada y no rompe nada.
   */
  constructor(cuerpos = null) {
    this.cuerpos = cuerpos;
    this.visor = null;
    this.vivas = new Set();
    this._latiendo = 0;
    this._ultimo = 0;
  }

  /** Cuántos retratos hay dibujándose ahora mismo. */
  get cuantos() { return this.vivas.size; }

  _latir(ahora) {
    const dt = Math.min((ahora - this._ultimo) / 1000, 0.1);
    this._ultimo = ahora;
    if (!this.vivas.size) { this._latiendo = 0; return; }
    this.visor?.animar(dt);
    this._latiendo = requestAnimationFrame((t) => this._latir(t));
  }

  _arrancar() {
    if (this._latiendo) return;
    this._ultimo = performance.now();
    this._latiendo = requestAnimationFrame((t) => this._latir(t));
  }

  /**
   * Monta un retrato en un `canvas` que ya esté en la página.
   *
   * El tamaño en píxeles se toma del sitio que la hoja de estilo le haya dado y
   * no de un número escrito aquí: si no, cambiar el CSS deja el retrato con la
   * resolución de otra caja y se ve borroso sin más pista.
   *
   * @param caja  el elemento que da el tamaño. El `canvas` va dentro.
   */
  montar(caja, lienzo, opciones = {}) {
    if (!this.cuerpos) return null;
    return Promise.resolve(this.cuerpos).then((c) => {
      if (!c || !caja.isConnected) return null;
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const r = caja.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      lienzo.width = Math.round(r.width * dpr);
      lienzo.height = Math.round(r.height * dpr);
      this.visor ??= c.visor();
      const ranura = this.visor.ranura(lienzo, opciones);
      ranura.reposo(opciones.animacion ?? "sinArma");
      this.vivas.add(ranura);
      this._arrancar();
      if (opciones.alPasar !== false) {
        // Lo que hace `CRenderChar` cuando le pasas el ratón por encima:
        // `reg.hud.char.highlight`, que en `global.script` es `jump`.
        const padre = opciones.senalaCon ?? caja;
        padre.addEventListener("pointerenter", () => ranura.senalar(true));
        padre.addEventListener("pointerleave", () => ranura.senalar(false));
      }
      return ranura;
    });
  }

  /** Suelta todos los retratos. Se llama al cambiar de pantalla. */
  soltar() {
    for (const r of this.vivas) r.quitar();
    this.vivas = new Set();
  }

  /** Un paso de animación a mano, para las sondas. */
  animar(dt) { if (this.vivas.size) this.visor?.animar(dt); }
}
