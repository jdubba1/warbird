import test from 'node:test';
import assert from 'node:assert/strict';
import {GamepadInput,INPUT_DEFAULTS,inputSettings,deadzone} from '../dist/gamepad.js';
function harness(){
  const pad={index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  let pads=[pad];const input=new GamepadInput(()=>pads);
  const button=(i,value)=>{pad.buttons[i]={pressed:value>.5,value};};
  input.poll();return {pad,input,button,disconnect:()=>pads=[],poll:settings=>input.poll(settings)};
}
test('standard controller axes, analog collective and fire use the full normalized range',()=>{
  const h=harness();h.pad.axes=[.56,-1,1,0];h.button(7,.52);h.button(5,1);
  const out=h.poll();assert.ok(Math.abs(out.roll-.5)<1e-12);assert.equal(out.pitch,-1);assert.equal(out.yaw,1);assert.ok(Math.abs(out.collective-.5)<1e-12);assert.equal(out.fire,true);assert.equal(out.active,true);
  h.button(7,0);h.button(6,1);assert.equal(h.poll().collective,-1);
  assert.equal(h.poll({...INPUT_DEFAULTS,gamepadInvertPitch:true}).pitch,1);
});
test('camera, reset, pause and menu controls only fire on a button edge',()=>{
  const h=harness();for(const i of [0,1,9,12,15])h.button(i,1);
  const first=h.poll();for(const k of ['view','confirm','reset','pause','up','right'])assert.equal(first[k],true,k);
  const held=h.poll();for(const k of ['view','confirm','reset','pause','up','right'])assert.equal(held[k],false,k);
  h.button(0,0);h.poll();h.button(0,1);assert.equal(h.poll().view,true);
});
test('held flight inputs cannot restart after reset, pause or initial connection',()=>{
  const h=harness();h.button(7,1);assert.equal(h.poll().collective,1);
  h.input.clear();h.button(0,1);const blocked=h.poll();assert.equal(blocked.collective,0);assert.equal(blocked.active,false);assert.equal(blocked.confirm,true);
  h.button(7,0);h.poll();h.button(7,1);assert.equal(h.poll().collective,1);
  const fresh=new GamepadInput(()=>[h.pad]);assert.equal(fresh.poll().active,false);
  h.button(7,0);fresh.poll();h.button(7,1);assert.equal(fresh.poll().collective,1);
});
test('disconnect is reported once and unsupported or disabled pads have no flight input',()=>{
  const h=harness();h.disconnect();assert.equal(h.poll().disconnected,true);assert.equal(h.poll().disconnected,false);
  const unsupported={...h.pad,mapping:''};const input=new GamepadInput(()=>[unsupported]);assert.equal(input.poll().available,true);assert.equal(input.poll().connected,false);
  const disabled=harness();assert.equal(disabled.poll({...INPUT_DEFAULTS,gamepadEnabled:false}).connected,false);
  assert.equal(new GamepadInput(()=>{throw Error('Access denied');}).poll().active,false);
  assert.equal(new GamepadInput(()=>[null]).poll().connected,false);
});
test('dead zones reject drift and settings recover safely from invalid saved values',()=>{
  assert.equal(deadzone(.1),0);assert.equal(deadzone(-.12),0);assert.equal(deadzone(NaN),0);assert.equal(deadzone(-2),-1);
  assert.deepEqual(inputSettings(null),INPUT_DEFAULTS);assert.deepEqual(inputSettings({mouseAxis:'oops',gamepadDeadzone:NaN}),INPUT_DEFAULTS);
  assert.deepEqual(inputSettings({mouseAxis:'yaw',gamepadEnabled:false,gamepadDeadzone:2,gamepadInvertPitch:true}),{mouseAxis:'yaw',gamepadEnabled:false,gamepadDeadzone:.35,gamepadInvertPitch:true});
});
