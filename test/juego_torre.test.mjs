// La revisión 57 sustituye las decisiones artísticas del 54, documentadas en
// doc/TORRE_54.md. Se comprueban volúmenes, encuadre y recursos reales.
// El aspecto visual y la compilación GLSL se verifican en Chromium.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { UN_HOMBRE, CAMARA_TORRE, MIRADOR_DE_LA_TORRE, fovDeLaTorre } from "../src/play/torre.js";
import { paseoDeMenu, PARALAJE } from "../src/play/miradores.js";
import { geometriaDelFuste, torre, escenaDeLaTorre } from "../src/render/torre.js";

function triangulos(geo) {
  const p = geo.attributes.position, idx = geo.index, lista = [];
  for (let i = 0; i < (idx?.count ?? p.count); i += 3) {
    lista.push([0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, idx ? idx.getX(i+k) : i+k)));
  }
  return lista;
}

// Leer el atributo normal NO caza el fallo antiguo: decía «fuera» con caras
// hacia dentro. La orientación que decide el descarte sale de los índices.
function comprobarFuste(geo) {
  const vistas = new Set();
  for (const [a,b,c] of triangulos(geo)) {
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    assert.ok(normal.lengthSq() > 1e-10, "triángulo degenerado");
    const centro = a.clone().add(b).add(c).multiplyScalar(1/3);
    assert.ok(centro.x*normal.x + centro.z*normal.z > 0, "cara del fuste invertida");
    const clave = [a,b,c].map(v => v.toArray().join(",")).sort().join(";");
    assert.ok(!vistas.has(clave), "triángulo duplicado: produce z-fighting");
    vistas.add(clave);
  }
  assert.ok(vistas.size > 0, "no pasar sobre una geometría vacía");
}
function recursos(objeto) {
  const g = new Set(), m = new Set();
  objeto.traverse(o => {
    if (o.geometry) g.add(o.geometry);
    for (const mat of [].concat(o.material ?? [])) m.add(mat);
  });
  return [...g,...m];
}
function vertices(objeto) {
  objeto.updateMatrixWorld(true);
  const puntos = [];
  objeto.traverse(o => {
    const p = o.geometry?.attributes.position;
    if (p) for (let i=0;i<p.count;i++) puntos.push(
      new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));
  });
  return puntos;
}

describe("la fábrica de la torre", () => {
  test("las paredes miran hacia fuera y ninguna se duplica o degenera", () => {
    const g = geometriaDelFuste();
    try { comprobarFuste(g); } finally { g.dispose(); }
  });
  test("CONTROL: invertir un triángulo reproduce el fallo del 54 y se detecta", () => {
    const g = geometriaDelFuste();
    try {
      comprobarFuste(g);
      const idx=g.index, a=idx.getX(0), b=idx.getX(1);
      idx.setX(0,b); idx.setX(1,a);
      assert.throws(() => comprobarFuste(g), /cara del fuste invertida/);
    } finally { g.dispose(); }
  });
  test("otro perfil también conserva paredes visibles", () => {
    const g=geometriaDelFuste([{y:0,lado:18},{y:3,lado:16},
      {y:31,lado:14},{y:32,lado:17},{y:40,lado:17}]);
    try { comprobarFuste(g); } finally { g.dispose(); }
  });
  test("el edificio tiene triángulos finitos y una entrada a escala del conjunto", () => {
    const edificio=torre();
    try {
      edificio.traverse(o => {
        if (!o.geometry) return;
        for (const [a,b,c] of triangulos(o.geometry)) {
          assert.ok([a,b,c].every(v => v.toArray().every(Number.isFinite)), "vértice no finito");
          assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-12,
            "triángulo degenerado en "+(o.name || "una pieza"));
        }
      });
      const cuerpo=edificio.getObjectByName("piedra"), puerta=edificio.getObjectByName("puerta");
      assert.ok(cuerpo?.isMesh && puerta?.isMesh, "se mide un acceso realmente montado");
      cuerpo.geometry.computeBoundingBox(); puerta.geometry.computeBoundingBox();
      const tam=cuerpo.geometry.boundingBox.getSize(new THREE.Vector3());
      const acceso=puerta.geometry.boundingBox.getSize(new THREE.Vector3());
      assert.ok(acceso.x>UN_HOMBRE*.5 && acceso.x<tam.x*.15, "puerta transitable y pequeña frente al edificio");
      assert.ok(acceso.y>UN_HOMBRE && acceso.y<tam.y*.08, "acceso con escala humana frente a la torre");
      const pie=puerta.position.y+puerta.geometry.boundingBox.min.y;
      assert.ok(Math.abs(pie-cuerpo.geometry.boundingBox.min.y)<UN_HOMBRE*.25,
        "la entrada debe empezar en el pie del edificio");
    } finally { recursos(edificio).forEach(r=>r.dispose()); }
  });
});

describe("el encuadre del volumen construido", () => {
  for (const [nombre,aspecto] of [["16:9",16/9],["4:3",4/3],["720x900",720/900]]) {
    test(nombre+": la torre cabe durante el paseo y con el ratón en las esquinas", () => {
      const edificio=torre();
      try {
        const puntos=vertices(edificio);
        assert.ok(puntos.length>0);
        for(let i=0;i<=20;i++) {
          const s=i/20;
          const desde=MIRADOR_DE_LA_TORRE.segundos*Math.acos(1-2*s)/(2*Math.PI);
          for(const x of [-1,0,1]) for(const y of [-1,0,1]) {
            const p=paseoDeMenu({mirador:MIRADOR_DE_LA_TORRE,U:1,desde,
              paralaje:{...PARALAJE,tau:0}}).avanzar(0,{raton:[x,y]});
            const c=new THREE.PerspectiveCamera(fovDeLaTorre(aspecto),aspecto,
              CAMARA_TORRE.cerca,CAMARA_TORRE.lejos);
            c.rotation.order="YXZ"; c.position.set(...p.pos);
            c.rotation.set(p.pitch,p.yaw,0); c.updateMatrixWorld(true);
            let abajo=Infinity,arriba=-Infinity;
            for(const v of puntos) {
              const q=v.clone().project(c);
              assert.ok(q.toArray().every(Number.isFinite),"proyección no finita");
              assert.ok(q.z>-1 && q.z<1,"torre fuera del plano de recorte");
              assert.ok(Math.abs(q.x)<.97 && Math.abs(q.y)<.97,
                "torre cortada en s="+s+", ratón="+x+","+y+": "+q.toArray());
              abajo=Math.min(abajo,q.y); arriba=Math.max(arriba,q.y);
            }
            assert.ok(arriba-abajo>.8,"el edificio debe ocupar al menos el 40% de la altura");
          }
        }
      } finally { recursos(edificio).forEach(r=>r.dispose()); }
    });
  }
  test("el volumen empieza en el plano del suelo y el paseo no entra en él", () => {
    const p=paseoDeMenu({mirador:MIRADOR_DE_LA_TORRE,U:1}), edificio=torre();
    try {
      const caja=new THREE.Box3().setFromObject(edificio);
      assert.ok(Math.abs(caja.min.y)<.001,"la cimentación debe estar a nivel del suelo");
      for(let i=0;i<=80;i++) {
        const a=p.avanzar(MIRADOR_DE_LA_TORRE.segundos/80);
        assert.ok(a.pos.every(Number.isFinite)&&Number.isFinite(a.yaw)&&Number.isFinite(a.pitch));
        assert.ok(!caja.containsPoint(new THREE.Vector3(...a.pos)),"cámara dentro de la torre");
      }
    } finally { recursos(edificio).forEach(r=>r.dispose()); }
  });
});

describe("la escena y sus recursos", () => {
  test("avanzar mueve la bandera sin acumular deformación ni generar vértices no finitos", () => {
    const fondo=escenaDeLaTorre();
    try {
      const bandera=fondo.escena.getObjectByName("torre").userData.bandera;
      const p=bandera.geometry.attributes.position, antes=Array.from(p.array);
      fondo.paso(1);
      const despues=Array.from(p.array);
      assert.notDeepEqual(despues,antes,"CONTROL POSITIVO: la bandera debe moverse");
      fondo.paso(0);
      assert.deepEqual(Array.from(p.array),despues,"sin tiempo no se acumula deformación");
      fondo.paso(160);
      assert.ok(vertices(fondo.escena).every(v=>v.toArray().every(Number.isFinite)),
        "el panorama completo debe conservar coordenadas finitas");
    } finally { fondo.dispose(); }
  });
  test("dispose libera cada geometría y material una vez, también los compartidos", () => {
    const fondo=escenaDeLaTorre(), lista=recursos(fondo.escena);
    const llamadas=new Map(lista.map(r=>[r,0]));
    let usos=0;
    fondo.escena.traverse(o=>{usos += [].concat(o.material??[]).length;});
    assert.ok(usos>lista.filter(r=>r.isMaterial).length,
      "CONTROL POSITIVO: hay material compartido para verificar la deduplicación");
    for(const r of lista) r.addEventListener("dispose",()=>llamadas.set(r,llamadas.get(r)+1));
    fondo.dispose();
    assert.ok(lista.length>0);
    for(const [r,n] of llamadas) assert.equal(n,1,(r.type||"geometría")+" liberada "+n+" veces");
  });
});
