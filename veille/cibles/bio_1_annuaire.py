# Étape 1 : télécharger tous les opérateurs "Distribution" certifiés bio
# (annuaire officiel Agence Bio) et cartographier les réseaux par SIREN.
import json, time, urllib.request

BASE = "https://opendata.agencebio.org/api/gouv/operateurs/?activite=Distribution&nb=1000&debut={}"
items = []
debut = 0
while True:
    with urllib.request.urlopen(urllib.request.Request(BASE.format(debut), headers={"User-Agent": "wb-partners-etude"}), timeout=60) as r:
        d = json.load(r)
    batch = d.get('items', [])
    if not batch: break
    items.extend(batch)
    debut += len(batch)
    if debut >= int(d.get('nbTotal', 0)): break
    time.sleep(0.3)

# Ne garder que les magasins (spécialisés bio) avec un SIRET exploitable
mags = []
for it in items:
    cats = [c['nom'] for c in it.get('categories', [])]
    if 'Magasins spécialisés' not in cats: continue
    siret = (it.get('siret') or '').replace(' ', '')
    if len(siret) != 14: continue
    adrs = it.get('adressesOperateurs') or []
    cp = adrs[0].get('codePostal') if adrs else None
    ville = adrs[0].get('ville') if adrs else None
    mags.append({'siren': siret[:9], 'siret': siret, 'nom': it.get('denominationcourante') or it.get('raisonSociale'),
                 'reseau': (it.get('reseau') or '').strip(), 'gerant': it.get('gerant'),
                 'cp': cp, 'ville': ville})

json.dump(mags, open('bio_magasins.json', 'w'), ensure_ascii=False)
from collections import Counter
sirens = Counter(m['siren'] for m in mags)
multi = {s: n for s, n in sirens.items() if 3 <= n <= 25}
print(f"opérateurs distribution: {len(items)} | magasins spécialisés avec SIRET: {len(mags)}")
print(f"SIREN distincts: {len(sirens)} | réseaux de 3 à 25 magasins: {len(multi)}")
print('réseaux (enseigne) les plus fréquents:', Counter(m['reseau'] for m in mags if m['reseau']).most_common(15))
