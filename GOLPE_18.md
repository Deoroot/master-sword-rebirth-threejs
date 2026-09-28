# 18 · Que el jugador pegue

> «entiendo que se tendrían que importar los modelos de armas y todo eso»

La otra mitad del 17. Los bichos ya pegaban; ahora los 69 tienen algo que temer,
y `hp`, `ANIM_DEATH` y `NPC_GIVE_EXP` —que se leían desde hace dos tandas— por
fin significan algo.

```
npm run armas        extrae las 8 armas de partida: ficha, modelo y sonidos
npm run sonda:golpe  25 controles: empuñar, blandir, acertar, matar y subir
```

**693 pruebas en verde y 25 de 25 controles del golpe**, con los 15 de IA, 30
del mapa, 20 del sonido, 31 del ciclo, 19 de física y 29 del cuerpo intactos.

---

## 1. Un arma no es un número: son dos modelos y una lista de ataques

La espada oxidada —la primera de las siete de `reg.newchar.weaponlist`—
registra **dos ataques**, no uno, y cada uno trae once campos. Lo que hacía
falta leer y no se leía:

| | |
| --- | --- |
| `delay.strike` **0,6 s** | cuándo DUELE |
| `delay.end` 1,1 s | cuándo ACABA |
| `MODEL_VIEW` + `_IDX` 1 | cuál de los **21 filos** de `v_1hswords.mdl` |
| `MODEL_BODY_OFS` 24 | cuál de los **117 submodelos** de `p_weapons1.mdl` |

Los dos relojes son la mitad del tacto del combate: el daño cae **por la mitad
del movimiento**. Con uno solo, el arma hace daño en el fotograma del clic y se
juega como una pistola.

Y los dos números de submodelo son la diferencia entre ver tu espada y ver
**otra arma**, que no da ningún error. El control no es que el nombre se
parezca —eso suspendía al `rknife`, que sale en un submodelo llamado `rdagger`,
y al `rsmallaxe`, que sale en `rustedaxe`—; el control bueno lo da el propio
script: `game_fall` hace `inc L_SUBMODEL 2`, así que **dos submodelos más allá
tiene que llamarse `<lo mismo>_floor`**. Eso lo dice el motor y no mi
diccionario, y pasa en las cinco armas con modelo de mundo, incluido el arco,
que resulta que se lleva en la mano izquierda.

---

## 2. Tres cosas del daño que no se adivinan

### La potencia multiplica, y un personaje nuevo tiene UNO

```cpp
flDamage = CurrentAttack->flDamage + RANDOM_LONG(0, flDamageRange);
flDamageFraction = CurrentAttackPower / STATPROP_MAX_VALUE;   // /100
flDamageFraction = V_max(flDamageFraction, 0.001f);
flDamage *= flDamageFraction;                     giattack.cpp:504-531
```

`CreateChar` da **un punto a la potencia** de cada habilidad (sv_character.cpp:44).
O sea que la espada de «90 a 140» hace **0,9 a 1,4**, y el goblin de 50 de vida
aguanta cuarenta y cuatro mandobles. Medido en el mapa: **107 mandobles, 44
impactos, un goblin muerto.** No es un fallo de lectura, es la curva de Master
Sword — y explica por qué el mapa tiene ratas de 4 de vida.

### La puntería del arma ya no sirve para acertar

`MELEE_ACCURACY 70%` está en el script y **no se usa**:

```cpp
//always hit, reuse flAccuracyDefault as crit chance.
float flHitPercentage = 100;                      giattack.cpp:769
```

El jugador acierta **siempre**. Portar el 70 % habría dado un arma que falla
tres de cada diez veces sin que el motor lo haga. Y el comentario miente a
medias: el umbral de crítico no sale de ahí, sale de `critthreshold` y, si no
está, de **95** sobre un dado de 0 a 99 comparado con `>` — o sea **4 %, no 5**.

### Y la balanza se calcula y se tira

Dos líneas antes de la potencia, el motor calcula la fracción con la BALANZA…
y la sobreescribe sin usarla. En Rebirth, de las tres propiedades de una
habilidad, **sólo la potencia hace algo** en el daño.

---

## 3. El mandoble no es un rayo: es una esfera

Esto es lo que más me habría costado adivinar, y cambia cómo se juega.
`DoDamage` **no traza una línea**:

```cpp
while( (pTarget = UTIL_FindEntityInSphere(pTarget, vecSrc, flRange)) ) {
    UTIL_TraceLine( vecSrc, pTarget->Center(), ignore_monsters, ... );
    if( tr.flFraction < 1.0f ) continue;                    // pared en medio
    if( FInViewCone(tr.vecEndPos, VIEW_FIELD_NARROW) )
      if( !Hits.size() || Hits[0].Dist > dist ) ...          // el más cercano
}                                                giattack.cpp:1547-1580
```

Una **esfera** del radio del alcance alrededor del ojo, la traza sólo para ver
si hay mundo en medio —**ignorando a los monstruos**, o el de delante taparía al
de detrás—, el cono, y **un solo objetivo: el más cercano**. Y sólo si no hay
nadie se traza la línea de verdad, que es de donde sale el `hitwall`.

Dos consecuencias que se juegan:

- le pegas a un goblin que tengas pegado al hombro, no hace falta la cruceta;
- pero **no le das a dos a la vez** ni al de detrás.

### El cono es de rumbo y no tiene techo

`FInViewCone` hace el producto escalar **en 2D** — «making the view cone
infinitely tall», combat.cpp:1152. O sea que mirando al suelo le pegas igual a
lo que tengas delante. Y se mide desde el **centro** del jugador, no desde el
ojo: el ojo es el origen del alcance y `pev->origin` el del cono.

### El alcance real son 43 unidades, no 60

Lo midió la sonda: el alcance son 60 unidades **del ojo al pecho del bicho**, y
34 de esas 60 se las come la diferencia de alturas. El alcance HORIZONTAL contra
un goblin es de **43 unidades, 1,09 m**. A 1,2 m ya no llegas. El cuerpo a
cuerpo de Master Sword es un abrazo, y la primera versión de la sonda se puso a
1,2 m y midió «no le doy a nada».

---

## 4. La carga, que es una máquina de precisión y casi nadie la ve

El ataque cargado **no se hace aguantando el botón desde el principio**:

```cpp
if( ((CurrentAttack && !CurrentAttack->flChargeAmt) || ms_autocharge==1)
    && !m_TimeChargeStart && GetHighestAttackCharge() )
  m_TimeChargeStart = gpGlobals->time;         genericitem.cpp:735-741
```

El reloj sólo arranca **si al pulsar ya estabas atacando**. Así que la secuencia
es: clic (mandoble) → **segundo clic mientras el primero corre**, y aguantar →
soltar. Mientras cargas el ataque normal está descartado, así que el brazo se
queda quieto con la carga en la mano; al soltar sale el cargado, que vale el
doble de daño y el doble de aguante.

Y hay un detalle cruel: `ActivateButtonUp` se ejecuta **con el botón arriba
todos los fotogramas**, no al soltarlo, y recalcula la carga guardada desde un
reloj que ya está a cero. O sea que **la carga guardada vive un fotograma**: si
sueltas a medio mandoble, se tira. Escribirlo como un flanco —que es lo natural—
deja el cargado disponible minutos después.

---

## 5. El bloqueo que medí y que resultó ser del motor

La sonda dijo: **120 segundos aguantando el botón, cero mandobles, ni un
error.** Y la causa, cuando salió, estaba escrita en el motor: con una carga
guardada, el ataque normal está descartado por estar cargando y el cargado por
las teclas —`-attack1` pide el botón arriba—, así que **no hay ningún ataque que
cumpla las condiciones**. El motor se cura solo porque el jugador acaba
soltando, y soltar pone la carga a cero.

Está portado tal cual, con una prueba que dice que pasa y por qué, en vez de
«arreglarlo»: el día que alguien lo vea jugando, la prueba le dice dónde está
escrito.

Lo que sí cambió es la sonda: **`atacar()` suelta el botón hasta que el brazo
está en reposo antes de pulsar**, porque quiere medir un clic desde quieto. Sin
eso heredaba el mandoble a medias de la medición anterior y **pulsar significaba
otra cosa** — un clic durante un mandoble es una carga. Medía cero, sin error, y
la regla funcionaba.

---

## 6. Y un error de forma que ya había cometido dos veces

El diagnóstico `porque(n)` —que dice si no le das por lejos, por el cono o por
la pared— daba «fuera del cono, 60°» de un goblin que estaba justo delante.
Dividí el producto escalar por la distancia al bicho y **no por la longitud
horizontal de la mirada**, que mirando 60° hacia abajo mide 0,5.

Es el mismo error que el del rayo hasta el ojo en el 17 y el de la puerta en el
16, y esta vez en el instrumento de medir en lugar de en lo medido. Un
diagnóstico equivocado es peor que ninguno: me mandó a mirar el cono cuando el
problema era el alcance.

---

## 6b. Los noventa grados del arma, que se vieron jugando

La primera versión ponía el arma **a la derecha de la pantalla**, medio brazo
fuera del cuadro. Y ninguno de los diecinueve controles lo notaba: el arma
estaba montada, animada, y hacía daño.

La causa son dos convenciones que llevaban desde el 15 una en cada archivo:

```js
bichos.js   i.nodo.rotation.y = Math.atan2(-dz,  dx)   // el modelo mira a +x
main.js     player.yaw        = Math.atan2(-dx, -dz)   // la cámara mira a −z
```

**Noventa grados exactos.** En el mundo no se nota porque los bichos y el mapa
comparten convención; en la mano, la cámara trae la otra. Y no se ve como «está
girado»: se ve como «está mal colocado», que es lo que me pareció, y lo que me
mandó a mirar la posición en vez del giro.

Ahora hay un control que lo mide: **dónde cae la malla en los ejes de la
vista**, en unidades. Con el fallo daba `derecha 5..26, delante −18..11` —el
arma al lado— y sin él `derecha −18..11, delante −5..26`, delante y repartida a
los dos lados. Es la misma idea que el juez de la caja del `.mdl`: no comprobar
la constante que acabo de escribir, sino dónde acaba la geometría.

## 6c. El muñeco: `ms_lildude`

Lo que se ve abajo en Master Sword **no es tu cuerpo visto desde arriba**. El
propio código lo dice:

```cpp
// Render player model on HUD
// It's a permanent 3D inset
void CRenderPlayerInset::Render()              clrenderent.cpp:368
```

Es una copia en miniatura de tu modelo puesta delante de la cámara, y los
cuatro números salen de `V_CalcRefdef`:

```cpp
Ent.origin  = pparams->vieworg;
Ent.origin += pparams->forward * 4.7 + pparams->up * -3.1;
Ent.angles  = Vector( -vAng[0], vAng[1], 0 );            view.cpp:1757
m_Ent.curstate.scale = INSET_SCALE;   // 0.026            clrender.h:34
```

4,7 unidades delante y 3,1 por debajo del ojo —5,63 de separación, medidos en
la sonda— a escala **0,026**, con tu mismo rumbo: lo ves de espaldas. Eso
cambia lo que hay que escribir, porque un cuerpo de verdad habría que
agacharlo, pisarle el suelo y que no se metiera en las paredes; esto sólo se
pone donde toca.

El pitch va negado y **eso no es un giro**: es la convención de los modelos de
estudio, que `R_StudioSetUpTransform` vuelve a negar al montar la matriz. Las
dos negaciones se cancelan. Copiarlo literalmente lo dejaría cabeza abajo cada
vez que miras al suelo.

Va con el género del personaje, y ahí hubo un fallo que merece quedarse
escrito: el modelo femenino declara **`pistasDe`** —su animación entera vive en
el binario del masculino, que son 970 de sus 1 020 KB— y el cargador genérico
no le hacía caso. Eso no da un muñeco sin animar: **tira la página** con una
excepción dentro de un `await` de un manejador, así que aparece en la consola
sin decir de quién es. Las 693 pruebas seguían en verde y la sonda del golpe
también, porque el muñeco del jugador sí carga. Lo cazó **el contador de
errores de página de otra sonda**, la del cuerpo, que creaba una personaja.

Y va **sin su equipo**: el
motor le dibuja encima el arma y la armadura con la misma escala
(`RenderGearItem`), y eso pide los puntos de anclaje del `.mdl`, que todavía no
se leen. Sale con las manos vacías.

## 7. Lo que se ve y lo que se oye

- **El muñeco** y **el arma** se dibujan juntos en una pasada aparte, para que
  se tapen bien entre ellos: la mano cae justo encima del muñeco.
- **El arma en la mano**: 1 932 triángulos, con brazos, y su secuencia de
  ataque —una de las tres que tiene, elegida al azar como hace la base—. Se
  dibuja en una **segunda pasada con la profundidad limpia**, que es lo que hace
  que la punta no se hunda en cada pared.
- **El cadáver** dura lo que dice el motor: **20 s quieto y 3,6 s
  desvaneciéndose** (`nextthink + 20`, y `renderamt -= 7` cada 0,1 s), y deja de
  tener colisionador al morir — sin eso es un muro invisible en medio de la
  calle.
- **Los sonidos de combate** ya no son una lista escrita a mano: el extractor
  trae **todo sonido que un manifiesto nombre**, y los nombran las armas
  (`SOUND_SWIPE`, `SOUND_HITWALL1`) y cada bicho (`SOUND_DEATH`, `SOUND_PAIN`).
  Salen **21 de 33**. Los 12 que faltan son de Half-Life otra vez: el zombi
  enano grita con `agrunt/ag_pain3.wav` y ningún arma tiene su golpe en carne
  (`cbar_hitbod*`). El goblin sí los tiene todos.

---

## 8. La experiencia, que no se da al golpear

El motor va apuntando en el monstruo cuánto daño le ha hecho cada jugador **y
con qué propiedad**, y reparte al morir:

```cpp
mult = min( 1, m_MaxHP / dmgInTotal );                 // castiga pasarse
xp   = redondear( m_SkillLevel * (dmg * mult) / MaxHP );
                                        msmonsterserver.cpp:2500-2510
```

Con tres detalles que salen de leerlo: matar a un bicho de 20 de vida haciéndole
200 de daño da la experiencia de 20; la propiedad de cada golpe **se sortea**
(`RANDOM_LONG(0, subStats-1)`), así que no subes sólo daño; y como el redondeo
es **por cubo**, repartir entre las tres propiedades pierde algo por el camino.

Medido: matar al goblin dio sus 25 puntos repartidos entre las tres, y la hoja
pasó de `0/0/1` a `1/1/1` con experiencia suelta en las tres. **Ése es el ciclo
completo**: pegas, sube, y el siguiente goblin cuesta menos.

---

## 9. Lo que NO está

- **Parar y bloquear** (`hold-strike`), que es medio combate de Master Sword:
  el escudo y el parry tienen su tipo de ataque y su `PARRY_VALUE`, leídos y sin
  portar.
- **Los proyectiles**: el arco y la lanza registran `charge-throw-projectile` y
  aquí sólo se ejecuta `strike-land`.
- **La patada** de `base_kick`, que los puños traen de serie.
- El **modelo de tercera persona** en la mano: se extrae y se guarda
  (`p_weapons1_b24`), y todavía no lo lleva nadie puesto.
- **Avisar a los aliados** al golpear a uno, que el script sí hace
  (`npcatk_alert_all_allies`).

---

## 10. Lo que sigue

- Que el golpe **mueva** al que lo recibe y que el bicho reaccione: encogerse,
  huir con poca vida, y avisar a los suyos. Es lo que hace que pegar a un
  goblin en la plaza tenga consecuencias.
- Los **5 `trigger_once`** con sus generadores de monstruos, ya horneados.
- **El equipo del muñeco**: que lleve en la mano el arma que llevas, que es lo
  que hace el motor con los puntos de anclaje del `.mdl`.
- **Los sonidos del jugador** que faltan: correr, saltar y los de combate.
