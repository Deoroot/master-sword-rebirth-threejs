# 40 · La carga: la mano cambiada y el tope que faltaba

Tres fallos, uno de ellos mío desde el 24, los tres vistos jugando y ninguno de
ellos cazado por las 1 034 pruebas que había. Al arreglarlos la cuenta sube a
**1 040** y `sonda:pulido` pasa de 38 a 41 controles.

Lo que se reportó, literal:

> para el arma de la mano derecha, hacer click y dejarlo presionado debería
> hacer aparecer la barra de la mano derecha y después de cargar la barra 1
> completa y soltar el click hacer un ataque cargado. ahora aparece el de la
> mano izquierda y sigue cargando después del 1 por algún motivo. el rusty
> short sword no debería tener más de 1 nivel de carga tampoco.

Las tres cosas eran ciertas y las tres tenían causas distintas.

---

## 1 · La mano estaba cambiada, y sólo la etiqueta

La geometría de las dos barras estaba bien desde el 24, con su errata de
precedencia de C portada y todo. Lo que estaba mal era **qué mano es cada
índice**:

```c
enum hand_e { LEFT_HAND, RIGHT_HAND, HAND_PLAYERHANDS, ANY_HAND, BOTH_HANDS };
                                                     genericitem.h:15-23

int Bar = Item->m_Hand < 2 ? Item->m_Hand : 1;        vgui_health.h:234
```

`LEFT_HAND` vale **0**. Y el multiplicador de la posición es `(i == 0) ? -1 : 1`,
o sea que el índice 0 sale a la izquierda del ancla. Cada barra cae del lado de
su mano, que es lo único que tiene sentido. Nosotros teníamos
`["derecha", "izquierda"]`, así que la espada —que va en la derecha— encendía la
barra de la izquierda.

Un `func_*` de esto: un arma a dos manos es `BOTH_HANDS == 4`, y el
`< 2 ? : 1` la manda a la barra 1, la derecha. Queda portado sin tocar nada,
porque sale solo del índice.

**Por qué ninguna prueba lo vio.** Había dos, y las dos escribían

```js
const [derecha, izquierda] = cargaEn(640, 480);
assert.equal(derecha.x, 304 - 30);
```

Desestructurar por posición y comprobar sólo la `x`. El nombre de la variable
decía «derecha» y el campo `.mano` del objeto decía «derecha», y las dos cosas
eran la misma equivocación mirándose al espejo. La prueba nueva mira **el
nombre y el lado a la vez**, que es lo que el jugador ve:

```js
const der = barras.find((b) => b.mano === "derecha");
assert.ok(der.x > ancla);
```

---

## 2 · El tope de carga es del ARMA, y no estaba

```c
float Charge = GET_CHARGE_FROM_TIME(ChargeDuration);
float HighestCharge = GetHighestAttackCharge();

Charge = V_max(Charge, 0);              //Cap ratio at 0
Charge = V_min(Charge, HighestCharge);  //Cap ratio at highest charge found
                                                       giattack.cpp:1106-1111
```

La segunda línea de tope es la que faltaba. Sin ella el reloj sube para siempre:
la barra se vacía y se vuelve a llenar en el nivel 2, en el 3, en el 4, con el
aviso sonando en cada vuelta, por niveles que el arma **no tiene**. Que es
exactamente lo que se veía: «sigue cargando después del 1».

`GetHighestAttackCharge()` no es una constante del sistema, es del arma, y
además mira la destreza:

```c
for (int i = 0; i < m_Attacks.size(); i++) {
  attackdata_t &Attack = m_Attacks[i];
  if (Attack.flChargeAmt <= HighestCharge) continue;
  if (m_pOwner && Attack.RequiredSkill) {
    int Stat = m_pOwner->GetSkillStat(Attack.StatProf, Attack.PropProf);
    if (Stat < Attack.RequiredSkill && i > 0) continue;
  }
  HighestCharge = Attack.flChargeAmt;
}                                                      giattack.cpp:600-628
```

El `i > 0` es el mismo indulto al primer ataque que ya estaba portado en
`elegir`: al de índice cero no se le mira la destreza nunca.

Los topes de las ocho armas del catálogo, medidos:

| arma | cargados | tope | `reqskill` |
| --- | --- | --- | --- |
| `swords_rsword` | 1 | **1** | 2 |
| `axes_rsmallaxe` | 1 | 1 | 2 |
| `fist_bare` | 1 | 1 | 5 |
| `smallarms_rknife` | 2 | **2,5** | 2 y 4 |
| `blunt_hammer1` | 2 | 2,5 | 2 y 4 |
| `polearms_qs` | 2 | 2,5 | **0 y 0** |
| `bows_treebow` | — | 0 | — |

La espada oxidada tiene **un** nivel, que es lo tercero que se reportó.

---

## 3 · Y lo que el tope arrastra: sin destreza no hay barra

Esto no se pidió y hay que decirlo claro, porque se ve.

El tope de la espada oxidada es 1 **si tienes swordsmanship proficiency 2**. Su
único cargado se registra así:

```
local reg.attack.chargeamt  100%
local reg.attack.reqskill   2
                                   MSCScripts/scripts/items/base_melee.script:117-118
```

Y `reg.attack.stat swordsmanship` sin propiedad deja `PropProf = 0`, que es
`STATPROP_PROFICIENCY` (giattack.cpp:514-531). O sea que se compara contra la
**pericia**, que es justo lo que lee nuestro `destrezaDe`.

Un personaje recién hecho tiene swordsmanship proficiency **0**. Con lo cual
`GetHighestAttackCharge()` devuelve 0, `ActivateButtonDown` ni arranca el reloj
—`&& GetHighestAttackCharge()`, genericitem.cpp:735-741— y `Attack_IsCharging()`
devuelve `false` de entrada (giattack.cpp:1077-1078). **No hay barra, ni
niveles, ni sonido, hasta que la pericia llegue a 2.**

Antes del 40 la barra salía igual, porque el reloj arrancaba con
`this.ataques.some((a) => a.carga > 0)`, que no mira destreza. Lo que salía era
una barra que no llevaba a ningún sitio: al soltar, `elegir` descartaba el
cargado por destreza y caía en la salida de emergencia del motor.

El bastón —`polearms_qs`— es el arma con la que esto se puede ver sin haber
entrenado: dos cargados, los dos a `reqskill 0`.

---

## 4 · El `chargeamt` pasa por la misma curva que los segundos

Al leer el script el motor hace:

```c
attData.flChargeAmt = atof(GetFirstScriptVar("reg.attack.chargeamt")) / 100.0f;
if (attData.flChargeAmt > 0)
  attData.flChargeAmt = GET_CHARGE_FROM_TIME(attData.flChargeAmt);
                                                       giattack.cpp:487-489
```

O sea **la misma macro a los dos lados**: a los segundos aguantados y al
porcentaje del script. Por eso los niveles caen en segundos enteros. Nosotros
sólo la aplicábamos a los segundos, así que el segundo nivel del cuchillo y del
martillo pedía 2 de carga —1,67 s— en vez de 2,5, que son 2 s justos. Un tercio
de segundo antes de tiempo, dos armas.

Va en el lector (`src/bsp/script.js`) y no en la regla, que es donde lo hace el
motor, con la macro copiada y no importada: el lector lo usan las herramientas
de horneado, que corren sin nada de `src/play/`. Una prueba comprueba que las
dos gemelas dicen lo mismo.

---

## Lo que cambia, y lo que no

```
src/play/hud.js        los nombres de las dos manos, al derecho
src/play/golpe.js      `cargaTope()` nuevo; `carga` capado; el guardián del reloj
src/bsp/script.js      `chargeamt` por la curva, con su gemela `cargaDeTiempo`
src/dev/sonda.js       `golpe.cargar()` devuelve también `tope` y `destreza`
sondas/pulido.mjs      la sección de la carga, con el bastón y tres controles más
build/gatecity/armas.json  rehorneado: el segundo nivel pasa de 2 a 2,5
```

No se toca: la geometría de las barras, la errata de precedencia, la curva
`cargaDe`, el color que vuelve atrás al desbordar, la etiqueta un número por
debajo, ni la regla del segundo clic. Todo eso estaba bien.

## Las pruebas, y las tres falsificadas

| prueba | falsificada quitando |
| --- | --- |
| `la barra de la mano derecha cae a la DERECHA del ancla` | los nombres al revés → roja |
| `la espada oxidada se para en 1 de carga` | el `V_min` → roja |
| `pero el cuchillo, que tiene dos, llega a 2,5` | el `V_min` → roja |
| `el chargeamt del script se guarda ya pasado por la curva` | `cargaDeTiempo` → roja |

El cuchillo está ahí como **positivo** del de la espada: si el tope fuera una
constante nuestra en vez del arma, los dos darían 1 y la prueba de la espada no
diría nada.

Y dos negativos más: `cargaTope(3) === 1` frente a `cargaTope(4) === 2,5` para
el cuchillo —el salto de destreza—, y `nivelDeCarga(cargaDe(3))` por encima del
nivel 2, que es adonde iba la barra sin tope.

## La sonda que medía nuestro fallo

`sonda:pulido` cargaba **la espada oxidada 2,4 segundos y esperaba llegar al
nivel 3**. Eso sólo podía pasar sin tope. Es la misma clase de control que las
cuatro ratas del 39: una medida que afirma el fallo y que se pone roja cuando
se arregla.

No se retocó el umbral: se cambió el arma por el bastón, que llega al nivel 2
de verdad, así que las cinco medidas de color, número y sonido siguen teniendo
algo que medir. Y se añadió la espada como **negativo declarado**: con destreza
0 no carga nada y no hay barra.

```
  carga           2.50 unidades en 2.42 s     <- el tope del bastón
  visible         145 fotogramas
  colores         rgba(0, 0, 0, 0.5) | rgba(100, 0, 0, 0.5)
  números         " " "1" "2"
  primera         x=626  (304+30 de 640, la DERECHA)
  sonidos         2
  espada oxidada  destreza 0, tope 0, carga 0.00, 0 fotogramas
```

## Cuentas

`npm test` **1 040** · `vite build` limpio · `pulido` 37/41 (los cuatro rojos
son los de sonido del 38, sin tocar) · `golpe` 25/25 · `hud` 36/36 ·
`escudo` 34/34 · `arco` 37/37.
