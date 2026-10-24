const $ = (id) => document.getElementById(id);
const today = new Date();
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
$('readingDate').value = localDate;
$('quickDate').value = localDate;

let readings = [];
async function apiRequest(path, options={}) {
  const response=await fetch(path,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||`API request failed (${response.status}).`);
  return body;
}
async function loadReadings() {
  readings=await apiRequest('/api/readings');
  updateDashboard();
  $('dataConnection').textContent='Connected';
  $('dataConnection').className='connection-status connected';
}
async function saveReading(reading) {
  const saved=reading.id
    ? await apiRequest(`/api/readings/${reading.id}`,{method:'PUT',body:JSON.stringify(reading)})
    : await apiRequest('/api/readings',{method:'POST',body:JSON.stringify(reading)});
  const index=readings.findIndex(item=>item.id===saved.id);
  if(index<0)readings.push(saved);else readings[index]=saved;
  return saved;
}
function number(value) { return Number(value).toLocaleString('en-IN',{maximumFractionDigits:1,minimumFractionDigits:1}); }
function analyze(expected, actual, checks={}) {
  const loss = Math.max(0, expected - actual);
  const gap = expected > 0 ? loss / expected * 100 : 0;
  const performance = expected > 0 ? actual / expected * 100 : 0;
  const causes = [];
  if (checks.inverter) causes.push('Inverter warning was recorded. Check the displayed fault code and ask a qualified technician to inspect it.');
  if (checks.wiring) causes.push('A wiring or connection concern was recorded. Arrange a qualified electrical inspection.');
  if (checks.shade) causes.push('Shading was observed. Check for trees, buildings or other objects blocking the panels.');
  if (checks.dust) causes.push('Dust or dirt was observed. Inspect panel cleanliness and follow the manufacturer’s safe cleaning guidance.');
  if (gap < 10) causes.push('No major shortfall against the entered target. Continue tracking readings to establish a trend.');
  else if (causes.length === 0) causes.push('Cause unknown: no equipment observation was recorded. Verify the meter reading, expected-generation target, inverter status and connections.');
  return {loss,gap,performance,low:gap>=15,causes};
}
function checksFrom(suffix='') {
  return {
    dust:$('dustCheck'+suffix).checked,
    shade:$('shadeCheck'+suffix).checked,
    inverter:$('inverterCheck'+suffix).checked,
    wiring:$('wiringCheck'+suffix).checked
  };
}
function syncChecks(fromSuffix,toSuffix) {
  for (const name of ['dust','shade','inverter','wiring']) {
    $(''+name+'Check'+toSuffix).checked = $(''+name+'Check'+fromSuffix).checked;
  }
}
function currentReading() { return readings[readings.length-1] || {date:localDate,expected:0,actual:0,capacity:0,checks:{}}; }
function updateDashboard() {
  const r = currentReading();
  const result = analyze(r.expected,r.actual,r.checks||{});
  $('actualMetric').textContent=number(r.actual);
  $('expectedMetric').textContent=number(r.expected);
  $('lossMetric').textContent=number(result.loss);
  $('performanceMetric').textContent=String(Math.round(result.performance));
  $('performanceBar').style.width=Math.min(100,Math.max(0,result.performance))+'%';
  $('navAlertCount').textContent=result.low?'1':'0';
  $('alertCount').textContent=result.low?'1':'0';
  $('alertList').innerHTML = result.low
    ? `<div class="alert-item"><div class="alert-symbol">!</div><div><b>Generation below target</b><p>Output is ${number(result.gap)}% below the entered expectation.</p><span class="alert-severity">● NEEDS REVIEW</span></div></div>`
    : `<div class="alert-item"><div class="alert-symbol" style="background:#e5f8f0;color:#168b76">✓</div><div><b>No major shortfall</b><p>Current reading is within the demo threshold.</p><span class="alert-severity" style="color:#168b76">● NORMAL</span></div></div>`;
  $('recommendationTitle').textContent=(r.checks||{}).inverter?'Review the inverter warning':(r.checks||{}).wiring?'Arrange a qualified inspection':(r.checks||{}).shade?'Check the shading source':(r.checks||{}).dust?'Inspect the panel surface':result.low?'Verify the reading and equipment status':'Continue monitoring performance';
  $('recommendationText').textContent=(r.checks||{}).inverter?'Record the inverter fault code and follow the manufacturer’s guidance. Do not open electrical equipment yourself.':(r.checks||{}).wiring?'Have a qualified technician inspect wiring and connections before changing the system.':(r.checks||{}).shade?'Check whether trees, buildings or other objects block part of the panel during the day.':(r.checks||{}).dust?'Record visible dirt and follow the panel maker’s safe cleaning instructions.':result.low?'No cause has been confirmed. Verify the target and meter reading, then record equipment observations to guide the next check.':'Keep recording daily generation to build a useful performance history.';
  $('expectedInput').value=r.expected||''; $('actualInput').value=r.actual||''; $('capacityInput').value=r.capacity||''; $('readingDate').value=r.date||localDate;
  syncChecksFromObject(r.checks||{});
  renderChart(r.expected,r.actual);
  renderTable();
  updateReports();
  renderResult(r);
}
function syncChecksFromObject(checks) {
  for (const name of ['dust','shade','inverter','wiring']) {
    $(''+name+'Check').checked=!!checks[name];
    $(''+name+'Check2').checked=!!checks[name];
  }
}
function renderChart(expected,actual) {
  const factors=[.22,.42,.27,.09];
  $('barGroups').innerHTML=factors.map((factor,i)=>{
    const e=expected*factor, a=actual*factor;
    return `<div class="bar-group"><div class="bar expected" title="Expected ${number(e)} kWh" style="height:${Math.min(100,e/Math.max(expected,1)*100)}%"></div><div class="bar actual" title="Actual ${number(a)} kWh" style="height:${Math.min(100,a/Math.max(expected,1)*100)}%"></div></div>`;
  }).join('');
}
function renderResult(r) {
  const result=analyze(r.expected,r.actual,r.checks||{});
  $('resultTitle').textContent=result.low?'Low generation detected':'Generation within demo threshold';
  $('resultStatus').textContent=result.low?'ATTENTION':'NORMAL';
  $('resultStatus').className=result.low?'status-warning':'status-warning status-good';
  $('resultLoss').textContent=number(result.loss)+' kWh';
  $('resultGap').textContent=number(result.gap)+'%';
  $('resultPerformance').textContent=number(result.performance)+'%';
  $('resultCauses').innerHTML=result.causes.map(c=>`<li>${escapeHTML(c)}</li>`).join('');
}
function renderTable() {
  const rows=[...readings].reverse();
  $('readingsTable').innerHTML=rows.map(r=>{
    const x=analyze(r.expected,r.actual,r.checks||{});
    return `<tr><td>${escapeHTML(r.date)}</td><td>${number(r.expected)} kWh</td><td>${number(r.actual)} kWh</td><td>${number(x.loss)} kWh</td><td>${number(x.performance)}%</td><td><span class="table-status ${x.low?'low':'normal'}">${x.low?'Review':'Normal'}</span></td></tr>`;
  }).join('');
}
function updateReports() {
  const totalLoss=readings.reduce((sum,r)=>sum+analyze(r.expected,r.actual,r.checks||{}).loss,0);
  const avg=readings.length?readings.reduce((sum,r)=>sum+analyze(r.expected,r.actual,r.checks||{}).performance,0)/readings.length:0;
  $('reportCount').textContent=readings.length;
  $('reportPerformance').textContent=number(avg);
  $('reportLoss').textContent=number(totalLoss);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function showToast(message) {
  $('toast').textContent=message; $('toast').classList.add('show');
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>$('toast').classList.remove('show'),2800);
}
function navigate(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));
  document.querySelectorAll('.nav-link[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  const label=({overview:'Overview',diagnostics:'Diagnostics',readings:'Generation readings',reports:'Reports',settings:'Settings'})[page]||'Overview';
  $('pageCrumb').textContent=label;
  $('sidebar').classList.remove('open');
}
document.querySelectorAll('.nav-link[data-page]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.goto)));
$('menuButton').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
$('newReadingButton').addEventListener('click',openModal);
$('readingsAddButton').addEventListener('click',openModal);
function openModal(){$('quickExpected').value=currentReading().expected;$('quickActual').value=currentReading().actual;$('quickDate').value=localDate;$('readingModal').classList.add('open')}
function closeModal(){$('readingModal').classList.remove('open')}
$('closeModal').addEventListener('click',closeModal);
$('readingModal').addEventListener('click',e=>{if(e.target===$('readingModal'))closeModal()});
$('quickForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const expected=Number($('quickExpected').value),actual=Number($('quickActual').value),date=$('quickDate').value;
  if(!date||expected<=0||actual<0){showToast('Enter a valid date and non-negative readings.');return}
try {
  await saveReading({date,expected,actual,capacity:currentReading().capacity||10,checks:{},source:'User'});
  updateDashboard();closeModal();navigate('readings');showToast('Reading saved to the database.');
} catch(error) { showToast(`Could not save reading: ${error.message}`); }
});
$('analysisForm').addEventListener('submit',async e=>{
e.preventDefault();
const expected=Number($('expectedInput').value),actual=Number($('actualInput').value),capacity=Number($('capacityInput').value),date=$('readingDate').value;
if(!date||expected<=0||actual<0||capacity<=0){showToast('Please enter valid non-negative readings and capacity.');return}
const record={date,expected,actual,capacity,checks:checksFrom('2'),source:'Analysis'};
try {
  await saveReading(record);updateDashboard();navigate('diagnostics');showToast('Analysis complete. Reading saved to the database.');
} catch(error) { showToast(`Could not save analysis: ${error.message}`); }
});
$('runDiagnosticButton').addEventListener('click',async()=>{
syncChecks('','2');
const reading=currentReading();
if(!reading.id){showToast('Save a reading before updating its observations.');return}
const updated={...reading,checks:checksFrom('2')};
try { await saveReading(updated);updateDashboard();showToast('Diagnostic observations saved to the database.'); }
catch(error) { showToast(`Could not save observations: ${error.message}`); }
});
$('refreshButton').addEventListener('click',async()=>{
try { await loadReadings();navigate('overview');showToast('Readings refreshed from the database.'); }
catch(error) { setDatabaseUnavailable(error); }
});
$('loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const role = $('loginRole').value;
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  const accounts = {
    user: { username: 'operator', password: 'VoltX@123', name: 'Solar Operator', role: 'Solar operator' },
    admin: { username: 'admin', password: 'Admin@123', name: 'System Administrator', role: 'Administrator' }
  };
  const account = accounts[role];
  if (!username || !password) {
    $('loginError').textContent = 'Enter both username and password.';
    return;
  }
  if (username !== account.username || password !== account.password) {
    $('loginError').textContent = 'Incorrect username, password, or account type. Please try again.';
    $('loginPassword').value = '';
    $('loginPassword').focus();
    return;
  }
  $('loginError').textContent = '';
  $('profileName').textContent = account.name;
  $('profileRole').textContent = account.role;
  $('appShell').classList.add('authenticated');
  $('loginScreen').style.display = 'none';
  sessionStorage.setItem('voltxLoggedInRole', role);
  showToast('Signed in successfully.');
});
$('togglePassword').addEventListener('click', () => {
  const field = $('loginPassword');
  const showing = field.type === 'text';
  field.type = showing ? 'password' : 'text';
  $('togglePassword').textContent = showing ? 'Show' : 'Hide';
  $('togglePassword').setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
});
$('switchUser').addEventListener('click', () => {
  sessionStorage.removeItem('voltxLoggedInRole');
  $('appShell').classList.remove('authenticated');
  $('loginScreen').style.display = 'grid';
  $('loginForm').reset();
  $('loginError').textContent = '';
  $('loginPassword').value = '';
  showToast('You have signed out.');
});

$('downloadReport').addEventListener('click',()=>{
  const rows=[['Date','Expected kWh','Actual kWh','Energy gap kWh','Shortfall %','Performance %','Recorded observations']];
  readings.forEach(r=>{const x=analyze(r.expected,r.actual,r.checks||{});rows.push([r.date,r.expected,r.actual,x.loss.toFixed(1),x.gap.toFixed(1),x.performance.toFixed(1),Object.keys(r.checks||{}).filter(k=>r.checks[k]).join('; ')||'None recorded'])});
  const csv=rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='voltx-demo-report.csv';a.click();URL.revokeObjectURL(url);showToast('CSV report downloaded.');
});
$('clearDemo').addEventListener('click',async()=>{
  try { await loadReadings();showToast('Readings refreshed from the database.'); }
  catch(error) { setDatabaseUnavailable(error); }
});
$('dustCheck').addEventListener('change',()=>syncChecks('','2'));
$('shadeCheck').addEventListener('change',()=>syncChecks('','2'));
$('inverterCheck').addEventListener('change',()=>syncChecks('','2'));
$('wiringCheck').addEventListener('change',()=>syncChecks('','2'));
function setDatabaseUnavailable(error) {
  $('dataConnection').textContent='Unavailable';
  $('dataConnection').className='connection-status unavailable';
  showToast(`Database connection failed: ${error.message}`);
}
updateDashboard();
loadReadings().catch(setDatabaseUnavailable);
