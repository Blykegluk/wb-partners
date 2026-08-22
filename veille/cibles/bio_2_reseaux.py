# Étape 2 : enrichir les réseaux (3-25 magasins bio sous un même SIREN) via
# l'API recherche-entreprises — mêmes règles que le screening supermarchés :
# dirigeant EFFECTIF (holding résolue), exclusion ETI/GE.
import json, time, urllib.request, re, unicodedata
from collections import Counter

BASE = "https://recherche-entreprises.api.gouv.fr/search"
def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"wb-partners-etude"}), timeout=25) as r:
                return json.load(r)
        except Exception:
            time.sleep(1.5*(i+1))
    return None

DIR_RX = re.compile(r"gerant|president|directeur general", re.I)
EXC_RX = re.compile(r"commissaire|surveillance", re.I)
def norm(s): return unicodedata.normalize('NFD', s or '').encode('ascii','ignore').decode()
def effectifs(dirs):
    pp, pm = [], []
    for d in dirs or []:
        q = norm(d.get('qualite') or '')
        if EXC_RX.search(q) or not DIR_RX.search(q): continue
        (pp if d.get('type_dirigeant')=='personne physique' else pm).append(d)
    return pp, pm

mags = json.load(open('bio_magasins.json'))
par_siren = {}
for m in mags:
    par_siren.setdefault(m['siren'], []).append(m)
reseaux = {s: v for s, v in par_siren.items() if 3 <= len(v) <= 60}

out = []
for siren, boutiques in reseaux.items():
    d = get(f"{BASE}?q={siren}&per_page=1")
    time.sleep(0.2)
    if not d or not d.get('results') or d['results'][0].get('siren') != siren: continue
    r = d['results'][0]
    pp, pm = effectifs(r.get('dirigeants'))
    via, holding_cat = None, None
    if not pp and pm:
        for h in pm:
            hd = get(f"{BASE}?q={h.get('siren')}&per_page=1"); time.sleep(0.2)
            if hd and hd.get('results') and hd['results'][0].get('siren') == h.get('siren'):
                hr = hd['results'][0]
                hp, _ = effectifs(hr.get('dirigeants'))
                if hp:
                    pp = hp; via = hr.get('nom_complet'); holding_cat = hr.get('categorie_entreprise'); break
    enseignes = Counter((b['reseau'] or 'indépendant') for b in boutiques)
    fin = r.get('finances') or {}
    an = max(fin.keys()) if fin else None
    dates = [x.get('date_de_naissance') for x in pp if x.get('date_de_naissance')]
    doyen = min(dates) if dates else None
    out.append({
        'siren': siren, 'denomination': r.get('nom_complet'),
        'categorie': r.get('categorie_entreprise'), 'holding_categorie': holding_cat,
        'nb_magasins_bio': len(boutiques), 'nb_etablissements': r.get('nombre_etablissements_ouverts'),
        'enseigne': enseignes.most_common(1)[0][0],
        'villes': sorted({f"{b['cp']} {b['ville']}" for b in boutiques if b['cp']}),
        'region_siege': (r.get('siege') or {}).get('region'),
        'cp_siege': (r.get('siege') or {}).get('code_postal'),
        'ville_siege': (r.get('siege') or {}).get('libelle_commune'),
        'adresse_siege': (r.get('siege') or {}).get('adresse'),
        'effectif': r.get('tranche_effectif_salarie'), 'date_creation': r.get('date_creation'),
        'ca': (fin.get(an) or {}).get('ca') if an else None,
        'resultat': (fin.get(an) or {}).get('resultat_net') if an else None,
        'annee_finances': an,
        'dirigeant_nom': (f"{pp[0].get('prenoms') or ''} {pp[0].get('nom') or ''}".strip() if pp else None),
        'dirigeant_naissance': doyen,
        'dirigeant_qualite': ([x for x in pp if x.get('date_de_naissance')==doyen][0].get('qualite') if doyen else (pp[0].get('qualite') if pp else None)),
        'via_holding': via,
        'releve_possible': any(x.get('date_de_naissance') and x['date_de_naissance'] > '1981-12' for x in pp),
        'co_dirigeants': [{'n': f"{x.get('prenoms') or ''} {x.get('nom') or ''}".strip(), 'd': x.get('date_de_naissance'), 'q': x.get('qualite')} for x in pp],
    })

json.dump(out, open('bio_reseaux.json', 'w'), ensure_ascii=False, indent=1)
SUD = ('04','05','06','13','83','84','30','34','11','66','31','09','81','82','12','32','46','65','48','07','26')
for x in sorted(out, key=lambda y: -(y['nb_magasins_bio'])):
    sud = 'SUD' if (x['cp_siege'] or '').startswith(SUD) else '   '
    age = 2026 - int(x['dirigeant_naissance'][:4]) if x['dirigeant_naissance'] else '?'
    print(f"{sud} {x['nb_magasins_bio']:>2} mag | {x['denomination'][:38]:38} | {x['cp_siege']} {x['ville_siege'][:18]:18} | {x['enseigne'][:14]:14} | cat {x['categorie']}/{x['holding_categorie'] or '-'} | dirigeant {str(x['dirigeant_nom'])[:24]:24} {age} ans | CA {x['ca']}")
