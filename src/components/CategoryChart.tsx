import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Transaction } from '../types';
import { useAuth } from '../contexts/AuthContext'; // 1. ADD this import to get the current user

const COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#8B5CF6', // Purple
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

export const CategoryChart: React.FC<CategoryChartProps> = ({ transactions }) => {
  const { user: currentUser } = useAuth(); // 2. GET the current user

  // --- START: MINIMAL CHANGE IS HERE ---
  // This calculation is the only part that has been updated.
  const categoryData = transactions
    .filter(t => t.type !== 'revenue' && !t.deleted_at && !t.description?.startsWith('SETTLEMENT:'))
    .reduce((acc, transaction) => {
      const category = transaction.category || 'other';
      let amount = 0;
      
      if (transaction.type === 'personal') {
        amount = transaction.amount;
      } else if (transaction.type === 'shared' && transaction.split_details) {
        // NEW LOGIC: Correctly find your share from the new split_details field
        const myShare = transaction.split_details.participants.find(p => p.user_id === currentUser?.id)?.share_amount || 0;
        amount = myShare;
      }
      
      if (amount > 0) {
        acc[category] = Math.round((acc[category] || 0) + amount);
      }
      return acc;
    }, {} as Record<string, number>);
  // --- END OF CHANGE ---

  const chartData = Object.entries(categoryData).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize for display
    value,
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-4">
          Spending by Category
        </h3>
        <div className="flex items-center justify-center h-48 sm:h-64 text-slate-500 dark:text-slate-400">
          <p className="text-sm sm:text-base">No expense data to display</p>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {data.name}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {new Intl.NumberFormat('en-IN', { 
  style: 'currency', 
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0 
}).format(Math.round(data.value))}
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => {
    return (
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center gap-2 text-xs sm:text-sm">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-700 dark:text-slate-300 truncate max-w-24 sm:max-w-none">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 mx-2 sm:mx-0">
      <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-4">
        Spending by Category
      </h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              nameKey="name"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};