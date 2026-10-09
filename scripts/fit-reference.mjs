// Conditional fit: raw mouse deltas, initial attitude/rates and game axis policy
// are not observed. This script reports a candidate, never changes game defaults.
import {Helicopter,STEP,DEFAULTS,V04_DEFAULTS,PREVIOUS_DEFAULTS} from '../dist/physics.js';
import {Vector3} from '../dist/vendor/three.module.js';
import {readFileSync} from 'node:fs';
const evidence=JSON.parse(readFileSync(new URL('../reference/hieb-landings.json',import.meta.url),'utf8'));
const sourceRows=name=>evidence.landings.find(l=>l.name.startsWith(name)).samples;
const inputAt=(name,t)=>{const rows=evidence.landings.find(l=>l.name.startsWith(name)).inputs;const keys=rows.findLast(r=>r.seconds<=t)?.keys??[];return {pitch:keys.includes('Space')?1:0,roll:keys.includes('E')?1:0,yaw:keys.includes('D')?1:0,collective:Number(keys.includes('W'))-Number(keys.includes('S'))};};
const trace={start:331,speed:227,vy:-4,rotor:1,pitch:0,initialAltitude:32,
 samples:sourceRows('second').filter(s=>s.seconds>=332&&s.seconds<=335).map(s=>[s.seconds,s.speedKmh,s.aslM,s.heading]),
 input:t=>inputAt('second',t)};
const holdout={start:292,speed:267,vy:3,rotor:.5,pitch:0,initialAltitude:25,
 samples:sourceRows('first').filter(s=>s.seconds===294||s.seconds===296).map(s=>[s.seconds,s.speedKmh,s.aslM]),
 input:t=>inputAt('first',t)};
const wrap=a=>(a+540)%360-180;
function evaluate(config,source,details=false){
 const h=new Helicopter({...config,groundEffect:0});h.reset({position:[0,150,0],velocity:[0,source.vy,-source.speed/3.6],collective:source.rotor});
 h.orientation.setFromAxisAngle(new Vector3(1,0,0),source.pitch*Math.PI/180);
 let next=0,error=0;const rows=[];
 for(let i=0;next<source.samples.length;i++){
  const time=source.start+i*STEP;
  if(time+STEP/2>=source.samples[next][0]){
   const sample=source.samples[next++],t=h.telemetry(),alt=t.y-150+source.initialAltitude;
   error+=((t.speed-sample[1])/20)**2+((alt-sample[2])/8)**2;
   if(sample[3]!==undefined)error+=(wrap(t.heading-(sample[3]-57))/25)**2;
   if(details)rows.push({time:sample[0],speed:t.speed,altitude:alt,heading:sample[3]===undefined?undefined:(t.heading+57)%360,observed:sample.slice(1)});
  }
  h.step(source.input(time),STEP);
 }
 return details?rows:error/source.samples.length;
}
const bounds={pitchPower:[2,9],rollPower:[1.5,7],yawPower:[.5,5],angularInertia:[.6,2.5],angularDamping:[1,3],rotorDiscDrag:[0,.12],forwardDrag:[.1,1.5]};
let seed=92614;const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
const previous={...PREVIOUS_DEFAULTS,forwardDrag:1,rotorDiscDrag:.012};
let best={...DEFAULTS},score=evaluate(best,trace);
for(let i=0;i<1200;i++){
 const candidate={...best};
 const key=Object.keys(bounds)[i%Object.keys(bounds).length], [lo,hi]=bounds[key];
 candidate[key]=Math.max(lo,Math.min(hi,candidate[key]+(random()-.5)*(hi-lo)*(i<600?.4:.12)));
 const result=evaluate(candidate,trace);
 if(result<score){best=candidate;score=result;}
}
console.log(JSON.stringify({caveat:'Conditional diagnostic only. Unmeasured initial attitude/rates, mouse deltas, HUD speed convention and camera heading lag prevent a unique physical fit.',parameters:Object.fromEntries(Object.keys(bounds).map(k=>[k,best[k]])),model:'rotor-lab-v0.5-reference-estimated',referenceV04Score:evaluate(V04_DEFAULTS,trace),referenceV04Holdout:evaluate(V04_DEFAULTS,holdout),referenceV03Score:evaluate(PREVIOUS_DEFAULTS,trace),referenceV03Holdout:evaluate(PREVIOUS_DEFAULTS,holdout),previousScore:evaluate(previous,trace),baselineScore:evaluate(DEFAULTS,trace),candidateScore:score,previousHoldout:evaluate(previous,holdout),baselineHoldout:evaluate(DEFAULTS,holdout),candidateHoldout:evaluate(best,holdout),baseline:evaluate(DEFAULTS,trace,true),candidate:evaluate(best,trace,true),holdout:evaluate(best,holdout,true)},null,2));
