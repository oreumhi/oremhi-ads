-- ============================================
-- 주식회사 오름히 광고 성과 대시보드 - 데이터베이스
-- Supabase SQL Editor에서 실행하세요
-- ============================================

-- 1. 광고 데이터 (보고서에서 올라온 원본 데이터)
CREATE TABLE IF NOT EXISTS ad_data (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  source TEXT NOT NULL,             -- 'search' 또는 'gfa'
  ad_type TEXT NOT NULL,            -- 파워링크, 쇼핑검색, 브랜드검색, GFA-논타겟, GFA-리타겟 등
  campaign_name TEXT,
  group_name TEXT,
  group_id TEXT,
  material_id TEXT,
  material_name TEXT,
  match_key TEXT NOT NULL,          -- 매핑용 고유 키
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conv_revenue NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 같은 날짜+같은 광고는 중복 저장 방지
CREATE UNIQUE INDEX IF NOT EXISTS ad_data_dedup
  ON ad_data(date, match_key);

-- 2. 매핑 (광고그룹/소재 → 브랜드+제품 연결)
CREATE TABLE IF NOT EXISTS mappings (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  product TEXT NOT NULL,
  ad_type TEXT NOT NULL,
  match_key TEXT NOT NULL UNIQUE,   -- ad_data의 match_key와 연결
  label TEXT,                       -- 화면에 표시할 이름
  campaign_name TEXT,               -- 참고용 캠페인명
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 앱 설정
CREATE TABLE IF NOT EXISTS ads_settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  pin_hash TEXT,
  font_size TEXT DEFAULT 'medium',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ads_settings (id, font_size)
VALUES ('main', 'medium')
ON CONFLICT (id) DO NOTHING;

-- RLS + 정책
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['ad_data', 'mappings', 'ads_settings'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Allow all" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
