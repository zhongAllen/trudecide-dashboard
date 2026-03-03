/**
 * query_db_meta.js — 查询数据库元数据用于 TopDown 对齐
 */
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  // 1. indicator_meta
  console.log('\n========== indicator_meta ==========');
  const { data: indicators, error: e1 } = await sb
    .from('indicator_meta')
    .select('id,name_cn,category,unit,scale,region,frequency')
    .order('category');
  if (e1) { console.error(e1); } else {
    console.log('Total indicators:', indicators.length);
    const groups = {};
    indicators.forEach(d => {
      if (!groups[d.category]) groups[d.category] = [];
      groups[d.category].push(d);
    });
    Object.entries(groups).forEach(([cat, items]) => {
      console.log(`\n--- category: ${cat} (${items.length} 条) ---`);
      items.slice(0, 20).forEach(i =>
        console.log(`  ${i.id} | ${i.name_cn} | ${i.unit} | ${i.region} | ${i.frequency}`)
      );
      if (items.length > 20) console.log(`  ... 共 ${items.length} 条`);
    });
  }

  // 2. sector_meta
  console.log('\n========== sector_meta ==========');
  const { data: sectors, error: e2 } = await sb
    .from('sector_meta')
    .select('id,name_cn,system,level,idx_type,is_active')
    .eq('is_active', true)
    .order('system');
  if (e2) { console.error(e2); } else {
    console.log('Total active sectors:', sectors.length);
    const sGroups = {};
    sectors.forEach(d => {
      const key = `${d.system}/${d.idx_type}`;
      if (!sGroups[key]) sGroups[key] = [];
      sGroups[key].push(d);
    });
    Object.entries(sGroups).forEach(([key, items]) => {
      console.log(`\n--- ${key} (${items.length} 条) ---`);
      items.slice(0, 30).forEach(i => console.log(`  ${i.id} | ${i.name_cn} | level=${i.level}`));
      if (items.length > 30) console.log(`  ... 共 ${items.length} 条`);
    });
  }

  // 3. sector_stock_map 样本
  console.log('\n========== sector_stock_map (sample) ==========');
  const { data: maps, error: e3 } = await sb
    .from('sector_stock_map')
    .select('sector_id,ts_code,system')
    .eq('is_current', true)
    .limit(20);
  if (e3) { console.error(e3); } else {
    console.log('Sample (20):', JSON.stringify(maps, null, 2));
  }

  // 4. 查询个股相关表
  console.log('\n========== 个股相关表检查 ==========');
  const stockTables = [
    'stock_meta', 'stock_daily', 'stock_daily_basic',
    'stock_moneyflow', 'stock_income', 'stock_balance', 'stock_cashflow',
    'stock_fina_indicator', 'stock_announcement', 'stock_holder',
    'stock_pledge', 'stock_holder_trade', 'stock_news'
  ];
  for (const tbl of stockTables) {
    const { count, error } = await sb.from(tbl).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`  ${tbl}: ❌ ${error.message}`);
    } else {
      console.log(`  ${tbl}: ✅ ${count} 条`);
    }
  }

  // 5. stock_meta 样本
  console.log('\n========== stock_meta (sample 10) ==========');
  const { data: stocks, error: e5 } = await sb
    .from('stock_meta')
    .select('ts_code,symbol,name_cn,area,industry,market,list_date,is_active')
    .eq('is_active', true)
    .limit(10);
  if (e5) { console.error(e5); } else {
    stocks.forEach(s => console.log(`  ${s.ts_code} | ${s.name_cn} | ${s.industry} | ${s.market}`));
  }

  // 6. 查 sector_stock_map 中某个热门板块的成分股
  console.log('\n========== 半导体板块成分股 (sector_stock_map) ==========');
  // 先找半导体板块 id
  const { data: semSectors } = await sb
    .from('sector_meta')
    .select('id,name_cn,system')
    .ilike('name_cn', '%半导体%')
    .eq('is_active', true);
  console.log('半导体板块:', JSON.stringify(semSectors));

  if (semSectors && semSectors.length > 0) {
    const semId = semSectors[0].id;
    const { data: semStocks } = await sb
      .from('sector_stock_map')
      .select('ts_code,system')
      .eq('sector_id', semId)
      .eq('is_current', true)
      .limit(20);
    console.log(`${semSectors[0].name_cn}(${semId}) 成分股:`, JSON.stringify(semStocks));
  }

  // 7. 查 stock_fina_indicator 字段结构
  console.log('\n========== stock_fina_indicator 字段样本 ==========');
  const { data: fina, error: e7 } = await sb
    .from('stock_fina_indicator')
    .select('*')
    .limit(1);
  if (e7) { console.log('  ❌', e7.message); }
  else if (fina && fina.length > 0) {
    console.log('  字段:', Object.keys(fina[0]).join(', '));
  }

  // 8. 查 stock_income 字段结构
  console.log('\n========== stock_income 字段样本 ==========');
  const { data: income, error: e8 } = await sb
    .from('stock_income')
    .select('*')
    .limit(1);
  if (e8) { console.log('  ❌', e8.message); }
  else if (income && income.length > 0) {
    console.log('  字段:', Object.keys(income[0]).join(', '));
    console.log('  样本:', JSON.stringify(income[0]));
  }
}

main().catch(console.error);
