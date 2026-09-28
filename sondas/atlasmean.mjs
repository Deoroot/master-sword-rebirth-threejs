import { leerPng } from "../tools/png.mjs";
const a = leerPng("build/gatecity/luz.png");
let r=0,g=0,b=0,n=0, rn=0,gn=0,bn=0,nn=0;
for (let i=0;i<a.rgba.length;i+=4){ r+=a.rgba[i];g+=a.rgba[i+1];b+=a.rgba[i+2];n++;
  if(a.rgba[i]||a.rgba[i+1]||a.rgba[i+2]){rn+=a.rgba[i];gn+=a.rgba[i+1];bn+=a.rgba[i+2];nn++;} }
console.log("media del atlas entero:", (r/n).toFixed(1),(g/n).toFixed(1),(b/n).toFixed(1));
console.log("media de lo no negro  :", (rn/nn).toFixed(1),(gn/nn).toFixed(1),(bn/nn).toFixed(1), `(${(nn/n*100).toFixed(0)} % del atlas)`);
