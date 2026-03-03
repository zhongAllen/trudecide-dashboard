/**
 * query_full_align.cjs
 * 查询 TopDown 页面需要的所有数据，输出 JSON 供 Mock 数据使用
 */
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  // 1. 查询 12 个代表性行业板块（有 sector_daily 数据的 ths_881xxx）
  const targetSectors = [
    'ths_881121.TI', // 半导体
    'ths_881155.TI', // 银行
    'ths_881273.TI', // 白酒
    'ths_881281.TI', // 电池
    'ths_881140.TI', // 化学制药
    'ths_881279.TI', // 光伏设备
    'ths_881157.TI', // 证券
    'ths_881144.TI', // 医疗器械
    'ths_881125.TI', // 汽车整车
    'ths_881272.TI', // 软件开发
    'ths_881129.TI', // 通信设备
    'ths_881112.TI', // 钢铁
  ];

  // 查板块元数据
  const { data: sectorMeta } = await sb.from('sector_meta')
    .select('id,name_cn,idx_type,system,level,parent_id,is_active')
    .in('id', targetSectors);
  
  console.log('\n=== SECTOR_META_LIST ===');
  for (const s of sectorMeta) {
    console.log(JSON.stringify(s));
  }

  // 2. 查询每个板块的最新 sector_daily 数据
  const { data: latestDaily } = await sb.from('sector_daily')
    .select('sector_id,trade_date,open,high,low,close,pct_change,vol,amount,up_num,down_num,flat_num,avg_pe,total_mv,turnover_rate,leading_code,leading_name,leading_pct')
    .in('sector_id', targetSectors)
    .eq('trade_date', '2026-02-27');
  
  console.log('\n=== SECTOR_DAILY_LATEST ===');
  for (const d of latestDaily) {
    console.log(JSON.stringify(d));
  }

  // 3. 查询每个板块的成分股（前8只）
  const { data: maps } = await sb.from('sector_stock_map')
    .select('sector_id,ts_code,in_date,out_date,is_current,system')
    .in('sector_id', targetSectors)
    .eq('is_current', true)
    .limit(500);

  // 按板块分组
  const grouped = {};
  for (const d of maps) {
    if (!grouped[d.sector_id]) grouped[d.sector_id] = [];
    grouped[d.sector_id].push(d.ts_code);
  }

  // 查股票元数据
  const allCodes = maps.map(d => d.ts_code);
  const { data: stocks } = await sb.from('stock_meta')
    .select('ts_code,symbol,name_cn,area,industry,market,list_date,is_active')
    .in('ts_code', allCodes);
  const stockMap = {};
  for (const s of stocks) stockMap[s.ts_code] = s;

  console.log('\n=== SECTOR_STOCKS ===');
  for (const [sid, codes] of Object.entries(grouped)) {
    const top8 = codes.slice(0, 8);
    console.log(`\n// ${sid}`);
    for (const code of top8) {
      const s = stockMap[code];
      if (s) console.log(JSON.stringify(s));
    }
  }

  // 4. 查询 stock_daily_basic 最新数据（用于个股基本面）
  const sampleCodes = ['688981.SH', '300661.SZ', '002049.SZ', '600519.SH', '601398.SH'];
  const { data: basics } = await sb.from('stock_daily_basic')
    .select('ts_code,trade_date,close,turnover_rate,volume_ratio,pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,total_share,float_share,total_mv,circ_mv')
    .in('ts_code', sampleCodes)
    .order('trade_date', { ascending: false })
    .limit(10);
  
  console.log('\n=== STOCK_DAILY_BASIC_SAMPLE ===');
  for (const d of basics) {
    console.log(JSON.stringify(d));
  }
}

main().catch(console.error);
