// El directorio compartido se prepara sin depender de hornear ningún mapa.
import { resolve } from "node:path";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { rutaComun } from "../src/play/recursos.js";

export function salidaComun(...partes) { return resolve(rutaComun(...partes)); }

export function prepararComunes() {
  mkdirSync(salidaComun(), { recursive: true });
  const archivo = salidaComun("PROCEDENCIA.md");
  if (!existsSync(archivo)) writeFileSync(archivo, `# Recursos comunes de Master Sword: Rebirth

Extraídos localmente de la instalación del juego. Los manifiestos y las
secciones siguientes documentan sus fuentes y sustitutos generados.
El contenido pertenece a sus autores; esta extracción no concede permiso
de redistribución. Ver CREDITOS.md del proyecto.
`, "utf8");
}
