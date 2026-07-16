-- ============================================
-- v18: 팀 캘린더 + 사진 저장소
--   calendar_events : 모든 일정을 한 테이블로 (확장 대비)
--     etype  : annual연차 | half반차 | sick병가 | out외근 | etc기타
--              | promise약속(자동) | perf성과경고(자동)
--     source : manual | auto_chat | auto_perf
--     status : ok | dismissed(자동항목 숨김) | needs_check(조치필요) | resolved(조치완료)
--   storage 'attachments' 버킷: 영수증/사진 첨부
-- ============================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  event_date DATE NOT NULL,
  end_date DATE,
  etype TEXT NOT NULL DEFAULT 'etc',
  owner_id TEXT, owner_name TEXT DEFAULT '',
  brand TEXT DEFAULT '',
  title TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  attachments JSONB DEFAULT '[]',
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'ok',
  severity TEXT DEFAULT '',
  resolve_memo TEXT DEFAULT '',
  resolved_by TEXT DEFAULT '', resolved_at TIMESTAMPTZ,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cal_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS cal_type_status ON calendar_events(etype, status);
CREATE INDEX IF NOT EXISTS cal_owner ON calendar_events(owner_id, event_date);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_events_all ON calendar_events;
CREATE POLICY calendar_events_all ON calendar_events FOR ALL USING (true) WITH CHECK (true);

-- 사진 저장소 (공개 버킷 + 익명 업로드 허용)
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments','attachments', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS attachments_read ON storage.objects;
CREATE POLICY attachments_read ON storage.objects FOR SELECT USING (bucket_id = 'attachments');
DROP POLICY IF EXISTS attachments_write ON storage.objects;
CREATE POLICY attachments_write ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attachments');
DROP POLICY IF EXISTS attachments_delete ON storage.objects;
CREATE POLICY attachments_delete ON storage.objects FOR DELETE USING (bucket_id = 'attachments');

SELECT 'calendar_events' AS created WHERE EXISTS
  (SELECT 1 FROM information_schema.tables WHERE table_name='calendar_events');
