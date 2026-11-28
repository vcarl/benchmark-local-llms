import{u as g,a as f,e as w,b as x,c as y,j as e,L as u,r as p,d as v,K as b,s as j,f as k,p as N,g as A}from"./index-VMm2X1_0.js";import{s as t}from"./errata.module-BPbxogFy.js";const E=`# Errata process

**Alpha.** No dated release of the benchmark has been cut. The current release is version \`0\`, the alpha challenge set, and these rules may be refined before the first release.

An erratum is a public record of a change to a benchmark item after its release: its answer key, its scorer, its prompt, or whether it is in the set at all. This page describes how errata are identified, recorded, and patched, and how they affect published results.

## Rules

- **Every item change has an erratum.** An automated check in the test suite compares every item against the current release and fails when an item differs without an erratum that accounts for it. Errata coverage of item changes is 100%.
- **Errata apply only to items of a frozen release.** Pre-release (draft) items, the candidate items of the next release in \`releases/draft/\`, change freely and without errata until a release freezes them.
- **Scorers are patched as needed.** A wrong answer key or a scorer that grades a correct answer as wrong is fixed when it is found. Stored model outputs are then re-scored under the patched scorer; models are not re-run.
- **Prompts change only at a prompt release, at most twice a year.** A prompt defect found between releases is recorded at once as pending the next release. When the scorer can compensate in the meantime, the scorer is patched immediately and the erratum says so.
- **Items are public.** At a release, each item's prompt and scorer digests are recorded in the release file beside the published prompts, with one SHA-256 digest over the item set. Anyone can recompute it from the release's published files with \`./bench release verify\`. A released item changes only through a published erratum stating how many recorded scores it changed; making that guarantee more robust is future work.

## What counts as an erratum

Each erratum has one kind:

- **Answer key**: the expected answer was wrong.
- **Scorer**: the scorer graded a correct answer as wrong, or grants partial credit.
- **Prompt ambiguity**: the prompt admits another reading.
- **Retired**: the item is removed from the set.
- **Added**: the item is new since the release.

Each erratum records an id, the date it was recorded, its kind, every affected item, what changed and why, whether it changes how stored outputs score, how many recorded scores it changed, and whether it waits on a release: in effect now, at the next release, or shipped in a named release. The count of changed scores is measured: every recorded result the published tables score is re-scored under the eval version before the erratum and after it, and the results whose score differs, and the model configurations they belong to, are counted. For a retired item, the count is the recorded results that dropped out of scoring.

## Versions

Each release of the benchmark is named \`YYYY.N\` (\`2027.1\`, \`2027.2\`); the alpha challenge set is release \`0\`. Errata are numbered within the release they patch: \`0.1\`, \`0.2\`, …, and \`2027.1.1\`, \`2027.1.2\`, … for release \`2027.1\`. A result cited as eval \`0.7\` means release \`0\` plus errata 1 to 7; this number is the eval version (\`2027.1.0\` before any erratum). Release \`0\` is closed at eval \`0.7\`.

## How a scoring change is linked to an erratum

Each release records a hash of each item's prompt and of its scorer, and each scoring erratum records the scorer hash it put in effect. The check requires:

- a changed scorer hash: an erratum naming the item and marked as a scoring change;
- a changed prompt hash: an erratum naming the item with a fix pending the next release or shipped;
- a removed item: a retired erratum naming it;
- a new item: an added erratum naming it.

A scoring rule that applies across the whole harness, rather than to one item's scorer, changes no item hash and so is not required by the check. Its erratum lists the items whose archived scores it changed. Every scorer that was ever in effect stays published with its release, so any eval version can be re-scored.

## Retired items

Items are retired when they no longer discriminate between models, for example when every tested configuration passes them. A retired item is removed from its challenge without changing the challenge's version. Outputs already recorded for it are kept unchanged in the archive and drop out of scoring, so every configuration's results stay comparable over the remaining items. The retired erratum stays in the registry after the item leaves the set.

## Partial credit

Some items declare specific near misses, such as a rounding slip or a percent where a decimal was asked, that earn partial credit. Adding a near miss is a scoring change and needs an erratum. The headline pass rate stays binary: an item passes only at full score. Partial credit is reported separately and never changes the headline.

## Reporting a suspected error

If an answer key looks wrong, a scorer marked a correct answer as wrong, or a prompt can be read another way, [report a suspected erratum](https://github.com/vcarl/benchmark-local-llms/issues/new?template=report-erratum.yml). Name the challenge and item, what you expected, and a model output that shows the problem. A confirmed problem is fixed under the rules above and recorded as an erratum.
`,S=N(E),d=s=>A(s).map((r,i)=>{switch(r.type){case"strong":return e.jsx("strong",{children:r.text},i);case"code":return e.jsx("code",{children:r.text},i);case"link":return e.jsx("a",{href:r.href,target:"_blank",rel:"noreferrer",children:r.text},i);case"text":return r.text}}),L=(s,r)=>{switch(s.type){case"h":return s.level===1?e.jsx("h2",{children:d(s.text)},r):e.jsx("h3",{children:d(s.text)},r);case"p":return e.jsx("p",{children:d(s.text)},r);case"ul":return e.jsx("ul",{children:s.items.map((i,n)=>e.jsx("li",{children:d(i)},n))},r)}};function P(){const s=g(),r=f({strict:!1}),i=s.status==="loaded"?s.value:[],n=r.release===void 0?w(i,String(r.set??""))?.release:String(r.release),c=i.find(a=>a.release===n),h=x(c),o=h.status==="loaded"?h.value.dataset:void 0,l=o===void 0||n==null?[]:y(o.errata,n);return e.jsx("div",{className:t.page,children:e.jsxs("article",{className:t.doc,children:[e.jsx(u,{to:"/",className:t.back,children:"← Overview"}),S.map(L),e.jsxs("h3",{children:["Errata · ",p(n??null)]}),e.jsx("p",{className:t.evalLine,children:o!==void 0&&n!=null?e.jsxs(e.Fragment,{children:[o.version!==null&&e.jsxs(e.Fragment,{children:["Eval ",e.jsx("code",{children:o.version})," ·"," "]}),v(n)," · ",l.length," errata ·"," ",e.jsx(u,{to:"/release/$release",params:{release:n},children:"release notes"})]}):h.status==="error"?h.message:c===void 0&&s.status==="loaded"?`No dataset of ${p(n??null)} in the index.`:"Loading…"}),e.jsx("ol",{className:t.list,children:l.map(a=>e.jsxs("li",{id:a.id,className:t.entry,children:[e.jsxs("div",{className:t.entryHead,children:[e.jsx("span",{className:t.id,children:a.id}),e.jsx("span",{className:t.kind,children:b[a.kind]}),e.jsx("span",{className:t.date,children:a.date})]}),e.jsx("p",{children:d(a.description)}),e.jsxs("div",{className:t.meta,children:[e.jsx("span",{children:j(a)}),e.jsx("span",{children:k(a)})]}),e.jsxs("details",{className:t.items,children:[e.jsxs("summary",{children:[a.items.length," ",a.items.length===1?"item":"items"]}),e.jsx("ul",{children:a.items.map(m=>e.jsx("li",{children:e.jsx("code",{children:m})},m))})]})]},a.id))})]})})}export{P as component};
