"""Blender 5 asset pipeline: smooth joined skins, painted UV atlases and glTF rigs.
Run with Blender --background --python tools/build_v2_assets.py -- --category characters.
All authoring coordinates are glTF coordinates: +Y up, +Z forward.
"""
import bpy, math, json, sys, argparse, io, struct, zlib, re
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from mathutils.kdtree import KDTree
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'/'models'
REPORT=OUT/'v2-build-report.json'
P=math.pi
def color(s):
    if isinstance(s,tuple):return s
    s=s.lstrip('#');return tuple(int(s[i:i+2],16)/255 for i in (0,2,4))
def reset():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for x in list(bpy.data.materials):bpy.data.materials.remove(x)
    for x in list(bpy.data.images):bpy.data.images.remove(x)
    for x in list(bpy.data.actions):bpy.data.actions.remove(x)
    bpy.context.scene.render.fps=30
def select(obs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]
def apply(o):
    select([o]);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
def mat(name,c,metal=0,rough=.65,glow=0,alpha=1):
    m=bpy.data.materials.get(name)
    if m:return m
    m=bpy.data.materials.new(name);m.diffuse_color=(*color(c),alpha);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color(c),alpha)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if glow:p.inputs['Emission Color'].default_value=(*color(c),1);p.inputs['Emission Strength'].default_value=glow
    p.inputs['Alpha'].default_value=alpha
    if alpha<1:m.surface_render_method='DITHERED'
    return m
def finish(o,name,c):
    o.name=name;o.data.name=name+'_mesh';o.data.materials.append(mat('source_'+str(c),c))
    for p in o.data.polygons:p.use_smooth=True
    apply(o);return o
def sphere(name,p,s,c,seg=32,rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=p)
    o=bpy.context.object;o.scale=s;return finish(o,name,c)
def box(name,p,s,c,bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=s;finish(o,name,c)
    if bevel:
        m=o.modifiers.new('rounded_edges','BEVEL');m.width=bevel;m.segments=3
        select([o]);bpy.ops.object.modifier_apply(modifier=m.name)
        n=o.modifiers.new('weighted_normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=n.name)
    return o
def tube(name,pts,r,c,seg=16):
    pts=[Vector(x) for x in pts];rs=[r]*len(pts) if isinstance(r,(float,int)) else r
    verts=[];faces=[];u=None
    for i,p in enumerate(pts):
        t=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized()
        if u is None:u=t.cross(Vector((0,0,1)) if abs(t.z)<.9 else Vector((0,1,0))).normalized()
        else:u=(u-t*u.dot(t)).normalized()
        v=t.cross(u)
        for j in range(seg):verts.append(p+float(rs[i])*(u*math.cos(2*P*j/seg)+v*math.sin(2*P*j/seg)))
    for i in range(len(pts)-1):
        for j in range(seg):a=i*seg+j;b=i*seg+(j+1)%seg;faces.append((a,b,b+seg,a+seg))
    faces.append(tuple(reversed(range(seg))));faces.append(tuple((len(pts)-1)*seg+j for j in range(seg)))
    return mesh(name,verts,faces,c)
def mesh(name,v,f,c):
    me=bpy.data.meshes.new(name+'_mesh');me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return finish(o,name,c)
def join(obs,name):
    if len(obs)==1:o=obs[0]
    else:select(obs);bpy.ops.object.join();o=bpy.context.object
    o.name=name;o.data.name=name+'_mesh';return o
def origin(o,p):
    delta=o.location-Vector(p)
    for v in o.data.vertices:v.co+=delta
    o.location=p
def empty(name,p=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=p
    if parent:o.parent=parent
    return o
def painted_atlas(o,id,size=1024,detail='',main_name=None,gray=False,metal=0,alpha=1):
    """Pack UV islands and rasterize saturated colors plus smooth painted detail."""
    select([o]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.016,area_weight=.4);bpy.ops.object.mode_set(mode='OBJECT')
    me=o.data;me.calc_loop_triangles();uv=me.uv_layers.active.data
    tex=np.zeros((size,size,4),np.float32);tex[:]=(.65,.65,.65,1);emission=np.zeros_like(tex);emission[:,:,3]=1
    mr=np.ones_like(tex);mr[:,:,1]=.68;mr[:,:,2]=metal
    coord=np.array([v.co[:] for v in me.vertices]);mn=coord.min(0);extent=np.maximum(coord.max(0)-mn,.001)
    palette=[m.diffuse_color[:3] for m in me.materials]
    glow_flags=[m.get('glow',False) for m in me.materials]
    metallic_flags=[m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value for m in me.materials]
    attr=me.color_attributes.get('paint_color')
    for t in me.loop_triangles:
        ids=list(t.vertices);ls=list(t.loops);q=np.array([uv[i].uv[:] for i in ls])*size
        x0=max(0,int(q[:,0].min())-1);x1=min(size-1,int(q[:,0].max())+1);y0=max(0,int(q[:,1].min())-1);y1=min(size-1,int(q[:,1].max())+1)
        a,b,c=q;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-9:continue
        yy,xx=np.mgrid[y0:y1+1,x0:x1+1];xx=xx+.5;yy=yy+.5
        w0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
        w1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w2=1-w0-w1
        mask=(w0>=-.018)&(w1>=-.018)&(w2>=-.018)
        if not mask.any():continue
        points=w0[...,None]*coord[ids[0]]+w1[...,None]*coord[ids[1]]+w2[...,None]*coord[ids[2]]
        if attr:
            cs=[np.array(attr.data[i].color[:3]) for i in ids]
            base=w0[...,None]*cs[0]+w1[...,None]*cs[1]+w2[...,None]*cs[2]
        else:base=np.broadcast_to(palette[t.material_index],(*mask.shape,3)).copy()
        x,y,z=points[...,0],points[...,1],points[...,2]
        grad=.84+.14*(y-mn[1])/extent[1]+.025*np.sin(x*15+z*9)*np.sin(y*11)
        base=base*grad[...,None]
        if gray:base=np.broadcast_to(grad[...,None]*.88,base.shape).copy()
        # Painted markings: all affect pixels only, never draw calls or mesh count.
        if detail=='tyler':
            spots=np.zeros(x.shape,bool)
            for sx,sy,sz,r in [(-.12,.92,-.1,.045),(.15,.83,-.12,.055),(-.11,.73,-.11,.045),(.1,.58,-.13,.04),(-.08,.47,-.14,.05),(.09,.33,-.13,.04),(.19,.23,-.24,.045),(.35,.32,-.28,.04),(.36,.48,-.28,.032),(.21,.53,-.24,.03)]:
                spots|=(x-sx)**2+(y-sy)**2+(z-sz)**2<r*r
            base[spots]=color('#ff8a1f')
        elif detail=='nick':
            stripes=(np.sin(y*35+z*9)> .64)&(z<.07);base[stripes]=color('#ffe14d')
            sock=(x>.1)&(y<.16)&(np.sin(y*110)>.55);base[sock]=color('#f7e3ac')
        elif detail=='mo':
            shell=(z<-.05)&(y>.22);hexes=(abs(np.sin(x*27+z*12))<.09)|(abs(np.sin(y*24-z*16))<.09)
            base[shell]=np.array(color('#8b5a2b'))*grad[shell,None]
            base[shell&hexes]=color('#c78e4e')
        elif detail=='zazz':base*=np.where((abs(np.sin(x*90)*np.cos(y*80+z*50))<.1)[...,None],.88,1)
        elif detail in ['metal','robot','paint']:
            lines=(abs(np.sin(z*13))<.035)|(abs(np.sin(x*18))<.035)
            base[lines]*=.75
            bolts=(np.cos(x*28)>.96)&(np.cos(z*22)>.96);base[bolts]*=.55
        elif detail=='snow':
            flecks=(np.sin(x*153+y*84+z*95)>.99)&(np.cos(z*92-y*111)>.8);base[flecks]=1
        elif detail=='wizard':
            stars=(np.cos(x*33+y*16)>.93)&(np.cos(z*34-y*14)>.91);base[stars]=color('#ffe5aa')
        elif detail=='swirl':
            rad=np.sqrt(x*x+y*y);a=np.arctan2(y,x)+rad*11;base*= (.84+.16*np.cos(a*3))[...,None]
        elif detail=='wing':
            spot=((abs(x)-.8)/.25)**2+((z-.1)/.28)**2
            base[spot<1]=color('#a38acb');base[spot<.35]=color('#f5df98')
        elif detail=='carpet':
            d=abs(x)/.65+abs(z)/1.15
            base[d<.85]=color('#ed91bb');base[d<.62]=color('#efcf68');base[d<.43]=color('#65c7bb')
            border=(abs(x)>.64)|(abs(z)>1.14);base[border]=color('#f4d56c')
        elif detail.startswith('house') or detail=='building':
            window=(abs(np.sin(x*1.6))<.48)&(abs(np.sin((y-.4)*1.5))<.45)&(y>1.3)&(y<6)&(abs(z)>2.5)
            base[window]=color('#ffdc87');emission[y0:y1+1,x0:x1+1,:3][window&mask]=color('#ffbd58')
            trim=(abs(np.sin(y*5))<.08);base[trim]*=.78
            if 'lava' in detail:
                cracks=abs(np.sin(x*4+np.sin(y*2))+np.sin(z*5))<.09;base[cracks]=color('#ff952d');emission[y0:y1+1,x0:x1+1,:3][cracks&mask]=color('#ff8522')
            if 'bouncy' in detail:
                stripes=np.sin(x*1.7+y*.9)>0;base[stripes]*=[1.1,.78,.86]
            if 'tower' in detail:
                stars=(np.cos(x*5+y*3)>.93)&(np.cos(z*7-y*4)>.92);base[stars]=color('#e5c77f')
            if 'frosty' in detail:base[y>5.8]=np.array(color('#e2f1f7'))*grad[y>5.8,None]
            if 'gear' in detail:
                for cx in [-2,2]:
                    dx=x-cx;dy=y-4.3;rad=np.sqrt(dx*dx+dy*dy);angle=np.arctan2(dy,dx)
                    gear=(rad<.63+.07*np.cos(angle*12))&(rad>.2)&(z>3.2);base[gear]=color('#d4ad65')
            if 'starry' in detail:
                rad=(x-1.5)**2+(y-4.8)**2;cut=(x-1.76)**2+(y-4.95)**2
                moon=(rad<.5**2)&(cut>.44**2)&(z>2);base[moon]=color('#efdc9a');emission[y0:y1+1,x0:x1+1,:3][moon&mask]=color('#e8c578')
        elif detail=='wood':base*= (.91+.09*np.sin(y*7+x*27+np.sin(z*8)))[...,None]
        elif detail=='stone':base*= (.88+.12*np.cos(x*11)*np.cos(y*9)*np.cos(z*7))[...,None]
        elif detail=='map':
            route=(abs(y-(.25+.11*np.sin(x*14)))<.012)&(abs(x)<.19)&(z>0)
            base[route]=color('#6c9f72')
            landmarks=((x-.1)**2+(y-.34)**2<.025**2)|((x+.12)**2+(y-.16)**2<.022**2);base[landmarks&(z>0)]=color('#d58b68')
        tex[y0:y1+1,x0:x1+1,:3][mask]=np.clip(base[mask],0,1)
        tex[y0:y1+1,x0:x1+1,3][mask]=1
        metal_value=max(metal,metallic_flags[t.material_index]);mr[y0:y1+1,x0:x1+1,2][mask]=metal_value
        mr[y0:y1+1,x0:x1+1,1][mask]=.4 if metal_value>.5 else .68
        if glow_flags[t.material_index]:emission[y0:y1+1,x0:x1+1,:3][mask]=np.clip(base[mask],0,1)
        if id.startswith('item_') or id in ['star_pickup','landmark_crystal','ghost']:
            emission[y0:y1+1,x0:x1+1,:3][mask]=np.clip(base[mask]*(.18 if id=='landmark_crystal' else .06),0,1)
        if id=='wizard':
            glow=(base[:,:,0]>.7)&(base[:,:,1]>.6)&(base[:,:,2]<.65);emission[y0:y1+1,x0:x1+1,:3][glow&mask]=base[glow&mask]*.25
    # Dilate the atlas into island padding to prevent seams at mip levels.
    covered=np.any(abs(tex[:,:,:3]-.65)>.001,axis=2)
    for _ in range(4):
        old=covered.copy()
        for axis in [0,1]:
            for step in [-1,1]:
                shifted=np.roll(covered,step,axis);take=shifted&~covered
                tex[take]=np.roll(tex,step,axis)[take];covered|=shifted
    image=bpy.data.images.new(id+'_basecolor',width=size,height=size,alpha=alpha<1)
    image.pixels.foreach_set(tex.ravel());image.file_format='PNG';image.pack()
    material=mat(main_name or id+'_main','#ffffff',metal=metal,rough=.4 if metal else .68,alpha=alpha)
    node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
    material.node_tree.links.new(node.outputs['Color'],material.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    o.data.materials.clear();o.data.materials.append(material)
    if max(metallic_flags,default=0)>.5 and not metal:
        mr_image=bpy.data.images.new(id+'_metallic_roughness',width=size,height=size,alpha=False);mr_image.colorspace_settings.name='Non-Color';mr_image.pixels.foreach_set(mr.ravel());mr_image.scale(256,256);mr_image.pack()
        n=material.node_tree.nodes.new('ShaderNodeTexImage');n.image=mr_image;sep=material.node_tree.nodes.new('ShaderNodeSeparateColor');material.node_tree.links.new(n.outputs['Color'],sep.inputs['Color']);p=material.node_tree.nodes['Principled BSDF'];material.node_tree.links.new(sep.outputs['Green'],p.inputs['Roughness']);material.node_tree.links.new(sep.outputs['Blue'],p.inputs['Metallic'])
    if np.max(emission[:,:,:3])>0:
        emit_size=512 if id.startswith('house_') or id in ['dragon','snowgun','yoyo','wizard'] else 256
        glow=bpy.data.images.new(id+'_emissive',width=size,height=size,alpha=False);glow.pixels.foreach_set(emission.ravel());glow.scale(emit_size,emit_size);glow.pack()
        en=material.node_tree.nodes.new('ShaderNodeTexImage');en.image=glow;p=material.node_tree.nodes['Principled BSDF'];material.node_tree.links.new(en.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=1
    for p in me.polygons:p.material_index=0
    if attr:me.color_attributes.remove(attr)
    return material
def joined_skin(obs,id,target,voxel=.018):
    """Union overlapping sculpt forms, preserve paint colors, smooth and budget."""
    o=join(obs,id+'_skin');origin(o,(0,0,0));me=o.data
    kd=KDTree(len(me.vertices));cols={}
    for p in me.polygons:
        c=me.materials[p.material_index].diffuse_color[:3]
        for i in p.vertices:cols[i]=c
    for i,v in enumerate(me.vertices):kd.insert(v.co,i)
    kd.balance()
    m=o.modifiers.new('joined_surface','REMESH');m.mode='VOXEL';m.voxel_size=voxel;m.use_smooth_shade=True
    select([o]);bpy.ops.object.modifier_apply(modifier=m.name)
    sm=o.modifiers.new('soft_sculpt','SMOOTH');sm.factor=1.4;sm.iterations=4;bpy.ops.object.modifier_apply(modifier=sm.name)
    triangles=sum(len(p.vertices)-2 for p in o.data.polygons)
    if triangles>target:
        d=o.modifiers.new('silhouette_budget','DECIMATE');d.ratio=target/triangles;bpy.ops.object.modifier_apply(modifier=d.name)
    attr=o.data.color_attributes.new(name='paint_color',type='FLOAT_COLOR',domain='POINT')
    for i,v in enumerate(o.data.vertices):attr.data[i].color=(*cols.get(kd.find(v.co)[1],(.5,.5,.5)),1)
    for p in o.data.polygons:p.use_smooth=True
    return o

def png(w,h,pixels):
    def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    data=b''.join(b'\0'+pixels[y].tobytes() for y in range(h))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(data,8))+chunk(b'IEND',b'')
def face_sheet(id,kind,size,skin,default='normal'):
    # Rasterized expression art, antialiased analytically, with skin-colored surround.
    yy,xx=np.mgrid[0:size,0:size];u=(xx%(size//2))/(size//2);v=(yy%(size//2))/(size//2)
    tile=(yy//(size//2))*2+xx//(size//2)
    a=np.zeros((size,size,4),float);a[:,:,:3]=color(skin);a[:,:,3]=1
    ink=np.zeros((size,size),bool)
    if kind=='eyes':
        for cx in [.25,.75]:
            eye=((u-cx)/.19)**2+((v-.5)/.36)**2
            normal=(tile==0)&(eye<1);a[normal,:3]=(.99,.99,.94)
            pupil=((u-(cx+.015))/.105)**2+((v-.5)/.25)**2
            a[(tile==0)&(pupil<1),:3]=(.08,.1,.16)
            for dx,dy,r in [(-.025,-.1,.055),(.052,.11,.026)]:
                shine=(u-cx-dx)**2+(v-.5-dy)**2<r*r;a[(tile==0)&shine,:3]=1
            ink|=(tile==1)&(abs(v-(.52+.2*(1-((u-cx)/.18)**2)))<.035)&(abs(u-cx)<.18)
            ink|=(tile==2)&(abs(v-(.35+.28*abs((u-cx)/.16)))<.04)&(abs(u-cx)<.16)
            worried=((u-cx)/.15)**2+((v-.57)/.25)**2<1;ink|=(tile==3)&worried
        if default=='sleepy':
            upper=(tile==0)&(v<.43);a[upper,:3]=color(skin)
            ink|=(tile==0)&(abs(v-.43)<.018)&(((abs(u-.25)<.16)|(abs(u-.75)<.16)))
        if id=='tyler':ink|=(tile==0)&(abs(v-(.12+.12*abs(u-.5)))<.023)&(abs(u-.5)>.08)&(abs(u-.5)<.42)
        if id=='nick':ink|=(tile==0)&(u>.55)&(u<.94)&(v<.36)&(v>.24)
    else:
        ink|=(tile==0)&(abs(v-(.52+.22*(1-((u-.5)/.36)**2)))<.035)&(abs(u-.5)<.36)
        grin=(tile==1)&(((u-.5)/.36)**2+((v-.52)/.31)**2<1);ink|=grin
        ink|=(tile==2)&(((u-.5)/.13)**2+((v-.53)/.23)**2<1)
        ink|=(tile==3)&(abs(v-(.52-.12*(1-((u-.5)/.34)**2)+.025*np.sin(u*35)))<.035)&(abs(u-.5)<.34)
    a[ink,:3]=(.09,.075,.14)
    if id=='tall-robot' and kind=='eyes':
        a[:,:,:3]=color(skin)
        eye=((u-.5)/.3)**2+((v-.5)/.38)**2
        normal=(tile==0)&(eye<1);a[normal,:3]=(.12,.95,.35)
        pupil=(tile==0)&(((u-.5)/.17)**2+((v-.52)/.25)**2<1);a[pupil,:3]=(.025,.17,.1)
        shine=(tile==0)&((u-.42)**2+(v-.37)**2<.04**2);a[shine,:3]=(.75,1,.8)
        blink=(tile==1)&(abs(v-.53)<.035)&(abs(u-.5)<.29);happy=(tile==2)&(abs(v-(.28+.55*abs(u-.5)))<.045)&(abs(u-.5)<.29)
        worried=(tile==3)&(eye<.75);a[blink|happy|worried,:3]=(.12,.95,.35)
    if kind=='mouth':
        teeth=(tile==1)&(abs(u-.5)<.26)&(v>.33)&(v<.43);a[teeth,:3]=(1,.98,.9)
        if default=='grin':
            half=size//2;a[:half,:half]=a[:half,half:]
    # Blender image pixels are bottom-to-top; top-left default is UV [0,.5]x[.5,1].
    a[:,:,3]=np.any(abs(a[:,:,:3]-np.array(color(skin)))>.02,axis=2).astype(float)
    image=bpy.data.images.new(id+'_'+kind+'_sheet',width=size,height=size,alpha=True)
    image.pixels.foreach_set(a[::-1].astype(np.float32).ravel());image.file_format='PNG';image.pack()
    material=mat(kind,'#ffffff');p=material.node_tree.nodes['Principled BSDF'];node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
    material.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color'])
    material.node_tree.links.new(node.outputs['Alpha'],p.inputs['Alpha'])
    material.surface_render_method='DITHERED'
    return material
def face_mesh(id,y,z,w,h,material,headbone='head'):
    o=mesh(id, [(-w/2,y-h/2,z),(w/2,y-h/2,z),(w/2,y+h/2,z),(-w/2,y+h/2,z)],[(0,1,2,3)],'#ffffff')
    o.data.materials.clear();o.data.materials.append(material);uv=o.data.uv_layers.new(name='UVMap')
    for i,p in enumerate([(0,.5),(.5,.5),(.5,1),(0,1)]):uv.data[i].uv=p
    return o

def add_rig(bones):
    data=bpy.data.armatures.new('rig_data');o=bpy.data.objects.new('rig',data);bpy.context.collection.objects.link(o);select([o]);bpy.ops.object.mode_set(mode='EDIT')
    for name,head,tail,parent in bones:
        b=data.edit_bones.new(name);b.head=head;b.tail=tail
        if parent:b.parent=data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT');return o
def bind(o,rig,rigid=None):
    modifier=o.modifiers.new('skin_deformation','ARMATURE');modifier.object=rig;o.parent=rig
    if rigid:
        g=o.vertex_groups.new(name=rigid);g.add(list(range(len(o.data.vertices))),1,'REPLACE');return
    bones=[b for b in rig.data.bones if b.name not in ['root','jaw','crest','fingers_L','fingers_R','toes_L','toes_R']]
    coords=np.array([v.co[:] for v in o.data.vertices]);dist=[]
    for b in bones:
        h=np.array(b.head_local);t=np.array(b.tail_local);line=t-h
        u=np.clip(((coords-h)@line)/max(line@line,1e-8),0,1);d=np.linalg.norm(coords-(h+u[:,None]*line),axis=1)
        # Left/right limbs should never attract vertices on the opposite side.
        if b.name.endswith('_L'):d+=np.where(coords[:,0]<-.015,.5,0)
        if b.name.endswith('_R'):d+=np.where(coords[:,0]>.015,.5,0)
        if any(k in b.name for k in ['upper_arm','forearm','hand_','shoulder']):
            scale=max(v.co.y for v in o.data.vertices)
            central=(abs(coords[:,0])<.205*scale)|(coords[:,1]>.7*scale)|(coords[:,1]<.25*scale)
            d+=np.where(central,.7*scale,0)
        if any(k in b.name for k in ['thigh','shin','foot_']):
            scale=max(v.co.y for v in o.data.vertices)
            leg=(coords[:,1]<.31*scale)&(abs(coords[:,0])>.09*scale)&((coords[:,2]<.14*scale)|(coords[:,1]<.18*scale))
            d+=np.where(~leg,.7*scale,0)
        dist.append(d)
    dist=np.array(dist).T;chosen=np.argsort(dist,axis=1)[:,:4];weights=1/np.maximum(np.take_along_axis(dist,chosen,axis=1),.012)**5;weights/=weights.sum(1)[:,None]
    groups=[o.vertex_groups.new(name=b.name) for b in bones]
    for i in range(len(coords)):
        for j,w in zip(chosen[i],weights[i]):groups[j].add([i],float(w),'REPLACE')
def marker_on_bone(name,p,rig,bone):
    o=empty(name);o.parent=rig;o.parent_type='BONE';o.parent_bone=bone
    # Bone parenting is relative to the bone tip; keep marker at the requested rest location.
    bpy.context.view_layer.update();o.matrix_world=Matrix.Translation(Vector(p));return o

def friends_bones(h=1,tail=True,mo=False,pip=False):
    b=[]
    def add(n,a,c,p):b.append((n,tuple(np.array(a)*h),tuple(np.array(c)*h),p))
    add('root',(0,0,0),(0,.08,0),None);add('hips',(0,.32,0),(0,.43,0),'root');add('spine',(0,.43,0),(0,.55,0),'hips');add('chest',(0,.55,0),(0,.65,0),'spine');add('neck',(0,.65,0),(0,.72,0),'chest');add('head',(0,.72,0),(0,.98,0),'neck')
    for s,side in [(1,'L'),(-1,'R')]:
        add('shoulder_'+side,(0,.61,0),(s*.16,.61,0),'chest');add('upper_arm_'+side,(s*.16,.61,0),(s*.28,.48,0),'shoulder_'+side);add('forearm_'+side,(s*.28,.48,0),(s*.37,.37,.015),'upper_arm_'+side);add('hand_'+side,(s*.37,.37,.015),(s*.42,.33,.02),'forearm_'+side);add('fingers_'+side,(s*.42,.33,.02),(s*.45,.3,.02),'hand_'+side)
        add('thigh_'+side,(s*.13,.34,0),(s*.16,.19,.01),'hips');add('shin_'+side,(s*.16,.19,.01),(s*.17,.07,.025),'thigh_'+side);add('foot_'+side,(s*.17,.07,.025),(s*.17,.05,.13),'shin_'+side);add('toes_'+side,(s*.17,.05,.13),(s*.17,.05,.19),'foot_'+side)
    if tail:
        pts=[(0,.33,-.13),(.17,.22,-.23),(.33,.28,-.28),(.39,.47,-.28),(.25,.56,-.25),(.19,.42,-.22)]
        if mo:pts=pts[:3]
        for i in range(len(pts)-1):add('tail_'+str(i+1),pts[i],pts[i+1],'hips' if i==0 else 'tail_'+str(i))
    if mo:add('shell',(0,.45,-.1),(0,.66,-.13),'spine')
    if pip:
        for s,side in [(1,'L'),(-1,'R')]:add('eye_bump_'+side,(s*.16,.84,.08),(s*.16,1,.08),'head')
    return b

def clips(rig,names,slow=False):
    durations={'idle':2,'walk':.8,'hop':.4,'drive':2,'drive_left':0,'drive_right':0,'cheer':1.5,'wave':1.5,'oops':.8,'dizzy':1,'victory':2,'fly':1.2,'puff':1.1,'taunt':1.5,'hurt':.5,'spin_out':1.2,'aim':1,'fire':.5,'melt':1.5,'roll':1,'bounce':.8,'unwind':1.5,'teleport':1,'cast':1.2,'poof':1,'float':2,'boo':1.2,'talk':1.5,'beep':.8,'ripple':1}
    loop={'idle','walk','drive','cheer','wave','dizzy','fly','roll','bounce','float','talk','ripple'}
    for name in names:
        rig.animation_data_create();rig.animation_data.action=None
        for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
        duration=durations[name];last=max(1,round(duration*30));frames=[0] if duration==0 else range(last+1)
        for f in frames:
            u=f/max(last,1);phase=2*P*u;wave=math.sin(phase);bend=math.sin(P*u)
            for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
            def rot(n,x=0,y=0,z=0):
                if n in rig.pose.bones:rig.pose.bones[n].rotation_euler=(x,y,z)
            def loc(n,v):
                if n in rig.pose.bones:rig.pose.bones[n].location=v
            def pose_rotation(b):
                rest=b.bone.matrix_local.to_quaternion()
                if b.parent:
                    relative=b.parent.bone.matrix_local.to_quaternion().inverted()@rest
                    return pose_rotation(b.parent)@relative@b.rotation_euler.to_quaternion()
                return rest@b.rotation_euler.to_quaternion()
            def direction(n,target):
                if n not in rig.pose.bones:return
                b=rig.pose.bones[n];rest=b.bone.matrix_local.to_quaternion()
                rest_y=rest@Vector((0,1,0));desired=rest_y.rotation_difference(Vector(target).normalized())@rest
                parent=pose_rotation(b.parent) if b.parent else Quaternion()
                relative=b.parent.bone.matrix_local.to_quaternion().inverted()@rest if b.parent else rest
                b.rotation_euler=((parent@relative).inverted()@desired).to_euler()
            amp=.6 if slow else 1
            if name in ['idle','float','drive']:rot('spine',0,0,.025*wave*amp);rot('tail_3',0,.12*wave,0);loc('hips',(0,.008*wave*amp,0))
            if name=='float':loc('root',(0,.06*wave,0))
            if name=='walk':
                for side,s in [('L',1),('R',-1)]:rot('thigh_'+side,.55*wave*s*amp);rot('shin_'+side,max(0,-wave*s)*.7);rot('upper_arm_'+side,-.3*wave*s)
                loc('root',(0,.035*(1-math.cos(phase*2)),0));rot('tail_2',0,.15*wave,0)
            if name=='hop':loc('root',(0,.5*math.sin(P*u)**2,0));rot('thigh_L',-.4*bend);rot('thigh_R',-.4*bend);rot('shin_L',.75*bend);rot('shin_R',.75*bend)
            if name.startswith('drive'):
                body_scale=rig.data.bones['hips'].head_local.y/.32
                loc('hips',(0,-.32*body_scale,0));rot('spine',0,0,.2 if name=='drive_left' else -.2 if name=='drive_right' else .025*wave)
                for side,s in [('L',1),('R',-1)]:
                    direction('thigh_'+side,(s*.05,0,1));direction('shin_'+side,(0,-1,0));direction('foot_'+side,(0,0,1));direction('upper_arm_'+side,(s*.3,-.4,.8));direction('forearm_'+side,(0,.15,1))
            if name in ['cheer','victory','wave']:
                for side,s in [('L',1),('R',-1)]:
                    if name=='cheer' or side=='R':
                        lift=1 if name!='victory' else min(u*3,1)
                        direction('upper_arm_'+side,(s*.1,1*lift-.5*(1-lift),0));direction('forearm_'+side,(s*.05,1,0))
                if name=='cheer':loc('root',(0,.13*(1-math.cos(phase)),0))
                if name=='wave':rot('forearm_R',0,0,.45*wave);rot('hand_R',0,0,.25*wave)
            if name in ['oops','hurt']:rot('spine',-.25*bend,0,.2*math.sin(phase*2)*bend);rot('head',.15*bend)
            if name=='dizzy':rot('head',.12*wave,.2*math.cos(phase),.1*wave);rot('spine',0,0,.08*wave)
            if name in ['fly','puff','taunt']:
                rot('wing_L',0,0,.6*math.sin(phase*2));rot('wing_R',0,0,-.6*math.sin(phase*2));rot('head',-.15*bend if name=='puff' else .08*wave)
                if name=='fly':loc('root',(0,.15+.06*wave,0))
            if name=='spin_out':rot('root',0,4*P*u,.9*u);loc('root',(0,.25*bend,0))
            if name in ['aim','fire']:rot('cannon',-.2*bend,.25*bend,0);loc('cannon',(0,0,-.13*bend if name=='fire' else 0))
            if name in ['melt','poof','teleport']:
                s=max(.05,1-u*.95) if name!='teleport' else max(.08,abs(math.cos(P*u)))
                rig.pose.bones['root'].scale=(1 if name=='melt' else s,s,1 if name=='melt' else s)
            if name=='roll':rot('spin',0,0,-2*P*u)
            if name=='bounce':loc('root',(0,.3*(1-math.cos(phase)),0))
            if name=='unwind':rot('spin',0,0,6*P*u);loc('root',(0,-.4*u,0))
            if name=='cast':rot('wand',-.8*bend);rot('upper_arm_R',-.7*bend);rot('hat_tip',0,0,.16*wave)
            if name in ['boo','wave','talk']:
                rot('arm_L',0,0,.25*wave);rot('arm_R',0,0,-.4*wave);rot('head',.07*wave,.08*wave,0);rot('hem',0,.05*wave,0)
            if name=='beep':rot('antenna',.2*math.sin(phase*3)*bend,0,0)
            if name=='cheer':direction('arm_L',(.1,1,0));direction('arm_R',(-.1,1,0))
            if name=='ripple':
                for i in range(1,6):rot('carpet_'+str(i),.045*math.sin(phase+i*.65))
            for b in rig.pose.bones:
                b.keyframe_insert(data_path='rotation_euler',frame=f);b.keyframe_insert(data_path='location',frame=f);b.keyframe_insert(data_path='scale',frame=f)
        action=rig.animation_data.action;action.name=name
        track=rig.animation_data.nla_tracks.new();track.name=name
        strip=track.strips.new(name,0,action);strip.name=name;track.mute=True
        rig.animation_data.action=None
    for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
    bpy.context.scene.frame_set(0)

def export(id,category):
    folder=OUT/category;folder.mkdir(parents=True,exist_ok=True)
    import bmesh
    for o in bpy.context.scene.objects:
        if o.type=='MESH' and len(o.data.polygons)>1:
            bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    # Source materials used during sculpting are deliberately not exported.
    bpy.ops.export_scene.gltf(filepath=str(folder/(id+'.glb')),export_format='GLB',export_yup=False,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_skins=True,export_influence_nb=4,export_all_influences=False,export_cameras=False,export_lights=False,export_extras=False,export_optimize_animation_size=True)
    path=folder/(id+'.glb');raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
    for material in doc.get('materials',[]):
        material['doubleSided']=material['name'].endswith('_alpha') or material['name']=='carpet_main'
        if material['name'] in ['eyes','mouth'] or material['name'].endswith('_alpha'):
            material['alphaMode']='MASK';material['alphaCutoff']=.5;material['doubleSided']=material['name'].endswith('_alpha')
        elif material['name']=='ghost_main':material['alphaMode']='BLEND'
    for key in ['nodes','meshes','materials','animations']:
        used=set()
        for ob in doc.get(key,[]):
            original=ob.get('name',key[:-1]);name=re.sub(r'[^a-zA-Z0-9_]','_',original)
            if name in used:
                suffix=1
                while name+'_'+str(suffix) in used:suffix+=1
                name+='_'+str(suffix)
            ob['name']=name;used.add(name)
    for node in doc['nodes']:
        if 'mesh' in node:doc['meshes'][node['mesh']]['name']=node['name']
    js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
    print('EXPORTED',category,id,flush=True)

FRIEND_CLIPS=['idle','walk','hop','drive','drive_left','drive_right','cheer','wave','oops','dizzy','victory']
def character(id):
    reset();info={'tyler':(1,'#3fca4c','#dbed9d'),'skyler':(1,'#5ab8f5','#f1f6ed'),'nick':(1,'#9a5ce0','#e2ceef'),'pip':(.8,'#9be22d','#f3edbf'),'mo':(.9,'#9ccc65','#c4dfa0'),'zazz':(1,'#dddddd','#eeeeee')}
    height,c,belly=info[id];forms=[]
    def s(n,p,size,col=c):o=sphere(n,p,size,col);forms.append(o);return o
    def t(n,pts,r,col=c):o=tube(n,pts,r,col);forms.append(o);return o
    s('torso',(0,.44,0),(.205,.25,.145));s('belly',(0,.43,.105),(.155,.2,.055),belly)
    s('neck',(0,.66,0),(.105,.14,.09));s('head',(0,.79,.015),(.26,.205,.17));s('muzzle',(0,.72,.125),(.215,.115,.095))
    for sign,side in [(1,'L'),(-1,'R')]:
        t('arm_'+side,[(sign*.145,.6,0),(sign*.21,.55,0),(sign*.28,.48,0),(sign*.33,.42,.01),(sign*.37,.37,.015)],[.075,.067,.058,.053,.05])
        s('hand_'+side,(sign*.39,.35,.02),(.065,.063,.05))
        for j in range(3):
            t('finger',[(sign*.4,.34,.02+(j-1)*.036),(sign*.46,.3,.02+(j-1)*.036)],.022)
            s('pad',(sign*.46,.3,.02+(j-1)*.036),(.027,.026,.027))
        legpts=[(sign*.12,.34,0),(sign*.16,.26,0),(sign*.16,.19,.01),(sign*.17,.12,.02),(sign*.17,.065,.03)]
        if id=='pip':legpts=[(sign*.12,.34,0),(sign*.2,.27,-.055),(sign*.21,.21,-.08),(sign*.18,.12,.015),(sign*.17,.065,.03)]
        t('leg_'+side,legpts,[.095,.085,.07,.057,.05] if id=='pip' else [.09,.077,.065,.057,.05])
        s('foot',(sign*.17,.045,.09),(.085,.045,.12))
        for j in range(3):s('toe',(sign*.17+(j-1)*.05,.033,.18),(.026,.032,.038))
    if id!='pip':
        pts=[(0,.33,-.11),(.08,.26,-.18),(.17,.22,-.23),(.25,.23,-.26),(.33,.28,-.28),(.38,.38,-.28),(.39,.47,-.28),(.33,.54,-.27),(.25,.56,-.25),(.19,.51,-.23),(.19,.42,-.22)]
        if id=='mo':pts=pts[:4]
        t('tail',pts,np.linspace(.105,.018,len(pts)))
    if id=='tyler':
        s('bandana',(0,.61,.01),(.16,.045,.16),'#e83a38');t('bandana_tip',[(.08,.64,.08),(.16,.58,.08),(.2,.63,.07)],[.04,.035,.015],'#e83a38')
    if id=='skyler':
        for x in [-.13,.13]:
            t('goggle_frame',[(x+.095*math.cos(a),.925+.07*math.sin(a),.13) for a in np.linspace(0,2*P,33)],.016,'#b28b4b')
            s('goggle_lens',(x,.925,.13),(.08,.055,.02),'#bfeced')
        t('satchel_strap',[(-.13,.6,.1),(0,.46,.16),(.14,.34,.11)],.018,'#ad794b');s('satchel',(.2,.34,.04),(.06,.075,.055),'#ad794b')
    if id=='nick':
        for sign,col in [(1,'#7edca1'),(-1,'#ffca68')]:s('sock',(sign*.17,.095,.055),(.062,.08,.065),col)
    if id=='pip':
        for sign in [-1,1]:s('eye_bump',(sign*.16,.885,.065),(.12,.115,.105));s('cheek',(sign*.18,.72,.18),(.035,.021,.015),'#f2a4ae')
    if id=='mo':
        s('shell',(0,.48,-.1),(.24,.29,.19),'#8b5a2b');s('scarf',(0,.65,0),(.13,.035,.11),'#eaa465')
    if id=='zazz':
        t('crest',[(0,.87,-.05),(0,1.06,-.05),(0,.96,.05)],[.07,.012,.04],'#f1d695')
        for sign in [-1,1]:t('turret_eye',[(sign*.13,.84,.1),(sign*.13,.84,.25)],[.11,.085])
    body=joined_skin(forms,id,9700,voxel=.012)
    for v in body.data.vertices:v.co*=height
    painted_atlas(body,id,1024,id,main_name='skin_tint' if id=='zazz' else id+'_main',gray=id=='zazz')
    if id=='zazz':
        accent=body.data.materials[0].copy();accent.name='zazz_main';accent.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(1,.82,.38,1)
        # Keep the same UV atlas; golden accent color is painted in the accent image.
        image=next(n.image for n in accent.node_tree.nodes if n.type=='TEX_IMAGE').copy();image.name='zazz_accent_atlas'
        px=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4);px[:,:3]*=[1,.82,.38];image.pixels.foreach_set(px.ravel());image.pack()
        next(n for n in accent.node_tree.nodes if n.type=='TEX_IMAGE').image=image
        body.data.materials.append(accent)
        for poly in body.data.polygons:
            p=poly.center
            if p.y>.98 or p.y<.045:poly.material_index=1
    rig=add_rig(friends_bones(height,tail=id!='pip',mo=id=='mo',pip=id=='pip'))
    if id=='zazz':
        select([rig]);bpy.ops.object.mode_set(mode='EDIT');b=rig.data.edit_bones.new('crest');b.head=(0,.91,0);b.tail=(0,1.06,0);b.parent=rig.data.edit_bones['head'];bpy.ops.object.mode_set(mode='OBJECT')
    bind(body,rig)
    eye=face_sheet(id,'eyes',512,c,'sleepy' if id=='mo' else 'normal');mouth=face_sheet(id,'mouth',256,c,'grin' if id=='nick' else 'normal')
    e=face_mesh('eyes_mesh',(.84 if id=='zazz' else .82)*height,(.265 if id=='zazz' else .187)*height,(.52 if id=='zazz' else .39)*height,.16*height,eye);bind(e,rig,'head')
    m=face_mesh('mouth_mesh',.695*height,.224*height,(.28 if id=='nick' else .24)*height,(.13 if id=='nick' else .09)*height,mouth);bind(m,rig,'head')
    marker_on_bone('head_top',(0,height,0),rig,'head');marker_on_bone('hand_R_grip',(-.4*height,.35*height,.04*height),rig,'hand_R')
    clips(rig,FRIEND_CLIPS,id=='mo');export(id,'characters')

def villain(id):
    reset();forms=[]
    c={'dragon':'#e03c31','snowgun':'#dfedf9','yoyo':'#ff5fa2','wizard':'#7b3fc4','ghost':'#dceffa','tall-robot':'#8da9bb'}[id]
    def s(n,p,size,col=c,seg=32,rings=20):o=sphere(n,p,size,col,seg,rings);forms.append(o);return o
    def t(n,pts,r,col=c,seg=16):o=tube(n,pts,r,col,seg);forms.append(o);return o
    def b(n,p,size,col=c,bevel=.03):o=box(n,p,size,col,bevel);forms.append(o);return o
    bones=[];markers=[];face=(.8,.22,.4,.16,.68,.25,.24,.09)
    def bn(n,h,t,p):bones.append((n,h,t,p))
    bn('root',(0,0,0),(0,.08,0),None);bn('hips',(0,.32,0),(0,.45,0),'root');bn('spine',(0,.45,0),(0,.6,0),'hips');bn('chest',(0,.6,0),(0,.7,0),'spine');bn('neck',(0,.7,0),(0,.76,0),'chest');bn('head',(0,.76,0),(0,.98,0),'neck')
    for sign,side in [(1,'L'),(-1,'R')]:bn('arm_'+side,(sign*.2,.6,0),(sign*.48,.44,.04),'chest')
    if id=='dragon':
        s('body',(0,.39,0),(.29,.34,.2));s('belly',(0,.4,.16),(.22,.27,.075),'#f6d25a');s('head',(0,.8,.02),(.28,.22,.19));s('muzzle',(0,.73,.16),(.25,.13,.13))
        for x in [-.14,.14]:s('eye_bump',(x,.9,.16),(.11,.11,.09))
        for sign,side in [(1,'L'),(-1,'R')]:
            s('foot',(sign*.21,.07,.09),(.14,.07,.16));t('leg',[(sign*.17,.3,0),(sign*.21,.12,.04)],.1)
            t('arm',[(sign*.23,.59,.01),(sign*.38,.43,.05)],.09);s('hand',(sign*.38,.43,.05),(.09,.09,.08))
            t('horn',[(sign*.18,.95,-.01),(sign*.21,1.11,-.03)],[.065,.006],'#f4e1b5')
            # A thin but closed and softly rounded wing surface joins the shoulder.
            s('wing',(sign*.36,.65,-.13),(.2,.18,.04),'#f0a65f');bn('wing_'+side,(sign*.22,.65,-.13),(sign*.52,.7,-.13),'chest')
        pts=[(0,.27,-.15),(.2,.18,-.27),(.4,.24,-.28),(.46,.43,-.22),(.45,.61,-.18)]
        t('tail',pts,[.12,.105,.075,.05,.025]);
        for i in range(4):bn('tail_'+str(i+1),pts[i],pts[i+1],'hips' if i==0 else 'tail_'+str(i))
        for x in [.415,.49]:s('heart_lobe',(x,.635,-.18),(.055,.065,.04))
        t('snaggle',[(.09,.69,.27),(.09,.61,.27)],[.03,.004],'#fff5d8');markers=[('nose',(0,.77,.3),'head')]
        names=['idle','fly','puff','taunt','hurt','spin_out'];height=2.2;target=14200;voxel=.011
        face=(.9,.258,.4,.14,.7,.29,.24,.08)
    elif id=='snowgun':
        for y,r in [(.24,.24),(.57,.205),(.85,.155)]:s('snowball',(0,y,0),(r,r,r))
        t('carrot',[(0,.84,.145),(0,.81,.31)],[.047,.003],'#f59a3f')
        b('bucket',(0,1.035,0),(.31,.22,.3),'#cb3f47');b('bucket_rim',(0,.94,0),(.37,.04,.35),'#cb3f47')
        s('scarf',(0,.72,0),(.18,.04,.16),'#d43b44');t('scarf_tail',[(.09,.71,.13),(.1,.52,.19)],.035,'#d43b44')
        for sign,side in [(1,'L'),(-1,'R')]:t('stick_arm',[(sign*.17,.62,0),(sign*.38,.65,.05)],.028,'#865638')
        t('cannon',[(.35,.63,.03),(.35,.63,.43)],.13,'#5881b5',32);s('cannon_snowball',(.35,.63,.435),(.095,.095,.015),'#edf6fb')
        bn('cannon',(.35,.63,.03),(.35,.63,.43),'arm_L');markers=[('muzzle',(.35,.63,.46),'cannon')]
        names=['idle','aim','fire','taunt','hurt','melt'];height=2;target=11900;voxel=.009
        face=(.875,.158,.24,.1,.785,.17,.17,.055)
    elif id=='yoyo':
        for z in [-.12,.12]:s('disc',(0,.51,z),(.5,.5,.1),seg=48,rings=28)
        t('axle',[(0,.51,-.12),(0,.51,.12)],.15,'#c4377d',32)
        for sign,side in [(1,'L'),(-1,'R')]:t('arm',[(sign*.45,.55,0),(sign*.67,.38,.04)],.035);s('glove',(sign*.67,.38,.04),(.065,.06,.045),'#fff3dc')
        bn('spin',(0,.51,0),(0,.51,.2),'root');markers=[('string_attach',(0,1.01,0),'spin')]
        names=['idle','roll','bounce','taunt','hurt','unwind'];height=1.6;target=11800;voxel=.009
        face=(.63,.223,.55,.22,.4,.223,.35,.13)
    elif id=='wizard':
        t('robe',[(0,.04,0),(0,.5,0),(0,.65,0)],[.28,.2,.15],seg=32)
        s('beard',(0,.6,.16),(.19,.29,.12),'#f5f3e9');s('face',(0,.79,.16),(.16,.13,.08),'#eac9a3')
        s('hat_brim',(0,.87,0),(.34,.035,.25));t('hat',[(0,.88,0),(0,1.06,0),(.03,1.26,0),(.15,1.34,0),(.23,1.23,.01)],[.24,.17,.09,.05,.006],seg=32)
        for sign in [-1,1]:t('glasses',[(sign*.085+.072*math.cos(a),.795+.063*math.sin(a),.245) for a in np.linspace(0,2*P,33)],.008,'#e8d59e')
        for sign in [-1,1]:t('sleeve',[(sign*.15,.6,0),(sign*.36,.48,.04)],[.1,.07]);s('hand',(sign*.36,.48,.04),(.065,.065,.05),'#eac9a3')
        t('wand', [(-.37,.28,.04),(-.37,.55,.04),(-.41,.89,.04)],.018,'#c49245');forms.append(star('wand_star',(-.41,.95,.04),.085,.035,'#ffe28c'))
        bn('wand',(-.37,.48,.04),(-.41,.95,.04),'arm_R');bn('hat_tip',(0,1.08,0),(.23,1.23,.01),'head');markers=[('wand_tip',(-.41,1.01,.04),'wand')]
        names=['idle','teleport','cast','taunt','hurt','poof'];height=1.8;target=14100;voxel=.01
        face=(.79,.252,.24,.08,.71,.259,.13,.05)
    elif id=='ghost':
        s('sheet',(0,.54,0),(.29,.48,.19))
        for x in [-.2,0,.2]:s('hem',(x,.1,.01),(.12,.1,.18))
        for sign in [-1,1]:t('stubby_arm',[(sign*.23,.51,0),(sign*.39,.68,.025)],[.095,.05]);s('cheek',(sign*.19,.6,.176),(.035,.02,.01),'#f2a5bb')
        bn('hem',(0,.16,0),(0,.05,0),'hips');names=['float','wave','boo','cheer'];height=1.4;target=6100;voxel=.013
        face=(.74,.19,.34,.15,.58,.193,.22,.08)
    else:
        b('torso',(0,.45,0),(.35,.36,.25),'#8da9bb',.055);b('head',(0,.79,0),(.43,.31,.29),'#8da9bb',.065)
        b('screen',(0,.79,.145),(.35,.23,.035),'#213742',.025)
        for sign in [-1,1]:
            t('leg',[(sign*.11,.32,0),(sign*.12,.1,0)],.045,'#576c80');b('foot',(sign*.12,.055,.045),(.17,.11,.24),'#8da9bb')
            t('arm',[(sign*.19,.58,0),(sign*.29,.46,0),(sign*.33,.57,.06)],.04,'#576c80');t('clamp',[(sign*.36,.6,.07),(sign*.39,.54,.07),(sign*.31,.52,.07)],.02)
        t('antenna',[(0,.94,0),(0,1.1,0)],.016,'#576c80')
        t('phone', [(-.34,.5,.12),(-.41,.53,.12),(-.41,.75,.12),(-.34,.78,.12)],.042,'#e44543')
        bn('antenna',(0,.94,0),(0,1.1,0),'head');names=['idle','wave','talk','beep'];height=2.2;target=6500;voxel=.012
        face=(.79,.171,.34,.2,0,0,0,0)
    body=joined_skin(forms,id,target,voxel=voxel)
    coords=np.array([v.co[:] for v in body.data.vertices]);lo=coords[:,1].min();factor=height/(coords[:,1].max()-lo)
    if id=='yoyo':factor=1.6/(2*.5)
    if id=='tall-robot':factor=2.2/(1.145-lo)
    for v in body.data.vertices:v.co.y-=lo;v.co*=factor
    bones=[(n,tuple((Vector(h)-Vector((0,lo,0)))*factor),tuple((Vector(t)-Vector((0,lo,0)))*factor),p) for n,h,t,p in bones]
    detail={'dragon':'','snowgun':'snow','yoyo':'swirl','wizard':'wizard','ghost':'','tall-robot':'robot'}[id]
    painted_atlas(body,id,512 if id in ['ghost','tall-robot'] else 1024,detail,main_name='robot_main' if id=='tall-robot' else id+'_main',metal=.72 if id=='tall-robot' else 0,alpha=.9 if id=='ghost' else 1)
    rig=add_rig(bones);bind(body,rig,'spin' if id=='yoyo' else None)
    if id=='yoyo':
        for sign,side in [(1,'L'),(-1,'R')]:
            ids=[v.index for v in body.data.vertices if v.co.x*sign>.49*factor]
            if ids:body.vertex_groups['spin'].remove(ids);g=body.vertex_groups.new(name='arm_'+side);g.add(ids,1,'REPLACE')
    ey,ez,ew,eh,my,mz,mw,mh=face
    em=face_sheet(id,'eyes',512,c)
    if id=='tall-robot':
        node=em.node_tree.nodes['Principled BSDF'];node.inputs['Emission Color'].default_value=(.04,1,.13,1);node.inputs['Emission Strength'].default_value=.4
    e=face_mesh('eyes_mesh',(ey-lo)*factor,ez*factor,ew*factor,eh*factor,em);bind(e,rig,'spin' if id=='yoyo' else 'head')
    if id!='tall-robot':
        mm=face_sheet(id,'mouth',256,c);o=face_mesh('mouth_mesh',(my-lo)*factor,mz*factor,mw*factor,mh*factor,mm);bind(o,rig,'spin' if id=='yoyo' else 'head')
    else:
        glow=sphere('bulb',(0,(1.11-lo)*factor,0),(.035*factor,)*3,'#ef5345');painted_atlas(glow,id+'_bulb',256,main_name='robot_glow')
        glow.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(1,.12,.05,1);glow.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=1
        bind(glow,rig,'antenna')
    for n,p,bone in markers:marker_on_bone(n,(Vector(p)-Vector((0,lo,0)))*factor,rig,bone)
    clips(rig,names);export(id,'villains')

def split_parts(o,groups,material_for):
    """Split a packed textured mesh without adding material slots/draw calls per part."""
    me=o.data;uv=me.uv_layers.active.data;parts=[];attr=me.attributes['part_id']
    for gid,name,pivot in groups:
        polys=[p for p in me.polygons if attr.data[p.index].value==gid]
        if not polys:continue
        ids=sorted({i for p in polys for i in p.vertices});mapping={old:i for i,old in enumerate(ids)}
        v=[me.vertices[i].co[:] for i in ids];f=[[mapping[i] for i in p.vertices] for p in polys]
        ob=mesh(name,v,f,'#ffffff');ob.data.materials.clear();ob.data.materials.append(material_for[gid])
        layer=ob.data.uv_layers.new(name='UVMap');k=0
        for poly in polys:
            for loop in poly.loop_indices:layer.data[k].uv=uv[loop].uv;k+=1
        for p in ob.data.polygons:p.use_smooth=True
        origin(ob,pivot);parts.append(ob)
    bpy.data.objects.remove(o,do_unlink=True);return parts

def pack_groups(groups,id,size=1024,detail=''):
    obs=[];metadata=[]
    for i,(parts,name,pivot,material) in enumerate(groups):
        o=join(parts,name+'_source');origin(o,(0,0,0));attr=o.data.attributes.new(name='part_id',type='INT',domain='FACE')
        for x in attr.data:x.value=i
        obs.append(o);metadata.append((i,name,pivot,material))
    if any(o.data.color_attributes.get('paint_color') for o in obs):
        for o in obs:
            if not o.data.color_attributes.get('paint_color'):
                attr=o.data.color_attributes.new(name='paint_color',type='FLOAT_COLOR',domain='POINT')
                for p in o.data.polygons:
                    c=o.data.materials[p.material_index].diffuse_color
                    for i in p.vertices:attr.data[i].color=c
    packed=join(obs,id+'_packed');origin(packed,(0,0,0));main=painted_atlas(packed,id,size,detail,main_name=id+'_main',metal=.75 if id in ['landmark_gear','gear_roller','house_gear'] else 0)
    materials={}
    for i,name,pivot,m in metadata:
        if m=='main':materials[i]=main
        else:
            other=bpy.data.materials.get(m)
            if not other:other=main.copy();other.name=m
            materials[i]=other
    return {o.name:o for o in split_parts(packed,[(i,n,p) for i,n,p,m in metadata],materials)}

def old_vehicles():
    import ast as _ast
    src=(ROOT/'tools'/'build_character_models.py').read_text();module=_ast.parse(src)
    ns={'np':np,'math':math}
    for n in module.body:
        if isinstance(n,_ast.Assign) and any(isinstance(t,_ast.Name) and t.id=='C' for t in n.targets):exec(compile(_ast.Module(body=[n],type_ignores=[]),'<geometry>','exec'),ns)
        if isinstance(n,(_ast.FunctionDef,_ast.ClassDef)) and n.name in ['rgb','Model']:exec(compile(_ast.Module(body=[n],type_ignores=[]),'<geometry>','exec'),ns)
    ns['Base']=ns['Model'];src2=(ROOT/'tools'/'build_vehicle_models.py').read_text()
    cls=next(n for n in _ast.parse(src2).body if isinstance(n,_ast.ClassDef) and n.name=='Vehicle')
    exec(compile(_ast.Module(body=[cls],type_ignores=[]),'<vehicles>','exec'),ns)
    exec('models=[]\n'+src2.split('\nmodels=[]\n',1)[1].split('\nmanifest=[]')[0],ns)
    return ns['models']

def wheel_surface(name,p,r,width):
    # One closed connected lathed tire/rim surface, with round shoulders and a flat hub.
    profile=[(-width*.52,0),(-width*.52,r*.48),(-width*.51,r*.72),(-width*.46,r*.9),(-width*.32,r*.985),(0,r),(width*.32,r*.985),(width*.46,r*.9),(width*.51,r*.72),(width*.52,r*.48),(width*.52,0)]
    verts=[];faces=[];segments=40
    for x,rad in profile:
        for j in range(segments):a=2*P*j/segments;verts.append((p[0]+x,p[1]+rad*math.cos(a),p[2]+rad*math.sin(a)))
    for i in range(len(profile)-1):
        for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,b,b+segments,a+segments))
    o=mesh(name,verts,faces,'#30343f');rim=mat('rim_source','#a4b7c6',metal=.75)
    o.data.materials.append(rim)
    for face in o.data.polygons:
        if abs(face.center.x-p[0])>width*.5:face.material_index=1
    return o

def vehicle(id):
    reset()
    if id=='carpet':return carpet()
    old=next(m for m in old_vehicles() if m.name==id)
    raw=old.parts;covered=set();groupinfo=[];objects=[];gid=0
    def add_group(obs,name,pivot,material='main'):
        nonlocal gid
        if not obs:return
        o=join(obs,name+'_source');origin(o,(0,0,0));attr=o.data.attributes.new(name='part_id',type='INT',domain='FACE')
        for d in attr.data:d.value=gid
        groupinfo.append((gid,name,np.array(pivot),material));objects.append(o);gid+=1
    def convert(i):
        name,v,f,c=raw[i];o=mesh(name,[tuple(x) for x in v],[tuple(int(j) for j in face) for face in f],tuple(c))
        if name=='paint':o.data.materials.clear();o.data.materials.append(mat('source_neutral_paint','#e6e6e6'))
        if name in ['headlight','lantern-glow','antenna-tip']:o.data.materials[0]['glow']=True
        return o
    for start,end,name,pivot in old.groups:
        covered.update(range(start,end));side='L' if pivot[0]>0 else 'R'
        if name=='wheel':
            side=('F' if pivot[2]>0 else 'R')+side
            vs=np.vstack([raw[i][1] for i in range(start,end) if raw[i][0]=='tire']);r=(vs[:,1].max()-vs[:,1].min())/2;width=vs[:,0].max()-vs[:,0].min()
            o=wheel_surface('wheel_'+side,pivot,r,width);add_group([o],'wheel_'+side,pivot)
        else:
            obs=[convert(i) for i in range(start,end)];add_group(obs,'wing_'+side,pivot)
    paint=[];fixed=[];skis={'L':[],'R':[]};springs=[];antenna=[];steer=[];belt=[]
    for i,(name,v,f,c) in enumerate(raw):
        if i in covered or name=='hub-bolt':continue
        o=convert(i)
        if name=='paint':paint.append(o)
        elif name in ['ski','ski-curved-tip']:skis['L' if v[:,0].mean()>0 else 'R'].append(o)
        elif name=='coil-spring':springs.append((o,v))
        elif name in ['antenna','antenna-tip']:antenna.append(o)
        elif name=='handlebar':steer.append(o)
        elif name in ['rubber-track','track-cleat','track-roller']:belt.append(o)
        else:fixed.append(o)
    if id=='kart':fixed.append(tube('roll_hoop',[(-.48,.5,-.7),(-.48,1.05,-.7),(.48,1.05,-.7),(.48,.5,-.7)],.035,'#4c5a69',16))
    for side,obs in skis.items():add_group(obs,'ski_'+side,(.51 if side=='L' else -.51,.08,.55))
    for ob,v in springs:
        side=('F' if v[:,2].mean()>0 else 'R')+('L' if v[:,0].mean()>0 else 'R');add_group([ob],'spring_'+side,(v[:,0].mean(),v[:,1].min(),v[:,2].mean()))
    add_group(antenna,'antenna',(.45,.6,-.87));add_group(steer,'steer',(0,.77,.18));add_group(belt,'track',(0,.21,-.6),'belt')
    add_group(paint,'body_paint',(0,0,0),'paint');add_group(fixed,'body_details',(0,0,0))
    combined=join(objects,id+'_packed');origin(combined,(0,0,0))
    # Smooth non-hard surfaces using their existing silhouette; add subdivisions to reach the detail tier.
    tri=sum(len(p.vertices)-2 for p in combined.data.polygons)
    if tri<5000:
        select([combined]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.subdivide(number_cuts=1,smoothness=.12);bpy.ops.object.mode_set(mode='OBJECT')
    if id=='snowmobile':
        select([combined]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='DESELECT');bpy.ops.object.mode_set(mode='OBJECT')
        bpy.context.tool_settings.mesh_select_mode=(False,False,True)
        for p in combined.data.polygons:p.select='neutral_paint' in combined.data.materials[p.material_index].name
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.subdivide(number_cuts=1,smoothness=.18);bpy.ops.object.mode_set(mode='OBJECT')
    tri=sum(len(p.vertices)-2 for p in combined.data.polygons)
    if tri>8700:
        mod=combined.modifiers.new('budget','DECIMATE');mod.ratio=8500/tri;select([combined]);bpy.ops.object.modifier_apply(modifier=mod.name)
    coords=np.array([v.co[:] for v in combined.data.vertices]);lo=coords.min(0);hi=coords.max(0)
    # Model units are meters, preserving the wider moth wing exception.
    scale=np.array([1.6/(hi[0]-lo[0]),1,2.6/(hi[2]-lo[2])]);scale[1]=scale[2]
    if id=='glider':scale[0]=1
    contact_center_z=np.mean([p[2] for start,end,name,p in old.groups if name=='wheel']) if any(name=='wheel' for start,end,name,p in old.groups) else (hi[2]+lo[2])/2
    shift=np.array([0,lo[1],contact_center_z])
    for v in combined.data.vertices:v.co=Vector((np.array(v.co)-shift)*scale)
    groupinfo=[(i,n,(p-shift)*scale,m) for i,n,p,m in groupinfo]
    main=painted_atlas(combined,id,1024,'metal',main_name=id+'_main')
    paintmat=main.copy();paintmat.name='paint'
    # The paint material shares the packed atlas; only its islands contain gray pixels.
    material_for={i:paintmat if m=='paint' else main for i,n,p,m in groupinfo}
    if belt:
        beltmat=main.copy();beltmat.name='belt'
        for i,n,p,m in groupinfo:
            if m=='belt':material_for[i]=beltmat
    parts=split_parts(combined,[(i,n,p) for i,n,p,m in groupinfo],material_for)
    body=empty('body',(0,.55*scale[1],0))
    for o in parts:
        pos=o.location.copy()
        if o.name.startswith('wheel_'):
            if o.name.startswith('wheel_F'):
                steer_node=empty('steer_'+o.name[6:],pos);o.parent=steer_node;o.location=(0,0,0)
        else:o.parent=body;o.location=pos-body.location
    def mark(n,p):return empty(n,(np.array(p)-shift)*scale-body.location,body)
    mark('seat',old.seat);mark('headlight_L',(.3,.65,1.05));mark('headlight_R',(-.3,.65,1.05))
    if id=='tractor':mark('exhaust',(.37,1.7,.65))
    else:
        mark('dust_L',(.5,.1,-1.1));mark('dust_R',(-.5,.1,-1.1))
    export(id,'vehicles')

def carpet():
    id='carpet';verts=[];faces=[];nx=32;nz=48
    for j in range(nz+1):
        z=-1.3+2.6*j/nz
        for i in range(nx+1):x=-.8+1.6*i/nx;verts.append((x,.035,z))
    for j in range(nz):
        for i in range(nx):a=j*(nx+1)+i;faces.append((a,a+nx+1,a+nx+2,a+1))
    rug=mesh('carpet_surface',verts,faces,'#e0d8ec')
    mod=rug.modifiers.new('cloth_thickness','SOLIDIFY');mod.thickness=.035;select([rug]);bpy.ops.object.modifier_apply(modifier=mod.name)
    painted_atlas(rug,id,1024,'carpet',main_name='carpet_main');rug.data.materials[0].use_backface_culling=False
    # A slim neutral central fabric panel provides the driver's tint without recoloring the pattern.
    inset=box('paint_panel',(0,.058,-.27),(.6,.008,.55),'#e3e3e3',.015);painted_atlas(inset,id+'_paint',1024,'paint',main_name='paint',gray=True)
    bones=[('root',(0,0,0),(0,.05,0),None)]
    for i in range(1,6):z=-1.3+(i-1)*.52;bones.append(('carpet_'+str(i),(0,.03,z),(0,.03,z+.52),'root' if i==1 else 'carpet_'+str(i-1)))
    rig=add_rig(bones);bind(rug,rig);bind(inset,rig,'carpet_3')
    for sign,side in [(1,'L'),(-1,'R')]:
        for z,fb in [(1.25,'F'),(-1.25,'R')]:
            pts=[(sign*.73,.025,z),(sign*.76,.02,z+(.1 if z>0 else -.1))]
            tassel=tube('tassel_'+fb+side,pts,.025,'#efd37c',12);painted_atlas(tassel,'carpet_fringe_'+fb+side,256,main_name='carpet_alpha');tassel.data.materials[0].use_backface_culling=False
            bind(tassel,rig,'carpet_5' if z>0 else 'carpet_1')
    empty('seat',(0,.07,-.2),rig);empty('body',(0,0,0),rig);empty('headlight_L',(.6,.04,1),rig);empty('headlight_R',(-.6,.04,1),rig)
    clips(rig,['ripple']);export(id,'vehicles')

WORLDS={
 'gear': ['building_a','building_b','building_c','building_d','crate_a','crate_b','fence_metal','street_lamp','pipe_bend','gear_small','barrel','robot_tree'],
 'frosty':['tree_pine_a','tree_pine_b','tree_pine_c','rock_snow_a','rock_snow_b','rock_snow_c','ice_rock_a','ice_rock_b','cliff_snow','snowdrift','igloo'],
 'bouncy':['tree_round_a','tree_round_b','tree_round_c','bush_a','bush_b','flower_patch','fence_wood','hedge','mushroom_bouncy','windmill_small'],
 'starry':['tree_crooked_a','tree_crooked_b','tree_crooked_c','mushroom_glow_a','mushroom_glow_b','mushroom_glow_c','hedge_dark','firefly_jar','log','fern'],
 'lava':['rock_volcanic_a','rock_volcanic_b','rock_volcanic_c','tree_dead_a','tree_dead_b','lava_crack','bones_silly','steam_vent'],
 'tower':['wall_stone','wall_stone_corner','crystal_a','crystal_b','crystal_c','banner','torch_stand','book_pile'],
 'gecko':['tree_lush_a','tree_lush_b','flower_a','flower_b','flower_c','gecko_house','picnic_blanket'],
 'everywhere':['grass_tuft_a','grass_tuft_b','pebble']}
PALETTES={
 'gear':['#697f9b','#b5c2cd','#dbba62','#54496e','#394251','#819874','#e8d9a2','#8d604c'],
 'frosty':['#94775d','#355b66','#eef7fc','#accfe6','#79b3d3','#e5d9bb','#476c81','#b8d0dd'],
 'bouncy':['#8c633c','#66b76e','#94d379','#f2b26a','#e77ca5','#eadc9f','#ac78b7','#c8a783'],
 'starry':['#665274','#334f58','#527376','#ad96ce','#79d6ce','#e6d5a7','#8995c4','#394255'],
 'lava':['#594b52','#8f5a4f','#b97b4d','#efbf79','#3d3947','#e68442','#b49a82','#75616b'],
 'tower':['#786d94','#b8abd1','#b48bd8','#e0c46f','#5c4c7a','#8ebed2','#d9c4a7','#745781'],
 'gecko':['#9c7048','#64c878','#98d585','#f2ca73','#eaa9c8','#e8d6b8','#88c6c6','#d4a576'],
 'everywhere':['#5cae68','#8bc77b','#bfce8d','#9c9985','#797d83','#b2afa5','#65756d','#8d9a8a']}

def alpha_material(name,style='web',size=512):
    yy,xx=np.mgrid[0:size,0:size];u=(xx+.5)/size;v=(yy+.5)/size
    if style=='web':
        r=np.sqrt(u*u+v*v);theta=np.arctan2(v,u);mask=(abs(np.sin(theta*12))<.07)|(abs(np.sin(r*P*10))<.1);col=(.9,.9,.97)
    elif style=='grass':mask=(v<(.2+.75*np.sin(u*P*5)**2))&(abs(np.sin(u*P*5))>.25);col=(.5,.85,.45)
    else:mask=((u-.5)/.45)**2+((v-.5)/.48)**2<1;col=(.55,.8,.48)
    tex=np.ones((size,size,4),np.float32);tex[:,:,:3]=col;tex[:,:,3]=mask
    image=bpy.data.images.new(name+'_atlas',width=size,height=size,alpha=True);image.pixels.foreach_set(tex.ravel());image.pack()
    m=mat(name,'#ffffff');p=m.node_tree.nodes['Principled BSDF'];n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=image;m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color']);m.node_tree.links.new(n.outputs['Alpha'],p.inputs['Alpha']);m.surface_render_method='DITHERED';m.use_backface_culling=False
    return m
def card(name,p,size,material):
    x,y,z=p;w,h=size;o=mesh(name,[(x,y,z),(x+w,y,z),(x+w,y+h,z),(x,y+h,z)],[(0,1,2,3)],'#ffffff');o.data.materials.clear();o.data.materials.append(material)
    uv=o.data.uv_layers.new(name='UVMap')
    for i,c in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[i].uv=c
    return o
def shared_atlas(o,world,alpha=False):
    palette=[color(c) for c in PALETTES[world]];size=1024;tile=256;tex=np.ones((size,size,4),np.float32)
    yy,xx=np.mgrid[0:tile,0:tile];u=xx/tile;v=yy/tile
    for i in range(16):
        c=np.array(palette[i%8]);noise=.9+.06*np.sin(u*P*8+np.sin(v*P*2))+.035*np.cos(v*P*6);base=c[None,None,:]*noise[:,:,None]
        if world=='gear':
            line=(xx%64<3)|(yy%64<3);base[line]*=.65
            if i%8 in [0,3]:
                windows=(xx%64>16)&(xx%64<43)&(yy%64>17)&(yy%64<48);base[windows]=color('#d6d8ad')
        if world=='tower':base[(yy%64<3)|((xx+(yy//64%2)*32)%64<3)]*=.72
        if world=='frosty':base=np.clip(base+.035*np.sin(u*19+v*7)[:,:,None],0,1)
        x=(i%4)*tile;y=(i//4)*tile;tex[y:y+tile,x:x+tile,:3]=base
    name=world+'_props'+('_alpha' if alpha else '')
    grass_color={'gear':'#8ca779','frosty':'#b3d1cc','bouncy':'#8bc778','starry':'#426868','lava':'#8c7968','tower':'#8d859e','gecko':'#85c975','everywhere':'#6cb976'}[world]
    tex[768:1024,768:1024,:3]=np.array(color(grass_color))*(.85+.15*v[:,:,None])
    tex[768:1024,768:1024,3]=(v<(.15+.8*np.sin(u*P*5)**2)).astype(float)
    image=bpy.data.images.get(world+'_props_atlas')
    if not image:image=bpy.data.images.new(world+'_props_atlas',width=size,height=size,alpha=True);image.pixels.foreach_set(tex.ravel());image.pack()
    m=mat(name,'#ffffff',metal=.7 if world=='gear' else 0,rough=.4 if world=='gear' else .7)
    if not any(n.type=='TEX_IMAGE' for n in m.node_tree.nodes):
        n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=image;m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
        if alpha:m.node_tree.links.new(n.outputs['Alpha'],m.node_tree.nodes['Principled BSDF'].inputs['Alpha']);m.surface_render_method='DITHERED'
        if world in ['gear','starry','tower']:
            em=np.zeros((256,256,4),np.float32);em[:,:,3]=1
            for idx in ([6] if world=='gear' else [3,4,5] if world=='starry' else [2,5]):em[(idx//4)*64:(idx//4+1)*64,(idx%4)*64:(idx%4+1)*64,:3]=palette[idx]
            image_em=bpy.data.images.get(world+'_props_emissive')
            if not image_em:image_em=bpy.data.images.new(world+'_props_emissive',width=256,height=256,alpha=False);image_em.pixels.foreach_set(em.ravel());image_em.pack()
            en=m.node_tree.nodes.new('ShaderNodeTexImage');en.image=image_em;m.node_tree.links.new(en.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Emission Color']);m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=1
    select([o]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.05,island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
    src=[np.array(x.diffuse_color[:3]) for x in o.data.materials];attr=o.data.color_attributes.get('paint_color');uv=o.data.uv_layers.active
    for p in o.data.polygons:
        c=np.mean([attr.data[i].color[:3] for i in p.vertices],0) if attr else src[p.material_index]
        idx=int(np.argmin([np.linalg.norm(c-x) for x in palette]));offset=np.array([idx%4,idx//4])/4
        for i in p.loop_indices:uv.data[i].uv=np.array(uv.data[i].uv[:])*.24+offset+.005
    o.data.materials.clear();o.data.materials.append(m)
    for p in o.data.polygons:p.material_index=0
    if attr:o.data.color_attributes.remove(attr)
    return m

def lod_collision(o,ratio=.3,colsize=None,root=None):
    o.name='lod0';o.data.name='lod0_mesh'
    low=o.copy();low.data=o.data.copy();bpy.context.collection.objects.link(low);low.name='lod1';low.data.name='lod1_mesh'
    mod=low.modifiers.new('distance_silhouette','DECIMATE');mod.ratio=ratio;select([low]);bpy.ops.object.modifier_apply(modifier=mod.name)
    if root is None:root=empty('root')
    o.parent=root;low.parent=root
    if colsize:
        x,y,z=colsize;collision=box('col',(0,y/2,0),(x,y,z),'#888888',0);shared=o.data.materials[0];collision.data.materials.clear();collision.data.materials.append(shared)
        layer=collision.data.uv_layers.active or collision.data.uv_layers.new(name='UVMap');collision.parent=root
    return root
def remove_bottom(o):
    import bmesh
    bm=bmesh.new();bm.from_mesh(o.data);bm.normal_update();miny=min(v.co.y for v in bm.verts)
    faces=[f for f in bm.faces if f.normal.y<-.8 and all(v.co.y<miny+.04 for v in f.verts)]
    bmesh.ops.delete(bm,geom=faces,context='FACES');bm.to_mesh(o.data);bm.free()

def scenery(world,id):
    reset();pal=PALETTES[world];forms=[];lod=False;target=400;markers=[];modular=False
    def s(n,p,size,c=1,seg=24,rings=14):o=sphere(n,p,size,pal[c%8],seg,rings);forms.append(o);return o
    def b(n,p,size,c=0):o=box(n,p,size,pal[c%8]);forms.append(o);return o
    def t(n,pts,r,c=0,seg=12):o=tube(n,pts,r,pal[c%8],seg);forms.append(o);return o
    variant=ord(id[-1])-ord('a') if id[-1] in 'abcd' else 0;seed=variant+1
    is_tree=id.startswith('tree_') or id=='robot_tree'
    if is_tree:
        h=4+variant*.5;target=1400 if world!='lava' else 800;lod=True
        t('trunk',[(0,0,0),(.1,.9,0),(-.15,1.9,0),(.12,2.9,0),(0,h,0)],np.linspace(.23,.08,5),0,16)
        for sign in [-1,1]:t('branch',[(0,1.6,0),(sign*.65,2.5,.1),(sign*.9,3,.1)], [.12,.08,.025],0)
        if 'dead' not in id:
            if 'pine' in id:
                for j in range(3):
                    y=1.5+j*.85;t('pine_crown',[(0,y,0),(0,y+1.8,0)],[1.25-j*.2,.01],1,32)
                    s('snow_cap',(0,y+1.2,0),(.65-j*.1,.35,.65-j*.1),2)
            elif id=='robot_tree':
                for x,y,z in [(-.7,2.8,0),(.6,3.2,0),(0,4,0)]:t('gear_crown',[(x,y,z-.15),(x,y,z+.15)],.55,2,24)
            else:
                for x,y,z in [(-.7,2.9,0),(.65,3.25,.2),(0,3.8,-.1)]:s('canopy',(x,y,z),(1,1.1,1),1 if variant%2==0 else 2)
    elif id.startswith('building') or id=='gecko_house':
        h=8+variant*2 if id!='gecko_house' else 4;target=2500;lod=True;modular=True
        b('walls',(2,h/2,-2),(4,h,4),variant%4);b('roof',(2,h+.15,-2),(4.2,.3,4.2),3)
        for x in [1,3]:b('roof_vent',(x,h+.5,-2),(1,.8,1),1)
    elif id.startswith('rock') or id in ['pebble','ice_rock_a','ice_rock_b','snowdrift','cliff_snow']:
        target=20 if id=='pebble' else 150 if id=='snowdrift' else 2500 if id=='cliff_snow' else 500
        lod=target>500
        scale=(5,3,1.8) if id=='cliff_snow' else (1+.1*seed,.8+.1*variant,.85)
        s('rock',(0,scale[1]*.7,0),scale,3 if world=='frosty' else 0,24,14)
        if id.startswith('rock_snow'):s('snow',(0,1.2,0),(.8,.25,.75),2)
    elif id.startswith('bush') or id.startswith('hedge'):
        target=300;b('hedge',(0,.6,0),(2,1.2,.8),1)
    elif id.startswith('mushroom'):
        target=500;t('stem',[(0,0,0),(.08,.7,0)],.16,5,16);s('cap',(0,.85,0),(.7,.35,.6),3,32,16)
    elif id.startswith('flower'):
        target=60
        for j in range(3 if id=='flower_patch' else 1):
            x=(j-1)*.3;t('stem',[(x,0,0),(x,.45,0)],.015,1,6)
            for a in np.linspace(0,2*P,6)[:-1]:s('petal',(x+.1*math.cos(a),.45,.1*math.sin(a)),(.09,.025,.07),3+variant,8,4)
    elif id.startswith('fence') or id.startswith('wall_stone'):
        target=300 if id.startswith('wall') else 150;modular=True
        if id.startswith('wall'):b('wall',(1,1,-.15),(2,2,.3),0)
        else:
            for x in [0,1,2]:b('post',(x,.6,0),(.12,1.2,.12),0)
            for y in [.4,.9]:b('rail',(1,y,0),(2,.08,.08),0)
        if 'corner' in id:b('return',(.15,1,-1),(.3,2,2),0)
    elif id.startswith('crate') or id=='book_pile':
        target=400 if id=='book_pile' else 200
        if id=='book_pile':
            for j in range(4):b('book',(0,.1+j*.18,0),(1-.1*(j%2),.16,.7),j)
        else:b('crate',(0,.5,0),(1,1,1),7)
    elif id in ['barrel','firefly_jar','steam_vent','torch_stand','street_lamp']:
        target=400 if id=='street_lamp' else 300;h=4 if id=='street_lamp' else 1.8 if id=='torch_stand' else 1
        t('stem',[(0,0,0),(0,h,0)],.3 if id=='barrel' else .08,0,24)
        if id in ['street_lamp','torch_stand','firefly_jar']:s('lamp',(0,h,0),(.32,.4,.32),6 if world=='gear' else 5,20,12)
        if id in ['steam_vent','torch_stand']:markers.append(('steam' if id=='steam_vent' else 'flame',(0,h+.1,0)))
    elif id=='pipe_bend':
        target=300;t('pipe',[(0,0,0),(0,.8,0),(.2,1,0),(.9,1,0)],.2,1,16)
    elif id=='gear_small':
        target=400;t('gear',[(0,.6,-.12),(0,.6,.12)],.55,2,24)
        for a in np.linspace(0,2*P,13)[:-1]:b('tooth',(.54*math.cos(a),.6+.54*math.sin(a),0),(.18,.18,.24),2)
    elif id=='igloo':
        target=1500;lod=True;s('dome',(0,1,0),(2,1.8,2),2);b('entry',(0,.6,1.8),(1.3,1.2,1.2),2)
    elif id=='windmill_small':
        target=1500;lod=True;t('tower',[(0,0,0),(0,3,0)],[.7,.35],5,24)
        for sign in [-1,1]:b('blade',(sign*.8,2.6,.5),(1.5,.2,.1),7);b('blade',(0,2.6+sign*.8,.5),(.2,1.5,.1),7)
    elif id=='log':
        target=300;t('log',[(-1,.35,0),(1,.35,0)],.35,0,16)
    elif id=='fern':
        target=150;t('frond',[(0,0,0),(0,1,0)],.025,1)
        for j in range(6):
            for sign in [-1,1]:t('leaf',[(0,.15+j*.13,0),(sign*(.45-j*.045),.25+j*.13,0)],[.06,.005],1,6)
    elif id.startswith('crystal'):
        target=400;t('crystal',[(0,0,0),(0,1.4,0),(.08,1.9,0)],[.4,.25,.005],2,8)
    elif id=='banner':target=300;b('banner',(0,1,0),(1.2,2,.03),4)
    elif id=='bones_silly':
        target=300;t('fish_spine',[(-.8,.15,0),(.8,.15,0)],.04,3)
        for x in np.linspace(-.5,.5,5):t('rib',[(x,.15,-.3),(x,.15,0),(x,.15,.3)],.035,3,8)
    elif id=='lava_crack':
        target=100;b('crack',(0,.015,0),(2,.03,1),5)
    elif id=='picnic_blanket':target=100;b('blanket',(0,.015,0),(2,.03,2),4)
    elif id.startswith('grass_tuft'):
        material=mat('grass_source','#9bce75');pieces=[]
        for side in range(2):
            verts=[];faces=[]
            for j in range(6):
                y=j*.14;bend=.04*math.sin(j*.4)
                for x in [-.35,.35]:verts.append((x+bend,y,0) if side==0 else (0,y,x+bend))
            for j in range(5):a=j*2;faces.append((a,a+1,a+3,a+2))
            ob=mesh('grass_strip',verts,faces,'#9bce75');pieces.append(ob)
        o=join(pieces,'lod0');shared_atlas(o,world,True)
        for p in o.data.polygons:
            for li,vi in zip(p.loop_indices,p.vertices):
                point=o.data.vertices[vi].co;u=(point.x if p.index<5 else point.z)+.35;v=point.y/.7
                o.data.uv_layers.active.data[li].uv=(.75+.24*u/.7,.75+.24*v)
        export(id,'scenery/'+world);return
    else:raise ValueError(id)
    # Union before decimation removes faces buried inside overlapping sculpt pieces.
    o=joined_skin(forms,id,target,voxel=.06 if target>=800 else .09)
    coords=np.array([v.co[:] for v in o.data.vertices]);miny=coords[:,1].min()
    for v in o.data.vertices:v.co.y-=miny
    if modular:
        mn=np.array([v.co[:] for v in o.data.vertices]).min(0);front=max(v.co.z for v in o.data.vertices)
        for v in o.data.vertices:v.co.x-=mn[0];v.co.z-=front
    shared_atlas(o,world);remove_bottom(o)
    if id=='lava_crack':o.data.materials[0].name='lava'
    if is_tree or id=='fern':
        alpha=o.data.materials[0].copy();alpha.name=world+'_props_alpha';alpha.use_backface_culling=False;o.data.materials.append(alpha)
        # Foliage uses the shared alpha slot, preserving one opaque trunk material.
        for p in o.data.polygons:
            if p.center.y>(.2 if id=='fern' else 2.5):p.material_index=1
    if lod or target>500:
        size=o.dimensions[:];root=lod_collision(o,.3,(min(size[0],.6) if is_tree else size[0],min(size[1],3) if is_tree else size[1],min(size[2],.6) if is_tree else size[2]))
    else:
        root=empty('root');o.parent=root;o.name='lod0'
        if not id.startswith('flower') and id not in ['picnic_blanket','lava_crack']:
            size=o.dimensions[:];col=box('col',(0,size[1]/2,0),size,'#888888',0);col.data.materials.clear();col.data.materials.append(o.data.materials[0]);col.parent=root
    for n,p in markers:empty(n,p,root)
    if modular and bpy.data.objects.get('col'):
        coords=np.array([v.co[:] for v in o.data.vertices]);center=(coords.min(0)+coords.max(0))/2;bpy.data.objects['col'].location=center
    export(id,'scenery/'+world)

def house(world):
    reset();id='house_'+world;pal=PALETTES[world];height=16 if world=='tower' else 10
    forms=[]
    # A real doorway opening, with no wall buried behind the hinged door.
    wall_color=pal[0] if world=='frosty' else pal[4] if world in ['lava','tower'] else pal[5] if world=='bouncy' else pal[3]
    for p,size in [((-2.25,3,0),(2.5,6,7)),((2.25,3,0),(2.5,6,7)),((0,4.5,0),(2,3,7)),((0,1.5,-.3),(2,3,6.4))]:forms.append(box('walls',p,size,wall_color,.15))
    roof=mesh('crooked_roof',[(-3.8,6,-3.8),(3.8,6,-3.8),(-3.8,6,3.8),(3.8,6,3.8),(-.6,height,-.3)],[(0,1,4),(1,3,4),(3,2,4),(2,0,4),(0,2,3,1)],pal[4] if world in ['bouncy','lava'] else pal[0]);forms.append(roof)
    forms.append(tube('chimney',[(2.1,6,-1.7),(2.4,8.7,-1.8)],[.42,.36],pal[7],16))
    if world=='frosty':
        forms.append(sphere('snow_roof',(0,7.1,0),(3.5,.6,3.4),pal[2]))
        for x in np.linspace(-3.2,3.2,9):forms.append(tube('icicle',[(x,6.1,3.62),(x,5.35+.2*math.cos(x),3.62)],[.13,.008],pal[2],12))
    if world=='bouncy':
        for o in forms:o.location.y+=1
        for x in [-2.6,2.6]:
            for z in [-2.6,2.6]:forms.append(tube('house_spring',[(x+.35*math.cos(a),.08+a/(6*P),z+.35*math.sin(a)) for a in np.linspace(0,6*P,97)],.08,pal[6],10))
    if world=='starry':
        for old in forms:bpy.data.objects.remove(old,do_unlink=True)
        trunk=tube('hollow_stump',[(0,0,0),(0,6,0),(0,8.6,0)],[3.5,3.3,3.5],pal[0],64)
        inside=tube('hollow_cut',[(0,.35,0),(0,10,0)],2.7,pal[0],64)
        doorway=box('door_cut',(0,1.5,3.25),(2.1,3.1,2),'#444444',.03)
        for cutter in [inside,doorway]:
            mod=trunk.modifiers.new('hollow_interior','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;select([trunk]);bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
        forms=[trunk]
        for x,z in [(-2.5,-1),(2.1,-1.4),(-1.7,2.1)]:forms.append(tube('stump_branch',[(x,7.8,z),(x*1.2,9.6,z*1.2)],[.5,.3],pal[0],20))
    o=joined_skin(forms,id,7900,voxel=.13)
    min_y=min(v.co.y for v in o.data.vertices)
    if min_y<0:
        for v in o.data.vertices:v.co.y-=min_y
    remove_bottom(o)
    door_y=1 if world=='bouncy' else 0
    door=box('door',(0,1.5+door_y,3.51),(1.9,3,.15),pal[7],.1)
    parts=pack_groups([([o],'house_shell',(0,0,0),'main'),([door],'door',(-.95,door_y,3.51),'main')],id,1024,'house_'+world)
    o=parts['house_shell'];door=parts['door'];root=lod_collision(o,.25,(7,6,7));door.parent=root
    webmat=alpha_material(id+'_alpha');web=card('cobweb',(-3.1,4.6,3.58),(1.5,1.4),webmat);web.parent=root
    empty('door_spot',(0,0,5.11),root);empty('sign',(0,3.5,3.6),root);empty('roof_peek',(-.6,height-.3,-.3),root)
    export(id,'houses')

def landmark(id):
    reset();forms=[];special=[]
    def add(o):forms.append(o);return o
    if id=='landmark_gear':
        add(box('tower',(0,6,0),(2.4,12,2.4),'#8296af',.15));add(tube('mast',[(0,10,0),(0,16,0)],.4,'#a6b7c9',24))
        gear=[]
        gear.append(tube('disc',[(0,14,-.3),(0,14,.3)],3.2,'#e2b85b',64))
        for a in np.linspace(0,2*P,21)[:-1]:gear.append(box('tooth',(3.35*math.cos(a),14+3.35*math.sin(a),0),(.8,.8,.6),'#e2b85b',.1))
        special=[(gear,'gear',(0,14,0))];col=(2.4,12,2.4)
    elif id=='landmark_crystal':
        add(tube('spire',[(0,0,0),(0,9,0),(.4,14,0)],[2.2,1.8,.01],'#9adaee',8))
        for sign in [-1,1]:add(tube('shard',[(sign*1.5,0,0),(sign*2.2,6,0),(sign*2.4,8,0)],[.9,.7,.01],'#b0e4ef',8))
        col=(4,9,4)
    elif id=='landmark_yoyo':
        add(tube('pole',[(0,0,0),(0,22,0)],.5,'#a47b54',24));add(tube('crossbar',[(-3,21,0),(3,21,0)],.25,'#a47b54',16));add(tube('string',[(2,21,0),(2,16,0)],.04,'#f1e6c5',8))
        special=[([sphere('disc',(2,15,0),(2,2,.5),'#ed86bd',48,32)],'yoyo',(2,15,0))];col=(1,22,1)
    else:
        # Open crater has a thick sloping outside and inside rim; no buried cap.
        verts=[];faces=[];outline=[(12,0),(10,5),(7,12),(4,18),(3,17),(2.7,15)]
        rings=[]
        for i in range(len(outline)-1):
            for u in np.linspace(0,1,5,endpoint=False):rings.append(tuple(np.array(outline[i])*(1-u)+np.array(outline[i+1])*u))
        rings.append(outline[-1]);segments=128
        for r,y in rings:
            for j in range(segments):a=2*P*j/segments;verts.append((r*math.cos(a),y+.3*math.sin(a*3),r*math.sin(a)))
        for i in range(len(rings)-1):
            for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,b,b+segments,a+segments))
        add(mesh('volcano',verts,faces,'#74606b'));special=[([tube('lava_crater',[(0,15,0),(0,15.03,0)],2.7,'#ff923e',64)],'crater',(0,15,0))];col=(20,12,20)
    o=join(forms,id) if id=='landmark_volcano' else joined_skin(forms,id,5200,voxel=.22)
    if id=='landmark_volcano':
        for v in o.data.vertices:
            if v.co.y<0:v.co.y=0
    packing=[([o],'landmark_shell',(0,0,0),'main')]
    for obs,n,p in special:
        part=joined_skin(obs,n,1800,voxel=.08) if len(obs)>1 else join(obs,n)
        packing.append(([part],n,p,'lava' if n=='crater' else 'main'))
    parts=pack_groups(packing,id,1024,'stone' if 'volcano' in id else 'metal');o=parts.pop('landmark_shell');remove_bottom(o);root=lod_collision(o,.28,col)
    for part in parts.values():part.parent=root
    if id=='landmark_volcano':empty('smoke',(0,18,0),root)
    export(id,'landmarks')

def ring(name,p,r,t,c,axis='Y',segments=48,cross=12):
    verts=[];faces=[]
    for i in range(segments):
        a=2*P*i/segments
        for j in range(cross):
            b=2*P*j/cross;rr=r+t*math.cos(b)
            point=(rr*math.cos(a),t*math.sin(b),rr*math.sin(a)) if axis=='Y' else (rr*math.cos(a),rr*math.sin(a),t*math.sin(b))
            verts.append(tuple(Vector(p)+Vector(point)))
    for i in range(segments):
        for j in range(cross):faces.append((i*cross+j,((i+1)%segments)*cross+j,((i+1)%segments)*cross+(j+1)%cross,i*cross+(j+1)%cross))
    return mesh(name,verts,faces,c)
def star(name,p,r,depth,c,points=5):
    verts=[];faces=[]
    for z in [-depth/2,depth/2]:
        for i in range(points*2):a=P/2+i*P/points;rr=r if i%2==0 else r*.45;verts.append((p[0]+rr*math.cos(a),p[1]+rr*math.sin(a),p[2]+z))
    count=points*2;verts.extend([(p[0],p[1],p[2]-depth/2),(p[0],p[1],p[2]+depth/2)])
    for i in range(count):j=(i+1)%count;faces.extend([(i,j,j+count,i+count),(count*2,j,i),(count*2+1,i+count,j+count)])
    o=mesh(name,verts,faces,c);mod=o.modifiers.new('soft_edges','BEVEL');mod.width=r*.045;mod.segments=3;select([o]);bpy.ops.object.modifier_apply(modifier=mod.name);return o

PIECES=['button','gate','drawbridge_leaf','stepping_stone','spring_pad','teleport_pad','portal','star_pickup','conveyor','gear_roller','boulder']
ROOMS=['room_wall_lava','room_wall_ice','room_wall_lever','room_wall_mirror','room_floor_stone','room_floor_ice','room_floor_wood','room_floor_magic','room_torch','cobweb_corner','hex_stone','ice_rock','snowflake_pickup','lever','mirror_stand','crystal_target','beam_emitter','candle_big']
ITEMS=['item_key','item_boots','item_string','item_hat','item_scale','item_map']
def setpiece(id,category):
    reset();groups=[];markers=[]
    def g(parts,name,p=(0,0,0),material='main'):groups.append((parts,name,p,material))
    if id=='button':
        g([tube('base',[(0,0,0),(0,.3,0)],2.2,'#f4cf59',48)],'button_base')
        dome=sphere('dome',(0,.3,0),(1.8,.5,1.8),'#e95b56',48,24)
        for v in dome.data.vertices:
            if v.co.y<0:v.co.y=0
        g([dome],'cap',(0,.3,0))
    elif id=='gate':
        frame=[box('post',(x,1.5,0),(.4,3,1),'#74859c',.09) for x in [-2.8,2.8]];frame.append(box('lintel',(0,2.8,0),(6,.4,1),'#74859c',.1));g(frame,'gate_frame')
        bars=[tube('bar',[(x,0,0),(x,2.7,0)],.08,'#c1bacb',16) for x in np.linspace(-2.4,2.4,9)];g(bars,'gate_bars')
    elif id=='drawbridge_leaf':
        g([box('deck',(0,.12,1.75),(6,.24,3.5),'#b98e68',.08)],'drawbridge_leaf')
    elif id in ['stepping_stone','hex_stone']:
        g([tube('stone',[(0,-.35,0),(0,0,0)],[.93,1],'#746b85',6 if id=='hex_stone' else 32)],'stone_base')
        if id=='hex_stone':g([tube('lit_top',[(0,.002,0),(0,.01,0)],.94,'#c4aee2',6)],'stone_top',(0,0,0),'hex_top')
    elif id=='spring_pad':
        g([tube('base',[(0,0,0),(0,.2,0)],2,'#776d9d',48)],'pad_base')
        coil=tube('coil',[(.8*math.cos(a),.2+a/(8*P)*.9,.8*math.sin(a)) for a in np.linspace(0,8*P,161)],.1,'#eac45f',12);g([coil],'spring',(0,.2,0))
        arrow=mesh('arrow',[(-.18,1.2,-.7),(.18,1.2,-.7),(.18,1.2,.1),(.5,1.2,.1),(0,1.2,.8),(-.5,1.2,.1),(-.18,1.2,.1)],[(0,6,2,1),(6,5,4,3,2)],'#f9df84');g([arrow],'arrow',(0,1.2,0))
    elif id in ['teleport_pad','portal']:
        if id=='teleport_pad':
            g([tube('base',[(0,0,0),(0,.15,0)],1.6,'#71658e',48)],'pad_base');g([ring('ring',(0,.2,0),1.35,.12,'#b4e5e0')],'pad_ring',(0,.2,0),'pad_glow');g([tube('disc',[(0,.16,0),(0,.17,0)],1.2,'#b49fe4',48)],'swirl_disc',(0,.17,0),'swirl')
        else:
            g([ring('ring',(0,2.5,0),2.2,.3,'#8f7eae','Z',64,16)],'portal_ring');g([tube('disc',[(0,2.5,-.02),(0,2.5,.02)],1.95,'#91d4e3',64)],'portal_disc',(0,2.5,0),'swirl')
    elif id=='star_pickup':g([star('star',(0,.6,0),.63,.2,'#f6d274')],'star')
    elif id=='conveyor':
        g([box('rail',(x,.2,0),(.2,.4,4),'#8d9db2') for x in [-1.9,1.9]],'rails');g([box('belt',(0,.18,0),(3.6,.2,4),'#707b8e')],'belt_surface',(0,0,0),'belt')
    elif id=='gear_roller':
        gear=[tube('gear',[(0,1.8,-.25),(0,1.8,.25)],1.5,'#d4b26b',64)]
        for a in np.linspace(0,2*P,21)[:-1]:gear.append(box('tooth',(1.55*math.cos(a),1.8+1.55*math.sin(a),0),(.42,.42,.5),'#d4b26b',.06))
        g(gear,'gear_roller',(0,1.8,0))
    elif id in ['boulder','ice_rock']:
        r=1.6 if id=='boulder' else .9;g([sphere('stone',(0,r,0),(r,r,r),'#8e8398' if id=='boulder' else '#a3d6ed',32,20)],id)
    elif id.startswith('room_wall'):
        g([box('wall',(1,2,-.12),(2,4,.24),'#6d587f' if not id.endswith('ice') else '#9fc8e2',.025)],'room_wall')
    elif id.startswith('room_floor'):
        c={'stone':'#8e829e','ice':'#c2e2f1','wood':'#b58c67','magic':'#a48dc9'}[id.split('_')[-1]];g([box('floor',(1,.05,-1),(2,.1,2),c,.015)],'room_floor')
    elif id in ['room_torch','candle_big']:
        if id=='room_torch':g([tube('torch',[(0,0,0),(0,.8,0)],.09,'#aa855d',16),sphere('holder',(0,.8,0),(.16,.2,.14),'#d9b76e')],'torch')
        else:g([tube('candle',[(0,0,0),(0,.9,0)],.2,'#eadfc7',32)],'wax')
        markers=[('flame',(0,1,0))]
    elif id=='cobweb_corner':
        m=alpha_material('room_props_alpha');card('cobweb_corner',(0,0,0),(2,2),m);export(id,category);return
    elif id=='snowflake_pickup':
        shapes=[]
        for a in np.linspace(0,2*P,7)[:-1]:
            d=Vector((math.cos(a),math.sin(a),0));shapes.append(tube('spoke',[(0,.5,0),Vector((0,.5,0))+d*.5],.035,'#c8eef6',12))
        g(shapes,'snowflake')
    elif id=='lever':
        g([box('base',(0,.12,0),(.8,.24,.7),'#6d7485')],'lever_base')
        g([tube('shaft',[(0,.2,0),(0,1.35,0)],.065,'#c3b5a0',20),sphere('grip',(0,1.4,0),(.15,.15,.15),'#b25e7b')],'handle',(0,.2,0))
        g([sphere('lamp',(.28,.23,.2),(.08,.08,.08),'#a6d68b')],'lamp',(.28,.23,.2),'lever_lamp')
    elif id=='mirror_stand':
        g([box('base',(0,.15,0),(1.5,.3,.8),'#9e8aaf'),tube('stem',[(0,.2,0),(0,1.3,0)],.08,'#d4bf82')],'mirror_base')
        g([box('mirror',(0,1.4,0),(2.2,1.5,.12),'#bcd7e1',.12)],'mirror',(0,1.4,0),'mirror_glass')
    elif id=='crystal_target':
        g([tube('base',[(0,0,0),(0,.2,0)],.45,'#7b7093',32)],'crystal_base');g([tube('crystal',[(0,.2,0),(0,1.3,0),(0,1.8,0)],[.3,.28,.001],'#b9e3ea',8)],'target_crystal',(0,.2,0),'crystal_glow')
    elif id=='beam_emitter':
        g([box('base',(0,.1,0),(.65,.2,.8),'#81798d'),tube('cannon',[(0,.55,-.35),(0,.55,.65)],.3,'#d7b778',32)],'emitter');markers=[('beam_start',(0,.55,.72))]
    elif id=='item_key':
        g([ring('key_ring',(0,.42,0),.16,.04,'#edce77','Z',32,12),tube('key_shaft',[(0,.04,0),(0,.3,0)],.035,'#edce77',16),box('key_tooth',(.055,.07,0),(.11,.05,.06),'#edce77',.01)],'key')
    elif id=='item_boots':
        g([sphere('boot_toe',(x,.07,.06),(.12,.07,.18),'#92bddf') for x in [-.15,.15]]+[tube('boot_cuff',[(x,.08,0),(x,.4,0)],.11,'#b9d7e9',24) for x in [-.15,.15]],'boots')
    elif id=='item_string':
        g([tube('spool',[(0,.07,0),(0,.5,0)],.17,'#e9dfb9',32)]+[tube('rim',[(0,y,0),(0,y+.04,0)],.26,'#ad815b',32) for y in [.02,.5]],'string_spool')
    elif id=='item_hat':
        g([sphere('brim',(0,.06,0),(.3,.05,.25),'#9566cc'),tube('hat',[(0,.08,0),(0,.45,0),(.1,.6,0)],[.22,.1,.001],'#9566cc',32)],'hat')
    elif id=='item_scale':g([sphere('scale',(0,.25,0),(.25,.3,.06),'#e69465',32,20)],'scale')
    elif id=='item_map':
        g([box('paper',(0,.25,0),(.45,.38,.025),'#eadbb6',.015)]+[tube('scroll',[(x,.03,0),(x,.48,0)],.05,'#d1b777',24) for x in [-.24,.24]],'map')
    else:raise ValueError(id)
    # Union static sculpt subpieces before a shared atlas is packed for all moving parts.
    cleaned=[]
    for obs,n,p,m in groups:
        if len(obs)>1 and id not in ['gate','snowflake_pickup','item_key']:ob=joined_skin(obs,n,2000 if category=='items' else 1800,voxel=.025 if category=='items' else .07)
        else:ob=join(obs,n)
        cleaned.append(([ob],n,p,m))
    total=sum(sum(len(p.vertices)-2 for p in obs[0].data.polygons) for obs,n,p,m in cleaned)
    target=1400 if category=='rooms' else 2300 if category=='pieces' else 1800
    if total>target:
        for obs,n,p,m in cleaned:
            modifier=obs[0].modifiers.new('final_budget','DECIMATE');modifier.ratio=target/total;select(obs);bpy.ops.object.modifier_apply(modifier=modifier.name)
    parts=pack_groups(cleaned,id,512,'map' if id=='item_map' else 'wood' if id=='drawbridge_leaf' else 'carpet' if id=='conveyor' else 'stone')
    # Some exact material names intentionally differ from the model id.
    if id=='mirror_stand':
        m=bpy.data.materials.get('mirror_stand_main');m.name='mirror_main'
    root=empty('root')
    for ob in parts.values():ob.parent=root
    for n,p in markers:empty(n,p,root)
    export(id,category)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--category',default='characters');parser.add_argument('--only');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.category=='characters':
        for id in (args.only.split(',') if args.only else ['tyler','skyler','nick','pip','mo','zazz']):character(id)
    elif args.category=='villains':
        for id in (args.only.split(',') if args.only else ['dragon','snowgun','yoyo','wizard','ghost','tall-robot']):villain(id)
    elif args.category=='vehicles':
        for id in (args.only.split(',') if args.only else ['kart','snowmobile','buggy','glider','tractor','carpet']):vehicle(id)
    elif args.category=='scenery':
        for world,ids in WORLDS.items():
            if not args.only or world in args.only.split(','):
                for id in ids:scenery(world,id)
                if world!='everywhere':
                    for id in ['grass_tuft_a','grass_tuft_b']:scenery(world,id)
    elif args.category=='houses':
        for world in (args.only.split(',') if args.only else ['gear','frosty','bouncy','starry','lava','tower']):house(world)
    elif args.category=='landmarks':
        for id in (args.only.split(',') if args.only else ['landmark_gear','landmark_crystal','landmark_yoyo','landmark_volcano']):landmark(id)
    elif args.category in ['pieces','items','rooms']:
        for id in (args.only.split(',') if args.only else {'pieces':PIECES,'items':ITEMS,'rooms':ROOMS}[args.category]):setpiece(id,args.category)

if __name__=='__main__':main()
