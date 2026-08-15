import React, { useState } from "react";
import { jsPDF } from "jspdf";
import { Transaction, UserProfile } from "../types";
import { normalizeCategory } from "../utils";
import {
  Calendar,
  Download,
  Printer,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  PieChart,
  CheckCircle,
  FileText,
  TrendingUp,
  TrendingDown,
  ChevronDown
} from "lucide-react";

interface ReportsProps {
  transactions: Transaction[];
  userProfile?: UserProfile | null;
  onQuickAdd?: (type: "income" | "expense") => void;
}

export default function Reports({ transactions, userProfile, onQuickAdd }: ReportsProps) {
  // State variables for report parameters
  const [timeframeFilter, setTimeframeFilter] = useState<"month" | "all">("month");
  
  // Pick standard month default (current month format: YYYY-MM)
  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  // Pick standard date for week filter (current date format YYYY-MM-DD)
  const currentDateStr = today.toISOString().split("T")[0];
  const [selectedWeekDate, setSelectedWeekDate] = useState(currentDateStr);

  // Print Mode state
  const [isPrintPreview, setIsPrintPreview] = useState(false);
  const [isSummaryOnlyPrint, setIsSummaryOnlyPrint] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  // Dynamic Diocese Header & Signatories per church / organisation
  const dioceseHeader =
    userProfile?.dioceseName !== undefined && userProfile?.dioceseName !== ""
      ? userProfile.dioceseName
      : "IJEBU ANGLICAN DIOCESE";

  const firstSignatoryName =
    userProfile?.vicarName ||
    userProfile?.chairmanName ||
    (userProfile?.email === "ogundedanielola@gmail.com" ? "Revd. Daniel O. Ogunde" : userProfile?.name || "Revd. Daniel O. Ogunde");
  const firstSignatoryTitle = userProfile?.vicarTitle || userProfile?.chairmanTitle || "The Vicar";

  const secondSignatoryName =
    userProfile?.treasurerName ||
    (userProfile?.email === "demotest@gmail.com" ? "Mr. Lukmon Olowu" : "");
  const secondSignatoryTitle = userProfile?.treasurerTitle || "The Treasurer";

  // Helpers to calculate week ranges
  const getWeekRange = (dateStr: string) => {
    const baseDate = new Date(dateStr);
    
    // Start of week (Sunday)
    const sunday = new Date(baseDate);
    sunday.setDate(baseDate.getDate() - baseDate.getDay());
    sunday.setHours(0, 0, 0, 0);

    // End of week (Saturday)
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);

    return { sunday, saturday };
  };

  const getMonthRange = (monthStr: string) => {
    const [year, month] = monthStr.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const lastDay = new Date(year, month, 0, 23, 59, 59, 999);
    return { firstDay, lastDay };
  };

  // Filter Transactions based on timeframes
  const filteredTransactions = transactions.filter((t) => {
    if (timeframeFilter === "all") {
      return true;
    } else {
      return t.date.startsWith(selectedMonth);
    }
  });

  // Calculations for filtered timeframe
  const totalIncome = filteredTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = filteredTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalBalance = totalIncome - totalExpenses;

  // Aggregate Category Data
  const getCategoryBreakdown = (type: "income" | "expense") => {
    const totals: { [category: string]: number } = {};
    filteredTransactions
      .filter((t) => t.type === type)
      .forEach((t) => {
        // Normalize category name to combine typos and variations into 1 single canonical name
        const normCat = normalizeCategory(t.category);
        totals[normCat] = (totals[normCat] || 0) + t.amount;
      });

    return Object.keys(totals)
      .map((cat) => ({
        category: cat,
        amount: totals[cat],
        percentage: totalIncome > 0 && type === "income"
          ? (totals[cat] / totalIncome) * 100
          : totalExpenses > 0 && type === "expense"
          ? (totals[cat] / totalExpenses) * 100
          : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  };

  const incomeCategories = getCategoryBreakdown("income");
  const expenseCategories = getCategoryBreakdown("expense");

  // Group filtered transactions by date for a specific type (income or expense)
  const getDailyGroupedTransactions = (type: "income" | "expense") => {
    const typeTransactions = filteredTransactions.filter((t) => t.type === type);
    
    // Group by exact date string YYYY-MM-DD
    const groups: { [date: string]: Transaction[] } = {};
    typeTransactions.forEach((t) => {
      const date = t.date;
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(t);
    });

    // Convert to sorted list of grouped items with detail items
    return Object.keys(groups)
      .map((date) => {
        const txsInDate = groups[date];
        const totalAmount = txsInDate.reduce((sum, t) => sum + t.amount, 0);
        
        // Detailed items with their specific category/description and amount
        const items = txsInDate.map((t) => {
          const desc = t.description?.trim();
          const rawTitle = (desc && desc !== "—") ? desc : t.category;
          const title = normalizeCategory(rawTitle);
          return {
            id: t.id,
            title,
            amount: t.amount,
          };
        });

        return {
          date,
          items,
          amount: totalAmount,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  const dailyIncome = getDailyGroupedTransactions("income");
  const totalIncomeAmount = dailyIncome.reduce((sum, g) => sum + g.amount, 0);
  
  // Construct Income item lines (excluding the final grand total)
  const incomeItemLines: {
    date: string;
    title: string;
    amount: number | null;
    isTotal?: boolean;
    isEmpty?: boolean;
  }[] = [];

  if (dailyIncome.length === 0) {
    incomeItemLines.push({
      date: "--",
      title: "No income streams reported",
      amount: null,
      isEmpty: true,
    });
  } else {
    dailyIncome.forEach((group) => {
      group.items.forEach((item, idx) => {
        incomeItemLines.push({
          date: idx === 0 ? group.date : "",
          title: item.title,
          amount: item.amount,
        });
      });
      // Add group subtotal if multiple items in the group or multiple date groups exist
      if (group.items.length > 1 || dailyIncome.length > 1) {
        incomeItemLines.push({
          date: "",
          title: "Subtotal",
          amount: group.amount,
          isTotal: true,
        });
      }
    });
  }

  // Flat list of all individual expenses for the month
  const allExpenses = filteredTransactions
    .filter((t) => t.type === "expense")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const desc = t.description?.trim();
      const rawTitle = (desc && desc !== "—") ? desc : t.category;
      const title = normalizeCategory(rawTitle);
      return {
        id: t.id,
        title,
        amount: t.amount,
      };
    });

  const totalExpenseAmount = allExpenses.reduce((sum, e) => sum + e.amount, 0);

  const expenseItemLines: {
    title: string;
    amount: number | null;
    isTotal?: boolean;
    isEmpty?: boolean;
  }[] = [];

  if (allExpenses.length === 0) {
    expenseItemLines.push({
      title: "No operational expenses reported",
      amount: null,
      isEmpty: true,
    });
  } else {
    allExpenses.forEach((item) => {
      expenseItemLines.push({
        title: item.title,
        amount: item.amount,
      });
    });
  }

  // Align item rows
  const maxItemLength = Math.max(incomeItemLines.length, expenseItemLines.length);

  const unifiedDailyLedger = Array.from({ length: maxItemLength }).map((_, index) => {
    const inc = incomeItemLines[index] || null;
    const exp = expenseItemLines[index] || null;

    return {
      date: `row-${index}`,
      income: inc,
      expense: exp,
      isGrandTotal: false,
    };
  });

  // Always append the aligned GRAND TOTAL row at the bottom!
  unifiedDailyLedger.push({
    date: "row-grand-total",
    income: {
      date: "",
      title: "TOTAL",
      amount: totalIncomeAmount,
      isTotal: true,
    },
    expense: {
      title: "TOTAL",
      amount: totalExpenseAmount,
      isTotal: true,
    },
    isGrandTotal: true,
  });

  // Format Currency
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

  const formatPDFCurrency = (amount: number) => {
    return "N" + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Export to beautifully formatted PDF statement that matches the screen design perfectly
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    let y = 29;

    // --- PAGE HEADER FUNCTION ---
    const drawHeader = (pageNumber: number, showPageNum: boolean = false) => {
      // Diocese / Parent Body Header
      if (dioceseHeader) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(37, 99, 235); // Blue-600
        doc.text(dioceseHeader.toUpperCase(), 105, 11, { align: "center" });
      }

      // Registered Org Name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // Slate-900
      const orgName = (userProfile?.organizationName || "Grace Sanctuary").toUpperCase();
      doc.text(orgName, 105, 17, { align: "center" });

      // Statement of Account for the Month of...
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(71, 85, 105); // Slate-600
      const periodText = timeframeFilter === "all"
        ? "Statement of Account for All Records"
        : `Statement of Account for the Month of ${getPeriodLabel()}`;
      doc.text(periodText, 105, 22.5, { align: "center" });

      // Right-aligned Metadata (if multi-page)
      if (showPageNum) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139); // Slate-500
        doc.text(`Page ${pageNumber}`, 196, 11, { align: "right" });
      }

      // Bottom Border Line
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.setLineWidth(0.4);
      doc.line(14, 25.5, 196, 25.5);
    };

    // Draw Page 1 Header
    drawHeader(1, false);

    // --- SUMMARY CARDS ---
    const cardWidth = 57;
    const cardHeight = 17.5;
    const startX = 14;
    const gap = 5.5;

    // Render Card 1 (Inflows)
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.setLineWidth(0.3);
    doc.roundedRect(startX, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text("TOTAL INCOME", startX + 4, y + 4.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(5, 150, 105); // Emerald-600
    doc.text(`+${formatPDFCurrency(totalIncome)}`, startX + 4, y + 10.8);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text("Collections & donations", startX + 4, y + 15);

    // Render Card 2 (Outflows)
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.roundedRect(startX + cardWidth + gap, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text("TOTAL EXPENSES", startX + cardWidth + gap + 4, y + 4.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38); // Red-600
    doc.text(`-${formatPDFCurrency(totalExpenses)}`, startX + cardWidth + gap + 4, y + 10.8);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text("Operational expenses", startX + cardWidth + gap + 4, y + 15);

    // Render Card 3 (Balance)
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.roundedRect(startX + (cardWidth + gap) * 2, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text("TOTAL BALANCE", startX + (cardWidth + gap) * 2 + 4, y + 4.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const balColor = totalBalance >= 0 ? [37, 99, 235] : [220, 38, 38]; // Blue-600 or Red-600
    doc.setTextColor(balColor[0], balColor[1], balColor[2]);
    doc.text(`${formatPDFCurrency(totalBalance)}`, startX + (cardWidth + gap) * 2 + 4, y + 10.8);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text("Net liquidity impact", startX + (cardWidth + gap) * 2 + 4, y + 15);

    y += cardHeight + 9;

    // --- CATEGORIES SECTION ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42); // Slate-900

    // Headers
    doc.text("INFLOW CATEGORIES", 14, y);
    doc.text("OUTFLOW CATEGORIES", 111, y);

    // Underline
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.setLineWidth(0.3);
    doc.line(14, y + 2, 99, y + 2);
    doc.line(111, y + 2, 196, y + 2);

    y += 5.2;

    const maxCats = Math.max(incomeCategories.length, expenseCategories.length, 1);
    const catRowHeight = 4.4;

    for (let i = 0; i < maxCats; i++) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105); // Slate-600

      // Income category
      if (i < incomeCategories.length) {
        const cat = incomeCategories[i];
        doc.text(cat.category, 14, y + (i * catRowHeight));
        
        // Amount & percentage
        const amtStr = `${formatPDFCurrency(cat.amount)}`;
        const pctStr = ` (${cat.percentage.toFixed(1)}%)`;
        doc.setFont("helvetica", "bold");
        const amtWidth = doc.getTextWidth(amtStr);
        const pctWidth = doc.getTextWidth(pctStr);
        
        doc.setTextColor(51, 65, 85); // Slate-700
        doc.text(amtStr, 99 - amtWidth - pctWidth, y + (i * catRowHeight));
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184); // Slate-400
        doc.text(pctStr, 99 - pctWidth, y + (i * catRowHeight));
      } else if (i === 0 && incomeCategories.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(148, 163, 184);
        doc.text("No income streams reported.", 14, y);
      }

      // Expense category
      if (i < expenseCategories.length) {
        const cat = expenseCategories[i];
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(cat.category, 111, y + (i * catRowHeight));
        
        // Amount & percentage
        const amtStr = `${formatPDFCurrency(cat.amount)}`;
        const pctStr = ` (${cat.percentage.toFixed(1)}%)`;
        doc.setFont("helvetica", "bold");
        const amtWidth = doc.getTextWidth(amtStr);
        const pctWidth = doc.getTextWidth(pctStr);
        
        doc.setTextColor(51, 65, 85); // Slate-700
        doc.text(amtStr, 196 - amtWidth - pctWidth, y + (i * catRowHeight));
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184); // Slate-400
        doc.text(pctStr, 196 - pctWidth, y + (i * catRowHeight));
      } else if (i === 0 && expenseCategories.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(148, 163, 184);
        doc.text("No operational expenses reported.", 111, y);
      }
    }

    y += (maxCats * catRowHeight) + 4.5;

    // --- LEDGER TITLE ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text("AUDIT TRANSACTION LEDGER (BY DATE)", 14, y);

    y += 3.5;

    // --- TABLE HEADERS DRAW FUNCTION ---
    const drawTableHeaders = (currentY: number) => {
      // Income Header bg
      doc.setFillColor(236, 253, 245); // Emerald-50
      doc.rect(14, currentY, 91, 5.5, "F");
      
      // Expense Header bg
      doc.setFillColor(254, 242, 242); // Rose-50
      doc.rect(105, currentY, 91, 5.5, "F");

      // Vertical line in the middle
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.setLineWidth(0.3);
      doc.line(105, currentY, 105, currentY + 10.5);

      // Borders for headers
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.rect(14, currentY, 182, 10.5);

      // Header Texts
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      
      doc.setTextColor(6, 95, 70); // Emerald-800
      doc.text("INCOME LEDGER", 59.5, currentY + 4, { align: "center" });

      doc.setTextColor(153, 27, 27); // Rose-800
      doc.text("EXPENSES LEDGER", 150.5, currentY + 4, { align: "center" });

      // Column Subheaders row
      doc.setFillColor(248, 250, 252); // Slate-50
      doc.rect(14, currentY + 5.5, 182, 5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139); // Slate-500

      // Left Side Column headers
      doc.text("Date", 16, currentY + 9);
      doc.text("Description", 36, currentY + 9);
      doc.text("Amount", 103, currentY + 9, { align: "right" });

      // Right Side Column headers
      doc.text("Description", 110, currentY + 9);
      doc.text("Amount", 194, currentY + 9, { align: "right" });
    };

    drawTableHeaders(y);
    y += 10.5;

    if (unifiedDailyLedger.length === 0) {
      doc.setFillColor(248, 250, 252, 0.3);
      doc.rect(14, y, 182, 12, "F");
      doc.rect(14, y, 182, 12, "D");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text("No transactions recorded in this period.", 105, y + 7, { align: "center" });
      y += 12;
    } else {
      // Dynamically calculate row height so that monthly ledger and signatures strictly fit on 1 single page!
      const totalRowCount = unifiedDailyLedger.length;
      const targetMaxY = 260; // Safe bottom limit on 297mm A4 page to leave room for signatures
      const spaceRemaining = targetMaxY - y;
      const calculatedRowHeight = spaceRemaining / (totalRowCount || 1);
      const rowHeight = Math.min(5.5, Math.max(3.8, calculatedRowHeight));
      const rowFontSize = Math.min(9.5, Math.max(7.2, rowHeight * 1.7));

      unifiedDailyLedger.forEach(({ income, expense, isGrandTotal }) => {
        // Background fill
        if (isGrandTotal) {
          doc.setFillColor(241, 245, 249); // Slate-100 for Grand Total row
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(14, y, 182, rowHeight, "F");

        // Borders for the row
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(14, y, 14, y + rowHeight); // Left outer boundary
        doc.line(196, y, 196, y + rowHeight); // Right outer boundary
        doc.line(105, y, 105, y + rowHeight); // Center vertical divider
        doc.line(14, y + rowHeight, 196, y + rowHeight); // Bottom divider line

        if (isGrandTotal) {
          doc.setDrawColor(203, 213, 225); // Slate-300 top border
          doc.setLineWidth(0.5);
          doc.line(14, y, 196, y);
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(rowFontSize);
        doc.setTextColor(71, 85, 105); // Slate-600

        const textBaselineY = y + (rowHeight * 0.72);

        // --- INCOME COLUMN ---
        if (income) {
          // Date (if set)
          if (income.date) {
            doc.text(income.date, 16, textBaselineY);
          }

          if (income.isTotal) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42); // Slate-900
            doc.text(income.title.toUpperCase(), 36, textBaselineY);

            // Highlight amount in Emerald
            doc.setTextColor(5, 150, 105); // Emerald-600
            doc.text(`+${formatPDFCurrency(income.amount || 0)}`, 103, textBaselineY, { align: "right" });
          } else if (income.isEmpty) {
            doc.setFont("helvetica", "italic");
            doc.setTextColor(148, 163, 184);
            doc.text(income.title, 36, textBaselineY);
            doc.text("--", 103, textBaselineY, { align: "right" });
          } else {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(51, 65, 85); // Slate-700
            let title = income.title;
            if (title.length > 32) title = title.substring(0, 30) + "...";
            doc.text(title, 36, textBaselineY);

            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            doc.text(formatPDFCurrency(income.amount || 0), 103, textBaselineY, { align: "right" });
          }
        } else {
          doc.text("--", 16, textBaselineY);
          doc.text("--", 36, textBaselineY);
          doc.text("--", 103, textBaselineY, { align: "right" });
        }

        // --- EXPENSES COLUMN ---
        if (expense) {
          if (expense.isTotal) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42); // Slate-900
            doc.text(expense.title.toUpperCase(), 110, textBaselineY);

            // Highlight amount in Red
            doc.setTextColor(220, 38, 38); // Red-600
            doc.text(`-${formatPDFCurrency(expense.amount || 0)}`, 194, textBaselineY, { align: "right" });
          } else if (expense.isEmpty) {
            doc.setFont("helvetica", "italic");
            doc.setTextColor(148, 163, 184);
            doc.text(expense.title, 110, textBaselineY);
            doc.text("--", 194, textBaselineY, { align: "right" });
          } else {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(51, 65, 85); // Slate-700
            let title = expense.title;
            if (title.length > 38) title = title.substring(0, 36) + "...";
            doc.text(title, 110, textBaselineY);

            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            doc.text(formatPDFCurrency(expense.amount || 0), 194, textBaselineY, { align: "right" });
          }
        } else {
          doc.text("--", 110, textBaselineY);
          doc.text("--", 194, textBaselineY, { align: "right" });
        }

        y += rowHeight;
      });
    }

    // --- FOOTER SIGN-OFF (Positioned cleanly on the same page with 12pt official names) ---
    const sigY = Math.min(276, Math.max(y + 8, 260));

    // Left signature line
    doc.setDrawColor(203, 213, 225); // Slate-300
    doc.setLineWidth(0.4);
    doc.line(14, sigY, 68, sigY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(51, 65, 85); // Slate-700
    doc.text(firstSignatoryName, 14, sigY + 4.8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text(firstSignatoryTitle, 14, sigY + 9.2);

    // Right signature line
    doc.setDrawColor(203, 213, 225); // Slate-300
    doc.line(142, sigY, 196, sigY);

    if (secondSignatoryName && secondSignatoryName.trim() !== "") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(51, 65, 85); // Slate-700
      doc.text(secondSignatoryName, 196, sigY + 4.8, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(148, 163, 184); // Slate-400
      doc.text(secondSignatoryTitle, 196, sigY + 9.2, { align: "right" });
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(148, 163, 184); // Slate-400
      doc.text(secondSignatoryTitle || "The Treasurer", 196, sigY + 6.5, { align: "right" });
    }

    // Save document
    const reportName =
      timeframeFilter === "all"
        ? "all_time_church_report"
        : `monthly_church_report_${selectedMonth}`;
    doc.save(`${reportName}.pdf`);
  };

  // Export Executive Summary ONLY to PDF (Total Income, Total Expenses, Balance + Inflow/Outflow Category breakdowns)
  const handleExportSummaryPDF = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    let y = 29;

    // --- PAGE HEADER ---
    if (dioceseHeader) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(37, 99, 235); // Blue-600
      doc.text(dioceseHeader.toUpperCase(), 105, 11, { align: "center" });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // Slate-900
    const orgName = (userProfile?.organizationName || "Grace Sanctuary").toUpperCase();
    doc.text(orgName, 105, 17, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(71, 85, 105); // Slate-600
    const periodText = timeframeFilter === "all"
      ? "Executive Summary Statement for All Records"
      : `Executive Summary Statement for ${getPeriodLabel()}`;
    doc.text(periodText, 105, 22.5, { align: "center" });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(14, 25.5, 196, 25.5);

    // --- SUMMARY METRIC CARDS ---
    const cardWidth = 57;
    const cardHeight = 20;
    const startX = 14;
    const gap = 5.5;

    // Card 1: Total Income
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(startX, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("TOTAL INCOME", startX + 4, y + 4.8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(5, 150, 105);
    doc.text(`+${formatPDFCurrency(totalIncome)}`, startX + 4, y + 11.5);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Collections & donations", startX + 4, y + 16.5);

    // Card 2: Total Expenses
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(startX + cardWidth + gap, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("TOTAL EXPENSES", startX + cardWidth + gap + 4, y + 4.8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(220, 38, 38);
    doc.text(`-${formatPDFCurrency(totalExpenses)}`, startX + cardWidth + gap + 4, y + 11.5);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Operational expenses", startX + cardWidth + gap + 4, y + 16.5);

    // Card 3: Total Balance
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(startX + (cardWidth + gap) * 2, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("TOTAL BALANCE", startX + (cardWidth + gap) * 2 + 4, y + 4.8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    const balColor = totalBalance >= 0 ? [37, 99, 235] : [220, 38, 38];
    doc.setTextColor(balColor[0], balColor[1], balColor[2]);
    doc.text(`${formatPDFCurrency(totalBalance)}`, startX + (cardWidth + gap) * 2 + 4, y + 11.5);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Net liquidity impact", startX + (cardWidth + gap) * 2 + 4, y + 16.5);

    y += cardHeight + 10;

    // --- CATEGORIES BREAKDOWN SECTION ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);

    doc.text("INFLOW CATEGORIES", 14, y);
    doc.text("OUTFLOW CATEGORIES", 111, y);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(14, y + 2, 99, y + 2);
    doc.line(111, y + 2, 196, y + 2);

    y += 6;

    const maxCats = Math.max(incomeCategories.length, expenseCategories.length, 1);
    const catRowHeight = 5.5;

    for (let i = 0; i < maxCats; i++) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);

      // Income category
      if (i < incomeCategories.length) {
        const cat = incomeCategories[i];
        doc.text(cat.category, 14, y + (i * catRowHeight));

        const amtStr = `${formatPDFCurrency(cat.amount)}`;
        const pctStr = ` (${cat.percentage.toFixed(1)}%)`;
        doc.setFont("helvetica", "bold");
        const amtWidth = doc.getTextWidth(amtStr);
        const pctWidth = doc.getTextWidth(pctStr);

        doc.setTextColor(51, 65, 85);
        doc.text(amtStr, 99 - amtWidth - pctWidth, y + (i * catRowHeight));
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184);
        doc.text(pctStr, 99 - pctWidth, y + (i * catRowHeight));
      } else if (i === 0 && incomeCategories.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(148, 163, 184);
        doc.text("No income streams reported.", 14, y);
      }

      // Expense category
      if (i < expenseCategories.length) {
        const cat = expenseCategories[i];
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(cat.category, 111, y + (i * catRowHeight));

        const amtStr = `${formatPDFCurrency(cat.amount)}`;
        const pctStr = ` (${cat.percentage.toFixed(1)}%)`;
        doc.setFont("helvetica", "bold");
        const amtWidth = doc.getTextWidth(amtStr);
        const pctWidth = doc.getTextWidth(pctStr);

        doc.setTextColor(51, 65, 85);
        doc.text(amtStr, 196 - amtWidth - pctWidth, y + (i * catRowHeight));
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184);
        doc.text(pctStr, 196 - pctWidth, y + (i * catRowHeight));
      } else if (i === 0 && expenseCategories.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(148, 163, 184);
        doc.text("No operational expenses reported.", 111, y);
      }
    }

    y += (maxCats * catRowHeight) + 20;

    // --- SIGNATURES (12pt for official names, fits cleanly on 1 page) ---
    const sigY = Math.min(276, Math.max(y + 8, 250));
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);

    // Vicar / Chairman
    doc.line(14, sigY, 68, sigY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(51, 65, 85);
    doc.text(firstSignatoryName, 14, sigY + 4.8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(148, 163, 184);
    doc.text(firstSignatoryTitle, 14, sigY + 9.2);

    // Treasurer
    doc.line(142, sigY, 196, sigY);
    if (secondSignatoryName && secondSignatoryName.trim() !== "") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(51, 65, 85);
      doc.text(secondSignatoryName, 196, sigY + 4.8, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(148, 163, 184);
      doc.text(secondSignatoryTitle, 196, sigY + 9.2, { align: "right" });
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(148, 163, 184);
      doc.text(secondSignatoryTitle || "The Treasurer", 196, sigY + 6.5, { align: "right" });
    }

    const reportName = timeframeFilter === "all"
      ? "executive_summary_report_all_time"
      : `executive_summary_report_${selectedMonth}`;
    doc.save(`${reportName}.pdf`);
  };

  // Interactive Print Trigger
  const handlePrint = () => {
    setIsSummaryOnlyPrint(false);
    window.print();
  };

  const handlePrintSummaryOnly = () => {
    setIsSummaryOnlyPrint(true);
    setTimeout(() => {
      window.print();
      setIsSummaryOnlyPrint(false);
    }, 150);
  };

  // Compute Readable Period String
  const getPeriodLabel = () => {
    if (timeframeFilter === "all") {
      return "All Records (Entire History)";
    } else {
      const [year, month] = selectedMonth.split("-").map(Number);
      const d = new Date(year, month - 1, 1);
      return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
  };

  return (
    <div className="space-y-6 print:p-0">
      {/* Parameters selector - HIDDEN IN PRINT */}
      <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-[18px] sm:text-xl font-bold text-slate-900 tracking-tight font-sans">
              Financial Reports Generator
            </h1>
            <p className="text-[16px] sm:text-xs text-slate-400">
              Audit balances, download formatted PDF statements, or print weekly and monthly official church statements.
            </p>
          </div>

          {/* Dropdown Button on Far Right */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-2 text-xs transition-all cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>Export & Print Reports</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isExportDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isExportDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setIsExportDropdownOpen(false)}
                />

                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 z-20 py-2 divide-y divide-slate-100 font-sans animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3.5 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Download PDF Statements
                  </div>
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsExportDropdownOpen(false);
                        handleExportPDF();
                      }}
                      disabled={filteredTransactions.length === 0}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
                    >
                      <FileText className="h-4 w-4 text-slate-600 flex-shrink-0" />
                      <div>
                        <div className="font-bold text-slate-800">Download Full PDF</div>
                        <div className="text-[10px] text-slate-400 font-normal">Complete report with itemized transaction ledger</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsExportDropdownOpen(false);
                        handleExportSummaryPDF();
                      }}
                      disabled={filteredTransactions.length === 0}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
                    >
                      <Download className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <div>
                        <div className="font-bold text-blue-900">Download Summary PDF</div>
                        <div className="text-[10px] text-slate-400 font-normal">Totals & category breakdown statement only</div>
                      </div>
                    </button>
                  </div>

                  <div className="px-3.5 pt-2 pb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Print & Screen Display
                  </div>
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsExportDropdownOpen(false);
                        handlePrintSummaryOnly();
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                    >
                      <Printer className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <div>
                        <div className="font-bold text-emerald-900">Print Summary Only</div>
                        <div className="text-[10px] text-slate-400 font-normal">Print only the top Executive Summary section</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsExportDropdownOpen(false);
                        setIsPrintPreview(!isPrintPreview);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                    >
                      <Printer className="h-4 w-4 text-slate-700 flex-shrink-0" />
                      <div>
                        <div className="font-bold text-slate-900">
                          {isPrintPreview ? "Exit Print View" : "Full Print View"}
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal">Toggle document layout on screen</div>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-50 pt-4">
          {/* Timeframe selector */}
          <div>
            <label className="block text-3xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Select Report Timeframe
            </label>
            <div className="grid grid-cols-2 gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
              <button
                type="button"
                onClick={() => setTimeframeFilter("month")}
                className={`py-1.5 text-2xs font-bold text-center rounded-lg transition-all cursor-pointer ${
                  timeframeFilter === "month"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Monthly Report
              </button>
              <button
                type="button"
                onClick={() => setTimeframeFilter("all")}
                className={`py-1.5 text-2xs font-bold text-center rounded-lg transition-all cursor-pointer ${
                  timeframeFilter === "all"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                All Report
              </button>
            </div>
          </div>

          {/* Date Range picker details */}
          {timeframeFilter === "all" ? (
            <div>
              <label className="block text-3xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Data Range
              </label>
              <div className="py-1.5 text-xs font-semibold text-slate-500 italic">
                Showing all time records.
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-3xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Select Month
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="block w-full pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-slate-800"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col justify-end text-right">
            <span className="text-3xs font-bold uppercase tracking-wider text-slate-400">
              Generating report for
            </span>
            <span className="text-xs font-bold text-blue-600">{getPeriodLabel()}</span>
          </div>
        </div>
      </div>

      {/* Printable Sheet View - Triggered either inside Print View Mode or directly in browser printing */}
      <div
        className={`${
          isPrintPreview
            ? "bg-white p-8 border border-slate-300 rounded-2xl max-w-4xl mx-auto shadow-md"
            : ""
        } space-y-6 print:bg-white print:border-0 print:p-0 print:shadow-none`}
      >
        {/* Header (Invoice-style) */}
        <div className="border-b-2 border-slate-900 pb-4 text-center space-y-1.5">
          {dioceseHeader && (
            <span className="text-xs font-extrabold uppercase tracking-widest text-blue-600 block">
              {dioceseHeader}
            </span>
          )}
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans block">
            {userProfile?.organizationName || "Grace Sanctuary"}
          </h2>
          <p className="text-base md:text-lg font-bold text-slate-600 block">
            {timeframeFilter === "all"
              ? "Statement of Account for All Records"
              : `Statement of Account for the Month of ${getPeriodLabel()}`}
          </p>
        </div>

        {/* Executive Summary Section Header */}
        <div className="flex items-center justify-between gap-3 pt-2 pb-1 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-blue-600" />
            <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-wider">
              Executive Summary Section (Totals & Category Breakdown)
            </h3>
          </div>
          <span className="text-[12px] font-extrabold uppercase tracking-widest text-slate-400 print:hidden">
            Official Summary
          </span>
        </div>

        {/* Dashboard summary cards */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {/* Card 1: Inflow */}
          <div className="border border-slate-200 p-3 sm:p-4 rounded-xl space-y-1 bg-slate-50/20">
            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Total Income
            </span>
            <div className="text-[12px] font-extrabold text-emerald-600 truncate">
              {formatCurrency(totalIncome)}
            </div>
            <p className="text-[12px] text-slate-400 italic truncate">Collections & donations</p>
          </div>

          {/* Card 2: Outflow */}
          <div className="border border-slate-200 p-3 sm:p-4 rounded-xl space-y-1 bg-slate-50/20">
            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <ArrowDownRight className="h-3.5 w-3.5 text-red-600 shrink-0" /> Total Expenses
            </span>
            <div className="text-[12px] font-extrabold text-red-600 truncate">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-[12px] text-slate-400 italic truncate">Operational expenses</p>
          </div>

          {/* Card 3: Surplus / Deficit */}
          <div className="border border-slate-200 p-3 sm:p-4 rounded-xl space-y-1 bg-slate-50/20">
            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Scale className="h-3.5 w-3.5 text-blue-600 shrink-0" /> Total balance
            </span>
            <div
              className={`text-[12px] font-extrabold truncate ${
                totalBalance >= 0 ? "text-blue-600" : "text-red-600"
              }`}
            >
              {formatCurrency(totalBalance)}
            </div>
            <p className="text-[12px] text-slate-400 italic truncate">Net liquidity impact</p>
          </div>
        </div>

        {/* Breakdown of collections & payouts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Inflows breakdown */}
          <div className="border border-slate-100 p-4 rounded-xl bg-slate-50/10">
            <h3 className="text-[12px] font-extrabold text-slate-900 border-b border-slate-200 pb-2 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Inflow Categories
            </h3>
            {incomeCategories.length === 0 ? (
              <p className="text-[12px] text-slate-400 italic py-2">No income streams reported.</p>
            ) : (
              <div className="space-y-2.5">
                {incomeCategories.map((cat) => (
                   <div key={cat.category} className="py-0.5">
                    <div className="flex justify-between items-center text-[12px] font-semibold text-slate-600">
                      <span>{cat.category}</span>
                      <span>
                        {formatCurrency(cat.amount)}{" "}
                        <span className="text-[12px] text-slate-400 font-medium ml-1">
                          ({cat.percentage.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outflows breakdown */}
          <div className="border border-slate-100 p-4 rounded-xl bg-slate-50/10">
            <h3 className="text-[12px] font-extrabold text-slate-900 border-b border-slate-200 pb-2 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Outflow Categories
            </h3>
            {expenseCategories.length === 0 ? (
              <p className="text-[12px] text-slate-400 italic py-2">No operational expenses reported.</p>
            ) : (
              <div className="space-y-2.5">
                {expenseCategories.map((cat) => (
                  <div key={cat.category} className="py-0.5">
                    <div className="flex justify-between items-center text-[12px] font-semibold text-slate-600">
                      <span>{cat.category}</span>
                      <span>
                        {formatCurrency(cat.amount)}{" "}
                        <span className="text-[12px] text-slate-400 font-medium ml-1">
                          ({cat.percentage.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Grouped Weekly Ledger tables for Income and Expenses - Side-by-Side Unified Table */}
        {!isSummaryOnlyPrint && (
          <div className="space-y-4 pt-2">
            <div className="border-b border-slate-200 pb-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-[12px] font-extrabold text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                <FileText className="h-4 w-4 text-slate-600" />
                Audit Transaction Ledger (by Date)
              </h3>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs overflow-x-auto">
              <table className="min-w-[800px] w-full divide-y divide-slate-200 table-fixed">
              {/* Main Ledger Headers */}
              <thead className="bg-slate-50 text-center font-extrabold uppercase text-[12px] tracking-wider text-slate-700">
                <tr className="divide-x divide-slate-200">
                  <th colSpan={3} className="px-3 py-2 bg-emerald-50/50 text-emerald-800 text-center font-black">
                    INCOME LEDGER
                  </th>
                  <th colSpan={2} className="px-3 py-2 bg-rose-50/50 text-rose-800 text-center font-black">
                    EXPENSES LEDGER
                  </th>
                </tr>
                <tr className="bg-slate-50/30 border-t border-slate-200 text-left text-[12px] font-bold text-slate-500 divide-x divide-slate-200">
                  {/* Income Subheaders */}
                  <th className="px-3 py-2 w-[12%]">Date</th>
                  <th className="px-3 py-2 w-[24%]">Description</th>
                  <th className="px-3 py-2 w-[14%] text-right font-bold text-slate-500">Amount</th>
                  
                  {/* Expenses Subheaders */}
                  <th className="px-3 py-2 w-[34%]">Description</th>
                  <th className="px-3 py-2 w-[16%] text-right font-bold text-slate-500">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[12px] font-medium text-slate-600">
                {unifiedDailyLedger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-400 italic bg-slate-50/30 text-[12px]">
                      No transactions recorded in this period.
                    </td>
                  </tr>
                ) : (
                  unifiedDailyLedger.map(({ date, income, expense, isGrandTotal }) => (
                    <tr
                      key={date}
                      className={`transition-colors align-middle divide-x divide-slate-200 ${
                        isGrandTotal
                          ? "bg-slate-100/90 border-t-2 border-slate-300 hover:bg-slate-100"
                          : "hover:bg-slate-50/30"
                      }`}
                    >
                      {/* --- INCOME SECTION --- */}
                      {income ? (
                        <>
                          <td className="px-3 py-2 font-sans text-slate-500 whitespace-nowrap text-[12px]">
                            {income.date || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-700 font-sans text-[12px]">
                            {income.isTotal ? (
                              <span className={`font-black text-slate-900 uppercase tracking-wider text-[12px]`}>
                                {income.title}
                              </span>
                            ) : income.isEmpty ? (
                              <span className="italic text-slate-300">{income.title}</span>
                            ) : (
                              <span className="text-slate-600 truncate block max-w-[200px]">{income.title}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-sans text-[12px]">
                            {income.isTotal ? (
                              <span className="font-black text-emerald-600 text-[12px]">
                                +{formatCurrency(income.amount || 0)}
                              </span>
                            ) : income.isEmpty ? (
                              <span className="text-slate-300">--</span>
                            ) : (
                              <span className="text-slate-500">
                                {formatCurrency(income.amount || 0)}
                              </span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 font-sans text-slate-300 text-[12px]">—</td>
                          <td className="px-3 py-2 font-sans text-slate-300 text-[12px]">—</td>
                          <td className="px-3 py-2 font-sans text-slate-300 text-right text-[12px]">—</td>
                        </>
                      )}

                      {/* --- EXPENSE SECTION --- */}
                      {expense ? (
                        <>
                          <td className="px-3 py-2 text-slate-700 font-sans text-[12px]">
                            {expense.isTotal ? (
                              <span className={`font-black text-slate-900 uppercase tracking-wider text-[12px]`}>
                                {expense.title}
                              </span>
                            ) : expense.isEmpty ? (
                              <span className="italic text-slate-300">{expense.title}</span>
                            ) : (
                              <span className="text-slate-600 truncate block max-w-[200px]">{expense.title}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-sans text-[12px]">
                            {expense.isTotal ? (
                              <span className="font-black text-red-600 text-[12px]">
                                -{formatCurrency(expense.amount || 0)}
                              </span>
                            ) : expense.isEmpty ? (
                              <span className="text-slate-300">--</span>
                            ) : (
                              <span className="text-slate-500">
                                {formatCurrency(expense.amount || 0)}
                              </span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 font-sans text-slate-300 text-[12px]">—</td>
                          <td className="px-3 py-2 font-sans text-slate-300 text-right text-[12px]">—</td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Auditor Sign-offs (Official document signatures) */}
        <div className="grid grid-cols-2 gap-8 pt-8 border-t border-dashed border-slate-200">
          <div className="space-y-4">
            <div className="border-b border-slate-300 h-10 w-2/3"></div>
            <div className="text-[12px] text-slate-500">
              <p className="font-bold text-slate-700">{firstSignatoryName}</p>
              <p>{firstSignatoryTitle}</p>
            </div>
          </div>

          <div className="space-y-4 text-right flex flex-col items-end">
            <div className="border-b border-slate-300 h-10 w-2/3"></div>
            <div className="text-[12px] text-slate-500">
              {secondSignatoryName && secondSignatoryName.trim() !== "" ? (
                <p className="font-bold text-slate-700">{secondSignatoryName}</p>
              ) : (
                <p className="h-4"></p>
              )}
              <p>{secondSignatoryTitle || "The Treasurer"}</p>
            </div>
          </div>
        </div>

        {/* Print instructions - HIDDEN IN PRINT */}
        {isPrintPreview && (
          <div className="mt-8 bg-blue-50/80 border border-blue-100 p-4 rounded-xl flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2 text-2xs font-bold text-blue-800">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              Statement formatted successfully. Click right side button to open system printing dialog.
            </div>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-2xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              Trigger Print Dialog
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
