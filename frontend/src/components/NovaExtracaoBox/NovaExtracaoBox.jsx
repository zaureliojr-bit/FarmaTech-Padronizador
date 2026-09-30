import { useEffect, useState } from "react";

import "./NovaExtracaoBox.css";
import { importarPlanilha } from "../../services/importador";
import {
    buscarExtracaoPendente,
    baixarArquivoExtracao,
    marcarExtracaoImportada
} from "../../services/extracaoService";

function formatarDataHora(timestamp) {

    return new Date(timestamp).toLocaleString("pt-BR");

}

function NovaExtracaoBox({ onImportar, mostrarToast }) {

    const [pendente, setPendente] = useState(null);
    const [importando, setImportando] = useState(false);

    useEffect(() => {

        buscarExtracaoPendente()
            .then(setPendente)
            .catch(() => {});

    }, []);

    async function importarAgora() {

        setImportando(true);

        try {

            const blob = await baixarArquivoExtracao();

            const arquivo = new File([blob], pendente.nomeArquivo, {
                type: blob.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            });

            const resultado = await importarPlanilha(arquivo);

            onImportar(resultado);

            await marcarExtracaoImportada();

            setPendente(null);

            mostrarToast?.(
                `Extração importada: ${resultado.totalProdutos.toLocaleString("pt-BR")} produtos.`,
                "sucesso"
            );

        } catch (erro) {

            mostrarToast?.(erro.message || "Erro ao importar a extração.", "erro");

        } finally {

            setImportando(false);

        }

    }

    if (!pendente) return null;

    return (

        <div className="nova-extracao-box">

            <span>
                📥 Nova extração disponível ({formatarDataHora(pendente.enviadoEm)}) - {pendente.nomeArquivo}
            </span>

            <button
                className="btn btn-primary"
                onClick={importarAgora}
                disabled={importando}
            >
                {importando ? "Importando..." : "Importar agora"}
            </button>

        </div>

    );

}

export default NovaExtracaoBox;
