import React, { useState, useRef } from "react";
import { Transaction, UserProfile, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "../types";
import { normalizeCategory } from "../utils";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import {
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Trash2,
  Edit2,
  Eye,
  X,
  Upload,
  Image as ImageIcon,
  Check,
  Calendar,
  DollarSign,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface TransactionsListProps {
  transactions: Transaction[];
  userProfile: UserProfile | null;
  onRefresh: () => void;
  quickAddType?: "income" | "expense" | null;
  setQuickAddType?: (type: "income" | "expense" | null) => void;
}

export default function TransactionsList({
  transactions,
  userProfile,
  onRefresh,
  quickAddType = null,
  setQuickAddType
}: TransactionsListProps) {
  // State variables
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [viewMode, setViewMode] = useState<"table" | "grouped">("grouped");
  const [expandedDates, setExpandedDates] = useState<{[key: string]: boolean}>({});

  const toggleDateExpanded = (dateStr: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  // Add/Edit Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addFormType, setAddFormType] = useState<"income" | "expense">("income");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // View Modal state
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewTransaction, setViewTransaction] = useState<Transaction | null>(null);

  // Group selection state for editing/deletion when a day/container has multiple transactions
  const [selectedGroupTransactions, setSelectedGroupTransactions] = useState<Transaction[]>([]);
  const [isGroupEditModalOpen, setIsGroupEditModalOpen] = useState(false);
  const [isGroupDeleteModalOpen, setIsGroupDeleteModalOpen] = useState(false);

  // State for Custom Confirmation Modal
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    onCancel: () => {},
  });

  // Form Fields
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formCustomCategory, setFormCustomCategory] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formRecordedBy, setFormRecordedBy] = useState(userProfile?.name || "");
  const [formReceipt, setFormReceipt] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);

  // States for batch income rows
  const [incomeRows, setIncomeRows] = useState([
    { category: INCOME_CATEGORIES[0] as string, amount: "" },
    { category: INCOME_CATEGORIES[1] as string, amount: "" },
    { category: INCOME_CATEGORIES[2] as string, amount: "" },
  ]);
  const [otherIncomeRow, setOtherIncomeRow] = useState({ category: "", amount: "" });

  // States for batch expense rows
  const [expenseRows, setExpenseRows] = useState([
    { category: "", amount: "" },
    { category: "", amount: "" },
    { category: "", amount: "" },
  ]);
  const [otherExpenseRow, setOtherExpenseRow] = useState({ category: "", amount: "" });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-trigger quick add modal if requested from Dashboard
  React.useEffect(() => {
    if (quickAddType) {
      openAddModal(quickAddType);
      if (setQuickAddType) {
        setQuickAddType(null);
      }
    }
  }, [quickAddType]);

  const canEdit = userProfile?.role === "admin" || userProfile?.role === "treasurer" || userProfile?.role === "chairman";
  const canDelete = userProfile?.role === "admin" || userProfile?.role === "chairman";

  // Helpers to reset form
  const resetForm = (type: "income" | "expense") => {
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormAmount("");
    setFormCategory(type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
    setFormCustomCategory("");
    setFormDescription("");
    setFormRecordedBy(userProfile?.name || "");
    setFormReceipt(null);
    setIncomeRows([
      { category: INCOME_CATEGORIES[0] as string, amount: "" },
      { category: INCOME_CATEGORIES[1] as string, amount: "" },
      { category: INCOME_CATEGORIES[2] as string, amount: "" },
    ]);
    setOtherIncomeRow({ category: "", amount: "" });
    setExpenseRows([
      { category: "", amount: "" },
      { category: "", amount: "" },
      { category: "", amount: "" },
    ]);
    setOtherExpenseRow({ category: "", amount: "" });
  };

  const openAddModal = (type: "income" | "expense") => {
    if (userProfile?.disableTransactionButtons) return;
    setAddFormType(type);
    resetForm(type);
    setIsAddOpen(true);
  };

  const openEditModal = (t: Transaction) => {
    setSelectedTransaction(t);
    setFormDate(t.date);
    setFormAmount(t.amount.toString());
    
    const isPredefined = t.type === "income"
      ? (INCOME_CATEGORIES as readonly string[]).includes(t.category)
      : (EXPENSE_CATEGORIES as readonly string[]).includes(t.category);
    
    if (isPredefined) {
      setFormCategory(t.category);
      setFormCustomCategory("");
    } else {
      setFormCategory("Other");
      setFormCustomCategory(t.category);
    }

    setFormDescription(t.description);
    setFormRecordedBy(t.recordedBy);
    setFormReceipt(t.receiptImage || null);
    setIsEditOpen(true);
  };

  const handleViewDetails = (t: Transaction) => {
    setViewTransaction(t);
    setIsViewOpen(true);
  };

  // Compressed Image Conversion (to keep Base64 small inside Firestore)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadProgress(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Draw image to Canvas to resize & compress it
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        // Convert canvas image to small Base64 JPEG (60% quality)
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
        setFormReceipt(compressedBase64);
        setUploadProgress(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Submit Handler: CREATE Transaction
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (addFormType === "income") {
      const validEntries: { category: string; amount: number }[] = [];

      // Check predefined rows
      incomeRows.forEach((row) => {
        const amt = parseFloat(row.amount);
        if (row.amount && !isNaN(amt) && amt > 0) {
          validEntries.push({
            category: normalizeCategory(row.category),
            amount: amt,
          });
        }
      });

      // Check other row
      const otherAmt = parseFloat(otherIncomeRow.amount);
      if (otherIncomeRow.category.trim() && otherIncomeRow.amount && !isNaN(otherAmt) && otherAmt > 0) {
        validEntries.push({
          category: normalizeCategory(otherIncomeRow.category),
          amount: otherAmt,
        });
      }

      if (validEntries.length === 0) {
        return;
      }

      try {
        const batchPromises = validEntries.map((entry) => {
          const newTransaction = {
            type: "income" as const,
            date: formDate,
            amount: entry.amount,
            category: entry.category,
            description: "",
            recordedBy: formRecordedBy || userProfile?.name || "System",
            recordedByUid: userProfile?.uid || "",
            receiptImage: "",
            organizationName: userProfile?.organizationName || "Personal Ledger",
            createdAt: new Date().toISOString()
          };
          return addDoc(collection(db, "transactions"), newTransaction);
        });

        await Promise.all(batchPromises);
        setIsAddOpen(false);
        onRefresh();
      } catch (err) {
        console.error("Failed to add batch income transactions:", err);
        handleFirestoreError(err, OperationType.CREATE, "transactions");
      }
    } else {
      const validEntries: { category: string; amount: number }[] = [];

      // Check custom text rows for expenses
      expenseRows.forEach((row) => {
        const amt = parseFloat(row.amount);
        if (row.category.trim() && row.amount && !isNaN(amt) && amt > 0) {
          validEntries.push({
            category: normalizeCategory(row.category),
            amount: amt,
          });
        }
      });

      // Check other row
      const otherAmt = parseFloat(otherExpenseRow.amount);
      if (otherExpenseRow.category.trim() && otherExpenseRow.amount && !isNaN(otherAmt) && otherAmt > 0) {
        validEntries.push({
          category: normalizeCategory(otherExpenseRow.category),
          amount: otherAmt,
        });
      }

      if (validEntries.length === 0) {
        return;
      }

      try {
        const batchPromises = validEntries.map((entry) => {
          const newTransaction = {
            type: "expense" as const,
            date: formDate,
            amount: entry.amount,
            category: entry.category,
            description: "",
            recordedBy: formRecordedBy || userProfile?.name || "System",
            recordedByUid: userProfile?.uid || "",
            receiptImage: formReceipt || "",
            organizationName: userProfile?.organizationName || "Personal Ledger",
            createdAt: new Date().toISOString()
          };
          return addDoc(collection(db, "transactions"), newTransaction);
        });

        await Promise.all(batchPromises);
        setIsAddOpen(false);
        onRefresh();
      } catch (err) {
        console.error("Failed to add batch expense transactions:", err);
        handleFirestoreError(err, OperationType.CREATE, "transactions");
      }
    }
  };

  // Submit Handler: UPDATE Transaction
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransaction || !formAmount || isNaN(Number(formAmount))) return;

    const rawCategory = (selectedTransaction.type === "income" && formCustomCategory.trim())
      ? formCustomCategory.trim()
      : formCategory;
    const finalCategory = normalizeCategory(rawCategory);

    try {
      const transRef = doc(db, "transactions", selectedTransaction.id);
      await updateDoc(transRef, {
        date: formDate,
        amount: parseFloat(formAmount),
        category: finalCategory,
        description: selectedTransaction.type === "income" ? "" : formDescription,
        recordedBy: formRecordedBy,
        receiptImage: formReceipt || ""
      });
      setIsEditOpen(false);
      setSelectedTransaction(null);
      onRefresh();
    } catch (err) {
      console.error("Failed to update transaction:", err);
      handleFirestoreError(err, OperationType.UPDATE, `transactions/${selectedTransaction.id}`);
    }
  };

  // Action Handler: DELETE Transaction
  const handleDelete = async (id: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setDeleteConfirm({
        isOpen: true,
        title: "Permanently Delete Entry?",
        message: "Are you sure you want to permanently remove this transaction from the ledger? This action cannot be undone.",
        onConfirm: async () => {
          try {
            await deleteDoc(doc(db, "transactions", id));
            onRefresh();
            setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
            resolve(true);
          } catch (err) {
            console.error("Failed to delete transaction:", err);
            handleFirestoreError(err, OperationType.DELETE, `transactions/${id}`);
            setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
            resolve(false);
          }
        },
        onCancel: () => {
          setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
          resolve(false);
        }
      });
    });
  };

  // Filtering Logic
  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.recordedBy.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === "all" || t.type === typeFilter;

    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;

    return matchesSearch && matchesType && matchesCategory;
  });

  // Pagination Calculations
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const sortedFilteredTransactions = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
  const currentItems = sortedFilteredTransactions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  // Helper to detect day of the week
  const getDayOfWeek = (dateString: string) => {
    const parts = dateString.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString("en-US", { weekday: "long" });
    }
    return "";
  };

  // Grouped by Date calculations
  const groups: { [key: string]: Transaction[] } = {};
  filteredTransactions.forEach((t) => {
    if (!groups[t.date]) {
      groups[t.date] = [];
    }
    groups[t.date].push(t);
  });

  const sortedDates = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  const groupsPerPage = 4;
  const totalGroupPages = Math.ceil(sortedDates.length / groupsPerPage);
  const currentGroupPage = Math.min(currentPage, totalGroupPages || 1);
  const paginatedDates = sortedDates.slice(
    (currentGroupPage - 1) * groupsPerPage,
    currentGroupPage * groupsPerPage
  );

  const formatCurrency = (amount: number) => {
    try {
      return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (e) {
      return "₦" + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };

  return (
    <div className="space-y-6">
      {/* Upper header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] sm:text-2xl font-bold text-slate-950 tracking-tight font-sans">
            {userProfile?.role === "admin" 
              ? "Admin Church Transactions Ledger" 
              : userProfile?.role === "treasurer" 
                ? "Treasurer Church Transactions Ledger" 
                : "Church Transactions Ledger"}
          </h1>
          <p className="text-[16px] sm:text-sm text-slate-500">
            View, audit, search, and manage all church income collections and operational expense payouts.
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => !userProfile?.disableTransactionButtons && openAddModal("income")}
              disabled={userProfile?.disableTransactionButtons}
              className={`px-4 py-2 text-white rounded font-medium shadow-sm flex items-center gap-2 text-xs transition-colors ${
                userProfile?.disableTransactionButtons
                  ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60"
                  : "bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
              }`}
            >
              <span className="text-sm leading-none font-bold">+</span> Add Income
            </button>
            <button
              onClick={() => !userProfile?.disableTransactionButtons && openAddModal("expense")}
              disabled={userProfile?.disableTransactionButtons}
              className={`px-4 py-2 text-white rounded font-medium shadow-sm flex items-center gap-2 text-xs transition-colors ${
                userProfile?.disableTransactionButtons
                  ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60"
                  : "bg-rose-600 hover:bg-rose-700 cursor-pointer"
              }`}
            >
              <span className="text-sm leading-none font-bold">+</span> Record Expense
            </button>
          </div>
        )}
      </div>

      {/* Filters and Search Bar Section */}
      <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search descriptions, authors, categories..."
            className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-900"
          />
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
          <button
            onClick={() => {
              setTypeFilter("all");
              setCategoryFilter("all");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 text-2xs font-bold rounded-lg transition-all cursor-pointer ${
              typeFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            All Ledger
          </button>
          <button
            onClick={() => {
              setTypeFilter("income");
              setCategoryFilter("all");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 text-2xs font-bold rounded-lg transition-all cursor-pointer ${
              typeFilter === "income" ? "bg-white text-emerald-600 shadow-xs" : "text-slate-500 hover:text-emerald-600"
            }`}
          >
            Incomes
          </button>
          <button
            onClick={() => {
              setTypeFilter("expense");
              setCategoryFilter("all");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 text-2xs font-bold rounded-lg transition-all cursor-pointer ${
              typeFilter === "expense" ? "bg-white text-red-600 shadow-xs" : "text-slate-500 hover:text-red-600"
            }`}
          >
            Expenses
          </button>
        </div>

        {/* Category Filter */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
            <Filter className="h-3 w-3 text-slate-400" />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="block w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-2xs font-semibold bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
          >
            <option value="all">All Categories</option>
            {typeFilter !== "expense" &&
              INCOME_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            {typeFilter !== "income" &&
              EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 sm:ml-auto">
          <button
            onClick={() => {
              setViewMode("grouped");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 text-2xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === "grouped"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
            title="Group collections by date"
          >
            <Calendar className="h-3.5 w-3.5" />
            Sunday Containers
          </button>
          <button
            onClick={() => {
              setViewMode("table");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 text-2xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === "table"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
            title="Standard list layout"
          >
            <FileText className="h-3.5 w-3.5" />
            Flat Table
          </button>
        </div>
      </div>

      {/* Transactions Grid / Table */}
      {viewMode === "table" ? (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="px-6 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Type / Category
                  </th>
                  <th className="px-6 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Author
                  </th>
                  <th className="px-6 py-3 text-right text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-center text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 text-xs">
                      No transactions found matching your filters.
                    </td>
                  </tr>
                ) : (
                  currentItems.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                              t.type === "income"
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-red-50 text-red-600"
                            }`}
                          >
                            {t.type === "income" ? (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800">
                              {t.category}
                            </span>
                            {t.description && (
                              <span className="text-4xs font-bold uppercase text-slate-400 tracking-wider">
                                {t.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-600 font-medium">
                        {t.description || "—"}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-medium">
                        {t.date}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">
                            {t.recordedBy}
                          </span>
                          <span className="text-4xs text-slate-400">Recorded In</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span
                          className={`text-xs font-extrabold ${
                            t.type === "income" ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {t.type === "income" ? "+" : "-"}
                          {formatCurrency(t.amount)}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          {canEdit && (
                            <button
                              onClick={() => openEditModal(t)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Record"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(t.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Nav */}
          {totalPages > 1 && (
            <div className="bg-slate-50/50 px-6 py-3 flex items-center justify-between border-t border-slate-100">
              <span className="text-2xs font-semibold text-slate-500">
                Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredTransactions.length)} of{" "}
                {filteredTransactions.length} records
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="px-2.5 py-1 text-2xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  Prev
                </button>
                <span className="text-2xs font-bold text-slate-700 px-2">
                  {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="px-2.5 py-1 text-2xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Grouped Containers View */
        <div className="space-y-6">
          {paginatedDates.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 text-xs">
              No collections or payments found matching your filters.
            </div>
          ) : (
            paginatedDates.map((dateStr) => {
              const dayName = getDayOfWeek(dateStr);
              const isSunday = dayName === "Sunday";
              const dateTrans = groups[dateStr];

              const uniqueAuthors = Array.from(new Set(dateTrans.map((t) => t.recordedBy).filter(Boolean)));
              const isSingleAuthor = uniqueAuthors.length === 1;
              const singleAuthorName = uniqueAuthors[0] || "";

              const dayIncome = dateTrans
                .filter((t) => t.type === "income")
                .reduce((sum, t) => sum + t.amount, 0);
              const dayExpense = dateTrans
                .filter((t) => t.type === "expense")
                .reduce((sum, t) => sum + t.amount, 0);

              return (
                <div
                  key={dateStr}
                  className={`bg-white border ${
                    isSunday ? "border-blue-200/80 shadow-xs ring-1 ring-blue-50" : "border-slate-100"
                  } rounded-2xl overflow-hidden`}
                >
                  {/* Container Header (Click to expand/collapse Sunday/Daily lists) */}
                  <div
                    onClick={() => toggleDateExpanded(dateStr)}
                    className={`${
                      isSunday
                        ? "bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50/20 hover:from-blue-100/60 hover:to-slate-100/40"
                        : "bg-slate-50/50 hover:bg-slate-100/40"
                    } px-5 py-3.5 border-b ${
                      isSunday ? "border-blue-100/50" : "border-slate-100"
                    } flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer transition-colors select-none`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`h-9 w-9 rounded-xl flex items-center justify-center text-base ${
                          isSunday
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {isSunday ? "⛪" : "📅"}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          {isSunday ? "Sunday Service Collections" : "Weekday Records"}
                          <span className="px-2 py-0.5 text-[10px] bg-white border border-slate-200/80 rounded-md font-bold text-slate-600">
                            {dayName}, {dateStr}
                          </span>
                        </h4>
                        {isSingleAuthor && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                            <User className="h-3 w-3 text-slate-400" />
                            <span>Logged By: {singleAuthorName}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                      <div className="flex items-center gap-3 text-2xs font-extrabold">
                        {dayIncome > 0 && (
                          <div className="bg-emerald-50 text-emerald-700 border border-emerald-100/60 px-2.5 py-1 rounded-lg">
                            <span className="text-[9px] uppercase font-bold text-emerald-600 mr-1">In:</span>
                            +{formatCurrency(dayIncome)}
                          </div>
                        )}
                        {dayExpense > 0 && (
                          <div className="bg-rose-50 text-rose-700 border border-rose-100/60 px-2.5 py-1 rounded-lg">
                            <span className="text-[9px] uppercase font-bold text-rose-600 mr-1">Out:</span>
                            -{formatCurrency(dayExpense)}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {canEdit && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (dateTrans.length === 1) {
                                openEditModal(dateTrans[0]);
                              } else {
                                setSelectedGroupTransactions(dateTrans);
                                setIsGroupEditModalOpen(true);
                              }
                            }}
                            className="p-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200/50 transition-colors cursor-pointer flex items-center justify-center"
                            title="Edit entry/entries for this date"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (dateTrans.length === 1) {
                                await handleDelete(dateTrans[0].id);
                              } else {
                                // For multiple records, open the group delete selection modal directly (which has a "Delete All" button inside it)
                                setSelectedGroupTransactions(dateTrans);
                                setIsGroupDeleteModalOpen(true);
                              }
                            }}
                            className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200/50 transition-colors cursor-pointer flex items-center justify-center"
                            title="Delete entry/entries for this date"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}

                        <div className="text-slate-400 p-1.5 bg-white hover:bg-slate-50 rounded-lg border border-slate-200/80 transition-colors shadow-3xs flex items-center justify-center">
                          {expandedDates[dateStr] ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Container List of Items */}
                  {expandedDates[dateStr] && (
                    <div className="divide-y divide-slate-100 bg-slate-50/10">
                      {dateTrans.map((t) => (
                        <React.Fragment key={t.id}>
                          {/* MOBILE-ONLY VIEW CARD (Professional, Clean, Large Touch Targets) */}
                          <div className="p-4 flex flex-col gap-3.5 sm:hidden hover:bg-slate-50/30 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div
                                  className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    t.type === "income"
                                      ? "bg-emerald-50 text-emerald-600"
                                      : "bg-red-50 text-red-600"
                                  }`}
                                >
                                  {t.type === "income" ? (
                                    <ArrowUpRight className="h-4 w-4" />
                                  ) : (
                                    <ArrowDownRight className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-xs font-bold text-slate-800 truncate">
                                      {t.category}
                                    </h5>
                                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                      ID: {t.id ? t.id.slice(0, 8) : "N/A"}
                                    </span>
                                  </div>
                                  {t.description && (
                                    <span
                                      className="inline-block text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md mt-0.5 bg-slate-100 text-slate-600 border border-slate-200/50 max-w-full truncate"
                                    >
                                      {t.description}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <span
                                className={`text-sm font-black shrink-0 ${
                                  t.type === "income" ? "text-emerald-600" : "text-red-600"
                                }`}
                              >
                                {t.type === "income" ? "+" : "-"}
                                {formatCurrency(t.amount)}
                              </span>
                            </div>

                            {!isSingleAuthor && (
                              <div className="flex items-center gap-1 text-4xs uppercase tracking-wider font-bold text-slate-400 mt-0.5 px-0.5">
                                <User className="h-3 w-3 text-slate-400" />
                                <span>By: {t.recordedBy}</span>
                              </div>
                            )}

                            {/* Mobile Large Touch Action Buttons Bar (Min 40px Height & comfortable padding) */}
                            {(canEdit || canDelete) && (
                              <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-100/50">
                                {canEdit && (
                                  <button
                                    onClick={() => openEditModal(t)}
                                    className="flex-1 min-h-[40px] rounded-xl text-amber-600 bg-amber-50/40 active:bg-amber-100 hover:bg-amber-50/80 flex items-center justify-center gap-2 transition-colors cursor-pointer border border-amber-100/20 text-2xs font-bold"
                                    title="Edit record"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                    Edit Entry
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    onClick={() => handleDelete(t.id)}
                                    className="flex-1 min-h-[40px] rounded-xl text-red-600 bg-red-50/40 active:bg-red-100 hover:bg-red-50/80 flex items-center justify-center gap-2 transition-colors cursor-pointer border border-red-100/20 text-2xs font-bold"
                                    title="Delete record"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete Entry
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* DESKTOP-ONLY VIEW ROW (Streamlined, compact table-style list item) */}
                          <div
                            className="hidden sm:flex sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50/20 transition-colors"
                          >
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div
                                className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                  t.type === "income"
                                    ? "bg-emerald-50 text-emerald-600"
                                    : "bg-red-50 text-red-600"
                                }`}
                              >
                                {t.type === "income" ? (
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                ) : (
                                  <ArrowDownRight className="h-3.5 w-3.5" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold text-slate-800">
                                    {t.category}
                                  </span>
                                  {t.description && (
                                    <span
                                      className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 border border-slate-200/50"
                                    >
                                      {t.description}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-6">
                              {!isSingleAuthor && (
                                <div className="text-left sm:text-right shrink-0">
                                  <span className="block text-[10px] font-bold text-slate-700">
                                    {t.recordedBy}
                                  </span>
                                  <span className="block text-[8px] text-slate-400">Author</span>
                                </div>
                              )}

                              <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                ID: {t.id ? t.id.slice(0, 8) : "N/A"}
                              </span>

                              <div className="flex items-center gap-4">
                                <span
                                  className={`text-xs font-black shrink-0 ${
                                    t.type === "income" ? "text-emerald-600" : "text-red-600"
                                  }`}
                                >
                                  {t.type === "income" ? "+" : "-"}
                                  {formatCurrency(t.amount)}
                                </span>

                                <div className="flex items-center gap-1 shrink-0">
                                  {canEdit && (
                                    <button
                                      onClick={() => openEditModal(t)}
                                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                      title="Edit Record"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      onClick={() => handleDelete(t.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                      title="Delete Record"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Grouped Pagination Controls */}
          {totalGroupPages > 1 && (
            <div className="bg-white border border-slate-100 px-6 py-3 rounded-2xl shadow-2xs flex items-center justify-center gap-2">
              <button
                disabled={currentGroupPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-2 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-colors flex items-center justify-center"
                title="Previous Day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-2xs sm:text-xs font-bold text-slate-700 px-3">
                {currentGroupPage} of {totalGroupPages}
              </span>
              <button
                disabled={currentGroupPage === totalGroupPages}
                onClick={() => setCurrentPage((p) => Math.min(totalGroupPages, p + 1))}
                className="p-2 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-colors flex items-center justify-center"
                title="Next Day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: ADD Transaction */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                {addFormType === "income" ? (
                  <>
                    <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                    Record Church Income
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="h-5 w-5 text-red-600" />
                    Record Church Expense
                  </>
                )}
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
              {addFormType === "income" ? (
                // INCOME FORM
                <>
                  {/* Date */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase">
                      Date
                    </label>
                    <div className="mt-1 relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <input
                        type="date"
                        required
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="block w-full pl-8 pr-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Category & Amount rows */}
                  <div className="space-y-3">
                    {/* Headers */}
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-6">
                        <span className="text-2xs font-bold text-slate-500 uppercase">Category</span>
                      </div>
                      <div className="col-span-5">
                        <span className="text-2xs font-bold text-slate-500 uppercase">Amount (₦)</span>
                      </div>
                      <div className="col-span-1"></div>
                    </div>

                    {/* Dynamic rows */}
                    {incomeRows.map((row, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-6">
                          <input
                            type="text"
                            placeholder="e.g. Tithe, Donation..."
                            value={row.category}
                            onChange={(e) => {
                              const updated = [...incomeRows];
                              updated[index].category = e.target.value;
                              setIncomeRows(updated);
                            }}
                            className="block w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                          />
                        </div>
                        <div className="col-span-5">
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                              ₦
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={row.amount}
                              onChange={(e) => {
                                const updated = [...incomeRows];
                                updated[index].amount = e.target.value;
                                setIncomeRows(updated);
                              }}
                              className="block w-full pl-6 pr-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800 font-bold"
                            />
                          </div>
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {incomeRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = incomeRows.filter((_, i) => i !== index);
                                setIncomeRows(updated);
                              }}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove Log"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Add Another Log Button with Add Icon */}
                    <button
                      type="button"
                      onClick={() => {
                        setIncomeRows([...incomeRows, { category: "", amount: "" }]);
                      }}
                      className="w-full py-2 mt-1 border border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/50 rounded-xl text-2xs font-bold text-emerald-700 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Another Log
                    </button>
                  </div>

                  {/* Person Recording */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase">
                      Person Recording
                    </label>
                    <div className="mt-1 relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={formRecordedBy}
                        onChange={(e) => setFormRecordedBy(e.target.value)}
                        className="block w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                      />
                    </div>
                  </div>
                </>
              ) : (
                // EXPENSE FORM
                <>
                  {/* Date */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase">
                      Date
                    </label>
                    <div className="mt-1 relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <input
                        type="date"
                        required
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="block w-full pl-8 pr-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Category & Amount rows */}
                  <div className="space-y-3">
                    {/* Headers */}
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-7">
                        <span className="text-2xs font-bold text-slate-500 uppercase">Category</span>
                      </div>
                      <div className="col-span-5">
                        <span className="text-2xs font-bold text-slate-500 uppercase">Amount (₦)</span>
                      </div>
                    </div>

                    {/* Custom rows */}
                    {expenseRows.map((row, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-7">
                          <input
                            type="text"
                            placeholder={`Category ${index + 1}...`}
                            value={row.category}
                            onChange={(e) => {
                              const updated = [...expenseRows];
                              updated[index].category = e.target.value;
                              setExpenseRows(updated);
                            }}
                            className="block w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                          />
                        </div>
                        <div className="col-span-5">
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                              ₦
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={row.amount}
                              onChange={(e) => {
                                const updated = [...expenseRows];
                                updated[index].amount = e.target.value;
                                setExpenseRows(updated);
                              }}
                              className="block w-full pl-6 pr-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800 font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Other category and Amount row */}
                    <div className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-7">
                        <input
                          type="text"
                          placeholder="Other Category..."
                          value={otherExpenseRow.category}
                          onChange={(e) => {
                            setOtherExpenseRow({
                              ...otherExpenseRow,
                              category: e.target.value
                            });
                          }}
                          className="block w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                        />
                      </div>
                      <div className="col-span-5">
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                            ₦
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={otherExpenseRow.amount}
                            onChange={(e) => {
                              setOtherExpenseRow({
                                ...otherExpenseRow,
                                amount: e.target.value
                              });
                            }}
                            className="block w-full pl-6 pr-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800 font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>


                  {/* Recorder Profile Info */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase">
                      Person Recording
                    </label>
                    <div className="mt-1 relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={formRecordedBy}
                        onChange={(e) => setFormRecordedBy(e.target.value)}
                        className="block w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Receipt Upload */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase mb-1">
                      Receipt Photo
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-slate-200 hover:border-blue-500 bg-slate-50 rounded-xl text-2xs font-bold text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Choose Receipt
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                      />

                      {uploadProgress && <span className="text-3xs text-slate-400">Loading...</span>}

                      {formReceipt && (
                        <span className="flex items-center gap-1 text-3xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                          <ImageIcon className="h-3 w-3" />
                          Uploaded Image
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Submit Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3.5 py-1.5 text-2xs font-bold text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-2xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                >
                  Record Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT Transaction */}
      {isEditOpen && selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Edit2 className="h-4 w-4 text-amber-500" />
                Edit Ledger Record ({selectedTransaction.type === "income" ? "Income" : "Expense"})
              </h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              {selectedTransaction.type === "income" ? (
                // EDIT INCOME FORM
                <>
                  {/* Date */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase">
                      Date
                    </label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                    />
                  </div>

                  {/* Category - Amount side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Category Selection */}
                    <div>
                      <label className="block text-2xs font-bold text-slate-500 uppercase">
                        Category
                      </label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="mt-1 block w-full py-1.5 px-3 border border-slate-200 bg-white rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                      >
                        {INCOME_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="block text-2xs font-bold text-slate-500 uppercase">
                        Amount (₦)
                      </label>
                      <div className="mt-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                          ₦
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          required
                          min="0.01"
                          value={formAmount}
                          onChange={(e) => setFormAmount(e.target.value)}
                          className="block w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-slate-800"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Input for others not in categorylist */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase">
                      Other Category
                    </label>
                    <p className="text-[10px] text-slate-400 mb-1">
                      Specify custom category if not in the list.
                    </p>
                    <input
                      type="text"
                      placeholder="e.g. Special Offering..."
                      value={formCustomCategory}
                      onChange={(e) => setFormCustomCategory(e.target.value)}
                      className="block w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                    />
                  </div>

                  {/* Person Recording */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase">
                      Person Recording
                    </label>
                    <input
                      type="text"
                      required
                      value={formRecordedBy}
                      onChange={(e) => setFormRecordedBy(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                    />
                  </div>
                </>
              ) : (
                // EDIT EXPENSE FORM
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Date */}
                    <div>
                      <label className="block text-2xs font-bold text-slate-500 uppercase">
                        Date
                      </label>
                      <input
                        type="date"
                        required
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="mt-1 block w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                      />
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="block text-2xs font-bold text-slate-500 uppercase">
                        Amount (₦)
                      </label>
                      <div className="mt-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                          ₦
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          required
                          min="0.01"
                          value={formAmount}
                          onChange={(e) => setFormAmount(e.target.value)}
                          className="block w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-slate-800"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase">
                      Category
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Repairs & Maintenance..."
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase">
                      Description
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                    />
                  </div>

                  {/* Person Recording */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase">
                      Person Recording
                    </label>
                    <input
                      type="text"
                      required
                      value={formRecordedBy}
                      onChange={(e) => setFormRecordedBy(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                    />
                  </div>

                  {/* Receipt Photo */}
                  <div>
                    <label className="block text-2xs font-bold text-slate-500 uppercase mb-1">
                      Receipt Photo
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-slate-200 hover:border-amber-500 bg-slate-50 rounded-xl text-2xs font-bold text-slate-600 hover:text-amber-600 transition-colors cursor-pointer"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Update Photo
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                      />

                      {uploadProgress && <span className="text-3xs text-slate-400">Loading...</span>}

                      {formReceipt && (
                        <span className="flex items-center gap-1 text-3xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                          <ImageIcon className="h-3 w-3" />
                          Uploaded Image
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Submit Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditOpen(false);
                    setSelectedTransaction(null);
                  }}
                  className="px-3.5 py-1.5 text-2xs font-bold text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-2xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW Details (Invoice-style) */}
      {isViewOpen && viewTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="h-5 w-5 text-blue-600" />
                Ledger Transaction Details
              </h3>
              <button
                onClick={() => setIsViewOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex flex-col">
                  <span className="text-3xs text-slate-400 font-bold uppercase tracking-wider">
                    Transaction ID
                  </span>
                  <span className="text-2xs text-slate-500 font-mono">
                    {viewTransaction.id}
                  </span>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-4xs font-bold uppercase tracking-wider border ${
                    viewTransaction.type === "income"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : "bg-red-50 text-red-700 border-red-100"
                  }`}
                >
                  {viewTransaction.type}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                <div>
                  <span className="block text-4xs font-bold text-slate-400 uppercase tracking-wider">
                    Category
                  </span>
                  <span className="text-slate-800 font-bold text-sm">
                    {viewTransaction.category}
                  </span>
                </div>

                <div>
                  <span className="block text-4xs font-bold text-slate-400 uppercase tracking-wider">
                    Date
                  </span>
                  <span className="text-slate-700 text-sm">
                    {viewTransaction.date}
                  </span>
                </div>

                <div>
                  <span className="block text-4xs font-bold text-slate-400 uppercase tracking-wider">
                    Recorded By
                  </span>
                  <span className="text-slate-700">
                    {viewTransaction.recordedBy}
                  </span>
                </div>

                <div>
                  <span className="block text-4xs font-bold text-slate-400 uppercase tracking-wider">
                    Ledger Balance Impact
                  </span>
                  <span
                    className={`text-sm font-black ${
                      viewTransaction.type === "income" ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {viewTransaction.type === "income" ? "+" : "-"}
                    {formatCurrency(viewTransaction.amount)}
                  </span>
                </div>
              </div>

              {viewTransaction.type === "expense" && (
                <div className="border-t border-slate-100 pt-3">
                  <span className="block text-4xs font-bold text-slate-400 uppercase tracking-wider">
                    Description / Notes
                  </span>
                  <p className="mt-1 text-xs text-slate-600 font-medium">
                    {viewTransaction.description || "No descriptions or remarks logged for this transaction."}
                  </p>
                </div>
              )}

              {/* Receipt Visualizer (ONLY IF PRESENT) */}
              {viewTransaction.type === "expense" && (
                <div className="border-t border-slate-100 pt-3">
                  <span className="block text-4xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Attached Receipt Document
                  </span>
                  {viewTransaction.receiptImage ? (
                    <div className="border border-slate-100 rounded-xl overflow-hidden max-h-48 flex justify-center bg-slate-50">
                      <img
                        src={viewTransaction.receiptImage}
                        alt="Expense Receipt"
                        referrerPolicy="no-referrer"
                        className="object-contain h-full max-h-48 w-full p-2"
                      />
                    </div>
                  ) : (
                    <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center text-3xs text-slate-400 font-medium">
                      No receipt scan attached to this expense entry.
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setIsViewOpen(false)}
                  className="px-4 py-1.5 text-2xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Close Receipt View
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GROUP EDIT SELECTION */}
      {isGroupEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Edit2 className="h-4 w-4 text-amber-600" />
                Select Entry to Edit
              </h3>
              <button
                onClick={() => {
                  setIsGroupEditModalOpen(false);
                  setSelectedGroupTransactions([]);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-2xs text-slate-500 font-medium">
                This date has multiple records. Please select which entry you would like to edit:
              </p>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/20 max-h-60 overflow-y-auto">
                {selectedGroupTransactions.map((t) => (
                  <div key={t.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                          t.type === "income" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}>
                          {t.type}
                        </span>
                        <span className="text-xs font-bold text-slate-800 truncate">
                          {t.category}
                        </span>
                      </div>
                      {t.description && (
                        <p className="text-2xs text-slate-500 mt-0.5 truncate">{t.description}</p>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                        Amount: {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount)}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setIsGroupEditModalOpen(false);
                        openEditModal(t);
                      }}
                      className="px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-2xs font-bold transition-all cursor-pointer flex items-center gap-1 border border-amber-200/40"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => {
                  setIsGroupEditModalOpen(false);
                  setSelectedGroupTransactions([]);
                }}
                className="px-3.5 py-1.5 text-2xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GROUP DELETE SELECTION */}
      {isGroupDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Trash2 className="h-4 w-4 text-red-600" />
                Select Entry to Delete
              </h3>
              <button
                onClick={() => {
                  setIsGroupDeleteModalOpen(false);
                  setSelectedGroupTransactions([]);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-2xs text-slate-500 font-medium">
                This date has multiple records. Please select which entry you would like to delete:
              </p>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/20 max-h-60 overflow-y-auto">
                {selectedGroupTransactions.map((t) => (
                  <div key={t.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                          t.type === "income" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}>
                          {t.type}
                        </span>
                        <span className="text-xs font-bold text-slate-800 truncate">
                          {t.category}
                        </span>
                      </div>
                      {t.description && (
                        <p className="text-2xs text-slate-500 mt-0.5 truncate">{t.description}</p>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                        Amount: {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount)}
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        const success = await handleDelete(t.id);
                        if (success) {
                          const remaining = selectedGroupTransactions.filter((gt) => gt.id !== t.id);
                          if (remaining.length === 0) {
                            setIsGroupDeleteModalOpen(false);
                            setSelectedGroupTransactions([]);
                          } else {
                            setSelectedGroupTransactions(remaining);
                          }
                        }
                      }}
                      className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-2xs font-bold transition-all cursor-pointer flex items-center gap-1 border border-red-200/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-between gap-2">
              {canDelete && (
                <button
                  onClick={() => {
                    setDeleteConfirm({
                      isOpen: true,
                      title: "Delete All Entries?",
                      message: `Are you absolutely sure you want to permanently delete all ${selectedGroupTransactions.length} transactions on this date? This action cannot be undone.`,
                      onConfirm: async () => {
                        try {
                          for (const t of selectedGroupTransactions) {
                            await deleteDoc(doc(db, "transactions", t.id));
                          }
                          onRefresh();
                          setIsGroupDeleteModalOpen(false);
                          setSelectedGroupTransactions([]);
                          setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
                        } catch (err) {
                          console.error("Failed to delete all transactions for date:", err);
                          setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
                        }
                      },
                      onCancel: () => {
                        setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
                      }
                    });
                  }}
                  className="px-3.5 py-1.5 text-2xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl cursor-pointer transition-colors flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete All ({selectedGroupTransactions.length})
                </button>
              )}
              <button
                onClick={() => {
                  setIsGroupDeleteModalOpen(false);
                  setSelectedGroupTransactions([]);
                }}
                className="px-3.5 py-1.5 text-2xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRM MODAL */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-50 text-red-600 rounded-xl">
                  <Trash2 className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {deleteConfirm.title}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                {deleteConfirm.message}
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-100">
              <button
                onClick={() => {
                  if (deleteConfirm.onCancel) {
                    deleteConfirm.onCancel();
                  } else {
                    setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
                  }
                }}
                className="px-4 py-2 text-2xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteConfirm.onConfirm}
                className="px-4 py-2 text-2xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer transition-colors shadow-sm"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
