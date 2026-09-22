(function(root){
'use strict';
const fail = message => { throw new Error(message); };
const text = (v,label) => typeof v === 'string' && v.trim() && v.length <= 200 ? v.trim() : fail(label+'が不正です');
const number = (v,label,positive=false) => typeof v==='number' && Number.isFinite(v) && (positive?v>0:v>=0) && v<=1e15 ? v : fail(label+'が不正です');
function transaction(t){
 if(!t || typeof t!=='object') fail('取引形式が不正です');
 const date=text(t.date,'日付');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date) fail('日付が不正です');
 if(!['JP','US'].includes(t.market)||!['BUY','SELL'].includes(t.side)) fail('市場または売買区分が不正です');
 const assetType=t.assetType || (t.market==='US'?'STOCK_US':'STOCK_JP');
 if(!['STOCK_US','STOCK_JP','FUND','ETF'].includes(assetType)) fail('資産種類が不正です');
 if((assetType==='STOCK_US'&&t.market!=='US')||(['STOCK_JP','FUND'].includes(assetType)&&t.market!=='JP')) fail('資産種類と市場が一致しません');
 const priceUnit=t.priceUnit??1; // 古い投信データは旧計算単位を維持し、画面で確認を促す。
 if(![1,10000].includes(priceUnit)||(assetType!=='FUND'&&priceUnit!==1)) fail('価格単位が不正です');
 return {id:text(t.id,'取引ID'),date,account:text(t.account??'その他','口座名'),assetType,market:t.market,side:t.side,symbol:text(t.symbol,'銘柄コード').toUpperCase(),name:text(t.name,'銘柄名'),quantity:number(t.quantity,'数量',true),price:number(t.price,'単価'),fee:number(t.fee??0,'手数料'),priceUnit};
}
const key=t=>JSON.stringify([t.account,t.assetType,t.market,t.symbol]);
function holdings(transactions){
 const m=new Map();
 for(const t of [...transactions].sort((a,b)=>a.date.localeCompare(b.date))){
  const k=key(t),h=m.get(k)||{...t,key:k,priceUnit:t.assetType==='FUND'?10000:1,qty:0,cost:0,realized:0};
  if(t.side==='BUY'){h.qty+=t.quantity;h.cost+=t.quantity*t.price/t.priceUnit+t.fee;}
  else {if(t.quantity-h.qty>Math.max(1e-8,h.qty*1e-12)) fail(t.date+' '+t.account+' '+t.symbol+'：売却数量が保有数量を超えます');
   const basis=h.cost/h.qty*t.quantity;h.realized+=t.quantity*t.price/t.priceUnit-t.fee-basis;h.cost-=basis;h.qty-=t.quantity;
  }
  if(Math.abs(h.qty)<1e-8){h.qty=0;h.cost=0;}
  if(!Number.isFinite(h.cost)||Math.abs(h.cost)>Number.MAX_SAFE_INTEGER) fail('計算可能な金額を超えています');
  m.set(k,h);
 }
 return [...m.values()].filter(h=>h.qty>0);
}
function normalize(x){
 if(!x||typeof x!=='object'||!Array.isArray(x.transactions)||!Array.isArray(x.cash)||!x.prices||typeof x.prices!=='object'||Array.isArray(x.prices)) fail('保存データの形式が不正です');
 if(x.version!==undefined && ![1,2].includes(x.version)) fail('未対応の保存形式です');
 const transactions=x.transactions.map(transaction),ids=new Set();
 for(const t of transactions){if(ids.has(t.id))fail('取引IDが重複しています');ids.add(t.id);}
 holdings(transactions);
 const cash=x.cash.map(c=>{if(!c||!['JPY','USD'].includes(c.currency))fail('現金の通貨が不正です');return{account:text(c.account??'その他','口座名'),currency:c.currency,amount:number(c.amount,'残高')};});
 const prices=Object.create(null);
 for(const [k,v] of Object.entries(x.prices))prices[k]=number(v,'現在値');
 for(const t of transactions){
  const k=key(t),old=t.account+':'+t.assetType+':'+t.market+':'+t.symbol,older=t.market+':'+t.symbol;
  if(prices[k]===undefined){if(prices[old]!==undefined)prices[k]=prices[old]*(t.assetType==='FUND'?10000/t.priceUnit:1);else if(prices[older]!==undefined)prices[k]=prices[older]*(t.assetType==='FUND'?10000/t.priceUnit:1);}
 }
 return {version:2,transactions,cash,prices,fx:number(x.fx??150,'為替',true),fxUpdatedAt:typeof x.fxUpdatedAt==='string'?x.fxUpdatedAt:'',lastAccount:typeof x.lastAccount==='string'?x.lastAccount:'その他',updatedAt:typeof x.updatedAt==='string'?x.updatedAt:''};
}
function parseCsv(input){
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 const s=input.replace(/^\uFEFF/,'');
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)fail('CSVの引用符が不正です');quoted=true;}
  else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&s[i+1]==='\n')i++;if(row.some(v=>v!==''))rows.push(row);row=[];}}
  else {if(closed)fail('CSVの引用符の後に文字があります');cell+=c;}
 }
 if(quoted)fail('CSVの引用符が閉じていません');
 row.push(cell);if(row.some(v=>v!==''))rows.push(row);return rows;
}
function importCsv(input,idFactory){
 const rows=parseCsv(input),headers=rows.shift()?.map(s=>s.trim());
 const required=['date','market','side','symbol','name','quantity','price','fee'];
 const allowed=[...required,'account','assetType','priceUnit'];
 if(!headers||required.some(h=>!headers.includes(h))||new Set(headers).size!==headers.length||headers.some(h=>!allowed.includes(h)))fail('共通CSV形式のみ対応しています。証券会社CSVはまだ直接取り込めません');
 if(!rows.length)fail('CSVに取引がありません');
 return rows.map((r,i)=>{try{if(r.length!==headers.length)fail('列数が一致しません');const t=Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));for(const f of ['quantity','price','fee']){if(!t[f])fail(f+'が空欄です');t[f]=Number(t[f]);}if(t.assetType==='FUND'&&!t.priceUnit)fail('投資信託にはpriceUnit（通常10000）が必要です');t.priceUnit=t.priceUnit?Number(t.priceUnit):1;t.account=t.account||'その他';return transaction({...t,id:idFactory()});}catch(e){fail('CSV '+(i+2)+'行目：'+e.message);}});
}
const fingerprint=t=>JSON.stringify([t.date,t.account,t.assetType,t.market,t.side,t.symbol,t.quantity,t.price,t.fee,t.priceUnit]);
const api={transaction,key,holdings,normalize,parseCsv,importCsv,fingerprint};
if(typeof module!=='undefined')module.exports=api;else root.Portfolio=api;
})(globalThis);
