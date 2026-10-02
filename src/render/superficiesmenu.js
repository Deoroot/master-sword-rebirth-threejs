// Relieve y respuesta de superficies del menú. El relieve modifica normales,
// no la silueta. La luz del cielo es una aproximación hemisférica, sin cubemap.
export function controlesDeSuperficie() {
  return {
    relieveMaterial: { value: 1 },
    variacionMaterial: { value: 1 },
    acabadoMaterial: { value: 1 },
  };
}

export const SUPERFICIE_GLSL = `
uniform float relieveMaterial, variacionMaterial, acabadoMaterial;
float sHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float sRuido(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(sHash(i),sHash(i+vec2(1,0)),f.x),
    mix(sHash(i+vec2(0,1)),sHash(i+1.0),f.x),f.y);
}
float sFbm(vec2 p) {
  return sRuido(p)*.57+sRuido(p*2.13+13.7)*.28+sRuido(p*4.31+7.9)*.15;
}
// Gradiente de altura en la superficie, en coordenadas mundiales. Se calcula
// antes de cualquier bifurcación; las derivadas son válidas en todo el quad.
vec3 normalDeRelieve(vec3 n,vec3 p,float altura) {
  vec3 dx=dFdx(p),dy=dFdy(p);
  vec3 rx=cross(dy,n),ry=cross(n,dx);
  float det=dot(dx,rx);
  vec3 gradiente=(dFdx(altura)*rx+dFdy(altura)*ry)*sign(det);
  return normalize(max(abs(det),.0000001)*n-gradiente*relieveMaterial);
}
vec3 iluminarSuperficie(vec3 color,vec3 n,vec3 p,float rugosidad,float oclusion) {
  vec3 l=normalize(direccionLuz),v=normalize(cameraPosition-p),h=normalize(l+v);
  float nl=max(dot(n,l),0.0),nv=max(dot(n,v),.001),nh=max(dot(n,h),0.0);
  float rug=mix(.9,clamp(rugosidad,.24,.98),acabadoMaterial);
  // Filtrado de reflejos sobre normales que varían más rápido que un píxel.
  vec3 variacionNormal=fwidth(n);
  rug=min(.98,rug+min(.3,dot(variacionNormal,variacionNormal)*.4));
  float a2=pow(rug,4.0),d=nh*nh*(a2-1.0)+1.0;
  float distribucion=a2/(3.14159265*d*d);
  float k=pow(rug+1.0,2.0)/8.0;
  float geometria=(nv/(nv*(1.0-k)+k))*(nl/(nl*(1.0-k)+k));
  vec3 fresnel=vec3(.04)+vec3(.96)*pow(1.0-max(dot(v,h),0.0),5.0);
  vec3 especular=fresnel*distribucion*geometria/max(4.0*nv*nl,.001);
  // Luz difusa amplia del cielo visible: permite leer el relieve a contraluz.
  float cielo=.48+.48*max(n.y,0.0)+.72*max(dot(n,normalize(vec3(-.45,.8,.4))),0.0);
  vec3 difusa=color*(luzDirecta*nl+luzAmbiente*cielo*1.45);
  vec3 reflejo=reflect(-v,n);
  float cieloReflejado=mix(.35,smoothstep(-.2,.8,reflejo.y),1.0-rug*.75);
  float fresnelCielo=.04+.35*pow(1.0-nv,5.0);
  vec3 ambienteEspecular=luzAmbiente*4.0*cieloReflejado*fresnelCielo*(1.0-rug*.65);
  return difusa*oclusion+(luzDirecta*especular*nl+ambienteEspecular)*mix(.55,1.0,oclusion);
}
struct SuperficieRoca { vec3 color; float altura; float rugosidad; float oclusion; };
SuperficieRoca rocaDelMenu(vec3 p,vec3 n,vec3 base) {
  // Proyección continua: las vetas siguen la pared vertical, no sólo el plano XZ.
  vec3 w=pow(abs(n),vec3(4.0)); w/=max(w.x+w.y+w.z,.0001);
  float grano=sFbm(p.zy*.85)*w.x+sFbm(p.xz*.85)*w.y+sFbm(p.xy*.85)*w.z;
  float mineral=sFbm(vec2(p.x*.16+p.z*.11,p.y*.28));
  float deformacion=sFbm(p.xz*.085)*3.2;
  float estrato=p.y*.43+deformacion;
  float borde=abs(fract(estrato)-.5);
  float ancho=max(fwidth(estrato),.012);
  float junta=1.0-smoothstep(.025,.065+ancho,borde);
  float fractura=1.0-smoothstep(.03,.09+fwidth(p.x*.13+p.z*.19),
    abs(fract(p.x*.13+p.z*.19+sRuido(vec2(p.y*.19,deformacion))*.8)-.5));
  float deposito=smoothstep(.49,.72,mineral);
  float escorrentia=smoothstep(.49,.67,sFbm(vec2(p.x*.27+p.z*.19,p.y*.04)));
  vec2 distanciaAgua=(p.xz-vec2(-23.0,-81.0))/25.0;
  float salpicadura=exp(-dot(distanciaAgua,distanciaAgua));
  float mojado=clamp(max((1.0-smoothstep(-26.0,2.0,p.y))*.45,
    (escorrentia*.85+salpicadura*.5)*(1.0-smoothstep(-2.0,5.0,p.y))),0.0,1.0);
  vec3 piedra=mix(base*vec3(.66,.77,.83),base*vec3(1.32,1.11,.83),mineral);
  piedra=mix(piedra,vec3(.29,.275,.22),deposito*.34);
  piedra*=mix(.66,1.2,grano)*(1.0-junta*.38)*(1.0-fractura*.24);
  piedra*=mix(vec3(1.0),vec3(.44,.55,.58),mojado*.7);
  SuperficieRoca s;
  s.color=mix(base*.75,piedra,variacionMaterial);
  s.altura=grano*.28-junta*.13-fractura*.09;
  s.rugosidad=mix(.94,.34,mojado);
  s.oclusion=1.0-(junta*.3+fractura*.2)*variacionMaterial;
  return s;
}
`;
