const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // 查找数据质量检查相关需求
  const { data: qualityReqs } = await sb.from('requirements')
    .select('id, title, status, description')
    .or('title.ilike.%质量%,title.ilike.%quality%,title.ilike.%REQ-037%,description.ilike.%质量检查%');
  console.log('=== 数据质量相关需求 ===');
  (qualityReqs || []).forEach(r => console.log(`${r.id}: [${r.status}] ${r.title}`));
  
  // 查找所有 id 包含 037 的需求
  const { data: req037 } = await sb.from('requirements')
    .select('id, title, status')
    .ilike('id', '%037%');
  console.log('\n=== id 包含 037 的需求 ===');
  (req037 || []).forEach(r => console.log(`${r.id}: [${r.status}] ${r.title}`));
  
  // 插入数据质量修复需求（如果不存在）
  const newReq = {
    id: 'REQ-037',
    title: '宏观数据质量自动检查工具（全库三维巡检）',
    description: '实现全库数据质量自动检查，覆盖及时性/完整性/准确性三个维度，支持 HTML 报告生成和邮件告警。本次修复：1) 新增 normalize_date_str() 兼容 YYYYMMDD/YYYYMM 格式，修复 stock_pledge/broker_recommend 误报；2) macro_bond_yield_10y 设置 is_active=false 避免误报；3) 补采5个数据源至最新日期。',
    status: 'done',
    priority: 2,
    resolved_by: 'AI',
    code_refs: [
      'skills/macro-data-quality-check/scripts/run_all_sources_check.py',
      'scripts/fix_bond_yield_target.cjs'
    ],
    module: 'data_quality'
  };
  
  const { data: inserted, error: ie } = await sb.from('requirements').upsert(newReq, {onConflict: 'id'}).select();
  if (ie) {
    console.log('\n插入 REQ-037 失败:', ie.message);
  } else {
    console.log('\n✅ REQ-037 已写入/更新:', JSON.stringify(inserted?.[0]?.id));
  }
}
main().catch(console.error);
