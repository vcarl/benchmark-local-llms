// Classification (core). The label is the generator's input: each family picks
// its gold label (or tag set) first, then renders text from that label's
// template pool. Single-label families are exact_match on a final
// `Label: <label>` line; multi-label topic tagging is set_match over the tag
// vocabulary. Screen: a bag-of-cue-words baseline (cueBaseline) must reach the
// wrong answer, so no single keyword decides the label — every item carries a
// cue for another label (a negated or incidental mention) that outweighs the
// gold label's own cues. The baseline's answer is the item's `wrong` unit.

import { exactItem, setItem } from "../emit.js";
import {
  type Generated,
  int,
  pick,
  redraw,
  rngFor,
  shuffle,
  withMeta,
} from "./common.js";

type Cues = Record<string, readonly string[]>;

const escapeRegExp = (s: string): string => s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

/** Cue hits per label: each cue matches at a word start, case-insensitively ("charge" hits "Charged"). */
export const cueBaseline = (text: string, cues: Cues): Record<string, number> =>
  Object.fromEntries(
    Object.entries(cues).map(([label, words]) => [
      label,
      words.reduce(
        (n, w) => n + (text.match(new RegExp(`(?<!\\w)${escapeRegExp(w)}`, "gi"))?.length ?? 0),
        0,
      ),
    ]),
  );

/** The unique top-scoring label, or null on a tie. */
const topLabel = (counts: Record<string, number>): string | null => {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [first, second] = sorted;
  if (first === undefined || (second !== undefined && second[1] === first[1])) return null;
  return first[0];
};

const SEEDS = [0, 1, 2];
const LABEL_EXTRACT = "[Ll]abel:[*\\s]*([A-Za-z0-9_]+)";
const quoted = (text: string) => `"""\n${text}\n"""`;

function labelItem(
  family: string,
  seed: number,
  prompt: string,
  gold: string,
  baseline: string,
  why: string,
): Generated {
  const base = exactItem({
    name: `${family}_s${seed}`,
    category: "classification",
    tier: 2,
    prompt,
    expected: gold,
    extract: LABEL_EXTRACT,
    tags: ["classification"],
    why: `${why} Keyword baseline says ${baseline}. gold: ${gold}`,
  });
  return {
    authored: withMeta({ ...base, item: { ...base.item, family } }, seed, "core"),
    units: [{ gold: `Label: ${gold}`, wrong: [`Label: ${baseline}`] }],
  };
}

const finalLine =
  "Choose exactly one label. End your reply with a final line of the form `Label: <label>`, with the label written exactly as listed.";

// ── Support-ticket intent ────────────────────────────────────────────────────

const INTENT_LABELS = ["billing", "refund", "technical", "account_access", "cancellation"] as const;
type Intent = (typeof INTENT_LABELS)[number];

const INTENT_CUES: Record<Intent, readonly string[]> = {
  billing: ["charge", "invoice", "bill"],
  refund: ["refund", "money back"],
  technical: ["error", "crash", "bug", "broken"],
  account_access: ["password", "log in", "login", "locked out"],
  cancellation: ["cancel", "unsubscribe"],
};

/** What the customer actually wants. */
const INTENT_CORE: Record<Intent, readonly string[]> = {
  billing: [
    "Could you explain what the 'service adjustment' line on this month's statement is for?",
    "I need a copy of last quarter's invoice with our new company address on it.",
    "Will the annual plan be charged at signup or at the renewal date?",
  ],
  refund: [
    "The headphones I returned reached your warehouse on Monday; please put the $40 back on my card.",
    "The order never arrived, so I want my payment returned.",
    "Please reverse the payment for the course I withdrew from inside the 14-day window.",
  ],
  technical: [
    "Every time I open the export screen the page goes blank and nothing loads.",
    "Since the last update, sync stops halfway and the files on my laptop are out of date.",
    "Uploading anything larger than about 5 MB just spins forever.",
  ],
  account_access: [
    "The reset email never arrives, so I can't get into my profile at all.",
    "The site says my username doesn't exist, even though I signed in yesterday.",
    "The codes from my authenticator app are rejected, so I can't get past the sign-in page.",
  ],
  cancellation: [
    "Please end my subscription at the close of this billing period.",
    "I won't be renewing; please stop the plan from auto-renewing next month.",
    "We're shutting down the team workspace, so please close our plan so we aren't charged again.",
  ],
};

/** Mentions of another label's cue that do not make that label true. */
const INTENT_DISTRACTOR: Record<Intent, readonly string[]> = {
  billing: ["My bill itself looks correct.", "The invoice amounts are all fine."],
  refund: ["I'm not asking for a refund.", "A refund wouldn't help me here."],
  technical: ["Everything else works without errors.", "This isn't a bug report."],
  account_access: ["I can log in without any trouble.", "My password works fine."],
  cancellation: ["I don't want to cancel.", "I'm not planning to cancel anything."],
};

function intentItem(seed: number): Generated {
  const family = "classify_intent";
  const rng = rngFor(family, seed);
  const gold = INTENT_LABELS[seed % INTENT_LABELS.length] as Intent;
  return redraw(family, () => {
    const others = shuffle(
      rng,
      INTENT_LABELS.filter((l) => l !== gold),
    ).slice(0, int(rng, 1, 2));
    const ticket = shuffle(rng, [
      pick(rng, INTENT_CORE[gold]),
      ...others.map((l) => pick(rng, INTENT_DISTRACTOR[l])),
    ]).join(" ");
    const baseline = topLabel(cueBaseline(ticket, INTENT_CUES));
    if (baseline === null || baseline === gold) return null;
    const prompt = [
      "Classify the customer support ticket below by what the customer is actually asking for. Allowed labels:",
      "- billing: a question about charges, invoices or statements (no money back requested)",
      "- refund: the customer wants money returned",
      "- technical: something in the product is malfunctioning",
      "- account_access: the customer cannot sign in or get into their account",
      "- cancellation: the customer wants to end their subscription",
      "",
      quoted(ticket),
      "",
      finalLine,
    ].join("\n");
    return labelItem(
      family,
      seed,
      prompt,
      gold,
      baseline,
      `Core request is ${gold}; distractors mention ${others.join(", ")}.`,
    );
  });
}

// ── Review sentiment with mixed cues ─────────────────────────────────────────

const SENTIMENT_LABELS = ["positive", "negative", "neutral"] as const;
type Sentiment = (typeof SENTIMENT_LABELS)[number];

const POS_CUES = ["great", "love", "excellent", "impressive", "perfect", "fantastic"];
const NEG_CUES = ["terrible", "awful", "broke", "disappointing", "poor", "annoying"];
const PROS = [
  "The battery life is excellent.",
  "I love how light it is.",
  "Setup took two minutes, which was great.",
  "The build quality is impressive for the price.",
  "The companion app is fantastic.",
  "Its size is perfect for travel.",
];
const CONS = [
  "The charging cable broke within a week.",
  "Customer support was terrible when I had a question.",
  "The case scratches easily, which is disappointing.",
  "The firmware update prompts are annoying.",
  "The included manual is poor.",
  "The packaging was awful, mostly plastic.",
];
const VERDICTS: Record<Sentiment, readonly string[]> = {
  positive: [
    "Overall I'm keeping it and would buy it again.",
    "All things considered, I'd recommend it to a friend.",
    "On balance it's worth the money.",
  ],
  negative: [
    "In the end I'm sending it back.",
    "All things considered, I wouldn't buy it again.",
    "On balance it's not worth the money.",
  ],
  neutral: [
    "Honestly, I can't decide whether I'd buy it again.",
    "I have no strong feeling either way about it.",
    "Whether it's worth the money, I genuinely can't say yet.",
  ],
};
const PRODUCTS = ["smart speaker", "robot vacuum", "e-reader", "fitness tracker"];

/** Cue-count baseline: more positive cues → positive, more negative → negative, tie → neutral. */
const sentimentBaseline = (text: string): Sentiment => {
  const c = cueBaseline(text, { pos: POS_CUES, neg: NEG_CUES });
  const pos = c["pos"] ?? 0;
  const neg = c["neg"] ?? 0;
  return pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
};

function sentimentItem(seed: number): Generated {
  const family = "classify_sentiment";
  const rng = rngFor(family, seed);
  const gold = SENTIMENT_LABELS[seed % SENTIMENT_LABELS.length] as Sentiment;
  return redraw(family, () => {
    const body = shuffle(rng, [
      ...shuffle(rng, PROS).slice(0, int(rng, 1, 3)),
      ...shuffle(rng, CONS).slice(0, int(rng, 1, 3)),
    ]);
    const product = pick(rng, PRODUCTS);
    const review = [
      `I've had this ${product} for a month.`,
      ...body,
      pick(rng, VERDICTS[gold]),
    ].join(" ");
    const baseline = sentimentBaseline(review);
    if (baseline === gold) return null;
    const prompt = [
      "Classify the product review below by the reviewer's final verdict. Allowed labels:",
      "- positive: they would keep it, buy it again or recommend it",
      "- negative: they would not (returning it, would not buy it again, not worth it)",
      "- neutral: they say they are undecided or indifferent",
      "",
      quoted(review),
      "",
      finalLine,
    ].join("\n");
    return labelItem(family, seed, prompt, gold, baseline, `Verdict sentence is ${gold}.`);
  });
}

// ── Multi-label topic tagging (set_match) ────────────────────────────────────

const TAGS = ["pricing", "performance", "mobile_app", "integrations", "docs", "sign_in"] as const;
type Tag = (typeof TAGS)[number];

const TAG_CUES: Record<Tag, readonly string[]> = {
  pricing: ["price", "plan", "cheap", "cost", "tier"],
  performance: ["load", "lag", "slow", "quick"],
  mobile_app: ["phone", "iphone", "android", "mobile"],
  integrations: ["slack", "zapier", "calendar", "integration"],
  docs: ["documentation", "guide", "tutorial"],
  sign_in: ["password", "sign", "log in", "login"],
};
const TAG_ISSUE: Record<Tag, readonly string[]> = {
  pricing: [
    "The jump from the starter plan to the team plan is too steep for a three-person shop.",
    "Please add a cheaper tier between Basic and Pro.",
  ],
  performance: [
    "Dashboards take ages to load once a project has a few hundred tasks.",
    "Typing in the editor lags noticeably on long pages.",
  ],
  mobile_app: [
    "The Android app crashes whenever I rotate my phone.",
    "On iPhone the buttons at the bottom of the screen are cut off.",
  ],
  integrations: [
    "The Slack integration stopped posting updates to our channel.",
    "Please add a Zapier connector so we can push tasks in from our CRM.",
  ],
  docs: [
    "The API guide doesn't explain pagination, so we were stuck for a day.",
    "The tutorials still show the old menu layout.",
  ],
  sign_in: [
    "I have to re-enter my password every morning even with 'remember me' ticked.",
    "The reset-password link says it has expired as soon as I click it.",
  ],
};
const TAG_FINE: Record<Tag, string> = {
  pricing: "The price is fair for what we get.",
  performance: "Pages load quickly for us.",
  mobile_app: "The phone app works well.",
  integrations: "The calendar integration works perfectly.",
  docs: "The documentation has been helpful.",
  sign_in: "Signing in is quick and painless.",
};

function topicItem(seed: number): Generated {
  const family = "classify_topics";
  const rng = rngFor(family, seed);
  return redraw(family, () => {
    const drawn = shuffle(rng, TAGS);
    const gold = drawn.slice(0, int(rng, 2, 3));
    const fine = drawn.slice(gold.length, gold.length + int(rng, 1, 2));
    const feedback = shuffle(rng, [
      ...gold.map((t) => pick(rng, TAG_ISSUE[t])),
      ...fine.map((t) => TAG_FINE[t]),
    ]).join(" ");
    const hits = cueBaseline(feedback, TAG_CUES);
    const baseline = TAGS.filter((t) => (hits[t] ?? 0) > 0);
    const goldSorted = TAGS.filter((t) => gold.includes(t));
    if (baseline.join() === goldSorted.join()) return null;
    const prompt = [
      "Tag the customer feedback below with every product area where the customer reports a problem or asks for a change. Do not tag an area they mention only to say it works well. Allowed tags:",
      "- pricing: cost and plans",
      "- performance: speed and responsiveness",
      "- mobile_app: the phone apps",
      "- integrations: connections to other tools",
      "- docs: guides and help content",
      "- sign_in: logging in and authentication",
      "",
      quoted(feedback),
      "",
      "Reply with only the applicable tags, comma-separated on one line, written exactly as listed, and no other text.",
    ].join("\n");
    const base = setItem({
      name: `${family}_s${seed}`,
      category: "classification",
      tier: 2,
      prompt,
      vocabulary: [...TAGS],
      expected: goldSorted,
      tags: ["classification"],
      why: `Issues raised: ${goldSorted.join(", ")}; mentioned as fine: ${fine.join(", ")}. Keyword baseline says ${baseline.join(", ")}. gold: ${goldSorted.join(", ")}`,
    });
    return {
      authored: withMeta({ ...base, item: { ...base.item, family } }, seed, "core"),
      units: [
        {
          gold: goldSorted.join(", "),
          wrong: [baseline.join(", "), goldSorted.slice(1).join(", ")],
        },
      ],
    };
  });
}

// ── Priority from stated facts ───────────────────────────────────────────────

export interface IncidentFacts {
  production: boolean;
  allUsers: boolean;
  workaround: boolean;
}

/** Reference rubric (stated verbatim in the prompt). */
export const priority = (f: IncidentFacts): "P1" | "P2" | "P3" =>
  !f.production || f.workaround ? "P3" : f.allUsers ? "P1" : "P2";

const PRIORITY_LABELS = ["P1", "P2", "P3"] as const;
const ALARM_CUES = ["urgent", "critical", "asap", "immediately", "emergency"];
const CALM_CUES = ["no rush", "whenever", "when you get a chance"];
const ALARMED = [
  "URGENT: please look at this immediately!",
  "This is critical, we need a fix ASAP.",
  "Emergency, please escalate.",
];
const CALM = [
  "No rush on this one, just flagging it.",
  "Whenever someone has a moment, could you take a look?",
  "Low-key report, pick it up when you get a chance.",
];
const FEATURES: { name: string; alt: string }[] = [
  { name: "checkout", alt: "customers can still order by phone" },
  { name: "password reset", alt: "support can reset passwords by hand" },
  { name: "the CSV export", alt: "users can copy the table straight from the report page" },
  { name: "search", alt: "users can still browse the category pages" },
];

/** Tone baseline: alarm words → P1, calm words → P3, neither → P2. */
const toneBaseline = (text: string): string => {
  const c = cueBaseline(text, { alarm: ALARM_CUES, calm: CALM_CUES });
  return (c["alarm"] ?? 0) > 0 ? "P1" : (c["calm"] ?? 0) > 0 ? "P3" : "P2";
};

function priorityItem(seed: number): Generated {
  const family = "classify_priority";
  const rng = rngFor(family, seed);
  const gold = PRIORITY_LABELS[seed % PRIORITY_LABELS.length] as string;
  return redraw(family, () => {
    const facts: IncidentFacts = {
      production: rng() < 0.7,
      allUsers: rng() < 0.5,
      workaround: rng() < 0.4,
    };
    if (priority(facts) !== gold) return null;
    const feature = pick(rng, FEATURES);
    const tone = pick(rng, rng() < 0.5 ? ALARMED : CALM);
    const report = [
      tone,
      `Since this morning, ${feature.name} has been failing on our ${facts.production ? "production site" : "staging site (customers never see staging)"}.`,
      facts.allUsers
        ? "Every user is affected."
        : `Only users on the legacy plan are affected, roughly ${int(rng, 3, 15)}% of them.`,
      facts.workaround ? `As a workaround, ${feature.alt}.` : "There is no workaround.",
    ].join(" ");
    const baseline = toneBaseline(report);
    if (baseline === gold) return null;
    const prompt = [
      "Assign a priority to the incident report below using these rules:",
      "- P1: production system, all users affected, and no workaround",
      "- P2: production system, only some users affected, and no workaround",
      "- P3: anything else (a non-production system, or a workaround exists)",
      "Allowed labels: P1, P2, P3.",
      "",
      quoted(report),
      "",
      finalLine,
    ].join("\n");
    return labelItem(
      family,
      seed,
      prompt,
      gold,
      baseline,
      `production=${facts.production} allUsers=${facts.allUsers} workaround=${facts.workaround} → ${gold}.`,
    );
  });
}

export function classifyItems(): Generated[] {
  return [intentItem, sentimentItem, topicItem, priorityItem].flatMap((gen) => SEEDS.map(gen));
}
