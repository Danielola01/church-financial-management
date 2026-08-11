import React, { useState, useEffect } from "react";
import { UserProfile, UserRole } from "../types";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { getUserRoleDisplay } from "../utils";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  writeBatch,
  query,
  where,
  arrayUnion
} from "firebase/firestore";
import {
  Users,
  ShieldAlert,
  RefreshCw,
  Play,
  Pause,
  Clock,
  Building,
  User,
  Phone,
  Mail,
  Calendar,
  Shield,
  Activity,
  CheckCircle,
  Database,
  AlertTriangle,
  CreditCard,
  Search,
  Filter,
  DollarSign,
  AlertCircle,
  Send,
  X
} from "lucide-react";

// Live Ticking Countdown Component for Active Payments
function PaymentCountdown({ endDate, status }: { endDate?: string; status?: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (status !== "active" || !endDate) {
      setTimeLeft("");
      return;
    }

    const calculateTimeLeft = () => {
      const difference = +new Date(endDate) - +new Date();
      if (difference <= 0) {
        return "Expired";
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0 || days > 0) parts.push(`${hours}h`);
      if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);

      return parts.join(" ");
    };

    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, [endDate, status]);

  if (status !== "active" || !endDate) {
    return <span className="text-slate-400 font-mono text-2xs">—</span>;
  }

  if (timeLeft === "Expired") {
    return <span className="text-red-600 font-bold text-2xs uppercase tracking-wider">Expired</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 animate-pulse">
      <Clock className="w-3.5 h-3.5" />
      {timeLeft}
    </span>
  );
}

interface GroupedProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  organizationType: string;
  organizationLogo: string;
  phoneNumber: string;
  organizationName: string;
  paymentStatus: string;
  paymentDate: string;
  paymentEndDate: string;
  members: UserProfile[];
}

interface AdminPanelProps {
  currentUserProfile: UserProfile | null;
  onRefreshData: () => void;
}

export default function AdminPanel({
  currentUserProfile,
  onRefreshData
}: AdminPanelProps) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "individual" | "organization">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "expired" | "none">("all");

  // Message Modal States
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<GroupedProfile | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const handleOpenMessageModal = (profile: GroupedProfile) => {
    setSelectedProfile(profile);
    const orgOrIndiv = profile.organizationName || "your ledger";
    setCustomMessage(
      `Hello members of ${orgOrIndiv},\n\nThis is a friendly reminder that your subscription lease for ${orgOrIndiv} is due for renewal soon. To prevent any service interruption, please process your payment renewal.\n\nThank you for using our platform!\n\nBest regards,\nAdministration Team`
    );
    setMessageModalOpen(true);
  };

  const handleSendMessage = async () => {
    if (!selectedProfile) return;
    try {
      setSendingMessage(true);
      const batch = writeBatch(db);
      const newNotificationId = Math.random().toString(36).substring(2, 11);
      const newNotification = {
        id: newNotificationId,
        title: "Subscription Renewal Reminder",
        message: customMessage,
        date: new Date().toISOString(),
        read: false,
        senderName: currentUserProfile?.name || "Sanctuary Admin"
      };

      for (const m of selectedProfile.members) {
        const profileRef = doc(db, "profiles", m.uid);
        batch.update(profileRef, {
          notifications: arrayUnion(newNotification)
        });
      }
      await batch.commit();

      setFeedbackMessage({
        text: `Reminder notification message successfully sent to all ${selectedProfile.members.length} members of ${selectedProfile.organizationName}!`,
        type: "success"
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
      setMessageModalOpen(false);
      setSelectedProfile(null);
      setCustomMessage("");
    } catch (err) {
      console.error("Failed to send message:", err);
      setFeedbackMessage({ text: "Failed to send message.", type: "error" });
    } finally {
      setSendingMessage(false);
    }
  };

  // Fetch all user profiles from the entire system
  const fetchProfiles = async () => {
    try {
      setLoading(true);
      // Fetch ALL profiles without restriction to show global subscribers
      const querySnapshot = await getDocs(collection(db, "profiles"));
      const list: UserProfile[] = [];
      querySnapshot.forEach((document) => {
        const data = document.data();
        const email = data.email || "";
        const emailLower = email.toLowerCase();
        const orgNameLower = (data.organizationName || "Personal Ledger").toLowerCase().trim();
        const nameLower = (data.name || "").toLowerCase();

        // Filter out admin, Personal Ledger, Demo Church, Demo test, and demo quick-login profiles
        const isExcluded = 
          emailLower.includes("demo-auth-only") ||
          orgNameLower === "personal ledger" ||
          orgNameLower === "demo church" ||
          emailLower === "demotest@gmail.com" ||
          nameLower.includes("demo test") ||
          emailLower.startsWith("demo.") ||
          emailLower.includes("@churchfinance.org");

        if (!isExcluded) {
          list.push({
            uid: document.id,
            name: data.name || "Anonymous",
            email: email,
            role: (data.role || "treasurer") as UserRole,
            createdAt: data.createdAt || "",
            organizationType: data.organizationType || "organization",
            organizationLogo: data.organizationLogo || "",
            phoneNumber: data.phoneNumber || "",
            organizationName: data.organizationName || "Personal Ledger",
            paymentStatus: data.paymentStatus || "none",
            paymentDate: data.paymentDate || "",
            paymentEndDate: data.paymentEndDate || ""
          });
        }
      });
      setProfiles(list);
    } catch (err) {
      console.error("Failed to load user profiles:", err);
      handleFirestoreError(err, OperationType.LIST, "profiles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  // Action: Mark as Paid (Activate for 30 days)
  const handleActivatePayment = async (members: UserProfile[]) => {
    try {
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const batch = writeBatch(db);
      for (const m of members) {
        const profileRef = doc(db, "profiles", m.uid);
        batch.update(profileRef, {
          paymentStatus: "active",
          paymentDate: now.toISOString(),
          paymentEndDate: thirtyDaysFromNow.toISOString()
        });
      }
      await batch.commit();

      setFeedbackMessage({
        text: `Payment successfully activated! License extended for 30 days for all ${members.length} member(s).`,
        type: "success"
      });
      setTimeout(() => setFeedbackMessage(null), 4000);

      fetchProfiles();
    } catch (err) {
      console.error("Failed to activate payment:", err);
      setFeedbackMessage({ text: "Failed to activate payment.", type: "error" });
    }
  };

  // Action: Pause Subscriber
  const handlePausePayment = async (members: UserProfile[]) => {
    try {
      const batch = writeBatch(db);
      for (const m of members) {
        const profileRef = doc(db, "profiles", m.uid);
        batch.update(profileRef, {
          paymentStatus: "paused"
        });
      }
      await batch.commit();

      setFeedbackMessage({
        text: `Subscription successfully paused for all ${members.length} member(s).`,
        type: "success"
      });
      setTimeout(() => setFeedbackMessage(null), 4000);

      fetchProfiles();
    } catch (err) {
      console.error("Failed to pause payment:", err);
      setFeedbackMessage({ text: "Failed to pause payment.", type: "error" });
    }
  };

  // Helper: Seed sample transactions for current organization
  const handleSeedData = async () => {
    if (
      !confirm(
        "This will append 12 realistic financial transaction records (tithes, offerings, operational utility bills, repairs, rent) to your current organization ledger. Proceed?"
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const transColRef = collection(db, "transactions");

      const today = new Date();
      const getPastDateStr = (daysAgo: number) => {
        const d = new Date();
        d.setDate(today.getDate() - daysAgo);
        return d.toISOString().split("T")[0];
      };

      const sampleRecords = [
        {
          type: "income",
          category: "Offering",
          amount: 1450.0,
          date: getPastDateStr(2),
          description: "Weekly Sunday main service general collections.",
          recordedBy: "Deacon John Doe",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "income",
          category: "Tithe",
          amount: 3200.0,
          date: getPastDateStr(4),
          description: "Monthly covenant tithes from members.",
          recordedBy: "Deaconess Alice",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "expense",
          category: "Electricity",
          amount: 420.5,
          date: getPastDateStr(5),
          description: "Grace Sanctuary main auditorium utility power payment.",
          recordedBy: "Peter",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "income",
          category: "Thanksgiving",
          amount: 1800.0,
          date: getPastDateStr(10),
          description: "Annual family thanksgiving offerings collection.",
          recordedBy: "Deacon John Doe",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "expense",
          category: "Rent",
          amount: 1500.0,
          date: getPastDateStr(15),
          description: "Sanctuary educational annex property rent.",
          recordedBy: "Deacon John Doe",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "income",
          category: "Building Fund",
          amount: 5000.0,
          date: getPastDateStr(25),
          description: "Special donations for building foundation expansion work.",
          recordedBy: "Deacon John Doe",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "expense",
          category: "Equipment",
          amount: 850.0,
          date: getPastDateStr(35),
          description: "Purchased 2 wireless microphone receivers and vocal mics.",
          recordedBy: "Peter",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "expense",
          category: "Transport",
          amount: 230.0,
          date: getPastDateStr(45),
          description: "Youth outreach bus fueling & parking fees.",
          recordedBy: "Deacon John Doe",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "income",
          category: "Donation",
          amount: 1200.0,
          date: getPastDateStr(55),
          description: "Charity foundation anonymous gift.",
          recordedBy: "Deacon John Doe",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "expense",
          category: "Welfare",
          amount: 350.0,
          date: getPastDateStr(65),
          description: "Emergency member support package payout.",
          recordedBy: "Peter",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "income",
          category: "Tithe",
          amount: 2800.0,
          date: getPastDateStr(75),
          description: "Staff and community covenant tithes.",
          recordedBy: "Deacon John Doe",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        },
        {
          type: "expense",
          category: "Repairs",
          amount: 600.0,
          date: getPastDateStr(95),
          description: "Plumbing maintenance & leakage repair in restrooms.",
          recordedBy: "Peter",
          recordedByUid: "demo-auditor",
          createdAt: new Date().toISOString()
        }
      ];

      for (const rec of sampleRecords) {
        const docRef = doc(transColRef);
        batch.set(docRef, {
          ...rec,
          organizationName: currentUserProfile?.organizationName || "Personal Ledger"
        });
      }

      await batch.commit();

      setFeedbackMessage({
        text: "Sample transaction data ledger seeded successfully!",
        type: "success"
      });
      setTimeout(() => setFeedbackMessage(null), 3500);

      onRefreshData();
    } catch (err) {
      console.error("Failed to seed sample data:", err);
      handleFirestoreError(err, OperationType.WRITE, "transactions");
    } finally {
      setLoading(false);
    }
  };

  // Helper: Clear current organization's ledger
  const handleClearDatabase = async () => {
    if (
      !confirm(
        "CRITICAL WARNING: This will permanently delete ALL recorded transactions in your current organization's database. This action is IRREVERSIBLE. Do you wish to proceed?"
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      let querySnapshot;
      try {
        const q = query(
          collection(db, "transactions"),
          where("organizationName", "==", currentUserProfile?.organizationName || "Personal Ledger")
        );
        querySnapshot = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "transactions");
        return;
      }
      const batch = writeBatch(db);

      querySnapshot.forEach((document) => {
        batch.delete(doc(db, "transactions", document.id));
      });

      await batch.commit();

      setFeedbackMessage({
        text: "All transactional records cleared successfully. Database is now empty.",
        type: "success"
      });
      setTimeout(() => setFeedbackMessage(null), 3500);

      onRefreshData();
    } catch (err) {
      console.error("Failed to reset database:", err);
      handleFirestoreError(err, OperationType.DELETE, "transactions");
    } finally {
      setLoading(false);
    }
  };

  // Format Helper: Clean Dates
  const formatDate = (isoString?: string) => {
    if (!isoString) return "Not Recorded";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "Not Recorded";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Helper to group profiles by organization
  const groupProfilesByOrg = (rawProfiles: UserProfile[]): GroupedProfile[] => {
    const groups: { [key: string]: UserProfile[] } = {};
    
    rawProfiles.forEach((p) => {
      const orgName = (p.organizationName || "Personal Ledger").trim();
      const orgKey = orgName.toLowerCase();
      if (!groups[orgKey]) {
        groups[orgKey] = [];
      }
      groups[orgKey].push(p);
    });

    return Object.values(groups).map((members) => {
      const repWithLogo = members.find((m) => m.organizationLogo) || members[0];
      const rep = members[0];

      // Most favorable payment status: if any is active, the whole org is active
      let paymentStatus = "none";
      let paymentDate = "";
      let paymentEndDate = "";

      const activeMember = members.find((m) => {
        const isPastEnd = m.paymentEndDate ? new Date(m.paymentEndDate) < new Date() : false;
        return m.paymentStatus === "active" && !isPastEnd;
      });

      if (activeMember) {
        paymentStatus = "active";
        paymentDate = activeMember.paymentDate || "";
        paymentEndDate = activeMember.paymentEndDate || "";
      } else {
        const pausedMember = members.find((m) => m.paymentStatus === "paused");
        if (pausedMember) {
          paymentStatus = "paused";
          paymentDate = pausedMember.paymentDate || "";
          paymentEndDate = pausedMember.paymentEndDate || "";
        } else {
          const expiredMember = members.find((m) => m.paymentStatus === "expired");
          if (expiredMember) {
            paymentStatus = "expired";
            paymentDate = expiredMember.paymentDate || "";
            paymentEndDate = expiredMember.paymentEndDate || "";
          } else {
            paymentStatus = rep.paymentStatus || "none";
            paymentDate = rep.paymentDate || "";
            paymentEndDate = rep.paymentEndDate || "";
          }
        }
      }

      return {
        uid: rep.uid,
        name: members.map((m) => m.name).join(", "),
        email: members.map((m) => m.email).join(", "),
        role: rep.role,
        organizationType: rep.organizationType || "organization",
        organizationLogo: repWithLogo.organizationLogo || "",
        phoneNumber: members.map((m) => m.phoneNumber).filter(Boolean).join(", "),
        organizationName: rep.organizationName || "Personal Ledger",
        paymentStatus,
        paymentDate,
        paymentEndDate,
        members
      };
    });
  };

  // Grouped profiles list
  const groupedProfiles = groupProfilesByOrg(profiles);

  // Filtered profiles
  const filteredProfiles = groupedProfiles.filter((p) => {
    const queryLower = searchQuery.toLowerCase();
    
    // Matches search on organization name, or any of its members' name/email/phone
    const matchesSearch =
      p.organizationName.toLowerCase().includes(queryLower) ||
      p.members.some(m => 
        m.name.toLowerCase().includes(queryLower) || 
        m.email.toLowerCase().includes(queryLower) ||
        (m.phoneNumber || "").toLowerCase().includes(queryLower)
      );

    const matchesType = typeFilter === "all" || p.organizationType === typeFilter;
    
    // Status filter
    let matchesStatus = true;
    if (statusFilter !== "all") {
      const status = p.paymentStatus || "none";
      if (statusFilter === "expired") {
        const isPastEnd = p.paymentEndDate ? new Date(p.paymentEndDate) < new Date() : false;
        matchesStatus = status === "expired" || (status === "active" && isPastEnd);
      } else if (statusFilter === "active") {
        const isPastEnd = p.paymentEndDate ? new Date(p.paymentEndDate) < new Date() : false;
        matchesStatus = status === "active" && !isPastEnd;
      } else {
        matchesStatus = status === statusFilter;
      }
    }

    return matchesSearch && matchesType && matchesStatus;
  });

  // Calculate Metrics
  const totalAccounts = profiles.length; // counts individual accounts
  const activeSubs = groupedProfiles.filter((p) => {
    const isPastEnd = p.paymentEndDate ? new Date(p.paymentEndDate) < new Date() : false;
    return p.paymentStatus === "active" && !isPastEnd;
  }).length;
  const pausedSubs = groupedProfiles.filter((p) => p.paymentStatus === "paused").length;
  const inactiveSubs = groupedProfiles.length - activeSubs - pausedSubs;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div>
        <h1 className="text-[18px] sm:text-2xl font-bold text-slate-950 tracking-tight font-sans">
          Sanctuary Administration Center
        </h1>
        <p className="text-[16px] sm:text-sm text-slate-500">
          Monitor subscriptions, register payments, manage user credentials, and control systems globally.
        </p>
      </div>

      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl flex items-center gap-2.5 text-xs font-bold border animate-in fade-in duration-150 ${
            feedbackMessage.type === "success"
              ? "bg-emerald-50 border-emerald-100 text-emerald-800"
              : "bg-red-50 border-red-100 text-red-800"
          }`}
        >
          {feedbackMessage.type === "success" ? (
            <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          )}
          <p>{feedbackMessage.text}</p>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Registered */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4">
          <div className="p-3 bg-slate-50 rounded-xl text-slate-600 border border-slate-100">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-4xs font-extrabold text-slate-400 uppercase tracking-widest">
              Total Accounts
            </span>
            <span className="text-lg font-bold text-slate-900">{totalAccounts}</span>
          </div>
        </div>

        {/* Active Subscribers */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 border border-emerald-100">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-4xs font-extrabold text-slate-400 uppercase tracking-widest">
              Active Leases
            </span>
            <span className="text-lg font-bold text-emerald-700">{activeSubs}</span>
          </div>
        </div>

        {/* Paused Accounts */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600 border border-amber-100">
            <Pause className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-4xs font-extrabold text-slate-400 uppercase tracking-widest">
              Paused Leases
            </span>
            <span className="text-lg font-bold text-amber-700">{pausedSubs}</span>
          </div>
        </div>

        {/* Unpaid / Expired */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-3xs flex items-center gap-4">
          <div className="p-3 bg-red-50 rounded-xl text-red-600 border border-red-100">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-4xs font-extrabold text-slate-400 uppercase tracking-widest">
              Pending / Expired
            </span>
            <span className="text-lg font-bold text-red-700">{inactiveSubs}</span>
          </div>
        </div>
      </div>

      {/* Main interactive table & filters section */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
        {/* Search and Filters Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-50 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Subscriber Accounts Registry
            </h2>
            <p className="text-xs text-slate-400">
              Manage client details, logos, phone lines, payment timers, and subscription states.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchProfiles}
              className="p-2 text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              title="Sync subscribers list"
            >
              <RefreshCw className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Live Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
          {/* Search text */}
          <div className="relative">
            <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, org..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-slate-700 bg-white cursor-pointer focus:outline-hidden"
            >
              <option value="all">All Entity Types</option>
              <option value="organization">Organisation Only</option>
              <option value="individual">Individual Only</option>
            </select>
          </div>

          {/* Subscription Status Filter */}
          <div className="flex items-center gap-2">
            <CreditCard className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-slate-700 bg-white cursor-pointer focus:outline-hidden"
            >
              <option value="all">All Subscription States</option>
              <option value="active">Active Leases</option>
              <option value="paused">Paused Leases</option>
              <option value="expired">Expired Leases</option>
              <option value="none">No Logged Payments</option>
            </select>
          </div>
        </div>

        {/* Global Accounts Bento Grid */}
        {filteredProfiles.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 text-xs font-bold font-mono uppercase">
              No subscriber records found matching current query.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProfiles.map((p) => {
              const isPastEnd = p.paymentEndDate ? new Date(p.paymentEndDate) < new Date() : false;
              const currentStatus = p.paymentStatus || "none";
              const resolvedStatus = (currentStatus === "active" && isPastEnd) ? "expired" : currentStatus;

              return (
                <div key={p.uid} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-200 hover:shadow-sm transition-all duration-200 relative overflow-hidden group font-poppins">
                  
                  {/* Card Content */}
                  <div className="space-y-4">
                    {/* Header: Logo and Entity Title */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl border border-slate-100 bg-slate-50 p-2 flex items-center justify-center flex-shrink-0">
                          {p.organizationLogo ? (
                            <img
                              src={p.organizationLogo}
                              alt="Client Logo"
                              className="max-w-full max-h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Building className="w-6 h-6 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900 leading-snug group-hover:text-blue-600 transition-colors">
                            {p.organizationName || "Personal Ledger"}
                          </h3>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-slate-100 text-slate-500 mt-1">
                            {p.organizationType === "individual" ? "Individual" : "Organisation"}
                          </span>
                        </div>
                      </div>

                      {/* Subscription State Badge */}
                      <div className="flex-shrink-0">
                        {resolvedStatus === "active" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                            Active
                          </span>
                        )}
                        {resolvedStatus === "paused" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100">
                            Paused
                          </span>
                        )}
                        {resolvedStatus === "expired" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-red-50 text-red-700 border border-red-100">
                            Expired
                          </span>
                        )}
                        {resolvedStatus === "none" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-slate-50 text-slate-600 border border-slate-200">
                            Unpaid
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Associated Accounts block */}
                    <div className="bg-slate-50/60 p-3.5 rounded-xl border border-slate-100 space-y-3 text-xs">
                      <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100/60 pb-1.5 flex justify-between items-center">
                        <span>Associated Accounts</span>
                        <span className="text-[9px] bg-slate-200/80 px-1.5 py-0.2 rounded-md font-extrabold text-slate-600">
                          {p.members.length} {p.members.length === 1 ? 'user' : 'users'}
                        </span>
                      </div>
                      
                      <div className="space-y-3 divide-y divide-slate-100/60">
                        {p.members.map((member, idx) => (
                          <div key={member.uid} className={`space-y-1.5 ${idx > 0 ? "pt-2.5" : ""}`}>
                            <div className="flex items-center gap-2 text-slate-800">
                              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-bold truncate">{member.name}</span>
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                                {getUserRoleDisplay(member)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-500 font-mono text-[10.5px] truncate">
                              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{member.email}</span>
                            </div>
                            {member.phoneNumber && (
                              <div className="flex items-center gap-2 text-slate-500 font-mono text-[10.5px] truncate">
                                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{member.phoneNumber}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Payment Periods & Timers block */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50/30 p-3.5 rounded-xl border border-slate-100/60">
                      <div>
                        <span className="text-slate-400 uppercase font-extrabold text-[9px] tracking-wider block mb-0.5">PAYMENT DATE</span>
                        <span className="font-mono text-slate-700 font-bold block truncate">{formatDate(p.paymentDate)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 uppercase font-extrabold text-[9px] tracking-wider block mb-0.5">EXPIRY DATE</span>
                        <span className="font-mono text-slate-700 font-bold block truncate">{formatDate(p.paymentEndDate)}</span>
                      </div>
                    </div>

                    {/* Live Lease Timer */}
                    {resolvedStatus === "active" && (
                      <div className="flex items-center justify-between gap-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                        <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">Live Lease Timer:</span>
                        <PaymentCountdown endDate={p.paymentEndDate} status="active" />
                      </div>
                    )}
                  </div>

                  {/* Actions Area */}
                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                    <button
                      onClick={() => handleOpenMessageModal(p)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-3xs flex-1 animate-in fade-in duration-200"
                      title="Send Renewal Notification"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      Message
                    </button>

                    {resolvedStatus !== "active" ? (
                      <button
                        onClick={() => handleActivatePayment(p.members)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-3xs flex-1 animate-in fade-in duration-200"
                        title="Register Payment (30 Days Active)"
                      >
                        <Play className="w-3.5 h-3.5 fill-white text-emerald-100" />
                        Mark Paid
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePausePayment(p.members)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-3xs flex-1 animate-in fade-in duration-200"
                        title="Pause Subscription"
                      >
                        <Pause className="w-3.5 h-3.5 fill-white text-amber-100" />
                        Pause Lease
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>



      {/* Send Message / Notification Reminder Modal */}
      {messageModalOpen && selectedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-lg w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Send Renewal Notification
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    To {selectedProfile.organizationName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setMessageModalOpen(false);
                  setSelectedProfile(null);
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Target Recipients ({selectedProfile.members.length})
                </label>
                <input
                  type="text"
                  readOnly
                  value={selectedProfile.members.map(m => `${m.name} <${m.email}>`).join(', ')}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Custom Message Body
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={6}
                  placeholder="Type a friendly payment reminder message..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-950 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 font-sans resize-none"
                />
              </div>

              <div className="bg-blue-50/50 border border-blue-100/50 rounded-xl p-3 flex gap-2.5">
                <Mail className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-3xs font-semibold text-blue-800 leading-relaxed">
                  This renewal alert will be instantly pushed to the dashboard of all {selectedProfile.members.length} members of {selectedProfile.organizationName}. They will see a visual notification banner upon their next login.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
              <button
                type="button"
                onClick={() => {
                  setMessageModalOpen(false);
                  setSelectedProfile(null);
                }}
                className="px-3.5 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={sendingMessage || !customMessage.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-3xs"
              >
                <Send className="h-3.5 w-3.5" />
                {sendingMessage ? "Sending..." : "Send Notification"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
