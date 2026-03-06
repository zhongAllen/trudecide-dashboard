/**
 * KlineChart.tsx - 专业 K 线图表组件
 * 
 * 基于 klinecharts v10，支持：
 * - 蜡烛图（涨红跌绿，A股风格）
 * - MA 均线指标
 * - 十字光标、数据提示
 * - 缩放、平移
 */
import { useEffect, useRef, useCallback } from 'react';
import { init, dispose, Chart, ChartOptions, DeepPartial } from 'klinecharts';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────
export interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface KlineChartProps {
  data: KlineData[];
  height?: number;
  onDataHover?: (data: KlineData | null) => void;
  maPeriods?: number[];
}

// ─── 默认配置 ─────────────────────────────────────────────────────────────────
const DEFAULT_MA_PERIODS = [5, 10, 20, 60];

const CHART_OPTIONS: DeepPartial<ChartOptions> = {
  grid: {
    horizontal: {
      size: 1,
      color: '#f1f5f9',
      style: 'dashed',
      show: true,
    },
    vertical: {
      size: 1,
      color: '#f1f5f9',
      style: 'dashed',
      show: true,
    },
  },
  candle: {
    type: 'candle_solid',
    upColor: '#ef4444',
    downColor: '#22c55e',
    upBorderColor: '#ef4444',
    downBorderColor: '#22c55e',
    upWickColor: '#ef4444',
    downWickColor: '#22c55e',
  },
  indicator: {
    ohlc: {
      upColor: '#ef4444',
      downColor: '#22c55e',
    },
  },
  xAxis: {
    axisLine: {
      show: true,
      color: '#e2e8f0',
      size: 1,
    },
    tickLine: {
      show: true,
      color: '#e2e8f0',
      size: 3,
    },
    label: {
      show: true,
      color: '#64748b',
      size: 11,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    },
  },
  yAxis: {
    axisLine: {
      show: true,
      color: '#e2e8f0',
      size: 1,
    },
    tickLine: {
      show: true,
      color: '#e2e8f0',
      size: 3,
    },
    label: {
      show: true,
      color: '#64748b',
      size: 11,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    // 增加刻度数量，让价格刻度更密集
    tick: {
      count: 10,
    },
  },
  crosshair: {
    horizontal: {
      show: true,
      line: {
        show: true,
        style: 'dashed',
        color: '#3b82f6',
        size: 1,
      },
      label: {
        show: true,
        color: '#fff',
        backgroundColor: '#3b82f6',
        size: 11,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 2,
        paddingBottom: 2,
        borderRadius: 2,
      },
      text: {
        value: null,
      },
    },
    vertical: {
      show: true,
      line: {
        show: true,
        style: 'dashed',
        color: '#3b82f6',
        size: 1,
      },
      label: {
        show: true,
        color: '#fff',
        backgroundColor: '#3b82f6',
        size: 11,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 2,
        paddingBottom: 2,
        borderRadius: 2,
      },
      text: {
        value: null,
      },
    },
  },
  overlay: {
    point: {
      backgroundColor: '#3b82f6',
      borderColor: '#3b82f6',
      borderSize: 1,
      radius: 4,
      activeBackgroundColor: '#3b82f6',
      activeBorderColor: '#3b82f6',
      activeBorderSize: 1,
      activeRadius: 6,
    },
    line: {
      color: '#3b82f6',
      size: 1,
      style: 'solid',
      activeColor: '#3b82f6',
      activeSize: 1,
      activeStyle: 'solid',
    },
    rect: {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderColor: '#3b82f6',
      borderSize: 1,
      borderStyle: 'solid',
      activeBackgroundColor: 'rgba(59, 130, 246, 0.2)',
      activeBorderColor: '#3b82f6',
      activeBorderSize: 1,
      activeBorderStyle: 'solid',
    },
    polygon: {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderColor: '#3b82f6',
      borderSize: 1,
      borderStyle: 'solid',
      activeBackgroundColor: 'rgba(59, 130, 246, 0.2)',
      activeBorderColor: '#3b82f6',
      activeBorderSize: 1,
      activeBorderStyle: 'solid',
    },
    circle: {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderColor: '#3b82f6',
      borderSize: 1,
      borderStyle: 'solid',
      activeBackgroundColor: 'rgba(59, 130, 246, 0.2)',
      activeBorderColor: '#3b82f6',
      activeBorderSize: 1,
      activeBorderStyle: 'solid',
    },
    arc: {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderColor: '#3b82f6',
      borderSize: 1,
      borderStyle: 'solid',
      activeBackgroundColor: 'rgba(59, 130, 246, 0.2)',
      activeBorderColor: '#3b82f6',
      activeBorderSize: 1,
      activeBorderStyle: 'solid',
    },
    text: {
      color: '#1e293b',
      size: 12,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderSize: 0,
      borderStyle: 'solid',
      borderRadius: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      activeColor: '#1e293b',
      activeSize: 12,
      activeBackgroundColor: 'transparent',
      activeBorderColor: 'transparent',
      activeBorderSize: 0,
      activeBorderStyle: 'solid',
      activeBorderRadius: 0,
      activePaddingLeft: 0,
      activePaddingRight: 0,
      activePaddingTop: 0,
      activePaddingBottom: 0,
    },
    textFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    textSize: 12,
    textColor: '#1e293b',
  },
};

// ─── 组件 ─────────────────────────────────────────────────────────────────────
export function KlineChart({
  data,
  height = 400,
  onDataHover,
  maPeriods = DEFAULT_MA_PERIODS,
}: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);

  // 初始化图表
  useEffect(() => {
    if (!containerRef.current) return;

    try {
      // 初始化图表实例
      const chart = init(containerRef.current, CHART_OPTIONS);
      if (!chart) {
        console.error('KlineChart init failed');
        return;
      }
      chartRef.current = chart;

      // 设置时区为东八区
      if (typeof chart.setTimezone === 'function') {
        chart.setTimezone('+08:00');
      }

      // 添加蜡烛图主图
      if (typeof chart.createIndicator === 'function') {
        chart.createIndicator('Candle', false, { id: 'candle' });

        // 添加 MA 均线
        maPeriods.forEach((period, index) => {
          chart.createIndicator('MA', false, {
            id: `ma${period}`,
            params: [period],
            styles: {
              line: {
                color: getMaColor(index),
                size: 1,
              },
            },
          });
        });
      }

      // 监听十字光标移动
      const handleCrosshairMove = (e: any) => {
        if (onDataHover) {
          if (e?.kLineData) {
            onDataHover({
              timestamp: e.kLineData.timestamp,
              open: e.kLineData.open,
              high: e.kLineData.high,
              low: e.kLineData.low,
              close: e.kLineData.close,
              volume: e.kLineData.volume,
            });
          } else {
            onDataHover(null);
          }
        }
      };

      if (typeof chart.subscribeAction === 'function') {
        chart.subscribeAction('crosshairMove', handleCrosshairMove);
      }

      // 清理函数
      return () => {
        try {
          if (typeof chart.unsubscribeAction === 'function') {
            chart.unsubscribeAction('crosshairMove', handleCrosshairMove);
          }
          dispose(chart);
        } catch (e) {
          console.error('KlineChart cleanup error:', e);
        }
        chartRef.current = null;
      };
    } catch (e) {
      console.error('KlineChart init error:', e);
    }
  }, [maPeriods, onDataHover]);

  // 更新数据
  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    try {
      // klinecharts v10 API
      if (typeof chartRef.current.applyNewData === 'function') {
        chartRef.current.applyNewData(data);
      } else if (typeof chartRef.current.setData === 'function') {
        chartRef.current.setData(data);
      }
    } catch (e) {
      console.error('KlineChart update data error:', e);
    }
  }, [data]);

  // 响应式调整
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current) {
        chartRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: `${height}px` }}
      className="kline-chart-container"
    />
  );
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────
function getMaColor(index: number): string {
  const colors = ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981'];
  return colors[index % colors.length];
}

// ─── 数据转换工具 ─────────────────────────────────────────────────────────────
export function convertToKlineData(
  stockData: Array<{
    trade_date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    vol?: number;
    amount?: number;
  }>
): KlineData[] {
  return stockData.map((d) => {
    const date = new Date(d.trade_date);
    return {
      timestamp: date.getTime(),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.vol,
    };
  });
}

export default KlineChart;
