import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Raycaster,Vector3} from '../dist/vendor/three.module.js';
import {setSceneStyle} from '../dist/rendering.js';
import {makeWorld} from '../dist/world.js';
import {groundHeight,pads,gates,setMap,nearRoute,mapId} from '../dist/terrain.js';
const context=new Proxy({}, {get:()=>()=>{}});
globalThis.document={createElement:()=>({getContext:()=>context})};

test('seeded mountains have high relief, level landing pads and terrain-following gates',()=>{
  setMap('mountains');assert.ok(groundHeight(-450,-2900)>1000);
  const home=pads[0];assert.equal(home.name,'Home');assert.ok(home.height>1200);
  assert.ok(groundHeight(home.x,home.z+800)<home.height-500,'takeoff faces an open descent into the valley');
  const sample=groundHeight(763,-1937);
  for(const p of pads){assert.ok(Math.abs(groundHeight(p.x,p.z)-p.height)<.001);for(const [dx,dz]of [[10,0],[-10,0],[0,10],[0,-10]])assert.ok(Math.abs(groundHeight(p.x+dx,p.z+dz)-p.height)<.001);}
  assert.equal(gates.length,6);for(const g of gates)assert.ok(g.y-groundHeight(g.x,g.z)>=24);
  assert.equal(groundHeight(0,0),0);setMap('valley');assert.equal(mapId,'mountains');assert.ok(groundHeight(-450,-2900)>1000);setMap('mountains');assert.equal(groundHeight(763,-1937),sample);
});
test('tree collision cores stay inside their visible foliage and trunks',()=>{
  const world=makeWorld(new Scene());const trees=world.obstacles.filter(o=>o.type==='tree');assert.equal(trees.length,world.counts.trees);
  for(const tree of trees){
    const h=(tree.top-tree.base)/.9;
    assert.ok(tree.trunkRadius<.15);assert.ok(tree.top<tree.base+h*1.03);
    for(const fraction of [0,.25,.5,.75,1]){
      const y=tree.bottom+(tree.top-tree.bottom)*fraction;
      const visibleRadius=h*.26*(1-(y-tree.base-h*.21)/(h*.82))*Math.cos(Math.PI/7);
      assert.ok(tree.radius*(1-fraction)<visibleRadius,'core is contained even inside the seven-sided canopy');
    }
  }world.dispose();
});
test('collision heights match rendered triangles across slopes and cell diagonals',()=>{
  setMap('mountains');const world=makeWorld(new Scene());world.root.updateMatrixWorld(true);
  const ground=world.root.children.find(o=>o.isMesh&&o.material.uniforms?.topo?.value===1);
  const ray=new Raycaster();
  for(let i=0;i<80;i++){
    const x=-3000+(i*137.43)%6000,z=-3400+(i*247.37)%6500;
    ray.set(new Vector3(x,2500,z),new Vector3(0,-1,0));const hit=ray.intersectObject(ground)[0];assert.ok(hit);
    assert.ok(Math.abs(hit.point.y-groundHeight(x,z))<.002,`mesh/collision disagreement at ${x},${z}`);
  }world.dispose();
});
test('obstacle-rich world keeps routes clear, offers roof landings and releases resources',()=>{
  setMap('mountains');const scene=new Scene(),world=makeWorld(scene);
  assert.ok(world.counts.buildings>100);assert.ok(world.counts.trees>2000);assert.ok(world.counts.rocks>200);
  assert.equal(world.obstacles.some(o=>o.type==='tunnel'),false);
  for(const b of world.buildings)assert.equal(nearRoute(b.x,b.z,65),false);
  for(const slab of world.surfaces){assert.ok(world.surface(slab.x,slab.z,slab.top+1)>=slab.top);}
  const materials=new Set(),textures=new Set();let materialDisposals=0,textureDisposals=0;
  world.root.traverse(o=>{if(o.material){for(const m of [o.material,o.material.natural].filter(Boolean))materials.add(m);}});
  for(const m of materials){m.addEventListener('dispose',()=>materialDisposals++);if(m.map)textures.add(m.map);}
  for(const t of textures)t.addEventListener('dispose',()=>textureDisposals++);
  setSceneStyle(scene,'natural');
  let meshes=0,disposed=0;world.root.traverse(o=>{if(o.isMesh){meshes++;o.geometry.addEventListener('dispose',()=>disposed++);for(const a of Object.values(o.geometry.attributes))assert.ok(a.array.every(Number.isFinite));}});
  assert.ok(meshes<40,'static building batches and instanced vegetation keep draw count low');world.dispose();assert.ok(disposed>0);assert.equal(materialDisposals,materials.size);assert.equal(textureDisposals,textures.size);assert.equal(scene.children.length,0);
});
