import * as T from './vendor/three.module.js';
import {PALETTE} from './palette.js';
import {PILOT_OFFSET} from './camera.js';

// Same image-plane reference as the cockpit. A fixed, body-mounted sight.
export const SIGHT_POINT=Object.freeze([800,626]);
const span=2*Math.tan(105*Math.PI/360)/(16/9);
export const SIGHT_DIRECTION=Object.freeze([(SIGHT_POINT[0]-749)/1252*span, (626-SIGHT_POINT[1])/1252*span,-1]);
export const MUZZLES=Object.freeze([Object.freeze([-1.1,-.15,-1.25]),Object.freeze([1.1,-.15,-1.25])]);
export const BULLET_SPEED=800,SHOT_RATE=50,GRAVITY=9.81;
export function aimPoint(range=30){return new T.Vector3().fromArray(SIGHT_DIRECTION).normalize().multiplyScalar(range).add(new T.Vector3().fromArray(PILOT_OFFSET));}
export function launchRound(heli,side,range=30){
  const muzzle=new T.Vector3().fromArray(MUZZLES[side]),target=aimPoint(range),delta=target.sub(muzzle);
  let time=delta.length()/BULLET_SPEED,velocity;
  // Level-flight zero includes drop. Banking rotates the gun, not gravity.
  for(let i=0;i<4;i++){velocity=delta.clone();velocity.y+=GRAVITY*time*time/2;time=velocity.length()/BULLET_SPEED;}
  velocity.normalize().multiplyScalar(BULLET_SPEED).applyQuaternion(heli.orientation).add(heli.velocity);
  return {position:muzzle.applyQuaternion(heli.orientation).add(heli.position),velocity,age:0};
}

// Static visible triangles, indexed in XZ cells. This includes tree instances
// and thin walls, independent of the forgiving aircraft collision volumes.
export class SurfaceIndex {
  constructor(root,cellSize=64){
    this.cellSize=cellSize;this.cells=new Map();this.owners=[];
    const triangles=[],ownerIds=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),instance=new T.Matrix4(),matrix=new T.Matrix4();
    root.updateMatrixWorld(true);
    root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const geometry=mesh.geometry,p=geometry.attributes.position,index=geometry.index;
      if(!p)return;
      const owner=this.owners.push(mesh)-1,count=mesh.isInstancedMesh?mesh.count:1;
      for(let n=0;n<count;n++){
        if(mesh.isInstancedMesh){mesh.getMatrixAt(n,instance);matrix.multiplyMatrices(mesh.matrixWorld,instance);}else matrix.copy(mesh.matrixWorld);
        for(let i=0;i<(index?.count??p.count);i+=3){
          a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(matrix);
          b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(matrix);
          c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(matrix);
          const id=ownerIds.length;triangles.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);ownerIds.push(owner);
          const x0=Math.floor(Math.min(a.x,b.x,c.x)/cellSize),x1=Math.floor(Math.max(a.x,b.x,c.x)/cellSize);
          const z0=Math.floor(Math.min(a.z,b.z,c.z)/cellSize),z1=Math.floor(Math.max(a.z,b.z,c.z)/cellSize);
          for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=x+','+z,list=this.cells.get(key)??[];list.push(id);this.cells.set(key,list);}
        }
      }
    });
    this.triangles=new Float32Array(triangles);this.ownerIds=new Uint32Array(ownerIds);this.seen=new Uint32Array(ownerIds.length);this.query=0;
    this.ray=new T.Ray();this.a=new T.Vector3();this.b=new T.Vector3();this.c=new T.Vector3();this.point=new T.Vector3();
  }
  cast(start,end){
    const delta=end.clone().sub(start),length=delta.length();if(length<1e-9)return null;
    this.ray.set(start,delta.divideScalar(length));
    this.query=(this.query+1)>>>0;if(!this.query){this.seen.fill(0);this.query=1;}
    const size=this.cellSize,d=this.ray.direction,stepX=Math.sign(d.x),stepZ=Math.sign(d.z);
    let x=Math.floor(start.x/size),z=Math.floor(start.z/size),nearest=length+1e-7,hit=null;
    let nextX=stepX?((x+(stepX>0?1:0))*size-start.x)/d.x:Infinity;
    let nextZ=stepZ?((z+(stepZ>0?1:0))*size-start.z)/d.z:Infinity;
    const strideX=stepX?size/Math.abs(d.x):Infinity,strideZ=stepZ?size/Math.abs(d.z):Infinity;
    while(true){
      for(const id of this.cells.get(x+','+z)??[]){
        if(this.seen[id]===this.query)continue;this.seen[id]=this.query;
        const owner=this.owners[this.ownerIds[id]];let visible=true;
        for(let o=owner;o;o=o.parent)if(!o.visible){visible=false;break;}if(!visible)continue;
        const offset=id*9;this.a.fromArray(this.triangles,offset);this.b.fromArray(this.triangles,offset+3);this.c.fromArray(this.triangles,offset+6);
        if(!this.ray.intersectTriangle(this.a,this.b,this.c,false,this.point))continue;
        const distance=start.distanceTo(this.point);if(distance>nearest)continue;
        nearest=distance;
        const normal=this.b.clone().sub(this.a).cross(this.c.clone().sub(this.a)).normalize();if(normal.dot(d)>0)normal.negate();
        hit={point:this.point.clone(),normal,distance,object:owner};
      }
      const next=Math.min(nextX,nextZ);if(next>Math.min(length,nearest)||!Number.isFinite(next))break;
      // Step both axes at a corner. Boundary triangles occupy adjoining cells.
      if(nextX<=next+1e-9){x+=stepX;nextX+=strideX;}if(nextZ<=next+1e-9){z+=stepZ;nextZ+=strideZ;}
    }
    return hit;
  }
}

export class Miniguns {
  constructor(root,{zero=30,capacity=2048}={}){
    this.surface=new SurfaceIndex(root);this.zero=zero;this.capacity=capacity;this.rounds=[];this.clock=0;this.shots=0;this.cursor=0;
    this.marks=new T.InstancedMesh(new T.CircleGeometry(.16,12),new T.MeshBasicMaterial({color:'#f77724',side:T.DoubleSide,fog:false,toneMapped:false,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),capacity);
    this.marks.name='Orange bullet marks';this.marks.count=0;this.marks.layers.set(3);this.marks.frustumCulled=false;this.marks.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.stamp=new T.Object3D();this.normalAxis=new T.Vector3(0,0,1);
  }
  mark(hit){
    this.stamp.position.copy(hit.point).addScaledVector(hit.normal,.006);this.stamp.quaternion.setFromUnitVectors(this.normalAxis,hit.normal);this.stamp.updateMatrix();
    this.marks.setMatrixAt(this.cursor,this.stamp.matrix);this.cursor=(this.cursor+1)%this.capacity;this.marks.count=Math.min(this.capacity,this.marks.count+1);this.marks.instanceMatrix.needsUpdate=true;
  }
  step(heli,fire,dt){
    const alive=[];
    for(const round of this.rounds){
      const end=round.position.clone().addScaledVector(round.velocity,dt);end.y-=GRAVITY*dt*dt/2;
      const hit=this.surface.cast(round.position,end);round.age+=dt;
      if(hit)this.mark(hit);
      else if(round.age<2){round.position.copy(end);round.velocity.y-=GRAVITY*dt;alive.push(round);}
    }
    this.rounds=alive;
    if(!fire){this.clock=0;return;}
    this.clock+=dt;
    while(this.clock+1e-9>=1/SHOT_RATE){
      this.clock-=1/SHOT_RATE;
      for(let side=0;side<2;side++){this.shots++;if(this.rounds.length<256)this.rounds.push(launchRound(heli,side,this.zero));}
    }
  }
  reset(){this.rounds=[];this.clock=0;this.shots=0;this.cursor=0;this.marks.count=0;}
  dispose(){this.marks.geometry.dispose();this.marks.material.dispose();}
}

export function makeGunMounts(){
  const group=new T.Group(),barrels=[];
  const dark=new T.MeshBasicMaterial({color:PALETTE.ink,fog:false,toneMapped:false}),body=new T.MeshBasicMaterial({color:PALETTE.airframe,fog:false,toneMapped:false});
  for(const muzzle of MUZZLES){
    const mount=new T.Group();mount.position.fromArray(muzzle);group.add(mount);
    const add=(geometry,material,x,y,z)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mount.add(mesh);return mesh;};
    add(new T.BoxGeometry(.25,.25,.52),body,0,0,.92);
    const bundle=new T.Group();mount.add(bundle);barrels.push(bundle);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3,barrel=new T.Mesh(new T.CylinderGeometry(.025,.025,.78,6),dark);barrel.rotation.x=Math.PI/2;barrel.position.set(Math.cos(a)*.075,Math.sin(a)*.075,.39);bundle.add(barrel);
    }
    for(const z of [.16,.65]){const band=add(new T.CylinderGeometry(.115,.115,.075,12),body,0,0,z);band.rotation.x=Math.PI/2;}
    add(new T.BoxGeometry(.55,.07,.15),dark,muzzle[0]>0?-.25:.25,.15,.9);
  }
  const setZero=range=>group.children.forEach((mount,side)=>mount.quaternion.setFromUnitVectors(new T.Vector3(0,0,-1),launchRound({orientation:new T.Quaternion(),position:new T.Vector3(),velocity:new T.Vector3()},side,range).velocity.normalize()));
  setZero(30);group.name='Twin miniguns';group.traverse(o=>o.layers.set(2));return {group,barrels,setZero};
}
