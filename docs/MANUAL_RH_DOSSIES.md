# Manual: RH / Dossiês no Gestor Young-Link

Como gerir estagiários, voluntários e colaboradores no sistema — do dossiê documental ao pagamento mensal da bolsa. Guia prático com o caso real da **estagiária Ilza (IEFP INICIAR 2026)**.

---

## 1. Como o sistema está organizado

Em vez de inventar entidades novas, o Gestor usa **blocos que já existem** e combina-os. Para o RH, só precisas de entender quatro:

| Bloco | Para que serve | Onde fica |
|---|---|---|
| **Entidade** (pessoa interna) | O **estagiário/voluntário/colaborador** em si — ficha com dados pessoais, NISS, NIF, bolsa base, função | Secção **Entidades** |
| **Processo** (tipo Subsídio) | O **processo IEFP/IPDJ** que financia essa pessoa — nº de candidatura, valor aprovado, prazo | Secção **Processos** |
| **Documento** | Cada peça do **dossiê documental** (contrato, apólice, declaração SS, certificado) com prazo e estado | Secção **RH / Dossiês** |
| **Despesa** (conta 631 ou 6388) | Cada **pagamento mensal** da bolsa, com comprovativo de transferência | Secção **Despesas** |
| **Receita** (conta 75) | Cada **prestação recebida do IEFP** que financia a bolsa, ligada ao Processo | Secção **Receitas** |

**Porquê este desenho?** Porque o teu dinheiro e os teus movimentos financeiros vivem num sítio só (Tesouraria), independentemente de serem "RH" ou "evento" ou "compra". Separar os dois criaria duas contabilidades paralelas.

A secção **RH / Dossiês** no sidebar é uma vista agregada que mostra só o que te interessa de uma perspetiva de recursos humanos: pessoas internas, subsídios ativos, alertas documentais, lista de todos os documentos.

---

## 2. Fluxo completo para adicionar a Ilza

### Passo 1 — Criar a entidade "Ilza" (pessoa interna)

**Caminho**: Sidebar → **Entidades** → **+ Nova entidade**

Preencher:
- **Nome**: `Ilza [Apelido completo]`
- **NIF**: NIF português da Ilza
- **Tipos**: marcar **"Pessoa interna (RH)"** (podes marcar também "Fornecedor" se ela já tiver passado recibos verdes à YL — não é obrigatório)
- **Contactos**: email, telefone, morada
- **IBAN**: IBAN pessoal (para transferências da bolsa)
- **Secção "Dados RH" (que aparece ao marcar pessoa-interna)**:
  - **NISS**: número da Segurança Social
  - **Tipo de vínculo**: `Estágio INICIAR`
  - **Função**: ex. `Secretária Administrativa e Executiva`
  - **Bolsa base**: valor mensal líquido acordado (ex. `732,50 €`)
  - **Data de nascimento**
- Marcar **"Dados verificados"** quando confirmares tudo

Guardar. Agora tens uma ficha da Ilza no sistema.

---

### Passo 2 — Criar o Processo do IEFP

**Caminho**: Sidebar → **Processos** → **+ Novo processo**

Preencher:
- **Tipo**: escolher **`Subsídio`** — a opção vai mostrar automaticamente uma caixa explicativa a dizer "Subsídio multi-prestação (IEFP, IPDJ, Câmara). Permite guardar nº de processo, valor aprovado e ligar as receitas das prestações recebidas"
- **Estado**: `Em curso`
- **Nome**: `IEFP INICIAR — Ilza 2026`
- **Data de início**: data real de início do estágio
- **Data de fim**: data prevista de conclusão (ex. 9 meses depois)
- **Departamento**: se quiseres associar a um dos teus departamentos (ex. "Administrativo")

Na **secção "Dados do Subsídio"** (aparece automaticamente porque é Subsídio):
- **Entidade financiadora**: escolher **IEFP** no autocomplete (se não existir, cria em Entidades primeiro)
- **Nº processo**: o número do processo IEFP (ex. `2026/INICIAR/XXXX`)
- **Valor total aprovado**: soma de todas as prestações previstas + comparticipação (ex. `6 500 €`)
- **Conta SNC das prestações recebidas**: escolher **`75 — Subsídios à exploração`** (a IA vai sugerir esta por omissão)

Guardar.

---

### Passo 3 — Montar o dossiê documental

**Caminho**: Sidebar → **RH / Dossiês** → **+ Novo documento**

Para cada documento obrigatório do IEFP INICIAR, cria uma entrada:

| Tipo | Associar a | Data-limite típica |
|---|---|---|
| **Contrato** | Processo + Pessoa (Ilza) | Até data de início |
| **Plano Individual de Formação** | Processo + Pessoa | Até data de início |
| **Apólice Seguro** (acidentes de trabalho / responsabilidade civil) | Processo + Pessoa | Antes de início |
| **Declaração Admissão SS** (DRI) | Processo + Pessoa | Até 15 dias antes do início |
| **Declaração NEET** | Processo + Pessoa | No início |
| **Certificado Habilitações** | Pessoa (Ilza) | — (fica no histórico) |
| **Certificado Final** | Processo + Pessoa | No fim do estágio |

Em cada modal:
- **Tipo**: escolher da lista
- **Estado**: `Pendente` (vais mudar para `Anexado` quando tiveres o PDF, e `Enviado` quando submetes ao IEFP)
- **Data-limite**: data em que o IEFP exige o documento
- **Processo**: o processo da Ilza criado no passo 2
- **Pessoa**: Ilza
- **Anexo** (opcional por agora): PDF do documento

**Alertas automáticos**: na tab "Alertas" verás tudo o que falta por prazo (vermelho = vencido, laranja = < 5 dias, amarelo = < 15 dias, verde = OK). O badge vermelho no sidebar mostra quantos alertas críticos há.

---

### Passo 4 — Registar as **prestações recebidas** do IEFP (receitas)

Sempre que o IEFP transferir uma prestação para a conta da YL:

**Caminho**: Sidebar → **Receitas** → **+ Nova receita**

- **Título**: `Prestação 1/N IEFP — Ilza (INICIAR 2026)`
- **Conta SNC**: `75 — Subsídios à exploração` (pode usar o botão **"✨ Sugerir SNC com IA"** depois de guardar — a IA confirma)
- **Entidade (financiador)**: **IEFP**
- **Valor**: valor da prestação
- **Data**: data em que entrou na conta bancária
- **Estado**: `Recebido`
- **Anexo**: extrato bancário ou aviso de pagamento do IEFP

Depois de guardar: na secção **Processos → clica no processo da Ilza**, vais ver que a receita aparece associada e a **barra de progresso "Recebido vs aprovado"** avança.

---

### Passo 5 — Registar os **pagamentos mensais** da bolsa (despesas)

Todos os meses, quando pagas a bolsa à Ilza:

**Caminho**: Sidebar → **Despesas** → **+ Nova despesa**

- **Título**: `Bolsa Ilza — Janeiro 2026`
- **Tipo**: `Recibo` (ou `Outro` se preferires)
- **Nº documento**: ex. `BOLSA-2026-01-ILZA`
- **Conta SNC**: `631 — Gastos com pessoal — Bolsas` (há regra na IA: bolsa de estagiário com contrato = sempre 631)
- **Entidade (fornecedor)**: **Ilza** — vais encontrá-la no autocomplete porque criaste a entidade no passo 1
- **Departamento**: ex. "Administrativo"
- **Valor**: valor líquido pago (bolsa + subsídio refeição se aplicável)
- **Data**: data da transferência bancária
- **Estado**: `Paga`
- **Anexo** (**OBRIGATÓRIO**): comprovativo de transferência bancária. Nunca em numerário — regra do Anexo 1 do IEFP.

Guarda. Repete todos os meses.

---

### Passo 6 — Ao fim do estágio

1. Em **RH / Dossiês**, marca o **Certificado Final** como `Anexado` → `Enviado`
2. Em **Processos**, abre o processo da Ilza → **Editar** → muda estado para `Concluído`
3. Na secção **Entidades** → Ilza → muda **Data fim efetiva** (se diferente da prevista)
4. **Gera o PDF do processo** (botão "PDF" no modal de detalhe) → envia ao IEFP como relatório final

Isto deixa o dossiê fechado contabilisticamente **e** no RH.

---

## 3. Dicas importantes

### Nunca pagues bolsa em numerário
Regra absoluta do Anexo 1 do IEFP/IPDJ. O sistema não bloqueia (há casos em que faz sentido ter cash disponível) mas quando pagas a uma bolsa:
- **Estado = Paga**
- **Anexo = extrato bancário** com a transferência visível
- Se não tens comprovativo, não grides como "Paga" — fica em "Pendente" até teres

### Partilhar o processo com o técnico do IEFP
Quando o técnico do IEFP pede acesso aos documentos para auditoria:
1. **Processos** → clica no processo da Ilza → **"Partilhar"**
2. Preenches: destinatário (nome do técnico), justificação ("Auditoria IEFP 2026"), validade (ex. 30 dias)
3. O sistema gera um **link + password única** que podes copiar e enviar por email
4. O técnico abre o link, mete a password, vê o processo em modo leitura (sem conseguir editar nada) e descarrega os anexos
5. Em **Partilhas** vês todas as partilhas ativas e podes **revogar** se precisares

### Diferenciar bolsa de estágio (631) de bolsa de voluntariado (6388)
- **Ilza (IEFP, estágio formal, com contrato)** → `631 — Gastos com pessoal — Bolsas`
- **Jovens voluntários do VJNF (Jovens pelo Ambiente, sem vínculo laboral)** → `6388 — Bolsas/ressarcimentos a voluntários`
- A IA do sistema sabe esta regra e aplica-a automaticamente ("Ressarcimento VJNF" → 6388)

### Alertas que o sistema dá por ti
No sidebar, o item **RH / Dossiês** mostra um **badge vermelho** com o número de documentos:
- **Vencidos** (prazo já passou)
- **Críticos** (vencem em ≤ 5 dias)

Vê a cada semana para não ter surpresas em auditoria.

### Associar várias pessoas ao mesmo processo
Se houver vários estagiários no mesmo processo IEFP (programa coletivo), cria **uma entidade por pessoa** mas **um só processo** com todas associadas via documentos (cada documento liga uma pessoa a esse processo). As prestações entram agregadas; as bolsas pagas são despesas individuais com cada entidade como fornecedor.

---

## 4. Resumo: ordem para fazeres agora

Para introduzires a Ilza (começa do zero), segue por esta ordem:

1. ✅ **Entidade "IEFP"** (se ainda não existe) → tipo "financiador"
2. ✅ **Entidade "Ilza"** → tipo "pessoa-interna" com NISS, NIF, IBAN, bolsa base
3. ✅ **Processo "IEFP INICIAR — Ilza 2026"** → tipo Subsídio, com nº processo e valor aprovado
4. ✅ **Documentos do dossiê** (7 tipos) com prazos → vão aparecer na tab "Alertas"
5. ✅ Quando o IEFP transferir cada prestação → **Receita** ligada ao processo
6. ✅ Todos os meses → **Despesa** com a bolsa paga à Ilza + comprovativo
7. ✅ No fim → marcar documentos como Enviados, processo como Concluído, gerar PDF

Em qualquer passo podes:
- **Partilhar** o processo com o IEFP (link + password temporária)
- Ver o **balancete SNC** em Relatórios para confirmar que tudo está em 75/631 corretamente
- Usar a **IA SNC** se tiveres dúvidas de classificação

---

## 5. Em caso de dúvida: botão "Como classificar?"

Nos modais de Despesa e Receita existe (ou vai existir) um botão de ajuda que explica, por cada tipo de caso típico da YL, qual conta SNC usar — incluindo os cenários IEFP vs voluntariado. Para questões de SNC que não estejam cobertas, chama o teu contabilista.
