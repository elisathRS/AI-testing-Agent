
/* ===== Selftest Agent UI ===== */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const KEY='mdc-selftest-v2';
const DELAY={slow:260,normal:90,turbo:0};
const SPEEDS=[['slow','Slow'],['normal','Normal'],['turbo','Turbo']];
const defaults=()=>({pack:'full',count:60,seed:Math.floor(Math.random()*90000)+10000,speed:'normal',late:50,types:{add:true,drop:true,swap:true},approve:'balanced',unavail:15,blank:'sometimes',closed:8,fail:6,burst:12,extra:true,rules:'both',stopFail:false});
let CFG=defaults(),REPORT=null,AI=null,aiState='idle',aiErr='',VIEW='setup',RUN=null,DL=null,toastT;
try{const j=JSON.parse(localStorage.getItem(KEY)||'null');if(j){if(j.cfg)CFG=Object.assign(defaults(),j.cfg,{types:Object.assign(defaults().types,j.cfg.types||{})});REPORT=j.report||null;AI=j.ai||null}}catch(e){}
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify({cfg:CFG,report:REPORT,ai:AI}))}catch(e){}};
function toast(t){const el=$('#toast');el.innerHTML='<div class="toast" role="status">'+esc(t)+'</div>';clearTimeout(toastT);toastT=setTimeout(()=>{el.innerHTML=''},3200)}
const passesOf=c=>c.rules==='both'?['current','proposed']:[c.rules];
const RLABEL={current:'Current build',proposed:'Proposed fixes',both:'Compare both'};
const fmt=ms=>{const s=Math.max(0,Math.round(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const pct=(v,min,max)=>Math.round((v-min)/(max-min)*100);

/* ---- setup view ---- */
function slider(id,label,min,max,step,val,unit,hint){
  return '<div class="fld"><label for="'+id+'">'+label+'<output id="'+id+'-o">'+val+unit+'</output></label><input type="range" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'" style="--p:'+pct(val,min,max)+'%" data-unit="'+unit+'">'+(hint?'<span class="hint">'+hint+'</span>':'')+'</div>'}
function seg(name,label,opts,val,hint){
  return '<div class="fld"><span class="lb" id="'+name+'-l">'+label+'</span><div class="seg" role="radiogroup" aria-labelledby="'+name+'-l">'+opts.map(o=>'<label><input type="radio" name="'+name+'" value="'+o[0]+'"'+(val===o[0]?' checked':'')+'><span>'+o[1]+'</span></label>').join('')+'</div>'+(hint?'<span class="hint">'+hint+'</span>':'')+'</div>'}
function setupHTML(){
  const groups={};Object.entries(PACKS).forEach(([k,p])=>{(groups[p.group]=groups[p.group]||[]).push([k,p])});
  const packSel='<select id="pack" aria-describedby="packdesc">'+Object.keys(groups).map(g=>'<optgroup label="'+esc(g)+'">'+groups[g].map(([k,p])=>'<option value="'+k+'"'+(CFG.pack===k?' selected':'')+'>'+esc(p.name)+(p.future?'  [preview]':'')+'</option>').join('')+'</optgroup>').join('')+'</select>';
  return '<div class="setup"><div class="col">'
   +'<section class="hud"><div class="hud-h"><div><div class="lbl">01 · Scenario pack</div><h2>What should the agent test?</h2></div></div><div class="hud-b">'
   +'<div class="fld"><label for="pack">Pack</label>'+packSel+'</div><p class="packdesc" id="packdesc"></p>'
   +'<div class="fld"><span class="lb">Quick presets</span><div class="chips"><button class="pchip" data-preset="50">Quick · 50</button><button class="pchip" data-preset="100">Standard · 100</button><button class="pchip" data-preset="300">Stress · 300</button></div></div></div></section>'
   +'<section class="hud"><div class="hud-h"><div><div class="lbl">02 · Size and seed</div><h2>How many cases?</h2></div></div><div class="hud-b"><div class="fields">'
   +slider('count','Number of cases',50,500,10,CFG.count,'','At least 50 per pass. The pack\'s fixed cases run first, random cases fill the rest.')
   +'<div class="fld"><label for="seed">Seed</label><div class="row"><input type="text" id="seed" inputmode="numeric" value="'+esc(CFG.seed)+'" style="flex:1 1 120px;width:auto"><button class="btn sm" data-a="rand" type="button">Randomize</button></div><span class="hint">The same seed replays the same cases.</span></div>'
   +'</div></div></section>'
   +'<section class="hud"><div class="hud-h"><div><div class="lbl">03 · Variables</div><h2>What should vary between cases?</h2></div></div><div class="hud-b"><div class="fields">'
   +slider('late','Requests after the refund deadline',0,100,5,CFG.late,'%','0% tests only the refund window. 100% tests only late requests.')
   +'<div class="fld"><span class="lb">Request types</span><div class="chips" style="display:grid;gap:10px">'+[['add','Add a class'],['drop','Drop a class'],['swap','Swap a class']].map(t=>'<label class="chk"><input type="checkbox" id="t-'+t[0]+'"'+(CFG.types[t[0]]?' checked':'')+'><span>'+t[1]+'</span></label>').join('')+'</div></div>'
   +slider('closed','Office closed when the request arrives',0,100,5,CFG.closed,'%','Future case A2, D2, S2.')
   +slider('fail','Student system fails at swap step 2',0,100,5,CFG.fail,'%','Future case S4. Only applies to swaps.')
   +slider('burst','Bursts of overlapping requests',0,100,5,CFG.burst,'%','Share of random cases that file 2 or 3 requests on the same classes at once.')
   +'<div class="fld"><span class="lb">Catalog</span><label class="chk"><input type="checkbox" id="extra"'+(CFG.extra?' checked':'')+'><span>Include classes that overlap the student\'s meeting times</span></label></div>'
   +'</div></div></section>'
   +'<section class="hud"><div class="hud-h"><div><div class="lbl">04 · Approvers</div><h2>How do approvers behave?</h2></div></div><div class="hud-b"><div class="fields">'
   +seg('approve','Approval rate',[['mostly','Mostly yes'],['balanced','Balanced'],['rarely','Mostly no'],['always','Always yes'],['never','Always no']],CFG.approve)
   +seg('blank','Denial reasons',[['sometimes','Sometimes blank'],['never','Always given'],['always','Always blank']],CFG.blank)
   +slider('unavail','Approver unavailable (reroute)',0,50,5,CFG.unavail,'%','Chance an approver is out and the request is rerouted once.')
   +'</div></div></section>'
   +'<section class="hud"><div class="hud-h"><div><div class="lbl">05 · Engine</div><h2>How should the run behave?</h2></div></div><div class="hud-b"><div class="fields">'
   +seg('speed','Speed',SPEEDS,CFG.speed,'Slow is easy to watch. Turbo finishes 500 cases in seconds.')
   +seg('rules','Rules to test',[['current','Current build'],['proposed','Proposed fixes'],['both','Compare both']],CFG.rules,'Compare runs every case twice and shows which problems the proposed fixes remove.')
   +'<div class="fld wide"><label class="chk"><input type="checkbox" id="stopFail"'+(CFG.stopFail?' checked':'')+'><span>Stop at the first failed check</span></label></div>'
   +'</div></div></section>'
   +'</div><div class="col"><aside class="hud sticky" id="pv" aria-label="Mission preview"></aside></div></div>'}
function cfgNorm(){const c=JSON.parse(JSON.stringify(CFG));c.count=Math.max(50,Math.min(500,parseInt(c.count)||60));c.seed=parseInt(c.seed)||12345;return c}
function previewHTML(){
  const c=cfgNorm(),plan=buildPlan(c),ps=passesOf(c),n=plan.length,total=n*ps.length;
  const cnt={route:0,probe:0,burst:0,random:0};plan.forEach(t=>cnt[t.tag]++);
  const dly=DELAY[c.speed]+(c.speed==='turbo'?1.5:5),est=total*dly;
  const p=PACKS[c.pack],col={route:'#35D3F5',probe:'#8F7CFF',burst:'#FFB84A',random:'#2A4565'};
  const lab={route:'Documented routes',probe:'Edge-case probes',burst:'Overlapping bursts',random:'Random cases'};
  return '<div class="hud-h"><div><div class="lbl">Mission preview</div><h2>Ready to launch</h2></div>'+(p.future?'<span class="tag">Preview pack</span>':'')+'</div><div class="hud-b pv">'
   +'<div><div class="pv-n"><span class="big">'+total+'</span><span class="sub">total cases'+(ps.length>1?' ('+n+' × '+ps.length+' passes)':'')+'</span></div></div>'
   +'<div class="mix" role="img" aria-label="Case mix">'+Object.keys(cnt).filter(k=>cnt[k]).map(k=>'<i style="flex:'+cnt[k]+';background:'+col[k]+'"></i>').join('')+'</div>'
   +'<div class="legend">'+Object.keys(cnt).filter(k=>cnt[k]).map(k=>'<div><i style="background:'+col[k]+'"></i>'+lab[k]+'<b>'+cnt[k]+'</b></div>').join('')+'</div>'
   +'<div class="kv"><div><span>Pack</span><b>'+esc(p.name)+'</b></div><div><span>Rules</span><b>'+RLABEL[c.rules]+'</b></div><div><span>Speed</span><b>'+esc(SPEEDS.find(s=>s[0]===c.speed)[1])+'</b></div><div><span>Seed</span><b>'+c.seed+'</b></div><div><span>Estimated time</span><b>~'+(est<1500?'a few seconds':fmt(est))+'</b></div></div>'
   +(p.future?'<p class="sub">This pack tests proposed rules that are not in the prototype yet. Check them against your flow file.</p>':'')
   +'<button class="btn go" data-a="launch">Launch agent</button></div>'}
function updatePreview(){const el=$('#pv');if(el)el.innerHTML=previewHTML();const d=$('#packdesc');if(d)d.textContent=PACKS[CFG.pack].desc}

/* ---- boot + run ---- */
function bootLines(R){const p=PACKS[R.cfg.pack];return[
  '<b>▸</b> Loading rule set: '+RLABEL[R.cfg.rules],'<b>▸</b> Compiling '+R.plan.length+' scenarios from seed '+R.cfg.seed,'<b>▸</b> Pack: '+esc(p.name),
  '<b>▸</b> Arming approvers: Chair, Instructor, Dean','<b>▸</b> Total to run: '+R.total+' cases','<b>READY</b> Starting the run']}
async function bootSeq(R){
  const L=bootLines(R),box=$('#boot-box');
  for(const l of L){const d=document.createElement('div');d.innerHTML=l;box.appendChild(d);await sleep(R.cfg.speed==='turbo'?90:230)}
  await sleep(R.cfg.speed==='turbo'?150:350)}
function runHTML(R){
  const p=PACKS[R.cfg.pack],mx=R.plan.map(()=>'<span></span>').join('');
  return '<section class="hud"><div class="hud-h"><div><div class="lbl">Mission in progress</div><h2>'+esc(p.name)+'</h2><p class="sub mono" id="r-pass"></p></div><div class="state" id="r-state">Running</div></div><div class="hud-b run">'
   +'<div><div class="readout"><span class="big" id="r-n">000</span><span class="of">/ '+R.total+' cases</span><span class="pct" id="r-pct">0%</span></div>'
   +'<div class="lb" id="r-lb" role="progressbar" aria-label="Cases complete" aria-valuemin="0" aria-valuemax="'+R.total+'" aria-valuenow="0"><i id="r-fill"></i></div>'
   +'<div class="scale" aria-hidden="true"><span>0</span><span>25%</span><span>50%</span><span>75%</span><span>'+R.total+'</span></div>'
   +'<p class="sub mono" id="r-meta" style="margin-top:8px"></p></div>'
   +'<div class="stats"><div class="stat ok"><b id="s-p">0</b><span>passed</span></div><div class="stat warn"><b id="s-f">0</b><span>with findings</span></div><div class="stat bad"><b id="s-x">0</b><span>failed</span></div><div class="stat"><b id="s-i">0</b><span>distinct issues</span></div></div>'
   +'<p class="sub mono" id="r-now" aria-live="polite"></p>'
   +'<div class="run-grid"><div class="hud"><div class="hud-h"><div class="lbl">Case matrix</div><span class="sub mono" id="r-mxl"></span></div><div class="hud-b"><div class="mx" id="r-mx">'+mx+'</div></div></div>'
   +'<div class="hud"><div class="hud-h"><div class="lbl">Live feed</div></div><div class="hud-b"><ul class="feed" id="r-feed" aria-live="off"></ul></div></div></div>'
   +'<div class="ctl"><button class="btn sm" data-a="pause" id="b-pause">Pause</button><button class="btn sm bad" data-a="stop">Stop and report</button>'
   +'<div class="fld" style="margin-left:auto;min-width:200px"><div class="seg" role="radiogroup" aria-label="Live speed">'+SPEEDS.map(o=>'<label><input type="radio" name="livespeed" value="'+o[0]+'"'+(R.speed===o[0]?' checked':'')+'><span>'+o[1]+'</span></label>').join('')+'</div></div></div>'
   +'</div></section>'}
const COLS={pass:'p',finding:'f',fail:'x'};
async function launch(){
  if(RUN&&RUN.active)return;
  const cfg=cfgNorm(),plan=buildPlan(cfg),ps=passesOf(cfg);
  RUN={active:true,paused:false,stop:false,cfg,plan,ps,total:plan.length*ps.length,done:0,speed:cfg.speed,tally:{pass:0,finding:0,fail:0},issues:new Set(),feed:[]};
  const R=RUN;VIEW='boot';render();
  await bootSeq(R);
  VIEW='run';render();$('#r-mx').scrollIntoView&&window.scrollTo({top:0,behavior:'smooth'});
  await runLoop(R)}
function paint(R,pass,i,t){
  const pc=Math.round(R.done/R.total*100);
  $('#r-n').textContent=String(R.done).padStart(String(R.total).length,'0');
  $('#r-pct').textContent=pc+'%';$('#r-fill').style.width=pc+'%';
  $('#r-lb').setAttribute('aria-valuenow',R.done);
  const el=Date.now()-R.t0,rem=R.done?el/R.done*(R.total-R.done):0;
  $('#r-meta').textContent='Elapsed '+fmt(el)+' · about '+fmt(rem)+' left · '+(RUN.paused?'paused':RUN.speed+' speed');
  $('#s-p').textContent=R.tally.pass;$('#s-f').textContent=R.tally.finding;$('#s-x').textContent=R.tally.fail;$('#s-i').textContent=R.issues.size;
  $('#r-pass').textContent='Pass '+(pass+1)+' of '+R.ps.length+' · '+(R.ps[pass]==='current'?'Current build':'Proposed fixes');
  $('#r-mxl').textContent=Math.min(i+1,R.plan.length)+' / '+R.plan.length;
  if(t)$('#r-now').textContent='Testing '+t.id+' · '+t.title}
function feedAdd(res,R){
  const ul=$('#r-feed');if(!ul)return;const li=document.createElement('li');li.className=COLS[res.status];
  li.innerHTML='<b>'+res.id+'</b><span>'+esc(res.status==='pass'?'passed · '+res.title:res.status==='fail'?'FAILED · '+res.title:'finding · '+res.findings.map(k=>FX[k].title).join('; '))+'</span>';
  ul.prepend(li);while(ul.children.length>8)ul.lastChild.remove()}
async function runLoop(R){
  R.t0=Date.now();const out=[];let stopped=false,reason='';
  outer:for(let p=0;p<R.ps.length;p++){
    const key=R.ps[p],rules=RULESETS[key],results=[];out.push({key,results});
    const cells=[...document.querySelectorAll('#r-mx span')];cells.forEach(c=>c.className='');
    R.tally={pass:0,finding:0,fail:0};R.issues=new Set();
    for(let i=0;i<R.plan.length;i++){
      while(R.paused&&!R.stop)await sleep(100);
      if(R.stop){stopped=true;reason='Stopped by the user';break outer}
      const t=R.plan[i];cells[i].className='c';
      if(R.speed==='slow'){paint(R,p,i,t);await sleep(Math.min(120,DELAY.slow/2))}
      const res=runCase(t,rules);results.push(res);R.done++;R.tally[res.status]++;res.findings.forEach(k=>R.issues.add(k));
      cells[i].className=COLS[res.status];feedAdd(res,R);
      if(R.speed!=='turbo'||i%4===0||i===R.plan.length-1)paint(R,p,i,t);
      if(R.cfg.stopFail&&res.status==='fail'){stopped=true;reason='Stopped at the first failed check ('+res.id+')';break outer}
      if(R.speed==='turbo'){if(i%4===3)await sleep(0)}else await sleep(R.speed==='slow'?DELAY.slow/2:DELAY.normal)}}
  R.active=false;
  const ms=Date.now()-R.t0,keep=out.filter(o=>o.results.length);
  if(!keep.length){VIEW='setup';RUN=null;render();toast('Stopped before any case finished');return}
  REPORT=buildReport(keep,R.cfg,{date:new Date().toLocaleString(),ms,stopped,reason,total:R.total,done:R.done});
  AI=null;aiState='idle';persist();RUN=null;VIEW='report';render();window.scrollTo({top:0,behavior:'smooth'});
  toast(stopped?'Stopped. Partial report is ready':'Run complete. Report is ready')}

/* ---- report ---- */
const RES={pass:['Passed','ok'],fail:['Failed','bad'],finding:['Finding','warn']};
function reportHTML(rp){
  const P=rp.passes,M=P[0],m=rp.meta,t=M.tally,cmp=rp.compare;
  const tiles='<div class="tiles"><div class="tile cy"><b>'+M.results.length+'</b><span>cases per pass</span></div><div class="tile ok"><b>'+t.pass+'</b><span>passed</span></div><div class="tile warn"><b>'+t.finding+'</b><span>with findings</span></div><div class="tile bad"><b>'+t.fail+'</b><span>failed a check</span></div><div class="tile"><b>'+M.findings.length+'</b><span>distinct issues</span></div>'
    +(cmp?'<div class="tile ok"><b>'+cmp.filter(c=>c.verdict==='Resolved').length+' / '+cmp.length+'</b><span>fixed by proposals</span></div>':'')+'</div>';
  const cmpT=cmp?'<section class="hud"><div class="hud-h"><div><div class="lbl">Fix impact</div><h2>What the proposed fixes change</h2><p class="sub">The same '+M.results.length+' cases ran against the current build and against the build with every proposed rule switched on.</p></div></div><div class="hud-b"><div class="tw"><table><thead><tr><th>Issue</th><th>Severity</th><th>Current build</th><th>Proposed fixes</th><th>Result</th></tr></thead><tbody>'
    +cmp.map(c=>'<tr><td>'+esc(FX[c.key].title)+'</td><td><span class="pill '+FX[c.key].sev+'">'+FX[c.key].sev+'</span></td><td class="n">'+c.cur+' case'+(c.cur===1?'':'s')+'</td><td class="n">'+c.pro+' case'+(c.pro===1?'':'s')+'</td><td><span class="pill '+(c.verdict==='Resolved'?'ok':'bad')+'">'+c.verdict+'</span></td></tr>').join('')+'</tbody></table></div></div></section>':'';
  const issues=M.findings.map(f=>{const x=FX[f.key],cv=cmp&&cmp.find(c=>c.key===f.key);
    return '<article class="issue '+x.sev+'"><div class="issue-top"><div><div class="row"><span class="pill '+x.sev+'">'+x.sev+'</span><span class="pill">'+x.type+'</span>'+(cv?'<span class="pill '+(cv.verdict==='Resolved'?'ok':'bad')+'">'+(cv.verdict==='Resolved'?'Fixed by the proposal':'Still open with the proposal')+'</span>':'')+'</div><h3 style="margin-top:8px">'+esc(x.title)+'</h3></div><span class="sub mono">'+f.count+' case'+(f.count>1?'s':'')+'</span></div>'
     +'<p><b>What happened.</b> '+esc(f.ev[0])+'</p>'+(f.ev[1]?'<p class="sub">Also: '+esc(f.ev[1])+'</p>':'')
     +'<p><b>Add to the flow.</b> '+esc(x.rec)+'</p><p class="sub mono">Rule simulated: '+esc(RULE_LABELS[x.rule])+' · seen in '+f.ids.slice(0,12).join(', ')+(f.ids.length>12?' and '+(f.ids.length-12)+' more':'')+'</p></article>'}).join('');
  const cov=Object.keys(M.cov).sort((a,b)=>(a==='Direct')-(b==='Direct')||a.localeCompare(b)).map(k=>{const c=M.cov[k];return '<tr><td><b>'+esc(k)+'</b></td><td class="n">'+c.runs+'</td><td class="n">'+c.pass+'</td><td class="n">'+c.finding+'</td><td class="n">'+c.fail+'</td></tr>'}).join('');
  const rows=M.results.map((r,i)=>{const s=RES[r.status],o=P[1]&&P[1].results[i],bad=r.checks.filter(c=>!c.ok);
    return '<tr><td class="mono">'+r.id+'</td><td>'+esc(r.title)+'</td><td>'+esc(r.sc)+'</td><td>'+esc(r.desc)+'</td><td><details><summary><span class="pill '+s[1]+'">'+s[0]+'</span></summary><ul>'+bad.map(c=>'<li class="x">'+esc(c.msg)+'</li>').join('')+r.findings.map(k=>'<li class="x">'+esc(FX[k].title)+': '+esc(r.ev[k])+'</li>').join('')+r.checks.filter(c=>c.ok).map(c=>'<li>'+esc(c.msg)+'</li>').join('')+'</ul></details></td>'+(o?'<td><span class="pill '+RES[o.status][1]+'">'+RES[o.status][0]+'</span></td>':'')+'</tr>'}).join('');
  return '<section class="hud"><div class="hud-h"><div><div class="lbl">Mission report</div><h2>'+esc(PACKS[rp.cfg.pack].name)+'</h2><p class="sub mono">'+esc(m.date)+' · seed '+rp.cfg.seed+' · '+fmt(m.ms)+' · '+P.map(p=>p.label).join(' + ')+(m.stopped?' · '+esc(m.reason):'')+'</p></div>'
   +'<div class="ctl"><button class="btn sm" data-a="copy">Copy report</button>'+(DL?'<button class="btn sm" data-a="save">Save file</button>':'')+'<button class="btn sm" data-a="again">New mission</button></div></div><div class="hud-b">'+tiles+'<textarea id="md" hidden readonly aria-label="Report text"></textarea></div></section>'
   +cmpT
   +'<section class="hud"><div class="hud-h"><div><div class="lbl">Where the flow stops or breaks</div><h2>Issues and what to add</h2><p class="sub">'+(P[0].key==='proposed'?'Issues that remain even with the proposed fixes.':'Issues found in the current build, most serious first.')+'</p></div></div><div class="hud-b issues">'+(issues||'<div class="empty">No issues found in this run.</div>')+'</div></section>'
   +'<section class="hud"><div class="hud-h"><div><div class="lbl">Claude\'s analysis</div><h2>Risks, recommendations and cases to test next</h2></div></div><div class="hud-b">'+aiHTML()+'</div></section>'
   +'<section class="hud"><div class="hud-h"><div><div class="lbl">Route coverage</div><h2>Random and documented flows by route</h2></div></div><div class="hud-b"><div class="tw"><table><thead><tr><th>Route</th><th>Runs</th><th>Passed</th><th>Findings</th><th>Failed</th></tr></thead><tbody>'+cov+'</tbody></table></div><p class="sub">Not in the prototype yet: A2, D2, S2 office-closed variants and S4 conflict rollback. The future-case packs test proposed rules for them.</p></div></section>'
   +'<section class="hud"><div class="hud-h"><div><div class="lbl">All cases</div><h2>Every scenario and its checks</h2></div></div><div class="hud-b"><div class="tw"><table><thead><tr><th>ID</th><th>Scenario</th><th>Route</th><th>Decisions</th><th>'+(P[1]?'Current':'Result')+'</th>'+(P[1]?'<th>Proposed</th>':'')+'</tr></thead><tbody>'+rows+'</tbody></table></div></div></section>'
   +'<p class="foot">This agent tests a built-in copy of the Class Changes rules. Proposed fixes are simulated rules, not changes to the prototype.</p>'}
const arr=x=>Array.isArray(x)?x:[];
function aiHTML(){
  if(aiState==='busy')return '<p class="sub mono">Claude is reading the results and writing recommendations…</p>';
  if(AI){const a=AI;return '<div class="ai">'+(a.summary?'<p>'+esc(a.summary)+'</p>':'')
   +(arr(a.top_risks).length?'<h3>Top risks</h3><ol>'+arr(a.top_risks).map(x=>'<li><b>'+esc(x.title)+'.</b> '+esc(x.why)+'</li>').join('')+'</ol>':'')
   +(arr(a.recommendations).length?'<h3>What to add to the flow</h3><ol>'+arr(a.recommendations).map(x=>'<li><span class="pill '+(x.priority==='Now'?'bad':x.priority==='Later'?'':'warn')+'">'+esc(x.priority||'Next')+'</span> <b>'+esc(x.title)+'.</b> '+esc(x.detail)+'</li>').join('')+'</ol>':'')
   +(arr(a.untested_edge_cases).length?'<h3>Edge cases to test next</h3><ul>'+arr(a.untested_edge_cases).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')
   +'<p class="sub">Written by Claude from this run\'s results. Review before sharing.</p></div>'}
  if(aiState==='off')return '<p class="sub">Claude\'s analysis is not available in this view. The issues and recommendations above are complete without it.</p>';
  if(aiState==='err')return '<p class="sub">'+esc(aiErr)+'</p><div style="margin-top:10px"><button class="btn sm" data-a="ai">Try again</button></div>';
  return '<div><button class="btn" data-a="ai">Write analysis with Claude</button></div>'}
async function runAI(){
  if(aiState==='busy'||!REPORT)return;aiState='busy';render();
  let sample=null;try{sample=window.claude&&window.claude.use?await window.claude.use('sample'):null}catch(e){}
  if(!sample){aiState='off';render();return}
  const rp=REPORT,M=rp.passes[0];
  const data={pack:PACKS[rp.cfg.pack].name,cases_per_pass:M.results.length,tally:M.tally,route_coverage:M.cov,
    findings:M.findings.map(f=>({title:FX[f.key].title,severity:FX[f.key].sev,type:FX[f.key].type,cases:f.count,evidence:f.ev,built_in_recommendation:FX[f.key].rec})),
    proposed_fix_impact:rp.compare?rp.compare.map(c=>({title:FX[c.key].title,current_cases:c.cur,with_proposed_fixes:c.pro,result:c.verdict})):null,
    failed_checks:M.results.filter(r=>r.status==='fail').slice(0,10).map(r=>({id:r.id,title:r.title,failed:r.checks.filter(c=>!c.ok).map(c=>c.msg)})),
    not_built_yet:['A2, D2, S2 office-closed variants','S4 conflict rollback']};
  const prompt='You are a QA lead reviewing automated test results for a college class add/drop/swap approval prototype. Routes: A1 blocked add goes to the Department Chair; A3 late add goes to the Instructor; D1 drop of a class with a hold goes to the Chair; D3 late drop goes to the Dean of Students (if denied the student picks a W with no refund or keeps the class); S1 blocked swap goes to the Chair; S3 late swap goes to the Instructor then the Dean. '
   +'Using only the data below, write for the project team. Return JSON only, no markdown: {"summary": string (3 to 4 plain sentences), "top_risks": [{"title": string, "why": string}] (3 to 5, most serious first), "untested_edge_cases": [string] (4 to 6 cases this run did not cover that could stop the flow), "recommendations": [{"title": string, "detail": string, "priority": "Now" | "Next" | "Later"}] (5 to 8 concrete additions to the process flow)}.\n\nDATA:\n'+JSON.stringify(data);
  try{let out;
    if(typeof sample.json==='function')out=await sample.json(prompt,{modelTier:'default'});else{const r=await sample(prompt,{modelTier:'default'});out=r.text}
    if(typeof out==='string')out=JSON.parse(out.replace(/^\s*```(json)?/,'').replace(/```\s*$/,''));
    if(!out||typeof out!=='object')throw new Error('empty');AI=out;aiState='idle';persist()}
  catch(e){const c=e&&e.code;aiState=c==='not_granted'?'off':'err';aiErr=c==='rate_limited'?'Claude is busy right now. Try again in a minute.':'Claude could not finish the analysis this time.'}
  render()}
function reportMD(rp){
  const M=rp.passes[0],m=rp.meta,t=M.tally,L=[];
  L.push('# Class Changes selftest report','',m.date+' · seed '+rp.cfg.seed+' · pack: '+PACKS[rp.cfg.pack].name+' · '+rp.passes.map(p=>p.label).join(' + ')+' · '+fmt(m.ms)+(m.stopped?' · '+m.reason:''),'',
   M.results.length+' cases per pass. Passed '+t.pass+', with findings '+t.finding+', failed a check '+t.fail+'. Distinct issues: '+M.findings.length+'.','');
  if(rp.compare){L.push('## Fix impact','','| Issue | Severity | Current build | Proposed fixes | Result |','|---|---|---|---|---|');rp.compare.forEach(c=>L.push('| '+FX[c.key].title+' | '+FX[c.key].sev+' | '+c.cur+' | '+c.pro+' | '+c.verdict+' |'));L.push('')}
  L.push('## Where the flow stops or breaks','');
  M.findings.forEach(f=>{const x=FX[f.key];L.push('### ['+x.sev+'] '+x.title+' ('+f.count+' case'+(f.count>1?'s':'')+')','- Type: '+x.type,'- What happened: '+f.ev[0]);if(f.ev[1])L.push('- Also: '+f.ev[1]);L.push('- Add to the flow: '+x.rec,'- Seen in: '+f.ids.join(', '),'')});
  if(AI){const a=AI;L.push("## Claude's analysis",'',a.summary||'','');
    if(arr(a.top_risks).length){L.push('Top risks:');arr(a.top_risks).forEach((x,i)=>L.push((i+1)+'. '+x.title+': '+x.why));L.push('')}
    if(arr(a.recommendations).length){L.push('What to add to the flow:');arr(a.recommendations).forEach((x,i)=>L.push((i+1)+'. ['+(x.priority||'Next')+'] '+x.title+': '+x.detail));L.push('')}
    if(arr(a.untested_edge_cases).length){L.push('Edge cases to test next:');arr(a.untested_edge_cases).forEach(x=>L.push('- '+x));L.push('')}}
  L.push('## All cases','','| ID | Scenario | Route | Decisions | '+(rp.passes[1]?'Current | Proposed':'Result')+' | Notes |','|---|---|---|---|'+(rp.passes[1]?'---|---|':'---|')+'---|');
  M.results.forEach((r,i)=>{const o=rp.passes[1]&&rp.passes[1].results[i];L.push('| '+r.id+' | '+r.title+' | '+r.sc+' | '+r.desc+' | '+RES[r.status][0]+(o?' | '+RES[o.status][0]:'')+' | '+[...r.checks.filter(c=>!c.ok).map(c=>c.msg),...r.findings.map(k=>FX[k].title)].join('; ').replace(/\|/g,'/')+' |')});
  return L.join('\n')}

/* ---- shell ---- */
function render(){
  const busy=!!(RUN&&RUN.active);
  document.querySelectorAll('.nav button').forEach(b=>{const v=b.dataset.v;b.setAttribute('aria-pressed',String((v==='setup'&&(VIEW==='setup'||VIEW==='boot'||VIEW==='run'))||(v==='report'&&VIEW==='report')));
    b.disabled=busy||(v==='report'&&!REPORT)});
  const main=$('#main');
  if(VIEW==='setup'){main.innerHTML=setupHTML();updatePreview()}
  else if(VIEW==='boot'){main.innerHTML='<section class="hud"><div class="hud-h"><div><div class="lbl">Initializing</div><h2>Preparing the mission</h2></div></div><div class="hud-b"><div class="boot" id="boot-box"></div></div></section>'}
  else if(VIEW==='run'){main.innerHTML=runHTML(RUN)}
  else main.innerHTML=reportHTML(REPORT)}
document.addEventListener('click',e=>{
  const nv=e.target.closest('.nav button');if(nv&&!nv.disabled){VIEW=nv.dataset.v==='report'?'report':'setup';render();window.scrollTo(0,0);return}
  const pc=e.target.closest('[data-preset]');if(pc){CFG.count=+pc.dataset.preset;CFG.seed=Math.floor(Math.random()*90000)+10000;persist();render();return}
  const el=e.target.closest('[data-a]');if(!el)return;const a=el.dataset.a;
  if(a==='launch'){persist();launch()}
  else if(a==='rand'){CFG.seed=Math.floor(Math.random()*90000)+10000;$('#seed').value=CFG.seed;persist();updatePreview()}
  else if(a==='pause'&&RUN){RUN.paused=!RUN.paused;el.textContent=RUN.paused?'Resume':'Pause';const s=$('#r-state');s.textContent=RUN.paused?'Paused':'Running';s.classList.toggle('paused',RUN.paused)}
  else if(a==='stop'&&RUN){RUN.stop=true;RUN.paused=false}
  else if(a==='again'){VIEW='setup';render();window.scrollTo(0,0)}
  else if(a==='ai')runAI();
  else if(a==='copy'&&REPORT){const md=reportMD(REPORT),ta=$('#md');
    const fb=()=>{ta.hidden=false;ta.value=md;ta.focus();ta.select();toast('Select all and copy the text below')};
    try{navigator.clipboard.writeText(md).then(()=>toast('Report copied as Markdown'),fb)}catch(x){fb()}}
  else if(a==='save'&&REPORT&&DL){const md=reportMD(REPORT),fn='class-changes-selftest-'+REPORT.cfg.seed+'.md';
    DL.save({filename:fn,data:md}).then(()=>toast('Saved '+fn)).catch(x=>{if(x&&x.code==='cancelled')return;toast('The file was not saved. Use Copy report instead.')})}});
document.addEventListener('input',e=>{
  const id=e.target.id;
  if(e.target.type==='range'&&RANGES.includes(id)){CFG[id]=+e.target.value;const o=$('#'+id+'-o');if(o)o.textContent=e.target.value+e.target.dataset.unit;e.target.style.setProperty('--p',pct(+e.target.value,+e.target.min,+e.target.max)+'%');updatePreview()}});
const RANGES=['count','late','closed','fail','burst','unavail'];
document.addEventListener('change',e=>{
  const t=e.target,id=t.id;if(VIEW==='run'&&t.name==='livespeed'){RUN.speed=t.value;return}
  if(id==='pack'){CFG.pack=t.value;const d=PACKS[t.value].def;CFG.burst=d.burst;CFG.closed=d.closed;CFG.fail=d.fail;CFG.extra=d.extra;CFG.types=d.types==='swap'?{add:false,drop:false,swap:true}:{add:true,drop:true,swap:true};persist();render()}
  else if(id==='seed'){CFG.seed=parseInt(t.value)||CFG.seed;t.value=CFG.seed;persist();updatePreview()}
  else if(id&&id.startsWith('t-')){CFG.types[id.slice(2)]=t.checked;if(!CFG.types.add&&!CFG.types.drop&&!CFG.types.swap){CFG.types[id.slice(2)]=true;t.checked=true;toast('Keep at least one request type')}persist();updatePreview()}
  else if(id==='extra'){CFG.extra=t.checked;persist();updatePreview()}
  else if(id==='stopFail'){CFG.stopFail=t.checked;persist()}
  else if(t.type==='radio'&&['speed','approve','blank','rules'].includes(t.name)){CFG[t.name]=t.value;persist();updatePreview()}
  else if(RANGES.includes(id))persist()});
(async()=>{try{if(window.claude&&window.claude.use){DL=await window.claude.use('downloads');if(VIEW==='report')render()}}catch(e){}})();
if(!REPORT)document.querySelector('.nav [data-v="report"]').disabled=true;
render();
