const fs = require("fs"), path = require("path"), W = path.join(__dirname, "work");
const core = fs.readFileSync(path.join(__dirname, "core.cjs"), "utf8").replace(/\nif \(typeof module[^\n]*\n?/, "\n");
const out = fs.readFileSync(path.join(__dirname, "page.html"), "utf8").replace("/*CORE*/", () => core).replace("/*DATA*/", () => fs.readFileSync(path.join(W, "rows.json"), "utf8"));
fs.writeFileSync(path.join(W, "efficiency-lab.html"), out);
