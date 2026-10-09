import test from 'node:test';
import assert from 'node:assert/strict';
import {Controls,BINDINGS} from '../dist/controls.js';
import {DEFAULTS} from '../dist/physics.js';

function harness(){
  const events=new Map();
  globalThis.addEventListener=(name,cb)=>{const list=events.get(name)??[];list.push(cb);events.set(name,list);};
  globalThis.document={addEventListener(){},pointerLockElement:null};
  let pauses=0;
  const controls=new Controls({addEventListener(){}},DEFAULTS,BINDINGS,{pause:()=>pauses++});
  controls.enabled=true;
  const key=(code,form=false)=>{let prevented=false;const e={code,repeat:false,target:{matches:()=>form},preventDefault:()=>prevented=true};for(const cb of events.get('keydown')??[])cb(e);return prevented;};
  return {controls,key,pauses:()=>pauses};
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
