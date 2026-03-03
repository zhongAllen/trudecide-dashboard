const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // 查 stock_meta 字段结构
  const { data: sample, error } = await sb.from('stock_meta').select('*').limit(3);
  if (error) { console.log('stock_meta 错误:', error.message); return; }
  console.log('stock_meta 字段:', Object.keys(sample[0]).join(', '));
  console.log('示例:', JSON.stringify(sample[0]));
  
  // 查几个已知股票
  const { data: known } = await sb.from('stock_meta')
    .select('*')
    .in('ts_code', ['688981.SH', '600519.SH', '601398.SH', '300661.SZ']);
  console.log('\n已知股票查询结果:');
  (known || []).forEach(s => console.log(JSON.stringify(s)));
  
  // 查 stock_daily_basic 中 2026-03-02 的数据（确认字段名）
  const { data: basic, error: be } = await sb.from('stock_daily_basic')
    .select('*')
    .in('ts_code', ['688981.SH', '600519.SH'])
    .eq('trade_date', '20260302')
    .limit(2);
  if (be) { console.log('stock_daily_basic 错误:', be.message); }
  else {
    console.log('\nstock_daily_basic 字段:', basic && basic.length > 0 ? Object.keys(basic[0]).join(', ') : '无数据');
    (basic || []).forEach(s => console.log(JSON.stringify(s)));
  }
}
main().catch(console.error);
