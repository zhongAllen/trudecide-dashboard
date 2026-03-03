const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  // 查询几个代表性行业板块的成分股
  const sectors = [
    'ths_881121.TI', // 半导体
    'ths_881155.TI', // 银行
    'ths_881273.TI', // 白酒
    'ths_881281.TI', // 电池
    'ths_881140.TI', // 化学制药
    'ths_881279.TI', // 光伏设备
    'ths_881157.TI', // 证券
    'ths_881144.TI', // 医疗器械
  ];

  const { data: maps } = await sb.from('sector_stock_map')
    .select('sector_id,ts_code')
    .in('sector_id', sectors)
    .eq('is_current', true)
    .limit(200);

  // 按板块分组
  const grouped = {};
  for (const d of maps) {
    if (!grouped[d.sector_id]) grouped[d.sector_id] = [];
    grouped[d.sector_id].push(d.ts_code);
  }

  // 查板块名称
  const { data: sectorMeta } = await sb.from('sector_meta')
    .select('id,name_cn')
    .in('id', sectors);
  const sectorNames = {};
  for (const s of sectorMeta) sectorNames[s.id] = s.name_cn;

  // 查股票名称
  const allCodes = maps.map(d => d.ts_code);
  const { data: stocks } = await sb.from('stock_meta')
    .select('ts_code,symbol,name_cn,industry,market,area')
    .in('ts_code', allCodes);
  const stockMap = {};
  for (const s of stocks) stockMap[s.ts_code] = s;

  // 输出
  for (const [sid, codes] of Object.entries(grouped)) {
    console.log(`\n=== ${sectorNames[sid]} (${sid}) ===`);
    for (const code of codes.slice(0, 8)) {
      const s = stockMap[code];
      if (s) console.log(`  ${s.ts_code}  ${s.symbol}  ${s.name_cn}  ${s.market}  ${s.industry}`);
    }
    console.log(`  ... 共 ${codes.length} 只成分股`);
  }
}

main().catch(console.error);
