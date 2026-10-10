import {Vector3,Quaternion} from './vendor/three.module.js';

export const PILOT_OFFSET=Object.freeze([.43,.48,-.65]);

// Match a horizontal FOV at 16:9, then preserve its vertical coverage on resize.
// The source says 89 degrees. Its exact Unreal aspect-axis policy is unverified.
export const verticalFov = (horizontal,aspect=16/9) =>
  2*Math.atan(Math.tan(horizontal*Math.PI/360)/aspect)*180/Math.PI;

// Physics runs at a fixed rate. Render between its last two poses so the
// aircraft and its camera never mix a stepped target with a smooth follower.
export class FlightPose {
  constructor(){
    this.previousPosition=new Vector3();this.previousOrientation=new Quaternion();
    this.position=new Vector3();this.orientation=new Quaternion();
  }
  capture(heli){this.previousPosition.copy(heli.position);this.previousOrientation.copy(heli.orientation);}
  reset(heli){this.capture(heli);this.update(heli,1);}
  update(heli,alpha){
    this.position.lerpVectors(this.previousPosition,heli.position,alpha);
    this.orientation.slerpQuaternions(this.previousOrientation,heli.orientation,alpha);
  }
}

export class FlightCamera {
  constructor(){
    this.heading=new Quaternion();this.desiredHeading=new Quaternion();
    this.axis=new Vector3(0,1,0);this.forward=new Vector3();
    this.offset=new Vector3();this.target=new Vector3();this.position=new Vector3();
    this.initialized=false;this.wasCockpit=false;
  }
  reset(){this.initialized=false;}
  update(camera,heli,dt,cockpit,config,groundHeight){
    const switched=cockpit!==this.wasCockpit;this.wasCockpit=cockpit;
    const fov=verticalFov(cockpit?config.cockpitFov:config.chaseFov);
    if(Math.abs(camera.fov-fov)>1e-6){camera.fov=fov;camera.updateProjectionMatrix();}
    if(cockpit){
      // Pilot sits on the right, as visible in the reference. Offsets estimated.
      this.offset.fromArray(PILOT_OFFSET).applyQuaternion(heli.orientation);
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
    this.offset.set(0,config.chaseHeight,config.chaseDistance).applyQuaternion(this.heading).add(heli.position);
    if(!this.initialized||switched)this.position.copy(this.offset);
    else this.position.lerp(this.offset,blend);
    // Clearance is an output constraint, not feedback into the chase spring.
    // Aim only after applying it, including on steep mountain faces.
    camera.position.copy(this.position);
    if(groundHeight)camera.position.y=Math.max(camera.position.y,groundHeight(camera.position.x,camera.position.z)+1);
    this.target.set(0,.4,-config.chaseLookAhead).applyQuaternion(this.heading).add(heli.position);
    camera.up.set(0,1,0);camera.lookAt(this.target);
    this.initialized=true;
  }
}
