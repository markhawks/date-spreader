// Utente corrente (impostato in main.js dopo il login) e permessi derivati dal ruolo.

export const session = {
  me: null,
  /** Eliminare progetti e interventi che contengono server: coordinatori e amministratori. */
  get canDeleteAll() {
    return ["admin", "coordinatore"].includes(this.me?.role);
  },
  /** Esportare progetti e clienti (porta fuori dati dei clienti): coordinatori e amministratori. */
  get canExport() {
    return ["admin", "coordinatore"].includes(this.me?.role);
  },
};
