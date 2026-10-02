# Experimento 82 — el parpadeo entre animaciones

El usuario, comparando con el original: «hay un extraño parpadeo entre
animaciones NPC, dura menos de 1 segundo pero parece que **se resetean a su
posición por defecto** antes de seguir a la siguiente; no pasa en el original y
**me parece que no se puede arreglar aquí**. No es algo grave pero se podría
anotar».

Se podía arreglar, y la descripción era literal: **se dibujaba un fotograma con
el muñeco en su pose de enlace.**

---

## 1. El mecanismo

`aplicarAnimacion` (`src/render/bichos.js`) cambia de animación así:

```js
i.mezclador.stopAllAction();
const a = i.mezclador.clipAction(e.clip);
a.reset().play();
```

y un `AnimationMixer` de Three que se queda **sin ninguna acción** devuelve el
esqueleto a su pose de enlace. Medido sobre el herrero de Edana: la firma de sus
doce primeros huesos pasa de 13,5130 a 13,9820 al parar las acciones —un salto
de **0,469**, cuando el movimiento normal entre dos fotogramas es 0,021.

Y lo que lo pone en pantalla es **el orden del bucle**:

```js
animar(dt) {
  manada.relojes(dt);
  for (...) i.mezclador?.update(dt);   // 1. evalúa la animación VIEJA
  refrescar();                          // 2. y aquí dentro se cambia
}
```

`refrescar()` llama a `aplicarAnimacion`, que para todo y arranca la acción
nueva — pero **nadie vuelve a evaluar el mezclador antes de dibujar**. Así que
el fotograma del cambio se dibuja con la pose de enlace. El siguiente ya va
bien, y por eso dura un parpadeo y es difícil de pillar.

## 2. El arreglo, y por qué es fiel

Una línea: `i.mezclador.update(0)` después de arrancar la acción nueva. Evalúa
la animación nueva antes de volver, sin avanzar su reloj.

Y es lo que hace el motor: `SetAnimation` pone `pev->frame = 0`, así que lo que
se ve es **el fotograma 0 de la secuencia nueva**, no el modelo sin animar.
GoldSrc tampoco mezcla entre secuencias: el salto seco entre dos poses sí es
fiel. El salto a la pose de enlace no lo era.

---

## 3. Cómo se mide un artefacto de un fotograma

Esto es la parte que costó, y es la que vale guardar.

**Muestrear no sirve.** El primer intento grabó la pose cada
`requestAnimationFrame` durante 14 segundos y dio **99 muestras**: siete por
segundo, no sesenta. A 140 ms por muestra, un artefacto de 16 ms es invisible —
y se notó en que los saltos más grandes de la traza caían **igual de a menudo
fuera de los cambios de animación que dentro**, porque a esa cadencia lo que se
mide es el movimiento normal de la animación. *Un instrumento que no puede ver
la presencia no puede medir la ausencia* (el 69).

**Lo que sí sirve es no depender del fotograma.** Se pide el cambio de animación
por donde lo pide el juego —`i.pon(...)`, que es lo que llama un guion— y se lee
la pose **justo después**, que es exactamente lo que el renderizador va a
dibujar ese fotograma. Eso es síncrono y no depende de la máquina.

## 4. La trampa del control, medida y declarada

**Con `idle1` este control no puede fallar.** El fotograma 0 de `idle1` ES la
pose de enlace del modelo: medido, la distancia entre las dos es
**0,000000000**. Así que «se ve el muñeco sin animar» y «se ve idle1» dan el
mismo número y el control pasaría con el fallo puesto.

Es el 50 dentro de un fotograma —con un solo caso, el valor correcto y el valor
de reposo son el mismo— y la defensa es la de siempre: **un segundo caso**. Se
mide con `idle7`, cuyo fotograma 0 está a 0,413 de la pose de enlace. Y hay un
control que deja escrito que `idle1` no vale, para que nadie lo «simplifique»
mañana.

## 5. Lo que se midió

`npm run sonda:parpadeo82`, **6 de 6 controles**. Dos de ellos no miden el
arreglo y están ahí a propósito:

- **el control positivo del instrumento** —la pose de enlace y la animada se
  distinguen, 0,469 de separación—, sin el cual «no es la de enlace» podría ser
  simplemente que mi firma no distingue ninguna pose de ninguna;
- **el que declara que `idle1` no puede medir esto**.

Rotura deliberada: quitando el `update(0)`, el control da **exactamente 0,0000**
de distancia a la pose de enlace y la sonda baja a 4 de 6.

**No hay prueba de Node, y es a propósito:** lo que falla no es una regla, es
Three.js y el orden del bucle de dibujo. No hay nada que pueda comprobar un
`node --test` — ni mezclador, ni esqueleto, ni fotograma. Escribir un mezclador
de mentira para poder probarlo en Node mediría mi mentira.

---

## 6. Lo que entendí mal por el camino

| creí | era |
| --- | --- |
| que el herrero estaba en **pose de andar**, porque su animación no se resuelve y el visor cae a `[...clips.values()][0]`, que en su modelo es `walk` | **falso, y lo retiré.** Lo medí en el navegador y toca `idle7` correctamente. La teoría era redonda —44 nombres de animación de Edana son la cadena literal `ANIM_IDLE` sin resolver, en 12 de los 48 NPC— y aun así no era la causa de esto. *Una teoría sobre un valor de reposo es tan hipótesis como cualquier otra* |
| que podría cazar el parpadeo muestreando la pose | que mi muestreo iba a **7 Hz** y el artefacto dura un fotograma. Ver §3 |
| que `idle1` servía para medir el cambio | que su fotograma 0 **es** la pose de enlace, así que el control habría sido verde con el fallo puesto. Ver §4 |

## 7. Lo que queda

- **Los 44 `ANIM_IDLE` sin resolver**, en 12 de los 48 NPC de Edana (los doce
  vendedores), con el patrón «una variable cuyo valor es el nombre de otra»
  apareciendo **238 veces** en los 2 884 guiones. No afecta al reposo —ése se
  resuelve por actividad— pero sí sería su animación de andar el día que anden.
  No es un hueco callado: `npm run mapa:bichos` ya lo avisa («OJO … no tiene
  'ANIM_IDLE'»).
- **Sólo se ha medido en un NPC.** El mecanismo es del renderizador y no del
  bicho, así que vale para los 69; pero el control entra por un herrero, y la
  regla del 50 dice que un caso único no demuestra nada que dependa del caso.
  Aquí lo que depende del bicho es sólo **qué animación sirve para medirlo**.
