import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '../dist/vendor/three.module.js';
import {Helicopter,DEFAULTS,V04_DEFAULTS,PREVIOUS_DEFAULTS,ORIGINAL_DEFAULTS,migrateHandling,STEP} from '../dist/physics.js';

const run=(h,seconds,input)=>{for(let i=0;i<Math.round(seconds/STEP);i++)h.step(input,STEP);return h;};
function flight(config,velocity=[0,0,0],collective=.5){const h=new Helicopter({...config,groundEffect:0});h.reset({position:[0,1000,0],velocity,collective});return h;}

test('powered cruise builds more speed while retaining independent altitude dynamics',()=>{
  const old=flight(PREVIOUS_DEFAULTS,[0,0,0],1),updated=flight(DEFAULTS,[0,0,0],1);
  for(const h of [old,updated]){h.orientation.setFromAxisAngle(new Vector3(1,0,0),-25*Math.PI/180);run(h,20,{collectiveAbsolute:1});}
  assert.ok(updated.telemetry().speed>old.telemetry().speed+35);
  assert.ok(updated.telemetry().speed>210&&updated.telemetry().speed<300);
  assert.ok(updated.position.distanceTo(old.position)>50);
});
test('pedals respond faster at hover and retain authority in fast flight',()=>{
  for(const speed of [0,200/3.6]){
    const old=run(flight(PREVIOUS_DEFAULTS,[0,0,-speed]),.5,{yaw:1});
    const updated=run(flight(DEFAULTS,[0,0,-speed]),.5,{yaw:1});
    assert.ok(updated.telemetry().heading>old.telemetry().heading*1.8);
    assert.ok(Math.abs(updated.rates.y)>Math.abs(old.rates.y)*1.7);
    assert.equal(updated.rates.x,0);assert.equal(updated.rates.z,0);
  }
});
test('cruise resistance reduction leaves nose-up flare braking intact and remains dissipative',()=>{
  const a=flight({...DEFAULTS,forwardDiscDrag:1},[0,0,-55]),b=flight(DEFAULTS,[0,0,-55]);
  for(const h of [a,b])h.orientation.setFromAxisAngle(new Vector3(1,0,0),Math.PI/4);
  run(a,.75,{collectiveAbsolute:0});run(b,.75,{collectiveAbsolute:0});
  assert.ok(a.velocity.distanceTo(b.velocity)<1e-10);
  for(const pitch of [-.5,.5]){
    const drag=flight({...DEFAULTS,drag:0},[0,0,-55]),base=flight({...DEFAULTS,drag:0,rotorDiscDrag:0},[0,0,-55]);
    for(const h of [drag,base])h.orientation.setFromAxisAngle(new Vector3(1,0,0),pitch);
    run(drag,STEP,{});run(base,STEP,{});
    assert.ok(drag.accel.clone().sub(base.accel).dot(new Vector3(0,0,-55))<=0);
  }
});
test('reference settings upgrade without overwriting custom tuning or the original preset',()=>{
  const upgrade={...PREVIOUS_DEFAULTS};migrateHandling(upgrade,PREVIOUS_DEFAULTS);
  assert.equal(upgrade.forwardDrag,DEFAULTS.forwardDrag);assert.equal(upgrade.yawPower,V04_DEFAULTS.yawPower);assert.equal(upgrade.yawInertia,DEFAULTS.yawInertia);
  const custom={...PREVIOUS_DEFAULTS,forwardDrag:.48,yawPower:3.1,yawInertia:1.3},before={...custom};migrateHandling(custom,before);assert.deepEqual(custom,before);
  const original={...ORIGINAL_DEFAULTS};migrateHandling(original,ORIGINAL_DEFAULTS);assert.deepEqual(original,ORIGINAL_DEFAULTS);
  const current={...PREVIOUS_DEFAULTS};migrateHandling(current,PREVIOUS_DEFAULTS,'0.4.0');assert.deepEqual(current,PREVIOUS_DEFAULTS);
});
