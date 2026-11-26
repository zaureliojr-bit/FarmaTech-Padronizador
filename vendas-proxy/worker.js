const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const date=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const int=n=>Number.isSafeInteger(n)&&n>=0;
const fail=(m,status=400)=>{throw Object.assign(new Error(m),{status})};
const key=(v,max=80)=>{if(v==null)return "N:";if(typeof v!=="string"&&typeof v!=="number")fail("Campo inválido");const s=String(v);if(s.length>max)fail("Campo longo");return "V:"+s};
async function authorized(req,secret){
 if(typeof secret!=="string"||secret.length<32)return false;
 const token=req.headers.get("Authorization")||"";
 const enc=new TextEncoder();
 const a=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(token)));
 const b=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode("Bearer "+secret)));
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
function windowOf(a,b){
 if(!date(a)||!date(b)||a>b||(Date.parse(b)-Date.parse(a))/86400000>365)fail("Período inválido (máximo 366 dias)");
}
function amount(v){if(typeof v!=="number"||!Number.isFinite(v)||!Number.isSafeInteger(Math.round(v*10000)))fail("Valor inválido");return Math.round(v*10000)}
async function sync(req,db){
 const raw=await req.text();if(raw.length>3000000)fail("Lote grande",413);
 let p;try{p=JSON.parse(raw)}catch{fail("JSON inválido")}
 if(!p||p.schema!==1||p.fonte!=="LANCAMENTOS"||p.criterio!=="ENTRADA_SAIDA=S; SUM(VALOR-DESCONTO), sem CMV")fail("Schema inválido");
 windowOf(p.inicio,p.fim);
 if(typeof p.extraido_em!=="string"||!Number.isFinite(Date.parse(p.extraido_em))||new Date(p.extraido_em).toISOString()!==p.extraido_em||Date.parse(p.extraido_em)>Date.now()+300000)fail("Data de extração inválida");
 if(!Array.isArray(p.registros)||!p.registros.length||p.registros.length>12000||!Array.isArray(p.resumo)||p.resumo.length!==3)fail("Lote inválido");
 const seen=new Set(),tot=new Map(),rows=[];
 for(const r of p.registros){
  if(!r||![1,2,3].includes(r.FILIAL)||!date(r.DIA)||r.DIA<p.inicio||r.DIA>p.fim||!int(r.REGISTROS)||!int(r.REGISTROS_COM_VALOR)||r.REGISTROS<1||r.REGISTROS_COM_VALOR>r.REGISTROS)fail("Grupo inválido");
  if(r.CD_CLASSE!=null&&!Number.isSafeInteger(r.CD_CLASSE))fail("Classe inválida");
  if(r.CLASSE!=null&&(typeof r.CLASSE!=="string"||r.CLASSE.length>100))fail("Nome de classe inválido");
  const c=key(r.CD_CLASSE),t=key(r.TIPO_VENDA,10),x=key(r.TROCA,10),v=amount(r.VENDAS);
  const k=JSON.stringify([r.FILIAL,r.DIA,c,t,x]);if(seen.has(k))fail("Grupo duplicado");seen.add(k);
  rows.push({f:r.FILIAL,d:r.DIA,c,n:r.CLASSE??"SEM CLASSE",t,x,r:r.REGISTROS,q:r.REGISTROS_COM_VALOR,v});
  const s=tot.get(r.FILIAL)||{r:0,q:0,v:0,d:""};s.r+=r.REGISTROS;s.q+=r.REGISTROS_COM_VALOR;s.v+=v;if(r.DIA>s.d)s.d=r.DIA;tot.set(r.FILIAL,s);
 }
 const filiais=new Set();
 for(const r of p.resumo){
  if(!r||filiais.has(r.FILIAL))fail("Resumo duplicado");filiais.add(r.FILIAL);
  const s=tot.get(r.FILIAL);if(!s||s.r!==r.REGISTROS||s.q!==r.REGISTROS_COM_VALOR||s.d!==r.ULTIMA_DATA||Math.abs(s.v-amount(r.VENDAS))>200)fail("Conciliação divergente");
 }
 if(filiais.size!==3||tot.size!==3)fail("Filial ausente");
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
 const lote=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
 const now=new Date().toISOString(),total=[...tot.values()].reduce((a,s)=>a+s.r,0);
 // A guarda SQL é avaliada dentro do batch transacional, inclusive em requisições concorrentes.
 const guard="NOT EXISTS (SELECT 1 FROM vendas_sincronizacoes WHERE extraido_em >= ?)";
 const statements=[
 db.prepare("DELETE FROM vendas_diarias WHERE dia BETWEEN ? AND ? AND "+guard+" AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.f')=filial AND json_extract(j.value,'$.d')=dia AND json_extract(j.value,'$.c')=classe_id AND json_extract(j.value,'$.t')=tipo_venda AND json_extract(j.value,'$.x')=troca)").bind(p.inicio,p.fim,p.extraido_em,JSON.stringify(rows))
 ];
 // Usa JSON por lote para evitar limite de parâmetros SQL e só escreve grupos alterados.
 for(let i=0;i<rows.length;i+=250){
  statements.push(db.prepare("INSERT INTO vendas_diarias(filial,dia,classe_id,classe,tipo_venda,troca,registros,registros_com_valor,vendas_10000,atualizado_em) SELECT json_extract(value,'$.f'),json_extract(value,'$.d'),json_extract(value,'$.c'),json_extract(value,'$.n'),json_extract(value,'$.t'),json_extract(value,'$.x'),json_extract(value,'$.r'),json_extract(value,'$.q'),json_extract(value,'$.v'),? FROM json_each(?) WHERE "+guard+" ON CONFLICT(filial,dia,classe_id,tipo_venda,troca) DO UPDATE SET classe=excluded.classe,registros=excluded.registros,registros_com_valor=excluded.registros_com_valor,vendas_10000=excluded.vendas_10000,atualizado_em=excluded.atualizado_em WHERE classe<>excluded.classe OR registros<>excluded.registros OR registros_com_valor<>excluded.registros_com_valor OR vendas_10000<>excluded.vendas_10000").bind(now,JSON.stringify(rows.slice(i,i+250)),p.extraido_em));
 }
 statements.push(db.prepare("INSERT INTO vendas_sincronizacoes(lote,inicio,fim,extraido_em,recebido_em,grupos,registros) SELECT ?,?,?,?,?,?,? WHERE "+guard).bind(lote,p.inicio,p.fim,p.extraido_em,now,rows.length,total,p.extraido_em));
 const results=await db.batch(statements);
 const inserted=results.at(-1).meta.changes===1;
 if(!inserted){const old=await db.prepare("SELECT lote FROM vendas_sincronizacoes WHERE lote=?").bind(lote).first();if(!old)fail("Extração anterior ou concorrente",409)}
 return json({ok:true,lote,duplicado:!inserted,grupos:rows.length,registros:total,alteracoes:results.slice(0,-1).reduce((a,r)=>a+(r.meta.changes||0),0)});
}
async function syncCmv(req,db){
 const raw=await req.text();if(raw.length>8000000)fail("Lote CMV grande",413);
 let p;try{p=JSON.parse(raw)}catch{fail("JSON inválido")}
 if(!p||p.schema!==1||!Array.isArray(p.dias)||!p.dias.length||p.dias.length>1098)fail("Schema CMV inválido");
 windowOf(p.inicio,p.fim);
 if(typeof p.extraido_em!=="string"||!Number.isFinite(Date.parse(p.extraido_em))||new Date(p.extraido_em).toISOString()!==p.extraido_em||Date.parse(p.extraido_em)>Date.now()+300000)fail("Extração inválida");
 const seen=new Set(),filiais=new Set(),rows=[];
 for(const d of p.dias){
  if(!d||![1,2,3].includes(d.filial)||!date(d.dia)||d.dia<p.inicio||d.dia>p.fim||!Array.isArray(d.grupos)||!d.grupos.length||!Array.isArray(d.alertas))fail("Dia CMV inválido");
  const k=d.filial+":"+d.dia;if(seen.has(k))fail("Dia duplicado");seen.add(k);filiais.add(d.filial);
  const groups=new Set();
  for(const g of [...d.grupos,...d.alertas]){
   if(!g||g.FILIAL!==d.filial||g.DIA!==d.dia||!["INVALIDO","SUSPEITO","SEM_ALERTA"].includes(g.FAIXA)||!int(g.REGISTROS)||g.REGISTROS<1)fail("Grupo CMV inválido");
   amount(g.VENDAS);amount(g.CMV);
   if(g.CLASSE!=null&&(typeof g.CLASSE!=="string"||g.CLASSE.length>100))fail("Classe inválida");
  }
  for(const g of d.grupos){const id=JSON.stringify([g.CD_CLASSE,g.FAIXA]);if(groups.has(id))fail("Grupo CMV duplicado");groups.add(id);}
  rows.push({f:d.filial,d:d.dia,j:JSON.stringify({grupos:d.grupos,alertas:d.alertas})});
 }
 if(filiais.size!==3)fail("Filiais incompletas");
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw)),lote=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join(""),now=new Date().toISOString();
 const guard="NOT EXISTS(SELECT 1 FROM cmv_lotes WHERE extraido_em>=?)";
 const statements=[db.prepare("DELETE FROM cmv_dias WHERE dia BETWEEN ? AND ? AND "+guard+" AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.f')=filial AND json_extract(j.value,'$.d')=dia)").bind(p.inicio,p.fim,p.extraido_em,JSON.stringify(rows.map(({f,d})=>({f,d}))))];
 for(let i=0;i<rows.length;i+=10)statements.push(db.prepare("INSERT INTO cmv_dias(filial,dia,dados,atualizado_em) SELECT json_extract(value,'$.f'),json_extract(value,'$.d'),json_extract(value,'$.j'),? FROM json_each(?) WHERE "+guard+" ON CONFLICT(filial,dia) DO UPDATE SET dados=excluded.dados,atualizado_em=excluded.atualizado_em WHERE dados<>excluded.dados").bind(now,JSON.stringify(rows.slice(i,i+10)),p.extraido_em));
 statements.push(db.prepare("INSERT INTO cmv_lotes(lote,inicio,fim,extraido_em,recebido_em) SELECT ?,?,?,?,? WHERE "+guard).bind(lote,p.inicio,p.fim,p.extraido_em,now,p.extraido_em));
 const result=await db.batch(statements),inserted=result.at(-1).meta.changes===1;
 if(!inserted&&!await db.prepare("SELECT lote FROM cmv_lotes WHERE lote=?").bind(lote).first())fail("Extração CMV antiga",409);
 return json({ok:true,lote,dias:rows.length,duplicado:!inserted,alteracoes:result.slice(0,-1).reduce((a,x)=>a+(x.meta.changes||0),0)});
}
export default {async fetch(req,env){
 try{
 const u=new URL(req.url),route=u.pathname,db=env.VENDAS_DB;
 const write=route==="/vendas/sync"||route==="/cmv/sync";
 if(!await authorized(req,write?env.VENDAS_SYNC_KEY:env.VENDAS_MASTER_KEY))return json({erro:"Não autorizado"},401);
 if(write&&req.method==="POST")return route==="/cmv/sync"?await syncCmv(req,db):await sync(req,db);
 if(route==="/cmv/status"&&req.method==="GET")return json({ok:true,ultimo:await db.prepare("SELECT * FROM cmv_lotes ORDER BY extraido_em DESC LIMIT 1").first()});
 if(route==="/cmv"&&req.method==="GET"){
 const a=u.searchParams.get("inicio"),b=u.searchParams.get("fim");windowOf(a,b);
 if((Date.parse(b)-Date.parse(a))/86400000>92)fail("Consulte até 93 dias por vez");
 const f=u.searchParams.get("filial");if(f!==null&&!["1","2","3"].includes(f))fail("Filial inválida");
 const rows=await db.prepare("SELECT filial,dia,dados FROM cmv_dias WHERE dia BETWEEN ? AND ?"+(f?" AND filial=?":"")+" ORDER BY filial,dia").bind(...(f?[a,b,Number(f)]:[a,b])).all();
 const grupos=new Map(),alertas=new Map();
 for(const row of rows.results){const d=JSON.parse(row.dados);for(const [arr,map,audit] of [[d.grupos,grupos,false],[d.alertas,alertas,true]])for(const g of arr){
 const k=JSON.stringify([g.FILIAL,g.CD_CLASSE,g.FAIXA,...(audit?[g.ID_PRODUTO,g.CD_PRODUTO,g.PRODUTO]:[])]);
 const x=map.get(k)||{...g,DIA:undefined,VENDAS:0,CMV:0,REGISTROS:0};x.VENDAS+=amount(g.VENDAS);x.CMV+=amount(g.CMV);x.REGISTROS+=g.REGISTROS;map.set(k,x);
 }}
 const out=m=>[...m.values()].map(g=>({...g,VENDAS:g.VENDAS/10000,CMV:g.CMV/10000}));
 return json({ok:true,inicio:a,fim:b,ultimo:await db.prepare("SELECT * FROM cmv_lotes ORDER BY extraido_em DESC LIMIT 1").first(),cobertura:rows.results.map(({filial,dia})=>({filial,dia})),grupos:out(grupos),alertas:out(alertas)});
 }
 if(route==="/vendas/status"&&req.method==="GET"){
 const ultimo=await db.prepare("SELECT * FROM vendas_sincronizacoes ORDER BY extraido_em DESC LIMIT 1").first();
 const filiais=await db.prepare("SELECT filial,MIN(dia) inicio,MAX(dia) fim,COUNT(*) grupos FROM vendas_diarias GROUP BY filial").all();
 return json({ok:true,ultimo,filiais:filiais.results});
 }
 if((route==="/vendas"||route==="/vendas/classes")&&req.method==="GET"){
 const a=u.searchParams.get("inicio"),b=u.searchParams.get("fim");windowOf(a,b);
 const f=u.searchParams.get("filial");if(f!==null&&!["1","2","3"].includes(f))fail("Filial inválida");
 const group=route==="/vendas/classes"?"filial,classe_id,classe":"filial,dia";
 const sql="SELECT "+group+",SUM(vendas_10000)/10000.0 AS vendas,SUM(registros) registros,SUM(registros_com_valor) registros_com_valor FROM vendas_diarias WHERE dia BETWEEN ? AND ?"+(f?" AND filial=?":"")+" GROUP BY "+group+" ORDER BY "+group;
 const args=f?[a,b,Number(f)]:[a,b];const r=await db.prepare(sql).bind(...args).all();
 return json({ok:true,inicio:a,fim:b,registros:r.results});
 }
 if(route==="/vendas/metas"&&["GET","POST"].includes(req.method)){
 if(req.method==="GET"){const ano=Number(u.searchParams.get("ano")),mes=Number(u.searchParams.get("mes"));if(!Number.isInteger(ano)||ano<2000||ano>2100||!Number.isInteger(mes)||mes<1||mes>12)fail("Mês inválido");const r=await db.prepare("SELECT * FROM vendas_metas WHERE ano=? AND mes=?").bind(ano,mes).all();return json({ok:true,metas:[1,2,3].map(f=>r.results.find(x=>x.filial===f)||{filial:f,ano,mes,percentual_compras:60})})}
 const p=await req.json();if(![1,2,3].includes(p.filial)||!Number.isInteger(p.ano)||p.ano<2000||p.ano>2100||!Number.isInteger(p.mes)||p.mes<1||p.mes>12||typeof p.percentual_compras!=="number"||!Number.isFinite(p.percentual_compras)||p.percentual_compras<0||p.percentual_compras>100)fail("Meta inválida");
 await db.prepare("INSERT INTO vendas_metas(filial,ano,mes,percentual_compras,atualizado_em) VALUES(?,?,?,?,?) ON CONFLICT(filial,ano,mes) DO UPDATE SET percentual_compras=excluded.percentual_compras,atualizado_em=excluded.atualizado_em").bind(p.filial,p.ano,p.mes,p.percentual_compras,new Date().toISOString()).run();return json({ok:true});
 }
 return json({erro:"Rota não encontrada"},404);
 }catch(e){if(!e.status)console.error("Falha interna",e.message);return json({erro:e.status?e.message:"Falha interna"},e.status||500)}
}};
