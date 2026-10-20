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
import { analisarProduto } from "../intelligence/core";
import { definirOverridesCategoria } from "../intelligence/dictionary/familias";
import { buscarFamiliasOverride } from "../services/familiasOverrideService";
import { buscarReferencia } from "../services/referenciasService";
import { publicarNoSite } from "../services/exportSiteService";
import { salvarImagemHospedada } from "../services/imagemHostingService";
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

    const [overrides, indiceCmed, indiceDistribuidor] = await Promise.all([
        buscarFamiliasOverride(),
        buscarReferencia("cmed"),
        buscarReferencia("distribuidor")
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

            return info?.descricao
                ? { ...produto, descricaoDistribuidor: info.descricao }
                : produto;

        })
        : comCmed;

    const produtosFinais = comDistribuidor.map(analisarProduto);

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
