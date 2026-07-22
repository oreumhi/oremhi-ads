// ============================================
// 순위 체크 (adrank)
//   관리자: 대상(브랜드/제품/키워드) 관리 + 담당자 지정 + 전체 순위
//   직원  : 본인 담당 순위 확인
//   실제 수집은 각 직원 PC의 "순위체크" 프로그램이 수행 → 여기서 결과만 확인
// ============================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { C } from '../config';
import { fetchUsers } from '../store';
import StaffManager from '../components/StaffManager';
import {
  fetchRankProducts, addRankProduct, deleteRankProduct, setRankOwner, updateRankProduct,
  fetchRankHistory,
} from '../rank';

const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: C.txd, borderBottom: `1px solid ${C.bd}`, whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: 13, borderBottom: `1px solid ${C.bd}22` };
const btn = { background: C.ac, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnGhost = { background: 'none', border: `1px solid ${C.bd}`, borderRadius: 6, padding: '4px 10px', color: C.txd, cursor: 'pointer', fontSize: 11 };
const selStyle = { background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 6, color: C.tx, fontSize: 12, padding: '5px 8px' };
const inp = { ...selStyle, padding: '6px 8px' };

const csv = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);

// 순위 색상 (1~3 초록, 4~10 노랑, 그 외 회색, 미노출 빨강)
const rankColor = (r) => r == null ? C.no : r <= 3 ? C.ok : r <= 10 ? C.warn : C.txd;
const rankText = (r) => r == null ? '미노출' : `${r}위`;

// history(최신순) → key별 최신/이전 순위
function latestByKey(history) {
  const map = {};
  for (const h of history) {
    const k = `${h.brand}|${h.product}|${h.keyword}|${h.ad_type}`;
    if (!map[k]) map[k] = { ...h, prev: undefined };
    else if (map[k].prev === undefined) map[k].prev = h.rank;
  }
  return map;
}

function RankResultsTable({ history, showStaff }) {
  const map = latestByKey(history);
  const rows = Object.values(map).sort((a, b) =>
    (a.brand + a.product + a.keyword).localeCompare(b.brand + b.product + b.keyword));
  if (rows.length === 0) return <div style={{ fontSize: 13, color: C.txm, padding: 8 }}>아직 수집된 순위가 없습니다. 직원 PC에서 순위체크를 실행하면 여기에 표시됩니다.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          {showStaff && <th style={th}>담당</th>}
          <th style={th}>브랜드</th><th style={th}>제품</th><th style={th}>구분</th>
          <th style={th}>키워드</th><th style={th}>순위</th><th style={th}>변동</th><th style={th}>수집시각</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const diff = (r.prev != null && r.rank != null) ? r.prev - r.rank : null;
            return (
              <tr key={i}>
                {showStaff && <td style={{ ...td, color: C.txd }}>{r.staff_name || '-'}</td>}
                <td style={{ ...td, fontWeight: 600 }}>{r.brand}</td>
                <td style={td}>{r.product}</td>
                <td style={{ ...td, fontSize: 12 }}>{r.ad_type === 'shopping' ? '쇼핑' : '파워링크'}</td>
                <td style={{ ...td, color: C.txd }}>{r.keyword}</td>
                <td style={{ ...td, fontWeight: 800, color: rankColor(r.rank) }}>{rankText(r.rank)}</td>
                <td style={{ ...td, fontSize: 12 }}>
                  {diff == null ? '-' : diff === 0 ? '─' : diff > 0
                    ? <span style={{ color: C.ok }}>▲{diff}</span>
                    : <span style={{ color: C.no }}>▼{-diff}</span>}
                </td>
                <td style={{ ...td, fontSize: 11, color: C.txm }}>{(r.collected_at || '').replace('T', ' ').slice(0, 16)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── 순위 추이 그래프 (과거 → 현재) ───
const TREND_COLORS = ['#5b8def', '#3dd9a0', '#f5a445', '#ed6ea0', '#9d7ff0', '#45c8dc', '#f0c746', '#f07070', '#8fd14f', '#c9a227'];
const isShopT = (t) => t === 'shopping' || t === '쇼핑';

function RankTrendChart({ history }) {
  const [adType, setAdType] = useState('shopping');
  const [brand, setBrand] = useState('전체');
  const [days, setDays] = useState(30);

  const brands = useMemo(() => [...new Set(history.map(h => h.brand).filter(Boolean))].sort(), [history]);

  const { dates, series, maxR } = useMemo(() => {
    const today = new Date();
    const ds = Array.from({ length: days }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (days - 1 - i));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const idx = Object.fromEntries(ds.map((d, i) => [d, i]));
    const byKey = {};
    let mr = 5;
    history.forEach(h => {
      if (adType === 'shopping' ? !isShopT(h.ad_type) : isShopT(h.ad_type)) return;
      if (brand !== '전체' && h.brand !== brand) return;
      const day = (h.collected_at || '').slice(0, 10);
      if (!(day in idx)) return;
      const k = `${h.brand}·${h.product || ''}·${h.keyword}`;
      const s = (byKey[k] = byKey[k] || { label: k, vals: Array(days).fill(undefined) });
      if (s.vals[idx[day]] === undefined) {   // history는 최신순 → 하루 중 최신값 유지
        s.vals[idx[day]] = h.rank;            // null = 미노출
        if (h.rank != null) mr = Math.max(mr, h.rank);
      }
    });
    return { dates: ds, series: Object.values(byKey), maxR: Math.min(Math.max(mr, 5), 20) };
  }, [history, adType, brand, days]);

  const [focus, setFocus] = useState(null);   // 범례 클릭 시 해당 선만 강조

  const W = 780, H = 280, PL = 46, PR = 16, PT = 18, PB = 30;
  const iw = W - PL - PR, ihAll = H - PT - PB, missBand = 34, ih = ihAll - missBand;
  const xAt = (i) => dates.length <= 1 ? PL + iw / 2 : PL + i / (dates.length - 1) * iw;
  const yAt = (r) => r == null ? PT + ih + missBand - 10 : PT + (Math.min(r, maxR) - 1) / Math.max(1, maxR - 1) * ih;

  // 부드러운 곡선 경로 (Catmull-Rom → Bezier)
  const smooth = (pts) => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  };

  const gridRanks = [...new Set([1, Math.ceil((maxR + 1) / 2), maxR])];
  const hasData = series.some(s => s.vals.some(v => v !== undefined));

  const tabBtn = (on) => ({ ...btnGhost, padding: '5px 13px', fontSize: 12, borderRadius: 999,
    background: on ? C.ac : 'transparent', color: on ? '#fff' : C.txd, borderColor: on ? C.ac : C.bd, fontWeight: on ? 700 : 400, transition: 'all .15s' });

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>📈 순위 추이 <span style={{ fontSize: 12, color: C.txd, fontWeight: 400 }}>— 위쪽일수록 상위 노출</span></div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[['shopping', '쇼핑'], ['powerlink', '파워링크']].map(([k, l]) =>
            <button key={k} style={tabBtn(adType === k)} onClick={() => { setAdType(k); setFocus(null); }}>{l}</button>)}
          <span style={{ width: 8 }} />
          {[7, 30, 90].map(d => <button key={d} style={tabBtn(days === d)} onClick={() => setDays(d)}>{d}일</button>)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        {['전체', ...brands].map(b => <button key={b} style={tabBtn(brand === b)} onClick={() => { setBrand(b); setFocus(null); }}>{b}</button>)}
      </div>

      {!hasData ? (
        <div style={{ fontSize: 13, color: C.txm, padding: 24, textAlign: 'center' }}>이 조건의 추이 데이터가 아직 없습니다. 매일 새벽 수집이 쌓이면 선이 그려집니다.</div>
      ) : (
        <>
          <div style={{ background: 'linear-gradient(180deg, rgba(91,141,239,0.05), rgba(0,0,0,0.12))', border: `1px solid ${C.bd}`, borderRadius: 14, padding: '8px 6px 2px' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              <defs>
                <filter id="rkGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="2.4" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <linearGradient id="rkMiss" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(240,112,112,0)" />
                  <stop offset="100%" stopColor="rgba(240,112,112,0.14)" />
                </linearGradient>
              </defs>

              {/* 미노출 존 */}
              <rect x={PL - 6} y={PT + ih + 8} width={iw + 12} height={missBand - 6} rx="6" fill="url(#rkMiss)" />
              <text x={W - PR - 4} y={PT + ih + missBand - 12} fontSize="10.5" fill={C.no} textAnchor="end" opacity="0.85" fontWeight="700">미노출</text>

              {/* 그리드 */}
              {gridRanks.map(r => (
                <g key={r}>
                  <line x1={PL} y1={yAt(r)} x2={W - PR} y2={yAt(r)} stroke={C.bd} strokeWidth="1" opacity="0.55" />
                  <text x={PL - 10} y={yAt(r) + 4} fontSize="11" fill={C.txd} textAnchor="end" fontWeight="600">{r}위</text>
                </g>
              ))}

              {/* 선 (부드러운 곡선 + 글로우) */}
              {series.map((s, si) => {
                const color = TREND_COLORS[si % TREND_COLORS.length];
                const dim = focus !== null && focus !== s.label;
                const hi = focus === s.label;
                const segs = [];
                let cur = [];
                s.vals.forEach((v, i) => {
                  if (v === undefined) { if (cur.length) segs.push(cur); cur = []; }
                  else cur.push([xAt(i), yAt(v), v, i]);
                });
                if (cur.length) segs.push(cur);
                const allPts = segs.flat();
                const last = allPts[allPts.length - 1];
                return (
                  <g key={s.label} opacity={dim ? 0.12 : 1} style={{ transition: 'opacity .2s' }}>
                    {segs.map((sg, gi) => sg.length > 1 && (
                      <path key={gi} d={smooth(sg)} fill="none" stroke={color}
                        strokeWidth={hi ? 3.2 : 2.2} strokeLinecap="round"
                        filter={hi ? 'url(#rkGlow)' : undefined} opacity={hi ? 1 : 0.85} />
                    ))}
                    {allPts.map(([px, py, v], pi) => v == null
                      ? <circle key={pi} cx={px} cy={py} r="3.2" fill={C.bg} stroke={C.no} strokeWidth="1.6"><title>{s.label} · {dates[allPts[pi][3]]} · 미노출</title></circle>
                      : <circle key={pi} cx={px} cy={py} r={hi ? 3.4 : 2.6} fill={color} opacity="0.95"><title>{s.label} · {dates[allPts[pi][3]]} · {v}위</title></circle>)}
                    {/* 끝점 배지: 현재 순위 */}
                    {last && (
                      <g filter={hi ? 'url(#rkGlow)' : undefined}>
                        <circle cx={last[0]} cy={last[1]} r="5" fill={C.bg} stroke={color} strokeWidth="2.2" />
                        <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* X축 날짜 */}
              {[0, Math.floor((dates.length - 1) / 2), dates.length - 1].map(i => (
                <text key={i} x={xAt(i)} y={H - 10} fontSize="10.5" fill={C.txm} textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}>
                  {dates[i].slice(5).replace('-', '.')}</text>
              ))}
            </svg>
          </div>

          {/* 범례: 클릭하면 그 선만 강조 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {series.map((s, si) => {
              const color = TREND_COLORS[si % TREND_COLORS.length];
              const on = focus === s.label;
              const lastV = [...s.vals].reverse().find(v => v !== undefined);
              return (
                <button key={s.label} onClick={() => setFocus(on ? null : s.label)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                    fontSize: 11.5, border: `1px solid ${on ? color : C.bd}`, background: on ? color + '1c' : 'transparent',
                    color: on ? C.tx : C.txd, opacity: focus !== null && !on ? 0.45 : 1, transition: 'all .15s' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: color, boxShadow: on ? `0 0 6px ${color}` : 'none' }} />
                  {s.label}
                  <b style={{ color: lastV == null ? C.no : color }}>{lastV == null ? '미노출' : lastV + '위'}</b>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: C.txm, marginTop: 8 }}>범례를 누르면 해당 광고만 강조됩니다 · 점 위에 마우스를 올리면 날짜·순위가 보입니다 · 선이 끊긴 곳은 수집 없는 날</div>
        </>
      )}
    </div>
  );
}

// ─── 관리자: 대상 관리 ───
function TargetManager({ staff, onChanged }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState('');
  const [nf, setNf] = useState({ brand: '', domain: '', product: '', ad_titles: '', shopping: '', powerlink: '' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => { setItems(await fetchRankProducts()); }, []);
  useEffect(() => { load(); }, [load]);

  const assign = async (it, ownerId) => {
    setBusy(it.id);
    const p = (staff || []).find(u => u.id === ownerId);
    await setRankOwner(it.id, ownerId || null, p ? p.name : null);
    await load(); onChanged && onChanged(); setBusy('');
  };
  const toggle = async (it) => { setBusy(it.id); await updateRankProduct(it.id, { active: !it.active }); await load(); setBusy(''); };
  const remove = async (it) => {
    if (!window.confirm(`"${it.brand} > ${it.product}" 순위 대상을 삭제할까요?`)) return;
    setBusy(it.id); await deleteRankProduct(it.id); await load(); onChanged && onChanged(); setBusy('');
  };
  const add = async () => {
    if (!nf.brand.trim()) return setMsg('❌ 브랜드명을 입력하세요');
    if (!csv(nf.shopping).length && !csv(nf.powerlink).length) return setMsg('❌ 키워드를 하나 이상 입력하세요');
    setMsg('추가 중...');
    const r = await addRankProduct({
      brand: nf.brand.trim(), domain: nf.domain.trim(), product: nf.product.trim(),
      ad_titles: csv(nf.ad_titles), shopping_keywords: csv(nf.shopping), powerlink_keywords: csv(nf.powerlink),
    });
    if (r.ok) { setNf({ brand: '', domain: '', product: '', ad_titles: '', shopping: '', powerlink: '' }); setMsg('✅ 대상이 추가되었습니다'); await load(); onChanged && onChanged(); }
    else setMsg('❌ ' + r.msg);
  };

  const unassigned = items.filter(x => x.active && !x.owner_id).length;

  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>순위 체크 대상 · 담당자 지정</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 10 }}>
        브랜드·제품·키워드를 등록하고 담당 직원을 지정하면, 그 직원 PC에서 자동으로 순위를 수집합니다.
        {unassigned > 0 && <span style={{ color: C.warn, fontWeight: 700 }}> · 담당자 미지정 {unassigned}개</span>}
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>브랜드</th><th style={th}>제품</th><th style={th}>쇼핑 키워드</th><th style={th}>파워링크 키워드</th>
            <th style={th}>담당 직원</th><th style={th}>수집</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} style={{ opacity: it.active ? 1 : 0.45 }}>
                <td style={{ ...td, fontWeight: 600 }}>{it.brand}</td>
                <td style={td}>{it.product}</td>
                <td style={{ ...td, fontSize: 12, color: C.txd }}>{arr(it.shopping_keywords).join(', ') || '-'}</td>
                <td style={{ ...td, fontSize: 12, color: C.txd }}>{arr(it.powerlink_keywords).join(', ') || '-'}</td>
                <td style={td}>
                  <select style={selStyle} disabled={busy === it.id} value={it.owner_id || ''} onChange={e => assign(it, e.target.value)}>
                    <option value="">— 미지정 —</option>
                    {(staff || []).map(u => <option key={u.id} value={u.id}>{u.name}{u.role === 'admin' ? ' (대표)' : ''}</option>)}
                  </select>
                </td>
                <td style={td}><button style={{ ...btnGhost, color: it.active ? C.ok : C.no }} onClick={() => toggle(it)}>{it.active ? '수집중' : '제외됨'}</button></td>
                <td style={td}><button style={{ ...btnGhost, color: C.no }} onClick={() => remove(it)}>삭제</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} style={{ ...td, color: C.txm }}>등록된 대상이 없습니다. 아래에서 추가하세요.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* 추가 폼 */}
      <div style={{ background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>대상 추가</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <input placeholder="브랜드 (예: 모그라미)" value={nf.brand} onChange={e => setNf({ ...nf, brand: e.target.value })} style={{ ...inp, width: 130 }} />
          <input placeholder="도메인 (brand.naver.com/…)" value={nf.domain} onChange={e => setNf({ ...nf, domain: e.target.value })} style={{ ...inp, width: 190 }} />
          <input placeholder="제품 (예: 베이직)" value={nf.product} onChange={e => setNf({ ...nf, product: e.target.value })} style={{ ...inp, width: 120 }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <input placeholder="쇼핑 키워드 (쉼표로 구분)" value={nf.shopping} onChange={e => setNf({ ...nf, shopping: e.target.value })} style={{ ...inp, width: 220 }} />
          <input placeholder="파워링크 키워드 (쉼표로 구분)" value={nf.powerlink} onChange={e => setNf({ ...nf, powerlink: e.target.value })} style={{ ...inp, width: 220 }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <input placeholder="쇼핑광고 제목(정확일치용, 쉼표로 구분) — 선택" value={nf.ad_titles} onChange={e => setNf({ ...nf, ad_titles: e.target.value })} style={{ ...inp, width: 360 }} />
          <button style={btn} onClick={add}>대상 추가</button>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✅') ? C.ok : msg.startsWith('❌') ? C.no : C.txd }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

export default function RankCheck({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const [history, setHistory] = useState([]);
  const [staff, setStaff] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 90 * 864e5).toISOString();   // 추이 그래프 최대 90일
    const [h, users] = await Promise.all([
      fetchRankHistory(isAdmin ? null : currentUser.id, since),
      isAdmin ? fetchUsers() : Promise.resolve([]),
    ]);
    setHistory(h);
    setStaff((users || []).filter(u => u.role === 'staff'));
    // 담당 지정 후보 = 관리자(대표) + 직원 (계정 관리 패널에는 직원만)
    setAssignees((users || []).filter(u => u.role === 'admin' || u.role === 'staff')
      .sort((a, b) => (a.role === 'admin' ? -1 : 1) - (b.role === 'admin' ? -1 : 1)));
    setLoading(false);
  }, [isAdmin, currentUser]);
  useEffect(() => { load(); }, [load]);

  const lastCollected = history[0]?.collected_at ? history[0].collected_at.replace('T', ' ').slice(0, 16) : '아직 없음';

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>순위 체크</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 16 }}>
        {isAdmin ? '네이버 쇼핑광고·파워링크 순위를 직원별로 수집해 한 화면에서 봅니다' : '내 담당 브랜드의 광고 순위를 확인합니다'}
        <span style={{ marginLeft: 10, color: C.txm }}>· 마지막 수집: {lastCollected}</span>
      </div>

      {isAdmin && <StaffManager staff={staff} onChanged={load} />}
      {isAdmin && <TargetManager staff={assignees} onChanged={load} />}

      {!loading && <RankTrendChart history={history} />}

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{isAdmin ? '최신 순위 (전체)' : '내 최신 순위'}</div>
        {loading ? <div style={{ fontSize: 13, color: C.txm }}>불러오는 중…</div>
          : <RankResultsTable history={history} showStaff={isAdmin} />}
      </div>
    </div>
  );
}
