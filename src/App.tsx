import React, { useState, useEffect } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "./firebase";
import { Transaction, UserProfile, UserRole, ManagementYear } from "./types";

// Component imports
import Login from "./components/Login";
import Navbar from "./components/Navbar";
import Dashboard from "./components/Dashboard";
import TransactionsList from "./components/TransactionsList";
import Reports from "./components/Reports";
import AdminPanel from "./components/AdminPanel";
import UserProfilePage from "./components/UserProfilePage";
import ManagementYearBar from "./components/ManagementYearBar";
import ManagementYearModal from "./components/ManagementYearModal";

import { Church, Loader2, Lock, CreditCard, User as UserIcon } from "lucide-react";

export default function App() {
  // Authentication states
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Core application data state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  // Management Year states
  const [selectedYearId, setSelectedYearId] = useState<string>("year-2026");
  const [isYearModalOpen, setIsYearModalOpen] = useState(false);

  // Navigation state
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Inter-tab communication: Quick add action from Dashboard
  const [quickAddType, setQuickAddType] = useState<"income" | "expense" | null>(null);

  // Subscription state
  const [renewing, setRenewing] = useState(false);

  // Listen to Auth State Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      if (user) {
        setCurrentUser(user);
        setActiveTab("dashboard");
        
        // Fetch user profile from Firestore
        const profileRef = doc(db, "profiles", user.uid);
        let profileSnap;
        try {
          profileSnap = await getDoc(profileRef);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `profiles/${user.uid}`);
          setAuthLoading(false);
          return;
        }

        if (profileSnap.exists()) {
          const data = profileSnap.data();
          let currentRole = (data.role as UserRole) || "treasurer";
          let currentName = data.name || "Staff Member";
          let currentOrgName = data.organizationName || "Personal Ledger";
          let currentOrgType = data.organizationType || "individual";
          let needsUpdate = false;
          
          if ((user.email === "ogundedanielola@gmail.com" || user.email === "demotest@gmail.com") && currentRole !== "admin") {
            currentRole = "admin";
            needsUpdate = true;
          }

          if (user.email === "ogundedanielola@gmail.com" && (currentName === "Staff Member" || currentName === "User" || !currentName)) {
            currentName = "Revd. Daniel O. Ogunde";
            currentOrgName = "Church Financial Management System";
            currentOrgType = "organization";
            needsUpdate = true;
          } else if (user.email === "demotest@gmail.com" && (currentName === "Staff Member" || currentName === "User" || !currentName)) {
            currentName = "Mr. Lukmon Olowu";
            currentOrgName = "Personal Ledger";
            currentOrgType = "individual";
            needsUpdate = true;
          }

          if (needsUpdate) {
            try {
              await setDoc(profileRef, { 
                role: currentRole, 
                name: currentName, 
                organizationName: currentOrgName, 
                organizationType: currentOrgType 
              }, { merge: true });
            } catch (err) {
              console.error("Auto promotion and name update error:", err);
            }
          }

          setUserProfile({
            uid: user.uid,
            name: currentName,
            email: data.email || user.email || "",
            role: currentRole,
            createdAt: data.createdAt || new Date().toISOString(),
            organizationType: currentOrgType,
            organizationLogo: data.organizationLogo || "",
            phoneNumber: data.phoneNumber || "",
            organizationName: currentOrgName,
            paymentStatus: data.paymentStatus || "none",
            paymentDate: data.paymentDate || "",
            paymentEndDate: data.paymentEndDate || "",
            notifications: data.notifications || [],
            disableTransactionButtons: data.disableTransactionButtons || false,
            managementYears: data.managementYears || [],
            activeManagementYearId: data.activeManagementYearId || "year-2026",
            vicarName: data.vicarName || data.chairmanName || "",
            vicarTitle: data.vicarTitle || data.chairmanTitle || "The Vicar",
            chairmanName: data.chairmanName || data.vicarName || "",
            chairmanTitle: data.chairmanTitle || data.vicarTitle || "The Chairman",
            treasurerName: data.treasurerName || "",
            treasurerTitle: data.treasurerTitle || "The Treasurer",
            dioceseName: data.dioceseName || ""
          });
          if (data.activeManagementYearId) {
            setSelectedYearId(data.activeManagementYearId);
          }
        } else {
          // Fallback profile document creation to guarantee success for standard signups
          const defaultRole = (user.email === "ogundedanielola@gmail.com" || user.email === "demotest@gmail.com") ? "admin" : "treasurer";
          let defaultName = user.displayName || "Staff Member";
          let defaultOrgName = "Personal Ledger";
          let defaultOrgType: "individual" | "organization" = "individual";

          if (user.email === "ogundedanielola@gmail.com") {
            defaultName = "Revd. Daniel O. Ogunde";
            defaultOrgName = "Church Financial Management System";
            defaultOrgType = "organization";
          } else if (user.email === "demotest@gmail.com") {
            defaultName = "Mr. Lukmon Olowu";
            defaultOrgName = "Personal Ledger";
            defaultOrgType = "individual";
          }

          const defaultProfile: UserProfile = {
            uid: user.uid,
            name: defaultName,
            email: user.email || "",
            role: defaultRole,
            organizationType: defaultOrgType,
            organizationLogo: "",
            phoneNumber: "",
            organizationName: defaultOrgName,
            createdAt: new Date().toISOString(),
            disableTransactionButtons: false
          };
          try {
            await setDoc(profileRef, defaultProfile);
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `profiles/${user.uid}`);
          }
          setUserProfile(defaultProfile);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen to Transactions Collection in Real-Time
  useEffect(() => {
    if (!currentUser || !userProfile?.organizationName) {
      setTransactions([]);
      return;
    }

    setTransactionsLoading(true);
    const q = query(
      collection(db, "transactions"),
      where("organizationName", "==", userProfile.organizationName),
      orderBy("date", "desc")
    );
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Transaction[] = [];
        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          list.push({
            id: docSnapshot.id,
            type: data.type,
            date: data.date,
            amount: data.amount,
            category: data.category,
            description: data.description || "",
            recordedBy: data.recordedBy || "System",
            recordedByUid: data.recordedByUid || "",
            receiptImage: data.receiptImage || "",
            createdAt: data.createdAt || ""
          });
        });
        setTransactions(list);
        setTransactionsLoading(false);
      },
      (error) => {
        console.error("Error fetching real-time transactions:", error);
        setTransactionsLoading(false);
        handleFirestoreError(error, OperationType.LIST, "transactions");
      }
    );

    return () => unsubscribe();
  }, [currentUser, userProfile?.organizationName]);

  // Listen to Organization Profiles to dynamically reflect registered Treasurer / Signatories
  useEffect(() => {
    if (!currentUser || !userProfile?.organizationName) return;

    const orgProfilesQuery = query(
      collection(db, "profiles"),
      where("organizationName", "==", userProfile.organizationName)
    );

    const unsubscribe = onSnapshot(
      orgProfilesQuery,
      (snapshot) => {
        let orgTreasurerName = "";
        let orgTreasurerTitle = "The Treasurer";
        let orgVicarName = "";
        let orgVicarTitle = "The Vicar";

        snapshot.forEach((docSnap) => {
          const p = docSnap.data();
          if (p.treasurerName && p.treasurerName.trim() !== "") {
            orgTreasurerName = p.treasurerName.trim();
            if (p.treasurerTitle) orgTreasurerTitle = p.treasurerTitle.trim();
          } else if (p.role === "treasurer" && p.name && p.name.trim() !== "") {
            orgTreasurerName = p.name.trim();
          }

          if (p.vicarName && p.vicarName.trim() !== "") {
            orgVicarName = p.vicarName.trim();
            if (p.vicarTitle) orgVicarTitle = p.vicarTitle.trim();
          } else if (p.role === "chairman" && p.name && p.name.trim() !== "") {
            orgVicarName = p.name.trim();
          }
        });

        setUserProfile((prev) => {
          if (!prev) return prev;
          let changed = false;
          const updated = { ...prev };

          // Automatically inherit registered Treasurer if current profile has none set or needs sync
          if (orgTreasurerName && prev.treasurerName !== orgTreasurerName) {
            updated.treasurerName = orgTreasurerName;
            updated.treasurerTitle = orgTreasurerTitle;
            changed = true;
          }

          if (orgVicarName && !prev.vicarName && !prev.chairmanName) {
            updated.vicarName = orgVicarName;
            updated.vicarTitle = orgVicarTitle;
            changed = true;
          }

          return changed ? updated : prev;
        });
      },
      (err) => {
        console.warn("Non-blocking org profiles sync error:", err);
      }
    );

    return () => unsubscribe();
  }, [currentUser, userProfile?.organizationName]);

  // Auth Handler: Refresh Profile
  const handleRefreshProfile = async () => {
    if (!currentUser) return;
    const profileRef = doc(db, "profiles", currentUser.uid);
    try {
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        const data = profileSnap.data();
        let currentRole = (data.role as UserRole) || "treasurer";
        let currentName = data.name || "Staff Member";
        let currentOrgName = data.organizationName || "Personal Ledger";
        let currentOrgType = data.organizationType || "individual";
        let needsUpdate = false;

        if ((currentUser.email === "ogundedanielola@gmail.com" || currentUser.email === "demotest@gmail.com") && currentRole !== "admin") {
          currentRole = "admin";
          needsUpdate = true;
        }

        if (currentUser.email === "ogundedanielola@gmail.com" && (currentName === "Staff Member" || currentName === "User" || !currentName)) {
          currentName = "Revd. Daniel O. Ogunde";
          currentOrgName = "Church Financial Management System";
          currentOrgType = "organization";
          needsUpdate = true;
        } else if (currentUser.email === "demotest@gmail.com" && (currentName === "Staff Member" || currentName === "User" || !currentName)) {
          currentName = "Mr. Lukmon Olowu";
          currentOrgName = "Personal Ledger";
          currentOrgType = "individual";
          needsUpdate = true;
        }

        if (needsUpdate) {
          try {
            await setDoc(profileRef, { 
              role: currentRole, 
              name: currentName, 
              organizationName: currentOrgName, 
              organizationType: currentOrgType 
            }, { merge: true });
          } catch (err) {
            console.error("Auto promotion and name update error on refresh:", err);
          }
        }

        setUserProfile({
          uid: currentUser.uid,
          name: currentName,
          email: data.email || currentUser.email || "",
          role: currentRole,
          createdAt: data.createdAt || "",
          organizationType: currentOrgType,
          organizationLogo: data.organizationLogo || "",
          phoneNumber: data.phoneNumber || "",
          organizationName: currentOrgName,
          paymentStatus: data.paymentStatus || "none",
          paymentDate: data.paymentDate || "",
          paymentEndDate: data.paymentEndDate || "",
          notifications: data.notifications || [],
          disableTransactionButtons: data.disableTransactionButtons || false,
          managementYears: data.managementYears || [],
          activeManagementYearId: data.activeManagementYearId || "year-2026"
        });
        if (data.activeManagementYearId) {
          setSelectedYearId(data.activeManagementYearId);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `profiles/${currentUser.uid}`);
    }
  };

  // Handle manual renewal of paused subscription
  const handleRenewSubscription = async () => {
    if (!currentUser) return;
    try {
      setRenewing(true);
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const profileRef = doc(db, "profiles", currentUser.uid);
      await setDoc(profileRef, {
        paymentStatus: "active",
        paymentDate: now.toISOString(),
        paymentEndDate: thirtyDaysFromNow.toISOString()
      }, { merge: true });

      await handleRefreshProfile();
    } catch (err) {
      console.error("Failed to renew subscription:", err);
    } finally {
      setRenewing(false);
    }
  };

  // Nav helper from Dashboard to Quick Add Modal in Transactions
  const handleQuickAdd = (type: "income" | "expense") => {
    setQuickAddType(type);
    setActiveTab("transactions");
  };

  // 1. Loading State Screen (Check authentication)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center animate-bounce shadow-md">
          <Church className="h-6 w-6 text-white" />
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 font-mono mt-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Verifying security authorization...
        </div>
      </div>
    );
  }

  // 2. Unauthenticated state Screen (Login)
  if (!currentUser) {
    return <Login onLoginSuccess={handleRefreshProfile} />;
  }

  // Calculate management years list and filter transactions
  const managementYears: ManagementYear[] = userProfile?.managementYears && userProfile.managementYears.length > 0
    ? userProfile.managementYears
    : [
        { id: "year-2024", label: "2024 Management Year", startDate: "2024-01-01", endDate: "2024-12-31" },
        { id: "year-2025", label: "2025 Management Year", startDate: "2025-01-01", endDate: "2025-12-31" },
        { id: "year-2026", label: "2026 Management Year", startDate: "2026-01-01", endDate: "2026-12-31", isCurrent: true },
        { id: "year-2027", label: "2027 Management Year", startDate: "2027-01-01", endDate: "2027-12-31" }
      ];

  const currentYearObj = managementYears.find((y) => y.id === selectedYearId);

  const filteredTransactions = transactions.filter((t) => {
    if (selectedYearId === "all" || !currentYearObj) return true;
    return t.date >= currentYearObj.startDate && t.date <= currentYearObj.endDate;
  });

  // 3. Authenticated Content
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Dynamic left sidebar or mobile top/bottom bars */}
      <Navbar
        userProfile={userProfile}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRefreshProfile={handleRefreshProfile}
        onLogout={() => {
          setCurrentUser(null);
          setUserProfile(null);
        }}
      />

      {/* Main viewport area shifted right for sidebar on desktop, and padded bottom for bottom navigation on mobile */}
      <main className="flex-1 md:pl-64 min-w-0 pb-20 md:pb-0">
        {/* Management Year Header Switcher Bar */}
        <ManagementYearBar
          userProfile={userProfile}
          selectedYearId={selectedYearId}
          onOpenModal={() => setIsYearModalOpen(true)}
          transactions={transactions}
        />

        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {transactionsLoading && transactions.length === 0 ? (
            <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-1.5">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-2xs font-bold tracking-wider font-mono uppercase">
                Reading sanctuary ledger database...
              </p>
            </div>
          ) : (
            <div className="animate-in fade-in duration-200">
              {activeTab === "dashboard" && (
                <Dashboard
                  transactions={filteredTransactions}
                  userProfile={userProfile}
                  onNavigateToTransactions={() => setActiveTab("transactions")}
                  onQuickAdd={handleQuickAdd}
                  onRefreshProfile={handleRefreshProfile}
                  onNavigateToProfile={() => setActiveTab("profile")}
                />
              )}

              {activeTab === "transactions" && (
                <TransactionsList
                  transactions={filteredTransactions}
                  userProfile={userProfile}
                  onRefresh={handleRefreshProfile}
                  quickAddType={quickAddType}
                  setQuickAddType={setQuickAddType}
                />
              )}

              {activeTab === "reports" && (
                <Reports
                  transactions={filteredTransactions}
                  userProfile={userProfile}
                  onQuickAdd={handleQuickAdd}
                />
              )}

              {activeTab === "admin" && (userProfile?.role === "admin" || userProfile?.role === "chairman") && (
                <AdminPanel
                  currentUserProfile={userProfile}
                  onRefreshData={handleRefreshProfile}
                />
              )}

              {activeTab === "profile" && (
                <UserProfilePage
                  userProfile={userProfile}
                  onRefreshData={handleRefreshProfile}
                  onNavigateToDashboard={() => setActiveTab("dashboard")}
                  onOpenYearModal={() => setIsYearModalOpen(true)}
                  onLogout={() => auth.signOut()}
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Management Year Creation & Switcher Modal */}
      <ManagementYearModal
        isOpen={isYearModalOpen}
        onClose={() => setIsYearModalOpen(false)}
        userProfile={userProfile}
        selectedYearId={selectedYearId}
        onSelectYear={(yrId) => setSelectedYearId(yrId)}
        onRefreshData={handleRefreshProfile}
      />

      {/* Universal Glassmorphic Subscription Ended Overlay */}
      {userProfile?.paymentStatus === "paused" && activeTab !== "profile" && (
        <div className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="bg-white/95 border border-white/80 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] rounded-2xl max-w-sm w-full p-8 text-center flex flex-col items-center gap-5 animate-in zoom-in-95 duration-200">
            {/* Soft high-contrast icon circle */}
            <div className="h-14 w-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center ring-8 ring-red-500/10 flex-shrink-0">
              <Lock className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
                Subscription Ended
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed font-sans px-1">
                Your subscription has expired. Please contact support or your administrator to restore access to your workspace.
              </p>
            </div>

            {/* View Profile Option */}
            <button
              onClick={() => setActiveTab("profile")}
              className="w-full py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-sans font-semibold text-xs uppercase tracking-wider rounded-xl border border-slate-200 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
            >
              <UserIcon className="w-4 h-4" />
              View Profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
