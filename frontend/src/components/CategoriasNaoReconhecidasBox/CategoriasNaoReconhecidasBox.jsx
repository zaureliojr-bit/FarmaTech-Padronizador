import { useState } from "react";

import "./CategoriasNaoReconhecidasBox.css";
import { FAMILIAS } from "../../intelligence/dictionary/familias";

// Lê a categoria bruta de cada produto que caiu em "Outros" (não bateu
// com nenhuma família do dictionary/familias.js, nem com uma correção
// já salva) e conta quantos produtos tem em cada uma - é a lista que
// mostra o que precisa de uma família escolhida pra parar de cair em
// "Outros" no site.
function CategoriasNaoReconhecidasBox({ produtos, corrigirFamilia, mostrarToast }) {

    const [selecoes, setSelecoes] = useState({});
    const [salvando, setSalvando] = useState(new Set());

    const contagem = new Map();

    produtos.forEach((produto) => {

        if (produto.familia !== "outros" || !produto.categoria) return;

        contagem.set(produto.categoria, (contagem.get(produto.categoria) || 0) + 1);

    });

    const lista = [...contagem.entries()].sort((a, b) => b[1] - a[1]);

    if (!lista.length) return null;

    const totalProdutos = lista.reduce((soma, [, qtd]) => soma + qtd, 0);

    async function salvar(categoria) {

        const familiaId = selecoes[categoria];

        if (!familiaId) {
            mostrarToast?.("Escolha uma família antes de salvar.", "erro");
            return;
        }

        setSalvando((atual) => new Set(atual).add(categoria));

        try {

            await corrigirFamilia(categoria, familiaId);

            mostrarToast?.(`"${categoria}" associada à família escolhida.`, "sucesso");

        } catch (erro) {

            mostrarToast?.(erro.message || "Erro ao salvar a correção de família.", "erro");

        } finally {

            setSalvando((atual) => {
                const novo = new Set(atual);
                novo.delete(categoria);
                return novo;
            });

        }

    }

    return (

        <div className="categorias-outros-box">

            <div className="categorias-outros-cabecalho">

                <h2>⚠️ Categorias caindo em "Outros"</h2>

                <span className="categorias-outros-contagem">
                    {lista.length} categoria(s) · {totalProdutos.toLocaleString("pt-BR")} produto(s)
                </span>

            </div>

            <p className="categorias-outros-ajuda">
                Essas categorias da planilha não batem com nenhuma família
                conhecida do site - os produtos aparecem em "Outros" em vez
                da seção certa. Escolha a família certa pra cada uma; fica
                valendo na hora e também pras próximas importações.
            </p>

            <ul className="categorias-outros-lista">

                {lista.map(([categoria, qtd]) => (

                    <li key={categoria}>

                        <div className="categorias-outros-item-info">
                            <strong>{categoria}</strong>
                            <span>{qtd.toLocaleString("pt-BR")} produto(s)</span>
                        </div>

                        {

                            corrigirFamilia && (

                                <div className="categorias-outros-item-acao">

                                    <select
                                        value={selecoes[categoria] || ""}
                                        onChange={(e) => setSelecoes((atual) => ({ ...atual, [categoria]: e.target.value }))}
                                    >
                                        <option value="">Escolher família...</option>

                                        {FAMILIAS.map((familia) => (
                                            <option key={familia.id} value={familia.id}>
                                                {familia.nome}
                                            </option>
                                        ))}

                                    </select>

                                    <button
                                        className="btn-mini btn-mini-salvar"
                                        onClick={() => salvar(categoria)}
                                        disabled={salvando.has(categoria)}
                                    >
                                        {salvando.has(categoria) ? "Salvando..." : "Salvar"}
                                    </button>

                                </div>

                            )

                        }

                    </li>

                ))}

            </ul>

        </div>

    );

}

export default CategoriasNaoReconhecidasBox;
