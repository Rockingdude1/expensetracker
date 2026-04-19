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

  // Reject (delete) a pending friend request
  async rejectFriendRequest(connectionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('id', connectionId);

      if (error) {
        console.error('Error rejecting friend request:', error);
        return { success: false, error: 'Failed to reject friend request' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error in rejectFriendRequest:', error);
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
  
  // Get all accepted friends (real + guest)
  async getFriends(): Promise<UserProfile[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const [connectionsResult, guestsResult] = await Promise.all([
        supabase
          .from('user_connections')
          .select('user_id_1, user_id_2, user_profiles_user_id_1:user_id_1(*), user_profiles_user_id_2:user_id_2(*)')
          .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`)
          .eq('status', 'accepted'),
        supabase
          .from('user_profiles')
          .select('*')
          .eq('created_by', user.id)
          .eq('is_guest', true),
      ]);

      const realFriends = (connectionsResult.data || []).map(conn => {
        return conn.user_id_1 === user.id ? conn.user_profiles_user_id_2 : conn.user_profiles_user_id_1;
      }).filter(p => p !== null && p.id !== null) as UserProfile[];

      const guestFriends = (guestsResult.data || []) as UserProfile[];

      return [...realFriends, ...guestFriends];
    } catch (error) {
      console.error('Error in getFriends:', error);
      return [];
    }
  },

  // Add a guest friend (not on the app yet)
  async addGuestFriend(displayName: string, email?: string): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      // Check for duplicate guest name under this creator
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('created_by', user.id)
        .eq('is_guest', true)
        .ilike('display_name', displayName.trim())
        .maybeSingle();

      if (existing) {
        return { success: false, error: 'A guest friend with that name already exists' };
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: crypto.randomUUID(),
          display_name: displayName.trim(),
          email: email?.trim() || '',
          is_guest: true,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding guest friend:', error);
        return { success: false, error: 'Failed to add guest friend' };
      }

      return { success: true, profile: data as UserProfile };
    } catch (error) {
      console.error('Error in addGuestFriend:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  // Remove a guest friend (only guests created by current user)
  async removeGuestFriend(guestId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', guestId)
        .eq('created_by', user.id)
        .eq('is_guest', true);

      if (error) {
        console.error('Error removing guest friend:', error);
        return { success: false, error: 'Failed to remove guest friend' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error in removeGuestFriend:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },
  
  // Optimized: runs debts + friends queries in parallel instead of sequentially
  async getFriendBalances(): Promise<FriendBalance[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Run both queries in parallel — cuts load time in half
      const [debtsResult, connectionsResult] = await Promise.all([
        supabase
          .from('debts')
          .select('debtor_id, creditor_id, amount')
          .or(`debtor_id.eq.${user.id},creditor_id.eq.${user.id}`),
        supabase
          .from('user_connections')
          .select('user_id_1, user_id_2, user_profiles_user_id_1:user_id_1(*), user_profiles_user_id_2:user_id_2(*)')
          .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`)
          .eq('status', 'accepted'),
      ]);

      if (debtsResult.error) {
        console.error('Error fetching debts for balance:', debtsResult.error);
        return [];
      }
      if (connectionsResult.error) {
        console.error('Error fetching friends:', connectionsResult.error);
        return [];
      }

      // Extract friend profiles from connections
      const friends = (connectionsResult.data || [])
        .map(conn => conn.user_id_1 === user.id ? conn.user_profiles_user_id_2 : conn.user_profiles_user_id_1)
        .filter(p => p !== null && p.id !== null) as UserProfile[];
      const friendProfileMap = new Map(friends.map(f => [f.id, f]));

      // Build a map of friend_id -> net balance from debts
      const balanceMap = new Map<string, number>();
      for (const debt of (debtsResult.data || [])) {
        if (debt.debtor_id === user.id) {
          const friendId = debt.creditor_id;
          balanceMap.set(friendId, (balanceMap.get(friendId) || 0) - parseFloat(debt.amount));
        } else {
          const friendId = debt.debtor_id;
          balanceMap.set(friendId, (balanceMap.get(friendId) || 0) + parseFloat(debt.amount));
        }
      }

      // Build FriendBalance array
      const friendBalances: FriendBalance[] = [];

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