# Avisos que cuestan una sesión si se olvidan

Esto es lo que ha mordido de verdad, con el caso que lo enseñó. Estaba enterrado
en las últimas doscientas líneas de `NEXT_SESSION.md`, que nadie leía porque el
documento decía «dónde se quedó esto» y llevaba veinte «dónde se quedó» apilados.

Se han dejado fuera los avisos del laboratorio anterior que sólo valían para
generar niveles por procedimiento —el jharro, Corinth—, porque aquí no se genera
nada: se lee un `.bsp` que ya existe. Están en el historial de git si hicieran
falta.

---

## Medir

- **Un cociente con el denominador equivocado no da error.** Contando luces por
  metro de *huella*, Gate City parecía tener siete veces más luz en el pueblo que
  fuera; por metro de *suelo* —que es lo que se ilumina— son 2,4 veces. Se
  escribió, se dio por bueno y estuvo a punto de ser un objetivo: habría
  triplicado los faroles del pueblo y dejado la cueva a oscuras, **con la
  comprobación en verde**.

- **Una cifra global no ve un problema de reparto.** Tres veces ya. 256 celdas
  apiñadas en una esquina y 256 repartidas dan el mismo relleno del 31 %. Contra
  esto hace falta una segunda cifra que mida la **forma**, o el dibujo.

- **Un sesgo del medidor no se corrige mintiendo, se corrige midiendo.** Si el
  método reparte cada cara por su caja, ese sesgo está también en la medida de
  Gate City: lo que hay que igualar es la curva **medida**, no la teórica. `GAMMA`
  es ese número y hay una prueba que falla si alguien lo quita.

- **Copiar un número medido sin preguntarse qué es puede hacer el mundo
  intransitable.** El p10 de altura libre de Gate City son 0,8 m. Eso no son
  pasillos de ochenta centímetros: son salientes sobre un suelo que sí se pisa.

- **Un valor por defecto plausible es un fallo silencioso.** Si no está el dato,
  que se note; inventarse algo razonable es lo que hace que nadie lo busque.

## Sondas

- **Una sonda sin control es una sonda que dice que sí.** Y una sonda con control
  pero mal escrita es peor: acusa a quien no es y se pierde la sesión arreglando
  lo que estaba bien.

- **La cobertura no vale como sonda a oscuras.** Mide píxeles que no son del color
  de la niebla, y con la niebla casi negra la roca sin farol tampoco lo es: un
  pasillo a oscuras marcó **95,7 % de cobertura siendo una pantalla negra**. Lo
  que vale es la luminancia —qué fracción pasa de 32 sobre 255—, y esa misma toma
  daba 0,0 %. *Es el mismo animal que el apartado 4 de [CLAUDE.md](../CLAUDE.md),
  y es el caso más viejo de los cinco.*

- **Playwright no repite teclas.** `keyboard.down("Escape")` + esperar manda **un
  solo** `keyDown`: la repetición automática la hace el sistema operativo. Un
  control de «aguantar una tecla» escrito así mide el transporte de la sonda, no
  el juego. Lo que sí funciona es llamar `down()` varias veces sin `up()` en
  medio, que lleva `repeat: true`.

- **Las sondas entran por donde entra el jugador, y eso se rompe en silencio.**
  Las 22 sondas cargaban `?map=gatecity`, que desde el experimento 36 ya no es
  por donde se entra. Se rompió la regla en las 22 a la vez y **ninguna se puso
  roja**.

## Navegador y motores

- **`castRay` no toca nada hasta el primer `world.step()`.** El mundo de Rapier no
  existe para los rayos hasta que ha dado un paso.

- **`readPixels` después del intercambio de buffer devuelve NEGRO.** Hay que
  leerlo antes, o pedir `preserveDrawingBuffer`.

- **Un `<canvas>` recién creado mide 300x150.** Es la definición del elemento, no
  un tamaño real. Medir `width`/`height` para saber si algo se montó da verde con
  todo sin montar. Lo mismo con `offsetWidth` de algo que se monta escondido.

- **`-0` no es `0` para `Object.is`.** En un assert de igualdad estricta eso es un
  rojo que no significa nada; `Math.abs` lo resuelve.

- **glTF pone el origen de la UV arriba**, y una UV fuera de su recuadro del atlas
  pinta otro material sin dar ningún error.

- **Los atajos de ventana del navegador no son cancelables.** `preventDefault()`
  no salva Ctrl+W. Sólo la Keyboard Lock API, y sólo a pantalla completa.

## GoldSrc y Half-Life

- **La escala de GoldSrc es 39,37 u/m, no 32.** Es la de Quake y no es la de
  aquí.

- **Hay dos builds de Master Sword.** La de Xash3D es standalone; la de GoldSrc es
  un mod y el motor **monta `valve/` detrás siempre**. No encontrar un archivo en
  `assets/msr` es correcto; concluir que el juego no lo tiene, no.

- **Un farol no alcanza su alcance.** Three.js multiplica la luz de un punto por
  una ventana que a nueve décimos del radio ya ha recortado el 96 %. GoldSrc
  hornea con caída **lineal** hasta el radio. Copiar la proporción sin copiar el
  modelo es medir con otra vara.

- **Los `*_english.txt` de Valve son UTF-16 con BOM.** Leerlos como UTF-8 da una
  cadena con un cero entre cada letra: parece que funciona y no encuentra nada.
