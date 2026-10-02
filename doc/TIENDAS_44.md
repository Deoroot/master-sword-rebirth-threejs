# 44 — Las tiendas, que son el modelo y todavía no el escaparate

> `src/play/tienda.js` · `test/juego_tienda.test.mjs` · `npm run guiones`

El armero y el vendedor de Gate City son tiendas, y las tiendas son la respuesta
más directa a «los goblins pegan demasiado para un personaje nuevo»: comprar una
armadura y un arma mejor es como sobrevive un jugador de verdad.

Esto porta los cuatro comandos y el modelo. **No porta el panel**, y por eso el
censo no se mueve: sigue en 88 / 78 / 19.

## Lo que sí cambia, y lo que no

| | antes | ahora |
| --- | --- | --- |
| comandos de 223 | 29 | **36** |
| `gatecity/armorer`, cosas que le faltan | 10 | **8** |
| `gatecity/vendor` | 11 | **8** |
| el censo (menú / alguna opción / entero) | 88 / 78 / 19 | 88 / 78 / 19 |

Las tiendas se crean, se llenan con sus precios de verdad y se pueden leer. Lo
que falta en los dos vendedores ya no es la tienda: son `array.create`,
`array.add`, `$get_arrayfind`, `menu.open`, `catchspeech`, `helptip`,
`gplayermessage` y `playrandomsound` — el andamiaje del menú, no el comercio.

Que el censo no se mueva **es el resultado**, y por eso va en la primera tabla
en vez de escondido: siete comandos más no compran nada si lo que bloquea está
en otro sitio. El 43 movió 7 → 19 con siete comandos; éste mueve 0 con otros
siete. La diferencia es que aquéllos estaban en el camino y éstos estaban al
final.

## Los cinco detalles que no se adivinan

**1. El coste es un PORCENTAJE, no un precio.** `addstoreitem tienda
armor_leather 3 125 0.25` no son 125 monedas: es el 125 % del valor del objeto
(`iRealCost = int(pItem->m_Value * (iCost/100.0))`, npcscript.cpp:802). La
armadura de cuero vale 85, así que el armero la vende a **106**. Leerlo como
precio daba una tienda con los precios inventados y ningún error.

**2. El ratio de recompra está topado a 0,9.** `V_min(atof(Params[4]), .9)`
(:843, «MIB JAN2010_16 - cap resell values»). Un guion que pida 1.0 se queda en
0,9, y no es cosmético: al 1.0 se podría comprar y revender sin perder nada.

**3. Las tiendas son GLOBALES por nombre, no del NPC.** `GetStoreByName` mira
una lista estática y `npcstore.create` sobre un nombre que ya existe
**reutiliza la que hay** (:744-746). Por eso todos los guiones empiezan con
`npcstore.remove STORE_NAME allitems`: si no vaciaran, hablar dos veces con el
vendedor le duplicaría las existencias. Hay una prueba que dice exactamente eso.

**4. `inv` no se suma a los otros flags: los borra.** Los dos primeros son
`SetBits`; el tercero es una **asignación**: `if (strstr(BuyFlags, "inv"))
iBuyFlags = STORE_INV;` (:866-870). Una tienda pedida con «buy;inv» no deja
comprar.

**5. `npcstore.remove` sin segundo parámetro no vacía: APAGA.** `else
pStore->Deactivate()` (:919). Son dos cosas distintas y se leen igual.

Y uno más, de la firma: **`npcstore.offer` pide tres parámetros pero se usa con
cuatro.** Con exactamente tres, el motor lee los flags del hueco del destino
(`BuyFlags = Params[1]`, que es a quién se le ofrece); con cuatro reasigna bien
(:855-862). Todos los guiones de Gate City usan cuatro. La forma de tres se
porta igual de torcida.

## Lo que este experimento NO hace, dicho aquí

- **No hay panel de tienda.** `Offer` abre un VGUI que no está portado.
  `ofrecerTienda` deja el resultado a mano y escribe en la consola de sucesos
  cuántas cosas habría dentro, que es lo que permite ver que el guion llegó
  hasta el final.
- **No se compra ni se vende.** El modelo dice qué hay y a cuánto; mover oro y
  objetos es el paso siguiente.
- **El relleno automático de lotes no se puede hacer.** `if (FBitSet(...,
  ITEM_GROUPABLE) && !iBundleAmt) iBundleAmt = pItem->iMaxGroupable;` (:809) — y
  `iMaxGroupable` **no está en el catálogo** que hornea `npm run objetos`. Hoy
  da igual, porque `apilable` sale `false` en los 760 objetos, y eso es
  sospechoso por su cuenta: `src/bsp/script.js:1072` lo saca de la marca
  `groupable` y no la encuentra en ninguno. Queda apuntado.

## Cómo se comprobó

27 comprobaciones de Node, y cinco roturas a propósito:

| rotura | rojas |
| --- | --- |
| el coste tomado como precio en vez de porcentaje | 4 |
| sin el tope de 0,9 en la recompra | 2 |
| `inv` sumándose en vez de asignando | 1 |
| `npcstore.create` vaciando la tienda que ya existe | 2 |
| el tope de inventario con `>` en vez de `>=` | 1 |

`npm test` 1144/1144 y `sonda:misiones33` 23/23.

El guardia del subconjunto volvió a ponerse rojo solo al pasar de 29 a 36
comandos, que es para lo que está.

## Lo siguiente

El alcalde está a **tres** (`deleteent`, `$get_by_name`, `$get_token_amt`) y es
el más barato que queda. Después, el andamiaje de menú que comparten el armero y
el vendedor —`array.*` y `menu.open`—, que es lo que de verdad les falta y
también lo que pide `gatecity/storage`.
