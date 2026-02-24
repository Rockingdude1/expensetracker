import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, CreditCard, Banknote, Users, DollarSign } from 'lucide-react';
import { userService } from '../services/userService';
import { Transaction, UserProfile, FriendBalance } from '../types';
import SettleUpModal from './SettleUpModal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface FriendDetailViewProps {
  friendId: string;
  onBack: () => void;
  onBalanceUpdated: () => void;
}

const FriendDetailView: React.FC<FriendDetailViewProps> = ({ friendId, onBack, onBalanceUpdated }) => {
  const { user: currentUser } = useAuth();
  const [friend, setFriend] = useState<UserProfile | null>(null);
  const [friendBalance, setFriendBalance] = useState<FriendBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettleUpModal, setShowSettleUpModal] = useState(false);
  const [profilesMap, setProfilesMap] = useState<Map<string, UserProfile>>(new Map());

  useEffect(() => {
    loadFriendData();
  }, [friendId, currentUser]);

  const loadFriendData = async () => {
    try {
      if (!currentUser) return;
      setLoading(true);
      setError(null);

      const { data: friendProfile, error: friendError } = await supabase
        .from('user_profiles').select('*').eq('id', friendId).single();

      if (friendError || !friendProfile) throw new Error("Friend profile not found.");
      setFriend(friendProfile);

      const { data: allTransactions, error: transactionError } = await supabase
        .from('transactions').select('*');

      if (transactionError) throw new Error("Could not fetch transaction history.");

      const friendTransactions = allTransactions?.filter(tx => {
        if (tx.deleted_at) return false;

        if (tx.description?.startsWith('SETTLEMENT:') && tx.description?.includes(friendProfile.email)) {
          return true;
        }

        if (tx.type === 'shared') {
          const participantIds = tx.split_details?.participants.map(p => p.user_id) || [];
          const payerIds = tx.payers?.map(p => p.user_id) || [];
          const bothAreParticipants = participantIds.includes(currentUser.id) && participantIds.includes(friendId);
          const eitherPaid = payerIds.includes(currentUser.id) || payerIds.includes(friendId);
          return bothAreParticipants && eitherPaid;
        }

        return false;
      }) || [];

      friendTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(friendTransactions);

      // Build profilesMap
      const userIds = new Set<string>();
      friendTransactions.forEach(tx => {
        tx.payers?.forEach(p => userIds.add(p.user_id));
        tx.split_details?.participants?.forEach(p => userIds.add(p.user_id));
      });
      userIds.add(currentUser.id);
      userIds.add(friendId);

      const profiles = await userService.getUsersByIds(Array.from(userIds));
      const newProfilesMap = new Map<string, UserProfile>();
      profiles.forEach(p => newProfilesMap.set(p.id, p));
      setProfilesMap(newProfilesMap);

      // Get balance from debts table
      const balances = await userService.getFriendBalances();
      const currentFriendBalance = balances.find(b => b.friend_id === friendId);
      setFriendBalance(currentFriendBalance || null);

    } catch (err: any) {
      setError(err.message || 'Failed to load friend data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTransactionInfo = (transaction: Transaction) => {
    if (!currentUser || !friend) return { description: 'Transaction', amount: 0, color: 'text-slate-600', subtext: '', icon: <Users /> };

    // Settlement transactions
    if (transaction.description?.startsWith('SETTLEMENT:')) {
      if (transaction.description.includes(`Paid ${friend.email}`)) {
        return {
          description: 'Settlement Payment',
          amount: transaction.amount,
          color: 'text-emerald-600',
          subtext: `You paid ${friend.display_name || friend.email.split('@')[0]}`,
          icon: <DollarSign className="h-5 w-5 text-emerald-600" />,
        };
      } else if (transaction.description.includes(`Received from ${friend.email}`)) {
        return {
          description: 'Settlement Received',
          amount: transaction.amount,
          color: 'text-red-600',
          subtext: `${friend.display_name || friend.email.split('@')[0]} paid you`,
          icon: <DollarSign className="h-5 w-5 text-red-600" />,
        };
      }
    }

    // Shared expenses
    if (transaction.type === 'shared' && transaction.split_details) {
      const participants = transaction.split_details.participants;
      const myShare = participants.find(p => p.user_id === currentUser.id)?.share_amount || 0;
      const friendShare = participants.find(p => p.user_id === friend.id)?.share_amount || 0;
      const myPayment = transaction.payers.find(p => p.user_id === currentUser.id)?.amount_paid || 0;
      const friendPayment = transaction.payers.find(p => p.user_id === friend.id)?.amount_paid || 0;

      const myBalance = myShare - myPayment;
      const friendBal = friendShare - friendPayment;

      if (myBalance < 0 && friendBal > 0) {
        const amountFriendOwesYou = Math.min(Math.abs(myBalance), friendBal);
        return {
          description: transaction.description,
          amount: amountFriendOwesYou,
          color: 'text-emerald-600',
          subtext: `You paid for ${friend.display_name || friend.email.split('@')[0]}`,
          icon: <Users className="h-5 w-5 text-purple-600" />,
        };
      } else if (myBalance > 0 && friendBal < 0) {
        const amountYouOweFriend = Math.min(myBalance, Math.abs(friendBal));
        return {
          description: transaction.description,
          amount: amountYouOweFriend,
          color: 'text-red-600',
          subtext: `${friend.display_name || friend.email.split('@')[0]} paid for you`,
          icon: <Users className="h-5 w-5 text-purple-600" />,
        };
      } else {
        return {
          description: transaction.description,
          amount: 0,
          color: 'text-slate-600',
          subtext: `You and ${friend.display_name || friend.email.split('@')[0]} are settled for this item`,
          icon: <Users className="h-5 w-5 text-purple-600" />,
        };
      }
    }

    return { description: 'Transaction', amount: 0, color: 'text-slate-600', subtext: '', icon: <Users /> };
  };

  const getInitials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '';
  const getAvatarColor = (name: string) => {
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500'];
    return name ? colors[name.charCodeAt(0) % colors.length] : colors[0];
  };

  if (loading) return <div className="text-center p-8">Loading...</div>;
  if (error || !friend) return <div className="text-center p-8 text-red-500">Error: {error} <button onClick={onBack} className="ml-2 text-blue-500 underline">Back</button></div>;

  return (
    <div className="space-y-4">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center space-x-2 text-slate-600 dark:text-slate-300">
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Friends</span>
        </button>
      </div>

      {/* Friend Profile Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-full ${getAvatarColor(friend.display_name || friend.email)} flex items-center justify-center text-white font-semibold text-xl`}>
              {getInitials(friend.display_name || friend.email)}
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">{friend.display_name}</h1>
              <p className="text-sm text-slate-500">{friend.email}</p>
              {friendBalance && (
                <p className={`text-sm mt-1 font-semibold ${friendBalance.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {friendBalance.balance >= 0 ? 'Owes you' : 'You owe'} {formatCurrency(Math.abs(friendBalance.balance))}
                </p>
              )}
            </div>
          </div>
          {friendBalance && friendBalance.balance !== 0 && (
            <button onClick={() => setShowSettleUpModal(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 text-sm rounded-lg font-medium">
              Settle up
            </button>
          )}
        </div>
      </div>

      {/* Transaction History with Friend */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Transaction History</h2>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center"><p className="text-slate-500">No transaction history with {friend.display_name}.</p></div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {transactions.map((transaction) => {
              const info = getTransactionInfo(transaction);
              return (
                <div key={transaction.id} className="p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
                        {info.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{info.description}</h3>
                        <div className="flex items-center space-x-4 mt-1">
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-slate-600 dark:text-slate-300">{formatDate(transaction.date)}</span>
                          </div>
                        </div>
                        {info.subtext && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{info.subtext}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${info.color}`}>{formatCurrency(info.amount)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settle Up Modal */}
      {showSettleUpModal && friendBalance && (
        <SettleUpModal
          friend={friend}
          currentBalance={friendBalance.balance}
          onClose={() => setShowSettleUpModal(false)}
          onSettled={() => {
            setShowSettleUpModal(false);
            onBalanceUpdated();
            loadFriendData();
          }}
        />
      )}
    </div>
  );
};

export default FriendDetailView;
