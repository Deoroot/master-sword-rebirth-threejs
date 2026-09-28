# ¿Qué es este proyecto ahora? — propuesta para decidir

**Esto es una propuesta, no un plan ejecutado.** La parte 5 del
[PROMPT_06.md](PROMPT_06.md) pedía escribirla y presentarla, y eso es lo que hay
aquí. Nada de lo que sigue está hecho.

Quien dirige el proyecto lo planteó así:

> «a este punto creo que el experimento básicamente cambia de *port gatecity a
> three.js* a *port master sword rebirth a three.js test*. vemos que es posible
> hacer casi 1/1 con geometría y assets, casi seguramente da para la física,
> combat, etc.»

## 1. Qué cambia el criterio

Un visor tiene que **verse bien**. Un port tiene que poder **jugarse**. Es una
vara distinta, y mueve tres cosas de la columna «hueco aceptable» a la columna
«deuda»:

| hoy | como visor | como port |
| --- | --- | --- |
| los 101 adornos no tienen colisión | correcto: son decorado | **fallo**: se atraviesa una mesa |
| los 17 `.mdl` no tienen animación | correcto: son adornos quietos | **fallo**: no hay ni un NPC que se mueva |
| no hay PVS | margen sin coger | **sigue siendo margen**, ver abajo |
| un mapa suelto | el experimento era un mapa | **fallo**: no hay transición |

Y añade una vara nueva que hoy no existe: **el servidor**. Master Sword Rebirth
es multijugador cooperativo; su lógica de juego vive en el servidor
(`MasterSwordRebirth-Xash3D/src/`) y el cliente sólo dibuja. Un port a la web que
no decida eso desde el principio se lo encuentra después, y entonces es una
reescritura.

**Y una cosa que NO cambia.** La respuesta del 05 —«la pila llega»— sigue en pie
y hoy está mejor sostenida: el mapa se dibuja entero, con luz horneada, 100
materiales, adornos, carteles, una segunda pasada de detalle y una caja de cielo,
en **0,94 ms por fotograma con renderizado por software y sin GPU**. Lo que ha
cambiado es que ahora hay un juez que lo comprueba contra los archivos, y hacía
falta: sin él llevábamos dos sesiones sin mapa de luz con las 397 comprobaciones
en verde.

## 2. Qué hace falta, en orden, y lo que cuesta

Las estimaciones están calibradas contra lo que ya costó lo hecho, que es la
única referencia honesta que hay. Una **sesión** es lo que costó, por ejemplo, el
lector de `.mdl` completo con sus 17 ficheros y sus dos oráculos.

### Bloque A — cerrar la fidelidad de un mapa (1 sesión)

| | coste | por qué primero |
| --- | --- | --- |
| **El parpadeo de los estilos 1 y 6** | ⅔ sesión | Medido en el 06: el 63 % de la superficie iluminada, 28 bytes de recorrido en pantalla, diez veces por segundo. Es lo único de todo el mapa que pide salirse de los materiales de fábrica, y es el candidato número uno del contraste local que falta. |
| **Una captura del juego con el `glow` apagado** | 5 min de quien lo juega | Vale más que las tres cosas de abajo juntas. |
| **Las `dlight` de las antorchas** | ⅓ sesión | `R_AddDynamicLights`. Con el parpadeo ya hecho, el mecanismo es el mismo. |

Comparable a lo hecho: el mapa de luz completo (atlas, empaquetado, UV, gamma del
motor) costó una sesión larga.

### Bloque B — que se pueda jugar un mapa (2 sesiones)

| | coste | notas |
| --- | --- | --- |
| **Colisión de los adornos** | ¼ sesión | `hull` del `.mdl`, o la caja del `bodypart`. Rapier ya tiene el mundo; añadir 101 cuerpos estáticos es barato. |
| **Animación de `.mdl`** | **1 sesión y media** | Es el trozo grande y está acotado: `seqdesc`, `anim`, los `bones` con su jerarquía y los canales comprimidos de 16 bits. El lector ya saca huesos y mallas; falta el muestreo por fotograma y el skinning. **Esto es lo que convierte el port en algo que se mueve.** |
| **Un segundo mapa y su transición** | ½ sesión | El lector vale para cualquier `.bsp` de GoldSrc sin tocarlo. Lo que no está es `trigger_changelevel` y la cadena de carga. **Es la prueba de que lo hecho es un LECTOR y no un mapa.** |

Comparable: el lector de `.mdl` sin animación costó una sesión. La animación es
más, pero el formato ya está descifrado y tiene el mismo tipo de oráculo dentro.

### Bloque C — que sea un juego (sin estimar, y a propósito)

Física de jugador con los valores de `pm_shared`, combate, inventario, NPC,
servidor. **No se estima porque no se ha medido nada de eso**, y este proyecto ya
tiene el escarmiento de dar por buena una estimación que salía de un
razonamiento. La única cifra que hay es del lado bueno: el código del mod está
al lado y es legible.

### Lo que NO va en la lista, y por qué

- **PVS.** 114 184 bytes que GoldSrc usa y nosotros no, y **no hace falta**: el
  mapa entero se dibuja en 0,94 ms sin GPU. Cogerlo es optimizar lo que sobra.
  Vuelve a la lista el día que haya diez mapas cargados a la vez o un móvil
  midiendo mal.

## 3. Qué NO se va a hacer

Media propuesta honesta es la lista de lo que se descarta.

- **No se va a redistribuir un solo byte del juego.** La regla del 02 no se
  relaja por cambiar de nombre el proyecto. Sigue siendo: se escribe el lector,
  lo extraído va a `build/`, nada pasa a `public/`, y lo que no se puede leer se
  genera y se dice en `PROCEDENCIA.md`. **Un port que hay que jugar con el juego
  original instalado al lado es un port legítimo; uno que se descarga con los
  assets dentro, no.** Esto acota lo que el proyecto puede llegar a ser, y es un
  límite elegido, no una limitación.
- **No se va a portar el motor.** Xash3D ya existe, funciona y está compilado
  ahí al lado. Lo que se reproduce es el resultado, leyendo el motor para saber
  qué hace — que es lo que ha convertido esto en algo medible.
- **No se van a portar los 40 y pico mapas.** Uno demuestra el lector; dos
  demuestran la transición; el resto es tiempo de máquina.
- **No se va a hacer el multijugador todavía**, y no por difícil: porque decidir
  la arquitectura cliente-servidor antes de tener un jugador que se mueva bien es
  decidir sin datos.
- **No se toca el jharro ni Corinth ni los experimentos 01 y 02.** Siguen
  congelados. Lo que el jharro se lleve de aquí es método, no código.

## 4. Dónde vive

**Recomendación: se separa, y se lleva poco.**

`Mydra Web Lab` es un laboratorio de experimentos con un hilo común —ver qué da
de sí la pila— y sus artefactos son Corinth y el jharro: **mundos generados**. El
port es lo contrario: **un mundo leído**. Comparten la pila y no comparten la
pregunta, y ya se nota en el repositorio —`src/bsp/` no toca nada de `src/kit/`,
`src/map/` ni `src/render/scene.js`—.

Lo que se llevaría, y ya está separado:

```
src/bsp/*            lector de .bsp, .spr, .mdl, .tga, gamma del motor, árbol BSP
src/render/bsp_escena.js
src/play/player.js   la física, que es común
tools/gatecity*.mjs, tools/juez_luz.mjs, tools/quecara.mjs, tools/mirar.mjs,
tools/comparar.mjs, tools/png.mjs
test/bsp*.test.mjs
```

Lo que se queda: `src/kit/`, `src/map/`, `tools/plano*.mjs`, `tools/roca.mjs`,
Corinth y el jharro enteros.

**Y lo que se lleva sin ser código, que es lo que de verdad vale:** el método.
Cada sonda con su control positivo; un cero sin control no es un resultado; la
referencia manda sobre el razonamiento; y la de esta sesión — **un dato bien
calculado que nadie lee no da error**.

Si la decisión es no separarlo, lo que hay que hacer igualmente es dejar de
llamarlo «experimento 05/06» y darle su propio `README` y su propia lista de
pendientes, porque hoy su estado vive repartido entre cuatro documentos de otro
proyecto.

## 5. Lo que hay que decidir, en tres preguntas

1. **¿Se separa el repositorio?** Recomendación: sí, con la lista de arriba.
2. **¿Bloque A antes que B, o al revés?** Recomendación: A primero, porque es una
   sesión y cierra la pregunta del 05 con todo medido; y porque una captura del
   juego con el glow apagado puede llegar mientras tanto.
3. **¿La animación de `.mdl` o un segundo mapa como lo siguiente grande?**
   Recomendación: **el segundo mapa primero**, aunque sea el más pequeño de los
   dos. Cuesta media sesión, y es la prueba de que lo escrito es un lector
   general y no un port de Gate City con otro nombre. Si esa prueba falla, es
   mucho mejor saberlo antes de gastar sesión y media en animación.
