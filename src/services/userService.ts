import { supabase } from '../lib/supabase';
import { UserProfile, UserConnection, FriendBalance } from '../types';

// Re-export types for backward compatibility
export type { UserProfile, UserConnection, FriendBalance };

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
  
  // Simplified: Query the debts table directly instead of recalculating in JavaScript
  async getFriendBalances(): Promise<FriendBalance[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get all debts where current user is involved
      const { data: debts, error: debtsError } = await supabase
        .from('debts')
        .select('debtor_id, creditor_id, amount')
        .or(`debtor_id.eq.${user.id},creditor_id.eq.${user.id}`);

      if (debtsError) {
        console.error('Error fetching debts for balance:', debtsError);
        return [];
      }

      // Build a map of friend_id -> net balance
      const balanceMap = new Map<string, number>();

      for (const debt of (debts || [])) {
        if (debt.debtor_id === user.id) {
          // I am the debtor -> I owe this creditor (negative balance for me)
          const friendId = debt.creditor_id;
          const current = balanceMap.get(friendId) || 0;
          balanceMap.set(friendId, current - parseFloat(debt.amount));
        } else {
          // I am the creditor -> this debtor owes me (positive balance for me)
          const friendId = debt.debtor_id;
          const current = balanceMap.get(friendId) || 0;
          balanceMap.set(friendId, current + parseFloat(debt.amount));
        }
      }

      // Get friend profiles
      const friends = await this.getFriends();
      const friendProfileMap = new Map(friends.map(f => [f.id, f]));

      // Build FriendBalance array
      const friendBalances: FriendBalance[] = [];

      // Add friends with non-zero balances from debts
      for (const [friendId, balance] of balanceMap.entries()) {
        const profile = friendProfileMap.get(friendId);
        friendBalances.push({
          friend_id: friendId,
          friend_name: profile?.display_name || profile?.email?.split('@')[0] || 'Unknown User',
          friend_email: profile?.email || '',
          balance: Math.round(balance * 100) / 100,
          details: [],
        });
      }

      // Add friends who have zero balance (not in debts table)
      for (const friend of friends) {
        if (!balanceMap.has(friend.id)) {
          friendBalances.push({
            friend_id: friend.id,
            friend_name: friend.display_name || friend.email?.split('@')[0] || 'Unknown User',
            friend_email: friend.email || '',
            balance: 0,
            details: [],
          });
        }
      }

      return friendBalances;
    } catch (error) {
      console.error('Error in getFriendBalances:', error);
      return [];
    }
  }
};