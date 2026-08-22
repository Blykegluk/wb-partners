# Collecte des cibles "supermarché à dirigeant 60+" — IDF (11) et PACA (93).
# Règle demandée : l'âge se mesure sur le DIRIGEANT EFFECTIF uniquement —
# gérant / président / DG personne physique de la société d'exploitation, ou,
# si la présidence est tenue par une holding, le dirigeant personne physique
# de cette holding (résolution à 2 niveaux max). Les commissaires aux comptes
# et toute autre qualité ne comptent jamais.
import json, time, urllib.request, urllib.parse, re, sys

BASE = "https://recherche-entreprises.api.gouv.fr/search"
CUTOFF = "1966-08"      # né avant sept. 1966 => 60 ans ou plus au 2026-08
RELEVE = "1981-12"      # co-dirigeant né après 1981 (< 45 ans) = relève possible

def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"wb-partners-veille"}), timeout=25) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(1.5*(i+1))
    return None

# Qualités de direction effective (minuscules, sans accents pour le match)
DIRIGEANT_RX = re.compile(r"gerant|president|directeur general", re.I)
EXCLU_RX = re.compile(r"commissaire|surveillance|administrateur(?! judiciaire)", re.I)
def norm(s): 
    import unicodedata
    return unicodedata.normalize('NFD', s or '').encode('ascii','ignore').decode()

def dirigeants_effectifs(dirs):
    pp, pm = [], []
    for d in dirs or []:
        q = norm(d.get('qualite') or '')
        if EXCLU_RX.search(q) or not DIRIGEANT_RX.search(q):
            continue
        (pp if d.get('type_dirigeant')=='personne physique' else pm).append(d)
    return pp, pm

hold_cache = {}
def resoudre_holding(siren):
    if not siren or not siren.isdigit(): return []
    if siren in hold_cache: return hold_cache[siren]
    d = get(f"{BASE}?q={siren}&per_page=1")
    time.sleep(0.18)
    out = []
    if d and d.get('results'):
        r = d['results'][0]
        if r.get('siren') == siren:
            pp, _ = dirigeants_effectifs(r.get('dirigeants'))
            out = [dict(x, via_holding=r.get('nom_complet'), holding_siren=siren,
                        holding_categorie=r.get('categorie_entreprise')) for x in pp]
    hold_cache[siren] = out
    return out

cibles, examinees = [], 0
for region in ("11","93"):
    page = 1
    while True:
        d = get(f"{BASE}?activite_principale=47.11C,47.11D&categorie_entreprise=PME&region={region}&per_page=25&page={page}")
        if not d or not d.get('results'): break
        for r in d['results']:
            examinees += 1
            if r.get('etat_administratif') != 'A': continue
            cp_siege = ((r.get('siege') or {}).get('code_postal') or '')
            if cp_siege.startswith(('97','98')): continue
            pp, pm = dirigeants_effectifs(r.get('dirigeants'))
            via_holding = None
            # présidence par personne morale -> remonter à la holding
            holding_categorie = None
            if not pp and pm:
                for h in pm:
                    hp = resoudre_holding(h.get('siren'))
                    if hp:
                        pp = hp; via_holding = hp[0].get('via_holding')
                        holding_categorie = hp[0].get('holding_categorie'); break
            # holding ETI ou GE = filiale/franchise intégrée d'un gros groupe : hors cible
            if holding_categorie in ('ETI','GE'): continue
            if not pp: continue
            # dirigeant effectif le plus âgé (c'est lui qui transmet)
            dates = [x.get('date_de_naissance') for x in pp if x.get('date_de_naissance')]
            if not dates: continue
            doyen = min(dates)
            if doyen > CUTOFF: continue
            releve = any(x.get('date_de_naissance') and x['date_de_naissance'] > RELEVE for x in pp)
            lead = [x for x in pp if x.get('date_de_naissance')==doyen][0]
            fin = r.get('finances') or {}
            an = max(fin.keys()) if fin else None
            cibles.append({
                'siren': r.get('siren'), 'denomination': r.get('nom_complet'),
                'naf': r.get('activite_principale'), 'region': region,
                'ville': (r.get('siege') or {}).get('libelle_commune'),
                'code_postal': (r.get('siege') or {}).get('code_postal'),
                'adresse': (r.get('siege') or {}).get('adresse'),
                'nb_etablissements': r.get('nombre_etablissements_ouverts'),
                'effectif': r.get('tranche_effectif_salarie'),
                'date_creation': r.get('date_creation'),
                'dirigeant_nom': f"{lead.get('prenoms') or ''} {lead.get('nom') or ''}".strip(),
                'dirigeant_naissance': doyen, 'dirigeant_qualite': lead.get('qualite'),
                'via_holding': via_holding, 'holding_categorie': holding_categorie, 'releve_possible': releve,
                'co_dirigeants': [{'nom': f"{x.get('prenoms') or ''} {x.get('nom') or ''}".strip(),
                                   'naissance': x.get('date_de_naissance'), 'qualite': x.get('qualite')} for x in pp],
                'ca': (fin.get(an) or {}).get('ca') if an else None,
                'resultat': (fin.get(an) or {}).get('resultat_net') if an else None,
                'annee_finances': an,
            })
        if page >= d.get('total_pages', 1): break
        page += 1; time.sleep(0.18)

json.dump(cibles, open(sys.argv[1], 'w'), ensure_ascii=False)
print(f"examinées: {examinees} | cibles dirigeant effectif 60+: {len(cibles)} | holdings résolues: {len(hold_cache)}")
from collections import Counter
print('par région:', Counter(c['region'] for c in cibles))
print('via holding:', sum(1 for c in cibles if c['via_holding']))
print('avec CA connu:', sum(1 for c in cibles if c['ca']))
