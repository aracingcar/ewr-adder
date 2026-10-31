// Reads a "New EWR" issue, re-validates the submitted definitions with the same code the web page uses,
// and appends the rows to both copies of the parameter sheet. Issue content is treated as data only.
import fs from "node:fs";
import vm from "node:vm";

const CONFIGS = ["py_ewr/parameter_metadata/ewr_calc_config.json", "create_new_ewr/ewr_calc_config.json"];
const SHEETS = ["py_ewr/parameter_metadata/parameter_sheet.csv", "create_new_ewr/parameter_sheet.csv"];
const out = (k, v) => fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
const finish = (ok, md, codes = "") => {
  fs.writeFileSync("result.md", md);
  out("ok", ok ? "true" : "false");
  out("codes", codes);
  process.exit(0);
};

const issue = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")).issue;
const m = /```json\s*([\s\S]*?)```/.exec(issue.body || "");
if (!m || m[1].length > 256 * 1024) finish(false, "No definitions found. Paste the exported JSON inside a ```json code block.");
let defs;
try { defs = JSON.parse(m[1]); } catch { finish(false, "The JSON in this issue could not be parsed."); }
if (defs?.format !== "ewr-adder-definitions" || defs.version !== 1 || !Array.isArray(defs.specs) || !defs.specs.length || defs.specs.length > 20)
  finish(false, "Expected an `ewr-adder-definitions` v1 file with between 1 and 20 definitions.");

const ctx = vm.createContext({ __specs: defs.specs, __cfg: fs.readFileSync(CONFIGS[0], "utf8"), __sheet: new TextDecoder("windows-1252").decode(fs.readFileSync(SHEETS[0])) });
vm.runInContext(fs.readFileSync("create_new_ewr/ewr-core.js", "utf8"), ctx);
const res = JSON.parse(vm.runInContext(`
  indexSheet(__sheet);
  const ok=[], bad=[];
  for (const s of __specs) { const {e,spec}=validate({...s,id:null}); if (spec) { specs.push(spec); ok.push(spec.code); } else bad.push((s&&String(s.code).slice(0,30)||"?")+": "+Object.values(e)[0]); }
  let cfg=null; if(!bad.length) { try { cfg=addCalcEntries(__cfg, specs); } catch(x) { bad.push(String(x.message)); } }
  JSON.stringify({ok, bad, cfg, text: toCsv(myRows().map(x=>x.r)), lines: myRows().length});
`, ctx));

if (res.bad.length) finish(false, "Validation failed, nothing was added:\n\n" + res.bad.map(b => `- ${b.replace(/[^\w .,:()/'\u2013;-]/g, "")}`).join("\n"));

for (const f of CONFIGS) fs.writeFileSync(f, res.cfg);
// Append raw bytes so the existing Windows-1252 content is untouched; the sheet uses CRLF line endings.
const tail = Buffer.from(res.text.replace(/\n/g, "\r\n"), "latin1");
for (const f of SHEETS) {
  const cur = fs.readFileSync(f);
  fs.writeFileSync(f, Buffer.concat([cur, cur.at(-1) === 0x0a ? Buffer.alloc(0) : Buffer.from("\r\n"), tail]));
}
finish(true, `Adds ${res.lines} row(s) for ${res.ok.map(c => "`" + c + "`").join(", ")} to the parameter sheet and calc config, validated by the same rules as the web page.`, res.ok.join(", "));
