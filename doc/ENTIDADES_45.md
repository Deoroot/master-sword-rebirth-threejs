# 45 — Las entidades por su nombre, y el alcalde entero

> `src/play/entidades.js` · `src/play/guion.js` · `test/juego_entidades45.test.mjs` · `npm run guiones`

El 44 acabó con el alcalde a **tres**: `deleteent`, `$get_by_name` y
`$get_token_amt`. Los tres están en el mismo sitio, su último evento:

```
{ remove_spawns_loop
	local L_CUR_SPAWN $get_token(SPAWN_LIST,RSPAWN_COUNT)
	local L_KILL_SPAWN $get_by_name(L_CUR_SPAWN)
	deleteent L_KILL_SPAWN remove

	local L_NSPAWNS $get_token_amt(SPAWN_LIST)
	subtract L_NSPAWNS 1
	if RSPAWN_COUNT < L_NSPAWNS
	add RSPAWN_COUNT 1
	callevent 1.0 remove_spawns_loop
}
```

Es lo que apaga las catacumbas cuando terminas su segunda misión: borra
`spawners6` a `spawners10`, uno por segundo, y Gate City deja de reponer
zombis.

## Lo que cambia

| | 44 | ahora |
| --- | --- | --- |
| comandos de 223 | 36 | **38** |
| getters | 8 | **10** |
| el censo (menú / alguna opción / **entero**) | 88 / 78 / 19 | 88 / 78 / **20** |
| `gatecity/mayor` | le faltan 3 | **ENTERO** |

Dos NPC de Gate City caben ya enteros, Kendra y el alcalde. Lo que le falta al
resto **no ha cambiado**, porque no es esto:

| | comandos y getters | propiedades de `$get` |
| --- | --- | --- |
| `gatecity/storage` | `menuitem.remove` `calleventloop` `multiply` `menu.open` | `maxhp` |
| `gatecity/vendor` | `gplayermessage` `array.create` `helptip` `array.add` `catchspeech` `menu.open` `$get_arrayfind` | `steamid` `maxhp` `strength` |
| `gatecity/armorer` | los siete del vendedor y `playrandomsound` | `dist` y los tres de arriba |

## Los cinco detalles que no se adivinan

**1. `$get_by_name` devuelve un ASA, no un nombre ni un índice.** Devuelve
`EntToString(pEntity)` (script.cpp:1445), que es

```c
#define ENT_FORMAT ENT_PREFIX "(%i,%u)"        // "PentP"
_snprintf(RetString, ..., ENT_FORMAT, pEntity->entindex(), (int)pEntity);
                                       sharedutil.cpp:80-90
```

o sea `PentP(índice,dirección)`, **con el puntero metido dentro**. Y quien la
recibe la deshace comprobando las dos cosas:

```c
CBaseEntity *pEntity = MSInstance(INDEXENT(Idx));
if (!pEntity || (uint)pEntity != Addr) return NULL;
                                       sharedutil.cpp:101
```

Eso no es ceremonia, es lo que hace que **un asa caduque**. El alcalde guarda la
suya en `L_KILL_SPAWN` y la usa en la línea siguiente, en un bucle que va
borrando entidades: sin la dirección, el asa de la vuelta anterior apuntaría a
lo que hubiera caído en ese índice y el bucle borraría otra cosa. Hay una prueba
que reutiliza el hueco a propósito y comprueba que el asa vieja **no** vale.

**2. El segundo parámetro de `$get_by_name` existe en la documentación y no en
el código.** La cabecera dice `$get_by_name(<name>,<property>)` y hasta
recomienda «likely best to `$get_by_name(<name>,id)`, then store in a var»
(script.cpp:1432-1434). La función **no lee `Params[1]` ni una vez**. Se porta
ignorándolo. Un port que lo hubiera implementado habría hecho un juego distinto
del que hay.

**3. `deleteent` sin `remove` detrás NO borra una entidad del mapa.** Con un
solo parámetro llama a `game_deleted` y a `DelayedRemove()`, que es la baja
ordenada de una entidad con guion. Quitar algo que puso el `.bsp` es
`UTIL_Remove`, y sólo ocurre con `remove`:

```c
if (Params[1] == "remove")
{
    //Thothie FEB2015_19 - allow removing of map entities
    UTIL_Remove(pEntity);
}                                      scriptcmds.cpp:2899-2903
```

Y `fade` no borra: desvanece. Son tres cosas distintas bajo un nombre que
suena a una sola. `deleteent` y `deleteme` son además **la misma función**, y lo
que las separa es `Cmd.Name()` (:2876).

**4. `$get_by_name` busca en DOS sitios, y el segundo es de 2014.** Primero el
`netname`, donde `name_unique` guarda su nombre **con un macrón delante**
(`m_NetName = msstring("¯") + Params[0]`, scriptcmds.cpp:4456) para que no
choque con nada del mapa; y sólo si falla, el `targetname`:

```c
//Thothie DEC2014_11 check map ents too
CBaseEntity *pEntity = UTIL_FindEntityByString(NULL, "targetname", Params[0].c_str());
                                       script.cpp:1450
```

Sin esa segunda mitad el `remove_spawns` del alcalde no encuentra **un solo**
generador, porque «spawners6» es un `targetname` del mapa y no lo puso ningún
script. El evento entero sería un no-op silencioso.

**5. `TokenizeString` no es un `split(";")`** — y esto es una corrección de algo
que llevaba doce experimentos puesto. El motor da vueltas a un
`sscanf(&pszString[i], "%[^;]", cTemp)`, y `%[^;]` sobre un punto y coma **no
casa nada**: `sscanf` devuelve 0 y el bucle **para** (stackstring.cpp:151).

| | `split(";")` | el motor |
| --- | --- | --- |
| `"a;b;c"` | `[a, b, c]` | `[a, b, c]` |
| `"a;;b"` | `[a, "", b]` | **`[a]`** — el hueco corta la lista |
| `";a"` | `["", a]` | **`[]`** |
| `""` | `[""]` | `[]` |

En Gate City no cambia nada, porque ninguna de sus listas lleva huecos. Pero
`$get_token(L,2)` sobre «a;;b» devolvía «b» donde el juego devuelve «0», y eso
estaba portado así desde el 33 sin que nadie lo midiera. Iba de gancho del
entorno —`token()` en `npcguion.js`— cuando es trabajo de cadenas y no del
mundo; ahora es `partirTokens` en `guion.js`, con el resto del lenguaje.

**Y uno más, de los dos hermanos que no ven lo mismo.** `$get_token` resuelve su
primer parámetro **otra vez** (`msstring TokenString = GetVar(Params[0])`,
:2643) sobre un valor que ya venía resuelto de script.cpp:4418.
`$get_token_amt` no lo hace (:2665). Con `L` valiendo «M» y `M` valiendo «a;b»,
`$get_token(L,0)` da «a» y `$get_token_amt(L)` da **1**. Hay una prueba que lo
fija, porque es de las cosas que un port «arregla» sin darse cuenta.

Y el que hace terminar el bucle: **`$get_token_amt` de una cadena sin poner vale
1**, no 0. Lo dice su propio comentario —«this will return 1 on an uninitialized
string, as the string itself is taken to be a token»— y sale de que una variable
sin poner resuelve a su propio nombre, que es un token.

## Lo que llega al juego, y hasta dónde

Esto **sí** llega, al contrario que cuatro de los siete comandos del 43:
`Aparecedor.borrar(nombre)` quita el área de verdad y las catacumbas dejan de
reponer. Con su control positivo al lado, que es la regla: antes de borrar el
área, el zombi vuelve a los 5 s; después, no vuelve en 60.

Y lo que **no** hace, que también es del motor: **quitar el generador no mata a
nadie**. Los zombis que ya están puestos siguen en el mundo. Por eso las fichas
no se borran del `Aparecedor` al quitar el área — si se borraran, `estaPuesto`
diría que sí para todas (su valor por omisión es «no es plantilla, está
siempre») y el mundo volvería a poner justo los que acabamos de dejar de
generar. Hay una prueba de eso, y romperla da rojo.

### Dos límites, dichos aquí

- **Sólo llega en la partida local.** El `Aparecedor` al que esto le habla es el
  de `src/render/bichos.js`, que es el que cuenta cuando no hay servidor. Con
  un servidor delante quien repone los bichos es la `Fauna` de `src/red/`, que
  tiene el suyo y al que esto no le habla: haría falta un mensaje de red que no
  existe. `main.js` registra los nombres de las 16 áreas y nada más — cualquier
  otro nombre devuelve «0», igual que en un mapa donde no existe.
- **Que el alcalde «quepa entero» NO es que su misión de zombis se pueda
  jugar.** Lo que cabe es *su* guion. El contador sube desde el zombi, que hace
  `callexternal MAYOR_ID zombie_died` (dwarf_zombie_random.script:460) detrás de
  un `$get(MAYOR_ID,scriptvar,ZOMBIE_QUEST)`; `callexternal` no llega a nadie en
  este puerto y `scriptvar` no es una de las seis propiedades portadas. O sea
  que `ZOMBIE_COUNT` se queda en cero y `remove_spawns` no se dispara solo.
  **Se puede ejecutar, no se puede alcanzar.** Es exactamente la distinción que
  el censo mide y la que conviene no confundir al leer «20 de 139».

## Cómo se comprobó

30 comprobaciones de Node —incluido el `remove_spawns_loop` del alcalde copiado
palabra por palabra del `.script` y corrido con un reloj de mentira— y seis
roturas a propósito:

| rotura | rojas |
| --- | --- |
| `partirTokens` vuelve a ser un `split(";")` | 2 |
| `$get_token_amt` resolviendo su parámetro dos veces | 1 |
| `deleteent` sin `remove` borrando igual | 1 |
| el asa sin comprobar la dirección | 1 |
| `$get_by_name` devolviendo el nombre pelado | 4 |
| borrar el área llevándose también sus fichas | 1 |

`npm test` **1174/1174** y `sonda:misiones33` 23/23.

El guardia del subconjunto volvió a ponerse rojo solo al pasar de 36 a 38
comandos y de 8 a 10 getters, que es para lo que está.

## Lo siguiente

El andamiaje de menú, que es lo único que le queda a los tres NPC de Gate City
que faltan y lo que más se repite en el censo entero: `menu.open` (31 scripts),
`array.add` (29), `array.create`, `$get_arrayfind`, `catchspeech`, `helptip`,
`gplayermessage`. `calleventloop` va por delante de todos con 41 y también lo
pide `gatecity/storage`.
