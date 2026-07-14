-- ============================================
-- v7: 대화 분석 기능
-- Supabase SQL Editor에서 전체 복사 → 실행하세요
-- ============================================

-- 1. 대화 업로드 (직원이 올린 카톡 내보내기 원문)
CREATE TABLE IF NOT EXISTS chat_uploads (
  id TEXT PRIMARY KEY,
  owner_id TEXT,                    -- 업로드한 직원 (users.id)
  uploader_name TEXT,               -- 직원 이름 (표시용)
  room_name TEXT,                   -- 카톡방 이름 (파일에서 자동 추출)
  client_name TEXT,                 -- 광고주명
  file_name TEXT,
  content TEXT,                     -- 대화 원문 전체
  msg_count INTEGER DEFAULT 0,
  first_date DATE,                  -- 대화 시작일
  last_date DATE,                   -- 대화 마지막일
  new_from DATE,                    -- 이번 분석 대상 시작일 (이전 업로드와 중복 제거)
  status TEXT DEFAULT '대기',       -- 대기 | 완료
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 대화 품질 점수 (분석 결과)
CREATE TABLE IF NOT EXISTS chat_scores (
  id TEXT PRIMARY KEY,
  upload_id TEXT,                   -- chat_uploads.id
  owner_id TEXT,                    -- 담당 직원 (users.id)
  staff_name TEXT,
  client_name TEXT,
  period_start DATE,
  period_end DATE,
  score_total INTEGER,              -- 총점 /100
  score_diagnosis INTEGER,          -- 진단력 /25
  score_proposal INTEGER,           -- 제안력 /25
  score_question INTEGER,           -- 질문·대화유도 /25
  score_response INTEGER,           -- 광고주 반응 /15
  score_proactive INTEGER,          -- 선제성 /10
  stats JSONB,                      -- 정량지표 (메시지수, 질문수 등)
  comment TEXT,                     -- 총평
  good_example TEXT,                -- 잘한 대화 예시
  bad_example TEXT,                 -- 아쉬운 대화 예시
  advice TEXT,                      -- 다음 주 개선 포인트
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_uploads_owner ON chat_uploads(owner_id, created_at);
CREATE INDEX IF NOT EXISTS chat_scores_owner ON chat_scores(owner_id, period_end);

-- RLS + 정책 (기존 테이블과 동일한 방식)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['chat_uploads', 'chat_scores'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_all ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_all ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- 검증: 테이블 생성 확인
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('chat_uploads', 'chat_scores');
