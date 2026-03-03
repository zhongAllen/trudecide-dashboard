-- 修复 portfolio_holdings 表的 RLS 策略
-- 允许匿名用户（anon）读写，适用于 DEMO 阶段（无用户认证）
-- 后续接入 Supabase Auth 后，将策略改为基于 auth.uid() 的行级控制

-- 1. 先删除现有策略（如有）
DROP POLICY IF EXISTS "Allow anon read portfolio_holdings" ON portfolio_holdings;
DROP POLICY IF EXISTS "Allow anon insert portfolio_holdings" ON portfolio_holdings;
DROP POLICY IF EXISTS "Allow anon update portfolio_holdings" ON portfolio_holdings;
DROP POLICY IF EXISTS "Allow anon delete portfolio_holdings" ON portfolio_holdings;

-- 2. 创建宽松策略（DEMO 阶段）
CREATE POLICY "Allow anon read portfolio_holdings"
  ON portfolio_holdings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert portfolio_holdings"
  ON portfolio_holdings FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update portfolio_holdings"
  ON portfolio_holdings FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon delete portfolio_holdings"
  ON portfolio_holdings FOR DELETE
  TO anon
  USING (true);

-- 3. 同样修复 dashboard_config 表
DROP POLICY IF EXISTS "Allow anon read dashboard_config" ON dashboard_config;
DROP POLICY IF EXISTS "Allow anon insert dashboard_config" ON dashboard_config;
DROP POLICY IF EXISTS "Allow anon update dashboard_config" ON dashboard_config;
DROP POLICY IF EXISTS "Allow anon delete dashboard_config" ON dashboard_config;

CREATE POLICY "Allow anon read dashboard_config"
  ON dashboard_config FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert dashboard_config"
  ON dashboard_config FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update dashboard_config"
  ON dashboard_config FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon delete dashboard_config"
  ON dashboard_config FOR DELETE
  TO anon
  USING (true);
