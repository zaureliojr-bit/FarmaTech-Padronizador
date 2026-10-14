/* O porteiro do catálogo: o navegador manda a senha do painel, este
   worker troca pela chave do destino.

   O que precisa ficar provado:
     - sem a senha do painel, nada passa
     - a chave do destino NUNCA volta para quem chamou
     - a senha do painel NUNCA chega ao destino
     - o corpo e o status atravessam inteiros nos dois sentidos */
import worker from "./worker.js";

let falhas = 0;
const ok = m => console.log("   ✓", m);
const nao = m => { falhas++; console.log("   ✗", m); };

const CHAVE_PAINEL = "senha-do-painel";
const CHAVE_IMAGENS = "chave-secreta-das-imagens";
const CHAVE_PUBLISH = "chave-secreta-de-publicar";
const base = "https://w.exemplo.dev";

/* D1 só o bastante para o portão (tentativas) não estourar. */
const fazerDB = () => ({
  prepare() {
    const s = { bind: () => s, async all() { return { results: [] }; }, async first() { return null; }, async run() { return { meta: {} }; } };
    return s;
  }
});

/* Finge ser o imagens-proxy e o publish-proxy, e guarda tudo que
   recebeu — é assim que se confere o que foi carimbado. */
function interceptarFetch() {
  const recebidas = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    const corpo = opcoes.body ? new TextDecoder().decode(opcoes.body) : "";
    recebidas.push({
      url: String(url),
      metodo: opcoes.method,
      cabecalhos: { ...opcoes.headers },
      corpo
    });
    if (String(url).includes("/extracao/arquivo")) {
      return new Response("conteudo-da-planilha", {
        status: 200,
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      });
    }
    if (String(url).includes("falha")) {
      return new Response(JSON.stringify({ erro: "o destino recusou" }), {
        status: 422, headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ sucesso: true, eco: corpo.slice(0, 40) }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };
  return recebidas;
}

/* Binding de serviço de mentira. Registra o que recebeu, para o teste
   provar que a chamada foi POR ELE e não por fetch() — a Cloudflare
   recusa worker chamando worker da mesma zona por HTTP (erro 1042). */
function fazerServico(registro, nome) {
  return {
    async fetch(pedido) {
      const corpo = pedido.method === "GET" ? "" : await pedido.text();
      registro.push({
        via: nome,
        url: pedido.url,
        metodo: pedido.method,
        cabecalhos: Object.fromEntries(pedido.headers),
        corpo
      });
      if (pedido.url.includes("/extracao/arquivo")) {
        return new Response("conteudo-da-planilha", {
          status: 200,
          headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
        });
      }
      if (pedido.url.includes("falha")) {
        return new Response(JSON.stringify({ erro: "o destino recusou" }), {
          status: 422, headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ sucesso: true }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }
  };
}

function fazerEnv(extra = {}) {
  return {
    DB: fazerDB(),
    PAINEL_KEY: CHAVE_PAINEL,
    IMAGENS_PROXY_URL: "https://imagens.exemplo.dev",
    IMAGENS_KEY: CHAVE_IMAGENS,
    PUBLISH_WORKER_URL: "https://publicar.exemplo.dev",
    PUBLISH_KEY: CHAVE_PUBLISH,
    ...extra
  };
}

async function chamar(env, metodo, rota, { corpo, senha, tipo } = {}) {
  const headers = {};
  if (senha) headers["X-Painel-Key"] = senha;
  if (tipo) headers["Content-Type"] = tipo;
  headers["CF-Connecting-IP"] = "203.0.113.1";
  const init = { method: metodo, headers };
  if (corpo !== undefined) init.body = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  const r = await worker.fetch(new Request(base + rota, init), env);
  const texto = await r.text();
  let dados = null; try { dados = JSON.parse(texto); } catch {}
  return { status: r.status, dados, texto, resposta: r };
}

const ROTAS = [
  ["POST", "/catalogo/imagem", { ean: "789", url: "https://x/y.png", origem: "cosmos" }],
  ["POST", "/catalogo/correcao", { ean: "789", classe: "SIMILAR" }],
  ["POST", "/catalogo/publicar", { produtos: [{ ean: "789" }], modo: "mesclar" }],
  ["GET", "/catalogo/extracao", undefined],
  ["GET", "/catalogo/extracao/arquivo", undefined],
  ["POST", "/catalogo/extracao/importado", undefined],
  ["POST", "/catalogo/extracao/descartar", undefined]
];

(async () => {

  console.log("\n1 · Sem a senha do painel, nada passa");
  {
    const recebidas = interceptarFetch();
    const env = fazerEnv();
    for (const [metodo, rota, corpo] of ROTAS) {
      const r = await chamar(env, metodo, rota, { corpo, tipo: "application/json" });
      if (r.status !== 401) nao(`${metodo} ${rota} devia dar 401, deu ${r.status}`);
    }
    ok(`as ${ROTAS.length} rotas de catálogo exigem a senha`);
    recebidas.length === 0
      ? ok("e nenhuma chamada chegou ao destino — barrou antes") : nao(recebidas.length + " vazaram para o destino");
  }

  console.log("\n2 · Com a senha certa, repassa carimbando a chave do destino");
  {
    const recebidas = interceptarFetch();
    const env = fazerEnv();

    const img = await chamar(env, "POST", "/catalogo/imagem",
      { senha: CHAVE_PAINEL, corpo: { ean: "789", url: "https://x/y.png", origem: "cosmos" }, tipo: "application/json" });
    img.status === 200 ? ok("imagem: 200") : nao("imagem deu " + img.status + " " + img.texto);

    const ida = recebidas.at(-1);
    ida.url === "https://imagens.exemplo.dev/" ? ok("foi para o imagens-proxy: " + ida.url) : nao("foi para " + ida.url);
    ida.cabecalhos["X-Imagens-Key"] === CHAVE_IMAGENS ? ok("com a chave das imagens carimbada") : nao("sem a chave");
    JSON.parse(ida.corpo).ean === "789" ? ok("e o corpo chegou inteiro") : nao("corpo: " + ida.corpo);

    const cor = await chamar(env, "POST", "/catalogo/correcao",
      { senha: CHAVE_PAINEL, corpo: { ean: "789", classe: "SIMILAR" }, tipo: "application/json" });
    recebidas.at(-1).url === "https://imagens.exemplo.dev/correcoes" && cor.status === 200
      ? ok("correção: vai para /correcoes") : nao("correção foi para " + recebidas.at(-1).url);

    const pub = await chamar(env, "POST", "/catalogo/publicar",
      { senha: CHAVE_PAINEL, corpo: { produtos: [{ ean: "789" }], modo: "mesclar" }, tipo: "application/json" });
    const idaPub = recebidas.at(-1);
    pub.status === 200 && idaPub.url === "https://publicar.exemplo.dev/"
      ? ok("publicar: vai para o publish-proxy") : nao("publicar foi para " + idaPub.url);
    idaPub.cabecalhos["X-Publish-Key"] === CHAVE_PUBLISH ? ok("com a chave de publicação") : nao("sem a chave de publicação");
  }

  console.log("\n3 · A senha do painel NÃO vaza para o destino");
  {
    const recebidas = interceptarFetch();
    const env = fazerEnv();
    for (const [metodo, rota, corpo] of ROTAS) {
      await chamar(env, metodo, rota, { senha: CHAVE_PAINEL, corpo, tipo: "application/json" });
    }
    const vazou = recebidas.filter(r =>
      Object.keys(r.cabecalhos).some(k => k.toLowerCase() === "x-painel-key") ||
      JSON.stringify(r).includes(CHAVE_PAINEL));
    !vazou.length
      ? ok("nenhuma das 7 chamadas levou a senha do painel adiante")
      : nao(vazou.length + " levaram a senha do painel ao destino");

    /* Cada destino só pode receber a SUA chave. O imagens-proxy não tem
       de saber a de publicação, nem o contrário. */
    const trocadas = recebidas.filter(r =>
      (r.url.includes("imagens") && JSON.stringify(r.cabecalhos).includes(CHAVE_PUBLISH)) ||
      (r.url.includes("publicar") && JSON.stringify(r.cabecalhos).includes(CHAVE_IMAGENS)));
    !trocadas.length ? ok("e cada destino recebeu só a chave dele") : nao("chave cruzada em " + trocadas.length);
  }

  console.log("\n4 · A chave do destino NUNCA volta para o navegador");
  {
    interceptarFetch();
    const env = fazerEnv();
    for (const [metodo, rota, corpo] of ROTAS) {
      const r = await chamar(env, metodo, rota, { senha: CHAVE_PAINEL, corpo, tipo: "application/json" });
      const tudo = r.texto + JSON.stringify([...r.resposta.headers]);
      if (tudo.includes(CHAVE_IMAGENS) || tudo.includes(CHAVE_PUBLISH)) {
        nao(`${rota} devolveu uma chave secreta ao navegador`);
      }
    }
    ok("nenhuma resposta traz a chave do destino, nem no corpo nem nos cabeçalhos");
  }

  console.log("\n5 · O erro do destino chega inteiro, sem virar 500");
  {
    interceptarFetch();
    const env = fazerEnv({ IMAGENS_PROXY_URL: "https://imagens.exemplo.dev/falha" });
    const r = await chamar(env, "POST", "/catalogo/imagem",
      { senha: CHAVE_PAINEL, corpo: { ean: "1" }, tipo: "application/json" });
    r.status === 422 ? ok("status do destino preservado: 422") : nao("virou " + r.status);
    r.dados?.erro === "o destino recusou" ? ok("e a mensagem dele também") : nao("mensagem: " + r.texto);
  }

  console.log("\n6 · Sem configurar, avisa em vez de quebrar");
  {
    interceptarFetch();
    const semNada = fazerEnv({ IMAGENS_PROXY_URL: "", IMAGENS_KEY: "" });
    const r = await chamar(semNada, "POST", "/catalogo/imagem",
      { senha: CHAVE_PAINEL, corpo: { ean: "1" }, tipo: "application/json" });
    r.status === 501 ? ok("501, que é configuração faltando e não defeito") : nao("deu " + r.status);
    /Cloudflare/.test(r.dados?.erro || "") ? ok("e diz onde resolver") : nao("mensagem: " + r.texto);

    const soSemChave = fazerEnv({ PUBLISH_KEY: "" });
    const p = await chamar(soSemChave, "POST", "/catalogo/publicar",
      { senha: CHAVE_PAINEL, corpo: { produtos: [] }, tipo: "application/json" });
    p.status === 501 ? ok("vale para a URL e para a chave") : nao("sem chave deu " + p.status);
  }

  console.log("\n7 · O arquivo da extração atravessa");
  {
    interceptarFetch();
    const env = fazerEnv();
    const r = await chamar(env, "GET", "/catalogo/extracao/arquivo", { senha: CHAVE_PAINEL });
    r.status === 200 ? ok("200") : nao("deu " + r.status);
    r.texto === "conteudo-da-planilha" ? ok("conteúdo intacto") : nao("conteúdo: " + r.texto.slice(0, 40));
    /spreadsheetml/.test(r.resposta.headers.get("Content-Type") || "")
      ? ok("com o tipo de planilha preservado") : nao("tipo: " + r.resposta.headers.get("Content-Type"));
    r.resposta.headers.get("Cache-Control") === "no-store"
      ? ok("e sem cache — é dado de custo") : nao("Cache-Control: " + r.resposta.headers.get("Cache-Control"));
  }

  console.log("\n8 · Descartar vira DELETE lá na frente");
  {
    const recebidas = interceptarFetch();
    const env = fazerEnv();
    await chamar(env, "POST", "/catalogo/extracao/descartar", { senha: CHAVE_PAINEL });
    const ida = recebidas.at(-1);
    ida.metodo === "DELETE" && ida.url === "https://imagens.exemplo.dev/extracao"
      ? ok("POST /catalogo/extracao/descartar → DELETE /extracao")
      : nao(`virou ${ida.metodo} ${ida.url}`);
  }

  console.log("\n9 · O limite de tentativas também vale aqui");
  {
    interceptarFetch();
    /* Reaproveita o D1 de mentira do teste do painel: se o portão vale
       para /fila, vale para /catalogo — é o mesmo portão. O que importa
       provar é que estas rotas estão DEPOIS dele. */
    const bloqueado = {
      ...fazerEnv(),
      DB: {
        prepare(sql) {
          const s = {
            bind: () => s,
            async first() {
              if (/tentativas_painel/.test(sql)) {
                return { erros: 9, ultimo: Date.now(), bloqueado_ate: Date.now() + 120000 };
              }
              return null;
            },
            async all() { return { results: [] }; },
            async run() { return { meta: {} }; }
          };
          return s;
        }
      }
    };
    for (const [metodo, rota, corpo] of ROTAS) {
      const r = await chamar(bloqueado, metodo, rota, { senha: CHAVE_PAINEL, corpo, tipo: "application/json" });
      if (r.status !== 429) nao(`${rota} devia dar 429 com o IP bloqueado, deu ${r.status}`);
    }
    ok("IP bloqueado: as 7 rotas respondem 429, mesmo com a senha certa");
  }

  console.log("\n10 · Corpo grande demais é recusado antes de sair");
  {
    const recebidas = interceptarFetch();
    const env = fazerEnv();
    const enorme = "x".repeat(26 * 1024 * 1024);
    const r = await chamar(env, "POST", "/catalogo/publicar",
      { senha: CHAVE_PAINEL, corpo: enorme, tipo: "application/json" });
    r.status === 413 ? ok("413") : nao("deu " + r.status);
    !recebidas.length ? ok("e não foi encaminhado") : nao("mandou assim mesmo");
  }

  console.log("\n11 · Vai pelo binding de serviço, não por fetch()");
  {
    /* A Cloudflare recusa um Worker chamar outro Worker da mesma zona
       por HTTP: 404 com "error code: 1042", que parece rota inexistente.
       Esta seção existe porque esse bug chegou a produção e custou uma
       hora de caça no lugar errado. */
    const porFetch = interceptarFetch();
    const porBinding = [];
    const env = {
      ...fazerEnv(),
      IMAGENS_SERVICE: fazerServico(porBinding, "imagens"),
      PUBLISH_SERVICE: fazerServico(porBinding, "publicar")
    };

    for (const [metodo, rota, corpo] of ROTAS) {
      await chamar(env, metodo, rota, { senha: CHAVE_PAINEL, corpo, tipo: "application/json" });
    }

    porBinding.length === ROTAS.length
      ? ok(`as ${ROTAS.length} chamadas foram pelo binding`)
      : nao(`só ${porBinding.length} de ${ROTAS.length} foram pelo binding`);

    porFetch.length === 0
      ? ok("e nenhuma saiu por fetch() — é isso que a Cloudflare recusa")
      : nao(`${porFetch.length} saíram por fetch() e levariam 1042 em produção`);

    porBinding.every(r => r.cabecalhos["x-imagens-key"] || r.cabecalhos["x-publish-key"])
      ? ok("a chave do destino continua sendo carimbada") : nao("alguma foi sem chave");

    porBinding.some(r => r.via === "imagens") && porBinding.some(r => r.via === "publicar")
      ? ok("cada rota foi para o serviço certo") : nao("alguma foi para o serviço errado");
  }

  console.log("\n12 · Sem binding, ainda funciona por fetch (teste e destino de fora)");
  {
    const porFetch = interceptarFetch();
    const env = fazerEnv();   // sem IMAGENS_SERVICE nem PUBLISH_SERVICE
    const r = await chamar(env, "POST", "/catalogo/imagem",
      { senha: CHAVE_PAINEL, corpo: { ean: "1" }, tipo: "application/json" });
    r.status === 200 && porFetch.length === 1
      ? ok("cai no fetch() como reserva, sem quebrar") : nao("reserva falhou: " + r.status);
  }

  console.log("\n13 · As rotas de sempre continuam de pé");
  {
    interceptarFetch();
    const env = fazerEnv();
    for (const rota of ["/banners", "/promocoes", "/encarte"]) {
      const r = await chamar(env, "GET", rota);
      r.status === 200 ? ok(`${rota} segue pública`) : nao(`${rota} deu ${r.status}`);
    }
    const semSenha = await chamar(env, "GET", "/fila");
    semSenha.status === 401 ? ok("/fila segue pedindo senha") : nao("/fila deu " + semSenha.status);
    const inventada = await chamar(env, "GET", "/catalogo/inventada", { senha: CHAVE_PAINEL });
    inventada.status === 404 ? ok("rota de catálogo inventada: 404") : nao("deu " + inventada.status);
  }

  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "tudo passou"));
  process.exit(falhas ? 1 : 0);
})();
