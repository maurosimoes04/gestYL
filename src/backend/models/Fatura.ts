/**
 * Projeto: Gestão de Faturas - Backend
 * Versão: 1.0
 * Descrição: Modelo Sequelize para a entidade Fatura.
 * Autor: Mauro Simões
 * Data: 21/11/2025
 */

import { DataTypes, Sequelize } from 'sequelize';

/**
 * Define o modelo Sequelize para a entidade `Fatura`.
 * Inclui campos base como título, valor, data, categoria, tipo, número, anexo e detalhes.
 * @param sequelize - instância Sequelize usada para definir o modelo
 * @returns modelo Sequelize `Fatura`
 */
function createFaturaModel(sequelize: Sequelize) {
  
  const ALLOWED_DEPARTAMENTOS = [
    'Cultural',
    'Marketing e Multimédia',
    'Desporto',
    'Parcerias e Colaborações',
    'Educação',
    'Despesas Extraordinárias'
  ];

  const Fatura = sequelize.define('Fatura', {
    titulo: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true }
    },
    valor: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { isDecimal: true, min: 0 }
    },
    data: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    departamento: {
      type: DataTypes.ENUM(...ALLOWED_DEPARTAMENTOS),
      allowNull: false,
      validate: { isIn: [ALLOWED_DEPARTAMENTOS] }
    },
    tipo: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Fatura',
      validate: { isIn: [['Fatura']] }
    },
    numero: {
      type: DataTypes.STRING,
      allowNull: true
    },
    anexo: {
      type: DataTypes.JSON,
      allowNull: true
    },
    detalhes: {
      type: DataTypes.JSON,
      allowNull: true
    },
    estado: {
      type: DataTypes.STRING,
      allowNull: false
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    eventoId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'eventos', key: 'id' }
    },
    inventarioId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'inventarios', key: 'id' }
    }
  });

  return Fatura;
}

export default createFaturaModel;
