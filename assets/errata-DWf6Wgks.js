import{D as c,j as e,L as o,r as d,e as h,K as m,a as l,p,b as u}from"./index-BQWZ2Ey6.js";const g=`# Errata process

**Pre-release.** No versioned release of the benchmark has been cut. The current baseline, version \`0\`, is the initial state of the \`main\` branch, and these commitments may be refined before the first release.

An erratum is a public record of a change to a benchmark item after the baseline: its answer key, its scorer, its prompt, or whether it is in the set at all. This page describes how errata are identified, recorded, and patched, and how they affect published results.

## Commitments

- **Every item change has an erratum.** An automated check in the test suite compares every item against the baseline and fails when an item differs without an erratum that accounts for it. Errata coverage of item changes is 100%.
- **Scorers are patched as needed.** A wrong answer key or a scorer that grades a correct answer as wrong is fixed when it is found. Stored model outputs are then re-scored under the patched scorer; models are not re-run.
- **Prompts change only at a prompt release, at most twice a year.** A prompt defect found between releases is recorded at once as pending the next release. When the scorer can compensate in the meantime, the scorer is patched immediately and the erratum says so.
- **A release cannot be cut while any change lacks an erratum.** At a release, the baseline is re-taken from the current items, and every erratum pending that release is marked fixed in it.

## What counts as an erratum

Each erratum has one kind:

- **Answer key**: the expected answer was wrong.
- **Scorer**: the scorer graded a correct answer as wrong, or grants partial credit.
- **Prompt ambiguity**: the prompt admits another reading.
- **Retired**: the item is removed from the set.
- **Added**: the item is new since the baseline.

Each erratum records an id, the date it was recorded, its kind, every affected item, what changed and why, whether it changes how stored outputs score, and whether it waits on a release: in effect now, at the next release, or shipped in a named release.

## Versions

Each release of the benchmark has a version, \`YYYY.M\` by the date it is cut; the current baseline, before the first release, is version \`0\`, shown as pre-release. Errata are numbered as sub-releases of the release they patch: \`0.1\`, \`0.2\`, … now, and \`2027.1.1\`, \`2027.1.2\`, … after a release \`2027.1\`. A result cited as eval \`0.6\` means the release baseline plus errata 1 to 6.

## How a scoring change is linked to an erratum

The baseline holds a hash of each item's prompt and of its scorer. The check requires:

- a changed scorer hash: an erratum naming the item and marked as a scoring change;
- a changed prompt hash: an erratum naming the item with a fix pending the next release or shipped;
- a removed item: a retired erratum naming it;
- a new item: an added erratum naming it.

A scoring rule that applies across the whole harness, rather than to one item's scorer, changes no item hash and so is not required by the check. Its erratum lists the items whose archived scores it changed.

## Retired items

Items are retired when they no longer discriminate between models, for example when every tested configuration passes them. A retired item is removed from its challenge without changing the challenge's version. Outputs already recorded for it are kept unchanged in the archive and drop out of scoring, so every configuration's results stay comparable over the remaining items. The retired erratum stays in the registry after the item leaves the set.

## Partial credit

Some items declare specific near misses, such as a rounding slip or a percent where a decimal was asked, that earn partial credit. Adding a near miss is a scoring change and needs an erratum. The headline pass rate stays binary: an item passes only at full score. Partial credit is reported separately and never changes the headline.

## Reporting a suspected error

If an answer key looks wrong, a scorer marked a correct answer as wrong, or a prompt can be read another way, [report a suspected erratum](https://github.com/vcarl/benchmark-local-llms/issues/new?template=report-erratum.yml). Name the challenge and item, what you expected, and a model output that shows the problem. A confirmed problem is fixed under the commitments above and recorded as an erratum.
`,f="_page_mm5fn_1",w="_doc_mm5fn_2",x="_back_mm5fn_11",y="_baseline_mm5fn_14",b="_list_mm5fn_15",_="_entry_mm5fn_16",k="_entryHead_mm5fn_18",v="_id_mm5fn_19",j="_kind_mm5fn_20",A="_date_mm5fn_21",N="_meta_mm5fn_22",E="_items_mm5fn_23",s={page:f,doc:w,back:x,baseline:y,list:b,entry:_,entryHead:k,id:v,kind:j,date:A,meta:N,items:E},S=p(g),n=a=>u(a).map((t,r)=>{switch(t.type){case"strong":return e.jsx("strong",{children:t.text},r);case"code":return e.jsx("code",{children:t.text},r);case"link":return e.jsx("a",{href:t.href,target:"_blank",rel:"noreferrer",children:t.text},r);case"text":return t.text}}),T=(a,t)=>{switch(a.type){case"h":return a.level===1?e.jsx("h2",{children:n(a.text)},t):e.jsx("h3",{children:n(a.text)},t);case"p":return e.jsx("p",{children:n(a.text)},t);case"ul":return e.jsx("ul",{children:a.items.map((r,i)=>e.jsx("li",{children:n(r)},i))},t)}};function P(){const a=c[0]?.dataset,t=a?.errata??[];return e.jsx("div",{className:s.page,children:e.jsxs("article",{className:s.doc,children:[e.jsx(o,{to:"/",className:s.back,children:"← Overview"}),S.map(T),e.jsx("h3",{children:"Errata"}),e.jsxs("p",{className:s.baseline,children:[a!==void 0&&a.release!==null&&a.version!==null?e.jsxs(e.Fragment,{children:["Eval ",e.jsx("code",{children:a.version})," · ",d(a.release)," baseline ·"," ",h(t,a.release).length," errata"]}):`${t.length} errata`,a?.generatedAt!==void 0&&` · as of ${a.generatedAt.slice(0,10)}`]}),e.jsx("ol",{className:s.list,children:t.map(r=>e.jsxs("li",{id:r.id,className:s.entry,children:[e.jsxs("div",{className:s.entryHead,children:[e.jsx("span",{className:s.id,children:r.id}),e.jsx("span",{className:s.kind,children:m[r.kind]}),e.jsx("span",{className:s.date,children:r.date})]}),e.jsx("p",{children:n(r.description)}),e.jsxs("div",{className:s.meta,children:[e.jsx("span",{children:r.scorerChange?"Changes scores":"No score change"}),e.jsx("span",{children:l(r)})]}),e.jsxs("details",{className:s.items,children:[e.jsxs("summary",{children:[r.items.length," ",r.items.length===1?"item":"items"]}),e.jsx("ul",{children:r.items.map(i=>e.jsx("li",{children:e.jsx("code",{children:i})},i))})]})]},r.id))})]})})}export{P as component};
