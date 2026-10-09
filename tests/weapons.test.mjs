import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {SurfaceIndex,Miniguns,launchRound,aimPoint,MUZZLES,GRAVITY,SHOT_RATE,makeGunMounts} from '../dist/weapons.js';
import {makeWorld} from '../dist/world.js';
const heli=()=>({position:new T.Vector3(),orientation:new T.Quaternion(),velocity:new T.Vector3()});
const atZ=(round,z)=>{const time=(z-round.position.z)/round.velocity.z;return round.position.clone().addScaledVector(round.velocity,time).add(new T.Vector3(0,-GRAVITY*time*time/2,0));};
const basic=()=>new T.MeshBasicMaterial({side:T.DoubleSide});

test('twin rounds zero at the sight, split low nearby and cross high beyond it',()=>{
  for(const zero of [30,50,100]){
    const target=aimPoint(zero),rounds=[0,1].map(side=>launchRound(heli(),side,zero));
    for(const round of rounds)assert.ok(atZ(round,target.z).distanceTo(target)<1e-6);
    const near=aimPoint(zero/3),far=aimPoint(zero*2),n=rounds.map(r=>atZ(r,near.z)),f=rounds.map(r=>atZ(r,far.z));
    assert.ok(n.every(p=>p.y<near.y-.35));assert.ok(n[0].x<near.x&&n[1].x>near.x);
    assert.ok(f.every(p=>p.y>far.y+.3));assert.ok(f[0].x>far.x&&f[1].x<far.x);
  }
});
test('launch uses aircraft pose and inherits world momentum, while gun meshes follow the same zero',()=>{
  const h=heli();h.position.set(20,100,-40);h.velocity.set(16,-3,-70);h.orientation.setFromEuler(new T.Euler(.2,.6,.4));
  const moving=launchRound(h,0),stationary=launchRound(heli(),0);
  assert.ok(moving.position.distanceTo(new T.Vector3().fromArray(MUZZLES[0]).applyQuaternion(h.orientation).add(h.position))<1e-9);
  assert.ok(moving.velocity.distanceTo(stationary.velocity.applyQuaternion(h.orientation).add(h.velocity))<1e-9);
  const guns=makeGunMounts();guns.setZero(50);
  for(let side=0;side<2;side++)assert.ok(new T.Vector3(0,0,-1).applyQuaternion(guns.group.children[side].quaternion).distanceTo(launchRound(heli(),side,50).velocity.normalize())<1e-9);
});
test('finite segment hits the nearest thin wall from either side without tunneling; hidden parents do not collide',()=>{
  const root=new T.Group(),front=new T.Mesh(new T.BoxGeometry(8,8,.02),basic()),back=new T.Mesh(new T.BoxGeometry(8,8,.02),basic());
  front.position.z=-10;back.position.z=-15;const parent=new T.Group();parent.add(front);root.add(parent,back);
  const surface=new SurfaceIndex(root,4),start=new T.Vector3(0,0,0);
  assert.equal(surface.cast(start,new T.Vector3(0,0,-9)),null);
  const hit=surface.cast(start,new T.Vector3(0,0,-30));assert.equal(hit.object,front);assert.ok(Math.abs(hit.point.z+9.99)<1e-5);assert.ok(hit.normal.z>.99);
  assert.equal(surface.cast(new T.Vector3(0,0,-12),start).object,front);
  parent.visible=false;assert.equal(surface.cast(start,new T.Vector3(0,0,-30)).object,back);
  assert.equal(surface.cast(start,start),null);
});
test('spatial collision matches native rays through transformed instances and diagonal grid crossings',()=>{
  const root=new T.Group(),mesh=new T.InstancedMesh(new T.BoxGeometry(4,5,3),basic(),4),obj=new T.Object3D();root.position.set(13,8,-17);root.rotation.y=.7;root.add(mesh);
  for(let i=0;i<4;i++){obj.position.set(i*8-12,0,-i*9);obj.rotation.y=i*.3;obj.scale.set(1+i*.2,1,1);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);}
  const surface=new SurfaceIndex(root,4);root.updateMatrixWorld(true);
  const ray=new T.Raycaster(),matrix=new T.Matrix4();
  for(let i=0;i<4;i++){
    mesh.getMatrixAt(i,matrix);const target=new T.Vector3().setFromMatrixPosition(matrix).applyMatrix4(root.matrixWorld),start=target.clone().add(new T.Vector3(15,15,15)),end=target.clone().add(new T.Vector3(-15,-15,-15));
    ray.set(start,end.clone().sub(start).normalize());ray.far=start.distanceTo(end);
    const expected=ray.intersectObject(mesh)[0],actual=surface.cast(start,end);assert.ok(actual&&expected);assert.ok(actual.point.distanceTo(expected.point)<1e-5);
  }
});
test('real mountain surfaces match visible geometry and the per-round query visits local triangles',()=>{
  globalThis.document={createElement:()=>({getContext:()=>new Proxy({}, {get:()=>()=>{}})})};
  const world=makeWorld(new T.Scene()),surface=new SurfaceIndex(world.root);
  for(const gate of world.gateMeshes)gate.visible=false;
  const ray=new T.Raycaster();
  for(let i=0;i<12;i++){
    const start=new T.Vector3(-2100+i*373,2200,-2900+i*281),end=start.clone().setY(-100);
    ray.set(start,new T.Vector3(0,-1,0));const expected=ray.intersectObjects(world.root.children,true).filter(h=>h.object.visible)[0],hit=surface.cast(start,end);
    assert.ok(hit&&expected);assert.ok(hit.point.distanceTo(expected.point)<.002);
  }
  assert.ok(surface.triangles.length/9>200000);world.dispose();
});
test('rounds fall, keep travelling after release and paint the actual wall, with bounded marks and reset',()=>{
  const root=new T.Group(),wall=new T.Mesh(new T.BoxGeometry(20,20,.03),basic());wall.position.z=-30;root.add(wall);
  const guns=new Miniguns(root,{capacity:8}),h=heli();
  guns.step(h,true,.02);assert.equal(guns.shots,2);assert.equal(guns.marks.count,0);
  const oldVelocity=guns.rounds[0].velocity.y;guns.step(h,false,1/120);assert.ok(guns.rounds[0].velocity.y<oldVelocity);assert.equal(guns.shots,2);
  for(let i=0;i<8;i++)guns.step(h,false,1/120);assert.equal(guns.marks.count,2);assert.equal(guns.rounds.length,0);
  const matrix=new T.Matrix4();guns.marks.getMatrixAt(0,matrix);assert.ok(Math.abs(new T.Vector3().setFromMatrixPosition(matrix).z+29.979)<.003);
  assert.ok(new T.Vector3(0,0,1).transformDirection(matrix).z>.99);
  for(let i=0;i<120;i++)guns.step(h,true,1/120);assert.equal(guns.marks.count,8);assert.ok(guns.rounds.length<256);
  guns.reset();assert.equal(guns.marks.count,0);assert.equal(guns.rounds.length,0);assert.equal(guns.shots,0);
  let disposed=0;guns.marks.geometry.addEventListener('dispose',()=>disposed++);guns.marks.material.addEventListener('dispose',()=>disposed++);guns.dispose();assert.equal(disposed,2);
});
test('twin firing cadence is independent of frame rate and empty-air projectiles expire',()=>{
  for(const fps of [30,60,120,144]){
    const guns=new Miniguns(new T.Group());
    for(let i=0;i<fps;i++)guns.step(heli(),true,1/fps);
    assert.equal(guns.shots,SHOT_RATE*2);
    for(let i=0;i<fps*3;i++)guns.step(heli(),false,1/fps);
    assert.equal(guns.rounds.length,0);assert.equal(guns.marks.count,0);guns.dispose();
  }
});
