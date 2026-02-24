/*
  # Fix Database Triggers, Settlements, and Prevent Stale State

  1. Ensure debts table exists with proper schema
  2. Add RLS policies for debts table (allows trigger to create debt records)
  3. Indexes for debts table and soft-delete filtering
  4. Updated trigger function handling shared expenses AND settlements
  5. Trigger for updated_at timestamp on transactions
  6. Trigger for create_user_profile on new signups
  7. Fix transaction RLS to allow viewing shared/settlement transactions
  8. Enable Supabase Realtime on key tables
  9. Backfill existing transactions into debts table
*/

-- ============================================================
-- 1. Ensure debts table exists
-- ============================================================
CREATE TABLE IF NOT EXISTS public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
  debtor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  creditor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. RLS policies for debts table
-- ============================================================
DROP POLICY IF EXISTS "System can insert debts" ON public.debts;
CREATE POLICY "System can insert debts"
  ON public.debts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own debts" ON public.debts;
CREATE POLICY "Users can view own debts"
  ON public.debts
  FOR SELECT
  TO authenticated
  USING (
    creditor_id = (select auth.uid()) OR
    debtor_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own debts" ON public.debts;
CREATE POLICY "Users can delete own debts"
  ON public.debts
  FOR DELETE
  TO authenticated
  USING (
    creditor_id = (select auth.uid()) OR
    debtor_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage own debts" ON public.debts;
CREATE POLICY "Users can manage own debts"
  ON public.debts
  FOR UPDATE
  TO authenticated
  USING (
    creditor_id = (select auth.uid()) OR
    debtor_id = (select auth.uid())
  )
  WITH CHECK (
    creditor_id = (select auth.uid()) OR
    debtor_id = (select auth.uid())
  );

-- ============================================================
-- 3. Indexes for debts table and soft-delete filtering
-- ============================================================
CREATE INDEX IF NOT EXISTS debts_creditor_id_idx ON public.debts(creditor_id);
CREATE INDEX IF NOT EXISTS debts_debtor_id_idx ON public.debts(debtor_id);
CREATE INDEX IF NOT EXISTS debts_transaction_id_idx ON public.debts(transaction_id);

CREATE INDEX IF NOT EXISTS transactions_deleted_at_idx ON public.transactions(deleted_at)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 4. Updated trigger function for debt calculation
--    Handles: shared expenses, settlements, soft-deletes
--
--    Settlement logic:
--    - When user pays friend (type='personal', SETTLEMENT:):
--      Creates debt: friend owes user (offsets user's existing debt to friend)
--    - When friend pays user (type='revenue', SETTLEMENT:):
--      Creates debt: user owes friend (offsets friend's existing debt to user)
--    - Friend is identified from split_details (new format) or
--      parsed from description email (old format fallback)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_calculate_shared_expense_debts()
RETURNS TRIGGER AS $$
DECLARE
  payer_record RECORD;
  participant_record RECORD;
  v_user_id UUID;
  v_net_balance NUMERIC;
  v_debtor_id UUID;
  v_creditor_id UUID;
  v_debt_amount NUMERIC;
  v_debtor_remaining NUMERIC;
  v_creditor_remaining NUMERIC;
  v_friend_id UUID;
  v_friend_email TEXT;
BEGIN
  -- If the transaction was soft-deleted, remove all associated debts
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.debts WHERE transaction_id = NEW.id;
    RETURN NEW;
  END IF;

  -- ============================================================
  -- Handle SETTLEMENT transactions
  -- ============================================================
  IF NEW.description LIKE 'SETTLEMENT:%' THEN
    -- Clear any existing debts for this settlement transaction
    DELETE FROM public.debts WHERE transaction_id = NEW.id;

    v_friend_id := NULL;

    -- New format: get friend from split_details.participants
    IF NEW.split_details IS NOT NULL
       AND (NEW.split_details->>'method') = 'settlement'
       AND jsonb_array_length(COALESCE(NEW.split_details->'participants', '[]'::jsonb)) > 0 THEN
      v_friend_id := (NEW.split_details->'participants'->0->>'user_id')::UUID;
    ELSE
      -- Old format fallback: parse email from description
      IF NEW.type = 'personal' THEN
        v_friend_email := TRIM(SUBSTRING(NEW.description FROM 'SETTLEMENT: Paid (.+)$'));
      ELSE
        v_friend_email := TRIM(SUBSTRING(NEW.description FROM 'SETTLEMENT: Received from (.+)$'));
      END IF;

      IF v_friend_email IS NOT NULL AND v_friend_email != '' THEN
        SELECT id INTO v_friend_id
        FROM public.user_profiles
        WHERE email = v_friend_email
        LIMIT 1;
      END IF;
    END IF;

    -- Create the offsetting debt record if we identified the friend
    IF v_friend_id IS NOT NULL THEN
      IF NEW.type = 'personal' THEN
        -- User paid friend -> friend now "owes" user (offsets user's debt to friend)
        INSERT INTO public.debts (transaction_id, debtor_id, creditor_id, amount)
        VALUES (NEW.id, v_friend_id, NEW.user_id, NEW.amount);
      ELSE
        -- Friend paid user -> user now "owes" friend (offsets friend's debt to user)
        INSERT INTO public.debts (transaction_id, debtor_id, creditor_id, amount)
        VALUES (NEW.id, NEW.user_id, v_friend_id, NEW.amount);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- ============================================================
  -- Skip non-shared, non-settlement transactions
  -- ============================================================
  IF NEW.type != 'shared' OR NEW.split_details IS NULL OR NEW.payers IS NULL THEN
    DELETE FROM public.debts WHERE transaction_id = NEW.id;
    RETURN NEW;
  END IF;

  -- ============================================================
  -- Handle shared transactions: calculate debts from payers/participants
  -- ============================================================
  DELETE FROM public.debts WHERE transaction_id = NEW.id;

  -- Use a temporary table to accumulate net balances
  CREATE TEMP TABLE IF NOT EXISTS _temp_balances (
    user_id UUID PRIMARY KEY,
    net_balance NUMERIC DEFAULT 0
  );
  DELETE FROM _temp_balances;

  -- Add amounts paid (positive = overpaid, they are owed money)
  FOR payer_record IN
    SELECT
      (p ->> 'user_id')::UUID AS uid,
      (p ->> 'amount_paid')::NUMERIC AS paid
    FROM jsonb_array_elements(NEW.payers) AS p
  LOOP
    INSERT INTO _temp_balances (user_id, net_balance)
    VALUES (payer_record.uid, payer_record.paid)
    ON CONFLICT (user_id) DO UPDATE
      SET net_balance = _temp_balances.net_balance + EXCLUDED.net_balance;
  END LOOP;

  -- Subtract share amounts (negative = they owe money)
  FOR participant_record IN
    SELECT
      (p ->> 'user_id')::UUID AS uid,
      (p ->> 'share_amount')::NUMERIC AS share
    FROM jsonb_array_elements(NEW.split_details -> 'participants') AS p
  LOOP
    INSERT INTO _temp_balances (user_id, net_balance)
    VALUES (participant_record.uid, -participant_record.share)
    ON CONFLICT (user_id) DO UPDATE
      SET net_balance = _temp_balances.net_balance + EXCLUDED.net_balance;
  END LOOP;

  -- Create debt records: pair debtors with creditors
  FOR v_debtor_id, v_debtor_remaining IN
    SELECT user_id, ABS(net_balance) FROM _temp_balances WHERE net_balance < -0.01
  LOOP
    FOR v_creditor_id, v_creditor_remaining IN
      SELECT user_id, net_balance FROM _temp_balances WHERE net_balance > 0.01 ORDER BY net_balance DESC
    LOOP
      v_debt_amount := LEAST(v_debtor_remaining, v_creditor_remaining);

      IF v_debt_amount > 0.01 THEN
        INSERT INTO public.debts (transaction_id, debtor_id, creditor_id, amount)
        VALUES (NEW.id, v_debtor_id, v_creditor_id, ROUND(v_debt_amount, 2));

        v_debtor_remaining := v_debtor_remaining - v_debt_amount;

        UPDATE _temp_balances
        SET net_balance = net_balance - v_debt_amount
        WHERE user_id = v_creditor_id;
      END IF;

      IF v_debtor_remaining <= 0.01 THEN EXIT; END IF;
    END LOOP;
  END LOOP;

  DROP TABLE IF EXISTS _temp_balances;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Recreate the trigger for transaction changes
-- ============================================================
DROP TRIGGER IF EXISTS after_shared_expense_change ON public.transactions;

CREATE TRIGGER after_shared_expense_change
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION fn_calculate_shared_expense_debts();

-- ============================================================
-- 6. Ensure updated_at trigger exists on transactions
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 7. Ensure create_user_profile trigger exists
-- ============================================================
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS create_user_profile_trigger ON auth.users;

CREATE TRIGGER create_user_profile_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();

-- ============================================================
-- 8. Fix transaction RLS: allow users to view transactions
--    they are involved in (as creator, payer, or participant)
--    This is needed so settlement counterparties and shared
--    expense participants can see relevant transactions.
-- ============================================================
DROP POLICY IF EXISTS "Users can view transactions they are involved in" ON public.transactions;
CREATE POLICY "Users can view transactions they are involved in"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR payers @> ('[{"user_id": "' || (select auth.uid())::text || '"}]')::jsonb
    OR split_details -> 'participants' @> ('[{"user_id": "' || (select auth.uid())::text || '"}]')::jsonb
  );

-- ============================================================
-- 9. Enable Supabase Realtime on key tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;

-- ============================================================
-- 10. Backfill: Process existing transactions to populate debts
--     This UPDATE triggers the AFTER UPDATE trigger which calls
--     fn_calculate_shared_expense_debts() for each relevant row,
--     populating the debts table with records for both shared
--     expenses and settlements.
-- ============================================================
UPDATE public.transactions
SET updated_at = now()
WHERE deleted_at IS NULL
  AND (type = 'shared' OR description LIKE 'SETTLEMENT:%');
