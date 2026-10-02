# 50 — Edana por la puerta, y el mapa elegido que no se elegía

> `src/play/mapa.js` · `src/main.js` · `src/vgui2/widgets.js`
> · `src/vgui2/montar.js` · `sondas/edana50.mjs` · `test/vgui2.test.mjs`

El 48 abrió Edana y la dejó **fuera del menú a propósito**, con su motivo
escrito al lado: ofrecerla en «Create Server» sería prometer un pueblo sin NPC,
porque las herramientas que extraen bichos, guiones y menús escribían todas en
`build/gatecity`.

Ese motivo caducó y no por una opinión. Hoy `build/edana` trae **42
colocaciones de NPC, las 42 con su guion**, 139 guiones y sus menús, y lo que
no es de un mapa vive en `build/msr`, que es de los dos. Así que Edana entra en
`MAPAS_PORTADOS`.

Eso es una línea. Lo que este experimento cuenta es lo que pasó al recorrer el
camino del jugador detrás de esa línea.

## La línea, y por qué una línea no es un resultado

`src/play/mapa.js` decía, desde el 47, que añadir Edana sería «una línea en un
archivo y no tres en tres». Era verdad: no hubo que tocar `mapaElegido()`, ni
la fila «Map», ni el desplegable.

Y también decía, en el mismo párrafo, que **esta lista es una promesa, no una
medida** — el navegador no lista carpetas y `build/` no se publica, así que un
nombre ahí sin su horneado da una pantalla de error. Ese párrafo es el que
importa, y sigue entero.

La medida es `npm run sonda:edana50`: menú principal, «Establish a Kingdom», la
fila «Map», «Start». Sin `?map=`. Si su camino no pasa por `menuselect`, no
cuenta.

## LO QUE ENCONTRÓ: la fila se apuntaba y no se aplicaba

Primera pasada de la sonda, **14 de 20**. Y lo que decían los rojos:

```
ok   EL DISCRIMINANTE: eligiendo EL OTRO mapa, entra el otro
       mapa aplicado: "edana"
FALLA el manifiesto cargado dice que es «edana»
       gatecity
FALLA el juego montó los 42 NPC de Edana, no cero
       69 montados de 42 horneados, 33 hostiles
```

La ventana decía «edana». El mundo era Gate City, con sus 69 monstruos.

**Es el apartado 4 de CLAUDE.md por sexta vez**, y esta vez con agravante: el
comentario que había justo encima del código lo prometía.

```js
// Con un solo mapa las dos entradas caen en `gatecity`, así que esto no
// cambia a dónde se va: cambia que la elección se LEE. El día que entre un
// segundo mapa ya está hecho.
```

No estaba hecho. `alEmpezar` hacía `mapaDeLaPartida = mapa` y nada más:
apuntaba la elección en una variable que sólo lee la sonda. Con **un** mapa
portado, «la fila se aplicó» y «el mundo es Gate City» eran la misma frase, así
que el control del 36 estaba verde comparando una cadena consigo misma. El
valor correcto y el valor de reposo coincidían, que es la forma exacta de la
tabla del apartado 4.

Lo que hacía falta para verlo no era mirar mejor: era **un segundo mapa**.

### Por qué no era una asignación, y qué dice el motor

`MAPA` es una `const` que se resuelve al cargar la página, y para cuando ese
menú se ve ya se han pedido la malla, los bichos, los guiones y las texturas de
`build/<MAPA>`. Cambiar de mapa ahí no es mover una variable.

Y no hay que inventarse qué hacer, porque el motor lo hace:

```cpp
// rehlds/engine/host_cmd.cpp:970, :1021
CL_Disconnect();
...
if (!PF_IsMapValid_I(name)) {
    Con_Printf("map change failed: '%s' not found on server.\n", name);
    return;
}
...
Host_Map(FALSE, mapstring, name, FALSE);
```

`map <levelname>` **tira la partida y carga el nivel entero**. En el navegador
eso es una navegación, y `?map=` ya era la línea de órdenes desde el 47. Así
que «Start» con otro mapa recarga a `?map=<mapa>&menu=1`.

### Las dos decisiones que van con eso, dichas y no disimuladas

**Sólo recarga si el mapa es OTRO.** El motor recarga siempre. Aquí recargar
cuesta el gesto del usuario, y con él la pantalla completa: el navegador sólo
concede Keyboard Lock dentro del clic que lo pidió, y una navegación se lo
lleva por delante. Entrar al mapa que ya está cargado no recarga y sí la
consigue. **La fila lo declara** (`crearpartida.js`, el `aplica` de
`pantallaCompleta`), porque un ajuste no puede quedarse callado, y al cambiar
de mapa se avisa por consola en vez de prometer una pantalla completa que no va
a haber.

**El `&menu=1` no es adorno.** El control positivo del 36 —«sin pasar por la
ventana no hay mapa resuelto»— es lo único que separa «lo resolvió la fila» de
«coincide». Si la recarga perdiera esa marca, `mapaDeLaPartida` volvería
siempre `null` justo en el caso que hay que medir, y el control se habría
quedado verde por el motivo equivocado.

## Y `< Random Map >` dejó de ser decorativo el mismo día

Con un mapa portado, el sorteo tenía una bola. Con dos sortea de verdad: entrar
sin tocar la fila lleva a Gate City o a Edana a cara o cruz. **Eso es lo que
hace el original** y se queda.

Lo que no puede quedarse es una prueba que le exija un nombre concreto a un
sorteo. Había dos, y las dos se pusieron rojas:

```
not ok 405 - la lista de mapas dice la verdad: sólo hay uno portado
not ok 406 - «< Random Map >» elige entre los que existen, no devuelve el rótulo
    + 'edana'   - 'gatecity'
```

La 405 era una cuenta escrita (`["< Random Map >", "gatecity"]`, `length === 1`)
y ahora se calcula desde `MAPAS_PORTADOS`. La 406 era peor: **habría fallado la
mitad de las veces sin que nada estuviera roto.** De un sorteo se puede afirmar
de dónde salen las bolas, no cuál sale; ahora comprueba eso 800 veces, y lleva
al lado el control positivo que faltaba —con dos portados, **el sorteo tiene
que sacar los dos en 500 tiradas**—, porque «sale uno de los portados» estaría
verde con un `return reales[0]` que no sortea nada. Con un solo mapa ese
control no se puede hacer, y se dice en vez de fingir que se hizo.

## El fallo que salió de tener que elegir DESPUÉS de mirar

El control nuevo de `arranque36` —elegir «gatecity» con el ratón antes de
«Start», para que el de abajo no fuera un sorteo— salió rojo con la fila
todavía en `< Random Map >`. No era el control:

```js
// vgui2/montar.js, la Escape
const lista = this.capa.querySelector(".v2-lista-abierta");
if (lista) { lista.remove(); return; }
```

La Escape arrancaba el `<div>` de la lista del DOM y **no se lo decía al
widget**, que se quedaba con su `abierta` puesta y su oyente de «clic fuera»
colgando. El siguiente clic en el desplegable entraba por `alternar()`, veía
`abierta` y llamaba a `cerrar()`: **el clic se perdía**. El jugador que abre la
lista de mapas, se lo piensa, pulsa Escape y vuelve a pulsar en la fila, se
encuentra una fila muerta y tiene que pulsar dos veces.

Llevaba ahí desde el 36 sin que nadie lo viera, porque la sonda pulsaba Escape
y no volvía a abrir la lista nunca. Ahora la cierra el widget
(`lista.cerrarDesplegable`), y quien lo caza es el control que lo encontró.

## Las roturas

| lo que rompí | rojas | dónde |
| --- | --- | --- |
| «Start» vuelve a sólo apuntar el mapa, sin recargar | 7 | `sonda:edana50` |
| `mapaDeLaPartida` se pone siempre, venga o no del menú | 1 | `sonda:arranque36`, el control positivo |
| la Escape vuelve a hacer `lista.remove()` | 2 | `sonda:arranque36` |
| `mapaElegido` devuelve `reales[0]` en vez de sortear | 1 | `npm test` |

La primera rotura enseñó además algo de la sonda: la primera versión se caía
en la espera de la navegación y daba **un** rojo sin ninguna pista. Ahora la
espera no tumba la sonda, y los siete rojos dicen *qué mundo hay entonces* —
41 494 triángulos, 101 monsterclip, 69 NPC—. Una sonda que se cae en la primera
línea no está midiendo, está avisando.

## Lo medido

`npm run sonda:edana50`, **21 de 21**, entrando por el menú:

| | |
| --- | --- |
| recarga | `?map=edana&menu=1` |
| mundo | 33 087 triángulos, 7 monsterclip, 0 `msarea_town` |
| negativo | no son los 41 494 / 101 de Gate City, **leídos de su `malla.json`** |
| NPC montados | **42 de 42**, 6 hostiles, 36 no hostiles |
| aparición | **a 0,00 m** del punto de `build/edana/aparicion.json` |
| andar | 5,12 m en 1,2 s, en suelo, sin caerse del mundo |
| errores de página | ninguno |

Los números del control negativo se **leen** de `build/gatecity/malla.json`. La
sonda del 48 llevaba «33 941 tri» escrito en el texto de ese control y Gate
City tiene 41 494: un número de adorno en el mensaje es un número que nadie
vuelve a mirar.

`npm test` **1340 de 1340**. Sondas vecinas: `arranque36` 23/23 (dos controles
nuevos), `vgui2_34` 26/26, `mundo` 40/40, `misiones33` 23/23, `edana48` 15/15.

## Lo que este experimento NO hace

- **No se ha jugado Edana.** Se entra, se anda, están los 42. Que sus guiones
  hagan lo que dicen, que sus menús se puedan pulsar y que sus misiones
  avancen no lo mide nadie todavía.
- **La pantalla completa se pierde al cambiar de mapa**, y eso es una
  limitación del navegador, no una que se pueda arreglar aquí. Está declarada
  en la fila y avisada por consola.
- **`AUTORES` no sabe de quién es `edana.bsp`** (`tools/mapa.mjs`), así que su
  `procedencia` dice «edana.bsp» a secas. Averiguarlo es de CREDITOS.md.
- El tercer mapa sigue siendo una línea **más un horneado más una medida**. La
  línea nunca fue la parte cara.

---

## Corrección del 60: «139 guiones» eran de todo MSR, no de Edana

Este documento dice arriba que `build/edana` trae «139 guiones y sus menús».
Es el número que el extractor imprimió, y es cierto que los guardó — pero **no
eran los de Edana**.

`npm run guiones` se ejecutó antes de que existiera `build/edana/bichos.json`,
así que cayó en su rama de respaldo (`delMapa = conMenu`) y guardó los 139
scripts de todo MSR que declaran un menú. De los 22 que Edana tiene puestos,
sólo 9 estaban ahí. Los otros 13 —el sanador, el herrero, el alcalde, el
tendero, la tabernera, el arquero, el mercader y seis sin menú— no tenían
guion, y la F no les abría nada.

Y el 139 en sí también estaba mal: el censo buscaba `game_menu_getoptions` en
el texto crudo de cada script, y un NPC de Master Sword casi nunca trae su
menú, lo hereda del `#include`. Resueltos, son **262**.

Lo que este documento decía bien y sigue bien: se entra, se anda, están los 42.
Lo que decía de más era que sus guiones estuvieran ahí. Ver
[doc/AVISO_60.md](AVISO_60.md), segunda parte.
