import { obterImagensLocais } from "./imagemDB";

// A imagem em produto.imagem pode ser um blob: (URL de objeto, só
// existe durante a sessão atual do navegador) - inútil num catálogo
// público. Preferimos sempre a urlOriginal salva no IndexedDB por EAN;
// se não houver, só usamos produto.imagem quando já for um link
// remoto de verdade.
function resolverImagemSite(produto, imagensLocais) {

    const local = imagensLocais.get(produto.ean);

    if (local?.urlOriginal) return local.urlOriginal;

    if (produto.imagem && !produto.imagem.startsWith("blob:")) {
        return produto.imagem;
    }

    return "";

}

// Formato que script.js (mapearProduto) do site "Drogaria Mais Barato"
// espera - ver publish-proxy/README.md e a análise no histórico do
// projeto. Só os campos que o site realmente lê; nada de
// descricaoPesquisa/statusImagem/reajuste etc.
function montarProdutoSite(produto, imagensLocais) {

    const base = {
        codigo: produto.codigo,
        ean: produto.ean,
        descricao: produto.descricaoSite || produto.descricaoOriginal || "",
        marca: produto.marca || "",
        laboratorio: produto.laboratorio || "",
        categoria: produto.categoria || produto.categoriaOriginal || "",
        precoVenda: produto.precoVenda || 0,
        precoPromocao: produto.precoPromocao || 0,
        estoque: produto.estoque || 0,
        imagem: resolverImagemSite(produto, imagensLocais)
    };

    // Vindos da CMED. tarja/exigeReceita são o que corrige quais produtos
    // exigem receita de verdade (a categoria do PDV sozinha erra bastante
    // esse número) - só saem quando têm conteúdo, porque a maior parte do
    // catálogo não é medicamento e nunca vai ter tarja.
    //
    // pmc e acimaDoPmc ficam de fora de propósito: ao lado do preço de
    // venda, o teto legal vira comparação de margem em cada card do site.
    // Fica só no padronizador.
    if (produto.tarja) base.tarja = produto.tarja;
    if (produto.exigeReceita) base.exigeReceita = true;
    if (produto.substancia) base.substancia = produto.substancia;
    if (produto.registroAnvisa) base.registroAnvisa = produto.registroAnvisa;

    return base;

}

export async function gerarProdutosSite(produtos) {

    const eans = produtos.map((produto) => produto.ean).filter(Boolean);

    const imagensLocais = await obterImagensLocais(eans);

    return produtos

        // O site descarta no carregamento qualquer produto sem EAN ou
        // sem descrição - já filtramos aqui pra não publicar lixo.
        .filter((produto) => produto.ean && (produto.descricaoSite || produto.descricaoOriginal))

        .map((produto) => montarProdutoSite(produto, imagensLocais));

}

export async function publicarNoSite(produtos) {

    const workerUrl = import.meta.env.VITE_PUBLISH_WORKER_URL;
    const chave = import.meta.env.VITE_PUBLISH_KEY;

    if (!workerUrl) {
        throw new Error("Publicação não configurada: falta VITE_PUBLISH_WORKER_URL no .env (veja publish-proxy/README.md).");
    }

    const listaSite = await gerarProdutosSite(produtos);

    if (!listaSite.length) {
        throw new Error("Nenhum produto válido para publicar (falta EAN ou descrição).");
    }

    const resposta = await fetch(workerUrl, {

        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "X-Publish-Key": chave || ""
        },

        body: JSON.stringify({ produtos: listaSite })

    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        throw new Error(dados.erro || `Falha ao publicar (HTTP ${resposta.status})`);
    }

    return { total: listaSite.length, ...dados };

}
