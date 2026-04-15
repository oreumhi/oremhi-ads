-- ============================================
-- 주식회사 오름히 광고 대시보드 v2 - 다중 사용자 지원
-- Supabase SQL Editor에서 이 파일을 실행하세요
-- (기존 테이블은 그대로 유지됩니다)
-- ============================================

-- 1. 사용자 테이블 (관리자 + 직원)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  assigned_brands TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 공유 링크 테이블 (클라이언트용)
CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS + 정책
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON share_links FOR ALL USING (true) WITH CHECK (true);
