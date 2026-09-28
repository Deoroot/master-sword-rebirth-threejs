# 17 · Los NPC, y quién te ataca de verdad

> «completemos el mapa primero, las coliciones y luego el comportamiento de los npc»

El tercero. **664 comprobaciones en verde y 15 de 15 controles de IA**, con los
30 del mapa, 20 del sonido, 31 del ciclo, 19 de física y 29 del cuerpo
intactos.

```
npm run gatecity:bichos   hornea el censo, ahora con la ficha de combate
npm run sonda:ia          15 controles: quién es hostil, te ve, te persigue y te pega
```

Lo que había eran treinta líneas que andaban y giraban al chocar, y su propio
comentario decía que no era la IA de Master Sword. Ahora los bichos corren
`npcatk_hunt`, que es el bucle de decisión del mod.

---

## 1. La pregunta que no había hecho nadie: ¿quién te ataca?

La respuesta parecía obvia —los que parecen monstruos— y no lo es. Está en
`scripts/races.script`, 178 líneas de tabla donde cada raza declara sus
`enemies`, sus `allies` y de quién está `wary`. Y hace falta un dato más que no
está en ningún script: **la raza del jugador**, que el motor devuelve a fuego.

```cpp
script.cpp:1546   else if (Prop == "race") return "human";
```

Con eso, Gate City se parte sola: **33 hostiles de 69.**

| | |
| --- | --- |
| te atacan | 22 zombis, 8 goblins, 3 arañas |
| te ignoran | 27 humanos y 3 `beloved` — son ALIADOS suyos |
| sólo si les atacas | 4 ratas y 1 guardia, que RECELAN |

### El orden de las tres listas, que es donde está la trampa

`CRaceManager::Relationship` (races.cpp:45) no mira enemigos primero:

1. **recelo**, y basta con que uno de los dos recele del otro
2. **aliado**
3. **enemigo**

Y eso cambia el juego entero, porque la raza `human` declara `enemies all;hated`
y `allies human;beloved`. Mirando los enemigos primero, «all» incluye al
jugador y **el pueblo entero te ataca**. Por eso `races.script` lleva escrito al
lado «this race can't attack players».

### Y el recelo, que es negativo y no cuenta

`RELATIONSHIP_WA` vale **−2**. Un `relación < 0` lo haría hostil, y entonces las
cuatro ratas y el guardia de la puerta te atacarían nada más verte. El motor no
compara: usa un `switch` con cuatro casos concretos (`npcscript.cpp:1806`) y el
recelo no está entre ellos. «Sólo ataca si le atacas» es literal.

### Una variable que leí y no sirve

Empecé sacando la hostilidad de `CAN_HUNT`, que el goblin pone a 1. **Es del
`base_npc_attack.script` viejo.** El goblin incluye `base_monster_new` →
`base_npc_attack_new`, y ahí la condición de cazar es `!NPC_CUSTOM_HUNT &&
!SUSPEND_AI && !IS_FLEEING`; `CAN_HUNT` no aparece. El zombi no la declara, así
que con ese criterio **el zombi habría salido pacífico** — y eso sí se nota.

Se sigue leyendo, con su nombre cambiado a `canHuntViejo`, y hay una prueba que
dice justo eso: que el zombi no la trae y ataca igual.

---

## 2. El bucle, y las cinco cosas que no se adivinan

`npcatk_hunt` son 160 líneas. Portadas en `src/play/ia.js`, que **no conoce
Three ni Rapier**: devuelve una intención y quien la ejecuta es
`src/render/bichos.js`. Por eso se prueba en `node --test`.

1. **Hay dos relojes y se diferencian en veinte veces**: 2 s parado, 0,1 s en
   combate. Con sólo el de combate, 69 bichos piensan 690 veces por segundo.
   Y el primer ciclo de combate **todavía tarda 2 s**, porque el motor programa
   el siguiente pensamiento en la primera línea del evento, con el reloj que
   tenía al entrar.
2. **Tres alcances y no uno**: `MOVE_RANGE` 90 (deja de acercarse),
   `ATTACK_RANGE` 130 (blande) y `ATTACK_HITRANGE` 130 (hace daño).
   Colapsarlos deja al bicho pegado al jugador o pegando desde lejos.
3. **Al perderte de vista no se queda quieto**: va a la última posición
   conocida y, al llegar, se inventa un punto a 128 unidades de donde estás de
   verdad, en un rumbo al azar.
4. **Si ve a otro enemigo más cerca, cambia** — pero sólo si es un jugador.
5. **La animación de perseguir no es la de pasear.** El goblin declara
   `ANIM_RUN run` aparte de `setmoveanim walk`, y las velocidades salen del
   `linearmovement` de cada secuencia: **0,92 m/s andando y 2,33 corriendo.**
   Usar la de pasear da un monstruo que te sigue dando un paseo.

Y el daño es del script, no elegido: `ATTACK_DAMAGE $randf(6,9)` con
`ATTACK_HITCHANCE 60%`. Medido en el mapa: 24 golpes en 12 s de tres goblins, y
3 × 12 × 0,6 = 21,6.

---

## 3. Dos rayos que llevaban rotos desde el 15

Éste es el hallazgo de la tanda, y es una regresión que metí yo y que **no dio
ni un error**.

En el 15 les dimos un cilindro de colisión a los 69 bichos. Los dos rayos con
los que un bicho se orienta —«¿hay hueco delante?» y «¿dónde está el suelo?»—
**arrancan dentro de ese cilindro**, y en Rapier un rayo `solid: true` que nace
dentro de una forma choca a distancia cero.

- **«¿hay hueco delante?»** contestaba que no **siempre**.
- **«¿dónde está el suelo?»** devolvía exactamente el punto de salida, un metro
  por encima de los pies: **39 unidades**, justo lo que el escalón de 18 no
  deja subir. Así que el bicho daba el paso y lo deshacía, cada fotograma.

El síntoma era un goblin que te veía, se giraba, ponía la animación de correr
y **se quedaba clavado**. En una captura eso se ve igual que un monstruo
esperándote.

Lo mismo le pasaba al paseo desde el 15 sin que se notara, porque un bicho
quieto entre otros sesenta y ocho no llama la atención.

### Cómo se encontró, que es la parte reutilizable

A base de estrechar, y con un rodeo que también enseña: puse `i.frenado` con el
motivo de no haberse movido, y salía `null`. Lo leí como «se movió» durante dos
intentos, y lo que significaba era **«esto ni se ha llamado»** — porque el
camino de éxito no escribía nada. Un diagnóstico con un valor por omisión
ambiguo es otro control que no comprueba nada. Ahora hay seis motivos y uno de
ellos es `avanza`.

Y antes de eso, el mismo error de forma en la línea de visión: escribí «el rayo
tiene que llegar hasta el final», y el rayo termina en el OJO del jugador
mientras que por el camino se topa con **su cápsula** medio metro antes. La
condición sólo se cumplía si el jugador era transparente. Lo que hay que
preguntar no es a qué distancia choca: es **contra qué**.

---

## 4. Y un fallo de reparto que tumbó la página entera

`src/play/ia.js` importó dos constantes de `src/bsp/script.js`. Ése lee
ficheros, así que **Vite externalizó `node:fs` y la página dejó de cargar** —
con un error en consola que aparece antes de que exista `window.probe`, o sea
que la sonda se queda esperando cuatro minutos y lo único que dice es
«timeout».

La lógica pura de razas vive ahora en `src/bsp/razas.js`, que no toca el disco.
En `script.js` queda sólo leer el fichero.

---

## 5. Lo que NO está

Conviene decirlo, porque son 1 200 líneas de las 1 390 del script:

- **Rodear obstáculos.** El motor tiene un grafo de nodos y quince intentos de
  rumbo al azar (`msmonsterserver.cpp:1081`). Aquí, si se choca, se para.
- **Huir** con poca vida, **encogerse** al recibir un golpe, **avisar a los
  aliados**, cambiar de objetivo por venganza (`RETALIATE_CHANCE 75%`).
- **Morir.** Los bichos tienen `hp` y `ANIM_DEATH` leídos, y nada que les
  quite vida: el jugador todavía no pega.
- El **evento 600** de la secuencia de ataque, que es de donde el motor saca el
  instante exacto del impacto. Mientras tanto se usa su propio camino de
  repuesto: `HACK_ATTACK_DELAY 1.0`.

---

## 6. Lo que sigue

- **Que el jugador pegue**, que es la otra mitad de esto y lo que hace que
  `hp`, `ANIM_DEATH` y `NPC_GIVE_EXP` signifiquen algo.
- Los **5 `trigger_once`** con sus generadores de monstruos, que ya salen
  horneados con su destino escrito (`spawners1..10`, `mm_spiders`,
  `mm_zombies`).
- **Los sonidos del jugador** que faltan: correr, saltar, y los de combate.
  Once muestras cortas, y ya está el sistema para ponerlas.
