export function downloadCsv(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "reservations-semaine.csv";
  link.click();
  URL.revokeObjectURL(url);
}
