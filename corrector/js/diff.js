// Diferencias palabra por palabra (LCS) para resaltar qué cambió.

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Devuelve HTML con <del> para lo quitado e <ins> para lo agregado. */
export function diffHtml(before, after) {
  const A = before.split(/(\s+)/).filter(Boolean);
  const B = after.split(/(\s+)/).filter(Boolean);
  const n = A.length;
  const m = B.length;
  if (n * m > 4e6) return escapeHtml(after); // textos enormes: sin resaltado

  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  let html = "";
  let dels = "";
  let adds = "";
  const flush = () => {
    if (dels.trim()) html += `<del>${escapeHtml(dels)}</del>`;
    if (adds) html += adds.trim() ? `<ins>${escapeHtml(adds)}</ins>` : escapeHtml(adds);
    dels = adds = "";
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      flush();
      html += escapeHtml(A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) dels += A[i++];
    else adds += B[j++];
  }
  while (i < n) dels += A[i++];
  while (j < m) adds += B[j++];
  flush();
  return html;
}
