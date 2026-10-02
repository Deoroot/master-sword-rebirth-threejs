// LOS NPC OYEN LO QUE DICES — experimento 79.
//
// `catchspeech` se lee desde el experimento 43, se guarda en `entorno.frases`,
// tiene pruebas desde el 46 y **nunca ha disparado nada**. El comentario que
// vivía al lado en `npcguion.js` decía por qué: «este puerto no tiene chat de
// texto». Dejó de ser verdad en el **61**, cuando se portaron los tres canales
// del chat. Es la trampa del 64 —un comentario que envejece y nadie relee— y
// la del 66 —una regla correcta a la que no llama nadie.
//
// Lo que faltaba no es el registro: es el oído.
//
// ── EL CAMINO ENTERO, QUE SON DOS PUERTAS Y NO UNA ────────────────────────
//
//   el jugador escribe en el chat        una opción de menú de tipo `say`
//   client.cpp:468-470 / :472            msmonsterserver.cpp:2935-2937
//        │                                      │
//        └──────────► CMSMonster::Speak ◄───────┘
//                     msmonsterserver.cpp:1588
//                              │
//                     ¿SPEECH_LOCAL y el que habla es un jugador?
//                     ¿y el que escucha es un msmonster?
//                              │
//                     ┌────────┴────────┐
//                     ▼                 ▼
//             game_heardtext        HearPhrase
//             :1729-1741            :1743-1744, definido en :1752
//             (a TODOS los de        (sólo al que tenga una
//              alrededor)             frase que encaje)
//
// Las dos puertas van en ese orden y el mod lo deja dicho: «*This has to be
// called after the text msgs are sent out*».
//
// ── POR QUÉ ESTO IMPORTA EN EDANA ─────────────────────────────────────────
//
// Porque sus misiones no se contestan pulsando un botón: se contestan
// **diciendo una palabra**. Edrin ofrece «Say Hello» y la opción no lleva
// retrollamada — lo único que hace es que el jugador diga «Hello», y el
// capitán contesta porque tiene `catchspeech say_hi hi hail hello greet`. La
// sidra, el libro y las pruebas del alcalde van igual.
//
// Son **208 grupos de frases y 572 palabras en 21 de los 27 guiones de Edana**,
// y 89 grupos en 15 de los 25 de Gate City. Ninguno había sonado nunca.
//
// ── LO QUE NO SE PORTA, DICHO AQUÍ ────────────────────────────────────────
//
//   - `HasConditions(MONSTER_NOAI)`: este puerto no tiene esa bandera. El
//     equivalente que sí tiene —`sinIa`— se consulta en quien llama, no aquí.
//   - El `admin_gag`, que es de moderación del servidor y no de la regla.
//   - `StoreEntity(this, ENT_LASTSPOKE)` se hace DOS veces en el mod: una en
//     `Speak` antes del `game_heardtext` y otra dentro de `HearPhrase`. Aquí
//     se hace una, porque guarda lo mismo las dos veces y el que llama es el
//     mismo. Thothie dejó escrito al lado de la primera «*not working :(*».

/**
 * `CMSMonster::HearPhrase` — msmonsterserver.cpp:1752-1800.
 *
 * Decide QUÉ evento dispara una frase, y nada más: no habla con el guion, no
 * mira distancias y no sabe quién es el que habla. Eso es de quien llama.
 *
 * ── LAS CUATRO COSAS QUE HACE, Y TRES SORPRENDEN ──────────────────────────
 *
 * 1. **Compara en minúsculas y por SUBCADENA**, no por palabra:
 *    `if (SubPhrase = strstr(cTemp1, CheckPhrase))`. O sea que «apple» encaja
 *    dentro de «apples» y dentro de «grapple». Es a propósito —así «hello
 *    there friend» saluda— y tiene su cara b, que se porta igual.
 *
 * 2. **El bucle que cuenta caracteres no cuenta nada.** El mod escribe:
 *
 *        int Matched = 0;
 *        int len = strlen(CheckPhrase);
 *        for (int x = 0; x < len; x++)
 *            if (SubPhrase[x] == CheckPhrase[x]) Matched++;
 *        float ratio = (float)Matched / strlen(cTemp1);
 *
 *    `SubPhrase` ya es el resultado de `strstr`, así que esos caracteres son
 *    iguales **por construcción** y `Matched` acaba valiendo siempre `len`. El
 *    ratio real es **longitud de la palabra / longitud de lo que has dicho**:
 *    gana la palabra más larga en relación a la frase, y decir sólo «cider» da
 *    1,0. Se porta tal cual, con el bucle de más convertido en lo que es.
 *
 * 3. **Dentro de un grupo, el `break` corta en la PRIMERA que encaja.** Así
 *    que de `catchspeech say_hi hi hello hail greet`, si dices «hello» la que
 *    puntúa es «hello»; pero si dices «hi there hello», la que puntúa es «hi»
 *    —dos letras— porque es la primera de la lista que encaja, y el grupo se
 *    queda con ese ratio bajo. El orden en el que el guionista escribió sus
 *    palabras decide quién gana.
 *
 * 4. **Los empates los gana el primero**, porque la comparación es `>` y no
 *    `>=`: el grupo declarado antes en el guion.
 *
 * @param frases  `[{evento, palabras:[...]}, ...]` tal como las guarda
 *                `catchspeech`.
 * @param texto   lo que ha dicho el jugador, crudo.
 * @returns       `{evento, palabra, ratio}` del mejor grupo, o `null`.
 */
export function oirFrase(frases, texto) {
  // `_strlwr(cTemp1)`. Y `strncpy(cTemp1, phrase, 256)`: el mod compara sobre
  // un buffer de 256, así que una frase más larga se recorta. El cajetín del
  // chat ya topa antes (`MAX_LETRAS`), pero el recorte se escribe porque es la
  // regla y no la ventana.
  const dicho = String(texto ?? "").slice(0, 255).toLowerCase();
  if (!dicho) return null;

  let mejor = null;
  let mejorRatio = 0;

  for (const grupo of frases ?? []) {
    for (const palabra of grupo?.palabras ?? []) {
      const p = String(palabra ?? "").toLowerCase();
      // `strstr` con una aguja vacía devuelve el pajar entero, o sea que
      // encajaría siempre. `catchspeech` sin palabras no llega aquí —no añade
      // nada a la lista— pero una lista escrita a mano sí podría traerla.
      if (!p || !dicho.includes(p)) continue;
      // `(float)Matched / strlen(cTemp1)`, con `Matched == strlen(CheckPhrase)`.
      const ratio = p.length / dicho.length;
      if (ratio > mejorRatio) {
        mejorRatio = ratio;
        mejor = { evento: grupo.evento, palabra: p, ratio };
      }
      break;                                   // el `break` del mod: una por grupo
    }
  }
  return mejor;
}

// ── ¿QUIÉN TE OYE? NO SE DECIDE AQUÍ, Y ES A PROPÓSITO ───────────────────
//
//     if (SpeechType == SPEECH_LOCAL)
//         if ((pEnt->Center() - Center()).Length2D() > m_SayTextRange)
//             continue;
//                                          msmonsterserver.cpp:1712-1715
//
// Es **la misma línea** que decide si te oye otro jugador, y el 61 ya la
// portó: `distancia2D` y `RANGO_LOCAL` viven en `src/play/chat.js`. Escribir
// aquí una segunda copia sería tener dos mundos con dos alcances, que es el
// fallo del 63 con otra ropa — así que quien llame a `oirFrase` mide con
// aquélla. Lo único que esta regla añade es que el rango es **del que habla**
// (`m_SayTextRange` es `this`, 300 por omisión en `msmonstershared.cpp:458`) y
// que un guion puede cambiarse el suyo con `saytextrange`; para el jugador es
// siempre el de por omisión, porque ningún guion suyo lo toca.
//
// Y la 2D no es un descuido del port: la altura no cuenta, así que alguien
// tres pisos por encima de ti te oye hablar. Eso ya está medido desde el 61.

/**
 * `strutil::stripBadChars` — stackstring.cpp:217-236.
 *
 *     bool strutil::isBadChar(int c)
 *     { return (c == '(' || c == ')' || c == '$' || c == '¯'); }
 *
 * Cuatro caracteres, y cada uno por su razón: los paréntesis y el `$` porque
 * son la sintaxis del intérprete —`$get(...)`— y la macron porque es el
 * prefijo con el que el mod marca sus nombres internos (`"¯" + "game_master"`,
 * client.cpp:482).
 *
 * ── Y LIMPIA EL ORIGINAL, NO UNA COPIA ───────────────────────────────────
 *
 *     char* cleanData = data;        // ← el MISMO puntero
 *     while ((c = data[i++]) != '\0')
 *         if (!isBadChar(c)) cleanData[x++] = c;
 *
 * Así que la llamada de `Speak`
 *
 *     Params.add(strutil::stripBadChars(pszSentence));
 *
 * modifica `pszSentence` **para la línea de abajo también**, y `HearPhrase`
 * recibe el texto ya limpio. No es un detalle de estilo: significa que decir
 * «$apple» encaja con `catchspeech ... apple`, porque el `$` ya no está cuando
 * se compara. Si se limpiara una copia, no encajaría.
 */
export const limpiarTexto = (t) => String(t ?? "").replace(/[()$¯]/g, "");
