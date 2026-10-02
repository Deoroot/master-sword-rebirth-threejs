// Escenografia del menu: un valle con volumen, cauce y paredes de roca.
// No es un mapa jugable ni una reconstruccion topografica del cuadro. Se
// compone para el mirador: las laderas enmarcan la torre y el rio da escala.
import * as THREE from "three";
import { uniformesDeLuz } from "./luzmenu.js";
import { distanciaAFisura, fisuraDelMenu } from "./fisura.js";
import { SUPERFICIE_GLSL, controlesDeSuperficie } from "./superficiesmenu.js";
import { ANCHO_BASE } from "../play/torre.js";

function ruido(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = fx * fx * (3 - 2 * fx), b = fz * fz * (3 - 2 * fz);
  const azar = (i, j) => {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(azar(ix, iz), azar(ix + 1, iz), a),
    THREE.MathUtils.lerp(azar(ix, iz + 1), azar(ix + 1, iz + 1), a), b,
  ) * 2 - 1;
}

const suave = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const loma = (x, z, cx, cz, rx, rz, h) => h * Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));

const RUIDO_GLSL = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  return noise(p) * 0.57 + noise(p * 2.07 + 7.3) * 0.28 + noise(p * 4.23 + 19.1) * 0.15;
}`;

const VERTICE = `
varying vec3 vPos, vNormal;
varying vec2 vUv;
void main() {
  vec4 p = modelMatrix * vec4(position, 1.0);
  vPos = p.xyz; vNormal = normalize(mat3(modelMatrix) * normal); vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * p;
}`;

function materialDelSuelo(luz) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...luz,
      ...controlesDeSuperficie(),
      rocaExpuesta:{value:0},
      semianchoTorre:{value:ANCHO_BASE/2},
      musgo: { value: new THREE.Color(0x35462c) },
      pradera: { value: new THREE.Color(0xa2a167) },
      roca: { value: new THREE.Color(0x686d69) },
      aire: { value: new THREE.Color(0x738991) },
    },
    vertexShader: VERTICE,
    fragmentShader: `
      varying vec3 vPos, vNormal;
      uniform vec3 musgo, pradera, roca, aire;
      uniform vec3 direccionLuz, luzDirecta, luzAmbiente;
      uniform float rocaExpuesta,semianchoTorre;
      ${RUIDO_GLSL}
      ${SUPERFICIE_GLSL}
      void main() {
        vec3 n = normalize(vNormal);
        float manchas = fbm(vPos.xz * vec2(0.009, 0.007));
        float detalle = fbm(vPos.xz * vec2(0.37, 0.62));
        float surcos = fbm(vPos.xz * vec2(0.13, 1.7) + manchas * 2.0);
        vec3 hierba = mix(musgo, pradera, smoothstep(0.23, 0.77, manchas));
        // Las manchas grandes describen pradera; las briznas pierden contraste
        // a distancia para que las mesetas no parezcan una alfombra rugosa.
        float cerca=1.0-smoothstep(250.0,1000.0,length(vPos-cameraPosition));
        hierba *= .90 + (detalle-.5)*.30*cerca + (surcos-.5)*.12*cerca;
        SuperficieRoca piedra=rocaDelMenu(vPos,n,roca);
        float desnudo = smoothstep(0.19, 0.57, 1.0 - n.y + (detalle - 0.5) * 0.18);
        desnudo = max(desnudo, (1.0 - smoothstep(-12.0, -1.0, vPos.y)) * 0.91);
        desnudo = max(desnudo,rocaExpuesta);
        vec3 c = mix(hierba, piedra.color, desnudo);

        // Relieve fino orientado en estratos; la luz no queda uniforme entre
        // vertices aunque la malla lejana tenga pocos triangulos.
        n = normalDeRelieve(n,vPos,mix(detalle*.09,piedra.altura,desnudo));

        // La abertura del cielo, la torre y el agua comparten la direccion y
        // los colores de luz. El fondo de la grieta recibe muy poco cielo.
        float abertura = exp(-pow((vPos.z + 245.0) / 220.0, 2.0));
        float sombraCerca = mix(0.58, 1.0, smoothstep(-8.0, 120.0, -vPos.z));
        float luzDelValle = 0.42 + abertura * 0.67 + manchas * 0.15;
        float cieloVisible = mix(.07,1.0,smoothstep(-34.0,2.0,vPos.y));
        c = iluminarSuperficie(c,n,vPos,mix(.98,piedra.rugosidad,desnudo),
          mix(1.0,piedra.oclusion,desnudo))*mix(.07,1.0,cieloVisible)*luzDelValle*sombraCerca;

        // Oclusion de contacto junto al pie. Las sombras proyectadas de torre
        // y salientes se resuelven con el mapa de sombras real del menu.
        vec2 desde = vPos.xz - vec2(26.0, -120.0);
        float contacto = 1.0 - smoothstep(semianchoTorre-2.0,semianchoTorre+9.0,max(abs(desde.x),abs(desde.y)));
        c *= mix(1.0,.42,contacto);

        // El aire desatura las capas lejanas y no empasta el valle cercano.
        float distancia = length(vPos.xz - cameraPosition.xz);
        float bruma = 1.0 - exp(-max(distancia - 400.0, 0.0) * 0.00145);
        c = mix(c, aire, bruma * 0.87);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// El mismo recorrido talla el terreno y construye la superficie del agua;
// asi el rio no queda suspendido sobre las laderas ni enterrado en ellas.
function recorridoDelRio() {
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-210, 0, -1010), new THREE.Vector3(-235, 0, -780),
    new THREE.Vector3(-125, 0, -510), new THREE.Vector3(-155, 0, -390),
    new THREE.Vector3(-135, 0, -270), new THREE.Vector3(-78, 0, -190),
    new THREE.Vector3(-74,0,-148),new THREE.Vector3(-65,0,-119),
    new THREE.Vector3(-54,0,-88),new THREE.Vector3(-45,0,-62),
  ]);
  return curva.getPoints(240).map((p) => ({
    x: p.x, z: p.z, y: 0.38 + Math.max(0, -p.z - 120) * 0.003,
    ancho: 4.3 + suave(90,240,-p.z)*(1.4+ruido(p.z/68,5)*2.0)
      + loma(p.x,p.z,-145,-390,90,95,4.8),
  }));
}

function cercaDelRio(x, z, curso) {
  let mejor = Infinity, altura = 0, ancho = 4.3;
  for (let i = 1; i < curso.length; i++) {
    const a = curso[i - 1], b = curso[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (d < mejor) { mejor = d; altura = a.y + (b.y - a.y) * t;
      ancho=THREE.MathUtils.lerp(a.ancho,b.ancho,t); }
  }
  return { distancia: Math.sqrt(mejor), altura, ancho };
}

// Mesetas inclinadas con borde erosionado. La variacion actua sobre
// el contorno, no como una sucesión uniforme de bultos sobre todo el valle.
function escarpe(x,z,cx,cz,rx,rz,h,giro=0) {
  const dx=x-cx,dz=z-cz,c=Math.cos(giro),s=Math.sin(giro);
  const u=(dx*c-dz*s)/rx,v=(dx*s+dz*c)/rz;
  const contorno=Math.hypot(u,v)+ruido(x/95+8,z/110)*.18+ruido(x/32,z/46)*.045;
  const borde=(1-suave(.52,.90,contorno))*.65+(1-suave(.30,1.35,contorno))*.35;
  const cima=h*(1-.19*u+.17*ruido(x/130,z/170));
  return borde*cima;
}

function alturaSinFisura(x, z, curso) {
  const grande = ruido(x / 170, z / 210), fino = ruido(x / 32 + 3.8, z / 38);
  let y = 1.5 + grande * 1.2 + fino * 0.25;
  y += escarpe(x,z,-350,-445,235,350,56,-.28);
  y += escarpe(x,z,410,-540,280,430,78,.32);
  y += escarpe(x,z,-550,-1080,340,370,110,.25);
  y += escarpe(x,z,630,-1390,380,470,145,-.30);
  y += loma(x,z,-620,-1750,420,310,115);
  y += loma(x,z,730,-2150,500,370,160);
  y += escarpe(x,z,-140,-2600,680,390,122,.10);

  // Dos repisas cercanas, fuera del eje de la mirada; el centro queda abierto.
  y += loma(x, z, -125, 15, 43, 65, 19);
  y += loma(x, z, 126, 4, 49, 68, 20);
  y += loma(x,z,-285,210,105,125,50);
  y += loma(x,z,255,190,100,130,44);
  const repisas = suave(-130, 5, z) * suave(58, 125, Math.abs(x - 18));
  y += repisas * (ruido(x / 12, z / 18) * 3.0 + ruido(x / 4, z / 7) * 1.2);
  if (z < -80) {
    const rio = cercaDelRio(x, z, curso);
    // El rio ocupa una vega ancha antes de tallar su cauce. Sin esta
    // transicion el muestreo lejano abrira una zanja vertical en cada loma.
    const vega = 1 - suave(14, 64 + suave(200, 900, -z) * 38, rio.distancia);
    const juntoAlAgua = rio.altura + 0.75 + fino * 0.2;
    y = THREE.MathUtils.lerp(y, juntoAlAgua, vega);
    const orilla=rio.distancia/rio.ancho;
    const lecho = rio.altura - 1.6 + suave(.95,1.8,orilla)*2.2;
    y = THREE.MathUtils.lerp(y, lecho, 1 - suave(1.8,3.0,orilla));
  }
  return y;
}

function alturaDelValle(x, z, curso) {
  let y=alturaSinFisura(x,z,curso);
  const distancia=distanciaAFisura(x,z);
  const rotura=1-suave(-1.0,7.0,distancia);
  const fondo=-36+ruido(x*.16,z*.11)*2.1;
  y=THREE.MathUtils.lerp(y,fondo,rotura);
  // Solo se sostiene la huella del edificio: la meseta plana anterior se
  // sustituye por un espolon rocoso con paredes y voladizos propios.
  const pie=Math.max(Math.abs(x-26),Math.abs(z+120));
  y=THREE.MathUtils.lerp(y,.04,1-suave(ANCHO_BASE/2-1.5,ANCHO_BASE/2,pie));
  return y;
}

const DIVISIONES_X=280, DIVISIONES_Z=260;

function terreno(curso, material) {
  const nx = DIVISIONES_X, nz = DIVISIONES_Z, posiciones = [], indices = [], uv = [];
  for (let j = 0; j <= nz; j++) {
    const v = j / nz * 2 - 1;
    const z = -130 + Math.sign(v) * Math.abs(v) ** 1.6 * (v < 0 ? 3100 : 740);
    for (let i = 0; i <= nx; i++) {
      const u = i / nx * 2 - 1;
      const x = 26 + Math.sign(u) * Math.abs(u) ** 1.55 * 1700;
      posiciones.push(x, alturaSinFisura(x, z, curso), z);
      uv.push(i / nx, j / nz);
    }
  }
  // El terreno acaba en el labio. Bajar una rejilla continua dentro de la
  // rotura producia laminas que atravesaban las paredes independientes.
  // Se cortan los triangulos, conservando la rejilla original para el rio.
  const distancias=[];
  for(let i=0;i<posiciones.length;i+=3) distancias.push(distanciaAFisura(posiciones[i],posiciones[i+2])-5);
  const recortar=(triangulo)=>{
    const fuera=triangulo.map(k=>distancias[k]>=0);
    if(fuera.every(Boolean)){indices.push(...triangulo);return;}
    if(fuera.every(x=>!x))return;
    const poligono=[];
    for(let i=0;i<3;i++){
      const a=triangulo[i],b=triangulo[(i+1)%3],ad=distancias[a],bd=distancias[b];
      if(ad>=0)poligono.push(a);
      if((ad>=0)===(bd>=0))continue;
      // La distancia al poligono no es lineal junto a una esquina: biseccion
      // del segmento para que las dos caras compartan el mismo borde.
      let lo=0,hi=1;
      for(let j=0;j<11;j++){
        const t=(lo+hi)*.5;
        const x=THREE.MathUtils.lerp(posiciones[a*3],posiciones[b*3],t);
        const z=THREE.MathUtils.lerp(posiciones[a*3+2],posiciones[b*3+2],t);
        if((distanciaAFisura(x,z)>=5)===(ad>=0))lo=t;else hi=t;
      }
      const t=(lo+hi)*.5,k=posiciones.length/3;
      for(let j=0;j<3;j++)posiciones.push(THREE.MathUtils.lerp(posiciones[a*3+j],posiciones[b*3+j],t));
      uv.push(THREE.MathUtils.lerp(uv[a*2],uv[b*2],t),THREE.MathUtils.lerp(uv[a*2+1],uv[b*2+1],t));
      poligono.push(k);
    }
    for(let i=1;i<poligono.length-1;i++){
      const a=poligono[0]*3,b=poligono[i]*3,c=poligono[i+1]*3;
      const area=(posiciones[b]-posiciones[a])*(posiciones[c+2]-posiciones[a+2])
        -(posiciones[b+2]-posiciones[a+2])*(posiciones[c]-posiciones[a]);
      if(Math.abs(area)>1e-5)indices.push(a/3,b/3,c/3);
    }
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + nx + 1;
    recortar([a,b,a+1]);recortar([a+1,b,b+1]);
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometria.setIndex(indices);
  geometria.computeVertexNormals();
  const malla = new THREE.Mesh(geometria, material);
  malla.name = "terreno";
  return malla;
}

// Interpola los triangulos que se dibujan, no la funcion continua que los
// genero. A distancia un cauce estrecho puede cruzar un triangulo grande:
// pegar el agua a la malla evita las interrupciones que eso produciria.
function alturaDeLaMalla(malla) {
  const p = malla.geometry.getAttribute("position"), nx = DIVISIONES_X, nz = DIVISIONES_Z;
  const buscar = (valor, n, leer) => {
    let a = 0, b = n;
    while (b - a > 1) { const c = (a + b) >> 1; if (leer(c) > valor) b = c; else a = c; }
    return a;
  };
  return (x, z) => {
    const i = buscar(x, nx, (k) => p.getX(k));
    const j = buscar(z, nz, (k) => p.getZ(k * (nx + 1)));
    const a = j * (nx + 1) + i, b = a + nx + 1;
    const u = (x - p.getX(a)) / (p.getX(a + 1) - p.getX(a));
    const v = (z - p.getZ(a)) / (p.getZ(b) - p.getZ(a));
    return u + v <= 1
      ? p.getY(a) + (p.getY(a + 1) - p.getY(a)) * u + (p.getY(b) - p.getY(a)) * v
      : p.getY(b + 1) + (p.getY(b) - p.getY(b + 1)) * (1 - u) + (p.getY(a + 1) - p.getY(b + 1)) * (1 - v);
  };
}

function materialDelAgua(tiempo, luz, caida = false) {
  return new THREE.ShaderMaterial({
    uniforms: { tiempo, ...luz, caida: { value: caida ? 1 : 0 } },
    vertexShader: VERTICE,
    transparent: caida,
    depthWrite: !caida,
    side: THREE.DoubleSide,
    fragmentShader: `
      uniform float tiempo, caida;
      uniform vec3 direccionLuz, luzDirecta, luzAmbiente;
      varying vec3 vPos, vNormal;
      varying vec2 vUv;
      ${RUIDO_GLSL}
      void main() {
        float hilos = noise(vec2(vUv.x * 39.0, vUv.y * 5.0 + tiempo * 1.6));
        float onda = sin(vPos.z * 2.6 + vPos.x * 0.8 + tiempo * 1.1) * 0.5 + 0.5;
        vec3 vista=normalize(cameraPosition-vPos);
        float fresnel=pow(1.0-max(dot(vista,normalize(vNormal)),0.0),4.0);
        float remanso=fbm(vPos.xz*vec2(.04,.025)+vec2(tiempo*.015,0.0));
        vec3 reflejo=mix(vec3(.035,.065,.063),luzAmbiente*1.7+luzDirecta*.18,
          .25+fresnel*.45+remanso*.18);
        reflejo += pow(onda, 9.0) * .012;
        float orilla = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
        reflejo = mix(vec3(.048,.058,.039),reflejo,orilla);
        vec3 espuma = mix(luzAmbiente*1.5, luzDirecta*.28, hilos*hilos);
        float velo = smoothstep(0.0, 0.13, vUv.x) * (1.0 - smoothstep(0.87, 1.0, vUv.x));
        vec3 c = mix(reflejo, espuma, caida);
        float profundidad=mix(.09,1.0,smoothstep(-31.0,1.0,vPos.y));
        c*=mix(1.0,profundidad,caida);
        float destello=pow(max(dot(reflect(-direccionLuz,normalize(vNormal)),vista),0.0),64.0);
        c+=destello*luzDirecta*.12*(1.0-caida);
        float distancia = length(vPos.xz - cameraPosition.xz);
        // La misma bruma lineal que el terreno: un valor sRGB tratado como
        // lineal convertía el río lejano en una cinta blanca uniforme.
        c = mix(c, vec3(.171,.250,.283), (1.0 - exp(-max(distancia - 400.0, 0.0) * 0.00145)) * 0.87);
        gl_FragColor = vec4(c, mix(1.0, velo * (0.65 + hilos * 0.35) * smoothstep(-31.0,-20.0,vPos.y), caida));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function rio(curso, tiempo, altura, luz) {
  const p = [], uv = [], indices = [];
  const segmentos = 6;
  curso.forEach((a, i) => {
    const b = curso[Math.min(i + 1, curso.length - 1)], c = curso[Math.max(i - 1, 0)];
    const dx = b.x - c.x, dz = b.z - c.z, largo = Math.hypot(dx, dz);
    const ancho = a.ancho;
    for (let j = 0; j <= segmentos; j++) {
      const lado = j / segmentos * 2 - 1;
      // Cada orilla rompe su contorno de forma distinta; el labio conserva
      // el ancho exacto de la cascada y no deja una costura en el salto.
      const irregular=1+ruido(a.z*.09,lado>0?3:17)*.16*suave(65,115,-a.z);
      const x = a.x - dz / largo * ancho * lado*irregular, z = a.z + dx / largo * ancho * lado*irregular;
      p.push(x, Math.max(a.y, altura(x, z) + 0.20), z);
      uv.push(j / segmentos, i / (curso.length - 1));
    }
    if (i < curso.length - 1) for (let j = 0; j < segmentos; j++) {
      const k = i * (segmentos + 1) + j, n = k + segmentos + 1;
      indices.push(k, n, k + 1, k + 1, n, n + 1);
    }
  });
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  geometria.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometria.setIndex(indices); geometria.computeVertexNormals();
  const malla = new THREE.Mesh(geometria, materialDelAgua(tiempo,luz));
  malla.name = "rio";
  return malla;
}

function cascada(tiempo,luz,curso,altura) {
  const g = new THREE.PlaneGeometry(curso.at(-1).ancho*2, 31, 16, 30);
  const p = g.getAttribute("position"), uv = g.getAttribute("uv");
  const a=curso.at(-1),b=curso.at(-2),largo=Math.hypot(a.x-b.x,a.z-b.z);
  const dx=(a.x-b.x)/largo,dz=(a.z-b.z)/largo;
  for (let i = 0; i < p.count; i++) {
    const t = 1 - uv.getY(i);
    const lado=p.getX(i)*(1+t*.15), avance=t*10+t*t*4;
    const orilla=p.getX(i),x=a.x+orilla*dz,z=a.z-orilla*dx;
    const labio=Math.max(a.y,altura(x,z)+.20);
    p.setXYZ(i,a.x+lado*dz+avance*dx,labio+.01-t*31,a.z-lado*dx+avance*dz);
  }
  g.computeVertexNormals();
  const malla = new THREE.Mesh(g, materialDelAgua(tiempo,luz,true));
  malla.name = "cascada";
  return malla;
}

function rocas(curso, material) {
  const grupo = new THREE.Group();
  grupo.name = "rocas";
  const sitios = [
    [-165,80,20,14,22],[130,50,17,13,19],[-155,93,8,6,10],
    [-109, -23, 17, 7, 12],
    [127, 16, 18, 10, 14], [-68, -87, 9, 5, 8],
    [-55,-74,4.1,3.4,3.7],[-74,-118,5,3.8,5],[-57,-126,3.1,2.4,4.6],
    [90,-24,7,6.4,5],[71,-7,8.3,4.7,6.4],[106,-43,3.7,4.4,3.6],
    [-94,-13,3.8,2.6,3.4],[-106,-31,4.4,2.8,5.7],
  ];
  sitios.forEach(([x, z, sx, sy, sz], k) => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      const a = p.getX(i), b = p.getY(i), c = p.getZ(i);
      const irregular = 1 + ruido(a * 3 + k * 7, c * 3 + b) * 0.24;
      p.setXYZ(i, a * sx * irregular, b * sy * irregular, c * sz * irregular);
      // Normales continuas: recalcular por triangulo en esta geometria sin
      // indices convertiria cada roca en un poliedro de caras independientes.
      const normal = new THREE.Vector3(a / sx, b / sy, c / sz).normalize();
      n.setXYZ(i, normal.x, normal.y, normal.z);
    }
    const malla = new THREE.Mesh(g, material);
    malla.position.set(x, alturaDelValle(x, z, curso) - sy * 0.65, z);
    malla.rotation.y = k * 1.47;
    grupo.add(malla);
  });
  return grupo;
}

export function valleDelMenu({luz=uniformesDeLuz()}={}) {
  const grupo = new THREE.Group();
  grupo.name = "valle";
  const tiempo = { value: 0 }, curso = recorridoDelRio(), material = materialDelSuelo(luz);
  const suelo = terreno(curso, material);
  const alturaAgua=alturaDeLaMalla(suelo);
  const fisura=fisuraDelMenu({material,altura:(x,z)=>alturaSinFisura(x,z,curso),tiempo,luz});
  grupo.add(suelo, rio(curso, tiempo, alturaAgua,luz), cascada(tiempo,luz,curso,alturaAgua), rocas(curso, material),fisura);
  return { grupo, paso(dt = 0) { tiempo.value += dt; } };
}
