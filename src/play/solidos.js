// LO QUE CHOCA Y NO ES EL MAPA: los adornos y los bichos.
//
// Hasta ahora sólo chocaba el `.bsp`. Se andaba a través del barril, de la
// silla y del goblin — y eso no se ve como un fallo de física: se ve como que
// el mundo es una foto.
//
// ── Y lo primero es que NO todos chocan, y lo dice el mod ──────────────────
//
// Un `env_model` sólo es sólido si su entidad trae `dmg`:
//
//     msmapents.cpp:311   if (pev->dmg) {
//                           pev->solid = SOLID_SLIDEBOX;
//                           UTIL_SetSize(pev, vMins, vMaxs);
//                         }
//
// En Gate City eso son **76 de los 91** adornos quietos. Los otros quince
// —helechos, flores, el carro, la carreta, los troncos de la chimenea— se
// atraviesan en el juego original también. Ponerles colisión habría sido
// «arreglar» algo que no está roto, y el jugador se habría quedado enganchado
// en un helecho.
//
// Y el tamaño tampoco se deduce del modelo: es el `mins`/`maxs` que escribió el
// mapeador en la entidad. Un barril de 32×32×36 unidades tiene una caja más
// pequeña que su malla, a propósito, para que no estorbe al pasar.
//
// ── Por qué cajas y no la malla ────────────────────────────────────────────
//
// Porque es lo que hace el motor: `SOLID_SLIDEBOX` es una CAJA, no un trimesh.
// Usar la malla del modelo sería más preciso que el original y más caro, y
// además cambiaría cómo se anda entre las sillas de la taberna.

/**
 * Pone un colisionador fijo por cada adorno sólido.
 *
 * `manifiesto` es `malla.json`. Devuelve `null` si no hay ninguno.
 */
export function solidosDeAdornos(manifiesto, mundo, RAPIER) {
  const colocaciones = manifiesto.adornos?.colocaciones ?? [];
  const solidos = colocaciones.filter((c) => c.solido);
  if (!solidos.length) return null;
  const puestos = [];
  for (const c of solidos) {
    const s = c.solido;
    const medio = [0, 1, 2].map((k) => (s.max[k] - s.min[k]) / 2);
    const centro = [0, 1, 2].map((k) => (s.max[k] + s.min[k]) / 2);
    // Una caja de lado cero no es un obstáculo: es un colisionador degenerado
    // que Rapier acepta y que no choca con nada. Mejor no ponerlo que ponerlo
    // y creer que está.
    if (medio.some((m) => m <= 0)) continue;
    const cuerpo = mundo.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(centro[0], centro[1], centro[2])
    );
    const col = mundo.createCollider(
      RAPIER.ColliderDesc.cuboid(medio[0], medio[1], medio[2]), cuerpo
    );
    puestos.push({ modelo: c.modelo, caja: s, cuerpo, colisionador: col });
  }
  return {
    n: puestos.length,
    deCuantos: colocaciones.length,
    puestos,
    /** Los que NO chocan, que es la mitad interesante del dato. */
    atravesables: colocaciones.length - solidos.length,
  };
}

/**
 * Y los BICHOS: un cilindro por cada uno, del tamaño que dice su caja.
 *
 * El motor los hace `SOLID_SLIDEBOX` con el casco que les da su script. Aquí el
 * tamaño sale de la caja del propio `.mdl` —que `tools/bicho.mjs` ya escribe—
 * recortada al ALTO y al RADIO, porque una caja de modelo incluye los brazos
 * extendidos de alguna animación y eso haría a un goblin el doble de ancho de
 * lo que parece.
 *
 * Son cuerpos CINEMÁTICOS y no fijos porque el paseo los mueve, y su
 * colisionador los tiene que seguir. Quien los mueva llama a `seguir()`.
 */
export function solidosDeBichos(bichos, mundo, RAPIER, { unidadesPorMetro = 39.37 } = {}) {
  if (!bichos?.instancias?.length) return null;
  const puestos = [];
  /**
   * LOS DOS CASOS QUE NO SE PUEDEN QUEDAR CALLADOS (80).
   *
   * `delMalla` son los que no traen `setsize` en su guion y se han tenido que
   * medir de la malla; `sinTamano` los que se han quedado SIN colisionador.
   * Un filtro que descarta en silencio es el sitio donde cabe un pueblo — es la
   * lección del 63 con la familia `msnpc_`—, así que esto se cuenta y se
   * devuelve, y quien monte el mundo lo escribe en la consola.
   */
  const delMalla = [];
  const sinTamano = [];
  /**
   * El cilindro de UNO. Se saca a una función porque desde el 39 hace falta
   * ponerlo y quitarlo en marcha: un bicho que todavía no ha aparecido —38 de los
   * 69 de Gate City son fichas de un área— no puede tener cilindro, o sería un
   * muro invisible en medio del pueblo esperando su turno.
   */
  const poner = (i) => {
    if (puestos.some((p) => p.instancia === i)) return false;
    // ── EL TAMAÑO SALE DEL GUION Y NO DE LA MALLA — el 80 ──────────────────
    //
    // Hasta aquí el colisionador salía de la caja MEDIDA del `.mdl`, con el
    // razonamiento de que la cabecera venía vacía. Pero el mod no deduce el
    // casco de la malla: lo escribe el guion, y el motor lo usa tal cual.
    //
    //     UTIL_SetSize(pev, Vector(-(m_Width / 2), -(m_Width / 2), 0),
    //                       Vector(m_Width / 2, m_Width / 2, m_Height));
    //                                       msmonsterserver.cpp:244
    //     m_Width  = atof(Params[0]);   // `setsize <ancho> <alto>`
    //     m_Height = atof(Params[0]);           npcscript.cpp:201 y :210
    //
    // Y no es un decimal de más. Para la rata del templo de Edana el guion dice
    // 32×32×32 y la malla medía 33,5 de ancho y **28,5 de alto**; de 69 bichos de
    // Gate City cambian 61, de 48 de Edana 44 y de 74 de `gertenheld_forest2` 57.
    // Peor: el mismo bicho tenía DOS tamaños en el mismo fotograma, porque
    // `candidatosDeGolpe()` ya usaba el del guion para decidir a quién le das.
    //
    // LO QUE ESTO CAMBIA Y HAY QUE SABER: los once `deralia/commoner_sitting` de
    // Edana declaran `ancho 5`. Con el casco del guion se atraviesan **casi del
    // todo, y así es en el juego original**: son los que están sentados en la
    // taberna, y el mapeador les puso ese ancho para que no estorbaran. Con la
    // caja de la malla los hacíamos sólidos, que era más cómodo y no era MSR.
    const delGuion = {
      ancho: i.ficha?.ia?.ancho ?? i.ficha?.ancho ?? 0,
      alto: i.ficha?.ia?.alto ?? i.ficha?.alto ?? 0,
    };
    const caja = i.caja ?? null;
    let alto = delGuion.alto / unidadesPorMetro;
    let radio = (delGuion.ancho / 2) / unidadesPorMetro;
    let deDonde = "el guion";
    if (!(alto > 0) || !(radio > 0)) {
      // SIN NÚMEROS EN EL GUION se cae a la caja medida, y se APUNTA. Son 5 de
      // los 74 de `gertenheld_forest2` —y 0 de Gate City y 0 de Edana, o sea el
      // caso que sólo enseña el tercer mapa—. Dejarlos sin colisionador sería
      // cambiar un tamaño flojo por un pueblo que se atraviesa, y hacerlo en
      // silencio es el filtro del 63: ahora dice cuántos y por qué.
      if (!caja) { sinTamano.push(i.ficha?.script ?? "?"); return false; }
      alto = (caja.max[2] - caja.min[2]) / unidadesPorMetro;
      const anchoX = (caja.max[0] - caja.min[0]) / unidadesPorMetro;
      const anchoY = (caja.max[1] - caja.min[1]) / unidadesPorMetro;
      radio = Math.min(anchoX, anchoY) / 2;
      deDonde = "la malla, porque su guion no dice `setsize`";
      delMalla.push(i.ficha?.script ?? "?");
    }
    if (!(alto > 0) || !(radio > 0)) { sinTamano.push(i.ficha?.script ?? "?"); return false; }
    const cuerpo = mundo.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const col = mundo.createCollider(
      // UN CILINDRO Y NO UNA CAJA, y conviene decir qué es nuestro: el motor usa
      // una **caja alineada con los ejes** (`UTIL_SetSize`), y una caja de
      // GoldSrc no gira nunca con su dueño. O sea que el argumento de siempre
      // —«un bicho que gira no cambia de anchura»— es exactamente lo que hace el
      // motor, y el cilindro lo cumple igual. La diferencia que queda son las
      // ESQUINAS: un cilindro de radio `ancho/2` cabe dentro de la caja, así que
      // un bicho es un pelo más fácil de rodear en diagonal. Se conserva por no
      // cambiar dos cosas a la vez con el tamaño; está medido y dicho aquí.
      RAPIER.ColliderDesc.cylinder(alto / 2, radio), cuerpo
    );
    const n = i.donde;
    cuerpo.setNextKinematicTranslation({ x: n[0], y: n[1] + alto / 2, z: n[2] });
    puestos.push({ instancia: i, cuerpo, colisionador: col, alto, radio, deDonde });
    return true;
  };
  // Los dormidos no entran: `dormido` lo pone el aparecedor (src/play/aparecer.js).
  for (const i of bichos.instancias) if (!i.dormido) poner(i);
  // ── Y NO SE DEVUELVE `null` NUNCA TENIENDO BICHOS — el 80 ────────────────
  //
  // Antes, cero cilindros con alguien despierto devolvía `null`, y eso tiraba
  // **la lista que explica por qué**: `sinTamano` llega aquí justo en el caso en
  // el que más falta hace leerla. El razonamiento ya estaba escrito para los
  // dormidos —«dejaría al mundo sin gestor de cilindros para siempre»— y vale
  // igual aquí: sin gestor, un bicho que aparezca después tampoco puede recibir
  // el suyo. Lo cazó la prueba del control negativo de `sinTamano`, que no podía
  // llegar a mirarlo.
  const seguir = () => {
    for (const p of puestos) {
      // `donde` y no `nodo.position`: desde el 28 la posición de un bicho vive
      // en la manada, sin Three, y por eso este archivo entero sirve igual en el
      // servidor — que es quien ahora los mueve.
      const n = p.instancia.donde;
      p.cuerpo.setNextKinematicTranslation({ x: n[0], y: n[1] + p.alto / 2, z: n[2] });
    }
  };
  seguir();
  return {
    get n() { return puestos.length; }, deCuantos: bichos.instancias.length, puestos, seguir,
    /** Ver `delMalla` y `sinTamano` arriba: los dos casos que se dicen en voz alta. */
    get medidosDeLaMalla() { return [...delMalla]; },
    get sinTamano() { return [...sinTamano]; },
    /** Devolverle el cilindro a uno: al aparecer. Ver `quitar`. */
    poner,
    /**
     * Quitarle el cilindro a uno, que es lo que hace falta al morir.
     *
     * El motor lo dice con una línea: `pev->solid = SOLID_NOT` en
     * `SUB_StartFadeOut` (combat.cpp:642). Sin esto el cadáver sigue siendo un
     * muro invisible en medio de la calle, y eso no se ve: se choca.
     */
    quitar(instancia) {
      const k = puestos.findIndex((p) => p.instancia === instancia);
      if (k < 0) return false;
      mundo.removeRigidBody(puestos[k].cuerpo);
      puestos.splice(k, 1);
      return true;
    },
  };
}
