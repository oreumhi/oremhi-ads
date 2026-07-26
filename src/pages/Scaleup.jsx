// ============================================
// 스케일업 발굴 — "순위를 올리면 더 팔릴 것 같은" 파워링크 키워드를 찾습니다.
//   하락 진단의 반대편. 90일 동안 여러 주에 걸쳐 꾸준히 팔린 키워드만 올라옵니다.
//   · 한 주에만 몰린 것(우연히 한 번 터진 것)은 제외
//   · 자사·브랜드 키워드/캠페인/광고그룹은 제외
//   · "주당 몇 건 이상" 같은 조건은 두지 않습니다 (대표님 지시 2026-07-26)
// ============================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { C } from '../config';
import { fetchScaleupBrands, fetchScaleupKeywords } from '../store';
import { fmtWon, fmtNum, today } from '../utils';

const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const th = { textAlign: 'right', padding: '7px 9px', fontSize: 10.5, color: C.txm, fontWeight: 600, whiteSpace: 'nowrap' };
const td = { padding: '9px 9px', fontSize: 12.5, borderTop: `1px solid ${C.bd}`, whiteSpace: 'nowrap' };

const WEEKS = 13;                                   // 90일 ≈ 13주
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// 주별 판매 막대 — 팔린 주는 색이 차오르고, 안 팔린 주는 흐린 칸으로 남습니다
function WeekBars({ weekly }) {
  const map = {};
  (weekly || []).forEach(([w, c]) => { map[w] = c; });
  const max = Math.max(1, ...Object.values(map));
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 26 }}>
      {Array.from({ length: WEEKS }, (_, i) => {
        const v = map[i] || 0;
        const h = v === 0 ? 4 : 6 + Math.round((v / max) * 18);
        return (
          <div key={i} title={`${i + 1}주차 · ${v}건`}
            style={{
              width: 9, height: h, borderRadius: 2,
              background: v === 0 ? C.sf3 : C.ok,
              opacity: v === 0 ? 1 : 0.45 + 0.55 * (v / max),
            }} />
        );
      })}
    </div>
  );
}

export default function Scaleup({ allowedBrands }) {
  const [brands, setBrands] = useState([]);
  const [brand, setBrand] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const to = addDays(today(), -1);                  // 오늘은 수집 중이라 어제까지
  const from = addDays(to, -(WEEKS * 7 - 1));

  useEffect(() => {
    (async () => {
      const list = await fetchScaleupBrands();
      const vis = list.filter(b => !allowedBrands || allowedBrands.includes(b.brand));
      setBrands(vis);
      if (vis.length && !brand) setBrand(vis[0].brand);
    })();
  }, [allowedBrands]);   // eslint-disable-line

  const run = useCallback(async () => {
    if (!brand) return;
    setLoading(true);
    const res = await fetchScaleupKeywords(brand, from, to);
    setRows(res.rows); setFailed(!res.ok);
    setLoading(false);
  }, [brand, from, to]);
  useEffect(() => { run(); }, [run]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    conv: a.conv + Number(r.conv || 0),
    rev: a.rev + Number(r.revenue || 0),
    cost: a.cost + Number(r.cost || 0),
  }), { conv: 0, rev: 0, cost: 0 }), [rows]);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>📈 스케일업 발굴</div>
        <div style={{ fontSize: 12.5, color: C.txd, marginTop: 4 }}>
          90일 동안 <b>여러 주에 걸쳐 꾸준히 팔린</b> 파워링크 키워드입니다. 순위를 올리면 더 팔릴 가능성이 있는 자리입니다.
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={brand} onChange={e => setBrand(e.target.value)}
            style={{ background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, fontSize: 13, padding: '8px 12px', minWidth: 170 }}>
            {brands.length === 0 && <option value="">(키워드 데이터 없음)</option>}
            {brands.map(b => <option key={b.brand} value={b.brand}>{b.brand}</option>)}
          </select>
          <span style={{ fontSize: 12, color: C.txm }}>{from} ~ {to} · 13주</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.txd }}>
            후보 <b style={{ color: C.ok }}>{rows.length}</b>개 · 전환 {fmtNum(totals.conv)}건 · 매출 {fmtWon(totals.rev)}
          </span>
        </div>
      </div>

      {loading && <div style={{ ...card, color: C.txm, fontSize: 13 }}>찾는 중…</div>}

      {!loading && failed && (
        <div style={{ ...card, borderColor: C.no + '55', color: C.no, fontSize: 13 }}>
          ⚠ 조회에 실패했습니다. 잠시 후 다시 시도해주세요.
        </div>
      )}

      {!loading && !failed && rows.length === 0 && (
        <div style={{ ...card, color: C.txm, fontSize: 13, lineHeight: 1.7 }}>
          아직 후보가 없습니다.<br />
          90일치 키워드 데이터가 쌓이는 중이거나, 이 브랜드는 두 주 이상 반복해서 팔린 키워드가 없습니다.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>
            키워드 후보 <span style={{ fontSize: 11.5, color: C.txd, fontWeight: 400 }}>· 판매된 주가 많은 순</span>
          </div>
          <div style={{ fontSize: 11, color: C.txm, marginBottom: 10 }}>
            주별 막대는 13주 동안 주마다 몇 건 팔렸는지입니다 · 한 주에만 몰린 키워드와 자사·브랜드 키워드는 빠져 있습니다
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>키워드</th>
                  <th style={{ ...th, textAlign: 'left' }}>주별 판매 (13주)</th>
                  <th style={th}>판매 주</th>
                  <th style={th}>구매완료</th>
                  <th style={th}>매출</th>
                  <th style={th}>광고비</th>
                  <th style={th}>ROAS</th>
                  <th style={th}>클릭</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cost = Number(r.cost || 0), rev = Number(r.revenue || 0);
                  const roas = cost > 0 ? Math.round(rev / cost * 100) : 0;
                  return (
                    <tr key={i}>
                      <td style={{ ...td, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600 }}>{r.keyword}</div>
                        <div style={{ fontSize: 10.5, color: C.txm, marginTop: 2 }}>{r.campaign} · {r.adgroup}</div>
                      </td>
                      <td style={{ ...td, textAlign: 'left' }}><WeekBars weekly={r.weekly} /></td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: C.ok }}>{r.weeks_sold} / {WEEKS}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.conv)}건</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtWon(rev)}</td>
                      <td style={{ ...td, textAlign: 'right', color: C.txd }}>{fmtWon(cost)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{roas}%</td>
                      <td style={{ ...td, textAlign: 'right', color: C.txd }}>{fmtNum(r.clicks)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
