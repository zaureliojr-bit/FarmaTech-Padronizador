/**
 * Módulo CMED — padronização de medicamentos pela lista oficial da ANVISA.
 *
 * A planilha do FarmaxPDV não diz se um medicamento exige receita nem qual é
 * o preço máximo que a lei permite cobrar por ele. A Lista de Conformidade da
 * CMED diz as duas coisas, e casa com o nosso cadastro pelo EAN.
 *
 * Baixe a lista do mês em:
 *   https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos
 * O link do arquivo precisa terminar em "/@@download/file" — a página em si
 * devolve HTML, não a planilha.
 *
 * O que este módulo acrescenta a cada produto:
 *   tarja             P / R / V / L  (ver TARJA_*)
 *   exigeReceita      não entra no carrinho do site
 *   substancia        princípio ativo
 *   classeTerapeutica
 *   tipoProduto       Genérico, Similar, Novo...
 *   registroAnvisa
 *   pmc               preço máximo ao consumidor, ICMS 18% (São Paulo)
 *   acimaDoPmc        vender acima do PMC viola a Lei 10.742/2003
 */

import * as XLSX from "xlsx";

/** P = tarja preta (Portaria 344). Receita retida, retirada presencial. */
export const TARJA_PRETA = "P";

/** R = tarja vermelha sob restrição. */
export const TARJA_RESTRITA = "R";

/** V = tarja vermelha. Venda sob prescrição. */
export const TARJA_VERMELHA = "V";

/** L = sem tarja (MIP). Único grupo que pode ir para o carrinho. */
export const TARJA_LIVRE = "L";

const CODIGO_DA_TARJA = {
    "Tarja Preta": TARJA_PRETA,
    "Tarja Vermelha sob restrição": TARJA_RESTRITA,
    "Tarja Vermelha": TARJA_VERMELHA,
    "Tarja Sem Tarja": TARJA_LIVRE
};

/** Quanto mais alto, mais restritivo. Empate sempre resolve para cima. */
const PESO_DA_TARJA = {
    [TARJA_PRETA]: 4,
    [TARJA_RESTRITA]: 3,
    [TARJA_VERMELHA]: 2,
    [TARJA_LIVRE]: 1
};

export const TARJA_EXIGE_RECEITA = [
    TARJA_PRETA,
    TARJA_RESTRITA,
    TARJA_VERMELHA
];

export const NOME_DA_TARJA = {
    [TARJA_PRETA]: "Tarja preta — retenção de receita",
    [TARJA_RESTRITA]: "Tarja vermelha sob restrição",
    [TARJA_VERMELHA]: "Tarja vermelha — venda sob prescrição",
    [TARJA_LIVRE]: "Isento de prescrição"
};

/**
 * Colunas que a gente usa, pelo nome que aparece no cabeçalho da planilha.
 * A CMED mexe na ordem das colunas de tempos em tempos, então a busca é
 * pelo nome — nunca pela posição.
 */
const COLUNAS = {
    substancia: "SUBSTÂNCIA",
    laboratorio: "LABORATÓRIO",
    registro: "REGISTRO",
    produto: "PRODUTO",
    apresentacao: "APRESENTAÇÃO",
    classeTerapeutica: "CLASSE TERAPÊUTICA",
    tipo: "TIPO DE PRODUTO (STATUS DO PRODUTO)",
    regime: "REGIME DE PREÇO",
    // São Bernardo do Campo é São Paulo, e o ICMS daqui é 18%. Também é o
    // teto mais alto da tabela: usar ele é o critério mais favorável à loja,
    // então o que passar dele passou mesmo.
    pmc: "PMC 18 %",
    tarja: "TARJA"
};

/** "1.234,56" e 1234.56 viram 1234.56. Devolve null se não der. */
function paraNumero(valor) {

    if (valor === null || valor === undefined || valor === "") return null;

    if (typeof valor === "number") {
        return Number.isFinite(valor) ? valor : null;
    }

    const limpo = String(valor)
        .trim()
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(",", ".");

    const n = Number(limpo);

    return Number.isFinite(n) ? n : null;
}

/** Só os dígitos. EAN vem com pontuação, espaço e às vezes como número. */
export function apenasDigitos(valor) {

    return String(valor ?? "").replace(/\D/g, "");

}

/**
 * A planilha da CMED começa com umas 40 linhas de texto explicativo antes
 * do cabeçalho de verdade, e o número de linhas muda a cada edição.
 * Procura a linha que tem "EAN 1" e "TARJA".
 */
function acharCabecalho(matriz) {

    for (let i = 0; i < Math.min(matriz.length, 200); i++) {

        const celulas = (matriz[i] || []).map(
            (c) => String(c ?? "").trim().toUpperCase()
        );

        if (celulas.includes("EAN 1") && celulas.includes("TARJA")) {

            const posicao = {};

            celulas.forEach((nome, coluna) => {
                if (nome && !(nome in posicao)) posicao[nome] = coluna;
            });

            return { linha: i, posicao };

        }

    }

    return null;

}

/**
 * Lê a planilha da CMED e devolve o índice por EAN.
 *
 * O índice é compacto de propósito: substância, laboratório, classe e tipo
 * se repetem muito, então viram dicionários, e as linhas iguais viram uma só.
 * São 8,3 MB de dados que cabem em 2,4 MB — o que faz diferença na hora de
 * guardar e de recarregar.
 */
export function lerPlanilhaCmed(dados) {

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
            "Não encontrei o cabeçalho da CMED nesta planilha. " +
            "Confira se o arquivo é a Lista de Conformidade e não a página do site salva."
        );
    }

    const { linha, posicao } = cabecalho;

    const col = (nome) => posicao[nome];
    const celula = (registro, nome) => {
        const c = col(nome);
        return c === undefined ? "" : String(registro[c] ?? "").trim();
    };

    const colunasEan = ["EAN 1", "EAN 2", "EAN 3"]
        .map(col)
        .filter((c) => c !== undefined);

    if (!colunasEan.length) {
        throw new Error("A planilha da CMED não tem coluna de EAN.");
    }

    // ---- passo 1: ler as linhas ----------------------------------------

    const linhas = [];

    for (let i = linha + 1; i < matriz.length; i++) {

        const bruta = matriz[i] || [];

        const substancia = celula(bruta, COLUNAS.substancia).toUpperCase();

        if (!substancia) continue;

        const eans = colunasEan
            .map((c) => apenasDigitos(bruta[c]))
            .filter((e) => e.length >= 8);

        if (!eans.length) continue;

        linhas.push({
            eans,
            substancia,
            laboratorio: celula(bruta, COLUNAS.laboratorio),
            registro: celula(bruta, COLUNAS.registro),
            produto: celula(bruta, COLUNAS.produto),
            apresentacao: celula(bruta, COLUNAS.apresentacao),
            classeTerapeutica: celula(bruta, COLUNAS.classeTerapeutica),
            tipo: celula(bruta, COLUNAS.tipo),
            regime: celula(bruta, COLUNAS.regime),
            pmc: paraNumero(celula(bruta, COLUNAS.pmc)),
            tarjaBruta: celula(bruta, COLUNAS.tarja)
        });

    }

    if (!linhas.length) {
        throw new Error("A planilha da CMED não trouxe nenhuma linha com EAN.");
    }

    // ---- passo 2: resolver a tarja de cada linha ------------------------

    // Quais tarjas já apareceram para cada substância. Serve para os dois
    // ajustes abaixo, e por isso é montado antes de decidir qualquer coisa.
    const tarjasDaSubstancia = new Map();

    linhas.forEach((l) => {

        const codigo = CODIGO_DA_TARJA[l.tarjaBruta];

        if (!codigo) return;

        if (!tarjasDaSubstancia.has(l.substancia)) {
            tarjasDaSubstancia.set(l.substancia, new Map());
        }

        const contagem = tarjasDaSubstancia.get(l.substancia);

        contagem.set(codigo, (contagem.get(codigo) || 0) + 1);

    });

    // A Portaria 344 vale para a substância, não para a apresentação. A CMED
    // se contradiz em algumas — Alprazolam aparece como vermelha em umas
    // apresentações e preta em outras — e nesses casos a preta é a certa.
    const substanciasPretas = new Set();

    tarjasDaSubstancia.forEach((contagem, substancia) => {
        if (contagem.has(TARJA_PRETA)) substanciasPretas.add(substancia);
    });

    const resolverTarja = (l) => {

        if (substanciasPretas.has(l.substancia)) return TARJA_PRETA;

        const direta = CODIGO_DA_TARJA[l.tarjaBruta];

        if (direta) return direta;

        // A CMED escreve "- (*)" quando não informou a tarja. Nesses casos
        // vale a tarja que a mesma substância tem nas outras apresentações,
        // e no empate a mais restritiva.
        const contagem = tarjasDaSubstancia.get(l.substancia);

        if (!contagem) return "";

        let melhor = "";

        contagem.forEach((vezes, codigo) => {

            if (!melhor) { melhor = codigo; return; }

            const atual = [PESO_DA_TARJA[codigo], vezes];
            const anterior = [PESO_DA_TARJA[melhor], contagem.get(melhor)];

            if (atual[0] > anterior[0] ||
                (atual[0] === anterior[0] && atual[1] > anterior[1])) {
                melhor = codigo;
            }

        });

        return melhor;

    };

    // ---- passo 3: montar o índice compacto ------------------------------

    const dicionarios = {
        substancia: new Map(),
        laboratorio: new Map(),
        classeTerapeutica: new Map(),
        tipo: new Map()
    };

    const indiceDe = (dic, texto) => {

        if (!dicionarios[dic].has(texto)) {
            dicionarios[dic].set(texto, dicionarios[dic].size);
        }

        return dicionarios[dic].get(texto);

    };

    const chaveDaLinha = new Map();
    const registros = [];
    const porEan = new Map();

    // O mesmo EAN pode aparecer em linhas com PMC diferente. Para a checagem
    // de preço fica sempre o teto MAIS ALTO: acusar a loja de vender acima do
    // máximo legal só vale se ela passou até do limite mais generoso.
    // Vai separado porque o registro escolhido é o da tarja mais restritiva,
    // que não é necessariamente o do PMC maior.
    const pmcPorEan = new Map();

    linhas.forEach((l) => {

        // Tarja vazia acontece quando a CMED não informou e a substância não
        // aparece em nenhuma outra linha. A linha continua valendo: o preço
        // máximo e o princípio ativo dela são úteis mesmo sem a tarja.
        const tarja = resolverTarja(l);

        const registro = [
            indiceDe("substancia", l.substancia),
            indiceDe("laboratorio", l.laboratorio),
            indiceDe("classeTerapeutica", l.classeTerapeutica),
            indiceDe("tipo", l.tipo),
            tarja,
            l.regime,
            l.pmc,
            l.registro
        ];

        // com separador: sem ele "1"+"23" e "12"+"3" dariam a mesma chave
        const chave = registro.join("|");

        if (!chaveDaLinha.has(chave)) {
            chaveDaLinha.set(chave, registros.length);
            registros.push(registro);
        }

        const posicaoRegistro = chaveDaLinha.get(chave);

        l.eans.forEach((ean) => {

            if (l.regime === "Regulado" && l.pmc > 0) {

                const tetoAtual = pmcPorEan.get(ean);

                if (tetoAtual === undefined || l.pmc > tetoAtual) {
                    pmcPorEan.set(ean, l.pmc);
                }

            }

            // O mesmo EAN pode aparecer em mais de uma linha, às vezes com
            // tarjas diferentes. Fica a mais restritiva: se ficasse a última
            // lida, a ordem do arquivo é que decidiria o que vai ao carrinho.
            const jaTem = porEan.get(ean);

            if (jaTem !== undefined) {

                const tarjaAtual = registros[jaTem][4];

                const peso = PESO_DA_TARJA[tarja] || 0;
                const pesoAtual = PESO_DA_TARJA[tarjaAtual] || 0;

                if (peso <= pesoAtual) return;

            }

            porEan.set(ean, posicaoRegistro);

        });

    });

    const listaDe = (dic) => [...dicionarios[dic].keys()];

    return {
        versao: 1,
        importadoEm: new Date().toISOString(),
        totalLinhas: linhas.length,
        substanciasTratadasComoPreta: substanciasPretas.size,
        dicionarios: {
            substancia: listaDe("substancia"),
            laboratorio: listaDe("laboratorio"),
            classeTerapeutica: listaDe("classeTerapeutica"),
            tipo: listaDe("tipo")
        },
        registros,
        // Objetos, e não Map, porque isto vai ser serializado e guardado.
        porEan: Object.fromEntries(porEan),
        pmcPorEan: Object.fromEntries(pmcPorEan)
    };

}

/** Lê o arquivo escolhido pelo usuário e devolve o índice. */
export async function importarListaCmed(arquivo) {

    const buffer = await arquivo.arrayBuffer();

    const indice = lerPlanilhaCmed(new Uint8Array(buffer));

    return { ...indice, arquivo: arquivo.name };

}

/** Devolve os dados da CMED para um EAN, ou null se ele não estiver na lista. */
export function consultarEan(indice, ean) {

    if (!indice) return null;

    const digitos = apenasDigitos(ean);

    if (digitos.length < 8) return null;

    let chave = digitos;
    let posicao = indice.porEan[chave];

    // EAN de 12 dígitos (UPC-A) é o mesmo código com um zero na frente.
    if (posicao === undefined && digitos.length === 12) {
        chave = "0" + digitos;
        posicao = indice.porEan[chave];
    }

    if (posicao === undefined) return null;

    const [
        iSubstancia,
        iLaboratorio,
        iClasse,
        iTipo,
        tarja,
        regime,
        pmc,
        registro
    ] = indice.registros[posicao];

    const dic = indice.dicionarios;

    return {
        substancia: dic.substancia[iSubstancia] || "",
        laboratorio: dic.laboratorio[iLaboratorio] || "",
        classeTerapeutica: dic.classeTerapeutica[iClasse] || "",
        tipo: dic.tipo[iTipo] || "",
        tarja,
        nomeDaTarja: NOME_DA_TARJA[tarja] || "",
        exigeReceita: TARJA_EXIGE_RECEITA.includes(tarja),
        regime,
        // "Liberado" é medicamento sem teto de preço — só o "Regulado" tem
        // PMC. O teto sai do índice à parte, que guarda o maior valor visto
        // para este EAN (ver pmcPorEan). O pmc do registro é o desempate.
        pmc: indice.pmcPorEan?.[chave] ??
            (regime === "Regulado" ? pmc : null),
        registroAnvisa: registro
    };

}
