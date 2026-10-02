# 54 · La torre: el menú deja de mirar al juego

> `src/play/torre.js` · `src/render/torre.js` · `test/juego_torre.test.mjs` ·
> `sondas/torre52.mjs` · `sondas/torre.html` · `sondas/menu52.mjs`

**Qué se pidió:** después de ver el fondo de Gate City del [52](MENU_52.md),
*«creo que nos conviene crear una escena del menú principal propia, inspirada en
la imagen original con una torre de fantasía medieval»*, y sobre cuál:
*«reproducir la escena del menú original no sería una mala idea en sí dado que sí
tiene un buen estilo medieval y misterioso (honestamente, siempre me puso algo
triste que esa torre gigante no esté en el juego)»*.

Y el problema, que lo señaló él y era el bueno: *«el problema me parece más es
perspectiva y escala, su torre al parecer es gigantesca y tendríamos que hacer
unos buenos trucos de escala para hacer que se vea bien»*.

**Estado:** el menú principal tiene detrás una escena propia —una torre de
planta cuadrada a contraluz, al atardecer— generada entera por código. **1 401
pruebas de Node**, `sonda:menu52` **19 de 19**, `sonda:arranque36` 30/30,
`vite build` limpio.

---

## 1. Por qué se dejó el fondo de mapa del 52

Dos motivos, los dos medidos:

- **Gate City no tiene horizonte.** 137 caras de cielo y todas son techo
  (`sondas/dondecielo.mjs`). El barrido 2 del 52 fue debajo de la mayor —427 m²—
  y las dieciséis capturas salieron sin un píxel de cielo. No hay contraluz
  posible en ese mapa.
- **El encuadre no aguantaba el trayecto.** Los dos miradores se eligieron de una
  foto en `s = 0`, y el recorrido dura noventa segundos. Jugando se veía un
  tejado cortando el tercio superior. Ver el apartado 4.

Y de propina: una escena propia **no necesita mapa**, que es lo que el
[53](ARRANQUE_53.md) estaba peleando por el otro lado.

## 2. Nada de esto lleva un binario

`test/procedencia.test.mjs` no admite archivos binarios en el repositorio. La
escena entera —geometría, cielo, nubes, resplandores— se genera por código, y las
dos texturas se pintan en un `<canvas>` al arrancar. No hay `.glb`, no hay
`.png`, no hay nada que licenciar.

**La pintura de Anders Finér no se reconstruye ni se calca**: se usa como
referencia de género, igual que se usaría una fotografía de un castillo. Y sigue
siendo el respaldo del menú cuando la escena no se puede montar.

## 3. La escala, que era la pregunta

Que algo se lea como gigante no depende de sus metros. Las cinco pistas, cada una
con su prueba en `test/juego_torre.test.mjs`, porque son justo lo que se pierde
sin que nada se ponga rojo:

| pista | qué hace | cómo se comprueba |
| --- | --- | --- |
| 1 · bruma sobre la torre | la cima más lavada que la base | 0,255 → 0,368, con tope por arriba para que no se disuelva |
| 2 · nubes por delante | prueban que entra en la capa de nubes | dos bandas más cerca que ella, a alturas del fuste |
| 3 · base escondida | sin base, el ojo no puede acotarla | la cresta de delante a 104 m, la torre a 222 |
| 4 · repeticiones pequeñas | contar cosas de tamaño humano | **33 ventanas** y 12 merlones por lado |
| 5 · nada compite | si el decorado es grande, la torre es chica | ninguna cresta pasa del 70 % |

### El precio, que se eligió

**La escala pelea contra el movimiento.** Con una torre de 150 m, desplazar la
cámara cien metros no produce paralaje y sí degrada el encuadre por el camino.
Así que la cámara recorre **26 metros en dos minutos** y lo que se mueve son las
nubes. Hay una prueba que exige que el recorrido sea corto, para que nadie lo
«arregle» alargándolo sin saber que se decidió.

## 4. Lo que se entendió mal, que es la mitad del trabajo

Todo esto salió **mirando la captura**, no razonando. Va entero porque es lo que
no se puede volver a deducir del código.

### 4.1 190 × 30 no es un torreón, es una chimenea

La primera versión midió 190 m de alto por 30 de ancho: **más de 6 a 1**. En la
captura no salió una torre gigante, salió una chimenea de fábrica. Lo macizo no
son los metros, es la proporción. Con 150 × 52 baja a 2,9 a 1 y sigue midiendo
cincuenta pisos.

### 4.2 El contraluz salía AL REVÉS

Con la niebla empezando a 90 m y la torre a 220, la bruma le metía a la piedra un
30 % del naranja del horizonte: **la silueta salía más clara que el cielo**. Un
contraluz invertido. Se arregló empezando la niebla más allá de la torre — la
pista 1 sigue funcionando porque la produce la *diferencia* de distancia entre
base y cima, no el valor absoluto.

### 4.3 Los colores son lineales y se muestran en sRGB

`tierra` se puso a 0,030 creyéndolo casi negro. Three trabaja en lineal y
convierte al presentar, así que **0,030 se dibuja como 0,19**: gris medio. El
suelo salió de un malva plano que parecía un muro pintado. La cuenta, para no
volver a adivinarla: sRGB ≈ lineal^(1/2,2).

### 4.4 Las ventanas estaban en las dos caras que no se ven

Se pusieron en −Z y +X. La cámara va de x = −18 a +8 con la torre en x = 26: le
ve la cara +Z y la −X. **Las dos estaban al otro lado.** No se veía ni una luz.

### 4.5 Y no se arreglan agrandándolas

A 220 m, una ventana de 0,8 m ocupa **píxel y medio**. Agrandarla rompería la
pista 4, que es que mida lo que mide una persona. Lo que se ve de una luz lejana
no es su forma, es su halo: ahora son resplandores aditivos de 5,2 m.

### 4.6 No había suelo

Las crestas son carteles verticales, así que entre el borde del cuadro y la más
cercana no había nada: se veía la cúpula de cielo por debajo del horizonte, y el
resultado era una losa con una raya naranja al pie. Un contraluz necesita que el
terreno **llegue** al horizonte y se funda con él ahí.

## 5. EL CONTROL QUE MIRA EL RECORRIDO Y NO EL FINAL

Es la lección de este experimento, y la pagaron dos.

El 52 medía que la cámara **se movía** — 30,36 % de píxeles cambiando — y
elegía los miradores de una foto en `s = 0`. Las dos cosas verdes, y el encuadre
roto por el camino. Y el 53 se encontró la misma forma con otra ropa: una rotura
a propósito que **no puso nada rojo**, porque el control leía el estado final y
entre medias había 5,6 s de Gate City vacía con el jugador ya dentro.

Son el mismo defecto: **el control mira el resultado y no el recorrido.**

Así que `sondas/menu52.mjs` ahora recorre el trayecto en seis puntos y en cada
uno mide tres cosas, que tienen que aguantar **en todos**:

```
    s=0    brillo  31.0  silueta  17.9 %  centro 0.69
    s=0.2  brillo  31.3  silueta  17.9 %  centro 0.70
    s=0.4  brillo  31.6  silueta  17.9 %  centro 0.70
    s=0.6  brillo  31.8  silueta  17.8 %  centro 0.70
    s=0.8  brillo  32.0  silueta  17.8 %  centro 0.70
    s=1    brillo  32.0  silueta  17.6 %  centro 0.71
```

Con su negativo al lado: **las dos puntas del recorrido tienen que ser imágenes
distintas** (27,95 %). Sin él, los tres controles pasarían igual sobre una sola
imagen repetida — y de hecho pasaron: se me había olvidado volver a encender el
fondo después del control de la pintura, y el trayecto entero estaba midiendo la
pintura quieta. Lo dijo ese negativo dando 0,00 %.

### Y la medida tuvo que corregirse dos veces

- **Contaba «píxeles oscuros» y los llamaba «la silueta».** En un atardecer el
  suelo también es oscuro: salía 74 % de silueta y el centro a la izquierda,
  donde está el suelo. Se limitó a la mitad superior, que es donde lo único
  oscuro es la torre porque detrás tiene cielo.
- **El umbral era 42 y el cielo también cae por debajo.** El violeta del cénit
  ronda 34, así que 42 no separaba la torre del cielo: separaba la noche del sol.
  La torre está a unos 10. El umbral es 18, que cae en el hueco.
- **Y el centro de masa no es dónde está la torre.** Daba 0,43 con la torre
  visiblemente a 0,69, porque las esquinas oscuras de arriba pesaban tanto como
  el sujeto. Lo que distingue a la torre del cielo no es ser oscura: es ser una
  **columna continua** de oscuro. Ahora se busca el pico del histograma por
  columnas, y da 0,69 — que es lo que se ve.

Esa última corrección importa más de lo que parece: **la medida y la imagen ahora
coinciden.** Mientras no coincidan, una de las dos miente y no se sabe cuál.

## 6. Lo que falta

- **Las nubes no cruzan la torre todavía.** Es la pista 2, la más fuerte, y es la
  que peor se ve: entre `+0 s` y `+90 s` apenas cambia nada. Hay prueba de Node
  de que las bandas están puestas donde toca; lo que falta es que se noten.
- Las cornisas del fuste no se leen a media altura.
- Dos rojos en `sonda:mapa` sin atribuir: el conocido del 37 («y en seco SÍ
  mata», 15 → 15) y **«y los bichos también», 31 de 69**. El segundo no es de
  este experimento —la torre sólo toca el camino de dibujo del menú— y huele a
  medida tomada antes de que terminen de montarse, que es lo mismo que el 53
  encontró en el suyo. Queda apuntado sin resolver, no cerrado en falso.

## 7. Cómo se comprueba

```bash
npm test                        # 1 401, de las que 23 son de la escena
npm run sonda:menu52            # 19 de 19: el menú entero, trayecto incluido
npm run sonda:torre52           # la vista previa, para iterar la escena
```

Y para verla sin arrancar el juego, con el servidor de desarrollo puesto:
`http://localhost:PUERTO/sondas/torre.html`. Esa página **no entra en
`vite build`** —la compilación sólo toma `index.html`— así que es un banco de
pruebas y no algo que se publique.

## Corrección posterior — revisión 57

La comparación con la referencia llevó a reemplazar esta composición. Se
encontraron dos errores que las mediciones de aquí no detectaron: salida
lineal en el menú frente a sRGB en su vista previa, y triángulos del fuste
orientados hacia dentro. La función de niebla de las pruebas tampoco era
la que aplicaba el material. El registro anterior se conserva; la corrección,
el nuevo escenario y sus comprobaciones están en [TORRE_57.md](TORRE_57.md).

