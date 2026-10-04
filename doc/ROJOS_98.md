# Cuatro rojos sin dueño — experimento 98 (agente M)

El 97 dejó cuatro rojos apuntados y sin atribuir: `edana82` 16/18 en el
`env_sound`, `armas96` 32/33 dos veces, `armas97` 21/22 una vez en tanda y
`guardias94` 20/23 una vez en tanda. Tres de los cuatro tienen causa; el cuarto
no, y se dice qué se descartó.

Lo que pesa sobre todas las medidas de hoy: **seis sesiones en el mismo árbol y
la CPU al 100 %** (`Win32_Processor.LoadPercentage`, leído a media tarde con
diecinueve Chrome sin cabeza abiertos). Por eso la carga se trató como
hipótesis y se midió con una carga sintética propia (doce hilos girando,
`m98_carga.mjs` en el borrador de la sesión), no se supuso.

---

## 1. `edana82`: los dos controles del `env_sound` — **era la sonda, desde el 82**

**No es de ningún cambio ni de ningún horneado: esos dos controles no han
estado verdes nunca.** `doc/REVERBERACION_82.md` ya los apuntaba rojos el día
en que nacieron, con una sospecha escrita como sospecha: que el rayo arrancaba
en el origen del `env_sound` enterrado en un brush. Era falsa.

### Lo medido

Fuera del navegador, con la malla del mundo de `build/edana/malla.bin`, las
mismas mallas opacas que monta `escenaDelMapa` y el mismo rayo que
`trazaDeSala` (main.js), de la fuente al ojo:

| punto de la sonda | ojo (u) | fuente | lo que toca el rayo |
| --- | --- | --- | --- |
| pies en −60 | 4 | la 1, tipo 11, en −112 | `T_stone_B4`, normal **hacia abajo**, a **80 u de 116** |
| pies en 230 | 294 | la 0, tipo 13, en 178 | `T_stone_B4`, normal hacia abajo, a **78 u de 116** |

Y rayos de doble cara desde cada fuente, para medir la sala:

| fuente | suelo | techo |
| --- | --- | --- |
| 0 (tipo 13) | −114 | +78 |
| 1 (tipo 11) | −80 | +80 |

O sea: la sonda ponía los pies **52 unidades por encima del origen** y el ojo va
**64 más arriba** —116 sobre el origen—, en dos salas cuyo techo está a +80 y
+78. **La cabeza del jugador estaba 36 y 38 unidades dentro del techo**, en el
piso de arriba. La física lo delataba y nadie lo leyó: en el primer punto los
pies subían 0,7 mm por fotograma, Rapier empujando el cuerpo fuera del techo.

Desde ahí todo lo demás es el motor portado bien: `FEnvSoundInRange`
(sound.cpp:896-922) descarta las once por «pared en medio», nadie gana, y el
`room_type` se queda en el 13 del sitio de nacer, porque salirse de todas **no
apaga la reverberación** (las dos `NOTE` de sound.cpp:975-980). El `13 (dueño 2)`
en los dos puntos era la respuesta correcta a una pregunta mal hecha.

### Lo que se entendió mal, y por qué la pared decía dos cosas

El 82 midió también `loQueSeVe` **desde el ojo hacia la fuente** y no encontró
nada en medio, y eso empujó la sospecha hacia «el rayo arranca en sólido». La
explicación es que **la misma cara se ve desde un lado y no desde el otro**: el
techo tiene la normal hacia abajo, el rayo de la fuente sube y la toca de cara,
y el rayo del ojo —que está encima, dentro de la losa— baja y la cruza por
detrás, que el `Raycaster` de Three no cuenta con un material de una cara. Un
rayo y su contrario no son la misma medida cuando lo que hay en medio es una
superficie y no un sólido. *Cuando dos trazas entre los mismos dos puntos no
están de acuerdo, mira hacia dónde apunta la cara antes de sospechar de quién
la lanza.*

### El arreglo, en el control

Los pies van al **suelo** de cada sala (−191 y 65, una unidad sobre lo medido),
y el detalle de los dos controles dice ahora si la fuente esperada alcanza al
jugador, que es la precondición: sin ella, «no dice 11» no separa el reparto de
un jugador mal plantado.

- `edana82`: **18 de 18**: `11 (dueño 1; la 1 le alcanza a 15 u)` y
  `13 (dueño 0; la 0 le alcanza a 49 u)`.
- **Rotura deliberada** (con `grep` de que estaba puesta): la rama de contienda
  de `unTic` (src/play/reverberacion.js) a `false`. **16 de 18**, los dos
  controles rojos con `0 (dueño null; la 1 le alcanza a 15 u)`: la fuente
  alcanza y el reparto no la elige, que es exactamente lo que deben ver.
- Lo que la rotura enseñó de paso: **«el número llega al audio» siguió verde con
  el reparto roto**, porque compara el audio con la regla y los dos valen 0. Es
  un control de la costura y no del reparto, y eso está bien, pero su verde no
  dice nada del reparto. No se ha tocado.

Al lado, en `REVERBERACION_82.md`, va la corrección fechada (§7 de CLAUDE.md).

---

## 2. `armas96`: dos causas distintas con la misma cara

### 2a. Once rojos de golpe: la página se recargaba

Las cinco primeras pasadas de hoy dieron **11 de 26** dos veces, y las otras
tres se cayeron. `navegaciones`, que la sonda ya imprimía, enseñaba **dos, tres
y once cargas** de la página donde tiene que haber una. Esta sonda no cortaba
el HMR, ningún módulo del juego lo acepta, y con seis sesiones guardando en
`src/` cada guardado es una **recarga entera**: la sonda espera 40 s al cartel
del mapa, en ese rato la página vuelve al menú, y el «arma» que mide ya no
existe (`ventana ninguna`).

Lo arregló para todas, mientras esto se medía, `sondas/vite.sondas.mjs` de la
otra sesión (`hmr: false`, sin vigilar archivos). Aquí se añade lo que faltaba
para que no vuelva a parecer otra cosa: **un control nuevo que sólo aparece si
la página se recargó**, «la página no se recargó a media pasada», con el número
de cargas. Un fallo de infraestructura que se lee como once fallos de armas es
el peor sitio donde esconderse.

### 2b. «5 % fuera de su ventana»: la ventana se tomaba antes de las fotos

El control dice: al esconder el arma, fuera de su ventana —ensanchada un 10 %—
cambia menos del 1 %. La ventana es la unión de ocho rectángulos en 1,2 s
**antes** de las tres fotos; las fotos caen después, en tiempo real, y con la
máquina cargada cada `screenshot` tarda lo que tarde. La Novablade **respira**
(su `idle` mueve el 40-50 % de su ventana entre la primera foto y la tercera),
así que si en ese rato el filo pasa por una fase que las ocho tomas no vieron,
sale de la ventana y se cuenta «fuera».

Medido, rodeando cada foto con dos lecturas del rectángulo y uniendo:

| pasada | cuánto ensancharon las fotos la ventana | «fuera» con la ventana vieja | con la nueva |
| --- | --- | --- | --- |
| 9 | 7 px | 0,0 % | 0,0 % |
| 10 | 64 px | 0,0 % | 0,0 % |
| **11** | **111 px** | **1,1 % — rojo con el control viejo** | **0,0 %** |
| 12 (con carga sintética) | 7 px | 0,0 % | 0,0 % |

La pasada 11 es el fallo del 97 en pequeño: el filo salió 111 píxeles de donde
las ocho tomas lo habían visto, y el control viejo habría dicho «lo que cambia
no es ella». El listón **no se ha tocado** (sigue < 1 % y < 1/10 de dentro): se
ha cambiado dónde se mide, que es **donde estuvo el arma mientras se la
fotografiaba**. La sonda imprime en cada pasada los píxeles de exceso y el
«fuera» que habría dado la ventana vieja, para que la medida siga a la vista.

Resultados con el arreglo: **33 de 33** en las pasadas 6 a 12 (siete), una de
ellas con carga sintética; la 13, con carga, se cayó antes de empezar por un
`goto` agotado a 30 s, que es la carga y no la sonda.

No se ha hecho la rotura deliberada de este cambio: el control nuevo es el
mismo que el viejo sobre una ventana más justa, y lo que podría ponerse en
rojo —algo que cambie fuera de ella— no se ha fabricado a propósito. Queda
dicho.

---

## 3. `armas97`: un rojo reproducido, y no se sabe si es el del 97

El 97 no guardó qué control falló. Hoy, en siete pasadas:

| pasada | resultado | qué |
| --- | --- | --- |
| 1 | 8 de 22, 600 s | «"Start" no recargó ni metió en la partida»: la recarga del §2a, sin corte de HMR |
| **2** | **21 de 22** | **«CONTROL POSITIVO: la flecha de arco a 8 m acierta VOLANDO (vuelo > 0,1 s)» — 0,083 s, acertó** |
| 3 | 22 de 22 | |
| 4 | 13 de 22 | la parte B, `waitForFunction` agotado a 120 s con la CPU al 100 % (además del control de abajo con el primer arreglo, que estaba mal) |
| 6, 7 | 22 de 22 | con el arreglo bueno |

### Lo que pasaba en la pasada 2

La flecha **dio en carne a 75 unidades** —dos metros— tirando a un bicho a
**8 m** (315 u): voló 0,083 s y el control, que pide más de 0,1 s para
distinguirla de la saeta instantánea de la ballesta, salió rojo. No era el arco:
era **otro bicho en medio**. `r.acerto` dice que la flecha dio en carne, no en
cuál; y entre dos `evaluate` el mundo corre en tiempo real, así que lo que se
cruza depende de cuánto tarde la sonda entre llamadas — o sea de la carga. En
tanda, rojo; suelta, verde. Es el 69 y el 82: *comprueba que el que mide está a
la distancia que cree*.

### El arreglo, y el primero, que estaba mal

El primero pedía que **bajara la vida de la víctima `n`**, para asegurar que le
dio a ésa. En la pasada 4 **descartó 12 de 12 aciertos**, varios contra un bicho
que se llamaba como la víctima, y el control salió rojo por no encontrar
ninguno. La vida no es la marca de «le dio a éste»: no se ha medido si es por
esquivas, por otro bicho del mismo nombre o por otra cosa, y por eso no se usa.

El bueno pide que la flecha haya volado **al menos la mitad de `d`** (157 u a
8 m). Eso es lo que el control afirma —que una flecha a esa distancia vuela— y
sigue discriminando: una flecha instantánea tendría vuelo 0 con cualquier
recorrido. Los tiros descartados se imprimen: en las pasadas 6 y 7, tres y dos,
con recorridos de **25 a 139 u**.

### Lo que queda abierto aquí

- **Aun aceptados, los aciertos no bajan la vida de la víctima `n`**
  (150 → 150 en un enano zombi, 30 → 30 en una araña) y vuelan 177-217 u, no
  las ~300 que hay hasta ella. Lo más probable es que den a OTRO bicho del
  grupo, que en Gate City van juntos; no está medido, porque `probe.arco.tirar`
  devuelve el **nombre** de lo que tocó y no la instancia. El control dice
  «vuela», y eso lo mide; «a 8 m» es aproximado y se dice.
- Se vio **otra sesión corriendo `sonda:armas97` a la vez que yo**. Con el
  mismo puerto, el `liberarPuerto` de la segunda mata el `vite` de la primera:
  es otra manera de fabricar rojos «en tanda» que no son de nadie.

---

## 4. `guardias94`: **sin atribuir**

Cinco pasadas, **23 de 23 las cinco**: tres sueltas (22-48 s) y dos con carga
sintética de doce hilos (37-57 s).

Descartado:

- **El HMR**: esta sonda ya lo cortaba en el navegador (el 93).
- **La carga de CPU**, que es lo que la diferencia «en tanda» de «sola»: dos
  pasadas cargadas, verdes, y los números del medio no se mueven (el guardia
  anda 2,6-4,5 m en 3 s contra un listón de 0,5; el aldeano huye 1,73 m las
  cinco veces contra un listón de 1). Lo que miden pasa dentro de un
  `evaluate`, con `reaccion.avanzar`, y no en tiempo real.
- **El sorteo del daño** en «el segundo golpe entra, con la vida ya por debajo
  de 25»: el aldeano nace con 25 y cada espadazo le quita 1-1,4, así que el
  primero ya le deja por debajo siempre.

No descartado: **otra sesión con la misma sonda a la vez** (el `liberarPuerto`
del §3: si mata el `vite` con la página ya cargada, lo que se pida después —un
modelo perezoso, un sonido— falla y puede dar un `pageerror`), y un sorteo de
probabilidad baja que cinco pasadas no ven. Con tres rojos de 23 y sin saber
cuáles, no hay más que decir sin inventar. *Una sonda que falla una vez en una
tanda que nadie guardó no se puede diagnosticar: lo que hace falta es que la
tanda guarde la salida entera de cada rojo.*

---

## Archivos tocados

- `sondas/edana82.mjs`: los pies al suelo de cada sala y el detalle con la
  precondición.
- `sondas/armas96.mjs`: la ventana unida a la de cada foto, el exceso impreso, y
  el control de «la página no se recargó».
- `sondas/armas97.mjs`: el acierto del control positivo pide recorrido ≥ d/2, y
  se imprimen los descartados, el recorrido y la vida de la víctima.
- `doc/REVERBERACION_82.md`: la corrección al lado de la sospecha.

`npm test`: 2 905 de 2 907, 0 rojas (1 saltada, 1 `todo`).
