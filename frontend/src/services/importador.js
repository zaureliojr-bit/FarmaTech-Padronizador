import * as XLSX from "xlsx";
import { encontrarCabecalho } from "../utils/detectarCabecalho";
import { normalizarProduto } from "../utils/normalizarProduto";

export async function importarPlanilha(arquivo) {

    return new Promise((resolve, reject) => {

        const leitor = new FileReader();

        leitor.onload = (evento) => {

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