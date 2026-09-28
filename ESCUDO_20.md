# Experimento 20 — El escudo

Escrito el 27 de septiembre de 2026, al cerrar el 19.

El 19 dejó el golpe con consecuencias para el que lo recibe. Pero el que recibe
casi siempre eres tú, y de este lado sólo había el parry: **una regla que para el
0,000 % de los golpes de un personaje nuevo**. Este experimento pone la otra
mitad de defenderse.

> **766 pruebas** (31 nuevas) y **34 de 34 controles** de la sonda del escudo,
> con el resto de la batería intacto: golpe 25, consecuencias 44, IA 15, cuerpo
> 29, mapa 30, sonido 20. `npm run escudos` y `npm run sonda:escudo`.

---

## 1. Un escudo no es un arma con poco daño

Es otro sistema. No comparte ni una línea con el parry, y de hecho **corre
antes** (`CBasePlayer::TraceAttack`, player.cpp:403-414):

```cpp
for( i = 0; i < Gear.size(); i++ ) Gear[i]->OwnerTakeDamage(Damage);  // armadura y ESCUDO
if( Damage.flDamage <= 0 ) Damage.flDamage = 0;
Damage.flDamage = CMSMonster::TraceAttack(Damage);                    // el PARRY del motor
```

Y no hay una línea de C++ del escudo: el motor le pasa el golpe a cada cosa que
llevas encima y deja que el script lo cambie con `setdmg`. La regla entera vive
en `game_takedamage` de `items/shields_base.script:171-279`.

Las dos posturas, que no son «mejor» y «peor»:

| | qué hace | de media te llevas |
| --- | --- | --- |
| **arriba** (botón aguantado) | `BLOCK_CHANCE_UP` de bloquear, y bloquear deja pasar `DMG_BLOCK_UP` | **40 %** (escudo de entrenamiento) |
| **abajo** (sólo en la mano) | `BLOCK_CHANCE_DOWN` de anular el golpe **entero** | **85 %** |

Bloquear con el escudo arriba **no es anular**: es la diferencia entre un escudo
y la invulnerabilidad, y es lo primero que uno escribe mal. Medido con 20 000
golpes: arriba 40,0 % y **cero anulados**; abajo 85,2 %, y lo que bloquea lo
anula todo (2 961 bloqueos, 2 961 anulados).

El único con hueco arriba es el de madera —bloquea el 90 %— y sale al 64 %. El
techo del juego es el urdualiano: **5 %**.

Y la única interacción real entre los dos sistemas es que **el escudo abajo apaga
el parry**: deja el daño en 0 y el parry del motor no para los ceros («do not
parry 0 damage atks»).

## 2. El cono de 175 grados mide 53

Éste es el hallazgo del experimento. El escudo sólo para lo que venga de frente y
el script pide un cono de 175°, o sea todo menos la espalda. Lo que el motor
calcula es otra cosa (`ScriptGetter_Cone`, script.cpp:745):

```cpp
float ConeFOV = cosf( atof(Params[3]) / 2.0f );
```

`cosf` quiere **radianes** y el script escribe **grados**. `cos(87,5 rad)` es
0,894, un umbral de producto escalar altísimo: el cono real es de **±26,6
grados**. Medido girando al atacante alrededor del jugador: **±26°**.

Y no es un error que empequeñezca siempre, porque el coseno es cíclico:

| declarado | real | | declarado | real |
| --- | --- | --- | --- | --- |
| 1° | 57,3° | | 64° | 66,9° |
| 10° | 147,0° | | 90° | 116,6° |
| 30° | 278,9° | | 100° | **30,4°** |
| 45° | 301,7° | | 120° | 324,5° |
| 60° | 162,3° | | 175° | **53,2°** |

**Declarar un número mayor puede dar un cono más pequeño**, y los 64° de un
script cualquiera salen casi bien por casualidad. Lo usan 48 ficheros con ángulos
de 1 a 175, y ninguno mide lo que dice.

Lo que eso significa jugando sólo se ve jugando, y por eso la sonda pone un
goblin de verdad delante: **20 s aguantando el escudo, 38 golpes, 26 bloqueados y
12 por fuera del cono** — un tercio se cuela porque el goblin se mueve mientras
pega y con ±26° basta con que se aparte un paso. Escrito con el cono que el
script cree tener, habrían salido 38 de 38 y nadie se habría enterado.

## 3. Siete números en la ficha de un escudo, y seis no hacen nada

Lo que un escudo declara y lo que un escudo usa no son la misma lista:

| constante | qué pasa |
| --- | --- |
| `BLOCK_CHANCE_UP`, `DMG_BLOCK_UP`, `BLOCK_CHANCE_DOWN` | **deciden todo** |
| `PARRY_MULTI` | lo usa `update_parry`, en otro momento |
| `SHIELD_BASE_PARRY` | 10, 5, 20, 40, 40, 25 en los seis escudos. **No lo lee nadie** |
| `MELEE_ENERGY` | 15 en el de entrenamiento. El ataque declara `energydrain 0`: **levantar un escudo es gratis** |
| `NOPUSH_CHANCE` | del 25 % al 100 %. La línea que lo tiraba está comentada: **con el escudo arriba nunca te empujan** |
| `SHIELD_HEALTH`, `SHIELD_MAXHEALTH`, `SHIELD_IMMORTAL` | los cinco bloques que los gastaban están comentados: **un escudo no se rompe en Rebirth** |
| `MELEE_ACCURACY` | se registra y no se observa; la línea que la usaba para bloquear está comentada |

O sea que el escudo de entrenamiento, que declara el aguante más caro del juego
(15, treinta veces el del de madera), **se levanta gratis y se puede tener
arriba para siempre**. Lo único que cuesta es que no puedes atacar.

Y los tipos de daño: el comentario del script promete que frío, fuego y veneno no
se bloquean, pero **las tres líneas están comentadas**. Sólo sobreviven dos:

```
//if ( PARAM4 startswith cold ) local CANT_BLOCK 1
//if ( PARAM4 startswith fire ) local CANT_BLOCK 1
//if ( PARAM4 startswith poison ) local CANT_BLOCK 1
if ( PARAM4 startswith target ) local CANT_BLOCK 1
if ( PARAM4 contains effect ) local CANT_BLOCK 1
```

Un escudo de madera para una bola de fuego. Medido: fuego, frío, veneno y magia
al 40 %, `target` y `dark_effect` al 100 %.

**Y un tipo VACÍO se bloquea** — justo al revés que en el parry del script, donde
un tipo vacío es imparable (el hallazgo del 19). El mismo hueco, dos reglas,
resultados opuestos. Importa porque en Gate City **sólo la araña escupidora
declara tipo de daño**: el goblin, las ratas y los zombis pegan con el tipo
vacío, así que el escudo se lo bloquea todo y el parry no les podría parar nada.

## 4. Cubrirse cuesta el ataque, y no porque la mano esté ocupada

```cpp
bool CMSMonster::IsShielding() {
  for( i = 0; i < Gear.size(); i++ )
    if( Gear[i]->CurrentAttack && msstring(Gear[i]->m_Name).starts_with("shields_") )
      return true;
  return false;
}
```

Recorre **todo** lo que llevas: un escudo levantado en la izquierda impide atacar
con la espada de la derecha. No es «esa mano está ocupada», es «estás
cubriéndote». Medido: 0 mandobles en 10 s cubriéndose, 9 sin cubrirse.

Y el criterio es **el nombre del script**, no la marca `AM_SHIELD`. Un escudo que
no se llamara `shields_…` bloquearía igual pero te dejaría atacar mientras te
cubres.

## 5. El escudo no caduca

Un escudo es un ataque de verdad —se registra con `registerattack`— de un tipo
que sólo usan él y la ballesta:

```cpp
if (AttackType == "hold-strike") { attData.Type = ATT_STRIKE_HOLD;
                                   attData.tDuration = -1; }
```

Ese `-1` **pisa** el `MELEE_ATK_DURATION 1.0` que el propio script declara, y el
comprobador de fin exige `tDuration >= 0`. Leer la duración del script y creerla
da un escudo que se cae solo al segundo. Medido: treinta segundos de botón
aguantado y sigue arriba.

Y la mano: el objeto de la mano activa usa `IN_ATTACK` y el de la otra
`IN_ATTACK2` (giattack.cpp:118), así que **el escudo es el botón derecho**.

## 6. Tres fallos nuestros, y los tres los destapó el escudo

**El primero: los siete escudos se leían como mazas.** `shields_base` declara
`{ [override] weapon_spawn }`, y `[override]` no es un adorno: **borra de la
lista los eventos que ya se llamaban igual** (script.cpp:5205). Pero la trampa de
verdad es más honda: `base_melee` no registra sus ataques en `weapon_spawn`, sino
en `register_normal`, y `weapon_spawn` lo *llama*. Borrar `weapon_spawn` no borra
`register_normal`: lo deja **huérfano**, y un evento al que nadie llama no se
ejecuta.

O sea que el lector necesitaba dos reglas nuevas —el borrado y la
alcanzabilidad desde `game_spawn`— y sin ellas cada escudo salía con tres ataques
de los que el principal era un `strike-land` fantasma. **22 de los 760 objetos
del catálogo** tenían alguno. Y el borrado no arrasa: los puños conservan su
patada, que llega precisamente por un `[override] register_charge1` de
`base_kick`.

**El segundo: `wearable` estaba leído al revés.** El motor pide dos parámetros:

```cpp
if( Params[0] == "0" )        { m_WearPositions.clear(); Clear(WEARABLE); }
else if( Params.size() >= 2 ) { SetBits(Properties, ITEM_WEARABLE); ... }
```

La palabra sola —y `wearable 1` sola— **no hacen nada**. Aquí se leía la palabra
sola como un sí, y como los objetos vestibles del juego la escriben todos con
sitio (`wearable 1 back`), el campo salía **falso en los 760**. Ahora salen
**105**, repartidos en once ranuras.

**El tercero: el escudo salía en la mano que no era.** No hay un `v_` por mano:
el motor **espeja el modelo de vista** (studiomodelrenderer.cpp:1442 y 2526):

```cpp
if( hand == LEFT_HAND ) SetBits(curstate.oldbuttons, MSRDR_FLIPPED);
...
glLoadIdentity();  glScalef(-1,1,1);  glMultMatrixf(mm);
m_DrawStyle = DRAW_BACKFACES;
```

El espejo va en el espacio de la **vista**, no del modelo, y hay que invertir
también las caras porque cambia el sentido de giro de los triángulos. Sin eso el
escudo y la espada se pisaban en el mismo rincón del cuadro. Medido: el escudo
cae en −19..−4 y el arma en −18..11 de los ejes de la vista.

## 7. Y una corrección del 19: el parry de un personaje nuevo no es 0, es 1

El 19 dijo «el parry de un personaje nuevo es 0 porque el parry ES la competencia
del arma y `CreateChar` da el punto a la potencia». La conclusión aguanta, pero
el número no: `update_parry` lee **el valor de la habilidad a secas**, y ése
tiene suelo (`CStat::Value()`, stats.cpp:169):

```cpp
int iVal = (Total + (iSubStats / 2)) / iSubStats;
// if value is 0 then return 1, we don't want skills to be less than 1.
return (iVal == 0) ? 1 : iVal;
```

Así que es **1**, y con escudo `int(1 × 1,3)` sigue siendo 1. Y 1 para exactamente
el **0,000 %**, porque la tirada del parry es `rand(0,1)` y la del atacante nunca
baja de 1. La cuenta cerrada de todo el rango:

| parry | para |
| --- | --- |
| 1 | 0,000 % |
| 10 | 0,153 % |
| 20 | 0,664 % |
| 40 | 2,896 % |
| 60 (el tope) | **7,053 %** |

O sea que **el parry de un jugador no es una defensa ni estando al tope**, y todo
lo que te separa de morir es el escudo. Eso explica por qué el «make shields
useful patch up» existe y por qué se llama así.

> **Corregido en el 21:** ese «60 (el tope)» es el tope de la FÓRMULA
> (`update_parry` recorta ahí), y la tabla sigue siendo buena. Pero el tope que
> corta el aprendizaje es otro y es más bajo: `#define CHAR_LEVEL_CAP 45`
> (cbase.h:142), que es lo que mira `LearnSkill` antes de dar nada. O sea que el
> 7,05 % **no se alcanza matando bichos**: por esa vía no se pasa de 45. Ver
> [MUNDO_21.md](MUNDO_21.md) §5, donde además resultó que la curva de
> experiencia que teníamos era la nuestra y no la del juego.

## 8. Lo que no está

- **El campo de visión del modelo de vista.** GoldSrc dibuja el modelo de vista
  en una pasada aparte con su propio FOV (`cl_viewmodelfov`); aquí va con el de
  la cámara, y con un escudo se nota mucho más que con una espada: ocupa medio
  cuadro. Es la misma limitación que `arma.js` declara desde el 18, ahora
  visible.
- **La postura del muñeco** (`playowneranim hold aim_axe_onehand squatwalk1`):
  necesita un cuerpo en tercera persona, que no hay.
- **El bloqueo de los MONSTRUOS.** `IsShielding` es de `CMSMonster`, no de
  `CBasePlayer`, así que un monstruo con un escudo se cubriría igual — pero
  ninguno de los 25 de Gate City lleva uno.
- **El escudo de fuego** se hornea y se embraza, pero su aliento
  (`shield_pre_block_effect`, `breath_loop`) no está: pide efectos de cliente.
- **Comprar uno.** Un escudo se compra, y no hay tiendas: la tecla `B` es un
  andamio declarado, como la `K` de morirse.

## 9. Qué se toca

| archivo | qué |
| --- | --- |
| `src/bsp/script.js` | `cabeceraDe` con `[override]`; borrado y alcanzabilidad de los ataques; `wearable` de verdad; `setvar`/`sethand`; el bloque `escudo` |
| `src/play/escudo.js` | **nuevo**: el cono con su fallo, el bloqueo, `defensaDelJugador`, `puedeAtacar` y `Brazal` |
| `src/render/arma.js` | `espejar()`, que es `MSRDR_FLIPPED` |
| `src/juego/teclas.js` | `cubrir`, que es `atacar2` |
| `src/main.js` | `embrazar`, `pasoDelEscudo`, `cubriendose`, `parryDelPersonaje`, la defensa en `golpear`, la tecla `B` y `probe.escudo` |
| `tools/escudos.mjs` | **nuevo**: `npm run escudos`, 30 controles |
| `test/juego_escudo.test.mjs` | **nuevo**: 31 pruebas |
| `build/sondas/escudo.mjs` | **nuevo**: `npm run sonda:escudo`, 34 controles |

`public/` sin tocar. Todo lo extraído vive en `build/`, que está en
`.gitignore`, y está declarado en `build/gatecity/PROCEDENCIA.md`.

## 10. Lo siguiente

El escudo cierra defenderse. Lo que queda del combate:

- **Los proyectiles** (`charge-throw-projectile`): el arco y la lanza, que son el
  otro tipo de ataque del motor y el único que falta. El arco de partida está
  horneado desde el 18 y no dispara.
- **La patada** de `base_kick`, que es el `[override]` que este experimento
  descubrió y que todo el mundo lleva con los puños.
- **El arma en la mano del muñeco**: `p_weapons1_b24` está horneado y nadie lo
  lleva. Ahora hay dos modelos de mundo más —el escudo en la izquierda y a la
  espalda— esperando lo mismo.
- **Las cuatro ratas hundidas**, del 19: un desacuerdo entre el horno y Rapier.
- Y lo de siempre: los sonidos del jugador, los cinco `trigger_once`, `git init`,
  las URL reales en `CREDITOS.md`, el menú principal, los contenedores.
