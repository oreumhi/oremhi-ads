-- ============================================
-- 주식회사 오름히 광고 대시보드 v5 - 성능 최적화
-- Supabase SQL Editor에서 이 파일을 실행하세요
--
-- 변경: date 컬럼에 인덱스 추가 → 기간별 조회 속도 향상
-- ============================================

-- ad_data: date 인덱스 (기간 필터 속도 향상)
CREATE INDEX IF NOT EXISTS ad_data_date_idx ON ad_data(date);

-- ad_data: owner_id + date 복합 인덱스 (직원별 기간 조회 속도 향상)
CREATE INDEX IF NOT EXISTS ad_data_owner_date_idx ON ad_data(owner_id, date);
