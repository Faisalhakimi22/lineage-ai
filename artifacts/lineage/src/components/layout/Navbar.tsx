import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { LogIn, LogOut, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { strings } from '@/lib/strings';
import { Button } from '@/components/ui/button';

const LINKS = [
  { href: '/how-it-works', label: strings.nav.howItWorks },
  { href: '/why-lineage', label: strings.nav.whyLineage },
  { href: '/claims', label: strings.nav.claims },
  { href: '/about', label: strings.nav.about },
];

export function Navbar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { isAuthenticated, loading, configured, signInWithGoogle, signOut } =
    useAuth();

  const navLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      onClick={() => setOpen(false)}
      className={cn(
        'text-sm font-medium transition-colors hover:text-primary',
        location === href ? 'text-primary' : 'text-muted-foreground',
      )}
      aria-current={location === href ? 'page' : undefined}
    >
      {label}
    </Link>
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <img
            src="/Lineagelogo.png"
            alt="Lineage Logo"
            className="w-8 h-8 rounded object-contain transition-transform group-hover:scale-105"
          />
          <span className="font-serif font-bold text-xl tracking-tight">
            {strings.product.name}
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {LINKS.map((link) => navLink(link.href, link.label))}
        </div>

        <div className="hidden md:flex items-center gap-3 shrink-0">
          {isAuthenticated && navLink('/history', strings.nav.history)}
          <Link href="/trace">
            <Button size="sm" variant={isAuthenticated ? 'default' : 'outline'}>
              {strings.nav.trace}
            </Button>
          </Link>

          {loading ? (
            <span className="font-mono text-xs text-muted-foreground">…</span>
          ) : isAuthenticated ? (
            <Button size="sm" variant="ghost" onClick={() => void signOut()}>
              <LogOut className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {strings.auth.signOut}
            </Button>
          ) : (
            configured && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void signInWithGoogle()}
              >
                <LogIn className="w-4 h-4 mr-1.5" aria-hidden="true" />
                {strings.auth.signIn}
              </Button>
            )
          )}
        </div>

        <button
          type="button"
          className="md:hidden p-2 -mr-2"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <X className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Menu className="w-5 h-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {open && (
        <div
          id="mobile-nav"
          className="md:hidden border-t border-border/40 px-4 py-4 flex flex-col gap-4"
        >
          {LINKS.map((link) => navLink(link.href, link.label))}
          {isAuthenticated && navLink('/history', strings.nav.history)}
          {navLink('/trace', strings.nav.trace)}
          {!loading &&
            (isAuthenticated ? (
              <Button size="sm" variant="outline" onClick={() => void signOut()}>
                {strings.auth.signOut}
              </Button>
            ) : (
              configured && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void signInWithGoogle()}
                >
                  {strings.auth.signIn}
                </Button>
              )
            ))}
        </div>
      )}
    </nav>
  );
}
