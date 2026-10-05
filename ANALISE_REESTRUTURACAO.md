# Análise de Reestruturação — Gestor Young-Link

> Documento de trabalho. **Nenhuma alteração de código** até ser validado.
> Objetivo: transformar o Gestor atual num sistema contabilístico que respeita a lei portuguesa (SNC) e serve de dossiê completo para IEFP/IPDJ/Câmara.

---

## Parte 1 — Diagnóstico do que já existe (DB real)

### 1.1  Receitas (42 registos, 7 agrupamentos)

| Categoria atual | Financiador | Nº | Total | Conta SNC correta |
|---|---|---|---|---|
| Cofinanciamentos | IPDJ (**exceto PAI**) | 3 | 52 701 € | **75 — Subsídios à exploração** |
| Cofinanciamentos | IPDJ — **PAI (#33)** | 1 | 1 350 € | **59 → 7883** (subsídio ao investimento, diferido) ⚠ |
| Cofinanciamentos | Município Castro Marim | 5 | 24 961 € | **75** |
| Cofinanciamentos | Junta de Freg. Castro Marim | 2 | 837 € | **75** |
| Cofinanciamentos | Junta de Freg. Altura | 2 | 1 110 € | **75** |
| Outros | IPDJ (Prémio Boas Práticas, #41) | 1 | 3 250 € | **75** (prémio é apoio corrente) |
| Vendas/Serviços | CCD (prestação Dias Medievais) | 1 | 1 040 € | **72 — Prestações de serviços** |
| Vendas/Serviços | (sem financiador — bares) | 5 | 2 934 € | **72** |
| Vendas/Serviços | Bar Young-Link | 3 | 4 028 € | **72** |
| **Vendas/Serviços** ⚠ | Junta Freg. Altura (Feirinha Páscoa #19) | 1 | 250 € | **classificação incorreta** — é apoio da Junta → **75** |

**Problemas detectados:**
- **PAI (#33)** está misturado com os outros cofinanciamentos mas é a única receita de **investimento** no sistema — deveria ir para 59→7883, não para 75.
- **Feirinha da Páscoa (#19)** parece mal categorizada: categoria "Vendas/Serviços" mas o financiador é uma Junta de Freguesia → tem cheiro a apoio pontual, não a venda.
- Categoria `Cofinanciamentos` não distingue "apoio corrente" vs "apoio a investimento".
- Categoria `Outros` é demasiado vaga.

### 1.2  Despesas / Faturas (padrões observados)

| Grupo | Exemplos | Conta SNC provável |
|---|---|---|
| Prestadores de serviço (animadores, monitores, DJs) | André Rolla, Liliana Junqueira, Marisa Gonçalves… recibos verdes | **622 — Trabalhos especializados** (com retenção IRS a tratar) |
| Materiais consumíveis (papel, cola, água) | Papelaria, Pingo Doce, Intermarché | **6262** ou **612 — Mercadorias** |
| **Ativos fixos** (portátil, móveis IKEA, mesas) ⚠ | PCDIGA (portátil 599€), IKEA (mobiliário sede) | **NÃO é despesa — classe 43 (Ativos fixos tangíveis)** + depreciação 68 |
| Combustíveis / deslocações | PRIO, BTP, refeições Boemio | **6251** — Deslocações e estadas / combustíveis |
| Comunicações | Vodafone | **6253** — Comunicações |
| Seguros | Fidelidade | **6263** — Seguros |
| Notariais / Honorários | Escritura, Notaria Alice Conde | **622** |
| Software / TI (SaaS) | Anthropic, WEO, Vodafone | **622** |

**Problema crítico:**
- **Compras de mobiliário IKEA / portátil ASUS / mesas** estão hoje como `Fatura` (despesa). Isto é contabilisticamente errado — deviam ser **ativo fixo com inventário + depreciação anual**. O módulo `Inventario` existe mas **não está ligado ao SNC**.

### 1.3  Entidades duplicadas (contrapartes)

Fornecedores com NIFs iguais mas nomes diferentes:
- **Leroy Merlin**: `Leroy Merlin (BCM Bricolage, S.A.) [506848558]` vs `Leroy Merlin [506848558]` → mesma entidade
- **IKEA**: `IKEA Portugal, Móveis… [505416654]` vs `IKEA [505416654]` vs `IKEA [505 416 654]` → mesma, grafias diferentes
- **PRIO**: `Prio Energy, S.A. [507872525]` vs `PRIO [507 872 525]` vs `PRIO` (sem NIF)
- **Amazon**: múltiplas entidades jurídicas (Amazon EU LU, Amazon Business LU, Amazon Business PT) + "AMAZON" sem NIF
- **Vodafone**: NIF `5022544180` tem **10 dígitos** → não é NIF português válido (NIF PT tem 9) — erro de registo
- Pessoas (prestadores): mesmo NIF, nome com variações (`André Rolla` vs `André Luís Silva Dias Rolla` vs `ANDRÉ ROLLA` vs `André Rolla [255480911]`)

**Impacto:** impossível fazer um Modelo 10 (declaração anual à AT) ou pedir "lista completa de pagamentos à mesma pessoa".

### 1.4  Eventos (22 registos)

Nem todos são "eventos" no mesmo sentido:
- Eventos propriamente ditos (Carnaval, SunSet, FJA, Dias Medievais) → OK
- `Mobiliário Sede` (#16), `Obras Sede` (#11), `Carrinha Berlingo` (#13) → **são projetos de investimento**, não "eventos de atividade"
- `WORKSHOPS YOUNG-LINK` (#12) → programa anual, mais parecido com um "projeto" guarda-chuva

Sugere que **"Evento"** se amplie para **"Projeto"** com `tipo = {Evento | Projeto Anual | Investimento | Processo Administrativo}`.

### 1.5  Movimentos

Hoje `Movimento.conta` é texto livre ("Banco"). Deveria vincular ao plano SNC (12 — Depósitos à ordem) ou pelo menos a uma lista fechada de contas bancárias.

### 1.6  Lacunas estruturais

| Requisito legal | Hoje existe? |
|---|---|
| Plano de contas SNC | ❌ |
| Classificação SNC por receita | ❌ |
| Classificação SNC por despesa | ❌ |
| Entidade/contraparte única desduplicada | ❌ |
| IVA (deduzível vs não-dedutível) | ❌ |
| Retenções IRS (prestadores independentes) | ❌ |
| Retenções SS (TSU) | ❌ |
| Ativos vs despesas correntes | ⚠ parcial (há Inventario, não liga a SNC) |
| Depreciação anual de ativos | ❌ |
| Processo plurianual (subsídio em várias prestações) | ❌ |
| Pessoas (estagiários, voluntários, prestadores) | ❌ |
| Obrigações documentais com prazos | ❌ |

---

## Parte 2 — Modelo proposto

### 2.1  Princípio arquitetural

```
Entidades-base (lookups):          Entidades operacionais:
  ┌────────────────┐                 ┌──────────────────┐
  │  ContaSNC      │◄────────────────│  Receita         │
  │  (plano fixo)  │◄──────┐         │  (categorias     │
  └────────────────┘       │         │  SNC obrigatórias)│
                           │         └──────────────────┘
  ┌────────────────┐       │                   ▲
  │  Entidade      │◄──────┤                   │
  │  (fornecedor,  │       │                   │
  │   financiador, │       │         ┌──────────────────┐
  │   pessoa)      │       └─────────│  Despesa         │
  └────────────────┘                 │  (ex-Fatura)     │
                                     └──────────────────┘
  ┌────────────────┐                           ▲
  │  Processo      │◄──────────────────────────┘
  │  (evento,      │
  │   projeto,     │        Processo agrupa N Receitas + N Despesas
  │   investimento)│        plurianuais com um objetivo comum.
  └────────────────┘
```

### 2.2  Entidades novas / modificadas

#### `ContaSNC` (lookup, fixo)
```
codigo       '72', '75', '7883', '62', '622', '6251', '6263', '12', '43', ...
nome         'Prestações de serviços', 'Subsídios à exploração', ...
tipo         'proveito' | 'gasto' | 'ativo' | 'passivo' | 'capital'
descricao    texto curto com quando se usa
pergunta     texto que ajuda a decidir (do guia prático)
ativa        bool
```

Plano inicial baseado no teu "Guia Prático" + Anexo 1:
- **72** Prestações de serviços
- **75** Subsídios à exploração
- **76** Quotas de associados
- **7883** Imputação do subsídio ao investimento (diferido)
- **59** Subsídios ao investimento (balanço, não resultado)
- **61** Custo das mercadorias vendidas / consumíveis
- **622** Fornecimentos e serviços — Trabalhos especializados
- **6251** Deslocações, estadas e combustíveis
- **6253** Comunicações
- **6263** Seguros
- **43** Ativos fixos tangíveis (equipamento, mobiliário, viatura)
- **12** Depósitos à ordem
- **242** IVA
- **242.4** IVA retido na fonte (não aplicável à AYL enquanto associação IPSS/isenta — a confirmar)
- **232** Pessoal (bolsas a pagar) / **23** Fornecedores

#### `Entidade` (contraparte única)
```
id, nome, nif, tipo = {fornecedor, financiador, pessoa-interna, socio, cliente}
emailContacto, telefone, morada, iban, notas
dadosFiscais (regime IRS/IVA, se aplicável)
dadosRH (para pessoas internas: NISS, tipo_vinculo, orientador, bolsaBase, etc.)
ativo
```

Uma entidade pode cumular tipos (uma pessoa interna pode também ser prestador num evento ocasional).

#### `Processo` (ex-Evento, generalizado)
```
id, nome, tipo = {Evento | Projeto Anual | Projeto Investimento | Subsídio Multi-Prestação}
contaSncReceita?    (ex: subsídio IEFP → 75)
contaSncDespesa?    (padrão para gastos do processo)
entidadeFinanciadora? → Entidade
pessoaAssociada?    → Entidade (quando é bolsa individual)
dataInicio, dataFim
valorAprovado?      (para subsídios: total previsto)
numProcesso?        (nº IEFP, nº IDA)
estado = {Em curso | Concluído | Cancelado}
```

Isto substitui `Evento` sem perder nada — eventos atuais ficam `tipo = Evento`.

#### `Receita` (reforçada)
```
+ contaSncId         (obrigatório, FK)
+ entidadeId         (obrigatório para financiador — substitui texto 'financiador')
+ processoId?        (opcional — para prestações de subsídio ou atividades de um projeto)
+ ivaRegime?         (isento | 23% | 13% | 6%)
+ numeroPrestacao?   (quando é parte de um subsídio multi-prestação)
- (manter: titulo, valor, data, estado, anexo, analiseIA)
```

#### `Despesa` (ex-`Fatura`, reforçada)
```
+ contaSncId         (obrigatório, FK)
+ entidadeId         (obrigatório — substitui texto 'fornecedor')
+ processoId?        (opcional)
+ ivaValor?          (quando aplicável)
+ ivaDeduzido?       (bool)
+ irsRetido?         (valor retido na fonte a prestadores)
+ ssRetida?          (TSU retida em bolsas)
+ ativoFixoId?       (quando é compra de ativo → cria linha em Inventario)
- (manter: titulo, valor, data, departamento, tipo, estado, anexo, vencimento, analiseIA)
```

#### `Inventario` (ligado a SNC)
```
+ contaSncId         (sempre 43x para ativos fixos)
+ anosDepreciacao?   (para calcular depreciação anual automaticamente)
+ despesaOrigemId?   (ligação à fatura que originou o ativo)
```

#### `ObrigacaoDocumental` (nova — para dossiês IEFP/IPDJ)
```
id, processoId, pessoaId?, tipo, descricao, dataLimite, estado = {Pendente | Anexado | Enviado}, anexo
```

Esta é a camada "RH / dossiê documental" — mas presa a um **processo**, não a uma pessoa isolada. Faz mais sentido: o que a lei exige é o dossiê do **processo IEFP X para a Pessoa Y**, não documentos avulsos de uma pessoa.

### 2.3  Relações eliminadas

- `Receita.financiador` (texto livre) → eliminado, agora `entidadeId`
- `Fatura.fornecedor` / `fornecedorNif` (texto livre) → eliminados, agora `entidadeId`
- `Evento` → renomeado para `Processo`, com campo `tipo`
- `FaturaEvento` → renomeado para `DespesaProcesso`
- `ReceitaEvento` → renomeado para `ReceitaProcesso`

---

## Parte 3 — Plano de migração dos dados existentes

**Caso a caso** (requer validação tua antes de executar):

### 3.1  Entidades a criar e desduplicar

Com base na análise:

| Entidade candidata | NIF | Nomes a fundir |
|---|---|---|
| Leroy Merlin (BCM Bricolage, S.A.) | 506848558 | 2 variantes |
| IKEA Portugal | 505416654 | 3 variantes |
| PRIO Energy | 507872525 | 3 variantes (uma sem NIF) |
| Amazon EU | LU20260743 | 2 variantes |
| Amazon Business EU | LU20260743 | fundir ou manter separado? ⚠ |
| Vodafone | ? (NIF atual tem 10 díg., inválido) | **corrigir NIF** |
| Prestadores pessoas singulares | 1 cada | eliminar duplicados por NIF |

Vou propor um script que lista estas duplicações e dá-te um UI para confirmar os merges.

### 3.2  Reclassificação de Receitas

Proposta automática (reversível):

| Categoria atual | Nova ContaSNC | Regra |
|---|---|---|
| Cofinanciamentos | **75** | padrão |
| Cofinanciamentos + "PAI" no título | **59→7883** | regra especial |
| Outros + "Prémio" | **75** | prémio é apoio corrente |
| Vendas/Serviços + bar/evento | **72** | prestação de serviço |
| Vendas/Serviços com Junta/Município (**#19**) | **75** | **reclassificação — é apoio não é venda** |

### 3.3  Reclassificação de Despesas

Mais trabalhoso. Precisa de uma UI de revisão massiva. Proposta inicial baseada no texto:

| Padrão no `titulo`/`tipo` | Nova ContaSNC |
|---|---|
| "Combustivel", PRIO, BTP | 6251 |
| "Refeições", restaurantes | 6251 |
| "Vodafone", comunicações | 6253 |
| "Seguro", Fidelidade | 6263 |
| "Prestação de serviços", "Animador", recibo verde | 622 |
| "Portátil", "Mesa", "Móvel", valor > 100€ e vida útil > 1 ano | **43 (ativo)** + inventário |
| Resto consumíveis (papel, cola, tintas) | 612 ou 6262 |

### 3.4  Depreciação de ativos existentes

Para os ~154 itens de inventário fixo que já lá estão, calcular depreciação à data de hoje com base em `dataAquisicao` e vida útil-padrão (ex: TI 3 anos, mobiliário 8 anos, viatura 5 anos).

---

## Parte 4 — Impacto no sistema atual

**O que se mantém intacto:**
- Autenticação, roles, auditoria, partilhas, upload de anexos, análise IA de documentos.

**O que precisa de refactor:**
- Formulário de Receita (novo campo obrigatório ContaSNC, selector de Entidade)
- Formulário de Despesa (idem + IVA + retenções)
- Dashboards (gráficos por conta SNC em vez de categoria/departamento)
- Relatórios PDF (adicionar balanço por conta SNC, exportar modelo compatível com contabilista)
- Tesouraria (contas bancárias ligadas a 12x)
- Secção Eventos → secção Processos, com filtro por tipo

**O que fica para fases posteriores:**
- IVA completo (associações IPSS podem ser isentas — a confirmar)
- Modelo 10 anual (declaração de retenções à AT)
- Mapa de depreciações automático
- Dossiê IEFP imprimível

---

## Parte 5 — Faseamento proposto

| Fase | Entrega | Dias est. |
|---|---|---|
| **0** | Validar este documento contigo, confirmar o Plano SNC inicial | 0 |
| **1** | Criar `ContaSNC` (lookup, dados estáticos) + UI de admin para gerir | 1 |
| **2** | Criar `Entidade` + script de desduplicação dos fornecedores atuais (com UI de revisão) | 2 |
| **3** | Adicionar `contaSncId` + `entidadeId` a Receita e Despesa + migrar dados existentes com UI de revisão | 2-3 |
| **4** | Transformar `Evento` → `Processo` (com tipo) + migrar | 1 |
| **5** | Secção Pessoas (dentro de Entidade com tipo=pessoa-interna) + Processos tipo subsídio + prestações | 2 |
| **6** | Secção Dossiês Documentais (prazos IEFP) | 1 |
| **7** | Reformular dashboards + relatórios PDF por SNC | 2 |
| **8** | Depreciações automáticas + ligação ativos ↔ despesas | 1 |

**Total estimado:** 12-15 dias.

---

## Pontos de decisão (precisam de resposta tua)

1. **O plano SNC inicial que listei (Parte 2.2) está correto para a Young-Link?** Especialmente a confirmar: 76 (quotas) tens? Precisas de 21 (clientes) e 22 (fornecedores) a prazo?

2. **IVA**: a Young-Link está isenta (IPSS/associação sem fins lucrativos) ou tem regime normal? Isto muda muita coisa.

3. **Retenções IRS**: pagas prestadores com recibo verde (olhando pelos "animadores") — faz-se retenção na fonte (11,5% / 25%)? Hoje não registas isso, logo os valores das despesas podem estar bruto quando deveriam ser bruto + retenção separada.

4. **Permissão para reclassificar automaticamente?** Ou queres rever cada receita/despesa uma a uma depois de eu propor a classificação?

5. **Eventos vs Projetos**: aceitas renomear `Evento` → `Processo` com tipos (`Evento`/`Projeto Anual`/`Investimento`/`Subsídio`)? Ou preferes manter `Evento` e criar `Projeto` separado?

6. **"Departamento" fica**? Hoje é usado para categorizar despesas. Com SNC pode tornar-se redundante, ou pode manter-se como dimensão analítica (SNC = conta, departamento = centro de custo).

7. **Scope da Fase 0 (que arranco já)**: queres que eu comece pelas lookups estáticas (ContaSNC + plano) ou pela Entidade (desduplicação de fornecedores)?

