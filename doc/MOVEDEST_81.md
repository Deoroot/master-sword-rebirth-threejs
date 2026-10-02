# Experimento 81 · `setmovedest`: el gancho que llevaba un `=> {}` desde el 43

El pendiente número uno desde el 77, y el cuaderno lo tenía fichado con su
nombre: *«el gancho `irA` es un `=> {}` **desde el 43**: es el `=> {}` de relleno
del apartado 4 de CLAUDE.md, el comando está analizado, citado y con cuatro
pruebas verdes que **le construyen el gancho a mano**. Ningún NPC de este puerto
se ha movido nunca por su guion.»* (doc/ESCENAS_77.md:146)

Treinta y ocho experimentos.

---

## 1. Lo primero que se midió cambió el experimento entero

La idea de partida era «que los NPC anden cuando su guion se lo diga». Contar el
horneado la corrigió antes de escribir una línea de código.

De los **130 `setmovedest` de Edana**, repartidos en **25 de sus 27 guiones**:

| forma | cuántos | qué es |
| --- | --- | --- |
| `<quien> 9999` o `999` | **65** | **girarse a mirar a alguien** |
| `<quien> <distancia>` | 44 | andar hasta alguien |
| `none` | 12 | soltar el destino |
| `<quien> <dist> flee` | 9 | huir |
| `(x y z) <dist>` | **0** | un punto del mapa |

La mitad justa no anda. Y la razón está en `SetMoveDest`:

```cpp
if ((IsFlying() ? Length() : Length2D()) <= m_MoveDest.Proximity) {
    pev->v_angle = ExactAngle;
    pev->angles.y = pev->v_angle.y;       // <- el rumbo EXACTO al destino
    StopWalking();
    CallScriptEvent("game_reached_dest");
    return;
}
                                        msmonsterserver.cpp:1018-1029
```

9999 unidades es más que cualquier distancia de Edana, así que la condición es
cierta **en el primer `Think`**: el NPC se da por llegado sin dar un paso, se
queda con el rumbo exacto y avisa a su guion. O sea que

> **`setmovedest <quien> 9999` no es «anda hasta él»: es «gírate a mirarlo y
> párate».**

Y es con lo que un vecino de Edana se vuelve hacia ti cuando le hablas. Desde el
43, **ningún vecino se había girado nunca**.

Esto no se adivina leyendo el comando: se adivina contando cómo lo usan los
guiones. Es la lección del 80 —«una lista de sondas que cubren una regla cubre
los bichos con los que se escribieron»— aplicada a un comando en vez de a un
bicho: *portar un comando no es portar sus ramas en abstracto, es portar las que
los guiones de verdad usan, y eso se cuenta.*

---

## 2. Lo que se portó, y las cuatro cosas que no se adivinan

`src/play/movedest.js`, nuevo, puro y sin Rapier. La otra mitad —andar hasta el
punto y avisar— **estaba escrita desde el 77 y no hubo que tocarla**:
`Manada.mandarA` y `pasoMandado` SON `CMSMonster::SetMoveDest`, con los tres
avisos ya como retrollamadas.

### 2.1 Los ejes, que es donde esto se rompe sin dar un error

Un `setmovedest (-3101,351,64)` trae las cifras en los ejes del `.bsp`, donde la
altura es la **Z**. En este puerto los puntos van en unidades pero con los ejes
de Three: la altura es la **Y** y el suelo es el plano X-Z. Mezclarlos no da un
error: da un NPC que se va a andar por donde debería estar el techo, y
`haLlegado` tira la componente que no es, así que **se da por llegado a un sitio
en el que no está**.

Se cambia de ejes **una** vez, al leer el texto, y es `[x, z, -y]`.

### 2.2 El destino no es el centro del objetivo: es su piel

```cpp
float Size = pMonster->IsFlying()
    ? sqrt(pow(m_Width / 2, 2) + pow(m_Height / 2, 2))
    : m_Width / 2;
Vector vRay = EyePosition() - pEntity->EyePosition();
NewDest.Origin = pEntity->EyePosition() + vRay.Normalize() * Size;
                                        npcscript.cpp:1650-1662
```

Un punto de su superficie, el de mi lado, y **los dos tamaños son del
objetivo**. Contra lo que no es un bicho, el destino es su ojo pelado (`else`,
:1660) — y con sólo bichos delante las dos ramas dan el mismo número, que es la
trampa del 50.

**El jugador cuenta como monstruo y su ancho es cero.**
`class CBasePlayer : public CMSMonster` (player.h:396), así que `IsMSMonster()`
es `true`; pero `m_Width` **sólo se asigna en `npcscript.cpp:201`** —el `setsize`
de un guion de NPC— y un jugador no corre ninguno. Con `Size = 0` el punto de
superficie es exactamente el ojo: las dos ramas coinciden para el jugador. Va
portado con `esBicho: true` y `ancho: 0` porque eso es lo que el motor tiene, no
porque dé el mismo resultado.

### 2.3 Huir son DOS búsquedas, y la segunda sólo si la primera falla

```cpp
for (int i = 0; i < 20; i++)            // al azar, ±90° del rumbo de huida
    UTIL_TraceLine(Center(), Center() + fleeVec * 200, dont_ignore_monsters)
if (!fFoundVec)
    for (int i = 0; i < 359; i++)       // «brute force one»: grado a grado
        UTIL_TraceLine(Center(), Center() + fleeVec * 128, ...)
                                        npcscript.cpp:1664-1706
```

Tres cosas, y las tres están portadas tal cual:

1. **Las trazas miden distinto de lo que se anda.** 200 y 128, y el destino se
   pone a `flDistanceParm`, que en los guiones son 300 o más. O sea que «ese
   rumbo está despejado» se afirma sobre un tramo más corto que el viaje: el
   bicho huye hacia un hueco de 128 unidades y se estrella en el 129.
2. **`dont_ignore_monsters`**: otro bicho en medio tapa el rumbo. Es lo
   contrario de lo que hace el paseo, y por eso aquí hay **dos trazas con dos
   banderas** (`trazaLibre` y `trazaLibreConBichos`) y no una. Fundirlas sería
   elegir una de las dos al azar.
3. **Si no encuentra hueco, `fMove = false` y no se mueve.** Un bicho acorralado
   se queda quieto, y en pantalla eso se ve igual que un `setmovedest` que no
   llega a ejecutarse. Por eso hay control positivo al lado.

Y huyendo **la proximidad no es el parámetro**: es la de por omisión (:1704),
mientras el parámetro se gasta en la distancia. El mismo número con dos oficios,
y el motor lo llama `flDistanceParm` justo por eso.

### 2.4 El `Vector(0,0,1)` con el `// ????` del propio motor

```cpp
float flLen = Length();
if (flLen == 0) return Vector(0, 0, 1);   // ????
                                        src/game/server/hl/vector.h:109-116
```

Un vector de longitud cero no sale cero: sale «arriba». Con los dos ojos en el
mismo punto el destino acaba justo encima del objetivo. Devolver cero sería más
razonable y no sería MSR.

---

## 3. EL OJO DE UN BICHO ESTABA UN 10 % BAJO, EN LOS CUATRO SITIOS

Esto salió de rebote y es el hallazgo que más lejos llega.

```cpp
UTIL_SetSize(pev, Vector(-(m_Width/2), -(m_Width/2), 0),
                  Vector(m_Width/2, m_Width/2, m_Height));
InitBoneControllers();
SetAnimation(MONSTER_ANIM_WALK, m_IdleAnim);
...
pev->view_ofs = Vector(0, 0, m_Height);
                                        msmonsterserver.cpp:244-250
```

**El ojo y el casco los escribe la misma función, con el mismo número.** El ojo
de un monstruo de Master Sword está en la *tapa* de su caja. Para una rata de 32
son 32: encima de la cabeza. Raro, y es el suyo.

El proyecto hacía `alto * 0.9` en cuatro sitios, llamándolo `EyePosition()`. Y
el 0,9 **es la proporción del jugador**: su caja mide 72 y su ojo está a 64
(`src/play/movimiento.js:453`), o sea 0,889. Se le aplicó a los bichos como si
fuera una regla de anatomía.

Por qué no daba ningún error: **a quien anda le da igual**, porque la proximidad
se mide con `Length2D` y eso tira la altura. Se ve en tres sitios y ninguno es
la distancia a un punto:

| dónde | qué cambia |
| --- | --- |
| el rayo del paseo | sale un 10 % del alto bajo, y ésa es la altura a la que se decide si un rumbo está despejado. El comentario de `CINTURA` cuenta lo que costó medir esa altura la otra vez: el peor atasco contra una pared pasó de 44 s a 114 s por moverla |
| `veA`, o sea `$cansee` | los dos, `src/main.js` y `src/red/fauna.js`. Un rayo de ojo a ojo que sale bajo decide si te ve por debajo de una mesa |
| quien VUELA | ahí la rama es `Length()` y la altura entra: cambia a qué distancia se da por llegado |

Y una cuarta, que es la que lo destapó: un `setmovedest <entidad>` manda **al ojo
del objetivo** (:1660) y el punto de superficie se calcula con los dos ojos. Ahí
el ojo no es por dónde se mira: **es el destino**, y entonces el 10 % sí se anda.

Ahora hay **una sola definición**, `ojoDe(i)`, exportada desde `manada.js`, con
el porqué escrito encima. Cuatro copias del mismo número es como se consigue que
tres se arreglen y la cuarta no — y la prueba del paseo tenía una quinta copia
escrita dentro, que es la que se puso roja.

---

## 4. EL VIAJE QUE NO LLEGABA NUNCA, UNO DE CADA CINCO

El más caro de los que salieron hoy, y **es del 77, no del 81**: llevaba cuatro
experimentos latente.

`avanzar` topa el último paso a `falta - cerca` —decisión de este puerto, para
que el bicho no se meta dentro de su objetivo—, así que el NPC aterriza
**exactamente en el borde del círculo de proximidad, siempre, por
construcción**. Y ahí `haLlegado` hace el `<=` del motor entre dos flotantes.

El motor no tiene este problema porque `UTIL_MoveToOrigin` da el paso entero y se
mete *dentro* del círculo: **para el motor el borde es el caso raro y aquí es el
único caso.**

Medido: recomponer `(d/U - p/U) * U` deja un error de ±4e-14 unidades, y sobre
1 900 pares de (distancia, proximidad) **el 21,3 % cae del lado de «todavía
no»**. Ese NPC se queda clavado en el sitio con la animación de andar puesta, la
condición sin apagar y `game_reached_dest` sin disparar: **la escena del mapa que
lo espera no acaba jamás**, y su `firewhendone` nunca se dispara.

Arreglado con una holgura de 1e-6 unidades —25 nanómetros—, que no puede tapar un
fallo de verdad: no llegar se mide en decenas de unidades. No cambia la regla,
que sigue siendo «estar en el círculo ya es estar dentro»; sólo impide que la
decida el bit menos significativo de un `double`.

Es de la familia del 76: **falla una vez de cada cinco, o sea que gasta la sesión
siguiente.** Y la otra sesión añadió el dato que sube su precio: con su arreglo
del `eventname` ahora existen eventos que antes no tenían nombre, así que *había
escenas que no podían colgarse porque ni siquiera arrancaban*. Un fallo tapaba al
otro.

---

## 5. Lo que se midió en el juego de verdad

`npm run sonda:edana81` — **13 de 13**, más uno declarado pendiente.

La cadena cruza el trabajo de las dos sesiones:

```
hablas -> el NPC te oye (el 79) -> `chat_face_speaker`
       -> `setmovedest CHAT_CURRENT_SPEAKER 9999`   (su guion)
       -> `irA` -> `ganchoDeMovedest` -> `Manada.mandarA`
       -> `pasoMandado` ve que ya está cerca -> gira y avisa
```

Y lo que se lee en pantalla:

> **Sembelbin miraba a 90° —180° del jugador— y tras hablarle mira a 270°,
> exactamente al jugador.** Con `ultimoDestino` a proximidad 9999, `llegadas 1`
> y `mandado` soltado: llegó en el primer paso, o sea que giró y se paró sin
> andar un metro.

Con `irA` devuelto al `=> {}` del 43, **tres controles de la sonda se ponen
rojos**: el giro, la huella del destino y las llegadas.

Un dato que corrige lo que yo suponía al escribir la sonda: **el vecino no se
gira al acercarte. Se gira al hablarle.** Al llegarle sigue a 90°.

---

## 6. Lo que se entendió mal mientras se medía

| lo que creí | lo que era |
| --- | --- |
| que `setmovedest` es «andar hasta un sitio» | que **la mitad justa de Edana lo usa para GIRARSE**, con la proximidad a 9999. Portar las ramas en abstracto habría dejado el caso mayoritario sin medir |
| que el ojo de un bicho está al 90 % de su alto, como el del jugador | que es su alto ENTERO, y que el 0,9 era la proporción del jugador copiada a mano. **Cuatro sitios y una prueba** la llevaban escrita |
| que `rumboDe` podía ser un `atan2` pelado | que el motor normaliza a [0, 360) (`if (yaw < 0) yaw += 360`, mathlib.cpp:166). Lo cazó una prueba que esperaba 180 y leía −180; **el que estaba mal era el código** |
| que había que portar la rama del vector nulo de `VecToAngles` | que **la línea no tiene efecto**: sin ella `atan2(-0, 0)` da `-0`, que es `=== 0`, que no es `< 0`, que se imprime «0». Y leyendo el motor otra vez, esa rama está **para el PITCH, no para el yaw**. Se quitó por la regla del 78: una pieza que no se puede romper en rojo sobra |
| que la sonda podía leer el `id` de `probe.mundo.npc()` | que **esa función no devuelve `id`**, así que `plantarseDelante(undefined)` no casaba con nadie y la sonda decía «a ninguno de los tres» con el juego bien. El primo del 78. Se cruza por POSICIÓN: «Patron» hay más de uno en esa taberna |
| que plantarse delante de alguien basta para medir si se gira | que `plantarseDelante` ponía al jugador **justo en la dirección a la que el vecino ya miraba**, así que el giro no tenía nada que girar: 0° antes y 0° después, con el arreglo funcionando. **El 70 al pie de la letra.** Ahora los sitios se ordenan por cuánto se separan del rumbo que lleva |
| que mi función de separar rumbos era trivial | que llevaba un `180 - abs(...)` de más y **dos rumbos iguales daban 180°**. Lo delató que los dos números impresos coincidían y el resultado no |
| que el `21,3 %` del borde era cosa del 81 | que es del **77** y llevaba cuatro experimentos sin verse, en parte porque el fallo del `eventname` de la otra sesión impedía que algunas de esas escenas arrancaran |
| que `lineaDeVision` estaba roto, porque la otra sesión lo midió en **0 de 14 NPC** con tres ratas y un jabalí al aire libre | que **la función no se ejecuta nunca por ese camino**. Instrumentada para escribir sus piezas en un global, el global sale `undefined` en los doce casos: el getter `$cansee` devuelve «0» antes de llegar al rayo. Y por eliminación, en la única salida **sin `apuntar`** —`if (!p \|\| (p.vida ?? 0) <= 0) return "0"`—, porque `personaje()` era `null`. *Un diagnóstico ajeno, medido y con números, puede seguir apuntando al archivo equivocado; y lo que lo hizo apuntar mal fue una guarda que devuelve el valor de reposo sin decir por qué — el cajón del 63 dentro de un getter* |
| **CORRECCIÓN, el mismo día:** que `personaje()` era `null` **por el atado del menú** — porque lo rellena `pedirOpciones` y la sonda preguntaba sin pasar por ahí | que el sitio era ése y **la causa no**: la sonda de la otra sesión **no creaba personaje**. `entrarPorElMenu` no crea ninguno a propósito y lo dice en su cabecera —«quien quiera un personaje llama a `probe.sesion.nuevo(...)`»—, y esa llamada no estaba. Así que `sesion.personaje` era `null` en la sesión entera y no había atado que arreglar. Se conserva el diagnóstico de arriba porque el método —instrumentar, y luego eliminar por los `apuntar` que NO salieron— es el que llevó al sitio correcto; lo que se corrige es la causa |
| **y el error que me hizo descartar la causa de verdad, que fue mío** | que leí `probe.misiones.bolsa()` —me devolvió oro y cinco objetos— como «el personaje existe», y **ese getter devuelve `{oro, objetos, manos}` SIEMPRE**: con el personaje a `null` sale `{oro: null, objetos: [], manos: {}}`, que es un objeto, que es `true`. Descarté «no hay personaje» con una comprobación que no puede fallar, y la otra sesión repitió la misma y le salió igual. *Un objeto literal con los campos vacíos no es la cosa que describe, y un `!!` sobre un objeto nunca es una medida: si lo que quieres saber es si algo existe, pregunta por un campo que no exista cuando no está* |
| que la igualdad de un colisionador de Rapier se puede preguntar con `===` | que con `castRay` el **envoltorio JS no es el mismo objeto** que guardó quien lo creó, así que `g.collider === q.colisionador` es `false` siempre. El `veA` de al lado lo hace así y funciona porque usa `castRayAndGetNormal`. Se compara el `handle`, que es un entero y cruza el WASM sin envoltorio — que es lo que ya hacían `trazaLibre` y la traza del 80, y la línea que las imitaba era justo ésa. **No era la causa del «0 de 14», y era un fallo de verdad** |
| que pasar las sondas vecinas daría un sí o un no | que **`sonda:mundo` tiene ruido**: 41, 43, 43 de 44 en pasadas seguidas, con las rojas cambiando. Comprobado que no son del 81 por el método del 80 —devolver el ojo al `alto * 0.9` sólo en `veA` y volver a medir: las mismas rojas—. La que más repite es «el que anda y declara animación de andar, la tiene puesta», y la sospecha (no el diagnóstico) es el `#include [server]` de la tercera sesión, que acaba de cargar `base_self_adjust` entero con sus `set_mspeed`. No se toca: ajustar el umbral de un control ajeno es la trampa del 69 |
| **CORRECCIÓN, el mismo día: esa sospecha era FALSA, y la desmontó una medida y no un argumento** | que el `#include` no tiene nada que ver. La tercera sesión midió el antes/después de su propio arreglo sobre los **72 guiones distintos de los tres mapas**, en la misma ejecución, comparando `andando`, `parado`, `modelo` y `hp`: **cambian 2 de 72, y en `andando` y `parado` CERO**. (Los dos son `monsters/wolf` y `monsters/wolf_alpha`, y cambian a mejor: de `modelo: null, hp: null` a un modelo y 50 de vida.) El motivo de que no envenene aunque `set_npc_turret` traiga un `setmoveanim ANIM_IDLE` y un `setvard ANIM_WALK ANIM_IDLE`: **`vars` es «primero gana»** y `recoger` lee el fichero del bicho antes de sus `#include`, así que lo que entra por `externals` llega tarde. Lo que SÍ era: **el HMR de vite**, que recarga la página a mitad de pasada — en una de las cuatro pasadas salió el `TypeError` desnudo (`Cannot read properties of undefined (reading 'vivo')`), y `sondas/mundo.mjs` **no corta el HMR**, mientras las tres sondas nuevas sí. *Mi sospecha era plausible, citaba las líneas correctas y estaba equivocada; lo que la descartó fue medir las dos mitades, no razonar mejor. Y el ruido no venía del juego: venía de medir mientras cuatro sesiones guardan* |

---

## 7. Lo que queda, dicho con su número

1. **CON SERVIDOR, `setmovedest` NO LLEGA A NADIE — y esto lo dije de menos.**

   La primera versión de este apartado decía sólo que «`fauna.js` no tiene
   `lineaDeVision`», como si fuera un hueco del rayo. Es más grande y es mío:
   **`src/red/partida.js:216` monta su PROPIO `InteraccionesNpc`**, y ahí no van
   ni `mandarADestino` ni `lineaDeVision`. Los dos ganchos se inyectan sólo en
   `src/main.js`.

   O sea que en multijugador **el gancho `irA` sigue siendo el `=> {}` del 43**:
   ningún NPC del servidor se gira al hablarle ni anda por su guion, y `$cansee`
   contesta «no» a todo — con lo que cualquier bloque que empiece por
   `if $cansee(...)` se abandona entero, porque es un `if` VIEJO (el 67).

   Es **la costura del 63** otra vez, con las dos mitades verdes: la regla está
   escrita y medida, el camino de un jugador la ejecuta, y el del servidor no la
   recibe. Y no lo vio ninguna prueba ni ninguna sonda porque **`sonda:edana81`
   mide un solo navegador**: el caso sólo existe con dos.

   Lo levantó la otra sesión al aislar una regresión de `sonda:tienda62`, y yo lo
   verifiqué leyendo el constructor. Para el rayo hace falta además una segunda
   implementación —la física del servidor es la de `fauna.js`, no `world.world`—
   y ahí la regla de «una sola copia» se rompe por fuerza: son dos mundos de
   verdad. Lo que no puede haber son dos *aritméticas*.

   *Un gancho inyectado en un sitio no está inyectado: hay que buscar quién más
   construye esa clase. Dos constructores de la misma clase son dos juegos.*

   **CERRADO el mismo día**, con los dos ganchos puestos en
   `src/red/partida.js` y su trazo en `src/red/fauna.js`. Y la pregunta que
   quedaba —si eso obliga a tener dos copias del rayo— se resolvió **partiéndolo
   de otra manera**: la REGLA es una sola función, `loVe` en
   `src/play/movedest.js`, y lo único que cada mundo aporta es `trazar`. Son dos
   físicas de Rapier de verdad, así que el trazo se duplica por fuerza; fingir
   una copia única sería una indirección que no corresponde a nada. Lo que no se
   duplica es lo que se desincroniza.

   De paso, eso hizo **medible en Node lo que antes no se podía medir en
   ninguno de los dos lados**: `loVe` lleva siete pruebas y cuatro roturas
   deliberadas con cuatro rojas, incluida la del `handle` contra el objeto —dos
   envoltorios distintos del mismo colisionador— que es el fallo que de verdad
   tuvo este rayo. Un rayo escondido dentro de `main.js` no tenía ni una.

   Y al escribirlo salió **un segundo hueco callado, de la misma forma**: el
   resolutor del servidor buscaba al jugador con `this._jugadorDe(ref)`, y ése
   espera los identificadores internos de la IA —`j3`, de `nombreDeJugador`, que
   parte la cadena y lee un número—, mientras la referencia que trae un guion es
   la del PERSONAJE. Habría devuelto `null` siempre: un `setmovedest PARAM1 9999`
   que no manda a nadie y un `$cansee` que dice «no», o sea el mismo hueco que
   esto venía a tapar, un nivel más abajo. Quien sabe a quién se le habla es
   `partida.js`, así que el cuerpo se le pide y aquí no se adivina.
2. **La rama `(x y z)` no tiene caso en ningún mapa horneado**: cero en los tres.
   Existe en `monsters/base_npc_attack_new.script` y en `mines/rudolf.script`,
   pero ninguno de esos guiones está colocado donde podemos medir. Su control le
   da texto al lector, que es el camino de verdad del mecanismo; lo que **no** se
   puede decir es que esté medido en una partida. Declarado pendiente con su
   número, y la prueba se pondrá roja el día que haya mapa.
3. **`RetrieveEntity` no resuelve un `info_target`.** Resuelve el jugador,
   `ent_me` y un bicho por su `targetname`, que es lo que Edana nombra. Un
   destino que no se resuelve se APUNTA y no se calla.
4. **El `ENT_LASTSEEN` de `$cansee` se llama al revés de lo que hace.**
   `ClosestTarget` se sobreescribe dentro del bucle (:1838-1846), así que
   `ent_lastseen` acaba siendo **el visible más cercano, no el último visto**.
   Con un jugador da igual; con dos en la taberna cambia hacia quién se gira
   Sylphiel, y eso se puede medir con la sonda de red.
5. **El `MSTRACE_LARGEHITBOXES` del 80** sigue sin mirarse, y la caja AABB en vez
   del cilindro también.
