import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Save, CreditCard, Banknote, Users, Check, Pencil } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

import { Transaction, TransactionType, PaymentMode, Category, UserProfile } from '../types';
import MultiPayerModal from './MultiPayerModal';

interface UserService {
  getFriends: () => Promise<UserProfile[]>;
}

const TransactionTypeCard: React.FC<{ title: string; description: string; icon: React.ReactNode; selected: boolean; onClick: () => void }> = React.memo(
  ({ title, description, icon, selected, onClick }) => (
    <button type="button" onClick={onClick} className={`p-4 rounded-xl border-2 transition-all duration-200 text-left min-h-[80px] ${selected ? 'border-emerald-500 bg-emerald-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}>
      <div className="flex items-start space-x-3">
        <div className={`p-2 rounded-lg flex-shrink-0 ${selected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{icon}</div>
        <div className="flex-1">
          <h3 className={`text-base font-semibold ${selected ? 'text-emerald-900' : 'text-slate-900'}`}>{title}</h3>
          <p className={`text-sm ${selected ? 'text-emerald-700' : 'text-slate-600'}`}>{description}</p>
        </div>
      </div>
    </button>
  )
);

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
  const [selectedDate, setSelectedDate] = useState(new Date(transaction.date));
  const [category, setCategory] = useState<Category>(transaction.category || 'other');

  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<SelectedFriend[]>([]);
  const [splitMethod, setSplitMethod] = useState<'equally' | 'percentages'>('equally');

  // Payer state — mirrors AddTransaction exactly
  const [selectedPayer, setSelectedPayer] = useState<string>('you');
  const [isMultiPayerModalOpen, setIsMultiPayerModalOpen] = useState(false);
  const [multiplePayers, setMultiplePayers] = useState<{ user_id: string; amount_paid: number; description?: string }[]>([]);

  useEffect(() => {
    const loadFriendsAndInitializeState = async () => {
      try {
        const friendsList = await userService.getFriends();
        setFriends(friendsList);

        if (transaction.type === 'shared' && transaction.split_details && currentUser) {
          setSplitMethod(
            transaction.split_details.method === 'settlement' ? 'equally' : transaction.split_details.method
          );

          // Restore payer state
          const payers = transaction.payers;
          if (payers.length > 1) {
            setSelectedPayer('multiple');
            setMultiplePayers(payers.map(p => ({ user_id: p.user_id, amount_paid: p.amount_paid })));
          } else if (payers.length === 1) {
            const singlePayer = payers[0];
            setSelectedPayer(singlePayer.user_id === currentUser.id ? 'you' : singlePayer.user_id);
          }

          // Restore selected friends from participants
          const friendParticipants = transaction.split_details.participants
            .filter(p => p.user_id !== currentUser.id)
            .map(p => {
              const fp = friendsList.find(f => f.id === p.user_id);
              return {
                id: p.user_id,
                name: fp?.display_name || fp?.email?.split('@')[0] || 'Unknown',
                email: fp?.email || '',
                splitPercentage: p.share_percentage || 0,
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

  const categoryOptions: { value: Category; label: string }[] = [
    { value: 'rent', label: 'Rent' }, { value: 'food', label: 'Food' },
    { value: 'social', label: 'Social Life' }, { value: 'transport', label: 'Transport' },
    { value: 'apparel', label: 'Apparel' }, { value: 'beauty', label: 'Beauty' },
    { value: 'education', label: 'Education' }, { value: 'other', label: 'Other' },
  ];

  const handleMultiPayerSave = (payers: { user_id: string; amount_paid: number; description?: string }[]) => {
    setMultiplePayers(payers);
  };

  const getMultiPayerSummary = () => {
    if (multiplePayers.length === 0) return '';
    return multiplePayers.map(p => {
      if (p.user_id === currentUser?.id) return 'You';
      const friend = selectedFriends.find(f => f.id === p.user_id);
      return friend?.name || 'Unknown';
    }).join(', ');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const totalAmount = parseFloat(amount);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

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

      // Build payers
      let builtPayers: { user_id: string; amount_paid: number }[] = [];
      if (selectedPayer === 'multiple') {
        if (multiplePayers.length === 0) {
          alert('Please specify who paid and how much.');
          return;
        }
        builtPayers = multiplePayers;
      } else if (selectedPayer === 'you') {
        builtPayers = [{ user_id: currentUser.id, amount_paid: totalAmount }];
      } else {
        builtPayers = [{ user_id: selectedPayer, amount_paid: totalAmount }];
      }
      updates.payers = builtPayers;

      // Build participants
      const allParticipants = [
        currentUser,
        ...selectedFriends.map(sf => friends.find(f => f.id === sf.id)).filter(Boolean) as UserProfile[],
      ];

      let participantsWithShares = [];
      if (splitMethod === 'equally') {
        const totalPeople = allParticipants.length;
        const shareAmount = Math.floor((totalAmount / totalPeople) * 100) / 100;
        let accumulated = 0;
        participantsWithShares = allParticipants.map((p, i) => {
          if (i === totalPeople - 1) {
            return { user_id: p.id, share_amount: parseFloat((totalAmount - accumulated).toFixed(2)) };
          }
          accumulated += shareAmount;
          return { user_id: p.id, share_amount: shareAmount };
        });
      } else {
        const myPct = 100 - selectedFriends.reduce((s, f) => s + f.splitPercentage, 0);
        participantsWithShares = [
          { user_id: currentUser.id, share_amount: totalAmount * (myPct / 100), share_percentage: myPct },
          ...selectedFriends.map(f => ({
            user_id: f.id,
            share_amount: totalAmount * (f.splitPercentage / 100),
            share_percentage: f.splitPercentage,
          })),
        ];
      }

      updates.split_details = { method: splitMethod, participants: participantsWithShares };
    } else {
      updates.payers = [{ user_id: currentUser.id, amount_paid: totalAmount }];
      updates.split_details = null;
    }

    onUpdate(transaction.id, updates);
    onClose();
  };

  const toggleFriendSelection = (friend: UserProfile) => {
    const isSelected = selectedFriends.some(f => f.id === friend.id);
    if (isSelected) {
      setSelectedFriends(selectedFriends.filter(f => f.id !== friend.id));
      if (selectedPayer === friend.id) setSelectedPayer('you');
      setMultiplePayers([]);
    } else {
      setSelectedFriends([
        ...selectedFriends,
        { id: friend.id, name: friend.display_name || friend.email?.split('@')[0] || 'Unknown User', email: friend.email || '', splitPercentage: 0 },
      ]);
    }
  };

  const updateFriendSplitPercentage = (friendId: string, percentage: number) => {
    setSelectedFriends(selectedFriends.map(f => f.id === friendId ? { ...f, splitPercentage: percentage } : f));
  };

  const getAvatarColor = (name: string) => {
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500'];
    return colors[name ? name.charCodeAt(0) % colors.length : 0];
  };

  const getInitials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '';

  useEffect(() => {
    if (splitMethod === 'equally' && selectedFriends.length > 0) {
      const totalPeople = selectedFriends.length + 1;
      const equalPct = Math.floor(100 / totalPeople);
      const remainder = 100 - equalPct * totalPeople;
      setSelectedFriends(selectedFriends.map((f, i) => ({ ...f, splitPercentage: equalPct + (i === 0 ? remainder : 0) })));
    }
  }, [splitMethod, selectedFriends.length]);

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Edit Transaction</h2>
              <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg"><X className="h-5 w-5" /></button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Transaction Type */}
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-3">Transaction Type</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TransactionTypeCard title="Revenue" description="Money received" icon={<Plus className="h-5 w-5" />} selected={type === 'revenue'} onClick={() => setType('revenue')} />
                <TransactionTypeCard title="Personal" description="For yourself" icon={<Minus className="h-5 w-5" />} selected={type === 'personal'} onClick={() => setType('personal')} />
                <TransactionTypeCard title="Shared" description="With friends" icon={<Users className="h-5 w-5" />} selected={type === 'shared'} onClick={() => setType('shared')} />
              </div>
            </div>

            {/* Amount */}
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Amount</label>
              <input type="number" id="amount" value={amount} onChange={e => setAmount(e.target.value)} step="0.01" required className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white" placeholder="0.00" />
            </div>

            {/* Payment Mode */}
            {type !== 'shared' && (
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Payment Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setPaymentMode('cash')} className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${paymentMode === 'cash' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 dark:border-slate-600'}`}>
                    <Banknote className="h-5 w-5" /><span>Cash</span>
                  </button>
                  <button type="button" onClick={() => setPaymentMode('online')} className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${paymentMode === 'online' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 dark:border-slate-600'}`}>
                    <CreditCard className="h-5 w-5" /><span>Online</span>
                  </button>
                </div>
              </div>
            )}

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Date</label>
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
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value as Category)} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                  {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Description</label>
              <input type="text" id="description" value={description} onChange={e => setDescription(e.target.value)} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white" placeholder="Enter description" />
            </div>

            {/* Shared section */}
            {type === 'shared' && (
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-3">With you and</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {friends.map(friend => {
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
                  <div className="mt-4 space-y-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                    {/* Paid by */}
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Paid by</label>

                      {/* Multi-payer summary box — only shown when multiple payers are set */}
                      {selectedPayer === 'multiple' && multiplePayers.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIsMultiPayerModalOpen(true)}
                          className="w-full px-4 py-3 mb-2 border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-between hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors text-left"
                        >
                          <div>
                            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Multiple People</p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-300">{getMultiPayerSummary()}</p>
                          </div>
                          <Pencil className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        </button>
                      )}

                      {/* Dropdown — always visible; for multi-payer mode it lets you switch back to single */}
                      <select
                        value={selectedPayer === 'multiple' ? 'multiple' : selectedPayer}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === 'multiple') {
                            setSelectedPayer('multiple');
                            setIsMultiPayerModalOpen(true);
                          } else {
                            setSelectedPayer(val);
                            setMultiplePayers([]);
                          }
                        }}
                        className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      >
                        <option value="you">You</option>
                        {selectedFriends.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        <option value="multiple">Multiple people</option>
                      </select>
                    </div>

                    {/* Split method */}
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Split</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => setSplitMethod('equally')} className={`py-3 rounded-lg border-2 ${splitMethod === 'equally' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'}`}>Equally</button>
                        <button type="button" onClick={() => setSplitMethod('percentages')} className={`py-3 rounded-lg border-2 ${splitMethod === 'percentages' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300'}`}>By Percentage</button>
                      </div>
                    </div>

                    {splitMethod === 'percentages' && (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-900 dark:text-white">You</span>
                          <div className="flex items-center space-x-2">
                            <input type="number" value={100 - selectedFriends.reduce((s, f) => s + f.splitPercentage, 0)} readOnly className="w-20 px-2 py-1 border border-slate-300 rounded-md bg-slate-100 text-sm" />
                            <span className="text-sm text-slate-600">%</span>
                          </div>
                        </div>
                        {selectedFriends.map(f => (
                          <div key={f.id} className="flex items-center justify-between">
                            <span className="text-slate-900 dark:text-white">{f.name}</span>
                            <div className="flex items-center space-x-2">
                              <input type="number" value={f.splitPercentage} onChange={e => updateFriendSplitPercentage(f.id, parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 border border-slate-300 rounded-md text-sm" placeholder="0" />
                              <span className="text-sm text-slate-600">%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
              <button type="submit" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center space-x-2 transition-colors">
                <Save className="h-5 w-5" /><span>Update</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* MultiPayerModal — same as AddTransaction */}
      {currentUser && (
        <MultiPayerModal
          isOpen={isMultiPayerModalOpen}
          onClose={(savedPayers) => {
            setIsMultiPayerModalOpen(false);
            if (!savedPayers && multiplePayers.length === 0) setSelectedPayer('you');
          }}
          onSave={handleMultiPayerSave}
          participants={[
            { id: currentUser.id, name: currentUser.display_name || currentUser.email?.split('@')[0] || 'You' },
            ...selectedFriends.map(f => ({ id: f.id, name: f.name })),
          ]}
          totalAmount={parseFloat(amount) || 0}
          initialPayers={multiplePayers}
        />
      )}
    </>
  );
};

export default EditTransactionModal;
