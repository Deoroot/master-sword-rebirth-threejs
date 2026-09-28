# 36 · Por dónde se entra al juego

**Qué se pidió:** *«basicamente ahora empezamos directo en gatecity, en el juego
original tu o creas un servidor local con establish a kingdom o un servidor
dedicado con hlds y visit a kingdom abre el server browser […] y si le das escape
para ver el menu vez que los botones de buscar servidor y crear uno local estan
desactivados.»*

**Estado:** el juego arranca en el menú principal, «Establish a Kingdom» abre
«Create Server» y su «Start» entra a jugar, y «Visit a Kingdom» encuentra de
verdad el servidor del experimento 27. **978 pruebas de Node**, `sonda:arranque36`
12/12, `sonda:vgui2_34` 26/26, y las cinco sondas vecinas sin tocar.

---

## 1. El hallazgo: el juego ya hacía «Establish a Kingdom», a escondidas

Lo que había no era «falta el menú»: era que **el menú estaba, y el juego se lo
saltaba**. Arrancar directo en Gate City **es** montar una partida local, que es
lo que hace «Establish a Kingdom». Lo que faltaba era que alguien lo pidiera.

Y los dos caminos del original ya estaban construidos desde antes:

| en el original | aquí, y desde cuándo |
| --- | --- |
| **Establish a Kingdom** → *listen server* local | lo que pasaba solo al cargar la página |
| **Visit a Kingdom** → navegador → hlds | `npm run servidor`, experimento 27 |

O sea que este experimento no ha construido maquinaria: le ha puesto la puerta a
la que ya había. Eso explica por qué sale barato.

---

## 2. `?map=` es la línea de comandos, y por eso no se rompió ninguna sonda

Saltarse el menú también es del juego: `hl.exe -game msc +map <mapa>` entra sin
pasar por él. Aquí eso es `?map=`.

Y el parámetro **ya estaba escrito en las veinte sondas** —todas cargan
`/?map=gatecity`— aunque `main.js` no lo leía: sólo miraba `?red`. Darle el
significado que tiene en el original costó dos líneas y **no tocó ni una sonda**.

Es el tipo de coincidencia que conviene decir en voz alta en vez de presumir de
ella: no se planeó, estaba ahí.

---

## 3. «Create Server», la tercera ventana

`src/vgui2/crearservidor.js`, con la misma regla que las otras dos: el esquema y
las cadenas son hechos, la disposición está medida de la captura.

Lo que sí se pudo leer esta vez son **los valores**, y en el código del mod:

```cpp
cvar_t msallowtimevote    = {"ms_allowtimevote",   "1", FCVAR_SERVER};
cvar_t ms_pklevel         = {"ms_pklevel",         "0", FCVAR_SERVER}; // 1 == in town only
cvar_t ms_central_enabled = {"ms_central_enabled", "0", FCVAR_SERVER};
                                     svglobals.cpp:42, 51, 67
```

En la captura «Allow time change votes» sale **marcada**, «Allow Player vs
Player» **sin marcar** y «Enable Central Server» **sin marcar**. Tres de tres.
Que tres cuadren es lo que permite portar los demás sin poder comprobarlos uno a
uno.

### El que no cuadra, y el que no sé

- **`ms_reset_time` vale 10 y la ventana enseña 30** (svglobals.cpp:45). O sea
  que el valor por defecto del diálogo no es el del cvar: `GameUI` escribe el
  suyo. Manda lo que ve el jugador y el cvar queda apuntado al lado.
- **«Store Characters» sale como «3 On Server»** y el cvar que se le parece,
  `ms_serverchar`, vale "1" y no explica el 3. Se porta con el texto de la
  captura y **sin atarlo a ningún cvar**: escribir uno adivinado sería peor que
  decir que no se sabe.

### La lista de mapas dice la verdad

El original lista los ciento y pico `.bsp` del juego —en la captura se ven
`aleyesu`, `aluhandra2`, `ara`, `b_castle`…—. Aquí hay **uno** portado, y la
lista enseña uno. `< Random Map >` se queda porque con un solo mapa sigue siendo
verdad.

### Y una fila que es nuestra, declarada

«Play in full screen (web port only — lets the game keep Ctrl+W)». No está en la
captura y no es de Master Sword; se declara igual que ALT y ALT GR en
`teclas.js`. Hay una prueba que exige que sea **la única** con esa marca.

Está en esta ventana y no en «Options» por una razón técnica: pedirle el teclado
al navegador **sólo funciona dentro de un gesto del usuario**
(`src/juego/navegador.js:139-171`), y el «Start» es un clic. Por eso el manejador
del botón pide la pantalla completa **antes de cualquier `await`**: un `await`
delante pierde el gesto y el navegador la rechaza sin decir por qué.

---

## 4. La pestaña «Lan» encuentra el servidor de verdad

`npm run servidor` publica su resumen en `/partidas`, y `Partida.resumen` ya trae
`nombre`, `mapa`, `jugadores` y `max`: cuatro de las cinco columnas del
navegador. Va en **«Lan»** y no en «Internet» a propósito — un servidor que está
en tu máquina y que el maestro no conoce es exactamente lo que en Master Sword es
un servidor de LAN.

La latencia se deja **en blanco** en vez de inventarse un número: medirla de
verdad es abrir el socket.

---

## 5. Tres fallos que encontró la sonda

1. **Un control mío salía verde midiendo nada.** «Establish a Kingdom se puede
   elegir» miraba `disabled`, y el menú no usa `disabled`: marca las apagadas con
   `data-sirve="no"` (`menums.js:136`). Daba `false` en las dos, así que el
   control estaba en verde **con la entrada apagada**. Lo destapó el control de
   al lado, que esperaba una ventana y no la tenía.
2. **La Escape cerraba la ventana entera con un desplegable abierto.** En el
   juego cierra la lista y la ventana se queda. Se vio porque la sonda abría la
   lista de mapas, pulsaba Escape y la pestaña siguiente ya no existía.
3. **El logotipo estaba arriba y en el juego va abajo.** «MASTER SWORD / art by
   Anders Finér» se comía «Visit a Kingdom». Llevaba mal desde que se portó el
   menú y no se notaba porque al menú sólo se llegaba con la Escape, con el juego
   detrás; en cuanto el menú es la primera pantalla, salta a la vista.

El tercero es el más instructivo: **no lo encontró una prueba, lo encontró
mirar la captura de la sonda al lado de la del juego.**

---

## 6. Lo que queda

1. **Los ocho ajustes vivos de «Options», aplicados de verdad.** La ventana ya
   los reúne y los entrega en `alAplicar`; falta que el brillo y la gamma entren
   en `src/bsp/gamma.js` y el volumen en `src/play/audio.js`.
2. **Conectarse a la partida de «Lan» desde la ventana.** Hoy «Connect» recarga
   la página con `?red=`, que funciona pero es un rodeo: lo suyo es que el
   cliente del 27 se enganche sin recargar.
3. **Que los ajustes de «Create Server» hagan algo.** De los doce controles, uno
   funciona. No es un olvido: `maxplayers` necesita cuentas, `ms_reset_time`
   necesita que el mapa se reinicie —y no se reinicia, `doc/MISIONES_33.md` §8— y
   `sv_password` no protege nada que se pueda alcanzar desde fuera.
4. **Keyboard Lock, comprobado en un Chromium a pantalla completa.** El
   experimento 35 lo dejó dicho y sigue sin sonda.

---

## 7. Dónde se puede haber medido mal

- **Las dos pestañas de «Create Server» salen de una sola captura cada una**, y
  la de Game tiene once filas con desplazamiento: lo que quede por debajo del
  corte no lo ha visto nadie.
- **«Store Characters»**, que ya está dicho: tres opciones leídas de un
  desplegable cerrado. Puede tener más.
- **La pestaña «Lan» no se ha visto nunca con dos servidores**, porque
  `npm run servidor` levanta uno por proceso.
- **El control positivo del arranque** comprueba que con `?map=` no sale el menú.
  No comprueba que `?map=otracosa` haga algo distinto, porque no hay otra cosa.

---

## Cómo se corre

```bash
npm run servidor            # y entonces la pestaña «Lan» encuentra algo
npm test                    # 978 pruebas
npm run sonda:arranque36    # 12 controles: la única sonda que carga SIN ?map=
npm run sonda:vgui2_34      # 26 controles
```
