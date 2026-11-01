"""Build contact sheets and a clean delivery archive, excluding v1 assets."""
from pathlib import Path
import json,zipfile,subprocess
from PIL import Image,ImageDraw,ImageFont,ImageOps
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'assets/models';PREVIEW=BASE/'v2-previews'
result=subprocess.run(['node',str(ROOT/'tools/check-models.mjs')],cwd=ROOT)
if result.returncode:raise SystemExit('Structural validation failed; archive not created.')
groups={
 'characters-v22':['tyler','skyler','nick','pip','mo','zazz','dragon','snowgun','yoyo','wizard','ghost','tall-robot'],
 'vehicles-v22':['kart','snowmobile','buggy','glider','tractor','carpet'],
 'worlds-v22':['house_gear','house_frosty','house_bouncy','house_starry','house_lava','house_tower','gear_building_a','frosty_tree_pine_a','bouncy_tree_round_a','starry_tree_crooked_a','lava_rock_volcanic_a','tower_crystal_a'],
 'poses-v22':['tyler','tyler_cheer','tyler_drive','tyler_wave']}
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
for name,ids in groups.items():
    cols=4 if name=='poses-v22' else 3;rows=(len(ids)+cols-1)//cols;sheet=Image.new('RGB',(cols*320,rows*350),'#edf2f6');draw=ImageDraw.Draw(sheet)
    for i,id in enumerate(ids):
        im=Image.open(PREVIEW/(id+'.png')).convert('RGBA');bbox=im.getchannel('A').getbbox();im=ImageOps.contain(im.crop(bbox),(294,294),Image.Resampling.LANCZOS)
        x=(i%cols)*320;y=(i//cols)*350;sheet.paste(im,(x+(320-im.width)//2,y+10+(294-im.height)//2),im)
        draw.text((x+160,y+326),id.replace('_',' ').replace('-',' ').title(),font=font,anchor='mm',fill='#27364b')
    sheet.save(PREVIEW/(name+'.jpg'),quality=94)
textures=[]
for p in sorted((ROOT/'assets/textures').glob('*.png')):
    with Image.open(p) as im:
        assert im.size==((2048,1024) if p.name=='sky_clouds.png' else (1024,1024))
        if p.name!='sky_clouds.png':
            assert im.crop((0,0,im.width,1)).tobytes()==im.crop((0,im.height-1,im.width,im.height)).tobytes()
            assert im.crop((0,0,1,im.height)).tobytes()==im.crop((im.width-1,0,im.width,im.height)).tobytes()
        textures.append(dict(file=str(p.relative_to(ROOT)),width=im.width,height=im.height))
(ROOT/'assets/textures/manifest.json').write_text(json.dumps(textures,indent=2))
paths=[]
for folder in ['characters','villains','vehicles','houses','landmarks','pieces','items','rooms','scenery']:paths+=list((BASE/folder).rglob('*.glb'))
assert len(paths)==146 and len(textures)==31
paths += [BASE/n for n in ['manifest.json','validation-v2.json','README-v2.2.md']]
paths += list((ROOT/'assets/textures').glob('*.png'))+[ROOT/'assets/textures/manifest.json']
paths += [PREVIEW/(name+'.jpg') for name in groups]
paths += [ROOT/'assets/specs/MODEL_SPEC_v2.2.md']
paths += [ROOT/'tools'/n for n in ['build_v2_assets.py','build_v2_textures.py','build_character_models.py','build_vehicle_models.py','check_v2_models.py','check-models.mjs','render_v2_assets.py','render_v2_batch.py','package_v2_assets.py']]
target=ROOT/'assets/robot-land-v22-asset-pack.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=8) as z:
    for p in sorted(paths):z.write(p,p.relative_to(ROOT))
with zipfile.ZipFile(target) as z:assert z.testzip() is None
print(json.dumps(dict(archive=str(target),models=146,textures=31,files=len(paths),archive_mb=round(target.stat().st_size/1e6,2)),indent=2))
