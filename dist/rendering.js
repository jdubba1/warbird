import * as T from './vendor/three.module.js';
import {PALETTE} from './palette.js';

// Doodle shader adapted from Evan Milenko's Doodle Shooter.
// https://doodleshooter.vercel.app/
// Modified palette, depth/normal packing, hatching, ground marks and aircraft pass.
// Graphite-and-paper renderer. World hatching stays in
// screen space; the aircraft and cockpit render separately without shading.
const screenColor=hex=>new T.Vector3(...[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
const light={value:new T.Vector3(.4,.8,.3).normalize()};
// Features are fixed in metres, so grass, stone and road marks move with
// the ground rather than sitting on the screen like the paper hatch.
const groundFeatures=`
  float groundHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float groundNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(groundHash(i),groundHash(i+vec2(1,0)),f.x),mix(groundHash(i+vec2(0,1)),groundHash(i+vec2(1,1)),f.x),f.y);
  }
  vec3 groundMarks(vec3 w){
    float landPattern=groundNoise(w.xz*.035)*.65+groundNoise(w.xz*.13)*.35;
    vec2 cell=floor(w.xz*.55),local=fract(w.xz*.55)-.5;
    float seed=groundHash(cell);
    float aa=max(fwidth(w.x)+fwidth(w.z),.015);
    float fleck=(1.0-smoothstep(.06,.16,length(local-vec2(seed-.5,fract(seed*7.0)-.5)*.55)))
      *step(.7,seed)*(1.0-smoothstep(.7,2.5,aa));
    float roadX=-190.0+210.0*sin(w.z*.0012);
    float off=abs(w.x-roadX),edge=max(fwidth(w.x-roadX),.08);
    float span=smoothstep(-3350.0,-3250.0,w.z)*(1.0-smoothstep(270.0,340.0,w.z));
    float road=(1.0-smoothstep(7.0-edge,7.0+edge,off))*span;
    float lane=(1.0-smoothstep(.22,.22+edge,off))*step(.55,fract(w.z/24.0))*road;
    return vec3(clamp((1.0-landPattern)*.32+fleck*.62,0.0,1.0),road,lane);
  }`;
const sceneVertex=`
  varying vec3 viewNormal;
  varying vec2 surfaceUV;
  varying float surfaceHeight;
  varying vec3 surfaceWorld;
  void main() {
    vec3 p=position;
    vec3 n=normal;
    #ifdef USE_INSTANCING
      mat3 basis=mat3(instanceMatrix);
      n/=vec3(dot(basis[0],basis[0]),dot(basis[1],basis[1]),dot(basis[2],basis[2]));
      n=basis*n;
      p=(instanceMatrix*vec4(p,1.0)).xyz;
    #endif
    viewNormal=normalize(normalMatrix*n);
    surfaceUV=uv;
    surfaceWorld=(modelMatrix*vec4(p,1.0)).xyz;
    surfaceHeight=surfaceWorld.y;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  }`;
const sceneFragment=`
  uniform vec3 lightDirection;
  uniform float ink;
  uniform float bias;
  uniform float fill;
  uniform float useMap;
  uniform sampler2D surfaceMap;
  uniform vec2 mapRepeat;
  uniform float mapShade;
  uniform float topo;
  uniform float hatch;
  varying vec3 viewNormal;
  varying vec2 surfaceUV;
  varying float surfaceHeight;
  varying vec3 surfaceWorld;
  GROUND_FEATURES
  vec2 packNormal(vec3 n) {
    n/=abs(n.x)+abs(n.y)+abs(n.z);
    if(n.z<0.0)n.xy=(1.0-abs(n.yx))*(step(vec2(0.0),n.xy)*2.0-1.0);
    return n.xy*.5+.5;
  }
  void main() {
    vec3 n=normalize(viewNormal);
    if(!gl_FrontFacing)n=-n;
    float tone=clamp(.42+.5*dot(n,lightDirection)+bias,.08,1.0);
    float color=ink;
    if(fill>.5)tone=0.0;
    if(useMap>.5){
      vec3 tex=texture2D(surfaceMap,surfaceUV*mapRepeat).rgb;
      float mark=1.0-smoothstep(.55,.9,dot(tex,vec3(.3,.5,.2)));
      tone=mix(mix(1.0,tone,mapShade),0.0,mark);
      if(tex.r>tex.b*1.25 && tex.r>tex.g*1.25)color=1.0;
    }
    if(topo>.5){
      vec3 marks=groundMarks(surfaceWorld);
      tone=max(0.0,tone-marks.x*.9);
      tone=mix(tone,.50,marks.y*.75);
      tone=mix(tone,.10,marks.z);

      float level=floor(surfaceHeight/20.0+.5);
      float distance=abs(surfaceHeight-level*20.0);
      float footprint=fwidth(surfaceHeight);
      float major=1.0-step(.1,mod(abs(level),5.0));
      float width=max(.3,footprint*.75)*(1.0+major*.65);
      float line=(1.0-smoothstep(width*.4,width*1.4,distance))
        *smoothstep(.02,.12,footprint)*(1.0-smoothstep(3.0,10.0,footprint));
      tone=max(0.0,mix(tone,-.12,line));
    }
    gl_FragColor=vec4(tone,(color+(hatch<.5?3.0:0.0))/8.0,packNormal(n));
  }`;

export function simMaterial(color,options={}){
  const map=options.map??null;if(map)map.wrapS=map.wrapT=T.RepeatWrapping;
  const material=new T.ShaderMaterial({
    vertexShader:sceneVertex,fragmentShader:sceneFragment.replace('GROUND_FEATURES',groundFeatures),
    uniforms:{lightDirection:light,ink:{value:options.ink??0},bias:{value:options.shadeBias??0},fill:{value:options.fill?1:0},useMap:{value:options.map?1:0},surfaceMap:{value:options.map??null},mapRepeat:{value:new T.Vector2(...(options.mapRepeat??[1,1]))},mapShade:{value:options.mapShade?1:0},topo:{value:options.topo?1:0},hatch:{value:options.hatch===false?0:1}},
    side:options.side??T.FrontSide
  });
  material.map=map;
  const natural=new T.MeshStandardMaterial({color:options.ink===1?'#bd503b':color,roughness:options.roughness??.85,metalness:options.metalness??0,map,side:options.side??T.FrontSide});
  natural.doodle=material;material.natural=natural;
  if(options.topo){
    natural.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 groundWorld;').replace('#include <project_vertex>','#include <project_vertex>\ngroundWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 groundWorld;\n'+groundFeatures).replace('#include <map_fragment>',`#include <map_fragment>
        vec3 marks=groundMarks(groundWorld);
        vec3 slopeNormal=normalize(cross(dFdx(groundWorld),dFdy(groundWorld)));
        float stone=smoothstep(.22,.65,1.0-abs(slopeNormal.y));
        vec3 soil=mix(diffuseColor.rgb,vec3(.31,.32,.29),stone);
        soil*=1.0-marks.x*.52;
        soil=mix(soil,vec3(.20,.205,.19),marks.y);
        soil=mix(soil,vec3(.62,.58,.40),marks.z);
        soil=mix(soil,vec3(.66,.67,.65),smoothstep(1050.0,1350.0,groundWorld.y)*.7);
        diffuseColor.rgb=soil;
      `);
    };
    natural.customProgramCacheKey=()=> 'rotor-ground-v09';
  }
  return material;
}
export function setAccent(material,index){const doodle=material.doodle??material;doodle.uniforms.ink.value=index;doodle.natural.color.set(index===2?'#4c965f':index===1?'#bd503b':'#3a5363');}
export function setSceneStyle(scene,style){scene.traverse(object=>{
  if(!object.isMesh)return;
  const choose=material=>{const doodle=material.doodle??material;return style==='natural'?(doodle.natural??material):doodle;};
  object.material=Array.isArray(object.material)?object.material.map(choose):choose(object.material);
});}

const paperVertex=`varying vec2 screenUV;void main(){screenUV=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const paperFragment=`
  varying vec2 screenUV;
  uniform vec3 inkColor;
  uniform vec3 accentColor;
  uniform vec3 successColor;
  uniform vec3 paperColor;
  uniform sampler2D sceneData;
  uniform sampler2D sceneDepth;
  uniform vec2 resolution;
  uniform float pixelRatio;
  uniform float nearPlane;
  uniform float farPlane;
  float noise(vec2 p){return fract(sin(dot(p,vec2(41.37,289.73)))*19153.127);}
  float depthAt(vec2 uv){float z=texture2D(sceneDepth,uv).r;return nearPlane*farPlane/(farPlane-z*(farPlane-nearPlane));}
  vec3 normalAt(vec2 encoded){
    vec2 f=encoded*2.0-1.0;
    vec3 n=vec3(f,1.0-abs(f.x)-abs(f.y));
    if(n.z<0.0)n.xy=(1.0-abs(n.yx))*(step(vec2(0.0),n.xy)*2.0-1.0);
    return normalize(n);
  }
  float inkAt(float encoded){return mod(floor(encoded*8.0+.5),3.0);}
  vec3 pen(float index){
    if(index>.5&&index<1.5)return accentColor;
    if(index>1.5)return successColor;
    return inkColor;
  }
  float stroke(float coordinate,float spacing,float width){
    float q=abs(fract(coordinate/spacing)-.5)*spacing;
    float aa=max(fwidth(coordinate)*.7,spacing*.02);
    return 1.0-smoothstep(width-aa,width+aa,q);
  }
  void main(){
    vec2 pixel=1.0/resolution;
    vec2 page=gl_FragCoord.xy/pixelRatio;
    vec2 wobble=vec2(sin(page.y*.051+sin(page.x*.022)),cos(page.x*.043+sin(page.y*.031)))*.34*pixelRatio*pixel;
    vec2 uv=screenUV+wobble;
    vec4 data=texture2D(sceneData,uv);
    float z=texture2D(sceneDepth,uv).r;
    float d=depthAt(uv);
    vec2 dx=vec2(1.15*pixelRatio*pixel.x,0.0),dy=vec2(0.0,1.15*pixelRatio*pixel.y);
    vec4 left=texture2D(sceneData,uv-dx),right=texture2D(sceneData,uv+dx),down=texture2D(sceneData,uv-dy),up=texture2D(sceneData,uv+dy);
    float dl=depthAt(uv-dx),dr=depthAt(uv+dx),dd=depthAt(uv-dy),du=depthAt(uv+dy);
    // Inverse-depth curvature avoids outlining the smooth depth gradient
    // on sloping ground, while retaining silhouettes and geometric creases.
    float curvature=abs(d/dl+d/dr-2.0)+abs(d/dd+d/du-2.0);
    float silhouette=smoothstep(.045,.20,curvature);
    float crease=length(left.ba-right.ba)+length(down.ba-up.ba);
    float edge=max(silhouette,smoothstep(.3,.72,crease))*smoothstep(1.5,3.0,d);
    float front=d,color=data.g;
    if(dl<front){front=dl;color=left.g;}if(dr<front){front=dr;color=right.g;}
    if(dd<front){front=dd;color=down.g;}if(du<front){front=du;color=up.g;}
    float hatch=0.0;
    if(z<.999999){
      float wave=sin(page.x*.09)*.35;
      // Sparse, faint pen texture instead of dense high-contrast diagonal bars.
      float h1=stroke(page.x*.78+page.y*.63+wave,12.0,.30)*.24;
      float h2=stroke(page.x*.62-page.y*.78-wave,17.0,.24)*.12;
      hatch=max(h1*(1.0-smoothstep(.48,.76,data.r)),h2*(1.0-smoothstep(.20,.43,data.r)));
      // Architecture gets a faint flat wash, never diagonal hatch bands.
      if(floor(data.g*8.0+.5)>2.5)hatch=(1.0-data.r)*.12;
      hatch=max(hatch,1.0-smoothstep(.025,.095,data.r));
    }
    float grain=(noise(page*.9)-.5)*.028+(noise(floor(page*.22))-.5)*.012;
    vec3 paper=paperColor+grain;
    float distanceFade=mix(1.0,.25,smoothstep(120.0,3200.0,d));
    vec3 result=mix(paper,pen(inkAt(data.g)),hatch*.79*distanceFade);
    result=mix(result,pen(inkAt(data.g)),(1.0-data.r)*.08*(1.0-smoothstep(150.0,1400.0,d)));
    float edgeFade=mix(1.0,.32,smoothstep(350.0,4300.0,front));
    result=mix(result,pen(inkAt(color)),edge*.94*edgeFade);
    gl_FragColor=vec4(result,1.0);
    // Preserve physical world depth for the unshaded aircraft pass. The
    // paper wobble affects ink only; occlusion uses the original pixel depth.
    gl_FragDepth=texture2D(sceneDepth,screenUV).r;
  }`;

const aircraftFragment=`
  varying vec2 screenUV;
  uniform sampler2D aircraftColor;
  uniform sampler2D aircraftDepth;
  uniform vec2 resolution;
  uniform float pixelRatio;
  uniform vec3 outlineColor;
  void main(){
    vec4 body=texture2D(aircraftColor,screenUV);
    vec2 pixel=2.5*pixelRatio/resolution;
    float coverage=body.a;
    float neighbors=0.0;
    vec2 nearest=screenUV;
    // A constant-width outer silhouette. Cabin and underside colors are copied
    // directly from the unlit pass, with no light, normal, hatch or distance term.
    for(int i=0;i<8;i++){
      float angle=float(i)*.78539816339;
      vec2 uv=screenUV+vec2(cos(angle),sin(angle))*pixel;
      float alpha=texture2D(aircraftColor,uv).a;
      neighbors+=step(.99,alpha);
      if(alpha>coverage){coverage=alpha;nearest=uv;}
    }
    if(coverage<.01)discard;
    vec3 color=mix(outlineColor,body.rgb,body.a);
    // Seal subpixel CAD seams enclosed by the airframe, rather than outlining
    // them as noisy dots. Large door openings and the outside edge stay open.
    if(body.a<.99&&neighbors>4.5)color=texture2D(aircraftColor,nearest).rgb;
    gl_FragColor=vec4(color,1.0);
    // Test against the physical world depth already on the screen. Boundary
    // pixels use their neighboring aircraft depth, preserving terrain occlusion.
    gl_FragDepth=texture2D(aircraftDepth,body.a>.99?screenUV:nearest).r;
    #include <colorspace_fragment>
  }`;

export class DoodleRenderer {
  constructor(renderer){
    this.renderer=renderer;
    renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.toneMapping=T.NoToneMapping;renderer.shadowMap.enabled=false;
    const depth=new T.DepthTexture(1,1,T.UnsignedIntType);depth.format=T.DepthFormat;
    // Normalized data fits RGBA8; no floating-point framebuffer extension needed.
    this.target=new T.WebGLRenderTarget(1,1,{type:T.UnsignedByteType,minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthTexture:depth,depthBuffer:true,generateMipmaps:false});
    this.material=new T.ShaderMaterial({vertexShader:paperVertex,fragmentShader:paperFragment,depthTest:true,depthWrite:true,depthFunc:T.AlwaysDepth,
      uniforms:{inkColor:{value:screenColor(PALETTE.ink)},accentColor:{value:screenColor(PALETTE.accent)},successColor:{value:screenColor(PALETTE.success)},paperColor:{value:screenColor(PALETTE.paper)},sceneData:{value:this.target.texture},sceneDepth:{value:depth},resolution:{value:new T.Vector2(1,1)},pixelRatio:{value:1},nearPlane:{value:.1},farPlane:{value:10000}}});
    this.scene=new T.Scene();this.scene.add(new T.Mesh(new T.PlaneGeometry(2,2),this.material));this.camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
    const aircraftDepth=new T.DepthTexture(1,1,T.UnsignedIntType);aircraftDepth.format=T.DepthFormat;
    this.aircraftTarget=new T.WebGLRenderTarget(1,1,{type:T.UnsignedByteType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthTexture:aircraftDepth,depthBuffer:true,generateMipmaps:false});
    this.aircraftTarget.texture.colorSpace=T.LinearSRGBColorSpace;
    this.aircraftMaterial=new T.ShaderMaterial({vertexShader:paperVertex,fragmentShader:aircraftFragment,depthTest:true,depthWrite:false,toneMapped:false,
      uniforms:{aircraftColor:{value:this.aircraftTarget.texture},aircraftDepth:{value:aircraftDepth},resolution:{value:new T.Vector2(1,1)},pixelRatio:{value:1},outlineColor:{value:new T.Color(PALETTE.ink)}}});
    this.aircraftScene=new T.Scene();this.aircraftScene.add(new T.Mesh(new T.PlaneGeometry(2,2),this.aircraftMaterial));
    this.direction=new T.Vector3(.4,.8,.3).normalize();this.size=new T.Vector2();
    this.style='doodle';this.appliedStyle=null;this.appliedScene=null;
    this.sky=new T.Color('#bfd1df');this.fog=new T.Fog('#bfd1df',850,6500);
    this.lights=new T.Group();const hemi=new T.HemisphereLight('#dce8ed','#646a4c',1.4),sun=new T.DirectionalLight('#fff2d7',2.2);sun.position.copy(this.direction).multiplyScalar(1000);this.lights.add(hemi,sun);

  }
  setStyle(style){this.style=style==='natural'?'natural':'doodle';}
  resize(){this.renderer.getDrawingBufferSize(this.size);this.target.setSize(this.size.x,this.size.y);this.aircraftTarget.setSize(this.size.x,this.size.y);for(const material of [this.material,this.aircraftMaterial]){material.uniforms.resolution.value.copy(this.size);material.uniforms.pixelRatio.value=this.renderer.getPixelRatio();}}
  render(scene,camera,cockpit=false,aircraft=null){
    const mask=camera.layers.mask,autoClear=this.renderer.autoClear;
    camera.updateMatrixWorld();light.value.copy(this.direction).transformDirection(camera.matrixWorldInverse);
    try{
      if(this.appliedScene!==scene||this.appliedStyle!==this.style){
        setSceneStyle(scene,this.style);scene.add(this.lights);this.lights.visible=this.style==='natural';
        scene.background=this.style==='natural'?this.sky:null;scene.fog=this.style==='natural'?this.fog:null;
        this.appliedScene=scene;this.appliedStyle=this.style;
      }
      camera.layers.set(0);
      if(this.style==='natural'){
        this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;
        this.renderer.setRenderTarget(null);this.renderer.setClearColor(this.sky,1);this.renderer.render(scene,camera);
      }else{
      this.renderer.setRenderTarget(this.target);this.renderer.setClearColor(new T.Color(1,0,.5),.5);this.renderer.clear();this.renderer.render(scene,camera);
      const u=this.material.uniforms;u.nearPlane.value=camera.near;u.farPlane.value=camera.far;
      this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
      }
      if(aircraft?.visible){
        // Render the flat aircraft alone, then add a clean outer silhouette.
        // The overlay tests against the world depth without clearing it.
        this.renderer.autoClear=false;this.renderer.outputColorSpace=T.SRGBColorSpace;
        this.renderer.setRenderTarget(this.aircraftTarget);this.renderer.setClearColor(0,0);this.renderer.clear();
        camera.layers.set(2);this.renderer.render(aircraft,camera);
        this.renderer.setRenderTarget(null);this.renderer.render(this.aircraftScene,this.camera);
      }
      if(cockpit){
        // Render camera children only. No world background, reconstructed depth
        // or paper/hatch shader can affect the near cockpit geometry.
        this.renderer.autoClear=false;this.renderer.outputColorSpace=T.SRGBColorSpace;
        this.renderer.clearDepth();camera.layers.set(1);this.renderer.render(camera,camera);
      }
    }finally{this.renderer.setRenderTarget(null);camera.layers.mask=mask;this.renderer.autoClear=autoClear;this.renderer.outputColorSpace=T.LinearSRGBColorSpace;this.renderer.toneMapping=T.NoToneMapping;}
  }
}
