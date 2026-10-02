# Experimento 84 — el cielo que se movía al saltar, y un encargo descrito al revés

Dos fallos de verificación repartidos a esta sesión por otra sesión, de una lista
de seis que dio el usuario:

> «el vgui de character info, cuando seleccionas el skill del arma le falta el
> parentecis con pocentaje y los corchetes.»
>
> «cuando salto fuera del templo el skybox se mueve.»

Los dos estaban. El primero **no donde decía el encargo**, y eso es la mitad del
experimento.

---

## 1. Character Info: el encargo venía del revés

El reparto decía que al panel le falta el `(32.10%) [9 left]` **en la lista de
skills**, y que el panel derecho sí lo trae. Lo primero que se hizo fue buscar la
cadena en el repositorio:

```
$ grep -rn "left\]" src/
(vacío)
```

O sea que **ninguno de los dos paneles lo tenía**, y la captura con la que se
comparaba no podía ser nuestra. Se confirmó con tres frases más de la misma
imagen —«Hit Giant Rat: 2.6 slash damage.», «Giant Rat hits you: 0.4 slash
damage.», «You've slain Giant Rat»—, que son `giattack.cpp:1954`, `:1994` y
`base_npc.script:193-199` y no se parecen a las nuestras. **La captura era el
juego original: la referencia de lo que tiene que verse, no una foto del fallo.**

### Lo que dice el motor, que es lo que decide dónde va cada cosa

`vgui_stats.cpp` pinta las habilidades en **dos sitios con dos formatos
distintos, a propósito**:

```c
// la lista de la IZQUIERDA — nombre y número y NADA más
_snprintf(cDisplayText, ..., "%s: %i\n", SkillStatList[real_idx].Name,
          player.GetSkillStat(SKILL_FIRSTSKILL + real_idx));
if (m_ActiveStat == real_idx) pTextbox->SetFGColorRGB(Color_SelectedText);
//                                      vgui_stats.cpp:277-285

// el panel de la DERECHA — con el porcentaje y lo que falta
_snprintf(cDisplayText, ..., "%s: %i (%.2f%%%%) [%i left]\n",
          Name, (int)SubStat.Value, Percent, (int)ceil(ExpToLevel));
//                                      vgui_stats.cpp:344
```

Lo único que le pasa a la fila **elegida** de la izquierda es que se pone roja, y
eso el puerto ya lo hacía. Así que hacer el encargo tal y como estaba escrito
—añadir el porcentaje a la fila seleccionada— **habría sido inventarse un Master
Sword que no existe**, con el agravante de que el documento del 65 avisa de
exactamente esto: *un mensaje plausible en el sitio correcto es más difícil de
ver que uno ausente*.

Queda escrito en `src/vgui/estadisticas.js` **con las dos citas**, y hay un
control en `sondas/hoja32.mjs` que se pone rojo si alguien vuelve a «arreglar» la
izquierda. Porque la captura va a seguir circulando.

### Lo que sí estaba roto

El panel derecho pintaba `${p.clave}: ${p.valor}`, o sea **`proficiency: 0`**: en
minúscula, sin porcentaje y sin corchetes. Tres fallos en una línea, y el que
delata que nadie lo había comparado con el original es la minúscula — el motor
pinta `SkillTypeList[i]`, que es «Proficiency».

Y un cuarto que no estaba en el encargo y salió de leer el bloque entero:

```c
if (m_ActiveStat < 0 || msstring(SkillStatList[m_ActiveStat].Name) == "Parry")
{ m_InfoPanel->setVisible(false); return; }   // vgui_stats.cpp:295-299
```

**Con Parry elegido el panel se esconde entero**, porque Parry tiene una sola
propiedad y un panel de cinco renglones para un número no dice nada. Portado.

### Lo que NO se porta, dicho aquí y no descubierto luego

La rama `if (SubStat.Value > 25)` recalcula el porcentaje desde `TestExpArray`, la
copia de sombra que el cliente lleva contra las trampas (con su comentario de
Shuriken al lado). **En este puerto ese array no existe**, así que por encima de
25 el porcentaje sale de la experiencia de verdad. Inventarse el array sería peor
que no tenerlo; queda declarado en la cabecera de la función.

## 2. El cielo: medido antes de tocarlo

Un cielo de GoldSrc sigue al que mira en posición y no en rotación, y sus
vértices se construyen sumando el origen de vista cara por cara:

```c
v[j] = (k < 0) ? -b[-k-1] : b[k-1];
v[j] += RI.cullorigin[j];                 // gl_warp.c:239-243
VectorCopy( RI.vieworg, RI.cullorigin );  // gl_rmain.c:359
```

`cullorigin` es `vieworg`: **el origen de VISTA y no el ojo del cuerpo.** Y en
este puerto esos dos puntos no son el mismo, porque `colocarCamaraDelOjo` le suma
al ojo el desplazamiento del guion del jugador:

```js
camera.position.set(eye[0] + v.pos.x / uPorM, eye[1] + v.pos.z / uPorM, ...);
```

El cielo se anclaba a `eye` **sin ese desplazamiento**. Las dos mitades estaban
bien —la cámara aplica el desplazamiento, el cielo se ancla cada fotograma— y el
fallo estaba en la costura: la familia del 63 y del 69.

### Por qué sobrevivió, y por qué lo encontró un jugador

**Andar no mueve la vista respecto al ojo.** El aterrizaje de un salto sí, porque
hunde la cámara. Medido en Edana:

| qué hacía el jugador | recorrido de la cámara | paralaje del cielo |
| --- | --- | --- |
| quieto | — | 0,000 u |
| andando | 251,6 u | 0,000 u |
| **saltando** | 56,7 u | **11,790 u** |

Treinta centímetros, y sólo al saltar. Por eso no lo cazó ninguna sonda en
ochenta y tres experimentos: ninguna saltaba mirando al cielo.

### El control, que a propósito no cuenta píxeles

Se podría fotografiar el cielo antes y después y sería **peor**, por dos motivos
que el cuaderno ya pagó: en pantalla entera el ruido del mapa se come la señal
(el 78, con un ratio de 1,89 que no pasaba *con el trabajo bien hecho*), y
distinguir «se movió un poco» de «no se movió» exigiría un umbral, y un umbral
aquí mediría la velocidad del salto y no la regla.

Lo que no necesita umbral ni depende de lo que haya delante es **la resta**: la
diferencia entre el nodo del cielo y la cámara tiene que ser la misma en todos
los fotogramas. Si cambia, hay paralaje; si no, no lo hay, por mucho o poco que
se haya movido el jugador. Son `npm run sonda:cielo84`, **6 de 6**, con sus dos
controles positivos delante: que el salto ocurre (`enElAire`) y que la cámara se
mueve **mucho** — sin ellos, «la diferencia no cambia» sería un cero sin control
positivo, verde con el jugador parado.

## 3. Los dos sitios donde me equivoqué midiendo

Esto es la parte que no se puede deducir del código después.

### El instrumento recalculaba lo que venía a leer — el 65, otra vez

El getter nuevo empezó llamando a `aplicarCamara()`, igual que hace `camara()`
doce líneas más arriba. Parecía lo correcto: así la cámara es la del juego y no
una copia. **Y es exactamente lo que invalidaba el control.**

`aplicarCamara()` recalcula la cámara desde el estado del jugador **en el
instante de la lectura**. El nodo del cielo lo dejó el bucle en el último
fotograma dibujado. Entre los dos ha avanzado la física, así que la resta no
compara el cielo con la cámara: compara **la cámara de ahora con el cielo de
antes**. Con el anclaje ya arreglado, eso daba **11,6 unidades de deriva andando
y 12,3 saltando** — los mismos números que el fallo que buscaba, por los dos
lados, y me hizo creer un rato que el arreglo no servía.

Es el 65 dentro del archivo que lo documenta —«cuando una sonda RECALCULA algo en
vez de leerlo, deja de ser un testigo»— con el espejo puesto: **allí la copia
borraba el movimiento al medirlo y aquí la llamada lo inventaba.** Las dos veces
el remedio es el mismo: leer lo que el bucle dejó puesto y no rehacerlo.

Y lo que lo destapó no fue mirar mejor: fue que al arreglar el juego **apareció
deriva andando donde antes había cero**. Un número que empeora cuando arreglas
algo acusa al instrumento.

### Un selector que ordena por posición, cuando lo buscado se esconde

En `hoja32`, el lector del panel derecho lo buscaba ordenando las hijas por `x` y
cogiendo la mayor. **Una caja escondida mide `x = 0`**, así que en cuanto el panel
se escondía el orden devolvía LA VENTANA, que sí se ve, y el control decía «se
ve» leyendo otra cosa. O sea que el control de Parry nació **verde por el motivo
equivocado**.

Y lo que NO lo cazó fue mi control positivo: «con otra habilidad sí se ve» es
cierto en las dos lecturas. Es el 70 con una vuelta de tuerca — allí el control
positivo señaló dónde apuntaba mal; aquí no podía. Ahora cuenta cajas visibles
—`.vg-hoja` tiene exactamente dos hijas— y no busca ninguna por su sitio.

*Esconderse es perder la posición: un selector que ordena por coordenada deja de
señalar lo que crees justo en el caso que vienes a medir.*

### Y un tercero, pequeño y silencioso

El getter escribía `!S.player.onGround`, y en este puerto el campo se llama
`grounded`. **`!undefined` es `true`**, así que habría dicho «en el aire» siempre,
y el control positivo del salto habría salido verde sin saltar. Un campo mal
escrito no da error: da un booleano constante.

## 4. Lo medido

- `npm test` **2 094 de 2 094**
- `npm run sonda:hoja32` **21 de 21** (eran 15 controles; tenía el «X de Y»
  calculado al final, el fallo del 65, y ahora lleva `DECLARADOS`)
- `npm run sonda:cielo84` **6 de 6** (nueva)
- `npm run sonda:arranque36` **30 de 30**
- `npx vite build` limpio
- 9 pruebas de Node nuevas sobre la cadena del panel

**Seis roturas deliberadas, todas confirmadas con `grep` antes de medir** (el 80),
y todas rojas: quitar la guarda del cero, la curva con `valor + 1`, el nombre en
minúscula, el formato de la derecha, la guarda de Parry y el anclaje del cielo. La
del formato devuelve el fallo del usuario literal, «proficiency: 0».

## 5. Dos filas candidatas para el apartado 4 de `CLAUDE.md`

No se escriben ahí desde esta sesión: **lo decide el usuario**, y además hay
cuatro sesiones sobre el mismo árbol y §4 es el archivo que peor se fusiona. Van
redactadas para que sólo haya que decir sí.

> | experimento 84 | una cadena de topes portada entera del motor: `if (Percent > 100) …; if (Percent < 0) …` | que **en C el caso imposible llegaba como `inf` y en JavaScript llega como `NaN`**. El porcentaje sale de `Exp / GetExpNeeded(Value)` y `expNecesaria(0)` vale 0 —«el primer punto es gratis», lo dice su propio comentario—, así que con una propiedad a cero es `0/0`. En C eso es `inf`, lo recoge el primer tope y queda en 100; en JavaScript es `NaN`, que **no es mayor que 100 ni menor que 0**, así que atraviesa los dos topes y lo que para el tercero (`if (SubStat.Value == 0)`) parecía cosmética es la única guarda que sostiene la división. Se ve en la primera partida de cualquiera: un personaje nuevo tiene Proficiency y Balance a cero. Es el `NaN > rango` del 79 por otra puerta —allí el `NaN` venía de fuera de la física, aquí lo fabrica una división legítima—. *Al portar una cadena de guardas, pregunta qué valor tenía en C el caso que cada una recoge: `inf` lo atrapa una desigualdad y `NaN` no la cumple ninguna* |

> | experimento 84 | «el panel de la derecha se ve», leído buscando la caja de la derecha por su coordenada `x` | que **una caja escondida mide `x = 0`**, así que en cuanto el panel se escondía —que es EL CASO que el control venía a medir— el orden por `x` devolvía la ventana, que sí se ve, y el control decía «se ve» leyendo otra cosa. Nació verde por el motivo equivocado. Y el control positivo de al lado **no podía cazarlo**: «con otra habilidad sí se ve» es cierto en las dos lecturas, o sea el 70 sin su red. Se arregla contando cajas visibles, que no pregunta por ninguna en particular. *Esconderse es perder la posición: un selector que ordena por coordenada deja de señalar lo que crees justo en el caso que vienes a medir, y sigue devolviendo algo* |

> | experimento 84 | `sonda:cielo84`, 6 de 6 y 0,000 de paralaje, repetida DESPUÉS de que otra sesión cambiara el intérprete de guiones | que repetir la medida no la revalida. El control se apoya en `vista("view")`, que sale del guion del jugador; si el cambio ajeno hubiera apagado el hundimiento de la vista al aterrizar, esa vista valdría cero siempre, el cielo y la cámara coincidirían **por otro motivo** y el 0,000 habría pasado con el anclaje roto. Sólo lo demostró volver a romper el anclaje: **12,320 unidades, el mismo número exacto que antes del cambio ajeno**. Y nada del lado propio se habría puesto rojo: con cuatro sesiones en el mismo árbol esto no es una rareza, es el modo normal de fallo. *Cuando alguien cambia la capa de la que depende tu medida, no basta con repetir la medida: hay que volver a romperla, porque su cambio pudo haber apagado el mecanismo que la hacía significar algo* |

La redacción de esta tercera es de la sesión `-1f`, que vio la segunda mitad —que
una medida puede dejar de significar nada **por un cambio de otro**, sin ponerse
roja y sin que nadie toque tu archivo— mejor que quien la midió.

## 6. Apéndice: el herrero de Edana, y el fallo que NO era

Llegó un quinto encargo del usuario repartido por otra sesión: «el npc esta en una
posicion errada» — el herrero. Esta sesión se quedó **sólo con la mitad del
horneado**, para separar dos causas posibles sin tocar guiones de nadie.

**El horneado no es la causa, y se puede decir con números.** Edana tiene **dos**
herreros, no uno:

| | el `.bsp` | el horneado |
| --- | --- | --- |
| Krythos the Weaponsmith | `origin 2104 -1632 -280` · `angles 0 180 0` | `[2104,-1632,-280]` · yaw 180 |
| «Iron Fist Ike, the Armourer» | `origin -192 -1592 -304` · `angles 0 90 0` | `[-192,-1592,-304]` · yaw 90 |

Byte por byte, y en marcha tampoco se desvía: el nodo de Three de Krythos está en
x = 2104,0 con yaw 180,0.

### La pista que parecía buena y no lo era

Lo único que el horneado no copia del mapa es la altura: baja a cada NPC al suelo
trazando el árbol BSP, y a Krythos lo baja **24 unidades**. Son 61 cm, y «metido
en el mostrador» es exactamente eso, así que durante un rato ése fue el fallo. No
lo es, por dos medidas:

1. **No hay nada sólido donde el mapa los pone.** Recorridas las 163
   entidades-brush del mapa: bajo Krythos sólo un `func_wall` con techo a −303, y
   bajo Ike **ninguna**. El mapa los deja en el aire, no sobre un mostrador.
2. **En el motor caerían igual**, porque `pev->movetype = MOVETYPE_STEP`
   (msmonsterserver.cpp:170) tiene gravedad.

Y **0 de 57** NPC de Edana tienen el `origin` dentro de la roca, así que nadie
está horneado dentro de una pared.

### Lo que sí salió: un comentario que decía la verdad por la razón falsa

`tools/bichos.mjs` justificaba la bajada con «el motor le hace un
`DROP_TO_FLOOR` al nacer». **Para un `ms_npc` eso es falso.** `CMSMonster::Spawn`
no lo llama, y los dos `DROP_TO_FLOOR` del archivo están en código de movimiento
(`:688` en `CheckLocalMove`, `:847` en `MoveExec`). Quien los baja es la gravedad.

El resultado coincide y por eso la línea se queda, pero la razón importa: un
`DROP_TO_FLOOR` **se rinde si tiene que bajar más de 256 unidades** y la gravedad
se para en lo primero sólido, así que los dos modelos sólo dan lo mismo mientras
el camino esté libre. Corregido en el sitio, con la cita, en vez de borrado.

Y de paso quedó confirmado por qué se baja a los PIES y no al centro:

```c
UTIL_SetSize(pev, Vector(-(m_Width/2), -(m_Width/2), 0),
                  Vector((m_Width/2), (m_Width/2), m_Height));   // :244
pev->view_ofs = Vector(0, 0, m_Height);                          // :250
```

**El `origin` de un `ms_npc` ya son sus pies**, y la misma función escribe el ojo
que corrigió el 81. Las dos cosas en seis líneas.

### Lo que queda sin dueño

Los `yaw` 180 y 90 **son los del mapa**, o sea que estar «de perfil» al nacer es
lo que hace el original. Si en el original el herrero se gira al hablarle y aquí
no, eso es `setmovedest <quien> 9999` y no es de este experimento. **Esta medida
no dice que el giro funcione: dice que el punto de partida es correcto.**

Y una trampa de instrumento para quien siga: `probe.mundo.npc(nombre)` busca por
`targetname`, e **Ike no tiene `targetname` en el `.bsp`**. Por ahí sólo es
legible Krythos; a Ike se llega por `probe.ia.censo()`. Un lector que devuelve
`null` porque la entidad no se llama de ninguna manera se parece mucho a un NPC
que no existe.

## 7. Y una tercera vez, cuando otra sesión movió la capa de debajo

Horas después de cerrar el arreglo del cielo, otra sesión cambió el intérprete de
guiones: `return` dejó de cortar un evento (148 líneas en 81 ficheros) y
`exitevent` empezó a cortarlo (108 en 53). Eso cambia **qué comandos se
ejecutan**, y el arreglo del cielo depende de `vista("view")`, que la pone el
guion del jugador. O sea que mi medida podía haber caducado.

Se volvió a pasar la sonda: **6 de 6, 0,000 de paralaje en los tres casos.**

Y ahí estuvo el riesgo, que casi se pasa por alto porque el verde era el
esperado: **0,000 en los tres podía ser un verde vacío.** El control dice «el
cielo no se mueve respecto a la cámara»; si el cambio ajeno hubiera apagado el
hundimiento del aterrizaje, `vista("view")` valdría cero siempre, el cielo y la
cámara coincidirían **por otro motivo** y el control habría pasado igual con el
fallo puesto. Un cero que sigue siendo cero después de que alguien toque la capa
de debajo no dice que tu arreglo siga bien: dice que no se ha movido el número.

Se comprobó rompiendo otra vez el anclaje: **12,320 unidades, el mismo número
exacto que antes del cambio ajeno.** El hundimiento sigue vivo, el control sigue
mordiendo y el arreglo queda confirmado *después* del cambio y no antes.

*Cuando alguien cambia la capa de la que depende tu medida, repetir la medida no
basta: hay que volver a romperla, porque su cambio pudo haber apagado el
mecanismo que la hacía significar algo.*

## 8. Lo que queda

- **La otra mitad del hueco del `TestExpArray`**, si alguna vez se porta la copia
  de sombra del cliente: hoy el porcentaje es correcto por debajo de 26 y
  optimista por encima.
- **`ms_xpdisplay`**, que tiene **cuatro formatos** más (`vgui_stats.cpp:344-360`)
  y aquí sólo está el 0, el de por omisión. No se declara como fallo porque es una
  cvar que nadie ha cableado; se apunta para que el día que haya consola de cvars
  esté el sitio.
- **Ninguna sonda salta mirando al cielo salvo `cielo84`**, y el cielo se dibuja
  en todos los mapas al aire libre. Si aparece un tercer mapa, vale la pena
  pasarla con `MAPA` cambiado: es una constante arriba del archivo.
- `sondas/_tmp_donde82.mjs` parece una sonda huérfana de otra sesión. **No se
  borra** —eso lo decide el usuario— pero queda apuntada.

---

# Apéndice del 85 — el sonido del menú, que era el encargo más viejo sin hacer

Esto no lo repartió nadie: lo pidió el usuario en el **73**, se diagnosticó y se
quedó anotado como pendiente. Sus palabras:

> «las de sonido no afectan el volumen que pasa cuando pasas el mouse por una de
> las opciones del menu principal, de hecho parece que no funciona para nada.»

Tenía razón, y por **dos** motivos a la vez. Esto importa porque arreglar uno solo
dejaba el síntoma entero.

### 1. El volumen de reposo de un `Audio` no es el del juego

Los tres sonidos del menú son elementos `Audio` del DOM, y **un `new Audio()` nace
con `volume = 1`**. El `config.cfg` de Master Sword trae `volume "0.120000"`, que
es lo que la tabla de ajustes declara como `pordefecto`. O sea que el menú sonaba
a **8,3 veces** el volumen que el jugador tenía puesto, desde el primer segundo.

### 2. Y quien reparte los ajustes no existe todavía

`aplicarAjustes` nace `null` en `src/main.js` y lo escribe el armado del mundo. El
reparto es `aplicarAjustes?.(valores)`, con su `?.`, **así que en el menú
principal no llamaba a nadie**: mover el deslizador antes de cargar un mapa no
hacía absolutamente nada, que es literalmente lo que el usuario describió.

El arreglo pone una línea *delante* de ese `?.`, porque el menú es exactamente el
sitio donde el otro no existe.

### No se enchufa al canal de efectos, y es deliberado

Lo «limpio» sería meter estos sonidos por `src/play/audio.js`. No se hace: ese
canal vive sobre un `AudioContext` que el navegador no deja despertar hasta que el
jugador toca algo, y **el primer sonido del menú es el de antes del primer
toque**. Lo que sí se puede es obedecer el mismo número, que es lo que el jugador
pide al mover el deslizador.

### Un control que ya existía y estaba verde con el fallo puesto

`sondas/ajustes37.mjs` medía desde el 37 que «subir el volumen lo sube en el nodo
de Web Audio, no en un campo» — y estaba en verde **con el menú sonando a 1**,
porque esos `Audio` del DOM no pasan por Web Audio. Dos caminos para el mismo
deslizador, y el control de uno no dice nada del otro: la costura del 63, esta vez
en el audio.

Hacen falta **dos sondas**, y tampoco es casual:

- `sondas/menu52.mjs` mide el volumen de partida **sin mapa cargado**, que es la
  mitad del punto 2. Ninguna otra sonda está ahí.
- `sondas/ajustes37.mjs` mide que el deslizador **llega**, por el camino del
  jugador: pestaña Audio, arrastre, aplicar.

### El respaldo del parámetro no puede ser el valor de reposo

El parámetro nuevo de `montarMenu` es `volumen = null`, y por omisión toma
`porDefecto().volumen`, **no 1**. Con un `1` de respaldo, cualquier sitio que se
olvidara de pasarlo reintroduciría el fallo original en silencio — y el fallo
original era justo ése. Es la familia del `comerciando` del 62 y el `trato` del
63, con una vuelta más: *cuando arregles un valor de reposo, el respaldo del
parámetro que lo arregla no puede ser ese mismo valor de reposo.*

### Y el tropiezo del día, que es el 80 con una vuelta de tuerca

La primera rotura deliberada —quitar la línea de `src/main.js`— **se quedó
verde**: la sonda siguió leyendo 0,70. Comprobé con `grep` que la marca `ROTO-B`
estaba puesta, que es lo que el 80 pide, y aun así el resultado no tenía
explicación posible: sólo hay un llamador de `ponVolumen` en todo el proyecto.

Lo que lo desenredó fue **una rotura RUIDOSA** en vez de una supresión: poner
`ponVolumen(0.01)` en esa misma línea. Salió 0,01 y rojo, o sea que el camino
estaba vivo y el control servía. Y al repetir la supresión verificando **las dos
cosas** —que la marca está Y que la línea original ha desaparecido, `grep -c` 1 y
0— salió roja y correcta: 0,12 contra 0,70.

No se escribe aquí un mecanismo para aquella primera pasada, porque no se midió
ninguno; lo que queda es el método:

*Comprobar que la rotura está puesta no es comprobar que la marca está: es
comprobar que lo que querías desactivar NO está. Y ante un verde que no tienes
cómo explicar, una rotura ruidosa —cambiar el valor a algo absurdo— distingue en
una pasada «el control no sirve» de «la rotura no llegó», que es lo que una
supresión no puede distinguir.*

### El control que faltaba, y que nació de ese tropiezo

Al arreglarlo apareció que el control del tramo 5 **comparaba el volumen del menú
con lo que pide la ventana, y eso no distingue «el deslizador llegó» de «ya valía
eso»**. Ahora `ajustes37` lee una **línea base** antes de tocar nada —que además
es un control por sí misma: 0,12 y no 1— y el control de después exige que el
número haya CAMBIADO respecto a ella.

### Lo medido

- `npm test` **2 122 de 2 122** · `npx vite build` limpio
- `sonda:menu52` **22 de 22** (eran 20) · `sonda:ajustes37` **16 de 16** (eran 14)
- `sonda:arranque36` **30 de 30**
- `ajustes37` tenía el «X de Y» calculado al final —el 65— y ahora lleva
  `DECLARADOS`, como `hoja32` y `cielo84`
- **Tres roturas deliberadas** con `grep` delante: el volumen que no se aplica a
  los `Audio` (devuelve el fallo original, volumen **1**), la línea de reparto
  suprimida y la misma línea en ruidoso

### Lo que sigue pendiente de esto

La columna **`aplica`** de `src/play/ajustes.js`, que es la vacuna de verdad:
**hoy hay 21 filas con `porQueNo` y 0 con `aplica`**, así que un ajuste que se
guarda y no se reparte —exactamente este fallo— no lo ve ninguna prueba. Sigue
declarado como pendiente desde el 73 y es más grande que este arreglo.
