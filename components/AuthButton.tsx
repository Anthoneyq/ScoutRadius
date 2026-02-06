'use client';

import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs';

export default function AuthButton() {
  const { isSignedIn, isLoaded } = useUser();
  
  // Handle case where Clerk isn't loaded yet
  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-2">
        <UserButton 
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: 'w-8 h-8',
            },
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignInButton mode="modal">
        <button className="px-4 py-2 text-xs font-light text-label text-secondary hover:text-primary bg-luxury-card border border-[#334155]/30 rounded-md hover:border-[#fbbf24]/30 hover:shadow-[0_0_16px_rgba(251,191,36,0.15)] transition-luxury">
          SIGN IN
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="px-4 py-2 text-xs font-light text-label accent-gold bg-luxury-card border border-[#fbbf24]/30 rounded-md hover:border-[#fbbf24]/50 hover:shadow-[0_0_16px_rgba(251,191,36,0.15)] transition-luxury">
          SIGN UP
        </button>
      </SignUpButton>
    </div>
  );
}
