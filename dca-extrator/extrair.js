// Varre o catálogo público da DCA Distribuidor via sitemap.xml (lista
// de páginas que o próprio site publica pra buscadores - achada
// olhando https://www.dcadistribuidor.com.br/sitemap.xml) e gera uma
// planilha pronta pra subir como "Lista da distribuidora" no
// padronizador.
//
// Isso é engenharia reversa da estrutura pública do site da DCA, não
// uma API oficial - pode parar de funcionar se eles mudarem o HTML ou
// o sitemap, sem aviso nenhum. Roda de vez em quando (não precisa de
// agendamento diário como o extrator do Firebird), com pausa entre os
// pedidos pra não sobrecarregar o site deles.
//
// Diferente da DPCNET (uma chamada só trazia várias páginas de
// produtos de uma vez), aqui cada produto só tem EAN na própria
// página dele - por isso o script faz um pedido por produto. Catálogo
// grande = demora mais (é o preço de não ter uma API de busca em
// lote). Uso: npm install && npm run extrair

const XLSX = require("xlsx");

const SITEMAP_INDICE = "https://www.dcadistribuidor.com.br/sitemap.xml";

const PAUSA_ENTRE_PEDIDOS_MS = 250;

const SAIDA_ARQUIVO = process.env.SAIDA_ARQUIVO || "distribuidora_dca.xlsx";

const CABECALHOS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

function pausa(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buscarTexto(url) {

    const resposta = await fetch(url, { headers: CABECALHOS });

    if (!resposta.ok) {
        throw new Error(`HTTP ${resposta.status} em ${url}`);
    }

    return resposta.text();

}

// Casa só a tag exata: "<loc>" não casa "<image:loc>" (é outra tag),
// o que evita misturar link de página com link de imagem.
function extrairTodos(xml, tag) {

    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
    const valores = [];
    let m;

    while ((m = regex.exec(xml)) !== null) {
        valores.push(m[1].trim());
    }

    return valores;

}

async function listarSitemapsDeProdutos() {

    const indice = await buscarTexto(SITEMAP_INDICE);
    const todos = extrairTodos(indice, "loc");

    return todos.filter((url) => /sitemap-produtos-\d+\.xml$/.test(url));

}

async function listarProdutosDoSitemap(urlSitemap) {

    const xml = await buscarTexto(urlSitemap);

    // Cada <url> traz um <loc> (página do produto) e, dentro de
    // <image:image>, um <image:loc> (imagem) - separa por bloco <url>
    // pra não misturar imagem de um produto com link de outro.
    const blocos = xml.split("<url>").slice(1);

    return blocos
        .map((bloco) => {
            const [link] = extrairTodos(bloco, "loc");
            const [imagem] = extrairTodos(bloco, "image:loc");
            return { link, imagem: imagem || "" };
        })
        .filter((item) => item.link);

}

async function extrairDadosDoProduto(urlProduto) {

    const html = await buscarTexto(urlProduto);

    const nome = (html.match(/<h1 class="product__name">([\s\S]*?)<\/h1>/) || [])[1];
    const codigo = (html.match(/class="product__features--codigo">Código:\s*([^<]+)</) || [])[1];
    const ean = (html.match(/class="product__features--ean">Código de Barras do Produto:\s*([^<]+)</) || [])[1];

    return {
        nome: nome ? nome.trim() : "",
        codigo: codigo ? codigo.trim() : "",
        ean: ean ? ean.trim() : ""
    };

}

async function main() {

    console.log("Buscando lista de sitemaps de produtos...");
    const sitemaps = await listarSitemapsDeProdutos();

    if (!sitemaps.length) {
        console.error("Não encontrei nenhum sitemap-produtos-N.xml no sitemap.xml - confere se o site mudou a estrutura (abre o sitemap.xml no navegador).");
        process.exit(1);
    }

    console.log(`${sitemaps.length} sitemap(s) de produtos encontrados.`);

    const produtosBrutos = [];

    for (const urlSitemap of sitemaps) {

        process.stdout.write(`Lendo ${urlSitemap}... `);
        const lista = await listarProdutosDoSitemap(urlSitemap);
        console.log(`${lista.length} produtos.`);

        produtosBrutos.push(...lista);

        await pausa(PAUSA_ENTRE_PEDIDOS_MS);

    }

    if (!produtosBrutos.length) {
        console.error("Nenhum produto encontrado nos sitemaps.");
        process.exit(1);
    }

    console.log(`\nTotal de ${produtosBrutos.length} produtos nos sitemaps - buscando EAN/descrição de cada um agora (demora, tem pausa entre os pedidos pra não sobrecarregar o site deles).\n`);

    const vistos = new Map(); // ean -> { descricao, codigo, imagem }
    let processados = 0;

    for (const produto of produtosBrutos) {

        processados++;

        try {

            const dados = await extrairDadosDoProduto(produto.link);

            if (dados.ean && dados.nome) {
                vistos.set(dados.ean, {
                    descricao: dados.nome,
                    codigo: dados.codigo,
                    imagem: produto.imagem
                });
            }

        } catch (erro) {
            console.warn(`  (ignorado) erro em ${produto.link}: ${erro.message}`);
        }

        if (processados % 50 === 0 || processados === produtosBrutos.length) {
            console.log(`  ${processados}/${produtosBrutos.length} processados (${vistos.size} com EAN válido)...`);
        }

        await pausa(PAUSA_ENTRE_PEDIDOS_MS);

    }

    if (!vistos.size) {
        console.warn("Nenhum produto com EAN válido encontrado - confere se o HTML da página de produto ainda tem essa estrutura (abre uma página de produto, Ctrl+U, procura por \"ean\").");
        process.exit(0);
    }

    const planilha = [...vistos.entries()].map(([ean, info]) => ({
        "Código": info.codigo,
        "EAN": ean,
        "Descrição": info.descricao,
        "Imagem": info.imagem
    }));

    const livro = XLSX.utils.book_new();
    const aba = XLSX.utils.json_to_sheet(planilha);

    XLSX.utils.book_append_sheet(livro, aba, "DISTRIBUIDORA");

    XLSX.writeFile(livro, SAIDA_ARQUIVO);

    console.log(`\nPronto! ${vistos.size} produtos únicos exportados pra "${SAIDA_ARQUIVO}".`);
    console.log("Já pode subir esse arquivo na caixa \"Lista da distribuidora\" do padronizador.");

}

main().catch((erro) => {
    console.error("\nErro durante a extração:", erro.message);
    console.error("Se for erro de rede/HTTP, o site pode ter mudado algo - confere de novo pelo DevTools/sitemap.");
    process.exit(1);
});
