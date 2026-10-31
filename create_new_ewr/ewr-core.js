"use strict";
// Shared by index.html and .github/scripts/add_ewr.mjs: parsing, validation and row building.
const CORE=["StartMonth","EndMonth","StartDay","EndDay","Duration","MinSpell","EventsPerYear","MaxInter-event"];
const COMP={flow:[...CORE,"FlowThresholdMin","FlowThresholdMax","WithinEventGapTolerance"],
 "low flow":[...CORE,"FlowThresholdMin","FlowThresholdMax"],"cease to flow":[...CORE,"FlowThresholdMin","FlowThresholdMax"],
 "flow-ctf":[...CORE,"FlowThresholdMin","FlowThresholdMax","WithinEventGapTolerance","NonFlowSpell","CtfThreshold"],
 rise_fall:[...CORE,"FlowThresholdMin","FlowThresholdMax","WithinEventGapTolerance","NonFlowSpell","RateOfRiseMax1","RateOfRiseMax2","RateOfFallMin","RateOfRiseThreshold1","RateOfRiseThreshold2"],
 cumulative:[...CORE,"VolumeThreshold","FlowThresholdMin","FlowThresholdMax","AccumulationPeriod","WithinEventGapTolerance"],
 level:[...CORE,"LevelThresholdMin","LevelThresholdMax","DrawdownRate","MaxSpell","WithinEventGapTolerance"],
 level_rise_fall:[...CORE,"LevelThresholdMin","LevelThresholdMax","RateOfRiseRiverLevel","RateOfFallRiverLevel","WithinEventGapTolerance"]};
const multi=c=>[...COMP[c],"Multigauge"];
const HANDLERS={
 F:{flow_handle:["Continuous spell","flow"],lowflow_handle:["Total days","low flow"],ctf_handle:["Cease to flow","cease to flow"],flow_handle_anytime:["Across-year spell","flow"],flow_handle_check_ctf:["Spell after dry period","flow-ctf"],rise_and_fall_handle:["Rate of rise / fall","rise_fall"],flow_handle_multi:["Two gauges: continuous","flow",1],lowflow_handle_multi:["Two gauges: total days","low flow",1],ctf_handle_multi:["Two gauges: cease to flow","cease to flow",1]},
 V:{cumulative_handle:["Accumulated volume","cumulative"],cumulative_handle_multi:["Two gauges: volume","cumulative",1]},
 L:{level_handle:["Level spell","level"],rise_and_fall_handle:["Level rise / fall","level_rise_fall"]},
 S:{flow_handle:["Continuous spell","flow"],lowflow_handle:["Total days","low flow"]}};
const INT=new Set(["StartMonth","EndMonth","StartDay","EndDay","Duration","MinSpell","MaxSpell","WithinEventGapTolerance","EventsPerYear","AccumulationPeriod","NonFlowSpell","FlowThresholdMin","FlowThresholdMax","VolumeThreshold"]);
const MAXP=1e9, B={StartMonth:[1,12],EndMonth:[1,12],StartDay:[1,31],EndDay:[1,31],Duration:[1,366],MinSpell:[1,366],MaxSpell:[1,MAXP],WithinEventGapTolerance:[0,30],EventsPerYear:[1,12],AccumulationPeriod:[1,366],NonFlowSpell:[0,MAXP],FlowThresholdMin:[0,MAXP],FlowThresholdMax:[0,MAXP],VolumeThreshold:[0,MAXP],CtfThreshold:[0,MAXP],DrawdownRate:[0,MAXP],"MaxInter-event":[0,MAXP],TargetFrequency:[0,100],TargetFrequencyMin:[0,100],TargetFrequencyMax:[0,100]};
const DEF={StartMonth:7,EndMonth:6,FlowThresholdMin:0,FlowThresholdMax:1000000,WithinEventGapTolerance:0,EventsPerYear:1,"MaxInter-event":0,CtfThreshold:5,NonFlowSpell:0};
const LAB={StartMonth:"Window starts: month",StartDay:"Window starts: day (optional)",EndMonth:"Window ends: month",EndDay:"Window ends: day (optional)",FlowThresholdMin:"Lower limit",FlowThresholdMax:"Upper limit",LevelThresholdMin:"Lower level (m)",LevelThresholdMax:"Upper level (m)",Duration:"Required days",MinSpell:"Shortest run that counts (blank = default)",MaxSpell:"Longest acceptable spell",WithinEventGapTolerance:"Days below threshold allowed inside an event",EventsPerYear:"Events needed per year",VolumeThreshold:"Volume (ML)",AccumulationPeriod:"Accumulation period (days)",DrawdownRate:"Maximum level fall per day",NonFlowSpell:"Preceding dry spell (days)",CtfThreshold:"Dry flow limit",TargetFrequency:"Target: percent of years achieved",TargetFrequencyMin:"Acceptable frequency minimum (optional)",TargetFrequencyMax:"Acceptable frequency maximum (optional)","MaxInter-event":"Maximum gap between successful events (years)",RateOfRiseMax1:"Flow rise ratio below the second threshold",RateOfRiseMax2:"Flow rise ratio above the second threshold",RateOfFallMin:"Flow fall ratio",RateOfRiseThreshold1:"Minimum flow for a rise event",RateOfRiseThreshold2:"Second flow rise threshold",RateOfRiseRiverLevel:"Level rise per day",RateOfFallRiverLevel:"Level fall per day"};
const TARGETS=["TargetFrequency","TargetFrequencyMin","TargetFrequencyMax"];
const CODE_RE=/^U_[A-Za-z0-9]{1,20}(_[A-Za-z0-9]{1,8})?$/;
const HIDDEN=["PlanningUnitID","PlanningUnitName","LTWPShortName","CompliancePoint/Node","Gauge","State","SWSDLName","Catchment_BPRegion","GaugeType","Latitude","Longitude"];
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let HEAD=[], BASE=[], specs=[], byGauge=new Map(), codes=new Set(), objs=new Set(), deletions=[], gone=new Set();

// ---- CSV ----------------------------------------------------------------------------------------------------------
function parseCsv(t){const rows=[];let r=[],f="",q=false;for(let i=0;i<t.length;i++){const c=t[i];
  if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
  else if(c==='"')q=true; else if(c===","){r.push(f);f="";}
  else if(c==="\n"||c==="\r"){if(c==="\r"&&t[i+1]==="\n")i++;r.push(f);f="";rows.push(r);r=[];}
  else f+=c;}
  if(f!==""||r.length){r.push(f);rows.push(r);} return rows.filter(x=>x.length>1||x[0]!=="");}
const cell=v=>/[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
const toCsv=rows=>rows.map(r=>r.map(cell).join(",")).join("\n")+"\n";
function cp1252(text){const map={0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F};
  const out=new Uint8Array(text.length);for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);out[i]=c<0x80||(c>=0xA0&&c<=0xFF)?c:map[c]??63;}return out;}
const col=n=>HEAD.indexOf(n);

// ---- building rows & validation -----------------------------------------------------------------------------------
const daysIn=m=>new Date(Date.UTC(2000,m,0)).getUTCDate();
const num=v=>{if(typeof v==="boolean"||v===null||v==="")throw 0;const n=Number(v);if(!Number.isFinite(n))throw 0;return n;};
const fieldsFor=(kind,handler)=>{const h=HANDLERS[kind]?.[handler];if(!h)return null;return [...new Set([...COMP[h[1]],...TARGETS])];};
function validate(d){
  const e={},p={};
  const kind=d.kind,h=HANDLERS[kind]?.[d.handler];
  if(!h)e.handler="Rule type is not offered for this kind";
  if(!CODE_RE.test(d.code||""))e.code="Use U_ then 1–20 letters/digits and an optional _suffix; no hyphens";
  else if((codes.has(d.code)&&!gone.has(d.code))||specs.some(s=>s.code===d.code&&s.id!==d.id))e.code="Code is already in use";
  if(!d.name||!d.name.trim()||d.name.length>80)e.name="A name of 1–80 characters is required";
  const pus=byGauge.get(d.gauge);
  if(!pus)e.gauge="Choose a gauge that appears in the parameter sheet";
  const avail=pus?new Set(pus.keys()):new Set();
  if(!d.pus?.length||d.pus.some(x=>!avail.has(x)))e.pus="Choose at least one planning unit at this gauge";
  if((d.objectives||[]).some(o=>!objs.has(o)))e.objectives="Unknown objective code; pick from the list";
  if(!h)return {e,spec:null};
  const fields=fieldsFor(kind,d.handler), input=d.params||{};
  for(const f of fields){
    let v=input[f];if(v===undefined||v===null||v==="")v=DEF[f]??null;
    if(f==="MinSpell"&&v==null)v=d.handler.startsWith("lowflow_handle")?1:p.Duration;
    if(v==null){p[f]=null;continue;}
    try{let n=num(v);const tds=kind==="S"&&d.salinity?.unit==="TDS"&&(f==="FlowThresholdMin"||f==="FlowThresholdMax");
      const integral=INT.has(f)&&!tds;if(integral&&!Number.isInteger(n))throw 0;
      const [lo,hi]=B[f]||[null,null];if((lo!=null&&n<lo)||(hi!=null&&n>hi))throw 0;p[f]=n;}
    catch{e["params."+f]="Enter a finite number within the allowed bounds"+(INT.has(f)?" (whole number)":"");p[f]=null;}}
  for(const f of ["Duration","MinSpell","TargetFrequency"])if(p[f]==null&&!e["params."+f])e["params."+f]="Required";
  const dur=p.Duration;
  if(dur!=null&&p.MinSpell!=null&&p.MinSpell>dur)e["params.MinSpell"]="MinSpell must be between 1 and Duration";
  if(p.MaxSpell!=null&&dur!=null&&p.MaxSpell<dur)e["params.MaxSpell"]="MaxSpell must be at least Duration";
  if(p.DrawdownRate!=null&&p.DrawdownRate<=0)e["params.DrawdownRate"]="Must be positive";
  for(const x of ["Start","End"]){const m=p[x+"Month"],dd=p[x+"Day"];if(m!=null&&dd!=null&&dd>daysIn(m))e["params."+x+"Day"]="Invalid day for this month";}
  if(!["StartMonth","EndMonth","StartDay","EndDay"].some(f=>e["params."+f])){
    const sm=p.StartMonth,em=p.EndMonth,sd=p.StartDay||1,ed=p.EndDay||daysIn(em);
    const a=Date.UTC(2000,sm-1,sd),b=Date.UTC(2000,em-1,ed),D=864e5;
    if(sm===em&&sd>ed)e["params.EndDay"]="End day must not precede start day within the same month";
    const win=b>=a?(b-a)/D+1:366-(a-b)/D+1;
    if(dur!=null&&dur>win)e["params.Duration"]="Duration is longer than the timing window";
    if(d.handler==="flow_handle_anytime"&&kind==="F"&&(sm!==7||sd!==1||em!==6||ed!==30))e["params.StartMonth"]="Across-year spells need a July–June whole-year window";}
  for(const pre of ["Flow","Level"]){const lo=p[pre+"ThresholdMin"],hi=p[pre+"ThresholdMax"];
    if(pre==="Level"&&d.handler==="level_handle"&&(lo==null||hi==null))e["params.LevelThresholdMin"]="Both level limits are required";
    if(lo!=null&&hi!=null&&hi<=lo)e["params."+pre+"ThresholdMax"]="Upper limit must exceed lower limit";}
  const t=p.TargetFrequency,tl=p.TargetFrequencyMin,th=p.TargetFrequencyMax;
  if(t!=null&&((tl!=null&&tl>t)||(th!=null&&th<t)))e["params.TargetFrequency"]="Target must lie within the acceptable range";
  if(kind==="V"){if(p.VolumeThreshold==null||p.VolumeThreshold<=0)e["params.VolumeThreshold"]="A positive volume is required";
    if(p.AccumulationPeriod==null||(dur!=null&&p.AccumulationPeriod<dur))e["params.AccumulationPeriod"]="AccumulationPeriod must be at least Duration";}
  let second=d.second_gauge||null;
  if(h[2]){if(!second||second===d.gauge||!byGauge.has(second))e.second_gauge="Choose a different gauge from the parameter sheet";}
  else if(second)e.second_gauge="Only two-gauge rules take a second gauge";
  if(d.handler==="rise_and_fall_handle"){const rise=kind==="L"?["RateOfRiseRiverLevel"]:["RateOfRiseMax1","RateOfRiseMax2","RateOfRiseThreshold1","RateOfRiseThreshold2"],fall=kind==="L"?"RateOfFallRiverLevel":"RateOfFallMin";
    const hr=rise.some(f=>p[f]!=null),hf=p[fall]!=null;if(hr===hf||(hr&&rise.some(f=>p[f]==null)))e["params.rates"]="Supply all rise limits or one fall limit, for exactly one direction";}
  let sal=null;
  if(kind==="S"){const u=d.salinity?.unit;let fac=0.6;try{fac=num(d.salinity?.tds_factor??0.6);if(fac<=0)throw 0;}catch{e.salinity="Factor must be finite and positive";}
    if(u!=="EC"&&u!=="TDS")e.salinity="Choose EC or TDS";
    else if(!e.salinity){if(u==="TDS")for(const k of ["FlowThresholdMin","FlowThresholdMax"]){if(p[k]==null)continue;const v=p[k]*fac;
      if(Math.abs(v-Math.round(v))>1e-9)e["params."+k]="Converted EC must be a whole number";else if(v>MAXP)e["params."+k]="Converted EC is too large";else p[k]=Math.round(v);}
      sal={unit:"EC",tds_factor:fac};}}
  else if(d.salinity)e.salinity="Only salinity rules take salinity units";
  if(Object.keys(e).length)return {e,spec:null};
  return {e,spec:{id:d.id||"u_"+Math.random().toString(36).slice(2,14),code:d.code,name:d.name.trim(),kind,handler:d.handler,gauge:d.gauge,second_gauge:second,pus:[...new Set(d.pus)],objectives:[...new Set(d.objectives||[])],params:p,salinity:sal}};
}
function rowsFor(spec){
  return [...spec.pus].sort().map(pu=>{
    const base=byGauge.get(spec.gauge).get(pu), row=HEAD.map(c=>HIDDEN.includes(c)?base[col(c)]:"");
    const set=(c,v)=>{row[col(c)]=v;};
    set("Code",spec.code);set("FlowLevelVolume",spec.kind==="S"?"F":spec.kind);set("Multigauge",spec.second_gauge||"");
    for(const [f,v] of Object.entries(spec.params)){if(f==="StartDay"||f==="EndDay"||v==null)continue;set(f,String(+v.toPrecision(15)));}
    if(spec.params.StartDay!=null||spec.params.EndDay!=null){const sd=spec.params.StartDay||1,ed=spec.params.EndDay||daysIn(spec.params.EndMonth);
      set("StartMonth",spec.params.StartMonth+"."+String(sd).padStart(2,"0"));set("EndMonth",spec.params.EndMonth+"."+String(ed).padStart(2,"0"));}
    set("EcoObj",spec.objectives.join("+"));return row;});
}
const myRows=()=>[...specs].sort((a,b)=>a.code<b.code?-1:1).flatMap(s=>rowsFor(s).map(r=>({r,code:s.code})));


// Builds the lookup tables from the text of parameter_sheet.csv.
function indexSheet(text){
  const rows=parseCsv(text);HEAD=rows[0];BASE=rows.slice(1);
  const g=col("Gauge"),pu=col("PlanningUnitName");
  for(const r of BASE){if(!byGauge.has(r[g]))byGauge.set(r[g],new Map());if(!byGauge.get(r[g]).has(r[pu]))byGauge.get(r[g]).set(r[pu],r);codes.add(r[col("Code")]);for(const o of r[col("EcoObj")].split("+"))if(o)objs.add(o);}
}

// ---- calc config ----------------------------------------------------------------------------------------------------
// py_ewr finds the handler for a row via "<Code>-<single|multigauge>-<F|V|L>" listed under the handler in ewr_calc_config.json.
const calcKey=s=>`${s.code}-${s.second_gauge?"multigauge":"single"}-${s.kind==="S"?"F":s.kind}`;
// Inserts each spec's key into its handler's list by editing the JSON text, so the rest of the file is left byte-for-byte alone.
function addCalcEntries(text,specs){
  for(const s of specs){
    const head=`"${s.handler}": [`, i=text.indexOf(head);
    if(i<0)throw new Error("calc config has no handler "+s.handler);
    const j=text.indexOf("]",i), key=calcKey(s);
    if(text.slice(i,j).includes(`"${key}"`))continue;
    const end=text.lastIndexOf('"',j)+1;
    text=text.slice(0,end)+`,\n        "${key}"`+text.slice(end);
  }
  JSON.parse(text);return text;
}

// ---- deleting existing rows -----------------------------------------------------------------------------------------
// A row is identified by Code + Gauge + PlanningUnitID, which is unique in the sheet.
const rowKey=r=>r[col("Code")]+"|"+r[col("Gauge")]+"|"+r[col("PlanningUnitID")];
const delKey=d=>d.code+"|"+d.gauge+"|"+d.pu;
const MAX_DELETIONS=500;
// Keeps only entries that name a row present in the sheet; returns {ok, bad}.
function checkDeletions(list){
  const have=new Set(BASE.map(rowKey)), seen=new Set(), ok=[], bad=[];
  for(const d of list){
    const k=d&&typeof d.code==="string"&&typeof d.gauge==="string"&&typeof d.pu==="string"?delKey(d):null;
    if(!k||!have.has(k)){bad.push(d&&String(d.code).slice(0,30)+" (not in the sheet)");continue;}
    if(!seen.has(k)){seen.add(k);ok.push({code:d.code,gauge:d.gauge,pu:d.pu});}}
  if(ok.length>MAX_DELETIONS)bad.push("Too many rows to delete in one go (limit "+MAX_DELETIONS+")");
  return {ok,bad};
}
// Sets the pending deletions and works out which codes lose every row (they become reusable and their calc-config keys go).
function setDeletions(list){
  deletions=list;const gs=new Set(list.map(delKey)),left=new Set();
  for(const r of BASE)if(!gs.has(rowKey(r)))left.add(r[col("Code")]);
  gone=new Set([...codes].filter(c=>!left.has(c)));
}
const liveBase=()=>{const g=new Set(deletions.map(delKey));return g.size?BASE.filter(r=>!g.has(rowKey(r))):BASE;};
// Removes the deleted rows from raw CSV text line by line, so every other byte is untouched.
function dropRows(text){
  const g=new Set(deletions.map(delKey));if(!g.size)return text;
  return text.split(/(?<=\n)/).filter((l,i)=>{if(!i)return true;const rows=parseCsv(l);if(rows.length!==1)throw new Error("Unexpected multi-line CSV row");return !g.has(rowKey(rows[0]));}).join("");
}
// Removes every calc-config key belonging to codes that no longer have any rows.
function removeCalcCodes(text){
  for(const c of gone){const re=new RegExp('^[ \\t]*"'+c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+'-(single|multigauge)-[FVL]",?[ \\t]*\\r?\\n','gm');text=text.replace(re,"");}
  text=text.replace(/,(\s*\n\s*\])/g,"$1");JSON.parse(text);return text;
}
