-- ============================================================
-- 修复 indicator_values 表的 RLS 策略
-- 允许 service_role 执行 INSERT、UPDATE、DELETE（用于数据采集）
-- 请在 Supabase Dashboard > SQL Editor 中执行
-- ============================================================

-- Step 1: 删除旧的写入策略（如果存在）
DROP POLICY IF EXISTS "service_role can insert indicator_values" ON indicator_values;
DROP POLICY IF EXISTS "service_role can update indicator_values" ON indicator_values;
DROP POLICY IF EXISTS "service_role can delete indicator_values" ON indicator_values;
DROP POLICY IF EXISTS "service_role write indicator_values" ON indicator_values;

-- Step 2: 创建新的统一写入策略（INSERT + UPDATE + DELETE）
CREATE POLICY "service_role write indicator_values"
  ON indicator_values
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Step 3: 验证当前策略（执行后应看到两条策略：read + write）
SELECT 
  policyname,
  cmd,
  roles::text,
  permissive
FROM pg_policies
WHERE tablename = 'indicator_values'
ORDER BY policyname;
