// 공통 데이터 관리 - Firebase Realtime Database 기반
const KAKAO_KEY = 'f3f8fa6decb5e2185b09d6bf70ef525b';

// ───────── 인앱 브라우저 감지 → Chrome 안내 ─────────
(function () {
  const ua = navigator.userAgent || '';
  const isInApp = /KAKAOTALK|NAVER|FBAN|FBAV|Instagram|Line\//i.test(ua);
  if (!isInApp) return;

  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  function show() {
    if (document.getElementById('inAppWarn')) return;
    const url = location.href;
    const intentUrl = isAndroid
      ? 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end'
      : null;

    const html = `
      <div id="inAppWarn" style="position:fixed;inset:0;background:rgba(20,30,50,0.96);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;">
        <div style="background:#fff;border-radius:12px;padding:24px;max-width:340px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,0.3);">
          <div style="font-size:42px;margin-bottom:8px;">⚠️</div>
          <h2 style="color:#2c3e50;margin-bottom:10px;font-size:17px;">크롬으로 열어주세요</h2>
          <p style="color:#555;font-size:13px;line-height:1.5;margin-bottom:16px;">
            카카오톡 / 네이버 등 인앱 브라우저에서는<br>
            <b style="color:#e74c3c;">GPS 추적이 작동하지 않습니다.</b>
          </p>
          ${isAndroid ? `
            <button onclick="location.href='${intentUrl}'" style="background:#27ae60;color:#fff;border:none;padding:12px 18px;border-radius:6px;font-size:14px;font-weight:600;width:100%;margin-bottom:8px;cursor:pointer;">
              🌐 Chrome으로 바로 열기
            </button>
            <p style="color:#888;font-size:11px;margin-top:10px;">
              버튼이 안 되면 우측 상단 ⋮ 메뉴 →<br>"다른 브라우저로 열기" 선택
            </p>
          ` : `
            <p style="color:#2c3e50;font-size:13px;background:#f0f4f8;padding:10px;border-radius:6px;text-align:left;">
              우측 상단 <b>···</b> 또는 <b>↗</b> 메뉴를 누르고<br>
              <b>"Safari로 열기"</b> 또는 <b>"기본 브라우저로 열기"</b>를 선택하세요.
            </p>
          `}
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show);
})();

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
  requests: [],
  complaints: [],  // 민원: { id, eventId, lat, lng, phone, content, status:'pending'|'resolved', createdAt }
  noSprayZones: [],  // 방역불가: { id, lat, lng, name, reason, createdAt }
  telegram: { botToken: '', chatId: '', enabled: false },
  naverSms: { proxyUrl: '', serviceId: '', accessKey: '', secretKey: '', from: '', enabled: false },
  publicMonitor: { enabled: false, token: '', updatedAt: 0 },
  sheetSync: { enabled: false, webhookUrl: '', token: '' }  // Google Apps Script 웹앱으로 사진 동기화
};

// ───────── 라이브 세션 publish (today.html → /live/{key}) ─────────
// /live 노드를 따로 사용해서 saveData(set('/'))와 충돌 방지
function publishLiveSession(sessionKey, payload) {
  if (typeof fbDb === 'undefined' || !sessionKey) return;
  fbDb.ref('/live/' + sessionKey).set({ ...payload, lastUpdate: Date.now() })
    .catch(e => console.warn('live publish 실패:', e.message));
}
function unpublishLiveSession(sessionKey) {
  if (typeof fbDb === 'undefined' || !sessionKey) return;
  fbDb.ref('/live/' + sessionKey).remove()
    .catch(e => console.warn('live unpublish 실패:', e.message));
}
// 공개 모니터링 토큰 생성 (16자 랜덤)
function generatePublicToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ───────── 현장사진 업로드 (today.html → /photos/{id}) ─────────
// 클라이언트에서 리사이즈 + JPEG 압축해서 base64로 RTDB에 저장
// /photos는 saveData가 안 건드리는 별도 노드 (live와 동일 패턴)
async function compressImage(file, maxDim = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}
async function uploadFieldPhoto(file, meta) {
  if (typeof fbDb === 'undefined') throw new Error('Firebase 미초기화');
  const dataUrl = await compressImage(file);
  const photoId = uid();
  const payload = {
    dataUrl,
    type: meta?.type || 'field',  // 'field' | 'receipt'
    takenAt: Date.now(),
    sessionKey: meta?.sessionKey || '',
    eventId: meta?.eventId || '',
    courseId: meta?.courseId || '',
    teamId: meta?.teamId || '',
    lat: meta?.lat ?? null,
    lng: meta?.lng ?? null,
    note: meta?.note || ''
  };
  await fbDb.ref('/photos/' + photoId).set(payload);
  return { photoId, ...payload };
}
function loadPhoto(photoId) {
  if (typeof fbDb === 'undefined') return Promise.resolve(null);
  return fbDb.ref('/photos/' + photoId).once('value').then(s => s.val());
}
function deletePhoto(photoId) {
  if (typeof fbDb === 'undefined') return Promise.resolve();
  return fbDb.ref('/photos/' + photoId).remove();
}

// ───────── 네이버 SENS SMS (프록시 서버 경유) ─────────
async function sendSms(toPhone, content) {
  try {
    const data = (typeof _cache !== 'undefined' && _cache) || loadData();
    const cfg = data.naverSms || {};
    if (!cfg.enabled || !cfg.proxyUrl) return { ok: false, skipped: true };
    const tel = String(toPhone).replace(/\D/g, '');
    if (!tel) return { ok: false, error: 'no phone' };
    const res = await fetch(cfg.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: cfg.serviceId,
        accessKey: cfg.accessKey,
        secretKey: cfg.secretKey,
        from: cfg.from,
        to: tel,
        content
      })
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.warn('SMS 전송 실패:', e);
    return { ok: false, error: e.message };
  }
}

// ───────── 카카오 InfoWindow 토글 ─────────
// 같은 마커 다시 누르면 닫히고, 다른 마커 누르면 이전 거 닫고 새 거 열기
window.__openIw = null;
function toggleInfoWindow(iw, marker, mapRef) {
  // getMap()으로 실제 열림 여부 확인 (re-render 후에도 안전)
  if (iw.getMap && iw.getMap()) {
    iw.close();
    if (window.__openIw === iw) window.__openIw = null;
  } else {
    if (window.__openIw && window.__openIw !== iw) {
      try { window.__openIw.close(); } catch (e) {}
    }
    iw.open(mapRef, marker);
    window.__openIw = iw;
  }
}

// ───────── 텔레그램 알림 ─────────
async function sendTelegram(text) {
  try {
    const data = (typeof _cache !== 'undefined' && _cache) || loadData();
    const cfg = data.telegram || {};
    if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;
    const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
    // 콤마/공백/줄바꿈으로 여러 대상 분리
    const chatIds = String(cfg.chatId).split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    await Promise.all(chatIds.map(chatId =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
      })
    ));
  } catch (e) {
    console.warn('텔레그램 전송 실패:', e);
  }
}

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
  if (data.complaints && !Array.isArray(data.complaints)) data.complaints = Object.values(data.complaints);
  if (data.noSprayZones && !Array.isArray(data.noSprayZones)) data.noSprayZones = Object.values(data.noSprayZones);
  if (data.savedTeams && !Array.isArray(data.savedTeams)) data.savedTeams = Object.values(data.savedTeams);
  for (const t of (data.teams || [])) {
    if (t && t.memberIds && !Array.isArray(t.memberIds)) t.memberIds = Object.values(t.memberIds);
    if (t && t.fixedMemberIds && !Array.isArray(t.fixedMemberIds)) t.fixedMemberIds = Object.values(t.fixedMemberIds);
  }
  return data;
}

function saveData(data, force) {
  // 동기화 전 저장 차단: 캐시가 비어있는데 set('/')를 부르면 기존 DB가 통째로 날아감
  if (!force && !_cacheReady) {
    console.error('saveData 차단됨: Firebase 동기화 전 저장 시도');
    alert('⚠️ 데이터 동기화 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  // 데이터 보호: 키가 빠진 상태로 저장 시도하면 캐시 값으로 복원 (force 시 무시)
  if (!force && _cache) {
    for (const k of ['events','members','teams','anchors','logs','requests','complaints','noSprayZones','memberAuth','savedTeams']) {
      if (_cache[k] && Array.isArray(_cache[k]) && _cache[k].length > 0 && data[k] === undefined) {
        console.warn(`saveData: ${k} 보호됨 (캐시에는 ${_cache[k].length}개 있는데 키 누락)`);
        data[k] = _cache[k];
      }
    }
  }
  _cache = data;
  if (typeof fbDb !== 'undefined') {
    // /live, /photos 같은 형제 노드는 보존하기 위해 set('/') 대신 update('/') 사용
    // — set은 루트를 통째로 갈아치워서 driver의 라이브 위치/사진까지 날아가던 버그 수정
    const payload = { ...data };
    delete payload.live;    // driver 가 직접 ref('/live/...').set 으로 관리
    delete payload.photos;  // 현장사진은 별도 노드, saveData가 안 건드림
    fbDb.ref('/').update(payload).catch(err => {
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

// Firebase 영속 세션이 hydrate 될 때까지 기다린 뒤 결정 — 안 그러면 admin 로그인 직후
// 홈을 들렀을 때 currentUser가 아직 null이라 익명 세션을 만들어 admin 세션을 덮어씀.
async function ensureAnonAuth() {
  await new Promise(resolve => {
    const off = fbAuth.onAuthStateChanged(u => { off(); resolve(u); });
  });
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
const DEFAULT_PIN = '123456';

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

// ID → 이메일 변환 (계정 생성/로그인 통일)
function idToEmail(id) {
  const t = (id || '').trim();
  if (!t) return '';
  if (t.includes('@')) return t; // 이미 이메일이면 그대로
  return t + '@bsp.local';
}

function showLoginGate() {
  const savedId = localStorage.getItem('lastAdminId') || '';
  const html = `
    <div id="loginGate" style="position:fixed;inset:0;background:rgba(44,62,80,0.95);z-index:99999;display:flex;align-items:center;justify-content:center;">
      <div style="background:#fff;padding:24px;border-radius:10px;width:340px;max-width:92vw;">
        <h2 style="margin-bottom:8px;color:#2c3e50;">🔐 로그인</h2>
        <p style="font-size:12px;color:#7f8c8d;margin-bottom:14px;line-height:1.5;">
          간부 <b>이메일</b> 또는 회원 <b>전화번호 + PIN</b>으로 들어올 수 있어요.
        </p>
        <label>이메일 또는 전화번호</label>
        <input id="loginEmail" type="text" autocomplete="username" placeholder="bsp1001@naver.com 또는 010-1234-5678" value="${savedId}" oninput="autoFormatLoginId(this)">
        <label>비밀번호 또는 PIN</label>
        <input id="loginPw" type="password" autocomplete="current-password" placeholder="간부:비번 / 회원:PIN" onkeydown="if(event.key==='Enter')doLogin()">
        <div id="loginErr" style="color:#e74c3c;font-size:12px;margin-top:6px;min-height:14px;"></div>
        <button onclick="doLogin()" style="width:100%;margin-top:10px;padding:10px;">로그인</button>
        <details style="margin-top:14px;font-size:11px;color:#666;">
          <summary style="cursor:pointer;color:#3498db;">계정/PIN이 없거나 비번을 모르면?</summary>
          <div style="padding:8px;background:#f8f9fa;border-radius:5px;margin-top:6px;line-height:1.6;">
            <b>회원이면:</b> 사무국장에게 PIN 발급 요청 → 전화번호 + 4자리 PIN으로 로그인<br>
            <b>간부면:</b> super 관리자에게 이메일+초기비번(123456) 발급 요청 → 첫 로그인 후 비번 변경<br>
            <b>비번 분실:</b> super 관리자에게 비번재설정 메일 요청
          </div>
        </details>
        <div style="margin-top:10px;text-align:center;">
          <a href="index.html" style="font-size:11px;color:#888;">← 홈으로</a>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  const focusTarget = savedId ? 'loginPw' : 'loginEmail';
  setTimeout(() => document.getElementById(focusTarget).focus(), 100);
}

// 전화번호 입력 시 자동 하이픈 (010-XXXX-XXXX)
function autoFormatLoginId(input) {
  const v = input.value;
  if (v.includes('@')) return; // 이메일은 그대로
  const digits = v.replace(/\D/g, '');
  if (!digits.startsWith('01')) return; // 010, 011 등 핸드폰만 포맷
  let formatted = digits;
  if (digits.length >= 4 && digits.length <= 7) {
    formatted = digits.slice(0, 3) + '-' + digits.slice(3);
  } else if (digits.length >= 8) {
    formatted = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
  }
  if (formatted !== v) input.value = formatted;
}

// 현재 로그인 사용자의 권한 (admin/super/viewer)
function getMyRole() {
  const u = fbAuth.currentUser;
  if (!u || !u.email || u.isAnonymous) return null;
  if (typeof _cache === 'undefined' || !_cache) return 'admin'; // 데이터 미로드 시 기본
  const userInfo = (_cache.users || {})[u.uid];
  return userInfo?.role || 'admin';
}

async function doLogin() {
  const id = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPw').value;
  const err = document.getElementById('loginErr');
  err.textContent = '로그인 중...';

  // 자동 판단:
  //  - @ 있으면 → 이메일 (간부 계정)
  //  - 숫자만 있으면 → 전화번호 + PIN (회원)
  const isPhone = /^[0-9\-\s]+$/.test(id) && !id.includes('@');
  let email, password;
  if (isPhone) {
    email = memberEmail(id);
    password = pinToPassword(pw);
  } else {
    email = idToEmail(id);
    password = pw;
  }

  try {
    await adminSignIn(email, password);
    localStorage.setItem('lastAdminId', id);
    document.getElementById('loginGate').remove();
    initFirebaseSync();
    if (window.onAuthSuccess) window.onAuthSuccess();
    // 텔레그램: 로그인 알림 (Firebase 데이터 도착 후)
    onDataReady(() => {
      const u = (loadData().users || {})[fbAuth.currentUser?.uid] || {};
      sendTelegram(`🔐 <b>관리자 로그인</b>\nID: ${id}\n이름: ${u.name || '-'}\n시각: ${new Date().toLocaleString('ko-KR')}`);
    });
    // 초기비번 123456면 변경 강제
    if (pw === '123456') setTimeout(promptPasswordChange, 600);
  } catch (e) {
    err.textContent = '로그인 실패: ' + (e.message.includes('password') || e.message.includes('user') ? 'ID/비번 확인' : e.message);
    document.getElementById('loginPw').value = '';
  }
}

async function promptPasswordChange() {
  alert('초기 비밀번호(123456) 사용 중. 안전을 위해 새 비밀번호로 변경하세요.');
  const np = prompt('새 비밀번호 (6자 이상)');
  if (!np || np.length < 6) { alert('6자 이상이어야 합니다. 나중에 다시 시도하세요.'); return; }
  const np2 = prompt('새 비밀번호 한 번 더');
  if (np !== np2) { alert('일치하지 않습니다. 나중에 다시 시도하세요.'); return; }
  try {
    await fbAuth.currentUser.updatePassword(np);
    alert('✅ 비밀번호 변경 완료');
  } catch (e) {
    alert('변경 실패: ' + e.message + '\n\n다시 로그인 후 시도하세요.');
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
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function distance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ───────── 예상 시간 계산 ─────────
// 직선거리 × 도로보정(1.3) → 평균속도(25km/h)로 나눔 + 거점당 정차시간
const ETA_AVG_SPEED_KMH = 25;     // 방역 운영 평균 (저속 + 정차)
const ETA_ROAD_FACTOR  = 1.3;     // 직선 → 도로
const ETA_STOP_MIN_PER_ANCHOR = 3; // 거점당 방역 정차 시간

function estimateMinutes(meters, anchorStops) {
  const km = (meters * ETA_ROAD_FACTOR) / 1000;
  const driveMin = (km / ETA_AVG_SPEED_KMH) * 60;
  const stopMin = (anchorStops || 0) * ETA_STOP_MIN_PER_ANCHOR;
  return Math.max(1, Math.round(driveMin + stopMin));
}

// 거점 배열 → 직선 누적거리(미터)
function totalAnchorDistance(anchors) {
  let d = 0;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i-1], b = anchors[i];
    if (typeof a.lat !== 'number' || typeof b.lat !== 'number') continue;
    d += distance(a.lat, a.lng, b.lat, b.lng);
  }
  return d;
}

function formatEtaMin(min) {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
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
