"""Explicit single-ring reconstructions reviewed against product photos and table."""
import sys,importlib.util,json,math,copy,struct,shutil
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from especificacoes import specs,ROOT
HERE=Path(__file__).resolve().parent
DEST=HERE.parent/'individuais';DEST.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('base',ROOT/'assests/img/modelos-3d/gerar_modelos.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
TAU=2*math.pi;FRONT=.53
base.MATERIALS=[base.material('Ouro polido — padrão 03LM',[.95,.64,.22],rough=.10),base.material('Interior prateado — padrão 03LM',[.72,.75,.78],rough=.12),base.material('Pedra facetada',[1,1,1],metal=0,rough=.035,extensions={'KHR_materials_transmission':{'transmissionFactor':1},'KHR_materials_ior':{'ior':2.417},'KHR_materials_volume':{'thicknessFactor':.001,'attenuationDistance':1,'attenuationColor':[1,1,1]}})]

def wrap(a):return (a+math.pi)%TAU-math.pi
def profile(p,z,inside=False):
    w=p['width'];h=w/2;v=np.clip(z/h,-1,1)
    if p['profile']=='round':return 9+.675+(-1 if inside else 1)*.675*np.sqrt(np.maximum(0,1-v*v))
    if inside:return 9+.24*np.abs(v)**10
    bevel=min(.48,w*.095) if p['profile']=='chamfer' else .10
    edge=np.maximum(0,np.abs(z)-(h-bevel))
    return 10.35-edge+.025*(1-v*v)

def recess(p,a,z):
    result=np.zeros(np.broadcast_shapes(np.shape(a),np.shape(z)))
    for g in p['grooves']:
        center=g['z']+p.get('grooveTilt',0)*np.sin(a)
        result+=g['depth']*np.exp(-((z-center)/g['width'])**2)
    if p.get('motif')=='G':
        # Two opposed tapered, curving strokes; no continuous invented center groove.
        for phase,sign in [(0,1),(math.pi,-1)]:
            t=wrap(a-FRONT-phase);weight=np.clip((1.7-np.abs(t))/.5,0,1)
            center=sign*(.65+.75*np.sin(t*.85));result+=.17*weight*np.exp(-((z-center)/(.065+.03*weight))**2)
    return result

def body(g,parent,p):
    w=p['width'];N=384;K=160 if p.get('heart') else 112
    if p.get('motif')=='AMOR':N=1024;K=160
    angles=np.arange(N)*TAU/N
    # Cosine sampling resolves the rounded edge without coarse flat spots.
    zz=np.sin(np.linspace(-math.pi/2,math.pi/2,K+1))*w/2
    a=angles[:,None];z=np.broadcast_to(zz,(N,K+1));outer=profile(p,z)-recess(p,a,z);inner=profile(p,z,True)
    if p.get('motif')=='AMOR':
        mask=Image.new('L',(1024,256));draw=ImageDraw.Draw(mask);font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',210)
        draw.text((8,-18),'AMOR',font=font,fill=255,stroke_width=1)
        ar=np.asarray(mask)/255.;x=(wrap(a-FRONT)/2.1+.5)*1023;y=(.5-z/w)*255
        xx=np.clip(x.astype(int),0,1023);yy=np.clip(y.astype(int),0,255);emboss=ar[yy,xx]*((x>=0)&(x<=1023));outer+=.16*emboss
    xyz=lambda rr:np.stack([rr*np.cos(a),rr*np.sin(a),z],axis=-1).reshape(-1,3)
    vo,vi=xyz(outer),xyz(inner);verts=np.vstack([vo,vi]);stride=len(vo)
    ii=np.arange(N)[:,None];jj=np.arange(K)[None,:];A=ii*(K+1)+jj;B=((ii+1)%N)*(K+1)+jj;C=A+1;D=B+1
    ac=angles[:,None]+math.pi/N;zc=(zz[:-1]+zz[1:])[None,:]/2
    keep=np.ones((N,K),bool);cutwalls=[];extraout=[];extrain=[];extra=[]
    if p.get('heart'):
        x=wrap(ac-FRONT)*10.35/(w*.235);y=zc/(w*.225)+.12
        def heart(ang,axial):
            xx=wrap(ang-FRONT)*10.35/(w*.235);yy=axial/(w*.225)+.12
            return (xx*xx+yy*yy-1)**3-xx*xx*yy**3
        corners=heart(a,z)>=0
        p0=corners[:,:-1];p1=np.roll(corners,-1,axis=0)[:,:-1];p2=np.roll(corners,-1,axis=0)[:,1:];p3=corners[:,1:]
        keep=p0&p1&p2&p3;mixed=(p0|p1|p2|p3)&~keep;cache={}
        def vertex(ang,axial,inside):
            key=(round(ang,12),round(axial,12),inside)
            if key not in cache:
                rr=float(profile(p,np.array(axial),inside))-(0 if inside else float(recess(p,np.array(ang),np.array(axial))))
                cache[key]=len(verts)+len(extra);extra.append([rr*math.cos(ang),rr*math.sin(ang),axial])
            return cache[key]
        for i,j in zip(*np.where(mixed)):
            poly=[(angles[i],zz[j]),(angles[i]+TAU/N,zz[j]),(angles[i]+TAU/N,zz[j+1]),(angles[i],zz[j+1])];clipped=[];crossings=[]
            for k,q in enumerate(poly):
                nxt=poly[(k+1)%4];fq=heart(*q);fn=heart(*nxt)
                if fq>=0:clipped.append(q)
                if (fq>=0)!=(fn>=0):
                    lo=0.;hi=1.
                    for _ in range(28):
                        t=(lo+hi)/2;point=(q[0]+(nxt[0]-q[0])*t,q[1]+(nxt[1]-q[1])*t)
                        if (heart(*point)>=0)==(fq>=0):lo=t
                        else:hi=t
                    point=(q[0]+(nxt[0]-q[0])*(lo+hi)/2,q[1]+(nxt[1]-q[1])*(lo+hi)/2);clipped.append(point);crossings.append(point)
            op=[vertex(*q,False) for q in clipped];ip=[vertex(*q,True) for q in clipped]
            for k in range(1,len(op)-1):extraout.append((op[0],op[k],op[k+1]));extrain.append((ip[0],ip[k+1],ip[k]))
            if len(crossings)==2:
                q,r=crossings;qo,ro=vertex(*q,False),vertex(*r,False);qi,ri=vertex(*q,True),vertex(*r,True)
                base.quad(cutwalls,qo,qi,ro,ri)
        if extra:verts=np.vstack([verts,np.array(extra)])
    face=lambda a,b,c,d:np.stack([np.stack([a,b,c],-1),np.stack([b,d,c],-1)],-2).reshape(-1,3)
    ext=face(A[keep],B[keep],C[keep],D[keep]);inside=face(A[keep]+stride,C[keep]+stride,B[keep]+stride,D[keep]+stride)
    if extraout:ext=np.vstack([ext,np.array(extraout)]);inside=np.vstack([inside,np.array(extrain)])
    # Recess a seat only where a flush stone is placed; keep the inner band intact.
    if p['stones'] and not p.get('solitaire'):
        mid=verts[ext].mean(axis=1);aa=np.arctan2(mid[:,1],mid[:,0]);visible=np.ones(len(ext),bool)
        for st in p['stones']:
            rr=st['diameter']*.49;visible &= (wrap(aa-st['angle'])*10.35)**2+(mid[:,2]-st['z'])**2>rr*rr
        ext=ext[visible]
    mat=1 if p.get('silver') else 0
    g.mesh('Corpo único / exterior '+p['profile'],verts,ext.tolist(),mat,parent)
    g.mesh('Interior anatômico',verts,inside.tolist(),mat if p.get('allGold') else 1,parent)
    # Close both axial edges and the walls of the single heart opening.
    walls=list(cutwalls)
    for j in [0,K]:
        for i in range(N):
            v=i*(K+1)+j;n=((i+1)%N)*(K+1)+j
            if np.linalg.norm(verts[v]-verts[v+stride])>1e-6:
                base.quad(walls,n,v,n+stride,v+stride) if j==0 else base.quad(walls,v,n,v+stride,n+stride)
    g.mesh('Bordas e paredes do recorte',verts,walls,mat,parent)

def gem(g,parent,p,st,index):
    a=st['angle'];z=st['z'];size=st['diameter']/2;n=np.array([math.cos(a),math.sin(a),0.]);u=np.array([-math.sin(a),math.cos(a),0.]);v=np.array([0,0,1.])
    center=float(profile(p,np.array(z))-recess(p,np.array(a),np.array(z)))
    solitaire=p.get('solitaire') and index==0
    rad=center+size*.78 if solitaire else center+.12-size*.50
    if st.get('halo'):rad=12.65-size*.50
    offset=st.get('offsetTangential',0);origin=n*rad+v*z+u*offset
    vertices=[];faces=[]
    pear=st.get('shape')=='pear';length=st.get('length',st['diameter'])
    def planar(t):
        if not pear:return np.array([math.cos(t),math.sin(t)])
        # Pear cut: rounded belly and a single point, length oriented along the finger circumference.
        x=math.cos(t);y=math.sin(t)*(1-.43*x);return np.array([x*length/st['diameter'],y*.9])
    def level(count,r,h,phase=0):
        start=len(vertices)
        for k in range(count):
            xy=planar(k*TAU/count+phase);vertices.append(origin+size*(xy[0]*r*u+xy[1]*r*v+h*n))
        return start
    table=level(8,.54,.50);star=level(8,.78,.34,math.pi/8);belt=level(16,1,.12);lower=level(16,1,.085);pav=level(8,.48,-.40,math.pi/8);tip=len(vertices);vertices.append(origin-n*size*.68)
    for k in range(1,7):faces.append((0,k,k+1))
    for k in range(8):
        nex=(k+1)%8;aa=2*k;bb=(aa+1)%16;cc=(aa+2)%16
        faces.extend([(table+k,star+k,table+nex),(table+k,belt+aa,star+k),(star+k,belt+cc,table+nex),(star+k,belt+aa,belt+bb),(star+k,belt+bb,belt+cc)])
    for k in range(16):
        nex=(k+1)%16;faces.extend([(belt+k,lower+k,belt+nex),(belt+nex,lower+k,lower+nex)])
    for k in range(8):
        aa=2*k;bb=(aa+1)%16;cc=(aa+2)%16;nex=(k+1)%8
        faces.extend([(lower+aa,pav+k,lower+bb),(lower+bb,pav+k,lower+cc),(lower+cc,pav+k,pav+nex),(pav+k,tip,pav+nex)])
    g.mesh(('Pedra principal / gota' if pear else 'Pedra facetada')+f' {index+1:02}',vertices,faces,2,parent,flat=True)
    mat=1 if p.get('silver') else 0
    if solitaire:
        count=5 if pear else (6 if p['code']=='SLF4MM' else 4)
        for k in range(count):
            t=k*TAU/count;xy=planar(t);basept=origin+size*(xy[0]*u+xy[1]*v)
            pts=[basept+n*h for h in np.linspace(-size*.45,size*.27,8)]
            pts.append(basept+n*size*.30-(xy[0]*u+xy[1]*v)*.12)
            base.tube(g,parent,f'Garra {k+1}',pts,.13,mat,segments=12,closed=False)
        basket=[origin+size*.8*(planar(t)[0]*u+planar(t)[1]*v)-n*.2 for t in np.arange(80)*TAU/80]
        base.tube(g,parent,'Cesta de sustentação',basket,.12,mat,segments=12)
        if pear:
            halo=[n*12.28+u*(4.05*math.cos(t))+v*(2.43*math.sin(t)*(1-.43*math.cos(t))) for t in np.arange(192)*TAU/192]
            base.tube(g,parent,'Base contínua do halo em gota',halo,.24,mat,segments=16)
            for t in [0,math.pi/2,math.pi,3*math.pi/2]:
                point=n*12.28+u*(4.05*math.cos(t))+v*(2.43*math.sin(t)*(1-.43*math.cos(t)))
                base.tube(g,parent,'Suporte do halo',[origin-n*.2,point],.13,mat,segments=12,closed=False)
    else:
        edge=[n*(rad+size*.10)+v*z+u*offset+size*1.065*(math.cos(t)*u+math.sin(t)*v) for t in np.arange(64)*TAU/64]
        base.tube(g,parent,f'Cravação {index+1:02}',edge,min(.045,size*.11),mat,segments=10)

def run():
    allspec=specs();report=[]
    selected=set(sys.argv[1:])
    for c,p in allspec.items():
        if selected and c not in selected:continue
        if c in ['03LM','03LM-1']:
            filename='03LM.glb' if c=='03LM' else '03LM-1-unica.glb';shutil.copyfile(HERE.parent/filename,DEST/(c+'.glb'))
        else:
            g=base.GLB(c,p);g.doc['extensionsUsed']=['KHR_materials_transmission','KHR_materials_ior','KHR_materials_volume'];parent=g.group(c+' — uma única aliança',[0,0,0],[0,0,0,1]);body(g,parent,p)
            for i,st in enumerate(p['stones']):gem(g,parent,p,st,i)
            g.doc['extras']={'quantidadeAliancas':1,'quantidadePedras':len(p['stones']),'larguraMm':p['width'],'chanfro':p['profile']=='chamfer','referenciaFoto':c+'-760.webp','descricaoTabela':p['description'],'observacoes':p['notes'],'diametroInternoEstimadoMm':18,'espessuraEstimadaMm':1.35}
            g.save(DEST/(c+'.glb'))
        report.append({'codigo':c,'largura':p['width'],'pedras':len(p['stones']),'perfil':p['profile'],'descricao':p['description'],'observacoes':p['notes'],'aliancas':1})
        print(c, '1 aliança,',len(p['stones']),'pedras,',p['profile'],flush=True)
    if not selected:
        (DEST/'catalogo.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');(HERE/'especificacoes.json').write_text(json.dumps(allspec,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':run()
