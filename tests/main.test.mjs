import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {pads,groundHeight} from '../dist/terrain.js';
test('main menu, view switching and crash reset work without opening a crash menu',async t=>{
const base=new URL('../dist/',import.meta.url);
t.mock.method(globalThis,'setTimeout',()=>0);
const listeners=new Map();
function register(name,cb){const list=listeners.get(name)??[];list.push(cb);listeners.set(name,list);}
const ctx=new Proxy({}, {get:(obj,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
class Element{
 constructor(tag='div'){this.tag=tag;this.listeners=new Map();this.dataset={};this.style={};this.children=[];this.hidden=false;this.open=false;this.value='';const classes=new Set();this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:c=>classes.has(c)?classes.delete(c):classes.add(c)};}
 addEventListener(name,cb){const list=this.listeners.get(name)??[];list.push(cb);this.listeners.set(name,list);}
 emit(name,event={}){event.target??=this;for(const cb of this.listeners.get(name)??[])cb(event);}
 matches(){return ['input','select','textarea','button'].includes(this.tag);}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
 setAttribute(){}getContext(){return ctx;}blur(){}focus(){}click(){this.emit('click');}
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
globalThis.localStorage={getItem:()=>null,setItem(){}};
let renderFrame;globalThis.requestAnimationFrame=cb=>renderFrame=cb;
globalThis.FakeRenderer=class{constructor(){this.shadowMap={};this.w=1280;this.h=720;}setPixelRatio(){}getPixelRatio(){return 1;}getDrawingBufferSize(v){return v.set(this.w,this.h);}setSize(w,h){this.w=w;this.h=h;}setRenderTarget(){}setClearColor(){}clear(){}clearDepth(){}render(){}};
let source=readFileSync(new URL('main.js',base),'utf8').replace("new T.WebGLRenderer",'new globalThis.FakeRenderer').replaceAll("from './","from '"+base.href);
const folder=mkdtempSync(join(tmpdir(),'rotor-main-check-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
const moduleFile=join(folder,'main.mjs');writeFileSync(moduleFile,source+'\nexport {heli,controls};');const {heli,controls}=await import(pathToFileURL(moduleFile).href);
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
assert.ok(Number(elements.get('collective').textContent)>-100,'First keyboard input starts flight');
key('Escape');assert.equal(elements.get('setup-dialog').open,true);
elements.get('challenge').value='hover';elements.get('challenge').emit('change');assert.equal(elements.get('mission-live').hidden,false);
elements.get('fly').click();await Promise.resolve();assert.equal(elements.get('setup-dialog').open,false);assert.equal(document.pointerLockElement,elements.get('scene'));

key('KeyC');renderFrame(performance.now()+250);key('KeyC');renderFrame(performance.now()+300);
const step=heli.step;heli.step=()=>heli.crash('Hard landing',{sink:9,speed:30,tilt:75});
renderFrame(performance.now()+400);heli.step=step;
assert.equal(heli.crashed,true);assert.equal(elements.get('setup-dialog').open,false);
assert.equal(elements.get('notification').textContent,'Press R to reset');assert.equal(elements.get('notification').classList.contains('show'),true);
assert.equal(controls.enabled,false);assert.equal(key('KeyR'),true);
assert.equal(heli.crashed,false);assert.equal(elements.get('setup-dialog').open,false);
assert.equal(elements.get('notification').textContent,'');assert.equal(elements.get('notification').classList.contains('show'),false);
key('KeyW');renderFrame(performance.now()+500);assert.equal(controls.enabled,true);assert.ok(heli.collective>0,'keyboard flight resumes after reset');
});
