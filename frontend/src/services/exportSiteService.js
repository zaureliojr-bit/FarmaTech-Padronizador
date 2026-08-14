import { buscarImagensHospedadas } from "./imagemHostingService";

// A imagem fica hospedada no R2 (ver imagens-proxy/), servida por um
// link estável da própria farmácia - não depende do site de origem
// (Cosmos/Serper/manual) continuar no ar. produto.imagem só entra como
// reserva se por algum motivo o produto não estiver no índice do D1
// ainda (ex.: imagem escolhida numa sessão antes desta migração).
function resolverImagemSite(produto, imagensHospedadas) {

    const hospedada = imagensHospedadas.get(produto.ean);

    if (hospedada?.url) return hospedada.url;

    if (produto.imagem && !produto.imagem.startsWith("blob:")) {
        return produto.imagem;
    }

    return "";

}

// Formato que script.js (mapearProduto) do site "Drogaria Mais Barato"
// espera - ver publish-proxy/README.md e a análise no histórico do
// projeto. Só os campos que o site realmente lê; nada de
// descricaoPesquisa/statusImagem/reajuste etc.
function montarProdutoSite(produto, imagensHospedadas) {

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
        imagem: resolverImagemSite(produto, imagensHospedadas)
    };

    // Vindos da CMED e da Portaria 344/1998. tarja é só informativo (mostra
    // "venda sob prescrição" no card, não bloqueia nada - tem antibiótico e
    // anticoncepcional que são tarja vermelha e vendem livre). Quem manda
    // no carrinho é bloqueioPresencial/receitaRemota:
    //   bloqueioPresencial - listas A/B, retenção sempre presencial, não
    //   entra no carrinho.
    //   receitaRemota - listas C, entra no carrinho normal, mas o
    //   checkout cobra confirmação do envio da receita antes de despachar.
    // Só saem quando têm conteúdo, porque a maior parte do catálogo não é
    // medicamento e nunca vai ter nenhum destes campos.
    //
    // pmc e acimaDoPmc ficam de fora de propósito: ao lado do preço de
    // venda, o teto legal vira comparação de margem em cada card do site.
    // Fica só no padronizador.
    if (produto.tarja) base.tarja = produto.tarja;
    if (produto.bloqueioPresencial) base.bloqueioPresencial = true;
    if (produto.receitaRemota) base.receitaRemota = true;
    if (produto.controleEspecial) base.controleEspecial = produto.controleEspecial;
    if (produto.tipoReceita) base.tipoReceita = produto.tipoReceita;
    if (produto.substancia) base.substancia = produto.substancia;
    if (produto.registroAnvisa) base.registroAnvisa = produto.registroAnvisa;

    return base;

}

export async function gerarProdutosSite(produtos) {

    const eans = produtos.map((produto) => produto.ean).filter(Boolean);

    const imagensHospedadas = await buscarImagensHospedadas(eans);

    return produtos

        // O site descarta no carregamento qualquer produto sem EAN ou
        // sem descrição - já filtramos aqui pra não publicar lixo.
        .filter((produto) => produto.ean && (produto.descricaoSite || produto.descricaoOriginal))

        .map((produto) => montarProdutoSite(produto, imagensHospedadas));

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
