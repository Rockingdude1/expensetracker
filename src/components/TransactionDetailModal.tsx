import React from 'react';
import { X, Users, CreditCard, Banknote, Calendar } from 'lucide-react';
import { Transaction, UserProfile } from '../types';

interface TransactionDetailModalProps {
  transaction: Transaction;
  profilesMap: Map<string, UserProfile>;
  onClose: () => void;
}

const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  profilesMap,
  onClose,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getUserName = (userId: string) => {
    const profile = profilesMap.get(userId);
    return (
      profile?.display_name || profile?.email?.split('@')[0] || 'Unknown User'
    );
  };

  const getTransactionIcon = () => {
    if (transaction.type === 'revenue')
      return (
        <div className="p-3 bg-emerald-100 rounded-full">
          <Users className="h-6 w-6 text-emerald-600" />
        </div>
      );
    if (transaction.type === 'shared')
      return (
        <div className="p-3 bg-purple-100 rounded-full">
          <Users className="h-6 w-6 text-purple-600" />
        </div>
      );
    return (
      <div className="p-3 bg-red-100 rounded-full">
        <Users className="h-6 w-6 text-red-600" />
      </div>
    );
  };

  const getCategoryLabel = (category?: string) => {
    const categoryLabels: Record<string, string> = {
      rent: 'Rent',
      food: 'Food',
      social: 'Social Life',
      transport: 'Transport',
      apparel: 'Apparel',
      beauty: 'Beauty',
      education: 'Education',
      other: 'Other',
    };
    return category ? categoryLabels[category] || 'Other' : '';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-4">
            {getTransactionIcon()}
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                Transaction Details
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 capitalize">
                {transaction.type} Transaction
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-200 p-2 min-w-[48px] min-h-[48px] flex items-center justify-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                Description
              </h3>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">
                {transaction.description}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                Total Amount
              </h3>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">
                {formatCurrency(transaction.amount)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                Date
              </h3>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                <p className="text-slate-900 dark:text-white">
                  {formatDate(transaction.date)}
                </p>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                Payment Method
              </h3>
              <div className="flex items-center space-x-2">
                {transaction.payment_mode === 'cash' ? (
                  <Banknote className="h-4 w-4 text-slate-500" />
                ) : (
                  <CreditCard className="h-4 w-4 text-slate-500" />
                )}
                <p className="text-slate-900 dark:text-white capitalize">
                  {transaction.payment_mode}
                </p>
              </div>
            </div>
            {transaction.category && (
              <div>
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Category
                </h3>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                  {getCategoryLabel(transaction.category)}
                </span>
              </div>
            )}
          </div>

          {/* Payer Information */}
          {transaction.payers && transaction.payers.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Payer
              </h3>
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900 dark:text-white">
                    {getUserName(transaction.payers[0].user_id)}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(transaction.payers[0].amount_paid)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Split Details */}
          {transaction.type === 'shared' && transaction.split_details && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Split Details
              </h3>
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="mb-3">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Split Method:{' '}
                    <span className="capitalize text-slate-900 dark:text-white">
                      {transaction.split_details.method}
                    </span>
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4 text-sm font-medium text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600 pb-2">
                    <span>Participant</span>
                    <span className="text-center">Share</span>
                    <span className="text-right">Amount</span>
                  </div>

                  {transaction.split_details.participants.map(
                    (participant, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-3 gap-4 items-center py-2"
                      >
                        <span className="font-medium text-slate-900 dark:text-white">
                          {getUserName(participant.user_id)}
                        </span>
                        <span className="text-center text-slate-600 dark:text-slate-300">
                          {participant.share_percentage
                            ? `${participant.share_percentage}%`
                            : 'Equal'}
                        </span>
                        <span className="text-right font-semibold text-slate-900 dark:text-white">
                          {formatCurrency(participant.share_amount)}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Activity Log */}
          {transaction.activity_log && transaction.activity_log.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Activity Log
              </h3>
              <div className="space-y-2">
                {transaction.activity_log.map((log, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700 rounded-lg"
                  >
                    <div>
                      <span className="text-sm font-medium text-slate-900 dark:text-white">
                        {log.user_name}
                      </span>
                      <span className="text-sm text-slate-600 dark:text-slate-300 ml-2">
                        {log.action} this transaction
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(log.timestamp).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailModal;