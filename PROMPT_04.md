# Experimento 04 — el jharro

Lee `NEXT_SESSION.md` y `README.md` de Mydra Web Lab, sección «Medir un mapa
ajeno: gatecity.bsp». Corinth está en pie, se camina con el teclado en
`?map=corinth` y hay 257 comprobaciones en verde. Esta sesión empieza otra cosa.

**Vamos a construir una ciudad excavada en la roca** —lo que Master Sword llama
un *jharro*— tomando `gatecity.bsp` como referencia MEDIDA, no como fuente.

`npm run bsp -- ../MSC/assets/msr/maps/gatecity.bsp --entidades --texturas` ya
saca todas las cifras sin abrir nada. **El `.bsp` no se porta**: es obra de
DrKill y la regla del 02 manda —ningún asset entra sin licencia al lado—. Se mide
y se construye lo nuestro con el kit CC0. Lo transferible son las proporciones.

## Lo que la medida dijo, y contradice lo que haríamos por defecto

| | Gate City | Corinth |
| --- | --- | --- |
| Huella | 138 × 195 m | 80 × 72 m |
| Alto | **32 m, el suelo en 5 bandas** | 1 planta |
| Techo | **107 % del suelo** | 0 % |
| Altura libre | mediana **2,8 m** · p25 2,3 · p75 4,9 · p90 9,3 | — |
| Luces | 117, **una cada 71 m²** | 19, una cada 216 m² |
| Superficie de roca | **54 %** (rock_07 30 %, ms_dirt01 17 %, ground03 7 %) | 0 % |
| Adornos | 101 colocados, **solo 17 modelos** | 209 piezas de kit |

Las cuatro que mandan sobre el diseño:

1. **Más de la mitad del sitio es estrecho.** 55 % por debajo de 3 m de altura
   libre, solo 16 % por encima de 8. Un jharro no es una caverna grande: son
   pasillos y cuartos de techo bajo con alguna bóveda suelta, y **el contraste**
   es lo que lo hace legible. Una cueva de altura uniforme no se parece.
2. **Las casas están pegadas a la cueva**, no la cueva construida alrededor de
   las casas. Lo construido no llega a un tercio de la superficie. Corinth se
   montó al revés y por eso no sirve de plantilla.
3. **Cuatro veces más luz que Corinth.** Bajo tierra la luz no es ambiente, es el
   plano: es lo que dice por dónde se pasa. Y hay un truco medido que vale la
   pena copiar —el concepto, no el archivo—: `info_texlights` declara UNA textura
   emisiva, `pi_lantern` a `255 255 128`, o sea que el farol se ilumina solo.
4. **Repetición, no variedad.** 101 adornos de 17 modelos: 27 sillas, 24 espadas,
   14 barriles, 3 mesas, helechos, velas, un carro. Y 55 de los 58 sprites son
   el mismo fuego. Lo que llena un sitio no es tener muchas cosas distintas.

## Lo que el kit CC0 no tiene y hará falta

Tenemos barril, cajón, paja, saco, chimenea, escaleras, vigas, muros y tejados.
**No hay sillas, mesas, helechos, velas ni carros**, y son 40 de los 101 adornos
de Gate City. Se generan, como ya se generan las vallas: `src/kit/malla.js` tiene
las primitivas y `src/kit/cerco.js` es el ejemplo de cómo se hace una cosa de
madera a partir de cajas y la franja de madera del atlas. Una silla y una mesa
son cajas; un helecho es un cartel como los arbustos que ya hay.

## Las partes

Esto es un experimento por partes y **esta sesión toma de la 1 a la 3**. Las
demás quedan escritas para no perderlas.

### Parte 1 — El plano en tres dimensiones *(lo único de verdad nuevo)*

`corinth.js` es una rejilla plana y `alcanzables()` inunda en cuatro
direcciones. Un jharro tiene plantas y se pasa de una a otra por escaleras,
rampas y pozos. Hace falta:

- un plano de celdas **por planta**, con las cotas medidas y no elegidas
  —Gate City reparte el suelo en bandas a −22, −20, −18, −14, −12, −10, −4 y +8 m,
  con el grueso en −14—;
- las **conexiones verticales** como parte del plano, no como geometría: una
  escalera es una arista entre dos celdas de plantas distintas;
- `alcanzables()` en 3D, y la prueba de siempre: **se llega desde la entrada a
  todo lo pisable**, y si se quita una escalera, deja de llegarse.

Todo esto es lógica pura: se comprueba en Node plano, sin gráficos. Y se DIBUJA
—un SVG por planta, como `tools/plano.mjs`— porque el fallo «esto es un
descampado» ya costó una sesión y el dibujo lo enseña de un vistazo.

### Parte 2 — La roca

El 54 % de lo que se ve. No es un terreno: tiene techo. Dos campos de altura por
planta —suelo y bóveda— o un tallado, lo que salga mejor, pero con dos
condiciones que no son negociables:

- **la altura libre tiene que dar los percentiles medidos**: mediana 2,8 m,
  55 % por debajo de 3, 16 % por encima de 8. Eso se mide con el mismo método que
  `tools/bsp.mjs` usa sobre Gate City, así que la comparación es directa;
- **la costura con el suelo del `.map`**, si hay `.map`, por el método que ya
  funciona: una sola función decide de quién es cada celda y las dos partes la
  preguntan. Ver `hayRoca()` en `boca.js` y la prueba de los 900 pasos.

### Parte 3 — Lo construido, pegado a la cueva

Fachadas contra la pared de roca, no casas exentas. El kit vale tal cual; lo que
cambia es el colocador: en vez de `rumboDeCalle()` buscando la calle más cercana
a la llegada, aquí la casa mira a donde hay hueco y se arrima a la roca. Y hay
que resolver la junta entre una fachada recta y una pared que no lo es.

### Parte 4 — La luz

Una fuente cada 71 m² de suelo, repartida **desde el grafo de lo pisable** y no a
ojo: un farol cada tantos metros a lo largo de cada pasillo. Más la textura
emisiva del propio farol. La sonda: ningún tramo pisable a más de X metros de una
luz, y la densidad medida contra el objetivo.

### Parte 5 — Caminarlo y mirarlo

El arnés de `tools/andar.mjs` sirve casi entero, y hay que añadirle lo que esta
sesión aprendió a base de golpes:

- el **barrido de rayos** buscando suelo, y el de canto buscando caras que faltan
  —aquí todo es superficie, no volumen: un rayo que se cuela por una cara
  olvidada no vuelve a chocar con nada—;
- **cada sonda con su control**. Una sonda sin control es una sonda que dice que
  sí, y en la sesión anterior CUATRO de los fallos que gritaron las sondas eran
  de las sondas. La del canto hubo que escribirla tres veces.
- y **fotogramas medidos desde el visor de verdad**, no desde una página aparte.
  Una página propia para capturas ya enseñó un pueblo sin árboles mientras el
  que se andaba tenía ochenta y cuatro.

### Parte 6 — Los adornos

Sillas, mesas, helechos, velas y un carro, generados. Y el fuego de los faroles
como cartel animado, que el sistema de carteles ya existe.

## Las reglas, que no cambian

- **No inventes geometría, calcúlala.** Ni una coordenada a mano.
- **Saca fotogramas y MÍRALOS.** De los fallos que más han cambiado este trabajo,
  la mayoría no los detectó ninguna cifra: el pueblo era un descampado, los muros
  salían de piedra, el portón parpadeaba, había bloques flotando en el agujero.
- **Ningún asset sin licencia al lado.** Gate City se mide, no se porta.
- **`exit 0` no significa correcto**, y «nadie se cayó» no significa que el suelo
  esté entero.
- Los experimentos 01 y 02 siguen congelados.

## Avisos que ya costaron caro y volverán

- **La escala de GoldSrc no es la de Quake**: 39,37 unidades por metro, no 32.
  Leer Gate City con las nuestras lo encoge un 19 % y no falla nada.
- **Una pieza del pack puede ser una cáscara hueca.** `stone_square`,
  `plaster_wall` y `stone_square_1m` tienen CERO caras horizontales. El
  manifiesto declara la caja y no dice si por dentro hay algo. Está pendiente
  medir esto pieza por pieza del kit, y bajo tierra —donde todo es interior—
  importa mucho más que en Corinth.
- **Dos brushes en el mismo volumen no dan error, dan z-fighting**, y un
  fotograma fijo no lo caza porque congela la pelea en un ganador.
- **Un valor por defecto plausible es un fallo silencioso.** Las matas sin
  `height` salieron de diez metros y la cobertura SUBIÓ, así que la sonda dijo
  que se veía mejor.
- **Abrir un hueco en un muro deja el hueco sin suelo.**
- **`-0` no es `0` para `Object.is`.**
