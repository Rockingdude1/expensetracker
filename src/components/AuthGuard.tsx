import React, { useState } from 'react';
import { User, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './AuthModal';

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, signOut } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-4 sm:p-8">
          <div className="bg-gradient-to-r from-emerald-500 to-blue-600 p-4 rounded-full w-20 h-20 mx-auto mb-6">
            <User className="h-12 w-12 text-white mx-auto" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-4">
            Welcome to Spendify
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-8">
            Track your expenses and revenue with ease. Sign in to get started with your personal financial dashboard.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-6 sm:px-8 py-3 rounded-lg font-medium transition-all duration-200 transform hover:scale-105 min-h-[48px] flex items-center justify-center mx-auto"
          >
            Get Started
          </button>
        </div>

        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)} 
        />
      </div>
    );
  }

  return (
    <>
      {children}
      {/* User Menu - could be added to header */}
    </>
  );
};

export default AuthGuard;