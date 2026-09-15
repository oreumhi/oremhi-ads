// ============================================
// 클로드 브리핑 생성기  (2026-09-15)
//
// 목적: 직원이 자기 담당 브랜드를 고르고 버튼 하나로
//       "클로드에게 그대로 붙여넣을 수 있는 자료"를 만든다.
//
// 왜 필요한가:
//   대표님 클로드에는 그동안의 맥락이 쌓여 있지만 직원 클로드에는 없다.
//   그래서 데이터 + 읽는 법 + 함정을 한 덩어리로 만들어 건네준다.
//
// 보안:
//   브랜드 선택지는 화면(allowedBrands)에서 이미 제한된다.
//   여기서는 넘겨받은 브랜드 하나만 조회한다. DB 열쇠는 직원에게 주지 않는다.
// ============================================

import { sb, fetchBrandRegistry } from './store';

// ─── 작은 도구들 ───
const n0 = (v) => Math.round(Number(v) || 0);
const won = (v) => n0(v).toLocaleString('ko-KR');
const rate = (a, b, d = 2) => (b ? +((a / b) * 100).toFixed(d) : 0);
const per = (a, b) => (b ? Math.round(a / b) : 0);

function emptyMetrics() {
  return { imp: 0, clk: 0, cost: 0, cv: 0, rev: 0 };
}

function addRow(o, r) {
  o.imp += Number(r.impressions) || 0;
  o.clk += Number(r.clicks) || 0;
  o.cost += Number(r.cost) || 0;
  o.cv += Number(r.conversions) || 0;
  o.rev += Number(r.conv_revenue ?? r.revenue) || 0;
  return o;
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k === null || k === undefined || k === '') continue;
    if (!m.has(k)) m.set(k, emptyMetrics());
    addRow(m.get(k), r);
  }
  return m;
}

// 표 한 줄: 비용 · 노출 · 클릭 · CTR · CPC · 전환 · CVR · 매출 · ROAS
function metricCells(o) {
  return [
    won(o.cost), won(o.imp), won(o.clk),
    rate(o.clk, o.imp) + '%', won(per(o.cost, o.clk)),
    won(o.cv), rate(o.cv, o.clk) + '%',
    won(o.rev), o.cost ? Math.round((o.rev / o.cost) * 100) + '%' : '—',
  ];
}

const METRIC_HEAD = ['광고비', '노출', '클릭', 'CTR', 'CPC', '전환', 'CVR', '매출', 'ROAS'];

function mdTable(head, rows) {
  if (!rows.length) return '(자료 없음)\n';
  const line = (cells) => '| ' + cells.join(' | ') + ' |';
  return [
    line(head),
    line(head.map(() => '---')),
    ...rows.map(line),
  ].join('\n') + '\n';
}

// 큰 것부터, 최대 limit개. 나머지는 '그 외 N개'로 접어 요약한다.
function topRows(map, limit, labelHead) {
  const all = [...map.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const shown = all.slice(0, limit);
  const rest = all.slice(limit);
  const rows = shown.map(([k, o]) => [k, ...metricCells(o)]);
  if (rest.length) {
    const sum = rest.reduce((acc, [, o]) => {
      acc.imp += o.imp; acc.clk += o.clk; acc.cost += o.cost; acc.cv += o.cv; acc.rev += o.rev;
      return acc;
    }, emptyMetrics());
    rows.push([`그 외 ${rest.length}개 합계`, ...metricCells(sum)]);
  }
  return mdTable([labelHead, ...METRIC_HEAD], rows);
}

// ─── 보조 테이블 조회 (계정 기준) ───
// report_* 테이블은 브랜드가 아니라 account(계정명) 기준으로 쌓인다.
const PAGE = 1000;

async function fetchDimByAccounts(table, accounts, from, to, extra) {
  if (!sb || !accounts.length) return [];
  const out = [];
  for (let p = 0; p < 40; p++) {
    let q = sb.from(table).select('*')
      .in('account', accounts)
      .gte('date', from).lte('date', to)
      .order('date', { ascending: true }).order('id', { ascending: true })
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) break;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ─── 본체 ───
/**
 * @param {object} p
 * @param {string} p.brand          브랜드명
 * @param {Array}  p.adData         화면이 이미 들고 있는 성과 행 (직원이면 본인 것만)
 * @param {Array}  p.mappings       match_key → 브랜드/제품/광고유형/캠페인
 * @param {string} p.from           YYYY-MM-DD
 * @param {string} p.to             YYYY-MM-DD
 * @param {string} p.viewerName     보는 사람 이름 (문서에 남겨 추적용)
 */
export async function buildBriefing({ brand, adData, mappings, from, to, viewerName }) {
  const mapByKey = new Map();
  (mappings || []).forEach((m) => mapByKey.set(m.match_key, m));

  const rows = (adData || []).filter((r) => {
    if (r.date < from || r.date > to) return false;
    const mp = mapByKey.get(r.match_key);
    return mp && mp.brand === brand;
  });

  // 계정 목록 (보조 테이블 조회용)
  let accounts = [];
  let registryNote = '';
  try {
    const reg = await fetchBrandRegistry();
    const hit = (reg.brands || []).find((b) => b.brand === brand);
    if (hit) accounts = (hit.accounts || []).map((a) => a.name).filter(Boolean);
    else registryNote = '브랜드 명부에 등록되어 있지 않아 시간대·키워드 등 보조 자료를 찾지 못했습니다.';
  } catch {
    registryNote = '브랜드 명부를 읽지 못해 보조 자료를 생략했습니다.';
  }

  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} ${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

  const P = [];
  P.push(`# ${brand} 광고 성과 자료 (클로드 전달용)`);
  P.push('');
  P.push(`- 기간: **${from} ~ ${to}**`);
  P.push(`- 생성: ${stamp}${viewerName ? ` · ${viewerName}` : ''}`);
  P.push('- 출처: 주식회사 오름히 광고 성과 대시보드 (네이버 광고 보고서 자동 수집)');
  P.push('');
  P.push('> 이 자료를 클로드에 붙여넣은 뒤 질문하세요. 아래 "읽는 법"을 먼저 지켜야 답이 맞습니다.');
  P.push('');

  // ── 읽는 법 / 함정 ──
  P.push('## 읽는 법 — 먼저 확인할 것');
  P.push('');
  P.push('1. **금액은 모두 원(₩)이고 VAT 포함 추정치입니다.** VAT 별도가 필요하면 1.1로 나누세요.');
  P.push('2. **매출·전환은 "구매완료" 기준입니다.** 해당 값이 없는 계정만 "총 전환"으로 대체됩니다.');
  P.push('3. **전환은 늦게 붙습니다.** 광고비가 0인데 전환만 있는 줄이 나오면 지연 귀속입니다. 그 줄의 ROAS는 무의미하니 판단 근거로 쓰지 마세요.');
  P.push('4. **전환 10건 미만인 항목의 ROAS는 우연일 수 있습니다.** 단정하지 말고 "표본이 적다"고 명시하세요.');
  P.push('5. **검색광고와 디스플레이(GFA)를 같은 잣대로 비교하지 마세요.** GFA는 라스트클릭 기준이라 기여가 과소 보고됩니다(오름히 자체 분석에서 2.5~4.7배 차이).');
  P.push('6. **다른 브랜드와 비교해 예산을 옮기자는 제안은 하지 마세요.** 브랜드마다 광고주가 다릅니다. 그 브랜드 안에서 올릴 방법을 찾으세요.');
  P.push('7. 실제 광고 설정 변경은 사람이 합니다. 분석과 제안까지만 하세요.');
  P.push('');

  // ── 전체 요약 ──
  const total = rows.reduce((o, r) => addRow(o, r), emptyMetrics());
  const days = new Set(rows.map((r) => r.date)).size;

  P.push('## 1. 전체 요약');
  P.push('');
  if (!rows.length) {
    P.push('이 기간에 데이터가 없습니다. 기간을 넓히거나 브랜드를 확인해 주세요.');
    P.push('');
    return P.join('\n');
  }
  P.push(mdTable(METRIC_HEAD, [metricCells(total)]));
  P.push(`- 자료가 있는 날: ${days}일`);
  P.push(`- 하루 평균 광고비: ${won(total.cost / (days || 1))}원`);
  P.push('');

  // ── 채널 / 광고유형 ──
  const byType = groupBy(rows, (r) => {
    const mp = mapByKey.get(r.match_key);
    return mp ? (mp.ad_type || '(미분류)') : null;
  });
  P.push('## 2. 광고유형별');
  P.push('');
  P.push(topRows(byType, 15, '광고유형'));
  P.push('> GFA 광고유형은 **캠페인 이름만 보고** 자동 분류됩니다. 그룹 이름은 보지 않으므로, 예를 들어 "스마트채널" 캠페인 안의 리타겟 그룹도 "GFA-스마트채널"로 잡힙니다. 유형별 표는 참고용으로만 쓰고 자세한 판단은 4번(캠페인·그룹)에서 하세요.');
  P.push('');

  // ── 일별 추이 ──
  const byDate = groupBy(rows, (r) => r.date);
  const dateRows = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  P.push('## 3. 날짜별 추이');
  P.push('');
  if (dateRows.length > 70) {
    P.push(`(${dateRows.length}일 중 최근 70일만 표시)`);
    P.push('');
  }
  P.push(mdTable(['날짜', ...METRIC_HEAD], dateRows.slice(-70).map(([d, o]) => [d, ...metricCells(o)])));
  P.push('');

  // ── 캠페인 · 그룹 ──
  const byCampaign = groupBy(rows, (r) => {
    const mp = mapByKey.get(r.match_key);
    if (!mp) return null;
    return mp.campaign_name || mp.product || '(캠페인 미상)';
  });
  const byGroup = groupBy(rows, (r) => {
    const mp = mapByKey.get(r.match_key);
    if (!mp) return null;
    const camp = mp.campaign_name || mp.product || '';
    const grp = r.group_name || mp.label || '(그룹 미상)';
    return camp ? `${camp} ▸ ${grp}` : grp;
  });
  P.push('## 4. 캠페인별');
  P.push('');
  P.push(topRows(byCampaign, 20, '캠페인'));
  P.push('## 5. 광고그룹별');
  P.push('');
  P.push(topRows(byGroup, 35, '캠페인 ▸ 그룹'));

  // ── 보조 자료 (계정 기준) ──
  if (!accounts.length) {
    P.push('## 6. 보조 자료');
    P.push('');
    P.push(registryNote || '연결된 광고 계정을 찾지 못해 보조 자료를 생략했습니다.');
    P.push('');
    P.push(footer());
    return P.join('\n');
  }

  P.push(`## 6. 키워드별 (파워링크)`);
  P.push('');
  try {
    const kw = await fetchDimByAccounts('report_keyword', accounts, from, to);
    if (!kw.length) {
      P.push('이 기간 키워드 자료가 없습니다. (쇼핑검색 전용 계정이거나 수집 전 기간)');
    } else {
      const byKw = groupBy(kw, (r) => r.keyword);
      const all = [...byKw.entries()].sort((a, b) => b[1].cost - a[1].cost);
      P.push(`총 ${all.length}개 키워드 중 광고비 상위 30개입니다.`);
      P.push('');
      P.push(mdTable(['키워드', ...METRIC_HEAD], all.slice(0, 30).map(([k, o]) => [k, ...metricCells(o)])));
      const waste = all.filter(([, o]) => o.cost >= 30000 && o.rev / o.cost < 1)
        .sort((a, b) => b[1].cost - a[1].cost).slice(0, 15);
      if (waste.length) {
        P.push('**광고비 3만원 이상인데 매출이 광고비보다 적은 키워드**');
        P.push('');
        P.push(mdTable(['키워드', ...METRIC_HEAD], waste.map(([k, o]) => [k, ...metricCells(o)])));
      }
    }
  } catch (e) {
    P.push(`키워드 자료를 불러오지 못했습니다: ${String(e).slice(0, 80)}`);
  }
  P.push('');

  P.push('## 7. 기기 · 매체별');
  P.push('');
  try {
    const md = await fetchDimByAccounts('report_media', accounts, from, to);
    if (!md.length) P.push('이 기간 자료가 없습니다.');
    else {
      P.push(topRows(groupBy(md, (r) => `${r.device || '기기미상'} / ${r.media || '매체미상'}`), 10, '기기 / 매체'));
      P.push(topRows(groupBy(md, (r) => r.adgroup), 20, '광고그룹(매체보고서)'));
    }
  } catch (e) {
    P.push(`기기·매체 자료를 불러오지 못했습니다: ${String(e).slice(0, 80)}`);
  }
  P.push('');

  P.push('## 8. 시간대별');
  P.push('');
  try {
    // ★ 한 날짜만 쓴다. 날짜끼리 더하면 안 되는 자료다(아래 설명).
    const hr = await fetchDimByAccounts('report_hour', accounts, from, to);
    if (!hr.length) {
      P.push('이 기간 시간대 자료가 없습니다.');
    } else {
      const latest = hr.reduce((m, r) => (r.date > m ? r.date : m), hr[0].date);
      const snap = hr.filter((r) => r.date === latest);
      const byHour = groupBy(snap, (r) => String(r.hour_num).padStart(2, '0') + '시');
      const snapTotal = snap.reduce((o, r) => addRow(o, r), emptyMetrics());
      const ordered = [...byHour.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      P.push(`기준 스냅샷: **${latest}**`);
      P.push('');
      P.push(mdTable(['시간', '광고비', '비중', '클릭', 'CPC', '전환', 'CVR', 'ROAS'],
        ordered.map(([h, o]) => [
          h, won(o.cost), rate(o.cost, snapTotal.cost, 1) + '%', won(o.clk),
          won(per(o.cost, o.clk)), won(o.cv), rate(o.cv, o.clk) + '%',
          o.cost ? Math.round((o.rev / o.cost) * 100) + '%' : '—',
        ])));
      P.push(`전체 평균 ROAS: ${snapTotal.cost ? Math.round((snapTotal.rev / snapTotal.cost) * 100) : 0}%`);
      P.push('');
      P.push('> **시간대 자료 주의 (꼭 읽을 것)**');
      P.push('> - 여기 실린 것은 **날짜 하나짜리 스냅샷**입니다. 여러 날짜를 더하면 안 됩니다.');
      P.push('> - 2026-07-16 ~ 09-14 사이에 쌓인 시간대 행은 하루치가 아니라 **그 날짜부터 7일간의 누계**입니다(수집 설정 문제, 2026-09-15 수리). 그래서 비중·CPC·CVR·ROAS 같은 **비율로만** 비교하고 절대 금액은 다른 표를 보세요.');
      P.push('> - 심야·새벽은 광고비가 거의 없는데 전환만 붙어 ROAS가 수천 %로 나오는 일이 흔합니다. 지연 귀속이니 근거로 쓰지 마세요.');
    }
  } catch (e) {
    P.push(`시간대 자료를 불러오지 못했습니다: ${String(e).slice(0, 80)}`);
  }
  P.push('');

  P.push('## 9. 성별 · 연령 · 지역');
  P.push('');
  try {
    const dm = await fetchDimByAccounts('report_demo', accounts, from, to);
    if (!dm.length) {
      P.push('이 기간 자료가 없습니다. (성별·연령·지역 수집은 2026-07-21 이후 멈춰 있었고 2026-09-15에 수리했습니다. 그 사이 기간은 자료가 없습니다.)');
    } else {
      for (const [dim, title] of [['gender', '성별'], ['age', '연령대'], ['region', '지역']]) {
        const part = dm.filter((r) => r.dim === dim);
        if (!part.length) continue;
        P.push(`**${title}**`);
        P.push('');
        P.push(topRows(groupBy(part, (r) => r.label), 20, title));
      }
    }
  } catch (e) {
    P.push(`성별·연령·지역 자료를 불러오지 못했습니다: ${String(e).slice(0, 80)}`);
  }
  P.push('');
  P.push(footer());

  return P.join('\n');
}

function footer() {
  return [
    '---',
    '',
    '## 이렇게 물어보세요',
    '',
    '- "이 브랜드에서 지금 제일 문제인 시간대가 어디야? 근거까지 알려줘"',
    '- "광고비를 많이 쓰는데 성과가 나쁜 광고그룹 5개만 짚어줘"',
    '- "낭비되는 키워드 정리하려는데 어디부터 손대면 좋을까"',
    '- "지난주 대비 나빠진 게 뭐야? 원인 가설까지"',
    '- "이 자료로 광고주에게 보낼 보고 초안을 써줘"',
    '',
    '답할 때는 위 "읽는 법" 7가지를 지켜 주세요. 자료에 없는 값은 지어내지 말고 "이 자료엔 없다"고 해주세요.',
  ].join('\n');
}
