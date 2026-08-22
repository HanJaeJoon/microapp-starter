import { assertLegendLength, hexToRgba } from '../chart/ThemedLineChart';

describe('assertLegendLength', () => {
  it('legend 가 없으면 통과한다', () => {
    expect(() => assertLegendLength(undefined, 0)).not.toThrow();
    expect(() => assertLegendLength(undefined, 2)).not.toThrow();
  });

  it('legend 길이가 datasetCount 이하면 통과한다', () => {
    expect(() => assertLegendLength([], 0)).not.toThrow();
    expect(() => assertLegendLength(['a'], 0)).not.toThrow();
    expect(() => assertLegendLength(['a'], 1)).not.toThrow();
    expect(() => assertLegendLength(['a', 'b'], 1)).not.toThrow();
  });

  it('legend 길이가 datasetCount 보다 길면 throw 한다', () => {
    expect(() => assertLegendLength(['a', 'b'], 0)).toThrow(
      'ThemedLineChart: legend length exceeds dataset count',
    );
    expect(() => assertLegendLength(['a', 'b', 'c'], 1)).toThrow(
      'ThemedLineChart: legend length exceeds dataset count',
    );
  });
});

describe('hexToRgba', () => {
  it('#RRGGBB 를 rgba 로 변환한다', () => {
    expect(hexToRgba('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(hexToRgba('#FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)');
    expect(hexToRgba('#1a2b3c', 0.9)).toBe('rgba(26, 43, 60, 0.9)');
  });

  it('#RRGGBB 가 아니면 throw 한다', () => {
    expect(() => hexToRgba('000000', 1)).toThrow('ThemedLineChart: color must be #RRGGBB');
    expect(() => hexToRgba('#FFF', 1)).toThrow('ThemedLineChart: color must be #RRGGBB');
    expect(() => hexToRgba('#fffffff', 1)).toThrow('ThemedLineChart: color must be #RRGGBB');
    expect(() => hexToRgba('rgb(0,0,0)', 1)).toThrow('ThemedLineChart: color must be #RRGGBB');
    expect(() => hexToRgba('red', 1)).toThrow('ThemedLineChart: color must be #RRGGBB');
    expect(() => hexToRgba('#GGGGGG', 1)).toThrow('ThemedLineChart: color must be #RRGGBB');
  });
});
