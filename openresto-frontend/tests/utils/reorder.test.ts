import { moveId } from "@/utils/reorder";

describe("moveId", () => {
  it("swaps an entry with the one above it", () => {
    expect(moveId([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
  });

  it("swaps an entry with the one below it", () => {
    expect(moveId([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
  });

  it("does not move the first entry up", () => {
    expect(moveId([1, 2, 3], 0, -1)).toBeNull();
  });

  it("does not move the last entry down", () => {
    expect(moveId([1, 2, 3], 2, 1)).toBeNull();
  });

  it("refuses an index outside the list", () => {
    expect(moveId([1, 2, 3], 3, -1)).toBeNull();
    expect(moveId([1, 2, 3], -1, 1)).toBeNull();
  });

  it("moves string ids too, as the gallery's photo tokens are", () => {
    expect(moveId(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b", "c"], 2, 1)).toBeNull();
  });

  it("leaves the original list as it was", () => {
    const ids = [1, 2, 3];
    moveId(ids, 0, 1);
    expect(ids).toEqual([1, 2, 3]);
  });
});
