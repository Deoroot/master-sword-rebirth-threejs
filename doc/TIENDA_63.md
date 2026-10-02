# Experimento 63 — Se cierra el rojo de la compra, y el pueblo recupera seis vecinos

> «el hud todavia se ve algo diferente, parece que hay texto placeholder en el
> event hud y no esta trayendo los eventos que deberia como los de parry y
> correr, la tecla ctrl no funciona para agacharse (problema de jugar en el
> navegador?). los tamaños de las ventanas superiores son distintas tambien.
> para edana veo que faltan los npc. tambien lo de registro en _trade que me
> indicas»

El 62 se cerró con tres rojas declaradas: comprar por el cable no funcionaba y
el servidor contestaba «The vendor is busy.», que era mi propia guarda. Este
experimento las cierra, y el camino hasta ahí dio **tres fallos encadenados,
los tres en costuras y los tres callados**.

```
npm test                       1 532  (eran 1 526)
npm run sonda:tienda62         14 de 14   (eran 9 de 12)
```

---

## 1. El registro que pedía el usuario, y lo que dijo

Una línea en `_trade`:

```
[DIAG trade] quien= 24 clienteDe= null  claves= []
```

**El `Map` estaba vacío.** O sea que no era que el cliente fuese otro, ni que
la correa hubiera cerrado el trato: `Comercio.abrir` **no se había llamado
nunca**. Y de paso desmontó mi propia conclusión del 62 —«no es la correa, se
instrumentó y no imprimió una sola línea»—: la instrumentación de entonces iba
**detrás** de un `if (!fin.evento) continue`, así que un trato sin retrollamada
se habría cerrado en silencio. La prueba de que no era la correa era buena por
casualidad, no por construcción.

### Fallo 1: `GuionDeNpc` no reenviaba `trato`

```js
constructor({ ficha, npc, catalogo, suceso, ..., tiendas, entidades }) {
  this.entorno = entornoDe({ npc, catalogo, suceso, ..., tiendas, entidades });
  //                        ← `trato` no está ni en la firma ni aquí
}
```

`entornoDe` lo declara, lo documenta con su cita (`npcscript.cpp:875`) y lo usa
en dos sitios. Nadie se lo pasa. Así que en el juego `trato` valía `null`
siempre: `comerciando` era `false` y `trato?.abrir?.()` no hacía nada.

**Y las 25 pruebas del 62 estaban verdes** porque llaman a `entornoDe` a mano y
le construyen el `trato`. Es la variante del 59: *la prueba construye el
argumento que el llamador se equivoca al pasar*. El control nuevo entra por
`new GuionDeNpc({...})`, que es por donde entra el juego; con el arreglo roto
se pone rojo y las 25 viejas siguen verdes, que es justo la demostración de que
no podían cazarlo.

### Fallo 2: el lote vale cero, y el bucle no daba una vuelta

Con el vendedor ya marcado, el servidor restaba el oro, decía «You receive
Sharp Knife.» y **la mochila seguía igual**:

```js
for (let k = 0; k < (r.entregadas ?? 1); k++) p.objetos = [...p.objetos, { id, n: 1 }];
```

`entregadas` es `iBundleAmt`, y **vale 0 por omisión** (npcscript.cpp:772-774),
que es lo que trae casi toda línea de tienda. El `?? 1` no protege de nada: 0
no es `undefined`. Y además el modelo estaba mal: el mod no crea N objetos,
le pone al objeto su cantidad —`pItem->iQuantity = psiStoreItem->iBundleAmt`,
msmonsterserver.cpp:1895—. Es el mismo `V_max(..., 1)` que la línea de al lado
ya usaba para `descuenta`.

Lo tenía mal el servidor de una manera y `src/main.js` de otra: el local metía
siempre `n: 1`, así que un lote de 3 entregaba uno. Arreglados los dos.

### Fallo 3: nadie se lo contaba al navegador

El cliente recibía su personaje **una vez**, en `APARECES`, y nunca más. Con la
tienda y el guion en el servidor eso dejó de bastar: la compra ocurría y la
pantalla seguía con el oro de hace un rato. El mod tiene los dos avisos y los
manda `MSG_ONE`:

```cpp
if (m_OldGold != m_Gold) {                      // sólo si cambió
    MESSAGE_BEGIN(MSG_ONE, g_netmsg[NETMSG_SETSTAT], NULL, pev);
    WRITE_BYTE(3); WRITE_BYTE(1); WRITE_LONG(m_Gold);
}                                                    player.cpp:3861-3870
MESSAGE_BEGIN(MSG_ONE, g_netmsg[NETMSG_ITEM], NULL, pPlayer->pev);
                                          scriptcmds.cpp:2156, player.cpp:3790
```

Van juntos en un `MENSAJE.FICHA` porque este puerto no manda el inventario
ranura a ranura: manda los campos que han cambiado y el cliente los funde.

**Los tres fallos caen entre dos piezas probadas.** Ninguna prueba del modelo
de tiendas y ninguna de la partida podía verlos, porque cada pieza hacía bien
lo suyo. El control nuevo —`test/red_tienda63.test.mjs`— manda un
`MENSAJE.TRADE` de verdad contra una `Partida` de verdad y mira el buzón del
cliente: recorre la costura entera.

---

## 2. El oro también era una mentira del navegador

`probe.misiones.oro(5000)` pintaba un 5000 en la pantalla de la sonda y el
servidor —que es quien resta— seguía sin un duro: contestaba «You can't afford
Sharp Knife.», que **era verdad**, y el control leía el 5000 de la ventana. Es
la misma frontera que `--nacer` del 62, y tiene la misma solución: una perilla
del que levanta el servidor.

```
npm run servidor -- --mapa edana --oro 5000
```

---

## 3. Y el control que medía a Ana quieta

Tres vueltas seguidas dijeron «a Beto no se le abre la tienda», que era verdad
y **no medía la correa**: Ana no se había movido. El diagnóstico fue por
partes, y las tres partes eran distintas:

| lo que parecía | lo que era |
| --- | --- |
| la Escape cierra el panel | con un panel delante la Escape abre el **menú del juego** —«Esc menu», lo dice el propio HUD— y el menú se come la W |
| `probe.vgui.cerrar?.()` cierra el panel | **esa función no existía**. El `?.` se la tragaba y el panel seguía delante. Ahora existe |
| ya con el panel cerrado, la tecla no llega | la tecla **sí** llegaba (`pulsada("adelante")` → `true`), el puntero estaba capturado y nada atrapaba el ratón, y el cuerpo se movía **0,00 m** en diez direcciones |

Lo último no era del navegador: el `--nacer` del 62 dejaba al jugador a **40
centímetros** de Krythos, o sea dentro de su cilindro, encajado. A dos metros
anda, pero entonces la F le apunta a sí mismo y sale el menú del jugador («Sit
Down (Rest)», «Emote: Nod Yes»…). El sitio bueno no se puede elegir de
antemano: **se anda hasta él**, que es lo que hace un jugador. `acercarse()`
da pasos cortos hasta que `delante()` sea el vendedor.

---

## 4. Lo medido

`sonda:tienda62`, dos Chrome contra un servidor de verdad, **14 de 14**:

| | |
| --- | --- |
| el herrero | Krythos the Weaponsmith **#30 para los dos** |
| el oro | viene del servidor, que es quien resta |
| la F | `[Shop | Cancel]`, construido por el servidor |
| el estante | 16 filas por el cable |
| **comprar** | **5000 → 4985**, y el precio lo dijo el servidor |
| **el objeto** | **5 → 6** en el personaje, que vive en el servidor |
| Beto, con Ana dentro | no se le abre nada: el `_busy` del mod |
| Ana se aleja 426 unidades | y entonces a Beto **sí**: la correa suelta el trato |
| **y Beto ve 2 donde había 3** | **el estante es UNO**: no hay dos últimas dagas |

La última es la que da sentido a todas: dos personas comprando del mismo
inventario.

---

## 5. Los seis vecinos que faltaban en Edana

> «para edana veo que faltan los npc»

El filtro del censo era:

```js
const ES_BICHO = /^(msmonster_|ms_npc$|msworlditem_)/;      tools/bichos.mjs
```

y **todos** los `classname` de bicho del mod son la misma clase de C++:

```cpp
LINK_ENTITY_TO_CLASS(ms_npc, CMSMonster);
LINK_ENTITY_TO_CLASS(msnpc_human1, CMSMonster);
LINK_ENTITY_TO_CLASS(msmonster_orcwarrior, CMSMonster);
                                            msmonsterserver.cpp:38-59
```

Edana tiene **seis `msnpc_human1`** y Gate City **cero**, así que dejar fuera
la familia entera no dio ningún error: dio menos gente. **48 colocados donde
había 42.** Cuarta vez seguida —50, 60, 61, 63— que el fallo lo enseña el
segundo mapa y no mirar mejor.

La defensa no es sólo la familia que faltaba: ahora el extractor **dice lo que
descarta** si parece un bicho, en la misma línea en la que hornea.

---

## 6. El HUD

### Las ventanas de arriba, que salían estrechas y altas

La captura del juego de verdad enseña «This village grew around the temple of
Urdual of the southern frontier.» **en una línea**, unos 330 píxeles. Este
puerto la partía en once líneas de dos palabras, y lo tenía documentado como
port literal del ancho de nacimiento del `TextPanel` (120 − 2×3). Era falso, y
lo que faltaba por portar es la línea siguiente:

```cpp
Text->setText(NewText);
Text->getTextImage()->getSize(TextX, TextY);
Text->setSize(TextX, TextY);                     vgui_infowin.h:68-71
```

El 114 **no es donde se parte el texto**: es el ancho con el que nace el panel,
y esa línea lo tira. La corrección va **al lado** del comentario viejo, fechada,
como manda el apartado 7 — con lo que **no** se puede citar dicho claramente:
al lado sólo están las cabeceras de VGUI (`VGUI_TextImage.h:41-42` declara
`getTextSize` y `getTextSizeWrapped`, sin cuerpo), así que el tope de media
pantalla es **nuestro**, no del mod.

### Los avisos de correr, que faltaban enteros

`DoSprint` no sólo decide si trotas: **habla**, y son cinco frases con cinco
motivos distintos (clplayer.cpp:343-387):

```
You break into a jog.
You slow down and begin walking casually.
You are too exhausted to run.                 (al arrancar)
You are too exhausted to continue running.    (en marcha)
You lose your running speed.                  (chocar, agacharse, atacar)
```

Portadas en `avisoDeCarrera` (`src/play/movimiento.js`), al lado de
`puedeCorrer` y **con sus mismos argumentos**, para que las dos no puedan
discrepar: si una dice «ya no corres» y la otra «porque te has cansado» cuando
en realidad chocaste, el aviso miente. El orden en que el mod los decide
—aguante, frenazo, soltar— es lo que decide cuál sale, y hay una prueba sólo
para eso.

`ms_sprint_verbose` («0» calla todo, «1» deja los «no puedes», «2» también el
trote) está en la rama nueva del mod (clplayer.cpp:234-266) y no en la vieja,
que las dice las cinco siempre. Se porta el valor con el que se ven en el
juego: las cinco.

### La Ctrl, que no agacha

Es del navegador, y **no es texto de relleno**: la línea de abajo a la derecha
de la captura es el propio puerto avisando de que **Ctrl+W cierra la pestaña**,
así que el navegador se queda la tecla antes de que el juego la vea. La salida
es la que dice el aviso —pantalla completa, donde `navigator.keyboard.lock()`
se la devuelve al juego (`src/juego/navegador.js:165`)— o reasignar la tecla en
las opciones, que avisa de los choques en el momento de asignar.

### El «Your Parry value is now 2», que NO está portado

Ése no sale del motor ni del mod: sale de un **guion del jugador**.

```
if ( OLD_PARRY != PL_PARRY ) yplayermessage ent_me Your Parry value is now TOTAL_PARRY
                                    MSCScripts/scripts/player/externals.script:696
```

En Master Sword **el jugador también es una entidad con guion**, y son 26
archivos en `scripts/player/` —`player_main`, `player_sh_stats`,
`player_sv_regen`, `player_statusflags`, `externals`…— que este puerto no corre.
No es un mensaje que falte: es un sistema entero. Queda apuntado en
NEXT_SESSION.md como lo que es, y no se cuenta entre lo hecho.

---

## 7. Las sondas vecinas, y un rojo que NO es de aquí

```
npm test               1 538 de 1 538      (eran 1 526)
vite build             limpio
sonda:tienda62         14 de 14            (eran 9 de 12)
sonda:tienda60         20 de 20            la tienda jugando solo, intacta
sonda:aviso60          22 de 22            las ventanas de arriba, tras cambiarles el ancho
sonda:edana60          13 de 13            los siete NPC de Edana y sus menús
sonda:intro42          11 de 14            ROJO, y no es de este experimento
```

`sonda:edana60` tenía el 42 **escrito a mano** y se puso rojo por tener razón:
ahora la cuenta sale de `bichos.colocados.length`, que es lo que manda el
apartado 5 de CLAUDE.md —«las cuentas se calculan, no se escriben»—.

Las tres de `intro42` son de la presentación del mapa a los ~11 s y ~14 s.
**No son de aquí, y está comprobado, no supuesto**: se revirtieron a mano los
dos cambios de este experimento que podían tocarlas —el ancho de la ventana y
los avisos de correr— y la sonda dio **10 de 14**, o sea una peor. Los mismos
controles la ven aparecer más tarde en el mismo recorrido (a 150 hp y a 12 hp
salen las tres ventanas), así que lo que falla es el reloj de la sonda, no el
mecanismo: es una sonda que espera segundos donde debería esperar el efecto.
Queda apuntada como pendiente, sin contarla entre lo hecho.
