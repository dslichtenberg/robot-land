"""Inspect embedded GLBs and emit a delivery manifest plus machine-readable findings."""
import json,struct,math,re,hashlib,ast
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'assets/models'
FOLDERS=['characters','villains','vehicles','houses','landmarks','pieces','items','rooms','scenery']
FRIENDS=['idle','walk','hop','drive','drive_left','drive_right','cheer','wave','oops','dizzy','victory']
CLIPS={'dragon':['idle','fly','puff','taunt','hurt','spin_out'],'snowgun':['idle','aim','fire','taunt','hurt','melt'],'yoyo':['idle','roll','bounce','taunt','hurt','unwind'],'wizard':['idle','teleport','cast','taunt','hurt','poof'],'ghost':['float','wave','boo','cheer'],'tall-robot':['idle','wave','talk','beep'],'carpet':['ripple']}
EXPECTED_MATERIALS={
 'zazz':['skin_tint','zazz_main','eyes','mouth'],'ghost':['ghost_main','eyes','mouth'],'tall-robot':['robot_main','robot_glow','eyes'],
 'snowmobile':['paint','snowmobile_main','belt'],'carpet':['paint','carpet_main','carpet_alpha'],
 'teleport_pad':['teleport_pad_main','pad_glow','swirl'],'portal':['portal_main','swirl'],'conveyor':['conveyor_main','belt'],
 'hex_stone':['hex_stone_main','hex_top'],'lever':['lever_main','lever_lamp'],'mirror_stand':['mirror_main','mirror_glass'],'crystal_target':['crystal_target_main','crystal_glow']}
findings=[];manifest=[]
buildtree=ast.parse((ROOT/'tools/build_v2_assets.py').read_text());constants={}
for node in buildtree.body:
    if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id in ['WORLDS','PIECES','ITEMS','ROOMS']:
        constants[node.targets[0].id]=ast.literal_eval(node.value)
inventory={'characters':['tyler','skyler','nick','pip','mo','zazz'],'villains':['dragon','snowgun','yoyo','wizard','ghost','tall-robot'],'vehicles':['kart','snowmobile','buggy','glider','tractor','carpet'],'houses':['house_'+w for w in ['gear','frosty','bouncy','starry','lava','tower']],'landmarks':['landmark_gear','landmark_crystal','landmark_yoyo','landmark_volcano'],'pieces':constants['PIECES'],'items':constants['ITEMS'],'rooms':constants['ROOMS']}
for world,ids in constants['WORLDS'].items():inventory['scenery/'+world]=ids+(['grass_tuft_a','grass_tuft_b'] if world!='everywhere' else [])
def issue(path,rule,message,severity='error'):findings.append(dict(file=str(path.relative_to(BASE)),rule=rule,severity=severity,message=message))
for category,ids in inventory.items():
    for id in ids:
        p=BASE/category/(id+'.glb')
        if not p.exists():issue(p,'delivery','Required file missing')
def read(path):
    data=path.read_bytes();assert struct.unpack_from('<III',data)==(0x46546c67,2,len(data));n,typ=struct.unpack_from('<II',data,12);assert typ==0x4e4f534a
    return json.loads(data[20:20+n]),data[28+n:],len(data)
def array(d,b,idx):
    a=d['accessors'][idx];v=d['bufferViews'][a['bufferView']];dtype={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    offset=v.get('byteOffset',0)+a.get('byteOffset',0);step=v.get('byteStride',np.dtype(dtype).itemsize*width)
    arr=np.ndarray((a['count'],width),dtype=dtype,buffer=b,offset=offset,strides=(step,np.dtype(dtype).itemsize)).copy()
    if a.get('normalized'):arr=arr.astype(float)/np.iinfo(dtype).max
    return arr
def matrix(n):
    if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
    x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w,0],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w,0],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y,0],[0,0,0,1]],float);m[:3,:3]*=np.array(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
for category in FOLDERS:
 for path in sorted((BASE/category).rglob('*.glb')):
    d,bin,size=read(path);id=path.stem;materials=[m.get('name','') for m in d.get('materials',[])];nodes=d['nodes'];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
    worlds={}
    def world(i):
        if i not in worlds:worlds[i]=(world(parents[i]) if i in parents else np.eye(4))@matrix(nodes[i])
        return worlds[i]
    def hidden(i):return nodes[i].get('name') in ['lod1','col'] or (i in parents and hidden(parents[i]))
    triangles=0;lodtri=0;drawcalls=0;points=[];images=[]
    for i,node in enumerate(nodes):
        if i not in parents and (not np.allclose(node.get('scale',[1,1,1]),1) or not np.allclose(node.get('rotation',[0,0,0,1]),[0,0,0,1])):issue(path,'root_transform','Root has unapplied rotation or scale')
        if 'mesh' not in node:continue
        for p in d['meshes'][node['mesh']]['primitives']:
            attrs=p['attributes'];count=d['accessors'][p['indices']]['count']//3 if 'indices' in p else d['accessors'][attrs['POSITION']]['count']//3;triangles+=count
            if not hidden(i):lodtri+=count;drawcalls+=1
            if 'TEXCOORD_0' not in attrs:issue(path,'uv','Mesh lacks TEXCOORD_0')
            if 'NORMAL' not in attrs:issue(path,'normals','Mesh lacks exported normals')
            else:
                norm=array(d,bin,attrs['NORMAL'])
                if not np.isfinite(norm).all() or not np.allclose(np.linalg.norm(norm,axis=1),1,atol=.01):issue(path,'normals','Normals contain zero, invalid or non-unit vectors')
            pos=array(d,bin,attrs['POSITION']);w=world(i);trans=(np.column_stack([pos,np.ones(len(pos))])@w.T)[:,:3]
            if not np.isfinite(pos).all():issue(path,'finite','Non-finite vertex coordinates')
            if not hidden(i):points.extend([trans.min(0),trans.max(0)])
            if 'WEIGHTS_0' in attrs:
                weights=array(d,bin,attrs['WEIGHTS_0']);
                if not np.allclose(weights.sum(1),1,atol=.002):issue(path,'weights','Skin weights are not normalized')
                if 'WEIGHTS_1' in attrs:issue(path,'weights','More than four skin weights')
    points=np.array(points);lo=points.min(0);hi=points.max(0);bounds=(hi-lo).tolist()
    for collection in ['nodes','meshes','materials','animations']:
        names=[n.get('name','') for n in d.get(collection,[])]
        if len(set(names))!=len(names):issue(path,'unique_names',collection+' contains repeated names')
        for name in names:
            if not re.fullmatch(r'[a-z][a-z0-9_]*(?:[A-Z]{1,2}[a-z0-9_]*)*',name):issue(path,'name_format',collection+': '+name)
    cap=4 if category in ['characters','villains'] else 3 if category=='vehicles' or id=='teleport_pad' else 2
    if len(materials)>cap:issue(path,'material_count',f'{len(materials)} materials exceeds {cap}')
    expected=EXPECTED_MATERIALS.get(id)
    if expected is None:
        if category=='characters' or (category=='villains' and id not in ['ghost','tall-robot']):expected=[id+'_main','eyes','mouth']
        elif category=='vehicles':expected=[id+'_main','paint']
        elif category=='houses':expected=[id+'_main',id+'_alpha']
        elif category=='landmarks':expected=[id+'_main']+(['lava'] if id=='landmark_volcano' else [])
        elif category in ['pieces','items']:expected=[id+'_main']
    if expected and set(expected)!=set(materials):issue(path,'material_names',f'Expected {expected}; got {materials}')
    limit={'characters':12000,'villains':8000 if id in ['ghost','tall-robot'] else 16000,'vehicles':9000,'houses':10000,'landmarks':8000,'pieces':2500,'items':2000,'rooms':1500}.get(category,3000)
    if lodtri>limit:issue(path,'triangles',f'{lodtri} active triangles exceeds {limit}')
    minimum={'characters':8000,'villains':4000 if id=='ghost' else 5000 if id=='tall-robot' else 10000,'vehicles':5000,'houses':6000,'landmarks':4000,'items':1000}.get(category,0)
    if lodtri<minimum:issue(path,'triangle_tier',f'{lodtri} triangles below requested {minimum} detail tier','warning')
    filecap={'characters':3e6,'villains':2e6 if id in ['ghost','tall-robot'] else 4e6,'vehicles':3e6,'houses':4e6,'landmarks':3e6,'items':1e6,'pieces':1e6,'rooms':.5e6,'scenery':1e6}[category]
    if size>filecap:issue(path,'file_size',f'{size} bytes exceeds {filecap}')
    bones=len(d.get('skins',[{'joints':[]}])[0]['joints'])
    if category in ['characters','villains'] and not bones:issue(path,'rig','Missing skeleton')
    if bones>45:issue(path,'rig','More than 45 bones')
    names={n['name'] for n in nodes}
    if category=='characters':
        required_bones={'root','hips','spine','chest','neck','head'}
        for side in ['L','R']:required_bones|={n+'_'+side for n in ['shoulder','upper_arm','forearm','hand','fingers','thigh','shin','foot','toes']}
        if id in ['tyler','skyler','nick','zazz']:required_bones|={'tail_'+str(i) for i in range(1,6)}
        if id=='mo':required_bones|={'shell','tail_1','tail_2'}
        if id=='pip':required_bones|={'eye_bump_L','eye_bump_R'}
        if id=='zazz':required_bones|={'crest'}
        if required_bones-names:issue(path,'bone_names','Missing bones '+str(required_bones-names))
        for marker in ['head_top','hand_R_grip']:
            if not any(n.get('name')==marker and 'mesh' not in n for n in nodes):issue(path,'markers','Missing empty '+marker)
    for im in d.get('images',[]):
        if 'uri' in im:issue(path,'embedded','External image')
        if 'bufferView' in im:
            view=d['bufferViews'][im['bufferView']];chunk=bin[view['byteOffset']:view['byteOffset']+view['byteLength']]
            if chunk[:8]==b'\x89PNG\r\n\x1a\n':
                width,height=struct.unpack_from('>II',chunk,16);images.append(dict(name=im.get('name'),width=width,height=height,sha256=hashlib.sha256(chunk).hexdigest()))
                if width&(width-1) or height&(height-1):issue(path,'texture_size','Non power-of-two texture')
    animations=[]
    for a in d.get('animations',[]):
        times=np.concatenate([array(d,bin,s['input']).ravel() for s in a['samplers']]);animations.append(dict(name=a['name'],length=round(float(times.max()-times.min()),5)))
        loops={'idle','walk','drive','cheer','wave','dizzy','fly','roll','bounce','float','talk','ripple'}
        if a['name'] in loops:
            for channel in a['channels']:
                output=array(d,bin,a['samplers'][channel['sampler']]['output']);same=np.allclose(output[0],output[-1],atol=.002)
                if channel['target']['path']=='rotation':same=abs(float(output[0]@output[-1]))>.999
                if not same:issue(path,'loop',a['name']+' does not return to its starting pose');break
    required=FRIENDS if category=='characters' else CLIPS.get(id,[])
    if set(required)-{a['name'] for a in animations}:issue(path,'clips','Missing clips: '+str(set(required)-{a['name'] for a in animations}))
    if category=='vehicles':
        names={n['name'] for n in nodes}
        need={'body','seat','headlight_L','headlight_R'}
        if id in ['kart','buggy','tractor']:need|={'wheel_FL','wheel_FR','wheel_RL','wheel_RR','steer_FL','steer_FR'}
        if id=='buggy':need|={'spring_FL','spring_FR','spring_RL','spring_RR'}
        if id=='glider':need|={'wing_L','wing_R'}
        if id=='snowmobile':need|={'ski_L','ski_R','track','steer'}
        if need-names:issue(path,'parts','Missing parts '+str(need-names))
        for nd in nodes:
            if nd['name'].startswith('wheel_') and 'mesh' in nd:
                if len(d['meshes'][nd['mesh']]['primitives'])!=1:issue(path,'wheel_mesh','Wheel has multiple primitives')
        if id in ['kart','buggy','tractor']:
            for side in ['FL','FR']:
                wheel=next(i for i,n in enumerate(nodes) if n['name']=='wheel_'+side)
                if wheel not in parents or nodes[parents[wheel]]['name']!='steer_'+side:issue(path,'steering','Front wheel is not inside its steering node')
    required_markers={'dragon':['nose'],'snowgun':['muzzle'],'yoyo':['string_attach'],'wizard':['wand_tip']}.get(id,[])
    if category=='houses':required_markers=['door_spot','sign','roof_peek']
    for marker in required_markers:
        if not any(n.get('name')==marker and 'mesh' not in n for n in nodes):issue(path,'markers','Missing empty '+marker)
    if category in ['characters','villains','vehicles','houses','landmarks','scenery'] and id not in ['stepping_stone','hex_stone'] and lo[1]<-.03:issue(path,'ground',f'Lowest vertex at y={lo[1]:.4f}','warning')
    allowed={'KHR_materials_emissive_strength','KHR_texture_transform'}
    if set(d.get('extensionsUsed',[]))-allowed:issue(path,'extensions','Unexpected extensions '+str(set(d['extensionsUsed'])-allowed))
    manifest.append(dict(file=str(path.relative_to(BASE)),triangle_count=triangles,lod0_triangle_count=lodtri,draw_calls=drawcalls,material_names=materials,bounding_box_size_m=[round(v,5) for v in bounds],bounding_box_min_m=lo.round(5).tolist(),bounding_box_max_m=hi.round(5).tolist(),bone_count=bones,clips=animations,textures=images,file_size_bytes=size))
(BASE/'manifest.json').write_text(json.dumps(manifest,indent=2));(BASE/'validation-v2.json').write_text(json.dumps(findings,indent=2))
errors=[x for x in findings if x['severity']=='error'];warnings=[x for x in findings if x['severity']=='warning']
print(json.dumps(dict(models=len(manifest),errors=len(errors),warnings=len(warnings),findings=errors[:35]),indent=2))
