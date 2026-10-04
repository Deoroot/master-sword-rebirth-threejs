# El brillo en el modelo del otro, y las imágenes del HUD — experimento 95, pieza E

Dos pendientes del 93 (doc/EFECTOS_RED_93.md §5.2 y §5.4):

1. `effect glow` se leía, se contaba y **no se dibujaba**. El envenenado no
   tiene que verlo (primera persona); lo ven los demás sobre su modelo, y este
   puerto no lo pintaba en el modelo de nadie.
2. `hud.addimgicon` y `hud.killimgicon` seguían apuntados como comandos que no
   se saben hacer.

```bash
node --test test/brillo95.test.mjs     # 33 verdes
npm run sonda:brillo95                 # un jugador + dos contra servidor: 16 de 16
npm run hud                            # hornea también gfx/vgui/*.tga (49)
```

## 1. Lo medido antes de escribir

**El brillo no es un mensaje.** `CEntGlow::SetGlow` escribe tres campos de la
ENTIDAD (mseffects.cpp:340-344): `renderfx = kRenderFxGlowShell` (19,
const.h:706), `rendercolor` y `renderamt`. Viajan en su estado
(`AddToFullPack`, server/client.cpp:2313-2318) a todos los que la tienen
delante, en 8 bits: `renderamt` y `renderfx` como `DT_INTEGER, 8` y el color
como `DT_BYTE, 8` (assets/msr/delta.lst, `entity_state_player_t`). El
`renderamt` es un `float` en `pev` y un `int` en `entity_state_t`
(common/entity_state.h:53): **trunca**.

**Cómo lo pinta el cliente.** `R_StudioRenderModel` (xash3d-fwgs
ref/gl/gl_studio.c:3147-3168, y la copia del mod en
client/render/studiomodelrenderer.cpp:2351-2371) dibuja el modelo dos veces;
la segunda con `STUDIO_NF_CHROME` forzado, que es:

- **aditiva**: `kRenderTransAdd` (:3065) = `GL_ONE, GL_ONE` y sin escribir
  profundidad (:3005-3010);
- **empujada por la normal**: `shellscale = max(1/128, renderamt/128)`
  unidades (:2292-2293) y `VectorMA(av, scale, lv, vert)` (:1990);
- **del color de la entidad a alfa 255** (`pglColor4ub`, :1991), multiplicado
  por la textura `sprites/shellchrome.spr` (`cl_sprite_shell`,
  engine/client/cl_tent.c:57) con coordenadas de cromo.

Consecuencia que no se ve leyendo el guion: **`renderamt` no apaga el color,
sólo adelgaza la cáscara.** El veneno pone `72 EFFECT_DURATION EFFECT_DURATION`
—desvanece desde el primer instante (`FadeStartTime = inicio`, :374)—, y aun así
se ve del mismo verde hasta el final: a 0,56 unidades de separación al
principio y a 1/128 al final. Se va de golpe cuando `Think` pone
`kRenderFxNone` (:367-372).

**`hud.addimgicon` en los 2 884 guiones**: **15 líneas en 2 archivos** —13 en
`player/externals.script` (la epilepsia `ext_epilepsy_time_begin`/
`epilepsy_loop`, el marcador del fútbol `extsoc_show_scores`/`extsoc_flash_win`
y `ext_hud_icon`) y 2 en `monsters/gabe_newell.script`—. `hud.killimgicon`: 1
línea (`items/armor_rehab.script:114`, con su propio comentario «no workie»).
**Ninguno se dispara en un mapa portado**: los llaman la pelota de
`ms_soccer/soccer_ball.script` (:346, :355, :428, :532) y el maestro del juego
en `gm_epilepsy_begin` (game_master.script:1527) y en el modo de inocentes
(:1423). Ningún EFECTO los usa, que es lo que dijo el 93; el guion del jugador
sí.

## 2. Lo portado, con cita

**El brillo** — regla en `src/play/brillo.js` (sin Three):

- `estadoDelBrillo`: lo que va en la foto, `{ fx: 19, color, cantidad }`, con
  los dos truncados del cable. Sale de `cantidadDelBrillo` (el `Think` del 93)
  y se apaga si el objetivo muere (MiB DEC2007a, :367).
- `brilloDeLaEntidad`: cada `effect glow` crea su `CEntGlow` (:923) y todos
  escriben la MISMA entidad; manda el más nuevo de los vivos (SUPUESTO: el
  motor piensa las entidades por índice y la nueva tiene el mayor; no medido).
  Medido en la prueba: el segundo mordisco de la rata a los ~5 s pone un
  segundo brillo y la cantidad SUBE de 59 a 68.
- `separacionDeLaCascara`, `cascaraDe`: lo que dibuja el cliente.
- `mismoBrillo`: para la compresión delta de la foto.

**El servidor** (`src/red/partida.js`): `_pantalla` apunta cada brillo en el
cliente (`c.brillos`, con la hora del servidor), `_estado` lo pone en la foto
de ese jugador y `igual` lo compara. **No hay `MSG_ONE`**: el brillo de Ana
llega a Beto dentro de la foto de Ana.

**El cliente** (`src/render/otros.js`): cada figura tiene una segunda
`SkinnedMesh` con la MISMA geometría y el MISMO esqueleto, material aditivo
sin escribir profundidad, y un `onBeforeCompile` que suma
`normalize(objectNormal) * uSeparacion` después de `skinning_vertex`. El color
entra tal cual (la salida del juego va en lineal, `espacioDelMotor`). `estado()`
devuelve la cáscara LEÍDA DE LA MALLA (`cascara`) y aparte lo que trajo la foto
(`brilloDeLaFoto`), para poder distinguir un fallo del cable de uno del dibujo.

**Las imágenes** — `src/play/efectospantalla.js`:

- `leerIcono` lee `hud.addimgicon` (`Params.size() >= 8`, scriptcmds.cpp:3768;
  cadenas a **80** y no a 85; las cuatro medidas por `atoi` y `WRITE_SHORT`,
  :3776-3784) y `hud.killimgicon` (tipo −2; «all» con un parámetro,
  :3865-3869). **Ninguno de los dos tiene rama `all`** como objetivo (al
  revés que `addstatusicon`): `all` no es un jugador y no se manda nada, y
  aquí se apunta «a otra entidad (all)».
- `IconosDeEstado` lleva ahora `imagenes` (`m_Img`): `AddImg` con un nombre
  que ya está **no hace nada**, ni reinicia el reloj (ui/vgui_status.h:279-307
  — al revés que un icono de estado desde MiB FEB2019_22); `KillImg` quita la
  primera; `REMOVE_ALL` quita las dos listas (`KillAll`, :349-353);
  `REMOVE_STATUS` sólo los iconos; sólo **−1 exacto** es «para siempre»
  (`IsActive`, :162-165). `pasoDeImagenes` da el rectángulo en píxeles: los
  cuatro números son PORCENTAJES de la pantalla truncados a `int`
  (Thothie JAN2010_29, :293-302), y la imagen se ESTIRA al rectángulo
  (`VGUI_Image3D::paintBackground`, render/clrender.cpp:650-651).
- `archivoDeImagen`: `gfx/vgui/<nombre>.tga` (clrender.cpp:595;
  scriptcmds.cpp:3763, «USES TGA FILES ONLY!!») → `hud/imagen/<nombre>.png`.
- `src/play/guion.js`: los dos a `COMANDOS` (scriptcmds.cpp:61, :64) y a su
  `case`; `src/play/guionjugador.js`: a `ICONOS_DE_PANTALLA`.
- `src/juego/mensajes.js`: un `div.ms-imagen` por imagen viva, estirada y con
  `image-rendering: pixelated` (`GL_NEAREST`, clrender.cpp:643-644).
- `tools/hud.mjs` (`npm run hud`) hornea los **49** `.tga` sueltos de
  `gfx/vgui/` a `build/msr/hud/imagen/`. Los nombres los compone el guion en
  marcha (`$int(L_POINTS_RED)` + `_red`), así que no hay lista cerrada; un
  control comprueba que los **27** que se pueden deducir de los guiones están.

Con servidor no hizo falta nada más: la imagen viaja por el `MENSAJE.PANTALLA`
del 93 (es un `NETMSG_STATUSICONS` más), y además la manda el guion del
jugador, que vive en el navegador.

## 3. Cómo se comprueba

- `test/brillo95.test.mjs` (33): la regla con los números a mano (72 → 67 a los
  0,3 s; 300 & 0xFF = 44; `shellscale` de 72 = 0,5625 y de 0 = 1/128), y los
  dos caminos. El de las imágenes: un `GuionDelJugador` con la ficha horneada
  corre `ext_hud_icon` y `ext_epilepsy_time_begin` de `player/externals.script`
  y mira lo que llega a su puerta; y un guion por TEXTO (la regla del 67). El
  del brillo: la `Partida` del 92/93 con la rata envenenando a Ana, mirando las
  FOTOS que salen por `repartir()` hacia el buzón de Beto; y con Beto
  RECONOCIENDO sus fotos (delta) hasta después de que el veneno acabe.
- `sondas/brillo95.mjs` (16), por el menú:
  - A, un jugador en sala88: `probe.jugador.llamar("ext_hud_icon", …)` —el
    disparo es de la sonda, porque ningún mapa portado lo hace (§1); lo que se
    mide es la línea en adelante—. DOM: (180,160) y 900×480 en 1200×800, PNG
    de 512×256 cargado. Píxeles: diferencia media 86,1 con el antes; a los
    4 s, 4,2.
  - B, dos Chromium contra `tools/servidor.mjs`: la foto de Ana llega a Beto
    con `{fx 19, (75,215,0), 71}`; la figura lleva la cáscara visible,
    aditiva, del color y con el mismo esqueleto; **21 909 píxeles verdes**
    alrededor de Ana en la pantalla de Beto, **0 antes y 0 al acabar**.
    Negativos: en la pantalla de Ana, Beto no brilla (foto, malla y 0
    píxeles); y Ana no tiene figura propia.
- **Roturas deliberadas**, en un `git worktree` aparte (`../MS95e_roturas`,
  HEAD + el árbol de ahora, con `node_modules` y `build` enlazados), cada una
  con un reemplazo que comprueba que casa, `grep ROTURA95E` = 1 puesta y = 0
  quitada:

  | rotura | Node (rojas) | sonda |
  | --- | --- | --- |
  | `_estado` sin brillo (`brillo: null`) | 3 | 13/16: foto, malla, píxeles |
  | `igual` sin `mismoBrillo` | 0 → **1** tras reescribir la prueba (§4) | **16/16: no la ve** (§4) |
  | `renderamt` sin truncar | 1 | — |
  | `separacionDeLaCascara` sin el mínimo de 1/128 | 2 | — |
  | una imagen repetida reinicia el reloj | 1 | — |
  | `addimgicon` con rama `all` | 2 | — |
  | `guion.js` sin el `case` de las imágenes | 4 | — |
  | `killicons` deja las imágenes | 1 | — |
  | `otros.js` sin `f.brillar(...)` | **0** | 14/16: malla y píxeles (0 verdes) |
  | `mensajes.js` sin `pintarImagenes()` | **0** | 13/16: DOM y píxeles de A |

  Las dos últimas son la regla del 82: Node verde y sonda roja.
- Vecinas: ver §6.

## 4. Lo que se entendió mal por el camino

- **La prueba de la delta estaba verde con la delta rota.** Decía «el brillo de
  una Ana QUIETA llega igual», y Ana no está quieta mientras la muerde el
  veneno: su VIDA cambia cada segundo y arrastra el brillo a la foto. El sitio
  donde nada más cambia es el **apagado**: el veneno acaba a los ~15 s y la
  rata no vuelve a morder hasta los ~20 (medido, con la vida clavada en 5,2).
  Sin el brillo en `igual`, Beto la vería verde para siempre. La prueba nueva
  mira lo que Beto CREE al final, con las premisas escritas (el veneno acabó,
  Ana sigue viva). Con la rotura, roja.
- **Y la sonda NO distingue esa rotura** (16/16 con ella puesta): en la partida
  de verdad el apagado coincide con algún otro cambio de Ana. Queda defendida
  sólo en Node, y se dice aquí para que nadie cuente el control «AL ACABAR» de
  la sonda como defensa de la delta.
- **Rompí el juego entero para todas las sesiones unos minutos.** Escribí el
  `onBeforeCompile` desde un `heredoc` de Python y el `\n` dentro de la cadena
  JavaScript salió como un salto de línea de verdad: `SyntaxError` en
  `otros.js`, el juego no cargaba y la sonda esperó 240 s a `probe.ready`. Y el
  control «ni un error de página» **seguía verde**: `pageerror` no salta con un
  módulo que no compila, el error va por la consola. La sonda nueva escucha
  también la consola (`SyntaxError`, «Failed to fetch dynamically imported
  module»). Las otras sondas con ese control tienen el mismo agujero.
- **Python en Windows escribe CRLF** en modo texto: tres archivos míos
  (`otros.js`, `guionjugador.js`, `partida.js`) salieron con fines de línea
  cambiados en todo el archivo. Vuelto a LF; desde entonces, `newline=""`.
- **«El brillo apaga el color al desvanecerse»** era lo que esperaba al leer
  `m_CurentAmount`. En el motor la cantidad sólo mueve la cáscara (§1).

## 5. Lo que NO se porta, dicho aquí y no descubierto luego

1. **La textura de la cáscara.** `sprites/shellchrome.spr` no está en
   `../MSC/assets/msr` (se buscó; es del motor). La cáscara es el color liso,
   que suma MÁS luz que el cromo moteado del motor y no gira con
   `r_glowshellfreq` (2,2, engine/client/ref_common.c:741).
2. **Las normales** son las del `.mdl`; el motor regenera unas «compartidas»
   para la cáscara (`R_StudioGenerateNormals`, gl_studio.c:2294-2295).
3. **La separación no la defiende ningún control.** A 0,56 unidades (1,4 cm) y
   sin escribir profundidad, la cáscara sin separar se ve igual en píxeles. Se
   lee en la malla (`separacion`), pero quitar la línea del sombreador no pone
   nada en rojo.
4. **Dos brillos a la vez**: cuando el viejo caduca, su `SetGlow(false)` apaga
   `renderfx` aunque otro siga vivo, hasta el siguiente `Think` del otro (en el
   acto si desvanece, hasta 6 s si no, :386-389). Aquí no hay esa ventana
   apagada.
5. **El brillo sobre un bicho** (`effect glow` con otro objetivo): sigue
   apuntado como «a otra entidad». Haría falta lo mismo en la foto de la
   fauna y en `src/render/bichos.js`.
6. **Sin servidor** el brillo sigue contado y no dibujado, y está bien: no hay
   otro que lo vea.
7. **El equipo** (armadura, arma en mano) no hereda la cáscara en el mod: cada
   pieza lleva su propio `m_RenderFx` (studiomodelrenderer.cpp:1426-1427), y
   este puerto no dibuja el equipo de los otros jugadores todavía.
8. **Quién dispara las imágenes**: ningún mapa portado. El fútbol (`ms_soccer`)
   y el maestro del juego (epilepsia, inocentes) no están; la sonda llama al
   evento a mano y lo dice.
9. Los nombres de imagen de 32 caracteres o más: `strncpy` a `m_Name[32]` sin
   terminador y luego `strcmp` (vgui_status.h:125, :285) es comportamiento
   indefinido en C. Aquí se compara la cadena entera. Ningún guion pasa de 10.
10. Observado y NO diagnosticado: en la prueba con servidor, cuando Ana muere el
    anfitrión de efectos sigue listando `DOT_poison` como activo. El brillo se
    apaga bien (por `vivo`), pero el efecto en un jugador muerto es de otra
    pieza.

## 6. Cifras

- `npm test`: **2 693 verdes, 0 rojas, 1 saltada, 1 «todo»** (con el árbol
  compartido tal y como estaba al pasarla).
- `test/brillo95.test.mjs`: 33.
- `sondas/brillo95.mjs`: **16 de 16**.
- Vecinas, en el árbol compartido con las otras cuatro piezas a medias:
  `efectosred93` **24/24**; `brillo95` 16/16 dos veces; `veneno91` **9/15**
  (tres golpes de cinco en la ventana) y luego 1/3 («no hay araña viva en la
  manada») según el momento; `red` 20/21.
- Las mismas, en un `git worktree` con **HEAD + sólo esta pieza** (los trozos
  ajenos de los archivos compartidos, quitados a mano): `veneno91` **15/15**;
  `red` 21/21 y 20/21 en dos pasadas. Y `red` en HEAD LIMPIO: **20/21**, el
  mismo control («se dibuja INTERPOLADO»). O sea: lo de `veneno91` es del árbol
  compartido y no de esta pieza, y `red` es inestable con la máquina cargada
  también sin ella. No se apunta un verde por `red`.
- `COMANDOS` sube en 2 (`test/juego_misiones.test.mjs`, con la lectura vieja
  al lado). Otras piezas del 95 suben el mismo número a la vez.
