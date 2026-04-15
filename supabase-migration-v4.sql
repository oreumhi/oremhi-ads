-- ============================================
-- 주식회사 오름히 광고 대시보드 v4 - 완전 데이터 격리
-- Supabase SQL Editor에서 이 파일을 실행하세요
--
-- 변경: 중복 방지 기준에 owner_id 추가
-- 다른 사용자가 같은 캠페인명을 써도 데이터가 안 겹침
-- ============================================

-- 1. ad_data: 기존 중복방지 인덱스 교체
DROP INDEX IF EXISTS ad_data_dedup;
CREATE UNIQUE INDEX ad_data_dedup ON ad_data(date, match_key, owner_id);

-- 2. mappings: 기존 unique 제약 교체
ALTER TABLE mappings DROP CONSTRAINT IF EXISTS mappings_match_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS mappings_owner_dedup ON mappings(match_key, owner_id);
