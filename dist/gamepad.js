import {clamp} from './physics.js';

export const INPUT_DEFAULTS=Object.freeze({mouseAxis:'roll',gamepadEnabled:true,gamepadDeadzone:.12,gamepadInvertPitch:false});
export function inputSettings(saved={}){
  saved??={};
  return {mouseAxis:saved.mouseAxis==='yaw'?'yaw':'roll',gamepadEnabled:typeof saved.gamepadEnabled==='boolean'?saved.gamepadEnabled:true,gamepadDeadzone:Number.isFinite(saved.gamepadDeadzone)?clamp(saved.gamepadDeadzone,.05,.35):.12,gamepadInvertPitch:saved.gamepadInvertPitch===true};
}
export function deadzone(value,size=.12){
  if(!Number.isFinite(value))return 0;
  const v=clamp(value,-1,1);return Math.abs(v)<=size?0:Math.sign(v)*(Math.abs(v)-size)/(1-size);
}
const neutral=()=>({roll:0,pitch:0,yaw:0,collective:0,fire:false,active:false,connected:false,available:false,disconnected:false,view:false,reset:false,pause:false,confirm:false,up:false,down:false,left:false,right:false});
export class GamepadInput {
  constructor(read=()=>globalThis.navigator?.getGamepads?.()??[]){this.read=read;this.index=null;this.previous=[];this.blocked=false;this.connected=false;}
  // After a pause/reset, held flight controls must return to neutral before
  // they can start another flight. Menu buttons still use independent edges.
  clear(){this.blocked=true;}
  poll(settings=INPUT_DEFAULTS){
    let pads;try{pads=Array.from(this.read()??[]);}catch{pads=[];}
    const available=pads.some(p=>p?.connected),pad=settings.gamepadEnabled?(pads.find(p=>p?.connected&&p.mapping==='standard'&&p.index===this.index)??pads.find(p=>p?.connected&&p.mapping==='standard')):null;
    if(!pad){const out=neutral();out.available=available;out.disconnected=this.connected;this.connected=false;this.index=null;this.previous=[];return out;}
    if(pad.index!==this.index){this.previous=[];this.blocked=true;}this.index=pad.index;this.connected=true;
    const buttons=Array.from(pad.buttons??[],b=>!!(b?.pressed||b?.value>.5));
    const edge=i=>buttons[i]&&!this.previous[i];
    const trigger=i=>clamp(Number.isFinite(pad.buttons?.[i]?.value)?pad.buttons[i].value:(buttons[i]?1:0),0,1);
    const out=neutral();out.connected=true;out.available=true;
    out.roll=deadzone(pad.axes?.[0],settings.gamepadDeadzone);out.pitch=deadzone(pad.axes?.[1],settings.gamepadDeadzone)*(settings.gamepadInvertPitch?-1:1);out.yaw=deadzone(pad.axes?.[2],settings.gamepadDeadzone);
    out.collective=deadzone(trigger(7)-trigger(6),.04);out.fire=buttons[5]===true;
    out.active=!!(out.roll||out.pitch||out.yaw||out.collective||out.fire);
    if(!out.active)this.blocked=false;
    if(this.blocked){out.roll=out.pitch=out.yaw=out.collective=0;out.fire=out.active=false;}
    out.view=out.confirm=edge(0);out.reset=edge(1);out.pause=edge(9);
    out.up=edge(12);out.down=edge(13);out.left=edge(14);out.right=edge(15);
    this.previous=buttons;return out;
  }
}
