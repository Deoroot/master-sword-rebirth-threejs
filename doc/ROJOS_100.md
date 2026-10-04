# Experimento 100 — los dos rojos sin atribuir: `fisica` y `armas96`

> `npm run sondas -- -j 1 fisica armas96`

El 99 dejó dos sondas rojas «desde antes del 99» y sin dueño (punto 6 de su
«Pendiente»): `fisica` 18/19 y `armas96` 31/33. **Las dos eran el control y no
el juego**, pero de dos maneras distintas: la primera medía una pantalla que el
juego ya no enseña; la segunda medía bien y le faltaba una condición que diera
nombre al rojo.

## 1. `fisica`: «la pantalla de opciones lista las acciones: 0»

**El control contaba `.mx-tecla`**, la clase de la pantalla SUPLENTE de
`src/juego/interfaz.js`. Esa pantalla, desde el 33 (`dd4bd1d`), sólo sale si la
ventana de VGUI2 no está montada:

    if (panelDeOpciones?.()) { cerrar(); return; }        interfaz.js:740

y `main.js:690` la monta siempre (`montarVgui2(...)` en `main.js:721`). O sea
que con el juego bien la tecla abre la ventana buena —siete pestañas, la tabla
«Master Sword Commands»— y el control leía **0** porque la suplente no existe.
Medía la ausencia de la ventana correcta. El control es de la mudanza
(`99fb5e3`, `git blame`), anterior al 33; desde que la ventana de VGUI2 gana no
puede estar en verde salvo que VGUI2 falle al montarse. No he reconstruido
cuándo dejó de fallar ése —no hay registro de la sonda entre el 33 y el 99—, así
que «rojo desde el 33» es inferencia del código, no medida.

**Arreglo, en la sonda** (`sondas/fisica.mjs`): se hace lo que hace el jugador.
La tecla de `opciones` del mapa de teclas (la G del `config.cfg`), la pestaña
«Keyboard» con el ratón, y se leen las filas de la tabla bajo la cabecera
«Master Sword Commands». Se comparan **nombre por nombre** con `ACCIONES`
(`src/juego/teclas.js`, importado en Node: es de donde las pinta la ventana).

Resultado: **19 de 19**; «ventana abierta · pestaña Keyboard · 39 filas de 39
acciones · primera «Move Forward»».

**Rotura deliberada** (`ROTURA100`, `grep -c` = 1 antes y 0 después): la tabla
de `src/vgui2/opciones.js` pinta `this.acciones.slice(1)`. La sonda: **18 de
19**, «38 de 39 acciones en «Keyboard»», primera «Move Back». Deshecha.

Queda dicho y no tocado: `fisica` entra por `?map=gatecity`, no por el menú
(apartado 3 del CLAUDE.md). `test/sondas_entrada.test.mjs` la deja pasar; pasarla
al menú es otro trabajo.

## 2. `armas96`: «lo que cambia es ella: fuera de su ventana» 5,7 % y 7,0 %

### Lo que había

El rojo del 99 está en `build/sondas/_integracion99.txt` (11:36): las dos armas,
**5,7 % y 7,0 %** «fuera». Las fotos de esa pasada ya no existen (cada pasada
las pisa).

### No se reproduce

| pasada | sitio | Novablade fuera | Ice Blade fuera |
| --- | --- | --- | --- |
| `npm run sondas` | nacimiento de hoy | 0,0 % | 0,0 % |
| copia con sitio | `[88, 2472, −416]`, el del 99 | 0,0 % | 0,0 % |
| copia con sitio | `[472, 3264, −416]`, el rayo de antes del 99 | 0,0 % | 0,0 % |
| copia, tres más | nacimiento de hoy | 0,0 % ×3 | 0,0 % ×3 |
| `git worktree` en `1677e5e` (el commit del 99) | su nacimiento | 0,0 % | **0,7 %** |

Ocho pasadas sin el rojo, ni en el árbol del commit del 99 (con el `build/` de
hoy, que es lo único que no pude volver atrás). Así que **no sé qué lo produjo a
las 11:36** y no lo escribo como causa.

### Lo que sí se midió: la cámara se mueve, y eso basta

La pasada del worktree dejó un 0,7 % repartido por **toda** la pantalla y no en
un sitio: más en la franja alta, sin forma de arma ni de NPC. Eso es lo que hace
la sala entera al moverse la cámara un poco. Así que se instrumentó la pose de la
cámara entre la primera foto y la última:

- Dos pasadas normales: el jugador **seguía moviéndose 0,15 u** en una (pies y
  cámara juntos, sin giro); 0,000 u en la otra. Tras `poner` y 400 ms el jugador
  no siempre está quieto. (Hay sesiones tocando `player.js` y `atasco.js` ahora
  mismo, así que no atribuyo el movimiento a nada concreto.)
- Desplazando la cámara a propósito entre `con` y `sin`: **0,3 u → 17,4 % y
  16,3 % «fuera»; 1 u → 33,3 % y 32,2 %**. Las texturas de esta sala tienen tanto
  grano que un tercio de unidad de cámara, con el umbral de 24, cambia casi una
  quinta parte de los píxeles.

O sea: el control supone que lo único que cambia entre `con` y `sin` es el arma,
**y nadie comprobaba esa suposición**. Una cámara movida entre 0,1 y 0,2 u da
exactamente la cara del 99 —las dos armas, unos puntos de «fuera»— y el rojo
acusaba al arma. Es la forma «antes de culpar a la regla, comprueba que el que
mide está de pie» del 69, otra vez.

### Arreglo, en la sonda (`sondas/armas96.mjs`)

1. `plantar` ya no espera 400 ms a secas: espera además a que los pies no se
   muevan en **cinco lecturas seguidas** (100 ms cada una, tope 5 s).
2. Un control NUEVO, delante del de «fuera»: **«y la cámara no se mueve
   mientras se la fotografía (< 0,05 u, < 0,01°)»**, con la pose leída antes de
   la primera foto y después de la última.

El listón de «fuera» **no se ha tocado** (< 1 % y < 1/10 de dentro). El control
nuevo no lo ablanda: tienen que estar las dos en verde, y la de la cámara sólo
dice cuál de las dos cosas se movió.

Resultado: **35 de 35**, cámara 0,000 u y 0,0000° en las dos armas, «fuera»
0,0 % en las dos.

**Rotura deliberada** (`ROTURA100` en la sonda, `grep -c` = 1 antes y 0
después): `poner` del jugador 0,3 u a un lado entre `con` y `sin`. **31 de 35**:
la cámara roja en las dos («0.300 u») y «fuera» rojo en las dos (17,4 % y
16,3 %). Deshecha.

Lo que NO se ha comprobado rompiendo: que la espera de quietud cambie algo. No
he sabido provocar a voluntad el movimiento de 0,15 u, así que de esa pieza sólo
puedo decir que no estorba; si el jugador no se para, lo dirá el control de la
cámara con su nombre.

## 3. Lo que se cruzó por el camino, sin tocar

- En tres de las ocho pasadas salieron otros rojos de `armas96`, intermitentes:
  «y al caer se carga y se dibuja: hay NODO en la escena» (llegó `true`, sin
  nodo) y «y con la x se vuelve a coger, a la mochila» (nada). Son de soltar y
  coger, no de este trabajo, y no están atribuidos.
- La sala del nacimiento sale **muy sobreexpuesta** (amarillo casi blanco) en
  todas las fotos de hoy; no sé si es de otra sesión a medias.

## 4. Archivos

- `sondas/fisica.mjs`: el control de la pantalla de teclas, por la tecla y la
  ventana de VGUI2.
- `sondas/armas96.mjs`: la espera de quietud en `plantar`, la pose de la cámara
  alrededor de las fotos y el control nuevo.
- Las copias de usar y tirar están en `build/_rojos100/` (fuera del repositorio).

## Añadido después: `arco` 39/40, el tercer rojo de la sonda y no del juego

Salió en la pasada integrada, con las cuatro partes del 100 juntas: «la flecha
vuela de verdad» con **50 u en 0,050 s** contra 38 esperadas. El tiro iba
siempre a **+X** (`mirar(ojo + 4000, …)`), y desde el nacimiento nuevo de Gate
City bajo el rayo `*37` (`bajoElRayo`, tools/aparicion.mjs, del agente D) hay
piedra a metro y medio en esa dirección: un vuelo de cinco centésimas no da
para comparar camino con velocidad × tiempo. Es el 55 otra vez —el número
medía dónde está la pared—, y con el nacimiento como variable.

- **Arreglo, en `sondas/arco.mjs`:** antes de tirar se busca el primer rumbo
  horizontal (de 32) con 8 m libres en el centro y a ±12° —los nueve grados del
  desvío lateral más el cono—, con `probe.arco.libre`, la traza de `DoDamage`.
  Si no hay ninguno la sonda se cae diciéndolo, en vez de medir una pared. Los
  dos tiros al horizonte usan ese rumbo.
- **Resultado:** 40/40 dos veces; rumbo 11,3°, vuelo 328 u en 0,42 s.
- **Rotura deliberada** (`ROTURA100`, `grep` 1 puesta y 0 quitada): la búsqueda
  devuelve siempre el primer rumbo, o sea +X. 39/40 con el mismo «50 u en
  0,050 s» del rojo original. Quitada.
