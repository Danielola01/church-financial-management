import React, { useState, useEffect } from "react";
import { doc, updateDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";
import { UserProfile } from "../types";
import { getUserRoleDisplay } from "../utils";
import {
  User,
  Mail,
  Phone,
  Building,
  Image as ImageIcon,
  Upload,
  Save,
  Shield,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  LogOut
} from "lucide-react";
import { motion } from "motion/react";

interface UserProfilePageProps {
  userProfile: UserProfile | null;
  onRefreshData: () => Promise<void>;
  onNavigateToDashboard: () => void;
  onOpenYearModal?: () => void;
  onLogout?: () => void;
}

export default function UserProfilePage({
  userProfile,
  onRefreshData,
  onNavigateToDashboard,
  onOpenYearModal,
  onLogout
}: UserProfilePageProps) {
  const [name, setName] = useState(userProfile?.name || "");
  const [phoneNumber, setPhoneNumber] = useState(userProfile?.phoneNumber || "");
  const [organizationName, setOrganizationName] = useState(userProfile?.organizationName || "");
  const [organizationType, setOrganizationType] = useState<"individual" | "organization">(
    userProfile?.organizationType || "organization"
  );
  const [organizationLogo, setOrganizationLogo] = useState<string>(userProfile?.organizationLogo || "");
  const [disableTransactionButtons, setDisableTransactionButtons] = useState(
    userProfile?.disableTransactionButtons || false
  );

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      if (onLogout) {
        onLogout();
      }
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const isChairmanOrReverend =
    userProfile?.role === "chairman" ||
    userProfile?.email === "ogundedanielola@gmail.com" ||
    getUserRoleDisplay(userProfile) === "Reverend" ||
    getUserRoleDisplay(userProfile) === "Chairman";

  const handleToggleActionButtonsDirectly = async () => {
    if (!userProfile?.uid) return;
    const newValue = !disableTransactionButtons;
    setDisableTransactionButtons(newValue);
    try {
      const profileRef = doc(db, "profiles", userProfile.uid);
      await updateDoc(profileRef, {
        disableTransactionButtons: newValue
      });
      await onRefreshData();
    } catch (err: any) {
      console.error("Error toggling action buttons:", err);
      handleFirestoreError(err, OperationType.WRITE, `profiles/${userProfile.uid}`);
    }
  };

  useEffect(() => {
    if (userProfile) {
      setName(userProfile.name || "");
      setPhoneNumber(userProfile.phoneNumber || "");
      setOrganizationName(userProfile.organizationName || "");
      setOrganizationType(userProfile.organizationType || "organization");
      setOrganizationLogo(userProfile.organizationLogo || "");
    }
  }, [userProfile]);

  useEffect(() => {
    if (userProfile) {
      setDisableTransactionButtons(userProfile.disableTransactionButtons || false);
    }
  }, [userProfile?.disableTransactionButtons]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError("Image size exceeds 2MB limit. Please select a smaller file.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setOrganizationLogo(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile?.uid) return;

    setError(null);
    setSuccess(false);

    if (!name.trim()) {
      setError("Name cannot be empty.");
      return;
    }
    if (!organizationName.trim()) {
      setError("Organisation/Individual Name cannot be empty.");
      return;
    }

    setLoading(true);
    try {
      const oldOrgName = userProfile.organizationName || "";
      const newOrgName = organizationName.trim();

      const profileRef = doc(db, "profiles", userProfile.uid);
      await updateDoc(profileRef, {
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        organizationName: newOrgName,
        organizationType,
        organizationLogo,
        disableTransactionButtons
      });

      // Seamlessly migrate existing transactions & other member profiles in background if the old organization name was changed
      if (oldOrgName && newOrgName && oldOrgName !== newOrgName) {
        try {
          // 1. Migrate transactions
          const transQuery = query(
            collection(db, "transactions"),
            where("organizationName", "==", oldOrgName)
          );
          const transSnap = await getDocs(transQuery);
          if (!transSnap.empty) {
            const batch = writeBatch(db);
            transSnap.docs.forEach((d) => {
              batch.update(d.ref, { organizationName: newOrgName });
            });
            await batch.commit();
          }

          // 2. Migrate other users in the same organization so they remain linked
          const profilesQuery = query(
            collection(db, "profiles"),
            where("organizationName", "==", oldOrgName)
          );
          const profilesSnap = await getDocs(profilesQuery);
          if (!profilesSnap.empty) {
            const batch = writeBatch(db);
            profilesSnap.docs.forEach((d) => {
              if (d.id !== userProfile.uid) {
                batch.update(d.ref, { organizationName: newOrgName });
              }
            });
            await batch.commit();
          }
        } catch (migError) {
          console.error("Non-blocking error migrating old organization data:", migError);
        }
      }

      await onRefreshData();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setError("Failed to update profile. Please try again.");
      handleFirestoreError(err, OperationType.WRITE, `profiles/${userProfile.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] sm:text-2xl font-bold text-slate-950 tracking-tight font-sans">
            User Profile Settings
          </h1>
          <p className="text-[16px] sm:text-sm text-slate-500">
            View and manage your identity, credentials, and sanctuary configurations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            <X className="h-4 w-4" />
            Back to Dashboard
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start gap-3"
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-emerald-800">Changes Saved Successfully</p>
            <p className="text-xs text-emerald-600">Your profile information and sanctuary branding parameters have been updated.</p>
          </div>
        </motion.div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3"
        >
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800">Verification Failure</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Card: Overview Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs flex flex-col items-center text-center">
            
            {/* 1. Sanctuary Logo Preview (Replaces OG avatar at the top) */}
            <div className="w-full flex flex-col items-center mb-5">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2.5">
                Sanctuary Logo Preview
              </span>
              <div className="w-full flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-100 rounded-xl min-h-[120px]">
                {organizationLogo ? (
                  <div className="relative max-w-full max-h-[100px] flex items-center justify-center overflow-hidden rounded-lg bg-white p-2 border border-slate-200 shadow-3xs">
                    <img
                      src={organizationLogo}
                      alt="Sanctuary Logo"
                      className="max-h-[80px] object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-slate-300">
                    <ImageIcon className="h-10 w-10 mb-2" />
                    <span className="text-2xs font-bold text-slate-400">No Custom Logo Configured</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Sanctuary Ledger Name (e.g., Christ Redemption Ang. Church Isapodo) */}
            <div className="w-full text-center space-y-1">
              <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                Sanctuary Ledger
              </span>
              <span className="text-base font-extrabold text-slate-900 leading-tight block">
                {userProfile?.organizationName || "Personal Ledger"}
              </span>
              <div className="pt-2 flex justify-center">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-50 text-slate-600 border border-slate-100 select-none">
                  {userProfile?.organizationType === "individual" ? "Individual" : "Organisation"}
                </span>
              </div>
            </div>

            <div className="w-full border-t border-slate-100 my-5" />

            {/* 3. User Info: Ogunde Daniel and ogundedanielola@gmail.com */}
            <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
              Staff Member
            </span>
            <h2 className="text-lg font-extrabold text-slate-900 leading-none">
              {userProfile?.name || "Staff Member"}
            </h2>
            <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-1.5 mb-3.5">
              <Mail className="h-3 w-3" />
              {userProfile?.email}
            </p>

            {/* 4. Reverend/Role display (placed below email) */}
            <div className="flex flex-wrap justify-center gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-900 text-blue-400 border border-slate-800 select-none">
                <Briefcase className="h-3 w-3" />
                {getUserRoleDisplay(userProfile)}
              </span>
            </div>

            <div className="w-full border-t border-slate-100 my-5" />

            {/* 5. Contact Line and Registration Date */}
            <div className="w-full text-left flex items-start justify-between gap-4">
              <div>
                <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  Contact Line
                </span>
                <span className="text-sm font-semibold text-slate-800 mt-0.5 block">
                  {userProfile?.phoneNumber || "No Phone Registered"}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  Registration Date
                </span>
                <span className="text-xs text-slate-500 font-mono mt-0.5 block">
                  {userProfile?.createdAt
                    ? new Date(userProfile.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric"
                      })
                    : "Unknown"}
                </span>
              </div>
            </div>

            <div className="w-full border-t border-slate-100 my-5" />

            {/* Logout Button in Profile Details */}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl border border-red-200/80 shadow-2xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <LogOut className="h-4 w-4 text-red-600" />
              Sign Out / Logout
            </button>
          </div>
        </div>

        {/* Right Card: Editor Form */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3 mb-6">
              <h2 className="text-lg font-bold text-slate-900">
                Edit Account Parameters
              </h2>
              {isChairmanOrReverend && (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block leading-none">
                    Disable Ledger Buttons
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleActionButtonsDirectly}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 ${
                      disableTransactionButtons ? "bg-red-500" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        disableTransactionButtons ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative rounded-md shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-colors"
                      placeholder="Deacon John Doe"
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Phone Number
                  </label>
                  <div className="relative rounded-md shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-colors"
                      placeholder="+234 800 123 4567"
                    />
                  </div>
                </div>

                {/* Organisation Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Organisation Type
                  </label>
                  <div className="relative rounded-md shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building className="h-4 w-4 text-slate-400" />
                    </div>
                    <select
                      value={organizationType}
                      onChange={(e) => setOrganizationType(e.target.value as "individual" | "organization")}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm appearance-none cursor-pointer"
                    >
                      <option value="individual">Individual</option>
                      <option value="organization">Organisation</option>
                    </select>
                  </div>
                </div>

                {/* Organisation / Individual Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {organizationType === "individual" ? "Individual Name" : "Organisation Name"}
                  </label>
                  <div className="relative rounded-md shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-colors"
                      placeholder={organizationType === "individual" ? "e.g. John Doe Sanctuary" : "e.g. Grace Cathedral"}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-blue-600 font-medium">
                    ✨ Renaming your organization will automatically update all existing transactions and link current members to the new name in the database. Your records will not be wiped.
                  </p>
                </div>
              </div>

              {/* Logo upload field */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Update Organisation Logo
                </label>
                <div className="mt-1 flex items-center gap-4 p-4 border border-slate-200 border-dashed rounded-2xl bg-slate-50/50">
                  <div className="flex-1">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-2xs">
                      <Upload className="h-4 w-4 text-slate-500" />
                      Upload New Image
                      <input
                         type="file"
                         accept="image/*"
                         onChange={handleLogoUpload}
                         className="hidden"
                      />
                    </label>
                    <p className="mt-1.5 text-2xs text-slate-400">Supports PNG, JPG, or SVG up to 2MB.</p>
                  </div>
                </div>
              </div>

              {/* Management Years Configuration Card */}
              {onOpenYearModal && (
                <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        <span>📅 Management Years Configuration</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Create and manage your organization's financial years year-by-year.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenYearModal}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Manage Years
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {(userProfile?.managementYears && userProfile.managementYears.length > 0
                      ? userProfile.managementYears
                      : [
                          { id: "year-2024", label: "2024 Management Year" },
                          { id: "year-2025", label: "2025 Management Year" },
                          { id: "year-2026", label: "2026 Management Year", isCurrent: true },
                          { id: "year-2027", label: "2027 Management Year" }
                        ]
                    ).map((yr: any) => (
                      <span
                        key={yr.id}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${
                          yr.isCurrent
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {yr.label} {yr.isCurrent ? "★ Active" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={onNavigateToDashboard}
                  className="px-4 py-2.5 border border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving Parameters...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Parameters
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
