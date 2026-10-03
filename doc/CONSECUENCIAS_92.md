# Los cuatro rojos de `sondas/consecuencias.mjs` (experimento 92, pieza C)

`sonda:consecuencias` daba **42 de 46** con cuatro MAL:

1. «las cuatro son FICHA de una bolsa de huevos» — 0 de 4
2. «dos están libres encima de su saco y avanzan»
3. «y dos están DENTRO del saco…»
4. «al morir, el goblin avisa a los aliados…» — 0 avisados

Ya se sabía que no los causaba la costura del 91: desenchufándola salían los
mismos cuatro.

## Desde cuándo

Se montó un `git worktree` en `9eacc9b` (el commit anterior a los experimentos
88-91), fuera del repo y al lado de `MSC/` para que `../MSC/` resolviera igual,
con `build/gatecity` y `build/msr` copiados y **rehorneados allí** el censo de
bichos, la aparición y los guiones (`mapa:bichos`, `mapa:aparicion`,
`guiones`). La sonda dio **los mismos cuatro rojos, 42 de 46**. O sea que son
anteriores al 88.

Más atrás no lo deja separar git: `a0049b3` lleva del 39 al 85 en un solo
commit. Lo que sí se puede fechar leyendo el código y el cuaderno:

| rojo | lo rompió | cuándo |
| --- | --- | --- |
| 1-3 | el filtro de la sonda dejó de encontrar a nadie | el **67** |
| 4 | la tabla de razas nace vacía entrando por el menú | en el juego, el **53**; en la sonda, el **57** |

## Los tres primeros: la sonda buscaba ratas y no hay ratas

**La culpa era de la sonda, no del juego.** La sección filtraba
`c.script === "monsters/giantrat"`. Desde el 67, `scriptfile` gana a
`defscriptfile` (msmonsterserver.cpp:415-416) y las cuatro
`msmonster_giantrat` de Gate City llevan `scriptfile monsters/spider_mini`
(está en el `.bsp`, y `test/bichos_guion67.test.mjs` lo comprueba). El filtro
devolvía **cero**, y con cero:

- «las cuatro son FICHA…» → 0 de 4, rojo;
- «dos libres» y «dos dentro» → rojos, con el detalle vacío;
- **«las ratas también entran en huida» salía VERDE**: `[].every(...)` es `true`;
- **«ninguna sigue veinte unidades enterrada» salía VERDE** con el peor suelo a
  `-Infinity`;
- y la línea de arriba imprimía «rata gigante: undefined de vida» sin que
  nadie la leyera.

Dos verdes vacíos al lado de tres rojos, y los cinco por la misma causa.

### Lo que se entendió mal al arreglarlo: cambiar el nombre no bastaba

La medida antigua hacía **HUIR** a las ratas (vida a 1 y dado a favor) para ver
si se movían. Una cría de araña no huye: `setvard CAN_FLEE 0`
(spider_mini.script:34), contra el `CAN_FLEE 1` / `FLEE_HEALTH 2` de la rata
(giantrat.script:27-28). Con el nombre cambiado y nada más, el control de la
huida se habría puesto rojo y los dos del saco habrían medido «no se mueve» de
las cuatro.

Lo que sí tienen es `HUNT_AGRO 1` (spider_mini.script:31): cazan al jugador que
tengan cerca. La sección nueva pone al jugador a 2 m de cada una y la deja cazar
dos segundos, apuntando el `frenado` cada 0,2 s.

Medido (a mano y luego con la sonda):

| cría | nace en z | lo que pasa |
| --- | --- | --- |
| `spawn_babies1` | −771 (encima de su saco) | baja del saco andando: −771 → −781 → −789 → −791, `avanza` |
| `spawn_babies2` | −771 (encima de su saco) | anda 2,2 m hasta una pared |
| `spawn_babies3` | −789 (dentro del saco) | `escalon de 18 u`, 0,00 m, siempre |
| `spawn_babies4` | −789 (dentro del saco) | `escalon de 18 u`, 0,00 m, siempre |

Lo que el comentario del 39 decía de las «ratas» vale para las crías: dos
libres, dos encerradas en su huevo.

Dos cosas que tuve que corregir del primer intento:

- **«Libre» no puede ser «acabar en `avanza`».** Una cría libre llega al
  jugador o a una pared antes de los dos segundos, y su último frenado es otro
  (`pared delante`). Ahora es haber andado más de medio metro desde donde
  **nació** y haber tenido algún `avanza` por el camino.
- **El paso se cuenta desde donde nació, apuntado antes de acercarse a
  ninguna.** Al ponerme al lado de la primera, la segunda —a 90 u— también
  caza; medirla desde donde estuviera al llegarle el turno mediría el orden de
  la sonda, y la primera pasada lo enseñó: la misma cría salía libre o
  encerrada según a quién había ido antes.

### Los controles nuevos, y una rotura que se quedó verde

- «las crías NO huyen ni con el dado a favor» — **rompiendo a propósito la
  guarda de `CAN_FLEE`** en `huyeDelGolpe` (reaccion.js) **siguió verde**. No
  es un control flojo: la cría tampoco tiene `FLEE_HEALTH` —0 por omisión,
  «won't flee from dmg» (base_npc_attack_new.script:16)— y con eso no huye
  nadie. Son dos razones que se tapan. El control se llama ahora «sin
  `FLEE_HEALTH` y `CAN_FLEE 0`» y lleva el aviso escrito encima: dice que la
  cría no huye, no cuál de las dos razones lo decide.
- «y las cuatro te cazan al tenerte a dos metros» — la condición de la que
  depende todo lo de abajo; sin ella «no se mueve» no distingue encerrada de
  dormida.
- «ninguna sigue veinte unidades enterrada» pide ahora además `length === 4`.

**Rotura deliberada del filtro** (volver a `monsters/giantrat`, comprobado con
`grep -n "ROTURA 92"`): **seis rojos**, incluidos los dos que antes eran verdes
vacíos.

## El cuarto: el juego no avisaba a nadie, y éste SÍ es del juego

Midiendo los pares de goblins de Gate City, los ocho tienen otro goblin a
101-191 u, dentro de las 294 u de su grito, y para todos
`probe.reaccion.aliados(a, b)` daba `relacion 2` (`SIN_RAZA`) y
`aliados: false`. Y `probe.reaccion.estado.razas` daba **0**, con
`build/gatecity/bichos.json` trayendo sus **26** razas.

La causa está en `src/main.js`:

```js
let censoDeBichos = null;            // ~2034
async function montarLosBichos() {   // lo rellena
  ...censoDeBichos = censo;...
}
if (!entrarPorElMenu) await montarLosBichos();   // ~2070
...
const tablaDeRazas = new Map(censoDeBichos?.razas ?? []);   // ~3994
```

La tabla se construye **una vez**, leyendo `censoDeBichos` en ese instante.
Entrando con `?map=` los bichos ya están montados y sale llena; **entrando por
el menú** —desde el 53 los bichos se montan desde «Start»
(doc/ARRANQUE_53.md)— `censoDeBichos` es `null` en ese momento y la tabla nace
vacía **para siempre**. `sonAliados` dice «no» a todo y `bichos.avisar` (main.js
~4872, el camino de verdad, no sólo la sonda) no avisa a nadie. Es decir: **en
una partida de un jugador empezada desde el menú, un goblin no ha avisado nunca
a sus aliados al morir desde el 53.** El servidor (`src/red/fauna.js:98`)
construye su propia tabla desde el censo y no lo sufre.

La sonda estuvo verde hasta que pasó a entrar por el menú (el 57), que es
exactamente lo que el apartado 4 de CLAUDE.md dice de las sondas que entraban
por `?map=gatecity`.

**Control positivo**: con `?map=gatecity` la misma lectura da 26 razas y
`goblin`/`goblin` `relacion 1`, `aliados: true`.

### El arreglo (propuesto, no aplicado en el árbol compartido)

`src/main.js` no está entre los archivos de esta pieza, así que se probó en el
worktree y aquí queda el parche exacto: la tabla se declara vacía junto a
`censoDeBichos` y la llena `montarLosBichos`; `sonAliados` la lee por
referencia, así que no hace falta tocarlo.

```diff
   let censoDeBichos = null;
+  const tablaDeRazas = new Map();
   ...
       censoDeBichos = censo;
+      for (const [clave, r] of censo?.razas ?? []) tablaDeRazas.set(clave, r);
   ...
-  const tablaDeRazas = new Map(censoDeBichos?.razas ?? []);
```

(Declararla arriba es obligatorio, no estético: `montarLosBichos` se llama en
la línea ~2070, antes de la ~3994, y con un `const` abajo sería un
`ReferenceError` de zona muerta por la ruta de `?map=`.)

La sonda lleva un control nuevo delante del aviso, «el juego tiene la tabla de
razas del censo, entrando por el menú», para que este rojo diga su causa y no
sólo su síntoma.

## Resultados

En el worktree en `06d29fd` con el parche de `main.js` y la sonda nueva:
**48 de 48**, dos pasadas. Rotura del parche (la línea que llena la tabla
comentada, `grep` comprobado): rojos «tabla de razas» (0 razas) y «avisa a los
aliados» (0 avisados), 46 de 48. Sin el parche de `main.js`, la sonda nueva en
el árbol compartido dará esos mismos dos rojos hasta que se aplique.

## Una cita que apunta a un contador que esta sonda no mueve

`test/gauntlet83.test.mjs:358` dice que «que el aviso siga ocurriendo lo mide
`sondas/consecuencias.mjs:400` leyendo `estado.avisos`». Dos cosas: la línea se
ha movido con este arreglo (hoy es la ~453), y sobre todo **esa línea sólo
imprime** `estado.avisos`, no hay control encima, y el contador sale **0 incluso
con el aviso funcionando**: `probe.reaccion.matarYAvisar` llama a
`bichos.matar` directamente y no pasa por el sitio de `main.js` que suma
`S.avisos`. Lo que mide el aviso en esta sonda es «al morir, el goblin avisa a
los aliados que tiene a tiro de grito», que lee la lista de avisados. No se ha
tocado la prueba (no es de esta pieza); queda dicho aquí.
