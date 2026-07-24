// ============================================
// 하락 진단 — 광고그룹 단위로 "어디서 매출/ROAS가 빠졌나"를 자동으로 찾아냅니다.
//   광고주를 고르면 최근 기간을 1·3·6개월 전·작년 같은 기간과 비교해,
//   매출·ROAS·광고비가 하락한 광고그룹을 하락 큰 순으로 정렬해 범인을 위로 올립니다.
//   (대표님이 엑셀로 손수 대조하던 작업을 자동화)
// ============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { C } from '../config';
import { fetchDiagGroups, fetchMappingsAll } from '../store';
import { fmtWon, fmtNum, today } from '../utils';

const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const chip = (on) => ({ border: `1px solid ${on ? C.ac : C.bd}`, background: on ? C.ac : 'transparent', color: on ? '#fff' : C.txd, borderRadius: 999, padding: '5px 13px', fontSize: 12.5, cursor: 'pointer', fontWeight: on ? 700 : 400 });
const th = { textAlign: 'right', padding: '7px 9px', fontSize: 10.5, color: C.txm, fontWeight: 600, whiteSpace: 'nowrap' };
const td = { padding: '9px 9px', fontSize: 12.5, borderTop: `1px solid ${C.bd}`, whiteSpace: 'nowrap' };

const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const roasOf = (m) => m.cost > 0 ? m.rev / m.cost * 100 : 0;
const pct = (cur, base) => base > 0 ? Math.round((cur / base - 1) * 100) : (cur > 0 ? 100 : 0);

const BASELINES = [
  { key: 'm1', label: '1개월 전', off: 30 },
  { key: 'm3', label: '3개월 전', off: 91 },
  { key: 'm6', label: '6개월 전', off: 182 },
  { key: 'yoy', label: '작년 동기', off: 365 },
];
const RECENTS = [[7, '최근 7일'], [14, '최근 14일'], [30, '최근 30일']];

const TOP_N = 20;   // 광고비 많이 쓴 상위 그룹만 진단

// 서버 집계 결과(rows: group_name,campaign_name,cost,rev,conv,imp,clk) → 그룹명 키 맵
function toGroupMap(rows) {
  const g = {};
  (rows || []).forEach(r => {
    const key = (r.group_name || '(그룹없음)').trim();
    g[key] = { camp: r.campaign_name || '', grp: key,
      cost: +r.cost || 0, rev: +r.rev || 0, conv: +r.conv || 0, imp: +r.imp || 0, clk: +r.clk || 0 };
  });
  return g;
}

// 진단 태그
function diagnose(cur, base) {
  if (!base || base.cost < 500) {
    return cur && cur.cost > 500 ? { s: 'new', t: '🆕 신규 집행', c: C.ac } : { s: 'none', t: '—', c: C.txm };
  }
  if (!cur || cur.cost < 500) return { s: 'stopped', t: '⚫ 최근 집행 없음', c: C.txm };
  const revChg = pct(cur.rev, base.rev);
  const costChg = pct(cur.cost, base.cost);
  const cR = roasOf(cur), bR = roasOf(base);
  if (revChg >= -10) return { s: 'ok', t: revChg >= 15 ? '🟢 성장' : '🟢 유지', c: C.ok };
  // 매출이 빠졌다 → 원인 분류
  if (cR < bR * 0.8 && costChg >= -15) return { s: 'bad', t: '🔴 효율 급락 (돈 쓰고 안 팔림)', c: C.no };
  if (costChg <= -25 && cR >= bR * 0.9) return { s: 'cut', t: '🟡 광고 축소로 매출만 감소', c: C.yel };
  if (cur.imp < base.imp * 0.7 && cR >= bR * 0.9) return { s: 'imp', t: '🟡 노출 감소 (효율은 유지)', c: C.yel };
  return { s: 'down', t: '🔴 매출 하락', c: C.no };
}

export default function Diagnosis({ currentUser, allowedBrands }) {
  const [mappings, setMappings] = useState([]);
  const [brand, setBrand] = useState('');
  const [recentN, setRecentN] = useState(14);
  const [baseKey, setBaseKey] = useState('yoy');
  const [data, setData] = useState(null);   // { groups, curTot, baseTot, empty }
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchMappingsAll().then(setMappings); }, []);
  const mapByKey = useMemo(() => { const m = {}; mappings.forEach(x => { m[x.match_key] = x; }); return m; }, [mappings]);
  const brands = useMemo(() => {
    const s = new Set();
    mappings.forEach(m => { if (m.brand && (!allowedBrands || allowedBrands.includes(m.brand))) s.add(m.brand); });
    return [...s].sort();
  }, [mappings, allowedBrands]);
  // 홈 '오늘 챙길 것'에서 넘어온 경우 해당 브랜드로 자동 선택 (1회)
  useEffect(() => {
    if (brand || !brands.length) return;
    let pre = '';
    try { pre = sessionStorage.getItem('oha_diag_brand') || ''; sessionStorage.removeItem('oha_diag_brand'); } catch { /* ignore */ }
    setBrand(pre && brands.includes(pre) ? pre : brands[0]);
  }, [brands, brand]);

  const base = BASELINES.find(b => b.key === baseKey);
  const t = today();
  const curFrom = addDays(t, -(recentN - 1)), curTo = t;
  const baseFrom = addDays(curFrom, -base.off), baseTo = addDays(curTo, -base.off);

  const run = useCallback(async () => {
    if (!brand) return;
    setLoading(true);
    const [curRes, baseRes] = await Promise.all([
      fetchDiagGroups(brand, curFrom, curTo),
      fetchDiagGroups(brand, baseFrom, baseTo),
    ]);
    const curG = toGroupMap(curRes.rows);
    const baseG = toGroupMap(baseRes.rows);
    // 광고비 많이 쓴 상위 20개 그룹 (최근 광고비 기준, 없으면 과거)
    const costOf = (k) => Math.max(curG[k]?.cost || 0, baseG[k]?.cost || 0);
    const topKeys = [...new Set([...Object.keys(curG), ...Object.keys(baseG)])]
      .sort((a, b) => costOf(b) - costOf(a))
      .slice(0, TOP_N);
    const groups = topKeys.map(k => {
      const cur = curG[k], bs = baseG[k];
      return { key: k, camp: (cur || bs).camp, grp: (cur || bs).grp, cur, base: bs, dx: diagnose(cur, bs) };
    });
    // 표시 순서: 광고비 많이 쓴 순 (최근 기준) — 사용자가 광고비 상위부터 훑도록
    groups.sort((a, b) => costOf(b.key) - costOf(a.key));
    const sum = (g) => Object.values(g).reduce((a, e) => ({ cost: a.cost + e.cost, rev: a.rev + e.rev, conv: a.conv + e.conv }), { cost: 0, rev: 0, conv: 0 });
    setData({
      groups, curTot: sum(curG), baseTot: sum(baseG),
      empty: !Object.keys(baseG).length,
      baseFailed: !baseRes.ok, curFailed: !curRes.ok,
    });
    setLoading(false);
  }, [brand, curFrom, curTo, baseFrom, baseTo]);
  useEffect(() => { run(); }, [run]);

  const arrow = (v, invGood) => {
    if (v === 0) return <span style={{ color: C.txm }}>±0%</span>;
    const good = invGood ? v < 0 : v > 0;
    return <span style={{ color: good ? C.ok : C.no, fontWeight: 700 }}>{v > 0 ? '▲' : '▼'}{Math.abs(v)}%</span>;
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>🔎 하락 진단</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 16, lineHeight: 1.6 }}>
        매출이 빠진 광고주를 고르면, <b style={{ color: C.tx }}>어느 광고그룹</b>에서 매출·ROAS·광고비가 빠졌는지 자동으로 찾아 하락 큰 순으로 보여줍니다.
      </div>

      <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={brand} onChange={e => setBrand(e.target.value)}
          style={{ background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, fontSize: 13, padding: '8px 12px', minWidth: 150 }}>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <span style={{ display: 'flex', gap: 4 }}>{RECENTS.map(([n, l]) => <button key={n} style={chip(recentN === n)} onClick={() => setRecentN(n)}>{l}</button>)}</span>
        <span style={{ color: C.txm, fontSize: 12 }}>vs</span>
        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{BASELINES.map(b => <button key={b.key} style={chip(baseKey === b.key)} onClick={() => setBaseKey(b.key)}>{b.label}</button>)}</span>
      </div>

      {loading ? <div style={{ ...card, color: C.txd, fontSize: 13 }}>불러오는 중…</div>
        : !data ? null
        : (
        <>
          {/* 브랜드 전체 요약 */}
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            {[
              ['매출', data.curTot.rev, data.baseTot.rev, false],
              ['광고비', data.curTot.cost, data.baseTot.cost, false],
              ['ROAS', roasOf(data.curTot), roasOf(data.baseTot), false],
            ].map(([lab, cur, bs, inv]) => (
              <div key={lab} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: C.txd, marginBottom: 4 }}>{lab} <span style={{ color: C.txm }}>({base.label} 대비)</span></div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.tx }}>{lab === 'ROAS' ? Math.round(cur) + '%' : fmtWon(Math.round(cur))}</div>
                <div style={{ fontSize: 11.5, marginTop: 3 }}>{arrow(lab === 'ROAS' ? Math.round(cur - bs) : pct(cur, bs))}{lab === 'ROAS' && <span style={{ color: C.txm }}>p</span>} <span style={{ color: C.txm }}>(과거 {lab === 'ROAS' ? Math.round(bs) + '%' : fmtWon(Math.round(bs))})</span></div>
              </div>
            ))}
          </div>

          {(data.baseFailed || data.curFailed) ? (
            <div style={{ ...card, fontSize: 12.5, color: C.no, lineHeight: 1.7 }}>
              ⚠ 데이터 조회에 실패했습니다 (일시적 오류). 잠시 후 브랜드를 다시 선택하거나 기간 버튼을 눌러 재시도해주세요.
            </div>
          ) : data.empty && (
            <div style={{ ...card, fontSize: 12.5, color: C.warn, lineHeight: 1.7 }}>
              ⚠ {base.label}({baseFrom}~{baseTo}) 데이터가 아직 없습니다.
              {baseKey === 'yoy' ? ' 작년 데이터 백필이 완료되면 자동으로 채워집니다. 우선 1·3·6개월 전으로 비교해보세요.' : ' 이 기간의 보고서가 수집되지 않았습니다.'}
            </div>
          )}

          <div style={card}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>
              광고그룹별 변화 <span style={{ fontSize: 11.5, color: C.txd, fontWeight: 400 }}>· 광고비 상위 {TOP_N}개 · 최근 {curFrom}~{curTo} vs {base.label} {baseFrom}~{baseTo}</span>
            </div>
            <div style={{ fontSize: 11, color: C.txm, marginBottom: 10 }}>광고비를 많이 쓴 순서로 나열됩니다 · '진단' 열에서 매출·ROAS가 빠진 그룹을 표시합니다</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>광고그룹</th>
                    <th style={th}>광고비 (과거→최근)</th>
                    <th style={th}>매출 (과거→최근)</th>
                    <th style={th}>ROAS (과거→최근)</th>
                    <th style={{ ...th, textAlign: 'left' }}>진단</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groups.map(g => {
                    const cR = g.cur ? roasOf(g.cur) : null, bR = g.base ? roasOf(g.base) : null;
                    return (
                      <tr key={g.key}>
                        <td style={{ ...td, whiteSpace: 'normal', maxWidth: 260 }}>
                          <div style={{ fontWeight: 700, color: C.tx }}>{g.grp}</div>
                          <div style={{ fontSize: 10.5, color: C.txm }}>{g.camp}</div>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <div style={{ color: C.txd }}>{fmtWon(Math.round(g.base?.cost || 0))} → <b style={{ color: C.tx }}>{fmtWon(Math.round(g.cur?.cost || 0))}</b></div>
                          <div style={{ fontSize: 10.5 }}>{arrow(pct(g.cur?.cost || 0, g.base?.cost || 0))}</div>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <div style={{ color: C.txd }}>{fmtWon(Math.round(g.base?.rev || 0))} → <b style={{ color: C.tx }}>{fmtWon(Math.round(g.cur?.rev || 0))}</b></div>
                          <div style={{ fontSize: 10.5 }}>{arrow(pct(g.cur?.rev || 0, g.base?.rev || 0))}</div>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <div style={{ color: C.txd }}>{bR == null ? '—' : Math.round(bR) + '%'} → <b style={{ color: cR != null && bR != null && cR < bR ? C.no : C.tx }}>{cR == null ? '—' : Math.round(cR) + '%'}</b></div>
                        </td>
                        <td style={{ ...td, color: g.dx.c, fontWeight: 700, fontSize: 12 }}>{g.dx.t}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
