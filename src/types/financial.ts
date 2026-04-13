export type TransactionType = "income" | "expense";

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
};

export type Account = {
  id: string;
  userId: string;
  name: string;
  balance: number;
  color: string;
  updatedAt: string;
};

export type Transaction = {
  id: string;
  userId: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  category: string;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type Asset = {
  id: string;
  userId: string;
  name: string;
  category: string;
  value: number;
  costBasis: number;
  note: string;
  updatedAt: string;
};

export type FinancialSnapshot = {
  userId: string;
  accounts: Account[];
  transactions: Transaction[];
  assets: Asset[];
  updatedAt: string;
};

export type DashboardMetrics = {
  totalCash: number;
  totalAssets: number;
  netWorth: number;
  incomeThisMonth: number;
  expenseThisMonth: number;
  savingsRate: number;
  monthlyNet: number;
};

export type MonthlyReport = {
  month: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

export type BreakdownItem = {
  label: string;
  value: number;
  share: number;
};

export type UpsertAccountInput = {
  name: string;
  balance: number;
  color: string;
};

export type UpsertTransactionInput = {
  accountId: string;
  type: TransactionType;
  amount: number;
  category: string;
  date: string;
  note: string;
};

export type UpsertAssetInput = {
  name: string;
  category: string;
  value: number;
  costBasis: number;
  note: string;
};
