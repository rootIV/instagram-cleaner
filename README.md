# Instagram Comment Cleaner

Bot local de terminal que abre o Microsoft Edge, acessa a tela **Sua atividade > Comentarios** e exclui os comentarios em lotes de ate 20 ate a lista ficar vazia.

## Como usar

1. Feche outras execucoes deste bot.
2. Execute `testar-sem-apagar.cmd` primeiro.
3. Na primeira vez, faca login na janela do Edge e volte ao terminal para pressionar ENTER.
4. Confira se exatamente os comentarios esperados foram selecionados. O teste nao apaga nada.
5. Feche o teste e execute `iniciar.cmd`.
6. Digite `APAGAR` ou `apagar` no terminal para autorizar todos os lotes.
7. Depois da autorizacao, pressione ENTER ou ESPACO no terminal para pausar; pressione ENTER ou ESPACO de novo para continuar.

A sessao fica em `.instagram-profile` e e reutilizada nas proximas execucoes. A senha nao entra no codigo e nao e lida pelo bot.

## Comandos opcionais

```powershell
npm install
npm run dry-run
npm start
node src/cli.js --limit 10
node src/cli.js --headless
npm test
```

Use `--headless` somente depois de fazer login numa execucao visivel. O limite aceito e de 1 a 20.

## Comportamento de seguranca

- modo visivel por padrao;
- confirmacao `APAGAR` antes de excluir;
- controle de pausa/retomada por ENTER ou ESPACO durante a exclusao;
- no maximo 20 comentarios por lote, repetindo ate a lista ficar vazia;
- cada clique so e contabilizado quando o contador ou o icone confirma a selecao;
- pausas aleatorias de aproximadamente 0,3 a 0,65 segundo entre selecoes e de 2,5 a 4,5 segundos entre lotes;
- em caso de erro, salva uma captura em `diagnostics`, envia `Ctrl+F5` e tenta novamente, ate tres tentativas;
- se aparecer `Something went wrong` ao apagar, o bot clica em `OK`, atualiza a pagina e tenta o lote de novo;
- nao contorna CAPTCHA, verificacao de identidade, limite ou bloqueio do Instagram.

Se o Instagram pedir CAPTCHA, confirmacao ou limitar a conta, interrompa o bot e conclua a verificacao manualmente. A interface do Instagram pode mudar; nesse caso, consulte a captura em `diagnostics`.
