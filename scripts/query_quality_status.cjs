const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  // 查 collect_target 所有记录
  const { data: ct, error: cte } = await client
    .from('collect_target')
    .select('module_name, label, group_label, table_name, req_id, is_active')
    .order('group_label');
  if (cte) { console.error('collect_target error:', cte.message); }
  else {
    console.log('\n=== collect_target (' + ct.length + ' records) ===');
    ct.forEach(r => console.log(JSON.stringify(r)));
  }

  // 查质量检查记录（collect_quality_check 或 quality_check_results）
  for (const tbl of ['collect_quality_check', 'quality_check_results', 'data_quality_results']) {
    const { data: qc, error: qce } = await client.from(tbl).select('*').limit(5);
    if (!qce) {
      console.log('\n=== ' + tbl + ' (sample) ===');
      qc.forEach(r => console.log(JSON.stringify(r)));
      break;
    }
  }

  // 查 indicator_values 中 bond_yield_10y 相关指标
  const { data: bv, error: bve } = await client
    .from('indicator_values')
    .select('indicator_id, region, trade_date, value')
    .like('indicator_id', '%bond%')
    .order('trade_date', { ascending: false })
    .limit(10);
  if (!bve) {
    console.log('\n=== bond_yield indicators in indicator_values ===');
    bv.forEach(r => console.log(JSON.stringify(r)));
  }
}
main().catch(console.error);
