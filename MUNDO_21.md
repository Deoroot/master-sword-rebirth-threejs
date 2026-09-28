# Experimento 21 — El mundo vivo

Escrito el 27 de septiembre de 2026, al cerrar el 20.

Este experimento no salió de leer el motor: salió de **jugar**. Cuatro cosas que
se notaron con los ojos y con los oídos, y que ninguna de las 766 pruebas ni de
los 168 controles de sonda que había veía:

> «varios NPC tienen su animación por defecto como la de caminar, y lo raro es
> que aun así no caminan. Los goblins sí tienen su idle en pie pero no reaccionan
> cuando me acerco; sí veo que hay reacción cuando les pego, pero lo que se
> escucha es el efecto de cuando en MSR le pegas a enemigos con armadura o
> metálicos. Lo que sí noté es que mueren pero no subí de nivel.»

Las cuatro resultaron ser cuatro cosas distintas, y la última resultó ser cuatro
más. Una de ellas es un interruptor.

> **795 pruebas** (23 nuevas) y **28 de 28 controles** de la sonda del mundo, con
> el resto de la batería intacto: escudo 34, consecuencias 44, golpe 25, IA 15,
> cuerpo 29, mapa 30, sonido 20. `npm run sonda:mundo`.

---

## 1. La IA llevaba cuatro experimentos apagada

```js
let paseando = false;                              // src/main.js:685, hasta hoy
...
if (paseando) { bichos.cazar(dtB, {...}); }        // src/main.js:1543
```

Eso venía del 17, cuando el paseo era una sonda detrás de la tecla `O`. En ese
mismo experimento `cazar` sustituyó a `pasear`, y **nadie le dio la vuelta al
interruptor**. El juego se abría con 69 bichos congelados.

Lo difícil de esto no es el fallo, es por qué duró cuatro experimentos con dos
sondas de IA en verde. Porque las dos llaman a `probe.ia.correr()`, que mete a
los bichos a pensar **a mano**:

```js
correr(s = 3) { for (let t = 0; t < s; t += 1/60) bichos?.cazar(1/60, arnesDePaseo); }
```

O sea que `sonda:ia` medía la IA y no medía **si el juego la llama**. Los 15
controles pasaban con el interruptor en `false`. El del 21 no llama a nadie: se
aparece al lado de un goblin y se esperan seis segundos de reloj de pared.

```
  6 s parado al lado de un Goblin, sin llamar a la IA:
    atacantes 0 -> 3, golpes 0 -> 0
    el goblin: perseguir, animación 'run'
```

Y el mensaje de la tecla `O` seguía siendo el del 17 —«NO es la IA del mod»—,
que es otra forma de la misma cosa: el texto describía un código que ya no
existía.

---

## 2. Un aldeano con un pie levantado

Dieciséis de los sesenta y nueve estaban plantados en mitad de una zancada. No
es que se les hubiera parado la animación: es que era **la que no era**.

```js
const actual = pon(c.parado ?? c.andando);         // src/render/bichos.js, hasta hoy
```

`NPCs/default_dwarf.script` no dice cuál es su animación de estar quieto. Sólo
dice `setmoveanim walk`. Así que caíamos en la de andar. El motor no:

```cpp
if (HasConditions(MONSTER_HASMOVEDEST)) SetAnimation(MONSTER_ANIM_WALK, m_MoveAnim);
else if (m_IdleAnim.len())              SetAnimation(MONSTER_ANIM_WALK, m_IdleAnim);
else { m_pAnimHandler = NULL; SetActivity(ACT_IDLE); }
                                            msmonsterserver.cpp:590-600
```

**Pide la ACTIVIDAD**, que es un número que el compilador escribió en la cabecera
de cada secuencia del `.mdl` y que ya estábamos leyendo sin usarlo. Y sólo si el
modelo tampoco la trae, la secuencia 0:

```cpp
iSequence = LookupActivity(NewActivity);
if (iSequence > ACTIVITY_NOT_AVAILABLE) { pev->sequence = iSequence; ... }
else pev->sequence = 0;                          monsters.cpp:1229-1254
```

Medido en los 69: **36 la nombran, 33 salen por ACT_IDLE y ninguno cae a la
secuencia 0.** O sea que el arreglo cura a 33 y no a los 16 que se veían.

### El sorteo con peso, que es lo que hace que el pueblo esté vivo

`LookupActivity` no devuelve la primera que empata. Sortea entre todas, en
proporción a `actweight`, con un muestreo por depósito en una sola pasada:

```cpp
int weighttotal = 0;  int seq = ACTIVITY_NOT_AVAILABLE;
for (int i = 0; i < numseq; i++)
  if (pseqdesc[i].activity == activity) {
    weighttotal += pseqdesc[i].actweight;
    if (!weighttotal || RANDOM_LONG(0, weighttotal - 1) < pseqdesc[i].actweight)
      seq = i;
  }
                                            animation.cpp:81-106
```

Y `SetActivity` se vuelve a llamar **cada vez que la secuencia termina**. Eso no
es un detalle de implementación: es una decisión de diseño escrita en los
modelos. Los pesos que trae Gate City:

| modelo | secuencias con ACT_IDLE y su peso |
|---|---|
| `dwarf/male1.mdl` | `idle` 10, `nod` 10, `anim_xbow_aim_idle` 3 |
| `npc/human1.mdl` | `idle1` 50, `idle7` 10, `idle4` 2, `idle3` 1, `idle5` 1, `idle6` 1 |
| `monsters/goblin_new.mdl` | `idle1` 1 |

**Los enanos asienten con la cabeza.** El 43 % de las veces, y cada dos segundos
vuelven a tirar el dado. El humano se queda quieto el 77 % del tiempo y de vez
en cuando hace otra cosa. El goblin no tiene variedad ninguna, y por eso el
goblin sí se veía bien.

Hay un rincón que va portado tal cual: el **`!weighttotal`**. Si todas las
candidatas pesan cero, `weighttotal` se queda a cero, la condición se cumple
siempre y gana **la última**. No es «la primera» ni «al azar», y en un modelo con
los pesos sin poner es el caso que manda.

### Y un cambio en el horneado

Una secuencia que nadie pide por nombre no se horneaba. Había que pedirlas por
actividad además de por nombre, y por eso `tools/bicho.mjs` tiene ahora un
parámetro `actividades`. Sin eso, el arreglo habría dejado al aldeano en la
secuencia 0, que es otra pose equivocada.

---

## 3. El paseo no estaba en ningún script

> **Corregido en el 22:** todo esto era cierto y el juego no lo llamaba.
> `bichos.cazar` sólo paseaba a los bichos sin ficha de combate, que en Gate
> City son cero de 69, y la sonda de aquí no lo vio porque llama a
> `bichos.pasear` a mano — el mismo fallo que el interruptor del §1, en el
> mismo experimento que lo denunciaba. Ver [MUNDO_22.md](MUNDO_22.md) §1.

`NPCs/default_dwarf.script` dice **una palabra**:

```
roam  1                                        NPCs/default_dwarf.script:44
```

y ya está. No hay `npc_wander`, ni ANIM_IDLE, ni nada. El resto es C++:

```cpp
else if (Cmd.Name() == "roam") {
  if (atoi(Params[0])) SetConditions(MONSTER_ROAM); else ClearConditions(MONSTER_ROAM); }
                                            npcscript.cpp:340-350
```

y `CMSMonster::SetWanderDest` (msmonsterserver.cpp:1053-1157) hace el resto. En
Gate City lo declaran **53 de los 69**; los otros 16 —el herrero, el tabernero,
el alcalde, el cofre del tesoro— están clavados a propósito, y eso hay que
respetarlo igual: un mercader que se va de paseo deja la tienda vacía.

Hasta hoy teníamos treinta líneas nuestras que andaban de frente y giraban al
chocar, y su propio comentario decía que no eran la IA de Master Sword. Las
cuatro cosas del original que no se adivinan:

**1. El rumbo se busca cerca y el destino está lejísimos.** El trazo que
comprueba que hay hueco va a `Proximity * 3`, unos 2,7 metros para un goblin.
Pero el destino que se apunta luego es otro:

```cpp
m_MoveDest.Origin = EyePosition() + vForward * RANDOM_FLOAT(300, 6000);
                                            msmonsterserver.cpp:1145
```

De 7,6 a **152 metros**. Por eso los aldeanos de Master Sword cruzan el pueblo
entero. Colapsar las dos distancias —que es lo natural, porque una es la que
acabas de comprobar— da bichos que tiemblan en el sitio. Medido: el que más se
mueve hace **16,75 metros en diez segundos**.

**2. El plazo de siete segundos es lo que marca el ritmo.** `m_NodeCancelTime`
se pone a `time + 7.0` al arrancar el paseo, así que el destino a 150 metros casi
nunca se alcanza: se anda siete segundos hacia allá y se vuelve a tirar. Los dos
segundos de `m_RoamDelay` son lo que se espera **antes** de elegir, no entre
pasos.

**3. El rumbo nuevo sale del actual, ±130 grados.** `UTIL_AngleMod(pev->angles.y
+ RANDOM_FLOAT(-130, 130))`. Un bicho no se da la vuelta en seco.

**4. Si los quince intentos fallan, se barren los 360 grados uno a uno** — y el
segundo bucle **mide desde otro sitio**. El primero traza desde el ojo hasta
`pev->origin + adelante·d` (línea 1084) y el segundo hasta `Center() + adelante·d`
(línea 1113). Son dos líneas distintas del archivo y van portadas como están,
con una prueba que comprueba que los quince primeros trazos salen de una altura
y los siguientes de otra. Si tampoco hay salida, el bicho se da por
«UNFIXABLY STUCK» y espera diez segundos.

Medido: **43 de los 53 con `roam` se mueven** en diez segundos, y **ninguno de los
16 clavados se mueve un centímetro**. Ese segundo control es el que impide
«arreglarlo» moviéndolos a todos.

---

## 4. El golpe metálico es correcto, y lo nuestro no lo era

La observación era buena y la conclusión era la contraria de la que parece. El
goblin **suena a chapa el 40 % de las veces en el juego original**:

```
{ eventname npc_struck
  volume 5
  playrandomsound 2 SOUND_HIT SOUND_HIT2 SOUND_STRUCK1 SOUND_STRUCK2 SOUND_STRUCK3 }
                                            monsters/goblin.script:76-81

const SOUND_HIT     monsters/goblin/c_gargoyle_hit1.wav
const SOUND_HIT2    monsters/goblin/c_gargoyle_hit2.wav
const SOUND_STRUCK1 body/flesh1.wav          (y 2, y 3)
```

Cinco candidatos y dos son de gárgola. Reutilización descarada del original.

Lo que estaba mal es que **nosotros no tocábamos ninguno de los cinco**:
tocábamos `SOUND_PAINYELL` en cada golpe, que es el grito de dolor — un sistema
que en el goblin está **apagado** (`NPC_USE_PAIN 0`) y que, cuando está
encendido, sólo suena por debajo de media vida y cada 5–10 segundos.

### Y para leerlo hubo que entrar donde no entrábamos

Este lector no interpreta scripts, y el sonido de recibir no está en ninguna
constante con nombre fijo: cada bicho lo monta a mano en su propio evento. Así
que `sonidosDeEvento` es lo más cerca de un intérprete que llega el proyecto —
lee el cuerpo de `npc_struck` y nada más— y se dice lo que no hace: no evalúa
condiciones, así que del zombi salen sus tres ramas en una bolsa.

Tres cosas que costaron tres intentos:

- **Repetir un nombre es como el mod le da PESO a un sonido.** `playrandomsound`
  sortea uniformemente sobre la lista tal cual (`Params[NextParm +
  RANDOM_LONG(...)]`, scriptcmds.cpp:4730). La rata gigante pone `SOUND_PAIN` dos
  veces de cinco; el zombi enano pone `SOUND_STRUCK SOUND_STRUCK SOUND_PAIN1` con
  el comentario «most common» / «rare» al lado. Quitar los repetidos —que es lo
  que pide el cuerpo— cambia la mezcla.
- **El volumen se distingue del sonido por el VALOR, no por el nombre.**
  `isdigit(Params[1].c_str()[0])` (scriptcmds.cpp:4705) mira el parámetro **ya
  sustituido**. La araña escribe `playrandomsound game.sound.body SPIDER_VOLUME
  SND_STRUCK1 ...` y `SPIDER_VOLUME` vale 10: mirando el nombre, el 10 se colaba
  de sonido.
- **Un `playsound` detrás de un `if` en la misma línea también cuenta.** El zombi
  enano tiene todos los suyos así, y anclando la expresión al principio de la
  línea se quedaba mudo.

Y un resultado que parece un fallo y no lo es: **35 de los 69 no declaran ningún
sonido de recibir**. Los aldeanos, el guardia, los tenderos. En el juego tampoco
suenan cuando les pegas, y aquí tampoco — antes que inventarles uno, se cuenta.

---

## 5. Matar un goblin no subía nada, y son cuatro cosas a la vez

> **Ampliado en el 22:** la cuenta de `LearnSkill` es correcta, pero el número
> que entra no era el del script. `npcatk_set_skill` corre en el
> `npc_post_spawn` de todos y su `expadj 1` **suma uno** (el «1» no lleva punto
> decimal), así que el goblin vale **26** y no 25. Y encima de eso hay un
> escalado por vida total del grupo y otro de FuzzNet. Ver
> [MUNDO_22.md](MUNDO_22.md) §3.

> «no recuerdo cuáles son los exp thresholds correctos, pero en Edana matar una
> rata hace subir de nivel el arma equipada rápido»

Sube rápido, y el motivo es mejor que un umbral. `CMSMonster::LearnSkill`
(msmonsterserver.cpp:2713-2809) entero:

```cpp
int iExpHandout = V_max(int(V_max(EnemySkillLevel, 0) * LearnMultiplier), 0);
int OldVal = SubStat.Value;
long double ExpNeeded = GetExpNeeded(OldVal);
long double ExpLeft   = SubStat.Exp - ExpNeeded;

if (iExpHandout > (int)std::abs(ExpLeft) && (int)std::abs(ExpLeft) != 0)
  iExpHandout = std::abs(ExpLeft);
else if ((int)std::abs(ExpLeft) == 0)
  iExpHandout = 1;

SubStat.Exp += iExpHandout;
...
if (ExpLeft < 0) return std::make_tuple(false, iExpRemaining);
SubStat.Value += 1;
SubStat.Exp = 0;
```

Cuatro rarezas, y las teníamos las cuatro mal:

**1. `GetExpNeeded(OldVal)`, no `OldVal + 1`.** Para pasar de 1 a 2 el motor pide
`1.248¹·4 = 4,99`. Nosotros pedíamos `1.248²·8 = 12,46` — dos veces y media, y la
diferencia crece con el nivel.

**2. El reparto se recorta a lo que falta y el sobrante SE TIRA.** `iExpHandout`
no puede pasar de lo que queda, y la función devuelve `iExpRemaining`, sí — pero
**quien la llama no lo usa**:

```cpp
pPlayer->LearnSkill(n, r, xp);               // msmonsterserver.cpp:2518
```

O sea que **matar algo enorme vale casi lo mismo que matar una rata**. Ahí está la
rata de Edana: lo que cuenta son las muertes, no los puntos.

**3. La subida se decide con el `ExpLeft` de antes de sumar.** Llegar al umbral no
sube: sube la siguiente vez. No es un redondeo, es el orden de dos líneas.

**4. Hay un mínimo de uno.** Si lo que falta redondeado a entero es cero, se
entrega 1 pase lo que pase — hasta un bicho de nivel 0 enseña en ese hueco.

Y de propina: **no se puede subir más de un punto por muerte.** Nuestro `while`
no podía ocurrir nunca, porque `SubStat.Value += 1` está fuera de todo bucle.

### El detalle que cierra la cuenta: la experiencia es un entero

```cpp
int Value;     // stats.h:26
ulong Exp;     // stats.h:29
```

`iExpHandout` es `int` y `Exp` es `ulong`. Sólo `GetExpNeeded` devuelve decimales.
Así que el recorte **trunca**: cuando hacen falta 4,99 se entregan 4, no 4,99. Y
eso es justo lo que hace que el primer punto cueste **tres** muertes y no dos.
Sin truncar salían dos, y el número medido sería otro.

Medido en el navegador, matando goblins de 25 de experiencia:

```
  muerte 1: Goblin   power 1, exp 4      <- 4 de los 4,99 que hacen falta
  muerte 2: Goblin   power 1, exp 5      <- el mínimo de 1
  muerte 3: Goblin   power 2, exp 0      <- sube
  muerte 4: Goblin   power 2, exp 12
  muerte 5: Goblin   power 2, exp 13
  muerte 6: Goblin   power 3, exp 0
```

Y el mensaje en pantalla dice ahora los **dos** números, porque son distintos y la
diferencia es la regla: «25 de experiencia (12 apuntados: el resto se pierde)».
Sin los dos, un jugador que mata algo enorme y no ve subir nada sólo puede pensar
que está roto.

### Y un tope que no era el que creíamos

```cpp
#define CHAR_LEVEL_CAP    45      // cbase.h:142
#define STATPROP_MAX_VALUE 100.0  // statdefs.h:76
```

El que corta el aprendizaje es **45**. El 100 sólo recorta el valor al final. Los
sesenta y cinco puntos de en medio no se alcanzan matando bichos — lo que, de
paso, dice que el parry 60 del 19 (el que da el 7,05 %) no sale de entrenar.

Al llegar a 45 el motor busca otra propiedad, con un bucle que llama la atención:

```cpp
for (int i = 0; i < 1; i++) {              // UNA vuelta
  iStatType = (iStatType + 1) % 3;
  CSubStat & SubStat = pStat->m_SubStats[iStatType];
  if (SubStat.Value < CHAR_LEVEL_CAP) break;
}
```

Sólo mira **la siguiente**. Con dos propiedades seguidas al tope y la tercera
libre, la tercera no se entera y la habilidad deja de subir a medias. Va portado
con el fallo y con una prueba que lo documenta.

---

## 6. Lo que no está

- **El grafo de nodos.** El motor tiene uno para rodear obstáculos; aquí, cuando
  el paseo se topa con una pared, se suelta el destino y se pide otro rumbo. Es
  visiblemente más tonto que el original pero no finge ser otra cosa, y es lo
  que explica los 10 de 53 que no se movieron en la medición.
- **`roamdelay`.** Se lee la constante del motor (2 s) pero no el comando que la
  cambia por bicho; en Gate City no la cambia nadie.
- **Los oficios de `base_civilian`**: el aldeano tiene `NO_JOB`, `NO_HAIL` y
  `NO_RUMOR` a 1 en Gate City, o sea que aquí no hay nada que portar, pero en
  otros mapas sí.
- **El sonido de `base_struck`** está puesto (la cadena excluyente
  encogerse → dolor → material) pero en Gate City sólo lo usa un script, así que
  no se ha podido medir con nada más que una prueba.
- **La experiencia repartida entre varios jugadores.** El motor lleva una tabla
  por jugador (`m_PlayerDamage[MAXPLAYERS]`) y aquí hay uno solo.

## 7. Qué se toca

| archivo | qué |
|---|---|
| `src/play/actividad.js` | **nuevo.** `LookupActivity` y la cadena de la animación de estar parado |
| `src/play/paseo.js` | **nuevo.** `SetWanderDest`, con sus dos relojes y sus dos bucles |
| `src/juego/stats.js` | `aprender` (`LearnSkill`) sustituye a `darExperiencia`; `TOPE_APRENDIZAJE` |
| `src/juego/personaje.js` | `entrenar` pasa el nivel del bicho y salta de propiedad al tope |
| `src/bsp/script.js` | `sonidosDeEvento`, `sonidos.recibir`, `eventos` en la ficha |
| `src/bsp/mdlanim.js` | `pesoActividad` (offset 44 de `mstudioseqdesc_t`) |
| `src/render/bichos.js` | la pose de reposo por actividad y con sorteo repetido; el paseo |
| `tools/bicho.mjs` | `actividades`, y `detalleSecuencias` en la ficha |
| `tools/bichos.mjs` | pide ACT_IDLE al hornear y cuenta de dónde sale cada pose |
| `src/main.js` | la IA encendida, el sonido de recibir, `probe.vivo`, `probe.ia.encendida` |
| `test/juego_mundo.test.mjs` | **nuevo**, 23 pruebas |
| `build/sondas/mundo.mjs` | **nuevo**, 28 controles |

## 8. Lo siguiente

**Los proyectiles** (`charge-throw-projectile`), que era lo declarado al cerrar el
20 y sigue siéndolo: es el único tipo de ataque del motor que falta, y el arco de
partida lleva horneado desde el 18 sin disparar. Ahora, además, tiene sentido
medirlo: hay bichos que se mueven a los que apuntar.

Y una anotada de este experimento: **la sonda que llama a la función que quiere
medir no mide el juego.** Conviene repasar si hay más controles en la batería que
pasarían con el juego apagado.
