'use strict';
const P=Portfolio, KEY='myportfolio.v1', $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:4}).format(n);
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(n);
const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(n);
let state, blocked=false, originalRaw='';
try {originalRaw=localStorage.getItem(KEY)||'';state=P.normalize(originalRaw?JSON.parse(originalRaw):{transactions:[],cash:[],prices:{},fx:150,lastAccount:'その他'});}
catch(e){blocked=true;state=P.normalize({transactions:[],cash:[],prices:{},fx:150,lastAccount:'その他'});$('#notice').textContent='保存データを読み込めません。元データは保持しています。「バックアップ」で退避してから修復してください。'+e.message;}
function commit(next,{restore=false}={}){
 try {
  if(blocked&&!restore)throw Error('元データ保護のため保存を停止しています。バックアップを確認してください。');
  const candidate=P.normalize({...next,updatedAt:new Date().toISOString()});
  const raw=localStorage.getItem(KEY)||'';
  if(!blocked&&raw!==originalRaw)throw Error('別のタブで更新されています。再読み込みしてから操作してください。');
  if(raw)localStorage.setItem(KEY+'.previous',raw);
  const data=JSON.stringify(candidate);localStorage.setItem(KEY,data);
  originalRaw=data;state=candidate;blocked=false;render();return true;
 }catch(e){alert('保存できませんでした：'+e.message);return false;}
}
const getHoldings=()=>P.holdings(state.transactions);
let displayedHoldings=[];
function isTsumitate(h){return ['tsumitate','legacy'].includes(h.taxBucket)||/つみたて|積立NISA|積立ＮＩＳＡ/.test(h.account);}
function selectedHoldings(hs){const group=$('#holdingGroup').value,account=$('#holdingAccount').value,sort=$('#holdingSort').value;return hs.filter(h=>(!account||h.account===account)&&(group==='all'||group==='stock'&&h.assetType!=='FUND'||group==='fund'&&h.assetType==='FUND'&&!isTsumitate(h)||group==='tsumitate'&&isTsumitate(h))).sort((a,b)=>sort==='value'?holdingValue(b)-holdingValue(a):String(a[sort]||a.symbol).localeCompare(String(b[sort]||b.symbol),'ja',{numeric:true}));}
function holdingValue(h){return (state.prices[h.key]===undefined?h.cost:h.qty*state.prices[h.key]/h.priceUnit)*(h.market==='US'?state.fx:1);}
function holdingCostYen(h){return h.market==='US'?(state.yenAvgCosts[h.key]!==undefined?h.qty*state.yenAvgCosts[h.key]:h.costJPY+h.unpricedCostUSD*state.fx):h.cost;}
function holdingGainYen(h){return holdingValue(h)-holdingCostYen(h);}
function missingAcquisitionFx(h){return h.market==='US'&&h.unpricedCostUSD>0&&state.yenAvgCosts[h.key]===undefined;}

function accountOptions(){return state.accounts?.length?state.accounts:['その他'];}
function syncAccountSelects(){for(const form of [$('#txForm'),$('#cashForm')]){const select=field(form,'account'),current=select.value;select.innerHTML=accountOptions().map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');select.value=accountOptions().includes(current)?current:(state.lastAccount&&accountOptions().includes(state.lastAccount)?state.lastAccount:accountOptions()[0]);}const csv=$('#csvAccount');if(csv){const current=csv.value;csv.innerHTML=accountOptions().map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');csv.value=accountOptions().includes(current)?current:(state.lastAccount&&accountOptions().includes(state.lastAccount)?state.lastAccount:accountOptions()[0]);}}
function renderAccountList(){const list=$('#accountList');if(!list)return;list.innerHTML=accountOptions().map((a,i)=>`<div class="account-row"><span>${esc(a)}</span>${a==='その他'?'':'<button type="button" class="icon" data-delete-account="'+i+'">削除</button>'}</div>`).join('');}
function render(){
 syncAccountSelects();
 const all=getHoldings();let assets=0,pl=0,unknown=0;
 const accountSelect=$('#holdingAccount'),chosen=accountSelect.value,brokerAccounts=[...new Set(all.map(h=>h.account))].sort((a,b)=>a.localeCompare(b,'ja'));accountSelect.innerHTML='<option value="">全口座</option>'+brokerAccounts.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');accountSelect.value=brokerAccounts.includes(chosen)?chosen:'';
 for(const h of all){assets+=holdingValue(h);if(state.prices[h.key]===undefined)unknown++;else pl+=holdingGainYen(h);}
 $('#brokerSummary').innerHTML=brokerAccounts.map(account=>{const items=all.filter(h=>h.account===account),accountCash=state.cash.filter(c=>c.account===account),known=items.filter(h=>state.prices[h.key]!==undefined),value=items.reduce((n,h)=>n+holdingValue(h),0)+accountCash.reduce((n,c)=>n+c.amount*(c.currency==='USD'?state.fx:1),0),gain=known.reduce((n,h)=>n+holdingGainYen(h),0),cashGain=accountCash.reduce((n,c)=>n+(c.currency==='USD'&&c.fxRate?c.amount*(state.fx-c.fxRate):0),0),missingFx=items.some(missingAcquisitionFx)||accountCash.some(c=>c.currency==='USD'&&!c.fxRate);return `<button type="button" class="broker-item" data-broker="${esc(account)}" aria-label="${esc(account)}の銘柄を表示"><span>${esc(account)}・${items.length}銘柄</span><strong>評価額 ${yen(value)}</strong><span class="${gain+cashGain>=0?'positive':'negative'}">含み損益 ${yen(gain+cashGain)}${known.length<items.length?'（価格未設定あり）':''}${missingFx?'（為替未入力あり）':''}</span>${accountCash.some(c=>c.currency==='USD')?`<small>うち米ドル現金為替損益 ${yen(cashGain)}</small>`:''}</button>`;}).join('')||'<p class="empty">保有銘柄を登録すると口座別の損益を表示します。</p>';
 const hs=displayedHoldings=selectedHoldings(all),known=hs.filter(h=>state.prices[h.key]!==undefined),selectedPL=known.reduce((sum,h)=>sum+holdingGainYen(h),0);
 $('#holdingSummary').textContent=`表示中 ${hs.length}銘柄 ／ 評価額 ${yen(hs.reduce((sum,h)=>sum+holdingValue(h),0))} ／ 含み損益 ${yen(selectedPL)}${known.length<hs.length?'（価格未設定を除く）':''}${hs.some(missingAcquisitionFx)?'（買付時為替未入力の分は概算）':''}`;
 $('#holdingsTable tbody').innerHTML=hs.map((h,i)=>{
  const p=state.prices[h.key],avg=h.cost/h.qty*h.priceUnit,isUS=h.market==='US',unit=n=>isUS?usd(n):fmt(n),nativeValue=p===undefined?h.cost:h.qty*p/h.priceUnit,nativeGain=p===undefined?0:nativeValue-h.cost;
  // 現在値が未入力なら取得原価で仮評価し、損益は未算出として明示する。
  const gainYen=p===undefined?0:holdingGainYen(h);

  return `<tr><td><b>${esc(h.name)}</b><br><small>${esc(h.symbol)}・${esc(h.account)}・${esc(({STOCK_JP:'日本株',STOCK_US:'米国株',FUND:'投資信託',ETF:'ETF'})[h.assetType])}${h.assetType==='FUND'?' / '+h.priceUnit+'口当たり':''}</small></td><td>${fmt(h.qty)}</td><td>${unit(avg)}${isUS?`<small>円平均取得 ${state.yenAvgCosts[h.key]===undefined?'未登録':yen(state.yenAvgCosts[h.key])} <button class="icon" data-yen-cost="${i}">設定</button></small>`:''}</td><td>${p===undefined?'未設定':unit(p)}<small>${esc(state.priceDates[h.key]||'基準日未確認')}</small><br><button class="icon" data-fetch-price="${i}">取得</button><button class="icon" data-price-index="${i}">変更</button></td><td>${p===undefined?unit(nativeValue)+'（原価）':unit(nativeValue)}</td><td>${p===undefined?'未算出':yen(gainYen)+(isUS?`<small>${unit(nativeGain)} / 円取得原価${state.yenAvgCosts[h.key]!==undefined?'は証券会社の単価':missingAcquisitionFx(h)?'は概算':'に買付時為替を反映'}</small>`:'')}</td><td><button class="icon" data-delete-holding="${i}">削除</button></td></tr>`;
 }).join('');
 $('#holdingsTable').hidden=!hs.length;$('#holdingsEmpty').hidden=!!hs.length;
 let cash=0,cashFxGain=0,cashFxUnknown=0;
 $('#cashList').innerHTML=state.cash.map((c,i)=>{cash+=c.amount*(c.currency==='USD'?state.fx:1);if(c.currency==='USD'){if(c.fxRate)cashFxGain+=c.amount*(state.fx-c.fxRate);else cashFxUnknown++;}return `<div class="cash-item"><b>${esc(c.account)}</b><span>${c.currency}</span><strong>${fmt(c.amount)} ${c.currency}</strong>${c.currency==='USD'?`<small>現在評価 ${yen(c.amount*state.fx)} ／ 為替損益 ${c.fxRate?yen(c.amount*(state.fx-c.fxRate)):'未算出'}${c.fxRate?'（取得時 '+fmt(c.fxRate)+'円）':''}</small>`:''}<button class="icon" data-edit-cash="${i}">編集</button><button class="icon" data-delete-cash="${i}">削除</button></div>`;}).join('')||'<div class="empty">現金残高はありません。</div>';
 $('#totalAssets').textContent=yen(assets+cash);$('#cashBalance').textContent=yen(cash);
 $('#profitLoss').textContent=yen(pl+cashFxGain)+(unknown||cashFxUnknown||all.some(missingAcquisitionFx)?'（一部未算出・概算）':'');
 $('#cashFxSummary').textContent=`米ドル現金の為替損益 ${yen(cashFxGain)}${cashFxUnknown?'（取得時レート未入力 '+cashFxUnknown+'件は未算出）':''}`;
 $('#fxRate').value=state.fx;
 $('#updatedAt').textContent=state.updatedAt?'データ保存：'+new Date(state.updatedAt).toLocaleString('ja-JP'):'保存履歴なし';
 $('#fxStatus').textContent=state.fxUpdatedAt?'為替設定：'+new Date(state.fxUpdatedAt).toLocaleString('ja-JP'):'為替は初期値または旧データです。確認してください。';
 $('#txTable tbody').innerHTML=state.transactions.map((t,i)=>({t,i})).sort((a,b)=>b.t.date.localeCompare(a.t.date)).map(({t,i})=>`<tr><td>${esc(t.date)}</td><td>${esc(t.name)}<br><small>${esc(t.symbol)} / ${esc(t.account)}</small></td><td>${t.side==='BUY'?'買い':'売り'}</td><td>${fmt(t.quantity)}</td><td>${fmt(t.price)}${t.assetType==='FUND'?' / '+t.priceUnit+'口':''}</td><td>${fmt(t.fee)}</td><td><button class="icon" data-edit="${i}">編集</button><button class="icon" data-delete-tx="${i}">削除</button></td></tr>`).join('');
 $('#txEmpty').hidden=!!state.transactions.length;
 renderPlans();
 if(!blocked)$('#notice').textContent=state.transactions.some(t=>t.assetType==='FUND'&&t.priceUnit===1)?'旧投資信託データは1口当たりの単価として保持しています。取引を編集し、約定記録の価格単位と現在値を確認・再設定してください。':'';
}
function field(form,name){return form.elements.namedItem(name);}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function syncTxFx(){const f=$('#txForm');$('#txFxLabel').hidden=field(f,'market').value!=='US';}
function assetChanged(){const f=$('#txForm'),type=field(f,'assetType').value;field(f,'priceUnit').value=type==='FUND'?'10000':'1';field(f,'priceUnit').disabled=type!=='FUND';if(type!=='ETF')field(f,'market').value=type==='STOCK_US'?'US':'JP';syncTxFx();}
$('#addTxBtn').onclick=()=>{const f=$('#txForm');f.reset();field(f,'id').value='';syncAccountSelects();field(f,'account').value=state.lastAccount||'その他';field(f,'date').value=today();$('#txForm h2').textContent='取引を追加';$('#symbolLookupStatus').textContent='';assetChanged();$('#txDialog').showModal();};
field($('#txForm'),'assetType').onchange=assetChanged;
field($('#txForm'),'market').onchange=syncTxFx;
const symbolInput=field($('#txForm'),'symbol');if(symbolInput&&typeof symbolInput.addEventListener==='function')symbolInput.addEventListener('blur',async()=>{const f=$('#txForm'),symbol=field(f,'symbol').value.trim().toUpperCase(),status=$('#symbolLookupStatus');if(!symbol)return;const known=PortfolioPlanning.fund(symbol);if(known){field(f,'symbol').value=known[0];field(f,'name').value=known[1];field(f,'assetType').value='FUND';assetChanged();status.textContent='投資信託を選択しました。';return;}status.textContent='銘柄名を取得中…';try{const lookup=await quote(/^\d{4,5}$/.test(symbol)?`${symbol}.T`:symbol);let name=lookup.longName||lookup.shortName;if(lookup.currency==='JPY'){try{name=japaneseAliases[symbol]||await quoteJapaneseName(`${symbol}.T`)||name;}catch{}}if(name&&!field(f,'name').value)field(f,'name').value=name;if(lookup.currency==='USD'){field(f,'market').value='US';if(field(f,'assetType').value==='STOCK_JP')field(f,'assetType').value='STOCK_US';}else if(lookup.currency==='JPY'){field(f,'market').value='JP';if(field(f,'assetType').value==='STOCK_US')field(f,'assetType').value='STOCK_JP';}syncTxFx();status.textContent=name?'銘柄名を入力しました。':'価格情報は取得しました。';}catch(error){status.textContent='自動取得できません。銘柄名を入力してください。';}});
$('#txForm').onsubmit=e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));
 try{const t=P.transaction({...d,id:d.id||crypto.randomUUID(),quantity:Number(d.quantity),price:Number(d.price),fee:Number(d.fee),priceUnit:Number(d.priceUnit||1),amount:d.amount?Number(d.amount):undefined,fxRate:d.market==='US'&&d.fxRate?Number(d.fxRate):undefined});
 const transactions=[...state.transactions],i=transactions.findIndex(x=>x.id===t.id);if(i<0)transactions.push(t);else transactions[i]=t;state.lastAccount=t.account;
 if(commit({...state,transactions}))$('#txDialog').close();
 }catch(error){alert(error.message);}
};
function syncCashFx(){const f=$('#cashForm');$('#cashFxLabel').hidden=field(f,'currency').value!=='USD';}
field($('#cashForm'),'currency').onchange=syncCashFx;
$('#addCashBtn').onclick=()=>{$('#cashForm').reset();field($('#cashForm'),'editIndex').value='';syncAccountSelects();field($('#cashForm'),'account').value=state.lastAccount||'その他';syncCashFx();$('#cashForm h2').textContent='現金残高を追加';$('#cashDialog').showModal();};
$('#cashForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget)),item={account:d.account,currency:d.currency,amount:Number(d.amount),...(d.currency==='USD'&&d.fxRate?{fxRate:Number(d.fxRate)}:{})},cash=[...state.cash];if(d.editIndex==='')cash.push(item);else cash[Number(d.editIndex)]=item;if(commit({...state,lastAccount:d.account,cash}))$('#cashDialog').close();};
$('#manageAccountsBtn').onclick=()=>{renderAccountList();$('#accountsDialog').showModal();};
$('#accountForm').onsubmit=e=>{e.preventDefault();const name=field(e.currentTarget,'account').value.trim();if(!name)return;if(accountOptions().includes(name)){alert('同じ口座名は登録済みです。');return;}if(commit({...state,accounts:[...accountOptions(),name]})){e.currentTarget.reset();renderAccountList();}};
$('#priceForm').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,k=field(f,'key').value,v=Number(field(f,'price').value),autoPriceAt={...state.autoPriceAt};delete autoPriceAt[k];if(commit({...state,prices:{...state.prices,[k]:v},priceDates:{...state.priceDates,[k]:'手入力'},manualPrices:[...new Set([...state.manualPrices,k])],autoPriceAt}))$('#priceDialog').close();};
$('#yenCostForm').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,k=field(f,'key').value,v=Number(field(f,'yenAvgCost').value);if(commit({...state,yenAvgCosts:{...state.yenAvgCosts,[k]:v}}))$('#yenCostDialog').close();};
$('#clearYenCost').onclick=()=>{const k=field($('#yenCostForm'),'key').value,values={...state.yenAvgCosts};delete values[k];if(commit({...state,yenAvgCosts:values}))$('#yenCostDialog').close();};
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-broker')){$('#holdingAccount').value=b.dataset.broker;$('#holdingGroup').value='all';render();$('#holdingsTable').scrollIntoView({block:'nearest',behavior:'smooth'});return;}
 if(b.hasAttribute('data-close')){b.closest('dialog').close();return;}
 if(b.hasAttribute('data-edit')){const t=state.transactions[Number(b.dataset.edit)],f=$('#txForm');f.reset();for(const [k,v] of Object.entries(t)){const input=field(f,k);if(input)input.value=v;}field(f,'priceUnit').disabled=t.assetType!=='FUND';syncTxFx();$('#txForm h2').textContent='取引を編集';$('#txDialog').showModal();}
 if(b.hasAttribute('data-delete-tx')&&confirm('この取引を削除しますか？ 後続の売却が成立しなくなる場合は削除できません。'))commit({...state,transactions:state.transactions.filter((_,i)=>i!==Number(b.dataset.deleteTx))});
 if(b.hasAttribute('data-delete-cash')&&confirm('この現金残高を削除しますか？'))commit({...state,cash:state.cash.filter((_,i)=>i!==Number(b.dataset.deleteCash))});
 if(b.hasAttribute('data-edit-cash')){const c=state.cash[Number(b.dataset.editCash)],f=$('#cashForm');f.reset();syncAccountSelects();field(f,'editIndex').value=b.dataset.editCash;field(f,'account').value=c.account;field(f,'currency').value=c.currency;field(f,'amount').value=c.amount;field(f,'fxRate').value=c.fxRate??'';syncCashFx();$('#cashForm h2').textContent='現金残高を編集';$('#cashDialog').showModal();}
 if(b.hasAttribute('data-delete-account')){const i=Number(b.dataset.deleteAccount),name=accountOptions()[i];if(state.transactions.some(t=>t.account===name)||state.cash.some(c=>c.account===name)){alert('使用中の口座は削除できません。');return;}if(confirm(name+'を登録一覧から削除しますか？')){commit({...state,accounts:accountOptions().filter((_,j)=>j!==i)});renderAccountList();}}
 if(b.hasAttribute('data-delete-holding')&&confirm('この保有に属する全取引を削除しますか？')){const h=displayedHoldings[Number(b.dataset.deleteHolding)];commit({...state,transactions:state.transactions.filter(t=>P.key(t)!==h.key)});}
 if(b.hasAttribute('data-price-index')){const h=displayedHoldings[Number(b.dataset.priceIndex)],f=$('#priceForm');field(f,'key').value=h.key;field(f,'price').value=state.prices[h.key]??'';$('#priceLabel').textContent=`${h.name} / ${h.account} / ${h.market==='US'?'USD':'円'}${h.assetType==='FUND'?'（'+h.priceUnit+'口当たり）':''}`;$('#priceDialog').showModal();}
 if(b.hasAttribute('data-yen-cost')){const h=displayedHoldings[Number(b.dataset.yenCost)],f=$('#yenCostForm');field(f,'key').value=h.key;field(f,'yenAvgCost').value=state.yenAvgCosts[h.key]??'';$('#yenCostLabel').textContent=`${h.name} / ${h.account}（現在 ${fmt(h.qty)}株）`;$('#yenCostDialog').showModal();}
 if(b.hasAttribute('data-fetch-price')){const h=displayedHoldings[Number(b.dataset.fetchPrice)];b.disabled=true;$('#quoteStatus').textContent=`${h.name}の価格を取得中…`;try{await updateHoldingPrice(h,true);$('#quoteStatus').textContent=`${h.name}の価格を更新しました（${state.priceDates[h.key]}基準）。`;}catch(error){$('#quoteStatus').textContent=`${h.name}の価格を取得できません：${error.message}。時間をおいて再試行するか「変更」から基準価額を入力してください。`;}finally{b.disabled=false;}}
});
$('#saveFx').onclick=()=>commit({...state,fx:Number($('#fxRate').value),fxUpdatedAt:new Date().toISOString(),fxSource:'manual'});
function download(content,name){const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('#exportBtn').onclick=()=>download(blocked?originalRaw:JSON.stringify(state,null,2),'myportfolio-backup-'+today()+'.json');
$('#importBtn').onclick=()=>$('#importFile').click();
$('#importFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('ファイルは10MB以下にしてください');const candidate=P.normalize(JSON.parse(await file.text()));if(confirm('現在のデータを置き換えます。バックアップ保存済みですか？'))commit(candidate,{restore:true});}catch(error){alert('復元できません：'+error.message);}finally{e.target.value='';}};
$('#csvImportBtn').onclick=()=>$('#csvFile').click();
let csvPreview=[];
$('#csvFile').onchange=async e=>{try{
 const file=e.target.files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('ファイルは10MB以下にしてください');
 const bytes=await file.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('shift_jis',{fatal:true}).decode(bytes);}
 const imported=P.importCsv(text,()=>crypto.randomUUID(),{overrideAccount:$('#csvAccount').value,assetType:$('#csvKind').value,taxBucket:$('#csvTax').value});
 csvPreview=PortfolioPlanning.duplicates(state.transactions,imported);
 $('#csvSummary').textContent=`${imported.length}件 ／ 重複候補 ${csvPreview.filter(x=>x.duplicate).length}件 ／ 取込先 ${$('#csvAccount').value}`;
 $('#csvRows').innerHTML=csvPreview.map(({t,duplicate},i)=>`<tr><td><input type="checkbox" aria-label="${i+1}行目を取り込む" data-csv-row="${i}" ${duplicate?'':'checked'}>${duplicate?'重複候補':''}</td><td>${esc(t.date)}<br>${esc(t.name)}<br>${esc(t.symbol)}</td><td>${t.side==='BUY'?'買付':'売却'} / ${t.assetType==='FUND'?'投信':'株式'}<br>${esc(t.taxBucket||'一般・特定など')}</td><td>${fmt(t.quantity)}${t.assetType==='FUND'?'口':'株'}</td><td>${fmt(t.price)} / ${t.priceUnit}</td><td>${fmt(t.amount??t.quantity*t.price/t.priceUnit)} ${t.market==='US'?'USD':'円'}</td><td>${t.market==='US'?(t.fxRate?fmt(t.fxRate)+'円':'未入力'):'—'}</td><td>${fmt(t.fee)}</td></tr>`).join('');
 $('#csvDialog').showModal();
 }catch(error){alert('CSVを取り込めません：'+error.message);}finally{e.target.value='';}};
$('#confirmCsv').onclick=()=>{try{const rows=[...document.querySelectorAll('[data-csv-row]:checked')].map(el=>csvPreview[Number(el.dataset.csvRow)].t);if(!rows.length)throw Error('取込対象が選択されていません');P.holdings([...state.transactions,...rows]);if(commit({...state,transactions:[...state.transactions,...rows]})){$('#csvDialog').close();csvPreview=[];}}catch(e){alert(e.message);}};
async function quote(symbol){return PortfolioQuotes.quote(symbol);}
const holdingQuoteRequests=new Map();
async function updateHoldingPrice(h,force=false,suppliedMeta){
 if(!force&&state.prices[h.key]!==undefined)return;
 const symbol=h.assetType==='FUND'?(PortfolioPlanning.fund(h.symbol,h.name)?.[0]||h.symbol):h.market==='JP'?(h.symbol.toUpperCase().endsWith('.T')?h.symbol:h.symbol+'.T'):h.symbol;
 const requestKey=(h.assetType==='FUND'?'fund:':'stock:')+symbol;
 let meta=suppliedMeta;
 if(!meta){if(!holdingQuoteRequests.has(requestKey))holdingQuoteRequests.set(requestKey,h.assetType==='FUND'?PortfolioQuotes.fundQuote(symbol):quote(symbol));try{meta=await holdingQuoteRequests.get(requestKey);}finally{holdingQuoteRequests.delete(requestKey);}}
 if(meta.currency!==(h.market==='US'?'USD':'JPY'))throw Error('通貨不一致');
 if(!force&&state.prices[h.key]!==undefined)return;
 const asOf=meta.asOf||(meta.regularMarketTime?new Date(meta.regularMarketTime*1000).toLocaleDateString('ja-JP'):'基準日不明');
 if(!commit({...state,prices:{...state.prices,[h.key]:meta.regularMarketPrice},priceDates:{...state.priceDates,[h.key]:asOf},manualPrices:state.manualPrices.filter(k=>k!==h.key),autoPriceAt:{...state.autoPriceAt,[h.key]:new Date().toISOString()}}))throw Error('価格の保存に失敗しました');
 return meta;
}
async function quoteJapaneseName(symbol){const path=encodeURIComponent(symbol),endpoints=["https://query1.finance.yahoo.com/v1/finance/search?q="+path+"&lang=ja-JP&region=JP","https://r.jina.ai/http://query1.finance.yahoo.com/v1/finance/search?q="+path+"&lang=ja-JP&region=JP","https://r.jina.ai/http://finance.yahoo.co.jp/quote/"+path];for(const endpoint of endpoints){try{const response=await PortfolioQuotes.request(endpoint,endpoint.startsWith('https://r.jina.ai/')).then(raw=>({ok:true,text:async()=>raw}));if(!response.ok)continue;const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{const begin=raw.indexOf('{'),end=raw.lastIndexOf('}');if(begin>=0&&end>begin){try{data=JSON.parse(raw.slice(begin,end+1));}catch{}}}const quote=data?.quotes?.find(x=>x.symbol===symbol)||data?.quotes?.[0];const name=quote?.shortname||quote?.longname;if(name&&/[\u3040-\u30ff\u3400-\u9fff]/.test(name))return name;const heading=raw.match(/(?:^|\n)#\s*([^\n【：:]+)(?:【|：|:)/)?.[1]?.trim();if(heading&&/[\u3040-\u30ff\u3400-\u9fff]/.test(heading))return heading;}catch{}}return '';}
const japaneseAliases={'7203':'トヨタ自動車','6758':'ソニーグループ','9984':'ソフトバンクグループ','8306':'三菱UFJフィナンシャル・グループ','9432':'日本電信電話','9433':'KDDI','8058':'三菱商事','6861':'キーエンス','6501':'日立製作所','7267':'本田技研工業','7269':'スズキ','7974':'任天堂','2914':'日本たばこ産業','4502':'武田薬品工業','4063':'信越化学工業','8035':'東京エレクトロン','8411':'みずほフィナンシャルグループ','8316':'三井住友フィナンシャルグループ'};
$('#refreshPricesBtn').onclick=async()=>{
 const b=$('#refreshPricesBtn'),hs=[...displayedHoldings];if(!hs.length){alert('表示中の保有銘柄がありません。');return;}
 b.disabled=true;const quotes=new Map(),failures=[];let ok=0,failed=0;
 $('#quoteStatus').textContent=`表示中の${hs.length}銘柄を更新中。取得できた分から保存します。`;
 try{for(const h of hs){const symbol=h.assetType==='FUND'?(PortfolioPlanning.fund(h.symbol,h.name)?.[0]||h.symbol):h.market==='JP'?(h.symbol.toUpperCase().endsWith('.T')?h.symbol:h.symbol+'.T'):h.symbol,requestKey=(h.assetType==='FUND'?'fund:':'stock:')+symbol;
  try{const meta=await updateHoldingPrice(h,true,quotes.get(requestKey));quotes.set(requestKey,meta);ok++;}catch(error){failed++;failures.push(`${h.symbol}（${h.account}）：${error.message}`);}
  $('#quoteStatus').textContent=`${ok+failed}/${hs.length}件確認、${ok}件保存済み、${failed}件失敗。画面を閉じても保存済みの価格は残ります。`;
 }
 $('#quoteStatus').textContent=`${ok}件更新、${failed}件取得失敗。`+(failed?'失敗銘柄：'+failures.join(' ／ '):'価格と基準日を確認してください。');
 }finally{b.disabled=false;}
};
$('#copyQuoteSymbolsBtn').onclick=async()=>{const symbols=[...new Set(getHoldings().map(h=>h.assetType==='FUND'?(PortfolioPlanning.fund(h.symbol,h.name)?.[0]||h.symbol):h.market==='JP'?(h.symbol.toUpperCase().endsWith('.T')?h.symbol:h.symbol+'.T'):h.symbol))].sort(),text=symbols.join(', ');try{await navigator.clipboard.writeText(text);$('#quoteStatus').textContent=`銘柄コード${symbols.length}件をコピーしました。数量・口座名は含みません。`;}catch{prompt('この銘柄コード一覧だけをコピーしてください（数量・口座名は含みません）',text);}};
$('#refreshFx').onclick=async()=>{const b=$('#refreshFx');b.disabled=true;try{const m=await quote('USDJPY=X');if(m.currency!=='JPY')throw Error('通貨不一致');commit({...state,fx:m.regularMarketPrice,fxUpdatedAt:new Date().toISOString(),fxSource:'auto'});}catch{$('#fxStatus').textContent='為替取得に失敗しました。ブラウザからの取得制限や通信障害が考えられます。手入力で保存できます。';}finally{b.disabled=false;}};
let deferred;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('#installBtn').hidden=false;});
$('#installBtn').onclick=async()=>{if(deferred){await deferred.prompt();deferred=null;$('#installBtn').hidden=true;}};
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js?v=20260923-scheduled-quotes').then(reg=>{const show=()=>{if(reg.waiting){$('#updateBtn').hidden=false;$('#updateBtn').onclick=()=>{if(confirm('入力中の内容を保存してから更新してください。更新しますか？')){navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});reg.waiting?.postMessage('ACTIVATE');}};}};show();reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',show));reg.update().catch(()=>{});}).catch(()=>{$('#notice').textContent+=' オフライン機能を利用できません。';});}
addEventListener('storage',e=>{if(e.key===KEY)$('#notice').textContent='別のタブでデータが更新されました。再読み込みしてください。';});

for(const id of ['holdingGroup','holdingSort','holdingAccount'])$('#'+id).onchange=render;
const fundOptions=PortfolioPlanning.funds.map(([code,name])=>`<option value="${code}">${esc(name)}</option>`).join('');
$('#fundPreset').innerHTML='<option value="">候補を選ぶ（任意）</option>'+fundOptions;
$('#planFund').innerHTML=fundOptions;
$('#fundPreset').onchange=e=>{const found=PortfolioPlanning.fund(e.target.value);if(!found)return;const f=$('#txForm');field(f,'assetType').value='FUND';assetChanged();field(f,'symbol').value=found[0];field(f,'name').value=found[1];};
$('#planMonth').value=today().slice(0,7);$('#planMonth').onchange=renderPlans;
let holidayDates=[];
function renderPlans(){const month=$('#planMonth').value||today().slice(0,7);$('#planList').innerHTML=(state.plans||[]).map(p=>{const days=PortfolioPlanning.schedule(p,month,holidayDates),actual=state.transactions.filter(t=>t.side==='BUY'&&t.account===p.account&&t.taxBucket==='tsumitate'&&t.assetType==='FUND'&&(PortfolioPlanning.fund(t.symbol,t.name)?.[0]||t.symbol)===p.symbol&&t.date.startsWith(month)),sum=actual.reduce((n,t)=>n+(t.amount??t.quantity*t.price/t.priceUnit),0),hasHolidayData=holidayDates.some(d=>d.startsWith(month.slice(0,4)));return `<article class="cash-item"><b>${esc(p.name)} / ${esc(p.account)}</b><p>毎営業日 ${yen(p.amount)} ／ 今月の予定 ${days.length}回・${yen(days.length*p.amount)}</p><p>CSV・手入力の確定買付 ${actual.length}件・${yen(sum)} ／ ${fmt(actual.reduce((n,t)=>n+t.quantity,0))}口</p><p>${hasHolidayData?'土日・日本の祝日・年末年始を除外。ファンド休業日は別途指定。':'祝日情報がない年のため平日ベースの概算。'}</p><details><summary>予定日・注文状況</summary>${days.map(d=>`<div>${esc(d.date)} ${yen(d.amount)} ${d.ordered?'注文済み（約定はCSVで確認）':'予定'}</div>`).join('')}</details><button type="button" data-plan-edit="${esc(p.id)}">設定を編集</button></article>`;}).join('')||'<p>楽天証券・オルカン・毎営業日500円を初期入力しています。「積立設定を登録」で開始日を指定して保存してください。</p>';}
$('#addPlanBtn').onclick=()=>{const f=$('#planForm');f.reset();field(f,'id').value='';field(f,'symbol').value='0331418A';field(f,'orderedDates').value='2026-09-18';$('#planDialog').showModal();};
$('#addPlanShortcut').onclick=()=>$('#addPlanBtn').click();
document.addEventListener('click',e=>{const b=e.target.closest('[data-plan-edit]');if(!b)return;const p=state.plans.find(p=>p.id===b.dataset.planEdit),f=$('#planForm');for(const [k,v] of Object.entries(p)){const el=field(f,k);if(el)el.value=Array.isArray(v)?v.join(','):v;}$('#planDialog').showModal();});
$('#planForm').onsubmit=e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.currentTarget)),split=v=>v.split(/[,、\s]+/).filter(Boolean);for(const date of [...split(d.skipDates),...split(d.orderedDates),d.start,...(d.end?[d.end]:[])])if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('日付はYYYY-MM-DDで入力してください');if(d.end&&d.end<d.start)throw Error('終了日が開始日より前です');const p={...d,id:d.id||crypto.randomUUID(),name:PortfolioPlanning.fund(d.symbol)[1],amount:Number(d.amount),taxBucket:'tsumitate',orderedDates:split(d.orderedDates),skipDates:split(d.skipDates)};if(commit({...state,accounts:[...new Set([...state.accounts,p.account])],plans:[...state.plans.filter(x=>x.id!==p.id),p]}))$('#planDialog').close();}catch(e){alert(e.message);}};
fetch('holidays.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{holidayDates=d.dates;renderPlans();}).catch(()=>{});
async function loadQuoteSnapshot(){
 try{const response=await fetch('quotes-snapshot.json?v='+Date.now(),{cache:'no-store'});if(!response.ok)return;const data=await response.json();if(!data.quotes||typeof data.quotes!=='object')return;
  const prices={...state.prices},priceDates={...state.priceDates},autoPriceAt={...state.autoPriceAt};let count=0,fx=state.fx,fxUpdatedAt=state.fxUpdatedAt,fxSource=state.fxSource;
  for(const h of getHoldings()){const symbol=h.assetType==='FUND'?(PortfolioPlanning.fund(h.symbol,h.name)?.[0]||h.symbol):h.market==='JP'?(h.symbol.toUpperCase().endsWith('.T')?h.symbol:h.symbol+'.T'):h.symbol,q=data.quotes[symbol],time=Date.parse(q?.fetchedAt||'');if(!q||!Number.isFinite(q.price)||q.price<=0||q.currency!==(h.market==='US'?'USD':'JPY')||!/^\d{4}-\d{2}-\d{2}$/.test(q.asOf||'')||!Number.isFinite(time)||Date.now()-time>14*86400000||time>Date.now()+300000||state.manualPrices.includes(h.key)||prices[h.key]!==undefined&&!autoPriceAt[h.key]||autoPriceAt[h.key]&&time<=Date.parse(autoPriceAt[h.key]))continue;prices[h.key]=q.price;priceDates[h.key]=q.asOf;autoPriceAt[h.key]=q.fetchedAt;count++;}
  const currency=data.quotes['USDJPY=X'],currencyTime=Date.parse(currency?.fetchedAt||'');if(currency&&Number.isFinite(currency.price)&&currency.price>0&&currency.currency==='JPY'&&Number.isFinite(currencyTime)&&Date.now()-currencyTime<14*86400000&&fxSource!=='manual'&&(fxSource==='auto'||!fxUpdatedAt)&&(!fxUpdatedAt||currencyTime>Date.parse(fxUpdatedAt))){fx=currency.price;fxUpdatedAt=currency.fetchedAt;fxSource='auto';}
  if(count||fx!==state.fx){if(commit({...state,prices,priceDates,autoPriceAt,fx,fxUpdatedAt,fxSource}))$('#quoteStatus').textContent=`定期更新された価格を${count}銘柄に反映しました。基準日を確認してください。`;}
 }catch(error){$('#quoteStatus').textContent='定期更新価格を読み込めませんでした。保存済み価格は保持しています。';}
}
render();
(async()=>{await loadQuoteSnapshot();const missingFundPrices=getHoldings().filter(h=>h.assetType==='FUND'&&state.prices[h.key]===undefined&&PortfolioPlanning.fund(h.symbol,h.name));for(const h of missingFundPrices){try{$('#quoteStatus').textContent=`未設定の投信 ${h.name} の基準価額を取得中…`;await updateHoldingPrice(h);$('#quoteStatus').textContent=`${h.name} の基準価額を取得しました（${state.priceDates[h.key]}基準）。`;}catch(error){$('#quoteStatus').textContent=`${h.name} の自動取得に失敗：${error.message}。銘柄の「取得」から再試行できます。`;}}})();
