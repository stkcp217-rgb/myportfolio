(function(root){
'use strict';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let queue=Promise.resolve(),nextRelay=0;
async function request(url,relay){
 const run=async()=>{
  if(relay)await sleep(Math.max(0,nextRelay-Date.now()));
  for(let attempt=0;attempt<3;attempt++){
   if(relay)nextRelay=Date.now()+3500;
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),relay?25000:5000);
   let response,raw;
   try{response=await fetch(url,{signal:controller.signal,cache:'no-store'});raw=await response.text();}
   catch(error){throw Error(error.name==='AbortError'?'応答待ち時間超過':'通信失敗（CORS制限または接続障害）');}
   finally{clearTimeout(timer);}
   if(response.status===429&&relay&&attempt<2){
    const retry=response.headers.get('Retry-After'),seconds=Number(retry);
    const delay=retry?(Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-Date.now()):65000;
    await sleep(Math.max(65000,Number.isFinite(delay)?delay:65000));continue;
   }
   if(!response.ok)throw Error(response.status===429?'取得回数制限。少し待って再実行してください':'HTTP '+response.status);
   return raw;
  }
 };
 if(!relay)return run();
 const pending=queue.then(run);queue=pending.catch(()=>{});return pending;
}
function parse(raw,symbol){
 let data;try{data=JSON.parse(raw);}catch{const start=raw.indexOf('{'),end=raw.lastIndexOf('}');if(start<0||end<=start)throw Error('価格データではない応答');try{data=JSON.parse(raw.slice(start,end+1));}catch{throw Error('価格データの解析失敗');}}
 if(data.chart?.error)throw Error(data.chart.error.description||'銘柄データなし');
 const result=data.chart?.result?.[0],meta=result?.meta;
 if(!meta)throw Error('銘柄データなし');
 if(meta.symbol?.toUpperCase()!==symbol.toUpperCase())throw Error('応答の銘柄コード不一致');
 if(!['JPY','USD'].includes(meta.currency))throw Error('通貨を確認できません');
 let price=meta.regularMarketPrice,time=meta.regularMarketTime;
 if(!Number.isFinite(price)||price<=0){const closes=result.indicators?.quote?.[0]?.close||[];for(let i=closes.length-1;i>=0;i--){if(Number.isFinite(closes[i])&&closes[i]>0){price=closes[i];time=result.timestamp?.[i];break;}}}
 if(!Number.isFinite(price)||price<=0)throw Error('有効な価格なし');
 return {...meta,regularMarketPrice:price,regularMarketTime:Number.isFinite(time)?time:null};
}
async function quote(symbol){
 const path=encodeURIComponent(symbol),target='query1.finance.yahoo.com/v8/finance/chart/'+path+'?range=5d&interval=1d';
 const errors=[];
 for(const [url,relay] of [['https://'+target,false],['https://r.jina.ai/http://'+target,true]]){
  try{return parse(await request(url,relay),symbol);}catch(error){errors.push((relay?'中継':'直接')+': '+error.message);}
 }
 throw Error(errors.join(' / '));
}
root.PortfolioQuotes={quote,parse,request};
if(typeof module!=='undefined')module.exports=root.PortfolioQuotes;
})(globalThis);
