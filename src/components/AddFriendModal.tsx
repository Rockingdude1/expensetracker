import React, { useState } from 'react';
import { X, Search, UserPlus, Check } from 'lucide-react';
import { userService, UserProfile } from '../services/userService';

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFriendAdded: () => void;
}

const AddFriendModal: React.FC<AddFriendModalProps> = ({ isOpen, onClose, onFriendAdded }) => {
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!searchEmail.trim()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const results = await userService.searchUsersByEmail(searchEmail);
      setSearchResults(results);
      
      if (results.length === 0) {
        setError('No users found with that email');
      }
    } catch (err) {
      setError('Failed to search for users');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async (friendEmail: string) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await userService.sendFriendRequest(friendEmail);
      
      if (result.success) {
        setSuccess('Friend request sent successfully!');
        setSearchResults([]);
        setSearchEmail('');
        onFriendAdded();
        
        // Close modal after a short delay
        setTimeout(() => {
          onClose();
          setSuccess('');
        }, 2000);
      } else {
        setError(result.error || 'Failed to send friend request');
      }
    } catch (err) {
      setError('Failed to send friend request');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSearchEmail('');
    setSearchResults([]);
    setError('');
    setSuccess('');
    onClose();
  };

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
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Add Friend</h2>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-200 p-2 min-w-[48px] min-h-[48px] flex items-center justify-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Search Section */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Search by Email
            </label>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="email"
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200"
                  placeholder="Enter friend's email"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading || !searchEmail.trim()}
                className="px-4 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200 min-w-[48px] min-h-[48px] flex items-center justify-center"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <Search className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <Check className="h-5 w-5 text-emerald-600" />
                <span className="text-emerald-700 dark:text-emerald-300 text-sm">{success}</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Search Results</h3>
              {searchResults.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-600 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full ${getAvatarColor(user.display_name || user.email)} flex items-center justify-center text-white font-semibold text-sm`}>
                      {getInitials(user.display_name || user.email)}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {user.display_name || user.email.split('@')[0]}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSendRequest(user.email)}
                    disabled={loading}
                    className="flex items-center space-x-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200 text-sm min-h-[40px]"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Add</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Instructions */}
          <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-2">How to add friends:</h4>
            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <li>• Search for friends using their email address</li>
              <li>• Send them a friend request</li>
              <li>• Once they accept, you can split expenses together</li>
              <li>• All shared expenses will automatically appear in both accounts</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddFriendModal;