# Experimento 94 — el velo rojo: morir, volver y cada golpe

El usuario pidió portar «lo de la pantalla roja al morir» imitando el juego
original al máximo. Eran tres cosas y no una, y las tres van por el mismo sitio
del motor: el `clgame.fade`, que es **uno solo**.

## Lo que había

Un fogonazo de dos décimas al morir (`alfaDelDesvanecido`, del 41) y nada más.
El 41 dejó escrito que la curva «no está en el SDK» y la dedujo del efecto de
guion. El 93, al portar `effect screenfade`, encontró el motor de Xash3D en
`../MSC/xash3d-fwgs-sdk` y vio que era al revés — y lo apuntó en la cabecera de
`efectospantalla.js` sin tocar `muerte.js`, «porque no es de esta pieza».

## Lo que hace el motor

### 1. Morir

```c
UTIL_ScreenFade(this, Vector(255, 0, 0), 0.2, 15, 128, FFADE_IN);
                                                    player.cpp:740-741
```

viaja en 4.12 fijo (`UTIL_ScreenFadeBuild`, hl/util.cpp:1135-1144: 819 y
61 440) y el cliente lo convierte así (`CL_ParseScreenFade`,
cl_parse.c:2068-2111, rama sin `FFADE_OUT`):

```c
sf->fadeSpeed  = (float)sf->fadealpha / sf->fadeEnd;   // 128 / 0,19995
sf->fadeReset += cl.time;                              // ahora + 15
sf->fadeEnd   += sf->fadeReset;                        // ahora + 15,19995
```

y lo pinta `V_FadeAlpha` (cl_game.c:472-505): `alpha = fadeSpeed · (fadeEnd −
ahora)`, topado a `fadealpha`. **128 durante quince segundos, luego 0,2 s de
bajada.** Medido en el navegador: 128 a los 14,9 s, 63 a los 15,1 y 0 a los
15,3.

Como reapareces a los cinco (`ESPERA_MUERTO`), en la práctica toda la muerte se
ve a medias en rojo.

### 2. Volver

```c
UTIL_ScreenFade(this, Vector(0, 0, 0), 1, 0, 0, FFADE_IN);    player.cpp:2784
```

en `Spawn`. Alfa cero: no apaga nada a mano, **pisa** el fundido de la muerte.
Aquí entra por la misma puerta (`AL_REAPARECER`).

### 3. Cada golpe — no estaba portado

`CBasePlayer::TakeDamageEffect` (player.cpp:537-550): rojo de alfa
`daño / vidaMax · 255`, un segundo de bajada tras medio de aguante, y un
empujón de la vista (`punchangle`) de ±α/4 por ½, ⅒ y ⅕ en cabeceo, giro y
alabeo. El empujón lo suelta `PM_DropPunchAngle` (pm_shared.cpp:3023-3031):
diez grados por segundo más la mitad de lo que quede. Se suma a la vista en
`V_CalcNormalRefdef` (view.cpp:744-745).

Lo llama `CMSMonster::TakeDamage` en su primera línea útil
(msmonsterserver.cpp:2369), **antes** de restar la vida (:2394): el golpe
mortal tiñe con el jugador todavía vivo, y el velo de `Killed` lo pisa. Aquí
`sesion.danar` avisa `dano` antes de `muerte`, que es el mismo orden, y el aviso
lleva ahora `pedido` —el `flDamage` entero, no lo que cabía en la vida—.

## Cómo quedó

- `src/play/muerte.js`: `mensajeDeFundido` (= `UTIL_ScreenFadeBuild`),
  `AL_REAPARECER`, `efectoDelGolpe`, `soltarGolpe`. `alfaDelDesvanecido` ya no
  tiene cuenta propia: empaqueta el mensaje y lo pasa por `fundidoAlLlegar` y
  `alfaDelFundido` del 93.
- `src/juego/mensajes.js`: `desvanecer` empaqueta y entra por `pantalla`. Se
  fue el estado `desvanecido`; queda `muerteDesde` sólo para que la sonda sepa
  si el fundido vivo es el de la muerte.
- `src/main.js`: el oyente de `dano` (tinte y empujón), el de `aparece` (el
  fundido de `Spawn`), `pasoDelGolpe` y el empujón en `colocarCamaraDelOjo`.

## Cómo se comprobó

- `test/velo94a.test.mjs` (14) y `test/juego_muerte.test.mjs` reescrita: la
  prueba del 41 **afirmaba el fallo** («y dura dos décimas, no quince
  segundos»). Los números van a mano, no calculados con la constante (el 75).
- `sondas/muerte41.mjs`: 41/41. Controles nuevos: el tinte de un golpe (51 de
  51, entero a 0,4 s, 25 a 1,0 s, 0 a 1,6 s), el empujón leído en la CÁMARA y
  no en el número, el velo entero a los cinco segundos, el fundido de `Spawn` y
  la cola de 15 s.
- **Rotura deliberada**, cuatro a la vez y comprobadas con `grep`: duración y
  aguante cambiados, el oyente del tinte comentado, el de `Spawn` comentado y el
  empujón quitado de la cámara. Sonda 35/41, con los seis rojos donde tocaban; y
  rojas también 6 pruebas de Node.

## salto93: cuatro diagnósticos para una sonda inestable

Con todo el 94 puesto, `sondas/salto93.mjs` daba 8/15 una pasada de cada tres
(«la araña no salta en 150 s»). Hubo cuatro diagnósticos y **sólo el último
era la causa**:

1. *«Recolocar cada 250 ms te deja en el aire y el salto pide `onground`»*
   (spider.script:103). Cierto como hecho, y se arregló —ahora sólo se
   recoloca cuando hace falta—, pero el fallo siguió.
2. *«Plantado a 0,9 m la araña muerde sin parar y `!IS_ATTACKING` (:98) no se
   cumple nunca»*. **Falso**: ningún guion del mod escribe `IS_ATTACKING`, sólo
   lo leen siete, así que en Master Sword la condición es siempre cierta. Lo
   dijo un contador de estados en la sonda, no pensar mejor. Apartarse a 3 m
   lo empeoró: 4 de 6.
3. Ese mismo contador enseñó la verdad: en las pasadas rojas la araña cazaba
   tres segundos y luego **pasaba 110 s con `IS_HUNTING 0`**, paseando con el
   jugador a menos de 4,5 m. La IA no vuelve a fijar a quien no ve
   (ia.js:259-263), y `plantarse` ponía al jugador **siempre a −X** de la
   araña: en la cueva, a menudo pared adentro. Más lejos, más pared — por eso
   los 3 m fueron peor.
4. Ahora `probe.costura.sitioALaVista` prueba 16 rumbos y elige uno con suelo
   y con el rayo libre hasta el ojo del bicho. 6 de 6 saltan.

De paso salieron otros tres fallos del instrumento, los tres ya conocidos en
este cuaderno:

- **la consola es un anillo** y una araña que muerde mucho empuja fuera
  «You have been poisoned!»: se lee mientras, no al final (el 81);
- **un salto fallido también corre `spider_latch_resetmovement`**, y con dos
  saltos el bucle cortaba en el instante de pegarse: se cuenta desde lo que
  había al pegarse (el 67);
- **«a tus pies» se medía una vez**, en la primera vuelta con `sigue`, y con
  la araña de un `evaluate` y los pies de otro: ahora se leen juntos y se
  queda la menor. Rota a propósito (`setfollow` dos metros a un lado), el
  control sale rojo con 2,00 m.

**Y un posible fallo DEL JUEGO, sin diagnosticar.** Con el sitio admitiendo
±0,6 m de desnivel, una pasada de seis puso al jugador en un escalón 0,6 m
por encima de la cría a 0,7 m: la cría corrió **25 s en el sitio sin morder**
(`100× caza=1 anim=run d=0.7 dy=0.6`), y en la misma pasada la araña grande
cazó y mordió 150 s sin saltar ni una vez. Con la cuenta del 82 —`range` en
3D menos media anchura de cada uno, scriptcmds.cpp:1154— la cría estaría a
unas 42 u de sus 50 de `ATTACK_RANGE`, o sea que en el motor debería morder.
No se ha medido en el motor ni se ha mirado qué decide aquí «no llego»; la
sonda se limitó a ±0,2 m porque mide el salto y no los escalones.
**Pendiente**, con estos datos.

> **Corrección, el mismo día: no era un escalón, ni un fallo del juego.** Con
> ±0,2 m siguió saliendo `dy=0.5`, y 0,5 m es **el alto de la cría** (20 u,
> spider_mini.script:44). El rayo que buscaba suelo bajaba desde un metro y
> tocaba **el techo del cilindro de la propia cría**: la sonda dejaba al
> jugador de pie ENCIMA de ella. Ni la cría podía morder a quien tenía en la
> espalda ni la grande saltaba sobre alguien subido a un bicho. El rayo
> filtra ahora los colisionadores de la manada. *Un número que coincide con
> una medida de la escena es la primera pista; el párrafo de arriba se dejó
> como quedó escrito (apartado 7 de CLAUDE.md).*

## Lo que se entendió mal, y lo que queda

- **El control «no te quedas viendo el mundo en rojo» del 41 era un verde
  vacío.** Con el fogonazo, al reaparecer el velo ya estaba en cero por sí
  solo: el control habría pasado sin que reaparecer quitara nada. Ahora el
  control de los cinco segundos (128) va justo delante y es su positivo. Y con
  el fundido de `Spawn` roto **sigue verde**, porque `limpiar()` también apaga
  el velo: lo que caza esa rotura es el control nuevo «lo quita el fundido de
  `Spawn`».
- `Effects_GetFade` (hudscript.cpp:250-282) pone `fadeFlags = 0` en **cada
  fotograma**, antes de mirar los guiones. Para la muerte da igual (`FFADE_IN`
  es 0), pero un fundido `fadeout` o `perm` de un `effect screenfade` pierde sus
  banderas en el fotograma siguiente en Master Sword. **Pendiente**: no está
  portado en `efectospantalla.js`.
- Con servidor, el tinte sale del `danar` del cliente, como todo el daño del
  jugador hoy; no viaja como un `gmsgFade` del servidor. Mismo efecto, otro
  camino. No se ha pasado la sonda de red con un golpe.
