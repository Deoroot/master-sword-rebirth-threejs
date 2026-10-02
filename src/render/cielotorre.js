// Nubes volumétricas del menú: densidad 3D, absorción y tres muestras hacia el
// sol compartido. La textura de densidad se genera al arrancar, sin assets.
// El número de pasos es ajustable; no depende de la calidad de los mapas BSP.
import * as THREE from "three";
import { uniformesDeLuz } from "./luzmenu.js";
import { CALIDAD_MENU } from "../play/torre.js";

function volumenDeNubes() {
  const lado=64, datos=new Uint8Array(lado**3*2);
  const h=(x,y,z,n)=>{
    let s=Math.imul(x&(n-1),374761393)^Math.imul(y&(n-1),668265263)^Math.imul(z&(n-1),1274126177);
    s=Math.imul(s^(s>>>13),1274126177);
    return ((s^(s>>>16))>>>0)/4294967295;
  };
  const ruido=(x,y,z,n)=>{
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
    let a=x-ix,b=y-iy,c=z-iz;
    a=a*a*(3-2*a); b=b*b*(3-2*b); c=c*c*(3-2*c);
    const m=(u,v,t)=>u+(v-u)*t;
    return m(m(m(h(ix,iy,iz,n),h(ix+1,iy,iz,n),a),
      m(h(ix,iy+1,iz,n),h(ix+1,iy+1,iz,n),a),b),
      m(m(h(ix,iy,iz+1,n),h(ix+1,iy,iz+1,n),a),
      m(h(ix,iy+1,iz+1,n),h(ix+1,iy+1,iz+1,n),a),b),c);
  };
  // Distancia celular: lóbulos redondeados con bordes distintos del ruido
  // interpolado que decide la cobertura. Ambas señales repiten sin costura.
  const lobulos=(x,y,z)=>{
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
    let menor=4;
    for(let dz=-1;dz<=1;dz++) for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      const a=ix+dx,b=iy+dy,c=iz+dz;
      const px=a+.18+h(a,b,c,8)*.64;
      const py=b+.18+h(a+29,b+13,c+7,8)*.64;
      const pz=c+.18+h(a+11,b+37,c+19,8)*.64;
      menor=Math.min(menor,(x-px)**2+(y-py)**2+(z-pz)**2);
    }
    return Math.max(0,1-Math.sqrt(menor));
  };
  let i=0;
  for(let z=0;z<lado;z++) for(let y=0;y<lado;y++) for(let x=0;x<lado;x++) {
    let valor=0;
    for(const [periodo,peso] of [[4,.65],[8,.25],[16,.10]]) {
      valor+=ruido((x+.5)/lado*periodo,(y+.5)/lado*periodo,(z+.5)/lado*periodo,periodo)*peso;
    }
    datos[i++]=Math.round(valor*255);
    datos[i++]=Math.round(lobulos((x+.5)/lado*8,(y+.5)/lado*8,(z+.5)/lado*8)*255);
  }
  const t=new THREE.Data3DTexture(datos,lado,lado,lado);
  t.name="densidad-nubes"; t.format=THREE.RGFormat;
  t.minFilter=t.magFilter=THREE.LinearFilter;
  t.wrapS=t.wrapT=t.wrapR=THREE.RepeatWrapping;
  t.unpackAlignment=1; t.needsUpdate=true;
  return t;
}

const VERTEX=`
varying vec3 vDireccion;
void main() {
  vDireccion=(modelMatrix*vec4(position,1.0)).xyz-cameraPosition;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;
const FRAGMENT=`
precision highp float;
precision highp sampler3D;
varying vec3 vDireccion;
uniform sampler3D volumen;
uniform float tiempo;
uniform int pasos;
uniform vec3 direccionLuz, luzDirecta, luzAmbiente;

float densidad(vec3 p) {
  float altura=(p.y-430.0)/370.0;
  float perfil=smoothstep(0.0,.17,altura)*(1.0-smoothstep(.57,1.0,altura));
  vec3 viento=vec3(tiempo*1.3,0.0,tiempo*.35);
  vec3 q=(p+viento)/vec3(2300.0,1000.0,2100.0);
  float n=texture(volumen,q+vec3(.23,.17,.51)).r;
  vec2 detalle=texture(volumen,q*2.17+vec3(.61,.39,.07)).rg;
  float erosion=detalle.r*.30+detalle.g*.70;
  // Bancos anchos componen el cielo; el volumen rompe sus contornos y talla
  // huecos menores. La abertura queda fija en la composicion, con bordes vivos.
  vec2 a=(p.xz-vec2(-40.0,-550.0))/vec2(470.0,680.0);
  a+=vec2(n-.5,erosion-.5)*.45;
  float claro=exp(-dot(a,a)*1.45);
  float banco=smoothstep(.34,.64,n);
  float masa=n*.48+banco*.30-.20-claro*.40;
  float borde=(1.0-erosion)*.27*(1.0-banco*.25);
  return max(0.0,masa-borde)*7.2*perfil;

}
void main() {
  vec3 d=normalize(vDireccion),l=normalize(direccionLuz);
  float haciaSol=max(0.0,dot(d,l));
  vec3 horizonte=vec3(.25,.31,.35)+luzAmbiente*.25;
  vec3 fondo=mix(horizonte,vec3(.115,.18,.245),smoothstep(.03,.85,d.y));
  fondo+=luzDirecta*pow(haciaSol,5.0)*.65;
  vec3 color=fondo;
  if(d.y>.025) {
    vec3 origen=cameraPosition;
    float inicio=max(0.0,(430.0-origen.y)/d.y);
    float fin=min(5600.0,(800.0-origen.y)/d.y);
    if(fin>inicio) {
      float paso=(fin-inicio)/float(pasos);
      float azar=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
      float distancia=inicio+paso*(.35+.3*azar);
      float transmision=1.0;
      vec3 energia=vec3(0.0);
      for(int i=0;i<96;i++) {
        if(i>=pasos || transmision<.025) break;
        vec3 p=origen+d*distancia;
        float masa=densidad(p);
        if(masa>.005) {
          // Tres distancias separan el borde iluminado del interior oscuro.
          float espesor=densidad(p+l*45.0)*65.0
            +densidad(p+l*140.0)*110.0+densidad(p+l*310.0)*170.0;
          float sol=exp(-espesor*.022);
          float fase=.38+pow(haciaSol,8.0)*1.05;
          float altura=smoothstep(430.0,760.0,p.y);
          vec3 cieloDifuso=mix(vec3(.085,.105,.125),vec3(.22,.25,.27),altura);
          vec3 luz=luzAmbiente*.45+cieloDifuso*.55+luzDirecta*sol*fase*.85;
          float alfa=1.0-exp(-masa*paso*.018);
          energia+=transmision*alfa*luz;
          transmision*=1.0-alfa;
        }
        distancia+=paso;
      }
      color=energia+transmision*fondo;
    }
  }
  // La bruma lejana disuelve la base de las nubes contra el horizonte.
  color=mix(horizonte,color,smoothstep(.018,.16,d.y));
  gl_FragColor=vec4(color,1.0);
  #include <colorspace_fragment>
}`;

export function cieloDelMenu({luz=uniformesDeLuz(),pasos=CALIDAD_MENU.pasosNubes}={}) {
  const material=new THREE.ShaderMaterial({
    vertexShader:VERTEX, fragmentShader:FRAGMENT,
    uniforms:{...luz,volumen:{value:volumenDeNubes()},tiempo:{value:0},
      pasos:{value:THREE.MathUtils.clamp(Math.round(pasos),12,96)}},
    side:THREE.BackSide,depthWrite:false,depthTest:false,toneMapped:false,
  });
  const malla=new THREE.Mesh(new THREE.SphereGeometry(4000,48,32),material);
  malla.name="cielo"; malla.renderOrder=-1000; malla.frustumCulled=false;
  return {malla,paso(dt=0){if(Number.isFinite(dt)&&dt>0) material.uniforms.tiempo.value+=dt;}};
}
