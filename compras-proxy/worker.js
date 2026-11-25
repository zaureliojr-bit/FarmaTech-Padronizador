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
