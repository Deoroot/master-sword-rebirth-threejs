# Experimento 82 — por qué una rata no te devolvía el golpe

El usuario lo reportó jugando en Edana: «parece que las ratas no están golpeando
de vuelta al jugador». Eran **dos fallos distintos, encadenados**, y ninguno de
los dos era el daño.

El 80 ya había puesto un control delante de una rata y había encontrado tres
cosas. Las tres eran del golpe **del jugador**. Esto es el camino espejo.

---

## 1. Lo primero que hubo que descartar: el daño

La captura del usuario mostraba «Giant Rat hits you: 0.4 slash damage», y 0,4
parece poco. No lo es:

```
monsters/giantrat.script
   const ATTACK_DAMAGE 0.4
   const ATTACK_HITCHANCE 30%
   hp 4
```

Declarado **antes** de su `#include monsters/base_monster`, así que por la regla
del 66 (`const` gana el primero) es el valor que vale. Una rata de Master Sword
tiene 4 de vida y pega por 0,4: es el bicho más flojo del juego. **El 0,4 es
fiel y no se toca.**

Y el `ATTACK_HITCHANCE 30%` importa para entender el reporte: siete de cada diez
mordiscos no hacen nada. Un mordisco que falla no tiene texto ni daño, así que
**«me pega poco y a veces» y «no me pega» se leen igual en pantalla.** Eso no es
un fallo nuestro, pero es la razón de que el fallo que sí había se viera así.

La captura resultó ser además **del juego original**, o sea la referencia de lo
que tiene que pasar, no una foto del fallo. Lo aclaró la sesión que repartió la
tarea.

---

## 2. El primer fallo: una rata recela, y nadie portó la rama que la provoca

`races.script` dice que `vermin` declara `recelo human`, o sea RELACIÓN RECELO.
Y RECELO **no es «enemigo»** para la caza: el motor lo limita a cuatro casos
concretos y RECELO no está entre ellos (npcscript.cpp:1806). O sea que una rata
no te toma como objetivo por verte, y eso es correcto.

El único camino por el que llega a atacarte es el golpe recibido
(`base_npc_attack_new.script:1075-1089`):

```
if ( $get(NPCATK_TARGET,isplayer) ) local L_FIRST_STRUCK 1
if ( NPCATK_TARGET equals unset )   local L_FIRST_STRUCK 1

if ( L_FIRST_STRUCK )
{
    if !IS_FLEEING
    if $get(ent_laststruck,relationship,ent_me) equals wary     ← aquí
    callevent npcatk_settarget $get(ent_laststruck,id) "struck_by_enemy"
}
else
{
    if $get(ent_laststruck,id) isnot NPCATK_TARGET
    callevent npcatk_retaliate INC_PARAM
}
```

La condición es literalmente `equals wary`. **Esa rama existe para los bichos
que recelan**, y es la que faltaba: en este puerto, pegarle a una rata no tenía
ninguna consecuencia. Te mira y sigue a lo suyo.

### Lo que hizo difícil verlo, y es lo interesante

**La otra rama del mismo `if` SÍ estaba portada, estudiada y con pruebas.**
`cambiaDeObjetivo` en `src/play/reaccion.js` porta `npcatk_retaliate` con un
análisis cuidadoso: el mod tiene su plazo escrito del revés
(`NPC_NEXT_RETALITATE` sólo se escribe dentro de la rama que nunca se toma, así
que se queda en 0 para siempre), de modo que `RETALIATE_CHANCE 75%` es dato
muerto. Ese análisis es **correcto**.

Lo que se pasó de ancho fue la conclusión, escrita al lado:

> «ningún monstruo cambia de objetivo por recibir un golpe»

Es verdad de `npcatk_retaliate` y falsa del `if` que lo contiene. Son dos ramas
del mismo golpe, una muerta y la otra viva, y la muerta estaba tan bien
documentada que la viva no se echó de menos.

*Un análisis correcto de una rama puede dejar escrita una conclusión sobre el
`if` entero. Cuando documentes que algo del motor no se dispara, di de qué rama
hablas — porque la de al lado se lee como ya estudiada.*

La corrección se escribe **al lado** del análisis anterior y no encima, que es
lo que pide el apartado 7 de CLAUDE.md.

---

## 3. El segundo fallo: `range` no es la distancia, y el culpable es el cuerpo

Con el objetivo ya puesto, la rata se acercaba y **seguía sin morder**. Aquí
está el hallazgo que de verdad costaba ver.

`npcatk_hunt` compara con `NPC_RANGE_TYPE`, que es `range`
(`base_npc_attack_new.script:98`). Y `range` **no es la distancia entre dos
puntos** (scriptcmds.cpp:1146-1156):

```c
Dist = (pTarget->pev->origin - pev->origin).Length()
       - ((pMonster->m_Width + pMonsterMe->m_Width) / 2);
//  «MIB JAN2010_20 - range check take model widths into account»
```

Le resta la mitad de las dos anchuras. Y lo hace **porque mide entre centros y
los cuerpos se estorban**. Las cuentas de la rata:

| | |
| --- | --- |
| el jugador se mide por su **centro** | 36 unidades sobre sus pies: su caja es de 72 y el `origin` está en medio |
| la rata se mide por sus **pies** | el `origin` de un monstruo está abajo: `UTIL_SetSize(pev, Vector(…, 0), Vector(…, m_Height))`, msmonsterserver.cpp:244 |
| y las dos cajas son de 32 de lado | así que los centros no se acercan a menos de **32** en horizontal |

```
hypot(32, 36) = 48,2        contra un ATTACK_RANGE de 48
```

**Cuatro décimas de unidad, para siempre.** No le faltaba alcance: le estorbaba
su propio cuerpo, que es exactamente lo que esa resta del motor compensa.
Restando sus 16 son 32,2 y muerde.

Es el borde del 81 otra vez, y conviene decirlo con sus palabras: *cuando tu
puerto aterriza por construcción justo en el umbral de una comparación del
motor, el caso del borde deja de ser raro y pasa a ser el único.* Aquí no lo
pone la aritmética de un `avanzar`: lo pone la geometría de dos colisionadores.

El motor hace la misma suma **otra vez** por su lado, al pegar de verdad:
`flMonsterDamageRange += (pMonsterMe->m_Width / 2)` y lo mismo con el objetivo
(npcscript.cpp:1150-1154). O sea que la aplica dos veces, al decidir y al herir.

### Las dos cosas que no son obvias

1. **La anchura del jugador es 0.** `m_Width` sólo se asigna en el `width` de un
   guion de NPC (npcscript.cpp:201) y el del jugador no lo trae — aunque el
   jugador sea un `CMSMonster` y entre por la misma rama del `if`. Es el mismo
   hallazgo del 81. Darle los 32 de su caja regalaría 16 unidades de alcance que
   el motor no da.
2. **No se topa a cero.** El motor deja que `range` salga negativo. Topar a cero
   sería inventarse una regla para que el número se lea mejor.

Y la frontera que **no** lleva la resta: el alcance de persecución, que se
compara con `$dist(MY_ORG,TARG_ORG)` (`:258`), entre dos vectores y sin
anchuras. Ver el apartado 5: esa frontera no la defendía nada.

---

## 4. Por qué el 80 no lo vio, con un experimento entero mirando a esta rata

Su arnés (`test/combate80.test.mjs`) pone al jugador en `[aU, 0, 0]`: **a la
altura de los pies de la rata.** Ahí el término vertical vale cero, la distancia
3D es la horizontal, 32 < 48, y no hay nada que ver.

Es el 71 calcado —*una prueba sobre una diferencia tiene que poner los números
en los que la diferencia existe*— y merece decirse en voz alta porque el 80 no
fue descuidado: encontró tres fallos de este mismo bicho en una sesión. **El
arnés aplanaba justo el eje en el que vivía el cuarto.**

Por eso en el 82 el jugador está siempre de pie, a 36, y hay una prueba que
documenta el caso tumbado para que no vuelva a parecer equivalente.

---

## 5. Lo que se midió, y una rotura que se quedó verde

**18 + 10 pruebas de Node** (`test/mordisco82.test.mjs`), con los números de la
rata leídos del `.script` de verdad —no copiados a mano— y el viaje entero por un
`Manada`. **14 controles de sonda** en Chromium (`npm run sonda:mordisco82`).

Siete roturas deliberadas, siete rojas. Las que enseñaron algo:

| rotura | qué salió |
| --- | --- |
| quitar la resta de anchuras | roja, y con el mensaje del usuario: «le pegué y no me devolvió el golpe en 12 s» |
| que el cazador ignore `ia.ancho` | roja **por el viaje**, no por la regla: el 59 defendido |
| el signo al revés (sumar) | roja por el control negativo de lejos |
| desactivar `apuntarA` | roja en el viaje y VERDE en las pruebas de la regla, que es el reparto correcto |
| **meter la resta también en la persecución** | **verde en las 2 091** |

La última es la que hay que contar. La frontera entre `range` (con anchuras) y
`$dist` (sin ellas) es real y está citada, y **nadie la defendía**: un bicho
ancho habría perseguido media anchura más lejos que en el motor sin que nada se
pusiera rojo. Ahora hay un control con los dos lados del umbral, 4008 y 3990.

Y la sonda, con el arreglo quitado, baja a **11 de 14** dejando el cuadro exacto
del reporte: la rata te tiene fichado, se acerca, y la vida no se mueve.

---

## 6. Lo que entendí mal por el camino

| creí | era |
| --- | --- |
| que `ia.ancho` no se horneaba, y cablée la anchura desde el censo hasta el cazador | que **mi volcado estaba truncado a 1 200 caracteres**. `ia.ancho` vale 32 y lo trae la propia ficha. El cableado era una segunda fuente para el mismo número, y dos fuentes es como se consigue que una se arregle y la otra no. Se quitó. *Antes de concluir que un campo falta, mira si tu volcado lo estaba cortando* |
| que mi contador de intentos medía intentos | que medía **fotogramas con la intención puesta**: `i.intencion` sobrevive entre ciclos de pensar, así que diez segundos daban **177 intentos** y una tasa de acierto del 5 %. Los intentos se leen de `manada.sucesos` (`pega` + `falla`), que se emiten una vez por golpe. Es el 67 y el 68 —*un contador de «cuántas veces se ha pedido» no mide «cuántas veces ha pasado»*— y lo pisé **escribiendo la prueba que los cita** |
| que «de lejos no pega» era un control | que la rata **había llegado**: corre a 76 u/s, o sea casi dos metros por segundo, y en diez segundos cubre veintitrés metros. El control salía rojo con el trabajo bien hecho. Lo que hay que fijar es **la separación, no el punto** — el 69 otra vez, y pasó las dos veces, en la prueba de Node y en la sonda |
| que mi arnés medía la rata de Edana | que la hacía **hostil**, copiando el del 80 (`relacion: RELACION.ODIO`, `hostil: true`). Eso es un bicho que el juego no tiene, y encima **se tragaba la mitad del fallo**: con la rata hostil ficha al jugador por verlo, así que la rama que faltaba quedaba tapada. Y la relación la escribía a mano en el candidato, cuando en el juego sale de `i.ficha.relacion`: el 59 por enésima vez. Ahora el arnés usa la relación de verdad y cada prueba provoca |
| que la frase de la captura salía de nuestro árbol | que era **del juego original**. Nuestras dos líneas dicen `hits you: N damage` y la del motor mete el tipo dentro y un corchete de resistencia (giattack.cpp:1994). Lo avisó la sesión que reparte; buscar un tercer sitio en nuestro código habría sido una pasada perdida |
| que `probe.mundo.donde()` daba el alto del jugador, y que había un `probe.ia.ciego` | que ni una cosa ni la otra. Se comprobó antes de pasar la sonda, que es lo que el 78 pide después de pagarlo con un `mirar` de aridad mal |

---

## 7. Lo que queda

- **El mensaje de recibir un golpe.** `main.js:4981` y `:5071` dicen
  `hits you: N damage`; el motor dice `%s hits you: %s %s` con el tipo dentro
  del propio `szDamage` («0.4 slash damage») y un tercer hueco que es
  `tdm_engrish`: `" "` normalmente, y `[%i%% resistant]` o `[%i%% vulnerable]`
  si hay resistencia (giattack.cpp:1922-1931, :1994). **No portado**: el tipo es
  inmediato, el corchete necesita la tabla de resistencias y no se ha medido
  cuál usa cada bicho. Lo encontró la sesión que reparte las tareas.
- **`npcatk_retaliate`, la rama de cambiar de objetivo peleando ya con otro.**
  Sigue muerta en el mod y sigue portada con su fallo, y eso no cambia. Lo que
  hoy no se puede medir es el caso en que un bicho pelea con otro bicho: en este
  puerto los únicos objetivos son jugadores. `apuntaAlQueTePega` ya pregunta por
  `objetivoEsJugador` en vez de darlo por hecho, para que el día que eso exista
  la rama se decida y no se herede.
- **La rama vertical del mod (`vadj`), no portada y medida.** Cuando el objetivo
  está por encima, el motor extiende el alcance a `ATTACK_HITRANGE + NPC_HEIGHT`
  (`:339-361`). Para la rata **no hace falta**: con la resta de anchuras su
  `range` es 32,2 contra 48 y entra sin ella. Y tiene una ambigüedad que hay que
  resolver antes de portarla: `NPC_HALF_HEIGHT` se escribe dos veces con valores
  distintos —`base_monster_shared.script:327-329` lo pone a la mitad y
  `base_npc_attack_new.script:157-158` lo pone al alto entero— y cuál gana
  depende del orden de los `#include`. Se declara pendiente en vez de adivinar.
- **La tasa de acierto del 30 % en el navegador.** `golpesRecibidos` cuenta
  impactos y el probe no expone los intentos. Se mide en Node sobre
  `manada.sucesos`; en la sonda está declarada pendiente y no contada.
