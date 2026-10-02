// Sombras de geometría para el menú. La fábrica y la vegetación conservan sus
// materiales procedurales; una capa ShadowMaterial recibe el mapa de profundidad
// real de Three. Así las repisas se tapan entre sí y la torre no usa una sombra
// dibujada a mano en el suelo. La capa comparte geometría, sin copiar vértices.
import * as THREE from "three";
import { TORRE_EN, CALIDAD_MENU } from "../play/torre.js";

export function sombrasDelMenu(escena, luz) {
  const sol = new THREE.DirectionalLight(0xffffff, 1);
  sol.name = "sol-menu";
  sol.castShadow = true;
  sol.target.position.set(TORRE_EN.x, 80, TORRE_EN.z + 20);
  sol.shadow.mapSize.set(CALIDAD_MENU.mapaSombras, CALIDAD_MENU.mapaSombras);
  Object.assign(sol.shadow.camera, {
    left: -280, right: 280, top: 280, bottom: -280, near: 1, far: 1100,
  });
  sol.shadow.bias = -.0003;
  sol.shadow.normalBias = 1.5;
  const sombra = new THREE.ShadowMaterial({
    color: 0x020507, opacity: .72, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  sombra.name = "sombra-del-menu";
  // La sombra local no puede acabar con un corte rectangular sobre las
  // laderas lejanas. Se desvanece en el borde real del frustum de la luz.
  sombra.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <tonemapping_fragment>", `
      #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        vec3 coordenada=vDirectionalShadowCoord[0].xyz/vDirectionalShadowCoord[0].w;
        float borde=max(abs(coordenada.x*2.0-1.0),abs(coordenada.y*2.0-1.0));
        gl_FragColor.a*=1.0-smoothstep(.78,.98,borde);
        gl_FragColor.a*=smoothstep(.0,.05,coordenada.z)*(1.0-smoothstep(.90,1.0,coordenada.z));
      #endif
      #include <tonemapping_fragment>
    `);
  };
  const receptores = [];
  escena.traverse(o => {
    if (o.isMesh && o.material.uniforms?.direccionLuz &&
      !o.material.transparent && o.name !== "cielo") receptores.push(o);
  });
  for (const base of receptores) {
    base.castShadow = true;
    const capa = new THREE.Mesh(base.geometry, sombra);
    capa.name = "sombra-" + (base.name || "roca");
    capa.receiveShadow = true;
    capa.renderOrder = 2;
    base.add(capa);
  }
  escena.add(sol, sol.target);
  let anterior = new THREE.Vector3(Infinity, Infinity, Infinity);
  function paso() {
    const direccion = luz.direccionLuz.value;
    if (!direccion.equals(anterior)) {
      sol.position.copy(sol.target.position).addScaledVector(direccion, 550);
      sol.shadow.needsUpdate = true;
      anterior.copy(direccion);
    }
  }
  // La geometría que proyecta sombra es estática. Sólo se recalcula el mapa al
  // cambiar la luz, conservando el movimiento del agua y cielo a coste separado.
  sol.shadow.autoUpdate = false;
  paso();
  return { paso, dispose() { sol.shadow.dispose(); } };
}
