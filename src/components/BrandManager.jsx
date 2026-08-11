// ============================================
// 브랜드 관리 (설정 최상단) — 2026-08-11 대표님 지시
//   여기서 브랜드를 등록하면: 수집 계정 + 담당 배정 + 목표 + 카톡방까지
//   한 번에 반영되고, 다음날 새벽 수집부터 모든 화면에 자동으로 나온다.
//   삭제하면: 모든 화면·수집·담당에서 제거 (광고비 원본 이력은 보관).
// ============================================

import React, { useState, useEffect } from 'react';
import { C } from '../config';
import { fetchBrandRegistry, registerBrand, deleteBrandEverywhere } from '../store';

const inp = { background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '10px 12px', color: C.tx, fontSize: 14, boxSizing: 'border-box' };
const btn = { padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.bd}`, background: C.sf, color: C.tx, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

const EMPTY_ACC = () => ({ name: '', account_id: '', source: 'search' });

export default function BrandManager({ users, onChanged }) {
  const [reg, setReg] = useState(null);
  const [open, setOpen] = useState(false);          // 등록 폼 펼침
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ brand: '', staff: '', accounts: [EMPTY_ACC()], targetRoas: '', dailyBudget: '', kakaoRoom: '', storeUrl: '' });
  const [delTarget, setDelTarget] = useState(null); // 삭제 확인 대상
  const [delTyped, setDelTyped] = useState('');

  const load = () => fetchBrandRegistry().then(setReg);
  useEffect(() => { load(); }, []);

  const staffNames = (users || []).filter(u => u.role === 'staff').map(u => u.name);

  const setAcc = (i, k, v) => setForm(f => {
    const a = f.accounts.slice(); a[i] = { ...a[i], [k]: v }; return { ...f, accounts: a };
  });

  const submit = async () => {
    if (busy) return;
    setBusy(true); setMsg('등록 중...');
    const r = await registerBrand(form);
    setBusy(false);
    if (r.ok) {
      setMsg('✅ 등록 완료 — ' + r.msg + ' · 데이터는 다음날 새벽 수집부터 자동으로 표시됩니다');
      setForm({ brand: '', staff: '', accounts: [EMPTY_ACC()], targetRoas: '', dailyBudget: '', kakaoRoom: '', storeUrl: '' });
      setOpen(false); load(); if (onChanged) onChanged();
    } else setMsg('❌ ' + r.msg);
  };

  const doDelete = async () => {
    if (busy || !delTarget || delTyped !== delTarget.brand) return;
    setBusy(true); setMsg('삭제 중...');
    const r = await deleteBrandEverywhere(delTarget.brand);
    setBusy(false); setDelTarget(null); setDelTyped('');
    setMsg(r.ok ? '✅ 삭제 완료 — ' + r.msg : '❌ 삭제 실패');
    load(); if (onChanged) onChanged();
  };

  const brands = (reg && reg.brands) || [];

  return (
    <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>🏷️ 브랜드 관리</div>
        <div style={{ fontSize: 12, color: C.txd }}>
          여기서 등록하면 수집·담당·목표·대화분석까지 한 번에 연결되고, 다음날부터 모든 화면에 자동으로 나옵니다
        </div>
        <div style={{ flex: 1 }} />
        <button style={{ ...btn, background: C.ac, color: '#fff', border: 'none' }} onClick={() => setOpen(!open)}>
          {open ? '닫기' : '＋ 새 브랜드 등록'}
        </button>
      </div>
      {msg && <div style={{ fontSize: 13, marginTop: 10, color: msg.startsWith('❌') ? '#f87171' : '#4ade80' }}>{msg}</div>}

      {/* ─── 등록 폼 ─── */}
      {open && (
        <div style={{ marginTop: 14, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>브랜드명 <b style={{ color: '#f87171' }}>*</b> <span style={{ color: C.txm }}>(모든 화면에 표시될 이름 — 한글 권장)</span></div>
              <input style={{ ...inp, width: '100%' }} value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="예) 모비블루" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>담당 직원 <b style={{ color: '#f87171' }}>*</b></div>
              <select style={{ ...inp, width: '100%' }} value={form.staff} onChange={e => setForm({ ...form, staff: e.target.value })}>
                <option value="">선택하세요</option>
                {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div style={{ fontSize: 12, color: C.txd, margin: '12px 0 4px' }}>네이버 광고 계정 <b style={{ color: '#f87171' }}>*</b> <span style={{ color: C.txm }}>(여러 개면 [계정 추가] — 검색/GFA 구분)</span></div>
          {form.accounts.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <input style={{ ...inp, flex: 2, minWidth: 150 }} value={a.name} onChange={e => setAcc(i, 'name', e.target.value)} placeholder="계정 이름 (예: hkvape, 모비블루_SA)" />
              <input style={{ ...inp, flex: 1, minWidth: 120 }} value={a.account_id} onChange={e => setAcc(i, 'account_id', e.target.value.replace(/[^0-9]/g, ''))} placeholder="계정번호 (숫자)" />
              <select style={{ ...inp, width: 130 }} value={a.source} onChange={e => setAcc(i, 'source', e.target.value)}>
                <option value="search">검색광고</option>
                <option value="gfa">디스플레이(GFA)</option>
              </select>
              {form.accounts.length > 1 && (
                <button style={{ ...btn, color: '#f87171' }} onClick={() => setForm(f => ({ ...f, accounts: f.accounts.filter((_, j) => j !== i) }))}>✕</button>
              )}
            </div>
          ))}
          <button style={{ ...btn, fontSize: 12 }} onClick={() => setForm(f => ({ ...f, accounts: [...f.accounts, EMPTY_ACC()] }))}>＋ 계정 추가</button>
          <div style={{ fontSize: 11.5, color: C.txm, marginTop: 4 }}>계정번호는 광고주센터 주소의 ad-accounts/ 뒤 숫자입니다 (예: ads.naver.com/manage/ad-accounts/<b>766980</b>/...)</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>목표 ROAS(%) <span style={{ color: C.txm }}>선택</span></div>
              <input style={{ ...inp, width: '100%' }} value={form.targetRoas} onChange={e => setForm({ ...form, targetRoas: e.target.value.replace(/[^0-9]/g, '') })} placeholder="예) 500" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>1일 예산(원) <span style={{ color: C.txm }}>선택</span></div>
              <input style={{ ...inp, width: '100%' }} value={form.dailyBudget} onChange={e => setForm({ ...form, dailyBudget: e.target.value.replace(/[^0-9]/g, '') })} placeholder="예) 100000" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>카톡방 이름 <span style={{ color: C.txm }}>선택 · 대화분석 연동</span></div>
              <input style={{ ...inp, width: '100%' }} value={form.kakaoRoom} onChange={e => setForm({ ...form, kakaoRoom: e.target.value })} placeholder="예) 모비블루x오름히 sa방" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>스마트스토어 주소 <span style={{ color: C.txm }}>선택 · 후기·순위 참고</span></div>
              <input style={{ ...inp, width: '100%' }} value={form.storeUrl} onChange={e => setForm({ ...form, storeUrl: e.target.value })} placeholder="https://smartstore.naver.com/..." />
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={busy} style={{ ...btn, background: C.ac, color: '#fff', border: 'none', opacity: busy ? 0.5 : 1 }} onClick={submit}>브랜드 등록</button>
            <span style={{ fontSize: 12, color: C.txm }}>등록 즉시 수집 목록·담당·목표가 연결되고, 광고 데이터는 다음날 새벽부터 쌓입니다</span>
          </div>
        </div>
      )}

      {/* ─── 브랜드 목록 ─── */}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 8 }}>
        {brands.map(b => (
          <div key={b.brand} style={{ border: `1px solid ${C.bd}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{b.brand}
                {b.staff && <span style={{ fontSize: 11.5, fontWeight: 400, color: C.txd, marginLeft: 6 }}>담당 {b.staff}</span>}
              </div>
              <div style={{ fontSize: 11.5, color: C.txm, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(b.accounts || []).map(a => `${a.name}(${a.source === 'gfa' ? 'GFA' : '검색'})`).join(' · ') || '계정 없음'}
              </div>
              {b.note && <div style={{ fontSize: 11, color: '#facc15' }}>{b.note}</div>}
            </div>
            <button style={{ ...btn, fontSize: 12, color: '#f87171' }} onClick={() => { setDelTarget(b); setDelTyped(''); }}>삭제</button>
          </div>
        ))}
        {reg && brands.length === 0 && <div style={{ color: C.txd, fontSize: 13 }}>등록된 브랜드가 없습니다.</div>}
      </div>

      {/* ─── 삭제 확인 모달 ─── */}
      {delTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setDelTarget(null); setDelTyped(''); }}>
          <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 24, width: 460, maxWidth: '92vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#f87171', marginBottom: 10 }}>⚠️ '{delTarget.brand}' 브랜드 삭제</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: C.tx }}>
              대시보드의 <b>모든 데이터가 삭제됩니다</b>. 정말 삭제하겠습니까?<br />
              <span style={{ color: C.txd, fontSize: 12.5 }}>
                홈·성과·리포트 등 모든 화면에서 사라지고, 매일 수집·담당 배정·목표·순위·후기·공유링크가 함께 제거됩니다.
                광고비 원본 이력은 정산 근거로 서버에 보관됩니다. 이 작업은 되돌릴 수 없습니다.
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: C.txd, margin: '14px 0 6px' }}>확인을 위해 브랜드 이름을 똑같이 입력하세요: <b style={{ color: C.tx }}>{delTarget.brand}</b></div>
            <input style={{ ...inp, width: '100%' }} value={delTyped} onChange={e => setDelTyped(e.target.value)} placeholder={delTarget.brand} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button style={btn} onClick={() => { setDelTarget(null); setDelTyped(''); }}>취소</button>
              <button disabled={busy || delTyped !== delTarget.brand}
                style={{ ...btn, background: '#dc2626', color: '#fff', border: 'none', opacity: (busy || delTyped !== delTarget.brand) ? 0.4 : 1 }}
                onClick={doDelete}>영구 삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
