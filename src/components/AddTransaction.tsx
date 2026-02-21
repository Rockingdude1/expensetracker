import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Save, CreditCard, Banknote, Users, Check, CreditCard as Edit2 } from 'lucide-react';
import { TransactionType, PaymentMode, Category } from '../types';
import { UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import MultiPayerModal from './MultiPayerModal';

// 1. UPDATED INTERFACE to match the new database schema
export interface NewTransactionPayload {
  user_id: string;
  type: TransactionType;
  amount: number;
  payment_mode: PaymentMode;
  description: string;
  date: string;
  category?: Category;
  payers: { user_id: string; amount_paid: number; description?: string; }[];
  split_details?: {
    method: 'equally' | 'percentages';
    participants: {
      user_id: string;
      share_amount: number;
      share_percentage?: number;
    }[];
  };
}

interface AddTransactionProps {
  onSubmit: (transaction: NewTransactionPayload) => void;
  onCancel: () => void;
}

interface SelectedFriend {
  id: string;
  name: string;
  email: string;
  splitPercentage: number;
}

const AddTransaction: React.FC<AddTransactionProps> = ({ onSubmit, onCancel }) => {
  const [type, setType] = useState<'revenue' | 'personal' | 'shared'>('revenue');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [category, setCategory] = useState<Category>('other');
  
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<SelectedFriend[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; display_name?: string } | null>(null);
  
  const [splitMethod, setSplitMethod] = useState<'equally' | 'percentages'>('equally');
  const [selectedPayer, setSelectedPayer] = useState<string>('you');
  const [isMultiPayerModalOpen, setIsMultiPayerModalOpen] = useState(false);
  const [multiplePayers, setMultiplePayers] = useState<{ user_id: string; amount_paid: number; description?: string; }[]>([]);
  
  useEffect(() => {
    const loadUserAndFriends = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: userProfile } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
        setCurrentUser(userProfile);
        const { data: connections } = await supabase.from('user_connections').select('user_id_1, user_id_2').or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`).eq('status', 'accepted');
        if (!connections || connections.length === 0) { setFriends([]); return; }
        const friendIds = connections.map(conn => conn.user_id_1 === user.id ? conn.user_id_2 : conn.user_id_1);
        const uniqueFriendIds = [...new Set(friendIds)];
        const { data: friendsList } = await supabase.from('user_profiles').select('*').in('id', uniqueFriendIds);
        setFriends(friendsList || []);
      } catch (error) { console.error('Error loading user and friends:', error); }
    };
    loadUserAndFriends();
  }, []);

  useEffect(() => {
    if (splitMethod === 'equally' && selectedFriends.length > 0) {
      const totalPeople = selectedFriends.length + 1;
      const equalPercentage = Math.floor(100 / totalPeople);
      const remainder = 100 - (equalPercentage * totalPeople);
      const updatedFriends = selectedFriends.map((friend, index) => ({ ...friend, splitPercentage: equalPercentage + (index === 0 ? remainder : 0) }));
      setSelectedFriends(updatedFriends);
    }
  }, [splitMethod, selectedFriends.length]);

  const categoryOptions: { value: Category; label: string }[] = [ { value: 'rent', label: 'Rent' }, { value: 'food', label: 'Food' }, { value: 'social', label: 'Social Life' }, { value: 'transport', label: 'Transport' }, { value: 'apparel', label: 'Apparel' }, { value: 'beauty', label: 'Beauty' }, { value: 'education', label: 'Education' }, { value: 'other', label: 'Other' } ];

  // 2. THE FULLY REWRITTEN handleSubmit FUNCTION
const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      alert("Error: User not found. Please try again.");
      return;
    }

    const totalAmount = parseFloat(amount);
    if (isNaN(totalAmount) || totalAmount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    const baseTransaction = {
      user_id: currentUser.id,
      amount: totalAmount,
      payment_mode: paymentMode,
      description,
      date: new Date(selectedDate).toISOString(),
      category: type !== 'revenue' ? category : undefined
    };

    if (type === 'shared') {
      if (selectedFriends.length === 0) {
        alert('Please select at least one friend to share with.');
        return;
      }

      // Construct the `payers` object
      let payers = [];
      if (selectedPayer === 'multiple') {
        if (multiplePayers.length === 0) {
          alert('Please specify who paid and how much.');
          return;
        }
        payers = multiplePayers;
      } else if (selectedPayer === 'you') {
        payers = [{ user_id: currentUser.id, amount_paid: totalAmount }];
      } else {
        const payerFriend = friends.find(f => f.id === selectedPayer);
        if (!payerFriend) return;
        payers = [{ user_id: selectedPayer, amount_paid: totalAmount }];
      }

      // Construct the `split_details` object
      const allRawParticipants = [currentUser, ...selectedFriends];
      let participantsWithShares = [];

      if (splitMethod === 'equally') {
        const shareAmount = totalAmount / allRawParticipants.length;
        participantsWithShares = allRawParticipants.map(p => ({
          user_id: p.id,
          share_amount: shareAmount,
        }));
      } else { // 'percentages'
        const myPercentage = 100 - selectedFriends.reduce((sum, f) => sum + f.splitPercentage, 0);
        
        const totalPercentage = myPercentage + selectedFriends.reduce((sum, f) => sum + f.splitPercentage, 0);
        if (Math.abs(totalPercentage - 100) > 0.1) {
            alert('Percentages must add up to 100%.');
            return;
        }

        participantsWithShares = [
          {
            user_id: currentUser.id,
            share_amount: totalAmount * (myPercentage / 100),
            share_percentage: myPercentage,
          },
          ...selectedFriends.map(f => ({
            user_id: f.id,
            share_amount: totalAmount * (f.splitPercentage / 100),
            share_percentage: f.splitPercentage,
          }))
        ];
      }

      const split_details = {
        method: splitMethod,
        participants: participantsWithShares
      };

      const transaction: NewTransactionPayload = {
        ...baseTransaction,
        type: 'shared',
        payers: payers.map(p => ({
          user_id: p.user_id,
          amount_paid: p.amount_paid,
          ...(p.description && { description: p.description })
        })),
        split_details: {
          method: split_details.method,
          participants: split_details.participants.map(p => ({
            user_id: p.user_id,
            share_amount: p.share_amount,
            ...(p.share_percentage && { share_percentage: p.share_percentage })
          }))
        }
      };
      onSubmit(transaction);

    } else {
      const transaction: NewTransactionPayload = {
        ...baseTransaction,
        type: type,
        payers: [{ user_id: currentUser.id, amount_paid: totalAmount }],
        split_details: undefined
      };
      onSubmit(transaction);
    }
  };
  
  const toggleFriendSelection = (friend: UserProfile) => {
    const isSelected = selectedFriends.some(f => f.id === friend.id);
    if (isSelected) {
      setSelectedFriends(selectedFriends.filter(f => f.id !== friend.id));
      if (selectedPayer === friend.id) { setSelectedPayer('you'); }
      setMultiplePayers([]);
    } else {
      setSelectedFriends([...selectedFriends, { id: friend.id, name: friend.display_name || friend.email?.split('@')[0] || 'Unknown User', email: friend.email || '', splitPercentage: 0 }]);
    }
  };

  const handleMultiPayerSave = (payers: { user_id: string; amount_paid: number; description?: string; }[]) => {
    setMultiplePayers(payers);
  };

  const getMultiPayerSummary = () => {
    if (multiplePayers.length === 0) return '';
    const payerNames = multiplePayers.map(p => {
      if (p.user_id === currentUser?.id) return 'You';
      const friend = selectedFriends.find(f => f.id === p.user_id);
      return friend?.name || 'Unknown';
    });
    return payerNames.join(', ');
  };

  const updateFriendSplitPercentage = (friendId: string, percentage: number) => {
    setSelectedFriends(selectedFriends.map(friend => friend.id === friendId ? { ...friend, splitPercentage: percentage } : friend ));
  };

  const getAvatarColor = (name: string) => {
    const colors = [ 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500' ];
    const index = name ? name.charCodeAt(0) % colors.length : 0;
    return colors[index];
  };

  const getInitials = (name: string) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '';
  };

  // The TransactionTypeCard component remains unchanged...
  const TransactionTypeCard: React.FC<{
    transactionType: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    selected: boolean;
    onClick: () => void;
  }> = ({ transactionType, title, description, icon, selected, onClick }) => (
    <button type="button" onClick={onClick} className={`p-4 rounded-xl border-2 transition-all duration-200 text-left min-h-[80px] ${ selected ? 'border-emerald-500 bg-emerald-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm' }`}>
      <div className="flex items-start space-x-3">
        <div className={`p-2 rounded-lg flex-shrink-0 ${selected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}> {icon} </div>
        <div className="flex-1">
          <h3 className={`text-base font-semibold ${selected ? 'text-emerald-900' : 'text-slate-900'}`}> {title} </h3>
          <p className={`text-sm ${selected ? 'text-emerald-700' : 'text-slate-600'}`}> {description} </p>
        </div>
      </div>
    </button>
  );

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Add New Transaction</h2>
            <button onClick={onCancel} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors duration-200">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-3"> Transaction Type </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TransactionTypeCard transactionType="revenue" title="Revenue" description="Money received" icon={<Plus className="h-5 w-5" />} selected={type === 'revenue'} onClick={() => setType('revenue')} />
              <TransactionTypeCard transactionType="personal" title="Personal Expenses" description="Spend entirely for yourself" icon={<Minus className="h-5 w-5" />} selected={type === 'personal'} onClick={() => setType('personal')} />
              <TransactionTypeCard transactionType="shared" title="Shared Transactions" description="Split expenses with friends" icon={<Users className="h-5 w-5" />} selected={type === 'shared'} onClick={() => setType('shared')} />
            </div>
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Amount </label>
            <input type="number" id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" required className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200" placeholder="0.00" />
          </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Payment Mode </label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setPaymentMode('cash')} className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${ paymentMode === 'cash' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500' }`}>
                  <Banknote className="h-5 w-5" />
                  <span className="font-medium">Cash</span>
                </button>
                <button type="button" onClick={() => setPaymentMode('online')} className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${ paymentMode === 'online' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500' }`}>
                  <CreditCard className="h-5 w-5" />
                  <span className="font-medium">Online</span>
                </button>
              </div>
            </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Date </label>
            <DatePicker selected={selectedDate} onChange={(date) => setSelectedDate(date || new Date())} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200" dateFormat="MMM dd, yyyy" maxDate={new Date()} />
          </div>

          {type !== 'revenue' && (
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Category </label>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200">
                {categoryOptions.map(option => ( <option key={option.value} value={option.value}> {option.label} </option> ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Description </label>
            <input type="text" id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200" placeholder="Enter transaction description" />
          </div>
          {type === 'shared' && (
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-3"> With you and </label>
              {friends.length === 0 ? (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-yellow-700 dark:text-yellow-300 text-sm"> You need to add friends first to create shared transactions. Go to the Friends tab to add friends. </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {friends.map((friend) => {
                    const isSelected = selectedFriends.some(f => f.id === friend.id);
                    return (
                      <button key={friend.id} type="button" onClick={() => toggleFriendSelection(friend)} className={`w-full p-3 rounded-lg border-2 transition-all duration-200 ${ isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300' }`}>
                        <div className="flex items-center space-x-3">
                          {/* 3. ROBUST RENDERING FIX */}
                          <div className={`w-10 h-10 rounded-full ${getAvatarColor(friend.display_name || friend.email || '')} flex items-center justify-center text-white font-semibold`}>
                            {getInitials(friend.display_name || friend.email || '')}
                          </div>
                          <div className="flex-1 text-left">
                            <p className="font-medium text-slate-900 dark:text-white">
                              {friend.display_name || friend.email?.split('@')[0] || 'Unknown User'}
                            </p>
                          </div>
                          {isSelected && ( <Check className="h-5 w-5 text-emerald-600" /> )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedFriends.length > 0 && (
                <div className="mt-4">
                  <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Paid by </label>
                      {selectedPayer === 'multiple' && multiplePayers.length > 0 ? (
                        <div className="w-full px-4 py-3 border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Multiple People</p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-300">{getMultiPayerSummary()}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsMultiPayerModalOpen(true)}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 rounded-md hover:bg-emerald-100 dark:hover:bg-slate-600 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Edit</span>
                          </button>
                        </div>
                      ) : (
                        <select
                          value={selectedPayer}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSelectedPayer(value);
                            if (value === 'multiple') {
                              setIsMultiPayerModalOpen(true);
                            } else {
                              setMultiplePayers([]);
                            }
                          }}
                          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        >
                          <option value="you">You</option>
                          {selectedFriends.map(friend => ( <option key={friend.id} value={friend.id}>{friend.name}</option> ))}
                          <option value="multiple">Multiple people</option>
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Split </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => setSplitMethod('equally')} className={`py-3 rounded-lg border-2 ${splitMethod === 'equally' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'}`}> Equally </button>
                        <button type="button" onClick={() => setSplitMethod('percentages')} className={`py-3 rounded-lg border-2 ${splitMethod === 'percentages' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'}`}> By Percentage </button>
                      </div>
                    </div>
                    {splitMethod === 'percentages' && (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-900 dark:text-white">You</span>
                          <div className="flex items-center space-x-2">
                            <input type="number" value={100 - selectedFriends.reduce((sum, f) => sum + f.splitPercentage, 0)} readOnly className="w-20 px-2 py-1 text-sm border border-slate-300 rounded-md bg-slate-100" />
                            <span className="text-sm text-slate-600">%</span>
                          </div>
                        </div>
                        {selectedFriends.map((friend) => (
                          <div key={friend.id} className="flex items-center justify-between">
                            <span className="text-slate-900 dark:text-white">{friend.name}</span>
                            <div className="flex items-center space-x-2">
                              <input type="number" value={friend.splitPercentage} onChange={(e) => updateFriendSplitPercentage(friend.id, parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 text-sm border border-slate-300 rounded-md" placeholder="0" />
                              <span className="text-sm text-slate-600">%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex space-x-3 pt-4">
            <button type="button" onClick={onCancel} className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors duration-200"> Cancel </button>
            <button type="submit" disabled={type === 'shared' && selectedFriends.length === 0} className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:transform-none">
              <Save className="h-5 w-5" />
              <span>Save</span>
            </button>
          </div>
        </form>
      </div>

      {currentUser && (
        <MultiPayerModal
          isOpen={isMultiPayerModalOpen}
          onClose={() => {
            setIsMultiPayerModalOpen(false);
            if (multiplePayers.length === 0) {
              setSelectedPayer('you');
            }
          }}
          onSave={handleMultiPayerSave}
          participants={[
            { id: currentUser.id, name: currentUser.display_name || currentUser.email?.split('@')[0] || 'You' },
            ...selectedFriends.map(f => ({ id: f.id, name: f.name }))
          ]}
          totalAmount={parseFloat(amount) || 0}
          initialPayers={multiplePayers}
        />
      )}
    </div>
  );
};

export default AddTransaction;