// ============================================
// 유틸리티 함수
// ============================================

// 숫자 포맷 (1,234,567)
export const fmt = n => {
  if (!n && n !== 0) return '0';
  return Number(n).toLocaleString('ko-KR');
};

// 금액 포맷: 1,234,567원 (쉼표 + 원)
export const fmtWon = n => {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('ko-KR') + '원';
};

// 숫자 포맷: 1,234,567 (쉼표만)
export const fmtNum = n => {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('ko-KR');
};

// 오늘 날짜
export const today = () => new Date().toISOString().slice(0, 10);

// ID 생성
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ─── 네이버 날짜 형식 파싱 ───
// "2026.04.07." → "2026-04-07"
export function parseNaverDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/\./g, '-').replace(/-$/, '').trim();
  // "2026-04-07" 형태 확인
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  // 다른 형태 시도
  const match = dateStr.match(/(\d{4})\D*(\d{2})\D*(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return null;
}

// ─── 기간 필터 ───
// rangeDays: 0이면 전체, 양수면 최근 N일
export function filterByRange(items, rangeDays, dateField = 'date') {
  if (!rangeDays || rangeDays <= 0) return items;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return items.filter(item => item[dateField] >= cutoffStr);
}

// ─── 일별 데이터 집계 ───
// items 배열을 날짜별로 그룹핑하고 지표 합산
export function aggregateByDate(items) {
  const byDate = {};

  items.forEach(item => {
    const d = item.date;
    if (!d) return;

    if (!byDate[d]) {
      byDate[d] = { date: d, impressions: 0, clicks: 0, cost: 0, conversions: 0, conv_revenue: 0 };
    }
    byDate[d].impressions += Number(item.impressions) || 0;
    byDate[d].clicks += Number(item.clicks) || 0;
    byDate[d].cost += Number(item.cost) || 0;
    byDate[d].conversions += Number(item.conversions) || 0;
    byDate[d].conv_revenue += Number(item.conv_revenue) || 0;
  });

  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── 합계 계산 ───
export function sumMetrics(items) {
  return items.reduce(
    (acc, item) => ({
      impressions: acc.impressions + (Number(item.impressions) || 0),
      clicks: acc.clicks + (Number(item.clicks) || 0),
      cost: acc.cost + (Number(item.cost) || 0),
      conversions: acc.conversions + (Number(item.conversions) || 0),
      conv_revenue: acc.conv_revenue + (Number(item.conv_revenue) || 0),
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conv_revenue: 0 }
  );
}

// CTR 계산
export const calcCtr = (clicks, impressions) =>
  impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0';

// CPA 계산
export const calcCpa = (cost, conversions) =>
  conversions > 0 ? Math.round(cost / conversions) : 0;

// ROAS 계산
export const calcRoas = (revenue, cost) =>
  cost > 0 ? ((revenue / cost) * 100).toFixed(0) : '0';

// ─── 비밀번호 해싱 ───
export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'oremhi_ads_salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
