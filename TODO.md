# 방역코스 시스템 TODO

## 다음 세션에서 시작 시 읽을 것

### 현재 상태
- 캐시 버전: `20260510s` (모든 HTML에 동일, monitor-public.html 신규)
- 신규 기능: 민원, 방역불가 핀, 거점 InfoWindow 수정/순번/삭제, 텔레그램, 네이버 SMS 설정 UI
- 효도위안잔치: 거점에 이장님 배정, 차량정보, 탑승완료 알림 진행 중

---

## 이번 라운드 처리됨 (2026-05-10 새벽)

- [x] 민원 핀을 어느 코스든 표시 (today.html에서 eventId 필터 제거)
- [x] **4번** 민원 InfoWindow UI 개선
  - admin: ✎ 수정 / ✓ 완료 / 🗑 삭제 버튼 한 줄, 📞 전화는 우측 작은 링크
  - today: ✓ 처리완료 버튼 + 우측 작은 📞 전화 링크
  - admin에 `editComplaint` (prompt 기반 인라인 수정) 추가
- [x] **6번** 양식 업로드
  - members.html `소속`, `직위`, `담당` 키워드 추가 (기존 인원관리_*.xlsx 첫 행: No/소속/이름/생년월일/주소/우편번호/연락처)
  - `parseCSVMembers` 따옴표/콤마 안전 파싱으로 교체 (주소 안에 `,` 있어도 OK)
  - **데이터 유실 방지**: `_cacheReady === false` 일 때 saveData 차단 + 업로드 핸들러 차단 (이게 "데이터가 싹 사라지는" 진짜 원인이었음 — 동기화 전에 빈 캐시로 set('/') 부르면 전체 DB 덮어씀)
  - **EUC-KR 자동 폴백** (한글 엑셀 "CSV로 저장" 기본 인코딩)
  - **TAB/콤마 자동 감지** (탭이 더 많으면 TSV로 처리 — 사용자 파일이 탭 구분이었음)
  - **헤더 라벨 뒤바뀜 자동 보정**: name 추출값이 KNOWN_POSITIONS(회장/감사/이장 등)면 position과 swap. alert에 "🔄 N명 자동 보정" 표시
- [x] **7번** 로그인 유지
  - `ensureAnonAuth` 가 첫 onAuthStateChanged 이벤트 기다리도록 변경
  - 이전: index 진입 시 `fbAuth.currentUser` 가 hydration 전이라 null → 익명 sign-in → admin 세션 덮음
  - 이후: 영속 세션이 복원되면 그대로 사용, 진짜 로그인 안 된 경우만 익명 sign-in

---

## ⏳ 미처리 - 다음 세션 우선순위

1. ~~**방역금지 핀 수정**~~ ✅ 처리됨 (r 라운드)
   - admin.html `editNoSprayZone(id)` — 이름/사유/반경 prompt 편집
   - InfoWindow에 ✎ 수정 / 🗑 삭제 버튼 + 반경 표시

2. ~~**민원/방역금지 핀 드래그로 위치 이동**~~ ✅ 처리됨
   - 민원: draggable + dragend confirm → complaints[id].lat/lng 업데이트
   - 방역불가: draggable + drag(원 따라감) + dragend confirm → noSprayZones[id].lat/lng 업데이트

3. ~~**방역금지 주변 GPS 알림**~~ ✅ 처리됨 (r 라운드)
   - today.html onGpsUpdate에서 noSprayZones 순회
   - radius+50m 이내 진입 → 빨간 토스트 (8초, 펄스 애니메이션) + vibrate(500ms 패턴)
   - 같은 zone 10분 쿨다운 (`window.__noSprayLastAlert[id]`)

5. ~~**거점 번호 0/빈칸 입력 허용**~~ ✅ 처리됨 (r 라운드)
   - moveAnchorTo: trim 후 빈칸/0 → 조용히 종료, 잘못된 번호만 alert

---

## 더 큰 작업 (Phase 2/3)

### ~~Phase 2: 공개 모니터링 페이지~~ ✅ 처리됨 (s 라운드)
- `monitor-public.html?t=<token>` — 새 파일, 익명 auth + token 검증 + enabled 검증
- `today.html` GPS 업데이트 시 `/live/{sessionKey}` 에 10초마다 publish (전체 set('/') 안 건드림)
- 종료 시 `/live/{sessionKey}` remove
- `admin.html` "🌐 공개 모니터링" 카드: 토글 / 토큰 재발급 / URL 복사
- 5분 무업데이트 = stale 처리, 우측 라이브 차량 리스트 + 지도 마커
- `data.publicMonitor = { enabled, token, updatedAt }` 추가
- ⚠️ Firebase rules 미수정 — 토큰은 soft gate. 진짜 보안 원하면 rules 업데이트 필요

### Phase 3: 픽업 요청 (카카오택시 스타일)
- `request.html` 페이지 — 링크 가진 사람 누구나 픽업 요청
- 자기 위치/주소로 핀 찍고 요청
- 운영 중 운전자한테 알림
- 운전자 "내가 가요" 클릭 → 요청자 통보

### 인프라 (옵션)
- 네이버 SENS Cloud Function 셋업 (admin에 설정 칸은 있음, 실제 발송은 서버 필요)
- Firebase Function 비밀번호 재설정 자동화 (admin/super에서 → 1234로 리셋)

---

## 데이터 구조 메모 (참고용)

```js
defaultData = {
  events: [{ id, name, courses: [{ id, name, color }] }],
  anchors: [{ id, name, lat, lng, memo, eventId, courseId, order, featured?, villageHeadIds? }],
  members: [{ id, name, phone, position, birthday, address, note }],
  teams: [{ id, name, leaderId, viceLeaderId, memberIds, fixedMemberIds }],
  reserveMemberIds: [],   // 예비조
  logs: [{ ...session, key }],
  requests: [{ id, eventId, courseId, lat, lng, name, memo, status, requestedBy, requestedAssist, requestedAt }],
  complaints: [{ id, eventId, lat, lng, phone, content, area, status, reportedBy?, reportedAssist?, createdAt }],
  noSprayZones: [{ id, lat, lng, name, reason, radius, createdAt }],
  visibility: { events: {id: bool}, courses: {id: bool} },
  mapDefault: { lat, lng, level },
  printNotice: '⚠ 우천시 방역 금지!',
  telegram: { botToken, chatId (콤마구분), enabled },
  naverSms: { proxyUrl, serviceId, accessKey, secretKey, from, enabled },
  users: { [uid]: { email, name, role: 'super'|'admin'|'viewer' } },
  schedules: [...]
};

// crew (currentSession.crew)
{ driver, assist, vehicle, vehicleColor }
```

---

## 운영 흐름 요약

- **today.html (운영)**: 익명 OK, 회원 PIN 로그인 가능
- **admin/monitor/members/stats/accounts/print**: 이메일 로그인 (admin/super) 또는 viewer
- **로그인**: 통합 폼, @ 있음 = 이메일, 숫자만 = 전화+PIN
- **알림**: 텔레그램 (다중 chat ID 콤마), SMS는 서버 프록시 필요
- **캐시 버전**: 8개 HTML에 `?v=YYYYMMDDx` 형태로 박힘. 코드 수정 시 다음 알파벳/숫자로 일괄 교체 필수
