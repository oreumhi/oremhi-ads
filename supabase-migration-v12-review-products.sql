-- ============================================
-- v12: 후기체크 대상 매장/상품 목록 (대시보드에서 추가·삭제 → 자동실행에 반영)
-- Supabase SQL Editor에서 전체 복사 → 실행하세요
-- ============================================

CREATE TABLE IF NOT EXISTS review_products (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,              -- 매장(브랜드)명
  name TEXT,                        -- 상품명(상품1 등, 대시보드에서 수정 가능)
  url TEXT NOT NULL,                -- 상품 URL (점검 대상, 고유)
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,      -- false면 점검 대상에서 제외
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS review_products_url ON review_products(url);
CREATE INDEX IF NOT EXISTS review_products_store ON review_products(store);

ALTER TABLE review_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_products_all ON review_products;
CREATE POLICY review_products_all ON review_products FOR ALL USING (true) WITH CHECK (true);

SELECT table_name FROM information_schema.tables WHERE table_name = 'review_products';
