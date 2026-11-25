# Drogalink Compras — piloto
1. Criar D1 separado (sugestão: drogalink-compras), executar schema.sql e vincular ao Worker como COMPRAS_DB.
2. Criar Worker separado usando worker.js. Definir secrets COMPRAS_MASTER_KEY e COMPRAS_LOJAS_JSON (JSON com slug -> {filial: número, token: string aleatória exclusiva}). Usar chaves aleatórias distintas, nunca a senha Firebird ou do painel. Não publicar secrets no Git.
3. No .env de cada extrator, COMPRAS_URL=https://endereco-do-worker/ e COMPRAS_KEY=token exclusivo. Rodar extrator-compras-beta.exe --compras --enviar-compras. Sem --enviar-compras, apenas JSON local.
4. GET /compras com Authorization: Bearer <master> lista snapshots ativos; GET /compras/parte?loja=...&lote=...&tipo=notas&pos=0 lê uma parte de até 100 registros. Não usar segredo master em site público.
5. Validar no ambiente de testes: autenticação cruzada, falha parcial, publicação completa, totais e status, repetição de NF-e, integridade dos itens, datas e unidades. Não agendar ainda.
Limitações: snapshot móvel de 90 dias, não é arquivo histórico permanente; falta persistência histórica consolidada, limpeza de lotes antigos e incompletos, validação de regras comerciais, testes de carga e integração com painel. Não publicar em produção antes dos testes. A API ainda não possui integração de sessão/CORS com o painel. Nenhum recurso Cloudflare foi provisionado por este commit.
