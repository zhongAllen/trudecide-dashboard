/**
 * KlineChart.tsx - 专业 K 线图表组件
 *
 * 基于 lightweight-charts，支持：
 * - 蜡烛图（涨红跌绿，A股风格）
 * - MA 均线指标
 * - 成交量副图
 * - 十字光标、数据提示
 * - 缩放、平移
 */
import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData, LineData, Time } from 'lightweight-charts';

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

// A股红涨绿跌配色
const UP_COLOR = '#ef4444';    // red-500
const DOWN_COLOR = '#22c55e';  // green-500
const UP_BORDER = '#dc2626';   // red-600
const DOWN_BORDER = '#16a34a'; // green-600

// MA 线颜色
const MA_COLORS = ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981'];

// ─── 计算移动平均线 ────────────────────────────────────────────────────────────
function calculateMA(data: KlineData[], period: number): LineData[] {
  const maData: LineData[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      maData.push({ time: data[i].timestamp / 1000 as Time, value: NaN });
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    maData.push({ time: data[i].timestamp / 1000 as Time, value: sum / period });
  }
  return maData;
}

// ─── 组件 ─────────────────────────────────────────────────────────────────────
export function KlineChart({
  data,
  height = 400,
  onDataHover,
  maPeriods = DEFAULT_MA_PERIODS,
}: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maSeriesRefs = useRef<ISeriesApi<'Line'>[]>([]);

  // 初始化图表
  useEffect(() => {
    if (!containerRef.current) return;

    try {
      // 创建图表
      const chart = createChart(containerRef.current, {
        layout: {
          background: { color: '#0f172a' }, // slate-900
          textColor: '#94a3b8', // slate-400
        },
        grid: {
          vertLines: { color: '#1e293b' }, // slate-800
          horzLines: { color: '#1e293b' },
        },
        crosshair: {
          mode: 1,
          vertLine: {
            color: '#64748b',
            labelBackgroundColor: '#64748b',
          },
          horzLine: {
            color: '#64748b',
            labelBackgroundColor: '#64748b',
          },
        },
        rightPriceScale: {
          borderColor: '#334155',
        },
        timeScale: {
          borderColor: '#334155',
          timeVisible: false,
          secondsVisible: false,
        },
        width: containerRef.current.clientWidth,
        height: height,
      });

      chartRef.current = chart;

      // 创建蜡烛图系列
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: UP_COLOR,
        downColor: DOWN_COLOR,
        borderUpColor: UP_BORDER,
        borderDownColor: DOWN_BORDER,
        wickUpColor: UP_COLOR,
        wickDownColor: DOWN_COLOR,
      });
      candlestickSeriesRef.current = candlestickSeries;

      // 创建成交量系列（在底部）
      const volumeSeries = chart.addHistogramSeries({
        color: UP_COLOR,
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
      });
      volumeSeriesRef.current = volumeSeries;

      // 设置成交量在底部
      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      // 创建 MA 线系列
      maPeriods.forEach((period, index) => {
        const maSeries = chart.addLineSeries({
          color: MA_COLORS[index % MA_COLORS.length],
          lineWidth: 1,
          title: `MA${period}`,
        });
        maSeriesRefs.current.push(maSeries);
      });

      // 监听十字光标移动
      const handleCrosshairMove = (param: any) => {
        if (onDataHover) {
          if (param.time && param.point) {
            const index = data.findIndex(d => d.timestamp / 1000 === param.time);
            if (index !== -1) {
              onDataHover(data[index]);
            }
          } else {
            onDataHover(null);
          }
        }
      };

      chart.subscribeCrosshairMove(handleCrosshairMove);

      // 响应式调整
      const handleResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      // 清理函数
      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
        chartRef.current = null;
        candlestickSeriesRef.current = null;
        volumeSeriesRef.current = null;
        maSeriesRefs.current = [];
      };
    } catch (e) {
      console.error('KlineChart init error:', e);
    }
  }, [height, maPeriods, onDataHover]);

  // 更新数据
  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    try {
      // 转换蜡烛图数据
      const candleData: CandlestickData[] = data.map(d => ({
        time: d.timestamp / 1000 as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      // 转换成交量数据
      const volumeData: HistogramData[] = data.map(d => ({
        time: d.timestamp / 1000 as Time,
        value: d.volume || 0,
        color: d.close >= d.open ? UP_COLOR : DOWN_COLOR,
      }));

      // 设置数据
      candlestickSeriesRef.current?.setData(candleData);
      volumeSeriesRef.current?.setData(volumeData);

      // 设置 MA 数据
      maPeriods.forEach((period, index) => {
        if (maSeriesRefs.current[index]) {
          const maData = calculateMA(data, period);
          maSeriesRefs.current[index].setData(maData);
        }
      });

      // 调整时间范围以显示所有数据
      chartRef.current.timeScale().fitContent();
    } catch (e) {
      console.error('KlineChart update data error:', e);
    }
  }, [data, maPeriods]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: `${height}px` }}
      className="kline-chart-container"
    />
  );
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
