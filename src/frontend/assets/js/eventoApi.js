"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarEventos = listarEventos;
exports.criarEvento = criarEvento;
const EVENTO_API_URL = 'http://localhost:3000/eventos';
function listarEventos() {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield fetch(EVENTO_API_URL);
        if (!res.ok)
            throw new Error('Erro ao listar eventos');
        return res.json();
    });
}
function criarEvento(evento) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield fetch(EVENTO_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(evento)
        });
        if (!res.ok)
            throw new Error('Erro ao criar evento');
        return res.json();
    });
}
