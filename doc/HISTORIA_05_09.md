# Historia: los experimentos 05 a 09, antes de que esto fuera un port

> **Esto es el archivo, no la referencia.** Los tres informes de abajo se
> escribieron cuando el proyecto todavía estaba decidiendo qué era, y los tres
> están **superados por trabajo posterior**. Se conservan enteros —con sus
> avisos y sus errores— porque son el registro de lo que se midió, y una cita
> rota es mejor que una cita reescrita a algo que no es lo que se midió.
>
> Vivían en tres archivos sueltos de `doc/` y se juntan aquí para que se lea
> una sola vez que son historia:
>
> | lo de abajo | lo que lo sustituye |
> | --- | --- |
> | **1. `CAPACIDAD_05`** — ¿puede esta pila poner en pantalla lo que pone el `.bsp`? | [FIDELIDAD_06.md](FIDELIDAD_06.md), que encuentra que el mapa de luz no llegaba a la pantalla. Su propio aviso de cabecera ya lo dice. |
> | **2. `PROPUESTA_06`** — qué es este proyecto y qué se hace | [PROYECTO_10.md](../PROYECTO_10.md), que es el plan decidido. `BICHOS_07` ya había tumbado dos de sus suposiciones. |
> | **3. `EVALUACION_09`** — los scripts de MSR y el personaje | [MISIONES_33.md](MISIONES_33.md) para los scripts, y los experimentos 30 a 32 para el personaje. Recomendaba una de tres salidas; se tomó la A. |
>
> Lo que **no** está superado y se sigue citando de aquí: las medidas de
> iluminación del 05 —los `env_glow`, el sRGB, las texturas de detalle— que son
> las originales y las que `NEXT_SESSION.md` resume de segunda mano.

---

<a id="parte-1"></a>

# Parte 1 · CAPACIDAD_05

## ¿Es capaz esta pila de poner en pantalla lo que pone `gatecity.bsp`?

> **AVISO DEL EXPERIMENTO 06, y hay que leerlo antes que nada de lo de abajo.**
>
> Este informe se escribió con **el mapa de luz sin llegar a la pantalla**. Desde
> Three.js r152 el `lightMap` se muestrea con el juego de UV que diga
> `texture.channel`, que vale CERO de fábrica, así que el atlas se estaba
> muestreando con las UV de la TEXTURA. La geometría traía su `uv1` bien
> calculada y nadie la leía.
>
> La respuesta de este informe —**la pila llega**— no cambia: cambia a mejor,
> porque el coste medido era el de dibujarlo todo igualmente. Lo que sí hay que
> tachar son las cifras de iluminación:
>
> | lo que dice este informe | lo que era |
> | --- | --- |
> | «somos un 25 % más claros: mediana 42,6 contra 32,3» | el atlas plano; hoy **34,1 contra 36,5** |
> | «menos saturados: 0,42 contra 0,59» | hoy **0,542 contra 0,506** |
> | «apagar el mapa de luz cambia el 78,7 %» | medía cuánta pantalla es geometría; hoy **99,4 %** |
> | «la causa candidata son las texturas de detalle» | no lo era; puestas, mueven **1 punto** de mediana |
>
> Todo lo demás —la geometría, el bobinado, las 92 texturas, la contabilidad del
> lump al byte, los `.mdl`, los carteles, los cinco modos de dibujo— sigue
> valiendo entero y está comprobado.
>
> **El informe del 06 es [FIDELIDAD_06.md](FIDELIDAD_06.md)**, y trae además las
> texturas de detalle, el cielo `nature1`, la medida del parpadeo y el juez que
> impide que esto vuelva a pasar: `npm run gatecity:juez`.

Informe del experimento 05. La pregunta no era «¿se parece?» —eso ya se contestó
con las proporciones del jharro, y quien lo jugó dijo «todo se ve casi 100 %
igual, y bastante inferior al `.bsp`»—. La pregunta era si Three.js, Rapier y Node
pueden alcanzar la calidad de la referencia, porque **de nada vale inspirarse en
algo que no se puede alcanzar**.

### La respuesta corta

**Sí, y sobra margen.** Gate City se lee, se extrae, se dibuja y se anda con
`Three.js` de fábrica: `MeshBasicMaterial`, `map`, `lightMap`, `uv1`. **No hizo
falta escribir un shader, ni un material propio, ni un paso de render.**

Lo que al jharro le falta es TRABAJO, no herramientas.

El coste de dibujarlo, medido en el navegador con SwiftShader —renderizado por
software, sin GPU, que es el peor caso posible—:

| | |
| --- | --- |
| Triángulos por fotograma | **41 650** |
| Llamadas de dibujo | **92**, una por textura |
| Tiempo por fotograma | **0,94 ms** (≈ 1 060 fotogramas por segundo) |
| Texturas en memoria | 92, más el atlas de luz |
| Geometrías | **1** |

Y eso es dibujando el mapa ENTERO cada fotograma, sin usar el lump de visibilidad
—114 184 bytes de PVS que GoldSrc sí usa para dibujar sólo lo que se ve—. O sea
que el margen real es mayor que el medido.

### Lo que se reprodujo, con su control

Cada fila tiene una comprobación en `test/bsp.test.mjs` y casi todas tienen
oráculo: un número escrito dentro del archivo que el lector tiene que producir. Es
la primera vez en este experimento que las sondas tienen un juez que no escribimos
nosotros.

| Qué | Cifra | Cómo se sabe que está bien |
| --- | --- | --- |
| Geometría del mundo | 12 680 caras, **32 887 m²** | la misma cifra que `bsp.mjs` medía desde el primer día |
| Geometría de entidades | 316 modelos, 2 980 caras, 2 003 m² | 15 660 caras = los 313 200 bytes del lump entre 20 |
| Malla emitida | **41 650 triángulos, 100 grupos** por textura y modo de dibujo | los tramos de índices cubren el índice sin hueco ni solape |
| Texturas | **92 de 92**, incrustadas, 8 bits con paleta | las 92 declaran 256 colores en el sitio calculado |
| Variedad | **80 texturas en superficie, 10 cubren el 80 %**, la mayor el 30 % | reproduce la tabla que `bsp.mjs --texturas` imprimía |
| Tamaño de cara | mediana **0,47 m²**, la mayor **427 m²** | idem |
| Mapa de luz | **2 126 793 bytes, al byte** | los bloques llenan el lump sin solaparse ni dejar hueco |
| Luxels | **462 915**, parche mayor 17×17 | los leídos cuadran con los contados |
| Atlas | 1 024 × 1 024, 54 % ocupado, 634 KB | el histograma NO es plano: 7 cubetas vivas, desviación 31 |
| Casos especiales | 1 calada (`{grate1b`), 2 de agua, 1 de cielo | la reja con alfa, el agua a plena luz y corriendo la UV |
| Caras sin mapa de luz | 1 133, y **negras**, como el motor | 751 de ellas están a la vista, medido con el árbol BSP |
| Modos de dibujo | los **5** del formato | los rayos de luz se atraviesan y los faroles de pared brillan |
| Carteles | **57 antorchas** de `Fire1/Fire2.spr` | 23 cuadros, aditivo, cuatro desfases; el recorrido acaba en el último byte |
| Luz horneada Y dinámica | las dos a la vez, con material de fábrica | con el glow se ve el 44,2 % de la pantalla, sin él el 23,4 % |
| Escala | **39,37 u/m** | la puerta mediana mide 2,84 m; con 32 mediría 3,50 |
| Colisión | 39 247 triángulos, se anda | 8 rumbos probados, el mejor 12,5 m en 2,5 s |
| Bobinado | 41 650 triángulos mirando hacia su normal | de frente se dibuja el 99,4 % de la pantalla, por detrás el 31,8 % |
| Llegada | `ms_player_begin`, pies en el suelo medido | el árbol BSP dice que el punto está en hueco, y su suelo 54 u más abajo |
| Interiores | 8 `msarea_town`, los 8 con un sitio donde estar | el centro de la caja mayor cae en SÓLIDO: el punto sale de una cara de suelo |

### EL FALLO GORDO, y lo encontró alguien jugándolo. Otra vez

Lo primero, porque es la lección de la sesión y porque cambia cómo hay que leer
todo lo demás.

**Las 12 680 caras del mundo salían con el bobinado al revés.** GoldSrc guarda la
vuelta de una cara en sentido HORARIO vista desde delante; Three.js llama frontal
al antihorario. Emitidas tal cual, **cada pared se ve sólo desde detrás**: se
atraviesan las cercanas y se ven los reversos de las lejanas.

Y aquí está lo caro: **eso no se ve como geometría al revés. Se ve como
oscuridad.** La vista de la llegada daba el 0,3 % de pantalla visible y cuatro
manchas de roca flotando en negro, y yo lo di por bueno con un argumento
perfectamente razonable: Gate City es una cueva, la medida dice que su rincón más
oscuro está a 43,7 m de su farol y que se entra por la cueva a 47 m del pueblo. O
sea que **tenía una explicación correcta para un síntoma equivocado**, escribí en
el informe que «el sitio de llegada es oscuro por diseño» y seguí.

Lo encontró quien lo anduvo, en dos frases: primero «el lugar de inicio del jugador
está fuera de los interiores» y luego **«muchas cosas parecen ser invisibles»**. La
segunda es literalmente el fallo. En su captura el suelo no estaba y las casas
flotaban.

Y había una cifra mía que lo gritaba y no la miré: **apagar el mapa de luz cambiaba
sólo el 3,1 % de la pantalla en la vista de la llegada.** Sin mapa de luz todo se
dibuja a plena luz, así que una vista llena tiene que cambiar entera. Después del
arreglo esa misma cifra es el 78,7 %, y en las salas cerradas el 99 %.

El aviso que el proyecto llevaba escrito era **«`mallaGenerada` dibuja a DOS CARAS,
así que una cara emitida al revés no se ve mal en el visor»**. Aquí se dibuja a UNA
cara, que debería haberlo hecho evidente, y resultó peor: a una cara tampoco se ve
mal — se ve OSCURO, y un mapa que de verdad es oscuro se lo lleva puesto.

Ahora tiene dos jueces, y los dos con oráculo:

- **Analítico**, en `test/bsp.test.mjs`: cada uno de los 41 650 triángulos emitidos
  tiene que mirar hacia donde dice su normal. Su control es la otra cara de la
  moneda: leídas tal cual del archivo, las 12 680 van al revés, y eso también está
  fijado en una prueba porque es un hecho del formato.
- **En pantalla**, en `tools/gatecity_shot.mjs`: desde dentro de una sala, con el
  bobinado bien, la cara frontal tapa el **99,4 %** de la pantalla y la trasera el
  **31,8 %**. Con el bobinado invertido a mano, los dos números se cambian de sitio
  exactos. Ese par es lo que lo convierte en un juez.

Quedan 147 triángulos de 41 650 al revés y los 147 son **astillas**: el mayor mide
0,135 cm² y entre todos suman 0,0002 m² en un mapa de 34 890. Salen de polígonos
con vértices casi alineados —un `.bsp` parte las caras para construir el árbol— y
no dibujan ni un píxel. Se dicen en vez de esconderse.

### EL SEGUNDO que encontró jugándolo: 2 051 m² a plena luz

Quien lo anduvo 850 m dijo dos cosas más, y hay que separarlas porque una es un
fallo mío y la otra es el mapa:

> «veo que varias texturas o cosas son completamente negras o pitch black»
>
> «este mapa originalmente era muy oscuro, especialmente en las cavernas, y los
> jugadores sólo podían guiarse con un hechizo llamado glow»

**Lo mío: las caras sin mapa de luz las estaba pintando BLANCAS.** Son 1 133 caras
y 6 249 m², el **17,9 % de la superficie del mapa**, y no son todas lo mismo:

| | superficie | qué hay que hacer |
| --- | --- | --- |
| cielo | 3 822 m² | material plano aparte, ya estaba |
| agua | 280 m² | a plena luz de su textura, sin mapa de luz |
| lo demás | **2 147 m²** | **negras**, y **2 051 de esos están a la vista** |

De las 966 que no son cielo ni agua, **751 están a la vista** — se comprobó una por
una con el árbol BSP, mirando si delante de cada cara hay hueco o roca, y el
control dice que de 3 000 caras CON mapa de luz, 2 987 tienen hueco delante.

El motor no duda: en `R_BuildLightMap`, si una cara no tiene muestras, el bloque de
luz se queda a **cero**. Yo elegí blanco razonando que negro «las haría desaparecer,
y no se ve se parece mucho a no está» — que suena sensato y es exactamente al revés
de lo que hace GoldSrc. El resultado eran 751 caras a plena luz en mitad de una
cueva: las escaleras blancas que se ven en su captura.

**Y lo del mapa: tiene razón, y ahora está medido.** El brillo del mapa de luz,
repartido por superficie:

| banda | superficie | |
| --- | --- | --- |
| **0–32 de 255** | **17 969 m²** | **62,7 %** |
| 32–64 | 9 399 m² | 32,8 % |
| 64–96 | 957 m² | 3,3 % |
| por encima de 96 | 316 m² | 1,1 % |

**El 63 % de la superficie iluminada está por debajo de 32 sobre 255**, y ni un
metro cuadrado llega a 224. Eso no es un fallo de lectura: es el mapa. Se jugaba
con el hechizo `glow` encendido, que es **mecánica de juego y no dato del archivo**.

### LOS RAYOS DE LUZ ERAN UN BLOQUE MACIZO

Lo encontró comparando capturas del juego con las nuestras: «los rayos de luz en el
templo del juego son transparentes pero veo que en el demo es sólido».

Un rayo de luz en GoldSrc es un **`func_illusionary` con `rendermode 5`**, que es
ADITIVO. Y el dato estaba medido e impreso desde la primera pasada, sin que yo lo
usara: **31 entidades y 208 m²**. Los estaba dibujando opacos.

Lo peor es por qué aguantó tantas rondas: **un bloque amarillo macizo debajo de un
tragaluz parece deliberado.** No se lee como un fallo de render, se lee como
arquitectura.

Los cinco modos del formato, todos medidos, ahora todos puestos:

| modo | qué es | entidades | superficie | cómo se dibuja |
| --- | --- | --- | --- | --- |
| 0 | normal | 227 | 1 661 m² | opaco, con mapa de luz |
| **5** | **aditivo** | **31** | **208 m²** | `AdditiveBlending`, sin escribir profundidad |
| 2 | textura con alfa | 50 | 120 m² | `opacity = renderamt/255`. **Son los faroles de pared** |
| 1 | color plano | 6 | 10 m² | el `rendercolor`, que aquí SÍ se usa |
| 4 | recortado | 2 | 5 m² | `alphaTest`, sin mezcla ni orden |

La clave de agrupación de la malla pasa a ser **textura + modo + `renderamt`**, no
sólo la textura: sin eso, un rayo aditivo y una pared opaca con la misma textura
comparten material y hay que elegir un modo para los dos.

#### Y el fallo que eso destapó: los faroles salían NEGROS

Three.js ordena OBJETOS —lo opaco primero, lo transparente después y de atrás
adelante— pero **dentro de un mismo `Mesh` los grupos se dibujan en orden de
índice**. Los faroles de pared son modo 2 y no escriben profundidad; su grupo caía
antes que el de la pared opaca que tienen detrás, **y la pared los pintaba por
encima**.

Se arregla separando la malla en dos: lo opaco y lo translúcido, compartiendo los
mismos atributos —las `BufferAttribute` se pasan por referencia y la tarjeta las
sube una vez— con lo translúcido en su propia pasada. Que es lo que hace el motor.

### LA ILUMINACIÓN: tres calibraciones a ojo y una lectura del motor

Esta es la parte que más vueltas costó, y el resumen es corto: **la calibré tres
veces contra mi propio criterio y las tres veces estaba mal.**

| intento | qué hice | resultado |
| --- | --- | --- |
| 1 | rampa de gamma sólo en el mapa de luz, exponente 2,8 | el 79,7 % de la superficie por debajo de 32/255 |
| 2 | la misma rampa también en las texturas | la miré, la vi «lavada» y la quité |
| 3 | rampa en las dos, 1,8 y 2,8, elegidas con un barrido de dos varas | mediana 80 contra los 32 del juego |

Cada intento tenía su razonamiento y su medida. Ninguno tenía **referencia**.

#### Lo que cambió: el juego, su configuración y su código fuente

Quien lo juega trajo tres cosas, y cada una vale más que la anterior:

1. **Una captura del juego original de la misma calle** que una nuestra. Eso
   convierte «se ve distinto» en un histograma contra otro —
   [`tools/comparar.mjs`](../tools/comparar.mjs).
2. **La instalación del juego**, con su configuración:

   ```
   C:\Juegos\MSR\msr\opengl.cfg                gl_overbright "0"
   C:\Juegos\MSR\msr\config.cfg                gamma "3"   brightness "2"
                                                  r_lighting_modulate "0.6"
   C:\Juegos\Steam\...\msrebirth\msr\config.cfg  lo mismo, y
                                                  gl_texturemode "GL_LINEAR_MIPMAP_LINEAR"
   ```

   Las dos instalaciones —la de GoldSrc y el port a Xash3D— dan **exactamente los
   mismos valores**, así que no hay que elegir cuál.

3. **El código fuente del motor**, en `MSC/xash3d-fwgs-sdk/`.

#### El resultado: ya no hay ninguna constante elegida

[`src/bsp/gamma.js`](../src/bsp/gamma.js) es `BuildGammaTable()` de
`engine/client/gamma.c` traducido línea a línea, y `pintarAtlas()` es
`R_BuildLightMap()` de `ref/gl/gl_rsurf.c`. Lo que eso tiró a la basura:

- **`OVERBRIGHT = 2`.** El juego lo lleva **apagado**. Era un factor de dos sobre
  el término de luz del mapa entero, y lo había razonado del formato. **No hay
  forma de deducir `gl_overbright 0` leyendo un `.bsp`** — ése es el argumento
  entero de por qué la referencia importa más que el razonamiento.
- **Las dos rampas de exponente único.** El motor no usa una potencia: usa una
  curva con un **codo** en `g3`, que aplasta el extremo oscuro en una recta y deja
  el resto curvo. Es justo lo que hace que `brightness` levante las sombras sin
  lavar el resto, y es exactamente lo que una rampa de un exponente no sabe hacer.
- **`lightscale`.** Apagar el overbright no quita el factor dos: lo suaviza.
  `pow(2, 1/lightgamma) * 256 = 338` en vez de 512, un 32 % en vez de un 100 %.
- **El peso de los estilos.** El motor multiplica cada bloque por
  `lightstylevalue`, que es `letra × 22`. Los estilos 1 y 6 —8 842 y 3 368 bloques
  en este mapa— promedian más que el fijo.

#### Y el veredicto, contra la captura del juego

Recortando el HUD y midiendo el fotograma crudo, sin el hechizo `glow` puesto
—que en su captura tampoco lo lleva—:

| | **juego** | antes | **ahora** |
| --- | --- | --- | --- |
| luz p10 | 19,6 | 15,7 | **19,6** |
| luz mediana | 32,3 | 80,5 | **38,7** |
| luz p90 | 66,1 | 96,6 | 56,3 |
| saturación mediana | 0,590 | 0,352 | **0,510** |
| contraste local | 7,6 | 14,6 | 10,5 |

El extremo oscuro **clava**. La mediana se queda un 20 % clara y el p90 un 15 %
corto, y las dos cosas se explican por el encuadre: su captura tiene un pasaje
negro al fondo que la nuestra no coge.

#### EL sRGB, que aplastaba las sombras por un factor de tres

Reproducidas ya las tablas del motor, seguían saliendo cuñas de negro PURO donde
el juego tiene penumbra legible. No era brillo —la mediana ya cuadraba— ni
geometría: con un control de `r_fullbright`, el negro se iba **entero** (17,5 % →
0,0 %), o sea que había superficie y estaba oscura de verdad.

La causa: **el motor multiplica textura por mapa de luz en 8 bits y en espacio de
PANTALLA** (`glBlendFunc(GL_ZERO, GL_SRC_COLOR)`). Nosotros declarábamos las dos
texturas `SRGBColorSpace`, así que Three.js las pasaba a lineal, multiplicaba y
volvía a codificar.

El comentario que lo justificaba decía: *«`encode(lin(t)·lin(l)) = t·l`, así que
declarando las dos sRGB se reproduce la multiplicación en espacio de gamma de
GoldSrc»*. Y es casi verdad: **vale para una potencia pura y no vale para sRGB**,
que tiene un tramo RECTO por debajo de 0,04045. Ese tramo aplasta justo el extremo
oscuro:

| mapa de luz × textura | el motor | por sRGB | con potencia 2,2 pura |
| --- | --- | --- | --- |
| 16 × 75 | 5 | **1** | 5 |
| 31 × 75 | 9 | **3** | 9 |
| 64 × 75 | 19 | 12 | 19 |
| 128 × 75 | 38 | 33 | 38 |
| 200 × 150 | 118 | 116 | 118 |

Un factor de tres en las sombras y nada arriba — exactamente la forma del fallo. Y
por eso duró: el razonamiento era correcto salvo en el tramo donde a nadie se le
ocurre mirar.

Ahora Gate City dibuja sin espacios de color: las texturas entran tal cual, se
multiplican tal cual y `renderer.outputColorSpace` va a lineal para que el render
no vuelva a codificar. Los demás mapas son nuestros y se quedan en el flujo
lineal, que para ellos es lo correcto.

#### Lo que TODAVÍA no cuadra, y su control

Hay que decirlo con los números delante, porque quedan dos:

| | **juego** | **nuestro** |
| --- | --- | --- |
| luz mediana | 32,3 | 40–43 |
| saturación mediana | 0,590 | 0,38–0,42 |

Y el control que hace falta para poder afirmarlo: **girando la cámara desde el
mismo punto**, la mediana sólo se mueve de 38 a 43 y la saturación de 0,380 a
0,421. O sea que el encuadre NO explica la diferencia: es real.

El negro sí lo explica en parte —de 2,4 % a 13,9 % sólo girando—, y lo que queda
es que el **2,4 % de la superficie del mapa tiene el mapa de luz a cero exacto**,
y un cero el motor también lo pinta negro.

#### La causa candidata que queda: 61 texturas de DETALLE sin dibujar

`C:\Juegos\MSR\msr\maps\gatecity_detail.txt` existe y tiene **61 líneas**: 61
de las 80 texturas del mundo llevan una textura de detalle con su escala, y
`r_detailtextures` vale `"1"` en la configuración. No dibujamos ninguna.

Una textura de detalle se mezcla con `RGB_SCALE 2` —`base × detalle × 2`— así que
conserva la media y **añade contraste de alta frecuencia**. Es lo que le falta a
nuestras paredes al lado de las suyas.

Y se puede hacer sin salirse de los materiales de fábrica: una segunda pasada con
`CustomBlending(DstColorFactor, SrcColorFactor)` da exactamente `2 × src × dst`,
que es la mezcla del motor. Los `.tga` están en `gfx/detail/` — otro lector por
escribir, y la misma regla de siempre.

#### LA RESOLUCIÓN, que era lo primero que se notaba

Quien juega lo dijo sin saber el nombre —«tal vez sea la resolución»— y tenía
razón: el visor dibujaba a **320 píxeles de ancho** y los estiraba con
`image-rendering: pixelated`. Eso es una decisión de ESTILO de los experimentos de
Corinth y del jharro, y para Gate City es un error de fidelidad: **Master Sword
Rebirth corre a 1920×1080** (`video.cfg`). Estábamos reproduciendo el mapa a un
sexto de su resolución.

Ahora Gate City dibuja al tamaño real del canvas y los otros mapas siguen a 320,
que es lo suyo. El fotograma pasa de 7 640 colores a **23 377**.

Y de paso, dos ajustes más que salen del mismo fichero y que yo tenía por gusto:
`gl_texture_nearest "0"` —el motor filtra LINEAL, no de punto; lo que da el
aspecto de píxel gordo de Half-Life son las texturas de 64 y 128 píxeles, no el
filtro— y `gl_anisotropy "8"`.

### LAS LÁMPARAS NO TENÍAN HALO: 23 `env_glow` sin dibujar

La otra mitad del *«las lámparas no están emitiendo luz, las antorchas parece que
sí»*, y ésta sí era una cosa que faltaba entera.

El mapa pone **23 entidades `env_glow`** clavadas en las lámparas: `rendermode 5`,
aditivo, `rendercolor 255 255 128`. Un `env_glow` es precisamente el halo — la
mancha suave que hace que una lámpara parezca estar emitiendo en vez de estar
pintada de amarillo. Y no se dibujaban porque apuntan a `sprites/glow01.spr`, que
**no está en `../MSC/`**: la carpeta tiene 118 sprites y ése no es uno, porque es un
fichero del Half-Life base y el mod lo hereda de la instalación del juego.

Las antorchas se salvaron por lo mismo al revés: su `Fire1.spr` sí está, así que su
fuente se ve y la de las lámparas no.

Como no hay nada que leer, el halo es **generado**: un degradado radial `(1−r)²`
calculado en `src/bsp/halo.js`. Doce líneas de aritmética, sin un byte de nadie. No
reproduce el dibujo del sprite de Valve; reproduce su papel. Es el mismo trato que
le toca al cielo `nature1`, cuyos seis `.tga` tampoco están ni se pueden
redistribuir. Queda escrito en `build/gatecity/PROCEDENCIA.md`.

También se arregló el tinte: `rendercolor` se estaba ignorando. En las 57 antorchas
viene a `"0 0 0"`, que **no significa negro sino «sin tinte»** —aplicarlo apaga la
llama—, pero en las 23 `env_glow` viene a `"255 255 128"` y ése sí va. Un halo sin
su tinte sale blanco de quirófano en un mapa que no tiene un solo blanco frío.

Carteles: de 57 a **80**.

### DOS SONDAS ROTAS EN ESTA RONDA, y ninguna se cayó sola

La regla de la sesión es *cada sonda con su control*, y esta ronda la cobró dos veces.

**`contenidoEn` devuelve un objeto, no un entero.** La sonda que medía si una cara
negra da a vacío o a sólido lo comparaba con `CONTENIDO.solido`, y un objeto nunca
es igual a un entero: decía **«728 dan a vacío, 0 dan a sólido»**. Un cien por cien
redondo que era el resultado de comparar dos cosas de tipos distintos. Arreglado
salía casi lo mismo —a 20 cm por delante hay aire hasta en la grieta más estrecha—,
así que la medida buena no es «hay aire» sino **cuánto**, y se enseña la escalera.

**El control de `--sinluz` no controlaba.** Puse una vista plantada delante de la
cara sin mapa de luz mayor: con la perilla tenía que salir blanca y sin ella negra.
Salió **idéntica las dos veces, hasta en el recuento de colores**. Perseguir por qué
—la cara elegida, el punto de vista, el glow que tapa— es perseguir la sonda en vez
del asunto, así que la vista se quitó y el oráculo pasó a las pruebas: contar
cuántos vértices de la malla apuntan a cada luxel reservado. Exacto, en las dos
direcciones, y sin depender de dónde se ponga una cámara.

Antes de eso hubo una tercera, que ni siquiera llegó a nombre: una sonda que teñía
de rosa el luxel negro para delatar las caras sin mapa de luz. Su control positivo
salió 0,00 % — **la sonda estaba ciega**, porque el rosa se multiplica por la
textura, que en este mapa tiene la mediana en 41 sobre 255, así que un rosa sobre
roca llega a la pantalla como (51, 0, 40) y no pasa ningún umbral de «rosa
brillante». Sin el control positivo, sus dos ceros habrían pasado por respuesta.

### ¿HACE FALTA UN SISTEMA DE LUZ NUESTRO? No, y la medida lo dice

La pregunta la hizo quien lo jugó: «el mapa original emitía luces desde antorchas…
la parte con antorcha tiene una iluminación con flickers, pero esa luz no llega al
otro túnel, entonces se ve todo oscuro». Y trajo lo que faltaba para contestarla:
**capturas del juego original**.

**El sistema de luz de GoldSrc ES el mapa de luz, y ya distingue el farol de la
piedra por un factor de diez:**

| textura | caras | mapa de luz, brillo medio (mediana) |
| --- | --- | --- |
| `pi_lantern` — la única emisiva que declara `info_texlights` | 250 | **181 / 255** |
| `wood_103` | 183 | 31 |
| `T_stone_B1` | 131 | 25 |
| `ms_dirt01` | 1 496 | 19 |
| `rock_07` | 2 371 | **17** |

O sea que el farol sale casi blanco y la roca casi negra, y eso está en el archivo,
no hay que calcularlo. Y sus propias capturas confirman lo otro: **en el juego el
túnel de al lado también está pitch black.** Que la luz no llegue es lo que el
compilador horneó.

Lo que faltaba eran tres cosas, y ninguna es un sistema de iluminación:

**1. La llama. `Fire1.spr` puesto 55 veces, y no lo dibujábamos.** El charco de luz
en la roca ya estaba; la FUENTE era invisible. Se escribió el lector —
[src/bsp/sprite.js](../src/bsp/sprite.js), 23 cuadros de 48×64 en mezcla aditiva— y
ahora hay **57 antorchas** ardiendo, con cuatro desfases para que no arda el pueblo
entero al mismo compás.

**2. La rampa de gamma, que estaba baja.** Estaba en 2,2 —el máximo de contraste
según mi propio barrido— y al lado de sus capturas era demasiado oscuro. A **2,8**
la mediana del atlas sube de 117 a 138 y el contraste baja de 118 a 112: un 5 % de
contraste por una vista que pasa del **0,3 % al 41,3 %** de pantalla visible. Con la
referencia delante, el número deja de salir de un criterio inventado.

**3. El glow, que es mecánica de juego.** Ver más abajo.

Y queda una cuarta, que sí pediría salirse de los materiales de fábrica: **el
parpadeo**. Los estilos 1 y 6 son las dos luces titilantes de Half-Life y son los
9 405 bloques que hoy se hornean a valor pleno. Reproducirlo pide un atlas por
estilo y mezclarlos por fotograma.

#### Y los 19 ficheros que sí están

El hueco de los adornos era «101 `.mdl` y 58 `.spr` que no están dentro del
`.bsp`», y es verdad que no están dentro — pero **19 de los 21 están AL LADO**, en
`../MSC/assets/msr/`. Los dos que no: `glow01.spr`, que es del Half-Life base y se
sustituye por un degradado nuestro, y `b-tele1.spr`, que sigue faltando. O sea que no es un muro, es un lector por escribir, y la
regla del 02 se resuelve igual que con el mapa: se escribe el lector, lo extraído va
a `build/`, nada pasa a `public/`.

| fichero | veces | estado |
| --- | --- | --- |
| `sprites/Fire1.spr` | **55** | **leído y dibujado** |
| `sprites/Fire2.spr` | 2 | **leído y dibujado** |
| `sprites/glow01.spr` | 23 | no está en `../MSC/` |
| `sprites/b-tele1.spr` | 1 | no está en `../MSC/` |
| `models/misc/chair.mdl` | 27 | está, sin lector |
| `models/weapons/swords/p_swords.mdl` | 24 | está, sin lector |
| `models/props/wood_barrel1.mdl` | 14 | está, sin lector |
| y 12 `.mdl` más | 36 | están, sin lector |

**El `.mdl` es lo único grande que queda**, y ahora se sabe exactamente qué es: 17
ficheros, 101 colocaciones, y para un adorno no hace falta animación — la cabeza del
formato, los `bodyparts`, la malla con sus tiras y abanicos, y las texturas con su
paleta, que es otra vez el trabajo de `miptex.js`.

### El glow, y por qué AMPLÍA la respuesta en vez de relajarla

El visor lo lleva ahora, y se apaga con la **L**. Los números no se eligen a ojo,
salen del propio archivo: el color es el de `pi_lantern`, la única textura que
`info_texlights` declara emisiva —`"255 255 128 100"`, el mismo blanco de vela que
usa `light_environment`—, y el alcance son 6 m, entre la mediana medida del suelo a
su farol (3,8 m) y el p90 (10,6). El radio va al doble y la caída es lineal, que es
la lección del jharro: Three.js multiplica la luz de un punto por una ventana que a
nueve de cada diez metros del radio ya ha recortado el 96 %.

Lo que costó: el material del mundo pasa de `MeshBasicMaterial` a
**`MeshLambertMaterial`**. Y eso no relaja nada:

- Sigue siendo un material **de fábrica**, sin una línea de shader.
- Multiplica el mapa de luz **igual**: el factor π vive en `BRDF_Lambert`, así que
  la constante es la misma.
- Y ADEMÁS suma las luces de la escena, que es exactamente lo que hace el motor con
  sus luces dinámicas encima de la luz horneada.

O sea que la pila hace las dos cosas a la vez con lo que trae puesto, y eso es una
capacidad más, no una concesión. Lo que aporta, medido sobre las ocho vistas:

| | de media |
| --- | --- |
| Se ve, con el glow | **41,5 % de la pantalla** |
| Se ve, sin el glow — el mapa como lo horneó el compilador | **18,3 %** |

### Los otros cuatro fallos, y ninguno se ve en una captura

Van aquí porque son la parte transferible: los cuatro dan resultados **casi
correctos**, y los cuatro los cazó la misma cosa —exigir que los bloques del lump
de luz encajen sin solaparse—.

**1. La proyección se acumula en `float`, no en doble.** El compilador usa un
`vec_t`, que en ZHLT es un `float` de 32 bits. En el doble de JavaScript, una
coordenada que vale exactamente −3584 sale como −3583,999999999999, y
`ceil(−223,99999…/16)` devuelve **un luxel de más**. Pasaba en **951 de 14 527
caras**: parches un luxel más grandes de lo que el archivo guardó, o sea el mapa
de luz desplazado y mal escalado. `Math.fround` lo arregla y la suma pasa de
sobrar 29 577 bytes a cuadrar exacta.

**2. «Tiene mapa de luz» son DOS condiciones.** El aviso que traía la sesión era
`lightofs = −1 significa sin mapa de luz`, y se queda corto: además de las **137**
con `lightofs = −1`, hay **996 caras con un `lightofs` válido y los cuatro
`styles` a 255**. Ésas tampoco tienen luz, y su `lightofs` apunta al bloque de
otra cara. Leerlas no pinta negro —que se vería—: pinta cada una con la luz de una
vecina cualquiera.

**3. Hay que SUMAR los estilos.** «El bloque 0 es el estilo 0» es falso dos veces:
**2 795 caras tienen `styles[0] = 1`**, y hay **9 405 bloques más** de estilos 1 y
6 en caras que además llevan el 0. Leyendo sólo el primero se tira la luz de todas
las antorchas parpadeantes del mapa. La media del atlas sube de 24,9 a 30,5.

**4. El punto de llegada era el equivocado, y escribí que no existía.** El encargo
daba `ms_player_begin` medido en (−18, −87, −8) m. En la primera sonda filtré
`ms_player_begin|ms_player_spawn` juntos, imprimí los cuatro primeros, vi cuatro
`ms_player_spawn` y **escribí en el código que la otra clase no estaba en este
mapa**. Está: es la duodécima de doce, en (−18,1, −87,0, −8,4) m, exactamente las
coordenadas que tenía delante. Los once `ms_player_spawn` son sitios de
REAPARICIÓN, tres de ellos a 65 m de los otros ocho. Y la cota tampoco se adivina:
el `origin` de ese punto está **54 unidades sobre el suelo**, ni las 18 ni las 24
de las convenciones — se le pregunta al árbol BSP dónde está el suelo.

**5. El rayo del rumbo salía de dentro del jugador.** `castRay` con `solid=true`
desde dentro de un colisionador devuelve impacto a distancia CERO, así que las
veinticuatro direcciones empataban a cero y se quedaba con la primera: yaw 0. No
dio error, **dio el valor por defecto con pinta de calculado**, y la prueba de
marcha decía 1,6 m en doce segundos con el mundo perfectamente andable. Calculado
antes de crear la cápsula: 14,4 m.

Y CUATRO errores de sonda, que es peor que la proporción de siempre:

- **La sonda de la paleta estaba bien escrita para el fallo equivocado.** Exigía
  que ninguna textura fuera de un solo color y acusó a cuatro: `1white`, `black`,
  `yellow` y `sky`, que son de un solo color a propósito y lo dicen en el nombre.
  Una paleta mal leída no estropea cuatro de noventa y dos: estropea las noventa y
  dos. Lo que hay que exigir es la proporción, y el control está en la prueba, que
  rompe el desplazamiento a mano.
- **El histograma medía mi propio empaquetado.** Calculado sobre el atlas entero
  decía «la cubeta mayor se lleva el 59 %», y esa cubeta era el hueco negro que
  deja subir el alto a potencia de dos. Se mide sobre los parches.
- **El primer control del bobinado acusó al código bueno.** Decía: «un mapa sellado
  mira hacia dentro, así que desde fuera no se tiene que ver nada». Es falso: un
  mapa sellado de UNA cara visto desde 120 m de altura deja ver el interior de los
  suelos del fondo, que sí miran a la cámara. La sonda se encendía con el mundo
  perfectamente correcto.
- **Y el segundo medía la cosa equivocada con la sonda bien puesta.** Comparaba
  cara frontal contra trasera con la LUMINANCIA, y daba 9,8 % contra 7,3 % —no
  discriminaba— porque la sala es oscura de por sí y sus píxeles no pasan de 32
  mire la cara hacia donde mire. Con la vara buena —cuánta pantalla ES geometría
  iluminada— da 99,4 % contra 31,8 %.

Las cuatro son la misma lección con cuatro caras: **una sonda sin control dice que
sí, y una sonda con control pero mal escrita acusa a quien no es.** La proporción de
esta sesión es peor que la de la anterior, y el motivo es que aquí había una
referencia perfecta al lado y me fié de mis propias medidas antes que de mirarla.

### Lo que NO se reprodujo, y cuánto cuesta cada trozo

Son cinco huecos y **cuatro son de CONTENIDO que no está en el archivo**, no de
capacidad. Esto importa para la decisión de la parte 6.

#### 1. Los adornos: 101 modelos `.mdl` — HECHO

`env_model` coloca **101 adornos de 17 ficheros `.mdl`** que no están dentro del
`.bsp` pero sí al lado. Misma regla que con el mapa: se escribe el lector
—[`src/bsp/mdl.js`](../src/bsp/mdl.js)—, lo extraído va a `build/`, no se copia un
byte a `public/`.

**20 417 triángulos colocados**, en 37 grupos de material. Los 17 ficheros se leen
sin una excepción, y cada uno contra el oráculo que lleva dentro: `length` de la
cabecera tiene que valer el tamaño del fichero, y los comandos de triángulo tienen
que dar exactamente los `numtris` que declara cada malla.

Lo que hizo falta, que es menos de lo que parece: la cabecera, los `bodyparts` con
su submodelo elegido por el `body` de la entidad, la malla con sus tiras y
abanicos, las texturas con paleta —otra vez el trabajo de `miptex.js`— y la pose
de reposo de los huesos. **Nada de animación**: en el motor, `CalcBoneQuaternion`
parte de `pbone->value[]` y le suma lo que diga la secuencia; sin secuencia,
`value[]` ES la pose, que para un barril es la que se modeló.

##### La luz de un adorno no es el mapa de luz

Y esto decide si se ven puestos o pegados. En GoldSrc un `.mdl` **no lleva mapa de
luz**: se ilumina con `R_LightPoint`, que tira un rayo hacia abajo desde el origen
de la entidad y lee **un solo luxel**, el del suelo que tiene debajo. Ese color
multiplica el modelo entero.

Se reproduce sin salirse de los materiales de fábrica: se reserva un luxel por
adorno en el atlas que ya existía y todos los vértices de ese adorno apuntan al
mismo. El material sigue siendo `MeshLambertMaterial` con `map`, `lightMap` y
`uv1`, igual que la roca.

Y la diferencia se mide: **la luz del suelo de los 101 va de 12 a 196 sobre 255**,
con la mediana en 47. Un barril en la cueva sale oscuro y el mismo barril bajo una
lámpara sale claro.

##### EL BOBINADO, otra vez, y esta vez se cazó sin dibujar nada

**GoldSrc dibuja los modelos con `glCullFace(GL_FRONT)`** — al revés que el mundo.
Sin invertir el giro, los diecisiete ficheros daban el **100 % de sus triángulos
girando en contra de su propia normal**.

Y en pantalla eso no es un modelo invisible. Es un modelo **APOLILLADO**: la
silueta entera, reconocible, llena de agujeros. Se vio como moteado, y antes de
dar con ello se acusó al filtro de textura, a las UV, a los huesos y al mapa de
luz — cuatro sospechosos descartados uno a uno con la misma pareja de fotogramas
que ya usa el mundo (con textura / sin textura, con luz / sin luz).

Lo que lo cerró en un segundo no fue una captura: **el archivo trae una normal por
vértice, así que el sentido correcto es el que concuerda con ella.** Se cuenta en
`mallaDe()` y se devuelve en `contraNormal`, el extractor falla si pasa del 25 %, y
hay prueba con su sabotaje. Es el mismo error que costó una ronda entera con las
12 680 caras del `.bsp`, donde se leyó como oscuridad; aquí costó media hora
porque esta vez había dónde preguntar.

El umbral es el 25 % y no el 0 % por un caso real: `gaz_thoth_mutant_candle` tiene
**10 de sus 120** triángulos al revés y son la llama, modelada de dos caras a
propósito. Un bobinado invertido de verdad no da el 8 %, da el 100 %; entre los dos
no hay nada.

##### Lo que queda de los adornos

- **Los `body`**: los 24 `p_swords.mdl` traen `body` 4, 6, 16, 24 y 28, y cada uno
  es una espada distinta del mismo perchero. Se respeta con la fórmula del motor,
  `(body / base) % nummodels`. Cogiendo siempre el submodelo 0 salían las 24
  iguales — y un perchero con veinticuatro espadas iguales no llama la atención.
- **Sin animación y sin `chrome`**: ninguno de los 17 lo necesita para estar
  quieto, pero un personaje sí.
- **Sin colisión**: los adornos se atraviesan. El motor tampoco les da colisión a
  los `env_model` salvo que la entidad la pida, y en este mapa ninguno la pide —
  traen `mins`/`maxs` pero son para el recorte, no para andar encima.

#### 2. El cielo: `skyname nature1`, seis `.tga` que no están

GoldSrc dibuja una caja de seis imágenes que carga de `gfx/env/`. **El `.bsp` no
las lleva.** Lo que sí lleva es el color, en el `_light` de `light_environment`, y
con eso las 3 822 caras de `sky` —el **11,6 %** de la superficie— se pintan de un
color plano, sin niebla y sin mapa de luz.

Descartarlas, que fue lo primero que hice, deja agujeros negros de media pantalla
en cualquier vista al aire libre, y **un agujero negro se parece mucho a una
sombra**: la toma de la llegada marcaba el 0,0 % de pantalla visible y parecía un
problema de brillo.

Coste de cerrarlo: nada de código —Three.js tiene `CubeTexture`— y seis imágenes
que habría que generar, porque las del juego no se redistribuyen.

#### 3. Los estilos de luz no parpadean

Se suman y se hornean. Los **9 405 bloques** de estilos 1 y 6 son antorchas que
titilan, y titilar es animación en tiempo real: el motor suma cada cuadro el
bloque de cada estilo por el valor de su patrón. Reproducirlo pide **un atlas por
estilo y sumarlos en un shader**, que es precisamente lo único de este informe que
sí pediría material propio. Es el hueco más pequeño y el que menos se echa de
menos en un fotograma.

#### 4. Los modos de render — HECHO

Los 343 m² de los modos 1, 2, 4 y 5 se dibujaban opacos: los rayos de luz del
templo, los cristales y los faroles de pared. **Ya no.** Ver arriba, «los rayos de
luz eran un bloque macizo». Lo que sigue faltando de esta familia son los 23
`env_glow`, porque `glow01.spr` no está en `../MSC/`.

#### 5. Sin PVS: se dibuja el mapa entero

El lump de visibilidad son 114 184 bytes que no se usan. No es un hueco de calidad
—se ve exactamente igual— es margen de rendimiento que está sin coger, y a 0,94 ms
por fotograma no hace falta.

### Y el brillo, que no es un hueco de capacidad aunque lo parezca

Reproducido el formato al byte, Gate City sale **muy oscuro**: la media del atlas
es 30 sobre 255. Y está bien leído, lo dice el oráculo de los 2 126 793 bytes.

La diferencia con lo que enseña el juego no está en el mapa: **GoldSrc sube además
una rampa de gamma por hardware**, la del `cvar gamma`, que por defecto vale 2,5.
Eso es un ajuste de pantalla que el motor hace fuera del render, y en una pila de
navegador se pone donde se quiera.

Se aplica al hornear el atlas, en el orden del motor —modular por el overbright
×2 y DESPUÉS la rampa; al revés el p90 se sale de 255 y el mapa se quema por
arriba mientras la mediana parece correcta—. Y el valor **no se elige a ojo**:
`node tools/gatecity.mjs --gamma <x>` lo barre e imprime la pareja que decide.

| rampa | mediana | p10 | p90 | contraste |
| --- | --- | --- | --- | --- |
| 1 (sin rampa) | 47 | 11 | 115 | 105 |
| 1,6 | 88 | 35 | 156 | **121** |
| 2,2 | 117 | 60 | 178 | **118** |
| **2,8 ← la elegida** | **138** | 81 | 192 | 112 |
| 3,4 | 154 | 99 | 201 | 103 |

Se eligió 2,2 primero, porque es el máximo de contraste de esta tabla. Y estaba
mal, y lo dijo la referencia: **las capturas del juego original**, que trajo quien lo
jugó. En sus túneles de mina la roca alrededor de la antorcha se lee y el fondo es
negro; a 2,2 lo nuestro tenía las dos cosas negras. A 2,8 se pierde un 5 % de
contraste y una vista pasa del **0,3 % al 41,3 %** de pantalla visible.

El aviso del jharro —*arreglar la oscuridad de golpe la lava*— sigue valiendo, y por
eso no se subió a 3,4: ahí el contraste cae a 103 y el degradado de luz sobre la
roca se aplana. Lo que cambió no es el criterio, es que **ahora hay contra qué
comparar** en vez de un umbral inventado.

### La comparación al lado, que es lo que pedía la parte 4

Los mismos nueve fotogramas medidos del jharro, y los ocho de Gate City, con la
misma vara: qué fracción de pantalla pasa de 32 sobre 255.

| | el jharro | Gate City |
| --- | --- | --- |
| Vistas por encima del 85 % visible | **6 de 9** | **0 de 8** |
| Fracción de pantalla visible, recorrido | 1,7 – 99,9 % | 4,2 – 43,3 % |
| Brillo mediano, recorrido | 2 – 135 | 0 – 31 |
| Colores por vista, recorrido | 348 – 7 953 | 2 058 – 6 841 |
| Materiales en el mundo | **1** | **92** |
| Mapa de luz | 0 | 2,03 MB |
| Qué cambia al apagar la luz horneada | — (no hay) | **el 48 – 99,8 % de la pantalla** |

**Y ahí está el veredicto de quien lo jugó, convertido en cifra.** El jharro es más
claro y más parejo: seis de nueve vistas por encima del 85 %, con el brillo mediano
entre 83 y 135. Gate City tiene ocho vistas y ninguna llega ahí, porque **lo que
tiene es contraste**: hay sitios claros y sitios negros, y saber en cuál estás es
la mitad de lo que hace legible una cueva.

«Todo se ve casi 100 % igual» no era una queja de resolución. Era la descripción
exacta de un mundo con un material y cincuenta y ocho luces sin sombra.

La cifra que lo dice sola: **apagar el mapa de luz de Gate City cambia entre el
48 % y el 99,8 % de la pantalla.** En el jharro no hay nada que apagar.

Y una que no es del jharro y conviene anotar: esa misma cifra es la que delató el
bobinado. Antes del arreglo estaba entre el 3 % y el 86 %, y el 3 % no era un sitio
oscuro: era una pantalla sin geometría.

### Lo que se lleva al jharro (parte 7)

Las tres cosas están demostradas funcionando, y las tres ya estaban escritas en
`NEXT_SESSION.md` como los cuatro primeros puntos pendientes:

1. **Emitir la malla con grupos por textura.** `src/bsp/malla.js` lo hace con 92
   grupos y `src/render/bsp_escena.js` los dibuja con 92 materiales en **una sola
   geometría y 92 llamadas, a 0,94 ms por fotograma en software**. El objetivo del
   jharro es diez texturas para el 80 % de la superficie con la mayor por debajo
   del 30 %; hoy tiene una al 100 %. Las cifras del objetivo están ahora fijadas en
   una prueba, medidas del archivo.
2. **Hornear la luz.** El camino está entero: parches por cara, atlas
   empaquetado, segundo juego de UV, `lightMap` de fábrica. Lo que en el jharro
   cambia es sólo de dónde salen los luxels —oclusión por rayos contra nuestra
   propia malla en vez de leerlos de un archivo— y ahí Rapier ya sabe lanzar
   rayos. **El empaquetado, las UV, el atlas, el `+1`, el medio luxel y el
   material son reutilizables tal cual.**
3. **Subdividir las caras.** Gate City tiene la mediana en 0,47 m² y la mayor en
   427: detalle fino Y superficies grandes. El jharro está en 1,10 m² con todo
   igual. Aquí no hay nada que demostrar —subdividir un triángulo no es una
   capacidad— pero ahora la cifra objetivo está medida y comprobada.

Y una que no estaba en la lista y sale de mirar los fotogramas: **el reparto de
luz de Gate City tiene sitios negros a propósito.** Su peor rincón está a 43,7 m de
su farol y el punto de llegada es una cueva a oscuras. El jharro puso su peor
rincón a 18,7 m «para ser más regular que la referencia», y eso, visto al lado, es
parte de por qué se ve todo igual.

### Y lo que ninguna cifra vio, una vez más

Esta sesión lo tenía todo: 377 comprobaciones en verde, un oráculo de 2 126 793
bytes que cuadraba al byte, nueve fotogramas medidos y mirados uno a uno, y una
referencia perfecta al lado. **Y el mundo se atravesaba.**

De los seis fallos de esta sesión, cinco los cazaron las sondas. El que se llevó
por delante la conclusión entera lo cazó una persona andando el mapa un minuto, y
lo dijo en cuatro palabras: *muchas cosas parecen ser invisibles*.

El patrón vuelve a ser el de Corinth y el del jharro, y ya van tres:

- **Las pruebas cazan lo que sabe que puede fallar.** El mapa de luz tenía oráculo
  porque yo sabía que el mapa de luz era la parte difícil, y ahí los tres fallos
  cayeron enseguida. Del bobinado no sospechaba nada, así que no había sonda.
- **Mirar una captura no basta cuando tienes una explicación.** Miré la llegada,
  la vi negra, y tenía a mano la razón correcta de por qué debería estar oscura.
  Una explicación buena para el síntoma equivocado es más peligrosa que no tener
  ninguna.
- **La cifra estaba ahí.** «Apagar el mapa de luz cambia el 3 % de la pantalla» es
  imposible en una vista llena, y la imprimí en la consola ocho veces.

### Cómo se repite todo esto

```
npm run gatecity                 # extrae el .bsp a build/gatecity/ y mide
npm run gatecity -- --gamma 2.8  # con otra rampa
npm run gatecity:shot            # 8 fotogramas medidos + la prueba de marcha
npm run dev                      # y a andarlo:  ?map=gatecity
npm test                         # 379 comprobaciones, 49 de ellas del .bsp
```

### La regla del 02, y cómo quedó resuelta

**Ningún asset entra sin licencia al lado.** El `.bsp` es obra de DrKill y sigue
exactamente donde estaba, en `../MSC/assets/msr/maps/`.

- Lo nuestro es **el LECTOR**: `src/bsp/lector.js`, `miptex.js`, `luz.js`,
  `malla.js`, `nivel.js`, `tools/gatecity.mjs`, `tools/png.mjs` y
  `tools/gatecity_shot.mjs`. Vale para cualquier `.bsp` de GoldSrc y no contiene
  nada de este mapa. Es una herramienta, como `tools/kit.mjs` lo es para los
  `.glb`.
- Lo extraído va **entero a `build/gatecity/`**, con su `PROCEDENCIA.md`. `build/`
  está en `.gitignore`: no entra en el repositorio y no se publica.
- **Ni un byte pasa a `public/`.** El navegador lo sirve el servidor de desarrollo
  desde `build/`, y una compilación de producción no lo incluiría.

Lo que este proyecto se queda y puede usar es **la capacidad**. Y la capacidad
dice que sí.


---

<a id="parte-2"></a>

# Parte 2 · PROPUESTA_06

## ¿Qué es este proyecto ahora? — propuesta para decidir

**Esto es una propuesta, no un plan ejecutado.** La parte 5 del encargo del 06
pedía escribirla y presentarla, y eso es lo que hay aquí. Nada de lo que sigue
está hecho.

Quien dirige el proyecto lo planteó así:

> «a este punto creo que el experimento básicamente cambia de *port gatecity a
> three.js* a *port master sword rebirth a three.js test*. vemos que es posible
> hacer casi 1/1 con geometría y assets, casi seguramente da para la física,
> combat, etc.»

### 1. Qué cambia el criterio

Un visor tiene que **verse bien**. Un port tiene que poder **jugarse**. Es una
vara distinta, y mueve tres cosas de la columna «hueco aceptable» a la columna
«deuda»:

| hoy | como visor | como port |
| --- | --- | --- |
| los 101 adornos no tienen colisión | correcto: son decorado | **fallo**: se atraviesa una mesa |
| los 17 `.mdl` no tienen animación | correcto: son adornos quietos | **fallo**: no hay ni un NPC que se mueva |
| no hay PVS | margen sin coger | **sigue siendo margen**, ver abajo |
| un mapa suelto | el experimento era un mapa | **fallo**: no hay transición |

Y añade una vara nueva que hoy no existe: **el servidor**. Master Sword Rebirth
es multijugador cooperativo; su lógica de juego vive en el servidor
(`MasterSwordRebirth-Xash3D/src/`) y el cliente sólo dibuja. Un port a la web que
no decida eso desde el principio se lo encuentra después, y entonces es una
reescritura.

**Y una cosa que NO cambia.** La respuesta del 05 —«la pila llega»— sigue en pie
y hoy está mejor sostenida: el mapa se dibuja entero, con luz horneada, 100
materiales, adornos, carteles, una segunda pasada de detalle y una caja de cielo,
en **0,94 ms por fotograma con renderizado por software y sin GPU**. Lo que ha
cambiado es que ahora hay un juez que lo comprueba contra los archivos, y hacía
falta: sin él llevábamos dos sesiones sin mapa de luz con las 397 comprobaciones
en verde.

### 2. Qué hace falta, en orden, y lo que cuesta

Las estimaciones están calibradas contra lo que ya costó lo hecho, que es la
única referencia honesta que hay. Una **sesión** es lo que costó, por ejemplo, el
lector de `.mdl` completo con sus 17 ficheros y sus dos oráculos.

#### Bloque A — cerrar la fidelidad de un mapa (1 sesión)

| | coste | por qué primero |
| --- | --- | --- |
| **El parpadeo de los estilos 1 y 6** | ⅔ sesión | Medido en el 06: el 63 % de la superficie iluminada, 28 bytes de recorrido en pantalla, diez veces por segundo. Es lo único de todo el mapa que pide salirse de los materiales de fábrica, y es el candidato número uno del contraste local que falta. |
| **Una captura del juego con el `glow` apagado** | 5 min de quien lo juega | Vale más que las tres cosas de abajo juntas. |
| **Las `dlight` de las antorchas** | ⅓ sesión | `R_AddDynamicLights`. Con el parpadeo ya hecho, el mecanismo es el mismo. |

Comparable a lo hecho: el mapa de luz completo (atlas, empaquetado, UV, gamma del
motor) costó una sesión larga.

#### Bloque B — que se pueda jugar un mapa (2 sesiones)

| | coste | notas |
| --- | --- | --- |
| **Colisión de los adornos** | ¼ sesión | `hull` del `.mdl`, o la caja del `bodypart`. Rapier ya tiene el mundo; añadir 101 cuerpos estáticos es barato. |
| **Animación de `.mdl`** | **1 sesión y media** | Es el trozo grande y está acotado: `seqdesc`, `anim`, los `bones` con su jerarquía y los canales comprimidos de 16 bits. El lector ya saca huesos y mallas; falta el muestreo por fotograma y el skinning. **Esto es lo que convierte el port en algo que se mueve.** |
| **Un segundo mapa y su transición** | ½ sesión | El lector vale para cualquier `.bsp` de GoldSrc sin tocarlo. Lo que no está es `trigger_changelevel` y la cadena de carga. **Es la prueba de que lo hecho es un LECTOR y no un mapa.** |

Comparable: el lector de `.mdl` sin animación costó una sesión. La animación es
más, pero el formato ya está descifrado y tiene el mismo tipo de oráculo dentro.

#### Bloque C — que sea un juego (sin estimar, y a propósito)

Física de jugador con los valores de `pm_shared`, combate, inventario, NPC,
servidor. **No se estima porque no se ha medido nada de eso**, y este proyecto ya
tiene el escarmiento de dar por buena una estimación que salía de un
razonamiento. La única cifra que hay es del lado bueno: el código del mod está
al lado y es legible.

#### Lo que NO va en la lista, y por qué

- **PVS.** 114 184 bytes que GoldSrc usa y nosotros no, y **no hace falta**: el
  mapa entero se dibuja en 0,94 ms sin GPU. Cogerlo es optimizar lo que sobra.
  Vuelve a la lista el día que haya diez mapas cargados a la vez o un móvil
  midiendo mal.

### 3. Qué NO se va a hacer

Media propuesta honesta es la lista de lo que se descarta.

- **No se va a redistribuir un solo byte del juego.** La regla del 02 no se
  relaja por cambiar de nombre el proyecto. Sigue siendo: se escribe el lector,
  lo extraído va a `build/`, nada pasa a `public/`, y lo que no se puede leer se
  genera y se dice en `PROCEDENCIA.md`. **Un port que hay que jugar con el juego
  original instalado al lado es un port legítimo; uno que se descarga con los
  assets dentro, no.** Esto acota lo que el proyecto puede llegar a ser, y es un
  límite elegido, no una limitación.
- **No se va a portar el motor.** Xash3D ya existe, funciona y está compilado
  ahí al lado. Lo que se reproduce es el resultado, leyendo el motor para saber
  qué hace — que es lo que ha convertido esto en algo medible.
- **No se van a portar los 40 y pico mapas.** Uno demuestra el lector; dos
  demuestran la transición; el resto es tiempo de máquina.
- **No se va a hacer el multijugador todavía**, y no por difícil: porque decidir
  la arquitectura cliente-servidor antes de tener un jugador que se mueva bien es
  decidir sin datos.
- **No se toca el jharro ni Corinth ni los experimentos 01 y 02.** Siguen
  congelados. Lo que el jharro se lleve de aquí es método, no código.

### 4. Dónde vive

**Recomendación: se separa, y se lleva poco.**

`Mydra Web Lab` es un laboratorio de experimentos con un hilo común —ver qué da
de sí la pila— y sus artefactos son Corinth y el jharro: **mundos generados**. El
port es lo contrario: **un mundo leído**. Comparten la pila y no comparten la
pregunta, y ya se nota en el repositorio —`src/bsp/` no toca nada de `src/kit/`,
`src/map/` ni `src/render/scene.js`—.

Lo que se llevaría, y ya está separado:

```
src/bsp/*            lector de .bsp, .spr, .mdl, .tga, gamma del motor, árbol BSP
src/render/bsp_escena.js
src/play/player.js   la física, que es común
tools/gatecity*.mjs, tools/juez_luz.mjs, tools/quecara.mjs, tools/mirar.mjs,
tools/comparar.mjs, tools/png.mjs
test/bsp*.test.mjs
```

Lo que se queda: `src/kit/`, `src/map/`, `tools/plano*.mjs`, `tools/roca.mjs`,
Corinth y el jharro enteros.

**Y lo que se lleva sin ser código, que es lo que de verdad vale:** el método.
Cada sonda con su control positivo; un cero sin control no es un resultado; la
referencia manda sobre el razonamiento; y la de esta sesión — **un dato bien
calculado que nadie lee no da error**.

Si la decisión es no separarlo, lo que hay que hacer igualmente es dejar de
llamarlo «experimento 05/06» y darle su propio `README` y su propia lista de
pendientes, porque hoy su estado vive repartido entre cuatro documentos de otro
proyecto.

### 5. Lo que hay que decidir, en tres preguntas

1. **¿Se separa el repositorio?** Recomendación: sí, con la lista de arriba.
2. **¿Bloque A antes que B, o al revés?** Recomendación: A primero, porque es una
   sesión y cierra la pregunta del 05 con todo medido; y porque una captura del
   juego con el glow apagado puede llegar mientras tanto.
3. **¿La animación de `.mdl` o un segundo mapa como lo siguiente grande?**
   Recomendación: **el segundo mapa primero**, aunque sea el más pequeño de los
   dos. Cuesta media sesión, y es la prueba de que lo escrito es un lector
   general y no un port de Gate City con otro nombre. Si esa prueba falla, es
   mucho mejor saberlo antes de gastar sesión y media en animación.


---

<a id="parte-3"></a>

# Parte 3 · EVALUACION_09

## Los scripts de MSR y el personaje: qué hay de verdad, y qué haríamos con ello

> Esto es una **evaluación**, no un plan ejecutado. Todo lo de abajo está medido
> sobre `../MSC/` — los 2 884 scripts y las 159 191 líneas de C++ del mod — y no
> se ha escrito ni una línea de intérprete.

---

## Parte 1 · El lenguaje de scripts

### Lo que es, en cifras

| | |
| --- | --- |
| Scripts | **2 884** |
| Líneas | **284 088** |
| Órdenes distintas usadas | **298** |
| Funciones `$` distintas usadas | **89** (el motor registra 139) |
| El intérprete en C++ | **14 453 líneas** (`script.cpp` 6 242 + `scriptcmds.cpp` 7 705) |
| Operadores de comparación | **12** |

Para comparar: **el mod entero son 159 191 líneas de C++**, y el intérprete de
scripts es el 9 % de eso. El contenido que ese intérprete ejecuta es casi el
doble de líneas que todo el C++ del juego.

### Tenías razón en lo de «varios lenguajes mezclados». Son tres capas

No es una impresión: son tres sistemas distintos que conviven en el mismo
fichero, y cada uno se resuelve en un momento distinto.

**1. Un preprocesador**, que corre al CARGAR y no al ejecutar. Lo hace
`script.cpp` a mano, con `_stricmp` encadenados:

```
##include   #scope   const   const_ovrd   removeconst   setvar   setvard
setvarg    eventname   precache   setmodel   setpmodel   setviewmodel
setworldmodel   setshield   attachsprite   say   repeatdelay   svsound.play3d
```

`#include` además lleva **ámbito**: `#include [server] monsters/base_npc`. Si no
se entiende el prefijo, el cierre de dependencias sale corto y no avisa — me
pasó al medir, y las 49 dependencias de Gate City salieron 43.

**2. Doscientas veintidós órdenes de ejecución** en un hash
(`m_GlobalCmdHash`), de las que **154 se usan y 68 no las usa nadie**.

**3. Un vocabulario DECLARATIVO por tipo de entidad**, que cada clase de C++
registra por su cuenta: **65 campos para un NPC** (`npcscript.cpp`) y **45 para
un objeto** (`genericitem.cpp`), 96 distintos en total. Son cosas como `hp`,
`width`, `race`, `roam`, `wearable`, `quality`, `registerattack`. No son
órdenes: son propiedades de una ficha.

Y encima de todo eso, **hay dos sintaxis de `if` vivas a la vez**, y el propio
código las llama así:

```c
m_GlobalCmdHash["if"]   = ... ScriptCmd_If;   // The old if
m_GlobalCmdHash["if()"] = ... ScriptCmd_If;   // The new if
```

No se puede elegir una: en el corpus hay **13 096 del nuevo y 9 804 del viejo**.

### La cifra que decide, y no es la que parece

La tentación es «implemento las 20 órdenes más usadas y cubro el 80 %». Eso es
verdad **por líneas** y es inútil **por scripts**, porque un script con una sola
orden que no entiendo no corre.

| vocabulario | scripts que corren ENTEROS | líneas cubiertas |
| --- | --- | --- |
| 10 órdenes | 419 de 2 884 (14,5 %) | 69,0 % |
| 20 | 707 (24,5 %) | 78,6 % |
| 50 | 1 129 (39,1 %) | 91,8 % |
| **68** | **1 442 (50,0 %)** | **95,2 %** |
| 100 | 2 026 (70,2 %) | 98,1 % |
| **120** | **2 324 (80,6 %)** | 99,0 % |
| 200 | 2 770 (96,0 %) | 99,9 % |
| 298 | 2 884 (100 %) | 100 % |

**Con el 95 % de las líneas cubiertas sólo corre la mitad de los scripts.** La
cola larga no es opcional si lo que se quiere es ejecutar el contenido: 112
órdenes se usan cinco veces o menos, y 51 se usan **una sola vez** — y cada una
de esas bloquea su script entero.

### Y la cifra práctica: sólo los bichos de Gate City

| | |
| --- | --- |
| Scripts que las 69 entidades nombran | 25 |
| Cierre por `#include` | **49 ficheros, 14 399 líneas** |
| Órdenes distintas que hacen falta | **129** |
| Funciones `$` distintas | **47** |

Ciento veintinueve de 298. **No es un subconjunto pequeño**: es el 43 % del
lenguaje para hacer andar un pueblo y unas cuevas.

### Las tres salidas, y cuál recomiendo

#### A. Escribir el intérprete, fiel

Se escribe `CScript` en JavaScript: el preprocesador, el hash de órdenes, los
doce operadores, las dos sintaxis de `if`, las funciones `$`. Los scripts se
leen de `../MSC/` y no se copian, igual que el `.bsp`.

**A favor:** es la regla del 02 aplicada tal cual —el intérprete es nuestro, el
contenido no— y funciona para los 2 884 scripts, no sólo para los que yo elija.
El contenido de MSR pasa a estar disponible entero.

**En contra:** son 14 453 líneas de C++ que traducir, y el corpus es el juez, o
sea que hay que ejecutarlo para saber si está bien. Y hay partes que no son
lenguaje sino **motor**: `$cansee` necesita trazado de rayos, `callevent` del
lado servidor necesita entidades con red, `menuitem.register` necesita interfaz.

#### B. Traducir los scripts a datos, sin intérprete

Una herramienta lee los `.script` y emite JSON/JS con el comportamiento ya
resuelto. Es lo que ya hace `src/bsp/script.js` para las fichas de NPC.

**A favor:** lo caro se hace una vez, fuera del navegador, y el resultado se
puede mirar.

**En contra:** **no funciona, y esto lo sé medido.** El lenguaje tiene
`setvard`, `$rand()`, `if` sobre estado en tiempo de ejecución y `callevent`
recursivo con 22 174 asignaciones dinámicas. Un traductor que resuelva eso es un
intérprete con otro nombre, sólo que sin bucle. Sirve para las FICHAS —lo que
ya hacemos— y no para el comportamiento.

#### C. No portar el comportamiento: escribir el nuestro

Se conserva lo que ya está —modelos, animaciones, fichas, colocación— y la IA,
el combate y los objetos se escriben de cero contra las cifras que el archivo
declara (`hp`, `width`, `roam`, el daño de cada arma).

**A favor:** es lo más rápido con diferencia, y es lo que permite **mejorar**,
que es la mitad de lo que preguntas en la parte 2.

**En contra:** deja de ser un port. Y las 284 088 líneas de contenido —tiendas,
diálogos, misiones, hechizos— se quedan fuera.

#### Lo que recomiendo

**C para empezar, con la puerta abierta a A.** Y la razón es una medida, no un
gusto: el subconjunto mínimo para los bichos de Gate City son **129 órdenes**, y
eso ya es la mitad del trabajo de A sin ninguna de sus ventajas — no desbloquea
el resto del contenido y sí cuesta casi lo mismo.

Si algún día se quiere el contenido entero, A es el camino y hay que hacerlo
completo. Hacer A «un poco» es el peor de los tres.

Lo que sí conviene hacer **ya**, cueste lo que cueste después, es **seguir
leyendo los scripts como datos**: `src/bsp/script.js` saca modelo, animaciones,
piel, vida, tamaño y velocidad de los `.script` reales, y eso vale para las tres
salidas.

---

## Parte 2 · El personaje: estadísticas, habilidades y HUD

### Lo bueno: el sistema es pequeño y está todo declarado

No hay que adivinarlo. Está en 547 líneas de `shared/stats/`.

**Seis atributos** (`statdefs.h`, con los comentarios del autor):

| | | |
| --- | --- | --- |
| Strength | `NATURAL_STR` | cuánto cargas, y regeneras aguante |
| Agility | `NATURAL_DEX` | cuánto corres, y cuántas armas manejas |
| Concentration | `NATURAL_CON` | cuánto te concentras |
| Awareness | `NATURAL_AWR` | cuánto te enteras del entorno |
| Fitness | `NATURAL_FIT` | cuánta vida tienes |
| Wisdom | `NATURAL_WIS` | los hechizos cuestan menos |

**Nueve habilidades**, y cada una con **tres propiedades** —velocidad, equilibrio
(puntería) y potencia (daño)— **cada una con su propia experiencia**:

```
Swordsmanship   Martial Arts   Small Arms   Axe Handling   Blunt Arms
Archery         Spell Casting  Parry        Pole Arms
```

`Parry` tiene una sola propiedad y `Spell Casting` tiene cinco en vez de tres:
**fuego, hielo, rayo, adivinación y aflicción**.

**La curva de experiencia es una línea de código**, no una tabla:

```c
long double GetExpNeeded(int StatValue) {
    return pow(1.248, StatValue) * (4.0 * StatValue);
}
```

Con topes de **300** para un atributo y **100** para una propiedad.

Y **se sube usando**, no gastando puntos: la experiencia va a una propiedad de
la habilidad con la que golpeaste. Eso es una decisión de diseño de MSR que hay
que respetar o cambiar a propósito, no por descuido.

**Razas con relaciones**, en `races.cpp`: cada raza tiene aliados, enemigos y
«recelosos» (`Wary`), y la relación se consulta en las dos direcciones —una raza
puede desconfiar de otra sin reciprocidad. Es lo que decide si un goblin te
ataca.

### El inventario, y por qué tu idea de Diablo encaja mejor de lo que parece

MSR guarda **hasta 100 objetos** en una lista (`NUM_MAX_ITEMS 100`) y **dos
manos** (`MAX_PLAYER_HANDS 2`). No hay rejilla, no hay peso por casilla: es una
lista con un panel VGUI.

Y los objetos ya traen los campos que una rejilla necesita, porque el formato
los declara: **`value`** (464 objetos lo declaran), **`quality`**,
**`wearable`**, **`groupable`** (apilable), **`useable`**, y los `register*` que
dicen qué ES la cosa — ataque, armadura, proyectil, hechizo, contenedor, bebida.

Los 861 objetos **heredan**: 789 de ellos hacen `#include` de una base
(`base_ticket` 139 veces, `base_miscitem` 93, `proj_arrow_base` 75). O sea que
el catálogo real son unas pocas plantillas y muchas variantes de datos — que es
exactamente la forma que quiere una tabla de objetos moderna.

**Conclusión honesta: la rejilla tipo Diablo no choca con nada.** Lo que MSR
tiene es una lista porque VGUI de 2002 daba para una lista. Los datos soportan
una rejilla sin inventarse un solo campo.

### El HUD y los paneles

Unos veinte paneles VGUI, **7 298 líneas** en `client/ui/ms/`: elegir personaje,
estadísticas, contenedores, tienda (comprar, vender, principal), mover objetos,
opciones, ranuras rápidas, aparición.

Y los scripts pueden tocar el HUD: `hud.addstatusicon`, `hud.addimgicon`,
`hud.quickslot`, `hud.desctext`, `sethudsprite` (512 usos). O sea que **parte
del HUD es contenido, no interfaz**: un veneno añade su icono desde su script.
Si rehacemos el HUD, esa es la parte que hay que decidir qué hacemos con ella.

### Qué es barato y qué es caro, si lo hacemos

**Barato, y no depende del intérprete:**

- Los **seis atributos, las nueve habilidades con sus tres propiedades y la
  curva de experiencia**. Son datos y una fórmula; caben en un fichero.
- La **hoja de personaje** y el **inventario en rejilla**. Es interfaz web, que
  es donde esta pila es más fuerte que VGUI, no más débil.
- La **creación de personaje**: MSR guarda nombre, género, raza y `body`, y poco
  más. Aquí sí se puede hacer algo mejor sin romper nada.
- Las **relaciones entre razas**, que son 67 líneas.

**Caro, y sí depende:**

- Que un arma **haga** lo que dice su script. `registerattack` es una orden del
  intérprete, y detrás hay 129 órdenes más.
- Las **tiendas**: 1 540 `addstoreitem` en el corpus, y 11 sólo en Gate City.
- Los **hechizos**, que tienen su propio subsistema de cinco escuelas.

### La tensión que hay que decidir, y es tuya

Dijiste que un port no tiene por qué ser 100 % fiel, y aquí es donde eso deja de
ser teórico. **Si mejoramos el inventario y la hoja de personaje, dejan de
casar con los scripts de MSR**: un objeto que el script coloca en la mano 1 y
nuestra rejilla coloca en una casilla ya no es el mismo objeto.

Las dos cosas se pueden hacer, pero no a la vez sin decidir cuál manda:

- **Manda el script** → el inventario es una lista de 100 con dos manos, y lo
  que mejoramos es cómo se ve.
- **Manda nuestro diseño** → los objetos son nuestra tabla, alimentada por un
  lector de `.script` que saca nombre, modelo, valor, calidad y tipo, y el
  comportamiento lo escribimos.

Yo recomiendo **la segunda**, por lo mismo que la salida C: es lo que deja
mejorar, y es coherente con no escribir medio intérprete.

---

### Lo que NO he medido, y conviene saberlo

- **El lado cliente del scripting** (`hudscript.cpp`) lo he contado pero no
  leído. Puede que el HUD dependa de scripts más de lo que parece aquí.
- **Cuántas de las 129 órdenes de Gate City son fáciles.** Sé cuáles son y
  cuántas veces se usan; no he mirado qué hace cada una por dentro. Esa cuenta
  cambiaría el coste de la salida A y no la he hecho.
- **Los hechizos**, más allá de que son cinco escuelas.
- **Si el corpus corre hoy en el port a Xash3D.** Doy por hecho que sí porque el
  port es funcional, pero no lo he comprobado.

### APÉNDICE · Cómo se crea un personaje en MSR, del código y no de una captura

La página de moddb devuelve **403** y no la he podido leer. Da igual: la
creación de personaje está entera en `sv_character.cpp` y en `global.script`, y
eso es mejor autoridad que una captura.

`CBasePlayer::CreateChar()` recibe **nombre, género y el arma elegida**. La raza
se escribe a fuego —`strncpy(Data.Race, "Human", ...)`— y el propio código la
marca `// LEGACY`. O sea que **en MSR no eliges raza**: las razas existen para
los monstruos y sus relaciones, no para el jugador.

Y entonces:

1. **Un punto a cada habilidad.** A las de arma, en POTENCIA; a `Parry`, en su
   única propiedad; a `Spell Casting`, uno en **cada una de las cinco escuelas**.
2. **Cuatro objetos gratis**, de `global.script`:
   `sheath_belt_holster`, `sheath_back`, `sheath_dagger`, `pack_sack` — o sea
   tres vainas y una mochila. Los vestibles se equipan solos.
3. **Diez de oro.**
4. **Un arma elegida entre siete**, a la mano derecha. Y la lista es exactamente
   una por habilidad:

| elección | habilidad |
| --- | --- |
| `swords_rsword` | Swordsmanship |
| `bows_treebow` | Archery |
| `smallarms_rknife` | Small Arms |
| `axes_rsmallaxe` | Axe Handling |
| `blunt_hammer1` | Blunt Arms |
| `polearms_qs` | Pole Arms |
| `magic_hand_lightning_weak` | Spell Casting |

La octava habilidad, **Martial Arts, no tiene entrada**: empezar sin arma *es*
elegirla. Y el arma elegida puede ser un hechizo, que el código trata aparte
(`LearnSpell` en vez de `AddItem`).

Todo eso son **cuatro líneas de configuración en un script**, no código. Si
cambiamos la lista o el oro de partida, es un dato.

---

## Parte 3 · El almacenamiento de personajes

### MSR ya tenía tres sitios, y eso contesta media pregunta

```c
enum charloc_e { LOC_CLIENT, LOC_SERVER, LOC_CENTRAL };
```

- **`LOC_CLIENT`** — el personaje vive en el disco del jugador y se **sube** al
  servidor al entrar.
- **`LOC_SERVER`** — vive en el disco del servidor.
- **`LOC_CENTRAL`** — vive en una cuenta remota, con JSON sobre HTTP y el
  SteamID como identidad (`CreateCharacterReq.cpp`, `LoadCharacterReq.cpp`).

O sea que **la pregunta de dónde se guarda ya estaba resuelta como «en los tres,
y el juego no lo sabe»**. El resto del código habla con `charinfo_t`, no con un
fichero. Eso es lo que hay que copiar, y es lo único de esta parte que copiaría
sin pensarlo.

### El formato, que está bien pensado y hay que robárselo

El fichero es una **cabecera de tamaño fijo y luego trozos con etiqueta**:

```
CHARDATA_HEADER1        savedata_t entero (unos 270 bytes, empaquetado a 4)
CHARDATA_MAPSVISITED1   int n + n cadenas
CHARDATA_SKILLS1        por estadística: cuántas propiedades, y por cada una
                        valor (short) + experiencia (int)
CHARDATA_SPELLS1        n cadenas
CHARDATA_ITEMS2         el equipo
CHARDATA_STORAGE1       almacenes con nombre, cada uno con sus objetos
CHARDATA_COMPANIONS1  CHARDATA_HELPTIPS1  CHARDATA_QUESTS1  CHARDATA_QUICKSLOTS1
CHARDATA_UNKNOWN        «If >= CHARDATA_UNKNOWN, then skip it?»
```

Dos decisiones ahí que valen para nosotros:

1. **Versión en la cabecera**, y la usan de verdad: `SAVECHAR_VERSION_MSC 11`
   para los personajes de Master Sword Classic y `12` para Rebirth, con un
   camino de compatibilidad para leer los viejos
   (`if (Version == SAVECHAR_VERSION_MSC && i == SKILL_SPELLCASTING)`). Un
   personaje de hace quince años todavía carga.
2. **Trozos que se pueden saltar.** Si aparece una etiqueta desconocida, se
   ignora. Añadir algo nuevo no rompe los guardados de antes.

Un personaje entero es del orden de **unos pocos KB**. Eso importa para lo de
abajo: caben miles en cualquier almacén del navegador.

### Lo que recomiendo para nosotros, y lo que hay que temer

**Sí, local para empezar.** Pero con tres cosas decididas desde el primer día,
porque las tres son caras de añadir después.

#### 1. IndexedDB, no `localStorage`

`localStorage` son 5–10 MB, es síncrono —bloquea el bucle de dibujo— y sólo
guarda texto. IndexedDB tiene cuota de verdad, es asíncrono y guarda objetos.
`localStorage` se queda para las preferencias del visor.

#### 2. Y hay que decir en voz alta que **el almacén del navegador se puede borrar**

Esto es lo que de verdad hay que temer, y no es una posibilidad remota:

- El navegador **puede desalojar** los datos si le falta espacio, salvo que se
  pida `navigator.storage.persist()` — y aun concedido, no es una promesa
  absoluta.
- «Borrar datos de navegación» se lo lleva **todo**, y el jugador lo hace por
  otros motivos.
- Es **por origen y por navegador**: el personaje no existe en otro equipo, ni
  en el mismo equipo con otro navegador, ni en una ventana privada.

Por eso **exportar e importar un personaje a fichero no es un extra, es la copia
de seguridad**, y tiene que estar desde el principio. Un `.json` que el jugador
se descarga y arrastra de vuelta.

#### 3. El juego no habla con el almacén: habla con un ALMACÉN

Una interfaz de cuatro operaciones —listar, leer, escribir, borrar— con dos
implementaciones: la local ahora y la remota cuando haya servidor. Es
exactamente lo que MSR consigue con `charloc_e`, y lo que permite que «pasar a
cuentas en la nube» sea escribir una clase y no tocar el juego.

Y el registro, un documento suelto con **identidad, versión y fecha**, que se
pueda mandar por la red tal cual:

```json
{ "id": "...", "version": 1, "actualizado": "2026-09-26T…",
  "nombre": "...", "genero": "...", "oro": 10,
  "estadisticas": { … }, "habilidades": { … },
  "objetos": [ … ], "almacenes": { … }, "mapasVisitados": [ … ] }
```

Con **una regla prestada de MSR: al leer, lo que no se entienda se conserva y se
vuelve a escribir tal cual.** Así una versión vieja del juego no le borra a un
personaje lo que una nueva le añadió.

#### Lo que NO recomiendo todavía

Montar cuentas, servidor o sincronización ahora. No hay multijugador, no hay
nada que sincronizar, y el diseño de arriba deja esa puerta abierta sin coste.

### Propuesta de siguiente hito, si te parece

**La hoja de personaje y el inventario, con los datos reales del archivo y sin
intérprete.** Concretamente: leer los seis atributos, las nueve habilidades y la
curva de experiencia del C++; leer el catálogo de objetos de los 861 `.script`
con su herencia resuelta —nombre, modelo, valor, calidad, tipo, apilable,
vestible—; y montar la hoja y la rejilla.

Es la parte barata de todo lo que has pedido, no compromete ninguna de las tres
salidas del intérprete, y al acabar hay algo que se toca.


---

