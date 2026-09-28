# La física de Master Sword — experimento 12

> El paso 2 de [PROYECTO_10.md](PROYECTO_10.md) §5.
>
> **549 comprobaciones en verde** (499 y 50 nuevas) y **19 de 19 controles en
> pantalla**. Más las teclas, que eran dependencia y no adorno.

```
npm test                       549 comprobaciones en Node plano
node build/sondas/fisica.mjs   cronometra al jugador en el mapa
npm run dev                    ?map=gatecity  ·  G = opciones  ·  P = la hoja
```

---

## Lo primero: andábamos un 23 % de más

Y no por una constante mal elegida, sino por una **escala** mal elegida.

`src/play/player.js` estaba escrito para Quake, a **32 unidades por metro**.
Este proyecto midió hace tres experimentos que GoldSrc son **39,37**. En
Corinth, el jharro y el pueblo da igual —son mundos nuestros a esa escala—
pero aplicado a Gate City hacía al jugador un 23 % más grande y un 23 % más
rápido de lo que el mapa espera. Y encima con tres cifras equivocadas de por
sí:

| | teníamos | Master Sword | |
| --- | --- | --- | --- |
| alto de la caja | 56 u = 1,75 m | **72 u** = 1,83 m | `VEC_HULL_MIN/MAX` |
| altura del ojo | 56 u = 1,75 m | **64 u** = 1,63 m | 36 del centro + 28 de `VEC_VIEW` |
| escalón | 16 u = 0,50 m | **18 u** = 0,46 m | `sv_stepsize "18"` |
| velocidad | 160 u @ 32 = **5,00 m/s** | 160 u @ 39,37 = **4,06 m/s** | |
| salto | 270 u @ 32 = 8,39 m/s | **268,33** u @ 39,37 = 6,82 m/s | `sqrt(2·800·45)` |

**Eso no se ve como un fallo. Se ve como un mapa un poco pequeño.** Es
exactamente la familia de la gamma y del `channel = 1`: un valor plausible que
nadie contrasta.

El escalón merece su línea: con 16 en vez de 18, un jugador se atasca en cada
peldaño de 17 unidades. No da error, sólo deja de subir.

---

## Lo que MSR hace y nosotros no hacíamos

### Andar hacia atrás va a la MITAD

`CBasePlayer::CheckSpeed()`, `client/ms/clplayer.cpp:297`:

```
cl_forwardspeed = fSpeed
cl_backspeed    = fSpeed * 0.5
cl_sidespeed    = fSpeed * 0.8
```

Teníamos los tres iguales. Con los tres iguales, retroceder de un monstruo es
gratis, y en Master Sword no lo es. **Es lo que más se nota de todo esto.**

Cronometrado en el templo: **162,0 u/s adelante, 82,2 atrás, 129,7 de lado**.
Razones 0,507 y 0,801.

### La velocidad sale del PERSONAJE

`WalkSpeed()`, `server/player/playershared.cpp:1006`:

```
StatEnhancement = (min(Dex, 75) / 75) * 100
SpeedDetriment  = clamp((max(Weight - Volume/2, 0) / (Volume/2)) * 70, 0, 70)
fSpeed          = 160 + StatEnhancement - SpeedDetriment
```

Dos cosas de diseño escondidas ahí:

- **La agilidad satura a 75.** De 0 a 75 se gana un 62 % de velocidad; del 75
  al tope de 300, **nada**. Subir agilidad para correr más deja de servir muy
  pronto.
- **El peso no estorba hasta la MITAD de lo que puedes cargar**, y a partir de
  ahí quita hasta 70 sobre 160. A tope de mochila y sin agilidad se anda a
  **90 u/s = 2,3 m/s**, menos que una persona.

Y encima de eso, `RunSpeed()` multiplica por `1 + aguante/aguanteMax` —o sea
**hasta el doble, en rampa**, no un interruptor— y `ParseSpeed()` quita 60 si
tienes **una** flecha clavada (una, no por flecha: es un `> 0`) y parte por la
mitad si estás atacando.

### El aguante

Correr cuesta **0,6/s**; se recupera a **0,6 + Fuerza/10** y sólo parado. Con
0 de Fuerza recuperar cuesta exactamente lo mismo que gastar, así que se corre
la mitad del tiempo; con 30, seis veces más rápido. Ése es el papel de la
Fuerza en la carrera y no está escrito en ninguna parte del juego.

Saltar cuesta `int JumpEnergy = min(Weight/Volume, 1) * 4` — y es un `int`,
así que **con la mochila a menos de un cuarto, saltar es gratis**. Otra
decisión de diseño escondida en una conversión de tipo, como el impuesto de
muerte del experimento anterior.

### Y las cinco condiciones para correr

No basta con pulsar Mayús: hace falta **ir hacia delante** (correr de lado o
hacia atrás no existe), no estar agachado, no estar atacando, tener aguante —
y **no haber frenado de golpe**: `velocidad < anterior − 50` corta la carrera.
Eso es chocar con algo, y es lo que impide correr contra una pared para
mantener la carrera mientras se recupera el aguante.

---

## Dónde está la frontera con Rapier, dicha en voz alta

**La velocidad es del motor; el choque es de Rapier.**

`PM_FlyMove` y el controlador de personaje de Rapier resuelven el mismo
problema —desplazar y deslizar contra la geometría, con escalón— y
reimplementarlo sería reescribir un motor de colisión que ya tenemos. La
velocidad no: ahí Rapier no opina, y ahí estaba el fallo.

Así que `src/play/movimiento.js` lleva `PM_Friction`, `PM_Accelerate`,
`PM_AirAccelerate`, `PM_Jump` y el modelo de velocidad de MSR, **en unidades y
segundos**, sin DOM y sin Three.js, para que el día que haya servidor corra
igual allí. Y `src/play/player.js` sólo convierte y empuja.

### La integración de la gravedad, que parece un detalle y no lo es

El motor parte la gravedad en dos mitades alrededor del movimiento:

```
PM_AddCorrectGravity()     // «so they'll be in the correct position during movement»
...acelerar y mover...
PM_FixupGravityVelocity()  // «get the correct velocity for the end of the dt»
```

Eso es integración de punto medio, y es **exacta** para aceleración constante.
Con la gravedad entera antes de mover —Euler a secas, que es lo primero que
uno escribe— el salto sube **42,6 en vez de 45 a 60 Hz, y 39 a 20 Hz**: el
jugador salta más alto en un equipo mejor. No da ningún error.

Está fijado en una prueba que salta a 20, 60, 144 y 240 Hz y exige que las
cuatro alturas coincidan, con su control negativo: **con Euler, entre 20 y 240
Hz hay 2,5 unidades de diferencia**.

Medido en pantalla: el salto sube **44,6 unidades**.

---

## Las teclas, y por qué van aquí y no con el menú

Porque son **dependencia del movimiento**, no adorno del menú. El modelo de
MSR tiene más botones que WASD, y ya había dos `"KeyW"` sueltos en `main.js` —
uno de los cuales costó tres controles en rojo en el experimento anterior.

**Los valores por defecto salen de `../MSC/assets/msr/config.cfg`**, la
configuración de la instalación que hay al lado. Misma regla que trajo
`gl_overbright "0"`: *cuando exista el original, leerlo.* Tres que no habría
adivinado:

```
bind "p" "playerinfo"    ← la hoja de personaje es la P, no la C
bind "q" "use"           ← usar de golpe, distinto de la E que es +use mantenido
bind "h" "switchhand"    ← cambiar de mano, y también en el botón central
```

`src/juego/teclas.js` marca cuáles son **botones de juego** (`pev->button`) y
cuáles de interfaz. La diferencia no es cosmética: estando muerto, pulsar un
botón de juego es la orden de levantarse, y meter ahí los de interfaz hace que
cerrar una ventana te resucite — que es literalmente lo que pasó.

**Lo que NO está del menú: la lista de servidores.** No hay nada que listar
hasta el paso 4. Una pantalla vacía que promete algo que no existe es peor que
no tenerla.

---

## Lo que se ha escrito

- **[src/play/movimiento.js](src/play/movimiento.js)** — el modelo de
  velocidad, en unidades, sin DOM y sin Three.
- **[src/play/player.js](src/play/player.js)** — `perfilMsr(unidadesPorMetro)`
  y `pasoMsr()`. El perfil viejo sigue ahí, con un aviso encima de que **no es
  el de GoldSrc y no es una elección**; Corinth, el jharro y el pueblo lo
  siguen usando y no se han tocado.
- **[src/juego/teclas.js](src/juego/teclas.js)** — las acciones, sus valores
  por defecto del `config.cfg`, y qué cuenta como `pev->button`.
- **[src/juego/interfaz.js](src/juego/interfaz.js)** — la pantalla de
  opciones, con reasignación y sin teclas duplicadas.
- **[test/juego_movimiento.test.mjs](test/juego_movimiento.test.mjs)** — 50
  comprobaciones.
- **[build/sondas/fisica.mjs](build/sondas/fisica.mjs)** — 19 controles
  cronometrados en el mapa.

---

## LOS FALLOS DE ESTA RONDA

### 1. Un comentario mío que mentía

Escribí en `movimiento.js` que aplicaba la gravedad en dos mitades **como el
motor**, y debajo la apliqué entera. El comentario incluso explicaba por qué
las dos mitades son mejores. La prueba del salto lo cazó: 42,58 en vez de 45.

Es exactamente lo que le acabo de encontrar a MSR —`//Lose all items` encima de
`m_fDropAllItems = false`— cometido por mí en el mismo archivo donde lo estaba
señalando.

### 2. Un control que no controlaba nada, dos veces

Escribí «con los dos topes iguales se pierde el control en el aire» y lo medí
en 200 pasos. **Dio el mismo número con las dos versiones.** Las dos convergen
al mismo punto fijo —`dot(v, dir) = 30`— y lo único que cambia es lo que se
tarda en llegar. Medido en 3,3 s, una asimetría real «no existe».

Lo arreglé a 40 pasos (un salto dura 0,67 s) y **seguía empatando**, porque con
dirección fija las dos saturan en menos de eso.

Lo que la asimetría compra, medido de verdad: **dos pasos contra seis** hasta
tener control en el aire. Y **he corregido el comentario del código**, que
prometía «es lo que permite ganar velocidad girando» — será verdad, pero mis
pruebas no lo demuestran y no voy a dejarlo escrito como si sí.

### 3. La sonda midió contra una pared

«Hacia atrás va a la mitad» dio **0,00 m/s** y «de lado» 0,55. El rumbo medido
del punto de aparición garantiza hueco **hacia delante**; atrás y a los lados
hay pared a metro y medio. La sonda acusaba a un código correcto. Se arregla
girando al jugador según la tecla que se cronometra.

Es la tercera vez en el proyecto que una sonda bien escrita mide la cosa
equivocada.

---

## Lo que NO está, y se dice

- **Agacharse no encoge la cápsula.** El perfil trae `heightDucked` y
  `eyeDucked` y no se usan todavía: cambiar el colisionador en marcha con
  Rapier pide cuidado con quedarse dentro del techo.
- **Nada te pega.** El daño de caída SÍ está enchufado —te mata si te tiras de
  20 m— pero un goblin sigue sin tocarte. Paso 3.
- **El `edgefriction` no se activa nunca**: el modelo lo lleva y nadie le dice
  si está al borde. Falta el trazado de 16 unidades adelante y 34 abajo.
- **El aguante no se guarda**, y es correcto: en el juego lo lleva el cliente
  fotograma a fotograma y el servidor lo sincroniza.
- **No hay lista de servidores.** Paso 4.
