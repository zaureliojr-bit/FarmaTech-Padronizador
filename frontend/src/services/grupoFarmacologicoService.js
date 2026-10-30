/**
 * Classificação farmacológica por substância ativa (Grupo > Subgrupo >
 * Classe), extraída do MyMedFarma - ver mymedfarma-extrator/. Parecida
 * com a ATC internacional, numa árvore de ~4 níveis.
 *
 * Diferente da CMED e da lista da distribuidora, isso NÃO cruza por
 * EAN - o EAN é por apresentação (caixa com 10, caixa com 30...), a
 * classificação farmacológica é por princípio ativo. A chave de busca
 * é a própria `substancia` que a CMED já grava em cada produto (ver
 * cmedService.js) - produto sem CMED carregada, ou sem bater com
 * nenhuma substância da árvore, simplesmente não ganha estes campos.
 *
 * Formato esperado: planilha com colunas Substância / Grupo / Subgrupo
 * / Classe - exatamente o que `npm run extrair` gera em
 * mymedfarma-extrator/grupos_farmacologicos.xlsx.
 */

import * as XLSX from "xlsx";

const COLUNAS = {
    substancia: "SUBSTÂNCIA",
    grupo: "GRUPO",
    subgrupo: "SUBGRUPO",
    classe: "CLASSE"
};

/** Mesma normalização de chaveCategoria em familias.js - maiúsculo e espaço único, mas sem tirar acento (a CMED também não tira). */
function chaveSubstancia(nome) {

    return (nome || "").trim().toUpperCase().replace(/\s+/g, " ");

}

/** Procura a linha que tem "SUBSTÂNCIA" e "GRUPO" ao mesmo tempo. */
function acharCabecalho(matriz) {

    for (let i = 0; i < Math.min(matriz.length, 50); i++) {

        const celulas = (matriz[i] || []).map(
            (c) => String(c ?? "").trim().toUpperCase()
        );

        if (celulas.includes(COLUNAS.substancia) && celulas.includes(COLUNAS.grupo)) {

            const posicao = {};

            celulas.forEach((nome, coluna) => {
                if (nome && !(nome in posicao)) posicao[nome] = coluna;
            });

            return { linha: i, posicao };

        }

    }

    return null;

}

export function lerPlanilhaGrupoFarmacologico(dados) {

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
            "Não encontrei um cabeçalho com Substância e Grupo nesta planilha."
        );
    }

    const { linha, posicao } = cabecalho;

    const col = (nome) => posicao[nome];
    const celula = (registro, nome) => {
        const c = col(nome);
        return c === undefined ? "" : String(registro[c] ?? "").trim();
    };

    const cSubstancia = col(COLUNAS.substancia);

    if (cSubstancia === undefined) {
        throw new Error("A planilha não tem coluna de Substância.");
    }

    const porSubstancia = {};
    let totalLinhas = 0;

    for (let i = linha + 1; i < matriz.length; i++) {

        const bruta = matriz[i] || [];

        const substancia = celula(bruta, COLUNAS.substancia);

        if (!substancia) continue;

        const chave = chaveSubstancia(substancia);

        // Uma substância pode aparecer mais de uma vez na árvore (ex.:
        // associação medicamentosa listada nos dois componentes) - fica
        // a primeira ocorrência, não vale a pena escolher "a melhor".
        if (porSubstancia[chave]) continue;

        porSubstancia[chave] = {
            grupo: celula(bruta, COLUNAS.grupo),
            subgrupo: celula(bruta, COLUNAS.subgrupo),
            classe: celula(bruta, COLUNAS.classe)
        };

        totalLinhas++;

    }

    if (!totalLinhas) {
        throw new Error("A planilha não trouxe nenhuma linha com Substância.");
    }

    return {
        versao: 1,
        importadoEm: new Date().toISOString(),
        totalLinhas,
        porSubstancia
    };

}

/** Lê o arquivo escolhido pelo usuário e devolve o índice. */
export async function importarGrupoFarmacologico(arquivo) {

    const buffer = await arquivo.arrayBuffer();

    const indice = lerPlanilhaGrupoFarmacologico(new Uint8Array(buffer));

    return { ...indice, arquivo: arquivo.name };

}

/** Devolve {grupo, subgrupo, classe} para uma substância, ou null se não achar. */
export function consultarSubstancia(indice, substancia) {

    if (!indice || !substancia) return null;

    return indice.porSubstancia[chaveSubstancia(substancia)] || null;

}
