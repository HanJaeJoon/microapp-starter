import {
  DEFAULT_RETRY_POLICY,
  INITIAL_REWARDED_STATE,
  canShow,
  createRewardedReducer,
  initialRewardedState,
  isBlocked,
  isUnavailable,
  loadEffect,
  resolveRetryPolicy,
  retryDelayMs,
  rewardedReducer,
  shouldUseMockGate,
  type RetryPolicy,
  type RewardedEvent,
  type RewardedState,
} from '../ads/rewardedState';

function run(events: RewardedEvent[], from: RewardedState = INITIAL_REWARDED_STATE) {
  return events.reduce(rewardedReducer, from);
}

describe('보상형 광고 상태 기계', () => {
  it('처음에는 로드 중이고 보여줄 수 없다', () => {
    expect(INITIAL_REWARDED_STATE.status).toBe('loading');
    expect(canShow(INITIAL_REWARDED_STATE)).toBe(false);
    expect(shouldUseMockGate(INITIAL_REWARDED_STATE)).toBe(false);
    expect(isUnavailable(INITIAL_REWARDED_STATE)).toBe(false);
  });

  it('로드가 끝나면 보여줄 수 있다', () => {
    const s = run([{ type: 'loaded' }]);
    expect(s.status).toBe('ready');
    expect(canShow(s)).toBe(true);
  });

  it('표시 -> 보상 -> 닫힘 이면 보상을 받고 다시 로드로 돌아간다', () => {
    const shown = run([{ type: 'loaded' }, { type: 'show' }]);
    expect(shown.status).toBe('showing');
    const earned = rewardedReducer(shown, { type: 'earned' });
    expect(earned.earned).toBe(true);
    const closed = rewardedReducer(earned, { type: 'closed' });
    expect(closed.status).toBe('loading');
    expect(closed.earned).toBe(false);
  });

  it('보상 없이 닫으면 보상이 남지 않는다', () => {
    const s = run([{ type: 'loaded' }, { type: 'show' }, { type: 'closed' }]);
    expect(s.earned).toBe(false);
    expect(s.status).toBe('loading');
  });

  it('준비되지 않았는데 표시를 요청하면 무시한다', () => {
    expect(run([{ type: 'show' }]).status).toBe('loading');
    expect(run([{ type: 'loadFailed' }, { type: 'show' }]).status).toBe('error');
  });

  it('표시 중이 아닐 때 온 보상 이벤트는 인정하지 않는다 (중복 지급 방지)', () => {
    expect(run([{ type: 'loaded' }, { type: 'earned' }]).earned).toBe(false);
    const twice = run([
      { type: 'loaded' },
      { type: 'show' },
      { type: 'earned' },
      { type: 'closed' },
      { type: 'earned' },
    ]);
    expect(twice.earned).toBe(false);
  });

  it('로드 실패는 error 로 가고 실패 횟수를 센다', () => {
    const s = run([{ type: 'loadFailed' }, { type: 'load' }, { type: 'loadFailed' }]);
    expect(s.status).toBe('error');
    expect(s.failures).toBe(2);
  });

  it('로드에 성공하면 실패 횟수가 0 으로 돌아간다', () => {
    const s = run([{ type: 'loadFailed' }, { type: 'loadFailed' }, { type: 'loaded' }]);
    expect(s.failures).toBe(0);
    expect(s.status).toBe('ready');
  });

  it('네이티브 모듈이 없으면 모의 게이트를 쓰고 이후 이벤트에 흔들리지 않는다', () => {
    const s = run([{ type: 'unsupported' }]);
    expect(shouldUseMockGate(s)).toBe(true);
    expect(run([{ type: 'load' }, { type: 'loaded' }, { type: 'loadFailed' }], s)).toEqual(s);
  });

  it('표시 중에는 다시 로드하지 않는다 (같은 광고 객체를 재사용한다)', () => {
    const shown = run([{ type: 'loaded' }, { type: 'show' }]);
    expect(rewardedReducer(shown, { type: 'load' })).toEqual(shown);
  });

  it('새 광고 객체를 붙이면 상태가 처음으로 돌아간다', () => {
    const failed = run([{ type: 'loadFailed' }, { type: 'loadFailed' }]);
    expect(rewardedReducer(failed, { type: 'attach' })).toEqual(INITIAL_REWARDED_STATE);
  });
});

describe('동의 게이트 (enabled)', () => {
  it('enabled=false 로 시작하면 로드 중을 거치지 않고 blocked 다', () => {
    const s = initialRewardedState(false);
    expect(s.status).toBe('blocked');
    expect(isBlocked(s)).toBe(true);
    expect(canShow(s)).toBe(false);
    expect(shouldUseMockGate(s)).toBe(false);
    expect(isUnavailable(s)).toBe(false);
    expect(initialRewardedState(true)).toEqual(INITIAL_REWARDED_STATE);
  });

  it('blocked 상태에서는 로드/로드 결과 이벤트를 모두 무시한다', () => {
    const blocked = initialRewardedState(false);
    expect(run([{ type: 'load' }, { type: 'loaded' }, { type: 'loadFailed' }], blocked)).toEqual(
      blocked
    );
    expect(loadEffect(blocked.status, blocked.failures).kind).toBe('none');
  });

  it('동의가 철회되면 어떤 상태에서든 blocked 로 간다', () => {
    const ready = run([{ type: 'loaded' }]);
    expect(rewardedReducer(ready, { type: 'disabled' }).status).toBe('blocked');
    const failed = run([{ type: 'loadFailed' }]);
    expect(rewardedReducer(failed, { type: 'disabled' })).toEqual(initialRewardedState(false));
  });

  it('동의를 받아 광고 객체가 붙으면 그때 로드가 시작된다', () => {
    const s = rewardedReducer(initialRewardedState(false), { type: 'attach' });
    expect(s.status).toBe('loading');
    expect(loadEffect(s.status, s.failures).kind).toBe('load');
  });
});

describe('재시도 상한 (exhausted)', () => {
  it('기본 정책은 재시도 3회이고 그 뒤에는 광고를 쓸 수 없다', () => {
    expect(DEFAULT_RETRY_POLICY.maxRetries).toBe(3);
    let s = INITIAL_REWARDED_STATE;
    for (let i = 0; i < DEFAULT_RETRY_POLICY.maxRetries; i++) {
      s = run([{ type: 'loadFailed' }, { type: 'load' }], s);
      expect(s.status).toBe('loading');
    }
    s = rewardedReducer(s, { type: 'loadFailed' });
    expect(s.status).toBe('exhausted');
    expect(isUnavailable(s)).toBe(true);
    expect(canShow(s)).toBe(false);
    expect(loadEffect(s.status, s.failures).kind).toBe('none');
  });

  it('상한 뒤의 수동 재시도는 실패 횟수를 지우고 다시 로드한다', () => {
    const exhausted = run([
      { type: 'loadFailed' },
      { type: 'loadFailed' },
      { type: 'loadFailed' },
      { type: 'loadFailed' },
    ]);
    expect(exhausted.status).toBe('exhausted');
    const retried = rewardedReducer(exhausted, { type: 'load' });
    expect(retried).toEqual(INITIAL_REWARDED_STATE);
  });

  it('상한은 옵션으로 조절한다', () => {
    const once = createRewardedReducer(resolveRetryPolicy({ maxRetries: 1 }));
    const first = once(INITIAL_REWARDED_STATE, { type: 'loadFailed' });
    expect(first.status).toBe('error');
    expect(once(first, { type: 'loadFailed' }).status).toBe('exhausted');

    const never = createRewardedReducer(resolveRetryPolicy({ maxRetries: 0 }));
    expect(never(INITIAL_REWARDED_STATE, { type: 'loadFailed' }).status).toBe('exhausted');
  });

  it('기본값은 지정한 항목만 덮어쓴다', () => {
    expect(resolveRetryPolicy()).toEqual(DEFAULT_RETRY_POLICY);
    expect(resolveRetryPolicy({ maxDelayMs: 5_000 })).toEqual({
      ...DEFAULT_RETRY_POLICY,
      maxDelayMs: 5_000,
    });
  });
});

describe('재시도 백오프', () => {
  it('실패가 없으면 지연이 없다', () => {
    expect(retryDelayMs(0)).toBe(0);
  });

  it('지수로 늘고 30초에서 멈춘다', () => {
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(2)).toBe(4000);
    expect(retryDelayMs(3)).toBe(8000);
    expect(retryDelayMs(4)).toBe(16000);
    expect(retryDelayMs(5)).toBe(30000);
    expect(retryDelayMs(50)).toBe(30000);
  });

  it('단조 증가한다', () => {
    for (let n = 1; n < 20; n++) {
      expect(retryDelayMs(n + 1)).toBeGreaterThanOrEqual(retryDelayMs(n));
    }
  });

  it('정책을 주면 그 간격을 쓴다 (예: 30초 고정)', () => {
    const fixed: RetryPolicy = { maxRetries: 3, baseDelayMs: 30_000, maxDelayMs: 30_000 };
    expect(retryDelayMs(1, fixed)).toBe(30_000);
    expect(retryDelayMs(3, fixed)).toBe(30_000);
  });
});

/**
 * 리듀서 + 이펙트 흐름 시뮬레이터.
 *
 * 훅을 렌더하지 않고도 "상태가 바뀌면 이펙트가 다시 돈다" 는 React 의 규칙을
 * 그대로 흉내낸다. 이펙트 의존성은 실제 훅과 같이 [status, failures] 이고,
 * 값이 바뀌었을 때만 다시 돈다. 재시도 타이머는 fireRetry() 로 직접 돌린다.
 */
function createDriver(policy: RetryPolicy = DEFAULT_RETRY_POLICY, enabled = true) {
  const reducer = createRewardedReducer(policy);
  let state = initialRewardedState(enabled);
  let lastDeps: string | null = null;
  let pendingRetry: (() => void) | null = null;
  let loads = 0;

  function runEffect() {
    const deps = state.status + '|' + state.failures;
    if (deps === lastDeps) return;
    lastDeps = deps;
    pendingRetry = null; // 정리 함수: 이전 타이머 취소
    const action = loadEffect(state.status, state.failures, policy);
    if (action.kind === 'load') loads++;
    if (action.kind === 'retry') pendingRetry = () => send({ type: 'load' });
  }

  function send(event: RewardedEvent) {
    state = reducer(state, event);
    runEffect();
  }

  runEffect(); // 첫 마운트
  return {
    send,
    /** 재시도 타이머 만료. */
    fireRetry() {
      const fn = pendingRetry;
      pendingRetry = null;
      if (!fn) throw new Error('대기 중인 재시도 타이머가 없다');
      fn();
    },
    hasRetry: () => pendingRetry !== null,
    loads: () => loads,
    state: () => state,
  };
}

describe('로드 호출 경로', () => {
  it('마운트 직후 loading 이면 load 를 한 번만 부른다', () => {
    const d = createDriver();
    expect(d.loads()).toBe(1);
  });

  it('로드 실패 후 재시도 한 번에 load 도 한 번만 걸린다', () => {
    const d = createDriver();
    expect(d.loads()).toBe(1);
    d.send({ type: 'loadFailed' });
    expect(d.loads()).toBe(1); // error 상태에서는 로드하지 않는다
    expect(d.hasRetry()).toBe(true);
    d.fireRetry();
    expect(d.loads()).toBe(2); // 재시도 1회 = load 1회
  });

  it('실패/재시도를 반복해도 loading 전이 1회당 load 1회이고 상한에서 멈춘다', () => {
    const d = createDriver();
    let transitions = 1; // 마운트의 loading
    for (let i = 0; i < DEFAULT_RETRY_POLICY.maxRetries; i++) {
      d.send({ type: 'loadFailed' });
      d.fireRetry();
      transitions++;
    }
    expect(d.loads()).toBe(transitions);
    d.send({ type: 'loadFailed' });
    expect(d.state().status).toBe('exhausted');
    expect(d.hasRetry()).toBe(false); // 더 이상 타이머를 걸지 않는다
    expect(d.loads()).toBe(transitions);
  });

  it('광고를 닫으면 재로드가 정확히 한 번 걸린다', () => {
    const d = createDriver();
    d.send({ type: 'loaded' });
    expect(d.loads()).toBe(1); // ready 로 가도 추가 로드는 없다
    d.send({ type: 'show' });
    d.send({ type: 'earned' });
    d.send({ type: 'closed' });
    expect(d.loads()).toBe(2);
  });

  it('ready / showing 상태에서는 로드하지 않는다', () => {
    const d = createDriver();
    d.send({ type: 'loaded' });
    d.send({ type: 'show' });
    d.send({ type: 'earned' });
    expect(d.loads()).toBe(1);
    expect(d.hasRetry()).toBe(false);
  });

  it('네이티브 모듈이 없으면 한 번도 로드하지 않는다', () => {
    const d = createDriver();
    // 마운트 이펙트가 이미 1회 돌았지만, unsupported 이후로는 더 늘지 않는다
    const before = d.loads();
    d.send({ type: 'unsupported' });
    d.send({ type: 'load' });
    d.send({ type: 'loaded' });
    expect(d.loads()).toBe(before);
    expect(d.state().status).toBe('unavailable');
  });

  it('enabled=false 로 시작하면 로드하지 않고, 동의 뒤에야 로드한다', () => {
    const d = createDriver(DEFAULT_RETRY_POLICY, false);
    expect(d.loads()).toBe(0);
    d.send({ type: 'attach' }); // 동의를 받아 광고 객체를 붙였다
    expect(d.loads()).toBe(1);
    d.send({ type: 'disabled' }); // 동의 철회
    expect(d.loads()).toBe(1);
    expect(d.state().status).toBe('blocked');
  });
});
