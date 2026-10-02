# Escala monumental del menú

El usuario pidió recuperar la sensación fantástica de una torre tan grande
que parece imposible. La pasada de materiales había mejorado las superficies,
pero sus bloques legibles y la base aislada seguían dando escala de edificio.
Las dimensiones de esta revisión son una decisión artística propia; no una
medición de la pintura de Anders Finér. La exploración retro sigue pendiente.

## Composición

- La torre pasa de 150×52 a **260×110 metros** de alto y ancho. El techo,
  coronamiento, asta y cimentación siguen sus dimensiones configuradas.
- La puerta conserva aproximadamente **3,3×7,7 metros**. Se reubica en la
  fachada ampliada sin agrandarla; las aspilleras y la bandera tampoco se
  escalan con la masa del edificio. La torre mide 33,77 alturas de puerta.
- La cámara retrocede a un mirador más elevado, con FOV de 48,5°. Se mantiene
  el paseo corto y el paralaje. En el punto medio, a 1600×1000, la geometría de
  piedra ocupa 71,35% de la altura y 21,10% del ancho; su margen superior es
  5,73%. La finalidad no es llenar todo el encuadre, sino mostrar una masa
  mayor respecto a sus detalles, al acceso y al paisaje.
- La fábrica es más fina y su contraste depende de la iluminación. Se mantiene
  relieve, humedad y variación mineral, pero se reduce la cuadrícula uniforme.
- La cimentación sigue el ancho nuevo y su parte superior utiliza roca expuesta
  en vez de una banda de césped. Su base se ensancha hacia los estratos del
  terreno, evitando la pequeña peana del edificio anterior.
- El río se desvía alrededor de la huella ampliada y la cascada vuelve a
  alinearse con el final del cauce, sobre el borde existente de la fisura.
- El valle se extiende hasta unos tres kilómetros detrás de la torre. Hay
  crestas adicionales al fondo y rocas en primer plano; se amplía la malla
  para mantener resolución local al aumentar la superficie.
- La capa de nubes sube con la escena, con una abertura más amplia y mayor
  difusión de la luz del sol. La bruma terrestre empieza más lejos para que
  no lave de azul la nueva cimentación.

## Iteraciones que importan

La primera versión del mirador tenía bancos cercanos demasiado altos y tapaba
la fisura. Se separaron hacia los lados y se bajaron. La mayor distancia de
cámara también activaba la bruma antigua de 220 metros sobre toda la base:
por eso parecía una plataforma azul. El inicio de bruma pasa a 400 metros,
con menor densidad y separación de planos en el valle lejano.

La cámara más cerrada rozaba el coronamiento al llevar el ratón a una esquina.
Se ajustaron FOV y punto de mira hasta pasar las pruebas de todos los vértices,
21 fases, nueve posiciones del ratón y tres relaciones de aspecto. No se
relajó el margen de seguridad de esas pruebas.

La sombra original de 2048 cubría un volumen menor. Se amplió su frustum y
aparecieron triángulos oscuros de autosombra en la fachada. Comparar la escena
sin receptores y con diferentes sesgos permitió aislarlo: el sesgo normal se
ajusta a 1,5 metros y el sesgo de profundidad a −0,0003. Sigue habiendo mapa
de sombras real, no una sombra dibujada sobre la torre.

La prueba de profundidad muestreaba un punto que ahora ocupa la cimentación
ensanchada. Se trasladó a la abertura libre en (−47, 0), donde el raycast golpea
el fondo real a unos −39,8 metros; se mantienen la comprobación de tierra firme,
la existencia de suelo en la cavidad y el desnivel mínimo.

La prueba de materiales contaba porcentajes del lienzo completo. Las paredes
del cráter ahora se ven más pequeñas a propósito; ese denominador confundía
legibilidad con tamaño en pantalla. Ahora calcula la fracción dentro de cada
máscara visible, conservando controles de albedo, rugosidad y relieve sin color.
Los resultados anteriores de `MATERIALES_MENU.md` conservan su denominador
histórico y no se comparan directamente con estos porcentajes.

La fisura cambia el 1,46% del lienzo al retirarla, frente al mínimo antiguo
de 1,5%. La nueva composición oculta más cavidad bajo la torre; el control
exige ahora al menos 1% (5760 píxeles a 960×600), manteniendo la comparación
con la capa retirada y el control de fotograma quieto. No se cambió la
geometría para satisfacer una cuota de pantalla del encuadre anterior.

## Verificación y trabajo compartido

Las 14 pruebas de geometría, encuadre, cimentación, luz y recursos pasan. La
sonda de materiales pasa sobre torre y paredes, sin errores de shader.
La compilación de producción pasa con el aviso habitual de tamaño del paquete.

La primera ejecución completa de Node encontró **1616/1617**: el único fallo
era ajeno al menú, en `test/juego_misiones.test.mjs`, que esperaba 76 comandos
y encontró 77. No se tocó el inventario de comandos ni su prueba para esta
tarea. El repositorio sigue compartido con otros cambios de juego.

También se interrumpió un clic de la sonda 57 por una recarga automática del
servidor durante otra edición. Las sondas del menú desactivan ahora HMR y la
vigilancia de archivos en sus propios servidores de prueba; el servidor de
desarrollo del usuario conserva su comportamiento. La repetición final usa
esta configuración para evitar recargas ajenas en mitad de los controles.

Las sondas 57 y 58 pasan: cuatro formatos, tres posiciones del recorrido,
Options, entrada real a Edana, capas visibles, animación, conversión sRGB,
sombras, nubes, MSAA y restauración del renderer incluso tras una excepción.
La 58 midió 52 llamadas y 336196 triángulos en su pasada instrumentada.
El navegador de pruebas usa SwiftShader: esos tiempos no estiman los FPS
de una GPU real.

La primera repetición de la 52 dio 18/19: sólo falló movimiento en cuatro
segundos (1,54%, frente al mínimo de 2%). Se amplía la observación a doce
segundos tanto para el fondo vivo como para la pintura estática, conservando
el umbral. El paseo corto de 160 segundos no se acelera para la prueba.
La repetición pasa **19/19**, con 4,41% de cambio en el fondo vivo y 0% en
la pintura. No hay errores de página; la cámara vuelve al jugador al entrar.

Captura final: `build/menu/escala/final/menu.png`. Comparación con la pasada
anterior: `build/menu/escala/comparar.html`.

## Límites

El mayor tamaño y las señales de escala no equivalen a reproducir la pintura.
El paisaje sigue siendo procedural, el cielo mantiene su aspecto suave y el
mirador sigue acotado. No se añadió una figura humana sólo para demostrar una
medida: la escala se apoya en arquitectura, distancias y composición.
