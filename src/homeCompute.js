// ============================================
// 홈 화면 계산 — 화면 코드와 분리한 순수 함수 (2026-09-28)
//
//   '지난 날짜 보기'를 위해 홈의 계산을 기준일(asOf)을 받는 함수로 옮겼습니다.
//     asOf  = 그 화면의 '오늘'
//     성과일 = asOf - 1  (홈 맨 위 '어제 ○/○ 성과'의 날짜)
//
//   ★ 평소 홈(asOf = 오늘, past = false)은 예전 Home.jsx 코드와 결과가 한 글자도
//     다르지 않도록 옮겼습니다. 바뀐 것은 '오늘' 자리에 asOf를 넣은 것뿐입니다.
//     (검증: 같은 자료로 예전 코드와 새 코드를 돌려 결과 전체를 대조)
//
//   past = true(지난 날짜)일 때만 달라지는 것
//     · 문구의 '오늘/어제'를 실제 날짜(9/21 등)로 표기
//     · 성과 경고: 그날 열려 있던 것만 (지금은 '해결'됐어도 그날엔 떠 있었으면 포함)
//     · 대화 점수·순위: 그날 이후에 생긴 기록은 빼고 계산 (조회 단계에서 한 번,
//       여기서 한 번 더 걸러 이중으로 막습니다)
//
//   이 파일은 React·서버 연결 없이 계산만 합니다 → 실제 자료로 따로 돌려 검증할 수 있습니다.
// ============================================

import { fmtNum } from './utils';

export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
export const won = (n) => '₩' + fmtNum(Math.round(n || 0));
export const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const dayLabel = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`; };
export const mdLabel = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };
export const norm = (s) => (s || '').toLowerCase().replace(/[\s()\-_.·,/&+]/g, '').replace(/숍/g, '솝');
export const nMatch = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };
export const timeAgo = (iso) => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
};
export const hhmm = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export const sumM = (rows) => rows.reduce((a, r) => ({
  imp: a.imp + (+r.impressions || 0), cost: a.cost + (+r.cost || 0),
  conv: a.conv + (+r.conversions || 0), rev: a.rev + (+(r.revenue ?? r.conv_revenue) || 0),
}), { imp: 0, cost: 0, conv: 0, rev: 0 });
export const roasOf = (m) => (m.cost > 0 ? m.rev / m.cost * 100 : 0);

// 광고 데이터(ad_daily) 수집 시작일 — 이보다 앞 날짜는 고를 수 없게 막습니다 (DB 확인 2026-09-28)
export const MIN_DATE = '2025-01-01';

// 기준일(asOf) 하루가 끝나는 순간 = 다음날 0시(한국시간) = asOf 15:00 UTC
//   순위 수집 시각(collected_at)은 UTC로 저장돼 있어 한국시간 경계를 UTC로 바꿔 씁니다.
export const endOfDayKstISO = (asOf) => `${asOf}T15:00:00Z`;

// 지난 날짜: 그날 열려 있던 성과 경고인가
//   · 지금도 '확인 필요' → 그날도 열려 있었음
//   · 지금은 '해결'이라도, 해결한 시각이 그날 0시(한국시간) 이후면 그날엔 떠 있었음
export function perfOpenOn(p, asOf) {
  if (!p) return false;
  if (p.status === 'needs_check') return true;
  if (p.status === 'resolved' && p.resolved_at) {
    const r = Date.parse(p.resolved_at), start = Date.parse(`${asOf}T00:00:00+09:00`);
    return Number.isFinite(r) && r >= start;
  }
  return false;
}

// ─────────────────────────────────────────────
// ① 맨 위 성과 카드 (성과일 vs 그 전날)
// ─────────────────────────────────────────────
export function computeHero(ad, allowedBrands, asOf) {
  const y1 = addDays(asOf, -1), y2 = addDays(asOf, -2);
  const inB = (b) => !allowedBrands || allowedBrands.includes(b);
  const m1 = sumM(ad.filter(r => r.date === y1 && inB(r.brand)));
  const m2 = sumM(ad.filter(r => r.date === y2 && inB(r.brand)));
  const n1 = ad.filter(r => r.date === y1 && inB(r.brand)).length;   // 그날 기록 행 수 (0이면 '기록 없음')
  return { y1, y2, m1, m2, r1: roasOf(m1), r2: roasOf(m2), n1 };
}

// ─────────────────────────────────────────────
// ② 챙길 것 + ③ 광고주 신호등
//   D: { ad, perfAlerts, chatScores, reviewsToday, storeMap, rankHist, radar, promises, targets, lyAd }
// ─────────────────────────────────────────────
export function computeBoard(D, { asOf, allowedBrands, past = false }) {
  const t = asOf;
  const inB = (b) => !allowedBrands || !b || allowedBrands.some(ab => nMatch(ab, b));
  // 문구: 평소엔 '오늘/어제', 지난 날짜엔 실제 날짜
  const W = past ? { today: mdLabel(t), yday: mdLabel(addDays(t, -1)) } : { today: '오늘', yday: '어제' };

  const y1 = addDays(t, -1);
  const rS = addDays(t, -7), pS = addDays(t, -14), pE = addDays(t, -8), l2 = addDays(t, -2);

  const byBrand = {};
  D.ad.forEach(r => {
    if (allowedBrands && !allowedBrands.includes(r.brand)) return;
    const b = (byBrand[r.brand] = byBrand[r.brand] || { recent: [], prev: [], yday: [], r2imp: 0 });
    if (r.date >= rS && r.date <= y1) b.recent.push(r);
    if (r.date >= pS && r.date <= pE) b.prev.push(r);
    if (r.date === y1) b.yday.push(r);
    if (r.date >= l2 && r.date <= y1) b.r2imp += (+r.impressions || 0);
  });

  // 최신 대화 점수 (광고주별)
  //   지난 날짜: 그날 아침까지 나온 점수만 (점수는 대화 마지막 날 다음날 새벽에 만들어짐)
  const latestScore = {};
  D.chatScores.forEach(s => {
    if (past && s.period_end && s.period_end > y1) return;
    const k = s.client_name;
    if (!latestScore[k] || (s.period_end || '') > (latestScore[k].period_end || '')) latestScore[k] = s;
  });
  // 오늘 후기 (매장→브랜드 매핑)
  const storeBrand = {}; D.storeMap.forEach(m => { storeBrand[m.store] = m.brand || m.store; });
  // 순위: 제품별 최신 + 전일
  //   지난 날짜: 그날 24시(한국시간) 이후 수집분은 제외
  const rankUntil = past ? Date.parse(endOfDayKstISO(t)) : null;
  const rankByProduct = {};
  D.rankHist.forEach(h => {
    if ((h.product || '').includes('예시')) return;   // [예시] 테스트 상품은 알림·신호등에서 제외
    if (rankUntil != null && !(Date.parse(h.collected_at) < rankUntil)) return;
    const k = `${h.brand}·${h.product || ''}·${h.keyword}·${h.ad_type || ''}`;
    const day = (h.collected_at || '').slice(0, 10);
    const e = (rankByProduct[k] = rankByProduct[k] || { brand: h.brand, keyword: h.keyword, product: h.product, days: {} });
    if (!(day in e.days)) e.days[day] = h.rank;   // 최신순 정렬 → 첫 값 유지
  });

  const todos = [];
  const rows = [];

  // 저장된 성과 경고를 '현재 데이터'로 재검증 (며칠 전 만들어진 경고가 상황이 바뀌었는데도 뜨는 것 방지)
  const liveByBrand = {};
  Object.entries(byBrand).forEach(([b, d]) => {
    const rec = sumM(d.recent), prev = sumM(d.prev);
    liveByBrand[b] = { rCost: rec.cost, pCost: prev.cost, rRev: rec.rev, pRev: prev.rev, rRoas: roasOf(rec), pRoas: roasOf(prev) };
  });
  const perfStillValid = (p) => {
    const lv = liveByBrand[p.brand];
    if (!lv) return false;   // 현재 데이터로 확인 안 되면 표시하지 않음 (오탐 방지 우선)
    const title = p.title || '';
    if (title.includes('예산') || title.includes('광고비 급감')) {
      // 실제로 지금도 광고비가 30% 이상 줄어 있을 때만 유효
      return lv.pCost > 0 && lv.rCost < lv.pCost * 0.70;
    }
    if (title.includes('매출')) {
      return lv.pRev > 0 && lv.rRev < lv.pRev * 0.85;
    }
    if (title.includes('ROAS')) {
      return lv.pRoas > 0 && lv.rRoas < lv.pRoas * 0.85;
    }
    if (title.includes('노출') || title.includes('중단')) {
      return lv.pCost > 0 && lv.rCost < lv.pCost * 0.5;
    }
    return true;
  };

  // 성과 경고 이벤트: 최근 7일 것 + 현재도 유효한 것만, 브랜드당 최신 1건
  //   지난 날짜: 그날 열려 있었고, 그날 아침까지 만들어진 것(성과일 이하)만
  const recentPerf = [];
  const seenPerfBrand = new Set();
  D.perfAlerts.filter(p => inB(p.brand) && (p.event_date || '') >= addDays(t, -7)
    && (!past || (perfOpenOn(p, t) && (p.event_date || '') <= y1))
    && perfStillValid(p)).forEach(p => {
    if (seenPerfBrand.has(p.brand)) return;
    seenPerfBrand.add(p.brand);
    recentPerf.push(p);
  });

  // 브랜드 목표 (담당자 기재 — 설정의 '브랜드 목표 관리')
  const targetBy = {};
  (D.targets || []).forEach(x => { targetBy[x.brand] = x; });
  // 작년 동기 7일 브랜드별 합계 (YOY 자동)
  const lyBy = {};
  const lyS = addDays(t, -372), lyE = addDays(t, -366);
  (D.lyAd || []).forEach(r => {
    if (r.date < lyS || r.date > lyE) return;
    const e = (lyBy[r.brand] = lyBy[r.brand] || { cost: 0, rev: 0 });
    e.cost += +r.cost || 0; e.rev += +(r.revenue ?? r.conv_revenue) || 0;
  });

  Object.entries(byBrand).forEach(([brand, d]) => {
    const rec = sumM(d.recent), prev = sumM(d.prev), yd = sumM(d.yday);
    const rRoas = roasOf(rec), pRoas = roasOf(prev);
    const tg = targetBy[brand];
    let perf = { s: rec.cost > 1000 ? 'green' : 'gray', t: rec.cost > 1000 ? '최근 7일 정상 집행' : '최근 집행 없음' };
    if (rec.cost > 1000 || prev.cost > 1000) {
      const prevDailyImp = prev.imp / 7;
      if (prevDailyImp > 500 && d.r2imp < prevDailyImp * 0.2) {
        perf = { s: 'red', t: '노출 급감 — 광고 중단 의심' };
        if (!seenPerfBrand.has(brand)) todos.push({ sev: 'high', brand, title: '노출 급감 — 광고 중단 의심', desc: '최근 노출이 이전 평균의 20% 미만', tab: 'diagnosis' });
      } else if (tg && +tg.target_roas > 0 && rec.cost > 30000) {
        // 목표가 있으면 목표 기준으로 판단 (담당자가 정한 기준이 우선)
        const rate = rRoas / +tg.target_roas * 100;
        if (rate < 70) {
          perf = { s: 'red', t: `목표 ROAS ${fmtNum(+tg.target_roas)}% 대비 ${Math.round(rate)}% 달성 — 크게 미달` };
          todos.push({ sev: 'high', brand, title: '목표 ROAS 크게 미달', desc: `목표 ${fmtNum(+tg.target_roas)}% · 최근7일 ${Math.round(rRoas)}% (달성 ${Math.round(rate)}%)`, tab: 'diagnosis' });
        } else if (rate < 90) {
          perf = { s: 'yellow', t: `목표 ROAS 대비 ${Math.round(rate)}% 달성 — 미달` };
          todos.push({ sev: 'mid', brand, title: '목표 ROAS 미달', desc: `목표 ${fmtNum(+tg.target_roas)}% · 최근7일 ${Math.round(rRoas)}%`, tab: 'diagnosis' });
        } else {
          perf = { s: 'green', t: `목표 ROAS 대비 ${Math.round(rate)}% 달성` };
        }
      } else if (pRoas > 50 && rec.cost > 30000 && rRoas < pRoas * 0.7) {
        // 목표 미기재 브랜드는 기존처럼 자기 과거 대비로 판단
        const stillGood = rRoas >= 400;
        perf = { s: stillGood ? 'yellow' : 'red', t: `ROAS 하락 ${Math.round(pRoas)}%→${Math.round(rRoas)}%` };
        if (!seenPerfBrand.has(brand)) todos.push({ sev: stillGood ? 'mid' : 'high', brand, title: 'ROAS 하락', desc: `${Math.round(pRoas)}% → ${Math.round(rRoas)}%`, tab: 'diagnosis' });
      } else if (pRoas > 50 && rRoas < pRoas * 0.85) {
        perf = { s: 'yellow', t: `ROAS 완만한 하락 (${Math.round(rRoas)}%)` };
      }
    }
    // 1일 예산 대비 성과일 집행 점검 (목표 기재 시)
    if (tg && +tg.daily_budget > 0 && yd.cost >= 0) {
      const b = +tg.daily_budget;
      if (yd.cost > b * 1.2) {
        todos.push({ sev: 'high', brand, title: '1일 예산 초과', desc: `예산 ${won(b)} · ${W.yday} 집행 ${won(yd.cost)} (${Math.round(yd.cost / b * 100)}%)`, tab: 'diagnosis' });
      } else if (yd.cost < b * 0.3 && d.yday.length > 0) {
        todos.push({ sev: 'high', brand, title: '예산 대비 집행 급감 — 광고 축소·중단 의심', desc: `예산 ${won(b)} · ${W.yday} 집행 ${won(yd.cost)} (${Math.round(yd.cost / b * 100)}%)`, tab: 'diagnosis' });
      } else if (yd.cost < b * 0.3 && d.yday.length === 0 && rec.cost > 1000) {
        todos.push({ sev: 'high', brand, title: `${W.yday} 집행 기록 없음`, desc: `1일 예산 ${won(b)}인데 ${W.yday} 데이터가 없습니다`, tab: 'diagnosis' });
      }
    }
    // 대화 신호
    //   지난 날짜에선 '연결된 방이 없다'가 아니라 '그때까지 점수가 없었다'일 수 있어 문구를 달리함
    let chat = { s: 'gray', t: past ? `${W.yday}까지 대화 점수 기록 없음` : '연결된 대화방 없음' };
    const sc = Object.entries(latestScore).find(([cn]) => nMatch(cn, brand));
    if (sc) {
      const total = +sc[1].score_total || 0;
      const silent = sc[1].period_end ? Math.floor((new Date(t) - new Date(sc[1].period_end)) / 86400000) : 0;
      if (silent >= 14) chat = { s: 'red', t: `${silent}일째 대화 없음 (침묵)` };
      else chat = total >= 60 ? { s: 'green', t: `소통 점수 ${total}점 (양호)` } : total >= 40 ? { s: 'yellow', t: `소통 점수 ${total}점 (보통)` } : { s: 'red', t: `소통 점수 ${total}점 (개선 필요)` };
    }
    // 후기 신호
    let review = { s: 'gray', t: `${W.today} 점검 결과 없음` };
    const myChecks = D.reviewsToday.filter(c => nMatch(storeBrand[c.store] || c.store, brand));
    if (myChecks.length) {
      const low = myChecks.reduce((a, c) => a + (+c.low_count || 0), 0);
      review = low > 0 ? { s: 'red', t: `${W.today} 저평점 후기 ${low}건` } : { s: 'green', t: `${W.today} 점검 완료 — 저평점 없음` };
    }
    // 순위 신호
    //   지난 날짜에선 순위 체크를 시작하기 전일 수 있어 '그때 기록 없음'으로 표기
    let rank = { s: 'gray', t: past ? `${W.today}까지 3일간 순위 수집 기록 없음` : '등록된 순위 상품 없음' };
    const myRanks = Object.values(rankByProduct).filter(e => e.brand === brand);
    if (myRanks.length) {
      let miss = 0, drop = 0, okc = 0;
      myRanks.forEach(e => {
        const ds = Object.keys(e.days).sort().reverse();
        const cur = e.days[ds[0]], prv = ds[1] != null ? e.days[ds[1]] : undefined;
        if (cur == null) miss++;
        else { okc++; if (prv != null && cur - prv >= 5) drop++; }
      });
      rank = miss > 0 ? { s: 'red', t: `미노출 ${miss}건 / ${myRanks.length}개 키워드` }
        : drop > 0 ? { s: 'yellow', t: `순위 급락 ${drop}건` }
        : { s: 'green', t: `${okc}개 키워드 정상 노출` };
    }
    // 목표 달성률(최근 7일 ROAS ÷ 목표 ROAS) + YOY(작년 동기 7일 실데이터 자동 비교)
    let goal = null;
    if (tg && +tg.target_roas > 0 && rec.cost > 1000) {
      goal = { rate: Math.round(rRoas / +tg.target_roas * 100), target: +tg.target_roas };
    }
    const ly = lyBy[brand];
    if (ly && ly.cost > 1000 && rec.cost > 1000) {
      const lyRoas = ly.rev / ly.cost * 100;
      goal = goal || { rate: null, target: null };
      goal.yoyDiff = Math.round(rRoas - lyRoas);
    }
    rows.push({ brand, cost: yd.cost, rev: yd.rev, roas: roasOf(yd), perf, chat, review, rank, goal });
  });
  rows.sort((a, b) => b.cost - a.cost || a.brand.localeCompare(b.brand));

  // ── 챙길 것 나머지 ──
  recentPerf.forEach(p => {
    let title = p.title || '성과 경고';
    if (p.brand && title.startsWith(p.brand)) title = title.slice(p.brand.length).trim();
    todos.push({ sev: 'high', brand: p.brand, title, desc: p.memo || '', tab: 'diagnosis' });
  });
  // 후기 저평점: 브랜드(매장) 단위로 묶어 1건씩만
  const lowByBrand = {};
  D.reviewsToday.forEach(c => {
    if (!(+c.low_count > 0)) return;
    const brand = storeBrand[c.store] || c.store;
    if (!inB(brand)) return;
    lowByBrand[brand] = (lowByBrand[brand] || 0) + (+c.low_count);
  });
  Object.entries(lowByBrand).forEach(([brand, low]) => {
    todos.push({ sev: 'high', brand, title: `저평점 후기 ${low}건`, desc: '내용 확인 후 대응이 필요합니다', tab: 'reviews' });
  });
  // 순위 미노출·급락: 브랜드 단위로 묶기
  const missByBrand = {}, dropByBrand = {};
  Object.values(rankByProduct).forEach(e => {
    if (!inB(e.brand)) return;
    const ds = Object.keys(e.days).sort().reverse();
    const cur = e.days[ds[0]], prv = ds[1] != null ? e.days[ds[1]] : undefined;
    if (cur == null && ds[0] >= addDays(t, -1)) {
      (missByBrand[e.brand] = missByBrand[e.brand] || []).push(e.keyword);
    } else if (cur != null && prv != null && cur - prv >= 5) {
      (dropByBrand[e.brand] = dropByBrand[e.brand] || []).push(`'${e.keyword}' ${prv}→${cur}위`);
    }
  });
  Object.entries(missByBrand).forEach(([brand, kws]) => {
    todos.push({ sev: 'high', brand, title: `순위 미노출 ${kws.length}건`, desc: kws.slice(0, 3).map(k => `'${k}'`).join(', ') + (kws.length > 3 ? ` 외 ${kws.length - 3}건` : ''), tab: 'rank' });
  });
  Object.entries(dropByBrand).forEach(([brand, ds2]) => {
    todos.push({ sev: 'mid', brand, title: `순위 급락 ${ds2.length}건`, desc: ds2.slice(0, 2).join(', ') + (ds2.length > 2 ? ' 외' : ''), tab: 'rank' });
  });
  D.radar.filter(a => inB(a.brand)).forEach(a => {
    todos.push({ sev: 'mid', brand: a.brand, title: `경쟁사 ${a.kind}`, desc: `[${a.keyword}] ${(a.title || '').slice(0, 24)} — ${a.detail || ''}` });
  });
  Object.entries(latestScore).forEach(([cn, s]) => {
    if (allowedBrands && !allowedBrands.some(b => nMatch(b, cn))) return;
    const silent = s.period_end ? Math.floor((new Date(t) - new Date(s.period_end)) / 86400000) : 0;
    if (silent >= 14) todos.push({ sev: 'mid', brand: cn, title: `${silent}일째 대화 없음`, desc: '먼저 연락해 보세요', tab: 'chat' });
  });
  D.promises.filter(p => inB(p.brand)).forEach(p => {
    todos.push({ sev: 'info', brand: p.brand || p.staff_name, title: `${W.today} 약속`, desc: p.title || p.memo || '', tab: 'team' });
  });
  const sevOrder = { high: 0, mid: 1, info: 2 };
  todos.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]);

  return { rows, todos };
}

// ─────────────────────────────────────────────
// ④ 자동화 가동 상태 — 항상 '지금' 기준 (지난 날짜 보기와 무관)
// ─────────────────────────────────────────────
export function computeJobs(D, t) {
  const hbOf = (n) => D.hb.find(h => h.name === n);
  const hbJob = (name, sched) => {
    const h = hbOf(name);
    if (!h) return { name, sched, status: 'none', when: '', note: '오늘 밤부터 기록됩니다' };
    const isToday = (h.ran_at || '').slice(0, 10) === t || new Date(h.ran_at).toDateString() === new Date().toDateString();
    return { name, sched, status: h.ok === false ? 'fail' : isToday ? 'ok' : 'none', when: isToday ? hhmm(h.ran_at) : timeAgo(h.ran_at), note: h.note || '' };
  };
  const y1d = addDays(t, -1);
  const dataJob = (name, sched, ok, when, note) => ({ name, sched, status: ok ? 'ok' : 'none', when: ok ? when : '', note });
  const revCnt = D.reviewsToday.length;
  const rankToday = D.rankHist.filter(h => (h.collected_at || '').slice(0, 10) === t).length;
  const chatToday = D.chatUploads.filter(u => new Date(u.created_at).toDateString() === new Date().toDateString()).length;
  const reportOk = D.ad.some(r => r.date === y1d);
  return [
    hbJob('레이더', '01:00'),
    hbJob('정리백업', '02:20'),
    hbJob('새벽준비', '02:53'),
    dataJob('후기체크', '03:00', revCnt > 0, '', revCnt > 0 ? `오늘 ${revCnt}개 상품 점검` : '오늘 점검 기록 없음'),
    dataJob('순위체크', '03:40', rankToday > 0, '', rankToday > 0 ? `오늘 ${rankToday}건 수집` : '오늘 수집 기록 없음'),
    dataJob('보고서 수집·집계', '04시대', reportOk, '', reportOk ? '어제 데이터 반영 완료' : '어제 데이터 미반영'),
    dataJob('대화 수집·분석', '새벽', chatToday > 0, '', chatToday > 0 ? `오늘 ${chatToday}개 방 수집` : '오늘 수집 기록 없음'),
    // 업무보고 카톡 전송 — 실패하면 여기 불이 빨갛게 바뀝니다 (공지사항에는 올리지 않습니다)
    hbJob('업무보고(2시간)', '10~22시'),
  ];
}
