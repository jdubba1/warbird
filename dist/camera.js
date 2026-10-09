import {Vector3,Quaternion} from './vendor/three.module.js';

// Match a horizontal FOV at 16:9, then preserve its vertical coverage on resize.
// The source says 89 degrees. Its exact Unreal aspect-axis policy is unverified.
export const verticalFov = (horizontal,aspect=16/9) =>
  2*Math.atan(Math.tan(horizontal*Math.PI/360)/aspect)*180/Math.PI;

export class FlightCamera {
  constructor(){
    this.heading=new Quaternion();this.desiredHeading=new Quaternion();
    this.axis=new Vector3(0,1,0);this.forward=new Vector3();
    this.offset=new Vector3();this.target=new Vector3();this.position=new Vector3();
    this.initialized=false;this.wasCockpit=false;
  }
  reset(){this.initialized=false;}
  update(camera,heli,dt,cockpit,config){
    const switched=cockpit!==this.wasCockpit;this.wasCockpit=cockpit;
    const fov=verticalFov(cockpit?config.cockpitFov:config.chaseFov);
    if(Math.abs(camera.fov-fov)>1e-6){camera.fov=fov;camera.updateProjectionMatrix();}
    if(cockpit){
      // Pilot sits on the right, as visible in the reference. Offsets estimated.
      this.offset.set(.43,.48,-.65).applyQuaternion(heli.orientation);
      camera.position.copy(heli.position).add(this.offset);
      camera.quaternion.copy(heli.orientation);
      this.initialized=false;
      return;
    }
    this.forward.set(0,0,-1).applyQuaternion(heli.orientation);
    const heading=Math.atan2(-this.forward.x,-this.forward.z);
    this.desiredHeading.setFromAxisAngle(this.axis,heading);
    const blend=1-Math.exp(-dt/Math.max(.01,config.cameraLag));
    if(!this.initialized||switched)this.heading.copy(this.desiredHeading);
    else this.heading.slerp(this.desiredHeading,blend);
    this.offset.set(0,config.chaseHeight,config.chaseDistance).applyQuaternion(this.heading);
    this.position.copy(heli.position).add(this.offset);
    if(!this.initialized||switched)camera.position.copy(this.position);
    else camera.position.lerp(this.position,blend);
    this.target.set(0,.4,-config.chaseLookAhead).applyQuaternion(this.heading).add(heli.position);
    camera.up.set(0,1,0);camera.lookAt(this.target);
    this.initialized=true;
  }
}
