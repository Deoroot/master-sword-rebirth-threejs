// TU PROPIO CADÁVER, que es lo que la cámara de la muerte está mirando.
//
// Sin esto la cámara del 41 se apartaba metro y ochenta, se giraba y enfocaba
// **el aire**: el jugador local no tiene cuerpo dibujado —sólo el modelo de
// vista de las manos—, así que morir se veía como «la cámara se ha ido sola».
//
// En el motor son dos cosas en la misma línea de `Killed`:
//
//     m_Corpse = (CCorpse *)GetClassPtr((CCorpse *)NULL);
//     m_Corpse->CreateCorpse(this, LoseGoldPercent);
//     CinematicCamera(TRUE, vOrigin, vAngles);
//     pev->effects |= EF_NODRAW;
//                                                        player.cpp:795-800
//
// O sea: se crea una entidad nueva que es una copia tuya y **a ti se te deja de
// dibujar**. Aquí no hace falta lo segundo, porque a ti no se te dibujaba ya.
//
// ── El cadáver de Master Sword NO SE TUMBA, y hay que decirlo ──────────────
//
// Es lo primero que uno da por hecho y es falso. `CreateCorpse` copia la
// secuencia del muerto tal cual:
//
//     pev->sequence     = pSource->pev->sequence;
//     pev->gaitsequence = pSource->pev->gaitsequence;
//     ...
//     ResetSequenceInfo();
//     pev->frame = 0;
//                                                    corpse.cpp:86-87,106-108
//
// y la animación de morir del jugador **está comentada** en `Killed`:
//
//     /*m_Activity = GetDeathActivity( );
//       SetAnimation( MONSTER_ANIM_BREAK );
//       SetAnimation( MONSTER_ANIM_DIE, NULL, (void *)m_Activity );*/
//                                                        player.cpp:717-719
//
// Así que el cadáver de un jugador se queda **de pie**, con la animación que
// llevara, desde su primer fotograma. No es cosa nuestra y no se «arregla»: se
// porta y se escribe aquí, que es donde alguien lo va a buscar.
//
// Y tampoco es el modelo del jugador con su equipo: el bloque que duplicaría el
// `Body` —o sea la armadura y las armas— está comentado entero
// (corpse.cpp:73-77). El cadáver es el cuerpo desnudo.

import { cargarModelo } from "./bichos.js";
import { figuraDeJugador } from "./otros.js";

import { BASE_COMUN } from "../play/recursos.js";
const BASE_POR_DEFECTO = BASE_COMUN;
/**
 * Cuánto tarda en desaparecer.
 *
 *     SetThink(&CBaseEntity::SUB_StartFadeOut);
 *     pev->nextthink = gpGlobals->time + MSITEM_TIME_EXPIRE;   // 120
 *                                                     corpse.cpp:53,71
 *
 * **Dos minutos** antes de EMPEZAR a irse, y luego el desvanecido de
 * `SUB_StartFadeOut`, que es el mismo de los bichos ya portado (3,64 s). En la
 * práctica el jugador nunca lo ve desaparecer: reaparece a los cinco segundos.
 *
 * Aquí el cadáver se quita al reaparecer y no a los 120 s, y es una diferencia
 * declarada: el motor lo deja tirado en el mapa porque **se le puede saquear el
 * oro**, y el saqueo de cadáveres no está portado. Dejar un cuerpo indefinido en
 * medio de la calle sin nada que hacer con él sería adorno, no fidelidad.
 */
export const EXPIRA = 120;
export const DESVANECIDO = 3.64;

/**
 * Monta el cadáver. Uno solo: no hay dos muertos tuyos a la vez.
 *
 * Devuelve `null` si el modelo del cuerpo no está horneado (`npm run cuerpo`),
 * que es lo mismo que hace `cargarOtros`: sin cuerpo no hay cadáver, y el resto
 * de la muerte —el velo, el centrado, la cámara— sigue funcionando.
 */
export async function cargarCadaver({
  base = BASE_POR_DEFECTO, U = 39.37, carpeta = "cuerpos/human_reference_b40",
} = {}) {
  const modelo = await cargarModelo(carpeta, { base });
  if (!modelo) return null;

  const figura = figuraDeJugador(modelo, { id: -1, nombre: "corpse", U });
  figura.nodo.visible = false;
  let puesto = false;
  let t = 0;

  return {
    grupo: figura.nodo,
    /**
     * Tumba —es un decir— el cadáver donde el jugador estaba.
     *
     * `secuencia` es la que llevaba puesta, que es lo que copia `CreateCorpse`.
     * Con el modelo horneado sólo hay seis, y las dos que puede llevar un
     * jugador de pie son las que usa `cargarOtros`: «attention» y «run».
     */
    poner(pies, yaw, secuencia = "attention") {
      figura.nodo.position.set(pies[0], pies[1], pies[2]);
      // El mismo cuarto de vuelta que en `otros.js`: el `yaw` mira a −Z con cero
      // y el `.mdl` mira a +X.
      figura.nodo.rotation.y = yaw - Math.PI / 2;
      figura.pon(secuencia);
      // `pev->frame = 0`: el cadáver empieza la animación de cero, no la sigue
      // desde donde estaba. Por eso se reinicia el mezclador.
      figura.mezclador.setTime(0);
      figura.nodo.visible = true;
      puesto = true; t = 0;
      return { pies: [...pies], yaw, secuencia: figura.secuencia };
    },
    quitar() {
      figura.nodo.visible = false;
      puesto = false; t = 0;
    },
    /**
     * Un paso.
     *
     * El cadáver SIGUE ANIMÁNDOSE, y eso es lo que hace el motor: copia la
     * secuencia y llama a `ResetSequenceInfo()`, que la deja andando. Un muerto
     * de pie respirando es exactamente lo que se ve en Master Sword.
     */
    paso(dt) {
      if (!puesto || !(dt > 0)) return;
      t += dt;
      figura.mezclador.update(dt);
    },
    get puesto() { return puesto; },
    estado() {
      return {
        puesto,
        t: Number(t.toFixed(3)),
        secuencia: figura.secuencia,
        pies: [figura.nodo.position.x, figura.nodo.position.y, figura.nodo.position.z],
        yaw: figura.nodo.rotation.y,
        expira: EXPIRA,
      };
    },
  };
}
