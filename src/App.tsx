import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, TrendingDown, CreditCard, Banknote, Users, Calendar, ChevronDown, Moon, Sun, LogOut, User } from 'lucide-react';
import Dashboard from './components/Dashboard';
import AddTransaction from './components/AddTransaction';
import TransactionHistory from './components/TransactionHistory';
import FriendsList from './components/FriendsList';
import AuthGuard from './components/AuthGuard';
import { Transaction, TransactionType, PaymentMode, Period } from './types';
import { useTheme } from './contexts/ThemeContext';
import { useAuth } from './contexts/AuthContext';
import { transactionService } from './services/transactionService';
import { userService } from './services/userService';
import { formatMonthYear, getCurrentMonthYear, getMonthYearFromDate } from './utils/dateUtils';

function App() {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, UserProfile>>(new Map());
  const [friendBalances, setFriendBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'add' | 'history' | 'friends'>('dashboard');
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>(getCurrentMonthYear());
  const [availableMonths, setAvailableMonths] = useState<string[]>([getCurrentMonthYear()]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Load transactions from Supabase when user changes
  useEffect(() => {
    const loadTransactions = async () => {
      if (!user) {
        setTransactions([]);
        setProfilesMap(new Map());
        return;
      }

      setLoading(true);
      setError(null);
      
      try {
        console.log('Loading transactions for user:', user.id);
        
        // First, try to migrate any existing localStorage data
        await transactionService.migrateLocalStorageData(user.id);
        
        // Then fetch all transactions from Supabase
       const fetchedTransactions = await transactionService.fetchTransactions(user.id);
        console.log('Fetched transactions from Supabase:', fetchedTransactions.length);
        setTransactions(fetchedTransactions);
        
        // Fetch friend balances from debts table
        const balances = await transactionService.getFriendBalances(user.id);
        setFriendBalances(balances);

        // Calculate and store monthly balances for the balance carried forward feature
        await transactionService.calculateAndStoreMonthlyBalances(user.id, fetchedTransactions);

        // Collect all unique user IDs from transactions
        const userIds = new Set<string>();
        fetchedTransactions.forEach(transaction => {
          userIds.add(transaction.user_id);
          if (transaction.payers) {
            transaction.payers.forEach(payer => userIds.add(payer.user_id));
          }
          if (transaction.split_details?.participants) {
            transaction.split_details.participants.forEach(participant => userIds.add(participant.user_id));
          }
        });

        // Fetch user profiles for all involved users
        if (userIds.size > 0) {
          const profiles = await userService.getUsersByIds(Array.from(userIds));
          const newProfilesMap = new Map<string, UserProfile>();
          profiles.forEach(profile => {
            newProfilesMap.set(profile.id, profile);
          });
          setProfilesMap(newProfilesMap);
        }
        
        // Clear any localStorage data after successful sync
        localStorage.removeItem(`expense-tracker-data-${user.id}`);
      } catch (err) {
        console.error('Error loading transactions:', err);
        setError('Failed to load transactions from cloud storage. Please check your internet connection and try refreshing.');
        
        // Don't fallback to localStorage anymore - we want to force cloud sync
        setTransactions([]);
        setProfilesMap(new Map());
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [user?.id]);

  // Update available months when transactions change
  useEffect(() => {
    const currentMonth = getCurrentMonthYear();
    const monthsWithTransactions = new Set<string>();
    
    // Always include current month
    monthsWithTransactions.add(currentMonth);
    
    // Add months that have transactions
    transactions.forEach(transaction => {
      const monthYear = getMonthYearFromDate(transaction.date);
      monthsWithTransactions.add(monthYear);
    });
    
    // Convert to sorted array (newest first)
    const sortedMonths = Array.from(monthsWithTransactions).sort((a, b) => b.localeCompare(a));
    setAvailableMonths(sortedMonths);
    
    // If selected month is no longer available, default to current month
    if (!sortedMonths.includes(selectedMonthYear)) {
      setSelectedMonthYear(currentMonth);
    }
  }, [transactions, selectedMonthYear]);

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'date'>) => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      console.log('Adding transaction for user:', user.id);
      const transactionWithDate = {
        ...transaction,
        date: new Date().toISOString(),
      };

      const newTransaction = await transactionService.addTransaction(transactionWithDate, user);
      console.log('Transaction added successfully:', newTransaction.id);
      const updatedTransactions = [newTransaction, ...transactions];
      setTransactions(updatedTransactions);

      await transactionService.calculateAndStoreMonthlyBalances(user.id, updatedTransactions);

      setCurrentView('dashboard');
    } catch (err) {
      console.error('Error adding transaction:', err);
      setError('Failed to add transaction to cloud storage. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

// In your App.js file

  const deleteTransaction = async (id: string) => {
    // The if (!user) check is still good practice.
    if (!user) return;

    try {
      console.log('Soft-deleting transaction:', id);
      
      // --- THIS IS THE CHANGE ---
      // We no longer pass the 'user' object. The service will handle it.
      const updatedTransactionWithDeletion = await transactionService.deleteTransaction(id);
      // --- END OF CHANGE ---

      console.log('Transaction soft-deleted successfully');

      const updatedTransactions = transactions.map(t => t.id === id ? updatedTransactionWithDeletion : t);
      setTransactions(updatedTransactions);

      await transactionService.calculateAndStoreMonthlyBalances(user.id, updatedTransactions);
      
    } catch (err) {
      console.error('Error deleting transaction:', err);
      setError('Failed to delete transaction. Please try again.');
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      console.log('Updating transaction:', id);
      const updatedTransaction = await transactionService.updateTransaction(id, updates, user);
      console.log('Transaction updated successfully');
      const updatedTransactions = transactions.map(t => t.id === id ? updatedTransaction : t);
      setTransactions(updatedTransactions);

      await transactionService.calculateAndStoreMonthlyBalances(user.id, updatedTransactions);
    } catch (err) {
      console.error('Error updating transaction:', err);
      setError('Failed to update transaction in cloud storage. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };
  const getFilteredTransactions = () => {
    return transactions.filter(transaction => {
      const transactionMonthYear = getMonthYearFromDate(transaction.date);
      return transactionMonthYear === selectedMonthYear;
    });
  };

  const filteredTransactions = getFilteredTransactions();

  const handleSignOut = async () => {
    await signOut();
    setTransactions([]);
    setError(null);
    setCurrentView('dashboard');
    setShowUserMenu(false);
  };

  return (
    <AuthGuard>
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-3">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 min-h-[24px] min-w-[24px] flex items-center justify-center"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-300">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 transition-colors duration-300">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-r from-emerald-500 to-blue-600 p-2 rounded-xl">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Spendify</h1>
              </div>
              
              {/* Theme Toggle, Period Selector, and User Menu */}
              <div className="flex items-center space-x-2 sm:space-x-4">
                <button
                  onClick={toggleTheme}
                  className="p-2 sm:p-3 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors duration-200 min-w-[48px] min-h-[48px] flex items-center justify-center"
                >
                  {theme === 'light' ? (
                    <Moon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                  ) : (
                    <Sun className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                  )}
                </button>
                
                <div className="relative">
                  <button
                    onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                    className="flex items-center space-x-1 sm:space-x-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-2 sm:px-4 py-2 sm:py-3 rounded-lg transition-colors duration-200 min-h-[48px]"
                  >
                    <Calendar className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:inline">
                      {formatMonthYear(selectedMonthYear)}
                    </span>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 sm:hidden">
                      {formatMonthYear(selectedMonthYear).split(' ')[0]}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  </button>
                  
                  {showMonthDropdown && (
                    <div className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-2 min-w-48 max-h-64 overflow-y-auto z-10">
                      {availableMonths.map((monthYear) => (
                        <button
                          key={monthYear}
                          onClick={() => {
                            setSelectedMonthYear(monthYear);
                            setShowMonthDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-3 text-sm transition-colors duration-150 min-h-[48px] flex items-center ${
                            selectedMonthYear === monthYear
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-medium'
                              : 'text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          {formatMonthYear(monthYear)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* User Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center space-x-1 sm:space-x-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-2 sm:px-3 py-2 sm:py-3 rounded-lg transition-colors duration-200 min-h-[48px]"
                  >
                    <User className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 max-w-20 sm:max-w-32 truncate hidden sm:inline">
                      {user?.email}
                    </span>
                  </button>
                  
                  {showUserMenu && (
                    <div className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-2 min-w-48 z-10">
                      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {user?.email}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Signed in
                        </p>
                      </div>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150 flex items-center space-x-2"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 transition-colors duration-300">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-4 sm:space-x-8 overflow-x-auto">
              <button
                onClick={() => setCurrentView('dashboard')}
                className={`py-4 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 min-h-[48px] flex items-center ${
                  currentView === 'dashboard'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setCurrentView('add')}
                className={`py-4 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 min-h-[48px] flex items-center ${
                  currentView === 'add'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                Add Transaction
              </button>
              <button
                onClick={() => setCurrentView('friends')}
                className={`py-4 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 min-h-[48px] flex items-center ${
                  currentView === 'friends'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                Friends
              </button>
              <button
                onClick={() => setCurrentView('history')}
                className={`py-4 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap transition-colors duration-200 min-h-[48px] flex items-center ${
                  currentView === 'history'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                History
              </button>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center">
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
                <span className="text-slate-700 dark:text-slate-300">Syncing transactions...</span>
              </div>
            </div>
          )}

          {currentView === 'dashboard' && (
            <Dashboard 
              transactions={filteredTransactions} 
              period={selectedMonthYear}
              friendBalances={friendBalances}
              onAddTransaction={() => setCurrentView('add')}
            />
          )}
          {currentView === 'add' && (
            <AddTransaction 
              onSubmit={addTransaction}
              onCancel={() => setCurrentView('dashboard')}
            />
          )}
          {currentView === 'friends' && (
            <FriendsList />
          )}
          {currentView === 'history' && (
            <TransactionHistory 
              transactions={filteredTransactions}
              period={selectedMonthYear}
              profilesMap={profilesMap}
              onDeleteTransaction={deleteTransaction}
              onUpdateTransaction={updateTransaction}
            />
          )}
        </main>

        {/* Floating Action Button */}
        {currentView !== 'add' && (
          <button
            onClick={() => setCurrentView('add')}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white p-3 sm:p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 min-w-[56px] min-h-[56px] flex items-center justify-center"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}

        {/* Click outside handlers */}
        {(showMonthDropdown || showUserMenu) && (
          <div 
            className="fixed inset-0 z-0" 
            onClick={() => {
              setShowMonthDropdown(false);
              setShowUserMenu(false);
            }}
          />
        )}
      </div>
    </AuthGuard>
  );
}

export default App;