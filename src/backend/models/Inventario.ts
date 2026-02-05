import { DataTypes, Model, Sequelize } from 'sequelize';

export default function createInventarioModel(sequelize: Sequelize) {
  class Inventario extends Model {}

  Inventario.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tipo: { type: DataTypes.STRING, allowNull: false }, // consumivel | fixo
    nome: { type: DataTypes.STRING, allowNull: false },
    categoria: { type: DataTypes.STRING, allowNull: true },
    quantidade: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    unidade: { type: DataTypes.STRING, allowNull: true },
    localizacao: { type: DataTypes.STRING, allowNull: true },
    estado: { type: DataTypes.STRING, allowNull: true }, // ex: ativo, manutenção, danificado
    custoUnitario: { type: DataTypes.FLOAT, allowNull: true },
    dataAquisicao: { type: DataTypes.DATEONLY, allowNull: true },
    dataValidade: { type: DataTypes.DATEONLY, allowNull: true },
    quantidadeMinima: { type: DataTypes.FLOAT, allowNull: true },
    notas: { type: DataTypes.TEXT, allowNull: true },
    faturaId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'faturas', key: 'id' } }
  }, {
    sequelize,
    modelName: 'Inventario',
    tableName: 'inventarios'
  });

  return Inventario;
}
