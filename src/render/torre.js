// Escenario del menú: volumen real en primer término, cielo procedural al fondo.
// No carga contenido del juego ni comparte luces, niebla o cámara con el mapa.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ALMENA, TRAMOS, TORRE_EN, ASPILLERAS, ALTO_TORRE } from "../play/torre.js";
import { valleDelMenu } from "./valle.js";
import { cieloDelMenu } from "./cielotorre.js";
import { uniformesDeLuz } from "./luzmenu.js";
import { sombrasDelMenu } from "./sombrasmenu.js";
import { SUPERFICIE_GLSL, controlesDeSuperficie } from "./superficiesmenu.js";

export function ladoEn(y, tramos = TRAMOS) {
  if (y <= tramos[0].y) return tramos[0].lado;
  for (let i = 1; i < tramos.length; i++) {
    if (y <= tramos[i].y) {
      const a = tramos[i - 1], b = tramos[i];
      return THREE.MathUtils.lerp(a.lado, b.lado, (y - a.y) / (b.y - a.y));
    }
  }
  return tramos.at(-1).lado;
}

// Caras hacia FUERA: el fuste del 54 tenía el orden de vértices invertido.
// Una cornisa es un cambio corto de sección, sin caras duplicadas superpuestas.
export function geometriaDelFuste(tramos = TRAMOS) {
  const pos = [], indices = [];
  const esquina = (l) => [[-l/2,-l/2],[l/2,-l/2],[l/2,l/2],[-l/2,l/2]];
  for (let i = 1; i < tramos.length; i++) {
    const a = tramos[i-1], b = tramos[i];
    const abajo = esquina(a.lado), arriba = esquina(b.lado);
    for (let c = 0; c < 4; c++) {
      const d = (c+1)%4, inicio = pos.length/3;
      pos.push(abajo[c][0],a.y,abajo[c][1], arriba[c][0],b.y,arriba[c][1],
        arriba[d][0],b.y,arriba[d][1], abajo[d][0],a.y,abajo[d][1]);
      indices.push(inicio,inicio+1,inicio+2,inicio,inicio+2,inicio+3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

const PIEDRA_VERT = `
varying vec3 vP, vN, vMundo;
void main() {
  vP=position; vN=normalize(mat3(modelMatrix)*normal);
  vMundo=(modelMatrix*vec4(position,1.0)).xyz;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;
const PIEDRA_FRAG = `
varying vec3 vP, vN, vMundo;
uniform vec3 direccionLuz, luzDirecta, luzAmbiente;
uniform vec2 cornisas;
${SUPERFICIE_GLSL}
void main() {
  vec3 n=normalize(vN);
  vec2 p=vec2(abs(n.z)>.5 ? vP.x : vP.z,vP.y);
  float fila=floor(p.y/1.15),ancho=2.1+sHash(vec2(fila,9.0))*1.1;
  vec2 s=vec2(p.x/ancho+sHash(vec2(fila,4.0))*5.0,p.y/1.15),f=fract(s);
  float bloque=sHash(floor(s));
  vec2 borde=min(f,1.0-f)*vec2(ancho,1.15);
  float desconchado=sRuido(p*2.1+7.0)*.055;
  float distancia=min(borde.x,borde.y)-desconchado;
  float aa=max(fwidth(distancia),.018);
  float bisel=smoothstep(.025,.19+aa,distancia);
  float grano=sFbm(p*1.8),mancha=sFbm(p*.07);
  float humedad=smoothstep(.43,.75,sFbm(p*vec2(.25,.018)))
    *mix(1.0,.3,smoothstep(0.0,95.0,p.y));
  // La fábrica fina sirve de escala; sólo aflora con luz rasante o desgaste.
  float legible=mix(.24,.82,max(dot(n,normalize(direccionLuz)),0.0));
  float piedraDistinta=mix(.5,bloque,legible);
  vec3 piedra=mix(vec3(.115,.137,.146),vec3(.245,.211,.156),piedraDistinta);
  piedra*=mix(.7,1.25,mancha)*mix(.76,1.15,grano);
  piedra*=mix(vec3(1.0),vec3(.42,.51,.49),humedad*.75);
  float deposito=smoothstep(.52,.72,sFbm(p*vec2(.16,.032)+11.0))
    *smoothstep(.38,.68,mancha);
  piedra=mix(piedra,vec3(.27,.263,.218),deposito*.42);
  // Escorrentía localizada bajo cornisas, con longitudes distintas; el
  // desgaste no cubre cada bloque ni dibuja una retícula nueva en la fachada.
  float reguero=smoothstep(.60,.79,sRuido(vec2(p.x*.31,19.0)));
  vec2 bajada=cornisas-vec2(p.y);
  float bajo=min(bajada.x>=0.0?bajada.x:10000.0,bajada.y>=0.0?bajada.y:10000.0);
  float escorrentia=reguero*exp(-bajo/18.0);
  float tramo=smoothstep(68.0,76.0,p.y)*(1.0-smoothstep(121.0,130.0,p.y));
  float grietaX=-17.0+sin(p.y*.24)*.48+sin(p.y*.77)*.16;
  float grieta=(1.0-smoothstep(.055,.055+max(fwidth(p.x),.09),abs(p.x-grietaX)))*tramo;
  piedra*=1.0-variacionMaterial*(escorrentia*.30+grieta*.38);
  piedra=mix(piedra*mix(vec3(1.0),vec3(.76,.79,.81),legible),piedra,bisel);
  piedra=mix(vec3(.165,.17,.16),piedra,variacionMaterial);
  float altura=(bisel*.09+grano*.025+sin(f.x*3.14)*sin(f.y*3.14)*(bloque-.5)*.035)*legible;
  n=normalDeRelieve(n,vMundo,altura);
  float rugosidad=mix(.92,.36,humedad);
  piedra=iluminarSuperficie(piedra,n,vMundo,rugosidad,mix(1.0,.8+.2*bisel,variacionMaterial));
  piedra*=mix(.64,1.0,smoothstep(0.0,23.0,vP.y));
  piedra=mix(piedra,vec3(.12,.15,.15),smoothstep(50.0,160.0,vP.y)*.025);
  gl_FragColor=vec4(piedra,1.0);
  #include <colorspace_fragment>
}`;

export function torre({ luz=uniformesDeLuz() }={}) {
  const grupo=new THREE.Group(); grupo.name="torre";
  grupo.position.set(TORRE_EN.x,0,TORRE_EN.z);
  const piezas=[geometriaDelFuste()];
  // El adarve tiene suelo: no hay una franja de cielo bajo las almenas.
  const anchoTecho=ladoEn(ALMENA.desde)-1;
  const techo=new THREE.BoxGeometry(anchoTecho,2,anchoTecho);
  techo.translate(0,ALMENA.desde-2.5,0); piezas.push(techo);
  const lado=ladoEn(ALMENA.desde),n=Math.round(lado/ALMENA.paso);
  for (let c=0;c<4;c++) {
    for (let i=0;i<=n;i++) {
      const ancho=ALMENA.paso-ALMENA.hueco;
      const g=new THREE.BoxGeometry(ancho,ALMENA.alto,ALMENA.grueso);
      // Pocas almenas pierden una esquina. La coronación permanece maciza,
      // con alturas intactas entre los daños para conservar la silueta.
      if((i+c*3)%7===2) {
        const p=g.getAttribute("position");
        for(let j=0;j<p.count;j++) if(p.getY(j)>0) {
          const corte=p.getX(j)>0 ? 2.2 : .35;
          p.setY(j,p.getY(j)-corte);
        }
        g.computeVertexNormals();
      }
      g.translate(-lado/2+ancho/2+(lado-ancho)*i/n,ALMENA.desde+ALMENA.alto/2,lado/2-ALMENA.grueso/2);
      g.rotateY(c*Math.PI/2); piezas.push(g);
    }
  }
  // La fábrica usa coordenadas del conjunto. Se fusiona para una sola llamada.
  for (const g of piezas) g.deleteAttribute("uv");
  const geo=mergeGeometries(piezas);
  piezas.forEach(g=>g.dispose());
  const cuerpo=new THREE.Mesh(geo,new THREE.ShaderMaterial({uniforms:{...luz,...controlesDeSuperficie(),
    cornisas:{value:new THREE.Vector2(TRAMOS[3].y,ALMENA.desde)}},vertexShader:PIEDRA_VERT,fragmentShader:PIEDRA_FRAG}));
  cuerpo.name="piedra"; grupo.add(cuerpo);
  const oscuro=new THREE.MeshBasicMaterial({color:0x0b100d});
  for (const a of ASPILLERAS) {
    const hueco=new THREE.Mesh(new THREE.PlaneGeometry(.48,2.1),oscuro);
    hueco.position.set(a.x,a.y,ladoEn(a.y)/2+.05); grupo.add(hueco);
  }
  const arco=new THREE.Shape();
  arco.moveTo(-1.65,0); arco.lineTo(-1.65,5.1);
  arco.quadraticCurveTo(-1.5,6.9,0,7.7); arco.quadraticCurveTo(1.5,6.9,1.65,5.1);
  arco.lineTo(1.65,0); arco.closePath();
  const puerta=new THREE.Mesh(new THREE.ShapeGeometry(arco),oscuro);
  puerta.name="puerta"; puerta.position.set(7,.1,ladoEn(0)/2+.08); grupo.add(puerta);
  const asta=new THREE.Mesh(new THREE.CylinderGeometry(.10,.14,5,5),oscuro);
  const esquina=-ladoEn(ALMENA.desde)*.38;
  asta.position.set(esquina,ALTO_TORRE+2,esquina); grupo.add(asta);
  const bandera=new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.25,10,3),new THREE.MeshBasicMaterial({color:0x384037,side:THREE.DoubleSide}));
  bandera.position.set(esquina+1.6,ALTO_TORRE+3,esquina); grupo.add(bandera);
  grupo.userData.bandera=bandera;
  return grupo;
}

export function escenaDeLaTorre() {
  const escena=new THREE.Scene();
  const luz=uniformesDeLuz();
  const cielo=cieloDelMenu({luz}),valle=valleDelMenu({luz}),edificio=torre({luz});
  escena.add(cielo.malla,valle.grupo,edificio);
  const sombras=sombrasDelMenu(escena,luz);
  let tiempo=0;
  return {
    escena,
    paso(dt=0) {
      tiempo+=Math.max(0,dt); cielo.paso(dt); valle.paso(dt);
      sombras.paso();
      const p=edificio.userData.bandera.geometry.attributes.position;
      for (let i=0;i<p.count;i++) {
        const x=p.getX(i);
        p.setZ(i,Math.sin(x*2.2-tiempo*2.5)*.24*(x+1.6)/3.2);
      }
      p.needsUpdate=true;
    },
    dispose() {
      const geometrias=new Set(),materiales=new Set(),texturas=new Set();
      escena.traverse(o=>{
        if(o.geometry) geometrias.add(o.geometry);
        for(const m of [].concat(o.material??[])) materiales.add(m);
      });
      for(const m of materiales) for(const u of Object.values(m.uniforms??{})) {
        if(u.value?.isTexture) texturas.add(u.value);
      }
      texturas.forEach(t=>t.dispose());
      geometrias.forEach(g=>g.dispose()); materiales.forEach(m=>m.dispose());
      sombras.dispose();
    },
  };
}
