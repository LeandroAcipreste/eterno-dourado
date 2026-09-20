const fs=require('fs'),path=require('path');const dir=__dirname;
function parse(file){let b=fs.readFileSync(file),n=b.readUInt32LE(12);return {d:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
const {d,bin}=parse(path.join(dir,'03LM.glb'));const source=parse(path.join(dir,'catalogo/03LM-1.glb'));
const parts=[bin];let offset=bin.length;
function add(v,type){let a=type==='SCALAR'?new Uint32Array(v):new Float32Array(v),b=Buffer.from(a.buffer),view=d.bufferViews.length;d.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length});parts.push(b);offset+=b.length;let ac={bufferView:view,componentType:type==='SCALAR'?5125:5126,count:v.length/(type==='VEC3'?3:1),type};if(type==='VEC3'){ac.min=[0,1,2].map(c=>Math.min(...v.filter((_,i)=>i%3===c)));ac.max=[0,1,2].map(c=>Math.max(...v.filter((_,i)=>i%3===c)));}d.accessors.push(ac);return d.accessors.length-1;}
function read(i){const a=source.d.accessors[i],v=source.d.bufferViews[a.bufferView],n=a.type==='VEC3'?3:1,b=source.bin,start=(v.byteOffset||0)+(a.byteOffset||0);return Array.from({length:a.count*n},(_,k)=>{let at=start+Math.floor(k/n)*(v.byteStride||n*4)+(k%n)*4;return a.componentType===5126?b.readFloatLE(at):b.readUInt32LE(at);});}
const gem=source.d.meshes.find(m=>/Pedra/.test(m.name)).primitives[0],pos=read(gem.attributes.POSITION),norm=read(gem.attributes.NORMAL),idx=read(gem.indices);
const oldAngle=Math.PI*.35,angle=.53,turn=angle-oldAngle,co=Math.cos(turn),si=Math.sin(turn),n=[Math.cos(angle),Math.sin(angle)],u=[-n[1],n[0]];
let radial=[];for(let i=0;i<pos.length;i+=3)radial.push(pos[i]*Math.cos(oldAngle)+pos[i+1]*Math.sin(oldAngle));const oldTop=Math.max(...radial),top=.01053;
for(let i=0;i<pos.length;i+=3){const x=pos[i],y=pos[i+1],nx=norm[i],ny=norm[i+1];pos[i]=co*x-si*y+n[0]*(top-oldTop);pos[i+1]=si*x+co*y+n[1]*(top-oldTop);norm[i]=co*nx-si*ny;norm[i+1]=si*nx+co*ny;}
// Open only the local stone seat in the exterior, so the gold does not intersect the gem.
const body=d.meshes[0].primitives[0],pa=d.accessors[body.attributes.POSITION],pv=d.bufferViews[pa.bufferView],ia=d.accessors[body.indices],iv=d.bufferViews[ia.bufferView],kept=[];
for(let i=0;i<ia.count;i+=3){let tri=[0,1,2].map(k=>bin.readUInt32LE((iv.byteOffset||0)+(ia.byteOffset||0)+(i+k)*4));let center=[0,0,0];for(const index of tri)for(let c=0;c<3;c++)center[c]+=bin.readFloatLE((pv.byteOffset||0)+(pa.byteOffset||0)+index*12+c*4)/3;let tangent=center[0]*u[0]+center[1]*u[1],radial=center[0]*n[0]+center[1]*n[1];if(!(radial>.0100&&Math.hypot(tangent,center[2])<.00065))kept.push(...tri);}
body.indices=add(kept,'SCALAR');
d.materials.push(source.d.materials[gem.material]);d.extensionsUsed=source.d.extensionsUsed;
d.meshes.push({name:'Uma pedra central facetada',primitives:[{attributes:{POSITION:add(pos,'VEC3'),NORMAL:add(norm,'VEC3')},indices:add(idx,'SCALAR'),material:2}]});
d.nodes.push({name:'Pedra central',mesh:1});
// Thin polished lip holds the stone, almost flush with the approved band.
let vp=[],vn=[],vi=[];const N=128,M=12,R=.00068,t=.000045,seat=.01030;
for(let i=0;i<=N;i++){let a=i/N*Math.PI*2;for(let j=0;j<=M;j++){let b=j/M*Math.PI*2,r=R+t*Math.cos(b),h=seat+t*Math.sin(b);vp.push(n[0]*h+u[0]*r*Math.cos(a),n[1]*h+u[1]*r*Math.cos(a),r*Math.sin(a));vn.push(u[0]*Math.cos(a)*Math.cos(b)+n[0]*Math.sin(b),u[1]*Math.cos(a)*Math.cos(b)+n[1]*Math.sin(b),Math.sin(a)*Math.cos(b));}}
for(let i=0;i<N;i++)for(let j=0;j<M;j++){let a=i*(M+1)+j,b=a+M+1;vi.push(a,b,a+1,b,b+1,a+1);}
d.meshes.push({name:'Cravação discreta',primitives:[{attributes:{POSITION:add(vp,'VEC3'),NORMAL:add(vn,'VEC3')},indices:add(vi,'SCALAR'),material:0}]});d.nodes.push({name:'Borda da cravação',mesh:2});
d.nodes[0].name='Corpo 03LM aprovado';d.nodes.push({name:'03LM-1 — uma única aliança',children:[0,1,2]});d.scenes=[{nodes:[3]}];d.scene=0;d.buffers=[{byteLength:offset}];d.extras={...d.extras,codigoFoto:'03LM-1',codigoTabela:'03-1LM',descricaoTabela:'Aliança Anat. 3mm C/ Pedra',quantidadeAliancas:1,quantidadePedras:1,diametroPedraEstimadoMm:1.28};
let js=Buffer.from(JSON.stringify(d));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,32)]);let binary=Buffer.concat(parts),h=Buffer.alloc(20),bh=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+js.length+binary.length,8);h.writeUInt32LE(js.length,12);h.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);const output=Buffer.concat([h,js,bh,binary]);fs.writeFileSync(path.join(dir,'03LM-1-unica.glb'),output);
fs.writeFileSync(path.join(dir,'pedra.js'),'export const modelo="data:model/gltf-binary;base64,'+output.toString('base64')+'";');
let html=fs.readFileSync(path.join(dir,'index.html'),'utf8').replaceAll('03LM ·','03LM-1 ·').replace('<h1>03LM</h1>','<h1>03LM-1</h1>').replace('Lisa anatômica · 3 mm','Anatômica · 3 mm · Uma pedra').replace('../03LM-760.webp','../03LM-1-760.webp').replace('href="03LM.glb"','href="03LM-1-unica.glb"').replace('<a href="03LM.stl" download>Baixar STL</a>','').replace("'./modelo.js?v=referencia1'","'./pedra.js?v=1'").replace('ctrl.autoRotate=true','ctrl.autoRotate=false').replace('>Pausar giro<','>Retomar giro<');
fs.writeFileSync(path.join(dir,'03LM-1.html'),html);console.log(JSON.stringify({aliancas:1,pedras:1,corpoOriginalPreservado:true,bytes:output.length}));
