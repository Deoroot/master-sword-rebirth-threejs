# 49 — El cableado del mapa: `target`, `targetname` y quién llama a quién

> `src/play/disparadores.js` · `test/juego_disparadores49.test.mjs`
> · `sondas/disparadores49.mjs` · sección 3c de `tools/gatecity.mjs`

El **paso 2** del plan, aparcado en el 43 con una medida y desaparcado en el 48
con otra. Hasta aquí, cada cosa del mapa que hacía algo lo hacía por su cuenta:
el agua moja, la puerta gira, la losa mata. Lo que faltaba es **el cable** —una
entidad que nombra a otra y la usa—, que es la mitad de cómo se programa un
mapa de Half-Life y lo que Master Sword hereda entero.

Ahora está, con 39 entidades cableadas en Gate City y 66 en Edana.

## Lo que hace un bus de GoldSrc, en dos funciones

```c
// subs.cpp:203-235
void FireTargets(const char* targetName, ...) {
    if (!targetName || !targetName[0]) return;
    ...
    for (;;) {
        pentTarget = FIND_ENTITY_BY_TARGETNAME(pentTarget, targetName);
        if (FNullEnt(pentTarget)) break;
        pTarget->Use(pActivator, pCaller, useType, value);
    }
}
```

**A todas las que se llamen así**, no a la primera. En Gate City hay cinco
`msarea_music` que se llaman `cavemusic`; en Edana, dos `func_door` llamadas
`door2`. Y `Q_strcmp` (`pr_cmds.cpp:942`) **distingue mayúsculas**, que es por
lo que tres objetivos de Edana no encuentran a nadie.

La otra es `SUB_UseTargets`, que le pone delante el `delay` y el `killtarget`
de quien dispara. Y ahí está lo primero que hay que contar.

## HAY DOS `SUB_UseTargets`, Y UNA NO DISPARA NUNCA

No son virtuales (`cbase.h:507` y `cbase.h:732`), así que decide el tipo
estático de quien llama. La de `CBaseDelay` está bien. La de `CBaseEntity` es
ésta, entera:

```c
// subs.cpp:191-202
void CBaseEntity::SUB_UseTargets(CBaseEntity *pActivator, USE_TYPE useType, float value)
{
    //Thothie OCT2007a
    //- if (!FStringNull(pev->target)) does not seem to stop null events firing
    if (!pev->target)
    {
        FireTargets(STRING(pev->target), pActivator, this, useType, value);
    }
}
```

`pev->target` es un `string_t`, o sea un entero. `!pev->target` es cierto
**sólo cuando no hay objetivo**, y entonces dispara la cadena vacía, de la que
`FireTargets` sale en su primera línea. Arreglando un problema de eventos nulos
se invirtió la condición y la función dejó de hacer nada.

De todo lo que hay en los dos mapas, la única entidad que baja por ahí es
`multisource` (`CMultiSource : CPointEntity : CBaseEntity`, y su `Use` la llama
en `buttons.cpp:211`). O sea: **un multisource puede abrir una puerta como
`master`, pero no puede disparar su propio `target`.** Edana tiene uno,
`wave3`, con `target boarboss` y dos relés que lo alimentan: el jefe de los
jabalíes no llega nunca por esa vía.

Se porta con el fallo, como manda la casa. Y **con una prueba que lo rompe**,
que es donde esto casi se me escapa: ver la sección de las roturas.

## Lo que se portó

| entidad | lo que hace | cita |
| --- | --- | --- |
| `trigger_once` / `trigger_multiple` | tocar dispara; el `once` se borra, el `multiple` se enfría | `triggers.cpp:1343` |
| `trigger_relay` / `mstrig_relay` | reenvía, con `triggerstate` y `random` | `triggers.cpp:246` |
| `multi_manager` / `mstrig_multi` | hasta 16 objetivos escalonados en el tiempo | `triggers.cpp:415` |
| `multisource` | puerta lógica Y, como `master` | `buttons.cpp:170` |
| `trigger_changetarget` | le cambia el `target` a otra | `triggers.cpp:2676` |
| `env_render` | le cambia el aspecto a otra, con máscaras | `triggers.cpp:535` |
| `trigger_teleport` | mueve y **gira**, ciclando destinos | `triggers.cpp:2275` |
| `trigger_push` | empuja, con sus propias banderas | `triggers.cpp:2208` |
| `msarea_monsterspawn` | recibe el disparo… y lo ignora | `msmapents.cpp:753` |

Y el armazón de todas: `delay`, `killtarget`, `master`, `spawnflags`,
`USE_TYPE` y el `game_triggered` que `FireTargets` le manda al `game_master`.

### Seis cosas que no se adivinan

1. **`triggerstate` no es un `USE_TYPE`.** `0 → USE_OFF`, `2 → USE_TOGGLE`, y
   *cualquier otra cosa* `→ USE_ON` (`triggers.cpp:219`). Copiar el número
   daría `USE_SET`, que es otra.
2. **Un `multi_manager` convierte en objetivo toda clave que no reconozca**
   (`triggers.cpp:357`), y quién la reconoce antes es `EntvarsKeyvalue` con su
   tabla de 77 campos (`util.cpp:209`, y compara sin distinguir mayúsculas).
   `style` **no** está en esa tabla; `delay` y `killtarget` tampoco, y
   `CMultiManager::KeyValue` no llama a su base, así que en un manager serían
   objetivos.
3. **`UTIL_StripToken` corta en la almohadilla** (`util.cpp:2012`): así es como
   un manager dispara dos veces el mismo nombre con dos retrasos —`pstartl` y
   `pstartl#1`, que es lo que hace el `pstart` de Edana—.
4. **Un `multisource` sin entradas está ABIERTO.** El bucle es
   `while (i < m_iTotal) ...; if (i == m_iTotal) return 1`, y con cero entradas
   se cumple en el acto (`buttons.cpp:227`).
5. **`UTIL_IsMasterTriggered` mira sólo a la PRIMERA** entidad con ese nombre, y
   si esa primera no lleva `FCAP_MASTER` escribe «Master was null or not a
   master!» y **devuelve 1** (`util.cpp:1481`). Un `master` mal escrito no
   cierra nada.
6. **El `delay` de un teletransporte no retrasa: enfría** (`triggers.cpp:2282`),
   y los destinos **se ciclan**, no se sortean (`iTeleIdx++`, y el comentario
   de al lado dice que antes era al azar). Además el enfriamiento se guarda en
   `flLastTriggeredTime` y se comprueba con `> 0`, así que **un teletransporte
   usado en el segundo cero no arma su enfriamiento**: el cero significa las
   dos cosas.

## EL RESULTADO EN GATE CITY: once disparos, nueve áreas, cero efectos

Ésta es la medida del experimento, y es la que el 43 dejó a medias.

La cadena de Gate City es ésta, y **funciona entera**:

```
5 trigger_once  ─┬─> spawners1, spawners2, spawners3        (áreas)
                 ├─> mm_spiders  ─> spawners4, spawners5    (a 0 s los dos)
                 └─> mm_zombies  ─> spawners6 (1 s), 7 (2 s), 8 (3 s), 9 (4 s)

func_breakable *83 (250 hp) ─> spawners10 ─┬─> el área spawners10
                                           └─> trigger_relay, delay 10 ─> spawn_bowguys
```

Se anda por los cinco volúmenes y salen **once disparos** —nueve áreas y dos
multi_manager por el camino—, cada uno a su hora. Y las nueve llegadas a un
área **se ignoran todas**:

```c
// msmapents.cpp:755-759
void ResetUse(...) {
    if (m_fActive) {
        if (!resetwhen) return;
    }
    ...
```

Las 16 áreas de Gate City nacen activas —ninguna pone `spawntrigger`, así que
`m_fSpawnOnTrigger` es falso y `Spawn()` pone `m_fActive = true`— y **ninguna
pone `resetwhen`**. Lo mismo en Edana con las catorce suyas.

O sea: **no es que no se dispare nada. Es que se dispara todo y el destinatario
lo tira.** Romper el barril del bosque enciende un relé que espera diez
segundos exactos y llama a un área que no contesta.

Y el control de que eso es del mapa y no nuestro: poniendo `resetwhen 2` a las
mismas áreas, las nueve reinician. Está en la prueba.

## En Edana el bus sí lleva a alguna parte

66 entidades cableadas: cuatro teletransportes con destino de verdad, siete
`env_render`, dos `trigger_changetarget` que se intercambian el disparador de
la puerta del alcalde, un empuje de 900 u/s, seis `multi_manager` y ocho relés.
Tocar los cuatro teletransportes mueve al jugador, y eso se mide.

**Tres objetivos del mapa no existen**: `lol`, `sewerlight` y
`renderfountainBEANS` —este último, con `renderBEANS` y `renderFountainNormal`
al lado, huele a copia y pega—. El motor los ignora sin decir nada, así que el
bus los cuenta como `sin_destinatario` en vez de tragárselos.

## Cómo se comprobó

**44 comprobaciones de Node** y **doce roturas a propósito**, todas rojas:

| rotura | rojas |
| --- | --- |
| `triggerstate` se copia tal cual | 1 |
| la almohadilla no se corta | 2 |
| el manager no filtra los entvars | 2 |
| el manager no ordena por retraso | 2 |
| `FireTargets` usa sólo a la primera | 2 |
| un multisource sin entradas queda cerrado | 1 |
| el maestro mira a todos y no al primero | 1 |
| **se «arregla» el multisource del mod** | **1, a la segunda** |
| el teletransporte sortea en vez de ciclar | 1 |
| el área de aparición no ignora el disparo | 2 |
| el retraso se pierde | 3 |
| el enfriamiento del `trigger_multiple` no cuenta | 1 |

### La rotura que dio cero, y lo que enseñó

«Se arregla el multisource» dio **cero rojos** a la primera, y esta vez la
rotura sí había entrado. El motivo es mejor que el de las dos veces
anteriores: **yo había codificado el fallo dos veces.** Escribí la condición
invertida *y*, dentro, una cadena vacía a mano. Así, quitar la inversión no
cambiaba nada, porque el cuerpo seguía disparando la nada.

El motor lo tiene mal **una sola vez**: la condición. El argumento es correcto.

> Un fallo portado tiene que distinguirse del bueno **por un solo operador**, o
> no se puede comprobar que está portado. Un fallo escrito dos veces es un
> fallo que no se puede romper.

### Y una sonda: `npm run sonda:disparadores49`, 13/13

En Chromium, con un personaje y andando. Y tiene una forma nueva y peligrosa
del apartado 4 de [CLAUDE.md](../CLAUDE.md): **en Gate City el resultado
correcto es que no se vea nada**, así que un bus que no funcionara daría la
misma pantalla. Contra eso no vale mirar el mundo, hay que mirar la cuenta, y
al lado tres controles que no dependen de ella:

- antes de entrar en el volumen la cuenta es **cero**;
- el `trigger_once` **desaparece** al dispararse (39 vivos → 38, 5 tocables → 4);
- el multi_manager reparte: **1 de 4 a 1,4 s y 4 de 4 a 5 s**, y la prueba
  exige que la primera cifra sea menor que la segunda.

`npm test` **1320/1320**. Sondas vecinas: `arranque36` 22/22, `misiones33`
23/23, `intro42` 14/14, `mundo` 40/40, `ia` 15/15, `edana48` 15/15, `mapa`
32/33 (el rojo conocido del 37).

## Lo que este experimento NO hace

- **De los efectos, sólo tres llegan al mundo**: el teletransporte, el empuje y
  el mensaje. Los demás —usar una puerta, romper algo, cambiar el aspecto de
  una entidad, reiniciar un área— **se cuentan y se dicen** (`disparosSinPortar`
  en la sonda) en vez de tragarse. Esa cuenta es la medida de lo que falta.
- **Nada dispara todavía desde el juego hacia el bus**: las puertas y los
  rompibles pueden ser disparados pero no disparan. Romper el barril de Gate
  City hay que hacerlo a mano; el `func_breakable → spawners10` está medido en
  una prueba, no jugando.
- **El `scriptevent` de un disparador sale como efecto y nadie lo recoge.**
  El intérprete existe desde el 33 y engancharlo es el paso natural siguiente:
  `UTIL_DoTokenScriptEvent` sobre el que toca.
- **`reqhp`, `reqavghp` y `reqplayers` no se aplican.** Ninguno de los dos
  mapas los usa; se extraen y el bus avisa si aparecen, en vez de ignorarlos.
  (Y de paso: el del `reqplayers` está escrito al revés que el del `reqhp` —
  `if (min_players < max_players) max_players = 0`, `triggers.cpp:1461`— así
  que un `reqplayers "2 5"` razonable se anula solo. No lo usa nadie.)
- **El empuje va a la velocidad y no a `basevelocity`**, porque no tenemos
  `basevelocity`. Un campo de empuje continuo se comporta como una suma.
- **Los `multi_manager` con `SF_MULTIMAN_THREAD` no se clonan.** Edana tiene
  dos. Con un jugador no se nota; con dos, sí.

## Lo siguiente

Enganchar las dos puntas sueltas del cable: que romper un `func_breakable` o
abrir un `func_door` **dispare**, y que el `scriptevent` de un disparador entre
en el intérprete. Con eso, el barril del bosque de Gate City haría lo que hace
en el juego — que resulta ser nada, y ya sabemos por qué.
