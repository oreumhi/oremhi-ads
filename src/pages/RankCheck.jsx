// ============================================
// 순위 체크 (adrank)
//   관리자: 대상(브랜드/제품/키워드) 관리 + 담당자 지정 + 전체 순위
//   직원  : 본인 담당 순위 확인
//   실제 수집은 각 직원 PC의 "순위체크" 프로그램이 수행 → 여기서 결과만 확인
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { C } from '../config';
import { fetchUsers } from '../store';
import {
  fetchRankProducts, addRankProduct, deleteRankProduct, setRankOwner, updateRankProduct,
  fetchRankHistory,
} from '../rank';

const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: C.txd, borderBottom: `1px solid ${C.bd}`, whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: 13, borderBottom: `1px solid ${C.bd}22` };
const btn = { background: C.ac, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnGhost = { background: 'none', border: `1px solid ${C.bd}`, borderRadius: 6, padding: '4px 10px', color: C.txd, cursor: 'pointer', fontSize: 11 };
const selStyle = { background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 6, color: C.tx, fontSize: 12, padding: '5px 8px' };
const inp = { ...selStyle, padding: '6px 8px' };

const csv = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);

// 순위 색상 (1~3 초록, 4~10 노랑, 그 외 회색, 미노출 빨강)
const rankColor = (r) => r == null ? C.no : r <= 3 ? C.ok : r <= 10 ? C.warn : C.txd;
const rankText = (r) => r == null ? '미노출' : `${r}위`;

// history(최신순) → key별 최신/이전 순위
function latestByKey(history) {
  const map = {};
  for (const h of history) {
    const k = `${h.brand}|${h.product}|${h.keyword}|${h.ad_type}`;
    if (!map[k]) map[k] = { ...h, prev: undefined };
    else if (map[k].prev === undefined) map[k].prev = h.rank;
  }
  return map;
}

function RankResultsTable({ history, showStaff }) {
  const map = latestByKey(history);
  const rows = Object.values(map).sort((a, b) =>
    (a.brand + a.product + a.keyword).localeCompare(b.brand + b.product + b.keyword));
  if (rows.length === 0) return <div style={{ fontSize: 13, color: C.txm, padding: 8 }}>아직 수집된 순위가 없습니다. 직원 PC에서 순위체크를 실행하면 여기에 표시됩니다.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          {showStaff && <th style={th}>담당</th>}
          <th style={th}>브랜드</th><th style={th}>제품</th><th style={th}>구분</th>
          <th style={th}>키워드</th><th style={th}>순위</th><th style={th}>변동</th><th style={th}>수집시각</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const diff = (r.prev != null && r.rank != null) ? r.prev - r.rank : null;
            return (
              <tr key={i}>
                {showStaff && <td style={{ ...td, color: C.txd }}>{r.staff_name || '-'}</td>}
                <td style={{ ...td, fontWeight: 600 }}>{r.brand}</td>
                <td style={td}>{r.product}</td>
                <td style={{ ...td, fontSize: 12 }}>{r.ad_type === 'shopping' ? '쇼핑' : '파워링크'}</td>
                <td style={{ ...td, color: C.txd }}>{r.keyword}</td>
                <td style={{ ...td, fontWeight: 800, color: rankColor(r.rank) }}>{rankText(r.rank)}</td>
                <td style={{ ...td, fontSize: 12 }}>
                  {diff == null ? '-' : diff === 0 ? '─' : diff > 0
                    ? <span style={{ color: C.ok }}>▲{diff}</span>
                    : <span style={{ color: C.no }}>▼{-diff}</span>}
                </td>
                <td style={{ ...td, fontSize: 11, color: C.txm }}>{(r.collected_at || '').replace('T', ' ').slice(0, 16)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── 관리자: 대상 관리 ───
function TargetManager({ staff, onChanged }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState('');
  const [nf, setNf] = useState({ brand: '', domain: '', product: '', ad_titles: '', shopping: '', powerlink: '' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => { setItems(await fetchRankProducts()); }, []);
  useEffect(() => { load(); }, [load]);

  const assign = async (it, ownerId) => {
    setBusy(it.id);
    const p = (staff || []).find(u => u.id === ownerId);
    await setRankOwner(it.id, ownerId || null, p ? p.name : null);
    await load(); onChanged && onChanged(); setBusy('');
  };
  const toggle = async (it) => { setBusy(it.id); await updateRankProduct(it.id, { active: !it.active }); await load(); setBusy(''); };
  const remove = async (it) => {
    if (!window.confirm(`"${it.brand} > ${it.product}" 순위 대상을 삭제할까요?`)) return;
    setBusy(it.id); await deleteRankProduct(it.id); await load(); onChanged && onChanged(); setBusy('');
  };
  const add = async () => {
    if (!nf.brand.trim()) return setMsg('❌ 브랜드명을 입력하세요');
    if (!csv(nf.shopping).length && !csv(nf.powerlink).length) return setMsg('❌ 키워드를 하나 이상 입력하세요');
    setMsg('추가 중...');
    const r = await addRankProduct({
      brand: nf.brand.trim(), domain: nf.domain.trim(), product: nf.product.trim(),
      ad_titles: csv(nf.ad_titles), shopping_keywords: csv(nf.shopping), powerlink_keywords: csv(nf.powerlink),
    });
    if (r.ok) { setNf({ brand: '', domain: '', product: '', ad_titles: '', shopping: '', powerlink: '' }); setMsg('✅ 대상이 추가되었습니다'); await load(); onChanged && onChanged(); }
    else setMsg('❌ ' + r.msg);
  };

  const unassigned = items.filter(x => x.active && !x.owner_id).length;

  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>순위 체크 대상 · 담당자 지정</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 10 }}>
        브랜드·제품·키워드를 등록하고 담당 직원을 지정하면, 그 직원 PC에서 자동으로 순위를 수집합니다.
        {unassigned > 0 && <span style={{ color: C.warn, fontWeight: 700 }}> · 담당자 미지정 {unassigned}개</span>}
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>브랜드</th><th style={th}>제품</th><th style={th}>쇼핑 키워드</th><th style={th}>파워링크 키워드</th>
            <th style={th}>담당 직원</th><th style={th}>수집</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} style={{ opacity: it.active ? 1 : 0.45 }}>
                <td style={{ ...td, fontWeight: 600 }}>{it.brand}</td>
                <td style={td}>{it.product}</td>
                <td style={{ ...td, fontSize: 12, color: C.txd }}>{arr(it.shopping_keywords).join(', ') || '-'}</td>
                <td style={{ ...td, fontSize: 12, color: C.txd }}>{arr(it.powerlink_keywords).join(', ') || '-'}</td>
                <td style={td}>
                  <select style={selStyle} disabled={busy === it.id} value={it.owner_id || ''} onChange={e => assign(it, e.target.value)}>
                    <option value="">— 미지정 —</option>
                    {(staff || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </td>
                <td style={td}><button style={{ ...btnGhost, color: it.active ? C.ok : C.no }} onClick={() => toggle(it)}>{it.active ? '수집중' : '제외됨'}</button></td>
                <td style={td}><button style={{ ...btnGhost, color: C.no }} onClick={() => remove(it)}>삭제</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} style={{ ...td, color: C.txm }}>등록된 대상이 없습니다. 아래에서 추가하세요.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* 추가 폼 */}
      <div style={{ background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>대상 추가</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <input placeholder="브랜드 (예: 모그라미)" value={nf.brand} onChange={e => setNf({ ...nf, brand: e.target.value })} style={{ ...inp, width: 130 }} />
          <input placeholder="도메인 (brand.naver.com/…)" value={nf.domain} onChange={e => setNf({ ...nf, domain: e.target.value })} style={{ ...inp, width: 190 }} />
          <input placeholder="제품 (예: 베이직)" value={nf.product} onChange={e => setNf({ ...nf, product: e.target.value })} style={{ ...inp, width: 120 }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <input placeholder="쇼핑 키워드 (쉼표로 구분)" value={nf.shopping} onChange={e => setNf({ ...nf, shopping: e.target.value })} style={{ ...inp, width: 220 }} />
          <input placeholder="파워링크 키워드 (쉼표로 구분)" value={nf.powerlink} onChange={e => setNf({ ...nf, powerlink: e.target.value })} style={{ ...inp, width: 220 }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <input placeholder="쇼핑광고 제목(정확일치용, 쉼표로 구분) — 선택" value={nf.ad_titles} onChange={e => setNf({ ...nf, ad_titles: e.target.value })} style={{ ...inp, width: 360 }} />
          <button style={btn} onClick={add}>대상 추가</button>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✅') ? C.ok : msg.startsWith('❌') ? C.no : C.txd }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

export default function RankCheck({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const [history, setHistory] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [h, users] = await Promise.all([
      fetchRankHistory(isAdmin ? null : currentUser.id, since),
      isAdmin ? fetchUsers() : Promise.resolve([]),
    ]);
    setHistory(h);
    setStaff((users || []).filter(u => u.role === 'staff'));
    setLoading(false);
  }, [isAdmin, currentUser]);
  useEffect(() => { load(); }, [load]);

  const lastCollected = history[0]?.collected_at ? history[0].collected_at.replace('T', ' ').slice(0, 16) : '아직 없음';

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>순위 체크</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 16 }}>
        {isAdmin ? '네이버 쇼핑광고·파워링크 순위를 직원별로 수집해 한 화면에서 봅니다' : '내 담당 브랜드의 광고 순위를 확인합니다'}
        <span style={{ marginLeft: 10, color: C.txm }}>· 마지막 수집: {lastCollected}</span>
      </div>

      {isAdmin && <TargetManager staff={staff} onChanged={load} />}

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{isAdmin ? '최신 순위 (전체)' : '내 최신 순위'}</div>
        {loading ? <div style={{ fontSize: 13, color: C.txm }}>불러오는 중…</div>
          : <RankResultsTable history={history} showStaff={isAdmin} />}
      </div>
    </div>
  );
}
