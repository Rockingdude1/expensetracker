import React, { useState, useMemo } from 'react';
import { ArrowLeft, Calendar, Users, DollarSign, Pencil, Check, X as XIcon } from 'lucide-react';
import { userService } from '../services/userService';
import { Transaction, UserProfile, FriendBalance } from '../types';
import SettleUpModal from './SettleUpModal';
import { useAuth } from '../contexts/AuthContext';
import { useTransactionData, useTransactionActions } from '../contexts/TransactionSyncContext';

interface FriendDetailViewProps {
  friendId: string;
  friendProfile?: UserProfile; // passed from FriendsList for guests with no transactions
  onBack: () => void;
  onBalanceUpdated: () => void;
}

const FriendDetailView: React.FC<FriendDetailViewProps> = ({ friendId, friendProfile, onBack, onBalanceUpdated }) => {
  const { user: currentUser } = useAuth();
  const { transactions: allTransactions, profilesMap, friendBalances: balancesMap } = useTransactionData();
  const { refreshBalances } = useTransactionActions();
  const [showSettleUpModal, setShowSettleUpModal] = useState(false);

  // Edit guest state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [localProfile, setLocalProfile] = useState<UserProfile | null>(null);

  // Prefer locally-updated profile, then context map, then prop fallback (for guests with no txns)
  const friend = localProfile ?? profilesMap.get(friendId) ?? friendProfile ?? null;

  // Derive balance from context map
  const rawBalance = balancesMap.get(friendId) ?? 0;
  const friendBalance: FriendBalance | null = friend
    ? { friend_id: friendId, friend_name: friend.display_name, friend_email: friend.email, balance: rawBalance, details: [] }
    : null;

  // Filter shared/settlement transactions involving this friend from context — no DB call
  const transactions = useMemo(() => {
    if (!currentUser) return [];
    return allTransactions
      .filter(tx => {
        if (tx.deleted_at) return false;
        if (tx.description?.startsWith('SETTLEMENT:')) {
          return (
            tx.description.includes(friend?.email ?? '') ||
            tx.split_details?.participants?.some(p => p.user_id === friendId)
          );
        }
        if (tx.type === 'shared') {
          const participantIds = tx.split_details?.participants?.map(p => p.user_id) || [];
          const payerIds = tx.payers?.map(p => p.user_id) || [];
          return (
            participantIds.includes(currentUser.id) &&
            participantIds.includes(friendId) &&
            (payerIds.includes(currentUser.id) || payerIds.includes(friendId))
          );
        }
        return false;
      })
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTransactions, friendId, currentUser, friend?.email]);

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
      const isUserPaid = transaction.type === 'personal'
        && (transaction.description.includes(`Paid ${friend.email}`)
            || transaction.split_details?.participants?.some(p => p.user_id === friend.id));
      const isFriendPaid = transaction.type === 'revenue'
        && (transaction.description.includes(`Received from ${friend.email}`)
            || transaction.split_details?.participants?.some(p => p.user_id === friend.id));

      if (isUserPaid) {
        return {
          description: 'Settlement Payment',
          amount: transaction.amount,
          color: 'text-emerald-600',
          subtext: `You paid ${friend.display_name || friend.email.split('@')[0]}`,
          icon: <DollarSign className="h-5 w-5 text-emerald-600" />,
        };
      } else if (isFriendPaid) {
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

  const startEditing = () => {
    if (!friend) return;
    setEditName(friend.display_name || '');
    setEditEmail(friend.email || '');
    setEditError('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditError('');
  };

  const saveEdit = async () => {
    if (!friend || !editName.trim()) { setEditError('Name is required'); return; }
    setEditLoading(true);
    setEditError('');
    try {
      const { error } = await (await import('../lib/supabase')).supabase
        .from('user_profiles')
        .update({ display_name: editName.trim(), email: editEmail.trim() || '' })
        .eq('id', friend.id)
        .eq('is_guest', true);

      if (error) { setEditError('Failed to save changes'); return; }

      setLocalProfile({ ...friend, display_name: editName.trim(), email: editEmail.trim() || '' });
      setIsEditing(false);
      onBalanceUpdated(); // refresh FriendsList
    } catch {
      setEditError('Failed to save changes');
    } finally {
      setEditLoading(false);
    }
  };

  if (!friend) return <div className="text-center p-8 text-slate-500">Friend profile not found. <button onClick={onBack} className="ml-2 text-blue-500 underline">Back</button></div>;

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
          <div className="flex items-center space-x-4 flex-1">
            <div className={`w-12 h-12 rounded-full ${getAvatarColor(friend.display_name || friend.email)} flex items-center justify-center text-white font-semibold text-xl flex-shrink-0`}>
              {getInitials(friend.display_name || friend.email)}
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Name"
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    placeholder="Email (optional — for auto-linking when they join)"
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  {editError && <p className="text-xs text-red-500">{editError}</p>}
                  <div className="flex space-x-2">
                    <button
                      onClick={saveEdit}
                      disabled={editLoading}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium"
                    >
                      <Check className="h-4 w-4" />
                      <span>{editLoading ? 'Saving…' : 'Save'}</span>
                    </button>
                    <button
                      onClick={cancelEditing}
                      disabled={editLoading}
                      className="flex items-center space-x-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      <XIcon className="h-4 w-4" />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white">{friend.display_name}</h1>
                    {friend.is_guest && !friend.linked_user_id && (
                      <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">Guest</span>
                    )}
                    {friend.is_guest && friend.linked_user_id && (
                      <span className="text-xs px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-medium">Joined!</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{friend.email || (friend.is_guest ? 'No email added' : '')}</p>
                  {friendBalance && (
                    <p className={`text-sm mt-1 font-semibold ${friendBalance.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {friendBalance.balance >= 0 ? 'Owes you' : 'You owe'} {formatCurrency(Math.abs(friendBalance.balance))}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
            {friend.is_guest && !isEditing && (
              <button
                onClick={startEditing}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Edit guest profile"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {friendBalance && friendBalance.balance !== 0 && !isEditing && (
              <button onClick={() => setShowSettleUpModal(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 text-sm rounded-lg font-medium">
                Settle up
              </button>
            )}
          </div>
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
            refreshBalances();
          }}
        />
      )}
    </div>
  );
};

export default FriendDetailView;
