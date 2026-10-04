# Experimento 96 — un personaje de pruebas «un poco avanzado»

El usuario necesitaba probar cosas de mitad de juego —la armadura del fénix, el
casco de estabilidad, armas de nivel alto— sin pasarse horas matando ratas.
Master Sword no tiene ninguna forma de hacer eso: un personaje nace con
`CreateChar()` y sube entrenando. Esto es **un atajo de pruebas nuestro**, y se
dice así en todas partes.

## Qué hace

`tools/personaje.mjs` fabrica un personaje con el **formato real** del
registro (`src/juego/personaje.js`, versión 1) y lo deja en los dos sitios
donde el juego guarda personajes:

| modo | dónde | quién lo lee |
| --- | --- | --- |
| con servidor | `build/partidas/<mapa>/personajes/pruebas-<nombre>.json` | `AlmacenArchivos` (`src/red/archivos.js`), la carpeta que abre `tools/servidor.mjs` |
| en solitario | `build/personajes/<nombre>.json`, con el envoltorio de «export» | `importar()` de `src/juego/almacen.js`, llamado desde `src/dev/personajepruebas.js` |

Se escribe con el propio `AlmacenArchivos.escribir()` —respaldo `.bak.json` y
renombrado atómico incluidos— y no con un `writeFile` propio. La forma la pone
`crearPersonaje()`; la herramienta sólo cambia habilidades, objetos, manos, oro,
vida y maná. Antes de escribir pasa el documento por `abrirPersonaje()` y se
niega si el cargador avisa de algo.

El id es fijo por nombre (`pruebas-veteran`), así que volver a generarlo **pisa**
al anterior en vez de llenar la lista. La pantalla tiene tres ranuras
(`RANURAS = 3`, `src/vgui/personaje.js:71`) ordenadas por `actualizado`, así
que el recién fabricado sale el primero.

### El personaje

| | |
| --- | --- |
| nombre | Veteran (`--nombre`), male (`--genero female`) |
| en la mano | Blood Drinker (`swords_blood_drinker`, a dos manos) |
| en la mochila | Armor of the Phoenix (`armor_pheonix55`), Helmet of Stability (`armor_helm_gray`), Dragon Axe (`axes_dragon`), Phoenix Bow (`bows_firebird`), Kharaztorant Fire Blade (`smallarms_k_fire`), y los cuatro contenedores de partida (`global.script:29`) |
| oro | 100 000 (número nuestro) |
| habilidades | swordsmanship 40/40/40, axehandling 35, archery 30, smallarms 25, parry 25, fuego 25 y las otras cuatro escuelas 5; lo demás como lo deja `CreateChar` |
| atributos (derivados) | fuerza 41, agilidad 18, concentración 32, percepción 19, forma 26, sabiduría 17 |
| vida / maná | 508 / 170, de `derivadas(atributosDe())` — la misma cuenta con la que `Sesion._recortarVitales` recortaría |
| carga | 422 de 1 050 |

Una arma por habilidad de combate, para probar espada, hacha, arco y arma
pequeña con el mismo personaje. **Ninguna habilidad pasa de 45**, que es
`CHAR_LEVEL_CAP` (cbase.h:142): es un personaje que se puede hacer entrenando.
Con más sería un personaje imposible, y probar con uno imposible mide otro
juego.

### Por qué esos números: lo que pide cada objeto

Los pide el GUION, no el catálogo. La tabla `REQUISITOS` de la herramienta los
lleva escritos a mano con su cita, y `test/personaje96.test.mjs` comprueba que
la línea citada dice ese número (cuando `../MSC/MSCScripts` está al lado). Las
rutas son de `MSCScripts/scripts/`.

| objeto | qué pide | dónde |
| --- | --- | --- |
| Armor of the Phoenix | fuerza ≥ 40 (`ARMOR_STR_REQ`); si no, `effect_slow` cada 10 s | items/armor_pheonix55.script:16, items/armor_base.script:99, :175-185 |
| | fuego ≥ 15 para convertir daño de fuego en maná | items/armor_pheonix55.script:46-48 |
| | fuego **> 20** (estricto) para activar el elemento | items/armor_pheonix55.script:91-93 |
| Blood Drinker | `skill.swordsmanship` ≥ 30 al sacarla | items/swords_blood_drinker.script:12, items/base_melee.script:70 |
| | competencia ≥ 32 y ≥ 34 para los ataques cargados | items/swords_blood_drinker.script:117, :140 |
| Dragon Axe | `skill.axehandling` ≥ 20 | items/axes_dragon.script:4 (MELEE_STAT en items/axes_greataxe.script:31) |
| | competencia ≥ 24 (reqskill 4 + 20) | items/axes_base_twohanded.script:119-121 |
| | fuego ≥ 20 para el aliento de fuego | items/axes_dragon.script:5, :53 |
| Phoenix Bow | `skill.archery` ≥ 25 | items/bows_firebird.script:6, items/base_ranged.script:67 |
| Kharaztorant Fire Blade | `skill.smallarms` ≥ 15 | items/smallarms_k_fire.script:2 |
| | competencia ≥ 19 (reqskill 4 + 15) y ≥ 17 | items/smallarms_base.script:149-151, items/smallarms_k_fire.script:128 |
| Helmet of Stability | nada | items/armor_helm_gray.script (sin `*_REQ`) |

Las habilidades de arma van **iguales en sus tres propiedades** a propósito,
porque el motor mira dos números distintos: al sacar el arma el guion pregunta
`$get(ent_owner, skill.swordsmanship)`, que es la MEDIA (`CStat::Value`, ver
`src/play/habilidad.js`), y `reg.attack.reqskill` se compara con la
COMPETENCIA, la propiedad 0 (`GetSkillStat(StatProf, PropProf)`,
giattack.cpp:313-316, con `PropProf = 0` cuando `reg.attack.stat` no nombra
propiedad, :535-545). Con las tres iguales los dos dan lo mismo.

Y la fuerza es lo que más aprieta: sale de siete habilidades divididas entre 4
(`GETSTAT`, `src/juego/stats.js`). Con espada 36 y hacha 30 daba 37 y no
llegaba a los 40 de la armadura; con 40 y 35 da 41.

## Cómo se usa

### Con servidor

```bash
npm run personaje                          # Veteran en build/partidas/gatecity/personajes/
npm run personaje -- --mapa edana          # en la carpeta de Edana
npm run servidor                           # o: npm run servidor -- --mapa edana
npm run dev
```

y en el navegador `http://localhost:5173/?red=1` (o «Find Servers», pestaña
Lan). Entras por el menú como siempre y en «Choose your character» está
**Veteran**: se pulsa la ranura y se entra. Las carpetas de personajes cuelgan
del mapa (`tools/servidor.mjs:50`), por eso `--mapa` tiene que ser el mismo en
los dos comandos.

### En solitario (sólo en desarrollo)

```bash
npm run personaje
npm run dev
```

y abre **`http://localhost:5173/?personaje=veteran`**. Al cargar, la página trae
`build/personajes/veteran.json` (lo sirve el `vite` de desarrollo, como el resto
de `build/`), lo pasa por `importar()` —el mismo lector del botón «import from a
file»— y lo escribe en el IndexedDB «mydra-personajes». Sale en la consola
`personaje de pruebas «veteran»: importado`, y en «Choose your character» está
la ranura. Con `--nombre Ana` el parámetro es `?personaje=ana`.

Por qué así y no de otra forma:

- **Node no puede escribir el IndexedDB del navegador**, así que alguien en la
  página tiene que hacerlo.
- **El botón «import from a file» ya existe, pero no se ve**: vive en la
  pantalla suplente de `src/juego/interfaz.js`, y el jugador elige personaje en
  el panel de VGUI (`src/vgui/personaje.js`), que como el original no importa
  nada. Ponerle un botón al panel del juego sería inventarse un Master Sword.
- Por eso es un **parámetro de desarrollo**: main.js sólo lo mira con
  `import.meta.env.DEV`, que Vite pone a `false` al empaquetar. Y sólo sin
  `red=`: con servidor el personaje es del servidor.

**La recarga no lo pisa.** Cambiar de mapa recarga la página conservando la URL
(main.js, `q.set("map")`), así que el `?personaje=` sobrevive. Importar en cada
carga te devolvería el oro gastado a mitad de partida. Se importa sólo si no
está en el almacén o si el fichero es **otra fabricación** (otro `creado`: cada
`npm run personaje` lo sella con la hora). Para empezar de cero: vuelve a correr
`npm run personaje` y recarga.

## Qué se midió

**`test/personaje96.test.mjs`, 13 pruebas.** Ninguna le construye al cargador el
personaje que lee (el 59): ejecutan `node tools/personaje.mjs` de verdad en una
carpeta temporal y lo que queda en el disco se abre con `AlmacenArchivos` +
`Sesion.entrar` (el camino de `Partida._elegir`) y con
`importarPersonajeDePruebas` + `importar()` + `Sesion.entrar` (el solitario).
Los requisitos se miden con `habilidadDeGuion`, que es como el puerto contesta
el `$get` de los guiones. Controles positivos: un personaje recién creado
incumple los 13 requisitos; con fuego 20 justos la armadura no cuenta y el
hacha sí; un documento con vida de más SÍ se recorta al entrar; una segunda
fabricación sí se reimporta.

**Roturas deliberadas** (comprobadas con `grep` que estaban puestas, el 80):

| rotura | resultado |
| --- | --- |
| el importador pisa siempre (sin mirar `creado`) | rojo «LA RECARGA» |
| la herramienta escribe vida + 10 | rojo en 4 pruebas — **y la del servidor siguió verde la primera vez** (ver abajo) |
| una cita apunta a la línea de al lado | rojo «LAS CITAS» |
| espada a 33 | rojo en 5 pruebas |

**El verde vacío que salió por el camino** — el de siempre, el del §4: la
prueba del servidor comparaba la vida *después de entrar* con `vidaMax`. Pero
`Sesion.entrar` recorta, así que después de entrar la vida es el máximo con la
herramienta bien y con la herramienta mal: el valor de reposo. Lo cazó la
rotura de «vida + 10». Ahora compara lo que dice **el disco** con lo que queda
dentro.

**`sondas/personaje96.mjs` (`npm run sonda:personaje96`): 15 de 15.** Entra
por el menú (`entrarPorElMenu`) y **pulsa la ranura con el ratón**:

- A, en solitario, contexto de Chromium nuevo (IndexedDB vacío) con
  `?personaje=sonda96`: importado; la ranura enseña «Sonda96»; al pulsarla se
  entra con ese personaje, 508/508 de vida y 170 de maná; con la `i`, el panel
  de inventario enseña la Blood Drinker en las manos y en el Heavy Weapon
  Holster «Armor of the Phoenix · Helmet of Stability · Dragon Axe · Phoenix
  Bow · Kharaztorant Fire Blade», y «Gold: 100000»; al recargar con la misma
  URL dice «ya estaba importado».
- B, con `tools/servidor.mjs --personajes build/partidas/sonda96/personajes`:
  la lista del servidor lo trae, al pulsarlo **el servidor** dice por
  `/costura` que ese cliente lleva `pruebas-sonda96`, el cliente tiene los 10
  objetos y el oro, y el inventario enseña lo mismo que en A.

Rotura deliberada: quitando el `almacen.escribir()` del importador, **A2 a A8
se ponen rojos (8 de 15)**. A1 —el mensaje de la consola— **sigue verde con la
rotura**, como debe: dice que se intentó, no que se guardó. Por eso no es A1 el
que demuestra nada, sino A2 (la ranura en pantalla). B no depende del
importador.

Y la vecina: `sonda:personaje30` sigue 18 de 18.

## Lo que NO funciona todavía

- **La armadura no protege.** El personaje la lleva en la mochila y su guion
  corre (`game_spawn`/`game_deploy`/`game_wear`, como todo objeto que se lleva),
  pero la protección la está portando otra sesión en el camino de daño. Lo que
  este experimento garantiza es que **la fuerza (41) y el fuego (25) ya
  cumplen lo que la armadura pide**, para que cuando proteja no haya que tocar
  el personaje.
- **«Llevarla puesta» no está en el documento.** El registro guarda
  `objetos` y `manos` y nada más: no hay campo de «vestido». Si el modelo de
  vestir que se está portando añade uno, la herramienta tendrá que ponerlo.
- **`$get(ent_owner, stat.strength)` no lo contesta el entorno de los objetos**
  (`propiedad()` en `src/play/guionobjeto.js` sólo sabe `skill.*` y unas
  pocas): la comprobación de fuerza de `armor_base` lee `""` hoy. Es de quien
  porta la armadura; se apunta aquí porque es justo el número que este
  personaje viene a cumplir.
- **Las armas de nivel alto pueden no tener modelo en la mano**: el horneado de
  armas y el render del arma en mano los amplía otra sesión.
- **Sin flechas.** El arco tira flechas gratis que no se gastan
  (giattack.cpp:1005-1017, ver `src/juego/arco.js`), así que no hacen falta para
  probarlo; las buenas se compran con el oro.

## Un hallazgo del mod

La armadura del fénix tiene un hueco en el 20 exacto:

```
if ( OWNER_SKILL < 20 ) dplayermessage ent_owner "You lack the fire skill to activate this armor's magic."
if OWNER_SKILL > 20
                                   items/armor_pheonix55.script:92-93
```

Con fuego 20 justos no sale **ni** el aviso de que te falta **ni** el efecto: la
armadura se calla. Por eso el personaje lleva 25 y la tabla marca ese requisito
como estricto. Si se porta, se porta con el hueco.

---

**Añadido al integrar el 96 (armadura):** el documento decía que el personaje no
tiene campo de «llevar puesto». Lo trajo doc/ARMADURA_96.md (`puesto: true` en
la entrada de `objetos`), y desde entonces la herramienta pone la armadura del
fénix y el casco **puestos** (`PUESTOS` en tools/personaje.mjs), porque el panel
del inventario todavía no mueve objetos. Lo mide el control A7b de la sonda
(lee `probe.armadura.puestos` y pide que el fénix haya registrado su armadura);
roto a propósito —sin la marca— sale `MAL` y 15 de 16.
