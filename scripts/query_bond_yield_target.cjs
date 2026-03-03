const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // 查看 macro_bond_yield_10y 在 collect_target 中的登记
  const { data, error } = await sb.from('collect_target').select('*').eq('module', 'macro_bond_yield_10y');
  console.log('macro_bond_yield_10y 登记:', JSON.stringify(data, null, 2));
  
  // 查看 indicator_values 中 bond_yield_10y 的数据
  const { data: d2 } = await sb.from('indicator_values')
    .select('indicator_id, date, value')
    .eq('indicator_id', 'bond_yield_10y')
    .order('date', {ascending: false})
    .limit(3);
  console.log('bond_yield_10y 最新数据:', JSON.stringify(d2, null, 2));
  
  // 查看所有 macro 相关的 collect_target 登记
  const { data: d3 } = await sb.from('collect_target').select('module, label, table_name, date_field, quality_status, latest_date').ilike('module', 'macro%').order('module');
  console.log('\n宏观相关 collect_target:', JSON.stringify(d3, null, 2));
}
main().catch(console.error);
