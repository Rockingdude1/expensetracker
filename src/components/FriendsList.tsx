import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, UserPlus, Users, Settings, ChevronRight, ArrowLeft, Check, X as XIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTransactionData, useTransactionActions } from '../contexts/TransactionSyncContext';
import { userService } from '../services/userService';
import { UserProfile } from '../types';
import AddFriendModal from './AddFriendModal';
import FriendDetailView from './FriendDetailView';
import FriendRequestsModal from './FriendRequestsModal';

const FriendsList: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { friendBalances: balancesMap, profilesMap, friends: contextFriends } = useTransactionData();
  const { refreshBalances, refreshFriends } = useTransactionActions();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettledFriends, setShowSettledFriends] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [selectedFriendProfile, setSelectedFriendProfile] = useState<UserProfile | undefined>(undefined);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const allFriends = contextFriends;
  const [error, setError] = useState<string | null>(null);

  // Derive FriendBalance display list from context data, merged with allFriends
  // so guests with zero balance still appear
  const friendBalances = useMemo(() => {
    const seen = new Set<string>();
    const list: { friend_id: string; friend_name: string; friend_email: string; balance: number; is_guest: boolean; linked_user_id?: string | null }[] = [];

    // From debt balances
    for (const [friendId, balance] of balancesMap.entries()) {
      seen.add(friendId);
      const profile = profilesMap.get(friendId) || allFriends.find(f => f.id === friendId);
      list.push({
        friend_id: friendId,
        friend_name: profile?.display_name || profile?.email?.split('@')[0] || 'Unknown',
        friend_email: profile?.email || '',
        balance,
        is_guest: profile?.is_guest ?? false,
        linked_user_id: profile?.linked_user_id,
      });
    }

    // Friends with no transactions (includes guests)
    for (const friend of allFriends) {
      if (!seen.has(friend.id)) {
        list.push({
          friend_id: friend.id,
          friend_name: friend.display_name || friend.email?.split('@')[0] || 'Unknown',
          friend_email: friend.email || '',
          balance: 0,
          is_guest: friend.is_guest ?? false,
          linked_user_id: friend.linked_user_id,
        });
      }
    }

    return list;
  }, [balancesMap, profilesMap, allFriends]);

  useEffect(() => {
    if (currentUser) loadPendingRequests();
  }, [currentUser]);

  const loadPendingRequests = async () => {
    try {
      const requests = await userService.getPendingFriendRequests();
      setPendingRequests(requests);
    } catch (err) {
      console.error('Error loading pending requests:', err);
    }
  };

  const refreshData = useCallback(() => {
    loadPendingRequests();
    refreshFriends();
    refreshBalances();
  }, [refreshBalances, refreshFriends]);

  const handleAcceptRequest = async (connectionId: string) => {
    try {
      await userService.acceptFriendRequest(connectionId);
      refreshData();
    } catch (err) {
      setError('Failed to accept friend request');
    }
  };

  const handleRejectRequest = async (connectionId: string) => {
    try {
      await userService.rejectFriendRequest(connectionId);
      refreshData();
    } catch (err) {
      setError('Failed to reject friend request');
    }
  };

  const activeFriends = friendBalances.filter(friend => Math.abs(friend.balance) > 0.01);
  const settledFriends = friendBalances.filter(friend => Math.abs(friend.balance) <= 0.01);
  const totalBalance = friendBalances.reduce((sum, friend) => sum + friend.balance, 0);

  const filteredFriends = activeFriends.filter(friend =>
    friend.friend_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.friend_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Math.abs(amount));
  };

  const getAvatarColor = (name: string) => {
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500'];
    return name ? colors[name.charCodeAt(0) % colors.length] : colors[0];
  };

  const getInitials = (name: string) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '';
  };

  if (selectedFriendId) {
    return (
      <FriendDetailView
        friendId={selectedFriendId}
        friendProfile={selectedFriendProfile}
        onBack={() => { setSelectedFriendId(null); setSelectedFriendProfile(undefined); }}
        onBalanceUpdated={refreshData}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
            <button onClick={() => setShowAddFriendModal(true)} className="flex items-center space-x-2 text-emerald-600 font-medium">
                <UserPlus className="h-5 w-5" />
                <span>Add friends</span>
            </button>
            <button onClick={() => setShowRequestsModal(true)} className="relative flex items-center space-x-2 text-blue-600 font-medium">
                <Users className="h-5 w-5" />
                <span>Requests</span>
                {pendingRequests.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {pendingRequests.length}
                    </span>
                )}
            </button>
        </div>
      </div>
      <div className="flex justify-between items-center px-2 py-4 border-y">
        <span className="font-medium">{totalBalance >= 0 ? 'Overall, you are owed' : 'Overall, you owe'}</span>
        <span className={`text-xl font-bold ${totalBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(totalBalance)}</span>
      </div>
      {error && <div className="text-red-500 p-4 bg-red-50 rounded-lg">{error}</div>}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border">
        <div className="divide-y">
            {filteredFriends.length === 0
             ? <div className="p-8 text-center"><Users className="h-12 w-12 mx-auto text-slate-400 mb-4" /><h3 className="font-semibold">No friends with active balances</h3></div>
             : filteredFriends.map((friend) => (
                <div key={friend.friend_id} className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer" onClick={() => { setSelectedFriendId(friend.friend_id); setSelectedFriendProfile(allFriends.find(f => f.id === friend.friend_id)); }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className={`w-12 h-12 rounded-full ${getAvatarColor(friend.friend_name)} flex items-center justify-center text-white font-semibold`}>
                                {getInitials(friend.friend_name)}
                            </div>
                            <div>
                                <div className="flex items-center space-x-2">
                                    <h3 className="font-semibold text-slate-900 dark:text-white">{friend.friend_name}</h3>
                                    {friend.is_guest && !friend.linked_user_id && (
                                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">Guest</span>
                                    )}
                                    {friend.is_guest && friend.linked_user_id && (
                                        <span className="text-xs px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-medium">Joined!</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3">
                            <div className="text-right">
                                <p className="text-xs text-slate-500 mb-1">{friend.balance >= 0 ? 'owes you' : 'you owe'}</p>
                                <p className={`text-lg font-bold ${friend.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(friend.balance)}</p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-slate-400" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </div>
      {settledFriends.length > 0 && (
        <div className="text-center">
            <button onClick={() => setShowSettledFriends(!showSettledFriends)} className="border-2 border-emerald-500 text-emerald-600 px-6 py-3 rounded-lg font-medium">
                {showSettledFriends ? 'Hide' : 'Show'} {settledFriends.length} settled-up friends
            </button>
            {showSettledFriends && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border mt-4">
                    {settledFriends.map(friend => (
                        <div key={friend.friend_id} className="p-4 opacity-60 text-left flex items-center space-x-2 cursor-pointer hover:opacity-80" onClick={() => { setSelectedFriendId(friend.friend_id); setSelectedFriendProfile(allFriends.find(f => f.id === friend.friend_id)); }}>
                            <span className="text-slate-700 dark:text-slate-300">{friend.friend_name}</span>
                            {friend.is_guest && !friend.linked_user_id && (
                                <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">Guest</span>
                            )}
                            <span className="text-slate-500 text-sm">- Settled up</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
      )}
      <AddFriendModal isOpen={showAddFriendModal} onClose={() => setShowAddFriendModal(false)} onFriendAdded={refreshData} />
      <FriendRequestsModal isOpen={showRequestsModal} onClose={() => setShowRequestsModal(false)} pendingRequests={pendingRequests} onAcceptRequest={handleAcceptRequest} onRejectRequest={handleRejectRequest} />
    </div>
  );
};

export default FriendsList;
