import React from 'react';
import { X } from 'lucide-react';

interface BalanceBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  openingBalance: number;
  revenue: number;
  cashSpent: number;
  onlineSpent: number;
  monthYear: string;
}

const BalanceBreakdownModal: React.FC<BalanceBreakdownModalProps> = ({
  isOpen,
  onClose,
  openingBalance,
  revenue,
  cashSpent,
  onlineSpent,
  monthYear
}) => {
  if (!isOpen) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
  };

  const netPosition = Math.round(openingBalance + revenue - cashSpent - onlineSpent);

  const formatMonthYear = (monthYearStr: string) => {
    const [year, month] = monthYearStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md transform transition-all duration-200 scale-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                Balance Breakdown
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {formatMonthYear(monthYear)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between py-3">
              <span className="text-base font-medium text-slate-700 dark:text-slate-300">
                Opening Balance
              </span>
              <span className={`text-lg font-semibold ${openingBalance >= 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                {openingBalance >= 0 ? '+' : ''} {formatCurrency(openingBalance)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-base font-medium text-slate-700 dark:text-slate-300">
                Monthly Revenue
              </span>
              <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-500">
                + {formatCurrency(revenue)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-base font-medium text-slate-700 dark:text-slate-300">
                Cash Spent
              </span>
              <span className="text-lg font-semibold text-red-600 dark:text-red-500">
                - {formatCurrency(cashSpent)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-base font-medium text-slate-700 dark:text-slate-300">
                Online Spent
              </span>
              <span className="text-lg font-semibold text-red-600 dark:text-red-500">
                - {formatCurrency(onlineSpent)}
              </span>
            </div>

            <div className="border-t-2 border-slate-300 dark:border-slate-600 pt-4 mt-4">
              <div className="flex items-center justify-between py-3 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-700/50 rounded-lg px-4">
                <span className="text-lg font-bold text-slate-900 dark:text-white">
                  Net Position
                </span>
                <span className={`text-xl font-bold ${netPosition >= 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                  {formatCurrency(netPosition)}
                </span>
              </div>
            </div>

            {openingBalance !== 0 && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <span className="font-semibold">Note:</span> The opening balance of {formatCurrency(openingBalance)} was carried forward from the previous month's closing balance.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end p-6 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition-colors duration-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default BalanceBreakdownModal;
