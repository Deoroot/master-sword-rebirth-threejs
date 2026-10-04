# Experimento 96 — todas las armas, no las ocho de partida

> `npm run armas` · `npm run suelo` · `node --test test/armas96.test.mjs` · `npm run sonda:armas96`

## Qué había

`tools/armas.mjs` horneaba **ocho fichas** (`PEDIDAS`: las siete de
`reg.newchar.weaponlist` más los puños). `build/msr/objetos.json` ya tenía los
ataques leídos de 176 de las 178 armas, pero el juego no lee ese catálogo para
empuñar: lee `build/msr/armas.json`.

## Qué pasaba, medido antes de tocar nada

Un personaje nuevo, una Novablade en la mochila y `empunar("swords_novablade12")`
(sonda de usar y tirar en el directorio temporal, entrando por el menú):

| | resultado |
| --- | --- |
| `catalogo().length` | **8** |
| el ciclador (tecla 1), cuatro pulsaciones | `null` las cuatro: la Novablade ni se ofrece (`mundoDelCiclador` filtra por `catalogos.armas.has`) |
| `manos.derecha` | `swords_novablade12` |
| el brazo | **`fist_bare`, «Bare Fists»**, 2 ataques, modelo `viewmodels/v_martialarts` |
| avisos en consola | **ninguno** |

O sea: la ficha dice Novablade y el juego pega, se ve y suena como los puños
(`catalogos.armas?.get(id) ?? catalogos.armas?.get("fist_bare")`, src/main.js).
Y la `c` tampoco hacía nada: `tools/suelo.mjs` no la conocía, `Suelo.tirar`
devolvía `null` («objeto_sin_guion») y `soltarDelInventario` se callaba, con el
arma en la mano.

## Qué se hizo

### 1. El horneado: todo lo empuñable (`tools/armas.mjs`)

- **Criterio**: lo que `objetos.json` clasifica como `arma` o `hechizo`, que es
  la clasificación del motor y no una lista: **209 fichas** (178 armas, 31
  hechizos; los ocho de partida van marcados `dePartida`). Y la munición que esas
  armas tiran: `proj_arrow_*`, `proj_bolt_*` y los proyectiles con nombre que un
  ataque declara (`proj_arrow_phx`, `proj_pole_spear`...): **39**.
- **Medido**: 264 carpetas, **95,8 MB** de malla y animación (100 410 724 bytes),
  36-62 s de extracción según la máquina esté libre. `build/msr/armas.json` pasa
  de 25 KB a **925 KB**, y es lo único que el navegador carga al entrar: la malla
  de cada arma ya se pedía la primera vez que se empuña (`modelosDeArma`). No
  hace falta más pereza que la que había.
- **Una extracción por carpeta, con la UNIÓN de secuencias.** 127 pares de vista
  y 124 de mundo para 178 armas: varias armas comparten `(archivo, body)`.
  Extraídas una tras otra, la carpeta se quedaba con las secuencias de la
  ÚLTIMA. Ver «Lo que estaba mal sin que nadie lo supiera».
- **Hechizos**: los 31 usan `v_martialarts` body 0, la carpeta de los puños, y
  cuestan cero bytes. Pero **no traen ataques** (0 de 31 en `objetos.json`): en el
  motor un hechizo es `ITEM_SPELL` y se APRENDE (`LearnSpell`,
  sv_character.cpp:87-92), no se empuña. Pendiente abajo.

Comando: `npm run armas` (y `npm run suelo` después; los dos los corre
`npm run recursos`/`npm run hornear` en ese orden).

Sin modelo en la mano quedan **5 de 209**, con razón y con prueba que lo fija:

| id | por qué |
| --- | --- |
| `base_weapon_new` | plantilla del mod, no declara `MODEL_VIEW` |
| `crossbow_heavy` | `weapons/bows/v_crossbow.mdl`, `p_` y `w_` no existen en `assets/msr`, y ningún guion ni mapa nombra el objeto |
| `swords_dynamic` | herramienta de desarrollador («does no damage»); su `MODEL_VIEW` va en un `setvar` que el lector no toma, y el archivo que nombra, `weapons/1hbigsword_rview.mdl`, tampoco existe |
| `swords_testskin`, `swords_testsub` | objetos de pruebas; sus `_rview.mdl` no existen |

### 2. Los controles, uno por uno, y quién suspende y por qué

**El oráculo de la caja** (`tools/bicho.mjs`) paraba el horneado con dos
archivos: `v_2hblunts.mdl` (7 pares, el peor a 27,6 u) y `v_1hswordssb.mdl`
(**0 de 8** secuencias dentro de su caja incluso en el body 0). El juez que
resolvió `reference.mdl` —la rigidez— **no sirve aquí**: en `v_1hswordssb` da
0,000 u leído bien Y sin la escala de compresión (cinco huesos, ninguno se
estira: no sabe decir que no), y en `v_1hswords`, que pasa la caja 25/25 a 0,0,
da 1 728 u por el hueso `smdimport` de `crethrow` (es el arma volando). El juez
que sí separa es el contraste con la lectura rota:

| archivo#body | nuestra lectura | sin la escala |
| --- | --- | --- |
| v_2hblunts#11 | 9/23 a 27,6 u | 8/23 a 20 130 u |
| v_1hswordssb#0 | 0/8 a 43,5 u | 0/8 a 18 878 u |
| v_1hswordssb#2 | 0/8 a 58,4 u | 0/8 a 18 884 u |
| v_1hswords#1 (control) | 25/25 a 0,0 u | 0/25 a 66 163 u |

Tres órdenes de magnitud, como en `reference.mdl`. `contrasteDeCaja` exime sólo
cuando separa (lo nuestro ≤ 64 u y lo roto ≥ 100 veces más) y con los números en
`armas.json → resumen.eximidosDeLaCaja`; si un archivo suspende la caja y el
contraste no separa, el horneado se para como antes. **Y se miró en pantalla**:
la Ice Blade (`v_1hswordssb#2`) sale con su mano, su guarda y su filo de hielo
(`build/gatecity/vistas/armas96-hielo-con.png`).

**El del submodelo del mundo** (control 1) usaba el `+2` a ciegas del 23 y
suspendía a 12, de las que 9 estaban bien: los guanteletes y la ballesta ligera
caen en el `+1` porque no tienen mano izquierda. Ese número ya lo calcula
`caidaDe` desde el 71 y `tools/suelo.mjs` se fiaba de él; ahora este control
también (`cuerpoSuelo`, luego `PMODEL_IDX_FLOOR`, y sólo si no hay ninguno el
`+2`). **38 de 209** discrepan del `+2` —el mismo 38 que contó el 71—. Quedan
cuatro, eximidas POR NOMBRE con su cita y con control de salida («la exención
sigue haciendo falta»):

- `blunt_gauntlets_fe1/fe2`: su `game_fall` es `deleteme`
  (blunt_gauntlets_fe1.script:242-244): no llegan a estar en el suelo.
- `blunt_staff_f_old`: `MODEL_BODY_OFS 28` (:24) ya es `phlames_floor`: el bastón
  viejo se empuña con el submodelo del suelo de otro. Dato del guion.
- `bows_crossbow_heavy33`: `NO_WORLD_MODEL 1` (:22) resta uno
  (base_weapon.script:65) y cae en `xbow_p_lefthand` aunque `xbow_p_floor` existe.

**El de las secuencias** (control 3) CONTABA: `emitidas >= pedidas`, con las
pedidas repetidas. La Novablade pide `ANIM_ATTACK1..3 = 2, 2, 2` y suspendía con
sus tres secuencias bien (once espadas a dos manos igual). Y al revés era peor,
ver abajo. Ahora comprueba **una por una y LEYENDO EL `bicho.json` DE DISCO**.

**El del arco** (`declara los dos tiempos de tensar`): `bows_sxbow` dice `0;0` de
verdad (bows_sxbow.script:61; sus saetas son `HITSCAN_BOLT`). Eximida por nombre.

**Los de la flecha**, escritos para dos flechas de arco, heredaban su supuesto:

- *El dado*: 12 proyectiles tienen `PROJ_DAMAGE 0` o `1` «via tossprojectile
  only» y hacen su daño con `xdodamage` en su guion (las nueve lanzas de asta,
  `proj_arrow_spiral`, `proj_ub`, `proj_arrow_phx`). **Los de `1` el control viejo
  los aprobaba** (`max > 0`): la lanza del bastón salía verde con 1 de daño. Ahora
  se listan como pendientes y se exige que sigan siendo relleno (si un día traen
  dado, sobran de la lista). `proj_arrow_frost` escribe `'$rand(60,100)'` entre
  comillas simples (:10): no se lee, y qué hace el motor con esas comillas en un
  `const` no está medido. Pendiente, no fiel.
- *La gravedad* («cae menos que una piedra») sigue mordiendo a las flechas de
  arco; las saetas (`gravity 0`, `HITSCAN_BOLT`), la de acero (`2`), la del Fénix
  (`1`) y tres proyectiles mágicos (`0`) tienen que traer EXACTAMENTE la línea
  `gravity` de su guion, y se cita.

Resultado: **958 controles en verde**, 0 en rojo.

### 3. El suelo: la cuarta vía (`tools/suelo.mjs`, `src/render/suelo.js`)

`tools/suelo.mjs` mete todo lo empuñable con la etiqueta `empuñable`: **218
objetos**, de los que **200 sólo vienen por esa vía** (167 con malla, 20 MB).
`cargarSuelo` ya no los carga al entrar: los pide la primera vez que caen
(`SOLO_SI_CAE`), y el nodo aparece un fotograma o dos tarde. Lo que se carga al
entrar son 18 guiones y 3 MB (era 1,1 MB en el 75). La regla del objeto
(`src/play/suelo.js`) no espera a nadie.

Controles nuevos del suelo: los dos guanteletes de hierro (`BORRA_AL_CAER`) y el
huérfano `crossbow_heavy` (`HUERFANOS`, con control de salida).

### 4. El juego (`src/main.js`)

- `empunar` cuenta y avisa (`armasSinFicha`, `console.warn`) cuando le llega un
  id que el catálogo no conoce, en vez de convertirlo en puños callando. En la
  sonda: 0.
- **El turno**: la malla se pide con un `await`; con doscientas armas cambiar dos
  veces seguidas pasa, y la carga de la primera podía colgarse en la mano de la
  segunda. El último `empunar` gana.

### 5. En partida y en el jugador de otro

- `MENSAJE.EMPUNAR` (src/red/protocolo.js), el `inv transfer <id> 0`. Hasta hoy
  **el servidor no se enteraba de un cambio de arma**: sabía la de la creación y
  nada más, así que `_techoDeDano` recortaba una Novablade con el techo de la
  espada oxidada. `Partida._empunar` exige que el objeto esté en la mochila de
  SU sesión y en su catálogo; si no, `FALLO` y no toca nada.
- La foto lleva `arma` (y entra en `igual()`, o el cambio no viajaría).
- `src/render/otros.js` → `ponerArmaEnFigura`: el `StudioMergeBones` del motor
  (studiomodelrenderer.cpp:1162-1215; el arma es otra entidad pegada con
  `AttachTo`, clrenderent.cpp:321-365). Un `Skeleton` mixto: los huesos del arma
  que se llaman como uno del jugador SON el `Bone` de la figura (42 de 44 en
  `p_weapons2`), los demás propios colgados de su padre; inversas desde la
  postura de reposo del arma.

## Cómo se mide

**`test/armas96.test.mjs`** (12): catálogo ≥ 200 y las cinco del otro agente
(`novablade12`, `blood_drinker`, `axes_dragon`, `bows_firebird`, `k_fire`) con
modelo; la lista exacta de las cinco sin modelo; **cada secuencia pedida en el
`bicho.json` de disco** (con las espadas a dos manos que piden `ANIM_SHEATH 7`
en un archivo de siete separadas: el motor pone la 0, studiomodelrenderer.cpp:968);
los puños con su `r_fists_punch`; los modelos del mundo en disco; las exenciones
de la caja con sus números; el brazo y el daño de la Novablade
(`danoDelGolpe`: 2,0 con el dado a cero, los puños 0,6); que cada arma con
modelo del mundo se pueda tirar; que las perezosas no se carguen al entrar;
`EMPUNAR` (lo que lleva sí, lo que no lleva no, y el techo del daño sube); y la
fusión de huesos con un arma de mentira cuya punta tiene que seguir a la mano de
la figura al girarla.

**`npm run sonda:armas96`** (33 controles), entrando por el menú. El atajo,
dicho: las dos armas se meten en la mochila con `probe.misiones.dar` (en Gate
City nadie vende ni suelta una Novablade); todo lo demás va por las mismas
funciones que las teclas — **tecla 1 y clic** para el ciclador, `golpe.atacar`
(el `tic` del bucle), la `c` y la `x`.

- Novablade (`v_2hswords`) e Ice Blade (`v_1hswordssb`, uno de los dos archivos
  eximidos de la caja): ofrecida, empuñada, brazo y modelo correctos.
- **Se ve**: ventana = rectángulo de los vértices YA deformados por el esqueleto,
  unión de ocho tomas en 1,2 s; tres fotos —con, sin (sólo `visible` del nodo),
  con— y se exige >10 % de la ventana cambiando en las dos direcciones y <1 %
  fuera. Novablade 27 % / 31 % / 0,0 %; Ice Blade 34 % / 34 % / 0,0 %.
- **Pega con el daño de ESA arma**: Ice Blade 8 de 8 golpes en 3,15-3,25 (su
  `315 + d10` a potencia 1); Novablade 2,43-3,39, fuera de las franjas de la Ice
  Blade y dentro de las suyas (`200 + d140`). El golpe que remata no cuenta: quita
  lo que le quedaba al goblin.
- **Al suelo y de vuelta**: la `c` la suelta, está en el bus, su modelo era
  perezoso, al caer se carga y hay NODO, y la `x` la devuelve a la mochila.

## Roturas deliberadas (comprobada cada una con `grep -c ROTURA96`)

| rotura | qué se puso rojo |
| --- | --- |
| extraer arma por arma (clave de grupo con el id) | el horneado (3 controles: `fist_bare`, `smallarms_dagger`, `smallarms_dirk`) y 2 pruebas; los puños en disco: `idle1, lift, prepare_idle` |
| sin la cuarta vía del suelo | 2 pruebas |
| el modelo de vista sin colgar de `laVista` | 6 controles de píxeles de la sonda (27 de 33); **los de modelo y triángulos siguieron verdes**, que es por lo que hacen falta los de píxeles |
| la foto sin `arma` | 1 prueba |
| sin fundir huesos (todos propios) | 1 prueba |

Y antes de esas, la propia rotura del control 3: con la extracción por arma, el
control de secuencias **viejo y el nuevo leyendo la extracción** seguían verdes.
Sólo al leer de disco se puso rojo.

## Lo que estaba mal sin que nadie lo supiera

**Los puños, desde el 23 hasta hoy, no tenían puñetazo.** `PEDIDAS` horneaba
`fist_bare` y después `magic_hand_lightning_weak`, que comparten
`viewmodels_v_martialarts`: la segunda extracción pisaba la carpeta y dejaba
`idle1, lift, prepare_idle` — las del relámpago. Reproducido con el orden de
entonces en una carpeta temporal. El control de secuencias estaba verde porque
leía lo que DEVOLVÍA cada extracción, no lo que quedaba en disco: el apartado 4
del CLAUDE.md, con el arma que es el valor por omisión de todo el juego.

**La sonda nueva destapó un fallo del inventario, que NO se arregla aquí.** El
personaje nuevo lleva el arma de partida en la mano **y** en `objetos`
(src/juego/personaje.js:91-92; el motor da UN objeto, a la mano:
sv_character.cpp:84-97), y `cumplir` (src/main.js) vuelve a meterla en la mochila
al cambiar de arma: **dos `swords_rsword`**. El ciclador recorre por id
(`siguienteEnInventario`, src/play/ranuras.js:105-113), así que con dos iguales
delante salta de la primera a la segunda, la toma por la del principio y se
apaga: **la tercera arma de la mochila es inalcanzable con la tecla 1**. Visto:
`swords_rsword → (nada) → swords_rsword → ...` con la Novablade detrás. No se
toca porque `crearPersonaje` lo usan las pruebas y el personaje de pruebas de la
otra sesión; la sonda empieza con el hechizo de la lista, que también se
duplica pero no tiene ataques y el ciclador de armas no lo ofrece.

**Cuatro medidas falsas de la propia sonda, por orden:**

1. La ventana proyectaba las ocho esquinas de la caja de la postura de enlace:
   con el modelo pegado al ojo, dos quedaban detrás de la cámara y la «ventana»
   era de 6 052 × 9 537 px. **Y el «fuera» daba 0,0 % porque no había fuera**: un
   cero sin nada que contar. Ahora `cambian` devuelve `NaN` sin píxeles.
2. Comparar Novablade contra Ice Blade con tres segundos de por medio: el «fuera»
   salía MÁS alto que la señal porque el HUD había sacado el cartel del mapa (a
   los 10 y 13 s, player_main.script:525-557). Se mide pasados 40 s y con las
   tres fotos en el mismo instante.
3. «Van y vuelven» exigiendo `con ≈ con2` daba 4 % en la Novablade: su `idle`
   mueve el filo y en 0,2 s cambia sola media ventana. El contraste es con/sin
   dentro contra con/sin fuera.
4. Los «golpes de la Novablade» eran de la Ice Blade: el ciclador no había
   vuelto a ofrecerla (el fallo de arriba). Lo cazaron los controles nuevos
   «todos los golpes los dio la Novablade» y «algún golpe fuera de las franjas de
   la Ice Blade»; el de la horquilla seguía verde porque las dos horquillas se
   tocan. *Cuando dos armas tienen horquillas que se solapan, «está dentro de la
   suya» no dice cuál pegó.*

## Pendientes

- **El arma del jugador de otro, sin sonda de píxeles.** Medido en Node (el
  servidor, la foto y la fusión de huesos con una figura de mentira) y en una
  captura de dos navegadores contra un servidor de verdad (`armaColgada` con 15
  de 15 huesos fundidos del hacha oxidada de Ana, vista por Beto); falta la sonda
  con con/sin en una ventana. Los huesos propios del arma van en reposo, no en el
  fotograma 0 de su secuencia.
- **Soltar en partida no viaja**: la `c` vacía la mano en el navegador y no se le
  dice al servidor.
- **El inventario duplicado** de arriba (creación + `cumplir`) y el ciclador por id.
- **Los 31 hechizos** están en el catálogo y se ven (los puños), pero no tienen
  ataques: en el motor se aprenden, no se empuñan.
- **37 ataques con `dano` nulo** en el catálogo: el tercero de toda la familia de
  mazas (`blunt_hammer1` incluida, que es de partida) y cinco de `swords_volcano`.
  Un `strike-land` sin daño base pega sólo el dado.
- **El daño de 12 proyectiles** lo hace su guion (`xdodamage`), que este puerto no
  corre; y `proj_arrow_frost` sin leer.
- **Las ballestas** tiran saetas `HITSCAN_BOLT`; aquí vuelan como flechas, y sin
  saetas una ballesta tira la flecha gratis (el motor sólo regala la de arco,
  giattack.cpp:1005-1017).
- **`ANIM_SHEATH 7`** en catorce espadas a dos manos: el motor pone la 0; `pon`
  de src/render/arma.js devuelve `null` y deja la que hubiera.
- **Los guanteletes de hierro** se borran al caer en el motor (`deleteme`); aquí
  caen. `caidaDe` no conoce `deleteme`.
- La Novablade en primera persona ocupa media pantalla y no se le ven las manos.
  No está medido si es el modelo o el campo de visión propio del modelo de vista
  (`cl_viewmodelfov`), que src/render/arma.js dice no tener.
