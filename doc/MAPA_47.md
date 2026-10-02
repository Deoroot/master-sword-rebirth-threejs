# 47 — Sacar Gate City de las costuras

> `src/play/mapa.js` · `tools/mapa.mjs` · `test/juego_mapa47.test.mjs`

El paso 4 del plan: «el juego tiene múltiples mapas, no todo debe apuntar a
éste». Había **431 menciones de `gatecity` en 115 archivos**, y la mitad no eran
comentarios: eran rutas.

## Lo que había, medido antes de tocar nada

| | |
| --- | --- |
| menciones de `gatecity` | 431 en 115 archivos |
| rutas `build/gatecity` | 243 |
| `?map=gatecity` en las sondas | 35 |
| en comentarios (que se quedan) | 118 |

Y la buena noticia de la medida: **`src/render/` y `src/red/` ya estaban
parametrizados**. Todos sus cargadores tomaban `base` por parámetro; lo que
tenían mal era el valor por omisión, escrito a mano. El nudo de verdad estaba en
tres sitios: `src/main.js` (37), `src/bsp/nivel.js` —con una función llamada
literalmente `gatecityLevel`— y la lista de mapas de «Create Server».

## Lo que hay ahora

**Un sitio que dice cuál es el mapa**, `src/play/mapa.js`: el nombre por
omisión, la lista de los portados, el validador y las rutas. Puro, sin importar
nada, como el resto de `src/play/`, así que vale en el navegador y en Node. Su
gemelo del lado de la extracción es `tools/mapa.mjs`, que sí toca el disco y la
línea de órdenes.

Y con eso:

- `gatecityLevel()` es `cargarNivel({ mapa })`.
- `main.js` tiene `const MAPA`, `const BASE` y `ruta(...)`, y pasa `base: BASE`
  a los once cargadores que antes se quedaban con el valor por omisión.
- `MAPAS` de «Create Server» sale de `MAPAS_PORTADOS`.
- `npm run servidor -- --mapa edana`, con su propia carpeta de personajes —que
  es lo que hace el juego: un personaje de Edana no está en la partida de Gate
  City—.
- `node tools/gatecity.mjs --mapa edana`, o dándole la ruta del `.bsp`.
- El `<title>` y el `<h1>` de la pantalla de carga dejan de nombrar el mapa.

## Por qué el nombre se valida, y no es paranoia

El mapa entra por `?map=`, que es la línea de órdenes del juego
(`hl.exe +map <mapa>`), y de ahí sale una ruta que se le pasa a `fetch`. Sin
validar, **`?map=../../../algo` es un `fetch("build/../../../algo/malla.json")`**
y el navegador lo sigue tan contento.

El filtro no se inventa: es el del motor. GoldSrc busca `maps/<nombre>.bsp` y
los nombres reales son minúsculas, dígitos y guion bajo —`gatecity`,
`old_helena`, `hall_of_deralia`—. Hay una prueba con siete formas de salirse.

Y una decisión que va con eso: **un nombre malo no cae al de por defecto en
silencio**. `?map=Gatecity` con mayúscula cargaría un mapa que sí existe y quien
lo escribió se pasaría media hora sin entender por qué no es el suyo. Se dice el
motivo por consola y se entra en el de siempre.

## Lo que salió al comprobar que el refactor no cambiaba nada

Ésta es la parte del experimento que no estaba planeada.

### 1. El horneado no era reproducible

Para comprobar que parametrizar el extractor no había cambiado su salida, comparé
el `malla.json` de antes con el de después. **Salían distintos.** Y no por el
refactor: dos horneados seguidos **del mismo código sin tocar** también salían
distintos.

Lo que variaba era un solo campo, `interactivas.agua[*].llenaLaCaja`: 0.808 en
una tirada y 0.804 en la siguiente. Es una estimación Monte Carlo —cuántos de
20 000 puntos de la caja envolvente caen dentro del poliedro del estanque— y el
dado era un `Math.random` suelto.

Es **el fallo del experimento 28 otra vez** —un dado sin inyectar donde dos
partes tienen que ver lo mismo—, aquí entre dos extracciones en vez de entre dos
jugadores. Y su coste concreto es el que acabo de pagar: *no se podía comprobar
si un refactor había cambiado la salida*, porque el ruido del muestreo tapaba
cualquier cambio de verdad.

Puesto con semilla (`mulberry32`, semilla fija). Ahora tres horneados seguidos
dan los mismos bytes, y el `malla.bin` es **idéntico al de antes del refactor**,
que es la prueba que se había ido a buscar.

### 2. Se me cayó una atribución

Al generalizar la línea `procedencia` del `malla.json` escribí `${MAPA}.bsp` en
vez de `gatecity.bsp (DrKill)`, y **perdí el nombre del autor del mapa**. Lo
cazó la comparación de arriba, que es el único motivo por el que se hizo.

Una atribución perdida en un refactor es peor que una que nunca estuvo, porque
nadie la echa en falta. Ahora hay una tabla `AUTORES` en `tools/mapa.mjs`, con
su prueba, y de un mapa cuyo autor no sabemos **no se inventa uno**. Ver
[CREDITOS.md](../CREDITOS.md).

### 3. El servidor de desarrollo miente sobre lo que falta

Con `?map=` abierto de par en par, pedir un mapa sin hornear pide
`build/edana/malla.json`… y **Vite contesta el `index.html`**, con un 200 y
`<!doctype` dentro. El `r.ok` decía que sí y el `r.json()` reventaba con
«Unexpected token '<'». Antes no se veía porque la carpeta siempre estaba.

Las catorce lecturas opcionales de `main.js` pasan ahora por un `traerJson` que
mira el tipo de contenido, y `nivel.js` dice qué archivo falta en vez de un
`SyntaxError`.

### 4. La sonda compartida tenía razón

`sondas/mismo.mjs` comprueba el `<title>` antes de medir nada, para no dar
números de otro programa con nuestras etiquetas encima. Al quitarle «Gate City»
al título, **abortó las 24 sondas**, que es exactamente para lo que está. Título
nuevo, sin mapa dentro, y sigue siendo bastante nuestro como para no fallar en
falso.

## LA PRUEBA DE QUE ESTO SIRVE: Edana se hornea

Un refactor que «parametriza» y nunca se prueba con un segundo valor es la forma
del apartado 4 de [CLAUDE.md](../CLAUDE.md) con ropa de refactor. Así que:

```
$ node tools/gatecity.mjs --mapa edana

edana.bsp — 11.86 MB, 39.37 unidades/m
  caras           12808 (10106 del mundo + el resto en 162 entidades)
  superficie      134528 m²
  texturas        262 decodificadas de 262, 7794 KB en PNG
  monsterclip     7 brushes en 7 piezas convexas
  cielo           color 255,255,226 de light_environment "255 249 156 350"
  mapa de luz     1.47 MB en el archivo
    contabilidad  1544688 bytes sumados contra 1545495 del lump
                  -> FALLO: sobran -807, 0 solapes, 1 huecos

  El mapa de luz no se está leyendo bien. Sin esto lo demás no vale.
```

Lee el `.bsp` entero, decodifica sus 262 texturas, encuentra sus brushes y su
cielo, y **se planta en un fallo concreto y medido**: al mapa de luz le faltan
807 bytes y hay un hueco. La guarda es del propio extractor y hace lo correcto —
parar en vez de hornear un mapa con la luz mal—. No es este experimento: es el
siguiente.

### Y de paso, la evidencia que faltaba para el paso 2

El inventario de entidades de Edana trae lo que Gate City no tiene:

> `4 trigger_teleport, 3 trigger_hurt, 2 msarea_transition, 6 msarea_music,`
> `2 trigger_once, 3 trigger_multiple, 1 trigger_push, 2 func_ladder,`
> `1 func_button, 1 func_pendulum, 2 func_rotating, 7 func_door_rotating,`
> `4 func_breakable`

El **paso 2** del plan —el bus de disparadores de GoldSrc— se aparcó en el 43
con la medida de que en Gate City no dispara nada: sus 5 `trigger_once`, 2
`multi_manager` y 1 `trigger_relay` caen en áreas que ya están activas y
`CAreaMonsterSpawn::ResetUse` las ignora. Edana **sí** los usa, y además trae
botones, péndulos, escaleras y transiciones de mapa. La decisión de aparcarlo
hasta Edana era la buena, y ahora hay con qué medirla.

## Cómo se comprobó

26 comprobaciones de Node y ocho roturas a propósito:

| rotura | rojas |
| --- | --- |
| el validador acepta cualquier cosa | 5 |
| un nombre malo cae al de por defecto en silencio | 2 |
| un trozo de ruta puede salirse de `build/` | 1 |
| la lista de mapas, otra vez escrita a mano | 1 |
| una ruta `build/gatecity` a mano en `src/play/` | 2 |
| el mapa por omisión no está entre los portados | 1 |
| la ruta `.bsp` deja de dar el nombre de la carpeta | 2 |
| se pierde la atribución del autor del mapa | 1 |

Dos de las ocho —el validador y la ruta `.bsp`— dieron **cero** a la primera,
porque el `sed` que las rompía no casaba. Un cero en una rotura no es «la prueba
es mala»: es «comprueba que la rotura entró». Rehechas con `python`, dieron 5 y
2.

Y dos guardias que miran el árbol entero, con su control positivo al lado
(«¿hay archivos que mirar?», porque si no, «no encontré ninguno» sería verdad
también con la lista vacía):

- **ningún `.js` de `src/` lleva `build/gatecity` escrito fuera de un
  comentario** — cazó uno mío, un mensaje de error de `nivel.js`;
- **ni `src/play/` ni `src/bsp/` nombran el mapa**, porque son las dos capas que
  no deben saber en cuál están.

`npm test` **1258/1258**. Y en Chromium: `sonda:arranque36` 22/22 —la que entra
por el menú—, `sonda:misiones33` 23/23, `sonda:vgui2_34` 26/26, `sonda:intro42`
14/14. Más el horneado de Gate City rehecho tres veces con los mismos bytes.

## Lo que este experimento NO hace

- **Doce de las veintidós herramientas siguen con el mapa a mano.** Se
  parametrizó la que hace falta para que exista un mapa nuevo —el extractor del
  `.bsp`— y el servidor. Las demás (`bichos.mjs`, `aparicion.mjs`,
  `guiones.mjs`, `menus.mjs`, `juez_luz.mjs`…) siguen escribiendo en
  `build/gatecity` y son el resto del trabajo.
- **Y diez de ellas no son de un mapa.** `hud.mjs`, `menu.mjs`, `vgui.mjs`,
  `vgui2.mjs`, `armas.mjs`, `escudos.mjs`, `cuerpo.mjs`, `iconos.mjs`,
  `sonido.mjs` y `efectos.mjs` hornean cosas **del juego** —el HUD, los esquemas
  de VGUI, los modelos de las armas, los sonidos— y las escriben dentro de la
  carpeta del mapa porque es donde estaba todo. Con dos mapas eso duplica
  decenas de megas idénticos. El sitio bueno es `build/msr/`, que **ya existe**:
  ahí vive `objetos.json`. Mover el resto toca todas las rutas de `src/` otra
  vez, así que queda dicho, contado y con una prueba que vigila la lista, en vez
  de arreglado a medias.
- **Las 35 sondas siguen entrando por `?map=gatecity`**, que está bien: miden
  Gate City.
- **`MAPAS_PORTADOS` es una promesa, no una medida.** El navegador no lista
  carpetas y `build/` no se publica, así que un nombre ahí sin su horneado da
  una pantalla de error. Es el precio de que añadir Edana sea una línea.

## Lo siguiente

Edana, que ya tiene por dónde empezar: **los 807 bytes del mapa de luz**.

---

## Corrección del 48

Los 807 bytes **no eran una mala lectura**: son ceros al final del lump que
ninguna cara reclama, y el motor no los mira porque `Mod_LoadLighting` copia el
lump entero y luego indexa por `lightofs`. Los tienen 36 de los 92 mapas del
juego. Lo que estaba mal era la guarda, que exigía que la suma **fuera** el
lump.

Y detrás de ese número había otros tres, todos de la misma forma: guardas
correctas con una regla medida sobre un solo mapa. Edana ya se hornea entera y
se anda. Ver [EDANA_48.md](EDANA_48.md).

Dos cosas que este documento dice y siguen exactamente igual: **las doce
herramientas con el mapa a mano** y **las diez que no son de un mapa**.
