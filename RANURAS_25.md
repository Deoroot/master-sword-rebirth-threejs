# Experimento 25 — Las ranuras rápidas y el menú

> «Todavia faltan unas cuantas cosas en cuanto a la interfaz, los botones 1, 2 y
> 3 que sirven para ciclar entre armas, hechizos y munición. Dejar presionado
> los botones F1-F12 funcionan como quickslot para el arma equipada actualmente.
> Entiendo que básicamente nos falta implementar eso y el menú principal de msr,
> con las opciones que sirvan ahora y sus sonidos asociados. Entiendo que todo
> eso debería vivir dentro del juego.»
>
> «Recuerdo que 1 2 y 3 son más teclas por defecto configuradas en las opciones,
> en realidad podrían ser otras.»

Los dos mensajes, y el segundo es el que decidió la forma del primero.

**942 pruebas** (`npm test`, eran 897) y **39 de 39 controles** en navegador
(`npm run sonda:ranuras`). `npm run menu` hornea el menú con 16 controles.
`public/` sin tocar.

---

## 1. La corrección, que llegó a tiempo

Tenías razón y cambia el diseño entero: **el `1` no está en el código del
juego**. Está en un `bind`, y el motor sólo engancha cinco comandos
(`hud.cpp:265-267`):

```
quickslot weapon | spell | arrow     un comando con argumento, no tres
+quickslot N / -quickslot N          la misma tecla, pulsar y soltar
```

Lo que se porta es la **acción**; la tecla es su valor por defecto y sale de
`gfx/shell/kb_def.lst`, que es una tabla de dos columnas con los nombres
bonitos en `kb_act.lst`. Aquí eso ya tenía sitio —`src/juego/teclas.js` existía
desde el paso 2 y guarda las asignaciones en el equipo, no en el personaje— así
que las acciones nuevas entraron con su `cfg` y se reasignan como cualquier
otra.

**Y el reparto de fábrica no es 1-2-3:**

| tecla | comando | qué es |
|---|---|---|
| `1` | `quickslot weapon` | elegir arma |
| `2` | `quickslot spell` | elegir hechizo |
| **`3`** | **`inventory`** | **abrir el inventario** |
| `4` | `quickslot arrow` | elegir munición |
| `i` | `inventory` | el inventario otra vez |
| `6`..`0` | `+quickslot 1`..`5` | las cinco primeras ranuras |
| `F1`..`F12` | `+quickslot 1`..`12` | las doce ranuras |

La munición es la **4**. Y las cinco primeras ranuras tienen **dos** teclas cada
una, lo que aquí vino de perlas: un navegador se queda con F11 (pantalla
completa) y F12 (herramientas), y con el segundo juego esas cinco se pueden usar
siempre. No hubo que inventar nada — está en el archivo del juego.

Los únicos dos que sí me inventé están declarados en el código: **Alt** y
**Alt Gr** para los desplazamientos de ranuras, porque el juego los tiene como
alias de consola (`kb_act.lst`: «Shift Quickslots +12» y «+24») y no les da
ninguna tecla.

## 2. Y hay 36 ranuras, no 12

`#define MAX_QUICKSLOTS 36` (`player.h:102`, «MiB MAR2012 - Increase
quickslots»), con doce teclas. Se llega a las 36 con esos dos desplazamientos
mantenidos: F1 con el primero pulsado es la ranura 13.

## 3. El ciclador no es un menú: es una palabra

Es una tira de la altura de una línea pegada abajo, a la derecha del emblema
(`Panel(XRES(170), ScreenHeight - YRES(14), …)`, `vgui_quickslot.h:49`). No hay
lista, no se puede mirar lo que hay. Cada pulsación avanza uno y escribe su
nombre, en tres colores según el tipo: **blanco** un objeto, **cian** un
hechizo, **verde** la munición.

Tres cosas del motor que no se adivinan:

**La espera de 2,5 s CANCELA, no elige.** En `Update()` la llamada a
`ConfirmItem()` está **comentada** y lo que corre es `SelectItem(NULL)`
(`vgui_quickslot.h:81-85`). Quien cicla y se queda mirando se queda con el arma
que tenía. Medido en pantalla: a los 2,2 s la etiqueta sigue, a los 2,8 s no
está, y el arma de la mano es la misma.

**El botón de atacar acepta, y se lo come.**

```cpp
if (FBitSet(player.pbs.ButtonsDown, IN_ATTACK))
  if (QuickSlotConfirm()) player.BlockButton(IN_ATTACK);   // clplayer.cpp:558-562
```

El clic con el que cambias de arma **no da además un espadazo**. Hay que soltar
y volver a pulsar. Sin esto, cambiar de arma ataca.

**Dar la vuelta entera apaga la etiqueta, y ése es el único aviso de que ya lo
has visto todo.** `GetItemInInventory` no tiene ningún `% tamaño`: recorre
buscando el siguiente y, al no encontrarlo, cae en `if (Items.size()) return
Items[0];` con el comentario «Item with StartID wasn't found». Vuelve al
primero, que es justo `m_FirstQuickItem`, y la etiqueta se apaga. La vuelta
cierra por accidente.

Dos detalles más de la misma función: **lo que llevas en la mano no está en la
lista** (`CheckHands = false`), así que ciclar armas nunca te ofrece la que ya
tienes; y **«arma» significa «tiene ataques»**, no una categoría.

### Las asimetrías, que son de verdad

- **Las armas dan la vuelta; los hechizos no.** Al llegar al último hechizo,
  `QuickSlot.Active = false` y se apaga (`:146-147`). Las dos ramas no las
  escribió la misma persona el mismo día.
- **Sin armas que ofrecer, el ciclador no apaga la etiqueta**, porque el
  `if (pItem)` de `:114` no tiene `else`. La rama de la munición sí lo tiene
  (`:226`). Portado con el fallo, y hay una prueba que lo dice.
- **La munición empieza siempre por la infinita**, y con un arma que no dice qué
  dispara salen **las dos** —flecha y virote— antes de las de la mochila. Y la
  infinita no se apunta como «la primera» (`&& !GENERIC`, `:212`): sin ese
  detalle el ciclo moriría en la segunda pulsación.

## 4. Las doce teclas hacen tres cosas

Pulsar y soltar **usa** la ranura. Aguantarla dos segundos **graba** lo que
llevas puesto —un `2` a pelo, sin cvar, `vgui_quickslot.h:72`— y el comando que
sale es `quickslot create N current`, donde `current` lo resuelve el servidor.
Una ranura vacía **no dice nada**: ni pitido ni aviso, y eso también se porta.

Aquí hubo que añadir algo que el motor no necesita: **`e.repeat`**. Aguantar una
tecla en un navegador dispara `keydown` cada 30 ms, y sin mirarlo el cronómetro
se reiniciaba en cada repetición y no grababa nunca.

## 5. El menú principal

Son cuatro archivos de texto y catorce imágenes, y el motor los junta:
`gamemenu.res` (las opciones), `BackgroundLayout.txt` + doce `.tga` (el fondo),
`game_menu.tga` (el logotipo) y `sound/ui/` (los sonidos). Lo hornea
`npm run menu`, con 16 controles.

**El fondo son doce piezas** porque Half-Life no admitía texturas de más de
256 px, y **no son doce cuadrados**: la última columna mide 32 px de ancho y la
última fila 88 de alto, porque 800 no es múltiplo de 256. El control que lo
comprueba no mira los tamaños sino que la suma de las áreas sea exactamente el
área del lienzo — con un hueco o un solape no cuadra, y un mosaico mal montado
se ve raro pero no da error.

**Cinco de las quince entradas están comentadas** en el archivo, incluidas «New
Game», «Load Game» y «Save Game». En un juego que sólo se juega en servidor no
hay partida que guardar, y el menú lo dice tachándolas en vez de borrarlas. Las
que quedan están renombradas: no es «Find Servers», es **«Visit a Kingdom»**.

**Tres entradas están en blanco a propósito**: son los separadores. Y una de las
tres lleva `notmulti`, así que ese hueco no se ve nunca — es la única entrada
del archivo que esa bandera llega a esconder hoy.

**Y «Name Character» y «Options» llevan al mismo sitio:** las dos dicen
`"command" "OpenOptionsDialog"`. No es que nombrar al personaje esté en las
opciones; es que la entrada quedó a medias y apunta donde la de al lado. Aquí
van a sitios distintos, separadas por la etiqueta, porque es lo que dicen.

**Lo que no puede funcionar se ve y dice por qué.** «Visit a Kingdom» y
«Establish a Kingdom» están apagadas porque no hay servidores, y «Quit» porque
un navegador no cierra la pestaña que no abrió él. Esconderlas daría un menú más
limpio y menos parecido.

**Los sonidos son tres.** Toda la interfaz del juego suena con
`buttonrollover`, `buttonclick` y `buttonclickrelease`, y son los mismos que usa
el ciclador de armas: el clic con el que eliges una espada es el mismo con el
que sales del juego.

### Lo que la primera captura desmintió

`game_menu.tga` son 240×32 y blanco puro con alfa. Por el tamaño lo tomé por la
placa de un botón y la monté detrás de cada opción. La captura lo dijo de
golpe: es el **logotipo «MASTER SWORD» con «ART BY: ANDERS FINÉR» debajo**, o
sea el título y el crédito del pintor del fondo. Va una vez y arriba. **Anders
Finér** está ahora en [CREDITOS.md](CREDITOS.md).

## 6. El censo de las siete armas, que debía desde el 21

Cuatro experimentos pidiéndolo y esta vez tocaba, porque sin dos armas el
ciclador es una tecla que no hace nada. El control no sabe de ranuras: empuña
cada una de las siete de `reg.newchar.weaponlist` y mira que salga algo con lo
que pegar. **Encontró tres cosas.**

**1. Una de las siete no es un arma.** `magic_hand_lightning_weak` es
`tipo: hechizo` — una mano que lanza un rayo errático de 25 de daño a 500
unidades. Nuestro lector le saca **cero ataques**, y no porque el script no los
tenga: los declara `magic_hand_base.script:106` dentro de un
`if ( MELEE_RANGE isnot 'MELEE_RANGE' )` —el modismo de «¿está definida esta
constante?»— y el lector no evalúa condicionales. **Queda declarado y no está
arreglado**: el control lo nombra en vez de pintarse de verde.

**2. El bastón salía sin modelo en la mano**, y ya está arreglado. La familia de
las astas usa **otro juego de nombres** para lo mismo: `VMODEL_FILE` en vez de
`MODEL_VIEW`, `PMODEL_FILE` en vez de `MODEL_WORLD`
(`polearms_base.script:28` y `:220`). Sin ese segundo juego el arma funciona,
pega y hace daño, y no se ve. No daba ningún error.

**3. Y el bastón declara dónde está su modelo del suelo**, en vez de estar dos
submodelos más allá. El control de `tools/armas.mjs` daba por hecho el `+2` de
`game_fall` y acusaba al bastón de caer en el juego de `evilfshard_rhand`, dos
armas más allá — el bastón estaba bien y el control no. En esa familia el suelo
es el 61 y la mano el 62: **van al revés**.

Para poder ciclar hace falta llevar más de un arma, y en Gate City no hay
tiendas ni ninguna en el suelo. La tecla **N** pone las otras seis en la mochila
y está declarada como andamio, igual que la K y la B: el día que haya tiendas
sobra.

## 7. Qué hay y qué no

**Está:** ciclar armas, hechizos y munición con su etiqueta, sus tres colores,
su espera que cancela y el botón que acepta y se come el golpe; las 36 ranuras
con sus doce teclas, el aguante de dos segundos para grabar y los dos
desplazamientos; el menú principal con su fondo, su logotipo, sus sonidos y sus
opciones, las que sirven y las que dicen por qué no.

**No está:**

- **Los hechizos de verdad.** `m_SpellList` se llena con `LearnSpell`, que viene
  de los libros, y no hay ninguno puesto. El ciclador lo nota solo y no enseña
  nada, que es lo que hace el juego.
- **`menu main` (la `g`)**, que es OTRO menú: el del juego, distinto del de la
  pantalla de título. Y `menu interact` (la `f`), el de hablar con un NPC.
- **La pantalla de opciones con la lista de teclas de `kb_act.lst`**, con sus
  secciones y sus nombres. Las asignaciones se cambian, pero por la pantalla que
  ya teníamos.
- **Las ranuras no se guardan** entre sesiones. En el juego van en el personaje
  (`CHARDATA_QUICKSLOTS1`, `sv_character.cpp:696`) y aquí viven en memoria.
- Y lo del 24: el HUD retro, el panel de identificación del objetivo, el chat,
  los 19 iconos de estado y las ventanas de ayuda.

## 8. Lo primero del 26

**Las ranuras en el documento del personaje.** Es lo que más se nota de lo que
falta: grabas doce y al volver no hay ninguna. El formato del juego está leído
(`sv_character.cpp:696-710`, un byte de tipo desplazado en uno y un entero de
id) y nuestro `personaje.js` ya tiene `CONOCIDOS` donde meterlo.

Y el **panel de identificación del objetivo** («Giant Rat / Hostile»), que sigue
siendo lo siguiente en valor desde el 24.
