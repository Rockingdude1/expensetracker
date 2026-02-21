import React, { useState, useEffect } from 'react';
import { CreditCard, Banknote, Users, ArrowUpRight, ArrowDownRight, Trash2, Edit3, Search, Filter, X, Calendar, ChevronDown, AlertTriangle } from 'lucide-react';
import { Transaction, UserProfile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import EditTransactionModal from './EditTransactionModal';
import TransactionDetailModal from './TransactionDetailModal';
import { formatMonthYear } from '../utils/dateUtils';
import { userService } from '../services/userService';
import ConfirmationModal from './ConfirmationModal';

interface TransactionHistoryProps {
  transactions: Transaction[];
  period: string;
  profilesMap: Map<string, UserProfile>;
  onDeleteTransaction: (id: string) => void;
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => void;
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ transactions, period, profilesMap, onDeleteTransaction, onUpdateTransaction }) => {
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [transactionToDeleteId, setTransactionToDeleteId] = useState<string | null>(null);

  // Filter states
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<string[]>([]);
  const [amountFilter, setAmountFilter] = useState<string[]>([]);
  const [paymentModeFilter, setPaymentModeFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [friendsFilter, setFriendsFilter] = useState<string[]>([]);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [friends, setFriends] = useState<UserProfile[]>([]);

  // Load friends for filter
  useEffect(() => {
    const loadFriends = async () => {
      const friendsList = await userService.getFriends();
      setFriends(friendsList);
    };
    loadFriends();
  }, []);

  // --- Delete Confirmation Logic ---
const handlePrepareDelete = (transactionId: string) => {
  setTransactionToDeleteId(transactionId);
  setIsDeleteConfirmModalOpen(true);
};

const handleConfirmDelete = () => {
  if (transactionToDeleteId) {
    onDeleteTransaction(transactionToDeleteId);
  }
  // Reset state whether deletion happened or not
  setTransactionToDeleteId(null);
  setIsDeleteConfirmModalOpen(false);
};

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getTransactionIcon = (transaction: Transaction) => {
    if (transaction.type === 'revenue') return <ArrowUpRight className="h-5 w-5 text-emerald-600" />;
    if (transaction.type === 'shared') return <Users className="h-5 w-5 text-purple-600" />;
    return <ArrowDownRight className="h-5 w-5 text-red-600" />;
  };

  const getTransactionColor = (transaction: Transaction) => {
    if (transaction.type === 'revenue') return 'text-emerald-600';
    if (transaction.type === 'shared') return 'text-purple-600';
    return 'text-red-600';
  };

  const getTransactionBg = (transaction: Transaction) => {
    if (transaction.type === 'revenue') return 'bg-emerald-50 border-emerald-200';
    if (transaction.type === 'shared') return 'bg-purple-50 border-purple-200';
    return 'bg-red-50 border-red-200';
  };

  const getMyShare = (transaction: Transaction) => {
    if (transaction.type === 'shared' && transaction.split_details && currentUser) {
      const myPart = transaction.split_details.participants.find(p => p.user_id === currentUser.id);
      return myPart?.share_amount || 0;
    }
    return transaction.amount;
  };
  
 // REPLACE the old function with this new one
// MAKE SURE this is the ONLY version in your file
const getTransactionSummary = (transaction: Transaction) => {
  if (transaction.type !== 'shared' || !transaction.payers || transaction.payers.length === 0) {
    return null;
  }

  const participantCount = transaction.split_details?.participants.length || 0;
  let payersSummary = '';

  // Correctly handles the single-payer case
  if (transaction.payers.length === 1) {
    const payerId = transaction.payers[0].user_id;
    const payerProfile = profilesMap.get(payerId);
    const payerName = payerId === currentUser?.id 
        ? 'You' 
        : payerProfile?.display_name || payerProfile?.email?.split('@')[0] || 'Someone';
    payersSummary = `${payerName} paid`;
  } 
  // Adds a new summary for the multi-payer case
  else {
    payersSummary = 'Multiple people paid';
  }

  return `${payersSummary} • Split with ${participantCount} people`;
}; 

  const getCategoryLabel = (category?: string) => {
    const categoryLabels: Record<string, string> = { rent: 'Rent', food: 'Food', social: 'Social Life', transport: 'Transport', apparel: 'Apparel', beauty: 'Beauty', education: 'Education', other: 'Other' };
    return category ? categoryLabels[category] || 'Other' : '';
  };


  const toggleFilter = (filterArray: string[], setFilter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    if (filterArray.includes(value)) {
      setFilter(filterArray.filter(item => item !== value));
    } else {
      setFilter([...filterArray, value]);
    }
  };

  const clearAllFilters = () => {
    setDateFilter([]);
    setAmountFilter([]);
    setPaymentModeFilter([]);
    setCategoryFilter([]);
    setFriendsFilter([]);
    setCustomStartDate(null);
    setCustomEndDate(null);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (dateFilter.length > 0) count++;
    if (amountFilter.length > 0) count++;
    if (paymentModeFilter.length > 0) count++;
    if (categoryFilter.length > 0) count++;
    if (friendsFilter.length > 0) count++;
    return count;
  };

  const filteredTransactions = transactions.filter(transaction => {
    // Search query filter
    const query = searchQuery.toLowerCase();
    let matchesSearch = !searchQuery;
    if (searchQuery) {
      if (transaction.description?.toLowerCase().includes(query)) matchesSearch = true;
      else if (transaction.category && getCategoryLabel(transaction.category).toLowerCase().includes(query)) matchesSearch = true;
      else if (transaction.payment_mode.toLowerCase().includes(query)) matchesSearch = true;
      else if (transaction.type === 'shared') {
        if (transaction.payers?.some(p => {
          const profile = profilesMap.get(p.user_id);
          const name = profile?.display_name || profile?.email?.split('@')[0] || '';
          return name.toLowerCase().includes(query);
        })) matchesSearch = true;
        else if (transaction.split_details?.participants.some(p => {
          const profile = profilesMap.get(p.user_id);
          const name = profile?.display_name || profile?.email?.split('@')[0] || '';
          return name.toLowerCase().includes(query);
        })) matchesSearch = true;
      }
    }
    if (!matchesSearch) return false;

    // Date filter
    if (dateFilter.length > 0) {
      const txDate = new Date(transaction.date);
      const now = new Date();
      let matchesDate = false;

      dateFilter.forEach(filter => {
        if (filter === 'last5days') {
          const fiveDaysAgo = new Date(now);
          fiveDaysAgo.setDate(now.getDate() - 5);
          if (txDate >= fiveDaysAgo) matchesDate = true;
        } else if (filter === 'last10days') {
          const tenDaysAgo = new Date(now);
          tenDaysAgo.setDate(now.getDate() - 10);
          if (txDate >= tenDaysAgo) matchesDate = true;
        } else if (filter === 'custom' && customStartDate && customEndDate) {
          if (txDate >= customStartDate && txDate <= customEndDate) matchesDate = true;
        }
      });

      if (!matchesDate) return false;
    }

    // Amount filter
    if (amountFilter.length > 0) {
      const amount = transaction.amount;
      let matchesAmount = false;

      amountFilter.forEach(filter => {
        if (filter === 'under500' && amount < 500) matchesAmount = true;
        else if (filter === '500-1000' && amount >= 500 && amount <= 1000) matchesAmount = true;
        else if (filter === '1000-3000' && amount > 1000 && amount <= 3000) matchesAmount = true;
        else if (filter === 'over3000' && amount > 3000) matchesAmount = true;
      });

      if (!matchesAmount) return false;
    }

    // Payment mode filter
    if (paymentModeFilter.length > 0) {
      if (!paymentModeFilter.includes(transaction.payment_mode)) return false;
    }

    // Category filter
    if (categoryFilter.length > 0) {
      if (!transaction.category || !categoryFilter.includes(transaction.category)) return false;
    }

    // Friends filter
    if (friendsFilter.length > 0 && transaction.type === 'shared') {
      const participantIds = transaction.split_details?.participants.map(p => p.user_id) || [];
      const hasMatchingFriend = friendsFilter.some(friendId => participantIds.includes(friendId));
      if (!hasMatchingFriend) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2 px-4"> Transaction History </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 px-4"> All transactions from {formatMonthYear(period)} </p>
      </div>
      <div className="mx-2 sm:mx-0 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input type="text" placeholder="Search transactions..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200" />
        </div>

        {/* Filter Section */}
        <div className="space-y-3">
          {/* Primary Filters - Always Visible */}
          <div className="flex flex-wrap gap-2">
            {/* Date Filter Button */}
            <div className="relative">
              <button
                onClick={() => {
                  const btn = document.getElementById('date-filter-dropdown');
                  btn?.classList.toggle('hidden');
                }}
                className={`flex items-center space-x-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  dateFilter.length > 0
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-500 dark:text-emerald-400'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                <Calendar className="h-4 w-4" />
                <span>Date</span>
                {dateFilter.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-xs">{dateFilter.length}</span>
                )}
                <ChevronDown className="h-3 w-3" />
              </button>

              {/* Date Filter Dropdown */}
              <div id="date-filter-dropdown" className="hidden absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                <div className="p-2 space-y-1">
                  <button
                    onClick={() => toggleFilter(dateFilter, setDateFilter, 'last5days')}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${
                      dateFilter.includes('last5days')
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Last 5 days
                  </button>
                  <button
                    onClick={() => toggleFilter(dateFilter, setDateFilter, 'last10days')}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${
                      dateFilter.includes('last10days')
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Last 10 days
                  </button>
                  <button
                    onClick={() => {
                      toggleFilter(dateFilter, setDateFilter, 'custom');
                      setShowCustomDatePicker(true);
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${
                      dateFilter.includes('custom')
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Custom Range
                  </button>
                </div>
              </div>
            </div>

            {/* Amount Filter Button */}
            <div className="relative">
              <button
                onClick={() => {
                  const btn = document.getElementById('amount-filter-dropdown');
                  btn?.classList.toggle('hidden');
                }}
                className={`flex items-center space-x-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  amountFilter.length > 0
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-500 dark:text-emerald-400'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                <span>Amount</span>
                {amountFilter.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-xs">{amountFilter.length}</span>
                )}
                <ChevronDown className="h-3 w-3" />
              </button>

              {/* Amount Filter Dropdown */}
              <div id="amount-filter-dropdown" className="hidden absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                <div className="p-2 space-y-1">
                  {[
                    { value: 'under500', label: 'Under ₹500' },
                    { value: '500-1000', label: '₹500 - ₹1,000' },
                    { value: '1000-3000', label: '₹1,000 - ₹3,000' },
                    { value: 'over3000', label: 'Over ₹3,000' },
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => toggleFilter(amountFilter, setAmountFilter, option.value)}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        amountFilter.includes(option.value)
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Friends Filter Button */}
            <div className="relative">
              <button
                onClick={() => {
                  const btn = document.getElementById('friends-filter-dropdown');
                  btn?.classList.toggle('hidden');
                }}
                className={`flex items-center space-x-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  friendsFilter.length > 0
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-500 dark:text-emerald-400'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                <Users className="h-4 w-4" />
                <span>Friends</span>
                {friendsFilter.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-xs">{friendsFilter.length}</span>
                )}
                <ChevronDown className="h-3 w-3" />
              </button>

              {/* Friends Filter Dropdown */}
              <div id="friends-filter-dropdown" className="hidden absolute top-full left-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 max-h-64 overflow-y-auto">
                <div className="p-2 space-y-1">
                  {friends.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No friends added</div>
                  ) : (
                    friends.map(friend => (
                      <button
                        key={friend.id}
                        onClick={() => toggleFilter(friendsFilter, setFriendsFilter, friend.id)}
                        className={`w-full text-left px-3 py-2 rounded text-sm ${
                          friendsFilter.includes(friend.id)
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {friend.display_name || friend.email?.split('@')[0]}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* All Filters Button */}
            <button
              onClick={() => setShowAllFilters(!showAllFilters)}
              className={`flex items-center space-x-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                showAllFilters
                  ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-400'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>All Filters</span>
              {getActiveFilterCount() > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-xs">{getActiveFilterCount()}</span>
              )}
            </button>

            {/* Clear Filters Button */}
            {getActiveFilterCount() > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex items-center space-x-1 px-3 py-2 rounded-lg border border-red-300 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
              >
                <X className="h-4 w-4" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* All Filters Panel */}
          {showAllFilters && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              {/* Payment Mode Filter */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Payment Mode</h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'cash', label: 'Cash', icon: <Banknote className="h-4 w-4" /> },
                    { value: 'online', label: 'Online', icon: <CreditCard className="h-4 w-4" /> },
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => toggleFilter(paymentModeFilter, setPaymentModeFilter, option.value)}
                      className={`flex items-center space-x-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        paymentModeFilter.includes(option.value)
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-500 dark:text-emerald-400'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600'
                      }`}
                    >
                      {option.icon}
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Filter */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Category</h3>
                <div className="flex flex-wrap gap-2">
                  {['rent', 'food', 'social', 'transport', 'apparel', 'beauty', 'education', 'other'].map(cat => (
                    <button
                      key={cat}
                      onClick={() => toggleFilter(categoryFilter, setCategoryFilter, cat)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        categoryFilter.includes(cat)
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-500 dark:text-emerald-400'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600'
                      }`}
                    >
                      {getCategoryLabel(cat)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Custom Date Picker Modal */}
        {showCustomDatePicker && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Custom Date Range</h3>
                <button
                  onClick={() => setShowCustomDatePicker(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate ? customStartDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => setCustomStartDate(e.target.value ? new Date(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">End Date</label>
                  <input
                    type="date"
                    value={customEndDate ? customEndDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => setCustomEndDate(e.target.value ? new Date(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex space-x-3 pt-2">
                  <button
                    onClick={() => {
                      setShowCustomDatePicker(false);
                      setCustomStartDate(null);
                      setCustomEndDate(null);
                      setDateFilter(dateFilter.filter(f => f !== 'custom'));
                    }}
                    className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowCustomDatePicker(false)}
                    disabled={!customStartDate || !customEndDate}
                    className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="text-center py-8 sm:py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 mx-2 sm:mx-0">
           <div className="max-w-md mx-auto">
             <div className="bg-slate-100 dark:bg-slate-700 rounded-full p-4 w-16 h-16 mx-auto mb-4">
               <CreditCard className="h-8 w-8 text-slate-600 dark:text-slate-300 mx-auto" />
             </div>
             <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 px-4"> {searchQuery ? 'No matching transactions' : 'No transactions found'} </h3>
             <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 px-4"> {searchQuery ? 'Try adjusting your search terms.' : `No transactions recorded for ${formatMonthYear(period)}.`} </p>
           </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mx-2 sm:mx-0">
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
{filteredTransactions.map((transaction) => {
  const myShare = getMyShare(transaction);
  const summaryLine = getTransactionSummary(transaction);

  return (
    <div 
      key={transaction.id} 
      className={`p-4 sm:p-6 transition-colors duration-150 cursor-pointer ${transaction.deleted_at ? 'opacity-50' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}
      onClick={() => setSelectedTransaction(transaction)}
    >
      
      {/* This container NO LONGER has the line-through class */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        
        {/* Main Content Area */}
        <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
          <div className={`p-2 sm:p-3 rounded-xl border ${getTransactionBg(transaction)} flex-shrink-0`}>
            {getTransactionIcon(transaction)}
          </div>
          <div className="flex-1 min-w-0">
            {/* Description and Tags */}
            <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-3">
              {/* ADD line-through HERE */}
              <h3 className={`font-semibold text-slate-900 dark:text-white text-sm sm:text-base truncate ${transaction.deleted_at ? 'line-through' : ''}`}>
                {transaction.description}
              </h3>
              {/* These tags will NOT have a line-through */}
              <div className="flex flex-wrap gap-1 sm:gap-2">
                <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {transaction.payment_mode === 'cash' ? <Banknote className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
                  <span className="capitalize">{transaction.payment_mode}</span>
                </span>
                {transaction.category && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                    {getCategoryLabel(transaction.category)}
                  </span>
                )}
              </div>
            </div>

            {/* Summary Line */}
            {summaryLine && (
              // ADD line-through HERE
              <p className={`text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 break-words ${transaction.deleted_at ? 'line-through' : ''}`}>
                {summaryLine}
              </p>
            )}
            
            {/* Date and Activity Log */}
            {/* ADD line-through to the date's <p> tag */}
            <p className={`text-xs text-slate-500 dark:text-slate-400 mt-1 ${transaction.deleted_at ? 'line-through' : ''}`}>
              {formatDate(transaction.date)}
            </p>
            {transaction.activity_log && transaction.activity_log.length > 0 && (
              <p className="text-xs mt-1 italic">
                {transaction.deleted_at ? (
                  <span className="text-red-500 dark:text-red-400">
                    Deleted by {transaction.activity_log[transaction.activity_log.length - 1].user_name}
                    {' '}on {formatDate(transaction.activity_log[transaction.activity_log.length - 1].timestamp)}
                  </span>
                ) : transaction.activity_log.length > 1 && (
                  <span className="text-blue-500 dark:text-blue-400">
                    Last updated by {transaction.activity_log[transaction.activity_log.length - 1].user_name}
                    {' '}on {formatDate(transaction.activity_log[transaction.activity_log.length - 1].timestamp)}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Amount and Actions Area */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 flex-shrink-0">
          <div className="text-right min-w-0">
            {/* ADD line-through HERE */}
            <p className={`text-sm sm:text-lg font-bold ${getTransactionColor(transaction)} break-all ${transaction.deleted_at ? 'line-through' : ''}`}>
              {transaction.type === 'revenue' ? '+' : '-'} {formatCurrency(myShare)}
            </p>
            {transaction.type === 'shared' && (
              // ADD line-through HERE
              <p className={`text-xs sm:text-sm text-slate-500 dark:text-slate-400 break-all ${transaction.deleted_at ? 'line-through' : ''}`}>
                Total: {formatCurrency(transaction.amount)}
              </p>
            )}
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setEditingTransaction(transaction);
            }} 
            disabled={!!transaction.deleted_at} 
            className="p-2 text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50" 
            title="Edit"
          > 
            <Edit3 className="h-4 w-4" /> 
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handlePrepareDelete(transaction.id);
            }} 
            disabled={!!transaction.deleted_at} 
            className="p-2 text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50" 
            title="Delete"
          > 
            <Trash2 className="h-4 w-4" /> 
          </button>
        </div>
      </div>

      {/* Hide Split Details if transaction is deleted */}
      {transaction.type === 'shared' && transaction.split_details && !transaction.deleted_at && (
        <div className="mt-4 pl-0 sm:pl-16">
          {/* ... your split details JSX ... */}
        </div>
      )}
    </div>
  );
})}
          </div>
        </div>
      )}
      
      {/* Modals */}
      {editingTransaction && (
        <EditTransactionModal 
          transaction={editingTransaction} 
          onUpdate={onUpdateTransaction} 
          onClose={() => setEditingTransaction(null)}
          currentUser={currentUser}
          userService={userService}
        />
      )}
      
      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          profilesMap={profilesMap}
          onClose={() => setSelectedTransaction(null)}
        />
      )}

      {/* --- NEW CONFIRMATION MODAL INTEGRATION --- */}
<ConfirmationModal
  isOpen={isDeleteConfirmModalOpen}
  onClose={() => setIsDeleteConfirmModalOpen(false)}
  onConfirm={handleConfirmDelete}
  message="Are you sure you want to delete this transaction?"
/>
    </div>
  );
};

export default TransactionHistory;