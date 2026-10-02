# Experimento 65 — Lo que faltaba no era portar: era llamar

> «listo. continuemos entonces con el jugador»

El 64 montó el guion del jugador y disparó dos eventos. Antes de portar nada
más, este experimento empezó contando —la lección del 44, donde siete comandos
buenos movieron el censo cero porque el tapón estaba en otro sitio— y el censo
dijo algo incómodo:

> **21 de los 40 eventos del motor que trae el guion del jugador ya corrían
> enteros. Este puerto llamaba a dos.**

O sea que la mayor parte de lo que faltaba **no era portar comandos**. Era
llamar a lo que ya funcionaba.

```
npm test                       1 571  (eran 1 558)
npm run sonda:jugador64        16 de 16  (eran 12 de 12)
```

---

## 1. El censo, y por qué no se portó lo que más desbloquea

Un comando puede desbloquear muchos eventos y no servir para nada visible. Se
midieron las dos cosas:

| comando | eventos que desbloquea él solo |
| --- | --- |
| `cleffect` | 51 |
| `clientevent` | 25 |
| `setenv` | 10 |
| `playmp3` | 9 |

Portar `cleffect` llevaría la cobertura del **47 % al 56 %** de un golpe. Y no
se ha portado: son partículas del cliente —lluvia, niebla, destellos— y lo que
se gana es una cifra, no un juego. Lo que se ha hecho es lo contrario: **coger
los eventos que ya corrían y engancharlos**, que no sube la cifra ni un punto y
cambia lo que se ve.

Los cuatro:

| evento | qué da |
| --- | --- |
| `game_parry` | «You parry the attack! ( 31 vs. 12 )» |
| `game_xpgain` | «* 25 XP Awarded», en verde |
| `game_damaged` | quién te pegó y cuánto, apuntado en el guion |
| `game_hitground` | **la cámara se hunde al aterrizar fuerte** |

---

## 2. Una frase que era nuestra

```js
if (d.parado) { cuentas.parados++; suceso("atacado", "You parried the blow!"); return; }
```

«You parried the blow!» **no existe en Master Sword**. La escribimos aquí. La
del juego es otra, y lleva los números dentro:

```
playermessage ent_me You parry the attack! ( PARRY_ROLL vs. ACCU_ROLL )
                                  player/player_main.script, `game_parry`
```

Y los seis parámetros salen del motor, no de nosotros:

```cpp
ParametersB.add(pAttacker ? EntToString(pAttacker) : "none");
ParametersB.add(UTIL_VarArgs("%f", Damage.flDamage));
ParametersB.add(Damage.sDamageType);
ParametersB.add(UTIL_VarArgs("%i", ParryRoll));
ParametersB.add(UTIL_VarArgs("%i", std::abs(AccRoll)));
ParametersB.add(UTIL_VarArgs("%i", ParryValue));
CallScriptEvent("game_parry", &ParametersB);
                                      msmonsterserver.cpp:2237-2245
```

La regla del parry estaba portada con todo detalle desde el 32 —`src/play/parry.js`
tiene las dos reglas del mod y cuál usa cada bando—, así que las tiradas ya
existían: sólo había que dárselas al guion. Es un caso de **verde que mide otra
cosa**: había un mensaje, era plausible, y no era el del juego.

---

## 3. El guion mueve la cámara, y no hay ningún comando para eso

Éste es el hallazgo del experimento. En Master Sword el script **no llama** a
nadie para mover la vista: escribe una variable, y el cliente la lee cada
fotograma antes de dibujar.

```cpp
Vector &ViewOfs = *(Vector *)&pparams->vieworg;
SCRIPT_CONTROLVEC_POS( "game.cleffect.view", ViewOfs );
SCRIPT_CONTROLVEC_ANG( "game.cleffect.view", ViewAng );
SCRIPT_CONTROLVEC_POS( "game.cleffect.viewmodel", ViewMdlOfs );
                                            hudscript.cpp:208-221
```

Es una interfaz **por variable**, no por llamada, y eso tiene una consecuencia
de diseño: **quien escribe no le habla a nadie**. El guion deja el número
puesto y el que dibuje que lo lea. Por eso el efecto se apaga solo —el guion
vuelve a escribir un cero— y nadie tiene que cancelarlo. Hay una prueba sólo
para eso, porque si hiciera falta cancelarlo desde fuera, olvidarse dejaría la
cámara torcida para siempre.

### El aterrizaje, entero

```
{ game_hitground
	callevent player_hitgroundhard PARAM1
}
{ player_hitgroundhard
	local L_DIP PARAM1
	multiply L_DIP 0.05
	if L_DIP >= 12
	...
	callevent player_hitground_adjview
}
{ player_hitground_adjview
	...
	setvard game.cleffect.view_ofs.z LCL_BOBAMT
	multiply LCL_BOBAMT 1.01
	setvard game.cleffect.viewmodel_ofs.z LCL_BOBAMT
	callevent 0.01 player_hitground_adjview
}
```

Tres detalles que se copian porque cambian lo que se ve:

- **El parámetro es `flFallVelocity` tal cual**, la velocidad de bajada en
  unidades por segundo (`pm_shared.cpp:2938-2944`). `L_DIP = v × 0,05` y el
  umbral es 12, o sea **240 u/s**. El daño de caída no empieza hasta 580, así
  que hay una franja en la que la cámara se hunde y no te haces nada — que es
  lo que hace que saltar por un desnivel se note.
- **El arma baja un 1 % MÁS que la vista.** Es del guion, entre las dos
  escrituras, y es lo que hunde el modelo un pelo respecto a la pantalla.
- **Se reprograma cada 0,01 s hasta apagarse.** Eso obligó a que
  `GuionDelJugador` tenga reloj de verdad: el `programar` era un no-op y el
  efecto se quedaba puesto en su primer valor. Lo cazó la prueba del
  aterrizaje.

### La errata, y cómo se sabe que lo es

```cpp
if( Script->VarExists( name "_set.x" ) ) vec.x = atof(Script->GetVar( name "_ofs.x" ));
                                            hudscript.cpp:39-41
```

La rama de `_set` **comprueba `_set` y lee `_ofs`**: poner
`game.cleffect.view_set.z 10` no pone la vista en 10, la pone en lo que valga
`view_ofs.z`. Lo que lo confirma como errata es que **la macro de ángulos,
cuatro líneas más abajo, está bien** (`:47-49`). El mismo patrón escrito dos
veces y sólo uno falla. Va portado con el fallo, con una prueba para cada mitad
—si las dos dieran lo mismo no habría manera de distinguir errata de intención—
y un comentario que pide que no se «arregle».

---

## 4. `game.time`, que no existía

```
setvard GROUNDBOB_STARTTIME game.time
...
{ player_hitground_adjview
	if GROUNDBOB_STARTTIME
```

El intérprete no resolvía `game.time`, así que esa variable guardaba **la
cadena «game.time»**, que vale 0, y el `if` de la línea siguiente no se cumplía
nunca: el mecanismo entero estaba escrito y no arrancaba. Es
`gpGlobals->time` (`script.cpp:4500-4503`) y ahora se inyecta como reloj.

Y trae una consecuencia que la prueba tuvo que aprender: **con el reloj en cero
el efecto tampoco ocurre**, porque `GROUNDBOB_STARTTIME` vale 0 y el `if` es
falso. Eso es fiel —en el motor `gpGlobals->time` vale 0 sólo en el instante de
cargar el mapa— así que la prueba arranca su reloj en 10, que es medir el juego
y no el primer fotograma.

---

## 5. La copia que iba a borrar el arreglo

`src/dev/sonda.js` tenía **su propia copia** de las tres líneas que colocan la
cámara, con este comentario encima:

> «Está aquí y no repetida en cada sitio para que no pueda quedarse una rama
> sin la otra — que es como la sonda acabaría midiendo una cámara que el
> jugador no ve.»

El aviso se cumplió con la copia que lo llevaba escrito. El juego le sumaba a
la cámara el hundimiento del aterrizaje y **la sonda lo borraba al medirlo**:
habría dicho «la cámara no se mueve» con la cámara moviéndose, y habría sido
imposible de diagnosticar porque el juego estaría bien. Ahora hay una sola
copia: `main.js` expone `colocarCamaraDelOjo` y la sonda la llama.

---

## 6. Lo medido

`npm run sonda:jugador64`, Chromium de verdad, **16 de 16**. Lo nuevo:

| | |
| --- | --- |
| quieto | el guion no le pide nada a la cámara (**el cero tiene con qué comparar**) |
| tras caer | el guion pide **−12,42 unidades**, o sea 248 u/s de caída |
| y la cámara | se separa del ojo **12,4 unidades**: el número llega |
| dos segundos después | **0**: se apaga solo |

La rotura a propósito —que la cámara ignore lo que pide el guion— deja **15 de
16**, y la roja es exactamente «y ese número LLEGA a la cámara». El control
aísla el enrutado del cálculo, que es la lección del 60.

---

## 7. Y un rojo que llevaba tiempo escondido en el marcador

Al pasar las sondas vecinas, `sonda:arranque36` decía **«22 de 22 en verde»** y
una nota al pie: «la sonda se cayó: Timeout 60000ms». Contando los `control(`
del archivo salen **30**. O sea que **ocho no llegaban a correr**, y entre
ellos:

```js
control("«Start» entra con el mapa que resuelve la fila «Map»", ...)
```

que es el control del **experimento 50**, el que está citado en el apartado 4
de CLAUDE.md como el caso que enseñó que un verde puede no medir nada.

**No es de este experimento, y está comprobado, no supuesto**: se desactivó a
mano el guion del jugador y la sonda dio exactamente lo mismo, 22 y la misma
caída. Se cae en `waitForFunction` de «el menú se cierra», que agota sus 60
segundos tras pulsar «Start».

Lo que sí se ha arreglado es **el marcador**, porque el fallo de fondo es del
apartado 4 aplicado a sí mismo: *un recuento que sólo cuenta lo que se ejecutó
no puede bajar*. Ahora la caída es una roja más, así que sale **22 de 23** y no
se puede volver a leer como un pleno. El porqué del plantón queda para la
sesión siguiente, con su nombre puesto en NEXT_SESSION.md.

---

## 8. Lo que sigue faltando

El jugador va por **253 de 541 eventos** (47 %), y lo que queda ordenado por
uso lo imprime `npm run jugador`. Lo caro y visible es `cleffect`; lo barato es
`setstat` (4 eventos) y `setwearpos` (1 archivo entero).

Y sigue en pie lo del 64, que la corrección del usuario dejó con nombre: **los
objetos tampoco corren su guion**. Los anillos ya llaman al del jugador
—`bloodstone_toggle` funciona y está probado—, pero el hechizo de rejuvenecer
tiene su propio `passive_regen` dentro del objeto, y ahí no llega nadie.
