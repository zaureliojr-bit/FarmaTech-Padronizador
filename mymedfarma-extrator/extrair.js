// Baixa a árvore de Grupos Farmacológicos do MyMedFarma e monta uma
// tabela Substância -> Grupo / Subgrupo / Classe - referência pra
// classificar medicamento por substância ativa (o padronizador já
// extrai a substância de cada medicamento a partir da CMED).
//
// Diferente dos extratores da DPCNET/DCA, isso NÃO é um catálogo de
// produtos (sem EAN, sem código de barras) - é uma árvore de
// classificação farmacológica, parecida com a ATC internacional, numa
// página só: https://www.mymedfarma.com/pt/grupos-farmacologicos
//
// A árvore inteira já vem pronta no HTML da página (confirmado via
// Ctrl+U + Ctrl+F no navegador - os nós escondidos pelo "+"/"-" do
// menu já estão no HTML, só ficam ocultos por CSS/JS), e cada nível
// carrega o caminho numérico completo (ex.: "3.1.1.1. DIGOXINA") - dá
// pra montar a hierarquia inteira só lendo esses números, sem precisar
// entender a estrutura de <ul>/<li> aninhada da página.
//
// Isso é engenharia reversa de uma página pública, não uma API oficial
// - pode parar de funcionar se o site mudar o HTML, sem aviso nenhum.
// Uma página só, uma vez de vez em quando (a classificação não muda
// todo dia) - não precisa agendar nem rodar com frequência.
//
// Uso: npm install && npm run extrair

const XLSX = require("xlsx");

const URL_ARVORE = "https://www.mymedfarma.com/pt/grupos-farmacologicos";

const SAIDA_ARQUIVO = process.env.SAIDA_ARQUIVO || "grupos_farmacologicos.xlsx";

const CABECALHOS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// Cabeçalho de grupo/subgrupo/classe: "<p>3.1.1. Digitálicos</p>" ->
// caminho "3.1.1", nome "Digitálicos". [\d.]+ engole o ponto final
// junto (ele também é dígito-ou-ponto), mas o \. seguinte obriga o
// regex a devolver esse último ponto pro grupo 2 (espaço) + nome.
const REGEX_CABECALHO = /<p>([\d.]+)\.\s*([^<]+)<\/p>/g;

// Folha (substância): "<a href=".../559-digoxina" title="DIGOXINA">
// 3.1.1.1. DIGOXINA</a>" - o title já vem com o nome limpo (maiúsculo,
// sem numeração), mais confiável que tentar separar do texto do link.
const REGEX_SUBSTANCIA = /<a href="pt\/principios-ativos\/\d+-[a-z0-9_-]+" title="([^"]+)"\s*>([\d.]+)\./g;

async function buscarHtml(url) {

    const resposta = await fetch(url, { headers: CABECALHOS });

    if (!resposta.ok) {
        throw new Error(`HTTP ${resposta.status} em ${url}`);
    }

    return resposta.text();

}

// Caminho "3.1.1.1" -> ["3", "3.1", "3.1.1", "3.1.1.1"] (do mais largo
// pro mais específico) - usado pra subir a árvore até achar o nome de
// cada nível ancestral.
function caminhosAncestrais(caminho) {

    const partes = caminho.split(".");

    return partes.map((_, i) => partes.slice(0, i + 1).join("."));

}

async function extrair() {

    console.log("Buscando a árvore de grupos farmacológicos...");

    const html = await buscarHtml(URL_ARVORE);

    const nomePorCaminho = new Map();

    let m;

    REGEX_CABECALHO.lastIndex = 0;
    while ((m = REGEX_CABECALHO.exec(html)) !== null) {
        nomePorCaminho.set(m[1], m[2].trim());
    }

    console.log(`${nomePorCaminho.size} grupo(s)/subgrupo(s)/classe(s) encontrados.`);

    const substancias = [];

    REGEX_SUBSTANCIA.lastIndex = 0;
    while ((m = REGEX_SUBSTANCIA.exec(html)) !== null) {
        substancias.push({ nome: m[1].trim(), caminho: m[2] });
    }

    console.log(`${substancias.length} substância(s) encontradas.`);

    if (!substancias.length) {
        console.warn("Nenhuma substância encontrada - confere manualmente no navegador (Ctrl+U na página) se o HTML ainda tem esse formato.");
        process.exit(0);
    }

    // Uma substância pode aparecer em mais de um grupo (ex.: associação
    // medicamentosa listada nos dois componentes) - guarda todas as
    // ocorrências, a planilha final não deduplica por nome.
    const linhas = substancias.map(({ nome, caminho }) => {

        const ancestrais = caminhosAncestrais(caminho);

        // Último ancestral é a própria substância (nível 4) - os 3
        // primeiros são Grupo / Subgrupo / Classe. Se a árvore tiver
        // menos de 4 níveis nesse ramo (substância direto num grupo
        // maior), os campos que faltam ficam vazios em vez de errados.
        const [grupo, subgrupo, classe] = ancestrais;

        return {
            "Substância": nome,
            "Grupo": grupo ? (nomePorCaminho.get(grupo) || "") : "",
            "Subgrupo": subgrupo ? (nomePorCaminho.get(subgrupo) || "") : "",
            "Classe": classe ? (nomePorCaminho.get(classe) || "") : ""
        };

    });

    const livro = XLSX.utils.book_new();
    const aba = XLSX.utils.json_to_sheet(linhas);

    XLSX.utils.book_append_sheet(livro, aba, "GRUPOS_FARMACOLOGICOS");

    XLSX.writeFile(livro, SAIDA_ARQUIVO);

    console.log(`\nPronto! ${linhas.length} substância(s) exportada(s) pra "${SAIDA_ARQUIVO}".`);

}

extrair().catch((erro) => {
    console.error("\nErro durante a extração:", erro.message);
    console.error("Se for erro de rede/HTTP, o site pode ter mudado algo - confere de novo no navegador (Ctrl+U na página).");
    process.exit(1);
});
