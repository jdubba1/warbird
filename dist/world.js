import * as T from './vendor/three.module.js';
import {PALETTE,MONO_FONT} from './palette.js';
import {simMaterial} from './rendering.js';
import {pads,gates,groundHeight,segments,WORLD_SIZE,nearRoute} from './terrain.js';
import littleBird from './assets/little-bird.js';
export {pads,gates,groundHeight} from './terrain.js';
const material=simMaterial;
const randomFrom=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

export function makeWorld(parent){
  const root=new T.Group();parent.add(root);parent.background=null;parent.fog=null;
  const terrain=new T.PlaneGeometry(WORLD_SIZE,WORLD_SIZE,segments,segments);terrain.rotateX(-Math.PI/2);
  const positions=terrain.attributes.position;
  for(let i=0;i<positions.count;i++)positions.setY(i,groundHeight(positions.getX(i),positions.getZ(i)));
  terrain.computeVertexNormals();root.add(new T.Mesh(terrain,material('#89936b',{topo:true,shadeBias:.06})));
  const obstacles=[],surfaces=[];
  const wall=material('#d1c8b0',{shadeBias:.2,hatch:false}),roof=material('#67716d',{shadeBias:-.12,hatch:false}),window=material('#29434b',{fill:true,hatch:false}),accent=material('#bd503b',{ink:1,hatch:false});
  const box=(w,h,d,x,y,z,mat)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);root.add(mesh);return mesh;};
  const random=randomFrom(91673),buildings=[];
  const clusters=[[-230,-150,190],[-530,-650,330],[800,-700,400],[-1450,-1350,450],[1400,-1900,500],[-600,-2550,520],[750,950,420]];
  for(let i=0;i<280;i++){
    const [cx,cz,r]=clusters[i%clusters.length],angle=random()*Math.PI*2,distance=Math.sqrt(random())*r;
    const x=cx+Math.cos(angle)*distance,z=cz+Math.sin(angle)*distance,w=16+random()*25,d=16+random()*22;
    if(nearRoute(x,z,65)||buildings.some(b=>Math.abs(x-b.x)<(w+b.w)/2+12&&Math.abs(z-b.z)<(d+b.d)/2+12))continue;
    const heights=[groundHeight(x-w/2,z-d/2),groundHeight(x+w/2,z-d/2),groundHeight(x-w/2,z+d/2),groundHeight(x+w/2,z+d/2)];
    const low=Math.min(...heights),floor=Math.max(...heights);if(floor-low>32)continue;
    const tower=i%9===0,h=tower?65+random()*100:8+random()*33,top=floor+h+1;
    if(floor-low>.2)box(w,floor-low,d,x,(floor+low)/2,z,roof);
    box(w,h,d,x,floor+h/2,z,wall);box(w+1,1,d+1,x,top-.5,z,i%8===0?accent:roof);
    const floors=Math.min(7,Math.max(1,Math.floor(h/7))),columns=Math.max(2,Math.floor(w/8));
    for(let level=0;level<floors;level++)for(let col=0;col<columns;col++){
      const wx=x+(col-(columns-1)/2)*(w/(columns+1)),wy=floor+3+level*(h-5)/floors;
      box(2.5,2.7,.15,wx,wy,z+d/2+.1,window);
    }
    if(tower){box(w*.65,5,d*.65,x,top+2.5,z,roof);box(.8,15,.8,x,top+12.5,z,accent);obstacles.push({x,z,hx:.4,hz:.4,bottom:top+5,top:top+20});obstacles.push({x,z,hx:w*.325,hz:d*.325,bottom:top,top:top+5});surfaces.push({x,z,hx:w*.325,hz:d*.325,top:top+5});}
    buildings.push({x,z,w,d});obstacles.push({x,z,hx:w/2,hz:d/2,bottom:low,top});surfaces.push({x,z,hx:w/2,hz:d/2,top});
  }
  const clear=(x,z,r=0)=>nearRoute(x,z,45+r)||buildings.some(b=>Math.abs(x-b.x)<b.w/2+12+r&&Math.abs(z-b.z)<b.d/2+12+r);
  const trees=[],rocks=[];
  for(let i=0;i<2400;i++){
    const x=(random()-.5)*6800,z=(random()-.55)*6600,h=8+random()*20,y=groundHeight(x,z);
    if(clear(x,z,8)||y>1000)continue;trees.push({x,z,y,h});
  }
  const foliage=new T.InstancedMesh(new T.ConeGeometry(1,1,7),material('#506d46',{shadeBias:-.09}),trees.length);
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(.15,.24,1,5),material('#63584b',{shadeBias:-.3}),trees.length),obj=new T.Object3D();
  trees.forEach((t,i)=>{
    obj.position.set(t.x,t.y+t.h*.62,t.z);obj.scale.set(t.h*.26,t.h*.82,t.h*.26);obj.rotation.y=i;obj.updateMatrix();foliage.setMatrixAt(i,obj.matrix);
    obj.position.set(t.x,t.y+t.h*.16,t.z);obj.scale.set(1,t.h*.32,1);obj.updateMatrix();trunks.setMatrixAt(i,obj.matrix);
    obstacles.push({type:'tree',x:t.x,z:t.z,radius:t.h*.13,base:t.y,bottom:t.y+t.h*.26,top:t.y+t.h*.9,trunkTop:t.y+t.h*.32,trunkRadius:.14});
  });root.add(foliage,trunks);
  for(let i=0;i<260;i++){
    const x=(random()-.5)*6200,z=(random()-.55)*6200;if(clear(x,z,20))continue;
    const r=12+random()*24,h=25+random()*100,y=groundHeight(x,z);rocks.push({x,z,y,r,h});
    obstacles.push({type:'spire',x,z,bottom:y,top:y+h,radius:r});
  }
  const stone=new T.InstancedMesh(new T.ConeGeometry(1,1,5),material('#97988b',{shadeBias:.12}),rocks.length);
  rocks.forEach((r,i)=>{obj.position.set(r.x,r.y+r.h/2,r.z);obj.scale.set(r.r,r.h,r.r);obj.rotation.y=i*.72;obj.updateMatrix();stone.setMatrixAt(i,obj.matrix);});root.add(stone);
  const padMeshes=[];
  for(const p of pads){
    const y=groundHeight(p.x,p.z),canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,256,256);ctx.strokeStyle=PALETTE.ink;ctx.lineWidth=7;ctx.lineCap='round';
    ctx.beginPath();ctx.arc(128,128,112,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(98,78);ctx.lineTo(96,176);ctx.moveTo(158,77);ctx.lineTo(161,177);ctx.moveTo(96,127);ctx.lineTo(161,129);ctx.stroke();
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const face=new T.Mesh(new T.PlaneGeometry(32,32),material('#fff',{map:texture}));face.rotation.x=-Math.PI/2;face.position.set(p.x,y+.12,p.z);root.add(face);
    const ring=new T.Mesh(new T.TorusGeometry(17,.12,4,64),material('#fff',{ink:1,fill:true}));ring.rotation.x=-Math.PI/2;ring.position.set(p.x,y+.15,p.z);root.add(ring);padMeshes.push(ring);
  }
  const gateMeshes=[],gatePoles=[];
  for(const p of gates){
    const ring=new T.Mesh(new T.TorusGeometry(12,.22,8,64),material('#fff',{ink:1,fill:true}));ring.position.set(p.x,p.y,p.z);root.add(ring);gateMeshes.push(ring);
  }
  batchStaticGeometry(root);
  return {root,obstacles,surfaces,buildings,gateMeshes,gatePoles,padMeshes,counts:{buildings:buildings.length,trees:trees.length,rocks:rocks.length},dispose(){
    const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){const base=o.material.doodle??o.material;materials.add(base);if(base.natural)materials.add(base.natural);}});
    for(const m of materials){if(m.map)textures.add(m.map);m.dispose();}for(const g of geometries)g.dispose();for(const t of textures)t.dispose();parent.remove(root);
  },surface:(x,z,y=Infinity)=>{
    let height=groundHeight(x,z);
    for(const slab of surfaces)if(Math.abs(x-slab.x)<slab.hx&&Math.abs(z-slab.z)<slab.hz&&y>slab.top+.3)height=Math.max(height,slab.top);
    return height;
  }};
}
function batchStaticGeometry(root){
  root.updateMatrixWorld(true);const groups=new Map();
  for(const mesh of root.children){if(!mesh.isMesh||mesh.isInstancedMesh)continue;const list=groups.get(mesh.material)??[];list.push(mesh);groups.set(mesh.material,list);}
  for(const [mat,meshes]of groups){
    if(meshes.length<2)continue;const attributes={position:[],normal:[],uv:[]};
    for(const mesh of meshes){const geometry=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);for(const name of Object.keys(attributes))attributes[name].push(...geometry.attributes[name].array);root.remove(mesh);geometry.dispose();mesh.geometry.dispose();}
    const geometry=new T.BufferGeometry();for(const [name,values]of Object.entries(attributes))geometry.setAttribute(name,new T.Float32BufferAttribute(values,name==='uv'?2:3));geometry.computeBoundingSphere();root.add(new T.Mesh(geometry,mat));
  }
}

export function makeHelicopter(){
  const group=new T.Group();group.name='Unshaded Little Bird';
  // AnirudhRao's MH-6, simplified for the browser. CC BY 4.0, credits in assets/.
  // Fixed unlit colors, independent of the world's look and sun direction.
  const flat=color=>new T.MeshBasicMaterial({color,fog:false,toneMapped:false});
  const materials={body:flat(PALETTE.airframe),ink:flat(PALETTE.ink),glass:flat(PALETTE.glass),accent:flat(PALETTE.accent)};
  // The CAD airframe includes thin panel surfaces around the open doors.
  // Both sides get the exact same unlit fill.
  for(const material of Object.values(materials))material.side=T.DoubleSide;
  const rotor=new T.Group();rotor.name='Main rotor';rotor.position.fromArray(littleBird.pivots.rotor);group.add(rotor);
  const tail=new T.Group();tail.name='Tail rotor';tail.position.fromArray(littleBird.pivots.tail);group.add(tail);
  const parents={body:group,rotor,tail};
  for(const part of littleBird.meshes){
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(part.positions,3));geometry.setIndex(part.indices);
    const mesh=new T.Mesh(geometry,materials[part.color]);mesh.name=`${part.parent} ${part.color}`;parents[part.parent].add(mesh);
  }
  // Back the CAD model's open rear-panel seams with clean, unlit skin. These
  // sit behind the imported surfaces, leaving the cabin doors and seats open.
  const skin=new T.Mesh(new T.SphereGeometry(1,24,16),materials.body);skin.name='Rear panel backing';skin.position.set(0,.81,.72);skin.scale.set(.58,.77,1.25);group.add(skin);
  const start=new T.Vector3(0,1.38,2.4),end=new T.Vector3(0,1.5,5.2),axis=end.clone().sub(start);
  const boom=new T.Mesh(new T.CylinderGeometry(.10,.23,axis.length(),16),materials.body);boom.name='Tailboom skin';boom.position.copy(start).add(end).multiplyScalar(.5);boom.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());group.add(boom);
  // A separate world-depth-tested pass keeps every part out of the paper pass.
  // Its renderer outlines the silhouette in pixels, without inflating thin panels.
  group.traverse(object=>object.layers.set(2));
  return {group,rotor,tail};
}

export function makeCockpit(){
  const group=new T.Group();group.name='Little Bird cockpit';
  const flat=color=>new T.MeshBasicMaterial({color,fog:false,toneMapped:false});
  const frame=flat(PALETTE.ink),shell=flat(PALETTE.panel),hardware=flat(PALETTE.ink);
  const pen=new T.LineBasicMaterial({color:PALETTE.ink,fog:false,toneMapped:false});
  const reticle=new T.LineBasicMaterial({color:PALETTE.ink,fog:false,toneMapped:false,transparent:true,opacity:.8});
  // The reference is 1498 x 1252. Trace in its image plane, preserving circular
  // instruments at our wider FOV instead of stretching the reference to 16:9.
  const span=2*Math.tan(105*Math.PI/360)/(16/9);
  const at=(x,y,depth=1.2)=>new T.Vector3((x-749)/1252*span*depth,(626-y)/1252*span*depth,-depth);
  const add=(geometry,material,point)=>{const mesh=new T.Mesh(geometry,material);mesh.position.copy(point);group.add(mesh);return mesh;};
  const line=(points,material=pen,loop=false)=>{
    const geometry=new T.BufferGeometry().setFromPoints(points),stroke=loop?new T.LineLoop(geometry,material):new T.Line(geometry,material);group.add(stroke);return stroke;
  };
  const tube=(points,radius,material=frame,depth=1.2)=>{
    const curve=new T.CatmullRomCurve3(points.map(([x,y])=>at(x,y,depth)));
    return add(new T.TubeGeometry(curve,48,radius,6,false),material,new T.Vector3());
  };
  const plate=(points,material,depth,name)=>{
    const shape=new T.Shape(),vertices=points.map(([x,y])=>at(x,y,depth));
    vertices.forEach((p,i)=>i?shape.lineTo(p.x,p.y):shape.moveTo(p.x,p.y));shape.closePath();
    const mesh=add(new T.ExtrudeGeometry(shape,{depth:.04,bevelEnabled:false,steps:1}),material,new T.Vector3(0,0,-depth-.04));mesh.name=name;
    line(vertices.map(p=>p.clone().setZ(p.z+.002)),pen,true);return mesh;
  };
  const circle=(x,y,r,depth,material=pen)=>line(Array.from({length:64},(_,i)=>at(x+Math.cos(i*Math.PI/32)*r,y+Math.sin(i*Math.PI/32)*r,depth)),material,true);
  // Sloped left windshield frame and curved right door rim, as in the shot.
  plate([[116,-80],[209,-80],[510,423],[649,803],[614,806],[446,456]],frame,1.35,'Left canopy frame');
  const rim=tube([[1600,-80],[1530,260],[1452,578],[1392,825],[1352,1080],[1380,1440]],.018,frame,1.15);rim.name='Right canopy rim';
  plate([[1392,834],[1560,911],[1760,1420],[1330,1420]],shell,1.13,'Right door');
  plate([[1370,840],[1428,860],[1396,906],[1309,889],[1271,867]],hardware,1.07,'Sight bracket');
  for(const x of [1298,1338,1378])tube([[x,865],[x+13,894]],.004,shell,1.06);
  // Frame-mounted hardware and the small dash-mounted pod.
  plate([[302,379],[456,384],[445,523],[330,554],[327,514],[301,515]],shell,1.30,'Frame mount');
  circle(373,462,48,1.295);plate([[332,446],[405,446],[407,487],[330,487]],hardware,1.29,'Mount switch');
  tube([[446,469],[483,499],[497,547],[516,560],[523,553]],.007,hardware,1.28);
  add(new T.CylinderGeometry(.012,.018,.057,8),hardware,at(574,779,1.24));
  const pod=add(new T.SphereGeometry(.051,12,8),shell,at(572,725,1.24));pod.scale.set(1,.8,1);
  add(new T.CylinderGeometry(.019,.025,.029,8),hardware,at(568,681,1.24));
  // Separate analog pedestal and offset display, rather than a wide gauge strip.
  plate([[152,810],[625,800],[699,862],[676,1430],[70,1430]],shell,1.20,'Instrument pedestal');
  plate([[653,893],[755,891],[816,976],[1067,992],[1082,1450],[610,1450]],shell,1.11,'Display pedestal');
  tube([[697,903],[1020,998],[1356,1138]],.014,hardware,1.18);
  const makePanel=(name,x,y,w,h,depth,cw,ch)=>{
    const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
    const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const size=span*depth/1252;
    const panel=add(new T.PlaneGeometry(w*size,h*size),new T.MeshBasicMaterial({map:texture,fog:false,toneMapped:false}),at(x+w/2,y+h/2,depth));panel.name=name;
    return {canvas,ctx,texture};
  };
  const analog=makePanel('Instruments',154,818,477,477,1.19,768,768);
  const display=makePanel('Flight display',652,990,413,500,1.10,640,768);
  // Sight sits on a thin crossbar, with a rounded glass frame and open center.
  tube([[702,872],[819,880],[985,887],[1172,899],[1289,873]],.005,hardware,1.25);
  const glass=flat('#b7d1d5');glass.transparent=true;glass.opacity=.035;glass.depthWrite=false;
  const size=span*1.29/1252;
  const lens=add(new T.PlaneGeometry(146*size,147*size),glass,at(981,755,1.29));lens.name='Sight glass';
  const sight=tube([[905,836],[909,742],[920,710],[947,687],[981,678],[1017,687],[1047,711],[1059,744],[1053,836]],.006,hardware,1.27);sight.name='Reflex sight';
  const base=add(new T.CylinderGeometry(.12,.135,.09,24),shell,at(981,877,1.24));base.name='Sight base';
  for(const y of [-.044,.044]){const ring=add(new T.TorusGeometry(.122,.006,6,48),hardware,base.position.clone().add(new T.Vector3(0,y,0)));ring.rotation.x=Math.PI/2;}
  circle(981,753,10,1.265,reticle);
  for(const [x1,y1,x2,y2]of [[926,771,1035,735],[963,700,999,807]])line([at(x1,y1,1.265),at(x2,y2,1.265)],reticle);
  for(const [start,end]of [[.1,1.4],[1.75,3.05],[3.35,4.6],[4.95,6.15]])line(Array.from({length:18},(_,i)=>{const a=start+(end-start)*i/17;return at(981+Math.cos(a)*44,753+Math.sin(a)*44,1.265);}),reticle);
  for(const [x,y]of [[710,1010],[986,1018],[1350,887]])add(new T.SphereGeometry(.007,8,5),hardware,at(x,y,1.07));
  let last=-Infinity,style='doodle',latest;
  const update=t=>{
    latest=t;if(t.t>=last&&t.t-last<.1)return;last=t.t;
    const natural=style==='natural',paper=natural?'#343b36':PALETTE.panel,ink=natural?'#d9dcc9':PALETTE.ink,face=natural?'#111d18':PALETTE.paper,mark=natural?'#d7b96c':PALETTE.accent;
    const ctx=analog.ctx;
    ctx.fillStyle=paper;ctx.fillRect(0,0,768,768);ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.lineWidth=3;
    for(let i=0;i<15;i++){ctx.strokeRect(22+i*49,22,31,29);if(i===3||i===4){ctx.fillStyle=face;ctx.fillRect(26+i*49,26,23,21);ctx.fillStyle=ink;}}
    for(const x of [18,418]){ctx.strokeRect(x,78,332,48);ctx.strokeRect(x+7,85,318,34);}
    ctx.strokeRect(373,91,23,23);
    const dial=(x,y,r,label,fraction,value)=>{
      ctx.fillStyle=face;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.stroke();
      ctx.beginPath();ctx.arc(x,y,r-7,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<36;i++){const a=i*Math.PI/18;ctx.beginPath();ctx.moveTo(x+Math.sin(a)*(r-13),y-Math.cos(a)*(r-13));ctx.lineTo(x+Math.sin(a)*(r-(i%3===0?28:20)),y-Math.cos(a)*(r-(i%3===0?28:20)));ctx.stroke();}
      const a=-Math.PI*.75+Math.PI*1.5*Math.max(0,Math.min(1,fraction));ctx.strokeStyle=mark;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-Math.sin(a)*13,y+Math.cos(a)*13);ctx.lineTo(x+Math.sin(a)*(r-32),y-Math.cos(a)*(r-32));ctx.stroke();ctx.strokeStyle=ink;ctx.lineWidth=3;
      ctx.fillStyle=ink;ctx.textAlign='center';ctx.font=`21px ${MONO_FONT}`;ctx.fillText(value,x,y+43);ctx.font=`16px ${MONO_FONT}`;ctx.fillText(label,x,y+66);
    };
    dial(130,314,101,'km/h',t.speed/350,Math.round(t.speed));dial(628,314,98,'m',t.y/1500,Math.round(t.y));
    dial(130,603,96,'%',t.rotor??t.collective,Math.round((t.rotor??t.collective)*100));dial(628,603,98,'m/s',(t.vy+25)/50,t.vy.toFixed(1));
    // Circular attitude indicator occupies the center of the analog cluster.
    ctx.fillStyle=face;ctx.beginPath();ctx.arc(379,314,98,0,Math.PI*2);ctx.fill();ctx.strokeStyle=ink;ctx.stroke();
    ctx.save();ctx.beginPath();ctx.arc(379,314,88,0,Math.PI*2);ctx.clip();ctx.translate(379,314);ctx.rotate(-t.roll*Math.PI/180);
    ctx.fillStyle=natural?'#546f76':PALETTE.sky;ctx.fillRect(-130,-180+t.pitch*2.5,260,180);
    ctx.fillStyle=natural?'#70644a':PALETTE.ground;ctx.fillRect(-130,t.pitch*2.5,260,180);
    ctx.strokeStyle=ink;ctx.lineWidth=2;for(let a=-30;a<=30;a+=10){const y=(t.pitch-a)*2.5;ctx.beginPath();ctx.moveTo(-34,y);ctx.lineTo(-9,y);ctx.moveTo(9,y);ctx.lineTo(34,y);ctx.stroke();}ctx.restore();
    ctx.strokeStyle=mark;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(334,314);ctx.lineTo(367,314);ctx.lineTo(379,321);ctx.lineTo(391,314);ctx.lineTo(424,314);ctx.stroke();
    ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.strokeRect(271,514,216,178);ctx.fillStyle=face;ctx.fillRect(280,523,198,160);
    ctx.fillStyle=ink;ctx.textAlign='center';ctx.font=`35px ${MONO_FONT}`;ctx.fillText(Math.round(t.heading).toString().padStart(3,'0')+'°',379,610);
    analog.texture.needsUpdate=true;
    const d=display.ctx;d.fillStyle=paper;d.fillRect(0,0,640,768);d.strokeStyle=ink;d.lineWidth=3;
    d.fillStyle=face;d.fillRect(67,94,507,640);d.strokeRect(59,86,523,656);
    for(let i=0;i<7;i++){d.strokeRect(16,124+i*82,23,34);d.strokeRect(601,124+i*82,23,34);}
    for(const x of [125,506]){d.beginPath();d.arc(x,39,12,0,Math.PI*2);d.stroke();}
    d.fillStyle=ink;d.font=`24px ${MONO_FONT}`;d.textAlign='left';d.fillText(Math.round(t.y)+' m',93,143);d.fillText(Math.round(t.speed)+' km/h',93,681);d.fillText(t.vy.toFixed(1)+' m/s',93,718);
    // Live attitude and tapes, no ornamental readouts or copied game labels.
    d.save();d.beginPath();d.rect(81,168,480,468);d.clip();d.translate(326,408);d.rotate(-t.roll*Math.PI/180);
    d.strokeStyle=natural?'#719b83':ink;d.lineWidth=2;
    for(let a=-50;a<=50;a+=10){const y=(t.pitch-a)*4;d.beginPath();d.moveTo(-70,y);d.lineTo(-16,y);d.moveTo(16,y);d.lineTo(70,y);d.stroke();}d.restore();
    d.strokeStyle=mark;d.lineWidth=4;d.beginPath();d.moveTo(284,408);d.lineTo(316,408);d.lineTo(326,415);d.lineTo(336,408);d.lineTo(368,408);d.stroke();
    d.strokeStyle=ink;d.lineWidth=2;for(let i=0;i<20;i++){d.beginPath();d.moveTo(104+i*21,179);d.lineTo(104+i*21,179+(i%5===0?20:11));d.moveTo(536,219+i*20);d.lineTo(536-(i%5===0?20:11),219+i*20);d.stroke();}
    display.texture.needsUpdate=true;
  };
  const setStyle=value=>{
    style=value==='natural'?'natural':'doodle';const natural=style==='natural';
    frame.color.set(natural?'#202721':PALETTE.ink);hardware.color.set(natural?'#151d1a':PALETTE.ink);shell.color.set(natural?'#343b36':PALETTE.panel);pen.color.set(natural?'#111915':PALETTE.ink);reticle.color.set(natural?'#e8e7c7':PALETTE.ink);
    last=-Infinity;if(latest)update(latest);
  };
  update({t:0,speed:0,y:0,vy:0,heading:0,roll:0,pitch:0,collective:0,rotor:0});group.traverse(object=>object.layers.set(1));
  return {group,update,setStyle};
}
