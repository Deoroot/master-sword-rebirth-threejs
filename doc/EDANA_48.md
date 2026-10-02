# 48 — Edana, y las cuatro guardas que sabían de un solo mapa

> `src/bsp/luz.js` · `src/bsp/clip.js` · `src/bsp/mdl.js` · `src/play/volumenes.js`
> · `src/play/json.js` · `test/juego_edana48.test.mjs` · `sondas/edana48.mjs`

El 47 dejó a Edana parada en un número: **807 bytes de mapa de luz**. Detrás de
ese había otros tres, y los cuatro tienen la misma forma.

**Ninguna de las cuatro guardas estaba equivocada al parar.** Las cuatro estaban
bien escritas, bien razonadas y con su cita. Lo que tenían mal era el
cuantificador: cada una daba por universal una regla que sólo se había medido
sobre Gate City.

| la guarda decía | y de verdad |
| --- | --- |
| los bloques de mapa de luz **suman** el lump | pueden dejar cola de relleno |
| una entidad de brushes **es** un brush convexo | puede tener diez |
| encima de un suelo hay hueco 150 de 200 veces | eso depende del mapa |
| en contra de su normal **es** un fallo | o es una pieza de doble cara |

Ahora Edana **se hornea entera y se anda**: 12 808 caras, 262 texturas,
33 087 triángulos, 28 511 de colisión, 7 brushes de monsterclip, su cielo
`g_morning` de seis `.tga` y 161 de sus 181 líneas de `edana_detail.txt`.

---

## 1. Los 807 bytes: son ceros, y el motor no los mira

Lo primero fue no creerse el número. El hueco no está repartido: está **al
final**. Los 11 997 bloques de delante encajan uno tras otro sin un byte de
margen, y los 807 que sobran son **ceros que ninguna cara reclama**.

Y no es cosa de Edana. El censo de los 93 mapas del juego —el juez es el propio
archivo, así que se puede correr sobre todos— dice:

| | |
| --- | --- |
| mapas leídos | 92 de 93 (`edanasewers_old.bsp` está truncado) |
| cuadran | **88** |
| de ésos, con cola de relleno | **36**, de 363 a 2 928 bytes |
| ...y todos ceros | 36 de 36 |
| ...y todos múltiplo de 3 | 36 de 36, o sea luxels enteros |
| con solape o hueco **interno** | 4 |

La cita que decide es que **el motor no suma nada**. `Mod_LoadLighting` copia el
lump entero de una vez:

```c
// ReHLDS/rehlds/engine/model.cpp:651-658
void Mod_LoadLighting(lump_t *l) {
    if (l->filelen) {
        loadmodel->lightdata = (color24 *)Hunk_AllocName(l->filelen, loadname);
        Q_memcpy(loadmodel->lightdata, (const void *)(mod_base + l->fileofs), l->filelen);
    }
}
```

y a partir de ahí cada superficie entra por su `lightofs`. Un byte que nadie
reclama no lo lee nadie.

Así que la contabilidad deja de exigir «la suma ES el lump» y exige lo que de
verdad es la invariante: **ningún bloque pisa a otro, ninguno deja hueco entre
medias, ninguno se sale, y lo que nadie reclama es cero**. Lo último necesita
los bytes; **sin ellos no cuadra**, porque «no se ha mirado» no es «está bien».

### Los cuatro que siguen en rojo, y qué les pasa

`highlands_msc`, `lostcastle_msc`, `ww2b` y `ww3d` tienen solapes y huecos de
verdad, en medio, y el último bloque acaba clavado en el final del lump. Mirando
los que no encajan sale un patrón limpio: siempre **uno de más o de menos en el
ancho o en el alto**, en un puñado de caras. `plaq_34` sale 5×2 y el archivo
guardó 6×2; `kata11` sale 13×4 y el archivo guardó 13×3. Es la tercera trampa de
este lump —la proyección en `float` de 32 bits— en su caso límite, cuando el
borde cae justo sobre el múltiplo de 16.

Son 39 caras de 5 262 en el peor. **No se arregla aquí**: los cuatro son mapas
importados, ninguno está en el camino, y perseguir el redondeo exacto de `hlrad`
es un experimento propio. Queda medido.

### Una hipótesis que era falsa, y se dice

Antes de mirar los bytes pensé que la causa era **cómo se cuentan los estilos**:
el motor lee `while (styles[maps] != 255)`, o sea **hasta el primer 255**, y
nosotros contábamos «los que no son 255». Con un `[0,255,2,255]` las dos reglas
dan distinto.

Se midió sobre los 92 mapas: **cero caras discrepan**. No hay un solo `.bsp` en
Master Sword con un 255 delante de un estilo válido. La hipótesis era razonable
y era falsa, y buscarla costó menos que suponerla.

---

## 2. Una entidad no es un brush, y el agua lo demostró

El extractor paraba con `el modelo *58 de func_water no es convexo (249.0 u
fuera)`. La guarda tenía razón: **una entidad es un modelo, y un modelo puede
tener varios brushes**. En Gate City daba la casualidad de que cada `func_water`
era uno solo; en Edana hay uno de **seis** y otro de **diez**.

Los planos salían de las CARAS del modelo, metidos todos en una lista, y la
unión de diez brushes en una sola lista de planos no es la unión: es la
intersección, o sea nada.

La forma buena ya estaba escrita al lado, para los `func_monsterclip`: **el
árbol BSP del modelo**. Cada hoja ocupada es una pieza convexa, y dentro es
estar dentro de alguna.

### Y tapaba otro fallo más callado: los volúmenes invisibles

Las escaleras, los `trigger_hurt` y las `msarea_*` vienen **sin caras** —el
compilador se las come—, así que no había planos que sacar y **mandaba la caja
envolvente**. Pero sí tienen forma, en el árbol:

- el `trigger_hurt` de Gate City son **cinco** brushes;
- `msarea_music *287` son **cuatro**;
- `msarea_music *94` son **dos pastillas** en esquinas opuestas de una caja de
  95 × 68 m. Con la envolvente, esa zona de música era **el 0,008 % de lo que
  se estaba contestando**.

En Gate City: 32 volúmenes, 46 brushes, 9 con más de uno, y **12 de los 32 no
son su caja**. En Edana, el peor volumen de agua llena el **6 %** de su caja: el
94 % habría sido agua inventada.

### Y NO hay una regla, hay dos. Esto tampoco lo sabía

Al ir a buscar la cita que justificara «casco 0» resultó que el agua y los
disparadores **no se prueban igual**, y la diferencia es de un jugador de ancho.

**El agua** — `PM_LinkContents`, `pmovetst.cpp:134-156`:

```c
if (pmove->physents[i].solid || model == NULL) continue;
if (PM_HullPointContents(model->hulls, model->hulls[0].firstclipnode, test) != -1)
    return pe->skin;
```

Casco **0**, dentro es **cualquier contenido que no sea vacío**, y el contenido
que vale no es el de la hoja sino **el `skin` de la entidad**. Eso explica dos
cosas de Edana que parecían errores de lectura: que sus `func_water` tengan las
hojas unos en −2 (sólido) y otros en −3 (agua) —da igual, manda el `skin`—, y
que uno de ellos traiga **`skin -1`**, que es `CONTENTS_EMPTY`: ese `func_water`
no moja. Es del mapa.

**Los disparadores** — `SV_TouchLinks`, `world.cpp:362-377`:

```c
if (!BoundsIntersect(ent->v.absmin, ent->v.absmax, touch->v.absmin, touch->v.absmax))
    continue;
hull_t *hull = SV_HullForBsp(touch, ent->v.mins, ent->v.maxs, offset);
VectorSubtract(ent->v.origin, offset, localPosition);
if (SV_HullPointContents(hull, hull->firstclipnode, localPosition) != CONTENTS_SOLID)
    continue;
```

La caja primero —así que **la caja no era sólo un filtro barato: es parte de la
regla**— y luego el casco **del tamaño del que toca**, con `CONTENTS_SOLID`
exacto. `SV_HullForBsp` (`world.cpp:177-212`) elige por el tamaño: un jugador de
pie (32×32×72) cae en el **casco 1** y agachado (32×32×36) en el **3**. Y el
`offset` sale cero para los dos, porque el `clip_mins` del casco es el `mins` del
jugador: el punto que se prueba es **el `origin` tal cual**, el centro de su
caja, 36 unidades sobre los pies.

Los cascos 1 a 3 son el brush **engordado media caja de jugador**. Con el 0, cada
zona del mapa encogería 16 unidades por lado, que es un bordillo entero.

### El fallo que esto destapó dentro de nuestro propio código

`piezasDeModelo` metía la caja del modelo como seis medios espacios más —hace
falta, o una hoja del borde sale abierta—, **pero usaba `mins`/`maxs` tal cual**.
Esa es la caja de las caras, o sea la del casco 0. Recortando con ella, el casco
1 salía **idéntico** al 0: la dilatación se perdía entera contra el recorte.

No daba error. Daba zonas 16 unidades más pequeñas de lo que el motor usa, en
silencio, y lo único que lo delató fue un control que preguntaba si el casco 1
era **más grande** que el 0 — no sólo si lo contenía. Contenerlo lo contenía:
eran el mismo.

Las medidas son las del motor, `model.cpp:1107-1136`, y **el orden no es el que
uno espera**: el 2 es el grande y el 3 el agachado, que no es el orden de
`player_mins[]` (`pmove.cpp:36`), que va por `usehull`.

---

## 3. El control del árbol estaba afinado a un mapa

`encima de las 200 caras de suelo mayores -> 182/200 vacío`, y el umbral en 150.
Edana da **141** y paraba el horneado.

Bajar el 150 habría sido tapar el agujero del control con el síntoma. Porque el
problema no es el número: es que **«encima sale vacío muchas veces» no distingue
un árbol que funciona de un árbol que contesta VACÍO A TODO**. Le faltaba la
otra mitad.

Ahora pregunta las dos: un palmo por **encima** de un suelo tiene que salir
vacío y un palmo por **debajo**, sólido, y lo que se exige es que las dos
respuestas se **separen**. Eso no depende del mapa:

| | encima | debajo | separa |
| --- | --- | --- | --- |
| Gate City | 182/200 | 21/200 | 81 puntos |
| Edana | 141/200 | 40/200 | 51 puntos |

Y Edana da 141 y no 182 por una razón que se ve al mirarla: tiene sótanos y
alcantarillas, y muchas de sus caras de suelo miran a un hueco cerrado.

---

## 4. Doble cara no es bobinado al revés

`models/msc_riverwind/flo_grass2.mdl` —una mata de hierba— tiene **36 de sus 72**
triángulos girando en contra de su normal. El 50 % clavado, y el umbral estaba
en el 25 %.

El umbral venía con su razón medida: la llama de `gaz_thoth_mutant_candle` da el
8 % y un modelo de verdad invertido da el 100 %, «y entre un caso y otro no hay
nada». Edana dice que sí lo hay, y está justo en medio.

La salida no es mover el umbral, es **mirar si están repetidos**. Un triángulo
«en contra» que tiene otro **en las mismas tres posiciones** y a favor no es un
error: es una pieza de doble cara, modelada dos veces porque en GoldSrc no hay
`doubleSided`. De los 36 de la hierba, **los 36 tienen gemelo**. Descontados,
quedan 0 sueltos y el umbral del 25 % se queda donde estaba — y un modelo de
verdad invertido sigue dando el 100 % **sin un solo gemelo**, porque sus
triángulos no están repetidos.

---

## 5. Lo que salió al abrir Edana en el navegador

El horneado no es el juego. Con `build/edana/` escrito, la página **no
arrancaba**.

### El fallo del 47, otra vez, en cinco sitios más

`Unexpected token '<', "<!doctype "...`. El servidor de desarrollo contesta el
`index.html` a lo que no encuentra, así que `r.ok` dice que sí. El 47 lo arregló
en `main.js` y en `nivel.js`; quedaban **cinco** con el `r.ok ? r.json() : null`
de siempre, en `bichos.js`, `chispas.js`, `cuerpo.js`, `audio.js`, `esquema.js`
y `montar.js`. Uno de ellos tumbaba el arranque entero **después** de que los
seis avisos hubieran salido bien, que es lo que hizo que costara encontrarlo.

Es un arreglo que se repitió a mano y se quedó a medias. Ahora vive en un solo
sitio, `src/play/json.js`, y los ocho sitios lo usan. Los seis mensajes que sí
salían bien ya decían lo que hay que decir:

```
falta build/edana/menus.json (el servidor devolvió text/html)
falta build/edana/guiones.json (el servidor devolvió text/html)
```

### Y una guarda que faltaba en `main.js`

`Cannot read properties of null (reading 'manada')`. Un mapa sin `bichos.json`
llegaba hasta el final y moría ahí. Una línea.

---

## Cómo se comprobó

**18 comprobaciones de Node** y **nueve roturas a propósito**, todas rojas:

| rotura | rojas |
| --- | --- |
| la cola vuelve a ser un fallo | 2 |
| la cola se acepta sin mirar si es ceros | 1 |
| la caja de recorte no se engorda con el casco | 1 |
| `OCUPADO` vuelve a ser sólo `CONTENTS_SOLID` | 3 |
| los gemelos no se descuentan | 1 |
| dentro es estar dentro de TODAS las piezas | 1 |
| el hueco interno deja de contar | 1 |
| el signo de los planos no se voltea | el extractor para |
| el control del árbol contesta lo mismo encima y debajo | el extractor para |

Las dos últimas viven en el extractor y no en una prueba, así que lo que se
comprobó es que **el horneado se niega**: «32 de 32 volúmenes no contienen ni
uno de los 20 000 puntos de su propia caja», y «un árbol que contesta lo mismo
encima y debajo de un suelo no está leyendo el árbol».

**`npm test` 1276/1276.** Y los dos mapas horneados dos veces cada uno, con los
mismos bytes las dos.

### Y una sonda: `npm run sonda:edana48`, 15/15

Chromium de verdad, `?map=edana`. Mide que el manifiesto dice «edana», que trae
sus números y **no los de Gate City**, que el renderer dibujó 65 081 triángulos,
que con la W puesta se andan 5,48 m sin caerse del mundo, y —lo que este
experimento arregló— que el `func_water` de diez brushes **moja el 16,6 % de su
caja y no el 100 %**, preguntado por `volumenes.nivelDeAguaEn`, el mismo camino
que corre en el bucle.

Esta sonda entra por `?map=` y no por el menú, y eso es a propósito: **Edana no
está en `MAPAS_PORTADOS`**. Ofrecerla en «Create Server» sería prometer un pueblo
con sus NPC, y no los tiene. Lo que se mide aquí es lo que hay. Las 22 sondas de
Gate City siguen entrando por la puerta.

> **CORRECCIÓN DEL 50.** Ese motivo caducó: `build/edana` trae hoy 42
> colocaciones de NPC —las 42 con su guion—, 139 guiones y sus menús, y lo que
> no es de un mapa vive en `build/msr`. Edana **está** en `MAPAS_PORTADOS`
> desde el 50 y se entra por el menú, medido en `npm run sonda:edana50`, 21/21.
>
> Esta sonda sigue entrando por `?map=` y sigue estando bien que lo haga: son
> dos preguntas distintas. El 48 pregunta «¿se abre y se anda este `.bsp`?»; el
> 50 pregunta «¿se **llega**?». Ver [EDANA_50.md](EDANA_50.md).
>
> Y lo que el 50 encontró al intentarlo: la fila «Map» de «Create Server»
> **apuntaba el mapa elegido y no lo aplicaba**. Con un solo mapa portado eso
> estaba verde comparando una cadena consigo misma. Hacía falta el segundo.

**Y una cosa que la sonda se hizo a sí misma:** «se anda» salió rojo con
`0.00 m`, y el mapa no tenía nada que ver — faltaba `sesion.nuevo()`, sin el
cual el bucle no mueve al jugador. La tecla llegaba (`pulsada=true`) y el
jugador no andaba. Ahora hay un control al lado que mira el estado de la tecla,
para que la próxima vez se diagnostique la sonda y no el mapa.

### Las sondas vecinas

`arranque36` 22/22, `misiones33` 23/23, `vgui2_34` 26/26, `intro42` 14/14,
`sonido` 25/25, `ia` 15/15, `mundo` 40/40, `mapa` 32/33 — el rojo de `mapa` es
el conocido del 37 (la caída mortal en seco tampoco hace daño) y sigue igual.

`sonda:cuerpo` está en rojo por un clic interceptado en la hoja de personaje.
**No es de aquí**: se comprobó revirtiendo los dos cambios de VGUI de este
experimento y falla igual.

---

## Lo que este experimento NO hace

- **Edana no tiene NPC, ni menús, ni guiones, ni objetos.** Es un mapa que se
  anda y nada más. Las **doce herramientas** que extraen todo eso siguen
  escribiendo en `build/gatecity`, y **diez de ellas no son de un mapa** y
  deberían escribir en `build/msr/`. Está contado en `tools/mapa.mjs`
  (`NO_SON_DE_UN_MAPA`) desde el 47 y sigue igual.
- **Los 807 bytes no se han explicado, sólo medido.** Sabemos que son ceros, que
  son luxels enteros, que están en 36 de los 92 mapas y que el motor no los
  mira. Por qué el compilador los deja, no.
- **Los cuatro mapas con el ±1 en las extensiones** siguen sin leerse bien, y no
  están en el camino de nadie.
- **`msarea_*` y `trigger_once` siguen sin disparar nada**: ahora tienen la forma
  buena y el casco bueno, pero el bus de disparadores —el paso 2 del plan— sigue
  sin portar. Edana trae 4 `trigger_teleport`, 3 `trigger_hurt`, 2
  `msarea_transition`, 2 `func_ladder`, 1 `func_button`, 1 `func_pendulum` y 7
  `func_door_rotating`, y ahora todos ellos están medidos y colocados.

## Lo siguiente

El **paso 2**, que ya no tiene excusa: los disparadores tienen su forma, su
casco y su cita, y hay un segundo mapa donde se nota si funcionan.
