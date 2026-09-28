# Experimento 26 — Las ranuras que vuelven, la barra de carga y el golpe contra el suelo

> «Listo, que nos falta? Creo que hay ciertas acciones como correr o correr
> saltando que le falta sonido, hay una barra pequeña que aparece en al costado
> de lildude cuando haces un ataque cargado y otras cosas también.»

Tres huecos, y los tres estaban donde decías. Con la deuda que el 25 dejó
escrita —grabas doce ranuras y al volver no hay ninguna— salen los cuatro
trabajos de este experimento.

**972 pruebas** (eran 942) y **38 de 38 controles** en la sonda nueva. La
batería entera sigue en verde y `public/` sin tocar.

```
npm run sonido               extrae, y ahora TAMBIÉN genera los pasos que faltan
npm run sonda:pulido         38 controles en el navegador
npm test                     972
```

---

## 1. Las ranuras se guardan, que era la deuda

El formato estaba leído desde el 25 y es media docena de líneas
(`sv_character.cpp:696-708`): un byte con el tipo **desplazado en uno** —el cero
es «vacía» y `QS_ITEM` vale cero— y un entero con el identificador. Se escriben
**las 36 siempre**, vacías incluidas, y eso es lo que permitió a MSR subir de 12
a 36 sin mutilar a nadie: el que lee no decide cuántas hay, se lo dice el byte
anterior. Nuestro documento hace lo mismo y **no recorta** uno que traiga más.

Lo que importa está al volver (`player.cpp:6514-6531`):

```cpp
if (QuickSlot.Active && (QuickSlot.Type == QS_ITEM)) {
  bool bFound = false;
  for (i...) if (Items[i]->m_OldID == QuickSlot.ID) { ...; bFound = true; break; }
  QuickSlot.Active = bFound;      // y si no está, se apaga y calla
}
```

Tres cosas portadas de ahí:

- **Una ranura con un objeto que ya no llevas se apaga sin avisar.** Vendes la
  espada y la F3 deja de existir; no hay mensaje. (Nosotros sí decimos cuántas
  se han caído, por la consola, que es una nota nuestra y está marcada como tal.)
- **La que apunta al arma que llevas PUESTA sobrevive.** Parece obvio y es el
  fallo fácil: si sólo miras la mochila, la ranura del arma en la mano se apaga
  cada vez que entras.
- **Los hechizos y la munición no se comprueban contra nada**, porque el `if` es
  sólo para `QS_ITEM`. Y en el hechizo eso tiene consecuencia: `AssignQuickSlot`
  guarda como identificador **el índice dentro de `m_SpellList`**
  (`player.cpp:6748`, `QuickSlot.ID = i`), no el nombre. Aprende un hechizo que
  se cuele antes en la lista y **la ranura apunta a otro**, y el juego lo lanza
  sin inmutarse.

---

## 2. La barra de carga: estaba dibujada y apagada

Aquí acertaste a medias y es la parte interesante. La barra **existía desde el
24** —con su geometría y hasta con la errata de precedencia del motor— y no
salía nunca con una espada. Dos razones, las dos encontradas por la sonda:

1. **`cargaVisible` sólo miraba el tensado del arco**, que es nuestro andamio.
   El caso real —aguantar el botón con una espada— no estaba conectado.
2. **`cargaMaxima` se leía del ataque EN CURSO.** `GetHighestAttackCharge()`
   recorre *todos* los ataques del arma (`giattack.cpp:617-625`), y entre un
   mandoble y el siguiente no hay ataque en curso — que es justo cuando se
   carga. O sea que la guarda se apagaba exactamente en el único momento en que
   hacía falta. Sonaba el nivel y no se pintaba nada.

Y lo que faltaba de verdad era lo de dentro, que son cuatro rarezas:

- **Los niveles caen en segundos enteros**, y por casualidad buena: el mismo
  `GET_CHARGE_FROM_TIME(a) = a + max(a−1,0)·0,5` se aplica a los segundos
  aguantados *y* al número de nivel, así que el nivel 2 está en 2,5 de carga,
  que son 2 s justos.
- **El primer nivel se pinta NEGRO**, porque el color se elige *antes* de
  sumarle los 100. La barra no se llena: se vacía de gris.
- **Al desbordar, el canal vuelve atrás**: `if (vChargeR > 255) vChargeR -= 255`
  resta en vez de saturar, así que el rojo va 0, 100, 200, **45**, 145, 245,
  **90**… y la barra se oscurece justo al subir de nivel.
- **El número va uno por debajo del nivel**, y en el primero pone un espacio.
  Cuando la barra marca «1» vas por el segundo nivel.

Y suena: `ms_chargebar_sound` = `magic/chargebar_alt1.wav` a
`ms_chargebar_volume` **15**, quince sobre una API que toma de 0 a 1. Suena una
vez por subida —medido: 2 sonidos en 145 fotogramas de barra—, no por fotograma.

**Una corrección mía, que la medida me impuso.** Escribí que `mCurChargeLevel`
no se reinicia al soltar y que por eso «la segunda carga de una pelea no suena».
Lo porté así, con su prueba, y **es falso**: la asignación es incondicional, la
segunda carga empieza en cero, y en su primer fotograma el campo vuelve al 1. Lo
que guarda es el nivel del fotograma anterior, no un máximo histórico. La sonda
midió 2 sonidos en la segunda carga igual que en la primera y me obligó a
volver al C++. Queda la prueba que fija lo que sí pasa.

---

## 3. Correr era mudo, y la causa no era nuestra

Los pasos estaban portados desde el 16. El catálogo horneado lo decía a gritos y
nadie lo había leído así:

```
porMaterial   piedra 37913 m²   tierra 3389   hierba 192
pasos         piedra: []        tierra: []
```

**El mod no trae los wav de piedra ni de tierra.** `sound/player/` de MSR sólo
tiene `pl_duct`, `pl_ladder`, `pl_snow`, `pl_loksnow` y `pl_tile`: `pl_step1-4`
y `pl_dirt1-4` **son de Valve**, y Rebirth es standalone (`basedir "msr"`). El
92 % de lo que se pisa en Gate City es piedra, así que correr es mudo **también
en el juego original**.

Copiarlos de una instalación de Half-Life sería meter contenido de Valve. Así
que el mismo trato que `glow01.spr` y el cielo `nature1`: **se generan**. Ruido
con envolvente, dos recetas —la piedra es un chasquido con cuerpo, la tierra es
sorda y más larga—, en **11 025 Hz y 8 bits**, que es el formato de los `pl_*`
que sí están, y con semilla fija para que dos ejecuciones den el mismo byte.

Van marcados `generado: true` en el catálogo, la sonda comprueba que se sabe
cuáles son nuestros, `faltan` no se toca, y si algún día los de verdad
estuvieran, mandan ellos. El informe de la herramienta ya no dice «suena el
100 %» a secas:

```
van a sonar     100.0 % de los triángulos pisables (piedra, tierra, hierba)
                del juego el 0.5 % (hierba), generado por nosotros el 99.5 %
```

### Y del salto: el motor no tiene sonido de saltar

Lo que suena es **aterrizar**, y tiene tres umbrales (`PM_CheckFalling` y
`player.h:140-143`), medidos en pantalla dejándose caer desde 1, 3 y 14 metros:

| caída | medido | qué hace |
| --- | --- | --- |
| 1 m | 240 u/s | **nada**: por debajo de 350 no suena |
| 3 m | 427 u/s | un paso al 0,85 |
| 14 m | 747 u/s | un paso a tope, `fallpain3` y un dado de cinco caras |

Tres cosas que sólo se ven transcribiéndolo: **la rama del agua está vacía** —no
cambia nada, sirve para saltarse las otras dos—; **`fvol = 0` es código muerto**
—pide menos de 200 y para entrar hay que caer a 350, así que un aterrizaje
siempre suena una vez pasado el umbral—; y del dado con daño, **tres de las
cinco caras son `common/bodydrop*`, que son de Valve y el mod no tiene**. Tres
de cada cinco caídas que duelen son mudas en el juego original. Ésas no se
generan: se declaran.

---

## 4. Y el fallo que encontró la sonda, que es el más caro de los cuatro

Midiendo la velocidad en las dos unidades a la vez, que era una pregunta que
nadie había hecho:

```
andando     máxima 159 · vel 158.5 · como la lee el bucle 6241
corriendo   máxima 317 · vel 317.1 · como la lee el bucle 12483
```

**El bucle multiplicaba por 39,37 una velocidad que ya venía en unidades del
motor.** `player.vel` va en unidades por segundo —el modelo de Master Sword sólo
convierte a metros para empujar contra Rapier— y a la regla de los pasos le
llegaban 6 241 andando.

Consecuencia: **el corte de los 220 u/s no filtraba nunca**, así que andar
sonaba como correr, al volumen de correr (0,5 en vez de 0,2) y cada 300 ms en
vez de cada 400. Toda la regla del 16 estaba bien escrita y recibía basura.

Y esto es lo mismo que el mapa de luz del 06 con otra ropa: **un dato bien
calculado que se lee con la unidad equivocada no da error**. La regla comparaba
contra números del motor (220, 350, 580) y cualquiera de ellos «funcionaba». Lo
único que lo caza es medir las dos unidades juntas y decir cuál usa el bucle, y
por eso la velocidad que leen los pasos es ahora una función con nombre y no una
expresión dentro del bucle: para que la sonda pueda preguntar exactamente lo que
el juego usa.

**De regalo, una sonda que mentía.** `sonda:golpe` salía en rojo una de cada tres
veces con «107 mandobles y el bicho no muere». No era el daño: **el goblin se iba
andando** y pegábamos al aire. Ahora se vuelve a acercar entre tramos y el
número sale estable — **45 mandobles**, que es la curva de progresión de Master
Sword y la razón de que en el mapa haya ratas de 4 de vida.

---

## 5. Lo que NO está hecho

- **El jadeo al correr no existe**, y no es un hueco nuestro: `fatigue.cpp`
  tiene `//Breathe();` y la función entera comentada, con sus cinco
  `breathe_*.wav` presentes en el mod sin que nadie los toque. Ponerlo sería
  añadir algo que MSR quitó.
- **Los `bodydrop` de la caída con daño** no se generan: tres de cinco caídas
  mudas, como el juego.
- **El `#QUICKSLOT_CREATE` del motor** es un mensaje de pantalla con su color y
  su desvanecido (`clplayer.cpp:1467-1490`, «Assigned Quickslot #%i» en
  `titles.txt`). Aquí sale por la consola de sucesos, que es otro canal.
- **El índice de `m_SpellList`** que hace que una ranura de hechizo apunte a
  otro: portado a medias —la ranura no se comprueba— porque sin lista de
  hechizos aprendidos no hay orden que desordenar. Cuando haya libros, habrá
  que decidir si se porta el fallo entero.

## 6. Lo siguiente

Lo que quedó de la conversación: el panel de identificación del objetivo
(«Giant Rat / Hostile»), la consola de charla, y **la red** —el paso 4 de
[PROYECTO_10.md](../PROYECTO_10.md), que ya está decidido y no hace falta volver a
decidir: un proceso de Node por partida, autoridad en el servidor, sin P2P.
