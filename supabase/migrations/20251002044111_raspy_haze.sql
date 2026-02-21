/*
  # Fix transaction update issues

  1. Update RLS policy for transaction updates
  2. Fix the shared expense calculation function
  3. Ensure proper JSON structure handling
*/

-- First, drop the existing problematic policy
DROP POLICY IF EXISTS "Users can update transactions they are part of" ON public.transactions;

-- Create a more robust RLS policy for updates
CREATE POLICY "Users can update transactions they are part of"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    -- User is the creator of the transaction
    auth.uid() = user_id 
    OR 
    -- User is in the payers array (check for user_id field)
    EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(payers) AS payer 
      WHERE (payer ->> 'user_id')::uuid = auth.uid()
    )
    OR 
    -- User is in the split_details participants (check for user_id field)
    EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(split_details -> 'participants') AS participant 
      WHERE (participant ->> 'user_id')::uuid = auth.uid()
    )
  );

-- Drop and recreate the shared expense calculation function with better logic
DROP FUNCTION IF EXISTS fn_calculate_shared_expense_debts();

CREATE OR REPLACE FUNCTION fn_calculate_shared_expense_debts()
RETURNS TRIGGER AS $$
DECLARE
  user_record RECORD;
  debtor_record RECORD;
  creditor_record RECORD;
  debt_amount NUMERIC;
BEGIN
  -- First, clear any existing debts for this transaction
  DELETE FROM public.debts WHERE transaction_id = NEW.id;

  -- Only process shared transactions
  IF NEW.type != 'shared' OR NEW.split_details IS NULL OR NEW.payers IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate net balances for each user involved in the transaction
  -- Create temporary table to store user balances
  CREATE TEMP TABLE IF NOT EXISTS temp_user_balances (
    user_id UUID,
    net_balance NUMERIC DEFAULT 0
  );

  -- Clear any existing data
  DELETE FROM temp_user_balances;

  -- Add amounts paid (positive contribution)
  INSERT INTO temp_user_balances (user_id, net_balance)
  SELECT 
    (payer ->> 'user_id')::UUID,
    SUM((payer ->> 'amount_paid')::NUMERIC)
  FROM jsonb_array_elements(NEW.payers) AS payer
  GROUP BY (payer ->> 'user_id')::UUID
  ON CONFLICT (user_id) DO UPDATE SET net_balance = temp_user_balances.net_balance + EXCLUDED.net_balance;

  -- Subtract share amounts (what they owe)
  INSERT INTO temp_user_balances (user_id, net_balance)
  SELECT 
    (participant ->> 'user_id')::UUID,
    -SUM((participant ->> 'share_amount')::NUMERIC)
  FROM jsonb_array_elements(NEW.split_details -> 'participants') AS participant
  GROUP BY (participant ->> 'user_id')::UUID
  ON CONFLICT (user_id) DO UPDATE SET net_balance = temp_user_balances.net_balance + EXCLUDED.net_balance;

  -- Create debt records between users
  -- For each debtor (negative balance), create debts to creditors (positive balance)
  FOR debtor_record IN 
    SELECT user_id, ABS(net_balance) as debt_amount 
    FROM temp_user_balances 
    WHERE net_balance < -0.01  -- Small threshold to avoid floating point issues
  LOOP
    FOR creditor_record IN 
      SELECT user_id, net_balance as credit_amount 
      FROM temp_user_balances 
      WHERE net_balance > 0.01  -- Small threshold to avoid floating point issues
      ORDER BY net_balance DESC  -- Start with largest creditors
    LOOP
      -- Calculate the debt amount (minimum of what debtor owes and creditor is owed)
      debt_amount := LEAST(debtor_record.debt_amount, creditor_record.credit_amount);
      
      IF debt_amount > 0.01 THEN  -- Only create meaningful debts
        -- Insert the debt record
        INSERT INTO public.debts (transaction_id, debtor_id, creditor_id, amount)
        VALUES (NEW.id, debtor_record.user_id, creditor_record.user_id, debt_amount);
        
        -- Update remaining amounts
        debtor_record.debt_amount := debtor_record.debt_amount - debt_amount;
        creditor_record.credit_amount := creditor_record.credit_amount - debt_amount;
        
        -- Update the temp table for the creditor
        UPDATE temp_user_balances 
        SET net_balance = creditor_record.credit_amount 
        WHERE user_id = creditor_record.user_id;
      END IF;
      
      -- If debtor's debt is fully allocated, move to next debtor
      IF debtor_record.debt_amount <= 0.01 THEN
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  -- Clean up temp table
  DROP TABLE IF EXISTS temp_user_balances;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists and is properly configured
DROP TRIGGER IF EXISTS after_shared_expense_change ON public.transactions;

CREATE TRIGGER after_shared_expense_change
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION fn_calculate_shared_expense_debts();