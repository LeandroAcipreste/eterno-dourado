const fs=require('fs'),path=require('path');
const p=path.join(__dirname,'gerar.cjs');
fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('roughnessFactor:.17','roughnessFactor:.065').replace('roughnessFactor:.19','roughnessFactor:.075'));
const h=path.join(__dirname,'index.html');let html=fs.readFileSync(h,'utf8');
html=html.replace("from'./modelo.js'","from'./modelo.js?v=polido2'");
html=html.replace('r.toneMappingExposure=1.25','r.toneMappingExposure=1.05');
html=html.replace("s.background=new T.Color('#151513')","s.background=new T.Color('#090a0c')");
html=html.replace('s.environment=pm.fromScene(new RoomEnvironment(),.025).texture;',`// Reflective studio: broad key, narrow edge strips, dark negative fill.
const studio=new T.Scene();studio.background=new T.Color(.055,.055,.06);
function softbox(w,h,x,y,z,power,color){const material=new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(power),side:T.DoubleSide});const box=new T.Mesh(new T.PlaneGeometry(w,h),material);box.position.set(x,y,z);box.lookAt(0,0,0);studio.add(box);}
softbox(3,7,-4,2,4,4.5,'#fff3df');
softbox(.65,8,4,1,2,7,'#ffffff');
softbox(5,1.2,0,5,-1,5,'#fff8ea');
softbox(1.2,6,-2,0,-5,3,'#dce7ff');
softbox(3,4,1,-3,4,.65,'#ffffff');
s.environment=pm.fromScene(studio,0,0.1,100).texture;
studio.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});pm.dispose();`);
html=html.replace('ctrl.autoRotateSpeed=.7','ctrl.autoRotateSpeed=.35');
fs.writeFileSync(h,html);
