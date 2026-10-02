// EL MENÚ PRINCIPAL, dibujado. La regla de las opciones está en
// `src/play/menu.js`; la del recorrido de la cámara, en `src/play/miradores.js`.
//
// ── EXPERIMENTO 52: el fondo deja de ser una pintura ────────────────────────
//
// Hasta aquí esto era una capa OPACA con el mosaico de la torre detrás de la
// lista, y el encargo fue cambiarlo, textualmente: *«veo que imitarlo resultó en
// una imitación de no muy buena calidad y quisiera crear un nuevo menú principal
// que esté dentro del juego como el actual pero que aproveche las
// características de three.js para ser un menú de alta calidad»*.
//
// Lo que cambia es **sólo la presentación**. Las entradas siguen saliendo de
// `gamemenu.res` por `entradasVisibles`/`quehace`, así que «Visit a Kingdom» y
// «Establish a Kingdom» siguen ahí con sus separadores y sus apagadas, el
// experimento 36 no se deshace y las pruebas de Node que protegen la regla
// siguen valiendo. Es la decisión que se tomó al empezar el 52.
//
// Y la especificación no es nueva: la escribió este proyecto en el experimento
// 13 y se quedó sin construir. Ver `doc/mockups/menu-principal-mockup.html` y la
// cabecera de `src/play/miradores.js`, que la cita entera.
//
// **La pintura de Anders Finér no se reconstruye ni se sustituye: sigue siendo
// el respaldo.** Sin mapa horneado, o sin mirador medido para este mapa, el menú
// se pinta exactamente como antes. Un menú que necesita `npm run gatecity` para
// poder cambiar las teclas no sirve de nada.
//
// ── Los tres sonidos ────────────────────────────────────────────────────────
//
// La interfaz entera del juego suena con `sound/ui/`, que tiene **tres
// archivos**: `buttonrollover` al pasar, `buttonclick` al pulsar y
// `buttonclickrelease` al soltar. No hay más. Y son los mismos que usa el
// ciclador de armas (vgui_quickslot.h:123), o sea que el clic con el que eliges
// una espada es el mismo con el que sales del juego.
//
// Un navegador no deja sonar nada hasta que el jugador toque algo, así que el
// primer `play()` puede fallar y hay que dejarlo fallar en silencio: un menú que
// escribe errores en la consola por no poder hacer «clic» es peor que uno mudo.
//
// ── Lo que NO hace ──────────────────────────────────────────────────────────
//
// «Quit» está puesta y apagada: un navegador no cierra la pestaña que no abrió
// él. Se ve, se puede elegir y dice por qué no. Esconderla haría un menú más
// limpio y menos parecido.

import { entradasVisibles, quehace } from "../play/menu.js";
// Sólo para el volumen por omisión de los sonidos del menú: el `volume
// "0.120000"` del `config.cfg` vive en la tabla de ajustes y no se copia aquí,
// para que no puedan separarse.
import { porDefecto } from "../play/ajustes.js";

const CSS = `
.ms-menu { position: absolute; inset: 0; z-index: 40; overflow: hidden; }
.ms-menu[hidden] { display: none !important; }

/* CON PINTURA es una capa opaca, como hasta el 51; CON FONDO VIVO no pinta
   nada y deja ver el mapa que ya se está dibujando detrás. */
.ms-menu[data-fondo="pintura"] { background: #000 center/cover no-repeat; }

/* LA VIÑETA, que el mockup pedía «en post-proceso» y aquí es un degradado.
   Un paso de post-proceso de verdad costaría un render extra a textura por
   fotograma para conseguir lo mismo que un gradiente que la GPU compone gratis.
   Si algún día hace falta que la viñeta reaccione a la escena, entonces sí. */
.ms-menu-vineta { position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 90% 85% at 60% 35%, transparent 55%, rgba(7,13,12,.25) 100%),
    linear-gradient(90deg, rgba(6,13,12,.60) 0%, rgba(6,13,12,.22) 28%, transparent 53%),
    linear-gradient(to top, rgba(6,13,12,.55) 0%, transparent 25%); }
.ms-menu[data-fondo="pintura"] .ms-menu-vineta { background:
    linear-gradient(to top, rgba(0,0,0,.55) 0%, transparent 45%); }

/* EL BLOQUE, ABAJO A LA IZQUIERDA. «Texto abajo a la izquierda, sin cajas, la
   imagen manda», que es lo único que el menú del original hacía bien y lo que el
   mockup mandó conservar. */
.ms-menu-bloque { position: absolute; left: 6%; bottom: 8%;
  display: flex; flex-direction: column; align-items: flex-start; }

.ms-menu-marca { font-family: Cinzel, 'Trajan Pro', Georgia, serif; font-weight: 700;
  letter-spacing: 0.14em; color: #f3ece0; line-height: 1;
  text-shadow: 0 2px 12px #000, 0 0 40px rgba(0,0,0,.9); }
.ms-menu-sub { font-family: 'IM Fell English', Georgia, serif; font-style: italic;
  color: #b9ae99; letter-spacing: 0.04em; margin-top: 0.35em;
  text-shadow: 0 1px 6px #000; }
/* La regla fina que separa la marca de las opciones: se desvanece a la derecha
   para no dibujar una caja, que es lo que el mockup prohíbe. */
.ms-menu-regla { height: 1px; align-self: stretch; margin: 1.1em 0 0.9em;
  background: linear-gradient(to right, rgba(220,205,175,.55), transparent); }

.ms-menu-lista { display: flex; flex-direction: column; align-items: flex-start; }

.ms-menu-op { position: relative; display: flex; align-items: baseline; gap: 0.5em;
  border: 0; background: transparent; padding: 0.24em 0 0.24em 0;
  text-align: left; cursor: pointer; letter-spacing: 0.05em;
  font-family: 'IM Fell English', Georgia, 'Times New Roman', serif;
  color: #cfc6b6; text-shadow: 0 2px 6px #000, 0 0 14px rgba(0,0,0,.8);
  transition: color .14s ease, transform .14s ease; }
/* EL MARCADOR ▸ NO APARECE Y DESAPARECE: está siempre y cambia de opacidad. Si
   se añade al elegir, cada fila se ensancha al pasar por encima y la columna
   entera tiembla. */
.ms-menu-op::before { content: "\\25B8"; opacity: 0; color: #e8c88a;
  transition: opacity .14s ease; }
/* Y el subrayado también está siempre, con la escala a cero: animar un
   background-size no obliga al navegador a recolocar nada.
   (Sin comillas invertidas: esto vive dentro de una plantilla que las usa.) */
.ms-menu-op::after { content: ""; position: absolute; left: 1.2em; right: 0; bottom: 0.1em;
  height: 1px; background: linear-gradient(to right, #e8c88a, transparent);
  transform: scaleX(0); transform-origin: left; transition: transform .18s ease; }
.ms-menu-op[data-elegida="si"] { color: #fff6e4; transform: translateX(0.18em); }
.ms-menu-op[data-elegida="si"]::before { opacity: 1; }
.ms-menu-op[data-elegida="si"]::after { transform: scaleX(1); }

/* LAS APAGADAS SE VEN, y se ven apagadas. El motivo va en el atributo title y,
   cuando
   se eligen, en el pie: es la mitad de por qué el menú del juego enseña
   opciones que no funcionan en vez de esconderlas. */
.ms-menu-op[data-sirve="no"] { color: #6f6a61; cursor: default; }
.ms-menu-op[data-sirve="no"][data-elegida="si"] { color: #9a9284; }
.ms-menu-op[data-sirve="no"][data-elegida="si"]::after {
  background: linear-gradient(to right, #6f6a61, transparent); }
.ms-menu-op[data-sirve="no"]::before { color: #6f6a61; }

.ms-menu-sep { height: 0.85em; }

.ms-menu-pie { position: absolute; left: 6%; right: 6%; bottom: 2.2%;
  color: #9a9284; font-family: 'IM Fell English', Georgia, serif;
  text-shadow: 0 1px 4px #000; }

/* EL CRÉDITO DEL ARTE, abajo a la derecha y siempre. Con el fondo vivo la
   pintura de Finér no se enseña, pero el título del juego es suyo igual y el
   crédito no depende de que se vea su pintura. */
.ms-menu-credito { position: absolute; right: 2%; bottom: 2.2%; text-align: right;
  color: #6f6a61; font-family: 'IM Fell English', Georgia, serif;
  text-shadow: 0 1px 4px #000; }

/* El logotipo del juego, que sólo sale con la pintura: son 240x32 de verdad y
   estirarlos con suavizado los deja borrosos. */
.ms-menu-titulo { image-rendering: pixelated; margin-top: 26px;
  filter: drop-shadow(0 2px 6px #000); }
`;

const el = (tag, clase = "") => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  return n;
};

/** Las dos fuentes del mockup. Se piden una vez y sin bloquear nada. */
const FUENTES = "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=IM+Fell+English:ital@0;1&display=swap";
function pedirFuentes() {
  if (document.getElementById("ms-menu-fuentes")) return;
  // `display=swap` y una pila de repuesto con serif del sistema en cada regla:
  // sin red el menú sale en Georgia y se lee igual. Que la tipografía dependa
  // de un servidor ajeno fue una decisión del jugador al empezar el 52, tomada
  // sabiendo que la alternativa era meter los primeros binarios del repositorio.
  const l = document.createElement("link");
  l.id = "ms-menu-fuentes"; l.rel = "stylesheet"; l.href = FUENTES;
  document.head.appendChild(l);
}

/**
 * Monta el menú principal. Arranca escondido.
 *
 * `ficha` es `build/gatecity/menu.json`. **Sin ella el menú se monta igual**,
 * con las opciones que trae escritas y sin fondo: la misma regla que el HUD, un
 * `.png` que falta no puede dejar al jugador sin forma de cambiar las teclas.
 *
 * `fondoVivo` dice si detrás hay un mapa dibujándose. Si es `false` —no hay
 * mirador medido, o el mapa no está horneado— el menú vuelve a ser la capa opaca
 * con la pintura, que es donde estaba hasta el 51.
 *
 * `hacer` recibe `{ que, entrada }` y devuelve `true` si lo ha hecho. Todo lo
 * que el menú sabe del juego pasa por ahí.
 *
 * `tapado` dice si hay una ventana de VGUI2 ENCIMA. El menú sigue abierto y
 * visible detrás de ella —es lo que hace el juego, y por eso «Options»,
 * «Visit a Kingdom» y «Establish a Kingdom» ya no lo cierran— pero mientras
 * algo lo tape **no atiende ni teclas ni clics**. Sin esto la Escape está bien
 * (`vgui2/montar.js:96` escucha en captura y corta la propagación) pero el
 * `Enter` no: se lo quedaba la ventana Y ADEMÁS activaba la opción del menú
 * que había debajo, a ciegas. Las flechas movían la marca por detrás igual.
 */
export function montarMenu({
  raiz = document.body, ficha = null, hacer = () => false, sonar = null, cursor = null,
  tapado = null, fondoVivo = false, enEscritorio = false,
  // EL VOLUMEN DE EFECTOS, que hasta el 84 no llegaba aquí. Ver `ponVolumen`.
  //
  // Por omisión NO es 1: es lo que diga la tabla de ajustes, o sea el `volume
  // "0.120000"` del `config.cfg`. Y eso es a propósito — un `volumen = 1` de
  // respaldo haría que un sitio que se olvide de pasarlo vuelva al fallo
  // original sin que nada avise, y el fallo original era justo éste.
  volumen = null,
} = {}) {
  // EL ÚNICO CONTEXTO QUE EL MENÚ LE PASA A LA REGLA, y enciende «Quit». Va en
  // una función y no repetido en los cuatro sitios que preguntan, porque
  // olvidarlo en uno daría una entrada que se ve encendida y no hace nada —o al
  // revés— según por dónde se llegue a ella. Ver `quehace` en `src/play/menu.js`.
  const queHace = (e) => quehace(e, { enEscritorio });
  if (!document.getElementById("ms-menu-css")) {
    const s = el("style"); s.id = "ms-menu-css"; s.textContent = CSS;
    raiz.appendChild(s);
  }
  pedirFuentes();

  // `fondoVivo` puede ser un valor o una PREGUNTA. Con una pregunta se vuelve a
  // hacer en cada `abrir()`, que es lo que permite encender el fondo vivo sin
  // reconstruir el menú — y lo que necesita la sonda que elige miradores, que
  // los pone después de que el menú lleve rato montado.
  const quiereFondoVivo = () =>
    (typeof fondoVivo === "function" ? Boolean(fondoVivo()) : Boolean(fondoVivo));
  let conFondoVivo = quiereFondoVivo();
  const base = ficha?.base ?? "";
  const nodo = el("div", "ms-menu");
  nodo.hidden = true;

  const vineta = el("div", "ms-menu-vineta");
  nodo.appendChild(vineta);

  const bloque = el("div", "ms-menu-bloque");
  nodo.appendChild(bloque);

  // ── LA MARCA ──────────────────────────────────────────────────────────────
  //
  // Con el fondo vivo es texto en Cinzel, como pedía el mockup. Con la pintura
  // es el `game_menu.tga` del juego, que es lo que había.
  //
  // EL AVISO DEL 36 SIGUE VALIENDO, y por eso está aquí escrito en vez de
  // borrado: cuando el logotipo era una imagen iba **debajo** de la lista,
  // porque en la captura del juego «MASTER SWORD / art by Anders Finér» está
  // abajo del todo, por debajo de «Quit». Lo tuvimos arriba y no se notaba
  // porque al menú sólo se llegaba con la Escape; desde el 36 el menú es la
  // primera pantalla y el logotipo se comía «Visit a Kingdom».
  //
  // En el 52 la disposición ya no imita la captura —es la del mockup, con el
  // bloque entero abajo a la izquierda y la marca encima de las opciones—, así
  // que el orden cambia a propósito. Lo que no cambia es el motivo por el que
  // aquello se rompió: **el alto del bloque tiene que caber**, y ahora cabe
  // porque el bloque se ancla por abajo y crece hacia arriba.
  // SE MONTAN LAS DOS Y SE ENSEÑA UNA, en vez de montar la que toque.
  //
  // Porque el fondo puede cambiar DESPUÉS de montar: la sonda del 52 prueba
  // miradores que todavía no están en la tabla, y para verlos tiene que destapar
  // la capa en marcha. Con una sola marca montada eso obligaría a reconstruir el
  // bloque entero y a recolocar la lista, que es más código y más frágil que un
  // `hidden`.
  let titulo = null;
  const marca = el("div", "ms-menu-marca");
  marca.textContent = "MASTER SWORD";
  const sub = el("div", "ms-menu-sub");
  sub.textContent = "Rebirth";
  const regla = el("div", "ms-menu-regla");
  bloque.append(marca, sub, regla);

  const lista = el("div", "ms-menu-lista");
  bloque.appendChild(lista);

  if (ficha?.titulo) {
    titulo = el("img", "ms-menu-titulo");
    titulo.src = `${base}${ficha.titulo.archivo}`;
    titulo.alt = "Master Sword — art by Anders Finér";
    titulo.width = ficha.titulo.ancho * 2;
    // El logotipo del juego va DEBAJO de la lista; la marca de texto, encima.
    // Ver el aviso del 36 de más arriba.
    bloque.appendChild(titulo);
  }

  /**
   * Poner o quitar el fondo vivo. Es lo que decide si esta capa es opaca con la
   * pintura o transparente con el mapa detrás.
   *
   * La pintura se pone SÓLO cuando hace falta: dejarla puesta y taparla con el
   * canvas sería pedirle al navegador que descargue y componga un fondo de
   * pantalla completa que nadie va a ver.
   */
  function ponerFondo(vivo) {
    conFondoVivo = Boolean(vivo);
    nodo.dataset.fondo = conFondoVivo ? "vivo" : "pintura";
    nodo.style.backgroundImage = !conFondoVivo && ficha?.fondo
      ? `url(${base}${ficha.fondo.archivo})` : "";
    for (const n of [marca, sub, regla]) n.hidden = !conFondoVivo;
    if (titulo) titulo.hidden = conFondoVivo;
  }
  ponerFondo(conFondoVivo);

  const pie = el("div", "ms-menu-pie");
  nodo.appendChild(pie);

  const credito = el("div", "ms-menu-credito");
  // EL CRÉDITO, Y UN ERROR QUE ESTUVO AQUÍ DESDE EL 52.
  //
  // Ponía «by DrKill and the MSR team», y eso **ascendía a DrKill de autor de un
  // mapa a autor del juego**. DrKill es el autor de `gatecity.bsp` —lo dice el
  // propio mapa, `maptitle "Gatecity by DrKill"` (ver `src/play/intro.js`)— y su
  // sitio es `CREDITOS.md:26`, donde ya estaba bien escrito, y el título del
  // mapa al entrar, donde el juego lo pone solo. No la primera pantalla.
  //
  // Lo vio el jugador. Un crédito equivocado es de los errores que más duran:
  // nadie lo comprueba porque parece información, no código.
  credito.textContent = "Master Sword: Rebirth by the MSR team — title art by Anders Finér";
  nodo.appendChild(credito);

  raiz.appendChild(nodo);

  // Los tres sonidos. Se cargan una vez y se rebobinan, porque dos clics
  // seguidos sobre el mismo `Audio` no suenan dos veces.
  const audios = {};
  for (const [clave, s] of Object.entries(ficha?.sonidos ?? {})) {
    try {
      const a = new Audio(`${base}${s.archivo}`);
      a.preload = "auto";
      audios[clave] = a;
    } catch { /* sin sonido se juega igual */ }
  }

  /**
   * EL VOLUMEN DE LOS TRES SONIDOS DEL MENÚ — el 84.
   *
   * Lo reportó el usuario y era cierto en los dos sentidos: «las de sonido no
   * afectan el volumen que pasa cuando pasas el mouse por una de las opciones
   * del menú principal, de hecho parece que no funciona para nada».
   *
   * Un `new Audio()` nace con `volume = 1`, y el `config.cfg` de Master Sword
   * trae `volume "0.120000"`. O sea que el menú sonaba a **8,3 veces** el
   * volumen que el jugador tenía puesto, y mover el deslizador no lo tocaba:
   * estos tres `Audio` son elementos del DOM y no pasan por el canal de efectos
   * de `src/play/audio.js`, que además no existe hasta que carga un mapa.
   *
   * No se enchufan al canal de efectos y es deliberado: ese canal vive sobre un
   * `AudioContext` que el navegador no deja despertar hasta que el jugador toca
   * algo, y el primer sonido del menú es justo el de antes del primer toque.
   * Lo que sí se puede es **obedecer el mismo número**, que es lo que el jugador
   * pide cuando mueve el deslizador.
   */
  let volEfectos = Number.isFinite(volumen) ? volumen : (porDefecto().volumen ?? 1);
  const ponVolumen = (v) => {
    if (!Number.isFinite(v)) return volEfectos;
    // Topado, porque `HTMLMediaElement.volume` LANZA fuera de [0, 1]
    // (`IndexSizeError`) en vez de recortar, y un ajuste no puede tirar el menú.
    volEfectos = Math.min(1, Math.max(0, v));
    for (const a of Object.values(audios)) a.volume = volEfectos;
    return volEfectos;
  };
  ponVolumen(volEfectos);

  const dar = (clave) => {
    if (sonar) { sonar(clave); return; }
    const a = audios[clave];
    if (!a) return;
    // Se vuelve a poner en cada toque y no sólo al cambiarlo: `currentTime = 0`
    // rebobina, pero si algún día estos `Audio` se recrean, el volumen viajaría
    // en la copia vieja. Cuesta nada y cierra el hueco.
    a.volume = volEfectos;
    try { a.currentTime = 0; const p = a.play(); if (p?.catch) p.catch(() => {}); } catch { /* el navegador manda */ }
  };

  const ENTRADAS = ficha?.entradas ?? [];
  let visibles = [];
  let elegida = -1;
  let enJuego = false;
  /**
   * DÓNDE ESTÁ EL RATÓN, normalizado a [-1, 1] en los dos ejes, o `null` si no
   * está encima. Lo lee `src/main.js` en cada fotograma para el paralaje.
   *
   * Vive aquí y no en `main.js` porque el DOM es de este archivo: quien tiene la
   * capa tiene el `pointermove`. Y se devuelve `null` en vez de [0, 0] cuando el
   * ratón se va, para que el paralaje pueda volver al centro en vez de quedarse
   * torcido donde lo dejaste — que es lo que haría si no se distinguiera «el
   * ratón está en el medio» de «no hay ratón».
   */
  let raton = null;
  /**
   * CUÁNTAS VECES SE HA ABIERTO. Sólo sube, y está aquí para que se pueda medir
   * un fallo que el estado no delata: aguantar la Escape alternaba el menú
   * sesenta veces por segundo, y mirar «¿está abierto?» de vez en cuando daba
   * verde igual —entre dos miradas cabe un número par de vueltas—. Contar las
   * aperturas sí lo distingue. Ver `sondas/pantalla38.mjs`.
   */
  let aperturas = 0;

  const alRaton = (ev) => {
    if (nodo.hidden) { raton = null; return; }
    const r = nodo.getBoundingClientRect();
    if (!r.width || !r.height) { raton = null; return; }
    raton = [
      ((ev.clientX - r.left) / r.width) * 2 - 1,
      // Y AL REVÉS, que es lo que uno espera: el ratón arriba sube la cámara.
      // En el DOM `y` crece hacia abajo; en el mundo, hacia arriba.
      1 - ((ev.clientY - r.top) / r.height) * 2,
    ];
  };
  const alSalirElRaton = () => { raton = null; };
  nodo.addEventListener("pointermove", alRaton);
  nodo.addEventListener("pointerleave", alSalirElRaton);

  /** Las medidas, que salen del ALTO como todo en este juego. */
  function medir() {
    const h = nodo.clientHeight || window.innerHeight;
    const k = h / 600;   // la pantalla del original
    const cuerpo = Math.max(15, Math.round(21 * k));
    // LA MARCA, MEDIDA CONTRA EL ANCHO Y NO SÓLO CONTRA EL ALTO.
    //
    // Empezó en 52 y a 1200x800 salía a 69 px: «MASTER SWORD» cruzaba media
    // pantalla y se metía debajo de la ventana de «Create Server». El alto solo
    // no basta para esto, porque lo que se desborda es el ANCHO — y el bloque
    // vive en el 6 % izquierdo, así que tiene un tercio de pantalla para caber.
    //
    // 12 caracteres con 0,14 em de espaciado ocupan del orden de 0,85 em cada
    // uno, así que el cuerpo que cabe en un tercio del ancho es a/(12·0,85).
    // Se toma el menor de los dos y se acota por abajo para que en una ventana
    // estrecha siga leyéndose.
    const a = nodo.clientWidth || window.innerWidth;
    if (marca) {
      marca.style.fontSize = `${Math.max(22, Math.min(
        Math.round(34 * k), Math.round((a * 0.34) / (12 * 0.85)),
      ))}px`;
    }
    if (sub) sub.style.fontSize = `${Math.max(12, Math.round(15 * k))}px`;
    pie.style.fontSize = `${Math.max(11, Math.round(15 * k))}px`;
    credito.style.fontSize = `${Math.max(9, Math.round(12 * k))}px`;
    return cuerpo;
  }

  function pintar() {
    visibles = entradasVisibles(ENTRADAS, { enJuego });
    lista.replaceChildren();
    const cuerpo = medir();
    visibles.forEach((e, i) => {
      const q = queHace(e);
      if (q.que === "separador") {
        const s = el("div", "ms-menu-sep");
        lista.appendChild(s);
        return;
      }
      const b = el("button", "ms-menu-op");
      b.type = "button";
      // El texto va en su propio `span` porque el marcador ▸ es un `::before`
      // del botón: sin envolverlo, `align-items: baseline` alinea el marcador
      // con la caja del botón y no con la letra, y queda medio píxel alto.
      const t = el("span");
      t.textContent = e.texto || e.etiqueta;
      b.appendChild(t);
      b.dataset.sirve = q.sirve ? "si" : "no";
      b.dataset.que = q.que ?? "";
      // El índice va en el nodo y no se busca por el texto: «Name Character» y
      // «Options» son dos entradas distintas con el mismo comando, y basta con
      // que un día dos compartan etiqueta para que marcar la de abajo encienda
      // la de arriba.
      b.dataset.i = String(i);
      b.style.fontSize = `${cuerpo}px`;
      if (!q.sirve && q.porque) b.title = q.porque;
      b.addEventListener("pointerenter", () => { if (elegida !== i) { elegida = i; dar("encima"); marcar(); } });
      b.addEventListener("click", () => { elegida = i; elegir(); });
      lista.appendChild(b);
    });
    marcar();
  }

  /** Cuál está marcada, y el logotipo encendido mientras haya alguna. */
  function marcar() {
    for (const b of lista.querySelectorAll(".ms-menu-op")) {
      b.dataset.elegida = Number(b.dataset.i) === elegida ? "si" : "no";
    }
    // Sólo con la pintura: el `_mouseover` es la misma imagen con más alfa, y la
    // marca de texto se enciende con CSS y no cambiando de archivo.
    if (titulo && ficha?.tituloEncima) {
      const img = elegida >= 0 ? ficha.tituloEncima : ficha.titulo;
      titulo.src = `${base}${img.archivo}`;
    }
  }

  /**
   * Hay una ventana encima. Va en una función y no en cada manejador para que
   * el guardia esté en los DOS sitios por los que se entra —`elegir()` y
   * `mover()`— y no en los cuatro por los que se llama a esos dos.
   */
  const estoyTapado = () => Boolean(tapado?.());

  /** Pulsar la que esté marcada. */
  function elegir() {
    if (estoyTapado()) return null;
    const e = visibles[elegida];
    if (!e) return null;
    const q = queHace(e);
    if (q.que === "separador") return null;
    dar("elegir");
    if (!q.sirve) {
      pie.textContent = `"${e.texto || e.etiqueta}": ${q.porque ?? "not yet"}`;
      return { ...q, entrada: e, hecho: false };
    }
    const hecho = Boolean(hacer({ que: q.que, entrada: e }));
    dar("confirmar");
    if (!hecho) pie.textContent = `"${e.texto || e.etiqueta}": did nothing`;
    return { ...q, entrada: e, hecho };
  }

  /** Moverse con las flechas, saltando separadores. */
  function mover(paso) {
    if (estoyTapado()) return;
    const n = visibles.length;
    if (!n) return;
    for (let i = 1; i <= n; i++) {
      const j = ((elegida + paso * i) % n + n) % n;
      if (queHace(visibles[j]).que !== "separador") { elegida = j; dar("encima"); marcar(); return; }
    }
  }

  const alTeclado = (ev) => {
    if (nodo.hidden) return;
    if (ev.code === "ArrowDown") { mover(1); ev.preventDefault(); }
    else if (ev.code === "ArrowUp") { mover(-1); ev.preventDefault(); }
    else if (ev.code === "Enter" || ev.code === "NumpadEnter") { elegir(); ev.preventDefault(); }
  };
  addEventListener("keydown", alTeclado);
  const alRedimensionar = () => pintar();
  addEventListener("resize", alRedimensionar);

  pintar();

  return {
    nodo,
    get abierto() { return !nodo.hidden; },
    /** Si detrás hay mapa. `main.js` lo mira para saber si conduce la cámara. */
    get fondoVivo() { return conFondoVivo; },
    /** Cambiarlo en marcha. Lo usa la sonda del 52 para probar miradores. */
    ponerFondo,
    /** Dónde está el ratón, para el paralaje. `null` si no está encima. */
    get raton() { return raton; },
    /**
     * El volumen de efectos, en marcha. Lo llama `alAplicar` de `src/main.js`.
     *
     * Devuelve el valor que queda puesto —topado a [0, 1]— para que una sonda
     * pueda LEERLO en vez de creerse que se aplicó: ver el 84, donde el fallo era
     * precisamente que el ajuste se guardaba y nadie lo repartía.
     */
    ponVolumen,
    /** Lo que suena AHORA, leído de los `Audio` y no de nuestra cuenta. */
    get volumen() {
      const vs = Object.values(audios).map((a) => a.volume);
      return vs.length ? Math.max(...vs) : null;
    },
    /** Abre el menú. `enJuego` decide si salen «Resume game» y «Disconnect». */
    abrir(hayPartida = false) {
      enJuego = Boolean(hayPartida);
      elegida = -1;
      raton = null;
      pie.textContent = ficha ? "" : "the menu has not been baked (`npm run menu`): no background, no sounds";
      pintar();
      mover(1);
      nodo.hidden = false;
      aperturas++;
      // EL MENÚ QUIERE EL RATÓN, y hay que pedirlo. Ver `cursorDelRaton` en
      // `src/main.js`: hasta ahora lo soltaba la Escape del navegador por
      // nosotros, y en pantalla completa con Keyboard Lock esa Escape es
      // nuestra y el favor se acabó.
      cursor?.(true);
    },
    cerrar() {
      nodo.hidden = true;
      raton = null;
      cursor?.(false);
    },
    alternar(hayPartida = false) { if (nodo.hidden) this.abrir(hayPartida); else this.cerrar(); },
    mover, elegir,
    /** Lo que se ve, para las sondas. */
    estado() {
      return {
        abierto: !nodo.hidden,
        enJuego,
        aperturas,
        // Abierto y tapado a la vez es el estado nuevo: se VE detrás de la
        // ventana y no atiende a nadie. Antes no existía porque «Options»
        // cerraba el menú.
        tapado: estoyTapado(),
        opciones: [...lista.querySelectorAll(".ms-menu-op")].map((b) => ({
          texto: b.textContent, sirve: b.dataset.sirve === "si", que: b.dataset.que,
        })),
        separadores: lista.querySelectorAll(".ms-menu-sep").length,
        elegida: visibles[elegida] ? (visibles[elegida].texto || visibles[elegida].etiqueta) : null,
        pie: pie.textContent,
        conFondo: Boolean(ficha?.fondo),
        // EL 52. `fondoVivo` es lo que se pidió; `pinturaPuesta` es lo que se
        // ve de verdad, y son dos cosas: si el mirador no está medido se pide
        // vivo y sale la pintura. La sonda mira las dos para que «no se ve el
        // mapa» no pueda contarse como verde.
        fondoVivo: conFondoVivo,
        pinturaPuesta: nodo.dataset.fondo === "pintura",
        raton: raton ? [...raton] : null,
      };
    },
    destruir() {
      removeEventListener("keydown", alTeclado);
      removeEventListener("resize", alRedimensionar);
      nodo.removeEventListener("pointermove", alRaton);
      nodo.removeEventListener("pointerleave", alSalirElRaton);
      nodo.remove();
    },
  };
}
