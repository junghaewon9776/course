# 방역코스 시스템 TODO

## 📌 현재 상태 (2026-05-13)

- **캐시 버전**: `20260513s` (모든 HTML/JS/CSS 호출에 동일 박힘)
- **작동 모드**: 방역행사 + 효도위안잔치 (차량 모드) 둘 다 운영 중
- **공개 모니터링**: enabled (토큰 + PIN gate)

---

## ✅ 완료 (2026-05-13 라운드)

### 호차/차량 시스템
- [x] 차량 등록 (members.html) — 활성화 토글, ▲▼ 드래그 정렬
- [x] today.html 차량 빠른 시작 — 활성 차량 있으면 차량 버튼 모드, 없으면 조 모드 자동 전환
- [x] 호차명 자동 생성 (`{order}호차`) — 닉네임 안 쓰고 order 번호 기반
- [x] monitor에서 옛 세션도 plate 매칭으로 호차명 자동 도출 (`deriveHochaName`)
- [x] 운영 중 리스트 좌측에 호차 배지 큼직하게

### 모니터 화면
- [x] 차량 마커 진행방향 회전 (heading + 폴백 계산)
- [x] 마커 위 라벨 — 지도 POI 스타일 (텍스트만, 흰 후광)
- [x] 마커 가운데 글자 = 호차 숫자 (1자리/2자리 자동 폰트)
- [x] InfoWindow 토글 (같은 마커 다시 누르면 닫힘)
- [x] InfoWindow 길찾기 버튼 박스 (오버플로 방지)
- [x] 거점 클릭시 GPS 핑(z-index 100) 임시로 내려서 모달 안 가림
- [x] 코스 전체 보기 단일 토글 버튼 (켜짐/꺼짐/돌아가기 3상태)
- [x] 전체 핑 영구 레이어 (라이브 차량과 분리, z-index 차등)
- [x] 위성/지도 토글 + 줌 컨트롤
- [x] 민원/방역금지 핀 (관제 전용, 공개 모니터링 X)
- [x] 방역행사 전용 격리 — 행사명 정규식 `/방역/` 매칭, 효도위안잔치는 자동 숨김
- [x] today.html에서도 효도위안잔치 운영시 민원 버튼/핀/알림 모두 숨김

### 호차 인쇄 (print.html)
- [x] 호차 인쇄 모드 추가 (A4 한 장당 한 차량)
- [x] 가로/세로 방향 토글
- [x] 1호차 큼직 + 카니발/번호판 박스 + 운전/보조 배지
- [x] QR 옆에 1-2-3 단계 안내

### 보안/안정성
- [x] saveData 방어 — `_cacheReady === false` 일 때 차단 (데이터 유실 방지)
- [x] /live, /photos 노드 격리 (saveData가 안 건드림)
- [x] EUC-KR + TAB 자동 폴백 (한글 엑셀 호환)

---

## ⏳ 미처리 / 다음 우선순위

### 🚧 Phase 3: 픽업 요청 (카카오택시 스타일)
- `request.html` 페이지 — 링크 가진 사람 누구나 픽업 요청
- 자기 위치/주소로 핀 찍고 요청
- 운영 중 운전자한테 알림
- 운전자 "내가 가요" 클릭 → 요청자 통보

### 인프라 옵션
- [ ] 네이버 SENS Cloud Function 셋업 (admin에 설정 칸은 있음, 실제 발송은 서버 필요)
- [ ] Firebase Function 비밀번호 재설정 자동화 (admin/super에서 → 1234로 리셋)
- [ ] Firebase rules 강화 (현재 익명 누구나 write 가능, soft gate만)

### 미니 개선
- [ ] 차량 InfoWindow에 "현재 운영 중인 차량 표시" — 마을→호차 매핑 (헬퍼 `deriveHochaName`, `getVehiclesOnCourse` 코드는 monitor.html에 남아있음)
- [ ] 정거장 도착 알람 페이지 (보류 — schoolbus 별도 프로젝트로 분리됨)

---

## 🗂 별도 프로젝트

### `Downloads/schoolbus/` — 어린이집 통학버스
- 같은 Firebase 프로젝트, 다른 노드 (`/schoolbus`, `/schoolbus_live`)
- 부모용 / 운전자 / 어린이집 관리자 / 모니터
- 알람: N정거장 전, X분 전, 우리 정거장 도착, 어린이집 도착
- PWA (홈화면 추가)
- Phase 2: Capacitor 앱화 (백그라운드 알림 + BLE 비콘)

---

## 📋 데이터 구조 (참고)

```js
defaultData = {
  events: [{ id, name, courses: [{ id, name, color }] }],
  anchors: [{ id, name, lat, lng, memo, eventId, courseId, order, featured?, villageHeadIds? }],
  members: [{ id, name, phone, position, birthday, address, note }],
  teams: [{ id, name, leaderId, viceLeaderId, memberIds, fixedMemberIds }],
  vehicles: [{ id, name, plate, color, defaultDriverId, defaultAssistId, order, active }],
  reserveMemberIds: [],
  logs: [{ ...session, key }],
  requests: [{ id, eventId, courseId, lat, lng, name, memo, status, requestedBy, requestedAssist, requestedAt }],
  complaints: [{ id, eventId, lat, lng, phone, content, area, status, reportedBy?, reportedAssist?, createdAt }],
  noSprayZones: [{ id, lat, lng, name, reason, radius, createdAt }],
  visibility: { events: {id: bool}, courses: {id: bool} },
  mapDefault: { lat, lng, level },
  printNotice: '⚠ 우천시 방역 금지!',
  telegram: { botToken, chatId, enabled },
  naverSms: { proxyUrl, serviceId, accessKey, secretKey, from, enabled },
  publicMonitor: { enabled, token, pin, updatedAt },
  sheetSync: { enabled, webhookUrl, token },
  users: { [uid]: { email, name, role: 'super'|'admin'|'viewer' } }
}

// crew (currentSession.crew)
{ driver, assist, vehicle, vehicleColor, vehicleName, driverPhone, assistPhone }

// /live/{sessionKey}
{ lat, lng, heading, eventId, courseId, teamId, crew,
  completedCount, totalCount, startedAt, lastUpdate }
```

---

## 🔧 운영 메모

- **today.html**: 익명 OK, 회원 PIN 로그인 가능 (현장 봉사자용)
- **admin/monitor/members/stats/accounts/print**: 이메일 로그인 (admin/super) 또는 viewer
- **로그인 폼**: 통합 — `@` 있으면 이메일, 숫자만이면 전화+PIN
- **알림**: 텔레그램 (다중 chat_id 콤마), SMS는 서버 프록시 필요
- **캐시 버전**: 코드 수정 시 다음 알파벳/숫자로 일괄 교체 (PowerShell 일괄 치환 스크립트는 README 참조)

---

## 📝 캐시 버전 일괄 교체 스니펫

```powershell
# Windows PowerShell
Get-ChildItem *.html | ForEach-Object {
  (Get-Content $_) -replace 'v=20260513s', 'v=20260513t' | Set-Content $_
}
```

```bash
# Bash (Git Bash, macOS, Linux)
sed -i 's/v=20260513s/v=20260513t/g' *.html
```
