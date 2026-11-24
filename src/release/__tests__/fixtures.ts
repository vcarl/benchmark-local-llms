import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { chatMessages } from "../../llm/chat-completion.js";
import { bundleConfig } from "../../store/__tests__/fixtures.js";
import { digestOf } from "../../store/digest.js";
import { syncRelease } from "../release.js";

/** Challenge `math`: single-shot items `a` (2+2) and `b` (3*3), two-turn item `chain`. */
export const MATH_CHALLENGE = `id: math
version: 1
passThreshold: 1
items:
  - name: a
    category: math
    tier: 1
    prompt: What is 2+2?
    scorer: exact_match
    expected: "4"
    extract: (\\d+)
  - name: b
    category: math
    tier: 1
    prompt: What is 3*3?
    scorer: exact_match
    expected: "9"
    extract: (\\d+)
  - name: chain
    category: math
    tier: 1
    turns:
      - prompt: What is 1+1?
        answer: "2"
        scorer: exact_match
        expected: "2"
        extract: (\\d+)
      - prompt: Double it.
        answer: "4"
        scorer: exact_match
        expected: "4"
        extract: (\\d+)
`;

/** The messagesDigest a run sends for each item of {@link MATH_CHALLENGE}. */
export const MESSAGES_DIGEST: Readonly<Record<string, string>> = Object.fromEntries(
  (
    [
      ["math/a", "What is 2+2?", undefined],
      ["math/b", "What is 3*3?", undefined],
      ["math/chain#1", "What is 1+1?", undefined],
      [
        "math/chain#2",
        "Double it.",
        [
          { role: "user", content: "What is 1+1?" },
          { role: "assistant", content: "2" },
        ],
      ],
    ] as const
  ).map(([item, userPrompt, history]) => [
    item,
    digestOf(
      chatMessages({
        systemPrompt: bundleConfig.systemPrompt,
        userPrompt,
        ...(history === undefined ? {} : { history }),
      }),
    ),
  ]),
);

/** A temp root holding `releases/draft/` with {@link MATH_CHALLENGE}, synced. */
export const makeDraftRelease = async (): Promise<{ root: string; releases: string }> => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "bench-release-"));
  const releases = path.join(root, "releases");
  const challenges = path.join(releases, "draft", "challenges");
  await fsp.mkdir(challenges, { recursive: true });
  await fsp.writeFile(path.join(challenges, "math.yaml"), MATH_CHALLENGE);
  await Effect.runPromise(
    syncRelease(path.join(releases, "draft")).pipe(Effect.provide(NodeContext.layer)),
  );
  return { root, releases };
};
