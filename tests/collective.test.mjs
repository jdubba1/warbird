import test from 'node:test';
import assert from 'node:assert/strict';
import {Helicopter,DEFAULTS,V05_DEFAULTS,V04_DEFAULTS,migrateHandling,STEP} from '../dist/physics.js';
import {Vector3} from '../dist/vendor/three.module.js';
const run=(h,s,input)=>{for(let i=0;i<Math.round(s/STEP);i++)h.step(input,STEP);return h;};
function flight(config,collective=.5){const h=new Helicopter({...config,groundEffect:0,translationalLift:0,weathercock:0});h.reset({position:[0,1000,0],collective});return h;}
test('full collective gives substantially more climb and height from hover',()=>{
  const old=run(flight(V05_DEFAULTS),5,{collective:1}),newer=run(flight(DEFAULTS),5,{collective:1});
  assert.ok(newer.velocity.y>old.velocity.y*1.5);assert.ok(newer.position.y-1000>(old.position.y-1000)*1.7);
  assert.ok(newer.velocity.y>16&&newer.velocity.y<17);
});
test('extra collective power preserves hover and the low-collective descent curve',()=>{
  for(const collective of [0,.25,.5]){
    const a=run(flight(V05_DEFAULTS,collective),2,{collectiveAbsolute:collective}),b=run(flight(DEFAULTS,collective),2,{collectiveAbsolute:collective});
    assert.ok(a.velocity.distanceTo(b.velocity)<1e-10);assert.ok(a.position.distanceTo(b.position)<1e-10);
    if(collective===.5)assert.ok(b.velocity.length()<1e-10);
  }
});
test('banked thrust gains climb authority without bypassing attitude or inertia',()=>{
  const a=flight(V05_DEFAULTS,1),b=flight(DEFAULTS,1);
  for(const h of [a,b])h.orientation.setFromAxisAngle(new Vector3(0,0,1),Math.PI/3);
  run(a,.5,{collectiveAbsolute:1});run(b,.5,{collectiveAbsolute:1});
  assert.ok(a.velocity.y<0);assert.ok(b.velocity.y>0);assert.ok(Math.abs(b.velocity.x)>Math.abs(a.velocity.x));assert.equal(a.orientation.angleTo(b.orientation),0);
});
test('legacy stock collective upgrades while custom lift and explicit older presets survive',()=>{
  const saved={...V05_DEFAULTS};delete saved.collectivePower;const stock={...DEFAULTS,...saved};migrateHandling(stock,saved,'0.5.0');assert.equal(stock.collectivePower,2.5);
  for(const legacy of [{...saved,lift:1.2},{...V04_DEFAULTS}]){delete legacy.collectivePower;const config={...DEFAULTS,...legacy};migrateHandling(config,legacy,'0.5.0');assert.equal(config.collectivePower,1);assert.equal(config.lift,legacy.lift);}
  for(const explicit of [{...V05_DEFAULTS},{...DEFAULTS,collectivePower:3}]){const config={...explicit};migrateHandling(config,explicit,'0.7.0');assert.deepEqual(config,explicit);}
});
