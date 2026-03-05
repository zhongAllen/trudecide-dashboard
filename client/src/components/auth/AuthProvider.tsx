/**
 * AuthProvider - 认证状态管理
 * V1: 单用户基础认证
 * V2: 预留多用户权限扩展接口
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { AuthContextValue, User, UserRole, Permission } from '@/types/auth';

// 创建上下文
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// 预置用户凭证 (V1)
const PRESET_USER = {
  username: 'Trudecide',
  password: '20130123dang',
  email: 'trudecide@local.auth',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // V2: 预留权限状态
  const [permissions, setPermissions] = useState<Permission[]>([]);

  // 初始化：检查本地存储的 session
  useEffect(() => {
    const initAuth = () => {
      try {
        // V1: 从 localStorage 读取 session
        const storedSession = localStorage.getItem('trudecide_session');
        if (storedSession) {
          const parsed = JSON.parse(storedSession);
          if (parsed.user) {
            setUser(parsed.user);
            setSession(parsed);
            // V2: 加载用户权限
            // loadUserPermissions(parsed.user.id);
          }
        }
      } catch (err) {
        console.error('Session restore failed:', err);
        localStorage.removeItem('trudecide_session');
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // V1: 简单登录验证
  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      // 验证预置用户
      if (username === PRESET_USER.username && password === PRESET_USER.password) {
        const userData: User = {
          id: 'trudecide-admin',
          email: PRESET_USER.email,
          username: PRESET_USER.username,
          // V2: 默认角色
          role: 'admin' as UserRole,
          displayName: PRESET_USER.username,
        };

        const sessionData = {
          user: userData,
          loginAt: new Date().toISOString(),
          // V2: token 过期时间
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };

        // 保存到 localStorage
        localStorage.setItem('trudecide_session', JSON.stringify(sessionData));

        setUser(userData);
        setSession(sessionData);

        // V2: 加载权限
        // await loadUserPermissions(userData.id);
      } else {
        throw new Error('用户名或密码错误');
      }
    } catch (err: any) {
      setError(err.message || '登录失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // V2: 从 Supabase 登录 (预留)
  const loginWithSupabase = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (data.user) {
        // 获取用户 profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        const userData: User = {
          id: data.user.id,
          email: data.user.email!,
          username: profile?.username || data.user.email!.split('@')[0],
          role: profile?.role as UserRole,
          displayName: profile?.display_name,
          avatarUrl: profile?.avatar_url,
        };

        setUser(userData);
        setSession(data.session);

        // V2: 加载权限
        // await loadUserPermissions(userData.id);
      }
    } catch (err: any) {
      setError(err.message || '登录失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // 登出
  const logout = useCallback(async () => {
    // V1: 清除 localStorage
    localStorage.removeItem('trudecide_session');

    // V2: Supabase 登出
    // await supabase.auth.signOut();

    setUser(null);
    setSession(null);
    setPermissions([]);
    setError(null);
  }, []);

  // V2: 加载用户权限 (预留)
  const loadUserPermissions = useCallback(async (userId: string) => {
    // V2: 从数据库加载用户权限
    // const { data } = await supabase
    //   .from('role_permissions')
    //   .select('permission_id')
    //   .eq('role', user?.role);
    // setPermissions(data?.map(p => p.permission_id) || []);

    // V1: 默认 admin 拥有所有权限
    setPermissions([
      'data:read',
      'data:write',
      'reports:read',
      'reports:write',
      'reports:delete',
      'users:read',
      'users:write',
      'settings:admin',
    ]);
  }, []);

  // V2: 检查权限 (预留)
  const hasPermission = useCallback((permission: Permission): boolean => {
    // V1: 单用户默认有所有权限
    if (!user) return false;
    // V2: return permissions.includes(permission);
    return true;
  }, [user, permissions]);

  // V2: 检查角色 (预留)
  const hasRole = useCallback((role: UserRole | UserRole[]): boolean => {
    if (!user?.role) return false;
    if (Array.isArray(role)) {
      return role.includes(user.role);
    }
    return user.role === role;
  }, [user]);

  // V2: 监听 Supabase 认证状态变化 (预留)
  useEffect(() => {
    // const { data: { subscription } } = supabase.auth.onAuthStateChange(
    //   (event, session) => {
    //     if (event === 'SIGNED_IN') {
    //       // 处理登录
    //     } else if (event === 'SIGNED_OUT') {
    //       // 处理登出
    //     }
    //   }
    // );
    // return () => subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    error,
    permissions,
    login,
    logout,
    hasPermission,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
