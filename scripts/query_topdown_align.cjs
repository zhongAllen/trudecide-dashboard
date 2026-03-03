/**
 * query_topdown_align.cjs — 专门查询 TopDown 对齐所需数据
 */
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  // 1. CN 宏观指标（按 category 分组）
  console.log('\n========== CN 宏观指标 (indicator_meta, region=CN) ==========');
  const { data: cnIndicators } = await sb
    .from('indicator_meta')
    .select('id,name_cn,category,unit,scale,frequency')
    .eq('region', 'CN')
    .order('category');
  const catGroups = {};
  cnIndicators.forEach(d => {
    if (!catGroups[d.category]) catGroups[d.category] = [];
    catGroups[d.category].push(d);
  });
  Object.entries(catGroups).forEach(([cat, items]) => {
    console.log(`\n--- category: ${cat} (${items.length} 条) ---`);
    items.forEach(i => console.log(`  ${i.id} | ${i.name_cn} | ${i.unit} | ${i.frequency}`));
  });

  // 2. ths 行业板块（level=1，非地区）
  console.log('\n========== ths 行业板块 (sector_meta, system=ths, level=1) ==========');
  const { data: thsSectors } = await sb
    .from('sector_meta')
    .select('id,name_cn,idx_type,level')
    .eq('system', 'ths')
    .eq('level', 1)
    .eq('is_active', true)
    .order('idx_type');
  const idxGroups = {};
  thsSectors.forEach(d => {
    if (!idxGroups[d.idx_type]) idxGroups[d.idx_type] = [];
    idxGroups[d.idx_type].push(d);
  });
  Object.entries(idxGroups).forEach(([idx, items]) => {
    console.log(`\n--- idx_type: ${idx} (${items.length} 条) ---`);
    items.forEach(i => console.log(`  ${i.id} | ${i.name_cn}`));
  });

  // 3. 查询 sector_daily 中有数据的板块（最新日期）
  console.log('\n========== sector_daily 有数据的板块（最新5条）==========');
  const { data: sectorDailyLatest } = await sb
    .from('sector_daily')
    .select('sector_id,trade_date,pct_change,close')
    .order('trade_date', { ascending: false })
    .limit(20);
  const seenSectors = new Set();
  sectorDailyLatest.forEach(d => {
    if (!seenSectors.has(d.sector_id)) {
      seenSectors.add(d.sector_id);
      console.log(`  ${d.sector_id} | ${d.trade_date} | pct=${d.pct_change}`);
    }
  });

  // 4. 查询 sector_stock_map 中某几个热门板块的成分股（关联 stock_meta）
  const targetSectors = [
    'ths_881401.TI', // 半导体（如果存在）
    'ths_881101.TI', // 银行
    'ths_881103.TI', // 证券
  ];
  for (const sid of targetSectors) {
    const { data: stocks } = await sb
      .from('sector_stock_map')
      .select('ts_code,system')
      .eq('sector_id', sid)
      .eq('is_current', true)
      .limit(10);
    console.log(`\n--- 板块 ${sid} 成分股 (前10) ---`);
    if (stocks && stocks.length > 0) {
      // 查 stock_meta
      const codes = stocks.map(s => s.ts_code);
      const { data: metas } = await sb
        .from('stock_meta')
        .select('ts_code,name_cn,industry,market')
        .in('ts_code', codes);
      const metaMap = {};
      (metas || []).forEach(m => { metaMap[m.ts_code] = m; });
      stocks.forEach(s => {
        const m = metaMap[s.ts_code];
        console.log(`  ${s.ts_code} | ${m ? m.name_cn : '?'} | ${m ? m.industry : '?'}`);
      });
    } else {
      console.log('  (无数据)');
    }
  }

  // 5. 查询 stock_daily_basic 字段
  console.log('\n========== stock_daily_basic 字段 ==========');
  const { data: basicSample, error: be } = await sb
    .from('stock_daily_basic')
    .select('*')
    .limit(1);
  if (be) console.log('  ❌', be.message);
  else if (basicSample && basicSample.length > 0) {
    console.log('  字段:', Object.keys(basicSample[0]).join(', '));
    console.log('  样本:', JSON.stringify(basicSample[0]));
  }

  // 6. 查询 stock_moneyflow 字段
  console.log('\n========== stock_moneyflow 字段 ==========');
  const { data: mfSample, error: me } = await sb
    .from('stock_moneyflow')
    .select('*')
    .limit(1);
  if (me) console.log('  ❌', me.message);
  else if (mfSample && mfSample.length > 0) {
    console.log('  字段:', Object.keys(mfSample[0]).join(', '));
    console.log('  样本:', JSON.stringify(mfSample[0]));
  }

  // 7. 查询 stock_fina_indicator 字段（精简）
  console.log('\n========== stock_fina_indicator 关键字段 ==========');
  const { data: finaSample, error: fe } = await sb
    .from('stock_fina_indicator')
    .select('ts_code,ann_date,end_date,eps,bps,roe,roa,grossprofit_margin,netprofit_margin,debt_to_assets,current_ratio,quick_ratio,basic_eps_yoy,netprofit_yoy,or_yoy,assets_yoy')
    .order('ann_date', { ascending: false })
    .limit(3);
  if (fe) console.log('  ❌', fe.message);
  else console.log('  样本:', JSON.stringify(finaSample, null, 2));

  // 8. 查询 stock_income 关键字段
  console.log('\n========== stock_income 关键字段 ==========');
  const { data: incomeSample, error: ie } = await sb
    .from('stock_income')
    .select('ts_code,ann_date,end_date,total_revenue,revenue,operate_profit,total_profit,n_income,n_income_attr_p,basic_eps,ebit,ebitda,rd_exp')
    .order('ann_date', { ascending: false })
    .limit(3);
  if (ie) console.log('  ❌', ie.message);
  else console.log('  样本:', JSON.stringify(incomeSample, null, 2));

  // 9. 查询 stock_announcement 字段
  console.log('\n========== stock_announcement 字段 ==========');
  const { data: annSample, error: ae } = await sb
    .from('stock_announcement')
    .select('*')
    .limit(2);
  if (ae) console.log('  ❌', ae.message);
  else if (annSample && annSample.length > 0) {
    console.log('  字段:', Object.keys(annSample[0]).join(', '));
    console.log('  样本:', JSON.stringify(annSample[0]));
  }

  // 10. 查询 stock_holder 字段
  console.log('\n========== stock_holder 字段 ==========');
  const { data: holderSample, error: he } = await sb
    .from('stock_holder')
    .select('*')
    .limit(2);
  if (he) console.log('  ❌', he.message);
  else if (holderSample && holderSample.length > 0) {
    console.log('  字段:', Object.keys(holderSample[0]).join(', '));
    console.log('  样本:', JSON.stringify(holderSample[0]));
  }

  // 11. 查询 sector_daily 有数据的 ths 板块列表（distinct sector_id）
  console.log('\n========== sector_daily 中有数据的 ths 板块 ==========');
  const { data: allSectorDaily } = await sb
    .from('sector_daily')
    .select('sector_id,trade_date')
    .order('trade_date', { ascending: false })
    .limit(500);
  const latestByS = {};
  allSectorDaily.forEach(d => {
    if (!latestByS[d.sector_id]) latestByS[d.sector_id] = d.trade_date;
  });
  const thsIds = Object.keys(latestByS).filter(id => id.startsWith('ths_'));
  console.log(`共 ${thsIds.length} 个 ths 板块有 sector_daily 数据`);
  // 查这些板块的名称
  if (thsIds.length > 0) {
    const { data: thsMetas } = await sb
      .from('sector_meta')
      .select('id,name_cn,idx_type')
      .in('id', thsIds);
    thsMetas.forEach(m => console.log(`  ${m.id} | ${m.name_cn} | ${m.idx_type} | 最新: ${latestByS[m.id]}`));
  }
}

main().catch(console.error);
