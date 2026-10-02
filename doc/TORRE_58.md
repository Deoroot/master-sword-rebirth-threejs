# 58 — Fisura, contraluz y render propio del menú

El usuario pidió continuar el 57 con una fisura bajo la torre, nubes de gran
volumen y luz tenue. Aclaró también que los límites adoptados para Gate City
no debían determinar la calidad de esta escena. Esta revisión mantiene la
composición del 57 y cambia su geometría, iluminación y pasada de render.
Es una interpretación de la referencia de Anders Finér, no una reproducción
de su pintura ni una regla del motor original.

## Cambios visibles

- La torre se apoya sobre una cimentación de roca que llega hasta el fondo de
  una grieta de aproximadamente 39 metros. Las paredes tienen repisas,
  estratos y socavados. Hay suelo real al fondo y bruma dentro de la abertura.
- La superficie del valle termina en el borde de la fisura. El río llega a
  ese borde y su cascada cae siguiendo la tangente final del cauce.
- La fachada queda en contraluz, con humedad y juntas discretas. Las caras
  iluminadas conservan detalle; la fachada principal se lee como silueta.
- Nubes volumétricas de densidad tridimensional, deriva lenta, erosión de
  bordes y absorción de luz. Se recorren 64 muestras por rayo y hasta dos
  posiciones hacia el sol para estimar la sombra dentro de la nube.
- Sombras proyectadas por la geometría y suavizado MSAA en el menú real.

## Arquitectura y parámetros

`src/play/torre.js` contiene `LUZ_DEL_MENU` y `CALIDAD_MENU`. La primera define
dirección, luz directa y ambiente; `uniformesDeLuz()` crea referencias
compartidas para cielo, agua, suelo y torre. El sol que dibuja las sombras
sigue esa misma dirección. La segunda configura:

| Parámetro | Valor inicial | Efecto |
| --- | ---: | --- |
| `muestras` | 4 | MSAA del destino del menú, limitado por el formato y la GPU |
| `mapaSombras` | 2048 | Resolución del mapa de profundidad del sol |
| `pasosNubes` | 64 | Muestras de volumen por rayo; el shader admite 12–96 |

`src/render/pasadamenu.js` usa un destino lineal RGBA16F cuando está disponible
y RGBA8 como alternativa. Consulta las muestras compatibles tanto con color
como con profundidad; `MAX_SAMPLES` por sí solo no garantiza esa combinación.
La salida convierte a sRGB una vez. Destino, cara/mipmap, espacio de color,
`autoClear` y ajustes de sombra del renderer compartido se restauran incluso
si falla el dibujo. La iluminación de los mapas conserva su tratamiento previo.

`src/render/sombrasmenu.js` utiliza un sol direccional y PCFSoftShadowMap.
Los materiales procedurales reciben la sombra mediante mallas superpuestas
con ShadowMaterial que comparten geometría. Esto añade llamadas de dibujo,
pero no duplica los buffers de vértices. El mapa de sombras sólo se actualiza
cuando cambia el sol o se restaura el contexto WebGL: sus proyectores son
estáticos; agua y bandera animadas quedan fuera de ese mapa.

`src/render/cielotorre.js` genera una Data3DTexture periódica de 64³ bytes al
crear la escena. Su densidad usa varias escalas de ruido. El shader integra
transmisión y luz dentro de una capa de atmósfera, desde la posición de la
cámara. La textura y los recursos compartidos se liberan al destruir la escena.

`src/render/fisura.js` concentra contorno, paredes, cimentación, fondo y bruma;
`valle.js` recorta su terreno contra ese contorno. La apertura no depende de
pintar negro sobre una superficie intacta. Todo se genera desde código: no hay
assets nuevos ni escrituras en `../MSC/`.

## Lo que salió mal durante la revisión

La primera fisura combinaba una superficie hundida con paredes separadas.
Sus pendientes se superponían y dejaban grandes láminas de hierba. Se retiraron
los triángulos interiores mediante recorte en el borde; las paredes ahora son
responsables del desnivel. También se ajustó la orientación de la cascada,
que parecía una cinta doblada sobre la pendiente anterior.

La primera capa de nubes analíticas quedó casi plana y gris. Se sustituyó por
volumen real. El primer volumen seguía demasiado suave; se añadió erosión con
otra escala de densidad. A 32 pasos aparecía grano visible: se aumentaron a 64
y se redujo la variación del inicio del rayo. Sigue siendo una aproximación
procedural; tener volumen no garantiza por sí solo calidad pictórica.

Una captura histórica no pudo sobrescribirse en Windows (`UNKNOWN` al abrir
el PNG). Las sondas 57 y 52 ahora aceptan `MENU_CAPTURAS` para guardar cada
revisión en otra carpeta, conservando las anteriores.

## Comprobaciones

La sonda `npm run sonda:torre58` compara imágenes al retirar fisura,
cimentación y cascada; desactivar receptores de sombras; vaciar la textura de
densidad; invertir el sol; y dibujar sin MSAA. El mismo fotograma debe producir
cero cambios. También verifica restauración del renderer con éxito y con una
excepción deliberada. Guarda imagen y medidas en `build/menu/vistas/`.

Las pruebas de `test/atmosfera58.test.mjs` lanzan rayos sobre la cimentación
para comprobar el apoyo de las cuatro esquinas, miden profundidad respecto a
tierra firme, cambian la luz compartida y verifican la liberación del volumen.

La sonda 57 conserva su prueba de conversión de color, cuatro tamaños de
ventana, tres puntos del recorrido, Options y entrada a Edana desde Create
Server. Su medición de color se realiza ahora en la pasada final del menú,
porque el dibujo de la escena es intermedio y lineal. La sonda vecina 52
comprueba también pintura de respaldo, paralaje y entrada al juego.

Resultados de la verificación:

- `node --test --test-concurrency=1 test/`: **1399/1399**, sin omisiones.
- `npm run sonda:torre57`: pasa conversión de color, formatos, opciones,
  entrada a Edana, retirada de capas y movimiento, sin errores WebGL.
- `npm run sonda:menu52`: **19/19**, sin errores de página. La pintura de
  respaldo cambia 0,00%; la escena viva cambia 3,97% durante cuatro segundos.
- `npm run sonda:torre58`: pasa, sin errores de shader ni de página. A
  960×600, quitar la fisura cambia 9,15% de los píxeles; quitar las sombras,
  12,19%; vaciar el volumen, 37,48%. MSAA cambia 1,27% con su umbral de dos
  niveles de color. El control quieto cambia exactamente cero.
- Control negativo: `MENU58_SIN_SOMBRAS=1` desactiva `receiveShadow` sólo en
  el código servido por Vite. La sonda falla en «el mapa de sombras oscurece
  geometría visible», con diferencia cero. No se modifica el archivo fuente.
- Compilación de producción correcta. Permanece el aviso de Vite por el
  tamaño del paquete principal; no se hizo una división de ese paquete.

Capturas de revisión en `build/menu/vistas/regresion58/` y `menu52-58/`.
La captura final y las medidas específicas del 58 se guardan en `final58/`.
El render estable mide 42 llamadas y 184 106 triángulos enviados, contando
receptores de sombra y pasada de salida. La primera actualización del mapa
de sombras tiene trabajo adicional. La configuración efectiva de Chromium
fue RGBA16F y cuatro muestras.

## Límites que permanecen

La escena sigue compuesta para un recorrido de cámara acotado. No es un
entorno explorable ni usa iluminación global, dispersión atmosférica completa,
sombras de nubes proyectadas al terreno o reflejos físicos del paisaje en el
agua. La bruma de la fisura es una capa transparente, no niebla volumétrica.
Los materiales de roca y vegetación siguen necesitando más trabajo artístico.

El navegador de las sondas utiliza SwiftShader por software. Su tiempo de
envío de órdenes no mide el coste de la GPU. La medición de la sonda 58 fuerza
una lectura de la imagen terminada e incluye la copia a CPU; tampoco debe
publicarse como FPS del juego o rendimiento de la tarjeta del usuario.
En esta ejecución la mediana de render más lectura fue 443,8 ms a 960×600;
es una observación del navegador por software en este entorno, no un objetivo
de rendimiento. Una medición inicial de 0,2 ms sólo medía envío de órdenes
pese a llamar a `gl.finish()`; se descartó y se corrigió la sonda para leer los
píxeles terminados. Falta perfilar la escena en la GPU real del usuario.
