/* Mede quanto do catálogo de uma farmácia JÁ está coberto pelo nosso
   acervo de imagens e correções, que é indexado por EAN.

   Por que isto existe: o acervo não é por loja, é por EAN — o mesmo
   código de barras da Dipirona aqui e na rede. Então, antes de escrever
   uma linha de plataforma multiloja, dá para saber em uma tarde quantos
   produtos do cliente novo já chegam com foto e descrição prontas. Esse
   número é argumento de venda, e é mais convincente que qualquer tela.

   Uso:
     node pedidos-proxy/cobertura-acervo.cjs <arquivo>

   O arquivo pode ser:
     - .json  no formato do produtos.json (lista, ou {produtos:[...]})
     - .csv   ou .txt com um EAN por linha, ou a coluna EAN de uma planilha
              (pega o primeiro campo com 8 a 14 dígitos de cada linha)

   Nada é enviado além dos EANs, em lotes de 100. EAN não é dado
   pessoal nem preço: é identificador público de produto.
*/

const fs = require("fs");
const path = require("path");

const ACERVO = process.env.IMAGENS_PROXY_URL
    || "https://farmatech-imagens-proxy.zaureliojr.workers.dev";

const POR_LOTE = 100;   // o limite da rota /lote do worker

function lerEans(arquivo) {
    const bruto = fs.readFileSync(arquivo, "utf8");

    if (path.extname(arquivo).toLowerCase() === ".json") {
        const dados = JSON.parse(bruto);
        const lista = Array.isArray(dados) ? dados : (dados.produtos || []);
        return lista.map((p) => String(p.ean ?? p.EAN ?? "").replace(/\D/g, ""));
    }

    /* Planilha exportada do PDV vem de tudo: com cabeçalho, com ponto e
       vírgula, com a coluna do EAN no meio. Em vez de exigir formato,
       pega o primeiro campo que tem cara de EAN em cada linha. */
    return bruto.split(/\r?\n/).map((linha) => {
        for (const campo of linha.split(/[;,\t|]/)) {
            const so = campo.replace(/\D/g, "");
            if (so.length >= 8 && so.length <= 14) return so;
        }
        return "";
    });
}

function pedacos(lista, tamanho) {
    const saida = [];
    for (let i = 0; i < lista.length; i += tamanho) saida.push(lista.slice(i, i + tamanho));
    return saida;
}

async function consultar(eans) {
    const url = `${ACERVO}/lote?eans=${eans.map(encodeURIComponent).join(",")}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`o acervo respondeu ${r.status}`);
    return await r.json();
}

(async () => {
    const arquivo = process.argv[2];

    if (!arquivo) {
        console.error("uso: node pedidos-proxy/cobertura-acervo.cjs <catalogo.json|lista.csv>");
        process.exit(2);
    }
    if (!fs.existsSync(arquivo)) {
        console.error("não achei o arquivo: " + arquivo);
        process.exit(2);
    }

    const brutos = lerEans(arquivo);
    const semEan = brutos.filter((e) => !e || e.length < 8).length;

    /* Único: um catálogo repete EAN quando o mesmo produto está em mais
       de uma linha do PDV, e contar duas vezes inflaria a cobertura. */
    const eans = [...new Set(brutos.filter((e) => e && e.length >= 8))];

    console.log(`\narquivo:        ${path.basename(arquivo)}`);
    console.log(`linhas lidas:   ${brutos.length}`);
    console.log(`sem EAN válido: ${semEan}`);
    console.log(`EANs únicos:    ${eans.length}`);
    console.log(`\nconsultando o acervo em lotes de ${POR_LOTE}…`);

    const lotes = pedacos(eans, POR_LOTE);
    const achados = new Map();
    const porOrigem = {};

    for (let i = 0; i < lotes.length; i++) {
        let mapa;
        try {
            mapa = await consultar(lotes[i]);
        } catch (erro) {
            /* Um lote que falha não invalida a medição — só reduz a
               amostra. Avisa e segue, em vez de perder o trabalho todo. */
            console.log(`  lote ${i + 1}/${lotes.length}: falhou (${erro.message})`);
            continue;
        }
        for (const [ean, dados] of Object.entries(mapa)) {
            achados.set(ean, dados);
            porOrigem[dados.origem] = (porOrigem[dados.origem] || 0) + 1;
        }
        if ((i + 1) % 10 === 0 || i === lotes.length - 1) {
            console.log(`  lote ${i + 1}/${lotes.length} — ${achados.size} encontrados até aqui`);
        }
    }

    const pct = eans.length ? Math.round((achados.size / eans.length) * 100) : 0;

    console.log(`\n${"=".repeat(52)}`);
    console.log(`JÁ TEMOS IMAGEM DE ${achados.size} DOS ${eans.length} PRODUTOS — ${pct}%`);
    console.log("=".repeat(52));
    console.log(`\nfaltam ${eans.length - achados.size} produtos, que têm EAN e são`);
    console.log(`localizáveis pelos proxies de Cosmos e Serper.`);

    if (Object.keys(porOrigem).length) {
        console.log("\nde onde vieram as que já temos:");
        Object.entries(porOrigem).sort((a, b) => b[1] - a[1])
            .forEach(([o, n]) => console.log(`  ${String(o).padEnd(14)} ${n}`));
    }

    /* Grava os que faltam: é a fila de trabalho do padronizador. */
    const faltando = eans.filter((e) => !achados.has(e));
    if (faltando.length) {
        const saida = path.join(path.dirname(arquivo), "sem-imagem.txt");
        fs.writeFileSync(saida, faltando.join("\n") + "\n");
        console.log(`\nos que faltam estão em: ${saida}`);
    }
})();
