# 57 — La torre y el valle del menú

El usuario comparó el fondo 3D con la pintura de Anders Finér y pidió mejorar
su escala y atmósfera. Esta revisión cambia la composición del menú; es una
interpretación propia de esa referencia, no un mapa ni una regla portada de MSR.
Los intentos anteriores quedan documentados en `TORRE_54.md` y `MENU_52.md`.

## Diagnóstico

La versión anterior combinaba una torre muy escalonada, colinas recortadas en
planos, suelo casi negro y una viñeta intensa. Aunque la torre medía 150 metros,
la imagen no daba suficiente información para percibir distancias: la base y
el terreno desaparecían. El atardecer naranja también se apartaba del valle
verde bajo cielo luminoso de la referencia.

Había además dos fallos técnicos:

- El render compartido emula la salida lineal de GoldSrc. Los colores de esta
  escena se habían elegido suponiendo salida sRGB, que sí usaba la vista previa.
  La piedra oscura quedaba prácticamente negra en el menú real. El cielo
  anterior tampoco incluía la conversión de salida en su shader.
- Los índices del fuste orientaban sus triángulos hacia dentro, aunque el
  atributo normal dijera lo contrario. El descarte de caras se decide por los
  índices. Las supuestas tapas de cornisa repetían las caras inclinadas.

La comparación anterior de niebla también era engañosa: `brumaEnLaTorre()`
calculaba una exponencial de distancia euclídea, mientras el material usaba
`THREE.Fog`, que aplica otro cálculo. Aquellas pruebas validaban la fórmula
aislada, no el efecto renderizado.

## Qué cambió

- `src/play/torre.js`: composición, torre de paredes casi verticales, cornisa
  discreta, aspilleras, almenas y cámara. El paseo es corto y lento. En ventanas
  estrechas se amplía el campo vertical para conservar el encuadre horizontal.
- `src/render/torre.js`: fábrica de piedra con variaciones, juntas, humedad,
  diferencia de luz entre caras, puerta y bandera. Geometría orientada hacia
  fuera y piezas fusionadas. La escena dispone de liberación de recursos.
- `src/render/valle.js`: terreno continuo con relieve, praderas, roca, cauce,
  cascada animada, sombra de la torre y aire que separa las colinas lejanas.
- `src/render/cielotorre.js`: masas de nubes procedurales con bordes iluminados
  y deriva suave, abertura clara y horizonte frío. No utiliza imágenes.
- `src/main.js`: cámara propia con orden `YXZ` y salida sRGB sólo durante el
  dibujo del menú, restaurada mediante `finally` antes de renderizar el juego.
- `src/juego/menums.js`: viñeta localizada a la izquierda para que siga visible
  el terreno. El subtítulo dice `Rebirth`; ya no presenta Gate City como si fuera
  el único mapa. Las acciones y créditos se conservan.

Todo se genera desde código, sin assets nuevos ni escrituras en `../MSC/`.
La pintura original sigue siendo el respaldo de la interfaz.

## Lo que se corrigió mirando

El primer render del valle encerraba la torre entre colinas altas y cercanas.
El río aparecía interrumpido porque la malla del terreno lo tapaba, y las rocas
parecían bloques sueltos. La segunda pasada abrió la llanura, bajó las colinas,
ensanchó y despejó el cauce, añadió contraste entre luz y sombra y redujo las
rocas aisladas. Los estratos iniciales dibujaban líneas de nivel demasiado
evidentes; se sustituyeron por variaciones irregulares de material.

La vista previa también tenía un fallo de medición: `vista.en(s)` colocaba la
cámara, pero el siguiente fotograma recuperaba el paseo anterior antes de la
captura. Ahora mantiene la fase solicitada y congela el tiempo para comparar.

## Comprobaciones

`npm test`: **1391/1391**, ninguna omitida. Las antiguas pruebas de decisiones
artísticas —paleta naranja, muchas ventanas, base tapada— se sustituyen por
pruebas de la geometría que realmente se dibuja. Diez pruebas comprueban:

- orientación, caras repetidas y triángulos degenerados, incluyendo el control
  que invierte deliberadamente un triángulo y exige que se detecte;
- puerta y cimentación respecto al edificio;
- encuadre de todos los vértices en 21 fases, nueve posiciones del ratón y tres
  formatos de pantalla, incluyendo 720×900;
- deformación real de la bandera, estabilidad a tiempo cero, geometría finita
  y liberación única de recursos compartidos.

`npm run sonda:torre57` abre el menú real, captura tres fases en cuatro formatos
de ventana, comprueba que caben sus opciones, abre Options y entra a Edana por
Create Server. También comprueba que la salida lineal del juego se restaura.
En el banco de pruebas retira torre, valle, cielo y cascada por separado y exige
que cada retirada cambie píxeles. Contrasta una imagen congelada con otra tras
avanzar el tiempo. No pretende convertir una medida de píxeles en una nota
artística. Las capturas quedan en `build/menu/vistas/`.

La salida sRGB se comprueba también por píxeles: se intercepta un dibujo real
del menú y se repite con salida lineal, sin mover escena ni cámara. Si el menú
volviese a dibujar en lineal, la comparación sería idéntica y fallaría.
Control negativo ejecutado: un plugin temporal de Vite reemplazó sólo en
memoria la asignación sRGB de `main.js` por salida lineal. La nueva sonda
falló precisamente en esa comparación, antes de recorrer las capturas.

La compilación de producción pasa. Conserva la advertencia de Vite por el
tamaño del paquete. El escenario contiene 52 287 triángulos y 14 mallas;
estos son conteos de geometría, no una promesa de fotogramas por segundo.

La sonda vecina `menu52` conserva sus controles de pintura de respaldo, paralaje
y entrada al juego. Se actualiza su umbral de piedra, que suponía negro sin
conversión, y la entrada final: desde el 53 el menú inicial no tiene una sesión
en la que crear un personaje por atajo. Ahora entra desde Create Server.

La primera ejecución del control de respaldo dio un 91% de cambio: su primera
captura era negra y la segunda ya contenía la pintura. Se esperaba un plazo
fijo de 300 ms; ahora se espera a que la imagen termine de decodificarse antes
de comparar. La ejecución simultánea de dos sondas gráficas también agotó el
tiempo de una captura panorámica; las verificaciones gráficas finales se
ejecutan una tras otra.

Resultado final en Chromium: **torre57 pasa** y **menu52 pasa 19/19**, sin
errores de página ni de shader. La pintura de respaldo cambia **0,00%** entre
capturas una vez cargada. Se verificaron Options y la entrada a Edana por clic.

La repetición final de Node con `node --test --test-concurrency=1 test/` vuelve
a pasar **1391/1391**. Una repetición concurrente anterior quedó esperando en
`red_27.test.mjs` mientras se ejecutaban comprobaciones gráficas; se detuvo sólo
esa ejecución propia. No se modificó la red para resolver una espera de pruebas.

## Límites

Es un escenario compuesto para una cámara limitada. El cielo simula volumen
con ruido y diferencias de densidad; no son nubes volumétricas. La sombra del
edificio está calculada para esta composición, no mediante shadow maps. La
topografía y los materiales son procedurales, y conservan menos riqueza e
irregularidad que la pintura. La medición en Chromium no es un perfil de
rendimiento de todos los dispositivos del usuario.
