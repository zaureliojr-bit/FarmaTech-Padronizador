/* Exercita as rotas de extração do imagens-proxy com R2 e D1 de mentira.

   O que mais importa aqui não é "funciona" — é que a planilha de custo
   do PDV não sai sem chave, inclusive pela porta das imagens. */
import worker from "./worker.js";

let falhas = 0;
const ok = m => console.log("   ✓", m);
const nao = m => { falhas++; console.log("   ✗", m); };

function fazerBucket() {
  const arq = new Map();
  return {
    _arq: arq,
    async put(k, v, o) { arq.set(k, { bytes: v, o, uploaded: new Date() }); },
    async get(k) {
      const a = arq.get(k);
      if (!a) return null;
      return { body: "(corpo)", httpMetadata: a.o?.httpMetadata, customMetadata: a.o?.customMetadata };
    },
    async head(k) {
      const a = arq.get(k);
      if (!a) return null;
      return {
        size: a.bytes.byteLength ?? a.bytes.length ?? 0,
        httpMetadata: a.o?.httpMetadata,
        customMetadata: a.o?.customMetadata,
        uploaded: a.uploaded
      };
    },
    async delete(k) { arq.delete(k); }
  };
}

const fazerDB = () => ({
  prepare() {
    const s = { bind: () => s, async all() { return { results: [] }; }, async first() { return null; }, async run() { return { meta: {} }; } };
    return s;
  }
});

const CHAVE = "chave-de-teste";
const base = "https://i.exemplo.dev";

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

(async () => {
  console.log("\n1 · Sem extração nenhuma");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    const s = await chamar(env, "GET", "/extracao");
    s.status === 200 && s.dados.pendente === false
      ? ok("o status diz pendente: false") : nao("status: " + s.texto);
    const a = await chamar(env, "GET", "/extracao/arquivo", { chave: CHAVE });
    a.status === 404 ? ok("baixar devolve 404, não erro de servidor") : nao("baixar deu " + a.status);
  }

  console.log("\n2 · Enviar e ver no status");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    const e = await chamar(env, "POST", "/extracao?nome=produtos_extraidos.xlsx",
      { chave: CHAVE, corpo: planilha(), tipo: "application/octet-stream" });
    e.status === 200 ? ok("enviou: " + e.dados.nomeArquivo + " (" + e.dados.tamanho + " bytes)")
      : nao("enviar deu " + e.status + " " + e.texto);

    const s = await chamar(env, "GET", "/extracao");
    s.dados.pendente === true ? ok("o status vê o pendente") : nao("status: " + s.texto);
    s.dados.nomeArquivo === "produtos_extraidos.xlsx" ? ok("com o nome certo") : nao("nome: " + s.dados.nomeArquivo);
    s.dados.tamanho === 5000 ? ok("e o tamanho certo") : nao("tamanho: " + s.dados.tamanho);
    s.dados.enviadoEm > 0 ? ok("e a hora do envio") : nao("enviadoEm: " + s.dados.enviadoEm);

    /* O contrato que o painel publicado espera: pendente, nomeArquivo,
       tamanho, enviadoEm. Mais nada, e nada de menos. */
    const campos = Object.keys(s.dados).sort().join(",");
    campos === "enviadoEm,nomeArquivo,pendente,tamanho"
      ? ok("o status tem exatamente os 4 campos que o painel usa") : nao("campos: " + campos);
  }

  console.log("\n3 · A planilha de custo NÃO sai sem chave");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    await chamar(env, "POST", "/extracao?nome=p.xlsx", { chave: CHAVE, corpo: planilha(), tipo: "application/octet-stream" });

    const sem = await chamar(env, "GET", "/extracao/arquivo");
    sem.status === 401 ? ok("baixar sem chave: 401") : nao("BAIXOU SEM CHAVE (" + sem.status + ")");

    const errada = await chamar(env, "GET", "/extracao/arquivo", { chave: "outra" });
    errada.status === 401 ? ok("com chave errada: 401") : nao("passou com chave errada");

    const com = await chamar(env, "GET", "/extracao/arquivo", { chave: CHAVE });
    com.status === 200 ? ok("com a chave certa: 200") : nao("com chave certa deu " + com.status);
    com.resposta.headers.get("Cache-Control") === "no-store"
      ? ok("e sem cache — dado de custo não fica guardado em proxy") : nao("Cache-Control: " + com.resposta.headers.get("Cache-Control"));
  }

  console.log("\n4 · Nem pela porta das imagens (o furo que eu quase deixei)");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    await chamar(env, "POST", "/extracao?nome=p.xlsx", { chave: CHAVE, corpo: planilha(), tipo: "application/octet-stream" });

    /* A rota curinga GET /:ean serve qualquer chave do balde. Se ela
       não recusasse o prefixo "_", daria a planilha de graça. */
    for (const tentativa of ["/_extracao/pendente", "/_extracao%2Fpendente", "/_extracao/", "/_"]) {
      const r = await chamar(env, "GET", tentativa);
      r.status === 404
        ? ok(`${tentativa} → 404`)
        : nao(`${tentativa} VAZOU (${r.status})`);
    }

    // e a barra dupla, que o worker normaliza, não pode abrir caminho
    const dupla = await chamar(env, "GET", "//_extracao/pendente");
    dupla.status === 404 ? ok("//_extracao/pendente → 404") : nao("barra dupla vazou (" + dupla.status + ")");

    // imagem de verdade continua servindo
    env.IMAGENS_BUCKET._arq.set("7891106000888", { bytes: new Uint8Array(10).buffer, o: { httpMetadata: { contentType: "image/png" } }, uploaded: new Date() });
    const img = await chamar(env, "GET", "/7891106000888");
    img.status === 200 ? ok("e a imagem por EAN continua aberta, como deve") : nao("imagem deu " + img.status);
  }

  console.log("\n5 · Enviar exige chave");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    const r = await chamar(env, "POST", "/extracao?nome=x.xlsx", { corpo: planilha(), tipo: "application/octet-stream" });
    r.status === 401 ? ok("enviar sem chave: 401") : nao("aceitou envio sem chave");
    env.IMAGENS_BUCKET._arq.size === 0 ? ok("e nada foi guardado") : nao("guardou mesmo sem chave");
  }

  console.log("\n6 · Multipart também serve");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    const form = new FormData();
    form.append("arquivo", new Blob([new Uint8Array(1234)]), "do_balcao.xlsx");
    const r = await worker.fetch(new Request(base + "/extracao", {
      method: "POST", headers: { "X-Imagens-Key": CHAVE }, body: form
    }), env);
    const d = await r.json();
    r.status === 200 && d.nomeArquivo === "do_balcao.xlsx"
      ? ok("multipart aceito, nome vindo do arquivo: " + d.nomeArquivo)
      : nao("multipart deu " + r.status + " " + JSON.stringify(d));
    d.tamanho === 1234 ? ok("tamanho certo") : nao("tamanho: " + d.tamanho);
  }

  console.log("\n7 · Nome de arquivo vindo de fora é limpo");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    const casos = [
      ["../../etc/passwd", "passwd"],
      ["C:\\pdv\\saida.xlsx", "saida.xlsx"],
      ["nome com espaço e ç.xlsx", "nome_com_espa_o_e__.xlsx"]
    ];
    for (const [entrada, esperado] of casos) {
      const r = await chamar(env, "POST", "/extracao?nome=" + encodeURIComponent(entrada),
        { chave: CHAVE, corpo: planilha(), tipo: "application/octet-stream" });
      r.dados.nomeArquivo === esperado
        ? ok(`${JSON.stringify(entrada)} → ${r.dados.nomeArquivo}`)
        : nao(`${JSON.stringify(entrada)} virou ${JSON.stringify(r.dados.nomeArquivo)}, esperava ${JSON.stringify(esperado)}`);
    }
    const vazio = await chamar(env, "POST", "/extracao", { chave: CHAVE, corpo: planilha(), tipo: "application/octet-stream" });
    vazio.dados.nomeArquivo === "extracao.xlsx" ? ok("sem nome, cai no padrão") : nao("padrão: " + vazio.dados.nomeArquivo);
  }

  console.log("\n8 · Corpo vazio e tamanho demais");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    const v = await chamar(env, "POST", "/extracao?nome=x.xlsx", { chave: CHAVE, corpo: new Uint8Array(0).buffer, tipo: "application/octet-stream" });
    v.status === 400 ? ok("corpo vazio: 400") : nao("corpo vazio deu " + v.status);
    const g = await chamar(env, "POST", "/extracao?nome=x.xlsx", { chave: CHAVE, corpo: new Uint8Array(21 * 1024 * 1024).buffer, tipo: "application/octet-stream" });
    g.status === 413 ? ok("acima de 20 MB: 413") : nao("grande deu " + g.status);
  }

  console.log("\n9 · Importada apaga, e descartar também");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    await chamar(env, "POST", "/extracao?nome=p.xlsx", { chave: CHAVE, corpo: planilha(), tipo: "application/octet-stream" });

    const semChave = await chamar(env, "POST", "/extracao/importado");
    semChave.status === 401 ? ok("marcar importada sem chave: 401") : nao("deu " + semChave.status);

    await chamar(env, "POST", "/extracao/importado", { chave: CHAVE });
    const depois = await chamar(env, "GET", "/extracao");
    depois.dados.pendente === false
      ? ok("depois de importada, não há pendente") : nao("ficou pendente");
    env.IMAGENS_BUCKET._arq.size === 0
      ? ok("e o arquivo saiu do balde — a tabela de custo não fica esperando quem ache o endereço")
      : nao("o arquivo ficou no balde");

    await chamar(env, "POST", "/extracao?nome=p2.xlsx", { chave: CHAVE, corpo: planilha(), tipo: "application/octet-stream" });
    const delSem = await chamar(env, "DELETE", "/extracao");
    delSem.status === 401 ? ok("descartar sem chave: 401") : nao("descartou sem chave");
    await chamar(env, "DELETE", "/extracao", { chave: CHAVE });
    env.IMAGENS_BUCKET._arq.size === 0 ? ok("com chave, descarta") : nao("não descartou");
  }

  console.log("\n10 · Uma pendente por vez");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    await chamar(env, "POST", "/extracao?nome=primeira.xlsx", { chave: CHAVE, corpo: new Uint8Array(100).buffer, tipo: "application/octet-stream" });
    await chamar(env, "POST", "/extracao?nome=segunda.xlsx", { chave: CHAVE, corpo: new Uint8Array(200).buffer, tipo: "application/octet-stream" });
    const s = await chamar(env, "GET", "/extracao");
    s.dados.nomeArquivo === "segunda.xlsx" && s.dados.tamanho === 200
      ? ok("a segunda substitui a primeira — sem fila para o painel escolher errado")
      : nao("ficou: " + JSON.stringify(s.dados));
  }

  console.log("\n11 · Sem IMAGENS_KEY no ambiente, ninguém baixa");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB() };   // sem a chave
    env.IMAGENS_BUCKET._arq.set("_extracao/pendente", { bytes: planilha(), o: {}, uploaded: new Date() });
    const r = await chamar(env, "GET", "/extracao/arquivo", { chave: "qualquer" });
    r.status === 401 ? ok("sem chave configurada: 401, e não liberado") : nao("LIBEROU (" + r.status + ")");
  }

  console.log("\n12 · CORS anuncia DELETE");
  {
    const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };
    const r = await worker.fetch(new Request(base + "/extracao", { method: "OPTIONS" }), env);
    const m = r.headers.get("Access-Control-Allow-Methods") || "";
    /DELETE/.test(m) ? ok("Allow-Methods: " + m) : nao("sem DELETE: " + m);
  }

  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "tudo passou"));
  process.exit(falhas ? 1 : 0);
})();
