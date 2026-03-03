const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // 查询 sector_meta 中 ths_881xxx.TI 系列（二级行业板块）
  const { data: sectors, error } = await sb.from('sector_meta')
    .select('id, name, system, idx_type, raw_code')
    .eq('system', 'ths')
    .ilike('id', 'ths_881%.TI')
    .order('id');
  
  if (error) {
    console.log('查询错误:', error.message);
    return;
  }
  
  console.log(`=== ths_881xxx.TI 行业板块（共 ${sectors.length} 个）===`);
  sectors.forEach(s => console.log(`${s.id} | ${s.name} | ${s.idx_type}`));
  
  // 查询 sector_daily 中有数据的 ths_881xxx 板块（按数据量排序）
  const { data: withData } = await sb.from('sector_daily')
    .select('sector_id')
    .ilike('sector_id', 'ths_881%.TI')
    .order('trade_date', {ascending: false})
    .limit(200);
  
  // 统计每个板块的数据量
  const countMap = {};
  (withData || []).forEach(r => {
    countMap[r.sector_id] = (countMap[r.sector_id] || 0) + 1;
  });
  
  console.log('\n=== sector_daily 中有数据的 ths_881xxx 板块（Top 20）===');
  const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 20);
  sorted.forEach(([id, count]) => {
    const meta = sectors.find(s => s.id === id);
    console.log(`${id} | ${meta?.name || '?'} | ${count} 条`);
  });
  
  // 查询几个重要板块的成分股
  const targetSectors = ['ths_881121.TI', 'ths_881155.TI', 'ths_881273.TI', 'ths_881281.TI'];
  for (const sid of targetSectors) {
    const { data: stocks } = await sb.from('sector_stock_map')
      .select('ts_code, name')
      .eq('sector_id', sid)
      .limit(10);
    const meta = sectors.find(s => s.id === sid);
    console.log(`\n=== ${sid} (${meta?.name || '?'}) 成分股（前10）===`);
    (stocks || []).forEach(s => console.log(`  ${s.ts_code} | ${s.name}`));
  }
}
main().catch(console.error);
