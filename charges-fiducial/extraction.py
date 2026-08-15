#!/usr/bin/env python3
"""
Extraction des PDF du dossier charges Fiducial / Ficommerce.
- PDF texte  -> pdfplumber (texte + tableaux CSV)
- PDF scanne -> rendu pypdfium2 300 dpi + tesseract -l fra
Usage : python3 extraction.py            (traite tout pdf/*.pdf)
        python3 extraction.py fichier.pdf
"""
import sys, os, csv, subprocess, glob
import pdfplumber, pypdfium2 as pdfium

PDF_DIR, OUT_DIR, IMG_DIR = 'pdf', 'extraits', 'img'

def ocr(path, stem):
    os.makedirs(IMG_DIR, exist_ok=True)
    doc = pdfium.PdfDocument(path)
    pages = []
    for i in range(len(doc)):
        png = f'{IMG_DIR}/{stem}_{i+1:02d}.png'
        doc[i].render(scale=300/72).to_pil().save(png)
        subprocess.run(['tesseract', png, png[:-4], '-l', 'fra', '--psm', '6'],
                       stderr=subprocess.DEVNULL)
        pages.append(open(png[:-4] + '.txt').read())
    return pages

def traiter(path):
    stem = os.path.splitext(os.path.basename(path))[0].replace(' ', '_')
    pdf = pdfplumber.open(path)
    textes, tables = [], []
    for i, page in enumerate(pdf.pages):
        textes.append(page.extract_text() or '')
        for t in page.extract_tables():
            tables.append((i + 1, t))
    # bascule OCR si le PDF ne rend aucun texte exploitable
    if sum(len(t.strip()) for t in textes) < 50 * len(pdf.pages):
        print(f'  {stem} : PDF scanne -> OCR francais')
        textes = ocr(path, stem)
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(f'{OUT_DIR}/{stem}.txt', 'w') as f:
        for i, t in enumerate(textes):
            f.write(f'\n===== PAGE {i+1} =====\n{t}\n')
    if tables:
        with open(f'{OUT_DIR}/{stem}.csv', 'w', newline='') as f:
            w = csv.writer(f)
            for num, t in tables:
                w.writerow([f'--- page {num} ---'])
                w.writerows(t)
    print(f'  {stem} : {len(textes)} page(s), {len(tables)} tableau(x)')

if __name__ == '__main__':
    cibles = sys.argv[1:] or sorted(glob.glob(f'{PDF_DIR}/*.pdf'))
    for c in cibles:
        traiter(c)
