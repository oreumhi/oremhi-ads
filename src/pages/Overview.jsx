// ============================================
// 종합 요약 (브랜드 기준 · 광고매체 기준)
//
// 성과 보기(제품 단위 상세)와 달리,
// 브랜드/매체 단위로 크게 묶어 보는 일반적인 광고 대시보드.
// ============================================

import React, { useState, useMemo } from 'react';
import { C, RANGES, AD_TYPE_ORDER, AD_TYPE_COLORS } from '../config';
import PeriodPicker, { NaverCards } from '../components/PeriodPicker';
import { fmtWon, fmtNum, fmt, filterByRange, sumMetrics, calcCtr, calcCpa, calcRoas } from '../utils';
import TodayAlerts from '../components/TodayAlerts';

const th = { padding: '9px 12px', textAlign: 'right', fontSize: 11, color: '#8890a6', fontWeight: 700, borderBottom: '1px solid #282d40', whiteSpace: 'nowrap' };
const thL = { ...th, textAlign: 'left' };
const td = { padding: '8px 12px', borderBottom: '1px solid #282d4022', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap' };
const tdL = { ...td, textAlign: 'left' };

// GFA 세부 유형은 'GFA'로 묶어서 표시
const normType = (t) => (t || '').startsWith('GFA') ? 'GFA' : t;
const TYPE_ORDER = ['파워링크', '쇼핑검색', '브랜드검색', 'GFA'];
const typeRank = (t) => { const i = TYPE_ORDER.indexOf(t); return i === -1 ? 99 : i; };

// ─── 지표 행 (공용) ───
function Row({ label, color, rows, bold, indent }) {
  const m = sumMetrics(rows);
  const ctr = calcCtr(m.clicks, m.impressions);
  const cpa = calcCpa(m.cost, m.conversions);
  const roas = calcRoas(m.conv_revenue, m.cost);
  return (
    <tr style={{ background: bold ? C.sf2 : 'transparent' }}>
      <td style={{ ...tdL, fontWeight: bold ? 800 : 400, paddingLeft: indent ? 28 : 12 }}>
        <span style={{ color: color || C.tx }}>{label}</span>
      </td>
      <td style={td}>{fmtNum(m.impressions)}</td>
      <td style={td}><b>{fmtNum(m.clicks)}</b></td>
      <td style={{ ...td, color: Number(ctr) >= 3 ? C.ok : Number(ctr) < 1 ? C.no : C.tx }}>{ctr}%</td>
      <td style={{ ...td, color: C.warn, fontWeight: 600 }}>{fmtWon(m.cost)}</td>
      <td style={{ ...td, color: C.ok, fontWeight: 700 }}>{fmtNum(m.conversions)}</td>
      <td style={{ ...td, color: cpa > 20000 ? C.no : cpa > 10000 ? C.warn : C.ok }}>{cpa > 0 ? fmtWon(cpa) : '-'}</td>
      <td style={{ ...td, color: C.pink }}>{fmtWon(m.conv_revenue)}</td>
      <td style={{ ...td, fontWeight: 800, color: Number(roas) >= 300 ? C.ok : Number(roas) < 100 ? C.no : C.tx }}>{roas}%</td>
    </tr>
  );
}

const HeaderRow = () => (
  <thead>
    <tr style={{ background: C.sf2 }}>
      <th style={thL}>구분</th><th style={th}>노출수</th><th style={th}>클릭수</th><th style={th}>CTR</th>
      <th style={th}>광고비</th><th style={th}>전환수</th><th style={th}>CPA</th><th style={th}>매출</th><th style={th}>ROAS</th>
    </tr>
  </thead>
);

export default function Overview({ data, allowedBrands, changeRange, changeCustomRange, rangeLoading, currentUser }) {
  const { adData: adDataAll, mappings } = data;
  const [range, setRange] = useState(7);
  const [view, setView] = useState('brand'); // 'brand' | 'media'
  const [custom, setCustom] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const adData = useMemo(
    () => custom ? adDataAll.filter(r => r.date >= custom.from && r.date <= custom.to) : adDataAll,
    [adDataAll, custom]);

  const handleRangeChange = async (v) => {
    setCustom(null); setShowPicker(false);
    setRange(v);
    if (changeRange) await changeRange(v);
  };
  const applyCustom = async (from, to) => {
    setCustom({ from, to });
    setRange(0);
    if (changeCustomRange) await changeCustomRange(from, to);
  };
  const clearCustom = async () => { await handleRangeChange(7); };

  // ─── 브랜드 × 매체 데이터 구조화 ───
  const grouped = useMemo(() => {
    const mapByKey = {};
    mappings.forEach(m => { mapByKey[m.match_key] = m; });
    const filtered = filterByRange(adData, range);
    const byBrand = {};   // brand → type → rows
    const byType = {};    // type → brand → rows
    const all = [];
    filtered.forEach(row => {
      const mp = mapByKey[row.match_key];
      if (!mp) return;
      if (allowedBrands && !allowedBrands.includes(mp.brand)) return;
      const t = normType(mp.ad_type);
      ((byBrand[mp.brand] = byBrand[mp.brand] || {})[t] = byBrand[mp.brand][t] || []).push(row);
      ((byType[t] = byType[t] || {})[mp.brand] = byType[t][mp.brand] || []).push(row);
      all.push(row);
    });
    return { byBrand, byType, all };
  }, [adData, mappings, range, allowedBrands]);

  const brandNames = Object.keys(grouped.byBrand).sort();
  const typeNames = Object.keys(grouped.byType).sort((a, b) => typeRank(a) - typeRank(b));
  const total = sumMetrics(grouped.all);
  const totalRoas = calcRoas(total.conv_revenue, total.cost);
  const brandColors = ['#5b8def', '#3dd9a0', '#f5a445', '#ed6ea0', '#9d7ff0', '#45c8dc', '#f0c746'];

  return (
    <div>
      {/* 헤더 + 기간 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>종합 요약</h2>
          <div style={{ fontSize: 12, color: C.txd, marginTop: 2 }}>브랜드 · 광고매체 기준으로 크게 보기</div>
        </div>
        <div style={{ display: 'flex', gap: 3, background: C.sf, borderRadius: 10, padding: 3, border: `1px solid ${C.bd}` }}>
          {RANGES.map(r => (
            <button key={r.value} onClick={() => handleRangeChange(r.value)} style={{
              padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: !custom && range === r.value ? 600 : 400,
              background: !custom && range === r.value ? C.ac : 'transparent',
              color: !custom && range === r.value ? '#fff' : C.txd,
            }}>{r.label}</button>
          ))}
          <button onClick={() => setShowPicker(s => !s)} style={{
            padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: custom ? 700 : 400,
            background: custom ? C.ac : 'transparent', color: custom ? '#fff' : C.txd,
          }}>📅 기간 지정</button>
        </div>
      </div>

      {(showPicker || custom) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: C.txd, fontWeight: 600 }}>기간 지정</span>
          <PeriodPicker value={custom} onApply={applyCustom} onClear={clearCustom} />
          {custom && <span style={{ fontSize: 11, color: C.txm }}>{custom.from} ~ {custom.to}</span>}
        </div>
      )}

      {custom && (
        <NaverCards items={[
          { label: '총광고비', value: total.cost, unit: '원', color: '#f5a445', sub: `${custom.from} ~ ${custom.to}` },
          { label: '구매전환매출액', value: total.conv_revenue, unit: '원', color: '#5b8def', sub: `ROAS ${Math.round(totalRoas)}%` },
        ]} />
      )}

      {/* 오늘 챙길 것 (이상 감지 알림) */}
      <TodayAlerts currentUser={currentUser} allowedBrands={allowedBrands} />

      {/* 전체 요약 카드 */}
      <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
        {[
          { label: '총 광고비', value: fmtWon(total.cost), color: C.warn },
          { label: '총 매출', value: fmtWon(total.conv_revenue), color: C.pink },
          { label: '전체 ROAS', value: totalRoas + '%', color: Number(totalRoas) >= 300 ? C.ok : Number(totalRoas) < 100 ? C.no : C.tx },
          { label: '총 클릭수', value: fmtNum(total.clicks), color: C.ac },
          { label: '총 전환수', value: fmt(total.conversions), color: C.ok },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.txd, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* 보기 전환 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['brand', '🏷️ 브랜드 기준'], ['media', '📡 광고매체 기준']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
            fontWeight: view === v ? 700 : 400,
            background: view === v ? C.ac : C.sf,
            color: view === v ? '#fff' : C.txd,
            border: `1px solid ${view === v ? C.ac : C.bd}`,
          }}>{label}</button>
        ))}
      </div>

      {rangeLoading && <div style={{ fontSize: 12, color: C.ac, marginBottom: 10 }}>⏳ 데이터 불러오는 중...</div>}

      {grouped.all.length === 0 && (
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 40, textAlign: 'center', color: C.txd, fontSize: 13 }}>
          선택한 기간에 표시할 데이터가 없습니다
        </div>
      )}

      {/* ─── 브랜드 기준 ─── */}
      {view === 'brand' && brandNames.map((b, i) => {
        const types = grouped.byBrand[b];
        const allRows = Object.values(types).flat();
        const sorted = Object.keys(types).sort((x, y) => typeRank(x) - typeRank(y));
        const color = brandColors[i % brandColors.length];
        return (
          <div key={b} style={{ marginBottom: 18 }}>
            <div style={{ background: color + '12', border: `1px solid ${color}33`, borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color }}>{b}</span>
            </div>
            <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <HeaderRow />
                <tbody>
                  {sorted.map(t => (
                    <Row key={t} label={t} color={AD_TYPE_COLORS[t] || C.txd} rows={types[t]} indent />
                  ))}
                  <Row label={`${b} 전체`} rows={allRows} bold />
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* ─── 광고매체 기준 ─── */}
      {view === 'media' && typeNames.map(t => {
        const brands = grouped.byType[t];
        const allRows = Object.values(brands).flat();
        const color = AD_TYPE_COLORS[t] || C.txd;
        return (
          <div key={t} style={{ marginBottom: 18 }}>
            <div style={{ background: color + '12', border: `1px solid ${color}33`, borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color }}>{t}</span>
            </div>
            <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <HeaderRow />
                <tbody>
                  {Object.keys(brands).sort().map(b => (
                    <Row key={b} label={b} rows={brands[b]} indent />
                  ))}
                  <Row label={`${t} 전체`} rows={allRows} bold color={color} />
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
