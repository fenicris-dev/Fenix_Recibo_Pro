/**
 * Fênix Recibo Pro — Cloud Functions
 * Projeto: fenix-recibos-profissionais
 *
 * Processa a fila `exclusoes_pendentes` criada em recibo.html
 * (função excluirDefinitivo) e deleta de fato a conta no Firebase
 * Authentication via Admin SDK — algo que o cliente (navegador) não
 * tem permissão de fazer diretamente.
 *
 * INSTALAÇÃO (uma vez só):
 *   1. npm install -g firebase-tools          (se ainda não tiver)
 *   2. firebase login
 *   3. Na pasta do projeto: firebase init functions
 *      → escolha o projeto "fenix-recibos-profissionais", linguagem JavaScript
 *   4. Copie este arquivo para functions/index.js
 *   5. cd functions && npm install firebase-functions firebase-admin
 *   6. firebase deploy --only functions
 *
 * Requer o plano Blaze (pay-as-you-go) do Firebase — funções em
 * background (gatilhos do Firestore) não funcionam no plano gratuito
 * Spark. O uso aqui é mínimo (só dispara quando alguém é excluído),
 * então o custo real tende a ficar dentro da faixa gratuita do Blaze.
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();

// ── Processa cada pedido de exclusão assim que ele é criado ─────
exports.processarExclusaoConta = onDocumentCreated(
  { document: "exclusoes_pendentes/{id}", region: "southamerica-east1" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const dados = snap.data();
    const { uid, email, nome } = dados;

    if (!uid) {
      await snap.ref.update({
        status: "erro",
        erro: "uid ausente no documento",
        processadoEm: new Date().toISOString(),
      });
      return;
    }

    try {
      await admin.auth().deleteUser(uid);
      await snap.ref.update({
        status: "concluido",
        processadoEm: new Date().toISOString(),
      });
      console.log(`Conta excluída do Auth: ${uid} (${email || nome || "sem e-mail"})`);
    } catch (e) {
      // Conta pode já ter sido excluída antes (ex: reprocessamento manual)
      const jaNaoExiste = e.code === "auth/user-not-found";
      await snap.ref.update({
        status: jaNaoExiste ? "concluido" : "erro",
        erro: jaNaoExiste ? "usuário já não existia no Auth" : e.message,
        processadoEm: new Date().toISOString(),
      });
      if (!jaNaoExiste) {
        console.error(`Falha ao excluir ${uid}:`, e);
      }
    }
  }
);

// ── Reprocessamento diário de segurança ──────────────────────────
// Caso algum documento fique pendente por falha temporária (ex: função
// fora do ar no momento da criação), este job varre a fila 1x/dia às
// 03:00 (horário de São Paulo) e tenta novamente os que não têm status
// "concluido".
exports.reprocessarExclusoesPendentes = onSchedule(
  { schedule: "0 3 * * *", timeZone: "America/Sao_Paulo", region: "southamerica-east1" },
  async () => {
    const db = admin.firestore();
    const todos = await db.collection("exclusoes_pendentes").get();
    const pendentes = todos.docs.filter((d) => d.data().status !== "concluido");

    for (const doc of pendentes) {
      const { uid } = doc.data();
      if (!uid) continue;
      try {
        await admin.auth().deleteUser(uid);
        await doc.ref.update({ status: "concluido", processadoEm: new Date().toISOString() });
      } catch (e) {
        const jaNaoExiste = e.code === "auth/user-not-found";
        await doc.ref.update({
          status: jaNaoExiste ? "concluido" : "erro",
          erro: jaNaoExiste ? "usuário já não existia no Auth" : e.message,
          processadoEm: new Date().toISOString(),
        });
      }
    }
  }
);
