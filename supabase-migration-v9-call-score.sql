-- ============================================
-- v9: 대화 품질에 '통화 적극성' 점수 추가
-- Supabase SQL Editor에서 전체 복사 → 실행하세요
-- ============================================

-- 통화 적극성 점수 (우리가 먼저 전화/통화를 시도했는가 - 최고 배점 25)
ALTER TABLE chat_scores ADD COLUMN IF NOT EXISTS score_call INTEGER;

-- 검증
SELECT column_name FROM information_schema.columns
WHERE table_name = 'chat_scores' AND column_name = 'score_call';
