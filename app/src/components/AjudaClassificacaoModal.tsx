import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge, SncBadge } from '@/components/ui/Badge';
import { HelpCircle } from 'lucide-react';
import { useState } from 'react';

interface Caso {
  titulo: string;
  descricao: string;
  processo: string;
  snc: string[];
  dica?: string;
}

const CASOS: Record<string, Caso[]> = {
  'Receitas': [
    { titulo: 'Bar num evento (próprio ou de outra entidade)',
      descricao: 'Vendas de bebidas e snacks a particulares (sem IVA pela isenção art.9).',
      processo: 'Processo tipo Evento próprio para o bar (ex: "Bar — Festas CM 2026"), departamento "Exploração Comercial".',
      snc: ['72'],
      dica: 'Mesmo quando é num evento de terceiros, mantém sempre o bar como processo separado para medir se é rentável.' },
    { titulo: 'Workshop/atividade paga por participantes',
      descricao: 'Inscrições, mensalidades, pacotes de aulas.',
      processo: 'Processo tipo Projeto Anual (ex: "Workshops YL 2026").',
      snc: ['72'] },
    { titulo: 'Quota de sócio',
      descricao: 'Quando cobrarem quotas aos sócios da associação.',
      processo: 'Sem processo específico; receita direta.',
      snc: ['76'] },
    { titulo: 'Subsídio corrente (IEFP, IPDJ, Câmara, Junta)',
      descricao: 'Dinheiro para pagar atividades deste ano — bolsa, apoio ao Carnaval, apoio a eventos.',
      processo: 'Se é um processo multi-prestação (IEFP, IPDJ, PAJ), cria tipo Subsídio. Caso contrário, associa ao evento beneficiário.',
      snc: ['75'] },
    { titulo: 'Prémio (ex: Boas Práticas Voluntariado)',
      descricao: 'Prémios atribuídos pelas atividades.',
      processo: 'Receita direta, sem processo específico.',
      snc: ['75'] },
    { titulo: 'Subsídio ao investimento (PAI, obras na sede, equipamento duradouro)',
      descricao: 'Subsídio para construir/comprar algo que dura vários anos.',
      processo: 'Processo tipo Investimento. Fica em 59 (balanço) e é desdobrado anualmente em 7883 pelo contabilista.',
      snc: ['59', '7883'],
      dica: 'NUNCA registar em 75 — é a diferença crítica face a um subsídio corrente.' },
    { titulo: 'Doação / mecenato em dinheiro',
      descricao: 'Donativo de empresa ou particular sem contrapartida.',
      processo: 'Receita direta.',
      snc: ['75'],
      dica: 'Se o donativo for para comprar algo duradouro específico (ex: viatura), aplica-se a lógica da conta 59.' },
  ],
  'Despesas correntes': [
    { titulo: 'Compra de bebidas/snacks para vender no bar',
      descricao: 'Super Bock, águas, pack de refrigerantes etc.',
      processo: 'Associar ao processo do bar (ex: "Bar — Festas CM 2026").',
      snc: ['612'] },
    { titulo: 'Prestador externo (animador, DJ, formador, consultor, notário)',
      descricao: 'Recibo verde ou fatura de prestação de serviços.',
      processo: 'Associar ao processo onde atuou (evento, workshop…).',
      snc: ['622'],
      dica: 'Se são várias atividades no mesmo ano para o mesmo animador, cria-o como Entidade e vais ver o total pago.' },
    { titulo: 'Combustível / portagens / deslocação',
      descricao: 'Abastecimento PRIO, portagens, refeições em deslocação.',
      processo: 'Associar ao processo onde foi feita a deslocação.',
      snc: ['6251'] },
    { titulo: 'Telemóvel, internet, correio',
      descricao: 'Fatura Vodafone, CTT, SaaS de comunicação.',
      processo: 'Sem processo (overhead geral).',
      snc: ['6253'] },
    { titulo: 'Seguros (RC, viatura, estagiários)',
      descricao: 'Apólices Fidelidade, Liberty, etc.',
      processo: 'Sem processo (overhead) ou associada ao estagiário.',
      snc: ['6263'] },
    { titulo: 'Papel, canetas, tintas, consumíveis',
      descricao: 'Material de escritório ou de atividade.',
      processo: 'Associar ao processo se for para uma atividade específica.',
      snc: ['6262'] },
    { titulo: 'Fatos, flores, decorações, pós holi, extintores',
      descricao: 'Material consumível específico de evento.',
      processo: 'Associar ao evento beneficiário.',
      snc: ['6266'] },
    { titulo: 'Software SaaS, serviços notariais',
      descricao: 'Anthropic, WEO, escritura notarial, advogado.',
      processo: 'Sem processo (overhead).',
      snc: ['622'] },
  ],
  'Pessoal': [
    { titulo: 'Bolsa a estagiário IEFP / CEI (com contrato formal)',
      descricao: 'Pagamento mensal da bolsa.',
      processo: 'Associado à Pessoa (entidade pessoa-interna) e ao Subsídio IEFP.',
      snc: ['631'],
      dica: 'NUNCA em numerário — comprovativo bancário obrigatório.' },
    { titulo: 'Bolsa / ressarcimento a jovem voluntário (VJNF)',
      descricao: 'Compensação paga a voluntários sem vínculo laboral.',
      processo: 'Associado ao Projeto Anual (ex: "Jovens pelo Ambiente 2026").',
      snc: ['6388'],
      dica: 'Distinto da 631 (que exige vínculo). O voluntariado é remunerado como "bolsa/ressarcimento" não como salário.' },
    { titulo: 'TSU — contribuição patronal (se aplicável a CEI/+Emprego)',
      descricao: 'Encargos sobre remunerações pagos à Segurança Social.',
      processo: 'Mesmo processo da bolsa.',
      snc: ['635'] },
  ],
  'Ativos (duradouros)': [
    { titulo: 'Portátil, impressora, equipamento TI',
      descricao: 'Valor > ~100 € e vida útil > 1 ano.',
      processo: 'Processo tipo Investimento ou direto se é overhead.',
      snc: ['435'],
      dica: 'Depois de registar como despesa, abre Inventário → Capitalizar e indica vida útil (3 anos para TI).' },
    { titulo: 'Mesas, cadeiras, sofás, mobiliário',
      descricao: 'Mobiliário duradouro para a sede.',
      processo: 'Processo tipo Investimento (ex: "Mobiliário sede").',
      snc: ['435'],
      dica: '8 anos de vida útil padrão.' },
    { titulo: 'Insufláveis, equipamento desportivo duradouro',
      descricao: 'Equipamento básico para atividades regulares.',
      processo: 'Processo tipo Investimento.',
      snc: ['433'],
      dica: '8 anos de vida útil padrão.' },
    { titulo: 'Viatura',
      descricao: 'Carrinha / carro.',
      processo: 'Processo tipo Investimento (ex: "Carrinha Berlingo").',
      snc: ['434'],
      dica: '5 anos de vida útil padrão.' },
    { titulo: 'Obras na sede',
      descricao: 'Benfeitorias e construção duradouras.',
      processo: 'Processo tipo Investimento (ex: "Obras PAI").',
      snc: ['432'],
      dica: '50 anos (edifícios). O subsídio PAI vai para 59, não para 75.' },
  ],
};

export function AjudaButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" icon={<HelpCircle className="w-4 h-4" />} onClick={() => setOpen(true)}>
        Como classificar?
      </Button>
      {open && <AjudaClassificacaoModal onClose={() => setOpen(false)} />}
    </>
  );
}

function AjudaClassificacaoModal({ onClose }: { onClose: () => void }) {
  const [grupo, setGrupo] = useState(Object.keys(CASOS)[0]);
  return (
    <Modal open onClose={onClose} size="xl" title="Guia de classificação SNC — casos típicos YL"
           footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}>
      <div className="flex gap-1 mb-5 border-b border-line overflow-x-auto">
        {Object.keys(CASOS).map(g => (
          <button key={g} onClick={() => setGrupo(g)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${grupo === g ? 'text-brand border-brand' : 'text-ink-soft border-transparent hover:text-ink'}`}>
            {g}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {CASOS[grupo].map((c, i) => (
          <div key={i} className="border border-line rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
              <h4 className="font-semibold text-ink text-sm">{c.titulo}</h4>
              <div className="flex gap-1 flex-wrap">
                {c.snc.map(cod => <SncBadge key={cod} codigo={cod} />)}
              </div>
            </div>
            <p className="text-sm text-ink-soft mb-2">{c.descricao}</p>
            <div className="bg-surface-page rounded-md px-3 py-2 text-xs text-ink">
              <span className="text-ink-muted font-medium">Processo:</span> {c.processo}
            </div>
            {c.dica && (
              <div className="mt-2 bg-warn-soft text-warn-ink rounded-md px-3 py-2 text-xs flex items-start gap-2">
                <span className="font-bold">💡</span>
                <span>{c.dica}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-ink-soft italic">
        A regra de ouro: a conta não depende de <strong>quem dá/recebe</strong> o dinheiro, depende do <strong>que é</strong>.
        Se não consegues decidir, pergunta: "este dinheiro desaparece ao ser gasto este ano?" (sim → 75; não → 59).
      </p>
    </Modal>
  );
}
