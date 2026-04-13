import type {
  Account,
  Asset,
  BreakdownItem,
  DashboardMetrics,
  FinancialSnapshot,
  MonthlyReport,
  Transaction,
  TransactionType,
  UpsertAccountInput,
  UpsertAssetInput,
  UpsertTransactionInput,
} from "@/types/financial";

export class FinancialValidationError extends Error {}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getSignedAmount(type: TransactionType, amount: number) {
  return type === "income" ? amount : -amount;
}

function assertAmount(amount: number, label: string) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new FinancialValidationError(`${label} harus lebih besar dari 0.`);
  }
}

function assertText(value: string, label: string) {
  if (!value.trim()) {
    throw new FinancialValidationError(`${label} wajib diisi.`);
  }
}

function assertDate(value: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    throw new FinancialValidationError("Tanggal tidak valid.");
  }
}

function cloneSnapshot(snapshot: FinancialSnapshot): FinancialSnapshot {
  return {
    ...snapshot,
    accounts: snapshot.accounts.map((account) => ({ ...account })),
    transactions: snapshot.transactions.map((transaction) => ({ ...transaction })),
    assets: snapshot.assets.map((asset) => ({ ...asset })),
  };
}

function touch(snapshot: FinancialSnapshot) {
  snapshot.updatedAt = new Date().toISOString();
}

function getAccount(snapshot: FinancialSnapshot, accountId: string) {
  const account = snapshot.accounts.find((item) => item.id === accountId);
  if (!account) {
    throw new FinancialValidationError("Akun tidak ditemukan.");
  }

  return account;
}

function applyTransactionBalance(account: Account, transaction: Transaction, reverse = false) {
  const direction = reverse ? -1 : 1;
  account.balance += getSignedAmount(transaction.type, transaction.amount) * direction;
  account.updatedAt = new Date().toISOString();
}

export function validateAccountInput(input: UpsertAccountInput) {
  assertText(input.name, "Nama akun");

  if (!Number.isFinite(input.balance) || input.balance < 0) {
    throw new FinancialValidationError("Saldo akun tidak valid.");
  }

  assertText(input.color, "Warna akun");
}

export function validateTransactionInput(input: UpsertTransactionInput) {
  assertText(input.accountId, "Akun");
  assertAmount(input.amount, "Nominal");
  assertText(input.category, "Kategori");
  assertDate(input.date);
}

export function validateAssetInput(input: UpsertAssetInput) {
  assertText(input.name, "Nama aset");
  assertText(input.category, "Kategori aset");
  assertAmount(input.value, "Nilai aset");

  if (!Number.isFinite(input.costBasis) || input.costBasis < 0) {
    throw new FinancialValidationError("Cost basis aset tidak valid.");
  }
}

export function upsertAccount(
  snapshot: FinancialSnapshot,
  input: UpsertAccountInput,
  accountId?: string,
) {
  validateAccountInput(input);

  const nextSnapshot = cloneSnapshot(snapshot);
  const now = new Date().toISOString();

  if (!accountId) {
    nextSnapshot.accounts.unshift({
      id: createId("acct"),
      userId: snapshot.userId,
      name: input.name.trim(),
      balance: input.balance,
      color: input.color,
      updatedAt: now,
    });
    touch(nextSnapshot);
    return nextSnapshot;
  }

  const account = getAccount(nextSnapshot, accountId);
  account.name = input.name.trim();
  account.balance = input.balance;
  account.color = input.color;
  account.updatedAt = now;
  touch(nextSnapshot);
  return nextSnapshot;
}

export function deleteAccount(snapshot: FinancialSnapshot, accountId: string) {
  const nextSnapshot = cloneSnapshot(snapshot);

  if (nextSnapshot.transactions.some((transaction) => transaction.accountId === accountId)) {
    throw new FinancialValidationError(
      "Akun masih dipakai oleh transaksi. Hapus atau pindahkan transaksinya dulu.",
    );
  }

  const nextAccounts = nextSnapshot.accounts.filter((account) => account.id !== accountId);
  if (nextAccounts.length === nextSnapshot.accounts.length) {
    throw new FinancialValidationError("Akun tidak ditemukan.");
  }

  nextSnapshot.accounts = nextAccounts;
  touch(nextSnapshot);
  return nextSnapshot;
}

export function createTransaction(snapshot: FinancialSnapshot, input: UpsertTransactionInput) {
  validateTransactionInput(input);

  const nextSnapshot = cloneSnapshot(snapshot);
  const now = new Date().toISOString();
  const account = getAccount(nextSnapshot, input.accountId);
  const transaction: Transaction = {
    id: createId("trx"),
    userId: snapshot.userId,
    accountId: input.accountId,
    type: input.type,
    amount: input.amount,
    category: input.category.trim(),
    date: input.date,
    note: input.note.trim(),
    createdAt: now,
    updatedAt: now,
  };

  applyTransactionBalance(account, transaction);
  nextSnapshot.transactions.unshift(transaction);
  touch(nextSnapshot);
  return nextSnapshot;
}

export function updateTransaction(
  snapshot: FinancialSnapshot,
  transactionId: string,
  input: UpsertTransactionInput,
) {
  validateTransactionInput(input);

  const nextSnapshot = cloneSnapshot(snapshot);
  const existing = nextSnapshot.transactions.find((item) => item.id === transactionId);
  if (!existing) {
    throw new FinancialValidationError("Transaksi tidak ditemukan.");
  }

  const oldAccount = getAccount(nextSnapshot, existing.accountId);
  applyTransactionBalance(oldAccount, existing, true);

  const updated: Transaction = {
    ...existing,
    accountId: input.accountId,
    type: input.type,
    amount: input.amount,
    category: input.category.trim(),
    date: input.date,
    note: input.note.trim(),
    updatedAt: new Date().toISOString(),
  };

  const newAccount = getAccount(nextSnapshot, updated.accountId);
  applyTransactionBalance(newAccount, updated);

  nextSnapshot.transactions = nextSnapshot.transactions.map((transaction) =>
    transaction.id === transactionId ? updated : transaction,
  );
  touch(nextSnapshot);
  return nextSnapshot;
}

export function deleteTransaction(snapshot: FinancialSnapshot, transactionId: string) {
  const nextSnapshot = cloneSnapshot(snapshot);
  const existing = nextSnapshot.transactions.find((item) => item.id === transactionId);
  if (!existing) {
    throw new FinancialValidationError("Transaksi tidak ditemukan.");
  }

  const account = getAccount(nextSnapshot, existing.accountId);
  applyTransactionBalance(account, existing, true);
  nextSnapshot.transactions = nextSnapshot.transactions.filter(
    (transaction) => transaction.id !== transactionId,
  );
  touch(nextSnapshot);
  return nextSnapshot;
}

export function upsertAsset(
  snapshot: FinancialSnapshot,
  input: UpsertAssetInput,
  assetId?: string,
) {
  validateAssetInput(input);

  const nextSnapshot = cloneSnapshot(snapshot);
  const now = new Date().toISOString();

  if (!assetId) {
    nextSnapshot.assets.unshift({
      id: createId("asset"),
      userId: snapshot.userId,
      name: input.name.trim(),
      category: input.category.trim(),
      value: input.value,
      costBasis: input.costBasis,
      note: input.note.trim(),
      updatedAt: now,
    });
    touch(nextSnapshot);
    return nextSnapshot;
  }

  const asset = nextSnapshot.assets.find((item) => item.id === assetId);
  if (!asset) {
    throw new FinancialValidationError("Aset tidak ditemukan.");
  }

  asset.name = input.name.trim();
  asset.category = input.category.trim();
  asset.value = input.value;
  asset.costBasis = input.costBasis;
  asset.note = input.note.trim();
  asset.updatedAt = now;
  touch(nextSnapshot);
  return nextSnapshot;
}

export function deleteAsset(snapshot: FinancialSnapshot, assetId: string) {
  const nextSnapshot = cloneSnapshot(snapshot);
  const nextAssets = nextSnapshot.assets.filter((asset) => asset.id !== assetId);
  if (nextAssets.length === nextSnapshot.assets.length) {
    throw new FinancialValidationError("Aset tidak ditemukan.");
  }

  nextSnapshot.assets = nextAssets;
  touch(nextSnapshot);
  return nextSnapshot;
}

export function getCurrentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function toMonthKey(dateValue: string) {
  return dateValue.slice(0, 7);
}

export function buildDashboard(snapshot: FinancialSnapshot): DashboardMetrics {
  const totalCash = snapshot.accounts.reduce((sum, account) => sum + account.balance, 0);
  const totalAssets = snapshot.assets.reduce((sum, asset) => sum + asset.value, 0);
  const currentMonth = getCurrentMonthKey();

  let incomeThisMonth = 0;
  let expenseThisMonth = 0;

  for (const transaction of snapshot.transactions) {
    if (toMonthKey(transaction.date) !== currentMonth) {
      continue;
    }

    if (transaction.type === "income") {
      incomeThisMonth += transaction.amount;
    } else {
      expenseThisMonth += transaction.amount;
    }
  }

  const monthlyNet = incomeThisMonth - expenseThisMonth;
  const savingsRate = incomeThisMonth > 0 ? (monthlyNet / incomeThisMonth) * 100 : 0;

  return {
    totalCash,
    totalAssets,
    netWorth: totalCash + totalAssets,
    incomeThisMonth,
    expenseThisMonth,
    savingsRate,
    monthlyNet,
  };
}

export function buildMonthlyReports(transactions: Transaction[], limit = 6): MonthlyReport[] {
  const buckets = new Map<string, MonthlyReport>();

  for (const transaction of transactions) {
    const month = toMonthKey(transaction.date);
    const entry =
      buckets.get(month) ??
      {
        month,
        label: new Intl.DateTimeFormat("id-ID", {
          month: "short",
          year: "numeric",
        }).format(new Date(`${month}-01`)),
        income: 0,
        expense: 0,
        net: 0,
      };

    if (transaction.type === "income") {
      entry.income += transaction.amount;
    } else {
      entry.expense += transaction.amount;
    }

    entry.net = entry.income - entry.expense;
    buckets.set(month, entry);
  }

  return [...buckets.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-limit);
}

function buildBreakdown<T extends { value: number; label: string }>(items: T[]): BreakdownItem[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return [];
  }

  return items
    .map((item) => ({
      label: item.label,
      value: item.value,
      share: (item.value / total) * 100,
    }))
    .sort((a, b) => b.value - a.value);
}

export function buildExpenseBreakdown(
  transactions: Transaction[],
  month = getCurrentMonthKey(),
) {
  const buckets = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense" || toMonthKey(transaction.date) !== month) {
      continue;
    }

    buckets.set(transaction.category, (buckets.get(transaction.category) ?? 0) + transaction.amount);
  }

  return buildBreakdown(
    [...buckets.entries()].map(([label, value]) => ({
      label,
      value,
    })),
  );
}

export function buildAssetDistribution(assets: Asset[]) {
  const buckets = new Map<string, number>();

  for (const asset of assets) {
    buckets.set(asset.category, (buckets.get(asset.category) ?? 0) + asset.value);
  }

  return buildBreakdown(
    [...buckets.entries()].map(([label, value]) => ({
      label,
      value,
    })),
  );
}

export function sortTransactionsLatest(transactions: Transaction[]) {
  return [...transactions].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) {
      return byDate;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function sortAccountsByBalance(accounts: Account[]) {
  return [...accounts].sort((a, b) => b.balance - a.balance);
}

export function sortAssetsByValue(assets: Asset[]) {
  return [...assets].sort((a, b) => b.value - a.value);
}
