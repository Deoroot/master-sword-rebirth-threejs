# Fisura, río y carácter arquitectónico

El usuario aprobó completar las tres pasadas pendientes después del cielo y
el paisaje. Se conserva la escala de la torre y su encuadre.

- La fisura tiene entrantes más profundos bajo las repisas. Trece fragmentos
  angulares se apoyan en terreno sólido junto al labio, fusionados en una
  sola malla; la bruma se concentra cerca de la caída y la abertura frontal.
- El río sustituye la sucesión regular de curvas por cambios de dirección
  más amplios, un remanso ensanchado y orillas irregulares. El ancho local
  se comparte con el tallado del lecho. Se conserva el ajuste del agua a la
  malla visible para no abrir huecos sobre sus triángulos lejanos.
- El material del agua combina reflejo según el ángulo de vista, zonas más
  oscuras de poca profundidad y espuma menos uniforme. Su bruma usa ahora
  el mismo inicio, densidad y color lineal que el terreno.
- Algunas almenas pierden una esquina. Se añaden escorrentías localizadas
  bajo las cornisas y una fisura fina en la fábrica. El contraste sigue bajo;
  no se llena la torre de decoración ni de nuevas luces.

## Correcciones durante la revisión

La primera distribución de derrubios podía colocar centros dentro de la
cavidad usando una altura de terreno que ya no se dibuja allí. Ahora se
desplazan hacia fuera mediante la distancia firmada de la misma fisura hasta
alcanzar terreno sólido. Sólo los extremos sobresalen del labio.

La primera preview del río seguía pareciendo una cinta clara. La bruma del
agua empezaba a 180 metros, frente a 400 en el terreno, y usaba un color
lineal más claro. Se alinearon ambos tratamientos y se oscurecieron las
orillas; la revisión no se limitó a cambiar el color base.

También había una costura de altura entre agua y cascada: el río se ajustaba
a la malla real, pero el salto partía de una altura nominal. Ambos usan ahora
el mismo cálculo. En las orillas se midieron alturas de 1,109 y 1,187 metros;
el salto enlaza con una separación de un centímetro. La prueba nueva mide
las dos orillas y el centro sobre las geometrías que monta la escena.

## Validación

Pasan 35 pruebas de encuadre, geometría, cimentación, conexión del agua, luz,
recursos, idioma y procedencia. Pasa la compilación de producción con su
aviso habitual de tamaño del paquete. No se repitió la suite completa del
juego para estos cambios de escenografía.

La sonda 58 pasa las comprobaciones de volumen, fisura, sombras, agua, MSAA
y restauración del renderer. Los fragmentos añaden dos llamadas (malla y
capa de sombras): la pasada instrumentada pasa de 52 a 54, con 336716
triángulos frente a 336196. Los tiempos de SwiftShader no estiman FPS reales.

Pasan también las sondas 57 y de materiales: cuatro formatos, tres posiciones
del recorrido, Options, entrada real a Edana, animación y ausencia de errores
WebGL, además de albedo, acabado y relieve visibles. El control negativo de
la costura carga en un proceso aislado la antigua altura nominal del salto:
la prueba falla por separación entre río y cascada, sin modificar el fuente.

Las capturas y registros están en `build/menu/detalles/`; la comparación
con la pasada anterior está en `build/menu/detalles/comparar.html`.

El agua sigue siendo una superficie procedural, sin simulación hidráulica
ni reflejos de escena. Los daños arquitectónicos son intencionadamente
escasos; parte de su detalle sólo se distingue al mirar con atención.
