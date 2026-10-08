/* ===== Selftest Agent core: headless copy of the Class Changes rules (no DOM) ===== */
const DEADLINE='Sep 4, 2026';
const ROLES={chair:'Department Chair / Assistant',instructor:'Instructor',dean:'Dean of Students'};
const CUR0=[
 {code:'ENC 1101',name:'Freshman Composition I',sec:'1431',inst:'Prof. Alvarez',cr:3,days:'MW',s:540,e:615},
 {code:'MAC 1105',name:'College Algebra',sec:'2210',inst:'Prof. Okafor',cr:3,days:'TR',s:660,e:735},
 {code:'SPC 1017',name:'Fundamentals of Speech',sec:'3302',inst:'Prof. Delgado',cr:3,days:'F',s:600,e:765,hold:'Department hold (Communication)'},
 {code:'HUM 2020',name:'Humanities Survey',sec:'4125',inst:'Prof. Nguyen',cr:3,days:'',s:0,e:0}];
const CAT0=[
 {code:'BSC 1010',name:'Biology I',sec:'5120',inst:'Prof. Reyes',cr:3,seats:30,cap:30,days:'MW',s:780,e:855},
 {code:'MAC 2311',name:'Calculus I',sec:'5231',inst:'Prof. Chen',cr:3,seats:24,cap:35,days:'TR',s:570,e:645,prereq:'MAC 1147 is not on your record'},
 {code:'CHM 1045',name:'General Chemistry I',sec:'5522',inst:'Prof. Silva',cr:3,seats:18,cap:30,days:'MW',s:900,e:975,hold:'Department hold (Natural Sciences)'},
 {code:'PSY 2012',name:'General Psychology',sec:'5344',inst:'Prof. Haddad',cr:3,seats:27,cap:35,days:'MW',s:660,e:735},
 {code:'STA 2023',name:'Statistics I',sec:'5410',inst:'Prof. Barros',cr:3,seats:31,cap:40,days:'TR',s:780,e:855}];
const EXTRA0=[
 {code:'MUS 1010',name:'Music Appreciation',sec:'5601',inst:'Prof. Lang',cr:3,seats:20,cap:30,days:'MW',s:570,e:645},
 {code:'ECO 2013',name:'Principles of Macroeconomics',sec:'5702',inst:'Prof. Price',cr:3,seats:25,cap:35,days:'TR',s:630,e:705}];
const specBlock=c=>!!c&&((c.cap&&c.seats>=c.cap)||!!c.prereq||!!c.hold);

const RULE_LABELS={dupGuard:'Block duplicate requests',lockReview:'Lock a class while a request is in review',refundRecheck:'Re-check the refund deadline at approval',
 swapHold:'Check holds when swapping out',lateBlockers:'Check holds and prerequisites after the deadline',seats:'Update seat counts',creditCap:'Credit limit',
 loadWarn:'Warn on very low credit load',requireReason:'Require a reason to deny',escalate:'Escalate after repeated reroutes',instructorScope:'Show instructors only their classes',
 dateStamp:'Stamp real dates in the audit trail',cancel:'Let students cancel a request',emptyHint:'Explain an empty class list',answerBy:'Give a date to answer the W choice',
 officeAlt:'Route to an alternate when an office is closed',rollback:'Roll back a failed swap',timeConflict:'Check time conflicts'};
const PROPOSED={};Object.keys(RULE_LABELS).forEach(k=>PROPOSED[k]=true);
const RULESETS={current:{},proposed:PROPOSED};

function makeEngine(rules,env){
  rules=rules||{};env=env||{};
  const cur=CUR0.map(c=>({...c})),cat=CAT0.concat(EXTRA0).map(c=>({...c}));
  const all=cur.concat(cat),get=c=>all.find(x=>x.code===c);
  const S={sim:env.late?'after':'before',courses:cur.map(c=>c.code),reqs:[],notes:[],seq:1042};
  const E={rules,env,S,get,cat,cur};
  const isLate=()=>S.sim==='after',dateLabel=()=>S.sim==='before'?'Aug 31':'Oct 8';
  E.isLate=isLate;E.setSim=v=>{S.sim=v};
  const blockers=c=>{const b=[];if(!c)return b;
    if(c.cap&&c.seats>=c.cap)b.push('Class is full ('+c.seats+'/'+c.cap+')');
    if(c.prereq)b.push('Prerequisite missing: '+c.prereq);
    if(c.hold)b.push(c.hold);return b};
  E.blockers=blockers;
  const credits=()=>S.courses.reduce((a,c)=>a+get(c).cr,0);E.credits=credits;
  const conflicts=(code,exceptDrop)=>{const a=get(code);if(!a||!a.days)return[];
    return S.courses.filter(x=>x!==exceptDrop&&x!==code).map(get).filter(b=>b.days&&b.days.split('').some(d=>a.days.includes(d))&&a.s<b.e&&b.s<a.e).map(b=>b.code)};
  E.conflicts=conflicts;
  const step=(role,course)=>({role,name:role==='instructor'?'Instructor, '+get(course).inst:ROLES[role],state:'waiting'});
  const log=(r,t)=>r.audit.push((rules.dateStamp?dateLabel():r.date)+': '+t);
  const notify=t=>S.notes.unshift({t,d:dateLabel(),n:true});
  const title=r=>r.type==='add'?'Add '+r.add:r.type==='drop'?'Drop '+r.drop:'Swap '+r.drop+' for '+r.add;
  function route(type,drop,add){
    const late=isLate(),a=add?get(add):null,d=drop?get(drop):null,bl=blockers(a),conf=(a&&type!=='drop')?conflicts(add,drop):[];
    let o;
    if(type==='add')o=late?{sc:'A3',steps:[step('instructor',add)]}:bl.length?{sc:'A1',steps:[step('chair')]}:{sc:'direct',steps:[]};
    else if(type==='drop')o=late?{sc:'D3',steps:[step('dean')]}:d.hold?{sc:'D1',steps:[step('chair')]}:{sc:'direct',steps:[]};
    else o=late?{sc:'S3',steps:[step('instructor',add),step('dean')]}:bl.length?{sc:'S1',steps:[step('chair')]}:{sc:'direct',steps:[]};
    if(rules.swapHold&&type==='swap'&&!late&&d.hold&&!o.steps.length){o.steps=[step('chair')]}
    if(rules.lateBlockers&&late&&type!=='drop'&&bl.length&&!o.steps.some(s=>s.role==='chair')){const i=o.steps.findIndex(s=>s.role==='instructor');o.steps.splice(i+1,0,step('chair'))}
    if(rules.timeConflict&&conf.length&&!o.steps.some(s=>s.role==='chair'))o.steps.unshift(step('chair'));
    return o}
  function enroll(c){if(!S.courses.includes(c)){S.courses.push(c);if(rules.seats){const x=get(c);if(x.cap)x.seats++}}}
  function unenroll(c){if(S.courses.includes(c)){S.courses=S.courses.filter(x=>x!==c);if(rules.seats){const x=get(c);if(x.cap)x.seats--}}}
  function finish(r){
    r.staleDrop=r.type!=='add'&&!S.courses.includes(r.drop);
    if(rules.lockReview&&r.staleDrop){r.status='cancelled';r.outcome='Cancelled: '+r.drop+' is no longer on the schedule.';log(r,'Cancelled automatically');notify(r.outcome);return}
    if(r.type==='add'){enroll(r.add);log(r,'Enrollment added in the SIS (simulated)');r.outcome='You are enrolled in '+r.add+'.'}
    else if(r.type==='drop'){unenroll(r.drop);log(r,'Class dropped in the SIS (simulated)');r.outcome=r.sc==='D3'?'Dropped '+r.drop+' with a 100% refund override.':'Dropped '+r.drop+' with a 100% refund.'}
    else{enroll(r.add);log(r,'Step 1: '+r.add+' added');
      if(env.sisFail==='drop'){
        if(rules.rollback){unenroll(r.add);r.status='failed';r.outcome='The swap could not finish. No changes were made.';log(r,'Step 2 failed. Step 1 rolled back');notify(r.outcome);return}
        r.status='stuck';log(r,'Step 2 failed');return}
      unenroll(r.drop);log(r,'Step 2: '+r.drop+' dropped');log(r,'Tuition balance transferred to '+r.add);
      r.outcome='Swap complete. You are in '+r.add+' and '+r.drop+' was dropped.'}
    r.status='completed';notify(title(r)+': '+r.outcome)}
  E.credit_after=(type,drop,add)=>credits()+(type!=='drop'?get(add).cr:0)-(type!=='add'?get(drop).cr:0);
  E.submit=function(type,drop,add,note){
    const open=S.reqs.filter(r=>r.status==='pending'||r.status==='needs');
    if(rules.dupGuard&&(open.some(r=>r.type===type&&r.add===add&&r.drop===drop)||(add&&open.some(r=>r.add===add))))return{rejected:'You already have a request for this class in review'};
    if(rules.lockReview&&drop&&open.some(r=>r.drop===drop||r.add===drop))return{rejected:drop+' already has a request in review'};
    if(rules.creditCap&&E.credit_after(type,drop,add)>18)return{rejected:'This change goes over the 18-credit limit'};
    const rt=route(type,drop,add);
    const r={id:'REQ-'+(S.seq++),type,drop,add,late:isLate(),sc:rt.sc,date:dateLabel(),note:note||'',steps:rt.steps,status:'pending',audit:[],outcome:'',warnings:[]};
    if(rules.loadWarn&&E.credit_after(type,drop,add)<6)r.warnings.push('This puts you under 6 credits. Talk to Financial Aid and an advisor first.');
    log(r,'Submitted by student');
    if(!r.steps.length){log(r,'No approval needed');finish(r)}
    else{r.steps[0].state='active';log(r,'Routed to '+r.steps[0].name);
      if(rules.officeAlt&&env.officeClosed){r.steps[0].alt=true;r.eta='Office closed. Sent to an authorized alternate. Expect an answer by the next business day.';log(r,'Office closed. Routed to an alternate')}
      notify(title(r)+' sent to '+r.steps[0].name+' for review.')}
    S.reqs.unshift(r);return{req:r}};
  function alts(except){return cat.filter(c=>c.code!==except&&!S.courses.includes(c.code)&&!blockers(c).length).slice(0,3)}
  function deny(r,reason){
    if(r.sc==='D3'){r.status='needs';if(rules.answerBy)r.answerBy='Sep 18 (14 days)';notify('The Dean did not approve a refund for '+r.drop+'.');return}
    r.status='denied';
    if(r.type==='drop')r.outcome='Not approved. You remain enrolled in '+r.drop+'.'+(reason?' Reason: '+reason:'');
    else r.outcome=(r.type==='swap'?'Swap not approved. You stay in '+r.drop+'.':'Add not approved.')+(reason?' Reason: '+reason:'')+(alts(r.add).length?' Other open sections are listed.':'');
    notify(title(r)+' was not approved.')}
  E.decide=function(id,ok,reason){
    const r=S.reqs.find(x=>x.id===id);if(!r)return{error:'not found'};
    const st=r.steps.find(s=>s.state==='active');if(!st)return{error:'no active step'};
    if(!ok&&!reason&&rules.requireReason)return{error:'reason required'};
    st.note=reason;log(r,st.name+(ok?' approved':' denied')+(reason?' ('+reason+')':''));
    if(ok){st.state='approved';
      if(rules.refundRecheck&&isLate()&&!r.late&&r.type!=='add'&&!r.steps.some(s=>s.role==='dean')){r.steps.push(step('dean'));log(r,'The deadline passed during review. Dean of Students review added')}
      const nx=r.steps.find(s=>s.state==='waiting');
      if(nx){nx.state='active';log(r,'Routed to '+nx.name);notify(title(r)+' approved by '+st.name+'. Now with '+nx.name+'.')}
      else finish(r)}
    else{st.state='denied';r.steps.forEach(s=>{if(s.state==='waiting')s.state='skipped'});deny(r,reason)}
    return{ok:true}};
  E.reassign=function(id){
    const r=S.reqs.find(x=>x.id===id),st=r&&r.steps.find(s=>s.state==='active');if(!st)return{error:'no active step'};
    st.alt=true;st.reroutes=(st.reroutes||0)+1;log(r,'Approver unavailable. Rerouted to an alternate for '+st.name);notify(title(r)+' moved to an alternate.');
    if(rules.escalate&&st.reroutes>=2&&st.role==='chair'){st.role='dean';st.name=ROLES.dean+' (escalated)';st.escalated=true;log(r,'No response. Escalated to the Dean of Students')}
    return{ok:true}};
  E.confirm=function(id,yes){const r=S.reqs.find(x=>x.id===id);
    if(yes){unenroll(r.drop);r.status='completed';r.outcome='Dropped '+r.drop+' as a W with no refund.';log(r,'Student confirmed withdrawal with a W')}
    else{r.status='cancelled';r.outcome='Request cancelled. You remain enrolled in '+r.drop+'.';log(r,'Student cancelled the request')}
    notify(r.outcome);return{ok:true}};
  E.canCancel=()=>!!rules.cancel;
  E.cancel=function(id){if(!rules.cancel)return{error:'not offered'};const r=S.reqs.find(x=>x.id===id);if(!r||r.status!=='pending')return{error:'not pending'};
    r.status='cancelled';r.steps.forEach(s=>{if(s.state==='active'||s.state==='waiting')s.state='skipped'});log(r,'Student cancelled the request');notify(title(r)+' was cancelled.');return{ok:true}};
  E.queue=(role,who)=>S.reqs.filter(r=>r.status==='pending'&&r.steps.some(s=>s.state==='active'&&s.role===role&&(!(rules.instructorScope&&role==='instructor'&&who)||(r.add&&get(r.add).inst===who))));
  E.addOptions=()=>{const list=cat.filter(c=>!S.courses.includes(c.code));return{list,hint:list.length||!rules.emptyHint?null:'No other classes are open this term. Ask an advisor about a waitlist.'}};
  E.approveAll=(r,reason)=>{let n=0;while(r.status==='pending'&&r.steps.some(s=>s.state==='active')&&n++<8){const o=E.decide(r.id,true,reason||'');if(o.error)break}return r};
  return E}

/* ---- findings catalog ---- */
const FX={
 F17:{sev:'Critical',type:'Breaks the record',rule:'rollback',title:'A failed swap leaves the student in both classes',rec:'Run a swap as one transaction. If dropping the old class fails, undo the add, tell the student nothing changed and alert the registrar. This is scenario S4.'},
 F2:{sev:'Critical',type:'Breaks the record',rule:'lockReview',title:'A request still completes after its class changed',rec:'Lock a class while it has a request in review, re-check the schedule at every approval, and cancel any request whose class is no longer on the schedule.'},
 F10:{sev:'High',type:'Stops the flow',rule:'escalate',title:'A request can wait forever on an approver',rec:'Add a response deadline (for example 2 business days) that escalates by itself, name the alternate approver, cap manual reroutes and tell the student when a request is escalated.'},
 F16:{sev:'High',type:'Stops the flow',rule:'officeAlt',title:'No plan for requests that arrive when an office is closed',rec:'Know the office hours. When the office is closed, route to a named alternate right away, tell the student the expected response time, and escalate if the alternate does not answer. These are scenarios A2, D2 and S2.'},
 F13:{sev:'High',type:'Stops the flow',rule:'cancel',title:'Students cannot cancel a request that is in review',rec:'Add a Cancel request action on pending requests. It should notify the current approver and record the cancellation in the audit trail.'},
 F1:{sev:'High',type:'Breaks the record',rule:'dupGuard',title:'Duplicate requests for the same class are accepted',rec:'Before submitting, check for an open request on the same class and show "You already have a request for this class in review" with a link to it.'},
 F3:{sev:'High',type:'Policy gap',rule:'refundRecheck',title:'A request that crosses the refund deadline keeps its 100% refund',rec:'Decide which date governs (submission or approval), show it on the request, and add a Dean review when the deadline passes while a request is pending.'},
 F4:{sev:'High',type:'Policy gap',rule:'swapHold',title:'Swapping out of a class skips its department hold',rec:'Check holds on the class being dropped in a swap and add the Chair step, the same way a plain drop does (D1).'},
 F5:{sev:'High',type:'Policy gap',rule:'lateBlockers',title:'After the deadline, prerequisites and holds are not checked',rec:'Run the same blocker checks for late adds and swaps (A3, S3). Add the Chair step for a hold or missing prerequisite, or show those blockers to the instructor.'},
 F11:{sev:'High',type:'Access control',rule:'instructorScope',title:'Every instructor sees every instructor request',rec:'Filter the instructor queue to classes that instructor teaches, and check on approval that the approver is the instructor of record or their delegate.'},
 F15:{sev:'Medium',type:'Stops the flow',rule:'answerBy',title:'The "W or keep the class" choice has no deadline',rec:'Show a last day to answer, send reminders, and close the request (keeping the class) if the student does not answer in time.'},
 F6:{sev:'Medium',type:'Breaks the record',rule:'seats',title:'Seat counts do not change after enrollment',rec:'Update seats on every add, drop and swap, and re-check capacity at approval so two approvals cannot fill the last seat twice.'},
 F7:{sev:'Medium',type:'Policy gap',rule:'creditCap',title:'No maximum credit check',rec:'Warn, or route for approval, when a change takes the student over the term credit limit.'},
 F8:{sev:'Medium',type:'Policy gap',rule:'loadWarn',title:'A student can drop to zero credits with no warning',rec:'Warn when a change leaves the student very low on credits and point them to Financial Aid and an advisor before they confirm.'},
 F18:{sev:'Medium',type:'Policy gap',rule:'timeConflict',title:'Time conflicts are not checked',rec:'Check the new class against the student\'s schedule. On a conflict, warn the student and route to the Chair for an override.'},
 F9:{sev:'Medium',type:'Student experience',rule:'requireReason',title:'Denials can be sent without a reason',rec:'Require a reason when an approver denies, with a short list of common reasons to pick from.'},
 F12:{sev:'Medium',type:'Breaks the record',rule:'dateStamp',title:'The audit trail stamps decisions with the submission date',rec:'Record the actual date, time and approver name on each audit entry.'},
 F14:{sev:'Low',type:'Stops the flow',rule:'emptyHint',title:'Add and Swap dead-end when no classes are left to pick',rec:'Show an empty state that explains why the list is empty and links to other sections or a waitlist.'}};
const SEVR={Critical:0,High:1,Medium:2,Low:3};

/* ---- documented routes (independent of the engine) ---- */
function specFor(type,drop,add,late){
  const a=add&&CAT0.concat(EXTRA0).find(c=>c.code===add),d=drop&&CUR0.find(c=>c.code===drop);
  if(type==='add')return late?{sc:'A3',roles:['instructor']}:specBlock(a)?{sc:'A1',roles:['chair']}:{sc:'direct',roles:[]};
  if(type==='drop')return late?{sc:'D3',roles:['dean']}:d.hold?{sc:'D1',roles:['chair']}:{sc:'direct',roles:[]};
  return late?{sc:'S3',roles:['instructor','dean']}:specBlock(a)?{sc:'S1',roles:['chair']}:{sc:'direct',roles:[]}}
const applyChange=(c,t)=>{c=c.slice();if(t.type!=='drop'&&!c.includes(t.add))c.push(t.add);if(t.type!=='add')c=c.filter(x=>x!==t.drop);return c};
const sameSet=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
const shortRole=r=>r==='instructor'?'Instructor':r==='dean'?'Dean':'Chair';

function runFlow(t,rules,chk,find,res){
  const E=makeEngine(rules,{late:t.late,officeClosed:t.closed,sisFail:t.fail});
  const start=E.S.courses.slice(),failing=!!t.fail&&t.type==='swap';
  const confl=t.add&&t.type!=='drop'?E.conflicts(t.add,t.drop):[],seatBefore=t.add?E.get(t.add).seats:0;
  const sub=E.submit(t.type,t.drop,t.add,t.note);
  if(sub.rejected){res.blocked=sub.rejected;res.final='blocked';chk(true,'Blocked by a rule: '+sub.rejected);return}
  const r=sub.req;res.req=r.id;
  chk(r.sc===t.sp.sc,'Routed as '+t.sp.sc+(r.sc!==t.sp.sc?' (engine used '+r.sc+')':''));
  const roles=r.steps.map(s=>s.role);let k=0;roles.forEach(x=>{if(k<t.sp.roles.length&&x===t.sp.roles[k])k++});
  chk(k===t.sp.roles.length,'Approval chain includes '+(t.sp.roles.map(shortRole).join(' → ')||'no approvers'));
  let i=0,denied=false,deniedBlank=false,made=0,rer=0;
  while(r.status==='pending'&&i<8){
    const st=r.steps.find(s=>s.state==='active');if(!st)break;
    const ok=i<t.dec.length?t.dec[i]:true,rr=t.reroute[i]||0;
    for(let q=0;q<rr;q++){E.reassign(r.id);rer++}
    let reason=t.reasons[i]||'',o=E.decide(r.id,ok,reason);
    if(o.error==='reason required'){chk(true,'A blank denial reason was refused');o=E.decide(r.id,ok,'Please contact the department.')}
    else if(!ok&&!reason&&!o.error)deniedBlank=true;
    if(o.error){chk(false,'Decision failed: '+o.error);break}
    made++;if(!ok){denied=true;break}i++}
  let noDate=false;
  if(r.status==='needs'){chk(r.sc==='D3','Student is asked to choose W or keep the class');noDate=!r.answerBy;E.confirm(r.id,t.w)}
  res.final=r.status;
  let exp=null;
  if(denied)exp=r.sc==='D3'?(t.w?'completed':'cancelled'):'denied';else if(!failing)exp='completed';
  if(exp){chk(r.status===exp,'Final status is '+exp+(r.status!==exp?' (got '+r.status+')':''));
    const ec=exp==='completed'?applyChange(start,t):start;
    chk(sameSet(E.S.courses,ec),'Schedule matches the expected '+ec.length+' classes')}
  chk(r.audit.length>=1+made+rer,'Audit trail has an entry for each step ('+r.audit.length+')');
  if(!failing)chk(E.S.notes.length>=1,'Student received an update');
  chk(new Set(E.S.courses).size===E.S.courses.length,'No class appears twice on the schedule');
  const hasChair=r.steps.some(s=>s.role==='chair');
  if(r.status==='completed'&&t.add){const a=E.get(t.add);if(a.cap&&a.seats===seatBefore)find('F6','Enrolled in '+t.add+', but the section still shows '+a.seats+'/'+a.cap+' seats taken.')}
  if(deniedBlank&&!rules.requireReason)find('F9',r.id+' was denied with no reason. The student only sees "'+r.outcome.split('.')[0]+'."');
  if(t.type==='swap'&&!t.late&&E.get(t.drop).hold&&!hasChair)find('F4','Swapped out of '+t.drop+' ('+E.get(t.drop).hold+') with no Chair approval.');
  if(t.late&&t.add){const a=E.get(t.add);if((a.prereq||a.hold)&&!hasChair&&r.status==='completed')find('F5',t.add+' has '+(a.prereq?'a missing prerequisite':'a department hold')+', but after the deadline it only went to '+r.steps.map(s=>shortRole(s.role)).join(' → ')+'.')}
  if(t.closed&&r.steps.length&&!r.eta)find('F16',r.id+' reached '+(r.steps[0].name)+' while the office was closed. The student was given no alternate and no expected response time.');
  if(confl.length&&!hasChair&&r.status==='completed')find('F18',t.add+' was added although it overlaps '+confl.join(', ')+'.');
  if(noDate)find('F15','The W-or-keep choice for '+r.id+' shows no date to answer by.');
  if(failing&&(r.status==='stuck'||(E.S.courses.includes(t.add)&&E.S.courses.includes(t.drop))))find('F17','When step 2 of '+r.id+' failed, the student stayed enrolled in both '+t.drop+' and '+t.add+' with the request stuck.');
  if(r.status==='completed'&&r.staleDrop)find('F2',r.id+' completed for '+r.drop+', which was no longer on the schedule.');
  if(E.credits()<=3&&!r.warnings.length&&r.type!=='add'&&r.status==='completed')find('F8','The schedule fell to '+E.credits()+' credits with no warning.')}

function runBurst(t,rules,chk,find,res){
  const E=makeEngine(rules,{late:t.late,officeClosed:t.closed,sisFail:t.fail});
  const subs=[];let rej=0,dup=0;
  t.reqs.forEach(q=>{const open=E.S.reqs.filter(r=>r.status==='pending'&&r.type===q.type&&r.add===q.add&&r.drop===q.drop).length;
    const s=E.submit(q.type,q.drop,q.add,'');if(s.rejected)rej++;else{subs.push(s.req);if(open)dup++}});
  res.final=subs.length+' accepted, '+rej+' blocked';
  chk(true,subs.length+' request(s) accepted, '+rej+' blocked by a rule');
  if(dup)find('F1',dup+' duplicate request(s) for the same change were accepted in one burst.');
  let j=0,stale=0;
  t.order.forEach((idx,n)=>{const r=subs[idx%Math.max(1,subs.length)];if(!r)return;
    let g=0;while(r.status==='pending'&&r.steps.some(s=>s.state==='active')&&g++<6){
      const ok=t.dec[(j++)%t.dec.length];let o=E.decide(r.id,ok,ok?'':'Reviewed');if(o.error)break;if(!ok)break}});
  subs.forEach(r=>{if(r.status==='needs')E.confirm(r.id,t.w);if(r.status==='completed'&&r.staleDrop){stale++;find('F2',r.id+' ('+(r.type==='swap'?'swap':'drop')+' of '+r.drop+') completed after '+r.drop+' was already gone from the schedule.')}});
  chk(new Set(E.S.courses).size===E.S.courses.length,'No class appears twice on the schedule');
  chk(E.S.courses.every(c=>!!E.get(c)),'Every enrolled class exists');
  chk(subs.every(r=>r.status!=='pending'||r.steps.some(s=>s.state==='active')),'No request is left without an active approver');
  chk(E.credits()===E.S.courses.reduce((a,c)=>a+E.get(c).cr,0),'Credit total matches the schedule ('+E.credits()+')');
}

/* ---- edge probes ---- */
const PROBES={
 P01:{title:'Edge: the same add submitted twice',run(x){const E=x.mk();const a=E.submit('add',null,'BSC 1010','');x.chk(a.req&&a.req.status==='pending','First add is in review');
   const b=E.submit('add',null,'BSC 1010','');if(b.req)x.find('F1','A second request ('+b.req.id+') for BSC 1010 was accepted while '+a.req.id+' was in review.');else x.chk(true,'Duplicate was blocked: '+b.rejected)}},
 P02:{title:'Edge: drop a class while its swap is in review',run(x){const E=x.mk();const s=E.submit('swap','ENC 1101','BSC 1010','');x.chk(s.req&&s.req.sc==='S1','Swap went to the Chair (S1)');
   const d=E.submit('drop','ENC 1101',null,'');if(d.rejected)x.chk(true,'Second change was blocked: '+d.rejected);else x.chk(d.req.status==='completed','Direct drop completed');
   E.approveAll(s.req);if(s.req.status==='completed'&&s.req.staleDrop)x.find('F2','Swap '+s.req.id+' completed after ENC 1101 was already dropped and refunded by '+d.req.id+'.')}},
 P03:{title:'Edge: refund deadline passes while a drop is in review',run(x){const E=x.mk();const r=E.submit('drop','SPC 1017',null,'').req;x.chk(r.sc==='D1','Drop with a hold went to the Chair (D1)');
   E.setSim('after');E.decide(r.id,true,'');
   const ap=r.audit.find(a=>/approved/.test(a))||'';if(/^Aug 31/.test(ap))x.find('F12','The approval made on Oct 8 was logged as "'+ap+'".');
   E.approveAll(r);if(r.status==='completed'&&/100% refund/.test(r.outcome)&&!r.steps.some(s=>s.role==='dean'))x.find('F3',r.id+' was approved on Oct 8, after the Sep 4 deadline, and still paid a 100% refund with no Dean review.')}},
 P04:{title:'Edge: swap out of a class with a department hold',run(x){const E=x.mk();const r=E.submit('swap','SPC 1017','PSY 2012','').req;
   if(r&&r.status==='completed'&&!r.steps.some(s=>s.role==='chair'))x.find('F4','SPC 1017 has a department hold that blocks a plain drop (D1). Swapping it for PSY 2012 removed it with no approval.');else x.chk(true,'Swap was routed for approval')}},
 P05:{title:'Edge: late add without the prerequisite',run(x){const E=x.mk({late:true});const r=E.submit('add',null,'MAC 2311','').req;x.chk(r.sc==='A3','Late add went to the instructor (A3)');E.approveAll(r);
   if(r.status==='completed'&&!r.steps.some(s=>s.role==='chair'))x.find('F5','MAC 2311 requires MAC 1147, which is not on the record. The instructor approved the late add and the student was enrolled with no prerequisite check.')}},
 P06:{title:'Edge: seat count after a direct add',run(x){const E=x.mk();const b=E.get('PSY 2012').seats;const r=E.submit('add',null,'PSY 2012','').req;x.chk(r.status==='completed','PSY 2012 added right away');
   if(E.get('PSY 2012').seats===b)x.find('F6','After the add, PSY 2012 still shows '+b+'/'+E.get('PSY 2012').cap+' seats taken.')}},
 P07:{title:'Edge: push the credit load over 18',run(x){const E=x.mk();['PSY 2012','STA 2023'].forEach(c=>E.submit('add',null,c,''));
   const r=E.submit('add',null,'BSC 1010','');if(r.req)E.approveAll(r.req);
   if(E.credits()>18)x.find('F7','The student reached '+E.credits()+' credits with no warning or approval.');else x.chk(true,'The change was stopped at '+E.credits()+' credits')}},
 P08:{title:'Edge: drop every class',run(x){const E=x.mk();['ENC 1101','MAC 1105','HUM 2020'].forEach(c=>E.submit('drop',c,null,''));
   const r=E.submit('drop','SPC 1017',null,'').req;E.approveAll(r);
   if(E.credits()===0&&!r.warnings.length)x.find('F8','All 4 classes were dropped. The student is at 0 credits and saw no warning.');else x.chk(true,'A warning was shown before the last drop')}},
 P09:{title:'Edge: deny without a reason',run(x){const E=x.mk();const r=E.submit('add',null,'CHM 1045','').req;const o=E.decide(r.id,false,'');
   if(o.error)x.chk(true,'A blank reason was refused');else x.find('F9','The Chair denied '+r.id+' with the reason box empty. The student only sees "'+r.outcome.split('.')[0]+'."')}},
 P10:{title:'Edge: approver unavailable three times',run(x){const E=x.mk();const r=E.submit('add',null,'MAC 2311','').req;for(let i=0;i<3;i++)E.reassign(r.id);
   const st=r.steps.find(s=>s.state==='active');if(r.status==='pending'&&st&&st.role==='chair'&&!st.escalated)x.find('F10','After 3 reroutes, '+r.id+' is still in the same Chair queue. No named alternate, no response deadline and no escalation.');else x.chk(true,'The request was escalated')}},
 P11:{title:'Edge: two late adds for different instructors',run(x){const E=x.mk({late:true});E.submit('add',null,'PSY 2012','');E.submit('add',null,'STA 2023','');
   const q=E.queue('instructor','Prof. Haddad');if(q.length>=2)x.find('F11','The queue for Prof. Haddad also shows STA 2023, which Prof. Barros teaches.');else x.chk(true,'Prof. Haddad sees only PSY 2012')}},
 P12:{title:'Edge: student changes their mind during review',run(x){const E=x.mk();const r=E.submit('add',null,'BSC 1010','').req;const o=E.cancel(r.id);
   if(o.error)x.find('F13','There is no way to cancel '+r.id+' while it is in review.');else x.chk(true,'The student cancelled the request')}},
 P13:{title:'Edge: Dean denies a late drop, student must choose',run(x){const E=x.mk({late:true});const r=E.submit('drop','HUM 2020',null,'').req;E.decide(r.id,false,'After the cutoff for this exception.');
   x.chk(r.status==='needs','Student is asked to choose W or keep');if(!r.answerBy)x.find('F15','The W-or-keep choice for '+r.id+' shows no date to answer by.');E.confirm(r.id,false)}},
 P14:{title:'Edge: swap into a class with a pending add',run(x){const E=x.mk();const a=E.submit('add',null,'BSC 1010','').req;const s=E.submit('swap','HUM 2020','BSC 1010','');
   if(s.req)x.find('F1','Swap '+s.req.id+' into BSC 1010 was accepted while add '+a.id+' for the same class was in review.');else x.chk(true,'Second request was blocked')}},
 P15:{title:'Edge: drop and swap the same class at once',run(x){const E=x.mk();const d=E.submit('drop','SPC 1017',null,'').req;x.chk(d.status==='pending','Drop went to the Chair (D1)');
   const s=E.submit('swap','SPC 1017','PSY 2012','');if(s.req&&s.req.status==='completed')x.find('F4','While drop '+d.id+' waited for the Chair, swap '+s.req.id+' removed SPC 1017 right away.');else if(s.rejected)x.chk(true,'Second change was blocked');
   E.approveAll(d);if(d.status==='completed'&&d.staleDrop)x.find('F2','The Chair then approved '+d.id+', which recorded "'+d.outcome+'" for a class the student had already left.')}},
 P16:{title:'Edge: no classes left to add',run(x){const E=x.mk({},{timeConflict:false,creditCap:false,dupGuard:false,lockReview:false,loadWarn:false});
   ['PSY 2012','STA 2023','MUS 1010','ECO 2013','BSC 1010','MAC 2311','CHM 1045'].forEach(c=>{const r=E.submit('add',null,c,'');if(r.req)E.approveAll(r.req)});
   const o=E.addOptions();x.chk(E.S.courses.length>=10,'Student is enrolled in '+E.S.courses.length+' classes');
   if(!o.list.length&&!o.hint)x.find('F14','The Add window opens with an empty list, a disabled Continue button and no explanation.');else if(o.hint)x.chk(true,'The empty list is explained')}},
 P17:{title:'Edge: request arrives while the office is closed',run(x){const E=x.mk({officeClosed:true});const r=E.submit('add',null,'MAC 2311','').req;
   if(!r.eta)x.find('F16',r.id+' went to the Chair while the office was closed. No alternate and no expected response time.');else x.chk(true,'Routed to an alternate with an expected response time')}},
 P18:{title:'Edge: swap fails at step 2',run(x){const E=x.mk({sisFail:'drop'});const r=E.submit('swap','ENC 1101','PSY 2012','').req;
   if(E.S.courses.includes('ENC 1101')&&E.S.courses.includes('PSY 2012'))x.find('F17','Step 2 of '+r.id+' failed. The student was left in both ENC 1101 and PSY 2012 and the request is '+r.status+'.');else x.chk(true,'Step 1 was rolled back')}},
 P19:{title:'Edge: add a class that overlaps the schedule',run(x){const E=x.mk();const r=E.submit('add',null,'MUS 1010','').req;
   if(r.status==='completed'&&!r.steps.length)x.find('F18','MUS 1010 (Mon, Wed 9:30 to 10:45) was added right away although it overlaps ENC 1101 (Mon, Wed 9:00 to 10:15).');else x.chk(true,'The conflict was routed for review')}}};

/* ---- packs, plan ---- */
const PACKS={
 full:{group:'Current build',name:'Full sweep',desc:'Every documented route, all 19 edge-case probes, and random overlapping requests.',probes:Object.keys(PROBES),anchors:true,def:{burst:12,closed:8,fail:6,extra:true,types:'all'}},
 current:{group:'Current build',name:'Documented routes only',desc:'A1, A3, D1, D3, S1 and S3 plus direct changes, with random decisions.',probes:[],anchors:true,def:{burst:0,closed:0,fail:0,extra:false,types:'all'}},
 edge:{group:'Current build',name:'Edge-case probes',desc:'All 19 probes plus bursts of overlapping requests.',probes:Object.keys(PROBES),anchors:false,def:{burst:25,closed:0,fail:0,extra:true,types:'all'}},
 office:{group:'Future cases (preview)',future:1,name:'Office closed (A2, D2, S2)',desc:'Requests that arrive when a department office is closed. Tests proposed rules, not in the build yet.',probes:['P17','P10','P03'],anchors:true,def:{burst:0,closed:100,fail:0,extra:false,types:'all'}},
 rollback:{group:'Future cases (preview)',future:1,name:'Conflict rollback (S4)',desc:'Swaps where the second step fails in the student system. Tests proposed rules, not in the build yet.',probes:['P18'],anchors:true,def:{burst:0,closed:0,fail:100,extra:false,types:'swap'}},
 load:{group:'Future cases (preview)',future:1,name:'Schedule conflicts and credit load',desc:'Overlapping meeting times, credit limits and very low loads. Tests proposed rules, not in the build yet.',probes:['P06','P07','P08','P16','P19'],anchors:false,def:{burst:10,closed:0,fail:0,extra:true,types:'all'}},
 dup:{group:'Future cases (preview)',future:1,name:'Duplicate and overlapping requests',desc:'Many requests on the same classes at once, with cancels. Tests proposed rules, not in the build yet.',probes:['P01','P02','P14','P15','P12'],anchors:false,def:{burst:70,closed:0,fail:0,extra:false,types:'all'}}};

function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
const REASONS=['No seats can be added to this section.','Prerequisite must be completed first.','Request came in after the cutoff for this exception.','Please meet with an advisor first.'];
const NOTES=['I need this for my program plan.','My work schedule changed this term.','My advisor recommended this change.','This class conflicts with my new job hours.'];

function buildPlan(cfg){
  const R=rng(cfg.seed),pick=a=>a[Math.floor(R()*a.length)];
  const pack=PACKS[cfg.pack],pool=CAT0.concat(cfg.extra?EXTRA0:[]);
  const blockedP=pool.filter(specBlock).map(c=>c.code),openP=pool.filter(c=>!specBlock(c)).map(c=>c.code);
  const allCur=CUR0.map(c=>c.code),noHold=CUR0.filter(c=>!c.hold).map(c=>c.code);
  const pA={mostly:.8,balanced:.65,rarely:.3,always:1,never:0}[cfg.approve],pB={sometimes:.4,never:0,always:1}[cfg.blank];
  const types=['add','drop','swap'].filter(t=>cfg.types[t]);if(!types.length)types.push('add');
  const lateOK=cfg.late>0,earlyOK=cfg.late<100;
  const mk=(type,drop,add,late,dec,w,tag)=>{
    const sp=specFor(type,drop,add,late);
    dec=sp.roles.map((_,i)=>dec&&dec[i]!==undefined?dec[i]:R()<pA);
    const reasons=dec.map(ok=>ok?'':(R()<pB?'':pick(REASONS)));
    const reroute=sp.roles.map(()=>R()<cfg.unavail/100?1:0);
    const w2=w!==undefined?w:R()<.5,closed=R()<cfg.closed/100,fail=type==='swap'&&R()<cfg.fail/100?'drop':'';
    const lbl=type==='add'?'Add '+add:type==='drop'?'Drop '+drop:'Swap '+drop+' for '+add;
    let desc=sp.roles.map((r,i)=>shortRole(r)+(reroute[i]?' (rerouted)':'')+': '+(dec[i]?'approve':'deny'+(reasons[i]?'':', no reason'))).slice(0,(dec.indexOf(false)+1)||dec.length).join(', ')||'No approval needed';
    if(sp.sc==='D3'&&dec[0]===false)desc+=', student: '+(w2?'W':'keep');
    if(closed)desc+=' · office closed';if(fail)desc+=' · system failure';
    return{kind:'flow',type,drop,add,late,sp,dec,reasons,reroute,w:w2,closed,fail,note:sp.roles.length&&R()<.5?pick(NOTES):'',sc:sp.sc,title:lbl+' · '+(late?'after':'before')+' deadline',desc,tag:tag||'random'}};
  const ok=(type,late)=>types.includes(type)&&(late?lateOK:earlyOK);
  const plan=[];
  if(pack.anchors){
    const A=[['add',null,()=>pick(blockedP),false,[true]],['add',null,()=>pick(blockedP),false,[false]],['add',null,()=>pick(pool.map(c=>c.code)),true,[true]],['add',null,()=>pick(pool.map(c=>c.code)),true,[false]],
     ['drop','SPC 1017',null,false,[true]],['drop','SPC 1017',null,false,[false]],['drop',()=>pick(allCur),null,true,[true]],['drop',()=>pick(allCur),null,true,[false],true],['drop',()=>pick(allCur),null,true,[false],false],
     ['swap',()=>pick(noHold),()=>pick(blockedP),false,[true]],['swap',()=>pick(noHold),()=>pick(blockedP),false,[false]],['swap',()=>pick(allCur),()=>pick(pool.map(c=>c.code)),true,[true,true]],['swap',()=>pick(allCur),()=>pick(pool.map(c=>c.code)),true,[true,false]],['swap',()=>pick(allCur),()=>pick(pool.map(c=>c.code)),true,[false]],
     ['add',null,()=>pick(openP),false],['drop',()=>pick(noHold),null,false],['swap',()=>pick(noHold),()=>pick(openP),false]];
    A.forEach(a=>{if(!ok(a[0],a[3]))return;const f=v=>typeof v==='function'?v():v;plan.push(mk(a[0],f(a[1]),f(a[2]),a[3],a[4],a[5],'route'))})}
  pack.probes.forEach(id=>plan.push({kind:'probe',pid:id,sc:'Edge',title:PROBES[id].title,desc:'Edge-case probe',tag:'probe'}));
  const randFlow=()=>{const type=pick(types),late=lateOK&&(!earlyOK||R()<cfg.late/100);
    return mk(type,type==='add'?null:pick(allCur),type==='drop'?null:pick(R()<.5?blockedP:openP.length?openP:blockedP),late)};
  const burst=()=>{const k=2+Math.floor(R()*2),reqs=[];
    for(let i=0;i<k;i++){const type=pick(types);reqs.push({type,drop:type==='add'?null:pick(['ENC 1101','SPC 1017','HUM 2020']),add:type==='drop'?null:pick(['BSC 1010','PSY 2012','MAC 2311'])})}
    const late=lateOK&&(!earlyOK||R()<cfg.late/100);
    return{kind:'burst',late,reqs,order:reqs.map(()=>Math.floor(R()*9)),dec:[R()<pA,R()<pA,R()<pA],w:R()<.5,closed:R()<cfg.closed/100,fail:R()<cfg.fail/100?'drop':'',sc:'Burst',
      title:k+' overlapping requests · '+(late?'after':'before')+' deadline',desc:reqs.map(q=>q.type==='add'?'add '+q.add:q.type==='drop'?'drop '+q.drop:'swap '+q.drop+'→'+q.add).join(', '),tag:'burst'}};
  while(plan.length<cfg.count)plan.push(R()<cfg.burst/100?burst():randFlow());
  for(let i=plan.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[plan[i],plan[j]]=[plan[j],plan[i]]}
  plan.forEach((p,i)=>p.id='T'+String(i+1).padStart(3,'0'));
  return plan}

function runCase(t,rules){
  const res={id:t.id,title:t.title,kind:t.kind,tag:t.tag,sc:t.sc,desc:t.desc,status:'pass',checks:[],findings:[],ev:{},final:''};
  const chk=(ok,msg)=>{res.checks.push({ok:!!ok,msg});if(!ok)res.status='fail'};
  const find=(k,ev)=>{if(!res.findings.includes(k))res.findings.push(k);if(!res.ev[k])res.ev[k]=ev};
  try{
    if(t.kind==='flow')runFlow(t,rules,chk,find,res);
    else if(t.kind==='burst')runBurst(t,rules,chk,find,res);
    else{const x={chk,find,mk:(env,off)=>makeEngine(off?Object.assign({},rules,off):rules,env||{})};
      PROBES[t.pid].run(x)}
  }catch(e){res.status='fail';res.checks.push({ok:false,msg:'Error: '+((e&&e.message)||e)})}
  if(res.status==='pass'&&res.findings.length)res.status='finding';
  return res}

/* ---- report ---- */
const COVORD=['A1','A3','D1','D3','S1','S3','direct'];
function summarize(results){
  const agg={};
  results.forEach(r=>r.findings.forEach(k=>{const a=agg[k]=agg[k]||{key:k,count:0,ids:[],ev:[]};a.count++;a.ids.push(r.id);if(a.ev.length<2&&!a.ev.includes(r.ev[k]))a.ev.push(r.ev[k])}));
  const findings=Object.values(agg).sort((a,b)=>SEVR[FX[a.key].sev]-SEVR[FX[b.key].sev]||b.count-a.count);
  const cov={};
  results.filter(r=>r.kind==='flow').forEach(r=>{const k=r.sc==='direct'?'direct '+r.tag:r.sc;const c=cov[k.startsWith('direct')?'Direct':k]=cov[k.startsWith('direct')?'Direct':k]||{runs:0,pass:0,fail:0,finding:0};c.runs++;c[r.status]++});
  const tally={pass:0,fail:0,finding:0};results.forEach(r=>tally[r.status]++);
  return{findings,cov,tally}}
function buildReport(passes,cfg,meta){
  const P=passes.map(p=>({key:p.key,label:p.key==='current'?'Current build':'Proposed fixes',results:p.results,...summarize(p.results)}));
  let compare=null;
  if(P.length===2){const a=P[0],b=P[1],keys=new Set([...a.findings.map(f=>f.key),...b.findings.map(f=>f.key)]);
    compare=[...keys].map(k=>{const x=a.findings.find(f=>f.key===k),y=b.findings.find(f=>f.key===k);
      return{key:k,cur:x?x.count:0,pro:y?y.count:0,verdict:x&&!y?'Resolved':x&&y?'Still open':'New'}}).sort((p,q)=>SEVR[FX[p.key].sev]-SEVR[FX[q.key].sev]||q.cur-p.cur)}
  return{cfg,meta,passes:P,compare}}

if(typeof module!=='undefined')module.exports={makeEngine,buildPlan,runCase,buildReport,PACKS,PROBES,FX,RULESETS,RULE_LABELS,PROPOSED,specFor,CAT0,CUR0,EXTRA0};
