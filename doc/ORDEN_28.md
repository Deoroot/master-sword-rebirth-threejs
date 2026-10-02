# 28b · El orden y el idioma

> «también después después, refactorizar un poco el código. veo que estamos
> añadiendo todo en archivos grandes, talvez sea necesario separar las cosas
> para que sea mejor mantenible en el futuro. y cambiar el idioma a inglés para
> la interfaz, que la la dejamos en español»

Dos encargos y una cosa que había que hacer antes de tocar nada.

---

## 0. Lo primero: control de versiones

**Este proyecto no tenía `git`.** Llevaba veintiocho experimentos y estaba en el
pendiente desde hace tiempo, y mientras eso fuera verdad un refactor mecánico de
dos mil líneas no se podía deshacer. Así que antes de mover una coma:

```
git init · 296 archivos · b7b8bad «experimento 28: los bichos pasan al servidor»
```

`build/`, `node_modules/` y `dist/` fuera, como ya decía `.gitignore`. Los tres
pasos de abajo son tres commits, así que cualquiera se puede deshacer solo.

---

## 1. `main.js`: de 5 253 líneas a 2 878

No se ha reescrito nada. Se han sacado **dos cosas que no son el juego**.

### La sonda: 2 045 líneas, el 45 % de `mainGateCity`

`window.probe` es la puerta por la que trece sondas miden el juego desde un
Chrome de verdad. Es imprescindible y no es el juego: quien abría `main.js` para
tocar la física se encontraba primero con el aparato de medirla.

Ahora vive en **`src/dev/sonda.js`**, y baja por un **saco de captadores**:

```js
window.probe = montarSonda({
  get bichos() { return bichos; },
  get reloj()  { return reloj; },  set reloj(v) { reloj = v; },
  …116 nombres
});
```

Captadores y no copias, y eso no es ceremonia: medio juego vive en variables que
se reasignan —el arma en la mano, el escudo, la sesión, las cuentas de golpes y
muertes—. Con una copia, `probe.estado().muertes` habría devuelto **0 para
siempre** y ningún control lo habría dicho: la sonda mide el juego y nadie mide
la sonda.

Los `set` son exactamente cuatro (`reloj`, `relojLuz`, `rosa`, `running`), que
son los cuatro nombres a los que la sonda escribe de verdad. Salieron de
preguntárselo al árbol, no de adivinar — y el primer intento, que los dedujo del
`let` de la declaración, se dejó `reloj` fuera porque hay un `const reloj` en
otro ámbito del mismo archivo. La sonda del escudo lo cazó en el acto:
*«Cannot set property reloj of #\<Object> which has only a getter»*.

**La extracción se hizo con un analizador de verdad**, `rollup/parseAst`,
resolviendo los ámbitos uno a uno: qué nombre es local del probe, cuál es de
`mainGateCity`, cuál es una importación (ésas se importan de verdad en el
módulo nuevo, 22 de 13 módulos) y cuál es una propiedad taquigráfica `{ x }`
que hay que abrir a `{ x: S.x }`. A golpe de expresión regular esto habría
tocado comentarios y cadenas.

### El mirador: `main.js` tenía DOS programas dentro

`?map=pueblo`, `?map=corinth`, `?map=colina` y `?map=jharro` son el banco de
pruebas de los experimentos 01 a 09: el lector de `.map`, el terreno generado,
el kit CC0 y el jharro. Tienen su propio bucle, su propia escena y **su propio
`window.probe`**, y no comparten con Gate City más que nueve constantes del
arranque.

Estaban debajo de las 2 600 líneas del juego, en el mismo archivo. Ahora son
**`src/mirador.js`**, y se cargan **bajo demanda**:

```js
if (GATECITY_LEVEL) return mainGateCity();
const { mirarMapa } = await import("./mirador.js");
```

Así que jugando a Gate City ese módulo **ni se descarga**: el `GLTFLoader`, el
kit y el generador de terreno son suyos y el juego no los usa.

Y con eso quedaron **25 importaciones sin usar** en `main.js`, que también se
han ido (localizadas con el mismo analizador, no a ojo).

| | antes | ahora |
| --- | --- | --- |
| `src/main.js` | 5 253 | **2 878** |
| `src/dev/sonda.js` | — | 2 094 |
| `src/mirador.js` | — | 512 |

### Lo que NO se ha hecho, y por qué

`mainGateCity` sigue siendo una función de 2 600 líneas. Partirla de verdad no
es mover texto: hay que sacar el estado compartido —el arma, el escudo, la
sesión, las quince cuentas— a un objeto explícito que las piezas se pasen. Eso
es un experimento propio, no «un poco», y hacerlo a medias deja algo peor que lo
que hay. Está dicho aquí para que sea una decisión y no un olvido.

---

## 2. La interfaz, en inglés

Y no es sólo un encargo: **es lo fiel**. Master Sword está en inglés y sus
propias cadenas ya estaban aquí sin traducir (`parried!`, `has fallen!`,
`Players cannot attack while shield is active`). Media interfaz decía una cosa
en un idioma y la de al lado en otro.

Se ha traducido **lo que el jugador lee** y sólo eso:

| dónde | qué |
| --- | --- |
| `src/juego/interfaz.js` | la lista de personajes, crear, la hoja, el inventario, la muerte, las opciones (69 cadenas) |
| `src/juego/teclas.js` | los nombres de las 33 acciones y los de las teclas (`Left Shift`, `Middle Mouse`) |
| `src/main.js` | los 24 mensajes del HUD y las 9 líneas de carga |
| `src/play/menu.js`, `menums.js` | por qué una entrada del menú está apagada |
| `src/juego/personaje.js`, `almacen.js` | los errores que el jugador puede provocar |
| `index.html` | el cascarón de la sonda 03 |

**Los nombres de las acciones salen de `gfx/shell/kb_act.lst`**, que es el
archivo del propio juego: `Move Forward`, `Secondary Attack`, `Swap Hands`,
`Quickslot 1`, `Shift Quickslots +12`. No se han inventado.

Lo que **no** se ha traducido, a propósito: los comentarios, la documentación,
los `throw` que sólo ve quien programa (*«una sesión necesita un almacén»*), los
`console.*`, las sondas y los nombres de las cosas del motor.

### La prueba que lo mantiene

Traducir es fácil una vez. Lo que no es fácil es que dentro de tres
experimentos, con el mensaje número 25, no se cuele un `«Has fallado»` — porque
**una cadena en español en la interfaz no da ningún error**: se cuela, nadie la
ve hasta que alguien juega, y para entonces hay cuatro.

`test/idioma.test.mjs` recorre los nueve módulos que pintan, saca sus cadenas
con el analizador y busca marcas de español. Lo interesante es **cómo decide qué
mirar**, que costó la primera vuelta: mirar todas las cadenas de un archivo no
sirve. `"inventario"` es a la vez una etiqueta de botón y el nombre de una
acción del teclado; `"mx-armas"` es una clase de CSS; `"hechizo"` es un tipo de
objeto del catálogo. **Lo que las distingue no es su texto: es dónde se usan.**

Así que se buscan por el sitio: el valor de `texto:`, `title:`, `html:`,
`placeholder:`, `alt:`, `nombre:`; lo que se asigna a `.textContent`; y lo que
se le pasa a `alert()`, `say()` y `suceso()`. Y se podan de raíz `throw` y
`console.*` — un `throw` en español no aparece **porque es un `throw`**, no
porque su texto se parezca a otra cosa.

Lleva su control positivo, que es la parte que hace que valga: la prueba
comprueba que caza «Hoja de personaje» y «Maná», y que **no** se pone nerviosa
con «Character Sheet», «Quickslot 3» o «Secondary Attack». Sin eso, lo único
que diría es que se ejecuta.

---

## 3. Dos fallos de las sondas que aparecieron por el camino

Ninguno de los dos es del juego, y los dos valen lo mismo que uno que lo fuera.

**`text=create` de Playwright casa por SUBCADENA y sin distinguir mayúsculas.**
La pantalla de crear personaje dice `<code>CreateChar()</code>` en su párrafo de
explicación, así que el clic se iba a un trozo de texto y no al botón. Antes no
pasaba porque el botón decía «crear». Arreglado con `button:text-is("create")`,
que es exacto.

**`npm run sonda:red` terminaba con un `ReferenceError` desde el 27.** Su
`const errores = []` estaba **dentro** del `try`, y la última línea del archivo
—la que decide el código de salida— está fuera del bloque. O sea que imprimía
sus «21 de 21 · errores de página: ninguno», que es lo que se leía, y acto
seguido se caía. **El código de salida llevaba un experimento entero sin
significar nada.**

---

## 4. Lo que se mide

```
npm test              1 070 comprobaciones (eran 1 021 al empezar el 28)
npm run sonda:ia28    15 de 15   los bichos del servidor, dos navegadores
npm run sonda:red     21 de 21   la red del 27, intacta
npm run sonda:cuerpo  29 de 29   la interfaz entera, en inglés
npm run sonda:ranuras 39 de 39   el menú y las ranuras
npm run probar        corinth, jharro y pueblo siguen abriéndose
```

Y las demás sin tocar: mundo 40, consecuencias 44, pulido 38, hud 36, arco 35,
escudo 34, mapa 30, sonido 22, ia 15, golpe 25.

Una nota honesta sobre `sonda:escudo`: **es inestable desde antes de esto** —da
33 o 34 según la vuelta—. El control que falla es el de la contabilidad de los
golpes de un goblin de verdad (`bloqueos + desvíos + fuera del cono ===
recibidos`), y le falta una casilla: los golpes que entran fuera del cono cuando
el escudo está entre dos estados no caen en ninguna de las tres. No es de este
trabajo y no se ha tocado, pero queda escrito.
