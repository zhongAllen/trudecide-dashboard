/**
 * TradingViewChart.tsx - 专业K线图表组件
 * 
 * 使用 lightweight-charts 实现类似TradingView的专业K线展示
 * 支持：蜡烛图、成交量、移动平均线、十字光标
 */
import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData, Time } from 'lightweight-charts';

interface ChartData {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  amount: number;
  pct_chg?: number;
}

interface TradingViewChartProps {
  data: ChartData[];
  period: 'day' | 'week' | 'month' | 'intraday';
}

export default function TradingViewChart({ data, period }: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [hoverData, setHoverData] = useState<ChartData | null>(null);

  // A股红涨绿跌配色
  const upColor = '#ef4444';   // red-500
  const downColor = '#22c55e'; // green-500
  const upBorder = '#dc2626';  // red-600
  const downBorder = '#16a34a'; // green-600

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // 创建图表
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#758696',
          labelBackgroundColor: '#758696',
        },
        horzLine: {
          color: '#758696',
          labelBackgroundColor: '#758696',
        },
      },
      rightPriceScale: {
        borderColor: '#e0e0e0',
      },
      timeScale: {
        borderColor: '#e0e0e0',
        timeVisible: period === 'intraday',
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    chartRef.current = chart;

    // 创建蜡烛图系列
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: upColor,
      downColor: downColor,
      borderUpColor: upBorder,
      borderDownColor: downBorder,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });
    candlestickSeriesRef.current = candlestickSeries;

    // 创建成交量系列（在底部）
    const volumeSeries = chart.addHistogramSeries({
      color: upColor,
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // 设置为独立的价格轴
    });
    volumeSeriesRef.current = volumeSeries;

    // 设置成交量在底部
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // 转换数据格式
    const candleData: CandlestickData[] = data.map(d => ({
      time: new Date(d.trade_date).getTime() / 1000 as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumeData: HistogramData[] = data.map(d => ({
      time: new Date(d.trade_date).getTime() / 1000 as Time,
      value: d.vol,
      color: d.close >= d.open ? upColor : downColor,
    }));

    candlestickSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    // 添加十字光标监听
    chart.subscribeCrosshairMove((param) => {
      if (param.time && param.point) {
        const index = data.findIndex(d => {
          const dTime = new Date(d.trade_date).getTime() / 1000;
          return dTime === param.time;
        });
        if (index !== -1) {
          setHoverData(data[index]);
        }
      } else {
        setHoverData(null);
      }
    });

    // 适应容器大小
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // 清理
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, period]);

  // 格式化函数
  const fmtPrice = (v?: number) => v?.toFixed(2) ?? '--';
  const fmtPct = (v?: number) => {
    if (v === undefined || v === null) return '--';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  };
  const fmtVolume = (v?: number) => {
    if (!v) return '--';
    if (v >= 100000000) return `${(v / 100000000).toFixed(2)}亿`;
    if (v >= 10000) return `${(v / 10000).toFixed(2)}万`;
    return v.toString();
  };

  const displayData = hoverData || data[data.length - 1];
  const isUp = displayData?.close >= displayData?.open;

  return (
    <div className="space-y-3">
      {/* 价格信息栏 */}
      <div className="flex items-baseline gap-4">
        <span className={`text-3xl font-bold ${isUp ? 'text-red-500' : 'text-green-500'}`}>
          {fmtPrice(displayData?.close)}
        </span>
        <span className={`text-lg ${isUp ? 'text-red-500' : 'text-green-500'}`}>
          {displayData?.pct_chg && displayData.pct_chg > 0 ? '+' : ''}
          {fmtPrice(displayData?.pct_chg)}
        </span>
        <span className={`text-lg ${isUp ? 'text-red-500' : 'text-green-500'}`}>
          {fmtPct(displayData?.pct_chg)}
        </span>
      </div>

      {/* 详细数据 */}
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500">今开</span>
          <div className={`font-medium ${displayData?.open > (displayData?.close || 0) ? 'text-green-500' : 'text-red-500'}`}>
            {fmtPrice(displayData?.open)}
          </div>
        </div>
        <div>
          <span className="text-gray-500">最高</span>
          <div className="font-medium text-red-500">{fmtPrice(displayData?.high)}</div>
        </div>
        <div>
          <span className="text-gray-500">最低</span>
          <div className="font-medium text-green-500">{fmtPrice(displayData?.low)}</div>
        </div>
        <div>
          <span className="text-gray-500">昨收</span>
          <div className="font-medium">
            {fmtPrice(displayData?.close && displayData.pct_chg 
              ? displayData.close / (1 + displayData.pct_chg / 100) 
              : 0)}
          </div>
        </div>
        <div>
          <span className="text-gray-500">成交量</span>
          <div className="font-medium">{fmtVolume(displayData?.vol)}</div>
        </div>
        <div>
          <span className="text-gray-500">成交额</span>
          <div className="font-medium">{fmtVolume(displayData?.amount)}</div>
        </div>
        <div>
          <span className="text-gray-500">振幅</span>
          <div className="font-medium">
            {displayData?.high && displayData?.low 
              ? (((displayData.high - displayData.low) / displayData.low) * 100).toFixed(2) 
              : '--'}%
          </div>
        </div>
      </div>

      {/* 图表容器 */}
      <div ref={chartContainerRef} className="w-full" style={{ height: '400px' }} />
    </div>
  );
}
