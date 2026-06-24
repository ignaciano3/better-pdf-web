export function downloadFile(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = encodeURI(url);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
