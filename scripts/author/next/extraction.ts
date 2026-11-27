// P1 — Extraction to JSON. A seeded record is rendered into templated prose
// with distractors (a draft invoice number, a ship date, an assistant's phone,
// a related ticket); the key is the record, graded by json_matches.

import {
  type DataItem,
  dollars,
  drawDate,
  type Family,
  jsonItem,
  money,
  type Rng,
  rngFor,
} from "./data-common.js";

const JSON_ONLY =
  "Strings are copied exactly as written unless a format is given; numbers are JSON numbers, not strings. " +
  "Reply with only the JSON object.";

// ── Invoice ─────────────────────────────────────────────────────────────────
const VENDORS = [
  "Halden Supply Co.",
  "Brightwater Tools Ltd.",
  "Okafor & Lin Printing",
  "Northgate Lab Supplies",
  "Pellucid Glassworks",
  "Marrow Street Wholesale",
];
const GOODS: readonly [string, number, number][] = [
  ["box of nitrile gloves", 900, 2400],
  ["ream of copy paper", 450, 1100],
  ["toner cartridge", 3800, 9900],
  ["safety goggles", 650, 1800],
  ["roll of packing tape", 199, 699],
  ["label printer", 8900, 21900],
  ["pack of glass vials", 1250, 4200],
  ["desk lamp", 2200, 5400],
];
const CURRENCIES = [
  { code: "USD", sym: "$" },
  { code: "EUR", sym: "€" },
  { code: "GBP", sym: "£" },
] as const;
const SIGNERS = ["Mara Quill", "Tomas Reyes", "Ines Okafor", "Lev Sandor", "Grace Whitfield"];

const lineText = (rng: Rng, qty: number, desc: string, price: string): string =>
  rng.pick([
    `${qty} × ${desc} at ${price} each`,
    `${desc}, quantity ${qty}, unit price ${price}`,
    `${qty} units of ${desc} (${price} per unit)`,
  ]);

export const invoice = (seed: number): DataItem => {
  const family = "extract_invoice";
  const rng = rngFor(family, seed);
  const vendor = rng.pick(VENDORS);
  const cur = rng.pick(CURRENCIES);
  const year = rng.int(2023, 2026);
  const issued = drawDate(rng, year);
  let shipped = drawDate(rng, year);
  while (shipped.iso === issued.iso) shipped = drawDate(rng, year);
  const num = rng.int(1000, 9999);
  const draft = num - rng.int(1, 9);
  const po = rng.int(10000, 99999);
  const goods = rng.sample(GOODS, rng.int(2, 4));
  const lines = goods.map(([description, lo, hi]) => ({
    description,
    quantity: rng.int(1, 12),
    cents: rng.int(lo, hi),
  }));
  const totalCents = lines.reduce((s, l) => s + l.quantity * l.cents, 0);
  const record = {
    invoice_number: `INV-${num}`,
    vendor,
    issue_date: issued.iso,
    currency: cur.code,
    line_items: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit_price: dollars(l.cents),
    })),
    total: dollars(totalCents),
  };
  const signer = rng.pick(SIGNERS);
  const text =
    `Hi Dana,\n\n` +
    `Attached is invoice INV-${num} for your purchase order PO-${po}. It replaces the draft we sent ` +
    `earlier as INV-${draft}, which you can discard. The invoice was issued on ${issued.prose}; ` +
    `everything shipped on ${shipped.prose}.\n\n` +
    `This covers: ${lines.map((l) => lineText(rng, l.quantity, l.description, `${cur.sym}${money(l.cents)}`)).join("; ")}.\n\n` +
    `The total due is ${cur.sym}${money(totalCents)}, payable within 30 days.\n\n` +
    `Best regards,\n${signer}\n${vendor}`;
  const prompt =
    `Extract the invoice in the email below into JSON with exactly these keys:\n\n` +
    `- "invoice_number": string, the current invoice's number, e.g. "INV-1234"\n` +
    `- "vendor": string, the sending company's name\n` +
    `- "issue_date": string, the date the invoice was issued, as YYYY-MM-DD\n` +
    `- "currency": string, the ISO 4217 code: "USD", "EUR" or "GBP"\n` +
    `- "line_items": array of {"description": string, "quantity": integer, "unit_price": number}, in the order listed\n` +
    `- "total": number, the total due\n\n` +
    `${JSON_ONLY}\n\n---\n${text}\n---`;
  return jsonItem({
    family,
    seed,
    category: "extraction",
    tier: 2,
    prompt,
    value: record,
    why: `key: ${JSON.stringify(record)}`,
    wrong: [
      { ...record, invoice_number: `INV-${draft}` },
      { ...record, issue_date: shipped.iso },
      { ...record, total: String(record.total) },
    ],
  });
};

// ── Contact card ────────────────────────────────────────────────────────────
const FIRST = ["Priya", "Jonas", "Amara", "Diego", "Hana", "Malik", "Sofia", "Wen"];
const LAST = ["Nair", "Berg", "Okonkwo", "Alvarez", "Sato", "Haddad", "Rossi", "Zhou"];
const TITLES = [
  "Head of Procurement",
  "Senior Data Engineer",
  "Director of Operations",
  "Product Marketing Manager",
  "Clinical Research Lead",
];
const COMPANIES: readonly [string, string][] = [
  ["Fernhill Analytics", "fernhill.io"],
  ["Calder & Moss", "caldermoss.com"],
  ["Bluepeak Health", "bluepeakhealth.org"],
  ["Orrin Logistics", "orrinlogistics.com"],
  ["Quarry Lane Studios", "quarrylane.co"],
];
const CITIES = ["Denver", "Toronto", "Austin", "Lisbon", "Melbourne", "Leeds", "Osaka"];
const EVENTS = ["Data Council summit", "regional supply-chain expo", "HealthTech forum"];

const phoneDraw = (rng: Rng) => {
  const area = rng.int(201, 989);
  const line = rng.int(1000, 9999);
  return { text: `+1 (${area}) 555-${line}`, e164: `+1${area}555${line}` };
};

const contact = (seed: number): DataItem => {
  const family = "extract_contact";
  const rng = rngFor(family, seed);
  const [first, asstFirst] = rng.sample(FIRST, 2) as [string, string];
  const [last, asstLast] = rng.sample(LAST, 2) as [string, string];
  const [company, domain] = rng.pick(COMPANIES);
  const [city, eventCity] = rng.sample(CITIES, 2) as [string, string];
  const title = rng.pick(TITLES);
  const direct = phoneDraw(rng);
  const asst = phoneDraw(rng);
  const front = rng.int(1000, 9999);
  const mixedEmail = `${first}.${last}@${domain[0]?.toUpperCase()}${domain.slice(1)}`;
  const record = {
    name: `${first} ${last}`,
    title,
    company,
    email: `${first}.${last}@${domain}`.toLowerCase(),
    phone: direct.e164,
    city,
  };
  const text =
    `Great meeting you at the ${rng.pick(EVENTS)} in ${eventCity} last week! As promised, here are my details.\n\n` +
    `I'm the ${title} at ${company}, working out of our ${city} office. Email is best: ${mixedEmail}. ` +
    `My direct line is ${direct.text}; the main switchboard (${`+1 (800) 555-${front}`}) can also find me. ` +
    `For scheduling, my assistant ${asstFirst} ${asstLast} (${asstFirst.toLowerCase()}@${domain}, ${asst.text}) keeps my calendar.\n\n` +
    `Cheers,\n${first} ${last}`;
  const prompt =
    `Extract the sender's contact card from the message below into JSON with exactly these keys:\n\n` +
    `- "name": string, the sender's full name\n` +
    `- "title": string, the sender's job title\n` +
    `- "company": string\n` +
    `- "email": string, the sender's email address in lowercase\n` +
    `- "phone": string, the sender's direct line in E.164 form: "+" followed by country code and number, digits only (e.g. "+15551234567")\n` +
    `- "city": string, the city the sender works in\n\n` +
    `${JSON_ONLY}\n\n---\n${text}\n---`;
  return jsonItem({
    family,
    seed,
    category: "extraction",
    tier: 2,
    prompt,
    value: record,
    why: `key: ${JSON.stringify(record)}`,
    wrong: [
      { ...record, phone: asst.e164 },
      { ...record, phone: direct.text },
      { ...record, city: eventCity },
      { ...record, email: mixedEmail },
    ],
  });
};

// ── Ticket triage ───────────────────────────────────────────────────────────
const PRODUCTS = ["Ledgerly", "TrackPilot", "Shelfwise", "RouteMate", "Clinicly"];
type Severity = "low" | "medium" | "high" | "critical";
type Category = "billing" | "bug" | "account" | "feature_request";
interface Template {
  category: Category;
  severity: Severity;
  order: boolean;
  body: (product: string, order: string) => string;
}
const TEMPLATES: readonly Template[] = [
  {
    category: "bug",
    severity: "critical",
    order: false,
    body: (p) =>
      `Since 8am ${p} won't load at all for anyone on our team: every page shows a 503 error. Nobody can work.`,
  },
  {
    category: "bug",
    severity: "high",
    order: false,
    body: (p) =>
      `Exporting reports from ${p} fails every time with "export error 0x2". We've tried three browsers and there is no other way to get the data out.`,
  },
  {
    category: "bug",
    severity: "medium",
    order: false,
    body: (p) =>
      `Search in ${p} returns nothing for names with accents. For now we scroll the full list by hand, which works but is slow.`,
  },
  {
    category: "bug",
    severity: "critical",
    order: false,
    body: (p) =>
      `After last night's sync, every note we added in ${p} this week is gone. The records were there yesterday and now they're simply missing.`,
  },
  {
    category: "billing",
    severity: "low",
    order: true,
    body: (p, o) =>
      `Could you send me a PDF copy of the invoice for order ${o}? Our accountant needs it for the ${p} subscription.`,
  },
  {
    category: "billing",
    severity: "low",
    order: true,
    body: (p, o) =>
      `Please switch our ${p} plan from monthly to annual billing, starting after order ${o} renews.`,
  },
  {
    category: "account",
    severity: "high",
    order: false,
    body: (p) =>
      `I can't log in to ${p} since resetting my password. The reset link has failed three times and I have no other way into my account.`,
  },
  {
    category: "account",
    severity: "low",
    order: false,
    body: (p) => `Please change the email address on my ${p} account to the one I'm writing from.`,
  },
  {
    category: "feature_request",
    severity: "low",
    order: false,
    body: (p) =>
      `It would be great if ${p} could export to CSV as well as PDF. Is that on the roadmap?`,
  },
];

const ticket = (seed: number): DataItem => {
  const family = "extract_ticket";
  const rng = rngFor(family, seed);
  const t = rng.pick(TEMPLATES);
  const [product, other] = rng.sample(PRODUCTS, 2) as [string, string];
  const id = rng.int(40000, 59999);
  const prior = id - rng.int(100, 999);
  const order = `ORD-${rng.int(100000, 999999)}`;
  const customer = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
  const [cust1, cust2] = customer.split(" ") as [string, string];
  const record = {
    ticket_id: `T-${id}`,
    customer,
    product,
    category: t.category,
    severity: t.severity,
    order_id: t.order ? order : null,
  };
  const text =
    `Ticket T-${id}\nFrom: ${cust1.toLowerCase()}.${cust2.toLowerCase()}@example.com\n\n` +
    `Hello support,\n\n${t.body(product, order)} ` +
    `(This is unrelated to ticket T-${prior}, which you already closed. We also use ${other}, and that's working fine.)\n\n` +
    `Thanks,\n${customer}`;
  const prompt =
    `Triage the support ticket below into JSON with exactly these keys:\n\n` +
    `- "ticket_id": string, this ticket's id, e.g. "T-12345"\n` +
    `- "customer": string, the customer's full name\n` +
    `- "product": string, the product the ticket is about\n` +
    `- "category": one of "billing", "bug", "account", "feature_request"\n` +
    `- "severity": one of "critical" (the product is completely unavailable, or data was lost), ` +
    `"high" (something is broken and the customer has no workaround), "medium" (something is broken but there is a workaround), ` +
    `"low" (anything else: questions, requests, plan or account changes)\n` +
    `- "order_id": string, the order id mentioned (e.g. "ORD-123456"), or null if none is mentioned\n\n` +
    `${JSON_ONLY}\n\n---\n${text}\n---`;
  return jsonItem({
    family,
    seed,
    category: "extraction",
    tier: 2,
    prompt,
    value: record,
    why: `key: ${JSON.stringify(record)}`,
    wrong: [
      { ...record, ticket_id: `T-${prior}` },
      { ...record, product: other },
      { ...record, order_id: t.order ? null : "" },
    ],
  });
};

export const extractionFamilies: readonly Family[] = [
  { id: "extract_invoice", build: invoice },
  { id: "extract_contact", build: contact },
  { id: "extract_ticket", build: ticket },
];
