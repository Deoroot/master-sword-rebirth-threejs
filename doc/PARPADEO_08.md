# El parpadeo de Gate City, sin un shader

> Las antorchas de Gate City titilan. Era el único hueco del mapa que pedía
> salirse de los materiales de fábrica, y resulta que no lo pedía: **pedía
> contar**.

| | |
| --- | --- |
| Estilos animados en el mapa | **1 y 6**, los dos de Half-Life |
| Bloques de luz que mueven | **8 842** del estilo 1 y **3 368** del 6 |
| Caras con luz que parpadean | **9 039 de 14 527**, el 62 % |
| Caras con LOS DOS estilos | **3 171** |
| Estados distintos del ciclo | **16**, no 391 |
| Atlas | **25 PNG, 26,25 MB en textura, 3,9 MB en disco** |
| El control del reparto | **462 915 luxels, 0 distintos** |
| El control en pantalla | **0 píxeles** entre dos instantes del mismo estado |
| Lo que cambia en la cueva | **el 99,4 % de la pantalla** |
| Comprobaciones | **438, las 438 en verde** |

## 1. Por qué parecía que hacía falta un shader

El motor hace, por téxel (`R_BuildLightMap`):

```
suma = Σ  lightstylevalue[estilo_e] · luxel_e
out  = rampa[ suma · lightscale >> 14 ]
```

y `lightstylevalue` cambia diez veces por segundo. **La rampa de gamma va
DESPUÉS de la suma**, así que dos atlas ya horneados no se pueden sumar:
`rampa(a) + rampa(b)` no es `rampa(a + b)`. De ahí salió, en el experimento 05,
«el único hueco que sí pediría material propio», y se quedó escrito dos
sesiones.

Es cierto — **si hubiera que sumar en tiempo real.** No hay que sumar: hay que
elegir.

`lightstylevalue` es `letra × 22`, y las cadenas del motor usan pocas letras:

```
estilo 1   "mmnmmommommnonmmonqnmmo"   letras m n o q  ->  4 valores
estilo 6   "nmonqnmomnmomomno"         letras m n o q  ->  4 valores
```

El ciclo combinado dura 391 pasos —39,1 segundos— y pasa por **dieciséis
estados y nada más**. Se hornean los dieciséis y por fotograma se cambia la
textura de sitio. `MeshLambertMaterial` de fábrica, una asignación, y **es
exacto**: no es una aproximación del parpadeo, es el parpadeo.

El reloj tampoco se inventa — `CL_RunLightStyles()`, `ref/gl/gl_rlight.c`:

```c
flight = (int)Q_floor( ls[i].time * 10 );
tr.lightstylevalue[i] = ls[i].map[flight % ls[i].length] * 22;
```

Diez pasos por segundo y **sin interpolar**, porque el juego corre con
`cl_lightstyle_lerping "0"`. Salta, y saltar es lo que se ve.

## 2. Los CUBOS, que es lo que lo baja de 64 MB a 26

Dieciséis atlas enteros de 1024×1024 son 64 MB de textura. Pero **una cara que
sólo tiene el estilo 1 no necesita dieciséis variantes: necesita cuatro.** Así
que las caras se reparten por el CONJUNTO de estilos animados que llevan, y cada
cubo es su propio atlas:

| cubo | caras | atlas | variantes | KB en disco |
| --- | --- | --- | --- | --- |
| quieta | 5 488 | 512×1024 | 1 | 262 |
| 1 | 5 671 | 512×1024 | 4 | 974 |
| 6 | 197 | 128×128 | 4 | 34 |
| **1+6** | **3 171** | 512×512 | **16** | 2 611 |

**26,25 MB en textura contra 64.** Y ni un vértice duplicado: una cara está en un
cubo y sólo en uno, así que la `uv1` sigue siendo un atributo único. Lo que sí
sube es el número de grupos, de 100 a 191, porque el cubo entra en la clave del
material.

## 3. Los dos controles, que es lo que separa esto de una animación bonita

Repartir 14 527 caras en cuatro atlas nuevos y recalcular sus UV es la clase de
cambio que sale **casi** bien. Una cara en el cubo equivocado mira a un atlas que
también tiene luz, así que se ilumina — con la luz de otro sitio. Eso no se ve
como un fallo: se ve como el mapa. Igual que las 12 680 caras al revés se vieron
como oscuridad.

### El control del reparto: luxel a luxel contra el atlas que ya se sabía bueno

Con todos los estilos a su **valor medio**, los cuatro atlas nuevos tienen que
dar el atlas de siempre.

```
control       a valor medio, 462915 luxels contra el atlas de siempre:
              0 distintos (IDÉNTICO)
```

Corre en cada extracción y en `npm test`, y la extracción se para si falla.

### El control en pantalla: dos instantes que tienen que salir IGUALES

Los pasos 0 y 3 del ciclo son **el mismo estado** —el estilo 1 en `'m'` y el 6 en
`'n'`—, así que la pantalla tiene que salir idéntica. Y el paso 225 es `'q','q'`,
el más lejano.

| vista | pasos 0 y 3 (mismo estado) | paso 0 → 225 | medio | peor |
| --- | --- | --- | --- | --- |
| calle | **0,00 %** | 19,8 % | 1,3 | 22 |
| plaza | **0,00 %** | 13,8 % | 1,7 | 12 |
| **cueva** | **0,00 %** | **99,4 %** | 5,5 | 33 |

Cero píxeles en las tres. Y el paso a paso de un segundo en la calle cambia entre
el 0,7 % y el 12 % de la pantalla cada décima.

**La cueva cambia entera**, y tiene sentido: ahí no hay más luz que las
antorchas.

### Y un tercer control, en las pruebas

El orden de las variantes lo calculan dos sitios distintos —`variantesDeCubo` al
hornear y `varianteEnT` al dibujar— y si no cuentan igual **el parpadeo funciona
perfectamente y enseña la variante de otra cara**. La prueba recorre el ciclo
entero, los 391 pasos por los tres cubos, y comprueba que el índice que pide el
reloj tiene exactamente los valores que el motor pone en ese paso. Invirtiendo el
orden a mano, cae en el paso 0.

## 4. Lo que el parpadeo NO toca todavía

Los **adornos y los bichos** no parpadean. Su luz sale de un solo luxel del suelo
(`R_LightPoint`), reservado en el atlas quieto, y en el motor ese luxel también
se multiplica por `lightstylevalue`. Está dicho en el código, no disimulado.

Y el **control del juez de luz se ha debilitado**: la comprobación de que el atlas
se muestrea con `uv1` y no con `uv` daba 90,8 % contra 46,2 % y ahora da 90,8 %
contra **62,8 %**. La cifra buena no se mueve; lo que pierde filo es el control,
porque con atlas más pequeños el muestreo equivocado cae más veces en un valor
plausible. Sigue separando 28 puntos y sigue pasando su umbral, pero es peor
juez que antes y conviene saberlo.

---

# Los adornos que se mueven, que son diez y no ciento uno

## La medida que corrige el plan

«Animar los 101 adornos» era el trabajo apuntado. Medido, **son 10**.

De los 17 `.mdl` que Gate City coloca, **catorce no mueven ni un vértice**. Y no
es que les falte la secuencia: `props/cart.mdl` declara una de **101
fotogramas**, `props/fireplace_logs1.mdl` una de 10 y `misc/chair.mdl` una de 7,
y las tres dejan los vértices exactamente donde estaban. **Una secuencia larga no
es movimiento.**

| modelo | veces | huesos | secuencia | recorrido | |
| --- | --- | --- | --- | --- | --- |
| `props/tree2` | 2 | 4 | `anime` (101f@20) | **3,13 u** | 7,9 cm |
| `props/Lamp` | 2 | 4 | `idle` (51f@30) | **2,06 u** | 5,2 cm |
| `props/gaz_thoth_mutant_candle` | 3 | 4 | `idle` (51f@30) | **2,06 u** | 5,2 cm |
| `props/gaz_thoth_mutant_candle3` | 3 | 3 | `idle` (51f@30) | **2,06 u** | 5,2 cm |
| los otros 13 modelos | 91 | | | **0,00 u** | |

Así que las 91 colocaciones quietas siguen fundidas en una sola malla —que es lo
que las hace baratas— y las 10 que se mueven salen de ahí y van por el camino de
los bichos, que ya estaba escrito: `extraerBicho` saca el esqueleto y las pistas,
`cargarBichos` monta el `SkinnedMesh`. **No hizo falta código nuevo de
animación.**

## La sonda que midió mal, otra vez, y de la misma forma

La primera versión midió el **origen de cada hueso** entre fotogramas y dijo que
no se movía ninguno de los diecisiete, el árbol incluido. Y es que un árbol de
cuatro huesos que se mece **gira el de la raíz**: el origen se queda donde está y
la copa se va ocho centímetros.

La pregunta se le hace al **vértice**, que es lo que se ve. Es exactamente el
mismo error que la sonda que juzgaba el bobinado por luminancia: bien escrita, y
midiendo otra cosa. Van cinco.

## Y la segunda sonda también, por partida doble

La sonda de pantalla dio **0,000 % en todas las vistas**, o sea «no se mueve
nada». Dos causas, las dos de la sonda:

1. **La cámara miraba al lado contrario.** `rotation.y = θ` mira hacia
   `(−sin θ, 0, −cos θ)`; plantada en +X del adorno hacía falta `+π/2` y tenía
   `−π/2`. Miraba a la pared de enfrente.
2. **Y desde el lado bueno, tres de los cuatro lados de una vela son pared.**
   Ahora la sonda prueba los cuatro y se queda con el que ve más colores.

Lo que separó «no se anima» de «no se ve» fue preguntarle a los **huesos** en vez
de a los píxeles: `dondeAdornos()` devuelve la suma de las posiciones y los
cuaterniones del esqueleto, y esa suma cambia si y sólo si la animación corre.
**Los 10 la mueven.**

| modelo | control (0 s) | medio segundo | medio | peor |
| --- | --- | --- | --- | --- |
| `props_tree2` | **0,000 %** | 0,405 % | 5,5 | 235 |
| `props_Lamp` | **0,000 %** | 0,006 % | 37,4 | 115 |
| `props_gaz_thoth_mutant_candle3` | **0,000 %** | 0,018 % | 23,4 | 171 |
| `props_gaz_thoth_mutant_candle` | **0,000 %** | — no hay línea de visión | | |

Tres de los cuatro modelos confirmados en pantalla; del cuarto se confirma el
esqueleto, porque está en un interior oscuro donde la cámara automática no le
encuentra un hueco. Queda dicho así en vez de redondearlo a cuatro.

## Un fallo de camino que no dio error

`extraerBicho` escribía en `salida` y devolvía `carpeta: "bichos/${clave}"` **a
mano**. Es correcto mientras `salida` sea la carpeta de los bichos y una mentira
en cuanto no lo es: al reusarlo para los adornos se le pasó `build/gatecity`, los
ficheros fueron a `build/gatecity/props_tree2` y la ficha siguió diciendo
`bichos/props_tree2`.

**No dio error.** Dio cuatro modelos que el visor no encontraba y un aviso en la
consola del navegador. Ahora `carpeta` se **deriva** de dónde se ha escrito, con
`relative()`, y las dos cosas no pueden discrepar.

Y de paso: `env_model` puede traer `scale` —dos de los diez la traen, a 0,75 y a
0,5— y el camino de los bichos no la aplicaba. Se aplica. Ninguno trae `pitch` ni
`roll`, así que con el yaw basta, y eso también está medido y dicho.

---

## Cómo se mira

```
npm run gatecity                 extrae, hornea los 25 atlas y corre el control
npm test                         438 comprobaciones
npm run gatecity:juez            el juez del mapa de luz, con --t para el instante
npm run gatecity:mirar -- --t 22.5   una captura en un instante del ciclo
node build/sondas/parpadeo.mjs       el control de pantalla y la medida
node build/sondas/adornosvivos.mjs   los adornos que se mueven
node build/sondas/huesosvivos.mjs    y sus huesos, que es lo que no miente
```
