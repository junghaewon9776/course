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

// ───────── 🛰 코스 추적 엔진 (오늘운영 밖에서도 세션 살아있으면 계속 기록) ─────────
// today.html은 자체 추적하므로 엔진은 그 페이지에선 쉬고, 그 외 모든 페이지에서 이어받아 기록한다.
var __ctWatchId = null, __ctLastPub = 0, __ctInited = false;
function __ctPageName() { try { return (location.pathname.split('/').pop() || '').toLowerCase(); } catch (e) { return ''; } }
function __ctGetSession() {
  try {
    var raw = localStorage.getItem('lastActiveSession'); if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || s.finishedAt) return null;
    if (Date.now() - (s.startedAt || 0) > 12 * 60 * 60 * 1000) return null;   // 12시간 넘으면 무효
    return s;
  } catch (e) { return null; }
}
function __ctPublish(s, lat, lng, heading) {
  try {
    if (typeof fbDb === 'undefined' || !s.key) return;
    var now = Date.now();
    if (now - __ctLastPub < 10000) return;   // 10초 throttle (today.html과 동일)
    __ctLastPub = now;
    var data = (typeof _cache !== 'undefined' && _cache) || {};
    var anchors = (data.anchors || []).filter(function (a) { return a.courseId === s.courseId; });
    var findPhone = function (nm) { if (!nm) return ''; var m = (data.members || []).find(function (x) { return (x.name || '').trim() === String(nm).trim(); }); return (m && m.phone) || ''; };
    var crew = s.crew || {};
    publishLiveSession(s.key, {
      lat: lat, lng: lng, heading: (heading != null ? heading : null),
      eventId: s.eventId, courseId: s.courseId, teamId: s.teamId,
      crew: Object.assign({}, crew, { driverPhone: crew.driverPhone || findPhone(crew.driver), assistPhone: crew.assistPhone || findPhone(crew.assist) }),
      completedCount: (s.completions || []).length,
      totalCount: anchors.length,
      startedAt: s.startedAt,
      device: (typeof getDeviceName === 'function' && getDeviceName()) || '',
      pins: (s.pins || []),
      track: (s.track || []).slice(-200)
    });
  } catch (e) {}
}
function __ctOnUpdate(lat, lng, heading) {
  var s = __ctGetSession();
  if (!s) { __ctStop(); return; }   // 세션 종료/취소됐으면 엔진 정지
  if (!Array.isArray(s.track)) s.track = [];
  var last = s.track[s.track.length - 1];
  var moved = 999;
  try { if (last) moved = distance(last[0], last[1], lat, lng); } catch (e) {}
  if (!last || moved > 5) {   // 5m 이상 이동 시만 기록 (today.html과 동일)
    s.track.push([lat, lng, Date.now()]);
    try { localStorage.setItem('lastActiveSession', JSON.stringify(s)); } catch (e) {}
  }
  __ctPublish(s, lat, lng, heading);
}
function __ctStart() {
  if (__ctWatchId !== null) return;
  var BG = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundGeolocation) || null;
  if (BG) {
    var ret = BG.addWatcher({
      backgroundMessage: "운영이 끝나면 오늘운영에서 코스완료를 눌러주세요",
      backgroundTitle: "🚐 방역코스 운행 중",
      requestPermissions: true, stale: false, distanceFilter: 1
    }, function (loc, err) {
      if (err) { console.warn('추적엔진 GPS 오류', err); return; }
      if (loc) __ctOnUpdate(loc.latitude, loc.longitude, (loc.bearing != null ? loc.bearing : null));
    });
    if (ret && typeof ret.then === 'function') ret.then(function (id) { __ctWatchId = id || 'bg'; });
    else __ctWatchId = ret || 'bg';
  } else if (navigator.geolocation) {
    __ctWatchId = navigator.geolocation.watchPosition(function (p) {
      __ctOnUpdate(p.coords.latitude, p.coords.longitude, p.coords.heading);
    }, function (e) { console.warn('추적엔진 web GPS', e); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }
}
function __ctStop() {
  if (__ctWatchId === null) return;
  var BG = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundGeolocation) || null;
  try {
    if (BG && __ctWatchId && __ctWatchId !== 'bg') BG.removeWatcher({ id: __ctWatchId });
    else if (typeof __ctWatchId === 'number') navigator.geolocation.clearWatch(__ctWatchId);
  } catch (e) {}
  __ctWatchId = null;
}
function initCourseTracker() {
  if (__ctInited) return; __ctInited = true;
  if (__ctPageName() === 'today.html') return;   // 오늘운영은 자체 추적 → 엔진 쉼
  window.addEventListener('pagehide', __ctStop);  // 이 페이지 떠날 땐 정리(다음 페이지가 이어받음)
  if (__ctGetSession()) __ctStart();              // 진행 중 세션 있으면 어느 화면이든 계속 기록
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCourseTracker);
else initCourseTracker();

// ───────── 🗺 로드뷰 (카카오 내장 — 어느 지도에서든 위치의 거리 사진) ─────────
function openRoadview(lat, lng, title) {
  lat = Number(lat); lng = Number(lng);
  if (!lat || !lng) { alert('위치 정보가 없습니다.'); return; }
  if (!(window.kakao && kakao.maps && kakao.maps.Roadview && kakao.maps.RoadviewClient)) {
    alert('지도가 아직 준비 중입니다. 잠시 후 다시 눌러주세요.'); return;
  }
  var ov = document.getElementById('__rvModal'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id = '__rvModal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100002;background:#000;display:flex;flex-direction:column;';
  var bar = document.createElement('div');
  bar.style.cssText = 'flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;background:#1a1a1a;color:#fff;font-size:14px;font-weight:700;';
  bar.innerHTML = '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🗺 로드뷰' + (title ? ' · ' + String(title).replace(/</g, '&lt;') : '') + '</span>';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.style.cssText = 'flex:none;background:#e74c3c;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-weight:700;font-size:14px;cursor:pointer;';
  closeBtn.onclick = function () { ov.remove(); };
  bar.appendChild(closeBtn);
  var rvDiv = document.createElement('div'); rvDiv.style.cssText = 'flex:1;width:100%;';
  ov.appendChild(bar); ov.appendChild(rvDiv);
  document.body.appendChild(ov);
  var pos = new kakao.maps.LatLng(lat, lng);
  var rv = new kakao.maps.Roadview(rvDiv);
  var client = new kakao.maps.RoadviewClient();
  client.getNearestPanoId(pos, 120, function (panoId) {
    if (panoId === null) {
      rvDiv.innerHTML = '<div style="color:#fff;text-align:center;padding:80px 20px;font-size:15px;line-height:1.6;">이 위치 주변엔 로드뷰가 없어요.<br><span style="opacity:.7;font-size:13px;">(골목·시골길·농로는 로드뷰 미지원 구간이 많아요)</span></div>';
      return;
    }
    rv.setPanoId(panoId, pos);
  });
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
  // 업로더(작성자) 이름 — 퀘스트 XP 매칭용
  var __uploader = '';
  try {
    var __u = (typeof fbAuth !== 'undefined' && fbAuth.currentUser) || null;
    var __d = (typeof _cache !== 'undefined' && _cache) || {};
    var __mid = __u ? (__d.memberAuth || {})[__u.uid] : null;
    var __mem = __mid ? (__d.members || []).find(function (m) { return m.id === __mid; }) : null;
    __uploader = (__mem && __mem.name) || ((__d.users || {})[__u && __u.uid] || {}).name || '';
  } catch (e) {}
  if (!__uploader) __uploader = meta?.note || '';   // 코스 사진은 운전자명 fallback
  // 조원(운전+보조) 이름 — 사진 점수는 조 두 명 모두에게
  var __crewNames = [];
  if (meta && meta.driver) __crewNames.push(String(meta.driver).trim());
  if (meta && meta.assist) String(meta.assist).split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (n) { __crewNames.push(n); });
  var payload = {
    type: meta?.type || 'field',
    takenAt: Date.now(),
    sessionKey: meta?.sessionKey || '',
    eventId: meta?.eventId || '',
    courseId: meta?.courseId || '',
    teamId: meta?.teamId || '',
    lat: meta?.lat ?? null,
    lng: meta?.lng ?? null,
    note: meta?.note || '',
    uploader: __uploader,
    uploaderUid: (typeof fbAuth !== 'undefined' && fbAuth.currentUser && fbAuth.currentUser.uid) || '',
    crewNames: __crewNames
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

// ───────── 📲 푸시 알림 (앱 전용) ─────────
let __pushInited = false;
function initPushNotifications() {
  try {
    if (__pushInited) return;
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if (!P) return;  // 웹/플러그인 없으면 스킵
    __pushInited = true;
    P.addListener('registration', token => { window.__pushToken = (token && token.value) || ''; savePushToken(window.__pushToken); });
    P.addListener('registrationError', err => console.warn('푸시 등록 오류', err));
    P.addListener('pushNotificationReceived', notif => {
      // 포그라운드 수신 시 진동 + 화면 상단 배너 (앱 켜둔 상태)
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
      try {
        const t = (notif && notif.title) || '🔔 알림';
        const b = (notif && notif.body) || '';
        showPushBanner(t, b);
      } catch (e) {}
    });
    // 알림 누르면 종류에 맞는 화면으로 (민원→게시판, 코스→모니터링[간부], 그외→이동 X)
    P.addListener('pushNotificationActionPerformed', action => {
      try {
        const n = (action && action.notification) || {};
        routePushTap((n.title || '') + ' ' + (n.body || ''));
      } catch (e) {}
    });
    P.checkPermissions().then(perm => {
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') return P.requestPermissions();
      return perm;
    }).then(perm => {
      if (perm && perm.receive === 'granted') P.register();
      else showNotifPermBanner();   // 🔔 알림 권한 꺼짐 → 켜라고 안내
    }).catch(e => console.warn('푸시 권한 오류', e));
  } catch (e) { console.warn('푸시 초기화 오류', e); }
}
// 📁 파일 저장 (공용) — 앱: Filesystem 저장 후 Share, 웹: 다운로드. content = dataURL 또는 텍스트
async function saveFile(filename, content, mime) {
  const isData = /^data:/.test(content);
  try {
    const Cap = window.Capacitor;
    const FS = Cap && Cap.Plugins && Cap.Plugins.Filesystem;
    const Share = Cap && Cap.Plugins && Cap.Plugins.Share;
    if (FS) {
      const base64 = isData ? content.split(',')[1] : btoa(unescape(encodeURIComponent(content)));
      const r = await FS.writeFile({ path: filename, data: base64, directory: 'CACHE' });
      if (Share) { try { await Share.share({ title: filename, url: r.uri, dialogTitle: '저장 / 공유' }); return true; } catch (e) {} }
      alert('저장됨:\n' + (r.uri || filename));
      return true;
    }
  } catch (e) { console.warn('앱 파일저장 실패, 웹 다운로드 시도', e); }
  try {
    let url = isData ? content : URL.createObjectURL(new Blob([content], { type: mime || 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    if (!isData) setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (e) { alert('저장 실패: ' + e.message); return false; }
}
// 🔔 알림 권한 꺼짐 안내 배너
function showNotifPermBanner() {
  try {
    if (!document.body) { document.addEventListener('DOMContentLoaded', showNotifPermBanner); return; }
    if (document.getElementById('__notifPermBanner')) return;
    const b = document.createElement('div');
    b.id = '__notifPermBanner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483646;background:#e74c3c;color:#fff;padding:12px 14px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);';
    b.innerHTML = '🔔 알림이 꺼져 있어요! 받으려면 눌러서 켜기 <span id="__npbX" style="float:right;padding:0 4px;">✕</span>';
    b.onclick = function (e) {
      if (e.target && e.target.id === '__npbX') { b.remove(); return; }
      alert('폰 설정 → 앱 → 방역(코스) → 알림 → "켜기"\n\n그 후 앱을 다시 켜면 알림이 옵니다.');
    };
    document.body.appendChild(b);
  } catch (e) {}
}
// 🔔 앱 아이콘 배지/트레이 알림 제거 (알림 내역을 "봤을 때"만 호출)
function clearPushBadge() {
  try {
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if (P && P.removeAllDeliveredNotifications) P.removeAllDeliveredNotifications();
  } catch (e) {}
}
// 알림 내역 (/pushLog 기반) ─────────
function getNotifLog() {
  const d = (typeof _cache !== 'undefined' && _cache && _cache.pushLog) || {};
  const arr = Object.keys(d).map(k => Object.assign({ _key: k }, d[k])).filter(x => x && x.at);
  arr.sort((a, b) => (b.at || 0) - (a.at || 0));
  return arr;
}
function deleteNotifItem(key) {
  let role = null; try { role = getMyRole(); } catch (e) {}
  if (role !== 'admin' && role !== 'super') { alert('관리자(admin) 이상만 가능합니다.'); return; }
  if (!key) return;
  if (!confirm('이 알림을 삭제할까요?')) return;
  try { if (typeof fbDb !== 'undefined') fbDb.ref('/pushLog/' + key).remove(); if (typeof _cache !== 'undefined' && _cache && _cache.pushLog) delete _cache.pushLog[key]; } catch (e) {}
  try { renderNotifBell(); } catch (e) {}
  showNotifHistory(window.__notifShowAll);  // 목록 갱신
}
function notifUnreadCount() {
  const seen = parseInt(localStorage.getItem('__notifSeenAt') || '0', 10);
  return getNotifLog().filter(n => (n.at || 0) > seen).length;
}
function renderNotifBell() {
  if (!document.body) return;
  let bell = document.getElementById('__notifBell');
  if (!bell) {
    bell = document.createElement('div');
    bell.id = '__notifBell';
    bell.style.cssText = 'position:fixed;z-index:99990;width:46px;height:46px;border-radius:50%;background:#2980b9;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 3px 10px rgba(0,0,0,.35);cursor:pointer;touch-action:none;user-select:none;';
    bell.innerHTML = '🔔<span id="__notifBadge" style="position:absolute;top:-3px;right:-3px;background:#e74c3c;color:#fff;border-radius:11px;min-width:20px;height:20px;font-size:11px;font-weight:700;align-items:center;justify-content:center;padding:0 4px;box-sizing:border-box;display:none;"></span>';
    document.body.appendChild(bell);
    // 저장된 위치 복원 (없으면 우측 중앙쯤 — 다른 버튼과 안 겹치게)
    const saved = (() => { try { return JSON.parse(localStorage.getItem('__notifBellPos') || 'null'); } catch (e) { return null; } })();
    if (saved && typeof saved.left === 'number') { bell.style.left = saved.left + 'px'; bell.style.top = saved.top + 'px'; }
    else { bell.style.right = '12px'; bell.style.top = '50%'; }
    makeBellDraggable(bell);
  }
  const n = notifUnreadCount();
  const badge = document.getElementById('__notifBadge');
  if (badge) {
    if (n > 0) { badge.style.display = 'flex'; badge.textContent = n > 99 ? '99+' : n; }
    else { badge.style.display = 'none'; }
  }
}
// 벨: 포인터 이벤트로 탭(열기)/드래그(이동) 처리 — 터치/마우스 공통, 안정적
function makeBellDraggable(bell) {
  let down = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
  bell.addEventListener('pointerdown', e => {
    down = true; moved = false; sx = e.clientX; sy = e.clientY;
    const r = bell.getBoundingClientRect(); ox = r.left; oy = r.top;
    try { bell.setPointerCapture(e.pointerId); } catch (er) {}
  });
  bell.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
    if (!moved) return;
    const nx = Math.max(4, Math.min(window.innerWidth - 50, ox + dx));
    const ny = Math.max(4, Math.min(window.innerHeight - 50, oy + dy));
    bell.style.left = nx + 'px'; bell.style.top = ny + 'px';
    bell.style.right = 'auto'; bell.style.bottom = 'auto';
  });
  bell.addEventListener('pointerup', e => {
    if (!down) return;
    down = false;
    try { bell.releasePointerCapture(e.pointerId); } catch (er) {}
    if (moved) {
      const r = bell.getBoundingClientRect();
      try { localStorage.setItem('__notifBellPos', JSON.stringify({ left: r.left, top: r.top })); } catch (er) {}
    } else {
      showNotifHistory();  // 탭 = 열기
    }
  });
}
function clearNotifLog() {
  let role = null; try { role = getMyRole(); } catch (e) {}
  if (role !== 'admin' && role !== 'super') { alert('관리자(admin) 이상만 삭제 가능합니다.'); return; }
  if (!confirm('알림 내역을 전부 삭제할까요?')) return;
  try { if (typeof fbDb !== 'undefined') fbDb.ref('/pushLog').remove(); if (typeof _cache !== 'undefined' && _cache) _cache.pushLog = {}; } catch (e) {}
  const m = document.getElementById('__notifModal'); if (m) m.remove();
  try { localStorage.setItem('__notifSeenAt', String(Date.now())); } catch (e) {}
  try { renderNotifBell(); } catch (e) {}
  alert('알림 내역을 삭제했어요.');
}
function showNotifHistory(showAll) {
  const prevSeen = parseInt(localStorage.getItem('__notifSeenAt') || '0', 10);
  const all = getNotifLog();
  const list = (showAll ? all : all.filter(n => (n.at || 0) > prevSeen)).slice(0, 200);
  let modal = document.getElementById('__notifModal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = '__notifModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;padding:50px 12px;';
  const __openAt = Date.now();
  modal.addEventListener('click', e => { if (e.target === modal && Date.now() - __openAt > 350) modal.remove(); });
  window.__notifShowAll = !!showAll;
  let __delRole = null; try { __delRole = getMyRole(); } catch (e) {}
  const __canDel = (__delRole === 'admin' || __delRole === 'super');
  const rows = list.length ? list.map(n => {
    const t = new Date(n.at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return '<div style="padding:10px 12px;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:flex-start;">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:700;font-size:14px;color:#2c3e50;">' + String(n.title || '').replace(/</g, '&lt;') + '</div>'
      + '<div style="font-size:13px;color:#555;margin-top:2px;white-space:pre-wrap;">' + String(n.body || '').replace(/</g, '&lt;') + '</div>'
      + '<div style="font-size:11px;color:#aaa;margin-top:3px;">' + t + '</div></div>'
      + (__canDel ? '<span onclick="deleteNotifItem(\'' + (n._key || '') + '\')" style="cursor:pointer;color:#e74c3c;font-size:16px;padding:2px 4px;flex-shrink:0;">🗑</span>' : '')
      + '</div>';
  }).join('') : '<div style="padding:30px;text-align:center;color:#aaa;">' + (showAll ? '알림 내역이 없습니다' : '새 알림이 없습니다') + '</div>';
  const footer = showAll ? '' : '<div onclick="showNotifHistory(true)" style="padding:13px;text-align:center;color:#2980b9;font-weight:700;font-size:13px;cursor:pointer;border-top:1px solid #eee;background:#f7f9fc;">📜 이전 내역 전체보기</div>';
  modal.innerHTML = '<div style="background:#fff;border-radius:12px;width:100%;max-width:420px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.3);">'
    + '<div style="padding:14px 16px;background:#2980b9;color:#fff;font-weight:700;display:flex;justify-content:space-between;align-items:center;">'
    + '<span>🔔 ' + (showAll ? '알림 내역 (전체)' : '새 알림') + '</span>'
    + '<span style="display:flex;gap:14px;align-items:center;">'
    + ((function(){ let r=null; try{r=getMyRole();}catch(e){} return (r==='admin'||r==='super')?'<span onclick="clearNotifLog()" style="cursor:pointer;font-size:13px;font-weight:700;">🗑 삭제</span>':''; })())
    + '<span onclick="document.getElementById(\'__notifModal\').remove()" style="cursor:pointer;font-size:22px;line-height:1;">&times;</span>'
    + '</span></div>'
    + '<div style="overflow-y:auto;flex:1;">' + rows + '</div>'
    + footer + '</div>';
  document.body.appendChild(modal);
  // ✅ 새 알림 화면을 열었을 때만 읽음 처리 + 배지 제거 (이전내역 전체보기는 제외)
  if (!showAll) {
    localStorage.setItem('__notifSeenAt', String(Date.now()));
    try { clearPushBadge(); } catch (e) {}
    renderNotifBell();
  }
}

// 푸시 수신 비프음 (앱 켜둔 상태)
function playPushBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const beep = (freq, start, dur) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, ac.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
      o.start(ac.currentTime + start); o.stop(ac.currentTime + start + dur);
    };
    beep(880, 0, 0.18); beep(1175, 0.2, 0.22);  // 카톡 비슷한 띵-동
    setTimeout(() => { try { ac.close(); } catch (e) {} }, 800);
  } catch (e) {}
}
// 알림 탭 시 종류별 이동 (민원게시판 관련 → inquiry, 코스 → 모니터링[간부만], 그 외 → 이동 안 함)
function routePushTap(txt) {
  try {
    txt = txt || '';
    // 민원/댓글/답변/거점/방역금지 → 민원게시판 (회원도 접근 가능)
    if (/💬|답변|댓글|민원|거점|방역금지|📋|📞|🚫/.test(txt)) {
      if (location.pathname.indexOf('inquiry') < 0) location.href = 'inquiry.html';
      return true;
    }
    // 코스 시작/완료 → 모니터링 (간부만 받고 접근 가능)
    if (/코스 시작|코스 완료|▶|운행/.test(txt)) {
      let role = null; try { role = getMyRole(); } catch (e) {}
      if (role === 'admin' || role === 'super') {
        if (location.pathname.indexOf('monitor') < 0) location.href = 'monitor.html';
        return true;
      }
    }
    return false; // 그 외: 이동 안 함 (앱만 열림)
  } catch (e) { return false; }
}
// 카톡 스타일 상단 배너 (앱 켜둔 상태에서 푸시 수신 시)
function showPushBanner(title, body) {
  const draw = () => {
    try {
      if (!document.body) return;
      let el = document.getElementById('__pushBanner');
      if (el) el.remove();
      el = document.createElement('div');
      el.id = '__pushBanner';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;'
        + 'background:#1565c0;color:#fff;padding:8px 12px;'
        + 'box-shadow:0 3px 10px rgba(0,0,0,.3);cursor:pointer;'
        + 'font-family:inherit;transform:translateY(-130%);transition:transform .25s ease;';
      const safeTitle = String(title || '🔔 알림').replace(/</g, '&lt;');
      const safeBody = String(body || '').replace(/</g, '&lt;');
      el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;">'
        + '<div style="font-size:16px;line-height:1;">🔔</div>'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-weight:700;font-size:13px;line-height:1.3;">' + safeTitle + '</div>'
        + '<div style="font-size:12px;opacity:.95;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + safeBody + '</div>'
        + '</div></div>';
      el.onclick = function () { try { if (!routePushTap((title || '') + ' ' + (body || ''))) el.remove(); } catch (e) {} };
      document.body.appendChild(el);
      requestAnimationFrame(() => { el.style.transform = 'translateY(0)'; });
      setTimeout(() => {
        try {
          el.style.transform = 'translateY(-130%)';
          setTimeout(() => { try { el.remove(); } catch (e) {} }, 320);
        } catch (e) {}
      }, 6000);
    } catch (e) {}
  };
  try { playPushBeep(); } catch (e) {}
  if (document.body) draw();
  else document.addEventListener('DOMContentLoaded', draw);
}
function savePushToken(token) {
  if (typeof fbDb === 'undefined' || !token) return;
  window.__pushToken = token;
  const deviceId = getDeviceId();
  const u = (typeof fbAuth !== 'undefined' && fbAuth.currentUser) || {};
  let role = 'anon';
  try { role = getMyRole() || 'anon'; } catch (e) {}
  window.__pushTokenRole = role;
  fbDb.ref('/pushTokens/' + deviceId).set({
    token: token, role: role, uid: u.uid || '', name: getDeviceName() || getDeviceType(), updatedAt: Date.now()
  }).catch(e => console.warn('푸시토큰 저장 실패', e));
}
// 로그인 등으로 역할이 바뀌면 토큰을 새 역할로 다시 저장 (anon→super 등)
function maybeResavePushToken() {
  if (!window.__pushToken) return;
  let role = 'anon';
  try { role = getMyRole() || 'anon'; } catch (e) {}
  if (role === window.__pushTokenRole) return;
  savePushToken(window.__pushToken);
}

// 알림 문구 템플릿: data.pushTemplates[key] 우선, 없으면 기본값. {플레이스홀더} 치환.
function pushTemplate(key, ctx, defTitle, defBody) {
  const t = (typeof _cache !== 'undefined' && _cache && _cache.pushTemplates && _cache.pushTemplates[key]) || {};
  let title = (t.title != null && t.title !== '') ? t.title : defTitle;
  let body = (t.body != null && t.body !== '') ? t.body : defBody;
  const c = ctx || {};
  for (const k in c) {
    const v = (c[k] == null) ? '' : String(c[k]);
    title = title.split('{' + k + '}').join(v);
    body = body.split('{' + k + '}').join(v);
  }
  return { title: title, body: body };
}

// 앱 푸시 발송 (GAS 웹앱 경유) — target: 'admin'(간부) | 'all'
const PUSH_WEBHOOK_DEFAULT = 'https://script.google.com/macros/s/AKfycbxaaLoXv7rA-OR_PEIazbYq44zahdiCu6ZtMDa3N3bbrruqxQz0yclWHU7Esl5_yHL2/exec';
function sendAppPush(title, body, target, category, targetUid) {
  try {
    // 회원용 카테고리(anchor/noSpray/complaint)인데 super가 껐으면 간부에게만
    if (target === 'all' && category) {
      const prefs = (typeof _cache !== 'undefined' && _cache && _cache.pushPrefs) || {};
      if (prefs[category] === false) target = 'admin';
    }
    const cfg = (typeof _cache !== 'undefined' && _cache && _cache.pushWebhook) || {};
    const url = cfg.url || PUSH_WEBHOOK_DEFAULT;
    const secret = cfg.secret || 'bsp_push_2026';
    if (!url) return;
    // 🔔 알림 내역 기록 (/pushLog)
    try {
      if (typeof fbDb !== 'undefined') {
        fbDb.ref('/pushLog').push({ title: title || '알림', body: body || '', target: target || 'admin', uid: targetUid || '', at: Date.now() });
      }
    } catch (e) {}
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // CORS preflight 회피
      body: JSON.stringify({ secret: secret, title: title || '알림', body: body || '', target: target || 'admin', uid: targetUid || '' })
    }).catch(e => console.warn('푸시 발송 실패', e));
  } catch (e) { console.warn('푸시 발송 오류', e); }
}

// ───────── 🎖 계급/진급 엔진 (stats.html과 동일 규칙) ─────────
var CM_DEFAULT_RANK_TIERS = [
  { name: '이등병', minXp: 0, icon: '▔' }, { name: '일병', minXp: 100, icon: '▔▔' }, { name: '상병', minXp: 250, icon: '▔▔▔' },
  { name: '병장', minXp: 450, icon: '▔▔▔▔' }, { name: '하사', minXp: 700, icon: '∨' }, { name: '중사', minXp: 1000, icon: '∨∨' },
  { name: '상사', minXp: 1400, icon: '∨∨∨' }, { name: '원사', minXp: 1900, icon: '∨∨∨∨' }, { name: '준위', minXp: 2500, icon: '◈' },
  { name: '소위', minXp: 3200, icon: '◆' }, { name: '중위', minXp: 4000, icon: '◆◆' }, { name: '대위', minXp: 5000, icon: '◆◆◆' },
  { name: '소령', minXp: 6200, icon: '❖' }, { name: '중령', minXp: 7600, icon: '❖❖' }, { name: '대령', minXp: 9200, icon: '❖❖❖' },
  { name: '준장', minXp: 11000, icon: '★' }, { name: '소장', minXp: 13000, icon: '★★' }, { name: '중장', minXp: 15500, icon: '★★★' },
  { name: '대장', minXp: 18500, icon: '★★★★' }, { name: '부원수', minXp: 22000, icon: '★★★★★' }, { name: '원수', minXp: 26000, icon: '★★★★★★' }
];
function cmRankTiers(data) {
  const d = data || (typeof _cache !== 'undefined' && _cache) || {};
  if (Array.isArray(d.rankTiers) && d.rankTiers.length) return d.rankTiers.slice().sort((a, b) => (a.minXp || 0) - (b.minXp || 0));
  return CM_DEFAULT_RANK_TIERS;
}
function cmXpCfg(data) {
  const d = data || (typeof _cache !== 'undefined' && _cache) || {};
  const c = d.xpConfig || {};
  return { perVax: (c.perVax != null ? c.perVax : 10), setBonus: (c.setBonus != null ? c.setBonus : 100) };
}
// 특정 행사·특정 사람의 코스별 횟수 → xp/계급 인덱스
function cmMemberEventStat(data, event, name) {
  const courses = (event.courses || []);
  const counts = courses.map(() => 0);
  const idx = {}; courses.forEach((c, i) => idx[c.id] = i);
  (data.logs || []).forEach(l => {
    if (!l || l.eventId !== event.id || !l.finishedAt) return;
    const keys = [];
    if (l.crew && l.crew.driver) keys.push(l.crew.driver.trim());
    if (l.crew && l.crew.assist) l.crew.assist.split(',').map(s => s.trim()).filter(Boolean).forEach(n => keys.push(n));
    if (keys.indexOf(name) < 0) return;
    if (idx[l.courseId] != null) counts[idx[l.courseId]]++;
  });
  const total = counts.reduce((s, v) => s + v, 0);
  const sets = counts.length ? Math.min.apply(null, counts) : 0;
  const cfg = cmXpCfg(data);
  const xp = total * cfg.perVax + sets * cfg.setBonus;
  const tiers = cmRankTiers(data);
  let ri = 0; for (let i = 0; i < tiers.length; i++) { if (xp >= (tiers[i].minXp || 0)) ri = i; }
  return { total: total, sets: sets, xp: xp, rankIndex: ri, rank: tiers[ri] };
}
function cmRankKey(s) { return String(s || '').replace(/[.#$/\[\]]/g, '_'); }
// 퀘스트 목록 (stats.html과 동일 규칙, 없으면 방역/세트 기본)
function cmGetQuests(data) {
  if (Array.isArray(data.quests) && data.quests.length) return data.quests;
  const c = cmXpCfg(data);
  return [{ trigger: 'vax', category: '', xp: c.perVax }, { trigger: 'set', category: '', xp: c.setBonus }];
}
// 특정 사람의 총 XP(퀘스트 합산, 올해 기준 — stats.html 기본 화면과 동일) → 계급 인덱스
function cmTotalXp(data, name) {
  const __y = new Date().getFullYear();
  function __inYr(ts) { return new Date(ts || 0).getFullYear() === __y; }
  let vaxTotal = 0, setTotal = 0;
  (data.events || []).forEach(ev => {
    const courses = ev.courses || [];
    const idx = {}; courses.forEach((c, i) => idx[c.id] = i);
    const counts = courses.map(() => 0);
    (data.logs || []).forEach(l => {
      if (!l || l.eventId !== ev.id || !l.finishedAt) return;
      if (!__inYr(l.startedAt || l.finishedAt)) return;   // 올해 로그만 (통계와 동일)
      const keys = [];
      if (l.crew && l.crew.driver) keys.push(l.crew.driver.trim());
      if (l.crew && l.crew.assist) l.crew.assist.split(',').map(s => s.trim()).filter(Boolean).forEach(n => keys.push(n));
      if (keys.indexOf(name) < 0) return;
      if (idx[l.courseId] != null) counts[idx[l.courseId]]++;
    });
    vaxTotal += counts.reduce((s, v) => s + v, 0);
    setTotal += counts.length ? Math.min.apply(null, counts) : 0;
  });
  function inqCount(cat) { let n = 0; (data.inquiries || []).forEach(q => { if (!q || (cat && q.category !== cat)) return; if ((q.writer || '').trim() === name && __inYr(q.createdAt)) n++; }); return n; }
  function cmtCount(cat) { let n = 0; (data.inquiries || []).forEach(q => { if (!q || (cat && q.category !== cat)) return; (q.comments || []).forEach(c => { if (c && (c.writer || '').trim() === name && __inYr(c.createdAt || q.createdAt)) n++; }); }); return n; }
  // 세션키→조원 맵 (예전 사진 소급 반영)
  const __sessCrew = {};
  (data.logs || []).forEach(function (l) {
    if (!l || !l.key || !l.crew) return;
    const ns = [];
    if (l.crew.driver) ns.push(l.crew.driver.trim());
    if (l.crew.assist) l.crew.assist.split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (x) { ns.push(x); });
    if (ns.length) __sessCrew[l.key] = ns;
  });
  function photoCnt(pt, capPerCourse) {
    const perSess = {}; const ph = data.photos || {};
    Object.keys(ph).forEach(k => { const p = ph[k]; if (!p) return; if (pt && p.type !== pt) return; if (!__inYr(p.takenAt)) return; let nm = (p.crewNames && p.crewNames.length) ? p.crewNames : null; if (!nm && p.sessionKey && __sessCrew[p.sessionKey]) nm = __sessCrew[p.sessionKey]; if (!nm) nm = [p.uploader || p.note]; if (nm.map(function (x) { return (x || '').trim(); }).indexOf(name) < 0) return; const sk = p.sessionKey || 'nokey'; perSess[sk] = (perSess[sk] || 0) + 1; });
    const cap = Number(capPerCourse) || 0;
    let n = 0; Object.keys(perSess).forEach(function (sk) { n += cap > 0 ? Math.min(perSess[sk], cap) : perSess[sk]; });
    return n;
  }
  // 월별/년도 1등 계산 (방역 최다)
  function vaxBy(ls) { const m = {}; ls.forEach(l => { if (!l || !l.finishedAt) return; const ks = []; if (l.crew && l.crew.driver) ks.push(l.crew.driver.trim()); if (l.crew && l.crew.assist) l.crew.assist.split(',').map(s => s.trim()).filter(Boolean).forEach(n => ks.push(n)); ks.forEach(n => { if (n) m[n] = (m[n] || 0) + 1; }); }); return m; }
  const allLogs = (data.logs || []).filter(l => l && l.finishedAt && __inYr(l.startedAt || l.finishedAt));   // 올해 로그만
  function cmBucket(keyFn) { const b = {}; allLogs.forEach(function (l) { const t = l.startedAt || l.finishedAt || 0; const k = keyFn(l, t); (b[k] = b[k] || []).push(l); }); return b; }
  function cmWeekKey(t) { const d = new Date(t); const day = (d.getDay() + 6) % 7; const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day); return mon.getFullYear() + '-' + (mon.getMonth() + 1) + '-' + mon.getDate(); }
  function cmMonthKey(t) { const d = new Date(t); return d.getFullYear() + '-' + d.getMonth(); }
  // ⏳ 끝난 기간만 인정 (stats.html과 동일)
  const __cmNow = Date.now();
  const cmCurW = cmWeekKey(__cmNow), cmCurM = cmMonthKey(__cmNow), cmCurY = String(new Date(__cmNow).getFullYear());
  function cmWins(b, skip) { let w = 0; Object.keys(b).forEach(function (k) { if (skip && skip(k)) return; const cc = vaxBy(b[k]); let best = null, bn = 0; Object.keys(cc).forEach(function (n) { if (cc[n] > bn) { bn = cc[n]; best = n; } }); if (best === name) w++; }); return w; }
  // liveTop 퀘스트용: skip 없이(진행 중 기간 포함) 계산한 버전도 준비
  function cmTopWins(keyFn, skip, live) { return cmWins(cmBucket(keyFn), live ? null : skip); }
  function cmWinsFor(trigger, live) {
    if (trigger === 'monthTop') return cmTopWins(function (l, t) { return cmMonthKey(t); }, function (k) { return k === cmCurM; }, live);
    if (trigger === 'weekTop') return cmTopWins(function (l, t) { return cmWeekKey(t); }, function (k) { return k === cmCurW; }, live);
    if (trigger === 'yearTop') return cmTopWins(function (l, t) { return String(new Date(t).getFullYear()); }, function (k) { return k === cmCurY; }, live);
    if (trigger === 'courseWeekTop') return cmTopWins(function (l, t) { return cmWeekKey(t) + '|' + l.courseId; }, function (k) { return k.split('|')[0] === cmCurW; }, live);
    if (trigger === 'courseMonthTop') return cmTopWins(function (l, t) { return cmMonthKey(t) + '|' + l.courseId; }, function (k) { return k.split('|')[0] === cmCurM; }, live);
    if (trigger === 'courseYearTop') return cmTopWins(function (l, t) { return new Date(t).getFullYear() + '|' + l.courseId; }, function (k) { return k.split('|')[0] === cmCurY; }, live);
    return 0;
  }
  const CM_TOP_TRIGGERS = ['weekTop', 'monthTop', 'yearTop', 'courseWeekTop', 'courseMonthTop', 'courseYearTop'];
  // 🚗 운행거리·시간 누적 + 신규 퀘스트 집계 (조 두 명 모두)
  let kmTotal = 0, minTotal = 0, perfectCnt = 0;
  const tripLogs = [];
  const __days = {}, __starts = [], __partners = {}, __weekIdxs = {};
  allLogs.forEach(function (l) {
    const ks = [];
    if (l.crew && l.crew.driver) ks.push(l.crew.driver.trim());
    if (l.crew && l.crew.assist) l.crew.assist.split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (n) { ks.push(n); });
    if (ks.indexOf(name) < 0) return;
    const t = l.track || [];
    let d = 0; for (let i = 1; i < t.length; i++) d += distance(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]);
    const km = d / 1000;
    kmTotal += km;
    // 한 코스당 최대 180분까지만 인정 (stats.html과 동일)
    let mins = 0;
    if (l.startedAt && l.finishedAt) { mins = Math.min((l.finishedAt - l.startedAt) / 60000, 180); minTotal += mins; }
    tripLogs.push({ km: km, min: mins });
    const ds = l.date || new Date(l.startedAt || 0).toLocaleDateString('ko-KR');
    __days[ds] = (__days[ds] || 0) + 1;
    if (l.startedAt) __starts.push({ ds: ds, hh: new Date(l.startedAt).getHours() });
    ks.forEach(function (k2) { if (k2 && k2 !== name) __partners[k2] = 1; });
    if (l.startedAt) { const dd = new Date(l.startedAt); const dow = (dd.getDay() + 6) % 7; const mon = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() - dow); __weekIdxs[Math.round(mon.getTime() / 604800000)] = 1; }
    const snap = Array.isArray(l.anchorsSnapshot) ? l.anchorsSnapshot : null;
    const auto = l.autoCompleted || {};
    if (snap && snap.length && snap.every(function (a) { return auto[a.id]; })) perfectCnt++;
  });
  let streakWeeks = 0;
  { const arr = Object.keys(__weekIdxs).map(Number).sort(function (a, b) { return a - b; }); let cur = 0, prev = null; arr.forEach(function (w) { cur = (prev != null && w === prev + 1) ? cur + 1 : 1; prev = w; if (cur > streakWeeks) streakWeeks = cur; }); }
  const doubleDayCnt = Object.keys(__days).filter(function (k) { return __days[k] >= 2; }).length;
  function inqResolvedCnt(cat) { let n = 0; (data.inquiries || []).forEach(function (q) { if (!q || (cat && q.category !== cat)) return; if ((q.writer || '').trim() === name && q.status === 'resolved') n++; }); return n; }
  let xp = 0;
  cmGetQuests(data).forEach(qt => {
    const per = Number(qt.xp) || 0; if (!per) return;
    let cnt = 0;
    if (qt.trigger === 'vax') cnt = vaxTotal;
    else if (qt.trigger === 'set') cnt = setTotal;
    else if (qt.trigger === 'inquiry') cnt = inqCount(qt.category || '');
    else if (qt.trigger === 'comment') cnt = cmtCount(qt.category || '');
    else if (CM_TOP_TRIGGERS.indexOf(qt.trigger) >= 0) cnt = cmWinsFor(qt.trigger, !!qt.liveTop);
    else if (qt.trigger === 'photoField') cnt = photoCnt('field', qt.cap);
    else if (qt.trigger === 'photoReceipt') cnt = photoCnt('receipt', qt.cap);
    else if (qt.trigger === 'photo') cnt = photoCnt('', qt.cap);
    else if (qt.trigger === 'km') cnt = Math.floor(kmTotal);
    else if (qt.trigger === 'time10') cnt = Math.floor(minTotal / 10);
    else if (qt.trigger === 'trip') { const mk = Number(qt.minKm) || 0, mm = Number(qt.minMin) || 0; cnt = tripLogs.filter(function (x) { return x.km >= mk && x.min >= mm; }).length; }
    else if (qt.trigger === 'perfect') cnt = perfectCnt;
    else if (qt.trigger === 'streakWeeks') cnt = streakWeeks;
    else if (qt.trigger === 'doubleDay') cnt = doubleDayCnt;
    else if (qt.trigger === 'inqResolved') cnt = inqResolvedCnt(qt.category || '');
    else if (qt.trigger === 'partners') cnt = Object.keys(__partners).length;
    else if (qt.trigger === 'early') { const hr = (qt.hour != null && qt.hour !== '') ? Number(qt.hour) : 8; const s = {}; __starts.forEach(function (x) { if (x.hh < hr) s[x.ds] = 1; }); cnt = Object.keys(s).length; }
    else if (qt.trigger === 'late') { const hr = (qt.hour != null && qt.hour !== '') ? Number(qt.hour) : 20; const s = {}; __starts.forEach(function (x) { if (x.hh >= hr) s[x.ds] = 1; }); cnt = Object.keys(s).length; }
    else if (qt.trigger === 'debut') cnt = vaxTotal > 0 ? 1 : 0;
    if (qt.mode === 'threshold') { const th = Number(qt.threshold) || 0; if (th > 0 && cnt >= th) xp += per; }
    else xp += cnt * per;
  });
  const tiers = cmRankTiers(data);
  let ri = 0; for (let i = 0; i < tiers.length; i++) { if (xp >= (tiers[i].minXp || 0)) ri = i; }
  return { xp: xp, rankIndex: ri, rank: tiers[ri] };
}
// 로그/민원 저장 직후 호출 → 참여자 진급 여부 확인하고 푸시 (이름 배열)
function checkPromotionForNames(names) {
  try {
    if (typeof fbDb === 'undefined' || !names || !names.length) return;
    const data = loadData();
    const users = data.users || {};
    names.filter((n, i) => n && names.indexOf(n) === i).forEach(name => {
      const st = cmTotalXp(data, name);
      // rankState2: 구버전(전체년도 XP로 계산하던) 클라이언트와 분리 — 옛 주소는 부풀린 기준이 남아 구버전 폰이 더는 못 쏨
      const path = '/rankState2/' + cmRankKey(name);
      fbDb.ref(path).once('value').then(snap => {
        const prev = snap.val();
        if (prev == null) { fbDb.ref(path).set(st.rankIndex); return; }   // 최초 기록은 기준만 저장(푸시 X)
        if (st.rankIndex > prev) {
          fbDb.ref(path).set(st.rankIndex);
          let uid = ''; for (const k in users) { if (users[k] && (users[k].name || '').trim() === name) { uid = k; break; } }
          const rk = st.rank || {};
          const title = '🎖 진급을 축하합니다!';
          const body = name + '님이 ' + (rk.name || '') + ' 계급으로 진급했습니다! (' + st.xp + ' XP)';
          if (uid) sendAppPush(title, body, 'all', null, uid);   // 본인에게(uid로 좁힘)
          sendAppPush('🎖 진급 소식', name + '님 → ' + (rk.name || '') + ' 진급!', 'all', null, '');  // 전체 축하
        } else if (st.rankIndex < prev) {
          fbDb.ref(path).set(st.rankIndex);   // 기준이 실제보다 높게 저장돼 있으면 조용히 보정 (과거 잘못된 계산/설정 변경 대응)
        }
      }).catch(() => {});
    });
  } catch (e) { console.warn('진급 확인 오류', e); }
}
// 코스완료 로그 → 참여자 진급 확인
function checkPromotionForLog(logEntry) {
  if (!logEntry) return;
  const names = [];
  if (logEntry.crew && logEntry.crew.driver) names.push(logEntry.crew.driver.trim());
  if (logEntry.crew && logEntry.crew.assist) logEntry.crew.assist.split(',').map(s => s.trim()).filter(Boolean).forEach(n => names.push(n));
  checkPromotionForNames(names);
}
// 민원/댓글 작성자 → 진급 확인 (이름 하나)
function checkPromotionForName(name) { if (name) checkPromotionForNames([String(name).trim()]); }

// ───────── 🔄 인앱 업데이트 (앱 켤 때 새 버전 있으면 물어봄) ─────────
function checkInAppUpdate() {
  try {
    const AU = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppUpdate;
    if (!AU) return;  // 웹/플러그인 없으면 스킵
    AU.getAppUpdateInfo().then(info => {
      if (!info || info.updateAvailability !== 2) return;  // 2 = 업데이트 있음
      if (!confirm('🔔 새 업데이트가 있습니다.\n지금 업데이트할까요?')) return;
      if (info.immediateUpdateAllowed) {
        AU.performImmediateUpdate().catch(() => { try { AU.openAppStore(); } catch (e) {} });
      } else if (info.flexibleUpdateAllowed) {
        AU.startFlexibleUpdate()
          .then(() => { try { AU.completeFlexibleUpdate(); } catch (e) {} })
          .catch(() => { try { AU.openAppStore(); } catch (e) {} });
      } else {
        try { AU.openAppStore(); } catch (e) {}
      }
    }).catch(e => console.warn('업데이트 확인 실패', e));
  } catch (e) {}
}
function maybeCheckUpdate() {
  try {
    if (sessionStorage.getItem('__updChecked')) return;  // 앱 세션당 1회만
    sessionStorage.setItem('__updChecked', '1');
  } catch (e) {}
  checkInAppUpdate();
}

// ───────── Firebase 동기화 캐시 ─────────
// ───────── 🔄 페이지 항상 최신으로 (앱 웹뷰 HTML 캐시 무력화) ─────────
// 내부 *.html 링크에 캐시버스터(_cb)를 붙여 클릭 시 매번 새 HTML을 받아오게 함
function __bustNavLinks() {
  try {
    const stamp = Date.now();
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      if (/^(https?:)?\/\//.test(href) || href[0] === '#' || href.indexOf('javascript:') === 0 || href.indexOf('tel:') === 0 || href.indexOf('mailto:') === 0) return;
      if (!/\.html(\?|#|$)/.test(href)) return;
      if (/[?&]_cb=/.test(href)) return;
      a.setAttribute('href', href + (href.indexOf('?') >= 0 ? '&' : '?') + '_cb=' + stamp);
    });
  } catch (e) {}
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', __bustNavLinks);
else __bustNavLinks();

let _cache = null;
let _cacheReady = false;
const _readyCallbacks = [];

// 캐시 준비완료 1회 처리 — 빠른 부트스트랩/전체동기화 중 먼저 도착한 쪽이 호출
function _fireCacheReady() {
  if (_cacheReady) return;
  _cacheReady = true;
  try { checkAccessGate(); } catch (e) { console.warn('게이트 체크 오류:', e); }
  try { initPushNotifications(); } catch (e) {}  // 📲 앱이면 푸시 등록
  try { maybeCheckUpdate(); } catch (e) {}       // 🔄 앱이면 업데이트 확인
  try { renderNotifBell(); } catch (e) {}        // 🔔 알림 벨 표시(미확인 수)
  _readyCallbacks.forEach(cb => cb());
  _readyCallbacks.length = 0;
}

let _syncInitialized = false;
let _signingOut = false;   // 로그아웃 중 flag — DB 에러 무시용
// 🐘 무겁고 특정 화면에서만 쓰는 노드 — 처음엔 안 받고, 필요한 화면에서 ensureNode()로 그때 받는다.
//    (실측: logs 975KB + inquiries 513KB + photos 240KB = 전체 2MB의 약 87%)
const _HEAVY_KEYS = ['logs', 'inquiries', 'photos'];
// 키 자동발견이 실패했을 때만 쓰는 예비 목록
const _FALLBACK_KEYS = ['events','anchors','complaints','requests','teams','members','vehicles',
  'noSprayZones','visibility','config','users','pushLog','pushPrefs','pushTemplates','pushWebhook',
  'mapDefault','access','accessGate','memberPinFlags','rankOverride','publicMonitor','telegram',
  'naverSms','sheetSync','eventConfig','deviceNames','savedTeams','memberAuth','expenses','live',
  'rankIcons','rankTiers','quests','layout','inquiryCategories','rankState','xpConfig','pushTokens'];

const _subscribed = {};   // 이미 구독 중인 노드
let _changedTimer = null;
// 여러 노드가 동시에 도착해도 화면 갱신은 한 번만 (마커 수백~천 개 재렌더 폭주 방지)
function _scheduleChanged() {
  if (_changedTimer) clearTimeout(_changedTimer);
  _changedTimer = setTimeout(() => {
    try { checkAccessGate(); } catch (e) {}
    try { maybeResavePushToken(); } catch (e) {}
    try { renderNotifBell(); } catch (e) {}
    if (window.onDataChanged) window.onDataChanged();
  }, 120);
}

// 최상위 키를 실행 중에 자동 발견 — 코드에 목록을 박아두면 새로 생긴 노드를 놓침
function _discoverTopKeys() {
  try {
    const url = ((firebase.app().options || {}).databaseURL || '').replace(/\/$/, '');
    if (!url) return Promise.resolve(null);
    const user = (typeof fbAuth !== 'undefined' && fbAuth.currentUser) ? fbAuth.currentUser : null;
    const p = user ? user.getIdToken() : Promise.resolve(null);
    return p.then(token =>
      fetch(url + '/.json?shallow=true' + (token ? '&auth=' + token : ''))
        .then(r => r.ok ? r.json() : null)
        .then(o => (o && typeof o === 'object') ? Object.keys(o) : null)
    ).catch(() => null);
  } catch (e) { return Promise.resolve(null); }
}

// 노드 하나 구독 (첫 도착 시 resolve, 이후 변경은 화면 갱신 예약)
function _subscribeNode(k) {
  return new Promise((resolve) => {
    if (_subscribed[k]) return resolve();
    _subscribed[k] = true;
    let first = true;
    fbDb.ref('/' + k).on('value', (snap) => {
      if (!_cache) _cache = {};
      _cache[k] = snap.val();
      if (first) { first = false; resolve(); }
      else _scheduleChanged();
    }, (err) => {
      if (!_signingOut) console.warn('노드 읽기 오류 /' + k + ':', err.message);
      if (first) { first = false; resolve(); }
    });
  });
}

// 🐘 무거운 노드를 필요할 때 불러오기 — 모니터링/통계(logs), 게시판(inquiries), 사진(photos)에서 호출
function ensureNode(key) {
  if (typeof fbDb === 'undefined') return Promise.resolve(null);
  if (_subscribed[key]) return Promise.resolve(_cache ? _cache[key] : null);
  return _subscribeNode(key).then(() => {
    _scheduleChanged();
    return _cache ? _cache[key] : null;
  });
}
// 노드를 이미 불러왔는지 — 값이 비어있을 수도 있으므로 값이 아니라 구독 여부로 판단(무한 재시도 방지)
function isNodeLoaded(key) { return !!_subscribed[key]; }
function ensureLogs() { return ensureNode('logs'); }
function ensureInquiries() { return ensureNode('inquiries'); }
function ensurePhotos() { return ensureNode('photos'); }

function initFirebaseSync() {
  if (_syncInitialized) return;
  if (typeof fbDb === 'undefined') {
    console.error('Firebase 초기화 안됨. firebase-config.js 확인하세요');
    return;
  }
  _syncInitialized = true;

  _discoverTopKeys().then((found) => {
    // DB가 완전히 비어있을 때만 기본 데이터 업로드 (최초 1회)
    // 🛡 키 목록이 비어 보인다는 이유만으로 set('/')하면 DB 전체가 날아감 → 실제 읽기로 한 번 더 확인
    if (found && found.length === 0) {
      fbDb.ref('/').once('value').then(s => {
        if (!s.exists()) {
          _cache = JSON.parse(JSON.stringify(defaultData));
          fbDb.ref('/').set(_cache);
        }
      }).catch(() => {});
    }
    const keys = Array.from(new Set(
      (found && found.length ? found : _FALLBACK_KEYS).concat(Object.keys(defaultData))
    )).filter(k => _HEAVY_KEYS.indexOf(k) < 0);

    if (!_cache) _cache = {};
    Promise.all(keys.map(k => _subscribeNode(k))).then(() => {
      // mapDefault 없으면 기본값 복원 (배열은 사용자가 비웠을 수 있으니 손대지 않음)
      if (_cache && _cache.mapDefault === undefined) {
        _cache.mapDefault = defaultData.mapDefault;
        fbDb.ref('/mapDefault').set(_cache.mapDefault);
      }
      _fireCacheReady();
      _scheduleChanged();
    });
  });
}
function stopFirebaseSync() {
  if (typeof fbDb !== 'undefined') {
    Object.keys(_subscribed).forEach(k => { try { fbDb.ref('/' + k).off('value'); } catch (e) {} });
  }
  Object.keys(_subscribed).forEach(k => delete _subscribed[k]);
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

// GPS 궤적 점 솎기 — 최소 간격(m) 이상 떨어진 점만 남김(첫·끝점 보존). 용량↓, 지도·거리·재생 사실상 동일
function __thinTrack(track, minGap) {
  if (!Array.isArray(track) || track.length <= 2) return track || [];
  minGap = minGap || 10;
  var out = [track[0]], last = track[0];
  for (var i = 1; i < track.length - 1; i++) {
    var p = track[i]; if (!p) continue;
    if (distance(last[0], last[1], p[0], p[1]) >= minGap) { out.push(p); last = p; }
  }
  out.push(track[track.length - 1]);
  return out;
}
// 거점만 타깃 저장 — 전체 트리(수 MB, 사진 base64 포함) 업로드 없이 /anchors만 써서 빠름
function saveAnchors() {
  const d = loadData();
  if (typeof fbDb === 'undefined') return;
  fbDb.ref('/anchors').set(d.anchors || []).catch(err => { console.error('거점 저장 실패:', err); alert('거점 저장 실패: ' + err.message); });
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
    // 🛡 무거운 노드(logs/inquiries)는 "불러온 적 없으면" 저장에서 제외 —
    //    안 불러온 상태에서 빈 배열에 1건만 넣고 저장하면 DB 전체가 그 1건으로 덮여 사라짐
    _HEAVY_KEYS.forEach(k => {
      if (payload[k] !== undefined && !_subscribed[k]) {
        console.warn('saveData: /' + k + ' 미로딩 → 저장 제외(데이터 보호). 쓰기 전에 ensureNode(\'' + k + '\') 필요');
        delete payload[k];
      }
    });
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
    memberLogPhoto: a.memberLogPhoto !== false,  // 운행기록 사진 등록 회원 허용 (기본 허용, 본인 참여 운행만)
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
  // 로그인 역할 반영해 푸시 토큰 갱신 (anon→super 등)
  try { maybeResavePushToken(); } catch (e) {}
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
  let __zoomTimer = null;
  kakao.maps.event.addListener(map, 'zoom_changed', () => {
    // 줌 애니메이션 중엔 무거운 마커 재생성 금지 → 줌 멈춘 뒤 한 번만 (확대/축소 부드럽게)
    if (__zoomTimer) clearTimeout(__zoomTimer);
    __zoomTimer = setTimeout(() => {
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
    }, 180);
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

// 🔄 페이지 이동 링크에 common.js 버전을 자동으로 붙임 → 앱 웹뷰 캐시 때문에 예전 화면이 뜨는 문제 방지
(function __versionLinks() {
  try {
    var me = document.currentScript;
    if (!me) { var ss = document.getElementsByTagName('script'); for (var i = 0; i < ss.length; i++) { if (/common\.js/.test(ss[i].src)) me = ss[i]; } }
    var ver = '';
    if (me && me.src) { var q = me.src.split('?')[1] || ''; var mm = q.match(/(?:^|&)v=([^&]+)/); ver = mm ? mm[1] : ''; }
    if (!ver) return;
    var apply = function () {
      var as = document.querySelectorAll('a[href$=".html"]');
      for (var j = 0; j < as.length; j++) {
        var h = as[j].getAttribute('href');
        if (h && h.indexOf('v=') < 0 && !/^https?:/.test(h) && h.indexOf('//') !== 0) {
          as[j].setAttribute('href', h + (h.indexOf('?') < 0 ? '?' : '&') + 'v=' + ver);
        }
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
    else apply();
  } catch (e) {}
})();
