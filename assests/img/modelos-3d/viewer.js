import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const $=id=>document.getElementById(id);
const renderer=new THREE.WebGLRenderer({canvas:$('canvas'),antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
const scene=new THREE.Scene();
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
scene.environment=pmrem.fromScene(room,.045).texture;room.dispose();pmrem.dispose();
const camera=new THREE.PerspectiveCamera(32,1,.001,5);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=.035;controls.maxDistance=.18;controls.autoRotate=true;controls.autoRotateSpeed=.65;
const key=new THREE.DirectionalLight(0xffefd6,2);key.position.set(.02,.04,.06);scene.add(key);
const fill=new THREE.DirectionalLight(0xd9e8ff,.65);fill.position.set(-.06,.01,-.04);scene.add(fill);
const loader=new GLTFLoader();let current=null,request=0;
function reset(){camera.position.set(.033,.017,.083);controls.target.set(0,0,0);controls.update()}
reset();
const resize=()=>{const r=$('stage').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix()};new ResizeObserver(resize).observe($('stage'));
const data=await fetch('./catalogo.json').then(r=>r.json());
function dispose(model){model.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose())}})}
async function select(item){
  const ticket=++request;$('loading').hidden=false;$('loading').textContent='Carregando '+item.code+'…';
  $('name').textContent=item.code;$('desc').textContent=item.style+' · '+(item.bytes/1048576).toFixed(2)+' MB';$('reference').src=item.reference;$('download').href=item.file;$('download').download=item.code+'.glb';
  document.querySelectorAll('.item').forEach(b=>b.classList.toggle('active',b.dataset.code===item.code));
  try{const gltf=await loader.loadAsync(item.file);if(ticket!==request){dispose(gltf.scene);return}if(current){scene.remove(current);dispose(current)}current=gltf.scene;scene.add(current);reset();$('loading').hidden=true;$('status').textContent='GLB · 360° · '+item.code;history.replaceState(null,'','#'+encodeURIComponent(item.code));window.modelReady=item.code;}
  catch(e){$('loading').textContent='Não foi possível abrir este modelo.';$('loading').classList.add('error');console.error(e)}
}
function list(){const q=$('search').value.toLowerCase();const filtered=data.filter(i=>(i.code+' '+i.style).toLowerCase().includes(q));$('count').textContent=filtered.length+' de '+data.length+' modelos';$('list').replaceChildren();for(const item of filtered){const b=document.createElement('button');b.className='item';b.dataset.code=item.code;const img=document.createElement('img');img.src=item.reference;img.loading='lazy';img.alt='';const label=document.createElement('div');const title=document.createElement('strong');title.textContent=item.code;const sub=document.createElement('span');sub.textContent=item.style;label.append(title,sub);b.append(img,label);b.onclick=()=>select(item);$('list').append(b)}}
$('search').addEventListener('input',list);list();
$('rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('rotate').textContent=controls.autoRotate?'Pausar rotação':'Girar automaticamente';$('rotate').classList.toggle('on',controls.autoRotate);$('rotate').setAttribute('aria-pressed',String(controls.autoRotate))};
$('reset').onclick=reset;
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});
select(data.find(i=>i.code===decodeURIComponent(location.hash.slice(1)))||data[0]);
