# 32 · Character Info, y con él los cuatro paneles

El último. `CStatPanel`, de `vgui_stats.cpp`: el de la **P** —`bind "p"
"playerinfo"`, `config.cfg:24`— y el que enseña quién eres.

---

## 1. `m_NoMouse`, que es la decisión que había que copiar bien

```cpp
m_NoMouse = true;
SetBits(m_Flags, MENUFLAG_CLOSEONESC | MENUFLAG_TRAPSTEPINPUT);
                                     vgui_stats.cpp:75-81
```

De los cuatro paneles, **éste es el único que no te quita el control del
personaje**. La hoja se lee sin soltar el puntero: puedes mirarte las
habilidades mientras sigues girando la cámara y andando. Los otros tres
congelan.

Copiarlo al revés no daría un error ni una pantalla fea: daría una hoja que te
para en seco en medio de una pelea. Y el control que lo mide **necesita su
contrario para valer**, así que la sonda hace las dos cosas: con la hoja
delante anda **4,95 m** en 1,2 s, y con el inventario delante —que no tiene
`m_NoMouse`— anda **0,0 cm**. Sin el segundo, el primero estaría igual de verde
si `m_NoMouse` no existiera.

Y de ahí sale la otra bandera: no tiene `TRAPNUMINPUT` sino `TRAPSTEPINPUT`. La
habilidad se elige con **RePág y AvPág**, no con los números, y el panel lo dice
en pantalla — «Use PGUP/PGDN to view skill info.» (`vgui_stats.cpp:156`). Con los
números atrapados, cambiar de arma con el `1` mientras miras la hoja dejaría de
funcionar, y eso sí se nota jugando.

---

## 2. Dos columnas y un panel FUERA de la ventana

```cpp
#define MAINWINDOW_X          XRES(40)      #define TITLE_GENINFO_X   XRES(12)
#define MAINWINDOW_SIZE_X     XRES(330)     #define TITLE_SKILLS_X    XRES(148)
#define MAINWINDOW_SIZE_Y     YRES(270)     #define MAINBUTTON_SIZE_Y YRES(16)

m_InfoPanel->setPos(ix + MAINWINDOW_SIZE_X + XRES(16), iy);
m_InfoPanel->setSize(SKILLINFOPANEL_SIZE_X, YRES(96));
m_InfoPanel->setBorder(new LineBorder(2, Color(0, 128, 0, 0)));
                                     vgui_stats.cpp:40-53, 164-167
```

El panel de la habilidad **no está dentro de la ventana**: va pegado a su
derecha, dieciséis píxeles más allá, con su propio marco verde. Y ese verde lleva
alfa 0, o sea opaco desde el primer fotograma, sin desvanecido — al revés que el
borde del menú de interacción, que entra con los 0,5 s.

---

## 3. El esquema roto, que aquí sí aparece

Este panel usa `g_FontID`, que es el esquema **«ID Text»**. Y «ID Text» es el
último de los cuatro `*_textscheme.txt`, o sea el que se queda sin sus valores
por defecto por el fallo del lector del motor que el experimento 29 dejó
portado con su prueba. En el original su color acaba siendo lo que hubiera en
memoria.

Aquí se pinta blanco, y es **la única parte de ese fallo que no se copia**: un
panel cuyo texto no se ve no es fidelidad, es un panel roto. Está dicho en
`src/vgui/esquema.js` y comprobado en `test/vgui.test.mjs`.

---

## 4. Un fallo del reparto de teclas, y una hoja que decía que no tienes vida

**RePág y AvPág no llegaban al panel.** En `src/main.js` esas dos teclas iban
directas a la consola de sucesos, antes que nada. Y el orden del motor es el
contrario:

```cpp
if (m_pCurrentMenu && ...GetScrollForStepInput()) { ...la barra... }
else if (m_pCurrentMenu && m_Flags & MENUFLAG_TRAPSTEPINPUT) StepInput(...);
else if (!m_pCurrentMenu) HUD_StepInput(ScrollCmd);
                                     vgui_teamfortressviewport.cpp:2215-2236
```

La consola es **la última de las tres**, y sólo si no hay panel. Estaba la
primera, así que Character Info no cambiaba nunca de habilidad.

**Y la hoja decía «Health: 0».** Las claves de `derivadas()` son `vidaMax`,
`manaMax` y `aguanteMax`, no `vida`, `mana` y `aguante`. Con los nombres mal el
panel enseñaba **tres ceros** mientras el HUD, tres centímetros más abajo, decía
15/15, 20/20 y 7/7. No dio ningún error y ningún control lo cazó: se vio
**mirando la captura**. Ahora hay un control que lo mide —«ninguno sale a cero
teniendo el HUD números de verdad»— porque un panel que lee mal el estado del
jugador es exactamente el fallo que este panel puede tener.

---

## 5. Lo que se mide

```
npm test                 819 comprobaciones
npm run sonda:hoja32     13 de 13
```

Las **dieciocho** sondas en verde, **487 controles**.

---

## 6. Los cuatro paneles, y lo que queda

| | panel | de | estado |
| --- | --- | --- | --- |
| 29 | menú de interacción (**F**) | `vgui_menu_interact.h` | portado |
| 30 | crear personaje | `vgui_choosecharacter.cpp` | portado |
| 31 | inventario (**I**) | `vgui_container.cpp` | portado |
| 32 | Character Info (**P**) | `vgui_stats.cpp` | portado |

Con el kit debajo: `esquema.js`, `widgets.js`, `registro.js`, `menubase.js`.

**Lo que NO está hecho de este panel:**

- **la barra de desplazamiento.** El original mete las dos columnas en un
  `CTFScrollPanel` porque con muchas habilidades no caben. Aquí las nueve caben
  en los 270 de alto y la barra no se ha hecho.
- **el detalle de la habilidad enseña cinco propiedades como mucho**, y la magia
  tiene cinco escuelas que no son propiedades: se ven, pero sin la distinción
  que sí hace la hoja suplente de `src/juego/interfaz.js`.
- **los modificadores** (`Nat_StatModsLabel`), que en el original están dentro de
  un `#if 0` — o sea que en el juego tampoco se ven. Se deja igual.

**Y lo que queda de la interfaz vieja**, a propósito: `src/juego/interfaz.js`
conserva la pantalla de personajes y la hoja como **suplentes** —si los paneles
no están montados, porque falte `build/gatecity/`, el jugador tiene que poder
elegir un personaje y mirarse—, más las cosas que MSR no tiene: exportar e
importar el guardado, la lista de servidores y las opciones de teclas.
