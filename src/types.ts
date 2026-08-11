export type UserRole = "admin" | "treasurer" | "viewer" | "chairman";

export interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  senderName: string;
}

export interface ManagementYear {
  id: string;
  label: string; // e.g., "2026 Management Year" or "2025/2026 Financial Year"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  isCurrent?: boolean;
  notes?: string;
  createdAt?: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  organizationType?: "individual" | "organization";
  organizationLogo?: string; // Base64 representation of logo
  phoneNumber?: string;
  organizationName?: string;
  paymentStatus?: "active" | "paused" | "expired" | "none";
  paymentDate?: string;
  paymentEndDate?: string;
  notifications?: Notification[];
  disableTransactionButtons?: boolean;
  managementYears?: ManagementYear[];
  activeManagementYearId?: string;
}

export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string; // YYYY-MM-DD
  amount: number;
  category: string;
  description: string;
  recordedBy: string;
  recordedByUid: string;
  receiptImage?: string; // Base64 representation of receipt image
  createdAt: string;
}

export const INCOME_CATEGORIES = [
  "Sunday Collection",
  "Tithe",
  "Donation",
  "Thanksgiving",
  "Building Fund",
  "Special Seed",
  "Other"
] as const;

export const EXPENSE_CATEGORIES = [
  "Electricity",
  "Welfare",
  "Rent",
  "Equipment",
  "Transport",
  "Honorarium",
  "Repairs",
  "Water",
  "Other"
] as const;
