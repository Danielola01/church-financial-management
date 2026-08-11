import React, { useState } from "react";
import { Transaction, UserProfile } from "../types";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Hash,
  Coins,
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  Clock,
  ChevronRight,
  Lock,
  CreditCard,
  Loader2,
  User
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

interface DashboardProps {
  transactions: Transaction[];
  userProfile: UserProfile | null;
  onNavigateToTransactions: () => void;
  onQuickAdd: (type: "income" | "expense") => void;
  onRefreshProfile?: () => void;
  onNavigateToProfile?: () => void;
}

export default function Dashboard({
  transactions,
  userProfile,
  onNavigateToTransactions,
  onQuickAdd,
  onRefreshProfile,
  onNavigateToProfile
}: DashboardProps) {
  const [renewing, setRenewing] = useState(false);

  const handleRenewSubscription = async () => {
    if (!userProfile) return;
    try {
      setRenewing(true);
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const profileRef = doc(db, "profiles", userProfile.uid);
      await updateDoc(profileRef, {
        paymentStatus: "active",
        paymentDate: now.toISOString(),
        paymentEndDate: thirtyDaysFromNow.toISOString()
      });

      if (onRefreshProfile) {
        onRefreshProfile();
      }
    } catch (err) {
      console.error("Failed to renew subscription:", err);
    } finally {
      setRenewing(false);
    }
  };

  // Helper: check if a date is within this week (starting Sunday or Monday)
  const isThisWeek = (dateStr: string) => {
    const transactionDate = new Date(dateStr);
    const today = new Date();
    
    // Get start of this week (Sunday 00:00:00)
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    sunday.setHours(0, 0, 0, 0);

    // Get end of this week (Saturday 23:59:59)
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);

    return transactionDate >= sunday && transactionDate <= saturday;
  };

  // Helper: check if a date is within the current calendar month
  const isThisMonth = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  };

  // 1. Calculations
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalBalance = totalIncome - totalExpenses;
  const totalTransactionsCount = transactions.length;

  // 2. Format Currency
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

  const [trendView, setTrendView] = useState<"weekly" | "monthly">("monthly");

  // 3. Prepare Chart Data (Weekly Sundays & Monthly 1st-31st)
  const getWeeklyChartData = () => {
    const weeklyData: { [key: string]: { name: string; Income: number; Expenses: number; sortKey: number } } = {};
    const monthsName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const today = new Date();
    
    // Find Sunday of the current week
    const currentSunday = new Date(today);
    currentSunday.setDate(today.getDate() - today.getDay());
    currentSunday.setHours(0, 0, 0, 0);

    // Collect the last 6 Sundays
    const last6Sundays: Date[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentSunday);
      d.setDate(currentSunday.getDate() - (i * 7));
      last6Sundays.push(d);
    }

    // Initialize map with Sunday labels
    last6Sundays.forEach((sunday) => {
      const key = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`;
      weeklyData[key] = {
        name: `Sun, ${monthsName[sunday.getMonth()]} ${sunday.getDate()}`,
        Income: 0,
        Expenses: 0,
        sortKey: sunday.getTime()
      };
    });

    // Populate with transactions data, grouping into weekly periods labeled by Sunday
    transactions.forEach((t) => {
      const d = new Date(t.date);
      // Find Sunday of the transaction's week
      const tSunday = new Date(d);
      tSunday.setDate(d.getDate() - d.getDay());
      tSunday.setHours(0, 0, 0, 0);

      const key = `${tSunday.getFullYear()}-${String(tSunday.getMonth() + 1).padStart(2, "0")}-${String(tSunday.getDate()).padStart(2, "0")}`;
      if (weeklyData[key]) {
        if (t.type === "income") {
          weeklyData[key].Income += t.amount;
        } else {
          weeklyData[key].Expenses += t.amount;
        }
      }
    });

    return last6Sundays.map((sunday) => {
      const key = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`;
      return weeklyData[key];
    });
  };

  const getMonthlyChartData = () => {
    const monthlyData: { [key: string]: { name: string; Income: number; Expenses: number } } = {};
    const monthsName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Get the last 6 months list (1st to 31st)
    const today = new Date();
    const last6Months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      last6Months.push(key);
      monthlyData[key] = {
        name: `${monthsName[d.getMonth()]} (1st-31st)`,
        Income: 0,
        Expenses: 0
      };
    }

    // Populate with transactions data
    transactions.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyData[key]) {
        if (t.type === "income") {
          monthlyData[key].Income += t.amount;
        } else {
          monthlyData[key].Expenses += t.amount;
        }
      }
    });

    return last6Months.map((key) => monthlyData[key]);
  };

  const chartData = trendView === "weekly" ? getWeeklyChartData() : getMonthlyChartData();

  // 4. Recent Transactions (last 5)
  const sortedTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const canEdit = userProfile?.role === "admin" || userProfile?.role === "treasurer" || userProfile?.role === "chairman";

  return (
    <div className="space-y-6">
      {/* Upper header section */}
      <div className="border-b border-slate-100 pb-3 min-w-0">
        <h1 className="text-[18px] sm:text-lg md:text-2xl font-bold text-slate-950 tracking-tight font-sans truncate">
          {userProfile?.organizationName ? `${userProfile.organizationName} Portal` : "Financial Dashboard"}
        </h1>
        <p className="text-[16px] sm:text-xs text-slate-500 truncate">
          Real-time insights of revenues, operational expenditures, and liquidity.
        </p>
      </div>

      {/* Metric Cards grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Metric 1 */}
        <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Income</p>
          <p className="text-lg md:text-2xl font-bold text-emerald-600 truncate">{formatCurrency(totalIncome)}</p>
          <div className="mt-2 h-1 bg-emerald-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
              style={{ width: totalIncome > 0 ? "100%" : "0%" }}
            ></div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Expenses</p>
          <p className="text-lg md:text-2xl font-bold text-rose-600 truncate">{formatCurrency(totalExpenses)}</p>
          <div className="mt-2 h-1 bg-rose-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-rose-500 rounded-full transition-all duration-500" 
              style={{ width: totalIncome > 0 ? `${Math.min(100, (totalExpenses / Math.max(1, totalIncome)) * 100)}%` : "0%" }}
            ></div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Transactions</p>
            <p className="text-lg md:text-2xl font-bold text-slate-900">{totalTransactionsCount}</p>
          </div>
          <p className="text-[10px] md:text-xs text-slate-500 mt-2">Recorded ledger logs</p>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Balance</p>
          <p className="text-lg md:text-2xl font-bold text-blue-600 truncate">{formatCurrency(totalBalance)}</p>
          <div className="mt-2 h-1 bg-blue-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-500" 
              style={{ width: totalIncome > 0 ? `${Math.max(0, Math.min(100, (totalBalance / Math.max(1, totalIncome)) * 100))}%` : "0%" }}
            ></div>
          </div>
        </div>
      </div>

      {/* Charts & Main Dashboard Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Aggregated chart over time (Colspan 2) */}
        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
            <div>
              <h2 className="text-[18px] sm:text-base font-bold text-slate-900">
                Treasury Trend Analysis
              </h2>
              <p className="text-[16px] sm:text-xs text-slate-400">
                {trendView === "weekly"
                  ? "Weekly evaluation of church inflows (Sundays) against expenditures."
                  : "Monthly evaluation of church inflows (1st-31st) against expenditures."}
              </p>
            </div>

            {/* Toggle switch for weekly vs monthly */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-start sm:self-auto flex-shrink-0">
              <button
                onClick={() => setTrendView("weekly")}
                className={`px-3 py-1 text-2xs md:text-xs font-bold rounded-md transition-all duration-200 cursor-pointer ${
                  trendView === "weekly"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setTrendView("monthly")}
                className={`px-3 py-1 text-2xs md:text-xs font-bold rounded-md transition-all duration-200 cursor-pointer ${
                  trendView === "monthly"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Monthly
              </button>
            </div>
          </div>

          <div className="h-80 w-full">
            {transactions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <p className="text-sm font-medium">No transaction data available yet.</p>
                <p className="text-2xs">Create a transaction to populate treasury insights.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 500 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 500 }}
                    tickFormatter={(val) => `₦${val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                    }}
                    labelStyle={{ fontWeight: "bold", fontSize: "11px", color: "#1e293b" }}
                    itemStyle={{ fontSize: "11px" }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "11px", fontWeight: "bold", color: "#64748b" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Income"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorIncome)"
                  />
                  <Area
                    type="monotone"
                    dataKey="Expenses"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorExpenses)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Transactions List (Colspan 1) */}
        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-[18px] sm:text-sm font-bold text-slate-900">
                Recent Ledger Entries
              </h2>
              <button
                onClick={onNavigateToTransactions}
                className="text-[11px] sm:text-xs font-bold text-blue-600 hover:text-blue-500 flex items-center gap-0.5 cursor-pointer flex-shrink-0"
              >
                View All
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            <div className="space-y-3">
              {sortedTransactions.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-xs font-medium">No ledger entries yet.</p>
                </div>
              ) : (
                sortedTransactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 border border-slate-50 hover:border-slate-100 hover:bg-slate-50/50 rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                          t.type === "income"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {t.type === "income" ? (
                          <ArrowUpRight className="h-4.5 w-4.5" />
                        ) : (
                          <ArrowDownRight className="h-4.5 w-4.5" />
                        )}
                      </div>

                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-800 line-clamp-1">
                          {t.category}
                        </span>
                        <span className="text-3xs text-slate-400 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {t.date}
                        </span>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end">
                      <span
                        className={`text-xs font-black ${
                          t.type === "income" ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {t.type === "income" ? "+" : "-"}
                        {formatCurrency(t.amount)}
                      </span>
                      <span className="text-[9px] text-slate-400 italic line-clamp-1 max-w-[100px]">
                        by {t.recordedBy}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}
