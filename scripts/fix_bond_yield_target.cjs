const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // macro_bond_yield_10y 是东南亚国债收益率采集模块，尚未开发完成
  // 将其 is_active=false 避免质量检查误报，同时补充 label 和 group_label
  const { data, error } = await sb.from('collect_target').update({
    is_active: false,
    label: '东南亚国债收益率（待开发）',
    group_label: '宏观指标',
    req_id: 'REQ-TBD',
    note: '东南亚（SG/MY/TH/ID/PH）10年期国债收益率采集模块，采集脚本尚未开发，暂停质量检查。待 REQ 立项后启用。',
    table_name: 'indicator_values',
    date_field: 'date',
  }).eq('module', 'macro_bond_yield_10y');
  
  if (error) {
    console.error('更新失败:', error);
    return;
  }
  console.log('✅ macro_bond_yield_10y 已更新为 is_active=false，避免误报');
  
  // 验证
  const { data: d2 } = await sb.from('collect_target').select('module, label, is_active, note').eq('module', 'macro_bond_yield_10y');
  console.log('验证结果:', JSON.stringify(d2, null, 2));
}
main().catch(console.error);
