import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {Targets} from '../dist/targets.js';
import {Miniguns} from '../dist/weapons.js';
import {makeWorld} from '../dist/world.js';
import {groundHeight} from '../dist/terrain.js';

const round=()=>({position:new T.Vector3(),velocity:new T.Vector3(0,0,-800),age:0,tracer:true});
const heli={position:new T.Vector3(),orientation:new T.Quaternion(),velocity:new T.Vector3()};

test('finite bullet segments hit the nearest live balloon, including from inside, without tunneling',()=>{
  const targets=new Targets([{x:0,y:0,z:-20},{x:0,y:0,z:-40}]),start=new T.Vector3(),end=new T.Vector3(0,0,-60);
  assert.equal(targets.cast(start,new T.Vector3(0,0,-10)),null);
  assert.equal(targets.cast(new T.Vector3(10,0,0),end),null);
  const hit=targets.cast(start,end);assert.equal(hit.target,targets.targets[0]);assert.ok(Math.abs(hit.distance-17.6)<1e-9);
  targets.pop(hit.target);assert.equal(targets.cast(start,end).target,targets.targets[1]);
  assert.equal(targets.cast(new T.Vector3(0,0,-40),end).distance,0);targets.dispose();
});
test('miniguns pop once, stop the tracer at the balloon and cannot hit targets through a wall',()=>{
  const root=new T.Group(),wall=new T.Mesh(new T.BoxGeometry(20,20,.1),new T.MeshBasicMaterial());wall.position.z=-30;root.add(wall);
  const targets=new Targets([{x:0,y:0,z:-20},{x:0,y:0,z:-40}]),guns=new Miniguns(root,{targets});
  guns.rounds=[round(),round()];guns.step(heli,false,.08);guns.updateTracers();
  assert.equal(targets.remaining,1);assert.equal(targets.targets[0].active,false);assert.equal(targets.targets[1].active,true);
  assert.equal(targets.fragments.count,24,'twin hits cannot burst the same balloon twice');
  assert.equal(guns.marks.count,1,'the second round passes the popped balloon and marks the blocking wall');
  assert.equal(guns.tracers.count,2);assert.ok(Math.abs(guns.streaks[0].end.z+17.6)<.001);
  guns.reset();assert.equal(targets.remaining,2);assert.equal(targets.fragments.count,0);assert.equal(guns.marks.count,0);
  guns.dispose();wall.geometry.dispose();wall.material.dispose();
});
test('balloon bursts spread, expire, stay bounded and release their rendering resources',()=>{
  const targets=new Targets(Array.from({length:40},(_,i)=>({x:i*8,y:10,z:0})));
  for(const target of targets.targets)targets.pop(target);
  assert.equal(targets.remaining,0);assert.equal(targets.particles.length,768);assert.equal(targets.fragments.count,768);
  const before=targets.particles[0].position.clone();assert.equal(targets.update(.1),true);assert.ok(before.distanceTo(targets.particles[0].position)>.5);
  targets.group.traverse(o=>assert.equal(o.layers.mask,8));
  targets.update(.6);assert.equal(targets.fragments.count,0);assert.equal(targets.group.count,0);assert.equal(targets.update(.1),false);
  targets.reset();assert.equal(targets.remaining,40);assert.equal(targets.fragments.count,0);
  let disposed=0;for(const mesh of targets.group.children){mesh.geometry.addEventListener('dispose',()=>disposed++);mesh.material.addEventListener('dispose',()=>disposed++);}
  targets.dispose();assert.equal(disposed,8);
});
test('mountains offer visible roof, tree and starter targets with deterministic placement',()=>{
  globalThis.document={createElement:()=>({getContext:()=>new Proxy({}, {get:()=>()=>{}})})};
  const world=makeWorld(new T.Scene());assert.ok(world.targetPlacements.length>60&&world.targetPlacements.length<100);
  for(const kind of ['roof','tree','start'])assert.ok(world.targetPlacements.filter(p=>p.kind===kind).length>=6);
  for(const target of world.targetPlacements)assert.ok(target.y>=groundHeight(target.x,target.z)+2.4,'balloon is above visible terrain');
  for(const target of world.targetPlacements.filter(p=>p.kind==='roof')){
    const b=world.buildings.find(b=>Math.abs(target.x-b.x)<b.w/2&&Math.abs(target.z-b.z)<b.d/2);assert.ok(b);assert.ok(target.y>b.top+2.4);
  }
  const targets=new Targets(world.targetPlacements);assert.equal(targets.group.children.length,4,'targets use fixed-count instanced draws');
  targets.dispose();world.dispose();
});
