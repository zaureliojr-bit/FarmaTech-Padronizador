// Varre o catálogo público da DPCNET (api/ec/produto/showall - achada
// pela aba Network do navegador, não é uma API documentada) e gera uma
// planilha pronta pra subir como "Lista da distribuidora" no
// padronizador.
//
// Isso é engenharia reversa de uma chamada interna do site da
// DPCNET, não uma API oficial - pode parar de funcionar se eles
// mudarem o formato, sem aviso nenhum. Roda de vez em quando (não
// precisa de agendamento diário como o extrator do Firebird), com
// pausa entre os pedidos pra não sobrecarregar o site deles.
//
// Uso: npm install && npm run extrair

const XLSX = require("xlsx");

const URL_PRODUTOS = "https://apiecommerce.dpcnet.com.br/api/ec/produto/showall";
const URL_CATEGORIAS = "https://apiecommerce.dpcnet.com.br/api/ec/categoria/showall";

// O catálogo da UI pede 24 por vez - tenta um valor maior aqui (menos
// pedidos no total); se o servidor ignorar e continuar mandando só
// 24, o script se adapta sozinho (ver tamanhoPagina mais abaixo).
const LIMITE_PEDIDO = 100;

const PAUSA_ENTRE_PAGINAS_MS = 400;
const PAUSA_ENTRE_CATEGORIAS_MS = 300;

const SAIDA_ARQUIVO = process.env.SAIDA_ARQUIVO || "distribuidora_dpcnet.xlsx";

// Opcional, só pra testar rápido: LIMITE_CATEGORIAS=5 roda só as 5
// primeiras folhas antes da passada final sem filtro, pra conferir se
// a árvore de categorias ainda bate sem esperar a extração inteira.
const LIMITE_CATEGORIAS = Number(process.env.LIMITE_CATEGORIAS) || 0;

const CABECALHOS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Origin": "https://dpcnet.com.br",
    "Referer": "https://dpcnet.com.br/catalogo",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

function pausa(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// categoriaIntegracaoId: [] traz o catálogo inteiro (uso de sempre);
// com um integracao_id, traz só os produtos daquela categoria - é
// assim que a extração cruza produto com categoria (ver
// buscarCategorias logo abaixo: a API de produto não diz a categoria
// de cada item, só deixa filtrar por ela).
async function buscarPaginaDeProdutos(offset, categoriaIntegracaoId) {

    const corpo = {
        count: true,
        produto_and_ean: [],
        categoria_integracao_id: categoriaIntegracaoId ? [categoriaIntegracaoId] : [],
        fornecedor_id: null,
        searchterm: null,
        getMarcasList: false,
        limit: LIMITE_PEDIDO,
        offset,
        ordenacao: "ordem-0",
        paramsProduct: {},
        preco: {},
        search_origin: "searchbox",
        searchtype: "contain",
        token: ""
    };

    const resposta = await fetch(URL_PRODUTOS, {
        method: "POST",
        headers: CABECALHOS,
        body: JSON.stringify(corpo)
    });

    if (!resposta.ok) {
        throw new Error(`HTTP ${resposta.status} no offset ${offset} (categoria ${categoriaIntegracaoId || "todas"})`);
    }

    const dados = await resposta.json();

    // A resposta pode vir como array direto, ou dentro de alguma
    // propriedade (varia entre APIs assim) - tenta os formatos mais
    // comuns antes de desistir.
    if (Array.isArray(dados)) return dados;
    if (Array.isArray(dados?.produtos)) return dados.produtos;
    if (Array.isArray(dados?.data)) return dados.data;
    if (Array.isArray(dados?.items)) return dados.items;
    if (Array.isArray(dados?.rows)) return dados.rows;

    throw new Error("Não reconheci o formato da resposta de produtos - confere manualmente no navegador (DevTools -> Network -> showall) se o site mudou algo.");

}

// Varre TODAS as páginas de uma categoria (ou do catálogo inteiro, se
// categoriaIntegracaoId vier vazio) e devolve a lista crua de itens.
async function buscarTodosOsProdutos(categoriaIntegracaoId) {

    const itens = [];

    let offset = 0;
    let tamanhoPagina = null;
    let pagina = 0;
    const MAX_PAGINAS = 2000; // trava de segurança

    while (pagina < MAX_PAGINAS) {

        pagina++;

        const lista = await buscarPaginaDeProdutos(offset, categoriaIntegracaoId);

        if (!lista.length) break;

        if (tamanhoPagina === null) tamanhoPagina = lista.length;

        itens.push(...lista);

        if (lista.length < tamanhoPagina) break;

        offset += lista.length;

        await pausa(PAUSA_ENTRE_PAGINAS_MS);

    }

    return itens;

}

// Árvore de categorias da DPCNET - vem como lista achatada (cada
// categoria aponta pro id da mãe em categoriapai_id, não uma árvore
// aninhada), apesar do nome "retfilhos" no pedido.
async function buscarCategorias() {

    const resposta = await fetch(URL_CATEGORIAS, {
        method: "POST",
        headers: CABECALHOS,
        body: JSON.stringify({ retfilhos: 1 })
    });

    if (!resposta.ok) {
        throw new Error(`HTTP ${resposta.status} ao buscar categorias`);
    }

    const dados = await resposta.json();

    if (Array.isArray(dados)) return dados;
    if (Array.isArray(dados?.categorias)) return dados.categorias;
    if (Array.isArray(dados?.data)) return dados.data;

    throw new Error("Não reconheci o formato da resposta de categorias - confere manualmente no navegador (DevTools -> Network -> categoria/showall) se o site mudou algo.");

}

// "Folha" = categoria que ninguém mais usa como mãe - é nela que os
// produtos de fato estão pendurados. Filtrar pela categoria-pai (ex.:
// "Fralda" sozinha) também traz os produtos das subcategorias dela, o
// que faria o mesmo produto aparecer em mais de uma consulta - por
// isso só folhas entram na varredura.
function calcularFolhas(categorias) {

    const idsUsadosComoMae = new Set(
        categorias.map((c) => c.categoriapai_id).filter((id) => id != null)
    );

    return categorias.filter((c) =>
        c.status === 1 &&
        c.integracao_id &&
        !idsUsadosComoMae.has(c.id)
    );

}

// Sobe a árvore (categoriapai_id) até achar a categoria do topo (sem
// mãe) - é o nome que bate com as categorias largas que já usamos
// (Fralda, Capilar, Perfumaria...), diferente da folha (Fita,
// Geriátrica...), que é específica demais pra servir de "Categoria".
function categoriaDoTopo(categoria, porId) {

    let atual = categoria;
    const vistos = new Set(); // contra ciclo nos dados, por garantia

    while (atual.categoriapai_id != null && porId.has(atual.categoriapai_id) && !vistos.has(atual.id)) {
        vistos.add(atual.id);
        atual = porId.get(atual.categoriapai_id);
    }

    return atual;

}

async function main() {

    console.log("Buscando árvore de categorias...");
    const categorias = await buscarCategorias();

    const porId = new Map(categorias.map((c) => [c.id, c]));
    let folhas = calcularFolhas(categorias);

    console.log(`${categorias.length} categorias no total, ${folhas.length} são folha (onde os produtos realmente estão).`);

    if (LIMITE_CATEGORIAS > 0) {
        folhas = folhas.slice(0, LIMITE_CATEGORIAS);
        console.log(`LIMITE_CATEGORIAS=${LIMITE_CATEGORIAS} ativo - processando só as ${folhas.length} primeiras folhas (modo teste; pula a passada final sem filtro).`);
    }

    const vistos = new Map(); // ean -> { descricao, codigo, imagem, categoria, subcategoria }

    function registrarItem(item, categoriaNome, subcategoriaNome) {

        const ean = String(item.ean || "").trim();
        const descricao = String(item.descricao || "").trim();
        const codigo = item.id != null ? String(item.id) : "";
        const imagem = String(item.src || "").trim();

        if (!ean || !descricao) return;

        // Primeira categoria vista pra esse EAN vale - produto raramente
        // deveria pertencer a duas folhas ao mesmo tempo, e se pertencer,
        // a primeira já é uma resposta razoável.
        if (vistos.has(ean)) return;

        vistos.set(ean, { descricao, codigo, imagem, categoria: categoriaNome || "", subcategoria: subcategoriaNome || "" });

    }

    let folhaAtual = 0;

    for (const folha of folhas) {

        folhaAtual++;

        const topo = categoriaDoTopo(folha, porId);

        process.stdout.write(`[${folhaAtual}/${folhas.length}] ${topo.descricao} > ${folha.descricao}... `);

        try {

            const itens = await buscarTodosOsProdutos(folha.integracao_id);

            itens.forEach((item) => registrarItem(item, topo.descricao, folha.descricao));

            console.log(`${itens.length} produtos.`);

        } catch (erro) {

            console.log(`erro (${erro.message}) - pulando essa categoria.`);

        }

        await pausa(PAUSA_ENTRE_CATEGORIAS_MS);

    }

    // Passada final sem filtro de categoria - rede de segurança pra
    // pegar qualquer produto que não esteja pendurado em nenhuma folha
    // (categoria desativada, erro de cadastro etc.). Quem já foi visto
    // numa folha mantém a categoria; só completa quem ficou de fora.
    // Pulada em modo teste (LIMITE_CATEGORIAS) - ela sozinha já baixa o
    // catálogo inteiro, o que anula a ideia de um teste rápido.
    let semCategoria = 0;

    if (!LIMITE_CATEGORIAS) {

        console.log("\nPassada final sem filtro (produtos que sobraram de fora das categorias)...");

        const todosSemFiltro = await buscarTodosOsProdutos(null);

        todosSemFiltro.forEach((item) => {

            const ean = String(item.ean || "").trim();

            if (vistos.has(ean)) return;

            semCategoria++;
            registrarItem(item, "", "");

        });

        console.log(`${semCategoria} produto(s) sem categoria identificada.`);

    }

    if (!vistos.size) {
        console.warn("Nenhum produto encontrado - confere se a URL/formato da API ainda é esse (DevTools -> Network -> showall no site).");
        process.exit(0);
    }

    const planilha = [...vistos.entries()].map(([ean, info]) => ({
        "Código": info.codigo,
        "EAN": ean,
        "Descrição": info.descricao,
        "Imagem": info.imagem,
        "Categoria": info.categoria,
        "Subcategoria": info.subcategoria
    }));

    const livro = XLSX.utils.book_new();
    const aba = XLSX.utils.json_to_sheet(planilha);

    XLSX.utils.book_append_sheet(livro, aba, "DISTRIBUIDORA");

    XLSX.writeFile(livro, SAIDA_ARQUIVO);

    console.log(`\nPronto! ${vistos.size} produtos únicos exportados pra "${SAIDA_ARQUIVO}" (${vistos.size - semCategoria} com categoria, ${semCategoria} sem).`);
    console.log("Já pode subir esse arquivo na caixa \"Lista da distribuidora\" do padronizador.");

}

main().catch((erro) => {
    console.error("\nErro durante a extração:", erro.message);
    console.error("Se for erro de rede/HTTP, o site pode ter mudado algo - confere de novo pelo DevTools.");
    process.exit(1);
});
