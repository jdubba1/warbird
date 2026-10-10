import {INPUT_DEFAULTS} from './gamepad.js';
import {clamp, expApproach} from './physics.js';
export const BINDINGS = Object.freeze({yawLeft:'KeyA',yawRight:'KeyD',rollLeft:'KeyQ',rollRight:'KeyE',pitchUp:'Space',pitchDown:'ControlLeft',collectiveUp:'KeyW',collectiveDown:'KeyS'});
export const keyLabel=code=>({Space:'Space',ControlLeft:'L Ctrl',ControlRight:'R Ctrl',ShiftLeft:'L Shift',ShiftRight:'R Shift',AltLeft:'L Alt',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'}[code]||code.replace(/^Key|^Digit/,''));
export const RESERVED_KEYS=Object.freeze(['Escape','KeyR','KeyC','KeyV','KeyF','Tab','MetaLeft','MetaRight']);
export function rebind(bindings,action,code){
  if(!Object.hasOwn(bindings,action)||typeof code!=='string'||!code||code.length>=32||RESERVED_KEYS.includes(code))return false;
  const used=Object.keys(bindings).find(k=>k!==action&&bindings[k]===code),old=bindings[action];
  if(used)bindings[used]=old;bindings[action]=code;return true;
}
export class Controls {
  constructor(canvas,config,bindings,callbacks={},settings=INPUT_DEFAULTS) {
    this.canvas=canvas;this.config=config;this.bindings=bindings;this.callbacks=callbacks;this.settings=settings;
    this.keys=new Set();this.mouse={x:0,y:0};this.pending={x:0,y:0};
    this.firing=false;this.locked=false;this.enabled=false;this.dragMode=false;this.dragging=false;this.capture=null;
    addEventListener('keydown',e=>{
      if(this.capture){e.preventDefault();const cb=this.capture;this.capture=null;cb(e.code);return;}
      if(e.code==='Escape'&&this.enabled){e.preventDefault();this.callbacks.pause?.();return;}
      if(e.target.matches('input,select,textarea,button')) return;
      if(!this.enabled) return;
      if(Object.values(this.bindings).includes(e.code)||['Space','Tab','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
      if(!e.repeat && e.code==='KeyR') this.callbacks.reset?.();
      if(!e.repeat && ['KeyC','KeyV'].includes(e.code)) this.callbacks.view?.();
      this.keys.add(e.code);
    });
    addEventListener('keyup',e=>this.keys.delete(e.code));
    addEventListener('blur',()=>{this.clear();this.callbacks.pause?.();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.clear();this.callbacks.pause?.();}});
    document.addEventListener('pointerlockchange',()=>{this.locked=document.pointerLockElement===canvas;this.enabled=this.locked;this.dragMode=false;this.clear();this.callbacks.lock?.(this.locked);});
    document.addEventListener('pointerlockerror',()=>this.callbacks.error?.('Mouse capture blocked. Try Mouse drag.'));
    canvas.addEventListener('mousedown',e=>{if(this.enabled&&this.locked&&!this.dragMode&&e.button===0)this.firing=true;});
    canvas.addEventListener('pointerdown',e=>{if(this.dragMode&&this.enabled){this.dragging=true;canvas.setPointerCapture(e.pointerId);}});
    canvas.addEventListener('pointerup',()=>{this.dragging=false;});
    canvas.addEventListener('pointercancel',()=>{this.dragging=false;});
    document.addEventListener('mouseup',e=>{if(e.button===0)this.firing=false;});
    document.addEventListener('pointercancel',()=>{this.firing=false;});
    document.addEventListener('mousemove',e=>{if(this.locked||(this.enabled&&this.dragMode&&this.dragging)){this.pending.x+=e.movementX;this.pending.y+=e.movementY;}});
  }
  async lock(){this.dragMode=false;try{await this.canvas.requestPointerLock();}catch{this.callbacks.error?.('Mouse capture blocked. Try Mouse drag.');}}
  startDrag(clear=true){if(clear)this.clear();this.dragMode=true;this.enabled=true;this.callbacks.lock?.(true);}
  clear(){this.firing=false;this.keys.clear();this.dragging=false;this.mouse.x=this.mouse.y=this.pending.x=this.pending.y=0;}
  frame(dt,pad={}){
    // Convert distance per frame into a rate so sensitivity does not depend on FPS.
    const seconds=Math.max(dt,1/240);
    this.mouse.x=expApproach(this.mouse.x,clamp(this.pending.x/seconds*this.config.mouseRoll,-1,1),dt,0.055);
    this.mouse.y=expApproach(this.mouse.y,clamp(this.pending.y/seconds*this.config.mousePitch,-1,1),dt,0.055);
    this.pending.x=this.pending.y=0;
    const axis=v=>Math.sign(v)*Math.pow(Math.abs(v),this.config.mouseCurve);
    const k=action=>this.enabled&&this.keys.has(this.bindings[action])?1:0;
    const horizontal=axis(this.mouse.x),vertical=axis(this.mouse.y);
    if(!this.enabled)return {roll:0,pitch:0,yaw:0,collective:0,fire:false};
    return {roll:clamp((this.settings.mouseAxis==='yaw'?0:horizontal)+k('rollRight')-k('rollLeft')+(pad.roll||0),-1,1),pitch:clamp(vertical+k('pitchUp')-k('pitchDown')+(pad.pitch||0),-1,1),yaw:clamp((this.settings.mouseAxis==='yaw'?horizontal:0)+k('yawRight')-k('yawLeft')+(pad.yaw||0),-1,1),collective:clamp(k('collectiveUp')-k('collectiveDown')+(pad.collective||0),-1,1),fire:this.firing||this.keys.has('KeyF')||pad.fire===true};
  }
}
