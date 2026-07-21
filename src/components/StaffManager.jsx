// ============================================
// 담당 직원 관리 (공용) — 추가 · 이름 수정 · 비밀번호 재설정 · 삭제
//   순위 체크 · 후기 체크 등 담당 지정이 있는 페이지 상단에서 사용.
//   접힌 상태가 기본. 변경 시 onChanged()로 부모 목록 갱신.
// ============================================

import React, { useState } from 'react';
import { C } from '../config';
import { hashPin } from '../utils';
import { fetchUsers, createUser, deleteUser, updateUser } from '../store';

const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: C.txd, borderBottom: `1px solid ${C.bd}`, whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: 13, borderBottom: `1px solid ${C.bd}22` };
const btn = { background: C.ac, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnGhost = { background: 'none', border: `1px solid ${C.bd}`, borderRadius: 6, padding: '4px 10px', color: C.txd, cursor: 'pointer', fontSize: 11 };
const inp = { background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 6, color: C.tx, fontSize: 12, padding: '6px 8px' };

export default function StaffManager({ staff, onChanged }) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState({});
  const [nf, setNf] = useState({ name: '', username: '', password: '' });
  const [msg, setMsg] = useState('');

  const nameOf = (u) => (names[u.id] !== undefined ? names[u.id] : u.name);

  const saveName = async (u) => {
    const n = (names[u.id] || '').trim();
    if (!n || n === u.name) return;
    if (await updateUser(u.id, { name: n })) { setMsg(`✅ 이름을 '${n}'(으)로 변경했습니다`); onChanged && onChanged(); }
    else setMsg('❌ 이름 변경 실패');
  };
  const resetPw = async (u) => {
    const pw = window.prompt(`'${u.name}'의 새 비밀번호 (4자리 이상):`);
    if (pw === null) return;
    if (pw.length < 4) { setMsg('❌ 비밀번호는 4자리 이상이어야 합니다'); return; }
    if (await updateUser(u.id, { password_hash: await hashPin(pw) })) setMsg(`✅ '${u.name}' 비밀번호를 변경했습니다`);
    else setMsg('❌ 비밀번호 변경 실패');
  };
  const remove = async (u) => {
    if (!window.confirm(`'${u.name}' 직원 계정을 삭제할까요?\n(이 직원에게 지정된 담당 항목은 '미지정'으로 표시됩니다)`)) return;
    if (await deleteUser(u.id)) { setMsg(`✅ '${u.name}' 계정을 삭제했습니다`); onChanged && onChanged(); }
    else setMsg('❌ 삭제 실패');
  };
  const add = async () => {
    if (!nf.name.trim()) { setMsg('❌ 이름을 입력하세요'); return; }
    if (!nf.username.trim()) { setMsg('❌ 로그인 아이디를 입력하세요'); return; }
    if (nf.password.length < 4) { setMsg('❌ 비밀번호는 4자리 이상이어야 합니다'); return; }
    const all = await fetchUsers();
    if ((all || []).find(u => u.username === nf.username.trim())) { setMsg('❌ 이미 사용중인 아이디입니다'); return; }
    const user = await createUser({
      name: nf.name.trim(), username: nf.username.trim(),
      password_hash: await hashPin(nf.password), role: 'staff', assigned_brands: '[]',
    });
    if (user) { setNf({ name: '', username: '', password: '' }); setMsg(`✅ '${user.name}' 직원을 추가했습니다`); onChanged && onChanged(); }
    else setMsg('❌ 추가 실패');
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>👥 담당 직원 관리
          <span style={{ fontSize: 12, color: C.txd, fontWeight: 400, marginLeft: 8 }}>추가 · 이름 수정 · 비밀번호 · 삭제 — 현재 {(staff || []).length}명</span>
        </div>
        <span style={{ fontSize: 12, color: C.txd }}>{open ? '▲ 접기' : '▼ 펼치기'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 520 }}>
            <thead><tr><th style={th}>이름</th><th style={th}>로그인 아이디</th><th style={th}></th></tr></thead>
            <tbody>
              {(staff || []).map(u => (
                <tr key={u.id}>
                  <td style={td}>
                    <input style={{ ...inp, width: 110 }} value={nameOf(u)} onChange={e => setNames(p => ({ ...p, [u.id]: e.target.value }))} />
                    {nameOf(u).trim() !== u.name && nameOf(u).trim() !== '' &&
                      <button style={{ ...btnGhost, color: C.ok, marginLeft: 6 }} onClick={() => saveName(u)}>이름 저장</button>}
                  </td>
                  <td style={{ ...td, color: C.txd }}>{u.username}</td>
                  <td style={td}>
                    <button style={btnGhost} onClick={() => resetPw(u)}>비밀번호 변경</button>
                    <button style={{ ...btnGhost, color: C.no, marginLeft: 6 }} onClick={() => remove(u)}>삭제</button>
                  </td>
                </tr>
              ))}
              {(staff || []).length === 0 && <tr><td colSpan={3} style={{ ...td, color: C.txm }}>등록된 직원이 없습니다. 아래에서 추가하세요.</td></tr>}
            </tbody>
          </table>
          <div style={{ background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 12, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>새 직원 추가</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <input placeholder="이름 (예: 홍길동)" value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })} style={{ ...inp, width: 120 }} />
              <input placeholder="로그인 아이디" autoComplete="off" name="sm_new_username_no_autofill" value={nf.username} onChange={e => setNf({ ...nf, username: e.target.value })} style={{ ...inp, width: 130 }} />
              <input type="password" placeholder="비밀번호 (4자리+)" autoComplete="new-password" name="sm_new_pw_no_autofill" value={nf.password} onChange={e => setNf({ ...nf, password: e.target.value })} style={{ ...inp, width: 140 }} />
              <button style={btn} onClick={add}>직원 추가</button>
            </div>
          </div>
          {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith('✅') ? C.ok : C.no }}>{msg}</div>}
          <div style={{ fontSize: 11.5, color: C.txm, marginTop: 8 }}>
            여기서 추가·수정한 직원은 담당 선택 목록과 대시보드 로그인 계정에 바로 반영됩니다. 담당 브랜드 배정은 ⚙️ 설정에서 하세요.
          </div>
        </div>
      )}
    </div>
  );
}
