import React, { useState } from "react";
import { UserProfile, UserRole } from "../types";
import { auth, db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { getUserRoleDisplay, getOrgInitials, getOrgAcronym } from "../utils";
import {
  LayoutDashboard,
  Coins,
  FileBarChart,
  Users,
  LogOut,
  Church,
  Bell,
  Mail,
  X
} from "lucide-react";

interface NavbarProps {
  userProfile: UserProfile | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  onRefreshProfile?: () => void;
}

export default function Navbar({
  userProfile,
  activeTab,
  setActiveTab,
  onLogout,
  onRefreshProfile
}: NavbarProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const handleDismissNotification = async (notificationId: string) => {
    if (!userProfile) return;
    try {
      const updatedNotifications = (userProfile.notifications || []).filter(
        (n) => n.id !== notificationId
      );
      await updateDoc(doc(db, "profiles", userProfile.uid), {
        notifications: updatedNotifications
      });
      if (onRefreshProfile) {
        onRefreshProfile();
      }
    } catch (err) {
      console.error("Failed to dismiss notification:", err);
    }
  };

  const cycleRole = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!userProfile) return;
    const roles: UserRole[] = ["viewer", "treasurer", "chairman", "admin"];
    const currentIndex = roles.indexOf(userProfile.role);
    const nextRole = roles[(currentIndex + 1) % roles.length];
    
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../firebase");
      await updateDoc(doc(db, "profiles", userProfile.uid), { role: nextRole });
      if (onRefreshProfile) {
        onRefreshProfile();
      }
    } catch (err) {
      console.error("Failed to cycle sandbox role:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onLogout();
    } catch (err) {
      console.error("Logout failed: ", err);
    }
  };

  return (
    <>
      {/* 1. Desktop Left Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-30 bg-slate-900 text-slate-300 border-r-0 shadow-lg select-none">
        {/* Brand Header */}
        <div className="p-8 flex items-center gap-3">
          {userProfile?.organizationLogo ? (
            <div className="w-8 h-8 rounded-md bg-white border border-slate-700 overflow-hidden flex items-center justify-center flex-shrink-0">
              <img src={userProfile.organizationLogo} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
          ) : (
            <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center font-black text-white text-base flex-shrink-0 shadow-xs">
              {getOrgInitials(userProfile?.organizationName)}
            </div>
          )}
          <h1 className="text-xl font-bold tracking-tight text-white font-sans truncate" title={userProfile?.organizationName || "Church Financial Management System"}>
            {getOrgAcronym(userProfile?.organizationName)}
          </h1>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 space-y-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md font-medium text-sm transition-colors text-left cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab("transactions")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md font-medium text-sm transition-colors text-left cursor-pointer ${
              activeTab === "transactions"
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Coins className="w-5 h-5" />
            Income & Expenses
          </button>

          <button
            onClick={() => setActiveTab("reports")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md font-medium text-sm transition-colors text-left cursor-pointer ${
              activeTab === "reports"
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <FileBarChart className="w-5 h-5" />
            Reports
          </button>
        </nav>

        {/* User Profile info & Logout */}
        <div className="p-6 border-t border-slate-800">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-3 min-w-0 cursor-pointer p-1.5 rounded-xl transition-all duration-200 group flex-1 ${
                activeTab === "profile" ? "bg-slate-800 border border-slate-700/50" : "hover:bg-slate-800/50"
              }`}
              title="View & Edit Profile Settings"
            >
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-200 border-2 border-slate-600 flex-shrink-0 group-hover:border-blue-500 transition-colors">
                {userProfile?.name?.slice(0, 2).toUpperCase() || "ST"}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                  {userProfile?.name || "Staff Member"}
                </div>
                <div className="mt-1 flex">
                  <span
                    onClick={cycleRole}
                    className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 border border-slate-700 cursor-pointer select-none transition-colors"
                    title="Click to cycle roles (Sandbox)"
                  >
                    {getUserRoleDisplay(userProfile)}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors cursor-pointer flex-shrink-0"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Mobile Responsive Sticky Top Header */}
      <header className="md:hidden h-14 bg-slate-900 text-white flex items-center justify-between px-4 sticky top-0 z-40 border-b border-slate-800 select-none">
        <div className="flex items-center gap-2">
          {userProfile?.organizationLogo ? (
            <div className="w-6 h-6 rounded-md bg-white border border-slate-700 overflow-hidden flex items-center justify-center flex-shrink-0">
              <img src={userProfile.organizationLogo} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
          ) : (
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center font-black text-white text-xs flex-shrink-0 shadow-xs">
              {getOrgInitials(userProfile?.organizationName)}
            </div>
          )}
          <span className="text-sm font-bold tracking-tight text-white font-sans truncate" title={userProfile?.organizationName || "Church Financial Management System"}>
            {getOrgAcronym(userProfile?.organizationName)}
          </span>
        </div>

        {userProfile && (
          <div className="flex items-center gap-2.5">
            {/* Notification Bell Dropdown Button & Popup Container */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full border border-slate-700/80 shadow-2xs transition-all cursor-pointer flex items-center justify-center focus:outline-hidden"
                title="Incoming Alerts & Bulletins"
                id="mobile-notification-bell-btn"
              >
                <Bell className="w-4 h-4" />
                {userProfile.notifications && userProfile.notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white ring-1 ring-slate-900">
                    {userProfile.notifications.length}
                  </span>
                )}
              </button>

              {/* Notification Alerts Popup Menu */}
              {notificationsOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setNotificationsOpen(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden text-left animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border-b border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-sans">
                          Incoming Alerts & Bulletins
                        </h3>
                      </div>
                      {userProfile.notifications && userProfile.notifications.length > 0 && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full font-sans">
                          {userProfile.notifications.length} new
                        </span>
                      )}
                    </div>

                    <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                      {!userProfile.notifications || userProfile.notifications.length === 0 ? (
                        <div className="p-6 text-center flex flex-col items-center justify-center gap-1.5">
                          <div className="h-8 w-8 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                            <Mail className="h-4 w-4" />
                          </div>
                          <p className="text-xs font-semibold text-slate-400">No active bulletins</p>
                          <p className="text-[10px] text-slate-300">Your ledger workspace is fully up to date.</p>
                        </div>
                      ) : (
                        userProfile.notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className="p-3 bg-white hover:bg-slate-50/50 transition-colors relative flex flex-col gap-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                <h4 className="text-xs font-bold text-slate-950 tracking-tight leading-snug">
                                  {notif.title}
                                </h4>
                                <p className="text-[9px] font-sans text-slate-400">
                                  {new Date(notif.date).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric"
                                  })}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDismissNotification(notif.id)}
                                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer flex-shrink-0"
                                title="Dismiss notification"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            
                            <p className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed font-sans">
                              {notif.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User Profile Avatar */}
            <div
              onClick={() => setActiveTab("profile")}
              className={`p-0.5 rounded-full cursor-pointer transition-all duration-200 ${
                activeTab === "profile" ? "ring-2 ring-blue-500 bg-slate-800" : "hover:bg-slate-800"
              }`}
              title="View & Edit Profile Settings"
            >
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-200 border border-slate-600 text-xs flex-shrink-0 shadow-xs">
                {userProfile?.name?.slice(0, 2).toUpperCase() || "ST"}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 3. Mobile Navigation Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 text-slate-400 grid grid-cols-3 p-1 z-40 select-none">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex flex-col items-center justify-center py-2 px-1 text-xs font-semibold cursor-pointer rounded-lg transition-colors ${
            activeTab === "dashboard"
              ? "text-white bg-slate-800"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span className="text-[9px] mt-0.5">Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab("transactions")}
          className={`flex flex-col items-center justify-center py-2 px-1 text-xs font-semibold cursor-pointer rounded-lg transition-colors ${
            activeTab === "transactions"
              ? "text-white bg-slate-800"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Coins className="h-4 w-4" />
          <span className="text-[9px] mt-0.5">Ledger</span>
        </button>

        <button
          onClick={() => setActiveTab("reports")}
          className={`flex flex-col items-center justify-center py-2 px-1 text-xs font-semibold cursor-pointer rounded-lg transition-colors ${
            activeTab === "reports"
              ? "text-white bg-slate-800"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <FileBarChart className="h-4 w-4" />
          <span className="text-[9px] mt-0.5">Reports</span>
        </button>
      </nav>
    </>
  );
}
