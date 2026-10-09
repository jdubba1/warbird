import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,PerspectiveCamera,LinearSRGBColorSpace,SRGBColorSpace,Box3,Vector3,Vector2,Raycaster,Mesh,BoxGeometry,ShaderLib,AlwaysDepth} from '../dist/vendor/three.module.js';
import {DoodleRenderer,simMaterial,setAccent,setSceneStyle} from '../dist/rendering.js';
import {Miniguns,SIGHT_DIRECTION} from '../dist/weapons.js';
import {verticalFov} from '../dist/camera.js';
import {DEFAULTS} from '../dist/physics.js';
import {makeCockpit,makeHelicopter} from '../dist/world.js';
globalThis.document={createElement:()=>({getContext:()=>new Proxy({}, {get:()=>()=>{}})})};
function fake(){return {shadowMap:{},autoClear:true,passes:[],setRenderTarget(){},setClearColor(){},clear(){},clearDepth(){this.depthCleared=true;},render(scene,camera){this.passes.push({scene,mask:camera.layers.mask,color:this.outputColorSpace,clear:this.autoClear});}};}
test('cockpit bypasses world hatching and restores camera layers/color state',()=>{
  const renderer=fake(),visual=new DoodleRenderer(renderer),scene=new Scene(),camera=new PerspectiveCamera(),cockpit=makeCockpit();camera.add(cockpit.group);scene.add(camera);
  cockpit.group.traverse(o=>assert.equal(o.layers.mask,2));visual.render(scene,camera,true);
  assert.equal(renderer.passes.length,3);assert.equal(renderer.passes[0].scene,scene);assert.equal(renderer.passes[0].mask,1);
  assert.equal(renderer.passes[2].scene,camera);assert.equal(renderer.passes[2].mask,2);assert.equal(renderer.passes[2].color,SRGBColorSpace);assert.equal(renderer.passes[2].clear,false);assert.equal(renderer.depthCleared,true);
  assert.equal(camera.layers.mask,1);assert.equal(renderer.autoClear,true);assert.equal(renderer.outputColorSpace,LinearSRGBColorSpace);
});
test('render failure cannot leave cockpit layer or clearing state stuck',()=>{
  const renderer=fake(),visual=new DoodleRenderer(renderer),camera=new PerspectiveCamera();camera.layers.enable(3);const mask=camera.layers.mask;
  renderer.render=()=>{throw new Error('GPU failure');};assert.throws(()=>visual.render(new Scene(),camera,true));assert.equal(camera.layers.mask,mask);assert.equal(renderer.autoClear,true);assert.equal(renderer.outputColorSpace,LinearSRGBColorSpace);
});

test('reference cockpit keeps analog gauges left and a separate display low at the wider default FOV',()=>{
  assert.equal(DEFAULTS.cockpitFov,105);
  const camera=new PerspectiveCamera(verticalFov(DEFAULTS.cockpitFov),16/9,.04,1000),cockpit=makeCockpit();camera.add(cockpit.group);camera.updateMatrixWorld(true);
  const panel=cockpit.group.getObjectByName('Instruments'),bounds=new Box3().setFromObject(panel);
  const top=new Vector3(bounds.max.x,bounds.max.y,bounds.max.z).project(camera);
  assert.ok((1-top.y)/2>.64&&(1-top.y)/2<.67,'analog pedestal matches the reference below the forward window');
  const display=cockpit.group.getObjectByName('Flight display'),displayBounds=new Box3().setFromObject(display);
  const displayTop=new Vector3(displayBounds.max.x,displayBounds.max.y,displayBounds.max.z).project(camera);
  assert.ok((1-displayTop.y)/2>.78,'offset flight display stays lower than the analog cluster');
  assert.ok(top.x<0,'analog cluster remains left of center');
  const a=new Vector3(bounds.min.x,bounds.min.y,bounds.max.z).project(camera),b=new Vector3(bounds.max.x,bounds.max.y,bounds.max.z).project(camera);
  assert.ok(Math.abs((b.x-a.x)*16/9-(b.y-a.y))<1e-6,'wide FOV must not stretch circular gauges');
});

test('raised reflex sight sits near center and aligns with the gun sight ray',()=>{
  const camera=new PerspectiveCamera(verticalFov(DEFAULTS.cockpitFov),16/9,.04,1000),cockpit=makeCockpit();camera.add(cockpit.group);camera.updateMatrixWorld(true);
  const sight=cockpit.group.getObjectByName('Sight glass').getWorldPosition(new Vector3()).project(camera);
  assert.ok((sight.x+1)/2>.52&&(sight.x+1)/2<.54);assert.ok((1-sight.y)/2>.49&&(1-sight.y)/2<.51);
  const ray=new Raycaster();ray.layers.set(1);ray.setFromCamera(new Vector2(0,0),camera);
  assert.equal(ray.intersectObjects(cockpit.group.children,true).filter(o=>o.object.isMesh&&o.object.material.opacity>=.5).length,0,'no panel or frame should block the center of the window');
  const aim=cockpit.group.getObjectByName('Aim point').getWorldPosition(new Vector3()).normalize();
  assert.ok(aim.distanceTo(new Vector3().fromArray(SIGHT_DIRECTION).normalize())<1e-8);
  assert.ok(cockpit.group.getObjectByName('Left canopy frame'));assert.ok(cockpit.group.getObjectByName('Right canopy rim'));
});

test('look switching uses shaded materials without the paper pass, and returns to doodle',()=>{
  const renderer=fake(),visual=new DoodleRenderer(renderer),scene=new Scene(),camera=new PerspectiveCamera();
  const material=simMaterial('#506d46'),mesh=new Mesh(new BoxGeometry(),material);scene.add(mesh);const position=camera.position.clone(),rotation=camera.quaternion.clone();
  visual.setStyle('natural');visual.render(scene,camera,true);
  assert.equal(mesh.material,material.natural);assert.equal(mesh.material.isMeshStandardMaterial,true);assert.ok(scene.fog);assert.ok(scene.background);assert.equal(renderer.passes.length,2);
  assert.equal(camera.position.distanceTo(position),0);assert.equal(camera.quaternion.angleTo(rotation),0);
  renderer.passes=[];visual.setStyle('doodle');visual.render(scene,camera);
  assert.equal(mesh.material,material);assert.equal(scene.background,null);assert.equal(scene.fog,null);assert.equal(renderer.passes.length,2);
});
test('challenge gate feedback works in either look and natural terrain receives its ground detail',()=>{
  const material=simMaterial('#fff',{ink:1});setAccent(material.natural,2);assert.equal(material.uniforms.ink.value,2);assert.equal(material.natural.color.getHexString(),'4c965f');
  const terrain=simMaterial('#89936b',{topo:true}),shader={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};terrain.natural.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('groundWorld=(modelMatrix*vec4(transformed,1.0)).xyz'));assert.ok(shader.fragmentShader.includes('diffuseColor.rgb=soil'));
});

test('the whole aircraft keeps unlit colors in either look and renders after the world with depth intact',()=>{
  const renderer=fake(),visual=new DoodleRenderer(renderer),scene=new Scene(),camera=new PerspectiveCamera(),aircraft=makeHelicopter();scene.add(aircraft.group);
  const materials=[];aircraft.group.traverse(o=>{
    assert.equal(o.layers.mask,4);
    if(!o.isMesh)return;
    assert.ok(o.geometry.attributes.position.array.every(Number.isFinite),'aircraft geometry has finite positions');
    assert.equal(o.material.isMeshBasicMaterial,true);assert.equal(o.material.fog,false);assert.equal(o.material.toneMapped,false);
    assert.equal(o.castShadow,false);assert.equal(o.receiveShadow,false);materials.push([o,o.material,o.material.color.getHex()]);
  });
  assert.equal(visual.material.depthWrite,true);assert.equal(visual.material.depthTest,true);assert.equal(visual.material.depthFunc,AlwaysDepth);
  assert.ok(visual.material.fragmentShader.includes('gl_FragDepth=texture2D(sceneDepth,screenUV).r;'),'paper pass must restore world depth before the aircraft');
  for(const style of ['doodle','natural','doodle']){
    renderer.passes=[];visual.setStyle(style);visual.render(scene,camera,false,aircraft.group);
    assert.equal(renderer.passes[0].mask,1,'aircraft layer is excluded from the world shader');
    const aircraftPass=renderer.passes.at(-2);
    assert.equal(aircraftPass.scene,aircraft.group);assert.equal(aircraftPass.mask,4);assert.equal(aircraftPass.clear,false);assert.equal(aircraftPass.color,SRGBColorSpace);
    assert.equal(renderer.passes.at(-1).scene,visual.aircraftScene);assert.equal(visual.aircraftMaterial.depthWrite,false);assert.equal(visual.aircraftMaterial.depthTest,true);
    assert.ok(visual.aircraftMaterial.fragmentShader.includes('gl_FragDepth=texture2D(aircraftDepth'));
    assert.equal(renderer.depthCleared,undefined,'world depth must not be cleared for the heli');
    assert.equal(camera.layers.mask,1);assert.equal(renderer.autoClear,true);
    for(const [o,material,color]of materials){assert.equal(o.material,material);assert.equal(o.material.color.getHex(),color);}
  }
  aircraft.group.visible=false;renderer.passes=[];visual.render(scene,camera,false,aircraft.group);
  assert.equal(renderer.passes.length,2,'hidden exterior should have no pass in cockpit view');
});

test('a failed aircraft pass restores render state for the next frame',()=>{
  const renderer=fake(),visual=new DoodleRenderer(renderer),scene=new Scene(),camera=new PerspectiveCamera(),aircraft=makeHelicopter();camera.layers.enable(3);const mask=camera.layers.mask;
  let target;renderer.setRenderTarget=value=>target=value;renderer.render=object=>{if(object===aircraft.group)throw new Error('Aircraft failure');};
  assert.throws(()=>visual.render(scene,camera,false,aircraft.group));
  assert.equal(camera.layers.mask,mask);assert.equal(renderer.autoClear,true);assert.equal(renderer.outputColorSpace,LinearSRGBColorSpace);assert.equal(target,null);
});

 test('orange impacts bypass both world looks, keep world depth and precede aircraft and cockpit',()=>{
  const renderer=fake(),visual=new DoodleRenderer(renderer),scene=new Scene(),camera=new PerspectiveCamera(),aircraft=makeHelicopter(),weapons=new Miniguns(new Scene());
  weapons.mark({point:new Vector3(0,0,-10),normal:new Vector3(0,0,1)});scene.add(weapons.marks,aircraft.group);
  const color=weapons.marks.material.color.getHex();
  for(const style of ['doodle','natural']){
    renderer.passes=[];renderer.depthCleared=false;visual.setStyle(style);visual.render(scene,camera,true,aircraft.group,weapons.marks);
    const i=renderer.passes.findIndex(p=>p.scene===weapons.marks),pass=renderer.passes[i];
    assert.ok(i>0);assert.equal(pass.mask,8);assert.equal(pass.color,SRGBColorSpace);assert.equal(pass.clear,false);
    assert.equal(renderer.passes[i+1].scene,aircraft.group);assert.equal(renderer.passes.at(-1).scene,camera);
    assert.equal(weapons.marks.material.color.getHex(),color);assert.equal(weapons.marks.material.toneMapped,false);assert.equal(weapons.marks.material.depthTest,true);assert.equal(weapons.marks.material.depthWrite,false);
    assert.equal(camera.layers.mask,1);assert.equal(renderer.autoClear,true);
  }weapons.dispose();
});
