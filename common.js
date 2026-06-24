// 공통 데이터 관리 - Firebase Realtime Database 기반
const KAKAO_KEY = 'f3f8fa6decb5e2185b09d6bf70ef525b';

// ───────── 인앱 브라우저 감지 → Chrome 안내 ─────────
(function () {
  const ua = navigator.userAgent || '';
  const isInApp = /KAKAOTALK|NAVER|FBAN|FBAV|Instagram|Line\//i.test(ua);
  if (!isInApp) return;

  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isKakao = /KAKAOTALK/i.test(ua);

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
            <div style="background:#f0f4f8;border-radius:8px;padding:14px;text-align:left;">
              <p style="color:#2c3e50;font-size:14px;font-weight:700;margin-bottom:10px;">📱 아이폰에서 크롬으로 여는 법</p>
              <p style="color:#444;font-size:13px;line-height:1.8;margin:0;">
                <b>①</b> 화면 <b>맨 아래 ↗ 공유 버튼</b> 누르기<br>
                <b>②</b> 목록에서 <b style="color:#1a73e8;">"Chrome에서 열기"</b> 선택
              </p>
            </div>
            <div style="font-size:30px;margin-top:8px;line-height:1;">👇</div>
            <p style="color:#888;font-size:11px;margin-top:2px;">아래쪽 공유 버튼을 눌러주세요</p>
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
  publicMonitor: { enabled: false, token: '', pin: '', updatedAt: 0 },
  vehicles: [],   // [{ id, name, plate, color, defaultDriverId, defaultAssistId, memberIds: [] }]
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

// ───────── 현장사진 업로드 (Google Drive 저장) ─────────
// 클라이언트에서 리사이즈 + JPEG 압축 → GAS 웹앱으로 전송 → Drive 저장
// RTDB /photos 에는 메타 + Drive URL만 저장 (base64 안 넣음)
async function compressImage(file, maxDim = 1024, quality = 0.8) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      var w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = function() { reject(new Error('이미지 로드 실패')); };
    var reader = new FileReader();
    reader.onload = function() { img.src = reader.result; };
    reader.onerror = function() { reject(new Error('파일 읽기 실패')); };
    reader.readAsDataURL(file);
  });
}

// Drive 업로드용 GAS 웹앱 설정 (admin.html → drivePhoto)
function _getDrivePhotoConfig() {
  var data = (typeof _cache !== 'undefined' && _cache) ? _cache : loadData();
  return data.drivePhoto || {};
}

// 메모리 캐시 (세션 중 같은 사진 반복 로드 방지)
var _photoCache = {};

async function uploadFieldPhoto(file, meta) {
  if (typeof fbDb === 'undefined') throw new Error('Firebase 미초기화');
  var cfg = _getDrivePhotoConfig();
  if (!cfg.webhookUrl) throw new Error('사진 업로드 설정 필요 (관리자 → Drive 사진 설정)');

  var dataUrl = await compressImage(file);
  var photoId = uid();
  var payload = {
    type: meta?.type || 'field',
    takenAt: Date.now(),
    sessionKey: meta?.sessionKey || '',
    eventId: meta?.eventId || '',
    courseId: meta?.courseId || '',
    teamId: meta?.teamId || '',
    lat: meta?.lat ?? null,
    lng: meta?.lng ?? null,
    note: meta?.note || ''
  };

  // GAS 웹앱으로 전송 → Drive에 저장 (비공개) → fileId 반환
  var res = await fetch(cfg.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'upload',
      photoId: photoId,
      dataUrl: dataUrl,
      type: payload.type,
      takenAt: payload.takenAt,
      eventId: payload.eventId,
      courseId: payload.courseId,
      sessionKey: payload.sessionKey,
      lat: payload.lat,
      lng: payload.lng,
      note: payload.note,
      token: cfg.token || '',
      appName: cfg.appName || '방역코스'
    })
  });
  var result = {};
  try { result = await res.json(); } catch(e) {}

  // RTDB에는 메타 + Drive fileId만 저장 (base64 안 넣음)
  payload.driveFileId = result.fileId || '';
  payload.photoId = photoId;
  await fbDb.ref('/photos/' + photoId).set(payload);

  // 방금 업로드한 사진은 캐시에 넣어서 바로 표시
  _photoCache[photoId] = dataUrl;
  return { photoId: photoId, dataUrl: dataUrl, ...payload };
}

function loadPhoto(photoId) {
  if (typeof fbDb === 'undefined') return Promise.resolve(null);
  return fbDb.ref('/photos/' + photoId).once('value').then(function(s) { return s.val(); });
}

// GAS 프록시를 통해 Drive 사진 가져오기 (로그인 검증)
async function fetchPhotoData(fileId) {
  if (!fileId) return null;
  var cfg = _getDrivePhotoConfig();
  if (!cfg.webhookUrl) return null;
  var url = cfg.webhookUrl + '?action=view&fileId=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(cfg.token || '');
  var res = await fetch(url);
  var data = await res.json();
  return data.dataUrl || null;
}

// photoId로 이미지 dataUrl 가져오기 (캐시 → RTDB 메타 → GAS 프록시)
async function getPhotoDataUrl(photoId) {
  if (_photoCache[photoId]) return _photoCache[photoId];
  var photo = await loadPhoto(photoId);
  if (!photo) return null;
  // 기존 base64 데이터가 있으면 그대로 사용 (마이그레이션 호환)
  if (photo.dataUrl) {
    _photoCache[photoId] = photo.dataUrl;
    return photo.dataUrl;
  }
  if (!photo.driveFileId) return null;
  var dataUrl = await fetchPhotoData(photo.driveFileId);
  if (dataUrl) _photoCache[photoId] = dataUrl;
  return dataUrl;
}

// Drive 파일도 같이 삭제 (GAS 웹앱 경유)
async function deletePhoto(photoId) {
  if (typeof fbDb === 'undefined') return;
  var photo = await loadPhoto(photoId);
  await fbDb.ref('/photos/' + photoId).remove();
  delete _photoCache[photoId];
  if (photo && photo.driveFileId) {
    var cfg = _getDrivePhotoConfig();
    if (cfg.webhookUrl) {
      try {
        await fetch(cfg.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'delete', fileId: photo.driveFileId, token: cfg.token || '' })
        });
      } catch(e) { console.warn('Drive 파일 삭제 실패:', e); }
    }
  }
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
// InfoWindow가 다른 마커(GPS ping 등)에 가려지지 않게 — 열릴 때 위에 있는 마커 잠시 내림
function _lowerCoveringMarkers() {
  // myMarker(GPS ping) 등 zIndex 큰 것들 원래 값 백업하고 1로
  if (typeof myMarker !== 'undefined' && myMarker && myMarker.getZIndex) {
    if (window.__zIdxBackup_my == null) window.__zIdxBackup_my = myMarker.getZIndex();
    try { myMarker.setZIndex(1); } catch (e) {}
  }
}
function _restoreCoveringMarkers() {
  if (typeof myMarker !== 'undefined' && myMarker && window.__zIdxBackup_my != null) {
    try { myMarker.setZIndex(window.__zIdxBackup_my); } catch (e) {}
    window.__zIdxBackup_my = null;
  }
}
function toggleInfoWindow(iw, marker, mapRef) {
  // getMap()으로 실제 열림 여부 확인 (re-render 후에도 안전)
  if (iw.getMap && iw.getMap()) {
    iw.close();
    if (window.__openIw === iw) window.__openIw = null;
    _restoreCoveringMarkers();
  } else {
    if (window.__openIw && window.__openIw !== iw) {
      try { window.__openIw.close(); } catch (e) {}
    }
    _lowerCoveringMarkers();
    iw.open(mapRef, marker);
    window.__openIw = iw;
    // 마커 위치로 살짝 패닝 — InfoWindow가 화면 가장자리에서 잘리지 않게 위쪽에 공간 확보
    try {
      if (mapRef && marker.getPosition) {
        setTimeout(() => {
          mapRef.panTo(marker.getPosition());
          setTimeout(() => mapRef.panBy(0, -100), 200);
        }, 50);
      }
    } catch (e) {}
    // 닫기 버튼(X) 클릭 등으로 외부에서 닫혀도 복원되게 한 번 더 체크
    setTimeout(function checkClosed() {
      if (!iw.getMap || !iw.getMap()) {
        _restoreCoveringMarkers();
        return;
      }
      setTimeout(checkClosed, 500);
    }, 500);
  }
}

// ───────── 기기 감지 + IP ─────────
function getDeviceType() {
  var ua = navigator.userAgent || '';
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return '📱 모바일';
  return '💻 PC';
}

let _cachedIP = null;
async function getClientIP() {
  if (_cachedIP) return _cachedIP;
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const j = await r.json();
    _cachedIP = j.ip || '알수없음';
  } catch (e) { _cachedIP = '알수없음'; }
  return _cachedIP;
}

// ───────── 텔레그램 알림 ─────────
// 사이트 URL (GitHub Pages)
const __siteUrl = location.origin + location.pathname.replace(/[^/]*$/, '');

// 기기 이름 (localStorage + Firebase 동기화)
const __deviceNameKey = 'bsp_device_name';
const __deviceIdKey = 'bsp_device_id';
function getDeviceId() {
  let id = localStorage.getItem(__deviceIdKey);
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(__deviceIdKey, id);
  }
  return id;
}
function getDeviceName() { return localStorage.getItem(__deviceNameKey) || ''; }
function setDeviceName(name) { localStorage.setItem(__deviceNameKey, name); }

// Firebase에 기기 이름 저장
function saveDeviceNameToFirebase(name) {
  if (typeof fbDb === 'undefined') return;
  const deviceId = getDeviceId();
  const u = (typeof fbAuth !== 'undefined' && fbAuth.currentUser) || {};
  fbDb.ref('/deviceNames/' + deviceId).set({
    name: name,
    uid: u.uid || '',
    email: u.email || '',
    deviceType: getDeviceType(),
    registeredAt: Date.now(),
    updatedAt: Date.now()
  }).catch(e => console.warn('기기이름 Firebase 저장 실패:', e));
}

// Firebase에서 기기이름 삭제 여부 확인 (super가 삭제했으면 로컬도 초기화)
function checkDeviceNameSync() {
  if (typeof fbDb === 'undefined') return;
  const deviceId = getDeviceId();
  const localName = getDeviceName();
  if (!localName) return; // 로컬에 없으면 어차피 모달 뜸
  fbDb.ref('/deviceNames/' + deviceId).once('value').then(snap => {
    const val = snap.val();
    if (!val) {
      // Firebase에서 삭제됨 → 로컬도 초기화 → 재등록 모달
      localStorage.removeItem(__deviceNameKey);
      showDeviceNameBar();
    }
  }).catch(() => {});
}

// 새 기기 감지 — 모달로 등록 강제
function showDeviceNameBar() {
  if (getDeviceName()) return; // 이미 등록됨
  if (document.getElementById('deviceNameModal')) return; // 이미 떠있음
  const overlay = document.createElement('div');
  overlay.id = 'deviceNameModal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(44,62,80,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:18px;padding:32px 26px 26px;max-width:360px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,0.25);text-align:center;">
      <div style="font-size:52px;margin-bottom:8px;">🙌</div>
      <h2 style="margin:0 0 8px;color:#2c3e50;font-size:20px;">안녕하세요! 환영합니다</h2>
      <p style="color:#555;font-size:14px;margin:0 0 6px;line-height:1.6;">이 기기에서 처음 접속하셨네요!</p>
      <p style="color:#777;font-size:13px;margin:0 0 20px;line-height:1.6;">본부에서 누구의 기기인지 확인할 수 있도록<br><b>기기 이름</b>을 한 번만 등록해 주세요 😊<br><span style="color:#aaa;font-size:12px;">처음 한 번만 하시면 다음부터는 안 물어봐요!</span></p>
      <input id="deviceNameInput" type="text" placeholder="예: 홍길동 폰, 사무실PC"
        style="width:100%;box-sizing:border-box;padding:13px 14px;border:2px solid #3498db;border-radius:10px;font-size:15px;text-align:center;outline:none;transition:border-color .2s;"
        onfocus="this.style.borderColor='#2980b9'" onblur="this.style.borderColor='#3498db'"
        onkeydown="if(event.key==='Enter')registerDeviceName()">
      <button onclick="registerDeviceName()"
        style="margin-top:16px;width:100%;padding:13px;background:linear-gradient(135deg,#3498db,#2980b9);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(52,152,219,0.3);transition:transform .1s;"
        onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
        등록하기
      </button>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => { const inp = document.getElementById('deviceNameInput'); if (inp) inp.focus(); }, 100);
}
function registerDeviceName() {
  const inp = document.getElementById('deviceNameInput');
  const name = (inp?.value || '').trim();
  if (!name) { inp.style.borderColor = '#e74c3c'; inp.placeholder = '이름을 살짝 적어주세요 🙏'; inp.focus(); return; }
  setDeviceName(name);
  saveDeviceNameToFirebase(name);
  const modal = document.getElementById('deviceNameModal');
  if (modal) modal.remove();
}

// 기기이름 변경 프롬프트
function changeDeviceNamePrompt() {
  const cur = getDeviceName();
  const newName = prompt('기기 이름 변경', cur);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) { alert('이름을 입력해주세요'); return; }
  setDeviceName(trimmed);
  saveDeviceNameToFirebase(trimmed);
  alert('✅ 기기 이름이 "' + trimmed + '"(으)로 변경되었습니다');
}

// 비밀번호 변경 (본인)
async function changeMyPassword() {
  const u = typeof fbAuth !== 'undefined' && fbAuth.currentUser;
  if (!u || !u.email) { alert('로그인 상태가 아닙니다'); return; }
  const curPw = prompt('현재 비밀번호를 입력하세요');
  if (!curPw) return;
  const newPw = prompt('새 비밀번호를 입력하세요 (6자 이상)');
  if (!newPw) return;
  if (newPw.length < 6) { alert('비밀번호는 6자 이상이어야 합니다'); return; }
  const confirmPw = prompt('새 비밀번호를 한번 더 입력하세요');
  if (newPw !== confirmPw) { alert('비밀번호가 일치하지 않습니다'); return; }
  try {
    // 현재 비밀번호로 재인증
    const cred = firebase.auth.EmailAuthProvider.credential(u.email, curPw);
    await u.reauthenticateWithCredential(cred);
    await u.updatePassword(newPw);
    alert('✅ 비밀번호가 변경되었습니다');
  } catch (e) {
    if (e.code === 'auth/wrong-password') alert('현재 비밀번호가 틀렸습니다');
    else alert('비밀번호 변경 실패: ' + e.message);
  }
}

// 현재 사용자 + 기기이름 텍스트
async function getTgSender() {
  const u = typeof fbAuth !== 'undefined' && fbAuth.currentUser;
  const data = (typeof _cache !== 'undefined' && _cache) || {};
  let who = '익명';
  if (u && u.uid) {
    const ui = (data.users || {})[u.uid];
    who = ui?.name || u.email || u.uid;
  }
  const ip = await getClientIP();
  const devName = getDeviceName();
  const dev = getDeviceType();
  let ipText = ip;
  if (devName) ipText = `${ip} (${devName})`;
  else ipText = `${ip} (🆕 미등록 기기)`;
  return `\n👤 ${who} · ${dev}\n🌐 ${ipText}`;
}

// Firebase에 활동 로그 저장 (텔레그램 여부와 무관)
function addLog(text) {
  try {
    if (typeof fbDb === 'undefined') return;
    const u = typeof fbAuth !== 'undefined' && fbAuth.currentUser;
    const plainText = text.replace(/<[^>]+>/g, '');
    const entry = {
      text: plainText,
      who: u?.email || '익명',
      device: getDeviceName() || getDeviceType(),
      page: location.pathname.split('/').pop() || '',
      ts: Date.now()
    };
    fbDb.ref('/logs').push(entry);
  } catch (e) { console.warn('로그 저장 실패:', e); }
}

async function sendTelegram(text, opts) {
  // 로그는 항상 저장 (텔레그램 꺼져있어도)
  addLog(text);
  try {
    const data = (typeof _cache !== 'undefined' && _cache) || loadData();
    const cfg = data.telegram || {};
    if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;
    const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
    // 발신자 정보 자동 추가
    let fullText = text;
    if (!opts?.noSender) {
      try { fullText += await getTgSender(); } catch(e) {}
    }
    // 사이트 링크 + 복사 버튼
    const siteLink = opts?.link || __siteUrl;
    const copyText = fullText.replace(/<[^>]+>/g, '');
    const buttons = [
      [{ text: '🔗 사이트 열기', url: siteLink }],
      [{ text: '📋 내용 복사', copy_text: { text: copyText } }]
    ];
    const chatIds = String(cfg.chatId).split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    await Promise.all(chatIds.map(chatId =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId, text: fullText, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons }
        })
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
let _signingOut = false;   // 로그아웃 중 flag — DB 에러 무시용
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
      try { checkAccessGate(); } catch (e) { console.warn('게이트 체크 오류:', e); }
      _readyCallbacks.forEach(cb => cb());
      _readyCallbacks.length = 0;
    }
    try { checkAccessGate(); } catch (e) {}
    if (window.onDataChanged) window.onDataChanged();
  }, (err) => {
    // 로그아웃 중이면 무시 (signOut → signInAnonymously 사이에 발생)
    if (_signingOut) return;
    console.error('Firebase 읽기 오류:', err);
    alert('Firebase 연결 실패: ' + err.message);
  });
}
function stopFirebaseSync() {
  if (_syncInitialized && typeof fbDb !== 'undefined') {
    fbDb.ref('/').off('value');
  }
  _syncInitialized = false;
  _cacheReady = false;
}

// ───────── 🔒 접근 비밀번호 게이트 (첫 실행 1회 인증) ─────────
function checkAccessGate() {
  const gate = (_cache && _cache.accessGate) || null;
  if (!gate || !gate.enabled || !gate.pin) {
    const ex = document.getElementById('__accessGate');
    if (ex) ex.remove();
    return;
  }
  const authedV = localStorage.getItem('__gateAuthV');
  if (authedV && parseInt(authedV, 10) === (gate.version || 1)) return; // 이미 인증됨
  showAccessGate();
}
function showAccessGate() {
  if (document.getElementById('__accessGate')) return;
  if (!document.body) { document.addEventListener('DOMContentLoaded', showAccessGate); return; }
  const ov = document.createElement('div');
  ov.id = '__accessGate';
  ov.style.cssText = 'position:fixed;inset:0;background:#2c3e50;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;';
  ov.innerHTML = '<div style="background:#fff;border-radius:14px;padding:28px 24px;max-width:320px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.4);">'
    + '<div style="font-size:40px;margin-bottom:8px;">🔒</div>'
    + '<h2 style="color:#2c3e50;margin:0 0 6px;font-size:18px;">접근 인증</h2>'
    + '<p style="color:#888;font-size:13px;margin:0 0 16px;line-height:1.5;">단원 공통 비밀번호를 입력하세요<br>(이 기기에서 처음 한 번만)</p>'
    + '<input id="__gatePin" type="text" maxlength="40" placeholder="비밀번호" autocomplete="off" autocapitalize="off" autocorrect="off" '
    + 'style="width:100%;box-sizing:border-box;padding:13px;border:2px solid #ddd;border-radius:8px;font-size:16px;text-align:center;margin-bottom:12px;">'
    + '<button id="__gateBtn" style="width:100%;padding:13px;background:#2980b9;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">확인</button>'
    + '<p id="__gateErr" style="color:#e74c3c;font-size:12px;margin:10px 0 0;height:14px;"></p>'
    + '</div>';
  document.body.appendChild(ov);
  const pin = document.getElementById('__gatePin');
  document.getElementById('__gateBtn').addEventListener('click', submitAccessGate);
  pin.addEventListener('keydown', e => { if (e.key === 'Enter') submitAccessGate(); });
  setTimeout(() => pin.focus(), 100);
}
function submitAccessGate() {
  const gate = (_cache && _cache.accessGate) || null;
  if (!gate) { const g = document.getElementById('__accessGate'); if (g) g.remove(); return; }
  const input = (document.getElementById('__gatePin').value || '').trim();
  if (input === String(gate.pin)) {
    localStorage.setItem('__gateAuthV', String(gate.version || 1));
    const g = document.getElementById('__accessGate'); if (g) g.remove();
  } else {
    document.getElementById('__gateErr').textContent = '비밀번호가 틀립니다';
    const p = document.getElementById('__gatePin'); p.value = ''; p.focus();
  }
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
  // lastAdminId는 유지 (다음 로그인 시 ID 자동 입력)
  _signingOut = true;
  stopFirebaseSync();
  await fbAuth.signOut();
  // 익명 로그인 후 이동 (DB 접근 권한 유지, permission_denied 방지)
  try { await fbAuth.signInAnonymously(); } catch(e) {}
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
  const email = memberEmail(phone);
  const pw = pinToPassword(pin);
  let uid;

  // 전략: 로그인 먼저 → 없으면 생성 (email-already-in-use 에러 회피)
  const passwords = [pw];
  if (pinToPassword(DEFAULT_PIN) !== pw) passwords.push(pinToPassword(DEFAULT_PIN));
  if (pinToPassword('123456') !== pw && pinToPassword('123456') !== pinToPassword(DEFAULT_PIN))
    passwords.push(pinToPassword('123456'));

  // 1) 기존 계정 로그인 시도
  for (const tryPw of passwords) {
    try {
      const cred = await secAuth.signInWithEmailAndPassword(email, tryPw);
      uid = cred.user.uid;
      if (tryPw !== pw) { try { await cred.user.updatePassword(pw); } catch(e){} }
      await secAuth.signOut();
      break;
    } catch (ex) { /* 다음 후보 */ }
  }

  // 2) 로그인 실패 → 신규 생성
  if (!uid) {
    try {
      const cred = await secAuth.createUserWithEmailAndPassword(email, pw);
      uid = cred.user.uid;
      await secAuth.signOut();
    } catch (e) {
      throw new Error(phone + ' 계정 생성 실패: ' + (e.message || e.code));
    }
  }

  // memberId ↔ uid 매핑 저장
  const data = loadData();
  if (!data.memberAuth) data.memberAuth = {};
  data.memberAuth[uid] = memberId;
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
  // DB의 m.pin도 동기화 (관리자 PIN 초기화 시 현재 비번을 알아야 하므로)
  const data = loadData();
  const memberId = (data.memberAuth || {})[u.uid];
  if (memberId) {
    const m = (data.members || []).find(x => x.id === memberId);
    if (m) m.pin = newPin;
  }
  // 기본 PIN 플래그 해제
  if (data.memberPinFlags) {
    data.memberPinFlags[u.uid] = false;
  }
  saveData(data);
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

// ───────── 회원/관리자 구분 + 접근 제어 ─────────
// 현재 로그인 사용자가 일반 회원인지 (전화번호+PIN 로그인)
function isMemberUser() {
  const u = fbAuth.currentUser;
  if (!u || !u.email) return false;
  return /@bsp\.local$/i.test(u.email);
}

// 회원이 접근 가능한 페이지 (파일명)
const MEMBER_ALLOWED_PAGES = ['index.html', 'today.html', 'monitor.html', 'monitor-public.html', 'print.html', 'inquiry.html', 'teams.html', 'stats.html'];

// 🛡️ 권한 설정 (super가 accounts.html에서 변경) — 기본값 = 현재 동작
function getAccessCfg() {
  const a = (typeof _cache !== 'undefined' && _cache && _cache.access) || {};
  return {
    memberLogs: a.memberLogs !== false,    // 운행기록 회원 열람 (기본 허용)
    memberLive: !!a.memberLive,             // 모니터링 실시간 회원 열람 (기본 비허용)
    complaintWrite: a.complaintWrite || 'all'  // 민원 작성: all | member | admin
  };
}

// 네비게이션 접근 제어
function applyMemberNav() {
  const u = fbAuth.currentUser;
  const isMember = isMemberUser();
  const data = loadData();
  const myRole = (data.users || {})[u?.uid]?.role || '';

  // 회원이 nav에서 볼 수 있는 페이지
  const MEMBER_NAV_PAGES = ['index.html', 'today.html', 'monitor.html', 'inquiry.html', 'teams.html', 'print.html', 'stats.html'];

  document.querySelectorAll('nav a').forEach(a => {
    const rawHref = a.getAttribute('href') || '';
    const href = rawHref.split('?')[0];
    if (!href || href === '#') return; // 로그아웃 등 기능 링크는 건너뜀

    if (isMember) {
      // 회원: 허용 목록에 없으면 숨김
      let show = MEMBER_NAV_PAGES.includes(href);
      if (href === 'monitor.html') {
        // 회원은 '모니터링'(실시간) 링크 숨김, '운행기록'(?logs=1)만 표시 (운행기록 권한 있을 때)
        const isLogsLink = rawHref.indexOf('logs=1') >= 0;
        show = isLogsLink && getAccessCfg().memberLogs;
      }
      a.style.display = show ? '' : 'none';
    } else {
      // 관리자: 계정관리는 super만
      if (href === 'accounts.html') {
        a.style.display = (myRole === 'super') ? '' : 'none';
      }
    }
  });

  // 공통 네비 링크 보충 (없으면 추가)
  const nav = document.querySelector('nav');
  if (nav) {
    const logoutLink = nav.querySelector('a[onclick*="Logout"]');
    const addNavLink = (href, text) => {
      if (!nav.querySelector(`a[href="${href}"]`)) {
        const a = document.createElement('a');
        a.href = href;
        a.textContent = text;
        if (logoutLink) nav.insertBefore(a, logoutLink);
        else nav.appendChild(a);
      }
    };
    addNavLink('inquiry.html', '민원');
    addNavLink('teams.html', '조별');
    addNavLink('print.html', '인쇄');
  }
  // 새 기기 이름 등록 바
  showDeviceNameBar();
  // super가 기기이름 삭제했으면 재등록 유도
  checkDeviceNameSync();
}

// 관리자 전용 페이지에서 회원 차단
function blockMemberAccess() {
  const page = location.pathname.split('/').pop() || 'index.html';
  // 회원 → 허용 페이지만
  if (isMemberUser() && !MEMBER_ALLOWED_PAGES.includes(page)) {
    alert('관리자만 접근 가능한 페이지입니다.');
    location.href = 'index.html';
    return true;
  }
  // 운행기록(monitor.html) 회원 접근은 권한 설정에 따름
  if (isMemberUser() && page === 'monitor.html' && !getAccessCfg().memberLogs) {
    alert('운행기록 열람 권한이 없습니다.');
    location.href = 'index.html';
    return true;
  }
  // 계정관리 → super만
  if (page === 'accounts.html' && !isMemberUser()) {
    const data = loadData();
    const u = fbAuth.currentUser;
    const myRole = (data.users || {})[u?.uid]?.role || '';
    if (myRole !== 'super') {
      alert('계정관리는 super 권한만 접근 가능합니다.');
      location.href = 'index.html';
      return true;
    }
  }
  return false;
}

function checkAdminAuth() {
  return new Promise((resolve) => {
    let resolved = false;
    fbAuth.onAuthStateChanged((user) => {
      if (resolved) return;
      if (user && user.email) {
        resolved = true;
        initFirebaseSync();
        // 캐시 자동로그인 알림 (세션당 1회만)
        if (!sessionStorage.getItem('_loginNotified')) {
          sessionStorage.setItem('_loginNotified', '1');
          const page = location.pathname.split('/').pop() || 'index.html';
          onDataReady(() => {
            const ui = (loadData().users || {})[user.uid] || {};
            const member = getMemberByUid(loadData(), user.uid);
            const name = ui.name || (member && member.name) || user.email;
            const role = ui.role || (member ? '회원' : '-');
            getClientIP().then(ip => {
              const dev = getDeviceType();
              sendTelegram(`🔓 <b>자동접속</b>\n이름: ${name}\nID: ${user.email}\n권한: ${role}\n페이지: ${page}\n시각: ${new Date().toLocaleString('ko-KR')}\n접속: ${dev} · IP ${ip}`);
            });
          });
        }
        // 회원 접근 제어
        onDataReady(() => {
          if (blockMemberAccess()) return;
          applyMemberNav();
        });
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
          회원 <b>전화번호 + PIN 4자리</b>로 로그인하세요.
        </p>
        <label>전화번호 (- 없이)</label>
        <input id="loginEmail" type="text" autocomplete="username" placeholder="01012345678" value="${savedId}" oninput="autoFormatLoginId(this)">
        <label>비밀번호 / PIN</label>
        <input id="loginPw" type="password" autocomplete="current-password" placeholder="비밀번호 또는 PIN" onkeydown="if(event.key==='Enter')doLogin()">
        <div id="loginErr" style="color:#e74c3c;font-size:12px;margin-top:6px;min-height:14px;"></div>
        <button onclick="doLogin()" style="width:100%;margin-top:10px;padding:10px;">로그인</button>
        <details style="margin-top:14px;font-size:11px;color:#666;">
          <summary style="cursor:pointer;color:#3498db;">PIN이 없으면?</summary>
          <div style="padding:8px;background:#f8f9fa;border-radius:5px;margin-top:6px;line-height:1.6;">
            사무국장에게 PIN 발급 요청 → 전화번호 + 4자리 PIN으로 로그인
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

// 현재 로그인 사용자의 권한 (super/admin/member/null)
function getMyRole() {
  const u = fbAuth.currentUser;
  if (!u || !u.email || u.isAnonymous) return null;
  // 회원(@bsp.local)은 항상 'member'
  if (isMemberUser()) return 'member';
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
    // 회원(전화번호) 로그인 — 입력 PIN 실패 시 이전 기본 PIN들도 시도
    let loggedIn = false;
    if (isPhone) {
      const candidates = [password];
      if (pinToPassword('123456') !== password) candidates.push(pinToPassword('123456'));
      if (pinToPassword('1234') !== password) candidates.push(pinToPassword('1234'));
      for (const tryPw of candidates) {
        try {
          await adminSignIn(email, tryPw);
          loggedIn = true;
          // 비번이 입력한 것과 다르면 업데이트
          if (tryPw !== password) {
            try { await fbAuth.currentUser.updatePassword(password); } catch(ue){}
          }
          break;
        } catch (ex) { /* 다음 후보 */ }
      }
      if (!loggedIn) throw new Error('ID/비번 확인');
    } else {
      await adminSignIn(email, password);
    }

    localStorage.setItem('lastAdminId', id);
    document.getElementById('loginGate').remove();
    initFirebaseSync();
    // 회원 접근 제어
    onDataReady(() => {
      if (blockMemberAccess()) return;
      applyMemberNav();
    });
    if (window.onAuthSuccess) window.onAuthSuccess();
    // 텔레그램: 로그인 알림 (Firebase 데이터 도착 후, 기기+IP 포함)
    onDataReady(() => {
      const u = (loadData().users || {})[fbAuth.currentUser?.uid] || {};
      getClientIP().then(ip => {
        const dev = getDeviceType();
        sendTelegram(`🔐 <b>로그인</b>\nID: ${id}\n이름: ${u.name || '-'}\n시각: ${new Date().toLocaleString('ko-KR')}\n접속: ${dev} · IP ${ip}`);
      });
    });
    // 초기비번 123456면 변경 강제
    if (!isPhone && pw === '123456') setTimeout(promptPasswordChange, 600);
  } catch (e) {
    err.textContent = '로그인 실패: ID/비번 확인';
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
function getVehicle(data, vehicleId) {
  return ((data && data.vehicles) || []).find(v => v.id === vehicleId);
}
function findMemberByName(data, name) {
  return ((data && data.members) || []).find(m => m.name === name);
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
// 줌 레벨별 마커 스케일 (1=가까움, 14=멀리)
function getMarkerScale(level) {
  if (level <= 3) return 1.0;   // 가까이: 원래 크기
  if (level <= 5) return 0.65;
  if (level <= 7) return 0.45;
  return 0.3;                   // 멀리: 훨씬 작게
}

function numberedMarkerImage(num, color, dim, scale) {
  const s = scale || 1.0;
  const w = Math.round(22 * s), h = Math.round(28 * s);
  const fill = dim ? '#ccc' : color;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 22 28">
    <path d="M11 0 C5 0 0 5 0 11 C0 18 11 28 11 28 C11 28 22 18 22 11 C22 5 17 0 11 0 Z" fill="${fill}" stroke="white" stroke-width="1.5"/>
    <text x="11" y="15" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="white" text-anchor="middle">${num}</text>
  </svg>`;
  return new kakao.maps.MarkerImage(
    'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
    new kakao.maps.Size(w, h),
    { offset: new kakao.maps.Point(Math.round(w/2), h) }
  );
}

function scaledCircleMarkerImage(svgContent, scale) {
  const s = scale || 1.0;
  const sz = Math.round(28 * s);
  // svgContent의 width/height를 교체
  const scaled = svgContent.replace(/width="\d+"/, `width="${sz}"`).replace(/height="\d+"/, `height="${sz}"`);
  return new kakao.maps.MarkerImage(
    'data:image/svg+xml;utf8,' + encodeURIComponent(scaled),
    new kakao.maps.Size(sz, sz),
    { offset: new kakao.maps.Point(Math.round(sz/2), Math.round(sz/2)) }
  );
}

// 마커에 메타 저장 후 줌 변경 시 자동 리스케일
// marker.__markerMeta = { type:'numbered', num, color, dim }
//                     | { type:'circle', svg }
//                     | { type:'pin', svg, baseW, baseH }
function setupMarkerZoomScale(map, getMarkers) {
  let lastScale = getMarkerScale(map.getLevel());
  kakao.maps.event.addListener(map, 'zoom_changed', () => {
    const scale = getMarkerScale(map.getLevel());
    if (scale === lastScale) return;
    lastScale = scale;
    const markers = getMarkers();
    markers.forEach(m => {
      if (!m || !m.__markerMeta) return;
      const meta = m.__markerMeta;
      if (meta.type === 'numbered') {
        m.setImage(numberedMarkerImage(meta.num, meta.color, meta.dim, scale));
      } else if (meta.type === 'circle') {
        m.setImage(scaledCircleMarkerImage(meta.svg, scale));
      } else if (meta.type === 'pin') {
        const w = Math.round(meta.baseW * scale), h = Math.round(meta.baseH * scale);
        const svg = meta.svg.replace(/width="\d+"/, `width="${w}"`).replace(/height="\d+"/, `height="${h}"`);
        m.setImage(new kakao.maps.MarkerImage(
          'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
          new kakao.maps.Size(w, h),
          { offset: new kakao.maps.Point(Math.round(w/2), h) }
        ));
      }
    });
  });
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
  const webUrl = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android/.test(ua)) {
    // 앱 스킴 시도 → 일정 시간 내 전환 안 되면 웹으로 폴백
    const start = Date.now();
    const timer = setTimeout(() => {
      if (Date.now() - start < 2000) window.open(webUrl);
    }, 1200);
    window.addEventListener('pagehide', () => clearTimeout(timer), { once: true });
    location.href = `kakaomap://route?ep=${lat},${lng}&by=CAR`;
  } else {
    window.open(webUrl);
  }
}
