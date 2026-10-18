# 운영 안내

## 설치 설정

기본 설치는 README의 Deploy to Cloudflare 버튼과 배포된 `/setup` wizard로 수행합니다. **배포 화면에서 Protect with Cloudflare Access → All traffic을 켠 뒤 Deploy합니다.** 이미 생성된 Access 앱을 재사용하고 실제 관리자 허용 정책과 AUD를 확인합니다. Cloudflare account 정책은 계정 구성원 전체를 신뢰할 때만 사용합니다. 설치 화면에 Tailscale 토큰을 입력하지 마세요. 필요한 설정은 모두 Worker **Secret**으로 저장합니다.

| 이름 | 값 |
| --- | --- |
| APP_ORIGIN | 사용하는 단일 HTTPS origin. 예: `https://keyport.example.workers.dev` |
| ACCESS_TEAM_DOMAIN | 실제 Zero Trust 팀의 `이름.cloudflareaccess.com` |
| ACCESS_AUD | 보호할 Access 앱 상세의 64자리 AUD 태그 |
| ADMIN_EMAILS | 허용 관리자 이메일을 쉼표로 구분. Access 허용 정책과 함께 유지 |
| TOKEN_ENCRYPTION_KEY | 브라우저 wizard가 생성하는 32바이트 무작위 키의 Base64 표현 |
| PREVIOUS_ENCRYPTION_KEY | 평소에는 불필요. 암호화 키 교체 중에만 기존 키 설정 |

Access 로그인 요청의 팀 도메인·단일 AUD·이메일을 wizard에 후보로 미리 채웁니다. 후보는 아직 서명 검증된 설정이 아니며, 사용자가 확인·수정한 뒤 직접 Secret으로 저장해야 합니다. 토큰 원문이나 다른 JWT 항목은 브라우저에 반환하지 않고 서버에 저장하지 않습니다. 로그인 정보가 없거나 만료·형식 오류·조회 실패이면 수동 입력합니다. 여러 AUD가 있으면 임의 선택하지 않습니다. 후보 조회는 설정 전만 제공하며 관리 API 인증을 대체하지 않습니다.

설치 안내는 설정이 완성되기 전까지만 공개됩니다. Access를 먼저 설정하고 필수 Secret을 모두 저장합니다. 기존 데이터가 있는 인스턴스에서 설치 화면이 보이면 설정 누락을 점검하고 **기존 암호화 키를 복구**하세요. 새 키로 덮어쓰면 기존 토큰을 읽지 못합니다.

Worker 전체의 Access 보호가 기본입니다. 계정 전체의 보호 정책은 다른 Worker에 영향을 줄 수 있으므로 이 앱의 Worker만 선택합니다. 사용자·도메인을 추정하지 말고 실제 관리자 이메일만 허용하세요. `Everyone`·`Bypass` 정책은 사용하지 않습니다. 다른 도메인과 프리뷰에서는 APP_ORIGIN 검사도 차단합니다. 커스텀 도메인을 추가하면 APP_ORIGIN을 변경하고 새 URL로 앱을 다시 설치합니다.

**Advanced settings → API token → Create new token**, 이름 **`keyport`**를 기본 설치 선택으로 사용합니다. 이 Cloudflare 배포 토큰은 Workers Builds가 관리하며 Git·D1·앱·Worker Secret에 저장하지 않습니다. Tailscale 사용자 토큰과는 별개입니다. 배포 시 D1 마이그레이션을 실행하므로 대상 계정의 D1 편집 권한이 필요합니다. 자동 생성 토큰의 권한 목록을 확인하고, 마이그레이션 인증 오류가 나면 My Profile → API Tokens에서 `keyport` 토큰에 대상 계정의 D1 편집 권한을 추가한 뒤 빌드를 재시도합니다. [Workers Builds 토큰](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

Cloudflare 관리 API 토큰은 런타임에 저장하지 않습니다. GitHub/Cloudflare 연결 앱의 접근 범위는 설치 화면에서 검토하세요.

## 배포와 업데이트

### 브라우저에서 업데이트하기

1. 배포자 저장소의 **Settings → Actions → General → Workflow permissions**에서 **Allow GitHub Actions to create and approve pull requests**를 켭니다. Workflow는 PR만 만들며 승인·자동 병합하지 않습니다. 조직 정책으로 제한되어 있으면 관리자가 허용해야 합니다. 일반 코드 업데이트에는 별도 PAT나 Cloudflare Secret이 필요하지 않습니다.
2. **Actions → Update Keyport → Run workflow**에서 기본 브랜치를 선택해 실행합니다. 원본 `ajchemist/keyport`에서는 실행하지 않습니다.
3. workflow가 만든 **Update Keyport** PR에서 변경사항·D1 마이그레이션·배포별 설정을 확인합니다. 타입 검사·테스트·빌드는 PR 생성 전에 실행합니다. GitHub가 PR 검사 승인을 요청하면 **Approve workflows to run**을 누릅니다.
4. DB 변경이 있으면 D1과 복구 키를 백업하고, PR을 GitHub에서 직접 병합합니다. 연결된 운영 브랜치의 Cloudflare Workers Builds 자동 배포 성공과 커밋을 확인합니다.
5. Access 보호, 기존 연결, 앱 동작을 확인합니다. 설정을 다시 하거나 암호화 키를 새로 생성하지 않습니다.

GitHub는 기본 `GITHUB_TOKEN`의 workflow 파일 변경 push를 제한합니다. `.github/workflows/` 변경이 포함된 업데이트는 웹에서 별도 반영하거나, 배포자 저장소 하나로 제한한 fine-grained PAT에 **Contents: Read and write · Pull requests: Read and write · Workflows: Read and write**를 부여해 Actions Secret `KEYPORT_UPDATE_TOKEN`으로 등록하세요. 등록하면 checkout·push·PR 생성에 이 토큰을 사용합니다. 토큰 원문을 Git 파일에 넣지 않습니다.

원본 변경은 `.keyport-upstream`에 기록된 커밋 이후부터 3-way 병합합니다. 배포별 Worker·D1 설정도 병합 대상이며 충돌 시 덮어쓰지 않고 중단합니다. `.keyport-upstream`을 임의로 수정하지 마세요. 열린 업데이트 PR이 있으면 먼저 병합하거나 닫습니다. 변경이 없으면 PR을 만들지 않습니다. 충돌이 나거나 원본 이력이 달라졌다면 수동 검토가 필요하며 운영 브랜치는 유지됩니다. 실패 상세는 Actions 로그에서 확인합니다.

Cloudflare 배포 버튼이 workflow 파일을 제외한 복제 저장소를 만들 수 있으므로, 기존 설치에는 updater·스크립트·기준 커밋을 별도 설치 PR로 먼저 반영해야 합니다. workflow는 기본 브랜치에 있어야 Actions에서 실행할 수 있습니다. 원본 저장소는 빌드·배포 설정이나 비밀을 자동 덮어쓰지 않습니다.

### 배포 시 확인사항

1. 배포자 복제 저장소의 `wrangler.jsonc`에 자동 생성된 D1 ID와 실제 Worker 이름을 유지합니다. 원본의 ID 없는 템플릿으로 덮어쓰거나 리소스 이름을 임의로 바꾸지 마세요.
2. D1과 복구 키를 백업합니다. 변경을 연결된 운영 브랜치에 반영합니다.
3. Workers Builds의 `bun run build`와 `bun run deploy`를 확인합니다. Bun 1.4.2 이상을 사용합니다.
4. `deploy`는 DB 바인딩 이름 `DB`로 미적용 마이그레이션을 적용한 뒤 Worker를 배포합니다. 이미 적용한 마이그레이션은 다시 수행하지 않습니다. 기존 마이그레이션을 수정하지 말고 새 파일을 추가합니다.
5. Worker Secret과 연결 데이터가 유지되고 Access가 여전히 전체 Worker를 보호하는지 확인합니다. 기존 연결로 검증 요청을 수행합니다.

새 버전은 기존 스키마와 호환되도록 단계적으로 변경해야 합니다. 마이그레이션 성공 후 Worker 배포가 실패하면 새 스키마·구 Worker 상태가 될 수 있습니다. destructive migration을 자동 업데이트에 섞지 마세요. [D1 마이그레이션](https://developers.cloudflare.com/d1/reference/migrations/)

## 롤백

Workers의 Deployments에서 이전 버전으로 롤백할 수 있지만 D1은 자동으로 돌아가지 않습니다. Secret 변경도 함께 되돌려질 수 있으므로 복구 파일을 보관하고 배포 후 확인하세요. 코드만 되돌리기 전에 해당 버전이 현재 DB 스키마와 암호화 키를 읽을 수 있는지 확인합니다. DB 복원은 이후 변경을 잃을 수 있으므로 쓰기를 중지하고 먼저 현재 DB도 내보냅니다. [Worker 롤백](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)

## API 토큰 교체

Tailscale 콘솔에서 해당 사용자로 새 **사용자 API 토큰**을 생성합니다. 앱에서 계정·네트워크를 확인하고 ‘선택한 네트워크 수정·토큰 교체’에 붙여넣습니다. 새 토큰의 키 목록 접근 검증이 성공해야 기존 값을 교체합니다. 잘못된 토큰이면 기존 값이 유지됩니다. 확인 후 Tailscale에서 이전 API 토큰을 직접 폐기합니다.

만료 예정일은 관리자 입력 정보이며 실제 만료를 보장하지 않습니다. 자동 무기한 갱신은 없습니다. 키 목록 접근은 검증하지만 사용자 신원 확인과 발급 권한은 보증하지 않습니다.

## 백업과 복구

암호화된 D1 백업과 암호화 키가 **모두** 있어야 토큰을 복구할 수 있습니다. 서로 분리해서 암호화된 보관함에 보관합니다. wizard의 복구 파일에는 키가 평문으로 들어가므로 공유 폴더·공개 저장소·로그·이슈·채팅에 올리지 마세요. 다운로드 완료를 직접 확인합니다.

브라우저에서 Cloudflare D1의 Export 기능으로 백업합니다. CLI가 필요한 환경에서는 접근 제한된 `backups/` 폴더에 내보냅니다. 이 폴더는 Git에서 제외됩니다.

```sh
mkdir -p backups
chmod 700 backups
bunx wrangler d1 export DB --remote --output backups/keyport.sql
chmod 600 backups/keyport.sql
```

복구는 먼저 관리 접근을 차단하고 대상 DB와 Worker 이름을 확인합니다. 빈 복구용 D1에 SQL을 가져오고 Worker DB 바인딩을 연결한 뒤, 해당 백업 시점의 `TOKEN_ENCRYPTION_KEY`와 나머지 설정을 Secret으로 복원합니다. 기존 DB 위에 SQL을 무작정 덮어쓰지 마세요. 다른 Access 앱을 만들었다면 새 AUD도 설정합니다. 연결 검증 후 접근을 다시 허용합니다. 키를 잃으면 각 연결의 사용자 API 토큰을 다시 등록해야 합니다. [D1 내보내기/가져오기](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

## 암호화 키 교체

1. 다른 관리자에게 토큰 변경·교체를 잠시 중단하도록 알립니다. D1과 기존 키를 백업합니다.
2. 기존 키를 `PREVIOUS_ENCRYPTION_KEY` Secret으로 저장합니다. 아직 기본 키를 삭제하지 않습니다.
3. 브라우저 개발자 도구 대신, 격리된 로컬 환경에서 아래 명령을 실행해 새 키를 **파일로만** 생성합니다. 또는 새 설치 wizard를 별도 로컬 미설정 인스턴스에서 열어 새 키와 복구 파일을 생성합니다. 운영 설치 wizard의 ‘새 설치’ 확인을 거짓으로 체크하지 마세요.

```sh
mkdir -p .keyport
chmod 700 .keyport
bun -e 'import{randomBytes}from"node:crypto";import{writeFileSync}from"node:fs";writeFileSync(".keyport/new-key",randomBytes(32).toString("base64"),{mode:0o600,flag:"wx"})'
```

4. 새 키를 암호화된 보관함에도 보관하고 `TOKEN_ENCRYPTION_KEY` Secret을 새 값으로 교체합니다. Secret 값은 로그·명령행 인자로 전달하지 않습니다. CLI라면 `bunx wrangler secret put TOKEN_ENCRYPTION_KEY < .keyport/new-key`를 사용합니다.
5. 앱의 ‘암호화 키 교체 · 운영 관리 → 저장된 토큰 재암호화’를 실행합니다. 새 키를 먼저 쓰고 기존 키로도 복호화를 허용하는 동안 전체를 새 키로 옮깁니다. 중단되면 두 키를 유지하고 다시 실행할 수 있습니다.
6. 성공과 연결 검증을 확인한 뒤 `PREVIOUS_ENCRYPTION_KEY` Secret을 삭제합니다. 이전 백업 복구에 필요한 이전 키는 별도로 유지하고 임시 파일은 안전하게 제거합니다.

교체 중 오류가 나면 두 키를 지우지 마세요. 일부 행은 이미 새 키로 저장되었을 수 있으므로 이전 키 하나로 단순 롤백하면 안 됩니다. 두 키가 있는 상태에서 재암호화를 다시 완료합니다.

## 감사와 정리

발급 감사 기록은 관리자 이메일·연결 ID·요청 시각·키 ID·만료 시각·결과 분류만 저장합니다. 매일 03:17 UTC Cron이 90일보다 오래된 기록과 지난 빈도 제한을 삭제합니다. Cron 오류 시 정리가 지연되므로 대시보드에서 마지막 실행을 점검합니다. `pending`은 처리 중단으로 발급 결과를 모르는 상태일 수 있습니다. 비밀 원문과 upstream 응답은 기록하지 않으며 애플리케이션 console 로그·Workers Observability는 기본으로 꺼져 있습니다.

## 삭제

연결/프로필 삭제는 로컬 자격 증명만 제거하며, 이미 발급된 키·등록된 기기는 남습니다. Tailscale 콘솔에서 불필요한 auth key·API 토큰·기기를 각각 폐기/삭제하세요.

전체 제거는 백업 필요 여부를 결정하고 Tailscale 자원을 정리한 뒤, Cloudflare의 해당 Worker·D1·전용 Access 앱·불필요한 도메인 라우트를 삭제합니다. 공유 Access 정책·IdP와 다른 Worker를 삭제하지 마세요. Workers Builds의 GitHub 연결과 복제 저장소는 필요에 따라 별도 정리합니다. 이 배포에 사용한 keyport 빌드 토큰이 더 이상 필요하지 않고 다른 배포에서 사용하지 않는지 확인한 뒤 My Profile → API Tokens에서 별도로 폐기합니다. 로컬·다운로드·백업 보관함의 자격 증명도 보관 정책에 따라 정리합니다.
