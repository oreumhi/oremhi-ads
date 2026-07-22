// ============================================
// 후기 체크 페이지
//
// - 매장/상품 목록(review_products)을 기준으로 표시. 대표+직원 모두 매장·상품 추가/삭제 가능.
// - 목록 변경은 DB에 저장 → 다음날 자동실행이 그 목록을 읽어 점검(기억됨).
// - 날짜를 선택하면 그날 점검 결과(review_checks)를 각 상품에 표시.
// - 스토어명/상품명 인라인 수정(별칭), 매장별 카톡 복사, 매장 담당 지정(대표).
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { C } from '../config';
import { fetchUsers } from '../store';
import StaffManager from '../components/StaffManager';
import PeriodPicker from '../components/PeriodPicker';
import {
  fetchReviewChecks, fetchReviewChecksRange, fetchReviewDates, fetchReviewStoreMap, setReviewStoreOwner,
  fetchReviewAliases, setProductAlias, setStoreAlias,
  fetchReviewProducts, addReviewProduct, deleteReviewProduct, deleteReviewStore,
} from '../chat';

const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const selStyle = { background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 6, color: C.tx, fontSize: 12, padding: '5px 8px' };
const inpStyle = { background: C.sf3, border: `1px solid ${C.ac}`, borderRadius: 6, color: C.tx, fontSize: 13, padding: '5px 8px' };
const penBtn = { background: 'none', border: 'none', color: C.txm, cursor: 'pointer', fontSize: 12, padding: '0 4px' };
const smallBtn = { background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '4px 10px', color: C.txd, cursor: 'pointer', fontSize: 11 };

const openUrl = (u) => { try { window.open(u, '_blank', 'noopener'); } catch { /* ignore */ } };

async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
  } catch { return false; }
}

function buildStoreText(storeName, items, dateStr, at, nameOf, resultOf) {
  const lines = [];
  let lowTotal = 0;
  items.forEach(p => { const r = resultOf(p); if (r) lowTotal += (r.low_count || 0); });
  lines.push(`[후기체크·${storeName}] ${dateStr}${at ? ' ' + at : ''}`);
  lines.push(lowTotal > 0 ? `⚠️ 저평점 ${lowTotal}건` : '✅ 모두 이상 없음');
  for (const p of items) {
    const nm = nameOf(p); const r = resultOf(p);
    if (!r) { lines.push(`· ${nm} (점검 전)`); continue; }
    if (!r.ok) { lines.push(`· ${nm} ❓ ${r.note || '확인 필요'}`); continue; }
    const lows = r.lows || [];
    if (lows.length > 0) {
      lines.push(`· ${nm} ⚠️ ${lows.map(([pos, rat]) => `${pos}번째 ★${rat}`).join(', ')}`);
      if (p.url) lines.push(`  ${p.url}`);
    } else { lines.push(`· ${nm} ✅`); }
  }
  return lines.join('\n');
}

function Star({ n }) {
  const col = n <= 1 ? C.no : n <= 2 ? C.warn : C.yel;
  return <span style={{ color: col, fontWeight: 700 }}>★{n}</span>;
}

function EditableName({ value, canEdit, onSave, style }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => { setVal(value); }, [value]);
  if (!canEdit) return <span style={style}>{value}</span>;
  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input value={val} onChange={e => setVal(e.target.value)} style={inpStyle} autoFocus
          onKeyDown={e => { if (e.key === 'Enter') { onSave(val.trim()); setEditing(false); } if (e.key === 'Escape') { setVal(value); setEditing(false); } }} />
        <button style={{ ...penBtn, color: C.ok }} onClick={() => { onSave(val.trim()); setEditing(false); }}>저장</button>
        <button style={penBtn} onClick={() => { setVal(value); setEditing(false); }}>취소</button>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <span style={style}>{value}</span>
      <button style={penBtn} title="이름 수정" onClick={() => setEditing(true)}>✏️</button>
    </span>
  );
}

function ProductRow({ p, name, result, canEdit, onRename, onDelete }) {
  const r = result;
  const lows = (r && r.lows) || [];
  return (
    <div style={{ padding: '7px 0', borderBottom: `1px solid ${C.bd}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>· </span>
          <EditableName value={name} canEdit={canEdit} onSave={onRename} style={{ fontSize: 13, fontWeight: 600, color: C.tx }} />
          {!r ? (
            <span style={{ fontSize: 12, color: C.txm }}>· 점검 전 (내일부터 점검)</span>
          ) : !r.ok ? (
            <span style={{ fontSize: 12, color: C.txm }}>❓ {r.note || '확인 필요'}</span>
          ) : lows.length > 0 ? (
            <span style={{ fontSize: 12.5, color: C.no }}>
              ⚠️ {lows.map(([pos, rat], i) => <span key={i}>{i > 0 ? ', ' : ''}{pos}번째 <Star n={rat} /></span>)}
            </span>
          ) : (
            <span style={{ fontSize: 12.5, color: C.ok }}>✅</span>
          )}
        </div>
        {lows.length > 0 && p.url && (
          <div onClick={() => openUrl(p.url)} style={{ fontSize: 11, color: C.ac, cursor: 'pointer', marginTop: 2, wordBreak: 'break-all' }}>{p.url}</div>
        )}
      </div>
      {canEdit && (
        <button style={{ ...penBtn, color: C.no, flexShrink: 0 }} title="상품 삭제" onClick={onDelete}>✕</button>
      )}
    </div>
  );
}

export default function Reviews({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const ownerId = currentUser?.id;
  const canEdit = !!currentUser;

  const [dates, setDates] = useState([]);
  const [date, setDate] = useState('');
  const [results, setResults] = useState({});
  const [products, setProducts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [storeMap, setStoreMap] = useState({});
  const [alias, setAlias] = useState({ products: {}, stores: {} });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);
  const [adding, setAdding] = useState(null);
  const [newProd, setNewProd] = useState({ name: '', url: '' });
  const [newStore, setNewStore] = useState('');
  const [period, setPeriod] = useState(null);       // 기간 요약 { from, to }
  const [periodRows, setPeriodRows] = useState([]); // 기간 내 점검 결과

  const loadBase = useCallback(async () => {
    const [ds, al, prods, sm] = await Promise.all([fetchReviewDates(null), fetchReviewAliases(), fetchReviewProducts(), fetchReviewStoreMap()]);
    setDates(ds); setDate(prev => prev || ds[0] || ''); setAlias(al); setProducts(prods);
    // 매장-담당자 목록은 직원 화면에서도 필요 (본인 담당 매장 필터에 사용)
    setStoreMap(Object.fromEntries(sm.map(m => [m.store, m.owner_id])));
    if (isAdmin) {
      const users = await fetchUsers();
      setStaff(users.filter(u => u.role === 'staff'));
      // 담당 지정 후보 = 관리자(대표) + 직원
      setAssignees(users.filter(u => u.role === 'admin' || u.role === 'staff')
        .sort((a, b) => (a.role === 'admin' ? -1 : 1) - (b.role === 'admin' ? -1 : 1)));
    }
    setLoading(false);
  }, [isAdmin]);
  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    (async () => {
      if (!date) { setResults({}); return; }
      const rows = await fetchReviewChecks(date, isAdmin ? null : ownerId);
      setResults(Object.fromEntries(rows.map(r => [r.url, r])));
    })();
  }, [date, isAdmin, ownerId]);

  // 기간 요약 로드
  useEffect(() => {
    (async () => {
      if (!period) { setPeriodRows([]); return; }
      setPeriodRows(await fetchReviewChecksRange(period.from, period.to, isAdmin ? null : ownerId));
    })();
  }, [period, isAdmin, ownerId]);

  const storeLabel = (s) => alias.stores[s] || s;
  const productLabel = (p) => alias.products[p.url] || p.name || '(이름없음)';
  const resultOf = (p) => results[p.url];

  const byStore = {};
  products.forEach(p => { (byStore[p.store] = byStore[p.store] || []).push(p); });
  let stores = Object.keys(byStore);
  if (!isAdmin) stores = stores.filter(s => storeMap[s] === ownerId);
  // 점검 결과 없는(신규) 업체를 맨 위로 — 신규끼리는 '방금 추가 → 최근 등록' 순, 나머지는 가나다순
  const newestOf = (s) => Math.max(0, ...(byStore[s] || []).map(p => p._placeholder ? 9e15 : (Date.parse(p.created_at || 0) || 0)));
  stores = stores.sort((a, b) => {
    const ha = (byStore[a] || []).some(p => results[p.url]);
    const hb = (byStore[b] || []).some(p => results[p.url]);
    if (ha !== hb) return ha ? 1 : -1;
    if (!ha) return newestOf(b) - newestOf(a);
    return a.localeCompare(b, 'ko');
  });

  const assignOwner = async (store, oid) => {
    setStoreMap(prev => ({ ...prev, [store]: oid }));
    await setReviewStoreOwner(store, oid, storeLabel(store));
  };
  const renameStore = async (store, name) => {
    setAlias(prev => ({ ...prev, stores: { ...prev.stores, [store]: name } }));
    await setStoreAlias(store, name);
  };
  const renameProduct = async (url, name) => {
    setAlias(prev => ({ ...prev, products: { ...prev.products, [url]: name } }));
    await setProductAlias(url, name);
  };
  const handleCopy = async (store, items, at) => {
    const text = buildStoreText(storeLabel(store), items, date, at, productLabel, resultOf);
    const ok = await copyText(text);
    if (ok) { setCopied(store); setTimeout(() => setCopied(null), 2000); }
    else alert('복사에 실패했습니다.');
  };

  const submitAddProduct = async (store) => {
    if (!newProd.url.trim()) return alert('상품 URL을 입력해주세요');
    const r = await addReviewProduct({ store, name: newProd.name.trim() || '새 상품', url: newProd.url.trim() });
    if (!r.ok) return alert('추가 실패: ' + r.msg);
    setAdding(null); setNewProd({ name: '', url: '' });
    await loadBase();
  };
  const removeProduct = async (p) => {
    if (!confirm(`"${productLabel(p)}" 상품을 목록에서 삭제할까요?\n다음 실행부터 점검하지 않습니다.`)) return;
    await deleteReviewProduct(p.url); await loadBase();
  };
  const removeStore = async (store) => {
    const cnt = (byStore[store] || []).filter(p => !p._placeholder).length;
    if (!confirm(`"${storeLabel(store)}" 매장의 상품 ${cnt}개를 전부 삭제할까요?\n다음 실행부터 이 매장은 점검하지 않습니다.`)) return;
    await deleteReviewStore(store); await loadBase();
  };
  const submitAddStore = () => {
    const s = newStore.trim();
    if (!s) return;
    setNewStore(''); setAdding(s); setNewProd({ name: '상품1', url: '' });
    setProducts(prev => prev.some(p => p.store === s) ? prev : [...prev, { id: '_new_' + s, store: s, name: '', url: '', _placeholder: true }]);
  };

  if (loading) return <div style={{ color: C.txd, fontSize: 13, padding: 20 }}>불러오는 중...</div>;

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>후기 체크</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 16, lineHeight: 1.6 }}>
        매장·상품별 상위 후기 중 저평점(별점 3 이하)이 상단에 있는지 매일 자동 점검합니다.
        매장·상품 추가/삭제, 이름 수정은 모두 저장되어 <b style={{ color: C.tx }}>다음날 자동 점검부터 반영</b>됩니다.
        {isAdmin && ' (직원 추가·수정은 아래 \'담당 직원 관리\'에서)'}
      </div>

      {isAdmin && <StaffManager staff={staff} onChanged={loadBase} />}

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: C.txd }}>📅 날짜</span>
        <select value={date} onChange={e => setDate(e.target.value)} style={{ ...selStyle, fontSize: 13, padding: '7px 10px' }}>
          {dates.length === 0 && <option value="">데이터 없음</option>}
          {dates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <span style={{ fontSize: 12, color: C.txm }}>매장 {stores.length}개 · 상품 {products.filter(p => !p._placeholder).length}개</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
          <span style={{ fontSize: 12, color: C.txd, fontWeight: 600 }}>📅 기간 요약</span>
          <PeriodPicker value={period} onApply={(f, t) => setPeriod({ from: f, to: t })} onClear={() => setPeriod(null)} />
        </span>
        {canEdit && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input placeholder="새 업체명" value={newStore} onChange={e => setNewStore(e.target.value)} style={{ ...inpStyle, width: 130 }} onKeyDown={e => e.key === 'Enter' && submitAddStore()} />
            <button style={{ background: C.ac, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={submitAddStore}>+ 업체 추가</button>
          </span>
        )}
      </div>

      {period && (() => {
        const byS = {};
        periodRows.forEach(r => {
          const e = (byS[r.store] = byS[r.store] || { days: new Set(), low: 0, last: '' });
          e.days.add(r.date); e.low += (+r.low_count || 0);
          if (r.date > e.last) e.last = r.date;
        });
        let rows = Object.entries(byS).filter(([s]) => isAdmin || storeMap[s] === ownerId);
        rows.sort((a, b) => b[1].low - a[1].low || a[0].localeCompare(b[0], 'ko'));
        const th = { textAlign: 'left', padding: '6px 10px', fontSize: 11, color: C.txm, fontWeight: 600 };
        const td = { padding: '8px 10px', fontSize: 12.5, borderTop: `1px solid ${C.bd}` };
        return (
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>
              기간 요약 <span style={{ fontSize: 12, color: C.txd, fontWeight: 400 }}>{period.from} ~ {period.to}</span>
            </div>
            <div style={{ fontSize: 11, color: C.txm, marginBottom: 10 }}>기간 내 매장별 점검 결과 합산입니다 · 개별 날짜 상세는 '해제' 후 날짜를 선택해 보세요</div>
            {rows.length === 0 ? (
              <div style={{ fontSize: 13, color: C.txm, padding: 12 }}>지정 기간에 점검 기록이 없습니다.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                  <thead><tr><th style={th}>매장</th><th style={{ ...th, textAlign: 'right' }}>점검일수</th><th style={{ ...th, textAlign: 'right' }}>저평점 후기 합계</th><th style={th}>마지막 점검일</th><th style={th}>상태</th></tr></thead>
                  <tbody>
                    {rows.map(([s, e]) => (
                      <tr key={s}>
                        <td style={{ ...td, fontWeight: 700 }}>{storeLabel(s)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{e.days.size}일</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: e.low > 0 ? C.no : C.ok }}>{e.low}건</td>
                        <td style={{ ...td, color: C.txd }}>{e.last}</td>
                        <td style={td}>{e.low > 0
                          ? <span style={{ color: C.no, fontWeight: 700 }}>⚠ 대응 필요</span>
                          : <span style={{ color: C.ok }}>✅ 이상 없음</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {!period && stores.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: C.txm, fontSize: 13, padding: 40 }}>
          {isAdmin ? '등록된 매장이 없습니다. 위에서 매장을 추가하세요.' : '담당 매장이 없습니다. 대표님이 매장 담당을 지정하면 표시됩니다.'}
        </div>
      )}

      {!period && stores.map(store => {
        const items = (byStore[store] || []).filter(p => !p._placeholder).slice()
          .sort((a, b) => (productLabel(a) || '').localeCompare(productLabel(b) || '', 'ko', { numeric: true }));
        let lowTotal = 0, anyResult = false;
        items.forEach(p => { const r = resultOf(p); if (r) { anyResult = true; lowTotal += (r.low_count || 0); } });
        const firstResult = items.map(resultOf).find(Boolean);
        const at = firstResult && firstResult.checked_at ? String(firstResult.checked_at).slice(11, 16) : '';
        return (
          <div key={store} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <EditableName value={storeLabel(store)} canEdit={canEdit} onSave={(n) => renameStore(store, n)} style={{ fontSize: 15, fontWeight: 800, color: C.ac }} />
                {at && <span style={{ fontSize: 11, color: C.txm }}>{date} {at}</span>}
                {anyResult
                  ? <span style={{ fontSize: 12.5, color: lowTotal > 0 ? C.no : C.ok, fontWeight: 600 }}>{lowTotal > 0 ? `⚠️ 저평점 ${lowTotal}건` : '✅ 모두 이상 없음'}</span>
                  : <span style={{ fontSize: 12, color: C.txm }}>이 날짜 점검 결과 없음</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => handleCopy(store, items, at)} style={{ background: copied === store ? C.ok : C.ac, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {copied === store ? '✓ 복사됨' : '📋 복사하기'}
                </button>
                {isAdmin && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: C.txd }}>담당</span>
                    <select value={storeMap[store] || ''} onChange={e => assignOwner(store, e.target.value)} style={selStyle}>
                      <option value="">미지정(전체)</option>
                      {assignees.map(u => <option key={u.id} value={u.id}>{u.name}{u.role === 'admin' ? ' (대표)' : ''}</option>)}
                    </select>
                  </span>
                )}
                {canEdit && <button style={{ ...smallBtn, color: C.no, borderColor: C.no + '44' }} onClick={() => removeStore(store)}>매장 삭제</button>}
              </div>
            </div>

            <div>
              {items.map(p => (
                <ProductRow key={p.id} p={p} name={productLabel(p)} result={resultOf(p)} canEdit={canEdit}
                  onRename={(n) => renameProduct(p.url, n)} onDelete={() => removeProduct(p)} />
              ))}
            </div>

            {canEdit && (adding === store ? (
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', background: C.sf2, padding: 10, borderRadius: 8 }}>
                <input placeholder="상품명(예: 대용량세트)" value={newProd.name} onChange={e => setNewProd(p => ({ ...p, name: e.target.value }))} style={{ ...inpStyle, width: 180 }} />
                <input placeholder="상품 URL (https://...)" value={newProd.url} onChange={e => setNewProd(p => ({ ...p, url: e.target.value }))} style={{ ...inpStyle, width: 320 }} onKeyDown={e => e.key === 'Enter' && submitAddProduct(store)} />
                <button style={{ background: C.ok, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => submitAddProduct(store)}>추가</button>
                <button style={smallBtn} onClick={() => { setAdding(null); setNewProd({ name: '', url: '' }); }}>취소</button>
              </div>
            ) : (
              <button style={{ ...smallBtn, marginTop: 8 }} onClick={() => { setAdding(store); setNewProd({ name: '', url: '' }); }}>+ 상품 추가</button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
