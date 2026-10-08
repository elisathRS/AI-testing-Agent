
/* ================= Test agent ================= */
const FX={
 F2:{sev:'Critical',type:'Breaks the record',title:'A request still completes after its class changed',
   rec:'Lock a class while it has a request in review (hide Drop and Swap on it), re-check the schedule at every approval, and cancel any request whose class is no longer on the schedule.'},
 F10:{sev:'High',type:'Stops the flow',title:'A request can wait forever on an approver',
   rec:'Add a response deadline (for example 2 business days) that escalates on its own, name the alternate approver, cap manual reroutes, and tell the student when a request is escalated.'},
 F13:{sev:'High',type:'Stops the flow',title:'Students cannot cancel a request that is in review',
   rec:'Add a "Cancel request" action on pending requests. It should notify the current approver and record the cancellation in the audit trail.'},
 F1:{sev:'High',type:'Breaks the record',title:'Duplicate requests for the same class are accepted',
   rec:'Before submitting, check for an open request on the same class and show "You already have a request for this class in review" with a link to it.'},
 F3:{sev:'High',type:'Policy gap',title:'Requests that cross the refund deadline keep the pre-deadline refund',
   rec:'Decide which date governs (submission or approval), show it on the request, and warn or re-route when the deadline passes while a request is pending.'},
 F4:{sev:'High',type:'Policy gap',title:'Swapping out of a class skips its department hold',
   rec:'Check holds on the class being dropped in a swap and add the Chair step when it has one, the same way a plain drop does (D1).'},
 F5:{sev:'High',type:'Policy gap',title:'After the deadline, prerequisites and holds are not checked',
   rec:'Run the same blocker checks for late adds and swaps (A3, S3). Add the Chair step for a hold or missing prerequisite, or show those blockers to the instructor before approval.'},
 F11:{sev:'High',type:'Access control',title:'Every instructor sees every instructor request',
   rec:'Filter the instructor queue to classes that instructor teaches, and check on approval that the approver is the instructor of record or their delegate.'},
 F15:{sev:'Medium',type:'Stops the flow',title:'The "W or keep the class" choice has no deadline',
   rec:'Show the last day to withdraw on the choice, send reminders, and close the request (keeping the class) if the student does not answer by then.'},
 F6:{sev:'Medium',type:'Breaks the record',title:'Seat counts do not change after enrollment',
   rec:'Update seats on every add, drop and swap, and re-check capacity at approval time so two approvals cannot fill the last seat twice.'},
 F7:{sev:'Medium',type:'Policy gap',title:'No maximum credit check',
   rec:'Warn, or route for approval, when a change takes the student above the college\'s term credit limit.'},
 F8:{sev:'Medium',type:'Policy gap',title:'A student can drop every class with no warning',
   rec:'Warn when a change drops the student below full-time (12 credits) or to zero, and point them to Financial Aid and an advisor before they confirm.'},
 F9:{sev:'Medium',type:'Student experience',title:'Denials can be sent without a reason',
   rec:'Require a reason when an approver denies, with a short list of common reasons to pick from.'},
 F12:{sev:'Medium',type:'Breaks the record',title:'The audit trail stamps decisions with the submission date',
   rec:'Record the actual date, time and approver name on each audit entry.'},
 F14:{sev:'Low',type:'Stops the flow',title:'Add and Swap dead-end when no classes are left to pick',
   rec:'Show an empty state that explains why the list is empty and links to other sections or a waitlist.'}
};
const SEVR={Critical:0,High:1,Medium:2,Low:3};
const AG={running:false,paused:false,stop:false,count:60,seed:Math.floor(Math.random()*90000)+10000,speed:'normal',
  report:null,ai:null,aiState:'idle',aiErr:'',cur:null,lines:[],tally:{pass:0,fail:0,finding:0},idx:0,total:0,nextSeq:3001,dl:null};
const AKEY='mdc-class-changes-agent-v1';
try{const j=localStorage.getItem(AKEY);if(j){const o=JSON.parse(j);AG.report=o.report||null;AG.ai=o.ai||null;if(o.seed)AG.seed=o.seed}}catch(e){}
function saveAg(){try{localStorage.setItem(AKEY,JSON.stringify({report:AG.report,ai:AG.ai,seed:AG.seed}))}catch(e){}}
const SPD={watch:[650,450],normal:[220,150],fast:[20,10]};
const STOP={stop:1};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const q=s=>document.querySelector(s);
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
const NOTES=['I need this for my program plan.','My work schedule changed this term.','My advisor recommended this change.','This class conflicts with my new job hours.'];
const REASONS=['No seats can be added to this section.','Prerequisite must be completed first.','Request came in after the cutoff for this exception.','Please meet with an advisor first.'];

/* ---- chrome: cursor, shield, live console ---- */
function say(t,c){AG.lines.push({t,c:c||''});if(AG.lines.length>80)AG.lines.shift();conRender()}
function conShell(){
  const c=$('#ag-console');
  c.innerHTML='<div class="ag-ch"><b>Test agent</b><span id="ag-state"></span></div><div id="ag-dyn"></div>'
   +'<div class="ag-btns"><button class="btn ghost sm" data-g="pause" id="ag-pause">Pause</button><button class="btn danger sm" data-g="stop">Stop</button>'
   +'<label class="c-meta" for="ag-live">Speed<select id="ag-live">'+[['watch','Watch'],['normal','Normal'],['fast','Fast']].map(o=>'<option value="'+o[0]+'"'+(AG.speed===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label></div>'}
function conRender(){
  const d=$('#ag-dyn');if(!d)return;
  const t=AG.cur,pct=AG.total?Math.round(Math.max(0,AG.idx-1)/AG.total*100):0;
  $('#ag-state').innerHTML=AG.paused?chip('Paused','warn'):chip('Running','ok');
  const pb=$('#ag-pause');if(pb)pb.textContent=AG.paused?'Resume':'Pause';
  d.style.display='grid';d.style.gap='10px';
  d.innerHTML='<div class="ag-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><i style="width:'+pct+'%"></i></div>'
   +'<div class="ag-now"><span class="req-id">Scenario '+AG.idx+' of '+AG.total+(t?' · '+t.id:'')+'</span><b>'+esc(t?t.title:'Starting')+'</b></div>'
   +'<div class="ag-tally">'+chip(AG.tally.pass+' passed','ok')+chip(AG.tally.fail+' failed','bad')+chip(AG.tally.finding+' with findings','warn')+'</div>'
   +'<ol class="ag-log" aria-live="polite">'+AG.lines.slice(-7).map(l=>'<li class="'+l.c+'">'+esc(l.t)+'</li>').join('')+'</ol>'}
function chrome(on){
  ['#ag-shield','#ag-console','#ag-cursor'].forEach(s=>{$(s).hidden=!on});
  if(on)conShell();else{$('#ag-cursor').style.transform='translate(-60px,-60px)'}}
async function gate(){if(AG.stop)throw STOP;while(AG.paused){await sleep(120);if(AG.stop)throw STOP}}
async function point(el,label){
  await gate();
  if(!el)throw {missing:label};
  if(el.scrollIntoView)el.scrollIntoView({block:'center',inline:'nearest'});
  await sleep(16);
  const r=el.getBoundingClientRect(),c=$('#ag-cursor'),sp=SPD[AG.speed]||SPD.normal;
  c.style.transitionDuration=sp[0]+'ms';
  c.style.transform='translate('+Math.round(r.left+Math.min(r.width/2,48))+'px,'+Math.round(r.top+r.height/2)+'px)';
  el.classList.add('ag-hl');say(label);
  await sleep(sp[0]+sp[1]);el.classList.remove('ag-hl');await gate()}
async function tap(el,label){await point(el,label);el.click();await sleep(Math.max(15,(SPD[AG.speed]||SPD.normal)[1]/2))}
async function typeIn(el,text){
  await point(el,'Type "'+text+'"');
  el.focus();const st=AG.speed==='fast'?text.length:3;
  for(let i=0;i<text.length;i+=st){el.value=text.slice(0,i+st);await sleep(AG.speed==='watch'?35:12)}
  el.value=text;el.blur()}

/* ---- UI drivers ---- */
async function gotoView(v){if(S.view!==v)await tap(q('#tabs button[data-v="'+v+'"]'),'Open the '+(v==='student'?'Student':'Approver')+' view')}
async function gotoRole(role){await gotoView('approver');if(S.role!==role)await tap(q('[data-a="role"][data-v="'+role+'"]'),'Act as '+ROLES[role])}
async function setup(late){
  closeWiz();
  S={sim:'before',view:'student',role:'chair',seq:AG.nextSeq,courses:CUR.map(c=>c.code),reqs:[],notes:[]};
  render();window.scrollTo(0,0);say('New student record: 4 classes, 12 credits');
  if(late)await tap(q('#simseg button[data-v="after"]'),'Set today to Oct 8 (refund deadline passed)')}
async function submitVia(type,drop,add,note,roles,chk){
  await gotoView('student');
  if(type==='add')await tap(q('[data-a="wiz"][data-t="add"]'),'Click "+ Add a class"');
  else await tap(q('[data-a="wiz"][data-t="'+type+'"][data-d="'+drop+'"]'),'Click '+(type==='drop'?'Drop':'Swap')+' on '+drop);
  if(type!=='drop'){
    const inp=q('#wiz input[name="cls"][value="'+add+'"]');
    await tap(inp&&inp.closest('.opt'),'Choose '+add);
    await tap(q('#wnext'),'Continue');}
  if(roles&&chk){
    const w=q('#wiz .why b'),needs=roles.length>0;
    chk(w&&w.textContent===(needs?'Approval needed':'No approval needed'),'Review screen says "'+(needs?'Approval needed':'No approval needed')+'"');
    if(needs){const ch=[...document.querySelectorAll('#wiz .route .chip')].map(x=>x.textContent);
      chk(ch.length===roles.length,'Review screen lists '+roles.length+' reviewer(s)'+(ch.length?': '+ch.join(' → '):''))}}
  if(note){const t=q('#wnote');if(t)await typeIn(t,note)}
  const before=S.reqs.length;
  await tap(q('#wgo'),'Submit');
  return S.reqs.length>before?S.reqs[0]:null}
async function decideVia(r,ok,reason,reroutes){
  const st=r.steps.find(s=>s.state==='active');if(!st)throw {missing:'an open approval step on '+r.id};
  await gotoRole(st.role);
  if(!q('[data-a="dec"][data-id="'+r.id+'"]'))throw {missing:r.id+' in the '+ROLES[st.role]+' queue'};
  for(let i=0;i<(reroutes||0);i++)await tap(q('[data-a="alt"][data-id="'+r.id+'"]'),'Approver unavailable: reroute');
  if(reason)await typeIn(document.getElementById('n-'+r.id),reason);
  await tap(q('[data-a="dec"][data-id="'+r.id+'"][data-v="'+(ok?1:0)+'"]'),(ok?'Approve':'Deny')+' as '+ROLES[st.role])}
async function confirmVia(r,yes){
  await gotoView('student');
  await tap(q('[data-a="conf"][data-id="'+r.id+'"][data-v="'+(yes?1:0)+'"]'),yes?'Student: Withdraw with a W':'Student: Keep the class')}

/* ---- spec (independent of the app's routing code) ---- */
const specBlock=c=>!!c&&((c.cap&&c.seats>=c.cap)||!!c.prereq||!!c.hold);
function spec(type,drop,add,late){
  const a=add&&get(add),d=drop&&get(drop);
  if(type==='add')return late?{sc:'A3',roles:['instructor']}:specBlock(a)?{sc:'A1',roles:['chair']}:{sc:'direct',roles:[]};
  if(type==='drop')return late?{sc:'D3',roles:['dean']}:d.hold?{sc:'D1',roles:['chair']}:{sc:'direct',roles:[]};
  return late?{sc:'S3',roles:['instructor','dean']}:specBlock(a)?{sc:'S1',roles:['chair']}:{sc:'direct',roles:[]}}
function applyChange(c,t){c=c.slice();if(t.type!=='drop'&&!c.includes(t.add))c.push(t.add);if(t.type!=='add')c=c.filter(x=>x!==t.drop);return c}
const sameSet=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
const shortRole=r=>r==='instructor'?'Instructor':r==='dean'?'Dean':'Chair';

async function runFlow(t,res,chk,find){
  await setup(t.late);
  const start=S.courses.slice();
  const r=await submitVia(t.type,t.drop,t.add,t.note,t.sp.roles,chk);
  chk(r,'A request was created');if(!r)return;
  res.req=r.id;
  chk(r.sc===t.sp.sc,'Routed as '+t.sp.sc+(r.sc!==t.sp.sc?' (app used '+r.sc+')':''));
  chk(r.steps.map(s=>s.role).join()===t.sp.roles.join(),'Approval chain: '+(t.sp.roles.map(x=>ROLES[x]).join(' → ')||'none needed'));
  let made=0,rer=0;
  for(let i=0;i<t.sp.roles.length;i++){
    if(r.status!=='pending')break;
    await decideVia(r,t.dec[i],t.reasons[i],t.reroute[i]);made++;rer+=t.reroute[i];
    if(!t.dec[i])break}
  const deniedAt=t.dec.slice(0,t.sp.roles.length).indexOf(false);
  let expStatus='completed',expCourses=applyChange(start,t);
  if(deniedAt>=0){
    if(t.sp.sc==='D3'){chk(r.status==='needs','Student is asked to choose: W with no refund, or keep the class');
      if(r.status==='needs')await confirmVia(r,t.wChoice);
      expStatus=t.wChoice?'completed':'cancelled';expCourses=t.wChoice?start.filter(c=>c!==t.drop):start}
    else{expStatus='denied';expCourses=start}}
  res.final=r.status;
  chk(r.status===expStatus,'Final status is '+expStatus+(r.status!==expStatus?' (got '+r.status+')':''));
  chk(sameSet(S.courses,expCourses),'Schedule matches the expected '+expCourses.length+' classes');
  chk(r.audit.length>=1+made+rer,'Audit trail has an entry for each step ('+r.audit.length+' entries)');
  chk(S.notes.length>=1+Math.max(0,made-1),'Student received updates ('+S.notes.length+')');
  await gotoView('student');
  const card=q('#app .req');await point(card&&card.querySelector('.chip'),'Check the request card');
  chk(card&&card.querySelector('.chip').textContent===STAT[r.status][0],'Request card shows "'+STAT[r.status][0]+'"');
  if(r.status==='completed'&&t.add){const a=get(t.add);if(a.cap)find('F6','Enrolled in '+t.add+', but the section still shows '+a.seats+'/'+a.cap+' seats taken.')}
  if(r.status==='denied'&&!/Reason:/.test(r.outcome)){const i=t.dec.indexOf(false);if(i>=0&&!t.reasons[i])find('F9',r.id+' was denied with no reason. The student only sees "'+r.outcome.split('.')[0]+'."')}
  if(t.type==='swap'&&!t.late&&get(t.drop).hold&&r.sc==='direct')find('F4','Swapped out of '+t.drop+' ('+get(t.drop).hold+') with no approval.');
  if(t.late&&t.add){const a=get(t.add);if((a.prereq||a.hold)&&!r.steps.some(s=>s.role==='chair'))find('F5',t.add+' has '+(a.prereq?'a missing prerequisite':a.hold)+', but after the deadline it only went to '+r.steps.map(s=>shortRole(s.role)).join(' → ')+'.')}}

/* ---- edge probes ---- */
const PROBES=[
 {title:'Edge: submit the same add twice',async run(res,chk,find){
   await setup(false);
   const r1=await submitVia('add',null,'BSC 1010','',null,null);chk(r1&&r1.status==='pending','First request is in review');
   const r2=await submitVia('add',null,'BSC 1010','',null,null);
   if(r2)find('F1','A second request ('+r2.id+') for BSC 1010 was accepted while '+r1.id+' was still in review.');else chk(true,'Duplicate was blocked')}},
 {title:'Edge: drop a class while its swap is in review',async run(res,chk,find){
   await setup(false);
   const r=await submitVia('swap','ENC 1101','BSC 1010','',null,null);chk(r&&r.sc==='S1','Swap went to the Chair (S1)');
   const d=await submitVia('drop','ENC 1101',null,'',null,null);chk(d&&d.status==='completed','Direct drop of ENC 1101 completed with a refund');
   await decideVia(r,true,'');
   if(r.status==='completed')find('F2','Swap '+r.id+' completed after ENC 1101 was already dropped and refunded by '+d.id+'. The record says tuition moved from a class the student no longer had.')}},
 {title:'Edge: refund deadline passes while a drop is in review',async run(res,chk,find){
   await setup(false);
   const r=await submitVia('drop','SPC 1017',null,'',null,null);chk(r&&r.sc==='D1','Drop with a hold went to the Chair (D1)');
   await gotoView('student');
   await tap(q('#simseg button[data-v="after"]'),'Set today to Oct 8 (deadline passed)');
   await decideVia(r,true,'');
   if(/100% refund/.test(r.outcome))find('F3','The Chair approved '+r.id+' on Oct 8, after the Sep 4 deadline, and it still paid a 100% refund with no Dean review.');
   const last=r.audit.filter(a=>/approved/.test(a)).pop()||'';
   if(/^Aug 31/.test(last))find('F12','The approval made on Oct 8 was logged as "'+last+'".')}},
 {title:'Edge: swap out of a class with a department hold',async run(res,chk,find){
   await setup(false);
   const r=await submitVia('swap','SPC 1017','PSY 2012','',null,null);
   if(r&&r.sc==='direct'&&r.status==='completed')find('F4','SPC 1017 has a department hold, which blocks a plain drop (D1). Swapping it for PSY 2012 removed it right away with no approval.')}},
 {title:'Edge: late add without the prerequisite',async run(res,chk,find){
   await setup(true);
   const r=await submitVia('add',null,'MAC 2311','',null,null);chk(r&&r.sc==='A3','Late add went to the instructor (A3)');
   await decideVia(r,true,'');
   if(r.status==='completed'&&!r.steps.some(s=>s.role==='chair'))find('F5','MAC 2311 requires MAC 1147, which is not on the record. The instructor approved the late add and the student was enrolled with no prerequisite check.')}},
 {title:'Edge: seat count after a direct add',async run(res,chk,find){
   await setup(false);const b=get('PSY 2012').seats;
   const r=await submitVia('add',null,'PSY 2012','',null,null);chk(r&&r.status==='completed','PSY 2012 added right away');
   if(get('PSY 2012').seats===b)find('F6','After the add, PSY 2012 still shows '+b+'/'+get('PSY 2012').cap+' seats taken.')}},
 {title:'Edge: add every open class, then try to add one more',async run(res,chk,find){
   await setup(false);
   for(const c of ['PSY 2012','STA 2023'])await submitVia('add',null,c,'',null,null);
   for(const c of ['BSC 1010','MAC 2311','CHM 1045']){const r=await submitVia('add',null,c,'',null,null);await decideVia(r,true,'')}
   await gotoView('student');
   const cr=credits();chk(S.courses.length===9,'Student is now in 9 classes');
   if(cr>18&&!/credit limit|overload/i.test($('#app').textContent))find('F7','The student reached '+cr+' credits with no warning or approval.');
   await tap(q('[data-a="wiz"][data-t="add"]'),'Click "+ Add a class" again');
   const opts=document.querySelectorAll('#wiz .opt').length,nb=q('#wnext');
   if(opts===0&&nb&&nb.disabled)find('F14','The Add window opened with an empty list, a disabled Continue button and no explanation.');
   await tap(q('#wiz [data-a="wclose"]'),'Close the window')}},
 {title:'Edge: drop every class',async run(res,chk,find){
   await setup(false);
   for(const c of ['ENC 1101','MAC 1105','HUM 2020'])await submitVia('drop',c,null,'',null,null);
   const r=await submitVia('drop','SPC 1017',null,'',null,null);await decideVia(r,true,'');
   await gotoView('student');
   if(credits()===0&&!/full-time|financial aid/i.test($('#app').textContent))find('F8','All 4 classes were dropped. The student is at 0 credits and saw no warning about full-time status or financial aid.')}},
 {title:'Edge: deny without a reason',async run(res,chk,find){
   await setup(false);
   const r=await submitVia('add',null,'CHM 1045','',null,null);await decideVia(r,false,'');
   chk(r.status==='denied','Request is denied');
   if(!/Reason:/.test(r.outcome))find('F9','The Chair denied '+r.id+' with the reason box empty. The student only sees "'+r.outcome.split('.')[0]+'."')}},
 {title:'Edge: approver unavailable three times',async run(res,chk,find){
   await setup(false);
   const r=await submitVia('add',null,'MAC 2311','',null,null);
   await gotoRole('chair');
   for(let i=0;i<3;i++)await tap(q('[data-a="alt"][data-id="'+r.id+'"]'),'Approver unavailable: reroute ('+(i+1)+')');
   const st=r.steps.find(s=>s.state==='active');
   if(r.status==='pending'&&st&&st.role==='chair')find('F10','After 3 reroutes, '+r.id+' is still waiting in the same Chair queue. No named alternate, no response deadline and no automatic escalation.');
   await decideVia(r,true,'')}},
 {title:'Edge: two late adds for different instructors',async run(res,chk,find){
   await setup(true);
   const a=await submitVia('add',null,'PSY 2012','',null,null),b=await submitVia('add',null,'STA 2023','',null,null);
   await gotoRole('instructor');
   const n=document.querySelectorAll('#app [data-a="dec"][data-v="1"]').length;
   if(n>=2)find('F11','One Instructor queue shows '+a.id+' (Prof. Haddad, PSY 2012) and '+b.id+' (Prof. Barros, STA 2023). Either instructor could approve the other\'s class.')}},
 {title:'Edge: student changes their mind while in review',async run(res,chk,find){
   await setup(false);
   const r=await submitVia('add',null,'BSC 1010','',null,null);
   await gotoView('student');const card=q('#app .req');await point(card,'Look for a way to cancel '+(r?r.id:''));
   if(card&&![...card.querySelectorAll('button')].some(x=>/cancel|withdraw request/i.test(x.textContent)))find('F13','The card for '+r.id+' has no Cancel button. The student has to wait for the Chair to decide.')}},
 {title:'Edge: Dean denies a late drop, student must choose',async run(res,chk,find){
   await setup(true);
   const r=await submitVia('drop','HUM 2020',null,'',null,null);await decideVia(r,false,'Request came in after the cutoff for this exception.');
   chk(r.status==='needs','Student is asked to choose W or keep');
   await gotoView('student');const box=q('#app .confirm');await point(box,'Read the choice');
   if(box&&!/\b(by|before|until)\b|deadline|last day/i.test(box.textContent))find('F15','The "Withdraw with a W / Keep the class" choice for '+r.id+' shows no date to answer by. The request can sit open forever.');
   await confirmVia(r,false)}},
 {title:'Edge: swap into a class that already has a pending add',async run(res,chk,find){
   await setup(false);
   const a=await submitVia('add',null,'BSC 1010','',null,null);
   const s=await submitVia('swap','HUM 2020','BSC 1010','',null,null);
   if(a&&s)find('F1','Swap '+s.id+' into BSC 1010 was accepted while add '+a.id+' for the same class was still in review.')}},
 {title:'Edge: drop and swap the same class at once',async run(res,chk,find){
   await setup(false);
   const d=await submitVia('drop','SPC 1017',null,'',null,null);chk(d&&d.status==='pending','Drop went to the Chair (D1)');
   const s=await submitVia('swap','SPC 1017','PSY 2012','',null,null);
   if(s&&s.status==='completed')find('F4','While drop '+d.id+' waited for the Chair, swap '+s.id+' removed SPC 1017 right away.');
   await decideVia(d,true,'');
   if(d.status==='completed')find('F2','The Chair then approved '+d.id+', which recorded "'+d.outcome+'" for a class the student had already left.')}}
];

/* ---- plan ---- */
function buildPlan(n,seed){
  const R=rng(seed),pick=a=>a[Math.floor(R()*a.length)];
  const blocked=CAT.filter(specBlock).map(c=>c.code),open=CAT.filter(c=>!specBlock(c)).map(c=>c.code),noHold=CUR.filter(c=>!c.hold).map(c=>c.code);
  const mk=(type,drop,add,late,dec,w)=>{
    const sp=spec(type,drop,add,late);
    dec=sp.roles.map((_,i)=>dec&&dec[i]!==undefined?dec[i]:R()<0.65);
    const reasons=dec.map(ok=>ok?(R()<0.25?'Approved per department policy.':''):(R()<0.6?pick(REASONS):''));
    const reroute=sp.roles.map(()=>R()<0.15?1:0);
    const wChoice=w!==undefined?w:R()<0.5;
    const note=sp.roles.length&&R()<0.5?pick(NOTES):'';
    const lbl=type==='add'?'Add '+add:type==='drop'?'Drop '+drop:'Swap '+drop+' for '+add;
    let desc=sp.roles.map((r,i)=>shortRole(r)+(reroute[i]?' (rerouted)':'')+': '+(dec[i]?'approve':'deny'+(reasons[i]?'':' (no reason)'))).slice(0,(dec.indexOf(false)+1)||dec.length).join(', ');
    if(sp.sc==='D3'&&dec[0]===false)desc+=', student: '+(wChoice?'W':'keep');
    return{kind:'flow',type,drop,add,late,sp,dec,reasons,reroute,wChoice,note,sc:sp.sc,
      title:lbl+' · '+(late?'after':'before')+' deadline',desc:desc||'No approval needed'}};
  const plan=[
   mk('add',null,pick(blocked),false,[true]),mk('add',null,pick(blocked),false,[false]),
   mk('add',null,pick(CAT).code,true,[true]),mk('add',null,pick(CAT).code,true,[false]),
   mk('drop','SPC 1017',null,false,[true]),mk('drop','SPC 1017',null,false,[false]),
   mk('drop',pick(CUR).code,null,true,[true]),mk('drop',pick(CUR).code,null,true,[false],true),mk('drop',pick(CUR).code,null,true,[false],false),
   mk('swap',pick(noHold),pick(blocked),false,[true]),mk('swap',pick(noHold),pick(blocked),false,[false]),
   mk('swap',pick(CUR).code,pick(CAT).code,true,[true,true]),mk('swap',pick(CUR).code,pick(CAT).code,true,[true,false]),mk('swap',pick(CUR).code,pick(CAT).code,true,[false]),
   mk('add',null,pick(open),false),mk('drop',pick(noHold),null,false),mk('swap',pick(noHold),pick(open),false)];
  PROBES.forEach(p=>plan.push({kind:'edge',sc:'Edge',title:p.title,run:p.run,desc:'Edge-case probe'}));
  while(plan.length<n){const type=pick(['add','drop','swap']);
    plan.push(mk(type,type==='add'?null:pick(CUR).code,type==='drop'?null:pick(CAT).code,R()<0.5))}
  for(let i=plan.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[plan[i],plan[j]]=[plan[j],plan[i]]}
  plan.forEach((p,i)=>p.id='T'+String(i+1).padStart(2,'0'));
  return plan}

/* ---- run ---- */
async function runAgent(){
  if(AG.running)return;
  AG.count=Math.max(50,Math.min(200,parseInt(AG.count)||60));
  AG.seed=parseInt(AG.seed)||12345;
  AG.saved=JSON.stringify(S);closeWiz();
  Object.assign(AG,{running:true,stop:false,paused:false,nextSeq:3001,lines:[],tally:{pass:0,fail:0,finding:0},idx:0,cur:null});
  const plan=buildPlan(AG.count,AG.seed);AG.total=plan.length;
  chrome(true);say('Plan ready: '+plan.length+' scenarios, seed '+AG.seed);
  const results=[],t0=Date.now();let stopped=false;
  for(const t of plan){
    AG.idx++;AG.cur=t;conRender();
    const res={id:t.id,title:t.title,kind:t.kind,type:t.type||'',sc:t.sc,desc:t.desc,status:'pass',checks:[],findings:[],ev:{},final:''};
    const chk=(ok,msg)=>{res.checks.push({ok:!!ok,msg});if(!ok){res.status='fail';say('Check failed: '+msg,'fail')}};
    const find=(k,ev)=>{if(!res.findings.includes(k)){res.findings.push(k);say('Finding: '+FX[k].title,'find')}res.ev[k]=ev};
    try{if(t.kind==='flow')await runFlow(t,res,chk,find);else await t.run(res,chk,find)}
    catch(e){if(e===STOP){stopped=true;break}
      res.status='fail';res.checks.push({ok:false,msg:e&&e.missing?'Flow stopped: could not find '+e.missing:'Error: '+((e&&e.message)||e)});
      say(res.checks[res.checks.length-1].msg,'fail')}
    AG.nextSeq=S.seq;
    if(res.status==='pass'&&res.findings.length)res.status='finding';
    AG.tally[res.status]++;results.push(res);
    say(res.id+' '+(res.status==='pass'?'passed':res.status==='fail'?'failed':'passed, with findings'),res.status)}
  closeWiz();
  AG.report=buildReport(results,{seed:AG.seed,n:plan.length,ms:Date.now()-t0,stopped,speed:AG.speed,date:new Date().toLocaleString()});
  AG.ai=null;AG.aiState='idle';saveAg();
  AG.running=false;chrome(false);
  S=JSON.parse(AG.saved);S.view='agent';save();render();window.scrollTo(0,0);
  toast(stopped?'Stopped. Partial report is ready':'Done. Report is ready');
  if(results.length)runAI()}
function buildReport(results,meta){
  const agg={};
  results.forEach(r=>r.findings.forEach(k=>{const a=agg[k]=agg[k]||{key:k,count:0,ids:[],ev:[]};a.count++;a.ids.push(r.id);if(a.ev.length<2&&!a.ev.some(e=>e.slice(e.indexOf(':'))===(': '+r.ev[k])))a.ev.push(r.id+': '+r.ev[k])}));
  const findings=Object.values(agg).sort((a,b)=>SEVR[FX[a.key].sev]-SEVR[FX[b.key].sev]||b.count-a.count);
  const cov={};
  results.filter(r=>r.kind==='flow').forEach(r=>{
    const k=r.sc==='direct'?'Direct '+r.type:r.sc;const c=cov[k]=cov[k]||{runs:0,pass:0,fail:0,finding:0,completed:0,denied:0,cancelled:0};
    c.runs++;c[r.status]++;if(c[r.final]!==undefined)c[r.final]++});
  const tally={pass:0,fail:0,finding:0};results.forEach(r=>tally[r.status]++);
  return{meta,results,findings,cov,tally}}

/* ---- Claude analysis ---- */
async function runAI(){
  if(AG.aiState==='busy'||!AG.report)return;
  AG.aiState='busy';rerenderAgent();
  let sample=null;try{sample=window.claude&&window.claude.use?await window.claude.use('sample'):null}catch(e){}
  if(!sample){AG.aiState='off';rerenderAgent();return}
  const rp=AG.report;
  const data={scenarios_run:rp.results.length,tally:rp.tally,route_coverage:rp.cov,
    findings:rp.findings.map(f=>({title:FX[f.key].title,severity:FX[f.key].sev,type:FX[f.key].type,scenarios:f.count,evidence:f.ev,built_in_recommendation:FX[f.key].rec})),
    failed_checks:rp.results.filter(r=>r.status==='fail').slice(0,10).map(r=>({id:r.id,title:r.title,failed:r.checks.filter(c=>!c.ok).map(c=>c.msg)})),
    not_built_yet:['A2, D2, S2: office-closed variants','S4: conflict rollback','time-conflict checking between classes']};
  const prompt='You are a QA lead reviewing automated test results for a college class add/drop/swap approval prototype. '
   +'Routes: A1 add blocked before the refund deadline goes to the Department Chair; A3 late add goes to the Instructor; D1 drop of a class with a department hold goes to the Chair; '
   +'D3 late drop with refund goes to the Dean of Students (if denied the student picks a W with no refund or keeps the class); S1 blocked swap goes to the Chair; S3 late swap goes to the Instructor, then the Dean. '
   +'Using only the data below, write for the project team. Return JSON only, no markdown: '
   +'{"summary": string (3 to 4 plain sentences), "top_risks": [{"title": string, "why": string}] (3 to 5, most serious first), '
   +'"untested_edge_cases": [string] (4 to 6 cases this run did not cover that could stop the flow), '
   +'"recommendations": [{"title": string, "detail": string, "priority": "Now" | "Next" | "Later"}] (5 to 8 concrete additions to the process flow)}.'
   +'\n\nDATA:\n'+JSON.stringify(data);
  try{
    let out;
    if(typeof sample.json==='function')out=await sample.json(prompt,{modelTier:'default'});
    else{const r=await sample(prompt,{modelTier:'default'});out=r.text}
    if(typeof out==='string')out=JSON.parse(out.replace(/^\s*```(json)?/,'').replace(/```\s*$/,''));
    if(!out||typeof out!=='object')throw new Error('empty');
    AG.ai=out;AG.aiState='idle';saveAg()}
  catch(e){const c=e&&e.code;AG.aiState=c==='not_granted'?'off':'err';
    AG.aiErr=c==='rate_limited'?'Claude is busy right now. Try again in a minute.':'Claude could not finish the analysis this time.'}
  rerenderAgent()}
function rerenderAgent(){if(S.view==='agent'&&!AG.running)render()}
const arr=x=>Array.isArray(x)?x:[];
function aiHTML(){
  if(AG.aiState==='busy')return '<p class="c-meta">Claude is reading the results and writing recommendations…</p>';
  if(AG.ai){const a=AG.ai;
    return '<div class="ag-ai">'+(a.summary?'<p>'+esc(a.summary)+'</p>':'')
     +(arr(a.top_risks).length?'<h3>Top risks</h3><ol>'+arr(a.top_risks).map(x=>'<li><b>'+esc(x.title)+'.</b> '+esc(x.why)+'</li>').join('')+'</ol>':'')
     +(arr(a.recommendations).length?'<h3>What to add to the flow</h3><ol>'+arr(a.recommendations).map(x=>'<li>'+chip(x.priority||'Next',x.priority==='Now'?'bad':x.priority==='Later'?'':'warn')+' <b>'+esc(x.title)+'.</b> '+esc(x.detail)+'</li>').join('')+'</ol>':'')
     +(arr(a.untested_edge_cases).length?'<h3>Edge cases to test next</h3><ul>'+arr(a.untested_edge_cases).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')
     +'<p class="ag-meta">Written by Claude from this run\'s results. Review before sharing.</p></div>'}
  if(AG.aiState==='off')return '<p class="c-meta">Claude\'s analysis isn\'t available in this view. The findings and recommendations above are complete without it.</p>';
  if(AG.aiState==='err')return '<p class="c-meta">'+esc(AG.aiErr)+'</p><div><button class="btn ghost sm" data-g="ai">Try again</button></div>';
  return '<div><button class="btn ghost" data-g="ai">Write analysis with Claude</button></div>'}

/* ---- report views ---- */
const SEVC={Critical:'crit',High:'high',Medium:'warn',Low:''};
const RES={pass:['Passed','ok'],fail:['Failed','bad'],finding:['Finding','warn']};
const COVORD=['A1','A3','D1','D3','S1','S3','Direct add','Direct drop','Direct swap'];
function fmtMs(ms){const s=Math.round(ms/1000);return s<60?s+'s':Math.floor(s/60)+'m '+(s%60)+'s'}
function reportHTML(rp){
  const m=rp.meta,t=rp.tally;
  const tiles='<div class="ag-tiles">'
   +'<div class="ag-tile"><b>'+rp.results.length+'</b><span>scenarios run</span></div>'
   +'<div class="ag-tile ok"><b>'+t.pass+'</b><span>passed</span></div>'
   +'<div class="ag-tile bad"><b>'+t.fail+'</b><span>failed a check</span></div>'
   +'<div class="ag-tile warn"><b>'+t.finding+'</b><span>passed, with findings</span></div>'
   +'<div class="ag-tile"><b>'+rp.findings.length+'</b><span>distinct issues</span></div></div>';
  const issues=rp.findings.map(f=>{const x=FX[f.key];
    return '<article class="ag-issue sev-'+x.sev.toLowerCase()+'"><div class="req-top"><div><div class="chips">'+chip(x.sev,SEVC[x.sev])+chip(x.type)+'</div><h3>'+esc(x.title)+'</h3></div><span class="req-id">'+f.count+' scenario'+(f.count>1?'s':'')+'</span></div>'
     +'<p><b>What happened.</b> '+esc(f.ev[0])+'</p>'+(f.ev[1]?'<p class="c-meta">Also: '+esc(f.ev[1])+'</p>':'')
     +'<p><b>Recommendation.</b> '+esc(x.rec)+'</p><p class="req-id">Seen in '+f.ids.slice(0,14).join(', ')+(f.ids.length>14?' and '+(f.ids.length-14)+' more':'')+'</p></article>'}).join('');
  const covRows=COVORD.filter(k=>rp.cov[k]).map(k=>{const c=rp.cov[k];
    return '<tr><td><b>'+k+'</b></td><td class="n">'+c.runs+'</td><td class="n">'+c.completed+'</td><td class="n">'+c.denied+'</td><td class="n">'+c.cancelled+'</td><td class="n">'+c.pass+'</td><td class="n">'+c.finding+'</td><td class="n">'+c.fail+'</td></tr>'}).join('');
  const rows=rp.results.map(r=>{const s=RES[r.status],bad=r.checks.filter(c=>!c.ok);
    return '<tr><td>'+r.id+'</td><td>'+esc(r.title)+'</td><td>'+esc(r.sc)+'</td><td>'+esc(r.desc)+'</td><td><details><summary>'+chip(s[0],s[1])+'</summary><ul>'
     +bad.map(c=>'<li class="x">'+esc(c.msg)+'</li>').join('')+r.checks.filter(c=>c.ok).map(c=>'<li>'+esc(c.msg)+'</li>').join('')
     +r.findings.map(k=>'<li class="x">Finding: '+esc(FX[k].title)+'</li>').join('')+'</ul></details></td></tr>'}).join('');
  return '<section class="panel"><div class="panel-h"><div><h2>Test report</h2><p>'+esc(m.date)+' · seed '+m.seed+' · '+fmtMs(m.ms)+' at '+m.speed+' speed'+(m.stopped?' · stopped early':'')+'</p></div>'
   +'<div class="ag-acts"><button class="btn ghost sm" data-g="copy">Copy report</button>'+(AG.dl?'<button class="btn ghost sm" data-g="save">Save as file</button>':'')+'</div></div><div class="panel-b" style="display:grid;gap:18px">'+tiles
   +'<textarea id="ag-md" hidden readonly aria-label="Report text"></textarea></div></section>'
   +'<section class="panel"><div class="panel-h"><div><h2>Where the flow stops or breaks</h2><p>Each issue lists what the agent saw and what to add to the process. Ordered by severity.</p></div></div><div class="panel-b ag-issues">'+(issues||'<div class="empty">No issues found in this run.</div>')+'</div></section>'
   +'<section class="panel"><div class="panel-h"><div><h2>Claude\'s analysis</h2><p>A plain-language read of the results, with more recommendations and edge cases to test next.</p></div></div><div class="panel-b">'+aiHTML()+'</div></section>'
   +'<section class="panel"><div class="panel-h"><div><h2>Route coverage</h2><p>Randomized flows by route. Edge-case probes are counted in the scenario list below.</p></div></div><div class="panel-b"><div class="ag-tw"><table class="ag-t"><thead><tr><th>Route</th><th>Runs</th><th>Completed</th><th>Denied</th><th>Cancelled</th><th>Passed</th><th>Findings</th><th>Failed</th></tr></thead><tbody>'+covRows+'</tbody></table></div>'
   +'<p class="c-meta" style="margin-top:10px">Not covered because the prototype does not build them yet: office-closed variants (A2, D2, S2), conflict rollback (S4) and time-conflict checks.</p></div></section>'
   +'<section class="panel"><div class="panel-h"><div><h2>All scenarios</h2><p>Open a result to see every check.</p></div></div><div class="panel-b"><div class="ag-tw"><table class="ag-t"><thead><tr><th>ID</th><th>Scenario</th><th>Route</th><th>Decisions</th><th>Result</th></tr></thead><tbody>'+rows+'</tbody></table></div></div></section>'}
function agentView(){
  const ctl='<section class="panel"><div class="panel-h"><div><h2>Test agent</h2><p>Runs randomized add, drop and swap scenarios plus 15 edge-case probes. It clicks the same buttons a student and each approver would, checks every result, and writes a report.</p></div></div><div class="panel-b ag-ctl">'
   +'<label class="f" for="ag-count">Scenarios<select id="ag-count">'+[50,60,80,100].map(v=>'<option value="'+v+'"'+(+AG.count===v?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'
   +'<label class="f" for="ag-seed">Seed<input id="ag-seed" inputmode="numeric" value="'+esc(AG.seed)+'"></label>'
   +'<label class="f" for="ag-speed">Speed<select id="ag-speed">'+[['watch','Watch (slow)'],['normal','Normal'],['fast','Fast']].map(o=>'<option value="'+o[0]+'"'+(AG.speed===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label>'
   +'<button class="btn" data-g="run">Run test agent</button>'
   +'<p class="c-meta ag-wide">The agent works on a copy of the demo, and your own requests and schedule come back when it finishes. The same seed replays the same scenarios. You can pause or stop at any time.</p></div></section>';
  return ctl+(AG.report?reportHTML(AG.report):'<section class="panel"><div class="empty">No report yet. Run the agent to see which scenarios pass and where the flow breaks.</div></section>')}
function reportMD(rp){
  const m=rp.meta,t=rp.tally,L=[];
  L.push('# Class Changes test report','',m.date+' · seed '+m.seed+' · '+rp.results.length+' scenarios · '+fmtMs(m.ms)+(m.stopped?' · stopped early':''),'',
    'Passed: '+t.pass+' · Failed a check: '+t.fail+' · Passed with findings: '+t.finding+' · Distinct issues: '+rp.findings.length,'','## Where the flow stops or breaks','');
  rp.findings.forEach(f=>{const x=FX[f.key];L.push('### ['+x.sev+'] '+x.title+' ('+f.count+' scenario'+(f.count>1?'s':'')+')','- Type: '+x.type,'- What happened: '+f.ev[0]);
    if(f.ev[1])L.push('- Also: '+f.ev[1]);L.push('- Recommendation: '+x.rec,'- Seen in: '+f.ids.join(', '),'')});
  if(AG.ai){const a=AG.ai;L.push("## Claude's analysis",'',a.summary||'','');
    if(arr(a.top_risks).length){L.push('Top risks:');arr(a.top_risks).forEach((x,i)=>L.push((i+1)+'. '+x.title+': '+x.why));L.push('')}
    if(arr(a.recommendations).length){L.push('What to add to the flow:');arr(a.recommendations).forEach((x,i)=>L.push((i+1)+'. ['+(x.priority||'Next')+'] '+x.title+': '+x.detail));L.push('')}
    if(arr(a.untested_edge_cases).length){L.push('Edge cases to test next:');arr(a.untested_edge_cases).forEach(x=>L.push('- '+x));L.push('')}}
  L.push('## Route coverage','','| Route | Runs | Completed | Denied | Cancelled | Passed | Findings | Failed |','|---|---|---|---|---|---|---|---|');
  COVORD.filter(k=>rp.cov[k]).forEach(k=>{const c=rp.cov[k];L.push('| '+k+' | '+c.runs+' | '+c.completed+' | '+c.denied+' | '+c.cancelled+' | '+c.pass+' | '+c.finding+' | '+c.fail+' |')});
  L.push('','Not covered (not built yet): A2, D2, S2 office-closed variants; S4 conflict rollback; time-conflict checks.','','## All scenarios','','| ID | Scenario | Route | Decisions | Result | Notes |','|---|---|---|---|---|---|');
  rp.results.forEach(r=>L.push('| '+r.id+' | '+r.title+' | '+r.sc+' | '+r.desc+' | '+RES[r.status][0]+' | '+[...r.checks.filter(c=>!c.ok).map(c=>c.msg),...r.findings.map(k=>FX[k].title)].join('; ').replace(/\|/g,'/')+' |'));
  return L.join('\n')}

document.addEventListener('click',e=>{
  const el=e.target.closest('[data-g]');if(!el)return;const g=el.dataset.g;
  if(g==='run')runAgent();
  else if(g==='pause'){AG.paused=!AG.paused;say(AG.paused?'Paused':'Resumed');conRender()}
  else if(g==='stop'){AG.stop=true;AG.paused=false;say('Stopping after this step…')}
  else if(g==='ai')runAI();
  else if(g==='copy'&&AG.report){const md=reportMD(AG.report),ta=$('#ag-md');
    const fb=()=>{ta.hidden=false;ta.value=md;ta.focus();ta.select();toast('Select all and copy the report text below')};
    try{navigator.clipboard.writeText(md).then(()=>toast('Report copied as Markdown'),fb)}catch(x){fb()}}
  else if(g==='save'&&AG.report&&AG.dl){const md=reportMD(AG.report),fn='class-changes-test-report-'+AG.report.meta.seed+'.md';
    AG.dl.save({filename:fn,data:md}).then(()=>toast('Saved '+fn)).catch(x=>{if(x&&x.code==='cancelled')return;
      AG.dl.save({filename:fn,data:new Blob([md],{type:'text/markdown'})}).then(()=>toast('Saved '+fn)).catch(()=>toast('The file was not saved. Use Copy report instead.'))})}});
document.addEventListener('change',e=>{
  const id=e.target.id;
  if(id==='ag-count')AG.count=+e.target.value;
  else if(id==='ag-seed'){AG.seed=parseInt(e.target.value)||AG.seed;saveAg()}
  else if(id==='ag-speed'||id==='ag-live')AG.speed=e.target.value});
(async()=>{try{if(window.claude&&window.claude.use){AG.dl=await window.claude.use('downloads');rerenderAgent()}}catch(e){}})();
