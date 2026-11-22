import type { Metadata } from 'next';
import './globals.css';
import './redesign.css';
import './training.css';
import './workspace.css';

export const metadata: Metadata = {
  title: 'Range — Entraînement poker',
  description: 'Tes ranges, tes décisions. Range builder, flashcards, révisions et drills personnalisés.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
