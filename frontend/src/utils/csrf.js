export function getCsrfToken() {
  const m = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
