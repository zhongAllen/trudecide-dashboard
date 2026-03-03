const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  // 先查一条看字段名
  const { data: sample, error: se } = await client.from('collect_target').select('*').limit(3);
  if (se) { console.error('error:', se.message); return; }
  console.log('=== collect_target sample ===');
  sample.forEach(r => console.log(JSON.stringify(r)));
  console.log('\n=== Fields:', Object.keys(sample[0] || {}).join(', '));

  // 查所有记录
  const { data: all } = await client.from('collect_target').select('*').order('group_label');
  console.log('\n=== All collect_target (' + all.length + ') ===');
  all.forEach(r => {
    console.log(`[${r.group_label}] ${r.label} | table=${r.table_name} | req=${r.req_id} | active=${r.is_active}`);
  });
}
main().catch(console.error);
