import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {DEFAULTS} from '../dist/physics.js';
import {pads,groundHeight} from '../dist/terrain.js';
test('main menu, view switching and crash reset work without opening a crash menu',async t=>{
const base=new URL('../dist/',import.meta.url);
t.mock.method(globalThis,'setTimeout',()=>0);
const listeners=new Map();
function register(name,cb){const list=listeners.get(name)??[];list.push(cb);listeners.set(name,list);}
const ctx=new Proxy({}, {get:(obj,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
class Element{
 constructor(tag='div'){this.tag=tag;this.tagName=tag.toUpperCase();this.attributes={};this.listeners=new Map();this.dataset={};this.style={};this.children=[];this.hidden=false;this.open=false;this.value='';const classes=new Set();this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:c=>classes.has(c)?classes.delete(c):classes.add(c)};}
 addEventListener(name,cb){const list=this.listeners.get(name)??[];list.push(cb);this.listeners.set(name,list);}
 emit(name,event={}){event.target??=this;for(const cb of this.listeners.get(name)??[])cb(event);}
 matches(){return ['input','select','textarea','button'].includes(this.tag);}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
 setAttribute(key,value){this.attributes[key]=value;}getContext(){return ctx;}blur(){}focus(){document.activeElement=this;}getClientRects(){return this.hidden?[]:[{}];}dispatchEvent(event){this.emit(event.type);return true;}querySelectorAll(){return this.menuItems??[];}click(){this.emit('click');}
 showModal(){this.open=true;}close(){this.open=false;this.emit('close');}
 querySelector(){return new Element('option');}
 async requestPointerLock(){document.pointerLockElement=this;document.emit('pointerlockchange');}
}
const html=readFileSync(new URL('index.html',base),'utf8'),elements=new Map();
for(const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)){const element=new Element(match[1]);element.hidden=match[0].includes(' hidden');elements.set(match[2],element);}
const tabs=[...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>{const el=new Element('button');el.dataset.tab=m[1];return el;});
const pulses=['roll','pitch','yaw'].map(axis=>{const el=new Element('button');el.dataset.axis=axis;return el;});
const close=new Element('button');
globalThis.document=new Element();
document.hidden=false;document.pointerLockElement=null;document.body=new Element('body');document.fonts={ready:Promise.resolve()};
document.getElementById=id=>{assert.ok(elements.has(id),'Missing ID '+id);return elements.get(id);};
document.createElement=tag=>new Element(tag);document.createTextNode=text=>({textContent:text});
document.querySelectorAll=selector=>selector==='[data-tab]'?tabs:selector==='.pulse'?pulses:[];
document.querySelector=()=>close;document.exitPointerLock=()=>{document.pointerLockElement=null;document.emit('pointerlockchange');};
globalThis.addEventListener=register;globalThis.innerWidth=1280;globalThis.innerHeight=720;globalThis.devicePixelRatio=1;
let saved;globalThis.localStorage={getItem:()=>null,setItem(key,value){saved=JSON.parse(value);}};
let connectedPads=[];globalThis.navigator.getGamepads=()=>connectedPads;t.after(()=>delete globalThis.navigator.getGamepads);
let renderFrame;globalThis.requestAnimationFrame=cb=>renderFrame=cb;
globalThis.FakeRenderer=class{constructor(){this.shadowMap={};this.w=1280;this.h=720;}setPixelRatio(){}getPixelRatio(){return 1;}getDrawingBufferSize(v){return v.set(this.w,this.h);}setSize(w,h){this.w=w;this.h=h;}setRenderTarget(){}setClearColor(){}clear(){}clearDepth(){}render(){}};
let source=readFileSync(new URL('main.js',base),'utf8').replace("new T.WebGLRenderer",'new globalThis.FakeRenderer').replaceAll("from './","from '"+base.href);
const folder=mkdtempSync(join(tmpdir(),'rotor-main-check-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
const moduleFile=join(folder,'main.mjs');writeFileSync(moduleFile,source+'\nexport {heli,controls,weapons,targets,camera,aircraft,renderPose,flightCamera,config,inputs,bindings,active,input,cockpit};');const module=await import(pathToFileURL(moduleFile).href);const {heli,controls,weapons,config,inputs,bindings}=module;
const key=code=>{let prevented=false;const event={code,repeat:false,target:elements.get('scene'),preventDefault:()=>prevented=true};for(const cb of listeners.get('keydown')??[])cb(event);return prevented;};
assert.equal(elements.get('setup-dialog').open,false);
assert.equal(elements.get('mission-live').hidden,true);
assert.equal(heli.position.x,pads[0].x);assert.equal(heli.position.z,pads[0].z);
assert.ok(Math.abs(heli.position.y-groundHeight(pads[0].x,pads[0].z)-.95)<1e-8);
assert.equal(heli.onGround,true);assert.equal(heli.collectiveParked,true);
assert.ok(Math.abs(heli.telemetry().heading-180)<1e-8,'spawn faces downhill into the valley');
assert.equal(key('Escape'),true);assert.equal(elements.get('setup-dialog').open,true);
assert.equal(elements.get('world-tab').hidden,false);assert.equal(elements.get('controls-tab').hidden,true);
elements.get('look-select').value='natural';elements.get('look-select').emit('change');renderFrame(performance.now()+50);
elements.get('look-select').value='doodle';elements.get('look-select').emit('change');renderFrame(performance.now()+100);
tabs[1].click();assert.equal(elements.get('controls-tab').hidden,false);
close.click();assert.equal(elements.get('setup-dialog').open,false);
key('KeyW');renderFrame(performance.now()+200);
assert.ok(module.aircraft.group.position.equals(module.renderPose.position),'aircraft and chase camera use the same rendered flight pose');
assert.ok(module.aircraft.group.quaternion.equals(module.renderPose.orientation));
assert.ok(module.targets.remaining>60);module.targets.pop(module.targets.targets[0]);assert.equal(module.targets.targets[0].active,false);
assert.ok(Number(elements.get('collective').textContent)>-100,'First keyboard input starts flight');
key('Escape');assert.equal(elements.get('setup-dialog').open,true);
elements.get('challenge').value='hover';elements.get('challenge').emit('change');assert.equal(elements.get('mission-live').hidden,false);
elements.get('fly').click();await Promise.resolve();assert.equal(elements.get('setup-dialog').open,false);assert.equal(document.pointerLockElement,elements.get('scene'));

elements.get('scene').emit('mousedown',{button:0});renderFrame(performance.now()+220);assert.ok(weapons.shots>0,'LMB fires after mouse capture');
document.emit('mouseup',{button:0});assert.equal(controls.frame(1/60).fire,false);
elements.get('gun-zero').value='50';elements.get('gun-zero').emit('change');assert.equal(weapons.zero,50);
key('KeyC');renderFrame(performance.now()+250);key('KeyC');renderFrame(performance.now()+300);
const step=heli.step;heli.step=()=>heli.crash('Hard landing',{sink:9,speed:30,tilt:75});
renderFrame(performance.now()+400);heli.step=step;
assert.equal(heli.crashed,true);assert.equal(elements.get('setup-dialog').open,false);
assert.equal(elements.get('notification').textContent,'Press R to reset');assert.equal(elements.get('notification').classList.contains('show'),true);
assert.equal(controls.enabled,false);assert.equal(key('KeyR'),true);
assert.equal(heli.crashed,false);assert.equal(weapons.shots,0);assert.equal(weapons.marks.count,0);assert.equal(weapons.rounds.length,0);assert.equal(elements.get('setup-dialog').open,false);
assert.equal(module.targets.targets[0].active,true,'R restores popped targets');assert.equal(module.targets.fragments.count,0);
assert.equal(elements.get('notification').textContent,'');assert.equal(elements.get('notification').classList.contains('show'),false);
key('KeyW');renderFrame(performance.now()+500);assert.equal(controls.enabled,true);assert.ok(heli.collective>0,'keyboard flight resumes after reset');
key('Escape');
const strengths=elements.get('handling-settings').children.filter(row=>row.tag==='label');
for(const name of ['Collective','Pitch','Roll','Yaw'])assert.ok(strengths.some(row=>row.children[0].textContent===name),name+' is exposed');
const collectiveRange=strengths.find(row=>row.children[0].textContent==='Collective').children[1];
assert.equal(config.collectivePower,DEFAULTS.collectivePower);collectiveRange.value='3.5';collectiveRange.emit('input');
assert.equal(config.collectivePower,3.5);assert.equal(heli.config.collectivePower,3.5);assert.equal(saved.config.collectivePower,3.5);
elements.get('reset-tuning').click();assert.equal(config.collectivePower,DEFAULTS.collectivePower);
const collectiveDown=elements.get('binding-list').children[3].children[1];collectiveDown.click();key('ControlLeft');
assert.equal(bindings.collectiveDown,'ControlLeft');assert.equal(bindings.pitchDown,'KeyS');assert.equal(saved.bindings.pitchDown,'KeyS');
elements.get('mouse-axis').value='yaw';elements.get('mouse-axis').emit('change');assert.equal(inputs.mouseAxis,'yaw');assert.equal(saved.inputs.mouseAxis,'yaw');
const pad={index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};connectedPads=[pad];
let clock=performance.now()+1000;const tick=()=>renderFrame(clock+=20),button=(i,value)=>pad.buttons[i]={value,pressed:value>.5};
tick();button(9,1);tick();assert.equal(elements.get('setup-dialog').open,false);assert.equal(module.active,true);assert.equal(document.pointerLockElement,null,'Controller resume avoids mouse capture');
button(9,0);tick();button(7,1);tick();assert.equal(module.input.collective,1);
button(0,1);tick();assert.equal(module.cockpit,true);tick();assert.equal(module.cockpit,true,'Held A does not repeat camera switching');
button(1,1);tick();assert.equal(module.input.collective,0,'Reset drops same-frame held flight inputs');tick();assert.equal(module.input.collective,0,'Held trigger remains blocked');
button(1,0);button(0,0);button(7,0);tick();button(7,1);tick();assert.equal(module.input.collective,1);
button(9,1);tick();assert.equal(elements.get('setup-dialog').open,true);assert.equal(module.active,false);button(9,0);button(7,0);tick();
const freshRange=elements.get('handling-settings').children.find(row=>row.children?.[0]?.textContent==='Collective').children[1];
elements.get('setup-dialog').menuItems=[freshRange,elements.get('fly')];document.activeElement=elements.get('scene');
button(13,1);tick();assert.equal(document.activeElement,freshRange);button(13,0);tick();const before=config.collectivePower;
button(15,1);tick();assert.ok(Math.abs(config.collectivePower-before-.05)<1e-12,'D-pad adjusts the focused handling slider');button(15,0);tick();
button(13,1);tick();assert.equal(document.activeElement,elements.get('fly'));button(13,0);tick();button(0,1);tick();
assert.equal(module.active,true);assert.equal(elements.get('setup-dialog').open,false);assert.equal(document.pointerLockElement,null,'Controller menu activation avoids mouse capture');
button(0,0);tick();button(7,1);tick();connectedPads=[];tick();assert.equal(elements.get('setup-dialog').open,true,'Disconnect pauses a controller flight');assert.equal(module.active,false);
});
