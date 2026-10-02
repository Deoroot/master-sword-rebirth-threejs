# Extractores por mapa

Primera refactorización después de Edana y los disparadores: la extracción de
NPC, aparición, menús, guiones y presentación usa el mismo `--mapa` que el BSP.
Sin opción se conserva el mapa por defecto; los comandos `gatecity:*` siguen
funcionando. Las raíces de scripts posicionales de `menus` y `guiones` también
se conservan. `mapainfo edana` sigue siendo válido.

```powershell
npm run mapa -- --mapa edana
npm run mapa:bichos -- --mapa edana
npm run mapa:aparicion -- --mapa edana
npm run menus -- --mapa edana
npm run guiones -- --mapa edana
npm run mapainfo -- --mapa edana
```

Ejecutar cada paso sólo si sus dependencias se extrajeron correctamente:
`aparicion` necesita `malla.json` y `bichos.json`; `guiones` usa el censo de
`bichos.json` y, cuando falta, conserva su comportamiento de analizar todos los
scripts con menú. Eso último no demuestra que estén presentes en el mapa.

## Las rutas secundarias también cuentan

`extraerBicho` recibe tanto el directorio de modelos (`salida`) como la raíz
del manifiesto (`raizSalida`). El extractor de NPC y el del BSP pasan ambos.
Antes, los modelos podían escribirse en Gate City aunque el censo se escribiera
en otro mapa; además, `carpeta` se calculaba respecto a Gate City y podía contener
`../edana`. Ahora cada manifiesto refiere sus propios modelos.

Los controles de cantidad de menús de Gate City se mantienen como regresiones
de ese mapa, sin exigir esas cantidades a otros mapas. Hay una prueba que
ejecuta la herramienta con dos mapas sintéticos y comprueba sus claves, títulos
y archivos, conservando un archivo testigo de Gate City.

## Límite encontrado al ejecutar Edana

La extracción de NPC se detiene con una plantilla que apunta al área `patron9`,
que no existe. Es una validación anterior al refactor; no se ha relajado.
Puede dejar modelos extraídos, pero no termina `bichos.json`, por lo que todavía
no puede ejecutarse la extracción de aparición de Edana de principio a fin.
Menús, guiones (con el respaldo mencionado) y presentación sí se extraen.

La aparición sigue usando los cuatro scripts de sacerdote ya reconocidos por
el proyecto. Parametrizar sus rutas no convierte esa heurística en una regla
válida para todos los mapas de MSR.

## Siguiente separación

HUD, menú principal, VGUI, cuerpos, armas, escudos, iconos, sonido y efectos
siguen en la carpeta histórica de Gate City. Moverlos a `build/msr` necesita
cambiar extractores, consumidores y sondas juntos. Este cambio tampoco añade
Edana a la lista de mapas completos ni generaliza las sondas específicas de
Gate City.

## Continuación: recursos comunes separados

La separación descrita arriba ya está implementada. `npm run recursos` ejecuta
el catálogo de objetos y los nueve extractores de HUD, menú principal, VGUI1,
VGUI2, armas, escudos, cuerpos, iconos y efectos. Todos escriben en `build/msr`;
sus consumidores usan `src/play/recursos.js`, sin depender del mapa activo.
El horneado común se puede ejecutar antes de preparar cualquier mapa.

El sonido resultó ser mixto: sus archivos se comparten en `build/msr/snd`, pero
`sonido.json` depende de los materiales, música, ambientes y NPC del mapa.
`npm run sonido -- --mapa edana` mantiene ese catálogo en `build/edana`.
La clase `Audio` recibe por separado la base del catálogo y la de las muestras.
La procedencia del sonido se conserva por mapa dentro de la carpeta común.
Si se cambia la instalación de Half-Life utilizada, deben regenerarse los
catálogos de sonido de todos los mapas para corresponder a las muestras comunes.

Las copias antiguas en Gate City no se borran automáticamente. Para migrar una
instalación existente basta con ejecutar `npm run recursos` y después `npm run
sonido -- --mapa <nombre>` para cada mapa preparado. No hay respaldo silencioso
contra las rutas antiguas.

`sonda:recursos` abre Gate City y Edana, bloquea las URL comunes antiguas y exige
que lleguen los manifiestos compartidos y la malla del jugador. Incluye el
control positivo de la barrera y usa su propio servidor en un puerto libre.
La prueba de Node del audio exige catálogos distintos, la misma ruta de muestra
y una decodificación real del stub por mapa; también comprueba la caché.

---

## Verificación posterior, y dos cosas que salieron

Se comprobaron las afirmaciones de arriba, y **se sostienen**: las 1 324
comprobaciones pasan, la sonda de recursos está bien construida —tiene control
positivo de su barrera y exige la malla del jugador, no sólo el manifiesto— y
extraer Edana entera deja `build/gatecity` **byte a byte idéntico**, medido con
una huella del árbol antes y después.

Dos matices al «no altera los de Gate City»: la afirmación vale para
`build/gatecity`, y **`build/msr` sí crece**. Extraer los NPC de un mapa nuevo
añade carpetas de modelo bajo `build/msr/armas/`, que es correcto —son datos
del juego, con la clave del modelo— y además es idempotente: la segunda pasada
no escribe ni un byte. Los manifiestos compartidos (`armas.json`, `cuerpos.json`,
`iconos.json`) sólo los escribe su propio extractor, no el del mapa.

### 1. El arreglo principal no tenía prueba

El documento destaca, con razón, que antes los modelos de NPC podían escribirse
en Gate City aunque el censo fuera a otro mapa. **Devolviendo eso a mano:**

```js
salida: `build/gatecity/bichos`, raizSalida: `build/gatecity`,
```

**las 1 324 comprobaciones seguían en verde.** La prueba de los menús vigila su
herramienta con un archivo testigo, que está muy bien, pero sólo vigila
`menus.mjs`; la que motivó el cambio se quedó sin nadie mirándola. Y el síntoma
del fallo no es un error: es que Edana enseña los modelos de Gate City.

Para `bichos.mjs` no se puede hacer la prueba del testigo —necesita el `.bsp` y
los scripts, que no están en el repositorio—, así que se vigila lo que sí se
puede leer sin ejecutar nada: `test/extractores_salida.test.mjs` exige que la
ruta de salida **se derive** y no se escriba, en las ocho herramientas por mapa,
y que las seis llamadas a `extraerBicho` reciban una salida derivada. Es la
forma de los dos guardias del 47 sobre `src/`, con su control positivo al lado.
Rompiéndola a propósito de tres maneras da 2, 2 y 1 rojos.

Las cuatro de diagnóstico —`gatecity_shot`, `juez_luz`, `mirar`, `quecara`—
siguen con el mapa a mano a propósito, y ahora están **declaradas en una lista
que la prueba comprueba**: si alguien las parametriza, la prueba lo dice en vez
de dejar la lista mintiendo.

### 2. `patron9` desbloqueado, y era la lección del 48 otra vez

La extracción de NPC de Edana paraba con «1 plantilla apunta a un área que no
está: patron9». La guarda tenía este motivo escrito al lado, y era bueno:

> El motor lo avisa por consola y sigue: la plantilla se queda sin área y no
> aparece nunca. **Aquí se para**, porque un bicho que no existe no se ve por
> ningún lado.

El motivo vale; la regla no, y es **exactamente la forma del experimento 48**:
una guarda correcta con una regla medida sobre un solo mapa. En Gate City no
pasa nunca; Edana tiene una.

Y lo que hace el motor está escrito, `msmonsterserver.cpp:106-130`:

```c
while ((peSpawnArea = FIND_ENTITY_BY_TARGETNAME(peSpawnArea, m_iszMonsterSpawnArea)) ...)
if (SpawnsFound) { ... }
else ALERT(at_console, "ERROR: msarea_monsterspawn named %s NOT FOUND
", ...);
if (!m_fSpawnOnTrigger) SUB_Remove();
```

Avisa, no aparece a nadie y **borra la plantilla**. El mapa se juega con ese
bicho ausente, así que portarlo es dejarlo ausente, no pararse.

**El control que se queda no es un umbral**, que es lo que el 48 enseñó a no
hacer: si **ninguna** plantilla encuentra su área, eso no es una errata del
mapa, es que estamos leyendo mal los nombres, y sigue parando el horneado.

Con eso, `npm run mapa:bichos -- --mapa edana` llega al final: 42 colocados, 15
áreas, 19 plantillas, y la huérfana contada y nombrada. `build/gatecity/bichos.json`
queda idéntico. Cinco comprobaciones nuevas en
`test/bichos_sin_area.test.mjs`, con el control de que el detector detecta y
con las dos áreas homónimas `templerats` intactas —el motor las recorre las dos
y sortea (`RANDOM_LONG`), así que quedarse con la primera movería las ratas—.

### La aparición: cinco rojos, y el mapa tenía razón

`npm run mapa:aparicion -- --mapa edana` corría hasta el final pero **salía con
código 1 y cinco controles en rojo**: no ganaba al punto del mapa en luz ni en
hostiles, no caía dentro de una zona de pueblo y no encontraba un rayo de luz
utilizable.

Al mirarlos uno a uno, los cinco dicen lo mismo y no es lo que parecía. La
herramienta daba por hecho que el `ms_player_begin` del mapa es malo, porque el
de Gate City lo es: deja al jugador en una cueva con **tres goblins a menos de
15 m** y fuera de toda zona de pueblo. De ahí salieron tres controles que
exigen ganarle.

**El de Edana está bien.** Cero hostiles —el jabalí más cercano a 127,9 m— y
luz 193 sobre 255. Y eso último hubo que comprobarlo antes de creérselo, porque
193 aparecía en siete filas seguidas de la tabla y un número que se repite
suele ser una lectura atascada: de las 42 posiciones de NPC de Edana hay **23
valores de luz distintos** y trece dan exactamente 193, o sea que es el valor
de estar a cielo abierto. El templo de Edana da 172. **Exigirle al elegido que
gane en luz es pedirle a un templo que sea más claro que el mediodía.**

Otra vez la forma del 48. Y lo que dice el mod es el punto del mapa
(`SPAWN_BEGIN`, `player/player.cpp:2455` y `:2558`); apartarse de él necesita
un motivo, y el motivo de Gate City son sus goblins. Así que se invirtió el
orden: **primero se mide el `ms_player_begin` contra las reglas duras, y sólo
si falla alguna se busca otro sitio.**

Las reglas duras **no traen ni un número nuevo** —hostiles, poder estar de pie,
no aparecer dentro de otro NPC, y la zona de pueblo *sólo donde hay zonas*—. Y
deliberadamente **no hay umbral de luz**: Gate City ya falla por los goblins y
por la zona, así que un mínimo de luz sería un número que hoy no decide nada y
que el día que decidiera, decidiría a ojo.

Resultado: Gate City elige **el mismo sitio de siempre**, `[80, 2790, -576]`
con el mismo yaw, y Edana respeta su punto de inicio. 18/18 controles
aplicables en verde en Gate City, 11/11 en Edana, y ninguno de los dos sale con
código 1.

#### Dos cosas más que salieron por el camino

**El filtro de rayos tenía el mismo bug.** Pedía `enPueblo` a secas, así que en
un mapa sin un solo `msarea_town` descartaba **los quince rayos de Edana antes
de mirar ninguno** — y la tabla imprimía «ninguno utilizable», que parece un
mapa sin tragaluces. Un `continue` mudo no se distingue de una decisión, así
que ahora cada rayo que se cae deja su motivo apuntado y hay un control de
conservación: `6 en el templo + 14 fuera + 11 descartados = 31 de 31`. El
segundo control es el que habría cazado el bug: **ningún rayo puede caerse por
una regla que este mapa no puede cumplir**.

**El ancla ya no está escrita.** Los cuatro scripts con `#include
help/first_npc` eran una lista de cuatro nombres a mano. La lista era correcta
—salió de un `grep`— pero una lista escrita no se entera de un mapa nuevo, que
es contra lo que argumenta la primera línea de ese mismo archivo a cuenta de
las coordenadas del templo. Ahora se hace el `grep` al hornear, con control
positivo: `help/first_vendor` tiene que dar un conjunto **distinto** (2 scripts,
0 en común).

**Y los controles que no aplican dicen `n/a` con el motivo**, como las tablas
de ajustes de `CLAUDE.md`. Ocho de los diecinueve no aplican a Edana. Sumarlos
a los verdes habría sido el apartado 4 otra vez: «el rayo mejora el rincón del
sacerdote» estaba escrito `elegido.familia !== "rayo" || …`, o sea verde
garantizado en cualquier mapa sin rayos. Y «desde donde aparece se ve al
sacerdote» salía **verde con el texto «ninguno a la vista»** al lado, porque el
detalle leía un campo que sólo llevan las filas de rayo.

#### Las roturas

| lo que se rompió | rojos |
| --- | --- |
| el filtro de rayos vuelve a `!m.enPueblo` | 1 |
| la regla de la zona se aplica siempre | 3 |
| el `grep` de las anclas acepta cualquier script | 1 |

Seis comprobaciones nuevas en `test/aparicion_por_mapa.test.mjs`, que leen la
salida de verdad: que Gate City cambia el punto **con el motivo apuntado**, que
Edana lo respeta, que ningún control aplicable está en rojo, que los `n/a`
dicen por qué, el control positivo de que el detector de rojos detecta, y que
los cuatro nombres de sacerdote no vuelvan al código.

Ese último pilló algo de verdad nada más escribirse: el `build/edana` que había
en disco era el que dejó la última rotura, y el test lo dijo. Una comprobación
que lee la salida se entera de eso; una que lee el código, no.

### Lo que sigue pendiente, sin cambios

Partir `src/main.js` sigue sin hacerse.

Las copias antiguas siguen en `build/gatecity` —221 MB contra los 39 de
`build/msr`— y el servidor de la sonda las niega, así que no pueden esconder
una ruta olvidada. Borrarlas es decisión del usuario.
