# 19 · Las consecuencias del golpe, y el parry

Hasta el 18 un golpe sólo quitaba vida. El bicho seguía andando a su ritmo, con
la misma cara, hasta caerse muerto de golpe. El motor tiene cinco cosas colgadas
de recibir un golpe, y esto las porta.

**735 pruebas de `node --test` y 44 de 44 controles medidos en el mapa.**

Lo que se lleva de aquí, en una línea: **de las cinco consecuencias, dos no
pueden pasar nunca** —y no porque falten, sino porque están escritas de forma que
no llegan a ejecutarse—, **el parry son dos reglas distintas y cada una sirve a
un bando**, y por el camino salió que **quince de los veinticinco bichos de Gate
City se morían de pie** porque su animación de muerte no se estaba horneando.

---

## 1. El parry son DOS, y ninguno es el que parece

Rebirth tiene dos implementaciones de parry, en dos sitios:

| | del MOTOR | del SCRIPT |
|---|---|---|
| dónde | `CMSMonster::TraceAttack`, msmonsterserver.cpp:2110 | `game_damaged`, base_monster_shared.script:843 |
| qué lee | la estadística `parry` + `awareness` | el scriptvar `MONSTER_PARRY` |
| tirada | `rand(0, parry)` + consciencia | `rand(1, MONSTER_PARRY)` |
| tope de la tirada | 80 | 90 |
| tipos que no se paran | **ocho** | **dos** (`target`, `magic`) y `*effect*` |
| deja el daño en | −1 | ×0 |

Lo primero que escribí fue que el del script estaba muerto, porque
`MONSTER_PARRY` **no lo pone ningún script**: las 723 fichas de `monsters/` no lo
mencionan. Lo pone el motor, en el comando `setstat` (npcscript.cpp:1299):

```cpp
if (!IsPlayer())
    if (msInputStatName == "parry")
        SetScriptVar("MONSTER_PARRY", atof(Params[1]));
if (IsPlayer())
    ...aquí, y sólo aquí, se escriben las substats de verdad...
```

O sea que `setstat parry 50` en un monstruo **no le da la estadística**: le da el
scriptvar. Y de ahí salen las tres consecuencias que importan:

- un **monstruo** nunca para con la regla del motor, porque su estadística
  `parry` se queda a 0 haga lo que haga su ficha;
- un **monstruo** para con la del script, que es la única que lee el scriptvar;
- un **jugador** es al contrario: `update_parry` le escribe la estadística de
  verdad y su `game_damaged` no lleva ese bloque, así que para sólo con la del
  motor.

Y de paso, `setstat awareness 20` —que la araña también pone— **no hace nada en
un monstruo**: la consciencia sólo suma en la regla del motor, que es la que el
monstruo no usa. Una línea muerta justo al lado de una que sí cuenta.

### Cuánto para un parry de 50

La araña de Gate City pone `setstat parry 50 0 0` (spider.script:58). Cincuenta
de cien **no es media parada**: la tirada del atacante es `rand(acierto, 100)`
con `acierto = 100 − rand(0,99)`, que tira alto —su media son 75—, así que un
parry de 50 para el **4,80 %**. Cuenta cerrada sumando los tres dados, tres
millones de tiradas de Monte Carlo (4,82 %) y **20 000 golpes medidos en el
navegador (4,74 %)**.

Y el techo: con la tirada pegada al tope de 80, parar es `80 > rand(acierto,100)`
= **46,6 %**. Ni un personaje perfecto para la mitad de los golpes.

### Y lo que el jugador para: cero

`update_parry` (scripts/player/externals.script:638) no es una habilidad aparte:

- cada mano aporta **la competencia de la habilidad de su arma** —la `skill.` a
  secas, no la potencia—, ×1,5 a dos manos si no es marciales, 0 con el puño
  desnudo y 0 con un escudo;
- un escudo, en vez de aportar, **multiplica**: suma su `PARRY_MULTI` (1,3 en la
  base) al multiplicador;
- `setstat parry $int(total × multi)`.

O sea que **el parry de un jugador es su competencia con el arma que lleva**. Y
`CreateChar` reparte un punto a la POTENCIA de cada habilidad, no a la
competencia. Un personaje nuevo tiene competencia 0, consciencia 0 y por tanto
parry 0: **para el 0 % de los golpes, igual que hace el 1 % del daño.** Es la
misma cifra del 18 vista desde el otro lado.

> **Corrección del 20.** El resultado aguanta pero el número no: `update_parry`
> lee el valor de la habilidad *a secas*, y ése tiene suelo —`CStat::Value()`
> acaba en `return (iVal == 0) ? 1 : iVal`, stats.cpp:169—. O sea que un
> personaje nuevo tiene parry **1**, no 0, y con escudo `int(1 × 1,3)` sigue
> siendo 1. Para el 0,000 % igual, porque la tirada es `rand(0,1)` y la del
> atacante nunca baja de 1. Ver [ESCUDO_20.md](ESCUDO_20.md) §7.

Un detalle de coma flotante que también es del juego: espada de competencia 40 +
escudo de 1,3 no da 52, da **51**. El script suma 1,3 a un multiplicador que vale
1,0 y luego le resta 1,0, y ese viaje de ida y vuelta deja 1,2999999.

---

## 2. Las dos que no pueden pasar

**Cambiar de objetivo al que te pega por detrás.** `npcatk_retaliate`
(base_npc_attack_new.script:1104):

```
if ( NPC_DELAY_RETALITATE > 0 )              // const $randf(5.0,10.0): siempre
{
    if ( game.time < NPC_NEXT_RETALITATE )   // arranca sin poner, o sea 0
    {
        setvard NPC_NEXT_RETALITATE game.time
        add NPC_NEXT_RETALITATE NPC_DELAY_RETALITATE
    }
    else { local EXIT_SUB 1 }
}
if !EXIT_SUB
```

Las dos ramas están al revés: la que espera sigue adelante y la que ha cumplido
el plazo se va. Y como `NPC_NEXT_RETALITATE` **sólo se escribe dentro de la rama
que nunca se toma**, se queda en 0 para siempre: `game.time < 0` es falso en el
primer golpe y en todos los demás. El `RETALIATE_CHANCE 75%` que el goblin y la
araña escriben a mano es dato muerto. Portado con el fallo puesto, y con una
prueba que comprueba el fallo.

**El encogerse depreciado.** `base_pain.script:52`:

```
local L_RND_FLINCH $rand(0,L_NFLINCH_ANIMS)
playanim critical $get_token(BPAIN_FLINCH_TOKENS,L_NFLINCH_ANIMS)
```

Tira el dado en una variable y luego indexa con otra. De las siete animaciones
elige **siempre la última**, `rlflinch`. Un dado tirado y tirado a la basura,
igual que el `hitchance` del arma en el 18.

---

## 3. Hay TRES sistemas de encogerse

1. `base_pain.script`, marcado «depreciated» por su propio autor — el del dado
   roto de arriba.
2. `npcatk_checkflinch`, en la IA base, con **`CAN_FLINCH` a 0 por omisión**.
3. `base_struck.script`, el nuevo, por tipo de material.

El segundo y el tercero se diferencian en tres cosas, y las tres cambian el
resultado:

| | IA (`npcatk_checkflinch`) | `base_struck` |
|---|---|---|
| dado | `rand(1,100) <= FLINCH_CHANCE` | **no hay dado** |
| umbral | 10 % de la vida **MÁXIMA** | 10 % de la vida **ACTUAL** |
| espera | 5 s | **30 s** |
| efecto | animación | animación **+ IA suspendida 1,5 s** |

El umbral de la vida actual es el que hace que se pueda ver: con 100 de vida
hacen falta más de 10 de daño, y con 10 de vida basta 1,1 — que es justo lo que
hace un personaje nuevo con la espada oxidada.

De los bichos de Gate City, **el único que se encoge es el zombi enano de
ballesta**, y con el tercer sistema (`NPC_USE_FLINCH 1`,
`ANIM_FLINCH anim_xbow_flinch`, material `flesh`). Y es un zombi de 300 de vida,
así que su umbral son 30: con la espada oxidada hay que bajarle a 11 de vida
antes de que se encoja una sola vez.

Y si el goblin tuviera `CAN_FLINCH 1`, tampoco: su umbral serían 5 con 50 de
vida, y la espada oxidada de un personaje nuevo hace 1,1. **Un personaje nuevo no
puede hacer encogerse a nada.**

---

## 4. Huir, que sí pasa

`npcatk_checkflee` pide la vida y la probabilidad, y **las dos vienen a 0 por
omisión**, así que por omisión no huye nadie aunque `CAN_FLEE` sea 1. En Gate
City las pone:

| quién | por debajo de | probabilidad |
|---|---|---|
| rata gigante (4 de vida) | 2 | 30 % |
| zombi enano de espada / hacha / sorteado (150) | 25 | 25 % |
| **aldeanos** (`NPCs/default_human` y `_dwarf`) | 25 | **100 %** |

Los aldeanos son lo que se ve: le pegas a un paisano de la plaza y **sale
corriendo**, medido, 5,7 m en tres segundos, alejándose. Y deja de huir a los
diez segundos de `FLEE_TIME`.

### Y las cuatro ratas están enterradas

Las cuatro ratas gigantes entran en huida —el estado es el bueno, la animación es
la de correr— y **no se mueven ni un centímetro**. El rayo del suelo, excluyendo
su propio cilindro, encuentra piso **17,5 unidades POR ENCIMA de sus pies, en las
cuatro direcciones**: no es un escalón detrás, es que están hundidas. Cualquier
paso se lee como un escalón de 20 u y `m_StepSize` son 18.

No se había visto nunca porque una rata **RECELA** del jugador: nunca persigue, y
sin perseguir nunca llama a `avanzar`. El horno las deja donde dice el árbol BSP
y Rapier tiene piso más arriba — o sea que el horno y el mundo de verdad no
coinciden en esos cuatro sitios. Queda apuntado con su control propio.

---

## 5. Avisar al morir

`npcatk_alert_all_allies` es `$get_tsphere(ally, NPC_ALLY_RESPONSE_RANGE)`: una
**esfera de aliados, sin línea de visión** — se grita a través de las paredes. Y
el radio sale de la vida máxima (`npc_post_spawn`, base_monster_shared.script:175):

```
$ratio(min(maxhp,1000)/1000, 256, 1024)
```

Un goblin de 50 de vida avisa a **294 unidades (7,5 m)** y un jefe de 1 000 a
1 024 (26 m). Medido: matar al primer goblin del pueblo avisa a uno más, a 142 u,
y a ése le queda el jugador como objetivo.

Para esto la tabla de razas entera —26 razas, 3,3 KB— **viaja ahora en el
manifiesto**. Hasta el 19 sólo viajaba la relación de cada bicho con el jugador,
y «aliado» es una relación entre DOS bichos: sin la tabla, «aliado» tendría que
ser «del mismo script», y entonces un goblin no avisaría a un hobgoblin.

---

## 6. Lo que salió por el camino: quince bichos se morían de pie

Esto no era el experimento y es lo más gordo que ha aparecido.

El horno pedía al `.mdl` seis nombres comunes (`idle`, `idle1`, `walk`, `run`,
`die`, `death`) más los dos de estar quieto y andar. **Las animaciones de la
ficha de combate no se pedían.** El goblin declara `ANIM_ATTACK
battleaxe_swing1_L` y `ANIM_DEATH die_fallback`, su modelo trae las dos entre sus
**36 secuencias**, y horneábamos tres. El visor pedía un nombre que no estaba en
el manifiesto y caía a la secuencia 0 **sin decir nada**: el goblin atacaba
parado y se moría parado, desde el 17.

Y con eso arreglado salieron dos más:

**El lector no seguía las cadenas de variables.** `ficha` sí las resolvía y la
ficha de combate no. El zombi enano de ballesta hace `const ACT_ANIM_RUN walk` y
luego `setvar ANIM_RUN ACT_ANIM_RUN`, así que su animación de correr era la cadena
de texto `ACT_ANIM_RUN`. Lo mismo con `ANIM_ATTACK` → `ANIM_SXBOW_ATTACK` →
`anim_sxbow_shoot`.

**Faltaba la cadena de repuesto de la muerte.** El motor la tiene escrita
(`npc_post_spawn`, base_npc.script:280): si `ANIM_DEATH` no existe en el modelo,
prueba `diesimple`, `diesforward`, `die`, `die_fallback`, `death` en ese orden.
`NPCs/default_dwarf` declara `diesimple` y `dwarf/male1.mdl` no la tiene: tiene
`death`, la última de la lista. **Con la cadena puesta, quince de los veinticinco
scripts del pueblo pasan de no tener animación de muerte usable a tenerla**, y
doce instancias se sustituyen en el horno.

El control ya no es un aviso: es un control duro de que **todas** las animaciones
que una ficha nombra están montadas. Salen 54 de golpe y 68 de muerte, todas.

---

## 7. Lo que se ve y lo que se oye

- La **araña esquiva**: su `dodge` —que ahora está horneado— y el texto que dice
  su script, `"Your attack was dodged!"`. Y un golpe parado **no da
  experiencia**: `MarkDamage` está detrás de `if (flDamage > 0)`
  (giattack.cpp:1751), y MiB lo movió ahí a propósito («stops exp from parry»).
- El **zombi de ballesta se encoge** con `anim_xbow_flinch` y **se queda quieto**
  segundo y medio, que es la otra mitad del efecto: sin eso se ve la animación
  pero el bicho sigue andando hacia ti mientras la hace.
- Los **aldeanos huyen** corriendo.
- Los **gritos** son los del propio bicho, y `base_struck` tiene dos juegos: el
  de recibir y el de gritar de dolor por debajo de media vida, uno cada 5-10 s.

---

## 8. El fallo que sólo se veía jugando

El campo de la ficha del arma se llama `tipoDano` y en `pegar()` lo escribí
`tipoDeDano`. Eso no da error: da `undefined`, que cae al `""` por omisión, y un
tipo de daño **vacío** cumple `'target;magic' contains ''` — o sea que es
imparable por accidente. **La araña no habría esquivado nunca jugando**, y las
cuarenta mediciones de arriba seguían en verde porque todas le pasan el tipo a
mano para poder fijar los dados.

Lo caza un control nuevo que mide el camino de verdad: plantarse delante de una
araña y blandir cuatro minutos. Salen **215 mandobles, 215 impactos y 6 parados**.
Y de paso volvió a salir la lección del 18: con el jugador a 0,9 m eran 215
mandobles y **cero impactos**, porque los 60 u de la espada van del ojo al centro
del bicho y la araña mide 40 de alto, así que la diferencia de alturas se come el
alcance. La distancia se busca, no se elige.

## 9. Los ficheros

| qué | dónde |
|---|---|
| las dos reglas de parry | `src/play/parry.js` |
| encogerse, huir, avisar, cambiar de objetivo | `src/play/reaccion.js` |
| las pruebas | `test/juego_parry.test.mjs` (19), `test/juego_reaccion.test.mjs` (23) |
| el lector: `setstat`, cadenas, cadena de la muerte | `src/bsp/script.js` |
| el horno: todas las animaciones de la ficha, la tabla de razas | `tools/bichos.mjs` |
| huir y avisar en el cazador | `src/play/ia.js` |
| enchufado | `src/render/bichos.js`, `src/main.js` |
| medido | `build/sondas/consecuencias.mjs` — `npm run sonda:consecuencias` |

---

## 10. Lo que queda

**El escudo**, que es la otra mitad de defenderse y es un sistema aparte del
parry: vive entero en `game_takedamage` de `shields_base.script`. Con el escudo
levantado (`BLOCK_CHANCE_UP 100`) bloquea **siempre** y te deja el 40 % del daño;
bajado pero empuñado, anula el golpe entero el 15 % de las veces; y el ataque
tiene que venir de delante (`$within_cone2D(..., 175)`). Pide tres cosas que no
tenemos: el tipo de ataque **`hold-strike`** (duración −1, vive hasta que sueltas
el botón), una **segunda mano**, y hornear `v_shields.mdl` y `p_weapons2.mdl`. La
vida del escudo está comentada entera: en Rebirth **los escudos no se rompen**.

También queda: el **proyectil** (`charge-throw-projectile`: arco y lanza), la
**patada** de `base_kick`, el **equipo del muñeco** (pide los puntos de anclaje
del `.mdl`), el arma en la mano en **tercera persona**, y el **rodar hacia atrás**
del zombi de ballesta, que tiene su propia animación y un `addvelocity` de 200
unidades atrás y 100 arriba cuando te acercas a menos de 64.

Y lo que este experimento ha dejado apuntado: **las cuatro ratas hundidas**, que
es un desacuerdo entre el horno y Rapier y no una regla del juego.
