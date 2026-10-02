// Cimentación y luz compartida sobre la geometría que se monta de verdad.
// La apariencia y las sombras proyectadas se comprueban en la sonda 58.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { escenaDeLaTorre } from "../src/render/torre.js";
import { TORRE_EN, ANCHO_BASE } from "../src/play/torre.js";

test("la roca sostiene las esquinas y el centro de la torre", () => {
  const fondo=escenaDeLaTorre();
  try {
    fondo.escena.updateMatrixWorld(true);
    const base=fondo.escena.getObjectByName("cimentacion");
    assert.ok(base?.isMesh);
    for(const [x,z] of [[-1,-1],[-1,1],[1,-1],[1,1],[0,0]]) {
      const r=new THREE.Raycaster(new THREE.Vector3(TORRE_EN.x+x*ANCHO_BASE/2,4,
        TORRE_EN.z+z*ANCHO_BASE/2),new THREE.Vector3(0,-1,0),0,10);
      const golpe=r.intersectObject(base,false)[0];
      assert.ok(golpe,"esquina sin soporte: "+x+","+z);
      assert.ok(Math.abs(golpe.point.y)<.5,"la cimentación debe tocar el pie de la torre");
    }
  } finally { fondo.dispose(); }
});

test("la abertura delante del edificio tiene profundidad frente a tierra firme", () => {
  const fondo=escenaDeLaTorre();
  try {
    fondo.escena.updateMatrixWorld(true);
    const valle=fondo.escena.getObjectByName("valle");
    const altura=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,80,z),
      new THREE.Vector3(0,-1,0),0,150).intersectObject(valle,true)
      .find(h=>!h.object.material.transparent)?.point.y;
    // La torre ampliada ocupa la antigua muestra. Se mide la abertura libre
    // frente a su nuevo pie, no la pendiente de la cimentación que lo sostiene.
    const tierra=altura(-100,-180), cavidad=altura(-47,0);
    assert.ok(Number.isFinite(tierra),"control positivo: hay suelo fuera de la fisura");
    assert.ok(Number.isFinite(cavidad),"se mide la cavidad, no una falta de geometría");
    assert.ok(tierra-cavidad>15,`sin profundidad: tierra ${tierra}, cavidad ${cavidad}`);
  } finally { fondo.dispose(); }
});

test("cielo, agua, valle y piedra reciben el mismo cambio de luz", () => {
  const fondo=escenaDeLaTorre();
  try {
    const piedra=fondo.escena.getObjectByName("piedra").material.uniforms;
    for(const nombre of ["cielo","terreno","cimentacion","cascada","rio"]) {
      const u=fondo.escena.getObjectByName(nombre).material.uniforms;
      assert.strictEqual(u.direccionLuz,piedra.direccionLuz,nombre);
      assert.strictEqual(u.luzDirecta,piedra.luzDirecta,nombre);
    }
    const sol=fondo.escena.getObjectByName("sol-menu");
    const antes=sol.position.clone();
    piedra.direccionLuz.value.set(.7,.6,-.3).normalize();
    fondo.paso(0);
    assert.ok(sol.position.distanceTo(antes)>50,"el sol de las sombras debe seguir el cambio");
    const direccion=sol.position.clone().sub(sol.target.position).normalize();
    assert.ok(direccion.distanceTo(piedra.direccionLuz.value)<1e-6);
  } finally { fondo.dispose(); }
});

test("se libera la textura tridimensional al destruir la escena", () => {
  const fondo=escenaDeLaTorre();
  const textura=fondo.escena.getObjectByName("cielo").material.uniforms.volumen.value;
  assert.ok(textura.isData3DTexture && textura.image.data.some(x=>x>0),
    "control positivo: hay un volumen de densidad real");
  let liberaciones=0;
  textura.addEventListener("dispose",()=>liberaciones++);
  fondo.dispose();
  assert.equal(liberaciones,1);
});

test("las dos orillas y el centro del río enlazan con el labio de la cascada", () => {
  const fondo=escenaDeLaTorre();
  try {
    const rio=fondo.escena.getObjectByName("rio").geometry.attributes.position;
    const caida=fondo.escena.getObjectByName("cascada").geometry.attributes.position;
    for(const [r,c] of [[rio.count-7,16],[rio.count-4,8],[rio.count-1,0]]) {
      const a=new THREE.Vector3().fromBufferAttribute(rio,r);
      const b=new THREE.Vector3().fromBufferAttribute(caida,c);
      assert.ok(a.distanceTo(b)<.04,`costura abierta en el salto: ${a.distanceTo(b)} m`);
    }
  } finally { fondo.dispose(); }
});
