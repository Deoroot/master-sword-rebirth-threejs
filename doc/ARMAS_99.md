# Experimento 99, parte P — la sombra, la lanza y la esfera, jugando

> `node --test test/armas99.test.mjs` · `npm run sonda:armas99`

El 98 portó los guiones de `proj_ub`, `proj_pole_sl` y `proj_arrow_spiral`
([ARMAS_98.md](ARMAS_98.md)) y dejó dicho que **sólo salían por la costura de
la prueba**: `test/armas98.test.mjs` llama a `tirar(ataque, 1)` con el ataque
buscado a mano en la ficha. Jugando, ni la Unholy Blade, ni la Shadow Lance ni
el arco de Torkalath tiraban lo suyo. Es la trampa del 59 de CLAUDE.md: la
prueba le construía al mecanismo el argumento que el juego no le pasaba nunca.

Las causas eran dos, y distintas.

## 1. Cuerpo a cuerpo: el tiro caía en el camino del mandoble

`Brazo` (src/play/golpe.js) tiene dos máquinas: `ticDelTiro` para un arco y el
`tic` del mandoble para lo demás, y elige una por `esDeTiro`, que es el tipo del
ataque 0. La Unholy Blade y las astas que lanzan son cuerpo a cuerpo —su ataque
0 es `strike-land`—, así que su `charge-throw-projectile` iba por el `tic` del
mandoble. `elegir` lo escogía bien (es un `-attack1` con `chargeamt 200%`, o sea
2,5 de carga, prioridad 2); lo que pasaba DESPUÉS era un mandoble: a los
`delay.strike` salía `golpe`, y `pasoDelBrazo` (src/main.js) hacía `pegar` a
100 u delante de la cara. `tira` no salía nunca.

En el motor el tipo decide qué hace `Attack()` al caer:

    if (Type == ATT_STRIKE_LAND) StrikeLand();
    else if (Type == ATT_STRIKE_HOLD) StrikeHold();
    else if (Type == ATT_CHARGE_THROW_PROJ) ChargeThrowProj();      giattack.cpp:470-476

y antes de caer, un tiro espera a que lo suelten, sea arco o espada. Lo portado
(`Brazo.pasoDelLanzamiento`):

1. **El mínimo se espera con el botón ARRIBA.** El ataque es `-attack1`: arranca
   ya con el botón suelto. `ActivateButtonUp` corre en cada fotograma sin botón
   y sólo lo da por soltado si `time >= tTrueStart + tProjMinHold`
   (genericitem.cpp:747-762); mientras, `Attack()` pone `fCanCancel = false` y
   `fCanLandAttack = false` (giattack.cpp:429-433). Con `hold_min&max "1;1"`
   (swords_ub.script:115, polearms_base.script:303) **la sombra sale un segundo
   después de soltar el botón**, no al soltarlo. Y si se vuelve a pulsar en ese
   segundo, espera: `ActivateButtonUp` no corre con el botón abajo.
2. **Al soltar, el reloj vuelve a empezar** (`tStart = gpGlobals->time`,
   giattack.cpp:424) y el `delay.strike` cuenta desde ahí (:460): 0,1 s la
   Unholy Blade, 0,01 la lanza.
3. **Cae `ChargeThrowProj`**: lo sostenido es desde `tTrueStart` (:1073),
   recortado a `[min, max]`, y con «1;1» siempre es el 100 %: la fuerza es
   `reg.attack.range` entera (:1097) — 700 u/s la lanza, 100 la sombra. `Brazo`
   devuelve `tira` y `sostenido`, como un arco, y `pasoDelBrazo` ya lo mandaba a
   `tirar`: no hizo falta tocar main.js para eso.
4. **Acaba al paso siguiente de cumplirse `delay.end`** desde la suelta: el
   chequeo de fin va antes que el de caer (:444) y pide `fCanCancel`, que no se
   pone hasta `ChargeThrowProj` (:1103).

Medido con la ficha horneada y un `Brazo` de verdad, a 60 Hz: la Unholy Blade
empieza el tiro al soltar (2,62 s en la secuencia de la prueba) y la sombra sale
a 3,73 s (1,0 + 0,1); la lanza a 3,63 (1,0 + 0,01) con 700 u/s.

**Y lo que vuela no se dibujaba.** El conjunto de nodos que pinta las flechas en
vuelo se montaba en `empunar` sólo `if (equipo.brazo?.esDeTiro)`. Ahora pregunta
`tiraProyectiles` (cualquier ataque `charge-throw-projectile`). Sin eso la
sombra volaba y hacía daño sin pieza: la rotura lo enseña abajo.

**El sonido.** `tirar` (src/juego/arco.js) tocaba `arma.sonidos.blandir` o, si
no había, la cuerda de un arco. Con un arma cuerpo a cuerpo eso es el silbido
del mandoble. En el juego lo que suena lo pone el guion —el grito y
`SOUND_THROW` de `pole_powerthrow_start` (polearms_base.script:374-384); nada en
la Unholy Blade, que no tiene `dark_shard_toss`—, y eso no está portado. Se
calla en vez de inventar.

### No son dos armas: son once

Contado en el horneado, no supuesto: **once armas cuerpo a cuerpo** registran un
`charge-throw-projectile` —las siete astas con `POLE_CAN_POWER_THROW 1`
([ARMAS_98.md](ARMAS_98.md)), la Unholy Blade, la Frostblade (`proj_icelance`),
el cuchillo de fuego (`proj_k_knife`) y la espada rúnica verde
(`proj_acid_bolt`)—, y ninguna tiraba. La prueba las recorre todas.

El cuchillo de fuego y la Frostblade empatan su tiro (prioridad 1, carga 1) con
su mandoble cargado en el horneado de hoy, y la moneda de `StartAttack` decide:
sale la mitad de las veces. **No se ha mirado** si el motor registra los dos o si
es otro caso del `local` por evento del 98.

## 2. El arco de Torkalath: el ataque 0, siempre

`ticDelTiro` cogía `this.ataques[0]` sin elegir. `StartAttack` no distingue
arcos de espadas al elegir: recorre todos con `CheckKeys` y, a igual prioridad,
tira la moneda (`!RANDOM_LONG(0, 1)`, giattack.cpp:325-326). Ahora el arco elige
con el mismo `elegir` que el mandoble.

Con la lectura de HOY un arco de Torkalath tiene tres ataques a prioridad 0 —la
flecha de `base_ranged` (que el `if` viejo quitaría), su copia (que el `local`
por evento vaciaría) y la esfera—, así que **la esfera sale la mitad de las
veces** (la cadena de monedas: el 2 gana si su moneda sale, 1/2). Medido: 200
arcos con una semilla, entre 70 y 130 esferas. Cuando el integrador aplique el
`if` viejo y el `local` por evento (pendiente 1 del 98, decisión del usuario),
sale siempre, sin tocar `Brazo`. En el arco de partida, dos clones idénticos, la
moneda no cambia nada (control en la prueba).

**No se ha tocado** el `if` viejo ni `local` en src/bsp/script.js: era un
encargo aparte.

## 3. Las pruebas: por donde entra el juego

`test/armas99.test.mjs`, 10 pruebas. Un `Brazo` de verdad sobre la ficha
horneada, apretando y soltando por `tic` paso a paso, y lo que devuelve se manda
a `tirar` como hace `pasoDelBrazo`; nadie escribe a mano el ataque ni lo
sostenido. El cargado se hace como lo hace un jugador: clic (mandoble), SEGUNDO
clic durante el mandoble aguantando, soltar (genericitem.cpp:735-741).

- la sombra sale a 1,1 s de la suelta, con su área en vuelo, y ningún `golpe`
  de ese ataque; la lanza a 700 u/s y revienta en la pared (la ráfaga del 98);
- controles: re-pulsar durante el mínimo no suelta; sin espadas 34 no hay sombra
  y el brazo no se cuelga; UN nivel de carga da el mandoble cargado y no el
  tiro; una espada sin tiro no tira;
- el segundo caso: las once;
- el arco: con la moneda forzada sale la esfera y con la contraria la flecha;
  con la de verdad, las dos; el de partida, igual salga lo que salga.

## 4. La sonda

`sondas/armas99.mjs` (puerto 5992), por el menú y con un personaje nuevo al que
se le suben espadas, astas, arquería y las escuelas a 60. Para la Unholy Blade y
la Shadow Lance: en la mano, cuerpo a cuerpo y con el conjunto montado; UN nivel
no tira (negativo); DOS niveles tiran el proyectil de su ficha, que vuela 120 u y
se detiene en el aire (`probe.arco.soltarYDetener(…, { cargado: true })`, opción
nueva); y que se dibuja, con los dos instrumentos de armas98 —el contador de
`onBeforeRender` con su cero escondido, y los píxeles que se apagan y vuelven en
su ventana y no en el marco—. Para el arco, tiro a tiro hasta ver las dos cosas.

Medido: **17 de 17**. Sombra detenida a 120 u, ventana de 13 × 10 px, 4
`onBeforeRender` en 3 cuadros y 0 escondida, 8,9 % de la ventana se apaga y
vuelve y 0,0 % del marco. Lanza a 129 u, 13 × 18 px, 9,4 % y 0,0 %. Arco: 3
esferas y 1 flecha antes de ver las dos.

## Roturas deliberadas

Cada una con `ROTURA99` y un reemplazo en Python que FALLA si no casa
exactamente una vez, comprobada con `grep -c ROTURA99` antes (1 o 2) y después
(0):

| rotura | qué se puso rojo |
| --- | --- |
| el tiro cae en el camino del mandoble (`if (false)` en `tic`) | Node: 4 de 10 (las dos armas, re-pulsar, las once). Sonda: 10 de 17 |
| el arco coge siempre el ataque 0 | Node: 2 (la moneda forzada y la de verdad). Sonda: «la esfera sale jugando» (40 flechas, 0 esferas) |
| `pasoDelLanzamiento` suelta aunque se pulse | Node: 1 (re-pulsar) |
| **en la sonda**: el conjunto se monta con `esDeTiro` (main.js como estaba) | 12 de 17: conjunto 0 nodos, `conPieza false` y los cinco de dibujo de cada arma. La sombra **volaba igual** (120 u): sin pieza, pero volaba |

Los dos negativos «UN nivel no tira» siguen verdes en todas, como deben: son
controles de otro fallo (que el tiro salga sin la carga), y no se ha roto ése.

## Pendientes

- **El maná no se cobra.** `UseAmmo` pide `reg.attack.mpdrain` antes de empezar
  —«You don't have enough MP» y `BlockButton`, giattack.cpp:897-907— y lo resta
  al tirar (:1052-1053): 30 la sombra, 10 la lanza, 100 la ráfaga de la Shadow
  Lance. `tools/armas.mjs` no hornea `mpdrain` y ningún ataque de este puerto
  gasta maná.
- **La destreza que pide la lanza está por debajo.** `polearms_base` hace `add
  reg.attack.reqskill 4` tras ponerla a `BASE_LEVEL_REQ` (polearms_base.script:
  318-319) y el lector no hace cuentas: el horneado dice 35 y el motor pide 39
  (y 37 el `poke2`, `add … 2`). Las espadas de dos manos: `local
  reg.attack.reqskill 2` y `if ( BASE_LEVEL_REQ > reg.attack.reqskill ) add
  reg.attack.reqskill BASE_LEVEL_REQ` (swords_base_twohanded.script:142-144):
  el horneado dice 2 y el motor 32 en la Unholy Blade.
- **Lo que vuela se dibuja con el modelo de la flecha gratis.** El conjunto es
  uno solo, `proj_arrow_generic`; la sombra (`weapons_projectiles_b36`) y la
  lanza (`b73`) tienen su submodelo y no se usa.
- **Lo del guion del arma al tirar**: la espada que se vuelve invisible
  (`vanish_sword`, `ext_projectile_landed`, swords_ub.script:137-178), el grito y
  el silbido de la lanza, la animación `VANIM_THROW_POWER`.
- `destrezaDe(equipo.brazo.ataques[0])` en `pasoDelBrazo` usa la habilidad del
  ataque 0 para todos: la ráfaga de la lanza pide aflicción
  (`GetSkillStat(AttData.StatProf, …)`, giattack.cpp:314) y aquí mira astas.
  Viene de antes.
- El empate del cuchillo de fuego y la Frostblade (§1), sin mirar en el motor.
  > **El 99 (parte R):** mirado: el motor no registra el mandoble cargado de
  > serie (`if !CUSTOM_REGISTER_CHARGE1`, un `if` viejo), así que no hay
  > empate. Y con el `if` viejo y `local` por evento aplicados, la esfera de
  > Torkalath sale siempre (§2). Ver [GUION_99.md](GUION_99.md).
