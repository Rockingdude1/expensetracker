import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';

const CURRENCY_SIGN = '₹';

interface Participant {
  id: string;
  name: string;
}

interface PayerData {
  user_id: string;
  amount_paid: number;
  description?: string;
}

interface MultiPayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payers: PayerData[]) => void;
  participants: Participant[];
  totalAmount: number;
  initialPayers?: PayerData[];
}

const MultiPayerModal: React.FC<MultiPayerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  participants,
  totalAmount,
  initialPayers = []
}) => {
  const [payers, setPayers] = useState<Map<string, { amount: number; description: string; selected: boolean }>>(new Map());
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const initialPayersMap = new Map<string, { amount: number; description: string; selected: boolean }>();

      if (initialPayers.length > 0) {
        initialPayers.forEach(payer => {
          initialPayersMap.set(payer.user_id, {
            amount: payer.amount_paid,
            description: payer.description || '',
            selected: true
          });
        });
      }

      participants.forEach(participant => {
        if (!initialPayersMap.has(participant.id)) {
          initialPayersMap.set(participant.id, {
            amount: 0,
            description: '',
            selected: false
          });
        }
      });

      setPayers(initialPayersMap);
      setError('');
    }
  }, [isOpen, participants, initialPayers]);

  const toggleParticipant = (participantId: string) => {
    setPayers(prev => {
      const newPayers = new Map(prev);
      const current = newPayers.get(participantId);
      if (current) {
        newPayers.set(participantId, {
          ...current,
          selected: !current.selected,
          amount: !current.selected ? current.amount : 0
        });
      }
      return newPayers;
    });
    setError('');
  };

  const updateAmount = (participantId: string, amount: number) => {
    setPayers(prev => {
      const newPayers = new Map(prev);
      const current = newPayers.get(participantId);
      if (current) {
        newPayers.set(participantId, {
          ...current,
          amount: Math.max(0, amount)
        });
      }
      return newPayers;
    });
    setError('');
  };

  const updateDescription = (participantId: string, description: string) => {
    setPayers(prev => {
      const newPayers = new Map(prev);
      const current = newPayers.get(participantId);
      if (current) {
        newPayers.set(participantId, {
          ...current,
          description
        });
      }
      return newPayers;
    });
  };

  const handleSave = () => {
    const selectedPayers = Array.from(payers.entries())
      .filter(([_, data]) => data.selected)
      .map(([userId, data]) => ({
        user_id: userId,
        amount_paid: data.amount,
        description: data.description
      }));

    if (selectedPayers.length === 0) {
      setError('Please select at least one payer');
      return;
    }

    const totalPaid = selectedPayers.reduce((sum, payer) => sum + payer.amount_paid, 0);
    const difference = Math.abs(totalPaid - totalAmount);

    if (difference > 0.01) {
      setError(`Total paid (${totalPaid.toFixed(2)}) must equal transaction amount (${totalAmount.toFixed(2)})`);
      return;
    }

    onSave(selectedPayers);
    onClose();
  };

  const getTotalPaid = () => {
    return Array.from(payers.values())
      .filter(data => data.selected)
      .reduce((sum, data) => sum + data.amount, 0);
  };

  const getAvatarColor = (name: string) => {
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-red-500', 'bg-yellow-500', 'bg-pink-500', 'bg-orange-500'];
    const index = name ? name.charCodeAt(0) % colors.length : 0;
    return colors[index];
  };

  const getInitials = (name: string) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '';
  };

  if (!isOpen) return null;

  const totalPaid = getTotalPaid();
  const remaining = totalAmount - totalPaid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Multiple Payers</h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors duration-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-emerald-700 dark:text-emerald-300 font-medium">Transaction Amount:</span>
              <span className="text-emerald-900 dark:text-emerald-100 font-bold">{CURRENCY_SIGN}{totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm mt-2">
              <span className="text-emerald-700 dark:text-emerald-300 font-medium">Total Paid:</span>
              <span className={`font-bold {CURRENCY_SIGN}{Math.abs(remaining) < 0.01 ? 'text-emerald-600' : 'text-orange-600'}`}>
                {CURRENCY_SIGN}{totalPaid.toFixed(2)}
              </span>
            </div>
            {Math.abs(remaining) > 0.01 && (
              <div className="flex justify-between items-center text-sm mt-2">
                <span className="text-orange-700 dark:text-orange-300 font-medium">Remaining:</span>
                <span className="text-orange-900 dark:text-orange-100 font-bold">{CURRENCY_SIGN}{remaining.toFixed(2)}</span>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            {participants.map(participant => {
              const payerData = payers.get(participant.id);
              if (!payerData) return null;

              return (
                <div
                  key={participant.id}
                  className={`rounded-lg border-2 transition-all duration-200 ${
                    payerData.selected
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleParticipant(participant.id)}
                    className="w-full p-3 flex items-center space-x-3 text-left"
                  >
                    <div className={`w-10 h-10 rounded-full ${getAvatarColor(participant.name)} flex items-center justify-center text-white font-semibold flex-shrink-0`}>
                      {getInitials(participant.name)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-white">{participant.name}</p>
                    </div>
                    {payerData.selected && <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />}
                  </button>

                  {payerData.selected && (
                    <div className="px-3 pb-3 space-y-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Amount Paid
                        </label>
                        <input
                          type="number"
                          value={payerData.amount || ''}
                          onChange={(e) => updateAmount(participant.id, parseFloat(e.target.value) || 0)}
                          step="0.01"
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="0.00"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Description (optional)
                        </label>
                        <input
                          type="text"
                          value={payerData.description}
                          onChange={(e) => updateDescription(participant.id, e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="e.g., Paid for tickets"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 p-4 flex space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-105"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiPayerModal;
