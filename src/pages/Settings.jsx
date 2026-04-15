// ============================================
// 설정 페이지 v2
//
// 관리자 전용:
//   - 직원 계정 관리 (추가/삭제/브랜드 배정)
//   - 클라이언트 공유 링크 관리
// 공통:
//   - 데이터 현황
//   - 데이터 초기화
// ============================================

import React, { useState, useEffect, useMemo } from 'react';
import { C } from '../config';
import { fmt, hashPin, uid } from '../utils';
import { fetchUsers, createUser, deleteUser, updateUser, fetchShareLinks, createShareLink, deleteShareLink } from '../store';

export default function Settings({ data, clearAdData, currentUser, isAdmin }) {
  const [msg, setMsg] = useState('');

  // ─── 직원 관리 상태 ───
  const [users, setUsers] = useState([]);
  const [newStaff, setNewStaff] = useState({ name: '', username: '', password: '' });
  const [selectedBrands, setSelectedBrands] = useState([]);

  // ─── 공유 링크 상태 ───
  const [shareLinks, setShareLinks] = useState([]);
  const [newLink, setNewLink] = useState({ brand: '', password: '' });

  // ─── 매핑에서 브랜드 목록 추출 ───
  const allBrands = useMemo(() => {
    return [...new Set(data.mappings.map(m => m.brand))].sort();
  }, [data.mappings]);

  // ─── 초기 로드 ───
  useEffect(() => {
    if (isAdmin) {
      fetchUsers().then(setUsers);
      fetchShareLinks().then(setShareLinks);
    }
  }, [isAdmin]);

  // ─── 직원 추가 ───
  const handleAddStaff = async () => {
    if (!newStaff.name.trim()) return setMsg('❌ 직원 이름을 입력해주세요');
    if (!newStaff.username.trim()) return setMsg('❌ 아이디를 입력해주세요');
    if (newStaff.password.length < 4) return setMsg('❌ 비밀번호는 4자리 이상이어야 합니다');
    if (users.find(u => u.username === newStaff.username.trim())) return setMsg('❌ 이미 사용중인 아이디입니다');
    if (selectedBrands.length === 0) return setMsg('❌ 담당 브랜드를 1개 이상 선택해주세요');

    const hash = await hashPin(newStaff.password);
    const user = await createUser({
      name: newStaff.name.trim(),
      username: newStaff.username.trim(),
      password_hash: hash,
      role: 'staff',
      assigned_brands: JSON.stringify(selectedBrands),
    });
    if (user) {
      setUsers(prev => [...prev, user]);
      setNewStaff({ name: '', username: '', password: '' });
      setSelectedBrands([]);
      setMsg('✅ 직원 계정이 생성되었습니다');
    } else {
      setMsg('❌ 계정 생성 실패');
    }
  };

  // ─── 직원 삭제 ───
  const handleDeleteUser = async (id, name) => {
    if (!confirm(`"${name}" 계정을 삭제하시겠습니까?`)) return;
    if (await deleteUser(id)) {
      setUsers(prev => prev.filter(u => u.id !== id));
      setMsg('✅ 계정이 삭제되었습니다');
    }
  };

  // ─── 브랜드 선택 토글 ───
  const toggleBrand = (brand) => {
    setSelectedBrands(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  };

  // ─── 공유 링크 추가 ───
  const handleAddLink = async () => {
    if (!newLink.brand) return setMsg('❌ 브랜드를 선택해주세요');
    if (newLink.password.length < 4) return setMsg('❌ 비밀번호는 4자리 이상이어야 합니다');

    const code = uid(); // URL용 고유 코드
    const hash = await hashPin(newLink.password);
    const link = await createShareLink({
      brand: newLink.brand,
      code,
      password_hash: hash,
      active: true,
    });
    if (link) {
      setShareLinks(prev => [...prev, link]);
      setNewLink({ brand: '', password: '' });
      setMsg('✅ 공유 링크가 생성되었습니다');
    } else {
      setMsg('❌ 링크 생성 실패');
    }
  };

  // ─── 공유 링크 삭제 ───
  const handleDeleteLink = async (id, brand) => {
    if (!confirm(`"${brand}" 공유 링크를 삭제하시겠습니까?`)) return;
    if (await deleteShareLink(id)) {
      setShareLinks(prev => prev.filter(l => l.id !== id));
      setMsg('✅ 링크가 삭제되었습니다');
    }
  };

  // ─── 링크 URL 복사 ───
  const copyLink = (code) => {
    const url = `${window.location.origin}/share/${code}`;
    navigator.clipboard.writeText(url).then(() => setMsg('✅ 링크가 복사되었습니다'));
  };

  // ─── 데이터 초기화 ───
  const handleClear = async () => {
    if (!confirm('⚠️ 모든 광고 데이터를 삭제합니다.\n매핑 설정은 유지됩니다.\n계속하시겠습니까?')) return;
    if (!confirm('정말로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    await clearAdData();
    setMsg('✅ 광고 데이터가 삭제되었습니다.');
  };

  // ─── 데이터 통계 ───
  const dates = [...new Set(data.adData.map(d => d.date))].sort();
  const sources = {};
  data.adData.forEach(d => { sources[d.source] = (sources[d.source] || 0) + 1; });

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>설정</h2>

      {msg && (
        <div style={{ background: msg.includes('✅') ? C.ok + '12' : C.no + '12', border: `1px solid ${msg.includes('✅') ? C.ok : C.no}33`, borderRadius: 10, padding: 14, marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>
          <div style={{ fontWeight: 600, color: msg.includes('✅') ? C.ok : C.no, fontSize: 13 }}>{msg}</div>
        </div>
      )}

      {/* ═══ 관리자 전용: 직원 계정 관리 ═══ */}
      {isAdmin && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>👤 직원 계정 관리</div>

          {/* 기존 계정 목록 */}
          {users.filter(u => u.id !== currentUser?.id).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.txd, marginBottom: 8 }}>등록된 직원</div>
              {users.filter(u => u.id !== currentUser?.id).map(u => {
                let brands = [];
                try { brands = JSON.parse(u.assigned_brands || '[]'); } catch { brands = []; }
                return (
                  <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: C.sf2, borderRadius: 8, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {u.name}
                        <span style={{ fontSize: 11, color: C.txd, fontWeight: 400, marginLeft: 6 }}>({u.username})</span>
                        <span style={{ fontSize: 10, color: u.role === 'admin' ? C.ac : C.txd, marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: u.role === 'admin' ? C.ac + '18' : C.sf3 }}>
                          {u.role === 'admin' ? '관리자' : '직원'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: C.txd, marginTop: 2 }}>
                        담당: {brands.length > 0 ? brands.join(', ') : '없음'}
                      </div>
                    </div>
                    {u.role !== 'admin' && (
                      <button onClick={() => handleDeleteUser(u.id, u.name)} style={{ background: 'none', border: `1px solid ${C.no}44`, borderRadius: 6, padding: '4px 10px', color: C.no, cursor: 'pointer', fontSize: 11 }}>
                        삭제
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 새 직원 추가 */}
          <div style={{ padding: 14, background: C.sf2, borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>새 직원 추가</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              <input style={inp} placeholder="이름" value={newStaff.name} onChange={e => setNewStaff(p => ({ ...p, name: e.target.value }))} />
              <input style={inp} placeholder="아이디" value={newStaff.username} onChange={e => setNewStaff(p => ({ ...p, username: e.target.value }))} />
              <input style={inp} type="password" placeholder="비밀번호 (4자리+)" value={newStaff.password} onChange={e => setNewStaff(p => ({ ...p, password: e.target.value }))} />
            </div>
            <div style={{ fontSize: 12, color: C.txd, marginBottom: 6 }}>담당 브랜드 선택:</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {allBrands.length === 0 ? (
                <span style={{ fontSize: 12, color: C.txm }}>매핑된 브랜드가 없습니다. 먼저 매핑을 설정해주세요.</span>
              ) : allBrands.map(b => (
                <button key={b} onClick={() => toggleBrand(b)} style={{
                  padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                  background: selectedBrands.includes(b) ? C.ac + '22' : C.sf3,
                  color: selectedBrands.includes(b) ? C.ac : C.txd,
                  border: `1px solid ${selectedBrands.includes(b) ? C.ac + '55' : C.bd}`,
                }}>
                  {selectedBrands.includes(b) ? '✓ ' : ''}{b}
                </button>
              ))}
            </div>
            <button onClick={handleAddStaff} style={{ background: C.ac, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              직원 추가
            </button>
          </div>
        </div>
      )}

      {/* ═══ 관리자 전용: 클라이언트 공유 링크 ═══ */}
      {isAdmin && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>🔗 클라이언트 공유 링크</div>
          <div style={{ fontSize: 12, color: C.txd, marginBottom: 14 }}>
            링크와 비밀번호를 클라이언트에게 전달하면, 해당 브랜드 대시보드만 볼 수 있습니다.
          </div>

          {/* 기존 링크 목록 */}
          {shareLinks.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {shareLinks.map(link => {
                const linkUrl = `${window.location.origin}/share/${link.code}`;
                return (
                  <div key={link.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: C.sf2, borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.pur }}>{link.brand}</div>
                      <div style={{ fontSize: 11, color: C.txd, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {linkUrl}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginLeft: 10, flexShrink: 0 }}>
                      <button onClick={() => copyLink(link.code)} style={{ background: C.ac, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                        복사
                      </button>
                      <button onClick={() => handleDeleteLink(link.id, link.brand)} style={{ background: 'none', border: `1px solid ${C.no}44`, borderRadius: 6, padding: '5px 10px', color: C.no, cursor: 'pointer', fontSize: 11 }}>
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 새 링크 추가 */}
          <div style={{ padding: 14, background: C.sf2, borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>새 공유 링크 만들기</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <div>
                <div style={{ fontSize: 11, color: C.txd, marginBottom: 4 }}>브랜드 선택</div>
                <select style={sel} value={newLink.brand} onChange={e => setNewLink(p => ({ ...p, brand: e.target.value }))}>
                  <option value="">브랜드 선택</option>
                  {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.txd, marginBottom: 4 }}>비밀번호 (4자리+)</div>
                <input style={inp} type="text" placeholder="클라이언트에게 전달할 비밀번호" value={newLink.password} onChange={e => setNewLink(p => ({ ...p, password: e.target.value }))} />
              </div>
              <button onClick={handleAddLink} style={{ background: C.pur, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                링크 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 데이터 현황 ═══ */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>📊 데이터 현황</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div style={stat}>
            <div style={{ fontSize: 11, color: C.txd }}>총 데이터</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ac }}>{fmt(data.adData.length)}건</div>
          </div>
          <div style={stat}>
            <div style={{ fontSize: 11, color: C.txd }}>매핑 설정</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ok }}>{data.mappings.length}개</div>
          </div>
          <div style={stat}>
            <div style={{ fontSize: 11, color: C.txd }}>기간</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '-'}
            </div>
          </div>
          <div style={stat}>
            <div style={{ fontSize: 11, color: C.txd }}>검색광고 / GFA</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {fmt(sources['search'] || 0)} / {fmt(sources['gfa'] || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 데이터 초기화 (관리자만) ═══ */}
      {isAdmin && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>🗑️ 데이터 초기화</div>
          <div style={{ fontSize: 12, color: C.txd, marginBottom: 14, lineHeight: 1.7 }}>
            광고 데이터를 모두 삭제합니다. 매핑 설정은 유지됩니다.
          </div>
          <button onClick={handleClear} style={{ background: C.no, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            광고 데이터 전체 삭제
          </button>
        </div>
      )}

      {/* ═══ 사용법 ═══ */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>📖 사용법</div>
        <div style={{ fontSize: 13, color: C.txd, lineHeight: 2 }}>
          1. <b>보고서 업로드</b>에서 CSV 파일을 올립니다 (검색광고, GFA 각각)<br />
          2. <b>매핑 관리</b>에서 광고그룹/소재를 브랜드·제품에 연결합니다 (처음 1회)<br />
          3. <b>성과 보기</b>에서 모든 성과를 한눈에 확인합니다<br />
          4. 매일 보고서만 올리면 데이터가 누적됩니다
        </div>
      </div>
    </div>
  );
}

const card = { background: '#131620', border: '1px solid #282d40', borderRadius: 14, padding: 20, marginBottom: 14 };
const stat = { padding: 12, background: '#1a1e2c', borderRadius: 8 };
const inp = { background: '#1a1e2c', border: '1px solid #282d40', borderRadius: 8, padding: '10px 14px', color: '#e4e7ed', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const sel = { background: '#1a1e2c', border: '1px solid #282d40', borderRadius: 8, padding: '10px 14px', color: '#e4e7ed', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
