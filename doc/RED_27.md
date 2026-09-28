# Experimento 27 — La red: el paso 4, y el personaje se muda al servidor

> «Listo, continuemos con el paso 4»

El paso 4 de [PROYECTO_10.md](../PROYECTO_10.md) decía tres cosas: **Node, sockets,
y el personaje pasa a vivir allí**. Las tres están hechas, y una cuarta que no
estaba escrita y resultó ser la que decide: **el servidor corre la misma física
que el navegador**, no una parecida.

**1 021 pruebas** (eran 972) y **21 de 21 controles** en la sonda nueva, que
abre **dos Chrome de verdad** contra un servidor de verdad. La batería entera
sigue en verde y `public/` sin tocar.

```
npm run servidor             una partida en el 5210, con Gate City cargado
npm run sonda:red            21 controles con dos navegadores
npm test                     1 021
npm run dev                  y a jugar:  ?map=gatecity&red=1
```

---

## 1. Lo que se ha construido, y en qué orden se lee

Siete archivos nuevos en `src/red/`, y ninguno importa Three.js ni toca el DOM —
la mitad corre en el navegador, la otra mitad en Node, y tres corren en los dos:

| | |
| --- | --- |
| [marco.js](../src/red/marco.js) | el marco de un WebSocket. RFC 6455 §5, escrito aquí |
| [socket.js](../src/red/socket.js) | el apretón de manos, el servidor y un cliente para Node |
| [protocolo.js](../src/red/protocolo.js) | **las cifras de la red, leídas del motor** |
| [partida.js](../src/red/partida.js) | la autoridad: el mundo, los clientes y las fotos |
| [cliente.js](../src/red/cliente.js) | predecir, reconciliar, interpolar, y `AlmacenRemoto` |
| [andar.js](../src/red/andar.js) | cuánto corre este personaje — **la usan los dos lados** |
| [anfitrion.js](../src/red/anfitrion.js) | el bucle del proceso y el mundo de Gate City |
| [archivos.js](../src/red/archivos.js) | los personajes en el disco del servidor (`LOC_SERVER`) |
| [navegador.js](../src/red/navegador.js) | el `WebSocket` de la página con la misma forma |

Y [tools/servidor.mjs](../tools/servidor.mjs), que es **un proceso de Node por
partida**, como dice la tabla del §8: sin P2P, con su lista en `/partidas` y su
juego en `/juego`.

### El WebSocket es nuestro, y por la regla de siempre

Se escribió el lector, otra vez. Son dos bytes de cabecera, un largo de tres
tamaños y un XOR de cuatro — y a cambio **el RFC trae sus propios vectores de
prueba**: un «Hello» sin máscara es `81 05 48 65 6c 6c 6f` y con máscara es
`81 85 37 fa 21 3d 7f 9f 4d 51 58`, escritos por quien definió el formato. Trece
pruebas salen de ahí, incluidas las que exigen cerrar la conexión: un marco de
cliente sin máscara, un ping fragmentado, una continuación sin nada que
continuar, un largo de 16 GiB anunciado sin mandar un solo byte.

Y hay un segundo oráculo que vale más: **Chrome**. Nuestro cliente de Node y
nuestro servidor podrían entenderse estando los dos equivocados igual. El
navegador no: si la aceptación no cuadra, no abre. Que la sonda conecte es la
prueba.

---

## 2. Las cifras, que no las hemos elegido nosotros

La misma regla que cerró la luz en el 06 y la física en el 12. La red de GoldSrc
lleva veinte años funcionando sobre módems y todos sus números están escritos:

| | | |
| --- | --- | --- |
| `sys_ticrate` | **100** | `host.c:67` — el servidor simula cada 10 ms |
| `sv_maxupdaterate` | **30** | `sv_main.cpp:191` — tope de fotos por segundo |
| `cl_updaterate` | 20 (10–102) | `client.h:109-110` |
| `cl_cmdrate` | 30 (10–100) | `cl_main.c:69, 811-814` |
| `cl_cmdbackup` | **10**, tope 16 | `cl_main.c:53` y `protocol.h:170` — `BIT(4)` |
| `ex_interp` | **0,1** | `cl_main.c:70`, `MAX_EX_INTERP` en `client.h:112` |
| `MULTIPLAYER_BACKUP` | **64** | `netchan.h:75` — «must be power of 2» |
| `sv_unlag` / `sv_maxunlag` | 1 / **0,5** | `sv_user.cpp:56-57` |
| `clockwindow` | **0,5** | `net_ws.cpp:83` — el freno contra el *speed hack* |
| `MAX_CLIENTS` | **32** | `const.h:23` |
| `MAX_DROPPED_CMDS` | **24** | `sv_user.cpp:1526` |

**Son cuatro relojes distintos y esto es lo que más cuesta ver**: el servidor
simula 100 veces por segundo, el cliente manda 30, el servidor cuenta el mundo
20 y el navegador dibuja 60. De ahí sale todo lo demás — como se dibuja tres
veces por cada noticia, hacen falta `ex_interp` y la interpolación; como se
simula tres veces por cada envío, cada paquete lleva varias órdenes y cada orden
lleva su propio `msec`.

### Cuatro cosas del motor que no se adivinan

- **`SV_RunCmd` parte las órdenes largas por la mitad, y pierde milisegundos.**
  Por encima de 50 ms, `cmd.msec = (byte)(ucmd->msec / 2.0)` dos veces y
  recursión. Las dos mitades salen del mismo truncado, así que 51 ms se simulan
  como 25 + 25 = **50**. Y como es recursivo, la pérdida se acumula: **255 ms se
  quedan en 248**, ocho trozos de 31. (Escribí la prueba esperando 254 dando por
  hecho una sola partición. Mandó la medida.)
- **Lo que se pierde no se inventa: se repite.** `SV_EstablishTimeBase` corre las
  órdenes viejas que el respaldo trae, y de las que no caben repite la última
  conocida. Con **24 perdidas o más se abandona la ráfaga entera**: repetir dos
  segundos de «hacia adelante» pondría al jugador dentro de una pared que nunca
  vio.
- **La compensación de retardo resta DOS cosas.** No sólo la latencia: también
  lo que el cliente dibuja en el pasado a propósito. `targettime = realtime −
  latency − cl_interptime`, con la latencia topada a 1,5 y luego a
  `sv_maxunlag`. Olvidar el segundo sumando es el fallo clásico y se ve como «le
  he dado y no ha contado».
- **El freno contra el *speed hack* es contable, no físico.** El servidor no
  mira si te mueves raro: lleva la cuenta de **cuánto tiempo has pedido
  simular** y lo compara una vez por segundo con el que ha pasado. Medio segundo
  por delante y te ignora medio segundo. Y **ir por detrás no se castiga**: eso
  es mala conexión, y el castigo sería para el que ya lo está pasando peor.

---

## 3. La autoridad, y qué significa exactamente

La frase que ordena `partida.js`: **el cliente manda teclas y el servidor manda
posiciones.** Un mensaje que diga «estoy en (x,y,z)» no existe en este
protocolo, así que no hay que validarlo.

Tres defensas, y ninguna es una comprobación puesta encima:

1. **La intención va recortada a [−1, 1]** en `orden()`. Un cliente que manda
   `adelante: 1000` anda exactamente lo mismo que uno honrado — medido, 1 cm de
   diferencia en 60 órdenes.
2. **La velocidad la decide el servidor**, que tiene el personaje: su agilidad,
   lo que carga y su aguante. El cliente manda el botón de correr; el que gasta
   el aguante y decide si se puede es el otro lado.
3. **El personaje se lee del disco del servidor.** Lo que el cliente manda al
   entrar es un identificador. Y al crear, tres campos —nombre, género y arma—:
   las habilidades, el oro y los objetos los pone `crearPersonaje()` allí. Una
   prueba manda `habilidades: { swordsmanship: 100 }, oro: 999999` y comprueba
   que en el disco quedan el 1 de salida y las diez monedas.

Y lo que MSR hace, copiado: **se guarda al desconectar**
(`ClientDisconnected → SaveChar()`, `multiplay_gamerules.cpp:432`), cada tres
segundos mientras juegas (el `AutoSave` que ya estaba portado en `Sesion`), y al
cerrar el proceso se guardan todos.

### El almacén remoto: la promesa del §5, cumplida

> «el almacén local pasa a ser una CACHÉ, no la verdad. La interfaz de cuatro
> operaciones ya está preparada: se escribe `AlmacenRemoto` y el juego no se
> entera.»

Es cierto, y con una excepción que costó una vuelta. `listar` y `borrar` van y
vienen; `leer` **es entrar** —el servidor le da cuerpo y lo pone en el mapa,
porque un personaje leído por quien no va a jugarlo es regalar los datos de
otro—; y `escribir` son dos cosas: **crear**, que sí manda (tres campos), y el
autoguardado, que **no manda nada**, porque el que guarda es el servidor.

Lo único que hubo que tocar fuera de `src/red/` es una línea de `Sesion.crear`:
**el identificador lo pone el servidor**, así que la sesión acepta que el
almacén le devuelva un documento distinto del que le dio. La pantalla de elegir
personaje del experimento 11 no cambió ni una línea.

---

## 4. Predecir, reconciliar, interpolar — y por qué la física es una sola

Tres trabajos que se confunden en uno y resuelven problemas distintos:

- **Predecir** es andar al pulsar la tecla. Sin esto, con 80 ms de ida y vuelta
  el mando va 80 ms por detrás de la mano y el juego se siente roto aunque la
  red esté perfecta.
- **Reconciliar** es que cuando la respuesta no coincide con lo predicho, manda
  el servidor **y se vuelven a correr las órdenes que él todavía no ha visto**.
  Ese repaso es lo que casi todo el mundo se deja, y sin él cada corrección te
  arrastra hacia atrás lo que hayas andado desde entonces: el tirón de goma.
- **Interpolar** es dibujar a los demás 100 ms en el pasado. Es el único de los
  tres que empeora a propósito lo que ves, y el único que no se puede quitar sin
  que los demás den saltos. Medido en pantalla: **89 cm por detrás** de la última
  foto, y **1,4 s** desde que el otro suelta la tecla hasta que su figura se
  para.

Y lo que hace que funcione: **la predicción no es una copia de la física del
servidor, es la misma.** `src/play/player.js` y `src/play/movimiento.js` no
importan Three.js desde el experimento 03 «para poder comprobarlos en Node», y
eso, tres años de experimentos después, es lo que permite que el navegador y el
servidor corran el mismo paso. Con dos físicas parecidas, la reconciliación
corregiría cada fotograma y no habría forma de distinguir un fallo de red de esa
diferencia.

Medido con dos navegadores: **0,5 mm de error** entre lo que el cliente predijo y
lo que el servidor dice, andando tres segundos en línea recta.

---

## 5. Los cinco fallos que encontró la medida, y ninguno daba error

Éste es el apartado que importa, porque los cinco daban un juego que parecía
funcionar.

**1. El campo `t` del sobre pisaba el tiempo del servidor.** La foto llevaba el
instante en un campo llamado `t` y el sobre lleva ahí el tipo del mensaje. Al
extenderlo, el tipo dejaba de ser una cadena, `abrir()` devolvía `null` y **no
llegaba ni una sola foto**. Como entrar al mapa va por otro mensaje, el jugador
entraba y jugaba solo, sin saberlo. Hoy `empaquetar()` **lanza** si el cuerpo
usa `t` o `v`.

**2. Un presupuesto de 10 ms por paso, que suena prudente y es falso.** Lo
primero que escribí daba a cada cliente el tiempo de un paso del servidor por
vuelta. Pero un cliente a 60 fotogramas manda órdenes de 16 ms: **ninguna cabría
nunca** y el jugador no andaría. El motor las corre al llegar
(`SV_ParseMove → SV_RunCmd`) y vigila el TOTAL con `SV_CheckCmdTimes`. Quien
decide cuánto tiempo se simula es el cliente; lo que el servidor vigila es que
no pida más del que ha pasado.

**3. La corrección arreglaba el sitio y dejaba la deriva.** `colocar()` ponía la
posición del servidor pero no su **velocidad**, así que rehacer las órdenes
pendientes las rehacía desde otro estado y el error volvía a crecer en el mismo
fotograma: 18 cm de deriva con la física correcta en los dos lados. El motor
manda la velocidad en el `clientdata_t` por esto mismo.

**4. La compresión delta comparaba contra la última foto MANDADA.** El acuse
llega con un viaje de red de retraso, así que cuando llega, la última mandada ya
es otra: **la comparación no cuadraba nunca**, todas las fotos iban completas y
la lista de quién se ha ido venía siempre vacía — la figura de un jugador que
cerraba la pestaña se quedaba de pie en el mapa para siempre. Por eso el motor
guarda `frames[MULTIPLAYER_BACKUP]`, que son 64. Es exactamente esto.

**5. Y el mejor: con la delta arreglada, la mentira de un cliente no se
corregía.** Si el servidor no te ve moverte, tu estado no cambia, no viaja... y
**no tienes contra qué reconciliar**. La sonda teletransportaba el cuerpo dos
metros y el servidor callaba. El motor no tiene este problema porque lo propio
va por otro camino: `svc_clientdata` en **cada** mensaje. Aquí es el mismo campo
con una excepción: **el jugador se manda siempre a sí mismo**.

Y uno de integración, que sólo aparece con el mapa de verdad: **el servidor no
tenía el catálogo de objetos**, así que creía que todo el mundo iba ligero,
calculaba una velocidad un pelo más alta y corregía un poco en cada foto. 144 mm
de error andando en línea recta, con todo lo demás correcto. Pasarle
`build/msr/objetos.json` lo dejó en 0,5 mm.

### Y dos de sonda, que es la proporción de siempre

- **Una vuelta que se cae deja el servidor vivo, y la siguiente mide el proceso
  viejo.** `--strictPort` no abre, los navegadores hablan con el de antes y los
  controles fallan por un fallo ya arreglado. Media hora. Hoy la sonda libera los
  puertos antes de empezar y tiene un `finally`.
- **`mirar` toma tres números y le pasé un array.** El `yaw` se quedó en `NaN`,
  la captura salió negra entera y la consola escupió dos «AudioParam
  non-finite». Se encontró por el error de audio, no por la foto — que es el
  orden equivocado, y por eso ahora la sonda imprime la traza de los errores de
  página.

---

## 6. Lo que se ve, y lo que cuesta

La sonda `npm run sonda:red` levanta el servidor con Gate City cargado y abre
dos navegadores. Lo que mide:

```
    huecos          ana 1 · beto 2
    en el disco     2 ficheros en build/partidas/sonda/personajes
    Ana ve          Beto, Ana
    aparecen a      1.28 m uno del otro
    Ana le ve andar 10.80 m en tres segundos
    se le dibuja    89 cm por detrás de la última foto (ex_interp 100 ms)
    parar           1366 ms desde que suelta la tecla hasta que la figura se para
    mentira de 2 m  -> correcciones 5 → 6, volvió 2.00 m
    andando 3 s     error último 0.5 mm · 1440 órdenes en 137 paquetes
```

La captura está en `build/gatecity/vistas/red.png`: el otro jugador, de pie en
el templo, con el modelo que el propio juego usa para los personajes
(`models/human/reference.mdl`, el mismo de la hoja del 14) y su animación.

Y lo que cuesta el servidor, que era la duda razonable de meter Rapier en Node:

| | |
| --- | --- |
| cargar Gate City | **10 ms**, 39 091 triángulos de colisión |
| un paso de jugador | **0,22 ms** |
| una vuelta del bucle con dos jugadores | **0,24 ms** de media, pico de 29 |
| el reloj | 100 pasos/s de verdad: 2 000 pasos en 20 s |

---

## 7. Lo que NO está hecho, y se dice aquí para que no se confunda

- **El combate entre jugadores.** Rebobinar está escrito y medido
  —`partida.rebobinar(t)` devuelve dónde estaba cada uno, interpolado, y
  `objetivoDe(id)` calcula el instante con la fórmula del motor— pero **mover los
  cuerpos, resolver el golpe y devolverlos a su sitio no**. Lo que hay es la
  consulta, para que el día que haya golpes no se invente.
- **Los bichos son del cliente.** Los 69 NPC siguen simulándose en cada
  navegador, así que dos jugadores ven dos goblins distintos en sitios distintos.
  Es el trabajo siguiente y es grande: la IA tiene que mudarse al servidor igual
  que se mudó el jugador.
- **El daño y la muerte no viajan.** La sesión de cada cliente vive en el
  servidor y él la guarda, pero quien decide que un goblin te pega sigue siendo
  tu navegador.
- **Los otros jugadores se dibujan a plena luz.** Un `.mdl` se ilumina con
  `R_LightPoint`, un luxel del suelo que tiene debajo; los adornos y los bichos
  lo traen horneado, pero un jugador se mueve y habría que preguntárselo al mapa
  de luz en cada foto. Se ve como que el otro brilla un poco en las cuevas.
- **En el agua y en las escaleras la predicción no coincide.** El bucle del
  navegador pregunta el nivel de agua y la escalera en cada paso; el servidor
  todavía no carga los volúmenes del mapa, así que ahí habrá corrección. El
  camino está abierto: `Partida` ya recibe el mundo por el constructor.
- **No hay `wss://` ni cuentas.** El cifrado va detrás de un proxy el día que
  haya despliegue, que es donde vive el certificado; y una cuenta central es lo
  que MSR llama FN, y en su tabla es «un añadido posterior».
- **Un jugador congelado sigue corriendo en el sitio.** Si un cliente deja de
  mandar órdenes, su cuerpo no se mueve pero su velocidad se queda como estaba, y
  los demás le ven la animación de correr. Curiosamente **es lo que hace
  GoldSrc**, porque la animación de los demás sale de `pev->velocity` en el
  servidor. Queda declarado y sin tocar.

## 8. Lo siguiente

Por orden de lo que desbloquea:

1. **Los bichos al servidor.** Es el paso 5 («combate, IA») y ahora tiene dónde
   colgarse. Lo que hace falta ya existe: `src/play/ia.js` tampoco importa
   Three.js.
2. **El daño y la muerte por la red**, que con lo anterior es poco código: la
   `Sesion` que decide ya corre allí.
3. **El golpe con rebobinado**, usando lo que el 27 deja medido.
4. Y lo que quedó de antes: el panel de identificación del objetivo, la consola
   de charla, y los 19 iconos de estado.
