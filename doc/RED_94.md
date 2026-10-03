# Experimento 94 — `setmovedest` y `$cansee` con servidor: a quién miran

```bash
node --test test/vista94a.test.mjs   # 7 de 7, dos jugadores contra una Partida de verdad
```

## 1. Lo que quedaba del 93

El 93 (pieza G, [EFECTOS_RED_93.md](EFECTOS_RED_93.md) §6) quitó
`_aQuienHabla()` del daño, del `applyeffect` y del `dist`: el objetivo pasó a
resolverse por el asa del jugador del guion (`_clienteDelGuion`,
`_clienteDeAsa`). Dejó escrito que los dos ganchos del 81 en
`src/red/partida.js` —`mandarADestino` (`setmovedest`) y `lineaDeVision`
(`$cansee`)— seguían preguntando a `_aQuienHabla()`, que es **el último
jugador de TODO el servidor que abrió un menú**.

Con un jugador eso es él. Con dos, el guion de un NPC que está con Beto
miraba y andaba hacia Ana porque Ana había hablado con el herrero.

Y había un segundo fallo debajo, en `entidadDeGuion` (`src/red/fauna.js`):
recibía el cuerpo «del que habla» y, si lo había, devolvía ese cuerpo para
**cualquier** nombre que no fuera `ent_me`. O sea que `setmovedest <otro bicho>`
con alguien en un menú mandaba al NPC hacia el jugador.

## 2. Lo que hace el motor

Los dos comandos resuelven su parámetro con `RetrieveEntity`:

- `setmovedest`: `RetrieveEntity(Params[0])` — npcscript.cpp:1628.
- `$cansee`: `RetrieveEntity(Name)` — npcscript.cpp:1765.

`CBaseEntity::RetrieveEntity(const char*)` (global.cpp:382-398) hace, en orden:

1. `StringToEnt(pszName)` — el asa (el `EntToString` de un jugador) **es** esa
   entidad.
2. si no, `EntityNameToType` (global.cpp:328-334, la lista de
   global.cpp:311-326: `ent_lastspoke`, `ent_laststruckbyme`…) y lo guardado
   con `StoreEntity` en el `m_EntityList` **de esta entidad** (global.cpp:361-367).

En ningún paso aparece «el último que abrió un menú en el servidor».

## 3. El arreglo

`Partida._cuerpoDeRef(ref, instancia)` en `src/red/partida.js`, con los dos
pasos:

1. `_clienteDeAsa(ref)`: si `ref` es el id del personaje de un cliente, el
   cuerpo de ESE cliente.
2. si no, y si el guion del NPC dice que `ref` es su jugador
   (`entorno.esElJugador`, la lista del 45 con sus reglas: `ent_laststruckbyme`
   sólo si le pegó, `ent_lastseen` si lo vio), el cuerpo de
   `_clienteDelGuion(instancia)`, que es `GuionDeNpc.jugador` (lo escriben
   `pedirOpciones`, `elegir`, `oir` y `alCombate`).
3. si no, `null`. **No se adivina**: la fauna busca en la manada y, si tampoco
   es un bicho, `ganchoDeMovedest` lo apunta y `$cansee` contesta «0».

Los dos ganchos pasan `this._cuerpoDeRef(n, instancia)` en vez de
`this._aQuienHabla()?.cuerpo`. Al pasar `null` cuando `ref` no es un jugador,
el segundo fallo (el nombre de cualquiera convertido en el jugador) desaparece
sin tocar la fauna; en `fauna.js` sólo se añadió la corrección al comentario.

`_aQuienHabla()` sigue en `suceso`, `ventanaDeAviso` y como respaldo de
`aplicarEfecto`/`dondeEstaElJugador`, que no eran de este experimento.

## 4. La prueba: `test/vista94a.test.mjs`

Una `Partida` de verdad con su `Fauna` sobre el suelo liso; Ana y Beto entran
con `MENSAJE.ELEGIR`, se mueven con `MENSAJE.ORDENES` y abren menús con
`MENSAJE.PEDIRMENU`; `_paso()` corre los relojes. El guion del vigía va como
TEXTO al analizador (la regla del 67) y es nuestro y mínimo, a propósito: lo
que se mide es la costura del servidor, y un guion del mod que llegue aquí
desde un reloj (`npcatk_hunt`, base_npc_attack.script:108 y :114) pasa
además por los bucles cerrados del 91 y por la IA. Las líneas que usa están
en el mod tal cual (`setmovedest PARAM1 9999` es la mitad de los
`setmovedest` de Edana; `$cansee(<asa>)` es base_npc_attack.script:108).

**El segundo caso (el 50):** Ana abre el menú del vigía y DESPUÉS Beto abre el
de otro NPC, así que `_aQuienHabla()` es Beto y el jugador del vigía es Ana.
Medio segundo más tarde, desde un `callevent 0.5`, el vigía mira y anda.

**La geometría hace que las dos respuestas sean distintas:** vigía en
x = −3 m, Ana en 0, Beto en +3 detrás de ella. El rayo a Ana la toca (verla,
combat.cpp:1240); el rayo a Beto choca antes con Ana (no verle). Y el destino
queda a 0 o a 118 unidades de Ana. Los jugadores se recolocan en cada paso,
porque la separación tiene que valer DURANTE la medida (el 82).

| # | control | qué mide |
| --- | --- | --- |
| 1 | `_aQuienHabla()` es Beto, el guion guarda el asa de Ana | que el segundo caso existe |
| 2 | geometría, con el rayo y el cuerpo puestos a mano | que el instrumento distingue; **no depende del arreglo** |
| 3 | `$cansee(<asa de Ana>)` y `$cansee(player)` = «1» desde el reloj | el gancho `lineaDeVision` |
| 4 | `setmovedest ent_lastspoke 10` va hacia Ana | el paso 2 (`m_EntityList`) |
| 5 | `setmovedest <asa de Ana> 10` va hacia Ana | el paso 1 por el gancho |
| 6 | un nombre que no es un jugador → `null`; un asa nombra a su jugador desde otro guion | `_cuerpoDeRef` |
| 7 | Ana y luego Beto abren el menú del VIGÍA; `setmovedest <asa de Ana>` va hacia Ana | el paso 1 cuando el guion ya está con otro |

## 5. Roturas deliberadas

En una copia aparte del árbol (no en el compartido), cada una comprobada con
`grep -c` de su marca antes de correr:

| rotura | `grep -c` | rojas |
| --- | --- | --- |
| A: los dos ganchos vuelven a `_aQuienHabla()?.cuerpo` (`ROTURA94`) | 2 | 3, 4, 5, 7 |
| A con un solo jugador hablando (`betoHabla = false`) | 1 | **sólo el control 1**: 3, 4 y 5 verdes con el fallo puesto |
| B: sin el paso 2 de `_cuerpoDeRef` (`ROTURA94B`) | 1 | 4 |
| C: sin el paso 1 (`ROTURA94C`) | 1 | 6, 7 |

La fila 2 es el 50 medido: con un jugador el fallo no existe y el control no
puede ponerse rojo.

Lo que la rotura B enseñó y conviene saber: **`$cansee(player)` siguió verde
sin el paso 2**, y no es un control flojo. `ve` (npcguion.js:872) le pasa al
rayo `jugador.ref` —el asa— y no la palabra `player`, así que `$cansee` llega
siempre por el paso 1. El paso 2 sólo lo usa `setmovedest` con un alias, y eso
lo cubre el control 4.

## 6. Números

- `node --test test/`: **2 575 pruebas, 2 573 verdes, 1 roja, 1 «todo»**. La
  roja es `test/salto93g.test.mjs` («salta sobre Ana… y NO a Beto»), y **no es
  de este cambio**: en una copia del árbol con `src/play/ia.js` de `HEAD` sale
  verde **con** el arreglo del 94 y **sin** él; con el `ia.js` de trabajo de
  ahora (el ciclo de pensar, de otro agente) sale roja **con** y **sin** él.
- `sonda:red` 21 de 21; `sondas/costurared92.mjs` 16 de 16;
  `sondas/efectosred93.mjs` 24 de 24.

## 7. Pendiente

- **Ninguna sonda de navegador lo mide.** Haría falta un NPC de Gate City cuyo
  guion haga `setmovedest`/`$cansee` desde un reloj con dos navegadores
  conectados; los que lo hacen (`npcatk_hunt` y compañía) son bucles cerrados
  de la costura del 91. Queda declarado, no contado entre los verdes.
- `suceso` y `ventanaDeAviso` del `InteraccionesNpc` del servidor siguen yendo
  a `_aQuienHabla()`: un `playermessage`/`infomsg` desde un reloj va al último
  que abrió un menú. Es el mismo fallo en otros dos ganchos.
- `hablaElJugador` (interacciones.js:647) y `hizoDano` (:292) llaman a
  `dondeEstaElJugador()` sin asa; dentro de `alCombate` y de un menú es
  correcto, fuera no se ha mirado.
- La lista de enemigos de `$cansee` (`m_hEnemyList`, npcscript.cpp:1771) sigue
  sin portar: `$cansee(enemy)` no mira a Beto aunque Beto le pegue.
