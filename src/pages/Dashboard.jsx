// ============================================
// 대시보드 v3
//
// 기능:
//   1. 정렬: 헤더 클릭 → 오름차순/내림차순
//   2. 그래프 필터: 원하는 그래프만 보기
//   3. 숫자 표기: 쉼표 구분 (utils.js에서 처리)
//   4. 경고 알림: ROAS/광고비/매출 조건 + 추세 역행
//   + 브랜드 선택, 접기/펼치기, allowedBrands
// ============================================

import React, { useState, useMemo } from 'react';
import { C, RANGES, AD_TYPE_ORDER, AD_TYPE_COLORS } from '../config';
import { fmt, fmtWon, fmtNum, filterByRange, aggregateByDate, sumMetrics, calcCtr, calcCpa, calcRoas } from '../utils';
import { Sparkline } from '../components/Sparkline';

// ─── 그래프 설정 ───
const GRAPH_OPTIONS = [
  { key: 'impressions', label: '노출', color: '#45c8dc' },
  { key: 'clicks',      label: '클릭', color: '#5b8def' },
  { key: 'ctr',         label: '클릭률', color: '#f0c746' },
  { key: 'conversions', label: '전환', color: '#3dd9a0' },
  { key: 'cost',        label: '광고비', color: '#f5a445' },
  { key: 'revenue',     label: '매출', color: '#ed6ea0' },
  { key: 'roas',        label: 'ROAS', color: '#9d7ff0' },
];

// ─── 정렬 가능한 숫자 컬럼 ───
const SORT_KEYS = {
  impressions: '노출수',
  clicks: '클릭수',
  ctr: 'CTR',
  cost: '광고비',
  conversions: '전환수',
  cpa: 'CPA',
  roas: 'ROAS',
};

// ─── 지표 값 계산 (정렬용) ───
function getMetricValue(items, key) {
  const m = sumMetrics(items);
  switch (key) {
    case 'impressions': return m.impressions;
    case 'clicks': return m.clicks;
    case 'ctr': return m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
    case 'cost': return m.cost;
    case 'conversions': return m.conversions;
    case 'cpa': return m.conversions > 0 ? m.cost / m.conversions : Infinity;
    case 'roas': return m.cost > 0 ? (m.conv_revenue / m.cost) * 100 : 0;
    default: return 0;
  }
}

export default function Dashboard({ data, allowedBrands, changeRange }) {
  const { adData, mappings } = data;
  const [range, setRange] = useState(7);
  const [selectedBrand, setSelectedBrand] = useState('전체');
  const [expanded, setExpanded] = useState({});

  // ─── 정렬 상태 (#1) ───
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  // ─── 그래프 필터 상태 (#2) ───
  const [visibleGraphs, setVisibleGraphs] = useState({
    impressions: true, clicks: true, ctr: true, conversions: true,
    cost: true, revenue: true, roas: true,
  });

  // ─── 경고 조건 상태 (#4) ───
  const [warningConfig, setWarningConfig] = useState({
    roasEnabled: true, roasThreshold: 100,
    costEnabled: true, costThreshold: 50000,
    revenueEnabled: false, revenueThreshold: 100000,
  });
  const [showWarningPanel, setShowWarningPanel] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false);

  const toggleExpand = (key) => { setExpanded(prev => ({ ...prev, [key]: !prev[key] })); };

  // 기간 변경 시 서버에서 해당 기간 데이터 로드
  const handleRangeChange = async (newRange) => {
    setRange(newRange);
    if (changeRange) {
      setRangeLoading(true);
      await changeRange(newRange);
      setRangeLoading(false);
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); }
    else { setSortKey(key); setSortDir('desc'); }
  };

  const toggleGraph = (key) => {
    setVisibleGraphs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ─── 경고 체크 함수 ───
  function checkWarning(metrics) {
    const conditions = [];
    if (warningConfig.roasEnabled) {
      const roas = metrics.cost > 0 ? (metrics.conv_revenue / metrics.cost) * 100 : 0;
      conditions.push(roas < warningConfig.roasThreshold);
    }
    if (warningConfig.costEnabled) {
      conditions.push(metrics.cost >= warningConfig.costThreshold);
    }
    if (warningConfig.revenueEnabled) {
      conditions.push(metrics.conv_revenue < warningConfig.revenueThreshold);
    }
    if (conditions.length === 0) return false;
    return conditions.every(c => c);
  }

  // ─── 데이터 구조화 ───
  const structured = useMemo(() => {
    const mapByKey = {};
    mappings.forEach(m => { mapByKey[m.match_key] = m; });
    const filtered = filterByRange(adData, range);
    const brands = {};
    const unmapped = [];
    filtered.forEach(row => {
      const mapping = mapByKey[row.match_key];
      if (!mapping) { unmapped.push(row); return; }
      const { brand, product, ad_type: rawAdType, label } = mapping;
      const ad_type = rawAdType.startsWith('GFA') ? 'GFA' : rawAdType;
      if (!brands[brand]) brands[brand] = {};
      if (!brands[brand][product]) brands[brand][product] = {};
      if (!brands[brand][product][ad_type]) brands[brand][product][ad_type] = {};
      if (!brands[brand][product][ad_type][row.match_key]) {
        brands[brand][product][ad_type][row.match_key] = { label: label || row.group_name || row.material_id || '-', rows: [] };
      }
      brands[brand][product][ad_type][row.match_key].rows.push(row);
    });
    return { brands, unmapped };
  }, [adData, mappings, range]);

// 스타일 상수
const th = { padding: '9px 12px', textAlign: 'left', fontSize: 11, color: '#8890a6', fontWeight: 700, borderBottom: '1px solid #282d40', whiteSpace: 'nowrap' };
const thR = { ...th, textAlign: 'right' };
const thC = { ...th, textAlign: 'center' };
const tdR = { padding: '8px 12px', borderBottom: '1px solid #282d40', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap' };
const tdC = { padding: '6px 8px', borderBottom: '1px solid #282d40', textAlign: 'center', whiteSpace: 'nowrap' };
const numInp = { background: '#1a1e2c', border: '1px solid #282d40', borderRadius: 6, padding: '4px 8px', color: '#e4e7ed', fontSize: 12, outline: 'none', width: 80, textAlign: 'right' };

// ─── 지표 행 렌더 (React.memo 최적화) ───
const MemoMetricRow = React.memo(function MetricRow({ label, items, isSubtotal, isTotal, onClick, clickable, visibleGraphs, checkWarning }) {
    const metrics = sumMetrics(items);
    const daily = aggregateByDate(items);
    const ctr = calcCtr(metrics.clicks, metrics.impressions);
    const cpa = calcCpa(metrics.cost, metrics.conversions);
    const roas = calcRoas(metrics.conv_revenue, metrics.cost);

    // 경고 체크 (소계/합계에는 적용 안 함, 설정 조건만 적용)
    const isWarn = !isSubtotal && !isTotal && checkWarning(metrics);
    const showAlert = isWarn;

    const bg = showAlert ? C.no + '12' : (isTotal ? C.sf3 : isSubtotal ? C.sf2 : 'transparent');
    const fw = isSubtotal || isTotal ? 700 : 400;
    const prefix = isTotal ? '▶▶ ' : isSubtotal ? '▶ ' : '';

    // 그래프 데이터
    const graphData = {
      impressions: daily.map(d => d.impressions),
      clicks: daily.map(d => d.clicks),
      ctr: daily.map(d => d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0),
      conversions: daily.map(d => d.conversions),
      cost: daily.map(d => d.cost),
      revenue: daily.map(d => d.conv_revenue),
      roas: daily.map(d => d.cost > 0 ? (d.conv_revenue / d.cost) * 100 : 0),
    };

    return (
      <tr style={{ background: bg, cursor: clickable ? 'pointer' : 'default', borderLeft: showAlert ? `3px solid ${C.no}` : 'none' }} onClick={onClick || undefined}>
        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.bd}`, fontSize: 12.5, fontWeight: fw, color: isTotal ? C.tx : isSubtotal ? C.txd : C.tx, whiteSpace: 'nowrap' }}>
          {showAlert && <span style={{ marginRight: 4 }} title="경고 조건 해당">⚠️</span>}
          {clickable && <span style={{ fontSize: 10, marginRight: 4, color: C.txm }}>▼</span>}
          {prefix}{label}
        </td>
        <td style={tdR}>{fmtNum(metrics.impressions)}</td>
        <td style={tdR}><b>{fmtNum(metrics.clicks)}</b></td>
        <td style={{ ...tdR, color: Number(ctr) >= 3 ? C.ok : Number(ctr) < 1 ? C.no : C.tx }}>{ctr}%</td>
        <td style={{ ...tdR, color: C.warn, fontWeight: 600 }}>{fmtWon(metrics.cost)}</td>
        <td style={{ ...tdR, color: C.ok, fontWeight: 700 }}>{fmtNum(metrics.conversions)}</td>
        <td style={{ ...tdR, color: cpa > 20000 ? C.no : cpa > 10000 ? C.warn : C.ok }}>{cpa > 0 ? fmtWon(cpa) : '-'}</td>
        <td style={{ ...tdR, color: Number(roas) >= 300 ? C.ok : Number(roas) < 100 ? C.no : C.tx }}>{roas}%</td>
        {GRAPH_OPTIONS.map(g => visibleGraphs[g.key] && (
          <td key={g.key} style={tdC}><Sparkline data={graphData[g.key]} color={g.color} /></td>
        ))}
      </tr>
    );
  });

  // ─── 테이블 헤더 (정렬 클릭 + 그래프 필터) ───
  const Header = () => (
    <thead>
      <tr style={{ background: C.sf2 }}>
        <th style={th}>광고</th>
        {Object.entries(SORT_KEYS).map(([key, label]) => (
          <th key={key} style={{ ...thR, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort(key)}>
            {label}
            {sortKey === key && <span style={{ marginLeft: 3, fontSize: 9 }}>{sortDir === 'desc' ? '▼' : '▲'}</span>}
          </th>
        ))}
        {GRAPH_OPTIONS.map(g => visibleGraphs[g.key] && (
          <th key={g.key} style={thC}>{g.label} 추이</th>
        ))}
      </tr>
    </thead>
  );

  const rawBrandNames = Object.keys(structured.brands).sort();
  const allBrandNames = allowedBrands ? rawBrandNames.filter(b => allowedBrands.includes(b)) : rawBrandNames;
  const brandNames = selectedBrand === '전체' ? allBrandNames : allBrandNames.filter(b => b === selectedBrand);
  const brandColors = ['#5b8def', '#3dd9a0', '#f5a445', '#ed6ea0', '#9d7ff0', '#45c8dc', '#f0c746'];

  const hasData = adData.length > 0;
  const hasMappings = mappings.length > 0;
  const visibleGraphCount = Object.values(visibleGraphs).filter(Boolean).length;
  const tableMinWidth = 700 + visibleGraphCount * 160;

  // 마지막 보고서 업로드 일시
  const lastUploadDate = useMemo(() => {
    if (adData.length === 0) return null;
    let latest = '';
    for (const item of adData) {
      if (item.created_at && item.created_at > latest) latest = item.created_at;
    }
    if (!latest) return null;
    const d = new Date(latest);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  }, [adData]);

  return (
    <div>
      {/* 헤더 + 기간 선택 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>광고 성과 대시보드</h2>
          <div style={{ fontSize: 12, color: C.txd, marginTop: 2 }}>
            모든 브랜드 · 모든 제품 · 모든 광고 한눈에
            {lastUploadDate && <span style={{ marginLeft: 12, color: C.txm, fontSize: 11 }}>마지막 업로드: {lastUploadDate}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, background: C.sf, borderRadius: 10, padding: 3, border: `1px solid ${C.bd}` }}>
          {RANGES.map(r => (
            <button key={r.value} onClick={() => handleRangeChange(r.value)} style={{
              padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: range === r.value ? 600 : 400,
              background: range === r.value ? C.ac : 'transparent',
              color: range === r.value ? '#fff' : C.txd,
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* 브랜드 선택 */}
      {allBrandNames.length > 1 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setSelectedBrand('전체')} style={{
            padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
            fontWeight: selectedBrand === '전체' ? 700 : 400,
            background: selectedBrand === '전체' ? C.ac : C.sf,
            color: selectedBrand === '전체' ? '#fff' : C.txd,
            border: `1px solid ${selectedBrand === '전체' ? C.ac : C.bd}`,
          }}>전체</button>
          {allBrandNames.map((b, i) => (
            <button key={b} onClick={() => setSelectedBrand(b)} style={{
              padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
              fontWeight: selectedBrand === b ? 700 : 400,
              background: selectedBrand === b ? brandColors[i % brandColors.length] + '22' : C.sf,
              color: selectedBrand === b ? brandColors[i % brandColors.length] : C.txd,
              border: `1px solid ${selectedBrand === b ? brandColors[i % brandColors.length] + '55' : C.bd}`,
            }}>{b}</button>
          ))}
        </div>
      )}

      {/* ─── #2 그래프 필터 ─── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.txd, marginRight: 4 }}>📈 그래프:</span>
        {GRAPH_OPTIONS.map(g => (
          <button key={g.key} onClick={() => toggleGraph(g.key)} style={{
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
            background: visibleGraphs[g.key] ? g.color + '22' : C.sf,
            color: visibleGraphs[g.key] ? g.color : C.txm,
            border: `1px solid ${visibleGraphs[g.key] ? g.color + '55' : C.bd}`,
            fontWeight: visibleGraphs[g.key] ? 600 : 400,
          }}>
            {visibleGraphs[g.key] ? '✓ ' : ''}{g.label}
          </button>
        ))}
      </div>

      {/* ─── #4 경고 설정 패널 ─── */}
      <div style={{ marginBottom: 14 }}>
        <button onClick={() => setShowWarningPanel(!showWarningPanel)} style={{
          background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8,
          padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: C.txd,
        }}>
          ⚠️ 경고 설정 {showWarningPanel ? '▲' : '▼'}
        </button>

        {showWarningPanel && (
          <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 14, marginTop: 6 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* ROAS 조건 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.txd, cursor: 'pointer' }}>
                <input type="checkbox" checked={warningConfig.roasEnabled} onChange={e => setWarningConfig(p => ({ ...p, roasEnabled: e.target.checked }))} />
                ROAS
                <input type="number" style={numInp} value={warningConfig.roasThreshold} onChange={e => setWarningConfig(p => ({ ...p, roasThreshold: Number(e.target.value) }))} disabled={!warningConfig.roasEnabled} />
                % 미만
              </label>
              {/* 광고비 조건 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.txd, cursor: 'pointer' }}>
                <input type="checkbox" checked={warningConfig.costEnabled} onChange={e => setWarningConfig(p => ({ ...p, costEnabled: e.target.checked }))} />
                광고비
                <input type="number" style={numInp} value={warningConfig.costThreshold} onChange={e => setWarningConfig(p => ({ ...p, costThreshold: Number(e.target.value) }))} disabled={!warningConfig.costEnabled} />
                원 이상
              </label>
              {/* 매출 조건 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.txd, cursor: 'pointer' }}>
                <input type="checkbox" checked={warningConfig.revenueEnabled} onChange={e => setWarningConfig(p => ({ ...p, revenueEnabled: e.target.checked }))} />
                매출액
                <input type="number" style={numInp} value={warningConfig.revenueThreshold} onChange={e => setWarningConfig(p => ({ ...p, revenueThreshold: Number(e.target.value) }))} disabled={!warningConfig.revenueEnabled} />
                원 미만
              </label>
            </div>
            <div style={{ fontSize: 11, color: C.txm, marginTop: 8 }}>
              ⚠️ 체크된 조건을 <b>모두</b> 만족하는 항목에만 경고가 표시됩니다. 조건을 끄면 해당 조건은 무시됩니다.
            </div>
          </div>
        )}
      </div>

      {/* 기간 변경 로딩 */}
      {rangeLoading && (
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 20, textAlign: 'center', marginBottom: 14 }}>
          <div style={{ color: C.txd, fontSize: 13 }}>📊 기간 데이터를 불러오는 중...</div>
        </div>
      )}

      {/* 데이터 없을 때 */}
      {!hasData && (
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>아직 데이터가 없습니다</div>
          <div style={{ color: C.txd, fontSize: 13 }}>"보고서 업로드" 메뉴에서 검색광고/GFA 보고서를 올려주세요</div>
        </div>
      )}

      {/* 매핑 없을 때 */}
      {hasData && !hasMappings && (
        <div style={{ background: C.warn + '12', border: `1px solid ${C.warn}33`, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: C.warn }}>
          ⚠️ 매핑이 설정되지 않았습니다. "매핑 관리" 메뉴에서 광고그룹/소재를 브랜드·제품에 연결해주세요.
        </div>
      )}

      {/* ─── 브랜드별 펼쳐보기 ─── */}
      {brandNames.map((brandName, bi) => {
        const products = structured.brands[brandName];
        const productNames = Object.keys(products).sort();
        const bColor = brandColors[allBrandNames.indexOf(brandName) % brandColors.length];

        return (
          <div key={brandName} style={{ marginBottom: 24 }}>
            <div style={{
              background: bColor + '12', border: `1px solid ${bColor}33`,
              borderRadius: 12, padding: '12px 16px', marginBottom: 12,
            }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: bColor }}>{brandName}</span>
              <span style={{ fontSize: 12, color: C.txd, marginLeft: 10 }}>{productNames.length}개 제품</span>
            </div>

            {productNames.map(productName => {
              const adTypes = products[productName];
              const sortedAdTypes = Object.keys(adTypes).sort((a, b) => {
                const ai = AD_TYPE_ORDER.indexOf(a);
                const bii = AD_TYPE_ORDER.indexOf(b);
                return (ai === -1 ? 99 : ai) - (bii === -1 ? 99 : bii);
              });
              const allProductRows = sortedAdTypes.flatMap(at =>
                Object.values(adTypes[at]).flatMap(item => item.rows)
              );

              return (
                <div key={productName} style={{ marginBottom: 14, marginLeft: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, paddingLeft: 10, borderLeft: `3px solid ${bColor}` }}>
                    {productName}
                    <span style={{ fontSize: 11, color: C.txd, fontWeight: 400, marginLeft: 8 }}>{sortedAdTypes.length}개 광고유형</span>
                  </div>

                  <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: tableMinWidth }}>
                      <Header />
                      <tbody>
                        {sortedAdTypes.map(adType => {
                          const items = adTypes[adType];
                          const matchKeys = Object.keys(items);
                          const allRows = matchKeys.flatMap(k => items[k].rows);
                          const atColor = AD_TYPE_COLORS[adType] || C.txd;
                          const expandKey = `${brandName}||${productName}||${adType}`;
                          const isExpanded = expanded[expandKey] || false;
                          const hasMultiple = matchKeys.length > 1;

                          // #1 정렬 적용
                          const sortedMKs = sortKey
                            ? [...matchKeys].sort((a, b) => {
                                const va = getMetricValue(items[a].rows, sortKey);
                                const vb = getMetricValue(items[b].rows, sortKey);
                                return sortDir === 'desc' ? vb - va : va - vb;
                              })
                            : matchKeys;

                          return (
                            <React.Fragment key={adType}>
                              {hasMultiple ? (
                                <>
                                  <MemoMetricRow
                                    label={`${adType} 합계`}
                                    items={allRows}
                                    isSubtotal
                                    clickable
                                    onClick={() => toggleExpand(expandKey)}
                                    visibleGraphs={visibleGraphs}
                                    checkWarning={checkWarning}
                                  />
                                  {isExpanded && sortedMKs.map(mk => (
                                    <MemoMetricRow
                                      key={mk}
                                      label={<span><span style={{ color: atColor, fontSize: 11, marginRight: 6 }}>[{adType}]</span>{items[mk].label}</span>}
                                      items={items[mk].rows}
                                      visibleGraphs={visibleGraphs}
                                      checkWarning={checkWarning}
                                    />
                                  ))}
                                </>
                              ) : (
                                sortedMKs.map(mk => (
                                  <MemoMetricRow
                                    key={mk}
                                    label={<span><span style={{ color: atColor, fontSize: 11, marginRight: 6 }}>[{adType}]</span>{items[mk].label}</span>}
                                    items={items[mk].rows}
                                    visibleGraphs={visibleGraphs}
                                    checkWarning={checkWarning}
                                  />
                                ))
                              )}
                            </React.Fragment>
                          );
                        })}

                        {sortedAdTypes.length > 1 && (
                          <MemoMetricRow label={`${productName} 전체`} items={allProductRows} isTotal visibleGraphs={visibleGraphs} checkWarning={checkWarning} />
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* 미매핑 경고 */}
      {structured.unmapped.length > 0 && (
        <div style={{ marginTop: 16, background: C.warn + '08', border: `1px solid ${C.warn}33`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.warn, marginBottom: 6 }}>⚠️ 매핑되지 않은 데이터 {structured.unmapped.length}건</div>
          <div style={{ fontSize: 12, color: C.txd }}>"매핑 관리" 메뉴에서 이 데이터를 브랜드·제품에 연결해주세요.</div>
        </div>
      )}

      {/* 하단 전체 요약 */}
      {hasData && hasMappings && (() => {
        // structured에서 이미 필터링된 데이터를 재활용
        const allRows = [];
        const targetBrands = selectedBrand === '전체' ? allBrandNames : [selectedBrand];
        targetBrands.forEach(bn => {
          const products = structured.brands[bn];
          if (!products) return;
          Object.values(products).forEach(adTypes => {
            Object.values(adTypes).forEach(items => {
              Object.values(items).forEach(item => { allRows.push(...item.rows); });
            });
          });
        });
        if (allRows.length === 0) return null;
        const m = sumMetrics(allRows);
        const cpa = m.conversions > 0 ? Math.round(m.cost / m.conversions) : 0;
        return (
          <div style={{
            background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginTop: 16,
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14,
          }}>
            {[
              { label: '총 광고비', value: fmtWon(m.cost), color: C.warn },
              { label: '총 노출수', value: fmtNum(m.impressions), color: C.cyan },
              { label: '총 클릭수', value: fmtNum(m.clicks), color: C.ac },
              { label: '총 전환수', value: fmt(m.conversions), color: C.ok },
              { label: '전환당비용', value: cpa > 0 ? fmtWon(cpa) : '-', color: cpa > 20000 ? C.no : cpa > 10000 ? C.warn : C.ok },
              { label: '평균 ROAS', value: calcRoas(m.conv_revenue, m.cost) + '%', color: Number(calcRoas(m.conv_revenue, m.cost)) >= 300 ? C.ok : C.no },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: C.txd, marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
