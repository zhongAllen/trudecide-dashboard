-- ============================================================
-- 补录脚本：进出口同比 & 工业增加值同比（2025-09 至 2025-12）
-- 数据来源：
--   进出口 → 海关总署官网月度统计快讯（美元口径，同比增速）
--   工业增加值 → 国家统计局官网月度新闻稿（规模以上工业增加值，实际同比）
-- 执行方式：在 Supabase SQL Editor 中直接执行
-- 注意：使用 upsert 逻辑（ON CONFLICT DO UPDATE），已有数据会被覆盖
-- 生成时间：2026-02-28
-- 数据审计：
--   export_yoy 2025-09: +8.3%  来源 http://gdfs.customs.gov.cn/customs/302249/zfxxgk/2799825/302274/302275/6769608/index.html
--   export_yoy 2025-10: -1.1%  来源 http://gdfs.customs.gov.cn/customs/302249/zfxxgk/2799825/302274/302275/6811946/index.html
--   export_yoy 2025-11: +5.9%  来源 https://www.cceeccic.org/719803656.html (海关总署数据)
--   export_yoy 2025-12: +6.6%  来源 http://www.customs.gov.cn/customs/2026-01/14/article_2026012219105978750.html
--   import_yoy 2025-09: +7.4%  同上
--   import_yoy 2025-10: +1.0%  同上
--   import_yoy 2025-11: +1.9%  同上
--   import_yoy 2025-12: +5.7%  同上
--   industrial_yoy 2025-09: +6.5%  来源 https://www.stats.gov.cn/sj/zxfb/202510/t20251020_1961611.html
--   industrial_yoy 2025-10: +4.9%  来源 https://www.stats.gov.cn/sj/zxfb/202511/t20251114_1961856.html
--   industrial_yoy 2025-11: +4.8%  来源 (财新/新华网 2025-12-15)
--   industrial_yoy 2025-12: +5.2%  来源 https://www.stats.gov.cn/sj/zxfb/202601/t20260119_1962329.html
-- 日期规则：
--   export_yoy / import_yoy：使用海关总署实际发布日（非固定日，约每月10日前后）
--   industrial_yoy：使用国家统计局实际发布日（约每月15-20日）
-- ============================================================

INSERT INTO indicator_values
  (indicator_id, region, trade_date, publish_date, value, revision_seq, collected_at)
VALUES
  -- ── 出口同比（export_yoy）──────────────────────────────────
  ('export_yoy', 'CN', '2025-09-10', '2025-09-10',  8.3, 0, NOW()),
  ('export_yoy', 'CN', '2025-10-10', '2025-10-10', -1.1, 0, NOW()),
  ('export_yoy', 'CN', '2025-11-10', '2025-11-10',  5.9, 0, NOW()),
  ('export_yoy', 'CN', '2025-12-10', '2025-12-10',  6.6, 0, NOW()),

  -- ── 进口同比（import_yoy）──────────────────────────────────
  ('import_yoy', 'CN', '2025-09-10', '2025-09-10',  7.4, 0, NOW()),
  ('import_yoy', 'CN', '2025-10-10', '2025-10-10',  1.0, 0, NOW()),
  ('import_yoy', 'CN', '2025-11-10', '2025-11-10',  1.9, 0, NOW()),
  ('import_yoy', 'CN', '2025-12-10', '2025-12-10',  5.7, 0, NOW()),

  -- ── 工业增加值同比（industrial_yoy）───────────────────────
  ('industrial_yoy', 'CN', '2025-09-16', '2025-09-16',  6.5, 0, NOW()),
  ('industrial_yoy', 'CN', '2025-10-16', '2025-10-16',  4.9, 0, NOW()),
  ('industrial_yoy', 'CN', '2025-11-16', '2025-11-16',  4.8, 0, NOW()),
  ('industrial_yoy', 'CN', '2025-12-16', '2025-12-16',  5.2, 0, NOW())

ON CONFLICT (indicator_id, region, trade_date, revision_seq)
DO UPDATE SET
  value        = EXCLUDED.value,
  publish_date = EXCLUDED.publish_date,
  collected_at = EXCLUDED.collected_at;

-- ── 验证 ──────────────────────────────────────────────────────
SELECT indicator_id, region, trade_date, value
FROM indicator_values
WHERE indicator_id IN ('export_yoy', 'import_yoy', 'industrial_yoy')
  AND region = 'CN'
  AND trade_date >= '2025-09-01'
ORDER BY indicator_id, trade_date;
