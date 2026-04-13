"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import { DEMO_USER_ID } from "@/lib/demo-data";
import { createFinancialClient } from "@/lib/financial-client";
import {
  FinancialValidationError,
  buildAssetDistribution,
  buildDashboard,
  buildExpenseBreakdown,
  buildMonthlyReports,
  getCurrentMonthKey,
  sortAccountsByBalance,
  sortAssetsByValue,
  sortTransactionsLatest,
} from "@/lib/financial-engine";
import {
  clamp,
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatPercent,
} from "@/lib/format";
import type {
  Account,
  Asset,
  BreakdownItem,
  FinancialSnapshot,
  MonthlyReport,
  Transaction,
  TransactionType,
  UpsertAccountInput,
  UpsertAssetInput,
  UpsertTransactionInput,
} from "@/types/financial";

type ToastState = {
  id: number;
  kind: "success" | "error";
  message: string;
};

type FilterState = {
  month: string;
  type: "all" | TransactionType;
  accountId: string;
  category: string;
  search: string;
};

const accountInputClassName =
  "w-full rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";
const actionButtonClassName =
  "inline-flex items-center justify-center rounded-full bg-[var(--color-ink)] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
const ghostButtonClassName =
  "inline-flex items-center justify-center rounded-full border border-black/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)] transition hover:border-black/20 hover:text-[var(--color-ink)]";
const dangerButtonClassName =
  "inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700 transition hover:bg-rose-100";

const accountPalette = ["#0f766e", "#f97316", "#2563eb", "#be123c", "#6d28d9"];
const defaultTransactionCategories = [
  "Salary",
  "Freelance",
  "Groceries",
  "Dining",
  "Transport",
  "Rent",
  "Utilities",
  "Health",
  "Investment",
];
const defaultAssetCategories = ["Cash Reserve", "Investments", "Commodities", "Property"];

function createAccountForm(index = 0): UpsertAccountInput {
  return {
    name: "",
    balance: 0,
    color: accountPalette[index % accountPalette.length],
  };
}

function createTransactionForm(accountId = ""): UpsertTransactionInput {
  return {
    accountId,
    type: "expense",
    amount: 0,
    category: "Groceries",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  };
}

function createAssetForm(): UpsertAssetInput {
  return {
    name: "",
    category: "Investments",
    value: 0,
    costBasis: 0,
    note: "",
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof FinancialValidationError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Terjadi kesalahan yang belum diketahui.";
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-[var(--color-muted)]">
      <span className="font-semibold text-[var(--color-ink)]">{label}</span>
      {children}
      {hint ? <span className="text-xs">{hint}</span> : null}
    </label>
  );
}

function SectionShell({
  eyebrow,
  title,
  description,
  children,
  id,
  delay,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  id: string;
  delay?: string;
}) {
  return (
    <section id={id} className="card-surface reveal p-6 lg:p-8" style={{ animationDelay: delay }}>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--color-accent)]">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--color-ink)] lg:text-3xl">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "emerald" | "amber" | "blue" | "rose";
}) {
  const tones = {
    emerald: "from-emerald-200/80 via-emerald-100/60 to-white",
    amber: "from-amber-200/80 via-amber-100/60 to-white",
    blue: "from-sky-200/80 via-sky-100/60 to-white",
    rose: "from-rose-200/80 via-rose-100/60 to-white",
  };

  return (
    <div
      className={`rounded-[28px] border border-white/60 bg-gradient-to-br ${tones[tone]} p-5 shadow-[0_20px_40px_rgba(20,24,28,0.08)]`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-muted)]">{label}</p>
      <p className="mt-4 text-2xl font-semibold tracking-[-0.05em] text-[var(--color-ink)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{note}</p>
    </div>
  );
}

function BreakdownList({
  items,
  formatter = formatCurrency,
}: {
  items: BreakdownItem[];
  formatter?: (value: number) => string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-black/10 bg-white/40 p-5 text-sm text-[var(--color-muted)]">
        Belum ada data yang cukup untuk membentuk breakdown.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <div key={item.label} className="grid gap-2">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-[var(--color-ink)]">{item.label}</span>
            <span className="text-[var(--color-muted)]">{formatter(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/5">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-accent-warm))]"
              style={{ width: `${clamp(item.share, 6, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthBars({ reports }: { reports: MonthlyReport[] }) {
  if (!reports.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-black/10 bg-white/40 p-5 text-sm text-[var(--color-muted)]">
        Laporan bulanan akan muncul setelah transaksi mulai terkumpul.
      </div>
    );
  }

  const peak = reports.reduce((max, item) => Math.max(max, item.income, item.expense), 1);

  return (
    <div className="grid gap-4">
      {reports.map((report) => (
        <div key={report.month} className="rounded-[24px] border border-black/6 bg-white/55 p-4">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-[var(--color-ink)]">{report.label}</span>
            <span
              className={`font-medium ${
                report.net >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {report.net >= 0 ? "+" : "-"}
              {formatCompactCurrency(Math.abs(report.net))}
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-1">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">
                <span>Income</span>
                <span>{formatCompactCurrency(report.income)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${clamp((report.income / peak) * 100, 4, 100)}%` }}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">
                <span>Expense</span>
                <span>{formatCompactCurrency(report.expense)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${clamp((report.expense / peak) * 100, 4, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-black/10 bg-white/40 p-6 text-sm text-[var(--color-muted)]">
      {message}
    </div>
  );
}

function TransactionTypeBadge({ type }: { type: TransactionType }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${
        type === "income" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      {type}
    </span>
  );
}

export function FinancialPlatform() {
  const [snapshot, setSnapshot] = useState<FinancialSnapshot | null>(null);
  const [mode, setMode] = useState<"preview" | "google-apps-script">("preview");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [accountForm, setAccountForm] = useState(() => createAccountForm());
  const [transactionForm, setTransactionForm] = useState(() => createTransactionForm());
  const [assetForm, setAssetForm] = useState(() => createAssetForm());
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    month: getCurrentMonthKey(),
    type: "all",
    accountId: "all",
    category: "all",
    search: "",
  });

  const deferredSearch = useDeferredValue(filters.search.trim().toLowerCase());
  const clearToast = useEffectEvent(() => {
    setToast(null);
  });

  function showToast(kind: ToastState["kind"], message: string) {
    setToast({
      id: Date.now(),
      kind,
      message,
    });
  }

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      clearToast();
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function loadSnapshot() {
    setLoading(true);

    try {
      const client = createFinancialClient();
      setMode(client.mode);
      const nextSnapshot = await client.getSnapshot(DEMO_USER_ID);
      setSnapshot(nextSnapshot);
    } catch (error) {
      showToast("error", getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);

      try {
        const client = createFinancialClient();
        setMode(client.mode);
        const nextSnapshot = await client.getSnapshot(DEMO_USER_ID);
        setSnapshot(nextSnapshot);
      } catch (error) {
        showToast("error", getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!snapshot?.accounts.length) {
      return;
    }

    setTransactionForm((current) => {
      const stillExists = snapshot.accounts.some((account) => account.id === current.accountId);
      if (stillExists) {
        return current;
      }

      return {
        ...current,
        accountId: snapshot.accounts[0].id,
      };
    });
  }, [snapshot]);

  async function runMutation(
    action: (client: ReturnType<typeof createFinancialClient>) => Promise<FinancialSnapshot>,
    successMessage: string,
    onSuccess?: (nextSnapshot: FinancialSnapshot) => void,
  ) {
    setIsSaving(true);

    try {
      const client = createFinancialClient();
      setMode(client.mode);
      const nextSnapshot = await action(client);
      setSnapshot(nextSnapshot);
      onSuccess?.(nextSnapshot);
      showToast("success", successMessage);
    } catch (error) {
      showToast("error", getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  if (loading && !snapshot) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-12">
        <div className="card-surface w-full max-w-2xl p-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--color-accent)]">
            Initializing
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[var(--color-ink)]">
            Menyiapkan financial command center
          </h1>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            Kami sedang memuat akun, cashflow, dan aset supaya dashboard langsung siap dipakai.
          </p>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-12">
        <div className="card-surface w-full max-w-2xl p-10 text-center">
          <h1 className="text-3xl font-semibold tracking-[-0.05em] text-[var(--color-ink)]">
            Data finansial belum berhasil dimuat
          </h1>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            Coba muat ulang dashboard. Jika Anda sedang memakai Google Apps Script, pastikan endpoint
            web app sudah terpasang di `NEXT_PUBLIC_FINANCIAL_API_URL`.
          </p>
          <button className={`${actionButtonClassName} mt-6`} type="button" onClick={() => void loadSnapshot()}>
            Coba lagi
          </button>
        </div>
      </main>
    );
  }

  const sortedAccounts = sortAccountsByBalance(snapshot.accounts);
  const sortedTransactions = sortTransactionsLatest(snapshot.transactions);
  const sortedAssets = sortAssetsByValue(snapshot.assets);
  const dashboard = buildDashboard(snapshot);
  const reportMonth = filters.month === "all" ? getCurrentMonthKey() : filters.month;
  const monthlyReports = buildMonthlyReports(snapshot.transactions);
  const expenseBreakdown = buildExpenseBreakdown(snapshot.transactions, reportMonth);
  const assetBreakdown = buildAssetDistribution(snapshot.assets);
  const monthOptions = [...new Set(snapshot.transactions.map((transaction) => transaction.date.slice(0, 7)))]
    .sort()
    .reverse();
  const categoryOptions = [
    ...new Set([...defaultTransactionCategories, ...snapshot.transactions.map((item) => item.category)]),
  ].sort();
  const assetCategoryOptions = [
    ...new Set([...defaultAssetCategories, ...snapshot.assets.map((item) => item.category)]),
  ].sort();

  const filteredTransactions = sortedTransactions.filter((transaction) => {
    const matchesMonth =
      filters.month === "all" ? true : transaction.date.slice(0, 7) === filters.month;
    const matchesType = filters.type === "all" ? true : transaction.type === filters.type;
    const matchesAccount =
      filters.accountId === "all" ? true : transaction.accountId === filters.accountId;
    const matchesCategory =
      filters.category === "all" ? true : transaction.category === filters.category;
    const searchValue = `${transaction.category} ${transaction.note}`.toLowerCase();
    const matchesSearch = deferredSearch ? searchValue.includes(deferredSearch) : true;

    return matchesMonth && matchesType && matchesAccount && matchesCategory && matchesSearch;
  });

  const activeAccount = sortedAccounts.find((account) => account.id === transactionForm.accountId);
  const monthlyExpenseBase = Math.max(dashboard.expenseThisMonth, 1);
  const runwayMonths = dashboard.totalCash / monthlyExpenseBase;
  const totalGrowth = sortedAssets.reduce((sum, asset) => sum + (asset.value - asset.costBasis), 0);
  const userId = snapshot.userId;
  const nextAccountColorIndex = snapshot.accounts.length;
  const defaultTransactionAccountId = snapshot.accounts[0]?.id ?? "";

  function resetAccountForm(index = nextAccountColorIndex) {
    setEditingAccountId(null);
    setAccountForm(createAccountForm(index));
  }

  function resetTransactionForm(accountId = defaultTransactionAccountId) {
    setEditingTransactionId(null);
    setTransactionForm(createTransactionForm(accountId));
  }

  function resetAssetForm() {
    setEditingAssetId(null);
    setAssetForm(createAssetForm());
  }

  async function handleAccountSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runMutation(
      (client) => client.saveAccount(userId, accountForm, editingAccountId ?? undefined),
      editingAccountId ? "Akun berhasil diperbarui." : "Akun baru berhasil ditambahkan.",
      () => resetAccountForm(),
    );
  }

  async function handleTransactionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runMutation(
      (client) => client.saveTransaction(userId, transactionForm, editingTransactionId ?? undefined),
      editingTransactionId ? "Transaksi berhasil diperbarui." : "Transaksi berhasil dicatat.",
      (nextSnapshot) => resetTransactionForm(nextSnapshot.accounts[0]?.id ?? ""),
    );
  }

  async function handleAssetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runMutation(
      (client) => client.saveAsset(userId, assetForm, editingAssetId ?? undefined),
      editingAssetId ? "Aset berhasil diperbarui." : "Aset baru berhasil ditambahkan.",
      () => resetAssetForm(),
    );
  }

  function startEditAccount(account: Account) {
    setEditingAccountId(account.id);
    setAccountForm({
      name: account.name,
      balance: account.balance,
      color: account.color,
    });
  }

  function startEditTransaction(transaction: Transaction) {
    setEditingTransactionId(transaction.id);
    setTransactionForm({
      accountId: transaction.accountId,
      type: transaction.type,
      amount: transaction.amount,
      category: transaction.category,
      date: transaction.date,
      note: transaction.note,
    });
  }

  function startEditAsset(asset: Asset) {
    setEditingAssetId(asset.id);
    setAssetForm({
      name: asset.name,
      category: asset.category,
      value: asset.value,
      costBasis: asset.costBasis,
      note: asset.note,
    });
  }

  async function removeAccount(accountId: string) {
    if (!window.confirm("Hapus akun ini? Pastikan akun tidak lagi dipakai oleh transaksi.")) {
      return;
    }

    await runMutation(
      (client) => client.removeAccount(userId, accountId),
      "Akun berhasil dihapus.",
      (nextSnapshot) => {
        if (!nextSnapshot.accounts.some((account) => account.id === editingAccountId)) {
          resetAccountForm();
        }
      },
    );
  }

  async function removeTransaction(transactionId: string) {
    if (!window.confirm("Hapus transaksi ini? Saldo akun akan di-roll back otomatis.")) {
      return;
    }

    await runMutation(
      (client) => client.removeTransaction(userId, transactionId),
      "Transaksi berhasil dihapus.",
      () => {
        if (transactionId === editingTransactionId) {
          resetTransactionForm();
        }
      },
    );
  }

  async function removeAsset(assetId: string) {
    if (!window.confirm("Hapus aset ini dari daftar?")) {
      return;
    }

    await runMutation(
      (client) => client.removeAsset(userId, assetId),
      "Aset berhasil dihapus.",
      () => {
        if (assetId === editingAssetId) {
          resetAssetForm();
        }
      },
    );
  }

  async function resetPreviewData() {
    await runMutation(
      (client) => client.resetDemo(userId),
      "Data preview dikembalikan ke seed awal.",
      (nextSnapshot) => {
        resetAccountForm(nextSnapshot.accounts.length);
        resetTransactionForm(nextSnapshot.accounts[0]?.id ?? "");
        resetAssetForm();
      },
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <nav className="reveal sticky top-4 z-20 flex flex-wrap items-center gap-3 rounded-full border border-white/50 bg-white/70 px-4 py-3 shadow-[0_14px_40px_rgba(14,26,23,0.08)] backdrop-blur-xl">
        {[
          ["overview", "Overview"],
          ["accounts", "Accounts"],
          ["transactions", "Transactions"],
          ["assets", "Assets"],
          ["reports", "Reports"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={`#${href}`}
            className="rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)] transition hover:bg-black/5 hover:text-[var(--color-ink)]"
          >
            {label}
          </a>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            {mode === "preview" ? "Local Preview" : "Google Apps Script"}
          </span>
          {mode === "preview" ? (
            <button className={ghostButtonClassName} type="button" onClick={() => void resetPreviewData()}>
              Reset Seed
            </button>
          ) : null}
        </div>
      </nav>

      <section id="overview" className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="card-surface reveal p-7 lg:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[var(--color-accent-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent)]">
              Financial Command Center
            </span>
            <span className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-muted)]">
              Net worth real-time
            </span>
          </div>
          <div className="mt-6 max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-[-0.06em] text-[var(--color-ink)] sm:text-5xl lg:text-6xl">
              Satu dashboard untuk saldo, cashflow, aset, dan kesehatan finansial.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-muted)]">
              Sistem ini mengikuti arsitektur pada dokumen: akun memegang saldo real-time, transaksi
              menjadi audit trail, dan aset melengkapi perhitungan net worth. Saat API belum dipasang,
              mode preview tetap bisa dipakai untuk simulasi penuh.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Total Cash"
              value={formatCurrency(dashboard.totalCash)}
              note={`${snapshot.accounts.length} akun aktif`}
              tone="emerald"
            />
            <SummaryCard
              label="Asset Value"
              value={formatCurrency(dashboard.totalAssets)}
              note={`${snapshot.assets.length} aset bertumbuh`}
              tone="amber"
            />
            <SummaryCard
              label="Net Worth"
              value={formatCurrency(dashboard.netWorth)}
              note={`Growth aset ${formatCurrency(totalGrowth)}`}
              tone="blue"
            />
            <SummaryCard
              label="Savings Rate"
              value={formatPercent(dashboard.savingsRate)}
              note={`Net bulan ini ${formatCurrency(dashboard.monthlyNet)}`}
              tone={dashboard.savingsRate >= 30 ? "emerald" : "rose"}
            />
          </div>
        </div>

        <aside className="card-surface reveal grid gap-4 p-7" style={{ animationDelay: "0.08s" }}>
          <div className="rounded-[28px] bg-[linear-gradient(135deg,#0f766e_0%,#164e63_100%)] p-6 text-white shadow-[0_25px_60px_rgba(15,118,110,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/70">Current Month</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/60">Income</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.05em]">
                  {formatCompactCurrency(dashboard.incomeThisMonth)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/60">Expense</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.05em]">
                  {formatCompactCurrency(dashboard.expenseThisMonth)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/72">
              Estimasi runway kas saat ini sekitar{" "}
              <span className="font-semibold text-white">{runwayMonths.toFixed(1)} bulan</span> bila pola
              pengeluaran bulan ini tetap konstan.
            </p>
          </div>

          <div className="grid gap-3 rounded-[28px] border border-black/8 bg-white/55 p-5">
            {[
              {
                label: "Best-funded account",
                value: sortedAccounts[0]?.name ?? "-",
                note: sortedAccounts[0] ? formatCurrency(sortedAccounts[0].balance) : "Belum ada akun",
              },
              {
                label: "Most recent update",
                value: formatDate(snapshot.updatedAt.slice(0, 10)),
                note: "Sinkron dengan state aplikasi",
              },
              {
                label: "Filter context",
                value: filters.month === "all" ? "Semua bulan" : filters.month,
                note: "Dipakai untuk breakdown transaksi",
              },
            ].map((item) => (
              <div key={item.label} className="rounded-[22px] border border-black/6 bg-[var(--color-surface-strong)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-muted)]">
                  {item.label}
                </p>
                <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--color-ink)]">
                  {item.value}
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">{item.note}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <SectionShell
        id="accounts"
        eyebrow="Account Management"
        title="Kelola sumber dana utama dan saldo real-time"
        description="Saldo akun menjadi sumber kebenaran utama. Transaksi akan menaikkan atau menurunkan nilai akun secara otomatis, tetapi Anda juga tetap bisa melakukan koreksi manual bila dibutuhkan."
        delay="0.12s"
      >
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {sortedAccounts.length ? (
              sortedAccounts.map((account) => (
                <article
                  key={account.id}
                  className="rounded-[28px] border border-black/6 bg-white/65 p-5 shadow-[0_18px_35px_rgba(20,24,28,0.06)]"
                  style={{
                    backgroundImage: `linear-gradient(145deg, ${account.color}18, rgba(255,255,255,0.85))`,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span
                        className="inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]"
                        style={{ backgroundColor: `${account.color}20`, color: account.color }}
                      >
                        {account.name}
                      </span>
                      <p className="mt-4 text-2xl font-semibold tracking-[-0.05em] text-[var(--color-ink)]">
                        {formatCurrency(account.balance)}
                      </p>
                    </div>
                    <div className="grid gap-2 text-right">
                      <button className={ghostButtonClassName} type="button" onClick={() => startEditAccount(account)}>
                        Edit
                      </button>
                      <button className={dangerButtonClassName} type="button" onClick={() => void removeAccount(account.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-[var(--color-muted)]">
                    Diperbarui {formatDate(account.updatedAt.slice(0, 10))}. Cocok untuk rekening bank,
                    e-wallet, maupun cash.
                  </p>
                </article>
              ))
            ) : (
              <EmptyState message="Belum ada akun. Tambahkan akun pertama Anda untuk mulai mencatat transaksi." />
            )}
          </div>

          <form className="grid gap-4 rounded-[30px] border border-black/8 bg-white/60 p-5" onSubmit={handleAccountSubmit}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-accent)]">
                  {editingAccountId ? "Edit Account" : "New Account"}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
                  {editingAccountId ? "Perbarui detail akun" : "Tambahkan sumber dana baru"}
                </h3>
              </div>
              {editingAccountId ? (
                <button className={ghostButtonClassName} type="button" onClick={() => resetAccountForm()}>
                  Batal
                </button>
              ) : null}
            </div>

            <Field label="Nama akun" hint="Contoh: BCA, Cash Wallet, Jago Daily">
              <input
                className={accountInputClassName}
                value={accountForm.name}
                onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Masukkan nama akun"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="Saldo sekarang">
                <input
                  className={accountInputClassName}
                  type="number"
                  min={0}
                  step={1000}
                  value={accountForm.balance}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      balance: Number(event.target.value || 0),
                    }))
                  }
                />
              </Field>
              <Field label="Warna">
                <input
                  className="h-[52px] w-full min-w-20 rounded-2xl border border-black/10 bg-white/80 p-2"
                  type="color"
                  value={accountForm.color}
                  onChange={(event) =>
                    setAccountForm((current) => ({ ...current, color: event.target.value }))
                  }
                />
              </Field>
            </div>

            <button className={actionButtonClassName} disabled={isSaving} type="submit">
              {editingAccountId ? "Simpan Perubahan Akun" : "Tambah Akun"}
            </button>
          </form>
        </div>
      </SectionShell>

      <SectionShell
        id="transactions"
        eyebrow="Cashflow Management"
        title="CRUD transaksi dengan rollback saldo otomatis"
        description="Setiap create, update, dan delete mengikuti business logic pada dokumen: transaksi baru mengubah saldo akun, edit akan me-revert nilai lama lalu menerapkan nilai baru, dan delete akan mengembalikan efek transaksi."
        delay="0.16s"
      >
        <div className="grid gap-6 xl:grid-cols-[1.28fr_0.92fr]">
          <div className="grid gap-5">
            <div className="grid gap-3 rounded-[28px] border border-black/8 bg-white/60 p-4 lg:grid-cols-5">
              <Field label="Bulan">
                <select
                  className={accountInputClassName}
                  value={filters.month}
                  onChange={(event) =>
                    startTransition(() =>
                      setFilters((current) => ({
                        ...current,
                        month: event.target.value,
                      })),
                    )
                  }
                >
                  <option value="all">Semua bulan</option>
                  {monthOptions.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type">
                <select
                  className={accountInputClassName}
                  value={filters.type}
                  onChange={(event) =>
                    startTransition(() =>
                      setFilters((current) => ({
                        ...current,
                        type: event.target.value as FilterState["type"],
                      })),
                    )
                  }
                >
                  <option value="all">Semua</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </Field>
              <Field label="Akun">
                <select
                  className={accountInputClassName}
                  value={filters.accountId}
                  onChange={(event) =>
                    startTransition(() =>
                      setFilters((current) => ({
                        ...current,
                        accountId: event.target.value,
                      })),
                    )
                  }
                >
                  <option value="all">Semua akun</option>
                  {sortedAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kategori">
                <select
                  className={accountInputClassName}
                  value={filters.category}
                  onChange={(event) =>
                    startTransition(() =>
                      setFilters((current) => ({
                        ...current,
                        category: event.target.value,
                      })),
                    )
                  }
                >
                  <option value="all">Semua kategori</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cari note">
                <input
                  className={accountInputClassName}
                  value={filters.search}
                  onChange={(event) =>
                    startTransition(() =>
                      setFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      })),
                    )
                  }
                  placeholder="Contoh: listrik"
                />
              </Field>
            </div>

            <div className="grid gap-3">
              {filteredTransactions.length ? (
                filteredTransactions.map((transaction) => {
                  const account = snapshot.accounts.find((item) => item.id === transaction.accountId);
                  const isIncome = transaction.type === "income";

                  return (
                    <article
                      key={transaction.id}
                      className="grid gap-3 rounded-[28px] border border-black/6 bg-white/65 p-5 shadow-[0_15px_35px_rgba(20,24,28,0.05)] lg:grid-cols-[auto,1fr,auto]"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 text-sm font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">
                        {account?.name.slice(0, 2) ?? "NA"}
                      </div>
                      <div className="grid gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <TransactionTypeBadge type={transaction.type} />
                          <span className="text-sm font-semibold text-[var(--color-ink)]">
                            {transaction.category}
                          </span>
                          <span className="text-sm text-[var(--color-muted)]">
                            {account?.name ?? "Akun tidak ditemukan"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--color-muted)]">
                          <span>{formatDate(transaction.date)}</span>
                          <span>{transaction.note || "Tanpa catatan"}</span>
                        </div>
                      </div>
                      <div className="grid gap-3 lg:text-right">
                        <p
                          className={`text-xl font-semibold tracking-[-0.04em] ${
                            isIncome ? "text-emerald-700" : "text-amber-700"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {formatCurrency(transaction.amount)}
                        </p>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <button className={ghostButtonClassName} type="button" onClick={() => startEditTransaction(transaction)}>
                            Edit
                          </button>
                          <button className={dangerButtonClassName} type="button" onClick={() => void removeTransaction(transaction.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <EmptyState message="Tidak ada transaksi yang cocok dengan filter saat ini." />
              )}
            </div>
          </div>

          <form className="grid gap-4 rounded-[30px] border border-black/8 bg-white/60 p-5" onSubmit={handleTransactionSubmit}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-accent)]">
                  {editingTransactionId ? "Edit Transaction" : "New Transaction"}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
                  {editingTransactionId ? "Perbarui cashflow entry" : "Catat income atau expense"}
                </h3>
              </div>
              {editingTransactionId ? (
                <button className={ghostButtonClassName} type="button" onClick={() => resetTransactionForm()}>
                  Batal
                </button>
              ) : null}
            </div>

            <Field label="Akun sumber">
              <select
                className={accountInputClassName}
                value={transactionForm.accountId}
                onChange={(event) =>
                  setTransactionForm((current) => ({ ...current, accountId: event.target.value }))
                }
                disabled={!sortedAccounts.length}
              >
                {sortedAccounts.length ? (
                  sortedAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))
                ) : (
                  <option value="">Belum ada akun</option>
                )}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipe transaksi">
                <select
                  className={accountInputClassName}
                  value={transactionForm.type}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      type: event.target.value as TransactionType,
                    }))
                  }
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </Field>
              <Field label="Tanggal">
                <input
                  className={accountInputClassName}
                  type="date"
                  value={transactionForm.date}
                  onChange={(event) =>
                    setTransactionForm((current) => ({ ...current, date: event.target.value }))
                  }
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nominal">
                <input
                  className={accountInputClassName}
                  type="number"
                  min={0}
                  step={1000}
                  value={transactionForm.amount}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      amount: Number(event.target.value || 0),
                    }))
                  }
                />
              </Field>
              <Field label="Kategori">
                <input
                  className={accountInputClassName}
                  list="transaction-categories"
                  value={transactionForm.category}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <Field
              label="Catatan"
              hint={
                activeAccount
                  ? `Saldo akun aktif saat ini ${formatCurrency(activeAccount.balance)}`
                  : "Pilih akun terlebih dahulu."
              }
            >
              <textarea
                className={`${accountInputClassName} min-h-28 resize-none`}
                value={transactionForm.note}
                onChange={(event) =>
                  setTransactionForm((current) => ({ ...current, note: event.target.value }))
                }
                placeholder="Tambahkan konteks singkat agar audit trail lebih jelas"
              />
            </Field>

            <button className={actionButtonClassName} disabled={isSaving || !sortedAccounts.length} type="submit">
              {editingTransactionId ? "Simpan Perubahan Transaksi" : "Tambah Transaksi"}
            </button>
          </form>
        </div>
      </SectionShell>

      <SectionShell
        id="assets"
        eyebrow="Asset Tracking"
        title="Pantau aset bertumbuh dan kontribusinya terhadap net worth"
        description="Aset dipisahkan dari cashflow operasional agar pertumbuhan portofolio tetap terlihat jelas. Anda bisa menyimpan nilai sekarang, cost basis, dan catatan strategi untuk tiap aset."
        delay="0.2s"
      >
        <div className="grid gap-6 xl:grid-cols-[1.22fr_0.98fr]">
          <div className="grid gap-4">
            {sortedAssets.length ? (
              sortedAssets.map((asset) => {
                const growthValue = asset.value - asset.costBasis;
                const growthRate = asset.costBasis > 0 ? (growthValue / asset.costBasis) * 100 : 0;

                return (
                  <article key={asset.id} className="rounded-[28px] border border-black/6 bg-white/65 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
                          {asset.category}
                        </span>
                        <h3 className="mt-4 text-2xl font-semibold tracking-[-0.05em] text-[var(--color-ink)]">
                          {asset.name}
                        </h3>
                        <p className="mt-2 text-sm text-[var(--color-muted)]">{asset.note || "Tanpa catatan"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button className={ghostButtonClassName} type="button" onClick={() => startEditAsset(asset)}>
                          Edit
                        </button>
                        <button className={dangerButtonClassName} type="button" onClick={() => void removeAsset(asset.id)}>
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[22px] border border-black/6 bg-[var(--color-surface-strong)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
                          Market value
                        </p>
                        <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--color-ink)]">
                          {formatCurrency(asset.value)}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-black/6 bg-[var(--color-surface-strong)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
                          Cost basis
                        </p>
                        <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--color-ink)]">
                          {formatCurrency(asset.costBasis)}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-black/6 bg-[var(--color-surface-strong)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
                          Growth
                        </p>
                        <p
                          className={`mt-2 text-lg font-semibold tracking-[-0.03em] ${
                            growthValue >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {growthValue >= 0 ? "+" : "-"}
                          {formatCurrency(Math.abs(growthValue))}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-muted)]">{formatPercent(growthRate)}</p>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState message="Belum ada aset. Tambahkan aset untuk melihat distribusi dan pertumbuhan portofolio." />
            )}
          </div>

          <form className="grid gap-4 rounded-[30px] border border-black/8 bg-white/60 p-5" onSubmit={handleAssetSubmit}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-accent)]">
                  {editingAssetId ? "Edit Asset" : "New Asset"}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
                  {editingAssetId ? "Perbarui nilai aset" : "Tambahkan aset bertumbuh"}
                </h3>
              </div>
              {editingAssetId ? (
                <button className={ghostButtonClassName} type="button" onClick={() => resetAssetForm()}>
                  Batal
                </button>
              ) : null}
            </div>

            <Field label="Nama aset">
              <input
                className={accountInputClassName}
                value={assetForm.name}
                onChange={(event) => setAssetForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Contoh: IDX Mutual Fund"
              />
            </Field>

            <Field label="Kategori">
              <input
                className={accountInputClassName}
                list="asset-categories"
                value={assetForm.category}
                onChange={(event) =>
                  setAssetForm((current) => ({ ...current, category: event.target.value }))
                }
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nilai saat ini">
                <input
                  className={accountInputClassName}
                  type="number"
                  min={0}
                  step={1000}
                  value={assetForm.value}
                  onChange={(event) =>
                    setAssetForm((current) => ({
                      ...current,
                      value: Number(event.target.value || 0),
                    }))
                  }
                />
              </Field>
              <Field label="Cost basis">
                <input
                  className={accountInputClassName}
                  type="number"
                  min={0}
                  step={1000}
                  value={assetForm.costBasis}
                  onChange={(event) =>
                    setAssetForm((current) => ({
                      ...current,
                      costBasis: Number(event.target.value || 0),
                    }))
                  }
                />
              </Field>
            </div>

            <Field label="Catatan">
              <textarea
                className={`${accountInputClassName} min-h-28 resize-none`}
                value={assetForm.note}
                onChange={(event) => setAssetForm((current) => ({ ...current, note: event.target.value }))}
                placeholder="Strategi, target, atau alasan menyimpan aset ini"
              />
            </Field>

            <button className={actionButtonClassName} disabled={isSaving} type="submit">
              {editingAssetId ? "Simpan Perubahan Aset" : "Tambah Aset"}
            </button>
          </form>
        </div>
      </SectionShell>

      <SectionShell
        id="reports"
        eyebrow="Reporting"
        title="Laporan bulanan, breakdown expense, dan distribusi aset"
        description="Bagian ini merangkum insight yang biasanya dibutuhkan untuk review mingguan atau bulanan: tren income vs expense, kategori pengeluaran dominan, dan alokasi portofolio saat ini."
        delay="0.24s"
      >
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="grid gap-4 rounded-[28px] border border-black/8 bg-white/60 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent)]">
                Monthly trend
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
                Income vs expense
              </h3>
            </div>
            <MonthBars reports={monthlyReports} />
          </div>

          <div className="grid gap-4 rounded-[28px] border border-black/8 bg-white/60 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent)]">
                Expense breakdown
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
                Fokus pengeluaran {reportMonth}
              </h3>
            </div>
            <BreakdownList items={expenseBreakdown} />
          </div>

          <div className="grid gap-4 rounded-[28px] border border-black/8 bg-white/60 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent)]">
                Asset distribution
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
                Komposisi portofolio
              </h3>
            </div>
            <BreakdownList items={assetBreakdown} formatter={formatCurrency} />
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {[
            {
              title: "Auto saldo",
              detail:
                "Income menambah balance akun dan expense mengurangi balance akun, mengikuti logic inti pada dokumen sistem.",
            },
            {
              title: "Safe edit flow",
              detail:
                "Update transaksi merevert nilai lama lalu menerapkan nilai baru, sehingga saldo tidak double count.",
            },
            {
              title: "Production handoff",
              detail:
                "Frontend ini siap dipasangkan ke Apps Script lewat `NEXT_PUBLIC_FINANCIAL_API_URL`, sementara mode preview menjaga UX tetap berjalan untuk testing cepat.",
            },
          ].map((item) => (
            <article key={item.title} className="rounded-[24px] border border-black/6 bg-white/55 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[var(--color-accent)]">
                {item.title}
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{item.detail}</p>
            </article>
          ))}
        </div>
      </SectionShell>

      <datalist id="transaction-categories">
        {categoryOptions.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <datalist id="asset-categories">
        {assetCategoryOptions.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      {toast ? (
        <div
          className={`pointer-events-none fixed bottom-6 right-6 z-30 max-w-sm rounded-[24px] border px-5 py-4 text-sm shadow-[0_25px_60px_rgba(20,24,28,0.16)] backdrop-blur-xl ${
            toast.kind === "success"
              ? "border-emerald-200 bg-emerald-50/95 text-emerald-800"
              : "border-rose-200 bg-rose-50/95 text-rose-800"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </main>
  );
}
