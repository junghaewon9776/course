# 코스 관리 시스템 (법성포청년회)

행사별(**방역행사**, **효도위안잔치** 등) 코스를 등록하고, 차량/조 단위로 운영하며, GPS 기반으로 실시간 진행 상황을 추적하는 웹 시스템입니다.

Firebase Realtime Database로 다중 기기 실시간 동기화. 로그인 없이 운영자가 폰으로 바로 사용 가능, 관리자/모니터링은 이메일 또는 회원 PIN 로그인.

---

## 📁 파일 구성

```
방역코스/
├── index.html            # 메인 메뉴 (역할별 진입)
├── today.html            # 🚐 오늘의 운영 (현장 운전자/봉사자)
├── monitor.html          # 📊 본부 관제 (실시간 차량 + 코스 + 운행기록)
├── monitor-public.html   # 🌐 공개 모니터링 (외부 공유 링크)
├── admin.html            # ⚙️ 관리자 (행사·코스·거점·민원·방역금지·공개모니터)
├── members.html          # 👥 인원관리 (회원·조 편성·차량 등록·CSV 일괄 업로드)
├── stats.html            # 📈 통계 (회원별 방역 횟수 차트)
├── accounts.html         # 🔐 계정 관리 (관리자 추가·권한)
├── print.html            # 🖨 인쇄 (조/코스/QR + 호차 라벨)
├── common.js             # 공통 라이브러리 (Firebase, GPS, 거리/ETA, 헬퍼)
├── firebase-config.js    # Firebase 프로젝트 설정
├── style.css             # 공통 스타일
├── README.md             # 이 파일
└── TODO.md               # 작업 메모
```

---

## 🎯 두 가지 운영 모드

### 1️⃣ 방역행사 모드
- 조(team) 단위 운영 — 조장/부조장/조원
- 거점마다 방역 작업 진행
- **민원 핀** + **방역금지 구역** 표시 (반경 50m 진입시 빨간 토스트 + 진동 알림)
- 거점당 정차 시간 3분 가정
- 텔레그램으로 진행 알림 자동 전송

### 2️⃣ 효도위안잔치 모드 (차량 운영)
- 차량(vehicle) 단위 운영 — 1호차/2호차…
- 거점마다 어르신 탑승 (이장님 배정 가능)
- **차량 빠른 시작** — 등록된 차량 버튼 누르면 운전자/조수 자동 채움
- 행사 이름에 "방역" 포함 안 되면 민원/방역금지 핀 자동 숨김

---

## 🚀 사전 준비

### 1. 카카오 디벨로퍼스 키 (무료)
1. https://developers.kakao.com → 로그인 → 애플리케이션 추가
2. **JavaScript 키** 복사
3. **플랫폼 → Web** 도메인 등록 (배포 도메인 + 로컬 테스트용 `http://localhost`)
4. `common.js` 두 번째 줄에 키 붙여넣기:
   ```js
   const KAKAO_KEY = '여기에_JS_키';
   ```

### 2. Firebase 프로젝트
1. https://console.firebase.google.com → 새 프로젝트
2. **Realtime Database** 활성화 (asia-southeast1 권장)
3. **Authentication** → **익명** 로그인 활성화
4. (선택) **이메일/비밀번호** 활성화 — admin 로그인용
5. 프로젝트 설정 → 웹앱 추가 → **firebaseConfig** 복사
6. `firebase-config.js` 에 붙여넣기

### 3. (선택) 텔레그램 봇 알림
1. 텔레그램에서 [@BotFather](https://t.me/BotFather) → `/newbot` → 토큰 받기
2. 알림 받을 단톡방에 봇 초대 → `https://api.telegram.org/bot{TOKEN}/getUpdates` → chat_id 확인
3. `admin.html` → 텔레그램 설정 카드 → 토큰/chat_id 입력 → 활성화 토글

---

## 👥 사용 흐름 (역할별)

### 🏗 [관리자] 초기 셋업 (admin.html)
1. 행사 추가 (방역행사 / 효도위안잔치)
2. 코스 추가 (1코스, 2코스, ...) + 색상 지정
3. 지도에서 거점 클릭으로 핀 찍기 (드래그로 위치 미세조정)
4. 거점 ↑↓ 또는 [№ 순번] 으로 순서 지정
5. (방역행사) 민원 + 방역금지 구역 등록
6. (선택) 공개 모니터링 카드 → 토큰 발급 + PIN 설정 → 외부 공유

### 👥 [관리자] 인원/차량 (members.html)
1. **회원 일괄 업로드** — CSV/엑셀 (한글 EUC-KR + TAB도 자동 인식)
2. 조 편성 — 조장/부조장/조원 지정
3. **차량 등록** (효도위안잔치용) — 차종/번호판/색상/기본 운전자/보조 + 활성화 토글
4. 차량 ▲▼ 드래그로 호차 순번 정렬

### 🚐 [현장] 오늘의 운영 (today.html)
**모드 자동 전환** — 활성 차량이 있으면 차량 버튼 모드, 없으면 조 선택 모드.

#### 차량 모드 (효도위안잔치)
1. 행사·코스 선택
2. 등록된 **차량 버튼 한 번 클릭** → 1호차로 시작
3. **📍 GPS 시작** (자동) → 라이브 위치 publish (10초 간격)
4. 거점 도착 → ✓ 탑승완료 → 텔레그램 자동 알림
5. 현장사진/영수증 사진 업로드 가능
6. 모든 거점 끝 → ✅ 코스 완료

#### 조 모드 (방역행사)
1. 행사·코스·조 선택 → GPS 시작
2. 거점 클릭 → 내비게이션 / 이장님께 정보 공유 / ✓ 완료 처리
3. 거점요청 (📌) — 즉석에서 새 거점 추가 요청
4. 민원접수 (📞) — 현장에서 민원 발견 시 즉시 등록
5. 방역금지 구역 50m 진입 → 자동 빨간 토스트 + 진동

### 📊 [본부] 모니터링 (monitor.html)
- **🟢 지금 운영 중** — 라이브 차량 위치, 진행률, ETA, 따라가기 모드
- **🗺 코스 전체 보기** — 토글 버튼 하나로:
  - 🟢 켜짐: 모든 코스 거점 핀 표시
  - 🟠 코스 집중 모드: 특정 코스만 강조
  - ⚫ 꺼짐: 깔끔한 라이브 차량만
- **차량 마커** — 진행 방향으로 회전 (heading)
- **📞 민원** + **⛔ 방역금지** 핀 — 방역행사 운영 중일 때만 (효도위안잔치는 자동 숨김)
- **위성/지도 토글** + **줌 컨트롤**
- **운행 기록** — 과거 세션 클릭 → 궤적 표시

### 🌐 [외부] 공개 모니터링 (monitor-public.html)
- admin에서 발급한 토큰 + PIN(선택) 으로 접근
- 카톡/단톡으로 링크 공유
- 차량 위치, 진행률, 운전자 이름/전화 (📞 버튼) 만 노출
- 민원/방역금지 핀은 **공개 페이지에서 보이지 않음** (개인정보 보호)

### 🖨 [관리자] 인쇄 (print.html)
- **코스 / 조 인쇄 모드** — 조 테이블 + 코스 안내 + QR 한 페이지
- **🚐 호차 인쇄 모드** — A4 한 장당 한 차량 (1호차 큼직 + 카니발/번호판 + 운전자 + QR)
  - 가로/세로 방향 선택
  - QR → today.html → 호차 버튼 안내

### 🔐 [관리자] 계정 관리 (accounts.html)
- 관리자 이메일 추가 (super/admin/viewer 권한)
- 회원 PIN 등록 (현장 봉사자가 회원 정보로 today.html 로그인용)

---

## 🗄 Firebase 데이터 구조

```
/                              # 메인 데이터 (saveData가 update로 갱신)
├── events                     # 행사 [{ id, name, courses: [{ id, name, color }] }]
├── anchors                    # 거점 [{ id, name, lat, lng, courseId, order, memo, featured?, villageHeadIds? }]
├── members                    # 회원 [{ id, name, phone, position, ... }]
├── teams                      # 조 [{ id, name, leaderId, viceLeaderId, memberIds, ... }]
├── vehicles                   # 차량 [{ id, name, plate, color, defaultDriverId, defaultAssistId, order, active }]
├── reserveMemberIds           # 예비조 (회원 ID)
├── logs                       # 과거 운행 기록 [{ ...session, key }]
├── requests                   # 거점 요청 [{ id, eventId, courseId, lat, lng, name, memo, status, ... }]
├── complaints                 # 민원 [{ id, eventId, lat, lng, phone, content, status, createdAt }]
├── noSprayZones               # 방역금지 [{ id, lat, lng, name, reason, radius, createdAt }]
├── visibility                 # admin 가시성 토글 { events: {id: bool}, courses: {id: bool} }
├── publicMonitor              # 공개 모니터링 { enabled, token, pin, updatedAt }
├── telegram                   # 텔레그램 { botToken, chatId, enabled }
├── naverSms                   # SMS 프록시 (서버 필요)
├── sheetSync                  # Google Sheets 동기화 { enabled, webhookUrl, token }
├── users                      # 관리자 계정 { [uid]: { email, name, role } }
└── ...

/live/{sessionKey}             # 라이브 위치 (10초 throttle, 5분 stale)
  { lat, lng, heading, eventId, courseId, teamId, crew: {...},
    completedCount, totalCount, startedAt, lastUpdate }

/photos/{photoId}              # 현장사진/영수증 (압축 base64)
  { sessionKey, type, data, createdAt }
```

### 데이터 격리 원칙
- **`saveData(data)`** = `fbDb.ref('/').update(payload)` (set 아님!)
- `/live`, `/photos` 노드는 `saveData`가 절대 건드리지 않음 (sibling 보존)
- 새 캐시 시스템과 충돌 방지

---

## 📡 라이브 위치 publish 정책

```js
// today.html → publishCurrentLive()
// - GPS 콜백마다 호출
// - 10초 throttle (중복 publish 방지)
// - 위치 변화 5m 이상이면 track 배열에도 저장

publishLiveSession(sessionKey, {
  lat, lng, heading,
  eventId, courseId, teamId,
  crew: { driver, assist, vehicle, vehicleColor, vehicleName, ... },
  completedCount, totalCount, startedAt
});

// 운영 종료 시 unpublishLiveSession(sessionKey) — /live에서 제거
// 모니터에서 lastUpdate가 5분 넘으면 자동 stale 처리
```

---

## 🎯 ETA(도착예상시간) 계산

```js
// common.js
const ETA_AVG_SPEED_KMH = 25;     // 방역 운영 평균 (저속 + 정차)
const ETA_ROAD_FACTOR  = 1.3;     // 직선 → 도로 보정
const ETA_STOP_MIN_PER_ANCHOR = 3; // 거점당 정차 (분)

function estimateMinutes(meters, anchorStops) {
  const km = (meters * ETA_ROAD_FACTOR) / 1000;
  const driveMin = (km / ETA_AVG_SPEED_KMH) * 60;
  const stopMin = (anchorStops || 0) * ETA_STOP_MIN_PER_ANCHOR;
  return Math.max(1, Math.round(driveMin + stopMin));
}
```

거리 산출은 하버사인(`distance(lat1,lng1,lat2,lng2)`) — 미터 단위.

---

## 🔒 보안 / 권한

### 현재 (Soft Gate)
- **공개 모니터링**: 토큰 + PIN을 데이터 안에서 검증 (Firebase rules 미설정)
- **민원/방역금지**: 공개 페이지에서 코드 레벨로 숨김
- **방역행사 전용 핀**: 행사 이름에 정규식 `/방역/` 매칭

### 권장 (강화)
Firebase rules로 강화하려면 `users/{uid}.role` 필드 + write rule 작성. 현재는 익명 로그인 누구나 write 가능 (편의성 우선).

---

## 🎨 캐시 버전 관리

모든 HTML의 `style.css` / `firebase-config.js` / `common.js` 호출 끝에 `?v=YYYYMMDDx` 박혀있음.

코드 수정 후 사용자에게 푸시할 때:
1. 다음 알파벳/숫자로 일괄 교체 (예: `20260513s` → `20260513t`)
2. PC: Ctrl+Shift+R / 폰: Chrome 메뉴 → 사이트 데이터 삭제 또는 재설치

```bash
# 일괄 교체 예시 (PowerShell)
Get-ChildItem *.html | ForEach-Object {
  (Get-Content $_) -replace 'v=20260513s', 'v=20260513t' | Set-Content $_
}
```

---

## 💻 로컬 테스트

```bash
cd 방역코스
python -m http.server 8000
# 브라우저 → http://localhost:8000
```

⚠️ **GPS는 HTTPS에서만 작동** — `localhost`는 예외적으로 허용됨.

---

## 🌐 배포 (HTTPS 필수)

추천:
- **Netlify** — 폴더 통째로 드래그앤드롭, 무료 HTTPS
- **Vercel** — GitHub 연동, 자동 배포
- **GitHub Pages** — `main` 브랜치 push, Pages 활성화
- **Firebase Hosting** — 같은 Firebase 프로젝트 안에 배포 가능

배포 후 **카카오 디벨로퍼스 → 플랫폼**에 그 도메인 추가 필수.

---

## 🛠 트러블슈팅

### "회원 데이터가 싹 사라졌어요"
- 원인: 동기화 전에 빈 캐시로 `saveData()` 호출 → 전체 DB 덮어씀
- 대응: `_cacheReady === false` 일 때 `saveData` 차단 (already 적용됨)
- 복구: admin.html → JSON 백업 파일 있으면 복원

### "엑셀 업로드해도 인식 못해요"
- 한글 엑셀 "CSV로 저장" → EUC-KR + TAB 구분 → 자동 폴백 처리됨
- 헤더 라벨이 `이름,직책` 인데 데이터가 `직책,이름` 순서면 자동 보정 (KNOWN_POSITIONS 매칭)
- 안 되면 `이름,전화번호,직책` 순서로 직접 정렬

### "공개 모니터링 안 보여요"
- admin → 공개 모니터링 카드 → 토글 ON 확인
- URL 끝에 `?t={토큰}` 정확히 들어갔는지 확인
- PIN 설정했으면 입력 필요

### "차량 마커가 카니발 흰색이라고 떠요"
- 옛 세션 데이터 — vehicleName이 차량 닉네임으로 박혀있음
- 모니터에서 자동으로 plate 매칭 → "1호차"로 변환 (`deriveHochaName`)
- 새 세션부터는 자동으로 `{order}호차` 사용

### "GPS가 작동 안 해요"
- HTTPS 환경인지 확인 (localhost 또는 https://)
- 브라우저 위치 권한 허용 필요
- 카카오톡/네이버 인앱 브라우저는 GPS 제한 → Chrome으로 열기 안내됨 (자동)

---

## 📋 데이터 백업/복원

`index.html` 또는 `admin.html` 의 백업 카드:
- **💾 JSON 다운로드** — 전체 데이터 저장 (`/`, `/live`, `/photos` 제외)
- **📤 JSON 복원** — 파일 선택 → 현재 데이터 덮어씀

**정기 백업 권장** — 주 1회 정도 다운로드해서 PC/클라우드에 보관.

---

## 🚧 향후 계획

### Phase 3: 픽업 요청 (카카오택시 스타일) — 미구현
- `request.html` 페이지 — 외부인이 픽업 요청
- 운영 중 운전자한테 알림 → "내가 가요" 클릭 → 요청자 통보

### 인프라 옵션
- 네이버 SENS Cloud Function 셋업 (admin 설정 칸은 있음)
- Firebase Function 비밀번호 재설정 자동화

### 별도 프로젝트 — 어린이집 통학버스
같은 Firebase 프로젝트 다른 노드(`/schoolbus`)로 운영. `Downloads/schoolbus/` 참조.

---

## 📝 변경 이력 (주요)

| 라운드 | 추가/개선 |
|---|---|
| 2026-05-13 | 호차 마커 (호차 번호 추출, 옛 데이터 plate 매칭 폴백). InfoWindow 토글 + GPS 핑 z-index 회피. 코스 전체 보기 단일 토글 버튼. 위성/줌 컨트롤. 차량 진행 방향 회전. POI 스타일 마커 라벨. 호차별 큰 배지 (운영 중 리스트). 방역행사 전용 민원/방역금지 격리. |
| 2026-05-12 | 호차 A4 인쇄 (가로/세로). 차량 빠른 시작 모드 (조 입력 자동 전환). 차량 등록 (활성/비활성, 드래그 정렬). |
| 2026-05-10 | 공개 모니터링 (토큰 + PIN). 라이브 차량 위치 publish. 위쪽 차량 SVG. 텔레그램 다중 chat_id. CSV EUC-KR + TAB 자동 폴백. |
| 2026-05 초 | Firebase 통합. 민원 + 방역금지 + GPS 알림. 거점 ✎ 수정. 회원 PIN 로그인. 사진 업로드. |

---

## 🤝 기술 스택

- **Frontend**: 순수 HTML + JS + CSS (프레임워크 없음)
- **지도**: Kakao Maps SDK
- **DB**: Firebase Realtime Database (asia-southeast1)
- **인증**: Firebase Authentication (익명 + 이메일)
- **알림**: Telegram Bot API
- **QR 생성**: api.qrserver.com
- **사진 저장**: 클라이언트 압축 + RTDB base64 (또는 Google Sheets webhook)
