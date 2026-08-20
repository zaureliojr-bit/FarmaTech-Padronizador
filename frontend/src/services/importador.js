import * as XLSX from "xlsx";
import { encontrarCabecalho } from "../utils/detectarCabecalho";
import { normalizarProduto } from "../utils/normalizarProduto";
import { buscarImagensHospedadas } from "./imagemHostingService";
import { buscarCorrecoes } from "./correcoesService";

export async function importarPlanilha(arquivo) {

    return new Promise((resolve, reject) => {

        const leitor = new FileReader();

        leitor.onload = async (evento) => {

            try {

                const dados = new Uint8Array(evento.target.result);

                const workbook = XLSX.read(dados, {
                    type: "array"
                });

                let produtos = [];

                workbook.SheetNames.forEach((nomeAba) => {

                    const aba = workbook.Sheets[nomeAba];

                    // Lê toda a aba como matriz
                    const matriz = XLSX.utils.sheet_to_json(aba, {
                        header: 1,
                        defval: ""
                    });

                    // Descobre automaticamente onde está o cabeçalho
                    const linhaCabecalho = encontrarCabecalho(matriz);

                    if (linhaCabecalho === -1) {

                        console.warn(`Cabeçalho não encontrado na aba "${nomeAba}"`);

                        return;

                    }

                    // Lê novamente usando o cabeçalho encontrado
                    const lista = XLSX.utils.sheet_to_json(aba, {
                        range: linhaCabecalho,
                        defval: ""
                    });

                    lista.forEach((produto) => {

                        produto.__aba = nomeAba;

                        produtos.push(
                            normalizarProduto(produto)
                        );

                    });

                });

                // Reaproveita imagens já hospedadas (R2, indexadas por
                // EAN no D1), sem buscar/salvar de novo.
                const eans = produtos
                    .map((produto) => produto.ean)
                    .filter(Boolean);

                const [imagensHospedadas, correcoes] = await Promise.all([
                    buscarImagensHospedadas(eans),
                    buscarCorrecoes(eans)
                ]);

                produtos = produtos.map((produto) => {

                    const hospedada = imagensHospedadas.get(produto.ean);
                    const correcao = correcoes.get(produto.ean);

                    if (!hospedada && !correcao) return produto;

                    return {
                        ...produto,

                        ...(hospedada && {
                            imagem: hospedada.url,
                            statusImagem: "salva"
                        }),

                        // só sobrescreve o que a correção realmente trouxe -
                        // um campo vazio nela não deve apagar o da planilha.
                        ...(correcao?.descricaoManual && { descricaoManual: correcao.descricaoManual }),
                        ...(correcao?.classe && { classe: correcao.classe }),
                        ...(correcao?.categoria && { categoria: correcao.categoria })

                    };

                });

                resolve({

    arquivo: arquivo.name,

    totalAbas: workbook.SheetNames.length,

    totalProdutos: produtos.length,

    produtos

});

            } catch (erro) {

                console.error(erro);

                reject(erro);

            }

        };

        leitor.onerror = () => {

            reject(new Error("Erro ao ler o arquivo."));

        };

        leitor.readAsArrayBuffer(arquivo);

    });

}