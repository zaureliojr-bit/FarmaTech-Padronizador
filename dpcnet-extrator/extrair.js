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

const URL_BUSCA = "https://apiecommerce.dpcnet.com.br/api/ec/produto/showall";

// O catálogo da UI pede 24 por vez - tenta um valor maior aqui (menos
// pedidos no total); se o servidor ignorar e continuar mandando só
// 24, o script se adapta sozinho (ver tamanhoPagina mais abaixo).
const LIMITE_PEDIDO = 100;

const PAUSA_ENTRE_PAGINAS_MS = 400;

const SAIDA_ARQUIVO = process.env.SAIDA_ARQUIVO || "distribuidora_dpcnet.xlsx";

function pausa(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buscarPagina(offset) {

    const corpo = {
        count: true,
        produto_and_ean: [],
        categoria_integracao_id: [],
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

    const resposta = await fetch(URL_BUSCA, {

        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": "https://dpcnet.com.br",
            "Referer": "https://dpcnet.com.br/catalogo",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },

        body: JSON.stringify(corpo)

    });

    if (!resposta.ok) {
        throw new Error(`HTTP ${resposta.status} no offset ${offset}`);
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

    throw new Error("Não reconheci o formato da resposta - confere manualmente no navegador (DevTools -> Network -> showall) se o site mudou algo.");

}

async function main() {

    const vistos = new Map(); // ean -> { descricao, codigo }

    let offset = 0;
    let tamanhoPagina = null; // descoberto na 1ª resposta - o servidor pode não respeitar o LIMITE_PEDIDO
    let pagina = 0;
    const MAX_PAGINAS = 2000; // trava de segurança - não deixa rodar pra sempre se algo não bater

    while (pagina < MAX_PAGINAS) {

        pagina++;

        process.stdout.write(`Página ${pagina} (offset ${offset})... `);

        const lista = await buscarPagina(offset);

        console.log(`${lista.length} itens.`);

        if (!lista.length) break;

        if (tamanhoPagina === null) tamanhoPagina = lista.length;

        lista.forEach((item) => {

            const ean = String(item.ean || "").trim();
            const descricao = String(item.descricao || "").trim();
            const codigo = item.id != null ? String(item.id) : "";
            const imagem = String(item.src || "").trim();

            if (!ean || !descricao) return;

            vistos.set(ean, { descricao, codigo, imagem });

        });

        // Página veio menor que o tamanho das anteriores = última página.
        if (lista.length < tamanhoPagina) break;

        offset += lista.length;

        await pausa(PAUSA_ENTRE_PAGINAS_MS);

    }

    if (!vistos.size) {
        console.warn("Nenhum produto encontrado - confere se a URL/formato da API ainda é esse (DevTools -> Network -> showall no site).");
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
    console.error("Se for erro de rede/HTTP, o site pode ter mudado algo - confere de novo pelo DevTools.");
    process.exit(1);
});
