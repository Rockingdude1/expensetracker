import { supabase } from '../lib/supabase';
import { Transaction, UserProfile, UserConnection, FriendBalance } from '../types';

export const userService = {

  // --- THIS IS A NEW, EFFICIENT HELPER FUNCTION ---
  async getUsersByIds(userIds: string[]): Promise<UserProfile[]> {
    if (!userIds || userIds.length === 0) return [];
    try {
      const { data, error } = await supabase
        .from('user_profiles') // Using your table name
        .select('*')
        .in('id', userIds);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("Error in getUsersByIds:", err);
      throw err;
    }
  },
  
  // Get current user's profile
  async getCurrentUserProfile(): Promise<UserProfile | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getCurrentUserProfile:', error);
      return null;
    }
  },

  // Search for users by email
  async searchUsersByEmail(email: string): Promise<UserProfile[]> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .ilike('email', `%${email}%`)
        .limit(10);

      if (error) {
        console.error('Error searching users:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in searchUsersByEmail:', error);
      return [];
    }
  },

  // Send friend request
  async sendFriendRequest(friendEmail: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      const { data: friendProfile, error: friendError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', friendEmail)
        .single();

      if (friendError || !friendProfile) {
        return { success: false, error: 'User not found' };
      }
      
      if (friendProfile.id === user.id) {
        return { success: false, error: "You cannot add yourself as a friend." };
      }

      const { data: existingConnection } = await supabase
        .from('user_connections')
        .select('id, status')
        .or(`and(user_id_1.eq.${user.id},user_id_2.eq.${friendProfile.id}),and(user_id_1.eq.${friendProfile.id},user_id_2.eq.${user.id})`)
        .single();

      if (existingConnection) {
        if (existingConnection.status === 'accepted') return { success: false, error: 'Already friends' };
        if (existingConnection.status === 'pending') return { success: false, error: 'Friend request already sent' };
      }

      const { error } = await supabase
        .from('user_connections')
        .insert({ user_id_1: user.id, user_id_2: friendProfile.id, status: 'pending' });

      if (error) {
        console.error('Error sending friend request:', error);
        return { success: false, error: 'Failed to send friend request' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error in sendFriendRequest:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  // Accept friend request
  async acceptFriendRequest(connectionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('user_connections')
        .update({ status: 'accepted' })
        .eq('id', connectionId);

      if (error) {
        console.error('Error accepting friend request:', error);
        return { success: false, error: 'Failed to accept friend request' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error in acceptFriendRequest:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  // Get pending friend requests received by current user
  async getPendingFriendRequests(): Promise<UserConnection[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_connections')
        .select(`*, user_profiles:user_id_1(*)`)
        .eq('user_id_2', user.id)
        .eq('status', 'pending');

      if (error) {
        console.error('Error fetching pending friend requests:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getPendingFriendRequests:', error);
      return [];
    }
  },
  
  // UPDATED: Get all accepted friends (more efficient)
  async getFriends(): Promise<UserProfile[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: connections, error } = await supabase
        .from('user_connections')
        .select('user_id_1, user_id_2, user_profiles_user_id_1:user_id_1(*), user_profiles_user_id_2:user_id_2(*)')
        .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`)
        .eq('status', 'accepted');

      if (error) {
        console.error('Error fetching friends:', error);
        return [];
      }

      const friends = connections.map(conn => {
        return conn.user_id_1 === user.id ? conn.user_profiles_user_id_2 : conn.user_profiles_user_id_1;
      });

      return friends.filter(p => p !== null && p.id !== null) as UserProfile[];
    } catch (error) {
      console.error('Error in getFriends:', error);
      return [];
    }
  },
  
  // UPDATED: The final, smarter balance calculation
async getFriendBalances(): Promise<FriendBalance[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    // Fetch all transactions that haven't been soft-deleted
    const { data: transactionsData, error: transactionsError } = await supabase
      .from('transactions')
      .select('*')
      .is('deleted_at', null);
      
    if (transactionsError) {
      console.error('Error fetching transactions for balance:', transactionsError);
      return [];
    }
    
    const transactions = (transactionsData || []) as Transaction[];
    const friends = await this.getFriends();
    if (friends.length === 0) return [];

    // Calculate true pairwise balances between me and each friend
    const friendBalances: FriendBalance[] = friends.map(friend => {
      let netBalance = 0; // Positive means friend owes me, negative means I owe friend

      transactions.forEach(tx => {
        // --- 1. Handle Settlement Transactions ---
        if (tx.description?.startsWith('SETTLEMENT:')) {
          if (tx.description.includes(friend.email)) {
            // I paid this friend (settlement) -> reduces what I owe them OR increases what they owe me
            if (tx.description.includes(`Paid ${friend.email}`)) {
              netBalance += tx.amount;
            } 
            // This friend paid me (settlement) -> reduces what they owe me OR increases what I owe them
            else if (tx.description.includes(`Received from ${friend.email}`)) {
              netBalance -= tx.amount;
            }
          }
          return; // Skip to next transaction
        }

        // --- 2. Handle Shared Expense Transactions ---
        if (tx.type === 'shared' && tx.split_details && tx.payers) {
          const participants = tx.split_details.participants;
          const participantIds = participants.map(p => p.user_id);
          
          // Only process if both me and this friend are participants in the transaction
          if (participantIds.includes(user.id) && participantIds.includes(friend.id)) {
            
            // A. Find what each person was supposed to pay (their share)
            const myShare = participants.find(p => p.user_id === user.id)?.share_amount || 0;
            const friendShare = participants.find(p => p.user_id === friend.id)?.share_amount || 0;

            // B. Find what each person actually paid
            const myPayment = tx.payers.find(p => p.user_id === user.id)?.amount_paid || 0;
            const friendPayment = tx.payers.find(p => p.user_id === friend.id)?.amount_paid || 0;
            
            // C. Calculate each person's balance FOR THIS TRANSACTION
            // Negative means they overpaid (are owed), positive means they underpaid (they owe)
            const myBalanceForTx = myShare - myPayment; 
            const friendBalanceForTx = friendShare - friendPayment;

            // D. Determine the flow of money between US and update the netBalance
            // CASE 1: I overpaid and my friend underpaid -> Friend now owes me more
            if (myBalanceForTx < 0 && friendBalanceForTx > 0) {
              const amountFriendOwesMe = Math.min(Math.abs(myBalanceForTx), friendBalanceForTx);
              netBalance += amountFriendOwesMe;
            } 
            // CASE 2: I underpaid and my friend overpaid -> I now owe my friend more
            else if (myBalanceForTx > 0 && friendBalanceForTx < 0) {
              const amountIOweFriend = Math.min(myBalanceForTx, Math.abs(friendBalanceForTx));
              netBalance -= amountIOweFriend;
            }
            // In all other cases (e.g., someone else paid for both of us), no debt is created between us.
          }
        }
      });

      return {
        friend_id: friend.id,
        friend_name: friend.display_name || friend.email?.split('@')[0] || 'Unknown User',
        friend_email: friend.email,
        balance: Math.round(netBalance * 100) / 100, // Round to 2 decimal places
        details: [] // Details array is not needed for the summary balance
      };
    });

    return friendBalances;

  } catch (error) {
    console.error('Error in getFriendBalances:', error);
    return [];
  }
}
};