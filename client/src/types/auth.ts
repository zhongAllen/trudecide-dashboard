/**
 * 认证相关类型定义
 * V1: 单用户基础认证
 * V2: 预留多用户权限扩展
 */

import { User as SupabaseUser } from '@supabase/supabase-js';

// V1: 基础用户类型
export interface User {
  id: string;
  email: string;
  username: string;
  // V2: 预留扩展字段
  role?: UserRole;
  displayName?: string;
  avatarUrl?: string;
}

// V2: 用户角色
export type UserRole = 'admin' | 'viewer' | 'analyst';

// V2: 权限定义
export type Permission =
  | 'data:read'
  | 'data:write'
  | 'reports:read'
  | 'reports:write'
  | 'reports:delete'
  | 'users:read'
  | 'users:write'
  | 'settings:admin';

// V2: 权限检查选项
export interface PermissionCheck {
  permission?: Permission;
  role?: UserRole;
  requireAuth?: boolean;
}

// 认证状态
export interface AuthState {
  user: User | null;
  session: any | null; // Supabase Session
  loading: boolean;
  error: string | null;
  // V2: 预留
  permissions?: Permission[];
}

// 认证上下文值
export interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // V2: 预留
  hasPermission?: (permission: Permission) => boolean;
  hasRole?: (role: UserRole | UserRole[]) => boolean;
}

// 路由守卫 props
export interface ProtectedRouteProps {
  children: React.ReactNode;
  // V2: 预留权限控制
  requiredRole?: UserRole | UserRole[];
  requiredPermission?: Permission;
  fallback?: React.ReactNode;
}
