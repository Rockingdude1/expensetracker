import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, CreditCard, Banknote, Users, Plus, Info } from 'lucide-react';
import { Transaction } from '../types';
import { CategoryChart } from './CategoryChart';
import BudgetTracker from './BudgetTracker';
import BalanceBreakdownModal from './BalanceBreakdownModal';
import { formatMonthYear } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';

interface DashboardProps {
  transactions: Transaction[];
  period: string;
  friendBalances: Map<string, number>;
  openingBalance: number;
  onAddTransaction: () => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));

const COLOR_CLASSES = {
  green: 'from-emerald-500 to-emerald-600',
  red: 'from-red-500 to-red-600',
  blue: 'from-blue-500 to-blue-600',
  purple: 'from-purple-500 to-purple-600',
};

const StatCard: React.FC<{
  title: string;
  amount: number;
  icon: React.ReactNode;
  color: 'green' | 'red' | 'blue' | 'purple';
  subtitle?: string;
  infoText?: string;
}> = React.memo(({ title, amount, icon, color, subtitle, infoText }) => {
  const [showCardInfo, setShowCardInfo] = React.useState(false);
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 hover:shadow-md transition-shadow duration-200 relative">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
            {infoText && (
              <button onClick={() => setShowCardInfo(!showCardInfo)} onMouseLeave={() => setShowCardInfo(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-200">
                <Info className="h-3 w-3" />
              </button>
            )}
          </div>
          <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white break-all">{formatCurrency(amount)}</p>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 hidden sm:block">{subtitle}</p>}
        </div>
        <div className={`p-2 sm:p-3 rounded-xl bg-gradient-to-r ${COLOR_CLASSES[color]} flex-shrink-0 ml-2`}>
          <div className="text-white">{icon}</div>
        </div>
      </div>
      {infoText && showCardInfo && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 dark:bg-slate-700 text-white text-xs p-3 rounded-lg shadow-lg z-10 border border-slate-600">
          <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-700 border-l border-t border-slate-600 transform rotate-45"></div>
          {infoText}
        </div>
      )}
    </div>
  );
});

const Dashboard: React.FC<DashboardProps> = React.memo(({ transactions, period, friendBalances, openingBalance, onAddTransaction }) => {
  const { user: currentUser } = useAuth();
  const [showBalanceModal, setShowBalanceModal] = useState(false);

  const { revenue, cashRevenue, onlineRevenue, totalMyExpense, cashSpent, onlineSpent } = useMemo(() => {
    if (!currentUser) return { revenue: 0, cashRevenue: 0, onlineRevenue: 0, totalMyExpense: 0, cashSpent: 0, onlineSpent: 0 };
    let revenue = 0, cashRevenue = 0, onlineRevenue = 0, personalExpenses = 0, sharedExpenseMyShare = 0, cashSpent = 0, onlineSpent = 0;
    for (const tx of transactions) {
      if (tx.deleted_at) continue;
      if (tx.type === 'revenue') {
        revenue += tx.amount;
        if (tx.payment_mode === 'cash') cashRevenue += tx.amount;
        if (tx.payment_mode === 'online') onlineRevenue += tx.amount;
      }
      if (tx.type === 'personal') {
        if (tx.description?.startsWith('SETTLEMENT:')) {
          if (tx.payment_mode === 'cash') cashSpent += tx.amount;
          if (tx.payment_mode === 'online') onlineSpent += tx.amount;
        } else {
          personalExpenses += tx.amount;
          if (tx.payment_mode === 'cash') cashSpent += tx.amount;
          if (tx.payment_mode === 'online') onlineSpent += tx.amount;
        }
      }
      if (tx.type === 'shared' && tx.split_details) {
        const myShare = tx.split_details.participants.find(p => p.user_id === currentUser.id)?.share_amount || 0;
        sharedExpenseMyShare += myShare;
        const myPayment = tx.payers.find(p => p.user_id === currentUser.id)?.amount_paid || 0;
        if (myPayment > 0) {
          if (tx.payment_mode === 'cash') cashSpent += myPayment;
          if (tx.payment_mode === 'online') onlineSpent += myPayment;
        }
      }
    }
    return {
      revenue: Math.round(revenue), cashRevenue: Math.round(cashRevenue), onlineRevenue: Math.round(onlineRevenue),
      totalMyExpense: Math.round(personalExpenses + sharedExpenseMyShare), cashSpent: Math.round(cashSpent), onlineSpent: Math.round(onlineSpent),
    };
  }, [transactions, currentUser]);

  const closingBalance = openingBalance + revenue - (cashSpent + onlineSpent);

  const { iOweOthers, othersOweMe } = useMemo(() => {
    let iOweOthers = 0, othersOweMe = 0;
    for (const balance of friendBalances.values()) {
      if (balance > 0) othersOweMe += balance;
      else if (balance < 0) iOweOthers += Math.abs(balance);
    }
    return { iOweOthers: Math.round(iOweOthers), othersOweMe: Math.round(othersOweMe) };
  }, [friendBalances]);

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="text-center py-6 sm:py-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Financial Overview
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl mx-auto px-4">
          Track your revenue and expenses across cash and online payments. Get insights into your spending patterns and manage shared expenses with ease.
        </p>
      </div>

      {/* Revenue Section */}
      <div>
        <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center px-2 sm:px-0">
          <TrendingUp className="h-5 w-5 text-emerald-600 mr-2" />
          Revenue for {formatMonthYear(period)}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <StatCard title="Total Revenue" amount={revenue} icon={<TrendingUp className="h-6 w-6" />} color="green" infoText="Sum of all revenue transactions for this period" />
          <StatCard title="Cash Revenue" amount={cashRevenue} icon={<Banknote className="h-6 w-6" />} color="green" infoText="Revenue received via cash payments" />
          <StatCard title="Online Revenue" amount={onlineRevenue} icon={<CreditCard className="h-6 w-6" />} color="green" infoText="Revenue received via online payments" />
        </div>
      </div>

      {/* Expense Section */}
      <div>
        <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center px-2 sm:px-0">
          <TrendingDown className="h-5 w-5 text-red-600 mr-2" />
          Expenses for {formatMonthYear(period)}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StatCard title="My Total Expense" amount={totalMyExpense} icon={<TrendingDown className="h-6 w-6" />} color="red" infoText="Personal expenses + my share of split expenses." />
          <StatCard title="I Owe Others" amount={iOweOthers} icon={<Users className="h-6 w-6" />} color="purple" infoText="My share of expenses that others paid for. Settle up in the Friends tab." />
          <StatCard title="Others Owe Me" amount={othersOweMe} icon={<Users className="h-6 w-6" />} color="green" infoText="The amount friends owe me from expenses I paid for. Settle up in the Friends tab." />
        </div>
      </div>

      {/* Payment Method Breakdown */}
      <div>
        <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center px-2 sm:px-0">
          <CreditCard className="h-5 w-5 text-blue-600 mr-2" />
          Payment Method Breakdown
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <StatCard title="Cash Spent" amount={cashSpent} icon={<Banknote className="h-6 w-6" />} color="blue" subtitle="Total cash outflow from me" infoText="Personal cash expenses + settlements + full amount of shared expenses I paid via cash" />
          <StatCard title="Online Spent" amount={onlineSpent} icon={<CreditCard className="h-6 w-6" />} color="blue" subtitle="Total online outflow from me" infoText="Personal online expenses + settlements + full amount of shared expenses I paid via online" />
        </div>
      </div>

      {/* Net Position */}
      <button
        onClick={() => setShowBalanceModal(true)}
        className="w-full bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 hover:from-slate-100 hover:to-slate-200 dark:hover:from-slate-700 dark:hover:to-slate-600 rounded-xl p-6 border border-slate-200 dark:border-slate-600 transition-all duration-200 hover:shadow-md cursor-pointer"
      >
        <div className="text-center">
          <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-2">Net Position</h3>
          <p className={`text-2xl sm:text-3xl font-bold ${closingBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(closingBalance)}
          </p>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-1">
            {closingBalance >= 0 ? 'Positive cash flow' : 'Negative cash flow'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Click to view breakdown
          </p>
        </div>
      </button>

      {/* Child Components */}
      <BudgetTracker transactions={transactions} period={period} />
      <CategoryChart transactions={transactions} />

      {/* Quick Actions for empty state */}
      {transactions.length === 0 && (
        <div className="text-center py-8 sm:py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 mx-2 sm:mx-0">
          {/* ... empty state JSX ... */}
        </div>
      )}

      {/* Balance Breakdown Modal */}
      <BalanceBreakdownModal
        isOpen={showBalanceModal}
        onClose={() => setShowBalanceModal(false)}
        openingBalance={openingBalance}
        revenue={revenue}
        cashSpent={cashSpent}
        onlineSpent={onlineSpent}
        monthYear={period}
      />
    </div>
  );
});

export default Dashboard;