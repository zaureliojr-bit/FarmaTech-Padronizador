/* As rotas de extração do imagens-proxy, com R2 e D1 de mentira.

   O que precisa ficar provado é uma coisa só, e por isso ela aparece em
   três seções: a planilha do PDV traz a coluna de preço de custo, e não
   pode sair sem chave — nem pela rota dela, nem pela rota de imagem. */
import worker from "./worker.js";

let falhas = 0;
const ok = m => console.log("   ✓", m);
const nao = m => { falhas++; console.log("   ✗", m); };

const CHAVE = "chave-de-teste";
const base = "https://i.exemplo.dev";

function fazerBucket() {
  const arq = new Map();
  return {
    _arq: arq,
    async put(k, v, o) { arq.set(k, { bytes: v, o }); },
    async get(k) {
      const a = arq.get(k);
      return a ? { body: "(corpo)", httpMetadata: a.o?.httpMetadata } : null;
    },
    async delete(k) { arq.delete(k); }
  };
}

/* D1 de mentira: entende a tabela extracoes, que é onde a versão
   fundida guarda o status (o R2 guarda só o arquivo). */
function fazerDB() {
  const extracoes = [];
  let proximo = 1;
  const api = {
    _extracoes: extracoes,
    prepare(sql) {
      let args = [];
      const t = sql.trim();
      const self = {
        bind: (...a) => { args = a; return self; },
        async first() {
          if (/FROM extracoes/.test(t)) {
            return [...extracoes].reverse().find(e => e.importado_em == null) || null;
          }
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          if (/^INSERT INTO extracoes/.test(t)) {
            extracoes.push({
              id: proximo++, nome_arquivo: args[0], tamanho: args[1],
              enviado_em: args[2], importado_em: null
            });
            return { meta: { changes: 1 } };
          }
          if (/^UPDATE extracoes SET importado_em/.test(t)) {
            let n = 0;
            for (const e of extracoes) if (e.importado_em == null) { e.importado_em = args[0]; n++; }
            return { meta: { changes: n } };
          }
          return { meta: {} };
        }
      };
      return self;
    }
  };
  api.batch = async (cmds) => { for (const c of cmds) await c.run(); return cmds.map(() => ({})); };
  return api;
}

async function chamar(env, metodo, rota, { corpo, chave, tipo } = {}) {
  const headers = {};
  if (chave) headers["X-Imagens-Key"] = chave;
  if (tipo) headers["Content-Type"] = tipo;
  const init = { method: metodo, headers };
  if (corpo !== undefined) init.body = corpo;
  const r = await worker.fetch(new Request(base + rota, init), env);
  const texto = await r.text();
  let dados = null; try { dados = JSON.parse(texto); } catch {}
  return { status: r.status, dados, texto, resposta: r };
}

const planilha = () => new Uint8Array(5000).buffer;
const novoEnv = () => ({ IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE });

async function enviar(env, nome = "produtos_extraidos.xlsx") {
  return chamar(env, "POST", "/extracao?nome=" + encodeURIComponent(nome),
    { chave: CHAVE, corpo: planilha(), tipo: "application/octet-stream" });
}

(async () => {

  console.log("\n1 · Enviar e aparecer no status");
  {
    const env = novoEnv();
    const vazio = await chamar(env, "GET", "/extracao");
    vazio.dados?.pendente === false ? ok("sem nada: pendente false") : nao("status: " + vazio.texto);

    const e = await enviar(env);
    e.status === 200 ? ok("enviou com a chave") : nao("enviar deu " + e.status + " " + e.texto);

    const s = await chamar(env, "GET", "/extracao");
    s.dados?.pendente === true ? ok("status vê o pendente") : nao("status: " + s.texto);
    s.dados.nomeArquivo === "produtos_extraidos.xlsx" ? ok("com o nome") : nao("nome: " + s.dados.nomeArquivo);
    s.dados.tamanho === 5000 ? ok("e o tamanho") : nao("tamanho: " + s.dados.tamanho);

    const campos = Object.keys(s.dados).sort().join(",");
    campos === "enviadoEm,nomeArquivo,pendente,tamanho"
      ? ok("exatamente os 4 campos que o painel usa") : nao("campos: " + campos);
  }

  console.log("\n2 · A planilha de custo NÃO sai sem chave");
  {
    const env = novoEnv();
    await enviar(env);

    const sem = await chamar(env, "GET", "/extracao/arquivo");
    sem.status === 401 ? ok("sem chave: 401") : nao("BAIXOU SEM CHAVE (" + sem.status + ")");

    const errada = await chamar(env, "GET", "/extracao/arquivo", { chave: "outra" });
    errada.status === 401 ? ok("chave errada: 401") : nao("passou com chave errada");

    const com = await chamar(env, "GET", "/extracao/arquivo", { chave: CHAVE });
    com.status === 200 ? ok("com a chave certa: 200") : nao("deu " + com.status);
    com.resposta.headers.get("Cache-Control") === "no-store"
      ? ok("e sem cache — dado de custo não fica em proxy") : nao("Cache-Control: " + com.resposta.headers.get("Cache-Control"));
  }

  console.log("\n3 · Nem pela rota curinga de imagem");
  {
    const env = novoEnv();
    await enviar(env);

    /* GET /:ean serve QUALQUER chave do balde. Sem a recusa de chave com
       barra, isto entregaria a planilha por fora da chave. */
    for (const t of ["/extracoes/pendente.xlsx", "/extracoes%2Fpendente.xlsx",
                     "//extracoes/pendente.xlsx", "/referencias/cmed"]) {
      const r = await chamar(env, "GET", t);
      r.status === 404 ? ok(`${t} → 404`) : nao(`${t} VAZOU (${r.status})`);
    }

    const del = await chamar(env, "DELETE", "/extracoes/pendente.xlsx", { chave: CHAVE });
    del.status === 404 ? ok("e nem dá pra apagar por ali") : nao("DELETE passou (" + del.status + ")");

    env.IMAGENS_BUCKET._arq.set("7891106000888", {
      bytes: new Uint8Array(10).buffer, o: { httpMetadata: { contentType: "image/png" } }
    });
    const img = await chamar(env, "GET", "/7891106000888");
    img.status === 200 ? ok("imagem por EAN continua aberta, como deve") : nao("imagem deu " + img.status);
  }

  console.log("\n4 · Enviar e marcar exigem chave");
  {
    const env = novoEnv();
    const semChave = await chamar(env, "POST", "/extracao?nome=x.xlsx",
      { corpo: planilha(), tipo: "application/octet-stream" });
    semChave.status === 401 ? ok("enviar sem chave: 401") : nao("aceitou envio sem chave");
    env.IMAGENS_BUCKET._arq.size === 0 ? ok("e nada guardado") : nao("guardou mesmo assim");

    await enviar(env);
    const marcar = await chamar(env, "POST", "/extracao/importado");
    marcar.status === 401 ? ok("marcar sem chave: 401") : nao("deu " + marcar.status);
  }

  console.log("\n5 · Importar apaga o arquivo, não só marca a data");
  {
    const env = novoEnv();
    await enviar(env);
    env.IMAGENS_BUCKET._arq.has("extracoes/pendente.xlsx") ? ok("arquivo no balde") : nao("não guardou");

    await chamar(env, "POST", "/extracao/importado", { chave: CHAVE });

    const s = await chamar(env, "GET", "/extracao");
    s.dados?.pendente === false ? ok("status passa a dizer que não há pendente") : nao("segue pendente");

    !env.IMAGENS_BUCKET._arq.has("extracoes/pendente.xlsx")
      ? ok("e o ARQUIVO saiu do balde — a tabela de custo não fica esperando quem ache o endereço")
      : nao("o arquivo ficou guardado depois de importado");

    env.DB._extracoes[0].importado_em > 0
      ? ok("a linha no D1 fica, que é o histórico") : nao("perdeu o histórico");

    const depois = await chamar(env, "GET", "/extracao/arquivo", { chave: CHAVE });
    depois.status === 404 ? ok("e baixar depois devolve 404") : nao("ainda baixa (" + depois.status + ")");
  }

  console.log("\n6 · Descartar sem precisar importar");
  {
    const env = novoEnv();
    await enviar(env, "errada.xlsx");

    const sem = await chamar(env, "DELETE", "/extracao");
    sem.status === 401 ? ok("descartar sem chave: 401") : nao("descartou sem chave");

    await chamar(env, "DELETE", "/extracao", { chave: CHAVE });
    const s = await chamar(env, "GET", "/extracao");
    s.dados?.pendente === false && !env.IMAGENS_BUCKET._arq.has("extracoes/pendente.xlsx")
      ? ok("com chave: some do status e do balde") : nao("não descartou");
  }

  console.log("\n7 · Corpo vazio é recusado");
  {
    const env = novoEnv();
    const r = await chamar(env, "POST", "/extracao?nome=x.xlsx",
      { chave: CHAVE, corpo: new Uint8Array(0).buffer, tipo: "application/octet-stream" });
    r.status === 400 ? ok("400") : nao("deu " + r.status);
  }

  console.log("\n8 · Uma pendente por vez");
  {
    const env = novoEnv();
    await enviar(env, "primeira.xlsx");
    await enviar(env, "segunda.xlsx");
    const s = await chamar(env, "GET", "/extracao");
    s.dados.nomeArquivo === "segunda.xlsx"
      ? ok("a segunda é a que vale — sem fila para o painel escolher errado")
      : nao("ficou: " + s.dados.nomeArquivo);
  }

  console.log("\n9 · Sem IMAGENS_KEY no ambiente, ninguém baixa");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB() };
    env.IMAGENS_BUCKET._arq.set("extracoes/pendente.xlsx", { bytes: planilha(), o: {} });
    const r = await chamar(env, "GET", "/extracao/arquivo", { chave: "qualquer" });
    r.status === 401 ? ok("401, e não liberado") : nao("LIBEROU (" + r.status + ")");
  }

  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "tudo passou"));
  process.exit(falhas ? 1 : 0);
})();
