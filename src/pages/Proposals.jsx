// ============================================
// 제안 도우미
//   브랜드별 데이터를 분석해 '광고주에게 제안할 거리'를 자동 정리.
//   증액 · 효율개선/재배분 · 소재교체 · 전환개선 후보를 근거 수치와 함께 제시.
//   직원이 이걸 바탕으로 창의적 제안을 완성.
// ============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { C } from '../config';
import { fetchAdDataWindow, fetchMappingsAll } from '../store';
import { fmtWon, fmtNum } from '../utils';

const won = (n) => '₩' + fmtNum(Math.round(n || 0));
const num = (n) => fmtNum(Math.round(n || 0));
const normType = (t) => (t || '').startsWith('GFA') ? 'GFA' : (t || '기타');
const sumM = (rows) => rows.reduce((a, r) => ({
  impressions: a.impressions + (+r.impressions || 0), clicks: a.clicks + (+r.clicks || 0),
  cost: a.cost + (+r.cost || 0), conversions: a.conversions + (+r.conversions || 0),
  revenue: a.revenue + (+r.conv_revenue || 0),
}), { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 });
const roasOf = (m) => m.cost > 0 ? m.revenue / m.cost * 100 : 0;
const ctrOf = (m) => m.impressions > 0 ? m.clicks / m.impressions * 100 : 0;
const cvrOf = (m) => m.clicks > 0 ? m.conversions / m.clicks * 100 : 0;

const CATS = {
  boost:   { icon: '💰', label: '증액 추천', color: C.ok, desc: '효율이 좋아 예산을 늘리면 매출 확대 여지가 있는 광고' },
  fix:     { icon: '✂️', label: '효율 개선 · 재배분', color: C.no, desc: '광고비 대비 효율이 낮아 점검·재배분이 필요한 광고' },
  creative:{ icon: '🖼️', label: '소재 교체 검토', color: C.warn, desc: '노출은 많은데 클릭률이 낮아 소재 반응이 약한 광고' },
  convert: { icon: '🎯', label: '전환 개선', color: C.pur, desc: '클릭은 많은데 전환이 적어 랜딩·상세페이지 점검이 필요' },
};

export default function Proposals({ currentUser, allowedBrands }) {
  const isAdmin = currentUser?.role === 'admin';
  const [adData, setAdData] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date(); const from = new Date(); from.setDate(from.getDate() - 15);
    const ds = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const [ad, mp] = await Promise.all([
      fetchAdDataWindow(ds(from), ds(today), isAdmin ? null : currentUser.id),   // 필요 컬럼만 (전송량 절감)
      fetchMappingsAll(),
    ]);
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

  // 최근 14일 브랜드 광고 (광고 단위 집계)
  const ads = useMemo(() => {
    if (!brand) return [];
    const g = {};
    adData.forEach(r => {
      const mp = mapByKey[r.match_key];
      if (!mp || mp.brand !== brand) return;
      const key = r.match_key;
      const label = mp.label || r.group_name || r.material_id || '-';
      (g[key] = g[key] || { label, type: normType(mp.ad_type), product: mp.product, rows: [] }).rows.push(r);
    });
    return Object.values(g).map(x => ({ ...x, m: sumM(x.rows) })).filter(x => x.m.cost > 0 || x.m.impressions > 100);
  }, [adData, mapByKey, brand]);

  const brandTotal = useMemo(() => sumM(ads.flatMap(a => a.rows)), [ads]);

  // 제안 후보 생성
  const props = useMemo(() => {
    const out = { boost: [], fix: [], creative: [], convert: [] };
    const totalCost = brandTotal.cost || 1;
    ads.forEach(a => {
      const m = a.m, roas = roasOf(m), ctr = ctrOf(m), cvr = cvrOf(m);
      const share = m.cost / totalCost * 100;
      // 증액: ROAS 300%+ & 예산 비중 낮음 & 어느 정도 집행
      if (roas >= 300 && m.cost >= 20000 && share < 25) {
        out.boost.push({ a, why: `ROAS ${(roas / 100).toFixed(1)}배(우수), 광고비 비중 ${share.toFixed(0)}%(낮음)`, msg: `'${a.label}'는 효율이 좋은데 예산 비중이 낮습니다. 증액 시 매출 확대 여지가 큽니다.` });
      }
      // 효율개선: ROAS<100% & 광고비 큼
      else if (m.cost >= 50000 && roas > 0 && roas < 100) {
        out.fix.push({ a, why: `ROAS ${(roas / 100).toFixed(1)}배(저조), 광고비 ${won(m.cost)}`, msg: `'${a.label}'는 광고비 대비 효율이 낮습니다. 소재/타겟/입찰 점검 또는 예산을 효율 좋은 광고로 재배분하는 것을 제안합니다.` });
      }
      // 소재교체: 노출 많은데 CTR 낮음
      if (m.impressions >= 3000 && ctr > 0 && ctr < 0.35) {
        out.creative.push({ a, why: `노출 ${num(m.impressions)}, CTR ${ctr.toFixed(2)}%(낮음)`, msg: `'${a.label}'는 노출은 충분한데 클릭률이 낮습니다. 소재(이미지·문구) 교체를 제안합니다.` });
      }
      // 전환개선: 클릭 많은데 전환 적음
      if (m.clicks >= 50 && cvr < 1 && m.conversions <= 2) {
        out.convert.push({ a, why: `클릭 ${num(m.clicks)}, 전환율 ${cvr.toFixed(1)}%(낮음)`, msg: `'${a.label}'는 유입은 많은데 전환이 적습니다. 랜딩·상세페이지·가격/후기 등 전환요소 점검을 제안합니다.` });
      }
    });
    // 각 카테고리 정렬(광고비 큰 순)
    Object.keys(out).forEach(k => out[k].sort((x, y) => y.a.m.cost - x.a.m.cost));
    return out;
  }, [ads, brandTotal]);

  const totalCount = Object.values(props).reduce((s, arr) => s + arr.length, 0);

  const btn = { padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.bd}`, background: C.sf, color: C.txd, cursor: 'pointer', fontSize: 13 };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>💡 제안 도우미</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 14 }}>데이터가 짚어주는 제안 거리입니다. 이걸 바탕으로 광고주께 드릴 제안을 완성하세요. (최근 14일 기준)</div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={brand} onChange={e => setBrand(e.target.value)} style={{ ...btn, minWidth: 150 }}>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {!loading && <span style={{ fontSize: 12, color: totalCount ? C.ac : C.txd }}>{totalCount ? `제안 후보 ${totalCount}건` : '제안 후보 없음'}</span>}
      </div>

      {loading ? <div style={{ color: C.txd, fontSize: 13 }}>불러오는 중…</div> :
        !brand ? <div style={{ color: C.txd, fontSize: 13 }}>브랜드가 없습니다. 매핑 관리에서 광고를 브랜드에 연결하세요.</div> :
        totalCount === 0 ? (
          <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 30, textAlign: 'center', color: C.txd, fontSize: 13 }}>
            지금은 뚜렷한 제안 후보가 없습니다. 대체로 균형 잡힌 상태입니다. 👍<br />
            <span style={{ fontSize: 12, color: C.txm }}>기준: 증액(ROAS 3배+·비중 낮음) / 효율개선(ROAS 1배 미만·광고비 큼) / 소재교체(CTR 0.35% 미만) / 전환개선(클릭 대비 전환 낮음)</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(CATS).map(([key, cat]) => props[key].length > 0 && (
              <div key={key} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.bd}`, background: cat.color + '12' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: cat.color }}>{cat.icon} {cat.label} <span style={{ color: C.txd, fontWeight: 400, fontSize: 12 }}>· {props[key].length}건</span></div>
                  <div style={{ fontSize: 11.5, color: C.txd, marginTop: 3 }}>{cat.desc}</div>
                </div>
                <div style={{ padding: 8 }}>
                  {props[key].map((p, i) => (
                    <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: C.sf2, marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {p.a.label} <span style={{ fontSize: 11, color: C.txd, fontWeight: 400 }}>· {p.a.type}{p.a.product ? ` · ${p.a.product}` : ''}</span>
                      </div>
                      <div style={{ fontSize: 12, color: cat.color, marginTop: 3 }}>{p.why}</div>
                      <div style={{ fontSize: 12.5, color: C.tx, marginTop: 4, lineHeight: 1.5 }}>{p.msg}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
