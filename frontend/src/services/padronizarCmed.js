/**
 * Aplica a lista da CMED ao catálogo importado.
 *
 * Duas coisas são preenchidas sem perguntar, porque são informação que a
 * loja não tinha e não tem como estar errada por nossa causa: a tarja e o
 * teto de preço.
 *
 * Duas coisas NÃO são sobrescritas por padrão — classe e laboratório. O
 * cadastro da loja pode divergir da CMED de propósito, e trocar 1.100 nomes
 * de laboratório de uma vez, calado, é o tipo de coisa que ninguém consegue
 * desfazer depois. Elas viram divergência no relatório, e só mudam se quem
 * está usando pedir (opcoes.corrigirClasse / opcoes.corrigirLaboratorio).
 */

import { consultarEan, TARJA_EXIGE_RECEITA } from "./cmedService";

/** Classes do cadastro que valem como medicamento para este cruzamento. */
export const CLASSES_DE_MEDICAMENTO = [
    "MEDICAMENTOS",
    "GENERICO",
    "SIMILAR"
];

/** O nome que a CMED usa para o tipo, traduzido para a classe do cadastro. */
const CLASSE_DO_TIPO = {
    "Genérico": "GENERICO",
    "Similar": "SIMILAR"
};

function ehMedicamento(produto) {

    return CLASSES_DE_MEDICAMENTO.includes(
        String(produto.classe || "").trim().toUpperCase()
    );

}

function paraNumero(valor) {

    if (typeof valor === "number") {
        return Number.isFinite(valor) ? valor : null;
    }

    if (valor === null || valor === undefined || valor === "") return null;

    const n = Number(String(valor).trim().replace(",", "."));

    return Number.isFinite(n) ? n : null;
}

/**
 * Cruza os produtos com a CMED.
 *
 * Devolve { produtos, relatorio } — sempre uma lista nova, sem alterar a
 * que entrou, porque o React compara por referência para saber o que
 * precisa redesenhar.
 */
export function padronizarComCmed(produtos, indice, opcoes = {}) {

    const {
        corrigirClasse = false,
        corrigirLaboratorio = false
    } = opcoes;

    const lista = Array.isArray(produtos) ? produtos : [];

    const relatorio = {
        totalProdutos: lista.length,
        medicamentos: 0,
        encontrados: 0,
        // Estavam na CMED sem estar classificados como medicamento no PDV.
        // São remédios arquivados em VITAMINAS, PERFUMARIA e afins — sem
        // isto, um deles com tarja vermelha continuaria indo ao carrinho.
        foraDaClasse: [],
        naoEncontrados: [],
        porTarja: {},
        exigemReceita: 0,
        isentos: 0,
        // está na CMED, mas a lista não informa a tarja e a substância não
        // aparece em nenhuma outra linha. Segue valendo a regra por categoria.
        semTarja: 0,
        acimaDoPmc: [],
        // Preço de tabela acima do teto, salvo por uma promoção. Acabou a
        // promoção, o produto volta a ser vendido acima do máximo legal.
        acimaDoPmcSoNaPromocao: [],
        classeDivergente: [],
        laboratorioDivergente: [],
        corrigidos: { classe: 0, laboratorio: 0 }
    };

    const novos = lista.map((produto) => {

        const daClasse = ehMedicamento(produto);

        if (daClasse) relatorio.medicamentos++;

        // A consulta vale para TODO produto, não só para o que o PDV chamou
        // de medicamento: a lista da CMED só tem medicamento registrado, e o
        // EAN é único, então um encontro ali é resposta boa por si só.
        const cmed = consultarEan(indice, produto.ean);

        if (!cmed) {

            if (daClasse) {

                relatorio.naoEncontrados.push({
                    codigo: produto.codigo,
                    ean: produto.ean,
                    descricao: produto.descricao
                });

            }

            return produto;

        }

        if (!daClasse) {

            relatorio.foraDaClasse.push({
                codigo: produto.codigo,
                descricao: produto.descricao,
                classe: produto.classe,
                tarja: cmed.tarja
            });

        }

        relatorio.encontrados++;

        if (cmed.tarja) {

            relatorio.porTarja[cmed.tarja] =
                (relatorio.porTarja[cmed.tarja] || 0) + 1;

            if (cmed.exigeReceita) relatorio.exigemReceita++;
            else relatorio.isentos++;

        } else {

            relatorio.semTarja++;

        }

        const atualizado = {
            ...produto,
            tarja: cmed.tarja,
            exigeReceita: cmed.exigeReceita,
            substancia: cmed.substancia,
            classeTerapeutica: cmed.classeTerapeutica,
            tipoProduto: cmed.tipo,
            registroAnvisa: cmed.registroAnvisa,
            pmc: cmed.pmc ?? "",
            acimaDoPmc: false
        };

        // ---- preço acima do teto legal ---------------------------------

        const venda = paraNumero(produto.precoVenda);
        const promocao = paraNumero(produto.precoPromocao);

        // Vale o preço que o cliente realmente paga.
        const cobrado = promocao && promocao > 0 ? promocao : venda;

        if (cmed.pmc && cobrado && cobrado > cmed.pmc) {

            atualizado.acimaDoPmc = true;

            relatorio.acimaDoPmc.push({
                codigo: produto.codigo,
                ean: produto.ean,
                descricao: produto.descricao,
                precoCobrado: cobrado,
                pmc: cmed.pmc,
                excesso: Number((cobrado - cmed.pmc).toFixed(2)),
                excessoPercent: Number((100 * (cobrado / cmed.pmc - 1)).toFixed(1))
            });

        } else if (cmed.pmc && venda && venda > cmed.pmc) {

            relatorio.acimaDoPmcSoNaPromocao.push({
                codigo: produto.codigo,
                descricao: produto.descricao,
                precoVenda: venda,
                precoPromocao: promocao,
                pmc: cmed.pmc
            });

        }

        // ---- divergências que a pessoa decide o que fazer ---------------

        const classeCmed = CLASSE_DO_TIPO[cmed.tipo];
        const classeAtual = String(produto.classe || "").trim().toUpperCase();

        if (classeCmed && classeCmed !== classeAtual) {

            relatorio.classeDivergente.push({
                codigo: produto.codigo,
                descricao: produto.descricao,
                atual: produto.classe,
                cmed: classeCmed
            });

            if (corrigirClasse) {
                atualizado.classe = classeCmed;
                relatorio.corrigidos.classe++;
            }

        }

        const labAtual = String(produto.laboratorio || "").trim().toUpperCase();
        const labCmed = String(cmed.laboratorio || "").trim().toUpperCase();

        // Comparação frouxa: "EMS S/A" e "EMS SIGMA PHARMA LTDA" são a mesma
        // empresa escrita de dois jeitos, e listar isso como divergência só
        // faria barulho. Só conta quando nem o começo do nome bate.
        const mesmoComeco =
            labAtual && labCmed &&
            (labAtual.startsWith(labCmed.slice(0, 6)) ||
             labCmed.startsWith(labAtual.slice(0, 6)));

        if (labCmed && !mesmoComeco) {

            relatorio.laboratorioDivergente.push({
                codigo: produto.codigo,
                descricao: produto.descricao,
                atual: produto.laboratorio,
                cmed: cmed.laboratorio
            });

            if (corrigirLaboratorio) {
                atualizado.laboratorio = cmed.laboratorio;
                relatorio.corrigidos.laboratorio++;
            }

        }

        return atualizado;

    });

    relatorio.acimaDoPmc.sort((a, b) => b.excessoPercent - a.excessoPercent);

    return { produtos: novos, relatorio };

}

/** Quantos produtos deixariam de entrar no carrinho do site. */
export function contarBloqueados(produtos) {

    return (produtos || []).filter(
        (p) => TARJA_EXIGE_RECEITA.includes(p.tarja)
    ).length;

}
