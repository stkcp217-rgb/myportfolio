'use strict';
const P=Portfolio, KEY='myportfolio.v1', $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:4}).format(n);
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(n);
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
function render(){
 const hs=getHoldings();let assets=0,pl=0,unknown=0;
 $('#holdingsTable tbody').innerHTML=hs.map((h,i)=>{
  const p=state.prices[h.key],avg=h.cost/h.qty*h.priceUnit,rate=h.market==='US'?state.fx:1;
  // 現在値が未入力なら取得原価で仮評価し、損益は未算出として明示する。
  const value=p===undefined?h.cost*rate:h.qty*p/h.priceUnit*rate,g=value-h.cost*rate;
  assets+=value;if(p===undefined)unknown++;else pl+=g;
  return `<tr><td><b>${esc(h.name)}</b><br><small>${esc(h.symbol)}・${esc(h.account)}・${esc(({STOCK_JP:'日本株',STOCK_US:'米国株',FUND:'投資信託',ETF:'ETF'})[h.assetType])}${h.assetType==='FUND'?' / '+h.priceUnit+'口当たり':''}</small></td><td>${fmt(h.qty)}</td><td>${fmt(avg)}</td><td>${p===undefined?'未設定':fmt(p)}<br><button class="icon" data-price-index="${i}">変更</button></td><td>${yen(value)}${p===undefined?'（原価）':''}</td><td>${p===undefined?'未算出':yen(g)}</td><td><button class="icon" data-delete-holding="${i}">削除</button></td></tr>`;
 }).join('');
 $('#holdingsTable').hidden=!hs.length;$('#holdingsEmpty').hidden=!!hs.length;
 let cash=0;
 $('#cashList').innerHTML=state.cash.map((c,i)=>{cash+=c.amount*(c.currency==='USD'?state.fx:1);return `<div class="cash-item"><b>${esc(c.account)}</b><span>${c.currency}</span><strong>${fmt(c.amount)} ${c.currency}</strong><button class="icon" data-delete-cash="${i}">削除</button></div>`;}).join('')||'<div class="empty">現金残高はありません。</div>';
 $('#totalAssets').textContent=yen(assets+cash);$('#cashBalance').textContent=yen(cash);
 $('#profitLoss').textContent=yen(pl)+(unknown?'（価格未設定あり）':'');
 $('#fxRate').value=state.fx;
 $('#updatedAt').textContent=state.updatedAt?'データ保存：'+new Date(state.updatedAt).toLocaleString('ja-JP'):'保存履歴なし';
 $('#fxStatus').textContent=state.fxUpdatedAt?'為替設定：'+new Date(state.fxUpdatedAt).toLocaleString('ja-JP'):'為替は初期値または旧データです。確認してください。';
 $('#txTable tbody').innerHTML=state.transactions.map((t,i)=>({t,i})).sort((a,b)=>b.t.date.localeCompare(a.t.date)).map(({t,i})=>`<tr><td>${esc(t.date)}</td><td>${esc(t.name)}<br><small>${esc(t.symbol)} / ${esc(t.account)}</small></td><td>${t.side==='BUY'?'買い':'売り'}</td><td>${fmt(t.quantity)}</td><td>${fmt(t.price)}${t.assetType==='FUND'?' / '+t.priceUnit+'口':''}</td><td>${fmt(t.fee)}</td><td><button class="icon" data-edit="${i}">編集</button><button class="icon" data-delete-tx="${i}">削除</button></td></tr>`).join('');
 $('#txEmpty').hidden=!!state.transactions.length;
 if(!blocked)$('#notice').textContent=state.transactions.some(t=>t.assetType==='FUND'&&t.priceUnit===1)?'旧投資信託データは1口当たりの単価として保持しています。取引を編集し、約定記録の価格単位と現在値を確認・再設定してください。':'';
}
function field(form,name){return form.elements.namedItem(name);}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function assetChanged(){const f=$('#txForm'),type=field(f,'assetType').value;field(f,'priceUnit').value=type==='FUND'?'10000':'1';field(f,'priceUnit').disabled=type!=='FUND';if(type!=='ETF')field(f,'market').value=type==='STOCK_US'?'US':'JP';}
$('#addTxBtn').onclick=()=>{const f=$('#txForm');f.reset();field(f,'id').value='';field(f,'account').value=state.lastAccount||'その他';field(f,'date').value=today();$('#txForm h2').textContent='取引を追加';$('#symbolLookupStatus').textContent='';assetChanged();$('#txDialog').showModal();};
field($('#txForm'),'assetType').onchange=assetChanged;
const symbolInput=field($('#txForm'),'symbol');if(symbolInput&&typeof symbolInput.addEventListener==='function')symbolInput.addEventListener('blur',async()=>{const f=$('#txForm'),symbol=field(f,'symbol').value.trim().toUpperCase(),status=$('#symbolLookupStatus');if(!symbol)return;status.textContent='銘柄名を取得中…';try{const lookup=await quote(/^\d{4,5}$/.test(symbol)?`${symbol}.T`:symbol),name=lookup.longName||lookup.shortName;if(name&&!field(f,'name').value)field(f,'name').value=name;if(lookup.currency==='USD'){field(f,'market').value='US';if(field(f,'assetType').value==='STOCK_JP')field(f,'assetType').value='STOCK_US';}else if(lookup.currency==='JPY'){field(f,'market').value='JP';if(field(f,'assetType').value==='STOCK_US')field(f,'assetType').value='STOCK_JP';}status.textContent=name?'銘柄名を入力しました。':'価格情報は取得しました。';}catch(error){status.textContent='自動取得できません。銘柄名を入力してください。';}});
$('#txForm').onsubmit=e=>{
 e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));
 try{const t=P.transaction({...d,id:d.id||crypto.randomUUID(),quantity:Number(d.quantity),price:Number(d.price),fee:Number(d.fee),priceUnit:Number(d.priceUnit||1)});
 const transactions=[...state.transactions],i=transactions.findIndex(x=>x.id===t.id);if(i<0)transactions.push(t);else transactions[i]=t;state.lastAccount=t.account;
 if(commit({...state,transactions}))$('#txDialog').close();
 }catch(error){alert(error.message);}
};
$('#addCashBtn').onclick=()=>{$('#cashForm').reset();$('#cashDialog').showModal();};
$('#cashForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));if(commit({...state,cash:[...state.cash,{account:d.account.trim(),currency:d.currency,amount:Number(d.amount)}]}))$('#cashDialog').close();};
$('#priceForm').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,k=field(f,'key').value,v=Number(field(f,'price').value);if(commit({...state,prices:{...state.prices,[k]:v}}))$('#priceDialog').close();};
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-close')){b.closest('dialog').close();return;}
 if(b.hasAttribute('data-edit')){const t=state.transactions[Number(b.dataset.edit)],f=$('#txForm');for(const [k,v] of Object.entries(t)){const input=field(f,k);if(input)input.value=v;}field(f,'priceUnit').disabled=t.assetType!=='FUND';$('#txForm h2').textContent='取引を編集';$('#txDialog').showModal();}
 if(b.hasAttribute('data-delete-tx')&&confirm('この取引を削除しますか？ 後続の売却が成立しなくなる場合は削除できません。'))commit({...state,transactions:state.transactions.filter((_,i)=>i!==Number(b.dataset.deleteTx))});
 if(b.hasAttribute('data-delete-cash')&&confirm('この現金残高を削除しますか？'))commit({...state,cash:state.cash.filter((_,i)=>i!==Number(b.dataset.deleteCash))});
 if(b.hasAttribute('data-delete-holding')&&confirm('この保有に属する全取引を削除しますか？')){const h=getHoldings()[Number(b.dataset.deleteHolding)];commit({...state,transactions:state.transactions.filter(t=>P.key(t)!==h.key)});}
 if(b.hasAttribute('data-price-index')){const h=getHoldings()[Number(b.dataset.priceIndex)],f=$('#priceForm');field(f,'key').value=h.key;field(f,'price').value=state.prices[h.key]??'';$('#priceLabel').textContent=`${h.name} / ${h.account} / ${h.market==='US'?'USD':'円'}${h.assetType==='FUND'?'（'+h.priceUnit+'口当たり）':''}`;$('#priceDialog').showModal();}
});
$('#saveFx').onclick=()=>commit({...state,fx:Number($('#fxRate').value),fxUpdatedAt:new Date().toISOString()});
function download(content,name){const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('#exportBtn').onclick=()=>download(blocked?originalRaw:JSON.stringify(state,null,2),'myportfolio-backup-'+today()+'.json');
$('#importBtn').onclick=()=>$('#importFile').click();
$('#importFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('ファイルは10MB以下にしてください');const candidate=P.normalize(JSON.parse(await file.text()));if(confirm('現在のデータを置き換えます。バックアップ保存済みですか？'))commit(candidate,{restore:true});}catch(error){alert('復元できません：'+error.message);}finally{e.target.value='';}};
$('#csvImportBtn').onclick=()=>$('#csvFile').click();
$('#csvFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('ファイルは10MB以下にしてください');const imported=P.importCsv(await file.text(),()=>crypto.randomUUID()),seen=new Set(state.transactions.map(P.fingerprint));
 if(imported.some(t=>seen.has(P.fingerprint(t))))throw Error('既存と同一内容の取引があります。重複を確認し、CSVから除いてください');
 P.holdings([...state.transactions,...imported]);if(confirm(imported.length+'件を追加しますか？'))commit({...state,transactions:[...state.transactions,...imported]});
 }catch(error){alert('CSVを取り込めません：'+error.message);}finally{e.target.value='';}};
async function quote(symbol){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000),path=encodeURIComponent(symbol);
 const endpoints=[
  "https://query1.finance.yahoo.com/v8/finance/chart/"+path+"?range=1d&interval=1d",
  "https://r.jina.ai/http://query1.finance.yahoo.com/v8/finance/chart/"+path+"?range=1d%26interval=1d"
 ];let last;
 try{for(const endpoint of endpoints){try{const response=await fetch(endpoint,{signal:controller.signal,cache:"no-store"});if(!response.ok)throw Error("HTTP "+response.status);const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{const begin=raw.indexOf("{"),end=raw.lastIndexOf("}");if(begin<0||end<=begin)throw Error("JSON形式ではありません");data=JSON.parse(raw.slice(begin,end+1));}const meta=data.chart?.result?.[0]?.meta;if(!meta||!Number.isFinite(meta.regularMarketPrice)||meta.regularMarketPrice<=0||!Number.isFinite(meta.regularMarketTime))throw Error("価格データ不正");return meta;}catch(error){last=error;}}throw last||Error("価格取得失敗");}finally{clearTimeout(timer);}}
$('#refreshPricesBtn').onclick=async()=>{
 const b=$('#refreshPricesBtn'),hs=getHoldings().filter(h=>h.assetType!=='FUND');if(!hs.length){alert('更新対象の株式・ETFがありません。投資信託は基準価額を手入力してください。');return;}
 b.disabled=true;const prices={},requests=new Map();let ok=0,failed=0;
 try{for(const h of hs){const symbol=h.market==='JP'?h.symbol+'.T':h.symbol;
  try{if(!requests.has(symbol))requests.set(symbol,quote(symbol));const meta=await requests.get(symbol);if(meta.currency!==(h.market==='US'?'USD':'JPY'))throw Error('通貨不一致');prices[h.key]=meta.regularMarketPrice;ok++;}catch{failed++;}
 }
 if(ok&&!commit({...state,prices:{...state.prices,...prices}}))return;
 $('#quoteStatus').textContent=`${ok}件更新、${failed}件取得失敗。`+(failed?'ブラウザからの取得制限や通信障害の可能性があります。既存価格は保持しました。':'Yahoo Financeの価格（遅延の場合があります）。');
 }finally{b.disabled=false;}
};
$('#refreshFx').onclick=async()=>{const b=$('#refreshFx');b.disabled=true;try{const m=await quote('USDJPY=X');if(m.currency!=='JPY')throw Error('通貨不一致');commit({...state,fx:m.regularMarketPrice,fxUpdatedAt:new Date(m.regularMarketTime*1000).toISOString()});}catch{$('#fxStatus').textContent='為替取得に失敗しました。ブラウザからの取得制限や通信障害が考えられます。手入力で保存できます。';}finally{b.disabled=false;}};
let deferred;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('#installBtn').hidden=false;});
$('#installBtn').onclick=async()=>{if(deferred){await deferred.prompt();deferred=null;$('#installBtn').hidden=true;}};
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').then(reg=>{const show=()=>{if(reg.waiting){$('#updateBtn').hidden=false;$('#updateBtn').onclick=()=>{if(confirm('入力中の内容を保存してから更新してください。更新しますか？')){reg.waiting.postMessage('ACTIVATE');navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});}};}};show();reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',show));reg.update().catch(()=>{});}).catch(()=>{$('#notice').textContent+=' オフライン機能を利用できません。';});}
addEventListener('storage',e=>{if(e.key===KEY)$('#notice').textContent='別のタブでデータが更新されました。再読み込みしてください。';});
render();
