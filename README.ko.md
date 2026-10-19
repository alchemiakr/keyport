# Keyport

[English](README.md)

내 Cloudflare 계정에서 운영하는 Tailscale 기기 등록 키 발급 PWA. 모바일에서 계정과 네트워크를 선택하고, 24시간 유효한 일회용 키를 발급·복사합니다.

[![Cloudflare에 배포](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ajchemist/keyport)

## 브라우저에서 설치

**Deploy to Cloudflare**를 누르고 자신의 GitHub·Cloudflare 계정을 연결한 뒤 새 저장소·Worker·D1 이름을 확인합니다. **Deploy**를 누르기 전에 아래 설정을 맞추세요.

| 배포 화면 항목 | 값 |
| --- | --- |
| Build command | `bun run build` |
| Deploy command | `bun run deploy` |
| Preview command | `bunx wrangler preview` |
| Protect with Cloudflare Access | **켜기** |
| Access 보호 범위 | **All traffic** |
| Access 허용 정책 | 신뢰하는 관리자만. **Cloudflare account**는 계정 구성원 전체를 신뢰할 때만 선택 |
| Advanced settings → API token | **Create new token** |
| 새 API token 이름 | **`keyport`** |
| Bun 버전을 고정할 경우 빌드 변수 | `BUN_VERSION=1.4.2` |
| 첫 설치의 Preview builds | 별도 테스트 리소스·인증을 준비하기 전까지 **끄기** |

이 화면의 선택값은 Cloudflare가 관리합니다. 저장소 스크립트로 기존 선택값을 덮어쓰거나 Access 활성화·새 토큰 생성·토큰 이름을 강제하지 못합니다. 다른 값이 미리 선택되어 있어도 위 표를 확인하세요. Access에 Everyone·Bypass를 사용하지 않습니다.

**이 `keyport` API 토큰은 Cloudflare Builds 배포용이며 Tailscale 토큰이 아닙니다.** Cloudflare가 생성·관리하도록 두고 Git·앱·D1·Worker Secret에 복사하지 마세요. 배포 스크립트가 D1 마이그레이션을 실행하므로 대상 계정의 **Account → D1 → Edit** 권한을 확인합니다. 공식 문서의 일반적인 자동 생성 토큰 권한 목록에는 D1이 없으므로 새 토큰에 포함되었다고 가정하지 않습니다. 마이그레이션에서 인증 오류가 나면 **My Profile → API Tokens**의 생성된 `keyport` 토큰에 대상 계정의 D1 편집 권한을 추가하고 빌드를 재시도하세요. Global API Key로 대체하지 않습니다. [빌드 토큰 공식 문서](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

배포가 성공하면 wizard는 **접근 설정 → 복구 키 → Secret 저장**의 세 단계만 보여줍니다. Access 누락·정책 수정과 빌드 설정 복구 안내는 필요한 때 펼쳐 볼 수 있습니다.


Access 로그인 정보가 있으면 팀 도메인·단일 AUD·이메일 후보를 미리 채웁니다. 아직 검증되지 않은 후보이므로 확인 후 진행하고, 자동 입력이 안 되면 직접 입력하세요. Worker Secret으로 저장하기 전에는 설정이 적용되지 않습니다.

1. Worker URL을 열고 Access 로그인 후 **설정 wizard**로 들어갑니다. 별도 CLI 설치는 필요 없습니다.
2. Worker 전체 Access 보호와 기존 Access 앱의 실제 관리자 이메일 허용 정책을 확인합니다. 앱을 중복 생성하지 말고 기존 AUD 태그를 사용합니다.
3. 브라우저에서 암호화 키를 생성하고 복사 또는 복구 파일 다운로드를 선택합니다. 암호화된 보관함에 보관하며 클립보드만 백업으로 사용하지 않습니다.
4. wizard가 준비한 다섯 값을 Worker **Settings → Variables and Secrets**에 **Secret**으로 저장한 뒤 해당 설정을 Deploy합니다. 앱 이동 버튼은 Secret을 저장하지 않습니다.
5. 앱에서 계정 프로필을 만들고 Tailnet과 해당 사용자의 **Tailscale API 토큰**을 등록합니다. Tailscale 토큰은 D1에 암호화하여 저장하며 다시 보여주지 않습니다.

D1은 자동 생성·바인딩되므로 DB ID를 복사하지 않습니다. 버튼이 저장소 복제·Workers Builds 연결·리소스 생성·배포를 자동화하며, Access 정책·화면 선택값·필요한 토큰 권한·앱 Secret 설정은 명시적인 설치 단계로 남습니다. 실제 빈 Cloudflare 계정에서의 종단 검증은 아직 하지 않았습니다. [배포 버튼 공식 안내](https://developers.cloudflare.com/workers/platform/deploy-buttons/)

Worker Previews는 `wrangler versions upload`가 아닌 `bunx wrangler preview`를 사용합니다(최신 코드에서는 `bun run preview`도 동일). 운영 설정을 상속하지 않습니다. 빈 `previews` 설정은 설치 안내만 제공하며 별도의 테스트 D1 바인딩·Secret·Access를 구성한 뒤 프리뷰 관리 기능을 사용하세요. [프리뷰 설정](https://developers.cloudflare.com/workers/previews/configuration/)

이전 설치 시도에서 복제 저장소가 이미 생겼다면 최신 코드를 동기화한 뒤 재개하세요. 원본 변경은 기존 복제 저장소에 자동 반영되지 않습니다. 설치를 다시 시작하려고 기존 Worker·DB·자격 증명을 임의로 삭제하지 마세요.

공식 버튼 설치에는 GitHub/GitLab 연결이 필요합니다. 내 계정에 소스 복제 저장소를 만들고 Workers Builds에 연결하므로 미리 저장소를 만들 필요는 없습니다. Git 연결 없는 Wrangler 수동 배포는 별도 경로입니다.

배포 시 Access를 켜면 설치 wizard부터 로그인이 필요합니다. Access를 빠뜨려도 초기 설정 전에는 설치 안내만 공개되고 관리 UI·API는 차단됩니다. 첫 방문자를 관리자로 등록하지 않습니다.

## 사용

**키 발급**(`/`)과 **계정·네트워크 관리**(`/connections`) 메뉴를 구분합니다. 첫 사용은 관리 메뉴에서 프로필 → 네트워크·API 토큰 순서로 등록한 뒤 키 발급 메뉴로 이동하세요. 등록·검증 오류는 해당 폼에 코드와 함께 표시됩니다. 계정이나 네트워크가 하나면 자동 선택하며, 메뉴 이동 시 선택을 유지합니다.

- 계정 프로필의 표시 이름과 예상 소유자를 입력하고, 해당 프로필에 Tailnet 식별자와 **사용자 API 토큰(`tskey-api-`)**을 등록합니다. OAuth 자격 증명은 받지 않습니다.
- 등록 시 해당 Tailnet의 키 목록 접근을 검증합니다. 예상 소유자는 **관리자 입력·미검증**이며, 키 목록 조회 성공이 실제 발급 권한이나 소유자 신원을 보증하지 않습니다. 토큰 만료 예정일도 관리자 입력입니다.
- 계정 → 네트워크를 선택해 키를 발급하고, 선택한 연결과 예상 소유자·만료 시각을 확인한 뒤 복사해 비공개 경로로 직접 전달합니다.
- 키는 일회용·사전 승인·비임시·태그 없음·24시간으로 서버가 강제합니다. Tailnet Lock이 켜져 있으면 별도 서명이 필요할 수 있습니다. 기존 보안 정책을 끄지 마세요.
- 같은 Tailnet을 다른 프로필과 다른 사용자의 토큰으로 각각 등록할 수 있습니다. 모든 허용 관리자가 모든 연결을 공동 관리합니다.
- 토큰은 저장 후 다시 표시하지 않습니다. 발급 키는 현재 화면 메모리에만 있으며 지우기·다른 연결 선택·화면 이탈·백그라운드 전환·새로고침 때 제거합니다. 복사한 값은 OS 클립보드에 남을 수 있습니다.
- 발급은 자동 재시도하지 않습니다. 타임아웃·불완전 응답·`pending` 기록은 성공 여부를 알 수 없는 상태입니다. Tailscale 콘솔을 확인하고 불필요한 키를 폐기한 뒤 필요할 때 새로 발급하세요.
- 사용자 API 토큰의 만료(최대 90일), 발급 키의 24시간 만료, 등록된 기기의 노드 키 만료는 각각 다릅니다. 토큰은 만료 전에 연결 관리에서 교체합니다. [Tailscale API 인증](https://tailscale.com/docs/reference/tailscale-api), [기기 등록 키](https://tailscale.com/docs/features/access-control/auth-keys)

## 앱으로 설치

초기 설정 후 사용하는 앱 주소에서 Access 로그인하고, 상단 **앱 설치**를 누르세요. 지원되는 Chrome·Edge는 설치 창을 열고, 그렇지 않으면 브라우저 설치 메뉴를 안내합니다. iPhone·iPad는 Safari → 더 보기/공유 → 홈 화면에 추가에서 **웹 앱으로 열기**가 보이면 켜고 추가하세요. 독립 실행 중에는 설치 안내를 숨깁니다.

Access로 보호된 manifest도 인증을 포함해 가져옵니다. 설치가 인증을 대신하지 않으므로 필요하면 다시 로그인합니다. 재인증 링크에는 선택한 프로필·네트워크를 유지합니다. 등록·토큰 교체·발급은 온라인 전용이며 오프라인 요청을 저장하거나 자동 재전송하지 않습니다. 재실행 시 키·토큰을 복원하지 않습니다. 도메인을 바꾸면 새 주소에서 다시 설치하세요. 실제 iOS·Android 설치 앱의 인증 흐름은 실기기 검증 항목으로 남아 있습니다.

## 구성과 보호

Astro 정적 페이지 + UnoCSS + TypeScript Worker + D1 하나입니다. 프런트엔드 런타임 프레임워크, KV, R2, Durable Objects, 서비스 워커, 분석 스크립트는 사용하지 않습니다.

토큰은 AES-256-GCM으로 암호화하며 무작위 96비트 nonce와 연결 ID AAD를 사용합니다. 마스터 키는 D1과 분리한 Worker Secret입니다. 고정된 Tailscale API 호스트만 호출하고 리다이렉트도 거부합니다. 토큰·발급 키는 URL이나 브라우저 영구 저장소에 넣지 않습니다. 서버 오류에 upstream 본문을 포함하지 않습니다.

Access의 Worker 전체 보호를 설정하고, 서버도 JWT의 서명·issuer·audience·만료와 관리자 이메일을 검증합니다. 설정한 단일 origin 이외의 도메인은 서버에서 차단합니다. 정적 자산을 쓰면 네이티브 `ctx.access`가 전달되지 않는 제한 때문에 JWT 검증을 사용합니다. `run_worker_first`로 자산 요청도 Worker를 거칩니다. [Access 공식 문서](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

변경 요청은 Origin·JSON Content-Type·전용 헤더를 검사하며 외부 CORS는 열지 않습니다. D1 원자적 갱신으로 관리자별 발급 간격 5초, 연결별 30초를 적용합니다. 모든 응답은 `no-store`이며 CDN 캐시도 금지합니다. 오프라인 발급·비밀 요청 큐·재실행 시 과거 키 복원은 없습니다.

## 업데이트와 운영

배포자 저장소의 **Actions → Update Keyport → Run workflow**로 검증된 업데이트 PR을 만들고 GitHub에서 검토·병합하세요. Cloudflare Builds가 운영 브랜치를 배포합니다. 최초 권한 설정·기존 설치 반영은 [브라우저 업데이트 절차](docs/OPERATIONS.md#브라우저에서-업데이트하기)를 따릅니다. 로컬 작업이나 Actions에 Cloudflare 자격 증명을 넣을 필요가 없습니다. Workflow 파일 업데이트에는 절차에 설명한 선택적 GitHub 토큰이 필요할 수 있습니다.

[운영 안내](docs/OPERATIONS.md)에 업데이트·롤백·토큰 갱신·백업/복구·암호화 키 교체·리소스 삭제 절차가 있습니다. [검증 기록](docs/VERIFICATION.md)은 자동 테스트와 실제 환경의 미검증 항목을 구분합니다. 도메인 용어는 [CONTEXT.md](CONTEXT.md), 결정 배경은 [ADR](docs/adr/)에 기록합니다.

이 저장소의 변경이 배포자 복제 저장소에 자동 병합되지는 않습니다. 배포자 저장소의 연결된 운영 브랜치에 변경을 반영하면 Workers Builds가 재배포합니다. 기존 D1 바인딩 ID와 Secret을 유지하세요.

## 로컬 개발

Bun 1.4.2 이상과 Wrangler용 Node 24 이상:

```sh
bun install --frozen-lockfile
bun run types
bun run check
bun test
bun run build
bun run db:local
bun run dev
```

테스트는 `bun:test`·`bun:sqlite`를 사용하고 Astro·TypeScript는 `bunx --bun`으로 실행합니다. Wrangler는 Bun 런타임을 강제하면 로컬 요청이 멈추는 문제가 있어 `bunx wrangler`로 공식 Node shebang을 따릅니다. Node 24는 Wrangler에만 필요하며 `.node-version`으로 지정합니다. [상위 프로젝트 호환성 이슈](https://github.com/cloudflare/workers-sdk/issues/15717)도 참고하세요. 배포된 앱은 Cloudflare Workers에서 실행됩니다. Workers Builds는 Bun lockfile을 감지하며, Bun 버전을 명시하려면 빌드 변수에 `BUN_VERSION=1.4.2`를 설정합니다.

기본 로컬 실행은 미설정 상태로 wizard만 제공합니다. 운영에 인증 우회 개발 모드는 없습니다. 테스트는 합성 JWT·임시 SQLite·모의 Tailscale API로 검증합니다. 실제 사용자 토큰을 테스트 파일이나 채팅에 넣지 마세요.

## 비용

2026-10-19 확인 기준, 작은 관리자 인스턴스는 Workers Free·D1 Free·Access Free의 범위에서 시작할 수 있습니다. 무료 운영을 보장하지는 않습니다.

| 리소스 | 무료 범위 / 비용 조건 |
| --- | --- |
| Workers | 하루 100,000 요청, 호출당 CPU 10ms. 모든 정적 요청도 인증 Worker를 거칩니다. 한도 또는 CPU 예산을 넘으면 서비스 제한/실패가 가능하며 Paid 전환 시 기본 구독·초과 사용료가 생깁니다. |
| D1 | 하루 5백만 행 읽기·10만 행 쓰기·총 5GB. 무료 한도를 넘으면 작업이 제한됩니다. Paid는 포함량 초과 사용량에 과금합니다. |
| Access | 소규모 팀용 무료 플랜. 50명 이상 규모·추가 기능은 플랜을 확인하세요. |
| Builds | 빌드 시간·동시성·월 한도는 Workers Builds 플랜을 따릅니다. |

[Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/), [D1 요금](https://developers.cloudflare.com/d1/platform/pricing/), [Access 요금](https://www.cloudflare.com/sase/products/access/), [Builds 한도와 요금](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/). 도메인·IdP·Tailscale 요금은 별도이며 계정 전체의 다른 사용량도 포함해 확인하세요.

## 라이선스와 참고

MIT © 2026 ajchemist. [tailscale-x/tailscale-cloudflare](https://github.com/tailscale-x/tailscale-cloudflare)를 확인했으나 현재 저장소는 다른 구성의 프로젝트이며 라이선스를 확인할 수 없어 코드를 재사용하지 않았습니다. 기존 비공개 onboarding 프로젝트의 코드·비밀도 포함하지 않습니다.
