import { useState } from "react";

import "./MigrarImagensBox.css";
import { migrarImagensAntigas } from "../../services/migracaoImagensService";

function MigrarImagensBox({ mostrarToast }) {

    const [rodando, setRodando] = useState(false);
    const [progresso, setProgresso] = useState(null);
    const [resultado, setResultado] = useState(null);

    async function iniciar() {

        setRodando(true);
        setResultado(null);
        setProgresso({ total: 0, concluidos: 0, sucesso: 0, falha: 0 });

        try {

            const relatorio = await migrarImagensAntigas(setProgresso);

            setResultado(relatorio);

            mostrarToast?.(

                relatorio.migrados
                    ? `Migração concluída: ${relatorio.sucesso} de ${relatorio.migrados} imagens hospedadas.`
                    : "Nada pra migrar - todo mundo já está hospedado.",

                relatorio.falha ? "aviso" : "sucesso"

            );

        } catch (erro) {

            mostrarToast?.(erro.message || "Erro ao migrar imagens.", "erro");

        } finally {

            setRodando(false);

        }

    }

    const percentual = progresso?.total
        ? Math.round((progresso.concluidos / progresso.total) * 100)
        : 0;

    return (

        <div className="migrar-imagens-box">

            <div className="migrar-imagens-cabecalho">

                <h2>🗂️ Migrar imagens antigas</h2>

                <span className="migrar-imagens-ajuda">
                    Lê o catálogo já publicado no site e hospeda no R2 quem
                    ainda não tiver sido migrado. Passo único - pode rodar de
                    novo sem duplicar nada.
                </span>

            </div>

            <button
                className="btn btn-outline"
                onClick={iniciar}
                disabled={rodando}
            >
                {rodando ? "Migrando..." : "Migrar imagens antigas"}
            </button>

            {

                rodando && progresso && (

                    <div className="migrar-imagens-progresso">

                        <div className="migrar-imagens-barra">
                            <div
                                className="migrar-imagens-barra-preenchida"
                                style={{ width: `${percentual}%` }}
                            />
                        </div>

                        <span>
                            {progresso.concluidos} de {progresso.total}
                            {" "}({progresso.sucesso} ok, {progresso.falha} falharam)
                        </span>

                    </div>

                )

            }

            {

                !rodando && resultado && (

                    <p className="migrar-imagens-resultado">
                        {resultado.totalNoCatalogo.toLocaleString("pt-BR")} produtos no catálogo publicado
                        {" · "}{resultado.jaHospedadasAntes.toLocaleString("pt-BR")} já estavam hospedados
                        {" · "}{resultado.migrados.toLocaleString("pt-BR")} migrados agora
                        {" "}({resultado.sucesso} ok{resultado.falha ? `, ${resultado.falha} falharam` : ""})
                    </p>

                )

            }

        </div>

    );

}

export default MigrarImagensBox;
