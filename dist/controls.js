import {clamp, expApproach} from './physics.js';
export const BINDINGS = Object.freeze({yawLeft:'KeyA',yawRight:'KeyD',rollLeft:'KeyQ',rollRight:'KeyE',pitchUp:'Space',pitchDown:'ControlLeft',collectiveUp:'KeyW',collectiveDown:'KeyS'});
export const keyLabel=code=>({Space:'Space',ControlLeft:'L Ctrl',ControlRight:'R Ctrl',ShiftLeft:'L Shift',ShiftRight:'R Shift',AltLeft:'L Alt',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'}[code]||code.replace(/^Key|^Digit/,''));
export class Controls {
  constructor(canvas,config,bindings,callbacks={}) {
    this.canvas=canvas;this.config=config;this.bindings=bindings;this.callbacks=callbacks;
    this.keys=new Set();this.mouse={x:0,y:0};this.pending={x:0,y:0};
    this.locked=false;this.enabled=false;this.dragMode=false;this.dragging=false;this.capture=null;
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
    document.addEventListener('pointerlockerror',()=>this.callbacks.error?.('Mouse capture was refused. Try a direct click in the browser, or use click-drag flight.'));
    canvas.addEventListener('pointerdown',e=>{if(this.dragMode&&this.enabled){this.dragging=true;canvas.setPointerCapture(e.pointerId);}});
    canvas.addEventListener('pointerup',()=>{this.dragging=false;});
    canvas.addEventListener('pointercancel',()=>{this.dragging=false;});
    document.addEventListener('mousemove',e=>{if(this.locked||(this.enabled&&this.dragMode&&this.dragging)){this.pending.x+=e.movementX;this.pending.y+=e.movementY;}});
  }
  async lock(){this.dragMode=false;try{await this.canvas.requestPointerLock();}catch{this.callbacks.error?.('Mouse capture was refused. Try a direct click in the browser, or use click-drag flight.');}}
  startDrag(clear=true){if(clear)this.clear();this.dragMode=true;this.enabled=true;this.callbacks.lock?.(true);}
  clear(){this.keys.clear();this.dragging=false;this.mouse.x=this.mouse.y=this.pending.x=this.pending.y=0;}
  frame(dt){
    // Convert distance per frame into a rate so sensitivity does not depend on FPS.
    const seconds=Math.max(dt,1/240);
    this.mouse.x=expApproach(this.mouse.x,clamp(this.pending.x/seconds*this.config.mouseRoll,-1,1),dt,0.055);
    this.mouse.y=expApproach(this.mouse.y,clamp(this.pending.y/seconds*this.config.mousePitch,-1,1),dt,0.055);
    this.pending.x=this.pending.y=0;
    const axis=v=>Math.sign(v)*Math.pow(Math.abs(v),this.config.mouseCurve);
    const k=action=>this.keys.has(this.bindings[action])?1:0;
    return {roll:clamp(axis(this.mouse.x)+k('rollRight')-k('rollLeft'),-1,1),pitch:clamp(axis(this.mouse.y)+k('pitchUp')-k('pitchDown'),-1,1),yaw:k('yawRight')-k('yawLeft'),collective:k('collectiveUp')-k('collectiveDown')};
  }
}
