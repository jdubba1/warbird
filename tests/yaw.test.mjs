import test from 'node:test';
import assert from 'node:assert/strict';
import {Helicopter,DEFAULTS,V08_DEFAULTS,V07_DEFAULTS,V05_DEFAULTS,V04_DEFAULTS,migrateHandling,STEP} from '../dist/physics.js';

function flight(config,speed=0){
  const h=new Helicopter({...config,groundEffect:0,weathercock:0});
  h.reset({position:[0,1000,0],velocity:[0,0,-speed],collective:.5});return h;
}
test('pedal authority increases exactly 50% at hover and speed without changing other response coefficients',()=>{
  assert.deepEqual({...DEFAULTS,yawPower:V08_DEFAULTS.yawPower},V08_DEFAULTS);
  for(const speed of [0,200/3.6])for(const direction of [-1,1]){
    const old=flight(V08_DEFAULTS,speed),updated=flight(DEFAULTS,speed);
    for(const h of [old,updated])h.step({yaw:direction,pitch:.3,roll:-.4},STEP);
    assert.ok(Math.abs(updated.rates.y/old.rates.y-1.5)<1e-12);
    assert.deepEqual(updated.cyclic,old.cyclic);
    assert.equal(updated.rates.x,old.rates.x);assert.equal(updated.rates.z,old.rates.z);
    for(const h of [old,updated]){h.cyclic.y=0;h.rates.y=.6;h.step({},STEP);}
    assert.equal(updated.rates.y,old.rates.y,'release damping retains the same rotational weight');
  }
});
test('stronger yaw rotates the nose while forward momentum remains independent',()=>{
  for(const direction of [-1,1]){
    const h=flight({...DEFAULTS,drag:0,rotorDiscDrag:0},55);
    for(let i=0;i<60;i++)h.step({yaw:direction,collectiveAbsolute:.5},STEP);
    assert.equal(h.velocity.x,0);assert.equal(h.velocity.z,-55);
    assert.ok(Math.abs(h.orientation.y)>.04);
  }
});
test('saved stock yaw upgrades once while custom yaw and older selected presets survive',()=>{
  for(const saved of [V08_DEFAULTS,{...V08_DEFAULTS,mouseRoll:.005}]){
    const config={...saved};migrateHandling(config,saved,'0.8.0');
    assert.deepEqual(config,{...saved,yawPower:DEFAULTS.yawPower});
  }
  for(const saved of [V04_DEFAULTS,V05_DEFAULTS,V07_DEFAULTS,{...V08_DEFAULTS,yawPower:3.1}]){
    const config={...saved};migrateHandling(config,saved,'0.8.0');assert.deepEqual(config,saved);
  }
  for(const saved of [V08_DEFAULTS,{...DEFAULTS,neutral:.5},DEFAULTS]){
    const config={...saved};migrateHandling(config,saved,'0.10.0');assert.deepEqual(config,saved);
  }
});
