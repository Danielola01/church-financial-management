import React, { useState } from "react";
import { ManagementYear, UserProfile } from "../types";
import { doc, updateDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Calendar, Plus, Check, Edit2, Trash2, X, ShieldAlert, Sparkles, FolderKanban } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ManagementYearModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  selectedYearId: string; // "all" or specific ManagementYear id
  onSelectYear: (yearId: string) => void;
  onRefreshData: () => Promise<void>;
}

export default function ManagementYearModal({
  isOpen,
  onClose,
  userProfile,
  selectedYearId,
  onSelectYear,
  onRefreshData
}: ManagementYearModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingYear, setEditingYear] = useState<ManagementYear | null>(null);

  // Form states
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [setAsCurrent, setSetAsCurrent] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const managementYears: ManagementYear[] = userProfile?.managementYears && userProfile.managementYears.length > 0
    ? userProfile.managementYears
    : [
        { id: "year-2024", label: "2024 Management Year", startDate: "2024-01-01", endDate: "2024-12-31" },
        { id: "year-2025", label: "2025 Management Year", startDate: "2025-01-01", endDate: "2025-12-31" },
        { id: "year-2026", label: "2026 Management Year", startDate: "2026-01-01", endDate: "2026-12-31", isCurrent: true },
        { id: "year-2027", label: "2027 Management Year", startDate: "2027-01-01", endDate: "2027-12-31" }
      ];

  if (!isOpen) return null;

  const handleOpenCreate = () => {
    const nextYear = new Date().getFullYear() + 1;
    setLabel(`${nextYear} Management Year`);
    setStartDate(`${nextYear}-01-01`);
    setEndDate(`${nextYear}-12-31`);
    setNotes("");
    setSetAsCurrent(true);
    setEditingYear(null);
    setIsCreating(true);
    setError(null);
  };

  const handleOpenEdit = (yr: ManagementYear) => {
    setEditingYear(yr);
    setLabel(yr.label);
    setStartDate(yr.startDate);
    setEndDate(yr.endDate);
    setNotes(yr.notes || "");
    setSetAsCurrent(!!yr.isCurrent);
    setIsCreating(true);
    setError(null);
  };

  const handleSaveYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile?.uid) return;
    if (!label.trim()) {
      setError("Please provide a name/label for the management year.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Please select both start and end dates.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError("Start date cannot be after end date.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let updatedYears = [...managementYears];

      if (editingYear) {
        // Edit existing
        updatedYears = updatedYears.map((y) => {
          if (y.id === editingYear.id) {
            return {
              ...y,
              label: label.trim(),
              startDate,
              endDate,
              notes: notes.trim(),
              isCurrent: setAsCurrent ? true : y.isCurrent
            };
          }
          return setAsCurrent ? { ...y, isCurrent: false } : y;
        });
      } else {
        // Create new
        const newYear: ManagementYear = {
          id: `mgt-${Date.now()}`,
          label: label.trim(),
          startDate,
          endDate,
          notes: notes.trim(),
          isCurrent: setAsCurrent,
          createdAt: new Date().toISOString()
        };

        if (setAsCurrent) {
          updatedYears = updatedYears.map((y) => ({ ...y, isCurrent: false }));
        }
        updatedYears.push(newYear);
        onSelectYear(newYear.id);
      }

      // Sync across profile and organization members
      const profileRef = doc(db, "profiles", userProfile.uid);
      await updateDoc(profileRef, {
        managementYears: updatedYears,
        activeManagementYearId: setAsCurrent
          ? (editingYear ? editingYear.id : updatedYears[updatedYears.length - 1].id)
          : userProfile.activeManagementYearId || selectedYearId
      });

      // Update all members in same org
      if (userProfile.organizationName) {
        const orgQuery = query(
          collection(db, "profiles"),
          where("organizationName", "==", userProfile.organizationName)
        );
        const orgSnap = await getDocs(orgQuery);
        if (!orgSnap.empty) {
          const batch = writeBatch(db);
          orgSnap.docs.forEach((d) => {
            if (d.id !== userProfile.uid) {
              batch.update(d.ref, { managementYears: updatedYears });
            }
          });
          await batch.commit();
        }
      }

      await onRefreshData();
      setIsCreating(false);
      setEditingYear(null);
    } catch (err: any) {
      console.error("Failed to save management year:", err);
      handleFirestoreError(err, OperationType.WRITE, `profiles/${userProfile.uid}`);
      setError("Failed to save management year. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteYear = async (idToDelete: string) => {
    if (!userProfile?.uid) return;
    if (!window.confirm("Are you sure you want to delete this management year entry?")) return;

    setLoading(true);
    try {
      const updatedYears = managementYears.filter((y) => y.id !== idToDelete);
      const profileRef = doc(db, "profiles", userProfile.uid);
      await updateDoc(profileRef, {
        managementYears: updatedYears
      });

      if (selectedYearId === idToDelete) {
        onSelectYear("all");
      }

      await onRefreshData();
    } catch (err: any) {
      console.error("Failed to delete management year:", err);
      handleFirestoreError(err, OperationType.WRITE, `profiles/${userProfile.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 rounded-xl border border-blue-500/30 text-blue-400">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[18px] sm:text-lg font-bold font-sans">Management Years</h2>
              <p className="text-[16px] sm:text-xs text-slate-400">
                Organize and isolate financial records year-by-year
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isCreating ? (
            <>
              {/* Year Selector List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Select Active Management Year
                  </span>
                  <button
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Management Year
                  </button>
                </div>

                {/* All Years Option */}
                <div
                  onClick={() => {
                    onSelectYear("all");
                    onClose();
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedYearId === "all"
                      ? "bg-blue-50/70 border-blue-500 text-blue-900 shadow-sm ring-1 ring-blue-500"
                      : "bg-slate-50/50 border-slate-200 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="font-bold text-sm">All Management Years (Cumulative)</div>
                      <div className="text-xs text-slate-500">Show combined historical transactions across all years</div>
                    </div>
                  </div>
                  {selectedYearId === "all" && (
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* List of Management Years */}
                <div className="space-y-2 pt-1">
                  {managementYears.map((yr) => {
                    const isSelected = selectedYearId === yr.id;
                    return (
                      <div
                        key={yr.id}
                        className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                          isSelected
                            ? "bg-blue-50/70 border-blue-500 text-blue-900 shadow-sm ring-1 ring-blue-500"
                            : "bg-white border-slate-200 hover:border-slate-300 text-slate-800"
                        }`}
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => {
                            onSelectYear(yr.id);
                            onClose();
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">{yr.label}</span>
                            {yr.isCurrent && (
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            📅 {yr.startDate} to {yr.endDate}
                          </div>
                          {yr.notes && <div className="text-[11px] italic text-slate-400 mt-1">{yr.notes}</div>}
                        </div>

                        <div className="flex items-center gap-1">
                          {isSelected && (
                            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center mr-1">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(yr)}
                            title="Edit Management Year"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteYear(yr.id)}
                            title="Delete Entry"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Create / Edit Form */
            <form onSubmit={handleSaveYear} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  {editingYear ? "Edit Management Year" : "Create New Management Year"}
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Back to list
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Management Year Name / Label <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. 2027 Management Year or 2026/2027 Session"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-sans"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes / Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Executive Administration led by Reverend Daniel Ogunde"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs font-sans"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="setAsCurrent"
                  checked={setAsCurrent}
                  onChange={(e) => setSetAsCurrent(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300"
                />
                <label htmlFor="setAsCurrent" className="text-xs font-medium text-slate-700 cursor-pointer select-none">
                  Set as current active management year for organization
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {loading ? "Saving..." : editingYear ? "Update Year" : "Save Management Year"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Active Year filtering ensures accurate year-by-year auditing.</span>
          <button
            onClick={onClose}
            className="font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
