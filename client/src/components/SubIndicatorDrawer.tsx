/**
 * SubIndicatorDrawer.tsx
 *
 * 宏观矩阵子维度钻取抽屉组件（REQ-072）
 *
 * 功能：
 *   - 点击矩阵单元格后从右侧滑出
 *   - 展示该维度×时间尺度下的子指标列表
 *   - 每个子指标显示：名称、定性结论（signal badge）、强度进度条、一句话解读、定量数据
 *
 * 数据来源：
 *   - UI 验证阶段：使用 mockSubIndicators.ts 中的 Mock 数据
 *   - 后续替换：GET /api/sub-indicators?region={region}&dimension={dim}&timescale={ts}
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  getSubIndicators,
  getSignalColor,
  getTrendIcon,
  getTrendColor,
  type SubIndicator,
} from '@/lib/mockSubIndicators';
import { TrendingUp, TrendingDown, Minus, Database, AlertCircle } from 'lucide-react';

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface SubIndicatorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 地区代码，如 'CN' / 'US' */
  region: string;
  /** 维度名称，如 '宏观经济' */
  dimension: string;
  /** 时间尺度，如 'short' / 'mid' / 'long' */
  timescale: string;
  /** 时间尺度显示标签，如 '短期（3–9个月）' */
  timescaleLabel: string;
  /** 当前单元格的状态（来自 macro_wide_snapshot） */
  cellStatus?: string;
  /** 当前单元格的分数 */
  cellScore?: number;
}

// ─────────────────────────────────────────────
// 子组件：单个子指标卡片
// ─────────────────────────────────────────────

function SubIndicatorCard({ indicator }: { indicator: SubIndicator }) {
  const colors = getSignalColor(indicator.signal);

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3 hover:border-border transition-colors">
      {/* 头部：名称 + Signal Badge + 权重 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground leading-tight">{indicator.name}</span>
            {indicator.weight >= 4 && (
              <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 font-medium">
                核心
              </span>
            )}
          </div>
        </div>
        <Badge
          variant="outline"
          className={`text-xs font-semibold px-2 py-0.5 whitespace-nowrap flex-shrink-0 ${colors.badge}`}
        >
          {indicator.signal}
        </Badge>
      </div>

      {/* 强度进度条 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>信号强度</span>
          <span className={`font-mono font-semibold ${colors.text}`}>{indicator.strength}</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              indicator.strength >= 70
                ? 'bg-emerald-500'
                : indicator.strength >= 50
                ? 'bg-amber-400'
                : 'bg-red-400'
            }`}
            style={{ width: `${indicator.strength}%` }}
          />
        </div>
      </div>

      {/* 一句话解读 */}
      <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-2">
        {indicator.summary}
      </p>

      {/* 定量数据 */}
      {indicator.quantData.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
            <Database className="w-3 h-3" />
            <span>数据支撑</span>
          </div>
          <div className="space-y-1.5">
            {indicator.quantData.map((qd, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground truncate block">{qd.label}</span>
                  {qd.benchmark && (
                    <span className="text-[10px] text-muted-foreground/60">参考：{qd.benchmark}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-xs font-mono font-semibold ${getTrendColor(qd.trend)}`}>
                    {getTrendIcon(qd.trend)}
                  </span>
                  <span className="text-sm font-mono font-bold text-foreground">{qd.value}</span>
                </div>
              </div>
            ))}
          </div>
          {/* 数据来源 & 日期 */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
            <span>来源：{indicator.quantData[0]?.source}</span>
            <span>·</span>
            <span>{indicator.quantData[0]?.date}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────

export function SubIndicatorDrawer({
  open,
  onOpenChange,
  region,
  dimension,
  timescale,
  timescaleLabel,
  cellStatus,
  cellScore,
}: SubIndicatorDrawerProps) {
  const subIndicators = getSubIndicators(region, dimension, timescale);

  // 计算加权平均强度
  const totalWeight = subIndicators.reduce((sum, s) => sum + s.weight, 0);
  const weightedStrength =
    totalWeight > 0
      ? Math.round(
          subIndicators.reduce((sum, s) => sum + s.strength * s.weight, 0) / totalWeight,
        )
      : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 gap-0"
      >
        {/* ── 抽屉头部 ── */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/60 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-bold leading-tight">
                {dimension} · {timescaleLabel}
              </SheetTitle>
              <SheetDescription className="text-xs mt-0.5 text-muted-foreground">
                {region === 'CN' ? '🇨🇳 中国' : '🇺🇸 美国'} · 子维度指标钻取
              </SheetDescription>
            </div>
            {/* 综合信号摘要 */}
            {cellStatus && (
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                <span className="text-xs text-muted-foreground">综合信号</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">{cellStatus}</span>
                  {cellScore !== undefined && (
                    <span className="text-lg font-mono font-bold text-foreground tabular-nums">
                      {cellScore}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 加权强度汇总 */}
          {subIndicators.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>子指标加权强度（{subIndicators.length} 个指标）</span>
                <span className="font-mono font-semibold text-foreground">{weightedStrength}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    weightedStrength >= 70
                      ? 'bg-emerald-500'
                      : weightedStrength >= 50
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                  }`}
                  style={{ width: `${weightedStrength}%` }}
                />
              </div>
            </div>
          )}
        </SheetHeader>

        {/* ── 数据说明横幅（Mock 阶段提示） ── */}
        <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 border-b border-amber-100 flex-shrink-0">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="text-[11px] text-amber-700">
            当前数据为 UI 验证阶段 Mock 数据，仅供展示效果参考，不代表真实数据。
          </span>
        </div>

        {/* ── 子指标列表 ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {subIndicators.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
              <Database className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">暂无子指标数据</p>
              <p className="text-xs text-muted-foreground/60">
                该维度×时间尺度组合的 Mock 数据尚未录入
              </p>
            </div>
          ) : (
            subIndicators
              .sort((a, b) => b.weight - a.weight) // 按权重降序排列
              .map((indicator) => (
                <SubIndicatorCard key={indicator.id} indicator={indicator} />
              ))
          )}
        </div>

        {/* ── 底部说明 ── */}
        <div className="px-5 py-3 border-t border-border/60 flex-shrink-0">
          <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
            子指标数据来源：国家统计局、中国人民银行、万得、Bloomberg 等。
            定量数据为 Mock 模拟值，后续将接入真实 API。
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
