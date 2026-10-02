// LO QUE EL GUION LE HACE A LA CÁMARA — `game.cleffect.*`, el 65.
//
// En Master Sword el guion del jugador **mueve la vista escribiendo
// variables**. No hay un comando «mueve la cámara»: el script pone
// `game.cleffect.view_ofs.z` y el cliente, cada fotograma, lo suma a la vista
// antes de dibujar.
//
//     Vector &ViewOfs = *(Vector *)&pparams->vieworg;
//     SCRIPT_CONTROLVEC_POS( "game.cleffect.view", ViewOfs );
//     SCRIPT_CONTROLVEC_ANG( "game.cleffect.view", ViewAng );
//     SCRIPT_CONTROLVEC_POS( "game.cleffect.viewmodel", ViewMdlOfs );
//     SCRIPT_CONTROLVEC_ANG( "game.cleffect.viewmodel", ViewMdlAng );
//                                            hudscript.cpp:208-221
//
// Es una interfaz por variable, no por llamada, y eso tiene una consecuencia
// que se nota al portarlo: **quien escribe no le habla a nadie**. El script no
// sabe si hay cámara; deja el número puesto y el que dibuje que lo lea. Por eso
// el golpe de vista al aterrizar se apaga solo — el guion vuelve a escribir un
// cero— y no hace falta que nadie lo cancele.
//
// El caso que lo enseñó es el aterrizaje duro:
//
//     setvard game.cleffect.view_ofs.z LCL_BOBAMT
//     multiply LCL_BOBAMT 1.01
//     setvard game.cleffect.viewmodel_ofs.z LCL_BOBAMT
//     callevent 0.01 player_hitground_adjview
//                              player/player_main.script, `player_hitground_adjview`
//
// El arma baja **un 1 % más** que la vista, que es lo que hace que el modelo se
// hunda un pelo respecto a la pantalla. Eso es del guion, no del motor.
//
// ── LA ERRATA, que se porta ─────────────────────────────────────────────────
//
//     if( Script->VarExists( name "_set.x" ) ) vec.x  = atof(Script->GetVar( name "_ofs.x" ));
//     if( Script->VarExists( name "_set.y" ) ) vec.y  = atof(Script->GetVar( name "_ofs.y" ));
//     if( Script->VarExists( name "_set.z" ) ) vec.z  = atof(Script->GetVar( name "_ofs.z" ));
//                                            hudscript.cpp:39-41
//
// La rama de `_set` **comprueba `_set` y lee `_ofs`**. O sea que poner
// `game.cleffect.view_set.z 10` no pone la vista en 10: la pone en lo que valga
// `view_ofs.z`, que normalmente es 0.
//
// Y lo que lo confirma como errata y no como intención: **la macro de ÁNGULOS,
// tres líneas más abajo, está bien**.
//
//     if( Script->VarExists( name "_set.pitch" ) ) vec.x = atof(Script->GetVar( name "_set.pitch" ));
//                                            hudscript.cpp:47-49
//
// El mismo patrón escrito dos veces, y sólo una tiene el fallo. Va portado con
// el fallo —apartado 3 de CLAUDE.md— y con una prueba que fija las dos, para
// que nadie «arregle» la de posición sin darse cuenta de que cambia el juego.

/** Las dos vistas que el guion puede tocar. `hudscript.cpp:217-220`. */
export const VISTAS = Object.freeze(["view", "viewmodel"]);

/** Los tres ejes de posición y los tres de ángulo, con el nombre del motor. */
export const EJES_POS = Object.freeze(["x", "y", "z"]);
export const EJES_ANG = Object.freeze(["pitch", "yaw", "roll"]);

/**
 * Lo que el guion quiere sumarle a una vista.
 *
 * @param {(nombre:string)=>string|null} leer  cómo se lee una variable del
 *        guion. `null` o `undefined` es «no existe», que es el `VarExists` del
 *        motor: una variable que no está **no suma cero, no se toca**. La
 *        diferencia se nota cuando dos guiones escriben la misma.
 * @param {string} cual  `"view"` o `"viewmodel"`.
 * @returns {{pos:{x:number,y:number,z:number}, ang:{pitch:number,yaw:number,roll:number}}}
 */
export function desplazamientoDeVista(leer, cual = "view") {
  const num = (v) => {
    // `atof`: lo que no es un número es 0, y no un error.
    const n = Number.parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : 0;
  };
  const pos = { x: 0, y: 0, z: 0 };
  const ang = { pitch: 0, yaw: 0, roll: 0 };
  for (const eje of EJES_POS) {
    const ofs = leer(`game.cleffect.${cual}_ofs.${eje}`);
    if (ofs !== null && ofs !== undefined) pos[eje] += num(ofs);
    // LA ERRATA: se pregunta por `_set` y se lee `_ofs`. hudscript.cpp:39-41.
    const set = leer(`game.cleffect.${cual}_set.${eje}`);
    if (set !== null && set !== undefined) pos[eje] = num(ofs);
  }
  for (const eje of EJES_ANG) {
    const ofs = leer(`game.cleffect.${cual}_ofs.${eje}`);
    if (ofs !== null && ofs !== undefined) ang[eje] += num(ofs);
    // Y AQUÍ NO HAY ERRATA: la macro de ángulos lee `_set`, que es lo suyo.
    // No se unifica con la de arriba a propósito: unificarlas sería arreglar
    // la de posición, y eso cambia el juego.
    const set = leer(`game.cleffect.${cual}_set.${eje}`);
    if (set !== null && set !== undefined) ang[eje] = num(set);
  }
  return { pos, ang };
}
