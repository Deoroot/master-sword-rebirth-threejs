# 51. Las conversaciones salen de main.js

Después del 50 ya se entra a Edana por el menú, están sus 42 NPC y el punto de
aparición se lee de su extracción. `patron9` y las anclas de aparición dejaron
de ser bloqueos; no se han vuelto a resolver aquí.

Este paso empieza a dividir `src/main.js` por responsabilidades. Las
conversaciones viven en `src/juego/interacciones.js`, sin DOM ni Three:

- un guion vivo por entidad, con sus variables persistentes durante el mapa;
- el reloj de `calleventtimed`, que sigue avanzando desde el bucle del HUD;
- el registro de áreas nombradas que los guiones pueden eliminar;
- pedir opciones, ejecutar la elegida, cancelar y solicitar el guardado;
- el respaldo de `menus.json` para un NPC sin guion extraído.

`main.js` conserva la selección del NPC con el mismo cono y trazado que usa
el combate. También monta el panel y conecta los efectos de animación y borrado
de entidades. La sesión se consulta al interactuar: no se captura el personaje
que estaba seleccionado cuando se creó el servicio. El origen del NPC también
se lee al usarlo, para que caminar no deje sus guiones con coordenadas viejas.

Las sondas siguen leyendo el mismo estado usado por el juego. Su interfaz de
diagnóstico se conserva; no hay un segundo registro ni un reloj sólo para ellas.
Esto no porta nuevas reglas ni añade ejecución de guiones al servidor remoto.
Tampoco aísla los globales propios del intérprete: sólo mueve y encapsula el
estado que antes administraba `main.js`.

## Comprobaciones

`npm test`: 1344/1344, frente a las 1340 de partida. Las cuatro pruebas nuevas
comprueban efectos, con dos entidades y dos instancias del servicio:

- cambiar de personaje escribe la misión y guarda en el personaje actual;
- un temporizador pendiente no vence en otra partida y produce su mensaje al vencer;
- cancelar llega al evento del guion; borrar un área no borra la de otra partida;
- el respaldo sin guion conserva las opciones y avisa si se intenta ejecutarlas.

Tres roturas en copias en memoria, sin editar el árbol de trabajo: desconectar
el reloj deja una prueba roja, omitir la cancelación otra, recrear el guion en
cada consulta deja dos rojas.

En Chromium, `misiones33` pasa 23/23 y `vgui29` 36/36. La nueva
`npm run sonda:interacciones51` entra por el menú principal, elige Edana,
busca al Merchant Square Keeper y pulsa **Hail con el ratón**. Exige que el
mensaje no estuviera antes del clic, que llegue su respuesta del guion y que
el panel pueda abrirse otra vez. El desplazamiento hasta el NPC y la creación
del personaje usan la sonda; no se afirma haber recorrido el mapa a pie.

La primera ejecución falló en la propia sonda: buscaba `centroX`, pero el
diagnóstico de botones devuelve `centro`. Se corrigió la coordenada, sin cambiar
el panel ni reemplazar el clic por una llamada al guion.

Además, `edana50` pasa 21/21. Una copia en memoria de la nueva sonda,
con la ejecución de la opción del guion desconectada mediante Vite, falla
esperando la respuesta del NPC: el control detecta la rotura sin modificar
el árbol de trabajo. La compilación con Vite termina correctamente y conserva
la advertencia de tamaño del paquete.

## Lo pendiente

`main.js` sigue siendo grande: este es el primer bloque extraído, no la
refactorización completa. Quedan el arranque de sesión y paneles, el combate,
el montaje del mundo y el bucle. La conversación comprobada en Edana tampoco
equivale a certificar sus misiones completas.
