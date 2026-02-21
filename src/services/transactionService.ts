import { supabase } from '../lib/supabase';
import { Transaction, UserProfile, ActivityLogEntry } from '../types';

// Convert database (snake_case) to app (camelCase) format
const convertFromDatabase = (dbTransaction: any): Transaction => {
  return {
    id: dbTransaction.id,
    user_id: dbTransaction.user_id,
    type: dbTransaction.type,
    amount: Number(dbTransaction.amount),
    payment_mode: dbTransaction.payment_mode,
    description: dbTransaction.description || '',
    date: dbTransaction.date,
    category: dbTransaction.category,
    payers: dbTransaction.payers || [],
    split_details: dbTransaction.split_details,
    activity_log: dbTransaction.activity_log || [],
    deleted_at: dbTransaction.deleted_at,
    created_at: dbTransaction.created_at,
    updated_at: dbTransaction.updated_at,
  };
};

// Convert app object to database format for new transactions
const convertToDatabase = (transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>, userId: string) => {
  return {
    user_id: userId,
    type: transaction.type,
    amount: transaction.amount,
    payment_mode: transaction.payment_mode,
    description: transaction.description,
    date: transaction.date,
    category: transaction.category,
    payers: transaction.payers,
    split_details: transaction.split_details,
  };
};

export const transactionService = {
    async getFriendBalances(userId: string): Promise<Map<string, number>> {
    try {
      // Fetch all debt records where the current user is either the debtor or the creditor.
      const { data: debts, error } = await supabase
        .from('debts')
        .select('debtor_id, creditor_id, amount')
        .or(`debtor_id.eq.${userId},creditor_id.eq.${userId}`);

      if (error) {
        console.error("Error fetching friend balances:", error);
        throw error;
      }

      // Use a Map to efficiently calculate the net balance for each friend.
      const balances = new Map<string, number>();

      for (const debt of debts) {
        if (debt.debtor_id === userId) {
          // If I am the debtor, it means I owe money. This is a negative balance for me.
          const friendId = debt.creditor_id;
          const currentBalance = balances.get(friendId) || 0;
          balances.set(friendId, currentBalance - parseFloat(debt.amount));
        } else {
          // If I am the creditor, it means they owe me money. This is a positive balance for me.
          const friendId = debt.debtor_id;
          const currentBalance = balances.get(friendId) || 0;
          balances.set(friendId, currentBalance + parseFloat(debt.amount));
        }
      }
      
      return balances;

    } catch (err) {
      console.error('Error in getFriendBalances service:', err);
      throw err;
    }
  },

  async getTransactionWithDetails(transactionId: string): Promise<{ transaction: Transaction; profiles: Map<string, { display_name: string; email: string; }> }> {
    try {
      // 1. Fetch the main transaction data.
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();
  
      if (txError) throw txError;
      if (!transaction) throw new Error("Transaction not found.");
  
      // 2. Collect all unique user IDs involved in the transaction.
      const userIds = new Set<string>();
      if (transaction.payers) {
        transaction.payers.forEach((p: any) => userIds.add(p.user_id));
      }
      if (transaction.split_details?.participants) {
        transaction.split_details.participants.forEach((p: any) => userIds.add(p.user_id));
      }
      userIds.add(transaction.user_id); // Include the transaction creator
  
      // 3. Fetch the profiles for ONLY those specific users in a single, efficient query.
      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, display_name, email')
        .in('id', Array.from(userIds));
  
      if (profileError) throw profileError;
  
      // 4. Return both the transaction and a handy Map for easy name lookups in your component.
      const profilesMap = new Map(profiles.map(p => [p.id, { display_name: p.display_name, email: p.email }]));
      
      return { transaction: convertFromDatabase(transaction), profiles: profilesMap };
  
    } catch (error) {
      console.error("Error fetching transaction with details:", error);
      throw error;
    }
  },
  
  // Fetch all transactions a user has access to (via RLS)
  async fetchTransactions(): Promise<Transaction[]> {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        console.error('Error fetching transactions:', error);
        throw error;
      }

      return data ? data.map(convertFromDatabase) : [];
    } catch (error) {
      console.error('Error in fetchTransactions:', error);
      throw error;
    }
  },

  // Add a new transaction
  async addTransaction(transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>, user: UserProfile): Promise<Transaction> {
    try {
      console.log('Adding transaction with data:', JSON.stringify(transaction, null, 2));
      
      const dbTransaction: any = convertToDatabase(transaction, user.id);
      
      dbTransaction.activity_log = [{
        action: 'created',
        user_id: user.id,
        user_name: user.display_name || user.email.split('@')[0],
        timestamp: new Date().toISOString()
      }];

      // Ensure JSON fields are properly formatted
      if (dbTransaction.payers) {
        dbTransaction.payers = dbTransaction.payers.map(payer => ({
          user_id: payer.user_id,
          amount_paid: Number(payer.amount_paid)
        }));
      }
      
      if (dbTransaction.split_details?.participants) {
        dbTransaction.split_details.participants = dbTransaction.split_details.participants.map(participant => ({
          user_id: participant.user_id,
          share_amount: Number(participant.share_amount),
          ...(participant.share_percentage && { share_percentage: Number(participant.share_percentage) })
        }));
      }

      console.log('Final database transaction:', JSON.stringify(dbTransaction, null, 2));

      const { data, error } = await supabase
        .from('transactions')
        .insert([dbTransaction])
        .select()
        .single();

      if (error) {
        console.error('Error adding transaction:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw error;
      }
      
      return convertFromDatabase(data);
    } catch (error) {
      console.error('Error in addTransaction:', error);
      throw error;
    }
  },

  // Update an existing transaction
  async updateTransaction(id: string, updates: Partial<Transaction>, user: UserProfile): Promise<Transaction> {
    try {
      console.log('Updating transaction with data:', JSON.stringify(updates, null, 2));
      
      const { data: currentTx, error: fetchError } = await supabase
        .from('transactions')
        .select('activity_log')
        .eq('id', id)
        .single();
  
      if (fetchError) throw fetchError;
  
      const newLogEntry: ActivityLogEntry = {
        action: 'updated',
        user_id: user.id,
        user_name: user.display_name || user.email.split('@')[0],
        timestamp: new Date().toISOString(),
      };
      
      const updatedLog = [...(currentTx.activity_log || []), newLogEntry];

      // Ensure payers array has the correct structure
      if (updates.payers) {
        updates.payers = updates.payers.map(payer => ({
          user_id: payer.user_id,
          amount_paid: Number(payer.amount_paid)
        }));
        console.log('Processed payers:', JSON.stringify(updates.payers, null, 2));
      }
      
      // Ensure split_details has the correct structure
      if (updates.split_details?.participants) {
        updates.split_details.participants = updates.split_details.participants.map(participant => ({
          user_id: participant.user_id,
          share_amount: Number(participant.share_amount),
          ...(participant.share_percentage && { share_percentage: Number(participant.share_percentage) })
        }));
        console.log('Processed split_details:', JSON.stringify(updates.split_details, null, 2));
      }
  
      const finalUpdates = {
        ...updates,
        activity_log: updatedLog,
        updated_at: new Date().toISOString(),
      };

      // Clean up any undefined values before sending to Supabase
      Object.keys(finalUpdates).forEach(key => {
        if ((finalUpdates as any)[key] === undefined) {
          delete (finalUpdates as any)[key];
        }
      });
      
      // Validate JSON structure before sending
      if (finalUpdates.payers) {
        try {
          JSON.stringify(finalUpdates.payers);
        } catch (e) {
          console.error('Invalid payers JSON structure:', finalUpdates.payers);
          throw new Error('Invalid payers data structure');
        }
      }
      
      if (finalUpdates.split_details) {
        try {
          JSON.stringify(finalUpdates.split_details);
        } catch (e) {
          console.error('Invalid split_details JSON structure:', finalUpdates.split_details);
          throw new Error('Invalid split_details data structure');
        }
      }
      
      console.log('Final updates being sent to Supabase:', JSON.stringify(finalUpdates, null, 2));
  
      const { data, error } = await supabase
        .from('transactions')
        .update(finalUpdates)
        .eq('id', id)
        .select()
        .single();
  
      if (error) {
        console.error('Error updating transaction:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        
        // Provide more specific error messages
        if (error.message?.includes('invalid input syntax for type json')) {
          throw new Error('Invalid data format. Please check the transaction details and try again.');
        }
        if (error.message?.includes('permission denied')) {
          throw new Error('You do not have permission to update this transaction.');
        }
        
        throw error;
      }
      
      if (!data) {
        throw new Error("Transaction not found or permission denied for update.");
      }
  
      return convertFromDatabase(data);
    } catch (error) {
      console.error('Error in updateTransaction:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw error;
    }
  },

// In your services/transactionService.ts file

  // Delete a transaction (soft delete)
  async deleteTransaction(id: string): Promise<Transaction> { // The 'user' parameter is now removed.
    try {
      // Get the current user directly and securely from Supabase auth.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated for deletion.");

      // Fetch the transaction's current activity log.
      const { data: currentTx, error: fetchError } = await supabase
        .from('transactions')
        .select('activity_log')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // To get the display name, we need to fetch the user's profile.
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
      
      const newLogEntry: ActivityLogEntry = {
        action: 'deleted',
        user_id: user.id,
        user_name: userProfile?.display_name || user.email?.split('@')[0] || 'Unknown User',
        timestamp: new Date().toISOString()
      };
      
      const updatedLog = [...(currentTx.activity_log || []), newLogEntry];

      // Perform the update to soft-delete the transaction.
      const { data, error } = await supabase
        .from('transactions')
        .update({ 
          deleted_at: new Date().toISOString(),
          activity_log: updatedLog,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error soft-deleting transaction:', error);
        throw error;
      }
      if (!data) {
        throw new Error("Transaction not found or permission denied for deletion.");
      }

      return convertFromDatabase(data);
    } catch (error) {
      console.error('Error in deleteTransaction:', error);
      throw error;
    }
  },

  async migrateLocalStorageData(userId: string): Promise<void> {
    console.log('Migration function skipped. Ensure no old data in localStorage.');
  },

  async getMonthlyBalance(userId: string, monthYear: string): Promise<{ opening_balance: number; closing_balance: number } | null> {
    try {
      const { data, error } = await supabase
        .from('monthly_balances')
        .select('opening_balance, closing_balance')
        .eq('user_id', userId)
        .eq('month_year', monthYear)
        .maybeSingle();

      if (error) {
        console.error('Error fetching monthly balance:', error);
        throw error;
      }

      return data ? {
        opening_balance: parseFloat(data.opening_balance),
        closing_balance: parseFloat(data.closing_balance)
      } : null;
    } catch (error) {
      console.error('Error in getMonthlyBalance:', error);
      throw error;
    }
  },

  async upsertMonthlyBalance(
    userId: string,
    monthYear: string,
    openingBalance: number,
    closingBalance: number
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('monthly_balances')
        .upsert({
          user_id: userId,
          month_year: monthYear,
          opening_balance: openingBalance,
          closing_balance: closingBalance,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,month_year'
        });

      if (error) {
        console.error('Error upserting monthly balance:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in upsertMonthlyBalance:', error);
      throw error;
    }
  },

  async calculateAndStoreMonthlyBalances(userId: string, transactions: Transaction[]): Promise<void> {
    try {
      const monthlyData = new Map<string, { revenue: number; spent: number }>();

      transactions
        .filter(tx => !tx.deleted_at)
        .forEach(tx => {
          const monthYear = tx.date.substring(0, 7);

          if (!monthlyData.has(monthYear)) {
            monthlyData.set(monthYear, { revenue: 0, spent: 0 });
          }

          const data = monthlyData.get(monthYear)!;

          if (tx.type === 'revenue') {
            data.revenue += tx.amount;
          }

          if (tx.type === 'personal') {
            data.spent += tx.amount;
          }

          if (tx.type === 'shared' && tx.payers) {
            const userPayer = tx.payers.find(p => p.user_id === userId);
            if (userPayer) {
              data.spent += userPayer.amount_paid;
            }
          }
        });

      const sortedMonths = Array.from(monthlyData.keys()).sort();
      let previousClosingBalance = 0;

      for (const monthYear of sortedMonths) {
        const data = monthlyData.get(monthYear)!;
        const openingBalance = previousClosingBalance;
        const closingBalance = openingBalance + data.revenue - data.spent;

        await this.upsertMonthlyBalance(userId, monthYear, openingBalance, closingBalance);

        previousClosingBalance = closingBalance;
      }

      const currentMonthYear = new Date().toISOString().substring(0, 7);
      if (!monthlyData.has(currentMonthYear)) {
        await this.upsertMonthlyBalance(userId, currentMonthYear, previousClosingBalance, previousClosingBalance);
      }

    } catch (error) {
      console.error('Error in calculateAndStoreMonthlyBalances:', error);
      throw error;
    }
  }
};