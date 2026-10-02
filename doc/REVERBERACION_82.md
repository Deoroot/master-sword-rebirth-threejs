# Todo sonaba «como debajo del agua» — experimento 82, segunda vuelta

El usuario, jugando: *«necesito que verifiques el sonido del juego. ahora todo se
escucha como un eco o si estuviera bajo el agua.»*

La palabra que importa es **«ahora»**: el DSP de GoldSrc —los `env_sound` y su
`room_type`— se portó en la primera vuelta de este mismo experimento, sin
commitear. O sea que el fallo estaba en lo que acababa de entrar, y no había que
leer el motor de cero: había que medir lo que ya estaba escrito.

> La primera vuelta —el reparto de `src/play/reverberacion.js`, los 29 presets,
> la costura de `src/main.js`— **la escribió otra sesión**. Este documento es la
> vuelta de verificación: lo que estaba mal, cómo se vio, y las dos veces que el
> instrumento de verlo estuvo mal antes que el código.

---

## Lo que el jugador oía, y por qué sólo en Edana

Gate City tiene **cero** `env_sound` y Edana **once**. Con cero, la lista de
fuentes está vacía, el bucle del fotograma no entra y el bus de reverberación no
se monta siquiera: en Gate City no había nada que oír mal. El usuario estaba en
Edana.

Y los once de Edana son de tipos **11 y 13** —más dos sin declarar, que son 0—,
y los dos pertenecen a la **misma familia del motor**: «brite», los presets 11,
12 y 13. Eso resultó ser la mitad del diagnóstico, porque *brite* quiere decir
brillante y esa familia se define por **no** llevar paso bajo.

Eran tres fallos, los tres en `src/play/audio.js`, y los tres apuntando al mismo
sitio:

| qué | estaba | el motor dice | cita |
| --- | --- | --- | --- |
| envío de la reverberación | ganancia **1** | **11/64** = 0,1719 | s_dsp.c:700-708 |
| envío del eco | ganancia **1** | **1/4** | s_dsp.c:525-528 |
| los dos `lp` interiores | al revés | ≠0 = filtro **PUESTO** | s_dsp.c:658-664 |

### El envío: el motor suma el efecto atenuado, no entero

```c
if( dsp_coeff_table.value == 1.0f )
  voutm /= 6;                 // alpha
else voutm = (11 * voutm) >> 6;
paint->left = CLIP16( paint->left + voutm );      // s_dsp.c:700-708
```

Hay **dos tablas**, y la de serie es la segunda: `dsp_coeff_table` vale `"0"` de
origen —«0 for release or 1 for alpha 0.52», s_dsp.c:148—, así que el envío de la
reverberación es 11/64 y no 1/6. El del eco va por su lado y es un `val >>= 2`,
o sea 1/4 (s_dsp.c:525-528).

Portado a ganancia 1, el camino mojado llegaba **5,8 veces** más alto de lo que
toca en la reverberación y **4 veces** en el eco. Eso solo ya es «todo suena a
eco».

### El signo: `room_rvblp` no es una frecuencia, es un interruptor

```c
dly1->lp = dly2->lp = sxrvb_lp.value;             // s_dsp.c:602
...
if( dly->lp ) { valt = (dly->lp0 + val) >> 1; ... }
else            valt = val;                       // s_dsp.c:658-664
```

Distinto de cero es **filtro puesto**. Estaba portado como «muevo el corte de un
`BiquadFilterNode`»: 2 000 Hz para apagar y 22 050 «para abrir». Las dos mitades
están mal, y con el signo invertido **la familia «brite» —que es Edana entera—
sonaba metida por un filtro de 2 kHz**. Ése es el «debajo del agua».

*El nombre de la familia del preset era la pista: «brite» con un paso bajo puesto
no es un preset, es un error de signo.*

### Y una cuarta cosa, de forma y no de número

El lazo estaba montado como «el maestro entra en la línea de retardo y la línea
realimenta», y lo que el motor calcula es

```c
val = vlr + (( dly->delayfeedback * delay ) >> 8);   // s_dsp.c:508
voutm = dly->lpdelayline[dly->idelayinput] = valt;   // s_dsp.c:666
```

o sea `y[n] = x[n] + fb·y[n−D]`, **con la muestra de ahora dentro de la suma** y
con lo filtrado siendo a la vez lo que sale y lo que se guarda. Puesto al revés
la salida era `x[n−D] + fb·y[n−D]`: el mismo tren de ecos corrido un `D` y sin la
copia directa. Y el paso bajo colgado del grifo en vez de dentro del lazo se
aplicaba una vez y no una por vuelta, así que la cola no se oscurecía al
apagarse.

---

## LO QUE ESTE EXPERIMENTO ENSEÑÓ, que es lo que no se puede deducir del código

### 1. Once controles en verde, ninguno preguntando CUÁNTA

La sonda del 82 declaraba doce controles y los doce pasaban con los tres fallos
puestos. No era un verde vacío de los del apartado 4: **medían algo real**. El
problema es qué:

- «el preset 23 tiene cola» → `cola > 0`
- «su cola es mucho mayor que la del silencio» → `cola > off0.cola * 1000`
- «la cámara suena pronto y el exterior a los 300 ms» → una **razón** entre dos
  ventanas

Todos son de **un solo lado** o **una razón**, y un error de nivel común a las
dos mitades no mueve una razón. Una cadena con el envío siete veces más alto
pasaba los doce, y pasaba *mejor*.

> *Un control que pregunta «¿pasa algo?» no puede ver un fallo que dice «pasa
> siete veces». Un nivel se mide con dos lados y contra un número.*

Es el apartado 3 de CLAUDE.md —«se mide el efecto, no el valor de la ventana»—
por una puerta nueva: **se medía el efecto, y el efecto medido era la presencia.**

### 2. Mi primer control de nivel TAMPOCO lo cazó, y eso se vio rompiendo

Puse una horquilla: «cola/golpe < 0,35, que el motor dice 0,093» — casi cuatro
veces la predicción, para no afinar el umbral sobre la medida. Con los dos
envíos puestos a 1 **salió 0,243 y el control lo dejó pasar**: 18 de 18 en verde
con el fallo puesto, con la rotura comprobada por `grep`.

Lo que fallaba era el instrumento: 50 ms de ruido y ventanas de energía dan un
número que **no se puede predecir exacto** (las reflexiones de 0,0355 y 0,05 s
caen dentro de la ventana del golpe), así que el umbral tenía que ser ancho, y
ancho quería decir más ancho que el fallo.

Lo que sirve es un número exacto, y para eso hay que cambiar el instrumento: un
**pulso corto** y el pico de **un rebote aislado** contra el pico seco de una
pasada sin mojado. Entonces

```
pico(primer rebote) / pico(seco)  =  fb · envío
```

y los dos factores son constantes del motor. Medido: **0,1475** contra 0,1478 de
la cuenta en el preset 13, y **0,1865** contra 0,1875 en el 2. Con los envíos a
1 sale 0,8579 y 0,7459, que es `fb` pelado.

> *Cuando lo que mides es un nivel, no busques un umbral con margen: busca un
> caso en el que el número salga exacto. Si tu instrumento no puede predecir el
> valor, tu umbral mide tu instrumento.*

### 3. El arreglo trajo un fallo nuevo, y lo cazó la sonda y no yo

Al meter el paso bajo dentro del lazo —que es lo que hace el motor— la cola del
preset 10 pasó de 1,30e3 a **5,06e4**, treinta y nueve veces más, **con el envío
5,8 veces más bajo**. O sea que el lazo estaba creciendo solo.

La causa: **el `Q` de un `lowpass` de Web Audio está en decibelios.** No es la Q
clásica, es «a resonance value in decibels», así que el valor por omisión, 1, son
+1 dB de resonancia. Medido con `getFrequencyResponse`, el módulo llega a
**1,2532** a 2 205 Hz. Bajarlo a 1/√2 **no lo arregla** —sigue en 1,2209—, porque
0,707 dB sigue siendo un pico. Y con `room_refl 0,95` la ganancia de vuelta era
0,95 · 1,22 = **1,16**: eso no es una sala, es un oscilador.

El motor no puede sufrirlo porque sus filtros son **medias** —`(lp0 + val) >> 1`—
y una media vale 1 en continua y baja desde ahí. Así que aquí va **un polo**, con
la misma propiedad, y el interruptor se monta como dos caminos en paralelo, que
es la forma exacta del `if/else` del motor.

> *Al portar un filtro a un lazo de realimentación, la pregunta no es dónde
> corta: es si en alguna frecuencia pasa de uno.*

Y el detalle que lo hizo visible: **ninguno de mis dos controles de nivel nuevos
tocaba un preset con paso bajo** —el 13 es «brite» y no lo lleva, el 20 no tiene
reverberación—, así que el lazo que se disparaba no lo miraba nadie. Hizo falta
un control sobre el **10**, que sí lo lleva. Es el caso del 50 otra vez, dentro
de los controles que acababa de escribir.

### 4. El pulso de una muestra leyó 0,0000 con la cadena perfecta

El primer instrumento exacto mandaba **un** sample y medía cero de rebote con
todo bien. Dos cosas del `DelayNode`, las dos de Web Audio y ninguna del motor:

1. el retardo en muestras **no es entero** (0,05 s × 22 050 = 1 102,5), así que
   el nodo interpola y un impulso de una sola muestra se reparte entre dos: el
   pico baja a 0,1230 de los 0,1478 que toca;
2. un `DelayNode` **dentro de un lazo arrastra un bloque de render de más**, 128
   muestras, que a 22 050 Hz son **5,8 ms**: los rebotes no caen en 0,0355 y 0,05
   sino en 0,041 y 0,056, y una ventana de ±2 ms centrada en el instante teórico
   se los pierde enteros.

Con un pulso de diez muestras el centro es una meseta y el pico sobrevive. *El
69 otra vez: antes de dar por roto lo que mides, comprueba que tu instrumento
podía ver la presencia.*

### 5. Un comentario correcto con fecha de caducidad, por tercera vez

La sonda llevaba escrito, arriba y repetido al final, que **no** medía que el
jugador lo oyera en Edana «porque falta la línea de `src/main.js` que recorre los
once `env_sound` y le pasa el `room_type` al audio».

Esa línea **está**: `src/main.js:1789` hornea las fuentes y `:5444` llama a
`audio.reverberacion` cada fotograma, y `sondas/edana82.mjs` ya lo mide. El
comentario era verdad cuando se escribió, dejó de serlo dentro del mismo
experimento, y nadie volvió a leerlo.

Es el `catchspeech` del 79 y el `helptip` del 64, calcados. Corregido en el sitio,
con la fecha puesta.

---

## Cómo queda medido

`npm run sonda:reverberacion82` — **20 de 20**, con los cuatro controles nuevos:

| control | qué pide | medido |
| --- | --- | --- |
| envío de la reverberación | `fb · 11/64` = 0,1478 | 0,1475 |
| envío del eco | `fb · 1/4` = 0,1875 | 0,1865 |
| la 13 es más brillante que la 10 | el signo del `lp` | 0,904 contra 0,126 |
| la 10 no se dispara | el lazo con filtro dentro | 0,035 (cota 0,30) |

Y las **tres roturas deliberadas**, cada una con su `grep` delante para que la
rotura esté puesta de verdad (la lección del 80):

| rotura | qué se puso | qué salió rojo |
| --- | --- | --- |
| A | los dos envíos a 1 | los dos controles de envío: 0,8579 y 0,7459 |
| B | el `lp` invertido | el brillo (0,195 contra 0,627) y el envío del eco |
| C | el filtro con ganancia 1,15 en el lazo | los dos controles de la 10 (6,257, y la cola creciendo) |

Las cuatro envolventes, ventana a ventana, decaen monótonas: los presets 0, 10,
13 y 23 medidos a 100 ms por paso.

`npm test` — 2 094 en verde. `npm run sonda:sonido` — 26 de 26.

---

## Lo que queda abierto, dicho y no descubierto luego

1. **`sondas/edana82.mjs` tiene dos rojos que no son de esta cadena**, y la causa
   **no es la que escribí primero**. Queda las dos versiones, porque el error es
   la parte que no se puede volver a deducir.

   > **Lo que escribí, y es FALSO:** «el jugador no está donde la sonda cree, que
   > es la familia del 69 y del 78». Lo deduje de que el dueño fuera el 2 en los
   > dos puntos estando a 2 426 unidades del primero — o sea que **inferí la
   > posición del jugador a partir del dueño** en vez de leerla. Y se lo pasé a
   > otra sesión, que me dijo que le parecía correcto. **Es exactamente el caso
   > del 81**: una comprobación que viaja de una sesión a otra se repite para
   > comprobarla, no para apoyarse en ella — y esta vez el que la mandó fui yo.

   Medido de verdad, plantando al jugador y **leyendo la posición**:

   - el jugador **está exactamente donde se le pide**: `poner` devuelve
     `[-1488, 976, 230]` en unidades del `.bsp`, que es el punto pedido clavado;
   - en los dos puntos, y también **a +1 m y a +3 m**, las **once** fuentes dicen
     `porQueNo: "pared en medio"` y `distancia: null`. **No alcanza ninguna**;
   - en el sitio de nacer **sí** alcanza la fuente 2, con `rango 118,87`. O sea
     que la traza no falla siempre;
   - y `loQueSeVe` desde el ojo hacia la fuente más cercana —a **2,68 m**— no
     encuentra **nada** en medio.

   Así que `tipo 13 / dueño 2` **no es un fallo del reparto: es correcto.** Si no
   alcanza nadie, nadie gana, y el `tipo` no se apaga — las dos `NOTE` del motor
   (sound.cpp:975-980), que este puerto porta a propósito. Y con `rango 0` el
   dueño cae en la rama de «wait passively» y no suelta el sitio nunca. Lo que la
   sonda pide —que diga 11— no puede pasar mientras no alcance ninguna.

   **El hueco de verdad está en la traza**, `trazaDeSala` (main.js:1799-1820):
   dice «pared en medio» para una fuente a 1,3 m con nada en medio. La sospecha
   —y se escribe como sospecha, no como hallazgo, porque **no está medida**— es
   que el rayo **arranca en el origen del `env_sound`**, que es una entidad de
   punto y que los mapeadores entierran dentro de un brush sin ningún problema:
   si el origen está en sólido, lo primero que toca el rayo es su propia cara y
   sale `fraccion ≈ 0`. La medida que lo resolvería en una pasada es imprimir
   `golpe.distance` y `fraccion` de esas once trazas; si salen casi cero, es eso.
   Y habría que leer qué hace `UTIL_TraceLine` cuando arranca en sólido, que es
   lo que el motor no sufre.

   Y tiene un precedente que le da forma: **es el almiar del 69**. Allí
   `elegirObjetivo` descartaba un `func_breakable` por «pared en medio» porque el
   rayo chocaba **contra la cara del propio objetivo**, y lo cerró leer el
   impacto — la misma medida que falta aquí. Que el mismo mecanismo reaparezca
   en otra familia de entidades nueve experimentos después es lo que hace que
   valga la pena escribirlo: *cuando una traza descarta algo que tiene delante,
   sospecha de la geometría del objetivo antes que de la del medio.*

   **No lo he tocado**: `src/main.js` lo tiene otra sesión a medias. El tercer
   control de ese bloque —«el número llega al audio»— está **verde**, así que la
   cadena de este documento recibe bien lo que el reparto le da.
2. **La modulación** (`room_mod`): un solo preset la usa, el 26 —contado, es 1 de
   29—. Que haya **un solo `env_sound` de tipo 26 en los 93 mapas** lo escribió
   la primera vuelta y esta vuelta **no lo ha vuelto a contar**: va aquí como
   cita suya y no como medida mía.
3. **El retardo del canal izquierdo** (`room_left`, el ensanchado estéreo): lo
   traen 22 de los 29 presets. Falta la anchura, no la cola.
4. **La pendiente de los tres filtros.** El motor es un FIR de seis tomas para
   la sala, una media de dos para la reverberación y un IIR de dos polos para el
   eco; aquí los tres son un polo que les acierta el −3 dB (824, 2 756 y 474 Hz,
   calculados de sus fórmulas). Coincide dónde empieza a apagar, no cómo sigue.
5. **Los 5,8 ms de más** del `DelayNode` en un lazo (2,9 a 44 100 Hz) son de Web
   Audio y el motor no los tiene. Se miden en la primera reflexión.
6. **El nivel en una partida de verdad.** Lo de aquí se rinde en un
   `OfflineAudioContext`; lo que el jugador oye lleva encima su volumen y la
   mezcla.
