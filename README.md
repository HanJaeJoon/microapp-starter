# microapp-starter

광고 수익형 오프라인 계산기 앱을 반복해서 만들기 위한 Expo 스타터.

Expo SDK 57 / React Native 0.86 / expo-router / TypeScript. Android 릴리스 AAB 를 GitHub Actions 에서 빌드한다.

산출물은 앱 하나가 아니라 **아이디어에서 Play 업로드까지 걸리는 시간**이다. 그래서 반복되는 배선(광고 배너, 다국어, 테마, 공유 카드, 차트, 값 저장, CI 빌드, 서명 검증)이 이미 다 되어 있다.

## 무엇이 들어 있는가

```
src/
  kit/            앱 도메인과 무관한 재사용 모듈. 여기는 손대지 않는다
    theme.ts        라이트/다크 팔레트
    currency.ts     통화 포맷
    prefs.ts        AsyncStorage 저장/복원
    i18n/           로케일 감지 + i18n 인스턴스
    chart/          라벨 처리 + 테마 적용 라인 차트
    share/          공유 카드 골격 + 캡처/공유/저장
    ads/            AdMob 배너
  lib/            이 앱의 코드. 여기를 갈아끼운다
    branding.ts     앱 고유 값 전부 (이름/색/광고 단위 ID/저장 키 접두사)
    compound.ts     예시 도메인 로직 (복리 계산)
    prefs.ts        kit/prefs 로 만든 입력값 저장소
    i18n/           번역 문자열 (ko/en/ja/de/es/zh)
  app/            expo-router 화면
    index.tsx       예시 화면. kit 모듈 전부를 실제로 호출한다
```

`src/app/index.tsx` 는 빈 화면이 아니라 **kit 사용 예시**다. 복리 계산을 도메인으로 삼아 theme / currency / prefs / i18n / chart / share / ads 를 모두 호출한다. 새 앱을 만들 때 이 화면을 지우지 말고 하나씩 자기 도메인으로 바꿔 나가면 배선을 다시 만들 필요가 없다.

## kit 규칙

`src/kit/README.md` 에 있고 요점은 셋이다.

1. **kit 은 앱을 import 하지 않는다.** ESLint `no-restricted-imports` 로 강제하며 CI 의 Lint 단계에서 검사된다
2. **앱 고유 값은 인자나 prop 으로 받는다.** kit 안에 브랜드 색이나 광고 ID 를 상수로 두지 않는다
3. **사용처가 1개뿐인 추상화는 kit 에 올리지 않는다**

kit 테스트는 앱 코드 없이 독립 실행된다: `pnpm jest src/kit`. 이게 경계를 제대로 그었는지 확인하는 척도다.

## 새 앱 시작 절차

### 1. 저장소 만들기

이 저장소는 GitHub template repository 다. 저장소 상단의 **Use this template ->
Create a new repository** 로 히스토리 없는 새 저장소를 만든 뒤 clone 한다.

```bash
git clone https://github.com/HanJaeJoon/my-new-app
cd my-new-app
pnpm install
```

pnpm 이 없으면 `corepack enable pnpm` 으로 활성화한다. 버전은 `package.json` 의
`packageManager` 필드에 고정돼 있다.

이미 있는 저장소에 배선만 넣을 때는 template 을 쓸 수 없다. `.git` 을 제외한
파일을 복사하고 `.gitignore` 를 병합한 뒤 한 커밋으로 올린다 (기존 히스토리 보존).

동작 확인:

```bash
pnpm run typecheck && pnpm run test:ci && pnpm run lint
pnpm start
```

### 2. 코드에서 고칠 것 (파일 4개)

| 파일 | 고칠 것 |
|---|---|
| `src/lib/branding.ts` | 앱 이름, 브랜드 색, 광고 단위 ID, 저장 키 접두사 |
| `app.json` | `name`, `slug`, `scheme`, `android.package`, splash 색, AdMob `androidAppId` |
| `package.json` | `name` |
| `src/lib/i18n/translations.ts` | 번역 문자열 |

**`app.json` 의 AdMob `androidAppId` 는 구글 공식 테스트 ID 가 기본값이다.** 실광고 오클릭은 AdMob 계정 정지 사유이므로 자기 앱 ID 를 발급받은 뒤에만 바꾼다. `branding.ts` 의 `adBannerUnitId` 도 같은 이유로 `null` 이 기본값이며, `null` 이면 kit 이 테스트 광고를 띄운다.

`android.package` 는 Play 에 한 번 올리면 **영구히 바꿀 수 없다.** 올리기 전에 확정할 것.

### 3. 도메인 갈아끼우기

`src/lib/compound.ts` 를 자기 계산 로직으로 바꾼다. 이 파일이 예시로 보여주는 것:

- **금액은 통화 최소 단위 정수로 계산한다.** 부동소수점으로 누적하면 "원금 합계 + 이자 합계 == 총액" 같은 불변식이 깨진다
- **입력 검증은 도메인 함수가 한다.** 잘못된 입력은 `RangeError` 로 거부하고, 화면은 그 전에 미리 걸러 예외로 흐름을 만들지 않는다
- **테스트는 하드코딩 기대값보다 불변식으로 쓴다.** `src/lib/__tests__/compound.test.ts` 는 합계 일치 / 스케줄 길이 / 단조성 / 이율 0% / 극단 입력을 검사하고, 폐형식(closed form)으로 교차 검증한다

### 4. 출시

`docs/RELEASE.md` 를 따른다.

## 명령어

| 명령 | 하는 일 |
|---|---|
| `pnpm start` | 개발 서버 |
| `pnpm run typecheck` | `tsc --noEmit` (strict) |
| `pnpm run test:ci` | Jest 1회 실행 |
| `pnpm run lint` | ESLint (kit 단방향 의존 규칙 포함) |
| `pnpm jest src/kit` | kit 테스트만 (경계 확인) |

## 알아둘 제약

**`react-native-google-mobile-ads` 는 `16.3.4` 로 정확히 고정돼 있다.** 16.4.0 부터 쓰는 Google Mobile Ads SDK 25.4.0 이 Kotlin 2.3 으로 컴파일돼 있고, RN 0.86 은 Kotlin 2.1.20 이라 `compileReleaseKotlin` 이 실패한다. 16.3.4 가 GMA 25.0.0 을 쓰는 마지막 버전이다. **Expo 가 Kotlin 2.3 이상으로 올라가면 그때 푼다.**

**`tsconfig.json` 의 `"types": ["jest", "node"]` 는 지우면 안 된다.** TypeScript 6 은 `node_modules/@types` 를 자동 포함하지 않는다. 지우면 테스트 파일에서 `describe` / `it` / `expect` 가 전부 미해결이 된다.

**Expo Go 에서는 광고 배너가 나오지 않는다.** AdMob 네이티브 모듈이 Expo Go 에 없어서 `kit/ads` 가 스스로 렌더를 건너뛴다. 광고는 Actions 빌드에서만 확인할 수 있다.

**패키지 매니저는 pnpm 이다 (npm 을 쓰지 말 것).** npm 은 Windows 에서 `npm install <패키지>` 를 개별 실행하면 Linux 에 필요한 optional 전이 의존(`@emnapi/*`)을 락파일에서 지워 CI 의 `npm ci` 가 죽는 문제가 있었다. pnpm 락파일은 플랫폼 무관하게 optional 의존을 전부 기록하므로 이 실패 모드가 구조적으로 없다. 설정(`nodeLinker: hoisted`, `allowBuilds`)은 `pnpm-workspace.yaml` 에 있다 - pnpm 11 부터 `.npmrc` 의 pnpm 설정은 무시된다.

**`nodeLinker: hoisted` 는 지우지 말 것.** isolated(기본값) 설치는 `react-native-google-mobile-ads` / `react-native-view-shot` / `react-native-chart-kit` 같은 네이티브 모듈이 호환되지 않을 수 있다. Expo 공식 문서도 문제가 생기면 hoisted 로 되돌리라고 안내한다.

**SDK 메이저 업그레이드에서는 락파일(`pnpm-lock.yaml`)을 재생성할 것.** npm 시절 기존 락파일 위에 `expo install --fix` 를 돌리면 `expo-modules-core` 가 `node_modules/expo/` 아래로 중첩 설치돼 jest-expo 프리셋과 config plugin 이 모듈을 못 찾는 문제가 있었다. hoisted 레이아웃은 같은 위험이 있으므로 규율을 유지한다.

**Public 저장소를 권장한다.** GitHub Actions 분이 무제한이다. Private 은 계정 전체 월 2,000분을 공유하고 Android 릴리스 빌드가 약 25분이라 월 80회가 한계다.

## kit 에 대해 남은 판단

`kit/currency.ts` 의 `formatKrwApprox` / `formatApproxConverted` 는 환율을 인자로 요구한다. 오프라인 계산기는 환율 데이터를 가져오지 않으므로 이 스타터의 예시 화면은 두 함수를 쓰지 않는다. 실시간 환산이 필요한 앱이 두 번째로 나오면 그때 유지할지 판단한다.
