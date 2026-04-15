// ============================================
// 설정 페이지 - 비밀번호 관리 추가 (#6)
// ============================================

import React, { useState } from 'react';
import { C } from '../config';
import { fmt, hashPin } from '../utils';
import { saveSettings } from '../store';

export default function Settings({ data, clearAdData, settings, setSettings }) {
  const [msg, setMsg] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  const handleClear = async () => {
    if (!confirm('⚠️ 모든 광고 데이터를 삭제합니다.\n매핑 설정은 유지됩니다.\n계속하시겠습니까?')) return;
    if (!confirm('정말로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    await clearAdData();
    setMsg('✅ 광고 데이터가 삭제되었습니다.');
  };

  // 비밀번호 설정
  const setPassword = async () => {
    if (pin.length < 4) return setMsg('❌ 비밀번호는 4자리 이상이어야 합니다');
    if (pin !== pinConfirm) return setMsg('❌ 비밀번호가 일치하지 않습니다');
    const hash = await hashPin(pin);
    await saveSettings({ pin_hash: hash });
    if (setSettings) setSettings(prev => ({ ...prev, pin_hash: hash }));
    setPin(''); setPinConfirm('');
    setMsg('✅ 비밀번호가 설정되었습니다');
  };

  // 비밀번호 해제
  const removePassword = async () => {
    if (!confirm('비밀번호를 해제하시겠습니까?')) return;
    await saveSettings({ pin_hash: null });
    if (setSettings) setSettings(prev => ({ ...prev, pin_hash: null }));
    setMsg('✅ 비밀번호가 해제되었습니다');
  };

  // 데이터 통계
  const dates = [...new Set(data.adData.map(d => d.date))].sort();
  const sources = {};
  data.adData.forEach(d => { sources[d.source] = (sources[d.source] || 0) + 1; });

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>설정</h2>

      {msg && (
        <div style={{ background: msg.includes('✅') ? C.ok + '12' : C.no + '12', border: `1px solid ${msg.includes('✅') ? C.ok : C.no}33`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontWeight: 600, color: msg.includes('✅') ? C.ok : C.no }}>{msg}</div>
        </div>
      )}

      {/* 데이터 현황 */}
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

      {/* 비밀번호 잠금 (#6) */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>🔒 비밀번호 잠금</div>
        {settings?.pin_hash ? (
          <div>
            <div style={{ color: C.ok, marginBottom: 10 }}>✅ 비밀번호가 설정되어 있습니다</div>
            <button onClick={removePassword} style={{ background: C.no, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              비밀번호 해제
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: C.txd, marginBottom: 10 }}>비밀번호를 설정하면 앱 접속 시 비밀번호를 입력해야 합니다</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={inp} type="password" placeholder="비밀번호 (4자리 이상)" value={pin} onChange={e => setPin(e.target.value)} />
              <input style={inp} type="password" placeholder="비밀번호 확인" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)} />
              <button onClick={setPassword} style={{ background: C.ac, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>설정</button>
            </div>
          </div>
        )}
      </div>

      {/* 데이터 초기화 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>🗑️ 데이터 초기화</div>
        <div style={{ fontSize: 12, color: C.txd, marginBottom: 14, lineHeight: 1.7 }}>
          광고 데이터를 모두 삭제합니다.<br />
          매핑 설정(브랜드·제품 연결)은 유지됩니다.<br />
          삭제 후 보고서를 다시 업로드하면 됩니다.
        </div>
        <button onClick={handleClear} style={{ background: C.no, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
          광고 데이터 전체 삭제
        </button>
      </div>

      {/* 사용법 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>📖 사용법</div>
        <div style={{ fontSize: 13, color: C.txd, lineHeight: 2 }}>
          1. <b>보고서 업로드</b>에서 CSV 파일을 올립니다 (검색광고, GFA 각각)<br />
          2. <b>매핑 관리</b>에서 광고그룹/소재를 브랜드·제품에 연결합니다 (처음 1회)<br />
          3. <b>성과 보기</b>에서 모든 성과를 한눈에 확인합니다<br />
          4. 매일 보고서만 올리면 데이터가 누적됩니다
        </div>
      </div>

      {/* 시스템 정보 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>ℹ️ 시스템 정보</div>
        <div style={{ fontSize: 12, color: C.txd, lineHeight: 1.8 }}>
          주식회사 오름히 광고 성과 대시보드 v1.0<br />
          매핑 방식: 파워링크(그룹명) · 쇼핑검색(소재ID) · 브랜드검색(그룹명) · GFA(그룹ID)
        </div>
      </div>
    </div>
  );
}

const card = { background: '#131620', border: '1px solid #282d40', borderRadius: 14, padding: 20, marginBottom: 14 };
const stat = { padding: 12, background: '#1a1e2c', borderRadius: 8 };
const inp = { background: '#1a1e2c', border: '1px solid #282d40', borderRadius: 8, padding: '10px 14px', color: '#e4e7ed', fontSize: 14, outline: 'none', width: 180, boxSizing: 'border-box' };
