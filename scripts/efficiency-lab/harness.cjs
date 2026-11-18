const fs=require("fs"),path=require("path"),W=path.join(__dirname,"work");
const page=fs.readFileSync(path.join(W,"efficiency-lab.html"),"utf8");
const pre=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.__errs=[];addEventListener("error",e=>__errs.push(String(e.message)));</script></head><body>`;
const drive=`<script>
try{
 const log=[];const q=s=>document.querySelector(s);
 for(const b of [...document.querySelectorAll("#presets button")].map(b=>b.dataset.p)){q('[data-p="'+b+'"]').click();log.push(b+": top="+document.querySelector("#tbl tbody tr td.nm").firstChild.textContent+" E="+document.querySelector("#tbl tbody tr td.e").textContent);}
 q('[data-p="Current (rejected)"]').click(); q("#pin").click(); q('[data-p="Balanced"]').click();
 log.push("cmp: "+q("#cmp").textContent.replace(/\\s+/g," ").slice(0,300));
 for(const f of ["geo","add","cpc","gate","pareto"]){q('[data-f="'+f+'"]').click();
   for(const s of document.querySelectorAll("#famctl select")){for(const o of s.options){s.value=o.value;s.dispatchEvent(new Event("input",{bubbles:true}));}}
   const r=document.querySelector("#famctl input[type=range]"); if(r){r.value=r.max;r.dispatchEvent(new Event("input",{bubbles:true}));}
   const cb=document.querySelector("#famctl input[type=checkbox]"); if(cb){cb.click();}
   log.push(f+": rows="+document.querySelectorAll("#tbl tbody tr").length+" sens="+q("#sensnote").textContent.slice(0,40)+" pts="+document.querySelectorAll("#plot circle").length);}
 q("#pool").click(); log.push("complete: "+q("#sensnote").textContent.slice(0,10)+" rows "+document.querySelectorAll("#tbl tbody tr").length);
 q("#more").click(); log.push("all rows: "+document.querySelectorAll("#tbl tbody tr").length);
 for(const a of ["e","rank","tok","mem"]){q("#ax").value=a;q("#ax").dispatchEvent(new Event("change"));}
 log.push("spec chars "+q("#spec").value.length);
 document.body.setAttribute("data-log",JSON.stringify(log));
}catch(e){__errs.push("drive: "+e.stack)}
document.body.setAttribute("data-errs",JSON.stringify(__errs));
</script>`;
fs.writeFileSync(path.join(W,"harness.html"),pre+page+drive+"</body></html>");
fs.writeFileSync(path.join(W,"shot.html"),pre+page+"</body></html>");
