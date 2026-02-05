import { DataTypes, Model, Sequelize } from 'sequelize';

export default function createEventoModel(sequelize: Sequelize) {
  class Evento extends Model {
    public id!: number;
    public nome!: string;
    public descricao?: string;
    public data_inicio?: Date;
    public data_fim?: Date;
    public departamento?: string;
    public createdAt!: Date;
    public updatedAt!: Date;
  }

  Evento.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      nome: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      descricao: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      data_inicio: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      data_fim: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      departamento: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Evento',
      tableName: 'eventos',
    }
  );

  return Evento;
}
