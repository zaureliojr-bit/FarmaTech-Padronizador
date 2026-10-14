// Extrai o catálogo de produtos direto do banco Firebird do Farmax
// (tabela PRODUTOS, cruzada com LABORATORIOS/GRUPOS/CLASSES) e gera
// uma planilha .xlsx com os mesmos nomes de coluna que o FarmaTech
// Padronizador já reconhece - sobe a saída daqui direto no padronizador,
// sem precisar abrir o relatório manual do Farmax.
//
// Uso:
//   1. npm install
//   2. copia .env.example pra .env e preenche com os dados reais
//   3. npm run extrair (ou: node extrair.js)

require("dotenv").config();

const fs = require("fs");
const Firebird = require("node-firebird");
const XLSX = require("xlsx");

const FILIAL = Number(process.env.FB_FILIAL);

if (!Number.isInteger(FILIAL) || FILIAL < 0) {
    console.error("FB_FILIAL precisa ser um número inteiro (ver .env). Confira a tabela FILIAIS no banco.");
    process.exit(1);
}

const OPCOES = {
    host: process.env.FB_HOST || "localhost",
    port: Number(process.env.FB_PORT) || 3050,
    database: process.env.FB_DATABASE,
    user: process.env.FB_USER || "SYSDBA",
    password: process.env.FB_PASSWORD || "masterkey",
    lowercase_keys: false
};

if (!OPCOES.database) {
    console.error("Falta FB_DATABASE no .env - caminho do arquivo .FDB.");
    process.exit(1);
}

// FILIAL decide os nomes das colunas de estoque/preço/custo (ESTOQUE_3,
// PRECO_VENDA_3...) - não dá pra amarrar nome de coluna como parâmetro
// no Firebird, por isso o número entra direto na string. Já validado
// acima que é um inteiro, então não abre brecha de SQL injection.
const sufixo = (campo) => FILIAL === 0 ? campo : `${campo}_${FILIAL}`;

const CONSULTA = `
    SELECT
        P.CD_PRODUTO                    AS CODIGO,
        P.CODIGO_BARRAS_1               AS EAN,
        P.DESCRICAO                     AS DESCRICAO,
        L.NOME                          AS LABORATORIO,
        G.DESCRICAO                     AS CATEGORIA,
        C.DESCRICAO                     AS CLASSE,
        P.${sufixo("PRECO_VENDA")}      AS PRECO_VENDA,
        P.${sufixo("PRECO_PROMOCAO")}   AS PRECO_PROMOCAO,
        P.${sufixo("CUSTO_UNITARIO")}   AS PRECO_CUSTO,
        P.${sufixo("ESTOQUE")}          AS ESTOQUE
    FROM PRODUTOS P
    LEFT JOIN LABORATORIOS L ON L.CD_LABORATORIO = P.CD_LABORATORIO
    LEFT JOIN GRUPOS G ON G.CD_GRUPO = P.CD_GRUPO
    LEFT JOIN CLASSES C ON C.CD_CLASSE = P.CD_CLASSE
    WHERE P.STATUS = 'A'
      AND P.${sufixo("ESTOQUE")} > 0
    ORDER BY P.CD_PRODUTO
`;

// Nomes de coluna que o padronizador já reconhece sozinho
// (ver frontend/src/utils/camposPadrao.js) - não precisa mexer em
// nada do lado do padronizador, só subir o arquivo que sai daqui.
function paraLinhaPlanilha(linha) {

    return {
        "Código": linha.CODIGO,
        "EAN": linha.EAN,
        "Descrição": linha.DESCRICAO,
        "Laboratório": linha.LABORATORIO,
        "Categoria": linha.CATEGORIA,
        "Classe": linha.CLASSE,
        "Preço Venda": linha.PRECO_VENDA,
        "Promoção": linha.PRECO_PROMOCAO,
        "Preço Custo": linha.PRECO_CUSTO,
        "Estoque": linha.ESTOQUE
    };

}

// Manda o .xlsx pro mesmo worker que já hospeda as imagens (rotas
// /extracao* do imagens-proxy) - o painel do site, ao abrir, vê que
// tem uma extração nova esperando e avisa com um botão "Importar
// agora", sem precisar arrastar o arquivo manualmente. Se UPLOAD_URL
// não estiver configurado, só pula essa parte - o arquivo local
// continua sendo gerado normalmente.
async function enviarParaPainel(caminhoArquivo) {

    const uploadUrl = (process.env.UPLOAD_URL || "").trim().replace(/\/+$/, "");

    if (!uploadUrl) {
        console.log("UPLOAD_URL não configurado no .env - o arquivo só ficou salvo localmente (não avisei o painel).");
        return;
    }

    // .trim() - um espaço ou caractere invisível sobrando no valor
    // (ex.: de copiar/colar) quebra o cabeçalho HTTP com um erro que
    // não deixa óbvio a causa ("Invalid character in header content").
    const uploadKey = (process.env.UPLOAD_KEY || "").trim();

    const bytes = fs.readFileSync(caminhoArquivo);

    try {

        const resposta = await fetch(`${uploadUrl}/extracao?nome=${encodeURIComponent(caminhoArquivo)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream",
                "X-Imagens-Key": uploadKey
            },
            body: bytes
        });

        if (!resposta.ok) {
            const corpo = await resposta.text().catch(() => "");
            console.error(`Não consegui avisar o painel (HTTP ${resposta.status}): ${corpo}`);
            return;
        }

        console.log("Painel avisado - a extração já aparece lá esperando um clique em \"Importar agora\".");

    } catch (erro) {

        console.error("Não consegui avisar o painel:", erro.message);

    }

}

Firebird.attach(OPCOES, (erro, db) => {

    if (erro) {

        console.error("Não consegui conectar no Firebird:", erro.message);
        console.error("Confere: Firebird rodando, caminho do arquivo, usuário/senha no .env.");
        process.exit(1);

    }

    // node-firebird 2.x exige o array de parâmetros (mesmo vazio) -
    // sem ele, versões antigas aceitavam só consulta+callback.
    db.query(CONSULTA, [], async (erroConsulta, linhas) => {

        db.detach();

        if (erroConsulta) {
            console.error("Erro ao rodar a consulta:", erroConsulta.message);
            process.exit(1);
        }

        if (!linhas || !linhas.length) {
            console.warn("A consulta não trouxe nenhuma linha - confere o filtro STATUS = 'A' e o FB_FILIAL no .env.");
            process.exit(0);
        }

        const planilha = linhas.map(paraLinhaPlanilha);

        const livro = XLSX.utils.book_new();
        const aba = XLSX.utils.json_to_sheet(planilha);

        XLSX.utils.book_append_sheet(livro, aba, "PRODUTOS");

        const saida = process.env.SAIDA_ARQUIVO || "produtos_extraidos.xlsx";

        XLSX.writeFile(livro, saida);

        console.log(`Pronto! ${linhas.length} produtos exportados pra "${saida}" (filial ${FILIAL}).`);
        console.log("Já pode subir esse arquivo direto no FarmaTech Padronizador.");

        await enviarParaPainel(saida);

    });

});
