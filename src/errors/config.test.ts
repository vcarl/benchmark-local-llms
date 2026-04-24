import { ParseResult, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ConfigError,
  SchemaDecodeError,
  UnknownConstraintCheck,
  UnknownSystemPrompt,
  YamlParseError,
} from "./config.js";

describe("ConfigError", () => {
  it("carries tag, path, and message", () => {
    const e = new ConfigError({
      path: "models.yaml",
      message: "artifact missing",
    });
    expect(e._tag).toBe("ConfigError");
    expect(e.path).toBe("models.yaml");
  });
});

describe("YamlParseError", () => {
  it("carries tag and cause", () => {
    const e = new YamlParseError({
      filePath: "prompts/p.yaml",
      cause: "unexpected token",
    });
    expect(e._tag).toBe("YamlParseError");
    expect(e.filePath).toBe("prompts/p.yaml");
  });
});

describe("SchemaDecodeError", () => {
  it("carries tag, typeName, and a ParseError cause", () => {
    // Generate a real ParseError by decoding a bad value through a simple schema.
    const decode = Schema.decodeUnknownEither(Schema.Struct({ x: Schema.String }));
    const result = decode({ x: 42 });
    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") return;
    const parseErr = result.left;
    const e = new SchemaDecodeError({
      typeName: "MyStruct",
      cause: parseErr,
    });
    expect(e._tag).toBe("SchemaDecodeError");
    expect(e.typeName).toBe("MyStruct");
    expect(ParseResult.isParseError(e.cause)).toBe(true);
  });
});

describe("UnknownSystemPrompt", () => {
  it("carries tag, key, and availableKeys", () => {
    const e = new UnknownSystemPrompt({
      key: "not_a_key",
      availableKeys: ["direct", "cot", "code_direct"],
    });
    expect(e._tag).toBe("UnknownSystemPrompt");
    expect(e.availableKeys).toEqual(["direct", "cot", "code_direct"]);
  });
});

describe("UnknownConstraintCheck", () => {
  it("carries tag and check name", () => {
    const e = new UnknownConstraintCheck({ check: "bogus_check" });
    expect(e._tag).toBe("UnknownConstraintCheck");
    expect(e.check).toBe("bogus_check");
  });
});
