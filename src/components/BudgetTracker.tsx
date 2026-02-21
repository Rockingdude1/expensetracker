import React, { useState, useEffect } from 'react';
import { Target, Edit3, Save, X } from 'lucide-react';
import { Transaction } from '../types';
import { formatMonthYear } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';

interface Budget {
  totalBudget: number;
  period: string;
}

interface BudgetTrackerProps {
  transactions: Transaction[];
  period: string;
}

const BudgetTracker: React.FC<BudgetTrackerProps> = ({ transactions, period }) => {
  const { user: currentUser } = useAuth();
  const [budget, setBudget] = useState<Budget>(() => {
    const saved = localStorage.getItem(`expense-tracker-budget-${period}`);
    return saved ? JSON.parse(saved) : { totalBudget: 1000, period };
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(budget.totalBudget.toString());

  // --- MINIMAL CHANGE IS HERE ---
  // The logic now correctly reads `split_details` for shared expenses
  // and ignores settlements and deleted transactions.
const totalSpent = Math.round(transactions
  .filter(t => t.type !== 'revenue' && !t.deleted_at && !t.description?.startsWith('SETTLEMENT:'))
  .reduce((sum, t) => {
    if (t.type === 'shared' && t.split_details) {
      const myShare = t.split_details.participants.find(p => p.user_id === currentUser?.id)?.share_amount || 0;
      return sum + myShare;
    }
    if (t.type === 'personal') {
      return sum + t.amount;
    }
    return sum;
  }, 0));
  // --- END OF CHANGE ---

  const percentage = budget.totalBudget > 0 ? Math.min((totalSpent / budget.totalBudget) * 100, 100) : 0;
  const isOverBudget = totalSpent > budget.totalBudget;

  useEffect(() => {
    const saved = localStorage.getItem(`expense-tracker-budget-${period}`);
    if (saved) {
      const savedBudget = JSON.parse(saved);
      setBudget(savedBudget);
      setEditValue(savedBudget.totalBudget.toString());
    } else {
        const newBudget = { totalBudget: 1000, period };
        setBudget(newBudget);
        setEditValue(newBudget.totalBudget.toString());
    }
  }, [period]);

  const handleSave = () => {
    const newBudget = { ...budget, totalBudget: parseFloat(editValue) || 0 };
    setBudget(newBudget);
    localStorage.setItem(`expense-tracker-budget-${period}`, JSON.stringify(newBudget));
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(budget.totalBudget.toString());
    setIsEditing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
  };

  const getGaugeColor = () => {
    if (percentage <= 50) return 'text-emerald-500';
    if (percentage <= 80) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getGaugeGradient = () => {
    if (percentage <= 50) return 'from-emerald-500 to-emerald-600';
    if (percentage <= 80) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 mx-2 sm:mx-0">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-2 rounded-xl">
            <Target className="h-5 w-5 text-white" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
            Budget Tracker
          </h3>
        </div>
        
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors duration-200 min-h-[48px] px-2"
          >
            <Edit3 className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Edit</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSave}
              className="p-2 text-emerald-600 hover:text-emerald-700 transition-colors duration-200 min-w-[48px] min-h-[48px] flex items-center justify-center"
            >
              <Save className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancel}
              className="p-2 text-red-600 hover:text-red-700 transition-colors duration-200 min-w-[48px] min-h-[48px] flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Budget Input */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {formatMonthYear(period)} Budget:
          </span>
          {isEditing ? (
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full sm:w-32 px-3 py-2 text-right border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[48px]"
              step="1"
              min="0"
            />
          ) : (
            <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-white break-all">
              {formatCurrency(budget.totalBudget)}
            </span>
          )}
        </div>

        {/* Gauge Visualization */}
        <div className="relative">
          <div className="flex justify-center mb-4 px-4">
            <div className="relative w-40 sm:w-48 h-20 sm:h-24 overflow-hidden">
              {/* Background Arc */}
              <div className="absolute inset-0">
                <svg viewBox="0 0 200 100" className="w-full h-full">
                  <path
                    d="M 20 80 A 80 80 0 0 1 180 80"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-slate-200 dark:text-slate-600"
                  />
                </svg>
              </div>
              
              {/* Progress Arc */}
              <div className="absolute inset-0">
                <svg viewBox="0 0 200 100" className="w-full h-full">
                  <path
                    d="M 20 80 A 80 80 0 0 1 180 80"
                    fill="none"
                    stroke="url(#gaugeGradient)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(percentage / 100) * 251.2} 251.2`}
                    className="transition-all duration-500 ease-out"
                  />
                  <defs>
                    <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" className={`${getGaugeGradient().split(' ')[0].replace('from-', 'stop-')}`} />
                      <stop offset="100%" className={`${getGaugeGradient().split(' ')[1].replace('to-', 'stop-')}`} />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              
              {/* Center Text */}
              <div className="absolute inset-0 flex items-end justify-center pb-2">
                <div className="text-center">
                  <div className={`text-xl sm:text-2xl font-bold ${getGaugeColor()}`}>
                    {Math.round(percentage)}%
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {isOverBudget ? 'Over Budget' : 'of Budget'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="text-center p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-1">Spent</div>
              <div className={`text-base sm:text-lg font-bold ${isOverBudget ? 'text-red-600' : 'text-slate-900 dark:text-white'} break-all`}>
                {formatCurrency(totalSpent)}
              </div>
            </div>
            <div className="text-center p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-1">Remaining</div>
              <div className={`text-base sm:text-lg font-bold ${
                budget.totalBudget - totalSpent >= 0 
                  ? 'text-emerald-600' 
                  : 'text-red-600'
              } break-all`}>
                {formatCurrency(budget.totalBudget - totalSpent)}
              </div>
            </div>
          </div>
        </div>

        {isOverBudget && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <div className="mt-1 w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></div>
              <span className="text-xs sm:text-sm text-red-700 dark:text-red-300 font-medium break-words">
                You've exceeded your budget by {formatCurrency(totalSpent - budget.totalBudget)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BudgetTracker;