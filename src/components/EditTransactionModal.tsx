import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Save, CreditCard, Banknote, Users, Check, Edit3 } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

import { Transaction, TransactionType, PaymentMode, Category, UserProfile } from '../types';

interface UserService {
  getFriends: () => Promise<UserProfile[]>;
}

interface EditTransactionModalProps {
  transaction: Transaction;
  onUpdate: (id: string, updates: Partial<Transaction>) => void;
  onClose: () => void;
  userService: UserService;
  currentUser: UserProfile | null;
}

interface SelectedFriend {
  id: string;
  name: string;
  email: string;
  splitPercentage: number;
}
const EditTransactionModal: React.FC<EditTransactionModalProps> = ({ transaction, onUpdate, onClose, userService, currentUser }) => {

  const [type, setType] = useState<TransactionType>(transaction.type);
  const [amount, setAmount] = useState(transaction.amount.toString());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(transaction.payment_mode);
  const [description, setDescription] = useState(transaction.description);
  const [selectedDate, setSelectedDate] = useState(new Date(transaction.date)); // Using Date object for DatePicker
  const [category, setCategory] = useState<Category>(transaction.category || 'other');
  
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<SelectedFriend[]>([]);
  const [splitMethod, setSplitMethod] = useState<'equally' | 'percentages'>('equally');
  const [selectedPayer, setSelectedPayer] = useState<string>('you');

  useEffect(() => {
    const loadFriendsAndInitializeState = async () => {
      try {
        const friendsList = await userService.getFriends();
        setFriends(friendsList);

        // Pre-populate form state if it's a shared transaction
        if (transaction.type === 'shared' && transaction.split_details && currentUser) {
          setSplitMethod(transaction.split_details.method);

          const payerId = transaction.payers[0]?.user_id;
          setSelectedPayer(payerId === currentUser.id ? 'you' : payerId || 'you');

          const friendParticipants = transaction.split_details.participants
            .filter(p => p.user_id !== currentUser.id)
            .map(p => {
              const friendProfile = friendsList.find(f => f.id === p.user_id);
              return {
                id: p.user_id,
                name: friendProfile?.display_name || friendProfile?.email?.split('@')[0] || 'Unknown',
                email: friendProfile?.email || '',
                splitPercentage: p.share_percentage || 0
              };
            });
          setSelectedFriends(friendParticipants);
        }
      } catch (error) {
        console.error('Error loading friends for edit modal:', error);
      }
    };

    if (currentUser) {
      loadFriendsAndInitializeState();
    }
  }, [transaction, currentUser, userService]);

      const categoryOptions: { value: Category; label: string }[] = [{ value: 'rent', label: 'Rent' }, { value: 'food', label: 'Food' }, { value: 'social', label: 'Social Life' }, { value: 'transport', label: 'Transport' }, { value: 'apparel', label: 'Apparel' }, { value: 'beauty', label: 'Beauty' }, { value: 'education', label: 'Education' }, { value: 'other', label: 'Other' }];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const totalAmount = parseFloat(amount);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    
    // Prepare the updates object
    let updates: Partial<Transaction> = {
      type,
      amount: totalAmount,
      payment_mode: paymentMode,
      description,
      date: selectedDate.toISOString(),
      category: type !== 'revenue' ? category : undefined,
    };

    if (type === 'shared') {
      if (selectedFriends.length === 0) {
        alert('Please select at least one friend for shared transactions.');
        return;
      }

      const payerId = selectedPayer === 'you' ? currentUser.id : selectedPayer;
      const payerProfile = selectedPayer === 'you' ? currentUser : friends.find(f => f.id === payerId);
      
      if (!payerProfile) return;

      updates.payers = [{
        user_id: payerId,
        name: payerProfile.display_name || payerProfile.email?.split('@')[0] || 'Unknown User',
        amount_paid: totalAmount
      }];

      // Build participants list
      const allParticipants = [
        currentUser,
        ...selectedFriends.map(sf => friends.find(f => f.id === sf.id)).filter(Boolean) as UserProfile[]
      ];
      let participantsWithShares = [];

      if (splitMethod === 'equally') {
        const totalPeople = allParticipants.length;
        const shareAmount = Math.floor((totalAmount / totalPeople) * 100) / 100;
        let accumulatedAmount = 0;

        participantsWithShares = allParticipants.map((p, index) => {
          if (index === totalPeople - 1) {
            const finalShare = parseFloat((totalAmount - accumulatedAmount).toFixed(2));
            return {
              user_id: p.id,
              name: p.display_name || p.email?.split('@')[0] || 'Unknown User',
              share_amount: finalShare
            };
          }
          accumulatedAmount += shareAmount;
          return {
            user_id: p.id,
            name: p.display_name || p.email?.split('@')[0] || 'Unknown User',
            share_amount: shareAmount
          };
        });

      } else {
        // Percentage split
        const myPercentage = 100 - selectedFriends.reduce((sum, f) => sum + f.splitPercentage, 0);
        
        if (Math.abs(myPercentage + selectedFriends.reduce((sum, f) => sum + f.splitPercentage, 0) - 100) > 0.1) {
          alert('Percentages must add up to 100%.');
          return;
        }

        participantsWithShares = [
          { 
            user_id: currentUser.id, 
            name: currentUser.display_name || currentUser.email?.split('@')[0] || 'Unknown User',
            share_amount: totalAmount * (myPercentage / 100), 
            share_percentage: myPercentage 
          },
          ...selectedFriends.map(f => ({
            user_id: f.id,
            name: f.name,
            share_amount: totalAmount * (f.splitPercentage / 100),
            share_percentage: f.splitPercentage
          }))
        ];
      }

      updates.split_details = {
        method: splitMethod,
        participants: participantsWithShares
      };
      
    } else {
      // For 'personal' or 'revenue'
      updates.payers = [{
        user_id: currentUser.id,
        name: currentUser.display_name || currentUser.email?.split('@')[0] || 'Unknown User',
        amount_paid: totalAmount
      }];
      updates.split_details = null;
    }

    console.log('Submitting transaction updates:', updates);
    
    onUpdate(transaction.id, updates);
    onClose();
  };
  
  const toggleFriendSelection = (friend: UserProfile) => {
    const isSelected = selectedFriends.some(f => f.id === friend.id);
    if (isSelected) {
      setSelectedFriends(selectedFriends.filter(f => f.id !== friend.id));
      if (selectedPayer === friend.id) { setSelectedPayer('you'); }
    } else {
      setSelectedFriends([...selectedFriends, { id: friend.id, name: friend.display_name || friend.email?.split('@')[0] || 'Unknown User', email: friend.email || '', splitPercentage: 0 }]);
    }
  };

  const updateFriendSplitPercentage = (friendId: string, percentage: number) => {
    setSelectedFriends(selectedFriends.map(friend => friend.id === friendId ? { ...friend, splitPercentage: percentage } : friend));
  };
  
  const getAvatarColor = (name: string) => {
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500'];
    const index = name ? name.charCodeAt(0) % colors.length : 0;
    return colors[index];
  };

  const getInitials = (name: string) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '';
  };

  // Auto-calculate equal percentages when split method changes
  useEffect(() => {
    if (splitMethod === 'equally' && selectedFriends.length > 0) {
      const totalPeople = selectedFriends.length + 1; // +1 for current user
      const equalPercentage = Math.floor(100 / totalPeople);
      const remainder = 100 - (equalPercentage * totalPeople);
      
      const updatedFriends = selectedFriends.map((friend, index) => ({
        ...friend,
        splitPercentage: equalPercentage + (index === 0 ? remainder : 0)
      }));
      setSelectedFriends(updatedFriends);
    }
  }, [splitMethod, selectedFriends.length]);

  const TransactionTypeCard: React.FC<any> = ({ title, description, icon, selected, onClick }) => (
    <button type="button" onClick={onClick} className={`p-4 rounded-xl border-2 transition-all duration-200 text-left min-h-[80px] ${selected ? 'border-emerald-500 bg-emerald-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Edit Transaction</h2>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Transaction Type */}
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-3"> Transaction Type </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TransactionTypeCard title="Revenue" description="Money received" icon={<Plus className="h-5 w-5" />} selected={type === 'revenue'} onClick={() => setType('revenue')} />
              <TransactionTypeCard title="Personal" description="For yourself" icon={<Minus className="h-5 w-5" />} selected={type === 'personal'} onClick={() => setType('personal')} />
              <TransactionTypeCard title="Shared" description="With friends" icon={<Users className="h-5 w-5" />} selected={type === 'shared'} onClick={() => setType('shared')} />
            </div>
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Amount </label>
            <input type="number" id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" required className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white" placeholder="0.00" />
          </div>

          {/* Payment Mode (only for non-shared) */}
          {type !== 'shared' && (
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Payment Mode </label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setPaymentMode('cash')} className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${paymentMode === 'cash' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 dark:border-slate-600'}`}>
                  <Banknote className="h-5 w-5" />
                  <span>Cash</span>
                </button>
                <button type="button" onClick={() => setPaymentMode('online')} className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${paymentMode === 'online' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 dark:border-slate-600'}`}>
                  <CreditCard className="h-5 w-5" />
                  <span>Online</span>
                </button>
              </div>
            </div>
          )}
          
          {/* Date Picker */}
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Date </label>
            <DatePicker
              selected={selectedDate}
              onChange={(date: Date) => setSelectedDate(date || new Date())}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              dateFormat="MMM dd, yyyy"
              maxDate={new Date()}
            />
          </div>

          {/* Category */}
          {type !== 'revenue' && (
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Category </label>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                {categoryOptions.map(option => (<option key={option.value} value={option.value}> {option.label} </option>))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-900 dark:text-white mb-2"> Description </label>
            <input type="text" id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700" placeholder="Enter description" />
          </div>

          {/* === START: SHARED EXPENSE SECTION === */}
          {type === 'shared' && (
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-3"> With you and </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {friends.map((friend) => {
                  const isSelected = selectedFriends.some(f => f.id === friend.id);
                  return (
                    <button key={friend.id} type="button" onClick={() => toggleFriendSelection(friend)} className={`w-full p-3 rounded-lg border-2 transition-all duration-200 ${isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${getAvatarColor(friend.display_name || friend.email || '')}`}>
                          {getInitials(friend.display_name || friend.email || '')}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-slate-900 dark:text-white">{friend.display_name || friend.email.split('@')[0]}</p>
                        </div>
                        {isSelected && <Check className="h-5 w-5 text-emerald-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {selectedFriends.length > 0 && (
                <div className="mt-4">
                  <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                    <div>
                      <label className="block text-sm font-medium"> Paid by </label>
                      <select value={selectedPayer} onChange={(e) => setSelectedPayer(e.target.value)} className="w-full mt-1 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700">
                        <option value="you">You</option>
                        {selectedFriends.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium"> Split </label>
                      <div className="grid grid-cols-2 gap-3 mt-1">
                        <button type="button" onClick={() => setSplitMethod('equally')} className={`py-3 rounded-lg border-2 ${splitMethod === 'equally' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'}`}> Equally </button>
                        <button type="button" onClick={() => setSplitMethod('percentages')} className={`py-3 rounded-lg border-2 ${splitMethod === 'percentages' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'}`}> By Percentage </button>
                      </div>
                    </div>
                    {splitMethod === 'percentages' && (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <span>You</span>
                          <div className="flex items-center space-x-2">
                            <input type="number" value={100 - selectedFriends.reduce((sum, f) => sum + f.splitPercentage, 0)} readOnly className="w-20 px-2 py-1 border border-slate-300 rounded-md bg-slate-100" />
                            <span>%</span>
                          </div>
                        </div>
                        {selectedFriends.map((friend) => (
                          <div key={friend.id} className="flex items-center justify-between">
                            <span>{friend.name}</span>
                            <div className="flex items-center space-x-2">
                              <input type="number" value={friend.splitPercentage} onChange={(e) => updateFriendSplitPercentage(friend.id, parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 border border-slate-300 rounded-md" placeholder="0" />
                              <span>%</span>
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

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-300 rounded-lg hover:bg-slate-50"> Cancel </button>
            <button type="submit" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center space-x-2 transition-colors">
              <Save className="h-5 w-5" />
              <span>Update</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditTransactionModal;