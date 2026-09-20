const fs=require('fs'),path=require('path');
const file=n=>path.join(__dirname,n);
// Preserve the approved appearance for exact rollback.
for(const n of ['index.html','gerar.cjs'])if(!fs.existsSync(file(n+'.original')))fs.copyFileSync(file(n),file(n+'.original'));
let src=fs.readFileSync(file('gerar.cjs.original'),'utf8');
src=src.replace('roughnessFactor:.17','roughnessFactor:.10').replace('roughnessFactor:.19','roughnessFactor:.12').replace('[.83,.61,.28,1]','[.95,.64,.22,1]');
fs.writeFileSync(file('gerar.cjs'),src);
let html=fs.readFileSync(file('index.html.original'),'utf8');
html=html.replace('modelo.js?v=original3','modelo.js?v=referencia1');
html=html.replace('s.environment=pm.fromScene(new RoomEnvironment(),.025).texture;',`const studio=new T.Scene();
studio.background=new T.Color(.24,.24,.24);
function panel(w,h,x,y,z,intensity){
 const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(intensity,intensity,intensity),side:T.DoubleSide}));
 mesh.position.set(x,y,z);mesh.lookAt(0,0,0);studio.add(mesh);
}
// Large diffusion panels create broad, creamy reflections like the supplied photo.
panel(9,12,-5,5,5,3.8);
panel(7,10,6,2,-4,2.8);
panel(8,6,0,7,0,3.0);
panel(5,8,1,-4,6,1.0);
panel(1.5,9,6,0,4,4.0);
s.environment=pm.fromScene(studio,.008,.1,100).texture;
studio.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});pm.dispose();`);
html=html.replace('r.toneMappingExposure=1.25','r.toneMappingExposure=1.15');
fs.writeFileSync(file('index.html'),html);
