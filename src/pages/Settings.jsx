// ============================================
// 설정 페이지
// ============================================

import React, { useState } from 'react';
import { C } from '../config';
import { fmt } from '../utils';

export default function Settings({ data, clearAdData }) {
  const [msg, setMsg] = useState('');

  const handleClear = async () => {
    if (!confirm('⚠️ 모든 광고 데이터를 삭제합니다.\n매핑 설정은 유지됩니다.\n계속하시겠습니까?')) return;
    if (!confirm('정말로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    await clearAdData();
    setMsg('✅ 광고 데이터가 삭제되었습니다.');
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
