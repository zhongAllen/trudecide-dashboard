import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import {
  Plus, Trash2, Edit3, Check, X, ArrowLeft, Wallet, AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';

interface Holding {
  id?: number;
  ts_code: string;
  name_cn: string;
  cost_price: number;
  shares: number;
  strategy_note: string;
  source: string;
  is_active: boolean;
  user_id: string;
}

const EMPTY_HOLDING: Holding = {
  ts_code: '',
  name_cn: '',
  cost_price: 0,
  shares: 0,
  strategy_note: '',
  source: 'manual',
  is_active: true,
  user_id: 'default',
};

export default function Holdings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Holding>(EMPTY_HOLDING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadHoldings = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('portfolio_holdings')
      .select('*')
      .order('created_at', { ascending: false });
    setHoldings(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadHoldings(); }, [loadHoldings]);

  const handleSave = async () => {
    if (!form.ts_code || !form.cost_price || !form.shares) {
      setError('股票代码、成本价、持仓股数为必填项');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId != null) {
        const { error: err } = await supabase
          .from('portfolio_holdings')
          .update({
            ts_code: form.ts_code,
            name_cn: form.name_cn,
            cost_price: form.cost_price,
            shares: form.shares,
            strategy_note: form.strategy_note,
            source: form.source,
            is_active: form.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId);
        if (err) throw err;
        setEditingId(null);
      } else {
        const { error: err } = await supabase
          .from('portfolio_holdings')
          .insert({
            ts_code: form.ts_code,
            name_cn: form.name_cn,
            cost_price: form.cost_price,
            shares: form.shares,
            strategy_note: form.strategy_note,
            source: 'manual',
            is_active: true,
            user_id: 'default',
          });
        if (err) throw err;
        setShowAdd(false);
      }
      setForm(EMPTY_HOLDING);
      await loadHoldings();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除该持仓记录？')) return;
    await supabase.from('portfolio_holdings').delete().eq('id', id);
    await loadHoldings();
  };

  const handleToggleActive = async (id: number, current: boolean) => {
    await supabase
      .from('portfolio_holdings')
      .update({ is_active: !current, updated_at: new Date().toISOString() })
      .eq('id', id);
    await loadHoldings();
  };

  const startEdit = (h: Holding) => {
    setForm({ ...h });
    setEditingId(h.id!);
    setShowAdd(false);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowAdd(false);
    setForm(EMPTY_HOLDING);
    setError('');
  };

  const FormRow = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div className="grid grid-cols-3 gap-2 items-center">
      <label className="text-xs text-gray-600 text-right">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="col-span-2">{children}</div>
    </div>
  );

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="text-xs">
            <ArrowLeft size={14} className="mr-1" /> 返回驾驶舱
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-blue-600" />
          <span className="font-semibold text-gray-900">持仓管理</span>
        </div>
        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
          ⚠ 手动维护，后续接 QMT 自动同步
        </Badge>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* 说明 */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            持仓数据目前需手动录入维护。字段 <code>source=manual</code> 标记人工录入，
            后续接入 QMT 交易 API 后将自动同步（<code>source=qmt</code>）。
            股票代码格式：沪市 600519.SH，深市 000858.SZ，科创板 688981.SH。
          </span>
        </div>

        {/* 操作栏 */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">共 {holdings.length} 条记录</span>
          <Button
            size="sm"
            onClick={() => { setShowAdd(true); setEditingId(null); setForm(EMPTY_HOLDING); setError(''); }}
            disabled={showAdd}
          >
            <Plus size={14} className="mr-1" /> 添加持仓
          </Button>
        </div>

        {/* 添加表单 */}
        {showAdd && (
          <Card className="border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-blue-700">新增持仓</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {error && <p className="text-xs text-red-500 bg-red-50 p-2 rounded">{error}</p>}
              <FormRow label="股票代码" required>
                <input
                  className={inputCls}
                  placeholder="如 600519.SH"
                  value={form.ts_code}
                  onChange={e => setForm(f => ({ ...f, ts_code: e.target.value.toUpperCase() }))}
                />
              </FormRow>
              <FormRow label="股票名称">
                <input
                  className={inputCls}
                  placeholder="如 贵州茅台（可选）"
                  value={form.name_cn}
                  onChange={e => setForm(f => ({ ...f, name_cn: e.target.value }))}
                />
              </FormRow>
              <FormRow label="成本价（元）" required>
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  placeholder="如 1455.00"
                  value={form.cost_price || ''}
                  onChange={e => setForm(f => ({ ...f, cost_price: parseFloat(e.target.value) || 0 }))}
                />
              </FormRow>
              <FormRow label="持仓股数" required>
                <input
                  className={inputCls}
                  type="number"
                  placeholder="如 100"
                  value={form.shares || ''}
                  onChange={e => setForm(f => ({ ...f, shares: parseInt(e.target.value) || 0 }))}
                />
              </FormRow>
              <FormRow label="持仓逻辑">
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="一句话说明持仓理由，如：白酒龙头，中长期持有，等待估值修复"
                  value={form.strategy_note}
                  onChange={e => setForm(f => ({ ...f, strategy_note: e.target.value }))}
                />
              </FormRow>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={cancelEdit}>取消</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? '保存中...' : <><Check size={12} className="mr-1" />保存</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 持仓列表 */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : holdings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Wallet size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400">暂无持仓记录，点击"添加持仓"开始录入</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {holdings.map(h => (
              <Card key={h.id} className={`transition-all ${!h.is_active ? 'opacity-50' : ''}`}>
                {editingId === h.id ? (
                  <CardContent className="p-4 space-y-3">
                    {error && <p className="text-xs text-red-500 bg-red-50 p-2 rounded">{error}</p>}
                    <FormRow label="股票代码" required>
                      <input className={inputCls} value={form.ts_code}
                        onChange={e => setForm(f => ({ ...f, ts_code: e.target.value.toUpperCase() }))} />
                    </FormRow>
                    <FormRow label="股票名称">
                      <input className={inputCls} value={form.name_cn}
                        onChange={e => setForm(f => ({ ...f, name_cn: e.target.value }))} />
                    </FormRow>
                    <FormRow label="成本价（元）" required>
                      <input className={inputCls} type="number" step="0.01" value={form.cost_price || ''}
                        onChange={e => setForm(f => ({ ...f, cost_price: parseFloat(e.target.value) || 0 }))} />
                    </FormRow>
                    <FormRow label="持仓股数" required>
                      <input className={inputCls} type="number" value={form.shares || ''}
                        onChange={e => setForm(f => ({ ...f, shares: parseInt(e.target.value) || 0 }))} />
                    </FormRow>
                    <FormRow label="持仓逻辑">
                      <textarea className={`${inputCls} resize-none`} rows={2} value={form.strategy_note}
                        onChange={e => setForm(f => ({ ...f, strategy_note: e.target.value }))} />
                    </FormRow>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={cancelEdit}>取消</Button>
                      <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? '保存中...' : <><Check size={12} className="mr-1" />保存</>}
                      </Button>
                    </div>
                  </CardContent>
                ) : (
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{h.name_cn || h.ts_code}</span>
                          <span className="text-xs text-gray-400">{h.ts_code}</span>
                          <Badge variant="outline" className={`text-xs ${h.source === 'qmt' ? 'border-green-300 text-green-600' : 'border-gray-200 text-gray-400'}`}>
                            {h.source}
                          </Badge>
                          {!h.is_active && <Badge variant="outline" className="text-xs border-gray-200 text-gray-400">已清仓</Badge>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                          <span>成本 <strong>{h.cost_price}</strong> 元</span>
                          <span>持仓 <strong>{h.shares.toLocaleString()}</strong> 股</span>
                          <span className="text-gray-400">市值约 {((h.cost_price * h.shares) / 10000).toFixed(1)} 万</span>
                        </div>
                        {h.strategy_note && (
                          <p className="text-xs text-gray-400 mt-1 italic">"{h.strategy_note}"</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost" size="sm"
                          className="text-xs text-gray-400 h-7"
                          onClick={() => handleToggleActive(h.id!, h.is_active)}
                          title={h.is_active ? '标记为已清仓' : '恢复为持仓中'}
                        >
                          {h.is_active ? '清仓' : '恢复'}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="text-xs text-blue-500 h-7"
                          onClick={() => startEdit(h)}
                        >
                          <Edit3 size={12} />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="text-xs text-red-400 h-7"
                          onClick={() => handleDelete(h.id!)}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
