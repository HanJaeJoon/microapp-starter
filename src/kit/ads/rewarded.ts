// 보상형 광고 훅.
//
// 상태 전이는 rewardedState.ts 의 순수 함수가 갖고 있고, 여기는 네이티브 SDK 를
// 그 함수에 연결하는 얇은 배선이다 (consent.ts / consentLogic.ts 와 같은 구조).
//
// 사용법은 src/kit/README.md 참고. 광고 단위 ID 는 인자로 받고 문구/Alert 는 여기 두지 않는다.

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import {
  canShow,
  createRewardedReducer,
  initialRewardedState,
  isBlocked,
  isUnavailable,
  loadEffect,
  resolveRetryPolicy,
  shouldUseMockGate,
  type UseRewardedAd,
  type UseRewardedAdOptions,
} from './rewardedState';

export * from './rewardedState';

// Expo Go 에는 AdMob 네이티브 모듈이 없다 (AdBanner 와 같은 판정)
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** 광고 SDK 를 감싼 최소 인터페이스. 테스트/폴백에서 갈아끼울 수 있게 분리한다. */
type NativeRewarded = {
  load(): void;
  show(): void;
  dispose(): void;
};

type Handlers = {
  onLoaded(): void;
  onFailed(): void;
  onEarned(): void;
  onClosed(): void;
};

/**
 * 네이티브 보상형 광고를 만든다. 모듈이 없으면 null.
 *
 * Expo Go 에서는 이 모듈을 로드하는 순간 크래시가 나므로 지연 require 한다
 * (kit/ads/AdBanner 와 같은 방식).
 */
function createNativeRewarded(
  productionUnitId: string | undefined,
  handlers: Handlers
): NativeRewarded | null {
  if (isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ads = require('react-native-google-mobile-ads');
    const { RewardedAd, RewardedAdEventType, AdEventType, TestIds } = ads;

    // 개발 빌드이거나 단위 ID 가 없으면 구글 공식 테스트 광고. 실광고 오클릭 사고 방지.
    const unitId = __DEV__ || !productionUnitId ? TestIds.REWARDED : productionUnitId;
    const ad = RewardedAd.createForAdRequest(unitId);

    const unsubscribers: (() => void)[] = [
      ad.addAdEventListener(RewardedAdEventType.LOADED, handlers.onLoaded),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, handlers.onEarned),
      ad.addAdEventListener(AdEventType.CLOSED, handlers.onClosed),
      ad.addAdEventListener(AdEventType.ERROR, handlers.onFailed),
    ];

    return {
      load: () => ad.load(),
      show: () => ad.show(),
      dispose: () => {
        for (const off of unsubscribers) off();
      },
    };
  } catch {
    // 모듈이 없거나 초기화에 실패하면 모의 게이트로 폴백한다.
    return null;
  }
}

/**
 * 보상형 광고 한 개를 로드해 두고 필요할 때 보여준다.
 *
 * 광고 객체는 1회용이라 닫히면 곧바로 다음 것을 로드한다.
 * 로드에 실패하면 지수 백오프로 다시 시도하고, 상한까지 실패하면 'exhausted' 로 멈춘다.
 */
export function useRewardedAd(options: UseRewardedAdOptions): UseRewardedAd {
  const {
    productionUnitId,
    enabled = true,
    maxRetries,
    retryBaseDelayMs,
    retryMaxDelayMs,
  } = options;

  const policy = useMemo(
    () =>
      resolveRetryPolicy({
        ...(maxRetries === undefined ? {} : { maxRetries }),
        ...(retryBaseDelayMs === undefined ? {} : { baseDelayMs: retryBaseDelayMs }),
        ...(retryMaxDelayMs === undefined ? {} : { maxDelayMs: retryMaxDelayMs }),
      }),
    [maxRetries, retryBaseDelayMs, retryMaxDelayMs]
  );
  const reducer = useMemo(() => createRewardedReducer(policy), [policy]);

  const [state, dispatch] = useReducer(reducer, enabled, initialRewardedState);
  const adRef = useRef<NativeRewarded | null>(null);
  const onRewardRef = useRef(options.onReward);

  useEffect(() => {
    onRewardRef.current = options.onReward;
  }, [options.onReward]);

  useEffect(() => {
    // 동의 판정 전/거부 상태에서는 광고 객체를 만들지 않는다. 리스너도 붙지 않는다.
    if (!enabled) {
      dispatch({ type: 'disabled' });
      return;
    }
    const ad = createNativeRewarded(productionUnitId, {
      onLoaded: () => dispatch({ type: 'loaded' }),
      onFailed: () => dispatch({ type: 'loadFailed' }),
      onEarned: () => {
        dispatch({ type: 'earned' });
        onRewardRef.current();
      },
      onClosed: () => dispatch({ type: 'closed' }),
    });
    adRef.current = ad;
    if (!ad) {
      dispatch({ type: 'unsupported' });
      return;
    }
    // 새 객체를 붙였으니 상태도 처음부터. 실제 load() 는 아래의 상태 이펙트가 부른다.
    dispatch({ type: 'attach' });
    return () => {
      ad.dispose();
      adRef.current = null;
    };
  }, [enabled, productionUnitId]);

  // 로드 실패 후 재시도, 그리고 광고를 닫은 뒤의 재로드.
  // 재시도 타이머는 dispatch 만 하고, 실제 load() 는 그 결과로 다시 도는
  // 이 이펙트가 한 번만 부른다 (loadEffect 주석 참고).
  const { status, failures } = state;
  useEffect(() => {
    const ad = adRef.current;
    if (!ad) return;
    const action = loadEffect(status, failures, policy);
    if (action.kind === 'load') {
      ad.load();
      return;
    }
    if (action.kind === 'retry') {
      const id = setTimeout(() => dispatch({ type: 'load' }), action.delayMs);
      return () => clearTimeout(id);
    }
  }, [status, failures, policy]);

  const show = useCallback(() => {
    const ad = adRef.current;
    if (!ad || !canShow(state)) return;
    dispatch({ type: 'show' });
    ad.show();
  }, [state]);

  const reload = useCallback(() => {
    dispatch({ type: 'load' });
  }, []);

  return {
    state,
    ready: canShow(state),
    useMockGate: shouldUseMockGate(state),
    unavailable: isUnavailable(state),
    blocked: isBlocked(state),
    show,
    reload,
  };
}
