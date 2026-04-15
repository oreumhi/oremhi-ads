// ============================================
// 매핑 관리 페이지
//
// 미매핑:
//   전체 매핑 버튼 → 광고유형별 전체 매핑 → 개별 매핑
// 매핑 현황:
//   전체 삭제 버튼 → 광고유형별 전체 삭제 → 개별 삭제
// ============================================

import React, { useState, useMemo } from 'react';
import { C, AD_TYPE_COLORS } from '../config';
import { findUnmappedKeys } from '../parsers';
import { labelFromMatchKey } from '../config';

export default function Mapping({ data, addMapping, removeMapping, currentUser }) {
  const { adData: allAdData, mappings: allMappings } = data;

  // ─── 데이터 격리: 현재 사용자의 데이터만 사용 ───
  const myOwnerId = currentUser?.id;
  const adData = useMemo(() => {
    if (!myOwnerId) return allAdData;
    // 정확히 내 소유 데이터만 (NULL 제외)
    return allAdData.filter(d => d.owner_id === myOwnerId);
  }, [allAdData, myOwnerId]);

  const mappings = useMemo(() => {
    if (!myOwnerId) return allMappings;
    // 정확히 내 소유 매핑만 (NULL 제외)
    return allMappings.filter(m => m.owner_id === myOwnerId);
  }, [allMappings, myOwnerId]);

  const [brand, setBrand] = useState('');
  const [product, setProduct] = useState('');

  // 기존 브랜드/제품 목록 (자동완성)
  const existingBrands = useMemo(() => [...new Set(mappings.map(m => m.brand))].sort(), [mappings]);
  const existingProducts = useMemo(() => {
    if (!brand) return [];
    return [...new Set(mappings.filter(m => m.brand === brand).map(m => m.product))].sort();
  }, [mappings, brand]);

  // 미매핑 항목
  const unmapped = useMemo(() => findUnmappedKeys(adData, mappings), [adData, mappings]);

  // 미매핑: 광고유형별 그룹
  const unmappedByType = useMemo(() => {
    const groups = {};
    unmapped.forEach(item => {
      const type = item.ad_type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(item);
    });
    return groups;
  }, [unmapped]);

  // 매핑: 브랜드>제품별 그룹
  const mappedByBrand = useMemo(() => {
    const groups = {};
    mappings.forEach(m => {
      if (!groups[m.brand]) groups[m.brand] = {};
      if (!groups[m.brand][m.product]) groups[m.brand][m.product] = [];
      groups[m.brand][m.product].push(m);
    });
    return groups;
  }, [mappings]);

  // ─── 개별 매핑 ───
  const handleMap = async (item) => {
    if (!brand.trim()) return alert('브랜드명을 입력해주세요');
    if (!product.trim()) return alert('제품명을 입력해주세요');
    const label = labelFromMatchKey(item.match_key, item.group_name, item.material_id, item.campaign_name);
    await addMapping({
      brand: brand.trim(), product: product.trim(),
      ad_type: item.ad_type, match_key: item.match_key,
      label, campaign_name: item.campaign_name,
    });
  };

  // ─── 광고유형별 전체 매핑 ───
  const handleMapByType = async (items) => {
    if (!brand.trim()) return alert('브랜드명을 입력해주세요');
    if (!product.trim()) return alert('제품명을 입력해주세요');
    if (!confirm(`${items.length}개를 "${brand} / ${product}"로 매핑하시겠습니까?`)) return;
    for (const item of items) {
      const label = labelFromMatchKey(item.match_key, item.group_name, item.material_id, item.campaign_name);
      await addMapping({
        brand: brand.trim(), product: product.trim(),
        ad_type: item.ad_type, match_key: item.match_key,
        label, campaign_name: item.campaign_name,
      });
    }
  };

  // ─── 미매핑 전체 매핑 ───
  const handleMapAll = async () => {
    if (!brand.trim()) return alert('브랜드명을 입력해주세요');
    if (!product.trim()) return alert('제품명을 입력해주세요');
    if (!confirm(`미매핑 ${unmapped.length}개를 전부 "${brand} / ${product}"로 매핑하시겠습니까?`)) return;
    for (const item of unmapped) {
      const label = labelFromMatchKey(item.match_key, item.group_name, item.material_id, item.campaign_name);
      await addMapping({
        brand: brand.trim(), product: product.trim(),
        ad_type: item.ad_type, match_key: item.match_key,
        label, campaign_name: item.campaign_name,
      });
    }
  };

  // ─── 개별 삭제 ───
  const handleDelete = async (m) => {
    if (confirm(`"${m.label}" 매핑을 삭제하시겠습니까?`)) {
      await removeMapping(m.match_key);
    }
  };

  // ─── 광고유형별 전체 삭제 ───
  const handleDeleteByType = async (items, adType) => {
    if (!confirm(`[${adType}] 매핑 ${items.length}개를 전부 삭제하시겠습니까?`)) return;
    for (const m of items) {
      await removeMapping(m.match_key);
    }
  };

  // ─── 매핑 전체 삭제 ───
  const handleDeleteAll = async () => {
    if (!confirm(`매핑 ${mappings.length}개를 전부 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    if (!confirm('정말로 전체 삭제하시겠습니까?')) return;
    for (const m of mappings) {
      await removeMapping(m.match_key);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>매핑 관리</h2>

      {/* 브랜드/제품 입력 */}
      <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>매핑할 브랜드 · 제품 선택</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>브랜드명</div>
            <input style={inp} placeholder="예: 뷰티글로우" value={brand} onChange={e => setBrand(e.target.value)} list="brand-list" />
            <datalist id="brand-list">{existingBrands.map(b => <option key={b} value={b} />)}</datalist>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>제품명</div>
            <input style={inp} placeholder="예: 히알루론세럼" value={product} onChange={e => setProduct(e.target.value)} list="product-list" />
            <datalist id="product-list">{existingProducts.map(p => <option key={p} value={p} />)}</datalist>
          </div>
        </div>
        {brand && product && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.ok }}>
            ✅ "{brand}" → "{product}" 으로 매핑합니다. 아래 항목의 "매핑" 버튼을 클릭하세요.
          </div>
        )}
      </div>

      {/* ═══ 미매핑 항목 ═══ */}
      {unmapped.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.warn }}>
              ⚠️ 미매핑 항목 ({unmapped.length}개)
            </div>
            {/* 미매핑 전체 매핑 버튼 */}
            {brand && product && unmapped.length > 1 && (
              <button onClick={handleMapAll} style={{ ...btnDanger, background: C.warn }}>
                미매핑 전체 "{product}"로 매핑
              </button>
            )}
          </div>

          {Object.entries(unmappedByType).map(([adType, items]) => (
            <div key={adType} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: AD_TYPE_COLORS[adType] || C.txd }}>{adType}</span>
                  <span style={{ color: C.txd, fontWeight: 400, marginLeft: 6 }}>{items.length}개</span>
                </div>
                {/* 광고유형별 전체 매핑 버튼 */}
                {brand && product && (
                  <button onClick={() => handleMapByType(items)} style={{ ...btn, background: C.warn, fontSize: 11, padding: '4px 10px' }}>
                    전체 "{product}"로 매핑
                  </button>
                )}
              </div>

              <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, overflow: 'hidden' }}>
                {items.map(item => (
                  <div key={item.match_key} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderBottom: `1px solid ${C.bd}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{item.group_name || item.material_id || '-'}</div>
                      <div style={{ fontSize: 11, color: C.txd, marginTop: 2 }}>
                        캠페인: {item.campaign_name}
                        {item.group_id && <span> · ID: {item.group_id}</span>}
                      </div>
                    </div>
                    {brand && product ? (
                      <button onClick={() => handleMap(item)} style={btn}>매핑</button>
                    ) : (
                      <span style={{ fontSize: 11, color: C.txm }}>브랜드/제품을 먼저 입력하세요</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : adData.length > 0 ? (
        <div style={{ background: C.ok + '08', border: `1px solid ${C.ok}33`, borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 13, color: C.ok }}>
          ✅ 모든 항목이 매핑되었습니다!
        </div>
      ) : (
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 20, marginBottom: 20, textAlign: 'center', color: C.txd }}>
          보고서를 먼저 업로드해주세요
        </div>
      )}

      {/* ═══ 매핑 현황 ═══ */}
      {mappings.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              📋 매핑 현황 ({mappings.length}개)
            </div>
            {/* 매핑 전체 삭제 버튼 */}
            <button onClick={handleDeleteAll} style={btnDanger}>
              매핑 전체 삭제
            </button>
          </div>

          {Object.entries(mappedByBrand).sort().map(([brandName, products]) => (
            <div key={brandName} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ac, marginBottom: 6 }}>{brandName}</div>

              {Object.entries(products).sort().map(([productName, items]) => {
                // 광고유형별 그룹핑
                const byAdType = {};
                items.forEach(m => {
                  if (!byAdType[m.ad_type]) byAdType[m.ad_type] = [];
                  byAdType[m.ad_type].push(m);
                });

                return (
                  <div key={productName} style={{ marginLeft: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, paddingLeft: 8, borderLeft: `2px solid ${C.ac}` }}>
                      {productName}
                    </div>

                    <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8, overflow: 'hidden' }}>
                      {Object.entries(byAdType).map(([adType, adTypeItems]) => (
                        <React.Fragment key={adType}>
                          {/* 광고유형 헤더 + 전체 삭제 버튼 */}
                          <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 12px', background: C.sf2, borderBottom: `1px solid ${C.bd}`,
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 600 }}>
                              <span style={{ color: AD_TYPE_COLORS[adType] || C.txd }}>[{adType}]</span>
                              <span style={{ color: C.txd, fontWeight: 400, marginLeft: 6 }}>{adTypeItems.length}개</span>
                            </div>
                            {adTypeItems.length > 1 && (
                              <button onClick={() => handleDeleteByType(adTypeItems, adType)} style={{ background: 'none', border: `1px solid ${C.no}33`, borderRadius: 4, padding: '2px 8px', color: C.no, cursor: 'pointer', fontSize: 10 }}>
                                전체 삭제
                              </button>
                            )}
                          </div>
                          {/* 개별 항목 */}
                          {adTypeItems.map(m => (
                            <div key={m.match_key} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '7px 12px', borderBottom: `1px solid ${C.bd}`, fontSize: 12,
                            }}>
                              <div>
                                {m.label || m.match_key}
                                {m.campaign_name && <span style={{ color: C.txm, marginLeft: 6 }}>({m.campaign_name})</span>}
                              </div>
                              <button onClick={() => handleDelete(m)} style={{ background: 'none', border: 'none', color: C.no, cursor: 'pointer', fontSize: 13, padding: 2 }}>
                                ✕
                              </button>
                            </div>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inp = { background: '#1a1e2c', border: '1px solid #282d40', borderRadius: 8, padding: '10px 14px', color: '#e4e7ed', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' };
const btn = { background: '#5b8def', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' };
const btnDanger = { background: '#f07070', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' };
