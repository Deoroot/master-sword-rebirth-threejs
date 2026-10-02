# 53 — Detrás del menú había una partida

> `src/main.js` · `src/play/fondomenu.js` · `src/play/mapa.js`
> · `sondas/arranque36.mjs` · `test/fondomenu.test.mjs`

El encargo era de una línea: **quitar la carga de Gate City por defecto al
arrancar**, porque no es lo que hace GoldSrc. Lo primero fue medir qué era
exactamente «la carga por defecto», y salió peor de lo que la frase sugería.

Con el menú principal delante, sin `?map=` y sin haber pulsado nada:

| | |
| --- | --- |
| mapa | gatecity, 41 494 tri, 299 texturas |
| dibujado | 145 070 tri por fotograma, 636 llamadas |
| NPC | **69 montados, 33 hostiles** |
| ¿se mueven? | **45 de los 69 se movieron en 4 s**, hasta 3,74 m |

No es un fondo: es un pueblo simulándose para enseñar una pantalla de menú.

## Dos de los tres cargos eran míos y estaban mal

El primer informe decía tres cosas. Al medirlas de cerca, **dos no eran
ciertas**, y queda escrito porque la forma de equivocarse es la de siempre:
leer un accesor y creer que dice lo que su nombre parece decir.

**`sesion: true` no era una partida.** Es `Boolean(S.sesion)`
(`src/dev/sonda.js:362`), o sea que el **objeto** existe — se construye en
`main.js` mucho antes de que nadie elija nada. Lo que de verdad hay que
preguntar es `sesion.estado`, y vale `"fuera"`, con `personaje` en `null`. **No
había ninguna partida corriendo y no había nada que arreglar ahí.**

**El cuerpo del jugador existe, pero no se mueve.** Con el menú delante y la
tecla de andar puesta 1,2 s se anduvo **0,000 m**. Y eso no es un accidente
nuestro: es exactamente lo que hace el motor en un mapa de fondo. Quitarlo no
sería más fiel, sería menos — y además se llevaría por delante el paseo del 52,
porque **la cámara del menú es la del jugador conducida desde fuera**.

Lo que quedaba en pie era el cargo de verdad: la simulación.

## Y el motor tenía esto resuelto, así que no es una desviación

Xash3D —el motor sobre el que corre Master Sword Rebirth, CLAUDE.md §2— trae
mapas de fondo **de serie**, con su propio modo:

```cpp
// mainui/BaseMenu.cpp:547-581
bool UI_StartBackGroundMap( void ) {
    if( uiStatic.bgmaps.IsEmpty()) return false;     // :551
    ...
    int bgmapid = EngFuncs::RandomLong( 0, uiStatic.bgmaps.Count() - 1 );   // :571
    snprintf( cmd, sizeof( cmd ), "map_background %s\n", ... );             // :578
```

Y lo que ese modo apaga es, literalmente, nuestro reparto:

| | |
| --- | --- |
| `sv_client.c:1422-1423` | al jugador le ponen `FL_GODMODE\|FL_NOTARGET`. El comentario del motor: **«don't attack player in background mode»** |
| `sv_main.c:111` · `sv_client.c:3290` | `sv_background_freeze`, por omisión **1**: en un mapa de fondo el jugador no se mueve |
| `sv_client.c:1507` | y no se puede pausar |
| `sv_init.c:1011`, `:1060`, `:1092-1093` | `SV_SpawnServer(..., background)` lo publica en `sv_background` y `cl_background` |

**Corrección al 52**, que había escrito que los mapas de fondo son de Source y
que usarlos era decisión nuestra: son de Source **y de Xash3D**. La frase está
corregida al lado en `src/play/miradores.js` y en `doc/MENU_52.md`.

Lo que sí es nuestro, y está declarado en `src/play/fondomenu.js`:

1. **MSR no usa mapas de fondo.** No trae la lista que busca
   `UI_LoadBackgroundMapList` (`BaseMenu.cpp:980`), así que `IsEmpty()` corta en
   la línea 551 y su menú cae a la pintura: las doce losetas TGA de
   `resource/background/` que coloca `BackgroundLayout.txt` sobre 800×600.
2. **Vamos más lejos que `sv.background`.** El motor deja las entidades vivas y
   se limita a marcar al jugador; aquí no se montan. Se puede porque sin
   jugador que proteger la marca no protege a nadie, y 33 hostiles buscando
   camino contra un cuerpo congelado cuestan fotogramas.

## Lo que se cambió

`FONDOS_DEL_MENU` vive en `src/play/mapa.js` —la única excepción de la regla
del 47, que prohíbe el nombre de un mapa suelto en `src/play/`— y
`src/play/fondomenu.js` tiene la política: `LO_QUE_NO_SE_MONTA`, cada entrada
con su motivo y un `masQueElMotor`, al estilo de las tablas de ajustes.

Se descartó indexar `MAPAS_PORTADOS[0]`, que era lo cómodo: deja un agujero
mudo, porque quien reordene esa lista mueve el fondo del menú a otro mapa y no
falla nada — sigue siendo una lista de uno y sigue siendo un mapa portado.

En `main.js`, el bloque de los bichos pasa a ser `montarLosBichos()`, que se
llama al arrancar **sólo si no se entra por el menú**, y desde «Start» si no.
Los cilindros de colisión se montan con ellos; los adornos no, porque un helecho
no es una partida.

## El caso que funcionaba por accidente, y lo que costó

Elegir en «Create Server» **el mismo mapa que el del fondo** no recarga —el
cambio de mapa sí, desde el 50— así que «Start» tiene que poblar. Hasta ahora
«funcionaba» porque los 69 llevaban puestos desde antes de que el menú se viera.

Y poblar cuesta **5 610 ms medidos**, con 18 modelos que leer. Cinco segundos y
medio de menú congelado sin decir nada es peor que el problema que arregla, así
que se dice — que es lo que hace el motor en este mismo punto:

```cpp
// rehlds/engine/host_cmd.cpp:998-1000, :1015-1017
VGuiWrap2_LoadingStarted("level", name);
StartLoadingProgressBar("Server", 24);
SetLoadingProgressBarStatusText("#GameUI_StartingServer");
```

Eso también obligó a arreglar la sonda: `sonda:arranque36` esperaba
`waitForTimeout(1500)` después de «Start» y ahora mide el instante de antes.
**Se espera al efecto, no a un reloj**: alargar el número lo habría escondido
hasta el día que un mapa traiga más modelos.

## LA ROTURA QUE NO PUSO NADA ROJO

De las tres roturas a propósito, dos hicieron su trabajo:

| lo que rompí | rojas |
| --- | --- |
| los bichos se montan siempre, como antes | 2 |
| «Start» no monta nada | 1 |
| **cerrar el menú ANTES de poblar** | **0 — 29 de 29 en verde** |

La tercera es la que enseña algo. Es el orden que parece natural —cerrar el
menú y poblar después— y **ningún control lo contradecía**: los bichos acababan
llegando, así que todo lo que se medía al final los veía. Lo que no veía nadie
es que entre medias hay **5 610 ms de Gate City vacía**, con el jugador ya
dentro y el menú ya fuera.

Un fallo de cinco segundos y medio, perfectamente visible jugando, con la sonda
en verde. El apartado 4 en su forma más pura: el mecanismo sí se dispara, sólo
que **tarde**, y ningún control miraba el momento.

El control que faltaba mira el **borde** y no el final: en cuanto el menú se
cierra, tiene que haber pueblo.

```js
await pag.waitForFunction(() => document.querySelector(".ms-menu")?.hidden === true);
const alAbrirse = await pag.evaluate(() => window.probe.ia?.censo?.()?.total ?? null);
```

Se espera al menú y no a `newchar` a propósito: `newchar` llega después de
`sesion.arrancar()` y para entonces el instante que importa ya pasó. Con el
orden bueno da **69**; con la rotura puesta, **0**.

## Lo medido

`sonda:arranque36` **30 de 30**, errores de página: ninguno.

| | detrás del menú | jugando |
| --- | --- | --- |
| NPC | **0**, 0 hostiles | **69**, 33 hostiles |
| sesión | `estado "fuera"`, `personaje null` | — |
| el cuerpo, con la W puesta 1,2 s | **0,000 m** | **5,13 m** |
| la escena | 41 494 tri, 96 102 dibujados | — |
| al cerrarse el menú | — | **69 NPC en ese fotograma** |

`npm test` 1398 de 1401, `vite build` limpio, `sonda:edana50` 21/21,
`sonda:menu52` 16/16, `sonda:ia` 15/15.

**Los tres rojos no son de aquí y está comprobado, no supuesto**: se pasaron
las mismas sondas contra el `main.js` de antes de este experimento y salen
igual. Son `test/juego_torre.test.mjs` (la torre del 52, en marcha),
`test/procedencia.test.mjs` —que se queja de un archivo **vacío de 0 bytes**
llamado `button` con un carácter de control en el nombre, aparecido a las 07:52
y que parece un desliz de consola— y los dos de `sonda:mundo` y los dos de
`sonda:mapa`, que también reproducen sin este cambio.

## Lo que este experimento NO hace

- **No quita la carga del mapa, sólo la de la partida.** Al arrancar se siguen
  leyendo la malla, las texturas y los 25 atlas de luz de Gate City. Eso era lo
  correcto mientras el fondo del menú fuera un mapa.
- **Y esa premisa acaba de cambiar.** El usuario ha pedido que el menú tenga
  **escena propia** —una torre a contraluz, el 52—, y con eso el mapa del juego
  no tiene que cargarse al arrancar en absoluto: ni escena ni partida, que es
  literalmente `Host_Init` haciendo sólo `exec valve.rc`
  (`rehlds/engine/host.cpp:1206`). Eso es el paso siguiente y **no se ha hecho
  aquí a propósito**: hasta que la torre exista, quitar la carga deja el menú
  sin nada detrás. Lo de este experimento es compatible con ese paso y no hay
  que deshacerlo — «Start» ya sabe montar lo que falte.
- **Falta el `FL_NOTARGET`.** Si algún día se quisiera el fondo con bichos
  vivos, como hace el motor, hay que marcar al jugador intocable. Hoy no hace
  falta porque no hay bichos.
