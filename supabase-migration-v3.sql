-- ============================================
-- 주식회사 오름히 광고 대시보드 v3 - 데이터 격리
-- Supabase SQL Editor에서 이 파일을 실행하세요
-- 
-- 변경: ad_data와 mappings에 owner_id 추가
-- 각 직원은 자기 데이터만 볼 수 있게 됩니다.
-- ============================================

-- 1. ad_data에 owner_id 컬럼 추가
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS owner_id TEXT;

-- 2. mappings에 owner_id 컬럼 추가
ALTER TABLE mappings ADD COLUMN IF NOT EXISTS owner_id TEXT;
