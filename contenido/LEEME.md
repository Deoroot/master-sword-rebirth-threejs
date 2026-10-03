# Contenido NUESTRO

Todo lo demás de este repositorio **lee** Master Sword. Lo de esta carpeta es
nuestro: mapas y, más adelante, guiones escritos para este proyecto. Empezó en
el experimento 88 ([doc/CONTENIDO_88.md](../doc/CONTENIDO_88.md)).

| archivo | qué es |
| --- | --- |
| `sala88.mjs` | dos salas, un pasillo y una rata: el tubo que prueba el camino de un mapa nuevo |

## Cómo se compila

```bash
npm run contenido -- sala88     # .map + VHLT  ->  build/contenido/maps/sala88.bsp
```

Hace falta VHLT, que no viene con el repositorio: en `C:/Herramientas/vhlt` o
donde diga `VHLT_DIR`.

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
