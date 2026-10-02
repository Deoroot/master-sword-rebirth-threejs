# 55 — El primer corte de `src/main.js`: el arco

> `src/juego/arco.js` · `src/main.js` · `sondas/arco.mjs` · `sondas/ranuras.mjs`

La deuda del experimento 28, que su propio informe dejó escrita: «`mainGateCity`
sigue siendo una función de 2 600 líneas. Partirla de verdad pide sacar el
estado compartido a un objeto explícito, y eso es un experimento propio.»

Hoy son **4 356**. El 51 sacó las conversaciones con NPC; esto saca el arco.

## Qué trozo, y por qué ése: se midió

No todos los tramos cuestan lo mismo de sacar, y elegir a ojo el más grande es
cómo se empieza un refactor que no termina. Se midió con `rollup/parseAst`,
que resuelve ámbitos, contando **cuántos nombres cruzan la frontera**:

| tramo | líneas | declara | salen al juego | sólo a la sonda |
| --- | --- | --- | --- | --- |
| el golpe cuerpo a cuerpo | 586 | 43 | ~25 | ~14 |
| el montaje del mundo | 355 | 38 | 32 | — |
| los otros jugadores | 256 | 6 | 6 | — |
| **el arco** | **320** | **12** | **2** | **6** |

Dos nombres —`flechasPuestas` y el paso de las flechas— y seis que lee sólo la
sonda. Ésa es la costura limpia, y por eso es la primera.

## LO QUE APRENDIÓ LA MEDIDA, que es la parte que hay que leer

**La primera versión del analizador dio una lista de dependencias corta y
falsa**, porque sólo miraba las declaraciones *anteriores* al tramo. Dos cosas
se le escaparon, y las dos habrían roto el port en silencio:

**`U` se declara en la línea 3512 y el bloque del arco la usa en la 3007.**
Funciona porque las flechas vuelan más tarde, no porque esté declarada antes:
es un `const` en zona muerta que nadie llega a pisar. Sacado a un módulo sin
darse cuenta, `U` habría sido `undefined`.

**`municionElegida` vivía suelta en el módulo y se reasignaba a los dos lados
de la frontera** (el ciclador en la 1931, el arco en la 2983). Ése es el caso
caro: moverla habría dejado **dos variables distintas con el mismo nombre** y
ningún error — el ciclador escribiendo en una y el arco leyendo la otra. En la
práctica, elegir flecha dejaría de hacer nada y nadie se enteraría.

La segunda versión del analizador recoge los nombres **vengan de donde vengan**
y marca los que se escriben a los dos lados. Salieron tres: `municionElegida`,
`aguante` y `muertes`. Cada uno se resolvió distinto y a propósito:

- `municionElegida` **es del arco**, así que se mudó con él. El ciclador la
  pone por `arco.elegirMunicion()`.
- `muertes` es una cuenta **compartida con el mandoble** y la lee la sonda
  desde `main.js`, así que el arco la pide prestada: `alMatar(i)`.
- `aguante` es del jugador y no del arco; se quedó donde estaba, porque el
  trozo que salió no lo toca.

## Las dependencias son captadores, no copias

Es la lección del 28 —el saco de captadores con el que bajó la sonda— y aquí
muerde igual. `brazo`, `armaEnMano`, `bichos`, `sesion` y `reloj` **se
reasignan mientras el juego corre**: pasarlos por valor daría un arco que
apunta para siempre al que llevabas al entrar y a un reloj parado.

```js
const arco = montarArco({
  brazo: () => brazo,
  armaEnMano: () => armaEnMano,
  reloj: () => reloj,
  ...
});
```

No es una precaución teórica: es la **rotura 1** de abajo.

## Las roturas

| lo que rompí | qué pasó |
| --- | --- |
| `brazo` por VALOR en vez de captador | **la sonda revienta**: `Cannot read properties of null (reading 'arma')`. Al montar el arco todavía no hay brazo, así que se queda en `null` para siempre |
| `alMatar` sin el `muertes++` | **nada. 37 de 37 en verde** |
| el ciclador no llama a `elegirMunicion` | **nada, en `arco` y en `ranuras`** |

La primera es la que valida la decisión de arriba, y no da un rojo: da una
excepción. Se apunta como es.

### La rotura 2, y el control que faltaba

Ninguna sonda miraba que **una flecha que mata suba la cuenta de muertes**.
`sonda:golpe` la mira para el mandoble; el camino de la flecha no lo miraba
nadie. O sea justo la clase de hilo que un reparto corta sin que salte nada.

El primer intento del control no sirvió, y es instructivo: decía «si el goblin
murió, que la cuenta suba», y **el goblin no muere nunca** — con la potencia de
un novato, veinticuatro flechas le quitan menos de veinte puntos de cincuenta.
La sonda daba 38 de 38 con el contador roto a propósito. *Un control que no
puede dispararse no es un control.*

Se arregló dejando al goblin **a un punto de vida** (`probe.reaccion.vida`, que
`sonda:golpe` ya usaba para lo contrario) y **con el desvío arreglado**: con la
puntería fiel al motor aciertan cero de doce, así que el control se habría
muerto de puntería en vez de medir el contador. Ahora: tres flechas, `muertes
0 → 1`, y con la rotura puesta se pone rojo.

### La rotura 3 no la caza nadie, y se queda dicho

Elegir munición con el ciclador (`selectarrow`) **no lo mide ninguna sonda**, y
no es culpa del reparto: ya estaba sin medir. El motivo es concreto y está
medido — el personaje de la sonda no lleva flechas en la mochila («en la
mochila: ninguna»), así que la rama de la elección no se ejecuta jamás. Para
cerrarlo hay que darle flechas de verdad y hacerle elegir. **No está hecho.**

## Dos controles inestables, que son la otra cara del apartado 4

Al pasar las vecinas salieron dos rojos que no eran del refactor, y los dos por
el mismo motivo: **un umbral escrito contra un mapa concreto**.

`sonda:arco`, «la flecha vuela de verdad: cientos de unidades», `recorrido >
150`. Falla tres veces de cada cinco: 137, 139, 150. El número no medía la
flecha — medía **dónde está la pared** que el jugador tiene delante, y eso
cambia con el desvío lateral del arco, que es aleatorio a propósito.

Un control que falla la mitad de las veces es tan inútil como uno que no falla
nunca: en cuanto se aprende a ignorarlo, deja de avisar. Y mover el umbral
habría sido elegir el número que hoy pasa. Lo que se puede afirmar de una
flecha sin saber qué hay delante es que **el camino cuadra con su velocidad y
su tiempo de vuelo**:

```js
const esperado = tiro.velocidad * tiro.vuelo;
Math.abs(tiro.recorrido - esperado) / esperado < 0.2
```

Una relación en vez de una cifra: vale en cualquier punto del mapa y además
caza dos cosas que el umbral no cazaba — una flecha que nace ya clavada y una
que dice haber volado sin moverse. Tres pasadas seguidas en verde.

**Y al estabilizarlo se destapó el de al lado**, «y baja mientras vuela»,
`caida < -15`: −3, −12 y −15 en tres pasadas. Misma enfermedad. **No se ha
arreglado**, y a propósito: esa cifra mezcla la caída por gravedad con el
desvío *vertical* del apuntado, que también es aleatorio, así que derivarla
pide el ángulo de salida y eso es otro trabajo. Queda medido y señalado en vez
de tapado.

### Y dos de `sonda:ranuras` que eran controles envejecidos

- «trae el fondo de la torre horneado» exigía la **pintura** (`fondo.png`), y
  desde el 52 el menú puede llevar detrás la escena de la torre — con fondo
  vivo la capa es transparente a propósito. Estaba rojo diciendo «falta el
  fondo» sobre un menú que tiene más fondo que antes. Ahora exige que haya
  **una de las dos** y dice cuál.
- «una opción que no sirve DICE por qué, no calla» tenía el nombre escrito:
  «Visit a Kingdom, que es la primera que no sirve». Desde el 34 **sí** sirve
  —abre el navegador de servidores—, así que el control acusaba al menú de
  callarse cuando no tenía nada que decir. Ahora **busca** la que esté apagada,
  sea cual sea, y le exige que hable. Resulta ser `Quit`, y dice: *«Quit»: a
  browser cannot close its own tab*. La regla nunca se incumplió.

## Lo medido

`src/main.js` **4 356 → 4 138 líneas**. `src/juego/arco.js`, 260 líneas de
lógica con su cabecera.

| | |
| --- | --- |
| `npm test` | **1401 / 1401** |
| `vite build` | limpio |
| `sonda:arco` | **40 / 40** (dos controles nuevos) |
| `sonda:golpe` | 25 / 25 |
| `sonda:ranuras` | **40 / 40** (dos controles reescritos) |
| `sonda:mundo` | 40 / 40 |
| `sonda:arranque36` | 30 / 30 |
| `sonda:inventario31` | 20 / 20 |

## Lo que este experimento NO hace

- **El golpe cuerpo a cuerpo sigue dentro**, y es el doble de grande: 586
  líneas con ~25 nombres saliendo al juego. No es una costura, es un desgarro,
  y lo que pide antes es **el objeto de estado explícito** que el 28 ya
  nombró: `aguante`, `muertes`, `golpesDados`, `impactos`, `golpesRecibidos` y
  `ultimoGolpe` son estado compartido sin dueño.
- **El montaje del mundo tampoco.** 355 líneas y **32 nombres** saliendo: es el
  peor de los tres por acoplamiento, aunque parezca el más obvio por nombre.
- Y sigue pendiente lo que bloquea el arranque: que el menú no cargue el mapa
  pide mover `montarMenu` por delante de `cargarNivel`, o sea este mismo
  reparto pero por el otro extremo.


---

## Segunda parte: las cuentas, en un sitio

El corte del arco dejó dicho qué faltaba antes de poder tocar el golpe cuerpo a
cuerpo: **el objeto de estado explícito** que el 28 nombró y nadie hizo. Esto
es su primer trozo, y otra vez se eligió midiendo.

El criterio: un `let` de la función que se **escribe desde dos o más sitios**
es estado compartido; uno que se escribe en un sitio es una variable local con
mala suerte, y sacarlo no arregla nada. Salieron veinte, y los peores no eran
los que yo había supuesto:

| | escrituras | distancia entre la primera y la última |
| --- | --- | --- |
| `aguante` | 6 | **2 143 líneas** |
| `corriendo` | 2 | 2 062 |
| `paseando` | 2 | 1 357 |
| `entrarPorElMenu` | 2 | 906 |
| `visita` | 3 | 886 |

O sea que el estado sin dueño más grave **no son las cuentas**: es el estado
físico del jugador. Eso corrige lo que este mismo documento decía arriba, y se
deja escrito en vez de reescribirlo.

Pero los contadores sí son un grupo coherente, y tienen una propiedad que los
hace el primer trozo correcto: **sólo los lee la sonda**. Nadie decide nada
mirándolos. Si desaparecieran, el juego se jugaría igual y sólo dejaríamos de
poder medirlo. Doce `let` sueltos —`bloqueos`, `desvios`, `fueraDelCono`,
`sonidosDeCarga`, `golpesDados`, `impactos`, `muertes`, `parados`, `encogidas`,
`huidas`, `avisos`, `golpesRecibidos`— pasan a un `const cuentas`.

Y **vive fuera del bloque del golpe a propósito**: el arco y el bucle de
fotogramas también escriben en ella. Dejarla dentro la habría convertido en
propiedad de ese tramo, y el día que el golpe salga se la llevaría puesta.

### Lo que ha servido, medido

El golpe cuerpo a cuerpo, antes y después:

| | declara | salen al juego | se reasignan cruzando |
| --- | --- | --- | --- |
| antes | 43 | ~25 | varios |
| **después** | **19** | **13** | **1** (`aguante`) |

Sigue sin ser una costura, pero ya se le ve la forma. Los trece que quedan son
casi todos **el equipo en las manos** —`catalogoDeArmas`, `catalogoDeEscudos`,
`brazo`, `armaEnMano`, `brazal`, `escudoEnMano`, `muneco`—, que es el siguiente
objeto con nombre propio.

### Y otra rotura que no puso nada rojo

Quitar el `cuentas.muertes++` del mandoble: `sonda:golpe` **25 de 25 en verde**,
`sonda:consecuencias` 46 de 46.

El motivo es exactamente el que este documento ya contaba para la flecha, y
duele más porque el control existía: «a base de mandobles, el bicho MUERE»
comprueba `matar.despues.muerto === true` —el estado del bicho— y la cuenta
sólo aparece en **el texto del mensaje**, «1 muertes en 4 mandobles». Un número
que vive en la frase no lo comprueba nadie. El único control que la miraba de
verdad era un **techo** (`muertosTotales <= 1`), y cero también cumple un
techo.

Control añadido: `matar.r.muertes >= 1`, al lado del que mira al bicho. Con la
rotura puesta da «0 contada(s) para 1 muerto(s)».

### Lo medido, segunda parte

| | |
| --- | --- |
| `npm test` | **1401 / 1401** |
| `vite build` | limpio |
| `sonda:golpe` | **26 / 26** (un control nuevo) |
| `sonda:arco` | 39 / 40 — el inestable de la gravedad, sin arreglar |
| `sonda:escudo` | 34 / 34 |
| `sonda:consecuencias` | 46 / 46 |
| `sonda:mundo` | 40 / 40 |
| `sonda:arranque36` | 30 / 30 |

### Lo que sigue sin hacerse

- **`aguante`**: seis escrituras a 2 143 líneas de distancia, y el único nombre
  que todavía se reasigna cruzando la frontera del golpe. Es el siguiente.
- **El equipo en las manos**, que son siete de los trece que quedan saliendo.
- Y el control inestable de la gravedad de la flecha (`caida < -15`: −3, −4,
  −12, −15), que sigue midiendo el desvío vertical aleatorio además de la
  gravedad.


---

## Tercera parte: `aguante`, y la fatiga que no medía nadie

El peor nombre sin dueño del archivo: **seis escrituras repartidas por 2 143
líneas**, y el último que cruzaba la frontera del golpe cuerpo a cuerpo.

No va solo. `corriendo` (2 062 líneas entre su primera y su última escritura) y
`rapidezAnterior` son lo mismo, y el propio comentario de `main.js` ya lo decía
sin sacar la conclusión:

> El AGUANTE vive aquí y no en el personaje, igual que en el juego: el cliente
> lo lleva fotograma a fotograma (`CHudFatigue::DoThink`) y el servidor sólo lo
> sincroniza.

Eso es un objeto con nombre. Los tres pasan a `const fatiga`, que vive **antes**
del bloque del golpe, igual que `cuentas`.

Un detalle de la mecánica que no es trivial y por eso el cambio no se hizo con
un `sed`: **tres líneas usaban taquigrafía de objeto** (`{ aguante, ... }`). Un
reemplazo ciego las convierte en `{ fatiga.aguante, ... }`, que no es
JavaScript. Se tratan aparte.

### LA FATIGA NO LA MEDÍA NADIE

Rotura a propósito: quitar la línea que gasta aguante al correr.

| | |
| --- | --- |
| `sonda:hud` | 36 / 36 **en verde** |
| `sonda:mundo` | 40 / 40 **en verde** |
| `sonda:golpe` | 26 / 26 **en verde** |

El aguante congelado y tres sondas sin enterarse. La barra de fatiga se medía
—dónde está, de qué color es, que sean cuatro— pero **que el número que pinta
cambie no lo comprobaba nadie**.

Y había un verde vacío que vivía de eso. `sonda:escudo` afirma:

> «levantar el escudo es gratis aunque su ficha declare 15 de aguante»

comparando el aguante antes y después (`a === b`). Con un aguante que no se
mueve nunca, **esa igualdad se cumple sola**. Es la forma exacta del apartado 4:
el control lee el valor de reposo y el valor de reposo pasa la prueba.

### Los controles nuevos, y por qué van en parejas

En `sonda:hud`, con las teclas de verdad:

```
aguante: 7.5 -> corriendo 6.4 -> parado 2,2 s 7.5
```

- **correr GASTA aguante** — 7,5 → 6,4
- **y parado SE RECUPERA**, que no es lo mismo que bajar siempre — 6,4 → 7,5

El segundo es el que hace valer al primero: sin él, un aguante que se
desangrara sin parar también cumpliría «baja al correr». Y discriminan en las
dos direcciones, comprobado con dos roturas distintas: quitar el gasto pone los
dos en rojo; quitar la regeneración, sólo el segundo.

En `sonda:escudo`, el positivo que le faltaba a «es gratis»: correr 1,5 s sí
cuesta (7,5 → 6,62). Ahora la igualdad de arriba significa algo.

### Y un tercer hallazgo, que es la lección del 21 y del 22 otra vez

El positivo natural para «levantar el escudo es gratis» era «pero un mandoble
sí cuesta». Se escribió, y salió **7,5 → 7,5**.

No es que blandir sea gratis: es que **`probe.golpe.atacar()` llama a
`brazo.tic()` directamente y no pasa por `pasoDelBrazo`**, que es donde el
juego cobra el aguante de blandir. O sea que un mandoble de la sonda sale
gratis aunque en el juego no lo sea.

El accesor de al lado tiene la lección escrita —«la sonda tiene que llamar a lo
que llama el juego»— y aun así el de `atacar()` entra por otra puerta. **No se
ha arreglado**: cambiarlo tocaría los veintiséis controles de `sonda:golpe` y
es un trabajo con su propia medida. Queda anotado, que es lo que se puede
hacer hoy sin fingir.

### Lo medido, tercera parte

| | |
| --- | --- |
| `npm test` | **1401 / 1401** |
| `vite build` | limpio |
| `sonda:hud` | **38 / 38** (dos controles nuevos) |
| `sonda:escudo` | **35 / 35** (un positivo nuevo) |
| `sonda:golpe` | 26 / 26 |
| `sonda:arco` | 40 / 40 |
| `sonda:mundo` | 40 / 40 |
| `sonda:consecuencias` | 46 / 46 |
| `sonda:arranque36` | 30 / 30 |

**Una medida que NO se reporta**, y se dice: al volver a pasar el analizador de
acoplamiento sobre el golpe dio «salen al juego: 0», y eso es falso —`brazo` se
usa en la 3022, fuera del bloque—. El analizador tiene un fallo que no he
encontrado, así que sus números de esta pasada no valen y no se usan. Lo que sí
está verificado a mano: `fatiga` se declara en la 2324 y `cuentas` en la 2375,
las dos **antes** del bloque del golpe (2394), y `aguante` ya no existe como
variable suelta. La medida buena de antes de este cambio —19 declarados, 13
saliendo, 1 reasignado— sigue siendo la última en la que confío.

---

## CORRECCIÓN DEL 56: los trece no eran trece

El experimento 56 volvió a contar a mano, con las fronteras escritas y no
supuestas —el golpe es de la 2394 a la 2970, y el objeto de la sonda empieza en
la 3898— y salieron **32 declarados y 28 saliendo**, no 19 y 13.

La cifra vieja no era una mentira: era otra pregunta. Contaba sólo el tramo que
tenía delante y no miraba lo que el golpe exporta hacia **arriba** —los
catálogos se leen en la 1842, quinientas líneas por encima de su `let`— ni
separaba los usos del juego de los de la sonda. Se queda escrita porque es lo
que se midió ese día; la buena está en [EQUIPO_56.md](EQUIPO_56.md), con los
tres cubos separados.
