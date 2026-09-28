# Experimento 23 — Los proyectiles, y si conviene copiarlos

> «sigamos con los proyectiles, los msr creo que eran un poco raros pero nos
> conviene evaluar si lo hicieron asi por limitaciones y si nos conviene
> replicarlo al 100% o modificarlo/mejorarlo»

Eran raros. Y la respuesta corta es: **de las seis rarezas, dos son
limitaciones bien resueltas, dos son decisiones de diseño, y dos son erratas —
una de ellas de las que deciden si el arma se puede usar o no.**

Está todo portado **con las erratas puestas**, que es la regla del proyecto, y
los tres interruptores para quitarlas están juntos en un sitio, apagados, con la
medida de lo que cambia cada uno al lado. La decisión de encenderlos no es mía.

**854 pruebas y 35 de 35 controles** (`npm run sonda:arco`). El resto de la
batería sigue en verde: ia 15, golpe 25, consecuencias 44, escudo 34, mundo 40,
cuerpo 29, mapa 30, sonido 20.

---

## 1. Lo primero: el arco de partida no disparaba, y ninguna prueba lo decía

`bows_treebow` está horneado desde el 18. Es una de las siete armas entre las
que elige un personaje nuevo. Y hasta hoy era decoración:

```js
this.ataques = (arma?.ataques ?? []).filter((a) => a?.tipo === "strike-land");
```

Una línea del 18 que tiraba a la basura todo ataque que no fuera un mandoble.
Las 25 pruebas de `golpe` y los 25 controles de su sonda pasaban, porque todas
miden la espada oxidada.

Es la **tercera vez en tres experimentos** que aparece lo mismo: el 21 tenía la
IA apagada desde el 17, el 22 tenía el paseo muerto en la partida, y el 23 tenía
un arma entera sin conectar. Las tres veces la batería estaba verde. El apartado
6 dice qué se hace con eso.

## 2. `reg.attack.range` no es el alcance: es la velocidad

```cpp
float flRange = CurrentAttack->flRange * flTimeHeldAdjusted;
Vector vTemp = vForward * flRange;
pProjectile->TossProjectile(this, vStartPos, vTemp);      // giattack.cpp:1097
```

y dentro, `pev->velocity = vVelocity`. Los 750 de `RANGED_FORCE` del arco de
árbol son **750 unidades por segundo**, o sea 19 m/s. El campo se llama «range»
porque el ataque a distancia reutiliza la ficha del cuerpo a cuerpo y nadie le
cambió el nombre.

No es una limitación ni una errata: es un nombre heredado. Portado con el número
y con el nombre honesto (`fuerza`).

Y con eso sale la primera rareza de verdad: **19 m/s es un tercio de la
velocidad de una flecha real**, y la gravedad de la flecha son 600 u/s²
(`gravity 0.75` × `sv_gravity 800`), o sea metro y medio de gravedad. A veinte
metros la flecha del arco de árbol ha bajado **330 unidades: ocho metros y
medio**. El arco corto de Master Sword no es un arma de precisión, es una
catapulta de mano. Eso está portado tal cual, porque es lo único del sistema que
se siente como un arco de verdad.

## 3. El tensado: un segundo y pico de espera, y un 15 % de premio

Ésta es la rareza que más se nota jugando, y la que más costó leer bien.

El arco declara `RANGED_HOLD_MINMAX 1.1;1.3` y la fuerza sale de

```cpp
flTimeHeldAdjusted = V_max(V_min(flTimeHeld, tMaxHold), tProjMinHold);
flTimeHeldAdjusted = tMaxHold ? (flTimeHeldAdjusted / tMaxHold) : 0;
```

El mínimo es un **suelo**, no un requisito: un clic seco ya vale 1,1/1,3 = **el
85 %**. Mi primera lectura fue «entonces un clic dispara al instante al 85 % y el
tensado no sirve para nada», porque en el servidor el castigo por soltar pronto
está comentado (giattack.cpp:419-424).

Está comentado porque **el servidor no recibe nunca una suelta temprana**:

```cpp
void CGenericItem::ActivateButtonUp() {
  …
#ifndef VALVE_DLL
  if (!m_ReleaseAttack)
    if (CurrentAttack && !CurrentAttack->fAttackReleased && … )
      if (gpGlobals->time >= CurrentAttack->tTrueStart + CurrentAttack->tProjMinHold)
      { SendCancelAttackCmd(); … }
#endif
}                                                  // genericitem.cpp:747-768
```

y `ActivateButtonUp` corre en **cada fotograma con el botón arriba**, no en el
flanco. Así que soltar antes del mínimo no cancela ni castiga: **deja la suelta
pendiente, y sale sola al llegar al mínimo.** Un clic dispara 1,1 segundos
después, solo, al 85 %.

Consecuencias, medidas:

| | fuerza | cono |
|---|---|---|
| clic seco (dispara a los 1,1 s) | 635 u/s | 4,9° |
| tensado del todo (1,3 s) | 750 u/s | 4,0° |

**Todo el sistema de carga del arco cabe en ese 15 %.** Y aguantar el botón no
dispara nunca: el arco se queda tensado indefinidamente, sin cadencia y sin tope,
porque `Attack()` pone `fCanCancel = false` en cada fotograma con el botón abajo
y el ataque no puede caducar.

**¿Limitación?** No. Es un tiempo de carga fijo, impuesto desde el cliente, y
está bien resuelto. Portado entero, con el aplazamiento incluido.

**¿Conviene tocarlo?** Creo que no, pero es discutible y no lo he tocado: la
ventana de 0,2 s hace que tensar sea casi irrelevante, y ensancharla —por ejemplo
`0.3;1.3`— convertiría el arco en un arma con decisión. Cambia la sensación de
todas las armas de tiro del juego, así que es una decisión de diseño y no de
port.

## 4. La errata que decide si el arco sirve: nueve grados en el guiño

```cpp
if (m_pPlayer) vAngle += CurrentAttack->AimOffset;        // giattack.cpp:1089
```

`vAngle` es `pev->v_angle`, o sea **(cabeceo, guiño, alabeo)**. Y `bows_base`
declara

```
const RANGED_AIMANGLE    (0,9,0)
```

Nueve grados **en el guiño**. De lado. A ocho metros son más de cuarenta
unidades, y un goblin mide 32 de ancho.

Que la intención era el cabeceo lo dice el resto del juego, y esto no es una
corazonada: es aritmética. Con los grados en el cabeceo, el alcance al que la
flecha vuelve a la altura del ojo es `R = v²·sen(2θ)/g`:

| arco | fuerza | grados | alcance llano |
|---|---|---|---|
| arco de árbol | 750 u/s | 9° | 290 u = **7,4 m** |
| arco largo | 2 100 u/s | 3° | 768 u = **19,5 m** |

Siete metros el arco corto «of bark and leaves», veinte el largo «made for
range». Eso no es una casualidad de dos cifras: es el diseño. Y las dos
ballestas, que van planas y casi sin gravedad, declaran `(0,0,0)` — igual que
**todos** los arcos posteriores a `bows_base`, que es la firma de alguien que lo
apagó en vez de arreglarlo.

El arco de árbol, el gratis del personaje nuevo, hereda los nueve.

Y hay una segunda errata encima, en tres líneas:

```cpp
float VeerAng = RANDOM_FLOAT(0.0f, M_PI);
vAngle.x += cosf(VeerAng) * Spread;
vAngle.y += sinf(VeerAng) * Spread;               // giattack.cpp:1085-1087
```

El ángulo va de 0 a π y no a 2π, así que `sinf` **nunca es negativo**: el desvío
del guiño es siempre al mismo lado. Y el radio es siempre exactamente `Spread`:
**ninguna flecha sale por el centro del cono**, salen todas por el borde.

### Lo medido

Doce flechas a un goblin del mapa, a ocho metros, apuntándole al pecho:

| | aciertos | desvío medio |
|---|---|---|
| **con el motor tal cual** | **0 de 12** | 11,6° — y *de lado* |
| con el desvío en el cabeceo | 5 a 12 de 12 | 9,1° — y *hacia arriba* |

El arreglo **no reduce el desvío**: lo cambia de sitio. Sigue saliendo a nueve
grados de la cruceta, sólo que ahora esos nueve grados compensan la caída en vez
de tirar la flecha a la izquierda. Eso, medido con un ángulo a secas, parecía no
servir de nada mientras pasaba de 0 a 12 aciertos; por eso la sonda mide el
desvío partido en lateral y vertical.

**Ésta es la que yo encendería.** Es la diferencia entre un arma que se puede
usar y una que no, la intención original es demostrable con la tabla de arriba, y
el propio mod la apagó en todos los arcos que escribió después. Pero va apagada
por omisión, porque el proyecto porta el juego y no una versión mejorada del
juego, y encenderla es cambiar cómo se juega.

## 5. Lo que no es raro, aunque lo parezca

**El rayo de 36 unidades sí es una limitación, y bien resuelta.**

```cpp
Vector vecEnd = pev->origin + pev->velocity.Normalize() * 36;
MSTraceLine(pev->origin, vecEnd, dont_ignore_monsters, edict(), tr, trflags);
                                                   // giprojectile.cpp:290-296
```

Una flecha a 750 u/s avanza 12,5 unidades por fotograma a 60 Hz y 37 a 20, así
que sin mirar adelante se cuela por dentro de un goblin de 32 de ancho. La
solución del motor es un rayo corto en cada `think`, y la consecuencia jugable es
que **una flecha acierta hasta 36 unidades —casi un metro— antes de tocar
nada**.

Portado con el número, y además con el barrido de `pos` a `pos + v·dt`, que es lo
que hace de verdad el movimiento de Half-Life. Los dos hacen falta: el barrido
tapa el hueco entre fotogramas y los 36 son lo que se ve.

**Las flechas gratis son una decisión, no un descuido.**

```cpp
//Player not carrying any of the required ammo
if (!_stricmp(CurrentAttack->sProjectileType, "arrow")) {
  //New! Give free 'blunt' arrows
  … GetGlobalGenericItemByName("proj_arrow_generic");
}                                                  // giattack.cpp:1005-1017
```

Un arco **nunca se queda sin munición**. Y la gratis no se gasta nunca, porque el
motor sólo resta cantidad `if (!GENERIC)`. Llevar flechas no es tener con qué
disparar: es disparar mejor —30-60 de daño contra 60-90 de la de madera—. Un
personaje nuevo no lleva ni una (`reg.newchar` regala cuatro objetos y ninguno es
munición) y aun así puede usar el arco desde el primer minuto. Portado tal cual.

**Una flecha no falla nunca y no hace crítico nunca.** `TossProjectile` no copia
del ataque ni el umbral de crítico ni el porcentaje de acierto, así que
`flHitPercentage` se queda en el 100 a pelo y `flCritThreshold` en cero, y el
motor pide `> 0` para tirar el dado. Lo único que decide el daño es la potencia
de arquería, con el mismo `/100` del mandoble: **un personaje nuevo, con un punto
de potencia, hace de 0,3 a 0,6 de daño por flecha.** Doce flechazos le quitan
cinco puntos de vida a un goblin de cincuenta. No es un fallo del port: es el
modelo de progresión de Master Sword, y está medido en la sonda para que nadie lo
«arregle» por error.

**La habilidad no mejora la puntería**, y tampoco por decisión:

```cpp
//Shoot more accurately for higher skill
float flAccFraction = m_pOwner->GetSkillStat(…) / STATPROP_MAX_VALUE;
flAccFraction = 1 - V_min(V_max(flAccFraction, 0.0f), 1.0f);
//Shoot more accurately for drawing the bow back longer
float LoweredSpreadDeg = flAccBest + (flAccuracyDefault - flAccBest) * (1 - flTimeHeldAdjusted);
```

`flAccFraction` se calcula, se normaliza con cuidado y **no vuelve a aparecer**.
Es el tercer interruptor, y el único cuyo arreglo es invención nuestra: el motor
no dice en ningún sitio cómo pensaba aplicarlo.

## 6. Lo demás que se encontró por el camino

- **Un arco registra dos ataques idénticos.** `base_ranged` pone los `local
  reg.attack.*` y llama a `registerattack`, y `bows_base` —que lo incluye— vuelve
  a llamarlo en su `weapon_spawn` con los mismos valores puestos. El script lo
  sabe: su `skill_check` toca `attackprop ent_me 0` **y** `attackprop ent_me 1`.
  Para el motor son dos clones con la misma prioridad, o sea que `StartAttack`
  tira una moneda entre ellos. Inofensivo, y portado porque explica el 2.
- **La restauración del arco poco hábil pone el cono equivocado.** `skill_check`
  castiga a quien no tiene nivel y luego restaura con
  `attackprop ent_me 0 COF.l RANGED_HOLD_MINMAX` — los tiempos de tensar en el
  hueco del cono. `atof("1.1;1.3")` es 1,1, así que un arco que estuvo penalizado
  y dejó de estarlo acaba **más preciso que uno nuevo**: 1,1° contra 10.
- **Un `COF` con un solo número no se lee.** El motor pide `if (Stats.size() >=
  2)`, así que el `reg.attack.COF 1` del lanzazo del bastón se ignora y el arma
  tira con puntería de láser. El lector aplica la regla: un trozo suelto es
  `null`, no un grado de dispersión inventado.
- **`ANIM_DEPLOY 1` de `bows_base` está muerto.** Para un arma la de sacar la pone
  `base_item`, que declara `ANIM_LIFT1 0`. `v_bows.mdl` trae cuatro secuencias y
  el juego usa tres. Hasta hoy horneábamos **una**: el arco se quedaba quieto
  mientras disparaba.
- **Una flecha tiene dos gravedades.** `proj_arrow_base` pone `gravity 1.0` en
  `game_deploy` —con la flecha en la mano— y cada flecha pone la suya en
  `arrow_spawn`: 0,7 la de madera, 0,75 la gratis. La que vuela es la del spawn,
  porque la que se lanza es un objeto nuevo que nunca pasa por `game_deploy`.
  Quedarse con «la última que se lee» da un 40 % más de caída por accidente.

## 7. Lo que no se ha hecho, dicho en voz alta

- **El muñeco no tensa.** `ranged_start` hace `playowneranim critical bow_pull` y
  `ranged_stretchbow` cambia a `bow_hold` a los `RANGED_PULLTIME` (0,8 s). En
  primera persona no se ve; desde fuera, sí.
- **Los monstruos no disparan.** `tossprojectile` es un comando de script con su
  propia firma (`<proyectil> <origen> <objetivo> <velocidad> <daño> <cono>`) y no
  pasa por `ChargeThrowProj`: no lleva tensado ni desvío del arco, y **no le suma
  el `AimOffset`**, porque ese `if (m_pPlayer)` deja fuera a los monstruos. O sea
  que los arqueros enemigos tiran recto y el jugador no. En Gate City no hay
  ninguno; el zombi enano de ballesta y el arquero voldar están en otros mapas.
- **Una flecha no se clava en el bicho.** El motor la pasa a
  `MOVETYPE_STUCKARROW` y la cuelga de él; aquí se para donde chocó.
- **Un bicho muerto no para una flecha** («Hit a dead monster, keep going»,
  giprojectile.cpp:144). Aquí sí la para, porque el colisionador del cadáver se
  quita al morir y la flecha pasa de largo por otro motivo.
- **No hay saetas ni ballestas**, y su `HITSCAN_BOLT` es otro sistema entero: el
  daño lo hace un `xdodamage` del propio script sobre una traza de 8 000
  unidades, no la flecha. El lector se queda con el dado en vez del 0 que ve el
  motor, y está anotado en el código.
- **La munición se gasta al soltar y no al empezar a tensar.** El motor la gasta
  en `StartAttack`, o sea que morirse tensando te come la flecha. Da el mismo
  resultado mientras no haya forma de morir tensando; queda dicho porque es una
  diferencia y no un descubrimiento.

## 8. Y la deuda que ya va por tres

Tres experimentos seguidos han encontrado código muerto con la batería entera en
verde: la IA apagada (21), el paseo que el bucle no llamaba (22) y un arma sin
conectar (23). El patrón es siempre el mismo: **la sonda llama al módulo que
quiere medir en vez de llamar a lo que llama el juego.**

En el 23 se ha hecho lo que se podía hacer para no repetirlo: el bucle de
fotogramas y `probe.arco` entran los dos por `pasoDelBrazo`, que es una función
sola. Pero eso arregla el arco, no el problema.

Lo que hace falta es un control que no conozca ningún sistema: **un censo de lo
que el personaje puede llevar en la mano y una comprobación de que cada cosa
hace algo cuando se pulsa el botón.** Siete armas, siete controles. Con eso, el
arco de árbol habría salido en rojo en el 18.

Queda apuntado en `NEXT_SESSION.md` como lo primero del 24.
