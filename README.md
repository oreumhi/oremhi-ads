# 주식회사 오름히 - 광고 성과 대시보드

네이버 검색광고 + GFA 보고서를 올리면
모든 브랜드·제품·광고를 한 화면에서 볼 수 있는 대시보드입니다.

## 주요 기능

- 모든 브랜드/제품/광고 한 화면에 펼쳐보기 (클릭/필터 없음)
- 기간 선택: 1일 / 7일 / 14일 / 30일 / 90일 / 365일 / 전체
- 각 광고별 추이 스파크라인 그래프
- 광고유형별 소계 + 제품별 합계 자동 계산
- 매핑 테이블: 광고그룹/소재를 브랜드·제품에 연결 (1회 설정)
- CSV 그대로 업로드 (가공 불필요)
- 중복 업로드 자동 처리

## 매핑 방식

| 광고유형 | 매핑 기준 |
|---------|----------|
| 파워링크 | 캠페인명 + 광고그룹명 |
| 쇼핑검색 | 소재ID |
| 브랜드검색 | 캠페인명 + 광고그룹명 |
| GFA | 광고그룹 ID (이름이 겹칠 수 있으므로) |

## 사용법

1. **보고서 업로드**: 네이버에서 다운받은 CSV를 그대로 올리기
2. **매핑 관리**: 미매핑 항목을 브랜드·제품에 연결 (처음 1회)
3. **성과 보기**: 한 화면에서 전체 현황 확인

## 배포 방법 (회계 앱과 동일)

1. **GitHub**: 새 저장소 `oremhi-ads` 만들기 → 파일 업로드
2. **Supabase**: 새 프로젝트 → `supabase-setup.sql` 실행
3. **Vercel**: GitHub 연결 → 환경변수 설정 → Deploy

환경변수:
- `VITE_SUPABASE_URL` = Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = Supabase anon public 키

## 코드 구조

```
src/
├── config.js       # 색상, 광고유형 분류 규칙, match_key 규칙
├── utils.js        # 숫자 포맷, 날짜, 지표 계산
├── parsers.js      # CSV 파싱 (검색광고 + GFA)
├── store.js        # 데이터 저장/조회 (Supabase + localStorage)
├── App.jsx         # 메인 앱
├── components/
│   ├── Layout.jsx  # 사이드바 + 반응형
│   └── Sparkline.jsx  # 추이 그래프
└── pages/
    ├── Dashboard.jsx  # 전체 펼쳐보기
    ├── Upload.jsx     # CSV 업로드
    ├── Mapping.jsx    # 매핑 관리
    └── Settings.jsx   # 설정
```

## 수정 가이드

- GFA 캠페인 유형 추가: `src/config.js` → `classifyGfaAdType()` 수정
- 카테고리/색상 변경: `src/config.js` → `AD_TYPE_COLORS` 수정
- 새 지표 추가: `src/parsers.js` 파서 수정 + `src/pages/Dashboard.jsx` 표 수정
