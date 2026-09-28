# Experimento 03 — ¿sobrevive el veredicto automático fuera de Godot?

Escrito el 24 de septiembre de 2026, al cerrar el experimento 02. Este
documento existe para que la primera sesión no empiece en frío.

## La pregunta

El experimento 02 preguntaba: **¿puede un agente sin ojos producir niveles
correctos?** La respuesta fue sí, *si existe un veredicto automático*. Eso es lo
único que hizo que funcionara, y es lo único que hay que poner en duda al
cambiar de motor.

Así que la pregunta de este experimento **no es** «¿se ve bonito Three.js?».
Eso ya se sabe. Es:

> **¿Sobrevive el veredicto automático en una pila de navegador?**

Si la respuesta es no, este experimento se cierra y se vuelve a Godot, que ya
exporta a navegador de todas formas. Conviene tenerlo claro desde el principio
para no confundir «es agradable de programar» con «produce niveles correctos».

## Por qué se plantea siquiera

Godot **ya exporta a navegador**, así que «poder lanzarlo en un browser» no es
la razón. Las razones reales, que son legítimas:

- Descarga mucho más pequeña y carga instantánea.
- Interfaz en HTML de verdad, no reimplementada dentro del motor.
- Al usuario le resulta bonito y apetecible trabajar con ello, y eso cuenta.

## Lo que ya existe y se lleva puesto

Verificado, no supuesto: `mapstats.py` y `mapband.py` **no tienen ni una línea
de Godot**, y `mapgen.py` solo lo menciona en tres comentarios. Son Python de
biblioteca estándar. Todo esto sirve igual con un runtime de Three.js:

| Qué | Dónde | Estado |
| --- | --- | --- |
| Emisor de `.map` desde plano de texto | `../Mydra Map Lab/tools/mapgen.py` | Portátil tal cual |
| Analizador de `.map` | `../Mydra Map Lab/tools/mapstats.py` | Portátil tal cual |
| Banda de Quake y comparador | `../Mydra Map Lab/tools/mapband.py`, `reference/banda_quake.json` | Portátil tal cual |
| Veredicto de sellado | `qbsp -leaktest` en `C:\Desarrollo\ericw-tools\` | **Se usa ya como linter descartando el `.bsp`** — el mismo truco vale aquí |
| Cuatro niveles construidos | `../Mydra Map Lab/levels/*.plan` y `build/*.map` | `plaza`, `bastion`, `cistern`, `vault` |
| Hojas de sprites de 8 direcciones | `../Mydra Map Lab/godot/sprites/{idle,walk,run,punch,death}/` | PNG + `frames.json`, independientes del motor |
| Texturas | `../Mydra Map Lab/godot/textures/*.png` | CC0 y propias, con `PROCEDENCIA.md` |

**No copiar nada todavía.** El experimento 02 queda congelado y no se edita;
aquí se lee de allí o se copia lo mínimo, pero no se toca el original.

## Lo que hay que reconstruir, y es todo el coste real

1. **Un cargador de `.map` en JavaScript.** El `.map` es texto y ya está
   demostrado que se parsea: `mapstats.py` lo hace, con el cálculo de planos y
   vértices resuelto. Es el camino inverso del emisor.
2. **El controlador del jugador en primera persona.** Con el detalle que costó
   caro en el 02: subir escalones de hasta 16 unidades (0,5 m) no sale gratis.
3. **El enemigo de sprites de ocho direcciones.**
4. **El arnés de pruebas.** Es lo que de verdad está en juego. Buena noticia:
   **Rapier corre en Node sin navegador**, así que caminar, escalones,
   colocación del enemigo y viaje entre niveles se pueden comprobar en Node
   plano. Solo lo de render pediría un navegador (Playwright o similar).

Las 170 comprobaciones del lado de Godot se pierden. Las 175 de Python no.

## La sonda mínima, y nada más hasta que funcione

Cargar `plaza.map` en Three.js y caminarlo, con `qbsp` todavía de juez.

**Pila inicial: Three.js + Rapier. Punto.**

Aplazados hasta que algo duela de verdad: React Three Fiber, Zustand/Redux,
GSAP, Howler, Draco. El historial de este proyecto dice que las pilas grandes
de entrada se pagan caras, y el activo más difícil de reconstruir —un arnés de
verificación determinista— se vuelve más difícil con cada capa de por medio.

Dos objeciones concretas a la lista de herramientas que motivó este
experimento, para no repetirlas:

- **Redux Toolkit para estado de juego es la herramienta equivocada.** Un bucle
  a 60 fps no quiere un store que dispare re-renders. Zustand fuera de React o
  con suscripciones transitorias sí vale.
- **React Three Fiber no es una victoria gratis.** Mete un reconciliador entre
  el código y el bucle de render. Evaluarlo, no darlo por hecho.

## Referencia visual

El usuario vio un artefacto hecho con Three.js que le gustó mucho:
<https://claude.ai/artifact/78NPvbJMLcQikzukVq7BqW>

**No se ha podido abrir** desde la sesión anterior (los artefactos públicos aún
no se pueden leer así), o sea que **nadie de este lado lo ha visto todavía**.
Pedírselo al usuario al empezar: el enlace otra vez, o una captura, que esas sí
funcionan. Y preguntarle **qué le gustó en concreto** — paleta, niebla,
iluminación, escala, el movimiento— porque «bonito» no es una especificación.

## Las reglas que vienen de los dos experimentos anteriores

No son burocracia; cada una costó un fallo real.

- **`exit 0` no significa correcto, significa compilable.** Un mundo vacío
  sella perfecto. Exigir siempre planos y caras distintos de cero.
- **No pedir al modelo que invente geometría — calcularla.** El agente escribe
  un plano de planta en texto; un conversor determinista produce los brushes.
- **Un medidor que se equivoca no falla: da una cifra plausible.** Contrastar
  todo medidor contra verdad conocida antes de creerle nada.
- **Hay cosas que solo se ven mirando.** Las dos peores del 02 —una plaza que
  parecía un pozo y una puerta invisible— pasaban todas las comprobaciones. Que
  haya una forma de sacar capturas desde el principio.
- **Ningún asset entra sin archivo de licencia al lado.** Esto descarta Mixamo
  tal cual, que no da uno. Verificar la de GSAP antes de usarla.
- **Los caminos de error hay que ejercitarlos a propósito.**
- **Una entidad que no tiene geometría no se ve**, y marcarla no puede depender
  de que el autor se acuerde.

## Cómo se sabrá si salió bien

Este experimento **no** consiste en hacer el juego. Consiste en contestar la
pregunta de arriba. Sale bien si al terminar se puede decir, con cifras:

1. `plaza.map` se carga y se camina en el navegador.
2. Hay comprobaciones automáticas sin ojos, y cuántas.
3. `qbsp` sigue siendo el juez del sellado.
4. Cuánto costó, comparado con lo que se perdió.

Y sale mal —lo que también es un resultado— si el veredicto automático no
sobrevive. En ese caso se cierra y se vuelve a Godot con la lección aprendida.

## Dónde está lo anterior

- Experimento 02, congelado: [../Mydra Map Lab/README.md](../Mydra%20Map%20Lab/README.md)
  y su [NEXT_SESSION.md](../Mydra%20Map%20Lab/NEXT_SESSION.md), que incluye el
  inventario de los límites de lo que se logró.
- Experimento 01, congelado: `../Mydra Sprite Lab/mydra-sprite-lab/`.
- **Ninguno de los dos se edita.**
