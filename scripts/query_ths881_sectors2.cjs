const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // 先查 sector_meta 的字段结构
  const { data: sample, error: se } = await sb.from('sector_meta').select('*').limit(2);
  if (se) { console.log('sector_meta 错误:', se.message); return; }
  if (sample && sample.length > 0) {
    console.log('sector_meta 字段:', Object.keys(sample[0]).join(', '));
    console.log('示例:', JSON.stringify(sample[0]));
  }
  
  // 查 sector_stock_map 字段结构
  const { data: ssm, error: se2 } = await sb.from('sector_stock_map').select('*').limit(2);
  if (se2) { console.log('sector_stock_map 错误:', se2.message); return; }
  if (ssm && ssm.length > 0) {
    console.log('\nsector_stock_map 字段:', Object.keys(ssm[0]).join(', '));
    console.log('示例:', JSON.stringify(ssm[0]));
  }
}
main().catch(console.error);
