"""One entry per reference. Widths without an exact table match are marked inferred."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[5]
ITEMS=json.loads((ROOT/'src/data/modelos.json').read_text(encoding='utf-8'))['modelos']

def specs():
    rows={}
    for item in ITEMS:
        c=item['code'];w=item.get('larguraMm')
        rows[c]=dict(code=c,width=w or 6.,widthConfirmed=bool(w),profile='flat',grooves=[],stones=[],heart=False,silver=False,description=item.get('descricaoTabela'),sourceTable=item.get('codigoTabela'),notes=[])
    def set_(codes,**kwargs):
        for c in codes.split():rows[c].update(kwargs)
    def line(c,z,width=.075,depth=.13):rows[c]['grooves'].append(dict(z=z,width=width,depth=depth))
    def stone(c,angle=.53,z=0,diameter=1.28):rows[c]['stones'].append(dict(angle=angle,z=z,diameter=diameter))
    def row(c,count,z=0,diameter=1.15,span=3.0):
        for i in range(count):stone(c,.53+(i/(max(count-1,1))-.5)*span,z,diameter)
    for c,p in rows.items():
        if c[:2] in ['03','04','05','06','08','10'] and c not in ['08RLM-ALT0-RELEVO','08-1RILM','096LM','096ZLM']:
            p['profile']='chamfer' if 'RDLM' in c else ('flat' if 'RLM' in c or 'RCLM' in c else 'round')
            if '-1' in c or c=='03LM-1':stone(c)
    set_('06RCLM 08RCLM',heart=True)
    set_('08RLM-ALT0-RELEVO',width=8.,motif='AMOR')
    set_('08-1RILM',width=8.,motif='infinity')
    # Real infinity motif made from small stones, rather than a single stone/heart.
    import math
    for k in range(32):
        t=2*math.pi*k/32;x=2.15*math.sin(t);z=2.35*math.sin(2*t)
        stone('08-1RILM',.53+x/10.35,z,.56)
    set_('096LM',width=4.);line('096LM',0,.15,.16)
    row('096ZLM',44,0,1.12,2*math.pi*(43/44));rows['096ZLM']['notes'].append('Quantidade de zircônias estimada pela distribuição da foto; não consta na tabela.')
    for c in ['189LM','189-1LM']:
        set_(c,width=6.,profile='round');line(c,0,.26,.22)
    stone('189-1LM')
    for c in ['289LM','289-1LM','289ZLM']:
        set_(c,width=8.,profile='round');line(c,0,.10,.14)
    stone('289-1LM');row('289ZLM',40,0,1.27,2*math.pi*39/40)
    for c in ['302ALM','302-15WLM']:
        set_(c,width=6.);line(c,-1.1,.18,.20);line(c,1.1,.18,.20)
    row('302-15WLM',15,0,1.45,3.0)
    for c in ['303LM','303-1LM','303-10LM','303-15WLM','303-15WLMC8','303LMC8','303ZLM']:
        p=rows[c];p['width']=8. if 'C8' in c else 6.;line(c,-p['width']*.28,.085,.14)
    stone('303-1LM',z=.35);row('303-10LM',10,z=-1.68,diameter=1.23,span=2*math.pi*.9)
    row('303-15WLM',15,z=-1.68,diameter=1.16,span=2.8);row('303-15WLMC8',15,z=-2.24,diameter=1.16,span=2.8)
    row('303ZLM',44,z=-1.68,diameter=1.15,span=2*math.pi*43/44)
    for c in ['304LMC8','30415WDLMC8']:
        set_(c,width=8.);line(c,-2.25);line(c,-1.05)
    rows['30415WDLMC8']['profile']='chamfer';row('30415WDLMC8',15,z=-1.65,diameter=.92,span=2.8)
    # Photo 304LMC8 is plain, with two lateral grooves; no invented stones.
    for c in ['305LM','305-1LM']:
        set_(c,width=6.,profile='round');line(c,-2.05,.065,.13);line(c,2.05,.065,.13)
    stone('305-1LM')
    set_('310-1LM',width=6.)
    for z in [-2.05,-1.45,1.45,2.05]:line('310-1LM',z,.065,.12)
    stone('310-1LM')
    for z in [-2.0,-1.25,-.50]:line('330LM',z,.065,.12)
    for c in ['331LM','331-15WLM']:
        set_(c,width=6.,grooveTilt=.33)
        for z in [-1.2,0,1.2]:line(c,z,.075,.14)
    row('331-15WLM',15,0,.97,2.8)
    for c in ['332LM','332-15WLM']:
        set_(c,width=6.,profile='round');line(c,-1.1);line(c,1.1)
    row('332-15WLM',15,0,1.13,2.8)
    for c in ['380LM','380CLM','381LM','381CLM','480LM','480CLM','481LM','481CLM']:
        p=rows[c];p['heart']='CLM' in c
        line(c,-p['width']*.30,.06,.13);line(c,p['width']*.30,.06,.13)
        if c.startswith(('381','481')):
            if p['heart']:stone(c,.53-.27);stone(c,.53+.27)
            else:stone(c)
    for c in ['389LM','389ZLM']:
        set_(c,width=6.);line(c,0,.24,.18)
    row('389ZLM',42,0,1.18,2*math.pi*41/42)
    for c in ['390LM','390ZLM','390-10WCLM']:
        set_(c,width=6.);line(c,-1.6,.22,.20);line(c,1.6,.22,.20)
    row('390ZLM',42,0,1.18,2*math.pi*41/42)
    rows['390-10WCLM']['heart']=True
    for k in range(10):stone('390-10WCLM',.53+.38+k*(2*math.pi-.76)/10,0,1.1)
    for z in [-1.0,1.0]:line('402LM',z,.10,.16)
    for c in ['403LM','403-3LM']:
        set_(c,width=8.)
        for z in [-2,0,2]:line(c,z,.085,.15)
    for z in [-2,0,2]:stone('403-3LM',.53,z,1.15)
    for c in ['406RLM','406ZLM']:
        for z in [-1.6,1.6]:line(c,z,.11,.15)
    for z in [-1.6,1.6]:row('406ZLM',40,z,1.15,2*math.pi*39/40)
    set_('421LM 421-1LM',motif='G')
    stone('421-1LM',.38,-1.15);stone('421-1LM',.68,1.15)
    set_('APW2MM',width=2.,profile='round',allGold=True);row('APW2MM',11,0,1.45,1.95)
    for c in ['SG7MM','SL4MM','SLF4MM','SLW4MM']:
        set_(c,width=2.,profile='round',allGold=True,solitaire=True)
    rows['SL4MM']['silver']=True
    for c in ['SL4MM','SLF4MM','SLW4MM']:stone(c,.53,0,4.)
    stone('SG7MM',.53,0,4.7);rows['SG7MM']['stones'][0]['shape']='pear';rows['SG7MM']['stones'][0]['length']=7.
    # 22 side stones: twelve around the pear halo plus ten on the shoulders.
    for i in range(12):
        t=2*math.pi*i/12;rows['SG7MM']['stones'].append(dict(angle=.53,offsetTangential=4.05*math.cos(t),z=2.43*math.sin(t)*(1-.43*math.cos(t)),diameter=.8,halo=True))
    for c in ['SG7MM','SLW4MM']:
        for side in [-1,1]:
            for k in range(5):stone(c,.53+side*(.45+k*.105),0,.92)
    for p in rows.values():
        if not p['widthConfirmed']:p['notes'].append('Largura inferida da família e da foto; código da imagem sem correspondência exata de largura na tabela.')
        if 'ZLM' in p['code'] and not p['notes']:p['notes'].append('Quantidade de zircônias estimada pela distribuição da foto.')
    return rows
