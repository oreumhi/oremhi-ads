-- ============================================
-- v11: 후기체크 스토어명/상품명 별칭 (대시보드에서 수정 → 기억)
-- Supabase SQL Editor에서 전체 복사 → 실행하세요
-- ============================================

-- 상품 별칭: URL 기준(상품 URL은 바뀌지 않음)으로 표시 이름을 기억
CREATE TABLE IF NOT EXISTS review_product_alias (
  url TEXT PRIMARY KEY,
  display_name TEXT,               -- 대시보드에 표시할 상품명
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 스토어 별칭: 원래 매장명(store) 기준으로 표시 이름을 기억
CREATE TABLE IF NOT EXISTS review_store_alias (
  store TEXT PRIMARY KEY,          -- 원본 매장명(프로그램이 보내는 값)
  display_name TEXT,               -- 대시보드에 표시할 매장명
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE review_product_alias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_product_alias_all ON review_product_alias;
CREATE POLICY review_product_alias_all ON review_product_alias FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE review_store_alias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_store_alias_all ON review_store_alias;
CREATE POLICY review_store_alias_all ON review_store_alias FOR ALL USING (true) WITH CHECK (true);

SELECT table_name FROM information_schema.tables
WHERE table_name IN ('review_product_alias', 'review_store_alias');
