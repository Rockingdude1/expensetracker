/*
  # Create Monthly Balances Table for Balance Carried Forward Feature

  ## Overview
  This migration creates a new table to track opening and closing balances for each user-month combination,
  enabling the "balance carried forward" feature where the closing balance of one month becomes the opening
  balance of the next month.

  ## Tables Created
  
  ### `monthly_balances`
  Stores the financial position (opening and closing balances) for each user by month.
  
  **Columns:**
  - `id` (uuid, primary key): Unique identifier for each monthly balance record
  - `user_id` (uuid, foreign key): References the user who owns this balance record
  - `month_year` (text): The month in YYYY-MM format (e.g., "2025-10" for October 2025)
  - `opening_balance` (numeric): Balance carried forward from the previous month's closing balance
  - `closing_balance` (numeric): Calculated as opening_balance + revenue - total_spent for the month
  - `created_at` (timestamptz): Timestamp when the record was created
  - `updated_at` (timestamptz): Timestamp when the record was last updated
  
  **Constraints:**
  - Unique constraint on (user_id, month_year) to prevent duplicate records for the same user-month
  - Check constraint to ensure month_year follows YYYY-MM format
  - Default values of 0 for opening_balance and closing_balance
  
  **Indexes:**
  - Index on user_id for efficient user-based queries
  - Index on month_year for efficient date-based queries
  - Composite index on (user_id, month_year) for optimal lookups

  ## Security (Row Level Security)
  
  ### RLS Policies
  - **SELECT**: Users can only view their own monthly balance records
  - **INSERT**: Users can only create balance records for themselves
  - **UPDATE**: Users can only update their own balance records
  - **DELETE**: Users can only delete their own balance records
  
  All policies are restrictive and check that auth.uid() matches the user_id.

  ## Functions
  
  ### `update_monthly_balances_timestamp()`
  Automatically updates the updated_at column whenever a monthly_balances record is modified.

  ## Important Notes
  
  1. **Data Integrity**: Opening balance should always equal the previous month's closing balance
  2. **Default Values**: Both opening_balance and closing_balance default to 0 for new records
  3. **Month Format**: Always use YYYY-MM format for consistency and proper sorting
  4. **Negative Balances**: Both opening_balance and closing_balance can be negative
*/

-- Create the monthly_balances table
CREATE TABLE IF NOT EXISTS public.monthly_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month_year text NOT NULL,
  opening_balance numeric DEFAULT 0 NOT NULL,
  closing_balance numeric DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Ensure unique user-month combinations
  CONSTRAINT unique_user_month UNIQUE (user_id, month_year),
  
  -- Ensure month_year follows YYYY-MM format (basic validation)
  CONSTRAINT valid_month_year_format CHECK (month_year ~ '^\d{4}-\d{2}$')
);

-- Enable Row Level Security
ALTER TABLE public.monthly_balances ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own monthly balances
CREATE POLICY "Users can view own monthly balances"
  ON public.monthly_balances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own monthly balances
CREATE POLICY "Users can insert own monthly balances"
  ON public.monthly_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own monthly balances
CREATE POLICY "Users can update own monthly balances"
  ON public.monthly_balances
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own monthly balances
CREATE POLICY "Users can delete own monthly balances"
  ON public.monthly_balances
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS monthly_balances_user_id_idx ON public.monthly_balances(user_id);
CREATE INDEX IF NOT EXISTS monthly_balances_month_year_idx ON public.monthly_balances(month_year);
CREATE INDEX IF NOT EXISTS monthly_balances_user_month_idx ON public.monthly_balances(user_id, month_year);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_monthly_balances_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_monthly_balances_updated_at
  BEFORE UPDATE ON public.monthly_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_balances_timestamp();