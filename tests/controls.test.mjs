import test from 'node:test';
import assert from 'node:assert/strict';
import {Controls,BINDINGS} from '../dist/controls.js';
import {DEFAULTS} from '../dist/physics.js';

function harness(){
  const events=new Map();
  globalThis.addEventListener=(name,cb)=>{const list=events.get(name)??[];list.push(cb);events.set(name,list);};
  const documentEvents=new Map(),canvasEvents=new Map();
  const register=(events,name,cb)=>events.set(name,[...(events.get(name)??[]),cb]);
  globalThis.document={addEventListener:(name,cb)=>register(documentEvents,name,cb),pointerLockElement:null};
  const canvas={addEventListener:(name,cb)=>register(canvasEvents,name,cb),setPointerCapture(){}};
  let pauses=0;
  const controls=new Controls(canvas,DEFAULTS,BINDINGS,{pause:()=>pauses++});
  controls.enabled=true;
  const key=(code,form=false)=>{let prevented=false;const e={code,repeat:false,target:{matches:()=>form},preventDefault:()=>prevented=true};for(const cb of events.get('keydown')??[])cb(e);return prevented;};
  return {controls,key,pauses:()=>pauses,emit:(surface,name,e={})=>{for(const cb of (surface==='canvas'?canvasEvents:documentEvents).get(name)??[])cb(e);}};
}
test('Escape opens the menu from idle controls, including a focused button',()=>{
  const h=harness();assert.equal(h.key('Escape',true),true);assert.equal(h.pauses(),1);assert.equal(h.controls.keys.has('Escape'),false);
});
test('keyboard-started flight preserves the triggering key and clears it on pause',()=>{
  const h=harness();h.key('KeyW');h.controls.startDrag(false);
  assert.equal(h.controls.frame(1/60).collective,1);
  h.controls.clear();assert.equal(h.controls.frame(1/60).collective,0);
});
test('Escape during rebinding reaches the capture callback without opening the menu',()=>{
  const h=harness();let captured;h.controls.capture=code=>captured=code;
  h.key('Escape');assert.equal(captured,'Escape');assert.equal(h.pauses(),0);assert.equal(h.controls.capture,null);
});

test('capture click cannot fire, locked LMB releases outside canvas, pause clears both fire inputs',()=>{
  const h=harness();h.emit('canvas','mousedown',{button:0});assert.equal(h.controls.frame(1/60).fire,false);
  h.controls.locked=true;h.emit('canvas','mousedown',{button:0});assert.equal(h.controls.frame(1/60).fire,true);
  h.emit('document','mouseup',{button:0});assert.equal(h.controls.frame(1/60).fire,false);
  h.key('KeyF');assert.equal(h.controls.frame(1/60).fire,true);h.controls.clear();assert.equal(h.controls.frame(1/60).fire,false);
  h.controls.startDrag();h.emit('canvas','pointerdown',{button:0,pointerId:1});assert.equal(h.controls.frame(1/60).fire,false);
  h.key('KeyF');assert.equal(h.controls.frame(1/60).fire,true);h.controls.enabled=false;assert.equal(h.controls.frame(1/60).fire,false);
});

test('occupied bindings swap atomically, while reserved or invalid bindings leave controls unchanged',async()=>{
  const {rebind}=await import('../dist/controls.js');const bindings={...BINDINGS};
  assert.equal(rebind(bindings,'collectiveDown','ControlLeft'),true);
  assert.equal(bindings.collectiveDown,'ControlLeft');assert.equal(bindings.pitchDown,'KeyS');assert.equal(new Set(Object.values(bindings)).size,Object.keys(bindings).length);
  assert.equal(rebind(bindings,'collectiveDown','ControlLeft'),true);
  const before={...bindings};for(const code of ['Escape','KeyF','',null])assert.equal(rebind(bindings,'pitchDown',code),false);
  assert.equal(rebind(bindings,'unknown','KeyJ'),false);assert.deepEqual(bindings,before);
});
test('horizontal mouse can drive yaw independently of pitch and keyboard roll',()=>{
  const h=harness();h.controls.settings={mouseAxis:'yaw'};h.controls.pending={x:30,y:-20};h.key('KeyE');
  const input=h.controls.frame(1/60);assert.equal(input.roll,1);assert.ok(input.yaw>0);assert.ok(input.pitch<0);
  h.controls.clear();h.controls.settings={mouseAxis:'roll'};h.controls.pending.x=30;
  const original=h.controls.frame(1/60);assert.ok(original.roll>0);assert.equal(original.yaw,0);
});
test('controller and keyboard inputs combine without exceeding bounds and clear on disabled controls',()=>{
  const h=harness();h.key('KeyW');h.key('Space');const pad={collective:.5,pitch:.7,roll:-1,yaw:.4,fire:true};
  assert.deepEqual(h.controls.frame(1/60,pad),{collective:1,pitch:1,roll:-1,yaw:.4,fire:true});
  h.controls.enabled=false;assert.deepEqual(h.controls.frame(1/60,pad),{roll:0,pitch:0,yaw:0,collective:0,fire:false});
});
