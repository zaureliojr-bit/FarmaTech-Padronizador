const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const slug=/^[a-z0-9-]{1,80}$/;
const uuid=/^[a-f0-9-]{36}$/i;
const size=100;
async function equal(a,b){
 if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;
 const enc=new TextEncoder();
 const [x,y]=await Promise.all([a,b].map(s=>crypto.subtle.digest("SHA-256",enc.encode(s))));
 const u=new Uint8Array(x),v=new Uint8Array(y);let d=0;
 for(let i=0;i<u.length;i++)d|=u[i]^v[i];return d===0;
}
// Protocolo paralelo ao piloto. O manifesto só é publicado quando completo.
const hashValido=/^[a-f0-9]{64}$/;
const dataValida=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function canon(v){
 if(Array.isArray(v))return "["+v.map(canon).join(",")+"]";
 if(v!==null&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canon(v[k])).join(",")+"}";
 return JSON.stringify(v);
}
async function hashCompra(nota,itens){
 const bytes=new TextEncoder().encode(canon({nota,itens}));
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");
}
async function incremental(db,path,b,loja,filial){
 const lote=b.lote;
 if(path==="/compras/inc/iniciar"){
  if(b.filial!==filial||!integer(b.quantidade,0,100000)||!dataValida(b.inicio)||!dataValida(b.fim)||b.inicio>b.fim||typeof b.extraido_em!=="string"||!Number.isFinite(Date.parse(b.extraido_em))||new Date(b.extraido_em).toISOString()!==b.extraido_em||Date.parse(b.extraido_em)>Date.now()+300000)return reply({erro:"Manifesto inválido"},400);
  await db.prepare("INSERT OR IGNORE INTO compras_inc_lotes VALUES (?,?,?,?,?,?)").bind(loja,lote,b.extraido_em,b.inicio,b.fim,b.quantidade).run();
  const m=await db.prepare("SELECT * FROM compras_inc_lotes WHERE loja=? AND lote=?").bind(loja,lote).first();
  return m.extraido_em===b.extraido_em&&m.inicio===b.inicio&&m.fim===b.fim&&m.quantidade===b.quantidade?reply({ok:true}):reply({erro:"Manifesto divergente"},409);
 }
 const m=await db.prepare("SELECT * FROM compras_inc_lotes WHERE loja=? AND lote=?").bind(loja,lote).first();
 if(!m)return reply({erro:"Lote inexistente"},404);
 if(path==="/compras/inc/manifesto"){
  const a=b.registros;
  if(!Array.isArray(a)||a.length<1||a.length>100||a.some(r=>!r||!integer(r.compra,1,Number.MAX_SAFE_INTEGER)||!hashValido.test(r.hash||""))||new Set(a.map(r=>r.compra)).size!==a.length)return reply({erro:"Registros inválidos"},400);
  await db.batch(a.map(r=>db.prepare("INSERT OR IGNORE INTO compras_inc_manifesto SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM compras_inc_publicados WHERE loja=? AND lote=?)").bind(loja,lote,r.compra,r.hash,loja,lote)));
  const faltantes=[];
  for(const r of a){
   const row=await db.prepare("SELECT m.hash,c.hash AS presente FROM compras_inc_manifesto m LEFT JOIN compras_inc_conteudo c ON c.loja=m.loja AND c.compra=m.compra AND c.hash=m.hash WHERE m.loja=? AND m.lote=? AND m.compra=?").bind(loja,lote,r.compra).first();
   if(row?.hash!==r.hash)return reply({erro:"Manifesto divergente"},409);
   if(!row.presente)faltantes.push(r.compra);
  }
  return reply({ok:true,faltantes});
 }
 if(path==="/compras/inc/conteudo"){
  const {nota,itens,hash}=b,compra=nota?.CD_COMPRAS;
  if(!nota||nota.CD_FILIAL!==filial||!integer(compra,1,Number.MAX_SAFE_INTEGER)||!hashValido.test(hash||"")||!Array.isArray(itens)||itens.some(i=>!i||i.CD_FILIAL!==filial||i.CD_COMPRAS!==compra||!integer(i.CD_ITENS_COMPRA,1,Number.MAX_SAFE_INTEGER))||new Set(itens.map(i=>i.CD_ITENS_COMPRA)).size!==itens.length)return reply({erro:"Conteúdo inválido"},400);
  if(await hashCompra(nota,itens)!==hash)return reply({erro:"Hash divergente"},409);
  const r=await db.prepare("SELECT hash FROM compras_inc_manifesto WHERE loja=? AND lote=? AND compra=?").bind(loja,lote,compra).first();
  if(r?.hash!==hash)return reply({erro:"Compra não declarada"},409);
  await db.prepare("INSERT OR IGNORE INTO compras_inc_conteudo VALUES (?,?,?,?,?)").bind(loja,compra,hash,canon(nota),canon(itens)).run();
  return reply({ok:true});
 }
 if(path==="/compras/inc/concluir"){
  await db.prepare("INSERT OR IGNORE INTO compras_inc_publicados SELECT l.loja,l.lote,l.extraido_em FROM compras_inc_lotes l WHERE l.loja=? AND l.lote=? AND l.quantidade=(SELECT COUNT(*) FROM compras_inc_manifesto m WHERE m.loja=l.loja AND m.lote=l.lote) AND NOT EXISTS (SELECT 1 FROM compras_inc_manifesto m LEFT JOIN compras_inc_conteudo c ON c.loja=m.loja AND c.compra=m.compra AND c.hash=m.hash WHERE m.loja=l.loja AND m.lote=l.lote AND c.hash IS NULL)").bind(loja,lote).run();
  const r=await db.prepare("SELECT lote FROM compras_inc_publicados WHERE loja=? AND lote=?").bind(loja,lote).first();
  return r?reply({ok:true}):reply({erro:"Lote incremental incompleto"},409);
 }
 return reply({erro:"Rota inexistente"},404);
}
export default {async fetch(req,env){
 try {
 const url=new URL(req.url), path=url.pathname, db=env.COMPRAS_DB;
 const auth=req.headers.get("Authorization")||"", token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!db)return reply({erro:"Banco não configurado"},503);
 if(req.method==="GET"){
 if(!await equal(token,env.COMPRAS_MASTER_KEY))return reply({erro:"Não autorizado"},401);
 if(path==="/compras")return reply({lojas:(await db.prepare("SELECT a.loja,a.lote,a.extraido_em,l.notas,l.itens FROM compras_ativos a JOIN compras_lotes l ON l.loja=a.loja AND l.lote=a.lote ORDER BY a.loja").all()).results});
 if(path==="/compras/historico")return reply({lotes:(await db.prepare("SELECT h.loja,h.lote,h.extraido_em,l.notas,l.itens FROM compras_historico h JOIN compras_lotes l ON l.loja=h.loja AND l.lote=h.lote ORDER BY h.extraido_em DESC LIMIT 500").all()).results});
 if(path!=="/compras/parte")return reply({erro:"Rota inexistente"},404);
 const loja=url.searchParams.get("loja"),lote=url.searchParams.get("lote"),tipo=url.searchParams.get("tipo"),pos=Number(url.searchParams.get("pos"));
 if(!slug.test(loja||"")||!uuid.test(lote||"")||!["notas","itens"].includes(tipo)||!integer(pos,0,9999))return reply({erro:"Parâmetros inválidos"},400);
 const row=await db.prepare("SELECT p.dados FROM compras_partes p JOIN compras_historico a ON a.loja=p.loja AND a.lote=p.lote WHERE p.loja=? AND p.lote=? AND p.tipo=? AND p.pos=?").bind(loja,lote,tipo,pos).first();
 return row?reply({dados:JSON.parse(row.dados)}):reply({erro:"Parte indisponível"},404);
 }
 if(req.method!=="POST")return reply({erro:"Método inválido"},405);
 const lojas=JSON.parse(env.COMPRAS_LOJAS_JSON||"{}");
 let loja=null,filial=null;
 for(const [s,c] of Object.entries(lojas)){if(slug.test(s)&&integer(c.filial,1,9999)&&await equal(token,c.token)){if(loja)return reply({erro:"Configuração inválida"},503);loja=s;filial=c.filial;}}
 if(!loja)return reply({erro:"Não autorizado"},401);
 const raw=await req.text();if(new TextEncoder().encode(raw).length>500000)return reply({erro:"Carga grande"},413);
 const b=JSON.parse(raw),lote=b.lote;
 if(!uuid.test(lote||""))return reply({erro:"Lote inválido"},400);
 if(path.startsWith("/compras/inc/"))return await incremental(db,path,b,loja,filial);
 if(path==="/compras/iniciar"){
 if(b.filial!==filial||!integer(b.notas,0,100000)||!integer(b.itens,0,500000)||typeof b.extraido_em!=="string"||!Number.isFinite(Date.parse(b.extraido_em))||new Date(b.extraido_em).toISOString()!==b.extraido_em||Date.parse(b.extraido_em)>Date.now()+300000)return reply({erro:"Manifesto inválido"},400);
 await db.prepare("INSERT OR IGNORE INTO compras_lotes VALUES (?,?,?,?,?)").bind(loja,lote,b.extraido_em,b.notas,b.itens).run();
 const m=await db.prepare("SELECT * FROM compras_lotes WHERE loja=? AND lote=?").bind(loja,lote).first();
 return m.extraido_em===b.extraido_em&&m.notas===b.notas&&m.itens===b.itens?reply({ok:true}):reply({erro:"Manifesto divergente"},409);
 }
 const m=await db.prepare("SELECT * FROM compras_lotes WHERE loja=? AND lote=?").bind(loja,lote).first();
 if(!m)return reply({erro:"Lote inexistente"},404);
 if(path==="/compras/parte"){
 const {tipo,pos,dados}=b;
 if(!["notas","itens"].includes(tipo)||!integer(pos,0,9999)||!Array.isArray(dados)||pos>=Math.ceil(m[tipo]/size)||dados.length!==Math.min(size,m[tipo]-pos*size)||dados.some(r=>!r||r.CD_FILIAL!==filial||!integer(r.CD_COMPRAS,1,Number.MAX_SAFE_INTEGER)))return reply({erro:"Parte inválida"},400);
 const json=JSON.stringify(dados);
 await db.prepare("INSERT OR IGNORE INTO compras_partes SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM compras_historico WHERE loja=? AND lote=?)").bind(loja,lote,tipo,pos,json,dados.length,loja,lote).run();
 const p=await db.prepare("SELECT dados FROM compras_partes WHERE loja=? AND lote=? AND tipo=? AND pos=?").bind(loja,lote,tipo,pos).first();
 return p?.dados===json?reply({ok:true}):reply({erro:"Parte divergente"},409);
 }
 if(path==="/compras/concluir"){
 const registrar=db.prepare("INSERT OR IGNORE INTO compras_historico SELECT loja,lote,extraido_em FROM compras_lotes l WHERE loja=? AND lote=? AND (SELECT COUNT(*) FROM compras_partes p WHERE p.loja=l.loja AND p.lote=l.lote AND tipo='notas')=? AND (SELECT COUNT(*) FROM compras_partes p WHERE p.loja=l.loja AND p.lote=l.lote AND tipo='itens')=?").bind(loja,lote,Math.ceil(m.notas/size),Math.ceil(m.itens/size));
 const ativar=db.prepare("INSERT INTO compras_ativos (loja,lote,extraido_em) SELECT loja,lote,extraido_em FROM compras_lotes l WHERE loja=? AND lote=? AND (SELECT COUNT(*) FROM compras_partes p WHERE p.loja=l.loja AND p.lote=l.lote AND tipo='notas')=? AND (SELECT COUNT(*) FROM compras_partes p WHERE p.loja=l.loja AND p.lote=l.lote AND tipo='itens')=? ON CONFLICT(loja) DO UPDATE SET lote=excluded.lote,extraido_em=excluded.extraido_em WHERE excluded.extraido_em>=compras_ativos.extraido_em").bind(loja,lote,Math.ceil(m.notas/size),Math.ceil(m.itens/size));
 const [,r]=await db.batch([registrar,ativar]);
 const registrado=await db.prepare("SELECT lote FROM compras_historico WHERE loja=? AND lote=?").bind(loja,lote).first();
 return registrado?reply({ok:true,ativo:!!r.meta.changes}):reply({erro:"Lote incompleto"},409);
 }
 return reply({erro:"Rota inexistente"},404);
 } catch(e){return reply({erro:"Falha ao processar compras"},500);}
}};
