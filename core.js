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
 const accounts=[...new Set((Array.isArray(x.accounts)?x.accounts:[]).filter(a=>typeof a==='string'&&a.trim()).map(a=>a.trim()))];
 for(const item of [...transactions,...cash])if(!accounts.includes(item.account))accounts.push(item.account);
 if(!accounts.includes('その他'))accounts.unshift('その他');
 return {version:2,transactions,cash,prices,fx:number(x.fx??150,'為替',true),fxUpdatedAt:typeof x.fxUpdatedAt==='string'?x.fxUpdatedAt:'',lastAccount:typeof x.lastAccount==='string'?x.lastAccount:'その他',accounts,updatedAt:typeof x.updatedAt==='string'?x.updatedAt:''};
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
function importCsv(input,idFactory,options={}){
 const rows=parseCsv(input),rawHeaders=rows.shift()?.map(s=>s.trim());
 if(!rawHeaders||new Set(rawHeaders).size!==rawHeaders.length)fail('CSVの見出しが不正です');
 const clean=h=>h.toLowerCase().replace(/[\s　_\-（）()]/g,'');
 const aliases={date:['date','日付','約定日','取引日','受渡日'],market:['market','市場','取引市場'],side:['side','売買','売買区分','取引区分','取引'],symbol:['symbol','銘柄コード','コード','ティッカー','銘柄'],name:['name','銘柄名','商品名','銘柄名称'],quantity:['quantity','数量','約定数量','取引数量','口数'],price:['price','単価','約定単価','約定価格','価格'],fee:['fee','手数料','委託手数料','取引手数料','手数料等'],account:['account','口座','口座名'],assetType:['assettype','資産種類','商品種別'],priceUnit:['priceunit','価格単位','単価単位']};
 const index={};for(const [key,names] of Object.entries(aliases)){const found=rawHeaders.findIndex(h=>names.includes(clean(h)));if(found>=0)index[key]=found;}
 const common=rawHeaders.includes('date')&&rawHeaders.includes('market')&&rawHeaders.includes('side')&&rawHeaders.includes('symbol')&&rawHeaders.includes('name')&&rawHeaders.includes('quantity')&&rawHeaders.includes('price')&&rawHeaders.includes('fee');
 if(!common&&['date','side','symbol','quantity','price'].some(k=>index[k]===undefined))fail('対応していないCSV形式です。日付・売買・銘柄コード・数量・単価の列を確認してください');
 if(!rows.length)fail('CSVに取引がありません');
 const value=(r,k)=>index[k]===undefined?'':(r[index[k]]??'').trim();
 const dateValue=v=>{const s=v.trim().replace(/[年月]/g,'-').replace(/日/g,'').replace(/[./]/g,'-').split(/[ T]/)[0],m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:s;};
 const num=v=>Number(String(v).replace(/[",￥¥円]/g,'').replace(/,/g,'').replace(/[()]/g,''));
 const sideValue=v=>{const s=v.toLowerCase();if(/買|buy/.test(s))return'BUY';if(/売|sell/.test(s))return'SELL';return v;};
 return rows.map((r,i)=>{try{if(r.length!==rawHeaders.length)fail('列数が一致しません');const symbol=value(r,'symbol').replace(/\s/g,'').toUpperCase(),marketRaw=value(r,'market'),market=common?marketRaw:(/米国|us|nyse|nasdaq/i.test(marketRaw)?'US':/日本|jp|東証|東京/i.test(marketRaw)?'JP':/^\d{4,5}$/.test(symbol)?'JP':'US'),assetType=value(r,'assetType')|| (market==='US'?'STOCK_US':'STOCK_JP');if(common&&assetType==='FUND'&&index.priceUnit===undefined)fail('投資信託にはpriceUnit（通常10000）が必要です');const t={date:dateValue(value(r,'date')),market,side:common?value(r,'side'):sideValue(value(r,'side')),symbol,name:value(r,'name')||symbol,quantity:num(value(r,'quantity')),price:num(value(r,'price')),fee:index.fee===undefined?0:num(value(r,'fee')),account:value(r,'account')||options.defaultAccount||'その他',assetType,priceUnit:index.priceUnit===undefined?(assetType==='FUND'?10000:1):num(value(r,'priceUnit'))};return transaction({...t,id:idFactory()});}catch(e){fail('CSV '+(i+2)+'行目：'+e.message);}});
}
const fingerprint=t=>JSON.stringify([t.date,t.account,t.assetType,t.market,t.side,t.symbol,t.quantity,t.price,t.fee,t.priceUnit]);
const api={transaction,key,holdings,normalize,parseCsv,importCsv,fingerprint};
if(typeof module!=='undefined')module.exports=api;else root.Portfolio=api;
})(globalThis);
