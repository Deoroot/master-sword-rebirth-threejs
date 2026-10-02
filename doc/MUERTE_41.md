# 41 · Morir y subir de nivel: lo que se ve

Lo que se pidió, literal:

> veamos si podemos traer todo lo que pasa cuando el personaje muere y sube de
> nivel. cuando muere la cámara se pone 3d, el color se pone algo rojo y sale
> you died como mensaje si recuerdo. y cuando sube de nivel sale un sonido,
> mensajes de lo que subió de nivel y un montón de efectos de colores alrededor
> del personaje.

Cinco de esas seis cosas están en el juego y estaban sin portar. La sexta —«you
died»— **no existe**, y eso es lo primero del documento porque es lo único que
había que desmentir.

El ciclo de morir ya estaba desde el 21 (`src/juego/sesion.js`): el impuesto del
1 %, los cinco segundos, la regla de soltar las teclas antes de levantarse. Lo
que faltaba era todo lo que el jugador ve, que es todo lo que tiene para
enterarse de que ha pasado algo.

`npm test` pasa de **1 040** a **1 095** y hay una sonda nueva, `sonda:muerte41`,
con 34 controles.

---

## 1 · No hay ningún «You died»

Se buscó en el SDK entero y en los 1 300 guiones. Lo que hay es esto, y es la
primera línea de `CBasePlayer::Killed`:

```c
UTIL_ClientPrintAll(HUD_PRINTCENTER, UTIL_VarArgs("%s has fallen!", DisplayName()));
                                                        player.cpp:578
```

«**<tu nombre> has fallen!**», centrado, y con `All` en el nombre de la función:
**lo ven todos los jugadores del servidor**, no sólo tú. El texto ya estaba en
`anuncioDeMuerte` desde el 21; lo que faltaba era enseñarlo.

---

## 2 · Las cuatro cosas de la muerte, en su orden

`CBasePlayer::Killed` hace esto, en este orden (player.cpp:576-806):

| | qué | dónde |
| --- | --- | --- |
| 1 | el centrado «has fallen!» **a todos** | 578 |
| 2 | `UTIL_ScreenFade(this, (255,0,0), 0.2, 15, 128, FFADE_IN)` | 741 |
| 3 | `DeathSound()` | 755 |
| 4 | la cámara: 70 a la derecha, 25 arriba, trazada, y `CinematicCamera` | 756-764, 799 |

Y una quinta que no es del motor: `playsound 0 10 SOUND_DEATH` en el
`game_death` del guion del jugador (`player_main.script:291`).

### El velo: rojo A MEDIAS, y dos décimas

`alfa 128` de 255. La pantalla no se pone roja: se pone **medio** roja y se sigue
viendo el mapa detrás, que es exactamente lo que se describió como «el color se
pone algo rojo».

Y los quince segundos del mensaje son el **aguante**, no la duración: el velo
baja de 128 a 0 en las dos décimas de `fadeTime` y lo que aguanta quince
segundos es el struct antes de olvidarse. En la práctica reapareces a los cinco
y el rojo ya no estaba.

> **Aquí no hay cita de la curva, y se dice.** El mod manda un mensaje
> (`gmsgFade`, util.cpp:1137-1153) y **quien lo pinta es el motor**, que no viene
> con la fuente. Lo único que se puede leer del SDK es el struct
> (`common/screenfade.h:14-22`) y el único sitio que lo rellena a mano
> (`hudscript.cpp:268-270`), que dice que `fadeSpeed` es alfa por segundo. De ahí
> sale `alfaDelDesvanecido`, y no lleva `archivo:línea` de la fórmula porque no
> hay archivo que citar. Inventarse la cita habría sido peor que no tenerla.

### La cámara, y el `+= 180` que parece un fallo y no lo es

```c
Vector vOrigin = pev->origin + gpGlobals->v_right * 70 + Vector(0, 0, 25);
UTIL_TraceLine(pev->origin, vOrigin, dont_ignore_monsters, edict(), &tr);
if (tr.flFraction < 1.0) vOrigin = tr.vecEndPos;
Vector vAngles = UTIL_VecToAngles(vOrigin - pev->origin);
vAngles.y += 180;
                                                        player.cpp:756-764
```

Setenta unidades a tu derecha y veinticinco arriba —metro y ochenta en total—,
con una traza para no meterse en la pared. Y `dont_ignore_monsters`: si tienes
al goblin pegado al costado, **la cámara se apoya en él**.

Lo que llama la atención es que sólo se le da la vuelta al GIRO. El cabeceo se
queda como sale de `VecToAngles`… y sale bien. `VectorAngles` devuelve el
cabeceo con el signo al revés del de una mirada: para un vector que sube da
positivo, y un ángulo de vista positivo significa mirar hacia abajo. Se le pasa
el vector cuerpo→cámara, que sube 25 unidades, así que sale +19,65°, o sea
«mira 19,65° hacia abajo» — que es justo lo que hace falta. **Las dos
inversiones se cancelan.** La prueba lo comprueba con el ángulo entre la mirada
y el cuerpo: 0,00°.

### El grito no sale de `DeathSound()`

```c
void CBasePlayer::DeathSound(void)
{
  //Master Sword: Don't play this if you got splattered
  //if( !FBitSet(pev->effects,EF_NODRAW) )
  //  PlaySound( CHAN_VOICE, "player/death.wav", 1, true );
  STOP_SOUND(edict(), CHAN_ITEM,   "common/null.wav");
  STOP_SOUND(edict(), CHAN_BODY,   "common/null.wav");
  STOP_SOUND(edict(), CHAN_WEAPON, "common/null.wav");
}
                                                        player.cpp:360-369
```

La función que se llama «sonido de muerte» tiene el sonido comentado y lo único
que hace es **callar tres canales**. El grito lo tira el guion, y depende del
género: `player/death.wav` o `player/FemaleDeath.wav`
(`externals.script:47` y `:65`). Los dos se han añadido al horneado
(`tools/sonido.mjs`, que pasa de 7 a 10 sonidos de jugador).

### El cadáver, que es lo que la cámara mira

Sin esto la cámara se apartaba metro y ochenta, se giraba y enfocaba **el
aire**: al jugador local no se le dibuja el cuerpo. El motor crea una entidad
`CCorpse` justo antes de apuntar (player.cpp:795-797).

Y el cadáver de Master Sword **no se tumba**, que es lo primero que uno da por
hecho:

```c
pev->sequence     = pSource->pev->sequence;
pev->gaitsequence = pSource->pev->gaitsequence;
ResetSequenceInfo();
pev->frame = 0;
                                                corpse.cpp:86-87, 106-108
```

copia la secuencia que llevaras, y la animación de morir del jugador **está
comentada** en `Killed` (player.cpp:717-719). Así que tu cadáver se queda de
pie, respirando, con la animación de estar quieto desde su primer fotograma.
Tampoco lleva tu equipo: el bloque que duplicaría el `Body` está comentado
entero (corpse.cpp:73-77). Va portado así, con una prueba que lo dice.

Lo que **no** se porta es que dure 120 segundos (`MSITEM_TIME_EXPIRE`) y se
pueda saquear: aquí se quita al reaparecer, porque el saqueo de cadáveres no
está y un cuerpo tirado en la calle sin nada que hacer con él es adorno, no
fidelidad. Declarado en `src/render/cadaver.js`.

### Y el panel inventado se retira

`pantallaMuerte` era nuestro: un `mx-panel` con un botón «get up». Con la
presentación de verdad portada, el panel tapaba justo la cámara que se acababa
de traer y daba dos caminos para levantarse cuando el motor tiene uno. Se apaga
—la función se queda como suplente, `usarPanelDeMuerte()`— y el hallazgo que
enseñaba (el juego dice que pierdes el 5 % del oro y el código cobra el 1 %) no
se pierde: sigue escrito en `IMPUESTO_DE_MUERTE`, y el impuesto ahora sale por
donde lo saca el motor, que es la consola de sucesos en rojo:

```c
SendEventMsg(HUDEVENT_UNABLE, UTIL_VarArgs("Death Penalty: Lost %i gp \n", TaxOut));
                                                        player.cpp:678
```

---

## 3 · Subir de nivel: cinco cosas a la vez

Primero, la palabra. **En Master Sword no hay nivel**: hay nueve habilidades con
tres propiedades cada una, y lo que sube es una propiedad. La palabra «level» es
del guion —«has gained a level!»— y se conserva por eso.

Las cinco cosas, repartidas entre motor y guion:

```
motor · CBasePlayer::LearnSkill · playerstats.cpp:138-173
  1. un cartel «Swordsmanship Proficiency +1», escrito letra a letra
  2. SendInfoMsg("You become more adept at %s.\n")      a tu consola

guion · game_learnskill · player/player_main.script:484-507
  3. infomsg all  "<nombre> has gained a level!"        a TODOS
  4. playsound 0 10 magic/converted_EnchP01.wav
  5. clientevent new all player/player_conartist levelup <índice>
```

### El cartel sale DOS VECES, y es un fallo del motor

```c
UTIL_HudMessage(this, htp, "%s %s +1\n", ...SkillTypeList[best]);    // (A)
if (!is_spell_stat) {
  SendInfoMsg("You become more adept at %s.\n", ...);
  UTIL_HudMessage(this, htp, "%s %s +1\n", ...SkillTypeList[best]);  // (B)
} else {
  SendInfoMsg("You become more adept at %s.\n", SkillStatList[i]);
  UTIL_HudMessage(this, htp, "%s %s +1\n", ...SpellTypeList[best]);
}
                                                    playerstats.cpp:153-167
```

Para un arma, (A) y (B) son **idénticos**: mismo texto, mismo sitio, mismo
instante. `CHudMessage` tiene dieciséis ranuras y no las desplaza —cada mensaje
se dibuja en su propia `x`,`y` y punto (`Draw`, message.cpp:355-380)—, así que
se pintan uno encima del otro y el cartel sale más saturado de lo que saldría
una vez. Portado con el fallo.

Para la magia **no son iguales, y el primero miente**: (A) indexa
`SkillTypeList` —las tres propiedades de armas— con el índice de la ESCUELA. Al
subir hielo (1) sale «Spell Casting Balance +1», que en magia no existe. Y con
adivinación (3) o aflicción (4) eso es **leer fuera de un array de tres**. En C
es la memoria de al lado; aquí sale `undefined` y se escribe «???», que al menos
se ve.

Un tercero, menor: el `SendInfoMsg` de la rama de magia pasa `SkillStatList[i]`
—la estructura— donde se espera un `char*`. Funciona por accidente en x86 de 32
bits, porque el primer campo de `skillstatinfo_t` es el `const char *Name`
(`stats.h:91-96`) y eso es lo que el `%s` acaba leyendo de la pila.

### El efecto 2 de `CHudMessage`, portado entero

El cartel no aparece: **se escribe**. Cada letra sale `fadein` después de la
anterior, con un fogonazo del color 2 —ámbar (178,119,0)— que se apaga hacia el
color 1 —verde (0,128,0)— en `fxtime`. Tres cosas que dan ganas de arreglar y no
se arreglan:

- **`charTime += fadein` va ANTES de comparar** (message.cpp:152-153): la
  primera letra sale en 0,02 y no en 0. El índice que cuenta es `i + 1`.
- **Una letra que no ha salido se dibuja NEGRA**, no se salta
  (message.cpp:155-156). En una pantalla oscura no se ve; sobre algo claro el
  cartel entero está ahí desde el primer fotograma, en negro.
- **`>> 8` en vez de `/ 255`** (message.cpp:184-186): dividir por 256 una mezcla
  que llega a 255. El verde 128 sale **127** y nunca 128, y una letra recién
  salida no llega del todo al ámbar porque el `255 - (… + 0.5)` se trunca a un
  `int` y da 254. Son de Valve y van copiados.

Y el aguante empieza cuando ha salido la **última** letra:
`fadeTime = fadein · length + holdtime` (message.cpp:222-223). Con 28 letras eso
son 2,56 s antes de empezar a irse y 3 más para irse: el cartel dura **cinco
segundos y medio**, no dos.

### La lluvia de colores: 160 chispas en cuatro segundos

`player/player_conartist.script:18-37` y `:70-155`. El guion se llama a sí mismo
cada 0,1 s durante 4 s y cada vuelta crea **cuatro** sprites: 40 × 4 = **160**.

| | |
| --- | --- |
| dónde nacen | anillo de 32 unidades a un giro al azar, **32 por debajo** del origen — o sea a los pies, no en el pecho |
| qué son | `xflare1.spr` a escala 0,25, aditivo, `rendercolor` al azar por chispa |
| cuánto viven | `death_delay 1.0`, y desaparecen de golpe: no llevan desvanecido |
| cómo se mueven | velocidad horizontal `±20` u/s y **gravedad −0,5** |

La gravedad negativa es la clave: el cliente hace
`gravity = -frametime · cl_gravity · curstate.gravity` (entity.cpp:1942,1951-1952)
y luego `baseline.origin[2] += gravity` (entity.cpp:2301-2302), con la velocidad
guardada en `baseline.origin` —«Velocity is stored in entity.baseline.origin...
why? ASK VALVE», entity.cpp:1653—. Con `cl_gravity` 800 y el −0,5 del guion eso
son **+400 unidades por segundo al cuadrado hacia arriba**: en el segundo que
viven suben 200 unidades, cinco metros. Es una fuente, no un polvillo. La sonda
lo mide: 4,02 m sobre el anillo al segundo, contra un techo de 5,08.

### La luz verde no se ve NUNCA, y lo cazó la sonda

El guion enciende `cleffect light new <origin> 200 (0,255,0) 3.0` y acto seguido
llama a `sprite_spoog` **sin retardo**; lo primero que hace
`levelup_createsprite` es repintar **esa misma luz** —`cleffect light LVL_LIGHT`,
el id que acaba de guardar— con un color al azar y 0,1 s de vida. O sea que el
verde de tres segundos dura cero tics y lo que se ve son diez colores por
segundo. Portado con el fallo, con dos controles: que arranca verde y que la
primera vuelta se lo lleva.

### Y trece líneas muertas

`levelup_createsprite` calcula `RND_LEFT`, `RND_RIGHT`, `SPRITE_VEL` y los tres
`COLOR_*` al empezar y **no usa ninguno**: `setup_levelup_sprite` los vuelve a
calcular todos. También está muerto el `const LEVELUP_SCRIPT
player/player_cl_effects_levelup` de `player_main.script:44` — el guion viejo
existe, hace lo mismo con un `repeatdelay` en vez de la recursión, y nadie lo
llama: la línea 504 nombra `player/player_conartist` a pelo.

---

## 4 · `xflare1.spr` no está en `../MSC/`, y esta vez sí se pudo leer

Los 118 sprites de `assets/msr/sprites/` se listaron uno a uno y `xflare1.spr` no
es uno de ellos: **es del Half-Life base**, exactamente como los 36 sonidos de
`pl_step*` y como `glow01.spr`. Se trata igual, con el mismo `HALFLIFE` que ya
usa `tools/sonido.mjs` y una herramienta nueva, `npm run efectos`:

1. si está en el mod, manda el mod;
2. si no, se lee de `valve/` — y eso **es de Valve**, se dice aparte y no se
   puede redistribuir;
3. y si tampoco, se genera el sustituto de `src/bsp/halo.js`: una bengala
   nuestra, de un cuadro, marcada `generado: true`.

Con la instalación de Half-Life al lado se pudo medir, y **el guion no se
inventaba nada**: `xflare1.spr` tiene **20 cuadros de 64×64 y mezcla aditiva**,
que es justo lo que le pide `setup_levelup_sprite` con su `frames 20` y su
`rendermode add`.

El camino 3 se ejercita con `HALFLIFE=none`, por lo mismo que en el sonido: un
camino que no se puede probar se pudre sin que nadie se entere. La sonda dice de
dónde salió el dibujo y cuántos cuadros tiene de verdad, así que una medida con
el sustituto no puede pasar por buena sin saberlo.

---

## 5 · La luz dinámica: dos números que son nuestros

En GoldSrc una `dlight` tiene radio, color y una caída lineal. Three no tiene
eso, así que la candela y el `decay` **no están en ninguna parte del juego** y
hay que elegirlos:

- `decay: 1` y no 2, el mismo trato que ya tiene el glow del jugador. El primer
  intento fue con 2 —la caída física de Three— y la sonda salió con el suelo
  entero en blanco: una luz de cinco metros de radio quema todo lo que tiene a
  uno.
- candela 3, la mitad del glow, porque esta luz dura cuatro segundos y parpadea
  diez veces por segundo, y eso llama mucho más que una fija del mismo brillo.

Los dos van escritos como nuestros en `src/render/chispas.js`.

---

## 6 · Lo que cambia

```
src/play/muerte.js         NUEVO  el velo, la cámara, el grito
src/play/nivel.js          NUEVO  el cartel, los avisos, el sonido, la lluvia
src/juego/mensajes.js      NUEVO  los tres sitios donde el juego escribe encima
src/render/chispas.js      NUEVO  las 160 chispas y la luz
src/render/cadaver.js      NUEVO  tu cuerpo, de pie
tools/efectos.mjs          NUEVO  hornea xflare1.spr (mod → valve/ → generado)
sondas/muerte41.mjs        NUEVO  34 controles

src/render/otros.js        `figuraDeJugador` sale fuera: la usan los otros y el cadáver
src/juego/interfaz.js      la muerte deja de abrir panel
src/bsp/halo.js            segundo sustituto: `bengala()`
tools/sonido.mjs           7 → 10 sonidos de jugador
src/main.js                el enganche, y la cámara con sus dos ramas
src/dev/sonda.js           `muerte` y `nivel`, y `draw()` con las dos ramas
src/red/partida.js         el mensaje de experiencia lleva QUÉ subió, no sólo cuántas
```

No se toca: el ciclo de la muerte del 21, el impuesto, la espera de cinco
segundos, la regla de soltar las teclas, ni la cuenta de la experiencia.

## Las pruebas, y las cuatro falsificadas

| prueba | falsificada quitando |
| --- | --- |
| `y pasado el fxtime se queda en VERDE — pero en 127` | el `>> 8` → roja |
| `y se manda DOS VECES, que es el fallo del motor` | `VECES = 1` → roja |
| `MIRA AL CUERPO, que es lo que hace el += 180` | el giro sin la vuelta → roja |
| `y mira hacia ABAJO, porque está por encima` | el signo del cabeceo → roja |

## La sonda que medía la vara equivocada

Dos controles salieron rojos con todo bien, y los dos por lo mismo: la vara.

**«las chispas SUBEN» daba 20 de 40.** Contaba las que estaban por encima del
cuerpo, y el anillo nace 32 unidades **por debajo**: la mitad de las vivas
acaban de nacer y están abajo por definición. La medida buena es la altura sobre
su propio anillo, y con ella salen 4,02 m contra un techo calculado de 5,08.

**«la primera luz es VERDE» salía de otro color.** No era un fallo del puerto:
era el hallazgo de arriba, que el verde lo pisa la primera vuelta en el mismo
tic. El control se partió en dos y ahora dice las dos mitades.

Y una tercera, de foto: la primera captura del efecto salía sin una sola chispa.
No faltaban — el anillo nace a los pies y las chispas miden 16 unidades, así que
en primera persona y mirando al frente **caen fuera del cono de visión** hasta
que han subido casi un metro. Pasa igual en el juego. La foto se toma mirando
hacia abajo y la razón está escrita al lado, para que nadie lo lea como que el
efecto no está.

## Cuentas

`npm test` **1 095** (eran 1 040) · `vite build` limpio ·
`sonda:muerte41` **34/34** · `hud` 36/36 · `golpe` 25/25 · `escudo` 34/34 ·
`mundo` 40/40 · `pulido` 37/41 y `arco` 36/37, que son los rojos de siempre
—los cuatro de sonido del 38 y la moneda al aire del muro a 150 unidades— y no
los toca este experimento.
