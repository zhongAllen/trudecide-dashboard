/**
 * 新浪财经实时行情API
 * ===================
 * 提供A股实时行情数据获取
 * 接口：http://hq.sinajs.cn/list=
 * 格式：sh+代码（上证）/ sz+代码（深证）
 */

export interface SinaRealtimeData {
  name: string;           // 股票名称
  open: number;           // 今日开盘价
  close: number;          // 昨日收盘价
  current: number;        // 当前价格
  high: number;           // 今日最高价
  low: number;            // 今日最低价
  buyPrice: number;       // 竞买价（买一价）
  sellPrice: number;      // 竞卖价（卖一价）
  volume: number;         // 成交量（手）
  amount: number;         // 成交金额（元）
  bidVolumes: number[];   // 买一到买五的挂单量
  bidPrices: number[];    // 买一到买五的价格
  askVolumes: number[];   // 卖一到卖五的挂单量
  askPrices: number[];    // 卖一到卖五的价格
  date: string;           // 日期
  time: string;           // 时间
}

/**
 * 将Tushare代码转换为新浪代码格式
 * 000001.SZ -> sz000001
 * 603881.SH -> sh603881
 */
export function convertToSinaCode(tsCode: string): string {
  const [code, exchange] = tsCode.split('.');
  if (exchange === 'SH') {
    return `sh${code}`;
  } else if (exchange === 'SZ') {
    return `sz${code}`;
  }
  return '';
}

/**
 * 解析新浪返回的数据
 * var hq_str_sh603881="数据港,36.540,36.260,36.540,37.360,36.040,36.530,36.540,4940496,18057885870,29100,36.530,100,36.520,200,36.510,100,36.500,100,36.540,1200,36.550,100,36.560,200,36.570,100,36.580,2025-03-07,15:00:01,00,";
 */
export function parseSinaData(sinaCode: string, dataStr: string): SinaRealtimeData | null {
  try {
    // 去掉var hq_str_xxx="前缀和后缀"
    const content = dataStr.replace(`var hq_str_${sinaCode}="`, '').replace('";', '');
    if (!content || content === '') {
      return null;
    }

    const parts = content.split(',');
    if (parts.length < 33) {
      return null;
    }

    return {
      name: parts[0],
      open: parseFloat(parts[1]),
      close: parseFloat(parts[2]),
      current: parseFloat(parts[3]),
      high: parseFloat(parts[4]),
      low: parseFloat(parts[5]),
      buyPrice: parseFloat(parts[6]),
      sellPrice: parseFloat(parts[7]),
      volume: parseInt(parts[8]),
      amount: parseFloat(parts[9]),
      bidVolumes: [
        parseInt(parts[10]),
        parseInt(parts[12]),
        parseInt(parts[14]),
        parseInt(parts[16]),
        parseInt(parts[18]),
      ],
      bidPrices: [
        parseFloat(parts[11]),
        parseFloat(parts[13]),
        parseFloat(parts[15]),
        parseFloat(parts[17]),
        parseFloat(parts[19]),
      ],
      askVolumes: [
        parseInt(parts[20]),
        parseInt(parts[22]),
        parseInt(parts[24]),
        parseInt(parts[26]),
        parseInt(parts[28]),
      ],
      askPrices: [
        parseFloat(parts[21]),
        parseFloat(parts[23]),
        parseFloat(parts[25]),
        parseFloat(parts[27]),
        parseFloat(parts[29]),
      ],
      date: parts[30],
      time: parts[31],
    };
  } catch (e) {
    console.error('Parse sina data error:', e);
    return null;
  }
}

/**
 * 获取实时行情数据
 * 注意：新浪财经API有跨域限制，需要在服务端或使用代理
 */
export async function fetchRealtimeQuote(tsCode: string): Promise<SinaRealtimeData | null> {
  const sinaCode = convertToSinaCode(tsCode);
  if (!sinaCode) return null;

  try {
    // 使用代理或Edge Function来避免跨域问题
    // 这里先使用一个公开的CORS代理作为示例
    const response = await fetch(
      `https://hq.sinajs.cn/list=${sinaCode}`,
      {
        headers: {
          'Referer': 'https://finance.sina.com.cn',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();
    return parseSinaData(sinaCode, text);
  } catch (e) {
    console.error('Fetch sina realtime error:', e);
    return null;
  }
}

/**
 * 批量获取实时行情
 */
export async function fetchBatchRealtimeQuotes(tsCodes: string[]): Promise<Map<string, SinaRealtimeData>> {
  const results = new Map<string, SinaRealtimeData>();

  // 分批处理，每批最多20个
  const batchSize = 20;
  for (let i = 0; i < tsCodes.length; i += batchSize) {
    const batch = tsCodes.slice(i, i + batchSize);
    const sinaCodes = batch.map(convertToSinaCode).filter(Boolean);

    if (sinaCodes.length === 0) continue;

    try {
      const response = await fetch(
        `https://hq.sinajs.cn/list=${sinaCodes.join(',')}`,
        {
          headers: {
            'Referer': 'https://finance.sina.com.cn',
          },
        }
      );

      if (!response.ok) continue;

      const text = await response.text();
      const lines = text.split(';').filter(line => line.trim());

      lines.forEach((line, index) => {
        const tsCode = batch[index];
        const sinaCode = sinaCodes[index];
        if (tsCode && sinaCode) {
          const data = parseSinaData(sinaCode, line + ';');
          if (data) {
            results.set(tsCode, data);
          }
        }
      });
    } catch (e) {
      console.error('Fetch batch error:', e);
    }
  }

  return results;
}

/**
 * 创建WebSocket连接获取实时推送（如果有）
 * 新浪财经主要使用轮询方式
 */
export function createRealtimePoller(
  tsCode: string,
  callback: (data: SinaRealtimeData) => void,
  interval: number = 3000
): { start: () => void; stop: () => void } {
  let timer: NodeJS.Timeout | null = null;
  let isRunning = false;

  const poll = async () => {
    if (!isRunning) return;
    const data = await fetchRealtimeQuote(tsCode);
    if (data) {
      callback(data);
    }
    if (isRunning) {
      timer = setTimeout(poll, interval);
    }
  };

  return {
    start: () => {
      if (isRunning) return;
      isRunning = true;
      poll();
    },
    stop: () => {
      isRunning = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
