import React, { useState } from 'react';
import { X, Search, UserPlus, Check, UserX } from 'lucide-react';
import { userService, UserProfile } from '../services/userService';

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFriendAdded: () => void;
}

type Tab = 'app' | 'guest';

const AddFriendModal: React.FC<AddFriendModalProps> = ({ isOpen, onClose, onFriendAdded }) => {
  const [tab, setTab] = useState<Tab>('app');

  // "On this app" tab state
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

  // "Not on app yet" tab state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const resetState = () => {
    setSearchEmail('');
    setSearchResults([]);
    setGuestName('');
    setGuestEmail('');
    setError('');
    setSuccess('');
  };

  const handleClose = () => {
    resetState();
    setTab('app');
    onClose();
  };

  const switchTab = (t: Tab) => {
    resetState();
    setTab(t);
  };

  // ── App tab ──────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!searchEmail.trim()) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const results = await userService.searchUsersByEmail(searchEmail);
      setSearchResults(results);
      if (results.length === 0) setError('No users found with that email');
    } catch {
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
        setTimeout(() => { onClose(); setSuccess(''); }, 2000);
      } else {
        setError(result.error || 'Failed to send friend request');
      }
    } catch {
      setError('Failed to send friend request');
    } finally {
      setLoading(false);
    }
  };

  // ── Guest tab ─────────────────────────────────────────────────

  const handleAddGuest = async () => {
    if (!guestName.trim()) {
      setError('Name is required');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await userService.addGuestFriend(guestName, guestEmail || undefined);
      if (result.success) {
        setSuccess(`${guestName.trim()} added as a guest friend!`);
        setGuestName('');
        setGuestEmail('');
        onFriendAdded();
        setTimeout(() => { onClose(); setSuccess(''); }, 2000);
      } else {
        setError(result.error || 'Failed to add guest friend');
      }
    } catch {
      setError('Failed to add guest friend');
    } finally {
      setLoading(false);
    }
  };

  // ── Shared helpers ────────────────────────────────────────────

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const getAvatarColor = (name: string) => {
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500'];
    return colors[name.charCodeAt(0) % colors.length];
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

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => switchTab('app')}
            className={`flex-1 py-3 text-sm font-medium transition-colors duration-200 ${
              tab === 'app'
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            On this app
          </button>
          <button
            onClick={() => switchTab('guest')}
            className={`flex-1 py-3 text-sm font-medium transition-colors duration-200 ${
              tab === 'guest'
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Not on app yet
          </button>
        </div>

        <div className="p-6">
          {/* Success */}
          {success && (
            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <span className="text-emerald-700 dark:text-emerald-300 text-sm">{success}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
            </div>
          )}

          {/* ── App tab content ── */}
          {tab === 'app' && (
            <>
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
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    ) : (
                      <Search className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

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

              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-2">How it works:</h4>
                <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                  <li>• Search for friends using their email address</li>
                  <li>• Send them a friend request</li>
                  <li>• Once they accept, you can split expenses together</li>
                </ul>
              </div>
            </>
          )}

          {/* ── Guest tab content ── */}
          {tab === 'guest' && (
            <>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => { setGuestName(e.target.value); setError(''); }}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddGuest()}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200"
                    placeholder="e.g. Rahul"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddGuest()}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200"
                    placeholder="rahul@example.com"
                  />
                </div>

                <button
                  onClick={handleAddGuest}
                  disabled={loading || !guestName.trim()}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  ) : (
                    <>
                      <UserX className="h-5 w-5" />
                      <span>Add as Guest</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <h4 className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">About guest friends</h4>
                <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
                  <li>• Track shared expenses even if they're not on the app</li>
                  <li>• If you add their email and they join later, their records will auto-link</li>
                  <li>• Guests show with a badge so you know they haven't joined yet</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddFriendModal;
