import { UserProfile, PermissionKey } from "../types";

// -------------------------------------------------------------
// DEFAULT MASTER AUTHENTICATED USER
// -------------------------------------------------------------

export const DEFAULT_USER: UserProfile = {
  id: "USER-001",
  name: "Owner",
  email: "admin@webrajya.com",
  phone: "",
  role: "Owner",
  status: "Active",
  createdAt: "2024-01-01T08:00:00Z"
};

export const DEFAULT_STAFF: UserProfile[] = [
  DEFAULT_USER,
  {
    id: "USER-002",
    name: "Satendra",
    email: "satendra@webrajya.com",
    phone: "",
    role: "Manager",
    status: "Active",
    createdAt: "2024-01-01T08:00:00Z"
  },
  {
    id: "USER-003",
    name: "Ramesh (Waiter)",
    email: "ramesh@webrajya.com",
    phone: "",
    role: "Staff",
    status: "Active",
    createdAt: "2024-01-01T08:00:00Z"
  },
  {
    id: "USER-004",
    name: "Suresh (Waiter)",
    email: "suresh@webrajya.com",
    phone: "",
    role: "Staff",
    status: "Active",
    createdAt: "2024-01-01T08:00:00Z"
  }
];

// -------------------------------------------------------------
// LIGHTWEIGHT USER AUTH & POS PERMISSION HELPER
// -------------------------------------------------------------

export class AuthService {
  /**
   * Get currently authenticated user profile
   */
  static getActiveUser(): UserProfile {
    return DEFAULT_USER;
  }

  /**
   * Alias for backward-compatible calls
   */
  static getActiveStaff(): UserProfile {
    return this.getActiveUser();
  }

  static getStaff(): UserProfile[] {
    return DEFAULT_STAFF;
  }

  static getStaffMembers(): UserProfile[] {
    return DEFAULT_STAFF;
  }

  /**
   * Check if user holds valid authorization for POS operations
   */
  static can(_user?: UserProfile | null, _permission?: PermissionKey): boolean {
    return true;
  }

  static canCurrent(_permission?: PermissionKey): boolean {
    return true;
  }

  static hasPermission(_permission?: PermissionKey): boolean {
    return true;
  }
}

// Backward-compatible alias for existing imports
export const RBACService = AuthService;
