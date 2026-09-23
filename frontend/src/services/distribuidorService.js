/**
 * Lista de produtos de uma distribuidora (relatório de preços/pedido),
 * cruzada pelo EAN - mesma ideia da CMED, mas sem regra de negócio
 * nenhuma (não mexe em tarja/receita/PMC). Serve só de fonte extra de
 * descrição/laboratório/categoria, útil justamente onde a CMED e as
 * bases de código de barras (Cosmos, Open Facts) são mais fracas:
 * genérico e produto sem embalagem fotografada em lugar nenhum.
 *
 * Formato esperado (testado com relatório de distribuidora real): um
 * cabeçalho "Código / EAN / Descrição / ... / Laboratório / Categoria"
 * em algum lugar das primeiras linhas (antes dele vem texto solto tipo
 * "Condição:", "Prazo:", "Filial:"), igual a CMED faz com o dela.
 */

import * as XLSX from "xlsx";
import { apenasDigitos } from "./cmedService";

const COLUNAS = {
    ean: "EAN",
    descricao: "DESCRIÇÃO",
    laboratorio: "LABORATÓRIO",
    categoria: "CATEGORIA",
    precoFabrica: "PREÇO FÁBRICA",
    pmc: "PMC"
};

/** Procura a linha que tem "EAN" e "DESCRIÇÃO" ao mesmo tempo. */
function acharCabecalho(matriz) {

    for (let i = 0; i < Math.min(matriz.length, 100); i++) {

        const celulas = (matriz[i] || []).map(
            (c) => String(c ?? "").trim().toUpperCase()
        );

        if (celulas.includes(COLUNAS.ean) && celulas.includes(COLUNAS.descricao)) {

            const posicao = {};

            celulas.forEach((nome, coluna) => {
                if (nome && !(nome in posicao)) posicao[nome] = coluna;
            });

            return { linha: i, posicao };

        }

    }

    return null;

}

function paraNumero(valor) {

    if (valor === null || valor === undefined || valor === "") return null;

    if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;

    // "R$ 131,35" -> 131.35
    const limpo = String(valor)
        .replace(/[^\d,.-]/g, "")
        .replace(/\./g, "")
        .replace(",", ".");

    const n = Number(limpo);

    return Number.isFinite(n) ? n : null;

}

export function lerPlanilhaDistribuidor(dados) {

    const workbook = XLSX.read(dados, { type: "array" });

    let cabecalho = null;
    let matriz = null;

    for (const nomeAba of workbook.SheetNames) {

        const atual = XLSX.utils.sheet_to_json(
            workbook.Sheets[nomeAba],
            { header: 1, defval: "" }
        );

        const achado = acharCabecalho(atual);

        if (achado) {
            cabecalho = achado;
            matriz = atual;
            break;
        }

    }

    if (!cabecalho) {
        throw new Error(
            "Não encontrei um cabeçalho com EAN e Descrição nesta planilha."
        );
    }

    const { linha, posicao } = cabecalho;

    const col = (nome) => posicao[nome];
    const celula = (registro, nome) => {
        const c = col(nome);
        return c === undefined ? "" : String(registro[c] ?? "").trim();
    };

    const cEan = col(COLUNAS.ean);

    if (cEan === undefined) {
        throw new Error("A planilha da distribuidora não tem coluna de EAN.");
    }

    const porEan = {};
    let totalLinhas = 0;

    for (let i = linha + 1; i < matriz.length; i++) {

        const bruta = matriz[i] || [];

        const ean = apenasDigitos(bruta[cEan]);

        if (ean.length < 8) continue;

        const descricao = celula(bruta, COLUNAS.descricao);

        if (!descricao) continue;

        porEan[ean] = {
            descricao,
            laboratorio: celula(bruta, COLUNAS.laboratorio),
            categoria: celula(bruta, COLUNAS.categoria),
            precoFabrica: paraNumero(celula(bruta, COLUNAS.precoFabrica)),
            pmc: paraNumero(celula(bruta, COLUNAS.pmc))
        };

        totalLinhas++;

    }

    if (!totalLinhas) {
        throw new Error("A planilha da distribuidora não trouxe nenhuma linha com EAN e descrição.");
    }

    return {
        versao: 1,
        importadoEm: new Date().toISOString(),
        totalLinhas,
        porEan
    };

}

/** Lê o arquivo escolhido pelo usuário e devolve o índice. */
export async function importarListaDistribuidor(arquivo) {

    const buffer = await arquivo.arrayBuffer();

    const indice = lerPlanilhaDistribuidor(new Uint8Array(buffer));

    return { ...indice, arquivo: arquivo.name };

}

/** Devolve os dados da distribuidora para um EAN, ou null se não achar. */
export function consultarEanDistribuidor(indice, ean) {

    if (!indice) return null;

    const digitos = apenasDigitos(ean);

    if (digitos.length < 8) return null;

    let dados = indice.porEan[digitos];

    // EAN de 12 dígitos (UPC-A) é o mesmo código com um zero na frente.
    if (!dados && digitos.length === 12) {
        dados = indice.porEan["0" + digitos];
    }

    return dados || null;

}
