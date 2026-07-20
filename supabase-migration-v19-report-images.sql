-- ============================================
-- v19: 일일보고·회의록 사진 첨부 (여러 장)
--   daily_reports.attachments : [{url, path, name}, ...]
--   meetings.attachments      : [{url, path, name}, ...]
--   storage 'attachments' 버킷은 v18에서 이미 생성됨 (재사용)
-- Supabase SQL Editor에서 전체 복사 → 실행하세요
-- ============================================

ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE meetings      ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

SELECT column_name FROM information_schema.columns
WHERE table_name IN ('daily_reports','meetings') AND column_name = 'attachments';
