import React from "react";
import { ManagementYear, Transaction, UserProfile } from "../types";
import { Calendar, Plus, FolderKanban, ChevronDown, Layers, Sparkles } from "lucide-react";

interface ManagementYearBarProps {
  userProfile: UserProfile | null;
  selectedYearId: string; // "all" or specific ManagementYear id
  onOpenModal: () => void;
  transactions: Transaction[];
}

export default function ManagementYearBar({
  userProfile,
  selectedYearId,
  onOpenModal,
  transactions
}: ManagementYearBarProps) {
  const managementYears: ManagementYear[] = userProfile?.managementYears && userProfile.managementYears.length > 0
    ? userProfile.managementYears
    : [
        { id: "year-2024", label: "2024 Management Year", startDate: "2024-01-01", endDate: "2024-12-31" },
        { id: "year-2025", label: "2025 Management Year", startDate: "2025-01-01", endDate: "2025-12-31" },
        { id: "year-2026", label: "2026 Management Year", startDate: "2026-01-01", endDate: "2026-12-31", isCurrent: true },
        { id: "year-2027", label: "2027 Management Year", startDate: "2027-01-01", endDate: "2027-12-31" }
      ];

  const currentYearObj = managementYears.find((y) => y.id === selectedYearId);

  // Count transactions in currently selected management year
  const activeTxCount = transactions.filter((t) => {
    if (selectedYearId === "all" || !currentYearObj) return true;
    return t.date >= currentYearObj.startDate && t.date <= currentYearObj.endDate;
  }).length;

  return (
    <div className="bg-slate-900 border-b border-slate-800 text-white px-2.5 sm:px-8 py-2 flex items-center justify-between flex-nowrap gap-2 sticky top-14 md:top-0 z-30 select-none shadow-md overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-shrink">
        <div className="p-1.5 bg-blue-600/30 text-blue-400 rounded-lg border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <FolderKanban className="w-4 h-4" />
        </div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:inline flex-shrink-0">
          Management Year:
        </span>

        {/* Selected Year Badge Button */}
        <button
          onClick={onOpenModal}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-950/80 hover:bg-blue-900/80 border border-blue-500/40 text-blue-200 text-xs font-bold transition-all cursor-pointer shadow-sm group min-w-0 flex-shrink"
        >
          <Calendar className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform flex-shrink-0" />
          <span className="truncate">
            {selectedYearId === "all" || !currentYearObj
              ? "All Management Years (Cumulative)"
              : currentYearObj.label}
          </span>
          {currentYearObj && (
            <span className="text-[10px] text-blue-300/80 font-normal hidden md:inline flex-shrink-0">
              ({currentYearObj.startDate} to {currentYearObj.endDate})
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onOpenModal}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5 flex-shrink-0" />
          <span>New Management Year</span>
        </button>
      </div>
    </div>
  );
}
