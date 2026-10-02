// Se mide el efecto de las normales con albedo uniforme, para no confundir
// relieve con manchas de color. El control negativo rompe el valor por omisión.
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync} from "node:fs";
import {createServer} from "vite";
import {chromium} from "playwright";

const DIR=process.env.MENU_CAPTURAS || "build/menu/materiales/final";
const servidor=await createServer({server:{host:"127.0.0.1",port:0,
  hmr:false,watch:{ignored:["**/*"]}},logLevel:"error",
  plugins:process.env.MENU_SIN_RELIEVE ? [{name:"control-relieve",enforce:"pre",
    transform(codigo,id) {
      if(id.replaceAll("\\","/").endsWith("/src/render/superficiesmenu.js")) {
        return codigo.replace("relieveMaterial: { value: 1 }","relieveMaterial: { value: 0 }");
      }
    }}] : [],
});
let navegador;
try {
  await servidor.listen();
  const base=`http://127.0.0.1:${servidor.httpServer.address().port}`;
  navegador=await chromium.launch();
  const pag=await navegador.newPage({viewport:{width:1200,height:800}}),errores=[];
  pag.on("pageerror",e=>errores.push(e.message));
  pag.on("console",m=>{if(m.type()==="error"&&/THREE|WebGL|shader/i.test(m.text()))errores.push(m.text());});
  await pag.goto(base+"/sondas/torre.html");
  await pag.waitForFunction(()=>window.vista?.lista);
  const medidas=await pag.evaluate(()=>{
    const v=window.vista;v.pausar();v.en(.5);document.querySelector("#falso").hidden=true;
    const c=document.createElement("canvas");c.width=v.renderer.domElement.width;c.height=v.renderer.domElement.height;
    const g=c.getContext("2d",{willReadFrequently:true});
    const foto=()=>{
      v.pasada.render(v.escena,v.camara);g.drawImage(v.renderer.domElement,0,0);
      return g.getImageData(0,0,c.width,c.height).data;
    };
    const diferencia=(a,b,mascara=null)=>{
      let n=0;for(let i=0;i<a.length;i+=4) {
        if(mascara && !mascara[i/4])continue;
        if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>2)n++;
      }return n/(mascara ? Math.max(1,mascara.reduce((a,b)=>a+b,0)) : a.length/4);
    };
    const a=foto(),quieto=diferencia(a,foto()),materiales={};
    for(const nombre of ["piedra","paredes"]) {
      const objeto=v.escena.getObjectByName(nombre),u=objeto.material.uniforms;
      // Suelo y paredes comparten material. Se mide sólo la geometría visible
      // del objeto, para que la hierba no haga pasar la prueba de las paredes.
      objeto.visible=false;const sinObjeto=foto();objeto.visible=true;
      const mascara=new Uint8Array(a.length/4);
      for(let i=0;i<a.length;i+=4)mascara[i/4]=Math.max(Math.abs(a[i]-sinObjeto[i]),
        Math.abs(a[i+1]-sinObjeto[i+1]),Math.abs(a[i+2]-sinObjeto[i+2]))>2?1:0;
      const pruebas={};
      for(const clave of ["variacionMaterial","acabadoMaterial"]) {
        const original=u[clave].value;u[clave].value=0;
        pruebas[clave]=diferencia(a,foto(),mascara);u[clave].value=original;
      }
      // El relieve debe actuar también sin tintes por bloque ni humedad.
      u.variacionMaterial.value=0;u.acabadoMaterial.value=0;
      const conRelieve=foto(),valorInicial=u.relieveMaterial.value;
      u.relieveMaterial.value=0;
      pruebas.relieveSinColor=diferencia(conRelieve,foto(),mascara);
      u.relieveMaterial.value=valorInicial;
      u.variacionMaterial.value=1;u.acabadoMaterial.value=1;
      materiales[nombre]=pruebas;
    }
    return {quieto,materiales};
  });
  console.log(JSON.stringify(medidas,null,2));
  assert.equal(medidas.quieto,0,"control quieto sin ruido temporal");
  for(const [nombre,m] of Object.entries(medidas.materiales)) {
    assert.ok(m.relieveSinColor>.005,`${nombre}: el relieve cambia la luz sin variación de albedo`);
    assert.ok(m.variacionMaterial>.05,`${nombre}: la variación de material cambia píxeles`);
    assert.ok(m.acabadoMaterial>.0001,`${nombre}: el acabado húmedo cambia la reflexión`);
  }
  assert.deepEqual(errores,[]);
  mkdirSync(DIR,{recursive:true});
  writeFileSync(`${DIR}/medidas.json`,JSON.stringify(medidas,null,2)+"\n");
  await pag.setViewportSize({width:1600,height:1000});
  await pag.evaluate(()=>vista.en(.5));
  await pag.screenshot({path:`${DIR}/escena.png`});
  await pag.screenshot({path:`${DIR}/torre.png`,clip:{x:775,y:70,width:355,height:760}});
  await pag.goto(base+"/");
  await pag.waitForFunction(()=>window.probe?.ready,null,{timeout:120000});
  await pag.evaluate(()=>window.probe.miradores.en(.5));
  await pag.screenshot({path:`${DIR}/menu.png`});
  assert.deepEqual(errores,[]);
  console.log("Relieve, variación y acabado visibles. Capturas: "+DIR);
} finally {await navegador?.close();await servidor.close();}
