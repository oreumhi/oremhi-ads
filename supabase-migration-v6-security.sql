-- ============================================
-- 주식회사 오름히 광고 대시보드 v6 - 보안 강화
-- Supabase SQL Editor에서 이 파일을 실행하세요
--
-- 목적:
--   1. owner_id가 NULL인 레거시 데이터 진단
--   2. NULL 데이터를 관리자 ID로 일괄 태깅 또는 삭제
--   3. 앞으로 owner_id NULL을 절대 허용하지 않음
-- ============================================

-- ───────────────────────────────────────────────
-- 1단계: 진단 - owner_id가 NULL인 데이터 개수 확인
-- ───────────────────────────────────────────────
-- 실행 후 결과를 확인하세요.
SELECT
  'ad_data' AS table_name,
  COUNT(*) AS null_owner_count
FROM ad_data
WHERE owner_id IS NULL
UNION ALL
SELECT
  'mappings' AS table_name,
  COUNT(*) AS null_owner_count
FROM mappings
WHERE owner_id IS NULL;


-- ───────────────────────────────────────────────
-- 2단계: 관리자 user_id 확인
-- ───────────────────────────────────────────────
-- 관리자 ID를 복사하세요 (아래 3단계에서 사용)
SELECT id, name, username, role FROM users WHERE role = 'admin';


-- ───────────────────────────────────────────────
-- 3단계: NULL owner_id 데이터를 관리자 소유로 변경
-- ───────────────────────────────────────────────
-- 위 2단계에서 확인한 관리자 ID를 아래 'PASTE_ADMIN_ID_HERE' 자리에 붙여넣고 실행
--
-- 예시: '550e8400-e29b-41d4-a716-446655440000'
--
-- UPDATE ad_data SET owner_id = 'PASTE_ADMIN_ID_HERE' WHERE owner_id IS NULL;
-- UPDATE mappings SET owner_id = 'PASTE_ADMIN_ID_HERE' WHERE owner_id IS NULL;


-- ───────────────────────────────────────────────
-- 4단계: owner_id를 NOT NULL로 강제 (앞으로 NULL 허용 안 함)
-- ───────────────────────────────────────────────
-- 3단계 실행 후 owner_id NULL 데이터가 0건일 때만 실행
--
-- ALTER TABLE ad_data ALTER COLUMN owner_id SET NOT NULL;
-- ALTER TABLE mappings ALTER COLUMN owner_id SET NOT NULL;


-- ───────────────────────────────────────────────
-- 5단계: 검증 - 사용자별 데이터 분포 확인
-- ───────────────────────────────────────────────
SELECT
  u.name,
  u.role,
  (SELECT COUNT(*) FROM ad_data WHERE owner_id = u.id) AS ad_data_count,
  (SELECT COUNT(*) FROM mappings WHERE owner_id = u.id) AS mappings_count
FROM users u
ORDER BY u.role, u.name;
