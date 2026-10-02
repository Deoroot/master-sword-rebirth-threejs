# Créditos y procedencia

Este proyecto **lee** Master Sword Rebirth para aprender de él y reproducirlo
en Three.js. No lo redistribuye. Lo que hay aquí es código nuestro; el
contenido del mod se queda donde está.

---

## Master Sword Rebirth

El mod, su código, sus mapas, sus modelos, sus texturas, sus sonidos y sus
2 884 scripts son **del equipo de Master Sword Rebirth** y de los autores de
Master Sword Continued y Master Sword del que desciende.

- **Equipo de MSR** — <https://github.com/MSRevive>, que es la organización desde
  la que publican. De ahí salen las tres cosas que este proyecto lee:
  [MasterSwordRebirth](https://github.com/MSRevive/MasterSwordRebirth) (el código
  del mod), [MSCScripts](https://github.com/MSRevive/MSCScripts) (los 2 884
  scripts) y [assets](https://github.com/MSRevive/assets) (los mapas, modelos,
  sonidos y texturas). Su Discord: <https://discord.gg/nwJB9EhAN6>.
- **Valve**, por el SDK de Half-Life 1, y **FWGS**, por
  [xash3d-fwgs](https://github.com/FWGS/xash3d-fwgs), que es el motor que se leyó
  para entender qué hace el original. El servidor se leyó de
  [ReHLDS](https://github.com/dreamstalker/rehlds) y de
  [MSR-ReHLDS](https://github.com/MSRevive/MSR-ReHLDS).
- **DrKill** — autor de `gatecity.bsp`, que es el mapa que este proyecto
  reproduce y mide.
- **Anders Finér** — autor del cuadro de la torre que es el fondo del menú
  principal. Lo firma el propio juego: `resource/game_menu.tga` es la tira
  «MASTER SWORD / ART BY: ANDERS FINÉR» que se dibuja encima.
- **Thothie**, **MiB**, **HobbitG** y los demás nombres que aparecen en los
  comentarios del código y de los scripts del mod.

Todo lo que este repositorio sabe del juego sale de **leer** sus fuentes, que
el equipo publica: el motor (`xash3d-fwgs`), el código del mod y los scripts.
Cuando un número de este proyecto viene de allí, el archivo lo dice y cita la
línea — por ejemplo `DeathTax = 0.01` en
[src/juego/sesion.js](src/juego/sesion.js) o `BuildGammaTable()` en
[src/bsp/gamma.js](src/bsp/gamma.js).

## Valve

El formato BSP30, el `.mdl` v10, el `.spr` y buena parte de los assets que
Master Sword hereda son de **Valve** (Half-Life, GoldSrc). Eso el equipo de
MSR **no lo puede ceder**, y hay que tenerlo presente por separado. Un caso
concreto que ya nos hemos encontrado: `sprites/glow01.spr` no está en los
ficheros del mod porque viene del juego base — aquí el halo es
[generado](src/bsp/halo.js), no copiado.

---

## La regla, y qué contiene este repositorio

> **Ningún asset entra sin licencia al lado.**

En la práctica:

- **Se escribe el LECTOR, no se copia el mapa.** El `.bsp`, los `.mdl`, los
  `.spr` y los `.tga` siguen en la instalación de Master Sword del usuario.
- Todo lo extraído vive en **`build/`**, que está en `.gitignore`.
- **No se mueve un byte a `public/`.**
- Lo que no se puede leer se **genera**, y queda declarado en
  `build/gatecity/PROCEDENCIA.md`.

O sea que **quien clone este repositorio no recibe nada de Master Sword**:
recibe un lector y un juego, y necesita su propia copia del mod para que
`?map=gatecity` enseñe algo. Publicar el código y publicar el contenido son
dos cosas distintas, y aquí sólo se hace la primera.

## El repositorio, y por qué empieza privado

El líder del equipo de MSR, hablando del port de MSR a Xash3D, pidió dos
cosas: **crédito** y que **lo que se haga tenga un repositorio público**.
Este archivo es lo primero y el repositorio es lo segundo.

Y empieza **privado** de todas formas, con el alfa etiquetado, por una razón que
no es legal sino de cortesía: el repositorio lleva el nombre del juego, y se
prefiere que el equipo lo vea antes de que lo vea todo el mundo. Pasarlo a
público es un clic, y es a lo que esto va — no es un almacén privado.

Está en <https://github.com/Deoroot/master-sword-rebirth-threejs>, con el tag `v0.1.0-alpha`, al lado de
[Deoroot/MasterSwordRebirth-Xash3D](https://github.com/Deoroot/MasterSwordRebirth-Xash3D),
que es el fork del mod del que este port lee.

**Qué hay dentro en el tag `v0.1.0-alpha`, comprobado desde GitHub y no de
memoria:** 226 archivos —101 `.mjs`, 77 `.js`, 39 `.md`, 5 `.html`, 2 `.json` y
los dos de `git`—. **Ni un binario.** El historial lleva los experimentos
enteros; los `.glb` y los `.png` que aparecen en los commits antiguos son del
kit CC0 y de las capturas del laboratorio web, y salieron del árbol en la
mudanza.

La cuenta va atada al tag a propósito: cada experimento añade archivos, así que
un número suelto aquí envejece sin que nadie se entere. Lo que **no** envejece
es lo de «ni un binario», y eso no depende de que alguien lo recuerde — lo
comprueba [test/procedencia.test.mjs](test/procedencia.test.mjs) en cada
`npm test`.

> **Corrección del 87, al pasarlo a público.** «Ni un binario» dejó de ser
> exacto por decisión del usuario: *«incluyamos algunas imágenes de edana en el
> repo»*. Son **tres capturas de pantalla** de este port corriendo, en JPEG, en
> `doc/capturas/` — no assets: de una escena ya pintada no se saca ni una textura
> ni un modelo. La prueba de procedencia no se relajó: admite `.jpg` **sólo en esa
> carpeta y con tope de tamaño** (400 KB cada una, 1,5 MB en total), y lo demás
> sigue siendo rojo. Un `.jpg` en otro sitio, o un `.png` en ésa, se caza. Lo de
> arriba se deja como estaba, porque era verdad del tag `v0.1.0-alpha`.

Queda una tercera cosa que **no** está resuelta por esto y conviene no
confundir: **servir el mapa horneado desde un servidor web sí es
distribución**, y eso necesita permiso aparte — del equipo de MSR para sus
texturas y modelos, de DrKill para el trazado, y de Valve para lo heredado de
Half-Life, que ellos no pueden conceder. Mientras eso no esté, lo que se
publica es el código.

---

## Lo que es nuestro

El lector de formatos, el render, la física, el ciclo de sesión, el sistema de
personaje y las herramientas:

```
src/bsp/      lector de .bsp, .mdl, .spr, .tga, mapa de luz, gamma, árbol BSP
src/render/   la escena de Three.js, los bichos, los adornos
src/dev/      la sonda: por donde se mide el juego desde fuera
src/play/     la física del jugador y la manada de bichos, sin DOM
src/red/      el WebSocket, el protocolo, el servidor de partida y su fauna
src/juego/    personaje, estadísticas, inventario, almacén, sesión, interfaz
tools/        extracción, medida y control
test/         1 000 comprobaciones
src/vgui/     el kit de VGUI portado y los paneles del juego
sondas/       53 guiones de medida; 22 de ellos son las sondas `npm run sonda:*`,
              que arrancan un Chromium de verdad. El resto son de una vez
doc/          41 documentos: los informes de los experimentos, los encargos
              (PROMPT_*.md) y las notas sueltas
```

Nada de eso contiene contenido de Master Sword, y el lector vale para
cualquier `.bsp` de GoldSrc.
