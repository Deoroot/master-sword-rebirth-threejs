# Qué es esto, y en qué orden se hace

> **DECIDIDO.** Es una **demo jugable y gratuita, en la web, con varios
> jugadores**, que **reutiliza y expande Gate City**: todos empiezan en el
> templo —que es seguro—, se mejora el sistema de misiones y se amplían las
> cuevas y el exterior para sostenerlas. Las estadísticas son las de Master
> Sword. Nunca se vende.
>
> Lo de abajo estaba escrito antes de esas tres respuestas y **una parte queda
> anulada**: proponía entregar el jharro y usar Gate City sólo como patrón de
> medida. No es eso. Se marca dónde.
>
> Y queda **una cosa por resolver, y es la única que bloquea el despliegue y no
> el trabajo**: ver §6.

---

## 0. La comprobación que vale más que las 463 pruebas

Una captura de la hoja de personaje del juego real, contra lo que este código
calcula para ese mismo personaje (Swordsmanship 2, Parry 2, las otras siete a 1):

| | nuestro | el juego |
| --- | --- | --- |
| Strength | **2** | 2 |
| Agility | **1** | 1 |
| Concentration | **2** | 2 |
| Awareness | **1** | 1 |
| Fitness | **1** | 1 |
| Wisdom | **2** | 2 |
| Vida | **15** | 15/15 |
| Maná | **20** | 20/20 |
| Aguante | **7,5** | 7/7 |
| Carga | **75** | 14/75 |

**Seis de seis y cuatro de cuatro.** Las seis medias ponderadas de
`GetStat()`, el suelo de uno de `CStat::Value()` y las cuatro fórmulas de
`playershared.cpp` reproducen la hoja del juego sin tocar un número.

Y contesta la duda de la pregunta 2: **GoldSrc no tiene sistema de
estadísticas.** GoldSrc es el motor —dibuja, mueve y hace de red— y sólo sabe
de `health` y `armor`. Los seis atributos, las nueve habilidades, la curva de
experiencia y las escuelas de magia son **de Master Sword**, escritos por su
equipo en el C++ del mod. Cuando dices «el suyo», es esto, y es lo que ya está
puesto.

---

## 0b. El templo, medido: tu instinto era correcto

| sitio | luz del suelo | hostiles a 15 m | |
| --- | --- | --- | --- |
| **el templo** (Sacerdotes de Urdual) | **72–91**/255 | **0** | lo más claro del mapa |
| centros de los 8 pueblos | 20–69 | 0 hostiles, 3–7 vecinos | |
| `ms_player_begin` (donde empieza el mapa) | 18 | **3**, goblin a 13 m | |
| las 3 reapariciones lejanas | **0–6** | zombis a 21 m | |

El templo está en (0,6, −10,6, −62,8) en ejes de escena, con Theobold y dos
Sacerdotes de Urdual. **Es el punto más iluminado y sin un solo hostil cerca**,
y eso no es una impresión: es el mapa de luz y el censo de bichos.

---

## 1. El diagnóstico, sin adornos

Lo que hay hoy, medido:

| | |
| --- | --- |
| Un mapa de GoldSrc reproducido | 41 650 triángulos, luz horneada, parpadeo, cielo, detalle |
| 69 NPC con modelo, piel, cuerpo y animación | y 10 adornos que se mueven |
| Andar | cápsula de Rapier, suelo, salto |
| Un personaje | seis atributos derivados, nueve habilidades, catálogo de 760 objetos, inventario, almacén local |
| Comprobaciones | 463 en verde |

Lo que NO hay, y no son detalles:

- **Física de jugador parecida a la de MSR.** Andamos con una cápsula genérica.
- **Daño, muerte, reaparición.** Un goblin no te toca y tú no te mueres.
- **Un ciclo de sesión.** En MSR es: te conectas → el servidor mira tu Steam ID →
  si no tienes personaje te pide crearlo → apareces → juegas → mueres →
  reapareces → al desconectar se guarda. Nosotros cargamos un mapa y andamos.
- **Una definición.** Y ésta es la que hace que las otras tres no se puedan
  ordenar.

El orden importa porque **el ciclo de sesión es la espina**: la hoja de
personaje que acabo de montar no cuelga de nada. Se abre con `C` porque no hay
un momento en el que deba abrirse.

---

## 2. Lo que creo que es, y por qué

### Un port no se puede entregar. Eso no es una opinión, es la regla del 02

«**Ningún asset entra sin licencia al lado.**» Todo lo extraído vive en
`build/`, que está en `.gitignore`, y **no se mueve un byte a `public/`**. Eso
significa que lo que hemos construido **sólo corre en un equipo que tenga Master
Sword instalado al lado**. Como port es honesto y como producto no existe: no se
lo puedes dar a nadie.

O sea que «port» nunca fue el destino. Fue el método.

### Y el proyecto ya había contestado esto una vez

El experimento 04 construyó **el jharro**: una ciudad excavada, propia, con
proporciones **medidas de Gate City**. El 05 reprodujo Gate City para saber «¿de
qué es capaz esta pila?». La respuesta está escrita: *«al jharro le falta
trabajo, no herramientas»*.

**Gate City es el instrumento de medida. El jharro es lo que se entrega.** Eso
estaba decidido y nos hemos ido alejando de ello vuelta a vuelta, porque
reproducir Gate City daba resultados bonitos y medibles.

### ~~Así que: es un juego nuestro, y Master Sword es el patrón~~ — ANULADO

**Esto ya no aplica.** La decisión es reutilizar y expandir Gate City, no
sustituirlo por un mundo propio. Lo que sigue en esta tabla se deja porque la
primera línea —lo que se entrega y lo que no— **sigue en pie y es §6**.

| | |
| --- | --- |
| **Lo que se entrega** | mundo, arte, música y contenido **nuestros** |
| **Lo que nunca se entrega** | ni un byte de MSR |
| **Para qué sirve MSR** | como patrón contra el que medir, y como diseño que se puede leer |
| **Qué es Gate City aquí** | el banco de pruebas: si nuestro render, nuestra luz y nuestra IA funcionan ahí, funcionan |

Y hay una línea que ya usamos y vale para todo esto: **leer el diseño es
nuestro, copiar el contenido no.** Que `MaxHP = 5 + (STR−1)·7 + …` es un hecho
sobre un sistema que funcionó durante veinte años; usarlo es aprender, no
copiar. Los 760 objetos con sus nombres son contenido y se quedan en `build/`.

**Y ahí hay una decisión tuya que no puedo tomar yo:** si el juego lleva las
estadísticas de MSR, lleva su equilibrio. Eso está bien si lo que quieres es
*ese* juego mejorado; no lo está si quieres otro.

---

## 3. Lo del punto de inicio: medido, y la respuesta no es la que parece

Preguntaste si cambiamos dónde empieza el jugador porque en el original sale a
una cueva oscura con goblins. Medí los veinte candidatos que el mapa ofrece —la
entrada oficial, las once reapariciones y los ocho pueblos— por tres cosas:
distancia al pueblo más cercano, luz del suelo, y bichos a menos de quince
metros.

| candidato | al pueblo | luz | bichos a 15 m | el más cercano |
| --- | --- | --- | --- | --- |
| `ms_player_begin` (el del mapa) | **47 m** | **18**/255 | **3** | Goblin a 13 m |
| `ms_player_spawn` #1–#8 | 45–49 m | 16–23 | 1–3 | Goblin a 10–15 m |
| `ms_player_spawn` #9–#11 | 78–79 m | 0–6 | 0 | Zombi enano a 21 m |
| los 8 pueblos | 0 m | 20–69 | 3–7 | vecinos y guardias |

**Candidatos que mejoren al oficial en las tres cosas a la vez: cero.**

Las once reapariciones son iguales de malas o peores — tres de ellas están a
**79 metros y a oscuras del todo**, con zombis. No hay un sitio mejor que elegir
dentro del mapa.

Y eso explica por qué: **en Master Sword nunca llegas ahí nuevo.** Llegas con un
personaje hecho desde otro mapa, por un `msarea_transition` —Gate City tiene
dos—. La cueva de entrada no es el principio del juego: es una puerta entre dos
mapas. El principio del juego estaba en otro sitio.

Así que la respuesta no es «elijamos otra entidad»: es **que el sitio donde
empieza un personaje nuevo es una decisión de diseño NUESTRA**, y la medida de
arriba dice que ninguno de los veinte sirve. Para nuestro mundo, el arranque se
pone donde queramos y con las cifras que queramos —el jharro ya tiene 58 celdas
de cueva de principiante pegadas al pueblo, del experimento 04—.

---

## 4. El orden que propongo, y por qué es ése

La regla: **nada nuevo hasta que lo anterior tenga dónde colgarse.**

### 0. Esta página, acordada. *(ahora)*

Si no estás de acuerdo con el punto 2, todo lo de abajo cambia. Es la única
parte que no puedo decidir yo.

### 1. El CICLO DE SESIÓN, aunque sea local *(pequeño, y es la espina)*

```
llegas  →  ¿tienes personaje?  →  no: crearlo   →  apareces  →  juegas
                                   sí: elegirlo                    ↓
                             al salir se guarda  ←  reapareces  ←  mueres
```

Es lo que MSR hace con el Steam ID y nosotros podemos hacer con el almacén
local que ya está escrito. **Es poco código y lo cambia todo**: la hoja de
personaje deja de ser una tecla suelta y pasa a ser un paso; el punto de inicio
pasa a tener a alguien que lo use; y «morir» pasa a tener a dónde volver.

### 2. La FÍSICA del jugador, contra las cifras del motor *(medible)*

Lo pediste y es lo siguiente porque todo lo demás lo toca. GoldSrc tiene sus
números escritos —velocidad máxima, aceleración, fricción, gravedad, altura de
escalón, altura de salto, agacharse— y MSR los modifica. Se leen y se comparan,
igual que se hizo con la gamma: **una cifra del motor vale más que una
calibrada a ojo**, y ese error ya nos costó tres rondas con la luz.

El juez es el mismo tipo de sonda que ya existe: andar una distancia conocida en
un tiempo conocido, saltar una altura conocida, subir un escalón de 18 unidades.

### 3. DAÑO, MUERTE y REAPARICIÓN *(la mitad del bucle que falta)*

Lo mínimo: un bicho te toca, pierdes vida, la vida llega a cero, mueres,
reapareces. Con las fórmulas que ya están leídas (`MaxHP`, los tipos de daño del
catálogo). Sin IA todavía — un goblin que te golpea al tocarte ya cierra el
bucle y se puede medir.

### 4. Y ENTONCES lo demás

Combate de verdad, IA, movimiento con `UTIL_MoveToOrigin`, tiendas, hechizos. En
ese orden y no antes, porque todos cuelgan de 1 a 3.

**La hoja de personaje y el inventario que acabo de hacer se quedan**, pero
reconozco que iban por delante de su sitio: son el paso 1 de una lista cuyo
paso 0 no estaba escrito.

---

## 5. El orden, corregido por «varios jugadores»

Que sean varios jugadores **cambia el orden de arriba**, y no un poco:

- **La autoridad pasa al servidor.** Un personaje que vive sólo en el navegador
  es trivial de trucar: abres las herramientas de desarrollo y te pones
  Swordsmanship a 100. En un juego de un jugador da igual; en uno de varios es
  el juego. Master Sword ya pasó por esto — de `LOC_CLIENT` (el personaje en el
  disco del jugador, subido al entrar) a `LOC_CENTRAL`, una cuenta remota.
- **El almacén local que acabo de escribir pasa a ser una CACHÉ**, no la
  verdad. La interfaz de cuatro operaciones ya está preparada para eso: se
  escribe `AlmacenRemoto` y el juego no se entera.
- **La física del jugador pasa a ser código COMPARTIDO.** El servidor tiene que
  simularla o al menos validarla, así que no puede vivir dentro del visor.

El orden queda:

| | | |
| --- | --- | --- |
| **1** | ~~**El ciclo de sesión**~~ **HECHO** | llegas → ¿tienes personaje? → crear o elegir → apareces **en el templo** → juegas → mueres → reapareces → al salir se guarda. Ver [CICLO_11.md](doc/CICLO_11.md): 499 comprobaciones y 23 controles en pantalla. Y el templo no lo elegimos nosotros — lo dicen los 4 scripts de 2 884 que incluyen `help/first_npc`. |
| **2** | ~~**La física del jugador**~~ **HECHO** | ver [FISICA_12.md](doc/FISICA_12.md): 549 comprobaciones y 19 controles cronometrados. Módulo compartido, sin DOM ni Three. Y encontró que andábamos un **23 % de más**, por tener `player.js` a 32 u/m cuando GoldSrc son 39,37. Las teclas van con esto, con los valores por defecto del `config.cfg` del juego. |
| **3** | **Daño, muerte y reaparición** | el bucle mínimo, sin IA |
| **4** | ~~**El servidor**~~ **HECHO** | Node, sockets, y el personaje pasa a vivir allí. Ver [RED_27.md](doc/RED_27.md): 1 021 comprobaciones y 21 controles con **dos navegadores** contra un servidor de verdad. Un proceso por partida, sin P2P, el almacén local ya es la caché — y el servidor corre **la misma** física, no una parecida: 0,5 mm de error entre lo predicho y lo autoritativo. |
| **5** | **Combate, IA, misiones, ampliar las cuevas** · ~~mudar los bichos~~ **HECHO** | los 69 bichos de Gate City los decide el servidor. Ver [IA_28.md](doc/IA_28.md): 1 059 comprobaciones y 15 de 15 controles con **dos navegadores viendo el mismo pueblo** (mediana 0 mm). El golpe se pide y el servidor lo resuelve **rebobinando** al instante que el jugador veía. Falta: el escudo del jugador contra el daño de un bicho, las misiones y las cuevas. |

Los pasos 1 a 3 valen igual para uno o para varios y **no hay que rehacerlos**
si se escriben pensando en el 4. Por eso van antes: el servidor sobre un juego
que todavía no tiene muerte no tiene nada que sincronizar.

---

## 6. LO ÚNICO QUE BLOQUEA EL DESPLIEGUE, y hay que decidirlo antes de desplegar

Desplegar en la web **es distribuir**. Que sea gratis y que nunca se venda no
cambia eso: el mapa `gatecity.bsp` es de DrKill, y las texturas, los modelos y
los sonidos son de Master Sword —algunos heredados a su vez de Half-Life—.
Hasta ahora eso no ha sido un problema porque **la regla del 02 lo ha impedido
por construcción**: todo vive en `build/`, nada pasa a `public/`, y esto sólo
corre en un equipo que tenga el mod instalado al lado.

En el momento en que se sube a un servidor, sale.

Hay tres caminos y **los tres son legítimos**:

1. **Pedir permiso.** Master Sword es un mod de comunidad y su equipo es
   localizable. Cuesta un correo y puede que digan que sí — es una demo que les
   hace publicidad. Si dicen que sí, no hay nada más que discutir.
2. **Rehacer lo que se entrega.** El mundo con geometría y arte nuestros, con
   la FORMA de Gate City. No es tan caro como suena: **todas las proporciones
   ya están medidas** —huella, plantas, altura libre, densidad de luz, reparto
   de texturas, tamaño de cara— y el experimento 04 ya construyó un mundo así.
   Y además vas a hacer geometría nueva de todas formas: has dicho que quieres
   ampliar las cuevas y el exterior.
3. **Dos versiones.** La local, que lee `../MSC/` y es el banco de pruebas con
   el original al lado; y la desplegada, con lo nuestro. El código es el mismo;
   cambia de dónde salen los bytes.

**Mientras no se despliegue, nada de esto frena el trabajo.** Los pasos 1 a 5
de arriba se hacen igual, contra Gate City, en local. Pero conviene decidirlo
pronto, porque si la respuesta es la 2, cuanto antes se sepa qué hay que
rehacer, menos se rehace.

---

## 7. «¿Cuánto hay que cambiar Gate City?» — la respuesta honesta

**No soy abogado, y para algo que se publica querrás una opinión de verdad.**
Dicho eso, la parte de ingeniería sí la puedo contestar y es la que decide.

### No hay un porcentaje

La geometría de un mapa **es la obra**. No es un contenedor de texturas: es el
trazado, las proporciones, dónde está cada sala y por dónde se pasa — eso es lo
que firmó DrKill y es la parte que tú mismo dices que es la mejor. Cambiar las
texturas no toca eso. Y **una obra derivada sigue siendo derivada** por mucho
que se modifique: no existe un «cambia el 30 % y ya».

Así que la pregunta «¿cuánto hay que cambiar?» tiene una respuesta incómoda:
**lo suficiente como para que deje de ser Gate City** — que es exactamente lo
contrario de lo que quieres.

### Lo que eso implica: pedir permiso no es el plan B, es el ÚNICO que llega a donde quieres

Tu objetivo es *reutilizar y expandir* Gate City. Rehacerlo no lo cumple: da
otro mapa. Así que de los tres caminos del §6, **el primero es el que sirve**, y
es el más barato: un correo.

Y hay motivos para pensar que la respuesta puede ser que sí:

- Master Sword está **vivo**: nueve servidores, versión `MS:R MAR2026a`. Hay un
  equipo al que preguntar, y es localizable por Steam, ModDB y su Discord.
- Es un mod libre de comunidad, no un producto.
- Lo que propones es una demo **gratuita, que nunca se vende**, que les hace
  publicidad y que enseña su mapa a gente que no va a instalar Half-Life.

Lo que hay que pedir es de **dos partes**, y conviene saberlo antes de escribir:

| qué | de quién |
| --- | --- |
| `gatecity.bsp` — el trazado | DrKill |
| las 92 texturas, los 17 `.mdl` de adorno, los 24 modelos de NPC, los `.spr` | el equipo de Master Sword |
| lo heredado de Half-Life (`glow01.spr` ni siquiera está en MSC: viene del juego base) | Valve — **y esto el equipo de MSR no te lo puede ceder** |

Ese último punto importa: aunque digan que sí, **lo que venga de Half-Life
sigue fuera**. Son pocas cosas y son sustituibles —el halo ya es nuestro, un
degradado generado—, pero hay que revisarlas una por una antes de desplegar.

### La buena noticia: las herramientas SÍ dan la talla, y ya las tenemos

Dices que nuestras herramientas no hacen mapas de la calidad de los de MSR. Eso
era verdad del **generador procedimental** del experimento 04. No lo es de la
cadena de compilación, porque resulta que ya está instalada:

```
C:\Desarrollo\ericw-tools\qbsp.exe  -hlbsp   ->  "target Half Life's BSP format"
C:\Desarrollo\ericw-tools\light.exe           ->  hornea el mapa de luz
```

**`qbsp -hlbsp` emite BSP30 — el mismo formato que Gate City** — y `light`
hornea el mismo tipo de mapa de luz que ya sabemos leer al byte. O sea:

- un mapa se puede **escribir a mano** en TrenchBroom, J.A.C.K. o Hammer, que
  son los mismos editores con los que se hicieron los mapas de MSR;
- se compila con lo que ya hay;
- y **nuestro lector y nuestro visor ya lo dibujan**, con luz horneada,
  parpadeo, texturas de detalle, adornos y bichos.

El proyecto ya compila `.map` propios con `qbsp`: `npm run verdict` lo lleva
haciendo desde el experimento 02, y `public/maps/` tiene cinco.

**El hueco nunca fue la herramienta: fue quién dibuja.** El jharro salió beige
por tres cosas que hoy están medidas y resueltas — una textura en vez de las
diez que hacen falta para el 80 % de la superficie, caras de 1,10 m² en vez de
0,47, y ni adornos ni luz horneada. Un segundo intento no parte de donde partió
el primero.

### Lo que propongo hacer, y es hacer las dos cosas a la vez

1. **Escribir el correo ahora.** Cuesta una tarde y desbloquea el camino bueno.
   Si dicen que sí, no hay nada que rehacer.
2. **Mientras tanto, seguir con los pasos 1 a 3** —ciclo de sesión, física,
   muerte— **contra Gate City en local**. Ninguno depende de quién sea el mapa:
   son código nuestro sobre datos que no salen de `build/`.
3. **Decidir el despliegue cuando llegue la respuesta.** Si es que no, para
   entonces los sistemas están hechos y lo que falta es un mapa — con una cadena
   de compilación que ya funciona y un visor que ya lo dibuja.

Lo que **no** haría es parar el juego para rehacer geometría antes de saber si
hace falta.

---

## 8. El menú principal y el modelo de servidores

Tu observación encaja con el §5 y lo concreta. Master Sword usa el modelo de
Valve: **un menú principal, una lista de servidores, y cada servidor es la
autoridad**; con el servidor maestro (FN) los personajes viven en la cuenta, y
sin él el servidor los guarda en su propio disco. **No hay P2P**, y eso es una
decisión de diseño, no una limitación: en un juego donde el personaje persiste,
el que guarda tiene que ser alguien en quien confías.

Para nosotros se traduce casi uno a uno:

| Master Sword | nosotros |
| --- | --- |
| menú principal (*Visit a Kingdom* / *Establish a Kingdom*) | una pantalla de entrada antes del mapa |
| lista de servidores por Steam | una lista de partidas del servidor de la demo |
| el servidor de juego es la autoridad | un proceso de Node por partida |
| FN guarda los personajes; sin FN, el servidor los guarda | primero el servidor; una cuenta central es un añadido posterior |
| sin P2P | igual |

Y confirma lo del §5: **el almacén local que ya está escrito es la caché del
cliente, no la verdad.**
