import { describe, expect, it } from "vitest";
import { parseScorerContentTolerant } from "./parse-scorer-content.js";

// The two real corrupt scorer-content blobs left on disk by the pre-74c10cd
// serializer, where `optional(boolean) caseSensitive` serialized as the bare
// `undefined` token (invalid JSON). The fixed serializer omits the key entirely.
const CORRUPT_SET =
  '{"caseSensitive":undefined,"expected":["A","B","C","E"],"vocabulary":["A","B","C","D","E"]}';
const CORRUPT_ORDERED =
  '{"caseSensitive":undefined,"expected":["S","A","C","T"],"vocabulary":["S","A","B","C","T"]}';

describe("parseScorerContentTolerant", () => {
  it("returns valid JSON untouched (happy path)", () => {
    const raw = '{"type":"exact_match","expected":"4","extract":"(\\\\d+)"}';
    expect(parseScorerContentTolerant(raw)).toEqual({
      type: "exact_match",
      expected: "4",
      extract: "(\\d+)",
    });
  });

  it("recovers the real corrupt set_match blob with caseSensitive ABSENT", () => {
    expect(parseScorerContentTolerant(CORRUPT_SET)).toEqual({
      expected: ["A", "B", "C", "E"],
      vocabulary: ["A", "B", "C", "D", "E"],
    });
  });

  it("recovers the real corrupt ordered_match blob with caseSensitive ABSENT", () => {
    expect(parseScorerContentTolerant(CORRUPT_ORDERED)).toEqual({
      expected: ["S", "A", "C", "T"],
      vocabulary: ["S", "A", "B", "C", "T"],
    });
  });

  it("drops the undefined key (not set to null)", () => {
    const result = parseScorerContentTolerant(CORRUPT_SET) as Record<string, unknown>;
    expect("caseSensitive" in result).toBe(false);
  });

  it("does not alter a quoted string value containing the word undefined", () => {
    const arr = '{"expected":["undefined"]}';
    expect(parseScorerContentTolerant(arr)).toEqual({ expected: ["undefined"] });
    const note = '{"note":"value undefined here"}';
    expect(parseScorerContentTolerant(note)).toEqual({ note: "value undefined here" });
  });

  it("handles undefined value in the middle and at the last position", () => {
    expect(parseScorerContentTolerant('{"a":undefined,"b":1}')).toEqual({ b: 1 });
    expect(parseScorerContentTolerant('{"b":1,"a":undefined}')).toEqual({ b: 1 });
  });

  it("propagates the original parse failure when corruption is unrelated", () => {
    expect(() => parseScorerContentTolerant('{"a":1,,}')).toThrow();
  });
});
