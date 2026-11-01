from pathlib import Path
from pdf2image import convert_from_path
from PIL import Image, ImageDraw
from pypdf import PdfReader
import json
root=Path(__file__).parent
poppler=r'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
report=[]
for pdf in sorted((root/'qa').glob('*.pdf')):
    dest=root/'qa'/pdf.stem.split('_')[1]
    dest.mkdir(exist_ok=True)
    pages=convert_from_path(str(pdf),dpi=100,poppler_path=poppler)
    for i,im in enumerate(pages,1): im.save(dest/f'page-{i}.png')
    for offset in range(0,len(pages),3):
        selected=pages[offset:offset+3]
        w,h=selected[0].size
        sheet=Image.new('RGB',(w*len(selected),h+30),'white')
        draw=ImageDraw.Draw(sheet)
        for j,im in enumerate(selected):
            sheet.paste(im,(j*w,30));draw.text((j*w+15,8),f'{pdf.stem.split("_")[1]} page {offset+j+1}',fill='black')
        sheet.save(root/'qa'/f'{pdf.stem.split("_")[0]}-sheet-{offset//3+1}.png')
    texts=[x.extract_text() for x in PdfReader(pdf).pages]
    assert all(len(x)>300 for x in texts)
    report.append({'document':pdf.stem,'pages':len(pages),'characters':[len(x) for x in texts]})
(root/'qa'/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('Rendered',sum(x['pages'] for x in report),'pages')
