# Experimento 74 — el `.exe`, y la rama que nadie había ejecutado

El encargo era corto: *«falta compilar con .exe?»* — sí, faltaba — y después
*«si. procedamos»*.

Lo que no era corto es lo que había debajo. Empaquetar no era «añadir una
herramienta»: era **estrenar un camino**. Todo lo que se había probado de la
cáscara hasta aquí corría con Vite detrás, y el ejecutable no usa Vite en
ninguna parte.

---

## 1. Lo primero fue poder probar sin empaquetar

`escritorio/main.cjs` decidía así:

```js
const DESARROLLO = !app.isPackaged || argumentos.has("--dev");
```

O sea que la rama de producción **sólo se podía ejecutar empaquetando**. Cada
intento de depurarla costaba un empaquetado entero, y el error aparecía dentro de
un `.exe` sin consola. Eso no es depurar, es adivinar.

Se añadió `--produccion`, que la fuerza desde el proyecto. Y con él salió a la
luz un error que llevaba ahí desde el 72 y que hasta entonces no podía verse:

```js
// antes
const CONTENIDO = ... : DESARROLLO ? PROYECTO : dirname(app.getPath("exe"));
// ahora
const CONTENIDO = ... : app.isPackaged ? dirname(app.getPath("exe")) : PROYECTO;
```

**«Qué sirve los archivos» y «dónde vive el contenido del jugador» son dos
preguntas distintas**, y compartían respuesta por casualidad. En cuanto apareció
producción-sin-empaquetar dejaron de coincidir: `app.getPath("exe")` sin
empaquetar apunta a `node_modules/electron/dist/electron.exe`, y `build/` no está
ahí. Una condición correcta por accidente durante dos experimentos.

## 2. La rama de producción funcionó a la primera

Que no es lo habitual y conviene decirlo: `dist/` servido por
`escritorio/servidor.js`, mapa entero, **ni un 404**, ni un error de página. El
servidor del 72 estaba bien escrito y sus pruebas valían.

Ahora lo mide `npm run sonda:produccion`, **8 de 8**, y con ello la sonda de
escritorio deja de llevar ese hueco declarado como pendiente desde el 72.

## 3. El paquete

`electron-builder.config.cjs`, en un `.cjs` y no en `package.json` para que cada
decisión pueda llevar escrito su motivo. Las tres que importan:

| decisión | por qué |
| --- | --- |
| `files` es una **lista blanca** | Con una negra, el día que aparezca una carpeta nueva con contenido del juego se empaquetaría sola y nadie se enteraría |
| `target: "dir"`, sin instalador | Un instalador tendría que decidir dónde pone `build/`, y la respuesta correcta —«al lado del ejecutable, y lo trae el jugador»— es la que un instalador no sabe dar |
| `asar: false` | Ver abajo |

**`build/` no se empaqueta.** Es la regla de procedencia, no una preferencia de
empaquetado: meterlo dentro sería redistribuir el contenido de Master Sword, y el
permiso no está pedido. Queda fuera, al lado del `.exe`, que es además cómo se
reparte el original.

### Por qué sin asar

`servidor.js` sirve con `createReadStream` y responde `Range` leyendo el `size`
de un `stat`. Electron parchea `fs` para leer dentro de un `.asar`, pero es un
parche, y los `Range` a medio archivo son justo el terreno donde un parche se
comporta distinto. Se pagaría en un fallo intermitente de sonido dentro de un
`.exe` sin consola.

Lo que se gana activándolo —arranque algo más rápido, árbol menos visible— no
vale ese riesgo hoy. Si algún día se activa, **se activa midiendo el audio con un
`Range`**, que es lo que puede romperse, y ese control ya está escrito en
`sondas/produccion.mjs`.

## 4. Una lista blanca no basta para dejar fuera `node_modules`

Esto se midió, no se supuso, y es la trampa del apartado 4 de `CLAUDE.md` con
otra ropa.

Con `files` diciendo sólo `escritorio`, `dist` y `package.json`, el primer
paquete salió **con `node_modules` dentro**: `three` y
`@dimforge/rapier3d-compat`, **19 MB**. electron-builder añade las
`dependencies` de producción por su cuenta —para una aplicación de Electron
normal eso es lo correcto, su proceso principal las necesita—, pero aquí las dos
están **ya compiladas dentro de `dist/assets/index-*.js`**. Eran una segunda
copia que nadie importaba.

Hay que decir que no explícitamente (`"!node_modules/**/*"`). Y el comentario que
yo había escrito en la configuración afirmaba lo contrario —«la rama de
producción no usa un solo paquete de node_modules»—, así que **o mentía el
comentario o mentía el paquete**. Mentía el comentario: la frase era cierta sobre
lo que el código *necesita* y falsa sobre lo que el empaquetador *mete*.

*Lo destapó mirar el `resources/app/` del paquete, no releer la configuración.*
366 MB → 347 MB.

## 5. El `.exe`, medido

Con `build/` al lado por una unión de directorio —para no copiar el contenido— y
**sin `MSR_CONTENIDO`**, que es el camino exacto del jugador:

```
empaquetado: true
el juego arrancó dentro del .exe
menú: { pintura: true, quit: true }
aspecto de las ventanas: codice
mapa: edana
audio: contexto running, 10 fuentes arrancadas, 0 fallos
respuestas >=400: build/edana/adornosvivos.json
```

Ese 404 **no es del empaquetado**: `adornosvivos.json` está horneado para Gate
City y no para Edana, y tampoco está fuera del paquete. Es un hueco de contenido,
y se comprobó antes de descartarlo. La sonda lo nombra por su nombre para que un
404 nuevo no se cuele detrás de él.

## 6. Lo que salió mal y no era del proyecto

El primer empaquetado murió con `EPERM` renombrando `win-unpacked.tmp` →
`win-unpacked`, y la carpeta quedó **imposible de borrar**: `EBUSY` sobre
`resources/default_app.asar` durante minutos, con `rm`, con `rmSync` y con un
`rename`. Lo raro es que el archivo **sí se podía abrir para lectura y
escritura**, que es la firma de una sección mapeada en memoria —típicamente el
antivirus escaneando 344 MB recién extraídos—. No había ni un proceso de Electron
vivo; se comprobó.

No se peleó más: se empaquetó a otra carpeta y se siguió. **`empaquetado/` quedó
con un resto de 344 MB que hay que borrar a mano** (o que se soltará solo). Está
en `.gitignore` y en la lista `FUERA` de `test/procedencia.test.mjs`, así que no
ensucia nada más que el disco.

*Cuando algo del sistema operativo bloquea el trabajo, apartarlo es más barato que
vencerlo — y mucho más barato que convencerse de que es culpa del código.*

## 7. Cómo se usa

```bash
npm run exe            # vite build + electron-builder → empaquetado/win-unpacked/
npm run escritorio     # la cáscara con Vite detrás (desarrollo)
npm run escritorio:prod   # la cáscara con dist/ detrás, sin empaquetar
npm run sonda:produccion  # 8 controles sobre esa rama
```

Para repartirlo: la carpeta `win-unpacked` entera, y el jugador pone su `build/`
dentro. Sin firma de código —no hay certificado, y firmar con uno inventado es
peor que no firmar—, así que Windows avisará la primera vez. Eso es correcto.

## 8. El icono, que no se podía usar tal cual

`../MSC/assets/msr/game.ico` es el icono del juego —un orco, 32x32— y
electron-builder se niega en seco:

```
⨯ Icon must be at least 256x256 pixels, provided: 32x32
```

`tools/icono.mjs` lo amplía **x8 por vecino más cercano**, y eso no es una
elección de gusto: así **no se inventa un solo píxel**. Cada píxel del original
pasa a ser un cuadrado de 8x8 del mismo color, y los colores que salen son
exactamente los del archivo del juego. Cualquier interpolación —bilineal,
lanczos— produciría colores que no están ahí, y entonces el icono dejaría de ser
el suyo para ser una versión nuestra de él. Siendo contenido ajeno, esa
diferencia importa. (Y además queda bien: a bloques se lee como una decisión y
suavizado se leería como un error.)

Cae en `build/icono/`, con su `PROCEDENCIA.md` al lado, porque es contenido
derivado de un asset del juego y ahí es donde va todo eso. **No entra al
repositorio.**

Lo que hay que firmar, y no lo decide un archivo de configuración: un `.exe` con
este icono dentro **lleva incrustado un asset del juego**. Mientras no se
reparta, es lo mismo que leer `build/` del disco; en cuanto se reparta, es
redistribuir. Queda anotado en `electron-builder.config.cjs` para que la decisión
sea de alguien y no del olvido.

## 9. La limpieza de los restos de navegador

El port nació en el navegador y había dejado restos por toda la interfaz. En la
cáscara no son imprecisos, **son falsos**:

| dónde | decía | ahora |
| --- | --- | --- |
| pantalla de personajes | «Characters are saved in this browser» | «…on this machine» |
| aviso de guardado | «protected in this browser», «Clear browsing data» | la versión de máquina |
| `avisoDeReservadas` | «Ctrl+W closes the tab… Go fullscreen» | **nada**: no hay nada que avisar |
| `reservada()` | marcaba F11, F12, Ctrl+W como robadas | ninguna lo está |
| pantalla completa (F11) | «the browser keeps its shortcuts» | «Fullscreen.» |
| 6 razones de ajustes | «a browser tab is already a window», … | ciertas en los dos sitios |

El de `avisoDeReservadas` es el que más duele, porque **la promesa estaba escrita
y la línea que la cumple no**. La cabecera de `escritorio/precarga.cjs` lo decía
desde el 72: *«en escritorio no se queda ninguna, así que esos avisos sobran — y
un aviso que no es verdad es peor que no avisar»*. Dos experimentos diciéndolo y
nadie comprobándolo: la trampa del 64, el comentario que describe lo que alguien
quiso hacer y no lo que hace el código.

Las razones de los ajustes **no se partieron por plataforma**: se reescribieron
para ser ciertas en los dos sitios. «the resolution follows the window size;
nothing here resizes the window yet» es verdad en un navegador y en la cáscara, y
además deja de echarle la culpa a quien no la tiene — el límite no era el
navegador, era que nadie lo ha cableado.

### El control que lo vigila

No es un `grep` sobre los fuentes, y la diferencia importa: lo que cuenta no es
lo que hay escrito sino **lo que acaba en pantalla**. Una cadena puede estar en el
código y no enseñarse nunca, y otra puede componerse de dos trozos que por
separado no dicen «browser».

Así que `sondas/escritorio.mjs` barre el DOM entero —textos y `title`— buscando
`browser` o `tab`, con su control positivo al lado (**82 nodos leídos**; sin él,
un `querySelectorAll` que no encontrara nada daría verde con la pantalla llena de
menciones). Roto a propósito devolviendo una sola frase, sale rojo y la nombra.

## 10. Lo que queda

- **`asar: true`**, si alguna vez interesa, con el control de `Range` delante.
- **Que el `.exe` entre en una sonda**, hoy declarado pendiente: pide
  `npm run exe` y varios minutos, así que haría falta decidir que vale la pena.
- **El `README`**, que todavía no cuenta que esto se puede ejecutar sin Node.
