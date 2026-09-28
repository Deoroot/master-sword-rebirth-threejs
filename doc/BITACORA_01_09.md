# Mydra Web Lab — experimento 03

> **AVISO DE LA MUDANZA.** Este documento es de cuando el proyecto era un
> laboratorio web y vivía en la carpeta `Mydra Web Lab`. Cita archivos que se
> quedaron allí —`src/map/`, `src/kit/`, `public/`, `tools/village.mjs`,
> `tools/kit.mjs` y las demás herramientas de los experimentos 01 a 09— y esos
> enlaces no resuelven aquí, a propósito: el reparto está explicado en
> [ESTRUCTURA.md](../ESTRUCTURA.md). Se conserva entero porque es el registro de
> lo que se midió, y una cita rota es mejor que una cita reescrita a algo que no
> es lo que se midió.


Sonda mínima: cargar `plaza.map` en Three.js y caminarlo, con `qbsp` todavía de
juez. La pregunta que contesta está en [EMPEZAR_AQUI.md](EMPEZAR_AQUI.md):
**¿sobrevive el veredicto automático en una pila de navegador?**

Pila: Three.js + Rapier. Nada más. Sin React Three Fiber, sin store de estado,
sin GSAP, sin Howler.

## Cómo se usa

```
npm install
npm test                          # 172 comprobaciones en Node plano
npm run village                   # el pueblo con relieve escalonado -> pueblo.map
npm run village:rampas            # el mismo plano con rampas -> pueblo-rampas.map
npm run verdict                   # qbsp -leaktest sobre plaza
npm run verdict public/maps/pueblo.map
npm run verdict public/maps/pueblo-rampas.map
npm run hill                      # el juez del valle de malla, que no usa qbsp

npm run kit                       # mide cualquier .glb leyendo el binario
npm run kit -- --list             # pieza a pieza: caja, pivote, triángulos
npm run kit:import                # kit CC0 -> public/kit/, con licencia generada
npm run kit:fichas                # 5 capturas medidas por pieza -> build/kit/
node tools/house.mjs              # 9 capturas medidas por casa -> build/casas/
node tools/plano.mjs              # el mapa de celdas de Corinth -> plano.svg
node tools/bake.mjs               # la página autónoma -> build/horno/corinth.html

npm run corinth                   # Corinth montado -> public/maps/corinth.map
npm run verdict public/maps/corinth.map
npm run corinth:andar             # el juez de marcha: Rapier contra glTF y roca
npm run corinth:shot              # 17 fotogramas medidos -> build/corinth/
npm run bsp -- <ruta.bsp>         # mide un .bsp de GoldSrc: no hay que abrirlo en nada
npm run jharro                    # el jharro: el plano de 8 plantas -> build/jharro/
npm run jharro:roca               # la roca: el corte vertical y la altura libre medida
npm run jharro:semillas           # el barrido con el que se eligió la semilla
npm run jharro:png                # los SVG en PNG, para mirarlos
npm run jharro:shot               # 9 fotogramas medidos desde el visor de verdad
npm run jharro:probar             # la prueba de humo del visor: abre y anda
npm run dev                       # y a andarlo tú:  ?map=jharro
npm run probar                    # abre el navegador y anda: prueba de humo del visor
npm run dev                       # y a andarlo:  ?map=corinth
npm run shot pueblo               # fotogramas medidos, en build/shots/
npm run shot pueblo-rampas
npm run shot colina
npm run dev                       # el navegador, en http://localhost:5173/
                                  #   ?map=pueblo  ?map=pueblo-rampas  ?map=colina

npm run gatecity                  # extrae gatecity.bsp -> build/gatecity/ y lo mide
npm run gatecity -- --gamma 2.8   # otra rampa de gamma en el mapa de luz
npm run gatecity -- --texgamma 1  # y sin rampa en las texturas (como estaba antes)
npm run gatecity -- --sinluz      # las caras sin mapa de luz en BLANCO, para verlas
node tools/comparar.mjs a.png b.png  # dos fotogramas, en histogramas
npm run gatecity:shot             # 12 fotogramas medidos + la prueba de marcha
npm run dev                       # y a verlo:  ?map=gatecity
                                  #   T = ir a uno de los 8 pueblos
                                  #   R = volver a la llegada (a 47 m del pueblo)

python tools/fetch_textures.py    # texturas CC0 de Poly Haven, con PROCEDENCIA.md
python tools/make_textures.py     # cielo, puerta, agua y arbol: nuestras
python tools/import_vegetation.py # siluetas de arbusto CC0, con su licencia
```

## Qué contesta, con cifras

| Pregunta | Respuesta |
| --- | --- |
| ¿Se carga `plaza.map`? | Sí: 74 brushes, **504 triángulos** (más 384 de cielo, descartadas), 4 texturas, 21 luces |
| ¿Se camina? | Sí, en el navegador y en Node |
| ¿Cuántas comprobaciones sin ojos? | **172**, todas en `node --test` sin navegador |
| ¿Sigue juzgando `qbsp`? | Sí: plaza sella con 292 caras, **pueblo con 4745**, **pueblo-rampas con 7522** |
| ¿Hace falta navegador para el veredicto? | **No.** Solo para la llamada de dibujo |
| ¿Se puede mirar? | Sí: **9 fotogramas medidos**, hasta 98 % de cobertura, 6,0 m andados en el navegador |
| ¿Hay un pueblo? | Sí: **104 × 88 m**, 986 brushes, 10 casas con fachada, portón, pozo, mercado, 7 árboles, 104 matas y 1 m de micro-relieve |
| ¿Hay relieve continuo? | Sí, de dos formas: **rampas de brushes** (4929 brushes, sella) y **malla de altura** (10 944 triángulos, sin `.map`) |
| ¿Sobrevive el veredicto sin `qbsp`? | Sí, **pero hay que escribirlo**: [tools/hill.mjs](../tools/hill.mjs), con sus dos sondas de control |
| ¿Sirve un kit de mallas CC0? | Sí: rejilla exacta de **4 m**, muro de 3 m, **una sola textura para 204 de 270 piezas** |
| ¿Cuánto costó importarlo? | De **14,4 MB a 281 KB** de geometría + 543 KB de textura, desincrustando el atlas |
| ¿Hay pueblo planificado? | Sí: **Corinth, 20×18 celdas (80×72 m)**, 17 parcelas, río, puente y boca de mazmorra |
| ¿Se llega a la mazmorra? | Sí, **y solo por el puente**: se comprueba inundando el plano desde el portón |
| ¿Está Corinth montado? | Sí: **18 parcelas, 250 piezas del kit**, 18 689 triángulos con el `.map` |
| ¿Miran las casas a la calle? | Sí, y se comprueba **en la puerta ya colocada**, no en el criterio que la giró |
| ¿Sella el suelo de Corinth? | Sí: `qbsp` sella con **1190 caras**, con el socavón abierto y tapado por un sello |
| ¿Se cose sin rendija? | Sí: los **900 pasos** de 0,4 m de la boca se reparten uno a uno, sin hueco ni solape |
| ¿Se camina de verdad? | Sí: la ruta de **16 celdas** del portón a la boca se recorre con un cuerpo |
| ¿Está sellada la boca? | Sí: la reja para al jugador y **0 de 12 asaltos** entran por el borde del brocal |
| ¿Se baja a la reja del fondo? | Sí, con la reja de calle quitada: **4,06 m** hasta 0,9 m de la reja |
| ¿Se anda con el teclado? | Sí: `?map=corinth` en el visor, **40 238 triángulos** de colisión |
| ¿Se cruza el río sin puente? | No: **0 de 17** asaltos, y lo impide una valla, no un accidente |
| ¿Hay vallas? | Sí, generadas: río, puente, patio y 15 parcelas — el pack no trae ninguna |
| ¿Hay una ciudad bajo tierra? | Sí, el **jharro: 8 plantas, 256 celdas, 96 × 136 m**, con las cotas medidas |
| ¿Se llega a todo estando en 3D? | Sí, y **quitar cualquiera de las 7 conexiones aísla una planta** |
| ¿Da la altura libre de Gate City? | Sí en 7 de 8 cifras: **mediana 2,86 m** contra 2,8 y **p90 9,30** contra 9,3 |
| ¿Está todo cubierto? | Sí: **102,9 % de techo** sobre el suelo, y Gate City mide 107 % |
| ¿Están las casas pegadas a la cueva? | Sí: **68 fachadas** metidas en la roca, el 4,8 % de la superficie |
| ¿Hay zona segura y terreno de bichos? | Sí: **43 % del suelo** es pueblo, en 7 barrios, y se entra por la cueva |
| ¿Está repartida la luz? | Sí, con **dos densidades**: una cada 48 m² en el pueblo y 111 en la cueva |
| ¿Queda algún rincón negro? | Del suelo a su farol, **p90 11,1 m**; el pozo sigue negro y está anotado |
| ¿Se anda el jharro? | Sí: **`?map=jharro`**, 45,5 m andados en la prueba de humo, en suelo |
| ¿Se ve algo ahí abajo? | Sí, medido por luminancia: **6 de 9 vistas por encima del 85 %** |
| ¿Se puede DIBUJAR un `.bsp` de GoldSrc? | Sí: **41 650 triángulos, 100 grupos**, `?map=gatecity` |
| ¿Y su luz horneada? | Sí, al byte: **2 126 793 bytes contabilizados contra los del lump** |
| ¿Y sus lámparas y antorchas? | Sí: **80 carteles**, 57 llamas leídas de `.spr` y 23 halos generados |
| ¿Y sus adornos? | Sí: **101 `env_model` de 17 `.mdl`**, 20 417 triángulos, cada uno con la luz de su suelo |
| ¿La iluminación es la del juego? | Sí, leída del motor: `BuildGammaTable()` y `R_BuildLightMap()`, con el `config.cfg` de MSR. Contra su captura, p10 **19,6 contra 19,6** |
| ¿Hace falta un shader propio? | **No.** `MeshBasicMaterial` de fábrica con `map`, `lightMap` y `uv1` |
| ¿Cuánto cuesta dibujarlo? | **0,94 ms/fotograma y 92 llamadas**, con render por software sin GPU |
| ¿Se lee el mapa de luz horneado? | Sí, y **cuadra al byte**: 2 126 793, 462 915 luxels, atlas 1 024² |
| ¿Se decodifican las texturas? | Sí: **92 de 92**, paleta de 256 al final del `miptex` |
| ¿Se reproduce la variedad medida? | Sí: **80 texturas, 10 cubren el 80 %**, cara mediana 0,47 m² |
| ¿Se anda Gate City? | Sí: 39 247 triángulos de colisión, **12,7 m en 12 s** desde la llegada |
| ¿Miran las caras hacia donde dicen? | Sí, los **41 650 triángulos**, y con control: 99,4 % de frente contra 31,8 % por detrás |
| ¿Se llega a los interiores? | Sí, **tecla T**: los 8 `msarea_town`. La llegada está a 47 m, y eso lo pone el mapa |
| ¿Se ven las antorchas? | Sí: **57 carteles de `Fire1/Fire2.spr`**, 23 cuadros, mezcla aditiva |
| ¿Se atraviesan los rayos de luz? | Sí: los **5 modos de `rendermode`**, en 100 grupos. 31 entidades aditivas |
| ¿Está el farol más claro que la roca? | Sí, y por diez: `pi_lantern` a **181/255** de mapa de luz, `rock_07` a **17** |
| ¿Qué NO sale? | Los **101 `.mdl`** y el cielo `nature1`. Los `.mdl` sí están al lado: falta el lector |

Las comprobaciones nuevas del jharro están en `test/jharro.test.mjs`,
`test/roca.test.mjs`, `test/ciudad.test.mjs` y `test/zonas.test.mjs`: **329 en
total**, todas en `node --test` y sin abrir un navegador.

Se reparten así:

| Archivo | Qué comprueba | Cuántas |
| --- | --- | --- |
| `test/parse.test.mjs` | El lector de `.map`, y sus caminos de error | 16 |
| `test/geometry.test.mjs` | Brushes a triángulos: bobinado, ejes, escala, áreas | 10 |
| `test/plaza.test.mjs` | `plaza.map` contra su propio `plaza.meta.json` | 12 |
| `test/walk.test.mjs` | Caminar, escalones, paredes, caídas, determinismo | 9 |
| `test/texcoords.test.mjs` | La proyección de texturas de Quake | 13 |
| `test/emit.test.mjs` | El emisor, emitiendo y volviendo a leer | 13 |
| `test/pueblo.test.mjs` | El pueblo contra su propio plano | 23 |
| `test/backdrop.test.mjs` | Colinas, bosque y carteles | 11 |
| `test/relief.test.mjs` | El relieve escalonado y su garantía | 11 |
| `test/scene.test.mjs` | La escena de Three.js, sin WebGL | 10 |
| `test/slope.test.mjs` | El campo continuo, las rampas y su garantía | 18 |
| `test/terrain.test.mjs` | El valle de malla: campo, triángulos, plantas | 17 |
| `test/rampas.test.mjs` | El pueblo en rampas, contra el mismo en escalones | 9 |
| `test/house.test.mjs` | El plano de casa: celdas, plantas, solape del tejado | 17 |
| `test/corinth.test.mjs` | El mapa de celdas: paso, solapes, orillas, río | 15 |
| `test/boca.test.mjs` | La boca: escalera, socavón, roca generada, UV, sello | 24 |
| `test/montaje.test.mjs` | Corinth montado: giros, huellas, puertas a la calle | 21 |
| `test/suelo.test.mjs` | La costura entre el `.map` y el socavón, paso a paso | 8 |
| `test/jharro.test.mjs` | El plano en 3D: plantas, conexiones, y que se llegue a todo | 20 |
| `test/roca.test.mjs` | La roca: altura libre medida, costura entre plantas, túneles | 19 |
| `test/ciudad.test.mjs` | Las fachadas contra la roca, y que la puerta dé a la galería | 15 |
| `test/zonas.test.mjs` | Zona segura, criaderos, transiciones y las dos densidades de luz | 18 |

## Corinth, y el kit de mallas

A partir de aquí el proyecto deja de sacar toda la geometría de un `.map` y
empieza a colocar mallas glTF de un kit CC0. El reparto de jueces cambia con
ello: **`qbsp` sigue juzgando el mundo sellado** —terreno, muralla, suelo— y las
mallas las juzga un arnés escrito aquí, igual que `hill.mjs` hace con el valle.

- [tools/kit.mjs](../tools/kit.mjs) mide un `.glb` leyendo el binario, sin cargador
  ni navegador: caja, pivote, triángulos y texturas salen de los accesores.
- [tools/import_kit.mjs](../tools/import_kit.mjs) importa solo las piezas
  autorizadas, **desincrusta el atlas** —el pack mete una copia de 436 KB dentro
  de cada `.glb`—, pasa los materiales de BLEND a MASK, y genera la licencia.
  Cada pieza reescrita se vuelve a leer y se compara con el original.
- [tools/piece.mjs](../tools/piece.mjs) saca la ficha de cada pieza. La caja la
  miden **dos lectores independientes** —el binario y Three.js— y tienen que
  coincidir dentro de 1 mm; eso es lo que los hace creíbles a los dos.
- [src/kit/house.js](../src/kit/house.js) calcula el plano de una casa a partir de
  una descripción. Ni una coordenada escrita a mano.
- [src/kit/corinth.js](../src/kit/corinth.js) es el mapa de celdas del pueblo.
- [src/kit/boca.js](../src/kit/boca.js) genera la boca de la mazmorra: el socavón
  es malla calculada, todo lo fabricado es piedra del pack.
- [src/kit/pueblo.js](../src/kit/pueblo.js) **monta Corinth**: recorre `PARCELAS`,
  elige el rumbo de cada casa, la gira, la arrima a su calle y coloca la boca.
- [tools/corinth_map.mjs](../tools/corinth_map.mjs) emite el suelo, la muralla y el
  sello -> `public/maps/corinth.map`, que vuelve a juzgar `qbsp`.
- [tools/andar.mjs](../tools/andar.mjs) es el juez de marcha: Rapier contra mallas
  glTF y contra el socavón, con sus controles.
- [tools/corinth_shot.mjs](../tools/corinth_shot.mjs) saca y mide los fotogramas,
  pilotando el visor de verdad.
- [src/kit/rio.js](../src/kit/rio.js) es el trazado del río: de aquí sacan el
  terreno el emisor del `.map` y el recorrido las vallas de la orilla.
- [src/kit/cerco.js](../src/kit/cerco.js) genera las vallas, que el pack no trae.
- [src/kit/malla.js](../src/kit/malla.js) tiene las primitivas de malla generada,
  que antes vivían dentro de `boca.js` y ahora usan dos sitios.

### Por qué las casas no miran todas al sur

Porque una casa con la puerta contra la pared de la vecina no es una casa, es un
decorado visto desde el lado bueno — y el fallo no lo caza ninguna cifra: el
pueblo mide lo mismo, sella lo mismo y tiene las mismas piezas con las doce
puertas al río que con las doce a la calle.

El rumbo se calcula: **cuánta calle alcanzable hay pegada a cada lado**, y entre
lados empatados, **cuál queda más cerca de la llegada**. El segundo criterio no
es adorno: en Corinth casi todas las parcelas son exentas, con calle por los
cuatro lados, así que la fachada empata casi siempre y lo que decide de verdad es
la distancia. Sale la manzana del norte mirando al sur y la del sur al norte, las
dos a la calle del portón.

Un primer intento puntuaba además la SEGUNDA fila de calle, para distinguir una
calle de un hueco entre dos casas. Salía al revés: premiaba el callejón contra la
muralla —que tiene segunda fila— y castigaba la calle pasante —cuya segunda fila
es la espalda de la casa de enfrente—.

Y la prueba no mira el criterio, mira **la puerta ya colocada**: se avanza medio
metro en la dirección a la que mira la pieza y se pregunta en qué celda se cae.
Comprobar el criterio sería comprobar que el criterio hace lo que hace.

### El eje que está del revés

`house.js` llama «sur» a su cara de z=0 y `corinth.js` cuenta las filas de norte
a sur. Los dos son coherentes consigo mismos, y **la cara que `house.js` llama
sur mira al NORTE del pueblo**. Arrastrar los nombres sin traducir deja las doce
casas giradas media vuelta sin que cambie una sola cifra. La traducción está
escrita una vez, en `src/kit/pueblo.js`, y hay una prueba que la clava.

### La costura entre el `.map` y el socavón

Es el trabajo de verdad de esta parte. `alturaRoca()` devuelve **cero exacto**
fuera del labio, y ese cero es lo que permite que suelo y roca se toquen. Sobre
la parcela de la boca, las dos partes se reparten la MISMA rejilla de 0,4 m y
usan la MISMA función para decidir de quién es cada celda:

```
hayRoca(i, j)   ->  "socavon" | "trinchera" | false
la malla de roca emite las celdas en que devuelve algo
el .map emite losa en las celdas en que devuelve false
```

Es una partición, no dos dibujos que se parecen: `test/suelo.test.mjs` recorre
los **900 pasos** y exige que cada uno lo tape uno y solo uno. Y como la rejilla
es compartida, los vértices de la junta son los mismos números en los dos lados,
los dos a cero.

Tres cosas que la costura obliga, y que por tanto no son estéticas:

- **El pueblo es llano.** No por pereza: en cuanto la calle alrededor de la boca
  deja de estar a cero exacto, la junta se abre o se entierra, y ninguna de las
  dos cosas da error. El terreno de rampas sigue vivo en `pueblo-rampas.map`.
- **La trinchera mide 2,4 m y no 2,35.** Seis pasos de malla justos, así que sus
  bordes caen en línea de rejilla. Con 2,35 sobraban 2,5 cm a cada lado.
- **El sello.** `qbsp` no ve mallas, así que el hueco del socavón es para él una
  fuga. Lo tapa un brush de textura `sello01` que el runtime **no dibuja ni
  convierte en colisión**, igual que ya hacía con el cielo. Para el juez el suelo
  está entero; para el jugador el agujero está donde se ve.

### Lo que solo apareció al poner un cuerpo delante

`alcanzables()` inunda el mapa de celdas y dice que desde el portón se llega a la
boca. Es verdad, y no basta: una inundación de celdas pasa por encima de un
escalón de dos metros y de una cuerda colgando en mitad del paso.
[tools/andar.mjs](../tools/andar.mjs) recorre ese mismo camino con un cuerpo que
colisiona, y encontró cuatro cosas que no había visto ni el plano, ni las cifras,
ni las capturas:

- **La cuerda del torno cruzaba la escalera.** Veinte centímetros de cuerda, de
  2,47 m hasta el fondo, justo por el eje del único paso: en el trimesh eso es un
  muro de seis metros y medio, y el jugador se queda clavado delante. Ahora la
  roca se devuelve dos veces —`roca` para dibujar, `rocaSolida` para colisionar—
  porque una cuerda no es un muro.
- **Las jambas de la reja estaban dos metros al sur.** Un `+ 1` donde tocaba un
  `- 1`: las dos acababan fuera de la parcela, en el patio, y la boca de la
  trinchera quedaba abierta de par en par. De frente se ven dos bloques de piedra
  a los lados, que es exactamente lo que tiene que verse.
- **La reja tapaba medio pasillo.** La hoja mide 1,228 m y el pasillo 2,4: sobran
  0,59 m a cada lado, se ve cerrada de frente y un cuerpo la rodea. Ahora son dos
  hojas solapadas 1,4 cm, que es lo que hace un portón de verdad.
- **Se entraba al socavón por el borde.** El labio del cráter se sale de su propia
  parcela en las diagonales, y la regla del brocal tiraba la pieza que caía fuera
  en vez de arrimarla: quedaba una rampa abierta por la que se entra andando sin
  pasar por la reja, en un pueblo cuyo lore entero se apoya en que ahí hace falta
  permiso. Lo encontró una sonda que asalta el brocal desde doce puntos.

Y una que no es fallo pero obliga a decir la verdad: **la rampa de la trinchera
cae 24,9°** y el controlador admite 46, así que se baja igual sin escalera. La
escalera sostiene sola y la rampa también —las dos, por separado—, y por eso el
control que discrimina es quitar las dos a la vez.

### La medida del descampado, al segundo intento

`npm run corinth:shot` saca diecisiete fotogramas y los mide. La medida que
importa —¿se ve el pueblo o se ve el suelo?— costó dos intentos:

- **Restar coberturas no sirve.** El pueblo está amurallado: con muro, suelo y
  cielo, casi todo píxel es ya geometría antes de poner una casa. La cobertura se
  satura por encima del 90 % y la resta da dos puntos tanto si hay doce casas
  delante como si no hay ninguna.
- **Lo que sí mide** es cuántos píxeles CAMBIAN al apagar el kit: es literalmente
  la fracción de pantalla que ocupan las casas. En la calle del norte son **43 %**;
  desde 105 m de altura, 2,6 %; en el fondo del socavón, 92 %.

### Tres números del kit que mandan sobre el diseño

Ninguno se eligió; los tres se midieron, y los tres cambiaron una decisión:

- **Celda de 4 m, muro de 3 m.** La misma celda que `build_greybox.py` de Mydra
  Ages, así que encaja sin convertir nada.
- **El tejado arranca 0,366 m por DEBAJO de lo alto del muro.** Está hecho para
  solapar. Colocarlo «encima y ya» deja una rendija alrededor de toda la casa
  que a mediodía casi no se ve y de noche se ve entera.
- **La escalera de piedra sube 1,015 m por cada 2,183 m de tramo.** Bajar los 4 m
  del socavón pide 8,73 m de carrera, que no caben pegados a su pared: por eso
  la parcela de la boca es de 3×3 celdas y la escalera entra en trinchera desde
  la calle en vez de bajar por dentro del agujero.

### La comprobación que el 02 dejó pendiente

«Que la puerta lleve a alguna parte» no la puede hacer ni `qbsp` ni el emisor.
Con el pueblo en celdas sí: `alcanzables()` inunda desde el portón y las pruebas
exigen que la boca se moje **y que deje de mojarse si se quita el puente** —si
hubiera otro paso, el control de la guarnición sería decorado—. El plano dibujado
marca además en rojo toda celda pisable a la que no se llega, que es el fallo que
nadie echa de menos porque nadie pregunta por una calle que no sabía que existía.

### Las cinco cosas que solo se vieron jugando

Todo lo de arriba estaba en verde —257 comprobaciones, `qbsp` sellando, la sonda
de marcha llegando a la reja, diecisiete fotogramas medidos— cuando alguien se
puso a andar por Corinth y anotó cinco cosas en un minuto. Ninguna la decía una
cifra. Vale la pena el detalle de cada una, porque el patrón se repite.

**El portón parpadeaba y casi no se veía.** El brush del portón estaba metido
DENTRO del de la muralla: dos sólidos en el mismo volumen, con las caras
coplanarias. Eso no da error —da *z-fighting*, y la puerta y el muro se pelean
por la profundidad—. La sonda de capturas tampoco lo ve, porque un fotograma fijo
congela la pelea en un ganador. Ahora el muro oeste va partido en tres y el
portón es un hueco de verdad con su retranqueo, sus jambas y su dintel. Abrir el
hueco dejó el nicho **sin suelo**, y eso sí lo cazó `qbsp` al instante: fuga.

**El río era un canal de hormigón.** Recto, con las paredes a plomo y una losa
lisa con textura de agua. Ahora el cauce lo da un spline que pasa por los centros
de la tabla `RIO` —o sea que las celdas mojadas siguen siendo las mismas y la
comprobación de paso no cambia— y la ribera sale de un campo de alturas, como el
socavón. El agua corre la UV en el visor: una lámina quieta no se lee como agua,
se lee como suelo pintado de azul, que es exactamente lo que era.

Suavizar la orilla casi cuesta el lore entero. Corinth vive de que **el puente
sea el único paso**, y eso no lo garantizaba el plano —el plano solo dice qué
celda está mojada— sino que la orilla fuera un escalón de 1,25 m a plomo. Con una
ribera en pendiente se abrió un vado en **doce de diecisiete filas** y no falló ni
una comprobación de celdas. Lo cazó una sonda nueva que asalta el río fila por
fila, y lo arregla una valla.

**Faltaban vallas de madera.** Se cercaba con `stone_square_1m`, que es un bloque
de sillería de cuatro metros puesto de canto. Ahora hay un generador de vallas
—postes y dos listones, pintados con la franja de madera del atlas— y la del río
es la que sostiene el lore: se abre justo en el puente y en ningún otro sitio.

**La boca no tenía techo** y se le veían los cuadrados de muro. Ahora es una
caseta: cuatro postes, tejado a cuatro aguas y el portón de dos hojas debajo.

**El pueblo estaba vacío.** No tenía ni un árbol. Ahora hay vegetación, pero
arrimada a las parcelas: el primer intento sembró en cualquier celda libre y la
calle mayor quedó tapada por árboles de doce metros. Un árbol en mitad de la
calle no es vegetación, es un tapón.

### Cuatro errores de sonda, y por qué cuentan

De los fallos que las sondas gritaron en esta ronda, **cuatro eran de las sondas
y no del mundo**. Conviene anotarlos porque una sonda que miente cuesta lo mismo
que un fallo:

- **Una sonda mal plantada acusa a quien no es.** El asalto al brocal aparecía
  medio dentro de una pieza de un metro; el controlador resuelve la penetración
  subiéndola ENCIMA, y desde encima del brocal se entra al agujero andando. Se
  contaba como «se cuela por el borde». Pasó dos veces —con el brocal y con la
  jamba— porque las dos veces el filtro miraba una lista de piezas en vez de
  mirar dónde acababa el jugador. Ahora se deja caer y se comprueba que esté a
  ras de calle: eso vale para lo que se añada mañana.
- **Un filtro de más deja la sonda sin datos.** Al alejar los asaltos del brocal,
  el filtro «tiene que caer dentro de la parcela» los dejó en cuatro de cuarenta
  y ocho: la parcela mide 12 m y el cráter se la come entera. El filtro correcto
  es «tiene que caer en calle por la que se pueda llegar».
- **Pedir dos cosas contrarias a la vez.** La ruta del portón a la boca acababa
  en una celda que está detrás de la reja, y la reja tiene que parar. La sonda
  fallaba hiciera lo que hiciera.
- **Restar coberturas no mide nada en un mundo amurallado.** Ya estaba anotado, y
  volvió a morder: ver más abajo.

### Una página, una verdad

Las capturas se sacaban de `corinth.html`, una página propia que montaba el
pueblo con su cámara. Se borró. Eran **dos páginas que no enseñaban lo mismo**: el
visor dibuja la vegetación en carteles y el paisaje del fondo, y la página de
capturas no. O sea que las fotos que juzgaban Corinth enseñaban un pueblo sin un
árbol mientras el pueblo que se andaba tenía ochenta y cuatro — y la conclusión
que se sacaba de esas fotos era sobre la página, no sobre el pueblo.

Ahora `npm run corinth:shot` pilota `/?map=corinth` por `window.probe`, que es la
misma puerta que usa `tools/shot.mjs` con los otros mundos.

### El brocal, de piezas del pack a malla generada

Eran cuarenta y dos `stone_square_half_1m` repartidos por el labio. Dos cosas lo
tumbaron:

- **No sella.** Esa pieza son DIECISÉIS triángulos, TODOS verticales: es una
  cáscara de cuatro paredes sin tapa ni fondo, no un bloque. Un cuerpo que la
  empuja se monta por su canto de arriba. La caja de la pieza mide 2 × 1 × 2 y
  está bien; el manifiesto no miente. Lo que no dice ninguna cifra es que por
  dentro está hueca.
- **No se lee.** Cuadrados de dos metros alineados a los ejes, muy solapados y
  siguiendo una elipse, se ven desde arriba como un anillo de costillas.

Generado se arregla lo uno y lo otro, y de paso la altura puede seguir al propio
`labio()`: el reborde sube y baja como la roca que remata. Eso sí, **acotada** —el
primer intento multiplicaba la desviación por ocho y el brocal bajaba a cuatro
centímetros en los dos puntos más hundidos del anillo, que no son un reborde,
son suelo—. El mínimo no es estético: es `stepHeight`.

### Tres cosas más que solo se vieron jugando, y una sonda que hubo que escribir dos veces

La segunda vuelta por Corinth con el teclado en la mano sacó otras tres, y la
tercera era la grave.

**Se veía por debajo del mundo desde el fondo de la trinchera.** Las paredes del
pasillo se emitían solo HACIA ARRIBA —`Math.max(roca, suelo)`—, lo cual da por
supuesto que la roca de al lado está siempre más alta que el pasillo. Es verdad
arriba, mientras la trinchera baja por el labio; deja de serlo abajo, donde el
fondo del socavón ya está a −4,06 m y el pasillo todavía va por −2,9. Ahí hace
falta una pared que BAJE, y no se emitía ninguna: quedaba un escalón de metro y
pico sin cara, o sea un agujero por el que entra el color del cielo.

No lo vio nada, y las razones de cada cosa son distintas: el `.map` sella —esto
es malla, `qbsp` no la juzga—, el barrido de rayos hacia abajo encuentra suelo a
los dos lados del escalón —arriba el pasillo, abajo el cráter—, y la ruta del
portón a la reja pasa por el centro del pasillo y no se asoma.

**El tejadillo de la boca flotaba a cinco metros de sus postes.** Dos errores
sumados: `poner()` recibe la `w` del borde norte y la pieza crece hacia el SUR,
así que sumar el vuelo la corrió un lado entero —el mismo error de signo que ya
había corrido las jambas dos metros—; y se colocó «a la altura del travesaño»,
2,6 m, cuando la pieza va de −0,37 a +2,17 respecto de donde se la ponga, porque
está hecha para solapar un muro. El alero caía a 2,23 y los cuatro postes, de
3,10, la atravesaban de lado a lado.

**Había bloques de piedra suspendidos dentro del socavón.** Eran un
«revestimiento del corte» puesto para tapar dos franjas que el brocal dejaba
abiertas junto al tajo. La trinchera atraviesa el cráter, así que de las seis
piezas CUATRO caían sobre el agujero con la roca a cuatro metros por debajo. Se
quitaron enteras: el hueco del brocal se había estrechado a 45 cm y el jugador
mide un metro de ancho, así que por ahí ya no pasa nadie y no hacía falta nada.
La medida que lo dijo es de una línea —preguntarle a `alturaRoca()` qué hay bajo
cada pieza— y llevaba ahí todo el tiempo.

### La sonda del canto, escrita tres veces

Para que el agujero de la trinchera no vuelva hace falta una sonda, y las dos
primeras versiones **no medían nada**:

- **Rayos horizontales a cualquier altura.** Dijo que faltaban 404 paredes de
  594, y no faltaba ninguna: en la mitad honda la trinchera ya no es un pasillo,
  es un tajo abierto en el cuenco, y ahí no tiene que haber pared.
- **Rayos en diagonal desde dentro.** Dijo 0 de 84 — y seguía diciendo 0 **con el
  fallo puesto a mano**. El rayo chocaba con el suelo del propio pasillo a los
  doce centímetros y nunca llegaba al canto.

La tercera funciona porque atraviesa exactamente donde puede faltar la cara: la
franja vertical entre la cota del suelo del pasillo y la de la roca que tiene al
lado, sea cual sea la más alta. Con el mundo bueno da 0 de 366; con el fallo
restaurado, 187. **Esa pareja de números es lo que convierte una sonda en un
juez**, y es la misma disciplina que `hill.mjs` lleva desde el principio: una
sonda sin control es una sonda que dice que sí.

Y de paso dejó dicho algo que no estaba escrito: **aquí todo es superficie, no
volumen**. Un rayo que se cuela por una cara que falta no vuelve a chocar con
nada nunca, porque debajo de las mallas no hay mundo. Eso es lo que hace que la
prueba funcione, y también lo que hace que una cara olvidada se vea tanto.

## Dibujar un mapa ajeno: el experimento 05

El informe entero está en **[CAPACIDAD_05.md](CAPACIDAD_05.md)**. En corto: la
pregunta era si esta pila puede poner en pantalla lo que `gatecity.bsp` pone, y la
respuesta es **sí, con Three.js de fábrica y sobrando margen** — o sea que al
jharro le falta trabajo, no herramientas.

Lo que es nuestro y sirve para cualquier `.bsp` de GoldSrc:

- [src/bsp/lector.js](../src/bsp/lector.js) — cabeceras, lumps, modelos, entidades,
  texturas, `texinfo`, caras como polígonos y el parche de mapa de luz. Salió de
  `tools/bsp.mjs`, que imprimía un informe al importarlo y por tanto no se podía
  probar: medir cabía en un script, extraer para dibujar no.
- [src/bsp/miptex.js](../src/bsp/miptex.js) — las texturas de 8 bits con su paleta, y
  las clases por nombre: calada (`{`), agua (`!`), cielo, animada (`+0`), emisiva.
- [src/bsp/luz.js](../src/bsp/luz.js) — el mapa de luz: la contabilidad contra el
  lump, el empaquetado en atlas, el segundo juego de UV y el histograma.
- [src/bsp/malla.js](../src/bsp/malla.js) — la malla con **un grupo por textura**, que
  es exactamente la forma que al jharro le falta.
- [src/render/bsp_escena.js](../src/render/bsp_escena.js) — la escena, **sin una sola
  luz**: la de este mapa está horneada, y encender además las 118 puntuales sería
  sumar dos veces la misma luz y lavar el contraste que se viene a buscar.
- [tools/png.mjs](../tools/png.mjs) — un escritor de PNG, porque este proyecto no
  tenía forma de escribir una imagen en Node sin arrancar un Chromium.
- [tools/gatecity.mjs](../tools/gatecity.mjs) y
  [tools/gatecity_shot.mjs](../tools/gatecity_shot.mjs) — el extractor y los
  fotogramas medidos, con las vistas calculadas del propio archivo.

**Y la regla del 02 no se relajó: se escribió el lector, no se copió el mapa.** El
`.bsp` sigue en `../MSC/`, lo extraído vive entero en `build/gatecity/` con su
`PROCEDENCIA.md`, y ni un byte pasa a `public/`.

### La trampa que se llevó la sesión por delante

**GoldSrc guarda la vuelta de una cara en sentido HORARIO visto desde delante, y
Three.js llama frontal al antihorario.** Emitidas tal cual, las 12 680 caras del
mundo van al revés: cada pared se ve sólo desde detrás, se atraviesan las cercanas
y se ven los reversos de las lejanas.

**Y no se ve como geometría al revés: se ve como oscuridad.** Lo encontró quien lo
anduvo —«muchas cosas parecen ser invisibles»— y no las 377 comprobaciones en
verde, ni los nueve fotogramas mirados uno a uno, ni la cifra que lo gritaba
—«apagar el mapa de luz cambia el 3 % de la pantalla»— impresa ocho veces en la
consola.

Ahora tiene dos jueces con oráculo: los 41 650 triángulos emitidos tienen que
mirar hacia su normal, y desde dentro de una sala la cara frontal tapa el **99,4 %**
de la pantalla contra el **31,8 %** de la trasera — invertido a mano, los dos
números se cambian de sitio exactos.

### Las otras cuatro trampas del formato, que dan resultados casi correctos

Ninguna se ve en una captura, y las cuatro las cazó lo mismo: exigir que los
bloques del lump de luz encajen sin solaparse y sumen sus 2 126 793 bytes.

- **La proyección se acumula en `float` de 32 bits.** En el doble de JavaScript,
  −3584 sale como −3583,999999999999 y `ceil` da un luxel de más: en **951 de
  14 527 caras**. `Math.fround`.
- **«Tiene mapa de luz» son DOS condiciones**: 137 caras con `lightofs = −1` y
  **996 con `lightofs` válido y los `styles` a 255**.
- **Hay que SUMAR los estilos**: 2 795 caras no tienen el 0 en `styles[0]`, y hay
  9 405 bloques más que se tiraban.
- **La paleta va después de los cuatro mips**, con su contador de 2 bytes.
- **`ms_player_begin` es el punto de llegada y los `ms_player_spawn` son
  reapariciones**, y el `origin` del primero está **54 unidades sobre el suelo** —
  ni 18 ni 24. La cota se le pregunta al árbol BSP:
  [src/bsp/arbol.js](../src/bsp/arbol.js), que recorre los 9 922 nodos y dice qué hay
  en un punto.

## Medir un mapa ajeno: `gatecity.bsp`

[tools/bsp.mjs](../tools/bsp.mjs) lee un `.bsp` de GoldSrc —Half-Life 1, versión 30—
y saca cifras, sin motor, sin navegador y sin importador de por medio. Es la
misma idea que `tools/kit.mjs` con los `.glb`: un importador ya es una
interpretación, y aquí interesa el dato.

```
npm run bsp -- ../MSC/assets/msr/maps/gatecity.bsp
npm run bsp -- <ruta> --entidades --texturas --zonas
```

### Por qué medir y no copiar

Un `.bsp` de un juego es obra de alguien. Este proyecto tiene una regla escrita
desde el experimento 02 —**ningún asset entra sin archivo de licencia al lado**—
y sacarle la geometría y las texturas a un mapa ajeno la rompe. Mirarlo para
aprender es otra cosa, y es lo que hace esta herramienta.

Además es lo más útil: lo que hace que un pueblo subterráneo se lea bien no es su
malla, son sus PROPORCIONES, y ésas no se inventan, se miden.

### El plano de juego también está medido: `--zonas`

Un mapa de Master Sword no es solo geometría. Lleva escrito **en las entidades**
dónde se está a salvo (`msarea_town`), dónde reaparecen los monstruos
(`msarea_monsterspawn`), por dónde se entra (`ms_player_spawn`) y por dónde se va
a otro mapa (`msarea_transition`). Es la parte que no se puede adivinar mirando
capturas, y contradice lo que se haría por defecto:

| | |
| --- | --- |
| Zona segura | 8 áreas, 5 535 m² = **el 21 % de la huella**. El pueblo no es el mapa |
| Por dónde se entra | **por la cueva**: las dos salidas están a 3 y 84 m del spawn |
| A lo primero que te pega | **13 m**. Al pueblo más cercano, 46 |
| Criaderos | 16, cajas de **22 m² de media**: se reaparece en sitios concretos |
| Del suelo pisable | **el 43 %** está en zona segura |
| Luz dentro del pueblo | una cada **48 m² de suelo** |
| Luz fuera | una cada **113 m² de suelo** |
| Del suelo a su luz | mediana **3,8 m**, p90 10,6, la peor 43,7 |

### El cociente con el denominador equivocado

La luz da además una lección que costó escribirla dos veces **en la misma
sesión**. Contando luces por metro de HUELLA salen «una cada 73 m² dentro del
pueblo y una cada 510 fuera», o sea que la cueva estaría **siete veces** más
oscura. Lo escribí, lo di por bueno y casi se convierte en el objetivo de la
parte 4.

Es falso: fuera del pueblo la huella es casi toda roca maciza, y lo que hay que
iluminar es el suelo. Por metro de SUELO la diferencia es de **2,4 veces** —una
cada 48 dentro, una cada 113 fuera— y el conjunto da una cada 71, que es
exactamente la cifra que ya estaba medida. **Un cociente con el denominador
equivocado no da error: da una cifra redonda y convincente**, y ésta habría
triplicado las luces del pueblo y dejado la cueva a oscuras, con la comprobación
en verde contra su objetivo.

Y el gradiente de dificultad no va donde uno lo pondría:

```
msmonster_orcwarrior    8     -9 m de cota     33 m de la entrada
msmonster_dwarf        22    -17 m             58 m
msmonster_giantrat      4    -19 m             61 m
msmonster_skeleton      3    -19 m             64 m
msworlditem_treasure    1    -18 m             75 m
ms_npc                 31    -14 m             97 m
```

**Los bichos flojos y el tesoro están pegados al pueblo, no en el confín**, y lo
duro está en la puerta. El fondo del mapa no es lo difícil: es lo lejos.

### Gate City contra Corinth, con los dos medidos

| | Gate City | Corinth |
| --- | --- | --- |
| Huella | **138 × 195 m** | 80 × 72 m |
| Alto | **32 m, y el suelo se reparte en 5 bandas** | 1 planta |
| Suelo | 8 377 m² | 4 096 m² pisables |
| Techo | **107 % del suelo** — todo cubierto | 0 %: cielo abierto |
| Altura libre | mediana **2,8 m** (p25 2,3 · p75 4,9 · p90 9,3) | — |
| Luces | 117, una cada **71 m²** | 19, una cada 216 m² |
| Caras | 12 680 | ~8 500 |
| Adornos | 101 `env_model` + 58 `env_sprite` | 216 piezas de kit |
| Texturas | 92, todas incrustadas | 7 |

### Las cuatro cifras que cambian el diseño

Ninguna se adivina mirando capturas, y las cuatro contradicen lo que yo habría
hecho por defecto:

- **Más de la mitad del sitio es estrecho.** El 55 % del espacio tiene menos de
  3 m de altura libre y solo el 16 % pasa de 8 m. Un pueblo bajo tierra no es una
  caverna grande: es un montón de pasillos y cuartos de techo bajo con alguna
  bóveda suelta, y el contraste entre las dos cosas es lo que lo hace legible.
- **Casi todo lo que se ve es roca cruda.** `rock_07` se lleva el 30 % de la
  superficie, `ms_dirt01` el 17 % y `ground03` el 7 %: **el 54 % es roca y tierra**,
  y lo construido —sillería, adoquín, madera— no llega a un tercio. Las casas
  están pegadas a la cueva, no la cueva construida alrededor de las casas.
- **Cuatro veces más luz que Corinth.** Una fuente cada 71 m² frente a una cada
  216. Bajo tierra la luz no es ambiente, es el plano: es lo que dice por dónde
  se pasa.
- **La escala no es la de Quake.** GoldSrc mide en PULGADAS: 39,37 unidades por
  metro, no 32. Leer un `.bsp` de Half-Life con la escala de Quake encoge el mapa
  un 19 % y no falla nada — sale un pueblo plausible con los techos un palmo más
  bajos, que es justo el error que no se ve y estropea la referencia entera.

## El jharro: una ciudad excavada, de la medida al plano

Un *jharro* —el nombre es de Master Sword— es un pueblo que no está construido
sobre el suelo sino DENTRO de la roca. Es el experimento 04, y de él están hechas
**las partes 1, 2, 3, 4 y 7**: el plano en tres dimensiones, la roca, lo
construido, la luz y las zonas de juego. Caminarlo (5) y los adornos (6) quedan
escritos y sin hacer, y hasta que se camine, lo que aquí se afirma es que está
calculado y medido — no que esté bien.

```
npm run jharro             # el plano: un SVG por planta -> build/jharro/
npm run jharro:roca        # la roca: el corte vertical y la altura libre medida
npm run jharro:semillas    # el barrido con el que se eligió la semilla
npm run jharro:png         # los dos SVG en PNG, para mirarlos
```

Gate City se MIDE, no se copia: el `.bsp` es obra de DrKill y la regla del 02
manda. Lo que se importa son las proporciones, y de ellas se deriva todo lo
demás. Aquí no hay ni un número redondo elegido a ojo:

| Lo medido de Gate City | Lo que decide |
| --- | --- |
| suelo = 30,5 % de la huella | el jharro mide **24 × 34 celdas = 96 × 136 m** |
| 8 210 m² en ocho bandas de cota | las **ocho plantas** y cuántas celdas tiene cada una |
| el grueso del suelo a −14 m | la planta de −14 se lleva **104 de las 256 celdas** |
| `strairs_stone` sube 1,015 m por 2,183 | dos metros de salto = **dos tramos y 4,37 m de carrera** |
| 16 % de altura libre por encima de 8 m | cuánta **caverna** se excava |
| mediana 2,8 m · p25 2,3 · p75 4,9 · p90 9,3 | la altura libre de **cada tramo** |
| lo construido no llega a un tercio | **68 fachadas**, el 4,8 % de la superficie |
| del spawn al pueblo hay 46 m | las casas no empiezan hasta los **40 m** de camino |
| el 43 % del suelo es zona segura | **110 de 256 celdas** |
| una luz cada 48 m² dentro y 113 fuera | **58 faroles**, 48 y 111 |
| 16 criaderos en 8 377 m² de suelo | **8 criaderos** |

Y la cota cero tampoco se elige: la planta de arriba del jharro es donde acaba el
socavón de Corinth, o sea la reja del fondo de la trinchera, que está a −4,06 m
porque la escalera del pack baja cuatro tramos de 1,015. Se importa `HONDO` en
vez de copiar el número, así que el día que el socavón se haga más hondo el
jharro baja con él.

### Ocho bandas no son ocho plantas, y eso lo dijo una resta

Lo primero que se hizo fue leer las ocho bandas de cota como ocho plantas
apiladas. La cuenta lo tumbó en dos líneas: entre −22 y −20 hay dos metros, y de
esos dos metros 0,6 son la losa de roca. Queda 1,4 m de aire, que no es un
pasillo: es un hueco por el que no pasa nadie.

O sea que las bandas juntas **no son plantas, son terrazas del mismo hueco**. Lo
que separa dos plantas de verdad es un salto grande, y en Gate City hay dos: de
−10 a −4 (6 m) y de −4 a +8 (12 m). Por eso aquí la conexión entre dos bandas se
CALCULA del salto —dos metros, dos tramos de escalera; doce, un pozo, que es lo
que hace Gate City con sus dos `func_ladder`— y la regla vive en una sola
función, `chocaConOtraPlanta()`, que preguntan los dos lados: la excavación para
no abrir la celda y la bóveda para saber hasta dónde subir.

Leídas como ocho plantas apiladas salía un edificio de oficinas subterráneo con
los techos a metro y medio, y no fallaba ni una cifra, porque las cotas eran las
medidas.

### La parte 1: `alcanzables()` en 3D, y su control

`corinth.js` inunda un plano en cuatro direcciones. Aquí hay ocho plantas y lo
único que las une son las conexiones, que son **aristas del plano y no
geometría**: una escalera es una arista entre dos celdas de plantas distintas.

Eso cambia qué fallos existen. En un plano llano, dos celdas vecinas se tocan; en
un jharro, dos plantas no se tocan por mucho que sus celdas caigan una encima de
otra, así que **olvidar una escalera deja una planta entera fuera del mundo sin
cambiar una sola cifra**: el jharro sigue midiendo 256 celdas, sigue dando el
relleno medido y sigue dibujándose entero planta por planta.

La comprobación lleva su control, y el control es el que manda: **quitar
cualquiera de las siete conexiones tiene que aislar algo.** Con las siete puestas
se alcanzan las 256 celdas; quitando una se alcanzan entre 31 y 252. Si
`alcanzables()` inundara las plantas por separado y las sumara, la comprobación
saldría en verde con el jharro partido en ocho trozos sin una sola escalera.

### El dibujo volvió a decir lo que ninguna cifra decía

El plano salía conexo, medía 256 celdas exactas y daba el relleno medido del
31 %: todas las cifras bien. Y el dibujo enseñaba la ciudad apiñada en una
esquina con el tercio sur de la roca sin tocar, y una planta entera convertida en
una columna de trece celdas pegada al margen.

Es el descampado del experimento 03 otra vez, y por el mismo motivo: **las cifras
eran globales y el problema era de reparto**. 256 celdas en una esquina y 256
repartidas dan el mismo 31 %. Se arregló puntuando las direcciones por el hueco
que tienen delante y haciendo la tirada tan larga como pide el presupuesto de la
planta —del orden de √N celdas—, y la mirada quedó puesta en una cifra: cuánto de
la huella excavable cubre la caja de la ciudad, que ahora es el 100 % a lo ancho
y a lo largo.

Lo mismo pasó con las cavernas. Con un saldo global de bóveda por orden de
llegada se lo gastaban las dos primeras plantas que se excavan, y la de −14 —que
es el grueso del jharro, 104 de las 256 celdas— se quedaba entera de techo bajo.
El total de bóveda seguía siendo el 16 % medido.

### La parte 2: la altura libre, medida con la misma vara

`src/kit/medir.js` es el algoritmo de `tools/bsp.mjs` leyendo triángulos en vez
de caras de `.bsp`: reparte las caras horizontales en casillas de 2 m y empareja
cada suelo con el techo más bajo que tenga encima. Medido de otra forma el número
no se puede comparar con nada — y los 2,8 m de mediana que se ponen de objetivo
son los de ESE método. Se mide la GEOMETRÍA y no el plano, que es la diferencia
entre comprobar el mundo y comprobar que una variable vale lo que vale.

La altura de cada sitio no se elige: los tramos del plano —pasillo, cuarto,
bóveda— se ordenan por tipo y se les reparte la curva medida por área acumulada.
El primer 10 % del suelo se lleva el p10 y el último 10 % el p90, así que la
distribución que sale es la que entró **y además correlaciona con el tipo**: los
pasillos se llevan los techos bajos y las cavernas los altos. Repartirla al azar
daría los mismos percentiles y una caverna de nueve metros en mitad de un
pasillo, o sea un sitio que mide bien y no se entiende.

| | el jharro | Gate City |
| --- | --- | --- |
| p25 | 2,20 m | 2,3 |
| mediana | **2,86 m** | 2,8 |
| p75 | 5,11 m | 4,9 |
| p90 | **9,30 m** | 9,3 |
| por debajo de 3 m | 51,8 % | 55 % |
| por encima de 8 m | 15,3 % | 16 % |
| techo / suelo | 102,9 % | 107 % |
| p10 | 1,26 m | **0,8** |

El plano de plantas no sirve para juzgar esto: un jharro dibujado en planta se
parece igual con dos metros de techo que con nueve. Por eso el dibujo de la parte
2 es un CORTE vertical —`build/jharro/corte.svg`— donde se ve el techo de cada
sitio, el contraste entre el pasillo y la bóveda, y las plantas unas sobre otras.

### La corrección que parece trampa y no lo es

Repartiendo la curva medida tal cual, el jharro sale medio metro más bajo de
mediana y metro y pico más bajo de p90. La causa es el propio método de medida:
reparte cada cara por su caja en planta, así que **el pasillo bajo le baja la
cifra a la caverna de al lado**.

Pero ese sesgo está también en la medida de Gate City, porque es el mismo
algoritmo sobre el mismo tipo de geometría: los 2,8 m que se copian de objetivo
ya vienen sesgados. Lo que hay que igualar no es la curva que se reparte, es la
que se MIDE. `GAMMA = 0,66` es esa corrección, un solo número, y salió de
barrerlo y quedarse con el que menos error deja — no de elegirlo. Hay una prueba
que falla si alguien lo pone a 1 pensando que sobra.

### El p10 no llega, y queda escrito

El p10 de Gate City es 0,8 m: una décima parte de sus pares suelo-techo están por
debajo del metro. Ésos **no son sitios por donde se ande** —el jugador mide 2,2 m
de paso— son salientes y vigas sobre un suelo que sí se pisa. Copiar el número
sin más daría un jharro con una cuarta parte de sus galerías intransitables, y la
comprobación saldría en verde porque el objetivo se cumpliría a la perfección.

Así que la cola baja se devuelve donde de verdad está: en **repisas**, salientes
de roca que vuelan 0,9 m de la pared y dejan 3,1 m libres de los 4 de la galería.
Con repisa en todas las celdas de techo bajo que tienen pared, el p10 se queda en
1,26 m. Bajarlo hasta 0,8 pediría plantar todos los salientes a ochenta
centímetros clavados, que ya no es reproducir una curva medida sino forzar un
número. Se dice en vez de disimularlo, y hay una prueba que lo fija para que se
sepa en qué dirección se mueve el día que alguien toque las repisas.

Y las repisas costaron medirlas dos veces. La primera volaba un metro por los
cuatro de la celda, y **un adorno de roca que no estorba a nadie estaba decidiendo
la escala del pueblo entero**: el emparejamiento se queda con el techo más bajo de
cada casilla, así que una repisa que toca una casilla le borra la bóveda a todas
sus muestras. La mediana caía a 2,3 m y el 73 % del jharro quedaba por debajo de
tres metros. Y repartidas a voleo se comían la cola ALTA —una repisa en una
caverna de nueve metros le borra la caverna a la medida— dejando el 16 % de
bóveda en el 9 %.

### La costura, que aquí es entre plantas

El jharro no tiene `.map`: es malla entera, como el valle de `hill.mjs`, así que
no hay `qbsp` que lo juzgue. La costura que sí hay es la de siempre y con el
método de siempre —**una sola función decide de quién es cada celda y las dos
partes la preguntan**— aplicada a tres juntas:

- **entre plantas.** `chocaConOtraPlanta()` dice si dos caben una sobre otra. La
  excavación la pregunta para no abrir la celda; la bóveda, para quedarse a un
  grueso de losa del suelo de arriba. El control: excavando sin preguntarla, el
  choque aparece.
- **entre la roca y los túneles.** El pie de una escalera es de la planta de
  abajo, no del túnel. Lo era de los dos, y la rampa emitía su suelo encima del de
  la planta: dos losas en el mismo plano, que es z-fighting. Lo cazó una prueba
  que cuenta losas por celda y cota, que es la forma de ver un solape sin mirar.
  Y hubo que darle al túnel una celda más de las que pide la carrera de la
  escalera, porque 4,37 m de escalera no caben en 4 m de túnel y la rampa llegaba
  al pie con 37 cm de desnivel: un escalón sin cara.
- **entre la roca y lo construido.** Donde hay fachada, la pared de roca no se
  emite; y por encima de los 3 m de la fachada, SÍ, que es el dintel. Lo mismo en
  la boca de cada túnel: una boca mide 2,3 m y la galería de la que sale puede
  medir nueve, así que saltarse la pared entera dejaba siete metros de agujero
  por encima de la entrada. **Abrir un hueco en un muro deja el resto del muro**,
  otra vez, y esta vez en el techo.

La junta que la parte 3 tenía anotada —«una fachada recta contra una pared que no
lo es»— no hizo falta resolverla, y no por listos: la roca se emitió con las
paredes planas en las juntas de celda para que la costura entre plantas y entre
tramos fuera exacta, así que la cara contra la que se apoya una fachada es un
plano de cuatro metros y encaja a hueso. El día que la roca lleve desplazamiento,
la junta vuelve.

### La parte 3: la casa la coloca la cueva

En Corinth, `pueblo.js` coge una parcela vacía, le mete una casa dentro y la gira
hacia la calle más cercana a la llegada. La medida dice que un jharro no se hace
así: **las casas están pegadas a la cueva, no la cueva construida alrededor de las
casas**.

Así que aquí no hay parcelas. Una casa es una cáscara del kit metida en una celda
de ROCA, con tres paredes enterradas y una a la vista, y el rumbo no se elige: la
casa solo tiene una cara libre, la que da a la galería. El rumbo lo decide la
cueva. Por dentro no hay nada, igual que en Corinth, solo que aquí la excusa es
mejor: por dentro hay roca.

Y lo que decide DÓNDE está el pueblo tampoco se elige. La pieza de muro mide 3 m
justos y una galería puede medir 2,2, porque así lo dice la curva medida: una
fachada de tres metros en un pasillo de dos y pico le saca un trozo de casa a la
roca y le mete el techo por la puerta, y de frente se ve una casa perfectamente
normal. O sea que **lo construido solo cabe en lo ancho**, que es justo lo que
hace Gate City: casas en las salas y pasillos de roca pelada.

Salen 74 fachadas de 154 sitios posibles, 215 piezas de **solo 6 distintas** —54
casas, 13 talleres, 7 almacenes—. Lo de las seis piezas es deliberado y también
sale de la medida: Gate City coloca 101 adornos de 17 modelos y 55 de sus 58
sprites son el mismo fuego. Lo que llena un sitio no es tener muchas cosas
distintas.

Lo construido ocupa el **5,2 %** de la superficie, muy por debajo del tercio que
marca Gate City. La diferencia no es que falten casas: es que el 27 % de Gate City
incluye sus suelos de adoquín, y aquí todos los suelos son roca. Pavimentar las
salas es trabajo de la parte 6 y está anotado.

### El eje del revés, por tercera vez

`house.js` llama «sur» a su cara de z=0, que mira a +Z; el plano cuenta las filas
de norte a sur, o sea hacia −Z. La traducción salió invertida a la primera, con
un comentario que explicaba muy bien por qué, y **las setenta y cuatro fachadas
tenían la puerta contra la roca**.

Aquí ese fallo es peor que en Corinth. Allí una casa girada media vuelta se ve
desde fuera; aquí la casa está metida en la roca, así que lo que se ve desde la
galería es una pared lisa de piedra — que en una cueva es exactamente lo que uno
espera ver. No lo mueve ninguna cifra y no lo caza ninguna captura. Lo cazó la
prueba que le pregunta a la PUERTA YA COLOCADA hacia dónde mira, que es la misma
que salvó a Corinth y por la misma razón: **se comprueba el resultado, no el
criterio que lo produjo**.

### Dos fallos que encontró una sonda, y tres errores de las sondas

- **Las paredes de norte y sur miraban hacia fuera.** El este y el oeste estaban
  bien, que es lo que hace que un fallo así aguante: media pared del mundo es
  correcta y la otra media se ve mal solo desde algunos ángulos. Y aquí por debajo
  de las mallas no hay mundo, así que por esas paredes se ve el color del fondo.
  No lo dice ninguna cifra: las paredes se emiten, se cuentan, y la superficie de
  pared sale igual mire hacia donde mire.
- **Los túneles no estaban apartados.** Un túnel se busca cuando la planta de la
  que sale ya está excavada y las de abajo todavía no, así que la planta siguiente
  excavaba por donde ya pasaba una escalera. La celda estaba libre cuando se miró.
  Dos pruebas distintas lo cazaron a la vez diciendo cosas que parecían no tener
  nada que ver.
- Y tres de los fallos de esta ronda **eran de las sondas**: la del túnel esperaba
  que el pie fuera del túnel, la de las paredes acusó a 217 de 438 de estar del
  revés porque al escribirla no traduje el eje Z —o sea, cometí el error que
  estaba buscando—, y esa misma sonda, en su primera versión, exigía que ningún
  triángulo dentro de una celda mirase hacia fuera: acusaba a las paredes de los
  túneles y a las de las galerías de otra planta, que caen en la misma junta y
  miran, con toda la razón, hacia su propio lado. Lo que hay que exigir no es que
  no haya caras mirando afuera, es que **cada lado que da a roca tenga al menos
  una mirando adentro**.

### 28 juntas sin roca, medidas y no tapadas

Cuando una caverna sube por encima del suelo de otra planta en la columna de al
lado, las dos galerías quedan pegadas por una hoja de papel. No es un agujero
—cada una ve su pared— pero son dos sitios del pueblo separados por cero
centímetros de roca.

Se mide y se deja fijado en una prueba para que no crezca solo, en vez de taparlo.
La forma obvia de taparlo —no dejar que la bóveda suba por encima del suelo del
vecino— recorta las cavernas, que son el 16 % medido y la mitad del contraste; y
la forma fina es no dejar que dos plantas sean vecinas en planta, que es tocar la
excavación entera. Queda para la parte que lo camine con un cuerpo, que es la
única que puede decir si se nota.

### Las partes 4 y 7: la luz y las zonas son el mismo trabajo

No estaba previsto que lo fueran. La parte 4 era «una fuente cada 71 m²» y la 7
no existía. Lo juntó una medida: **la densidad de luz de Gate City no es una, son
dos, y su frontera es exactamente la frontera entre el pueblo y la cueva.** Bajo
tierra la luz no es ambiente: es lo que dice dónde estás a salvo.

| | el jharro | Gate City |
| --- | --- | --- |
| Zona segura | 110 celdas = **43 % del suelo** | 43 % |
| Barrios | 7, el mayor con 47 celdas (43 %) | 8 áreas, la mayor 53 % |
| De la entrada al pueblo | **40 m** | 46 m |
| Criaderos | **8**, uno por cada 524 m² | 16, uno por cada 524 m² |
| Faroles en el pueblo | uno cada **48 m²** de suelo | 48 |
| Faroles en la cueva | uno cada **111 m²** | 113 |
| En conjunto | uno cada **71 m²** | 71 |
| Del suelo a su farol | mediana 5,4 m · p90 11,3 · el peor **18,7** | 3,8 · 10,6 · **43,7** |

La última fila es la única donde no imitamos a la referencia, y es a propósito:
los faroles se reparten por **muestreo del punto más lejano sobre el grafo de lo
pisable** —cada farol va en la celda que está más lejos, POR EL CAMINO, de todos
los ya puestos— así que salen más regulares que colocados a mano. Gate City tiene
un rincón a 43,7 m de su luz más cercana; aquí el peor está a 18,7. Se mide por
el camino y no en línea recta porque en un jharro dos celdas pueden estar a diez
metros y a cien pasos, y un farol al otro lado de un metro de roca no ilumina
nada.

El color y el alcance tampoco se eligen. `info_texlights` de Gate City declara
UNA textura emisiva y dice exactamente `"pi_lantern" "255 255 128 100"`: un
blanco de vela, el mismo que usa su `light_environment`, así que el mapa entero
está en la misma temperatura. Y el alcance es su p90 medido, 10,6 m. El farol se
genera, porque el kit CC0 no trae ninguno — como las vallas.

### Se entra por la cueva, no por el pueblo

Es lo que más contradice lo que habríamos hecho. Lo obvio es una ciudad
subterránea con la puerta en la plaza; Gate City pone al jugador a **46 m del
pueblo más cercano y a 13 m del primer monstruo**, con las dos salidas del mapa
junto al punto de llegada. El fondo del mapa no es lo difícil: es lo lejos.

Sin esa regla, el jharro ponía ocho fachadas en la misma planta de la entrada y
el pueblo empezaba **a cuatro metros de la reja de Corinth**: bajabas el socavón
y ya estabas en la plaza. No fallaba nada —el 43 % de zona segura salía igual de
clavado— y se perdía entero lo que la llegada tiene que contar. Ahora
`LEJOS_DE_LA_ENTRADA` son los 46 m medidos, aplicados **por el camino**, y la
planta de la entrada se quedó con dos casas en vez de ocho.

### Un 43 % que era confeti

Y la misma clase de fallo otra vez, en las zonas. El primer reparto crecía desde
las fachadas hasta llegar al 43 % y paraba. Salía clavado — y el pueblo eran
**doce trozos sueltos repartidos por seis plantas, con el mayor al 20 %**,
incluidas dos celdas de «zona segura» a 236 m de profundidad en el fondo del
mundo.

Gate City tiene ocho áreas y la mayor se lleva el 53 %: un pueblo grande y unos
cuantos rincones. Los dos repartos miden el mismo 43 % de suelo seguro y solo uno
de los dos es un pueblo. Ahora se crece generosamente desde todas las fachadas y
se eligen **barrios enteros, los más grandes primero**, y salen 7 con el mayor al
43 %. Es el tercer caso de la misma familia en este experimento: **una cifra
global no ve un problema de reparto.**

### Lo que las zonas declaran, y lo que no

`src/kit/zonas.js` declara SITIOS y no pone ni un monstruo:

- **zona segura y cueva**, con la frontera derivada de dónde hay casas;
- **8 criaderos**, en cueva, separados entre sí y elegidos los más lejos de la
  frontera primero —un criadero pegado al pueblo escupe bichos dentro de la zona
  segura en cuanto uno camine dos celdas, y eso no lo dice ninguna densidad—;
- **58 celdas de zona de principiantes**: la cueva pegada al pueblo. En Gate City
  la rata y el esqueleto están a unos 15 m de la frontera y el tesoro a unos 30,
  mientras que lo duro está a 33 m de la ENTRADA, en la otra punta. Lo de empezar
  no está en el confín: está en el sótano de casa, que es donde tiene que estar
  para que un jugador nuevo pueda volver andando;
- **2 transiciones**, como Gate City: el socavón de Corinth a 0 m —ya existe, no
  se inventa— y los portales del fondo a 248 m, que es lo que el lore de Corinth
  lleva escrito desde el principio.

Poner los bichos es otra cosa y no toca todavía: el jharro **aún no lo ha andado
nadie**, y de los cinco fallos gordos de Corinth cuatro los encontró un cuerpo y
ninguno una cifra. Hay una prueba que falla si alguien empieza a colocar
monstruos aquí.

### Y se anda: `?map=jharro`

El jharro no tiene `.map`, así que el visor tuvo que aprender dos cosas que no
sabía. Una, que **un nivel puede no tener worldspawn**: sin brushes no hay malla
de `.map` que dibujar, y la roca se dibuja con el atlas del kit, que es donde
están sus UV. Y dos, que **un mundo puede estar bajo tierra**, que no es un ajuste
de gusto: arriba el sol lo enseña todo y la luz solo dice la hora; aquí lo que
está iluminado es lo que existe. Con el sol puesto, los 58 faroles repartidos con
dos densidades medidas no deciden nada: son adorno.

La prueba de humo lo dijo a la primera, y acusando a quien no era: **«1,5 m
andados en doce segundos: el jugador está atascado»**. No estaba atascado —
estaba empujando la pared correcta de un mundo correcto. La celda de entrada está
pegada al margen de roca por el norte y el rumbo por defecto mira justo para allá.
Ahora el nivel declara hacia dónde se mira al llegar, y sale de por dónde se
puede ir: 45,5 m andados. Es el mismo eje del revés de siempre, y aquí el síntoma
habría sido una captura de frente de una bonita pared de roca.

### Lo que la cobertura decía y el ojo desmintió

La sonda de fotogramas de Corinth mide **cobertura**: la fracción de píxeles que
no son del color de la niebla. Arriba eso significa algo, porque la niebla es
lila. Bajo tierra la niebla es casi negra **y la roca sin farol también**, así que
la primera tanda de fotogramas del jharro dio esto:

```
pasillo    cobertura 95,7 %    64 colores
```

y era una **pantalla negra**. La cifra decía que se veía casi toda la pantalla.

Ahora cada toma se mide además por LUMINANCIA —qué fracción de la pantalla pasa
de 32 sobre 255, que es donde deja de distinguirse una pared de un agujero— y esa
misma toma daba el **0,0 %**. Es la tercera sonda de este experimento que dice
que sí cuando no, y la primera que lo dice sobre algo que se puede ver.

### La luz de una cueva no cae como la luz física

El pasillo estaba negro por una razón concreta y de dos partes. Three.js
multiplica la luz de un punto por `(1 − (d/D)⁴)²`, que a nueve de cada diez
metros del radio ya ha recortado el **96 %**: un farol con `distance` igual a su
alcance medido NO alcanza su alcance medido. Y GoldSrc hornea sus mapas de luz
con caída **lineal** hasta el radio, no con la cuadrática de la luz física — o
sea que los 10,6 m de p90 de Gate City son de ese modelo, y copiar la proporción
sin copiar el modelo es medir con otra vara.

Corregido de golpe salió lo contrario: con el radio al doble, la caverna daba
**brillo mediano 185 de 255**, todo iluminado por igual y ni una sombra. En el
pueblo hay un farol cada 48 m², así que al doblarles el radio a los cincuenta y
ocho se solapan todos con todos, y se perdía justo lo que hace legible una cueva
—el contraste— por arreglar lo contrario. Los números finales (radio ×1,5,
caída lineal, 18 candelas) salen de un criterio escrito y comprobado: ninguna
vista por debajo del 25 % de pantalla visible, ninguna con el brillo mediano por
encima de 200, y el pueblo más claro que la cueva. Sale el pueblo entre 113 y
135, y el pasillo de la cueva en 22.

### El agujero negro que ninguna cifra vio

Y lo que de verdad encontró mirar: **las siete conexiones verticales no tenían ni
un farol.** El reparto recorre celdas de SUELO, y el túnel de una escalera o el
hueco de un pozo no son suelo de ninguna planta: son celdas de túnel. Así que lo
único que une las ocho plantas del jharro —lo único de verdad nuevo del
experimento— estaba a oscuras, con las dos densidades medidas saliendo clavadas.

El fotograma del pozo era un rectángulo negro con una mancha iluminada doce
metros más abajo. Ahora cada conexión lleva su farol, **descontado del cupo de la
cueva** para que la densidad medida no cambie por añadirlos, y puesto a un lado
del túnel y no en el eje de paso, que es la lección de la cuerda del torno de
Corinth.

| | |
| --- | --- |
| `llegada` | se ve el **85,1 %**, brillo mediano 83 |
| `caverna` | **99,5 %**, brillo 127 |
| `fachadas` | **99,4 %**, brillo 113 |
| `pasillo` (cueva) | **34,5 %**, brillo 22 |
| `frontera` | **99,9 %**, brillo 132 |
| `pozo` | **1,7 %** — sigue siendo un agujero negro, y está anotado |
| control, todo apagado | **0,00 %** |

### Lo que la semilla decide, y con qué criterio

La semilla de la excavación es arbitraria por definición, así que elegirla no es
afinar nada **mientras el criterio esté escrito y se pueda repetir**. El criterio
es el del experimento: que la ciudad cubra la huella que le dio la medida y que la
altura libre salga lo más cerca posible de los siete números de Gate City.
`npm run jharro:semillas` repite el barrido de las doce semillas y enseña por qué
la elegida es la 101.

## Lo que decide el experimento

**Rapier corre en Node.** `src/play/player.js` no importa Three.js, y esa línea
es la mitad del resultado: subir un escalón de 16 unidades, no trepar uno de 24,
no atravesar una pared y aterrizar en el suelo se comprueban sin abrir un
navegador y sin mirar nada.

**Three.js también corre en Node** para todo menos la llamada de dibujo. La
geometría, los grupos de material, la niebla, las luces y la esfera envolvente
se comprueban en `node --test`. Lo único que queda fuera es el render en sí.

**El truco de `qbsp` se lleva puesto tal cual.** `tools/verdict.mjs` compila con
`-leaktest` y tira el `.bsp`; no interesa el resultado, interesa el veredicto.
Lleva dos sondas de control —una sala sellada y una con fuga— porque un juez que
dijera que sí a todo pasaría por juez sin que nada lo avisara.

## Las reglas del 02, aplicadas

- **`exit 0` no significa correcto.** `verdict.mjs` exige planos y caras
  distintos de cero; `World` se niega a construirse con una malla de cero
  triángulos, porque en un mundo vacío el jugador cae para siempre y la prueba
  de caminar mide un desplazamiento perfecto en el vacío.
- **Contrastar todo medidor contra verdad conocida.** El volumen con signo de un
  cubo tiene que dar exactamente un metro cúbico y positivo: si el bobinado
  estuviera invertido el cubo se vería igual de plausible. `plaza.map` se
  contrasta contra `plaza.meta.json`, que escribió el emisor del 02 y es
  independiente de este cargador.
- **Los caminos de error, ejercitados a propósito.** Llaves descuadradas, caras
  de dos puntos, `origin` mal escrito, brushes degenerados, mundo vacío, y un
  escalón de 24 unidades que **no** se debe poder subir.

## Hallazgos sobre el experimento 02

El 02 está congelado y aquí no se toca. Se deja constancia, con las cifras
fijadas en `test/plaza.test.mjs`:

- **La puerta de plaza está enterrada.** La losa de `door01` ocupa de z=-80 a
  z=-64, dos metros por debajo del suelo jugable, dentro del macizo. Es la
  «puerta invisible» que `NEXT_SESSION.md` menciona: pasaba todas las
  comprobaciones porque ninguna miraba si la geometría se ve.
- **`plaza.meta.json` y `plaza.map` no coinciden en tres cotas.** El meta
  declara cuatro texturas y el mapa usa cinco (falta `door01`); el meta pone la
  puerta en z=24 y el mapa el `trigger_level` en z=-40; el meta pone la llegada
  en y=736 y el mapa el `info_player_arrive` en y=416.

## Los fotogramas, y por qué hicieron falta

`npm run shot` levanta el servidor, abre Chromium, coloca al jugador en seis
sitios sacados de `plaza.meta.json`, lo deja andar, y guarda siete PNG en
`build/shots/`. **Cada captura se mide además de guardarse**, porque un PNG que
nadie mira no comprueba nada:

- **cobertura** — fracción de píxeles que no son el color de la niebla. Una
  captura casi toda niebla es una cámara mirando al vacío.
- **colores** — una pantalla de un solo color es el equivalente visual de un
  mundo vacío que compila sin fugas.
- **velo** — qué elemento del HTML hay en el centro de la pantalla, y si el
  jugador toca suelo en cada posición. Una toma desde un sitio donde no se
  puede estar retrata un lugar que no existe, por bonita que salga.

Esto no es precaución teórica. **La primera vez que esta sonda se abrió en un
navegador, con las 55 comprobaciones en verde, la pantalla estaba tapada**: la
regla `#intro { display: flex }` ganaba al `display: none` que trae el atributo
`hidden`, así que el velo de entrada nunca se quitaba y el juego corría debajo.
Nada falló. La segunda cosa que solo se vio mirando fue que el mapa salía casi
negro: desde r155 Three.js mide las luces puntuales en candelas, y la intensidad
que parecía razonable dejaba plaza a oscuras.

Dos fallos, los dos silenciosos, los dos con todas las comprobaciones en verde.

## Lo que todavía no está comprobado

El enemigo de sprites de ocho direcciones, las texturas de verdad (ahora hay
colores planos por nombre de textura), y el viaje entre niveles.

Las capturas se miden, pero nadie compara un fotograma con el anterior: un
cambio que empeore el aspecto sin bajar la cobertura pasaría. Comparar contra
PNG de referencia es el siguiente escalón, y el momento de ponerlo es cuando
haya texturas de verdad y merezca la pena fijar el aspecto.

## Referencia visual

El artefacto que motivó el experimento es `The Castle Road`. De él se llevan dos
cosas, elegidas a mano: el render a **320 px de ancho** escalado con
`image-rendering: pixelated`, y la niebla `FogExp2` en `#8D8DB6` —la misma
fórmula `1 - exp(-(densidad·d)²)` que usaba su shader—. Su iluminación por
shader propio se deja fuera a propósito: la sonda no la necesita y cada capa de
por medio hace más difícil el arnés de verificación, que es el activo caro.

## Escala y ejes

Dos conversiones, en `src/map/geometry.js` y en ningún otro sitio:

- **32 unidades de Quake = 1 metro**, igual que `UNITS_PER_M` en `mapstats.py`.
- **Quake es Z arriba, Three.js es Y arriba:** `x, y, z → x, z, -y`. El cambio
  conserva la mano derecha, así que el bobinado sigue valiendo y las normales
  no hay que darles la vuelta.

## El pueblo

`npm run village` lee el plano de planta que hay escrito a mano en
[tools/village.mjs](../tools/village.mjs) y calcula el `.map`. El plano se lee como
un mapa visto desde arriba:

```
##########################
#.....t..........t.......#
#..AAA...,,,,,,,,...CCC..#
#..AAA...,......,...CCC..#
...
```

`#` muralla · `.` hierba · `,` camino · `o` plaza empedrada · `w` pozo ·
`t` árbol · `A`-`J` casas · `@` donde aparece el jugador.

Lo único escrito a mano es ese dibujo y una tabla con la altura de muro y la
subida de tejado de cada casa. Todo lo demás —brushes, tejados a dos aguas,
troncos, entidades, sellado del cielo— lo calcula
[src/map/emit.js](../src/map/emit.js). Es la regla del 02: **no pedir al modelo que
invente geometría, calcularla**.

El emisor comprueba dos cosas antes de escribir nada: que cada letra de casa
llene un rectángulo exacto (una casa en L no es un brush convexo y saldría con
agujeros) y que no haya casas en la tabla que falten del plano.

### La orientación de las caras la pone la máquina

`brushFromFaces()` recibe los vértices de cada cara **en cualquier orden**,
calcula el centro del brush, y le da la vuelta a la cara que mire hacia dentro.
No es comodidad: un brush con una cara invertida no da error, `qbsp` lo descarta
con «no visible sides» y esa pared sencillamente no está. Acertar a mano el
sentido de giro de los dos faldones de un tejado, que miran a lados contrarios,
sale mal una vez de cada tres y no avisa —me pasó al escribir esto.

## El aspecto retro

No es un filtro. Son cuatro cosas que ya lo hacían así en su momento:

- **Render a 320 px de ancho**, escalado con `image-rendering: pixelated`.
- **Texturas de 128 px** con filtro `nearest` al ampliar. Mipmaps al reducir,
  porque sin ellos una pared lejana en un fotograma de 320 px hierve, y eso no
  es retro, es ruido.
- **Niebla exponencial cuadrática** cuya densidad **se calcula del tamaño del
  mapa**. Una constante es un error: la calibrada para una sala de 20 m deja un
  pueblo de 100 lavado de lila entero.
- **Árboles como carteles instanciados** con recorte duro por alfa, girados en
  el shader de vértices. Dos triángulos por árbol, 1 900 árboles.

### Texturas y licencias

Nueve de [Poly Haven](https://polyhaven.com/license), **CC0**, reducidas a
128 px. `tools/fetch_textures.py` las baja **y escribe
[PROCEDENCIA.md](../public/textures/PROCEDENCIA.md)**: la ficha de licencia no
puede depender de que alguien se acuerde de editarla a mano.

Cuatro son nuestras y las calcula `tools/make_textures.py`: el cielo (senos de
frecuencia entera, única forma de que la tesela no tenga costura —medida:
2,5·10⁻³), la marca de puerta, y las siluetas de árbol y arbusto. El script
comprueba cada una **por lo que es**: costura cero a las que se repiten, y
porcentaje de opacidad a las siluetas. Una silueta vacía no da error al
cargarse: sale un cartel invisible, y el bosque entero desaparece.

## Lo que se vio mirando, y ninguna cifra delataba

Cuatro fallos silenciosos en esta tanda, todos con las pruebas en verde:

1. **El velo de entrada tapaba el canvas.** `#intro { display: flex }` ganaba al
   `display: none` del atributo `hidden`. El juego corría debajo.
2. **El mapa salía casi negro.** Desde r155 Three.js mide las luces puntuales en
   candelas; la intensidad que parecía razonable no iluminaba nada.
3. **El pueblo estaba sobre un pedestal y con dos franjas de vacío.** El agujero
   del terreno de fondo era cuadrado y el pueblo es rectangular. Lo destapó una
   captura aérea.
4. **El bosque era un muro morado.** El shader de los carteles llevaba la
   densidad de niebla escrita a mano, cuatro veces la de la escena. Ahora
   `buildBillboards()` **se niega a construirse sin la niebla de la escena**.

Y uno de las capturas mismas: varias tomas tenían la nariz contra una pared.
Salían con 96 % de cobertura y doce mil colores —aprobando todas las medidas— y
no enseñaban nada. **Una medida buena no hace buena una toma.**

## Micro-elevaciones

Aviso sobre el vocabulario, porque lleva a error. **Heightmap, displacement y
deformation no se pueden aplicar aquí.** Todas esas técnicas mueven los
*vértices* de una malla. Un brush no tiene vértices que mover: sus vértices son
el resultado de cortar sus planos. Moverle uno lo deja no convexo, y `qbsp` lo
rechaza o lo sella mal.

La forma que sí funciona, y la que usaban Quake y Half-Life, es **escalonar**.
[src/map/relief.js](../src/map/relief.js) reparte alturas de ruido sobre una
rejilla de losas de 2 m, cuantizadas a 8 unidades (25 cm), en un rango de ±16
unidades: **1 m de desnivel entre el punto más alto y el más bajo del pueblo**,
en 5 niveles.

### La garantía, que es lo único que importa

**Dos celdas vecinas nunca se llevan más de un escalón.** No porque el ruido
salga suave —no sale: con onda corta el ruido cuantizado deja saltos de dos y
tres escalones—, sino porque después se aplana hasta que se cumple, y
`worstStep()` lo comprueba. El emisor aborta si no se cumple.

Sin eso, un salto de dos escalones es un muro de medio metro que el jugador no
sube, y el pueblo se parte en trozos incomunicados **sin que nada falle**: el
mapa compila, sella, se ve bien y no se puede cruzar. Es el fallo silencioso
perfecto.

El aplanado solo **baja** celdas, nunca las sube. Eso es lo que garantiza que
termine: un proceso que solo decrece sobre enteros acotados no puede dar vueltas
para siempre. En el pueblo converge en 1 pasada.

### Lo que hay que reasentar

Todo lo que se apoya en el suelo tiene que consultar el terreno, o queda
flotando o enterrado sin dar error: los troncos de los árboles, el brocal del
pozo, el punto de aparición y las luces de fachada.

Las casas llevan **zócalo nivelado**, apoyado en la cota **más alta** de su
huella, no en la media: con la media, la esquina más alta del terreno
atravesaría el suelo de la casa y se vería un pico de hierba dentro del salón.
En la realidad se resuelve igual y por la misma razón.

La muralla y las losas de suelo arrancan todas por debajo de la cota más baja
del pueblo, no desde su propia altura: si cada una colgara de su cota, entre dos
losas a distinto nivel quedaría una rendija por la que se ve el vacío, y bajo la
muralla una fuga que `qbsp` cantaría.

### El coste, y la alternativa más fina

El pueblo pasó de 268 a **716 brushes** y de 1 587 a **3 134 caras**; `qbsp`
sigue tardando 1,3 s. La optimización de fundir tramos seguidos de suelo ahora
solo vale cuando coinciden material **y** altura.

A ras de suelo, los escalones se leen como bandas horizontales tenues. Un
escalón de 4 unidades (12,5 cm) los partiría por la mitad a cambio de pasar de
~347 a ~586 tramos de suelo. Una losa de 1 m en vez de 2 m daría grano más fino
todavía, a ~1 213 tramos.

## Las otras dos formas de relieve

El escalonado de arriba es la primera de tres. Las otras dos existen porque el
artefacto de referencia tiene un suelo que ondula de verdad, y la pregunta era
cómo lo hace. Las tres salen del mismo plano y se pueden comparar andando:

| | Qué es | Juez | Cifras |
| --- | --- | --- | --- |
| `?map=pueblo` | Una cota por **celda**; entre celdas, un peldaño | `qbsp` | 986 brushes, 4745 caras, 1 m de desnivel |
| `?map=pueblo-rampas` | Una cota por **esquina**; la celda, inclinada | `qbsp` | 4929 brushes, 7522 caras, 1,94 m |
| `?map=colina` | **Malla de altura**, sin `.map` | escrito a mano | 10 944 triángulos, 288 × 288 m, 16 m |

### Dónde vive la altura: la diferencia entera

En [src/map/relief.js](../src/map/relief.js) la altura vive en la **celda**: una
celda entera está a una cota, y entre dos celdas hay un canto vertical. Por eso
salen terrazas.

En [src/map/slope.js](../src/map/slope.js) vive en la **esquina**, y la celda es la
superficie que queda entre cuatro esquinas. Por eso sale una pendiente. Una
rejilla de *w* × *h* celdas tiene (*w*+1) × (*h*+1) esquinas, y **las esquinas
se comparten entre celdas vecinas a propósito**: es lo que hace que dos celdas
contiguas encajen sin rendija, tanto en brushes como en malla.

Ese mismo archivo lo usan las dos opciones nuevas, que es lo que permite
comparar: lo único distinto entre `pueblo-rampas` y `colina` es qué se hace con
las alturas, no de dónde salen.

### Rampas: dos prismas por celda

`slab()` en [src/map/emit.js](../src/map/emit.js) emite **dos prismas triangulares
por celda**, no una pieza. No es una optimización: cuatro puntos con cuatro
alturas distintas no son coplanarios, así que «la cara de arriba» de una sola
pieza no existe como plano. Tres puntos siempre lo son.

Las alturas se **redondean a entero**. Los planos del `.map` se escriben con
cuatro decimales, y una cara inclinada con decimales le da a `qbsp` un plano que
no es exactamente el del vecino: aparecen rendijas de una diezmilésima por las
que se cuela la luz y, con mala suerte, el sellado.

**La garantía cambia de forma pero no de naturaleza.** Allí era «dos celdas
vecinas no se llevan más de un escalón»; aquí es «dos esquinas vecinas no se
llevan más de `maxDrop`», donde `maxDrop` sale de 40°: seis grados por debajo de
`PLAYER.maxSlopeDeg`, que son 46. Al límite justo, un redondeo deja una ladera
por la que se resbala sin motivo aparente. `worstDrop()` lo comprueba y el
emisor aborta.

La celda del pozo se **nivela bajando**, nunca subiendo: el brocal y su marco de
suelo son piezas horizontales y sobre una ladera dejarían una esquina en el
aire. Bajando se preserva el argumento de terminación; subiendo podría romper el
límite de pendiente de una vecina.

Coste: de 986 a **4929 brushes**, porque con rampas no se pueden fundir tramos
seguidos — cada celda tiene su propia inclinación. `qbsp` tarda 5 s en vez de
1,3 s y sigue sellando.

### La prueba que de verdad distingue las dos

Es la que costó pensarla. Medir caras verticales en la malla **no vale**: todas
las losas tienen costados de dos metros, sólo que enterrados bajo la losa de al
lado. Lo que se nota al andar es la superficie de arriba, así que se mide la
superficie de arriba, con rayos desde el cielo:

| | muestras | con peldaño ≥ 6 unidades | salto peor |
| --- | --- | --- | --- |
| `pueblo` | 976 | 18 (1,84 %) | 8,00 unidades |
| `pueblo-rampas` | 976 | **0** | **0,75 unidades** |

Sin esta prueba, un emisor que se olvidara de inclinar la cara de arriba
produciría exactamente el pueblo escalonado y las otras ocho comprobaciones de
`test/rampas.test.mjs` seguirían en verde.

De paso, un fallo silencioso propio: **`castRay` de Rapier no toca nada hasta
que se da un `world.step()`**, porque el árbol de colisiones está vacío. Sin ese
paso devolvía `null` en todos los puntos, y `null` se lee aquí como «ahí hay un
tejado»: la prueba pasaba sin haber medido una sola muestra.

## El valle de malla, y lo que cuesta

[src/map/terrain.js](../src/map/terrain.js) es la tercera opción, la del artefacto.
Conviene decir claro lo que cuesta antes de mirarlo: **aquí `qbsp` deja de
opinar**. No hay brushes, no hay sellado que compilar, y el veredicto automático
del experimento —«`qbsp` dice si el mundo está cerrado»— no aplica a este nivel.

Así que **se cambia el juez, no se quita**. [tools/hill.mjs](../tools/hill.mjs)
mide tres cosas y las contrasta contra dos sondas de control:

```
  valle                10944 triangulos, 72x72 celdas de 128 unidades (288 m de lado)
  malla contra campo   31968 vertices, error maximo 0.0000 unidades
  16 marchas al cuenco 0 escapes, se meten 241 unidades en el cuenco de 384 permitidas,
                       hundimiento maximo 15.8, 0.8% en el aire
  control agujero      hundimiento maximo 84296.8 unidades
  control sin cuenco   se meten 770 unidades fuera del valle
```

1. **Cada vértice está donde dice el campo.** Es la lección del medidor de áreas
   del 02: *un medidor que se equivoca no falla, da una cifra plausible*. Si el
   generador de malla y el campo se separaran, el jugador andaría sobre un suelo
   que no es el que ve y la pantalla seguiría siendo bonita.
2. **Dieciséis marchas no salen ni se hunden.** Lo que contiene al jugador no es
   una pared: es que la montaña tiene una pendiente que no se sube.
3. **Los dos controles tienen que fallar.** Con el suelo agujereado el jugador
   *tiene* que caer; sin las montañas *tiene* que salirse. Sin ejercitar esos
   caminos, «nadie se cayó» no significa que el suelo esté entero: significa que
   nadie lo comprobó.

### Una medida en verde que no ejercita nada

La primera versión de la marcha salía del centro del valle y daba **0 unidades
de intrusión en el cuenco**: aprobaba sin haber tocado la montaña. El jugador
anda 70 m en catorce segundos y el cuenco estaba a 140. Ahora cada marcha
arranca pegada al borde y mirando hacia fuera, y empuja 241 unidades ladera
arriba antes de pararse.

Es el mismo error que ya se documentó con las capturas: *una medida buena no
hace buena una toma*. Aquí, una medida en verde que no llega a ejercitar lo que
mide es peor que no tenerla.

### Lo que el cuenco no puede pasar por el limitador

El ruido pasa por el limitador de pendiente porque es lo que se pisa; **el
cuenco se suma después, a propósito**. Si pasara por el limitador saldría una
cuesta cómoda y el mundo estaría abierto por los cuatro lados sin que nada
fallara. `test/terrain.test.mjs` comprueba las dos mitades por separado: lo
andable cumple la pendiente, y el cuenco tiene que incumplirla por más del
triple.

### Lo que sí sale gratis

El nivel de malla devuelve **la misma forma de objeto** que `loadLevel()` para
un `.map`. Por eso `main.js`, `buildScene()`, `meshGeometry()` y el `World` de
Rapier no distinguen un nivel del otro, y no hay una sola línea de código
especial para la malla en el motor. Si hubiera un camino aparte para cada uno,
lo que se comprueba en el pueblo no diría nada del valle.

Las plantas se siembran consultando la altura del **punto exacto** en el que
caen, interpolada entre las cuatro esquinas, no la de la celda. Es lo que separa
un terreno con relieve de un tablero con cosas encima. Con la esquina más
cercana, un árbol junto a una línea de la rejilla queda medio metro fuera de su
ladera, y eso no da ningún error: se ve un árbol flotando, si es que alguien
mira.

## Fachadas y pozo

### Un hueco no se resta, se rodea

No se le puede «restar» una ventana a una pared. Un brush es un sólido convexo
y quitarle un trozo lo deja cóncavo. `panelWithHoles()` en
[src/map/emit.js](../src/map/emit.js) parte el panel en piezas que rodean los
huecos: tramos llenos entre hueco y hueco, y el dintel y el antepecho de cada
uno. Comprueba además que dos huecos no se pisen en horizontal, porque dos
brushes superpuestos no dan error — solo caras que parpadean.

El cuerpo de la casa se mete 7 unidades hacia dentro por el lado de la fachada
y la fachada se monta encima en piezas, así que el hueco queda **hundido de
verdad** y no es una mancha pintada.

### Cuál es la fachada no se decide a mano

Se cuenta en el plano cuántas celdas de calle hay pegadas a cada uno de los
cuatro lados de la casa, y gana el que más tiene. Con casas colocadas a mano,
poner la puerta al lado equivocado es facilísimo y no da ningún error:
simplemente queda una puerta mirando a un campo.

La variedad —textura del muro, posición de la puerta, cuántas ventanas,
chimenea sí o no— sale de la letra de cada casa. Determinista: el mismo plano
da siempre el mismo pueblo, que es lo que permite comparar capturas.

### El pozo

`ring()` emite 16 prismas en círculo. No puede ser una pieza: un anillo es
cóncavo por dentro. Con ocho lados se ve ochavado; con dieciséis se lee como
redondo.

El pozo es un **agujero real** en el suelo: se omite una losa y las cuatro
vecinas hacen de paredes sin emitir un brush más, porque ya bajan hasta el
mismo fondo que las demás. Abajo, una tapa y el agua.

Esa tapa no es opcional y `qbsp` lo demostró: la primera versión dejaba el
boquete abierto al vacío y **no selló**. El radio interior del brocal (40) es
menor que la media diagonal del hueco cuadrado (45), así que el anillo vuela un
poco sobre las cuatro esquinas y tapa que el pozo es cuadrado por dentro.

## Portón, matas y plaza

### Un portón tiene que sellar

Un pueblo amurallado sin puerta no se lee como un pueblo. Pero un hueco en la
muralla **es una fuga**: al otro lado está el vacío, y `qbsp` no sellaría, con
razón. Así que el portón va cerrado con dos hojas de madera, que además es lo
que tendría un pueblo de verdad según a qué horas.

El vano es un **túnel** a través del metro de grosor de la muralla, así que las
jambas van a los lados del paso. El primer intento las puso cruzándolo: **selló
igual de bien** y se veía ladrillo macizo donde tenía que haber puerta. Una
prueba mide ahora el grosor de la hoja contra el de la muralla, porque contar
brushes no distingue un portón de un tapiado.

### Las matas

104 carteles `misc_bush`, sembrados por el emisor en la hierba —nunca en las
calles ni en la plaza— y con más probabilidad pegados a una fachada o a la
muralla, que es donde crecen. Sin colisión y sin brush: una mata de metro y
medio que parase al jugador sería un obstáculo invisible en mitad de la calle.

Deterministas, de las coordenadas de su celda.

### Cosas del tamaño de una persona

Puestos de mercado, barriles y un crucero. Una plaza vacía de cien metros se lee
como un solar, porque no hay nada con lo que comparar la escala.

Los barriles son `ring()` con ocho segmentos. El pozo lleva tejadillo porque el
brocal solo se lee como pozo desde encima, y desde el otro lado de la plaza
—que es de donde se mira— hacía falta algo que asomara.

### Una entidad que no dibuja nadie es invisible

Regla del 02, aplicada al revés: una prueba comprueba que **no haya en el `.map`
ninguna clase de entidad puntual que el render no sepa dibujar**. Añadir un
`misc_barril` y olvidarse de pintarlo no daría ningún error — solo un barril
invisible.

## Más fallos que sólo se vieron mirando

A la lista de antes se suman, todos con las pruebas en verde:

5. **Por la boca del pozo se veía el adoquín de la plaza.** El radio interior
   del brocal (40) lo calculé contra la media diagonal del hueco (45) cuando lo
   que manda es su media anchura (32): quedaba una repisa de suelo iluminado
   dentro del pozo en vez de vuelo.
6. **Los escalones del relieve parecían tablones tirados en el suelo.** El canto
   de cada losa llevaba `wall01`, ladrillo oscuro, así que un pliegue del suelo
   se leía como un objeto. Ahora el canto lleva la misma textura que la
   superficie: un escalón de hierba es de hierba.
7. **El portón estaba tapiado**, como se cuenta arriba.
8. **Los postes de madera salían grises.** Con escala de textura 1, una tesela
   cubre cuatro metros y un poste de medio metro enseña un octavo de la
   textura: sale de un color liso y la madera parece hormigón pintado. Las
   piezas pequeñas usan escala 0,25.

## Vegetación de un pack CC0

Los arbustos ya no son procedurales: son las ocho siluetas del **Retro PSX
Style Tree Pack de Elegant Crow**, CC0.
`tools/import_vegetation.py` las copia **y escribe la ficha de licencia**, que
no puede depender de que alguien edite un `.md` a mano.

Del pack sólo sirven los arbustos. Los `treeNN.png` son **atlas** para sus
modelos `.fbx` —tronco en una franja, copa en otra—, así que como cartel
saldría el tronco estirado al lado de la copa. Los árboles siguen siendo los
procedurales.

### El «flotan» tenía una causa medible

Las siluetas del pack vienen centradas en su lienzo con aire por debajo, porque
van mapeadas sobre un modelo y ahí el aire no importa. El shader planta el
cartel por el **pie de la imagen**, así que ese aire se convertía en separación
entre la mata y el suelo. El importador lo mide (`pie NO` en las ocho) y las
asienta: recorta a la caja de lo opaco y las repega pegadas abajo. Ahora falla
si alguna no toca el pie.

### Y los arbustos salían oscuros porque el shader no convertía a sRGB

Three.js convierte de lineal a sRGB al escribir, pero **sólo en los shaders que
monta él**. Un `ShaderMaterial` propio escribe lo que le pongas. Como las
texturas sí se decodifican de sRGB al cargarlas, sin `#include
<colorspace_fragment>` se escribían valores lineales en un framebuffer sRGB y
todo el follaje salía a media luz. No fallaba nada: sólo parecía que los
arbustos estaban en sombra, y las texturas del pack ya son oscuras de suyo
(luma 23 a 102, hechas para que las ilumine un motor).

## El pozo, a escala

El primero medía **4,25 m de diámetro exterior**: un aljibe. Medía eso porque
el hueco del suelo era una losa entera de 64 unidades, y un brocal tiene que
tapar el hueco. Ahora el suelo de esa celda se emite como un **marco de cuatro
tiras** alrededor de una boca de 26 unidades, y el pozo mide 1,6 m.

Lleva plataforma octogonal, brocal, cuatro postes, vigas, tejadillo a dos aguas
y cubo. **Cuatro postes y no dos**: con dos, desde la dirección en la que están
alineados se ve uno detrás del otro y el pozo se lee como una seta.
