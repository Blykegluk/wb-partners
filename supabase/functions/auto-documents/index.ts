import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

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

function buildAvisHtml(soc: any, bail: any, bien: any, loc: any, mois: number, annee: number): string {
  const loyerHT = getLoyerPourMois(bail, mois, annee);
  const charges = bail.charges || 0;
  const total = loyerHT + charges;
  const periode = `${MONTHS[mois]} ${annee}`;

  return `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1a2d4e;max-width:600px;margin:0 auto;padding:32px 20px;font-size:13px;line-height:1.6">
    <div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #1a2d4e;padding-bottom:16px;margin-bottom:24px">
      <img src="https://wbpartners.fr/logo.png" alt="" width="40" height="40" style="border-radius:8px" />
      <div>
        <div style="font-size:18px;font-weight:900;letter-spacing:3px">${soc.nom_affiche || soc.nom || 'WB Partners'}</div>
        <div style="font-size:10px;color:#94a3b8">Gestion Immobilière</div>
      </div>
    </div>

    <h1 style="font-size:18px;font-weight:700;margin-bottom:4px">Avis d'Échéance</h1>
    <p style="font-size:12px;color:#64748b;margin-bottom:24px">Période : ${periode} — Émis le ${new Date().toLocaleDateString('fr-FR')}</p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:20px">
      <div>
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;letter-spacing:1px">Bailleur</div>
        <strong>${soc.nom || '—'}</strong>${soc.siret ? `<br>SIRET : ${soc.siret}` : ''}
      </div>
      <div>
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;letter-spacing:1px">Locataire</div>
        <strong>${loc.raison_sociale || `${loc.prenom || ''} ${loc.nom || ''}`}</strong>
      </div>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:12px">
      <strong>Bien :</strong> ${bien.adresse}, ${bien.ville} ${bien.code_postal}
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead><tr style="background:#1a2d4e;color:#fff">
        <th style="padding:10px 14px;text-align:left;font-size:11px">Désignation</th>
        <th style="padding:10px 14px;text-align:right;font-size:11px">HT</th>
        <th style="padding:10px 14px;text-align:right;font-size:11px">TVA 20%</th>
        <th style="padding:10px 14px;text-align:right;font-size:11px">TTC</th>
      </tr></thead>
      <tbody>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #f1f5f9">Loyer</td>
          <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(loyerHT)}</td>
          <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(loyerHT * 0.2)}</td>
          <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(loyerHT * 1.2)}</td></tr>
        ${charges > 0 ? `<tr><td style="padding:10px 14px;border-bottom:1px solid #f1f5f9">Charges</td>
          <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(charges)}</td>
          <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(charges * 0.2)}</td>
          <td style="padding:10px 14px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(charges * 1.2)}</td></tr>` : ''}
        <tr style="background:#eff6ff;font-weight:700;border-top:2px solid #1a2d4e">
          <td style="padding:10px 14px" colspan="3"><strong>Total à régler avant le 1er ${periode}</strong></td>
          <td style="padding:10px 14px;text-align:right"><strong>${fmt(total * 1.2)}</strong></td></tr>
      </tbody>
    </table>

    ${soc.iban ? `<div style="background:#1a2d4e;color:#fff;border-radius:8px;padding:14px 20px;margin-bottom:20px">
      <div style="font-size:10px;opacity:.6;margin-bottom:3px">Virement — IBAN</div>
      <div style="font-size:14px;font-weight:600">${soc.iban}</div>
      ${soc.bic ? `<div style="font-size:10px;opacity:.6;margin-top:8px">BIC : ${soc.bic}</div>` : ''}
    </div>` : ''}

    <p style="font-size:11px;color:#94a3b8;font-style:italic">Indice de révision : ${bail.indice_revision || 'ILC'} — Bail ${bail.type_bail || 'commercial'}</p>
    <div style="text-align:center;color:#94a3b8;font-size:11px;margin-top:32px;padding-top:12px;border-top:1px solid #f1f5f9">${soc.nom || 'WB Partners'}${soc.siret ? ` — SIRET ${soc.siret}` : ''}</div>
  </div>`;
}

function buildRelanceHtml(soc: any, bail: any, bien: any, loc: any, impayees: any[]): string {
  const totalDu = impayees.reduce((s: number, t: any) => s + (t.montant_loyer || 0) + (t.montant_charges || 0), 0);
  const periodes = impayees.map((t: any) => `${MONTHS[t.mois]} ${t.annee}`).join(', ');

  return `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1a2d4e;max-width:600px;margin:0 auto;padding:32px 20px;font-size:13px;line-height:1.6">
    <div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #1a2d4e;padding-bottom:16px;margin-bottom:24px">
      <img src="https://wbpartners.fr/logo.png" alt="" width="40" height="40" style="border-radius:8px" />
      <div>
        <div style="font-size:18px;font-weight:900;letter-spacing:3px">${soc.nom_affiche || soc.nom || 'WB Partners'}</div>
        <div style="font-size:10px;color:#94a3b8">Gestion Immobilière</div>
      </div>
    </div>

    <h1 style="font-size:18px;font-weight:700;color:#dc2626;margin-bottom:16px">Relance de paiement</h1>

    <p>Madame, Monsieur,</p>
    <p style="margin-top:12px">Sauf erreur de notre part, nous constatons que le(s) loyer(s) suivant(s) reste(nt) impayé(s) pour le bien situé au <strong>${bien.adresse}, ${bien.ville}</strong> :</p>
    <p style="margin:16px 0;font-weight:700">Périodes : ${periodes}</p>
    <p style="font-weight:700;font-size:16px;color:#dc2626;margin-bottom:16px">Montant total dû : ${fmt(totalDu * 1.2)} TTC</p>
    <p>Nous vous prions de bien vouloir régulariser cette situation dans les meilleurs délais.</p>

    ${soc.iban ? `<div style="background:#1a2d4e;color:#fff;border-radius:8px;padding:14px 20px;margin:20px 0">
      <div style="font-size:10px;opacity:.6;margin-bottom:3px">Virement — IBAN</div>
      <div style="font-size:14px;font-weight:600">${soc.iban}</div>
    </div>` : ''}

    <p style="font-size:11px;color:#94a3b8;font-style:italic;margin-top:20px">Ce courrier constitue une relance amiable. À défaut de règlement sous 8 jours, nous nous réservons le droit d'engager toute procédure utile.</p>
    <div style="text-align:center;color:#94a3b8;font-size:11px;margin-top:32px;padding-top:12px;border-top:1px solid #f1f5f9">${soc.nom || 'WB Partners'}${soc.siret ? ` — SIRET ${soc.siret}` : ''}</div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!RESEND_KEY) throw new Error("RESEND_KEY not configured");

    const { societe_id, mode } = await req.json();
    // mode: 'avis' (send avis d'échéance) or 'relance' (send relances for unpaid)
    // if no societe_id, process ALL sociétés (for cron)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    // Get sociétés to process
    let societes: any[];
    if (societe_id) {
      const { data } = await supabase.from("societe").select("*").eq("id", societe_id).single();
      societes = data ? [data] : [];
    } else {
      const { data } = await supabase.from("societe").select("*");
      societes = data || [];
    }

    let sentAvis = 0, sentRelance = 0, errors: string[] = [];

    for (const soc of societes) {
      // Get active baux with automation enabled
      const autoField = mode === 'relance' ? 'auto_relance' : 'auto_avis';
      const { data: bauxData } = await supabase.from("baux").select("*")
        .eq("societe_id", soc.id).eq("actif", true).eq(autoField, true);

      if (!bauxData || bauxData.length === 0) continue;

      for (const bail of bauxData) {
        const { data: loc } = await supabase.from("locataires").select("*").eq("id", bail.locataire_id).single();
        const { data: bien } = await supabase.from("biens").select("*").eq("id", bail.bien_id).single();
        if (!loc || !bien || !loc.email) continue;

        try {
          if (mode === 'relance') {
            // Find unpaid transactions for this bail
            const { data: impayees } = await supabase.from("transactions").select("*")
              .eq("bail_id", bail.id).eq("statut", "impayé");
            if (!impayees || impayees.length === 0) continue;

            const html = buildRelanceHtml(soc, bail, bien, loc, impayees);
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
              body: JSON.stringify({
                from: `${soc.nom_affiche || soc.nom || 'WB Partners'} <contact@wbpartners.fr>`,
                to: [loc.email],
                subject: `Relance de paiement — ${bien.adresse}, ${bien.ville}`,
                html,
              }),
            });
            sentRelance++;
          } else {
            // Send avis d'échéance for current month
            const html = buildAvisHtml(soc, bail, bien, loc, curMonth, curYear);
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
              body: JSON.stringify({
                from: `${soc.nom_affiche || soc.nom || 'WB Partners'} <contact@wbpartners.fr>`,
                to: [loc.email],
                subject: `Avis d'échéance — ${MONTHS[curMonth]} ${curYear} — ${bien.adresse}`,
                html,
              }),
            });
            sentAvis++;
          }
        } catch (e) {
          errors.push(`${loc.email}: ${(e as Error).message}`);
        }
      }
    }

    return new Response(JSON.stringify({ sentAvis, sentRelance, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
