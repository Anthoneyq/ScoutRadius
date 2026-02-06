'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

interface UsageData {
  plan: 'free' | 'pro';
  aiClassificationsThisMonth: number;
  searchesThisMonth: number;
  canUseAI: boolean;
  canSearch: boolean;
  isAuthenticated: boolean;
}

function UsageDisplayContent() {
  const { user, isSignedIn, isLoaded } = useUser();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Handle case where Clerk isn't loaded yet
  if (!isLoaded) {
    return null;
  }

  useEffect(() => {
    fetchUsage();
  }, [isSignedIn]);

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/usage');
      const data = await res.json();
      setUsage(data);
    } catch (error) {
      console.error('Error fetching usage:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
      });
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to start checkout. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="absolute top-20 right-5 z-30 card-luxury rounded-lg px-4 py-3">
        <div className="text-xs text-tertiary">Loading...</div>
      </div>
    );
  }

  if (!usage) return null;

  const isFree = usage.plan === 'free';
  const aiLimit = isFree ? 10 : 1000;
  const searchLimit = isFree ? 50 : Infinity;

  return (
    <div className="absolute top-20 right-5 z-30 card-luxury rounded-lg px-4 py-3 min-w-[280px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-light text-label text-secondary">USAGE</h3>
      </div>

      {!isSignedIn && (
        <div className="mb-3 p-2 bg-[#1e293b]/30 rounded text-xs text-tertiary">
          <p className="mb-1">Sign in to track usage and unlock AI features</p>
        </div>
      )}

      {isSignedIn && (
        <>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-tertiary">Plan:</span>
              <span className={`font-light ${isFree ? 'text-secondary' : 'accent-gold'}`}>
                {usage.plan.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-tertiary">AI Classifications:</span>
              <span className={`font-light ${usage.canUseAI ? 'text-secondary' : 'text-red-400'}`}>
                {usage.aiClassificationsThisMonth} / {aiLimit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-tertiary">Searches:</span>
              <span className="font-light text-secondary">
                {usage.searchesThisMonth} {searchLimit !== Infinity ? `/ ${searchLimit}` : ''}
              </span>
            </div>
          </div>

          {isFree && (
            <button
              onClick={handleUpgrade}
              className="mt-3 w-full px-3 py-2 bg-luxury-card border border-[#fbbf24]/30 rounded text-xs text-label accent-gold hover:border-[#fbbf24]/50 hover:shadow-[0_0_16px_rgba(251,191,36,0.15)] transition-luxury"
            >
              UPGRADE TO PRO
            </button>
          )}

          {!usage.canUseAI && isFree && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
              AI limit reached. Upgrade for more.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function UsageDisplay() {
  // Check if Clerk is configured
  if (typeof window !== 'undefined') {
    // Client-side: ClerkProvider will handle this
    return <UsageDisplayContent />;
  }
  
  // Server-side: check env var
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey || publishableKey.trim() === '') {
    return null;
  }
  
  return <UsageDisplayContent />;
}
