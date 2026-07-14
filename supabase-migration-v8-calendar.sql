-- ============================================
-- v8: 대화 캘린더 (날짜별 요약 메모)
-- Supabase SQL Editor에서 전체 복사 → 실행하세요
-- ============================================

CREATE TABLE IF NOT EXISTS chat_daily_notes (
  id TEXT PRIMARY KEY,
  owner_id TEXT,                    -- 담당 직원 (users.id)
  staff_name TEXT,
  client_name TEXT,                 -- 브랜드/광고주명
  date DATE NOT NULL,
  kind TEXT DEFAULT '기타',         -- 제안 | 질문 | 보고 | 요청 | 기타
  note TEXT,                        -- 초간략 요약 (예: 광고저조로 개선방안 제안)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_notes_owner_date ON chat_daily_notes(owner_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS chat_notes_dedup ON chat_daily_notes(owner_id, client_name, date);

-- RLS + 정책 (기존 테이블과 동일한 방식)
ALTER TABLE chat_daily_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_daily_notes_all ON chat_daily_notes;
CREATE POLICY chat_daily_notes_all ON chat_daily_notes FOR ALL USING (true) WITH CHECK (true);

-- 검증
SELECT table_name FROM information_schema.tables WHERE table_name = 'chat_daily_notes';
