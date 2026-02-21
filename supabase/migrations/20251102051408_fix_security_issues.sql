/*
  # Fix Security Issues

  1. Add Indexes
    - Add covering indexes to foreign keys in debts table
    - These prevent N+1 query problems and improve performance
  
  2. Optimize RLS Policies
    - Replace direct auth.uid() calls with (select auth.uid()) in RLS policies
    - This prevents re-evaluation for each row and improves performance at scale
    - Affected tables: user_connections, transactions, user_profiles, debts, monthly_balances
  
  3. Remove Unused Indexes
    - Remove duplicate transaction indexes that are not being used
    - Remove unused user_connections and user_profiles indexes
    - Remove unused monthly_balances indexes
  
  4. Consolidate RLS Policies
    - Merge duplicate SELECT policies in debts table into single policy
    - Reduces policy complexity while maintaining security
  
  5. Security Enhancement
    - Improved auth handling in RLS for better performance
    - Removes redundant indexes to reduce maintenance overhead
*/

-- Add covering indexes to foreign keys in debts table
CREATE INDEX IF NOT EXISTS debts_creditor_id_idx ON debts(creditor_id);
CREATE INDEX IF NOT EXISTS debts_debtor_id_idx ON debts(debtor_id);
CREATE INDEX IF NOT EXISTS debts_transaction_id_idx ON debts(transaction_id);

-- Drop unused indexes
DROP INDEX IF EXISTS transactions_duplicate_date_idx;
DROP INDEX IF EXISTS transactions_duplicate_payers_idx;
DROP INDEX IF EXISTS transactions_duplicate_split_details_idx;
DROP INDEX IF EXISTS transactions_duplicate_type_idx;
DROP INDEX IF EXISTS transactions_duplicate_user_id_idx;
DROP INDEX IF EXISTS user_connections_status_idx;
DROP INDEX IF EXISTS user_connections_user_id_1_idx;
DROP INDEX IF EXISTS user_connections_user_id_2_idx;
DROP INDEX IF EXISTS user_profiles_email_idx;
DROP INDEX IF EXISTS monthly_balances_user_id_idx;
DROP INDEX IF EXISTS monthly_balances_month_year_idx;
DROP INDEX IF EXISTS monthly_balances_user_month_idx;

-- Optimize RLS policies by replacing auth.uid() with (select auth.uid())
-- This prevents re-evaluation for each row

-- user_profiles policies
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- user_connections policies
DROP POLICY IF EXISTS "Users can read own connections" ON user_connections;
CREATE POLICY "Users can read own connections"
  ON user_connections FOR SELECT
  TO authenticated
  USING (user_id_1 = (select auth.uid()) OR user_id_2 = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create connections" ON user_connections;
CREATE POLICY "Users can create connections"
  ON user_connections FOR INSERT
  TO authenticated
  WITH CHECK (user_id_1 = (select auth.uid()) OR user_id_2 = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own connections" ON user_connections;
CREATE POLICY "Users can update own connections"
  ON user_connections FOR UPDATE
  TO authenticated
  USING (user_id_1 = (select auth.uid()) OR user_id_2 = (select auth.uid()))
  WITH CHECK (user_id_1 = (select auth.uid()) OR user_id_2 = (select auth.uid()));

-- transactions policies
DROP POLICY IF EXISTS "Users can view transactions they are involved in" ON transactions;
CREATE POLICY "Users can view transactions they are involved in"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update transactions they are part of" ON transactions;
CREATE POLICY "Users can update transactions they are part of"
  ON transactions FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete transactions they are part of" ON transactions;
CREATE POLICY "Users can delete transactions they are part of"
  ON transactions FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- debts policies - consolidate duplicate SELECT policies
DROP POLICY IF EXISTS "Users can view their own debts" ON debts;
DROP POLICY IF EXISTS "Users can only manage debts linked to their transactions" ON debts;

CREATE POLICY "Users can view own debts"
  ON debts FOR SELECT
  TO authenticated
  USING (
    creditor_id = (select auth.uid()) OR
    debtor_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage own debts" ON debts;
CREATE POLICY "Users can manage own debts"
  ON debts FOR UPDATE
  TO authenticated
  USING (
    creditor_id = (select auth.uid()) OR
    debtor_id = (select auth.uid())
  )
  WITH CHECK (
    creditor_id = (select auth.uid()) OR
    debtor_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own debts" ON debts;
CREATE POLICY "Users can delete own debts"
  ON debts FOR DELETE
  TO authenticated
  USING (
    creditor_id = (select auth.uid()) OR
    debtor_id = (select auth.uid())
  );

-- monthly_balances policies
DROP POLICY IF EXISTS "Users can view own monthly balances" ON monthly_balances;
CREATE POLICY "Users can view own monthly balances"
  ON monthly_balances FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own monthly balances" ON monthly_balances;
CREATE POLICY "Users can insert own monthly balances"
  ON monthly_balances FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own monthly balances" ON monthly_balances;
CREATE POLICY "Users can update own monthly balances"
  ON monthly_balances FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own monthly balances" ON monthly_balances;
CREATE POLICY "Users can delete own monthly balances"
  ON monthly_balances FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));
