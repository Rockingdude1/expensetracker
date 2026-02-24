// Basic Transaction Types
export type PaymentMode = 'cash' | 'online';
export type TransactionType = 'revenue' | 'personal' | 'shared'; // 'iou' has been removed
export type Category = 'rent' | 'food' | 'social' | 'transport' | 'apparel' | 'beauty' | 'education' | 'other';

// App-wide Types
export type Theme = 'light' | 'dark';

// --- New, Unified Transaction Structure ---

// Defines a single entry in the new activity log
export interface ActivityLogEntry {
  action: 'created' | 'updated'| 'deleted';
  user_id: string;
  user_name: string;
  timestamp: string;
}

// Defines the structure for a person who paid
export interface Payer {
  user_id: string;
  amount_paid: number;
  description?: string;
}

// Defines a participant in a split
export interface SplitParticipant {
  user_id: string;
  share_amount: number;
  share_percentage?: number; // Optional, used for percentage splits
}

// Defines the entire split details object
export interface SplitDetails {
  method: 'equally' | 'percentages' | 'settlement';
  participants: SplitParticipant[];
}

// --- The Main Transaction Interface (replaces old Transaction and DatabaseTransaction) ---
export interface Transaction {
  id: string;
  user_id: string; // The user who created the transaction
  type: TransactionType;
  amount: number;
  payment_mode: PaymentMode;
  description: string;
  date: string;
  category?: Category;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  
  // New Unified Fields
  payers: Payer[];
  split_details: SplitDetails | null; // Can be null for personal/revenue transactions
  activity_log?: ActivityLogEntry[];
}


// --- User and Friend Related Types ---

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserConnection {
  id: string;
  user_id_1: string;
  user_id_2: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  updated_at: string;
  // This is a helper property for queries, may not always be present
  user_profiles?: UserProfile; 
}

export interface FriendBalance {
  friend_id: string;
  friend_name: string;
  friend_email: string;
  balance: number; // Positive means they owe you, negative means you owe them
  details: {
    description: string;
    amount: number;
    date: string;
  }[];
}