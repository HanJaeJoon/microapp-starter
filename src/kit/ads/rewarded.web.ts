// 웹 빌드에서는 AdMob 네이티브 모듈을 번들에 포함하지 않는다 (AdBanner.web / consent.web 과 같다).
// 광고가 없으므로 언제나 모의 게이트로 폴백할 상태를 돌려준다.
// 순수 로직(rewardedState)은 네이티브를 모르므로 그대로 재사용한다.

import { useMemo } from 'react';

import {
  initialRewardedState,
  isBlocked,
  isUnavailable,
  type RewardedState,
  type UseRewardedAd,
  type UseRewardedAdOptions,
} from './rewardedState';

export * from './rewardedState';

const UNSUPPORTED: RewardedState = { status: 'unavailable', failures: 0, earned: false };

export function useRewardedAd(options: UseRewardedAdOptions): UseRewardedAd {
  const enabled = options.enabled ?? true;
  const state = useMemo(
    () => (enabled ? UNSUPPORTED : initialRewardedState(false)),
    [enabled]
  );
  return {
    state,
    ready: false,
    useMockGate: state.status === 'unavailable',
    unavailable: isUnavailable(state),
    blocked: isBlocked(state),
    show: () => {},
    reload: () => {},
  };
}
