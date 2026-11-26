"use strict";
require("dotenv").config();
const Firebird=require("node-firebird");
const fs=require("fs");
const path=require("path");
const dias=Number(process.env.VENDAS_DIAS||90);
const port=Number(process.env.FB_PORT||3050);
const options={host:process.env.FB_HOST||"localhost",port,database:process.env.FB_DATABASE,user:process.env.FB_USER,password:process.env.FB_PASSWORD,lowercase_keys:false};
const call=(obj,fn,...args)=>new Promise((resolve,reject)=>obj[fn](...args,(err,result)=>err?reject(err):resolve(result)));
async function main(){
 if(!Number.isInteger(dias)||dias<1||dias>366||!Number.isInteger(port)||port<1||port>65535||!options.database||!options.user||!options.password)throw Error("Confira FB_DATABASE, FB_USER, FB_PASSWORD, FB_PORT e VENDAS_DIAS (1 a 366).");
 const isolation=Firebird.ISOLATION_READ_COMMITTED_READ_ONLY;
 if(isolation==null)throw Error("Driver sem transação somente leitura.");
 const db=await call(Firebird,"attach",options);
 let tx;
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
  await call(tx,"commit");tx=null;
  if(resumo.length!==3||![1,2,3].every(f=>resumo.some(r=>Number(r.FILIAL)===f)))throw Error("Uma ou mais filiais sem lançamentos no período; publicação bloqueada.");
  for(const r of resumo){
   const g=registros.filter(x=>x.FILIAL===r.FILIAL);
   const total=g.reduce((s,x)=>s+Number(x.VENDAS),0);
   if(!Number.isFinite(total)||r.VENDAS==null||Math.abs(total-Number(r.VENDAS))>0.02||g.reduce((s,x)=>s+Number(x.REGISTROS),0)!==Number(r.REGISTROS)||g.reduce((s,x)=>s+Number(x.REGISTROS_COM_VALOR),0)!==Number(r.REGISTROS_COM_VALOR))throw Error("Conciliação divergente na filial "+r.FILIAL);
  }
  const payload={schema:1,fonte:"LANCAMENTOS",criterio:"ENTRADA_SAIDA=S; SUM(VALOR-DESCONTO), sem CMV",inicio,fim,extraido_em:new Date().toISOString(),resumo,registros,auditoria};
  const destino=path.resolve("vendas-matriz.json"),temporario=destino+".tmp";
  fs.writeFileSync(temporario,JSON.stringify(payload,null,2),"utf8");fs.renameSync(temporario,destino);
  console.log("Drogalink Vendas Matriz beta.1 | "+inicio+" a "+fim);
  console.table(resumo);console.log(registros.length+" grupos agregados. Arquivo: "+destino);
  console.log("Somente leitura local; nenhum dado enviado ao D1.");
 }finally{if(tx)await call(tx,"rollback").catch(()=>{});await call(db,"detach");}
}
main().catch(e=>{console.error("Falha no extrator:",e.message);process.exitCode=1;});
