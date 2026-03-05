/**
 * ProtectedRoute - 路由守卫组件
 * V1: 基础登录保护
 * V2: 预留角色和权限控制
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from './AuthProvider';
import { ProtectedRouteProps } from '@/types/auth';

export function ProtectedRoute({
  children,
  // V2: 预留权限控制参数
  // requiredRole,
  // requiredPermission,
  // fallback,
}: ProtectedRouteProps) {
  const [location, setLocation] = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    // 等待认证状态初始化完成
    if (loading) return;

    // 未登录则跳转到登录页
    if (!user) {
      setLocation('/login');
      return;
    }

    // V2: 角色权限检查 (预留)
    // if (requiredRole && !hasRole(requiredRole)) {
    //   setLocation('/unauthorized');
    //   return;
    // }

    // V2: 细粒度权限检查 (预留)
    // if (requiredPermission && !hasPermission(requiredPermission)) {
    //   setLocation('/unauthorized');
    //   return;
    // }
  }, [user, loading, setLocation, location]);

  // 加载中显示空白
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/50 text-xs tracking-widest">加载中...</div>
      </div>
    );
  }

  // 未登录不渲染子组件
  if (!user) {
    return null;
  }

  return <>{children}</>;
}

// V2: 权限守卫组件 (预留)
export function PermissionGuard({
  children,
  permission,
  fallback = null,
}: {
  children: React.ReactNode;
  permission: string;
  fallback?: React.ReactNode;
}) {
  const { hasPermission } = useAuth();

  // V1: 默认显示所有内容
  // V2: 根据权限决定是否渲染
  // const hasAccess = hasPermission?.(permission as Permission) ?? true;
  const hasAccess = true;

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// V2: 角色守卫组件 (预留)
export function RoleGuard({
  children,
  role,
  fallback = null,
}: {
  children: React.ReactNode;
  role: string | string[];
  fallback?: React.ReactNode;
}) {
  const { hasRole } = useAuth();

  // V1: 默认显示所有内容
  // V2: 根据角色决定是否渲染
  // const hasAccess = hasRole?.(role as UserRole | UserRole[]) ?? true;
  const hasAccess = true;

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
