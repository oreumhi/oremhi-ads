-- ============================================
-- v17: 팀 업무 관리 - 일일보고 / 회의록 / 액션아이템
--   daily_reports : 직원 3줄 일일보고 (사람당 하루 1건, upsert)
--   meetings      : 회의록
--   action_items  : 액션아이템 (회의 연결 또는 단독, 완료 추적)
-- Supabase SQL Editor에서 전체 복사 → 실행하세요
-- ============================================

CREATE TABLE IF NOT EXISTS daily_reports (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  staff_name TEXT DEFAULT '',
  report_date DATE NOT NULL,
  done TEXT DEFAULT '',
  tomorrow TEXT DEFAULT '',
  blocker TEXT DEFAULT '',
  ceo_comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, report_date)
);
CREATE INDEX IF NOT EXISTS daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS daily_reports_owner ON daily_reports(owner_id, report_date);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  meeting_date DATE NOT NULL,
  title TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS meetings_date ON meetings(meeting_date DESC);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT,
  content TEXT NOT NULL,
  assignee_id TEXT, assignee_name TEXT DEFAULT '',
  due_date DATE,
  done BOOLEAN DEFAULT FALSE,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS action_items_open ON action_items(done, due_date);
CREATE INDEX IF NOT EXISTS action_items_meeting ON action_items(meeting_id);
CREATE INDEX IF NOT EXISTS action_items_assignee ON action_items(assignee_id, done);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_reports_all ON daily_reports;
CREATE POLICY daily_reports_all ON daily_reports FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meetings_all ON meetings;
CREATE POLICY meetings_all ON meetings FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_items_all ON action_items;
CREATE POLICY action_items_all ON action_items FOR ALL USING (true) WITH CHECK (true);

SELECT table_name FROM information_schema.tables
WHERE table_name IN ('daily_reports', 'meetings', 'action_items');
