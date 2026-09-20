import { describe, expect, it } from "vitest";
import { commonFreeIntervals } from "./free-intervals";

describe("commonFreeIntervals（AV-02）", () => {
  it("午间忙碌落在网格行之间时，空档不会被推荐跨越", () => {
    // 北大第 4 节止于 12:00、第 5 节起于 13:10；成员在 12:10–12:50 有忙碌
    const free = commonFreeIntervals([{ startMin: 730, endMin: 770 }], 480, 1290);
    expect(free).toEqual([
      { startMin: 480, endMin: 730 },
      { startMin: 770, endMin: 1290 },
    ]);
  });

  it("相邻节次之间有忙碌时，两侧空闲不合并", () => {
    const free = commonFreeIntervals([{ startMin: 600, endMin: 610 }], 480, 720);
    expect(free).toEqual([
      { startMin: 480, endMin: 600 },
      { startMin: 610, endMin: 720 },
    ]);
  });

  it("多名成员的忙碌先取并集再取补集", () => {
    const free = commonFreeIntervals([
      { startMin: 540, endMin: 660 },
      { startMin: 630, endMin: 750 },
      { startMin: 800, endMin: 830 },
    ], 480, 900);
    expect(free).toEqual([
      { startMin: 480, endMin: 540 },
      { startMin: 750, endMin: 800 },
      { startMin: 830, endMin: 900 },
    ]);
  });

  it("超出显示轴的忙碌被裁剪，轴外不出现在结果里", () => {
    const free = commonFreeIntervals([
      { startMin: 400, endMin: 500 },
      { startMin: 1200, endMin: 1400 },
    ], 480, 1290);
    expect(free).toEqual([{ startMin: 500, endMin: 1200 }]);
  });

  it("轴范围无效或全轴忙碌时返回空", () => {
    expect(commonFreeIntervals([], 600, 600)).toEqual([]);
    expect(commonFreeIntervals([{ startMin: 0, endMin: 1440 }], 480, 1290)).toEqual([]);
  });
});
