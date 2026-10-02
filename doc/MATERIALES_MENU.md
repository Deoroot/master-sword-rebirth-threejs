# Materiales del menú — continuación de la torre 58

El usuario describió las superficies como planas y de un solo color. Autorizó
una pasada sobre la torre y el cráter cercano; la posible dirección retro se
deja expresamente para después. Se conserva composición, cámara, geometría,
cielo y dirección del sol para poder evaluar los materiales por separado.

## Diagnóstico y cambios

El shader anterior de la torre reducía mucho las diferencias entre bloques,
multiplicaba toda la piedra por una luz casi uniforme en la cara en sombra y
no perturbaba la normal según el relieve. El suelo añadía ruido a su normal,
pero ese ruido no procedía de la altura de las vetas dibujadas.

`src/render/superficiesmenu.js` concentra el relieve y la respuesta a la luz:

- Gradientes de altura mediante derivadas de pantalla y posición mundial.
  Cambian las normales con las que se ilumina cada píxel.
- Luz solar compartida con la escena, relleno frío del cielo y una respuesta
  especular GGX con rugosidad variable. El cielo reflejado es una aproximación
  analítica; no un cubemap ni un reflejo del paisaje.
- Filtrado de reflejos cuando las normales varían rápidamente entre píxeles.
- Roca con depósitos minerales, estratos deformados, fracturas, grano y humedad.
  Su proyección toma también coordenadas verticales; no estira un ruido XZ
  sobre las paredes.

La torre combina piedra de tonos fríos y terrosos, ancho y desplazamiento de
hilada variables, mortero, biseles simulados, desgaste y depósitos. Conserva
una fachada oscura, pero la luz del cielo permite distinguir algunas piedras
y variaciones de relieve. La roca del cráter comparte la misma respuesta de
superficie, conservando su atenuación por profundidad y la bruma existente.

Los controles `relieveMaterial`, `variacionMaterial` y `acabadoMaterial` son
uniformes de diagnóstico independientes. No se añade una opción ficticia al
menú del juego. No se generaron imágenes ni se añadieron assets al repositorio.

## Iteraciones y errores encontrados

La primera imagen reveló juntas demasiado dominantes y reflejos demasiado
puntuales sobre roca mojada. Se redujeron el oscurecimiento del mortero y su
oclusión; se añadió filtrado de la reflexión según variación de la normal.

La primera prueba de las paredes modificaba su material compartido y contaba
píxeles de todo el valle. Pasaba la reflexión húmeda gracias al suelo, aunque
apenas cambiaban las paredes. Se corrigió creando una máscara de píxeles al
ocultar únicamente la geometría de las paredes; el control entonces falló.
Es la diferencia entre probar una función de material y probar dónde se ve.
Se corrigió la distribución de humedad: antes se concentraba en el fondo
oscuro; ahora hay escorrentías bajo el borde y salpicadura próxima a la
cascada. El control de reflexión pasa también dentro de la máscara de pared.

## Verificación

`npm run sonda:materialesmenu` congela la vista, comprueba un control quieto y
compara variación de albedo, acabado y relieve dentro de las máscaras visibles
de torre y paredes. Para medir el relieve desactiva antes variación de color y
acabado: un dibujo de manchas sobre una normal plana no debería pasar.

`MENU_SIN_RELIEVE=1` altera sólo el código servido, poniendo a cero el relieve
por omisión. Permite verificar que esa avería es detectada sin editar la fuente.
Las capturas se guardan bajo `build/menu/materiales/`; no sustituyen las del 58.
Se ejecutó ese control negativo: dio cero cambio de relieve en ambas máscaras
y falló específicamente en «piedra: el relieve cambia la luz sin variación de
albedo». El valor de producción permanece en uno.

La sonda de materiales pasa con el shader final. A 1200×800, el relieve sin
variación de color cambia 6,27% de la imagen dentro de la máscara de torre y
1,58% dentro de la máscara de paredes. La variación de albedo cambia 8,91% y
1,92%; el acabado, 0,154% y 0,080%, respectivamente. Son porcentajes del lienzo
completo, contando sólo los píxeles de cada máscara, no porcentajes de la
superficie. El control quieto cambia cero. No son notas de calidad artística.

`node --test --test-concurrency=1 test/`: 1521 pruebas correctas. La compilación
de producción pasa; conserva el aviso de tamaño del paquete principal.
Una ejecución intermedia de la sonda 57 se interrumpió por una recarga de Vite
al editar el shader durante la prueba. No era un resultado de regresión válido;
las sondas finales se ejecutan secuencialmente con los shaders ya congelados.
La repetición final de `sonda:torre57` pasa los cuatro formatos, Options y la
entrada a Edana. `sonda:torre58` pasa volumen, fisura, sombras, MSAA y restauración
del renderer incluso con excepción. El dibujo estable conserva 42 llamadas y
184 106 triángulos enviados: esta pasada cambia sombreado, no densidad de malla.
`sonda:menu52` termina **19/19**, sin errores de página: fondo vivo, pintura de
respaldo, recorrido, paralaje y entrada a Edana. Las tres sondas vecinas finales
se completaron sobre los shaders definitivos, sin cambios durante su ejecución.

La captura final es `build/menu/materiales/final-validado/menu.png`. El archivo
`build/menu/materiales/comparar.html` permite alternar y comparar la vista sin
interfaz del 58 con la actual mediante un deslizador. La fase del cielo puede
diferir ligeramente porque se congela después del arranque de cada captura.

## Límites

Es relieve de sombreado, no desplazamiento geométrico: no introduce pequeñas
muescas en la silueta ni sombras geométricas de cada piedra. La reflexión del
cielo y la oclusión de las juntas son aproximaciones. No convierte los
materiales en MeshStandardMaterial ni supone iluminación global completa.

Esta pasada hace legibles los materiales cercanos. El paisaje lejano y el
cielo conservan su tratamiento anterior; la exploración de un estilo retro
sigue pendiente, por petición del usuario.
