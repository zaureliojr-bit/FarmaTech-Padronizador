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

export async function buscarDescricaoOpenFacts(ean) {

    if (!ean) return "";

    for (const base of BASES) {

        try {

            const resposta = await fetch(`${base}${encodeURIComponent(ean)}.json`);

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
