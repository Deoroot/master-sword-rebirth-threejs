# Experimento 06 — cerrar Gate City, y decidir qué es este proyecto

Lee `NEXT_SESSION.md`, `CAPACIDAD_05.md` y `README.md`. Gate City se anda en
`?map=gatecity` con 397 comprobaciones en verde: el `.bsp` leído al byte, sus 92
texturas, su mapa de luz de 2,03 MB, los 101 adornos de 17 `.mdl`, los 80
carteles y los cinco modos de dibujado.

La pregunta del 05 —**¿es capaz esta pila de poner en pantalla lo que ese `.bsp`
pone en pantalla?**— está contestada que sí, y está en `CAPACIDAD_05.md`.

**Esta sesión tiene dos trabajos y son de naturaleza distinta.** El primero es
cerrar la fidelidad de este mapa, que está medida y a la que le faltan tres cosas
concretas. El segundo es decidir qué es este proyecto ahora, porque dejó de ser
el experimento con el que empezó.

## La regla del 02, que no se relaja

**«Ningún asset entra sin licencia al lado.»** El `.bsp` es obra de DrKill, los 17
`.mdl` de sus autores y el motor es de sus autores. Se resuelve como siempre:

- **Escribir un LECTOR es nuestro.** `src/bsp/*.js` lee `.bsp`, `.spr` y `.mdl`
  y no contiene un byte de este mapa. **Leer el código del motor para saber qué
  hace también es nuestro** — lo que se copia es la fórmula, no el archivo.
- **Copiar el CONTENIDO no.** Todo lo extraído va a `build/gatecity/`, que está
  en `.gitignore`. **No se mueve un byte a `public/`.** Si el navegador necesita
  servirlo, se le da una ruta del servidor de desarrollo apuntando a `build/`.
- Lo que no se puede leer se **genera** y se dice: el halo de las lámparas es un
  degradado nuestro porque `glow01.spr` es del Half-Life base y no está. Queda
  escrito en `build/gatecity/PROCEDENCIA.md`, y ahí es donde va cualquier otra
  sustitución.

## Dónde está el original, que es lo que cambió la sesión pasada

Cuatro sitios, y **mirarlos antes de razonar**:

| dónde | qué contesta |
| --- | --- |
| `C:\Juegos\MSR\msr\` | la instalación **Xash3D**: `config.cfg`, `opengl.cfg`, `video.cfg`, y `maps/gatecity_detail.txt` |
| `C:\Juegos\Steam\steamapps\common\msrebirth\msr\` | la instalación **GoldSrc**. Da los mismos valores |
| `...\Visual Studio Projects\MSC\xash3d-fwgs-sdk\` | el **código del motor** |
| `...\MSC\MasterSwordRebirth-Xash3D\src\` | el **código del mod**; `MSC\assets\msr\` los assets |

La lección más cara del 05 cabe en una línea: **la iluminación se calibró tres
veces contra criterio propio y las tres estaba mal, hasta que apareció esto.** El
caso que lo resume es `gl_overbright "0"` — un factor de DOS sobre el mapa entero,
y no hay forma de deducirlo leyendo un `.bsp`.

**Un razonamiento sobre el formato es una hipótesis. Un `config.cfg` es un hecho.**

## Lo que YA está decidido y no se vuelve a discutir

- La gamma sale de `src/bsp/gamma.js`, que es `BuildGammaTable()` del motor.
  `pintarAtlas()` es `R_BuildLightMap()`. **No se toca ninguna constante de ahí
  sin leer antes el código del motor otra vez.**
- Gate City dibuja **sin espacios de color** —texturas en `NoColorSpace`, salida
  en `LinearSRGBColorSpace`— porque el motor multiplica en 8 bits y en espacio de
  pantalla. Declararlas sRGB aplastaba las sombras por un factor de tres.
  **Deshacer esto es volver al fallo**; está en `ESPACIO` en `bsp_escena.js` con
  su tabla.
- Gate City dibuja a **resolución nativa**; los demás mapas siguen a 320 px, que
  es el estilo de Corinth y del jharro.
- El filtro es **lineal y trilineal con anisotropía 8**, porque lo dice
  `gl_texturemode` y `gl_anisotropy`. El píxel gordo de Half-Life son las
  texturas, no el filtro.
- El jharro y los experimentos 01 y 02 **no se tocan**.

## Parte 1 — LAS TEXTURAS DE DETALLE. Es lo que toca

`C:\Juegos\MSR\msr\maps\gatecity_detail.txt` tiene **61 líneas**: 61 de las 80
texturas del mundo llevan una textura de detalle y su escala. `r_detailtextures`
vale `"1"`. No dibujamos ninguna.

```
{grate1b detail/tl_metal 3.0 3.0
0web_1   detail/tl_web   2.0 2.0
dirt2    detail/tl_dirt  4.0 4.0
```

Los `.tga` están en `gfx/detail/`. Hace falta:

1. **Un lector de `.tga`**, que es corto: cabecera de 18 bytes, sin comprimir o
   con RLE, 24 o 32 bits. Mismo trato que el resto — `tools/` o `src/bsp/`, y lo
   extraído a `build/gatecity/detail/`.
2. **La mezcla**, y aquí está lo bueno: el motor las mezcla con `RGB_SCALE 2`, o
   sea `base × detalle × 2`. En Three.js eso es
   `CustomBlending` con `blendSrc: DstColorFactor` y `blendDst: SrcColorFactor`,
   que da exactamente `2·src·dst` — **sin shader**, que es lo que hay que poder
   seguir diciendo. Una segunda pasada sobre la misma geometría, con `depthFunc:
   EqualDepth` y `depthWrite: false`, igual que hace el motor.
3. **Las UV**: son las de la textura multiplicadas por la escala de cada línea.
   Un segundo juego de UV o una `repeat` por material.

Mira cómo lo hace el motor antes de escribirlo: `ref/gl/gl_rsurf.c`, busca
`r_detailtextures` y `DrawGLPolyChain`.

## Parte 2 — Y MÍDELO, porque la hipótesis puede ser falsa

Esto es lo que queda sin explicar, y está medido:

| | **juego** | **nuestro** |
| --- | --- | --- |
| luz mediana | 32,3 | 40–43 |
| saturación mediana | 0,590 | 0,38–0,42 |

Con su control, que es lo que permite afirmarlo: **girando la cámara desde el
mismo punto**, la mediana sólo se mueve de 38 a 43 y la saturación de 0,380 a
0,421. El encuadre no lo explica.

Las texturas de detalle son la **candidata**, no la respuesta. Conservan la media
y añaden contraste, así que deberían subir el contraste local y no bajar la
mediana. **Si después de ponerlas la mediana sigue en 40, la causa es otra y hay
que seguir buscándola.**

La herramienta está hecha:

```
node tools/comparar.mjs build/referencia/juego-calle.png \
                        build/gatecity/vistas/calle-sin-glow-crudo.png
```

Compara luminancia por percentiles, saturación, tono y contraste local. **Mide
antes de tocar y después de tocar, y escribe los dos.**

Y una advertencia sobre la referencia: `build/referencia/juego-calle.png` es UNA
captura, de un encuadre que no es el nuestro. Si aparece la oportunidad de pedir
más capturas del juego —sobre todo de sitios que se puedan identificar— vale más
que cualquier razonamiento.

## Parte 3 — El cielo `nature1`

`worldspawn` declara `skyname "nature1"`: seis `.tga` que GoldSrc carga de
`gfx/env/`. **Están en `C:\Juegos\MSR\msr\gfx\env\`.** Hoy las 3 822 caras de
`sky` —el 11,6 % de la superficie— se pintan de un color plano sacado del
`_light` de `light_environment`.

Con un lector de `.tga` ya escrito para la parte 1, esto es una caja de seis caras
y `BackSide`. Cuidado con el orden y la orientación de las seis: GoldSrc las
nombra `up/dn/lf/rt/ft/bk` y el que se equivoca ve costuras, no un error.

## Parte 4 — El parpadeo de los estilos 1 y 6

**8 842 bloques con estilo 1 y 3 368 con estilo 6.** Hoy se hornea el valor MEDIO
de cada patrón (`PATRONES` en `src/bsp/gamma.js`), que es lo correcto para un
atlas fijo pero no parpadea.

Es lo único de todo el mapa que pide salirse de los materiales de fábrica: hace
falta **un atlas por estilo** y mezclarlos por fotograma. Antes de hacerlo, mide
cuánto cambia la pantalla: si son 208 m² en un rincón, no vale la pena; si es la
mitad de las antorchas del mapa, sí. **Esa medida va primero.**

El motor lo hace en `ref/gl/gl_rlight.c`, `R_AnimateLight()`: diez cambios por
segundo, `letra × 22`, y `cl_lightstyle_lerping "0"` en la configuración dice que
**no interpola** — salta.

## Parte 5 — Y entonces, ¿qué es este proyecto?

Esto no es una parte técnica y es la más importante. Quien dirige el proyecto lo
dijo así:

> «a este punto creo que el experimento básicamente cambia de *port gatecity a
> three.js* a *port master sword rebirth a three.js test*. vemos que es posible
> hacer casi 1/1 con geometría y assets, casi seguramente da para la física,
> combat, etc.»

Cerradas las partes 1 a 4, **escribe la propuesta** y preséntala para decidir, no
la ejecutes. Tiene que contestar:

- **Qué cambia el criterio.** Un visor tiene que verse bien; un port tiene que
  poder JUGARSE. Eso convierte en deuda tres cosas que hoy son huecos aceptables:
  los adornos no tienen colisión, los `.mdl` no tienen animación, y no hay PVS.
- **Qué hace falta y en qué orden**, con lo que cuesta cada trozo medido contra
  lo que ya costó lo hecho. La animación de `.mdl` y un segundo mapa con su
  transición son los dos candidatos a lo siguiente.
- **Qué NO se va a hacer**, que es la mitad de una propuesta honesta.
- **Dónde vive.** Si esto es otro proyecto, ¿sigue en `Mydra Web Lab` al lado de
  Corinth y del jharro, o se separa? Y si se separa, qué se lleva.

## Las reglas, que siguen valiendo todas

- **No inventes, calcula.** Cada número sale del archivo o del motor.
- **Saca fotogramas y MÍRALOS.** `npm run gatecity:shot` saca 16 y los mide.
- **`exit 0` no significa correcto**, y «se ve algo» no significa que esté bien.
- **Cada sonda con su control, y un cero sin control positivo NO es un
  resultado.** La sesión pasada se cayeron **seis** sondas, todas del mismo modo:
  bien puestas, midiendo la cosa equivocada, y devolviendo un número redondo y
  convincente. Las que más costaron:
  - una comparaba el objeto de `contenidoEn()` con un entero y decía «728 de 728»;
  - otra teñía de rosa y su control positivo salió 0,00 % porque el rosa se
    multiplica por una textura cuya mediana es 41 sobre 255;
  - otra medía el **HUD** en vez del mapa —el punto más claro salía en la esquina
    de la caja de controles— y sostuvo «el máximo vale 72» durante dos vueltas.
    Por eso el sacador vuelca ahora el **framebuffer crudo**;
  - otra editaba las UV del mapa de luz y devolvía el fotograma IDÉNTICO, o sea
    un «no cambia nada» que no significaba nada. La que sirvió fue
    `probe.setPlenaLuz()`, que es `r_fullbright` y recompila el material.
- **Las herramientas que ya existen y hay que usar**: `tools/comparar.mjs`,
  `probe.setPlenaLuz()`, `probe.setAdornos()`, `probe.setLuz()`,
  `probe.setTexturas()`, `probe.setLado()`, `probe.setAdornoLado()`,
  `npm run gatecity -- --sinluz`, `--gamma`, `--texgamma`, `--brillo`,
  `--overbright`.
- **Si encuentras un fallo mío, dilo con el número delante.** Los cinco que más
  costaron en el 05 los encontró alguien jugándolo, no una comprobación.

## Lo que hay que dejar escrito al terminar

- `CAPACIDAD_05.md` con lo que cierre, y sus medidas antes y después.
- `NEXT_SESSION.md` con lo que quede abierto.
- La propuesta de la parte 5, para decidir.
- Y si algo se generó en vez de leerse, en `PROCEDENCIA.md`.
