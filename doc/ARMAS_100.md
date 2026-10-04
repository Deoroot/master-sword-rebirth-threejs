# Experimento 100 — el maná de los ataques, la destreza que piden, el modelo de lo que vuela y la bola del Orion Bow

> `node --test test/armas100.test.mjs` · `npm run armas` · `npm run objetos` ·
> `npm run escudos` · `npm run sondas -- -j 1 armas100`

Los pendientes 4 y 5 del 99 ([ARMAS_99.md](ARMAS_99.md), [GUION_99.md](GUION_99.md)):
ningún ataque cobraba maná, `reqskill` se leía sin las cuentas que le hacen las
bases, todo lo que volaba se dibujaba con la flecha de madera y el Orion Bow no
tiraba nada desde que el 99 hizo fiel el `if` viejo.

## 1. El maná: `UseAmmo`, al EMPEZAR el ataque

    //Attack requires mana... do we have enoguh?
    if (CurrentAttack->flMPDrain && m_pOwner->m_MP < CurrentAttack->flMPDrain && !FBitSet(m_pOwner->pev->flags, FL_GODMODE)) {
        m_pPlayer->SendEventMsg(HUDEVENT_UNABLE, "You don't have enough MP");
        m_pPlayer->BlockButton(IN_ATTACK);
        return false;
    }                                                           giattack.cpp:897-908
    ...
    if (CurrentAttack->flMPDrain) m_pOwner->Give(GIVE_MP, -CurrentAttack->flMPDrain);   :1051-1053

`UseAmmo` lo llama `StartAttack` (:392), o sea **al empezar** el ataque, y si
falla hace `CancelAttack`. Lo que va antes en `StartAttack` ya ha pasado: el
aguante se ha cobrado (:357) y `<callback>_start` ha corrido (:345). Y
`BlockButton` deja el botón «en falso hasta que se suelta»
(playershared.cpp:1343-1349): aguantarlo sin maná no reintenta en cada fotograma.

ARMAS_99 decía «lo resta al tirar (:1052-1053)»: la línea es esa, pero la
función que la contiene corre al empezar, no al tirar. Para un tiro cargado
cuerpo a cuerpo (`-attack1`) da igual en la práctica, porque `StartAttack` de
ese ataque es el instante de soltar el botón.

Lo portado:

- **El horneado** lee `reg.attack.mpdrain` con `atof` (giattack.cpp:496) en
  `ficha.ataques[i].mana`; sin poner, 0.
- **`Brazo`** (src/play/golpe.js) recibe el maná del personaje en `tic(dt, {
  pulsado, destreza, mana })` y, al elegir un ataque con `mana > 0`, o lo paga
  (`gastaMana`) o no empieza (`sinMana`, el botón queda `bloqueado`, la carga se
  pierde como en :369/:395). Va en los dos caminos —mandoble y arco—, como
  `StartAttack`, que no distingue.
- **`pasoDelBrazo`** (src/main.js) le pasa `sesion.personaje.mana`, resta
  `gastaMana` con el recorte a cero de `Give`, y con `sinMana` cobra el aguante
  igual y saca «You don't have enough MP» en gris (`nopuedes`).

**Con 0 de maná un personaje sin hechizos no puede tirar la sombra.** Es el
juego.

### Lo que cambia, calculado sobre `build/msr/armas.json`

**18 ataques de 11 armas** cuestan maná (antes, ninguno):

| arma | ataque | maná |
| --- | --- | --- |
| Unholy Blade (`swords_ub`) | la sombra (`proj_ub`, carga 2,5) | 30 |
| Shadow Lance (`polearms_sl`) | la lanza (carga 2,5) · la ráfaga (carga 4) | 10 · 100 |
| `polearms_ph` | la lanza (carga 2,5) | 10 (`const POLE_THROW_MP 10`, polearms_ph.script:38; la base pone 0, polearms_base.script:149) |
| Hoarfrost Shard (`swords_frostblade55`) | `proj_icelance` (carga 1) | 15 |
| Blood Drinker | el especial (carga 2,5) | 40 |
| Vorpal Tongue (`smallarms_vt`) | el cargado de nivel 2 | 75 |
| Ice Staff (`blunt_staff_i`) | el especial de serie (`SPECIAL_02_MP`) | 30 |
| Lightning Rod (`blunt_lrod11`) | cargas 4 y 5,5 | 50 · 75 |
| North Maul | cargas 4 y 5,5 | 30 · 60 |
| `axes_sp` | su especial | 90 |
| Dark Sword (`swords_volcano`) | sus cinco cargados | 5 · 10 · 15 · 20 · 30 |

Las cuatro astas que escriben `local reg.attack.mpdrain 0` (Affliction, Dragon,
Holy, Ice Typhoon) quedan gratis, como en el juego; la Felewyn Shard pide
`SHIELD_MP`, que nadie declara: `atof` de su nombre, 0.

## 2. `reqskill`: las cuentas que hacen las bases

El lector del horneado no hacía cuentas. `polearms_base` pone la destreza y le
suma (polearms_base.script:293-294 y :318-319):

    local reg.attack.reqskill BASE_LEVEL_REQ
    add reg.attack.reqskill 4

y las bases de los cargados de serie, con un `if` NUEVO en la misma línea
(base_melee.script:118-120, swords_base_twohanded.script:142-144: once líneas en diez ficheros):

    local reg.attack.reqskill 2
    if ( BASE_LEVEL_REQ > reg.attack.reqskill ) add reg.attack.reqskill BASE_LEVEL_REQ

`add` lee con `atof`, suma `atof` del segundo y escribe con `%.2f`
(`ScriptCmd_MathSet`, scriptcmds.cpp:4200-4229); `RegisterAttack` lo lee con
`atoi` (giattack.cpp:509). Las comparaciones son las de `ScriptCmd_If`
(scriptcmds.cpp:3984-4017): `equals`/`isnot` por texto, el resto por número.

Lo portado (`hacerCuentas`, src/bsp/script.js): cada `add|subtract|multiply|
divide|inc|dec reg.attack.X` —con o sin `if ( … )` delante— y cada `local` de
un campo con cuentas se apunta EN ORDEN en el ataque en curso, y las cuentas se
hacen al montar la ficha, no al leer la línea: en el motor todas las constantes
existen antes de que corra un evento, y el lector las va encontrando por orden de
fichero (una prueba lo fija con la constante del arma declarada después del
`#include`).

**Sólo se aplican las de `reqskill` y `mpdrain`.** Las demás se apuntan en
`ataques[i].cuentasSinAplicar` y no se hacen: `multiply reg.attack.dmg` en 187
ataques, `multiply reg.attack.energydrain` en 190, `add reg.attack.hitchance` en
51, `multiply reg.attack.range` en 6 y `add reg.attack.delay.strike`/`.end` en
12 (la Blood Drinker y las Felewyn Shard: su especial golpea medio segundo más
tarde en el juego que aquí). El daño cargado ya lo multiplica `Brazo.dano` con
`multiplicadorDeCarga`, y aplicar el `multiply dmg` aquí también lo doblaría:
hay que decidir cuál se queda antes de tocarlo. **Hueco contado, no decidido.**
`cuentasDudosas` (condiciones que no se saben evaluar): 0 en los 833 guiones.

### Lo que cambia, calculado

**177 ataques de 116 armas** piden más destreza que antes; ninguno pide menos.
Por familia: mazas 53, hachas 41, armas cortas 36, espadas 24, astas 20,
hechizos de mano 2, `base_weapon_new` 1. El salto mayor, 37 (`swords_gb`).

- Los del 99: la lanza de la Shadow Lance 35 → **39**, su `poke2` 35 → **37**;
  el golpe cargado de la Unholy Blade 2 → **32**.
- Los cargados de serie de cada arma con `BASE_LEVEL_REQ > 2` dejan de pedir 2
  (y 4 el segundo nivel): piden `2 + BASE_LEVEL_REQ` y `4 + BASE_LEVEL_REQ`.
- **Las armas de partida no cambian, salvo el Quarterstaff**: su cargado pasa de
  0 a 2 (`local reg.attack.reqskill ATK2_SKILL_LEVEL` + `add … ATK2_ADD_SKILL_REQ`,
  base_weapon_new.script:254-255, con `BASE_LEVEL_REQ` sin declarar). Igual que
  las otras seis armas de partida, que ya pedían 2. La memoria dice que el
  quarterstaff está «pendiente de verificar contra el original».

Lo que hace el motor con `reqskill`, que ya estaba portado y no se ha tocado: en
`StartAttack` y `GetHighestAttackCharge` salta los ataques de índice > 0 para los
que falta destreza (giattack.cpp:312-317, :630-635), y en `StrikeLand` el
ataque que se usa sin ella acierta la cuarta parte y hace la mitad
(`bUnderleveled`, :757-809; `sinNivel` en main.js).

## 3. El modelo de lo que vuela

Había UN conjunto de nodos, el de `proj_arrow_generic`, y `tirar` cogía la pieza
de ahí para todo. Ahora `montarArco` guarda **un conjunto por clave de modelo**:

- `clavesQueTira(brazo)`: las claves de todo lo que el arma puede tirar — el
  proyectil con nombre (o con `ammodrain 0`) por su nombre
  (giattack.cpp:1046-1048); el de tipo `arrow`/`bolt`, toda la munición del
  catálogo que case por texto (:1005-1037); y la bola del Orion Bow.
- `empunar` (main.js) monta las que falten (`cargarFlechas` por clave) y las
  cuelga de la escena; quedan cargadas para la siguiente arma.
- `cogerPieza(ficha)` coge del conjunto de `ficha.clave`. **Sin conjunto para ese
  modelo vuela sin pieza y se cuenta** (`deGuion().sinPieza`): no se le presta el
  de la flecha.
- El conjunto lleva su clave en el nombre del grupo (`flechas:<clave>`), y
  `escalar(pieza, s)` para la bola.

De las 37 municiones del catálogo, **18 tienen otro modelo** que la flecha de
madera (17 carpetas): las seis lanzas de asta, la sombra, la esfera de
Torkalath, el carámbano, el cuchillo de fuego, el ácido, las flechas del Fénix y
de escarcha, la roma, la de escarcha y la de plata (`arrows.mdl` b3/b6), y la
saeta de fuego. **17 de las 26 armas que tiran** tiran algo con otro modelo.

## 4. El Orion Bow: su bola de maná (src/play/orion.js)

El Orion Bow no tiene ataque del motor (el vacío, [GUION_99.md](GUION_99.md)
§4): lo hace su guion con `game_attack1_down` (cada fotograma con el botón
abajo, genericitem.cpp:730), `game_-attack1` (cada fotograma con el botón arriba,
:750) y un reloj propio, `tally_stretch`, cada 0,1 s.

`CargaDeOrion` es ese guion sin el dibujo, y `Brazo` la monta para
`bows_orion1` (`guionDeTiro`; el único arma de los 833 con `createnpc
items/proj_mana2`):

- **sacar el arco**: un segundo sin poder cargar (`game_deploy`, :76-79);
- **pulsar**: si hay más de 4 de maná, empieza a cargar; si no, «You lack the mana
  to start charging a mana ball.» (:88-108). Pulsar de nuevo antes de 0,75 s no
  hace nada (`NEXT_ATTACK`);
- **cada carga** (una cada 0,3 s, la primera al pulsar): tamaño + 1 y cobra 4
  (`givemp $neg(MP_DRAIN)`, :159); el daño es 10 por tamaño (:164-165); a tamaño
  10, «Manaball has reached maximum charge» y para; con 4 o menos de maná, crece
  sin cobrar, «Orion Bow: Insufficient Mana» y para (:143-150); sin 15 de
  competencia de arquería, 0,05 de daño y para (:167-171);
- **soltar**: sale `proj_mana2` del ojo a 200 u/s por donde mira la cruceta,
  sin cono ni guiño (`$relvel(viewangles,(0,200,0))`, :188), y espera 0,2 s.

Y la bola (`tirarBola`/`pasoDeBola` en src/juego/arco.js, proj_mana2.script):
sin gravedad, `solid 0` —atraviesa a los bichos, la para el mundo—; cada 0,3 s
un área de radio `clamp(24 × tamaño, 55, 140)` con el daño entero (caída 0) en
arquería y `magic`; cada bicho que el área hiere le quita un tamaño a la bola
(`ball_dodamage`, :77-90; el motor lo llama una vez por blanco,
giattack.cpp:2037-2058) y a cero se va; a los 10 s se va. Se dibuja con el
submodelo 13 de `weapons/projectiles.mdl` —`aura_01`, un aura amarilla—
(proj_mana2_cl.script:2, :57), a escala 0,75 × tamaño, que baja al gastarse.
`npm run armas` lo hornea aparte, en `armas.json` → `bolas`, con el control de
que el submodelo se llama `aura_01`.

### Tres cosas del guion que parecen erratas y se portan

1. La carga que se queda sin maná **crece sin cobrar** y se queda con el daño de
   la vuelta anterior (`BALL_DMG` se calcula en :123-124, antes del `add`).
2. **El castigo de 0,05 por falta de competencia sólo dura 0,3 s.** Cada vuelta
   que pasa la puerta del reloj rehace `BALL_DMG = BALL_SIZE × 10` (:123-124)
   ANTES del `if !MAX_LEVEL` que corta (:126): soltando enseguida, 0,05; aguantando,
   10. Lo mismo hace subir de 20 a 30 la bola del caso 1. Las pruebas fijan las
   dos ramas. *Esto lo encontró una prueba que yo había escrito mal* —pedía 0,05
   aguantando 3 s—: el código seguía el guion y la prueba seguía mi lectura.
3. `NEXT_CHARGE` no se reinicia nunca: una carga empezada antes de que venza la
   última vuelta de la anterior espera.

**El ritmo de 0,3 s es razonado, no medido.** `if game.time > NEXT_CHARGE` es
estricto y las vueltas son de 0,1 s: con relojes exactos se cumpliría en la
CUARTA vuelta (0,4 s). En el motor cada `callevent 0.1` corre en el primer
fotograma de servidor después de vencer y se reprograma desde esa hora, así que
tres vueltas suman 0,3 s más tres retrasos de fotograma y el `>` se cumple en la
tercera. Aquí hay una tolerancia que hace ese papel.

## 5. Pruebas

`test/armas100.test.mjs`, 32 pruebas:

- **el lector**, con guiones escritos como TEXTO en una carpeta temporal: el
  `add`, el `if` de los mandobles (con su control de condición falsa y sin
  constante), la constante declarada después del `#include`, el `local` que
  vuelve a empezar, `mpdrain` (número, constante, sin poner, sin declarar), el
  `isnot` con comillas simples, las cuentas que se apuntan sin aplicar; y los
  guiones del juego (Shadow Lance, Unholy Blade, Ice Staff);
- **el maná por `Brazo`** sobre la ficha horneada: la sombra con 100 deja 70; con
  29 no sale y no cobra; `BlockButton` (aguantar no reintenta, soltar sí); el
  control de que un ataque sin `mpdrain` no mira el maná; los 18 de 11,
  calculados;
- **`reqskill` por `Brazo`**: la Shadow Lance con astas 36 ya no tira, con 39 sí;
- **el Orion Bow por `Brazo`**: 1 s → tamaño 4, 40 de daño, 16 de maná; 5 s → el
  tope, 40 de maná y el aviso una vez; con 10 de maná; sin competencia; con 4 de
  maná; el segundo de `game_deploy`; el control del arco normal; el radio;
- **el modelo por `montarArco`**: la sombra sale del conjunto de su clave con el
  de la flecha también montado (para que equivocarse fuera posible); el control
  positivo del arco de partida; sin conjunto, sin pieza y contado; la bola con su
  conjunto, 200 u/s, sin gravedad, escala 3 a tamaño 4; la bola en el aire contra
  un bicho a 90 u (dos áreas de 20, a cero se va) y su control sin bichos (10 s).

`test/armas99.test.mjs` cambia su partida de mentira (nota fechada): pasa el
maná a `tic` y lo baja como `pasoDelBrazo`, con 1 000 de partida. Sin eso, 4 de
sus 10 pruebas se pusieron rojas: el tiro de la sombra y de la lanza ya cuesta.

`npm test`: **3 066, 3 064 verdes**, 0 rojas, 1 omitida, 1 todo.

## 6. La sonda

`sondas/armas100.mjs` (puerto 5974), por el menú, personaje nuevo, habilidades
a 60. Lo esperado sale de `build/msr/armas.json` leído en Node, no de la página.
**20 de 20**:

- la sombra sale con 100 de maná y **quedan 70** (= 100 − el `mana` de su ficha);
  cuelga de `flechas:weapons_projectiles_b36` (2 628 vértices) y se ve (34 % de
  su ventana se apaga y vuelve, 0,0 % del marco); con 29, no sale, el maná se
  queda en 29 y la consola gana un «You don't have enough MP»;
- control positivo: el arco de partida tira la flecha gratis con
  `flechas:weapons_bows_arrows` (216 vértices) y con 0 de maná no lo toca;
- el Orion Bow: 0 ataques del motor, y aguantar 1 s saca `proj_mana2` de tamaño
  4 y 40 de daño, que vuela 120 u; **el maná baja 16** (4 × tamaño); cuelga de
  `flechas:weapons_projectiles_b13` a escala 3 y se ve (50 % de su ventana); con
  4 de maná no sale nada, no cobra y lo dice.

`probe.arco.soltarYDetener` devuelve ahora `grupo` (el nombre del conjunto del
que cuelga el nodo, que pone `cargarFlechas` con la carpeta que CARGÓ),
`vertices` (los de su malla), `escala` y `bola`.

### Lo que la sonda enseñó antes de estar verde

**El control de píxeles leía 0 % con la bola en pantalla.** La primera pasada:
`onBeforeRender` 12 en 3 cuadros, la foto «con» la enseñaba y la «sin» no… y la
segunda «con» tampoco. La bola se había ido entre la segunda y la tercera foto:
con la máquina cargada, fotografiar la sombra tardó 10,8 s y la bola 14,3 s, y
las dos viven 10 (`remove_projectile`, y `vuelo.vida` de la sombra). Es el 75 de
CLAUDE.md —*cuando lo que mides va bajando solo, el umbral mide tu espera*— con
el reloj de vida en vez del de caer. `soltarYDetener` para ahora ese reloj (y el
área en vuelo) a lo que detiene, como ya le paraba la velocidad. La sonda imprime
cuánto tardó cada foto; en la pasada verde final fueron 6,5 s cada una, o sea
que esa pasada no ha vuelto a poner a prueba la parada del reloj con la máquina
lenta.

## 7. Roturas deliberadas

Cada una con `ROTURA100` y un reemplazo que FALLA si no casa exactamente una vez
(el 80 y el 81), con `grep -c ROTURA100` = 1 puesta y 0 quitada.

| rotura | Node (armas100, 99, 98, guion99, proyectiles97) | sonda armas100 |
| --- | --- | --- |
| B1 `_pagaMana` devuelve `true` sin cobrar | 3 rojas: «con 100 quedan 70», «con 29 no sale», `BlockButton` | 17/20: «el maná baja 30» (quedan 100), «con 29 no sale» (sale), la consola (0 → 0) |
| B2 `cogerPieza` coge siempre el conjunto de la flecha | 3 rojas: la sombra, «sin conjunto», la bola | 14/20: la sombra sin pieza (no hay conjunto de flecha con la Unholy Blade), sus dos de dibujo, los vértices, la bola en `flechas:weapons_bows_arrows`, sus píxeles |
| B3 `guionDeTiro = null` | 7 rojas: todas las del Orion Bow | 15/20: no sale la bola, su tamaño, su maná, su modelo, y «con 4 no lo dice» |
| B4 `hacerCuentas` no aplica ninguna | 7 rojas: el `add`, el `if` de los mandobles, la constante tras el `#include`, el `isnot`, `hacerCuentas`, Shadow Lance y Unholy Blade del juego | — (rehornear roto reescribiría el `armas.json` que leen las demás sesiones; lo mismo que hizo GUION_99 §6) |

Lo que se quedó verde con cada rotura y debía: los controles de la otra regla
(el ataque sin `mpdrain` con B1, el arco de partida con B2 y B3) y, con B4, «un
`local` después de un `add`» y «`mpdrain` número/constante», que miden el
`local` y no las cuentas.

**La primera B4 no rompía lo que decía**: el `// ROTURA100` al final del reemplazo
comentó el resto de la línea y el archivo no compilaba — 0 de 2 en verde por
error de sintaxis, no por la regla. Se rehízo con `/* ROTURA100 */`. Y la rotura
destapó un defecto: el `local` condicionado se escribía en el ataque SIEMPRE,
además de en las cuentas, así que con las cuentas rotas el Ice Staff seguía
saliendo con 30 de maná. Ya no se escribe; sólo cuenta si su condición sale.

## 8. Rehorneado

`npm run armas` (dos veces: la segunda tras el último cambio del lector; los
ataques salen idénticos), `npm run objetos`, `npm run escudos`. `objetos.json` y
`escudos.json`: iguales salvo los campos nuevos (`mana`, `cuentasSinAplicar`,
`cuentasDudosas`) y `pideHabilidad`. `suelo` no lee ataques y no se ha
rehorneado. Ningún mapa.

## 9. Sondas vecinas, con `-j 1`

armas100 20/20, armas99 18/18 (con el maná del personaje puesto alto: nota
fechada en la sonda), armas98 9/9, golpe 26/26, armas97 22/22 (la primera pasada
se cayó en «el servidor no contestó a 'lista'», la parte con servidor; verde en
la segunda).

**arco 39/40**, dos pasadas iguales: «la flecha vuela de verdad… 50 u en 0,050 s»
—la flecha choca con una pared a 50 u del sitio de nacer—. No se atribuye a
esto: el vuelo de una flecha no ha cambiado (sólo de qué conjunto sale su
pieza), y `build/gatecity/aparicion.json` se rehorneó hoy a las 13:12 con
`tools/aparicion.mjs` cambiado por otra sesión (el pendiente 7 del 99: apartar
el nacimiento de la pared). Sin comprobar con el horneado de antes.

## 10. Pendientes

- **Las cuentas que no se aplican** (§2): el `multiply dmg` de 187 ataques
  contra el `multiplicadorDeCarga` de `Brazo`, el `range × 1,5` de los mandobles
  a dos manos, el medio segundo de más del especial de la Blood Drinker y las
  Felewyn, el `hitchance` y el `energydrain`. Hay que decidir de qué lado se
  hace cada una.
- **El modo dios** (`FL_GODMODE`, giattack.cpp:898) no está portado.
- **Con servidor** el maná se cobra en el navegador: el servidor no sabe de
  `mpdrain` ni de la bola, y `laRed.pegar` lleva el daño del área como cualquier
  otro.
- **La bola**: sus sonidos (`alien_humongo` al cargar, `alienflyby1` al salir,
  `zap1` al irse), el efecto de cliente de la carga en la mano
  (`bows_orion1_cl`), `playviewanim`/`playowneranim`, el `$get(ent_owner,
  canattack)` que se da por cierto, herirse a uno mismo (el jugador es atacante
  y no inflictor: como la sombra, no está mirado), y qué hace un parry con
  `ball_dodamage` (aquí un golpe parado no gasta tamaño). El reloj de 0,3 s, §4.
- **Los hechizos** (`magic_hand_*`) registran 0 ataques en el horneado, así que su
  `SPELL_MPDRAIN` (magic_hand_base.script:141) no pasa por aquí.
- **Precargar conjuntos**: un arco tira de hasta seis carpetas (flecha de
  madera, roma, de escarcha y de plata, Fénix, escarcha, esfera), y se cargan
  todas al empuñarlo por si compras munición después. No se ha medido lo que
  cuesta.
- arco 39/40 (§9), sin atribuir.
