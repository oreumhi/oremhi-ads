// ============================================
// 브랜드 목표 관리 (담당자 기재)
//   구매전환 ROAS · 구매전환 매출액(월) · 1일 예산
//   + YOY: 작년 동기 ROAS · 매출액(월) · 1일 예산
//   여기 기재된 목표가 홈(오늘 챙길 것·신호등)·종합요약·광고주 리포트의 판단 기준이 됩니다.
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { C } from '../config';
import { fetchBrandTargets, upsertBrandTarget, deleteBrandTarget } from '../store';
import { fmtNum } from '../utils';

const inp = { background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 6, color: C.tx, fontSize: 12, padding: '6px 8px', width: '100%', boxSizing: 'border-box', outline: 'none', textAlign: 'right' };
const th = { textAlign: 'right', padding: '6px 8px', fontSize: 10.5, color: C.txm, fontWeight: 600, whiteSpace: 'nowrap' };
const td = { padding: '5px 8px', borderTop: `1px solid ${C.bd}` };

const FIELDS = [
  ['target_roas', '목표 ROAS(%)'],
  ['target_revenue', '목표 매출액(월)'],
  ['daily_budget', '1일 예산'],
];
// 작년 동기(YOY) 값은 사람이 적지 않습니다 — 작년 보고서 데이터가 DB에 쌓여 있어
// 홈·종합요약·리포트가 "작년 같은 기간"을 자동으로 찾아 비교합니다.

const numOrNull = (v) => {
  const s = String(v ?? '').replace(/[,\s원%]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
};
const disp = (v) => (v == null || v === '' ? '' : fmtNum(v));

export default function BrandTargets({ brands, allowedBrands, currentUser }) {
  const [targets, setTargets] = useState([]);      // DB 행
  const [edit, setEdit] = useState({});            // brand → {field: 입력문자열}
  const [newBrand, setNewBrand] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => setTargets(await fetchBrandTargets()), []);
  useEffect(() => { load(); }, [load]);

  const canSee = (b) => !allowedBrands || allowedBrands.includes(b);
  const myTargets = targets.filter(t => canSee(t.brand));
  const registered = new Set(targets.map(t => t.brand));
  const addable = (brands || []).filter(b => !registered.has(b) && canSee(b)).sort();

  const startEdit = (t) => {
    setEdit(e => ({ ...e, [t.brand]: Object.fromEntries(FIELDS.map(([k]) => [k, disp(t[k])])) }));
  };
  const setF = (brand, k, v) => setEdit(e => ({ ...e, [brand]: { ...e[brand], [k]: v } }));

  const save = async (brand) => {
    const f = edit[brand];
    if (!f) return;
    setBusy(brand);
    const row = { brand, updated_by: currentUser?.name || '' };
    FIELDS.forEach(([k]) => { row[k] = numOrNull(f[k]); });
    const ok = await upsertBrandTarget(row);
    setMsg(ok ? `✅ ${brand} 저장 완료 — 홈·종합요약·리포트에 바로 반영됩니다` : `❌ ${brand} 저장 실패`);
    if (ok) { setEdit(e => { const n = { ...e }; delete n[brand]; return n; }); await load(); }
    setBusy('');
  };

  const remove = async (brand) => {
    if (!window.confirm(`"${brand}"의 목표 기준을 삭제할까요?\n삭제하면 이 브랜드는 다시 과거 평균 기준으로만 판단됩니다.`)) return;
    setBusy(brand);
    const ok = await deleteBrandTarget(brand);
    setMsg(ok ? `🗑 ${brand} 목표 삭제됨` : '❌ 삭제 실패');
    await load(); setBusy('');
  };

  const add = async () => {
    if (!newBrand) return;
    setBusy('_new');
    const ok = await upsertBrandTarget({ brand: newBrand, updated_by: currentUser?.name || '' });
    if (ok) { await load(); startEditByName(newBrand); setNewBrand(''); setMsg(`✅ ${newBrand} 추가됨 — 목표 숫자를 입력하고 저장하세요`); }
    setBusy('');
  };
  const startEditByName = (brand) => {
    setEdit(e => ({ ...e, [brand]: Object.fromEntries(FIELDS.map(([k]) => [k, ''])) }));
  };

  return (
    <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>🎯 브랜드 목표 관리</div>
        <span style={{ fontSize: 11, color: C.txm }}>목표·작년 동기 기준을 적으면 홈 경고와 신호등, 리포트가 이 기준으로 판단합니다</span>
        <button onClick={() => setOpen(o => !o)} style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${C.bd}`, borderRadius: 7, padding: '4px 11px', color: C.txd, fontSize: 11, cursor: 'pointer' }}>
          {open ? '접기 ▲' : `펼치기 ▼ (${myTargets.length}개 등록됨)`}
        </button>
      </div>

      {open && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
            <select value={newBrand} onChange={e => setNewBrand(e.target.value)}
              style={{ background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 7, color: C.tx, fontSize: 12, padding: '7px 10px', minWidth: 160 }}>
              <option value="">+ 브랜드 선택…</option>
              {addable.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <button onClick={add} disabled={!newBrand || busy === '_new'}
              style={{ background: newBrand ? C.ac : C.sf3, color: newBrand ? '#fff' : C.txm, border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: newBrand ? 'pointer' : 'default' }}>등록</button>
            {msg && <span style={{ fontSize: 11.5, color: msg.startsWith('✅') ? C.ok : msg.startsWith('🗑') ? C.txd : C.no }}>{msg}</span>}
          </div>

          {!myTargets.length ? (
            <div style={{ fontSize: 12.5, color: C.txm, padding: '8px 2px' }}>
              등록된 목표가 없습니다. 위에서 브랜드를 선택해 등록하세요.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>브랜드</th>
                    {FIELDS.map(([k, l]) => <th key={k} style={th}>{l}</th>)}
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {myTargets.map(t => {
                    const ed = edit[t.brand];
                    return (
                      <tr key={t.brand}>
                        <td style={{ ...td, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {t.brand}
                          {t.updated_by && <div style={{ fontSize: 9.5, color: C.txm, fontWeight: 400 }}>{t.updated_by}</div>}
                        </td>
                        {FIELDS.map(([k]) => (
                          <td key={k} style={{ ...td, minWidth: 110 }}>
                            {ed ? (
                              <input value={ed[k]} onChange={e => setF(t.brand, k, e.target.value)} style={inp}
                                placeholder="—" onKeyDown={e => e.key === 'Enter' && save(t.brand)} />
                            ) : (
                              <div style={{ fontSize: 12, textAlign: 'right', color: t[k] == null ? C.txm : C.tx, fontWeight: t[k] == null ? 400 : 600 }}>
                                {t[k] == null ? '—' : fmtNum(t[k])}
                              </div>
                            )}
                          </td>
                        ))}
                        <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {ed ? (
                            <>
                              <button onClick={() => save(t.brand)} disabled={busy === t.brand}
                                style={{ background: C.ok, color: '#0c0e14', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', marginRight: 5 }}>저장</button>
                              <button onClick={() => setEdit(e => { const n = { ...e }; delete n[t.brand]; return n; })}
                                style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 6, padding: '4px 10px', color: C.txd, fontSize: 11.5, cursor: 'pointer' }}>취소</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(t)}
                                style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 6, padding: '4px 10px', color: C.ac, fontSize: 11.5, cursor: 'pointer', marginRight: 5 }}>수정</button>
                              <button onClick={() => remove(t.brand)} disabled={busy === t.brand}
                                style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 6, padding: '4px 10px', color: C.no, fontSize: 11.5, cursor: 'pointer' }}>삭제</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ fontSize: 10.5, color: C.txm, marginTop: 10, lineHeight: 1.7 }}>
            · <b style={{ color: C.txd }}>매출액은 월 기준</b>으로 적어주세요 (기간 비교 시 일평균으로 환산해 계산합니다) ·
            빈 칸은 "기준 없음"으로 두고 과거 평균으로 판단합니다 ·
            <b style={{ color: C.txd }}> 작년 동기(YOY)는 적을 필요 없습니다</b> — 작년 보고서 데이터로 자동 계산됩니다
          </div>
        </>
      )}
    </div>
  );
}
