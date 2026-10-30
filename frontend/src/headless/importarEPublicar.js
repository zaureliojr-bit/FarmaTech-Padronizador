// Roda a mesma padronização do padronizador, sem interface nenhuma -
// pensado pra ser empacotado (ver frontend/build-headless.js) e usado
// por OUTRO site (o painel da loja, em outro domínio), que não tem
// acesso ao IndexedDB onde o padronizador guarda a lista da CMED e da
// distribuidora (armazenamento de navegador é isolado por origem).
// Por isso busca essas duas do servidor (referenciasService.js) em vez
// do IndexedDB local - ver imagens-proxy/worker.js (rotas
// /referencias/:chave), alimentadas quando alguém sobe a lista no
// padronizador (useProdutos.js chama salvarReferencia depois de
// salvar local).
import { importarPlanilha } from "../services/importador";
import { padronizarComCmed } from "../services/padronizarCmed";
import { consultarEanDistribuidor } from "../services/distribuidorService";
import { consultarSubstancia } from "../services/grupoFarmacologicoService";
import { analisarProduto } from "../intelligence/core";
import { definirOverridesCategoria } from "../intelligence/dictionary/familias";
import { buscarFamiliasOverride } from "../services/familiasOverrideService";
import { buscarReferencia } from "../services/referenciasService";
import { publicarNoSite, removerDoSite } from "../services/exportSiteService";
import { salvarImagemHospedada } from "../services/imagemHostingService";
import { excluirProdutoDefinitivamente } from "../services/produtosExcluidosService";
import {
    buscarExtracaoPendente,
    baixarArquivoExtracao,
    marcarExtracaoImportada
} from "../services/extracaoService";

/**
 * Baixa a extração pendente (se tiver), padroniza com o mesmo pipeline
 * do padronizador e publica direto no site. `null` se não tinha nada
 * esperando.
 */
export async function importarEPublicarExtracao({ modo = "mesclar" } = {}) {

    const pendente = await buscarExtracaoPendente();

    if (!pendente) return null;

    const [overrides, indiceCmed, indiceDistribuidor, indiceGrupoFarmacologico] = await Promise.all([
        buscarFamiliasOverride(),
        buscarReferencia("cmed"),
        buscarReferencia("distribuidor"),
        buscarReferencia("grupo-farmacologico")
    ]);

    definirOverridesCategoria(overrides);

    const blob = await baixarArquivoExtracao();

    const arquivo = new File([blob], pendente.nomeArquivo, {
        type: blob.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const { produtos: brutos, totalProdutos } = await importarPlanilha(arquivo);

    const comCmed = indiceCmed
        ? padronizarComCmed(brutos, indiceCmed).produtos
        : brutos;

    const comDistribuidor = indiceDistribuidor
        ? comCmed.map((produto) => {

            const info = consultarEanDistribuidor(indiceDistribuidor, produto.ean);

            if (!info?.descricao && !info?.categoria) return produto;

            return {
                ...produto,
                ...(info.descricao && { descricaoDistribuidor: info.descricao }),
                ...(info.categoria && { categoriaDistribuidor: info.categoria }),
                ...(info.subcategoria && { subcategoriaDistribuidor: info.subcategoria })
            };

        })
        : comCmed;

    const comGrupoFarmacologico = indiceGrupoFarmacologico
        ? comDistribuidor.map((produto) => {

            const info = consultarSubstancia(indiceGrupoFarmacologico, produto.substancia);

            if (!info?.grupo) return produto;

            return {
                ...produto,
                grupoFarmacologico: info.grupo,
                ...(info.subgrupo && { subgrupoFarmacologico: info.subgrupo }),
                ...(info.classe && { classeFarmacologica: info.classe })
            };

        })
        : comDistribuidor;

    const produtosFinais = comGrupoFarmacologico.map(analisarProduto);

    const resultadoPublicacao = await publicarNoSite(produtosFinais, modo);

    await marcarExtracaoImportada();

    return {
        nomeArquivo: pendente.nomeArquivo,
        totalProdutos,
        publicados: resultadoPublicacao.total,
        usouCmed: !!indiceCmed,
        usouDistribuidor: !!indiceDistribuidor
    };

}

/**
 * Salva/troca a imagem de um produto pelo EAN - usado pelo painel da
 * loja (aba Catálogo), que não tem acesso ao padronizador em si, só a
 * este bundle. Mesma chamada que o botão "usar este link" do
 * padronizador já faz (ver imagemHostingService.js): passa pelo
 * porteiro (pedidos-proxy) com a senha do painel, já em sessionStorage
 * nesta mesma origem - nada de chave fixa embutida no pacote.
 */
export async function salvarImagemManual(ean, url) {

    return salvarImagemHospedada(ean, url, "manual-painel");

}

/**
 * A mesma gravação, carimbada como vinda da listagem da distribuidora.
 *
 * A origem não é enfeite: ela fica na coluna `origem` da tabela
 * `imagens` e é o que responde, seis meses depois, "de onde saiu esta
 * foto?". Uma leva inteira da DPCNET se acha - e se refaz - por essa
 * coluna; uma imagem que alguém escolheu a mão, olhando a embalagem,
 * não se mexe.
 *
 * É export próprio em vez de um parâmetro em salvarImagemManual porque
 * quem chama é o painel da loja: são dois botões com dois significados,
 * não uma função com um campo livre de texto.
 */
export async function salvarImagemDaDistribuidora(ean, url) {

    return salvarImagemHospedada(ean, url, "dpcnet");

}

/* A listagem da distribuidora, do servidor, pronta para consulta por
   EAN - para o painel da loja poder preencher as fotos que faltam sem
   abrir o padronizador e sem gastar cota de busca de imagem.

   A loja nova de Prudente entrou com 2.000 produtos sem foto. Isso não
   é falha de casamento: é fila. E a foto de boa parte da perfumaria já
   estava no servidor desde que alguém subiu a planilha da DPCNET - era
   só ninguém ter ligado as duas pontas.

   Fica no módulo, não na tela, porque a lista tem 2,6 MB: buscá-la uma
   vez por sessão do painel é barato, uma vez por produto não seria.

   A consulta é a MESMA do padronizador (consultarEanDistribuidor),
   inclusive o jeito de tratar EAN de 12 dígitos. Se as duas divergirem,
   o painel começa a achar imagem para produto que a importação depois
   não acha, e a conta nunca fecha. */
let listaDaDistribuidora;
let listaJaBuscada = false;

export async function imagensDaDistribuidora() {

    if (!listaJaBuscada) {
        listaDaDistribuidora = await buscarReferencia("distribuidor");
        listaJaBuscada = true;
    }

    const indice = listaDaDistribuidora;

    return {

        total: indice ? indice.totalLinhas || 0 : 0,
        importadoEm: indice ? indice.importadoEm || null : null,

        /** O link da foto desse EAN na listagem, ou null. */
        imagemDe(ean) {

            const dados = consultarEanDistribuidor(indice, ean);
            const url = typeof dados?.imagem === "string" ? dados.imagem.trim() : "";

            /* Nem toda linha da planilha tem foto, e as que não têm vêm
               com o texto da célula vazia ou com um "-". Mandar isso
               para o banco de imagens seria gravar um link quebrado,
               que depois ninguém sabe distinguir de foto de verdade. */
            return /^https?:\/\//i.test(url) ? url : null;

        }

    };

}

/**
 * Apaga um produto do catálogo - usado pelo botão "Apagar" do painel
 * da loja (aba Catálogo).
 *
 * São DUAS coisas, e fazer só uma delas não resolve:
 *
 *   1. tirar do site agora (removerDoSite). É o que o cliente vê;
 *   2. marcar a exclusão definitiva (excluirProdutoDefinitivamente),
 *      senão o produto volta sozinho na próxima importação, porque ele
 *      continua existindo no PDV da farmácia. É o caso típico: taxa de
 *      entrega cadastrada como produto, item de teste do sistema,
 *      cadastro duplicado.
 *
 * Nesta ordem de propósito. Se a segunda falhar, o produto já saiu da
 * vitrine e volta na próxima importação - chato, e a pessoa apaga de
 * novo. Na ordem inversa, uma falha deixaria o produto no ar e marcado
 * como excluído, que é o estado em que ninguém entende mais nada: ele
 * está na vitrine e não dá para apagar de novo.
 */
export async function apagarProdutoCatalogo(ean, codigo, motivo) {

    const doSite = await removerDoSite([{ ean, codigo }]);

    /* O código é o que a importação compara (ver importador.js). Sem
       ele não há como impedir o retorno, e dizer "apagado" seria
       mentira na próxima extração. */
    if (!String(codigo ?? "").trim()) {
        throw new Error(
            "Tirei do site, mas este produto não tem código: ele volta na próxima importação.");
    }

    await excluirProdutoDefinitivamente(codigo, motivo || "Apagado pelo painel");

    return doSite;

}
