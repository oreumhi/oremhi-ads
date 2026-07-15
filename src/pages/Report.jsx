// ============================================
// 광고주 리포트 (일 · 주 · 월) v2
//   핵심지표 · 총평 · 기간 상세비교(전 지표) · 일자별 추이 · 요일별 · 광고유형별 · 상위광고 · 코멘트
//   광고주에게 보내는 밝은/인쇄용 리포트.
// ============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchAdDataForReport, fetchMappingsAll } from '../store';
import { fmtWon, fmtNum } from '../utils';

const R = {
  ink: '#1b2536', sub: '#6b7688', line: '#e6e9ef', soft: '#f5f7fb',
  ac: '#3a6ff0', ok: '#12b886', no: '#f0455a', warn: '#f59f3b', pink: '#e64980', pur: '#7b61ff',
};
const won = (n) => '₩' + fmtNum(Math.round(n || 0));
const num = (n) => fmtNum(Math.round(n || 0));

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const kdate = (s) => s ? s.replace(/-/g, '.').slice(2) : '';

const sumM = (rows) => rows.reduce((a, r) => ({
  impressions: a.impressions + (+r.impressions || 0), clicks: a.clicks + (+r.clicks || 0),
  cost: a.cost + (+r.cost || 0), conversions: a.conversions + (+r.conversions || 0),
  revenue: a.revenue + (+r.conv_revenue || 0),
}), { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 });
const ctrOf = (m) => m.impressions > 0 ? m.clicks / m.impressions * 100 : 0;
const cpcOf = (m) => m.clicks > 0 ? m.cost / m.clicks : 0;
const cvrOf = (m) => m.clicks > 0 ? m.conversions / m.clicks * 100 : 0;
const cpaOf = (m) => m.conversions > 0 ? m.cost / m.conversions : 0;
const roasOf = (m) => m.cost > 0 ? m.revenue / m.cost * 100 : 0;
const growth = (cur, prev) => (prev > 0 ? (cur - prev) / prev * 100 : (cur > 0 ? 100 : 0));
const normType = (t) => (t || '').startsWith('GFA') ? 'GFA' : (t || '기타');
const TYPE_ORDER = ['파워링크', '쇼핑검색', '브랜드검색', 'GFA', '기타'];
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const PERIODS = { daily: { n: 1, label: '일간' }, weekly: { n: 7, label: '주간' }, monthly: { n: 30, label: '월간' } };

// 전 지표 정의 (비교표·유형표 공용)
const roasStr = (v) => (v / 100).toFixed(2) + '배';
const METRICS = [
  { key: 'impressions', label: '노출수', get: (m) => m.impressions, fmt: num },
  { key: 'clicks', label: '클릭수', get: (m) => m.clicks, fmt: num },
  { key: 'ctr', label: '클릭률(CTR)', get: ctrOf, fmt: (v) => v.toFixed(2) + '%' },
  { key: 'cpc', label: '평균 CPC', get: cpcOf, fmt: won, invert: true },
  { key: 'cost', label: '광고비', get: (m) => m.cost, fmt: won },
  { key: 'conversions', label: '전환수', get: (m) => m.conversions, fmt: num },
  { key: 'cvr', label: '전환율(CVR)', get: cvrOf, fmt: (v) => v.toFixed(1) + '%' },
  { key: 'cpa', label: '전환당비용(CPA)', get: cpaOf, fmt: won, invert: true },
  { key: 'revenue', label: '전환매출액', get: (m) => m.revenue, fmt: won },
  { key: 'roas', label: 'ROAS', get: roasOf, fmt: roasStr },
];

function TrendChart({ daily }) {
  if (!daily.length) return null;
  const W = 720, H = 220, PL = 8, PR = 8, PT = 16, PB = 26;
  const iw = W - PL - PR, ih = H - PT - PB;
  const maxCost = Math.max(1, ...daily.map(d => d.cost));
  const maxRev = Math.max(1, ...daily.map(d => d.revenue));
  const bw = iw / daily.length;
  const x = (i) => PL + i * bw;
  const yRev = (v) => PT + ih - (v / maxRev) * ih;
  const line = daily.map((d, i) => `${x(i) + bw / 2},${yRev(d.revenue)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {daily.map((d, i) => { const h = (d.cost / maxCost) * ih; return <rect key={i} x={x(i) + bw * 0.2} y={PT + ih - h} width={bw * 0.6} height={h} rx="2" fill={R.warn} opacity="0.55" />; })}
      <polyline points={line} fill="none" stroke={R.pink} strokeWidth="2.5" />
      {daily.map((d, i) => <circle key={i} cx={x(i) + bw / 2} cy={yRev(d.revenue)} r="3" fill={R.pink} />)}
      {daily.map((d, i) => (daily.length <= 16 || i % 3 === 0) && (
        <text key={i} x={x(i) + bw / 2} y={H - 8} fontSize="10" fill={R.sub} textAnchor="middle">{d.date.slice(5)}</text>
      ))}
    </svg>
  );
}

function Delta({ g, invert }) {
  const up = g >= 0, good = invert ? !up : up;
  if (Math.abs(g) < 0.05) return <span style={{ fontSize: 12, color: R.sub }}>― 변동없음</span>;
  return <span style={{ fontSize: 12, fontWeight: 700, color: good ? R.ok : R.no }}>{up ? '▲' : '▼'} {Math.abs(g).toFixed(1)}%</span>;
}
function Kpi({ label, value, cur, prev, invert }) {
  return (
    <div style={{ border: `1px solid ${R.line}`, borderRadius: 12, padding: '14px 16px', background: '#fff' }}>
      <div style={{ fontSize: 12, color: R.sub, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: R.ink, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ marginTop: 4 }}><Delta g={growth(cur, prev)} invert={invert} /> <span style={{ fontSize: 11, color: R.sub }}>전기간 대비</span></div>
    </div>
  );
}

const tdBase = { padding: '9px 10px', borderBottom: `1px solid ${R.line}`, fontSize: 12.5 };

function MetricTable({ head, rows }) {
  // rows: [{ label, cells:[{v, color, bold}] , head }]
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 620 }}>
        <thead><tr style={{ background: R.soft }}>
          {head.map((h, i) => <th key={i} style={{ ...tdBase, textAlign: i === 0 ? 'left' : 'right', color: R.sub, fontSize: 11, borderBottom: `1px solid ${R.line}` }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: row.hl ? R.soft : 'transparent', fontWeight: row.bold ? 800 : 400 }}>
              <td style={{ ...tdBase, textAlign: 'left', fontWeight: 700 }}>{row.label}</td>
              {row.cells.map((c, ci) => <td key={ci} style={{ ...tdBase, textAlign: 'right', color: c.color || R.ink, fontWeight: c.bold ? 700 : 'inherit' }}>{c.v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, sub, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: sub ? 2 : 8 }}>{title}</div>
      {sub && <div style={{ fontSize: 11.5, color: R.sub, marginBottom: 8 }}>{sub}</div>}
      {children}
    </div>
  );
}

export default function Report({ currentUser, allowedBrands }) {
  const isAdmin = currentUser?.role === 'admin';
  const [ptype, setPtype] = useState('weekly');
  const [refDate, setRefDate] = useState(addDays(ymd(new Date()), -1));
  const [brand, setBrand] = useState('');
  const [adData, setAdData] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [ad, mp] = await Promise.all([fetchAdDataForReport(70, isAdmin ? null : currentUser.id), fetchMappingsAll()]);
    setAdData(ad); setMappings(mp); setLoading(false);
  }, [isAdmin, currentUser]);
  useEffect(() => { load(); }, [load]);

  const mapByKey = useMemo(() => { const m = {}; mappings.forEach(x => m[x.match_key] = x); return m; }, [mappings]);
  const brands = useMemo(() => {
    const s = new Set();
    adData.forEach(r => { const mp = mapByKey[r.match_key]; if (mp && (!allowedBrands || allowedBrands.includes(mp.brand))) s.add(mp.brand); });
    return [...s].sort();
  }, [adData, mapByKey, allowedBrands]);
  useEffect(() => { if (!brand && brands.length) setBrand(brands[0]); }, [brands, brand]);

  const P = PERIODS[ptype];
  const thisFrom = addDays(refDate, -(P.n - 1)), thisTo = refDate;
  const prevFrom = addDays(refDate, -(2 * P.n - 1)), prevTo = addDays(refDate, -P.n);

  const rowsOf = (from, to) => adData.filter(r => {
    const mp = mapByKey[r.match_key];
    return mp && mp.brand === brand && r.date >= from && r.date <= to;
  }).map(r => ({ ...r, _type: normType(mapByKey[r.match_key]?.ad_type), _label: mapByKey[r.match_key]?.label || r.group_name || r.material_id || '-', _product: mapByKey[r.match_key]?.product }));

  const thisRows = useMemo(() => rowsOf(thisFrom, thisTo), [adData, mapByKey, brand, thisFrom, thisTo]);
  const prevRows = useMemo(() => rowsOf(prevFrom, prevTo), [adData, mapByKey, brand, prevFrom, prevTo]);
  const cur = sumM(thisRows), prev = sumM(prevRows);

  const daily = useMemo(() => {
    const by = {};
    for (let d = thisFrom; d <= thisTo; d = addDays(d, 1)) by[d] = { date: d, cost: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
    thisRows.forEach(r => { const b = by[r.date]; if (b) { b.cost += +r.cost || 0; b.revenue += +r.conv_revenue || 0; b.conversions += +r.conversions || 0; b.clicks += +r.clicks || 0; b.impressions += +r.impressions || 0; } });
    return Object.values(by);
  }, [thisRows, thisFrom, thisTo]);

  const byWeekday = useMemo(() => {
    const g = {};
    thisRows.forEach(r => { const wd = new Date(r.date + 'T00:00:00').getDay(); (g[wd] = g[wd] || []).push(r); });
    return [1, 2, 3, 4, 5, 6, 0].map(wd => ({ label: WD[wd] + '요일', m: sumM(g[wd] || []) })).filter(x => x.m.impressions > 0 || x.m.cost > 0);
  }, [thisRows]);

  const byType = useMemo(() => {
    const g = {};
    thisRows.forEach(r => (g[r._type] = g[r._type] || []).push(r));
    return TYPE_ORDER.filter(t => g[t]).map(t => ({ type: t, m: sumM(g[t]) }));
  }, [thisRows]);

  const topAds = useMemo(() => {
    const g = {};
    thisRows.forEach(r => { const k = r._label + '|' + r._type; (g[k] = g[k] || { label: r._label, type: r._type, rows: [] }).rows.push(r); });
    return Object.values(g).map(x => ({ ...x, m: sumM(x.rows) })).sort((a, b) => (b.m.revenue - a.m.revenue) || (b.m.conversions - a.m.conversions) || (b.m.clicks - a.m.clicks)).slice(0, 8);
  }, [thisRows]);

  const summary = useMemo(() => {
    if (!thisRows.length) return '';
    const gRoas = growth(roasOf(cur), roasOf(prev)), gRev = growth(cur.revenue, prev.revenue), gCost = growth(cur.cost, prev.cost), gConv = growth(cur.conversions, prev.conversions);
    const parts = [];
    parts.push(`이번 ${P.label} ROAS는 ${roasStr(roasOf(cur))}로 전기간 대비 ${gRoas >= 0 ? '개선' : '하락'}(${gRoas >= 0 ? '+' : ''}${gRoas.toFixed(0)}%)되었습니다.`);
    parts.push(`광고비 ${won(cur.cost)}(${gCost >= 0 ? '+' : ''}${gCost.toFixed(0)}%), 매출 ${won(cur.revenue)}(${gRev >= 0 ? '+' : ''}${gRev.toFixed(0)}%), 전환 ${num(cur.conversions)}건(${gConv >= 0 ? '+' : ''}${gConv.toFixed(0)}%)을 기록했습니다.`);
    const best = byType.slice().sort((a, b) => roasOf(b.m) - roasOf(a.m))[0];
    if (best) parts.push(`광고유형 중 '${best.type}'의 효율(ROAS ${roasStr(roasOf(best.m))})이 가장 높았습니다.`);
    const bestWd = byWeekday.slice().sort((a, b) => roasOf(b.m) - roasOf(a.m))[0];
    if (bestWd) parts.push(`요일별로는 ${bestWd.label}의 효율이 가장 좋았습니다.`);
    return parts.join(' ');
  }, [thisRows, cur, prev, byType, byWeekday, P.label]);

  const kakaoText = useMemo(() => {
    if (!thisRows.length) return '';
    return [
      `[${brand}] ${P.label} 광고 리포트 (${kdate(thisFrom)}~${kdate(thisTo)})`,
      `· 광고비 ${won(cur.cost)}  · 매출 ${won(cur.revenue)}`,
      `· ROAS ${roasStr(roasOf(cur))}  · 전환 ${num(cur.conversions)}건 (전환율 ${cvrOf(cur).toFixed(1)}%)`,
      `· 클릭 ${num(cur.clicks)}  · CTR ${ctrOf(cur).toFixed(2)}%  · CPC ${won(cpcOf(cur))}`,
      `(전기간 대비 매출 ${growth(cur.revenue, prev.revenue) >= 0 ? '+' : ''}${growth(cur.revenue, prev.revenue).toFixed(0)}%, ROAS ${growth(roasOf(cur), roasOf(prev)) >= 0 ? '+' : ''}${growth(roasOf(cur), roasOf(prev)).toFixed(0)}%)`,
    ].join('\n');
  }, [thisRows, brand, cur, prev, thisFrom, thisTo, P.label]);

  const copyKakao = async () => { try { await navigator.clipboard.writeText(kakaoText); alert('카톡용 요약을 복사했습니다.'); } catch { alert('복사 실패'); } };

  const btn = { padding: '8px 14px', borderRadius: 8, border: '1px solid #2b3350', background: '#1a1e2c', color: '#cfd6e6', cursor: 'pointer', fontSize: 13 };
  const btnOn = { ...btn, background: '#3a6ff0', color: '#fff', border: 'none', fontWeight: 700 };

  // 기간 비교표 행
  const cmpRows = METRICS.map(mt => {
    const cv = mt.get(cur), pv = mt.get(prev), diff = cv - pv, g = growth(cv, pv), good = mt.invert ? diff <= 0 : diff >= 0;
    const col = Math.abs(g) < 0.05 ? R.sub : good ? R.ok : R.no;
    return {
      label: mt.label,
      cells: [
        { v: mt.fmt(cv), bold: true },
        { v: mt.fmt(pv), color: R.sub },
        { v: (diff >= 0 ? '+' : '−') + mt.fmt(Math.abs(diff)), color: col },
        { v: (g >= 0 ? '+' : '') + g.toFixed(1) + '%', color: col, bold: true },
      ],
    };
  });
  const typeHead = ['광고유형', '노출', '클릭', 'CTR', 'CPC', '광고비', '전환', 'CVR', '매출', 'ROAS', '비중'];
  const typeRow = (label, m, hl) => ({ label, hl, cells: [
    { v: num(m.impressions) }, { v: num(m.clicks) }, { v: ctrOf(m).toFixed(2) + '%' }, { v: won(cpcOf(m)), color: R.sub },
    { v: won(m.cost), color: R.warn, bold: true }, { v: num(m.conversions), color: R.ok, bold: true }, { v: cvrOf(m).toFixed(1) + '%' },
    { v: won(m.revenue), color: R.pink }, { v: roasStr(roasOf(m)), color: roasOf(m) >= 300 ? R.ok : roasOf(m) < 100 ? R.no : R.ink, bold: true },
    { v: (cur.cost > 0 ? (m.cost / cur.cost * 100) : 0).toFixed(0) + '%', color: R.sub },
  ] });

  return (
    <div>
      <style>{`@media print { .no-print{display:none !important;} body{background:#fff !important;} .report-sheet{box-shadow:none !important;margin:0 !important;} }`}</style>

      <div className="no-print" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>광고주 리포트</div>
        <div style={{ fontSize: 12, color: '#8890a6', marginBottom: 12 }}>브랜드·기간을 고르면 광고주에게 보낼 리포트가 생성됩니다. 인쇄(PDF)하거나 카톡 요약을 복사하세요.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={brand} onChange={e => setBrand(e.target.value)} style={{ ...btn, minWidth: 140 }}>{brands.map(b => <option key={b} value={b}>{b}</option>)}</select>
          <div style={{ display: 'flex', gap: 4 }}>{Object.entries(PERIODS).map(([k, v]) => <button key={k} onClick={() => setPtype(k)} style={ptype === k ? btnOn : btn}>{v.label}</button>)}</div>
          <input type="date" value={refDate} max={ymd(new Date())} onChange={e => setRefDate(e.target.value)} style={btn} />
          <div style={{ flex: 1 }} />
          <button onClick={copyKakao} style={btn}>💬 카톡 요약 복사</button>
          <button onClick={() => window.print()} style={btnOn}>🖨️ 인쇄 / PDF</button>
        </div>
      </div>

      {loading ? <div style={{ color: '#8890a6', fontSize: 13 }}>불러오는 중…</div> :
      !brand || !thisRows.length ? (
        <div style={{ background: '#fff', color: R.sub, borderRadius: 14, padding: 40, textAlign: 'center', fontSize: 13 }}>
          {brands.length === 0 ? '표시할 브랜드가 없습니다. 매핑 관리에서 광고를 브랜드에 연결하세요.' : '선택한 기간에 데이터가 없습니다. 기준일/기간을 조정해 보세요.'}
        </div>
      ) : (
      <div className="report-sheet" style={{ background: '#fff', color: R.ink, borderRadius: 14, boxShadow: '0 6px 30px rgba(0,0,0,0.35)', maxWidth: 900, margin: '0 auto', overflow: 'hidden' }}>
        <div style={{ background: `linear-gradient(135deg, ${R.ac}, ${R.pur})`, color: '#fff', padding: '26px 30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.9, letterSpacing: 1 }}>OREUMHI · 광고 성과 리포트</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{brand}</div>
              <div style={{ fontSize: 14, opacity: 0.95, marginTop: 2 }}>{P.label} 광고 성과 리포트</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13, opacity: 0.95 }}>
              <div style={{ fontWeight: 700 }}>{kdate(thisFrom)} ~ {kdate(thisTo)}</div>
              <div style={{ opacity: 0.85, marginTop: 4 }}>전기간: {kdate(prevFrom)}~{kdate(prevTo)}</div>
              <div style={{ opacity: 0.7, marginTop: 8, fontSize: 11 }}>생성일 {kdate(ymd(new Date()))}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 30px' }}>
          {/* 핵심 지표 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Kpi label="광고비" value={won(cur.cost)} cur={cur.cost} prev={prev.cost} />
            <Kpi label="전환매출액" value={won(cur.revenue)} cur={cur.revenue} prev={prev.revenue} />
            <Kpi label="ROAS" value={roasStr(roasOf(cur))} cur={roasOf(cur)} prev={roasOf(prev)} />
            <Kpi label="전환수" value={num(cur.conversions) + '건'} cur={cur.conversions} prev={prev.conversions} />
            <Kpi label="전환율(CVR)" value={cvrOf(cur).toFixed(1) + '%'} cur={cvrOf(cur)} prev={cvrOf(prev)} />
            <Kpi label="평균 CPC" value={won(cpcOf(cur))} cur={cpcOf(cur)} prev={cpcOf(prev)} invert />
          </div>

          {/* 총평 */}
          <div style={{ marginTop: 20, background: R.soft, border: `1px solid ${R.line}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: R.ac, marginBottom: 6 }}>📌 요약 총평</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>{summary}</div>
          </div>

          {/* 기간 상세 비교 */}
          <Section title="기간 상세 비교" sub={`이번 ${P.label}(${kdate(thisFrom)}~${kdate(thisTo)}) vs 전기간(${kdate(prevFrom)}~${kdate(prevTo)}) — 전 지표`}>
            <MetricTable head={['지표', '이번 기간', '전기간', '증감', '증감률']} rows={cmpRows} />
          </Section>

          {/* 일자별 추이 */}
          <Section title="일자별 추이" sub="■ 광고비(막대)  —  매출(선)">
            <div style={{ border: `1px solid ${R.line}`, borderRadius: 12, padding: 14 }}><TrendChart daily={daily} /></div>
          </Section>

          {/* 요일별 성과 */}
          {byWeekday.length > 1 && (
            <Section title="요일별 성과">
              <MetricTable head={typeHead.slice(0, 10).map((h, i) => i === 0 ? '요일' : h)}
                rows={[...byWeekday.map(w => typeRow(w.label, w.m)), (() => { const r = typeRow('전체', cur, true); r.bold = true; return r; })()].map(r => ({ ...r, cells: r.cells.slice(0, 9) }))} />
            </Section>
          )}

          {/* 광고유형별 성과 */}
          <Section title="광고유형별 성과">
            <MetricTable head={typeHead} rows={[...byType.map(({ type, m }) => typeRow(type, m)), (() => { const r = typeRow('전체', cur, true); r.bold = true; return r; })()]} />
          </Section>

          {/* 상위 광고 */}
          <Section title="상위 광고 (매출 기준)">
            <MetricTable head={['광고', '유형', '노출', '클릭', 'CTR', '광고비', '전환', 'CVR', '매출', 'ROAS']}
              rows={topAds.map(a => ({ label: `${a.label}`, cells: [
                { v: a.type, color: R.sub }, { v: num(a.m.impressions) }, { v: num(a.m.clicks) }, { v: ctrOf(a.m).toFixed(2) + '%' },
                { v: won(a.m.cost), color: R.warn }, { v: num(a.m.conversions), color: R.ok, bold: true }, { v: cvrOf(a.m).toFixed(1) + '%' },
                { v: won(a.m.revenue), color: R.pink }, { v: roasStr(roasOf(a.m)), bold: true },
              ] })).map(r => ({ label: r.label, cells: r.cells }))} />
          </Section>

          {/* 코멘트 */}
          <Section title="담당자 코멘트 · 다음 제안">
            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="이번 기간 분석과 다음 기간 제안을 적어주세요 (인쇄 시 함께 나갑니다)"
              style={{ width: '100%', minHeight: 90, border: `1px solid ${R.line}`, borderRadius: 12, padding: 14, fontSize: 13, lineHeight: 1.6, color: R.ink, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </Section>

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${R.line}`, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: R.sub }}>
            <span>주식회사 오름히 · 광고 성과 대시보드</span>
            <span>네이버 검색·디스플레이 광고 데이터 기준 자동 생성</span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
