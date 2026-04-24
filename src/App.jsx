// ============================================
// 메인 앱 v2 - 다중 사용자 시스템
//
// 흐름:
//   URL이 /share/CODE → 공유 링크 모드 (클라이언트)
//   사용자 0명 → 관리자 초기 설정
//   사용자 있음 → 로그인 → 역할에 따라 메뉴 표시
//
// 역할:
//   admin  → 전체 브랜드 + 모든 기능 + 사용자/링크 관리
//   staff  → 담당 브랜드만 + 업로드/매핑
//   share  → 특정 브랜드만 + 보기만 (사이드바 없음)
// ============================================

import React, { useState, useEffect } from 'react';
import { C } from './config';
import { hashPin, uid } from './utils';
import { useStore, fetchUsers, createUser, authenticateUser, findShareLinkByCode, authenticateShareLink } from './store';
import { Layout } from './components/Layout';

import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Mapping from './pages/Mapping';
import Settings from './pages/Settings';

// ─── 로딩 화면 ───
function Loading() {
  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:28, animation:'pulse 1.5s ease infinite' }}>📊</div>
      <div style={{ color:C.txd, fontSize:14, fontFamily:'sans-serif' }}>데이터를 불러오는 중...</div>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.95)}}`}</style>
    </div>
  );
}

// ─── 관리자 초기 설정 화면 ───
function AdminSetup({ onComplete }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) return setError('이름을 입력해주세요');
    if (!username.trim()) return setError('아이디를 입력해주세요');
    if (password.length < 4) return setError('비밀번호는 4자리 이상이어야 합니다');
    const hash = await hashPin(password);
    const user = await createUser({
      username: username.trim(),
      password_hash: hash,
      name: name.trim(),
      role: 'admin',
      assigned_brands: '[]',
    });
    if (user) { onComplete(user); }
    else { setError('계정 생성 실패. 다시 시도해주세요.'); }
  };

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:C.sf, border:`1px solid ${C.bd}`, borderRadius:16, padding:40, maxWidth:400, width:'100%' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:36, marginBottom:10 }}>⚙️</div>
          <div style={{ fontSize:18, fontWeight:700, color:C.ac }}>초기 설정</div>
          <div style={{ fontSize:13, color:C.txd, marginTop:4 }}>관리자 계정을 만들어주세요</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <div style={{ fontSize:12, color:C.txd, marginBottom:4 }}>이름</div>
            <input style={inp} placeholder="예: 김진형" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize:12, color:C.txd, marginBottom:4 }}>아이디</div>
            <input style={inp} placeholder="예: admin" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize:12, color:C.txd, marginBottom:4 }}>비밀번호 (4자리 이상)</div>
            <input style={inp} type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          </div>
          {error && <div style={{ color:C.no, fontSize:13 }}>{error}</div>}
          <button onClick={submit} style={btnPrimary}>관리자 계정 만들기</button>
        </div>
      </div>
    </div>
  );
}

// ─── 로그인 화면 ───
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!username.trim() || !password) return setError('아이디와 비밀번호를 입력해주세요');
    const hash = await hashPin(password);
    const user = await authenticateUser(username.trim(), hash);
    if (user) { onLogin(user); }
    else { setError('아이디 또는 비밀번호가 틀렸습니다'); setPassword(''); }
  };

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:C.sf, border:`1px solid ${C.bd}`, borderRadius:16, padding:40, maxWidth:360, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
        <div style={{ fontSize:18, fontWeight:700, color:C.ac, marginBottom:4 }}>주식회사 오름히</div>
        <div style={{ fontSize:13, color:C.txd, marginBottom:24 }}>광고 성과 대시보드</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10, textAlign:'left' }}>
          <input style={inp} placeholder="아이디" value={username} onChange={e => { setUsername(e.target.value); setError(''); }} />
          <input style={inp} type="password" placeholder="비밀번호" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && submit()} />
          {error && <div style={{ color:C.no, fontSize:13, textAlign:'center' }}>{error}</div>}
          <button onClick={submit} style={btnPrimary}>로그인</button>
        </div>
      </div>
    </div>
  );
}

// ─── 공유 링크 비밀번호 입력 화면 ───
function ShareAuth({ code, brandName, onAuth }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!password) return setError('비밀번호를 입력해주세요');
    const hash = await hashPin(password);
    const link = await authenticateShareLink(code, hash);
    if (link) { onAuth(link.brand); }
    else { setError('비밀번호가 틀렸습니다'); setPassword(''); }
  };

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:C.sf, border:`1px solid ${C.bd}`, borderRadius:16, padding:40, maxWidth:360, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
        <div style={{ fontSize:18, fontWeight:700, color:C.ac, marginBottom:4 }}>{brandName || '광고 성과'} 리포트</div>
        <div style={{ fontSize:13, color:C.txd, marginBottom:24 }}>비밀번호를 입력해주세요</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <input style={{...inp, textAlign:'center', letterSpacing:4, fontSize:18}} type="password" placeholder="비밀번호" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && submit()} autoFocus />
          {error && <div style={{ color:C.no, fontSize:13 }}>{error}</div>}
          <button onClick={submit} style={btnPrimary}>확인</button>
        </div>
      </div>
    </div>
  );
}

// ─── 공유 링크 뷰 (클라이언트용 - 대시보드만) ───
function ShareView({ data, brand, changeRange }) {
  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.tx, fontFamily:"'Noto Sans KR',-apple-system,sans-serif", fontSize:14 }}>
      <div style={{ padding:'14px 24px', borderBottom:`1px solid ${C.bd}`, background:C.sf, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <span style={{ fontSize:15, fontWeight:700, color:C.ac }}>주식회사 오름히</span>
          <span style={{ fontSize:12, color:C.txd, marginLeft:10 }}>{brand} 광고 성과 리포트</span>
        </div>
      </div>
      <div style={{ padding:'20px 24px' }}>
        <Dashboard data={data} allowedBrands={[brand]} changeRange={changeRange} />
      </div>
    </div>
  );
}

// ─── 메인 앱 ───
export default function App() {
  const [mode, setMode] = useState('loading');
  // 'loading' | 'setup' | 'login' | 'app' | 'share_check' | 'share_auth' | 'share_view' | 'share_invalid'
  const [currentUser, setCurrentUser] = useState(null);
  const [shareCode, setShareCode] = useState(null);
  const [shareBrand, setShareBrand] = useState(null);
  const [tab, setTab] = useState('dashboard');

  const { data, loading: dataLoading, uploadAdData, addMapping, removeMapping, clearAdData, deleteAdDataByKeys, changeRange } = useStore(currentUser);

  // ─── 초기화: URL 체크 → 사용자 확인 ───
  useEffect(() => {
    (async () => {
      // 1. 공유 링크 체크
      const match = window.location.pathname.match(/^\/share\/(.+)$/);
      if (match) {
        const code = match[1];
        setShareCode(code);
        const linkInfo = await findShareLinkByCode(code);
        if (linkInfo) {
          setShareBrand(linkInfo.brand);
          setMode('share_auth');
        } else {
          setMode('share_invalid');
        }
        return;
      }

      // 2. 사용자 체크
      const users = await fetchUsers();
      if (users.length === 0) {
        setMode('setup');
        return;
      }

      // 3. 세션 확인
      try {
        const saved = sessionStorage.getItem('oha_user');
        if (saved) {
          const user = JSON.parse(saved);
          // 유효한 사용자인지 다시 확인
          const current = users.find(u => u.id === user.id);
          if (current) {
            setCurrentUser(current);
            setMode('app');
            return;
          }
        }
      } catch { /* ignore */ }

      setMode('login');
    })();
  }, []);

  // ─── 로그인 성공 ───
  const handleLogin = (user) => {
    sessionStorage.setItem('oha_user', JSON.stringify(user));
    setCurrentUser(user);
    setMode('app');
  };

  // ─── 로그아웃 ───
  const handleLogout = () => {
    sessionStorage.removeItem('oha_user');
    setCurrentUser(null);
    setMode('login');
    setTab('dashboard');
  };

  // ─── 관리자 초기 설정 완료 ───
  const handleSetupComplete = (user) => {
    sessionStorage.setItem('oha_user', JSON.stringify(user));
    setCurrentUser(user);
    setMode('app');
  };

  // ─── 공유 링크 인증 성공 ───
  const handleShareAuth = (brand) => {
    setShareBrand(brand);
    setMode('share_view');
  };

  // ─── 현재 사용자의 허용 브랜드 ───
  const getAllowedBrands = () => {
    if (!currentUser) return null;
    if (currentUser.role === 'admin') return null; // null = 전체
    try {
      const brands = JSON.parse(currentUser.assigned_brands || '[]');
      return brands.length > 0 ? brands : null; // 미배정이면 전체 보기
    } catch { return null; }
  };

  // ─── 렌더링 ───

  // 로딩
  if (mode === 'loading' || dataLoading) return <Loading />;

  // 관리자 초기 설정
  if (mode === 'setup') return <AdminSetup onComplete={handleSetupComplete} />;

  // 로그인
  if (mode === 'login') return <LoginScreen onLogin={handleLogin} />;

  // 공유 링크 - 비밀번호 입력
  if (mode === 'share_auth') {
    return <ShareAuth code={shareCode} brandName={shareBrand} onAuth={handleShareAuth} />;
  }

  // 공유 링크 - 유효하지 않은 링크
  if (mode === 'share_invalid') {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ background:C.sf, border:`1px solid ${C.bd}`, borderRadius:16, padding:40, maxWidth:360, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
          <div style={{ fontSize:16, fontWeight:600, color:C.no }}>유효하지 않은 링크입니다</div>
          <div style={{ fontSize:13, color:C.txd, marginTop:8 }}>링크가 만료되었거나 잘못된 주소입니다</div>
        </div>
      </div>
    );
  }

  // 공유 링크 - 대시보드 보기
  if (mode === 'share_view') {
    return <ShareView data={data} brand={shareBrand} changeRange={changeRange} />;
  }

  // ─── 메인 앱 (로그인된 상태) ───
  const allowedBrands = getAllowedBrands();
  const isAdmin = currentUser?.role === 'admin';

  return (
    <Layout tab={tab} setTab={setTab} currentUser={currentUser} onLogout={handleLogout}>
      {tab === 'dashboard' && <Dashboard data={data} allowedBrands={allowedBrands} changeRange={changeRange} />}
      {tab === 'upload' && <Upload data={data} uploadAdData={uploadAdData} />}
      {tab === 'mapping' && <Mapping data={data} addMapping={addMapping} removeMapping={removeMapping} deleteAdDataByKeys={deleteAdDataByKeys} currentUser={currentUser} />}
      {tab === 'settings' && <Settings data={data} clearAdData={clearAdData} currentUser={currentUser} isAdmin={isAdmin} />}
    </Layout>
  );
}

// ─── 공통 스타일 ───
const inp = { background:'#1a1e2c', border:'1px solid #282d40', borderRadius:8, padding:'12px 14px', color:'#e4e7ed', fontSize:14, outline:'none', width:'100%', boxSizing:'border-box' };
const btnPrimary = { background:'#5b8def', color:'#fff', border:'none', borderRadius:8, padding:'12px 0', cursor:'pointer', fontWeight:600, fontSize:15, width:'100%', marginTop:4 };
