// ============================================
// 매핑 관리 페이지
//
// 업로드된 데이터에서 고유 항목을 추출하고
// 브랜드 → 제품에 연결합니다.
// ============================================

import React, { useState, useMemo } from 'react';
import { C, AD_TYPE_COLORS } from '../config';
import { findUnmappedKeys } from '../parsers';
import { labelFromMatchKey } from '../config';

export default function Mapping({ data, addMapping, removeMapping }) {
  const { adData, mappings } = data;

  // 입력 상태
  const [brand, setBrand] = useState('');
  const [product, setProduct] = useState('');

  // 기존 브랜드/제품 목록 (자동완성용)
  const existingBrands = useMemo(() => [...new Set(mappings.map(m => m.brand))].sort(), [mappings]);
  const existingProducts = useMemo(() => {
    if (!brand) return [];
    return [...new Set(mappings.filter(m => m.brand === brand).map(m => m.product))].sort();
  }, [mappings, brand]);

  // 미매핑 항목
  const unmapped = useMemo(() => findUnmappedKeys(adData, mappings), [adData, mappings]);

  // 미매핑 항목을 광고유형별로 그룹핑
  const unmappedByType = useMemo(() => {
    const groups = {};
    unmapped.forEach(item => {
      const type = item.ad_type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(item);
    });
    return groups;
  }, [unmapped]);

  // 매핑된 항목을 브랜드>제품별로 그룹핑
  const mappedByBrand = useMemo(() => {
    const groups = {};
    mappings.forEach(m => {
      if (!groups[m.brand]) groups[m.brand] = {};
      if (!groups[m.brand][m.product]) groups[m.brand][m.product] = [];
      groups[m.brand][m.product].push(m);
    });
    return groups;
  }, [mappings]);

  // 매핑 추가
  const handleMap = async (item) => {
    if (!brand.trim()) return alert('브랜드명을 입력해주세요');
    if (!product.trim()) return alert('제품명을 입력해주세요');

    const label = labelFromMatchKey(item.match_key, item.group_name, item.material_id, item.campaign_name);

    await addMapping({
      brand: brand.trim(),
      product: product.trim(),
      ad_type: item.ad_type,
      match_key: item.match_key,
      label,
      campaign_name: item.campaign_name,
    });
  };

  // 같은 광고유형의 미매핑 항목 한번에 매핑
  const handleMapAll = async (items) => {
    if (!brand.trim()) return alert('브랜드명을 입력해주세요');
    if (!product.trim()) return alert('제품명을 입력해주세요');

    for (const item of items) {
      const label = labelFromMatchKey(item.match_key, item.group_name, item.material_id, item.campaign_name);
      await addMapping({
        brand: brand.trim(),
        product: product.trim(),
        ad_type: item.ad_type,
        match_key: item.match_key,
        label,
        campaign_name: item.campaign_name,
      });
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>매핑 관리</h2>

      {/* 브랜드/제품 입력 */}
      <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          매핑할 브랜드 · 제품 선택
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>브랜드명</div>
            <input
              style={inp}
              placeholder="예: 뷰티글로우"
              value={brand}
              onChange={e => setBrand(e.target.value)}
              list="brand-list"
            />
            <datalist id="brand-list">
              {existingBrands.map(b => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>제품명</div>
            <input
              style={inp}
              placeholder="예: 히알루론세럼"
              value={product}
              onChange={e => setProduct(e.target.value)}
              list="product-list"
            />
            <datalist id="product-list">
              {existingProducts.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
        </div>
        {brand && product && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.ok }}>
            ✅ "{brand}" → "{product}" 으로 매핑합니다. 아래 항목의 "매핑" 버튼을 클릭하세요.
          </div>
        )}
      </div>

      {/* ─── 미매핑 항목 ─── */}
      {unmapped.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: C.warn }}>
            ⚠️ 미매핑 항목 ({unmapped.length}개)
          </div>

          {Object.entries(unmappedByType).map(([adType, items]) => (
            <div key={adType} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: AD_TYPE_COLORS[adType] || C.txd }}>{adType}</span>
                  <span style={{ color: C.txd, fontWeight: 400, marginLeft: 6 }}>{items.length}개</span>
                </div>
                {brand && product && items.length > 1 && (
                  <button
                    onClick={() => handleMapAll(items)}
                    style={{ ...btn, background: C.warn, fontSize: 11, padding: '4px 10px' }}
                  >
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
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {item.group_name || item.material_id || '-'}
                      </div>
                      <div style={{ fontSize: 11, color: C.txd, marginTop: 2 }}>
                        캠페인: {item.campaign_name}
                        {item.group_id && <span> · ID: {item.group_id}</span>}
                      </div>
                    </div>
                    {brand && product ? (
                      <button onClick={() => handleMap(item)} style={btn}>
                        매핑
                      </button>
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

      {/* ─── 매핑된 항목 보기 ─── */}
      {mappings.length > 0 && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
            📋 매핑 현황 ({mappings.length}개)
          </div>

          {Object.entries(mappedByBrand).sort().map(([brandName, products]) => (
            <div key={brandName} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ac, marginBottom: 6 }}>
                {brandName}
              </div>

              {Object.entries(products).sort().map(([productName, items]) => (
                <div key={productName} style={{ marginLeft: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, paddingLeft: 8, borderLeft: `2px solid ${C.ac}` }}>
                    {productName}
                  </div>
                  <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8, overflow: 'hidden' }}>
                    {items.map(m => (
                      <div key={m.match_key} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '7px 12px', borderBottom: `1px solid ${C.bd}`,
                        fontSize: 12,
                      }}>
                        <div>
                          <span style={{ color: AD_TYPE_COLORS[m.ad_type] || C.txd, marginRight: 6, fontWeight: 600 }}>
                            [{m.ad_type}]
                          </span>
                          {m.label || m.match_key}
                          {m.campaign_name && (
                            <span style={{ color: C.txm, marginLeft: 6 }}>({m.campaign_name})</span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`"${m.label}" 매핑을 삭제하시겠습니까?`)) {
                              removeMapping(m.match_key);
                            }
                          }}
                          style={{ background: 'none', border: 'none', color: C.no, cursor: 'pointer', fontSize: 13, padding: 2 }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inp = { background: '#1a1e2c', border: '1px solid #282d40', borderRadius: 8, padding: '10px 14px', color: '#e4e7ed', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' };
const btn = { background: '#5b8def', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 12 };
