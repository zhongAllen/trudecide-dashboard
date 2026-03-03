const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const TARGET_SECTORS = [
  { id: 'ths_881121.TI', name: '半导体' },
  { id: 'ths_881155.TI', name: '银行' },
  { id: 'ths_881273.TI', name: '白酒' },
  { id: 'ths_881281.TI', name: '电池' },
  { id: 'ths_881140.TI', name: '化学制药' },
  { id: 'ths_881279.TI', name: '光伏设备' },
  { id: 'ths_881157.TI', name: '证券' },
  { id: 'ths_881144.TI', name: '医疗器械' },
  { id: 'ths_881125.TI', name: '汽车整车' },
  { id: 'ths_881272.TI', name: '软件开发' },
  { id: 'ths_881129.TI', name: '通信设备' },
  { id: 'ths_881112.TI', name: '钢铁' },
];

async function main() {
  for (const sector of TARGET_SECTORS) {
    // 获取成分股 ts_code
    const { data: stocks } = await sb.from('sector_stock_map')
      .select('ts_code')
      .eq('sector_id', sector.id)
      .eq('is_current', true)
      .limit(8);
    
    const tsCodes = (stocks || []).map(s => s.ts_code);
    
    if (tsCodes.length === 0) {
      console.log(`${sector.id} (${sector.name}): 无成分股`);
      continue;
    }
    
    // 获取股票名称和最新行情
    const { data: stockMeta } = await sb.from('stock_meta')
      .select('ts_code, name, industry')
      .in('ts_code', tsCodes);
    
    const { data: stockBasic } = await sb.from('stock_daily_basic')
      .select('ts_code, close, pct_chg, pe_ttm, pb, total_mv, turnover_rate')
      .in('ts_code', tsCodes)
      .eq('trade_date', '20260302')
      .limit(8);
    
    const metaMap = {};
    (stockMeta || []).forEach(s => { metaMap[s.ts_code] = s; });
    const basicMap = {};
    (stockBasic || []).forEach(s => { basicMap[s.ts_code] = s; });
    
    console.log(`\n// ${sector.id} (${sector.name})`);
    tsCodes.forEach(code => {
      const m = metaMap[code] || {};
      const b = basicMap[code] || {};
      console.log(`  { ts_code: '${code}', name: '${m.name || '?'}', industry: '${m.industry || sector.name}', close: ${b.close || 0}, pct_chg: ${b.pct_chg || 0}, pe_ttm: ${b.pe_ttm || null}, pb: ${b.pb || null}, total_mv: ${b.total_mv || null}, turnover_rate: ${b.turnover_rate || null} },`);
    });
  }
}
main().catch(console.error);
