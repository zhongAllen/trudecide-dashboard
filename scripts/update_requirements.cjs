const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // 查询 requirements 表结构（取一条记录看字段）
  const { data: sample, error: se } = await sb.from('requirements').select('*').limit(1);
  if (se) {
    console.log('requirements 查询错误:', se.message);
    return;
  }
  if (sample && sample.length > 0) {
    console.log('requirements 表字段:', Object.keys(sample[0]).join(', '));
    console.log('示例记录:', JSON.stringify(sample[0], null, 2));
  }
  
  // 查询 REQ-037 是否存在
  const { data: req037 } = await sb.from('requirements').select('*').eq('req_id', 'REQ-037');
  console.log('\nREQ-037:', JSON.stringify(req037));
  
  // 查询最大 req_id 编号
  const { data: maxReq } = await sb.from('requirements').select('req_id').order('req_id', {ascending: false}).limit(5);
  console.log('\n最近的 req_id:', JSON.stringify(maxReq));
}
main().catch(console.error);
