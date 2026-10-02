// Efectos visibles de volumen, fisura, sombras y MSAA; no califica el arte.
// MENU58_SIN_SOMBRAS=1 rompe sólo el código servido para exigir un control rojo.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright";

const DIR=process.env.MENU_CAPTURAS || "build/menu/vistas";
const servidor=await createServer({
  server:{host:"127.0.0.1",port:0,hmr:false,watch:{ignored:["**/*"]}},logLevel:"error",
  plugins:process.env.MENU58_SIN_SOMBRAS ? [{name:"control-sin-sombras",enforce:"pre",
    transform(codigo,id) {
      if(id.replaceAll("\\","/").endsWith("/src/render/sombrasmenu.js")) {
        return codigo.replace("capa.receiveShadow = true", "capa.receiveShadow = false");
      }
    }}] : [],
});
let navegador;
try {
  await servidor.listen();
  navegador=await chromium.launch();
  const pag=await navegador.newPage({viewport:{width:960,height:600}});
  const errores=[];
  pag.on("pageerror",e=>errores.push(e.message));
  pag.on("console",m=>{
    if(m.type()==="error" && /THREE|WebGL|shader/i.test(m.text())) errores.push(m.text());
  });
  await pag.goto(`http://127.0.0.1:${servidor.httpServer.address().port}/sondas/torre.html`);
  await pag.waitForFunction(()=>window.vista?.lista);
  await pag.evaluate(()=>{
    vista.pausar(); vista.en(.5); document.querySelector("#falso").hidden=true;
  });
  const datos=await pag.evaluate(async()=>{
    const THREE=await import("/node_modules/three/build/three.module.js");
    const {crearPasadaMenu}=await import("/src/render/pasadamenu.js");
    const v=window.vista,r=v.renderer,gl=r.getContext();
    const lienzo=document.createElement("canvas");
    lienzo.width=r.domElement.width; lienzo.height=r.domElement.height;
    const g=lienzo.getContext("2d",{willReadFrequently:true});
    const foto=(pasada=v.pasada)=>{
      pasada.render(v.escena,v.camara);g.drawImage(r.domElement,0,0);
      return g.getImageData(0,0,lienzo.width,lienzo.height).data;
    };
    const diferencia=(a,b,umbral=5)=>{
      let n=0;
      for(let i=0;i<a.length;i+=4) {
        if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>umbral)n++;
      }
      return n/(a.length/4);
    };
    const original=foto(),quieto=diferencia(original,foto()),capas={};
    for(const nombre of ["fisura","cimentacion","cascada"]) {
      const o=v.escena.getObjectByName(nombre);o.visible=false;
      capas[nombre]=diferencia(original,foto());o.visible=true;
    }
    const receptores=[];
    v.escena.traverse(o=>{if(o.name.startsWith("sombra-"))receptores.push(o);});
    receptores.forEach(o=>{o.visible=false;});
    const sombras=diferencia(original,foto());
    receptores.forEach(o=>{o.visible=true;});
    const cielo=v.escena.getObjectByName("cielo");
    const densidad=cielo.material.uniforms.volumen.value;
    const guardada=densidad.image.data.slice();
    densidad.image.data.fill(0);densidad.needsUpdate=true;
    const nubes=diferencia(original,foto());
    densidad.image.data.set(guardada);densidad.needsUpdate=true;
    const luz=cielo.material.uniforms.direccionLuz.value,anterior=luz.clone();
    luz.set(.5,.45,.7).normalize();v.nubes(0);
    const contraluz=diferencia(original,foto());
    luz.copy(anterior);v.nubes(0);

    const renderOriginal=r.render;
    let muestras,formato;
    r.render=function(escena,camara) {
      if(escena===v.escena) {
        const destino=this.getRenderTarget();muestras=destino.samples;formato=destino.texture.type;
      }
      return renderOriginal.call(this,escena,camara);
    };
    foto();r.render=renderOriginal;
    const sinAA=crearPasadaMenu(r,{muestras:0});
    const suavizado=diferencia(original,foto(sinAA),2);sinAA.dispose();

    // Restauración real después de éxito y de una excepción, con estado previo
    // deliberadamente distinto del que necesita el menú.
    const estado=()=>({destino:r.getRenderTarget(),espacio:r.outputColorSpace,
      borrar:r.autoClear,sombras:r.shadowMap.enabled,tipo:r.shadowMap.type});
    const igual=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);
    const previo=estado(),destino=new THREE.WebGLRenderTarget(8,8);
    r.setRenderTarget(destino);r.outputColorSpace=THREE.LinearSRGBColorSpace;
    r.autoClear=true;r.shadowMap.enabled=false;r.shadowMap.type=THREE.BasicShadowMap;
    const exigido=estado();v.pasada.render(v.escena,v.camara);
    const restaurado=igual(exigido,estado());
    let capturada=false;
    r.render=()=>{throw new Error("fallo de render deliberado");};
    try{v.pasada.render(v.escena,v.camara);}catch(e){capturada=e.message==="fallo de render deliberado";}
    const restauradoTrasFallo=capturada&&igual(exigido,estado());r.render=renderOriginal;
    r.setRenderTarget(previo.destino);r.outputColorSpace=previo.espacio;
    r.autoClear=previo.borrar;r.shadowMap.enabled=previo.sombras;r.shadowMap.type=previo.tipo;
    destino.dispose();

    foto();
    const tiempos=[];
    for(let i=0;i<12;i++) {
      // El envío de órdenes no mide el trabajo de la GPU. La lectura fuerza
      // una imagen terminada, pero incluye copia CPU: no equivale a FPS de juego.
      await new Promise(requestAnimationFrame);
      const inicio=performance.now();foto();
      tiempos.push(performance.now()-inicio);
    }
    tiempos.sort((a,b)=>a-b);
    r.info.autoReset=false;r.info.reset();v.pasada.render(v.escena,v.camara);
    const llamadas=r.info.render.calls,triangulos=r.info.render.triangles;r.info.autoReset=true;
    const ext=gl.getExtension("WEBGL_debug_renderer_info");
    return {quieto,capas,sombras,nubes,contraluz,muestras,formato,suavizado,
      restaurado,restauradoTrasFallo,perfil:{gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):"no expuesta",
        resolucion:[lienzo.width,lienzo.height],medida:"render y lectura CPU, no FPS",
        medianaMs:tiempos[6],p90Ms:tiempos[10],llamadas,triangulos}};
  });
  console.log(JSON.stringify(datos,null,2));
  assert.equal(datos.quieto,0,"control quieto, mismo fotograma");
  // El encuadre monumental deja menos cráter expuesto. Exigir al menos un
  // 1 % del lienzo conserva una presencia visible (5760 píxeles a 960×600).
  for(const [nombre,minimo] of [["fisura",.01],["cimentacion",.002],["cascada",.00005]]) {
    assert.ok(datos.capas[nombre]>minimo,`${nombre} cambia píxeles al retirarse`);
  }
  assert.ok(datos.sombras>.005,"el mapa de sombras oscurece geometría visible");
  assert.ok(datos.nubes>.15,"vaciar la densidad elimina nubes visibles");
  assert.ok(datos.contraluz>.1,"cambiar el sol cambia la imagen");
  assert.ok(datos.muestras>0&&datos.suavizado>.0001,"MSAA cambia bordes visibles");
  assert.equal(datos.restaurado,true);assert.equal(datos.restauradoTrasFallo,true);
  assert.deepEqual(errores,[]);
  mkdirSync(DIR,{recursive:true});
  writeFileSync(`${DIR}/medidas58.json`,JSON.stringify(datos,null,2)+"\n");
  await pag.setViewportSize({width:1600,height:1000});
  await pag.evaluate(()=>vista.en(.5));
  await pag.screenshot({path:`${DIR}/escena58.png`,timeout:60000});
  await pag.goto(`http://127.0.0.1:${servidor.httpServer.address().port}/`);
  await pag.waitForFunction(()=>window.probe?.ready,null,{timeout:120000});
  await pag.evaluate(()=>window.probe.miradores.en(.5));
  await pag.screenshot({path:`${DIR}/menu58.png`,timeout:60000});
  assert.deepEqual(errores,[]);
  console.log(`Volumen, fisura, sombras, MSAA y restauración: correctos. Captura: ${DIR}/escena58.png`);
} finally {
  await navegador?.close();await servidor.close();
}
