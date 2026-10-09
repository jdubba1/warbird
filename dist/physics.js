import {Vector3, Quaternion, Euler} from './vendor/three.module.js';

export const ORIGINAL_DEFAULTS = Object.freeze({
  pitchPower:2.5, rollPower:3.3, yawPower:1.7, angularDamping:1.8,
  angularInertia:1, lateralDrag:1,
  inputLag:0.12, rotorLag:0.24, lift:1.0, drag:1.0, collectivePower:1,
  collectiveRate:0.55, collectiveMode:'spring', neutral:0.5,
  translationalLift:0.08, groundEffect:0.06, weathercock:0.015,
  stability:0, mouseRoll:0.003, mousePitch:0.002, mouseCurve:1,
  fov:85, sound:true,
  groundCollectiveLatch:false,rotorDiscDrag:0,forwardDrag:1,forwardDiscDrag:1,
  yawInputLag:.12,yawSpeedScale:32,cruiseBoost:0,cruiseThreshold:22,
  pitchInertia:1,rollInertia:1,yawInertia:1,
  pitchDamping:1,rollDamping:1,yawDamping:1
});
export const PREVIOUS_DEFAULTS = Object.freeze({...ORIGINAL_DEFAULTS,
  angularInertia:1.65, lateralDrag:0.45, rotorLag:0.34,
  mousePitch:.003*6/28,
  cockpitFov:89,chaseFov:110,chaseDistance:12,chaseHeight:3.4,
  chaseLookAhead:8,cameraLag:.16,
  groundCollectiveLatch:true,rotorDiscDrag:.06,forwardDrag:.35
});
export const V04_DEFAULTS = Object.freeze({...PREVIOUS_DEFAULTS,
  forwardDrag:.2,forwardDiscDrag:.25,
  yawPower:2.45,yawInertia:.8,yawInputLag:.07,yawSpeedScale:65
});
export const V05_DEFAULTS = Object.freeze({...V04_DEFAULTS,lateralDrag:.28,cruiseBoost:.55});
export const V07_DEFAULTS = Object.freeze({...V05_DEFAULTS,collectivePower:2.5,cockpitFov:105});
export const V08_DEFAULTS = Object.freeze({...V07_DEFAULTS,neutral:.54,groundCollectiveLatch:false});
export const DEFAULTS = Object.freeze({...V08_DEFAULTS,yawPower:V08_DEFAULTS.yawPower*1.5});
// Upgrade untouched reference values; preserve deliberate tuning and the original preset.
export function migrateHandling(config,saved={},version){
  if(!saved)return;
  // Older profiles have no power knob. Upgrade stock v0.5 thrust only;
  // preserve tuned lift and deliberately selected earlier profiles.
  if(saved.collectivePower===undefined){
    const stock=saved.lift===V05_DEFAULTS.lift&&saved.rotorLag===V05_DEFAULTS.rotorLag&&saved.lateralDrag===V05_DEFAULTS.lateralDrag&&saved.cruiseBoost===V05_DEFAULTS.cruiseBoost;
    config.collectivePower=stock?DEFAULTS.collectivePower:1;
  }
  // Earlier stock Little Bird settings returned to hover and latched parked
  // after a down tap on contact. Release now restores a climbing idle instead.
  const currentHandling=(saved.collectivePower===undefined||saved.collectivePower>=2.5)&&saved.lateralDrag===V07_DEFAULTS.lateralDrag&&saved.cruiseBoost===V07_DEFAULTS.cruiseBoost;
  if(!['0.8.0','0.10.0'].includes(version)&&currentHandling&&saved.collectiveMode==='spring'&&saved.neutral===V07_DEFAULTS.neutral){
    config.neutral=DEFAULTS.neutral;
    if(saved.groundCollectiveLatch===V07_DEFAULTS.groundCollectiveLatch)config.groundCollectiveLatch=DEFAULTS.groundCollectiveLatch;
  }
  // Upgrade only the current stock pedal tune. Custom yaw and deliberately
  // selected historical handling retain their coefficients across reloads.
  if(version!=='0.10.0'&&currentHandling&&config.neutral===V08_DEFAULTS.neutral&&config.groundCollectiveLatch===false&&saved.yawPower===V08_DEFAULTS.yawPower)config.yawPower=DEFAULTS.yawPower;
  if(['0.5.0','0.7.0','0.8.0','0.10.0'].includes(version))return;
  if(saved.cruiseBoost===undefined)config.cruiseBoost=0;
  if(saved.angularInertia===1&&saved.lateralDrag===1&&saved.rotorLag===.24)return;
  if(version!=='0.4.0')for(const key of ['forwardDrag','yawPower','yawInertia'])if(saved[key]===PREVIOUS_DEFAULTS[key])config[key]=V04_DEFAULTS[key];
  // Only migrate the complete stock v0.4 profile. A selected older preset or
  // custom coefficients should survive an art/map update.
  if(Object.keys(V04_DEFAULTS).filter(k=>typeof V04_DEFAULTS[k]==='number'&& !['mousePitch','mouseRoll','mouseCurve','fov','cockpitFov','chaseFov','chaseDistance','chaseHeight','chaseLookAhead','cameraLag'].includes(k)).every(k=>saved[k]===undefined&&['cruiseBoost','cruiseThreshold','collectivePower'].includes(k)||saved[k]===V04_DEFAULTS[k])){
    config.lateralDrag=DEFAULTS.lateralDrag;config.cruiseBoost=DEFAULTS.cruiseBoost;
  }
}
export const STEP = 1/120;
export const G = 9.81;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const expApproach = (a,b,dt,tau) => a+(b-a)*(1-Math.exp(-dt/Math.max(0.001,tau)));
export const smoothRange=(lo,hi,value)=>{const t=clamp((value-lo)/(hi-lo),0,1);return t*t*(3-2*t);};

// Body axes: X right, Y up, -Z nose. Position in metres; rates in rad/s.
// Coefficients are tunable estimates, not extracted WARDOGS values.
export class Helicopter {
  constructor(config={}) {
    this.config = {...DEFAULTS,...config};
    this.position = new Vector3(); this.velocity = new Vector3();
    this.orientation = new Quaternion(); this.rates = new Vector3();
    this.cyclic = new Vector3(); this.localVelocity = new Vector3();
    this.up = new Vector3(0,1,0); this.forward = new Vector3(0,0,-1);
    this.accel = new Vector3(); this.temp = new Vector3();
    this.inv = new Quaternion(); this.delta = new Quaternion();
    this.reset();
  }
  reset({position=[0,0.95,0],velocity=[0,0,0],collective=0,heading=0,ground=0}={}) {
    this.position.fromArray(position); this.velocity.fromArray(velocity);
    this.orientation.setFromAxisAngle(new Vector3(0,1,0),-heading);
    this.rates.set(0,0,0); this.cyclic.set(0,0,0);
    this.collective = collective; this.rotor = collective;
    this.crashed = false; this.onGround = position[1] <= ground+0.951;
    this.time = 0; this.impact = null;this.lastLanding=null;
    this.collectiveParked=this.onGround&&collective===0;
  }
  step(input={}, dt=STEP, surface=()=>0, obstacles=[]) {
    if(this.crashed) return;
    const cfg=this.config;
    this.time+=dt;
    // Cyclic/tail-rotor demand is damped before it drives angular acceleration.
    this.cyclic.x=expApproach(this.cyclic.x,clamp(input.pitch||0,-1,1),dt,cfg.inputLag);
    this.cyclic.y=expApproach(this.cyclic.y,clamp(input.yaw||0,-1,1),dt,cfg.yawInputLag);
    this.cyclic.z=expApproach(this.cyclic.z,clamp(input.roll||0,-1,1),dt,cfg.inputLag);
    if(input.collectiveAbsolute !== undefined) this.collective=clamp(input.collectiveAbsolute,0,1);
    else if(cfg.collectiveMode==='hold') this.collective=clamp(this.collective+(input.collective||0)*cfg.collectiveRate*dt,0,1);
    else {
      if(cfg.groundCollectiveLatch&&this.onGround&&(input.collective||0)<0)this.collectiveParked=true;
      if((input.collective||0)>0||!this.onGround)this.collectiveParked=false;
      const target=(input.collective||0)>0?1:(input.collective||0)<0?0:
        cfg.groundCollectiveLatch&&this.collectiveParked?0:cfg.neutral;
      this.collective=expApproach(this.collective,target,dt,0.16);
    }
    this.rotor=expApproach(this.rotor,this.collective,dt,cfg.rotorLag);
    this.inv.copy(this.orientation).invert();
    this.localVelocity.copy(this.velocity).applyQuaternion(this.inv);
    this.up.set(0,1,0).applyQuaternion(this.orientation);
    this.forward.set(0,0,-1).applyQuaternion(this.orientation);
    const horizontal=Math.hypot(this.velocity.x,this.velocity.z);
    const yawAuthority=1/(1+horizontal/cfg.yawSpeedScale);
    const damping=cfg.angularDamping;
    // Inertia slows both acceleration and decay without reducing steady authority.
    // Increasing input latency alone would feel disconnected rather than heavy.
    const angularStep=dt/Math.max(.2,cfg.angularInertia);
    this.rates.x+=(this.cyclic.x*cfg.pitchPower-damping*cfg.pitchDamping*this.rates.x)*angularStep/Math.max(.2,cfg.pitchInertia);
    this.rates.y+=(-this.cyclic.y*cfg.yawPower*yawAuthority-damping*cfg.yawDamping*this.rates.y-cfg.weathercock*this.localVelocity.x*Math.min(1,horizontal/20))*angularStep/Math.max(.2,cfg.yawInertia);
    this.rates.z+=(-this.cyclic.z*cfg.rollPower-damping*cfg.rollDamping*this.rates.z)*angularStep/Math.max(.2,cfg.rollInertia);
    if(cfg.stability>0 && this.up.y>0) {
      const bodyWorldUp=this.temp.set(0,1,0).applyQuaternion(this.inv);
      this.rates.x+=bodyWorldUp.z*cfg.stability*angularStep;
      this.rates.z-=bodyWorldUp.x*cfg.stability*angularStep;
    }
    // Quaternion integration supports inverted flight without Euler singularities.
    const rate=this.rates.length();
    if(rate>1e-10) {this.temp.copy(this.rates).divideScalar(rate); this.delta.setFromAxisAngle(this.temp,rate*dt); this.orientation.multiply(this.delta).normalize();}
    this.up.set(0,1,0).applyQuaternion(this.orientation);
    const agl=Math.max(0,this.position.y-surface(this.position.x,this.position.z,this.position.y)-0.95);
    const ge=cfg.groundEffect*Math.exp(-agl/4);
    const etl=cfg.translationalLift*(1-Math.exp(-horizontal*horizontal/180));
    // More thrust above hover, with the same neutral and low-collective curve.
    // This is feedback tuning, not a measured WARDOGS engine parameter.
    const power=clamp(cfg.collectivePower??1,1,4);
    const thrust=G*(0.12+1.76*this.rotor+.88*(power-1)*Math.max(0,2*this.rotor-1))*cfg.lift*(1+ge+etl);
    this.accel.copy(this.up).multiplyScalar(thrust); this.accel.y-=G;
    const discFlow=this.velocity.dot(this.up);
    // User-reported speed knee, represented as a smooth reduction in powered
    // cruise resistance. It adds no forward force, never rotates velocity, and
    // fades away when flaring or unloading the collective. Threshold/strength
    // are provisional until a controlled HUD acceleration run is available.
    const cruise=smoothRange(cfg.cruiseThreshold,cfg.cruiseThreshold+12,-this.localVelocity.z)
      *this.rotor*this.rotor*clamp(this.up.y,0,1)*smoothRange(0,6,discFlow);
    const efficiency=1-clamp(cfg.cruiseBoost,0,.85)*cruise;
    // Fuselage drag is weaker along the nose than sideways or vertically.
    const v=this.localVelocity;
    this.temp.set(-v.x*(0.11+0.017*Math.abs(v.x))*cfg.lateralDrag, -v.y*(0.055+0.018*Math.abs(v.y)), -v.z*(0.018+0.0035*Math.abs(v.z))*cfg.forwardDrag*efficiency).multiplyScalar(cfg.drag).applyQuaternion(this.orientation);
    this.accel.add(this.temp);
    // Airflow normal to the rotor disc opposes that flow. A nose-up flare
    // redirects forward momentum upward even with collective lowered.
    // The mechanism is supported by the guide; this coefficient is estimated.
    // Powered forward flight and nose-up flares have different resistance.
    // This asymmetry is feel tuning, not measured rotor aerodynamics.
    const forwardFlow=smoothRange(0,10,-this.localVelocity.z);
    const discResistance=discFlow>0?(1+(cfg.forwardDiscDrag-1)*this.rotor*forwardFlow)*efficiency:1;
    this.accel.addScaledVector(this.up,-cfg.rotorDiscDrag*discResistance*discFlow*Math.abs(discFlow));
    this.velocity.addScaledVector(this.accel,dt); this.position.addScaledVector(this.velocity,dt);
    const floor=surface(this.position.x,this.position.z,this.position.y)+0.95;
    const wasGround=this.onGround;this.onGround=false;
    if(this.position.y<=floor) {
      const sink=Math.max(0,-this.velocity.y), speed=Math.hypot(this.velocity.x,this.velocity.z);
      const tilt=Math.acos(clamp(this.up.y,-1,1))*180/Math.PI;
      if(!wasGround)this.lastLanding={sink,speed,tilt};
      this.position.y=floor;
      if(sink>4 || speed>9 || tilt>20) {this.crash('Hard landing',{sink,speed,tilt});return;}
      this.onGround=true; this.velocity.y=Math.max(0,this.velocity.y);
      const friction=Math.exp(-3.5*dt);
      this.velocity.x*=friction;this.velocity.z*=friction;this.rates.multiplyScalar(Math.exp(-4*dt));
    }
    for(const b of obstacles){
      let strike=false;
      if(b.type==='tunnel'){
        const dy=this.position.y-b.bottom,r=Math.hypot(this.position.x-b.x,dy);
        strike=dy>-.7&&Math.abs(this.position.z-b.z)<b.hz+.8&&r>b.radius-.8&&r<b.outerRadius+.8;
      }else if(b.type==='tree'){
        // Forgiving inner foliage cone and trunk. No helicopter-radius inflation:
        // the visible branches/tip remain clear to skim through.
        const distance=Math.hypot(this.position.x-b.x,this.position.z-b.z);
        const radius=b.radius*(1-clamp((this.position.y-b.bottom)/(b.top-b.bottom),0,1));
        strike=(this.position.y>b.bottom&&this.position.y<b.top&&distance<radius)
          ||(this.position.y>b.base&&this.position.y<b.trunkTop&&distance<b.trunkRadius);
      }else if(b.type==='spire'){
        const radius=b.radius*(1-clamp((this.position.y-b.bottom)/(b.top-b.bottom),0,1));
        strike=this.position.y<b.top+.7&&this.position.y>b.bottom-1&&Math.hypot(this.position.x-b.x,this.position.z-b.z)<radius+.8;
      }else strike=this.position.y < b.top+0.7 && this.position.y>b.bottom-1 && Math.abs(this.position.x-b.x)<b.hx+0.8 && Math.abs(this.position.z-b.z)<b.hz+0.8;
      if(strike){this.crash('Obstacle strike');break;}
    }
    if(!Number.isFinite(this.position.lengthSq()) || this.position.length()>12000) this.crash('Outside the practice range');
  }
  crash(reason,details={}) {this.crashed=true;this.impact={reason,...details};this.velocity.set(0,0,0);this.rates.set(0,0,0);}
  telemetry() {
    const e=new Euler().setFromQuaternion(this.orientation,'YXZ');
    const forward=new Vector3(0,0,-1).applyQuaternion(this.orientation);
    const up=new Vector3(0,1,0).applyQuaternion(this.orientation);
    return {t:this.time,x:this.position.x,y:this.position.y,z:this.position.z,
      vx:this.velocity.x,vy:this.velocity.y,vz:this.velocity.z,
      speed:Math.hypot(this.velocity.x,this.velocity.z)*3.6,
      heading:(Math.atan2(forward.x,-forward.z)*180/Math.PI+360)%360,
      pitch:Math.asin(clamp(forward.y,-1,1))*180/Math.PI,
      roll:-e.z*180/Math.PI,tilt:Math.acos(clamp(up.y,-1,1))*180/Math.PI,
      p:this.rates.x,q:this.rates.y,r:this.rates.z,qx:this.orientation.x,qy:this.orientation.y,qz:this.orientation.z,qw:this.orientation.w,collective:this.collective,rotor:this.rotor,
      crashed:this.crashed,onGround:this.onGround,collectiveParked:this.collectiveParked};
  }
}
