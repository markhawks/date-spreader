// Utente corrente (impostato in main.js dopo il login) e permessi derivati dal ruolo.

export const session = {
  me: null,
  /** Eliminare progetti e interventi che contengono server: coordinatori e amministratori. */
  get canDeleteAll() {
    return ["admin", "coordinatore"].includes(this.me?.role);
  },
};
