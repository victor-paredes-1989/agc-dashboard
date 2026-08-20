export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/((?!login|_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
}
