# Cómo se trabaja aquí

Esto lo lee una sesión nueva antes de tocar nada. Es corto a propósito: lo que
no cabe está enlazado.

**El idioma: la documentación y los comentarios van en español, la interfaz del
juego en inglés.** El juego es inglés y traducirlo sería inventarse un Master
Sword que no existe; el cuaderno es nuestro. Hay una prueba que lo vigila
(`test/idioma.test.mjs`).

---

## 1. Qué es esto

Un port **no oficial** de Gate City, de *Master Sword: Rebirth*, al navegador.
Three.js y Rapier, sin motor de por medio. Se anda el `gatecity.bsp` de verdad,
con su mapa de luz horneado, sus 69 NPC, su combate, su inventario y un
servidor multijugador en Node.

No es una demo técnica: cada regla portada **cita el código del motor o del mod
del que salió, con archivo y línea**. Si no se puede citar, no se porta; se
mide y se dice qué se midió.

Lo que hay y lo que falta, con números: [README.md](README.md).
El plan y en qué orden: [PROYECTO_10.md](PROYECTO_10.md).

## 2. Dónde está el contenido del juego, y por qué no está aquí

**Este repositorio no lleva ni un byte de contenido del juego.** Ni una textura,
ni un modelo, ni un sonido: no hay un solo archivo binario, y
[`test/procedencia.test.mjs`](test/procedencia.test.mjs) lo hace cumplir. Lo que
hay es un *lector* y un *juego*.

El contenido vive **al lado**, en `../MSC/`, que no es nuestro y **no se toca**:

| carpeta | qué es | de dónde sale |
| --- | --- | --- |
| `../MSC/assets/msr/` | mapas, modelos, sonidos, texturas, `config.cfg` | <https://github.com/MSRevive/assets> |
| `../MSC/MSCScripts/scripts/` | los 2 884 scripts de los NPC | <https://github.com/MSRevive/MSCScripts> |
| `../MSC/MasterSwordRebirth-Xash3D/` | el código del mod, para citarlo | <https://github.com/MSRevive/MasterSwordRebirth> |
| `../MSC/xash3d-fwgs-sdk/`, `../MSC/ReHLDS-master/` | el motor, para citarlo | FWGS y ReHLDS |

Las dos primeras son las que pide el README para jugar; las otras dos no hacen
falta para que arranque, y sí para poder citar una línea en vez de suponerla.

Las tres reglas de procedencia, que no se negocian:

1. **El contenido se queda en `../MSC/`.** Nada se escribe de vuelta ahí.
2. **Lo extraído va a `build/`**, que está en `.gitignore` y lleva su propio
   `build/gatecity/PROCEDENCIA.md` diciendo de qué archivo del juego salió cada
   pieza.
3. **No se mueve un byte a `public/`.** Servir contenido horneado es
   redistribuirlo, y el permiso no está pedido — ver [CREDITOS.md](CREDITOS.md),
   cuya sección de reglas y la de permisos de Valve **no se tocan sin avisar al
   usuario**.

Corolario que ya mordió una vez: **hay dos builds de Master Sword.** La de
Xash3D es standalone (`gameinfo.txt` con `basedir "msr"`); la de GoldSrc es un
mod (`hl.exe -game msr`) y el motor **monta `valve/` detrás siempre**. Buscar un
archivo en `assets/msr` y no encontrarlo es correcto; concluir que el juego no
lo tiene, no. El hueco puede estar en el sitio donde buscas.

**Ningún asset sin licencia al lado.**

## 3. Cómo se comprueba que algo funciona

Dos capas, y hacen falta las dos:

```bash
npm test                  # ~1 000 comprobaciones de Node, sin navegador
npm run sonda:arranque36  # una sonda: Chromium de verdad, mide lo que hay en pantalla
```

Las pruebas de Node cubren la **regla** (todo lo de `src/play/`, que no toca el
DOM ni Three a propósito). Las sondas de `sondas/` abren un Chromium, pulsan con
el ratón y miden el **efecto**. Lo que se ve sólo lo prueba una sonda.

### Las reglas de medir, y por qué son éstas

- **Lo roto se porta con el fallo y una prueba.** Reproducir el bug del original
  es parte del port; un arreglo sin prueba no es un arreglo.
- **Si su camino no pasa por `menuselect`, no cuenta.** La sonda tiene que
  recorrer lo que recorre el jugador. Una sonda que entra por un atajo mide otro
  juego. *Esto se rompió entero una vez sin que nada se pusiera rojo: las 22
  sondas entraban por `?map=gatecity`, que desde el experimento 36 ya no es por
  donde entra el jugador.*
- **Se mide el efecto, no el valor de la ventana.** Que el deslizador diga 10 no
  es que la sensibilidad sea 10.
- **Un cero sin control positivo no es un resultado.** Si mides «no pasó nada»,
  necesitas al lado algo que demuestre que habrías visto que pasara.
- **Un verde que sigue verde con el fallo puesto tampoco es un resultado.** Ver
  el apartado siguiente: es el que más caro ha salido.
- **Al tocar algo, vuelve a pasar las sondas vecinas.** Cuestan minutos y han
  cazado varios.

## 4. EL FALLO QUE MÁS VECES SE HA REPETIDO: el verde que no mide nada

Cinco veces, y cada vez se diagnosticó desde cero. Está aquí para que la sexta se
reconozca en un minuto.

**La forma:** el mecanismo bajo prueba nunca llega a dispararse, el control lee
el **valor de reposo**, y el valor de reposo pasa la prueba. Un rojo se ve; un
verde vacío no.

| caso | el control decía | de verdad medía |
| --- | --- | --- |
| el laboratorio, antes del port | «95,7 % de cobertura» en un pasillo | **una pantalla negra**: la cobertura contaba píxeles que no eran del color de la niebla, y la roca sin farol tampoco lo era. La luminancia daba 0,0 % |
| experimento 35 | 31 controles verdes sobre los paneles de VGUI | un panel que no recibía un solo clic: el puntero seguía atrapado en el `canvas` |
| experimento 37 | «una caída mortal dentro del agua no hace daño» (15 → 15) | que *nada* hace daño por esa vía: la sonda soltaba al jugador a medio metro del suelo y la transición aire→suelo no ocurría |
| experimento 38 | «los personajes son modelos» (`canvas.width > 0`) | que **un `<canvas>` recién creado mide 300x150 por definición**: verde con los tres retratos sin montar |
| «Create Server» | 3 de 13 ajustes vivos | 1. `porQueNo` vacío significaba «hace algo» y no lo comprobaba nadie |

Que el más viejo sea de antes del port importa: **no es un descuido reciente, es
la forma en que este proyecto se equivoca.**

**La defensa, que es barata y no exige adivinar dónde está la mina:** *rompe el
arreglo a propósito y vuelve a pasar la sonda.* Si el control sigue verde con el
fallo puesto, el control no sirve. Hazlo antes de dar algo por hecho.

Los demás tropiezos que han costado una sesión —Rapier, `readPixels`, las teclas
de Playwright, la escala de GoldSrc— están en [doc/AVISOS.md](doc/AVISOS.md).

Y su primo: **un dato que parece raro no es por eso la causa.** El rojo de la
escalera se achacó durante dos experimentos a un `atan2` con cuatro signos de
más; el `atan2` era correcto y lo que fallaba era la posición.

## 5. Antes de cambiar código

- **No se commitea salvo que el usuario lo pida.** Tampoco se hace push, ni se
  borra un documento o una sonda: eso es decisión suya.
- **El árbol puede estar compartido con otra sesión.** `git stash` es
  compartido, así que no aísla nada; si necesitas un árbol limpio, usa
  `git worktree`. Y antes de editar un archivo grande y de todos —`src/main.js`,
  `src/dev/sonda.js`— mira si alguien lo tiene a medias.
- **Un ajuste no puede quedarse callado.** En las tablas de ajustes
  (`src/play/ajustes.js`, `src/play/crearpartida.js`) cada fila dice o
  `porQueNo` —por qué no hace nada— o `aplica` —dónde se aplica—. Hay pruebas
  que lo exigen. Es la vacuna contra el apartado 4.
- **Las cuentas se calculan, no se escriben.** «Nueve de treinta funcionan» sale
  de `cuenta()`, para que no envejezca sola.

## 6. Dónde está cada cosa

| documento | qué te da |
| --- | --- |
| [README.md](README.md) | qué funciona hoy, con números, y cómo arrancarlo |
| [CREDITOS.md](CREDITOS.md) | de quién es cada cosa, con las URL de los repos |
| [ESTRUCTURA.md](ESTRUCTURA.md) | qué es cada carpeta y a cuál de MSR corresponde |
| [PROYECTO_10.md](PROYECTO_10.md) | qué se está construyendo y en qué orden |
| [NEXT_SESSION.md](NEXT_SESSION.md) | dónde se quedó el trabajo |
| [doc/AVISOS.md](doc/AVISOS.md) | lo que ha mordido de verdad, con el caso que lo enseñó |
| [doc/HISTORIA_05_09.md](doc/HISTORIA_05_09.md) | el archivo: los informes de antes de que esto fuera un port |
| `doc/` | lo demás, un documento por experimento: qué se midió y qué se entendió mal |

Si sólo lees uno de `doc/`, lee [doc/IA_28.md](doc/IA_28.md): mover 69 monstruos
a un servidor, y por qué dos jugadores veían dos pueblos distintos.

## 7. Cómo se escribe aquí

Los documentos de `doc/` son el cuaderno, no un folleto: **llevan lo que se
entendió mal tanto como lo que se consiguió**, porque el error es la parte que
no se puede volver a deducir del código. Cuando una sesión posterior descubre
que un documento decía algo falso, **no se reescribe: se añade la corrección al
lado**, fechada por experimento. Una cita rota es mejor que una cita reescrita a
algo que no es lo que se midió.
