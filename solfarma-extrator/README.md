# Extrator Solfarma — lista da distribuidora

Lê somente endereços públicos de produtos divulgados no sitemap da Solfarma. Não usa login, preços comerciais nem endpoints privados. Use com autorização da distribuidora para a coleta e reutilização das imagens.

## Uso (Node.js 20 ou superior, no Windows)

```powershell
npm install
$env:LIMITE=10
npm run extrair
```

Confira `distribuidora_solfarma_teste.xlsx`. Se os EANs, descrições e links estiverem corretos, remova o limite e rode novamente:

```powershell
Remove-Item Env:LIMITE
npm run extrair
```

O arquivo final é `distribuidora_solfarma.xlsx`. Contém Código, EAN, Descrição, Imagem, Marca, Laboratório, Categoria e Subcategoria. A planilha pode ser importada como lista da distribuidora.

O processamento é sequencial, respeita robots.txt e espera ao menos dois segundos entre consultas (mais, se o robots.txt solicitar). A extração completa de milhares de páginas pode levar muitas horas. O arquivo JSONL registra os resultados de cada execução: se interromper, execute o mesmo comando para continuar. Não apague o checkpoint se quiser retomar. O modo teste possui arquivos separados.

Se a Solfarma restringir acesso, o programa para. Não tenta contornar bloqueios. Se a página não disponibilizar dados no HTML público, os itens não são incluídos e a execução avisa. Não há garantia de que todos os produtos tenham código de barras ou uma foto válida. Não execute várias instâncias ao mesmo tempo.
