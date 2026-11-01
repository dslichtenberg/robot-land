"""Visual QA renders from the delivered GLBs, including animation samples."""
import runpy,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];models=root/'assets/models';dest=models/'v2-previews'
jobs=[('characters/'+id,id,'') for id in ['tyler','skyler','nick','pip','mo','zazz']]
jobs += [('villains/'+id,id,'') for id in ['dragon','snowgun','yoyo','wizard','ghost','tall-robot']]
jobs += [('vehicles/'+id,id,'') for id in ['kart','snowmobile','buggy','glider','tractor','carpet']]
jobs += [('houses/house_'+world,'house_'+world,'') for world in ['gear','frosty','bouncy','starry','lava','tower']]
jobs += [('landmarks/'+id,id,'') for id in ['landmark_gear','landmark_volcano']]
jobs += [('scenery/'+world+'/'+id,world+'_'+id,'') for world,id in [('gear','building_a'),('frosty','tree_pine_a'),('bouncy','tree_round_a'),('starry','tree_crooked_a'),('lava','rock_volcanic_a'),('tower','crystal_a'),('gecko','tree_lush_a')]]
jobs += [('characters/tyler','tyler_'+pose,pose) for pose in ['cheer','drive','wave']]
for file,name,pose in jobs:
    sys.argv=['render','--',str(models/(file+'.glb')),str(dest/(name+'.png'))]+([pose,'12'] if pose else [])
    runpy.run_path(str(root/'tools/render_v2_assets.py'),run_name='__main__')
    print('PREVIEW',name,flush=True)
