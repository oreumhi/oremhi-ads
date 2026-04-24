// ============================================
// CSV 파서
//
// 검색광고와 GFA 보고서를 파싱합니다.
// 파일 양식이 변경되면 이 파일만 수정하면 됩니다.
//
// 핵심 규칙:
//   - 검색광고: 첫 행은 제목(건너뜀), 둘째 행이 헤더
//   - GFA: 첫 행이 바로 헤더
//   - 날짜 형식: "2026.04.07." → "2026-04-07"
//   - 같은 (날짜, match_key) 데이터는 합산
// ============================================

import Papa from 'papaparse';
import { parseNaverDate, uid } from './utils';
import { classifySearchAdType, classifyGfaAdType, makeMatchKey, labelFromMatchKey } from './config';

// ─── CSV 파일 읽기 (인코딩 자동 감지) ───
function readCsv(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;

      // 인코딩 자동 감지 (여러 인코딩 시도)
      let text = '';
      let detectedEncoding = '';

      // 1차: UTF-8
      const utf8Text = new TextDecoder('utf-8').decode(buffer);
      const hasKoreanUTF8 = /[가-힣]/.test(utf8Text) && (utf8Text.includes('캠페인') || utf8Text.includes('광고') || utf8Text.includes('노출') || utf8Text.includes('클릭') || utf8Text.includes('비용') || utf8Text.includes('기간'));

      if (hasKoreanUTF8) {
        text = utf8Text;
        detectedEncoding = 'UTF-8';
      } else {
        // 2차: EUC-KR (CP949 포함)
        try {
          const eucText = new TextDecoder('euc-kr').decode(buffer);
          const hasKoreanEUC = /[가-힣]/.test(eucText) && (eucText.includes('캠페인') || eucText.includes('광고') || eucText.includes('노출') || eucText.includes('클릭') || eucText.includes('비용') || eucText.includes('기간'));
          if (hasKoreanEUC) {
            text = eucText;
            detectedEncoding = 'EUC-KR';
          } else {
            // 3차: 한글이 하나라도 있으면 EUC-KR 우선, 없으면 UTF-8
            text = /[가-힣]/.test(eucText) ? eucText : utf8Text;
            detectedEncoding = /[가-힣]/.test(eucText) ? 'EUC-KR(추정)' : 'UTF-8(추정)';
          }
        } catch {
          text = utf8Text;
          detectedEncoding = 'UTF-8(기본)';
        }
      }

      // BOM 제거
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

      console.log('[파서] 인코딩:', detectedEncoding, '| 파일명:', file.name, '| 크기:', file.size, '바이트');

      Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
        complete: (result) => resolve(result.data),
        error: (err) => reject(new Error('CSV 파싱 실패: ' + err.message)),
      });
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsArrayBuffer(file);
  });
}

// ─── 파일 유형 자동 감지 (개선) ───
export function detectFileType(rows) {
  if (!rows || rows.length < 2) return null;

  const firstRow = (rows[0] || []).join('');
  const secondRow = (rows[1] || []).join('');
  const thirdRow = (rows[2] || []).join('');

  // 검색광고: 첫 행이 제목행 (보고서명, 숫자ID 등)
  if (firstRow.includes('보고서') || firstRow.match(/^\d{4,}/) || firstRow.match(/^[0-9,]+$/)) {
    if (secondRow.includes('캠페인유형') || secondRow.includes('광고그룹유형') || secondRow.includes('캠페인') && secondRow.includes('소재')) {
      return 'search';
    }
  }

  // GFA: 첫 행에 GFA 특유의 컬럼명
  if (firstRow.includes('광고 그룹 이름') || firstRow.includes('캠페인 ID') || firstRow.includes('평균 CPM') || firstRow.includes('캠페인 이름') && firstRow.includes('기간')) {
    return 'gfa';
  }

  // 첫 행이 검색광고 헤더일 수도 있음 (제목행이 없는 경우)
  if (firstRow.includes('캠페인유형') || (firstRow.includes('캠페인') && firstRow.includes('소재') && firstRow.includes('노출수'))) {
    return 'search_no_title';
  }

  // 2행 또는 3행에서 다시 시도 (앞에 빈 행이 있을 수 있음)
  if (secondRow.includes('캠페인유형') || (secondRow.includes('캠페인') && secondRow.includes('노출수'))) {
    return 'search';
  }
  if (secondRow.includes('광고 그룹 이름') || secondRow.includes('캠페인 ID')) {
    return 'gfa';
  }

  return null;
}

// ─── 검색광고 파싱 ───
function parseSearchAd(rows, hasTitleRow = true) {
  const headerIdx = hasTitleRow ? 1 : 0;
  const header = rows[headerIdx];
  if (!header) throw new Error('검색광고 헤더를 찾을 수 없습니다');

  // 컬럼 인덱스 찾기 (컬럼 순서가 바뀌어도 작동하도록)
  const col = {};
  header.forEach((name, idx) => {
    const n = name.trim();
    if (n === '캠페인')                col.campaign = idx;
    if (n === '캠페인유형')             col.campaignType = idx;
    if (n === '광고그룹')               col.group = idx;
    if (n === '광고그룹유형')            col.groupType = idx;
    if (n === '소재')                   col.material = idx;
    if (n === '소재 유형')              col.materialType = idx;
    if (n === '일별')                   col.date = idx;
    if (n === '노출수')                 col.impressions = idx;
    if (n === '클릭수')                 col.clicks = idx;
    if (n.includes('클릭률'))           col.ctr = idx;
    if (n.includes('평균') && n.includes('CPC')) col.cpc = idx;
    if (n === '총비용')                 col.cost = idx;
    if (n.includes('전환수'))           col.conversions = idx;
    if (n.includes('전환매출'))          col.convRevenue = idx;
  });

  // 필수 컬럼 확인
  const required = ['campaignType', 'campaign', 'group', 'date', 'impressions', 'cost'];
  const missing = required.filter(k => col[k] === undefined);
  if (missing.length > 0) {
    throw new Error(`검색광고 필수 컬럼 누락: ${missing.join(', ')}\n찾은 컬럼: ${header.join(', ')}`);
  }

  // 데이터 행 파싱
  const parsed = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;

    const campaignType = (row[col.campaignType] || '').trim();
    const campaignName = (row[col.campaign] || '').trim();
    const groupName = (row[col.group] || '').trim();
    const materialId = (row[col.material] || '').trim();
    const dateStr = (row[col.date] || '').trim();

    const date = parseNaverDate(dateStr);
    if (!date) continue; // 날짜가 없는 행은 건너뜀

    const adType = classifySearchAdType(campaignType);

    const matchKey = makeMatchKey({
      source: 'search',
      adType,
      campaignName,
      groupName,
      groupId: null,
      materialId,
    });

    parsed.push({
      date,
      source: 'search',
      ad_type: adType,
      campaign_name: campaignName,
      group_name: groupName,
      group_id: null,
      material_id: materialId,
      material_name: (row[col.materialType] || '').trim(),
      match_key: matchKey,
      impressions: parseInt(row[col.impressions]) || 0,
      clicks: parseInt(row[col.clicks]) || 0,
      cost: parseFloat(row[col.cost]) || 0,
      conversions: parseInt(row[col.conversions]) || 0,
      conv_revenue: parseFloat(row[col.convRevenue]) || 0,
    });
  }

  return parsed;
}

// ─── GFA 파싱 ───
function parseGfa(rows) {
  const header = rows[0];
  if (!header) throw new Error('GFA 헤더를 찾을 수 없습니다');

  // 컬럼 인덱스 찾기
  const col = {};
  header.forEach((name, idx) => {
    const n = name.trim();
    if (n === '광고 그룹 이름')          col.groupName = idx;
    if (n === '광고 그룹 ID')           col.groupId = idx;
    if (n === '캠페인 이름')             col.campaign = idx;
    if (n === '캠페인 ID')              col.campaignId = idx;
    if (n === '기간')                   col.date = idx;
    if (n === '총비용')                 col.cost = idx;
    if (n === '노출수')                 col.impressions = idx;
    if (n === '클릭수')                 col.clicks = idx;
    if (n.includes('클릭률'))           col.ctr = idx;
    if (n.includes('평균') && n.includes('CPC')) col.cpc = idx;
    if (n === '구매완료 수')             col.conversions = idx;
    if (n === '구매완료 전환매출액')       col.convRevenue = idx;
  });

  // 필수 컬럼 확인
  const required = ['groupName', 'groupId', 'campaign', 'date', 'impressions', 'cost'];
  const missing = required.filter(k => col[k] === undefined);
  if (missing.length > 0) {
    throw new Error(`GFA 필수 컬럼 누락: ${missing.join(', ')}\n찾은 컬럼: ${header.join(', ')}`);
  }

  // 데이터 행 파싱
  const parsed = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;

    const groupName = (row[col.groupName] || '').trim();
    const groupId = (row[col.groupId] || '').trim();
    const campaignName = (row[col.campaign] || '').trim();
    const dateStr = (row[col.date] || '').trim();

    const date = parseNaverDate(dateStr);
    if (!date) continue;

    const adType = classifyGfaAdType(campaignName);

    const matchKey = makeMatchKey({
      source: 'gfa',
      adType,
      campaignName,
      groupName,
      groupId,
      materialId: null,
    });

    parsed.push({
      date,
      source: 'gfa',
      ad_type: adType,
      campaign_name: campaignName,
      group_name: groupName,
      group_id: groupId,
      material_id: null,
      material_name: null,
      match_key: matchKey,
      impressions: parseInt(row[col.impressions]) || 0,
      clicks: parseInt(row[col.clicks]) || 0,
      cost: parseFloat(row[col.cost]) || 0,
      conversions: parseInt(row[col.conversions]) || 0,
      conv_revenue: parseFloat(row[col.convRevenue]) || 0,
    });
  }

  return parsed;
}

// ─── 같은 (날짜, match_key) 데이터 합산 ───
// 파워링크에서 같은 그룹에 소재가 여러 개인 경우
// 같은 날짜+같은 match_key 데이터를 하나로 합칩니다.
function aggregateParsed(items) {
  const map = new Map();

  items.forEach(item => {
    const key = `${item.date}||${item.match_key}`;

    if (map.has(key)) {
      const existing = map.get(key);
      existing.impressions += item.impressions;
      existing.clicks += item.clicks;
      existing.cost += item.cost;
      existing.conversions += item.conversions;
      existing.conv_revenue += item.conv_revenue;
    } else {
      map.set(key, { ...item });
    }
  });

  return Array.from(map.values());
}

// ─── 메인 파싱 함수 (외부에서 호출) ───
export async function parseFile(file) {
  // 1. CSV 읽기
  const rows = await readCsv(file);
  if (!rows || rows.length < 2) {
    throw new Error('파일이 비어있습니다');
  }

  // 2. 파일 유형 감지
  const fileType = detectFileType(rows);
  if (!fileType) {
    // 디버그 정보 포함
    const firstRow = (rows[0] || []).join(', ').slice(0, 100);
    const secondRow = (rows[1] || []).join(', ').slice(0, 100);
    throw new Error(
      '파일 유형을 인식할 수 없습니다.\n' +
      '검색광고 보고서 또는 GFA 보고서 CSV 파일을 올려주세요.\n\n' +
      `[진단정보]\n1행: ${firstRow || '(비어있음)'}\n2행: ${secondRow || '(비어있음)'}\n총 ${rows.length}행`
    );
  }

  // 3. 파싱
  let parsed;
  if (fileType === 'search') {
    parsed = parseSearchAd(rows, true);
  } else if (fileType === 'search_no_title') {
    parsed = parseSearchAd(rows, false);
  } else if (fileType === 'gfa') {
    parsed = parseGfa(rows);
  } else {
    throw new Error('지원하지 않는 파일 형식입니다');
  }

  if (parsed.length === 0) {
    throw new Error('파싱된 데이터가 없습니다. 파일 내용을 확인해주세요.');
  }

  // 4. 동일 (날짜, match_key) 합산
  const aggregated = aggregateParsed(parsed);

  // 5. ID 부여
  const result = aggregated.map(item => ({
    ...item,
    id: uid(),
  }));

  // 6. 결과 요약
  const summary = {
    fileType: fileType === 'gfa' ? 'GFA' : '검색광고',
    totalRows: result.length,
    dateRange: {
      from: result.reduce((min, r) => r.date < min ? r.date : min, result[0]?.date || ''),
      to: result.reduce((max, r) => r.date > max ? r.date : max, result[0]?.date || ''),
    },
    adTypes: [...new Set(result.map(r => r.ad_type))],
    matchKeys: [...new Set(result.map(r => r.match_key))],
  };

  return { data: result, summary };
}

// ─── 미매핑 항목 추출 ───
// 업로드된 데이터에서 매핑이 안 된 match_key 목록 반환
export function findUnmappedKeys(adData, mappings) {
  const mappedKeys = new Set(mappings.map(m => m.match_key));

  // match_key별 대표 정보 수집
  const unmapped = new Map();
  adData.forEach(row => {
    if (!mappedKeys.has(row.match_key) && !unmapped.has(row.match_key)) {
      unmapped.set(row.match_key, {
        match_key: row.match_key,
        ad_type: row.ad_type,
        campaign_name: row.campaign_name,
        group_name: row.group_name,
        group_id: row.group_id,
        material_id: row.material_id,
        source: row.source,
      });
    }
  });

  return Array.from(unmapped.values());
}
