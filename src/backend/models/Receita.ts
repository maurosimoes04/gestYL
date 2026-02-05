import { DataTypes, Model, Sequelize } from 'sequelize';

export default function createReceitaModel(sequelize: Sequelize) {
  class Receita extends Model {
    public id!: number;
    public titulo!: string;
    public valor!: number;
    public data!: Date;
    public categoria!: string;
    public estado!: string;
    public financiador?: string;
    public anexo?: any;
    public observacoes?: string;
    public eventoId?: number;
  }

  Receita.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      titulo: { type: DataTypes.STRING, allowNull: false },
      valor: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      data: { type: DataTypes.DATEONLY, allowNull: false },
      categoria: { type: DataTypes.STRING, allowNull: false },
      estado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Previsto' },
      financiador: { type: DataTypes.STRING, allowNull: true },
      anexo: { type: DataTypes.JSON, allowNull: true },
      observacoes: { type: DataTypes.TEXT, allowNull: true },
      eventoId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'eventos', key: 'id' } }
    },
    { sequelize, modelName: 'Receita', tableName: 'receitas' }
  );

  return Receita;
}
