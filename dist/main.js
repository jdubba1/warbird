import * as T from './vendor/three.module.js';
import {PALETTE,MONO_FONT} from './palette.js';
import {Helicopter,DEFAULTS,V05_DEFAULTS,V04_DEFAULTS,PREVIOUS_DEFAULTS,ORIGINAL_DEFAULTS,migrateHandling,STEP,clamp} from './physics.js';
import {Controls,BINDINGS,keyLabel} from './controls.js';
import {makeWorld,makeHelicopter,makeCockpit,groundHeight,pads,gates} from './world.js';
import {DoodleRenderer,setAccent} from './rendering.js';
import {FlightCamera,verticalFov} from './camera.js';
import {Miniguns,aimPoint} from './weapons.js';
import {setMap,mapId} from './terrain.js';

const $=id=>document.getElementById(id);
const config={...DEFAULTS},bindings={...BINDINGS};
let look='doodle',gunZero=30;
try {
  const saved=JSON.parse(localStorage.getItem('rotor-lab-v1')||'null');
  if(saved){if([30,50,100].includes(saved.gunZero))gunZero=saved.gunZero;look=saved.look==='natural'?'natural':'doodle';setMap(saved.map);for(const k of Object.keys(DEFAULTS)){const v=saved.config?.[k];if(typeof v===typeof DEFAULTS[k]&&(typeof v!=='number'||Number.isFinite(v)))config[k]=v;}for(const k of Object.keys(BINDINGS)){const v=saved.bindings?.[k];if(typeof v==='string'&&v.length<32)bindings[k]=v;}}
  // Upgrade only the unchanged v1 thrust response. Preserve deliberate tuning.
  if(saved && saved.config?.angularInertia===undefined && saved.config?.rotorLag===ORIGINAL_DEFAULTS.rotorLag)config.rotorLag=DEFAULTS.rotorLag;
  if(saved)migrateHandling(config,saved.config,saved.version);
  if(saved&&!['0.7.0','0.8.0','0.10.0'].includes(saved.version)&&saved.config?.cockpitFov===V05_DEFAULTS.cockpitFov)config.cockpitFov=DEFAULTS.cockpitFov;
  if(saved&&saved.config?.mousePitch===ORIGINAL_DEFAULTS.mousePitch&&saved.config?.mouseRoll===ORIGINAL_DEFAULTS.mouseRoll)config.mousePitch=DEFAULTS.mousePitch;
}catch{}
const heli=new Helicopter(config);
let renderer;
try {renderer=new T.WebGLRenderer({canvas:$('scene'),antialias:true,powerPreference:'default'});}
catch { $('notification').textContent='WebGL 2 unavailable. Enable hardware acceleration, then reload.';$('notification').classList.add('show');$('fly').disabled=true;throw new Error('WebGL unavailable');}
renderer.setPixelRatio(Math.min(devicePixelRatio,1));
const visual=new DoodleRenderer(renderer);visual.setStyle(look);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(verticalFov(config.chaseFov),innerWidth/innerHeight,.04,10000);
let world=makeWorld(scene);const aircraft=makeHelicopter();scene.add(aircraft.group);
const cockpitModel=makeCockpit();cockpitModel.setStyle(look);camera.add(cockpitModel.group);scene.add(camera);cockpitModel.group.visible=false;
const flightCamera=new FlightCamera();
const weapons=new Miniguns(world.root,{zero:gunZero});scene.add(weapons.marks);aircraft.setGunZero(gunZero);
const hud=$('hud').getContext('2d'),map=$('map').getContext('2d');
let mode='free',active=false,hasFlown=false,cockpit=false,missionDone=false,hoverTime=0,landingTime=0,gateIndex=0;
let accumulator=0,previous=performance.now(),lastHUD=0,logClock=0,notificationTimer,dragChosen=false;
let needsRender=true;
let input={pitch:0,roll:0,yaw:0,collective:0},pulse=null,recording=[],recordDropped=false,sessionId=0;
const MAX_RECORDS=24000; // Twenty minutes at 20 Hz, bounded in memory.
const previousPos=new T.Vector3();
camera.position.set(10,7.5,17);camera.lookAt(0,1,-8);

function dismissNotification(){clearTimeout(notificationTimer);$('notification').classList.remove('show');$('notification').textContent='';}
function toast(text,duration=4500){$('notification').textContent=text;$('notification').classList.add('show');clearTimeout(notificationTimer);if(duration>0)notificationTimer=setTimeout(dismissNotification,duration);}
function save(){heli.config={...config};try{localStorage.setItem('rotor-lab-v1',JSON.stringify({version:'0.10.0',config,bindings,map:mapId,look,gunZero}));$('save-status').textContent='Saved';}catch{$('save-status').textContent='Save unavailable';}}
function stopFlight(){
  active=false;accumulator=0;controls.enabled=false;controls.clear();audio.volume(0);
  document.body.classList.remove('flying');
  if(document.pointerLockElement)document.exitPointerLock();
}
const controls=new Controls($('scene'),config,bindings,{reset:()=>resetFlight(),view:()=>setView(!cockpit),pause:()=>setup(),lock:locked=>{
  if(locked){active=true;hasFlown=true;accumulator=0;previous=performance.now();document.body.classList.add('flying');updateObjective();}
  else if(active)setup();
},error:msg=>{setup();toast(msg,8000);}});

function resetFlight(){
  dismissNotification();weapons.reset();
  needsRender=true;
  flightCamera.reset();
  sessionId++;hoverTime=landingTime=gateIndex=0;missionDone=false;logClock=0;pulse=null;controls.clear();
  const home=pads[0],height=groundHeight(home.x,home.z);
  const starts={free:{position:[home.x,height+.95,home.z],ground:height,heading:Math.PI},hover:{position:[home.x,height+12.95,home.z],heading:Math.PI,collective:.48},slalom:{position:[0,24,40],velocity:[0,0,-12],collective:.5},landing:{position:[0,groundHeight(0,220)+32,220],velocity:[0,0,-25],collective:.5}};
  heli.reset(starts[mode]);accumulator=0;previousPos.copy(heli.position);$('mission-live').classList.remove('completed');
  for(let i=0;i<world.gateMeshes.length;i++){world.gateMeshes[i].visible=mode==='slalom';setAccent(world.gateMeshes[i].material,1);}
  for(const pole of world.gatePoles)pole.visible=mode==='slalom';
  updateObjective();updateHUD();
  $('fly').textContent=hasFlown?'Resume':'Fly';
}
function chooseMode(next){mode=next;$('challenge').value=mode;resetFlight();}
$('gun-zero').value=gunZero;
$('gun-zero').addEventListener('change',e=>{gunZero=Number(e.target.value);weapons.zero=gunZero;aircraft.setGunZero(gunZero);save();needsRender=true;});
$('challenge').addEventListener('change',e=>chooseMode(e.target.value));
$('look-select').value=look;
$('look-select').addEventListener('change',e=>{look=e.target.value==='natural'?'natural':'doodle';visual.setStyle(look);cockpitModel.setStyle(look);save();needsRender=true;});
function startFlight(drag=false){
  if(heli.crashed)resetFlight();dragChosen=drag;
  if($('setup-dialog').open)$('setup-dialog').close();
  audio.start();if(drag)controls.startDrag();else controls.lock();
}
$('fly').addEventListener('click',()=>startFlight());
$('drag-flight').addEventListener('click',()=>startFlight(true));
$('restart').addEventListener('click',resetFlight);
$('scene').addEventListener('click',()=>{if(!controls.locked&&!dragChosen&&!$('setup-dialog').open)startFlight();});
addEventListener('keydown',e=>{
  if(heli.crashed&&e.code==='KeyR'&&!e.repeat&&!controls.capture){e.preventDefault();if($('setup-dialog').open)$('setup-dialog').close();resetFlight();controls.enabled=true;return;}
  if(e.code==='Escape'&&!e.repeat&&!controls.capture&&!controls.enabled&&!$('setup-dialog').open){e.preventDefault();setup();return;}
  if(!active&&controls.enabled&&!$('setup-dialog').open&&!e.target.matches('input,select,textarea,button')&&(Object.values(bindings).includes(e.code)||e.code==='KeyF')){audio.start();controls.startDrag(false);}
});
function setView(value){needsRender=true;cockpit=value;document.body.classList.toggle('cockpit-view',cockpit);cockpitModel.group.visible=cockpit;aircraft.group.visible=!cockpit;$('view').innerHTML=cockpit?'Cockpit <span>C</span>':'Chase <span>C</span>';flightCamera.update(camera,heli,0,cockpit,config);}
$('view').addEventListener('click',()=>{setView(!cockpit);$('view').blur();});

function updateObjective(){
  $('mission-live').hidden=mode==='free'&&!pulse;
  let text='',progress=0;
  if(pulse){text=heli.time<5?'Neutral':heli.time<6?'Input':'Coast';progress=heli.time/11;}
  else if(missionDone){text='Complete';progress=1;}
  else if(mode==='free'){text='';}
  else if(mode==='hover'){text=`Hover ${hoverTime.toFixed(1)} / 15 s`;progress=hoverTime/15;}
  else if(mode==='slalom'){text=`${gateIndex} / 6 gates`;progress=gateIndex/6;}
  else{text='Landing: '+landingTime.toFixed(1)+' / 2 s';progress=landingTime/2;}
  $('objective').textContent=text;$('progress-fill').style.width=`${clamp(progress,0,1)*100}%`;
}
function complete(text){missionDone=true;$('mission-live').classList.add('completed');toast(text,6000);}
function updateMission(dt){
  if(missionDone||pulse||heli.crashed)return;
  if(mode==='hover'){
    const agl=heli.position.y-groundHeight(heli.position.x,heli.position.z)-.95;
    const good=Math.hypot(heli.position.x-pads[0].x,heli.position.z-pads[0].z)<6&&Math.abs(agl-12)<2&&Math.hypot(heli.velocity.x,heli.velocity.z)<2&&Math.abs(heli.velocity.y)<1;
    hoverTime=good?hoverTime+dt:0;if(hoverTime>=15)complete('Hover complete');
  }else if(mode==='slalom'){
    const g=gates[gateIndex];if(!g)return;
    const z0=previousPos.z-g.z,z1=heli.position.z-g.z;
    if(z0>=0&&z1<0){const fraction=z0/(z0-z1);const x=T.MathUtils.lerp(previousPos.x,heli.position.x,fraction),y=T.MathUtils.lerp(previousPos.y,heli.position.y,fraction);
      if(Math.hypot(x-g.x,y-g.y)<11.2){setAccent(world.gateMeshes[gateIndex].material,2);gateIndex++;if(gateIndex===6)complete(`All six gates cleared in ${heli.time.toFixed(1)} s.`);else toast(`Gate ${gateIndex} cleared.`,1500);}
      else toast('Missed the ring. Turn back and approach it from the south.',4000);
    }
  }else if(mode==='landing'){
    const l=heli.lastLanding;
    const good=heli.onGround&&Math.hypot(heli.position.x,heli.position.z)<12&&l&&l.sink<1.5&&l.speed<3&&l.tilt<8;
    landingTime=good?landingTime+dt:0;if(landingTime>=2)complete(`Clean touchdown. ${l.sink.toFixed(1)} m/s sink, ${(l.speed*3.6).toFixed(1)} km/h drift.`);
  }
}

const fieldLabels={pitchUp:'Pitch nose up',pitchDown:'Pitch nose down',rollLeft:'Roll left',rollRight:'Roll right',yawLeft:'Yaw left',yawRight:'Yaw right',collectiveUp:'Raise collective',collectiveDown:'Lower collective'};
function renderBindings(){
  const list=$('binding-list');list.replaceChildren();
  for(const [label,actions,directions]of [['Pitch',['pitchDown','pitchUp'],['↓','↑']],['Roll',['rollLeft','rollRight'],['←','→']],['Yaw',['yawLeft','yawRight'],['←','→']],['Collective',['collectiveDown','collectiveUp'],['−','+']]]){
    const row=document.createElement('div');row.className='binding-row';const span=document.createElement('span');span.textContent=label;row.append(span);
    actions.forEach((action,i)=>{
      const button=document.createElement('button');button.textContent=`${directions[i]} ${keyLabel(bindings[action])}`;button.setAttribute('aria-label',`Rebind ${fieldLabels[action]}`);button.title=fieldLabels[action];
      button.addEventListener('click',()=>{button.textContent='Key?';controls.capture=code=>{
        if(['Escape','KeyR','KeyC','KeyV','KeyF','Tab','MetaLeft','MetaRight'].includes(code)){toast('Reserved key');renderBindings();return;}
        const used=Object.keys(bindings).find(k=>k!==action&&bindings[k]===code);
        if(used){toast(`${keyLabel(code)}: ${fieldLabels[used]}`);renderBindings();return;}
        bindings[action]=code;save();renderBindings();
      };});row.append(button);
    });list.append(row);
  }
}
const sliders={
  mouse:[['mouseRoll','Mouse roll',.0002,.01,.0001,'Input per pixel/s',v=>(v*1000).toFixed(1)],['mousePitch','Mouse pitch',.0002,.01,.0001,'Input per pixel/s',v=>(v*1000).toFixed(1)],['mouseCurve','Mouse response curve',.5,3,.05,'1 = linear; higher = softer near center',v=>v.toFixed(2)],['cockpitFov','Cockpit FOV',60,120,1,'Horizontal degrees at 16:9',v=>`${v.toFixed(0)}°`],['chaseFov','Chase FOV',70,130,1,'Horizontal degrees at 16:9; Hieb uses 110°',v=>`${v.toFixed(0)}°`],['chaseDistance','Chase distance',5,24,.5,'Metres behind the aircraft',v=>`${v.toFixed(1)} m`],['chaseHeight','Chase height',1,10,.1,'Metres above the aircraft',v=>`${v.toFixed(1)} m`],['chaseLookAhead','Chase look-ahead',0,20,.5,'Metres ahead of the aircraft',v=>`${v.toFixed(1)} m`],['cameraLag','Chase response time',.01,.8,.01,'Camera motion, separate from aircraft inertia',v=>`${Math.round(v*1000)} ms`]],
  handling:[['collectivePower','Collective power',1,4,.05,'Thrust authority above hover; neutral and low collective stay unchanged',v=>`${v.toFixed(2)}×`],['cruiseBoost','Cruise efficiency',0,.8,.01,'Powered drag reduction above the speed knee',v=>`${Math.round(v*100)}%`],['cruiseThreshold','Cruise knee',10,40,.5,'Start of the speed transition',v=>`${Math.round(v*3.6)} km/h`],['angularInertia','Rotational inertia',.5,3,.05,'Higher takes longer to start and arrest rotation',v=>`${v.toFixed(2)}×`],['lateralDrag','Sideways drag',.15,1.5,.01,'Lower carries more momentum through a turn',v=>`${v.toFixed(2)}×`],['pitchPower','Pitch authority',.5,6,.1,'Applied moment / baseline inertia',v=>v.toFixed(1)],['rollPower','Roll authority',.5,7,.1,'Applied moment / baseline inertia',v=>v.toFixed(1)],['yawInputLag','Yaw input response',.02,.3,.01,'Pedals respond separately from pitch and roll',v=>`${Math.round(v*1000)} ms`],['yawSpeedScale','Yaw at speed',20,120,5,'Higher retains more pedal authority in fast flight',v=>`${v.toFixed(0)} m/s`],['yawPower','Yaw authority',.2,4,.05,'Falls with forward speed',v=>v.toFixed(1)],['angularDamping','Angular damping',.3,4,.1,'Damping moment; inertia controls decay time',v=>v.toFixed(1)],['inputLag','Input response time',.02,.6,.01,'Smaller responds faster',v=>`${Math.round(v*1000)}ms`],['rotorLag','Collective response time',.04,1,.02,'Rotor thrust response',v=>`${Math.round(v*1000)}ms`],['lift','Lift multiplier',.6,1.5,.01,'Thrust relative to weight',v=>v.toFixed(2)],['drag','Air resistance',.3,3,.05,'Forward, lateral and vertical drag',v=>v.toFixed(2)],['neutral','Idle collective',.2,.8,.01,'Restored on release; above 50% keeps climbing',v=>`${Math.round(v*100)}%`],['collectiveRate','Collective slew rate',.1,1.5,.05,'Fraction/s in keep-position mode',v=>v.toFixed(2)],['translationalLift','Translational lift',0,.3,.01,'Extra efficiency in forward flight',v=>`${Math.round(v*100)}%`],['groundEffect','Ground effect',0,.2,.01,'Extra lift close to the ground',v=>`${Math.round(v*100)}%`],['weathercock','Weathercock effect',0,.05,.001,'Nose aligns with airflow at speed',v=>v.toFixed(3)],['forwardDrag','Forward drag',.1,1.5,.05,'Lower carries speed until the rotor disc meets the airflow',v=>`${v.toFixed(2)}×`],['forwardDiscDrag','Cruise disc resistance',.1,1,.05,'Powered forward flight; nose-up flare resistance is unchanged',v=>`${v.toFixed(2)}×`],['rotorDiscDrag','Rotor disc braking',0,.12,.001,'Estimated airflow resistance normal to the rotor',v=>v.toFixed(3)],['pitchInertia','Pitch inertia',.3,3,.05,'Axis multiplier',v=>`${v.toFixed(2)}×`],['rollInertia','Roll inertia',.3,3,.05,'Axis multiplier',v=>`${v.toFixed(2)}×`],['yawInertia','Yaw inertia',.3,3,.05,'Axis multiplier',v=>`${v.toFixed(2)}×`],['pitchDamping','Pitch damping',.3,3,.05,'Axis multiplier',v=>`${v.toFixed(2)}×`],['rollDamping','Roll damping',.3,3,.05,'Axis multiplier',v=>`${v.toFixed(2)}×`],['yawDamping','Yaw damping',.3,3,.05,'Axis multiplier',v=>`${v.toFixed(2)}×`],['stability','Leveling assist',0,5,.1,'0 = no automatic leveling',v=>v.toFixed(1)]]
};
const primarySliders={mouse:new Set(['mouseRoll','mousePitch','cockpitFov','chaseFov']),handling:new Set(['angularInertia','lateralDrag','cruiseBoost','yawPower','collectivePower','rotorDiscDrag'])};
const shortLabels={angularInertia:'Weight',lateralDrag:'Side drag',cruiseBoost:'Cruise',yawPower:'Yaw',collectivePower:'Collective',lift:'Lift',rotorDiscDrag:'Braking'};
function renderSliders(){for(const [section,items]of Object.entries(sliders)){
  const container=$(section+'-settings');container.replaceChildren();
  const more=document.createElement('details'),summary=document.createElement('summary');summary.textContent='More';more.append(summary);
  for(const [key,label,min,max,step,note,format]of items){
    config[key]=clamp(config[key],min,max);const row=document.createElement('label');row.className='slider-row';row.title=note;
    const span=document.createElement('span');span.textContent=shortLabels[key]||label;
    const range=document.createElement('input');range.type='range';range.min=min;range.max=max;range.step=step;range.value=config[key];range.setAttribute('aria-label',label);
    const output=document.createElement('output');output.textContent=format(config[key]);
    range.addEventListener('input',()=>{config[key]=Number(range.value);output.textContent=format(config[key]);if(section==='mouse'){needsRender=true;flightCamera.reset();}save();updatePreset();});
    row.append(span,range,output);(primarySliders[section].has(key)?container:more).append(row);
  }container.append(more);
}heli.config={...config};$('ground-latch').checked=config.groundCollectiveLatch;$('collective-mode').value=config.collectiveMode;$('sound-toggle').checked=config.sound;updatePreset();}
const presetKeys=['neutral','collectivePower','angularInertia','lateralDrag','rotorLag','rotorDiscDrag','forwardDrag','forwardDiscDrag','groundCollectiveLatch','cruiseBoost','cruiseThreshold','pitchPower','rollPower','yawPower','angularDamping','inputLag','lift','drag','yawInputLag','yawSpeedScale','pitchInertia','rollInertia','yawInertia','pitchDamping','rollDamping','yawDamping'];
function updatePreset(){const is=preset=>presetKeys.every(k=>Math.abs(config[k]-preset[k])<1e-6);const name=is(DEFAULTS)?'weighted':is(V05_DEFAULTS)?'v05':is(V04_DEFAULTS)?'v04':is(PREVIOUS_DEFAULTS)?'previous':is(ORIGINAL_DEFAULTS)?'original':'custom';$('handling-preset').value=name;}
$('handling-preset').addEventListener('change',e=>{const preset={weighted:DEFAULTS,v05:V05_DEFAULTS,v04:V04_DEFAULTS,previous:PREVIOUS_DEFAULTS,original:ORIGINAL_DEFAULTS}[e.target.value];if(!preset)return;for(const k of presetKeys)config[k]=preset[k];save();renderSliders();toast(`${{weighted:'Little Bird',v05:'v0.5',v04:'v0.4',previous:'Previous reference',original:'Original'}[e.target.value]} selected`);});
function setup(tab='world'){
  stopFlight();controls.capture=null;
  if(!$('setup-dialog').open&&!document.hidden)$('setup-dialog').showModal();
  $('fly').textContent=heli.crashed?'Restart':'Resume';setTab(tab);needsRender=true;
}
function setTab(tab){for(const el of document.querySelectorAll('[data-tab]'))el.classList.toggle('active',el.dataset.tab===tab);for(const name of ['world','controls','handling','reference'])$(name+'-tab').hidden=name!==tab;}
$('menu-toggle').addEventListener('click',()=>setup());
for(const el of document.querySelectorAll('[data-tab]'))el.addEventListener('click',()=>setTab(el.dataset.tab));
document.querySelector('.close').addEventListener('click',()=>$('setup-dialog').close());
$('setup-dialog').addEventListener('close',()=>{controls.capture=null;controls.enabled=true;renderBindings();$('scene').focus({preventScroll:true});needsRender=true;});
$('collective-mode').addEventListener('change',e=>{config.collectiveMode=e.target.value;save();});$('ground-latch').addEventListener('change',e=>{config.groundCollectiveLatch=e.target.checked;save();updatePreset();});
$('reference-setup').addEventListener('click',()=>{Object.assign(config,{mouseRoll:.003,mousePitch:.003*6/28,mouseCurve:1,cockpitFov:89,chaseFov:110,stability:0,collectiveMode:'spring',neutral:DEFAULTS.neutral,groundCollectiveLatch:false});Object.assign(bindings,BINDINGS);save();renderBindings();renderSliders();flightCamera.reset();needsRender=true;toast('Reference setup applied',8000);});
$('sound-toggle').addEventListener('change',e=>{config.sound=e.target.checked;save();});
$('reset-tuning').addEventListener('click',()=>{Object.assign(config,DEFAULTS);save();renderSliders();flightCamera.reset();needsRender=true;toast('Handling reset');});
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-settings').addEventListener('click',()=>download('warbird-settings.json',JSON.stringify({model:'rotor-lab-v0.10-feedback-estimated',map:mapId,config,bindings},null,2),'application/json'));
$('export').addEventListener('click',()=>{
  if(!recording.length){toast('No flight data');return;}
  const columns=Object.keys(recording[0]);const escape=v=>typeof v==='string'?`"${v.replaceAll('"','""')}"`:v;
  const csv=[columns.join(','),...recording.map(row=>columns.map(k=>escape(row[k])).join(','))].join('\n');download(`warbird-flight-${Date.now()}.csv`,csv,'text/csv');toast(`${recording.length} flight samples exported${recordDropped?' (most recent 20 minutes)':''}.`);
});
for(const button of document.querySelectorAll('.pulse'))button.addEventListener('click',()=>{
  mode='free';resetFlight();const home=pads[0];heli.reset({position:[home.x,groundHeight(home.x,home.z)+100,home.z],heading:Math.PI,collective:.5});pulse={axis:button.dataset.axis};$('setup-dialog').close();audio.start();controls.lock();toast('5 s neutral · 1 s input · 5 s coast',4000);
});

// Local telemetry only. Every sample embeds the coefficients used for that sample.
function record(dt){logClock+=dt;if(logClock<.05)return;logClock-=.05;
  const t=heli.telemetry();const row={model:'rotor-lab-v0.10-feedback-estimated',session:sessionId,map:mapId,exercise:pulse?`pulse-${pulse.axis}`:mode,...t,pitchInput:input.pitch,rollInput:input.roll,yawInput:input.yaw,collectiveInput:input.collective,collectiveAbsolute:input.collectiveAbsolute??'',filteredPitch:heli.cyclic.x,filteredRoll:heli.cyclic.z,filteredYaw:heli.cyclic.y,agl:Math.max(0,heli.position.y-groundHeight(heli.position.x,heli.position.z)-.95),config:JSON.stringify(config),bindings:JSON.stringify(bindings)};
  recording.push(row);if(recording.length>MAX_RECORDS){recording.splice(0,200);recordDropped=true;}
}
function resize(){needsRender=true;renderer.setSize(innerWidth,innerHeight);visual.resize();camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();const dpr=Math.min(devicePixelRatio,1);$('hud').width=innerWidth*dpr;$('hud').height=innerHeight*dpr;hud.setTransform(dpr,0,0,dpr,0,0);}
addEventListener('resize',resize);resize();
function updateHUD(){
  const t=heli.telemetry(),agl=Math.max(0,t.y-groundHeight(t.x,t.z)-.95);
  $('speed').textContent=Math.round(t.speed).toString().padStart(3,'0');$('alt').textContent=Math.round(agl).toString().padStart(3,'0');$('vsi').textContent=(t.vy>=0?'+':'')+t.vy.toFixed(1);const collectiveSigned=Math.round((t.collective-.5)*200);$('collective').textContent=(collectiveSigned>0?'+':'')+collectiveSigned;$('collective-fill').style.height=`${t.collective*100}%`;
  cockpitModel.update(t);updateObjective();drawMap(t);drawHUD(t);
}
function drawMap(t){
  const w=224,h=224,s=.08,cx=112,cy=130;map.clearRect(0,0,w,h);map.strokeStyle=PALETTE.ink+'16';map.lineWidth=1;
  for(let x=12;x<w;x+=32){map.beginPath();map.moveTo(x,0);map.lineTo(x,h);map.stroke();}for(let y=2;y<h;y+=32){map.beginPath();map.moveTo(0,y);map.lineTo(w,y);map.stroke();}
  const centerX=t.x,centerZ=t.z-250;
  const pt=(x,z)=>[cx+(x-centerX)*s,cy+(z-centerZ)*s];
  map.fillStyle=PALETTE.ink+'55';
  for(const b of world.buildings){const [x,y]=pt(b.x,b.z);map.fillRect(x-b.w*s/2,y-b.d*s/2,Math.max(2,b.w*s),Math.max(2,b.d*s));}
  if(mode==='slalom'){map.strokeStyle=PALETTE.accent+'99';map.lineWidth=1;map.setLineDash([3,4]);map.beginPath();gates.forEach((p,i)=>{const point=pt(p.x,p.z);if(i===0)map.moveTo(...point);else map.lineTo(...point);});map.stroke();map.setLineDash([]);gates.forEach((p,i)=>{const [x,y]=pt(p.x,p.z);map.fillStyle=i<gateIndex?PALETTE.success:PALETTE.accent;map.fillRect(x-2,y-2,4,4);});}
  map.font=`12px ${MONO_FONT}`;map.textAlign='center';for(const p of pads){const [x,y]=pt(p.x,p.z);map.strokeStyle=PALETTE.accent;map.lineWidth=1;map.beginPath();map.arc(x,y,5,0,Math.PI*2);map.stroke();}
  const [x,y]=pt(t.x,t.z);const drift=Math.hypot(t.vx,t.vz);if(drift>1){const len=Math.min(35,drift*.8);map.strokeStyle=PALETTE.accent;map.lineWidth=1.5;map.beginPath();map.moveTo(x,y);map.lineTo(x+t.vx/drift*len,y+t.vz/drift*len);map.stroke();map.fillStyle=PALETTE.accent;map.beginPath();map.arc(x+t.vx/drift*len,y+t.vz/drift*len,2,0,Math.PI*2);map.fill();}map.save();map.translate(x,y);map.rotate(t.heading*Math.PI/180);map.fillStyle=PALETTE.ink;map.beginPath();map.moveTo(0,-7);map.lineTo(5,5);map.lineTo(0,2);map.lineTo(-5,5);map.closePath();map.fill();map.restore();map.fillStyle=PALETTE.ink;map.textAlign='left';map.fillText('N ↑',8,12);
}
function drawHUD(t){
  const w=innerWidth,h=innerHeight;hud.clearRect(0,0,w,h);
  const cx=w/2,instrumentY=h-120;hud.strokeStyle=PALETTE.ink+'99';hud.fillStyle=PALETTE.ink;hud.lineWidth=1;hud.font=`13px ${MONO_FONT}`;hud.textAlign='center';
  // Body pitch and bank are shown separately from flight-path direction.
  // No rectangular clip: banked ladder marks and labels keep their full extent.
  if(!cockpit){
  hud.save();hud.translate(cx,instrumentY);hud.rotate(-t.roll*Math.PI/180);
  for(let p=-90;p<=90;p+=10){const y=(t.pitch-p)*1.15;if(Math.abs(y)>42)continue;const width=p===0?65:28;hud.beginPath();hud.moveTo(-width,y);hud.lineTo(-10,y);hud.moveTo(10,y);hud.lineTo(width,y);hud.stroke();if(p){hud.fillText(`${p}`,width+15,y+3);hud.fillText(`${p}`,-width-15,y+3);}}
  hud.restore();hud.strokeStyle=PALETTE.accent;hud.lineWidth=1.5;hud.beginPath();hud.moveTo(cx-35,instrumentY);hud.lineTo(cx-12,instrumentY);hud.lineTo(cx-12,instrumentY+5);hud.moveTo(cx+35,instrumentY);hud.lineTo(cx+12,instrumentY);hud.lineTo(cx+12,instrumentY+5);hud.stroke();hud.beginPath();const aim=aimPoint(gunZero).applyQuaternion(heli.orientation).add(heli.position).project(camera);if(aim.z<1&&aim.z>-1){hud.arc((aim.x+1)*w/2,(1-aim.y)*h/2,4,0,Math.PI*2);hud.stroke();}
  }
  hud.fillStyle=PALETTE.ink;hud.fillText(`${Math.round(t.heading).toString().padStart(3,'0')}°`,cx,28);
  hud.strokeStyle=PALETTE.ink+'99';hud.lineWidth=1;for(let d=-30;d<=30;d+=10){const x=cx+d*4;hud.beginPath();hud.moveTo(x,36);hud.lineTo(x,42);hud.stroke();hud.fillText(Math.round((t.heading+d+360)%360).toString().padStart(3,'0'),x,55);}
  // Flight-path marker exposes sideslip and momentum in cockpit view.
  if(cockpit && heli.velocity.length()>2){const v=heli.velocity.clone().applyQuaternion(camera.quaternion.clone().invert());if(v.z<-.5){const scale=h/(2*Math.tan(camera.fov*Math.PI/360));const x=cx+v.x/-v.z*scale,y=h/2-v.y/-v.z*scale;if(Math.abs(x-cx)<w*.4&&Math.abs(y-h/2)<h*.35){hud.strokeStyle=PALETTE.success;hud.beginPath();hud.arc(x,y,7,0,Math.PI*2);hud.moveTo(x-17,y);hud.lineTo(x-7,y);hud.moveTo(x+7,y);hud.lineTo(x+17,y);hud.moveTo(x,y-7);hud.lineTo(x,y-14);hud.stroke();}}}
}
const audio={ctx:null,gain:null,osc:null,start(){
  if(!this.ctx){try{this.ctx=new AudioContext();this.gain=this.ctx.createGain();this.gain.gain.value=0;const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=350;this.osc=this.ctx.createOscillator();this.osc.type='sawtooth';this.osc.frequency.value=28;const sub=this.ctx.createOscillator();sub.frequency.value=56;const subGain=this.ctx.createGain();subGain.gain.value=.2;sub.connect(subGain);subGain.connect(filter);this.osc.connect(filter);filter.connect(this.gain);this.gain.connect(this.ctx.destination);this.osc.start();sub.start();}catch{}}
  this.ctx?.resume().catch(()=>{});
},volume(v){if(this.ctx&&this.gain)this.gain.gain.setTargetAtTime(config.sound?v:0,this.ctx.currentTime,.1);}};

function frame(now){
  requestAnimationFrame(frame);const dt=Math.min((now-previous)/1000,.05);previous=now;
  if(document.hidden)return;
  const oldCamera=camera.position.clone(),oldRotation=camera.quaternion.clone();
  if(active && !heli.crashed){
    input=controls.frame(dt);accumulator+=dt;
    while(accumulator>=STEP){
      if(pulse){input={pitch:0,roll:0,yaw:0,collective:0,collectiveAbsolute:.5};if(heli.time>=5&&heli.time<6)input[pulse.axis]=1;}
      previousPos.copy(heli.position);heli.step(input,STEP,world.surface,world.obstacles);if(!heli.crashed)weapons.step(heli,input.fire,STEP);updateMission(STEP);record(STEP);accumulator-=STEP;
      if(heli.crashed){stopFlight();needsRender=true;toast('Press R to reset',0);break;}
      if(pulse&&heli.time>=11){const axis=pulse.axis;setup();pulse=null;toast(`${axis[0].toUpperCase()+axis.slice(1)} pulse complete`,10000);break;}
    }
    audio.volume(active?.025+heli.collective*.04:0);
  }
  aircraft.group.position.copy(heli.position);aircraft.group.quaternion.copy(heli.orientation);
  if(active){if(input.fire)for(const barrel of aircraft.barrels)barrel.rotation.z+=dt*220;aircraft.rotor.rotation.y+=dt*37;aircraft.tail.rotation.x+=dt*74;}
  flightCamera.update(camera,heli,dt,cockpit,config);
  if(!cockpit)camera.position.y=Math.max(camera.position.y,groundHeight(camera.position.x,camera.position.z)+1);
  const cameraMoving=oldCamera.distanceToSquared(camera.position)>1e-8||oldRotation.angleTo(camera.quaternion)>1e-5;
  if(active||needsRender||cameraMoving){visual.render(scene,camera,cockpit,aircraft.group,weapons.marks);if(now-lastHUD>50){lastHUD=now;updateHUD();}needsRender=false;}
}
$('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();setup();toast('Graphics context lost. Reload to restart the range.',20000);});
renderBindings();renderSliders();resetFlight();controls.enabled=true;requestAnimationFrame(frame);
document.fonts.ready.then(()=>{needsRender=true;updateHUD();});
