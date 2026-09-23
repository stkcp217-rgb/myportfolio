const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),P=require('../core.js'),Planning=require('../planning.js');
function boot(raw=''){
 const nodes=new Map(),data=new Map(raw?[['myportfolio.v1',raw]]:[]),alerts=[];let reject=false;
 const document={querySelector(s){if(!nodes.has(s))nodes.set(s,{value:'',textContent:'',innerHTML:'',hidden:false,elements:{namedItem(){return {};}}});return nodes.get(s);},addEventListener(){}};
 const c=vm.createContext({Portfolio:P,PortfolioPlanning:Planning,document,localStorage:{getItem:k=>data.get(k)??null,setItem(k,v){if(reject)throw Error('QuotaExceededError');data.set(k,v);}},alert:x=>alerts.push(x),navigator:{},addEventListener(){},fetch:async()=>({ok:true,json:async()=>({dates:[]})}),Intl,Date,console,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync('app.js','utf8'),c);
 return {c,data,alerts,nodes,reject:()=>{reject=true;},run:s=>vm.runInContext(s,c)};
}
test('破損データを空の保存で消さない',()=>{const x=boot('{broken');assert.equal(x.run('blocked'),true);assert.equal(x.run('commit(state)'),false);assert.equal(x.data.get('myportfolio.v1'),'{broken');});
test('容量超過でメモリも永続データも変えない',()=>{const x=boot();x.reject();assert.equal(x.run('commit({...state,fx:140})'),false);assert.equal(x.run('state.fx'),150);assert.equal(x.data.has('myportfolio.v1'),false);});
test('不正復元は元データを保持',()=>{const raw=JSON.stringify({transactions:[],cash:[],prices:{},fx:150}),x=boot(raw);assert.equal(x.run('commit({...state,transactions:[null]},{restore:true})'),false);assert.equal(x.data.get('myportfolio.v1'),raw);});
test('別タブ更新を上書きしない',()=>{const x=boot();x.data.set('myportfolio.v1','external');assert.equal(x.run('commit({...state,fx:140})'),false);assert.equal(x.data.get('myportfolio.v1'),'external');});
test('為替保存と直前バックアップ',()=>{const raw=JSON.stringify({transactions:[],cash:[],prices:{},fx:150}),x=boot(raw);assert.equal(x.run('commit({...state,fx:145.5})'),true);assert.equal(JSON.parse(x.data.get('myportfolio.v1')).fx,145.5);assert.equal(x.data.get('myportfolio.v1.previous'),raw);});
