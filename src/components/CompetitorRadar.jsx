// ============================================
// 경쟁사 레이더
//   매일 새벽 1시, 순위 체크에 등록된 키워드로 네이버 검색 결과를 훑어
//   상위 경쟁 상품(쇼핑광고)·업체(파워링크)를 스냅샷으로 쌓은 결과를 봅니다.
//   어제 대비 변화(가격 인하·신규 진입·찜 급증·이탈)는 경보로 표시됩니다.
// ============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { C } from '../config';
import { fetchRadar, fetchRadarDates, fetchRadarAlerts } from '../rank';
import { fmtNum } from '../utils';

const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const th = { textAlign: 'left', padding: '7px 10px', fontSize: 11, color: C.txm, fontWeight: 600, whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: 12.5, borderTop: `1px solid ${C.bd}` };
const chip = (on) => ({
  border: `1px solid ${on ? C.ac : C.bd}`, background: on ? C.ac : 'transparent',
  color: on ? '#fff' : C.txd, borderRadius: 999, padding: '4px 12px', fontSize: 12,
  cursor: 'pointer', fontWeight: on ? 700 : 400,
});
const won = (n) => (n == null ? '—' : '₩' + fmtNum(n));

const KIND_COLOR = {
  '가격 인하': C.no, '신규 상위 진입': C.warn, '찜 급증': C.pur, '경쟁사 이탈': C.ok,
};

export default function CompetitorRadar({ allowedBrands }) {
  const [dates, setDates] = useState([]);
  const [date, setDate] = useState('');
  const [rows, setRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [channel, setChannel] = useState('shopping');
  const [kw, setKw] = useState('전체');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    (async () => {
      const ds = await fetchRadarDates();
      setDates(ds); setDate(ds[0] || ''); if (!ds.length) setLoading(false);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    const [r, a] = await Promise.all([fetchRadar(date), fetchRadarAlerts(date)]);
    setRows(r); setAlerts(a); setLoading(false);
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const inB = useCallback((b) => !allowedBrands || !b || allowedBrands.includes(b), [allowedBrands]);

  const scoped = useMemo(() => rows.filter(r => (r.channel || 'shopping') === channel && inB(r.brand)), [rows, channel, inB]);
  const keywords = useMemo(() => ['전체', ...new Set(scoped.map(r => r.keyword))], [scoped]);
  const shown = useMemo(() => {
    const list = kw === '전체' ? scoped : scoped.filter(r => r.keyword === kw);
    return [...list].sort((a, b) => (a.keyword || '').localeCompare(b.keyword || '') || (a.pos || 0) - (b.pos || 0));
  }, [scoped, kw]);
  const myAlerts = useMemo(
    () => alerts.filter(a => (a.channel || 'shopping') === channel && inB(a.brand)),
    [alerts, channel, inB]);

  const byKeyword = useMemo(() => {
    const g = {};
    shown.forEach(r => { (g[r.keyword] = g[r.keyword] || []).push(r); });
    return g;
  }, [shown]);

  const isShop = channel === 'shopping';

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: open ? 12 : 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          📡 경쟁사 레이더
          <span style={{ fontSize: 12, color: C.txd, fontWeight: 400, marginLeft: 8 }}>
            — 같은 키워드 검색 결과에 누가 있는지 매일 추적
          </span>
        </div>
        {myAlerts.length > 0 && (
          <span style={{ fontSize: 11, color: C.warn, background: '#f5a44518', border: '1px solid #f5a44544', borderRadius: 10, padding: '2px 9px', fontWeight: 700 }}>
            변화 {myAlerts.length}건
          </span>
        )}
        <button onClick={() => setOpen(o => !o)} style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${C.bd}`, borderRadius: 7, padding: '4px 11px', color: C.txd, fontSize: 11, cursor: 'pointer' }}>
          {open ? '접기 ▲' : '펼치기 ▼'}
        </button>
      </div>

      {open && (!dates.length ? (
        <div style={{ fontSize: 12.5, color: C.txm, padding: '10px 2px', lineHeight: 1.7 }}>
          아직 수집된 경쟁사 데이터가 없습니다. 매일 새벽 1시에 자동으로 쌓이며,
          이틀치가 모이면 <b style={{ color: C.txd }}>가격 인하·신규 상위 진입·찜 급증·이탈</b> 변화가 표시됩니다.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            {[['shopping', '쇼핑광고'], ['powerlink', '파워링크']].map(([k, l]) => (
              <button key={k} style={chip(channel === k)} onClick={() => { setChannel(k); setKw('전체'); }}>{l}</button>
            ))}
            <span style={{ width: 6 }} />
            <select value={date} onChange={e => setDate(e.target.value)}
              style={{ background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 7, color: C.tx, fontSize: 12, padding: '5px 9px' }}>
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {keywords.length > 2 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
              {keywords.map(k => <button key={k} style={{ ...chip(kw === k), fontSize: 11.5, padding: '3px 10px' }} onClick={() => setKw(k)}>{k}</button>)}
            </div>
          )}

          {/* 어제 대비 변화 */}
          {myAlerts.length > 0 && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {myAlerts.slice(0, 10).map((a, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 9, background: C.sf2, borderRadius: 8,
                  border: `1px solid ${C.bd}`, borderLeft: `3px solid ${KIND_COLOR[a.kind] || C.ac}`, padding: '8px 12px',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: KIND_COLOR[a.kind] || C.ac, flexShrink: 0 }}>{a.kind}</span>
                  <span style={{ fontSize: 10.5, color: C.txd, background: C.sf3, borderRadius: 5, padding: '1px 7px', flexShrink: 0 }}>{a.keyword}</span>
                  <span style={{ fontSize: 12, color: C.tx, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                  <span style={{ fontSize: 11.5, color: C.txd, flexShrink: 0 }}>{a.detail}</span>
                </div>
              ))}
            </div>
          )}

          {loading ? <div style={{ fontSize: 12.5, color: C.txm, padding: 10 }}>불러오는 중…</div>
            : !shown.length ? <div style={{ fontSize: 12.5, color: C.txm, padding: 10 }}>이 조건의 수집 결과가 없습니다.</div>
            : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {Object.entries(byKeyword).map(([k, list]) => (
                <div key={k}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.tx, marginBottom: 6 }}>
                    🔍 {k} <span style={{ fontSize: 11, color: C.txm, fontWeight: 400 }}>· {list[0]?.brand} · 상위 {list.length}개</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isShop ? 620 : 420 }}>
                      <thead>
                        <tr>
                          <th style={{ ...th, width: 44 }}>순위</th>
                          <th style={th}>{isShop ? '상품명' : '업체 / 광고 문구'}</th>
                          <th style={th}>판매자</th>
                          {isShop && <th style={{ ...th, textAlign: 'right' }}>가격</th>}
                          {isShop && <th style={{ ...th, textAlign: 'right' }}>찜</th>}
                          {isShop && <th style={{ ...th, textAlign: 'right' }}>리뷰</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r, i) => (
                          <tr key={i} style={{ background: i % 2 ? 'transparent' : C.sf2 + '55' }}>
                            <td style={{ ...td, fontWeight: 800, color: r.pos <= 3 ? C.ok : r.pos <= 10 ? C.warn : C.txd }}>{r.pos}위</td>
                            <td style={{ ...td, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={r.title || ''}>{r.title || '—'}</td>
                            <td style={{ ...td, color: C.txd, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={r.seller || ''}>{r.seller || '—'}</td>
                            {isShop && <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{won(r.price)}</td>}
                            {isShop && <td style={{ ...td, textAlign: 'right', color: C.txd }}>{r.wish == null ? '—' : fmtNum(r.wish)}</td>}
                            {isShop && <td style={{ ...td, textAlign: 'right', color: C.txd }}>{r.review == null ? '—' : fmtNum(r.review)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: C.txm, marginTop: 10 }}>
            매일 새벽 1시 자동 수집 · 쇼핑광고는 상품 기준, 파워링크는 업체 기준으로 순위를 매깁니다 ·
            찜·리뷰는 검색 목록에 노출될 때만 수집됩니다
          </div>
        </>
      ))}
    </div>
  );
}
