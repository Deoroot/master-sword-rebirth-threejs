// EL MUNDO VIVO, medido en el mapa.
//
// El 21 sale de cuatro cosas que se vieron JUGANDO y no en ninguna prueba, y
// las cuatro tienen la misma pinta en una captura: un pueblo quieto. Por eso
// esta sonda mide, y mide lo que se ve.
//
// Las ocho formas de que esto siga mal, todas indistinguibles en una foto:
//
//   1. que la IA siga apagada          -> 69 bichos congelados (era esto)
//   2. que esté encendida y nadie ande -> igual, pero con el interruptor en sí
//   3. que anden los que no deben      -> el tendero se va y la tienda queda vacía
//   4. que anden todos a la vez        -> un pueblo de sonámbulos
//   5. que anden dos metros y paren    -> el destino corto, el fallo natural
//   6. que estén en pose de andar      -> un pie levantado para siempre (era esto)
//   7. que suene el grito de dolor     -> en cada golpe, y no es ése (era esto)
//   8. que matar no dé experiencia     -> y la curva mal no se ve nunca (era esto)

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5205;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
// SE ENTRA POR EL MENÚ, como el jugador (59). Antes era `?map=gatecity`,
// que se salta el menú: carga el nivel y arranca la sesión de una pasada,
// que es un montaje que el jugador no ve nunca. Ver `sondas/entrar.mjs`.
await entrarPorElMenu(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
await pag.waitForTimeout(400);

// ── 1. EL INTERRUPTOR ──────────────────────────────────────────────────────
//
// El control más tonto de todo el proyecto y el que habría ahorrado cuatro
// experimentos: `let paseando = false` desde el 17. Una IA apagada se ve
// exactamente igual que una IA rota, y nadie la había mirado desde fuera.
const encendida = await pag.evaluate(() => window.probe.ia.encendida);
console.log(`  la IA arranca ${encendida ? "ENCENDIDA" : "apagada"}`);
control("la IA está encendida al entrar, sin tocar ninguna tecla", encendida === true);

// ── 2. LA ANIMACIÓN DE ESTAR PARADO ────────────────────────────────────────
//
// SE MIRAN LOS QUE ESTÁN PARADOS, y esto lo enseñó el 59 al cambiar la entrada.
//
// Mientras esta sonda abría `?map=gatecity`, el mundo que medía acababa de
// nacer: los 69 quietos y en su pose inicial. Dos controles de este apartado
// estaban verdes por eso y no por lo que decían. Entrando por el menú —por
// donde entra el jugador— el pueblo lleva rato andando cuando se mide, y los
// dos se pusieron rojos **con el juego correcto**.
//
// La salida NO es congelar el paseo: se probó, y `congelarPaseo` deja a 46 de
// los 69 clavados con la animación de andar puesta, que es un estado que el
// juego no tiene —el reinicio de la animación va en el paso del vagabundo, y
// congelarlo lo apaga—. Un ayudante de sonda que fabrica un estado imposible
// mide otro juego.
//
// La salida es preguntar por quien de verdad está parado: los que no declaran
// `roam 1`, que son dieciséis y lo están siempre, entre por donde se entre.
const censo = await pag.evaluate(() => window.probe.vivo.censo());
console.log(`\n  ${censo.total} bichos: ${censo.pasean} con 'roam 1', ${censo.total - censo.pasean} clavados`);
console.log(`  parado: ${censo.nombran} lo nombran, ${censo.porActividad} por ACT_IDLE, ${censo.alaCero} a la secuencia 0`);
control("hay bichos que NO nombran su animación de estar parado",
  censo.porActividad > 0, `${censo.porActividad} la sacan de la actividad del .mdl`);
control("y ninguno cae a la secuencia 0: todos los modelos traen ACT_IDLE",
  censo.alaCero === 0);
// EL CONTROL DEL 21. Un bicho quieto con la animación de andar puesta es el
// aldeano con el pie levantado, y era el estado de dieciséis de ellos.
console.log(`  en secuencia de ANDAR estando quietos: ${censo.enPoseDeAndar} (por actividad, no por nombre)`);
control("NINGÚN bicho quieto está en una secuencia de andar o correr",
  censo.enPoseDeAndar === 0, `${censo.enPoseDeAndar} de ${censo.total}`);
// Los dos casos que obligaron a medir por actividad: hay scripts que usan la
// MISMA secuencia para andar y para estar quieto, y el alcalde anda con la de
// estar quieto. Comparando nombres, los dos salían en rojo estando bien.
console.log(`  ${censo.andanConLaDeQuieto} declaran la misma secuencia para andar y para estar quietos`);
control("y los que comparten secuencia es porque su script lo pide",
  censo.andanConLaDeQuieto >= 1, `${censo.andanConLaDeQuieto}`);
// EL ALDEANO, y se coge uno QUIETO a propósito (59).
//
// Antes se cogía el primer `default_dwarf` de la lista y se le exigía no
// estar en 'walk'. Con la entrada vieja eso era gratis —nadie había andado
// todavía—; entrando por el menú, el primero de la lista suele ir de camino a
// alguna parte y el control decía «está en 'walk'» con el juego correcto.
//
// Un aldeano andando **tiene** que estar en 'walk'. Lo que este control quiere
// preguntar es otra cosa: que uno que NO declara animación de parado, cuando
// está parado, no se quede con el pie levantado. Así que se le pregunta a uno
// parado.
// Y «parado» es ESTAR parado, no «no declarar `roam`»: los doce aldeanos de
// Gate City declaran los doce `roam 1`, así que filtrar por eso no deja
// ninguno. Lo que hace falta es uno con ACT_IDLE puesta en este instante.
// Y «parado» es ESTAR parado, no «no declarar `roam`»: los doce aldeanos de
// Gate City declaran los doce `roam 1`, así que filtrar por eso no deja
// ninguno. Se espera a pillar uno con ACT_IDLE puesta, que es un instante que
// llega solo —pasan más tiempo andando que parados— en vez de mirar una foto
// y que salga cara o cruz.
let aldeano = null, aldeanos = [];
for (let n = 0; n < 60 && !aldeano; n++) {
  aldeanos = (await pag.evaluate(() => window.probe.vivo.censo().lista))
    .filter((b) => b.script === "NPCs/default_dwarf");
  aldeano = aldeanos.find((b) => b.actividad === 1) ?? null;
  if (!aldeano) await pag.waitForTimeout(500);
}
const aldeanoQuieto = Boolean(aldeano);
console.log(`  aldeanos: ${aldeanos.length}, se ha esperado a pillar uno parado: ${aldeanoQuieto ? "sí" : "NO"}`);
console.log(`  el aldeano: parado '${aldeano?.parado}', andando '${aldeano?.andando}', puesta '${aldeano?.animacion}' (${aldeano?.porque})`);
// El positivo de la selección: sin esto, «no encontré ninguno andando» y «no
// encontré ninguno» serían el mismo verde, que es el apartado 4 otra vez.
control("hay un aldeano PARADO al que preguntarle, no sólo aldeanos",
  aldeanoQuieto, `${aldeanos.length} aldeanos, uno parado ${aldeanoQuieto ? "encontrado" : "NO encontrado en 30 s"}`);
control("el aldeano no declara animación de parado", aldeano?.parado === null);
control("y estando parado no se queda con el pie levantado",
  aldeanoQuieto && aldeano?.animacion !== aldeano?.andando,
  `está en '${aldeano?.animacion}' (andando sería '${aldeano?.andando}')`);

// ── 2 bis. EL SORTEO SE REPITE, Y POR ESO LOS ALDEANOS ASIENTEN ───────────
//
// `SetActivity(ACT_IDLE)` se vuelve a llamar cada vez que la secuencia acaba,
// y `dwarf/male1.mdl` declara TRES con esa actividad y con pesos: `idle` 10,
// `nod` 10 y `anim_xbow_aim_idle` 3. Sin volver a sortear, los 69 se quedan
// con la que les tocó al nacer — que se ve como un pueblo de estatuas, sólo
// que con una pose distinta cada una.
//
// Y SE MIDE BICHO A BICHO, no por especie (59). `poses()` agrupaba por
// `ficha.nombre`, así que «dos enanos, cada uno en una pose» y «un enano que
// cambió de pose» daban exactamente la misma lista de dos. Con 69 bichos y
// tres poses posibles eso estaba verde aunque el sorteo no se repitiera
// nunca. Ahora la clave es la instancia.
//
// Y se pregunta sólo a los QUIETOS: quien va andando está en su secuencia de
// andar y no puede sortear una pose de reposo. Mezclarlos era lo que rompía
// este control al entrar por el menú.
// SE MIDE EN TIEMPO REAL, y no con el bucle sintético de `poses()`.
//
// `poses()` avanzaba 30 s de `animar()` de golpe sobre el estado congelado del
// instante. Eso tiene dos agujeros y los dos estaban abiertos:
//
//   1. agrupaba por ESPECIE, así que «dos enanos, cada uno en su pose» y «un
//      enano que cambió de pose» daban la misma lista. Con 69 bichos y tres
//      poses posibles, verde asegurado aunque nadie cambiara nunca.
//   2. no llamaba a `relojes()`, que es donde vive el sorteo
//      (`src/play/manada.js:499`). **El mecanismo bajo prueba no llegaba a
//      dispararse.**
//
// Arreglados los dos (59), el control se puso rojo: los catorce bichos que
// están siempre quietos son especies con UNA sola secuencia ACT_IDLE, y los
// doce enanos —que tienen tres— declaran los doce `roam 1`, así que el bucle
// sintético los deja fuera con su destino puesto para siempre.
//
// Donde el sorteo pasa de verdad es en el juego andando: un enano alterna
// caminar y estar parado, y cada vez que su secuencia de reposo acaba se echa
// el dado. Así que se mira eso: veinticinco segundos de reloj de pared,
// contando por bicho cuántas secuencias DE REPOSO distintas se le ven.
// Contar todas valdría cualquier cosa —andar y parar ya son dos—, así que se
// cuentan sólo las que tienen ACT_IDLE puesta.
const reposos = new Map();   // índice del bicho -> Set de secuencias de reposo
for (let n = 0; n < 50; n++) {
  const foto = await pag.evaluate(() =>
    window.probe.vivo.censo().lista.map((b) => ({ a: b.animacion, act: b.actividad, n: b.nombre })));
  foto.forEach((b, i) => {
    if (b.act !== 1 || !b.a) return;         // ACT_IDLE = 1
    if (!reposos.has(i)) reposos.set(i, { nombre: b.n, vistas: new Set() });
    reposos.get(i).vistas.add(b.a);
  });
  await pag.waitForTimeout(500);
}
const mirados = [...reposos.values()];
const variados = mirados.filter((p) => p.vistas.size > 1);
console.log(`\n  25 s de juego: ${mirados.length} bichos vistos en reposo, ${variados.length} con más de una pose`);
for (const p of variados.slice(0, 3)) console.log(`    ${p.nombre.padEnd(22)} ${[...p.vistas].join(", ")}`);
// El positivo: sin bichos vistos en reposo, «ninguno varió» sería verdad
// también con la lista vacía, que es el apartado 4 otra vez.
control("hay bichos a los que se les ha visto la pose de reposo",
  mirados.length > 0, `${mirados.length} de 69`);
control("la pose de reposo se vuelve a sortear al acabar el ciclo, EN EL MISMO bicho",
  variados.length > 0, `${variados.length} de ${mirados.length}`);
control("y sale más de una pose distinta, que es lo que el .mdl declara",
  Math.max(0, ...mirados.map((p) => p.vistas.size)) >= 2,
  `${Math.max(0, ...mirados.map((p) => p.vistas.size))} poses de reposo el que más`);

// ── 3. EL PASEO ────────────────────────────────────────────────────────────
//
// Diez segundos de sólo paseo, sin caza, para que lo que se mida sea `roam` y
// no «me ha visto y viene». La primera decisión cae a los 2 s y el plazo dura
// 7, así que diez segundos dan una vuelta y pico.
const p10 = await pag.evaluate(() => window.probe.vivo.pasear(10));
console.log(`\n  10 s de paseo: ${p10.seMovieron} se movieron, el que más ${p10.masLejos.toFixed(2)} m`);
control("con la IA encendida, los bichos se mueven solos",
  p10.seMovieron > 0, `${p10.seMovieron} de ${censo.total}`);
control("y se mueve la mayoría de los que declaran 'roam 1'",
  p10.seMovieron >= censo.pasean * 0.5,
  `${p10.seMovieron} de ${censo.pasean} con roam`);
// EL CONTROL AL REVÉS, que es el que impide «arreglarlo» moviéndolos a todos:
// el herrero, el tabernero y el cofre del tesoro no declaran `roam` y tienen
// que seguir donde están. Un mercader de paseo deja la tienda vacía.
console.log(`  clavados que se movieron: ${p10.clavadosQueSeMovieron}`);
control("los 16 sin 'roam 1' NO se mueven ni un centímetro",
  p10.clavadosQueSeMovieron === 0, `${p10.clavadosQueSeMovieron} se movieron`);
// Y el paseo tiene que llevar a alguna parte. Dos metros en diez segundos es
// un bicho temblando en el sitio, que es lo que sale al colapsar la distancia
// del trazo con la del destino.
control("y andan una distancia de verdad, no dos pasos",
  p10.masLejos > 3, `${p10.masLejos.toFixed(2)} m el que más`);
// La animación del que anda. Se pregunta contra la que declara SU script y no
// contra la cadena «walk»: 33 de los 69 no declaran ninguna y andan con la de
// estar quietos, que es lo que hace el motor —`m_MoveAnim` vacío— y no un
// fallo. Comparar con «walk» los marcaba a todos en rojo.
console.log(`  de los que se movieron, ${p10.andandoBien} con su animación de andar` +
  ` y ${p10.andandoMal} que la declaran y no la tienen`);
// EL 92 (pieza D): QUIÉNES, y no sólo cuántos. «3 mal» no decía si era el
// juego o el control; el estado con que se movieron sí.
for (const x of p10.lista.filter((y) => y.movido > 0.2 && y.declaraAndar && !y.conLaDeAndar)) {
  console.log(`    MAL ${String(x.nombre).padEnd(24)} ${x.guion}  declara '${x.declara}'  se movió como ${JSON.stringify(x.comoSeMovio)}`);
}
control("el que anda y declara animación de andar, la tiene puesta",
  p10.andandoBien > 0 && p10.andandoMal === 0, `${p10.andandoBien} bien, ${p10.andandoMal} mal`);

// El estado interno de los vagabundos: los dos relojes y el destino lejos.
//
// Se miran TODOS y no uno: en un instante cualquiera la mitad están entre dos
// destinos —acaban de llegar, o el plazo acaba de vencer— y con `lejos = null`
// el control pasaría sin comprobar nada. Un control que puede pasar en vacío
// no es un control, y éste ya lo hizo una vez.
const v = await pag.evaluate(() => {
  window.probe.vivo.pasear(3);
  const n = window.probe.vivo.censo().total;
  const l = [];
  for (let k = 0; k < n; k++) {
    const x = window.probe.vivo.vagabundo(k);
    if (x?.tieneDestino && x.lejos !== null) l.push(x);
  }
  return l;
});
console.log(`  ${v.length} con destino puesto; distancias ${v.length ? `${Math.min(...v.map((x) => x.lejos)).toFixed(0)}–${Math.max(...v.map((x) => x.lejos)).toFixed(0)} u` : "-"}`);
control("hay vagabundos con destino puesto a los que mirarles los relojes",
  v.length > 3, `${v.length}`);
// Ya recorridos parte del camino, así que el mínimo puede ser corto; el techo
// es lo que distingue el destino de verdad del alcance del trazo.
control("y el destino se apunta de 300 a 6000 unidades, no a las 105 del trazo",
  v.length > 0 && v.every((x) => x.lejos <= 6100) && Math.max(...v.map((x) => x.lejos)) > 300,
  `el más lejos, ${Math.max(0, ...v.map((x) => x.lejos)).toFixed(0)} u`);
control("y el plazo de 7 s corre para todos", v.every((x) => x.plazo > x.t && x.plazo <= x.t + 7.001));

// ── 3 bis. LO MISMO, PERO POR DONDE PASA EL JUGADOR ────────────────────────
//
// Todo lo de arriba llama a `probe.vivo.pasear`, que llama a `bichos.pasear`
// a mano. El juego NO pasa por ahí: pasa por `bichos.cazar`, y hasta el 22
// `cazar` sólo paseaba a los bichos sin ficha de combate — que en Gate City
// son cero. O sea que los 28 controles del 21 estaban en verde con el paseo
// muerto en la partida, igual que los 15 de IA lo estaban con la IA apagada.
//
// Éste no llama a lo que quiere medir. Llama al bucle de fotogramas.
const vivo = await pag.evaluate(() => window.probe.vivo.vivir(10));
console.log(`\n  10 s del BUCLE DEL JUEGO: ${vivo.seMovieron} se movieron, el que más ${vivo.masLejos.toFixed(2)} m`);
control("los bichos pasean POR EL CAMINO QUE CORRE EL JUEGO, no sólo si se les llama",
  vivo.seMovieron > 0, `${vivo.seMovieron} de ${vivo.conRoam} con roam`);
control("y se mueve la mayoría, no cuatro sueltos",
  vivo.seMovieron >= vivo.conRoam * 0.5, `${vivo.seMovieron} de ${vivo.conRoam}`);
control("los clavados siguen clavados también por este camino",
  vivo.clavadosQueSeMovieron === 0, `${vivo.clavadosQueSeMovieron} se movieron`);
// EL PARPADEO. `CWalkAnim::Animate` no rebobina si la secuencia pedida ya es
// la puesta, y `SetActivity` sólo rebobina si cambia o si no es de bucle. Sin
// esa guarda, `npc/human1.mdl` —que saca `idle1` en 50 de 65 sorteos— salta al
// fotograma 0 cada vez que le vuelve a tocar, que es el parpadeo del pueblo.
console.log(`  en 10 s: ${vivo.reinicios} rebobinados, ${vivo.repeticiones} ahorrados por la guarda`);
control("la guarda del rebobinado HACE algo: el sorteo cae en la misma pose a menudo",
  vivo.repeticiones > 10, `${vivo.repeticiones} veces salió la que ya estaba puesta`);
// Y el temblor del encajado: uno que declara `roam`, no se mueve nada y aun
// así cambia de animación sin parar. Es el ciclo andar→chocar→quieto que
// teníamos y el motor no tiene, porque chocar no suelta el destino: sólo lo
// sueltan llegar y el plazo de 7 s. Eran las cuatro ratas hundidas.
console.log(`  bichos temblando en el sitio: ${vivo.temblando}` +
  `  (con algún cambio de actividad: ${vivo.conCambioDeActividad})`);
// EL POSITIVO DEL CERO. La cuenta del temblor se mide en cambios de
// ACTIVIDAD desde el 59, y un contador que no se incrementara nunca daría
// «0 temblando» igual de verde. Así que se exige que alguien cambie.
control("el contador de cambios de actividad CUENTA: alguien anda y se para",
  vivo.conCambioDeActividad > 0, `${vivo.conCambioDeActividad} de ${vivo.conRoam} con roam`);
control("ninguno tiembla en el sitio cambiando de animación sin moverse",
  vivo.temblando === 0, `${vivo.temblando} temblando`);

// Y una foto donde se pueda ver: en medio del corro de aldeanos, no en el
// punto de aparición —que está dentro de un edificio y sale una pared—.
const donde = await pag.evaluate(() => {
  // El paseo PRIMERO y el censo después: en el intento anterior la cámara se
  // colocaba con las posiciones de antes de andar, y para cuando se sacaba la
  // foto los aldeanos ya no estaban ahí. Salía una pared y ni un bicho.
  window.probe.vivo.pasear(4);
  const l = window.probe.ia.censo().lista.filter((b) => !b.hostil);
  if (!l.length) return null;
  // El que más vecinos tiene a diez metros: donde haya corro se ve el paseo.
  let mejor = l[0], cuantos = -1;
  for (const a of l) {
    const n = l.filter((b) => Math.hypot(b.escena[0] - a.escena[0], b.escena[2] - a.escena[2]) < 10).length;
    if (n > cuantos) { cuantos = n; mejor = a; }
  }
  // Se planta EN el sitio del aldeano y mira al vecino más lejano del corro.
  // Apartarse cinco metros «para verlos mejor» fue el primer intento y dejó
  // la cámara dentro de una pared: el suelo de Gate City no es un descampado.
  const vecinos = l.filter((b) => b !== mejor &&
    Math.hypot(b.escena[0] - mejor.escena[0], b.escena[2] - mejor.escena[2]) < 10);
  // Y al MÁS CERCANO, no al más lejano: el corro está dentro del pueblo y a
  // diez metros casi siempre hay una casa en medio. Mirando al de al lado,
  // sale él y salen los de detrás.
  const cerca = vecinos.sort((a, b) =>
    Math.hypot(a.escena[0] - mejor.escena[0], a.escena[2] - mejor.escena[2]) -
    Math.hypot(b.escena[0] - mejor.escena[0], b.escena[2] - mejor.escena[2]))[0] ?? mejor;
  window.probe.mundo.poner(mejor.escena[0], mejor.escena[1] + 0.2, mejor.escena[2]);
  window.probe.mundo.mirar(cerca.escena[0], cerca.escena[1] + 0.9, cerca.escena[2]);
  return { quien: mejor.nombre, vecinos: cuantos, mirandoA: cerca.nombre };
});
console.log(`  foto: junto a ${donde?.quien} y ${(donde?.vecinos ?? 1) - 1} vecinos, mirando a ${donde?.mirandoA}`);
await pag.waitForTimeout(600);
await pag.screenshot({ path: "build/gatecity/vistas/mundo-pueblo.png" });

// ── 3 ter. EL GOBLIN REACCIONA AL ACERCARTE, SIN LLAMAR A NADIE ──────────
//
// El control que de verdad cierra la queja, y el que faltaba: las sondas de
// la IA llaman a `probe.ia.correr()`, que mete a los bichos a pensar **a
// mano**. Con el interruptor en `false` esas sondas pasaban igual y el juego
// seguía muerto. Aquí no se llama a nada: se aparece al lado de un goblin y
// se esperan seis segundos de reloj de pared.
const solo = await pag.evaluate(() => {
  // Y NO SE COGE UNO DORMIDO (59). Un bicho fuera del área activa no piensa,
  // así que «no reaccionó» mediría el sueño y no la IA. Este control salía
  // rojo una vez de cada dos por eso, que es tan inútil como un verde vacío.
  const todos = window.probe.ia.censo().lista;
  const h = todos.filter((b) => b.hostil && !b.dormido);
  if (!h.length) return { vacio: true, hostiles: todos.filter((b) => b.hostil).length };
  // Se le para el PASEO al pueblo, y sólo el paseo. Lo que aquí se mide es si
  // la caza arranca sola; con el goblin andándose sus seis metros mientras
  // esperamos, lo que se mide es si le apetece quedarse — y sale rojo una vez
  // de cada tres. Apagar `roam` no le dice a nadie que cace: la caza es lo
  // único que sigue encendido, que es justo lo que este control pregunta.
  window.probe.vivo.congelarPaseo(true);
  // Ocho rumbos y el primero desde el que el goblin ve al jugador, igual que
  // en `sonda:ia`: a siete metros dentro de una cueva casi cualquier rumbo da
  // una pared, y entonces «no reacciona» mide la geometría y no la IA.
  //
  // Y se prueban TODOS los hostiles y no sólo el primero. Con el pueblo quieto
  // bastaba con el 0, porque estaba donde lo puso el mapa; desde que pasean,
  // el 0 puede haber acabado en un rincón desde el que ninguno de los ocho
  // rumbos tiene línea de visión, y entonces el control vuelve a medir la
  // geometría. Se para en el primer goblin que de verdad vea al jugador.
  // Los índices de `irA`/`ve`/`estado` van sobre TODOS los hostiles, dormidos
  // incluidos, así que se recorre esa lista y se saltan los dormidos.
  const indices = todos.map((b, k) => [b, k]).filter(([b]) => b.hostil)
    .map(([b], k) => [b, k]).filter(([b]) => !b.dormido).map(([, k]) => k);
  let cual = indices[0] ?? 0, visto = false;
  for (const n of indices) {
    if (visto) break;
    for (let k = 0; k < 8 && !visto; k++) {
      window.probe.ia.irA(n, 7, (k * Math.PI) / 4);
      if (window.probe.ia.ve(n)) { cual = n; visto = true; }
    }
  }
  return {
    quien: window.probe.ia.estado(cual)?.nombre ?? "?", cual, visto,
    despiertos: h.length, hostiles: todos.filter((b) => b.hostil).length,
    atacantes: window.probe.ia.atacantes().length, golpes: window.probe.ia.golpes,
  };
});
await pag.waitForTimeout(6000);
const luego = await pag.evaluate((n) => ({
  atacantes: window.probe.ia.atacantes(),
  golpes: window.probe.ia.golpes,
  estado: window.probe.ia.estado(n),
}), solo?.cual ?? 0);
// Y un control para que lo de arriba no pase en vacío: si ningún hostil llega
// a ver al jugador, los dos de abajo miden la geometría del mapa y no la IA.
// El positivo de la selección: si todos los hostiles estuvieran dormidos, los
// dos controles de abajo medirían el sueño y no la IA.
control("hay hostiles DESPIERTOS a los que preguntarles",
  (solo?.despiertos ?? 0) > 0, `${solo?.despiertos} despiertos de ${solo?.hostiles} hostiles`);
control("hay un hostil con línea de visión al jugador al que mirarle la reacción",
  solo?.visto === true, `goblin ${solo?.cual}`);
console.log(`\n  6 s parado al lado de un ${solo?.quien}, sin llamar a la IA:`);
console.log(`    atacantes ${solo?.atacantes} -> ${luego.atacantes.length}, golpes ${solo?.golpes} -> ${luego.golpes}`);
console.log(`    el goblin: ${luego.estado?.intencion}, animación '${luego.estado?.animacion}'`);
control("el hostil reacciona solo, con el bucle del juego y nada más",
  luego.atacantes.length > 0, `${luego.atacantes.length} atacantes`);
control("y hace algo: persigue, busca o pega",
  ["perseguir", "buscar", "golpear"].includes(luego.estado?.intencion), `${luego.estado?.intencion}`);

// ── 4. EL SONIDO DE RECIBIR ────────────────────────────────────────────────
//
// Lo que sonaba raro: un golpe al goblin sonaba a metal. Y está BIEN — dos de
// los cinco de su `npc_struck` son de gárgola. Lo que estaba mal es que
// nosotros tocábamos el grito de dolor, que en el goblin ni siquiera está
// encendido (`NPC_USE_PAIN 0`).
const gob = await pag.evaluate(() => {
  const n = window.probe.vivo.censo().lista.findIndex((b) => b.nombre === "Goblin");
  return window.probe.vivo.sonidos(n);
});
const metal = (gob?.recibir ?? []).filter((s) => s.includes("gargoyle")).length;
console.log(`\n  el goblin al recibir: ${(gob?.recibir ?? []).length} sonidos, ${metal} de gárgola`);
console.log(`  ${JSON.stringify(gob?.recibir)}`);
control("los sonidos de recibir llegan al navegador", (gob?.recibir ?? []).length === 5,
  `${(gob?.recibir ?? []).length}`);
control("dos de los cinco son metálicos: el 40 % — no es un fallo, es el mod",
  metal === 2, `${metal} de 5`);
control("el grito de dolor NO es uno de ellos",
  !(gob?.recibir ?? []).some((s) => s.includes("pain")),
  `dolor: ${JSON.stringify(gob?.dolor)}`);
// Y el porqué de que tocarlo en cada golpe estuviera mal: en el goblin el
// sistema de dolor está apagado.
control("y el sistema de dolor del goblin está APAGADO (NPC_USE_PAIN 0)",
  gob?.usaDolor === false);
const mudos = await pag.evaluate(() => {
  const l = window.probe.vivo.censo().lista;
  let n = 0;
  for (let k = 0; k < l.length; k++) if ((window.probe.vivo.sonidos(k)?.recibir ?? []).length === 0) n++;
  return n;
});
console.log(`  bichos sin ningún sonido de recibir: ${mudos} (en el juego tampoco suenan)`);
control("y los aldeanos se quedan mudos, que es lo que hace el original",
  mudos > 0 && mudos < censo.total, `${mudos} de ${censo.total}`);

// ── 5. LO QUE VALE UN BICHO ────────────────────────────────────────────────
//
// Antes del reparto hay una cadena de ajustes que nadie ve: `npcatk_set_skill`
// corre en el `npc_post_spawn` de TODOS, mire el mapa lo que mire. Y tiene la
// errata del `expadj 1` — «1» no lleva punto, así que la línea que quería
// multiplicar por uno suma uno. El goblin de Gate City vale 26.
const vale = await pag.evaluate(() => window.probe.vivo.experiencia());
console.log(`\n  servidor: central ${vale.central ? "SÍ" : "no"}, ${vale.jugadores} jugador(es),` +
  ` ${vale.vidaTotal} de vida total -> tramo ${vale.nivelDeAjuste}`);
for (const x of vale.lista.filter((y) => y.dice > 0)) {
  console.log(`  ${String(x.nombre).padEnd(24)} su script dice ${String(x.dice).padStart(4)} -> vale ${x.vale}`);
}
control("el central arranca apagado: sin servidor central no hay economía de FuzzNet",
  vale.central === false);
control("y por eso el escalado de FuzzNet no toca nada", vale.jugadores === 1);
// Los tramos están portados enteros y aquí no se disparan, que es distinto de
// no estar: en Gate City no lo pide ningún script ni ninguna entidad del BSP.
control("en Gate City nadie pide 'set_self_adj': los tramos de vida no se disparan",
  vale.seAjustan === 0, `${vale.seAjustan} lo piden`);
control("ni hay jefes que cobren el ×4", vale.jefes === 0);
control("todos los que dan experiencia dan UNO MÁS de lo que dice su script",
  vale.conExp > 0 && vale.todosMasUno, `${vale.conExp} bichos con experiencia`);
// Y el control al revés, que es el que impide «arreglarlo» sumando a todos:
// el `if NPC_GIVE_EXP > 0` corta antes, así que el cofre y los tenderos no
// pasan a valer un punto.
control("y los que no dan ninguna siguen sin dar ninguna",
  vale.cerosQueSiguenACero, `${vale.lista.filter((x) => x.dice === 0).length} a cero`);

// ── 6. LA EXPERIENCIA QUE SE APUNTA ────────────────────────────────────────
//
// «Maté un goblin y no subió el skill de espadas». Cierto, y la razón son
// cuatro rarezas de `LearnSkill` a la vez. Lo que se mide aquí es la de fuera:
// cuántas muertes cuesta el primer punto, y que el tamaño del bicho no importa.
const antesHoja = await pag.evaluate(() => window.probe.golpe.hoja());
const power0 = antesHoja.habilidades.swordsmanship.power;
console.log(`\n  antes: swordsmanship.power ${power0.valor} con ${power0.exp} de experiencia`);

const muertes = await pag.evaluate(() => {
  const fuera = [];
  for (let n = 0; n < 6; n++) {
    const m = window.probe.golpe.matar(0);
    if (!m) break;
    const h = window.probe.golpe.hoja().habilidades.swordsmanship.power;
    fuera.push({ quien: m.nombre, valor: h.valor, exp: h.exp });
  }
  return fuera;
});
for (const [n, m] of muertes.entries()) {
  console.log(`  muerte ${n + 1}: ${m.quien.padEnd(22)} power ${m.valor}, exp ${m.exp}`);
}
control("matar da experiencia", muertes.length > 0 && muertes[0].exp > power0.exp,
  `${power0.exp} -> ${muertes[0]?.exp}`);
const subeEn = muertes.findIndex((m) => m.valor > power0.valor);
console.log(`  el primer punto llega en la muerte ${subeEn + 1}`);
// Tres, y es la cuenta del motor: la primera entrega 4 de los 4,99 que hacen
// falta (truncado a entero), la segunda el mínimo de 1 y la tercera sube.
control("el primer punto de habilidad cuesta TRES muertes, no una ni veinte",
  subeEn === 2, `llega en la ${subeEn + 1}`);
control("y al subir la experiencia se pone a cero, no se arrastra",
  subeEn >= 0 && muertes[subeEn].exp === 0, `${muertes[subeEn]?.exp}`);
// Y el sobrante se tira: el goblin da 25 y el umbral es 4,99. Si se guardara,
// una sola muerte daría para varios puntos.
control("y un solo bicho no da nunca más de un punto",
  muertes.every((m, n) => n === 0 || m.valor - (muertes[n - 1].valor) <= 1));

const despues = await pag.evaluate(() => window.probe.golpe.hoja());
console.log(`  después: swordsmanship.power ${despues.habilidades.swordsmanship.power.valor}`);

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(62)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
