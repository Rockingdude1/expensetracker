/*
  # V2: Create Unified Transactions Table for Collaborative Expense Tracker

  1. New Table: `transactions`
     - `id`: (uuid, primary key)
     - `user_id`: (uuid, foreign key to auth.users, tracks the creator)
     - `type`: (text, 'revenue', 'personal', 'shared')
     - `amount`: (numeric)
     - `payment_mode`: (text, 'cash' or 'online')
     - `description`: (text)
     - `date`: (timestamptz)
     - `category`: (text)
     - `payers`: (jsonb, NOT NULL, array of who paid and how much)
     - `split_details`: (jsonb, how the expense is split among participants)
     - `activity_log`: (jsonb, tracks creation, updates, and deletions)
     - `deleted_at`: (timestamptz, for soft deletes)
     - `created_at`, `updated_at`: (timestamptz)

  2. Key Changes from V1
     - REMOVED `iou` from `type` check.
     - REMOVED `shared_details` and `iou_details` columns.
     - ADDED `payers`, `split_details`, `activity_log`, and `deleted_at` columns.
     - ADDED constraints to ensure data integrity for `payers` and `split_details`.
     - ADDED GIN indexes for fast querying on new `jsonb` columns.

  3. Security (Row Level Security)
     - RLS is enabled.
     - Users can INSERT transactions for themselves.
     - Users can SELECT, UPDATE, or DELETE any transaction where they are either the creator, a payer, or a participant in the split. This is the core of the collaborative functionality.
*/

-- Create the transactions table with the new unified schema
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('revenue', 'personal', 'shared')),
  amount numeric NOT NULL CHECK (amount > 0),
  payment_mode text NOT NULL CHECK (payment_mode IN ('cash', 'online')),
  description text DEFAULT '',
  date timestamptz NOT NULL DEFAULT now(),
  category text CHECK (category IN ('rent', 'food', 'social', 'transport', 'apparel', 'beauty', 'education', 'other')),
  
  -- New unified columns
  payers jsonb NOT NULL,
  split_details jsonb,
  activity_log jsonb,
  deleted_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- New constraints for data integrity
  CONSTRAINT transactions_payers_check CHECK (jsonb_typeof(payers) = 'array' AND jsonb_array_length(payers) > 0),
  CONSTRAINT check_split_details_for_shared CHECK ((type = 'shared' AND split_details IS NOT NULL) OR (type <> 'shared'))
);

-- Enable Row Level Security
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Drop old, simplistic policies if they exist
DROP POLICY IF EXISTS "Users can read own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;

-- Create new, smarter RLS policies for collaboration
CREATE POLICY "Users can view transactions they are part of"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = user_id) OR
    (payers @> ('[{\"user_id\": \"' || auth.uid() || '\"}]')::jsonb) OR
    (split_details -> 'participants' @> ('[{\"user_id\": \"' || auth.uid() || '\"}]')::jsonb)
  );

CREATE POLICY "Users can insert their own transactions"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update or delete transactions they are part of"
  ON public.transactions
  FOR UPDATE, DELETE
  TO authenticated
  USING (
    (auth.uid() = user_id) OR
    (payers @> ('[{\"user_id\": \"' || auth.uid() || '\"}]')::jsonb) OR
    (split_details -> 'participants' @> ('[{\"user_id\": \"' || auth.uid() || '\"}]')::jsonb)
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON public.transactions(date);
CREATE INDEX IF NOT EXISTS transactions_type_idx ON public.transactions(type);

-- Add GIN indexes for fast searching within the new JSONB columns
CREATE INDEX IF NOT EXISTS transactions_payers_idx ON public.transactions USING gin(payers);
CREATE INDEX IF NOT EXISTS transactions_split_details_idx ON public.transactions USING gin(split_details);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();