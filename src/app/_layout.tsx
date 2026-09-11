import { Stack } from "expo-router";
import { useEffect } from "react";

import { ensureAdsConsent } from "@/kit/ads/consent";

export default function RootLayout() {
  // 앱 시작 시 1회. EEA/UK 사용자에게는 UMP 동의 폼이 뜨고, 그 외 지역은
  // NOT_REQUIRED 로 바로 끝난다. 결과는 kit 스토어에 저장돼 화면들이 구독한다.
  // 실패해도 예외를 던지지 않으므로 여기서 catch 하지 않는다.
  useEffect(() => {
    ensureAdsConsent();
    // 동의 폼을 실제로 띄워 확인하려면 개발 빌드에서 아래처럼 호출한다
    // (릴리스 빌드에서는 kit 이 debugGeography 를 무시한다):
    // ensureAdsConsent({ debugGeography: 'EEA', testDeviceIdentifiers: ['<기기 ID>'] });
  }, []);

  return <Stack />;
}
