// Open Beauty Facts / Open Food Facts - bases de dados de código de
// barras abertas e gratuitas (mantidas por uma organização sem fins
// lucrativos), sem token e sem cota diária apertada como a Cosmos. API
// pública com CORS liberado - não precisa de worker proxy no meio.
// Beauty primeiro (cobre melhor perfumaria/higiene/cosmético, o ponto
// fraco da Cosmos), Food como segunda tentativa.
const BASES = [
    "https://world.openbeautyfacts.org/api/v2/product/",
    "https://world.openfoodfacts.org/api/v2/product/"
];

// fetch() não tem timeout nenhum por padrão - se essa base não
// responder (trava a conexão sem erro), a busca em lote inteira para
// no item, porque só tem poucas buscas rodando ao mesmo tempo. 8s é
// tempo de sobra pra uma API que costuma responder rápido.
const TIMEOUT_MS = 8000;

async function buscarComTimeout(url) {

    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), TIMEOUT_MS);

    try {

        return await fetch(url, { signal: controlador.signal });

    } finally {

        clearTimeout(timeout);

    }

}

export async function buscarDescricaoOpenFacts(ean) {

    if (!ean) return "";

    for (const base of BASES) {

        try {

            const resposta = await buscarComTimeout(`${base}${encodeURIComponent(ean)}.json`);

            if (!resposta.ok) continue;

            const dados = await resposta.json();

            // product_name_pt (nome em português, quando alguém já
            // cadastrou) é melhor que o genérico product_name.
            const nome = (dados?.product?.product_name_pt || dados?.product?.product_name || "").trim();

            if (nome) return nome;

        } catch {

            // Essa base falhou - tenta a próxima antes de desistir.

        }

    }

    return "";

}
