# PEGARLE A UNA RATA — experimento 80

> `npm test` **1908 de 1908**, `npm run sonda:edana80` **21 de 21**.
> Seis roturas deliberadas, seis rojas.

El usuario describió tres cosas, las tres mirando a una rata del templo de
Edana:

1. «hay algo raro con las animaciones que hacen los npcs/bichos hostiles»;
2. «aveces parece que las colisiones no funcionan y puedes atravesarlos»;
3. «el contacto que hacen las armas es raro: hace un sonido que da a pensar que
   le estás haciendo daño pero no está pasando nada, y tienes que pegar más
   cerca y el sonido cambia otra vez y ahí recién recibe daño».

Las tres eran reales. La tercera son **dos fallos** en la misma función. La
segunda resultó no ser lo que parecía. Y por el camino salió una cuarta que
nadie había notado: **el mismo bicho tenía dos tamaños en el mismo fotograma**.

Lo que las cuatro tienen en común es que **ninguna sonda del proyecto podía
verlas, y por una sola razón: las tres sondas de combate miden todas contra
goblins y zombis.** Nunca se había puesto un control delante de una rata. Es
literalmente la frase que el 67 ya escribió sobre las arañas, trece
experimentos después y sin que nadie la aplicara.

---

## 1. La animación del ataque: faltaba `CAnimOnce`, y son dos mitades

Un bicho de Master Sword ataca con `playanim once ANIM_ATTACK`
(base_npc_attack_new.script:619). `once` no significa «una vez»: significa que
**el sitio de la animación queda ocupado hasta que la secuencia acaba**.

```cpp
bool CAnimOnce::CanChangeTo(MONSTER_ANIM NewAnim, void *vData) {
  return m_fSequenceFinished ? true : false;     // monsteranimation.cpp:217-220
}
...
if (m_pAnimHandler->CanChangeTo(AnimType, vData) && pszAnimName)   // msmonsterserver.cpp:2023
```

Y Thothie dejó el síntoma escrito encima de esa guarda, en 2007:

> *«The code is causing monsters to break anims at weird moments — if you
> 'dance' around an affected monster, he can never attack, as his swing anims
> break»*

`Manada.pon()` no tenía nada de eso: sustituía la animación siempre que la
secuencia cambiara. Pero el arreglo **no es sólo la guarda**, y aquí está lo que
costó entender: hay una segunda mitad, porque quien devuelve la animación al
reposo es el `Think` del propio monstruo, **cada 0,1 segundos**:

```cpp
void CMSMonster::Think() { ... pev->nextthink = gpGlobals->time + 0.1;   // :511
...
  if (m_MonsterState != MONSTERSTATE_SCRIPT) {
    if (HasConditions(MONSTER_HASMOVEDEST)) SetAnimation(..., m_MoveAnim);
    else if (m_IdleAnim.len())              SetAnimation(..., m_IdleAnim);
                                                     // :586-600
```

Mientras el ataque corre, `CanChangeTo` rechaza esa petición; en cuanto acaba,
la acepta. **Las dos piezas son la misma**: sin la guarda la animación se corta,
y sin el `Think` no se suelta nunca.

### El cronograma, que es lo único que lo enseña

Medido con una rata sintética en `test/combate80.test.mjs` (su `attack` dura
1000 ms) y con el jabalí de verdad en la sonda (su `gore_forward` dura 1667 ms):

| | antes | después |
| --- | --- | --- |
| el PRIMER ataque | **2017 ms** | 980 ms |
| los siguientes | 33 / 120 / 120 / 120 ms | 1000 / 1000 / 1000 ms |
| el jabalí de Edana, en pantalla | — | 1620 / 1660 / 1630 ms |

O sea: el bicho se sacudía un 3 % de su animación de ataque y pasaba el resto
del ciclo **corriendo en el sitio**, y en el primer golpe se quedaba congelado
en el último fotograma el doble de lo que dura el archivo.

### Y una cosa que creí y no era: el reloj de 2 segundos es del mod

El primer diagnóstico fue «el ciclo de pensar es 0,1 s, así que el ataque se
corta en el fotograma siguiente», y **la primera prueba salió verde con el
código roto**. El ciclo no es 0,1 s mientras el bicho no tiene objetivo: es 2,0
s (`CYCLE_TIME_IDLE`, base_npc_attack_new.script:95), y el reloj se rearma en la
**primera línea** de `npcatk_hunt` —`callevent CYCLE_TIME npcatk_hunt`, línea
232— o sea **antes** de que `npcatk_settarget` llame a `cycle_up` (:433 →
:1358). El mod también se queda dos segundos parado tras el primer golpe. Eso
no se toca: es suyo.

---

## 2. El arma: el motor da DOS intentos y el puerto daba uno

`DoDamage` busca en una esfera y se queda con el más cercano del cono. Eso ya
estaba portado desde el 21. Lo que no estaba es qué pasa **cuando la esfera no
encuentra a nadie**:

```cpp
//Didn't hit any NPCs with a normal attack.  Do a traceline to hit worldmodels, breakables, etc.
MSTraceLine(Damage.vecSrc, Damage.vecEnd, dont_ignore_monsters, ..., trflags);
if ((Damage.outTraceResult.flFraction < 1.0f) && Damage.outTraceResult.pHit) {
  CBaseEntity *pHit = DoDamage(Damage, CBaseEntity::Instance(Damage.outTraceResult.pHit));
                                                     // giattack.cpp:1636-1646
```

**`dont_ignore_monsters`, y es `DoDamage` entero**: daño completo, experiencia y
reacción. El puerto, en vez de eso, trazaba un rayo y si tocaba algo tocaba el
sonido de dar en piedra. Dos fallos de golpe:

### (a) el rayo no filtraba a los bichos — y esto es lo que se OÍA

En la misma función había **dos rayos y sólo uno filtraba**. `trazaLibre` —el
`ignore_monsters` del primer intento— excluía los cilindros de los bichos con
un predicado; el otro no lo pasaba. Así que el rayo chocaba contra el cilindro
de la rata y el golpe se contaba como «he dado a la pared».

En el mod eso es imposible por construcción: un monstruo manda `CE_HITMONSTER` →
`game_hitnpc` (msmonsterserver.cpp:2438-2445) y el `hitwall` sólo sale de
`CE_HITWORLD` (entity.cpp:20-26, genericitem.cpp:814). **Una rata no puede
sonar a piedra.** Lo que el jugador oía era el `SOUND_HITWALL1` de su espada —
`weapons/cbar_hit1.wav`, un golpe metálico perfectamente creíble.

### (b) y faltaba el daño, que es casi todo el alcance del arma

Porque la esfera mide contra el **centro** del bicho y la línea contra su
cuerpo. Con la espada oxidada y una rata, en unidades:

```
alcance del arma                       60
el ojo tiene que bajar                 48   (ojo 64 - centro de la rata 16)
radio horizontal que le queda          36   = √(60² − 48²)
lo que ya separan los dos cuerpos      32   (jugador 16 + rata 16)
────────────────────────────────────────
FRANJA ÚTIL DE LA ESFERA                4 unidades = 10 cm
```

Diez centímetros. Fuera de ellos, clang y cero daño; dentro, golpe. **Eso es
exactamente «tienes que pegar más cerca y el sonido cambia otra vez».** La
línea, que va al cuerpo y no al centro, es lo que hace jugable pegarle a algo
pequeño, y no estaba.

Medido en la sonda, a 40,0 u del eje de la rata (la esfera llega a 36,0): vida
**4 → 2,9**, `porLaLinea` 1, `contraPared` **0**.

---

## 3. El tamaño del cuerpo: el mismo bicho medía dos cosas

El colisionador salía de la caja MEDIDA de la malla del `.mdl`. El mod no
deduce el casco de la malla: lo escribe el guion y el motor lo usa tal cual.

```cpp
UTIL_SetSize(pev, Vector(-(m_Width/2), -(m_Width/2), 0),
                  Vector(m_Width/2, m_Width/2, m_Height));   // msmonsterserver.cpp:244
m_Width  = atof(Params[0]);   m_Height = atof(Params[0]);    // npcscript.cpp:201 y :210
```

Para la rata el guion dice **32 × 32 × 32** y la malla medía **33,5 de ancho y
28,5 de alto**. Y lo grave no es el decimal: **`candidatosDeGolpe()` ya usaba el
alto del guion** para decidir a quién le pegas. O sea que el mismo bicho tenía
un tamaño para chocar y otro para recibir, en el mismo fotograma.

Cambian **61 de los 69** de Gate City, **44 de los 48** de Edana y **57 de los
74** de `gertenheld_forest2`.

Dos cosas que esto cambia y hay que saber:

- los **once `deralia/commoner_sitting`** de Edana declaran `ancho 5`. Con el
  casco del guion se atraviesan casi del todo, **y así es en el original**: son
  los que están sentados en la taberna y el mapeador les puso ese ancho para
  que no estorbaran. Con la caja de la malla los hacíamos sólidos, que era más
  cómodo y no era MSR. Si alguien ve esto y lo lee como un fallo, está leyendo
  bien el síntoma y mal la causa.
- **cinco de los 74 de `gertenheld_forest2` no traen `setsize`.** Gate City
  tiene cero y Edana cero: otra vez el hueco que sólo enseña el tercer mapa.
  Esos se miden de la malla y **se cuenta en la consola**, porque un filtro que
  descarta en silencio es el sitio donde cabe un pueblo (el 63).

Y lo que **no** se ha cambiado, dicho aquí para que no se descubra luego: el
motor usa una **caja alineada con los ejes** y nosotros seguimos con un
cilindro. El argumento de siempre —«un bicho que gira no cambia de anchura»— es
justo lo que hace una caja de GoldSrc, que no rota nunca con su dueño, así que
el cilindro cumple lo mismo. La diferencia que queda son las esquinas: un
cilindro de radio `ancho/2` cabe dentro de la caja, o sea que un bicho es un
pelo más fácil de rodear en diagonal. Se conserva por no mover dos variables a
la vez con el tamaño.

---

## 4. «Puedo atravesar las ratas»: medido, y NO es lo que parecía

Esto es el apartado que más trabajo dio y el que menos código cambió.

La hipótesis era el colisionador: que las ratas no tuvieran, o lo tuvieran mal
puesto. **Se midió y no es eso.** En Edana, con la sonda dentro del juego:

```
apariciones       45 en el mundo de 48, 3 dormidos, 45 con cilindro
un rayo a 16 u del suelo, entrando desde fuera:  toca EL MISMO a 16,0 u del eje
el mismo rayo a 120 u (su aire):                 no toca nada
andando contra ella desde 2 m:   llega a 32,8 u de su eje (los cuerpos separan 32,0)
andando hacia el lado libre:     133,7 u en 3 s   <- el control positivo
```

O sea: **en un jugador solo, una rata para al jugador y lo hace exactamente en
el sitio.** Lo que queda son dos explicaciones, y las dos están abiertas:

1. **Con servidor, el cliente nunca le pone cilindro a un bicho que aparece.**
   La rama de red del bucle (`src/main.js`, dentro de `if (red)`) sólo llama a
   `seguir()`; el `poner`/`quitar` está en la rama sin red. Las ratas del templo
   salen de un `msarea_monsterspawn`, así que **en multijugador serían todas
   atravesables**. Está contado y NO arreglado en el 80: toca `src/red/` y el
   bucle, y quería dejarlo medido antes que a medias.
2. **El cadáver.** Al morir se le quita el cilindro —correcto, `pev->solid =
   SOLID_NOT` en `SUB_StartFadeOut`, combat.cpp:642— y el cuerpo sigue visible
   **23,6 segundos**. Atravesar una rata muerta que se ve es exactamente lo que
   se describe, y es fiel.

Y sobre los once sentados de la taberna, ver el apartado 3: ahí sí se
atraviesan, y también es fiel.

---

## 5. Lo que salió mal al medir, que es la parte que no se puede deducir

Seis veces, y vale la pena cada línea porque cinco son del apartado 4 de
CLAUDE.md en vivo.

| lo que hice | lo que medía de verdad |
| --- | --- |
| la primera prueba del corte de animación, **verde con el código roto** | que el ciclo ocioso es 2 s y no 0,1: el ataque no se cortaba porque nadie le pedía nada en dos segundos. El diagnóstico era correcto en la mitad equivocada |
| la primera medida del choque: «lo andado hacia la rata» | que el jugador **la rodeaba**. El cilindro es fino, el controlador desliza, y el avance en Z seguía creciendo. Lo que vale es la **holgura mínima entre ejes**, no lo andado. Es el 69 otra vez: comprueba que tu instrumento podía ver la presencia |
| el control positivo del cronograma contra **la rata** | que una rata **no ataca nunca al jugador**, y eso es correcto: `vermin` es RECELO con `human` y RECELO no es enemigo. Dio «0 ataques en 8 s», un rojo honrado pero del instrumento. El cronograma se mide contra un jabalí, que es el único hostil de Edana |
| `window.probe.porLaLinea`, que yo había añadido en `main.js` | **nada**: `montarSonda` construye su propia superficie, así que un getter del objeto que se le pasa no aparece en `window.probe`. Tres controles salieron `NaN` — que al menos se ve. Los contadores van dentro de lo que devuelve `atacar()` |
| el control negativo del clang: dieciséis rumbos horizontales | el tamaño de la sala. No hay pared a 60 u en ninguno de los dieciséis. Y mirando al suelo tampoco: **el ojo está a 64 unidades y la espada alcanza 60**, o sea que en vertical la hoja no toca el piso. El instrumento tiene que **ir andando** hasta la piedra, y entonces sale a 21,3 u |
| la rotura deliberada número 5, que dejó todo **verde** | que el `perl -0pi -e` **no había sustituido nada**. El patrón no casaba y el comando salió con 0. Media hora de «esta rotura no la caza ningún control» por una herramienta que falla en silencio. *Si rompes a propósito, comprueba que la rotura está puesta* — es el apartado 4 aplicado al método de comprobar el apartado 4 |

Y una de umbral, del 76: el control A de la sonda salió rojo con **1581 ms de
1667**, cinco fotogramas de menos, mientras la pasada anterior daba los tres
completos. El muestreo es por `requestAnimationFrame` y con el pueblo delante el
navegador se salta fotogramas. El umbral se bajó al **80 %** y no es holgura por
gusto: con el fallo puesto el ataque duraba **el 7 %** de su archivo, así que
entre el 7 % y el 80 % hay un factor diez, y entre el 95 % y el 80 % está mi
rejilla. Un control que falla una pasada de cada dos sin que nada esté roto es
ruido con forma de rojo y gasta la sesión siguiente.

---

## 6. Las seis roturas deliberadas

| rotura | qué se rompió | qué se puso rojo |
| --- | --- | --- |
| 1 | la guarda de `CAnimOnce` en `pon()` | «A. ningún ataque se corta»: un ataque duró 33 ms de 1000 |
| 2 | el soltar de `relojes()` | «B. ninguno se queda congelado»: uno duró 2017 ms de 1000 |
| 3 | `resolverGolpe` deja de herir por la línea | la rata 4 → 4, y el clang subió 1. Reproduce el juego de antes del 80 exactamente |
| 4 | `trazaDeLaLinea` deja de filtrar bichos | lo mismo, desde el otro lado de la costura: 4 → 4 y clang 1 |
| 5 | el tamaño vuelve a salir de la malla | «el casco de la rata es el `setsize` de su guion» |
| 6 | el descarte sin tamaño vuelve a ser silencioso | «y sin NADA no se inventa un cuerpo, y también lo dice» |

Las 3 y la 4 dan el mismo rojo a propósito: son las dos mitades de la misma
costura y hacía falta ver que cada sitio tiene su control.

Y conviene decir lo que **no** cazó ninguna rotura: romper el tamaño del
colisionador **no** pone roja a «y contra la rata se para», porque la caja de la
malla es más ANCHA que el casco del guion (16,8 contra 16,0 de radio). Ese
control no puede ver ese fallo, y no se apunta como si pudiera.

---

## 7. Lo que queda, por orden de lo que cierra

1. **Los cilindros en multijugador** (apartado 4, punto 1): el cliente no llama
   a `poner` cuando un bicho aparece. Es el único de los cuatro hallazgos del 80
   que se deja contado y sin arreglar, y se puede medir con dos Chrome como el
   27 y el 61.
2. **La caja en vez del cilindro**, si alguien quiere cerrar la fidelidad del
   casco (apartado 3).
3. **`MSTRACE_LARGEHITBOXES`**: la traza del segundo intento lo lleva puesto en
   el motor y aquí el rayo va contra el cilindro entero, que es más tosco. No se
   ha medido cuánto cambia.
4. **Una sonda de combate contra un bicho GRANDE que vuelva a pasar por aquí**:
   las tres que hay miden goblins y zombis y siguen siendo útiles, pero ahora
   hay dos caminos de golpe (`esfera` y `linea`) y ninguna de las tres distingue
   por cuál entró el suyo.
