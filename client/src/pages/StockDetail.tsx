/**
 * StockDetail.tsx - 独立个股详情页面
 * 
 * 功能：
 * 1. 作为独立页面路由 /stock/:ts_code 的入口
 * 2. 复用 StockDetailPanel 组件展示个股详情
 * 3. 支持从 Dashboard/TopDown 跳转（通过 ?from= 参数）
 * 
 * 技术栈：React + TypeScript + wouter
 */
import { useState, useEffect } from 'react';
import { useParams, useSearch } from 'wouter';
import { supabase } from '@/lib/supabase';
import StockDetailPanel, { type StockMeta } from '@/components/StockDetailPanel';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

export default function StockDetail() {
  const params = useParams<{ ts_code: string }>();
  const search = useSearch();
  const tsCode = params.ts_code || '';
  const from = (new URLSearchParams(search).get('from') as 'topdown' | 'dashboard') || 'dashboard';

  const [stock, setStock] = useState<StockMeta | null>(null);
  const [loading, setLoading] = useState(true);

  // 获取股票基本信息
  useEffect(() => {
    async function fetchStock() {
      setLoading(true);

      const { data, error } = await supabase
        .from('stock_meta')
        .select('ts_code, symbol, name_cn, area, industry, market, list_date')
        .eq('ts_code', tsCode)
        .single();

      if (error || !data) {
        console.error('Stock not found:', tsCode, error);
        setStock(null);
      } else {
        setStock(data as StockMeta);
      }

      setLoading(false);
    }

    if (tsCode) {
      fetchStock();
    }
  }, [tsCode]);

  // 返回路径
  const backPath = from === 'topdown' ? '/topdown' : '/dashboard';
  const backText = from === 'topdown' ? '返回选股' : '返回驾驶舱';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 mb-4">股票不存在或已退市</div>
          <Link href={backPath}>
            <Button>{backText}</Button>
          </Link>
        </div>
      </div>
    );
  }

  // 使用 StockDetailPanel 组件展示详情
  return <StockDetailPanel stock={stock} from={from} />;
}
