import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

// 공유 시트를 지원하는 환경인지 (웹 일부/시뮬레이터에서 미지원)
export function useShareAvailability(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    Sharing.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);
  return available;
}

// fileName 을 주면 캡처 임시 파일(ReactNative-snapshot-image....png)을
// 캐시 디렉터리에 그 이름으로 옮겨, 공유/저장 시 사용자에게 보이는 파일명을 정한다.
//
// expo-file-system 은 saveImageToLibrary 의 expo-media-library 와 같은 이유로
// 함수 안에서 지연 require 한다 (웹 번들이 로드 시점에 네이티브 모듈을 평가하지
// 않게). fileName 이 없으면 require 자체가 실행되지 않는다.
export async function captureCard(
  ref: React.RefObject<View | null>,
  fileName?: string
): Promise<string> {
  const uri = await captureRef(ref, { format: 'png', quality: 1 });
  const captured = uri.startsWith('file') ? uri : `file://${uri}`;
  if (!fileName) return captured;
  const { File, Paths } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-file-system') as typeof import('expo-file-system');
  const dest = new File(Paths.cache, fileName);
  await new File(captured).move(dest, { overwrite: true });
  return dest.uri;
}

export async function shareImage(uri: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'image/png' });
}

// 권한이 거부되면 'denied'를 반환한다. 사용자 안내 문구는 앱이 번역해 표시한다.
//
// expo-media-library 는 웹 구현이 없다 (SDK 57 의 ExpoMediaLibraryNext 네이티브 모듈).
// 최상위에서 import 하면 웹 번들이 로드되는 순간 throw 해서 앱 전체가 빈 화면이 된다.
// kit/ads 가 Expo Go 를 다루는 것과 같은 방식으로 여기서 지연 require 한다.
// 웹에서 이 함수를 호출하면 throw 하며, 호출부의 try/catch 가 받는다.
//
// SDK 57 에서 saveToLibraryAsync 는 메인 엔트리에서 호출 즉시 throw 하는
// deprecated 스텁이 됐다. 새 클래스 API 인 Asset.create() 를 쓴다.
// Android 네이티브 구현이 filePath.toFile() 을 쓰므로 인자는 file:// 스킴
// URI 여야 한다. captureCard 가 이미 file:// 로 정규화해 반환한다.
export async function saveImageToLibrary(uri: string): Promise<'saved' | 'denied'> {
  const { Asset, requestPermissionsAsync } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-media-library') as typeof import('expo-media-library');
  const { granted } = await requestPermissionsAsync(true);
  if (!granted) return 'denied';
  await Asset.create(uri);
  return 'saved';
}
