/**
 * query_sector_stocks2.cjs — 查询有 sector_daily 数据的行业板块 + 成分股
 */
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  // 1. 查询 sector_daily 最近有数据的板块（只取行业板块 ths_884xxx）
  console.log('\n========== sector_daily 有数据的行业板块 ==========');
  const { data: sdData, error: sde } = await sb
    .from('sector_daily')
    .select('sector_id,trade_date,pct_change,close')
    .gte('trade_date', '2026-02-20')
    .like('sector_id', 'ths_884%')
    .order('trade_date', { ascending: false });
  
  if (sde) { console.error(sde); return; }
  console.log(`查到 ${sdData.length} 条记录`);
  
  const latestByS = {};
  sdData.forEach(d => {
    if (!latestByS[d.sector_id]) latestByS[d.sector_id] = d;
  });
  
  const sectorIds = Object.keys(latestByS);
  console.log(`有数据的行业板块数: ${sectorIds.length}`);
  
  // 查名称
  const { data: metas } = await sb
    .from('sector_meta')
    .select('id,name_cn,idx_type')
    .in('id', sectorIds);
  
  const metaMap = {};
  (metas || []).forEach(m => { metaMap[m.id] = m; });
  
  sectorIds.forEach(id => {
    const m = metaMap[id];
    const d = latestByS[id];
    console.log(`  ${id} | ${m ? m.name_cn : '?'} | ${d.trade_date} | pct=${d.pct_change}`);
  });

  // 2. 查几个热门板块的成分股
  const hotSectorNames = ['集成电路制造', '数字芯片设计', '国有大型银行', '证券Ⅲ', '白酒Ⅲ', '新能源发电', '光伏电池组件', '锂电池', '医疗设备', '人工智能'];
  
  for (const name of hotSectorNames) {
    const sector = (metas || []).find(m => m.name_cn === name || m.name_cn.includes(name));
    if (!sector) { console.log(`\n--- ${name}: 未找到 ---`); continue; }
    
    const { data: stocks } = await sb
      .from('sector_stock_map')
      .select('ts_code')
      .eq('sector_id', sector.id)
      .eq('is_current', true)
      .limit(10);
    
    console.log(`\n--- ${sector.name_cn}(${sector.id}) 成分股(前10) ---`);
    if (stocks && stocks.length > 0) {
      const codes = stocks.map(s => s.ts_code);
      const { data: stockMetas } = await sb
        .from('stock_meta')
        .select('ts_code,name_cn,industry,market')
        .in('ts_code', codes);
      (stockMetas || []).forEach(m => console.log(`  ${m.ts_code} | ${m.name_cn} | ${m.market}`));
    }
  }

  // 3. stock_daily_basic 字段
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

  // 4. stock_moneyflow 字段
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

  // 5. stock_fina_indicator 关键字段
  console.log('\n========== stock_fina_indicator 关键字段 ==========');
  const { data: finaSample, error: fe } = await sb
    .from('stock_fina_indicator')
    .select('ts_code,ann_date,end_date,eps,bps,roe,roa,grossprofit_margin,netprofit_margin,debt_to_assets,current_ratio,quick_ratio,basic_eps_yoy,netprofit_yoy,or_yoy')
    .order('ann_date', { ascending: false })
    .limit(2);
  if (fe) console.log('  ❌', fe.message);
  else console.log('  样本:', JSON.stringify(finaSample, null, 2));

  // 6. stock_announcement 字段
  console.log('\n========== stock_announcement 字段 ==========');
  const { data: annSample, error: ae } = await sb
    .from('stock_announcement')
    .select('*')
    .order('ann_date', { ascending: false })
    .limit(2);
  if (ae) console.log('  ❌', ae.message);
  else if (annSample && annSample.length > 0) {
    console.log('  字段:', Object.keys(annSample[0]).join(', '));
    console.log('  样本:', JSON.stringify(annSample[0]));
  }

  // 7. stock_holder 字段
  console.log('\n========== stock_holder 字段 ==========');
  const { data: holderSample, error: he } = await sb
    .from('stock_holder')
    .select('*')
    .order('end_date', { ascending: false })
    .limit(2);
  if (he) console.log('  ❌', he.message);
  else if (holderSample && holderSample.length > 0) {
    console.log('  字段:', Object.keys(holderSample[0]).join(', '));
    console.log('  样本:', JSON.stringify(holderSample[0]));
  }

  // 8. stock_income 关键字段
  console.log('\n========== stock_income 关键字段 ==========');
  const { data: incomeSample, error: ie } = await sb
    .from('stock_income')
    .select('ts_code,ann_date,end_date,total_revenue,revenue,operate_profit,total_profit,n_income,n_income_attr_p,basic_eps,ebit,ebitda,rd_exp')
    .order('ann_date', { ascending: false })
    .limit(2);
  if (ie) console.log('  ❌', ie.message);
  else console.log('  样本:', JSON.stringify(incomeSample, null, 2));

  // 9. stock_balance 字段
  console.log('\n========== stock_balance 字段 ==========');
  const { data: balSample, error: ble } = await sb
    .from('stock_balance')
    .select('ts_code,ann_date,end_date,total_assets,total_liab,total_hldr_eqy_exc_min_int,money_cap,accounts_receiv,inventories,lt_borr,st_borr')
    .order('ann_date', { ascending: false })
    .limit(2);
  if (ble) console.log('  ❌', ble.message);
  else console.log('  样本:', JSON.stringify(balSample, null, 2));
}

main().catch(console.error);
