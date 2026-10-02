// Suavizado exclusivo del menú: no modifica el contexto WebGL ni la salida
// lineal que el mapa necesita para reproducir la iluminación de GoldSrc.
import * as THREE from "three";
import { CALIDAD_MENU } from "../play/torre.js";

export function crearPasadaMenu(renderer, { muestras=CALIDAD_MENU.muestras }={}) {
  const tamano = new THREE.Vector2();
  let destino = null, salida = null, material = null, geometria = null;
  const camara = new THREE.Camera();

  function preparar() {
    if (destino) return;
    const gl = renderer.getContext();
    const flotante = renderer.extensions.has("EXT_color_buffer_float") ||
      renderer.extensions.has("EXT_color_buffer_half_float");
    const formato = flotante ? gl.RGBA16F : gl.RGBA8;
    // MAX_SAMPLES no garantiza el mismo número para cada formato. El color
    // y la profundidad tienen que admitir exactamente las mismas muestras.
    const color = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, formato, gl.SAMPLES));
    const profundidad = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES));
    const limite = Math.min(muestras, renderer.capabilities.maxSamples);
    const muestrasAdmitidas = Math.max(0, ...color.filter(n => n <= limite && profundidad.includes(n)));
    destino = new THREE.WebGLRenderTarget(1, 1, {
      type: flotante ? THREE.HalfFloatType : THREE.UnsignedByteType,
      colorSpace: THREE.LinearSRGBColorSpace,
      samples: muestrasAdmitidas,
      depthBuffer: true,
      stencilBuffer: false,
      resolveDepthBuffer: false,
      generateMipmaps: false,
    });
    destino.texture.name = "menu-color-lineal";
    // Three r170 deja los shaders del destino intermedio en espacio lineal
    // (WebGLRenderer.js, setProgram). La conversión sRGB ocurre sólo aquí.
    material = new THREE.ShaderMaterial({
      name: "menu-salida-srgb",
      uniforms: { imagen: { value: destino.texture } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv=position.xy*.5+.5;
          gl_Position=vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform sampler2D imagen;
        varying vec2 vUv;
        void main() {
          gl_FragColor=texture2D(imagen,vUv);
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.Float32BufferAttribute([
      -1, -1, 0, 3, -1, 0, -1, 3, 0,
    ], 3));
    const pantalla = new THREE.Mesh(geometria, material);
    pantalla.frustumCulled = false;
    salida = new THREE.Scene();
    salida.name = "menu-salida";
    salida.add(pantalla);
  }

  let restaurarSombras = false;
  const contextoRestaurado = () => { restaurarSombras = true; };
  renderer.domElement.addEventListener("webglcontextrestored", contextoRestaurado);

  return {
    render(escena, camaraDelMenu) {
      preparar();
      if (restaurarSombras) {
        escena.traverse(o => { if (o.shadow) o.shadow.needsUpdate = true; });
        restaurarSombras = false;
      }
      renderer.getDrawingBufferSize(tamano);
      if (destino.width !== tamano.x || destino.height !== tamano.y) {
        destino.setSize(Math.max(1, tamano.x), Math.max(1, tamano.y));
      }
      const anterior = renderer.getRenderTarget();
      const cara = renderer.getActiveCubeFace(), nivel = renderer.getActiveMipmapLevel();
      const espacio = renderer.outputColorSpace, borrar = renderer.autoClear;
      const sombras = renderer.shadowMap.enabled, tipoSombra = renderer.shadowMap.type;
      try {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.autoClear = false;
        // setRenderTarget cambia el viewport y el recorte internos a los de
        // este destino, sin modificar los ajustes del canvas compartido.
        renderer.setRenderTarget(destino);
        renderer.clear(true, true, false);
        renderer.render(escena, camaraDelMenu);
        renderer.setRenderTarget(anterior, cara, nivel);
        renderer.render(salida, camara);
      } finally {
        renderer.setRenderTarget(anterior, cara, nivel);
        renderer.outputColorSpace = espacio;
        renderer.autoClear = borrar;
        renderer.shadowMap.enabled = sombras;
        renderer.shadowMap.type = tipoSombra;
      }
    },
    dispose() {
      renderer.domElement.removeEventListener("webglcontextrestored", contextoRestaurado);
      destino?.dispose();
      geometria?.dispose();
      material?.dispose();
      destino = salida = geometria = material = null;
    },
  };
}
