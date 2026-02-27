-- ============================================================
-- requirements 表：结构化需求条目，与 knowledge_doc_meta 关联
-- 执行位置：Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements (
  id          TEXT PRIMARY KEY,          -- REQ-001, REQ-002 ...
  doc_id      TEXT REFERENCES knowledge_doc_meta(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,             -- 需求标题（一句话）
  description TEXT,                      -- 详细描述（可选）
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'in_progress', 'done', 'closed')),
  priority    INT  NOT NULL DEFAULT 2
              CHECK (priority IN (1, 2, 3)),  -- 1=高 2=中 3=低
  version     TEXT,                      -- 归属版本，如 v1 v6
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_requirements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_requirements_updated_at
  BEFORE UPDATE ON requirements
  FOR EACH ROW EXECUTE FUNCTION update_requirements_updated_at();

-- RLS：公开读，anon 可写（AI 友好）
ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON requirements
  FOR ALL USING (true) WITH CHECK (true);
