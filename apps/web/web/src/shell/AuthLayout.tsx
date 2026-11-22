// The frame of the pages before sign-in: Qerr's logo above a card, and the brand the workspace belongs to.
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useAppInfo } from '../app-info';
import { QerrLogo } from './QerrLogo';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const { brand } = useAppInfo();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-frame px-4 py-6" id="main">
      <QerrLogo className="h-9" />
      <Card className="w-full max-w-96 gap-0 py-0 shadow-none">
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            {brand.logo && <img src={brand.logo} alt="" width="20" height="20" className="size-5 rounded" />}
            <span>{brand.name}</span>
          </div>
          <div className="flex flex-col gap-3">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {children}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
