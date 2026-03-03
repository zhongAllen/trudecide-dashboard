const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // 查看最近的 collect_log 记录
  const { data, error } = await sb.from('collect_log')
    .select('module, run_date, status, rows_written, error_msg, started_at')
    .order('started_at', {ascending: false})
    .limit(10);
  
  if (error) {
    console.log('collect_log 查询错误:', error.message);
  } else {
    console.log('=== 最近采集日志 ===');
    (data || []).forEach(r => console.log(JSON.stringify(r)));
  }
  
  // 查看 stock_holders 最新数据
  const { data: d2, error: e2 } = await sb.from('stock_holders')
    .select('end_date, ts_code')
    .order('end_date', {ascending: false})
    .limit(5);
  
  if (e2) {
    console.log('stock_holders 查询错误:', e2.message);
  } else {
    console.log('\n=== stock_holders 最新数据 ===');
    (d2 || []).forEach(r => console.log(JSON.stringify(r)));
  }
  
  // 查看 sector_daily 最新数据
  const { data: d3, error: e3 } = await sb.from('sector_daily')
    .select('trade_date, sector_id')
    .order('trade_date', {ascending: false})
    .limit(3);
  
  if (e3) {
    console.log('sector_daily 查询错误:', e3.message);
  } else {
    console.log('\n=== sector_daily 最新数据 ===');
    (d3 || []).forEach(r => console.log(JSON.stringify(r)));
  }
}
main().catch(console.error);
