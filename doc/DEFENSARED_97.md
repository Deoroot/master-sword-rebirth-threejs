# La defensa del jugador con servidor — experimento 97, pieza E

> Prueba: `test/defensared97.test.mjs` (9 casos, por la `Partida` de verdad).
> Sonda: `npm run sonda:defensared97` (dos Chrome contra `tools/servidor.mjs`,
> en Gate City, delante de tres goblins).

## 1. El hueco

Con servidor, el daño de un bicho al jugador **no pasaba por ninguna defensa**.
`Partida._bichoPega` (src/red/partida.js) hacía `sesion.danar(dano)` con el
número de la IA tal cual. En solitario, `golpear` (src/main.js) lo pasa por
`defensaDelJugador` (src/play/escudo.js), que tiene el orden del motor:

```
for (i) Gear[i]->OwnerTakeDamage(Damage);              armadura y escudo
if (Damage.flDamage <= 0) Damage.flDamage = 0;
Damage.flDamage = CMSMonster::TraceAttack(Damage);     parry
                                               player.cpp:403-414
```

O sea que con servidor el fénix del 96 no protegía, el escudo no bloqueaba, el
parry no paraba y «You parry the attack!» no salía nunca. Y el mensaje «Goblin
hits you: N damage.» que sí salía lo decía el NAVEGADOR con el daño de la IA
(el suceso `pega`, que la manada emite ANTES de la defensa): un número que no
era el que bajaba la vida en cuanto hubiera algo que defendiera.

Y había un segundo camino igual: el daño de un EFECTO (el veneno,
`_efectoPega`) también se restaba entero, cuando en solitario entra por el mismo
`golpear` (el `herir` del guion del jugador, el 91).

## 2. Lo que se ha hecho

**Ninguna regla se ha copiado.** `Partida._defender` llama a
`defensaDelJugador` —la misma función que `golpear`— y sólo contesta las
preguntas que la regla le hace al mundo, con el mundo del servidor:

| la regla pregunta | en el navegador | en el servidor (97) |
| --- | --- | --- |
| qué lleva puesto | `objetosVivos` (`GuionDeObjeto` por objeto) | `_equipoDe(c)`: un `GuionDeObjeto` por pieza PUESTA o armadura, del `puesto` del personaje de este proceso, con `build/msr/objetosguion.json` |
| si el escudo está arriba | `equipo.brazal` (`Brazal`), con el botón derecho | `_brazalDe(c)`: un `Brazal` por `manos.izquierda`, movido por el botón `ATACAR2` de cada orden (`_simular`) |
| de dónde viene el golpe | `dentroDelCono2D` con `player.yaw` | lo mismo con `c.cuerpo.yaw`, el de la última orden |
| cuánto parry | `parryDelPersonaje()` | `manosDelParry` + `valorDeParryDelJugador`, con el arma y el escudo del catálogo del servidor |

`manosDelParry` es nueva y vive en src/play/parry.js: era el cuerpo de
`parryDelPersonaje` de src/main.js, que ahora la llama también. Un
`update_parry` y no dos.

Lo que el servidor ya sabía y lo que se ha añadido:

- **El `puesto`** ya llegaba: es un campo de `objetos` del personaje, y con red
  el personaje vive en el disco del servidor. Lo que faltaba eran los guiones:
  `tools/servidor.mjs` carga ahora `objetosguion.json` y se lo pasa a la
  `Partida` (`objetosGuion`). Sin él lo dice al arrancar y `/costura` cuenta
  `defensa.sinGuiones`.
- **El escudo**: `MENSAJE.EMPUNAR` (el 96) admite `mano: "izquierda"`, con la
  misma validación (lo tiene que llevar en la mochila del SERVIDOR y el catálogo
  lo tiene que conocer) y una más: que tenga ficha `escudo` («not a shield»).
  El cliente lo manda con `red.embrazar(id)` desde la B del visor.
- **El escudo arriba**: `BOTON.ATACAR2` existía en el protocolo y no lo mandaba
  nadie. El cliente lo pone con `equipo.brazal?.atacando`, igual que `ATACAR`
  con `equipo.brazo?.atacando`.
- **El tipo del golpe**: `Fauna._arnes().golpear` tiraba el cuarto parámetro,
  así que el `dodamage` de un guion con `fire` llegaba sin tipo y el parry lo
  podía parar. Ahora pasa.

## 3. A quién se le dice

Todo `MSG_ONE`, al cliente que recibe el golpe (la regla del 95,
doc/RED_95.md):

- «X hits you: N damage.» lo manda el SERVIDOR (`MENSAJE.TEXTO`) con el daño
  que queda tras la defensa, como `golpear` en solitario. **El navegador ya no
  lo dice** en la rama `pega` (src/main.js): sólo cuenta `golpesRecibidos`.
- «You parry the attack! ( a vs. b )» lo dice el `game_parry` del guion del
  jugador del servidor (el anfitrión de efectos, `_efectosDe`), con los seis
  parámetros del motor (msmonsterserver.cpp:2237-2245), cuyo `playermessage`
  va a la consola de ese cliente. Sin anfitrión, la misma frase de
  `mensajesdecombate.js`.
- «Deflected!» del escudo abajo, a ese cliente.
- Lo que digan los guiones de las piezas (un `playermessage` de una armadura)
  va por el `suceso` de cada `GuionDeObjeto`, que en el servidor es la consola
  de ese cliente.

## 4. Las medidas

**Node** (`test/defensared97.test.mjs`, los goblins no atacan solos: el golpe
lo da la prueba por `fauna._arnes().golpear`, el gancho que llama la manada).
Las tiradas se fijan con `partida.dadosDeDefensa`, porque el parry de Veteran
(40) para la mitad de los golpes:

| caso | golpe | queda |
| --- | --- | --- |
| fénix en la mochila, NO puesto (control) | 20 | 20 |
| fénix PUESTO | 20 | 9 (0,45) |
| fénix + escudo de madera arriba, de frente | 20 | 5,4 (0,45 × 0,6) |
| ídem, escudo abajo con la tirada de abajo | 20 | 0 y «Deflected!» |
| ídem, escudo arriba DE ESPALDAS | 20 | 9 (el cono no deja) |
| veneno de un efecto (`poison_effect`), con fénix | 10 | 5 |
| ídem, Beto sin armadura | 10 | 10 |
| parry fijado 30 contra acierto 12 | 20 | 0 y «You parry the attack! ( 30 vs. 12 )» |
| `fire` con parry fijado 60 contra 1 | 10 | entra: el motor no para el fuego |
| fénix sin poner → `MENSAJE.VESTIR` puesto → `VESTIR` quitado | 20 | 20 → 9 → 20 |

La última fila es la COSTURA con la pieza F del 97 (`MENSAJE.VESTIR`, que
cambia la marca `puesto` del servidor): la defensa la lee en el golpe
siguiente porque `_equipoDe` rehace la entidad de una pieza cuyo `puesto` ha
cambiado. El 63: un fallo entre dos piezas verdes sólo lo ve una prueba que
recorra las dos.

**Seis roturas deliberadas**, puestas con un reemplazo que falla si no casa y
comprobadas con una relectura antes de correr (el 80):

| rotura | rojas |
| --- | --- |
| `equipo: []` en `_defender` | 3 (fénix, escudo, veneno) |
| sin el `tic` del `Brazal` en `_simular` | 1 (escudo) |
| `fauna.golpear` vuelve a tirar el tipo | 1 (fire) |
| `parry: 0` | 1 (parry: lo caza `ultimo.parry.valor > 0`, porque con la tirada fijada el valor no entra en la cuenta) |
| `decir` a todos los clientes | 1 (reparto) |
| `_efectoPega` resta sin defensa | 1 (veneno) |
| `_equipoDe` no rehace la entidad al cambiar `puesto` | 1 (la costura con `VESTIR`) |

**La sonda** (ver §6 para el resultado). Dos personajes fabricados por
`tools/personaje.mjs` en `build/partidas/defensa97/personajes`, el MISMO
Veteran, y a «Defensa97b» se le quita el `puesto` en el disco antes de levantar
el servidor. Lo que el goblin pidió antes de la defensa se lee golpe a golpe de
`/costura` (`defensa.historial`, nuevo, de sólo lectura); lo que llega se lee
en los marcos del WebSocket de cada página (las frases y la vida de cada foto),
y que la consola lo pinta, en su anillo. Así la proporción no depende del
sorteo del daño (6-9) y el parry se cuenta aparte; y la sonda espera a que
salga al menos un parry en vez de pedirlo.

## 5. Lo que NO se ha hecho, dicho aquí

- **Ponerse y quitarse ropa con servidor.** El servidor lee el `puesto` que
  tiene; el panel del inventario no lo cambia (pendiente 3 del 96, de otro
  agente). Cuando lo haga, `_equipoDe` rehace la entidad de la pieza cuyo
  `puesto` cambie, pero el `game_wear`/`game_remove` lo tiene que llamar quien
  cambia el campo (`vestir`, src/play/armadura.js), no esto.
- **Los relojes de las piezas en el servidor.** `_equipoDe` monta sólo lo
  puesto y las armaduras, y no les da `paso`: el `callevent 0.1
  barmor_effect_activate` y el `failed_str_req_loop` (armor_base.script:100)
  no corren aquí. Los efectos de una armadura (el fuego del fénix, el
  `effect_slow` de la fuerza) siguen siendo del navegador. Montar aquí también
  las pociones las haría curar dos veces.
- **`game_damaged` del jugador con servidor.** En solitario `golpear` lo llama
  (`PL_BEEN_ATTACKED`) y `emociones.golpeado()` corta el descanso; con servidor
  no lo llama nadie, ni antes ni ahora.
- **El sonido del escudo** al bloquear y la animación de bajarlo: son del
  navegador y con servidor no viajan.
- **`IsShielding()` con servidor**: el servidor no rechaza un `PEGAR` mientras
  el escudo está arriba; el navegador ya no lo manda (`cubriendose`), pero no
  se valida allí.
- **La consciencia en el parry.** `CMSMonster::TraceAttack` suma
  `GetNatStat(NATURAL_AWR)` a la tirada (src/play/parry.js) y `golpear` no
  pasa `consciencia`: vale 0 en los dos caminos. No lo he tocado para que los
  dos sigan siendo la misma regla; es un hueco de los dos.
- **La mano izquierda sólo admite escudos.** En Master Sword se puede llevar
  otra cosa; este puerto no lo hace en ningún camino, y el servidor lo valida
  así a propósito.

- **Las trabas del jugador con servidor** (aviso de la pieza G del 97):
  `src/play/trabas.js` porta el aturdimiento y `effect_slow` como `PreThink`
  (player.cpp:4033-4054) y `SetSpeed` (msmonsterserver.cpp:2819-2857), pero
  `Partida._simular` no lee esos efectos, así que con servidor no frenan. No
  es defensa y no lo he tocado; cuando se haga, es `trabasDelJugador` sobre el
  anfitrión de efectos de cada cliente, no una copia.
- **La frase de parry dos veces, en la OTRA dirección** (aviso de la pieza D
  del 97). Lo de aquí es el parry del JUGADOR, y ya sigue la regla de D: el
  respaldo de `mensajesdecombate.js` sólo se escribe si el `game_parry` del
  guion no habló (`if (!dicho)` en `_defender`, como en `golpear`). Lo que D
  dejó con servidor es el parry del BICHO —«Your attack was parried!»—: la
  rama `case "para"` de src/main.js más el guion del bicho que corre en el
  servidor. No es de la defensa y no lo he tocado.
- **La vida del HUD con servidor** puede separarse en ±1 de la que manda el
  servidor (medido en la sonda y NO contado: A −35,9 en el HUD contra −36,9
  que llegó; B −44 contra −43, en la pasada de la rotura S2). Pinta a la copia
  local del personaje tocada por algo del navegador entre fotos (¿la
  regeneración del guion del jugador, que sigue siendo del navegador?); sin
  medir, y no es de la defensa.

## 6. Resultado de la sonda

`npm run sonda:defensared97`: **13 de 13**. En la pasada buena los goblins se
repartieron entre los dos (no hizo falta la fase 2):

```
A: 4 entran, 0 parados · llega [3,3.3,3.5,4] · pidió [6.6,7.3,7.7,8.8]
   vida −13.7 (defensa 13.7, pedido 30.5)
B: 4 entran, 3 parados · llega [7,7.3,8.1,8.2] · pidió [7,7.3,8.1,8.2]
   vida −30.7 (defensa 30.7, pedido 30.7)
proporciones A ["0.450"], B ["1.000"]; parry B 3 parados / 3 frases
```

Y otra pasada, ya con los guiones rehorneados de la pieza D y el `VESTIR` de
la F, **13 de 13** por el otro camino —los goblins fueron a por A, A se fue y
fueron a por B—: A 6 entran y 2 parados, llega [2.9, 3.1, 3.4, 3.8, 3.8, 4]
por [6.4, 6.8, 7.6, 8.5, 8.5, 8.8] pedidos, vida −20,9 (defensa 20,9, pedido
46,5); B 5 entran, llega lo pedido, vida −37,8.

Dos roturas deliberadas, una en cada lado del cable, puestas con un reemplazo
que falla si no casa y comprobadas antes de correr:

| rotura | resultado |
| --- | --- |
| S2: `equipo: []` en `_defender` (servidor) | 10 de 13: rojos «A con el 45 %» (proporciones 1,000), «la vida de A baja lo que dejó la defensa» y «el servidor pasó a A por el fénix» |
| S1: la rama `pega` de src/main.js vuelve a decir el daño de la IA (cliente) | 12 de 13: rojo «la consola de A no enseña frases de la IA» — enseña [8.7, 7.4, 6.3, 7.2], los números de antes de la defensa |

### Lo que costó medirlo (para la tabla del apartado 4)

- **El anillo de la consola no es la consola.** La primera versión contaba las
  frases en `probe.misiones.dicho()` y salía «8 de 25 golpes, 2 de 12
  parries» con el juego bien: el anillo guarda las últimas líneas. Ahora se
  cuentan en los marcos del WebSocket de cada página y el anillo sólo se usa
  para «pinta lo que llega» y «no enseña lo de la IA».
- **El borde de una fase es una carrera.** Leer el servidor y luego las
  frases dio una frase de más (y 7,2 de vida que no cuadraban): el golpe ya
  estaba en la frase y no en la lectura. Cada lectura se hace ahora en una
  ventana de 0,8 s sin golpes (`marca`).
- **El historial del servidor tiene tope.** Mientras la segunda página tardaba
  en entrar los goblins dieron 205 golpes a la primera y el servidor guarda
  200: «63 parados, 70 frases». Se acumula en cada lectura y las ventanas
  empiezan en una marca con los dos dentro.
- **El daño de la armadura sale de `"%.2f"`** (`flotanteDelMotor`, el
  `PARAM3` de `game_takedamage`): redondear `antes × 0,45` al décimo no da
  siempre lo mismo que el `dano` del servidor. Se compara lo que llega con el
  `dano` del servidor y, aparte, que `dano / antes` sea 0,45.
- **No se elige a quién pegan los goblins.** En una pasada fueron a por A, en
  otra a por B. La sonda no lo fuerza: el que no recibe es el control negativo
  del reparto mientras están los dos, y si hace falta se va el otro.
- **Árbol compartido**: sin el recargado en caliente de Vite (el 93), otra
  sesión que guardaba un archivo recargaba la página a media medida. Y la
  carpeta `build/partidas/sonda97` la usan también `sondas/armas97.mjs` y
  `sondas/inventario97.mjs`: con el mismo nombre, sus `rmSync` borraban mis
  personajes (y probablemente los míos los suyos). Ésta usa `defensa97`.
