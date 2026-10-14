import { buscarImagensHospedadas } from "./imagemHostingService";
import { PORTEIRO_URL, cabecalhoPainel, esquecerSenhaPainel } from "./credencialPainel";

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
    // listas C + antimicrobianos: é este que o checkout do site usa para
    // cobrar a confirmação do envio da receita
    if (produto.confirmarReceita) base.confirmarReceita = true;
    if (produto.controleEspecial) base.controleEspecial = produto.controleEspecial;
    if (produto.tipoReceita) base.tipoReceita = produto.tipoReceita;
    if (produto.substancia) base.substancia = produto.substancia;
    if (produto.registroAnvisa) base.registroAnvisa = produto.registroAnvisa;

    // A classe terapêutica já vinha da CMED e morria aqui: o padronizador
    // lia a coluna, guardava no produto e não exportava. É o que a ficha
    // técnica do site mostra como "Classe" — "Analgésicos e antitérmicos"
    // dito por extenso diz mais ao cliente do que a substância sozinha.
    if (produto.classeTerapeutica) base.classeTerapeutica = produto.classeTerapeutica;

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

// modo "mesclar" (padrão): atualiza/acrescenta pelo EAN, mantém no ar
// quem não veio nesta planilha - seguro pra publicar uma planilha
// parcial (só o que mudou) sem apagar o resto do catálogo. modo
// "substituir": publica exatamente esta lista, apagando o que não
// vier - só faz sentido junto de uma reimportação do catálogo inteiro.
export async function publicarNoSite(produtos, modo = "mesclar") {

    /* Publicar passa pelo porteiro (pedidos-proxy), e não mais direto no
       publish-proxy. A VITE_PUBLISH_KEY que ficava aqui era embutida no
       pacote pelo Vite e podia ser lida por qualquer um — e com ela se
       reescreve o produtos.json inteiro do site, preço por preço. Agora
       vai a senha do painel, e a chave fica no servidor. */
    if (!PORTEIRO_URL) {
        throw new Error("Publicação não configurada: falta VITE_PEDIDOS_PROXY_URL no .env.");
    }

    const credencial = cabecalhoPainel();

    if (!credencial) {
        throw new Error("Preciso da senha do painel para publicar no site.");
    }

    const listaSite = await gerarProdutosSite(produtos);

    if (!listaSite.length) {
        throw new Error("Nenhum produto válido para publicar (falta EAN ou descrição).");
    }

    const resposta = await fetch(`${PORTEIRO_URL}/catalogo/publicar`, {

        method: "POST",

        headers: {
            "Content-Type": "application/json",
            ...credencial
        },

        body: JSON.stringify({ produtos: listaSite, modo })

    });

    if (resposta.status === 401) {
        esquecerSenhaPainel();
        throw new Error("Senha do painel incorreta.");
    }

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        throw new Error(dados.erro || `Falha ao publicar (HTTP ${resposta.status})`);
    }

    return { total: listaSite.length, ...dados };

}
