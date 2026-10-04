// QUÉ SECUENCIA DEL MODELO DE VISTA PONE CADA ATAQUE.
//
// La animación de un ataque NO es un campo del ataque. `RegisterAttack` lee
// una veintena de `reg.attack.*` (giattack.cpp:480-599) y ninguno es una
// secuencia: lo que lee es `reg.attack.callback` (:508), y al EMPEZAR el ataque
// el motor llama al evento que se llama así con `_start` detrás:
//
//     CallScriptEvent(CurrentAttack->CallbackName + "_start");      giattack.cpp:345
//
// y es ESE evento del guion el que pone la secuencia, con `playviewanim`:
//
//     else if (Cmd.Name() == "playviewanim") {
//     #ifndef VALVE_DLL                                   <- sólo en el CLIENTE
//       if (m_pPlayer && m_Location == ITEMPOS_HANDS) {
//         int iAnim = atoi(Params[0]);
//         ... m_pPlayer->pev->weaponanim = iAnim;
//         m_ViewModelAnim = iAnim;
//       }                                           genericitem.cpp:2015-2033
//
// o, desde el servidor, con `splayviewanim <objeto> <índice>`, que manda un
// mensaje al cliente (`NETMSG_ANIM`, scriptcmds.cpp:6836-6857) y por eso llega
// DESPUÉS de lo que el cliente haya puesto en su propia pasada.
//
// Hasta hoy el puerto sorteaba entre `ANIM_ATTACK1..5` para TODOS los ataques
// (src/play/golpe.js), que es lo que hace el `melee_start` de las espadas y las
// hachas a una mano y de nadie más. La Blood Drinker pone `ANIM_LUNGE` en su
// golpe cargado (swords_blood_drinker.script:185-190) y quita el modelo en el
// segundo (:146-150); el bastón no declara ningún `ANIM_ATTACK` y elige en
// `pole_attack` (polearms_base.script:412-532).
//
// ── POR QUÉ ESTO SÍ ES EL INTÉRPRETE ────────────────────────────────────────
//
// El lector de fichas (`leerFichaObjeto`) no ejecuta nada, y aquí no basta:
// `special_01_start` existe TRES veces en la Blood Drinker (la suya y las de
// sus plantillas), corren todas (`CallScriptEvent` no para en la primera) y la
// que queda es el último `playviewanim` ejecutado. Así que se corre el `Guion`
// de verdad (src/play/guion.js) sobre el texto de verdad, partido por el
// analizador de verdad (CLAUDE.md §4, el 67), y lo único que se le añade son
// los comandos del objeto que tocan el modelo de vista.
//
// Se corre DOS veces, porque el motor lo corre dos veces: en el cliente
// (`game.clientside` 1, y es donde `playviewanim` hace algo) y en el servidor
// (`game.serverside` 1, donde lo hace `splayviewanim`).
//
// ── LO QUE SE SUPONE, DICHO AQUÍ ────────────────────────────────────────────
//
// Esto se hornea, así que hay que fijar quién empuña el arma:
//
//   - **Tiene la habilidad que pida.** `$get(ent_owner,skill.*)` contesta 100.
//     Sin eso `base_melee` marca `BITEM_UNDERSKILLED` y `check_attack_anim`
//     (base_varied_attacks.script:11-13) abandona sin poner la secuencia.
//   - **Tiene vida y maná** (1000 de cada).
//   - **No tiene ninguna tecla de moverse pulsada.** `$get(ent_owner,keydown,…)`
//     contesta 0, así que del bastón sale la estocada y no el barrido lateral
//     ni el revés (polearms_base.script:419-468), y de las cinco espadas de
//     `base_varied_attacks`, el tajo normal. ESAS VARIANTES NO ESTÁN PORTADAS.
//   - **Un dado (`$rand`) en el camino** da varias secuencias: se enumeran las
//     caras de la PRIMERA tirada y sale una por cara. Las demás tiradas dan la
//     cara más baja.
//   - **Lo que no se puede leer como número se dice.** Un `playviewanim X` con
//     `X` sin resolver es `atoi` = 0 en el motor, y aquí va marcado en
//     `sinResolver` para que nadie lo tome por una medida.

import { Guion, entornoVacio, olvidarGlobales } from "../src/play/guion.js";
import { cargarCabecera } from "../src/play/efectos.js";
import { cargarGuion, RAIZ_POR_OMISION } from "./scriptsmsr.mjs";

const atoi = (v) => { const n = parseInt(String(v ?? "").trim(), 10); return Number.isFinite(n) ? n : 0; };
const esNumero = (v) => /^\s*[+-]?\d/.test(String(v ?? ""));

/** Cuántas caras de un dado se enumeran como mucho. El mayor del juego es 5. */
const CARAS_MAXIMAS = 8;
/** La habilidad del que empuña, para que ningún arma salga «sin destreza». */
const HABILIDAD = "100";

/**
 * El `Guion` con los comandos de objeto que tocan el modelo de vista, y con el
 * lado —cliente o servidor— que diga quien lo monta.
 */
class GuionDeArma extends Guion {
  constructor(opciones, lado) {
    // ── LA CABECERA SE CARGA COMO LA CARGA EL MOTOR, y sólo AQUÍ ───────────
    //
    //     VarValue = msstring(GETCONST_COMPATIBLE(VarValue));     script.cpp:5410
    //
    // Un `const` cuyo valor es OTRA constante ya declarada guarda el valor de
    // ésa (`GetConst`, :349-354):
    //
    //     const ANIM_ATTACK1 2
    //     const MELEE_VIEWANIM_ATK ANIM_ATTACK1      blunt_base_onehanded.script:8 y :12
    //
    // guarda «2». El `Guion` de este puerto guarda el NOMBRE y su resolver baja
    // un nivel, así que `playviewanim MELEE_VIEWANIM_ATK` recibe
    // «ANIM_ATTACK1», que con `atoi` es 0: la secuencia de SACAR el arma.
    // `cargarCabecera` (src/play/efectos.js) ya lo hace bien para los efectos
    // desde el 97, y dice por qué no se cambió para todos: mueve números en
    // todos los guiones y pide su propio experimento. Aquí se usa la misma, y
    // el intérprete general se queda como estaba — ver el informe.
    super({ ...opciones, preload: [] });
    cargarCabecera(this, opciones.preload ?? []);
    this.lado = lado;
    /** El reloj de la pasada, en segundos desde el `_start`. */
    this.t = 0;
    /** Lo que ha pasado con el modelo de vista: `{ t, indice?, modelo?, por }`. */
    this.linea = [];
    /** El modelo de vista puesto con `setviewmodel`, o `undefined` si nadie lo ha puesto. */
    this.modelo = undefined;
    /** Los `registerattack`, en el orden del motor. */
    this.registrados = [];
    /** `CurrentAttack != NULL`: lo que contesta `game.item.attacking`. */
    this.atacando = false;
  }

  resolver(texto, ev = null) {
    const t = String(texto ?? "");
    // script.cpp:4590-4594: `IsServer` / `!IsServer`.
    if (t === "game.serverside") return this.lado === "servidor" ? "1" : "0";
    if (t === "game.clientside") return this.lado === "cliente" ? "1" : "0";
    // `pItem->CurrentAttack ? true : false` y `m_Location == ITEMPOS_HANDS`
    // (scriptcmds.cpp:1319-1320), por `game.item.<prop>` (script.cpp:4692-4700).
    if (t === "game.item.attacking") return this.atacando ? "1" : "0";
    if (t === "game.item.inhand") return "1";
    // ── Y UNA CONSTANTE QUE VALE UN GETTER SE EVALÚA AL USARLA ─────────────
    //
    // En el motor la constante se sustituye al ANALIZAR la línea y `GetVar`
    // resuelve, al ejecutar, ya su valor:
    //
    //     ScriptCmd.m_Params.add(GetConst(cBuffer));                 script.cpp:5653
    //     Params.add(GetVar(Event.GetLocal(Cmd.m_Params[icmd + 1])));       :5742-5744
    //
    // Con `const MELEE_VIEWANIM_ATK $rand(ANIM_ATTACK1,ANIM_ATTACK2)`
    // (smallarms_base.script:18) el motor tira el dado; el `Guion` de este
    // puerto devuelve el TEXTO «$rand(…)», que con `atoi` es 0.
    if (!ev?.locales?.has(t) && !this.vars.has(t) && this.constantes.has(t)) {
      const valor = String(this.constantes.get(t));
      if (valor.startsWith("$") && valor !== t) return this.getter(valor, ev);
    }
    return super.resolver(texto, ev);
  }

  ejecutarComando(c, params, ev) {
    switch (c.nombre) {
      // `#ifndef VALVE_DLL` (genericitem.cpp:2017): en el servidor no hace nada.
      case "playviewanim":
        if (this.lado === "cliente" && params.length >= 1) {
          this.linea.push({ t: this.t, indice: atoi(params[0]), crudo: String(params[0]), por: "playviewanim", modelo: this.modelo });
        }
        return true;
      // `#ifdef VALVE_DLL` (scriptcmds.cpp:6842): sólo el servidor, y con dos
      // parámetros. El objeto es `ent_me` en los 833 guiones de `items/`.
      case "splayviewanim":
        if (this.lado === "servidor" && params.length >= 2) {
          this.linea.push({ t: this.t, indice: atoi(params[1]), crudo: String(params[1]), por: "splayviewanim", modelo: this.modelo });
        }
        return true;
      case "setviewmodel":
        this.modelo = String(params[0] ?? "");
        this.linea.push({ t: this.t, modelo: this.modelo, por: "setviewmodel" });
        return true;
      case "registerattack": {
        const v = (n) => this.resolver(`reg.attack.${n}`, ev);
        this.registrados.push({ retorno: v("callback"), teclas: v("keys"), carga: v("chargeamt"), tipo: v("type") });
        return true;
      }
      default:
        return super.ejecutarComando(c, params, ev);
    }
  }
}

/** Monta el arma de un lado y la deja nacida y empuñada. */
function montar(guion, lado, dado) {
  const cola = [];
  const g = new GuionDeArma({
    eventos: guion.eventos, preload: guion.preload, nombre: `arma (${lado})`,
    entorno: {
      ...entornoVacio(),
      azar: dado,
      azarFlotante: (a) => a,
      // Los `callevent <segundos> <evento>`: se apuntan con su hora y los corre
      // `pasada`, por orden, mientras dure el ataque.
      programar: (retardo, hacer) => { cola.push({ t: g.t + retardo, hacer }); },
      // Las propiedades que este entorno contesta aunque no estén en la lista
      // del intérprete (sin esto `$get` devuelve «0» sin preguntar).
      propiedadesPropias: new Set(["mp", "maxmp", "hp", "maxhp", "scriptvar", "keydown", "id"]),
      propiedad(ref, prop, resto = []) {
        const p = String(prop ?? "");
        if (p === "scriptvar") return String(resto[0] ?? "");
        if (p.startsWith("skill.")) return HABILIDAD;
        // Y tiene vida y maná: sin maná la Blood Drinker vuelve a la mano en el
        // mismo `_start` en que se lanza (swords_blood_drinker.script:156-160).
        if (p === "mp" || p === "maxmp" || p === "hp" || p === "maxhp") return "1000";
        if (p === "id") return String(ref ?? "");
        return "0";
      },
    },
  }, lado);
  g.cola = cola;
  // El orden del motor al darle un objeto al personaje: el bloque sin nombre,
  // `game_spawn` y `game_deploy` (playershared.cpp:1524-1544).
  g.llamar("", []);
  g.llamar("game_spawn", []);
  g.llamar("game_deploy", []);
  return g;
}

/**
 * Una pasada de `<retorno>_start` en los dos lados, con lo que programe para
 * después mientras dure el ataque. Devuelve la línea de tiempo junta.
 */
function pasada(guion, retorno, cara, duracion) {
  const tiradas = [];
  const dado = (a, b) => {
    tiradas.push([a, b]);
    // La primera tirada sale con la cara pedida, y con ella todas las que
    // tiren EL MISMO dado: el intérprete resuelve dos veces el valor de un
    // `local X <constante>` (una al preparar los parámetros y otra al
    // guardarlo), así que «la primera» son dos llamadas. Las demás, la más baja.
    const [a0, b0] = tiradas[0];
    return cara !== null && a === a0 && b === b0 ? Math.min(b, Math.max(a, cara)) : a;
  };
  const lados = {};
  for (const lado of ["cliente", "servidor"]) {
    const g = montar(guion, lado, dado);
    const inicial = g.modelo;
    g.linea.length = 0; g.cola.length = 0; tiradas.length = 0; g.t = 0;
    g.atacando = true;
    const hubo = g.llamar(`${retorno}_start`, []);
    // Lo programado, por orden de hora y sin pasarse del fin del ataque: al
    // acabar, `CancelAttack` deja `CurrentAttack` a nulo y los guiones lo miran
    // (`if game.item.attacking`, blunt_base_onehanded.script:90).
    for (let vueltas = 0; g.cola.length && vueltas < 64; vueltas++) {
      g.cola.sort((a, b) => a.t - b.t);
      const s = g.cola.shift();
      if (s.t > duracion) break;
      g.t = s.t;
      s.hacer();
    }
    lados[lado] = { hubo, linea: [...g.linea], tiradas: [...tiradas], inicial };
  }
  olvidarGlobales();
  // El mensaje del servidor llega después de la pasada del cliente: a igual
  // hora, lo del servidor va detrás.
  const linea = [
    ...lados.cliente.linea.map((x) => ({ ...x, orden: 0 })),
    ...lados.servidor.linea.map((x) => ({ ...x, orden: 1 })),
  ].sort((a, b) => a.t - b.t || a.orden - b.orden);
  return {
    hubo: lados.cliente.hubo || lados.servidor.hubo,
    linea,
    inicial: lados.cliente.inicial,
    tiradas: lados.cliente.tiradas.length ? lados.cliente.tiradas : lados.servidor.tiradas,
  };
}

const esNinguno = (m) => m !== undefined && String(m).toLowerCase() === "none";

/** Lo que una pasada deja puesto al EMPEZAR (t = 0) y lo que cambia después. */
function resumen(p) {
  const propio = (m) => m === undefined || m === p.inicial;
  const alEmpezar = p.linea.filter((x) => x.t === 0);
  // Sólo las que caen sobre el modelo DEL ARMA: una secuencia puesta después
  // de un `setviewmodel` a otro modelo (o a ninguno) es de ése, y colgársela
  // al arma pondría un índice de otro archivo.
  const anim = alEmpezar.filter((x) => x.indice !== undefined && propio(x.modelo)).at(-1) ?? null;
  const modelo = alEmpezar.filter((x) => x.por === "setviewmodel").at(-1)?.modelo;
  const despues = p.linea.filter((x) => x.t > 0);
  return {
    indice: anim ? anim.indice : null,
    por: anim ? anim.por : null,
    sinResolver: Boolean(anim) && !esNumero(anim.crudo),
    sinModelo: esNinguno(modelo),
    // Las secuencias que se ponen DESPUÉS, sobre el modelo del arma.
    tardias: despues.filter((x) => x.indice !== undefined && propio(x.modelo))
      .map((x) => ({ t: x.t, indice: x.indice, sinResolver: !esNumero(x.crudo) })),
    // Y lo que pasa sobre OTRO modelo —la patada cambia el de vista entero
    // (base_kick.script:39-52)—: se dice y no se aplica.
    otroModelo: [...new Set(p.linea.filter((x) => x.modelo !== undefined && !propio(x.modelo) && !esNinguno(x.modelo))
      .map((x) => String(x.modelo)))],
  };
}

/**
 * La vista de un ataque: las secuencias que su `<retorno>_start` puede dejar
 * puestas (una por cara del dado), las que pone después y si quita el modelo.
 *
 * `secuencias` vacío quiere decir que el evento NO toca la secuencia al empezar
 * —o que no existe—, y entonces el motor deja la que hubiera: no es «la 0».
 */
export function vistaDeRetorno(guion, retorno, duracion = Infinity) {
  const vacia = { retorno: retorno ?? null, existe: false, secuencias: [], tardias: [], sinModelo: false, otroModelo: [], por: null, dado: null, sinResolver: false };
  if (!retorno) return vacia;
  const primera = pasada(guion, retorno, null, duracion);
  const r = resumen(primera);
  const out = { ...vacia, existe: primera.hubo, ...r, secuencias: [] };
  delete out.indice;
  const t = primera.tiradas[0] ?? null;
  if (!t || t[1] - t[0] + 1 > CARAS_MAXIMAS || t[1] <= t[0]) {
    if (r.indice !== null) out.secuencias.push(r.indice);
    return out;
  }
  out.dado = t;
  // UNA POR CARA, y con sus repeticiones: si dos caras dan la misma secuencia,
  // ésa sale el doble, y quitarlas cambiaría el reparto.
  for (let cara = t[0]; cara <= t[1]; cara++) {
    const c = resumen(pasada(guion, retorno, cara, duracion));
    if (c.indice !== null) out.secuencias.push(c.indice);
    if (c.sinResolver) out.sinResolver = true;
  }
  return out;
}

/**
 * Todo lo de un arma: lo que registra el intérprete (para cotejarlo con la
 * ficha) y la vista de cada ataque que se le pida.
 *
 * @param {string} ruta      `items/swords_blood_drinker`
 * @param {{retorno:string|null, duracion:number|null}[]} ataques  los de la ficha
 * @returns {{registrados:Array, vistas:Array}|null}  `vistas` va en el orden de `ataques`
 */
export function vistaDeArma(ruta, ataques, raiz = RAIZ_POR_OMISION) {
  const guion = cargarGuion(ruta, new Set(), raiz);
  if (!guion || !guion.eventos.length) return null;
  const g = montar(guion, "servidor", (a) => a);
  olvidarGlobales();
  const vistas = ataques.map((a) => vistaDeRetorno(guion, a?.retorno ?? null, a?.duracion ?? Infinity));
  return { registrados: g.registrados, vistas };
}
