// ============================================
// 설정: 색상, 상수, 광고유형 분류 규칙
//
// 광고유형 분류를 수정하려면 classifyGfaAdType() 함수를 수정하세요.
// 색상을 바꾸려면 C 객체를 수정하세요.
// ============================================

// 색상
export const C = {
  bg: '#0c0e14', sf: '#131620', sf2: '#1a1e2c', sf3: '#232838', bd: '#282d40',
  ac: '#5b8def', ok: '#3dd9a0', no: '#f07070', warn: '#f5a445', yel: '#f0c746',
  pur: '#9d7ff0', pink: '#ed6ea0', cyan: '#45c8dc',
  tx: '#e4e7ed', txd: '#8890a6', txm: '#555c74',
};

// 탭
export const TABS = [
  { id: 'dashboard', label: '성과 보기', icon: '📊' },
  { id: 'upload',    label: '보고서 업로드', icon: '📤' },
  { id: 'mapping',   label: '매핑 관리', icon: '🔗' },
  { id: 'settings',  label: '설정', icon: '⚙️' },
];

// 기간 선택 옵션
export const RANGES = [
  { label: '1일',   value: 1 },
  { label: '7일',   value: 7 },
  { label: '14일',  value: 14 },
  { label: '30일',  value: 30 },
  { label: '90일',  value: 90 },
  { label: '365일', value: 365 },
  { label: '전체',  value: 0 },
];

// 광고유형 표시 순서 (대시보드에서 이 순서대로 표시)
export const AD_TYPE_ORDER = [
  '파워링크',
  '쇼핑검색',
  '브랜드검색',
  'GFA',
  'GFA-카탈로그',
  'GFA-쇼핑프로모션',
  'GFA-CRM',
  'GFA-논타겟',
  'GFA-리타겟',
  'GFA-스마트채널',
  'GFA-기타',
];

// 광고유형별 색상
export const AD_TYPE_COLORS = {
  '파워링크': '#5b8def',
  '쇼핑검색': '#3dd9a0',
  '브랜드검색': '#f0c746',
  'GFA': '#9d7ff0',
  'GFA-카탈로그': '#9d7ff0',
  'GFA-쇼핑프로모션': '#ed6ea0',
  'GFA-CRM': '#45c8dc',
  'GFA-논타겟': '#f5a445',
  'GFA-리타겟': '#f07070',
  'GFA-스마트채널': '#5b8def',
  'GFA-기타': '#8890a6',
};

// ─── GFA 캠페인명에서 광고유형 분류 ───
// 캠페인 이름에 포함된 키워드로 광고유형을 결정합니다.
// 새로운 캠페인 유형이 생기면 여기에 규칙을 추가하세요.
export function classifyGfaAdType(campaignName) {
  const name = (campaignName || '').toLowerCase();

  if (name.includes('논타겟'))       return 'GFA-논타겟';
  if (name.includes('리타겟'))       return 'GFA-리타겟';
  if (name.includes('스마트채널'))    return 'GFA-스마트채널';
  if (name.includes('카탈로그'))      return 'GFA-카탈로그';
  if (name.includes('쇼핑 프로모션') || name.includes('쇼핑프로모션')) return 'GFA-쇼핑프로모션';
  if (name.includes('crm'))          return 'GFA-CRM';

  return 'GFA-기타';
}

// ─── 검색광고 캠페인유형 정규화 ───
// 네이버 보고서의 캠페인유형을 내부 ad_type으로 변환
export function classifySearchAdType(campaignType) {
  const t = (campaignType || '').trim();

  if (t === '파워링크')                return '파워링크';
  if (t === '쇼핑검색')                return '쇼핑검색';
  if (t.includes('브랜드검색') || t.includes('신제품검색')) return '브랜드검색';

  return t; // 알 수 없는 유형은 그대로 반환
}

// ─── match_key 생성 규칙 ───
// 이 규칙은 파서와 매핑 양쪽에서 동일하게 사용됩니다.
// 절대로 한쪽만 수정하지 마세요.
export function makeMatchKey({ source, adType, campaignName, groupName, groupId, materialId }) {
  if (source === 'gfa') {
    // GFA: 광고그룹 ID로 매핑 (이름이 겹칠 수 있으므로)
    return `GFA||${groupId}`;
  }

  // 검색광고
  if (adType === '쇼핑검색') {
    // 쇼핑검색: 소재ID로 매핑
    return `SH||${materialId}`;
  }

  if (adType === '파워링크') {
    // 파워링크: 캠페인명+그룹명으로 매핑
    return `PL||${campaignName}||${groupName}`;
  }

  if (adType === '브랜드검색') {
    // 브랜드검색: 캠페인명+그룹명으로 매핑
    return `BR||${campaignName}||${groupName}`;
  }

  // 기타
  return `ETC||${campaignName}||${groupName}||${materialId || ''}`;
}

// match_key에서 표시용 라벨 생성
export function labelFromMatchKey(matchKey, groupName, materialId, campaignName) {
  if (!matchKey) return '-';

  if (matchKey.startsWith('GFA||')) {
    return groupName || matchKey.split('||')[1];
  }
  if (matchKey.startsWith('SH||')) {
    return materialId || matchKey.split('||')[1];
  }
  if (matchKey.startsWith('PL||') || matchKey.startsWith('BR||')) {
    return groupName || matchKey.split('||')[2];
  }

  return groupName || materialId || matchKey;
}
