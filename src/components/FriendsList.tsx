import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Users, Settings, ChevronRight, ArrowLeft, Check, X as XIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext'; // CORRECT: Get user from the Auth Context
import { transactionService } from '../services/transactionService';
import { userService, UserProfile } from '../services/userService';
import AddFriendModal from './AddFriendModal';
import FriendDetailView from './FriendDetailView';
import FriendRequestsModal from './FriendRequestsModal';

// This interface is simple and matches the data we will create
interface FriendBalance {
  friend_id: string;
  friend_name: string;
  friend_email: string;
  balance: number;
}

const FriendsList: React.FC = () => {
  const { user: currentUser } = useAuth(); // CORRECT: This is your app's way of getting the user
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettledFriends, setShowSettledFriends] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [friendBalances, setFriendBalances] = useState<FriendBalance[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // CORRECT: This useEffect now correctly depends on currentUser from the useAuth hook.
  // It will run once the user is logged in and available.
  useEffect(() => {
    if (currentUser) {
      loadFriendBalances(currentUser.id);
      loadPendingRequests();
    } else {
      setLoading(false); // If there's no user, we're not loading anything.
    }
  }, [currentUser]); // The dependency array ensures this runs when the user logs in.

  // This is our new, efficient function that reads from the 'debts' table.
 // In FriendsList.tsx, replace the old loadFriendBalances function with this one.

const loadFriendBalances = async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // 1. Call the single, correct service function.
      const balances = await userService.getFriendBalances(); 
      const friends = await userService.getFriends();

      // 2. The new service already returns almost everything we need.
      // We just need to add any friends who might have a zero balance.
      const balancesMap = new Map(balances.map(b => [b.friend_id, b]));

      friends.forEach(friend => {
        if (!balancesMap.has(friend.id)) {
          balances.push({
            friend_id: friend.id,
            friend_name: friend.display_name || (friend.email ? friend.email.split('@')[0] : 'Unknown'),
            friend_email: friend.email || '',
            balance: 0,
          });
        }
      });

      setFriendBalances(balances);

    } catch (err) {
      console.error('Error loading friend balances:', err);
      setError('Failed to load friend balances');
    } finally {
      setLoading(false);
    }
  };

  const loadPendingRequests = async () => {
    try {
      const requests = await userService.getPendingFriendRequests();
      setPendingRequests(requests);
    } catch (err) {
      console.error('Error loading pending requests:', err);
    }
  };
  
  const refreshData = () => {
    if (currentUser) {
      loadFriendBalances(currentUser.id);
      loadPendingRequests();
    }
  };

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
  
  // The rest of your component's JSX and logic is preserved.
  // No changes are needed below this line.
  
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
        onBack={() => setSelectedFriendId(null)}
        onBalanceUpdated={() => currentUser && loadFriendBalances(currentUser.id)}
      />
    );
  }

  if (loading) return <div className="text-center p-8">Loading balances...</div>;

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
                <div key={friend.friend_id} className="p-4 sm:p-6 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedFriendId(friend.friend_id)}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className={`w-12 h-12 rounded-full ${getAvatarColor(friend.friend_name)} flex items-center justify-center text-white font-semibold`}>
                                {getInitials(friend.friend_name)}
                            </div>
                            <div>
                                <h3 className="font-semibold">{friend.friend_name}</h3>
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
                        <div key={friend.friend_id} className="p-4 opacity-60 text-left">
                            {friend.friend_name} - Settled up
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