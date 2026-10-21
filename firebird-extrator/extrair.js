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

// A versão impressa na primeira linha do log.
//
// Existe por um problema prático de campo: o extrator roda como um .exe
// autônomo no PC da farmácia, e atualizar é copiar o arquivo por cima.
// Quando dá ruim ("a aba Estoque está vazia"), a primeira pergunta é
// "qual versão está rodando lá?" - e até aqui a resposta era espiar o
// extracao.log tentando reconhecer frases que mudaram entre as versões.
//
// Uma linha no começo do log responde isso de longe, inclusive numa
// foto do terminal mandada por WhatsApp. Sobe quando o que o extrator
// MANDA pra fora muda (colunas da planilha, fotografia de estoque) -
// não a cada ajuste interno.
const VERSAO = "2.0 (catálogo + fotografia de estoque)";

console.log(`Extrator DrogaLink ${VERSAO}`);

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

// ---------------------------------------------------------------------
// A segunda consulta: estoque e giro
// ---------------------------------------------------------------------
//
// É a MESMA tabela da de cima, com uma diferença de uma linha - e essa
// linha é o problema inteiro. A consulta do catálogo termina com
// ESTOQUE > 0, porque não se mostra no site o que não dá pra vender.
//
// Só que ruptura É o produto com estoque zero. A consulta que alimenta
// o site descarta, por definição, tudo que a análise de ruptura precisa
// ver. Por isso são duas consultas e não um ajuste naquela: mexer lá
// encheria a vitrine de produto esgotado.
//
// Traz menos colunas de propósito: nome de laboratório e categoria não
// entram em conta nenhuma de giro, e são o grosso dos bytes de 6.800
// linhas saindo pela internet de uma farmácia.
//
// FB_COLUNA_MINIMO e FB_COLUNA_VALIDADE ficam vazias por padrão. Nem
// toda instalação do Farmax tem essas colunas, e pedir uma coluna que
// não existe derruba a consulta INTEIRA - levando junto o estoque, que
// é o que importa. Quem souber que tem, preenche no .env e ganha o
// ponto de reposição e o encalhe perto do vencimento.
const COLUNA_MINIMO = (process.env.FB_COLUNA_MINIMO || "").trim();
const COLUNA_VALIDADE = (process.env.FB_COLUNA_VALIDADE || "").trim();

function colunaOpcional(nome, apelido) {
    // Só nome de coluna: isto entra direto no SQL, e nome de coluna não
    // dá pra passar como parâmetro no Firebird.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nome)) return `NULL AS ${apelido}`;
    return `P.${nome} AS ${apelido}`;
}

const CONSULTA_ESTOQUE = `
    SELECT
        P.CODIGO_BARRAS_1               AS EAN,
        P.CD_PRODUTO                    AS CODIGO,
        P.DESCRICAO                     AS DESCRICAO,
        P.${sufixo("ESTOQUE")}          AS ESTOQUE,
        P.${sufixo("CUSTO_UNITARIO")}   AS CUSTO,
        P.${sufixo("PRECO_VENDA")}      AS PRECO,
        ${colunaOpcional(COLUNA_MINIMO, "MINIMO")},
        ${colunaOpcional(COLUNA_VALIDADE, "VALIDADE")}
    FROM PRODUTOS P
    WHERE P.STATUS = 'A'
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

// Manda a fotografia do estoque pro pedidos-proxy, que guarda no banco
// DA FARMÁCIA e calcula giro comparando com a fotografia de ontem.
//
// A data vai junto, e é a data LOCAL daqui. Uma extração às 22h em
// Cuiabá é do dia 14 pra quem trabalha na farmácia e seria do dia 15 em
// UTC - o relatório tem que bater com o calendário de quem lê.
async function enviarEstoque(linhas) {

    const url = (process.env.ESTOQUE_URL || "").trim().replace(/\/+$/, "");

    if (!url) {
        console.log("ESTOQUE_URL não configurado no .env - não mandei a fotografia de estoque (o catálogo não depende disso).");
        return;
    }

    const chave = (process.env.ESTOQUE_KEY || "").trim();
    const loja = (process.env.ESTOQUE_LOJA || "").trim();

    const agora = new Date();
    const dia = [
        agora.getFullYear(),
        String(agora.getMonth() + 1).padStart(2, "0"),
        String(agora.getDate()).padStart(2, "0")
    ].join("-");

    const comoData = (v) => {
        if (!v) return null;
        const d = v instanceof Date ? v : new Date(v);
        return isNaN(d) ? null : d.toISOString().slice(0, 10);
    };

    const produtos = linhas.map((l) => ({
        ean: String(l.EAN || "").trim(),
        codigo: l.CODIGO,
        descricao: l.DESCRICAO,
        estoque: l.ESTOQUE,
        custo: l.CUSTO,
        preco: l.PRECO,
        minimo: l.MINIMO,
        validade: comoData(l.VALIDADE)
    }));

    // Em pedaços porque o worker recusa envio grande demais - e porque
    // um erro de rede no meio de 6.800 produtos custa um pedaço, não a
    // extração inteira. Cada pedaço é atômico do lado de lá.
    const TAMANHO = 1000;
    let enviados = 0;
    let movimentos = 0;

    for (let i = 0; i < produtos.length; i += TAMANHO) {

        const pedaco = produtos.slice(i, i + TAMANHO);

        try {

            const resposta = await fetch(`${url}/estoque`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Painel-Key": chave,
                    ...(loja ? { "X-Painel-Loja": loja } : {})
                },
                body: JSON.stringify({ dia, produtos: pedaco })
            });

            if (!resposta.ok) {
                const corpo = await resposta.text().catch(() => "");
                console.error(`Estoque: o worker recusou o pedaço ${i / TAMANHO + 1} (HTTP ${resposta.status}): ${corpo}`);
                return;
            }

            const dados = await resposta.json().catch(() => ({}));
            enviados += dados.gravados || 0;
            movimentos += dados.movimentos || 0;

        } catch (erroRede) {
            console.error("Estoque: não consegui falar com o worker:", erroRede.message);
            return;
        }

    }

    console.log(`Estoque do dia ${dia} enviado: ${enviados} produtos, ${movimentos} com movimento desde a última extração.`);

    if (movimentos === 0 && enviados > 0) {
        // Primeira extração da vida: não há "ontem" pra comparar, e é
        // esperado. Dito aqui pra ninguém achar que não funcionou.
        console.log("Nenhum movimento ainda - se esta foi a primeira extração, é o esperado: o giro começa a aparecer amanhã.");
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

        // A consulta de estoque roda ANTES do detach, na mesma conexão:
        // abrir uma segunda conexão custaria outra autenticação no
        // Firebird e, em instalação com licença limitada de usuários,
        // pode simplesmente ser recusada.
        //
        // O resultado dela é guardado e usado lá embaixo, depois que o
        // .xlsx estiver salvo. A ordem importa: o catálogo é o que a
        // farmácia contratou, e uma falha no estoque - que é extra -
        // não pode impedir a planilha de ser gerada.
        const estoque = await new Promise((resolver) => {
            db.query(CONSULTA_ESTOQUE, [], (erroEstoque, linhasEstoque) => {
                if (erroEstoque) {
                    console.error("Não consegui ler o estoque:", erroEstoque.message);
                    if (COLUNA_MINIMO || COLUNA_VALIDADE) {
                        console.error("Confere FB_COLUNA_MINIMO e FB_COLUNA_VALIDADE no .env - se a coluna não existir nesta instalação, deixe vazio.");
                    }
                    return resolver(null);
                }
                resolver(linhasEstoque || []);
            });
        });

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
        console.log("Já pode subir esse arquivo direto no DrogaLink Padronizador.");

        await enviarParaPainel(saida);

        if (estoque && estoque.length) await enviarEstoque(estoque);

    });

});
