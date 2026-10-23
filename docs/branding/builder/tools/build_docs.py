#!/usr/bin/env python3
"""Build the vector PDF guides and the offline review index."""
from pathlib import Path
import subprocess
from pypdf import PdfWriter
from build import ROOT,INK,PAPER,ORANGE,MUTED,text,mark,place,svg,save,lockup,small_icon

def title(heading,sub=''):
 return text(heading,64,100,48)+(text(sub,66,145,23,MUTED,500) if sub else '')
def foot(n):return text('Repo Creator / Keystone / Brand guidelines',64,832,17,MUTED,500)+text(str(n),1510,832,17,MUTED,500)
def line(s,x,y,size=23,col=MUTED):return text(s,x,y,size,col,500)

def main():
 pages=[]
 c=title('The Builder, assembled','Keystone / Proposed identity / October 2026')
 c+=place(lockup(),64,240,2.0)
 c+=line('A two-part R gives Repo Creator a clear initial and a construction story.',66,530,30,INK)
 c+=line('The upper-right corner feels like a component finding its place. Its chamfer',66,592)
 c+=line('repeats the angle of the lower leg. A visible seam keeps that assembly readable',66,628)
 c+=line('in a single colour. The warm accent adds personality without changing the silhouette.',66,664)
 c+=line('The identity palette stays fixed when users choose different interface accents.',66,738)
 pages.append(c)
 c=title('Colour','A quiet foundation with one warm component')
 cols=[('Ink',INK,'Primary text and dark surfaces'),('Paper',PAPER,'Light surfaces and reversed marks'),('Clay',ORANGE,'The corner piece and small accents'),('Slate',MUTED,'Secondary text on Paper')]
 for i,(name,col,desc) in enumerate(cols):
  x=64+i*385
  c+=f'<rect x="{x}" y="230" width="330" height="200" fill="{col}" stroke="{MUTED}" stroke-width="1"/>'
  c+=text(name,x,486,30)+line(col,x,525,23)+line(desc,x,572,17)
 c+=line('Ink on Paper: 12.90:1. Paper on Ink: 12.90:1. Slate on Paper: 5.43:1.',64,672,25,INK)
 c+=line('Use Clay for artwork. Clay on Paper is 2.63:1, so use Ink for normal text.',64,720)
 c+=line('White #FFFFFF is available for strict monochrome exports. Avoid gradients.',64,760)
 pages.append(c)
 c=title('Typography','Manrope gives the angular mark a friendly, precise companion')
 c+=text('Repo Creator',64,300,100)
 c+=line('The wordmark uses Manrope Bold 700 with the supplied spacing.',68,368,24)
 c+=text('A good place to start building.',64,510,54)
 c+=line('Headlines: Bold 700. Supporting copy: Medium 500.',68,570,25)
 c+=line('Keep the product name as Repo Creator, with a space and initial capitals.',68,654)
 c+=line('Outlined SVGs render without fonts. The live-text source and variable font',68,702)
 c+=line('are included for editing. Manrope carries the SIL Open Font License 1.1.',68,738)
 pages.append(c)
 c=title('Spacing and size','Keep the construction visible')
 c+=f'<rect x="82" y="230" width="340" height="320" fill="none" stroke="{MUTED}" stroke-width="1" stroke-dasharray="5 5"/>'
 c+=place(mark(),92,230,5)
 c+=line('8-unit clear space',92,604,24,INK)
 c+=line('Visible mark: 52 x 48 units',92,646)
 c+=line('Minimum clear space: 8 units',92,684)
 c+=line('(one-sixth of visible mark height)',92,720,19)
 c+=place(lockup(),600,260,1.8)
 c+=line('Use the supplied lockup proportions and spacing.',600,490,26,INK)
 c+=line('Minimum digital width: 188 px for the primary logo.',600,550)
 c+=line('Standalone wordmark: 146 px. Mark: 16 px artboard.',600,590)
 c+=line('Below these sizes, use the mark instead of lettering.',600,630)
 c+=line('For print, keep mark artboard at least 5 mm wide',600,696)
 c+=line('and the primary lockup at least 35 mm wide.',600,732)
 pages.append(c)
 c=title('Usage and handoff','Production artwork, ready for review')
 c+=place(mark(),64,214,1.6)+place(mark(fg=INK,accent=INK),244,214,1.6)
 c+=f'<rect x="420" y="214" width="104" height="104" fill="{INK}"/>'+place(mark(fg=PAPER),420,214,1.6)
 c+=text('Use supplied colour or monochrome variants',600,278,30)
 rows=[('Preserve','The seam, chamfer, proportions and original two-piece relationship.'),('Backgrounds','Use light artwork on dark surfaces. Keep Clay as a secondary colour.'),('Avoid','Stretching, rotation, gradients, shadows, outlines or extra pieces.'),('Application icons','Use platform candidates in icons/. They include a Paper tile for contrast.'),('Media','Use the 1600 x 560 README banner and 1280 x 640 social preview.'),('Approval','Artwork is proposed. App icon integration and README updates come later.')]
 for i,(a,b) in enumerate(rows):
  y=406+i*62;c+=text(a,64,y,23)+line(b,330,y,22)
 pages.append(c)
 # Compute contrast rather than relying on rounded draft values.
 def lum(h):
  vals=[int(h[i:i+2],16)/255 for i in [1,3,5]]
  vals=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals]
  return sum(v*w for v,w in zip(vals,[.2126,.7152,.0722]))
 def ratio(a,b):
  x,y=sorted([lum(a),lum(b)]);return (y+.05)/(x+.05)
 # Text is outlined, so replace copy before generating a fresh colour page.
 c=pages[1]
 # Replace the entire line by regenerating with the measured values.
 old=line('Ink on Paper: 12.90:1. Paper on Ink: 12.90:1. Slate on Paper: 5.43:1.',64,672,25,INK)
 new=line(f'Ink on Paper: {ratio(INK,PAPER):.2f}:1. Paper on Ink: {ratio(INK,PAPER):.2f}:1. Slate on Paper: {ratio(MUTED,PAPER):.2f}:1.',64,672,25,INK)
 c=c.replace(old,new).replace(line('Use Clay for artwork. Clay on Paper is 2.63:1, so use Ink for normal text.',64,720),line(f'Use Clay for artwork. Clay on Paper is {ratio(ORANGE,PAPER):.2f}:1, so use Ink for normal text.',64,720))
 pages[1]=c
 for i,c in enumerate(pages,1):save(f'review/guidelines/page-{i}.svg',svg(c+foot(i),1600,880,f'Brand guidelines - page {i}',PAPER))
 # Native-size sheet on contrasting backgrounds.
 c=title('Small-size review','Native SVG rasters at taskbar and Dock sizes')
 for row,bg in enumerate([PAPER,INK]):
  y=230+row*260;c+=f'<rect x="64" y="{y}" width="1472" height="220" fill="{bg}" stroke="{MUTED}"/>'
  for i,n in enumerate([16,20,24,32,48,64,128]):
   x=100+i*200
   # Identical geometry to the Windows candidate, rendered at each native size.
   tile=f'<path fill="{PAPER}" d="M64 64H800L960 224V960H64Z"/>'+place(mark(),128,128,12)
   c+=(place(small_icon(),x,y+40) if n==16 else place(tile,x,y+40,n/1024))+line(f'{n} px',x,y+188,19,INK if row==0 else PAPER)
 save('review/small-sizes.svg',svg(c,1600,880,'Small-size icon review',PAPER))
 def pdf(svgpath):
  dest=svgpath.with_suffix('.pdf')
  subprocess.run(['inkscape',str(svgpath),'--export-type=pdf',f'--export-filename={dest}'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  return dest
 def combine(paths,dest):
  writer=PdfWriter()
  for path in paths:writer.append(str(pdf(path)))
  writer.add_metadata({'/Title':dest.stem.replace('-',' ').title(),'/Author':'Repo Creator','/Subject':'The Builder / Keystone brand proposal'})
  with dest.open('wb') as f:writer.write(f)
  for p in paths:p.with_suffix('.pdf').unlink()
 combine([ROOT/f'review/guidelines/page-{i}.svg' for i in range(1,6)],ROOT/'brand-guidelines.pdf')
 c=text('Repo Creator',64,140,68,PAPER)+text('A good place',64,366,76,PAPER)+text('to start building.',64,458,76,PAPER)
 c+=place(mark(fg=PAPER),1030,230,7.2)+line('The Builder / Keystone',68,710,26,ORANGE)+line('Identity proposal / October 2026',68,758,23,PAPER)
 save('review/presentation-cover.svg',svg(c,1600,880,'Repo Creator brand presentation',INK))
 raw=(ROOT/'masters/readme-banner-light.svg').read_text();body=raw[raw.index('>')+1:raw.rindex('</svg>')]
 c=title('GitHub artwork','The identity carries through into a clean, reusable hero')
 c+='<svg x="64" y="204" width="1472" height="515.2" viewBox="0 0 1600 560">'+body+'</svg>'
 c+=line('README: 1600 x 560. Social: 1280 x 640. Light and dark exports supplied.',64,798,24)
 save('review/presentation-media.svg',svg(c,1600,880,'Repo Creator GitHub artwork',PAPER))
 presentation=[ROOT/'review/presentation-cover.svg',ROOT/'review/concept-comparison.svg',ROOT/'review/identity-overview.svg',ROOT/'review/icon-preview.svg',ROOT/'review/small-sizes.svg',ROOT/'review/presentation-media.svg']
 combine(presentation,ROOT/'brand-presentation.pdf')
 for p in list((ROOT/'review/guidelines').glob('*.svg'))+[ROOT/'review/small-sizes.svg']:
  subprocess.run(['inkscape',str(p),'--export-width=1600',f'--export-filename={p.with_suffix(".png")}'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 print('Contrast ratios:',{k:round(ratio(a,b),2) for k,a,b in [('ink/paper',INK,PAPER),('slate/paper',MUTED,PAPER),('clay/paper',ORANGE,PAPER)]})
if __name__=='__main__':main()
