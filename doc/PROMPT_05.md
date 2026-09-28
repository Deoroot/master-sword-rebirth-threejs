# Experimento 05 — reproducir Gate City

Lee `NEXT_SESSION.md` y `README.md` de Mydra Web Lab. El jharro está en pie, se
anda en `?map=jharro` y hay 330 comprobaciones en verde. **Esta sesión cambia de
pregunta.**

El jharro reprodujo las PROPORCIONES de `gatecity.bsp` con fidelidad —siete de
ocho percentiles de altura libre, las dos densidades de luz, el 43 % de zona
segura— y quien lo jugó dijo: **«todo se ve casi 100 % igual, y bastante inferior
al `.bsp`»**. Tenía razón, y la medida lo confirmó:

| | Gate City | el jharro |
| --- | --- | --- |
| Texturas en superficie | **80** | **1** |
| Para cubrir el 80 % de la superficie | 10 texturas | 1 |
| Área de cara, mediana | 0,47 m² | 1,10 m² |
| Mapa de luz horneado | **2,03 MB** | 0 |
| Adornos | 101 modelos + 58 sprites | 0 |

Así que la pregunta deja de ser «¿se parece?» y pasa a ser la única que de verdad
importa ahora:

> **¿Es capaz nuestra pila —Three.js, Rapier, Node— de poner en pantalla lo que
> ese `.bsp` pone en pantalla?**

**De nada vale inspirarse en una referencia si no se puede alcanzar su calidad.**
Si la respuesta es que no, hay que saber exactamente DÓNDE se rompe y cuánto
cuesta cada trozo. Y si es que sí, entonces lo que le falta al jharro es trabajo,
no herramientas — y eso es una noticia completamente distinta.

Es además el mejor banco de pruebas posible: hay una referencia perfecta. Cada
fallo se ve al lado de lo que debería ser.

## La regla del 02, y cómo se resuelve aquí

**«Ningún asset entra sin licencia al lado»**, y el `.bsp` es obra de DrKill. Esto
no se relaja. Lo que se hace es distinguir dos cosas que se parecen y no lo son:

- **Escribir un LECTOR es nuestro.** Un visor de `.bsp` es una herramienta, como
  `tools/kit.mjs` lee `.glb` y `tools/bsp.mjs` ya lee este mismo archivo. El
  código, el decodificador de texturas, el empaquetador de mapas de luz y el
  emisor de geometría son del proyecto y valen para cualquier mapa.
- **Copiar el CONTENIDO no.** El `.bsp` se queda donde está, en
  `../MSC/assets/msr/maps/`. No se copia a `public/`, no se mete en el repo y no
  se redistribuye nada sacado de él.

En concreto: **todo lo que se extraiga va a `build/gatecity/`**, que es donde van
todos los artefactos locales del proyecto y no forma parte de lo que se publica.
Si el navegador necesita servirlo, se le da una ruta del servidor de desarrollo
apuntando a `build/`, no se mueve un byte a `public/`. Y conviene añadir un
`.gitignore` con `build/` y `node_modules/`, que hoy no existe.

Lo que sale de esta sesión y SÍ es nuestro para usar: la capacidad. Emitir malla
con varias texturas, hornear luz, subdividir caras. Eso se lleva al jharro.

## Lo que ya está hecho y no hay que volver a escribir

`tools/bsp.mjs` ya lee el archivo y mide. En concreto ya resuelve:

- las cabeceras y los quince lumps (`leerBsp`);
- los modelos, el 0 es el mundo y los otros 316 son entidades con brushes
  (`leerModelos`);
- las entidades como texto clave/valor, con `origin()` (`leerEntidades`);
- los nombres y tamaños de las 92 texturas, todas incrustadas (`leerTexturas`);
- **y las caras ya salen como polígonos** (`leerCaras`): índice de plano, el
  volteo por `side`, el recorrido de `surfedges` → `aristas` → `vertices` con el
  signo negativo invertido, el área y el índice de `texinfo`.

O sea que la geometría del mundo **ya se extrae**. Lo que falta para dibujarla es
lo de abajo.

También está: `src/map/level.js` define la forma de un nivel y
`src/render/scene.js` ya construye una malla con **un grupo de índices por
textura** y varios materiales — que es exactamente la forma que pide un `.bsp`. Y
`src/main.js` ya sabe cargar un nivel sin `.map` y sin worldspawn, porque el
jharro se lo enseñó.

## Las partes

**Esta sesión toma de la 1 a la 4.** Sin la 4 no se ve nada, y sin ver nada la
sesión no contesta su pregunta. La 3 es la que puede comerse el día: si se come
el día, se dice y se para ahí.

### Parte 1 — El lector, de medir a extraer

`leerCaras` devuelve puntos y área. Para dibujar hacen falta dos cosas más del
mismo sitio:

- **`texinfo` entero**, que son 40 bytes: el vector S en 0..15 (xyz + offset), el
  vector T en 16..31, `miptex` en 32 y `flags` en 36. La UV de un vértice es
  `(p·S + offS) / ancho` y `(p·T + offT) / alto`. Sin esto no hay textura.
- **`styles[4]` y `lightofs` de la cara**, que están en los bytes 12..15 y 16..19
  de su estructura de 20. `lightofs` es el desplazamiento dentro del lump de luz,
  y **vale −1 cuando la cara no tiene mapa de luz**.

Comprobable en Node sin gráficos, y contra cifras que ya están medidas: **12 680
caras en el mundo, 32 887 m² de superficie, 317 modelos**.

### Parte 2 — Las texturas: 92, incrustadas y en 8 bits

Un `miptex` de GoldSrc es un nombre de 16 bytes, ancho y alto, cuatro
desplazamientos a los cuatro niveles de mip, los datos indexados **y una paleta
de 256 colores al final**, precedida de un `uint16` con el número de colores. Hay
que decodificar a RGBA.

Y los casos especiales, que son los que hacen que un mapa se vea bien o raro:

- nombre que empieza por `{` → el índice 255 de la paleta es TRANSPARENTE;
- nombre que empieza por `!` o `water` → agua, se mueve;
- `sky` → no se dibuja con su textura, va al fondo;
- nombre que empieza por `+0`, `+1`… → animación por cuadros;
- nombre que empieza por `~` → emisiva.

La sonda: las 92 decodifican, ninguna sale completamente negra ni de un solo
color —que es el fallo silencioso clásico de una paleta mal leída— y la suma de
superficie por textura reproduce la tabla que `bsp.mjs --texturas` ya imprime
(`rock_07` 30,3 %, `ms_dirt01` 16,8 %, `sky` 11,6 %).

### Parte 3 — El mapa de luz. Es la parte que decide la sesión

2,03 MB de luz horneada. **Es lo que más separa a Gate City del jharro** y lo que
ninguna cantidad de luces dinámicas sin sombra va a igualar.

Por cara: se proyectan sus vértices sobre los ejes S y T del `texinfo`, se toman
el mínimo y el máximo, se dividen entre **16** —el espaciado de luxel de
GoldSrc—, se redondean hacia abajo y hacia arriba, y el tamaño del parche es
`(max − min) + 1` en cada eje. Los datos son RGB de 8 bits, en el orden de los
`styles` que no son 255.

Hay que empaquetar todos los parches en un atlas y emitir un **segundo juego de
UV** apuntando a él. Three.js multiplica un `lightMap` por `uv1` sin que haya que
escribir un shader.

Sondas: el número de luxels leídos tiene que cuadrar con los 2 126 793 bytes del
lump; y un histograma de luminancia del atlas que **no sea plano** —si sale
plano, se ha leído mal y el mapa se verá uniformemente iluminado, que es
exactamente el aspecto del jharro de hoy y por tanto el fallo más fácil de dar
por bueno—.

### Parte 4 — El visor: `?map=gatecity`

Geometría + textura + mapa de luz, los 316 modelos de entidad colocados en su
`origin`, el cielo y el agua. Cámara en `ms_player_begin`, que está medido:
`(−18, −87, −8)` en metros.

**Y la escala: 39,37 unidades por metro, no 32.** `UNITS_PER_M` del proyecto vale
32 porque es la de Quake. Leer este `.bsp` con 32 hace el mundo un 19 % más
grande y no falla nada: sale un mapa plausible con el jugador convertido en un
enano. Es el aviso más viejo de este experimento y el que más fácil vuelve.

El veredicto de la parte: los mismos fotogramas medidos que el jharro, y **la
comparación al lado**. Aquí sí hay contra qué comparar.

### Parte 5 — El informe de capacidad *(lo que contesta la pregunta)*

Una tabla honesta: qué se reprodujo, qué no, y qué cuesta cada hueco. Con
nombres y cifras, no con impresiones. Candidatos conocidos a hueco: los 101
`env_model` y los 58 `env_sprite` apuntan a ficheros `.mdl` y `.spr` que **no
están dentro del `.bsp`**, así que sin lectores de esos dos formatos los adornos
no salen — y son la mitad de lo que se ve a la altura de los ojos.

### Parte 6 — Los formatos que faltan, si valen la pena

`.mdl` y `.spr`. Se decide DESPUÉS de la parte 5, con el coste ya medido.

### Parte 7 — La vuelta al jharro *(el porqué de todo esto)*

Lo que se aprenda se lleva a lo nuestro, y ya está escrito en `NEXT_SESSION.md`
como los cuatro primeros puntos:

- emitir la malla generada **con grupos por textura** en vez de con una sola;
- **hornear la luz** en Node contra nuestra propia geometría;
- **subdividir las caras** para bajar la mediana de 1,10 m² hacia 0,47.

Si la parte 5 dice que la pila llega, entonces al jharro le falta trabajo y no
herramientas. Si dice que no llega, sabremos por dónde.

## Las reglas, que no cambian

- **No inventes geometría, calcúlala.** Aquí es literal: toda sale del archivo.
- **Saca fotogramas y MÍRALOS.** Esta vez hay referencia: lo que salga tiene que
  parecerse a Gate City, y si no se parece, se ve.
- **Ningún asset sin licencia al lado.** Se escribe el lector, no se copia el
  mapa. Nada sale de `build/`.
- **`exit 0` no significa correcto**, y «se ve algo» no significa que esté bien.
- **Cada sonda con su control.** En la sesión pasada TRES de los fallos que
  gritaron las sondas eran de las sondas, y una cometía por dentro el mismo error
  que estaba buscando.
- Los experimentos 01 y 02 siguen congelados. El jharro no se toca en las partes
  1 a 6: es la referencia contra la que se mide lo que se aprende.

## Avisos que ya costaron caro y volverán

Del formato, que es territorio nuevo:

- **`lightofs` = −1 significa sin mapa de luz**, no desplazamiento cero. Leer el
  byte 0 del lump para esas caras las pinta a todas del mismo color.
- **El espaciado de luxel es 16 y el tamaño del parche lleva un «+1».** Un
  desfase de uno da mapas de luz casi correctos —desplazados medio luxel— que se
  ven bien en una captura y mal en movimiento.
- **Un `surfedge` negativo recorre su arista al revés.** `leerCaras` ya lo hace
  bien; si alguien lo reescribe, los polígonos salen con los vértices cruzados.
- **`side` distinto de cero voltea la normal del plano.** Sin eso, la mitad de
  los suelos son techos — y eso ya se supo al medir la altura libre.
- **La paleta va DESPUÉS de los datos de mip, con su contador de 2 bytes.**
  Leerla como si empezara en un desplazamiento fijo da una textura de un solo
  color, que se parece muchísimo a «todavía no he puesto texturas».
- **La escala de GoldSrc es 39,37 u/m, no 32.**

Y los del proyecto, que siguen todos:

- **`mallaGenerada` dibuja a DOS CARAS.** Una cara emitida al revés no se ve mal
  en el visor. Las dos orientaciones invertidas del jharro las cazó una prueba de
  normales, no un fotograma.
- **La cobertura no vale como sonda en un sitio oscuro:** mide píxeles que no son
  del color de la niebla, y un pasillo negro marcó el 95,7 %. Vale la luminancia.
- **Un cociente con el denominador equivocado no da error**, da una cifra redonda
  y convincente: las luces por metro de huella decían «siete veces más luz en el
  pueblo» y por metro de suelo son 2,4.
- **Medir una proporción no es medir la variedad.** Es el fallo que trajo esta
  sesión aquí: la tabla de texturas se leyó como reparto y era además un
  recuento.
- **`readPixels` después del intercambio de buffer devuelve NEGRO.** Dibujar y
  medir en la misma tarea.
- **Un valor por defecto plausible es un fallo silencioso.**
