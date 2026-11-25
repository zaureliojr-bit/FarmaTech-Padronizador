# Próxima evolução — vendas Farmax

Implementar após validar a migração e sincronização incremental de compras.

- Extrair faturamento real por filial e período, incluindo tratamento documentado de cancelamentos e devoluções.
- Cruzar vendas e compras por classe, com classificação consistente e cobertura de dados explícita.
- Meta de reposição padrão de 60%, configurável por filial; persistir metas e vendas no D1 com acesso master e histórico.
- Calcular compras/vendas, teto de reposição e saldo para compras, usando períodos equivalentes.
- Preservar entradas manuais como alternativa identificada, sem confundir vendas da vitrine com faturamento Farmax.
- Validar schema Firebird, conciliar com relatórios oficiais da loja e testar antes de automatizar.
