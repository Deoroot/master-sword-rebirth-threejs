# Experimento 24 — El HUD de Master Sword

> «ahora debemos replicar el GUI de master sword… el de rebirth es diferente en
> cuanto a lo que representa la vida/mana, etc. lo que tenemos ahora no esta mal
> pero era de desarrollo… por ahora me quiero concentrar en el event hud y la
> parte de vida/mana stamina/weight que faltan.»

Hecho: **las cuatro barras con su emblema y la consola de sucesos**, portadas de
`vgui_health.h` y `vgui_eventconsole.h` con los sprites del juego. 897 pruebas en
Node y 36 de 36 controles en el navegador.

Y sí: se puede. La respuesta corta a «¿se puede cambiar al original guardando lo
que se hizo?» es que **no hay nada que tirar**. El inventario y la hoja de
personaje son *paneles* —lo que Master Sword llama `CharPanel`— y el HUD es otra
cosa: se dibuja encima del mundo, no lo tapa, y el motor los tiene en archivos
distintos. Aquí ha pasado lo mismo: el HUD nuevo vive en dos ficheros que no
tocan `interfaz.js`. Cuando toque hacer el inventario del juego, será el mismo
trabajo otra vez y tampoco habrá que borrar nada.

---

## 1. Antes de nada: la imagen que mandaste es la del HUD que MSR trae apagado

La captura con los dos frascos redondos y las barritas de «Stamina» y «Weight»
es el HUD **retro**. Sigue en el código y sigue en los assets, pero el juego
arranca con el otro:

```cpp
if (CVAR_GET_FLOAT("cl_retrohud") > 0) { m_RetroHealth… } else { m_Health… }
                                                        vgui_hud.cpp:162-169
CVAR_CREATE("cl_retrohud", "0", FCVAR_ARCHIVE);              hudmisc.cpp:58
```

Lo que ve hoy quien instala MSR es `PrimaryHUD::VGUI_Health`: **cuatro barras**
de 320×40 y un emblema en medio. Eso es lo que está portado, que es lo que
pediste («replicamos lo que está en msr ahora»). El retro está leído entero y no
hecho — sus dos `.spr` de frascos siguen en su sitio y son 53 cuadros de 64×104.

Y ahí está la diferencia de la que hablabas. En el retro, vida y maná son los dos
frascos grandes y aguante y peso dos barritas finas debajo: una jerarquía. En el
primario **las cuatro son iguales**, y el reparto sorprende:

```
   vida  ▏▔▔▔▔▔▔▔▔▔▔▔▏ ▄▄▄ ▕▔▔▔▔▔▔▔▔▔▔▔▏  maná
   peso  ▏▁▁▁▁▁▁▁▁▁▁▁▏ emb ▕▁▁▁▁▁▁▁▁▁▁▁▏  aguante
```

**Vida y peso** comparten columna, no vida y maná. Está en el orden en que se
construyen (`m_Bar[0]` y `m_Bar[2]` con la misma `x`, `vgui_health.h:165-174`) y
es lo primero que se copia mal.

---

## 2. Las barras no son barras: son 43 dibujos

Esto es lo que decidió cómo se hizo todo lo demás.

```cpp
float frame = (m_CurrentAmt / MaxAmt) * LastFrame;
m_Image.SetFrame(frame);                              vgui_health.h:102-109
```

`healthbar.spr` tiene **43 cuadros de 320×40**, y el relleno está pintado a mano
en cada uno: el vidrio, el reflejo, el marco de cuero, el icono. No es un
rectángulo de color con un `width` en porcentaje — dibujado así funcionaría y no
se parecería a nada.

Los cuatro archivos pesan **exactamente lo mismo**, 552 070 bytes: misma
geometría, cuatro paletas. Uno de los controles del horneado comprueba que los
cuatro colores llenos son cuatro colores distintos, porque copiando cuatro veces
el mismo `.spr` salen cuatro barras rojas y el tamaño no lo delata.

Y el primer oráculo que escribí estaba mal. Conté píxeles opacos, dando por hecho
que el vaso se llena apareciendo: **9 864 en los 43 cuadros**, clavado. El dibujo
no crece, cambia de color. El oráculo bueno es el brillo medio del canal de cada
barra — 23,6 en el cuadro 0 y 84,5 en el 42 para la vida.

El emblema es aparte: `gfx/vgui/hud_main.tga`, 128×128, y **no tiene
transparencia** aunque tenga canal alfa — los 16 384 píxeles están a 255. Es un
escudo heráldico sobre una placa de piedra cuadrada, y por eso la disposición lo
mete justo en la juntura de las cuatro barras: no recorta, tapa.

---

## 3. La rareza gorda: el HUD del juego desaparece a 640×480

```cpp
//Scales flasks down to only 40% wide of the screen if sprites are too big
#define BAR_SCALE (1.0f - ((730 - (ScreenWidth * 0.40f)) / ScreenHeight))
                                                          vgui_health.h:9
```

No es «escala = alto/480», que es lo que hace `XRES`/`YRES` y todo lo demás del
HUD. Es una resta contra 730 dividida por el **alto**, con el **ancho** metido en
el numerador. Lo que sale, medido:

| pantalla | escala | barra |
|---|---|---|
| 640×480 | 0,013 | **4×0 px** |
| 1024×768 | 0,583 | 187×23 |
| 1200×800 | 0,688 | 220×28 |
| 1920×1080 | 1,035 | 331×41 |

A la resolución nativa de la pantalla de referencia de VGUI, su propio HUD mide
cuatro píxeles. Y en ninguna resolución la escala vale 1, o sea que el dibujo de
320×40 nunca se ve a tamaño real. Va portado tal cual, con un interruptor al lado
(`AJUSTES.escalaDelMotor`) y una escala nuestra detrás, que es la misma regla que
el resto del HUD —alto/480— con tope arriba.

**Mi recomendación: esta sí la dejaría encendida por ahora.** En una ventana de
navegador normal (de 720p para arriba) el número del motor sale bien, y el caso
que rompe es una ventana muy baja, que no es donde se va a jugar. Es un booleano
y está medido: encenderlo cuando moleste cuesta nada.

---

## 4. Tres detalles del motor que se notan y son fáciles de perder

**El vaso persigue, no salta.** Las barras se mueven a tantos puntos por segundo,
y la cuenta son cinco líneas de las que **una está muerta**:

```cpp
int AccelFlasks = 10;                        // se sobreescribe sin usarse
AccelFlasks = 15 * (MaxAmt / 100);
if (AccelFlasks < 40) AccelFlasks = 40;      // el suelo manda casi siempre
if (AccelFlasks > MaxAmt) AccelFlasks = MaxAmt - 1;   // y entonces el techo lo baja
if (fabs(m_CurrentAmt - Amt) > 200) AccelFlasks = 1000;
                                                        vgui_health.h:79-87
```

`15 * (max/100)` no llega a 40 hasta que el máximo pasa de 267, o sea nunca para
un personaje normal. Y entonces el techo lo corta: con 25 de vida la barra se
mueve a **24 puntos por segundo**, o sea que el vaso de un novato tarda un
segundo justo en llenarse. La sonda mide que a la décima de segundo de recibir el
golpe la barra *todavía va por el camino* (42 → 38 → 8), porque si llegara de
golpe sería que se está pintando el valor y no el que persigue.

**El cuadro nunca es el 0 si te queda algo.** `if (frame > 0 && frame < 1) frame
= 1`. Con 500 de vida máxima, un punto daría 0,08 de cuadro y el vaso se vería
vacío estando vivo. Con el suelo, vacío significa muerto y nada más.

**El peso no se pone rojo.** La cifra va blanca y pasa a rojo por debajo de un
cuarto… menos en la barra de peso (`if (m_Type != 2)`), y tiene razón: en las
otras tres poco es malo y en el peso poco es bueno.

---

## 5. La consola de sucesos, que es lo que de verdad faltaba

Lo que había era **una línea negra abajo** que hacía tres trabajos a la vez:
decir por dónde iba la carga, contar lo que pasaba en el juego y dar los avisos.
Una línea, un mensaje: el segundo pisa al primero y no queda rastro. El aviso de
que un goblin ha llamado a tres amigos duraba lo que tardabas en pegar otra vez.

La del juego es otra cosa. Es un **anillo** de `min(ms_evthud_history, 128)`
líneas con tres índices encima, y se comporta así:

- **crece por abajo**, y el borde de abajo no se mueve nunca: el panel se
  recoloca hacia arriba (`setPos(x, m_StartY - LINE_SIZE * m_VisibleLines)`).
- **se encoge de una en una**: cada `ms_evthud_decaytime` (5 s) cae **una** línea,
  no todas. Cinco tardan veinticinco segundos en irse — medido, 25,0 s.
- **salvo las partidas**: si al encoger la línea de arriba es la continuación de
  una que se partió, el reloj no se rearma y se va en el mismo tic. Una frase
  larga desaparece entera, no a mitades. Es el detalle que evita ver medias
  frases colgando, y está en un `if` de una línea
  (`if (!topLine->m_SpansFromPrevLine) m_ShrinkTime = 0;`).
- **decaer no es borrar**: el historial sigue ahí y **RePág** lo trae de vuelta.
  Eso es lo que nunca podía hacer la línea de estado.
- y **no te mueve la vista bajo los pies**: si estás leyendo el historial, un
  suceso nuevo no te salta al fondo (`if (m_ActiveLine >= (iNewLine - 1))`).

Los colores son seis y sólo seis, y el del ataque no es el que parece:

```cpp
COLOR(220, 220, 220, 0),            //HUDEVENT_NORMAL     lo corriente
COLOR(160, 160, 160, 0),            //HUDEVENT_UNABLE     no puedes hacer eso
COLOR(255 * 0.7, 170 * 0.7, 0, 0),  //HUDEVENT_ATTACK     tu ataque    → (178,119,0)
COLOR(240, 0, 0, 0),                //HUDEVENT_ATTACKED   te pegan
COLOR(0, 240, 0, 0),                //HUDEVENT_GREEN      algo bueno
COLOR(0, 0, 240, 0),                //HUDEVENT_BLUE       «algo azul»
                                                    playershared.cpp:1183-1191
```

Está escrito `255 * 0.7`, o sea un ámbar apagado, no el naranja de (255,170,0).
Quien lo saque de una captura se lo pone más vivo de lo que es. La sonda lo lee
del DOM con `getComputedStyle`.

Y ahora que hay dónde ponerlo, **se dice una cosa que no se decía en ningún
sitio: que te están pegando**. Es el `HUDEVENT_ATTACKED` del motor, y era el
único aviso que le faltaba al jugador de que la vida que baja tiene un culpable.

---

## 6. Y una que aparece de rebote: la barra de carga no sale nunca con un arco

Buscando la barra de carga del panel —las dos barritas que marcan el tensado—
sale esto:

```cpp
bool CGenericItem::Attack_IsCharging()
{
    //don't try charging if there's no charges.
    if (GetHighestAttackCharge() == 0)
        return false;
    if (CurrentAttack && (CurrentAttack->Type == ATT_CHARGE_THROW_PROJ && …))
        return true;                                 giattack.cpp:1107-1120
```

La guarda va **antes** de la rama del tiro, y `GetHighestAttackCharge()` recorre
`Attack.flChargeAmt`, que es el `reg.attack.charge` de los ataques cargados de
cuerpo a cuerpo. **Un arco no declara ninguno.** O sea que la única indicación
visual de cuánto llevas tensado el arco está apagada por una guarda escrita para
otra cosa — y la rama que sí sabe medirlo existe y está bien hecha:
`Attack_Charge()` mide de `tStart + tProjMinHold` a `tMaxHold`, que es
exactamente el 15 % de fuerza del experimento 23 visto desde el otro lado.

Portado con la guarda puesta y con interruptor (`AJUSTES.cargaSoloConCarga`).
Esta es la segunda que encuentro apagada alrededor del arco.

Y de propina, una errata de precedencia de C en la colocación de esas dos barras:

```cpp
float OffsetW = CHARGE_SPACER_W + (i == 0) ? CHARGE_W : 0;   vgui_health.h:185
```

`+` liga más que `?:`, así que eso se lee `(CHARGE_SPACER_W + (i==0)) ? CHARGE_W
: 0`, el paréntesis nunca es cero y **el espaciador no llega a sumarse nunca**.
Las dos barras salen a ±30 px del ancla con un hueco de 30 en medio, en vez de
pegadas con dos. Y el ancla es `XRES(304)`, no 320, así que tampoco están
centradas — el HUD retro sí usa 320.

---

## 7. Qué hay en el árbol

| | |
|---|---|
| `tools/hud.mjs` | hornea las cinco imágenes. `npm run hud`, 15 controles |
| `src/play/hud.js` | la regla: escala, disposición, cuadro, persecución, colores, la consola |
| `src/juego/hudms.js` | el dibujo. Lo único que toca el DOM |
| `test/juego_hud.test.mjs` | 43 pruebas en Node |
| `build/sondas/hud.mjs` | 36 controles en un navegador de verdad. `npm run sonda:hud` |

Todo lo extraído vive en `build/gatecity/hud/`, que está en `.gitignore`, y está
declarado en `build/gatecity/PROCEDENCIA.md`. **No se ha movido un byte a
`public/`** — comprobado.

La línea de estado del 03 no se ha borrado: se vacía al entrar y `say()` la
esconde sola mientras esté vacía, así que las teclas de trabajo (T, L, la rueda
de escudos) la siguen usando y la vuelven a enseñar cuando dicen algo.

---

## 8. Lo que NO está

Leído entero y declarado:

- **el HUD retro** (`cl_retrohud 1`): los dos frascos de tu captura. Necesita
  además el `CStatusBar` dibujado, que es otro trozo de VGUI.
- **el panel de identificación** («Giant Rat / Hostile»), que es `vgui_id.h`.
  Es el siguiente en importancia: sin él no sabes a qué le estás apuntando.
- **la consola de chat** (`ms_txthud_*`), que es la misma clase con otros cvars
  y ancho dinámico. Cuando haya con quién hablar.
- **los iconos de estado** de `sprites/hud/status/` — 19 sprites: veneno, hielo,
  fuego, aturdido, escudos, inmunidades.
- **las ventanas de ayuda** (`ms_help`), que son las que dicen «You are looking
  at Giant Rat. It's hostile! Kill it!» en tu captura.
- **las ranuras rápidas** (`vgui_quickslot.h`).

Y una cosa que arreglé de paso porque estaba al lado: `probe.escudo.aguantarGolpes`
llamaba a `vitalesDelPersonaje().vidaMax`, que **no existe** en esa función — le
metía `undefined` en la vida al personaje en cada paso y no se veía porque el
recorte de la sesión lo arreglaba al tic siguiente.

---

## 9. Lo siguiente

Sigue pendiente lo que se quedó apuntado en el 23, y ya son cuatro experimentos:
**un censo de lo que el personaje puede llevar en la mano y una comprobación de
que cada cosa hace algo al pulsar el botón. Siete armas, siete controles.** Con
eso, el arco de árbol habría salido rojo en el 18 en vez de en el 23.
