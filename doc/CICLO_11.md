# El ciclo de sesión — experimento 11

> El paso 1 de [PROYECTO_10.md](../PROYECTO_10.md) §5: **llegas → ¿tienes
> personaje? → crear o elegir → apareces en el templo → juegas → mueres →
> reapareces → al salir se guarda.**
>
> **499 comprobaciones en verde** (463 y 36 nuevas) y **23 de 23 controles en
> pantalla**.

```
npm run gatecity:aparicion    mide dónde debe aparecer un personaje nuevo
npm test                      499 comprobaciones en Node plano
node build/sondas/ciclo.mjs   el ciclo entero recorrido en el navegador
npm run dev                   ?map=gatecity  ·  K = morirse
```

---

## Lo que contestó el mod, y no yo

Esto entró como una preferencia tuya —«que todos empiecen en el templo, que es
seguro»— y resultó estar **escrita en los scripts del juego**.

En `MSCScripts/scripts/help/` hay nueve guiones de PRIMERA VEZ: `first_npc`,
`first_death`, `first_vendor`, `first_transition`, `first_monster`,
`first_skillgain`, `first_marketsquare`, `first_party`, `first_hireling`. Son
el tutorial de Master Sword. Y uno de ellos es el que enseña a hablar:

```
{ game_targeted_by_player
   "You are looking at <nombre>.|To speak to him, change your text
    speech mode to local [U] and say 'hello' or 'hail'" }
```

**De los 2 884 scripts del mod, exactamente CUATRO lo incluyen:**

```
scripts/gatecity/priest.script      scripts/edana/priest.script
scripts/gatecity/masterp.script     scripts/edana/masterp.script
```

Los sacerdotes de los dos templos, y nadie más. Y los dos mapas que los llevan
son los dos que tienen `ms_player_begin` —«Map must have a `ms_player_begin`
in order for people to create characters there!», `player.cpp:2558`—. O sea
que **el equipo de Master Sword designó al sacerdote del templo como el primer
NPC que ve un personaje recién creado.** Tu instinto y su diseño coinciden, y
eso se comprueba con un `grep` en vez de discutirlo.

Así que el punto de aparición no es una constante en el código: lo **deriva**
`tools/aparicion.mjs`, anclado en esos cuatro scripts, y lo escribe en
`build/gatecity/aparicion.json` con su tabla al lado.

| sitio | luz del suelo | `msarea_town` | hostiles a 15 m |
| --- | --- | --- | --- |
| `ms_player_begin` (lo que trae el mapa) | **18**/255 | fuera | **3** — goblin a 12,5 m |
| las tres reapariciones más cercanas | 16–23 | fuera | 3 |
| centros de los 8 pueblos | 33–38 | dentro | 0 |
| **→ el templo, junto al sacerdote** | **66** | **dentro** | **0** — el primero a 89,5 m |
| la herrería de Roland | **193** | dentro | 0 |

### Y por qué NO se elige la herrería, que tiene tres veces más luz

Porque «el sitio más iluminado» no elige un lugar: **elige una bombilla.** Los
tres sitios que empatan a 193 son la herrería, el cazador y la tienda de magia,
y los tres están debajo de una lámpara (`pi_lantern`, la única textura que
`info_texlights` declara emisiva, con el mapa de luz a 181 de mediana contra
17 de la roca).

Por eso el **ancla** sale del mod y la luz sólo decide el rincón. Y eso tiene
su control: *«el ancla cambia la respuesta»* exige que exista un sitio seguro
**más claro** que el elegido y aun así descartado. Si no lo hubiera, anclar no
estaría haciendo nada y sería un sello de goma.

Los siete controles de la herramienta, en verde: gana al punto del mapa en luz
(66 contra 18) y en hostiles (0 contra 3), cae **dentro** de un `msarea_town`
cuando el del mapa cae fuera, se puede estar de pie a la altura de los pies
**y de la cabeza**, no aparece dentro de ningún NPC (1,6 m al más cercano),
mira a 12,6 m despejados, y el ancla decide.

---

## Lo que dice el motor sobre morir, y lo que el juego le cuenta al jugador

Todo esto está leído de `server/player/player.cpp` y `server/sv_character.cpp`,
y está en las constantes de [src/juego/sesion.js](../src/juego/sesion.js).

| | |
| --- | --- |
| El anuncio | `UTIL_ClientPrintAll(HUD_PRINTCENTER, "%s has fallen!")` |
| El impuesto | **`float DeathTax = 0.01;`** — el 1 % del oro, y `int TaxOut` **trunca** |
| Cuándo se cobra | **sólo** `KILLED_BY_MONSTER`. Trampa, uno mismo o un NPC con `NPC_NO_XP_PENALTY`: gratis |
| Los objetos | `//Lose all items` … `m_fDropAllItems = false;` — **no se suelta nada** |
| Volver | soltar todas las teclas, pulsar una; o **5 s** con `mp_forcerespawn` |
| Dónde | `JN_TRAVEL: //Transitioned to new map OR DIED, respawning at last transition` |
| Guardado | **3,0 s** en local; **`RANDOM_FLOAT(4.0f, 8.0f)`** con servidor maestro |

### Tres de esas líneas cambian el diseño, no lo adornan

**El juego te miente sobre el impuesto.** El aviso de primera muerte,
`scripts/help/first_death.script`, dice literalmente *«When you die you lose 5%
of your gold!»*. El código cobra el **1 %**. Alguien cambió el número y no el
texto. Aquí se cobra lo que cobra el código y **la pantalla de muerte lo cuenta
al lado**: enseñar el 5 % sería repetir su errata, y enseñar el 1 % callado
sería perder el hallazgo. Y como trunca, **con el oro de partida —diez
monedas— morir sale gratis**, que es una decisión de diseño entera escondida en
un `int`.

**El comentario de los objetos dice lo contrario que la línea.** `//Lose all
items` encima de `m_fDropAllItems = false`. Manda la línea.

**El desfase del guardado no es pereza.** `RANDOM_FLOAT(4.0f, 8.0f)` sólo
cuando hay servidor maestro: si veinte jugadores guardan con el mismo período,
los veinte llaman al maestro en el mismo instante **para siempre**. Es un
desfase deliberado contra la estampida, y lo copiamos porque el día que haya
cuenta central tendremos el mismo problema. Su prueba no comprueba el rango
—un período fijo de 6,0 también lo pasaría— sino la **dispersión**.

---

## Lo que se ha escrito

- **[src/juego/sesion.js](../src/juego/sesion.js)** — la máquina de estados, el
  daño, la muerte, la reaparición y el guardado. **Sin DOM y sin Three.js**,
  por la misma razón que `src/play/player.js`: el día que haya servidor, quien
  decide si estás vivo es este mismo archivo corriendo allí. Si aquí entra un
  `document`, ese día hay que reescribirlo.
- **[tools/aparicion.mjs](../tools/aparicion.mjs)** — mide el punto de aparición
  (`npm run gatecity:aparicion`) y lo escribe con su tabla y sus 7 controles.
- **[src/juego/interfaz.js](../src/juego/interfaz.js)** — ahora **cuelga de la
  sesión**. Las pantallas las manda el estado: ELIGIENDO y MUERTO son
  **obligatorias** y no se cierran con Esc. Ése era el diagnóstico de
  PROYECTO_10 §1 — *«la hoja de personaje no cuelga de nada, se abre con C
  porque no hay un momento en el que deba abrirse»*— y queda cerrado.
- **[test/juego_sesion.test.mjs](../test/juego_sesion.test.mjs)** — 36
  comprobaciones, con el reloj y el azar inyectados para no esperar ni cinco
  segundos ni tener suerte.
- **[build/sondas/ciclo.mjs](../build/sondas/ciclo.mjs)** — el ciclo recorrido en
  el navegador, 23 controles y cuatro capturas.
- **[CREDITOS.md](../CREDITOS.md)** — el crédito al equipo de MSR y a DrKill, y lo
  que este repositorio contiene y lo que no.

---

## LOS DOS FALLOS DE ESTA RONDA, y los dos son de los caros

### 1. Cerrar una ventana te resucitaba

`PlayerDeathThink()` espera a que se pulse un botón para levantarte, y yo le
pasé a la sesión `botonPulsado: keys.size > 0` — **todas** las teclas. Pulsar
Escape para cerrar la pantalla de muerte contaba como «quiero volver».

El motor lo dice explícito y yo no lo leí: `pev->button & ~IN_SCORE`. Son los
**botones de juego**, y enmascara incluso la del marcador. Tres controles en
rojo de una vez, y los tres eran éste.

### 2. Volví a caer en la trampa que está documentada en el propio archivo

El rumbo al aparecer lo calculaba con `rumboDeLlegada()`, que lanza rayos de
Rapier. Y encima de esa función, en `src/main.js`, escrito hace dos sesiones:

> **ANTES del jugador** — esto tiene que llamarse antes de crear la cápsula. Si
> el jugador ya existe, el rayo sale de DENTRO de su propio colisionador y con
> `solid=true` devuelve impacto a distancia CERO en las veinticuatro
> direcciones, así que se queda con la primera y devuelve yaw 0 — **que es
> exactamente el valor que esto venía a no usar. No da error: da el valor por
> defecto con pinta de calculado.**

Al reaparecer, la cápsula **siempre** existe. O sea que por ahí no hay forma de
hacerlo bien. El jugador aparecía mirando a una pared a medio metro, y el
control «vivo sí anda» daba **0,00 m** con la W apretada.

Se arregla midiéndolo **al extraer**, con el árbol BSP, donde no hay cápsula
que estorbe — el mismo trato que la cota del suelo. El rumbo pasa a ser un
campo del punto de aparición, con su control: 12,6 m libres.

**La lección: un aviso escrito en el archivo no protege de nada si se lee el
código y no los comentarios.** Es la tercera vez en este proyecto que una sonda
o un cálculo devuelve un valor por defecto con pinta de resultado.

### Y una tercera, de sonda: medía lo contrario de lo que hace el motor

El control «un muerto no anda» pulsaba W y exigía que no se moviera. Pero
estando muerto, **pulsar un botón es la orden de levantarse**. El control
acusaba al código correcto. Ahora comprueba las dos cosas por separado: sin
personaje no se anda (0,000 m), y muerto pulsar W **levanta**.

---

## Lo que NO está, y se dice

- **Nada te hace daño.** No hay combate: eso es el paso 3. Por eso hay una
  tecla **K** que te mata, que es un andamio y se quita el día que un goblin
  pegue. Sin ella, media máquina de estados no se puede ni ver.
- **No hay animación de muerte.** El estado MURIENDO existe y dura cero: los
  `.mdl` traen su secuencia de morir y todavía no la tocamos.
- **La física sigue siendo una cápsula genérica**, no la de MSR. Paso 2.
- **Una sola partida local.** El almacén es la caché del cliente, no la verdad.
  Paso 4.
- **El templo está a 43 m del centro del pueblo más cercano** — dentro de su
  `msarea_town`, pero lejos del mercado. Cuando haya misiones habrá que mirar
  si eso es un paseo o un muro.
