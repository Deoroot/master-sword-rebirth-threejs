# Los NPC oyen lo que dices — experimento 79

Pulsas la F delante del capitán de la guardia de Edana, eliges «Say Hello», y
**el capitán contesta**.

```
Sonda says,  "Hail!"
Edrin, Captain of the Guard says,  "Hail, traveller."
Edrin, Captain of the Guard says,  "...damn that [mayor]!"
```

Antes de hoy esa misma opción imprimía una sola línea:

```
Edrin, Captain of the Guard says,  "Hail!"
```

—tus palabras firmadas por él— y no la oía nadie.

`npm run sonda:edana79` va **24 de 24** y `npm test` **1892 de 1892** (+33).

---

## 1. Por qué este experimento, y no la sonda de una misión

El usuario preguntó qué le falta a Edana. Lo medí —una sesión de verdad, 90 s
dentro, y el censo de las 51 clases de su `.bsp`— y la respuesta corta fue: las
misiones. De sus 18 `ms_npcscript`, **16 lanzan un evento a un NPC** y son el
libro, la sidra, las pruebas del alcalde y los jabalíes del viejo.

Así que fui a escribir la sonda de una misión de punta a punta. Y al leer cómo
se empiezan, apareció esto:

```
catchspeech say_hi hi hello hail greet
catchspeech say_cider cider
catchspeech say_mayor mayor know heard rumor
                                   edana/bryan.script:48-56
```

**Las misiones de Edana no se contestan pulsando un botón: se contestan
diciendo una palabra.** Y `catchspeech` no disparaba nada.

No se puede medir una misión de punta a punta sin el oído. Esto es esa pieza.

---

## 2. Los dos fallos, que son independientes

### 2.1 `atof` no es `Number`, y por eso Edrin no existía

El primer intento de medir ni siquiera llegó al menú: **el juego no veía al
capitán**. Seis sitios alrededor suyo, treinta y seis combinaciones de
distancia y altura, y `probe.vgui.delante()` siempre `null`. Con Bryan, a diez
metros de allí, el mismo código funcionaba a la primera.

La cadena, de abajo arriba:

```
edana/edrin.script:19      hp  700/700   //Guards are strong
         │
src/bsp/script.js          Number("700/700")  →  NaN  →  hp: null
         │
build/edana/bichos.json    "hp": null
         │
manada.js:545              vivos() = instancias.filter(i => !i.muerto && i.vida > 0)
         │
main.js                    candidatosDeGolpe() ← vivos()
         │
main.js, `aQuien`          elegirObjetivo(...candidatos)  →  null
```

**Un NPC sin vida no está en `vivos()`, así que no se le puede pegar ni
hablar.** No hay un error en ninguna parte: hay un vecino que no reacciona.

Y lo que hace el mod con `hp 700/700` es más bonito de lo que parece. El
comando espera **dos** parámetros separados por un espacio:

```cpp
else if (Cmd.Name() == "hp")
{
    if (Params.size() == 1)
        m_HP = pev->health = pev->max_health = m_MaxHP = atof(Params[0]);
    if (Params.size() >= 2)
    {   m_HP = pev->health = atof(Params[0]);
        pev->max_health = m_MaxHP = atof(Params[1]); }
}
                                               npcscript.cpp:185-196
```

`700/700` es **un** parámetro, así que entra por la primera rama — y `atof` lee
el prefijo numérico y abandona en la barra. Devuelve 700, y la vida actual y la
máxima salen las dos a 700, que es exactamente lo que el guionista quería
escribir. **Funciona por accidente**, y lleva veinte años funcionando.

`Number` de JavaScript es estricto donde `atof` de C es indulgente, y ahí se
rompió.

#### La parte que escuece

**`atof` ya estaba escrito en `src/bsp/script.js`**, quinientas líneas más
abajo del sitio donde hacía falta, con su cita y con este comentario encima:

> El `atoi`/`atof` de C, que es lo que usa el intérprete del mod.
> **No es `Number()`**: lo que no empieza por un número vale cero…

Lo usa la aritmética de los guiones de objetos desde el 66. Lo que faltaba no
era entenderlo: era que el lector de **fichas** lo usara. Es el 64 (un comando
y una ventana esperándose el uno al otro) y el 66 (una pieza correcta a la que
no llamaba nadie), en el mismo archivo.

#### Cuánto era

Medido sobre los 2 884 guiones, **la única clave en la que `Number` y `atof`
discrepan es `hp`**, en **21 ficheros**. Lo vigila `test/atof79.test.mjs`, que
se pone rojo el día que aparezca otra.

| mapa | colocados | sin vida, antes | después |
| --- | --- | --- | --- |
| Gate City | 69 | **2** (Kendra, Roderick el minero) | 0 |
| Edana | 48 | **8** (Edrin, Tristan y los seis sacerdotes) | 0 |
| `gertenheld_forest2` | 74 | 0 | 0 |

En los 93 `.bsp` de la carpeta son **30 criaturas en 13 mapas** — y eso sin
contar las que heredan el `hp` por `#include`.

Gate City tiene dos y Edana ocho: **duodécima vez que el hueco se ve mejor en
un mapa que no es el primero**. Pero esta vez el primero también lo tenía, y
nadie había intentado hablar con Kendra.

### 2.2 `catchspeech`: treinta y seis experimentos registrado y mudo

Con Edrin visible, el menú se abre y trae su opción. Y lo que hacía era esto:

```js
// `pPlayer->Speak(...)`: en `MOT_SAY` habla EL JUGADOR. :2937.
hablarJugador: (texto) => this.entorno.hablar(texto),
```

`entorno.hablar` es el `saytext` **del NPC**. O sea que el comentario tenía
razón —en `MOT_SAY` habla el jugador— y la línea de debajo hacía lo contrario.
Dos consecuencias:

1. La frase salía firmada por el capitán.
2. **No la oía nadie**, y una opción `say` sin retrollamada —que es lo que son
   casi todas— no hacía absolutamente nada.

Al lado de `catchspeech`, en el mismo archivo, vivía la explicación:

> Se guardan de verdad —`entorno.frases`— y **este puerto no tiene chat de
> texto**, así que nada las dispara todavía.

La primera mitad dejó de ser verdad en el **experimento 61**, con los tres
canales del chat. Nadie volvió a leer la línea, y la segunda mitad siguió
siendo verdad por eso. Son **208 grupos de frases y 572 palabras en 21 de los
27 guiones de Edana**, y 89 grupos en 15 de los 25 de Gate City: ninguno había
sonado nunca.

---

## 3. Lo que se ha portado

### El camino entero, que son dos puertas y no una

```
  el jugador escribe en el chat        una opción de menú de tipo `say`
  client.cpp:468-470 / :472            msmonsterserver.cpp:2935-2937
       │                                      │
       └──────────► CMSMonster::Speak ◄───────┘
                    msmonsterserver.cpp:1588
                             │
                    ¿SPEECH_LOCAL y el que habla es un jugador?
                    ¿y el que escucha es un msmonster?
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
            game_heardtext        HearPhrase
            :1729-1741            :1743-1744
            (a TODOS los de        (sólo al que tenga una
             alrededor)             frase que encaje)
```

El orden lo deja dicho el propio mod: *«This has to be called after the text
msgs are sent out»*.

`game_heardtext` y `HearPhrase` **son dos mecanismos**, no uno: un guion puede
escuchar todo lo que se dice sin declarar una sola palabra, que es lo que hace
`base_chat_array` para sus conversaciones. La sonda lo separa con un control:
decir `qwrtypz` lo **oye** uno y no lo **contesta** nadie.

### `HearPhrase`, y las cuatro cosas que no se escribirían así

```cpp
if (SubPhrase = strstr(cTemp1, CheckPhrase))
{
    int Matched = 0;
    int len = strlen(CheckPhrase);
    for (int x = 0; x < len; x++)
        if (SubPhrase[x] == CheckPhrase[x]) Matched++;
    float ratio = (float)Matched / strlen(cTemp1);
    if (ratio > BestMatchedRatio) { BestMatchedRatio = ratio; BestPhrase = &Phrase; }
    break;
}
                                          msmonsterserver.cpp:1768-1791
```

1. **Compara por subcadena, no por palabra.** «apple» encaja dentro de
   «apples» —que es lo que se quiere— y «hi» dentro de «this», que no. Las dos
   se portan.
2. **El bucle de `Matched` no cuenta nada.** `SubPhrase` ya es el resultado de
   `strstr`, así que esos caracteres son iguales por construcción y `Matched`
   acaba valiendo siempre `len`. El ratio real es **longitud de la palabra /
   longitud de lo que has dicho**: gana la palabra más larga en relación a la
   frase, y decir sólo «cider» da 1,0.
3. **El `break` corta en la primera palabra del grupo que encaja**, no en la
   mejor. Así que de `catchspeech say_hi hi hello hail greet`, decir «hi there
   hello» puntúa con **«hi»** —dos letras— y el grupo entero compite con ese
   ratio bajo. El orden en el que el guionista escribió sus palabras decide
   quién gana.
4. **Los empates los gana el primero**, porque es `>` y no `>=`.

### `stripBadChars`, que limpia el original

```cpp
bool strutil::isBadChar(int c)
{ return (c == '(' || c == ')' || c == '$' || c == '¯'); }

char* strutil::stripBadChars(char* data)
{   char* cleanData = data;                       // ← el MISMO puntero
    while ((c = data[i++]) != '\0')
        if (!isBadChar(c)) cleanData[x++] = c;
```

Limpia **en el sitio**, así que la llamada de `Speak`

```cpp
Params.add(strutil::stripBadChars(pszSentence));
```

modifica `pszSentence` para la línea de abajo también, y `HearPhrase` recibe el
texto ya limpio. No es un detalle de estilo: significa que decir `$apple`
encaja con `catchspeech ... apple`. Y no deja hueco donde estaba el carácter:
`$get(a)` se queda en `geta`, pegado — escribí la prueba esperando «get a» y
salió roja con el código bien.

### El alcance, que es el del 61 y no uno nuevo

```cpp
if (SpeechType == SPEECH_LOCAL)
    if ((pEnt->Center() - Center()).Length2D() > m_SayTextRange)
        continue;
                                          msmonsterserver.cpp:1712-1715
```

Es **la misma línea** que decide si te oye otro jugador, portada en el 61. Así
que `oir.js` no escribe una segunda copia: usa `distancia2D` y `RANGO_LOCAL` de
`src/play/chat.js`. Dos alcances serían dos mundos, que es el fallo del 63 con
otra ropa.

Lo que sí añade esta regla es que **el rango es del que habla**
(`m_SayTextRange` es `this`, 300 por omisión en `msmonstershared.cpp:458`) y
que un guion puede cambiarse el suyo con `saytextrange`.

---

## 4. El fallo que metí yo, y cómo salió

La primera pasada de la sonda dio esto:

```
EL RANGO (SPEECH_LOCAL_RANGE = 300 unidades, en 2D)
  desde NaN unidades: oyeron 45, contestaron 18
```

**Dieciocho NPC saludaron a la vez desde el otro extremo del mapa.** La causa
inmediata era mía y de la sonda: leí `probe.mundo.unidadesPorMetro` sin
llamarla, `500 / función` es `NaN`, y el jugador acabó teletransportado a
`NaN`.

Pero lo que lo convirtió en medio pueblo saludando es del juego:

```js
if (distancia2D(i.donde, pies) > rango) continue;
```

**`NaN > rango` es `false`.** Una distancia que no se puede calcular pasa el
filtro, y un umbral escrito con `>` deja pasar lo que no es un número. El motor
no puede llegar ahí con un `NaN` porque sus vectores salen de la física; este
puerto sí, porque una sonda puede teletransportarte.

Arreglado con `Number.isFinite`, que se pregunta al revés. Y como esa guarda no
se podía romper en rojo sin volver a producir el `NaN`, la sonda **lo produce a
propósito**: hay un control que pone al jugador en `NaN` y exige que no le oiga
nadie. Es la lección del 78 —una pieza que no se puede romper en rojo sobra o
se mide— aplicada el mismo día que se escribió la pieza.

---

## 5. Los fallos del instrumento, que fueron cuatro

| lo que la sonda decía | lo que pasaba |
| --- | --- |
| «la línea del jugador no sale» en tres controles | **la consola es un anillo.** `nuevasDesde` era `ahora.slice(antes.length)`, y cuando las líneas viejas se caen por arriba la lista no crece: tres líneas nuevas daban «cero nuevas». Ahora busca el solape entre las dos fotos |
| «el grito global no sale» | lo buscaba en la caja equivocada. Un global va a **la consola del chat** y un local acaba en la de sucesos; son dos cajas distintas de la pantalla. Es el 60 otra vez: «cuando una regla devuelve *qué* y otra cosa decide *dónde*, hay que probar las dos» |
| la misma, después de arreglar la caja | `probe.chat.estado().lineas`, no `.estado().consola.lineas`. Dos lecturas mal seguidas del mismo sitio |
| «el jugador no ve a Edrin» con el `hp` bien | no era eso: la primera versión se plantaba en un solo sitio. `aQuien` usa el mismo cono y la misma traza que la espada, así que un sitio puede estar a un metro y tener una esquina en medio. Ahora prueba seis y **dice** si ninguno valió |

Y uno que no es del instrumento sino de un control, y es el más caro de los
cinco porque **sobrevivió a su propia rotura**:

> «EL CAPITÁN CONTESTA AL SALUDO» buscaba una línea de Edrin que contuviera un
> saludo. Con el arreglo roto a propósito, Edrin imprimía **tu** frase bajo su
> nombre — y `Say Hello` sortea su texto entre «Hail!», «Hello», «Greetings» y
> «Hi», así que **una vez de cada dos el control seguía verde con el fallo
> puesto**. Ahora exige que lo entrecomillado sea distinto de lo que dijiste.

Lo cazó la rotura deliberada y no una pasada normal. Es el apartado 4 de
CLAUDE.md dentro de un control escrito ese mismo día, y la razón de que la
regla sea romper **siempre**, también lo que acabas de escribir.

---

## 6. Las seis roturas deliberadas

| rotura | qué se pone rojo |
| --- | --- |
| `MOT_SAY` vuelve a hablar por el NPC | 4 controles: la firma, la suplantación, la respuesta y el orden |
| `oirFrase` no encuentra nunca | 5: las respuestas de Edrin por menú y por chat, la de Bryan, y el positivo del rango |
| el alcance no filtra | 7, entre ellos «desde 500 unidades no te oye», con 18 contestando |
| sin la guarda del `NaN` | 2, con 18 contestando desde `NaN` |
| sin el `tipo === HABLA.LOCAL` | 1: el grito global pasa a contestarse |
| `hp` con `Number` otra vez, y rehorneando | la sonda **se cae** en el control 6: no se le puede hablar al capitán. Y una caída es una roja, no una nota al pie (el 65) |

---

## 7. Lo que NO se porta, dicho aquí y no descubierto luego

- **`HasConditions(MONSTER_NOAI)`**: este puerto no tiene esa bandera. Se mira
  `sinIa`, que es lo que más se le parece, y queda dicho que no es la misma.
- **`admin_gag`** y sus cuatro frases de «[muted] Hmmmf... Mmmm!»: es
  moderación de servidor, no la regla.
- **`saytextrange`**: el comando está en la lista y ningún guion de los tres
  mapas lo usa, así que el rango es siempre el de por omisión. Se dice en vez
  de suponerlo.
- **`game_playerspeak` del `game_master`** (client.cpp:482-491): el chat del
  mod se lo manda y `MOT_SAY` **no** —`UseMenuOption` llama a `Speak` directo—,
  y el `game_master.script` del juego lo tiene **comentado**. Un conducto hacia
  una habitación vacía.
- **La segunda `StoreEntity(ENT_LASTSPOKE)`**: el mod la hace dos veces y aquí
  una, porque guarda lo mismo. Thothie dejó «*not working :(*» al lado de la
  primera.

---

## 8. Lo siguiente

1. **La misión de Edana de punta a punta**, que es por lo que empezó esto y que
   ahora sí se puede medir: la sidra (`cider` → Bryan → Sylphiel → Krythos) es
   la más larga y toca tres NPC.
2. **`setmovedest` de verdad**, el pendiente número uno desde el 77: el gancho
   `irA` es un `=> {}` desde el **43**.
3. **El cofre del alcalde y el botín**, con `ITEM_NOPICKUP` y el oro.
4. Los **`params` de un `ms_npc`** (`set_no_roam`), que dejó el 78.
5. Y lo que este experimento deja contado y sin portar: `env_sound` (11 en
   Edana, la reverberación por zonas), los dos `env_beam` de las columnas de
   humo con sus cuatro `info_target`, y el `speaker` del pregonero.

Y un aviso para quien escriba la sonda de la sidra: **el nombre del mapa y el
`name_unique` del guion pueden no coincidir.** El `ms_npcscript` de Edana
apunta a `urdauf` y el guion declara `name_unique urduaf`. Está sin medir si
eso rompe la cadena del libro en el juego original o si algo lo resuelve por
otro lado.
