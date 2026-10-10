import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Quaternion} from '../dist/vendor/three.module.js';
import {FlightCamera,FlightPose,verticalFov} from '../dist/camera.js';
import {Helicopter,DEFAULTS,STEP} from '../dist/physics.js';
function airborne(config={}){const h=new Helicopter({groundEffect:0,translationalLift:0,weathercock:0,rotorDiscDrag:0,collectiveMode:'hold',...config});h.reset({position:[0,100,0],collective:.5});return h;}
function run(h,seconds,input={}){for(let i=0;i<Math.round(seconds/STEP);i++)h.step(input,STEP);return h;}

test('rotor-disc resistance brakes a flare and redirects motion upward at low collective',()=>{
  const base=airborne(),disc=airborne({rotorDiscDrag:.012});
  for(const h of [base,disc]){h.orientation.setFromAxisAngle(new Vector3(1,0,0),Math.PI/4);h.velocity.z=-55;run(h,.75,{collectiveAbsolute:0});}
  assert.ok(disc.velocity.z>base.velocity.z+3);assert.ok(disc.velocity.y>base.velocity.y+3);
});
test('rotor-disc resistance dissipates energy in both flow directions',()=>{
  for(const speed of [-30,30]){const base=airborne({drag:0}),disc=airborne({drag:0,rotorDiscDrag:.012});base.velocity.y=disc.velocity.y=speed;run(base,STEP);run(disc,STEP);assert.ok((disc.accel.y-base.accel.y)*speed<0);}
});
test('forward drag can preserve cruise momentum without changing sideways or vertical resistance',()=>{
  for(const axis of ['x','y','z']){
    const a=airborne({forwardDrag:1}),b=airborne({forwardDrag:.35});
    a.velocity[axis]=b.velocity[axis]=-40;run(a,.5);run(b,.5);
    if(axis==='z')assert.ok(b.velocity.z<a.velocity.z-1);
    else assert.ok(a.velocity.distanceTo(b.velocity)<1e-10);
  }
});
test('ground parking survives release and positive collective releases the park',()=>{
  const h=new Helicopter({groundEffect:0,groundCollectiveLatch:true});run(h,1,{collective:-1});run(h,3);
  assert.equal(h.collectiveParked,true);assert.equal(h.onGround,true);assert.equal(h.position.y,.95);assert.ok(h.collective<.001);
  run(h,1,{collective:1});assert.equal(h.collectiveParked,false);assert.equal(h.onGround,false);assert.ok(h.position.y>1.5);
});
test('airborne collective release returns to neutral after full down',()=>{
  const h=airborne({collectiveMode:'spring',groundCollectiveLatch:true});run(h,.5,{collective:-1});run(h,2);assert.ok(Math.abs(h.collective-h.config.neutral)<.001);assert.equal(h.collectiveParked,false);
});
test('axis inertia and damping can be fitted independently',()=>{
  const a=airborne(),b=airborne({pitchInertia:2,pitchDamping:1.4});
  run(a,.8,{pitch:1,roll:1});run(b,.8,{pitch:1,roll:1});assert.ok(b.rates.x<a.rates.x*.7);assert.ok(Math.abs(a.rates.z-b.rates.z)<1e-10);
});
test('elevated landing surface receives aircraft height and supports touchdown',()=>{
  const h=airborne();h.position.y=10.98;h.velocity.y=-.8;h.collective=h.rotor=.1;
  const height=(x,z,y)=>y>10.3?10:0;for(let i=0;i<20;i++)h.step({},STEP,height);
  assert.equal(h.crashed,false);assert.equal(h.onGround,true);assert.equal(h.position.y,10.95);
});
test('89-degree horizontal camera does not become 89-degree vertical',()=>{
  const v=verticalFov(89);assert.ok(v>57&&v<59);
  const horizontal=2*Math.atan(Math.tan(v*Math.PI/360)*16/9)*180/Math.PI;assert.ok(Math.abs(horizontal-89)<1e-10);
});
test('cockpit carries the aircraft bank and right-seat origin',()=>{
  const h=new Helicopter();h.reset({position:[40,60,80],heading:1.2});h.orientation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.6));
  const camera=new PerspectiveCamera(),rig=new FlightCamera();rig.update(camera,h,1/60,true,DEFAULTS);
  const expected=new Vector3(.43,.48,-.65).applyQuaternion(h.orientation).add(h.position);
  assert.ok(camera.position.distanceTo(expected)<1e-9);assert.ok(camera.quaternion.angleTo(h.orientation)<1e-7);
});
test('view changes cut to the correct pose without a stale chase-camera sweep',()=>{
  const h=new Helicopter(),camera=new PerspectiveCamera(),rig=new FlightCamera();
  rig.update(camera,h,1/60,false,DEFAULTS);const chase=camera.position.clone();rig.update(camera,h,1/60,true,DEFAULTS);
  assert.ok(camera.position.distanceTo(chase)>10);rig.update(camera,h,1/60,false,DEFAULTS);assert.ok(camera.position.distanceTo(chase)<1e-9);
});
test('chase settling is consistent across render frame rates',()=>{
  const result=fps=>{const h=new Helicopter(),camera=new PerspectiveCamera(),rig=new FlightCamera();rig.update(camera,h,0,false,DEFAULTS);h.position.x=20;for(let i=0;i<fps;i++)rig.update(camera,h,1/fps,false,DEFAULTS);return camera.position;};
  assert.ok(result(30).distanceTo(result(144))<1e-9);
});
test('120 Hz flight poses give the chase camera continuous motion at different display rates',()=>{
  for(const fps of [60,144,165,240]){
    const h={position:new Vector3(0,200,0),orientation:new Quaternion()},pose=new FlightPose(),camera=new PerspectiveCamera(),rig=new FlightCamera();
    pose.reset(h);let accumulator=0,previousRotation=camera.quaternion.clone(),previousPosition=pose.position.clone();
    for(let i=0;i<fps*4;i++){
      accumulator+=1/fps;
      while(accumulator>=STEP){pose.capture(h);h.position.x+=60*STEP;accumulator-=STEP;}
      pose.update(h,accumulator/STEP);rig.update(camera,pose,1/fps,false,DEFAULTS);
      if(i>fps*3){
        assert.ok(Math.abs(pose.position.x-previousPosition.x-60/fps)<1e-9);
        assert.ok(camera.quaternion.angleTo(previousRotation)<1e-6,'steady flight must not alternate camera rotation on empty physics frames');
      }
      previousRotation.copy(camera.quaternion);previousPosition.copy(pose.position);
    }
  }
});
test('rendered rotation takes the short path and reset never interpolates across a teleport',()=>{
  const h={position:new Vector3(),orientation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI-.02)},pose=new FlightPose();pose.reset(h);
  h.orientation.setFromAxisAngle(new Vector3(0,1,0),-Math.PI+.02);h.position.x=10;pose.update(h,.5);
  assert.equal(pose.position.x,5);assert.ok(pose.orientation.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI))<1e-7);
  h.position.set(100,500,300);pose.reset(h);pose.update(h,0);assert.ok(pose.position.equals(h.position));assert.ok(pose.orientation.equals(h.orientation));
});
test('chase camera aims from its final terrain-safe position without feeding clearance back into the spring',()=>{
  const h={position:new Vector3(0,10,0),orientation:new Quaternion()},camera=new PerspectiveCamera(),freeCamera=new PerspectiveCamera(),rig=new FlightCamera(),freeRig=new FlightCamera();
  for(let i=0;i<120;i++){
    h.position.x+=.5;rig.update(camera,h,1/144,false,DEFAULTS,()=>30);freeRig.update(freeCamera,h,1/144,false,DEFAULTS);
    assert.equal(camera.position.y,31);assert.ok(rig.position.distanceTo(freeCamera.position)<1e-9);
    const direction=new Vector3(0,0,-1).applyQuaternion(camera.quaternion),expected=rig.target.clone().sub(camera.position).normalize();
    assert.ok(direction.distanceTo(expected)<1e-9,'terrain clearance must happen before lookAt');
  }
});
