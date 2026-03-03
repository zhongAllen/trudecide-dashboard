const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // 查询 sector_meta 中 ths_881xxx.TI 系列（二级行业板块）
  const { data: sectors, error } = await sb.from('sector_meta')
    .select('id, name_cn, system, idx_type, raw_code, level')
    .eq('system', 'ths')
    .ilike('id', 'ths_881%.TI')
    .order('id');
  
  if (error) {
    console.log('查询错误:', error.message);
    return;
  }
  
  console.log(`=== ths_881xxx.TI 行业板块（共 ${sectors.length} 个）===`);
  sectors.forEach(s => console.log(`${s.id} | ${s.name_cn} | level=${s.level} | ${s.idx_type}`));
  
  // 查询几个重要板块的成分股（需要 join stock_meta 获取名称）
  const targetSectors = [
    'ths_881121.TI',  // 半导体
    'ths_881155.TI',  // 银行
    'ths_881273.TI',  // 白酒
    'ths_881281.TI',  // 电池
    'ths_881140.TI',  // 化学制药
    'ths_881279.TI',  // 光伏设备
    'ths_881157.TI',  // 证券
    'ths_881144.TI',  // 医疗器械
  ];
  
  for (const sid of targetSectors) {
    const { data: stocks } = await sb.from('sector_stock_map')
      .select('ts_code')
      .eq('sector_id', sid)
      .eq('is_current', true)
      .limit(8);
    const meta = sectors.find(s => s.id === sid);
    const tsCodes = (stocks || []).map(s => s.ts_code);
    
    // 查询股票名称
    let names = {};
    if (tsCodes.length > 0) {
      const { data: stockMeta } = await sb.from('stock_meta')
        .select('ts_code, name')
        .in('ts_code', tsCodes);
      (stockMeta || []).forEach(s => { names[s.ts_code] = s.name; });
    }
    
    console.log(`\n=== ${sid} (${meta?.name_cn || '?'}) 成分股（前8）===`);
    tsCodes.forEach(code => console.log(`  ${code} | ${names[code] || '?'}`));
  }
}
main().catch(console.error);
