import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Props for the ConfirmationModal component.
 */
export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: string;
}

/**
 * A custom, styled modal component to display a confirmation warning (e.g., before deletion).
 * * It takes confirmation handlers and a custom message.
 */
const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, message }) => {
  if (!isOpen) return null;

  return (
    // z-[60] ensures it appears above other components/modals (like the Edit modal, often z-50)
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full transition-all">
        
        <div className="p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Confirm Deletion</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
        </div>

        <div className="flex justify-between border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-slate-700 dark:text-slate-300 rounded-bl-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-200 font-medium border-r border-slate-200 dark:border-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 text-red-600 rounded-br-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200 font-semibold"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;