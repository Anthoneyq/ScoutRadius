import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Conditionally apply Clerk middleware only if CLERK_SECRET_KEY is available
// This prevents build failures when the key isn't set in Vercel environment variables
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

export default clerkSecretKey
  ? clerkMiddleware()
  : (req: NextRequest) => {
      // No-op middleware when Clerk is not configured
      return NextResponse.next();
    };

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
