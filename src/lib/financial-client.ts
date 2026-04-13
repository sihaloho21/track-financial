"use client";

import { demoSnapshot } from "@/lib/demo-data";
import {
  createTransaction,
  deleteAccount,
  deleteAsset,
  deleteTransaction,
  upsertAccount,
  upsertAsset,
  updateTransaction,
} from "@/lib/financial-engine";
import type {
  ApiResponse,
  FinancialSnapshot,
  UpsertAccountInput,
  UpsertAssetInput,
  UpsertTransactionInput,
} from "@/types/financial";

const STORAGE_PREFIX = "track-financial";
const FINANCIAL_PROXY_PATH = "/api/financial";

export type FinancialClient = {
  mode: "preview" | "google-apps-script";
  getSnapshot(userId: string): Promise<FinancialSnapshot>;
  saveAccount(userId: string, input: UpsertAccountInput, accountId?: string): Promise<FinancialSnapshot>;
  removeAccount(userId: string, accountId: string): Promise<FinancialSnapshot>;
  saveTransaction(
    userId: string,
    input: UpsertTransactionInput,
    transactionId?: string,
  ): Promise<FinancialSnapshot>;
  removeTransaction(userId: string, transactionId: string): Promise<FinancialSnapshot>;
  saveAsset(userId: string, input: UpsertAssetInput, assetId?: string): Promise<FinancialSnapshot>;
  removeAsset(userId: string, assetId: string): Promise<FinancialSnapshot>;
  resetDemo(userId: string): Promise<FinancialSnapshot>;
};

function getStorageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function readSnapshot(userId: string) {
  const stored = window.localStorage.getItem(getStorageKey(userId));
  if (!stored) {
    return structuredClone({
      ...demoSnapshot,
      userId,
    });
  }

  return JSON.parse(stored) as FinancialSnapshot;
}

function writeSnapshot(snapshot: FinancialSnapshot) {
  window.localStorage.setItem(getStorageKey(snapshot.userId), JSON.stringify(snapshot));
  return snapshot;
}

function createLocalPreviewClient(): FinancialClient {
  return {
    mode: "preview",
    async getSnapshot(userId) {
      return writeSnapshot(readSnapshot(userId));
    },
    async saveAccount(userId, input, accountId) {
      const current = readSnapshot(userId);
      return writeSnapshot(upsertAccount(current, input, accountId));
    },
    async removeAccount(userId, accountId) {
      const current = readSnapshot(userId);
      return writeSnapshot(deleteAccount(current, accountId));
    },
    async saveTransaction(userId, input, transactionId) {
      const current = readSnapshot(userId);
      const nextSnapshot = transactionId
        ? updateTransaction(current, transactionId, input)
        : createTransaction(current, input);

      return writeSnapshot(nextSnapshot);
    },
    async removeTransaction(userId, transactionId) {
      const current = readSnapshot(userId);
      return writeSnapshot(deleteTransaction(current, transactionId));
    },
    async saveAsset(userId, input, assetId) {
      const current = readSnapshot(userId);
      return writeSnapshot(upsertAsset(current, input, assetId));
    },
    async removeAsset(userId, assetId) {
      const current = readSnapshot(userId);
      return writeSnapshot(deleteAsset(current, assetId));
    },
    async resetDemo(userId) {
      const nextSnapshot = structuredClone({
        ...demoSnapshot,
        userId,
        updatedAt: new Date().toISOString(),
      });
      return writeSnapshot(nextSnapshot);
    },
  };
}

type MutationAction =
  | "addTransaction"
  | "updateTransaction"
  | "deleteTransaction"
  | "addAccount"
  | "updateAccount"
  | "deleteAccount"
  | "addAsset"
  | "updateAsset"
  | "deleteAsset";

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`Request gagal: ${response.status}`);
  }

  return (await response.json()) as T;
}

function createGoogleAppsScriptClient(): FinancialClient {
  async function getCollection<T>(action: string, userId: string) {
    const url = new URL(FINANCIAL_PROXY_PATH, window.location.origin);
    url.searchParams.set("action", action);
    url.searchParams.set("userId", userId);

    const result = await requestJson<ApiResponse<T>>(url.toString());
    if (!result.success) {
      throw new Error(result.error ?? "Gagal memuat data dari API.");
    }

    return result.data;
  }

  async function mutate(userId: string, action: MutationAction, data: Record<string, unknown>) {
    const result = await requestJson<ApiResponse<unknown>>(FINANCIAL_PROXY_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        userId,
        data,
      }),
    });

    if (!result.success) {
      throw new Error(result.error ?? "Mutasi data gagal.");
    }

    return getSnapshot(userId);
  }

  async function getSnapshot(userId: string): Promise<FinancialSnapshot> {
    const [accounts, transactions, assets] = await Promise.all([
      getCollection<FinancialSnapshot["accounts"]>("getAccounts", userId),
      getCollection<FinancialSnapshot["transactions"]>("getTransactions", userId),
      getCollection<FinancialSnapshot["assets"]>("getAssets", userId),
    ]);

    return {
      userId,
      accounts,
      transactions,
      assets,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    mode: "google-apps-script",
    getSnapshot,
    async saveAccount(userId, input, accountId) {
      return mutate(userId, accountId ? "updateAccount" : "addAccount", {
        accountId,
        ...input,
      });
    },
    async removeAccount(userId, accountId) {
      return mutate(userId, "deleteAccount", { accountId });
    },
    async saveTransaction(userId, input, transactionId) {
      return mutate(userId, transactionId ? "updateTransaction" : "addTransaction", {
        transactionId,
        ...input,
      });
    },
    async removeTransaction(userId, transactionId) {
      return mutate(userId, "deleteTransaction", { transactionId });
    },
    async saveAsset(userId, input, assetId) {
      return mutate(userId, assetId ? "updateAsset" : "addAsset", {
        assetId,
        ...input,
      });
    },
    async removeAsset(userId, assetId) {
      return mutate(userId, "deleteAsset", { assetId });
    },
    async resetDemo(userId) {
      return getSnapshot(userId);
    },
  };
}

export function createFinancialClient(): FinancialClient {
  const isRemoteEnabled =
    process.env.NEXT_PUBLIC_FINANCIAL_API_ENABLED === "true" ||
    Boolean(process.env.NEXT_PUBLIC_FINANCIAL_API_URL);

  if (!isRemoteEnabled) {
    return createLocalPreviewClient();
  }

  return createGoogleAppsScriptClient();
}
