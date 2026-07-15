-- ============================================
-- v10: 후기 체크 (매장·상품별 저평점 후기 위치)
-- Supabase SQL Editor에서 전체 복사 → 실행하세요
-- ============================================

CREATE TABLE IF NOT EXISTS review_checks (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,               -- 후기 체크 실행 날짜
  checked_at TIMESTAMPTZ,           -- 실행 시각(시:분)
  store TEXT NOT NULL,              -- 매장(브랜드)명
  brand TEXT,                       -- 대시보드 브랜드명(권한 필터용, 없으면 store)
  owner_id TEXT,                    -- 담당 직원(users.id) - 없으면 전체 공개
  product_name TEXT,                -- 상품명(상품1 등)
  url TEXT,
  ok BOOLEAN DEFAULT true,          -- 정상 여부
  low_count INTEGER DEFAULT 0,      -- 저평점 후기 개수
  lows JSONB,                       -- [[순위,별점], ...]
  total_count INTEGER DEFAULT 0,    -- 확인한 후기 수
  note TEXT,                        -- 확인필요 등 메모
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_checks_date ON review_checks(date, store);
-- 같은 날짜+매장+상품은 재실행 시 덮어쓰기
CREATE UNIQUE INDEX IF NOT EXISTS review_checks_dedup ON review_checks(date, store, product_name);

-- 매장 → 담당 직원 매핑 (대시보드에서 그때그때 지정, 한 번 지정하면 기억됨)
CREATE TABLE IF NOT EXISTS review_store_map (
  store TEXT PRIMARY KEY,
  owner_id TEXT,                    -- 담당 직원(users.id)
  brand TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE review_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_checks_all ON review_checks;
CREATE POLICY review_checks_all ON review_checks FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE review_store_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_store_map_all ON review_store_map;
CREATE POLICY review_store_map_all ON review_store_map FOR ALL USING (true) WITH CHECK (true);

-- 검증
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('review_checks', 'review_store_map');
