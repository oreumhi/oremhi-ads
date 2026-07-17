// ============================================
// 상품 분석 페이지
//   스마트스토어 주소 등록 → (수동 실행) → 후기 많은 상품별
//   리뷰 장단점 + 메인키워드 + 네이버쇼핑 가격 시장조사 결과 표시
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { C } from '../config';
import { fetchAnalyses, requestAnalysis, deleteAnalysis, fetchAnalysisItems } from '../productAnalysis';
import { fmtNum } from '../utils';

const won = (n) => '₩' + fmtNum(Math.round(n || 0));
const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const inp = { background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '10px 12px', color: C.tx, fontSize: 13 };
const btn = { padding: '10px 16px', borderRadius: 8, border: 'none', background: C.ac, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 };
const sbtn = { padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.bd}`, background: C.sf2, color: C.tx, cursor: 'pointer', fontSize: 12 };
const tag = (bg, color) => ({ display: 'inline-block', padding: '3px 9px', borderRadius: 14, fontSize: 12, background: bg, color, margin: '2px 4px 2px 0' });

const STATUS_COLOR = { '대기': C.warn, '수집중': C.cyan, '완료': C.ok, '실패': C.no };

function PriceBar({ market }) {
  const { low, high, my_price, median } = market || {};
  if (!low || !high || high <= low) return null;
  const pct = (v) => Math.max(0, Math.min(100, (v - low) / (high - low) * 100));
  return (
    <div style={{ margin: '8px 0 4px' }}>
      <div style={{ position: 'relative', height: 10, background: `linear-gradient(90deg, ${C.ok}55, ${C.warn}55, ${C.no}55)`, borderRadius: 6 }}>
        {median > 0 && <div title={`중간값 ${won(median)}`} style={{ position: 'absolute', left: pct(median) + '%', top: -2, width: 2, height: 14, background: C.txd }} />}
        {my_price > 0 && <div title={`내 가격 ${won(my_price)}`} style={{ position: 'absolute', left: `calc(${pct(my_price)}% - 6px)`, top: -4, width: 12, height: 18, background: C.ac, borderRadius: 4, border: '2px solid #fff' }} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.txd, marginTop: 3 }}>
        <span>최저 {won(low)}</span><span>중간 {won(median)}</span><span>최고 {won(high)}</span>
      </div>
    </div>
  );
}

function ItemCard({ it }) {
  const [open, setOpen] = useState(false);
  const m = it.market || {};
  return (
    <div style={{ background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ flex: 1 }}>
          <a href={it.url} target="_blank" rel="noreferrer" style={{ color: C.tx, fontWeight: 800, fontSize: 13.5, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
            {it.product_name} ↗
          </a>
          <div style={{ fontSize: 12, color: C.txd, marginTop: 3 }}>
            {won(it.price)} · ⭐{it.rating || '-'} · 리뷰 {fmtNum(it.review_count)}개 (표본 {it.reviews_sampled})
            {m.my_position_pct != null && <span style={{ marginLeft: 8, color: C.cyan }}>가격 위치: 시장 하위 {m.my_position_pct}%</span>}
          </div>
        </div>
        <span style={{ color: C.txd }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ok, marginBottom: 4 }}>🟢 장점 (긍정 리뷰에서 자주 언급)</div>
          <div>{(it.pros || []).length ? it.pros.map((p, i) => (
            <span key={i} style={tag('rgba(61,217,160,0.12)', C.ok)} title={p.example}>{p.aspect} ×{p.count}</span>
          )) : <span style={{ fontSize: 12, color: C.txm }}>표본 부족</span>}</div>
          {(it.pros || []).filter(p => p.example).slice(0, 2).map((p, i) => (
            <div key={i} style={{ fontSize: 12, color: C.txd, marginTop: 3 }}>· "{p.example}"</div>
          ))}
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.no, margin: '10px 0 4px' }}>🔴 단점 (부정 리뷰에서 자주 언급)</div>
          <div>{(it.cons || []).length ? it.cons.map((p, i) => (
            <span key={i} style={tag('rgba(240,112,112,0.12)', C.no)} title={p.example}>{p.aspect} ×{p.count}</span>
          )) : <span style={{ fontSize: 12, color: C.txm }}>부정 리뷰 거의 없음 👍</span>}</div>
          {(it.cons || []).filter(p => p.example).slice(0, 2).map((p, i) => (
            <div key={i} style={{ fontSize: 12, color: C.txd, marginTop: 3 }}>· "{p.example}"</div>
          ))}
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.cyan, margin: '10px 0 2px' }}>🔎 시장조사 — "{m.keyword || '-'}" (네이버쇼핑 {m.sample || 0}개 표본)</div>
          {m.sample > 0 ? (
            <div>
              <PriceBar market={m} />
              <div style={{ fontSize: 12, color: C.txd }}>평균 {won(m.avg)} · 내 가격 {won(m.my_price)} {m.my_position_pct != null && `(시장의 ${m.my_position_pct}%보다 비쌈)`}</div>
              <div style={{ fontSize: 12, color: C.txd, marginTop: 6 }}>경쟁 상품:</div>
              {(m.competitors || []).slice(0, 5).map((cp, i) => (
                <div key={i} style={{ fontSize: 12, color: C.txm }}>· {cp.title} — <b style={{ color: C.tx }}>{won(cp.price)}</b></div>
              ))}
            </div>
          ) : <div style={{ fontSize: 12, color: C.txm }}>시장 데이터 수집 실패 (재실행 시 다시 시도)</div>}
          {it.ai_summary && <div style={{ marginTop: 10, background: 'rgba(157,127,240,0.08)', border: '1px solid rgba(157,127,240,0.3)', borderRadius: 8, padding: 10, fontSize: 12.5 }}>🤖 {it.ai_summary}</div>}
        </div>
      )}
    </div>
  );
}

export default function ProductAnalysis({ currentUser }) {
  const [list, setList] = useState([]);
  const [url, setUrl] = useState('');
  const [sel, setSel] = useState(null);
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => setList(await fetchAnalyses()), []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (sel) fetchAnalysisItems(sel).then(setItems); else setItems([]); }, [sel]);

  const add = async () => {
    const r = await requestAnalysis(url, currentUser?.name);
    if (r.ok) { setUrl(''); setMsg('✅ 등록됨 — 바탕화면 [상품분석] 폴더의 "상품분석_실행.bat"을 실행하면 분석이 시작됩니다 (스토어당 3~6분).'); load(); }
    else alert(r.msg);
    setTimeout(() => setMsg(''), 8000);
  };

  const selA = list.find(a => a.id === sel);

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>상품 분석</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 14 }}>
        스마트스토어 주소를 등록하면 후기 많은 상품 순으로 리뷰 장단점 + 메인 키워드 가격 시장조사를 분석합니다. (우리 광고주든 경쟁사든 가능)
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inp, flex: 1, minWidth: 260 }} placeholder="https://smartstore.naver.com/스토어명"
            value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          <button style={btn} onClick={add}>+ 분석 등록</button>
        </div>
        {msg && <div style={{ fontSize: 13, color: C.ok, marginTop: 8, fontWeight: 700 }}>{msg}</div>}
        <div style={{ fontSize: 11.5, color: C.txm, marginTop: 6 }}>
          ⚙ 실행은 수동입니다: 등록 후 <b style={{ color: C.txd }}>바탕화면 → 상품분석 → 상품분석_실행.bat</b> 더블클릭 (본인 PC 아무거나 OK)
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 8 }}>분석 목록</div>
        {list.length === 0 && <div style={{ fontSize: 13, color: C.txd }}>아직 없습니다. 위에서 스토어 주소를 등록하세요.</div>}
        {list.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderTop: `1px solid ${C.bd}`, cursor: a.status === '완료' ? 'pointer' : 'default' }}
            onClick={() => a.status === '완료' && setSel(sel === a.id ? null : a.id)}>
            <span style={{ color: STATUS_COLOR[a.status] || C.txd, fontWeight: 800, fontSize: 12, minWidth: 44 }}>{a.status}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{a.store_name || a.store_url.replace(/https?:\/\//, '')}</span>
              <span style={{ fontSize: 11.5, color: C.txm, marginLeft: 8 }}>{(a.created_at || '').slice(5, 16).replace('T', ' ')} · {a.requested_by}</span>
              {a.note && <span style={{ fontSize: 11.5, color: C.txd, marginLeft: 8 }}>{a.note}</span>}
            </div>
            {a.status === '완료' && <span style={{ fontSize: 12, color: C.cyan }}>{sel === a.id ? '접기 ▲' : '결과 보기 ▼'}</span>}
            <button style={{ ...sbtn, color: C.no }} onClick={e => { e.stopPropagation(); if (confirm('이 분석을 삭제할까요?')) deleteAnalysis(a.id).then(load); }}>삭제</button>
          </div>
        ))}
      </div>

      {selA && sel && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>📊 {selA.store_name || selA.store_url} — 상품별 분석</div>
          <div style={{ fontSize: 12, color: C.txd, marginBottom: 12 }}>후기 많은 순 · 카드를 클릭하면 장단점/시장조사가 펼쳐집니다.</div>
          {selA.ai_summary && <div style={{ background: 'rgba(157,127,240,0.08)', border: '1px solid rgba(157,127,240,0.3)', borderRadius: 10, padding: 12, fontSize: 13, marginBottom: 12 }}>🤖 종합: {selA.ai_summary}</div>}
          {items.map(it => <ItemCard key={it.id} it={it} />)}
          {items.length === 0 && <div style={{ fontSize: 13, color: C.txd }}>결과 없음</div>}
        </div>
      )}
    </div>
  );
}
