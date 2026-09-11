# kit

앱 도메인과 무관한 재사용 모듈. 광고 수익형 오프라인 계산기 앱의 공통 골격이다.

## 규칙

- `kit/`은 `app/`, `lib/`, `components/`를 **import하지 않는다.** 단방향 의존이며 ESLint로 강제한다
- 앱 고유 값(브랜드 색, 광고 단위 ID, 앱 이름, 번역 문자열)은 **인자나 prop으로 받는다.** kit 안에 상수로 두지 않는다
- 사용처가 1개뿐인 추상화는 kit에 올리지 않는다. 두 번째 앱에서 같은 필요가 확인되면 그때 승격한다

## 구성

- `i18n/` - 로케일 감지와 i18n 인스턴스 생성
- `currency.ts` - 통화/소수 포맷과 환산 표기
- `theme.ts` - 라이트/다크 팔레트
- `prefs.ts` - AsyncStorage 기반 값 저장/복원
- `ads/` - AdMob 배너, UMP 광고 동의, 보상형 광고 (아래 참고)
- `share/` - 브랜드 카드 골격과 캡처/공유/저장
- `chart/` - 차트 라벨 처리와 테마 적용 라인 차트

## ads/ - UMP 광고 동의

EEA/UK 등 규제 지역에 배포하려면 광고를 요청하기 전에 UMP(Google User Messaging
Platform) 동의를 받아야 한다. 동의 흐름 없이 배포하면 정책 위반 소지가 있다.

- `ads/consentLogic.ts` - 결과 해석/재시도/디버그 옵션 정리. 네이티브를 모르는 순수 함수
- `ads/consent.ts` - `AdsConsent` 호출 어댑터와 결과 스토어 (`consent.web.ts` 는 웹 스텁)
- `ads/AdBanner.tsx` - `enabled` 프롭으로 동의 판정 전 배너 요청을 막는다
- `ads/rewardedState.ts` / `ads/rewarded.ts` - 보상형 광고 (아래 별도 절)

### 공개 API

| 함수 | 용도 |
| --- | --- |
| `ensureAdsConsent(options?)` | 앱 시작 시 1회. 동의 정보 갱신 -> 필요하면 폼 표시 -> `ConsentResult` |
| `shouldRequestAds(result, whenUnavailable?)` | 배너를 띄워도 되는지. 판정 전이면 `false` |
| `showPrivacyOptions()` | 설정 화면의 "광고 개인 설정" 진입점 |
| `usePrivacyOptionsRequired()` | 그 버튼을 노출해야 하는지 |
| `useAdsConsentResult()` | 마지막 판정 구독 (판정 전 `null`) |

`ConsentResult.outcome` 은 `obtained` / `not-required` / `required` / `unavailable`
네 가지다. 네이티브 모듈이 없는 환경(Expo Go/웹)과 UMP 호출 실패는 예외를 던지지 않고
`unavailable` 로 돌아오며, `canRequestAds` 를 임의로 `true` 로 만들지 않는다.
그 경우 광고를 요청할지는 앱이 정한다:

```ts
shouldRequestAds(consent);          // 기본 'allow' - 판단 불가면 광고를 띄운다
shouldRequestAds(consent, 'block'); // 규제 지역 비중이 크면 아예 막는다
```

디버그 옵션(`debugGeography: 'EEA'`, `testDeviceIdentifiers`)은 `__DEV__` 에서만
적용되고 릴리스 빌드에서는 kit 이 버린다.

문구는 kit 에 없다. "광고 개인 설정" 버튼 라벨은 앱 i18n 에 둔다.

### 다른 앱에 역전파할 때 (3줄)

1. `src/kit/ads/consent.ts`, `consent.web.ts`, `consentLogic.ts` 와 테스트
   `src/kit/__tests__/consentLogic.test.ts` 를 복사하고, `AdBanner` 에 `enabled` 프롭을 추가한다
2. 앱 진입점(`src/app/_layout.tsx`)의 마운트 이펙트에서 `ensureAdsConsent()` 를 호출하고,
   배너에 `enabled={shouldRequestAds(useAdsConsentResult())}` 를 넘긴다
3. 설정/정보 화면에 `usePrivacyOptionsRequired()` 가 `true` 일 때만 보이는 버튼을 두고
   `showPrivacyOptions()` 를 연결한다. 라벨은 그 앱의 지원 로케일 전부에 추가한다

의존성 추가는 없다 (`react-native-google-mobile-ads` 를 이미 쓰고 있다).
Android 대상이므로 `app.json` 의 iOS 전용 UMP 설정은 건드리지 않는다.

## ads/ - 보상형 광고

"광고를 보고 이어하기/하트 충전" 류의 보상형 광고. 광고 SDK 는 콜백으로만 말을 걸어오고
(로드 완료/실패/보상/닫힘) 순서가 기기마다 달라서, 그 순서를 화면 코드에 흩어 두면
"보상을 두 번 주는" 류의 버그가 생긴다. 전이를 상태 기계 한곳에 모으고 화면은 상태만 본다.

- `ads/rewardedState.ts` - 전이/재시도 정책/파생 판단. 네이티브를 모르는 순수 함수
- `ads/rewarded.ts` - `RewardedAd` 호출 어댑터와 `useRewardedAd` 훅 (`rewarded.web.ts` 는 웹 스텁)

### 공개 API

| 이름 | 용도 |
| --- | --- |
| `useRewardedAd(options)` | 광고 한 개를 로드해 두고 필요할 때 보여준다 |
| `rewardedReducer` / `createRewardedReducer(policy)` | 상태 기계 (정책을 바꾸려면 후자) |
| `canShow` / `shouldUseMockGate` / `isUnavailable` / `isBlocked` | 상태에서 화면 판단으로 |
| `retryDelayMs(failures, policy?)` | 재시도 지연 (지수 백오프, 상한 있음) |

```ts
const rewarded = useRewardedAd({
  productionUnitId: BRANDING.adRewardedUnitId ?? undefined,
  onReward: grantContinue,
  enabled: shouldRequestAds(useAdsConsentResult()), // UMP 동의 게이트
});
```

`RewardedStatus` 는 일곱 가지다.

| 상태 | 뜻 | 화면 |
| --- | --- | --- |
| `blocked` | `enabled=false`. 로드도 리스너 등록도 하지 않는다 | 버튼 비활성 |
| `unavailable` | 네이티브 모듈이 없다 (Expo Go/웹) | 모의 게이트로 폴백 |
| `loading` | 로드 중 | 버튼 비활성 |
| `ready` | 보여줄 수 있다 | 버튼 활성 |
| `showing` | 표시 중 | - |
| `error` | 로드 실패, 재시도 대기 | 버튼 비활성 |
| `exhausted` | 재시도 상한까지 실패 | "광고를 사용할 수 없습니다" |

- **동의 게이트는 훅 안에 있다.** `enabled` 가 `false` 인 동안에는 광고 객체를 만들지 않고
  상태는 `blocked` 다. `false -> true` 로 바뀌면 그때 로드가 시작되고, `true -> false` 면
  광고 객체를 정리하고 다시 `blocked` 로 돌아간다. 훅을 조건부로 부르려고 호스트
  컴포넌트를 따로 둘 필요가 없다
- **재시도는 상한이 있다.** 기본은 재시도 3회, 지연 2초 -> 4초 -> 8초(상한 30초)이고
  모두 실패하면 `exhausted` 에서 멈춘다. 무한 재시도는 재고가 없는 계정에서 버튼이
  영영 비활성인 채로 남는다. 옵션 `maxRetries` / `retryBaseDelayMs` / `retryMaxDelayMs`
  로 조절한다 (`maxRetries: 3, retryBaseDelayMs: 30_000` 이면 30초 간격 3회)
- `exhausted` 에서 사용자가 다시 시도할 수 있게 하려면 `reload()` 를 버튼에 건다
- 로드 실패를 곧바로 무료 보상으로 바꾸지 않는다. 광고를 안 보고도 보상을 얻는 길이 된다.
  모의 게이트 폴백은 네이티브 모듈이 아예 없을 때(`unavailable`)만이다

문구는 kit 에 없다. "광고를 사용할 수 없습니다", "광고 불러오는 중" 같은 라벨과 `Alert` 는
앱 i18n 에 둔다.

### 다른 앱에 역전파할 때 (3줄)

1. `src/kit/ads/rewardedState.ts`, `rewarded.ts`, `rewarded.web.ts` 와 테스트
   `src/kit/__tests__/rewardedState.test.ts` 를 복사하고, 앱의 `src/lib/ads/` 사본
   (`rewarded.ts`, `rewardedState.ts`, `__tests__/rewardedState.test.ts`)을 지운다
2. 동의 게이트용 호스트 컴포넌트(brick-rogue `components/RewardedRetryHost.tsx`,
   poker-defense `app/index.tsx` 안 `RewardedAdHost`)와 그 상태를 올려받던
   `useState` / `onChange` 배선을 지우고, 화면에서 훅을 직접 부른다:
   `const rewarded = useRewardedAd({ productionUnitId, onReward, enabled: adsAllowed })`
3. 광고 불가 안내를 붙인다. `rewarded.unavailable` 이면 "광고를 사용할 수 없습니다" 를
   버튼 자리에 띄우고, 기존의 "로드 중" 라벨은 `!rewarded.useMockGate && !rewarded.ready`
   조건을 그대로 쓴다

상태 전이를 보고 동작하는 코드(poker-defense 의 `gateAction(prev, next)`)가 있으면
`blocked` 가 새로 들어온다는 것에 주의한다. 동의 전 초기 상태가 `loading` 이 아니라
`blocked` 이고, 여기서는 어떤 보상도 나오지 않는다.

의존성 추가는 없다 (`react-native-google-mobile-ads` 를 이미 쓰고 있다).
