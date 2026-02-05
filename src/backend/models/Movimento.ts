import { DataTypes, Model, Sequelize } from 'sequelize';

export default function createMovimentoModel(sequelize: Sequelize) {
  class Movimento extends Model {
    public id!: number;
    public tipo!: 'entrada' | 'saida';
    public conta!: string;
    public valor!: number;
    public data!: Date;
    public referencia?: string;
    public descricao?: string;
  }

  Movimento.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      tipo: { type: DataTypes.ENUM('entrada', 'saida'), allowNull: false },
      conta: { type: DataTypes.STRING, allowNull: false },
      valor: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      data: { type: DataTypes.DATEONLY, allowNull: false },
      referencia: { type: DataTypes.STRING, allowNull: true },
      descricao: { type: DataTypes.TEXT, allowNull: true }
    },
    { sequelize, modelName: 'Movimento', tableName: 'movimentos' }
  );

  return Movimento;
}
