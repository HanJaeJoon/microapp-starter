import React from 'react';
import { ViewStyle } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { ThemeColors } from '../theme';

export function ThemedLineChart(props: {
  labels: string[];
  values: number[];
  /**
   * 주 계열과 함께 그릴 추가 계열. 방식별 비교처럼 여러 곡선을 겹칠 때 쓴다.
   * 색은 앱이 지정한다 - kit 은 브랜드 색 외의 팔레트를 모른다.
   */
  extraSeries?: { values: number[]; color: string }[];
  /** 계열 이름. 주 계열부터 extraSeries 순서로 대응한다. */
  legend?: string[];
  width: number;
  height?: number;
  yAxisSuffix?: string;
  brandColor: string;
  colors: ThemeColors;
  // react-native-chart-kit의 style prop은 Partial<ViewStyle>만 받는다 (StyleProp 불가)
  style?: Partial<ViewStyle>;
  /** 점을 숨긴다. 회차가 많아 점이 뭉개질 때 쓴다. */
  hideDots?: boolean;
}) {
  const { colors, brandColor } = props;

  const datasets = [
    {
      data: props.values,
      color: (opacity = 1) => hexToRgba(brandColor, opacity),
    },
    ...(props.extraSeries ?? []).map((series) => ({
      data: series.values,
      color: (opacity = 1) => hexToRgba(series.color, opacity),
    })),
  ];

  return (
    <LineChart
      data={{ labels: props.labels, datasets, legend: props.legend }}
      width={props.width}
      height={props.height ?? 220}
      yAxisSuffix={props.yAxisSuffix ?? ''}
      yAxisInterval={1}
      withDots={!props.hideDots}
      chartConfig={{
        backgroundColor: colors.card,
        backgroundGradientFrom: colors.card,
        backgroundGradientTo: colors.card,
        decimalPlaces: 1,
        color: (opacity = 1) => hexToRgba(brandColor, opacity),
        labelColor: () => colors.subtext,
        propsForDots: { r: '4', strokeWidth: '2', stroke: brandColor },
        propsForBackgroundLines: { stroke: colors.chartGrid },
      }}
      bezier
      style={props.style}
    />
  );
}

// #RRGGBB -> rgba(r, g, b, a)
function hexToRgba(hex: string, opacity: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
