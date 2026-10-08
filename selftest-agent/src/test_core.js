const C=require('./core.js');
function run(cfgOver,passes){
  const cfg=Object.assign({pack:'full',count:60,seed:4242,late:50,types:{add:true,drop:true,swap:true},approve:'balanced',unavail:15,blank:'sometimes',closed:8,fail:6,burst:12,extra:true},cfgOver);
  const plan=C.buildPlan(cfg);
  const P=passes.map(k=>({key:k,results:plan.map(t=>C.runCase(t,C.RULESETS[k]))}));
  return{cfg,plan,rep:C.buildReport(P,cfg,{})}}
const out=[];
for(const [name,over] of [['full60',{}],['full300',{count:300,seed:7}],['current',{pack:'current',burst:0,closed:0,fail:0,extra:false}],['edge',{pack:'edge',burst:25}],['office',{pack:'office',closed:100,burst:0,fail:0}],['rollback',{pack:'rollback',fail:100,burst:0,closed:0,types:{add:false,drop:false,swap:true}}],['load',{pack:'load'}],['dup',{pack:'dup',burst:70}],['addonly',{types:{add:true,drop:false,swap:false},late:0}]]){
  const {plan,rep}=run(over,['current','proposed']);
  const [a,b]=rep.passes;
  console.log('\n==',name,'cases',plan.length,'kinds',JSON.stringify(plan.reduce((m,t)=>(m[t.kind]=(m[t.kind]||0)+1,m),{})));
  console.log(' current  ',JSON.stringify(a.tally),'findings',a.findings.map(f=>f.key+':'+f.count).join(' '));
  console.log(' proposed ',JSON.stringify(b.tally),'findings',b.findings.map(f=>f.key+':'+f.count).join(' '));
  const fails=[...a.results,...b.results].filter(r=>r.status==='fail');
  fails.slice(0,6).forEach(r=>console.log('  FAIL',r.id,r.title,'::',r.checks.filter(c=>!c.ok).map(c=>c.msg).join(' | ')));
  if(fails.length>6)console.log('  ...',fails.length,'fails total');
}
