import test from 'node:test';
import assert from 'node:assert/strict';
import {Helicopter,DEFAULTS,V04_DEFAULTS,migrateHandling,STEP} from '../dist/physics.js';
import {Vector3} from '../dist/vendor/three.module.js';
const run=(h,s,input={})=>{for(let i=0;i<Math.round(s/STEP);i++)h.step(input,STEP);return h;};
function flight(config=DEFAULTS,speed=0,pitch=0){const h=new Helicopter({...config,groundEffect:0});h.reset({position:[0,1000,0],velocity:[0,0,-speed],collective:1});h.orientation.setFromAxisAngle(new Vector3(1,0,0),pitch);return h;}

test('cruise knee increases powered forward acceleration, while low-speed response stays the same',()=>{
  for(const speed of [15,40]){
    const a=flight({...DEFAULTS,cruiseBoost:0},speed,-.4),b=flight(DEFAULTS,speed,-.4);
    run(a,STEP,{collectiveAbsolute:1});run(b,STEP,{collectiveAbsolute:1});
    if(speed===15)assert.ok(a.velocity.distanceTo(b.velocity)<1e-10);
    else assert.ok(b.accel.z<a.accel.z-1);
  }
  const old=run(flight(V04_DEFAULTS,0,-25*Math.PI/180),20,{collectiveAbsolute:1});
  const updated=run(flight(DEFAULTS,0,-25*Math.PI/180),20,{collectiveAbsolute:1});
  assert.ok(updated.telemetry().speed>old.telemetry().speed+25);
});
test('speed knee is continuous and does not weaken nose-up flare resistance or add energy through drag',()=>{
  for(const speed of [21.999,22,22.001,33.999,34,34.001]){
    const h=run(flight(DEFAULTS,speed,-.4),STEP,{collectiveAbsolute:1});
    const next=run(flight(DEFAULTS,speed+.001,-.4),STEP,{collectiveAbsolute:1});
    assert.ok(h.accel.distanceTo(next.accel)<.01);
  }
  const a=run(flight({...DEFAULTS,cruiseBoost:0},55,.7),.5,{collectiveAbsolute:0});
  const b=run(flight(DEFAULTS,55,.7),.5,{collectiveAbsolute:0});
  assert.ok(a.velocity.distanceTo(b.velocity)<1e-10);
  for(const pitch of [-.8,0,.8,Math.PI])for(const speed of [-60,60]){
    const h=flight(DEFAULTS,speed,pitch),base=flight({...DEFAULTS,drag:0,rotorDiscDrag:0},speed,pitch),v=h.velocity.clone();
    run(h,STEP);run(base,STEP);assert.ok(h.accel.sub(base.accel).dot(v)<=1e-8);
  }
});
test('lower lateral resistance retains drift without changing pitch and roll response',()=>{
  const old=flight(V04_DEFAULTS),updated=flight(DEFAULTS);
  old.velocity.x=updated.velocity.x=30;
  run(old,3);run(updated,3);
  assert.ok(updated.velocity.x>old.velocity.x*1.2);
  assert.ok(updated.position.x>old.position.x+6);
  const a=run(flight(V04_DEFAULTS),.5,{pitch:1,roll:1}),b=run(flight(DEFAULTS),.5,{pitch:1,roll:1});
  assert.ok(Math.abs(a.rates.x-b.rates.x)<1e-10);assert.ok(Math.abs(a.rates.z-b.rates.z)<1e-10);
});
test('stock v0.4 upgrades, custom legacy settings and explicitly selected v0.4 survive',()=>{
  const stock={...V04_DEFAULTS};migrateHandling(stock,V04_DEFAULTS,'0.4.0');
  assert.equal(stock.lateralDrag,DEFAULTS.lateralDrag);assert.equal(stock.cruiseBoost,DEFAULTS.cruiseBoost);
  const legacy={...V04_DEFAULTS,lateralDrag:.6};delete legacy.cruiseBoost;delete legacy.cruiseThreshold;
  const custom={...DEFAULTS,...legacy};migrateHandling(custom,legacy,'0.4.0');
  assert.equal(custom.lateralDrag,.6);assert.equal(custom.cruiseBoost,0);
  const chosen={...V04_DEFAULTS};migrateHandling(chosen,V04_DEFAULTS,'0.5.0');assert.deepEqual(chosen,V04_DEFAULTS);
});
