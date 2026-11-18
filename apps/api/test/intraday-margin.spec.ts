import { intradayMargin } from '../src/trading/margin';

describe('fixed intraday margin per lot', () => {
  it('uses separate Mini and Mega rupee amounts and scales by lots', () => {
    expect(intradayMargin(1, 'MINI', 1000, 10000)).toBe(100000n);
    expect(intradayMargin(2, 'MINI', 1000, 10000)).toBe(200000n);
    expect(intradayMargin(2, 'MEGA', 1000, 10000)).toBe(2000000n);
  });
  it('preserves paise and releases all margin for a flat position', () => {
    expect(intradayMargin(3, 'MINI', 1000.25, 10000)).toBe(300075n);
    expect(intradayMargin(0, 'MEGA', 1000, 10000)).toBe(0n);
    expect(intradayMargin(-3, 'MINI', 1000.25, 10000)).toBe(300075n);
  });
  it('uses the existing Mini classification for instruments without a Mega designation', () => {
    expect(intradayMargin(2, undefined, 1000, 10000)).toBe(200000n);
  });
});
