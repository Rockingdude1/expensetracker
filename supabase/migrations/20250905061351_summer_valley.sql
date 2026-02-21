/*
  # Update bidirectional transaction synchronization

  1. Enhanced Functions
    - Update existing propagate_shared_expense function to handle both directions
    - Add function to create reverse IOU transactions
    
  2. Triggers
    - Update trigger to handle both shared and IOU transactions
    
  3. Security
    - Maintain existing RLS policies
*/

-- Drop existing function and trigger to recreate them
DROP TRIGGER IF EXISTS propagate_shared_expense_trigger ON transactions;
DROP FUNCTION IF EXISTS propagate_shared_expense();

-- Enhanced function to handle bidirectional synchronization
CREATE OR REPLACE FUNCTION propagate_shared_expense()
RETURNS TRIGGER AS $$
DECLARE
    friend_detail JSONB;
    friend_profile RECORD;
    reverse_transaction_id UUID;
BEGIN
    -- Only process shared and iou transactions
    IF NEW.type NOT IN ('shared', 'iou') THEN
        RETURN NEW;
    END IF;

    -- Handle shared expense -> create IOU for friends
    IF NEW.type = 'shared' AND NEW.shared_details IS NOT NULL THEN
        -- Loop through each person in shared_details
        FOR friend_detail IN SELECT * FROM jsonb_array_elements(NEW.shared_details)
        LOOP
            -- Find the friend's user profile by email
            SELECT * INTO friend_profile 
            FROM user_profiles 
            WHERE email = (friend_detail->>'personEmail')::text;
            
            IF friend_profile.id IS NOT NULL THEN
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
                    friend_profile.id,
                    'iou',
                    NEW.amount,
                    NEW.payment_mode,
                    NEW.description,
                    NEW.date,
                    NEW.category,
                    jsonb_build_object(
                        'personName', (SELECT display_name FROM user_profiles WHERE id = NEW.user_id),
                        'personEmail', (SELECT email FROM user_profiles WHERE id = NEW.user_id),
                        'mySplitPercentage', (friend_detail->>'splitPercentage')::numeric
                    )
                );
            END IF;
        END LOOP;
    END IF;

    -- Handle IOU -> create shared expense for the friend who paid
    IF NEW.type = 'iou' AND NEW.iou_details IS NOT NULL THEN
        -- Find the friend who paid (from iou_details)
        SELECT * INTO friend_profile 
        FROM user_profiles 
        WHERE email = (NEW.iou_details->>'personEmail')::text;
        
        IF friend_profile.id IS NOT NULL THEN
            -- Create shared expense transaction for the friend who paid
            INSERT INTO transactions (
                user_id,
                type,
                amount,
                payment_mode,
                description,
                date,
                category,
                shared_details
            ) VALUES (
                friend_profile.id,
                'shared',
                NEW.amount,
                NEW.payment_mode,
                NEW.description,
                NEW.date,
                NEW.category,
                jsonb_build_array(
                    jsonb_build_object(
                        'personName', (SELECT display_name FROM user_profiles WHERE id = NEW.user_id),
                        'personEmail', (SELECT email FROM user_profiles WHERE id = NEW.user_id),
                        'splitPercentage', (NEW.iou_details->>'mySplitPercentage')::numeric
                    )
                )
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for both shared and IOU transactions
CREATE TRIGGER propagate_shared_expense_trigger
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION propagate_shared_expense();