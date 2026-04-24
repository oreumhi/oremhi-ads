// ============================================
// 보고서 업로드 페이지
// ============================================

import React, { useState, useRef } from 'react';
import { C } from '../config';
import { parseFile, findUnmappedKeys } from '../parsers';
import { fmt, fmtWon } from '../utils';

export default function Upload({ data, uploadAdData }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const fileRef = useRef();

  const handleFile = async (file) => {
    setUploading(true);
    setError('');
    setResult(null);
    setProgress(null);

    try {
      // 1. 파싱
      setProgress({ stage: 'parsing', message: '파일을 분석하는 중...' });
      const { data: parsed, summary } = await parseFile(file);

      // 2. 저장 (배치 + 진행률)
      setProgress({ stage: 'uploading', message: '데이터를 저장하는 중...', current: 0, total: 1, rows: 0, totalRows: parsed.length });
      const saveResult = await uploadAdData(parsed, (p) => {
        setProgress({
          stage: 'uploading',
          message: `저장 중... (${p.current}/${p.total} 배치, ${fmt(p.rows)}/${fmt(p.totalRows)}행)`,
          current: p.current,
          total: p.total,
          rows: p.rows,
          totalRows: p.totalRows,
        });
      });

      // 저장 실패 체크
      if (saveResult.error) {
        setError('데이터 저장 실패: ' + saveResult.error);
        setUploading(false);
        setProgress(null);
        return;
      }

      // 3. 미매핑 확인
      const unmapped = findUnmappedKeys(parsed, data.mappings);

      setResult({
        fileName: file.name,
        ...summary,
        saved: saveResult,
        unmappedCount: unmapped.length,
      });
    } catch (e) {
      setError(e.message || '업로드 실패');
    }

    setUploading(false);
    setProgress(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e) => { e.preventDefault(); };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>보고서 업로드</h2>

      {/* 안내 */}
      <div style={{ background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 12.5, color: C.txd, lineHeight: 1.8 }}>
        네이버 검색광고 또는 GFA에서 다운받은 CSV 파일을 올려주세요.<br />
        · 검색광고와 GFA 파일은 <b>따로 올려야</b> 합니다<br />
        · 같은 파일을 다시 올리면 기존 데이터를 <b>자동으로 덮어씁니다</b> (중복 걱정 없음)<br />
        · 파일 유형은 <b>자동 감지</b>됩니다
      </div>

      {/* 업로드 영역 */}
      <div
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{
          background: C.sf, border: `2px dashed ${C.bd}`, borderRadius: 14,
          padding: 50, textAlign: 'center', cursor: 'pointer',
          transition: 'border-color 0.2s',
          marginBottom: 16,
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = C.ac}
        onMouseLeave={e => e.currentTarget.style.borderColor = C.bd}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>📤</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          클릭 또는 드래그하여 파일 업로드
        </div>
        <div style={{ color: C.txd, fontSize: 12 }}>
          CSV 파일 (.csv) 지원
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {/* 업로드 중 + 진행률 */}
      {uploading && (
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 30, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8, animation: 'spin 1s linear infinite' }}>⏳</div>
          <div style={{ color: C.txd, marginBottom: 12 }}>{progress?.message || '파일을 분석하는 중...'}</div>
          {progress?.stage === 'uploading' && progress.total > 0 && (
            <div>
              <div style={{ background: '#1a1e2c', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ background: C.ac, height: '100%', borderRadius: 8, width: `${(progress.current / progress.total) * 100}%`, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: 11, color: C.txm }}>{fmt(progress.rows)} / {fmt(progress.totalRows)}행 완료</div>
            </div>
          )}
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div style={{ background: C.no + '12', border: `1px solid ${C.no}33`, borderRadius: 10, padding: 14 }}>
          <div style={{ color: C.no, fontWeight: 600, marginBottom: 4 }}>⚠️ 업로드 실패</div>
          <div style={{ color: C.txd, fontSize: 13, whiteSpace: 'pre-wrap' }}>{error}</div>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div style={{ background: C.ok + '08', border: `1px solid ${C.ok}33`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ok, marginBottom: 12 }}>✅ 업로드 완료</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[
              ['파일', result.fileName],
              ['유형', result.fileType],
              ['기간', `${result.dateRange.from} ~ ${result.dateRange.to}`],
              ['데이터 행', `${fmt(result.totalRows)}건`],
              ['광고유형', result.adTypes.join(', ')],
              ['고유 항목', `${result.matchKeys.length}개`],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: 10, background: C.sf, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: C.txd, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          {result.unmappedCount > 0 && (
            <div style={{ marginTop: 12, padding: 10, background: C.warn + '12', borderRadius: 8, fontSize: 13, color: C.warn }}>
              ⚠️ {result.unmappedCount}개 항목이 아직 매핑되지 않았습니다.
              "매핑 관리" 메뉴에서 브랜드·제품을 연결해주세요.
            </div>
          )}
        </div>
      )}

      {/* 업로드 이력 */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>📋 현재 데이터 현황</div>
        <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
            <span>총 데이터: <b>{fmt(data.adData.length)}</b>건</span>
            <span>매핑 완료: <b>{data.mappings.length}</b>개</span>
            <span>미매핑: <b>{findUnmappedKeys(data.adData, data.mappings).length}</b>개</span>
          </div>
        </div>
      </div>
    </div>
  );
}
