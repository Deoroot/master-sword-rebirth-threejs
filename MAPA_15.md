# 15 · El mapa que se comporta, y lo que choca

> «completemos el mapa primero, las colisiones y luego el comportamiento de los npc»

Las dos primeras están. **601 comprobaciones en verde** y **25 de 25 controles en
el mapa**, con los 31 del ciclo, los 19 de física y los 29 del cuerpo intactos.

```
npm run gatecity     hornea el mapa, ahora con las entidades que se comportan
npm run sonda:mapa   lo prueba andando: nadar, trepar, morir, abrir puertas
```

Hasta ahora Gate City era **geometría**: todo lo que no fuera una pared no era
nada. Nueve puertas horneadas cerradas, 451 m² de agua que se atravesaban, dos
escaleras que no existían, un `trigger_hurt` que no mataba, y 76 adornos y 69
bichos por los que se andaba como si fueran humo.

---

## 1. Las puertas

Nueve `func_door_rotating`, y los cuatro números son de cada entidad del `.bsp`:
`distance 90`, `speed 100`, `wait 4`, `movesnd 9`. Ninguna de las nueve trae
`spawnflags`, y eso **también es un dato**: sin `SF_DOOR_USE_ONLY` se abren al
tocarlas, sin `SF_DOOR_ROTATE_Z` giran sobre el eje vertical, y sin
`SF_DOOR_ROTATE_BACKWARDS` hacia delante. Las nueve.

Lo que costó sacarlas del trimesh del mundo:

- **la malla se emite en coordenadas de la BISAGRA**, y no hay ninguna resta.
  `aEscena` es lineal, así que `aEscena(p + origin) − aEscena(origin) =
  aEscena(p)`: emitir la puerta sin el desplazamiento de su entidad la deja ya
  centrada en el eje sobre el que gira.
- **se quitan de la colisión estática y se les da la suya**, un cuerpo
  cinemático con su propia malla de choque. Con un control que para el horneado
  si el número de puertas emitidas no cuadra con el de entidades: quitarlas de
  la colisión sin darles la suya deja **nueve agujeros por los que se pasa
  andando**, y eso no da error.
- **no se cierran con alguien delante**, que es `CBaseDoor::DoorGoDown` mirando
  si hay bloqueo. Una puerta cinemática sin eso atraviesa al jugador y lo deja
  dentro de la pared.

Y el control que más falta hacía, porque no se ve en una captura: **las nueve,
cerradas, están a 0,0 cm de donde las horneó el compilador**. Si el par
malla-local + nodo-en-la-bisagra estuviera mal, saldrían desplazadas — y nueve
piezas de 316 siguen pareciendo un mapa correcto.

---

## 2. El agua, y el error que cometí primero

Escribí el módulo de volúmenes preguntando con la **caja envolvente**, y puse un
comentario diciendo que valía porque los brushes de Gate City son
rectangulares. **El estanque grande no lo es.** Sus caras tienen normales como
(−0,65, −0,76, 0): es un contorno irregular de 19,7 × 8,9 m.

Medido al hornear, muestreando 20 000 puntos por volumen:

| | llena de su caja |
| --- | --- |
| el pilón | 81 % |
| el estanque grande | 70 % |
| el tercero | **64 %** |

O sea que con la envolvente, **un tercio del peor volumen habría sido agua donde
no hay agua**: nadar en la orilla. Nadie lo habría achacado a esto.

Así que se pregunta con los **planos** del brush, que es lo que hace el motor.
Un brush de GoldSrc es convexo por construcción, y aquí eso **se comprueba** —
todos los vértices detrás de todos los planos— en vez de suponerse. Las dos
escaleras y el `trigger_hurt` no tienen planos porque son invisibles y el
compilador se comió sus caras: ahí manda la caja, que es lo que el motor usa de
casco.

Y el control de que esto hacía falta: si todos los volúmenes llenaran su caja,
los planos sobrarían. El horneado lo comprueba y para si eso pasa.

### Nadar es de `PM_WaterMove`, y tiene tres cosas que no se adivinan

- **se hunde solo**: sin ninguna tecla, `wishvel[2] -= 60`. El agua no te
  sostiene, y eso es lo que hace que salir valga algo. Medido en el mapa: baja
  2,2 m por segundo.
- **se nada al 80 %**: `wishspeed *= 0.8` **después** de capar a `maxspeed`.
- **el rozamiento se aplica al módulo entero**, vertical incluida, y siempre —
  en tierra sólo se roza en el suelo, donde la vertical ya vale cero.

Eso último es lo que hace que **caer al agua no mate**, y además está en
`PM_CheckFalling`, que no cobra la caída si hay `waterlevel`. Comprobado con
1 400 u/s de caída: dentro del agua la vida no baja, y la misma velocidad en
seco mata.

> Y ese control estuvo **pasando por el motivo equivocado**. La primera versión
> soltaba al jugador desde diez metros sobre el estanque, y el estanque está
> **bajo techo**: aterrizaba en el suelo de arriba, cinco metros por encima del
> agua, sin llegar a mojarse. Medía la geometría y no la regla. Lo cazó añadir
> «¿y llegó a tocar el agua?», que dio 0.

---

## 3. Las escaleras

`PM_LadderMove`, y la idea del motor no es obvia: **lo que va contra la pared se
convierte en movimiento vertical**. Así que se sube mirando hacia arriba y
también empujando de frente, y sin tocar nada no te caes — es un `MOVETYPE_FLY`
mientras dura. Saltar te despega con 270 unidades en la normal.

La normal sale del eje **más fino** de la caja, apuntando al jugador. Las dos de
Gate City miden 40×5×415 y 48×4×408 unidades: el segundo eje más fino mide ocho
veces más, así que no hay ambigüedad. En el mapa: 3,88 m trepados en 1,2 s.

---

## 4. Lo que choca y no es el mapa

Y lo primero es que **no todo choca, y lo dice el mod**:

```cpp
msmapents.cpp:311   if (pev->dmg) {
                      pev->solid = SOLID_SLIDEBOX;
                      UTIL_SetSize(pev, vMins, vMaxs);
                    }
```

Un `env_model` **sólo es sólido si su entidad trae `dmg`**, y entonces su tamaño
es el `mins`/`maxs` que escribió el mapeador, no la caja del modelo. En Gate
City eso son **76 de 91**:

| chocan | se atraviesan |
| --- | --- |
| 27 sillas, 24 espadas colgadas, 14 barriles, 6 mesas, 3 petos, 2 escudos | 4 helechos, 4 flores, 4 matas, 2 carros, la carreta, los troncos |

Los helechos y el carro **se atraviesan en el juego original también**. Ponerles
colisión habría sido «arreglar» algo que no está roto, y el jugador se habría
quedado enganchado en un helecho. Hay un control para eso: que los que el juego
deja pasar sigan pasando.

Y cajas y no mallas, porque `SOLID_SLIDEBOX` **es** una caja. Usar el trimesh
sería más preciso que el original, más caro, y cambiaría cómo se anda entre las
sillas de la taberna.

### Los bichos, y la caja vacía

Los 69 llevan un cilindro cinemático que sigue al que pasea. Y aquí saltó otra
vez un viejo conocido: **de 18 modelos, 12 traen la caja de la cabecera a
ceros** — el compilador no la escribió. Pedirle un tamaño a esa caja da un
cilindro de radio cero, que Rapier acepta y con el que no choca nada: **54 de
los 69 bichos se quedaron sin colisión y sin un solo error**. Lo cazó el control
de la sonda, que pedía más de cincuenta. Ahora la caja se **mide** sobre la
malla en reposo al extraer.

---

## 5. Los tres controles que pasaban sin comprobar nada

Vale la pena juntarlos, porque los tres tenían la misma forma:

1. **«los volúmenes son cajas»** — medía superficie contra envolvente, y el agua
   da 0,73 porque le FALTAN caras. Además ningún `func_wall` superaba el umbral,
   o sea que el juez no sabía decir que no. Su propio control de control lo
   delató.
2. **«caer al agua no hace daño»** — verde, y el jugador nunca tocaba el agua.
3. **«el barril no se atraviesa»** — pedía «no ha pasado del centro», que lo
   cumple también un jugador que no se mueve. Y era exactamente lo que pasaba:
   el barril elegido tenía **otro barril** a un metro por ese lado. El arreglo no
   fue probar hasta que saliera verde: se elige el lado despejado **mirando la
   lista de cajas sólidas**.

---

## 6. Lo que sigue

**El comportamiento de los NPC**, que es lo que pediste después. Lo que hay hoy
son treinta líneas que andan y giran al chocar, y su propio comentario dice que
no es la IA de Master Sword: ésa vive en 723 scripts. El subconjunto para que un
goblin persiga y pegue está en `base_npc_attack.script` (909 líneas) y
`monsters/goblin.script` (113), más `UTIL_MoveToOrigin` con su `m_StepSize = 18`
en lugar del paseo.

Y lo que queda del mapa, más pequeño de lo que parecía:

- los **5 `trigger_once`** disparan generadores de monstruos (`spawners1..10`,
  `mm_spiders`, `mm_zombies`) — o sea que son del paso de los NPC, no de éste.
  Ya salen horneados con su destino escrito.
- las **2 `msarea_transition`** llevan a `mscave` y a `underpath`, que son otros
  mapas y no están.
- los **11 `msarea_music`** necesitan sonido, que no hay.
- el **parpadeo de los estilos 1 y 6**, medido desde el 06 y todavía pendiente.
