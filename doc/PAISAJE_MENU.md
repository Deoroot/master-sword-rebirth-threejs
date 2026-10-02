# Cielo y paisaje del menú

Después de la pasada de escala, el usuario pidió mejorar las formas del cielo
y del terreno. Se mantiene la torre de 260 metros y su encuadre; esta revisión
trabaja sobre la escenografía procedural, no sobre los mapas jugables.

## Qué cambia

- Nubes con cobertura más amplia y una abertura irregular detrás de la torre.
  La textura 3D tiene dos canales: ruido para distribuir las masas y distancia
  celular para sus lóbulos. La erosión combina ambas señales, en vez de repetir
  el mismo ruido a todas las escalas.
- Tres muestras hacia el sol separan el borde iluminado del interior oscuro.
  Un relleno de cielo más frío depende de la altura dentro de la nube. Se
  conservan los 64 pasos y la iluminación solar compartida con el terreno.
- Cuatro mesetas intermedias y otra lejana sustituyen varios montículos. Sus
  contornos se erosionan a dos escalas, sus cimas se inclinan y sus bordes
  combinan una pendiente fuerte con una transición más ancha hacia la vega.
- Menos ondulación pequeña sobre el suelo abierto. Las manchas de pradera
  son más amplias y el detalle fino pierde contraste con la distancia.
- La capa de sombra se desvanece cerca del límite del frustum del sol. La
  sombra sigue saliendo del mapa de profundidad real, pero ya no termina
  bruscamente sobre una ladera que sale de su cobertura.

No se aumentó la malla del terreno ni la resolución del mapa de sombras. La
textura de nubes pasa de 256 a 512 KiB de datos base y se añade una consulta
de densidad hacia el sol por cada muestra ocupada del volumen. Esto sí supone
trabajo extra de shader; los tiempos de SwiftShader no predicen FPS de GPU.

## Lo que enseñaron las previews

La primera versión tenía nubes demasiado lisas y mesetas demasiado planas.
Se separó la forma celular de la cobertura, se inclinaron y ondularon las
cimas, y se ampliaron los pies de las laderas. El relieve nuevo también
expuso un corte triangular del mapa de sombras que el terreno anterior
disimulaba: se corrigió en el borde de cobertura, sin subir el sesgo global.

La escena sigue siendo una interpretación estilizada. El río aún tiene un
ancho y un recorrido demasiado regulares; no se cambió en esta pasada. Las
nubes conservan suavidad y no pretenden ser una reproducción de la pintura.

## Verificación

Pasan 34 pruebas de geometría, encuadre, cimentación, luz, liberación de
recursos, idioma y procedencia. Pasa la compilación de producción, con el
aviso habitual de tamaño del paquete.

Pasa la sonda 58: retirar nubes cambia el 30,89% de píxeles, retirar sombras
el 18,31%, y el control de imagen quieta da cero. También verifica fisura,
agua, MSAA y restauración del renderer tras éxito y excepción. Cuenta 52
llamadas y 336196 triángulos en su pasada instrumentada, igual que antes.

El control negativo con `MENU58_SIN_SOMBRAS=1` falla precisamente al exigir
sombras visibles. La sonda 57 pasa también sus cuatro formatos, tres puntos
del paseo, Options, entrada a Edana, movimiento y ausencia de errores WebGL.

La primera repetición de la 52 dio 18/19 por movimiento (1,93%, mínimo 2%).
Se encontró un problema de medida: el motor limita cada paso a 0,25 segundos,
así que esperar doce segundos de pared no asegura doce de animación en
SwiftShader. La sonda observa ahora ocho segundos del uniforme de tiempo
del cielo que usa el render real. No escribe ese reloj ni llama al animador;
si se detiene, agota el plazo. Mantiene el mínimo de 2% y observa el mismo
intervalo con la pintura estática. Esto sustituye la espera de doce segundos
documentada en la pasada de escala, sin reescribir aquel resultado.

La repetición de la 52 pasa **19/19**: fondo vivo 5,03%, pintura 0%, sin
errores de página. Pasa asimismo la sonda de materiales: albedo, acabado y
relieve sin color siguen siendo visibles en torre y paredes de la fisura.
Los registros están junto a las capturas en `build/menu/paisaje/`.

Capturas de esta iteración en `build/menu/paisaje/prueba-c/`. Comparación con
la pasada de escala en `build/menu/paisaje/comparar.html`.
