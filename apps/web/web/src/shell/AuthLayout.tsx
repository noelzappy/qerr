// The frame of the pages before sign-in: Vesk's logo above a card, and the brand the workspace belongs to.
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useAppInfo } from '../app-info';
import { VeskLogo } from './VeskLogo';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const { brand } = useAppInfo();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-frame px-4 py-6" id="main">
      <VeskLogo className="text-lg" />
      <Card className="w-full max-w-105 gap-0 py-0">
        <CardContent className="flex flex-col gap-5 p-6 max-sm:p-5">
          <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
            {brand.logo && <img src={brand.logo} alt="" width="24" height="24" className="size-6 rounded" />}
            <span>{brand.name}</span>
          </div>
          <div className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {children}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
