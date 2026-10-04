# Contenido NUESTRO

Todo lo demás de este repositorio **lee** Master Sword. Lo de esta carpeta es
nuestro: mapas y, más adelante, guiones escritos para este proyecto. Empezó en
el experimento 88 ([doc/CONTENIDO_88.md](../doc/CONTENIDO_88.md)).

| archivo | qué es |
| --- | --- |
| `sala88.mjs` | dos salas, un pasillo y una rata: el tubo que prueba el camino de un mapa nuevo |
| `gatecity_anexo.mjs` | el experimento de geometría: un túnel octogonal y una calle con dos casas, hechos con las medidas y las texturas de Gate City para ver si se distinguen del de verdad. Todavía NO está unido a Gate City; sí está en la lista de mapas del menú, para poder entrar como entra el jugador |
| `scripts/gatecity_anexo/warden.script` | el guarda del anexo: el primer NPC de misión nuestro. Pide matar a la rata y paga con una armadura |
| `scripts/gatecity_anexo/rat.script` | la rata de esa misión: la del juego, más el aviso al guarda cuando muere |
| `scripts/pruebas/oleada.script` | guion de PRUEBA, de ningún mapa: crea un bicho con `createnpc` en un punto, le pasa parámetros y se queda con su asa. Lo corren `test/createnpc.test.mjs` y `sondas/createnpc.mjs` desde su texto |
| `scripts/pruebas/cria.script` | lo que crea el anterior en la prueba de Node: la rata del juego más su `game_dynamically_created`, que avisa a quien la creó por `ent_creationowner` |

## Cómo se compila

```bash
npm run contenido -- sala88     # .map + VHLT  ->  build/contenido/maps/sala88.bsp
```

Hace falta VHLT, que no viene con el repositorio: en `C:/Herramientas/vhlt` o
donde diga `VHLT_DIR`.

Y para verlo en el puerto hay que hornearlo, como cualquier mapa:

```bash
for p in mapa mapa:bichos mapa:aparicion menus guiones mapainfo sonido; do npm run -s $p -- --mapa gatecity_anexo; done
```

## Los guiones nuestros

Van en `contenido/scripts/<carpeta>/<nombre>.script`, con el mismo lenguaje que
los del juego, y pueden hacer `#include` de los suyos (`monsters/base_chat`,
`monsters/giantrat`). El usuario abrió esa puerta el 2026-10-04, y
`test/procedencia.test.mjs` la deja abierta sólo ahí.

`npm run contenido -- <mapa>` los **monta**: copia los guiones del juego a
`build/contenido/scripts` y pone los nuestros encima, para que el horneado lea
una sola carpeta. Un mapa nuestro se hornea con ese árbol; uno del juego, con los
del juego, como siempre. **Un guion nuestro no puede llamarse como uno del
juego**: el montaje se niega.

Una entidad del mapa apunta a su guion con `scriptfile`, que gana a
`defscriptfile`: `{ classname: "ms_npc", scriptfile: "gatecity_anexo/warden" }`.

La misión de prueba se mide con `npm run sonda:mision_anexo` (16 controles: hablar
con la F, aceptar con el dígito, matar a la rata a espadazos, volver y cobrar).
El estado de una misión va en el personaje, con `quest set`, para que una cadena
sobreviva al cambio de mapa; el alcalde de Gate City guarda la suya en variables
del NPC y por eso se pierde.

Lo que NO está medido: Xash3D no ha cargado estos guiones, y la sonda no
comprueba que matar a la rata sin la misión aceptada no la adelante (sólo hay una
rata por partida).

## Con qué se construye

`tools/mapagen.mjs` empezó sabiendo hacer cajas. Desde el anexo sabe además:

- `prisma(eje, perfil, a0, a1, tex)`: un polígono convexo estirado. El chaflán de
  un túnel octogonal, una esquina a 45°, un jabalcón de madera;
- `convexo(puntos, caras, tex)`: cualquier sólido convexo, con los planos
  orientados solos;
- `relieve({ min, max, paso, tapa, cota, tex })`: roca tallada, un brush por
  triángulo, para techos y suelos que no son planos;
- texturas con `escala` y `desp`, y una cara suelta de una caja (`oeste`, `este`,
  `norte`, `sur`) para encajar una puerta o una ventana;
- entidades de brush: `{ classname: "func_illusionary", brushes: [...] }`.

Las medidas de Gate City de las que sale el anexo están escritas arriba de
`gatecity_anexo.mjs`, y las herramientas que las sacaron del `.bsp` están en
`build/lab/geometria/` (`plano.mjs`, `medir.mjs`, `medir2.mjs`, `vistas.mjs`).

## Lo que es nuestro y lo que no

- **La descripción del mapa** (`*.mjs`): la geometría y las entidades. Es nuestra.
- **Las texturas no.** El mapa NOMBRA texturas de los `.wad` de MSR, y el `.bsp`
  compilado las lleva dentro. Por eso el `.bsp` vive en `build/`, que no se
  versiona ni se publica, igual que lo extraído del juego.
- **Los modelos y guiones a los que apuntan las entidades** —la rata es
  `monsters/giantrat`— son del juego y se leen de `../MSC/`.

## Licencia

**PENDIENTE: la decide el usuario.** Hasta entonces, esta carpeta no tiene más
permisos que el resto del repositorio, que todavía no tiene `LICENSE` (ver
NEXT_SESSION.md).
