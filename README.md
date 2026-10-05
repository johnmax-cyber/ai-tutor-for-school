AI Tutor for School — a Next.js app where students upload study PDFs and ask questions grounded in their own documents.

Run: npm run dev (requires .env.local with Supabase + AI keys)

Env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, AI_API_KEY, AI_BASE_URL, AI_MODEL

Test: npm run typecheck && npm run lint && npm run test:pdf && npm run test:validation && npm run test:chunking && npm run test:e2e