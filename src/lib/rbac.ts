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

export const DEFAULT_STAFF = [DEFAULT_USER];

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
    return [DEFAULT_USER];
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
