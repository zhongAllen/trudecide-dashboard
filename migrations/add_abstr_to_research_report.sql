-- Migration: add abstr column to research_report table
-- Date: 2026-03-01
-- Reason: Tushare research_report interface returns abstr (摘要) field,
--         which was missing from the original table design.

ALTER TABLE research_report
  ADD COLUMN IF NOT EXISTS abstr TEXT;

COMMENT ON COLUMN research_report.abstr IS '研报摘要（来自Tushare research_report接口abstr字段）';
