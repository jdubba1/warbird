export const MAPS={mountains:'Mountains'};
export const WORLD_SIZE=8400;
export let mapId='mountains',segments=320;
export const pads=[],gates=[];
let grid;
export const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
function hash(x,z,seed){let n=Math.imul(x,374761393)^Math.imul(z,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x,z,seed){const ix=Math.floor(x),iz=Math.floor(z),u=smooth(0,1,x-ix),v=smooth(0,1,z-iz);return lerp(lerp(hash(ix,iz,seed),hash(ix+1,iz,seed),u),lerp(hash(ix,iz+1,seed),hash(ix+1,iz+1,seed),u),v)*2-1;}
const peak=(x,z,px,pz,h,rx,rz)=>h*Math.exp(-(((x-px)/rx)**2+((z-pz)/rz)**2));
function baseHeight(x,z){
  const wx=x+180*noise(x*.00065,z*.00065,912),wz=z+160*noise(x*.00065,z*.00065,418);
  const ridge=Math.pow(1-Math.abs(noise(wx*.0018,wz*.0018,618)),3);
  let h=95+ridge*210+noise(wx*.004,wz*.004,219)*55+noise(wx*.009,wz*.009,713)*19;
  h+=peak(x,z,-1400,-1750,780,650,800)+peak(x,z,1250,-1200,710,720,750)
    +peak(x,z,-450,-2900,1080,850,650)+peak(x,z,1950,-2650,870,800,860)
    +peak(x,z,-2250,-500,660,600,780)+peak(x,z,1300,1200,740,800,720);
  const canyon=420+240*Math.sin((z+500)*.0014);
  h*=1-.72*Math.exp(-(((x-canyon)/115)**2))*smooth(350,1000,-z);
  return Math.max(0,h*smooth(190,330,Math.hypot(x,z)));
}
function sampledHeight(x,z){
  let h=baseHeight(x,z);
  for(const p of pads){const t=1-smooth(44,88,Math.hypot(x-p.x,z-p.z));h=lerp(h,p.height,t);}
  return h;
}
export function setMap(id){
  mapId='mountains';segments=320;
  const locations=[[-450,-2900,'Home'],[0,0,'Valley'],[-1250,-1600,'Summit'],[1050,-900,'Ledge']];
  pads.splice(0,pads.length,...locations.map(([x,z,name])=>({x,z,name,height:x===0&&z===0?0:baseHeight(x,z)})));
  const size=segments+1,step=WORLD_SIZE/segments;grid=new Float32Array(size*size);
  for(let iz=0;iz<size;iz++)for(let ix=0;ix<size;ix++)grid[iz*size+ix]=sampledHeight(ix*step-WORLD_SIZE/2,iz*step-WORLD_SIZE/2);
  const route=[[0,-110,24],[-100,-320,35],[-260,-560,45],[-480,-800,40],[-700,-1080,45],[-840,-1360,40]];
  gates.splice(0,gates.length,...route.map(([x,z,h])=>({x,z,y:groundHeight(x,z)+h})));
}
// Match the exact two triangles of the rendered PlaneGeometry cell. Terrain,
// obstacle foundations, landing surfaces and topo contours share this field.
export function groundHeight(x,z){
  const scale=segments/WORLD_SIZE,size=segments+1;
  const gx=Math.max(0,Math.min(segments,(x+WORLD_SIZE/2)*scale)),gz=Math.max(0,Math.min(segments,(z+WORLD_SIZE/2)*scale));
  const ix=Math.min(segments-1,Math.floor(gx)),iz=Math.min(segments-1,Math.floor(gz)),u=gx-ix,v=gz-iz,i=iz*size+ix;
  const a=grid[i],b=grid[i+size],c=grid[i+size+1],d=grid[i+1];
  return u+v<=1?a+(d-a)*u+(b-a)*v:c+(b-c)*(1-u)+(d-c)*(1-v);
}
export function nearRoute(x,z,clearance=55){
  const route=[{x:0,z:40},...gates];
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    if(Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<clearance)return true;
  }
  return pads.some(p=>Math.hypot(x-p.x,z-p.z)<65);
}
setMap('mountains');
