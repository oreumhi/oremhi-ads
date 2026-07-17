// ============================================
// 보고서 업로드 페이지
// ============================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { C } from '../config';
import { parseFile, findUnmappedKeys } from '../parsers';
import { fmt, fmtWon } from '../utils';
import { fetchCollectorAdvertisers, addCollectorAdvertiser, setAdvertiserActive, deleteCollectorAdvertiser } from '../advertisers';

// ─── 자동 수집 업체 관리 (관리자 전용) ───
function AdvertiserManager() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: '', account_id: '', source: 'search' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setList(await fetchCollectorAdvertisers()), []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const add = async () => {
    setBusy(true);
    const r = await addCollectorAdvertiser(form);
    setBusy(false);
    if (r.ok) { setForm({ name: '', account_id: '', source: 'search' }); flash('✅ 추가 완료 — 다음 새벽 4:30 수집부터 자동 반영됩니다.'); load(); }
    else alert(r.msg);
  };
  const toggle = async (a) => {
    await setAdvertiserActive(a.id, !a.active); load();
    flash(a.active ? '⏸ 일시중지 (데이터 유지, 수집만 중단)' : '▶ 수집 재개');
  };
  const remove = async (a) => {
    if (!confirm("'" + a.name + "' 업체를 삭제할까요?\n\n· 자동 수집만 중단됩니다\n· 이미 수집된 과거 데이터는 그대로 남습니다")) return;
    await deleteCollectorAdvertiser(a.id); load(); flash('🗑 삭제 완료');
  };

  const inp = { background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '9px 12px', color: C.tx, fontSize: 13 };
  const btn = { padding: '9px 16px', borderRadius: 8, border: 'none', background: C.ac, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 };
  const sbtn = { padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.bd}`, background: C.sf2, color: C.tx, cursor: 'pointer', fontSize: 12 };
  const cell = { padding: '8px 10px', fontSize: 13, borderTop: `1px solid ${C.bd}` };

  return (
    <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>🤖 자동 수집 업체 관리</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 12 }}>
        여기서 추가/삭제하면 <b>다음 새벽 4:30 자동 수집부터 바로 반영</b>됩니다. 새 업체는 첫 수집 후 '매핑 관리'에서 브랜드에 연결해 주세요.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <input style={{ ...inp, flex: 1, minWidth: 140 }} placeholder="업체 이름 (예: 새업체_SA)" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input style={{ ...inp, width: 150 }} placeholder="광고계정 번호" value={form.account_id}
          onChange={e => setForm(f => ({ ...f, account_id: e.target.value.replace(/[^0-9]/g, '') }))} />
        <select style={{ ...inp, width: 150 }} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
          <option value="search">검색광고</option>
          <option value="gfa">디스플레이(GFA)</option>
        </select>
        <button style={btn} disabled={busy} onClick={add}>{busy ? '추가 중…' : '+ 업체 추가'}</button>
      </div>
      <div style={{ fontSize: 11.5, color: C.txm, marginBottom: 10 }}>
        광고계정 번호 = 광고주센터에서 그 계정에 들어갔을 때 주소창의 숫자 (ads.naver.com/manage/ad-accounts/<b style={{ color: C.cyan }}>1234567</b>/…)
      </div>
      {msg && <div style={{ fontSize: 13, color: C.ok, marginBottom: 8, fontWeight: 700 }}>{msg}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ ...cell, borderTop: 'none', textAlign: 'left', color: C.txd, fontSize: 12 }}>업체</th>
          <th style={{ ...cell, borderTop: 'none', color: C.txd, fontSize: 12 }}>계정번호</th>
          <th style={{ ...cell, borderTop: 'none', color: C.txd, fontSize: 12 }}>유형</th>
          <th style={{ ...cell, borderTop: 'none', color: C.txd, fontSize: 12 }}>상태</th>
          <th style={{ ...cell, borderTop: 'none', color: C.txd, fontSize: 12 }}>관리</th>
        </tr></thead>
        <tbody>
          {list.map(a => (
            <tr key={a.id} style={{ opacity: a.active ? 1 : 0.5 }}>
              <td style={{ ...cell, fontWeight: 700 }}>{a.name}</td>
              <td style={{ ...cell, textAlign: 'center', color: C.txd }}>{a.account_id}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{a.source === 'gfa' ? '🟣 GFA' : '🔵 검색'}</td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {a.active ? <span style={{ color: C.ok, fontWeight: 700 }}>수집중</span> : <span style={{ color: C.warn }}>일시중지</span>}
              </td>
              <td style={{ ...cell, textAlign: 'center', whiteSpace: 'nowrap' }}>
                <button style={sbtn} onClick={() => toggle(a)}>{a.active ? '⏸ 중지' : '▶ 재개'}</button>
                <button style={{ ...sbtn, color: C.no, marginLeft: 6 }} onClick={() => remove(a)}>삭제</button>
              </td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={5} style={{ ...cell, color: C.txd }}>등록된 업체가 없습니다. 위에서 추가하세요.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function Upload({ data, uploadAdData, currentUser }) {
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

      {currentUser?.role === 'admin' && <AdvertiserManager />}

      {/* 안내 */}
      <div style={{ background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 12.5, color: C.txd, lineHeight: 1.8 }}>
        네이버 검색광고 또는 GFA에서 다운받은 CSV 파일을 올려주세요.<br />
        · 검색광고와 GFA 파일은 <b>따로 올려야</b> 합니다<br />
        · 같은 파일을 다시 올리면 기존 데이터를 <b>자동으로 덮어씁니다</b> (중복 걱정 없음)<br />
        · 파일 유형은 <b>자동 감지</b>됩니다
      </div>

      {/* 양식 다운로드 */}
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, padding:'12px 16px', background:C.sf, border:`1px solid ${C.bd}`, borderRadius:10 }}>
        <span style={{ fontSize:13, color:C.txd, fontWeight:600, marginRight:4 }}>📋 양식 다운로드:</span>
        <a href="/templates/sa_template.xlsx" download="SA_검색광고_양식.xlsx"
          style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', background:C.ac+'18', border:`1px solid ${C.ac}55`, borderRadius:7, color:C.ac, fontSize:12, fontWeight:600, textDecoration:'none', cursor:'pointer' }}>
          ⬇️ SA 양식
        </a>
        <a href="/templates/gfa_template.xlsx" download="GFA_양식.xlsx"
          style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', background:C.ok+'18', border:`1px solid ${C.ok}55`, borderRadius:7, color:C.ok, fontSize:12, fontWeight:600, textDecoration:'none', cursor:'pointer' }}>
          ⬇️ GFA 양식
        </a>
        <span style={{ fontSize:11, color:C.txm, marginLeft:'auto' }}>양식 파일을 받아 컬럼 형식을 확인하세요</span>
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
        accept=".csv,.CSV"
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
