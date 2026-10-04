# Experimento 95, pieza A — el fundido sin banderas y el temblor de la vista

Dos huecos que el 93 y el 94 dejaron escritos:

- **`Effects_GetFade`** (doc/VELO_94.md, «Lo que se entendió mal»): Master
  Sword pone `fadeFlags = 0` en el fundido del motor antes de mirar los guiones.
- **`effect screenshake`** (doc/EFECTOS_RED_93.md §1 y §5.4): el `case
  "effect"` del intérprete se lo pasaba al gancho de la pantalla, que lo
  rechazaba, y se apuntaba.

```bash
node --test test/pantalla95.test.mjs      # 28 verdes
node sondas/pantalla95.mjs                # Gate City por el menú: 14 de 14
```

## 1. `Effects_GetFade`: el fundido no se pinta nunca con sus banderas

### Lo que hace el motor

```c
void CHudScript::Effects_GetFade( screenfade_t &ScreenFade )
{
	float OldScreenAlpha = ScreenFade.fadealpha;
	ScreenFade.fadeFlags = 0;                               hudscript.cpp:250-253
	for (...) { if( !atoi(GetVar("game.cleffect.screenfade.newfade")) ) continue; ... }
```

y quién la llama, en `V_CalcRefdef`, **cada vez que se calcula la vista**:

```c
	screenfade_t sf;
	gEngfuncs.pfnGetScreenFade(&sf);          // copia de clgame.fade (cl_game.c:2757-2760)
	gHUD.m_HUDScript->Effects_GetFade(sf);
	gEngfuncs.pfnSetScreenFade(&sf);          // y de vuelta (cl_game.c:2768-2771)
	                                                        view.cpp:1747-1750
```

`clgame.fade` es **el único fundido del motor**: el del `gmsgFade` del servidor
—`effect screenfade`, la muerte, el golpe, `env_fade`— y el que pintaría un
guion de cliente. Así que esto no es «del camino de guion»: es de todos.

**Y no es «al fotograma siguiente».** Un fotograma de Xash3D lee los mensajes
(`CL_ReadPackets`, cl_main.c:3658), luego actualiza la pantalla
(`SCR_UpdateScreen`, :3686), que calcula la vista (`V_RenderView` →
`pfnCalcRefdef`, cl_view.c:389) y DESPUÉS pinta el HUD (`V_PostRender` →
`CL_DrawHUD` → `CL_DrawScreenFade`, cl_view.c:517 y cl_game.c:958). Entre leer
el mensaje y pintarlo ya ha pasado `Effects_GetFade`. Lo único que sobrevive de
las banderas es lo que `CL_ParseScreenFade` hizo con `FFADE_OUT` al convertir
los tiempos (cl_parse.c:2096-2103):

| bandera | lo que se ve en Master Sword |
| --- | --- |
| `fadein` (0) | nada cambia: la muerte, el tinte de cada golpe y el veneno siguen igual |
| `fadeout` | `fadeSpeed` sale NEGATIVA y `fadeEnd` = llegada + duración, pero se pinta con la fórmula de entrada (cl_game.c:494-501): **nada durante la duración**, y luego sube desde 0 con la misma pendiente hasta `fadeReset` = fadeEnd + aguante |
| `perm` (STAYOUT) | no se queda: se pinta y se va como uno normal |
| `noblend` (MODULATE) | no multiplica: se mezcla con su color |

Con la sangre de demonio (`effect screenfade ent_me 0.5 3 (255,0,0) 255
fadeout`, demon_blood.script:18): HL subiría de 0 a 255 en medio segundo y
aguantaría tres. Master Sword no pinta nada medio segundo, sube a 255 en el
medio segundo siguiente y aguanta hasta los 3,5 s.

En los guiones: **63** `effect screenfade`, de los cuales **17 `fadeout`, 3
`noblend` y 0 `perm`**. Los 17 incluyen los maná de las armas (`mana_faura`,
`mana_sb`… 2 s de duración y 0,5 de aguante: dos segundos de nada y medio
segundo subiendo), el voto de hora (`time_vote`), el señor de hielo y Shadahar.

### Lo que NO se porta

- La otra mitad de la función, la que lee `game.cleffect.screenfade.*` de los
  guiones de CLIENTE (hudscript.cpp:254-281). Sólo la usa `effects/sfx_drunk`, y
  este puerto no corre guiones de cliente.
- El caso en que `V_RenderView` sale antes de calcular la vista
  (`!cl.video_prepped`, o el menú abierto sin `ui_renderworld`,
  cl_view.c:377-378): ahí el fundido SÍ se pinta con sus banderas.

### Cómo quedó

- `src/play/efectospantalla.js`: `fundidoTrasLaVista(sf)`.
- `src/juego/mensajes.js`: `pintarVelo` la llama antes de `alfaDelFundido`, en
  cada fotograma y no en cada mensaje. Es la misma función para el camino de un
  jugador y para `MENSAJE.PANTALLA` del servidor, porque las dos acaban en
  `pantalla()`.

## 2. `effect screenshake`

### Lo que hace el motor

**Servidor** — `ScriptedEffect`, mseffects.cpp:847-876:

```c
else if (Params[0] == "screenshake") {
	REQPARAMS(6);
	UTIL_ScreenShake(StringToVec(Params[1]), atof(Params[2]), atof(Params[3]),
	                 atof(Params[4]), atof(Params[5]));   // pos, amplitud, frecuencia, duración, radio
}
else if (Params[0] == "screenshake_one") { REQPARAMS(5); ... UTIL_ScreenShakeOne(...) }
```

`UTIL_ScreenShake` (hl/util.cpp:1066-1108) recorre a TODOS los jugadores; salta
a quien no esté en el suelo (`FL_ONGROUND`, :1079); con radio ≤ 0 tiembla todo
el mundo y si no, quien esté a menos (`<` estricto, `delta.Length()`, en 3D) —
y **con la amplitud entera**, porque la caída con la distancia está quitada
(«Had to get rid of this falloff - it didn't work well», :1091-1093). Manda
`gmsgShake` con tres `short` en coma fija: amplitud y duración en 4.12,
frecuencia en 8.8 (`FixedUnsigned16`, :1033-1044, con techo 0xFFFF).

**Cliente** — el de Xash3D, que es en el que corre MSR:

- `CL_ParseScreenShake` (cl_parse.c:2045-2059): decodifica; «don't overwrite
  larger existing shake»; `time = cl.time + duration` (el FINAL);
  `next_shake = 0`.
- `pfnCalcShake` (cl_game.c:2243-2290), cada fotograma desde
  `V_CalcNormalRefdef` (view.cpp:578): al vencer `next_shake` sortea tres
  desplazamientos en ±amplitud y un ángulo en ±amplitud/4
  (`COM_RandomFloat`, common.c:120-128), y aplica
  `fracción² · sin(cl.time · freq)` con la fracción de −1 a 0.
- `pfnApplyShake` (cl_game.c:2299-2306): el desplazamiento al origen de la
  vista y el ángulo al ALABEO, con factor 1 para la vista (view.cpp:579) y 0,9
  para el arma (:703).

### Lo que no se adivina leyendo los guiones

- **Todos los temblores del juego tiemblan igual de fuerte.** El guion más
  flojo pide 32 unidades; el 4.12 sin signo tiene techo en 15,9998. De las 60
  líneas activas, las 60 piden 32 o más (12 piden 50, 11 piden 100, 9 piden
  380…). Lo que distingue un temblor de otro es la duración y el radio.
- **La duración también tiene techo**: 16 s. El `20.0` de Undamael dura 16.
- **El desplazamiento se sortea una vez.** El siguiente sorteo es a
  `frequency / duration` segundos (cl_game.c:2263), que con 10 / 1 cae a los
  diez segundos de un temblor de uno. Lo que se mueve es la envolvente.
- **Al acabar no se pone a cero la amplitud** (cl_game.c:2251-2256), sólo lo
  aplicado. Y como uno más flojo no pisa a uno más fuerte, el temblor siguiente
  hereda la amplitud ya decaída del anterior.
- **En el aire no tiembla.**

### El centro: `$relpos` y `$get(ent_me,origin)`

De las 60 líneas, **46** centran en `$relpos(0,0,0)` y **7** en
`$get(ent_me,origin)`. Ninguno de los dos estaba:

- `$relpos` no existía (caía en «getter no soportado» y devolvía su propio
  texto, que `StringToVec` lee como el origen del mapa). Ahora está en
  `src/play/guion.js` (script.cpp:3557-3595): `Center()` u `origin` de la
  entidad más `GetRelativePos(pev->angles, …)`, o, con ángulos explícitos,
  relativo a cero. Pide dos ganchos del entorno, `origenDeMi` y `angulosDeMi`;
  sin ellos se apunta como antes.
- `$get(<jugador>,origin)` contestaba «» en el guion del jugador. Ahora da
  «(x,y,z)» en unidades: el centro de la caja, 36 sobre los pies.
- El `pev->angles` de un jugador NO es su vista: el motor le copia la vista
  con un tercio del cabeceo y el signo cambiado (`angles[PITCH] =
  -(v_angle[PITCH] / 3)`, xash3d engine/server/sv_pmove.c:655; igual en ReHLDS
  sv_user.cpp:993).

### Cómo quedó

- `src/play/temblor.js` (nuevo): la regla entera, sin DOM ni Three —
  `leerTemblor`, `mensajeDeTemblor`, `temblorParaJugador`, `nuevoTemblor`,
  `temblorAlLlegar`, `pasoDelTemblor`, `temblorEnEscena`—.
- `src/play/guionjugador.js`: `effect screenshake|screenshake_one` en
  `comandoDePantalla`; el suelo y el radio salen de `fisica.origen()` y
  `fisica.enSuelo()`; sin cuerpo se apunta. Cada decisión, llegue o no, queda
  en `temblores`. Los efectos del jugador lo heredan (la sangre de demonio).
- `src/play/guion.js`: `$relpos`.
- `src/main.js`: `fisica.origen/enSuelo/angulos`, el `clgame.shake`
  (`temblor`), `pasoDelTemblorDeVista` en `pasoDelHud` y el desplazamiento y
  el alabeo en `colocarCamaraDelOjo`, junto al empujón del 94.
- `src/dev/sonda.js`: `probe.pantalla95`.

## 3. Cómo se comprobó

- `test/pantalla95.test.mjs`, 28: la regla con los números a mano (los 127 y
  255 del `fadeout`, el 128 que pintaría HL como control, los 65 535 del techo,
  el paso de `pfnCalcShake` con −0,2103677462, las cuatro tiradas del dado y
  con qué se le llama) y el camino: un `GuionDelJugador` con la ficha y los
  efectos horneados corre `ext_quake_fx` y la sangre de demonio de verdad.
  `test/juego_misiones.test.mjs`: los getters pasan a `21 + 6 + 1 + 1 + 1`, con
  la lectura vieja al lado.
- `sondas/pantalla95.mjs`, 14, por el menú. Mide la CÁMARA (posición menos el
  ojo, y `rotation.z`) y el `style` del velo, fotograma a fotograma en el RELOJ
  DEL JUEGO. El terremoto: hasta 12 unidades y 0,85° de alabeo, ningún eje por
  encima de 16 con el guion pidiendo 50, y vuelta al ojo a los 3 s. En el aire:
  decidido `null` y la cámara quieta. La sangre: alfa 0 en los 0,42 s primeros,
  hasta 229 en rojo entre 0,62 y 0,96, y el latido de 1 s moviendo la cámara
  desde el guion del EFECTO.
- **Roturas deliberadas**, en una copia aparte del árbol (con `build/`,
  `node_modules` y `../MSC` enlazados), cada una con su marca `ROTURA95A`
  comprobada con `grep`:

  | rotura | Node (rojas, de 156 en las cuatro pruebas vecinas) | sonda |
  | --- | --- | --- |
  | R1 `mensajes.js` sin `fundidoTrasLaVista` | 0 | **roja**: «durante la duración el velo NO se pinta» (205) |
  | R3 la cámara sin el temblor | 0 | **roja**: tiembla, alabea y el latido (0,00 u) |
  | R1 + R3 juntas | 0 | 10/14 |
  | R2 `fundidoTrasLaVista` vacía, R4 sin techo, R5 sin `FL_ONGROUND`, R6 `origin` contesta «», R7 `$relpos` sin `case` | 14 | — |
  | R5 + R6 + R7 juntas | — | 9/14: el terremoto no llega, el origen es (0,0,0), el latido no |
  | R5 sola | — | 13/14: **roja** en el aire (11 u de cámara) |
  | R4 sola | — | 10/14: el mensaje dice 204 800 y la cámara tiembla 1,4 u |

  R1 y R3 son la regla del 82: Node verde, sonda roja.
- Vecinas: `muerte41` 41/41, `efectosred93` 24/24 y `veneno91` 15/15 (las dos
  últimas a la segunda o tercera pasada: ver §5.6).
- `npm test`: 2 693 verdes, 0 rojas, 1 saltada, 1 «todo».

## 4. Lo que se entendió mal por el camino

- **«Pierde sus banderas al fotograma siguiente»** (el 94 y el encargo). Las
  pierde antes del PRIMER pintado: el orden del fotograma lo pone entre leer y
  pintar. Y **no es sólo del camino de guion**: es `clgame.fade`, el de todos.
- **La sonda muestreaba en el reloj de la pared**, y con la máquina cargada
  (cinco sesiones a la vez, 52 `node`) el juego iba a **3 fotogramas por
  segundo** con el paso topado a 0,1 s: un segundo de pared eran tres décimas de
  juego. «A los 3 s se acaba» salía rojo con el temblor a medias. Ahora se
  muestrea en `S.reloj`.
- **«En el aire» que no estaba en el aire, dos veces.** Subirle cuatro metros
  no lo despegó (`grounded` siguió en `true`); darle `vel = [0, 400, 0]`
  tampoco, porque con `grounded` el paso de `player.js` CAMBIA la subida por el
  «pegado al suelo» (player.js:345-347). Lo que funcionó: un metro.
- **Y ese metro lo dejó enganchado**: el cuerpo se quedó en el aire cayendo a
  −1 040 u/s sin moverse —el colisionador se solapa con algo ahí—, y la medida
  siguiente (el latido) decidía «en el aire». Al devolverlo a su sitio, la
  caída acumulada **lo mató** al posarse, y el control del fundido leyó un velo
  de 128… que era el de la MUERTE (player.cpp:740). Ahora se le devuelve con
  `caida = 0` y la sonda imprime la vida.
- **«Alfa 0» con el velo opaco.** Con alfa 1 el navegador normaliza el `style`
  a `rgb(255, 0, 0)`, sin la a, y el patrón de la sonda sólo casaba `rgba`. Lo
  destapó la rotura R1: con las banderas puestas el velo llega a 255 y el
  control positivo leía 0. Un cero que era el instrumento — el apartado 4.
- **Una rotura tapa a otra.** Con R6 puesta (el centro en el origen del mapa)
  el temblor no llega a nadie, y R5 (el suelo) queda invisible: el control del
  aire siguió verde con las dos. Hubo que pasar R5 sola.
- **El control del techo es una cota, no una medida.** Con R4 (sin techo) sigue
  verde: el `short` envuelve y 50 unidades tiemblan 2. Lo que caza R4 son el
  mensaje (204 800) y «la cámara tiembla más de 2». Y con R3 también sigue
  verde, vacío: sólo vale al lado de «la cámara tiembla».

## 5. Lo que queda

1. **Los temblores de los monstruos**: sólo 4 de las 60 líneas corren en el
   guion del jugador o en un efecto suyo (`ext_bear_mode`, `ext_quake_fx`,
   `demon_blood`, `effect_push`). Las otras 56 son de bichos, proyectiles y
   trampas, que corren en el entorno de un NPC (`npcguion.js`), sin
   `comandoDePantalla` ni `origenDeMi`. Hoy `$relpos` se apunta ahí como
   antes y el `effect` también. Haría falta el gancho en ese entorno y llegar
   desde la manada a los jugadores del radio (`UTIL_ScreenShake` los recorre a
   todos).
2. **Con servidor**: la copia del guion del jugador del servidor no tiene
   `fisica`, así que su `screenshake` se apunta («sin cuerpo»); el temblor sólo
   sale del guion del navegador. No viaja un `gmsgShake`.
3. **El arma no tiembla** (`V_ApplyShake(view->origin, …, 0.9)`, view.cpp:703):
   sólo la vista.
4. Agachado, el `origin` del jugador está a 18 y no a 36 (no se distingue,
   como en `npcguion.js`).
5. **Posible fallo del puerto, sin medir en el motor**: un `setvelocity` /
   `addvelocity` hacia arriba sobre un jugador en el suelo no lo despega aquí
   (player.js:345-347). En el mod, `PM_CatagorizePosition` lo suelta del suelo
   con más de 180 u/s hacia arriba («Shooting up really fast. Definitely not on
   ground», pm_shared.cpp:1785-1787). Lo pide `effects/effect_push`, que
   aplican 26 líneas activas (24 con el temblor a 0 y 2 sin ese parámetro).
   **Pendiente.**
6. **Las vecinas con red**: `efectosred93` dio 9 de 24 con la fase A roja en
   «al acabar el veneno el icono se va» —el veneno de 8 s había mordido DOS
   veces: el reloj del juego a un cuarto de velocidad, la misma carga del §4— y
   la fase B caída por `window.probe` sin montar en la página de Ana; y
   `veneno91` no llegó a conectar con Vite. Ninguna de las tres cosas toca este
   experimento (el icono no lo mira `fundidoTrasLaVista`, y la fase B es la de
   la red que estaba cambiando otra sesión), pero **no se han visto en verde
   con esto puesto**: dicho, no apuntado como verde.

   > **Corrección, el mismo día:** repetidas con esto puesto, `efectosred93`
   > 24/24 y `veneno91` 15/15. Antes, `veneno91` cayó dos veces más: una sin
   > Vite (espera 7 s fijos y otra sesión usaba su puerto: «puerto 5394
   > liberado») y otra sin araña viva en la manada. Las tres caídas eran de la
   > carga y del árbol compartido, no de esta pieza.
