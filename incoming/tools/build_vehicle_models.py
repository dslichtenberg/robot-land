"""Six lightweight GLB vehicles, with local wheel/wing animation pivots."""
import ast
from pathlib import Path
import json, math, struct, zipfile
import numpy as np
from PIL import Image

SOURCE=Path(__file__).with_name('build_character_models.py').read_text()
lib={'__file__':str(Path(__file__).with_name('build_character_models.py'))}
exec(SOURCE.split('\nmodels=[]')[0],lib)
tree=ast.parse(SOURCE)
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='preview'],type_ignores=[]),'<preview>','exec'),lib)
preview_source=ast.get_source_segment(SOURCE,next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='preview'))
exec(preview_source.replace('yaw=.28;pitch=.12','yaw=.48;pitch=.65'),lib)
Base=lib['Model'];OUT=Path(__file__).resolve().parents[1]/'assets'/'vehicles';OUT.mkdir(parents=True,exist_ok=True)
lib['OUT']=OUT

class Vehicle(Base):
    def __init__(self,name,title):super().__init__(name);self.title=title;self.groups=[];self.seat=(0,.5,0)
    def ball(self,name,p,s,color,rings=6,segs=12):super().ball(name,p,s,color,rings,segs)
    def group(self,start,name,pivot):self.groups.append((start,len(self.parts),name,np.array(pivot,float)))
    def wheel(self,x,y,z,r,w):
        start=len(self.parts)
        self.tube('tire',[(x-w/2,y,z),(x+w/2,y,z)],r,'dark',16)
        for s in [-1,1]:
            self.tube('rim',[(x+s*(w/2+.004),y,z),(x+s*(w/2+.022),y,z)],r*.58,'metal',12)
            for a in np.linspace(0,2*math.pi,5)[:-1]:self.ball('hub-bolt',(x+s*(w/2+.025),y+r*.3*math.cos(a),z+r*.3*math.sin(a)),(.017,.025,.025),'yellow',4,6)
        self.group(start,'wheel',(x,y,z))
    def cockpit(self,y,z=0,color='dark'):
        self.box('seat-pad',(0,y-.04,z),(.66,.08,.65),color)
        self.box('seat-back',(0,y+.12,z-.35),(.66,.28,.08),color)
        self.seat=(0,y,z)
    def lights(self,x,y,z):
        for s in [-1,1]:self.ball('headlight-rim',(s*x,y,z),(.14,.14,.06),'dark');self.ball('headlight',(s*x,y,z+.045),(.105,.105,.035),'white')
    def save(self):
        vv=np.vstack([v for _,v,_,_ in self.parts]);lo=vv.min(0);hi=vv.max(0)
        # Center the bounding footprint, ground geometry, normalize horizontal longest side.
        shift=np.array([(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2]);scale=2.8/max(hi[0]-lo[0],hi[2]-lo[2])
        blob=bytearray();views=[];accessors=[];meshes=[];nodes=[];materials=[]
        def add(ar):
            ar=np.asarray(ar,dtype='<f4');offset=len(blob);blob.extend(ar.tobytes());views.append(dict(buffer=0,byteOffset=offset,byteLength=ar.nbytes,target=34962))
            accessors.append(dict(bufferView=len(views)-1,componentType=5126,count=len(ar),type='VEC3',min=ar.min(0).tolist(),max=ar.max(0).tolist()));return len(accessors)-1
        covered=set();groups=[]
        for start,end,name,pivot in self.groups:groups.append((list(range(start,end)),name,pivot));covered.update(range(start,end))
        for i,(name,v,f,c) in enumerate(self.parts):
            if i not in covered:groups.append(([i],name,np.zeros(3)))
        for ids,name,pivot in groups:
            primitives=[]
            for i in ids:
                part,v,f,c=self.parts[i];tri=((v-pivot)*scale)[f]
                normal=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);norm=np.linalg.norm(normal,axis=1)
                keep=norm>1e-10;tri=tri[keep];normal=normal[keep]/norm[keep,None]
                a=add(tri.reshape(-1,3));b=add(np.repeat(normal,3,axis=0))
                material=dict(name=part,pbrMetallicRoughness=dict(baseColorFactor=c+[1],metallicFactor=.25 if 'metal' in part or 'bolt' in part else 0,roughnessFactor=.7),doubleSided=True,alphaMode='OPAQUE')
                if part in ['lantern-glow','headlight']:material['emissiveFactor']=[v*.7 for v in c]
                materials.append(material);primitives.append(dict(attributes=dict(POSITION=a,NORMAL=b),material=len(materials)-1))
            meshes.append(dict(name=name,primitives=primitives));nodes.append(dict(name=name,mesh=len(meshes)-1,translation=((pivot-shift)*scale).tolist()))
        seat=((np.array(self.seat)-shift)*scale).tolist();nodes.append(dict(name='seat',translation=seat))
        doc=dict(asset=dict(version='2.0',generator='Robot Land vehicle builder'),scene=0,scenes=[dict(nodes=list(range(len(nodes))))],nodes=nodes,meshes=meshes,materials=materials,buffers=[dict(byteLength=len(blob))],bufferViews=views,accessors=accessors)
        js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
        data=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
        (OUT/f'{self.name}.glb').write_bytes(data)
        return dict(file=f'{self.name}.glb',name=self.title,triangles=sum(accessors[p['attributes']['POSITION']]['count']//3 for m in meshes for p in m['primitives']),bytes=len(data),bounds=((hi-lo)*scale).round(4).tolist(),seat=seat,wheels=sum(n['name']=='wheel' for n in nodes),wings=sum(n['name']=='wing' for n in nodes))

models=[]
m=Vehicle('kart','Robo-Kart')
m.box('paint',(0,.37,0),(1.16,.18,2.05),'metal');m.box('paint',(0,.54,.78),(1.15,.24,.52),'metal')
for s in [-1,1]:
    m.box('paint',(s*.55,.49,-.2),(.12,.2,1.45),'metal')
    for z in [-.8,.78]:m.wheel(s*.67,.31,z,.31,.27)
    for z in [-.6,-.1,.55]:m.ball('panel-bolt',(s*.62,.51,z),(.025,)*3,'dark',4,6)
m.box('front-bumper',(0,.29,1.1),(1.35,.12,.12),'dark');m.cockpit(.5,-.25);m.lights(.38,.59,1.05)
m.tube('antenna',[(.45,.6,-.87),(.47,1.25,-.94)],.018,'dark',6);m.ball('antenna-tip',(.47,1.27,-.94),(.055,)*3,'red');models.append(m)

m=Vehicle('snowmobile','Snow Zoomer')
m.ball('paint',(0,.55,.38),(.48,.28,.75),'blue');m.box('paint',(0,.43,-.45),(.75,.16,1.1),'blue');m.cockpit(.55,-.35)
for s in [-1,1]:
    x=s*.51;m.tube('ski-strut',[(x,.08,.55),(x,.42,.45)],.045,'metal',8)
    m.box('ski',(x,.045,.69),(.22,.09,.97),'dark');m.tube('ski-curved-tip',[(x,.045,1.16),(x,.09,1.3),(x,.2,1.36)],.085,'dark',8)
m.box('rubber-track',(0,.21,-.6),(.64,.38,1.12),'dark')
for z in np.linspace(-1.13,-.08,9):m.box('track-cleat',(0,.035,z),(.69,.07,.045),'#556170')
for s in [-1,1]:
    for z in [-.91,-.35]:m.tube('track-roller',[(s*.325,.22,z),(s*.35,.22,z)],.15,'metal',12)
# Opaque low wind deflector leaves the driver visible.
m.mesh('windshield',[(-.36,.72,.57),(.36,.72,.57),(.32,.96,.48),(-.32,.96,.48)],[[0,1,2],[0,2,3]],'#b5e3ee')
m.tube('handlebar',[(-.36,.77,.2),(0,.79,.18),(.36,.77,.2)],.03,'dark',8);m.lights(.22,.62,1.04);models.append(m)

m=Vehicle('buggy','Boing Buggy')
m.box('paint',(0,.55,0),(1.03,.18,1.95),'orange');m.box('paint',(0,.69,.72),(1.04,.2,.54),'orange');m.cockpit(.68,-.15)
for s in [-1,1]:
    for z in [-.8,.8]:
        m.wheel(s*.72,.43,z,.43,.38)
        m.tube('suspension-arm',[(s*.43,.55,z),(s*.66,.43,z)],.045,'metal',8)
        m.tube('coil-spring',[(s*.53+.07*math.cos(t),.46+.26*t/(6*math.pi),z+.07*math.sin(t)) for t in np.linspace(0,6*math.pi,37)],.018,'yellow',6)
    m.tube('roll-cage',[(s*.49,.63,-.66),(s*.49,1.36,-.55),(s*.49,1.4,.26),(s*.49,.7,.54)],.035,'dark',8)
for z in [-.55,.26]:m.tube('roll-crossbar',[(-.49,1.38,z),(.49,1.38,z)],.035,'dark',8)
m.lights(.33,.78,1.02);models.append(m)

m=Vehicle('glider','Moth Glider')
m.ball('paint',(0,.23,0),(.4,.23,.94),'#9a8dce');m.cockpit(.43,-.13,'#51466e')
for s in [-1,1]:
    start=len(m.parts);pivot=(s*.3,.27,0)
    # Soft rounded tapered wing with opaque upper/lower thickness.
    m.ball('soft-moth-wing',(s*.96,.3,.05),(.78,.075,.84),'#e6c9ef',6,16)
    m.ball('wing-eye-spot',(s*1.1,.372,.24),(.24,.012,.28),'#9e85ba',4,12)
    m.ball('wing-eye-center',(s*1.1,.386,.24),(.11,.01,.14),'#f5e0a3',4,10)
    for dz in [-.4,0,.4]:m.tube('wing-vein',[(s*.34,.37,0),(s*.85,.38,dz*.6),(s*1.4,.34,dz)],.012,'#b192c4',6)
    m.group(start,'wing',pivot)
m.tube('lantern-mount',[(0,.31,.79),(0,.59,.99)],.025,'dark',8)
m.ball('lantern-glow',(0,.62,1.02),(.16,.2,.16),'#ffe394',8,12)
for y in [.43,.8]:m.tube('lantern-cap',[(0,y,1.02),(0,y+.035,1.02)],.17,'#755f45',12)
for x in [-.11,.11]:m.tube('lantern-frame',[(x,.46,1.12),(x,.79,1.12)],.012,'#755f45',6)
models.append(m)

m=Vehicle('tractor','Lava Tractor')
m.box('paint',(0,.55,0),(.9,.22,2.05),'#cf593a');m.box('paint',(0,.88,.62),(.8,.55,.85),'#cf593a');m.cockpit(.72,-.4)
for s in [-1,1]:
    m.wheel(s*.68,.53,-.7,.53,.35);m.wheel(s*.56,.3,.82,.3,.23)
    m.box('paint',(s*.5,1.12,-.7),(.42,.08,.88),'#cf593a')
m.tube('roll-bar',[(-.43,.72,-.75),(-.43,1.53,-.75),(.43,1.53,-.75),(.43,.72,-.75)],.045,'dark',8)
m.tube('exhaust-pipe',[(.26,1.1,.65),(.26,1.64,.65),(.37,1.68,.65)],.048,'dark',8)
m.box('front-grille',(0,.87,1.055),(.62,.38,.04),'dark')
for x in np.linspace(-.24,.24,7):m.box('grille-slat',(x,.87,1.083),(.023,.32,.02),'metal')
m.lights(.29,1.11,1.08);models.append(m)

m=Vehicle('carpet','Magic Carpet')
m.box('paint',(0,.055,0),(1.5,.1,2.4),'purple');m.box('gold-border',(0,.111,0),(1.48,.012,2.38),'yellow');m.box('rug-field',(0,.121,0),(1.29,.012,2.19),'#65428c')
# Raised geometric weave patterns, using only opaque material geometry.
def diamond(x,z,w,l,color):
    y=.132+.001*sum(p[0]=='woven-pattern' for p in m.parts)
    m.mesh('woven-pattern',[(x,y,z+l),(x+w,y,z),(x,y,z-l),(x-w,y,z)],[[0,1,2],[0,2,3]],color)
diamond(0,0,.43,.7,'pink');diamond(0,0,.31,.51,'yellow');diamond(0,0,.23,.38,'teal');diamond(0,0,.09,.16,'yellow')
for x in [-.55,.55]:
    for z in [-.8,-.4,0,.4,.8]:diamond(x,z,.055,.09,'yellow')
for x in [-.67,.67]:
    for z in [-1.12,1.12]:
        s=1 if z>0 else -1;m.tube('corner-tassel',[(x,.06,z),(x,.04,z+s*.19)],.03,'yellow',8)
        for dx in [-.04,0,.04]:m.tube('tassel-thread',[(x,.04,z+s*.17),(x+dx,.018,z+s*.27)],[.018,.01],'yellow',6)
m.seat=(0,.14,-.1);models.append(m)

manifest=[];sheet=Image.new('RGB',(1080,800),'#eef2f7')
for i,m in enumerate(models):
    info=m.save();assert info['triangles']<5000 and info['bytes']<1_000_000,info
    manifest.append(info);im=lib['preview'](m);sheet.paste(im,((i%3)*360,(i//3)*400))
sheet.save(OUT/'vehicles-preview.jpg',quality=94)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
(OUT/'README.md').write_text('''# Six world vehicles

GLB 2.0; Y up, forward +Z. Grounded at Y=0, footprint centered at X=Z=0.
Longest horizontal dimension is exactly 2.8 for each model; glider is wider for its wings.
Opaque embedded PBR materials, no textures, no skeleton or animation clips.

Each file has an empty `seat` node at the driver position and body mesh(es) named `paint`.
Kart, buggy and tractor each have exactly four mesh nodes named `wheel`.
Each wheel's local origin is at its axle center; rotate its local X axis.
Wheel tire, rims and bolts are primitives in that same mesh, so all spin together.
Glider has two mesh nodes named `wing`, each pivoted at its inner edge.
Rotate the wings on local Z (opposite angles for left and right) to flap them.
Snowmobile track and skis are static. Glider and carpet are modeled grounded; lift them in code.
Windshield is an opaque pale-blue low wind deflector. Cockpits are open and shallow.
Lantern uses an emissive opaque material; add a scene light/bloom in your engine if desired.
Driving speeds, bounce, hover, grip, and turning are implemented by your game code.
See manifest.json for sizes, triangle counts and seat positions.
''')
with zipfile.ZipFile(OUT/'world-vehicles.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in OUT.iterdir():
        if p.suffix in ['.glb','.md','.json'] or p.name=='vehicles-preview.jpg':z.write(p,p.name)
print(json.dumps(manifest,indent=2))
