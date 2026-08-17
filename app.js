(() => {
  const STORAGE_KEY='juliana-light-ledger-v1';
  const currencies=['CNY','HKD','THB','AUD','USD'];
  const currencyNames={CNY:'人民币',HKD:'港币',THB:'泰铢',AUD:'澳元',USD:'美元'};
  const symbols={CNY:'¥',HKD:'HK$',THB:'฿',AUD:'A$',USD:'$'};
  const expenseCategories=[
    {name:'餐饮',icon:'🍜',color:'#3977e6'},{name:'住房',icon:'🏠',color:'#8b6ee8'},
    {name:'交通',icon:'🚇',color:'#31a77c'},{name:'服饰',icon:'👗',color:'#f08eb0'},
    {name:'学习',icon:'📚',color:'#efaa3b'},{name:'医疗',icon:'🩺',color:'#e76f6f'},
    {name:'娱乐',icon:'🎬',color:'#59a8d9'},{name:'旅行',icon:'✈️',color:'#5f87d7'},
    {name:'日用',icon:'🧴',color:'#d28c54'},{name:'其他',icon:'✨',color:'#8492a6'}
  ];
  const incomeCategories=[
    {name:'工资',icon:'💼',color:'#31a77c'},{name:'兼职',icon:'💻',color:'#3977e6'},
    {name:'奖学金',icon:'🎓',color:'#8b6ee8'},{name:'退款',icon:'↩️',color:'#59a8d9'},
    {name:'礼金',icon:'🎁',color:'#f08eb0'},{name:'其他收入',icon:'✨',color:'#8492a6'}
  ];
  const assetTypes={cash:'现金',bank:'银行卡',wallet:'电子钱包',saving:'储蓄账户',investment:'投资账户'};
  const liabilityTypes={credit:'信用卡',loan:'借款',other_debt:'其他负债'};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  function blankRates(){
    const rates={};
    currencies.forEach(from=>{rates[from]={AUD:'',HKD:''};if(from==='AUD')rates[from].AUD=1;if(from==='HKD')rates[from].HKD=1;});
    return rates;
  }
  const defaultState={version:2,accounts:[],transactions:[],budgets:{},rates:blankRates(),settings:{reportCurrency:'AUD',budgetCollapsed:false}};
  let state=loadState();
  let currentMonth=localMonth();
  let entryType='expense';
  let editingTransactionId=null;
  let editingAccountId=null;

  function localMonth(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function makeId(){return globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;}
  function loadState(){
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
      if(!saved||!Array.isArray(saved.transactions))return clone(defaultState);
      const legacyCurrency=saved.settings?.currency||'CNY';
      const reportCurrency=saved.settings?.reportCurrency||(['AUD','HKD'].includes(legacyCurrency)?legacyCurrency:'AUD');
      const rates={...blankRates(),...(saved.rates||{})};
      currencies.forEach(code=>rates[code]={...blankRates()[code],...(rates[code]||{})});
      const transactions=saved.transactions.map(item=>({
        id:item.id||makeId(),type:item.type||'expense',amount:Number(item.amount)||0,
        currency:item.currency||legacyCurrency,category:item.category||'',date:item.date||localDate(),
        note:item.note||'',accountId:item.accountId||'',targetAccountId:item.targetAccountId||'',
        accountName:item.accountName||'',targetAccountName:item.targetAccountName||'',
        accountAmount:Number(item.accountAmount)||Number(item.amount)||0,
        toAmount:Number(item.toAmount)||Number(item.amount)||0,
        converted:item.converted||{},statementReduction:Number(item.statementReduction)||0,
        createdAt:item.createdAt||Date.now()
      }));
      const budgets={};
      Object.entries(saved.budgets||{}).forEach(([month,plan])=>{
        budgets[month]=plan&&plan.values?plan:{currency:legacyCurrency,values:plan||{}};
      });
      return {version:2,accounts:Array.isArray(saved.accounts)?saved.accounts:[],transactions,budgets,rates,settings:{reportCurrency,budgetCollapsed:!!saved.settings?.budgetCollapsed}};
    }catch{return clone(defaultState);}
  }
  function saveState(message){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));if(message)toast(message);}
  function reportCurrency(){return state.settings.reportCurrency;}
  function money(value,currency=reportCurrency()){const n=Number(value)||0;return (symbols[currency]||currency+' ')+n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function decimalValue(value,blankWhenZero=false){const n=Number(value)||0;return blankWhenZero&&n===0?'':n.toFixed(2);}
  function originalMoney(value,currency){return money(value,currency);}
  function convert(amount,from,to,manual={}){
    const explicit=Number(manual?.[to]);
    if(explicit>0)return explicit;
    if(from===to)return Number(amount)||0;
    const rate=Number(state.rates?.[from]?.[to]);
    return rate>0?(Number(amount)||0)*rate:null;
  }
  function txReportValue(item){return convert(item.amount,item.currency,reportCurrency(),item.converted);}
  function accountConverted(account){return convert(account.balance,account.currency,reportCurrency());}
  function findAccount(id){return state.accounts.find(account=>account.id===id);}
  function categoryInfo(name,type){
    if(type==='transfer')return {name:'转账/还款',icon:'↔',color:'#7b8da7'};
    return (type==='income'?incomeCategories:expenseCategories).find(category=>category.name===name)||{name:name||'其他',icon:'✨',color:'#8492a6'};
  }
  function accountIcon(account){
    if(account.kind==='liability')return account.type==='credit'?'💳':'📄';
    return {cash:'💵',bank:'🏦',wallet:'📱',saving:'🏧',investment:'📈'}[account.type]||'💰';
  }
  function monthTransactions(){return state.transactions.filter(item=>item.date.slice(0,7)===currentMonth);}
  function monthTotals(){
    const list=monthTransactions();let income=0,expense=0,missing=0;
    list.forEach(item=>{if(item.type==='transfer')return;const value=txReportValue(item);if(value===null){missing++;return;}if(item.type==='income')income+=value;else expense+=value;});
    return {list,income,expense,missing};
  }
  function portfolio(){
    let assets=0,liabilities=0;const missing=new Set();
    state.accounts.forEach(account=>{const value=accountConverted(account);if(value===null&&Number(account.balance)!==0){missing.add(account.currency);return;}if(account.kind==='asset')assets+=value||0;else liabilities+=value||0;});
    return {assets,liabilities,net:assets-liabilities,missing:[...missing]};
  }
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),1900);}
  function emptyHTML(icon,title,copy,button=''){return `<div class="empty"><div class="empty-icon">${icon}</div><strong>${title}</strong><p>${copy}</p>${button}</div>`;}
  function currencyOptions(){return currencies.map(code=>`<option value="${code}">${code} · ${currencyNames[code]}</option>`).join('');}

  function render(){
    $('#globalMonth').value=currentMonth;
    $('#reportCurrency').value=reportCurrency();
    renderDashboard();renderTransactions();renderAccounts();renderBudgets();renderSettings();
    const budgetDetails=$('#budgetDetails');if(budgetDetails.open===state.settings.budgetCollapsed)budgetDetails.open=!state.settings.budgetCollapsed;
    $('#dataSummary').textContent=`${state.accounts.length} 个账户 · ${state.transactions.length} 笔流水 · ${Object.keys(state.budgets).length} 个月预算`;
  }
  function renderDashboard(){
    const p=portfolio(),m=monthTotals();
    $('#netWorthValue').textContent=money(p.net);$('#assetValue').textContent=money(p.assets);$('#liabilityValue').textContent=money(p.liabilities);$('#monthlyNetValue').textContent=money(m.income-m.expense);
    $('#monthlyNetValue').className='summary-value '+(m.income-m.expense<0?'negative':'positive');
    $('#assetSub').textContent=`${state.accounts.filter(a=>a.kind==='asset').length} 个现金/资产账户`;
    $('#liabilitySub').textContent=`${state.accounts.filter(a=>a.kind==='liability').length} 个负债账户`;
    $('#monthlyNetSub').textContent=`收入 ${money(m.income)} · 支出 ${money(m.expense)}`;
    const warnings=[];
    if(p.missing.length)warnings.push(`账户缺少 ${p.missing.join('、')} → ${reportCurrency()} 汇率`);
    if(m.missing)warnings.push(`本月有 ${m.missing} 笔流水待补换算`);
    $('#fxWarning').classList.toggle('hidden',!warnings.length);
    $('#fxWarning').innerHTML=warnings.length?`⚠ 当前统一合计不完整：${warnings.join('；')}。请在“汇率与数据”设置默认汇率，或在流水中填写手动折算。`:'';
    renderAssetSnapshot();renderDebtSnapshot();renderBudgetProgress();renderExpenseChart();
    const recent=[...monthTransactions()].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt).slice(0,6);
    $('#recentTransactions').innerHTML=recent.length?recent.map(transactionHTML).join(''):emptyHTML('🧾','还没有本月流水','先建立账户，再记录第一笔收入、支出或转账。','<button class="primary-button" data-open-entry>＋ 记第一笔</button>');
  }
  function renderAssetSnapshot(){
    const assets=state.accounts.filter(a=>a.kind==='asset');
    $('#assetSnapshot').innerHTML=assets.length?assets.map(account=>{
      const converted=accountConverted(account);
      return `<div class="snapshot-item"><div class="account-icon">${accountIcon(account)}</div><div class="snapshot-main"><b>${esc(account.name)}</b><span>${assetTypes[account.type]||'资产'} · ${account.currency}</span></div><div class="snapshot-value"><b>${originalMoney(account.balance,account.currency)}</b><span>${account.currency===reportCurrency()?'':'≈ '+(converted===null?'待换算':money(converted))}</span></div></div>`;
    }).join(''):emptyHTML('💳','还没有现金账户','添加银行卡、现金或电子钱包后，就能看见钱分布在哪里。','<button class="soft-button" data-open-account="asset">＋ 添加账户</button>');
  }
  function renderDebtSnapshot(){
    const debts=state.accounts.filter(a=>a.kind==='liability').sort((a,b)=>(a.nextDueDate||'9999').localeCompare(b.nextDueDate||'9999'));
    $('#debtSnapshot').innerHTML=debts.length?debts.map(account=>{
      const converted=accountConverted(account);const due=dueText(account.nextDueDate);
      return `<div class="debt-item"><div class="account-icon">${accountIcon(account)}</div><div class="debt-copy"><b>${esc(account.name)}</b><span>账单应还 ${originalMoney(account.statementDue||0,account.currency)} · <i class="${due.soon?'due-soon':''}">${due.text}</i></span></div><div class="debt-amount">${originalMoney(account.balance,account.currency)}<small>${account.currency===reportCurrency()?'':converted===null?' · 待换算':' · ≈'+money(converted)}</small></div></div>`;
    }).join(''):emptyHTML('💳','目前没有负债账户','添加信用卡后，可区分总欠款、本期账单与还款日。','<button class="soft-button" data-open-account="liability">＋ 添加信用卡</button>');
  }
  function dueText(date){
    if(!date)return {text:'未设还款日',soon:false};
    const today=new Date(localDate()+'T00:00:00');const due=new Date(date+'T00:00:00');const days=Math.round((due-today)/86400000);
    if(days<0)return {text:`已逾期 ${Math.abs(days)} 天`,soon:true};
    if(days===0)return {text:'今天还款',soon:true};
    return {text:`${days} 天后还款`,soon:days<=5};
  }
  function getBudgetPlan(){
    const saved=state.budgets[currentMonth];if(!saved)return {currency:reportCurrency(),values:{}};
    const values={};
    Object.entries(saved.values||{}).forEach(([category,amount])=>{const converted=convert(amount,saved.currency,reportCurrency());values[category]=converted===null?0:converted;});
    return {currency:reportCurrency(),values};
  }
  function renderBudgetProgress(){
    const plan=getBudgetPlan(),active=expenseCategories.filter(c=>Number(plan.values[c.name])>0),expenses=monthTransactions().filter(t=>t.type==='expense');
    if(!active.length){$('#budgetProgress').innerHTML=emptyHTML('🎯','还没有本月预算','预算使用当前统一显示货币，便于跨币种比较。','<button class="soft-button" data-go="monthly">设置预算</button>');return;}
    $('#budgetProgress').innerHTML=active.map(category=>{
      let spent=0,missing=0;expenses.filter(t=>t.category===category.name).forEach(t=>{const value=txReportValue(t);if(value===null)missing++;else spent+=value;});
      const limit=Number(plan.values[category.name]),rate=limit?spent/limit*100:0,status=rate>100?'over':rate>=80?'warn':'';
      return `<div class="budget-item"><div class="budget-row"><span class="budget-name"><span>${category.icon}</span>${category.name}${missing?` · ${missing}笔待换算`:''}</span><span class="budget-amount">${money(spent)} / ${money(limit)}</span></div><div class="progress"><i class="${status}" style="width:${Math.min(rate,100)}%"></i></div></div>`;
    }).join('');
  }
  function renderExpenseChart(){
    const items=monthTransactions().filter(t=>t.type==='expense');let total=0;
    const values=expenseCategories.map(category=>{let value=0;items.filter(t=>t.category===category.name).forEach(t=>{const converted=txReportValue(t);if(converted!==null)value+=converted;});total+=value;return {...category,value};}).filter(c=>c.value>0).sort((a,b)=>b.value-a.value);
    if(!total){$('#expenseChart').innerHTML=emptyHTML('◔','暂无可统计支出','补齐换算后，跨币种支出会统一显示在这里。');return;}
    let cursor=0;const segments=values.map(c=>{const start=cursor;cursor+=c.value/total*100;return `${c.color} ${start}% ${cursor}%`;}).join(',');
    $('#expenseChart').innerHTML=`<div class="donut" style="background:conic-gradient(${segments})"><div class="donut-center"><strong>${money(total)}</strong><span>真实消费</span></div></div><div class="legend">${values.slice(0,6).map(c=>`<div class="legend-item"><i class="legend-dot" style="background:${c.color}"></i><span>${c.name}</span><span class="legend-value">${Math.round(c.value/total*100)}%</span></div>`).join('')}</div>`;
  }
  function transactionHTML(item){
    const category=categoryInfo(item.category,item.type);const report=txReportValue(item);
    const sign=item.type==='income'?'+':item.type==='expense'?'−':'↔ ';
    const account=item.accountName||findAccount(item.accountId)?.name||'未关联账户';
    const target=item.targetAccountName||findAccount(item.targetAccountId)?.name||'';
    const route=item.type==='transfer'?`${account} → ${target}`:account;
    const converted=item.type==='transfer'?'不计入收支':item.currency===reportCurrency()?'已是月报货币':report===null?'待补换算':`≈ ${money(report)}`;
    return `<div class="transaction-item" data-id="${item.id}"><div class="account-icon" style="background:${category.color}16">${category.icon}</div><div class="transaction-main"><div class="transaction-title">${esc(item.note||category.name)}</div><div class="transaction-meta">${esc(item.type==='transfer'?'转账/还款':item.category)} · ${formatDate(item.date)} · ${esc(route)}</div></div><div class="transaction-value ${item.type==='income'?'positive':item.type==='expense'?'negative':'transfer-color'}">${sign}${originalMoney(item.amount,item.currency)}<small>${converted}</small></div><div class="item-actions"><button class="icon-button edit-entry" aria-label="编辑">✎</button><button class="icon-button delete-entry" aria-label="删除">⌫</button></div></div>`;
  }
  function formatDate(date){const [y,m,d]=date.split('-');return `${Number(m)}月${Number(d)}日${y!==currentMonth.slice(0,4)?' · '+y:''}`;}

  function renderTransactions(){
    const m=monthTotals();$('#txIncome').textContent=money(m.income);$('#txExpense').textContent=money(m.expense);$('#txTransferCount').textContent=`${m.list.filter(t=>t.type==='transfer').length} 笔转账/还款未计入支出`;
    const categories=[...expenseCategories,...incomeCategories].map(c=>c.name).filter((v,i,a)=>a.indexOf(v)===i);const current=$('#categoryFilter').value||'all';
    $('#categoryFilter').innerHTML='<option value="all">全部类别</option>'+categories.map(c=>`<option value="${c}">${c}</option>`).join('');if(categories.includes(current))$('#categoryFilter').value=current;
    const query=$('#searchInput').value.trim().toLowerCase(),type=$('#typeFilter').value,category=$('#categoryFilter').value;
    const list=monthTransactions().filter(item=>{
      const names=`${item.note} ${item.category} ${item.accountName} ${item.targetAccountName}`.toLowerCase();
      return(type==='all'||item.type===type)&&(category==='all'||item.category===category)&&(query===''||names.includes(query));
    }).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
    $('#allTransactions').innerHTML=list.length?list.map(transactionHTML).join(''):emptyHTML('🔎','没有符合条件的流水','更换筛选条件，或记录一笔新流水。','<button class="soft-button" data-open-entry>＋ 记一笔</button>');
  }
  function renderAccounts(){
    const p=portfolio();$('#accountAssetTotal').textContent=money(p.assets);$('#accountDebtTotal').textContent=money(p.liabilities);$('#accountNetTotal').textContent=money(p.net);
    const assets=state.accounts.filter(a=>a.kind==='asset'),debts=state.accounts.filter(a=>a.kind==='liability');
    $('#assetAccounts').innerHTML=assets.length?assets.map(accountCardHTML).join(''):emptyHTML('🏦','还没有资产账户','建议先添加你现在实际使用的银行卡、现金和支付平台。','<button class="soft-button" data-open-account="asset">＋ 添加资产账户</button>');
    $('#liabilityAccounts').innerHTML=debts.length?debts.map(accountCardHTML).join(''):emptyHTML('💳','还没有负债账户','信用卡总欠款与本期账单应还会分别显示。','<button class="soft-button" data-open-account="liability">＋ 添加信用卡</button>');
  }
  function accountCardHTML(account){
    const converted=accountConverted(account);const typeName=account.kind==='asset'?(assetTypes[account.type]||'资产'):(liabilityTypes[account.type]||'负债');
    const details=account.kind==='liability'?`<div class="debt-details"><div><span>本期账单应还</span><b>${originalMoney(account.statementDue||0,account.currency)}</b></div><div><span>下次还款日</span><b class="${dueText(account.nextDueDate).soon?'due-soon':''}">${account.nextDueDate||'未设置'}</b></div></div>`:'';
    const repay=account.kind==='liability'? `<button class="small-button repay-button" data-repay="${account.id}">记还款</button>`:'';
    return `<article class="account-card" data-account-id="${account.id}"><div class="account-card-top"><div class="account-name"><div class="account-icon">${accountIcon(account)}</div><div><b>${esc(account.name)}</b><span>${typeName} · ${account.currency}</span></div></div><button class="icon-button edit-account" aria-label="编辑账户">✎</button></div><div class="account-balance ${account.kind==='liability'?'negative':'blue'}">${originalMoney(account.balance,account.currency)}</div><div class="converted-balance">${account.currency===reportCurrency()?'当前统一显示货币':converted===null?'缺少换算率':'≈ '+money(converted)}</div>${details}<div class="account-card-foot"><span>余额更新 ${account.updatedAt?formatDate(account.updatedAt.slice(0,10)):'今天'}</span><div class="account-card-actions">${repay}</div></div></article>`;
  }
  function renderBudgets(){
    const plan=getBudgetPlan(),expenses=monthTransactions().filter(item=>item.type==='expense');
    $('#budgetCurrencyHint').textContent=`本月收支和预算统一以 ${reportCurrency()} 显示；每记一笔支出，分类剩余预算会立即更新。`;
    $('#budgetInputs').innerHTML=expenseCategories.map(category=>{
      let spent=0,missing=0;
      expenses.filter(item=>item.category===category.name).forEach(item=>{const value=txReportValue(item);if(value===null)missing++;else spent+=value;});
      return `<div class="monthly-budget-row" data-category="${category.name}" data-spent="${spent}"><div class="monthly-budget-category"><div class="account-icon" style="background:${category.color}16">${category.icon}</div><div><b>${category.name}</b><span>${missing?missing+' 笔待补换算':'本月自动统计'}</span></div></div><div class="monthly-budget-spent">${money(spent)}</div><div class="money-input"><span>${symbols[reportCurrency()]}</span><input id="budget-${category.name}" class="field-input budget-value" data-category="${category.name}" type="number" min="0" step="0.01" inputmode="decimal" value="${decimalValue(plan.values[category.name])}" placeholder="0.00" /></div><div class="monthly-budget-result"><b>不设额度</b><span>${spent>0?'已发生支出':'尚无支出'}</span></div><div class="progress"><i></i></div></div>`;
    }).join('');
    updateMonthlyBudgetLive();$$('.budget-value').forEach(el=>el.addEventListener('input',updateMonthlyBudgetLive));
  }
  function updateMonthlyBudgetLive(){
    let totalBudget=0;
    $$('.monthly-budget-row').forEach(row=>{
      const spent=Number(row.dataset.spent)||0,input=row.querySelector('.budget-value'),limit=Number(input.value)||0,result=row.querySelector('.monthly-budget-result'),bar=row.querySelector('.progress i');
      totalBudget+=limit;
      if(limit<=0){
        result.innerHTML=`<b class="${spent>0?'status-warning':''}">不设额度</b><span>${spent>0?'已花 '+money(spent):'0.00 · 本月尚无支出'}</span>`;
        bar.className=spent>0?'warn':'';bar.style.width=spent>0?'100%':'0%';return;
      }
      const remaining=limit-spent,rate=spent/limit*100;
      if(remaining<0)result.innerHTML=`<b class="status-over">超支 ${money(Math.abs(remaining))}</b><span>已用 ${Math.round(rate)}%</span>`;
      else if(rate>=80)result.innerHTML=`<b class="status-warning">剩余 ${money(remaining)}</b><span>已用 ${Math.round(rate)}%，接近上限</span>`;
      else result.innerHTML=`<b class="status-safe">剩余 ${money(remaining)}</b><span>已用 ${Math.round(rate)}%</span>`;
      bar.className=remaining<0?'over':rate>=80?'warn':'';bar.style.width=Math.min(rate,100)+'%';
    });
    const totals=monthTotals(),remaining=totalBudget-totals.expense,card=$('#overallBudgetCard');
    $('#budgetTotal').textContent=money(totalBudget);
    card.classList.remove('budget-ok','budget-over');
    if(totalBudget<=0){$('#overallBudgetStatus').textContent='不设额度';$('#overallBudgetStatus').className='';$('#overallBudgetSub').textContent='所有分类预算均为 0.00';}
    else if(remaining<0){card.classList.add('budget-over');$('#overallBudgetStatus').textContent='超预算 '+money(Math.abs(remaining));$('#overallBudgetStatus').className='negative';$('#overallBudgetSub').textContent=`预算 ${money(totalBudget)} · 支出 ${money(totals.expense)}`;}
    else{card.classList.add('budget-ok');$('#overallBudgetStatus').textContent='剩余 '+money(remaining);$('#overallBudgetStatus').className='positive';$('#overallBudgetSub').textContent=`已使用 ${Math.round(totals.expense/totalBudget*100)}%${totals.missing?' · '+totals.missing+'笔待换算':''}`;}
  }
  function renderSettings(){
    $('#rateInputs').innerHTML=currencies.map(code=>`<div class="rate-row"><span>${code}</span><input class="field-input rate-input" data-from="${code}" data-to="AUD" type="number" min="0" step="0.000001" value="${state.rates[code]?.AUD||''}" placeholder="未设置" ${code==='AUD'?'disabled':''}/><input class="field-input rate-input" data-from="${code}" data-to="HKD" type="number" min="0" step="0.000001" value="${state.rates[code]?.HKD||''}" placeholder="未设置" ${code==='HKD'?'disabled':''}/></div>`).join('');
  }

  function switchView(view){$$('.view').forEach(el=>el.classList.toggle('active',el.id===view));$$('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));window.scrollTo({top:0,behavior:'smooth'});}
  function populateAccountOptions(){
    const assets=state.accounts.filter(a=>a.kind==='asset'),all=state.accounts;
    const list=entryType==='income'?assets:entryType==='transfer'?assets:all;
    $('#accountInput').innerHTML=(entryType==='transfer'?'':'<option value="">不关联账户（仅统计月报）</option>')+list.map(a=>`<option value="${a.id}">${accountIcon(a)} ${esc(a.name)} · ${a.currency}${a.kind==='liability'?'（负债）':''}</option>`).join('');
    $('#targetAccountInput').innerHTML='<option value="">请选择转入账户</option>'+all.map(a=>`<option value="${a.id}">${accountIcon(a)} ${esc(a.name)} · ${a.currency}${a.kind==='liability'?'（还款）':''}</option>`).join('');
    $('#accountInput').required=entryType==='transfer';
  }
  function setEntryType(type){
    entryType=type;['expense','income','transfer'].forEach(name=>$('#'+name+'Toggle').className=name===type?`active ${name}`:'');
    $('#categoryField').classList.toggle('hidden',type==='transfer');$('#targetField').classList.toggle('hidden',type!=='transfer');$('#conversionFields').classList.toggle('hidden',type==='transfer');
    $('#entrySubtitle').textContent=type==='expense'?'支出会减少资产，信用卡消费会增加负债':type==='income'?'收入会增加所选资产账户余额':'转账与信用卡还款不会计入收入或支出';
    $('#accountLabel').textContent=type==='expense'?'付款账户':type==='income'?'收款账户':'转出账户';
    const categories=type==='income'?incomeCategories:expenseCategories;$('#categoryInput').innerHTML=categories.map(c=>`<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
    populateAccountOptions();updateAmountFields();
  }
  function updateAmountFields(){
    const currency=$('#currencyInput').value,account=findAccount($('#accountInput').value),target=findAccount($('#targetAccountInput').value);
    const accountDiff=account&&account.currency!==currency;
    $('#accountAmountField').classList.toggle('hidden',!accountDiff);$('#accountAmountInput').required=!!accountDiff;
    $('#accountCurrencyHint').textContent=account?`（${account.currency}）`:'';
    const targetDiff=entryType==='transfer'&&target&&target.currency!==currency;
    $('#targetAmountField').classList.toggle('hidden',!targetDiff);$('#targetAmountInput').required=!!targetDiff;
    $('#targetCurrencyHint').textContent=target?`（${target.currency}）`:'';
  }
  function openEntry(id=null,preset={}){
    editingTransactionId=id;$('#entryForm').reset();$('#dateInput').value=localDate();$$('.currency-options').forEach(el=>el.innerHTML=currencyOptions());
    $('#currencyInput').value='CNY';$('#entryTitle').textContent=id?'编辑流水':'记一笔';
    if(id){
      const item=state.transactions.find(t=>t.id===id);if(!item)return;
      setEntryType(item.type);$('#amountInput').value=decimalValue(item.amount);$('#currencyInput').value=item.currency;populateAccountOptions();$('#accountInput').value=item.accountId||'';$('#targetAccountInput').value=item.targetAccountId||'';$('#categoryInput').value=item.category;$('#dateInput').value=item.date;$('#noteInput').value=item.note||'';$('#accountAmountInput').value=decimalValue(item.accountAmount,true);$('#targetAmountInput').value=decimalValue(item.toAmount,true);$('#audConverted').value=decimalValue(item.converted?.AUD,true);$('#hkdConverted').value=decimalValue(item.converted?.HKD,true);updateAmountFields();
    }else{
      setEntryType(preset.type||'expense');
      if(preset.targetId){$('#targetAccountInput').value=preset.targetId;const target=findAccount(preset.targetId);if(target)$('#currencyInput').value=target.currency;}
      updateAmountFields();
    }
    $('#entryDialog').showModal();setTimeout(()=>$('#amountInput').focus(),80);
  }
  function closeEntry(){if($('#entryDialog').open)$('#entryDialog').close();editingTransactionId=null;}
  function openAccount(kind,id=null){
    editingAccountId=id;$('#accountForm').reset();$$('#accountDialog .currency-options').forEach(el=>el.innerHTML=currencyOptions());$('#accountCurrency').value='CNY';
    const account=id?findAccount(id):null;kind=account?.kind||kind;$('#accountKind').value=kind;$('#accountTitle').textContent=id?'编辑账户':kind==='asset'?'新增资产账户':'新增信用卡 / 负债';
    $('#balanceLabel').textContent=kind==='asset'?'当前实际余额':'当前总欠款';$('#liabilityFields').classList.toggle('hidden',kind!=='liability');$('#deleteAccount').classList.toggle('hidden',!id);
    const types=kind==='asset'?assetTypes:liabilityTypes;$('#accountType').innerHTML=Object.entries(types).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
    if(account){$('#accountName').value=account.name;$('#accountType').value=account.type;$('#accountCurrency').value=account.currency;$('#accountBalance').value=decimalValue(account.balance);$('#statementDue').value=decimalValue(account.statementDue);$('#minimumDue').value=decimalValue(account.minimumDue);$('#nextDueDate').value=account.nextDueDate||'';$('#statementDay').value=account.statementDay||'';}
    $('#accountDialog').showModal();setTimeout(()=>$('#accountName').focus(),80);
  }
  function closeAccount(){if($('#accountDialog').open)$('#accountDialog').close();editingAccountId=null;}
  function applyTransactionEffect(item,direction){
    const account=findAccount(item.accountId),impact=Number(item.accountAmount)||Number(item.amount)||0;
    if(item.type==='expense'&&account){account.balance=Number(account.balance)+(account.kind==='asset'?-direction*impact:direction*impact);}
    if(item.type==='income'&&account&&account.kind==='asset'){account.balance=Number(account.balance)+direction*impact;}
    if(item.type==='transfer'){
      if(account&&account.kind==='asset')account.balance=Number(account.balance)-direction*impact;
      const target=findAccount(item.targetAccountId),toAmount=Number(item.toAmount)||Number(item.amount)||0;
      if(target?.kind==='asset')target.balance=Number(target.balance)+direction*toAmount;
      if(target?.kind==='liability'){
        target.balance=Math.max(0,Number(target.balance)-direction*toAmount);
        if(direction===1){item.statementReduction=Math.min(Number(target.statementDue)||0,toAmount);target.statementDue=Math.max(0,(Number(target.statementDue)||0)-item.statementReduction);}
        else target.statementDue=(Number(target.statementDue)||0)+(Number(item.statementReduction)||0);
      }
    }
    [account,findAccount(item.targetAccountId)].filter(Boolean).forEach(a=>a.updatedAt=new Date().toISOString());
  }
  function transactionFromForm(){
    const amount=Number($('#amountInput').value),currency=$('#currencyInput').value,account=findAccount($('#accountInput').value),target=findAccount($('#targetAccountInput').value);
    if(!amount||amount<=0)throw new Error('请输入有效金额');
    if(entryType==='transfer'&&(!account||!target))throw new Error('请选择转出和转入账户');
    if(entryType==='transfer'&&account.id===target.id)throw new Error('转出与转入账户不能相同');
    const accountAmount=account?(account.currency===currency?amount:Number($('#accountAmountInput').value)):amount;
    if(account&&(!accountAmount||accountAmount<=0))throw new Error(`请填写记入 ${account.currency} 账户的实际金额`);
    const toAmount=entryType==='transfer'?(target.currency===currency?amount:Number($('#targetAmountInput').value)):amount;
    if(entryType==='transfer'&&(!toAmount||toAmount<=0))throw new Error(`请填写转入 ${target.currency} 账户的实际金额`);
    const existing=editingTransactionId?state.transactions.find(t=>t.id===editingTransactionId):null;
    if(entryType==='transfer'&&target.kind==='liability'){
      const restored=existing?.type==='transfer'&&existing.targetAccountId===target.id?Number(existing.toAmount)||0:0;
      if(toAmount>Number(target.balance)+restored+0.000001)throw new Error('还款金额不能超过当前总欠款');
    }
    return {id:editingTransactionId||makeId(),type:entryType,amount,currency,category:entryType==='transfer'?'':$('#categoryInput').value,date:$('#dateInput').value,note:$('#noteInput').value.trim(),accountId:account?.id||'',targetAccountId:target?.id||'',accountName:account?.name||'',targetAccountName:target?.name||'',accountAmount,toAmount,converted:{AUD:Number($('#audConverted').value)||'',HKD:Number($('#hkdConverted').value)||''},statementReduction:0,createdAt:existing?.createdAt||Date.now()};
  }

  document.addEventListener('click',event=>{
    const openEntryButton=event.target.closest('[data-open-entry]');if(openEntryButton)openEntry();
    const go=event.target.closest('[data-go]');if(go)switchView(go.dataset.go);
    const openAccountButton=event.target.closest('[data-open-account]');if(openAccountButton)openAccount(openAccountButton.dataset.openAccount);
    const editEntryButton=event.target.closest('.edit-entry');if(editEntryButton)openEntry(editEntryButton.closest('[data-id]').dataset.id);
    const deleteEntryButton=event.target.closest('.delete-entry');if(deleteEntryButton){const id=deleteEntryButton.closest('[data-id]').dataset.id;if(confirm('确定删除这笔流水吗？账户余额会同步撤销这笔影响。')){const item=state.transactions.find(t=>t.id===id);if(item)applyTransactionEffect(item,-1);state.transactions=state.transactions.filter(t=>t.id!==id);saveState('流水已删除，余额已同步');render();}}
    const editAccountButton=event.target.closest('.edit-account');if(editAccountButton)openAccount('',editAccountButton.closest('[data-account-id]').dataset.accountId);
    const repayButton=event.target.closest('[data-repay]');if(repayButton)openEntry(null,{type:'transfer',targetId:repayButton.dataset.repay});
  });
  document.addEventListener('blur',event=>{const input=event.target.closest?.('input[type="number"][step="0.01"]');if(input&&input.value!==''&&Number.isFinite(Number(input.value)))input.value=Number(input.value).toFixed(2);},true);
  $$('[data-view]').forEach(el=>el.addEventListener('click',()=>switchView(el.dataset.view)));
  $('#globalMonth').addEventListener('change',event=>{currentMonth=event.target.value||localMonth();render();});
  $('#reportCurrency').addEventListener('change',event=>{state.settings.reportCurrency=event.target.value;saveState('统一显示货币已更新');render();});
  $('#searchInput').addEventListener('input',renderTransactions);$('#typeFilter').addEventListener('change',renderTransactions);$('#categoryFilter').addEventListener('change',renderTransactions);
  $('#expenseToggle').addEventListener('click',()=>setEntryType('expense'));$('#incomeToggle').addEventListener('click',()=>setEntryType('income'));$('#transferToggle').addEventListener('click',()=>setEntryType('transfer'));
  $('#currencyInput').addEventListener('change',updateAmountFields);$('#accountInput').addEventListener('change',updateAmountFields);$('#targetAccountInput').addEventListener('change',updateAmountFields);
  $('#closeEntry').addEventListener('click',closeEntry);$('#cancelEntry').addEventListener('click',closeEntry);$('#entryDialog').addEventListener('click',event=>{if(event.target===$('#entryDialog'))closeEntry();});
  $('#entryForm').addEventListener('submit',event=>{
    event.preventDefault();
    try{const data=transactionFromForm();const existing=editingTransactionId?state.transactions.find(t=>t.id===editingTransactionId):null;if(existing)applyTransactionEffect(existing,-1);applyTransactionEffect(data,1);if(existing)state.transactions=state.transactions.map(t=>t.id===existing.id?data:t);else state.transactions.push(data);saveState(existing?'流水和余额已更新':'已记下，账户余额已同步');closeEntry();render();}catch(error){toast(error.message);}
  });
  $('#closeAccount').addEventListener('click',closeAccount);$('#cancelAccount').addEventListener('click',closeAccount);$('#accountDialog').addEventListener('click',event=>{if(event.target===$('#accountDialog'))closeAccount();});
  $('#accountForm').addEventListener('submit',event=>{
    event.preventDefault();const kind=$('#accountKind').value,existing=editingAccountId?findAccount(editingAccountId):null;
    const account={id:editingAccountId||makeId(),kind,name:$('#accountName').value.trim(),type:$('#accountType').value,currency:$('#accountCurrency').value,balance:Number($('#accountBalance').value)||0,statementDue:kind==='liability'?Number($('#statementDue').value)||0:0,minimumDue:kind==='liability'?Number($('#minimumDue').value)||0:0,nextDueDate:kind==='liability'?$('#nextDueDate').value:'',statementDay:kind==='liability'?Number($('#statementDay').value)||'':'',updatedAt:new Date().toISOString()};
    if(!account.name){toast('请输入账户名称');return;}if(account.kind==='liability'&&account.statementDue>account.balance){toast('本期账单应还不能大于当前总欠款');return;}
    if(existing)state.accounts=state.accounts.map(a=>a.id===existing.id?account:a);else state.accounts.push(account);saveState(existing?'账户已更新':'账户已添加');closeAccount();render();
  });
  $('#deleteAccount').addEventListener('click',()=>{
    if(!editingAccountId)return;const used=state.transactions.some(t=>t.accountId===editingAccountId||t.targetAccountId===editingAccountId);
    const message=used?'该账户已有历史流水。删除账户后，流水会保留账户名称，但不再联动余额。确定删除吗？':'确定删除这个账户吗？';
    if(confirm(message)){state.accounts=state.accounts.filter(a=>a.id!==editingAccountId);saveState('账户已删除，历史流水已保留');closeAccount();render();}
  });
  $('#saveBudget').addEventListener('click',()=>{const values={};$$('.budget-value').forEach(el=>values[el.dataset.category]=Math.max(0,Number(el.value)||0));state.budgets[currentMonth]={currency:reportCurrency(),values};saveState('本月预算已保存');render();});
  $('#budgetDetails').addEventListener('toggle',()=>{state.settings.budgetCollapsed=!$('#budgetDetails').open;saveState();});
  $('#saveRates').addEventListener('click',()=>{$$('.rate-input').forEach(el=>{state.rates[el.dataset.from][el.dataset.to]=Number(el.value)||'';});state.rates.AUD.AUD=1;state.rates.HKD.HKD=1;saveState('默认换算率已保存');render();});
  $('#exportJson').addEventListener('click',()=>download(`财务总账备份-${localDate()}.json`,JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2),'application/json'));
  $('#exportCsv').addEventListener('click',()=>{
    const rows=[['日期','类型','类别','原始金额','原币','折算AUD','折算HKD','账户','转入账户','备注'],...[...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)).map(t=>[t.date,{income:'收入',expense:'支出',transfer:'转账/还款'}[t.type],t.category,t.amount,t.currency,convert(t.amount,t.currency,'AUD',t.converted)??'',convert(t.amount,t.currency,'HKD',t.converted)??'',t.accountName,t.targetAccountName,t.note])];
    const csv='\ufeff'+rows.map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\n');download(`财务总账流水-${localDate()}.csv`,csv,'text/csv;charset=utf-8');
  });
  $('#importButton').addEventListener('click',()=>$('#importFile').click());$('#importFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.transactions))throw new Error();if(confirm(`将导入 ${data.accounts?.length||0} 个账户和 ${data.transactions.length} 笔流水，并覆盖当前数据。继续吗？`)){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));state=loadState();saveState('完整备份已恢复');render();}}catch{alert('无法读取此备份，请选择本记账本导出的 JSON 文件。');}event.target.value='';});
  $('#clearData').addEventListener('click',()=>{if(confirm('确定清空全部账户、负债、流水、预算和汇率吗？')&&confirm('请再次确认：此操作无法撤销。')){state=clone(defaultState);localStorage.removeItem(STORAGE_KEY);currentMonth=localMonth();toast('全部数据已清空');render();switchView('dashboard');}});
  function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),500);toast('文件已导出');}

  $$('.currency-options').forEach(el=>el.innerHTML=currencyOptions());
  if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
  render();
})();
