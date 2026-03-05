/**
 * Login 页面
 * 宇航员视角看地球，极简交互设计
 * V1: 单用户登录
 * V2: 预留多用户扩展
 */

import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/components/auth/AuthProvider';
import { Input } from '@/components/ui/input';

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, login, loading, error: authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  // 已登录则跳转首页
  useEffect(() => {
    if (user) {
      setLocation('/');
    }
  }, [user, setLocation]);

  // 视频加载处理
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.addEventListener('loadeddata', () => setVideoLoaded(true));
      video.addEventListener('error', () => {
        console.log('Video load failed, trying next source');
      });
      video.play().catch(() => {
        console.log('Autoplay blocked');
      });
    }
  }, []);

  // 切换展开/收起
  const toggleExpand = () => {
    if (isExpanded) {
      // 收起
      setIsExpanded(false);
      setError('');
      setUsername('');
      setPassword('');
    } else {
      // 展开
      setIsExpanded(true);
      // 自动聚焦输入框
      setTimeout(() => {
        const usernameInput = document.getElementById('username');
        usernameInput?.focus();
      }, 300);
    }
  };

  // 提交登录
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || loading) return;

    setError('');

    try {
      await login(username, password);
      // 登录成功会自动跳转 (通过 useEffect)
    } catch (err: any) {
      setError(err.message || '登录失败');
      setPassword('');
    }
  };

  // ESC 键收起
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        toggleExpand();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isExpanded]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* 视频加载提示 */}
      {!videoLoaded && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50 text-xs tracking-widest z-50">
          加载中...
        </div>
      )}

      {/* 视频背景 */}
      <div className="fixed inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto -translate-x-1/2 -translate-y-1/2 object-cover"
        >
          {/* 本地视频 - 开发测试 */}
          <source src="/videos/earth.mp4" type="video/mp4" />
          {/* Pexels 在线视频 - 部署用 */}
          <source
            src="https://videos.pexels.com/video-files/11892851/11892851-hd_1280_720_24fps.mp4"
            type="video/mp4"
          />
          {/* 备用视频源 */}
          <source
            src="https://videos.pexels.com/video-files/857251/857251-hd_1920_1080_25fps.mp4"
            type="video/mp4"
          />
        </video>
      </div>

      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      {/* 主内容 */}
      <div className="fixed inset-0 z-10 flex items-center justify-center">
        {/* 品牌 - 点击切换 */}
        <div
          onClick={toggleExpand}
          className={`absolute left-1/2 text-center cursor-pointer whitespace-nowrap transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            isExpanded ? 'top-[12%] -translate-x-1/2' : 'top-1/2 -translate-x-1/2 -translate-y-1/2'
          }`}
        >
          <div
            className="text-white font-extralight tracking-[12px] text-5xl transition-all duration-500 hover:tracking-[14px]"
            style={{ textShadow: '0 0 60px rgba(255,255,255,0.4)' }}
          >
            TRU<span className="font-normal">DECIDE</span>
            <span
              className="inline-block w-px h-12 mx-5 align-middle"
              style={{
                background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.6), transparent)',
              }}
            />
            INVEST
          </div>
          <div
            className={`text-white/50 text-[10px] font-light tracking-[8px] uppercase mt-4 transition-all duration-500 ${
              isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2.5'
            }`}
          >
            宏观择时策略
          </div>
        </div>

        {/* 登录表单 */}
        <form
          onSubmit={handleSubmit}
          className={`absolute top-1/2 left-1/2 flex flex-col items-center gap-4 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            isExpanded
              ? 'opacity-100 pointer-events-auto -translate-x-1/2 -translate-y-1/2 scale-100'
              : 'opacity-0 pointer-events-none -translate-x-1/2 -translate-y-1/2 scale-95'
          }`}
          style={{ transitionDelay: isExpanded ? '150ms' : '0ms' }}
        >
          <div className="w-[280px]">
            <Input
              id="username"
              type="text"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              className="w-full px-6 py-4 bg-black/30 border-white/15 text-white text-xs font-light tracking-[3px] text-center rounded-none placeholder:text-white/40 focus:bg-black/50 focus:border-white/35 backdrop-blur-xl"
            />
          </div>
          <div className="w-[280px]">
            <Input
              id="password"
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-6 py-4 bg-black/30 border-white/15 text-white text-xs font-light tracking-[3px] text-center rounded-none placeholder:text-white/40 focus:bg-black/50 focus:border-white/35 backdrop-blur-xl"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-[280px] py-4 mt-2 bg-white/10 border border-white/25 text-white text-[10px] font-normal tracking-[6px] uppercase rounded-none transition-all duration-300 hover:bg-white/15 hover:border-white/40 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-xl"
          >
            {loading ? '验证中...' : '登录'}
          </button>
          {(error || authError) && (
            <div className="text-red-400/90 text-[10px] tracking-[2px] mt-2">
              {error || authError}
            </div>
          )}
        </form>

        {/* 提示 */}
        <div
          className={`absolute bottom-[12%] left-1/2 -translate-x-1/2 text-[9px] tracking-[4px] text-white/30 transition-opacity duration-500 ${
            isExpanded ? 'opacity-0' : 'opacity-50'
          }`}
          style={{ animation: !isExpanded ? 'hint-pulse 3s ease 1.5s infinite' : 'none' }}
        >
          点击品牌名进入
        </div>
      </div>

      {/* 动画定义 */}
      <style>{`
        @keyframes hint-pulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
