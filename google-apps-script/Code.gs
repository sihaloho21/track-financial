var SHEETS = {
  Accounts: ["id", "user_id", "name", "balance", "color", "updated_at"],
  Transactions: [
    "id",
    "user_id",
    "account_id",
    "type",
    "amount",
    "category",
    "date",
    "note",
    "created_at",
    "updated_at",
  ],
  Assets: ["id", "user_id", "name", "category", "value", "cost_basis", "note", "updated_at"],
};

function doGet(e) {
  return withErrorHandling_(function () {
    var userId = requireString_(param_(e, "userId"), "userId");
    var action = requireString_(param_(e, "action"), "action");

    switch (action) {
      case "getAccounts":
        return ok_(getAccounts_(userId));
      case "getTransactions":
        return ok_(getTransactions_(userId));
      case "getAssets":
        return ok_(getAssets_(userId));
      case "getDashboard":
        return ok_(buildDashboard_(userId));
      case "getReports":
        return ok_(buildReports_(userId));
      default:
        throw new Error("Action GET tidak dikenali: " + action);
    }
  });
}

function doPost(e) {
  return withErrorHandling_(function () {
    var payload = parseJson_(e.postData && e.postData.contents);
    var userId = requireString_(payload.userId, "userId");
    var action = requireString_(payload.action, "action");
    var data = payload.data || {};

    switch (action) {
      case "addTransaction":
        addTransaction_(userId, data);
        break;
      case "updateTransaction":
        updateTransaction_(userId, requireString_(data.transactionId, "transactionId"), data);
        break;
      case "deleteTransaction":
        deleteTransaction_(userId, requireString_(data.transactionId, "transactionId"));
        break;
      case "addAccount":
        addAccount_(userId, data);
        break;
      case "updateAccount":
        updateAccount_(userId, requireString_(data.accountId, "accountId"), data);
        break;
      case "deleteAccount":
        deleteAccount_(userId, requireString_(data.accountId, "accountId"));
        break;
      case "addAsset":
        addAsset_(userId, data);
        break;
      case "updateAsset":
        updateAsset_(userId, requireString_(data.assetId, "assetId"), data);
        break;
      case "deleteAsset":
        deleteAsset_(userId, requireString_(data.assetId, "assetId"));
        break;
      default:
        throw new Error("Action POST tidak dikenali: " + action);
    }

    return ok_({
      accounts: getAccounts_(userId),
      transactions: getTransactions_(userId),
      assets: getAssets_(userId),
    });
  });
}

function addAccount_(userId, data) {
  var name = requireString_(data.name, "name");
  var balance = requireNonNegativeNumber_(data.balance, "balance");
  var color = requireString_(data.color, "color");
  var timestamp = nowIso_();

  appendRecord_("Accounts", {
    id: createId_("acct"),
    user_id: userId,
    name: name,
    balance: balance,
    color: color,
    updated_at: timestamp,
  });
}

function updateAccount_(userId, accountId, data) {
  var row = findRecordById_("Accounts", accountId, userId);
  var timestamp = nowIso_();

  updateRecord_("Accounts", row.rowIndex, {
    name: requireString_(data.name, "name"),
    balance: requireNonNegativeNumber_(data.balance, "balance"),
    color: requireString_(data.color, "color"),
    updated_at: timestamp,
  });
}

function deleteAccount_(userId, accountId) {
  var transactionRows = getRows_("Transactions").filter(function (row) {
    return row.record.user_id === userId && row.record.account_id === accountId;
  });

  if (transactionRows.length) {
    throw new Error("Akun masih dipakai oleh transaksi. Hapus transaksinya dulu.");
  }

  var row = findRecordById_("Accounts", accountId, userId);
  getSheet_("Accounts").deleteRow(row.rowIndex);
}

function addTransaction_(userId, data) {
  validateTransactionPayload_(data);

  var account = findRecordById_("Accounts", data.accountId, userId);
  var amount = requirePositiveNumber_(data.amount, "amount");
  var timestamp = nowIso_();
  var transaction = {
    id: createId_("trx"),
    user_id: userId,
    account_id: data.accountId,
    type: requireTransactionType_(data.type),
    amount: amount,
    category: requireString_(data.category, "category"),
    date: requireString_(data.date, "date"),
    note: String(data.note || ""),
    created_at: timestamp,
    updated_at: timestamp,
  };

  appendRecord_("Transactions", transaction);
  mutateAccountBalance_(account.rowIndex, account.record.balance, signedAmount_(transaction.type, amount));
}

function updateTransaction_(userId, transactionId, data) {
  validateTransactionPayload_(data);

  var existing = findRecordById_("Transactions", transactionId, userId);
  var oldTransaction = existing.record;
  var newType = requireTransactionType_(data.type);
  var newAmount = requirePositiveNumber_(data.amount, "amount");
  var oldAccount = findRecordById_("Accounts", oldTransaction.account_id, userId);
  var newAccount = findRecordById_("Accounts", data.accountId, userId);
  var oldDelta = signedAmount_(oldTransaction.type, Number(oldTransaction.amount));
  var newDelta = signedAmount_(newType, newAmount);

  if (oldAccount.rowIndex === newAccount.rowIndex) {
    mutateAccountBalance_(oldAccount.rowIndex, oldAccount.record.balance, -oldDelta + newDelta);
  } else {
    mutateAccountBalance_(oldAccount.rowIndex, oldAccount.record.balance, -oldDelta);
    mutateAccountBalance_(newAccount.rowIndex, newAccount.record.balance, newDelta);
  }

  updateRecord_("Transactions", existing.rowIndex, {
    account_id: data.accountId,
    type: newType,
    amount: newAmount,
    category: requireString_(data.category, "category"),
    date: requireString_(data.date, "date"),
    note: String(data.note || ""),
    updated_at: nowIso_(),
  });
}

function deleteTransaction_(userId, transactionId) {
  var existing = findRecordById_("Transactions", transactionId, userId);
  var account = findRecordById_("Accounts", existing.record.account_id, userId);
  var rollbackDelta = -signedAmount_(existing.record.type, Number(existing.record.amount));

  mutateAccountBalance_(account.rowIndex, account.record.balance, rollbackDelta);
  getSheet_("Transactions").deleteRow(existing.rowIndex);
}

function addAsset_(userId, data) {
  appendRecord_("Assets", {
    id: createId_("asset"),
    user_id: userId,
    name: requireString_(data.name, "name"),
    category: requireString_(data.category, "category"),
    value: requirePositiveNumber_(data.value, "value"),
    cost_basis: requireNonNegativeNumber_(data.costBasis, "costBasis"),
    note: String(data.note || ""),
    updated_at: nowIso_(),
  });
}

function updateAsset_(userId, assetId, data) {
  var row = findRecordById_("Assets", assetId, userId);

  updateRecord_("Assets", row.rowIndex, {
    name: requireString_(data.name, "name"),
    category: requireString_(data.category, "category"),
    value: requirePositiveNumber_(data.value, "value"),
    cost_basis: requireNonNegativeNumber_(data.costBasis, "costBasis"),
    note: String(data.note || ""),
    updated_at: nowIso_(),
  });
}

function deleteAsset_(userId, assetId) {
  var row = findRecordById_("Assets", assetId, userId);
  getSheet_("Assets").deleteRow(row.rowIndex);
}

function getAccounts_(userId) {
  return getRows_("Accounts")
    .filter(function (row) {
      return row.record.user_id === userId;
    })
    .map(function (row) {
      return {
        id: row.record.id,
        userId: row.record.user_id,
        name: row.record.name,
        balance: Number(row.record.balance),
        color: row.record.color,
        updatedAt: row.record.updated_at,
      };
    })
    .sort(function (a, b) {
      return b.balance - a.balance;
    });
}

function getTransactions_(userId) {
  return getRows_("Transactions")
    .filter(function (row) {
      return row.record.user_id === userId;
    })
    .map(function (row) {
      return {
        id: row.record.id,
        userId: row.record.user_id,
        accountId: row.record.account_id,
        type: row.record.type,
        amount: Number(row.record.amount),
        category: row.record.category,
        date: row.record.date,
        note: row.record.note,
        createdAt: row.record.created_at,
        updatedAt: row.record.updated_at,
      };
    })
    .sort(function (a, b) {
      if (a.date === b.date) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      }
      return String(b.date).localeCompare(String(a.date));
    });
}

function getAssets_(userId) {
  return getRows_("Assets")
    .filter(function (row) {
      return row.record.user_id === userId;
    })
    .map(function (row) {
      return {
        id: row.record.id,
        userId: row.record.user_id,
        name: row.record.name,
        category: row.record.category,
        value: Number(row.record.value),
        costBasis: Number(row.record.cost_basis),
        note: row.record.note,
        updatedAt: row.record.updated_at,
      };
    })
    .sort(function (a, b) {
      return b.value - a.value;
    });
}

function buildDashboard_(userId) {
  var accounts = getAccounts_(userId);
  var assets = getAssets_(userId);
  var transactions = getTransactions_(userId);
  var currentMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  var incomeThisMonth = 0;
  var expenseThisMonth = 0;

  transactions.forEach(function (transaction) {
    if (String(transaction.date).slice(0, 7) !== currentMonth) {
      return;
    }

    if (transaction.type === "income") {
      incomeThisMonth += Number(transaction.amount);
    } else {
      expenseThisMonth += Number(transaction.amount);
    }
  });

  var totalCash = sumBy_(accounts, "balance");
  var totalAssets = sumBy_(assets, "value");
  var monthlyNet = incomeThisMonth - expenseThisMonth;

  return {
    totalCash: totalCash,
    totalAssets: totalAssets,
    netWorth: totalCash + totalAssets,
    incomeThisMonth: incomeThisMonth,
    expenseThisMonth: expenseThisMonth,
    monthlyNet: monthlyNet,
    savingsRate: incomeThisMonth > 0 ? (monthlyNet / incomeThisMonth) * 100 : 0,
  };
}

function buildReports_(userId) {
  var transactions = getTransactions_(userId);
  var monthlyBuckets = {};
  var expenseBuckets = {};

  transactions.forEach(function (transaction) {
    var month = String(transaction.date).slice(0, 7);
    monthlyBuckets[month] = monthlyBuckets[month] || { income: 0, expense: 0 };

    if (transaction.type === "income") {
      monthlyBuckets[month].income += Number(transaction.amount);
    } else {
      monthlyBuckets[month].expense += Number(transaction.amount);
      expenseBuckets[transaction.category] = (expenseBuckets[transaction.category] || 0) + Number(transaction.amount);
    }
  });

  var monthlyReport = Object.keys(monthlyBuckets)
    .sort()
    .map(function (month) {
      return {
        month: month,
        income: monthlyBuckets[month].income,
        expense: monthlyBuckets[month].expense,
        net: monthlyBuckets[month].income - monthlyBuckets[month].expense,
      };
    });

  var expenseBreakdown = Object.keys(expenseBuckets)
    .map(function (category) {
      return {
        category: category,
        amount: expenseBuckets[category],
      };
    })
    .sort(function (a, b) {
      return b.amount - a.amount;
    });

  return {
    monthlyReport: monthlyReport,
    expenseBreakdown: expenseBreakdown,
  };
}

function mutateAccountBalance_(rowIndex, currentBalance, delta) {
  var headers = SHEETS.Accounts;
  var balanceColumn = headers.indexOf("balance") + 1;
  var updatedAtColumn = headers.indexOf("updated_at") + 1;
  var sheet = getSheet_("Accounts");

  sheet.getRange(rowIndex, balanceColumn).setValue(Number(currentBalance) + Number(delta));
  sheet.getRange(rowIndex, updatedAtColumn).setValue(nowIso_());
}

function appendRecord_(sheetName, record) {
  var sheet = getSheet_(sheetName);
  var headers = SHEETS[sheetName];
  var values = headers.map(function (header) {
    return record[header] !== undefined ? record[header] : "";
  });

  sheet.appendRow(values);
}

function updateRecord_(sheetName, rowIndex, patch) {
  var sheet = getSheet_(sheetName);
  var headers = SHEETS[sheetName];
  var current = getRows_(sheetName).filter(function (row) {
    return row.rowIndex === rowIndex;
  })[0];

  if (!current) {
    throw new Error("Baris sheet tidak ditemukan.");
  }

  var values = headers.map(function (header) {
    return patch[header] !== undefined ? patch[header] : current.record[header];
  });

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([values]);
}

function findRecordById_(sheetName, id, userId) {
  var row = getRows_(sheetName).filter(function (item) {
    return item.record.id === id && item.record.user_id === userId;
  })[0];

  if (!row) {
    throw new Error("Data tidak ditemukan pada sheet " + sheetName + ".");
  }

  return row;
}

function getRows_(sheetName) {
  var sheet = getSheet_(sheetName);
  var headers = SHEETS[sheetName];
  var values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  return values.slice(1).map(function (row, index) {
    var record = {};
    headers.forEach(function (header, headerIndex) {
      record[header] = row[headerIndex];
    });

    return {
      rowIndex: index + 2,
      record: record,
    };
  });
}

function getSheet_(sheetName) {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  var spreadsheet = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  ensureHeader_(sheet, SHEETS[sheetName]);
  return sheet;
}

function ensureHeader_(sheet, headers) {
  var width = headers.length;
  var current = sheet.getRange(1, 1, 1, width).getValues()[0];
  var needsUpdate = current.join("|") !== headers.join("|");

  if (needsUpdate) {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
  }
}

function validateTransactionPayload_(data) {
  requireString_(data.accountId, "accountId");
  requirePositiveNumber_(data.amount, "amount");
  requireTransactionType_(data.type);
  requireString_(data.category, "category");
  requireString_(data.date, "date");
}

function requireTransactionType_(value) {
  var nextValue = requireString_(value, "type");
  if (nextValue !== "income" && nextValue !== "expense") {
    throw new Error("type harus income atau expense.");
  }
  return nextValue;
}

function requireString_(value, label) {
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error(label + " wajib diisi.");
  }
  return String(value).trim();
}

function requirePositiveNumber_(value, label) {
  var nextValue = Number(value);
  if (!isFinite(nextValue) || nextValue <= 0) {
    throw new Error(label + " harus lebih besar dari 0.");
  }
  return nextValue;
}

function requireNonNegativeNumber_(value, label) {
  var nextValue = Number(value);
  if (!isFinite(nextValue) || nextValue < 0) {
    throw new Error(label + " tidak valid.");
  }
  return nextValue;
}

function parseJson_(body) {
  if (!body) {
    throw new Error("Body request kosong.");
  }
  return JSON.parse(body);
}

function param_(e, key) {
  return e && e.parameter ? e.parameter[key] : "";
}

function signedAmount_(type, amount) {
  return type === "income" ? Number(amount) : -Number(amount);
}

function sumBy_(rows, key) {
  return rows.reduce(function (sum, row) {
    return sum + Number(row[key] || 0);
  }, 0);
}

function createId_(prefix) {
  return prefix + "_" + Utilities.getUuid().split("-")[0];
}

function nowIso_() {
  return new Date().toISOString();
}

function ok_(data) {
  return jsonOutput_({
    success: true,
    data: data,
  });
}

function withErrorHandling_(callback) {
  try {
    return callback();
  } catch (error) {
    return jsonOutput_({
      success: false,
      error: error && error.message ? error.message : String(error),
      data: null,
    });
  }
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
