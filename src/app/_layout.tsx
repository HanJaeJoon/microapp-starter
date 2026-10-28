import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { ensureAdsConsent } from "@/kit/ads/consent";
import { useThemeColors } from "@/kit/theme";
import { THEME_OVERRIDES } from "@/lib/branding";

// 화면 본문이 자체 타이틀을 그리므로 네이티브 헤더는 끈다.
// 켜두면 라우트명("index")이 그대로 헤더에 노출된다.
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

  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

// headerShown: false 라 헤더가 상태바 공간을 확보해 주지 않고 앱은 edge-to-edge 로
// 그려지므로, 상단 인셋을 여기서 한 번 주고 배경색을 칠해 인셋 띠를 화면과 맞춘다.
function Shell() {
  const colors = useThemeColors(THEME_OVERRIDES);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* 지정하지 않으면 라이트 모드에서도 밝은 아이콘이 그려져 밝은 배경에 묻힌다 */}
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
