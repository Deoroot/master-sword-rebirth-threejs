# Los scripts de MSR y el personaje: qué hay de verdad, y qué haríamos con ello

> Esto es una **evaluación**, no un plan ejecutado. Todo lo de abajo está medido
> sobre `../MSC/` — los 2 884 scripts y las 159 191 líneas de C++ del mod — y no
> se ha escrito ni una línea de intérprete.

---

# Parte 1 · El lenguaje de scripts

## Lo que es, en cifras

| | |
| --- | --- |
| Scripts | **2 884** |
| Líneas | **284 088** |
| Órdenes distintas usadas | **298** |
| Funciones `$` distintas usadas | **89** (el motor registra 139) |
| El intérprete en C++ | **14 453 líneas** (`script.cpp` 6 242 + `scriptcmds.cpp` 7 705) |
| Operadores de comparación | **12** |

Para comparar: **el mod entero son 159 191 líneas de C++**, y el intérprete de
scripts es el 9 % de eso. El contenido que ese intérprete ejecuta es casi el
doble de líneas que todo el C++ del juego.

## Tenías razón en lo de «varios lenguajes mezclados». Son tres capas

No es una impresión: son tres sistemas distintos que conviven en el mismo
fichero, y cada uno se resuelve en un momento distinto.

**1. Un preprocesador**, que corre al CARGAR y no al ejecutar. Lo hace
`script.cpp` a mano, con `_stricmp` encadenados:

```
#include   #scope   const   const_ovrd   removeconst   setvar   setvard
setvarg    eventname   precache   setmodel   setpmodel   setviewmodel
setworldmodel   setshield   attachsprite   say   repeatdelay   svsound.play3d
```

`#include` además lleva **ámbito**: `#include [server] monsters/base_npc`. Si no
se entiende el prefijo, el cierre de dependencias sale corto y no avisa — me
pasó al medir, y las 49 dependencias de Gate City salieron 43.

**2. Doscientas veintidós órdenes de ejecución** en un hash
(`m_GlobalCmdHash`), de las que **154 se usan y 68 no las usa nadie**.

**3. Un vocabulario DECLARATIVO por tipo de entidad**, que cada clase de C++
registra por su cuenta: **65 campos para un NPC** (`npcscript.cpp`) y **45 para
un objeto** (`genericitem.cpp`), 96 distintos en total. Son cosas como `hp`,
`width`, `race`, `roam`, `wearable`, `quality`, `registerattack`. No son
órdenes: son propiedades de una ficha.

Y encima de todo eso, **hay dos sintaxis de `if` vivas a la vez**, y el propio
código las llama así:

```c
m_GlobalCmdHash["if"]   = ... ScriptCmd_If;   // The old if
m_GlobalCmdHash["if()"] = ... ScriptCmd_If;   // The new if
```

No se puede elegir una: en el corpus hay **13 096 del nuevo y 9 804 del viejo**.

## La cifra que decide, y no es la que parece

La tentación es «implemento las 20 órdenes más usadas y cubro el 80 %». Eso es
verdad **por líneas** y es inútil **por scripts**, porque un script con una sola
orden que no entiendo no corre.

| vocabulario | scripts que corren ENTEROS | líneas cubiertas |
| --- | --- | --- |
| 10 órdenes | 419 de 2 884 (14,5 %) | 69,0 % |
| 20 | 707 (24,5 %) | 78,6 % |
| 50 | 1 129 (39,1 %) | 91,8 % |
| **68** | **1 442 (50,0 %)** | **95,2 %** |
| 100 | 2 026 (70,2 %) | 98,1 % |
| **120** | **2 324 (80,6 %)** | 99,0 % |
| 200 | 2 770 (96,0 %) | 99,9 % |
| 298 | 2 884 (100 %) | 100 % |

**Con el 95 % de las líneas cubiertas sólo corre la mitad de los scripts.** La
cola larga no es opcional si lo que se quiere es ejecutar el contenido: 112
órdenes se usan cinco veces o menos, y 51 se usan **una sola vez** — y cada una
de esas bloquea su script entero.

## Y la cifra práctica: sólo los bichos de Gate City

| | |
| --- | --- |
| Scripts que las 69 entidades nombran | 25 |
| Cierre por `#include` | **49 ficheros, 14 399 líneas** |
| Órdenes distintas que hacen falta | **129** |
| Funciones `$` distintas | **47** |

Ciento veintinueve de 298. **No es un subconjunto pequeño**: es el 43 % del
lenguaje para hacer andar un pueblo y unas cuevas.

## Las tres salidas, y cuál recomiendo

### A. Escribir el intérprete, fiel

Se escribe `CScript` en JavaScript: el preprocesador, el hash de órdenes, los
doce operadores, las dos sintaxis de `if`, las funciones `$`. Los scripts se
leen de `../MSC/` y no se copian, igual que el `.bsp`.

**A favor:** es la regla del 02 aplicada tal cual —el intérprete es nuestro, el
contenido no— y funciona para los 2 884 scripts, no sólo para los que yo elija.
El contenido de MSR pasa a estar disponible entero.

**En contra:** son 14 453 líneas de C++ que traducir, y el corpus es el juez, o
sea que hay que ejecutarlo para saber si está bien. Y hay partes que no son
lenguaje sino **motor**: `$cansee` necesita trazado de rayos, `callevent` del
lado servidor necesita entidades con red, `menuitem.register` necesita interfaz.

### B. Traducir los scripts a datos, sin intérprete

Una herramienta lee los `.script` y emite JSON/JS con el comportamiento ya
resuelto. Es lo que ya hace `src/bsp/script.js` para las fichas de NPC.

**A favor:** lo caro se hace una vez, fuera del navegador, y el resultado se
puede mirar.

**En contra:** **no funciona, y esto lo sé medido.** El lenguaje tiene
`setvard`, `$rand()`, `if` sobre estado en tiempo de ejecución y `callevent`
recursivo con 22 174 asignaciones dinámicas. Un traductor que resuelva eso es un
intérprete con otro nombre, sólo que sin bucle. Sirve para las FICHAS —lo que
ya hacemos— y no para el comportamiento.

### C. No portar el comportamiento: escribir el nuestro

Se conserva lo que ya está —modelos, animaciones, fichas, colocación— y la IA,
el combate y los objetos se escriben de cero contra las cifras que el archivo
declara (`hp`, `width`, `roam`, el daño de cada arma).

**A favor:** es lo más rápido con diferencia, y es lo que permite **mejorar**,
que es la mitad de lo que preguntas en la parte 2.

**En contra:** deja de ser un port. Y las 284 088 líneas de contenido —tiendas,
diálogos, misiones, hechizos— se quedan fuera.

### Lo que recomiendo

**C para empezar, con la puerta abierta a A.** Y la razón es una medida, no un
gusto: el subconjunto mínimo para los bichos de Gate City son **129 órdenes**, y
eso ya es la mitad del trabajo de A sin ninguna de sus ventajas — no desbloquea
el resto del contenido y sí cuesta casi lo mismo.

Si algún día se quiere el contenido entero, A es el camino y hay que hacerlo
completo. Hacer A «un poco» es el peor de los tres.

Lo que sí conviene hacer **ya**, cueste lo que cueste después, es **seguir
leyendo los scripts como datos**: `src/bsp/script.js` saca modelo, animaciones,
piel, vida, tamaño y velocidad de los `.script` reales, y eso vale para las tres
salidas.

---

# Parte 2 · El personaje: estadísticas, habilidades y HUD

## Lo bueno: el sistema es pequeño y está todo declarado

No hay que adivinarlo. Está en 547 líneas de `shared/stats/`.

**Seis atributos** (`statdefs.h`, con los comentarios del autor):

| | | |
| --- | --- | --- |
| Strength | `NATURAL_STR` | cuánto cargas, y regeneras aguante |
| Agility | `NATURAL_DEX` | cuánto corres, y cuántas armas manejas |
| Concentration | `NATURAL_CON` | cuánto te concentras |
| Awareness | `NATURAL_AWR` | cuánto te enteras del entorno |
| Fitness | `NATURAL_FIT` | cuánta vida tienes |
| Wisdom | `NATURAL_WIS` | los hechizos cuestan menos |

**Nueve habilidades**, y cada una con **tres propiedades** —velocidad, equilibrio
(puntería) y potencia (daño)— **cada una con su propia experiencia**:

```
Swordsmanship   Martial Arts   Small Arms   Axe Handling   Blunt Arms
Archery         Spell Casting  Parry        Pole Arms
```

`Parry` tiene una sola propiedad y `Spell Casting` tiene cinco en vez de tres:
**fuego, hielo, rayo, adivinación y aflicción**.

**La curva de experiencia es una línea de código**, no una tabla:

```c
long double GetExpNeeded(int StatValue) {
    return pow(1.248, StatValue) * (4.0 * StatValue);
}
```

Con topes de **300** para un atributo y **100** para una propiedad.

Y **se sube usando**, no gastando puntos: la experiencia va a una propiedad de
la habilidad con la que golpeaste. Eso es una decisión de diseño de MSR que hay
que respetar o cambiar a propósito, no por descuido.

**Razas con relaciones**, en `races.cpp`: cada raza tiene aliados, enemigos y
«recelosos» (`Wary`), y la relación se consulta en las dos direcciones —una raza
puede desconfiar de otra sin reciprocidad. Es lo que decide si un goblin te
ataca.

## El inventario, y por qué tu idea de Diablo encaja mejor de lo que parece

MSR guarda **hasta 100 objetos** en una lista (`NUM_MAX_ITEMS 100`) y **dos
manos** (`MAX_PLAYER_HANDS 2`). No hay rejilla, no hay peso por casilla: es una
lista con un panel VGUI.

Y los objetos ya traen los campos que una rejilla necesita, porque el formato
los declara: **`value`** (464 objetos lo declaran), **`quality`**,
**`wearable`**, **`groupable`** (apilable), **`useable`**, y los `register*` que
dicen qué ES la cosa — ataque, armadura, proyectil, hechizo, contenedor, bebida.

Los 861 objetos **heredan**: 789 de ellos hacen `#include` de una base
(`base_ticket` 139 veces, `base_miscitem` 93, `proj_arrow_base` 75). O sea que
el catálogo real son unas pocas plantillas y muchas variantes de datos — que es
exactamente la forma que quiere una tabla de objetos moderna.

**Conclusión honesta: la rejilla tipo Diablo no choca con nada.** Lo que MSR
tiene es una lista porque VGUI de 2002 daba para una lista. Los datos soportan
una rejilla sin inventarse un solo campo.

## El HUD y los paneles

Unos veinte paneles VGUI, **7 298 líneas** en `client/ui/ms/`: elegir personaje,
estadísticas, contenedores, tienda (comprar, vender, principal), mover objetos,
opciones, ranuras rápidas, aparición.

Y los scripts pueden tocar el HUD: `hud.addstatusicon`, `hud.addimgicon`,
`hud.quickslot`, `hud.desctext`, `sethudsprite` (512 usos). O sea que **parte
del HUD es contenido, no interfaz**: un veneno añade su icono desde su script.
Si rehacemos el HUD, esa es la parte que hay que decidir qué hacemos con ella.

## Qué es barato y qué es caro, si lo hacemos

**Barato, y no depende del intérprete:**

- Los **seis atributos, las nueve habilidades con sus tres propiedades y la
  curva de experiencia**. Son datos y una fórmula; caben en un fichero.
- La **hoja de personaje** y el **inventario en rejilla**. Es interfaz web, que
  es donde esta pila es más fuerte que VGUI, no más débil.
- La **creación de personaje**: MSR guarda nombre, género, raza y `body`, y poco
  más. Aquí sí se puede hacer algo mejor sin romper nada.
- Las **relaciones entre razas**, que son 67 líneas.

**Caro, y sí depende:**

- Que un arma **haga** lo que dice su script. `registerattack` es una orden del
  intérprete, y detrás hay 129 órdenes más.
- Las **tiendas**: 1 540 `addstoreitem` en el corpus, y 11 sólo en Gate City.
- Los **hechizos**, que tienen su propio subsistema de cinco escuelas.

## La tensión que hay que decidir, y es tuya

Dijiste que un port no tiene por qué ser 100 % fiel, y aquí es donde eso deja de
ser teórico. **Si mejoramos el inventario y la hoja de personaje, dejan de
casar con los scripts de MSR**: un objeto que el script coloca en la mano 1 y
nuestra rejilla coloca en una casilla ya no es el mismo objeto.

Las dos cosas se pueden hacer, pero no a la vez sin decidir cuál manda:

- **Manda el script** → el inventario es una lista de 100 con dos manos, y lo
  que mejoramos es cómo se ve.
- **Manda nuestro diseño** → los objetos son nuestra tabla, alimentada por un
  lector de `.script` que saca nombre, modelo, valor, calidad y tipo, y el
  comportamiento lo escribimos.

Yo recomiendo **la segunda**, por lo mismo que la salida C: es lo que deja
mejorar, y es coherente con no escribir medio intérprete.

---

## Lo que NO he medido, y conviene saberlo

- **El lado cliente del scripting** (`hudscript.cpp`) lo he contado pero no
  leído. Puede que el HUD dependa de scripts más de lo que parece aquí.
- **Cuántas de las 129 órdenes de Gate City son fáciles.** Sé cuáles son y
  cuántas veces se usan; no he mirado qué hace cada una por dentro. Esa cuenta
  cambiaría el coste de la salida A y no la he hecho.
- **Los hechizos**, más allá de que son cinco escuelas.
- **Si el corpus corre hoy en el port a Xash3D.** Doy por hecho que sí porque el
  port es funcional, pero no lo he comprobado.

## APÉNDICE · Cómo se crea un personaje en MSR, del código y no de una captura

La página de moddb devuelve **403** y no la he podido leer. Da igual: la
creación de personaje está entera en `sv_character.cpp` y en `global.script`, y
eso es mejor autoridad que una captura.

`CBasePlayer::CreateChar()` recibe **nombre, género y el arma elegida**. La raza
se escribe a fuego —`strncpy(Data.Race, "Human", ...)`— y el propio código la
marca `// LEGACY`. O sea que **en MSR no eliges raza**: las razas existen para
los monstruos y sus relaciones, no para el jugador.

Y entonces:

1. **Un punto a cada habilidad.** A las de arma, en POTENCIA; a `Parry`, en su
   única propiedad; a `Spell Casting`, uno en **cada una de las cinco escuelas**.
2. **Cuatro objetos gratis**, de `global.script`:
   `sheath_belt_holster`, `sheath_back`, `sheath_dagger`, `pack_sack` — o sea
   tres vainas y una mochila. Los vestibles se equipan solos.
3. **Diez de oro.**
4. **Un arma elegida entre siete**, a la mano derecha. Y la lista es exactamente
   una por habilidad:

| elección | habilidad |
| --- | --- |
| `swords_rsword` | Swordsmanship |
| `bows_treebow` | Archery |
| `smallarms_rknife` | Small Arms |
| `axes_rsmallaxe` | Axe Handling |
| `blunt_hammer1` | Blunt Arms |
| `polearms_qs` | Pole Arms |
| `magic_hand_lightning_weak` | Spell Casting |

La octava habilidad, **Martial Arts, no tiene entrada**: empezar sin arma *es*
elegirla. Y el arma elegida puede ser un hechizo, que el código trata aparte
(`LearnSpell` en vez de `AddItem`).

Todo eso son **cuatro líneas de configuración en un script**, no código. Si
cambiamos la lista o el oro de partida, es un dato.

---

# Parte 3 · El almacenamiento de personajes

## MSR ya tenía tres sitios, y eso contesta media pregunta

```c
enum charloc_e { LOC_CLIENT, LOC_SERVER, LOC_CENTRAL };
```

- **`LOC_CLIENT`** — el personaje vive en el disco del jugador y se **sube** al
  servidor al entrar.
- **`LOC_SERVER`** — vive en el disco del servidor.
- **`LOC_CENTRAL`** — vive en una cuenta remota, con JSON sobre HTTP y el
  SteamID como identidad (`CreateCharacterReq.cpp`, `LoadCharacterReq.cpp`).

O sea que **la pregunta de dónde se guarda ya estaba resuelta como «en los tres,
y el juego no lo sabe»**. El resto del código habla con `charinfo_t`, no con un
fichero. Eso es lo que hay que copiar, y es lo único de esta parte que copiaría
sin pensarlo.

## El formato, que está bien pensado y hay que robárselo

El fichero es una **cabecera de tamaño fijo y luego trozos con etiqueta**:

```
CHARDATA_HEADER1        savedata_t entero (unos 270 bytes, empaquetado a 4)
CHARDATA_MAPSVISITED1   int n + n cadenas
CHARDATA_SKILLS1        por estadística: cuántas propiedades, y por cada una
                        valor (short) + experiencia (int)
CHARDATA_SPELLS1        n cadenas
CHARDATA_ITEMS2         el equipo
CHARDATA_STORAGE1       almacenes con nombre, cada uno con sus objetos
CHARDATA_COMPANIONS1  CHARDATA_HELPTIPS1  CHARDATA_QUESTS1  CHARDATA_QUICKSLOTS1
CHARDATA_UNKNOWN        «If >= CHARDATA_UNKNOWN, then skip it?»
```

Dos decisiones ahí que valen para nosotros:

1. **Versión en la cabecera**, y la usan de verdad: `SAVECHAR_VERSION_MSC 11`
   para los personajes de Master Sword Classic y `12` para Rebirth, con un
   camino de compatibilidad para leer los viejos
   (`if (Version == SAVECHAR_VERSION_MSC && i == SKILL_SPELLCASTING)`). Un
   personaje de hace quince años todavía carga.
2. **Trozos que se pueden saltar.** Si aparece una etiqueta desconocida, se
   ignora. Añadir algo nuevo no rompe los guardados de antes.

Un personaje entero es del orden de **unos pocos KB**. Eso importa para lo de
abajo: caben miles en cualquier almacén del navegador.

## Lo que recomiendo para nosotros, y lo que hay que temer

**Sí, local para empezar.** Pero con tres cosas decididas desde el primer día,
porque las tres son caras de añadir después.

### 1. IndexedDB, no `localStorage`

`localStorage` son 5–10 MB, es síncrono —bloquea el bucle de dibujo— y sólo
guarda texto. IndexedDB tiene cuota de verdad, es asíncrono y guarda objetos.
`localStorage` se queda para las preferencias del visor.

### 2. Y hay que decir en voz alta que **el almacén del navegador se puede borrar**

Esto es lo que de verdad hay que temer, y no es una posibilidad remota:

- El navegador **puede desalojar** los datos si le falta espacio, salvo que se
  pida `navigator.storage.persist()` — y aun concedido, no es una promesa
  absoluta.
- «Borrar datos de navegación» se lo lleva **todo**, y el jugador lo hace por
  otros motivos.
- Es **por origen y por navegador**: el personaje no existe en otro equipo, ni
  en el mismo equipo con otro navegador, ni en una ventana privada.

Por eso **exportar e importar un personaje a fichero no es un extra, es la copia
de seguridad**, y tiene que estar desde el principio. Un `.json` que el jugador
se descarga y arrastra de vuelta.

### 3. El juego no habla con el almacén: habla con un ALMACÉN

Una interfaz de cuatro operaciones —listar, leer, escribir, borrar— con dos
implementaciones: la local ahora y la remota cuando haya servidor. Es
exactamente lo que MSR consigue con `charloc_e`, y lo que permite que «pasar a
cuentas en la nube» sea escribir una clase y no tocar el juego.

Y el registro, un documento suelto con **identidad, versión y fecha**, que se
pueda mandar por la red tal cual:

```json
{ "id": "...", "version": 1, "actualizado": "2026-09-26T…",
  "nombre": "...", "genero": "...", "oro": 10,
  "estadisticas": { … }, "habilidades": { … },
  "objetos": [ … ], "almacenes": { … }, "mapasVisitados": [ … ] }
```

Con **una regla prestada de MSR: al leer, lo que no se entienda se conserva y se
vuelve a escribir tal cual.** Así una versión vieja del juego no le borra a un
personaje lo que una nueva le añadió.

### Lo que NO recomiendo todavía

Montar cuentas, servidor o sincronización ahora. No hay multijugador, no hay
nada que sincronizar, y el diseño de arriba deja esa puerta abierta sin coste.

## Propuesta de siguiente hito, si te parece

**La hoja de personaje y el inventario, con los datos reales del archivo y sin
intérprete.** Concretamente: leer los seis atributos, las nueve habilidades y la
curva de experiencia del C++; leer el catálogo de objetos de los 861 `.script`
con su herencia resuelta —nombre, modelo, valor, calidad, tipo, apilable,
vestible—; y montar la hoja y la rejilla.

Es la parte barata de todo lo que has pedido, no compromete ninguna de las tres
salidas del intérprete, y al acabar hay algo que se toca.
