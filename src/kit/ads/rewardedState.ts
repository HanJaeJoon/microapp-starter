// 보상형 광고의 상태 기계. 네이티브 모듈을 모르는 순수 함수라 테스트할 수 있다.
//
// 광고 SDK 는 콜백으로만 말을 걸어오고(로드 완료/실패/보상/닫힘) 순서가 기기마다
// 다르다. 그 순서를 화면 코드에 흩어 두면 "보상을 두 번 주는" 류의 버그가 생긴다.
// 여기서 전이를 한곳에 모으고 화면은 status 만 본다.
//
// 이 파일은 react-native-google-mobile-ads 를 import 하지 않는다 (consentLogic.ts 와 같은 규칙).
// 네이티브 호출은 rewarded.ts 의 얇은 어댑터가 담당한다.

export type RewardedStatus =
  /** 동의 게이트 등으로 아직 광고를 요청하지 않는다 (enabled=false). 로드/리스너 없음. */
  | 'blocked'
  /** 네이티브 모듈이 없다 (Expo Go/웹 등). 모의 게이트로 폴백한다. */
  | 'unavailable'
  /** 로드 중. 버튼은 눌리지 않는다. */
  | 'loading'
  /** 로드 완료. 보여줄 수 있다. */
  | 'ready'
  /** 표시 중. 사용자가 닫을 때까지 기다린다. */
  | 'showing'
  /** 로드 실패. 백오프 후 다시 로드한다. */
  | 'error'
  /** 재시도 상한까지 모두 실패. 더 로드하지 않는다 ("광고를 사용할 수 없습니다"). */
  | 'exhausted';

export type RewardedState = {
  status: RewardedStatus;
  /** 연속 로드 실패 횟수. 재시도 지연/상한 계산에 쓴다. 로드 성공 시 0 으로 돌아간다. */
  failures: number;
  /** 이번 표시에서 보상 조건을 채웠는지. 닫힐 때 소비하고 지운다. */
  earned: boolean;
};

export type RewardedEvent =
  /** 새 광고 객체를 붙였다 (마운트/재활성화). 처음부터 다시 로드한다. */
  | { type: 'attach' }
  /** enabled=false 가 됐다. 광고 객체는 호출부가 정리한다. */
  | { type: 'disabled' }
  | { type: 'unsupported' }
  | { type: 'load' }
  | { type: 'loaded' }
  | { type: 'loadFailed' }
  | { type: 'show' }
  | { type: 'earned' }
  | { type: 'closed' };

/** 재시도 정책. 앱이 옵션으로 조절한다. */
export type RetryPolicy = {
  /** 최초 로드 실패 뒤 몇 번까지 다시 시도할지. 모두 실패하면 'exhausted'. */
  maxRetries: number;
  /** 첫 재시도 지연 (이후 지수로 늘어난다). */
  baseDelayMs: number;
  /** 재시도 지연 상한. */
  maxDelayMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 2_000,
  maxDelayMs: 30_000,
};

export function resolveRetryPolicy(policy?: Partial<RetryPolicy>): RetryPolicy {
  return { ...DEFAULT_RETRY_POLICY, ...policy };
}

export const INITIAL_REWARDED_STATE: RewardedState = {
  status: 'loading',
  failures: 0,
  earned: false,
};

/**
 * 마운트 시점의 상태. enabled=false 로 시작하면 'loading' 을 한 번 스치지 않고
 * 곧바로 'blocked' 이다 (동의 판정 전에 버튼이 깜빡이지 않도록).
 */
export function initialRewardedState(enabled: boolean): RewardedState {
  return enabled ? INITIAL_REWARDED_STATE : { status: 'blocked', failures: 0, earned: false };
}

/** 재시도 지연. 지수 백오프하되 상한에서 멈춘다. */
export function retryDelayMs(failures: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  if (failures <= 0) return 0;
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (failures - 1));
}

/** 실패 횟수가 상한을 넘었는지 (넘으면 더 재시도하지 않는다). */
export function isExhausted(failures: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): boolean {
  return failures > policy.maxRetries;
}

/**
 * 정책이 들어간 리듀서를 만든다. 재시도 상한이 앱마다 다를 수 있어 리듀서를
 * 정책으로 감싼다. 정책을 안 주면 DEFAULT_RETRY_POLICY 를 쓰는 rewardedReducer 와 같다.
 */
export function createRewardedReducer(policy: RetryPolicy = DEFAULT_RETRY_POLICY) {
  return function reducer(state: RewardedState, event: RewardedEvent): RewardedState {
    switch (event.type) {
      case 'attach':
        // 새 광고 객체가 붙었으므로 이전 객체 기준의 상태는 버린다.
        return { status: 'loading', failures: 0, earned: false };

      case 'disabled':
        return { status: 'blocked', failures: 0, earned: false };

      case 'unsupported':
        return { status: 'unavailable', failures: 0, earned: false };

      case 'load':
        // 광고를 요청하지 않는 상태에서는 로드하지 않는다.
        if (state.status === 'blocked' || state.status === 'unavailable') return state;
        // 표시 중에 다시 로드하지 않는다 (같은 광고 객체를 재사용하므로).
        if (state.status === 'showing') return state;
        // 상한까지 실패한 뒤의 'load' 는 앱이 부른 수동 재시도다. 실패 횟수를 지운다.
        if (state.status === 'exhausted') return { status: 'loading', failures: 0, earned: false };
        return { ...state, status: 'loading', earned: false };

      case 'loaded':
        if (state.status === 'blocked' || state.status === 'unavailable') return state;
        return { status: 'ready', failures: 0, earned: state.earned };

      case 'loadFailed': {
        if (state.status === 'blocked' || state.status === 'unavailable') return state;
        const failures = state.failures + 1;
        return {
          status: isExhausted(failures, policy) ? 'exhausted' : 'error',
          failures,
          earned: false,
        };
      }

      case 'show':
        // 준비되지 않았으면 표시 요청을 무시한다.
        if (state.status !== 'ready') return state;
        return { ...state, status: 'showing', earned: false };

      case 'earned':
        // 표시 중에 온 보상만 인정한다. 그래야 보상을 두 번 주지 않는다.
        if (state.status !== 'showing') return state;
        return { ...state, earned: true };

      case 'closed':
        if (state.status !== 'showing') return state;
        // 광고 객체는 1회용이라 닫히면 곧바로 다음 것을 로드한다.
        return { status: 'loading', failures: 0, earned: false };
    }
  };
}

export const rewardedReducer = createRewardedReducer();

/**
 * 상태가 바뀐 뒤 해야 할 로드 동작.
 *
 * 실제 load() 를 부르는 경로를 여기 하나로 모은다. 재시도 타이머가 직접
 * load() 를 부르면, 그 타이머가 dispatch 한 'load' 로 상태가 다시 바뀌면서
 * 이 경로가 또 실행돼 재시도 1회에 load 가 두 번 걸린다.
 * 타이머는 dispatch 만 하고 load 는 항상 이 결과를 보고 한 번만 부른다.
 */
export type LoadAction = { kind: 'none' } | { kind: 'load' } | { kind: 'retry'; delayMs: number };

export function loadEffect(
  status: RewardedStatus,
  failures: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): LoadAction {
  if (status === 'error') return { kind: 'retry', delayMs: retryDelayMs(failures, policy) };
  if (status === 'loading') return { kind: 'load' };
  return { kind: 'none' };
}

/** 지금 광고를 보여줄 수 있는가. */
export function canShow(state: RewardedState): boolean {
  return state.status === 'ready';
}

/**
 * 모의 게이트(진행 바 등)로 폴백해야 하는가.
 *
 * 네이티브 모듈이 아예 없을 때만 폴백한다. 로드 실패는 재시도로 처리한다 -
 * 실패를 곧바로 무료 보상으로 바꾸면 광고를 안 보고도 보상을 얻는 길이 생긴다.
 */
export function shouldUseMockGate(state: RewardedState): boolean {
  return state.status === 'unavailable';
}

/**
 * 광고를 쓸 수 없다고 안내할 상태인가 ("광고를 사용할 수 없습니다").
 *
 * 재시도 상한까지 실패한 경우다. 'blocked'(동의 판정 전/거부)는 포함하지 않는다 -
 * 동의는 나중에 바뀔 수 있고, 거부를 최종 불가로 볼지는 앱이 정한다.
 * 거부도 같은 문구로 묶고 싶으면 `isUnavailable(state) || consentDenied` 로 합친다.
 */
export function isUnavailable(state: RewardedState): boolean {
  return state.status === 'exhausted';
}

/** 동의 게이트로 광고를 막아 둔 상태인가. */
export function isBlocked(state: RewardedState): boolean {
  return state.status === 'blocked';
}

// --- 훅 계약 -----------------------------------------------------------
// 훅의 옵션/반환 타입도 네이티브를 모른다. 여기 두면 웹 스텁(rewarded.web.ts)이
// 네이티브 파일을 import 하지 않고도 같은 계약을 구현할 수 있다.

export type UseRewardedAdOptions = {
  /** 릴리스 광고 단위 ID. 없으면 구글 테스트 단위를 쓴다. */
  productionUnitId?: string;
  /** 보상 조건을 채웠을 때. 광고가 닫히기 전에 불릴 수 있다. */
  onReward: () => void;
  /**
   * 광고를 요청해도 되는지 (UMP 동의 게이트). 기본 true.
   * false 이면 로드도 리스너 등록도 하지 않고 상태는 'blocked' 이다.
   * false -> true 로 바뀌면 그때 로드가 시작된다.
   */
  enabled?: boolean;
  /** 최초 로드 실패 뒤 재시도 횟수 (기본 3). 모두 실패하면 'exhausted'. */
  maxRetries?: number;
  /** 첫 재시도 지연 (기본 2000ms, 이후 지수로 늘어난다). */
  retryBaseDelayMs?: number;
  /** 재시도 지연 상한 (기본 30000ms). */
  retryMaxDelayMs?: number;
};

export type UseRewardedAd = {
  state: RewardedState;
  /** 광고를 보여줄 수 있는 상태인지. */
  ready: boolean;
  /** 네이티브 모듈이 없어 모의 게이트로 폴백해야 하는지. */
  useMockGate: boolean;
  /** 재시도 상한까지 실패해 "광고를 사용할 수 없습니다" 를 띄워야 하는지. */
  unavailable: boolean;
  /** enabled=false 라 아직 광고를 요청하지 않는 상태인지. */
  blocked: boolean;
  /** 광고를 띄운다. 준비되지 않았으면 아무 일도 하지 않는다. */
  show(): void;
  /** 상한까지 실패한 뒤 사용자가 다시 시도할 때. 실패 횟수를 지우고 다시 로드한다. */
  reload(): void;
};
