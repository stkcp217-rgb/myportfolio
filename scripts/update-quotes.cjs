'use strict';
const fs=require('node:fs/promises');
const quotes=require('../quotes.js');
const funds=new Set(['9I312179','03319172','0331418A','03311187','03312175','2931113C']);
const source='https://stkcp217-rgb.github.io/myportfolio/quotes-snapshot.json';
const symbols=JSON.parse(require('node:fs').readFileSync('quote-symbols.json','utf8'));
if(!Array.isArray(symbols)||symbols.some(s=>typeof s!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(s)))throw Error('quote-symbols.jsonが不正です');
async function previousQuotes(){try{const r=await fetch(source+'?t='+Date.now(),{signal:AbortSignal.timeout(8000)});if(!r.ok)return {};const data=await r.json();return data.quotes&&typeof data.quotes==='object'?data.quotes:{};}catch{return {};}}
function fundDate(value){const m=value.match(/^(\d{1,2})\/(\d{1,2})$/);if(!m)throw Error('基準日不明');const now=new Date(),year=now.getUTCFullYear(),date=new Date(Date.UTC(year,Number(m[1])-1,Number(m[2])));if(date.getTime()>now.getTime()+86400000)date.setUTCFullYear(year-1);return date.toISOString().slice(0,10);}
async function readQuote(symbol){const fund=funds.has(symbol),meta=fund?await quotes.fundQuote(symbol):await quotes.quote(symbol);if(meta.symbol?.toUpperCase()!==symbol||!Number.isFinite(meta.regularMarketPrice)||meta.regularMarketPrice<=0||!['JPY','USD'].includes(meta.currency))throw Error('価格を検証できません');const asOf=fund?fundDate(meta.asOf):meta.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString().slice(0,10):'';if(!asOf)throw Error('基準日を確認できません');return {price:meta.regularMarketPrice,currency:meta.currency,asOf,source:'Yahoo Finance',fetchedAt:new Date().toISOString()};}
async function main(){const previous=await previousQuotes(),result={},pending=[...new Set(symbols)];let index=0,success=0;
 async function worker(){while(index<pending.length){const symbol=pending[index++];try{result[symbol]=await readQuote(symbol);success++;console.log(symbol,result[symbol].price,result[symbol].asOf);}catch(error){const old=previous[symbol];if(old&&Number.isFinite(old.price)&&old.price>0&&['JPY','USD'].includes(old.currency)&&/^\d{4}-\d{2}-\d{2}$/.test(old.asOf)&&!Number.isNaN(Date.parse(old.fetchedAt)))result[symbol]=old;console.warn(symbol,error.message);}}}
 await Promise.all([worker(),worker(),worker()]);await fs.writeFile('quotes-snapshot.json',JSON.stringify({generatedAt:new Date().toISOString(),quotes:result})+'\n');console.log(`${success}/${pending.length}件更新、${Object.keys(result).length}件を配信`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
