// 공통 데이터 관리 - Firebase Realtime Database 기반
const KAKAO_KEY = 'f3f8fa6decb5e2185b09d6bf70ef525b';

// ───────── 기본 데이터 (최초 1회만 들어감) ─────────
const defaultData = {
  mapDefault: { lat: 35.3475, lng: 126.4180, level: 5 },
  events: [
    { id: 'e1', name: '방역행사', courses: [
      { id: 'c1', name: '1코스', color: '#FF6B6B' },
      { id: 'c2', name: '2코스', color: '#4ECDC4' },
      { id: 'c3', name: '3코스', color: '#95E1D3' }
    ]}
  ],
  anchors: [],
  members: [],   // {id, name, phone, note}
  teams: [
    { id: 't1', name: '1조', leaderId: '', viceLeaderId: '', memberIds: [], fixedMemberIds: [] },
    { id: 't2', name: '2조', leaderId: '', viceLeaderId: '', memberIds: [], fixedMemberIds: [] },
    { id: 't3', name: '3조', leaderId: '', viceLeaderId: '', memberIds: [], fixedMemberIds: [] }
  ],
  logs: [],
  requests: []
};

// ───────── Firebase 동기화 캐시 ─────────
let _cache = null;
let _cacheReady = false;
const _readyCallbacks = [];

let _syncInitialized = false;
function initFirebaseSync() {
  if (_syncInitialized) return;
  if (typeof fbDb === 'undefined') {
    console.error('Firebase 초기화 안됨. firebase-config.js 확인하세요');
    return;
  }
  _syncInitialized = true;
  fbDb.ref('/').on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      // 진짜 최초 (DB 완전 비어있음): 기본 데이터 업로드
      _cache = JSON.parse(JSON.stringify(defaultData));
      fbDb.ref('/').set(_cache);
    } else {
      _cache = data;
      // mapDefault만 복원 (배열은 사용자가 비웠을 수 있으니 손대지 않음)
      if (_cache.mapDefault === undefined) {
        _cache.mapDefault = defaultData.mapDefault;
        fbDb.ref('/mapDefault').set(_cache.mapDefault);
      }
    }

    if (!_cacheReady) {
      _cacheReady = true;
      _readyCallbacks.forEach(cb => cb());
      _readyCallbacks.length = 0;
    }
    if (window.onDataChanged) window.onDataChanged();
  }, (err) => {
    console.error('Firebase 읽기 오류:', err);
    alert('Firebase 연결 실패: ' + err.message);
  });
}

function loadData() {
  const data = _cache || JSON.parse(JSON.stringify(defaultData));
  // Firebase가 array를 object로 변환했을 수 있음 → 다시 array로
  if (data.events && !Array.isArray(data.events)) {
    data.events = Object.values(data.events);
  }
  for (const e of (data.events || [])) {
    if (e && e.courses && !Array.isArray(e.courses)) {
      e.courses = Object.values(e.courses);
    }
  }
  if (data.anchors && !Array.isArray(data.anchors)) data.anchors = Object.values(data.anchors);
  if (data.members && !Array.isArray(data.members)) data.members = Object.values(data.members);
  if (data.teams && !Array.isArray(data.teams)) data.teams = Object.values(data.teams);
  if (data.logs && !Array.isArray(data.logs)) data.logs = Object.values(data.logs);
  if (data.requests && !Array.isArray(data.requests)) data.requests = Object.values(data.requests);
  if (data.savedTeams && !Array.isArray(data.savedTeams)) data.savedTeams = Object.values(data.savedTeams);
  for (const t of (data.teams || [])) {
    if (t && t.memberIds && !Array.isArray(t.memberIds)) t.memberIds = Object.values(t.memberIds);
    if (t && t.fixedMemberIds && !Array.isArray(t.fixedMemberIds)) t.fixedMemberIds = Object.values(t.fixedMemberIds);
  }
  return data;
}

function saveData(data, force) {
  // 데이터 보호: 키가 빠진 상태로 저장 시도하면 캐시 값으로 복원 (force 시 무시)
  if (!force && _cache) {
    for (const k of ['events','members','teams','anchors','logs','requests','memberAuth','savedTeams']) {
      if (_cache[k] && Array.isArray(_cache[k]) && _cache[k].length > 0 && data[k] === undefined) {
        console.warn(`saveData: ${k} 보호됨 (캐시에는 ${_cache[k].length}개 있는데 키 누락)`);
        data[k] = _cache[k];
      }
    }
  }
  _cache = data;
  if (typeof fbDb !== 'undefined') {
    fbDb.ref('/').set(data).catch(err => {
      console.error('저장 실패:', err);
      alert('저장 실패: ' + err.message);
    });
  }
}

function onDataReady(cb) {
  if (_cacheReady) cb();
  else _readyCallbacks.push(cb);
}

// ───────── Firebase Auth ─────────
async function adminSignIn(email, password) {
  return fbAuth.signInWithEmailAndPassword(email, password);
}

async function adminSignOut() {
  await fbAuth.signOut();
  location.href = 'index.html';
}

async function ensureAnonAuth() {
  if (!fbAuth.currentUser) {
    try { await fbAuth.signInAnonymously(); }
    catch (e) { console.error('익명 로그인 실패:', e); }
  }
}

// ───────── 회원용 로그인 ─────────
function memberEmail(phone) {
  return `m${String(phone).replace(/\D/g, '')}@bsp.local`;
}

// 4자리 PIN을 Firebase 비밀번호 형식으로 변환 (Firebase는 6자 이상 필요)
function pinToPassword(pin) {
  return String(pin).padStart(4, '0') + 'bsp';
}
const DEFAULT_PIN = '1234';

async function memberLogin(phone, pin) {
  return fbAuth.signInWithEmailAndPassword(memberEmail(phone), pinToPassword(pin));
}

// 보조 Firebase 앱 (현재 로그인 유지하며 새 사용자 생성용)
let _secondaryApp = null;
function getSecondaryAuth() {
  if (typeof firebase === 'undefined') return null;
  if (!_secondaryApp) {
    _secondaryApp = firebase.initializeApp(firebaseConfig, 'secondary');
  }
  return _secondaryApp.auth();
}

async function createMemberAccount(memberId, phone, pin) {
  const secAuth = getSecondaryAuth();
  const cred = await secAuth.createUserWithEmailAndPassword(memberEmail(phone), pinToPassword(pin));
  const uid = cred.user.uid;
  await secAuth.signOut();

  // memberId ↔ uid 매핑 저장
  const data = loadData();
  if (!data.memberAuth) data.memberAuth = {};
  data.memberAuth[uid] = memberId;
  // 기본 PIN 사용 시 변경 필요 플래그
  if (!data.memberPinFlags) data.memberPinFlags = {};
  data.memberPinFlags[uid] = (pin === DEFAULT_PIN);
  saveData(data);
  return uid;
}

// 비밀번호 변경 (현재 로그인된 회원)
async function changeMemberPin(currentPin, newPin) {
  const u = fbAuth.currentUser;
  if (!u || u.isAnonymous) throw new Error('로그인 필요');
  // 재인증
  const cred = firebase.auth.EmailAuthProvider.credential(u.email, pinToPassword(currentPin));
  await u.reauthenticateWithCredential(cred);
  await u.updatePassword(pinToPassword(newPin));
  // 기본 PIN 플래그 해제
  const data = loadData();
  if (data.memberPinFlags) {
    data.memberPinFlags[u.uid] = false;
    saveData(data);
  }
}

function isUsingDefaultPin() {
  const u = fbAuth.currentUser;
  if (!u) return false;
  return !!(loadData().memberPinFlags || {})[u.uid];
}

function getMemberByUid(data, uid) {
  if (!data.memberAuth) return null;
  const memberId = data.memberAuth[uid];
  if (!memberId) return null;
  return getMember(data, memberId);
}

function getCurrentMember() {
  const u = fbAuth.currentUser;
  if (!u) return null;
  return getMemberByUid(loadData(), u.uid);
}

function checkAdminAuth() {
  return new Promise((resolve) => {
    let resolved = false;
    fbAuth.onAuthStateChanged((user) => {
      if (resolved) return;
      if (user && user.email) {
        resolved = true;
        initFirebaseSync();
        resolve(true);
      } else {
        resolved = true;
        showLoginGate();
        resolve(false);
      }
    });
  });
}

function showLoginGate() {
  const html = `
    <div id="loginGate" style="position:fixed;inset:0;background:rgba(44,62,80,0.95);z-index:99999;display:flex;align-items:center;justify-content:center;">
      <div style="background:#fff;padding:30px;border-radius:10px;width:320px;max-width:90vw;">
        <h2 style="margin-bottom:16px;color:#2c3e50;">🔐 관리자 로그인</h2>
        <label>이메일</label>
        <input id="loginEmail" type="email" autocomplete="username">
        <label>비밀번호</label>
        <input id="loginPw" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()">
        <div id="loginErr" style="color:#e74c3c;font-size:12px;margin-top:6px;min-height:14px;"></div>
        <button onclick="doLogin()" style="width:100%;margin-top:10px;padding:10px;">로그인</button>
        <p style="margin-top:10px;font-size:11px;color:#888;text-align:center;">Firebase Auth로 가입한 이메일</p>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => document.getElementById('loginEmail').focus(), 100);
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPw').value;
  const err = document.getElementById('loginErr');
  err.textContent = '로그인 중...';
  try {
    await adminSignIn(email, pw);
    document.getElementById('loginGate').remove();
    initFirebaseSync();
    if (window.onAuthSuccess) window.onAuthSuccess();
  } catch (e) {
    err.textContent = '로그인 실패: ' + (e.message.includes('password') || e.message.includes('user') ? '아이디/비밀번호 확인' : e.message);
    document.getElementById('loginPw').value = '';
  }
}

function adminLogout() {
  adminSignOut();
}

// ───────── 유틸 ─────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getEvent(data, eventId) {
  return data.events.find(e => e.id === eventId);
}
function getCourse(data, courseId) {
  for (const e of data.events) {
    const c = e.courses.find(c => c.id === courseId);
    if (c) return c;
  }
  return null;
}
function getCourseEventId(data, courseId) {
  for (const e of data.events) {
    if (e.courses.some(c => c.id === courseId)) return e.id;
  }
  return null;
}
function getTeam(data, teamId) {
  return (data.teams || []).find(t => t.id === teamId);
}
function getMember(data, memberId) {
  return (data.members || []).find(m => m.id === memberId);
}
function getCourseAnchors(data, courseId) {
  return (data.anchors || [])
    .filter(a => a.courseId === courseId)
    .sort((a, b) => a.order - b.order);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function distance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ───────── 마커/화살표 ─────────
function numberedMarkerImage(num, color, dim) {
  const fill = dim ? '#ccc' : color;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28">
    <path d="M11 0 C5 0 0 5 0 11 C0 18 11 28 11 28 C11 28 22 18 22 11 C22 5 17 0 11 0 Z" fill="${fill}" stroke="white" stroke-width="1.5"/>
    <text x="11" y="15" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="white" text-anchor="middle">${num}</text>
  </svg>`;
  return new kakao.maps.MarkerImage(
    'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
    new kakao.maps.Size(22, 28),
    { offset: new kakao.maps.Point(11, 28) }
  );
}

function arrowMarker(map, fromPos, toPos, color) {
  const lat1 = fromPos.getLat(), lng1 = fromPos.getLng();
  const lat2 = toPos.getLat(),   lng2 = toPos.getLng();
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1r = lat1 * Math.PI / 180, lat2r = lat2 * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">
    <g transform="rotate(${bearing} 7 7)">
      <path d="M7 1 L13 12 L7 9 L1 12 Z" fill="${color}" stroke="white" stroke-width="1" stroke-linejoin="round"/>
    </g>
  </svg>`;
  return new kakao.maps.Marker({
    position: new kakao.maps.LatLng(midLat, midLng), map,
    image: new kakao.maps.MarkerImage(
      'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
      new kakao.maps.Size(14, 14),
      { offset: new kakao.maps.Point(7, 7) }
    ),
    clickable: false, zIndex: 1
  });
}

// ───────── 카카오내비 ─────────
function openKakaoNavi(name, lat, lng) {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android/.test(ua)) {
    location.href = `kakaomap://route?ep=${lat},${lng}&by=CAR`;
  } else {
    window.open(`https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`);
  }
}
