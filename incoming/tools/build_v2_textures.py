"""Seamless painted-style game surfaces, generated deterministically at delivery sizes."""
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
OUT=Path(__file__).resolve().parents[1]/'assets/textures';OUT.mkdir(parents=True,exist_ok=True)
def rgb(s):return np.array([int(s[i:i+2],16) for i in (1,3,5)],float)
def tile(name,base,style,variation=0):
    n=1024;v,u=np.meshgrid(np.linspace(0,2*np.pi,n),np.linspace(0,2*np.pi,n),indexing='ij');phase=variation*1.9
    noise=.04*np.sin(3*u+np.sin(2*v)+phase)+.025*np.cos(7*v-2*u+phase)+.015*np.sin(19*u+13*v)
    im=np.broadcast_to(rgb(base),(n,n,3)).copy()*(1+noise[:,:,None]);line=np.zeros((n,n),bool)
    if style in ['metal','stone','tiles']:
        line=(abs(np.sin(2*v))<.04)|(abs(np.sin(2*u+.25*np.sin(2*v)))<.04)
        im[line]*=.68
        if style=='metal':
            bolts=(np.cos(4*u)>.985)&(np.cos(4*v)>.985);im[bolts]=rgb('#8495a8')
    if style in ['grass','moss']:
        strokes=(abs(np.sin(13*u+2*np.sin(7*v)))<.09)&(np.cos(9*v)>0);im[strokes]*=1.13
    if style=='snow':
        im+=np.sin(3*u+np.cos(4*v))[:,:,None]*np.array([3,5,8]);flecks=(np.cos(41*u+19*v)>.995)&(np.cos(29*v-13*u)>.97);im[flecks]=rgb('#fcf9ec')
    if style in ['ash','lava']:
        line=abs(np.sin(3*u+np.sin(4*v))+.4*np.sin(5*v+u))<(.04 if style=='ash' else .11);im[line]=rgb('#db7751' if style=='ash' else '#ffe08a')
    if style in ['rock','dirt','cinder','asphalt']:
        spots=(np.cos(19*u+7*v)*np.cos(23*v-5*u)>.83);im[spots]*=.8
    if style=='water':
        ripples=abs(np.sin(5*v+np.sin(3*u)))<.06;im[ripples]=rgb('#a7e8ed')
    im=np.uint8(np.clip(im,0,255));im[-1]=im[0];im[:,-1]=im[:,0]
    Image.fromarray(im).save(OUT/(name+('_variation' if variation else '')+'.png'))
grounds={'plates':('#8894a9','metal'),'snow':('#d9eaf4','snow'),'grass':('#79bd72','grass'),'night':('#365c65','moss'),'ash':('#735651','ash'),'stone':('#8a7b9c','stone'),'rock':('#9a8b7c','rock')}
roads={'gear':('#727b8a','asphalt'),'frosty':('#b9d6e7','snow'),'bouncy':('#c6a578','dirt'),'starry':('#637f79','moss'),'lava':('#8d6556','cinder'),'tower':('#a18bb6','tiles'),'gecko':('#c8b68c','dirt')}
for name,(base,style) in grounds.items():
    for variant in [0,1]:tile('ground_'+name,base,style,variant)
for name,(base,style) in roads.items():
    for variant in [0,1]:tile('road_'+name,base,style,variant)
tile('water','#5eaac6','water');tile('lava','#e78649','lava')
w,h=2048,1024;v,u=np.meshgrid(np.linspace(0,1,h),np.linspace(0,2*np.pi,w),indexing='ij')
cloud=np.sin(u*3+np.sin(v*8))*.25+np.cos(u*7-v*11)*.12+np.cos(v*8)*.4
alpha=np.clip((cloud-.02)*4,0,1);rgba=np.ones((h,w,4),np.uint8)*255;rgba[:,:,:3]=[242,248,255];rgba[:,:,3]=(alpha*220).astype('uint8')
Image.fromarray(rgba).filter(ImageFilter.GaussianBlur(7)).save(OUT/'sky_clouds.png')
for p in OUT.glob('*.png'):
    with Image.open(p) as im:
        assert im.size==((2048,1024) if p.name=='sky_clouds.png' else (1024,1024))
print('Wrote',len(list(OUT.glob('*.png'))),'texture files.')
