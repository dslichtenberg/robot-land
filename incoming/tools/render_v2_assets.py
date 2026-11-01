"""Render exported GLBs for visual checks, using real materials and skinning."""
import bpy,sys,math,json
from pathlib import Path
from mathutils import Vector,Matrix
args=sys.argv[sys.argv.index('--')+1:];src=Path(args[0]);dest=Path(args[1]);dest.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(src))
roots=[o for o in bpy.context.scene.objects if o.parent is None]
wrapper=bpy.data.objects.new('preview_coordinate_conversion',None);bpy.context.collection.objects.link(wrapper)
for o in roots:o.parent=wrapper
wrapper.rotation_euler.x=-math.pi/2
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX';scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
if len(args)>2:
    name=args[2];f=int(args[3]) if len(args)>3 else 15
    for o in list(bpy.data.objects):
        if o.type=='ARMATURE' and o.animation_data:
            for track in o.animation_data.nla_tracks:track.mute=True
            o.animation_data.action=bpy.data.actions.get(name)
            if o.animation_data.action and len(o.animation_data.action.slots):o.animation_data.action_slot=o.animation_data.action.slots[0]
    scene.frame_set(f)
for o in scene.objects:
    if o.name in ['lod1','col']:
        o.hide_render=True
        for child in o.children_recursive:child.hide_render=True
bpy.context.view_layer.update();points=[]
for o in scene.objects:
    if o.type=='MESH' and not o.hide_render:points.extend(o.matrix_world@Vector(p) for p in o.bound_box)
lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)));center=(lo+hi)/2;size=max(hi-lo)
def aim(o,target):
    back=(o.location-Vector(target)).normalized();right=Vector((0,1,0)).cross(back).normalized();up=back.cross(right).normalized();o.rotation_euler=Matrix((right,up,back)).transposed().to_euler()
bpy.ops.object.camera_add(location=center+Vector((size*.65,size*.35,size*1.8)));cam=bpy.context.object;aim(cam,center);cam.data.type='ORTHO';cam.data.ortho_scale=size*1.35;scene.camera=cam
for name,p,power,scale in [('key',(-3,5,4),300,4),('fill',(4,3,3),170,4),('rim',(0,4,-4),400,3)]:
    bpy.ops.object.light_add(type='AREA',location=center+Vector(p)*size/2);o=bpy.context.object;o.name=name;o.data.energy=power*size*size;o.data.shape='DISK';o.data.size=scale*size;aim(o,center)
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(dest);bpy.ops.render.render(write_still=True)
