/*
  # User Connections and Friends System

  1. New Tables
    - `user_connections`
      - `id` (uuid, primary key)
      - `user_id_1` (uuid, foreign key to auth.users)
      - `user_id_2` (uuid, foreign key to auth.users)
      - `status` (text, 'pending', 'accepted', 'blocked')
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text, unique)
      - `display_name` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for users to manage their own connections
    - Add policies for users to view connected friends

  3. Functions
    - Function to propagate shared expenses to connected users
    - Trigger to automatically create IOU transactions
*/

-- Create user_profiles table to store user information
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_connections table
CREATE TABLE IF NOT EXISTS user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id_2 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id_1, user_id_2)
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- RLS Policies for user_connections
CREATE POLICY "Users can read own connections"
  ON user_connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

CREATE POLICY "Users can create connections"
  ON user_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id_1);

CREATE POLICY "Users can update own connections"
  ON user_connections
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
DROP TRIGGER IF EXISTS create_user_profile_trigger ON auth.users;
CREATE TRIGGER create_user_profile_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();

-- Function to propagate shared expenses
CREATE OR REPLACE FUNCTION propagate_shared_expense()
RETURNS TRIGGER AS $$
DECLARE
  shared_detail jsonb;
  friend_email text;
  friend_id uuid;
  friend_split_percentage numeric;
  friend_amount numeric;
BEGIN
  -- Only process shared transactions
  IF NEW.type != 'shared' OR NEW.shared_details IS NULL THEN
    RETURN NEW;
  END IF;

  -- Loop through each person in shared_details
  FOR shared_detail IN SELECT * FROM jsonb_array_elements(NEW.shared_details)
  LOOP
    friend_email := shared_detail->>'personEmail';
    friend_split_percentage := (shared_detail->>'splitPercentage')::numeric;
    friend_amount := (NEW.amount * friend_split_percentage / 100);

    -- Find the friend's user ID by email
    SELECT up.id INTO friend_id
    FROM user_profiles up
    WHERE up.email = friend_email;

    -- Only create IOU if friend exists and is connected
    IF friend_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_connections uc
      WHERE ((uc.user_id_1 = NEW.user_id AND uc.user_id_2 = friend_id) OR
             (uc.user_id_1 = friend_id AND uc.user_id_2 = NEW.user_id))
      AND uc.status = 'accepted'
    ) THEN
      -- Create IOU transaction for the friend
      INSERT INTO transactions (
        user_id,
        type,
        amount,
        payment_mode,
        description,
        date,
        category,
        iou_details
      ) VALUES (
        friend_id,
        'iou',
        NEW.amount,
        NEW.payment_mode,
        'Split expense: ' || NEW.description,
        NEW.date,
        NEW.category,
        jsonb_build_object(
          'personName', (SELECT display_name FROM user_profiles WHERE id = NEW.user_id),
          'personEmail', (SELECT email FROM user_profiles WHERE id = NEW.user_id),
          'mySplitPercentage', friend_split_percentage,
          'originalTransactionId', NEW.id
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to propagate shared expenses
DROP TRIGGER IF EXISTS propagate_shared_expense_trigger ON transactions;
CREATE TRIGGER propagate_shared_expense_trigger
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION propagate_shared_expense();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS user_connections_user_id_1_idx ON user_connections(user_id_1);
CREATE INDEX IF NOT EXISTS user_connections_user_id_2_idx ON user_connections(user_id_2);
CREATE INDEX IF NOT EXISTS user_connections_status_idx ON user_connections(status);
CREATE INDEX IF NOT EXISTS user_profiles_email_idx ON user_profiles(email);