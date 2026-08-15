import json, base64, sys, os, glob
import pdfplumber
TR='/root/.claude/projects/-home-user-wb-partners/9f7c267a-7ae8-55b8-8edb-0c1163eb0d01/tool-results/'
def ingest(jsonfile, outname):
    d=json.load(open(jsonfile))
    p=f'pdf/{outname}.pdf'
    open(p,'wb').write(base64.b64decode(d['content']))
    pdf=pdfplumber.open(p)
    out=[]
    for i,pg in enumerate(pdf.pages):
        out.append(f"===== PAGE {i+1} =====\n"+(pg.extract_text() or ''))
    txt='\n'.join(out)
    open(f'extraits/{outname}.txt','w').write(txt)
    print(f"[{outname}] {d['title']} — {len(pdf.pages)} page(s), {len(txt)} car.")
    return txt
if __name__=='__main__':
    print(ingest(sys.argv[1], sys.argv[2])[:3500])
