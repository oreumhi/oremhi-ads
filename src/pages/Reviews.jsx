// ============================================
// 후기 체크 페이지
//
// 후기체크 프로그램이 자동 전송한 결과를 날짜별로 확인.
// 형태: 카톡으로 보내던 것과 동일 (매장별, 상품별 저평점 위치)
// 권한: 대표(admin) 전체 + 매장 담당 지정 / 직원은 담당 매장만
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { C } from '../config';
import { fetchUsers } from '../store';
import { fetchReviewChecks, fetchReviewDates, fetchReviewStoreMap, setReviewStoreOwner } from '../chat';

const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const selStyle = { background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 6, color: C.tx, fontSize: 12, padding: '5px 8px' };

// 안전한 링크 열기 (호스트가 확인 후 엶)
const openUrl = (u) => { try { window.open(u, '_blank', 'noopener'); } catch { /* ignore */ } };

// 별점 뱃지
function Star({ n }) {
  const col = n <= 1 ? C.no : n <= 2 ? C.warn : C.yel;
  return <span style={{ color: col, fontWeight: 700 }}>★{n}</span>;
}

// 상품 한 줄 (카톡 형태 그대로)
function ProductRow({ p }) {
  const lows = p.lows || [];
  const bad = !p.ok;
  const hasLow = lows.length > 0;
  return (
    <div style={{ padding: '7px 0', borderBottom: `1px solid ${C.bd}22` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>· {p.product_name}</span>
        {bad ? (
          <span style={{ fontSize: 12, color: C.txm }}>❓ {p.note || '확인 필요'}</span>
        ) : hasLow ? (
          <span style={{ fontSize: 12.5, color: C.no }}>
            ⚠️ {lows.map(([pos, rat], i) => (
              <span key={i}>{i > 0 ? ', ' : ''}{pos}번째 <Star n={rat} /></span>
            ))}
          </span>
        ) : (
          <span style={{ fontSize: 12.5, color: C.ok }}>✅</span>
        )}
      </div>
      {hasLow && p.url && (
        <div onClick={() => openUrl(p.url)} style={{ fontSize: 11, color: C.ac, cursor: 'pointer', marginTop: 2, wordBreak: 'break-all' }}>
          {p.url}
        </div>
      )}
    </div>
  );
}

export default function Reviews({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const ownerId = currentUser?.id;

  const [dates, setDates] = useState([]);
  const [date, setDate] = useState('');
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [storeMap, setStoreMap] = useState({}); // store -> owner_id
  const [loading, setLoading] = useState(true);

  // 날짜 목록 로드
  useEffect(() => {
    (async () => {
      const ds = await fetchReviewDates(isAdmin ? null : ownerId);
      setDates(ds);
      setDate(ds[0] || '');
      if (isAdmin) {
        const [users, sm] = await Promise.all([fetchUsers(), fetchReviewStoreMap()]);
        setStaff(users.filter(u => u.role === 'staff'));
        setStoreMap(Object.fromEntries(sm.map(m => [m.store, m.owner_id])));
      }
      setLoading(false);
    })();
  }, [isAdmin, ownerId]);

  // 선택 날짜 데이터 로드
  const load = useCallback(async () => {
    if (!date) { setRows([]); return; }
    const r = await fetchReviewChecks(date, isAdmin ? null : ownerId);
    setRows(r);
  }, [date, isAdmin, ownerId]);
  useEffect(() => { load(); }, [load]);

  // 매장별 그룹
  const byStore = {};
  rows.forEach(r => { (byStore[r.store] = byStore[r.store] || []).push(r); });
  const stores = Object.keys(byStore).sort();

  const assignOwner = async (store, oid) => {
    setStoreMap(prev => ({ ...prev, [store]: oid }));
    await setReviewStoreOwner(store, oid, store);
    load();
  };

  if (loading) return <div style={{ color: C.txd, fontSize: 13, padding: 20 }}>불러오는 중...</div>;

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>후기 체크</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 16 }}>
        매장·상품별 상위 후기 중 저평점(별점 3 이하)이 상단에 있는지 매일 자동 점검합니다.
      </div>

      {dates.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: C.txm, fontSize: 13, padding: 40 }}>
          아직 후기 체크 데이터가 없습니다. 후기체크 프로그램이 실행되면 자동으로 올라옵니다.
        </div>
      ) : (
        <>
          {/* 날짜 선택 */}
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: C.txd }}>📅 날짜</span>
            <select value={date} onChange={e => setDate(e.target.value)} style={{ ...selStyle, fontSize: 13, padding: '7px 10px' }}>
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <span style={{ fontSize: 12, color: C.txm }}>매장 {stores.length}개 · 상품 {rows.length}개</span>
          </div>

          {/* 매장별 카드 */}
          {stores.map(store => {
            const items = byStore[store].slice().sort((a, b) => (a.product_name || '').localeCompare(b.product_name || '', 'ko', { numeric: true }));
            const lowTotal = items.reduce((s, p) => s + (p.low_count || 0), 0);
            const anyBad = items.some(p => !p.ok);
            const at = items[0]?.checked_at ? String(items[0].checked_at).slice(11, 16) : '';
            return (
              <div key={store} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.ac }}>{store}</span>
                    <span style={{ fontSize: 11, color: C.txm, marginLeft: 8 }}>{date} {at}</span>
                    <span style={{ fontSize: 12.5, marginLeft: 10, color: lowTotal > 0 ? C.no : C.ok, fontWeight: 600 }}>
                      {lowTotal > 0 ? `⚠️ 저평점 ${lowTotal}건` : '✅ 모두 이상 없음'}
                      {anyBad && <span style={{ color: C.txm, marginLeft: 6 }}>· 확인필요 있음</span>}
                    </span>
                  </div>
                  {/* 관리자: 매장 담당 지정 */}
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: C.txd }}>담당</span>
                      <select value={storeMap[store] || ''} onChange={e => assignOwner(store, e.target.value)} style={selStyle}>
                        <option value="">미지정(전체)</option>
                        {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  {items.map(p => <ProductRow key={p.id} p={p} />)}
                </div>
              </div>
            );
          })}

          {stores.length === 0 && (
            <div style={{ ...card, textAlign: 'center', color: C.txm, fontSize: 13 }}>
              이 날짜에 담당 매장 데이터가 없습니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}
