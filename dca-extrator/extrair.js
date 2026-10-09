// Varre o catálogo público da DCA Distribuidor via sitemap.xml (lista
// de páginas que o próprio site publica pra buscadores) e gera uma
// planilha pronta pra subir como "Lista da distribuidora" no
// padronizador.
//
// Isso é engenharia reversa da estrutura pública do site da DCA, não
// uma API oficial - pode parar de funcionar se eles mudarem o HTML,
// o sitemap, ou a proteção contra acesso automatizado, sem aviso
// nenhum. Roda de vez em quando, com pausa entre os pedidos pra não
// sobrecarregar o site deles.
//
// Diferente da DPCNET (uma chamada só trazia vários produtos de uma
// vez) e diferente de uma versão mais simples deste mesmo script: o
// site da DCA bloqueia pedidos HTTP "crus" (sem navegador de verdade)
// - um fetch() simples é redirecionado pra home mesmo com cookie e
// cabeçalhos de navegador. Por isso aqui a extração usa um navegador
// automatizado (Playwright/Chromium) pra abrir cada página de produto
// de verdade, o que é bem mais lento.
//
// Uso:
//   1. npm install (já baixa o Chromium automaticamente, ~300MB)
//   2. npm run extrair
//
// Variáveis de ambiente opcionais:
//   LIMITE=30      - processa só os N primeiros produtos (pra testar
//                     antes de rodar o catálogo inteiro, que pode
//                     levar várias horas)
//   HEADLESS=false - abre o navegador visível (útil pra ver o que tá
//                     acontecendo quando algo não funciona). Padrão
//                     é rodar escondido (mais rápido).

const fs = require("fs");
const { chromium } = require("playwright");
const XLSX = require("xlsx");

const SITEMAP_INDICE = "https://www.dcadistribuidor.com.br/sitemap.xml";

const PAUSA_ENTRE_PAGINAS_MS = 400;

const SAIDA_ARQUIVO = process.env.SAIDA_ARQUIVO || "distribuidora_dca.xlsx";

const LIMITE = Number(process.env.LIMITE) || 0; // 0 = sem limite, roda tudo

const HEADLESS = process.env.HEADLESS !== "false";

const CABECALHOS_SITEMAP = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

function pausa(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buscarTexto(url) {

    const resposta = await fetch(url, { headers: CABECALHOS_SITEMAP });

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

// Extrai o texto depois dos dois-pontos (ex.: "Código: 100" -> "100").
function depoisDosDoisPontos(texto) {

    if (!texto) return "";

    const partes = texto.split(":");

    return partes.length > 1 ? partes.slice(1).join(":").trim() : texto.trim();

}

async function extrairDadosDoProduto(page, urlProduto) {

    await page.goto(urlProduto, { waitUntil: "domcontentloaded", timeout: 30000 });

    // O site faz uma "dança" de redirecionamento/cookie antes de
    // mostrar a página real - espera o conteúdo de verdade aparecer
    // em vez de confiar que o primeiro carregamento já é o definitivo.
    const apareceu = await page
        .locator("h1.product__name")
        .first()
        .waitFor({ state: "attached", timeout: 15000 })
        .then(() => true)
        .catch(() => false);

    if (!apareceu) {
        return { nome: "", codigo: "", ean: "" };
    }

    const nome = await page.locator("h1.product__name").first().textContent().catch(() => "");
    const codigoTexto = await page.locator(".product__features--codigo").first().textContent().catch(() => "");
    const eanTexto = await page.locator(".product__features--ean").first().textContent().catch(() => "");

    return {
        nome: (nome || "").trim(),
        codigo: depoisDosDoisPontos(codigoTexto),
        ean: depoisDosDoisPontos(eanTexto)
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

    let produtosBrutos = [];

    for (const urlSitemap of sitemaps) {

        process.stdout.write(`Lendo ${urlSitemap}... `);
        const lista = await listarProdutosDoSitemap(urlSitemap);
        console.log(`${lista.length} produtos.`);

        produtosBrutos.push(...lista);

        await pausa(PAUSA_ENTRE_PAGINAS_MS);

    }

    if (!produtosBrutos.length) {
        console.error("Nenhum produto encontrado nos sitemaps.");
        process.exit(1);
    }

    if (LIMITE > 0) {
        produtosBrutos = produtosBrutos.slice(0, LIMITE);
        console.log(`\nLIMITE=${LIMITE} ativo - processando só os ${produtosBrutos.length} primeiros produtos (modo teste).`);
    }

    console.log(`\nTotal de ${produtosBrutos.length} produtos a processar - abrindo navegador (${HEADLESS ? "escondido" : "visível"})...\n`);

    const navegador = await chromium.launch({ headless: HEADLESS });
    const pagina = await navegador.newPage();

    const vistos = new Map(); // ean -> { descricao, codigo, imagem }
    let processados = 0;

    for (const produto of produtosBrutos) {

        processados++;

        try {

            const dados = await extrairDadosDoProduto(pagina, produto.link);

            if (dados.ean && dados.nome) {
                vistos.set(dados.ean, {
                    descricao: dados.nome,
                    codigo: dados.codigo,
                    imagem: produto.imagem
                });
            } else {
                console.warn(`  (sem EAN) ${produto.link}`);
            }

        } catch (erro) {
            console.warn(`  (ignorado) erro em ${produto.link}: ${erro.message}`);
        }

        if (processados % 10 === 0 || processados === produtosBrutos.length) {
            console.log(`  ${processados}/${produtosBrutos.length} processados (${vistos.size} com EAN válido)...`);
        }

        await pausa(PAUSA_ENTRE_PAGINAS_MS);

    }

    await navegador.close();

    if (!vistos.size) {
        console.warn("\nNenhum produto com EAN válido encontrado - mesmo com navegador de verdade. A proteção do site pode ser mais forte ainda (captcha, por exemplo). Roda de novo com HEADLESS=false pra ver visualmente o que a página mostra.");
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

    if (LIMITE > 0) {
        console.log(`Isso foi só o teste com LIMITE=${LIMITE}. Pra rodar o catálogo inteiro, roda de novo sem a variável LIMITE (ex.: "npm run extrair" direto).`);
    } else {
        console.log("Já pode subir esse arquivo na caixa \"Lista da distribuidora\" do padronizador.");
    }

}

main().catch((erro) => {
    console.error("\nErro durante a extração:", erro.message);
    console.error("Se for erro de rede/HTTP, o site pode ter mudado algo - confere de novo pelo DevTools/sitemap.");
    process.exit(1);
});
