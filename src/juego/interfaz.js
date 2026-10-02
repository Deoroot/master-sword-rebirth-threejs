// La INTERFAZ del personaje: elegir, crear, la hoja, el inventario y la muerte.
//
// Se monta entera desde JavaScript y no toca `index.html`, que sigue siendo el
// cascarón de la sonda 03. Así esto se puede llevar a otra página sin arrastrar
// nada, y el visor del mapa no se entera de que existe.
//
// Teclas: `C` la hoja, `I` el inventario, `Esc` cierra.
//
// ── Lo que cambia al colgarla de la SESIÓN ────────────────────────────────
//
// Antes esto se abría con la `C` «porque sí». Ahora las pantallas las manda el
// estado de la sesión: ELIGIENDO enseña la lista y no se puede cerrar, MUERTO
// enseña la pantalla de muerte y tampoco. Ése era el diagnóstico de
// PROYECTO_10 §1 — «la hoja de personaje no cuelga de nada»— y esto es lo que
// lo cierra.

import { ATRIBUTOS, PROPIEDADES, ESCUELAS, expNecesaria, propiedadesDe, aporteDe } from "./stats.js";
import { resumen } from "./personaje.js";
import { exportar, importar } from "./almacen.js";
import { carga } from "./inventario.js";
import { ESTADO, IMPUESTO_DE_MUERTE } from "./sesion.js";
import { ACCIONES, nombreDeTecla } from "./teclas.js";
import { enLaCascara } from "./navegador.js";
import { variablesCss } from "./paleta.js";
import { Retratos } from "../render/retratos.js";

// LOS COLORES SON LOS DE MASTER SWORD, leídos de su cliente. Ver
// `src/juego/paleta.js`: salmón de título, tres niveles de gris para el texto,
// amarillo para el oro, rojo para lo elegido, verde para «tu personaje».
//
// Lo que cambia respecto al original es UNA cosa, y es la que se puede medir:
// **el panel tiene fondo**. En Master Sword no lo tiene —`setBgColor(0,0,0,255)`
// con el alfa de VGUI al revés es invisible— y por eso en su propia captura
// «Heavy Weapon Holster» compite con la piedra de la cueva. El color no cambia;
// cambia que se lea igual mire uno donde mire.
const CSS = `
:root {
  ${variablesCss()}
}
.mx-velo { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: var(--ms-velo); z-index: 40; pointer-events: auto; overflow: auto; padding: 24px; }
.mx-panel { background: var(--ms-fondo); border: 1px solid var(--ms-linea); padding: 18px 20px;
  max-width: 900px; width: 100%; box-shadow: 0 10px 50px rgba(0,0,0,0.7); color: var(--ms-texto); }
.mx-panel h2 { margin: 0 0 4px; font-size: 17px; font-weight: 400; color: var(--ms-titulo); }
.mx-panel h3 { margin: 16px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--ms-apagado); font-weight: 400; }
.mx-sub { margin: 0 0 14px; color: var(--ms-subtitulo); font-size: 12px; line-height: 1.5; }
.mx-fila { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.mx-col2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
@media (max-width: 720px) { .mx-col2 { grid-template-columns: 1fr; } }
.mx-boton { background: rgba(255,255,255,0.05); color: var(--ms-claro); border: 1px solid var(--ms-linea-tenue);
  padding: 7px 13px; font: inherit; cursor: pointer; }
.mx-boton:hover { border-color: var(--ms-titulo); color: var(--ms-titulo); }
.mx-boton[disabled] { opacity: .4; cursor: default; }
.mx-boton.mx-peligro:hover { border-color: var(--ms-malo); color: var(--ms-malo); }
.mx-input { background: rgba(0,0,0,0.6); color: var(--ms-claro); border: 1px solid var(--ms-linea-tenue);
  padding: 7px 9px; font: inherit; min-width: 200px; }
.mx-input:focus { outline: none; border-color: var(--ms-titulo); }
.mx-lista { list-style: none; margin: 0; padding: 0; }
.mx-lista li { display: flex; gap: 10px; align-items: center; justify-content: space-between;
  padding: 7px 9px; border: 1px solid var(--ms-linea-tenue); margin-bottom: 6px; }
.mx-lista .mx-nombre { color: var(--ms-si); }
.mx-lista .mx-cuando { color: var(--ms-tenue); font-size: 11px; }
.mx-armas { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 8px; }
.mx-arma { text-align: left; line-height: 1.45; }
.mx-arma b { color: var(--ms-claro); font-weight: 400; }
.mx-arma.mx-elegida { border-color: var(--ms-elegido); color: var(--ms-elegido); }
.mx-arma.mx-elegida b { color: var(--ms-elegido); }
.mx-arma small { color: var(--ms-tenue); display: block; font-size: 11px; }
.mx-stat { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; align-items: center;
  font-variant-numeric: tabular-nums; }
.mx-stat .mx-n { color: var(--ms-claro); }
.mx-hab { border: 1px solid var(--ms-linea-tenue); padding: 7px 9px; margin-bottom: 6px; }
.mx-hab > div:first-child { display: flex; justify-content: space-between; margin-bottom: 4px; }
.mx-prop { display: grid; grid-template-columns: 90px 1fr 34px; gap: 8px; align-items: center;
  font-size: 11px; color: var(--ms-tenue); margin-top: 3px; }
.mx-barra { height: 5px; background: rgba(255,255,255,0.10); position: relative; }
.mx-barra i { position: absolute; inset: 0 auto 0 0; background: var(--ms-titulo); display: block; }
.mx-rejilla { display: grid; gap: 2px; background: rgba(255,255,255,0.06); padding: 2px; position: relative; }
.mx-casilla { background: rgba(0,0,0,0.5); aspect-ratio: 1; }
.mx-obj { background: rgba(255,255,255,0.06); border: 1px solid var(--ms-linea); padding: 3px 4px;
  font-size: 10px; line-height: 1.2; overflow: hidden; cursor: default; }
.mx-obj b { color: var(--ms-claro); font-weight: 400; display: block; }
.mx-obj.mx-vestible { border-color: rgba(192,192,192,0.4); }
.mx-obj.mx-arma-i { border-color: rgba(255,100,100,0.5); }
.mx-oro { color: var(--ms-oro); }
.mx-aviso { color: var(--ms-malo); font-size: 12px; margin: 8px 0 0; }
.mx-nota { color: var(--ms-tenue); font-size: 11px; margin: 8px 0 0; line-height: 1.5; }
.mx-velo.mx-muerte { background: rgba(40, 0, 0, 0.6); }
.mx-muerte .mx-panel { border-color: rgba(255,0,0,0.45); max-width: 460px; text-align: center; }
.mx-muerte h2 { color: var(--ms-malo); font-size: 26px; letter-spacing: .04em; }
.mx-caido { color: var(--ms-claro); font-size: 14px; margin: 2px 0 14px; }
.mx-cargando { color: var(--ms-subtitulo); font-size: 12px; margin: 10px 0 0; }
.mx-guardado { display: flex; gap: 10px; align-items: center; margin: 0 0 14px;
  font-size: 12px; border: 1px solid var(--ms-linea-tenue); padding: 6px 9px; }
.mx-guardado > span { flex: 1; }
.mx-guardado .mx-si { color: var(--ms-si); }
.mx-guardado .mx-aviso-linea { color: var(--ms-oro); }
.mx-guardado .mx-boton { padding: 4px 9px; font-size: 12px; }
.mx-tecla { display: grid; grid-template-columns: 1fr auto 150px 34px; gap: 8px; align-items: center;
  padding: 4px 0; border-bottom: 1px solid rgba(239,226,194,0.08); }
.mx-tecla .mx-boton { padding: 4px 8px; }
/* EL RETRATO. Sin fondo ni marco propios: el modelo se recorta sobre el negro
   del panel, que es lo que hace el original —la figura está en el mundo, no en
   una caja— y lo que evita meterle al panel un rectángulo dentro de otro. */
.mx-retrato { display: block; width: 100%; height: 100%; }
.mx-caja-retrato { position: relative; flex: 0 0 auto; }
.mx-tarjeta { display: flex; gap: 12px; align-items: stretch; }
.mx-tarjeta > .mx-caja-retrato { width: 74px; height: 104px; }
.mx-tarjeta .mx-datos { flex: 1; display: flex; gap: 10px; align-items: center;
  justify-content: space-between; flex-wrap: wrap; }
.mx-crear { display: grid; grid-template-columns: 200px 1fr; gap: 18px; align-items: start; }
.mx-crear > .mx-caja-retrato { width: 200px; height: 280px; }
@media (max-width: 720px) { .mx-crear { grid-template-columns: 1fr; }
  .mx-crear > .mx-caja-retrato { width: 100%; height: 220px; } }
/* En el inventario el personaje va ARRIBA Y AL CENTRO y la rejilla debajo, que
   es como se pidió y como está el panel del juego. */
.mx-inv-cuerpo { display: flex; justify-content: center; margin: 0 0 12px; }
.mx-inv-cuerpo .mx-caja-retrato { width: 150px; height: 230px; }
/* LA HOJA: tres columnas — el personaje con sus números, la lista de
   habilidades, y el detalle de la elegida. Sólo se despliega una. */
.mx-hoja { display: grid; grid-template-columns: 190px 1fr 1fr; gap: 18px; align-items: start; }
.mx-hoja > div:first-child .mx-caja-retrato { width: 190px; height: 250px; margin: 0 0 4px; }
.mx-hoja h3:first-child { margin-top: 0; }
@media (max-width: 860px) { .mx-hoja { grid-template-columns: 1fr; }
  .mx-hoja > div:first-child .mx-caja-retrato { width: 100%; height: 220px; } }
/* text-align a la izquierda, explícito: un button centra su contenido, y una
   lista de nueve nombres centrados no se puede recorrer con la vista.
   (Sin comillas invertidas aquí dentro: esto vive en una plantilla de texto y
   una comilla invertida la cierra a media hoja de estilo.) */
.mx-hab-fila { display: grid; grid-template-columns: 1fr 56px 30px; gap: 9px; align-items: center;
  width: 100%; margin-bottom: 4px; padding: 6px 9px; text-align: left; }
.mx-hab-fila .mx-n { text-align: right; }
.mx-detalle { border: 1px solid var(--ms-linea); padding: 12px 14px; }
.mx-detalle-cab { display: flex; justify-content: space-between; align-items: baseline;
  color: var(--ms-titulo); border-bottom: 1px solid var(--ms-linea); padding-bottom: 6px; margin-bottom: 10px; }
.mx-detalle-cab .mx-n { color: var(--ms-claro); font-size: 17px; }
.mx-detalle .mx-prop { grid-template-columns: 1fr 1fr 30px; margin-top: 8px; }
.mx-falta { color: var(--ms-tenue); font-size: 10px; margin: 1px 0 0; }
.mx-aporta { display: grid; grid-template-columns: 1fr 1fr 44px; gap: 5px 9px; align-items: center;
  font-size: 11px; color: var(--ms-tenue); }
`;

function el(tag, props = {}, hijos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "clase") n.className = v;
    else if (k === "texto") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const h of [].concat(hijos)) if (h) n.appendChild(h);
  return n;
}

const barra = (f) => el("div", { clase: "mx-barra" }, [
  el("i", { style: `width:${Math.max(0, Math.min(1, f)) * 100}%` }),
]);

/**
 * Los grupos de habilidades, y **son nuestros**.
 *
 * `SkillStatList[9]` es una lista PLANA: el motor no las agrupa. Agruparlas es
 * una decisión de interfaz para que nueve filas se lean como tres cosas, y se
 * dice en la propia pantalla en vez de dejar que parezca del juego.
 *
 * El criterio no es gratuito: sale de las propiedades que el motor SÍ les da.
 * Las seis de cuerpo a cuerpo y arquería tienen las tres de `SkillTypeList`,
 * `spellcasting` tiene las cinco escuelas y `parry` tiene una sola. O sea que
 * los tres grupos son los tres tipos de propiedad que existen.
 */
const GRUPOS = [
  { nombre: "Weapons", porQue: "Our grouping: SkillStatList[9] is flat. These six share the three properties of SkillTypeList — Proficiency, Balance and Power.",
    claves: ["swordsmanship", "martialarts", "smallarms", "axehandling", "bluntarms", "polearms", "archery"] },
  { nombre: "Magic", porQue: "Our grouping. Spell Casting is the only one with the five schools of SpellTypeList instead of the three weapon properties.",
    claves: ["spellcasting"] },
  { nombre: "Defence", porQue: "Our grouping. Parry is the only one with a SINGLE property, and the only one that feeds no attribute.",
    claves: ["parry"] },
];

/**
 * Monta la interfaz.
 *
 * `catalogo` es `build/msr/objetos.json`. Si no está, la interfaz sigue
 * funcionando con los identificadores a pelo — un personaje no depende del
 * catálogo para existir, y esa separación es a propósito.
 */
export function montarInterfaz({ sesion, catalogo = null, teclas = null, cuerpos = null,
                                 raiz = document.body, panelDePersonajes = null,
                                 panelDeInventario = null, panelDeHoja = null,
                                 // La ventana «Options» de VGUI2 (experimento
                                 // 34). Mismo trato que las tres de arriba: si
                                 // existe, la pantalla suplente de aquí no sale.
                                 panelDeOpciones = null }) {
  if (!sesion) throw new Error("la interfaz cuelga de una sesión");
  const almacen = sesion.almacen;
  if (!document.getElementById("mx-css")) {
    raiz.appendChild(el("style", { id: "mx-css", texto: CSS }));
  }
  const porId = new Map((catalogo?.objetos ?? []).map((o) => [o.id, o]));
  const nuevoPersonaje = catalogo?.nuevoPersonaje ?? { oro: 10, gratis: [], armas: [] };
  const ficha = (id) => porId.get(id) ?? { id, nombre: id, peso: 0, tamano: 1, tipo: "trasto" };

  // --- EL RETRATO DEL PERSONAJE -------------------------------------------
  //
  // `cuerpos` llega como PROMESA y eso no es un detalle de estilo: la pantalla
  // de personajes sale a los 231 ms y el modelo pesa un mega. Esperarlo aquí
  // devolvería la pantalla al segundo y medio, que es justo lo que se quitó al
  // cargar el mapa después de elegir. Así que el hueco se abre vacío y la figura
  // entra cuando llegue.
  // LA MAQUINARIA DE LOS RETRATOS VIVE EN `src/render/retratos.js` desde el
  // experimento 29. Estaba aquí dentro, en el cierre, y los paneles de VGUI la
  // necesitan: la pantalla de crear personaje del original son TRES MODELOS en
  // el mundo (`CRenderChar`, vgui_choosecharacter.h:29), no tres dibujos.
  //
  // Lo que se conserva de lo que estaba escrito aquí, porque sigue siendo el
  // motivo de que el reloj de los retratos sea suyo y no el del mapa: el bucle
  // del mapa arranca cuando el mapa termina de cargar —1,7 s— y esta pantalla
  // sale a los 231 ms. Colgada de él, la figura se queda congelada justo durante
  // el rato en el que es lo único que hay en pantalla.
  const retratos = new Retratos(cuerpos);

  /**
   * Pone un retrato en una caja. Devuelve la caja, ya en el árbol.
   *
   * Las ranuras se sueltan al cambiar de pantalla: sin eso, cada vuelta a la
   * lista deja tres esqueletos y tres mezcladores animándose para un `canvas`
   * que ya no está en la página. No da error — da una pantalla que va cada vez
   * más despacio.
   */
  function retrato(opciones = {}) {
    const lienzo = el("canvas", { clase: "mx-retrato" });
    const caja = el("div", { clase: "mx-caja-retrato" }, [lienzo]);
    retratos.montar(caja, lienzo, opciones)?.then((r) => { if (r) caja._ranura = r; });
    return caja;
  }

  const soltarRetratos = () => retratos.soltar();

  let velo = null;
  // El personaje en juego lo tiene la sesión: aquí no se guarda una segunda
  // copia. Dos verdades y una envejece — es la misma regla que impide guardar
  // los atributos derivados.
  const activo = () => sesion.personaje;

  /**
   * Las pantallas que NO se pueden cerrar.
   *
   * Si el jugador puede cerrar la lista de personajes con Esc, se queda mirando
   * un mapa que no puede tocar y sin forma de volver. Y si puede cerrar la
   * pantalla de muerte, se queda muerto andando.
   */
  const obligatoria = () => sesion.estado === ESTADO.ELIGIENDO ||
    sesion.estado === ESTADO.MUERTO || sesion.estado === ESTADO.MURIENDO;

  const cerrar = ({ aunqueSeaObligatoria = false } = {}) => {
    if (obligatoria() && !aunqueSeaObligatoria) return false;
    soltarRetratos();
    velo?.remove(); velo = null;
    return true;
  };
  const abrir = (nodo, clase = "") => {
    soltarRetratos();
    velo?.remove(); velo = null;
    velo = el("div", { clase: `mx-velo${clase ? ` ${clase}` : ""}` }, [nodo]);
    velo.addEventListener("click", (e) => { if (e.target === velo) cerrar(); });
    raiz.appendChild(velo);
  };

  // --- elegir personaje ----------------------------------------------------
  //
  // DESDE EL EXPERIMENTO 30 ESTO NO ES LO QUE SE VE. La pantalla de personajes
  // es un panel de VGUI portado (`src/vgui/personaje.js`) con sus tres etapas y
  // sus modelos, y `panelDePersonajes` es quien lo abre. Lo de aquí abajo se
  // conserva como suplente: si el panel no está montado —porque falta
  // `build/gatecity/`, o porque esto se carga fuera del juego— el jugador tiene
  // que poder elegir un personaje igual. Una pantalla obligatoria sin suplente
  // es una pantalla en la que te quedas encerrado.
  async function pantallaElegir() {
    // Y sólo si de verdad lo ha abierto: `panelDePersonajes` devuelve `false`
    // cuando el registro todavía no está, y entonces vale la suplente. Sin ese
    // `if` la pantalla obligatoria se quedaba sin salir NINGUNA.
    if (panelDePersonajes?.()) { cerrar(); return; }
    return pantallaElegirPropia();
  }

  async function pantallaElegirPropia() {
    const lista = await almacen.listar();
    const perm = await almacen.pedirPermanencia();
    const ul = el("ul", { clase: "mx-lista" });
    for (const c of lista) {
      const fila = el("li", { clase: "mx-tarjeta" });
      // El retrato del personaje, con SU género. `attention` es la postura de
      // quien no lleva nada en la mano, que es lo que pone el original al abrir
      // la pantalla (`reg.hud.char.active_noweap`).
      fila.appendChild(retrato({ genero: c.genero ?? "male", animacion: "sinArma", senalaCon: fila }));
      fila.appendChild(el("span", { clase: "mx-datos" }, [
        // En verde, que es `EnabledColor(0,255,0)` de `vgui_choosecharacter.cpp`
        // — el mismo verde de «Zeth / At Edana» en el juego. Y con el sitio
        // donde lo dejaste debajo, que también es del original.
        el("span", {}, [
          el("span", { clase: "mx-nombre", texto: c.nombre }),
          c.mapa ? el("small", { clase: "mx-cuando", texto: ` · en ${c.mapa}` }) : null,
        ]),
        el("span", { clase: "mx-fila" }, [
          el("span", { clase: "mx-cuando", texto: new Date(c.actualizado).toLocaleString() }),
          el("button", { clase: "mx-boton", texto: "play", onclick: async (ev) => {
            // Entrar es cosa de la sesión: ella decide si naces o vuelves,
            // espera a que el mapa esté cargado, y avisa al visor de dónde
            // ponerte. Puede tardar, así que se dice.
            const b = ev.currentTarget;
            b.disabled = true; b.textContent = "loading…";
            await sesion.entrar(c.id);
            cerrar({ aunqueSeaObligatoria: true });
          } }),
          el("button", { clase: "mx-boton", texto: "export", onclick: async () => {
            const r = await almacen.leer(c.id);
            descargar(`${c.nombre.replace(/[^\w]+/g, "_")}.json`, exportar(r.personaje));
          } }),
          el("button", { clase: "mx-boton mx-peligro", texto: "delete", onclick: async () => {
            await almacen.borrar(c.id);
            pantallaElegir();
          } }),
        ]),
      ]));
      ul.appendChild(fila);
    }
    // LA RANURA VACÍA, Y LA FIGURA SENTADA ES DEL JUEGO.
    //
    // `reg.hud.char.inactive` es `sitdown`, y es lo que `CRenderChar` pone en una
    // ranura sin personaje. No es adorno: dice de un vistazo que ahí no hay
    // nadie, y es la animación que el mod eligió para eso.
    {
      const nueva = el("li", { clase: "mx-tarjeta" });
      nueva.appendChild(retrato({ animacion: "inactivo", tic: false, senalaCon: nueva }));
      nueva.appendChild(el("span", { clase: "mx-datos" }, [
        el("span", {}, [
          el("span", { texto: lista.length ? "empty slot" : "no characters yet" }),
          lista.length ? null : el("small", { clase: "mx-cuando", texto: " · start here" }),
        ]),
        el("button", { clase: "mx-boton", texto: "new character", onclick: () => pantallaCrear() }),
      ]));
      ul.appendChild(nueva);
    }

    const importador = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    importador.addEventListener("change", async () => {
      const f = importador.files?.[0];
      if (!f) return;
      try {
        const { personaje } = importar(await f.text());
        await almacen.escribir(personaje);
        pantallaElegir();
      } catch (e) {
        alert(`could not import that: ${e.message}`);
      }
    });

    // EL AVISO DE ALMACENAMIENTO, EN UNA LÍNEA Y CON UN BOTÓN.
    //
    // Era un párrafo de cuatro renglones explicando que el navegador puede
    // borrarte el personaje. Un párrafo que nadie lee no avisa de nada, así
    // que el aviso se estaba saboteando solo. Una línea, un icono y un botón
    // que hace algo — porque `pedirPermanencia()` existe desde el primer día
    // en `almacen.js` y hasta ahora sólo se consultaba, nunca se ofrecía.
    const aviso = el("div", { clase: "mx-guardado" });
    const pintaAviso = (estado) => {
      aviso.replaceChildren();
      const bien = estado.concedido;
      aviso.appendChild(el("span", {
        clase: bien ? "mx-si" : "mx-aviso-linea",
        // Las mismas tres frases, contadas donde pasan. En la cáscara no hay
        // «borrar datos de navegación» que se los lleve, y el riesgo de que el
        // navegador los desaloje por falta de sitio tampoco es el suyo.
        texto: enLaCascara()
          ? (bien
            ? "✓ saved on this machine"
            : estado.soportado
              ? "⚠ saved only on this machine; keep an exported copy"
              : "⚠ cannot confirm this machine keeps them")
          : (bien
            ? "✓ protected in this browser"
            : estado.soportado
              ? "⚠ saved only in this browser; it may delete them"
              : "⚠ this browser cannot say whether it keeps them"),
        title: enLaCascara()
          ? "They live on this machine, in the game's own data folder. " +
            "Export keeps a copy somewhere else."
          : "They live in this browser and on this machine. \"Clear browsing data\" " +
            "takes them away, and the browser may evict them if it runs short of space.",
      }));
      if (!bien && estado.soportado) {
        aviso.appendChild(el("button", { clase: "mx-boton", texto: "protect", onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          pintaAviso(await almacen.pedirPermanencia());
        } }));
      }
      aviso.appendChild(el("button", { clase: "mx-boton", texto: "export all", onclick: async () => {
        for (const c of await almacen.listar()) {
          const r = await almacen.leer(c.id);
          if (r) descargar(`${c.nombre.replace(/[^\w]+/g, "_")}.json`, exportar(r.personaje));
        }
      } }));
    };
    pintaAviso(perm);

    abrir(el("div", { clase: "mx-panel" }, [
      el("h2", { texto: "Characters" }),
      aviso,
      ul,
      el("div", { clase: "mx-fila" }, [
        // «Personaje nuevo» ya está arriba, en la ranura libre. Tenerlo dos
        // veces es dos sitios donde mirar para lo mismo.
        el("button", { clase: "mx-boton", texto: "import from a file", onclick: () => importador.click() }),
        importador,
      ]),
    ]));
  }

  // --- crear ---------------------------------------------------------------
  function pantallaCrear() {
    let arma = nuevoPersonaje.armas[0] ?? null;
    let genero = "male";
    const nombre = el("input", { clase: "mx-input", placeholder: "name", maxlength: "31" });
    const aviso = el("p", { clase: "mx-aviso" });
    const armas = el("div", { clase: "mx-armas" });
    // La vista previa, y con `senalar` apagado: aquí el ratón va a estar
    // encima todo el rato eligiendo, y un personaje que salta sin parar mientras
    // escribes el nombre no informa de nada.
    const vista = retrato({ genero, animacion: "sinArma", alPasar: false });

    // EL GÉNERO, que hasta ahora se guardaba y no se preguntaba.
    //
    // `crearPersonaje` tiene el campo desde el primer día con `"male"` por
    // defecto, así que todos los personajes salían hombres sin que nadie lo
    // eligiera. El original lo pregunta en su propia etapa (`STG_CHOOSEGENDER`)
    // y lo aplica como submodelo: `SetBody(0..3, 1)` o `2`.
    const generos = el("div", { clase: "mx-fila" });
    const pintaGenero = () => {
      generos.replaceChildren();
      for (const [clave, texto] of [["male", "man"], ["female", "woman"]]) {
        generos.appendChild(el("button", {
          clase: `mx-boton${clave === genero ? " mx-elegida" : ""}`,
          texto,
          onclick: () => {
            genero = clave;
            pintaGenero();
            // La ranura cambia de malla y se queda con la animación puesta: no
            // se vuelve a montar el retrato, que perdería el fotograma y daría
            // un parpadeo al elegir.
            vista._ranura?.cambiarGenero(genero);
          },
        }));
      }
    };
    pintaGenero();

    const pinta = () => {
      armas.replaceChildren();
      for (const id of nuevoPersonaje.armas) {
        const f = ficha(id);
        const hab = f.arma?.habilidad ?? (f.tipo === "hechizo" ? "spellcasting" : "—");
        armas.appendChild(el("button", {
          clase: `mx-boton mx-arma${id === arma ? " mx-elegida" : ""}`,
          onclick: () => { arma = id; pinta(); },
        }, [
          el("b", { texto: f.nombre ?? id }),
          el("small", { texto: `${hab}${f.arma?.dano ? ` · ${f.arma.dano} damage` : ""}${f.arma?.tipoDano ? ` · ${f.arma.tipoDano}` : ""}` }),
        ]));
      }
    };
    pinta();

    abrir(el("div", { clase: "mx-panel" }, [
      el("h2", { texto: "New character" }),
      el("p", { clase: "mx-sub", html:
        `You start with <b>${nuevoPersonaje.oro} gold</b>, ` +
        `<b>${nuevoPersonaje.gratis.length} items</b> and <b>one weapon</b>, which is what ` +
        `<code>CreateChar()</code> gives you in Master Sword. You do not pick a race: the engine ` +
        `hardcodes \"Human\" and marks it <i>LEGACY</i>.<br>` +
        `And there are no points to spend: <b>the six attributes are derived from the nine skills</b>, ` +
        `so they rise on their own with whatever you use.` }),
      el("div", { clase: "mx-crear" }, [
        vista,
        el("div", {}, [
          el("h3", { texto: "Name" }),
          nombre,
          el("h3", { texto: "Who you are" }),
          generos,
          el("h3", { texto: "What you start with" }),
          armas,
        ]),
      ]),
      el("p", { clase: "mx-nota", texto:
        "An eighth skill is missing from the list, Martial Arts: in Master Sword, starting " +
        "with no weapon is how you pick it. That is not possible here yet." }),
      aviso,
      el("div", { clase: "mx-fila" }, [
        el("button", { clase: "mx-boton", texto: "create", onclick: async () => {
          try {
            await sesion.crear({ nombre: nombre.value, genero, arma });
            pantallaElegir();
          } catch (e) { aviso.textContent = e.message; }
        } }),
        el("button", { clase: "mx-boton", texto: "back", onclick: () => pantallaElegir() }),
      ]),
    ]));
    nombre.focus();
  }

  // --- la hoja de personaje ------------------------------------------------
  function pantallaHoja(p = activo()) {
    if (!p) return pantallaElegir();
    const r = resumen(p);
    const atr = el("div", { clase: "mx-stat" });
    for (const a of r.atributos) {
      atr.appendChild(el("span", { texto: a.nombre, title: a.que }));
      atr.appendChild(el("span", { clase: "mx-n", texto: String(a.valor) }));
    }
    // LAS FÓRMULAS VAN AL TOOLTIP, no al panel.
    //
    // Estaban impresas debajo en letra pequeña: «Las fórmulas son del motor:
    // MaxHP = 5 + (STR−1)·7…». Eso es una nota mía de cuando se averiguó, no
    // interfaz de juego — ningún juego le enseña al jugador sus fórmulas en la
    // hoja. Al `title`, donde sigue estando para quien la quiera y no le roba
    // sitio a nadie.
    const FORMULA = {
      Health: "MaxHP = 5 + (STR−1)·7 + (FIT−1)·7 + (WIS−1)·3   ·   playershared.cpp",
      Mana: "MaxMP = WIS·10",
      Stamina: "MaxStamina = 3 + FIT·2,5 + STR·1,0",
      Weight: "Volume = min(STR·25 + 25, 2000)",
    };
    const der = el("div", { clase: "mx-stat" });
    for (const [k, v] of [["Health", `${p.vida ?? r.derivadas.vidaMax} / ${r.derivadas.vidaMax}`],
      ["Mana", `${p.mana ?? r.derivadas.manaMax} / ${r.derivadas.manaMax}`],
      ["Stamina", r.derivadas.aguanteMax.toFixed(1)],
      ["Weight", `${carga(p.objetos.map((o) => ({ ...o, ficha: ficha(o.id) })), r.derivadas.carga).peso} / ${r.derivadas.carga}`],
      ["Gold", String(p.oro)]]) {
      der.appendChild(el("span", { texto: k, title: FORMULA[k] ?? null }));
      der.appendChild(el("span", { clase: k === "Gold" ? "mx-n mx-oro" : "mx-n", texto: v, title: FORMULA[k] ?? null }));
    }

    // MAESTRO-DETALLE: la lista entera, y abierta sólo la elegida.
    //
    // Antes se desplegaban las nueve habilidades con sus propiedades a la vez:
    // **27 barras en pantalla**, que es una lista para mirar y no para leer.
    // Ahora se ven los nueve valores de un vistazo y el detalle de UNA.
    let elegida = r.habilidades[0]?.clave ?? null;
    const habs = el("div");
    const detalle = el("div", { clase: "mx-detalle" });

    /** El nombre legible de una propiedad, sea de arma o escuela de magia. */
    const nombreProp = (clave) => PROPIEDADES.find((x) => x.clave === clave)?.nombre
      ?? ESCUELAS.find((x) => x.clave === clave)?.nombre ?? clave;

    const pintaDetalle = () => {
      detalle.replaceChildren();
      const h = r.habilidades.find((x) => x.clave === elegida);
      if (!h) return;
      detalle.appendChild(el("div", { clase: "mx-detalle-cab" }, [
        el("span", { texto: h.nombre }),
        el("span", { clase: "mx-n", texto: String(h.valor) }),
      ]));

      for (const prop of h.propiedades) {
        const falta = expNecesaria(prop.valor + 1);
        // `faltan N` ADEMÁS del porcentaje, que es lo único de esta pantalla
        // que es mejor que el original: MSR no te dice cuánto queda. Y la
        // experiencia es exponencial (`pow(1,248, v) · 4v`), así que el
        // porcentaje solo engaña — al subir de nivel, la misma barra al 50 %
        // vale cada vez más.
        const queda = Math.max(0, falta - prop.exp);
        detalle.appendChild(el("div", { clase: "mx-prop" }, [
          el("span", { texto: nombreProp(prop.clave), title: PROPIEDADES.find((x) => x.clave === prop.clave)?.que ?? null }),
          barra(falta > 0 ? prop.exp / falta : 0),
          el("span", { clase: "mx-n", style: "text-align:right", texto: String(prop.valor) }),
        ]));
        detalle.appendChild(el("div", { clase: "mx-falta", texto:
          falta > 0 ? `${Math.ceil(queda)} to go for ${prop.valor + 1}` : "the first point is free" }));
      }

      // QUÉ HACE CRECER, calculado de los pesos del motor y no de una tabla.
      const aporte = aporteDe(h.clave);
      detalle.appendChild(el("h3", { texto: "Training this raises", title:
        "The weights are those of CMSMonster::GetStat(). They are ordered by weight/divisor, " +
        "which is what actually pays: the divisor is not the number of terms." }));
      if (!aporte.length) {
        // Y esto es un dato del motor, no un hueco: `parry` no está en ninguna
        // de las siete medias de `GetStat()`.
        detalle.appendChild(el("p", { clase: "mx-nota", texto:
          "No attribute. Parry appears in none of the averages of GetStat(), " +
          "so it rises on its own and drags nothing with it." }));
      } else {
        const lista = el("div", { clase: "mx-aporta" });
        const tope = aporte[0].rinde;
        for (const a of aporte) {
          lista.appendChild(el("span", { texto: a.nombre, title: ATRIBUTOS.find((x) => x.clave === a.atributo)?.que ?? null }));
          lista.appendChild(barra(a.rinde / tope));
          lista.appendChild(el("span", { clase: "mx-cuando", style: "text-align:right",
            texto: `${String(a.peso).replace(".", ",")}/${a.divisor}` }));
        }
        detalle.appendChild(lista);
      }
    };

    const pintaHabilidades = () => {
      habs.replaceChildren();
      for (const g of GRUPOS) {
        const dentro = r.habilidades.filter((h) => g.claves.includes(h.clave));
        if (!dentro.length) continue;
        habs.appendChild(el("h3", { texto: g.nombre, title: g.porQue }));
        for (const h of dentro) {
          // El progreso de la habilidad es el de su propiedad más atrasada: es
          // lo que de verdad le falta para que el valor suba, porque el valor
          // es la MEDIA de las propiedades.
          const peor = h.propiedades.reduce((m, prop) => {
            const falta = expNecesaria(prop.valor + 1);
            const f = falta > 0 ? prop.exp / falta : 1;
            return Math.min(m, f);
          }, 1);
          habs.appendChild(el("button", {
            clase: `mx-boton mx-hab-fila${h.clave === elegida ? " mx-elegida" : ""}`,
            onclick: () => { elegida = h.clave; pintaHabilidades(); pintaDetalle(); },
          }, [
            el("span", { texto: h.nombre }),
            barra(peor),
            el("span", { clase: "mx-n", texto: String(h.valor) }),
          ]));
        }
      }
    };
    pintaHabilidades();
    pintaDetalle();

    abrir(el("div", { clase: "mx-panel" }, [
      el("h2", { texto: p.nombre }),
      el("p", { clase: "mx-sub", texto: "P sheet · I inventory · G options · Esc closes" }),
      el("div", { clase: "mx-hoja" }, [
        el("div", {}, [
          // El personaje, el mismo modelo que en la tarjeta y el inventario.
          retrato({
            genero: p.genero ?? "male",
            animacion: (p.manos.derecha || p.manos.izquierda) ? "conArma" : "sinArma",
          }),
          el("h3", { texto: "Attributes", title: "Derived from the nine skills, not spent: in Master Sword you raise swordsmanship and your strength goes up" }),
          atr,
          el("h3", { texto: "Status" }),
          der,
        ]),
        el("div", {}, [
          el("h3", { texto: "Skills", title: "The bar is how far its most backward property still has to go" }),
          habs,
        ]),
        detalle,
      ]),
      // Lo nuestro, dicho en la pantalla y no sólo en un comentario.
      el("p", { clase: "mx-nota", texto:
        "The three skill groups are ours: in Master Sword the list is flat. " +
        "The criterion comes from their properties — weapons have three, magic five schools and Parry one." }),
      el("div", { clase: "mx-fila" }, [
        el("button", { clase: "mx-boton", texto: "inventory", onclick: () => pantallaInventario(p) }),
        el("button", { clase: "mx-boton", texto: "export", onclick: () => descargar(`${p.nombre.replace(/[^\w]+/g, "_")}.json`, exportar(p)) }),
        // Cambiar de personaje es SALIR: guarda a la fuerza y suelta el que
        // hay. Pintar la lista sin salir dejaría al anterior a medio guardar.
        el("button", { clase: "mx-boton", texto: "switch character", onclick: () => sesion.salir() }),
      ]),
    ]));
  }

  // --- el inventario -------------------------------------------------------
  //
  // RETIRADO EN EL EXPERIMENTO 31. Aquí había una rejilla estilo Diablo de 10×6
  // con huellas de 1×1 a 3×3, y era la primera cosa de este proyecto que se
  // apartó del original a propósito. Master Sword no tiene rejilla: tiene una
  // columna de equipo, un contenedor con barra y un panel de información, y eso
  // es `src/vgui/contenedor.js`.
  //
  // No queda suplente, a diferencia de la pantalla de personajes: mirar lo que
  // llevas encima no es obligatorio para poder jugar, así que si el panel no
  // está montado la `i` simplemente no hace nada, en vez de enseñar una pantalla
  // que ya no es la del juego.
  const pantallaInventario = (p = activo()) => {
    if (panelDeInventario?.()) { cerrar(); return; }
    if (!p) return pantallaElegir();
    return pantallaHoja(p);
  };

  // --- la muerte -----------------------------------------------------------
  //
  // Lo que enseña sale del motor, no de un guion nuestro: el anuncio es el
  // `UTIL_ClientPrintAll` de `CBasePlayer::Killed()`, el impuesto es su
  // `DeathTax`, y lo de «no sueltas nada» es su `m_fDropAllItems = false`.
  //
  // Y se dice el 1 % a propósito. El aviso de primera muerte del propio juego
  // —`scripts/help/first_death.script`— dice «you lose 5% of your gold», y el
  // código cobra el 1 %. Enseñar aquí el 5 % sería repetir su errata; enseñar
  // el 1 % sin más sería perder el hallazgo. Se enseña lo que se cobra y se
  // cuenta al lado.
  function pantallaMuerte({ anuncio, impuesto = 0, porQue = null, deQuien = null, tipo = "monstruo" } = {}) {
    const p = activo();
    abrir(el("div", { clase: "mx-panel" }, [
      el("h2", { texto: "YOU HAVE FALLEN" }),
      el("p", { clase: "mx-caido", texto: anuncio ?? `${p?.nombre ?? "Someone"} has fallen!` }),
      el("p", { clase: "mx-sub", html:
        (deQuien || porQue
          ? `You were killed by <b>${deQuien ?? porQue}</b>.<br>`
          : "") +
        (tipo === "monstruo"
          ? impuesto > 0
            ? `You lose <b>${impuesto} gold</b>, ${IMPUESTO_DE_MUERTE * 100} % of what you carried.`
            : `You lose no gold: the tax is ${IMPUESTO_DE_MUERTE * 100} % and it is a whole number, ` +
              `so with fewer than 100 coins it comes out zero.`
          : "Dying this way costs no gold: only a monster charges the tax.") +
        "<br><b>You drop no items.</b>" }),
      el("div", { clase: "mx-fila", style: "justify-content:center" }, [
        el("button", { clase: "mx-boton", texto: "get up", onclick: () => sesion.reaparecer() }),
      ]),
      el("p", { clase: "mx-nota", html:
        `You come back in ${5} s even if you touch nothing, which is the engine\u2019s <code>mp_forcerespawn</code>. ` +
        `The game tells you that you lose 5 % of your gold (<code>help/first_death.script</code>) ` +
        `and its code charges 1 % (<code>DeathTax = 0.01</code>): the code wins.` }),
    ]), "mx-muerte");
  }

  // --- las opciones: las teclas -------------------------------------------
  //
  // La otra mitad del menú —la lista de servidores— no está, y no por falta de
  // ganas: **no hay nada que listar** hasta que haya servidor. Ponerla ahora
  // sería una pantalla vacía que promete algo que no existe.
  //
  // Los valores por defecto de aquí no son gusto nuestro: salen del
  // `config.cfg` de la instalación de Master Sword, y por eso la hoja de
  // personaje es la **P** y no la C.
  function pantallaOpciones() {
    // La ventana de verdad es la de VGUI2: siete pestañas con la letra y los
    // colores del juego (`src/vgui2/opciones.js`). Lo de aquí abajo es la
    // pantalla suplente —una sola pestaña, la de las teclas, con letra de
    // navegador— y se queda por la misma razón que las otras tres: se monta a
    // los 231 ms y la ventana buena necesita el esquema horneado. Si está, gana.
    if (panelDeOpciones?.()) { cerrar(); return; }
    if (!teclas) return;
    let esperando = null;   // la acción a la que se le está buscando tecla

    const lista = el("div");
    const pinta = () => {
      lista.replaceChildren();
      for (const a of ACCIONES) {
        const esperandoEsta = esperando === a.clave;
        lista.appendChild(el("div", { clase: "mx-tecla" }, [
          el("span", { texto: a.nombre }),
          el("span", { clase: "mx-cuando", texto: a.boton ? "game button" : "interface" }),
          el("button", {
            clase: `mx-boton${esperandoEsta ? " mx-elegida" : ""}`,
            texto: esperandoEsta ? "press a key…" : nombreDeTecla(teclas.mapa[a.clave]),
            onclick: () => { esperando = esperandoEsta ? null : a.clave; pinta(); },
          }),
          el("button", {
            clase: "mx-boton mx-peligro", texto: "×", title: "clear",
            onclick: () => { teclas.quitar(a.clave); pinta(); },
          }),
        ]));
      }
    };
    pinta();

    // Se escucha en fase de CAPTURA y se corta el suceso: si no, asignar la
    // «I» abre el inventario encima de las opciones mientras se asigna.
    const captura = (e) => {
      if (!esperando) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code === "Escape") { esperando = null; pinta(); return; }
      teclas.asignar(esperando, e.code);
      esperando = null;
      pinta();
    };
    const capturaRaton = (e) => {
      if (!esperando) return;
      e.preventDefault(); e.stopPropagation();
      teclas.asignar(esperando, `Mouse${e.button}`);
      esperando = null;
      pinta();
    };
    addEventListener("keydown", captura, true);
    addEventListener("mousedown", capturaRaton, true);
    const soltar = () => {
      removeEventListener("keydown", captura, true);
      removeEventListener("mousedown", capturaRaton, true);
    };

    abrir(el("div", { clase: "mx-panel" }, [
      el("h2", { texto: "Options — keys" }),
      el("p", { clase: "mx-sub", html:
        "The defaults come from Master Sword’s own <code>config.cfg</code>, " +
        "not from what we felt like: that is why the character sheet is <b>P</b> " +
        "(<code>bind \"p\" \"playerinfo\"</code>) and use is <b>E</b>.<br>" +
        "A key can only do one thing: assigning it takes it away from whoever had it." }),
      lista,
      el("div", { clase: "mx-fila" }, [
        el("button", { clase: "mx-boton", texto: "back to the game defaults", onclick: () => { teclas.porDefecto(); pinta(); } }),
        el("button", { clase: "mx-boton", texto: "close", onclick: () => { soltar(); cerrar(); } }),
      ]),
      el("p", { clase: "mx-nota", html:
        "The <b>game buttons</b> are the ones the engine counts as " +
        "<code>pev-&gt;button</code>. The difference is not cosmetic: while you are dead, " +
        "pressing one is the order to get up, and putting the interface keys in there makes " +
        "closing a window resurrect you." }),
    ]));
  }

  // --- y lo que manda las pantallas es la SESIÓN ---------------------------
  sesion.al("estado", ({ ahora }) => {
    if (ahora === ESTADO.ELIGIENDO) pantallaElegir();
    if (ahora === ESTADO.JUGANDO) cerrar({ aunqueSeaObligatoria: true });
  });
  // LA MUERTE YA NO ABRE PANEL, desde el 41.
  //
  // `pantallaMuerte` era una invención nuestra —un `mx-panel` con un botón «get
  // up»— y lo que el motor hace es otra cosa y ya está portada: un centrado con
  // «<nombre> has fallen!», el velo rojo a medias, el grito según el género, la
  // cámara a metro y ochenta del cuerpo y el impuesto por la consola de sucesos
  // (`src/play/muerte.js`, `src/juego/mensajes.js`). Con las dos cosas a la vez
  // el panel tapaba justo la cámara que se acaba de portar, y para volver había
  // dos caminos —su botón y la regla del motor, que ya estaba puesta en
  // `sesion.tic`— de los cuales uno sobra.
  //
  // La función se queda aquí y no se borra: es el suplente del día en que el
  // velo y el centrado no se puedan montar, igual que la pantalla de personajes
  // es suplente de la de VGUI. `montarMuerte` la enciende quien lo necesite.
  let panelDeMuerte = false;
  sesion.al("muerte", (e) => { if (panelDeMuerte) pantallaMuerte(e); });

  function descargar(nombre, texto) {
    const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
    const a = el("a", { href: url, download: nombre });
    raiz.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  addEventListener("keydown", (e) => {
    if (e.code === "Escape" && velo) { cerrar(); return; }
    if (e.target instanceof HTMLInputElement) return;
    // Muerto no se abre la hoja: la pantalla de muerte es obligatoria y
    // taparla con el inventario dejaría al jugador sin el botón de levantarse.
    if (obligatoria()) return;
    // Las teclas ya no están escritas aquí: se le preguntan a las
    // asignaciones, que salen del `config.cfg` del juego y el jugador puede
    // cambiar. Por defecto son la **P** (`bind "p" "playerinfo"`) y la **I**.
    const accion = teclas?.accionDe(e.code);
    // La `p` es del registro cuando el panel está montado. Una tecla, un dueño:
    // ver el comentario de la `i` aquí debajo, que costó cinco controles.
    if (accion === "hoja" && !panelDeHoja) {
      e.preventDefault(); activo() ? pantallaHoja() : pantallaElegir();
    }
    // LA `i` ES DEL REGISTRO DE VGUI cuando el panel está montado, y este
    // escuchador NO la toca.
    //
    // Y no es un detalle: con los dos atendiéndola, el de `main.js` abría el
    // panel y éste lo cerraba en la misma pulsación. El inventario aparecía y
    // desaparecía sin que nada fallara, y en el DOM se quedaba montado y
    // escondido — o sea que `querySelectorAll` lo encontraba y sus medidas eran
    // todas cero. Cinco controles de `sonda:inventario31` en rojo por esto.
    //
    // La regla, de aquí en adelante: **una tecla, un dueño.** Si hay panel, el
    // dueño es el registro.
    if (accion === "inventario" && !panelDeInventario) {
      e.preventDefault(); activo() ? pantallaInventario() : pantallaElegir();
    }
    // La G. Si hay ventana de VGUI2 el dueño de la tecla es ella, y si no, la
    // pantalla suplente: `pantallaOpciones` decide, no esta línea.
    if (accion === "opciones") { e.preventDefault(); pantallaOpciones(); }
  });

  return {
    elegir: pantallaElegir, crear: pantallaCrear, hoja: pantallaHoja,
    inventario: pantallaInventario, muerte: pantallaMuerte, opciones: pantallaOpciones, cerrar,
    /** Enciende el panel suplente de la muerte. Apagado desde el 41. */
    usarPanelDeMuerte(si = true) { panelDeMuerte = Boolean(si); },
    get panelDeMuerte() { return panelDeMuerte; },
    get abierta() { return Boolean(velo); },
    get personaje() { return activo(); },
    /** Cuántos retratos hay vivos. Para las sondas. */
    get retratos() { return retratos.cuantos; },
    /** Un paso a mano, para poder cronometrar sin depender del reloj. */
    animarCuerpos(dt) { retratos.animar(dt); },
  };
}
