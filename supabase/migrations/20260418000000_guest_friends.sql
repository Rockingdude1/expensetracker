/*
  # Guest Friends Feature

  1. Add guest columns to user_profiles
  2. Change debts FK from auth.users to user_profiles (allows guest participants)
  3. Add auto-link trigger: when real user signs up with same email as a guest, link them
  4. Update RLS policies for debts to handle guest profiles
*/

-- ============================================================
-- 1. Add guest columns to user_profiles
-- ============================================================
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- 2. Change debts FK from auth.users to user_profiles
--    so guest profile IDs can be debtor/creditor
-- ============================================================

-- Drop old constraints
ALTER TABLE public.debts
  DROP CONSTRAINT IF EXISTS debts_debtor_id_fkey,
  DROP CONSTRAINT IF EXISTS debts_creditor_id_fkey;

-- Add new constraints pointing to user_profiles
ALTER TABLE public.debts
  ADD CONSTRAINT debts_debtor_id_fkey
    FOREIGN KEY (debtor_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT debts_creditor_id_fkey
    FOREIGN KEY (creditor_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

-- ============================================================
-- 3. RLS: allow users to manage guest profiles they created
-- ============================================================
DROP POLICY IF EXISTS "Users can insert guest profiles" ON public.user_profiles;
CREATE POLICY "Users can insert guest profiles"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Real profile created by trigger: id = auth.uid()
    id = (select auth.uid())
    -- Guest profile: created_by must be the caller, is_guest = true
    OR (is_guest = true AND created_by = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users can view own and guest profiles" ON public.user_profiles;
CREATE POLICY "Users can view own and guest profiles"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can update own and guest profiles" ON public.user_profiles;
CREATE POLICY "Users can update own and guest profiles"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = (select auth.uid())
    OR (is_guest = true AND created_by = (select auth.uid()))
  )
  WITH CHECK (
    id = (select auth.uid())
    OR (is_guest = true AND created_by = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete own guest profiles" ON public.user_profiles;
CREATE POLICY "Users can delete own guest profiles"
  ON public.user_profiles
  FOR DELETE
  TO authenticated
  USING (
    is_guest = true AND created_by = (select auth.uid())
  );

-- ============================================================
-- 4. Update debts RLS to handle guest profile IDs
--    (same logic but now debtor/creditor may be guest profiles
--     created_by the current user)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own debts" ON public.debts;
CREATE POLICY "Users can view own debts"
  ON public.debts
  FOR SELECT
  TO authenticated
  USING (
    creditor_id = (select auth.uid())
    OR debtor_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = creditor_id AND up.is_guest = true AND up.created_by = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = debtor_id AND up.is_guest = true AND up.created_by = (select auth.uid())
    )
  );

-- ============================================================
-- 5. Guest-friend connections: insert a row in user_connections
--    so getFriends() query returns guests alongside real friends.
--    (status = 'accepted', user_id_2 = guest profile id)
-- ============================================================

-- ============================================================
-- 6. Auto-link trigger: when a new real user signs up and their
--    email matches an existing guest profile, set linked_user_id
--    so the app can surface "this person is now on the app".
-- ============================================================
CREATE OR REPLACE FUNCTION fn_link_guest_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Find any guest profiles with matching email and link them
  UPDATE public.user_profiles
  SET linked_user_id = NEW.id
  WHERE is_guest = true
    AND email = NEW.email
    AND linked_user_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS link_guest_on_signup ON public.user_profiles;

CREATE TRIGGER link_guest_on_signup
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW
  WHEN (NEW.is_guest = false)
  EXECUTE FUNCTION fn_link_guest_on_signup();

-- ============================================================
-- 7. Index for guest lookup by creator and email
-- ============================================================
CREATE INDEX IF NOT EXISTS user_profiles_created_by_idx ON public.user_profiles(created_by) WHERE is_guest = true;
CREATE INDEX IF NOT EXISTS user_profiles_guest_email_idx ON public.user_profiles(email) WHERE is_guest = true;
