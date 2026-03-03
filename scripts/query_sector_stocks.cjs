/**
 * query_sector_stocks.cjs — 查询行业板块列表和个股相关表结构
 */
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  // 1. ths 行业板块（idx_type=行业板块）
  console.log('\n========== ths 行业板块 (idx_type=行业板块) ==========');
  const { data: industryS } = await sb
    .from('sector_meta')
    .select('id,name_cn,idx_type')
    .eq('system', 'ths')
    .eq('idx_type', '行业板块')
    .eq('is_active', true)
    .order('id');
  console.log(`共 ${industryS.length} 个行业板块`);
  industryS.forEach(s => console.log(`  ${s.id} | ${s.name_cn}`));

  // 2. sector_daily 中有数据的行业板块（最新日期）
  console.log('\n========== sector_daily 中有数据的行业板块（最新日期）==========');
  const { data: allSD } = await sb
    .from('sector_daily')
    .select('sector_id,trade_date,pct_change,close,volume,amount')
    .gte('trade_date', '2026-02-01')
    .order('trade_date', { ascending: false });
  
  const latestByS = {};
  allSD.forEach(d => {
    if (!latestByS[d.sector_id]) latestByS[d.sector_id] = d;
  });
  
  // 过滤出行业板块
  const industryIds = new Set(industryS.map(s => s.id));
  const industryWithData = Object.entries(latestByS)
    .filter(([id]) => industryIds.has(id))
    .map(([id, d]) => ({ id, ...d }));
  
  console.log(`有 sector_daily 数据的行业板块: ${industryWithData.length} 个`);
  const industryNameMap = {};
  industryS.forEach(s => { industryNameMap[s.id] = s.name_cn; });
  industryWithData.slice(0, 50).forEach(d => {
    console.log(`  ${d.sector_id} | ${industryNameMap[d.sector_id]} | ${d.trade_date} | pct=${d.pct_change}`);
  });

  // 3. 查询半导体板块成分股
  console.log('\n========== 半导体板块成分股 ==========');
  const semSector = industryS.find(s => s.name_cn.includes('半导体'));
  if (semSector) {
    console.log(`半导体板块: ${semSector.id} | ${semSector.name_cn}`);
    const { data: semStocks } = await sb
      .from('sector_stock_map')
      .select('ts_code')
      .eq('sector_id', semSector.id)
      .eq('is_current', true);
    console.log(`成分股数量: ${semStocks.length}`);
    if (semStocks.length > 0) {
      const codes = semStocks.map(s => s.ts_code);
      const { data: metas } = await sb
        .from('stock_meta')
        .select('ts_code,name_cn,industry,market')
        .in('ts_code', codes);
      metas.forEach(m => console.log(`  ${m.ts_code} | ${m.name_cn} | ${m.industry}`));
    }
  } else {
    console.log('未找到半导体板块');
    // 查找相关板块
    const related = industryS.filter(s => s.name_cn.includes('电子') || s.name_cn.includes('芯片') || s.name_cn.includes('集成'));
    related.forEach(s => console.log(`  相关: ${s.id} | ${s.name_cn}`));
  }

  // 4. 查询几个热门行业板块的成分股
  const hotSectors = ['银行', '证券', '新能源', '医药', '消费电子', '人工智能'];
  for (const name of hotSectors) {
    const sector = industryS.find(s => s.name_cn.includes(name));
    if (sector) {
      const { data: stocks } = await sb
        .from('sector_stock_map')
        .select('ts_code')
        .eq('sector_id', sector.id)
        .eq('is_current', true)
        .limit(10);
      console.log(`\n--- ${sector.name_cn}(${sector.id}) 成分股(前10) ---`);
      if (stocks && stocks.length > 0) {
        const codes = stocks.map(s => s.ts_code);
        const { data: metas } = await sb
          .from('stock_meta')
          .select('ts_code,name_cn,industry')
          .in('ts_code', codes);
        (metas || []).forEach(m => console.log(`  ${m.ts_code} | ${m.name_cn}`));
      }
    }
  }

  // 5. stock_daily_basic 字段
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

  // 6. stock_moneyflow 字段
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

  // 7. stock_fina_indicator 关键字段
  console.log('\n========== stock_fina_indicator 关键字段 ==========');
  const { data: finaSample, error: fe } = await sb
    .from('stock_fina_indicator')
    .select('ts_code,ann_date,end_date,eps,bps,roe,roa,grossprofit_margin,netprofit_margin,debt_to_assets,current_ratio,quick_ratio,basic_eps_yoy,netprofit_yoy,or_yoy')
    .order('ann_date', { ascending: false })
    .limit(2);
  if (fe) console.log('  ❌', fe.message);
  else console.log('  样本:', JSON.stringify(finaSample, null, 2));

  // 8. stock_announcement 字段
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

  // 9. stock_holder 字段
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

  // 10. stock_income 关键字段
  console.log('\n========== stock_income 关键字段 ==========');
  const { data: incomeSample, error: ie } = await sb
    .from('stock_income')
    .select('ts_code,ann_date,end_date,total_revenue,revenue,operate_profit,total_profit,n_income,n_income_attr_p,basic_eps,ebit,ebitda,rd_exp')
    .order('ann_date', { ascending: false })
    .limit(2);
  if (ie) console.log('  ❌', ie.message);
  else console.log('  样本:', JSON.stringify(incomeSample, null, 2));

  // 11. stock_balance 字段
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
