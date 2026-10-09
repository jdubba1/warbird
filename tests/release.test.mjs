import test from 'node:test';
import assert from 'node:assert/strict';
import {Helicopter,DEFAULTS,V07_DEFAULTS,V05_DEFAULTS,migrateHandling,STEP} from '../dist/physics.js';
const run=(h,seconds,input={})=>{for(let i=0;i<Math.round(seconds/STEP);i++)h.step(input,STEP);return h;};
function flight(){const h=new Helicopter({groundEffect:0,translationalLift:0,weathercock:0});h.reset({position:[0,100,0],collective:.5});return h;}
test('releasing down collective reverses descent into sustained climb without ground effect',()=>{
  const h=run(flight(),.2,{collective:-1});assert.ok(h.velocity.y<0);
  run(h,3);assert.ok(h.velocity.y>1.5);assert.ok(Math.abs(h.collective-DEFAULTS.neutral)<.001);
  const height=h.position.y;run(h,5);assert.ok(h.position.y>height+15);assert.ok(h.velocity.y>4);
});
test('repeated down taps descend against climbing idle instead of cumulatively latching low',()=>{
  const h=flight();for(let i=0;i<8;i++){run(h,.12,{collective:-1});run(h,.28);}
  assert.ok(h.position.y<99);assert.ok(h.velocity.y<0);
  run(h,8);assert.ok(h.velocity.y>3);assert.equal(h.collectiveParked,false);
});
test('release after a down tap on the ground restores lift, while holding down stays parked',()=>{
  const h=new Helicopter({groundEffect:0});run(h,.15,{collective:-1});run(h,3);
  assert.equal(h.crashed,false);assert.equal(h.onGround,false);assert.ok(h.position.y>3);
  const parked=new Helicopter({groundEffect:0});run(parked,4,{collective:-1});assert.equal(parked.onGround,true);assert.equal(parked.position.y,.95);
});
test('idle changes migrate stock settings and preserve custom neutral, hold mode and older presets',()=>{
  const stock={...V07_DEFAULTS};migrateHandling(stock,V07_DEFAULTS,'0.7.0');assert.equal(stock.neutral,.54);assert.equal(stock.groundCollectiveLatch,false);
  const legacy={...V05_DEFAULTS};delete legacy.collectivePower;const old={...DEFAULTS,...legacy};migrateHandling(old,legacy,'0.5.0');assert.equal(old.neutral,.54);assert.equal(old.groundCollectiveLatch,false);
  for(const saved of [{...V07_DEFAULTS,neutral:.6},{...V07_DEFAULTS,collectiveMode:'hold'},{...V05_DEFAULTS},{...V07_DEFAULTS}]){
    const config={...saved};migrateHandling(config,saved,'0.8.0');assert.deepEqual(config,saved);
  }
  for(const saved of [{...V07_DEFAULTS,neutral:.6},{...V07_DEFAULTS,collectiveMode:'hold'}]){const config={...saved};migrateHandling(config,saved,'0.7.0');assert.deepEqual(config,saved);}
});
