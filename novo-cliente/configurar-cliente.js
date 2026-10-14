// Troca a marca, endereço e URLs do drogaria-site (um clone pronto pra
// um cliente novo) pelos dados reais desse cliente, de uma vez só -
// sem precisar caçar cada ocorrência de "Drogaria Mais Barato" e das
// URLs antigas manualmente nos ~15 arquivos onde elas aparecem.
//
// Também gera uma cópia do publish-proxy/worker.js já com o
// repositório do catálogo certo, pronta pra colar no Cloudflare -
// sem mexer no arquivo original (ele é compartilhado entre clientes).
//
// Uso:
//   cd novo-cliente
//   node configurar-cliente.js
// (pergunta tudo interativo - nome da loja, CNPJ, endereço, URLs dos
// workers desse cliente)

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function perguntar(texto, padrao = "") {

    return new Promise((resolve) => {
        rl.question(padrao ? `${texto} (Enter pra '${padrao}'): ` : `${texto}: `, (resposta) => {
            resolve(resposta.trim() || padrao);
        });
    });

}

// O que está hoje no drogaria-site (a loja "Drogaria Mais Barato") -
// é isso que o script procura pra substituir. Se um dia a loja de
// origem mudar esses dados, atualiza aqui também.
const DADOS_ANTIGOS = {
    nome: "Drogaria Mais Barato",
    cnpj: "37.925.108/0001-03",
    endereco: "Rua Almeida Leme 07 – Loja 1, Parque São Bernardo, São Bernardo do Campo – SP, CEP 09761-170",
    cidade: "São Bernardo do Campo",
    urlPedidos: "https://farmatech-pedidos-proxy.zaureliojr.workers.dev",
    urlProdutosJson: "https://raw.githubusercontent.com/zaureliojr-bit/Produtos/refs/heads/main/produtos.json",
    urlPadronizador: "https://farmatech-padronizador.zaureliojr.workers.dev",
    repoOwner: "zaureliojr-bit",
    repoNome: "Produtos"
};

// Todo arquivo do drogaria-site que tem marca/endereço/URL fixos -
// achados com grep antes de escrever este script. Arquivo que não
// existir é só pulado (sem erro).
const ARQUIVOS_DROGARIA_SITE = [
    "public/index.html",
    "public/carrinho.html", "public/carrinho.js",
    "public/encarte.html", "public/encarte.js",
    "public/oferta.html", "public/oferta.js",
    "public/produto.html", "public/produto.js",
    "public/painel.html",
    "public/script.js", "public/sw.js", "public/familias.js",
    "public/banners.json", "public/manifest.json", "public/manifest-painel.json",
    "public/style.css"
];

function paraSlug(texto) {

    return texto
        .toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

}

async function main() {

    console.log("\n=== Configurar drogaria-site pra um cliente novo ===\n");

    const pastaDrogariaSite = await perguntar("Caminho da pasta do drogaria-site (já clonada/copiada pro cliente novo)");

    if (!pastaDrogariaSite || !fs.existsSync(path.join(pastaDrogariaSite, "public"))) {
        console.error("\nNão achei uma pasta 'public' dentro desse caminho - confere se é a pasta certa do drogaria-site.");
        rl.close();
        process.exit(1);
    }

    console.log("\n--- Dados da loja nova ---");
    const nome = await perguntar("Nome da loja (ex: Farmácia Saúde Total)");
    const cnpj = await perguntar("CNPJ (formato 00.000.000/0000-00)");
    const endereco = await perguntar("Endereço completo (rua, número, bairro, cidade, UF, CEP)");
    const cidade = await perguntar("Cidade (só o nome - usado em frases como 'entrega em <cidade>')");

    console.log("\n--- Workers desse cliente no Cloudflare (já devem estar implantados) ---");
    const urlPedidos = await perguntar("URL do worker de pedidos (pedidos-proxy)");
    const urlPadronizador = await perguntar("URL do padronizador desse cliente (sem barra no final)");

    console.log("\n--- Catálogo (produtos.json no GitHub) ---");
    const repoOwner = await perguntar("Dono do repositório GitHub do catálogo (usuário/organização)");
    const repoNome = await perguntar("Nome do repositório do catálogo");

    rl.close();

    if (!nome || !cnpj || !endereco || !cidade || !urlPedidos || !urlPadronizador || !repoOwner || !repoNome) {
        console.error("\nTodos os campos são obrigatórios - roda de novo e preenche tudo.");
        process.exit(1);
    }

    const urlProdutosJson = `https://raw.githubusercontent.com/${repoOwner}/${repoNome}/refs/heads/main/produtos.json`;

    // Ordem importa: o endereço completo tem que ser trocado ANTES da
    // cidade sozinha, porque o nome da cidade está embutido dentro do
    // endereço completo - trocando o endereço inteiro primeiro, sobra
    // só as ocorrências da cidade usadas fora dele (textos soltos tipo
    // "entrega em <cidade>").
    const substituicoes = [
        [DADOS_ANTIGOS.endereco, endereco],
        [DADOS_ANTIGOS.cnpj, cnpj],
        [DADOS_ANTIGOS.nome, nome],
        [DADOS_ANTIGOS.cidade, cidade],
        [DADOS_ANTIGOS.urlPedidos, urlPedidos.replace(/\/+$/, "")],
        [DADOS_ANTIGOS.urlProdutosJson, urlProdutosJson],
        [DADOS_ANTIGOS.urlPadronizador, urlPadronizador.replace(/\/+$/, "")]
    ];

    console.log("\nAtualizando arquivos...\n");

    let totalArquivos = 0;
    let totalTrocas = 0;

    for (const caminhoRelativo of ARQUIVOS_DROGARIA_SITE) {

        const caminhoCompleto = path.join(pastaDrogariaSite, caminhoRelativo);

        if (!fs.existsSync(caminhoCompleto)) {
            console.log(`  (pulando, não existe) ${caminhoRelativo}`);
            continue;
        }

        let conteudo = fs.readFileSync(caminhoCompleto, "utf8");
        let trocasNesteArquivo = 0;

        for (const [de, para] of substituicoes) {

            if (!de || de === para) continue;

            const partes = conteudo.split(de);

            if (partes.length > 1) {
                trocasNesteArquivo += partes.length - 1;
                conteudo = partes.join(para);
            }

        }

        if (trocasNesteArquivo > 0) {
            fs.writeFileSync(caminhoCompleto, conteudo, "utf8");
            console.log(`  OK ${caminhoRelativo} (${trocasNesteArquivo} trocas)`);
            totalArquivos++;
            totalTrocas += trocasNesteArquivo;
        }

    }

    console.log(`\n${totalArquivos} arquivos atualizados, ${totalTrocas} trocas no total.`);

    // publish-proxy customizado - não mexe no arquivo original do
    // repositório (ele é compartilhado entre clientes, cada um só
    // precisa de uma cópia colada no próprio Cloudflare).
    const origemPublishProxy = path.join(__dirname, "..", "publish-proxy", "worker.js");
    const pastaSaida = path.join(__dirname, "saida");

    if (fs.existsSync(origemPublishProxy)) {

        let publishProxyConteudo = fs.readFileSync(origemPublishProxy, "utf8")
            .replace(`const REPO_OWNER = "${DADOS_ANTIGOS.repoOwner}";`, `const REPO_OWNER = "${repoOwner}";`)
            .replace(`const REPO_NAME = "${DADOS_ANTIGOS.repoNome}";`, `const REPO_NAME = "${repoNome}";`);

        fs.mkdirSync(pastaSaida, { recursive: true });

        const caminhoSaida = path.join(pastaSaida, `publish-proxy-${paraSlug(nome)}.worker.js`);

        fs.writeFileSync(caminhoSaida, publishProxyConteudo, "utf8");

        console.log("\nGerei uma cópia do publish-proxy já com o repositório certo:");
        console.log(`  ${caminhoSaida}`);
        console.log("  Cola esse conteúdo no Cloudflare ao implantar o worker publish-proxy desse cliente.");

    }

    console.log("\n--- Ainda precisa fazer manualmente ---");
    console.log("  1. Trocar logo.png, icone-180.png, icone-192.png, icone-512.png pelas imagens do cliente novo.");
    console.log("  2. Implantar os workers desse cliente no Cloudflare (imagens-proxy, serper-proxy, cosmos-proxy,");
    console.log("     publish-proxy [usa o arquivo gerado acima], pedidos-proxy), cada um com seu próprio D1/R2.");
    console.log("  3. Implantar o padronizador (frontend/) com um .env apontando pros workers desse cliente.");
    console.log("  4. Criar o repositório GitHub do catálogo (se ainda não existir) e configurar o token no publish-proxy.");
    console.log("  5. Conferir frontend/wrangler.jsonc se quiser um nome de worker diferente pro padronizador desse cliente.");
    console.log("");

}

main();
