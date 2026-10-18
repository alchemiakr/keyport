# 검증 기록

검증일: 2026-10-19 (KST). 실제 서비스 검증과 로컬·모의 검증을 구분합니다.

## 완료

Bun 1.4.2로 도구·설치·CI·테스트를 전환했습니다. `bun.lock`을 사용하며 npm lockfile은 제거했습니다. Wrangler는 Bun 강제 실행 시 로컬 요청이 멈춰 `bunx wrangler`로 Node 24 런타임을 따릅니다. Astro·TypeScript·테스트는 Bun 런타임으로 실행합니다.

- Astro 정적 빌드·UnoCSS 생성·TypeScript 검사·브라우저 ES 모듈 문법 검사.
- GitHub Actions의 Ubuntu/Bun에서도 타입 생성 일치·타입 검사·12개 테스트·Astro 빌드·D1 마이그레이션/재실행·Worker 배포 dry-run 통과. Worker Previews 명령은 도움말 실행으로 확인하며 실제 배포는 미검증.
- Worker 배포 dry-run: 정적 자산·Worker 묶음·DB/ASSETS 바인딩 확인. 실제 클라우드 배포는 수행하지 않음.
- Wrangler/workerd의 로컬 D1에 초기 마이그레이션 적용 성공. 재실행 시 미적용 마이그레이션 없음.
- `bun:test`·`bun:sqlite`로 Bun 테스트 12개 통과. 실제 SQLite 제약·쿼리와 합성 RSA 서명 JWT를 사용하고 JWKS/Tailscale 네트워크는 모의 처리.
- 초기 미설정·위조 JWT/신원 헤더·만료·다른 issuer/AUD·비허용 관리자·대체 도메인 차단과 upstream 호출 없음.
- 다른 Origin·GET 발급·임의 Tailnet URL 거부.
- 두 프로필·두 Tailnet, 같은 Tailnet의 다른 사용자 토큰 분리, 발급 시 클라이언트 제공 토큰/조건 무시.
- 토큰 암호화·무작위 nonce·다른 연결 AAD 거부·암호문 변조 거부·잘못된 키 거부·새 키 재암호화.
- 목록/감사 API의 비밀 원문 미포함. 서버 발급 조건과 24시간 만료 강제.
- 프로필/연결 수정·토큰 교체·실패한 교체의 기존 토큰 보존·검증·삭제·프로필 삭제의 연결 정리.
- 병렬 발급 제한, 만료/권한/429/서버 오류/타임아웃/빈 응답 처리와 자동 재시도 없음.
- no-store·외부 CORS 없음·보안 헤더, 90일 감사 정리·빈도 제한 정리.
- 실제 로컬 Worker HTTP 응답: 초기 wizard 200, 관리 API와 앱 스크립트 503, no-store 헤더.

Bun 1.4.2와 1.4.3에서 Wrangler 강제 Bun 실행의 로컬 요청 멈춤을 재현했습니다. `bunx wrangler` 경로의 실제 HTTP 응답도 검사하며 CI에 초기 화면 200·미설정 API 503 검사를 추가했습니다. [상위 이슈](https://github.com/cloudflare/workers-sdk/issues/15717)

## 브라우저 확인

Ego Chromium에서 확인했습니다. 실제 iOS Safari/Android Chrome 또는 실제 Access 로그인 검증은 아닙니다.

- 실제 로컬 Worker의 초기 wizard: 새 설치 확인 없이는 키 생성 거부, 복구 파일 다운로드, 설정 다섯 개 준비, 키 가림, 390px 화면 가로 넘침 없음.
- wizard 새로고침 후 키 복원 없음. localStorage/sessionStorage 항목 0개.
- 별도 로컬 합성 API fixture에서 관리 화면: 프로필 추가 → 네트워크 등록 → 자동 선택, 제출 후 토큰 입력 지움, 예상 소유자 미검증 표시.
- 같은 fixture에서 발급 결과의 연결 표시·복사·복사 후 유지·지우기·새로고침 후 키 없음.
- 관리 화면도 390px viewport에서 가로 넘침 없음과 PWA manifest 연결 확인.
- 오프라인 에뮬레이션에서 안내·발급 거부. 복구 후 자동 발급 없음. 전체 시나리오 발급 호출 1회.
- 자동화 도구의 탭 전환도 발급 결과를 지우므로 결과·복사 검증은 한 브라우저 실행 안에서 수행했습니다.

## 남은 실제 환경 검증

아래는 완료 표시하지 않았습니다. 배포자가 준비한 테스트 환경에서 수행해야 합니다. 비밀을 채팅·이슈·PR·스크린샷에 남기지 마세요.

- [ ] 별도 테스트 DB·Secret·Access로 Worker Previews 배포 및 운영 데이터 분리 확인.
- [ ] 빈 Cloudflare 계정에서 README 버튼 → 배포자 저장소 생성 → D1 자동 생성/바인딩 → 초기 마이그레이션 → 배포 → wizard 완료.
- [ ] 실제 Access 허용·비허용 사용자, 로그아웃·세션 만료·재인증 후 복귀.
- [ ] 실제 workers.dev/Custom Domain/라우트/프리뷰 우회 차단.
- [ ] 복제 저장소 변경 후 Workers Builds 재배포, D1·Secret 유지, 마이그레이션 재실행.
- [ ] 실제 사용자 토큰과 두 프로필/두 네트워크 등록·선택·교체·삭제.
- [ ] 실제 키로 선택한 사용자 소유·태그 없음·사전 승인 기기 등록, 동일 키 재사용 거부, 테스트 자원 정리.
- [ ] Tailnet Lock 사용 환경 서명 절차.
- [ ] iOS Safari·Android Chrome 및 홈 화면 독립 실행에서 설치·등록·복사·Access 재인증.
- [ ] 실제 브라우저 캐시/스토리지·운영 로그·빌드 산출물에 원문 비밀 없음.
- [ ] 실제 D1 백업/빈 DB 복구·Worker 롤백·Secret 복구·키 교체 연습.
- [ ] 실제 CPU·요청량·Builds·Access 사용량과 무료 플랜 범위.

## 완료 기준 대응

| HANDOFF 기준 | 현재 근거 | 실제 환경에서 남은 일 |
| --- | --- | --- |
| 1–2 배포·업데이트 | 버튼·자동 프로비저닝 설정·마이그레이션·문서·CI | 빈 계정 설치·재배포 |
| 3 인증·우회 차단 | JWT·Origin·host 자동 테스트, 기본 차단 | 실제 Access·대체 도메인 |
| 4 다중 연결 | 두 프로필·두 Tailnet·토큰 분리 자동 테스트 | 실제 계정 연결 |
| 5 암호화·오류 | 변조 거부·발급 계약·오류/중복 제한 자동 테스트 | 실제 API 응답 |
| 6 기기 등록 | 고정 발급 계약 구현 | 소유자·재사용 거부·기기 정리 |
| 7 모바일 | Chromium 화면 확인·PWA manifest/icons | 실제 iOS/Android 독립 실행 |
| 8 비밀 수명 | 저장소 0·오프라인/재실행 확인, no-store 구현 | 운영 로그·기기 캐시 |
| 9 문서·비용 | README·운영·검증·ADR·공식 요금 링크 | 실제 계정 비용 |
