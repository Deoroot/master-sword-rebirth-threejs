# 31 · El inventario, y una sonda que medía otro proyecto

El tercero de los cuatro paneles. Y el único que no era una traducción torpe del
original, sino **una cosa que nos inventamos entera**.

---

## 1. La rejilla se ha ido

Lo que había era una rejilla estilo Diablo de 10×6, con una huella por objeto
sacada de su `size`. Estaba declarada como nuestra desde el primer día, en la
cabecera de su propio archivo:

> «La rejilla es **nuestra**, y es la primera decisión de este proyecto que se
> aparta del original a propósito.» — `src/juego/inventario.js`

Master Sword no tiene rejilla. Tiene una lista de hasta cien objetos
(`NUM_MAX_ITEMS 100`) y dos manos, y lo que limita es el peso. Su inventario son
**cuatro piezas**, y las cuatro están medidas en las macros de `vgui_container.h`:

| pieza | medida | qué es |
| --- | --- | --- |
| `GEARPNL` | `XRES(5), YRES(50)`, `YRES(80)×YRES(235)` | el equipo: lo que llevas puesto y tus contenedores |
| `ITEM_CONTAINER` | a su derecha, **lo que sobre** × `YRES(340)` | lo que hay dentro, con su barra |
| `INFOPANEL` | debajo del oro | el objeto señalado: nombre, peso, cantidad, calidad |
| `ACTBTN` | `XRES(130)×YRES(30)`, abajo a la derecha | la acción |

`src/juego/inventario.js` pasa de 96 líneas a 19: se queda con la regla del
peso, que ésa sí es del juego —`Volume() = min(STR × 25 + 25, 2000)`— y pierde
`BANDAS`, `huellaDe()`, `colocar()`, `ANCHO` y `ALTO`.

### Dos medidas que están raras, y se portan

**`GEARPNL_SIZE_X` es `YRES(80)`.** El ANCHO de la columna del equipo se calcula
con la escala **vertical**. En 4:3 da lo mismo; a 1200×800 la columna mide 133
píxeles donde `XRES(80)` habría dado 150. La sonda lo mide y lo dice.

**Y el contenedor no tiene ancho propio**: `ScreenWidth − (x + 5)`, o sea todo lo
que quede hasta el borde. Por eso en una pantalla ancha el inventario de Master
Sword se ve tan vacío — y aquí también, porque es el suyo.

---

## 2. Y AHORA LO IMPORTANTE: una sonda estaba midiendo otro proyecto

Esto es lo que más vale de este experimento, y no tiene que ver con el
inventario.

Al comprobar que la rejilla se había ido, `sonda:cuerpo` seguía encontrándola:
**61 casillas**, y el `outerHTML` decía `<h2>Inventory — Retrato</h2>`. Un texto
que **no está en el código**. Se buscó en `src/`, en `dist/`, en la caché de
vite, en procesos zombi. Nada.

Lo que pasaba:

```js
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"],
                  { shell: true, stdio: "ignore" });
```

`--strictPort` hace que vite **falle** si el puerto está cogido. Y
`stdio: "ignore"` hace que ese fallo no se vea. Entonces el Chromium abre
`http://localhost:5196` y le contesta **el que ya estaba** — que era un `vite` de
**«Mydra Web Lab»**, la carpeta de la que salió este port, levantado al principio
de la sesión para comprobar que el laboratorio seguía funcionando tras la
mudanza.

O sea que `sonda:cuerpo` estuvo **veintinueve controles en verde midiendo el
proyecto viejo**. Las pantallas que este experimento acababa de retirar seguían
apareciendo, y con toda la razón: eran las de la otra carpeta.

Lo que salva la cara: las dos únicas sondas inmunes eran `red.mjs` y `ia28.mjs`,
que ya traían un `liberarPuerto()` porque levantan además un servidor de partida
y ahí un puerto ocupado se nota en seguida. La solución estaba escrita en el
proyecto y no se había generalizado.

**Ahora está en `sondas/mismo.mjs` y la usan las veintiséis**, con dos capas:

- `liberarPuerto(puerto)` mata a quien esté antes de arrancar el nuestro;
- `esNuestro(pag, puerto)` comprueba el `<title>` de la página y **aborta** si no
  es el de este proyecto. No avisa: aborta. Una sonda que sigue después de eso da
  números de otro programa con nuestras etiquetas encima, que es la peor salida
  posible.

Y el efecto colateral: `sonda:cuerpo` hubo que rehacerla, porque conducía las
pantallas viejas. Ahora conduce el panel del 30 y la hoja, y baja de 29 controles
a 20 — los nueve que se van son de la rejilla y viven en `sonda:inventario31`.

---

## 3. Y un fallo de este experimento: una tecla, dos dueños

Con el panel montado, la `i` la atendían **los dos**: el registro de VGUI en
`main.js` y el escuchador de `src/juego/interfaz.js`. El primero abría el panel y
el segundo lo cerraba, en la misma pulsación. El inventario aparecía y
desaparecía sin que nada fallara, y en el DOM se quedaba montado y escondido — o
sea que `querySelectorAll` lo encontraba y todas sus medidas eran cero. **Cinco
controles en rojo por esto.**

La regla que queda escrita: **una tecla, un dueño.** Si hay panel, el dueño es el
registro.

---

## 4. Lo que se mide

```
npm test                       819 comprobaciones
npm run sonda:inventario31     13 de 13
```

El primer control no es «¿sale el panel?» sino **«¿se ha ido la rejilla?»**: un
panel nuevo encima del viejo, con los dos respondiendo a la `i`, sería peor que
no haber tocado nada.

Y los dos que miden las medidas raras: la columna mide **133 px**, que es
`YRES(80)` y no `XRES(80)`=150; y el contenedor mide **1 022 px**, que es lo que
sobra y no un número propio.

Las dieciséis sondas en verde, **474 controles**, y por primera vez con la
certeza de que todas están mirando este proyecto.

---

## 5. Lo que NO está hecho

- **No hay contenedores.** MSR da cuatro de partida (`reg.newchar.freeitems`: dos
  vainas, una funda de daga y un zurrón) y aquí la columna del equipo tiene una
  sola entrada, «Pack», que es todo lo que llevas. El botón de acción lo dice en
  vez de no hacer nada.
- **Los iconos van a tamaño completo**, 128×128, y por eso caben cuatro objetos
  en pantalla. Es lo que hace el original con `ms_invtype 0`; falta hornear
  `640_allitems_small.spr` y honrar ese cvar, que es justo para lo que existe.
- **No se puede arrastrar** un objeto de un contenedor a otro
  (`VGUI_MoveItemPanel`), ni ponerse una armadura desde aquí.
- Y queda **32 Character Info**, el último.
