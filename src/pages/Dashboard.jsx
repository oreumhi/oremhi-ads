// ============================================
// 대시보드 - 모든 브랜드/제품/광고 펼쳐보기
//
// 수정사항:
//   1. 브랜드 선택 필터 (전체 또는 특정 브랜드만)
//   2. 그래프 순서: 노출→클릭→클릭률→전환→광고비→매출→ROAS
//   3. 0% 흰색 표시 (Sparkline 컴포넌트에서 처리)
//   4. 합계만 기본 표시, 클릭 시 상세 펼침
//   5. 하단 요약에 전환당비용(CPA) 추가
//   6. 비밀번호 잠금 (App.jsx에서 처리)
// ============================================

import React, { useState, useMemo } from 'react';
import { C, RANGES, AD_TYPE_ORDER, AD_TYPE_COLORS } from '../config';
import { fmt, fmtWon, fmtNum, filterByRange, aggregateByDate, sumMetrics, calcCtr, calcCpa, calcRoas } from '../utils';
import { Sparkline } from '../components/Sparkline';

export default function Dashboard({ data }) {
  const { adData, mappings } = data;
  const [range, setRange] = useState(7);
  const [selectedBrand, setSelectedBrand] = useState('전체');  // #1 브랜드 필터
  const [expanded, setExpanded] = useState({});                 // #4 펼침 상태

  // 펼침/접힘 토글
  const toggleExpand = (key) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

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
      // GFA는 종류 구분 없이 하나로 합침
      const ad_type = rawAdType.startsWith('GFA') ? 'GFA' : rawAdType;

      if (!brands[brand]) brands[brand] = {};
      if (!brands[brand][product]) brands[brand][product] = {};
      if (!brands[brand][product][ad_type]) brands[brand][product][ad_type] = {};
      if (!brands[brand][product][ad_type][row.match_key]) {
        brands[brand][product][ad_type][row.match_key] = {
          label: label || row.group_name || row.material_id || '-',
          campaign_name: row.campaign_name,
          rows: [],
        };
      }
      brands[brand][product][ad_type][row.match_key].rows.push(row);
    });

    return { brands, unmapped };
  }, [adData, mappings, range]);

  // ─── 지표 행 렌더 ───
  function MetricRow({ label, items, color, isSubtotal, isTotal, onClick, clickable }) {
    const metrics = sumMetrics(items);
    const daily = aggregateByDate(items);
    const ctr = calcCtr(metrics.clicks, metrics.impressions);
    const cpa = calcCpa(metrics.cost, metrics.conversions);
    const roas = calcRoas(metrics.conv_revenue, metrics.cost);

    const bg = isTotal ? C.sf3 : isSubtotal ? C.sf2 : 'transparent';
    const fw = isSubtotal || isTotal ? 700 : 400;
    const prefix = isTotal ? '▶▶ ' : isSubtotal ? '▶ ' : '';

    return (
      <tr style={{ background: bg, cursor: clickable ? 'pointer' : 'default' }} onClick={onClick || undefined}>
        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.bd}`, fontSize: 12.5, fontWeight: fw, color: isTotal ? C.tx : isSubtotal ? C.txd : C.tx }}>
          {clickable && <span style={{ fontSize: 10, marginRight: 4, color: C.txm }}>▼</span>}
          {prefix}{label}
        </td>
        <td style={tdR}>{fmtNum(metrics.impressions)}</td>
        <td style={tdR}><b>{fmtNum(metrics.clicks)}</b></td>
        <td style={{ ...tdR, color: Number(ctr) >= 3 ? C.ok : Number(ctr) < 1 ? C.no : C.tx }}>{ctr}%</td>
        <td style={{ ...tdR, color: C.warn, fontWeight: 600 }}>{fmtWon(metrics.cost)}</td>
        <td style={{ ...tdR, color: C.ok, fontWeight: 700 }}>{metrics.conversions}</td>
        <td style={{ ...tdR, color: cpa > 20000 ? C.no : cpa > 10000 ? C.warn : C.ok }}>{cpa > 0 ? fmtWon(cpa) : '-'}</td>
        <td style={{ ...tdR, color: Number(roas) >= 300 ? C.ok : Number(roas) < 100 ? C.no : C.tx }}>{roas}%</td>
        {/* 그래프 순서: 노출 → 클릭 → 클릭률 → 전환 → 광고비 → 매출 → ROAS  (#2 수정) */}
        <td style={tdC}><Sparkline data={daily.map(d => d.impressions)} color={C.cyan} /></td>
        <td style={tdC}><Sparkline data={daily.map(d => d.clicks)} color={C.ac} /></td>
        <td style={tdC}><Sparkline data={daily.map(d => d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0)} color={C.yel} /></td>
        <td style={tdC}><Sparkline data={daily.map(d => d.conversions)} color={C.ok} /></td>
        <td style={tdC}><Sparkline data={daily.map(d => d.cost)} color={C.warn} /></td>
        <td style={tdC}><Sparkline data={daily.map(d => d.conv_revenue)} color={C.pink} /></td>
        <td style={tdC}><Sparkline data={daily.map(d => d.cost > 0 ? (d.conv_revenue / d.cost) * 100 : 0)} color={C.pur} /></td>
      </tr>
    );
  }

  // 테이블 헤더 (#2 순서 수정)
  const Header = () => (
    <thead>
      <tr style={{ background: C.sf2 }}>
        <th style={th}>광고</th>
        <th style={thR}>노출수</th>
        <th style={thR}>클릭수</th>
        <th style={thR}>CTR</th>
        <th style={thR}>광고비</th>
        <th style={thR}>전환수</th>
        <th style={thR}>CPA</th>
        <th style={thR}>ROAS</th>
        <th style={thC}>노출 추이</th>
        <th style={thC}>클릭 추이</th>
        <th style={thC}>클릭률 추이</th>
        <th style={thC}>전환 추이</th>
        <th style={thC}>광고비 추이</th>
        <th style={thC}>매출 추이</th>
        <th style={thC}>ROAS 추이</th>
      </tr>
    </thead>
  );

  const allBrandNames = Object.keys(structured.brands).sort();
  // #1 브랜드 필터 적용
  const brandNames = selectedBrand === '전체' ? allBrandNames : allBrandNames.filter(b => b === selectedBrand);
  const brandColors = ['#5b8def', '#3dd9a0', '#f5a445', '#ed6ea0', '#9d7ff0', '#45c8dc', '#f0c746'];

  const hasData = adData.length > 0;
  const hasMappings = mappings.length > 0;

  return (
    <div>
      {/* 헤더 + 브랜드 선택 + 기간 선택 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>광고 성과 대시보드</h2>
          <div style={{ fontSize: 12, color: C.txd, marginTop: 2 }}>모든 브랜드 · 모든 제품 · 모든 광고 한눈에</div>
        </div>
        <div style={{ display: 'flex', gap: 3, background: C.sf, borderRadius: 10, padding: 3, border: `1px solid ${C.bd}` }}>
          {RANGES.map(r => (
            <button key={r.value} onClick={() => setRange(r.value)} style={{
              padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: range === r.value ? 600 : 400,
              background: range === r.value ? C.ac : 'transparent',
              color: range === r.value ? '#fff' : C.txd,
            }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* #1 브랜드 선택 버튼 */}
      {allBrandNames.length > 1 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedBrand('전체')}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: selectedBrand === '전체' ? 700 : 400,
              background: selectedBrand === '전체' ? C.ac : C.sf,
              color: selectedBrand === '전체' ? '#fff' : C.txd,
              border: `1px solid ${selectedBrand === '전체' ? C.ac : C.bd}`,
            }}
          >
            전체
          </button>
          {allBrandNames.map((b, i) => (
            <button
              key={b}
              onClick={() => setSelectedBrand(b)}
              style={{
                padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: selectedBrand === b ? 700 : 400,
                background: selectedBrand === b ? brandColors[i % brandColors.length] + '22' : C.sf,
                color: selectedBrand === b ? brandColors[i % brandColors.length] : C.txd,
                border: `1px solid ${selectedBrand === b ? brandColors[i % brandColors.length] + '55' : C.bd}`,
              }}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      {/* 데이터 없을 때 */}
      {!hasData && (
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>아직 데이터가 없습니다</div>
          <div style={{ color: C.txd, fontSize: 13 }}>
            "보고서 업로드" 메뉴에서 검색광고/GFA 보고서를 올려주세요
          </div>
        </div>
      )}

      {/* 매핑 없을 때 */}
      {hasData && !hasMappings && (
        <div style={{ background: C.warn + '12', border: `1px solid ${C.warn}33`, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: C.warn }}>
          ⚠️ 매핑이 설정되지 않았습니다. "매핑 관리" 메뉴에서 광고그룹/소재를 브랜드·제품에 연결해주세요.
        </div>
      )}

      {/* 브랜드별 펼쳐보기 */}
      {brandNames.map((brandName, bi) => {
        const products = structured.brands[brandName];
        const productNames = Object.keys(products).sort();
        const bColor = brandColors[allBrandNames.indexOf(brandName) % brandColors.length];

        return (
          <div key={brandName} style={{ marginBottom: 24 }}>
            {/* 브랜드 헤더 */}
            <div style={{
              background: bColor + '12', border: `1px solid ${bColor}33`,
              borderRadius: 12, padding: '12px 16px', marginBottom: 12,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontSize: 17, fontWeight: 800, color: bColor }}>{brandName}</span>
                <span style={{ fontSize: 12, color: C.txd, marginLeft: 10 }}>
                  {productNames.length}개 제품
                </span>
              </div>
            </div>

            {/* 제품별 */}
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
                  <div style={{
                    fontSize: 14, fontWeight: 700, marginBottom: 6, paddingLeft: 10,
                    borderLeft: `3px solid ${bColor}`,
                  }}>
                    {productName}
                    <span style={{ fontSize: 11, color: C.txd, fontWeight: 400, marginLeft: 8 }}>
                      {sortedAdTypes.length}개 광고유형
                    </span>
                  </div>

                  <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1400 }}>
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

                          return (
                            <React.Fragment key={adType}>
                              {/* #4 합계를 먼저 표시 (클릭하면 상세 펼침) */}
                              {hasMultiple ? (
                                <>
                                  {/* 광고유형 합계 행 (항상 보임, 클릭 가능) */}
                                  <MetricRow
                                    label={`${adType} 합계`}
                                    items={allRows}
                                    color={atColor}
                                    isSubtotal
                                    clickable
                                    onClick={() => toggleExpand(expandKey)}
                                  />
                                  {/* 개별 항목 (펼쳐졌을 때만 보임) */}
                                  {isExpanded && matchKeys.map(mk => (
                                    <MetricRow
                                      key={mk}
                                      label={
                                        <span>
                                          <span style={{ color: atColor, fontSize: 11, marginRight: 6 }}>
                                            [{adType}]
                                          </span>
                                          {items[mk].label}
                                        </span>
                                      }
                                      items={items[mk].rows}
                                      color={atColor}
                                    />
                                  ))}
                                </>
                              ) : (
                                /* 항목이 1개뿐이면 합계 없이 바로 표시 */
                                matchKeys.map(mk => (
                                  <MetricRow
                                    key={mk}
                                    label={
                                      <span>
                                        <span style={{ color: atColor, fontSize: 11, marginRight: 6 }}>
                                          [{adType}]
                                        </span>
                                        {items[mk].label}
                                      </span>
                                    }
                                    items={items[mk].rows}
                                    color={atColor}
                                  />
                                ))
                              )}
                            </React.Fragment>
                          );
                        })}

                        {/* 제품 전체 합계 */}
                        {sortedAdTypes.length > 1 && (
                          <MetricRow
                            label={`${productName} 전체`}
                            items={allProductRows}
                            color={bColor}
                            isTotal
                          />
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

      {/* 미매핑 데이터 경고 */}
      {structured.unmapped.length > 0 && (
        <div style={{ marginTop: 16, background: C.warn + '08', border: `1px solid ${C.warn}33`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.warn, marginBottom: 6 }}>
            ⚠️ 매핑되지 않은 데이터 {structured.unmapped.length}건
          </div>
          <div style={{ fontSize: 12, color: C.txd }}>
            "매핑 관리" 메뉴에서 이 데이터를 브랜드·제품에 연결해주세요.
          </div>
        </div>
      )}

      {/* #5 하단 전체 요약 (전환당비용 추가) */}
      {hasData && hasMappings && (
        <div style={{
          background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginTop: 16,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14,
        }}>
          {(() => {
            // 선택된 브랜드에 해당하는 데이터만 합산
            const mapByKey = {};
            mappings.forEach(m => { mapByKey[m.match_key] = m; });
            const all = filterByRange(adData, range).filter(row => {
              if (selectedBrand === '전체') return mapByKey[row.match_key];
              const mapping = mapByKey[row.match_key];
              return mapping && mapping.brand === selectedBrand;
            });
            const m = sumMetrics(all);
            const cpa = m.conversions > 0 ? Math.round(m.cost / m.conversions) : 0;
            return [
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
            ));
          })()}
        </div>
      )}
    </div>
  );
}

// 스타일 상수
const th = { padding: '9px 12px', textAlign: 'left', fontSize: 11, color: '#8890a6', fontWeight: 700, borderBottom: '1px solid #282d40' };
const thR = { ...th, textAlign: 'right' };
const thC = { ...th, textAlign: 'center' };
const tdR = { padding: '8px 12px', borderBottom: '1px solid #282d40', fontSize: 12.5, textAlign: 'right' };
const tdC = { padding: '6px 8px', borderBottom: '1px solid #282d40', textAlign: 'center' };
