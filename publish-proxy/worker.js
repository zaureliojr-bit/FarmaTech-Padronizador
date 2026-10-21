// Proxy de publicação (Cloudflare Worker)
//
// Recebe o catálogo já no formato que o site "Drogaria Mais Barato"
// espera e sobrescreve produtos.json no repositório GitHub
// zaureliojr-bit/Produtos, usando um token pessoal (PAT) guardado como
// secret - nunca exposto ao navegador.
//
// Uso: POST https://<seu-worker>.workers.dev/
//      Header: X-Publish-Key: <chave>
//      Body: { "produtos": [...] }

const REPO_OWNER = "zaureliojr-bit";
const REPO_NAME = "Produtos";
const ARQUIVO = "produtos.json";
const BRANCH = "main";

/* UM CATÁLOGO POR FARMÁCIA

   Até aqui era um arquivo só, e cada publicação sobrescrevia o catálogo
   do site inteiro. Com mais de uma farmácia isso é o fim da linha: a
   filial nova mostraria o preço e o estoque da primeira, e publicar pela
   segunda apagaria o catálogo da primeira.

     produtos.json                 a farmácia que já existia
     produtos-<slug>.json          cada filial nova

   A primeira continua no nome antigo de propósito: o site dela aponta
   para lá, o endereço está em cache em navegador de cliente, e mover
   arquivo para ganhar simetria é trocar risco por estética.

   O SLUG VEM DO PORTEIRO, NUNCA DO NAVEGADOR

   Quem chama esta rota é o pedidos-proxy, que conferiu a senha e sabe
   qual farmácia está autenticada. O slug chega daquele worker — e por
   isso o padronizador não precisou mudar nenhuma linha para passar a
   publicar no catálogo certo.

   Mesmo assim ele é validado aqui. Este valor vira NOME DE ARQUIVO numa
   chamada à API do GitHub: um "../" dentro dele escreveria fora da
   pasta, e confiar em quem chama é exatamente o que não se faz com
   caminho de arquivo. */
function arquivoDaLoja(slug) {

    const limpo = String(slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);

    return limpo ? `produtos-${limpo}.json` : ARQUIVO;

}

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Publish-Key"
};

function jsonResponse(corpo, status = 200) {

    return new Response(JSON.stringify(corpo), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });

}

// btoa() sozinho quebra com acentos (fora do intervalo Latin1) - passa
// primeiro pelos bytes UTF-8 pra suportar descrição/marca em português.
function paraBase64Utf8(texto) {

    const bytes = new TextEncoder().encode(texto);

    let binario = "";
    bytes.forEach((b) => { binario += String.fromCharCode(b); });

    return btoa(binario);

}

// Caminho inverso - o conteúdo que a Contents API do GitHub devolve.
function deBase64Utf8(base64) {

    const binario = atob(base64.replace(/\n/g, ""));

    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));

    return new TextDecoder().decode(bytes);

}

// Junta o catálogo novo com o que já estava publicado, pelo EAN: quem
// veio na planilha atual substitui a versão antiga (preço/estoque
// atualizado); quem não veio, permanece como estava - só o modo
// "substituir" apaga o que não veio.
function mesclarPorEan(existentes, novos) {

    const porEan = new Map(existentes.map((produto) => [produto.ean, produto]));

    novos.forEach((produto) => porEan.set(produto.ean, produto));

    return [...porEan.values()];

}

// Pensado pra planilha só dos itens COM estoque: quem vem na planilha
// atualiza normal; quem já estava publicado mas não veio agora fica
// com estoque zerado e marcado "encomenda" (site pode oferecer
// encomenda em vez de deixar comprar), sem sumir do catálogo como o
// modo "substituir" faria. Quando o produto reaparecer numa planilha
// futura, o "encomenda" some sozinho - o objeto novo vem por cima e
// não tem esse campo.
function mesclarMarcandoAusentesSemEstoque(existentes, novos) {

    const eansNovos = new Set(novos.map((produto) => produto.ean));

    const porEan = new Map(existentes.map((produto) => {

        if (eansNovos.has(produto.ean) || produto.estoque <= 0) {
            return [produto.ean, produto];
        }

        return [produto.ean, { ...produto, estoque: 0, encomenda: true }];

    }));

    novos.forEach((produto) => porEan.set(produto.ean, produto));

    return [...porEan.values()];

}

export default {

    async fetch(request, env) {

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        if (request.method !== "POST") {
            return jsonResponse({ erro: "Método não permitido." }, 405);
        }

        if (!env.PUBLISH_KEY || request.headers.get("X-Publish-Key") !== env.PUBLISH_KEY) {
            return jsonResponse({ erro: "Não autorizado." }, 401);
        }

        let corpo;

        try {
            corpo = await request.json();
        } catch {
            return jsonResponse({ erro: "JSON inválido." }, 400);
        }

        const produtos = corpo?.produtos;

        // "mesclar" (padrão): atualiza/acrescenta pelo EAN, mantém quem
        // não veio na planilha atual do jeito que estava. "encomenda":
        // igual o mesclar, mas quem não veio fica com estoque zerado e
        // marcado pra oferecer encomenda - pra planilha só dos itens com
        // estoque. "substituir": apaga tudo que não estiver na lista
        // enviada - só faz sentido numa reimportação do catálogo completo.
        // "remover": a lista enviada não é o catálogo, é quem SAI dele.
        // Serve ao botão "Apagar" do painel, que precisa tirar o item do
        // site agora - taxa de entrega cadastrada como produto, item de
        // teste, cadastro duplicado. Publicar a lista inteira só para
        // remover um item seria mandar 3 MB e arriscar o catálogo
        // inteiro num clique de limpeza.
        const modo = ["substituir", "encomenda", "remover"].includes(corpo?.modo) ? corpo.modo : "mesclar";

        if (!Array.isArray(produtos) || !produtos.length) {
            return jsonResponse({ erro: "Lista de produtos vazia ou inválida." }, 400);
        }

        const arquivo = arquivoDaLoja(new URL(request.url).searchParams.get("loja"));

        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${arquivo}`;

        const headersGitHub = {
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "User-Agent": "farmatech-publish-proxy"
        };

        // Precisa do conteúdo atual (pra mesclar) e do sha (pra poder
        // sobrescrever) - as duas coisas vêm da mesma chamada.
        const atual = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: headersGitHub });

        if (!atual.ok && atual.status !== 404) {
            const erro = await atual.text();
            return jsonResponse({ erro: `Falha ao ler arquivo atual: ${erro}` }, 502);
        }

        let shaAtual;
        let produtosExistentes = [];

        if (atual.ok) {

            const dadosAtual = await atual.json();

            shaAtual = dadosAtual.sha;

            try {

                const jsonAtual = JSON.parse(deBase64Utf8(dadosAtual.content));

                if (Array.isArray(jsonAtual.produtos)) produtosExistentes = jsonAtual.produtos;

            } catch {

                // produtos.json corrompido ou em formato inesperado - segue
                // como se não houvesse nada publicado ainda, em vez de falhar.

            }

        }

        /* Remover é destrutivo e não tem volta pelo painel, então ele é o
           único modo que EXIGE ter lido o arquivo atual.

           Sem esta linha, uma falha de leitura (GitHub fora do ar, token
           vencido, arquivo renomeado) cairia no caminho normal com
           produtosExistentes vazio, e o "apagar um produto" publicaria um
           catálogo vazio - a loja inteira fora do ar por um clique que
           pedia para tirar uma taxa de entrega da vitrine. */
        if (modo === "remover" && !atual.ok) {
            return jsonResponse(
                { erro: "Não consegui ler o catálogo atual, então não apaguei nada." }, 502);
        }

        let produtosFinais;

        if (modo === "remover") {

            /* Pelos dois, EAN e código: o painel tem os dois à mão, e há
               produto no catálogo com EAN vazio (item interno da loja),
               que só o código identifica. */
            const eans = new Set(produtos
                .map((p) => String(p?.ean ?? "").trim()).filter(Boolean));

            const codigos = new Set(produtos
                .map((p) => String(p?.codigo ?? "").trim()).filter(Boolean));

            produtosFinais = produtosExistentes.filter((p) =>
                !(eans.size && eans.has(String(p?.ean ?? "").trim())) &&
                !(codigos.size && codigos.has(String(p?.codigo ?? "").trim())));

            /* Esvaziar o catálogo nunca é o que um "apagar produto"
               quis dizer. Se a conta deu nisso, alguma coisa está
               errada - e é melhor não publicar. */
            if (produtosExistentes.length && !produtosFinais.length) {
                return jsonResponse(
                    { erro: "Isso apagaria o catálogo inteiro. Não publiquei." }, 400);
            }

        } else if (modo === "substituir") {
            produtosFinais = produtos;
        } else if (modo === "encomenda") {
            produtosFinais = mesclarMarcandoAusentesSemEstoque(produtosExistentes, produtos);
        } else {
            produtosFinais = mesclarPorEan(produtosExistentes, produtos);
        }

        const conteudoJson = JSON.stringify({ produtos: produtosFinais }, null, 2);

        const resposta = await fetch(apiUrl, {

            method: "PUT",
            headers: { ...headersGitHub, "Content-Type": "application/json" },

            body: JSON.stringify({
                /* O nome do arquivo vai na mensagem do commit: com uma
                   farmácia só dava para saber qual catálogo mudou pelo
                   contexto, com dez não dá. */
                message: (modo === "substituir"
                    ? `Publicar catálogo completo (${produtos.length} produtos)`
                    : modo === "remover"
                        ? `Apagar ${produtos.length} produto(s)`
                        : `Atualizar ${produtos.length} produto(s)`) + ` em ${arquivo} via FarmaTech Padronizador`,
                content: paraBase64Utf8(conteudoJson),
                branch: BRANCH,
                ...(shaAtual ? { sha: shaAtual } : {})
            })

        });

        if (!resposta.ok) {
            const erro = await resposta.text();
            return jsonResponse({ erro: `Falha ao publicar: ${erro}` }, 502);
        }

        /* Devolve em QUAL arquivo publicou. Sem isso, "publicou com
           sucesso" não diz se foi no catálogo da farmácia certa — e esse
           é o erro que ninguém percebe até um cliente estranhar o preço. */
        return jsonResponse({
            ok: true, total: produtosFinais.length, enviados: produtos.length, modo, arquivo
        });

    }

};
