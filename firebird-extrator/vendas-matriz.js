"use strict";
require("dotenv").config();
const Firebird=require("node-firebird");
const fs=require("fs");
const path=require("path");
const cmvAtivo=process.argv.includes("--cmv")||process.env.CMV_ATIVO==="1";
const enviar=process.argv.includes("--enviar");
const dias=Number(process.env.VENDAS_DIAS||90);
const port=Number(process.env.FB_PORT||3050);
const options={host:process.env.FB_HOST||"localhost",port,database:process.env.FB_DATABASE,user:process.env.FB_USER,password:process.env.FB_PASSWORD,lowercase_keys:false};
const call=(obj,fn,...args)=>new Promise((resolve,reject)=>obj[fn](...args,(err,result)=>err?reject(err):resolve(result)));
async function main(){
 if(!Number.isInteger(dias)||dias<1||dias>366||!Number.isInteger(port)||port<1||port>65535||!options.database||!options.user||!options.password)throw Error("Confira FB_DATABASE, FB_USER, FB_PASSWORD, FB_PORT e VENDAS_DIAS (1 a 366).");
 if(enviar&&(!/^[a-fA-F0-9]{64}$/.test(process.env.VENDAS_SYNC_KEY||"")||process.env.VENDAS_URL!=="https://drogalink-vendas-proxy.zaureliojr.workers.dev"))throw Error("Configure VENDAS_URL e VENDAS_SYNC_KEY no .env.");
 const isolation=Firebird.ISOLATION_READ_COMMITTED_READ_ONLY;
 if(isolation==null)throw Error("Driver sem transação somente leitura.");
 const db=await call(Firebird,"attach",options);
 let tx, payload, destino, cmvPayload;
 try{
  tx=await call(db,"transaction",isolation);
  const q=sql=>call(tx,"query",sql,[]);
  const [janela]=await q("SELECT CAST(CURRENT_DATE AS VARCHAR(10)) AS FIM, CAST(CURRENT_DATE - "+(dias-1)+" AS VARCHAR(10)) AS INICIO FROM RDB$DATABASE");
  const inicio=String(janela.INICIO).trim(),fim=String(janela.FIM).trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(fim))throw Error("Datas inválidas.");
  const filtro="L.CD_FILIAL IN (1,2,3) AND L.DATA_CAIXA BETWEEN DATE '"+inicio+"' AND DATE '"+fim+"'";
  const valor="L.VALOR - L.DESCONTO";
  const registros=await q("SELECT CAST(L.CD_FILIAL AS INTEGER) AS FILIAL, CAST(L.DATA_CAIXA AS VARCHAR(10)) AS DIA, L.CD_CLASSE AS CD_CLASSE, C.DESCRICAO AS CLASSE, L.TIPO_VENDA AS TIPO_VENDA, L.TROCA AS TROCA, COUNT(*) AS REGISTROS, COUNT("+valor+") AS REGISTROS_COM_VALOR, CAST(COALESCE(SUM("+valor+"),0) AS NUMERIC(18,4)) AS VENDAS FROM LANCAMENTOS L LEFT JOIN CLASSES C ON C.CD_CLASSE=L.CD_CLASSE WHERE "+filtro+" AND L.ENTRADA_SAIDA='S' GROUP BY L.CD_FILIAL,L.DATA_CAIXA,L.CD_CLASSE,C.DESCRICAO,L.TIPO_VENDA,L.TROCA ORDER BY 1,2,3,5,6");
  const resumo=await q("SELECT CAST(L.CD_FILIAL AS INTEGER) AS FILIAL, COUNT(*) AS REGISTROS, COUNT("+valor+") AS REGISTROS_COM_VALOR, CAST(MAX(L.DATA_CAIXA) AS VARCHAR(10)) AS ULTIMA_DATA, CAST(SUM("+valor+") AS NUMERIC(18,2)) AS VENDAS FROM LANCAMENTOS L WHERE "+filtro+" AND L.ENTRADA_SAIDA='S' GROUP BY L.CD_FILIAL ORDER BY 1");
  const auditoria=await q("SELECT CAST(L.CD_FILIAL AS INTEGER) AS FILIAL,L.ENTRADA_SAIDA,L.TIPO_VENDA,L.TROCA,COUNT(*) AS REGISTROS,COUNT("+valor+") AS REGISTROS_COM_VALOR,CAST(SUM("+valor+") AS NUMERIC(18,2)) AS TOTAL FROM LANCAMENTOS L WHERE "+filtro+" GROUP BY L.CD_FILIAL,L.ENTRADA_SAIDA,L.TIPO_VENDA,L.TROCA ORDER BY 1,2,3,4");
  if(cmvAtivo){
   const custo="L.CUSTO_MEDIO*L.QUANTIDADE";
   const invalido="("+valor+" IS NULL OR L.CUSTO_MEDIO IS NULL OR L.CUSTO_MEDIO<=0 OR L.QUANTIDADE IS NULL OR L.QUANTIDADE<=0)";
   const suspeito="("+valor+" > 0 AND "+custo+" > ("+valor+")*2)";
   const faixa="CASE WHEN "+invalido+" THEN 'INVALIDO' WHEN "+suspeito+" THEN 'SUSPEITO' ELSE 'SEM_ALERTA' END";
   const base=" FROM LANCAMENTOS L LEFT JOIN CLASSES C ON C.CD_CLASSE=L.CD_CLASSE WHERE "+filtro+" AND L.ENTRADA_SAIDA='S' AND L.TIPO_VENDA='V'";
   const campos="CAST(L.CD_FILIAL AS INTEGER) AS FILIAL, CAST(L.DATA_CAIXA AS VARCHAR(10)) AS DIA, L.CD_CLASSE AS CD_CLASSE, C.DESCRICAO AS CLASSE";
   const medidas="COUNT(*) AS REGISTROS, CAST(COALESCE(SUM("+valor+"),0) AS NUMERIC(18,4)) AS VENDAS, CAST(COALESCE(SUM("+custo+"),0) AS NUMERIC(18,4)) AS CMV";
   const grupos=await q("SELECT "+campos+", "+faixa+" AS FAIXA, "+medidas+base+" GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,5");
   const alertas=await q("SELECT "+campos+", L.ID_PRODUTO AS ID_PRODUTO,L.CD_PRODUTO AS CD_PRODUTO,L.DESCRICAO AS PRODUTO,"+faixa+" AS FAIXA, "+medidas+base+" AND ("+invalido+" OR "+suspeito+" OR "+custo+">("+valor+")) GROUP BY 1,2,3,4,5,6,7,8 ORDER BY 1,2,5,8");
   const diasMap=new Map();
   for(const g of grupos){const k=g.FILIAL+":"+g.DIA;if(!diasMap.has(k))diasMap.set(k,{filial:g.FILIAL,dia:g.DIA,grupos:[],alertas:[]});diasMap.get(k).grupos.push(g);}
   for(const a of alertas){const d=diasMap.get(a.FILIAL+":"+a.DIA);if(!d)throw Error("Auditoria CMV sem grupo");d.alertas.push(a);}
   cmvPayload={schema:1,inicio,fim,extraido_em:new Date().toISOString(),dias:[...diasMap.values()]};
  }
  await call(tx,"commit");tx=null;
  if(resumo.length!==3||![1,2,3].every(f=>resumo.some(r=>Number(r.FILIAL)===f)))throw Error("Uma ou mais filiais sem lançamentos no período; publicação bloqueada.");
  for(const r of resumo){
   const g=registros.filter(x=>x.FILIAL===r.FILIAL);
   const total=g.reduce((s,x)=>s+Number(x.VENDAS),0);
   if(!Number.isFinite(total)||r.VENDAS==null||Math.abs(total-Number(r.VENDAS))>0.02||g.reduce((s,x)=>s+Number(x.REGISTROS),0)!==Number(r.REGISTROS)||g.reduce((s,x)=>s+Number(x.REGISTROS_COM_VALOR),0)!==Number(r.REGISTROS_COM_VALOR))throw Error("Conciliação divergente na filial "+r.FILIAL);
  }
  payload={schema:1,fonte:"LANCAMENTOS",criterio:"ENTRADA_SAIDA=S; SUM(VALOR-DESCONTO), sem CMV",inicio,fim,extraido_em:new Date().toISOString(),resumo,registros,auditoria};
  destino=path.resolve("vendas-matriz.json"); const temporario=destino+".tmp";
  fs.writeFileSync(temporario,JSON.stringify(payload,null,2),"utf8");fs.renameSync(temporario,destino);
  console.log("Drogalink Vendas Matriz beta.3 | "+inicio+" a "+fim);
  console.table(resumo);console.log(registros.length+" grupos agregados. Arquivo: "+destino);

 }finally{if(tx)await call(tx,"rollback").catch(()=>{});await call(db,"detach");}
 if(cmvPayload){const file=path.resolve("cmv-matriz.json");fs.writeFileSync(file+".tmp",JSON.stringify(cmvPayload,null,2),"utf8");fs.renameSync(file+".tmp",file);console.log("CMV local: "+cmvPayload.dias.length+" dias/filiais.");}
 if(!enviar){console.log("Somente leitura local; nenhum dado enviado ao D1.");return;}
 const body=fs.readFileSync(destino);
 let last,enviado=false;
 for(let tentativa=1;tentativa<=3;tentativa++){
  try{
   const response=await fetch(process.env.VENDAS_URL+"/vendas/sync",{method:"POST",headers:{"Authorization":"Bearer "+process.env.VENDAS_SYNC_KEY,"Content-Type":"application/json"},body,redirect:"error",signal:AbortSignal.timeout(120000)});
   if(!response.ok){const e=Error("HTTP "+response.status);e.permanente=response.status<500&&response.status!==429;throw e;}
   const r=await response.json();
   if(r.ok!==true||r.grupos!==payload.registros.length||r.registros!==payload.resumo.reduce((s,x)=>s+Number(x.REGISTROS),0))throw Error("Confirmação do servidor divergente.");
   console.log("D1 confirmado: "+JSON.stringify({lote:r.lote,duplicado:r.duplicado,grupos:r.grupos,registros:r.registros,alteracoes:r.alteracoes}));enviado=true;break;
  }catch(e){last=e;console.error("Envio tentativa "+tentativa+": "+e.message);if(e.permanente)break;if(tentativa<3)await new Promise(r=>setTimeout(r,5000*tentativa));}
 }
 if(last && !enviado)throw last;
 if(cmvPayload){
  const response=await fetch(process.env.VENDAS_URL+"/cmv/sync",{method:"POST",headers:{"Authorization":"Bearer "+process.env.VENDAS_SYNC_KEY,"Content-Type":"application/json"},body:JSON.stringify(cmvPayload),redirect:"error",signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error("Vendas sincronizadas; CMV falhou HTTP "+response.status);
  const r=await response.json();if(!r.ok||r.dias!==cmvPayload.dias.length)throw Error("Confirmação CMV divergente");
  console.log("CMV D1 confirmado: "+JSON.stringify(r));
 }
}
main().catch(e=>{console.error("Falha no extrator:",e.message);process.exitCode=1;});
