// Envoi des documents locatifs par email — contact@wbpartners.fr via Resend.
//
// Deux modes d'appel :
//
//   { mode: 'cron' } + en-tête x-cron-token
//     Passe quotidienne déclenchée par pg_cron (envois_documents_quotidien).
//     Pour chaque société ayant une ligne envois_config : quittances des
//     loyers fraîchement rapprochés, avis d'échéance au jour configuré,
//     relances puis mises en demeure aux paliers configurés. Une société
//     sans envois_config n'envoie rien — l'automatisation est un opt-in.
//
//   { mode: 'envoyer', type, transaction_id | (bail_id, mois, annee) }
//     + en-tête Authorization du navigateur : envoi unitaire à la demande
//     depuis l'écran Flux financier. L'utilisateur doit être éditeur ou
//     admin de la société.
//
// Chaque envoi — réussi ou non — est journalisé dans courriers_envoyes :
// c'est cette table qui alimente la colonne « dernier courrier » du suivi.
// Le commandement de payer n'est jamais envoyé par email : il n'a de valeur
// que signifié par commissaire de justice ; l'application le génère en PDF
// et le journalise en canal 'manuel'.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);

// Reprend src/lib/utils.js getLoyerPourMois : paliers an1/an2/an3 + franchise.
function getLoyerPourMois(bail: any, mois: number, annee: number): number {
  if (!bail.date_debut) return bail.loyer_ht || 0;
  const debut = new Date(bail.date_debut);
  const target = new Date(annee, mois, 1);
  const moisEcoules = (target.getFullYear() - debut.getFullYear()) * 12 + (target.getMonth() - debut.getMonth());
  if (bail.franchise_mois && moisEcoules < bail.franchise_mois) return 0;
  if (moisEcoules < 12 && bail.loyer_an1) return bail.loyer_an1;
  if (moisEcoules < 24 && bail.loyer_an2) return bail.loyer_an2;
  if (moisEcoules < 36 && bail.loyer_an3) return bail.loyer_an3;
  return bail.loyer_ht || 0;
}

// Reprend src/lib/calculs.js coefTva : l'ancienne version de cette fonction
// appliquait 20 % à tous les baux, y compris non assujettis.
const coefTva = (bail: any) =>
  bail?.tva_applicable === false ? 1 : 1 + Number(bail?.taux_tva ?? 20) / 100;

const nomLocataire = (loc: any) =>
  loc.raison_sociale || `${loc.prenom || ''} ${loc.nom || ''}`.trim() || 'Locataire';

// ── Gabarits HTML ───────────────────────────────────────────────

function enTete(soc: any): string {
  return `
    <div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #1a2d4e;padding-bottom:16px;margin-bottom:24px">
      <img src="https://wbpartners.fr/logo.png" alt="" width="40" height="40" style="border-radius:8px" />
      <div>
        <div style="font-size:18px;font-weight:900;letter-spacing:3px">${soc.nom_affiche || soc.nom || 'WB Partners'}</div>
        <div style="font-size:10px;color:#94a3b8">Gestion Immobilière</div>
      </div>
    </div>`;
}

function piedDePage(soc: any): string {
  return `<div style="text-align:center;color:#94a3b8;font-size:11px;margin-top:32px;padding-top:12px;border-top:1px solid #f1f5f9">${soc.nom || 'WB Partners'}${soc.siret ? ` — SIRET ${soc.siret}` : ''}</div>`;
}

function cadre(contenu: string): string {
  return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1a2d4e;max-width:600px;margin:0 auto;padding:32px 20px;font-size:13px;line-height:1.6">${contenu}</div>`;
}

function blocIban(soc: any): string {
  if (!soc.iban) return '';
  return `<div style="background:#1a2d4e;color:#fff;border-radius:8px;padding:14px 20px;margin:20px 0">
    <div style="font-size:10px;opacity:.6;margin-bottom:3px">Virement — IBAN</div>
    <div style="font-size:14px;font-weight:600">${soc.iban}</div>
    ${soc.bic ? `<div style="font-size:10px;opacity:.6;margin-top:8px">BIC : ${soc.bic}</div>` : ''}
  </div>`;
}

function tableMontants(bail: any, mois: number, annee: number): { html: string; totalTTC: number } {
  const loyerHT = getLoyerPourMois(bail, mois, annee);
  const charges = Number(bail.charges || 0);
  const coef = coefTva(bail);
  const tvaPct = Math.round((coef - 1) * 100);
  const totalTTC = (loyerHT + charges) * coef;

  const ligne = (label: string, ht: number) => `
    <tr><td style="padding:10px 14px;border-bottom:1px solid #f1f5f9">${label}</td>
      <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(ht)}</td>
      <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(ht * (coef - 1))}</td>
      <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(ht * coef)}</td></tr>`;

  const html = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead><tr style="background:#1a2d4e;color:#fff">
        <th style="padding:10px 14px;text-align:left;font-size:11px">Désignation</th>
        <th style="padding:10px 14px;text-align:right;font-size:11px">HT</th>
        <th style="padding:10px 14px;text-align:right;font-size:11px">TVA ${tvaPct}%</th>
        <th style="padding:10px 14px;text-align:right;font-size:11px">TTC</th>
      </tr></thead>
      <tbody>
        ${ligne('Loyer', loyerHT)}
        ${charges > 0 ? ligne('Charges', charges) : ''}
        <tr style="background:#eff6ff;font-weight:700;border-top:2px solid #1a2d4e">
          <td style="padding:10px 14px" colspan="3"><strong>Total TTC</strong></td>
          <td style="padding:10px 14px;text-align:right"><strong>${fmt(totalTTC)}</strong></td></tr>
      </tbody>
    </table>`;
  return { html, totalTTC };
}

function buildAvisHtml(soc: any, bail: any, bien: any, loc: any, mois: number, annee: number): string {
  const periode = `${MONTHS[mois]} ${annee}`;
  const { html: montants } = tableMontants(bail, mois, annee);
  return cadre(`
    ${enTete(soc)}
    <h1 style="font-size:18px;font-weight:700;margin-bottom:4px">Avis d'Échéance</h1>
    <p style="font-size:12px;color:#64748b;margin-bottom:24px">Période : ${periode} — Émis le ${new Date().toLocaleDateString('fr-FR')}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:20px">
      <div><div style="font-size:10px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;letter-spacing:1px">Bailleur</div>
        <strong>${soc.nom || '—'}</strong>${soc.siret ? `<br>SIRET : ${soc.siret}` : ''}</div>
      <div><div style="font-size:10px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;letter-spacing:1px">Locataire</div>
        <strong>${nomLocataire(loc)}</strong></div>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:12px">
      <strong>Bien :</strong> ${bien.adresse}, ${bien.ville} ${bien.code_postal || ''}
    </div>
    ${montants}
    ${blocIban(soc)}
    <p style="font-size:11px;color:#94a3b8;font-style:italic">Indice de révision : ${bail.indice_revision || 'ILC'} — Bail ${bail.type_bail || 'commercial'}</p>
    ${piedDePage(soc)}`);
}

function buildQuittanceHtml(soc: any, bail: any, bien: any, loc: any, ech: any): string {
  const periode = `${MONTHS[ech.mois]} ${ech.annee}`;
  const { html: montants } = tableMontants(bail, ech.mois, ech.annee);
  return cadre(`
    ${enTete(soc)}
    <h1 style="font-size:18px;font-weight:700;margin-bottom:4px">Quittance de Loyer</h1>
    <p style="font-size:12px;color:#64748b;margin-bottom:24px">Période : ${periode} — Émise le ${new Date().toLocaleDateString('fr-FR')}</p>
    <p>Nous, soussignés <strong>${soc.nom || '—'}</strong>, propriétaire du bien désigné ci-dessous,
    reconnaissons avoir reçu de <strong>${nomLocataire(loc)}</strong> le paiement intégral du loyer
    et des charges pour la période de <strong>${periode}</strong>, et lui en donnons quittance,
    sous réserve de tous nos droits.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:20px 0;font-size:12px">
      <strong>Bien :</strong> ${bien.adresse}, ${bien.ville} ${bien.code_postal || ''}
    </div>
    ${montants}
    <p style="font-size:11px;color:#94a3b8;font-style:italic">Cette quittance annule tous les reçus qui auraient pu être établis précédemment pour la même période.</p>
    ${piedDePage(soc)}`);
}

function buildRelanceHtml(soc: any, bail: any, bien: any, loc: any, impayees: any[]): string {
  const coef = coefTva(bail);
  const totalDu = impayees.reduce((s, t) => s + (Number(t.montant_loyer) || 0) + (Number(t.montant_charges) || 0), 0) * coef;
  const periodes = impayees.map((t) => `${MONTHS[t.mois]} ${t.annee}`).join(', ');
  return cadre(`
    ${enTete(soc)}
    <h1 style="font-size:18px;font-weight:700;color:#dc2626;margin-bottom:16px">Relance de paiement</h1>
    <p>Madame, Monsieur,</p>
    <p style="margin-top:12px">Sauf erreur de notre part, nous constatons que le(s) loyer(s) suivant(s)
    reste(nt) impayé(s) pour le bien situé au <strong>${bien.adresse}, ${bien.ville}</strong> :</p>
    <p style="margin:16px 0;font-weight:700">Périodes : ${periodes}</p>
    <p style="font-weight:700;font-size:16px;color:#dc2626;margin-bottom:16px">Montant total dû : ${fmt(totalDu)} TTC</p>
    <p>Nous vous prions de bien vouloir régulariser cette situation dans les meilleurs délais.</p>
    ${blocIban(soc)}
    <p style="font-size:11px;color:#94a3b8;font-style:italic;margin-top:20px">Ce courrier constitue une relance amiable. À défaut de règlement sous 8 jours, nous nous réservons le droit d'engager toute procédure utile.</p>
    ${piedDePage(soc)}`);
}

function buildMiseEnDemeureHtml(soc: any, bail: any, bien: any, loc: any, impayees: any[]): string {
  const coef = coefTva(bail);
  const totalDu = impayees.reduce((s, t) => s + (Number(t.montant_loyer) || 0) + (Number(t.montant_charges) || 0), 0) * coef;
  const periodes = impayees.map((t) => `${MONTHS[t.mois]} ${t.annee}`).join(', ');
  return cadre(`
    ${enTete(soc)}
    <h1 style="font-size:18px;font-weight:700;color:#dc2626;margin-bottom:4px">Mise en Demeure</h1>
    <p style="font-size:12px;color:#64748b;margin-bottom:20px">Envoyée le ${new Date().toLocaleDateString('fr-FR')} — vaut mise en demeure au sens de l'article 1344 du Code civil</p>
    <p>Madame, Monsieur,</p>
    <p style="margin-top:12px">Malgré notre relance restée sans effet, les loyers et charges suivants demeurent
    impayés pour le bien situé au <strong>${bien.adresse}, ${bien.ville}</strong> :</p>
    <p style="margin:16px 0;font-weight:700">Périodes : ${periodes}</p>
    <p style="font-weight:700;font-size:16px;color:#dc2626;margin-bottom:16px">Montant total dû : ${fmt(totalDu)} TTC</p>
    <p>En conséquence, nous vous mettons en demeure de régler l'intégralité de cette somme sous
    <strong>huit (8) jours</strong> à compter de la réception de la présente.</p>
    <p style="margin-top:12px">À défaut, nous engagerons sans autre avis toute procédure de recouvrement utile,
    en ce compris la mise en œuvre de la clause résolutoire du bail, les frais en résultant restant à votre charge.</p>
    ${blocIban(soc)}
    <p style="font-size:11px;color:#94a3b8;font-style:italic;margin-top:20px">La présente mise en demeure fait courir les intérêts au taux légal en application de l'article 1344-1 du Code civil.</p>
    ${piedDePage(soc)}`);
}

// ── Envoi + journalisation ──────────────────────────────────────

type Envoi = {
  societe_id: string; bail_id: string | null; transaction_id: string | null;
  type: string; mois: number | null; annee: number | null;
  destinataire: string; sujet: string; html: string;
  envoye_par: string | null;
};

async function envoyerEtJournaliser(supabase: any, soc: any, e: Envoi): Promise<{ ok: boolean; erreur?: string }> {
  let ok = false;
  let erreur: string | undefined;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: `${soc.nom_affiche || soc.nom || 'WB Partners'} <contact@wbpartners.fr>`,
        to: [e.destinataire],
        subject: e.sujet,
        html: e.html,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    ok = true;
  } catch (err) {
    erreur = (err as Error).message;
  }

  await supabase.from("courriers_envoyes").insert({
    societe_id: e.societe_id, bail_id: e.bail_id, transaction_id: e.transaction_id,
    type: e.type, mois: e.mois, annee: e.annee, canal: 'email',
    destinataire: e.destinataire, sujet: e.sujet,
    statut: ok ? 'envoye' : 'erreur', erreur: erreur || null,
    envoye_par: e.envoye_par,
  });

  return { ok, erreur };
}

async function dejaEnvoye(supabase: any, filtre: Record<string, unknown>): Promise<boolean> {
  let q = supabase.from("courriers_envoyes").select("id").eq("statut", "envoye").limit(1);
  for (const [k, v] of Object.entries(filtre)) q = q.eq(k, v);
  const { data } = await q;
  return !!(data && data.length > 0);
}

// ── Passe quotidienne ───────────────────────────────────────────

async function passeQuotidienne(supabase: any) {
  const bilan = { quittances: 0, avis: 0, relances: 0, misesEnDemeure: 0, erreurs: [] as string[] };
  const now = new Date();

  const { data: configs } = await supabase.from("envois_config").select("*");
  for (const cfg of configs || []) {
    const { data: soc } = await supabase.from("societe").select("*").eq("id", cfg.societe_id).single();
    if (!soc) continue;

    const { data: baux } = await supabase.from("baux").select("*")
      .eq("societe_id", soc.id).eq("actif", true);

    for (const bail of baux || []) {
      const { data: loc } = await supabase.from("locataires").select("*").eq("id", bail.locataire_id).single();
      const { data: bien } = await supabase.from("biens").select("*").eq("id", bail.bien_id).single();
      if (!loc || !bien || !loc.email) continue;

      const { data: echeances } = await supabase.from("transactions").select("*").eq("bail_id", bail.id);

      // 1. Quittances : chaque échéance rapprochée d'un virement, une fois.
      if (cfg.quittance_auto) {
        const { data: rapprochees } = await supabase.from("bank_transactions")
          .select("transaction_id").eq("societe_id", soc.id)
          .like("statut_rapprochement", "rapproche%").not("transaction_id", "is", null);
        const idsRapproches = new Set((rapprochees || []).map((r: any) => r.transaction_id));

        for (const ech of (echeances || []).filter((e: any) => e.statut === 'payé' && idsRapproches.has(e.id))) {
          if (await dejaEnvoye(supabase, { transaction_id: ech.id, type: 'quittance' })) continue;
          const r = await envoyerEtJournaliser(supabase, soc, {
            societe_id: soc.id, bail_id: bail.id, transaction_id: ech.id,
            type: 'quittance', mois: ech.mois, annee: ech.annee,
            destinataire: loc.email,
            sujet: `Quittance de loyer — ${MONTHS[ech.mois]} ${ech.annee} — ${bien.adresse}`,
            html: buildQuittanceHtml(soc, bail, bien, loc, ech),
            envoye_par: null,
          });
          r.ok ? bilan.quittances++ : bilan.erreurs.push(`quittance ${loc.email}: ${r.erreur}`);
        }
      }

      // 2. Avis d'échéance du mois en cours, à partir du jour configuré.
      if (cfg.avis_jour && now.getDate() >= cfg.avis_jour && bail.auto_avis) {
        const mois = now.getMonth(), annee = now.getFullYear();
        if (getLoyerPourMois(bail, mois, annee) > 0
          && !(await dejaEnvoye(supabase, { bail_id: bail.id, type: 'avis_echeance', mois, annee }))) {
          const r = await envoyerEtJournaliser(supabase, soc, {
            societe_id: soc.id, bail_id: bail.id, transaction_id: null,
            type: 'avis_echeance', mois, annee,
            destinataire: loc.email,
            sujet: `Avis d'échéance — ${MONTHS[mois]} ${annee} — ${bien.adresse}`,
            html: buildAvisHtml(soc, bail, bien, loc, mois, annee),
            envoye_par: null,
          });
          r.ok ? bilan.avis++ : bilan.erreurs.push(`avis ${loc.email}: ${r.erreur}`);
        }
      }

      // 3. Relance puis mise en demeure, aux paliers configurés. Le
      //    commandement n'est jamais automatique (signification huissier).
      if (bail.auto_relance) {
        const impayees = (echeances || []).filter((e: any) => e.statut === 'impayé');
        for (const ech of impayees) {
          const retardJours = Math.floor((now.getTime() - new Date(ech.annee, ech.mois, 1).getTime()) / 86400000);
          let type: string | null = null;
          if (retardJours >= cfg.mise_en_demeure_apres_jours) type = 'mise_en_demeure';
          else if (retardJours >= cfg.relance_apres_jours) type = 'relance';
          if (!type) continue;
          if (await dejaEnvoye(supabase, { transaction_id: ech.id, type })) continue;

          const html = type === 'mise_en_demeure'
            ? buildMiseEnDemeureHtml(soc, bail, bien, loc, impayees)
            : buildRelanceHtml(soc, bail, bien, loc, impayees);
          const r = await envoyerEtJournaliser(supabase, soc, {
            societe_id: soc.id, bail_id: bail.id, transaction_id: ech.id,
            type, mois: ech.mois, annee: ech.annee,
            destinataire: loc.email,
            sujet: `${type === 'mise_en_demeure' ? 'Mise en demeure' : 'Relance de paiement'} — ${bien.adresse}, ${bien.ville}`,
            html,
            envoye_par: null,
          });
          if (r.ok) {
            if (type === 'mise_en_demeure') bilan.misesEnDemeure++; else bilan.relances++;
            await supabase.from("transactions").update({ relance_count: (ech.relance_count || 0) + 1 }).eq("id", ech.id);
          } else {
            bilan.erreurs.push(`${type} ${loc.email}: ${r.erreur}`);
          }
        }
      }
    }
  }
  return bilan;
}

// ── Envoi unitaire depuis l'application ─────────────────────────

async function envoiUnitaire(supabase: any, userId: string, body: any) {
  const { type, transaction_id, bail_id, mois, annee } = body;
  if (!['quittance', 'avis_echeance', 'relance', 'mise_en_demeure'].includes(type)) {
    throw new Error(`type d'envoi inconnu ou non autorisé par email : ${type}`);
  }

  let ech: any = null;
  let bailId = bail_id;
  if (transaction_id) {
    const { data } = await supabase.from("transactions").select("*").eq("id", transaction_id).single();
    ech = data;
    if (!ech) throw new Error("échéance introuvable");
    bailId = ech.bail_id;
  }
  if (!bailId) throw new Error("bail_id ou transaction_id requis");

  const { data: bail } = await supabase.from("baux").select("*").eq("id", bailId).single();
  if (!bail) throw new Error("bail introuvable");

  // L'appelant doit pouvoir éditer la société (propriétaire, admin ou éditeur).
  const { data: soc } = await supabase.from("societe").select("*").eq("id", bail.societe_id).single();
  if (!soc) throw new Error("société introuvable");
  const { data: membre } = await supabase.from("societe_membres").select("role")
    .eq("societe_id", soc.id).eq("user_id", userId).maybeSingle();
  const peutEditer = soc.owner_id === userId || ['admin', 'editor'].includes(membre?.role);
  if (!peutEditer) throw new Error("droits insuffisants sur cette société");

  const { data: loc } = await supabase.from("locataires").select("*").eq("id", bail.locataire_id).single();
  const { data: bien } = await supabase.from("biens").select("*").eq("id", bail.bien_id).single();
  if (!loc || !bien) throw new Error("locataire ou bien introuvable");
  if (!loc.email) throw new Error(`aucune adresse email pour ${nomLocataire(loc)} — à renseigner dans Locataires`);

  let html: string, sujet: string;
  const m = ech ? ech.mois : mois, a = ech ? ech.annee : annee;

  if (type === 'quittance') {
    if (!ech) throw new Error("transaction_id requis pour une quittance");
    html = buildQuittanceHtml(soc, bail, bien, loc, ech);
    sujet = `Quittance de loyer — ${MONTHS[m]} ${a} — ${bien.adresse}`;
  } else if (type === 'avis_echeance') {
    if (m == null || a == null) throw new Error("mois et annee requis pour un avis");
    html = buildAvisHtml(soc, bail, bien, loc, m, a);
    sujet = `Avis d'échéance — ${MONTHS[m]} ${a} — ${bien.adresse}`;
  } else {
    const { data: echeances } = await supabase.from("transactions").select("*")
      .eq("bail_id", bail.id).eq("statut", "impayé");
    const impayees = (echeances && echeances.length > 0) ? echeances : (ech ? [ech] : []);
    if (impayees.length === 0) throw new Error("aucune échéance impayée sur ce bail");
    html = type === 'mise_en_demeure'
      ? buildMiseEnDemeureHtml(soc, bail, bien, loc, impayees)
      : buildRelanceHtml(soc, bail, bien, loc, impayees);
    sujet = `${type === 'mise_en_demeure' ? 'Mise en demeure' : 'Relance de paiement'} — ${bien.adresse}, ${bien.ville}`;
  }

  const r = await envoyerEtJournaliser(supabase, soc, {
    societe_id: soc.id, bail_id: bail.id, transaction_id: ech?.id || null,
    type, mois: m ?? null, annee: a ?? null,
    destinataire: loc.email, sujet, html,
    envoye_par: userId,
  });
  if (!r.ok) throw new Error(`envoi échoué : ${r.erreur}`);

  if ((type === 'relance' || type === 'mise_en_demeure') && ech) {
    await supabase.from("transactions").update({ relance_count: (ech.relance_count || 0) + 1 }).eq("id", ech.id);
  }

  return { envoye: true, type, destinataire: loc.email };
}

// ── Point d'entrée ──────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!RESEND_KEY) throw new Error("RESEND_KEY not configured");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const body = await req.json();

    if (body.mode === 'cron') {
      // Authentification par jeton dédié : le cron ne détient pas la clé de
      // service, seulement un jeton stocké au vault. Le schéma vault n'étant
      // pas exposé via PostgREST, on le relit par le RPC jeton_cron_documents
      // (security definer, réservé à service_role).
      const jeton = req.headers.get("x-cron-token");
      const { data: attendu } = await supabase.rpc("jeton_cron_documents");
      if (!jeton || !attendu || jeton !== attendu) {
        return new Response(JSON.stringify({ error: "jeton cron invalide" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const bilan = await passeQuotidienne(supabase);
      return new Response(JSON.stringify(bilan), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.mode === 'envoyer') {
      const auth = req.headers.get("Authorization") || "";
      const { data: { user } } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
      if (!user) {
        return new Response(JSON.stringify({ error: "non authentifié" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const resultat = await envoiUnitaire(supabase, user.id, body);
      return new Response(JSON.stringify(resultat), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Les anciens modes 'avis'/'relance' par société entière n'ont jamais
    // été branchés sur rien ; ils disparaissent au profit des deux ci-dessus.
    throw new Error(`mode inconnu : ${body.mode ?? '(absent)'} — attendu 'cron' ou 'envoyer'`);
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
