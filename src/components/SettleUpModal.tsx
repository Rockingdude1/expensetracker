import React, { useState } from 'react';
import { X, Save, CreditCard, Banknote, ArrowRight } from 'lucide-react';
import { PaymentMode } from '../types';
import { transactionService } from '../services/transactionService';
import { UserProfile } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';



interface SettleUpModalProps {

  friend: UserProfile;

  currentBalance: number;

  onClose: () => void;

  onSettled: () => void;

}



const SettleUpModal: React.FC<SettleUpModalProps> = ({ 

  friend, 

  currentBalance, 

  onClose, 

  onSettled 

}) => {

  const { user } = useAuth();

  const [amount, setAmount] = useState(Math.abs(currentBalance).toString());

  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');

  const [isSubmitting, setIsSubmitting] = useState(false);



  // Determine payment direction based on balance

  const youOwe = currentBalance < 0;

  const friendOwes = currentBalance > 0;



  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    

    if (!user) {

      alert('You must be logged in to record a settlement');

      return;

    }

    

    setIsSubmitting(true);



    try {

      const settlementAmount = parseFloat(amount);

      

      if (settlementAmount <= 0) {

        alert('Please enter a valid amount');

        setIsSubmitting(false);

        return;

      }



      // Create settlement transaction

      const settlementTransaction = {

        type: youOwe ? 'personal' as const : 'revenue' as const,

        amount: settlementAmount,

        payment_mode: paymentMode,

        description: youOwe 

          ? `SETTLEMENT: Paid ${friend.email}` 

          : `SETTLEMENT: Received from ${friend.email}`,

        date: new Date().toISOString(),

        category: undefined,
        payers: [{
      user_id: youOwe ? user.id : friend.id,
      amount_paid: settlementAmount
  }]

      };



      console.log('Creating settlement transaction for user:', user.id);

      await transactionService.addTransaction(settlementTransaction, user);

      console.log('Settlement transaction created successfully');

      

      onSettled();

      onClose();

    } catch (error) {

      console.error('Error creating settlement transaction:', error);

      alert(`Failed to record settlement: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);

    } finally {

      setIsSubmitting(false);

    }

  };



  return (

    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full">

        {/* Header */}

        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4">

          <div className="flex items-center justify-between">

            <h2 className="text-lg font-semibold text-white">Record a Payment</h2>

            <button

              onClick={onClose}

              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors duration-200"

            >

              <X className="h-5 w-5" />

            </button>

          </div>

        </div>



        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Payment Direction Visual */}

          <div className="flex items-center justify-center space-x-4 py-4">

            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">

              <span className="text-white font-semibold text-sm">You</span>

            </div>

            <ArrowRight className={`h-6 w-6 ${youOwe ? 'text-red-500' : 'text-emerald-500'}`} />

            <div className="w-12 h-12 bg-gradient-to-br from-slate-500 to-slate-600 rounded-full flex items-center justify-center">

              <span className="text-white font-semibold text-xs">

                {friend.display_name?.charAt(0) || friend.email.charAt(0).toUpperCase()}

              </span>

            </div>

          </div>



          {/* Payment Message */}

          <div className="text-center">

            <p className="text-lg font-medium text-slate-900 dark:text-white">

              {youOwe 

                ? `You paid ${friend.display_name || friend.email.split('@')[0]}` 

                : `${friend.display_name || friend.email.split('@')[0]} paid you`

              }

            </p>

          </div>



          {/* Amount Input */}

          <div>

            <label htmlFor="amount" className="block text-sm font-medium text-slate-900 dark:text-white mb-2">

              Amount

            </label>

            <div className="relative">

              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 font-medium">

                ₹

              </span>

              <input

                type="number"

                id="amount"

                value={amount}

                onChange={(e) => setAmount(e.target.value)}

                step="0.01"

                min="0.01"

                required

                className="w-full pl-8 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200 text-lg font-medium"

                placeholder="0.00"

              />

            </div>

          </div>



          {/* Payment Mode Selection */}

          <div>

            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-3">

              Payment Mode

            </label>

            <div className="grid grid-cols-2 gap-3">

              <button

                type="button"

                onClick={() => setPaymentMode('cash')}

                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${

                  paymentMode === 'cash'

                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'

                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400'

                }`}

              >

                <Banknote className="h-5 w-5" />

                <span className="font-medium">Cash</span>

              </button>

              <button

                type="button"

                onClick={() => setPaymentMode('online')}

                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${

                  paymentMode === 'online'

                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'

                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400'

                }`}

              >

                <CreditCard className="h-5 w-5" />

                <span className="font-medium">Online</span>

              </button>

            </div>

          </div>



          {/* Current Balance Info */}

          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">

            <div className="text-center">

              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Current Balance</p>

              <p className={`text-lg font-semibold ${

                currentBalance > 0 ? 'text-emerald-600' : currentBalance < 0 ? 'text-red-600' : 'text-slate-600'

              }`}>

                {currentBalance > 0 

                  ? `${friend.display_name || friend.email.split('@')[0]} owes you ₹${Math.abs(currentBalance).toFixed(2)}`

                  : currentBalance < 0 

                  ? `You owe ${friend.display_name || friend.email.split('@')[0]} ₹${Math.abs(currentBalance).toFixed(2)}`

                  : 'No outstanding balance'

                }

              </p>

            </div>

          </div>



          {/* Submit Buttons */}

          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-slate-200 dark:border-slate-700">

            <button

              type="button"

              onClick={onClose}

              disabled={isSubmitting}

              className="px-6 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors duration-200 disabled:opacity-50"

            >

              Cancel

            </button>

            <button

              type="submit"

              disabled={isSubmitting}

              className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:transform-none"

            >

              <Save className="h-5 w-5" />

              <span>{isSubmitting ? 'Recording...' : 'Record Payment'}</span>

            </button>

          </div>

        </form>

      </div>

    </div>

  );

};



export default SettleUpModal;