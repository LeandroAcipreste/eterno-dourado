const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../../..'),out=path.join(__dirname,'catalogo');fs.mkdirSync(out,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'src/data/modelos.json'))).modelos;
let report=[];
for(const item of catalog){
const source=item.code==='03LM'?path.join(__dirname,'03LM.glb'):path.join(root,item.glb);
const b=fs.readFileSync(source),jl=b.readUInt32LE(12),d=JSON.parse(b.subarray(20,20+jl));let binary=Buffer.from(b.subarray(28+jl)),parts=[binary],offset=binary.length;
function add(values,type){const a=type==='SCALAR'?new Uint32Array(values):new Float32Array(values),buf=Buffer.from(a.buffer);d.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buf.length});parts.push(buf);offset+=buf.length;let count=a.length/(type==='VEC3'?3:1);let ac={bufferView:d.bufferViews.length-1,componentType:type==='SCALAR'?5125:5126,count,type};if(type==='VEC3'){ac.min=[Infinity,Infinity,Infinity];ac.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i++){ac.min[i%3]=Math.min(ac.min[i%3],a[i]);ac.max[i%3]=Math.max(ac.max[i%3],a[i]);}}d.accessors.push(ac);return d.accessors.length-1;}
function readPositions(i){const a=d.accessors[i],v=d.bufferViews[a.bufferView],start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||12;return Array.from({length:a.count},(_,k)=>[0,1,2].map(c=>binary.readFloatLE(start+k*stride+c*4)));}
let gems=0;
for(const m of d.materials||[]){let p=m.pbrMetallicRoughness||={};const name=m.name||'';
if(/pedra|diamond|gem/i.test(name)){p.baseColorFactor=[1,1,1,1];p.metallicFactor=0;p.roughnessFactor=.035;m.extensions={KHR_materials_transmission:{transmissionFactor:1},KHR_materials_ior:{ior:2.417},KHR_materials_volume:{thicknessFactor:.001,attenuationDistance:1,attenuationColor:[1,1,1]},KHR_materials_specular:{specularFactor:1}};d.extensionsUsed=[...new Set([...(d.extensionsUsed||[]),...Object.keys(m.extensions)])];}
else if(/ouro|dourad/i.test(name)&&!/friso|escurec/i.test(name)){p.baseColorFactor=[.95,.64,.22,1];p.metallicFactor=1;p.roughnessFactor=/acetinad/i.test(name)?.25:.10;}
else if(/pratead|aço|inox/i.test(name)){p.baseColorFactor=[.72,.75,.78,1];p.metallicFactor=1;p.roughnessFactor=.12;}}
for(const mesh of d.meshes)for(const primitive of mesh.primitives){if(!/pedra|diamond|gem/i.test(d.materials[primitive.material]?.name||''))continue;gems++;
// Rebuild each existing stone in its own tangent frame, retaining its placement and oval aspect.
let old=readPositions(primitive.attributes.POSITION),cx=old.reduce((a,v)=>a+v[0],0)/old.length,cy=old.reduce((a,v)=>a+v[1],0)/old.length,angle=Math.atan2(cy,cx),n=[Math.cos(angle),Math.sin(angle),0],u=[-n[1],n[0],0];
let tang=old.map(v=>v[0]*u[0]+v[1]*u[1]),rad=old.map(v=>v[0]*n[0]+v[1]*n[1]),zs=old.map(v=>v[2]);let size=(Math.max(...tang)-Math.min(...tang))/2,z=(Math.max(...zs)+Math.min(...zs))/2,oval=(Math.max(...zs)-Math.min(...zs))/(2*size),r=Math.max(...rad)-size*.5;
let verts=[],faces=[];function ring(count,radius,height,phase=0){let start=verts.length;for(let k=0;k<count;k++){let a=k/count*Math.PI*2+phase;verts.push([n[0]*(r+size*height)+u[0]*size*radius*Math.cos(a),n[1]*(r+size*height)+u[1]*size*radius*Math.cos(a),z+size*oval*radius*Math.sin(a)]);}return start;}
let table=ring(8,.54,.50),star=ring(8,.78,.34,Math.PI/8),belt=ring(16,1,.12),bottom=ring(16,1,.085),pavilion=ring(8,.48,-.40,Math.PI/8),tip=verts.length;verts.push([n[0]*(r-size*.68),n[1]*(r-size*.68),z]);
for(let k=1;k<7;k++)faces.push([0,k,k+1]);
for(let k=0;k<8;k++){let next=(k+1)%8,a=2*k,b=(a+1)%16,c=(a+2)%16;faces.push([table+k,star+k,table+next],[table+k,belt+a,star+k],[star+k,belt+c,table+next],[star+k,belt+a,belt+b],[star+k,belt+b,belt+c]);}
for(let k=0;k<16;k++){let next=(k+1)%16;faces.push([belt+k,bottom+k,belt+next],[belt+next,bottom+k,bottom+next]);}
for(let k=0;k<8;k++){let a=2*k,b=(a+1)%16,c=(a+2)%16,next=(k+1)%8;faces.push([bottom+a,pavilion+k,bottom+b],[bottom+b,pavilion+k,bottom+c],[bottom+c,pavilion+k,pavilion+next],[pavilion+k,tip,pavilion+next]);}
let pos=[],norm=[],idx=[];for(let face of faces){let vv=face.map(i=>verts[i]),a=vv[1].map((x,i)=>x-vv[0][i]),b=vv[2].map((x,i)=>x-vv[0][i]),nn=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],l=Math.hypot(...nn);for(const v of vv){idx.push(idx.length);pos.push(...v);norm.push(...nn.map(x=>x/l));}}
primitive.attributes={POSITION:add(pos,'VEC3'),NORMAL:add(norm,'VEC3')};primitive.indices=add(idx,'SCALAR');
}
d.buffers=[{byteLength:offset}];d.extras={...d.extras,acabamento:'03LM aprovado; pedras com lapidação facetada e refração',fidelidade:'Geometrias do catálogo preservadas; não certifica correspondência exata com fotografia nem composição mineral.'};let json=Buffer.from(JSON.stringify(d));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);let bin=Buffer.concat(parts),head=Buffer.alloc(20),bh=Buffer.alloc(8);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+bin.length,8);head.writeUInt32LE(json.length,12);head.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(path.join(out,item.code+'.glb'),Buffer.concat([head,json,bh,bin]));report.push({codigo:item.code,pedras:gems,esperadas:item.pedras,largura:item.larguraMm});
}
fs.writeFileSync(path.join(out,'catalogo.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({modelos:report.length,comPedras:report.filter(x=>x.pedras).length,pedras:report.reduce((s,x)=>s+x.pedras,0),divergencias:report.filter(x=>x.esperadas!=='none'&&!x.pedras)}));
