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
- `ads/` - AdMob 배너와 UMP 광고 동의 (아래 참고)
- `share/` - 브랜드 카드 골격과 캡처/공유/저장
- `chart/` - 차트 라벨 처리와 테마 적용 라인 차트

## ads/ - UMP 광고 동의

EEA/UK 등 규제 지역에 배포하려면 광고를 요청하기 전에 UMP(Google User Messaging
Platform) 동의를 받아야 한다. 동의 흐름 없이 배포하면 정책 위반 소지가 있다.

- `ads/consentLogic.ts` - 결과 해석/재시도/디버그 옵션 정리. 네이티브를 모르는 순수 함수
- `ads/consent.ts` - `AdsConsent` 호출 어댑터와 결과 스토어 (`consent.web.ts` 는 웹 스텁)
- `ads/AdBanner.tsx` - `enabled` 프롭으로 동의 판정 전 배너 요청을 막는다

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
