// ============================================
// 광고주 리포트 (일 · 주 · 월)
//   광고주에게 보내는 밝은/인쇄용 성과 리포트.
//   브랜드 + 기간 선택 → 핵심지표(증감) · 총평 · 추이 · 유형별 · 상위광고 · 코멘트
// ============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchAdDataForReport, fetchMappingsAll } from '../store';
import { fmtWon, fmtNum } from '../utils';

// ─── 리포트 전용 라이트 테마 ───
const R = {
  ink: '#1b2536', sub: '#6b7688', line: '#e6e9ef', soft: '#f5f7fb',
  ac: '#3a6ff0', ok: '#12b886', no: '#f0455a', warn: '#f59f3b', pink: '#e64980', pur: '#7b61ff',
};
const won = (n) => '₩' + fmtNum(Math.round(n || 0));
const num = (n) => fmtNum(Math.round(n || 0));
const pct = (n, d = 1) => (n == null ? '-' : (n).toFixed(d) + '%');

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const kdate = (s) => s ? s.replace(/-/g, '.').slice(2) : '';

const sumM = (rows) => rows.reduce((a, r) => ({
  impressions: a.impressions + (+r.impressions || 0), clicks: a.clicks + (+r.clicks || 0),
  cost: a.cost + (+r.cost || 0), conversions: a.conversions + (+r.conversions || 0),
  revenue: a.revenue + (+r.conv_revenue || 0),
}), { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 });
const ctrOf = (m) => m.impressions > 0 ? m.clicks / m.impressions * 100 : 0;
const roasOf = (m) => m.cost > 0 ? m.revenue / m.cost * 100 : 0;
const cpaOf = (m) => m.conversions > 0 ? m.cost / m.conversions : 0;
const growth = (cur, prev) => (prev > 0 ? (cur - prev) / prev * 100 : (cur > 0 ? 100 : 0));

const normType = (t) => (t || '').startsWith('GFA') ? 'GFA' : (t || '기타');
const TYPE_ORDER = ['파워링크', '쇼핑검색', '브랜드검색', 'GFA', '기타'];

const PERIODS = { daily: { n: 1, label: '일간', title: '일간 광고 성과 리포트' }, weekly: { n: 7, label: '주간', title: '주간 광고 성과 리포트' }, monthly: { n: 30, label: '월간', title: '월간 광고 성과 리포트' } };

// ─── 추이 그래프 (광고비 막대 + 매출 선) ───
function TrendChart({ daily }) {
  if (!daily.length) return null;
  const W = 720, H = 220, PL = 8, PR = 8, PT = 16, PB = 26;
  const iw = W - PL - PR, ih = H - PT - PB;
  const maxCost = Math.max(1, ...daily.map(d => d.cost));
  const maxRev = Math.max(1, ...daily.map(d => d.revenue));
  const bw = iw / daily.length;
  const x = (i) => PL + i * bw;
  const yCost = (v) => PT + ih - (v / maxCost) * ih;
  const yRev = (v) => PT + ih - (v / maxRev) * ih;
  const line = daily.map((d, i) => `${x(i) + bw / 2},${yRev(d.revenue)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {daily.map((d, i) => {
        const h = (d.cost / maxCost) * ih;
        return <rect key={i} x={x(i) + bw * 0.2} y={PT + ih - h} width={bw * 0.6} height={h} rx="2" fill={R.warn} opacity="0.55" />;
      })}
      <polyline points={line} fill="none" stroke={R.pink} strokeWidth="2.5" />
      {daily.map((d, i) => <circle key={i} cx={x(i) + bw / 2} cy={yRev(d.revenue)} r="3" fill={R.pink} />)}
      {daily.map((d, i) => (daily.length <= 16 || i % 3 === 0) && (
        <text key={i} x={x(i) + bw / 2} y={H - 8} fontSize="10" fill={R.sub} textAnchor="middle">{d.date.slice(5)}</text>
      ))}
    </svg>
  );
}

function Delta({ cur, prev, invert }) {
  const g = growth(cur, prev);
  const up = g >= 0;
  const good = invert ? !up : up;
  if (Math.abs(g) < 0.05) return <span style={{ fontSize: 12, color: R.sub }}>― 변동없음</span>;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: good ? R.ok : R.no }}>
      {up ? '▲' : '▼'} {Math.abs(g).toFixed(1)}%
    </span>
  );
}

function Kpi({ label, value, cur, prev, invert }) {
  return (
    <div style={{ border: `1px solid ${R.line}`, borderRadius: 12, padding: '14px 16px', background: '#fff' }}>
      <div style={{ fontSize: 12, color: R.sub, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: R.ink, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ marginTop: 4 }}><Delta cur={cur} prev={prev} invert={invert} /> <span style={{ fontSize: 11, color: R.sub }}>전기간 대비</span></div>
    </div>
  );
}

export default function Report({ currentUser, allowedBrands }) {
  const isAdmin = currentUser?.role === 'admin';
  const [ptype, setPtype] = useState('weekly');
  const [refDate, setRefDate] = useState(addDays(ymd(new Date()), -1)); // 기본: 어제
  const [brand, setBrand] = useState('');
  const [adData, setAdData] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [ad, mp] = await Promise.all([
      fetchAdDataForReport(70, isAdmin ? null : currentUser.id),
      fetchMappingsAll(),
    ]);
    setAdData(ad); setMappings(mp); setLoading(false);
  }, [isAdmin, currentUser]);
  useEffect(() => { load(); }, [load]);

  const mapByKey = useMemo(() => { const m = {}; mappings.forEach(x => m[x.match_key] = x); return m; }, [mappings]);

  // 브랜드 목록
  const brands = useMemo(() => {
    const s = new Set();
    adData.forEach(r => { const mp = mapByKey[r.match_key]; if (mp && (!allowedBrands || allowedBrands.includes(mp.brand))) s.add(mp.brand); });
    return [...s].sort();
  }, [adData, mapByKey, allowedBrands]);
  useEffect(() => { if (!brand && brands.length) setBrand(brands[0]); }, [brands, brand]);

  const P = PERIODS[ptype];
  const thisFrom = addDays(refDate, -(P.n - 1)), thisTo = refDate;
  const prevFrom = addDays(refDate, -(2 * P.n - 1)), prevTo = addDays(refDate, -P.n);

  // 선택 브랜드 행 (이번 기간 / 전 기간)
  const rowsOf = (from, to) => adData.filter(r => {
    const mp = mapByKey[r.match_key];
    return mp && mp.brand === brand && r.date >= from && r.date <= to;
  }).map(r => ({ ...r, _type: normType(mapByKey[r.match_key]?.ad_type), _label: mapByKey[r.match_key]?.label || r.group_name || r.material_id || '-', _product: mapByKey[r.match_key]?.product }));

  const thisRows = useMemo(() => rowsOf(thisFrom, thisTo), [adData, mapByKey, brand, thisFrom, thisTo]);
  const prevRows = useMemo(() => rowsOf(prevFrom, prevTo), [adData, mapByKey, brand, prevFrom, prevTo]);
  const cur = sumM(thisRows), prev = sumM(prevRows);

  // 일자별
  const daily = useMemo(() => {
    const by = {};
    for (let d = thisFrom; d <= thisTo; d = addDays(d, 1)) by[d] = { date: d, cost: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
    thisRows.forEach(r => { const b = by[r.date]; if (b) { b.cost += +r.cost || 0; b.revenue += +r.conv_revenue || 0; b.conversions += +r.conversions || 0; b.clicks += +r.clicks || 0; b.impressions += +r.impressions || 0; } });
    return Object.values(by);
  }, [thisRows, thisFrom, thisTo]);

  // 유형별
  const byType = useMemo(() => {
    const g = {};
    thisRows.forEach(r => (g[r._type] = g[r._type] || []).push(r));
    return TYPE_ORDER.filter(t => g[t]).map(t => ({ type: t, m: sumM(g[t]) }));
  }, [thisRows]);

  // 상위 광고 (매출 기준 Top5, 없으면 전환/클릭)
  const topAds = useMemo(() => {
    const g = {};
    thisRows.forEach(r => { const k = r._label + '|' + r._type; (g[k] = g[k] || { label: r._label, type: r._type, rows: [] }).rows.push(r); });
    return Object.values(g).map(x => ({ ...x, m: sumM(x.rows) }))
      .sort((a, b) => (b.m.revenue - a.m.revenue) || (b.m.conversions - a.m.conversions) || (b.m.clicks - a.m.clicks))
      .slice(0, 5);
  }, [thisRows]);

  // 자동 총평
  const summary = useMemo(() => {
    if (!thisRows.length) return '';
    const parts = [];
    const gRoas = growth(roasOf(cur), roasOf(prev));
    const gRev = growth(cur.revenue, prev.revenue);
    const gCost = growth(cur.cost, prev.cost);
    const gConv = growth(cur.conversions, prev.conversions);
    parts.push(`이번 ${P.label} ROAS는 ${(roasOf(cur) / 100).toFixed(2)}배로 전기간 대비 ${gRoas >= 0 ? '개선' : '하락'}(${gRoas >= 0 ? '+' : ''}${gRoas.toFixed(0)}%)되었습니다.`);
    parts.push(`광고비 ${won(cur.cost)}(${gCost >= 0 ? '+' : ''}${gCost.toFixed(0)}%), 매출 ${won(cur.revenue)}(${gRev >= 0 ? '+' : ''}${gRev.toFixed(0)}%), 전환 ${num(cur.conversions)}건(${gConv >= 0 ? '+' : ''}${gConv.toFixed(0)}%)을 기록했습니다.`);
    const best = byType.slice().sort((a, b) => roasOf(b.m) - roasOf(a.m))[0];
    if (best) parts.push(`광고유형 중 '${best.type}'의 효율(ROAS ${(roasOf(best.m) / 100).toFixed(2)}배)이 가장 높았습니다.`);
    return parts.join(' ');
  }, [thisRows, cur, prev, byType, P.label]);

  const kakaoText = useMemo(() => {
    if (!thisRows.length) return '';
    const L = [];
    L.push(`[${brand}] ${P.label} 광고 리포트 (${kdate(thisFrom)}~${kdate(thisTo)})`);
    L.push(`· 광고비 ${won(cur.cost)}  · 매출 ${won(cur.revenue)}`);
    L.push(`· ROAS ${(roasOf(cur) / 100).toFixed(2)}배  · 전환 ${num(cur.conversions)}건`);
    L.push(`· 클릭 ${num(cur.clicks)}  · 클릭률 ${pct(ctrOf(cur), 2)}`);
    L.push(`(전기간 대비 매출 ${growth(cur.revenue, prev.revenue) >= 0 ? '+' : ''}${growth(cur.revenue, prev.revenue).toFixed(0)}%)`);
    return L.join('\n');
  }, [thisRows, brand, cur, prev, thisFrom, thisTo, P.label]);

  const copyKakao = async () => { try { await navigator.clipboard.writeText(kakaoText); alert('카톡용 요약을 복사했습니다.'); } catch { alert('복사 실패'); } };

  const btn = { padding: '8px 14px', borderRadius: 8, border: '1px solid #2b3350', background: '#1a1e2c', color: '#cfd6e6', cursor: 'pointer', fontSize: 13 };
  const btnOn = { ...btn, background: '#3a6ff0', color: '#fff', border: 'none', fontWeight: 700 };

  return (
    <div>
      <style>{`@media print {
        .no-print { display:none !important; }
        body { background:#fff !important; }
        .report-sheet { box-shadow:none !important; margin:0 !important; }
      }`}</style>

      {/* 컨트롤 (인쇄 제외) */}
      <div className="no-print" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>광고주 리포트</div>
        <div style={{ fontSize: 12, color: '#8890a6', marginBottom: 12 }}>광고주에게 보낼 성과 리포트를 만들고 인쇄(PDF)하거나 카톡용 요약을 복사하세요</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={brand} onChange={e => setBrand(e.target.value)} style={{ ...btn, minWidth: 140 }}>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4 }}>
            {Object.entries(PERIODS).map(([k, v]) => (
              <button key={k} onClick={() => setPtype(k)} style={ptype === k ? btnOn : btn}>{v.label}</button>
            ))}
          </div>
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
      /* ─── 리포트 시트 (라이트 · 인쇄용) ─── */
      <div className="report-sheet" style={{ background: '#fff', color: R.ink, borderRadius: 14, boxShadow: '0 6px 30px rgba(0,0,0,0.35)', maxWidth: 840, margin: '0 auto', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ background: `linear-gradient(135deg, ${R.ac}, ${R.pur})`, color: '#fff', padding: '26px 30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.9, letterSpacing: 1 }}>OREUMHI · 광고 성과 리포트</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{brand}</div>
              <div style={{ fontSize: 14, opacity: 0.95, marginTop: 2 }}>{P.title}</div>
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
            <Kpi label="매출 (전환매출)" value={won(cur.revenue)} cur={cur.revenue} prev={prev.revenue} />
            <Kpi label="ROAS" value={(roasOf(cur) / 100).toFixed(2) + '배'} cur={roasOf(cur)} prev={roasOf(prev)} />
            <Kpi label="전환수" value={num(cur.conversions) + '건'} cur={cur.conversions} prev={prev.conversions} />
            <Kpi label="클릭수" value={num(cur.clicks)} cur={cur.clicks} prev={prev.clicks} />
            <Kpi label="클릭률(CTR)" value={pct(ctrOf(cur), 2)} cur={ctrOf(cur)} prev={ctrOf(prev)} />
          </div>

          {/* 총평 */}
          <div style={{ marginTop: 20, background: R.soft, border: `1px solid ${R.line}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: R.ac, marginBottom: 6 }}>📌 요약 총평</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: R.ink }}>{summary}</div>
          </div>

          {/* 추이 그래프 */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>일자별 추이</div>
            <div style={{ fontSize: 11, color: R.sub, marginBottom: 8 }}>
              <span style={{ color: R.warn }}>■</span> 광고비 &nbsp; <span style={{ color: R.pink }}>—</span> 매출
            </div>
            <div style={{ border: `1px solid ${R.line}`, borderRadius: 12, padding: 14 }}><TrendChart daily={daily} /></div>
          </div>

          {/* 유형별 성과 */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>광고유형별 성과</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ background: R.soft }}>
                {['광고유형', '노출', '클릭', 'CTR', '광고비', '전환', '매출', 'ROAS', '비중'].map((h, i) =>
                  <th key={h} style={{ padding: '9px 10px', textAlign: i === 0 ? 'left' : 'right', color: R.sub, fontSize: 11, borderBottom: `1px solid ${R.line}` }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {byType.map(({ type, m }) => (
                  <tr key={type} style={{ borderBottom: `1px solid ${R.line}` }}>
                    <td style={{ padding: '9px 10px', fontWeight: 700 }}>{type}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>{num(m.impressions)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>{num(m.clicks)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>{pct(ctrOf(m), 2)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: R.warn, fontWeight: 600 }}>{won(m.cost)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: R.ok, fontWeight: 700 }}>{num(m.conversions)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: R.pink }}>{won(m.revenue)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: roasOf(m) >= 300 ? R.ok : roasOf(m) < 100 ? R.no : R.ink }}>{(roasOf(m) / 100).toFixed(2)}배</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: R.sub }}>{pct(cur.cost > 0 ? m.cost / cur.cost * 100 : 0, 0)}</td>
                  </tr>
                ))}
                <tr style={{ background: R.soft, fontWeight: 800 }}>
                  <td style={{ padding: '9px 10px' }}>전체</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>{num(cur.impressions)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>{num(cur.clicks)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>{pct(ctrOf(cur), 2)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>{won(cur.cost)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>{num(cur.conversions)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>{won(cur.revenue)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>{(roasOf(cur) / 100).toFixed(2)}배</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 상위 광고 */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>상위 광고 (매출 기준 TOP 5)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ background: R.soft }}>
                {['광고', '유형', '노출', '클릭', '광고비', '전환', '매출', 'ROAS'].map((h, i) =>
                  <th key={h} style={{ padding: '9px 10px', textAlign: i <= 1 ? 'left' : 'right', color: R.sub, fontSize: 11, borderBottom: `1px solid ${R.line}` }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {topAds.map((a, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${R.line}` }}>
                    <td style={{ padding: '9px 10px', fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</td>
                    <td style={{ padding: '9px 10px', color: R.sub }}>{a.type}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>{num(a.m.impressions)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>{num(a.m.clicks)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: R.warn }}>{won(a.m.cost)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: R.ok, fontWeight: 700 }}>{num(a.m.conversions)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: R.pink }}>{won(a.m.revenue)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700 }}>{(roasOf(a.m) / 100).toFixed(2)}배</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 담당자 코멘트 */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>담당자 코멘트 · 다음 제안</div>
            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="이번 기간 분석과 다음 기간 제안을 적어주세요 (인쇄 시 함께 나갑니다)"
              style={{ width: '100%', minHeight: 90, border: `1px solid ${R.line}`, borderRadius: 12, padding: 14, fontSize: 13, lineHeight: 1.6, color: R.ink, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>

          {/* 푸터 */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${R.line}`, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: R.sub }}>
            <span>주식회사 오름히 · 광고 성과 대시보드</span>
            <span>본 리포트는 네이버 광고 데이터 기준으로 자동 생성되었습니다.</span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
