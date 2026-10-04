# Experimento 97, parte H — los pendientes de armas del 96

> `npm run armas` · `npm run suelo` · `node --test test/proyectiles97.test.mjs` · `npm run sonda:armas97`

Los seis pendientes de armas que dejó [ARMAS_96.md](ARMAS_96.md), uno por uno,
con lo que se encontró por el camino, que fue más que los seis.

## 1. La flecha de escarcha: el original NO falla

El 96 dejó `proj_arrow_frost` sin leer porque escribe el daño entre comillas
simples —`const PROJ_DAMAGE '$rand(60,100)'` (proj_arrow_frost.script:10)— y
este proyecto sabía desde el 82 que **en este lenguaje la comilla simple no
agrupa**: `GetConst` devuelve el texto con sus comillas (script.cpp:349-354).
La sospecha era que el original también fallara.

No falla, y la razón es que aquello vale para el parámetro de un COMANDO. Una
declaración `const` pasa al cargar por otro camino:

    VarValue = msstring(GETCONST_COMPATIBLE(VarValue));                    script.cpp:5410
    #define GETCONST_COMPATIBLE(a) (a.c_str()[0] == '$' ? GetConst(a) : SCRIPTCONST(a))   :41
    #define SCRIPTCONST(a) SCRIPTVAR(GetConst(a))                                         :40

y `SCRIPTVAR` es `GetVar`, que trata lo que va ENTERO entre comillas simples
como un literal y se las quita (`Return = FullName.substr(1).thru_char("'")`,
script.cpp:4406-4410). La constante guarda `$rand(60,100)`, sin comillas y sin
tirar — exactamente lo que guarda la flecha gratis con `$rand(30,60)` por la
otra rama (`GetConst` reconstruye el `$rand(...)`, :329-342). En el juego la
escarcha pega **60-100**; aquí pegaba cero.

Arreglado en el lector (`valorDeConst`, src/bsp/script.js), sólo para
declaraciones `const`, y sólo cuando el valor entero va entre comillas (la
condición de `GetVar`). Afecta a 8 constantes de `items/` (los cuatro
`SP_ATTRIB` de yelmos y anillo, que nadie lee aquí, y tres `*_DURATION` de
guiones de cliente). En los 2 884 guiones hay 219; los de NPC van por otro
lector (`recoger`) que no se ha tocado — pendiente de medir si alguno importa.

## 2. Los doce proyectiles que pegan por su guion

`src/play/proyectilguion.js`, con la tabla `PROYECTILES_DE_GUION` y cada fórmula
citada. Los dos daños **se suman**: el del motor (`ProjectileTouch`, con su base
de relleno 0 o 1, giprojectile.cpp:156-168) y el del guion
(`game_projectile_hitnpc`, :203-206).

| proyectil | cuándo | daño | portado |
| --- | --- | --- | --- |
| `proj_pole_spear` | al dar | 75 × asta/100 × (carga·2 + 1), × d/256 si d < 256 | sí |
| `proj_pole_harpoon` | al dar | 175 × asta/100 × (carga·3 + 1), recorte de cerca | sí (sin el empujón) |
| `proj_pole_trident` | al dar | 175 × asta/100 × (carga·1,5 + 1) | sí |
| `proj_pole_ti` | al dar | 300 × asta/100 × (carga·1,5 + 1), **en frío** (no `pierce`) | sí (sin congelar) |
| `proj_pole_dra` | al dar | 300 × asta/100, fuego | sí (sin `dot_fire` ni ráfaga) |
| `proj_pole_holy` | al dar, **sólo a enemigos** | 800 × asta/100, sagrado | sí (sin empujón ni `turn_undead`) |
| `proj_pole_ph` | al dar, sólo a enemigos | 800 × asta/100, rayo | sí (sin jaula ni `dot_lightning`) |
| `proj_pole_a` | al dar, sólo a enemigos | 800 × asta/100, ácido | sí (sin `dot_acid` ni la nube) |
| `proj_arrow_phx` | al chocar (atraviesa NPC) | área: de `power` a `3·power` y de 32 a 256 u según la distancia; × 0,1 y radio ÷ 2 con arquería < 25 | sí (sin `dot_fire`) |
| `proj_pole_sl` | al aterrizar | `ext_dburst` del guion del JUGADOR | **no** |
| `proj_arrow_spiral` | en vuelo, cada 0,1 s | `SPIRAL_DMG` del externo del arco élfico | **no** |
| `proj_ub` | en vuelo, cada 0,2 s | aflicción × 8 en 32 u, caída 0,1 | **no** |

Tres detalles del motor que deciden números:

- **La carga de la lanza sale 1, no 0.** `PLR_SPEAR_CHARGE_LEVEL` sólo la pone
  `ext_toss_spear` (player/externals.script:1935-1939), o sea el lanzamiento POR
  GUION de las armas con `POLE_CAN_THROW`. El del motor no la toca; `GetVar` de
  una variable sin poner devuelve su NOMBRE (`GetFirstScriptVar`,
  script.cpp:5949-5955) y `multiply` hace `atof` → 0 → factor 0·k + 1.
- **«Sólo a enemigos»** es un `if` viejo: con la relación de la rata (recelo)
  abandona el evento y la lanza sagrada no le hace nada. Una diferencia real
  entre guiones: el tridente no pregunta.
- **La flecha del Fénix explota EN el bicho**: con `reg.proj.ignorenpc` el motor
  no tira el rayo de 36 u (`Projectile_CheckHit` sale en su primera línea,
  giprojectile.cpp:283-284), no hace `DoDamage` y cae en la rama de la pared
  (:136-152, :214-220). `Flecha.miraAdelante` (src/play/proyectil.js).

### Y lo que lo tapaba: las lanzas no se tiraban

Antes del daño había otro hueco. Las lanzas, la esfera élfica, la sombra del
Unholy Blade y la flecha del Fénix declaran `reg.attack.ammodrain 0`: el ataque
**no lleva munición** y el proyectil sale del catálogo por su nombre
(giattack.cpp:497, :910-911, :1046-1052). El puerto no leía `ammodrain`, buscaba
`proj_pole_trident` en la mochila, no lo encontraba y **tiraba la flecha gratis
de arco**. Ahora `gastaMunicion` en el horneado y `municion()` en
src/juego/arco.js. Y la gratis es POR TIPO: `arrow` da la roma, `bolt` la saeta
tosca, y cualquier otro tipo «You don't have any X» sin tiro (giattack.cpp:1005-1037).

## 3. Las ballestas: saetas instantáneas

`HITSCAN_BOLT 1` (las siete `proj_bolt_*`): `proj_base` pone el daño del motor a
cero (proj_base.script:55-56) y en `game_tossprojectile` —dentro de
`TossProjectile`, ANTES de su primer `Think` (giprojectile.cpp:114-116)— corre
`hitscan_bolt` (:180-249): rayo de 8 000 u desde el origen de la saeta en su
rumbo de vuelo y `xdodamage ... direct` con **arquería (el valor de la
habilidad) / 100 × PROJ_DAMAGE × el `HITSCAN_DMG_MULTI` de la ballesta**. Ese
multiplicador lo pone el arma: la ligera no lo escribe (×1), la pesada 2,0 con
arquería ≥ 20 y 0,1 por debajo, la de vapor 1,5 / 0,1. La de acero
(`HEAVY_ONLY`) sólo es instantánea en una ballesta llamada «Heavy…» o «Steam…».

Dos cosas que se hacen distinto, y están dichas en `saeta()` (src/juego/arco.js):
el rayo del guion no se salta al tirador y lo reintenta a los 0,01 s; aquí se
salta de entrada. Y al acertar el guion teletransporta la saeta al bicho y la
deja volar; aquí se queda clavada en el punto del rayo.

## 4. Los guanteletes que se borran

`caidaDe` lee ahora `deleteme` en un `game_fall` (`seBorraAlCaer`), el horneado
del suelo lo lleva al manifiesto y `Suelo.tirar` no posa el objeto: «You drop
Venom Claws» (playershared.cpp:961) y nada en el suelo (`FallInit` →
`game_fall` → `deleteme`, genericitem.cpp:1386-1389, scriptcmds.cpp:2874-2884).

**El control nuevo se puso rojo con el trabajo bien hecho**: además de los dos
guanteletes, `caidaDe` encontró `deleteme` en los **31 hechizos**. Es verdad, y
en el motor ni llegan ahí: un hechizo soltado se deshace antes
(genericitem.cpp:1371-1376) con «The X spell is canceled» (playershared.cpp:957-958).
El control ahora separa: la lista por nombre son los que no son hechizos, y los
hechizos se exigen todos (31 de 31).

## 5. Soltar con servidor

`MENSAJE.SOLTAR` (src/red/protocolo.js), `Partida._soltar` (exige que sea lo de
la mano, la vacía y NO lo devuelve a la mochila) y `ClienteDeRed.soltarArma`.

**Lo que mordió:** la primera versión se llamaba `soltar(id)`, y `ClienteDeRed`
ya tenía un `soltar()` más abajo —desengancharse del socket—. El segundo pisaba
al primero: **la `c` con servidor desconectaba al jugador en silencio**. Las
pruebas de Node estaban verdes porque llaman a `Partida` directamente; lo cazó
el control de la sonda «Beto deja de verla», con dos Chrome. Ahora hay una prueba
que monta el cliente y comprueba que `soltarArma` manda y no desengancha.

El servidor no tiene suelo: lo soltado con red desaparece (no lo ve nadie ni se
puede volver a coger). Pendiente.

## 6. El arma del jugador de otro, en píxeles

La sonda pone a Ana (hacha pequeña oxidada) y a Beto en la taberna de Edana, y
en la pantalla de Beto mide la ventana de la malla del arma de Ana
(`probe.red.rectanguloArmaAjena`, vértice a vértice ya deformado por los huesos
de la figura) con tres fotos —con, sin (sólo `visible` de esa malla), con—.
Resultado en el apartado de números.

Dos medidas falsas por el camino: el «fuera» en la pantalla entera eran las
LLAMAS de la antorcha y la chimenea y el arma PROPIA de Beto respirando (se
esconde la propia y «fuera» es un marco alrededor); y en el marco, la cabeza de
Ana, que su `idle` movía y devolvía a su sitio justo en la tercera foto (se
congela su mezclador con `probe.red.congelarOtros`).

## 7. La Novablade y el campo de visión: es el modelo

**El motor no tiene campo de visión propio para el modelo de vista.**
`src/render/arma.js` decía que GoldSrc lo dibuja «con su propio FOV
(`cl_viewmodelfov`)»: `cl_viewmodelfov` no existe en `../MSC/`.
`R_DrawViewModel` de Xash3D (ref/gl/gl_studio.c:3675-3715) usa la misma
proyección que el mundo y sólo cambia el `pglDepthRange`; el cliente de MSR no
toca la proyección (view.cpp:388-430). El comentario está corregido al lado.

El FOV del mundo sí difiere un poco: `default_fov 90` (hud.cpp:325) horizontal
sobre 640x480 son **73,74° verticales**, que Xash3D conserva en pantalla ancha
(`V_AdjustFov`, cl_view.c:257-279); aquí la cámara es de 75° vertical
(src/render/scene.js). Medido en píxeles con el arma congelada: ver números.
La diferencia es pequeña y del signo contrario al que haría falta; lo que hace
grande a la Novablade es su cuerpo del `v_2hswords`. **No se ha cambiado el FOV
de la cámara**: mueve cada píxel de todas las sondas y es una decisión aparte.

Tres medidas falsas antes de la buena:

1. **En ángulo.** Las tangentes de los vértices desde el ojo daban «100 % de
   ancho y de alto» a las dos espadas: el brazo sale por detrás del ojo, hay
   vértices pegados al plano cercano y su tangente se va a infinito. El borde
   lo pone la pantalla, así que se mide en píxeles.
2. **El control pedía «MAYOR con el FOV del motor»** (más estrecho) y salió
   ×0,995. Un arma que se sale de la pantalla no crece al estrechar el campo:
   lo que gana lo pierde por el borde. Lo que se afirma ahora es lo que importa
   —el FOV la cambia < 5 % y la espada larga del mismo archivo ocupa 2,4 veces
   menos—.
3. **5,2 % de «ruido»** con el arma congelada: era «You wield Novablade» en la
   consola de sucesos, desvaneciéndose. Se espera a que se vaya.

## Lo que estaba mal sin que nadie lo supiera

**Ninguna flecha se dibujaba volando.** `empunar` (src/main.js) montaba el
conjunto de flechas con `scene.add(...)`, y en ese archivo la escena del mundo
se llama `escena`: un `ReferenceError` que el `catch` convertía en «el arma no
se ha podido montar», con el conjunto ya asignado y FUERA de la escena. Antes
del refactor `720b246` («el mirador de los mapas viejos sale a src/mirador.js»)
el archivo tenía un `const { scene, textures } = buildScene(...)`; el refactor
se lo llevó y esta línea se quedó apuntando a nada —desde antes del 39—. Lo vio
la sonda nueva en la consola («ReferenceError: scene is not defined»), no un
control: ninguna sonda del arco mira si la flecha SE VE. Pendiente: ese control.

**El catálogo da a seis astas un lanzamiento que no tienen.** `polearms_base`
registra el lanzamiento fuerte dentro de `if ( POLE_CAN_POWER_THROW )`
(polearms_base.script:298) y el lector no evalúa condiciones: `polearms_qs`,
`_ba`, `_hal`, `_nag`, `_sp` y `_har` salen con un `charge-throw-projectile`
que en el juego no existe (las dos últimas lanzan por GUION, `POLE_CAN_THROW`).
Pendiente: es del lector de objetos.

## Cómo se mide

**`test/proyectiles97.test.mjs`** (17): la comilla de un `const` leída del guion
crudo y en el horneado; `ammodrain`; las reglas con sus números (lanzas, «sólo a
enemigos», el Fénix, el área, las saetas); y **cuatro pruebas de COSTURA** que
montan `montarArco` de verdad sobre un mundo de mentira con las fichas del
horneado y disparan por `tirar`: la saeta hiere en el mismo `tirar` sin un paso
(y su control positivo, la flecha de arco que no hiere hasta volar), el tridente
tira SU lanza y pega dos veces, y el Fénix estalla contra la pared y sólo quema
al que está en el radio. Más los Venom Claws en `Suelo`, `SOLTAR` en `Partida`
y `soltarArma` en el cliente.

**`npm run sonda:armas97`** (22 controles, por el menú; `SOLO=B` corre sólo la
parte con servidor, para romper la red a propósito).

## Números (sonda)

- **Ballesta ligera**, personaje nuevo (arquería 1), goblin a 8 m: 3 de 3
  saetas por `hitscan_bolt`, 3 de 3 en el goblin a 290,6 u, **vuelo 0,000 s** y
  la vida baja en la misma llamada: 50 → 49 → 48 → 47 (1 = 1/100 × 100 × 1). La
  munición, `proj_bolt_generic`. Control positivo: la flecha del arco de árbol
  al mismo goblin acierta tras 0,117-0,217 s de vuelo.
- **Escarcha**: 61,8 / 65,9 / 97,6 (y en otra pasada 93,4 / 73,3 / 69,6); la
  gratis, en el mismo arco, 36,9-58,3.
- **Venom Claws**: soltados, `borrado`, mano vacía, 0 en el suelo; la Novablade
  soltada igual, en el suelo (`i=1`).
- **La Novablade y el FOV**, congelada, en dos pasadas: **17,9 % / 10,6 %** de
  la pantalla a 75° (aquí) y **17,8 % / 10,8 %** a 73,74° (el del motor): ×0,991
  y ×1,016. La espada larga, del mismo `v_2hswords` con el body 0: 7,3 % / 6,3 %
  aquí y 7,4 % / 6,4 % con el del motor. **La Novablade ocupa ×2,40 y ×1,68 lo
  de la espada larga.** Es el modelo. (Las dos pasadas difieren porque el arma
  se congela en un instante distinto de su `idle`; la comparación vale dentro
  de cada pasada. No crece al estrechar el campo porque se sale por el borde.)
- Una de las tres saetas de la pasada final dio en la PARED a 409 u: sale de
  `ofs.startpos (2,12,-8)` y no del ojo, que es desde donde la sonda mira si el
  mundo tapa. El control pide «alguna», y las otras dos: 50 → 49 → 48.
- **El arma de Ana en la pantalla de Beto** (hacha pequeña, 15 de 15 huesos
  fundidos con la figura): ventana de 21 × 81 px (0,2 % de la pantalla); al
  esconder sólo su malla cambia el **13,3 %** de la ventana y vuelve el 13,3 %;
  en el marco de alrededor, con la figura congelada, **0,0 %**.
- **Ana suelta con la `c`** y Beto la ve sin arma (`arma null`, sin malla).

## Roturas deliberadas

Con `ROTURA97` y comprobada cada una con `grep -c ROTURA97` = 1 antes de pasar
la prueba (el 80), restaurada y comprobada a 0 después:

| rotura | qué se puso rojo |
| --- | --- |
| sin la rama instantánea en `tirar` | la saeta no hiere al disparar (1) |
| `valorDeConst` sin quitar comillas | la escarcha del guion crudo (1); el horneado ya hecho sigue verde, como debe |
| sin `gastaMunicion === 0` | el tridente y el Fénix (2): tiraban la flecha gratis |
| sin `golpeDeLanza` | el tridente (1) |
| sin `explotarFenix` | el Fénix (1) |
| sin el `if (ficha.seBorraAlCaer)` | Venom Claws (1) |
| sin el `case MENSAJE.SOLTAR` | SOLTAR (1) |
| sin la saeta gratis (`bolt`) | la saeta (1): salía la flecha de arco |
| **en la sonda**: sin `red?.soltarArma` en `soltarDelInventario` (`SOLO=B`) | «Beto deja de verla» (1 de 8; los otros 7 de la parte B verdes) |
| **en la sonda**: sin congelar el modelo de vista | los dos del FOV: con/con 16,1 % y 21,4 % contra 11,3 % de cobertura, y FOV ×1,323 |

Y la primera, sin querer: el `soltar(id)` que pisaba al `soltar()` del cliente
(apartado 5) puso rojo «Beto deja de verla» con el trabajo «hecho».

## Pendientes

- **Tres daños de guion sin portar**: `proj_pole_sl` (el `ext_dburst` del
  jugador), `proj_arrow_spiral` y `proj_ub` (áreas repetidas mientras vuelan).
  Se cuentan en `arco.deGuion.sinPortar` cuando ocurren.
- **Lo que los guiones hacen además del daño**: empujones (`setvelocity`),
  venenos y quemaduras (`applyeffect dot_*`), congelar, la jaula, `turn_undead`,
  la nube de aflicción, la ráfaga de fuego, y que el área del Fénix también
  hiere al propio tirador (`DMG_REFLECTIVE`). Listado en `sinPortar` de la tabla.
- **El lanzamiento por guion** (`POLE_CAN_THROW`, `ext_toss_spear`, con su
  `CHARGE_RATIO` de 1,01 a 2: el guion suma 1 a la carga en vez de a la copia,
  polearms_base.script:1049-1053) y la ballesta de vapor, que dispara por su
  `game_attack1_down` y no por el ataque del motor.
- **El catálogo con seis lanzamientos que no existen** (arriba).
- **Las lanzas se ven como flechas**: el conjunto de nodos es el de
  `proj_arrow_generic` para todo lo que vuela.
- **El suelo con servidor** no existe: lo soltado con red desaparece.
- **El FOV del mundo** (75° aquí, 73,74° en el motor): decisión del usuario.
- `const` entre comillas en guiones de NPC (otro lector) sin medir.
