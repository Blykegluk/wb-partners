-- Réaffectation d'un compte bancaire à une autre société
--
-- Une connexion bancaire ne rapporte pas « le compte d'une société » mais tous
-- les comptes auxquels l'identifiant utilisé donne accès : un accès SG
-- Professionnels expose l'ensemble des comptes dont le dirigeant est
-- mandataire, souvent répartis sur plusieurs sociétés du groupe. La société
-- retenue au moment de la connexion ne peut donc être qu'une valeur par
-- défaut, corrigeable après coup.
--
-- On passe par une fonction plutôt que par un simple update sous RLS pour deux
-- raisons : le contrôle des droits doit porter sur les deux sociétés (on retire
-- un compte à l'une autant qu'on l'ajoute à l'autre), et le déplacement doit
-- entraîner les mouvements et défaire les rapprochements, sous peine de laisser
-- des écritures rattachées à des échéances qui ne les concernent plus.

create or replace function affecter_compte_bancaire(
  p_account_uid text,
  p_societe_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actuelle uuid;
begin
  select societe_id into v_actuelle
    from bank_accounts where account_uid = p_account_uid;

  if not found then
    raise exception 'Compte bancaire introuvable';
  end if;

  if v_actuelle is not null and not can_edit_societe(v_actuelle) then
    raise exception 'Droits insuffisants sur la société actuelle';
  end if;
  if not can_edit_societe(p_societe_id) then
    raise exception 'Droits insuffisants sur la société de destination';
  end if;

  if v_actuelle is not distinct from p_societe_id then
    return;
  end if;

  update bank_accounts
     set societe_id = p_societe_id
   where account_uid = p_account_uid;

  -- Les échéances rapprochées appartenaient à l'ancienne société : elles ont
  -- été marquées payées à tort et doivent redevenir dues.
  update transactions t
     set statut = 'en_attente', date_paiement = null
    from bank_transactions bt
   where bt.account_uid = p_account_uid
     and bt.transaction_id = t.id;

  update bank_transactions
     set societe_id = p_societe_id,
         statut_rapprochement = 'a_qualifier',
         transaction_id = null,
         score_confiance = null,
         suggestions = null,
         rapproche_le = null,
         rapproche_par = null,
         updated_at = now()
   where account_uid = p_account_uid;
end;
$$;

revoke all on function affecter_compte_bancaire(text, uuid) from public;
grant execute on function affecter_compte_bancaire(text, uuid) to authenticated;
