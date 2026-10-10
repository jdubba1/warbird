import * as T from './vendor/three.module.js';
import {PALETTE} from './palette.js';

const MAX_FRAGMENTS=768,FRAGMENTS_PER_POP=24,BURST_TIME=.65;

export class Targets {
  constructor(placements){
    this.targets=placements.map(p=>({position:new T.Vector3(p.x,p.y,p.z),radius:p.radius??2.4,kind:p.kind,active:true}));
    this.group=new T.Group();this.group.name='Practice balloons';this.particles=[];
    const flat=color=>new T.MeshBasicMaterial({color,fog:false,toneMapped:false});
    const instance=(geometry,material,count)=>{const mesh=new T.InstancedMesh(geometry,material,count);mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.group.add(mesh);return mesh;};
    this.balloons=instance(new T.SphereGeometry(1,16,12),flat(PALETTE.accent),this.targets.length);
    this.bands=instance(new T.TorusGeometry(1,.055,4,32),flat(PALETTE.paper),this.targets.length);
    this.knots=instance(new T.ConeGeometry(.13,.25,6),flat(PALETTE.accent),this.targets.length);
    this.fragments=instance(new T.IcosahedronGeometry(.22,0),flat('#ffffff'),MAX_FRAGMENTS);this.fragments.count=0;
    this.group.traverse(o=>o.layers.set(3));
    this.stamp=new T.Object3D();this.ray=new T.Ray();this.sphere=new T.Sphere();this.point=new T.Vector3();this.color=new T.Color();
    this.reset();
  }
  drawTarget(target,index){
    this.stamp.position.copy(target.position);this.stamp.rotation.set(0,0,0);this.stamp.scale.setScalar(target.active?target.radius:0);this.stamp.updateMatrix();
    this.balloons.setMatrixAt(index,this.stamp.matrix);
    this.stamp.rotation.x=Math.PI/2;this.stamp.updateMatrix();this.bands.setMatrixAt(index,this.stamp.matrix);
    this.stamp.rotation.x=Math.PI;this.stamp.position.y-=target.radius*1.1;this.stamp.updateMatrix();this.knots.setMatrixAt(index,this.stamp.matrix);
    for(const mesh of [this.balloons,this.bands,this.knots])mesh.instanceMatrix.needsUpdate=true;
  }
  cast(start,end){
    const delta=end.clone().sub(start),length=delta.length();if(length<1e-9)return null;
    this.ray.set(start,delta.divideScalar(length));let nearest=length,hit=null;
    for(const target of this.targets){
      if(!target.active)continue;
      this.sphere.set(target.position,target.radius);
      if(this.sphere.containsPoint(start))this.point.copy(start);
      else if(!this.ray.intersectSphere(this.sphere,this.point))continue;
      const distance=start.distanceTo(this.point);if(distance>nearest)continue;
      nearest=distance;hit={target,point:this.point.clone(),normal:this.point.clone().sub(target.position).normalize(),distance};
    }
    return hit;
  }
  pop(target){
    if(!target.active)return false;
    target.active=false;this.remaining--;this.drawTarget(target,this.targets.indexOf(target));
    for(let i=0;i<FRAGMENTS_PER_POP;i++){
      const y=1-2*(i+.5)/FRAGMENTS_PER_POP,angle=i*2.3999632297,r=Math.sqrt(1-y*y);
      const direction=new T.Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r);
      this.particles.push({position:target.position.clone().addScaledVector(direction,target.radius*.75),velocity:direction.multiplyScalar(9+i%5),age:0,color:i%3?PALETTE.accent:PALETTE.paper});
    }
    if(this.particles.length>MAX_FRAGMENTS)this.particles.splice(0,this.particles.length-MAX_FRAGMENTS);
    this.update(0);return true;
  }
  update(dt){
    const moving=this.particles.length>0;
    this.particles=this.particles.filter(p=>{
      p.age+=dt;if(p.age>=BURST_TIME)return false;
      p.position.addScaledVector(p.velocity,dt);p.position.y-=9.81*dt*dt/2;p.velocity.y-=9.81*dt;return true;
    });
    for(let i=0;i<this.particles.length;i++){
      const p=this.particles[i];this.stamp.position.copy(p.position);this.stamp.rotation.set(p.age*4,i,p.age*7);this.stamp.scale.setScalar(1-p.age/BURST_TIME);this.stamp.updateMatrix();
      this.fragments.setMatrixAt(i,this.stamp.matrix);this.fragments.setColorAt(i,this.color.set(p.color));
    }
    this.fragments.count=this.particles.length;this.fragments.instanceMatrix.needsUpdate=true;
    if(this.fragments.instanceColor)this.fragments.instanceColor.needsUpdate=true;
    this.group.count=this.remaining+this.fragments.count;return moving;
  }
  reset(){
    this.remaining=this.targets.length;this.particles=[];this.fragments.count=0;this.group.count=this.remaining;
    this.targets.forEach((target,i)=>{target.active=true;this.drawTarget(target,i);});
  }
  dispose(){for(const mesh of this.group.children){mesh.geometry.dispose();mesh.material.dispose();}this.group.removeFromParent();}
}
