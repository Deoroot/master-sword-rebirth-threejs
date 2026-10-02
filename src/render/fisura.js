// La rotura del valle tiene paredes y salientes de verdad. La huella no es
// circular: un brazo abierto avanza hacia el mirador y otro recibe el rio.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ANCHO_BASE, TORRE_EN } from "../play/torre.js";

const BORDE = [
  [-62,-135],[-49,-150],[-39,-164],[-12,-167],[6,-172],[34,-164],
  [52,-172],[79,-157],[84,-140],[99,-123],[85,-97],[103,-77],
  [94,-51],[116,-24],[87,-5],[69,-18],[57,-8],[45,-27],
  [22,-19],[3,-10],[-26,-22],[-48,40],[-67,15],[-58,-28],
  [-58,-51],[-23,-81],[-30,-99],[-43,-117],[-49,-135],
];

// Distancia firmada a la misma huella que se usa para tallar el terreno y
// construir las paredes. El interior es negativo; no hay dos bordes distintos.
export function distanciaAFisura(x, z) {
  let dentro = false, distancia = Infinity;
  for (let i = 0, j = BORDE.length - 1; i < BORDE.length; j = i++) {
    const [ax,az] = BORDE[j], [bx,bz] = BORDE[i];
    if (((az > z) !== (bz > z)) && x < (bx-ax)*(z-az)/(bz-az)+ax) dentro = !dentro;
    const dx = bx-ax, dz = bz-az;
    const t = THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
    distancia = Math.min(distancia, Math.hypot(x-ax-t*dx,z-az-t*dz));
  }
  return distancia * (dentro ? -1 : 1);
}

function mallaDeAnillos(anillos, material, nombre, tapa = false) {
  const p = [], uv = [], indices = [], n = anillos[0].length;
  for (let j = 0; j < anillos.length; j++) for (let i = 0; i < n; i++) {
    p.push(...anillos[j][i]); uv.push(i/n,j/(anillos.length-1));
  }
  for (let j = 0; j < anillos.length-1; j++) for (let i = 0; i < n; i++) {
    const a = j*n+i, b = j*n+(i+1)%n, c = a+n, d = b+n;
    indices.push(a,b,c,b,d,c);
  }
  if (tapa) {
    const centro = anillos[0].reduce((a,v)=>a.map((x,i)=>x+v[i]/n),[0,0,0]);
    const k = p.length/3; p.push(...centro); uv.push(.5,.5);
    for(let i=0;i<n;i++) indices.push(k,(i+1)%n,i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(p,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(indices); g.computeVertexNormals();
  const m = new THREE.Mesh(g,material); m.name=nombre;
  return m;
}

function paredExterior(material, altura) {
  const contorno = [];
  for(let i=0;i<BORDE.length;i++) {
    const a=BORDE[i], b=BORDE[(i+1)%BORDE.length];
    const dx=b[0]-a[0], dz=b[1]-a[1], largo=Math.hypot(dx,dz);
    const pasos=Math.ceil(largo/2.0);
    for(let j=0;j<pasos;j++) {
      const t=j/pasos, x=a[0]+dx*t, z=a[1]+dz*t;
      // Las juntas principales siguen la fractura; los dientes pequenos
      // interrumpen el borde sin convertirlo en una corona regular.
      const d=Math.sin(t*Math.PI)*(.8*Math.sin(x*1.1+z*.37)+.4*Math.sin(z*1.9));
      contorno.push({x:x+dz/largo*d,z:z-dx/largo*d,nx:dz/largo,nz:-dx/largo});
    }
  }
  // La repisa superior vuela sobre un entrante profundo. Un heightfield por
  // si solo no puede representar esta vuelta de la pared hacia dentro.
  const capas=[[8,.08],[3,.18],[-.7,-1.7],[1.9,-5.4],[-2.2,-8.1],
    [-3.1,-11.0],[-8.2,-16.0],[-4.4,-20.5],[-9.3,-28.0],[-11,-43]];
  const anillos=capas.map(([desplazamiento,y],j)=>contorno.map(({x,z,nx,nz},i)=>{
    const rotura=Math.sin(x*.34+z*.18)*1.2+Math.sin(z*.91+x*.25)*.45;
    const d=desplazamiento+rotura*Math.sin(j/capas.length*Math.PI);
    const superior=altura(x+nx*8,z+nz*8);
    return [x+nx*d,superior+y+rotura*Math.min(1,j*.42),z+nz*d];
  }));
  // Los anillos exteriores miran hacia la cavidad.
  const m=mallaDeAnillos(anillos,material,"paredes");
  const indice=m.geometry.index;
  for(let i=0;i<indice.count;i+=3) {
    const a=indice.getX(i); indice.setX(i,indice.getX(i+2)); indice.setX(i+2,a);
  }
  m.geometry.computeVertexNormals();
  return m;
}

function pedestal(material) {
  const n=112, alturas=[.14,-1.4,-4.2,-8.7,-14.5,-22,-32,-41];
  const anchuras=[1,1.03,.98,1.10,1.16,1.24,1.35,1.46];
  const anillos=alturas.map((y,j)=>Array.from({length:n},(_,i)=>{
    const a=i/n*Math.PI*2, c=Math.cos(a), s=Math.sin(a);
    const base=ANCHO_BASE/2/Math.max(Math.abs(c),Math.abs(s));
    const irregular=1.3+.5*Math.sin(a*7+.9)+.35*Math.sin(a*13+.3);
    const radio=(base+irregular)*anchuras[j]+Math.sin(a*19+j*.7)*Math.min(1.3,j*.45);
    return [TORRE_EN.x+c*radio,y+(j?Math.sin(a*11+j*.5)*Math.min(j*.25,1.6):0),TORRE_EN.z+s*radio];
  }));
  return mallaDeAnillos(anillos,material,"cimentacion",true);
}

function fondoDeLaFisura(material) {
  // Un fondo real conserva el pozo cerrado aunque se mire entre las repisas;
  // queda enterrado bajo el terreno fuera de la huella irregular.
  const g=new THREE.PlaneGeometry(220,230,66,69);
  g.rotateX(-Math.PI/2);g.translate(20,-39,-65);
  const p=g.getAttribute("position");
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i);
    p.setY(i,-39+Math.sin(x*.19+z*.1)*.9+Math.sin(z*.31-x*.12)*.6);
  }
  g.computeVertexNormals();
  const m=new THREE.Mesh(g,material);m.name="fondo-fisura";
  return m;
}

function bruma(tiempo,luz) {
  const material=new THREE.ShaderMaterial({
    uniforms:{tiempo,...luz}, transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`varying vec2 vUv; varying vec3 vPos;
      void main(){vUv=uv; vec4 p=modelMatrix*vec4(position,1.0);vPos=p.xyz;
      gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:`uniform float tiempo; uniform vec3 luzAmbiente,luzDirecta;
      varying vec2 vUv;varying vec3 vPos;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float ruido(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.0),f.x),f.y);}
      void main(){
        vec2 p=vUv*vec2(4.0,3.0)+vec2(tiempo*.025,-tiempo*.034);
        float n=ruido(p)*.65+ruido(p*2.1)*.35;
        float borde=pow(max(0.0,1.0-length((vUv-.5)*2.0)),1.8);
        float alfa=borde*smoothstep(.2,.72,n)*.19;
        vec3 c=luzAmbiente*1.1+luzDirecta*.14;
        gl_FragColor=vec4(c,alfa);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const grupo=new THREE.Group();grupo.name="bruma";
  [[-39,-17,-48,24,16],[-43,-27,5,32,12],[65,-24,-27,40,13]].forEach(([x,y,z,w,h],i)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);
    m.position.set(x,y,z);m.rotation.y=-.16+i*.09;grupo.add(m);
  });
  return grupo;
}

function derrubios(material,altura) {
  // Fragmentos hundidos en el labio, no una corona regular alrededor de la
  // torre. Se fusionan en una sola malla y comparten su material de roca.
  const sitios=[[-66,-52,5,3,8],[-62,-39,3,2,5],[-68,-19,7,4,5],
    [-69,5,4,2,6],[-53,39,6,3,4],[-33,-22,3,2,4],
    [54,-3,7,4,6],[67,-9,4,3,7],[81,4,6,3,4],[98,-25,9,5,5],
    [-55,-79,3,2,5],[-61,-91,5,3,7],[-65,-109,4,2,5]];
  const piezas=sitios.map(([x,z,sx,sy,sz],i)=>{
    // Anclar el centro sobre terreno sólido; los extremos pueden sobresalir
    // del labio, pero ningún fragmento queda suspendido sobre la cavidad.
    for(let j=0;j<8&&distanciaAFisura(x,z)<6;j++) {
      const dx=distanciaAFisura(x+.5,z)-distanciaAFisura(x-.5,z);
      const dz=distanciaAFisura(x,z+.5)-distanciaAFisura(x,z-.5);
      const largo=Math.hypot(dx,dz)||1,paso=6-distanciaAFisura(x,z);
      x+=dx/largo*paso;z+=dz/largo*paso;
    }
    const g=new THREE.IcosahedronGeometry(1,0);
    g.scale(sx,sy,sz);g.rotateY(i*2.39);g.rotateZ(Math.sin(i)*.28);
    g.translate(x,altura(x,z)-sy*.3,z);return g;
  });
  const m=new THREE.Mesh(mergeGeometries(piezas),material);
  piezas.forEach(g=>g.dispose());m.name="derrubios";return m;
}

export function fisuraDelMenu({material,altura,tiempo,luz}) {
  const grupo=new THREE.Group(); grupo.name="fisura";
  // La base emerge de roca, sin la franja de césped que parecía una peana.
  const cimentacion=material.clone();
  cimentacion.uniforms={...material.uniforms,rocaExpuesta:{value:1}};
  grupo.add(paredExterior(material,altura),pedestal(cimentacion),fondoDeLaFisura(material),
    derrubios(cimentacion,altura),bruma(tiempo,luz));
  return grupo;
}
