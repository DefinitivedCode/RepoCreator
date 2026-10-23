#!/usr/bin/env python3
"""Rebuild vector masters and deterministic raster/icon exports. See README.md."""
from pathlib import Path
import json, subprocess, shutil, struct
from functools import lru_cache
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
INK='#202B33'; PAPER='#F6F2E9'; ORANGE='#E87B40'; MUTED='#58646B'; WHITE='#FFFFFF'
font=instantiateVariableFont(TTFont(ROOT/'fonts/Manrope-Variable.ttf'),{'wght':700},inplace=False)
upm=font['head'].unitsPerEm

@lru_cache(maxsize=8)
def weighted_font(weight):
    return font if weight==700 else instantiateVariableFont(TTFont(ROOT/'fonts/Manrope-Variable.ttf'),{'wght':weight},inplace=False)

def text(s,x,y,size=32,color=INK,weight=700):
    f=weighted_font(weight)
    gs=f.getGlyphSet(); cm=f.getBestCmap(); advance=0; paths=[]
    for ch in s:
        name=cm[ord(ch)]; pen=SVGPathPen(gs); gs[name].draw(pen)
        if pen.getCommands(): paths.append(f'<path d="{pen.getCommands()}" transform="translate({advance} 0)"/>')
        advance+=gs[name].width
    return f'<g fill="{color}" transform="translate({x} {y}) scale({size/upm} {-size/upm})">'+''.join(paths)+'</g>'

def mark(kind='keystone',fg=INK,accent=ORANGE):
    if kind=='keystone':
        return f'<g transform="translate(-2 0)"><path fill="{fg}" d="M8 8H28V20H20V32H36L60 56H42L26 40H20V56H8Z"/><path fill="{accent}" d="M32 8H44L56 20V32H44V24L40 20H32Z"/></g>'
    if kind=='joinery':
        return f'<path fill="{fg}" d="M8 8H32V20H20V28H36V40H20V56H8Z"/><path fill="{accent}" d="M36 8H56V56H32V44H44V36H28V24H44V20H36Z"/>'
    return f'<path fill="{accent}" d="M12 24V18L22 8H42L52 18V24H58V30H6V24Z"/><path fill="{fg}" d="M12 34H52V48L44 56H20L12 48Z"/><path fill="{PAPER}" d="M22 38H28V44H22ZM36 38H42V44H36Z"/>'

def place(content,x,y,scale=1):return f'<g transform="translate({x} {y}) scale({scale})">{content}</g>'
def svg(content,w,h,title='Repo Creator',bg=None):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title"><title id="title">{title}</title>'+ (f'<path fill="{bg}" d="M0 0H{w}V{h}H0Z"/>' if bg else '')+content+'</svg>\n'
def save(rel,data):
    p=ROOT/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(data,encoding='utf-8');return p

def lockup(fg=INK,accent=ORANGE):return place(mark(fg=fg,accent=accent),0,0,1.5)+text('Repo Creator',114,65,54,fg)

def hero(w,h,dark=False):
    fg=PAPER if dark else INK; bg=INK if dark else PAPER
    # One assembled silhouette, plus a detached cap repeating its construction.
    c=place(mark(fg=fg),58,58,1.25)+text('Repo Creator',158,117,44,fg)
    c+=text('A good place',64,260,72,fg)+text('to start building.',64,346,72,fg)
    c+=text('Create repositories. Make room for your next project.',68,h-104,23,fg,500)
    c+=text('Windows + macOS',68,h-56,19,ORANGE if dark else MUTED,600)
    c+=place(mark(fg=fg),w-390,150,5.0)
    return svg(c,w,h,'Repo Creator - a good place to start building',bg)

def small_icon(platform='windows'):
    plate=f'<path fill="{PAPER}" d="M1 1H12L15 4V15H1Z"/>' if platform=='windows' else f'<rect x="1" y="1" width="14" height="14" rx="3" fill="{PAPER}"/>'
    return plate+f'<path fill="{INK}" d="M3 3H7V5H5V8H8L13 13H10L7 10H5V13H3Z"/><path fill="{ORANGE}" d="M8 3H10L13 6V8H11V6L10 5H8Z"/>'

def build():
    for kind in ['keystone','joinery','benchmate']:
        save(f'concepts/{kind}.svg',svg(mark(kind),64,64,f'{kind.title()} - Builder exploration'))
    for name,fg,ac in [('colour-light',INK,ORANGE),('colour-dark',PAPER,ORANGE),('mono-ink',INK,INK),('mono-white',WHITE,WHITE)]:
        save(f'masters/mark-{name}.svg',svg(mark(fg=fg,accent=ac),64,64))
        save(f'masters/logo-{name}.svg',svg(lockup(fg,ac),470,96))
        save(f'masters/wordmark-{name}.svg',svg(text('Repo Creator',8,65,54,fg),365,88))
    # Live type source, paired with outlined distribution master.
    save('masters/wordmark-live-text.svg','<svg xmlns="http://www.w3.org/2000/svg" width="365" height="88" viewBox="0 0 365 88"><text x="8" y="65" font-family="Manrope" font-weight="700" font-size="54" fill="#202B33">Repo Creator</text></svg>\n')
    for theme,dark in [('light',False),('dark',True)]:
        save(f'masters/readme-banner-{theme}.svg',hero(1600,560,dark))
        save(f'masters/social-preview-{theme}.svg',hero(1280,640,dark))
    # Windows keeps a transparent surround. Mac uses an inset, precomposed tile.
    for platform in ['windows','macos']:
        if platform=='windows': c=f'<path fill="{PAPER}" d="M64 64H800L960 224V960H64Z"/>'+place(mark(),128,128,12)
        else:c=f'<rect x="100" y="100" width="824" height="824" rx="184" fill="{PAPER}"/>'+place(mark(),196,196,9.875)
        save(f'masters/app-icon-{platform}.svg',svg(c,1024,1024,f'Repo Creator {platform} icon candidate'))
    for platform in ['windows','macos']:
        save(f'masters/app-icon-{platform}-16.svg',svg(small_icon(platform),16,16,f'Repo Creator {platform} optical 16 px icon'))
    # Contact sheets are editable vector presentations.
    c=text('Three ways to build',64,92,48)+text('Repo Creator / The Builder',66,132,20,MUTED,500)
    for i,(kind,title,desc,trade) in enumerate([
        ('keystone','Keystone','An R assembled around a warm corner piece.','Clear name connection. Strongest small silhouette.'),
        ('joinery','Joinery','Two beams meet through alternating joints.','Craft and connection. More abstract at small sizes.'),
        ('benchmate','Benchmate','A compact helper with a builder\'s hard hat.','Warm and playful. More character than product mark.')]):
        x=64+i*490
        c+=place(mark(kind),x,220,3.3)+text(title,x,510,32)+text(desc,x,554,17,MUTED,500)+text(trade,x,588,16,MUTED,500)
        c+=place(mark(kind),x,646,.25)+place(mark(kind),x+56,638,.5)+place(mark(kind,INK,INK),x+132,630,.75)
    c+=text('Selected: Keystone',64,768,26)+text('One bold silhouette, a useful initial, and an assembly detail that survives in one colour.',64,808,22,MUTED,500)
    save('review/concept-comparison.svg',svg(c,1600,880,'Builder concept comparison',PAPER))
    c=place(lockup(),64,64,1.5)
    c+=f'<rect x="800" width="800" height="430" fill="{INK}"/>'+place(lockup(PAPER),864,64,1.5)
    c+=text('Light',64,345,20,MUTED)+text('Dark',864,345,20,PAPER)
    c+=text('Keystone',64,514,48)+text('The corner piece makes it yours.',66,557,24,MUTED,500)
    c+=place(mark(),64,624,2.8)+place(mark( fg=INK,accent=INK),330,624,2.8)
    c+=f'<rect x="640" y="624" width="180" height="180" fill="{INK}"/>'+place(mark(fg=PAPER,accent=PAPER),640,624,2.8)
    c+=place(mark(),980,650,.25)+text('16 px',970,718,18,MUTED,500)+place(mark(),1100,642,.5)+text('32 px',1090,718,18,MUTED,500)+place(mark(),1240,626,1)+text('64 px',1230,718,18,MUTED,500)
    save('review/identity-overview.svg',svg(c,1600,880,'Keystone final identity overview',PAPER))
    c=text('Icon candidates',64,90,48)+text('Separate exports for platform conventions',66,132,23,MUTED,500)
    c+=f'<path fill="{PAPER}" d="M100 216H436L500 280V616H100Z"/>'+place(mark(),126,242,5.4)
    c+=f'<rect x="880" y="216" width="384" height="384" rx="86" fill="{PAPER}"/>'+place(mark(),925,261,4.6)
    c+=text('Windows',100,700,30)+text('macOS',880,700,30)+text('Chamfered tile, transparent surround',100,744,22,MUTED,500)+text('Inset tile with transparent surround',880,744,22,MUTED,500)
    save('review/icon-preview.svg',svg(c,1600,880,'Platform icon candidates','#DADFE1'))
    save('palette.json',json.dumps({'name':'Keystone','colours':{'ink':INK,'paper':PAPER,'clay':ORANGE,'slate':MUTED,'white':WHITE},'typography':{'family':'Manrope','wordmarkWeight':700,'bodyWeight':500}},indent=2)+'\n')

def render():
    sources=list((ROOT/'masters').glob('*.svg'))+list((ROOT/'review').glob('*.svg'))+list((ROOT/'concepts').glob('*.svg'))
    for p in sources:
        if 'live-text' in p.name:continue
        dest=(ROOT/'exports'/p.with_suffix('.png').name) if p.parent.name=='masters' else p.with_suffix('.png')
        subprocess.run(['inkscape',str(p),'--export-type=png',f'--export-filename={dest}'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    icon=ROOT/'icons'
    for n in [16,20,24,32,40,48,64,128,256,512,1024]:
        subprocess.run(['inkscape',str(ROOT/('masters/app-icon-windows-16.svg' if n==16 else 'masters/app-icon-windows.svg')),f'--export-width={n}',f'--export-filename={icon/f"windows-{n}.png"}'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    im=Image.open(icon/'windows-1024.png')
    im.save(icon/'repo-creator.ico',sizes=[(n,n) for n in [16,24,32,48,64,128,256]],append_images=[Image.open(icon/f'windows-{n}.png') for n in [16,24,32,48,64,128,256]],bitmap_format='png')
    for n in [16,32,64,128,256,512,1024]:
        subprocess.run(['inkscape',str(ROOT/('masters/app-icon-macos-16.svg' if n==16 else 'masters/app-icon-macos.svg')),f'--export-width={n}',f'--export-filename={icon/f"macos-{n}.png"}'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    # Favicon is the optically aligned unplated symbol, independent of the app candidates.
    # The favicon uses the same high-contrast platform tile.
    shutil.copyfile(icon/'repo-creator.ico',icon/'favicon.ico')
    # Encode PNG members explicitly so every small icon uses its native SVG raster.
    chunks=[]
    for code,n in [('icp4',16),('icp5',32),('icp6',64),('ic07',128),('ic08',256),('ic09',512),('ic10',1024),('ic11',32),('ic12',64),('ic13',256),('ic14',512)]:
        data=(icon/f'macos-{n}.png').read_bytes(); chunks.append(code.encode()+struct.pack('>I',len(data)+8)+data)
    body=b''.join(chunks);(icon/'repo-creator.icns').write_bytes(b'icns'+struct.pack('>I',len(body)+8)+body)
    for p in (ROOT/'masters').glob('*.svg'):
        if p.name.startswith(('logo-','wordmark-','mark-')) and 'live-text' not in p.name:
            width=1024 if p.name.startswith('mark-') else (1880 if p.name.startswith('logo-') else 1460)
            subprocess.run(['inkscape',str(p),f'--export-width={width}',f'--export-filename={ROOT/"exports"/(p.stem+("-1024.png" if p.name.startswith("mark-") else "@4x.png"))}'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__':
    build(); render()
    for p in ROOT.rglob('*.png'):
        with Image.open(p) as im:
            im.verify()
