(function(root){
'use strict';
const funds=[
 ['9I312179','楽天・全米株式インデックス・ファンド',['楽天VTI','楽天VIT','楽天・VTI']],
 ['03319172','eMAXIS Slim 先進国株式インデックス（除く日本）',['eMAXIS Slim先進国株式インデックス','eMAXIS Slim先進国株式インデックス日本を除く']],
 ['0331418A','eMAXIS Slim 全世界株式（オール・カントリー）',['オルカン','eMAXIS Slim オールカントリー']],
 ['03311187','eMAXIS Slim 米国株式（S&P500）',[]],
 ['03312175','eMAXIS Slim バランス（8資産均等型）',[]],
 ['2931113C','ニッセイ外国株式インデックスファンド＜購入・換金手数料なし＞',[]]
];
const compact=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s・･（）()＜＞<>]/g,'');
function fund(symbol,name=''){const code=String(symbol||'').trim().toUpperCase().replace(/\.T$/,'');return funds.find(([c,n,a])=>c===code||[n,...a].some(v=>compact(v)===compact(name)||compact(v)===compact(symbol)));}
function duplicates(existing,incoming){const portfolio=root.Portfolio||(typeof module!=='undefined'?require('./core.js'):null),counts=new Map();for(const t of existing){const k=portfolio.fingerprint(t);counts.set(k,(counts.get(k)||0)+1);}return incoming.map(t=>{const k=portfolio.fingerprint(t),n=counts.get(k)||0;if(n)counts.set(k,n-1);return {t,duplicate:n>0};});}
function schedule(plan,month,holidays=[]){const [y,m]=month.split('-').map(Number),result=[],excluded=new Set([...holidays,...(plan.skipDates||[])]);for(let d=1;d<=31;d++){const date=new Date(Date.UTC(y,m-1,d));if(date.getUTCMonth()!==m-1)break;const key=date.toISOString().slice(0,10),weekday=date.getUTCDay();if(key<plan.start||plan.end&&key>plan.end||weekday===0||weekday===6||excluded.has(key)||key.slice(5)==='01-01'||key.slice(5)==='01-02'||key.slice(5)==='01-03'||key.slice(5)==='12-31')continue;result.push({date:key,amount:plan.amount,ordered:(plan.orderedDates||[]).includes(key)});}return result;}
const api={funds,fund,duplicates,schedule};root.PortfolioPlanning=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
