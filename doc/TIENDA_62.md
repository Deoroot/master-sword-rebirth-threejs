# Experimento 62 — El estante se muda al servidor

> «listo. continuemos entonces» · y antes: «recuerdo que las ventanas de compra
> y los guiones eran ventanas vgui dentro del juego»

El 61 dejó dos personas andando Edana y hablándose. Lo que seguía roto era más
callado: **cada navegador corría su copia del guion de cada NPC**. Con un
jugador eso es lo mismo; con dos son **dos vendedores distintos con el mismo
nombre**, cada uno con su estante, su oro y sus variables, y los dos pueden
comprar la última daga sin enterarse.

```
npm test                       1 524  (eran 1 499)
npm run sonda:tienda60         20 de 20   la tienda jugando solo, intacta
npm run sonda:tienda62          9 de 12   dos navegadores, un vendedor
```

**Las tres rojas son la compra por el cable, y están declaradas pendientes con
su síntoma exacto — apartado 5.** Todo lo demás está medido.

---

## 1. El reparto del original, que el usuario recordaba bien

La ventana de la tienda es VGUI del cliente. Y **todos sus números llegan del
servidor**:

```cpp
CStorePanel::iStoreBuyFlags = READ_BYTE();
CStorePanel::StoreVendorName = READ_STRING();
StoreItem.Quantity    = READ_SHORT();
StoreItem.iCost       = READ_LONG();
StoreItem.flSellRatio = READ_SHORT() * 0.01;
StoreItem.iBundleAmt  = READ_SHORT();
CStorePanel::StoreGold = READ_LONG();
                                              vgui_storemainwin.cpp:88-135
```

Comprar es `ServerCmd("trade …")` (`client.cpp:739`); elegir una opción de un
menú es `ClientCmd("menuselect %d")` (`menu.cpp:143`) que atiende
`multiplay_gamerules.cpp:1576`. O sea: **la ventana es del cliente, el estante y
las consecuencias son del servidor**.

Este port tenía las ventanas en su sitio desde el 60 y la autoridad en el
equivocado. Mudarla son dos líneas de frontera en `src/main.js`:

```js
pedir: id => (red?.dentro ? red.pedirMenu(id) : interacciones.pedir(id)),
elegido: (id, indice) => (red?.dentro ? red.elegirMenu(id, indice)
                                      : interacciones.elegido(id, indice)),
```

Jugando solo el guion sigue corriendo en el navegador, que es lo que hace
`hl.exe` con un *listenserver*: el servidor está dentro del proceso.

---

## 2. Lo que hubo que cambiar para que un guion sirva a varios

`InteraccionesNpc` ya no tocaba el DOM ni Three desde que se extrajo, así que se
monta en el servidor tal cual. Lo que **no** podía era servir a más de uno:

- **la sesión iba en el constructor.** Ahora va por parámetro en cada llamada
  (`pedir(id, sesion)`, `elegido(id, indice, sesion)`) y la del constructor es
  la de por omisión, así que el navegador jugando solo no cambia. Es lo que hace
  el mod, que tiene un `CScript` por entidad y le pasa el jugador como
  parámetro (`client.cpp:485-490`);
- **los recados del guion iban «a la pantalla».** Abrir la tienda o un
  `infomsg` tienen que llegar **al que habló**, no al que pasaba por allí. Se
  apunta con quién está hablando el guion ahora mismo, que en el mod no hace
  falta porque el jugador viaja en el evento y el mensaje se manda con
  `MESSAGE_BEGIN(MSG_ONE, …)`;
- **las tiendas eran una por NPC.** `entornoDe` creaba su propia `Tiendas` por
  valor por omisión; en el mod es una lista global (`CStore::m_gStores`). Ahora
  hay una por partida, que es además el sitio donde buscar el estante al
  servirlo.

---

## 3. La respuesta del original a «dos personas en el mismo vendedor»

No es un estante compartido que los dos miran: es **una cola de uno**.

```cpp
if (!HasConditions(MONSTER_TRADING)) { ...abrir la tienda... }
else if (m_TradeCallBackEvent.len())
    CallScriptEvent(UTIL_VarArgs("%s_busy", m_TradeCallBackEvent.c_str()));
                                              npcscript.cpp:875-894
```

Y el trato se marca en los dos, apuntándose el uno al otro:

```cpp
pVendor->SetConditions(MONSTER_TRADING); pVendor->m_hEnemy = pPlayer;
pPlayer->SetConditions(MONSTER_TRADING); pPlayer->m_hEnemy = pVendor;
                                              store.cpp:77-80
```

que es de paso por qué el mod prohíbe el inventario mientras comercias
(`client.cpp:466`): es la misma condición.

**Y no se acaba cerrando el panel: se acaba andando.**

```cpp
void CMSMonster::Trade() {
    if (!HasConditions(MONSTER_TRADING)) return;
    if (m_hEnemy != NULL && m_hEnemy->IsAlive()) {
        CBaseMonster* pEnemy = ...m_hEnemy;
        if (pEnemy->m_hEnemy == this &&
            (pEnemy->Center() - Center()).Length() <= 128) return;
    }
    if (m_TradeCallBackEvent.len()) CallScriptEvent("<cb>_done");
    ClearConditions(MONSTER_TRADING);
    m_hEnemy = NULL; OpenStore = NULL;
}                                             msmonsterserver.cpp:1835-1856
```

Tres cosas que se copian porque cambian lo que pasa:

- la distancia es **`Length()`, en 3D** — al contrario que la del chat del 61,
  que es `Length2D()`. Aquí la altura sí cuenta;
- el trato se rompe si el cliente **deja de apuntar al vendedor**: hablar con
  otro te saca de la tienda;
- corre en el `Think` del NPC, así que un vendedor puede quedarse «ocupado» unos
  instantes después de que el otro haya cerrado el panel.

Esto es nuevo en `src/play/tienda.js` (`Comercio`, `CORREA_DE_COMERCIO`), con 25
pruebas. Y `comerciando` —el parámetro que decide entre abrir y `_busy`— estaba
portado desde el **44** y **nadie lo ponía nunca a `true`**: la regla existía y
no se ejecutaba. El apartado 4 de CLAUDE.md en su forma de siempre.

---

## 4. Lo medido

`sonda:tienda62`, dos Chrome contra un servidor de verdad, entrando por el menú:

| | |
| --- | --- |
| el herrero | Krythos the Weaponsmith **#24 para los dos**: una entidad, no una copia por navegador |
| la F | `interact [Shop | Cancel]` — **las opciones las ha construido el servidor** |
| «Shop» | abre el selector, que lo pidió el guion del servidor |
| el estante | **16 filas por el cable**, del `Tiendas` de la partida |
| **Beto, con Ana dentro** | no se le abre nada: es el `_busy` del mod |
| **Ana se aleja** | y entonces a Beto **sí** se le abre: la correa suelta el trato |

Las dos últimas son el experimento entero: el vendedor hace cola de uno, y la
cola se libera andando.

### Una perilla nueva del servidor, y por qué

```
npm run servidor -- --mapa edana --nacer 53.4,-7.3,42.5
```

Con red **el cuerpo lo mueve el servidor**, así que un `probe.mundo.poner()` es
una mentira que la reconciliación deshace —lo mide el control «el servidor
corrige la mentira» de `sonda:red`—. Y el herrero de Edana está a **107 metros**
del `ms_player_begin`: andarlos mediría el camino, que no está portado, en vez
de la tienda. `--nacer` elige otro punto de aparición, que es lo que hace un mapa
con varios `ms_player_spawn`. No es del jugador: es del que levanta el servidor.

---

## 5. Lo que queda ROJO, y no se cuenta entre lo hecho

> **CERRADO EN EL 63.** Las tres rojas de este apartado están verdes:
> `sonda:tienda62` va **14 de 14** y se compra por el cable, con el estante
> compartido. Lo de abajo se deja tal cual, incluida **una conclusión que era
> falsa** —«no es la correa, se instrumentó y no imprimió una sola línea»—:
> aquella instrumentación iba **detrás** de un `if (!fin.evento) continue`, así
> que un trato sin retrollamada se habría cerrado en silencio. La conclusión
> acertó por casualidad, no por construcción. Lo que pasaba de verdad, y los
> otros dos fallos que había debajo, en [TIENDA_63.md](TIENDA_63.md).


**Comprar por el cable no funciona.** El clic manda su `trade`, y el servidor lo
rechaza con **«The vendor is busy.»**, que es mi propia guarda de `_trade`:

```js
if (I.comercio.clienteDe(quien) !== c.sesion) { ...«The vendor is busy.»... }
```

Lo que **ya se sabe** de este rojo, para que la sesión que siga no empiece de
cero:

- **no es la correa.** Se instrumentó el servidor para que dijera por qué cierra
  cada trato y **no imprimió una sola línea**: el trato de Ana seguía abierto
  cuando llegó el `trade`. La hipótesis obvia era falsa y está descartada;
- **no es el tipo del identificador**, ya no. Lo era: `Comercio` guardaba las
  claves como cadena y `paso` devolvía la clave, así que `manada.de("24")`
  —que indexa un array— daba `null` y la correa cerraba el trato en el
  fotograma siguiente. Arreglado, con tres pruebas que lo vigilan;
- **lo siguiente es una línea**: registrar en `_trade` qué vale
  `clienteDe(quien)` y qué vale `c.sesion` cuando se niega. Con eso se sabe si
  falta el `abrir` o si son dos objetos de sesión distintos.

Mientras no esté, **la tienda en red es de sólo mirar**: se abre, trae el
estante bueno y respeta la cola, y no se puede comprar. Jugando solo se compra
igual que antes — `sonda:tienda60`, 20 de 20.

Y sigue pendiente de antes: vender (escrito y no medido desde el 60), los
grupos, `game_confirm_buy`, y el combate entre jugadores, que el usuario bajó
del camino crítico con razón — el PvP viene apagado de fábrica
(`ms_pklevel "0"`, svglobals.cpp:47).

---

## 6. Lo que costó tiempo y no era del port

Ocho vueltas de sonda se fueron en cosas de manejar el navegador, y quedan
apuntadas porque volverán:

- **cada vuelta de sonda deja un `vite` huérfano.** El `taskkill` mata el
  `cmd.exe` y el nieto sobrevive —está escrito en `sondas/red.mjs` desde el
  27—, y **al cabo de una docena de vueltas el servidor deja de llegar a sus
  plazos**: picos de 1 657 ms donde antes había 0,36, y un «el servidor no
  contestó a 'lista'» que parece de la red y es de la máquina;
- **un clic que provoca su propia navegación necesita `noWaitAfter`.** Si no,
  Playwright espera a que la navegación se asiente con el manejador ya
  desprendido: «element was detached from the DOM, retrying»;
- **el estante no se llena de golpe.** El guion del vendedor va soltando
  `addstoreitem` a lo largo de varios pasos, así que leer las filas «un rato
  después» da 18 una vuelta, 16 la siguiente y 1 la de más allá. Se espera al
  **efecto** —a que dos lecturas seguidas den lo mismo—, no al reloj;
- y el intento de Beto **rehace el estante**, porque vuelve a correr el guion
  del vendedor. Así que la compra de Ana va antes que el `_busy` de Beto en el
  orden de la sonda, y eso no es cosmético: medía otra cosa.
