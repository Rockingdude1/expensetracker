/*
  # Fix Database Triggers and Prevent Stale State

  1. Ensure debts table exists with proper schema
  2. Add INSERT policy for debts table (allows trigger to create debt records)
  3. Fix after_shared_expense_change trigger for INSERT/UPDATE/soft-DELETE
  4. Add trigger for updated_at timestamp on transactions
  5. Add trigger for cascading debt deletion on soft-delete
  6. Add index on transactions.deleted_at for efficient soft-delete filtering
  7. Ensure create_user_profile trigger fires correctly for new signups
  8. Enable Supabase Realtime on key tables
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
-- 2. Add INSERT policy for debts table (missing - needed by trigger)
-- ============================================================
DROP POLICY IF EXISTS "System can insert debts" ON public.debts;
CREATE POLICY "System can insert debts"
  ON public.debts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Ensure SELECT policy exists
DROP POLICY IF EXISTS "Users can view own debts" ON public.debts;
CREATE POLICY "Users can view own debts"
  ON public.debts
  FOR SELECT
  TO authenticated
  USING (
    creditor_id = (select auth.uid()) OR
    debtor_id = (select auth.uid())
  );

-- Ensure DELETE policy exists
DROP POLICY IF EXISTS "Users can delete own debts" ON public.debts;
CREATE POLICY "Users can delete own debts"
  ON public.debts
  FOR DELETE
  TO authenticated
  USING (
    creditor_id = (select auth.uid()) OR
    debtor_id = (select auth.uid())
  );

-- Ensure UPDATE policy exists
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
-- 3. Indexes for debts table
-- ============================================================
CREATE INDEX IF NOT EXISTS debts_creditor_id_idx ON public.debts(creditor_id);
CREATE INDEX IF NOT EXISTS debts_debtor_id_idx ON public.debts(debtor_id);
CREATE INDEX IF NOT EXISTS debts_transaction_id_idx ON public.debts(transaction_id);

-- ============================================================
-- 4. Index on transactions.deleted_at for efficient soft-delete filtering
-- ============================================================
CREATE INDEX IF NOT EXISTS transactions_deleted_at_idx ON public.transactions(deleted_at)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 5. Updated trigger function for shared expense debt calculation
--    Now handles INSERT, UPDATE, and soft-DELETE (deleted_at set)
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
BEGIN
  -- If the transaction was soft-deleted, remove all associated debts
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.debts WHERE transaction_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Only process shared transactions with valid data
  IF NEW.type != 'shared' OR NEW.split_details IS NULL OR NEW.payers IS NULL THEN
    -- For non-shared transactions, clean up any existing debts
    DELETE FROM public.debts WHERE transaction_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Clear existing debts for this transaction
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
-- 6. Recreate the trigger for shared expense changes
-- ============================================================
DROP TRIGGER IF EXISTS after_shared_expense_change ON public.transactions;

CREATE TRIGGER after_shared_expense_change
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION fn_calculate_shared_expense_debts();

-- ============================================================
-- 7. Ensure updated_at trigger exists on transactions
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
-- 8. Ensure create_user_profile trigger exists
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
-- 9. Enable Supabase Realtime on key tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
