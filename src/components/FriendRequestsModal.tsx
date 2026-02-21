import React from 'react';
import { X, Check, XIcon as XIconSolid, User } from 'lucide-react';

interface FriendRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingRequests: any[];
  onAcceptRequest: (connectionId: string) => void;
  onRejectRequest: (connectionId: string) => void;
}

const FriendRequestsModal: React.FC<FriendRequestsModalProps> = ({ 
  isOpen, 
  onClose, 
  pendingRequests, 
  onAcceptRequest, 
  onRejectRequest 
}) => {
  if (!isOpen) return null;

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500',
      'bg-emerald-500',
      'bg-purple-500',
      'bg-red-500',
      'bg-yellow-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-orange-500'
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Friend Requests ({pendingRequests.length})
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-200 p-2 min-w-[48px] min-h-[48px] flex items-center justify-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {pendingRequests.length === 0 ? (
            <div className="text-center py-8">
              <div className="bg-slate-100 dark:bg-slate-700 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                <User className="h-8 w-8 text-slate-600 dark:text-slate-300 mx-auto" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No pending requests
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                You don't have any pending friend requests at the moment.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <div key={request.id} className="w-full table table-fixed p-3 border border-slate-200 dark:border-slate-600 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-12 h-12 rounded-full ${getAvatarColor(request.user_profiles?.display_name || request.user_profiles?.email || 'Unknown')} flex items-center justify-center text-white font-semibold text-lg`}>
                      {getInitials(request.user_profiles?.display_name || request.user_profiles?.email || 'Unknown')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                        {request.user_profiles?.display_name || request.user_profiles?.email?.split('@')[0] || 'Unknown User'}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                        {request.user_profiles?.email || 'No email'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Sent {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onAcceptRequest(request.id)}
                      className="flex items-center justify-center p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors duration-200 text-sm min-h-[40px] min-w-[40px]"
                      title="Accept request"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onRejectRequest(request.id)}
                      className="flex items-center justify-center p-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors duration-200 text-sm min-h-[40px] min-w-[40px]"
                      title="Reject request"
                    >
                      <XIconSolid className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Instructions */}
          {pendingRequests.length > 0 && (
            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-2">About friend requests:</h4>
              <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                <li>• Accept requests from people you know and trust</li>
                <li>• Once accepted, you can split expenses together</li>
                <li>• Rejected requests will be permanently removed</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FriendRequestsModal;