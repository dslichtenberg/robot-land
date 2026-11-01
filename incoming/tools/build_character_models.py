"""Build original static, vertex-normal GLB character blockouts. No external assets."""
import json, math, struct, zipfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / 'assets' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
C = dict(green='#66ce35', orange='#ff9a25', blue='#55bff1', purple='#a95cde',
         yellow='#ffe14c', red='#e94441', white='#fff5dd', dark='#252b3b',
         brown='#ac784b', teal='#36c7bc', pink='#f472b8', metal='#8ca8b9')
def rgb(c):
    c=C.get(c,c).lstrip('#'); return [int(c[i:i+2],16)/255 for i in (0,2,4)]

class Model:
    def __init__(self,name): self.name=name; self.parts=[]
    def mesh(self,name,v,f,color): self.parts.append((name,np.array(v,float),np.array(f,np.uint32),rgb(color)))
    def ball(self,name,p,s,color,rings=10,segs=16):
        v=[]; f=[]
        for i in range(rings+1):
            a=math.pi*i/rings
            for j in range(segs):
                b=2*math.pi*j/segs
                v.append(np.array(p)+np.array(s)*[math.sin(a)*math.cos(b),math.cos(a),math.sin(a)*math.sin(b)])
        for i in range(rings):
            for j in range(segs):
                a=i*segs+j;b=i*segs+(j+1)%segs;c=a+segs;d=b+segs
                if i>0:f.append([a,b,c])
                if i<rings-1:f.append([b,d,c])
        self.mesh(name,v,f,color)
    def tube(self,name,pts,r,color,segs=10):
        pts=np.array(pts,float); v=[];f=[]
        rs=[r]*len(pts) if isinstance(r,(int,float)) else r
        previous_u=None
        for i,p in enumerate(pts):
            t=pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)];t/=np.linalg.norm(t)
            q=np.array([0.,1.,0.]) if abs(t[1])<.9 else np.array([1.,0.,0.])
            u=np.cross(t,q) if previous_u is None else previous_u-t*np.dot(previous_u,t)
            if np.linalg.norm(u)<1e-8:u=np.cross(t,q)
            u/=np.linalg.norm(u);w=np.cross(t,u);previous_u=u
            for j in range(segs):
                a=j*2*math.pi/segs;v.append(p+rs[i]*(u*math.cos(a)+w*math.sin(a)))
        for i in range(len(pts)-1):
            for j in range(segs):
                a=i*segs+j;b=i*segs+(j+1)%segs;c=a+segs;d=b+segs
                f.extend([[a,b,c],[b,d,c]])
        v.extend([pts[0],pts[-1]]);start=len(v)-2;end=start+1
        for j in range(segs):
            f.extend([[start,(j+1)%segs,j],[end,(len(pts)-1)*segs+j,(len(pts)-1)*segs+(j+1)%segs]])
        self.mesh(name,v,f,color)
    def box(self,name,p,s,color):
        v=np.array([[x,y,z] for x in [-1,1] for y in [-1,1] for z in [-1,1]])*np.array(s)/2+np.array(p)
        f=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]]
        self.mesh(name,v,f,color)
    def eye(self,x,y,z,size=.14,lid=False):
        self.ball('eye-white',(x,y,z),(size,size*1.12,size*.6),'white')
        self.ball('pupil',(x,y-.01,z+size*.53),(size*.48,size*.64,size*.24),'dark')
        self.ball('eye-glint',(x-size*.13,y+size*.24,z+size*.75),(size*.18,)*3,'#ffffff')
        if lid:self.ball('sleepy-lid',(x,y+size*.65,z+.01),(size*1.05,size*.55,size*.65),'brown')
    def smile(self,y,z,w=.25):
        self.tube('smile',[(x,y-.1*(1-(x/w)**2),z) for x in np.linspace(-w,w,12)],.018,'dark',6)
    def save(self):
        blob=bytearray();views=[];acc=[];meshes=[];nodes=[];mats=[]
        def add(a,typ,ct,target):
            a=np.ascontiguousarray(a);off=len(blob);blob.extend(a.tobytes());blob.extend(b'\0'*((-len(blob))%4))
            views.append(dict(buffer=0,byteOffset=off,byteLength=a.nbytes,target=target))
            ob=dict(bufferView=len(views)-1,componentType=ct,count=len(a),type=typ)
            if typ=='VEC3':ob.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
            acc.append(ob);return len(acc)-1
        low=min(v[:,1].min() for _,v,_,_ in self.parts)
        for name,v,f,col in self.parts:
            v=v.copy();v[:,1]-=low
            # Expand triangles for robust flat normals and consistent winding.
            tri=v[f];n=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
            pos=add(tri.reshape(-1,3).astype('<f4'),'VEC3',5126,34962)
            norm=add(np.repeat(n,3,axis=0).astype('<f4'),'VEC3',5126,34962)
            mats.append(dict(name=name,pbrMetallicRoughness=dict(baseColorFactor=col+[1],metallicFactor=0,roughnessFactor=.8),doubleSided=True))
            meshes.append(dict(name=name,primitives=[dict(attributes=dict(POSITION=pos,NORMAL=norm),material=len(mats)-1)]))
            nodes.append(dict(name=name,mesh=len(meshes)-1))
        doc=dict(asset=dict(version='2.0',generator='Robot Land procedural character builder'),scene=0,scenes=[dict(nodes=list(range(len(nodes))))],nodes=nodes,meshes=meshes,materials=mats,buffers=[dict(byteLength=len(blob))],bufferViews=views,accessors=acc)
        js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
        data=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
        (OUT/f'{self.name}.glb').write_bytes(data)
        return dict(name=self.name,file=f'{self.name}.glb',triangles=sum(len(f) for _,_,f,_ in self.parts),parts=len(self.parts),height=round(max(v[:,1].max() for _,v,_,_ in self.parts)-low,3))

def scarf(m,color):
    m.ball('neck-scarf',(0,1.45,.04),(.35,.11,.26),color)
    m.tube('scarf-tail',[(.19,1.42,.22),(.38,1.24,.24),(.57,1.3,.2)],[.09,.075,.025],color)

def gecko(name,color,chubby=False):
    m=Model(name);m.ball('body',(0,.98,0),(.43 if chubby else .33,.58,.27),color)
    m.ball('belly',(0,1,.23),(.27,.43,.065),'white')
    m.ball('head',(0,1.87,.03),(.49,.39,.32),color)
    m.ball('snout',(0,1.7,.27),(.43,.22,.24),color)
    for s in [-1,1]:
        m.ball('eye-bump',(s*.28,2.06,.2),(.22,.25,.17),color);m.eye(s*.27,2.05,.34,.17)
        m.tube('leg',[(s*.23,.68,0),(s*.31,.3,.05),(s*.32,.12,.18)],.12,color)
        m.ball('foot',(s*.33,.12,.23),(.2,.09,.19),color)
        m.tube('arm',[(s*.28,1.31,0),(s*.51,1.08,.12),(s*.43,.94,.28)],.095,color)
        m.ball('hand',(s*.43,.95,.29),(.14,.14,.1),color)
        for j in range(3):m.ball('sticky-toe',(s*.33+(j-1)*.12,.105,.39),(.065,.05,.07),color)
    tail=[(0,.65,-.2),(.36,.42,-.38),(.72,.42,-.4),(.95,.65,-.37),(1,1,-.34),(.82,1.17,-.3),(.65,1.05,-.26),(.72,.91,-.23)]
    m.tube('curled-tail',tail,[.2,.18,.15,.13,.11,.09,.065,.025],color)
    m.smile(1.68,.49,.27)
    return m

models=[]
m=gecko('tyler','green');scarf(m,'red')
for x,y,z in [(.45,.48,-.23),(.76,.57,-.25),(.89,.86,-.22),(.8,1.1,-.21),(-.36,1.9,.27),(.38,1.82,.33)]:m.ball('orange-spot',(x,y,z),(.07,.075,.025),'orange')
models.append(m)
m=gecko('skyler','blue')
for x in [-.27,.27]:
    m.tube('round-glasses',[(x+.205*math.cos(a),2.05+.22*math.sin(a),.465) for a in np.linspace(0,2*math.pi,25)],.022,'orange',6)
m.tube('glasses-bridge',[(-.065,2.05,.465),(.065,2.05,.465)],.022,'orange')
m.tube('rolled-map',[(.32,.91,.4),(.57,1.43,.37)],.085,'white');models.append(m)
m=gecko('nick','purple',True);m.ball('cap-crown',(0,2.24,-.01),(.48,.22,.34),'green');m.box('backward-cap-brim',(0,2.23,-.4),(.55,.07,.37),'green')
m.ball('laugh-mouth',(0,1.65,.487),(.24,.14,.025),'dark');m.ball('tongue',(.07,1.58,.52),(.1,.065,.035),'pink')
for y in [.5,.7,.9]:m.tube('yellow-tail-stripe',[(.8,y,-.25),(.93,y+.08,-.23)],.05,'yellow')
models.append(m)
m=Model('pip');m.ball('frog-body',(0,.5,0),(.28,.3,.2),'green');m.ball('frog-head',(0,.86,.05),(.38,.25,.23),'green')
for s in [-1,1]:
    m.ball('orange-eye-rim',(s*.23,1.03,.16),(.17,.2,.14),'orange');m.eye(s*.23,1.04,.25,.13)
    m.tube('folded-leg',[(s*.2,.46,0),(s*.4,.3,0),(s*.25,.16,.15)],.09,'green')
    m.tube('arm',[(s*.25,.6,0),(s*.48,.68,.1)],.055,'green')
    for j in range(3):
        m.ball('orange-finger',(s*(.46+j*.045),.63+j*.06,.13),(.055,.055,.045),'orange')
        m.ball('orange-toe',(s*.25+(j-1)*.08,.1,.22),(.05,.05,.07),'orange')
m.smile(.81,.28,.23);m.ball('blue-scarf',(0,.65,0),(.3,.07,.2),'blue');m.tube('scarf-tail',[(.2,.65,0),(.45,.7,-.1),(.59,.78,-.1)],[.07,.06,.02],'blue');models.append(m)
m=Model('mo');m.ball('shell',(0,.67,-.05),(.59,.6,.45),'#547c32');m.ball('shell-rim',(0,.37,0),(.63,.11,.46),'yellow')
for s in [-1,1]:
    for z in [-.23,.25]:m.ball('stout-leg',(s*.4,.22,z),(.18,.22,.18),'brown')
m.ball('neck',(0,.65,.36),(.24,.27,.2),'brown');m.ball('head',(0,.87,.53),(.35,.29,.25),'brown')
for s in [-1,1]:m.eye(s*.18,.94,.73,.12,True)
m.smile(.77,.77,.16);m.ball('straw-brim',(0,1.15,.47),(.46,.045,.32),'#e8c47c');m.ball('straw-hat',(0,1.24,.46),(.27,.12,.22),'#e8c47c')
for x,y,z in [(-.3,.99,.13),(.22,1.13,-.03),(-.1,1.21,-.15)]:
    for a in np.linspace(0,2*math.pi,6)[:-1]:m.ball('daisy-petal',(x+.075*math.cos(a),y+.025,z+.075*math.sin(a)),(.052,.025,.052),'white')
    m.ball('daisy-center',(x,y+.025,z),(.036,.025,.036),'yellow')
models.append(m)
m=gecko('zazz','teal');
for i,(name,v,f,c) in enumerate(m.parts):
    if name in ['curled-tail','body','head','snout','eye-bump','arm','leg']:m.parts[i]=(name,v,f,rgb(['pink','orange','yellow','teal','purple'][i%5]))
m.tube('chameleon-crest',[(-.25,2.12,-.08),(0,2.56,-.03),(.25,2.12,-.08)],[.07,.035,.07],'pink');models.append(m)
m=Model('dragon');m.ball('plump-body',(0,.88,0),(.55,.65,.37),'red');m.ball('belly',(0,.86,.33),(.38,.45,.07),'yellow');m.ball('head',(0,1.69,.08),(.47,.37,.31),'red');m.ball('muzzle',(0,1.54,.34),(.4,.2,.23),'red')
for s in [-1,1]:
    m.eye(s*.23,1.82,.35,.14);m.tube('horn',[(s*.3,1.98,0),(s*.36,2.26,-.04)],[.12,0.003],'yellow')
    m.ball('foot',(s*.38,.22,.2),(.24,.15,.25),'red');m.tube('arm',[(s*.4,1.12,.05),(s*.58,.83,.3)],.13,'red')
    m.mesh('stubby-wing',[(s*.38,1.42,-.19),(s*.95,1.78,-.3),(s*.83,1.2,-.23),(s*.61,1.35,-.18)],[[0,1,2],[0,2,3]],'orange')
m.tube('tail',[(0,.5,-.25),(.65,.25,-.4),(.95,.5,-.2),(1.03,.8,-.1)],[.22,.16,.1,.04],'red')
for x in [.97,1.1]:m.ball('heart-tail-lobe',(x,.85,-.1),(.09,.1,.06),'red')
m.tube('snaggle-tooth',[(.16,1.44,.52),(.16,1.31,.53)],[.055,.002],'white');m.smile(1.46,.54,.24);models.append(m)
m=Model('snowgun')
for y,s in [(.5,.5),(1.1,.39),(1.62,.3)]:m.ball('snowball',(0,y,0),(s,s,s),'#e4f5fc')
for x in [-.12,.12]:m.ball('coal-eye',(x,1.68,.27),(.045,)*3,'dark')
m.tube('carrot-nose',[(0,1.58,.27),(0,1.56,.62)],[.08,.003],'orange');m.smile(1.46,.28,.13)
m.box('bucket-hat',(0,1.98,0),(.57,.4,.48),'metal');m.box('bucket-brim',(0,1.8,0),(.68,.045,.59),'metal');scarf(m,'red')
m.tube('stick-arm',[(-.3,1.12,0),(-.65,1.33,0),(-.79,1.53,0)],.045,'brown')
m.tube('cannon-barrel',[(.36,1.18,.1),(.68,1.22,.7)],.23,'blue');m.ball('cannon-dark-bore',(.68,1.22,.72),(.19,.19,.05),'dark');m.ball('loaded-snowball',(.68,1.22,.75),(.13,.13,.07),'white');models.append(m)
m=Model('yo-yo')
for z in [-.17,.17]:m.tube('yellow-disc',[(0,1,z-.095),(0,1,z+.095)],.64,'yellow',40)
m.tube('axle',[(0,1,-.24),(0,1,.24)],.22,'orange')
for s in [-1,1]:
    m.eye(s*.22,1.17,.285,.13);m.tube('arm',[(s*.6,1,0),(s*.84,.8,.12)],.045,'dark');m.ball('glove',(s*.84,.78,.12),(.105,)*3,'white')
m.smile(.82,.29,.2);m.tube('white-string',[(0,1.6,0),(-.28,1.95,0),(.1,2.15,0),(.6,2.07,0),(.78,2.24,0)],.022,'white');models.append(m)
m=Model('wizard');m.tube('robe',[(0,.1,0),(0,1.25,0)],[.57,.26],'purple',24)
m.ball('beard',(0,1.16,.28),(.31,.44,.17),'#b9bcc6');m.ball('tiny-mouth',(0,1.39,.43),(.085,.04,.025),'dark')
m.ball('hat-brim',(0,1.62,0),(.68,.06,.46),'purple');m.tube('droopy-pointed-hat',[(0,1.63,0),(0,2.03,0),(.04,2.45,0),(.32,2.56,0),(.45,2.33,.04)],[.43,.31,.16,.09,.002],'purple',20)
for x,y,z in [(-.18,1.94,.26),(.12,2.17,.2),(.32,2.4,.1)]:m.ball('silver-star',(x,y,z),(.055,.07,.022),'#d9def0')
m.tube('wand',[(.65,.25,.1),(.7,1.22,.1),(.6,1.6,.1),(.72,1.92,.1)],.035,'brown');m.ball('star-glow',(.72,2,.1),(.13,.13,.08),'yellow');models.append(m)

def robot(name,wide=False,tread=False):
    m=Model(name);w=.55 if wide else .32;bodyy=.85 if tread else 1
    m.box('torso',(0,bodyy,0),(w*2,.65,.43),'metal');m.box('head',(0,bodyy+.65,0),(.65,.48,.48),'metal')
    m.ball('eye-socket',(0,bodyy+.65,.25),(.19,.19,.055),'dark');m.ball('green-eye',(0,bodyy+.65,.3),(.135,.135,.04),'green');m.ball('eye-glint',(-.035,bodyy+.69,.335),(.035,)*3,'white')
    m.tube('antenna',[(0,bodyy+.9,0),(0,bodyy+1.14,0)],.025,'dark');m.ball('red-bulb',(0,bodyy+1.17,0),(.08,)*3,'red')
    if tread:
        for s in [-1,1]:
            m.ball('tank-tread',(s*.37,.27,0),(.22,.25,.48),'dark')
            for z in [-.25,0,.25]:m.ball('tread-wheel',(s*.56,.27,z),(.04,.14,.14),'metal')
    else:
        for s in [-1,1]:m.tube('leg',[(s*w*.6,.7,0),(s*w*.6,.2,0)],.065,'dark');m.box('foot',(s*w*.6,.12,.08),(.28,.16,.38),'metal')
    for s in [-1,1]:
        m.tube('jointed-arm',[(s*w,bodyy+.2,0),(s*(w+.23),bodyy,.04),(s*(w+.3),bodyy+.08,.2)],.055,'dark')
        m.tube('clamp',[(s*(w+.36),bodyy+.14,.25),(s*(w+.4),bodyy+.02,.25),(s*(w+.25),bodyy-.02,.25)],.035,'metal')
    x=w+.3;m.tube('telephone-handset',[(x,bodyy-.02,.33),(x+.09,bodyy+.02,.33),(x+.1,bodyy+.37,.33),(x,bodyy+.42,.33)],.075,'red')
    m.tube('coiled-phone-cord',[(x+.05+.035*math.cos(t),bodyy-.04-t*.018,.3+.035*math.sin(t)) for t in np.linspace(0,8*math.pi,100)],.012,'dark',5)
    return m
models.extend([robot('tall-robot'),robot('wide-robot',True),robot('tread-robot',tread=True)])
m=Model('ghost');m.ball('sheet-body',(0,.85,0),(.45,.65,.25),'#d5efff')
for x in [-.31,0,.31]:m.ball('scalloped-hem',(x,.32,.02),(.21,.18,.24),'#d5efff')
for x in [-.14,.14]:m.ball('black-dot-eye',(x,1.1,.23),(.055,.085,.03),'dark')
m.smile(.91,.255,.11);m.tube('waving-arm',[(.35,.85,0),(.62,1.1,.02),(.65,1.4,.04)],[.14,.1,.07],'#d5efff');m.tube('other-arm',[(-.35,.8,0),(-.58,.65,.02)],[.13,.07],'#d5efff');models.append(m)

def preview(m):
    # Orthographic three-quarter render of the actual exported mesh geometry.
    yaw=.28;pitch=.12
    ry=np.array([[math.cos(yaw),0,math.sin(yaw)],[0,1,0],[-math.sin(yaw),0,math.cos(yaw)]])
    rx=np.array([[1,0,0],[0,math.cos(pitch),-math.sin(pitch)],[0,math.sin(pitch),math.cos(pitch)]])
    R=rx@ry; vv=[v@R.T for _,v,_,_ in m.parts];allv=np.vstack(vv);lo=allv.min(0);hi=allv.max(0)
    scale=min(320/(hi[0]-lo[0]),335/(hi[1]-lo[1]));triangles=[]
    light=np.array([-.4,.6,.7]);light/=np.linalg.norm(light)
    for (_,v,f,c),vr in zip(m.parts,vv):
        for tri in vr[f]:
            normal=np.cross(tri[1]-tri[0],tri[2]-tri[0]);normal/=max(np.linalg.norm(normal),1e-12)
            shade=.62+.38*abs(normal@light);col=tuple(int(max(0,min(255,x*255*shade))) for x in c)
            points=[(180+(p[0]-(lo[0]+hi[0])/2)*scale,355-(p[1]-lo[1])*scale) for p in tri]
            triangles.append((tri[:,2],points,col))
    pixels=np.full((400,360,3),[238,242,247],dtype=np.uint8);depth=np.full((400,360),-np.inf)
    for zz,p,c in triangles:
        p=np.array(p);x0=max(0,int(np.floor(p[:,0].min())));x1=min(359,int(np.ceil(p[:,0].max())))
        y0=max(0,int(np.floor(p[:,1].min())));y1=min(399,int(np.ceil(p[:,1].max())))
        if x1<x0 or y1<y0:continue
        (ax,ay),(bx,by),(cx,cy)=p;den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(den)<1e-9:continue
        yy,xx=np.mgrid[y0:y1+1,x0:x1+1];xx=xx+.5;yy=yy+.5
        a=((by-cy)*(xx-cx)+(cx-bx)*(yy-cy))/den
        b=((cy-ay)*(xx-cx)+(ax-cx)*(yy-cy))/den;cc=1-a-b
        z=a*zz[0]+b*zz[1]+cc*zz[2];region=depth[y0:y1+1,x0:x1+1]
        mask=(a>=0)&(b>=0)&(cc>=0)&(z>region)
        region[mask]=z[mask];pixels[y0:y1+1,x0:x1+1][mask]=c
    im=Image.fromarray(pixels);d=ImageDraw.Draw(im)
    d.text((180,380),m.name.replace('-',' ').title(),anchor='mm',fill='#24304a',font=ImageFont.load_default(size=19))
    im.save(OUT/f'{m.name}-preview.png');return im

manifest=[];sheet=Image.new('RGB',(360*4,400*4),'#eef2f7')
for i,m in enumerate(models):
    manifest.append(m.save());sheet.paste(preview(m),((i%4)*360,(i//4)*400))
sheet.save(OUT/'cast-3d-preview.jpg',quality=92)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
(OUT/'README.md').write_text('''# Robot Land to Gecko Land — static 3D cast

14 original procedural character blockouts based on the illustrated cast sheet.
GLB 2.0, Y up, +Z forward, meters (approximate), each model grounded at Y=0.
Embedded opaque PBR materials; no textures or external dependencies.
Named component meshes. Static only: no skeleton, skin weights, animations, UVs, or LODs.
These are simplified first-pass models, not exact reproductions of the illustration.
Surface details and some expressions are simplified. No car or environment assets included.
Import directly into Blender, Godot, Unity (with glTF support), Unreal (glTF importer), or Three.js.
Meshes may intersect and are not suitable for 3D printing without cleanup.
See manifest.json for triangle counts and model dimensions.
''')
with zipfile.ZipFile(OUT/'robot-land-character-models.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in OUT.iterdir():
        if p.suffix in ['.glb','.md','.json'] or p.name=='cast-3d-preview.jpg':z.write(p,p.name)
print(json.dumps(manifest,indent=2))
