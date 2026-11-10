// Colore di ogni progetto: quello personalizzato del suo cliente, se impostato,
// altrimenti uno della tavolozza automatica (stabile, in ordine di id).
// Tonalità distinguibili anche affiancate; leggibili su fondo chiaro e scuro.

const PALETTE = [
  "#2563eb", // blu
  "#d97706", // ambra
  "#059669", // verde
  "#db2777", // rosa
  "#7c3aed", // viola
  "#0891b2", // ciano
  "#dc2626", // rosso
  "#65a30d", // lime
];

const byProject = new Map();

export function assignColors(projects) {
  byProject.clear();
  [...projects]
    .sort((a, b) => a.id - b.id)
    .forEach((p, i) => byProject.set(p.id, p.customer_color || PALETTE[i % PALETTE.length]));
}

export const colorFor = (projectId) => byProject.get(projectId) ?? "#6b7280";

/** Testo leggibile sopra un fondo pieno di quel colore: bianco sui colori scuri, quasi nero sui chiari. */
export function textOn(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  if (!m) return "#fff";
  const [r, g, b] = m.slice(1).map((x) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111827" : "#ffffff";
}

/** Imposta --c (colore del progetto) e --c-on (testo leggibile sopra) su un elemento. */
export function paint(node, projectId) {
  const c = colorFor(projectId);
  node.style.setProperty("--c", c);
  node.style.setProperty("--c-on", textOn(c));
  return node;
}
