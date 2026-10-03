# Lo que un efecto le hace a la pantalla — experimento 93, pieza B

El 92 dejó pendiente (doc/COSTURA_RED_92.md §5.4) que lo que un efecto hace en
la PANTALLA —`effect glow`, `effect screenfade`, `hud.addstatusicon`— no
llegaba al navegador con servidor. Medido al empezar: **tampoco llegaba sin
servidor**. Los tres caían en el `default` del intérprete y se apuntaban como
comandos desconocidos (`noSoportados` del guion de `effects/dot_poison` traía
`effect` y `hud.addstatusicon`). No era un `=> {}` callado: era un hueco
declarado, en los dos mundos.

```bash
node --test test/efectos93b.test.mjs     # 25 verdes
node sondas/efectosred93.mjs             # un jugador + dos contra servidor: 24 de 24
```

## 1. Lo medido antes de escribir

`build/msr/efectosguion.json` (129 efectos), líneas que tocan la pantalla:

| comando | veces | quién |
| --- | --- | --- |
| `effect glow` | 13 | los `dot_*`, `effect_rejuv2` (la cura del sacerdote), `protection`, `iceshield`… |
| `effect screenfade` | 12 | los `dot_*` en cada mordisco, `demon_blood`, `gauntlet_invalid`… |
| `hud.addstatusicon` | 9 | `dot_poison/acid/cold/fire/lightning`, `debuff_freeze/hold/stun`, `iceshield` |
| `hud.killstatusicon` | 1 | `iceshield` |
| `effect screenshake` | 2 | NO portado aquí |

Y el guion del jugador: `hud.killicons ent_me` en `game_spawn` y `game_death`,
`effect screenfade` en `premt_black`, `ext_flash_bang` y `gauntlet_invalid_loop`.

## 2. Lo portado, con cita

Regla en `src/play/efectospantalla.js` (sin DOM, la prueba Node):

- **`effect screenfade`** — mseffects.cpp:877-904 y `UTIL_ScreenFadeBuild/Write`
  (hl/util.cpp:1135-1161), con `FixedUnsigned16` (:1033-1044: 4.12 fijo, tope
  a 16 s). Sin `REQPARAMS`: un parámetro que falta vale «». Banderas por
  *contiene*; `noblend` es `FFADE_MODULATE`.
- **La curva del cliente**: `CL_ParseScreenFade` (xash3d-fwgs
  engine/client/cl_parse.c:2067-2111) y `V_FadeAlpha` (cl_game.c:472-503), con
  el `int` que trunca y la escritura de `fadeEnd` con `STAYOUT`; el pintado,
  `CL_DrawScreenFade` (:515-548), con la fórmula de `MODULATE`.
- **`hud.addstatusicon` / `killstatusicon` / `killicons`** — `ScriptCmd_HudIcon`,
  scriptcmds.cpp:3706-3847. El cliente: `VGUI_Status` y `__MsgFunc_StatusIcons`
  (ui/vgui_status.h:181-428): mismo nombre reinicia reloj y NO cambia el
  dibujo (MiB FEB2019_22), columnas de cinco a (64·(i/5)+10, 75·(i%5)+10) en
  píxeles sin `XRES`, barra `DurColor(0,255,0,128)` que se vacía.
- **`effect glow`** — mseffects.cpp:906-926, `CEntGlow::Think` (:361-389). Se
  LEE y se cuenta; no se dibuja (§4).

Iconos: `npm run hud` hornea los 19 `sprites/hud/status/*.spr` a
`build/msr/hud/estado/*.png` (agujeros por el índice 255, `SPR_DrawHoles`).

Dibujo en `src/juego/mensajes.js`: el fundido comparte el `div` del velo de la
muerte (el motor tiene UN `clgame.fade`: uno nuevo pisa al anterior) y los
iconos son `div` en la esquina de arriba a la izquierda.

Caminos:

- **Un jugador**: `GuionDelJugador` tiene una puerta nueva, `pantalla`, que
  `src/main.js` manda a `mensajes.pantalla`.
- **Servidor**: `Partida._efectosDe` le pasa `pantalla: (p) => this._pantalla(c, p)`,
  que manda `MENSAJE.PANTALLA` (nuevo en `src/red/protocolo.js`) a ESE
  cliente (`MSG_ONE`), o a todos con `all`. `src/red/cliente.js` lo entrega y
  `src/main.js` lo dibuja con la misma función. El brillo no viaja (§4).
  `/costura` cuenta por cliente `pantallas: { fundido, icono, brillo }`.

## 3. Lo que se entendió mal por el camino

- **«El icono del veneno es verde».** El control del horneado salió rojo con
  el trabajo bien hecho: `alpha_dot_poison.spr` usa dos índices, el 0 (blanco
  puro) y el 255 (agujero). Los iconos de los `dot_*`, `debuff_*`, `stun`,
  `shield` son **siluetas blancas** (una calavera con tibias, la del veneno);
  el verde es la barra. Ni el motor las tiñe: `SPR_Set` con (255,255,255).
- **`muerte.js` dice que la curva del fundido «no está en el SDK».** El motor
  está al lado (`../MSC/xash3d-fwgs-sdk/engine/`), y su curva NO es la del 41:
  el AGUANTE va ANTES de la bajada (`fadeReset = hold + cl.time; fadeEnd =
  duration + fadeReset`). Con los números de la muerte (0,2 y 15) son **quince
  segundos de rojo a medias**, no «un fogonazo de dos décimas». Aquí se porta
  la del motor para los efectos; el velo de la muerte sigue con la suya porque
  `src/play/muerte.js` no es de esta pieza. Queda abierto (§5).
- **El brillo no lo ve quien lo lleva.** Es `renderfx` de la entidad
  (mseffects.cpp:318-344); en primera persona no se dibuja tu modelo y el arma
  no lo hereda (la línea que lo copiaría está en `#if 0`, cl_parse.c:323-331).
  Lo ven los DEMÁS. El encargo decía «y al otro jugador no le sale»: eso vale
  para el fundido y el icono; para el brillo es al revés.
- **Dos pruebas mías mal escritas**, rojas con el código bien: creí que
  «fadeinout» contiene «fadeout» (no: f-a-d-e-i-n-o-u-t), y que al llegar el
  alfa del veneno trunca a 29 (sale 30 exacto).
- **Una rotura que dejó verde la curva**: quitar el truncado a `int` no puso
  roja ninguna prueba, porque la del veneno pedía «entre 14 y 15». Ahora pide
  14 exacto, y la rotura es roja.
- **La primera pasada de la sonda se cayó en la fase B** esperando a una
  partida que nunca empezaba: el parche que bloquea el recargado de Vite
  (copiado de efectos90/veneno91) sustituye `window.WebSocket` sin sus
  constantes, y el cliente de red pregunta `readyState === WebSocket.OPEN`.
  Se copian las constantes. Las otras sondas con ese parche no usan red.
- **«Le llega "You have been poisoned!"», rojo en una rotura que no lo tocaba**:
  `dicho()` es un anillo y la sonda lo miraba al final, tras 30 s de mordiscos.
  Se busca a cada vuelta (el aviso ya estaba en doc/VENENO_91.md §6).

## 4. Cómo se comprueba

- `test/efectos93b.test.mjs`: la regla con los números escritos a mano, y el
  camino: un `GuionDelJugador` con la ficha y los efectos horneados, y una
  `Partida` con la rata del mod que envenena a Ana con Beto al lado (el
  segundo caso). Nadie llama a `_pantalla` ni a `leerFundido` a mano.
- `sondas/efectosred93.mjs`, 24 controles, por el menú. A: Gate City, el
  veneno con una araña de atacante (la puerta del 91). B: dos Chrome contra
  `tools/servidor.mjs` en sala88, la rata envenena a Ana por el camino entero.
  Se mide el DOM real (`getBoundingClientRect`, `img.complete`), los PÍXELES
  del recorte del icono (1 781 blancos con veneno, 0 antes y 0 en Beto) y el
  velo con un `MutationObserver` (un verde por mordisco: 4 de 4). Controles
  negativos: antes del veneno, al acabar, y Beto en el mismo instante.
- Roturas deliberadas, en un `git worktree` aparte (HEAD + esta pieza), cada
  una comprobada con `grep` puesta y quitada:

  | rotura | Node (rojas) | sonda |
  | --- | --- | --- |
  | el puente sin enganchar efectos | 5 | — |
  | `_pantalla` manda a todos | 1 | 21/24: los tres negativos de Beto |
  | el aguante después de la bajada | 1 | — |
  | el servidor sin la puerta `pantalla` | 1 | — |
  | un icono repetido se añade | 1 | — |
  | sin truncar a `int` | 0 → 1 tras ajustar la prueba (§3) | — |
  | `fijo16` sin tope | 1 | — |
  | `main.js` sin las dos líneas (local y `red.al`) | 0 | 13/24: toda la pantalla de A y de Ana |
  | icono sin la base de la ruta | 0 | 19/24: PNG no cargado y 0 píxeles |

  La sexta y las dos últimas son la regla del 82: Node verde y sonda roja.
- Vecinas: `costurared92` 16/16, `red` 21/21, `efectos90` 11/11, `veneno91` 15/15.
- `npm test`: 2 497 verdes, 0 rojas, 1 pendiente.

## 5. Lo que queda abierto

1. **EL PUENTE.** `effect` y `hud.*` no tienen `case` en `src/play/guion.js`,
   que era de otra pieza. `src/play/guionjugador.js` envuelve el
   `ejecutarComando` de la INSTANCIA del guion del jugador y de cada efecto suyo
   (vigilando el `push` de `EfectosDeEntidad.lista`). Lo que hay que añadir en
   `guion.js`, y entonces el puente se borra entero:

   ```js
   case "effect": case "hud.addstatusicon": case "hud.killstatusicon": case "hud.killicons":
     if (!e.comandoDePantalla?.(c.nombre, params)) this.anotarNoSoportado("comando", c.nombre);
     return true;
   ```
   con `comandoDePantalla` en el entorno del jugador (lo que hoy hace
   `comandoDePantalla` de `guionjugador.js`). Y `effect`/`hud.*` a `COMANDOS`,
   porque el censo de `npm run efectos:guion` los sigue contando como que faltan.
2. **El brillo sobre el modelo de OTRO jugador**: se lee y se cuenta, no viaja
   y no se dibuja. Haría falta mandarlo en la foto (`renderfx`) y pintar una
   cáscara en el modelo ajeno.
3. **El velo de la muerte** (`src/play/muerte.js`): la curva del motor dice 15 s
   de rojo, no 0,2 (§3). No se ha cambiado; es de otra pieza y altera lo que se
   ve al morir.
4. `effect screenshake`, `hud.addimgicon`, `hud.killimgicon` siguen apuntados.
5. Al reaparecer, `mensajes.limpiar()` quita el fundido (como ya hacía con el
   velo) y deja los iconos: en el mod los quita el `hud.killicons` de
   `game_death`/`game_spawn` o su reloj. Con servidor, la copia del guion del
   jugador del servidor no corre `game_death`; los quita el del navegador.
6. `alpha_*_immune`, `status_demon`… están horneados y nadie los pide aún.

## 6. Pieza G (93): el puente, quitado

Lo que pedía §5.1, hecho como estaba escrito, y el puente borrado entero
(`conComandosDePantalla` y `engancharEfectos` ya no existen):

- **`src/play/guion.js`**: `effect`, `hud.addstatusicon`, `hud.killstatusicon`
  y `hud.killicons` entran en `COMANDOS` (scriptcmds.cpp:140 y :60-63) y tienen
  su `case`, que llama a `e.comandoDePantalla(nombre, params, { desde })`. Si
  el gancho falta (un NPC) o lo rechaza (`effect beam`, `effect screenshake`),
  se apunta con el nombre del comando, que es lo que hacía el `default`.
- **`src/play/guionjugador.js`**: el entorno del jugador da `comandoDePantalla`
  (la función de siempre, con `desde` para apuntar en la lista del guion que
  corre la línea). Cada efecto del jugador lo **hereda**, porque
  `entornoDelEfecto` (efectos.js) se construye sobre `anfitrion.entorno()`: no
  hubo que tocar `efectos.js`.
- **Pruebas**: la de §4 que vigilaba el puente ahora vigila el camino —ni el
  guion del jugador ni el del efecto llevan un `ejecutarComando` propio (si
  vuelve un puente, roja), el efecto hereda el gancho y la pantalla dice de qué
  guion vino— y hay una nueva que entra por TEXTO (la regla del 67): un guion
  suelto con el gancho lo recibe con `desde`; sin él, `effect` y
  `hud.killicons` se apuntan. `test/juego_misiones.test.mjs`: `COMANDOS.size`
  pasa de `90 + 9 + 3 + 4 + 5` a `… + 4`, con la lectura vieja al lado.

Consecuencia que conviene saber: el censo (`tools/guiones.mjs`,
`npm run efectos:guion`) cuenta ahora `effect` como portado entero, aunque sólo
`screenfade` y `glow` tengan regla. Lo que falta de `effect` se sigue viendo en
`noSoportados`, no en el censo.

**Roturas** (en un `git worktree` aparte con este árbol, cada una comprobada con
`grep ROTURA93G` = 1 puesta y = 0 quitada; Node sobre efectos93b, salto93g,
juego_misiones, salto93a, costurared92b, veneno91 y mordisco92a):

| rotura | Node (rojas) |
| --- | --- |
| `guion.js` sin el `case` | 7 (los cinco caminos de efectos93b, el salto con servidor y `veneno91` «lo que todavía falta…») |
| el entorno del jugador sin `comandoDePantalla` | 6 |
| el gancho rechaza siempre | 7 |

`npm test`: 2 528 verdes, 0 rojas, 1 saltada, 1 «todo». Sondas:
`efectosred93` 24/24 (sin el puente), `efectos90` 11/11, `veneno91` 15/15,
`costurared92` 16/16.
